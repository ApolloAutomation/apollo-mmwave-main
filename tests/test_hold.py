"""Exit-aware hold: the pure rules, with plain numbers for time and position."""

from __future__ import annotations

import dataclasses
import itertools
import math
from typing import TYPE_CHECKING

import pytest

from custom_components.apollo_mmwave.hold import (
    HOLD_FIRST_SEEN_S,
    HoldTracker,
    Occupant,
    Reading,
    coverage_edge_distance_mm,
    edge_distance_mm,
    half_vanished,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator

# Zone 1 of the entity tests: 2 m wide, from the radar out to 2 m.
RECT = {"x_min": -1000, "x_max": 1000, "y_min": 0, "y_max": 2000}
ELLIPSE = {"cx": 0, "cy": 1000, "rx": 1000, "ry": 500}
TRIANGLE = {"points": [{"x": -1000, "y": 0}, {"x": 1000, "y": 0}, {"x": 0, "y": 2000}]}
# An L: a 2 m by 0.5 m bar along the radar, and a 0.5 m by 2 m bar up its
# left side. (500, 500) is the inner, reflex corner.
L_SHAPE = {
    "points": [
        {"x": 0, "y": 0},
        {"x": 2000, "y": 0},
        {"x": 2000, "y": 500},
        {"x": 500, "y": 500},
        {"x": 500, "y": 2000},
        {"x": 0, "y": 2000},
    ]
}
# Readings 0.35 s apart, X and Y together: a radar reporting far more often
# than the R PRO-1's LD2450, which writes each axis about once a second.
STEP_S = 0.35
# Toward RECT's right edge, 150 mm a step, ending 50 mm from it at 1.75 s.
WALK_TO_RIGHT_EDGE = [(200 + 150 * step, 1000) for step in range(6)]


def _reading(slot: int, x: float, y: float) -> Reading:
    """Return a reading with no rotation, so the raw and map frames agree."""
    return Reading(slot, (x, y), (x, y))


def _polar(distance: float, degrees: float) -> tuple[float, float]:
    """Return the raw point at a distance and an angle right of straight ahead."""
    return (
        distance * math.sin(math.radians(degrees)),
        distance * math.cos(math.radians(degrees)),
    )


def _walked(points: list[tuple[float, float]], step_s: float = STEP_S) -> Occupant:
    """Return slot 0's occupant after readings at points, step_s apart from 0."""
    person = Occupant.first(_reading(0, *points[0]), 0.0)
    for index, point in enumerate(points[1:], start=1):
        person.update(_reading(0, *point), index * step_s)
    return person


# The R PRO-1's LD2450 writes each axis about once a second, Y about 0.45 s
# after X, so the next X lands about 0.62 s after a Y.
X_TO_Y_S = 0.45
Y_TO_X_S = 0.62


def _x_then_y(
    position: Callable[[float], tuple[float, float]], until_s: float
) -> list[tuple[float, float, float, str]]:
    """
    Return (t, x, y, axis written) as presence reads a target, until until_s.

    Both axes at time 0, then X and Y in turn, each written at its own time with
    the target's position then.
    """
    t, (x, y) = 0.0, position(0.0)
    readings = [(t, x, y, "xy")]
    while True:
        t += Y_TO_X_S
        if t > until_s:
            return readings
        x = position(t)[0]
        readings.append((t, x, y, "x"))
        t += X_TO_Y_S
        if t > until_s:
            return readings
        y = position(t)[1]
        readings.append((t, x, y, "y"))


def _followed(
    readings: list[tuple[float, float, float, str]],
) -> Iterator[tuple[float, str, Occupant]]:
    """Feed slot 0's readings to one person, yielding them after each write."""
    t, x, y, _axis = readings[0]
    person = Occupant.first(_reading(0, x, y), t)
    for t, x, y, axis in readings[1:]:
        person.update(_reading(0, x, y), t)
        yield t, axis, person


def _occupied(points: list[tuple[float, float]]) -> HoldTracker:
    """Return a tracker that found people inside at time 0, slots in order."""
    tracker = HoldTracker()
    inside = [_reading(slot, *point) for slot, point in enumerate(points)]
    assert tracker.step(0.0, inside, [], "rect", RECT)
    return tracker


def _walked_in(points: list[tuple[float, float]]) -> HoldTracker:
    """Return a tracker that followed slot 0 inside, STEP_S apart from 0."""
    tracker = HoldTracker()
    for index, point in enumerate(points):
        assert tracker.step(index * STEP_S, [_reading(0, *point)], [], "rect", RECT)
    return tracker


@pytest.mark.parametrize(
    ("point", "expected"),
    [
        ((0, 1000), 1000),
        ((900, 1000), 100),
        ((-950, 1000), 50),
        ((0, 120), 120),
        ((300, 1990), 10),
        ((1000, 1000), 0),
    ],
    ids=["middle", "right", "left", "near", "far", "on-the-edge"],
)
def test_rect_edge_distance(point, expected) -> None:
    """A rectangle's edge is as near as the nearest of its four sides."""
    assert edge_distance_mm("rect", RECT, *point) == pytest.approx(expected)


def test_rect_bounds_stored_as_text_are_measured() -> None:
    """Bounds the point test reads have edges the hold can measure."""
    # Hand-edited or migrated data can hold numbers as strings, which the
    # point test in targets.py takes.
    as_text = {key: str(value) for key, value in RECT.items()}

    assert edge_distance_mm("rect", as_text, 900, 1000) == pytest.approx(100)


def test_ellipse_edge_distance_is_radial() -> None:
    """Measured along the ray from the center, which errs toward holding."""
    # On the axes that is the true distance to the rim.
    assert edge_distance_mm("ellipse", ELLIPSE, 600, 1000) == pytest.approx(400)
    assert edge_distance_mm("ellipse", ELLIPSE, 0, 1300) == pytest.approx(200)
    assert edge_distance_mm("ellipse", ELLIPSE, 1000, 1000) == pytest.approx(0)
    # The center is as far from the rim as the shorter radius.
    assert edge_distance_mm("ellipse", ELLIPSE, 0, 1000) == pytest.approx(500)

    # Off the axes it is the distance to where the ray from the center through
    # the point crosses the rim, which is farther than the nearest rim point.
    point = (600, 1300)
    scale = math.hypot(600 / 1000, 300 / 500)
    crossing = (600 / scale, 1000 + 300 / scale)
    radial = math.dist(point, crossing)
    nearest = min(
        math.dist(point, (1000 * math.cos(angle), 1000 + 500 * math.sin(angle)))
        for angle in (step * math.tau / 7200 for step in range(7200))
    )

    assert edge_distance_mm("ellipse", ELLIPSE, *point) == pytest.approx(radial)
    assert nearest < radial - 10


def test_polygon_edge_distance() -> None:
    """A polygon's edge is the nearest point of any of its sides."""
    assert edge_distance_mm("polygon", TRIANGLE, 0, 400) == pytest.approx(400)
    # Nearest to the slanted sides, from (1000, 0) and (-1000, 0) to (0, 2000).
    slanted = 500_000 / math.hypot(1000, 2000)
    assert edge_distance_mm("polygon", TRIANGLE, 0, 1500) == pytest.approx(slanted)

    # Beside a reflex corner the nearest point of the two sides that meet
    # there is the corner itself, not the foot of a perpendicular on a side's
    # extension, which would be 50 mm away.
    assert edge_distance_mm("polygon", L_SHAPE, 450, 450) == pytest.approx(
        math.hypot(50, 50)
    )
    assert edge_distance_mm("polygon", L_SHAPE, 1500, 300) == pytest.approx(200)


@pytest.mark.parametrize(
    ("shape", "data"),
    [
        ("rect", {**RECT, "x_max": -1000}),
        ("rect", {**RECT, "y_min": None}),
        ("rect", {**RECT, "x_min": "abc"}),
        ("rect", {**RECT, "x_min": float("-inf")}),
        ("rect", None),
        ("ellipse", {**ELLIPSE, "rx": 0}),
        ("ellipse", {**ELLIPSE, "cx": "nan"}),
        ("polygon", {"points": TRIANGLE["points"][:2]}),
        ("polygon", {"points": [*TRIANGLE["points"][:2], [0, 2000]]}),
        ("polygon", {"points": [*TRIANGLE["points"][:2], {"x": 0, "y": "far"}]}),
        ("polygon", {"points": "triangle"}),
        ("none", RECT),
        ("blob", RECT),
        (["rect"], RECT),
    ],
    ids=[
        "rect-inverted",
        "rect-missing-bound",
        "rect-non-numeric",
        "rect-infinite",
        "rect-no-data",
        "ellipse-flat",
        "ellipse-nan",
        "polygon-two-points",
        "polygon-list-point",
        "polygon-non-numeric",
        "polygon-not-a-list",
        "none",
        "unknown-shape",
        "list-shape",
    ],
)
def test_unusable_geometry_has_no_edge(shape, data) -> None:
    """Nobody walks out of a shape that cannot be measured: rule 2 holds."""
    assert edge_distance_mm(shape, data, 0, 1000) == math.inf


@pytest.mark.parametrize(
    ("point", "expected"),
    [
        ((0, 1000), 1000 * math.sin(math.radians(60))),
        ((0, 5800), 200),
        (_polar(3000, 55), 3000 * math.sin(math.radians(5))),
        (_polar(3000, -55), 3000 * math.sin(math.radians(5))),
        ((0, 6000), 0),
        ((0, 6500), 0),
        (_polar(2000, 75), 0),
        (_polar(2000, -75), 0),
        ((300, -200), 0),
    ],
    ids=[
        "near-the-radar",
        "range",
        "angle-right",
        "angle-left",
        "at-the-range",
        "past-the-range",
        "past-the-right-side",
        "past-the-left-side",
        "behind",
    ],
)
def test_coverage_edge_distance(point, expected) -> None:
    """The view ends 6 m out and 60 degrees either side of straight ahead."""
    assert coverage_edge_distance_mm(*point) == pytest.approx(expected, abs=1e-6)


def test_motion_needs_fresh_evidence() -> None:
    """Motion counts only while the readings that show it are recent."""
    walker = _walked([(0, 1000 + 150 * step) for step in range(6)])  # last at 1.75 s
    assert walker.moving_at(1.75)
    assert walker.moving_at(2.9)
    # 1.25 s after the last reading the person may as well have sat down:
    # Home Assistant reports nothing while a reading does not change.
    assert not walker.moving_at(3.0)

    # Fresh readings of someone standing still are no motion either.
    stander = _walked([(0, 1000)] * 6)
    assert not stander.moving_at(1.75)

    # Readings too far apart to measure 0.6 to 1.2 s of movement read as
    # still, which holds the zone.
    sparse = _walked([(0, 1000), (0, 1800), (0, 2600)], step_s=1.5)
    assert not sparse.moving_at(3.0)


def test_jitter_at_one_reading_a_second_is_not_motion() -> None:
    """A still person's reading changes about once a second; jitter is not motion."""
    writes = itertools.count()

    def position(_t: float) -> tuple[float, float]:
        # Up to 40 mm either way on each axis, new at every write.
        index = next(writes)
        return 300 + 40 * math.sin(2.4 * index), 2000 + 40 * math.sin(1.7 * index + 1)

    for t, _axis, person in _followed(_x_then_y(position, 30.0)):
        if t - person.first_seen >= HOLD_FIRST_SEEN_S:
            assert not person.moving_at(t), t


@pytest.mark.xfail(
    strict=True,
    reason="rule 2 is tuned for 0.35 s steps; see the hold retune question",
)
def test_motion_with_x_then_y_half_a_second_later_counts() -> None:
    """Walking at 1.2 m/s reads as moving after a Y write, not only after an X."""

    def position(t: float) -> tuple[float, float]:
        return -1000 + 720 * t, 1000 + 960 * t

    after_y = [
        person.moving_at(t)
        for t, axis, person in _followed(_x_then_y(position, 6.0))
        if axis == "y" and t >= 2.5
    ]

    assert after_y
    assert all(after_y)


def test_first_seen_counts_as_moving() -> None:
    """For its first 1.2 s inside, a target counts as moving, even standing still."""
    blip = Occupant.first(_reading(0, 0, 1000), 10.0)
    assert blip.moving_at(10.0)
    assert blip.moving_at(11.1)

    stander = _walked([(0, 1000)] * 4)  # last at 1.05 s
    assert stander.moving_at(1.05)
    stander.update(_reading(0, 0, 1000), 1.4)
    assert not stander.moving_at(1.4)


@pytest.mark.parametrize(
    ("elapsed_s", "distance", "released"),
    [
        (0.0, 590, True),
        (0.0, 610, False),
        (0.5, 1390, True),
        (0.5, 1410, False),
        (2.0, 3790, True),
        (2.0, 3810, False),
        (3.0, 5390, True),
        (3.1, 100, False),
    ],
)
def test_reacquire_limit_grows_with_elapsed_time(elapsed_s, distance, released) -> None:
    """600 mm, plus 1.6 mm for each millisecond since the zone emptied, for 3 s."""
    tracker = _occupied([(0, 1000)])
    if elapsed_s:
        assert tracker.step(10.0, [], [], "rect", RECT)
    outside = [_reading(1, distance, 1000)]

    on = tracker.step(10.0 + elapsed_s, [], outside, "rect", RECT)

    assert on is not released
    assert tracker.holding is not released


def test_each_outside_target_accounts_for_one_person() -> None:
    """Two people lost together need two targets outside to release the zone."""
    tracker = _occupied([(0, 1000), (300, 1000)])
    assert tracker.step(10.0, [], [], "rect", RECT)

    # Slot 2 is within reach of both and accounts for the nearer one.
    assert tracker.step(10.5, [], [_reading(2, 100, 2100)], "rect", RECT)
    assert [person.slot for person in tracker.pending] == [1]
    # Seen again, it accounts for nobody else.
    assert tracker.step(11.0, [], [_reading(2, 150, 2150)], "rect", RECT)
    assert [person.slot for person in tracker.pending] == [1]

    outside = [_reading(2, 150, 2200), _reading(0, 1200, 1000)]
    assert not tracker.step(11.5, [], outside, "rect", RECT)
    assert tracker.pending == []


def test_matching_is_nearest_first() -> None:
    """Every (person, target) pair is tried nearest first, not person by person."""
    # One sits at (600, 1000), the other stands at the edge, and both leave
    # the zone in one evaluation: the first is lost, the second steps out
    # 150 mm. That reading is within reach of both and goes to the second.
    tracker = _occupied([(600, 1000), (950, 1000)])

    assert tracker.step(10.0, [], [_reading(1, 1100, 1000)], "rect", RECT)
    assert [person.slot for person in tracker.pending] == [0]

    # Nearest first also accounts for everyone it can. Taken person by
    # person, slot 0 would take the reading 400 mm from it, the one slot 1
    # needs, and leave slot 1 with nothing within 600 mm.
    tracker = _occupied([(0, 1000), (500, 1000)])
    outside = [_reading(2, 400, 1000), _reading(3, -500, 1000)]

    assert not tracker.step(10.0, [], outside, "rect", RECT)


def test_rule_two_is_decided_when_the_zone_empties() -> None:
    """Walking out is judged from the moment the zone emptied, once."""
    # Lost 1 s after the last step near the edge: still fresh, so they walked
    # out and nothing is held.
    tracker = _walked_in(WALK_TO_RIGHT_EDGE)
    assert not tracker.step(2.75, [], [], "rect", RECT)
    assert tracker.deadline(60) is None

    # Lost 2 s after it, the motion is stale when the zone empties, so the
    # zone holds. Later evaluations only look for people outside.
    tracker = _walked_in(WALK_TO_RIGHT_EDGE)
    assert tracker.step(3.75, [], [], "rect", RECT)
    assert tracker.step(4.0, [], [], "rect", RECT)
    assert tracker.deadline(60) == pytest.approx(63.75)

    # The same walk lost while still moving, but far from every edge, holds.
    tracker = _walked_in([(x - 575, y) for x, y in WALK_TO_RIGHT_EDGE])
    assert tracker.step(1.75, [], [], "rect", RECT)


def test_someone_inside_again_ends_the_hold() -> None:
    """The people inside now are the only ones a later emptying accounts for."""
    tracker = _occupied([(0, 1000)])
    assert tracker.step(10.0, [], [], "rect", RECT)
    assert tracker.holding

    assert tracker.step(20.0, [_reading(1, 800, 1000)], [], "rect", RECT)
    assert not tracker.holding
    assert tracker.deadline(60) is None
    # They walk out and are accounted for; the person lost before is gone.
    assert not tracker.step(20.3, [], [_reading(1, 1200, 1000)], "rect", RECT)


@pytest.mark.parametrize(
    ("prev", "raw", "expected"),
    [
        ((500, 1000), (0, 1000), True),
        ((500, 1000), (500, 0), True),
        ((500, 1000), (0, 1200), True),
        ((0, 1000), (0, 1200), False),
        ((500, 0), (700, 0), False),
        (None, (0, 1000), True),
        (None, (500, 1000), False),
        ((500, 1000), (600, 1100), False),
        ((500, 1000), (500, 1000), False),
    ],
    ids=[
        "x-landed-first",
        "y-landed-first",
        "x-zeroed-as-y-moved",
        "x-already-zero",
        "y-already-zero",
        "no-previous-reading",
        "no-previous-reading-off-the-axes",
        "moved",
        "unchanged",
    ],
)
def test_half_vanished_needs_one_coordinate_just_zeroed(prev, raw, expected) -> None:
    """One coordinate is exactly 0, and it was not 0 or unread the reading before."""
    assert half_vanished(prev, raw) is expected


def test_half_vanished_reading_is_carried() -> None:
    """The slot's last good reading stands in for a half-written vanish."""
    tracker = HoldTracker()
    first = _reading(0, 500, 1000)
    other = _reading(1, -300, 800)
    assert tracker.usable([first, other], 10.0) == [first, other]

    # Slot 0's X landed in a turn of its own: (0, 1000) is nobody's position.
    half = _reading(0, 0, 1000)
    carried = dataclasses.replace(first, carried=True)
    assert tracker.usable([half, other], 10.2) == [carried, other]
    # Another slot's write evaluates again before the other half lands, and
    # the half is still nobody's position.
    moved = _reading(1, -350, 800)
    assert tracker.usable([half, moved], 10.4) == [carried, moved]

    # A changed Y means someone is on the x = 0 line after all.
    along = _reading(0, 0, 1100)
    assert tracker.usable([along, moved], 10.6) == [along, moved]


def test_a_half_that_stands_for_a_second_is_someone_on_the_axis() -> None:
    """The same half-vanished reading counts as real once it is a second old."""
    tracker = HoldTracker()
    first = _reading(0, 500, 1000)
    tracker.usable([first], 10.0)
    on_the_line = _reading(0, 0, 1000)
    carried = dataclasses.replace(first, carried=True)

    assert tracker.usable([on_the_line], 10.1) == [carried]
    assert tracker.usable([on_the_line], 11.0) == [carried]
    assert tracker.usable([on_the_line], 11.1) == [on_the_line]


def test_half_an_appearance_is_dropped() -> None:
    """A slot with no good reading has nothing to carry for its first half."""
    tracker = HoldTracker()
    assert tracker.usable([_reading(0, 300, 0)], 10.0) == []
    whole = _reading(0, 300, 2800)
    assert tracker.usable([whole], 10.45) == [whole]


def _evaluate(tracker: HoldTracker, now: float, readings: list[Reading]) -> bool:
    """Run one evaluation of RECT the way presence does, half vanishes and all."""
    inside: list[Reading] = []
    outside: list[Reading] = []
    for reading in tracker.usable(readings, now):
        x, y = reading.map
        within = (
            RECT["x_min"] <= x <= RECT["x_max"] and RECT["y_min"] <= y <= RECT["y_max"]
        )
        (inside if within else outside).append(reading)
    return tracker.step(now, inside, outside, "rect", RECT)


def test_half_a_vanish_moves_nobody_and_the_hold_counts_from_it() -> None:
    """A carried reading keeps the person as they were, and the hold starts at it."""
    tracker = HoldTracker()
    assert _evaluate(tracker, 0.0, [_reading(0, 500, 1000)])

    # X = 0 at 10 s, a turn of its own, and Y = 0 0.45 s later.
    assert _evaluate(tracker, 10.0, [_reading(0, 0, 1000)])
    person = tracker.occupants[0]
    assert (person.last_map, person.last_t) == ((500, 1000), 0.0)
    assert not tracker.holding
    assert _evaluate(tracker, 10.45, [])
    assert tracker.holding
    assert tracker.deadline(60) == pytest.approx(70.0)


def test_a_real_reading_after_a_half_ends_the_carry() -> None:
    """Someone on the x = 0 line after all is lost when they are lost."""
    tracker = HoldTracker()
    assert _evaluate(tracker, 0.0, [_reading(0, 500, 1000)])
    assert _evaluate(tracker, 10.0, [_reading(0, 0, 1000)])
    assert _evaluate(tracker, 10.45, [_reading(0, 0, 1050)])
    assert tracker.occupants[0].last_map == (0, 1050)

    assert _evaluate(tracker, 20.0, [])
    assert tracker.deadline(60) == pytest.approx(80.0)


def test_reset_forgets_everyone() -> None:
    """A dropped hold leaves nothing to account for and no reading to compare."""
    tracker = _occupied([(0, 1000)])
    assert tracker.step(10.0, [], [], "rect", RECT)
    tracker.usable([_reading(0, 500, 1000)], 10.0)

    tracker.reset()

    assert not tracker.holding
    assert tracker.deadline(60) is None
    assert not tracker.step(10.5, [], [], "rect", RECT)
    # No good reading is left to carry for half of a vanish, and none to
    # judge the next reading by: (500, 0) is half of an appearance.
    assert tracker.usable([_reading(0, 500, 0)], 10.5) == []
