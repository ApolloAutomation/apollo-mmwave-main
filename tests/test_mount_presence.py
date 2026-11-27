"""Zone presence, masking and the recorder on a High or Ceiling LD2450."""

from __future__ import annotations

import math
from typing import Any

import pytest
from homeassistant.helpers.dispatcher import async_dispatcher_send

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import (
    ATTR_ROTATION_DEG,
    DOMAIN,
    SIGNAL_ZONES_UPDATED,
    STORE_ZONES,
)
from custom_components.apollo_mmwave.hold import Reading
from custom_components.apollo_mmwave.store import ZoneStore
from custom_components.apollo_mmwave.targets import ReadingPairer, masked_readings

TARGET_1 = {
    "x": "sensor.r_pro_ld2450_target_1_x",
    "y": "sensor.r_pro_ld2450_target_1_y",
}
PAIR = {"x": "sensor.radar_target_1_x", "y": "sensor.radar_target_1_y"}
HIGH = {"mount": "high"}
CEILING = {"mount": "ceiling"}
# 1 m out from a 2.2 m radar, person 1 m tall.
HIGH_Y = math.hypot(1000, 1200)


def _rect(y_min: float, y_max: float, **extra: Any) -> dict[str, Any]:
    data = {"x_min": -1500, "x_max": 1500, "y_min": y_min, "y_max": y_max}
    return {"shape": "rect", "data": data, **extra}


async def _presence(hass, entity_registry, device_id: str, **device: Any) -> str:
    store = get_store(hass)
    store.device(device_id).update(device)
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    return entity_registry.async_get_entity_id(
        "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
    )


def _set(hass, x: float, y: float) -> None:
    hass.states.async_set(TARGET_1["x"], str(x))
    hass.states.async_set(TARGET_1["y"], str(y))


@pytest.mark.parametrize("case", [(HIGH, "on"), ({}, "off")])
async def test_a_high_mount_places_people_by_their_floor_distance(
    hass, entity_registry, init_integration, device_id, case
) -> None:
    """Reported 1.56 m is 1 m out on the floor, inside a zone 0.8 to 1.2 m."""
    _ = init_integration
    mount, expected = case
    zones = {STORE_ZONES: {1: _rect(800, 1200)}}
    presence = await _presence(hass, entity_registry, device_id, **zones, **mount)
    _set(hass, 0, round(HIGH_Y))
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == expected


@pytest.mark.parametrize(
    "case",
    [
        (CEILING, _rect(900, 1200)),
        ({**CEILING, "flip_room_side": True}, _rect(-1200, -900)),
    ],
)
async def test_a_ceiling_mount_puts_people_on_the_room_side(
    hass, entity_registry, init_integration, device_id, case
) -> None:
    """(800, 2000) under a 2.7 m ceiling is 1054 mm out, or -1054 flipped."""
    _ = init_integration
    device, zone = case
    zones = {STORE_ZONES: {1: zone}}
    presence = await _presence(hass, entity_registry, device_id, **zones, **device)
    _set(hass, 800, 2000)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "on"


async def test_rotation_turns_the_floor_point(
    hass, entity_registry, init_integration, device_id
) -> None:
    """Rotation 90 maps the floor point (0, 1000) to (1000, 0)."""
    _ = init_integration
    zone = {
        "shape": "rect",
        "data": {"x_min": 800, "x_max": 1200, "y_min": -200, "y_max": 200},
    }
    device = {STORE_ZONES: {1: zone}, ATTR_ROTATION_DEG: 90, **HIGH}
    presence = await _presence(hass, entity_registry, device_id, **device)
    _set(hass, 0, round(HIGH_Y))
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "on"


