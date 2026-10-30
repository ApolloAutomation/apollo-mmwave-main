"""The support file behind Download diagnostics."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.const import EVENT_CALL_SERVICE, EVENT_STATE_CHANGED
from homeassistant.const import __version__ as ha_version
from homeassistant.helpers import device_registry as dr
from homeassistant.util.unit_system import US_CUSTOMARY_SYSTEM
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.components.diagnostics import (
    get_diagnostics_for_config_entry,
)

from custom_components.apollo_mmwave import diagnostics, get_store
from custom_components.apollo_mmwave.calibration_store import CalibrationStore
from custom_components.apollo_mmwave.const import (
    CONF_DASHBOARD_DEVICES,
    DATA_PAIR_CACHE,
    DOMAIN,
    JS_BUNDLES,
    STATIC_URL_BASE,
    STORE_ENTITIES,
)
from custom_components.apollo_mmwave.store import ZoneStore

from .conftest import (
    LD2412_SERIAL,
    RADAR_TARGET_COUNT,
    EntityBuilder,
    async_owned_entry,
    make_entry,
    radar_ids,
    record_dashboard_writes,
    setup_integration,
)

REPO_ROOT = Path(__file__).parents[1]
PROFILES_TS = REPO_ROOT / "frontend-src" / "src" / "profiles.ts"
MANIFEST = REPO_ROOT / "custom_components" / DOMAIN / "manifest.json"

REDACTED = "**REDACTED**"
RPRO_SW_VERSION = "26.3.2.1 (ESPHome 2026.9.0)"
# What the radar would leak if the file collected its network sensors.
RADAR_MAC = "aa:bb:cc:de:f4:56"
RADAR_IP = "192.168.1.57"
RADAR_BT_MAC = "AA:BB:CC:DE:F4:57"
RADAR_SSID = "Example Home Wi-Fi"

RECT_CALL = {
    "zone_id": 1,
    "shape": "rect",
    "data": {"x_min": -1000, "x_max": 1000, "y_min": 0, "y_max": 2000},
}
# The service stores only the shape's own keys.
RECT_CALL_STORED = {"shape": "rect", "data": RECT_CALL["data"]}
TARGET_ATTRS = {"unit_of_measurement": "mm", "device_class": "distance"}


@pytest.fixture
def rpro(hass, device_registry, entity_registry, ld2412_device) -> dr.DeviceEntry:
    """
    Make the LD2412 fixture a whole R PRO-1: its LD2450, versions and network.

    The network sensors and the registry's MAC and configuration url are there
    so the tests can show the support file never carries them.
    """
    device = device_registry.async_update_device(
        ld2412_device.id,
        manufacturer="ApolloAutomation",
        model="R-PRO-1-W",
        sw_version=RPRO_SW_VERSION,
        configuration_url=f"http://{RADAR_IP}",
        new_connections={(dr.CONNECTION_NETWORK_MAC, RADAR_MAC)},
    )
    assert device is not None
    builder = EntityBuilder(hass, entity_registry, device.id)
    base = LD2412_SERIAL
    for target in range(1, RADAR_TARGET_COUNT + 1):
        for axis in ("x", "y"):
            builder.add(
                "sensor", f"{base}_ld2450_target_{target}_{axis}", "120", TARGET_ATTRS
            )
    builder.add("select", f"{base}_ld2450_zone_type", "Detection")
    # Disabled by default on the R PRO-1, so it has no state.
    builder.add("switch", f"{base}_ld2450_multi_target_tracking", None, disabled=True)
    builder.add("sensor", f"{base}_apollo_firmware_version", "26.3.2.1")
    builder.add("sensor", f"{base}_ld2412_firmware", "2.0.24")
    builder.add("sensor", f"{base}_ld2450_firmware", None, disabled=True)
    builder.add(
        "update",
        f"{base}_firmware_update",
        "on",
        {"installed_version": "26.3.2.1", "latest_version": "26.10.1.1"},
    )
    builder.add(
        "sensor",
        f"{base}_rssi",
        "-71",
        {"unit_of_measurement": "dBm", "device_class": "signal_strength"},
    )
    builder.add("sensor", f"{base}_ip_address", RADAR_IP)
    builder.add("sensor", f"{base}_ld2450_bt_mac", RADAR_BT_MAC)
    builder.add("sensor", f"{base}_ssid", RADAR_SSID)
    return device


@pytest.fixture
def msr(device_registry, ld2410_device) -> dr.DeviceEntry:
    """Make the LD2410 fixture an MSR-2."""
    device = device_registry.async_update_device(
        ld2410_device.id, manufacturer="ApolloAutomation", model="MSR-2"
    )
    assert device is not None
    return device


async def _support_file(hass, hass_client, entry) -> dict[str, Any]:
    """Download the support file the way the frontend does."""
    return await get_diagnostics_for_config_entry(hass, hass_client, entry)


def _section(result: dict[str, Any], device_id: str) -> dict[str, Any]:
    """Return one device's section of the support file."""
    sections = [item for item in result["devices"] if item["device_id"] == device_id]
    assert len(sections) == 1
    return sections[0]


