"""
Tracked LD2450 targets, read the same way by presence and the recorder.

Zone presence and the movement recorder both turn a radar's tracked X/Y
sensor pairs into points, and they must never disagree about one: which
states are a reading, the (0, 0) idle slot, each sensor's own unit, the
radar's rotation and the ignore zones that mask a target. So every rule
lives here once. The zone map card draws targets and zones by the same
rules in TypeScript, so a change here has to be made there too.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Any

from homeassistant.const import (
    ATTR_UNIT_OF_MEASUREMENT,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)

from .const import (
    ATTR_CX,
    ATTR_CY,
    ATTR_DATA,
    ATTR_POINTS,
    ATTR_ROTATION_DEG,
    ATTR_RX,
    ATTR_RY,
    ATTR_SHAPE,
    ATTR_X_MAX,
    ATTR_X_MIN,
    ATTR_Y_MAX,
    ATTR_Y_MIN,
    INPUT_UNIT_FACTORS,
    POLYGON_MIN_POINTS,
    SENSOR_UNIT_FACTORS,
    STORE_INPUT_UNITS,
    STORE_ZONES,
    ZONE_TYPE_IGNORE,
)
from .hold import Reading
from .store import zone_type_of

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator

    from homeassistant.core import HomeAssistant, State

    from .store import ZoneStore

# TODO(REVIEW_REPORT.md X59): this is never used.  # noqa: FIX002, TD003
# The crossing guard in _point_in_polygon already excludes y1 == y2, so its
# `or` fallback never runs. Removing both is output-neutral.
_LINE_INTERSECTION_EPSILON = 1e-12

type ShapeData = Any
type ShapeTester = Callable[[float, float, ShapeData], bool]


# TODO(REVIEW_REPORT.md X13): a copy of the one in  # noqa: FIX002, TD003
# __init__.py, now without its finite and size guard. Share one helper from
# an import-safe module; keep the tester's shape checks (migrated data is raw).
def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except TypeError, ValueError:
        return None


def reading_unit_factor(state: State, fallback: float) -> float:
    """
    Return the millimeters per unit of one target reading.

    Home Assistant hands over the state in the entity's display unit, not the
    millimeters ESPHome reports: inches when the system is set to US customary
    units, or whatever the user picked in the entity's settings. X and Y are
    separate entities, so each is read by its own unit. A sensor with no
    length unit, such as a DIY template sensor, is scaled by `fallback`, the
    device's input unit. Must match `_readingUnitFactor` in
    frontend-src/src/zone-map/card.ts.
    """
    unit = state.attributes.get(ATTR_UNIT_OF_MEASUREMENT)
    if isinstance(unit, str) and unit in SENSOR_UNIT_FACTORS:
        return SENSOR_UNIT_FACTORS[unit]
    return fallback


def build_point_rotator(
    rotation_raw: Any,
) -> Callable[[float, float], tuple[float, float]]:
    """
    Return a function that rotates a target point by the device's rotation_deg.

    Positive degrees swing the device's facing direction toward its right (+X):
    90 maps (x, y) to (y, -x), so a target straight ahead at (0, d) lands at
    (d, 0). Must match `_drawTrackedTargets` / `drawDeviceCone` in
    frontend-src/src/zone-map/card.ts.
    """
    rotation_val = _coerce_float(rotation_raw)
    # A stored inf would make math.cos raise inside async_added_to_hass, leaving
    # an entity with no state that is never retried, and nan would silently stop
    # the zone from ever detecting. Both read as "no rotation", like any other
    # value that is not a number.
    if rotation_val is None or not math.isfinite(rotation_val):
        cos_theta = 1.0
        sin_theta = 0.0
    else:
        rotation_rad = math.radians(rotation_val)
        cos_theta = math.cos(rotation_rad)
        sin_theta = math.sin(rotation_rad)

    def rotate(x_val: float, y_val: float) -> tuple[float, float]:
        return (
            x_val * cos_theta + y_val * sin_theta,
            -x_val * sin_theta + y_val * cos_theta,
        )

    return rotate


def _point_in_rect(x_val: float, y_val: float, rect: ShapeData) -> bool:
    if not isinstance(rect, dict):
        return False
    x_min = _coerce_float(rect.get(ATTR_X_MIN))
    x_max = _coerce_float(rect.get(ATTR_X_MAX))
    y_min = _coerce_float(rect.get(ATTR_Y_MIN))
    y_max = _coerce_float(rect.get(ATTR_Y_MAX))
    if x_min is None or x_max is None or y_min is None or y_max is None:
        return False
    if not (x_min < x_max and y_min < y_max):
        return False
    return x_min <= x_val <= x_max and y_min <= y_val <= y_max


def _point_in_ellipse(x_val: float, y_val: float, ellipse: ShapeData) -> bool:
    if not isinstance(ellipse, dict):
        return False
    cx = _coerce_float(ellipse.get(ATTR_CX))
    cy = _coerce_float(ellipse.get(ATTR_CY))
    rx = _coerce_float(ellipse.get(ATTR_RX))
    ry = _coerce_float(ellipse.get(ATTR_RY))
    if cx is None or cy is None or rx is None or ry is None:
        return False
    if rx <= 0 or ry <= 0:
        return False
    # A hand-edited radius so small that its square is 0 would raise here, and
    # masking runs an ignore zone's test inside every zone's evaluation. The
    # card's division gives Infinity or NaN there, which no point is inside.
    rx_sq = rx * rx
    ry_sq = ry * ry
    if rx_sq == 0 or ry_sq == 0:
        return False
    dx = x_val - cx
    dy = y_val - cy
    return (dx * dx) / rx_sq + (dy * dy) / ry_sq <= 1.0


# Even-odd ray cast toward +x. A point exactly on a non-horizontal edge counts
# as a crossing and toggles, while one on a horizontal edge never does, so
# whether a boundary point reads inside depends on which edge it sits on. The
# rect and ellipse tests are inclusive on every boundary. Only a reading that
# lands exactly on an edge is affected; interior points are unambiguous.
def _point_in_polygon(x_val: float, y_val: float, polygon: ShapeData) -> bool:
    if not isinstance(polygon, dict):
        return False
    points = polygon.get(ATTR_POINTS)
    if not isinstance(points, list) or len(points) < POLYGON_MIN_POINTS:
        return False
    inside = False
    point_count = len(points)
    for idx in range(point_count):
        point_a = points[idx]
        point_b = points[(idx + 1) % point_count]
        if not isinstance(point_a, dict) or not isinstance(point_b, dict):
            return False
        x1 = _coerce_float(point_a.get("x"))
        y1 = _coerce_float(point_a.get("y"))
        x2 = _coerce_float(point_b.get("x"))
        y2 = _coerce_float(point_b.get("y"))
        if x1 is None or y1 is None or x2 is None or y2 is None:
            return False
        if (y1 > y_val) != (y2 > y_val):
            denominator = (y2 - y1) or _LINE_INTERSECTION_EPSILON
            x_at_y = x1 + (x2 - x1) * (y_val - y1) / denominator
            if x_at_y >= x_val:
                inside = not inside
    return inside


SHAPE_TESTERS: dict[str, ShapeTester] = {
    "rect": _point_in_rect,
    "ellipse": _point_in_ellipse,
    "polygon": _point_in_polygon,
}


def shape_tester(zone_def: Any) -> ShapeTester | None:
    """Return the point test for a zone's shape, or None for no usable shape."""
    if not isinstance(zone_def, dict):
        return None
    shape = zone_def.get(ATTR_SHAPE)
    # A hand-edited list shape is unhashable, so a bare .get() would raise.
    # Masking tests every ignore zone of the radar inside every zone's
    # evaluation, so one such zone would break presence for the whole radar.
    return SHAPE_TESTERS.get(shape) if isinstance(shape, str) else None


