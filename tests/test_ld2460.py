"""
An LD2460 tracking radar: pairing, presence and the support file.

The device has an LD2412 and an LD2460, registered as Home Assistant registers
ESPHome's sensors on a US customary install: X, Y and distance in ft, angle
in degrees, the target count as a float. Target 1 kept the id it
was first registered with, under the device's older name.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from homeassistant.const import ATTR_UNIT_OF_MEASUREMENT, STATE_UNKNOWN
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.components.diagnostics import (
    get_diagnostics_for_config_entry,
)

from custom_components.apollo_mmwave import get_store, trackers
from custom_components.apollo_mmwave.const import (
    DOMAIN,
    SIGNAL_ZONES_UPDATED,
    STORE_ZONES,
)
from custom_components.apollo_mmwave.ld2450 import resolve_target_pairs
from custom_components.apollo_mmwave.targets import LD2450_TIMING, LD2460_TIMING

from .conftest import make_entry, setup_integration

BASE = "ceiling_radar"
OLD_BASE = "ceiling_radar_old"
FT = {ATTR_UNIT_OF_MEASUREMENT: "ft", "device_class": "distance"}
FT_PER_MM = 1 / 304.8
# Zone 1 of the live device, in mm.
ZONE = {
    "shape": "rect",
    "data": {"x_min": -559, "x_max": 1626, "y_min": 102, "y_max": 3500},
}


def _x(target: int) -> str:
    base = OLD_BASE if target == 1 else BASE
    return f"sensor.{base}_ld2460_target_{target}_x"


def _y(target: int) -> str:
    base = OLD_BASE if target == 1 else BASE
    return f"sensor.{base}_ld2460_target_{target}_y"


def _pair(target: int) -> dict[str, str]:
    return {"x": _x(target), "y": _y(target)}


def _register(entity_registry, device_id: str, domain: str, object_id: str) -> str:
    return entity_registry.async_get_or_create(
        domain,
        "esphome",
        f"uid_{object_id}",
        device_id=device_id,
        suggested_object_id=object_id,
    ).entity_id


@pytest.fixture
def ld2460_radar(hass, device_registry, entity_registry):
    """Register an LD2460 radar with its LD2460 and LD2412 sensors."""
    esphome_entry = MockConfigEntry(domain="esphome", title="Ceiling Radar")
    esphome_entry.add_to_hass(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", BASE)},
        name="Ceiling Radar",
        manufacturer="ApolloAutomation",
        model="XR-7",
    )
    for target in range(1, 6):
        base = OLD_BASE if target == 1 else BASE
        for field in ("x", "y", "distance", "angle"):
            _register(
                entity_registry,
                device.id,
                "sensor",
                f"{base}_ld2460_target_{target}_{field}",
            )
    _register(
        entity_registry, device.id, "sensor", f"{BASE}_ld2460_presence_target_count"
    )
    _register(entity_registry, device.id, "binary_sensor", f"{BASE}_ld2460_presence")
    _register(entity_registry, device.id, "binary_sensor", f"{BASE}_ld2412_presence")
    _register(entity_registry, device.id, "sensor", f"{BASE}_ld2412_still_distance")
    return device


async def _with_zone(hass, device_id: str, hold_s: int | None = None) -> str:
    """Set the integration up with ZONE drawn; return its presence sensor."""
    await setup_integration(hass, make_entry())
    zone = dict(ZONE)
    if hold_s is not None:
        zone["hold_s"] = hold_s
    get_store(hass).device(device_id)[STORE_ZONES][1] = zone
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    return er.async_get(hass).async_get_entity_id(
        "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
    )


def _set(hass, target: int, x_mm: float | str, y_mm: float | str) -> None:
    for entity_id, value in ((_x(target), x_mm), (_y(target), y_mm)):
        state = value if isinstance(value, str) else f"{value * FT_PER_MM:.3f}"
        hass.states.async_set(entity_id, state, FT)


# ---------------------------------------------------------------------------
# Which radar a pair list belongs to
# ---------------------------------------------------------------------------


def test_pair_tracker_needs_the_ld2460_token_on_both_axes() -> None:
    """An LD2460 X with an LD2450 Y is no LD2460 pair."""
    assert trackers.pair_tracker(_pair(2)) == trackers.LD2460
    assert trackers.pair_tracker(
        {"x": _x(2), "y": "sensor.r_pro_ld2450_target_1_y"}
    ) == (trackers.LD2450)
    assert trackers.pair_tracker(
        {"x": "sensor.a_target_1_x", "y": "sensor.a_target_1_y"}
    ) == (trackers.LD2450)
    assert trackers.pair_tracker("garbage") == trackers.LD2450


@pytest.mark.parametrize(
    ("pairs", "expected"),
    [
        ([_pair(1), _pair(2)], trackers.LD2460),
        (
            [
                _pair(1),
                {"x": "sensor.r_ld2450_target_1_x", "y": "sensor.r_ld2450_target_1_y"},
            ],
            "ld2450",
        ),
        ([], trackers.LD2450),
        (None, trackers.LD2450),
    ],
    ids=["ld2460", "mixed", "empty", "not-a-list"],
)
def test_pairs_tracker_is_ld2460_only_when_every_pair_is(pairs, expected) -> None:
    """A mixed or hand-picked list keeps the LD2450's rules."""
    assert trackers.pairs_tracker(pairs) == expected
    assert trackers.timing_for(pairs) == (
        LD2460_TIMING if expected == trackers.LD2460 else LD2450_TIMING
    )