async def test_support_file_describes_an_r_pro_1(
    hass, hass_client, init_integration, rpro
) -> None:
    """Versions, both radars, the LD2450's settings and pairs, and the zones."""
    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": rpro.id, **RECT_CALL}, blocking=True
    )
    await hass.async_block_till_done()

    result = await _support_file(hass, hass_client, init_integration)

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert result["versions"] == {
        "integration": manifest["version"],
        "home_assistant": ha_version,
    }
    assert result["unit_system"]["length"] == "km"
    assert result["entry"]["state"] == "loaded"
    assert result["entry"]["options"] == {
        "dashboard_id": None,
        "dashboard_url_path": None,
    }
    assert result["entry"]["dashboard_is_ours"] is False
    assert result["zone_store_loaded"] is True
    assert result["calibration_store_loaded"] is True

    section = _section(result, rpro.id)
    assert section["registered"] is True
    assert section["name"] == rpro.name
    assert section["manufacturer"] == "ApolloAutomation"
    assert section["model"] == "R-PRO-1-W"
    assert section["sw_version"] == RPRO_SW_VERSION
    assert section["integrations"] == ["esphome"]
    assert section["radars"] == {
        "expected": ["ld2412", "ld2450"],
        "gate_radar": "ld2412",
        "ld2450": True,
    }

    firmware = section["firmware"]
    assert firmware["apollo"]["state"] == "26.3.2.1"
    assert firmware["ld2412"]["state"] == "2.0.24"
    # Found though disabled, so support can see why it reads nothing.
    assert firmware["ld2450"]["state"] is None
    assert firmware["ld2450"]["disabled_by"] == "user"
    assert firmware["ld2410"] is None
    assert firmware["esphome"] is None
    assert [
        (item["state"], item["installed_version"], item["latest_version"])
        for item in firmware["updates"]
    ] == [("on", "26.3.2.1", "26.10.1.1")]
    assert section["wifi_signal"]["state"] == "-71"
    assert section["wifi_signal"]["unit_of_measurement"] == "dBm"

    ld2450 = section["ld2450"]
    assert ld2450["zone_type"]["state"] == "Detection"
    assert ld2450["multi_target_tracking"]["state"] is None
    assert ld2450["multi_target_tracking"]["disabled_by"] == "user"
    pairs = ld2450["target_pairs"]
    assert pairs["source"] == "detected"
    assert pairs["tracked"] == pairs["detected"]
    assert len(pairs["detected"]) == RADAR_TARGET_COUNT
    assert pairs["detected"][0]["x"] == {
        "entity_id": f"sensor.{LD2412_SERIAL}_ld2450_target_1_x",
        "state": "120",
        "unit_of_measurement": "mm",
        "device_class": "distance",
        "registered": True,
        "disabled_by": None,
    }

    gate_radar = section["gate_radar"]
    assert gate_radar["profile"] == "ld2412"
    assert gate_radar["gate_count"] == radar_ids(rpro).gate_count
    assert gate_radar["thresholds"]["move"]["0"] == "40"
    assert gate_radar["thresholds"]["still"]["13"] == "40"

    assert section["calibration"]["job"] is None
    assert section["calibration"]["last_result"] is None
    assert section["calibration"]["entities"]["profile"] == "ld2412"

    assert section["zone_store"]["zones"] == {"1": RECT_CALL_STORED}
    assert sorted(item["entity_id"] for item in section["zone_entities"]) == sorted(
        [
            "binary_sensor.apollo_r_pro_1_def456_zone_1_presence",
            "sensor.apollo_r_pro_1_def456_zone_1",
        ]
    )


