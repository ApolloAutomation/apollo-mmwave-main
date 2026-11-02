"""
Exit-aware hold for zone presence, kept free of Home Assistant.

A detect zone with a hold time stays on after the people inside it are lost,
for hold_s from the moment it emptied, unless every one of them is accounted
for first. The LD2450 loses a person who sits still, which is what the hold
is for, but it also loses people who walk out of its view, and a zone that
held for each of those would stay on long after the room emptied. A person is
accounted for by either of two rules, and the zone turns off once nobody is
left unaccounted for:

1. Seen outside: during the first 3 s, a tracked target outside the zone
   within 600 mm, plus 1.6 mm for each millisecond since the zone emptied, of
   where the person was last seen inside. LD2450 slots swap between people,
   so this goes by position, not by slot, and each outside target accounts
   for one person.
2. Walked out: the person was moving when the zone emptied and was last seen
   within 300 mm of the zone's edge or of the edge of the radar's view.

Someone inside again ends the hold: only the people of the last evaluation
that found anyone inside are carried into the next emptying.

The rules work on ``Reading`` objects: one tracked target as presence and the
movement recorder see it, with its slot in the radar's pair list, its position
in millimeters in the raw sensor frame, and the same point rotated into the
map frame by the radar's ``rotation_deg``. ``targets.masked_readings`` builds
them. Nothing here imports Home Assistant and time is passed in, as seconds of
``time.monotonic()``, so the rules can be tested with plain numbers.
"""

from __future__ import annotations

import dataclasses
import math
from dataclasses import dataclass
from itertools import pairwise
from typing import TYPE_CHECKING, Any

from .const import (
    ATTR_CX,
    ATTR_CY,
    ATTR_POINTS,
    ATTR_RX,
    ATTR_RY,
    ATTR_X_MAX,
    ATTR_X_MIN,
    ATTR_Y_MAX,
    ATTR_Y_MIN,
    POLYGON_MIN_POINTS,
    SHAPE_ELLIPSE,
    SHAPE_POLYGON,
    SHAPE_RECT,
)

if TYPE_CHECKING:
    from collections.abc import Callable

# Rule 1: for how long after the zone emptied a target seen outside can
# account for a person, and how far from where they were last seen inside.
# The radius grows with the time a walker needs to get there.
HOLD_REACQUIRE_WINDOW_S = 3.0
HOLD_REACQUIRE_BASE_MM = 600.0
HOLD_REACQUIRE_MM_PER_MS = 1.6
# Rule 2 measures motion between the last position and an anchor taken 0.6
# to 1.2 s before it; the anchor moves on once it is this old.
HOLD_ANCHOR_STEP_S = 0.6
# Evidence older than this is not motion. Home Assistant only reports
# changes, so a person who sat down produces none at all.
HOLD_MOTION_FRESH_S = 1.2
# A previous anchor older than this means the readings were too sparse to
# measure motion, which reads as still: the hold is the safe side.
HOLD_MOTION_WINDOW_S = 1.2
# A target seen inside for less than this counts as moving.
HOLD_FIRST_SEEN_S = 1.2
# After that, moving means this far from the previous anchor.
HOLD_MOVE_MIN_MM = 180.0
# How near an edge a moving person has to be lost to count as walking out.
HOLD_EXIT_MARGIN_MM = 300.0
# The edge of the radar's view: the LD2450's defaults, 6 m and 60 degrees
# either side of straight ahead. The backend knows nothing better, so where
# walls or the radar's own zone filter end the view sooner, a moving exit away
# from the zone's edge holds for the full hold time.
COVERAGE_RANGE_MM = 6000.0
COVERAGE_HALF_FOV_DEG = 60.0
# How long the same half-vanished reading stays one: the second half lands
# about 0.45 s after the first, and someone who really stands on an axis
# line counts after a second.
HALF_VANISH_MAX_S = 1.0


@dataclass(slots=True)
class Reading:
    """One tracked target, unit converted and not inside any ignore zone."""

    # The index in the radar's pair list. LD2450 slots swap between people,
    # so it names a target from one reading to the next, not a person.
    slot: int
    raw: tuple[float, float]  # mm, raw sensor frame
    map: tuple[float, float]  # rotated by rotation_deg
    # The slot's last good reading, standing in for a half-vanished one (see
    # HoldTracker.usable): where the target was, not a new position.
    carried: bool = False


