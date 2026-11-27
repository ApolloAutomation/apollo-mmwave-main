"""The LD2460's (0, 0) is a person, never the LD2450's empty slot."""

from __future__ import annotations

from homeassistant.helpers.dispatcher import async_dispatcher_send

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import SIGNAL_ZONES_UPDATED, STORE_ZONES
from custom_components.apollo_mmwave.targets import iter_slot_points, read_point

from .test_ld2460 import FT, _pair, _set, _with_zone, _x, _y, ld2460_radar

__all__ = ["ld2460_radar"]


async def test_someone_right_under_a_ceiling_radar_is_inside(
    hass, ld2460_radar
) -> None:
    """A zone around the radar turns on for a target at (0, 0)."""
    presence = await _with_zone(hass, ld2460_radar.id)
    get_store(hass).device(ld2460_radar.id)[STORE_ZONES][1] = {
        "shape": "rect",
        "data": {"x_min": -500, "x_max": 500, "y_min": -500, "y_max": 500},
    }
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, ld2460_radar.id)
    _set(hass, 1, 0, 0)
    await hass.async_block_till_done()
    assert hass.states.get(presence).state == "on"


async def test_only_an_ld2450_origin_is_an_empty_slot(hass) -> None:
    """Pairs of both radars at (0, 0): the LD2460's alone is read."""
    ld2450 = {"x": "sensor.r_ld2450_target_1_x", "y": "sensor.r_ld2450_target_1_y"}
    for entity_id in (*ld2450.values(), _x(1), _y(1)):
        hass.states.async_set(entity_id, "0.0", FT)
    assert list(iter_slot_points(hass, [ld2450, _pair(1)], 1.0)) == [(1, 0.0, 0.0)]
    # read_point alone keeps the LD2450's rule unless told otherwise.
    assert read_point(hass, _x(1), _y(1), 1.0) is None
    assert read_point(hass, _x(1), _y(1), 1.0, origin_is_empty=False) == (0.0, 0.0)
