"""Zone presence sensors: device attachment, tracked pairs, masking, offline, hold."""

from __future__ import annotations

import logging
import math
from datetime import timedelta
from typing import Any

import pytest
from homeassistant.const import (
    ATTR_UNIT_OF_MEASUREMENT,
    STATE_UNAVAILABLE,
    UnitOfLength,
)
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.util.unit_conversion import DistanceConverter
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
)

from custom_components.apollo_mmwave import get_store, ld2450
from custom_components.apollo_mmwave.binary_sensor import ZonePresenceBinarySensor
from custom_components.apollo_mmwave.const import (
    ATTR_ROTATION_DEG,
    DOMAIN,
    SENSOR_UNIT_FACTORS,
    SERVICE_UPDATE_ZONE,
    SIGNAL_ZONES_UPDATED,
    STORE_ENTITIES,
    STORE_INPUT_UNITS,
    STORE_ZONES,
)
from custom_components.apollo_mmwave.targets import build_point_rotator

from .conftest import RECT_ZONE

TARGET_1 = {
    "x": "sensor.r_pro_ld2450_target_1_x",
    "y": "sensor.r_pro_ld2450_target_1_y",
}
TARGET_2 = {
    "x": "sensor.r_pro_ld2450_target_2_x",
    "y": "sensor.r_pro_ld2450_target_2_y",
}
TARGET_3 = {
    "x": "sensor.r_pro_ld2450_target_3_x",
    "y": "sensor.r_pro_ld2450_target_3_y",
}


def _presence_id(entity_registry, device_id: str, zone_id: int = 1) -> str:
    return entity_registry.async_get_entity_id(
        "binary_sensor", DOMAIN, f"{device_id}_zone_{zone_id}_presence"
    )


def _set_target(
    hass,
    pair: dict[str, str],
    x: float,
    y: float,
    units: tuple[object, object] = (None, None),
) -> None:
    """Set a target's X and Y states, each with its unit when one is given."""
    for entity_id, value, unit in ((pair["x"], x, units[0]), (pair["y"], y, units[1])):
        attributes = None if unit is None else {ATTR_UNIT_OF_MEASUREMENT: unit}
        hass.states.async_set(entity_id, str(value), attributes)


