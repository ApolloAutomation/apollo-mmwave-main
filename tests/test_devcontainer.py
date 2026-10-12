"""
The devcontainer can bootstrap the project it is meant to develop.

Dependabot's devcontainers ecosystem only bumps Features, never the base image,
so nothing else notices when requires-python moves past the image's interpreter
and the pip install in scripts/bootstrap stops resolving.
"""

from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent


def _devcontainer() -> dict[str, Any]:
    return json.loads((REPO_ROOT / ".devcontainer.json").read_text(encoding="utf-8"))


def test_devcontainer_image_satisfies_requires_python() -> None:
    """The image's Python minor version is at least the project's floor."""
    image = _devcontainer()["image"]
    tag = re.fullmatch(
        r"mcr\.microsoft\.com/devcontainers/python:(\d+)\.(\d+)(?:-[a-z]+)?", image
    )
    assert tag, f"unexpected devcontainer image {image!r}"

    pyproject = tomllib.loads((REPO_ROOT / "pyproject.toml").read_text("utf-8"))
    requires = pyproject["project"]["requires-python"]
    floor = re.fullmatch(r">=(\d+)\.(\d+)(?:\.\d+)?", requires)
    assert floor, f"unexpected requires-python {requires!r}"

    # A minor-version tag tracks the newest patch release, so only the
    # major.minor pair can be checked here.
    image_version = (int(tag[1]), int(tag[2]))
    floor_version = (int(floor[1]), int(floor[2]))
    assert image_version >= floor_version


def test_devcontainer_interpreter_is_bootstrap_venv() -> None:
    """VS Code uses the venv scripts/bootstrap installs into."""
    bootstrap = (REPO_ROOT / "scripts" / "bootstrap").read_text(encoding="utf-8")
    assert "python -m venv .venv" in bootstrap

    settings = _devcontainer()["customizations"]["vscode"]["settings"]
    assert (
        settings["python.defaultInterpreterPath"]
        == "${containerWorkspaceFolder}/.venv/bin/python"
    )
