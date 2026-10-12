"""Config and options flow tests."""

from __future__ import annotations

import re
from pathlib import Path

from homeassistant import config_entries
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.data_entry_flow import FlowResultType

from custom_components.apollo_mmwave.config_flow import MMWAVE_MODELS
from custom_components.apollo_mmwave.const import (
    CONF_AUTO_CREATE_VIEW,
    CONF_DASHBOARD_DEVICES,
    DOMAIN,
)

from .conftest import setup_integration

PROFILES_TS = Path(__file__).parents[1] / "frontend-src" / "src" / "profiles.ts"


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