async def test_installation_mode_entity_skips_this_integrations_own(
    hass, entity_registry, ld2460_radar
) -> None:
    """A `_2` tail is found; a zone entity of this integration never is."""
    assert trackers.installation_mode_entity(hass, ld2460_radar.id) is None
    entity_registry.async_get_or_create(
        "sensor",
        DOMAIN,
        "own",
        device_id=ld2460_radar.id,
        suggested_object_id=f"{BASE}_ld2460_installation_mode",
    )
    assert trackers.installation_mode_entity(hass, ld2460_radar.id) is None
    mode = entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "mode",
        device_id=ld2460_radar.id,
        suggested_object_id=f"{BASE}_ld2460_installation_mode",
    ).entity_id
    assert mode.endswith("_installation_mode_2")
    assert trackers.installation_mode_entity(hass, ld2460_radar.id) == mode


MOUNT_CASES = json.loads(
    (
        Path(__file__).parent.parent
        / "frontend-src"
        / "test"
        / "fixtures"
        / "mount-cases.json"
    ).read_text()
)


@pytest.mark.parametrize("case", MOUNT_CASES["mount"])
def test_mount_rule_matches_the_shared_cases(case) -> None:
    """The card's mountRule reads the same cases."""
    expect = case["expect"]
    assert trackers.mount_rule(case["tracker"], case["mode_state"], case["saved"]) == (
        expect["mount"],
        expect["source"],
    )


@pytest.mark.parametrize("case", MOUNT_CASES["radius"])
def test_ceiling_radius_matches_the_shared_cases(case) -> None:
    """Height times tan(60 degrees), height clamped to 2 to 4 m, at most 4 m."""
    assert trackers.ceiling_radius_mm(case["height_mm"]) == pytest.approx(
        case["radius_mm"], abs=0.05
    )


def test_ceiling_radius_never_passes_4_m_or_shrinks_as_height_rises() -> None:
    """The cap is the manual's top mount limit."""
    radii = [trackers.ceiling_radius_mm(height) for height in range(1500, 5001, 10)]
    assert max(radii) == trackers.LD2460_TOP_RANGE_MM == 4000
    assert radii == sorted(radii)
    assert trackers.ceiling_radius_mm(2300) < 4000
    assert trackers.ceiling_radius_mm(2310) == 4000


@pytest.mark.parametrize(
    "case",
    [
        ("side", None, ("wall", "radar")),
        ("top", None, ("ceiling", "radar")),
        ("side", "ceiling", ("wall", "radar")),
        (STATE_UNKNOWN, None, ("wall", "default")),
        (STATE_UNKNOWN, "ceiling", ("ceiling", "saved")),
        ("unavailable", None, ("wall", "default")),
        (None, None, ("wall", "default")),
        (None, "ceiling", ("ceiling", "saved")),
    ],
)
async def test_effective_mount_reads_the_radar_then_the_store(
    hass, entity_registry, ld2460_radar, case
) -> None:
    """The radar wins only when it says side or top."""
    state, saved, expected = case
    if state is not None:
        mode = _register(
            entity_registry,
            ld2460_radar.id,
            "sensor",
            f"{BASE}_ld2460_installation_mode",
        )
        hass.states.async_set(mode, state)
    entry = {"zones": {}, **({"mount": saved} if saved else {})}
    mount = trackers.effective_mount(hass, ld2460_radar.id, [_pair(1)], entry)
    assert (mount.mount, mount.source) == expected
    assert mount.height_mm == 2700
    assert mount.coverage == (
        trackers.LD2460_TOP_COVERAGE
        if expected[0] == "ceiling"
        else trackers.SIDE_COVERAGE
    )