def half_vanished(prev: tuple[float, float] | None, raw: tuple[float, float]) -> bool:
    """Report whether raw is the first of the two writes of a vanishing target."""
    # A target that vanishes reports X = 0 and Y = 0 as two writes, which
    # sometimes land in separate loop turns. The first gives a phantom point,
    # (0, old y) or (old x, 0), that no person occupied: as a hold anchor it
    # fakes motion, and as an outside target it can release the hold at once.
    # So: exactly one coordinate is exactly 0, and that coordinate was not 0
    # in the slot's previous reading. A slot with no previous reading (it
    # read 0/0, or nothing) is appearing, and the first write of an
    # appearance from 0/0, (x, 0) or (0, y), is no more a position than the
    # first write of a vanish.
    x_zero = raw[0] == 0.0
    y_zero = raw[1] == 0.0
    if x_zero == y_zero:
        return False
    if prev is None:
        return True
    return prev[0 if x_zero else 1] != 0.0


@dataclass(slots=True)
class Occupant:
    """A person inside the zone, as the readings of one slot showed them."""

    slot: int
    first_seen: float
    last_t: float  # time of the last evaluation that found this person inside
    last_map: tuple[float, float]
    last_raw: tuple[float, float]
    anchor_t: float
    anchor_map: tuple[float, float]
    prev_anchor_t: float | None = None
    prev_anchor_map: tuple[float, float] | None = None
    # When a carried reading first stood for this person: the first half of
    # a vanish, which is when the zone emptied if the second half follows.
    carried_since: float | None = None

    @classmethod
    def first(cls, reading: Reading, now: float) -> Occupant:
        """Return a person first found inside now."""
        return cls(
            slot=reading.slot,
            first_seen=now,
            last_t=now,
            last_map=reading.map,
            last_raw=reading.raw,
            anchor_t=now,
            anchor_map=reading.map,
        )

    def update(self, reading: Reading, now: float) -> None:
        """Record that this person is still inside, at reading."""
        if now - self.anchor_t >= HOLD_ANCHOR_STEP_S:
            # The previous anchor is then 0.6 to 1.2 s old while readings
            # keep coming.
            self.prev_anchor_t, self.prev_anchor_map = self.anchor_t, self.anchor_map
            self.anchor_t, self.anchor_map = now, reading.map
        self.last_t, self.last_map, self.last_raw = now, reading.map, reading.raw
        self.carried_since = None

    def moving_at(self, t: float) -> bool:
        """Report whether this person was moving at time t."""
        # Home Assistant only reports changes, so a person who sat down
        # produces no events and their last step would otherwise read as
        # motion forever. Old evidence is not motion.
        if t - self.last_t > HOLD_MOTION_FRESH_S:
            return False
        if self.last_t - self.first_seen < HOLD_FIRST_SEEN_S:
            return True
        if (
            self.prev_anchor_t is None
            or self.prev_anchor_map is None
            or self.last_t - self.prev_anchor_t > HOLD_MOTION_WINDOW_S
        ):
            # Too sparse to measure 0.6 to 1.2 s of movement: hold, the safe
            # side.
            return False
        return math.dist(self.last_map, self.prev_anchor_map) >= HOLD_MOVE_MIN_MM


def _number(value: Any) -> float | None:
    # Read a stored bound the way the zone's point test reads it (anything
    # float() takes, see targets.py), so a zone that found someone inside
    # has edges to measure. A bound that is not finite has no edge.
    if value is None:
        return None
    try:
        number = float(value)
    except TypeError, ValueError, OverflowError:
        return None
    return number if math.isfinite(number) else None


def _rect_edge_distance(rect: Any, x: float, y: float) -> float:
    if not isinstance(rect, dict):
        return math.inf
    x_min = _number(rect.get(ATTR_X_MIN))
    x_max = _number(rect.get(ATTR_X_MAX))
    y_min = _number(rect.get(ATTR_Y_MIN))
    y_max = _number(rect.get(ATTR_Y_MAX))
    if x_min is None or x_max is None or y_min is None or y_max is None:
        return math.inf
    if not (x_min < x_max and y_min < y_max):
        return math.inf
    return min(x - x_min, x_max - x, y - y_min, y_max - y)


def _ellipse_edge_distance(ellipse: Any, x: float, y: float) -> float:
    if not isinstance(ellipse, dict):
        return math.inf
    cx = _number(ellipse.get(ATTR_CX))
    cy = _number(ellipse.get(ATTR_CY))
    rx = _number(ellipse.get(ATTR_RX))
    ry = _number(ellipse.get(ATTR_RY))
    if cx is None or cy is None or rx is None or ry is None:
        return math.inf
    if rx <= 0 or ry <= 0:
        return math.inf
    dx = x - cx
    dy = y - cy
    scale = math.hypot(dx / rx, dy / ry)
    if scale == 0:
        return min(rx, ry)
    # Along the ray from the center through the point. On a long ellipse that
    # overstates the distance to the nearest edge, which errs toward holding.
    return math.hypot(dx, dy) * (1 / scale - 1)


