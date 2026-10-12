"""
The developer scripts work from a plain shell after scripts/bootstrap.

scripts/bootstrap installs Home Assistant, ruff and pre-commit only into ./.venv
and needs nothing but a new enough `python`, so scripts/develop has to find hass
there, and scripts/lint and scripts/lint-check have to find ruff there, even
when the caller never activated the venv. scripts/help (which the devcontainer
prints on start through scripts/motd) has to describe every script in one
aligned column.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tomllib
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
BOOTSTRAP_FLOOR = re.compile(r"sys\.version_info >= \((\d+), (\d+), (\d+)\)")
# Stand-in for an interpreter: logs each call, runs bootstrap's own version
# check against a pretend sys.version_info, and fakes `-m venv`.
PYTHON_STUB = """\
echo "$(basename "$0") $*" >> "$LOG"
if [ "$1" = "-c" ]; then
  exec "$REAL_PYTHON" -c \
    "import sys; sys.version_info = $FAKE_VERSION; exec(sys.argv[1])" "$2"
fi
if [ "$1" = "-m" ] && [ "$2" = "venv" ]; then
  mkdir -p "$3/bin"
  : > "$3/bin/activate"
fi
"""
VENV_STEPS = [
    "python -m venv .venv",
    "pip install -r requirements.txt",
    "pre-commit install",
]


def _real_ruff() -> str | None:
    beside = Path(sys.executable).with_name("ruff")
    return str(beside) if beside.is_file() else shutil.which("ruff")


REAL_RUFF = _real_ruff()

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


def _checkout(root: Path, name: str) -> Path:
    """Copy one script into a scratch tree that stands in for the repo."""
    (root / "scripts").mkdir(exist_ok=True)
    script = root / "scripts" / name
    shutil.copy2(SCRIPTS / name, script)
    return script


def _stub(bin_dir: Path, name: str, body: str) -> Path:
    """Write an executable sh stand-in for a tool."""
    bin_dir.mkdir(parents=True, exist_ok=True)
    stub = bin_dir / name
    stub.write_text(f"#!/bin/sh\n{body}", encoding="utf-8")
    stub.chmod(0o755)
    return stub


def _calls(root: Path) -> list[str]:
    """Return the commands the stubs logged, in order."""
    log = root / "calls.log"
    return log.read_text(encoding="utf-8").splitlines() if log.exists() else []


def _bootstrap_env(root: Path, version: tuple[int, int, int]) -> dict[str, str]:
    """
    Put stand-ins for python, pip, pre-commit and pipx ahead of the system PATH.

    The python stand-in reports `version`. There is no uv anywhere on the PATH,
    and the pipx stand-in fails, so a bootstrap that still reached for either
    shows up in the log or the exit code.
    """
    stubs = root / "stubs"
    _stub(stubs, "python", PYTHON_STUB)
    _stub(stubs, "pip", 'echo "pip $*" >> "$LOG"\n')
    _stub(stubs, "pre-commit", 'echo "pre-commit $*" >> "$LOG"\n')
    _stub(stubs, "pipx", 'echo "pipx $*" >> "$LOG"\nexit 1\n')
    return {
        "PATH": os.pathsep.join((str(stubs), SYSTEM_PATH)),
        "HOME": str(root),
        "LOG": str(root / "calls.log"),
        "REAL_PYTHON": sys.executable,
        "FAKE_VERSION": repr(version),
    }


def test_develop_runs_hass_from_bootstrap_venv(tmp_path) -> None:
    """scripts/develop uses the venv's hass without the caller activating it."""
    develop = _checkout(tmp_path, "develop")
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
    develop = _checkout(tmp_path, "develop")
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


def test_bootstrap_floor_matches_requires_python() -> None:
    """scripts/bootstrap refuses exactly what pyproject.toml's requires-python does."""
    bootstrap = (SCRIPTS / "bootstrap").read_text(encoding="utf-8")
    floors = BOOTSTRAP_FLOOR.findall(bootstrap)
    assert len(floors) == 1, floors

    pyproject = tomllib.loads((REPO_ROOT / "pyproject.toml").read_text("utf-8"))
    floor = ".".join(floors[0])
    assert pyproject["project"]["requires-python"] == f">={floor}"
    assert f"Python >= {floor} required" in bootstrap


@pytest.mark.parametrize("version", [(3, 14, 2), (3, 15, 0)])
def test_bootstrap_needs_neither_uv_nor_pipx(tmp_path, version) -> None:
    """With a new enough python, bootstrap builds the venv and touches no uv."""
    bootstrap = _checkout(tmp_path, "bootstrap")

    result = _run(bootstrap, _bootstrap_env(tmp_path, version))

    assert result.returncode == 0, result.stdout + result.stderr
    calls = _calls(tmp_path)
    assert calls[0].startswith("python -c "), calls
    assert calls[1:] == VENV_STEPS