async def test_effective_mount_sizes_the_circle_from_the_saved_height(
    hass, ld2460_radar
) -> None:
    """2 m up the radar sees about 3.46 m out; no entry reads as a wall."""
    entry = {"zones": {}, "mount": "ceiling", "ceiling_height_mm": 2000}
    mount = trackers.effective_mount(hass, ld2460_radar.id, [_pair(1)], entry)
    assert mount.height_mm == 2000
    assert mount.coverage.half_fov_deg == 180
    assert mount.coverage.range_mm == pytest.approx(3464.1, abs=0.05)
    assert trackers.effective_mount(hass, ld2460_radar.id, [_pair(1)], None) == (
        trackers.Mount("wall", "default", 2700, trackers.SIDE_COVERAGE)
    )


async def test_ld2450_pairs_never_read_the_ld2460_mode(
    hass, entity_registry, ld2460_radar
) -> None:
    """A top mode beside LD2450 pairs changes nothing; their store decides."""
    mode = _register(
        entity_registry, ld2460_radar.id, "sensor", f"{BASE}_ld2460_installation_mode"
    )
    hass.states.async_set(mode, "top")
    pair = {"x": "sensor.r_ld2450_target_1_x", "y": "sensor.r_ld2450_target_1_y"}
    assert trackers.effective_mount(hass, ld2460_radar.id, [pair], {}) == (
        trackers.Mount("wall", "default", 2700, trackers.SIDE_COVERAGE)
    )
    entry = {"zones": {}, "mount": "high"}
    mount = trackers.effective_mount(hass, ld2460_radar.id, [pair], entry)
    assert (mount.mount, mount.source) == ("high", "saved")
    assert isinstance(mount.coverage, trackers.Footprint)


# ---------------------------------------------------------------------------
# Pairing and presence
# ---------------------------------------------------------------------------


async def test_targets_1_to_5_pair_and_nothing_else_does(hass, ld2460_radar) -> None:
    """Distance, angle and the target count are no axis."""
    assert resolve_target_pairs(hass, ld2460_radar.id) == [
        _pair(n) for n in range(1, 6)
    ]


async def test_a_reading_in_ft_counts_in_mm(hass, ld2460_radar) -> None:
    """9.84 ft straight ahead is 3000 mm, inside a zone out to 3.5 m."""
    presence = await _with_zone(hass, ld2460_radar.id)
    hass.states.async_set(_x(1), "0.0", FT)
    hass.states.async_set(_y(1), "9.84", FT)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "on"

    hass.states.async_set(_y(1), "13.12", FT)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "off"


async def test_a_lost_target_turns_the_zone_off_at_once(hass, ld2460_radar) -> None:
    """The LD2460 reports a lost target as unknown, which is no reading."""
    presence = await _with_zone(hass, ld2460_radar.id)
    _set(hass, 2, 500, 1500)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "on"

    _set(hass, 2, STATE_UNKNOWN, STATE_UNKNOWN)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "off"


async def test_an_x_written_alone_moves_presence_at_once(hass, ld2460_radar) -> None:
    """No pair wait: a repeated Y is not written, and the X is a whole reading."""
    presence = await _with_zone(hass, ld2460_radar.id)
    _set(hass, 1, 500, 1500)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "on"

    # Out past the zone's right edge along X alone.
    hass.states.async_set(_x(1), f"{2500 * FT_PER_MM:.3f}", FT)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "off"


async def test_a_target_on_the_y_axis_is_inside(hass, ld2460_radar) -> None:
    """X = 0 is someone straight ahead, never half of a vanish."""
    presence = await _with_zone(hass, ld2460_radar.id, hold_s=30)
    _set(hass, 1, 2000, 1500)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "off"

    hass.states.async_set(_x(1), "0.0", FT)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "on"


# ---------------------------------------------------------------------------
# What the backend tells the card and support
# ---------------------------------------------------------------------------