async def test_presence_falls_back_to_the_devices_ld2450_targets(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """An unconfigured device still detects, using its own target sensors."""
    device_id, _ = setup_entry_with_zone
    assert get_store(hass).device(device_id).get(STORE_ENTITIES) is None
    presence_id = _presence_id(entity_registry, device_id)

    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()

    assert hass.states.get(presence_id).state == "on"


async def test_configured_pairs_win_over_the_fallback(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """An explicit pair list is a deliberate narrowing, so honour it exactly."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[STORE_ENTITIES] = [TARGET_2]
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    _set_target(hass, TARGET_1, 0, 1000)  # inside, but not tracked
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    _set_target(hass, TARGET_2, 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


async def test_an_explicitly_cleared_list_tracks_nothing(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Clearing the pair list has to mean none, not every target on the radar."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[STORE_ENTITIES] = []
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()

    _set_target(hass, TARGET_1, 0, 1000)
    _set_target(hass, TARGET_2, 0, 1000)
    await hass.async_block_till_done()

    assert hass.states.get(_presence_id(entity_registry, device_id)).state == "off"


async def test_presence_tracks_targets_in_and_out(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Presence flips as the tracked target moves in and out of the zone."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)

    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    _set_target(hass, TARGET_1, 5000, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # (0, 0) readings mean "no target" and must not count as inside.
    _set_target(hass, TARGET_1, 0, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


async def test_a_second_target_inside_turns_presence_on(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Presence means any tracked target is inside, not only the first one."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)

    _set_target(hass, TARGET_1, 5000, 1000)  # outside, to the right
    _set_target(hass, TARGET_2, 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    _set_target(hass, TARGET_2, -5000, 1000)  # outside, to the left
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


@pytest.mark.parametrize(
    "bad_state",
    ["unknown", "unavailable", "abc", ""],
    ids=["unknown", "unavailable", "non-numeric", "empty"],
)
async def test_invalid_target_states_read_as_no_target(
    hass, entity_registry, setup_entry_with_zone, bad_state
) -> None:
    """A coordinate the radar cannot report is no reading, not an error."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    hass.states.async_set(TARGET_1["y"], bad_state)
    await hass.async_block_till_done()

    assert hass.states.get(presence_id).state == "off"


async def test_presence_applies_the_devices_rotation(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """A 90 degree device rotation maps (x, y) to (y, -x) before the zone test."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[ATTR_ROTATION_DEG] = 90
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    # (1000, 0) rotates to (0, -1000): outside, since y_min is 0.
    _set_target(hass, TARGET_1, 1000, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # (-1000, 0) rotates to (0, 1000): inside.
    _set_target(hass, TARGET_1, -1000, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


@pytest.mark.parametrize("rotation", ["inf", "nan", float("-inf")])
async def test_non_finite_stored_rotation_is_identity(
    hass, entity_registry, init_integration, device_id, rotation
) -> None:
    """A hand-edited store rotation must not leave the entity stateless."""
    _ = init_integration
    # In the store before the zone's entities exist, so the very first
    # evaluation, inside async_added_to_hass, reads it.
    store = get_store(hass)
    store.device(device_id)[ATTR_ROTATION_DEG] = rotation
    store.device(device_id)[STORE_ZONES][1] = dict(RECT_ZONE)
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)
    assert hass.states.get(presence_id) is not None

    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


async def test_a_non_numeric_rotation_leaves_readings_unrotated(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """A stored rotation that does not parse falls back to no rotation."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[ATTR_ROTATION_DEG] = "abc"
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    _set_target(hass, TARGET_1, 500, 1500)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    _set_target(hass, TARGET_1, 1500, 500)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


@pytest.mark.parametrize(
    ("rotation", "expected"),
    [
        (90, (0, -1000)),
        (-90, (0, 1000)),
        (180, (-1000, 0)),
        # Not a right angle, so degrees taken as radians cannot pass by luck.
        (45, (1000 / math.sqrt(2), -1000 / math.sqrt(2))),
        ("abc", (1000, 0)),
        (None, (1000, 0)),
    ],
    ids=["90", "-90", "180", "45", "non-numeric", "none"],
)
def test_point_rotator_matches_the_cards_rotation(rotation, expected) -> None:
    """The card draws targets with the same formula, so both must agree."""
    # frontend-src/src/zone-map/card.ts `_drawTrackedTargets` is the twin, and
    # zone-map-card.test.ts pins the same 90 and 45 degree results there.
    rotate = build_point_rotator(rotation)

    assert rotate(1000, 0) == pytest.approx(expected, abs=1e-6)


async def test_presence_entity_attaches_to_the_device(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Automations are built from the device page, so it has to appear there."""
    device_id, _ = setup_entry_with_zone

    entry = entity_registry.async_get(_presence_id(entity_registry, device_id))
    assert entry.device_id == device_id
    assert entry.original_name == "Zone 1 presence"


async def test_fallback_recovers_when_target_sensors_appear_later(
    hass, entity_registry, device_registry, init_integration, device_id
) -> None:
    """A radar whose entities land after ours must not sit off forever."""
    _ = (init_integration, device_id)
    esphome_entry = MockConfigEntry(domain="esphome", title="Apollo MTR-1 late")
    esphome_entry.add_to_hass(hass)
    late = device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", "apollo_mtr_1_late")},
        name="Apollo MTR-1 late",
    )
    get_store(hass).device(late.id)[STORE_ZONES][1] = dict(RECT_ZONE)
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, late.id)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, late.id)
    assert hass.states.get(presence_id).state == "off"

    for axis in ("x", "y"):
        entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            f"late1{axis}",
            device_id=late.id,
            suggested_object_id=f"late_ld2450_target_1_{axis}",
        )
    await hass.async_block_till_done()

    hass.states.async_set("sensor.late_ld2450_target_1_x", "0")
    hass.states.async_set("sensor.late_ld2450_target_1_y", "1000")
    await hass.async_block_till_done()

    assert hass.states.get(presence_id).state == "on"


def _geometry_pairs(hass, entity_registry, device_id: str) -> list[dict[str, str]]:
    sensor_id = entity_registry.async_get_entity_id(
        "sensor", DOMAIN, f"{device_id}_zone_1"
    )
    return hass.states.get(sensor_id).attributes["entities"]


async def test_removing_a_target_sensor_drops_it_from_the_tracked_pairs(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """A deleted target leaves no registry entry, so the cache is searched for it."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    assert _geometry_pairs(hass, entity_registry, device_id) == [
        TARGET_1,
        TARGET_2,
        TARGET_3,
    ]

    entity_registry.async_remove(TARGET_1["y"])
    await hass.async_block_till_done()

    assert _geometry_pairs(hass, entity_registry, device_id) == [TARGET_2, TARGET_3]
    _set_target(hass, TARGET_1, 0, 1000)  # inside, but no longer a pair
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    _set_target(hass, TARGET_2, 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


async def test_renaming_a_target_sensor_retargets_the_pairs(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """A renamed target is tracked under its new id, not the one it left behind."""
    # Unlike a removal, a rename keeps a registry entry pointing at the radar,
    # so this goes through the entry's own device and does not depend on the
    # search of cached pairs the removal test above covers.
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    renamed = {"x": "sensor.front_ld2450_target_1_x", "y": TARGET_1["y"]}

    entity_registry.async_update_entity(TARGET_1["x"], new_entity_id=renamed["x"])
    await hass.async_block_till_done()

    assert _geometry_pairs(hass, entity_registry, device_id) == [
        renamed,
        TARGET_2,
        TARGET_3,
    ]
    _set_target(hass, renamed, 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


async def test_fallback_is_not_re_resolved_on_every_coordinate_update(
    hass, entity_registry, setup_entry_with_zone, monkeypatch
) -> None:
    """Resolving scans the device's whole entity list; targets update constantly."""
    device_id, _ = setup_entry_with_zone
    resolved: list[str] = []
    real = ld2450.resolve_target_pairs

    def _counting(hass_, target_device_id: str) -> list[dict[str, str]]:
        resolved.append(target_device_id)
        return real(hass_, target_device_id)

    monkeypatch.setattr(ld2450, "resolve_target_pairs", _counting)

    for offset in range(5):
        _set_target(hass, TARGET_1, 0, 1000 + offset)
        await hass.async_block_till_done()

    assert hass.states.get(_presence_id(entity_registry, device_id)).state == "on"
    assert resolved == []


async def test_presence_scales_readings_by_the_devices_input_units(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """A card drawing in centimetres and the presence sensor must agree."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)

    # The zone spans y 0..2000 mm. 250 cm = 2500 mm is outside, while 250 mm
    # would be inside, so only a scaled reading turns presence off; 150 cm =
    # 1500 mm is inside.
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "input_units": "cm"},
        blocking=True,
    )
    await hass.async_block_till_done()

    _set_target(hass, TARGET_1, 0, 250)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    _set_target(hass, TARGET_1, 0, 150)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # Back to millimetres: 250 is inside again.
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "input_units": "mm"},
        blocking=True,
    )
    await hass.async_block_till_done()
    _set_target(hass, TARGET_1, 0, 250)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


@pytest.mark.parametrize(
    ("units", "inside_and_outside_y"),
    [
        ("cm", (150, 250)),
        ("m", (1.5, 2.5)),
        ("in", (60, 80)),
        ("ft", (6, 7)),
        ("yd", (2, 3)),
    ],
    ids=["cm", "m", "in", "ft", "yd"],
)
async def test_presence_scales_readings_by_each_input_unit(
    hass, entity_registry, setup_entry_with_zone, units, inside_and_outside_y
) -> None:
    """Every unit the service accepts is converted to millimeters first."""
    device_id, _ = setup_entry_with_zone
    inside_y, outside_y = inside_and_outside_y
    presence_id = _presence_id(entity_registry, device_id)
    # The zone spans y 0..2000 mm. Each outside reading would be inside if it
    # were taken as millimeters, so it only reads off once it is scaled.
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "input_units": units},
        blocking=True,
    )
    await hass.async_block_till_done()

    _set_target(hass, TARGET_1, 0, inside_y)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    _set_target(hass, TARGET_1, 0, outside_y)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


async def test_unrecognized_stored_input_units_read_as_millimeters(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """A unit the service would refuse, already in the store, is no scaling."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[STORE_INPUT_UNITS] = "furlong"
    presence_id = _presence_id(entity_registry, device_id)

    _set_target(hass, TARGET_1, 0, 250)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    _set_target(hass, TARGET_1, 0, 2500)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


def test_sensor_unit_factors_cover_every_home_assistant_length_unit() -> None:
    """Any unit Home Assistant can show a distance sensor in converts correctly."""
    # A unit missing here would quietly fall back to input_units, which is the
    # bug 2.2.7 fixed for inches. A Home Assistant release that adds a length
    # unit fails this until the table, and the card's copy, learn it.
    assert set(SENSOR_UNIT_FACTORS) == {str(unit) for unit in UnitOfLength}
    assert set(SENSOR_UNIT_FACTORS) == {
        str(unit) for unit in DistanceConverter.VALID_UNITS
    }
    for unit, factor in SENSOR_UNIT_FACTORS.items():
        expected = DistanceConverter.convert(1.0, unit, UnitOfLength.MILLIMETERS)
        assert factor == pytest.approx(expected, rel=1e-12), unit


async def test_presence_reads_targets_reported_in_inches(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Home Assistant set to US customary units shows the radar's mm in inches."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)

    # A report's live readings of a target at (194, 691) mm, inside the zone.
    _set_target(hass, TARGET_1, 7.63779527559055, 27.2047244094488, ("in", "in"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # 100 in is 2540 mm, past the zone's far edge at 2000 mm. Read as
    # millimeters it would be inside.
    _set_target(hass, TARGET_1, 0, 100, ("in", "in"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # (0, 0) is still the idle slot, whatever its unit.
    _set_target(hass, TARGET_1, 0, 50, ("in", "in"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"
    _set_target(hass, TARGET_1, 0, 0, ("in", "in"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


@pytest.mark.parametrize(
    ("unit", "inside_and_outside_y"),
    [
        ("mm", (1500, 2500)),
        ("cm", (150, 250)),
        ("m", (1.5, 2.5)),
        ("km", (0.0015, 0.0025)),
        ("in", (60, 80)),
        ("ft", (6, 7)),
        ("yd", (2, 3)),
        ("mi", (0.001, 0.0015)),
        ("nmi", (0.001, 0.0015)),
    ],
    ids=["mm", "cm", "m", "km", "in", "ft", "yd", "mi", "nmi"],
)
async def test_presence_converts_readings_by_each_sensors_unit(
    hass, entity_registry, setup_entry_with_zone, unit, inside_and_outside_y
) -> None:
    """Every Home Assistant length unit is converted to millimeters first."""
    # frontend-src/test/zone-map-card.test.ts pins the card drawing the same
    # readings at the same millimeters.
    device_id, _ = setup_entry_with_zone
    inside_y, outside_y = inside_and_outside_y
    presence_id = _presence_id(entity_registry, device_id)

    # The zone spans y 0..2000 mm and no input_units is stored. Each outside
    # reading but the millimeter one would be inside if taken as millimeters.
    _set_target(hass, TARGET_1, 0, inside_y, (unit, unit))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    _set_target(hass, TARGET_1, 0, outside_y, (unit, unit))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


async def test_a_sensors_own_unit_wins_over_the_stored_input_units(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """input_units is only the fallback for a sensor with no length unit."""
    # A card set to `input_units: in` to work around the inches bug saves "in"
    # with every zone edit, so this is a store some users already have.
    device_id, _ = setup_entry_with_zone
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "input_units": "in"},
        blocking=True,
    )
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    # 1500 mm is inside. Taken as inches it would be 38100 mm.
    _set_target(hass, TARGET_1, 0, 1500, ("mm", "mm"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # A sensor in inches is converted once, not twice: 60 in is 1524 mm.
    _set_target(hass, TARGET_1, 0, 60, ("in", "in"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


async def test_presence_converts_x_and_y_each_by_its_own_unit(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """X and Y are separate entities, and a user can change one of them only."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)

    # (500, 1500) mm, inside. Y read in X's meters would be 1500 m.
    _set_target(hass, TARGET_1, 0.5, 1500, ("m", "mm"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # (500, 2500) mm, outside. Y read in X's millimeters would be 2.5 mm.
    _set_target(hass, TARGET_1, 500, 2.5, ("mm", "m"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # (914.4, 1524) mm, inside; 4 ft is 1219.2 mm, outside.
    _set_target(hass, TARGET_1, 3, 60, ("ft", "in"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"
    _set_target(hass, TARGET_1, 4, 60, ("ft", "in"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


async def test_presence_converts_each_axis_before_rotating(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Rotating raw numbers in two different units would mix the axes."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[ATTR_ROTATION_DEG] = 90
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    # (-10 in, 0.5 m) is (-254, 500) mm, which rotates to (500, 254): inside.
    # Rotating the raw (-10, 0.5) to (0.5, 10) first and converting after
    # would give (12.7, 10000) mm, outside.
    _set_target(hass, TARGET_1, -10, 0.5, ("in", "m"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # (-10 in, 1.5 m) is (-254, 1500) mm and rotates to (1500, 254): outside.
    # With the units ignored, (-10, 1.5) rotates to (1.5, 10), inside.
    _set_target(hass, TARGET_1, -10, 1.5, ("in", "m"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


@pytest.mark.parametrize(
    "unit",
    [None, "", "%", "inches", "IN", ["in"]],
    ids=["no-unit", "empty", "not-a-length", "spelled-out", "wrong-case", "not-a-str"],
)
async def test_a_reading_without_a_length_unit_uses_the_stored_input_units(
    hass, entity_registry, setup_entry_with_zone, unit
) -> None:
    """A DIY template sensor with no usable unit is scaled as it was before."""
    device_id, _ = setup_entry_with_zone
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "input_units": "cm"},
        blocking=True,
    )
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    # The zone spans y 0..2000 mm: 150 cm is inside, 250 cm is outside.
    _set_target(hass, TARGET_1, 0, 150, (unit, unit))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    _set_target(hass, TARGET_1, 0, 250, (unit, unit))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


async def test_a_reading_without_a_unit_beside_one_with_a_unit(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """The fallback applies per sensor, not to the whole pair."""
    device_id, _ = setup_entry_with_zone
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "input_units": "cm"},
        blocking=True,
    )
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    # Y has no unit, so it is read in centimeters: 250 cm is outside. Read in
    # X's millimeters it would be inside.
    _set_target(hass, TARGET_1, 500, 250, ("mm", None))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # 20 in is 508 mm and 150 cm is 1500 mm, inside. Read in X's inches, Y
    # would be 3810 mm, outside.
    _set_target(hass, TARGET_1, 20, 150, ("in", None))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


async def test_a_unit_change_alone_re_evaluates_presence(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Switching a sensor's unit moves the target even if its number stays."""
    # Home Assistant fires state_changed for an attribute-only change, so the
    # presence sensor's subscription sees it without any new number.
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    _set_target(hass, TARGET_1, 0, 1500, ("mm", "mm"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # 1500 in is 38100 mm, far past the zone.
    hass.states.async_set(TARGET_1["y"], "1500", {ATTR_UNIT_OF_MEASUREMENT: "in"})
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    hass.states.async_set(TARGET_1["y"], "1500", {ATTR_UNIT_OF_MEASUREMENT: "mm"})
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


def _record_state_changes(hass, entity_id: str) -> list[tuple[str | None, str | None]]:
    changes: list[tuple[str | None, str | None]] = []

    @callback
    def _record(event) -> None:
        old, new = event.data["old_state"], event.data["new_state"]
        changes.append((old and old.state, new and new.state))

    async_track_state_change_event(hass, [entity_id], _record)
    return changes


async def test_presence_does_not_pulse_between_x_and_y_updates(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """X lands before Y, and the point in between is not where any target was."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    _set_target(hass, TARGET_1, 2000, 1000)  # outside, to the right
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"
    changes = _record_state_changes(hass, presence_id)

    # Outside to outside. The new X with the old Y, (0, 1000), is inside the
    # zone, so evaluating between the two writes would publish on, then off.
    _set_target(hass, TARGET_1, 0, 3000)
    await hass.async_block_till_done()

    assert changes == []
    assert hass.states.get(presence_id).state == "off"


async def test_presence_does_not_drop_between_y_and_x_updates(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """The mirror case: two inside points whose mix is outside a round zone."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[STORE_ZONES][1] = {
        "shape": "ellipse",
        "data": {"cx": 0, "cy": 1000, "rx": 1000, "ry": 1000},
    }
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)
    _set_target(hass, TARGET_1, 950, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"
    changes = _record_state_changes(hass, presence_id)

    # Inside to inside, Y first: the new Y with the old X, (950, 1950), lies
    # outside the ellipse, so evaluating between the writes would drop to off.
    hass.states.async_set(TARGET_1["y"], "1950")
    hass.states.async_set(TARGET_1["x"], "0")
    await hass.async_block_till_done()

    assert changes == []
    assert hass.states.get(presence_id).state == "on"


async def test_a_pending_evaluation_is_cancelled_on_removal(
    hass, entity_registry, setup_entry_with_zone, monkeypatch, caplog
) -> None:
    """A zone deleted between a coordinate write and its evaluation stays gone."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    evaluated: list[str] = []
    real = ZonePresenceBinarySensor._evaluate_and_write  # noqa: SLF001 - the subject

    def _spy(self, *, write: bool = True) -> None:
        evaluated.append(self.entity_id)
        real(self, write=write)

    monkeypatch.setattr(ZonePresenceBinarySensor, "_evaluate_and_write", _spy)

    hass.states.async_set(TARGET_1["x"], "0")  # schedules an evaluation
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, "delete": True},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert evaluated == []
    assert hass.states.get(presence_id) is None
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


def _draw_zone(hass, device_id: str, zone: dict, *, zone_id: int = 1) -> None:
    get_store(hass).device(device_id)[STORE_ZONES][zone_id] = zone
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)


async def test_polygon_presence_triangle(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """A target inside a triangle reads on, and off once it leaves."""
    device_id, _ = setup_entry_with_zone
    _draw_zone(
        hass,
        device_id,
        {
            "shape": "polygon",
            "data": {
                "points": [
                    {"x": -1000, "y": 0},
                    {"x": 1000, "y": 0},
                    {"x": 0, "y": 2000},
                ]
            },
        },
    )
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    _set_target(hass, TARGET_1, 0, 500)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # Inside the triangle's bounding box, but past the slanted right edge.
    _set_target(hass, TARGET_1, 900, 1500)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    _set_target(hass, TARGET_1, 2000, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


async def test_polygon_presence_concave_notch(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """A U-shaped zone counts its arms and base, not the notch between them."""
    device_id, _ = setup_entry_with_zone
    _draw_zone(
        hass,
        device_id,
        {
            "shape": "polygon",
            "data": {
                "points": [
                    {"x": -1500, "y": 0},
                    {"x": 1500, "y": 0},
                    {"x": 1500, "y": 3000},
                    {"x": 500, "y": 3000},
                    {"x": 500, "y": 1000},
                    {"x": -500, "y": 1000},
                    {"x": -500, "y": 3000},
                    {"x": -1500, "y": 3000},
                ]
            },
        },
    )
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    _set_target(hass, TARGET_1, 0, 500)  # the base
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    _set_target(hass, TARGET_1, 0, 2000)  # the notch
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    _set_target(hass, TARGET_1, 1000, 2000)  # the right arm
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    _set_target(hass, TARGET_1, 0, 2500)  # back into the notch
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    _set_target(hass, TARGET_1, -1000, 2500)  # the left arm
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


async def test_ellipse_presence_includes_the_rim(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """The center and a point on the rim read on, one just past the rim off."""
    device_id, _ = setup_entry_with_zone
    _draw_zone(
        hass,
        device_id,
        {"shape": "ellipse", "data": {"cx": 0, "cy": 1000, "rx": 500, "ry": 1000}},
    )
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    _set_target(hass, TARGET_1, 0, 1000)  # the center
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    _set_target(hass, TARGET_1, 600, 1000)  # past the rim
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    _set_target(hass, TARGET_1, 500, 1000)  # on the rim, inclusive
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


@pytest.mark.parametrize(
    "zone",
    [
        {
            "shape": "polygon",
            "data": {"points": [{"x": -1000, "y": 0}, {"x": 1000, "y": 2000}]},
        },
        {"shape": "none", "data": RECT_ZONE["data"]},
        {"shape": "blob", "data": RECT_ZONE["data"]},
        {"shape": "rect", "data": None},
        {
            "shape": "rect",
            "data": {"x_min": 0, "x_max": 0, "y_min": 0, "y_max": 2000},
        },
    ],
    ids=["two-point-polygon", "none", "unknown-shape", "rect-no-data", "zero-width"],
)
async def test_an_unusable_zone_never_reads_on(
    hass, entity_registry, setup_entry_with_zone, zone
) -> None:
    """A zone with no usable area reads off even with a target on its geometry."""
    # The service refuses unknown shapes, so these come from data already on
    # disk and are written straight to the store.
    device_id, _ = setup_entry_with_zone
    _draw_zone(hass, device_id, zone)
    await hass.async_block_till_done()

    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()

    assert hass.states.get(_presence_id(entity_registry, device_id)).state == "off"


async def test_shared_coordinate_entity_is_tracked_once(
    hass, entity_registry, setup_entry_with_zone, monkeypatch
) -> None:
    """Two pairs sharing an X entity must not dispatch its updates twice."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    dispatched: list[str] = []
    evaluated: list[str] = []
    real_handle = ZonePresenceBinarySensor._handle_coordinate_update  # noqa: SLF001
    real_evaluate = ZonePresenceBinarySensor._evaluate_and_write  # noqa: SLF001

    @callback
    def _spy_handle(self, event) -> None:
        dispatched.append(event.data["entity_id"])
        real_handle(self, event)

    def _spy_evaluate(self, *, write: bool = True) -> None:
        evaluated.append(self.entity_id)
        real_evaluate(self, write=write)

    monkeypatch.setattr(
        ZonePresenceBinarySensor, "_handle_coordinate_update", _spy_handle
    )
    monkeypatch.setattr(ZonePresenceBinarySensor, "_evaluate_and_write", _spy_evaluate)

    # Re-tracking after the store change subscribes the spy.
    get_store(hass).device(device_id)[STORE_ENTITIES] = [
        {"x": "sensor.shared_x", "y": "sensor.first_y"},
        {"x": "sensor.shared_x", "y": "sensor.second_y"},
    ]
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    hass.states.async_set("sensor.first_y", "1000")
    hass.states.async_set("sensor.second_y", "1500")
    await hass.async_block_till_done()
    dispatched.clear()
    evaluated.clear()

    hass.states.async_set("sensor.shared_x", "0")
    await hass.async_block_till_done()

    assert dispatched == ["sensor.shared_x"]
    assert evaluated == [presence_id]
    assert hass.states.get(presence_id).state == "on"


async def test_input_units_survive_a_reload(
    hass, hass_ws_client, entity_registry, setup_entry_with_zone
) -> None:
    """A reload (every HA restart, every HACS update) must keep the unit."""
    device_id, entry = setup_entry_with_zone
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "input_units": "cm"},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert get_store(hass).devices[device_id][STORE_INPUT_UNITS] == "cm"
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "apollo_mmwave/zones/get", "device_id": device_id}
    )
    assert (await client.receive_json())["result"]["input_units"] == "cm"

    # The zone spans y 0..2000 mm: 250 cm is outside, 150 cm is inside. Read
    # as millimeters both would be inside.
    presence_id = _presence_id(entity_registry, device_id)
    _set_target(hass, TARGET_1, 0, 250)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    _set_target(hass, TARGET_1, 0, 150)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"


# Ignore zones are seeded straight into the store, the way the fixtures seed
# zones. This one sits in the middle of zone 1 (RECT_ZONE), where a fan or a
# curtain would be.
IGNORE_ZONE = {
    "shape": "rect",
    "data": {"x_min": -500, "x_max": 500, "y_min": 500, "y_max": 1500},
    "zone_type": "ignore",
}


def _take_radar_offline(hass) -> None:
    """Mark every target sensor unavailable, as ESPHome does when a radar drops."""
    for pair in (TARGET_1, TARGET_2, TARGET_3):
        for entity_id in pair.values():
            hass.states.async_set(entity_id, STATE_UNAVAILABLE)


async def test_targets_inside_an_ignore_zone_do_not_turn_a_detect_zone_on(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """A target an ignore zone covers is dropped before any detect zone sees it."""
    device_id, _ = setup_entry_with_zone
    _draw_zone(hass, device_id, dict(IGNORE_ZONE), zone_id=2)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    # Inside both zones.
    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # Out of the ignore zone, still inside zone 1.
    _set_target(hass, TARGET_1, 800, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # Masking drops a target, not the radar: a second target in the ignore
    # zone leaves the first one counting.
    _set_target(hass, TARGET_2, 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # Any ignore zone of the radar masks, not only the first one.
    _draw_zone(
        hass,
        device_id,
        {
            "shape": "ellipse",
            "data": {"cx": 800, "cy": 1000, "rx": 150, "ry": 150},
            "zone_type": "ignore",
        },
        zone_id=3,
    )
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


async def test_ignore_zones_mask_the_point_in_the_map_frame(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """The mask tests the converted, rotated point, the one zones are drawn in."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[ATTR_ROTATION_DEG] = 90
    _draw_zone(hass, device_id, dict(IGNORE_ZONE), zone_id=2)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)

    # (-1000, 0) rotates to (0, 1000), inside the ignore zone.
    _set_target(hass, TARGET_1, -1000, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # (-300, 800) rotates to (800, 300): inside zone 1 and outside the ignore
    # zone, though the raw reading lies inside it.
    _set_target(hass, TARGET_1, -300, 800)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # -1000 mm in inches rotates to (0, 1000) again. Taken as millimeters it
    # would land at (0, 39), inside zone 1 and outside the ignore zone.
    _set_target(hass, TARGET_1, -1000 / 25.4, 0, ("in", "in"))
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


async def test_ignore_zone_presence_reads_off_with_zone_type_attribute(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """An ignore zone is a mask: its own sensor reads off with zone_type: ignore."""
    device_id, _ = setup_entry_with_zone
    _draw_zone(hass, device_id, dict(IGNORE_ZONE), zone_id=2)
    await hass.async_block_till_done()
    ignore_id = _presence_id(entity_registry, device_id, zone_id=2)

    state = hass.states.get(ignore_id)
    assert state.state == "off"
    assert state.attributes["zone_type"] == "ignore"

    _set_target(hass, TARGET_1, 0, 1000)  # inside it
    await hass.async_block_till_done()

    state = hass.states.get(ignore_id)
    assert state.state == "off"
    assert state.attributes["zone_type"] == "ignore"
    detect = hass.states.get(_presence_id(entity_registry, device_id))
    assert "zone_type" not in detect.attributes


async def test_ignore_zone_reads_off_even_while_the_radar_is_offline(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """An ignore zone never goes unavailable, so its zone_type stays readable."""
    device_id, _ = setup_entry_with_zone
    _draw_zone(hass, device_id, dict(IGNORE_ZONE), zone_id=2)
    await hass.async_block_till_done()

    _take_radar_offline(hass)
    await hass.async_block_till_done()

    detect = hass.states.get(_presence_id(entity_registry, device_id))
    assert detect.state == STATE_UNAVAILABLE
    ignore = hass.states.get(_presence_id(entity_registry, device_id, zone_id=2))
    assert ignore.state == "off"
    assert ignore.attributes["zone_type"] == "ignore"


async def test_switching_a_zone_to_ignore_and_back_reevaluates(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """A type switch takes effect on the zone signal, with no new reading."""
    device_id, _ = setup_entry_with_zone
    around_target = {
        "shape": "rect",
        "data": {"x_min": -200, "x_max": 200, "y_min": 800, "y_max": 1200},
    }
    _draw_zone(hass, device_id, dict(around_target), zone_id=2)
    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()
    zone_1 = _presence_id(entity_registry, device_id)
    zone_2 = _presence_id(entity_registry, device_id, zone_id=2)
    assert hass.states.get(zone_1).state == "on"
    assert hass.states.get(zone_2).state == "on"

    # Zone 2 becomes a mask: it reads off, and so does zone 1, which the
    # same signal re-evaluates.
    _draw_zone(hass, device_id, {**around_target, "zone_type": "ignore"}, zone_id=2)
    await hass.async_block_till_done()
    assert hass.states.get(zone_1).state == "off"
    state = hass.states.get(zone_2)
    assert state.state == "off"
    assert state.attributes["zone_type"] == "ignore"

    _draw_zone(hass, device_id, dict(around_target), zone_id=2)
    await hass.async_block_till_done()
    assert hass.states.get(zone_1).state == "on"
    state = hass.states.get(zone_2)
    assert state.state == "on"
    assert "zone_type" not in state.attributes


async def test_unhashable_shape_on_an_ignore_zone_does_not_break_presence(
    hass, entity_registry, setup_entry_with_zone, caplog
) -> None:
    """A hand-edited list shape masks nothing and breaks no zone of the radar."""
    device_id, _ = setup_entry_with_zone
    _draw_zone(hass, device_id, {**IGNORE_ZONE, "shape": ["rect"]}, zone_id=2)
    await hass.async_block_till_done()

    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()

    assert hass.states.get(_presence_id(entity_registry, device_id)).state == "on"
    state = hass.states.get(_presence_id(entity_registry, device_id, zone_id=2))
    assert state.state == "off"
    assert state.attributes["zone_type"] == "ignore"
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


async def test_tiny_ellipse_radius_on_an_ignore_zone_does_not_break_presence(
    hass, entity_registry, setup_entry_with_zone, caplog
) -> None:
    """A hand-edited radius too small to square masks nothing and breaks no zone."""
    device_id, _ = setup_entry_with_zone
    _draw_zone(
        hass,
        device_id,
        {
            "shape": "ellipse",
            "data": {"cx": 0, "cy": 1000, "rx": 1e-200, "ry": 500},
            "zone_type": "ignore",
        },
        zone_id=2,
    )
    await hass.async_block_till_done()

    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()

    assert hass.states.get(_presence_id(entity_registry, device_id)).state == "on"
    state = hass.states.get(_presence_id(entity_registry, device_id, zone_id=2))
    assert state.state == "off"
    assert state.attributes["zone_type"] == "ignore"
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


async def test_presence_reads_unavailable_when_every_tracked_state_is_unavailable(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """An offline radar says nothing about the zone, so presence is unavailable."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # One target still reporting, even an empty slot, keeps the radar online.
    _set_target(hass, TARGET_1, STATE_UNAVAILABLE, STATE_UNAVAILABLE)
    _set_target(hass, TARGET_2, 0, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # Every tracked id that has a state is unavailable. Target 3 has never
    # reported, which says nothing either way.
    _set_target(hass, TARGET_2, STATE_UNAVAILABLE, STATE_UNAVAILABLE)
    await hass.async_block_till_done()
    assert hass.states.get(TARGET_3["x"]) is None
    assert hass.states.get(presence_id).state == STATE_UNAVAILABLE


async def test_presence_stays_off_when_tracked_ids_have_no_state(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Ids with no state at all are no sign of an offline radar."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    # The fixture's target sensors are registered but have never reported.
    assert hass.states.get(TARGET_1["x"]) is None
    assert hass.states.get(presence_id).state == "off"

    # A configured pair whose sensors no longer exist.
    get_store(hass).device(device_id)[STORE_ENTITIES] = [
        {"x": "sensor.removed_x", "y": "sensor.removed_y"}
    ]
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()

    assert hass.states.get(presence_id).state == "off"


async def test_presence_stays_off_with_a_cleared_pair_list(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """Tracking nothing leaves no radar to be offline, whatever its sensors say."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    _take_radar_offline(hass)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == STATE_UNAVAILABLE

    get_store(hass).device(device_id)[STORE_ENTITIES] = []
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()

    assert hass.states.get(presence_id).state == "off"


async def test_presence_recovers_when_the_radar_comes_back(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """The first readings after a reconnect bring presence back at once."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    _take_radar_offline(hass)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == STATE_UNAVAILABLE

    # ESPHome reports every sensor again: two empty slots and a target inside.
    _set_target(hass, TARGET_1, 0, 1000)
    _set_target(hass, TARGET_2, 0, 0)
    _set_target(hass, TARGET_3, 0, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # Back from another drop, one target reporting an empty slot is enough
    # to read off rather than unavailable.
    _take_radar_offline(hass)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == STATE_UNAVAILABLE
    _set_target(hass, TARGET_1, 0, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


async def test_unknown_states_do_not_count_as_offline(
    hass, entity_registry, setup_entry_with_zone
) -> None:
    """An unknown state is live: no reading, but the radar is there."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    for pair in (TARGET_1, TARGET_2, TARGET_3):
        _set_target(hass, pair, "unknown", "unknown")
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    # Beside unavailable ones too.
    _set_target(hass, TARGET_1, STATE_UNAVAILABLE, STATE_UNAVAILABLE)
    _set_target(hass, TARGET_2, STATE_UNAVAILABLE, STATE_UNAVAILABLE)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"


# Exit-aware hold. Hold times are seeded straight into the store, as the
# fixtures seed zones. The frozen clock is both Home Assistant's timer clock
# and the hold's time.monotonic(), so _advance moves both.
HOLD_S = 60
# Readings 0.35 s apart, 150 mm a step: slow walking, which hold rule 2 reads
# as moving.
WALK_STEP_S = 0.35
# Toward zone 1's right edge at x = 1000, ending 50 mm from it.
WALK_TO_RIGHT_EDGE = [(200 + 150 * step, 1000) for step in range(6)]
# Zones that reach the edge of the radar's view, 6 m out and 60 degrees
# either side of straight ahead, away from their own edges.
FAR_ZONE = {
    "shape": "rect",
    "data": {"x_min": -1000, "x_max": 1000, "y_min": 3000, "y_max": 7000},
}
RIGHT_ZONE = {
    "shape": "rect",
    "data": {"x_min": 1000, "x_max": 4000, "y_min": 0, "y_max": 3000},
}
LEFT_ZONE = {
    "shape": "rect",
    "data": {"x_min": -4000, "x_max": -1000, "y_min": 0, "y_max": 3000},
}
# Walks that end near an edge, each with the zone it is drawn in. The first
# ends 50 mm from zone 1's right edge. The others end at least 1.2 m from
# their zone's edges but near the edge of the view: 200 mm short of 6 m, or
# about 57 degrees to one side, 135 mm from the 60 degree line.
EDGE_WALKS = {
    "zone-edge": (RECT_ZONE, WALK_TO_RIGHT_EDGE),
    "range": (FAR_ZONE, [(0, 5050 + 150 * step) for step in range(6)]),
    "angle-right": (RIGHT_ZONE, [(2500, 2350 - 150 * step) for step in range(6)]),
    "angle-left": (LEFT_ZONE, [(-2500, 2350 - 150 * step) for step in range(6)]),
}


def _hold_zone(
    zone: dict[str, Any] = RECT_ZONE, hold_s: int = HOLD_S, **settings: Any
) -> dict[str, Any]:
    return {**zone, "hold_s": hold_s, **settings}


def _hold_state(hass, entity_id: str) -> tuple[str, bool | None]:
    """Return a presence sensor's state and its held attribute, None if absent."""
    state = hass.states.get(entity_id)
    return state.state, state.attributes.get("held")


async def _advance(hass, freezer, seconds: float) -> None:
    """Move the frozen clock on, then run every timer that came due."""
    freezer.tick(timedelta(seconds=seconds))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()


async def _sit(hass, freezer, pair: dict[str, str], x: float, y: float) -> None:
    """Report a target that then sits still, so the radar reports nothing new."""
    _set_target(hass, pair, x, y)
    await hass.async_block_till_done()
    await _advance(hass, freezer, 10)


async def _walk(
    hass, freezer, pair: dict[str, str], points: list[tuple[float, float]]
) -> None:
    """Report a target at each point in turn, WALK_STEP_S apart."""
    for index, (x, y) in enumerate(points):
        if index:
            await _advance(hass, freezer, WALK_STEP_S)
        _set_target(hass, pair, x, y)
        await hass.async_block_till_done()


async def _vanish(hass, pair: dict[str, str]) -> None:
    """Report the target gone: X and Y both 0, in one loop turn."""
    _set_target(hass, pair, 0, 0)
    await hass.async_block_till_done()


async def _store_zone(hass, device_id: str, zone: dict[str, Any] | None = None) -> None:
    """Store zone 1, held unless a zone is given, and let every zone re-evaluate."""
    _draw_zone(hass, device_id, zone or _hold_zone())
    await hass.async_block_till_done()


@pytest.mark.parametrize(
    "settings",
    [{}, {"hold_s": 0}, {"hold_s": "60"}, {"hold_s": True}],
    ids=["absent", "zero", "text", "bool"],
)
async def test_hold_zero_turns_off_at_once_like_before(
    hass, freezer, entity_registry, setup_entry_with_zone, settings
) -> None:
    """With no hold time, a zone turns off the moment nobody is in it."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id, {**RECT_ZONE, **settings})
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 500, 1000)
    assert _hold_state(hass, presence_id) == ("on", None)

    # The X of a vanish landing alone reads as (0, 1000), still inside. With
    # no hold, presence reads it as it always has.
    hass.states.async_set(TARGET_1["x"], "0")
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("on", None)

    hass.states.async_set(TARGET_1["y"], "0")
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("off", None)


async def test_held_attribute_only_when_hold_is_set(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A zone with a hold time says whether it is held; others say nothing."""
    device_id, _ = setup_entry_with_zone
    presence_id = _presence_id(entity_registry, device_id)
    assert _hold_state(hass, presence_id) == ("off", None)

    await _store_zone(hass, device_id)
    assert _hold_state(hass, presence_id) == ("off", False)

    await _sit(hass, freezer, TARGET_1, 0, 1000)
    assert _hold_state(hass, presence_id) == ("on", False)
    await _vanish(hass, TARGET_1)
    assert _hold_state(hass, presence_id) == ("on", True)

    await _store_zone(hass, device_id, dict(RECT_ZONE))
    assert _hold_state(hass, presence_id) == ("off", None)


async def test_still_person_lost_mid_zone_holds_until_hold_s(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """Someone who sat still and was lost keeps the zone on for the hold time."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)

    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)
    assert _hold_state(hass, presence_id) == ("on", True)

    await _advance(hass, freezer, HOLD_S - 1)
    assert _hold_state(hass, presence_id) == ("on", True)

    await _advance(hass, freezer, 2)
    assert _hold_state(hass, presence_id) == ("off", False)


async def test_hold_expires_hold_s_after_the_zone_emptied(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """The hold time counts from when the zone emptied, not the last reading."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id, _hold_zone(hold_s=30))
    presence_id = _presence_id(entity_registry, device_id)
    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()

    # A reading stays current until it changes: they were inside all along.
    await _advance(hass, freezer, 20)
    await _vanish(hass, TARGET_1)

    await _advance(hass, freezer, 25)  # 45 s after their last reading
    assert _hold_state(hass, presence_id) == ("on", True)

    await _advance(hass, freezer, 6)
    assert _hold_state(hass, presence_id) == ("off", False)


async def test_person_seen_just_outside_releases_at_once(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A target outside the zone, close to where they were, accounts for them."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    # Still for 10 s, so the walking-out rule alone would hold.
    await _sit(hass, freezer, TARGET_1, 900, 1000)

    _set_target(hass, TARGET_1, 1300, 1000)  # 400 mm on, outside
    await hass.async_block_till_done()

    assert _hold_state(hass, presence_id) == ("off", False)


async def test_person_reacquired_in_another_slot_just_outside_releases(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """LD2450 slots swap between people, so a match goes by position."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 900, 1000)
    await _vanish(hass, TARGET_1)
    assert _hold_state(hass, presence_id) == ("on", True)

    await _advance(hass, freezer, 1)
    _set_target(hass, TARGET_2, 1300, 1000)  # the same person, as target 2
    await hass.async_block_till_done()

    assert _hold_state(hass, presence_id) == ("off", False)


async def test_outside_target_too_far_does_not_release(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A target farther than a person could have walked accounts for nobody."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)

    # 1.5 m away 0.5 s after the zone emptied, past the 1.4 m reach then.
    await _advance(hass, freezer, 0.5)
    _set_target(hass, TARGET_2, 1500, 1000)
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("on", True)

    # Within the reach of a later moment, but only after the first 3 s.
    await _advance(hass, freezer, 3)
    _set_target(hass, TARGET_2, 1450, 1000)
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("on", True)


async def test_outside_target_after_three_seconds_does_not_release(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """After the first 3 s, a target outside accounts for nobody, however near."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 900, 1000)
    await _vanish(hass, TARGET_1)

    await _advance(hass, freezer, 3.5)
    _set_target(hass, TARGET_2, 1100, 1000)  # 200 mm from where they were
    await hass.async_block_till_done()

    assert _hold_state(hass, presence_id) == ("on", True)


async def test_another_tracked_person_4_m_away_releases_within_3_s(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """The reach grows to 5.4 m in 3 s, so anyone the radar tracks nearby counts."""
    # Rule 1 as specified, pinned on purpose: a narrower reach for targets
    # tracked elsewhere is an open question.
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    _set_target(hass, TARGET_2, 4000, 1000)  # someone else, outside the zone
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)
    assert _hold_state(hass, presence_id) == ("on", True)

    await _advance(hass, freezer, 1)
    _set_target(hass, TARGET_2, 4000, 1100)  # 4 m, past the 2.2 m of 1 s
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("on", True)

    await _advance(hass, freezer, 1.5)
    _set_target(hass, TARGET_2, 4000, 1000)  # within the 4.6 m of 2.5 s
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("off", False)


async def test_one_outside_target_accounts_for_one_person(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """Two people lost together need two targets outside to release the zone."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    _set_target(hass, TARGET_1, 0, 1000)
    await _sit(hass, freezer, TARGET_2, 300, 1000)
    _set_target(hass, TARGET_1, 0, 0)
    _set_target(hass, TARGET_2, 0, 0)
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("on", True)

    # Within reach of both, it accounts for the nearer one.
    await _advance(hass, freezer, 0.5)
    _set_target(hass, TARGET_3, 100, 2100)
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("on", True)

    # Seen again, the same target accounts for nobody else.
    await _advance(hass, freezer, 0.5)
    _set_target(hass, TARGET_3, 150, 2150)
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("on", True)

    _set_target(hass, TARGET_1, 1200, 1000)  # 900 mm from the other one
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("off", False)


async def test_an_outside_target_goes_to_the_nearest_vanished_person(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A person who walked out keeps their own reading; the one sitting is held."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 600, 1000)
    await _walk(hass, freezer, TARGET_2, WALK_TO_RIGHT_EDGE)

    # In one report the sitter is lost, and the walker steps out 150 mm past
    # where they were. That reading is within reach of the sitter too (500
    # mm). Given to the sitter, it would leave the walker to the walking-out
    # rule, which releases them at the edge, and the zone would turn off.
    _set_target(hass, TARGET_1, 0, 0)
    _set_target(hass, TARGET_2, 1100, 1000)
    await hass.async_block_till_done()

    assert _hold_state(hass, presence_id) == ("on", True)


async def test_moving_person_lost_near_the_zone_edge_releases(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """Lost mid-stride at the zone's edge, a person walked out: no hold."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _walk(hass, freezer, TARGET_1, WALK_TO_RIGHT_EDGE)

    await _vanish(hass, TARGET_1)

    assert _hold_state(hass, presence_id) == ("off", False)


async def test_moving_person_lost_mid_zone_holds(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """Moving is not enough to have walked out: it takes an edge nearby too."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    # The same walk 575 mm to the left, ending 625 mm from the nearest edge.
    await _walk(hass, freezer, TARGET_1, [(x - 575, y) for x, y in WALK_TO_RIGHT_EDGE])

    await _vanish(hass, TARGET_1)

    assert _hold_state(hass, presence_id) == ("on", True)


@pytest.mark.parametrize("edge", ["range", "angle-right", "angle-left"])
async def test_moving_person_lost_near_the_coverage_edge_releases(
    hass, freezer, entity_registry, setup_entry_with_zone, edge
) -> None:
    """Lost mid-stride where the radar's view ends, a person walked out of it."""
    zone, walk = EDGE_WALKS[edge]
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id, _hold_zone(zone))
    presence_id = _presence_id(entity_registry, device_id)
    await _walk(hass, freezer, TARGET_1, walk)

    await _vanish(hass, TARGET_1)

    assert _hold_state(hass, presence_id) == ("off", False)


@pytest.mark.parametrize("edge", list(EDGE_WALKS))
async def test_still_person_lost_near_the_edge_holds(
    hass, freezer, entity_registry, setup_entry_with_zone, edge
) -> None:
    """Near an edge but sitting still, a lost person did not walk out."""
    zone, walk = EDGE_WALKS[edge]
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id, _hold_zone(zone))
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, *walk[-1])

    await _vanish(hass, TARGET_1)

    assert _hold_state(hass, presence_id) == ("on", True)


async def test_stale_motion_does_not_count_as_moving(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A walk that ended 2 s before the loss is no sign of walking out."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _walk(hass, freezer, TARGET_1, WALK_TO_RIGHT_EDGE)

    # They stop by the edge, and the radar reports nothing new for 2 s.
    await _advance(hass, freezer, 2)
    await _vanish(hass, TARGET_1)

    assert _hold_state(hass, presence_id) == ("on", True)


async def test_transient_target_vanishing_mid_zone_holds(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A ghost seen mid-zone for half a second holds the zone: a known limit."""
    # Seen for under 1.2 s, a target counts as moving, but it was lost far
    # from every edge, so nothing accounts for it. An ignore zone over the
    # ghost's source is the remedy.
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    _set_target(hass, TARGET_1, 0, 1000)
    await hass.async_block_till_done()

    await _advance(hass, freezer, 0.5)
    await _vanish(hass, TARGET_1)
    assert _hold_state(hass, presence_id) == ("on", True)

    await _advance(hass, freezer, HOLD_S + 1)
    assert _hold_state(hass, presence_id) == ("off", False)


async def test_someone_inside_again_ends_the_hold(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """Someone coming in ends the hold, and the person lost before is forgotten."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)
    assert _hold_state(hass, presence_id) == ("on", True)

    await _advance(hass, freezer, 5)
    _set_target(hass, TARGET_2, 800, 1000)
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("on", False)

    # They walk out and are accounted for, and nothing is left to hold.
    await _advance(hass, freezer, 1)
    _set_target(hass, TARGET_2, 1200, 1000)
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("off", False)


async def test_still_person_lost_while_another_is_inside_is_forgotten(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """Only the people of the last evaluation that found anyone inside are held."""
    # A known limit, pinned on purpose: carrying such a person into the hold
    # instead is an open question.
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    _set_target(hass, TARGET_1, -500, 1000)
    await _sit(hass, freezer, TARGET_2, 800, 1000)

    await _vanish(hass, TARGET_1)  # lost while the other is still inside
    assert _hold_state(hass, presence_id) == ("on", False)

    await _advance(hass, freezer, 2)
    _set_target(hass, TARGET_2, 1200, 1000)  # the other walks out
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("off", False)


async def test_two_people_swapping_slots_inside_keep_the_zone_on(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A slot swap inside the zone changes who is where, not whether it is on."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    _set_target(hass, TARGET_1, -500, 1000)
    await _sit(hass, freezer, TARGET_2, 500, 1000)
    changes = _record_state_changes(hass, presence_id)

    _set_target(hass, TARGET_1, 500, 1000)
    _set_target(hass, TARGET_2, -500, 1000)
    await hass.async_block_till_done()

    assert changes == []
    assert _hold_state(hass, presence_id) == ("on", False)


# Off the radar's axes, so that the half-written vanish of a target sitting
# near this zone's corner at (400, 500) lands outside it, 400 or 500 mm from
# the target: close enough to account for them if it were a reading.
CORNER_ZONE = {
    "shape": "rect",
    "data": {"x_min": 200, "x_max": 2000, "y_min": 300, "y_max": 2000},
}


@pytest.mark.parametrize("first", ["x", "y"], ids=["x-first", "y-first"])
async def test_vanish_reported_in_two_turns_still_holds(
    hass, freezer, entity_registry, setup_entry_with_zone, first
) -> None:
    """The first half of a vanish is nobody's position, so it releases nothing."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id, _hold_zone(CORNER_ZONE))
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 400, 500)

    # (0, 500) or (400, 0), with a loop turn before the other write lands.
    hass.states.async_set(TARGET_1[first], "0")
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("on", True)

    hass.states.async_set(TARGET_1["y" if first == "x" else "x"], "0")
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("on", True)


async def test_ignored_target_does_not_release_a_hold(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A fan or a curtain inside an ignore zone accounts for nobody."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    _draw_zone(
        hass,
        device_id,
        {
            "shape": "rect",
            "data": {"x_min": 1100, "x_max": 1700, "y_min": 700, "y_max": 1300},
            "zone_type": "ignore",
        },
        zone_id=2,
    )
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 700, 1000)
    await _vanish(hass, TARGET_1)

    await _advance(hass, freezer, 0.5)
    _set_target(hass, TARGET_2, 1200, 1000)  # 500 mm away, in the ignore zone
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("on", True)

    # Out of the ignore zone, 350 mm away, the same target does.
    await _advance(hass, freezer, 0.5)
    _set_target(hass, TARGET_2, 1050, 1000)
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("off", False)


async def test_offline_radar_drops_the_hold(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A radar that drops off says nothing about who it lost, so the hold ends."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)
    assert _hold_state(hass, presence_id) == ("on", True)

    _take_radar_offline(hass)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == STATE_UNAVAILABLE

    # Back with nobody in view: the hold does not come back with it.
    for pair in (TARGET_1, TARGET_2, TARGET_3):
        _set_target(hass, pair, 0, 0)
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("off", False)

    await _advance(hass, freezer, HOLD_S + 1)
    assert _hold_state(hass, presence_id) == ("off", False)


async def test_zone_deletion_cancels_the_hold_timer(
    hass, freezer, setup_entry_with_zone, monkeypatch, caplog
) -> None:
    """A deleted zone's hold never fires into the entity that left with it."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(er.async_get(hass), device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)
    assert _hold_state(hass, presence_id) == ("on", True)
    evaluated: list[str] = []
    real = ZonePresenceBinarySensor._evaluate_and_write  # noqa: SLF001 - the subject

    def _spy(self, *, write: bool = True) -> None:
        evaluated.append(self.entity_id)
        real(self, write=write)

    monkeypatch.setattr(ZonePresenceBinarySensor, "_evaluate_and_write", _spy)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, "delete": True},
        blocking=True,
    )
    await hass.async_block_till_done()
    assert hass.states.get(presence_id) is None

    await _advance(hass, freezer, HOLD_S + 1)

    assert evaluated == []
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


async def test_hold_s_change_reschedules_from_when_the_zone_emptied(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A new hold time keeps the hold and counts from when the zone emptied."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)

    await _advance(hass, freezer, 10)
    await _store_zone(hass, device_id, _hold_zone(hold_s=120))
    await _advance(hass, freezer, 51)  # past the first 60 s
    assert _hold_state(hass, presence_id) == ("on", True)

    await _advance(hass, freezer, 9)  # 70 s after the zone emptied
    await _store_zone(hass, device_id, _hold_zone(hold_s=80))
    await _advance(hass, freezer, 9)
    assert _hold_state(hass, presence_id) == ("on", True)

    await _advance(hass, freezer, 2)
    assert _hold_state(hass, presence_id) == ("off", False)


async def test_hold_s_lowered_below_the_time_empty_releases_at_once(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A hold time shorter than the zone has been empty is already over."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)

    await _advance(hass, freezer, 40)
    await _store_zone(hass, device_id, _hold_zone(hold_s=30))

    assert _hold_state(hass, presence_id) == ("off", False)


async def test_hold_s_to_zero_releases_at_once(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """Taking the hold time away ends the hold there and then."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)

    await _advance(hass, freezer, 5)
    await _store_zone(hass, device_id, dict(RECT_ZONE))
    assert _hold_state(hass, presence_id) == ("off", None)

    # Given a hold time again, the zone does not pick the old hold back up.
    await _store_zone(hass, device_id)
    assert _hold_state(hass, presence_id) == ("off", False)
    await _advance(hass, freezer, HOLD_S)
    assert _hold_state(hass, presence_id) == ("off", False)


@pytest.mark.parametrize(
    "zone",
    [
        {
            "shape": "rect",
            "data": {"x_min": -1500, "x_max": 1500, "y_min": 0, "y_max": 2500},
        },
        {"shape": "ellipse", "data": {"cx": 0, "cy": 1000, "rx": 1000, "ry": 1000}},
    ],
    ids=["resized", "reshaped"],
)
async def test_geometry_change_drops_the_hold(
    hass, freezer, entity_registry, setup_entry_with_zone, zone
) -> None:
    """Where a person was lost means nothing in a zone drawn somewhere else."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)

    await _store_zone(hass, device_id, _hold_zone(zone))

    assert _hold_state(hass, presence_id) == ("off", False)


@pytest.mark.parametrize(
    "change",
    [
        {ATTR_ROTATION_DEG: 15},
        {STORE_INPUT_UNITS: "cm"},
        {STORE_ENTITIES: [TARGET_1, TARGET_2]},
    ],
    ids=["rotation", "input-units", "pairs"],
)
async def test_a_change_in_how_targets_are_read_drops_the_hold(
    hass, freezer, entity_registry, setup_entry_with_zone, change
) -> None:
    """The hold ends when the rotation, the units or the tracked pairs change."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)

    get_store(hass).device(device_id).update(change)
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()

    assert _hold_state(hass, presence_id) == ("off", False)


async def test_drawing_an_ignore_zone_drops_the_hold(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A new mask changes what every zone of the radar sees, so the hold ends."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)

    _draw_zone(hass, device_id, {**RIGHT_ZONE, "zone_type": "ignore"}, zone_id=2)
    await hass.async_block_till_done()

    assert _hold_state(hass, presence_id) == ("off", False)


async def test_rename_keeps_the_hold(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """A zone's name has nothing to do with who is in it."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, "name": "Couch"},
        blocking=True,
    )
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("on", True)

    await _advance(hass, freezer, HOLD_S + 1)
    assert _hold_state(hass, presence_id) == ("off", False)


async def test_changes_presence_does_not_read_keep_the_hold(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """Display settings and another detect zone's edits leave a hold standing."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "display_units": "ft"},
        blocking=True,
    )
    device = get_store(hass).device(device_id)
    device["mirror_x"] = True
    device["movement_history"] = True
    _draw_zone(hass, device_id, dict(RIGHT_ZONE), zone_id=2)
    await hass.async_block_till_done()
    _draw_zone(hass, device_id, dict(LEFT_ZONE), zone_id=2)
    await hass.async_block_till_done()

    assert _hold_state(hass, presence_id) == ("on", True)


async def test_first_zone_signal_after_add_keeps_the_hold(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """After a reload, the first zone signal compares against what the add read."""
    device_id, entry = setup_entry_with_zone
    await _store_zone(hass, device_id)
    _draw_zone(hass, device_id, dict(RIGHT_ZONE), zone_id=2)
    await hass.async_block_till_done()
    # A reload while Home Assistant runs: no STARTED nudge follows it, so the
    # first zone signal the new entity sees can come long after a hold began.
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)
    assert _hold_state(hass, presence_id) == ("on", True)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 2, "name": "Hall"},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert _hold_state(hass, presence_id) == ("on", True)


async def test_hold_is_not_restored_after_a_reload(
    hass, freezer, entity_registry, setup_entry_with_zone, caplog
) -> None:
    """The hold lives in memory only: a reload reads the zone from live readings."""
    device_id, entry = setup_entry_with_zone
    await _store_zone(hass, device_id)
    presence_id = _presence_id(entity_registry, device_id)
    await _sit(hass, freezer, TARGET_1, 0, 1000)
    await _vanish(hass, TARGET_1)
    assert _hold_state(hass, presence_id) == ("on", True)

    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert _hold_state(hass, presence_id) == ("off", False)

    await _advance(hass, freezer, HOLD_S + 1)
    assert _hold_state(hass, presence_id) == ("off", False)
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


async def test_ignore_zone_never_holds(
    hass, freezer, entity_registry, setup_entry_with_zone
) -> None:
    """An ignore zone has nothing to hold, whatever hold time its dict carries."""
    device_id, _ = setup_entry_with_zone
    await _store_zone(hass, device_id)
    # A hold time on an ignore zone, as a hand edit could leave it.
    _draw_zone(hass, device_id, {**IGNORE_ZONE, "hold_s": HOLD_S}, zone_id=2)
    await hass.async_block_till_done()
    zone_1 = _presence_id(entity_registry, device_id)
    zone_2 = _presence_id(entity_registry, device_id, zone_id=2)

    await _sit(hass, freezer, TARGET_2, 0, 1000)  # inside the ignore zone
    await _vanish(hass, TARGET_2)
    state = hass.states.get(zone_2)
    assert state.state == "off"
    assert state.attributes["zone_type"] == "ignore"
    assert "held" not in state.attributes

    # A held detect zone switched to ignore lets go, and switched back it
    # does not pick the hold up again.
    await _sit(hass, freezer, TARGET_1, 800, 1000)
    await _vanish(hass, TARGET_1)
    assert _hold_state(hass, zone_1) == ("on", True)

    await _store_zone(hass, device_id, _hold_zone(zone_type="ignore"))
    state = hass.states.get(zone_1)
    assert state.state == "off"
    assert state.attributes["zone_type"] == "ignore"
    assert "held" not in state.attributes

    await _store_zone(hass, device_id)
    assert _hold_state(hass, zone_1) == ("off", False)