def _segment_distance(
    x: float, y: float, start: tuple[float, float], end: tuple[float, float]
) -> float:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(x - start[0], y - start[1])
    # The nearest point of the line, kept between the segment's ends.
    t = ((x - start[0]) * dx + (y - start[1]) * dy) / length_sq
    t = max(0.0, min(1.0, t))
    return math.hypot(x - (start[0] + t * dx), y - (start[1] + t * dy))


def _polygon_edge_distance(polygon: Any, x: float, y: float) -> float:
    if not isinstance(polygon, dict):
        return math.inf
    points = polygon.get(ATTR_POINTS)
    if not isinstance(points, list) or len(points) < POLYGON_MIN_POINTS:
        return math.inf
    vertices: list[tuple[float, float]] = []
    for point in points:
        if not isinstance(point, dict):
            return math.inf
        px = _number(point.get("x"))
        py = _number(point.get("y"))
        if px is None or py is None:
            return math.inf
        vertices.append((px, py))
    return min(
        _segment_distance(x, y, start, end)
        for start, end in pairwise([*vertices, vertices[0]])
    )


_EDGE_DISTANCES: dict[str, Callable[[Any, float, float], float]] = {
    SHAPE_RECT: _rect_edge_distance,
    SHAPE_ELLIPSE: _ellipse_edge_distance,
    SHAPE_POLYGON: _polygon_edge_distance,
}


def edge_distance_mm(shape: Any, data: Any, x: float, y: float) -> float:
    """
    Return how far a point inside a zone is from the zone's edge, in mm.

    Map frame. math.inf for a shape or geometry that cannot be measured, so
    nobody counts as having walked out of it.
    """
    measure = _EDGE_DISTANCES.get(shape) if isinstance(shape, str) else None
    return math.inf if measure is None else measure(data, x, y)


def coverage_edge_distance_mm(x: float, y: float) -> float:
    """
    Return how far a point is from the edge of the radar's view, in mm.

    Raw sensor frame, so the view is straight ahead along +y whatever the
    radar's rotation. 0 for a point outside the view.
    """
    distance = math.hypot(x, y)
    angle = math.degrees(math.atan2(abs(x), y))
    if distance >= COVERAGE_RANGE_MM or angle >= COVERAGE_HALF_FOV_DEG:
        return 0.0
    return min(
        COVERAGE_RANGE_MM - distance,
        distance * math.sin(math.radians(COVERAGE_HALF_FOV_DEG - angle)),
    )


