"""Tracked targets: the one reading presence and the movement recorder share."""

from __future__ import annotations

import pytest
from homeassistant.const import ATTR_UNIT_OF_MEASUREMENT

from custom_components.apollo_mmwave.hold import Reading
from custom_components.apollo_mmwave.store import ZoneStore
from custom_components.apollo_mmwave.targets import (
    SHAPE_TESTERS,
    fallback_factor,
    iter_slot_points,
    masked_readings,
    pair_ids,
    radar_offline,
    read_point,
    shape_tester,
)

from .conftest import RECT_ZONE

PAIR_1 = {"x": "sensor.radar_target_1_x", "y": "sensor.radar_target_1_y"}
PAIR_2 = {"x": "sensor.radar_target_2_x", "y": "sensor.radar_target_2_y"}
PAIR_3 = {"x": "sensor.radar_target_3_x", "y": "sensor.radar_target_3_y"}
PAIRS = [PAIR_1, PAIR_2, PAIR_3]

# Zone 1's middle, a fan or a curtain the radar sees as a target.
IGNORE_ZONE = {
    "shape": "rect",
    "data": {"x_min": -500, "x_max": 500, "y_min": 500, "y_max": 1500},
    "zone_type": "ignore",
}


def _set(hass, pair: dict[str, str], x: object, y: object, unit: object = None) -> None:
    attributes = None if unit is None else {ATTR_UNIT_OF_MEASUREMENT: unit}
    hass.states.async_set(pair["x"], str(x), attributes)
    hass.states.async_set(pair["y"], str(y), attributes)


@pytest.mark.parametrize(
    ("zone_def", "shape"),
    [
        (RECT_ZONE, "rect"),
        ({"shape": "ellipse", "data": None}, "ellipse"),
        ({"shape": "polygon"}, "polygon"),
        ({"shape": "none", "data": RECT_ZONE["data"]}, None),
        ({"shape": "blob"}, None),
        ({"data": RECT_ZONE["data"]}, None),
        # Hand edits: an unhashable shape must not raise inside an evaluation.
        ({"shape": ["rect"], "data": RECT_ZONE["data"]}, None),
        ({"shape": {"rect": True}}, None),
        (None, None),
        ("rect", None),
        (["rect"], None),
    ],
    ids=[
        "rect",
        "ellipse",
        "polygon",
        "none",
        "unknown-shape",
        "no-shape",
        "list-shape",
        "object-shape",
        "no-zone",
        "zone-is-a-str",
        "zone-is-a-list",
    ],
)
def test_shape_tester_is_none_without_a_usable_shape(zone_def, shape) -> None:
    """A tester comes back only for a shape name the testers know."""
    expected = None if shape is None else SHAPE_TESTERS[shape]

    assert shape_tester(zone_def) is expected


@pytest.mark.parametrize(
    "radii",
    [{"rx": 1e-200, "ry": 500}, {"rx": 500, "ry": 1e-200}],
    ids=["rx", "ry"],
)
def test_ellipse_whose_radius_squares_to_zero_holds_nothing(radii) -> None:
    """A hand-edited radius too small to square contains no point and raises not."""
    ellipse = SHAPE_TESTERS["ellipse"]
    data = {"cx": 0, "cy": 1000, **radii}

    assert ellipse(0.0, 1000.0, data) is False
    assert ellipse(5.0, 1003.0, data) is False
    # A small radius that still squares keeps its center, as before.
    assert ellipse(0.0, 1000.0, {**data, **dict.fromkeys(radii, 1e-150)}) is True


def test_pair_ids_lists_each_entity_once_in_list_order() -> None:
    """Shared entities are listed once; anything that is not an id is skipped."""
    pairs = [
        {"x": "sensor.a_x", "y": "sensor.a_y"},
        {"x": "sensor.a_x", "y": "sensor.b_y"},
        "not a pair",
        {"x": 5, "y": "sensor.c_y"},
        {"x": "sensor.d", "y": "sensor.d"},
        {"y": "sensor.e_y"},
    ]

    assert pair_ids(pairs) == [
        "sensor.a_x",
        "sensor.a_y",
        "sensor.b_y",
        "sensor.c_y",
        "sensor.d",
        "sensor.e_y",
    ]
    assert pair_ids([]) == []
    assert pair_ids(None) == []
    assert pair_ids(PAIR_1) == []