async def test_support_file_never_carries_addresses_or_network_names(
    hass, hass_client, init_integration, rpro
) -> None:
    """No MAC, IP, BT MAC or SSID reaches the file, and stored ones are redacted."""
    # A configured pair is stored verbatim from disk, so an extra key in it
    # rides along into the zone store section. That is what the redaction is
    # for.
    get_store(hass).device(rpro.id)[STORE_ENTITIES] = [
        {
            "x": f"sensor.{LD2412_SERIAL}_ld2450_target_1_x",
            "y": f"sensor.{LD2412_SERIAL}_ld2450_target_1_y",
            "mac": RADAR_MAC,
        }
    ]

    result = await _support_file(hass, hass_client, init_integration)

    dumped = json.dumps(result)
    for secret in (RADAR_MAC, RADAR_IP, RADAR_BT_MAC, RADAR_SSID):
        assert secret.lower() not in dumped.lower()
    section = _section(result, rpro.id)
    assert section["zone_store"][STORE_ENTITIES][0]["mac"] == REDACTED
    assert "connections" not in section
    assert "configuration_url" not in section


def test_redaction_covers_what_support_must_never_see() -> None:
    """The second net names every kind of value the owner ruled out."""
    assert {
        "bssid",
        "bt_mac",
        "configuration_url",
        "connections",
        "ip_address",
        "mac",
        "ssid",
        "token",
        "user_id",
    } <= diagnostics.TO_REDACT


async def test_support_file_reports_the_last_calibration(
    hass, hass_client, init_integration, msr, calibration_rig
) -> None:
    """A finished job's result and snapshot list reach the file."""
    ids = radar_ids(msr)
    response = await calibration_rig.run(ids)
    assert response["outcome"] == "applied"

    result = await _support_file(hass, hass_client, init_integration)

    section = _section(result, msr.id)
    assert section["radars"] == {
        "expected": ["ld2410"],
        "gate_radar": "ld2410",
        "ld2450": False,
    }
    # No LD2450 and no configured pairs: nothing to say about one.
    assert section["ld2450"] is None
    assert section["gate_radar"]["profile"] == "ld2410"
    calibration = section["calibration"]
    assert calibration["job"] is None
    assert calibration["last_result"]["job_id"] == response["job_id"]
    assert calibration["last_result"]["outcome"] == "applied"
    assert len(calibration["snapshots"]) == 1
    # The section reads the thresholds the job wrote.
    written = {
        str(gate): hass.states.get(ids.threshold(gate, "move")).state
        for gate in range(ids.gate_count)
    }
    assert section["gate_radar"]["thresholds"]["move"] == written


async def test_support_file_tells_configured_pairs_from_cleared_ones(
    hass, hass_client, init_integration, rpro, msr
) -> None:
    """A configured pair whose sensor is gone reads unregistered; cleared is empty."""
    store = get_store(hass)
    store.device(rpro.id)[STORE_ENTITIES] = [
        {"x": "sensor.renamed_target_1_x", "y": "sensor.renamed_target_1_y"}
    ]
    store.device(msr.id)[STORE_ENTITIES] = []

    result = await _support_file(hass, hass_client, init_integration)

    rpro_pairs = _section(result, rpro.id)["ld2450"]["target_pairs"]
    assert rpro_pairs["source"] == "configured"
    assert rpro_pairs["tracked"] == [
        {
            "x": {
                "entity_id": "sensor.renamed_target_1_x",
                "state": None,
                "unit_of_measurement": None,
                "device_class": None,
                "registered": False,
                "disabled_by": None,
            },
            "y": {
                "entity_id": "sensor.renamed_target_1_y",
                "state": None,
                "unit_of_measurement": None,
                "device_class": None,
                "registered": False,
                "disabled_by": None,
            },
        }
    ]
    assert len(rpro_pairs["detected"]) == RADAR_TARGET_COUNT
    msr_section = _section(result, msr.id)
    # Listed for the cleared list, though the radar itself has no LD2450.
    assert msr_section["radars"]["ld2450"] is False
    assert msr_section["ld2450"]["target_pairs"] == {
        "source": "cleared",
        "tracked": [],
        "detected": [],
    }


