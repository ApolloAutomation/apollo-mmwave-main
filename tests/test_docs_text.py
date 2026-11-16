"""Quoted card text in the README and docs matches what cards show."""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS = [REPO_ROOT / "README.md", *sorted((REPO_ROOT / "docs").glob("*.md"))]

# Cards from 2.4.2 on start the reload notice with the new name.
RENAMED_IN = (2, 4, 2)
NOTICE = re.compile(
    r"\"(Apollo mmWave(?: Dashboard)?) was updated to (\d+)\.(\d+)\.(\d+), "
    r"but this page still runs (\d+)\.(\d+)\.(\d+)\.\""
)


def _flat(path: Path) -> str:
    return re.sub(r"\s+", " ", path.read_text(encoding="utf-8"))


def test_reload_notice_examples_use_the_name_of_the_page_cards() -> None:
    """The page's own cards write the notice, so their version picks the name."""
    found = 0
    for path in DOCS:
        for match in NOTICE.finditer(_flat(path)):
            found += 1
            page = tuple(int(part) for part in match.groups()[4:7])
            expected = (
                "Apollo mmWave Dashboard" if page >= RENAMED_IN else "Apollo mmWave"
            )
            assert match.group(1) == expected, (
                f"{path.name}: a page on {'.'.join(map(str, page))} "
                f"says {expected!r}, not {match.group(1)!r}"
            )
    assert found, "no reload notice example found in the docs"


def test_hacs_warning_maps_marketplace_buttons_beside_the_button_names() -> None:
    """The Marketplace button names follow the HACS ones, not an entry name."""
    text = _flat(REPO_ROOT / "README.md")
    assert (
        "leave **Remove** and **Redownload** (**Uninstall** and **Reinstall** "
        "in the Marketplace) alone on both entries" in text
    )
    assert "Apollo mmWave Dashboard (**Uninstall**" not in text
