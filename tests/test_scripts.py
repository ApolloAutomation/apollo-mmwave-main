"""
The developer scripts work from a plain shell after scripts/bootstrap.

scripts/bootstrap installs Home Assistant only into ./.venv, so scripts/develop
has to find hass there even when the caller never activated the venv, and
scripts/help (which the devcontainer prints on start through scripts/motd) has
to describe every script in one aligned column.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = REPO_ROOT / "scripts"
BASH = shutil.which("bash")
# System tools only: nothing on this PATH provides hass.
SYSTEM_PATH = os.pathsep.join(("/usr/bin", "/bin", "/usr/sbin", "/sbin"))
ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*m")
# scripts/help prints each row as two spaces, the name padded to 25 columns,
# one space, then the description.
NAME_COLUMN_END = 2 + 25

pytestmark = pytest.mark.skipif(BASH is None, reason="bash is not installed")


def _run(
    script: Path, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess:
    return subprocess.run(  # noqa: S603 - fixed argv built from repo paths, no shell
        [BASH, str(script)],
        capture_output=True,
        check=False,
        env=env,
        text=True,
        timeout=60,
    )


def _fake_hass(bin_dir: Path) -> None:
    """Write a hass stand-in that echoes its arguments instead of starting HA."""
    bin_dir.mkdir(parents=True)
    hass = bin_dir / "hass"
    hass.write_text('#!/bin/sh\necho "hass $*"\n', encoding="utf-8")
    hass.chmod(0o755)


def _develop_checkout(root: Path) -> Path:
    """Copy scripts/develop into a scratch tree that stands in for the repo."""
    (root / "scripts").mkdir()
    develop = root / "scripts" / "develop"
    shutil.copy2(SCRIPTS / "develop", develop)
    return develop


def test_develop_runs_hass_from_bootstrap_venv(tmp_path) -> None:
    """scripts/develop uses the venv's hass without the caller activating it."""
    develop = _develop_checkout(tmp_path)
    venv = tmp_path / ".venv"
    _fake_hass(venv / "bin")
    # Stand-in for the activate script that `python -m venv` writes.
    (venv / "bin" / "activate").write_text(
        f'VIRTUAL_ENV="{venv}"\nexport VIRTUAL_ENV\n'
        'PATH="$VIRTUAL_ENV/bin:$PATH"\nexport PATH\n',
        encoding="utf-8",
    )

    result = _run(develop, {"PATH": SYSTEM_PATH, "HOME": str(tmp_path)})

    assert result.returncode == 0, result.stderr
    config = f"{tmp_path}/config"
    assert result.stdout.splitlines() == [
        f"hass --config {config} --script ensure_config",
        f"hass --config {config} --debug",
    ]


def test_develop_falls_back_to_hass_on_path(tmp_path) -> None:
    """Without a venv, scripts/develop still runs whatever hass is on PATH."""
    develop = _develop_checkout(tmp_path)
    (tmp_path / "config").mkdir()
    _fake_hass(tmp_path / "bin")
    path = os.pathsep.join((str(tmp_path / "bin"), SYSTEM_PATH))

    result = _run(develop, {"PATH": path, "HOME": str(tmp_path)})

    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines() == [f"hass --config {tmp_path}/config --debug"]


def test_help_describes_every_script_in_one_column() -> None:
    """Every script has a description, and all descriptions line up."""
    result = _run(SCRIPTS / "help")
    assert result.returncode == 0, result.stderr

    rows: dict[str, str] = {}
    for line in ANSI_ESCAPE.sub("", result.stdout).splitlines():
        if line.startswith("  scripts/"):
            rows[line[:NAME_COLUMN_END].strip()] = line[NAME_COLUMN_END:]

    scripts = sorted(
        f"scripts/{path.name}"
        for path in SCRIPTS.iterdir()
        if path.is_file() and os.access(path, os.X_OK)
    )
    assert sorted(rows) == scripts
    for name, rest in rows.items():
        assert rest.startswith(" "), name
        assert rest[1:], name
        assert not rest[1].isspace(), f"{name} description is indented: {rest!r}"
        assert rest[1:] != "No description available", name
    assert rows["scripts/develop"] == " Start Home Assistant with this integration"