async def test_support_file_reads_the_mtr_1_spellings(
    hass, hass_client, device_registry, entity_registry, init_integration
) -> None:
    """The MTR-1 names its LD2450 settings and targets without the chip prefix."""
    esphome_entry = MockConfigEntry(domain="esphome", title="Apollo MTR-1 0a1b2c")
    esphome_entry.add_to_hass(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", "apollo_mtr_1_0a1b2c")},
        name="Apollo MTR-1 0a1b2c",
        manufacturer="ApolloAutomation",
        model="MTR-1",
    )
    base = "apollo_mtr_1_0a1b2c"
    builder = EntityBuilder(hass, entity_registry, device.id)
    builder.add("sensor", f"{base}_target_1_x", "-250", TARGET_ATTRS)
    builder.add("sensor", f"{base}_target_1_y", "1800", TARGET_ATTRS)
    builder.add("select", f"{base}_zone_type", "Disabled")
    builder.add("switch", f"{base}_multi_target_tracking", "on")
    builder.add("sensor", f"{base}_ld2450_firmware", "2.04.23101915")
    builder.add("sensor", f"{base}_apollo_firmware_version", "26.5.1.1")

    result = await _support_file(hass, hass_client, init_integration)

    section = _section(result, device.id)
    assert section["radars"] == {
        "expected": ["ld2450"],
        "gate_radar": None,
        "ld2450": True,
    }
    assert section["gate_radar"] is None
    assert section["calibration"]["entities"] is None
    assert section["firmware"]["ld2450"]["state"] == "2.04.23101915"
    assert section["firmware"]["apollo"]["state"] == "26.5.1.1"
    # The MTR-1 firmware has no update entity.
    assert section["firmware"]["updates"] == []
    assert section["ld2450"]["zone_type"]["state"] == "Disabled"
    assert section["ld2450"]["multi_target_tracking"]["state"] == "on"
    assert [
        (pair["x"]["state"], pair["y"]["state"])
        for pair in section["ld2450"]["target_pairs"]["tracked"]
    ] == [("-250", "1800")]


async def test_support_file_lists_a_diy_radar_with_zones(
    hass, hass_client, setup_entry_with_zone
) -> None:
    """A radar that is not an Apollo model is listed because it has zones."""
    device_id, entry = setup_entry_with_zone

    result = await _support_file(hass, hass_client, entry)

    section = _section(result, device_id)
    assert section["radars"] == {"expected": None, "gate_radar": None, "ld2450": True}
    assert list(section["zone_store"]["zones"]) == ["1"]


async def test_support_file_lists_selected_devices_that_left_the_registry(
    hass, hass_client, esphome_device
) -> None:
    """A device the dashboard list names is reported even once it is gone."""
    entry = make_entry(**{CONF_DASHBOARD_DEVICES: ["gone-device"]})
    await setup_integration(hass, entry)

    result = await _support_file(hass, hass_client, entry)

    section = _section(result, "gone-device")
    assert section["registered"] is False
    assert section["selected_for_dashboard"] is True
    assert section["radars"]["expected"] is None
    assert section["zone_store"] is None
    assert "name" not in section


async def test_support_file_reports_the_dashboard_and_resources(
    hass, hass_client, esphome_device
) -> None:
    """Ownership, the resource rows and the unit system support asks about."""
    hass.config.units = US_CUSTOMARY_SYSTEM
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)

    result = await _support_file(hass, hass_client, entry)

    assert result["entry"]["dashboard_is_ours"] is True
    assert result["entry"]["options"]["dashboard_id"] is not None
    assert result["unit_system"]["length"] == "mi"
    lovelace = result["lovelace"]
    assert lovelace["resource_mode"] == "storage"
    assert [row["url"].partition("?")[0] for row in lovelace["resource_rows"]] == [
        f"{STATIC_URL_BASE}/{name}" for name in JS_BUNDLES
    ]
    assert {row["type"] for row in lovelace["resource_rows"]} == {"module"}
    assert lovelace["served_urls"] == [row["url"] for row in lovelace["resource_rows"]]


