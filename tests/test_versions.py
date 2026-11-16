"""The hand-synced version copies agree with manifest.json."""

from __future__ import annotations

import json
import tomllib
from pathlib import Path

from custom_components.apollo_mmwave.const import ENTRY_TITLE

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / "custom_components" / "apollo_mmwave" / "manifest.json"
PYPROJECT = REPO_ROOT / "pyproject.toml"
HACS_JSON = REPO_ROOT / "hacs.json"


def test_pyproject_version_matches_manifest() -> None:
    """pyproject.toml declares the same version Home Assistant reads."""
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    pyproject = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))

    assert pyproject["project"]["version"] == manifest["version"]


def test_listing_and_integration_names_match() -> None:
    """HACS, Devices & services and a new entry all use one name."""
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    hacs = json.loads(HACS_JSON.read_text(encoding="utf-8"))

    assert hacs["name"] == manifest["name"] == ENTRY_TITLE == "Apollo mmWave Dashboard"
