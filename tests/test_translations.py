"""The user-facing text the backend ships follows the product's copy style."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest
import yaml

import custom_components.apollo_mmwave as integration

if TYPE_CHECKING:
    from collections.abc import Iterator

PACKAGE = Path(integration.__file__).parent
EN_JSON = PACKAGE / "translations" / "en.json"
SERVICES_YAML = PACKAGE / "services.yaml"

EM_DASH = "\u2014"
# The product is written "R PRO-1" in display text. "R-PRO-1-W" and
# "R-PRO-1-ETH" are model identifiers, so a hyphen after the 1 is allowed.
HYPHENATED_R_PRO = re.compile(r"R-PRO-1(?!-)")


def _strings(node: Any, path: str = "") -> Iterator[tuple[str, str]]:
    """Yield (path, value) for every string leaf in a JSON or YAML tree."""
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, dict):
        for key, value in node.items():
            yield from _strings(value, f"{path}.{key}" if path else str(key))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _strings(value, f"{path}[{index}]")


def _en_json() -> list[tuple[str, str]]:
    return list(_strings(json.loads(EN_JSON.read_text(encoding="utf-8"))))


def _services_yaml() -> list[tuple[str, str]]:
    return list(_strings(yaml.safe_load(SERVICES_YAML.read_text(encoding="utf-8"))))


@pytest.mark.parametrize(
    "load", [_en_json, _services_yaml], ids=["en.json", "services.yaml"]
)
def test_backend_text_has_no_em_dash_or_hyphenated_r_pro(load) -> None:
    """No translation or service text has an em dash or the R-PRO-1 spelling."""
    strings = load()
    assert strings
    assert [path for path, value in strings if EM_DASH in value] == []
    assert [path for path, value in strings if HYPHENATED_R_PRO.search(value)] == []


def test_r_pro_check_ignores_model_identifiers() -> None:
    """The spelling check flags display text, not the hardware model ids."""
    assert HYPHENATED_R_PRO.search("an MSR-2 or R-PRO-1 with")
    assert not HYPHENATED_R_PRO.search("an MSR-2 or R PRO-1 with")
    assert not HYPHENATED_R_PRO.search("R-PRO-1-W and R-PRO-1-ETH")