@pytest.mark.parametrize(
    "bad",
    [None, "unknown", "unavailable", "abc", "", "nan", "inf", "-inf"],
    ids=[
        "missing",
        "unknown",
        "unavailable",
        "non-numeric",
        "empty",
        "nan",
        "inf",
        "negative-inf",
    ],
)
@pytest.mark.parametrize("axis", ["x", "y"])
async def test_read_point_is_none_unless_both_axes_read(hass, bad, axis) -> None:
    """A coordinate the radar cannot report, or one inside no zone, is no point."""
    _set(hass, PAIR_1, 500, 1500)
    if bad is None:
        hass.states.async_remove(PAIR_1[axis])
    else:
        hass.states.async_set(PAIR_1[axis], bad)

    assert read_point(hass, PAIR_1["x"], PAIR_1["y"], 1.0) is None


async def test_read_point_skips_only_the_idle_origin(hass) -> None:
    """(0, 0) is an empty slot; a target on either axis line is a target."""
    _set(hass, PAIR_1, 0, 0)
    assert read_point(hass, PAIR_1["x"], PAIR_1["y"], 1.0) is None
    _set(hass, PAIR_1, "0.0", "-0")
    assert read_point(hass, PAIR_1["x"], PAIR_1["y"], 1.0) is None

    _set(hass, PAIR_1, 0, 1000)
    assert read_point(hass, PAIR_1["x"], PAIR_1["y"], 1.0) == (0.0, 1000.0)
    _set(hass, PAIR_1, -250, 0)
    assert read_point(hass, PAIR_1["x"], PAIR_1["y"], 1.0) == (-250.0, 0.0)


async def test_read_point_converts_each_axis_by_its_own_unit(hass) -> None:
    """Millimeters out, whatever unit each sensor reports in."""
    hass.states.async_set(PAIR_1["x"], "10", {ATTR_UNIT_OF_MEASUREMENT: "in"})
    hass.states.async_set(PAIR_1["y"], "1.5", {ATTR_UNIT_OF_MEASUREMENT: "m"})
    assert read_point(hass, PAIR_1["x"], PAIR_1["y"], 10.0) == pytest.approx(
        (254.0, 1500.0)
    )

    # No length unit: the device's input unit, passed in as the fallback.
    hass.states.async_set(PAIR_1["y"], "150")
    assert read_point(hass, PAIR_1["x"], PAIR_1["y"], 10.0) == pytest.approx(
        (254.0, 1500.0)
    )


async def test_read_point_refuses_a_reading_too_large_for_its_unit(hass) -> None:
    """A finite number that converts to infinity is no point either."""
    _set(hass, PAIR_1, "1e305", 1000, "nmi")

    assert read_point(hass, PAIR_1["x"], PAIR_1["y"], 1.0) is None


async def test_iter_slot_points_keeps_the_slot_of_skipped_pairs(hass) -> None:
    """A target keeps its slot, its index in the list, when another has none."""
    _set(hass, PAIR_1, "unavailable", "unavailable")
    _set(hass, PAIR_3, 500, 1500)
    pairs = [PAIR_1, "not a pair", PAIR_3, {"x": PAIR_2["x"]}]

    assert list(iter_slot_points(hass, pairs, 1.0)) == [(2, 500.0, 1500.0)]
    assert list(iter_slot_points(hass, None, 1.0)) == []


async def test_fallback_factor_is_the_stored_input_unit(hass) -> None:
    """Millimeters unless a unit the service accepts is stored; reads mint nothing."""
    store = ZoneStore(hass)
    store.devices.update(
        {
            "cm": {"zones": {}, "input_units": "cm"},
            "furlong": {"zones": {}, "input_units": "furlong"},
            "number": {"zones": {}, "input_units": 5},
            "none": {"zones": {}},
        }
    )

    assert fallback_factor(store, "cm") == 10.0
    assert fallback_factor(store, "furlong") == 1.0
    assert fallback_factor(store, "number") == 1.0
    assert fallback_factor(store, "none") == 1.0
    assert fallback_factor(store, "ghost") == 1.0
    assert "ghost" not in store.devices


