"""
Mounts: the effective mount, the height correction and the LD2450's view.

Every case comes from frontend-src/test/fixtures/mount-cases.json, which
the card's mounts.ts twins read too.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from custom_components.apollo_mmwave import const, hold, mounts, targets

CASES = json.loads(
    (
        Path(__file__).parent.parent
        / "frontend-src"
        / "test"
        / "fixtures"
        / "mount-cases.json"
    ).read_text()
)


def _geom(fields: dict) -> mounts.MountGeometry:
    return mounts.MountGeometry(**fields)


def _fields(geom: mounts.MountGeometry) -> dict:
    return {
        "tracker": geom.tracker,
        "mount": geom.mount,
        "source": geom.source,
        "height_mm": geom.height_mm,
        "tilt_deg": geom.tilt_deg,
        "target_height_mm": geom.target_height_mm,
        "dz_mm": geom.dz_mm,
        "flip": geom.flip,
    }


@pytest.mark.parametrize("name", sorted(CASES["constants"]))
def test_constants_match_the_shared_cases(name) -> None:
    """const.py holds the values the card's mounts.ts must hold."""
    assert getattr(const, name) == CASES["constants"][name]


def test_mounts_list_wall_high_and_ceiling() -> None:
    """The service takes all three; wall is first, the default."""
    assert const.MOUNTS == ("wall", "high", "ceiling")


@pytest.mark.parametrize("case", CASES["mount"])
def test_mount_rule(case) -> None:
    """A saved value that is not exactly high or ceiling counts as none."""
    saved = case["saved"] if case["saved"] in ("high", "ceiling") else None
    expect = case["expect"]
    assert mounts.mount_rule(case["tracker"], case["mode_state"], saved) == (
        expect["mount"],
        expect["source"],
    )


@pytest.mark.parametrize("case", CASES["mount"])
def test_mount_geometry_reads_the_saved_mount_from_the_entry(case) -> None:
    """mount_geometry validates the stored mount the same way."""
    entry = {"mount": case["saved"]} if case["saved"] is not None else {}
    geom = mounts.mount_geometry(case["tracker"], case["mode_state"], entry)
    assert (geom.mount, geom.source) == (
        case["expect"]["mount"],
        case["expect"]["source"],
    )


@pytest.mark.parametrize("case", CASES["geometry"])
def test_mount_geometry(case) -> None:
    """Out of range and wrong types read as defaults; dz never under 500."""
    geom = mounts.mount_geometry(case["tracker"], case["mode_state"], case["entry"])
    assert _fields(geom) == case["expect"]


@pytest.mark.parametrize("case", CASES["floor"])
def test_floor_point(case) -> None:
    """Within 0.1 mm of the shared numbers."""
    point = mounts.floor_point(_geom(case["geometry"]), case["x"], case["y"])
    assert point == pytest.approx(tuple(case["expect"]), abs=0.1)


@pytest.mark.parametrize("case", CASES["footprint"])
def test_footprint(case) -> None:
    """Near and far edge, width, and the outline's size and ends."""
    view = mounts.footprint(_geom(case["geometry"]))
    expect = case["expect"]
    if expect is None:
        assert view is None
        return
    assert view is not None
    assert view.y_near == pytest.approx(expect["y_near"], abs=1)
    assert view.y_far == pytest.approx(expect["y_far"], abs=1)
    assert len(view.outline) == expect["points"]
    assert view.outline[0] == pytest.approx(tuple(expect["first"]), abs=1)
    assert view.outline[-1] == pytest.approx(tuple(expect["last"]), abs=1)
    for forward, width in expect["widths"]:
        right = mounts.half_width_mm(case["geometry"]["dz_mm"], forward)
        assert right == pytest.approx(width, abs=1)


@pytest.mark.parametrize("case", CASES["edge"])
def test_coverage_edge_distance(case) -> None:
    """The hold's edge of view: 0 outside, else the distance to the edge."""
    coverage = mounts.coverage_for(_geom(case["geometry"]))
    distance = hold.coverage_edge_distance_mm(case["x"], case["y"], coverage)
    assert distance == pytest.approx(case["expect"]["edge_mm"], abs=0.5)
    assert (distance > 0) == case["expect"]["inside"]


@pytest.mark.parametrize("case", CASES["coverage_zone"])
def test_coverage_zone_outline(case) -> None:
    """The card's coverage zone: 15 steps a side is 32 points."""
    outline = mounts.coverage_zone_outline(_geom(case["geometry"]), case["steps"])
    assert len(outline) == const.POLYGON_MAX_POINTS
    for point, expected in zip(outline, case["expect"], strict=True):
        assert point == pytest.approx(tuple(expected), abs=0.1)


def test_tilt_never_moves_a_point() -> None:
    """Only height and person height place someone; tilt is coverage."""
    entry = {"mount": "high", "mount_height_mm": 2500}
    points = {
        mounts.floor_point(
            mounts.mount_geometry("ld2450", None, {**entry, "tilt_deg": tilt}),
            300,
            2000,
        )
        for tilt in (0, 15, 45, 60)
    }
    assert len(points) == 1


def test_high_corrects_the_spec_table() -> None:
    """2.2 m up, person 1 m: reported y is sqrt(Y^2 + 1.2^2)."""
    geom = mounts.mount_geometry("ld2450", None, {"mount": "high"})
    for forward in (500, 1000, 2000, 3000, 5000):
        reported = math.hypot(forward, 1200)
        assert mounts.floor_point(geom, 0, reported)[1] == pytest.approx(forward)


def test_flip_mirrors_the_ceiling_outline() -> None:
    """Flip room side puts the whole strip on the other side."""
    plain = mounts.footprint(
        mounts.mount_geometry("ld2450", None, {"mount": "ceiling"})
    )
    flipped = mounts.footprint(
        mounts.mount_geometry(
            "ld2450", None, {"mount": "ceiling", "flip_room_side": True}
        )
    )
    assert plain is not None
    assert flipped is not None
    assert sorted(plain.outline) == sorted((x, -y) for x, y in flipped.outline)
    assert all(y <= 0 for _x, y in flipped.outline)


def test_ld2460_coverage_is_the_ported_view() -> None:
    """Wall cone, or the ceiling circle sized by the ceiling height."""
    wall = mounts.mount_geometry("ld2460", "side", {"mount": "ceiling"})
    assert mounts.coverage_for(wall) == hold.SIDE_COVERAGE
    top = mounts.mount_geometry("ld2460", "top", {"ceiling_height_mm": 2000})
    assert mounts.coverage_for(top) == hold.Coverage(
        mounts.ceiling_radius_mm(2000), 180.0
    )


@pytest.mark.parametrize("flip", [False, True])
@pytest.mark.parametrize("turn", [0, 30, 90, 180, -45])
def test_someone_on_the_wall_line_is_in_the_coverage_zone(flip, turn) -> None:
    """The card's zone, turned and rounded, takes in the line under the radar."""
    geom = mounts.mount_geometry(
        "ld2450", None, {"mount": "ceiling", "flip_room_side": flip}
    )
    rotate = targets.build_point_rotator(turn)
    zone = {
        "points": [
            {"x": math.floor(mx + 0.5), "y": math.floor(my + 0.5)}
            for mx, my in (rotate(x, y) for x, y in mounts.coverage_zone_outline(geom))
        ]
    }
    inside = targets.shape_tester({"shape": "polygon"})
    assert inside is not None
    for raw in [(0, 1600), (1000, 1700), (-2000, 1500)]:
        assert inside(*rotate(*mounts.floor_point(geom, *raw)), zone)
