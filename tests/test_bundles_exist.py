"""
Every bundle the backend serves is committed under www/.

async_register_frontend_assets only logs a warning for a missing bundle and
skips it, so a bundle renamed in the vite configs and in JS_BUNDLES without the
new file being committed would ship an integration whose dashboard never loads.
"""

from __future__ import annotations

import pytest

from custom_components.apollo_mmwave.const import JS_BUNDLES
from custom_components.apollo_mmwave.frontend import _frontend_path


@pytest.mark.parametrize("name", JS_BUNDLES)
def test_bundle_is_committed(name: str) -> None:
    """The bundle exists as a file in the directory the backend serves from."""
    bundle = _frontend_path() / name
    assert bundle.is_file(), f"{name} is in JS_BUNDLES but missing from {bundle.parent}"