async def test_masked_readings_drop_targets_inside_an_ignore_zone(hass) -> None:
    """The ignore zone tests the rotated point; detect zones mask nothing."""
    store = ZoneStore(hass)
    store.devices["dev"] = {
        "zones": {
            1: dict(RECT_ZONE),
            2: dict(IGNORE_ZONE),
            # A hand edit on another ignore zone must not break the others.
            3: {"shape": ["rect"], "data": RECT_ZONE["data"], "zone_type": "ignore"},
        },
        "rotation_deg": 90,
    }
    # Rotating by 90 maps (x, y) to (y, -x).
    _set(hass, PAIR_1, -1000, 0)  # map (0, 1000): inside the ignore zone
    _set(hass, PAIR_2, -1000, 1800)  # map (1800, 1000): outside it
    _set(hass, PAIR_3, 0, 1000)  # map (1000, 0): outside it, though raw is inside

    readings = masked_readings(hass, store, "dev", PAIRS)

    assert [reading.slot for reading in readings] == [1, 2]
    assert readings[0].raw == (-1000.0, 1800.0)
    assert readings[0].map == pytest.approx((1800.0, 1000.0))
    assert readings[1].raw == (0.0, 1000.0)
    assert readings[1].map == pytest.approx((1000.0, 0.0))


async def test_masked_readings_without_ignore_zones_keep_every_target(hass) -> None:
    """Detect zones, invalid ignore zones and an unknown radar mask nothing."""
    store = ZoneStore(hass)
    store.devices["dev"] = {
        "zones": {
            1: dict(RECT_ZONE),
            2: {**IGNORE_ZONE, "zone_type": "Ignore"},
            3: {**IGNORE_ZONE, "shape": "none"},
        },
        "input_units": "cm",
    }
    _set(hass, PAIR_1, 0, 100)  # no unit: the stored centimeters

    assert masked_readings(hass, store, "dev", [PAIR_1]) == [
        Reading(0, (0.0, 1000.0), (0.0, 1000.0))
    ]
    assert masked_readings(hass, store, "ghost", [PAIR_1]) == [
        Reading(0, (0.0, 100.0), (0.0, 100.0))
    ]
    assert "ghost" not in store.devices


@pytest.mark.parametrize(
    ("states", "pairs", "offline"),
    [
        ({"x1": "unavailable", "y1": "unavailable"}, PAIRS, True),
        (
            dict.fromkeys(("x1", "y1", "x2", "y2", "x3", "y3"), "unavailable"),
            PAIRS,
            True,
        ),
        ({"x1": "unavailable", "y1": "unavailable", "x2": "0"}, PAIRS, False),
        ({"x1": "unknown", "y1": "unknown"}, PAIRS, False),
        ({"x1": "unavailable", "y1": "unknown"}, PAIRS, False),
        ({}, PAIRS, False),
        ({"x1": "unavailable", "y1": "unavailable"}, [], False),
        ({"x1": "unavailable", "y1": "unavailable"}, ["not a pair"], False),
        ({"x1": "unavailable", "y1": "unavailable"}, None, False),
    ],
    ids=[
        "every-state-unavailable",
        "all-unavailable",
        "one-target-reporting",
        "unknown-is-live",
        "unknown-beside-unavailable",
        "no-states",
        "cleared-list",
        "no-ids",
        "no-list",
    ],
)
async def test_radar_offline_when_every_tracked_state_is_unavailable(
    hass, states, pairs, offline
) -> None:
    """Every tracked id with a state is unavailable, and at least one has one."""
    ids = {
        "x1": PAIR_1["x"],
        "y1": PAIR_1["y"],
        "x2": PAIR_2["x"],
        "y2": PAIR_2["y"],
        "x3": PAIR_3["x"],
        "y3": PAIR_3["y"],
    }
    for key, state in states.items():
        hass.states.async_set(ids[key], state)

    assert radar_offline(hass, pairs) is offline
