"""
Every module of the package loads before setup runs, never during it.

Home Assistant imports the package, its config flow and its platforms in its
import executor. A module that only an async function imports is instead read
from disk and executed on the event loop the first time setup runs, which Home
Assistant's loop protection does not report for a relative import.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import custom_components.apollo_mmwave as integration

PACKAGE = Path(integration.__file__).parent
REPO_ROOT = PACKAGE.parents[1]

# Run in a fresh interpreter: this test session has imported every module
# already. It imports what Home Assistant's import executor imports, then
# prints every module of the package that is loaded.
_SCRIPT = """
import importlib
import sys

import custom_components.apollo_mmwave as package

for name in ("config_flow", *(platform.value for platform in package.PLATFORMS)):
    importlib.import_module(f"{package.__name__}.{name}")
print("\\n".join(name for name in sys.modules if name.startswith(package.__name__)))
"""


def test_every_module_is_loaded_with_the_package_and_its_platforms() -> None:
    """No module is left for an async function to import on the event loop."""
    result = subprocess.run(  # noqa: S603 - fixed argv, no shell
        [sys.executable, "-c", _SCRIPT],
        capture_output=True,
        check=True,
        cwd=REPO_ROOT,
        env={**os.environ, "PYTHONPATH": str(REPO_ROOT)},
        text=True,
    )

    loaded = set(result.stdout.split())
    expected = {
        f"{integration.__name__}.{path.stem}"
        for path in PACKAGE.glob("*.py")
        if path.stem != "__init__"
    }
    assert expected
    assert sorted(expected - loaded) == []