async def test_an_ignore_zone_masks_the_floor_point(
    hass, entity_registry, init_integration, device_id
) -> None:
    """An ignore zone over 0.8 to 1.2 m drops someone reported at 1.56 m."""
    _ = init_integration
    zones = {1: _rect(0, 3000), 2: _rect(800, 1200, zone_type="ignore")}
    presence = await _presence(
        hass, entity_registry, device_id, **{STORE_ZONES: zones}, **HIGH
    )
    _set(hass, 0, round(HIGH_Y))
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "off"

    # Raw 1.3 m is 0.5 m out: outside the ignore zone.
    _set(hass, 0, 1300)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "on"


async def test_a_reading_below_the_drop_is_someone_under_the_radar(
    hass, entity_registry, init_integration, device_id
) -> None:
    """Raw y under dz gives Y 0, which is no half of a vanish."""
    _ = init_integration
    zones = {STORE_ZONES: {1: _rect(-100, 400, hold_s=30)}}
    presence = await _presence(hass, entity_registry, device_id, **zones, **CEILING)
    _set(hass, 300, 2000)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "off"

    _set(hass, 310, 1600)
    await hass.async_block_till_done()
    state = hass.states.get(presence)
    assert state.state == "on"
    assert state.attributes["held"] is False


async def test_masked_readings_carry_raw_floor_and_map(hass) -> None:
    """Raw stays the sensor's; floor is corrected; map is floor rotated."""
    store = ZoneStore(hass)
    store.devices["dev"] = {"zones": {}, **HIGH, ATTR_ROTATION_DEG: 90}
    hass.states.async_set(PAIR["x"], "-400")
    hass.states.async_set(PAIR["y"], str(HIGH_Y))

    [reading] = masked_readings(hass, store, "dev", [PAIR])

    assert reading.raw == (-400.0, pytest.approx(HIGH_Y))
    assert reading.floor == pytest.approx((-400.0, 1000.0))
    assert reading.map == pytest.approx((1000.0, 400.0))


async def test_masked_readings_on_a_wall_are_unchanged(hass) -> None:
    """No floor point is kept where it would equal raw."""
    store = ZoneStore(hass)
    store.devices["dev"] = {"zones": {}, "tilt_deg": 45}
    hass.states.async_set(PAIR["x"], "0")
    hass.states.async_set(PAIR["y"], "1000")
    assert masked_readings(hass, store, "dev", [PAIR]) == [
        Reading(0, (0.0, 1000.0), (0.0, 1000.0))
    ]


async def test_a_write_that_waits_is_placed_on_the_floor_too(hass) -> None:
    """The hold's report of a lone axis write gets its floor point."""
    store = ZoneStore(hass)
    store.devices["dev"] = {"zones": {}, **HIGH}
    pairer = ReadingPairer()
    hass.states.async_set(PAIR["x"], "100")
    hass.states.async_set(PAIR["y"], str(HIGH_Y))
    masked_readings(hass, store, "dev", [PAIR], (pairer, 0))
    # X alone waits for Y; the whole reading stands.
    hass.states.async_set(PAIR["x"], "-400")
    [reading] = masked_readings(hass, store, "dev", [PAIR], (pairer, 1000))

    assert reading.written is not None
    assert reading.written_floor == pytest.approx((-400.0, 1000.0))
    assert reading.latest_floor == pytest.approx((-400.0, 1000.0))
    assert reading.floor == pytest.approx((100.0, 1000.0))


@pytest.mark.parametrize("case", [(HIGH, "off"), ({}, "on")])
async def test_a_hold_ends_at_the_high_footprints_near_edge(
    hass, entity_registry, init_integration, device_id, case
) -> None:
    """Lost 0.7 m out, 0.14 m from the near edge: they walked under it."""
    _ = init_integration
    mount, expected = case
    zone = {
        "shape": "rect",
        "data": {"x_min": -3000, "x_max": 3000, "y_min": -3000, "y_max": 5000},
        "hold_s": 30,
    }
    presence = await _presence(
        hass, entity_registry, device_id, **{STORE_ZONES: {1: zone}}, **mount
    )
    _set(hass, 100, round(math.hypot(700, 1200)))
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "on"

    _set(hass, 0, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == expected
