"""Config and options flow tests."""

from __future__ import annotations

import re
from pathlib import Path
from unittest.mock import patch

import pytest
from homeassistant import config_entries
from homeassistant.components.frontend import DATA_PANELS
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.components.lovelace.dashboard import LovelaceStorage
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import selector

from custom_components.apollo_mmwave import frontend as apollo_frontend
from custom_components.apollo_mmwave.config_flow import MMWAVE_MODELS
from custom_components.apollo_mmwave.const import (
    CONF_CREATE_DASHBOARD,
    CONF_DASHBOARD_ADMIN_ONLY,
    CONF_DASHBOARD_DEVICES,
    CONF_DASHBOARD_ID,
    CONF_DASHBOARD_URL_PATH,
    DASHBOARD_ICON,
    DASHBOARD_STRATEGY_TYPE,
    DASHBOARD_TITLE,
    DASHBOARD_URL_PATH,
    DOMAIN,
    ENTRY_MINOR_VERSION,
)
from custom_components.apollo_mmwave.frontend import _dashboards_collection

from .conftest import (
    USER_DASHBOARD_CONFIG,
    USER_DASHBOARD_PATH,
    apollo_warnings,
    async_dashboard_config,
    async_owned_entry,
    async_user_dashboard,
    record_dashboard_writes,
    rows_on_url_path,
    setup_integration,
)

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


OUR_CONFIG = {"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}


async def _start_user_flow(hass) -> dict:
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"
    return result


async def test_user_form_offers_the_dashboard_admin_only(hass) -> None:
    """Both boxes start ticked: one click adds an admin-only dashboard."""
    result = await _start_user_flow(hass)
    defaults = {str(key): key.default() for key in result["data_schema"].schema}
    assert defaults == {CONF_CREATE_DASHBOARD: True, CONF_DASHBOARD_ADMIN_ONLY: True}


@pytest.mark.parametrize("admin_only", [True, False])
async def test_user_flow_creates_the_dashboard_once_and_records_it(
    hass, admin_only
) -> None:
    """Submitting creates the dashboard right there, and the entry records it."""
    result = await _start_user_flow(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_CREATE_DASHBOARD: True, CONF_DASHBOARD_ADMIN_ONLY: admin_only},
    )
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Apollo mmWave"
    [row] = rows_on_url_path(hass)
    assert result["options"] == {
        CONF_DASHBOARD_ID: row["id"],
        CONF_DASHBOARD_URL_PATH: DASHBOARD_URL_PATH,
    }
    assert row["title"] == DASHBOARD_TITLE
    assert row["icon"] == DASHBOARD_ICON
    assert row["show_in_sidebar"] is True
    assert row["require_admin"] is admin_only
    assert hass.data[DATA_PANELS][DASHBOARD_URL_PATH].require_admin is admin_only
    assert await async_dashboard_config(hass) == OUR_CONFIG
    entry = hass.config_entries.async_get_entry(result["result"].entry_id)
    assert entry.minor_version == ENTRY_MINOR_VERSION

    # Created once: a reload neither recreates nor rewrites it.
    with record_dashboard_writes(hass) as writes:
        assert await hass.config_entries.async_reload(entry.entry_id)
        await hass.async_block_till_done()
    assert writes == []
    assert len(rows_on_url_path(hass)) == 1


async def test_user_flow_without_the_dashboard_creates_nothing(hass) -> None:
    """With the box unticked the entry owns no dashboard and none is made."""
    result = await _start_user_flow(hass)
    with record_dashboard_writes(hass) as writes:
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_CREATE_DASHBOARD: False, CONF_DASHBOARD_ADMIN_ONLY: True},
        )
        await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["options"] == {
        CONF_DASHBOARD_ID: None,
        CONF_DASHBOARD_URL_PATH: None,
    }
    assert writes == []
    assert rows_on_url_path(hass) == []
    assert DASHBOARD_URL_PATH not in hass.data[DATA_PANELS]


async def test_user_flow_sets_up_without_the_dashboards_collection(
    hass, caplog
) -> None:
    """An unreachable collection never blocks setup; the log names the picker."""
    result = await _start_user_flow(hass)
    with patch.object(apollo_frontend, "_dashboards_collection", return_value=None):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"], {CONF_CREATE_DASHBOARD: True}
        )
        await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["options"][CONF_DASHBOARD_ID] is None
    entry = hass.config_entries.async_get_entry(result["result"].entry_id)
    assert entry.state is config_entries.ConfigEntryState.LOADED
    [warning] = apollo_warnings(caplog)
    assert "could not reach Lovelace's dashboards collection" in warning
    assert "Settings > Dashboards > Add dashboard > Apollo Radar Tuning" in warning
    assert DASHBOARD_URL_PATH not in hass.data[DATA_PANELS]


async def test_user_flow_leaves_a_dashboard_already_on_the_path(hass, caplog) -> None:
    """A dashboard someone made on /apollo-mmwave is not taken over or changed."""
    theirs = await async_user_dashboard(hass, DASHBOARD_URL_PATH, OUR_CONFIG)

    result = await _start_user_flow(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_CREATE_DASHBOARD: True}
    )
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["options"][CONF_DASHBOARD_ID] is None
    assert rows_on_url_path(hass) == [theirs]
    assert await async_dashboard_config(hass) == OUR_CONFIG
    [warning] = apollo_warnings(caplog)
    assert f"another dashboard already uses /{DASHBOARD_URL_PATH}" in warning


