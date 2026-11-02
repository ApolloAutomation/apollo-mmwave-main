"""
Exit-aware hold for zone presence, kept free of Home Assistant.

A detect zone with a hold time stays on after the people inside it are lost,
for hold_s from the moment it emptied, unless every one of them is accounted
for first. The LD2450 loses a person who sits still, which is what the hold
is for, but it also loses people who walk out of its view, and a zone that
held for each of those would stay on long after the room emptied. A person is
accounted for by either of two rules, and the zone turns off once nobody is
left unaccounted for:

1. Seen outside: during the first 3 s, a target outside the zone within
   600 mm of where the person was last seen inside, plus 1.6 mm for each
   millisecond since the zone emptied, and for each millisecond, up to
   1.2 s, from their last report until then. LD2450 slots swap between
   people, so this goes by position, and each outside target accounts for
   one person.
   Only the person's own slot, or one that had no reading when the zone
   emptied, gets the growing radius: a target the radar was already
   tracking elsewhere then, someone else or a still object, counts only
   within 600 mm.
2. Walked out: the person was moving when the zone emptied and was last
   seen near the zone's edge or the edge of the radar's view, or, walking,
   heading for one: within 300 mm of it, or of a point on their way on
   from their last report along their last step, up to what their speed
   covers from that report to the loss and 0.75 s more, and at most 1.2 m
   on. An edge behind or beside them counts only within 300 mm. Walking
   means two steps in a row of at least 250 mm between their own reports
   0.9 s or more apart, or one step at 850 mm/s or more. The LD2450's jump
   of about 0.5 m in its last report before it loses someone sitting still
   is one slower step, so it holds. Someone first seen inside under 1.2 s
   before counts as moving too, but unless their steps show walking only
   the 300 mm around their last report counts for them, as in 2.4.0b1:
   someone who walks into a couch or bed zone and is lost as they sit
   down is held, and so, often, is someone who walks slowly through a
   zone and out of view that soon.

The numbers are tuned for the LD2450 of an R PRO-1 on firmware 26.10.21.1,
which writes each axis about once a second, Y usually about 0.45 s after X,
so someone needs about two reports of walking in view, or one brisk one, to
count as walking out. Someone inside again ends the hold: only the people of
the last evaluation that found anyone inside are carried into the next
emptying.

On firmware that empties a slot as 0/0, a target vanishes, or appears, with
one axis written before the other. The point in between is nobody's
position, so the slot's last good reading stands in for it, or for an
appearance nothing does (see half_vanished and HoldTracker.usable).

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
from dataclasses import dataclass, field
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
# The LD2450 writes each axis about once a second, so someone can walk for
# that long after their last report before the zone empties: the radius
# also grows with the age of that report, up to this long.
HOLD_REPORT_AGE_MAX_S = 1.2
# Rule 2 measures motion over steps between the person's own reports at
# least this far apart: more than the 0.4 to 0.75 s between an X write and
# a Y write, so each step spans a whole report of both axes, and less than
# the 1.0 to 1.15 s from one report of an axis to the next.
HOLD_ANCHOR_STEP_S = 0.9
# Evidence older than this is not motion. Home Assistant only reports
# changes, so a person who sat down can produce none at all.
HOLD_MOTION_FRESH_S = 1.6
# Steps that do not fit in this long mean the reports were too sparse to
# measure motion, which reads as still: the hold is the safe side. Two steps
# take about 2.1 s, and this leaves room for a report that was skipped.
HOLD_MOTION_WINDOW_S = 3.5
# A target seen inside for less than this counts as moving. Unless its steps
# show walking (below), that is no way on: only HOLD_EXIT_MARGIN_MM around
# its last report counts, so someone lost as they sit down after a short
# walk in is held.
HOLD_FIRST_SEEN_S = 1.2
# After that, moving means two steps in a row of at least this, well past
# the LD2450's jitter of a still target. The radar can jump about 0.5 m in
# the last report before it loses someone sitting still, and one step of
# that size is not walking.
HOLD_MOVE_MIN_MM = 250.0
# One step this fast is walking without the step before it: about twice the
# speed of that pre-loss jump, and a brisk walk out that the radar saw for
# one report only.
HOLD_BRISK_MM_PER_S = 850.0
# How near an edge a moving person has to be lost to count as walking out:
# this, plus, for someone walking and an edge ahead of them along their last
# step, how far they walk at their speed between their last report and the
# loss, and for HOLD_AXIS_LAG_S more, the most by which the axis that report
# did not write can be older (from a Y write to the next X), up to
# HOLD_EXIT_MARGIN_MAX_MM. An edge behind or beside them, and every edge for
# someone moving only by HOLD_FIRST_SEEN_S, gets no more than this.
HOLD_EXIT_MARGIN_MM = 300.0
HOLD_EXIT_MARGIN_MAX_MM = 1500.0
HOLD_AXIS_LAG_S = 0.75
# Rule 2 follows that way on in points this far apart, which come within
# half of it of any edge the way crosses.
HOLD_EXIT_SAMPLE_MM = 100.0
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
    # (0, old y) or (old x, 0), that no person occupied: as a report it
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
    # Each report of this person, oldest first: when their reading changed,
    # and where to in the map and raw frames, for as long as rule 2 can use
    # it. Any write starts an evaluation, so an evaluation is no report of
    # this person.
    reports: list[tuple[float, tuple[float, float], tuple[float, float]]] = field(
        default_factory=list
    )
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
            reports=[(now, reading.map, reading.raw)],
        )

    @property
    def seen_t(self) -> float:
        """Return when this person's reading last changed."""
        return self.reports[-1][0]

    def update(self, reading: Reading, now: float) -> None:
        """Record that this person is still inside, at reading."""
        if reading.raw != self.last_raw:
            self.reports = [
                report
                for report in self.reports
                if now - report[0] <= HOLD_MOTION_WINDOW_S
            ]
            self.reports.append((now, reading.map, reading.raw))
        self.last_t, self.last_map, self.last_raw = now, reading.map, reading.raw
        self.carried_since = None

    def _report_by(
        self, t: float
    ) -> tuple[float, tuple[float, float], tuple[float, float]] | None:
        # The latest report at or before t.
        return next(
            (report for report in reversed(self.reports) if report[0] <= t), None
        )

    def moving_at(self, t: float) -> bool:
        """Report whether this person was moving at time t."""
        # Home Assistant only reports changes, so a person who sat down
        # can produce no events, and their last step would otherwise read
        # as motion forever. Old evidence is not motion.
        if t - self.seen_t > HOLD_MOTION_FRESH_S:
            return False
        if self.last_t - self.first_seen < HOLD_FIRST_SEEN_S:
            return True
        return self._walking()

    def _walking(self) -> bool:
        # Whether this person's last reports show steps of walking.
        seen_t, here, _raw = self.reports[-1]
        before = self._report_by(seen_t - HOLD_ANCHOR_STEP_S)
        if before is None or seen_t - before[0] > HOLD_MOTION_WINDOW_S:
            # Too sparse to measure a step: hold, the safe side.
            return False
        step = math.dist(here, before[1])
        if step < HOLD_MOVE_MIN_MM:
            return False
        if step / (seen_t - before[0]) >= HOLD_BRISK_MM_PER_S:
            return True
        # A still person's last report, when the LD2450 jumps before it
        # loses them, is a step that follows none: walking takes the step
        # before it too.
        earlier = self._report_by(before[0] - HOLD_ANCHOR_STEP_S)
        if earlier is None or seen_t - earlier[0] > HOLD_MOTION_WINDOW_S:
            return False
        return math.dist(before[1], earlier[1]) >= HOLD_MOVE_MIN_MM

    def exit_margin_mm(self, t: float) -> float:
        """Return how near an edge ahead they had to be to walk out, lost at t."""
        seen_t, here, _raw = self.reports[-1]
        before = self._report_by(seen_t - HOLD_ANCHOR_STEP_S)
        if before is None:
            return HOLD_EXIT_MARGIN_MM
        # They walked on at their last step's speed after their last report,
        # whose other axis was written earlier still.
        speed = math.dist(here, before[1]) / (seen_t - before[0])
        return min(
            HOLD_EXIT_MARGIN_MAX_MM,
            HOLD_EXIT_MARGIN_MM + speed * (t - seen_t + HOLD_AXIS_LAG_S),
        )

    def exit_path(
        self, t: float
    ) -> list[tuple[tuple[float, float], tuple[float, float]]]:
        """Return where this person may have walked to, lost at t: map and raw."""
        seen_t, here, here_raw = self.reports[-1]
        path = [(here, here_raw)]
        before = self._report_by(seen_t - HOLD_ANCHOR_STEP_S)
        if before is None or not self._walking():
            # Moving only because they were seen inside for under
            # HOLD_FIRST_SEEN_S: their last step, jitter or someone walking
            # in to sit down, is no way to have walked on.
            return path
        _before_t, before_map, before_raw = before
        step = math.dist(here, before_map)
        # On from their last report the way their last step went, not toward
        # an edge behind or beside them. Each frame moves along its own step,
        # so the view's edge is still measured in the raw frame whatever the
        # rotation. Points HOLD_EXIT_SAMPLE_MM apart come within half of it of
        # any edge the way crosses, also a polygon's, whose distance is
        # unsigned.
        reach = self.exit_margin_mm(t) - HOLD_EXIT_MARGIN_MM
        count = math.ceil(reach / HOLD_EXIT_SAMPLE_MM)
        map_step = (here[0] - before_map[0], here[1] - before_map[1])
        raw_step = (here_raw[0] - before_raw[0], here_raw[1] - before_raw[1])
        for index in range(1, count + 1):
            part = reach * index / count / step
            path.append(
                (
                    (here[0] + map_step[0] * part, here[1] + map_step[1] * part),
                    (
                        here_raw[0] + raw_step[0] * part,
                        here_raw[1] + raw_step[1] * part,
                    ),
                )
            )
        return path


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
        # Slots with a reading when the zone emptied: targets the radar was
        # already tracking elsewhere then (see _match).
        self.tracked_slots: set[int] = set()
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
        self.tracked_slots = set()
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
            self.tracked_slots = {reading.slot for reading in outside}
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
        # Rule 1, by index into people.
        if self.empty_since is None:
            return set()
        elapsed_s = now - self.empty_since
        if elapsed_s > HOLD_REACQUIRE_WINDOW_S:
            return set()
        empty_since = self.empty_since

        def reach(person: Occupant, reading: Reading) -> float:
            if reading.slot != person.slot and reading.slot in self.tracked_slots:
                # A target the radar already tracked elsewhere when the zone
                # emptied, someone else or a still object, is not the person
                # who left unless it is right where they were.
                return HOLD_REACQUIRE_BASE_MM
            # A reading stays current until it changes, so the radius grows
            # from when the zone emptied, and from the person's last report
            # before that for up to HOLD_REPORT_AGE_MAX_S: at a report about
            # once a second, a walker's last report inside can be a second
            # old by the time one outside empties the zone. A report after
            # empty_since, someone else's first half of a vanish, adds none.
            age_s = min(max(0.0, empty_since - person.seen_t), HOLD_REPORT_AGE_MAX_S)
            return (
                HOLD_REACQUIRE_BASE_MM
                + HOLD_REACQUIRE_MM_PER_MS * (elapsed_s + age_s) * 1000
            )

        # Nearest pair first over every (person, unused outside reading)
        # within reach, so a person who walked out keeps their own reading
        # instead of handing it to someone still sitting in the zone.
        candidates = sorted(
            (distance, index, reading.slot)
            for index, person in enumerate(people)
            for reading in outside
            if reading.slot not in self.used_slots
            and (distance := math.dist(reading.map, person.last_map))
            <= reach(person, reading)
        )
        matched: set[int] = set()
        for _distance, index, slot in candidates:
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
        return any(
            edge_distance_mm(shape, data, *point) <= HOLD_EXIT_MARGIN_MM
            or coverage_edge_distance_mm(*raw) <= HOLD_EXIT_MARGIN_MM
            for point, raw in person.exit_path(self.empty_since)
        )
