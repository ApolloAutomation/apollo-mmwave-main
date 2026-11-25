"""
Numbers the ceiling zone map shares with the hold logic.

The card's Test center and edge band is the hold's exit margin, so "at the
edge" on the map is where leaving stops a hold. Its ceiling circle tops out
at the LD2460's top mount range.
"""

from __future__ import annotations

import re
from pathlib import Path

from custom_components.apollo_mmwave import hold

FRONTEND_SRC = Path(__file__).parents[1] / "frontend-src" / "src"


def _ts_number(path: Path, name: str) -> float:
    source = path.read_text(encoding="utf-8")
    match = re.search(rf"export const {name} = ([\d.]+);", source)
    assert match, f"{name} not found in {path.name}"
    return float(match[1])


def test_edge_band_is_the_hold_exit_margin() -> None:
    """Test center and edge marks the edge where leaving ends a hold."""
    ceiling = FRONTEND_SRC / "zone-map" / "ceiling.ts"
    band = _ts_number(ceiling, "TEST_EDGE_BAND_MM")
    assert band == hold.HOLD_EXIT_MARGIN_MM


def test_ceiling_circle_tops_out_at_the_top_mount_range() -> None:
    """The card's largest ceiling circle is the hold's top mount view."""
    top_range = _ts_number(FRONTEND_SRC / "ld2460.ts", "LD2460_TOP_RANGE_MM")
    assert top_range == hold.LD2460_TOP_COVERAGE.range_mm