async def test_support_file_never_loads_the_resource_collection(
    hass, hass_client, init_integration
) -> None:
    """An unloaded collection is reported as unread, because loading can write."""
    resources = hass.data[LOVELACE_DATA].resources
    with (
        patch.object(resources, "loaded", new=False),
        patch.object(
            type(resources), "async_load", side_effect=AssertionError("loaded")
        ) as load,
    ):
        result = await _support_file(hass, hass_client, init_integration)

    load.assert_not_called()
    assert result["lovelace"]["resource_rows"] is None


async def test_support_file_writes_nothing(
    hass, hass_client, init_integration, rpro, msr
) -> None:
    """No store save, service call, state change, cache fill or dashboard write."""
    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": rpro.id, **RECT_CALL}, blocking=True
    )
    await hass.async_block_till_done()
    cache = hass.data[DOMAIN][DATA_PAIR_CACHE]
    cache.clear()
    resources = hass.data[LOVELACE_DATA].resources
    rows_before = [dict(item) for item in resources.async_items()]
    events: list[str] = []
    for event_type in (EVENT_CALL_SERVICE, EVENT_STATE_CHANGED):
        hass.bus.async_listen(event_type, lambda event: events.append(event.event_type))

    with (
        record_dashboard_writes(hass) as dashboard_writes,
        patch.object(ZoneStore, "async_save") as zone_save,
        patch.object(ZoneStore, "async_delay_save") as zone_delay_save,
        patch.object(CalibrationStore, "async_save") as calibration_save,
        patch.object(CalibrationStore, "async_delay_save") as calibration_delay_save,
    ):
        result = await _support_file(hass, hass_client, init_integration)
        await hass.async_block_till_done()

    assert {item["device_id"] for item in result["devices"]} >= {rpro.id, msr.id}
    assert dashboard_writes == []
    zone_save.assert_not_called()
    zone_delay_save.assert_not_called()
    calibration_save.assert_not_called()
    calibration_delay_save.assert_not_called()
    assert events == []
    assert cache == {}
    assert [dict(item) for item in resources.async_items()] == rows_before
    # Asking about a radar never mints a store entry for it.
    assert msr.id not in get_store(hass).devices


async def test_support_file_works_while_the_entry_is_not_loaded(
    hass, hass_client, init_integration, rpro
) -> None:
    """An unloaded entry still gives a file, with the stores marked unread."""
    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()

    result = await _support_file(hass, hass_client, init_integration)

    assert result["entry"]["state"] == "not_loaded"
    assert result["zone_store_loaded"] is False
    assert result["calibration_store_loaded"] is False
    section = _section(result, rpro.id)
    assert section["zone_store"] is None
    assert section["calibration"]["last_result"] is None
    assert section["firmware"]["apollo"]["state"] == "26.3.2.1"


def test_model_radars_match_the_frontend() -> None:
    """The file's model table is the dashboard's `APOLLO_MODELS`."""
    source = PROFILES_TS.read_text(encoding="utf-8")
    block = re.search(r"const APOLLO_MODELS\b.*?\];", source, re.DOTALL)
    assert block is not None, "APOLLO_MODELS not found in profiles.ts"
    rows = re.findall(r"\{([^}]*)\}", block.group(0))
    frontend: dict[str, list[str]] = {}
    for row in rows:
        prefix = re.search(r'prefix:\s*"([^"]+)"', row)
        if prefix is None:
            continue
        profile = re.search(r"profile:\s*(LD24\d\d)_PROFILE", row)
        ld2450 = re.search(r"ld2450:\s*(true|false)", row)
        assert ld2450 is not None, row
        radars = [profile.group(1).lower()] if profile else []
        if ld2450.group(1) == "true":
            radars.append("ld2450")
        frontend[prefix.group(1)] = radars
    assert frontend

    assert {prefix: list(radars) for prefix, radars in diagnostics.MODEL_RADARS} == (
        frontend
    )
    assert diagnostics.APOLLO_MANUFACTURER in source.lower()
