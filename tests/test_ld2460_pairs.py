"""
The LD2460 beside sensors another build left, and a mode sensor added later.

A device reflashed from LD2450 firmware to LD2460 firmware can keep the old
LD2450 target sensors in the registry. Zones, the card and the support file
must follow the LD2460 alone, as the dashboard's tab does.
"""

from __future__ import annotations

from typing import Any

from homeassistant.const import STATE_UNKNOWN
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.components.diagnostics import (
    get_diagnostics_for_config_entry,
)

from custom_components.apollo_mmwave import binary_sensor, get_store, hold, trackers
from custom_components.apollo_mmwave import mounts as mounts_module
from custom_components.apollo_mmwave.const import (
    DOMAIN,
    SERVICE_UPDATE_ZONE,
    SIGNAL_ZONES_UPDATED,
    STORE_ENTITIES,
    STORE_ZONES,
)
from custom_components.apollo_mmwave.ld2450 import resolve_target_pairs

from .conftest import make_entry, setup_integration
from .test_ld2460 import BASE, _pair, _register, _set, _with_zone, ld2460_radar  # noqa: F401


def _device(hass, device_registry, entity_registry, model: str, *chips: str) -> Any:
    """Register a device with targets 1 and 2 of each chip, in that order."""
    esphome_entry = MockConfigEntry(domain="esphome")
    esphome_entry.add_to_hass(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", model)},
        manufacturer="ApolloAutomation",
        model=model,
    )
    for chip in chips:
        for target in (1, 2):
            for axis in ("x", "y"):
                _register(
                    entity_registry,
                    device.id,
                    "sensor",
                    f"ceiling_radar_{chip}_target_{target}_{axis}",
                )
    return device


def _ids(chip: str) -> list[dict[str, str]]:
    return [
        {
            "x": f"sensor.ceiling_radar_{chip}_target_{n}_x",
            "y": f"sensor.ceiling_radar_{chip}_target_{n}_y",
        }
        for n in (1, 2)
    ]


async def test_stale_ld2450_sensors_give_way_to_the_ld2460(
    hass, device_registry, entity_registry
) -> None:
    """Registered first, the old LD2450's take no target number."""
    device = _device(hass, device_registry, entity_registry, "XR-7", "ld2450", "ld2460")
    assert resolve_target_pairs(hass, device.id) == _ids("ld2460")


async def test_no_pair_mixes_an_ld2450_axis_with_an_ld2460_one(
    hass, device_registry, entity_registry
) -> None:
    """A stale LD2450 Y never completes an LD2460 X."""
    device = _device(hass, device_registry, entity_registry, "XR-7")
    _register(entity_registry, device.id, "sensor", "ceiling_radar_ld2450_target_1_y")
    _register(entity_registry, device.id, "sensor", "ceiling_radar_ld2460_target_1_x")
    _register(entity_registry, device.id, "sensor", "ceiling_radar_ld2460_target_1_y")
    assert resolve_target_pairs(hass, device.id) == _ids("ld2460")[:1]


async def test_an_ld2450_alone_pairs_as_before(
    hass, device_registry, entity_registry
) -> None:
    """With no LD2460 sensor, nothing changes."""
    device = _device(hass, device_registry, entity_registry, "R-PRO-1-W", "ld2450")
    assert resolve_target_pairs(hass, device.id) == _ids("ld2450")


async def test_configured_ld2460_pairs_leave_no_ld2450_section(
    hass,
    hass_client,
    ld2460_radar,  # noqa: F811
) -> None:
    """Drawn zones store the LD2460's pairs; the LD2450 section stays out."""
    entry = make_entry()
    await setup_integration(hass, entry)
    get_store(hass).device(ld2460_radar.id)[STORE_ENTITIES] = [_pair(1), _pair(2)]

    result = await get_diagnostics_for_config_entry(hass, hass_client, entry)
    section = next(
        item for item in result["devices"] if item["device_id"] == ld2460_radar.id
    )

    assert section["ld2450"] is None
    assert section["radars"]["ld2450"] is False
    pairs = section["ld2460"]["target_pairs"]
    assert "tracker" not in pairs
    assert pairs["source"] == "configured"
    assert [pair["x"]["entity_id"] for pair in pairs["tracked"]] == [
        _pair(1)["x"],
        _pair(2)["x"],
    ]


async def test_configured_pairs_on_an_ld2450_keep_its_section(
    hass, hass_client, device_registry, entity_registry
) -> None:
    """An R PRO-1's configured pairs still get the LD2450 section."""
    device = _device(hass, device_registry, entity_registry, "R-PRO-1-W", "ld2450")
    entry = make_entry()
    await setup_integration(hass, entry)
    get_store(hass).device(device.id)[STORE_ENTITIES] = _ids("ld2450")

    result = await get_diagnostics_for_config_entry(hass, hass_client, entry)
    section = next(item for item in result["devices"] if item["device_id"] == device.id)

    assert section["ld2450"]["target_pairs"]["source"] == "configured"
    assert "tracker" not in section["ld2450"]["target_pairs"]
    assert "ld2460" not in section


