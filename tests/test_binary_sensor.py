"""Zone presence sensors: device attachment, tracked pairs, and the fallback."""

from __future__ import annotations

import logging
import math

import pytest
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_state_change_event
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave import get_store, ld2450
from custom_components.apollo_mmwave.binary_sensor import (
    ZonePresenceBinarySensor,
    _build_point_rotator,
)
from custom_components.apollo_mmwave.const import (
    ATTR_ROTATION_DEG,
    DOMAIN,
    SERVICE_UPDATE_ZONE,
    SIGNAL_ZONES_UPDATED,
    STORE_ENTITIES,
    STORE_INPUT_UNITS,
    STORE_ZONES,
)

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


def _presence_id(entity_registry, device_id: str) -> str:
    return entity_registry.async_get_entity_id(
        "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
    )


def _set_target(hass, pair: dict[str, str], x: float, y: float) -> None:
    hass.states.async_set(pair["x"], str(x))
    hass.states.async_set(pair["y"], str(y))


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
    rotate = _build_point_rotator(rotation)

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


def _draw_zone(hass, device_id: str, zone: dict) -> None:
    get_store(hass).device(device_id)[STORE_ZONES][1] = zone
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