def fallback_factor(store: ZoneStore, device_id: str) -> float:
    """Return the millimeters per unit of a reading that has no length unit."""
    # The device's input unit, which absent means millimeters, as does a unit
    # the service would refuse. Read through `devices`: a read mints nothing.
    units = (store.devices.get(device_id) or {}).get(STORE_INPUT_UNITS)
    return INPUT_UNIT_FACTORS.get(units, 1.0) if isinstance(units, str) else 1.0


def pair_ids(pairs: Any) -> list[str]:
    """Return every X and Y entity id of a pair list once, in list order."""
    # Pairs can share an entity (one X with two Ys, or X and Y the same
    # entity). Home Assistant registers a listener once per listed id, so a
    # repeat would dispatch every state change of that entity twice.
    if not isinstance(pairs, list):
        return []
    return list(
        dict.fromkeys(
            entity_id
            for pair in pairs
            if isinstance(pair, dict)
            for entity_id in (pair.get("x"), pair.get("y"))
            if isinstance(entity_id, str)
        )
    )


def read_point(
    hass: HomeAssistant, x_id: str, y_id: str, fallback: float
) -> tuple[float, float] | None:
    """
    Return one target's position in millimeters, raw sensor frame, or None.

    None when either state is missing, unknown, unavailable or not a finite
    number, and for the (0, 0) the radar reports for an empty slot.
    """
    x_state = hass.states.get(x_id)
    y_state = hass.states.get(y_id)
    if x_state is None or y_state is None:
        return None
    if x_state.state in (STATE_UNKNOWN, STATE_UNAVAILABLE) or y_state.state in (
        STATE_UNKNOWN,
        STATE_UNAVAILABLE,
    ):
        return None
    try:
        x_val = float(x_state.state)
        y_val = float(y_state.state)
    except TypeError, ValueError:
        return None
    # Ignore origin (0,0) so default or uninitialized readings are skipped.
    if x_val == 0.0 and y_val == 0.0:
        return None
    # Zone geometry is millimeters, so each reading is converted by its own
    # unit (see `reading_unit_factor`). The device's input unit is only the
    # fallback for a sensor with no length unit; absent means millimeters. The
    # card converts the same way before drawing, or a target it shows inside a
    # zone would read "off" here.
    x_mm = x_val * reading_unit_factor(x_state, fallback)
    y_mm = y_val * reading_unit_factor(y_state, fallback)
    # nan and inf lie inside no zone, and the recorder rounds what it keeps,
    # which raises on inf. A huge finite number in a large unit overflows to
    # inf too, so this checks the converted values.
    if not (math.isfinite(x_mm) and math.isfinite(y_mm)):
        return None
    return x_mm, y_mm