class HoldTracker:
    """One zone's hold: who was inside, and who is not accounted for yet."""

    def __init__(self) -> None:
        """Start with nobody inside and nothing held."""
        # Who was inside at the last evaluation that found anyone inside.
        self.occupants: dict[int, Occupant] = {}
        # Who is not yet accounted for since the zone emptied.
        self.pending: list[Occupant] = []
        # Slots of outside readings already used this empty period.
        self.used_slots: set[int] = set()
        self.empty_since: float | None = None
        # Each slot's raw reading at the previous evaluation.
        self._last_raw: dict[int, tuple[float, float]] = {}
        # Each slot's half-vanished raw reading with when it was first
        # flagged, and its last reading that was not one (see usable).
        self._flagged: dict[int, tuple[tuple[float, float], float]] = {}
        self._good: dict[int, Reading] = {}

    def reset(self) -> None:
        """Forget everyone, which ends any hold."""
        self.occupants = {}
        self.pending = []
        self.used_slots = set()
        self.empty_since = None
        self._last_raw = {}
        self._flagged = {}
        self._good = {}

    @property
    def holding(self) -> bool:
        """Report whether anyone who was inside is still unaccounted for."""
        return bool(self.pending)

    def deadline(self, hold_s: int) -> float | None:
        """Return when the hold ends, or None while nothing is held."""
        if not self.pending or self.empty_since is None:
            return None
        return self.empty_since + hold_s

    def flag_expiry(self) -> float | None:
        """Return when the oldest half-vanished reading would count as real."""
        if not self._flagged:
            return None
        return min(since for _raw, since in self._flagged.values()) + HALF_VANISH_MAX_S

    def usable(self, readings: list[Reading], now: float) -> list[Reading]:
        """
        Return the readings, each half-vanished one carried or dropped.

        A half-vanished reading is nobody's position, so the slot's last good
        reading stands in for it, marked carried: the zone does not empty for
        it, and it is no phantom target outside. A slot with no good reading,
        one appearing in two halves, has nothing to carry and is dropped. The
        same raw reading stays flagged for HALF_VANISH_MAX_S from when it was
        first flagged, however many evaluations other writes start in the
        meantime; after that it is someone on an axis line. Every slot's raw
        reading is remembered for the next evaluation.
        """
        kept: list[Reading] = []
        flagged: dict[int, tuple[tuple[float, float], float]] = {}
        good: dict[int, Reading] = {}
        for reading in readings:
            slot = reading.slot
            flag = self._flagged.get(slot)
            if half_vanished(self._last_raw.get(slot), reading.raw):
                flagged[slot] = (reading.raw, now)
            elif (
                flag is not None
                and flag[0] == reading.raw
                and now - flag[1] < HALF_VANISH_MAX_S
            ):
                flagged[slot] = flag
            else:
                good[slot] = reading
                kept.append(reading)
                continue
            if (last_good := self._good.get(slot)) is not None:
                good[slot] = last_good
                kept.append(dataclasses.replace(last_good, carried=True))
        # A slot with no reading now forgets both.
        self._flagged, self._good = flagged, good
        self._last_raw = {reading.slot: reading.raw for reading in readings}
        return kept

    def step(
        self,
        now: float,
        inside: list[Reading],
        outside: list[Reading],
        shape: Any,
        data: Any,
    ) -> bool:
        """Run one evaluation and report whether the zone reads on."""
        if inside:
            occupants: dict[int, Occupant] = {}
            for reading in inside:
                if (occupant := self._occupant(reading, now)) is not None:
                    occupants[reading.slot] = occupant
            self.occupants = occupants
            self.pending, self.used_slots, self.empty_since = [], set(), None
            return True
        if self.occupants:
            # The zone emptied with this evaluation, or, for people a carried
            # reading stood for, with the first half of their vanish: rule
            # 1's radius, rule 2's freshness and the deadline count from it.
            people = sorted(self.occupants.values(), key=lambda person: person.slot)
            self.occupants, self.used_slots = {}, set()
            self.empty_since = min(
                (
                    person.carried_since
                    for person in people
                    if person.carried_since is not None
                ),
                default=now,
            )
            matched = self._match(people, outside, now)
            # Rule 2 is decided here, once: motion freshness and the last
            # positions are fixed at the emptying, so later evaluations only
            # look for people outside.
            self.pending = [
                person
                for index, person in enumerate(people)
                if index not in matched and not self._exited(person, shape, data)
            ]
            return bool(self.pending)
        if not self.pending:
            return False
        matched = self._match(self.pending, outside, now)
        self.pending = [
            person for index, person in enumerate(self.pending) if index not in matched
        ]
        return bool(self.pending)

    def _occupant(self, reading: Reading, now: float) -> Occupant | None:
        occupant = self.occupants.get(reading.slot)
        if reading.carried:
            # Where someone already inside was: nothing new about them, and
            # nobody new either.
            if occupant is not None and occupant.carried_since is None:
                occupant.carried_since = now
            return occupant
        if occupant is None:
            return Occupant.first(reading, now)
        occupant.update(reading, now)
        return occupant

    def _match(
        self, people: list[Occupant], outside: list[Reading], now: float
    ) -> set[int]:
        # Rule 1, by index into people. A reading stays current until it
        # changes, so each person was inside until the zone emptied: elapsed
        # time counts from empty_since, not from their last reading.
        if self.empty_since is None:
            return set()
        elapsed_s = now - self.empty_since
        if elapsed_s > HOLD_REACQUIRE_WINDOW_S:
            return set()
        limit = HOLD_REACQUIRE_BASE_MM + HOLD_REACQUIRE_MM_PER_MS * elapsed_s * 1000
        # Nearest pair first over every (person, unused outside reading), so a
        # person who walked out keeps their own reading instead of handing it
        # to someone still sitting in the zone.
        candidates = sorted(
            (math.dist(reading.map, person.last_map), index, reading.slot)
            for index, person in enumerate(people)
            for reading in outside
            if reading.slot not in self.used_slots
        )
        matched: set[int] = set()
        for distance, index, slot in candidates:
            if distance > limit:
                break
            if index in matched or slot in self.used_slots:
                continue
            # One outside target accounts for one person.
            matched.add(index)
            self.used_slots.add(slot)
        return matched

    def _exited(self, person: Occupant, shape: Any, data: Any) -> bool:
        # Rule 2, read at the moment the zone emptied.
        if self.empty_since is None or not person.moving_at(self.empty_since):
            return False
        return (
            edge_distance_mm(shape, data, *person.last_map) <= HOLD_EXIT_MARGIN_MM
            or coverage_edge_distance_mm(*person.last_raw) <= HOLD_EXIT_MARGIN_MM
        )
