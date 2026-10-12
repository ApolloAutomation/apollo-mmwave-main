"""
Strings the Python backend and the TypeScript frontend must spell alike.

Each check is a literal search in a file read relative to the repo root, so a
rename on either side fails here instead of silently breaking detection or the
dashboard. The bundles in www/ are what Home Assistant serves, and CI keeps them
in sync with a fresh build, so the element names are checked there.
"""

from __future__ import annotations

from pathlib import Path

from custom_components.apollo_mmwave import ld2450
from custom_components.apollo_mmwave.const import (
    CARD_TYPE,
    DASHBOARD_STRATEGY_TYPE,
    DOMAIN,
    FRONTEND_DIR,
)

REPO_ROOT = Path(__file__).parents[1]
FRONTEND_SRC = REPO_ROOT / "frontend-src" / "src"
WWW = REPO_ROOT / "custom_components" / DOMAIN / FRONTEND_DIR


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _has_string_literal(source: str, value: str) -> bool:
    """Report whether `value` appears as a whole quoted JS string literal."""
    return f'"{value}"' in source or f"'{value}'" in source


def test_ld2450_target_regexes_match_the_frontend() -> None:
    """ld2450.ts detects LD2450 targets with the same patterns as ld2450.py."""
    source = _read(FRONTEND_SRC / "ld2450.ts")

    assert f"const TARGET_X = /{ld2450.TARGET_X.pattern}/;" in source
    assert f"const TARGET_Y = /{ld2450.TARGET_Y.pattern}/;" in source


def test_dashboard_strategy_element_matches_the_strategy_type() -> None:
    """The tuning bundle registers the element HA loads for the dashboard strategy."""
    # HA resolves strategy type `custom:<name>` to the element
    # `ll-strategy-dashboard-<name>`.
    name = DASHBOARD_STRATEGY_TYPE.removeprefix("custom:")
    assert name != DASHBOARD_STRATEGY_TYPE

    bundle = _read(WWW / "apollo-radar-tuning.js")

    assert _has_string_literal(bundle, f"ll-strategy-dashboard-{name}")


def test_zone_map_card_element_matches_card_type() -> None:
    """The zone map bundle registers the element CARD_TYPE names."""
    # HA resolves card type `custom:<name>` to the custom element `<name>`.
    tag = CARD_TYPE.removeprefix("custom:")
    assert tag != CARD_TYPE

    bundle = _read(WWW / "apollo-radar-zone-map-card.js")

    assert _has_string_literal(bundle, tag)


def test_zone_map_editor_card_type_matches_card_type() -> None:
    """The card editor writes the same card type the backend names."""
    source = _read(FRONTEND_SRC / "zone-map" / "editor.ts")

    assert f'export const ZONE_MAP_CARD_TYPE = "{CARD_TYPE}";' in source
