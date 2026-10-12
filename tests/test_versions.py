"""The hand-synced version copies agree with manifest.json."""

from __future__ import annotations

import json
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / "custom_components" / "apollo_mmwave" / "manifest.json"
PYPROJECT = REPO_ROOT / "pyproject.toml"


def test_pyproject_version_matches_manifest() -> None:
    """pyproject.toml declares the same version Home Assistant reads."""
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    pyproject = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))

    assert pyproject["project"]["version"] == manifest["version"]