@pytest.mark.parametrize("version", [(3, 12, 3), (3, 14, 1)])
def test_bootstrap_refuses_old_python_before_the_venv(tmp_path, version) -> None:
    """An interpreter below requires-python stops bootstrap with a clear reason."""
    bootstrap = _checkout(tmp_path, "bootstrap")

    result = _run(bootstrap, _bootstrap_env(tmp_path, version))

    assert result.returncode == 1
    assert "Python >= 3.14.2 required" in result.stderr
    assert [call.split(" ")[:2] for call in _calls(tmp_path)] == [["python", "-c"]]
    assert not (tmp_path / ".venv").exists()


def test_bootstrap_uses_the_python_override(tmp_path) -> None:
    """PYTHON picks the interpreter when `python` on PATH is the wrong one."""
    bootstrap = _checkout(tmp_path, "bootstrap")
    env = _bootstrap_env(tmp_path, (3, 14, 2))
    _stub(tmp_path / "stubs", "python", 'echo "wrong-python $*" >> "$LOG"\nexit 1\n')
    env["PYTHON"] = str(_stub(tmp_path / "alt", "python3.14", PYTHON_STUB))

    result = _run(bootstrap, env)

    assert result.returncode == 0, result.stdout + result.stderr
    calls = _calls(tmp_path)
    assert calls[0].startswith("python3.14 -c "), calls
    assert calls[1:] == ["python3.14 -m venv .venv", *VENV_STEPS[1:]]


@pytest.mark.parametrize(
    ("script", "expected"),
    [
        ("lint-check", ["ruff format . --check", "ruff check ."]),
        # Fixes first, so the formatter sees the code it has to leave formatted.
        ("lint", ["ruff check . --fix-only", "ruff format .", "ruff check ."]),
    ],
)
def test_lint_scripts_run_the_venv_ruff_without_uv(tmp_path, script, expected) -> None:
    """Both lint scripts run the venv's ruff from a PATH with no uv on it."""
    path = _checkout(tmp_path, script)
    _stub(tmp_path / ".venv" / "bin", "ruff", 'echo "ruff $*" >> "$LOG"\n')
    env = {
        "PATH": SYSTEM_PATH,
        "HOME": str(tmp_path),
        "LOG": str(tmp_path / "calls.log"),
    }

    result = _run(path, env)

    assert result.returncode == 0, result.stdout + result.stderr
    assert _calls(tmp_path) == expected


@pytest.mark.parametrize("script", ["lint", "lint-check"])
def test_lint_scripts_without_bootstrap_say_so(tmp_path, script) -> None:
    """With no venv ruff, the lint scripts point at scripts/bootstrap."""
    path = _checkout(tmp_path, script)

    result = _run(path, {"PATH": SYSTEM_PATH, "HOME": str(tmp_path)})

    assert result.returncode == 1
    assert "run scripts/bootstrap first" in result.stderr


@pytest.mark.skipif(REAL_RUFF is None, reason="ruff is not installed")
def test_lint_leaves_nothing_for_lint_check(tmp_path) -> None:
    """A fix that lets a wrapped call fit on one line is formatted in the same pass."""
    lint = _checkout(tmp_path, "lint")
    lint_check = _checkout(tmp_path, "lint-check")
    (tmp_path / ".venv" / "bin").mkdir(parents=True)
    (tmp_path / ".venv" / "bin" / "ruff").symlink_to(REAL_RUFF)
    (tmp_path / "pyproject.toml").write_text(
        '[tool.ruff.lint]\nselect = ["F541"]\n', encoding="utf-8"
    )
    # 89 columns, so the formatter wraps it; the F541 fix drops the f prefix
    # and the call fits the 88 column limit again.
    sample = tmp_path / "sample.py"
    sample.write_text('print(f"' + "x" * 79 + '")\n', encoding="utf-8")
    env = {"PATH": SYSTEM_PATH, "HOME": str(tmp_path)}

    linted = _run(lint, env)
    assert linted.returncode == 0, linted.stdout + linted.stderr
    checked = _run(lint_check, env)

    assert checked.returncode == 0, checked.stdout + checked.stderr
    assert sample.read_text(encoding="utf-8") == 'print("' + "x" * 79 + '")\n'


def test_requirements_pin_ruff_once() -> None:
    """lint.yml installs ruff from the single `ruff==` pin in requirements.txt."""
    lines = (REPO_ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines()
    pins = [line for line in lines if line.startswith("ruff==")]
    assert len(pins) == 1, pins
    assert re.fullmatch(r"ruff==\d+(?:\.\d+)+", pins[0]), pins[0]