async def test_zones_get_suggests_the_ld2460_pairs(
    hass, hass_ws_client, ld2460_radar
) -> None:
    """The card tracks all five targets, and is offered no unit rows."""
    await setup_integration(hass, make_entry())
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": "apollo_mmwave/zones/get", "device_id": ld2460_radar.id}
    )
    result = (await client.receive_json())["result"]
    assert result["suggested_entities"] == [_pair(n) for n in range(1, 6)]

    await client.send_json_auto_id(
        {"type": "apollo_mmwave/target_units/get", "device_id": ld2460_radar.id}
    )
    assert (await client.receive_json())["result"] == {"targets": []}


async def test_the_support_file_has_an_ld2460_section(
    hass, hass_client, entity_registry, ld2460_radar
) -> None:
    """Its mode, count and pairs; no LD2450 section."""
    entry = make_entry()
    await setup_integration(hass, entry)
    count = f"sensor.{BASE}_ld2460_presence_target_count"
    hass.states.async_set(count, "2.0")
    _set(hass, 1, 300, 1200)

    result = await get_diagnostics_for_config_entry(hass, hass_client, entry)
    section = next(
        item for item in result["devices"] if item["device_id"] == ld2460_radar.id
    )

    assert section["model"] == "XR-7"
    assert section["radars"]["expected"] == ["ld2412", "ld2460"]
    assert section["radars"]["ld2450"] is False
    assert section["radars"]["ld2460"] is True
    assert section["ld2450"] is None
    ld2460: dict[str, Any] = section["ld2460"]
    assert ld2460["installation_mode"] is None
    assert ld2460["target_count"]["entity_id"] == count
    assert ld2460["target_count"]["state"] == "2.0"
    pairs = ld2460["target_pairs"]
    assert pairs["source"] == "detected"
    assert [pair["x"]["entity_id"] for pair in pairs["detected"]] == [
        _x(n) for n in range(1, 6)
    ]
    assert pairs["detected"][0]["x"]["unit_of_measurement"] == "ft"
    assert ld2460["mount"] == {
        "saved": None,
        "firmware": None,
        "effective": "wall",
        "source": "default",
        "ceiling_height_mm": 2700,
        "height_saved": False,
        "coverage_radius_mm": None,
    }


async def test_the_support_file_names_a_saved_mount_and_its_circle(
    hass, hass_client, ld2460_radar
) -> None:
    """A saved ceiling at 2 m: the circle is 3464.1 mm out."""
    entry = make_entry()
    await setup_integration(hass, entry)
    get_store(hass).device(ld2460_radar.id).update(
        {"mount": "ceiling", "ceiling_height_mm": 2000}
    )

    result = await get_diagnostics_for_config_entry(hass, hass_client, entry)
    section = next(
        item for item in result["devices"] if item["device_id"] == ld2460_radar.id
    )

    assert section["ld2460"]["mount"] == {
        "saved": "ceiling",
        "firmware": None,
        "effective": "ceiling",
        "source": "saved",
        "ceiling_height_mm": 2000,
        "height_saved": True,
        "coverage_radius_mm": 3464.1,
    }


async def test_the_support_file_shows_the_radars_report_winning(
    hass, hass_client, entity_registry, ld2460_radar
) -> None:
    """Side from the radar over a saved ceiling reads as a wall."""
    entry = make_entry()
    mode = _register(
        entity_registry, ld2460_radar.id, "sensor", f"{BASE}_ld2460_installation_mode"
    )
    hass.states.async_set(mode, "side")
    await setup_integration(hass, entry)
    get_store(hass).device(ld2460_radar.id)["mount"] = "ceiling"

    result = await get_diagnostics_for_config_entry(hass, hass_client, entry)
    section = next(
        item for item in result["devices"] if item["device_id"] == ld2460_radar.id
    )
    mount = section["ld2460"]["mount"]

    assert (mount["saved"], mount["firmware"]) == ("ceiling", "side")
    assert (mount["effective"], mount["source"]) == ("wall", "radar")
    assert mount["coverage_radius_mm"] is None

    hass.states.async_set(mode, "top")
    result = await get_diagnostics_for_config_entry(hass, hass_client, entry)
    section = next(
        item for item in result["devices"] if item["device_id"] == ld2460_radar.id
    )
    assert section["ld2460"]["mount"]["effective"] == "ceiling"
    assert section["ld2460"]["mount"]["source"] == "radar"
    assert section["ld2460"]["mount"]["coverage_radius_mm"] == 4000.0