def iter_slot_points(
    hass: HomeAssistant, pairs: Any, fallback: float
) -> Iterator[tuple[int, float, float]]:
    """
    Yield (slot, x_mm, y_mm) for every pair that has a reading, raw frame.

    The slot is the pair's index in the list, kept when another pair has no
    reading, so the same target keeps the same slot from one reading to the
    next. The card numbers its dots by it and the recorder stores it.
    """
    if not isinstance(pairs, list):
        return
    for slot, pair in enumerate(pairs):
        if not isinstance(pair, dict):
            continue
        x_id = pair.get("x")
        y_id = pair.get("y")
        if not (isinstance(x_id, str) and isinstance(y_id, str)):
            continue
        point = read_point(hass, x_id, y_id, fallback)
        if point is not None:
            yield slot, point[0], point[1]


def masked_readings(
    hass: HomeAssistant, store: ZoneStore, device_id: str, pairs: Any
) -> list[Reading]:
    """
    Return the radar's readings that no ignore zone masks.

    Each is unit converted and rotated into the map frame, where zones are
    drawn. A target inside any ignore zone of the radar is left out, so no
    detect zone and no recorder sees it.
    """
    device = store.devices.get(device_id) or {}
    rotate = build_point_rotator(device.get(ATTR_ROTATION_DEG))
    ignore = [
        (tester, zone_def.get(ATTR_DATA))
        for zone_def in (device.get(STORE_ZONES) or {}).values()
        if zone_type_of(zone_def) == ZONE_TYPE_IGNORE
        and (tester := shape_tester(zone_def)) is not None
    ]
    readings: list[Reading] = []
    fallback = fallback_factor(store, device_id)
    for slot, x_mm, y_mm in iter_slot_points(hass, pairs, fallback):
        map_x, map_y = rotate(x_mm, y_mm)
        if any(inside(map_x, map_y, data) for inside, data in ignore):
            continue
        readings.append(Reading(slot, (x_mm, y_mm), (map_x, map_y)))
    return readings


def radar_offline(hass: HomeAssistant, pairs: Any) -> bool:
    """
    Report whether the radar is offline, judged by its tracked targets.

    Offline: the pair list names at least one entity, and every named entity
    that has a state is unavailable. An id with no state says nothing about
    the radar (a configured sensor that was removed, or one not set up yet),
    so a list of those alone, like an empty list, is not offline. `unknown`
    is a live state.
    """
    states = [
        state
        for entity_id in pair_ids(pairs)
        if (state := hass.states.get(entity_id)) is not None
    ]
    return bool(states) and all(state.state == STATE_UNAVAILABLE for state in states)