async def test_single_instance(hass, config_entry) -> None:
    """A second flow aborts once an entry exists."""
    await setup_integration(hass, config_entry)

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def _submit_devices(hass, entry, devices: list[str]) -> dict:
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_DASHBOARD_DEVICES: devices}
    )
    await hass.async_block_till_done()
    return result


async def test_options_form_prefills_current_options(hass, config_entry) -> None:
    """Reopening the options flow defaults to the entry's stored selection."""
    await setup_integration(hass, config_entry)
    hass.config_entries.async_update_entry(
        config_entry,
        options={**config_entry.options, CONF_DASHBOARD_DEVICES: ["devid1"]},
    )
    await hass.async_block_till_done()

    result = await hass.config_entries.options.async_init(config_entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    defaults = {str(key): key.default() for key in result["data_schema"].schema}
    assert defaults == {CONF_DASHBOARD_DEVICES: ["devid1"]}


async def test_device_selection_reaches_our_dashboard_only(hass) -> None:
    """The selection lands in our dashboard and never in one the user made."""
    entry = await async_owned_entry(hass)
    await async_user_dashboard(hass)
    await setup_integration(hass, entry)

    result = await _submit_devices(hass, entry, ["devid1", "devid2"])
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options[CONF_DASHBOARD_DEVICES] == ["devid1", "devid2"]
    config = await async_dashboard_config(hass)
    assert config["strategy"] == {
        "type": DASHBOARD_STRATEGY_TYPE,
        "devices": ["devid1", "devid2"],
    }
    assert (
        await async_dashboard_config(hass, USER_DASHBOARD_PATH) == USER_DASHBOARD_CONFIG
    )

    # Clearing the selection removes the key (auto-detection again).
    await _submit_devices(hass, entry, [])
    assert await async_dashboard_config(hass) == OUR_CONFIG
    assert (
        await async_dashboard_config(hass, USER_DASHBOARD_PATH) == USER_DASHBOARD_CONFIG
    )
    assert entry.options[CONF_DASHBOARD_ID] == "apollo_mmwave"


async def test_device_selection_without_a_dashboard_is_only_stored(
    hass, config_entry
) -> None:
    """Owning none, the selection is stored and no dashboard is written."""
    await async_user_dashboard(hass, DASHBOARD_URL_PATH, OUR_CONFIG)
    await setup_integration(hass, config_entry)

    with record_dashboard_writes(hass) as writes:
        result = await _submit_devices(hass, config_entry, ["devid1"])

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert writes == []
    assert config_entry.options[CONF_DASHBOARD_DEVICES] == ["devid1"]
    assert await async_dashboard_config(hass) == OUR_CONFIG


async def test_a_dashboard_the_user_deleted_is_forgotten_not_recreated(
    hass,
) -> None:
    """Once ours is gone the entry stops tracking it, and nothing remakes it."""
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)
    await _dashboards_collection(hass).async_delete_item(
        entry.options[CONF_DASHBOARD_ID]
    )
    await hass.async_block_till_done()

    with record_dashboard_writes(hass) as writes:
        result = await _submit_devices(hass, entry, ["devid1"])

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert writes == []
    assert rows_on_url_path(hass) == []
    assert entry.options == {
        CONF_DASHBOARD_ID: None,
        CONF_DASHBOARD_URL_PATH: None,
        CONF_DASHBOARD_DEVICES: ["devid1"],
    }


async def test_a_dashboard_the_user_took_control_of_is_left_alone(hass) -> None:
    """After "take control" the config is the user's: no write, no ownership."""
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)
    mine = {"views": [{"title": "Mine", "cards": []}]}
    await hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH].async_save(mine)

    result = await _submit_devices(hass, entry, ["devid1"])

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert await async_dashboard_config(hass) == mine
    assert entry.options[CONF_DASHBOARD_ID] is None


async def test_a_failed_device_write_keeps_the_form_open(hass) -> None:
    """A write that fails says so on the form and changes no option."""
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)
    before = dict(entry.options)

    with patch.object(
        LovelaceStorage,
        "async_save",
        side_effect=HomeAssistantError("storage is read-only"),
    ):
        result = await _submit_devices(hass, entry, ["devid1"])

    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "dashboard_not_updated"}
    assert dict(entry.options) == before
    assert await async_dashboard_config(hass) == OUR_CONFIG


async def test_options_form_filters_the_device_picker_to_apollo_mmwave_models(
    hass, config_entry
) -> None:
    """The radar picker offers only Apollo mmWave models that ESPHome provides."""
    await setup_integration(hass, config_entry)

    result = await hass.config_entries.options.async_init(config_entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    fields = {str(key): value for key, value in result["data_schema"].schema.items()}
    assert set(fields) == {CONF_DASHBOARD_DEVICES}

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
