"""
Links into the README from published release notes keep landing where they did.

A GitHub release's notes cannot be changed by a later README, so a heading
renamed after a release keeps an HTML anchor with its old id. Without one, the
old link opens the top of the README.
"""

from __future__ import annotations

from pathlib import Path

import pytest

README = Path(__file__).resolve().parent.parent / "README.md"

# Every README anchor a published release's notes link that no heading makes
# any more, with the heading it lands on.
PUBLISHED_ANCHORS = {
    # 2.2.6 links README#install-with-hacs, from before the heading named the
    # Marketplace.
    "install-with-hacs": "## Install with HACS or the Marketplace",
}


@pytest.mark.parametrize(("anchor", "heading"), sorted(PUBLISHED_ANCHORS.items()))
def test_published_anchors_land_on_their_heading(anchor: str, heading: str) -> None:
    """The old anchor sits once in the README, on its heading."""
    tag = f'<a id="{anchor}"></a>'
    text = README.read_text(encoding="utf-8")
    lines = [line for line in text.splitlines() if tag in line]
    assert len(lines) == 1, f"README.md has {len(lines)} {tag}, not one"
    assert lines[0].replace(tag, "") == heading, f"{tag} is not on {heading!r}"
