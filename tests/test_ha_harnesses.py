"""
CI tests on two Home Assistant test harnesses.

requirements-test.txt installs pytest-homeassistant-custom-component, which
stops at HA 2026.10. requirements-test-2026.11.txt installs Home Assistant's
own pytest-homeassistant, and tests/compat_2026_11 maps the old package's
imports onto it, so the same suite runs on both.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import homeassistant
import pytest
import yaml
from homeassistant.const import __version__ as ha_version

REPO_ROOT = Path(__file__).resolve().parent.parent
TESTS = REPO_ROOT / "tests"
HARNESS = "requirements-test.txt"
HARNESS_2026_11 = "requirements-test-2026.11.txt"
SHIM_PATH = "tests/compat_2026_11"
OLD_PACKAGE = "pytest_homeassistant_custom_component"
NEW_PACKAGE = "pytest_homeassistant"
EXACT_PIN = re.compile(r"([A-Za-z0-9._-]+)==(\S+)")


def _requirements(name: str) -> dict[str, str | None]:
    """Map each requirement to its exact pin, or None without one."""
    pins: dict[str, str | None] = {}
    for raw in (REPO_ROOT / name).read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        exact = EXACT_PIN.fullmatch(line)
        if exact:
            pins[exact[1].lower()] = exact[2]
        else:
            pins[re.split(r"[\s<>=!~\[;]", line, maxsplit=1)[0].lower()] = None
    return pins


def _yaml(path: str) -> dict[str, Any]:
    return yaml.safe_load((REPO_ROOT / path).read_text(encoding="utf-8"))


def _job_installing(requirements: str) -> dict[str, Any]:
    """Find the one test.yml job that installs this requirements file."""
    install = re.compile(rf"uv pip install -r {re.escape(requirements)}(?:\s|$)")
    jobs = [
        job
        for job in _yaml(".github/workflows/test.yml")["jobs"].values()
        if any(install.search(step.get("run", "")) for step in job["steps"])
    ]
    assert len(jobs) == 1, f"{len(jobs)} test.yml jobs install {requirements}"
    return jobs[0]


def _pytest_step(job: dict[str, Any]) -> dict[str, Any]:
    """Return the pytest step, its env merged over the job's."""
    steps = [step for step in job["steps"] if "pytest tests/" in step.get("run", "")]
    assert len(steps) == 1, f"{len(steps)} steps run pytest tests/ in {job['name']}"
    return {**steps[0], "env": {**job.get("env", {}), **steps[0].get("env", {})}}


def test_2026_11_harness_pins_one_release() -> None:
    """Core's harness and Home Assistant come from one 2026.11 release."""
    pins = _requirements(HARNESS_2026_11)

    assert pins["homeassistant"] is not None
    assert pins["homeassistant"].startswith("2026.11.")
    assert pins["pytest-homeassistant"] == pins["homeassistant"]
    assert pins["home-assistant-frontend"] is not None
    assert "pytest-homeassistant-custom-component" not in pins


def test_2026_11_harness_uses_the_frontend_its_release_pins() -> None:
    """The frontend pin is the one that Home Assistant release names."""
    pins = _requirements(HARNESS_2026_11)
    if pins["homeassistant"] != ha_version:
        pytest.skip(f"Home Assistant {ha_version} is installed, not the 2026.11 pin")

    manifest = Path(homeassistant.__file__).parent / "components/frontend/manifest.json"
    requirements = json.loads(manifest.read_text(encoding="utf-8"))["requirements"]

    assert requirements == [
        f"home-assistant-frontend=={pins['home-assistant-frontend']}"
    ]


def test_both_harnesses_run_in_ci() -> None:
    """test.yml runs the whole suite on each harness, the shim on 2026.11 only."""
    pytest_job = _yaml(".github/workflows/test.yml")["jobs"]["pytest"]
    # Rulesets may require the original check by name.
    assert pytest_job["name"] == "pytest"
    assert _job_installing(HARNESS) == pytest_job

    old = _pytest_step(_job_installing(HARNESS))
    assert SHIM_PATH not in old["env"].get("PYTHONPATH", "")

    new = _pytest_step(_job_installing(HARNESS_2026_11))
    assert new["env"]["PYTHONPATH"].endswith(SHIM_PATH)


def test_dependabot_leaves_the_harness_pins_alone() -> None:
    """Dependabot bumps none of the pins that must move together."""
    pip = next(
        update
        for update in _yaml(".github/dependabot.yml")["updates"]
        if update["package-ecosystem"] == "pip"
    )
    ignored = {rule["dependency-name"] for rule in pip.get("ignore", [])}

    assert {
        "homeassistant",
        "pytest-homeassistant",
        "pytest-homeassistant-custom-component",
        "home-assistant-frontend",
    } <= ignored
    assert set(_requirements(HARNESS)) | set(_requirements(HARNESS_2026_11)) <= ignored


def test_shim_aliases_every_module_the_tests_import() -> None:
    """Each old harness module a test imports has an alias in the shim."""
    imported = {
        match[0]
        for path in TESTS.glob("*.py")
        for match in re.finditer(
            rf"{OLD_PACKAGE}(?:\.\w+)+", path.read_text(encoding="utf-8")
        )
    }
    assert imported

    for module in sorted(imported):
        parts = module.split(".")
        shim = (REPO_ROOT / SHIM_PATH).joinpath(*parts).with_suffix(".py")
        assert shim.is_file(), f"{SHIM_PATH} has no {module}"
        for depth in range(1, len(parts)):
            package = (REPO_ROOT / SHIM_PATH).joinpath(*parts[:depth])
            assert (package / "__init__.py").is_file(), f"{package} needs __init__.py"

        parent = ".".join([NEW_PACKAGE, *parts[1:-1]])
        text = shim.read_text(encoding="utf-8")
        assert f"from {parent} import {parts[-1]}\n" in text
        assert f"sys.modules[__name__] = {parts[-1]}\n" in text


def test_local_2026_11_runs_leave_nothing_to_commit() -> None:
    """The 2026.11 venv and the blueprints its harness writes stay untracked."""
    ignored = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()

    assert ".venv-*" in ignored
    assert "tests/testing_config/" in ignored
