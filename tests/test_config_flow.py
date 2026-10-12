"""Config and options flow tests."""

from __future__ import annotations

import re
from pathlib import Path

from homeassistant import config_entries
from homeassistant.components.frontend import DATA_PANELS
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import selector

from custom_components.apollo_mmwave.config_flow import MMWAVE_MODELS
from custom_components.apollo_mmwave.const import (
    CONF_AUTO_CREATE_VIEW,
    CONF_DASHBOARD_DEVICES,
    DASHBOARD_URL_PATH,
    DOMAIN,
)
from custom_components.apollo_mmwave.frontend import _dashboards_collection

from .conftest import setup_integration

PROFILES_TS = Path(__file__).parents[1] / "frontend-src" / "src" / "profiles.ts"

# Written out rather than imported from config_flow, so a typo or a dropped
# variant in MMWAVE_MODELS fails here instead of being compared with itself.
EXPECTED_PICKER_MODELS = (
    "MSR-1",
    "MSR-1_BLE",
    "MSR-1_Factory",
    "MSR-2",
    "MSR-2_BLE",
    "MSR-2_Factory",
    "MTR-1",
    "R-PRO-1-W",
    "R-PRO-1-ETH",
)


async def test_user_flow_creates_entry_with_dashboard_choice(hass) -> None:
    """The initial step asks about the dashboard and stores it in options."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_AUTO_CREATE_VIEW: False}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Apollo mmWave"
    assert result["options"] == {CONF_AUTO_CREATE_VIEW: False}


async def test_single_instance(hass, config_entry) -> None:
    """A second flow aborts once an entry exists."""
    await setup_integration(hass, config_entry)

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_options_flow_toggles_dashboard(hass, config_entry) -> None:
    """The options flow round-trips the dashboard toggle."""
    await setup_integration(hass, config_entry)

    result = await hass.config_entries.options.async_init(config_entry.entry_id)
    assert result["type"] is FlowResultType.FORM

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_AUTO_CREATE_VIEW: True}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert config_entry.options == {
        CONF_AUTO_CREATE_VIEW: True,
        CONF_DASHBOARD_DEVICES: [],
    }


async def test_options_form_prefills_current_options(hass, config_entry) -> None:
    """Reopening the options flow defaults to the entry's stored options."""
    await setup_integration(hass, config_entry)
    hass.config_entries.async_update_entry(
        config_entry,
        options={CONF_AUTO_CREATE_VIEW: False, CONF_DASHBOARD_DEVICES: ["devid1"]},
    )
    await hass.async_block_till_done()

    result = await hass.config_entries.options.async_init(config_entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    defaults = {str(key): key.default() for key in result["data_schema"].schema}
    assert defaults == {
        CONF_AUTO_CREATE_VIEW: False,
        CONF_DASHBOARD_DEVICES: ["devid1"],
    }


async def test_options_flow_turning_the_dashboard_off_removes_it(
    hass, config_entry
) -> None:
    """Saving the form with the toggle off takes the dashboard row and panel away."""
    await setup_integration(hass, config_entry)

    async def submit(*, auto_create_view: bool) -> None:
        result = await hass.config_entries.options.async_init(config_entry.entry_id)
        result = await hass.config_entries.options.async_configure(
            result["flow_id"], {CONF_AUTO_CREATE_VIEW: auto_create_view}
        )
        assert result["type"] is FlowResultType.CREATE_ENTRY
        await hass.async_block_till_done()

    def our_rows() -> list[dict]:
        return [
            item
            for item in _dashboards_collection(hass).async_items()
            if item["url_path"] == DASHBOARD_URL_PATH
        ]

    await submit(auto_create_view=True)
    assert len(our_rows()) == 1
    assert DASHBOARD_URL_PATH in hass.data[LOVELACE_DATA].dashboards
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]

    await submit(auto_create_view=False)
    assert config_entry.options[CONF_AUTO_CREATE_VIEW] is False
    assert our_rows() == []
    assert DASHBOARD_URL_PATH not in hass.data[LOVELACE_DATA].dashboards
    assert DASHBOARD_URL_PATH not in hass.data[DATA_PANELS]


async def test_options_form_filters_the_device_picker_to_apollo_mmwave_models(
    hass, config_entry
) -> None:
    """The radar picker offers only Apollo mmWave models that ESPHome provides."""
    await setup_integration(hass, config_entry)

    result = await hass.config_entries.options.async_init(config_entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    fields = {str(key): value for key, value in result["data_schema"].schema.items()}
    assert set(fields) == {CONF_AUTO_CREATE_VIEW, CONF_DASHBOARD_DEVICES}

    picker = fields[CONF_DASHBOARD_DEVICES]
    assert isinstance(picker, selector.DeviceSelector)
    assert picker.config["multiple"] is True
    filters = sorted(picker.config["filter"], key=lambda item: item["model"])
    assert filters == [
        {"integration": "esphome", "manufacturer": "ApolloAutomation", "model": model}
        for model in sorted(EXPECTED_PICKER_MODELS)
    ]


def test_mmwave_models_match_frontend_prefixes() -> None:
    """
    The options selector's model list and the dashboard's prefixes agree.

    The frontend detects Apollo radars by lower-cased model prefix
    (`APOLLO_MODELS` in profiles.ts) while the options DeviceSelector needs
    exact model strings, so each side must cover the other.
    """
    source = PROFILES_TS.read_text(encoding="utf-8")
    block = re.search(r"const APOLLO_MODELS\b.*?\];", source, re.DOTALL)
    assert block is not None, "APOLLO_MODELS not found in profiles.ts"
    prefixes = re.findall(r'prefix:\s*"([^"]+)"', block.group(0))
    assert prefixes, "no prefixes parsed from APOLLO_MODELS"

    for model in MMWAVE_MODELS:
        assert any(model.lower().startswith(p) for p in prefixes), (
            f"{model} is not detected by any profiles.ts prefix"
        )
    for prefix in prefixes:
        assert any(m.lower().startswith(prefix) for m in MMWAVE_MODELS), (
            f"profiles.ts prefix {prefix!r} has no MMWAVE_MODELS entry"
        )


async def test_device_selection_reaches_dashboard_config(hass, config_entry) -> None:
    """A device selection lands in the registered dashboard's strategy config."""
    await setup_integration(hass, config_entry)

    result = await hass.config_entries.options.async_init(config_entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {CONF_AUTO_CREATE_VIEW: True, CONF_DASHBOARD_DEVICES: ["devid1", "devid2"]},
    )
    await hass.async_block_till_done()

    dashboard = hass.data[LOVELACE_DATA].dashboards.get("apollo-mmwave")
    assert dashboard is not None
    config = await dashboard.async_load(force=False)
    assert config["strategy"]["type"] == "custom:apollo-radar-tuning"
    assert config["strategy"]["devices"] == ["devid1", "devid2"]

    # Clearing the selection removes the key (auto-detection again).
    result = await hass.config_entries.options.async_init(config_entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {CONF_AUTO_CREATE_VIEW: True, CONF_DASHBOARD_DEVICES: []},
    )
    await hass.async_block_till_done()
    dashboard = hass.data[LOVELACE_DATA].dashboards.get("apollo-mmwave")
    config = await dashboard.async_load(force=False)
    assert "devices" not in config["strategy"]