async def test_a_mode_sensor_added_later_is_read_when_a_zone_empties(
    hass,
    entity_registry,
    monkeypatch,
    ld2460_radar,  # noqa: F811
) -> None:
    """Firmware that adds Installation Mode needs no restart to be heard."""
    views: list[hold.Coverage] = []
    step = hold.HoldTracker.step

    def spy(self, *args: Any, coverage: hold.Coverage = hold.SIDE_COVERAGE) -> bool:
        views.append(coverage)
        return step(self, *args, coverage=coverage)

    monkeypatch.setattr(hold.HoldTracker, "step", spy)
    presence = await _with_zone(hass, ld2460_radar.id, hold_s=30)

    mode = _register(
        entity_registry, ld2460_radar.id, "sensor", f"{BASE}_ld2460_installation_mode"
    )
    hass.states.async_set(mode, "top")
    _set(hass, 1, 500, 1500)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "on"

    _set(hass, 1, STATE_UNKNOWN, STATE_UNKNOWN)
    await hass.async_block_till_done()
    assert views[-1] == trackers.LD2460_TOP_COVERAGE


async def _with_wide_zone(hass, device_id: str, **saved: Any) -> str:
    """Set up a held zone 3.9 m all around the radar; return its sensor."""
    await setup_integration(hass, make_entry())
    store = get_store(hass)
    store.device(device_id)[STORE_ZONES][1] = {
        "shape": "rect",
        "data": {"x_min": -3900, "x_max": 3900, "y_min": -3900, "y_max": 3900},
        "hold_s": 30,
    }
    store.device(device_id).update(saved)
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    return er.async_get(hass).async_get_entity_id(
        "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
    )


async def _leave_from(hass, presence: str, x_mm: float, y_mm: float) -> str:
    """Be seen at a point, then lost; return the zone's state after."""
    _set(hass, 1, x_mm, y_mm)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "on"
    _set(hass, 1, STATE_UNKNOWN, STATE_UNKNOWN)
    await hass.async_block_till_done()
    return hass.states.get(presence).state


async def test_a_saved_ceiling_holds_someone_lost_behind_a_wall_mount(
    hass,
    ld2460_radar,  # noqa: F811
) -> None:
    """Behind the radar is out of a wall's view but inside a ceiling's."""
    presence = await _with_wide_zone(hass, ld2460_radar.id, mount="ceiling")
    assert await _leave_from(hass, presence, 0, -2000) == "on"


async def test_without_a_saved_ceiling_the_wall_view_releases_them(
    hass,
    ld2460_radar,  # noqa: F811
) -> None:
    """No mode sensor and nothing saved: the wall's view, as 2.4.2 read it."""
    presence = await _with_wide_zone(hass, ld2460_radar.id)
    assert await _leave_from(hass, presence, 0, -2000) == "off"


async def test_the_radars_side_report_wins_over_a_saved_ceiling(
    hass,
    entity_registry,
    ld2460_radar,  # noqa: F811
) -> None:
    """A radar that says it is on a wall is read as one."""
    mode = _register(
        entity_registry, ld2460_radar.id, "sensor", f"{BASE}_ld2460_installation_mode"
    )
    hass.states.async_set(mode, "side")
    presence = await _with_wide_zone(hass, ld2460_radar.id, mount="ceiling")
    assert await _leave_from(hass, presence, 0, -2000) == "off"


async def test_a_new_ceiling_height_applies_at_the_next_emptying(
    hass,
    ld2460_radar,  # noqa: F811
) -> None:
    """At 2.7 m 3.3 m out is inside the circle; at 2 m it is its edge."""
    presence = await _with_wide_zone(hass, ld2460_radar.id, mount="ceiling")
    assert await _leave_from(hass, presence, 0, 3300) == "on"

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": ld2460_radar.id, "ceiling_height_mm": 2000},
        blocking=True,
    )
    await hass.async_block_till_done()
    assert await _leave_from(hass, presence, 0, 3300) == "off"


async def test_an_ld2450_reads_its_saved_ceiling_not_the_ld2460_mode(
    hass, device_registry, entity_registry, monkeypatch
) -> None:
    """Its zones measure its own ceiling strip; a top mode changes nothing."""
    mounts: list[trackers.Mount] = []

    def spy(*args: Any) -> trackers.Mount:
        mounts.append(trackers.effective_mount(*args))
        return mounts[-1]

    monkeypatch.setattr(binary_sensor, "effective_mount", spy)
    device = _device(hass, device_registry, entity_registry, "R_PRO-1", "ld2450")
    mode = _register(
        entity_registry, device.id, "sensor", "ceiling_radar_ld2460_installation_mode"
    )
    hass.states.async_set(mode, "top")
    presence = await _with_wide_zone(
        hass, device.id, mount="ceiling", ceiling_height_mm=2000
    )
    pair = _ids("ld2450")[0]
    mm = {"unit_of_measurement": "mm", "device_class": "distance"}
    hass.states.async_set(pair["x"], "300", mm)
    hass.states.async_set(pair["y"], "1500", mm)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "on"

    hass.states.async_set(pair["x"], STATE_UNKNOWN, mm)
    hass.states.async_set(pair["y"], STATE_UNKNOWN, mm)
    await hass.async_block_till_done()
    assert mounts
    geom = mounts_module.mount_geometry(
        "ld2450", None, {"mount": "ceiling", "ceiling_height_mm": 2000}
    )
    assert set(mounts) == {
        trackers.Mount("ceiling", "saved", 2000, mounts_module.coverage_for(geom))
    }
