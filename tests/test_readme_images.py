"""
The README's images stay as the published releases showed them.

HACS and the Marketplace show the README of the release, and that README
loads its images from main (raw.githubusercontent.com/.../main/docs/images/).
A file re-rendered in place on main therefore shows readers of an older
release features their version does not have, so a new render gets a new
name and the README of the next release links that name instead.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
README = REPO_ROOT / "README.md"
IMAGES_DIR = REPO_ROOT / "docs" / "images"
IMAGE_URL = re.compile(
    r"https://raw\.githubusercontent\.com/ApolloAutomation/apollo-mmwave-main/"
    r"([^/)\s]+)/docs/images/([^)\s]+)"
)

# Every image the README of a published release (2.2.6, 2.2.7 and 2.3.0)
# links, with the SHA-256 of the file as those releases were tagged. When a
# release is published, add the images its README links that are not here.
PUBLISHED_IMAGES = {
    "apollo-mmwave-calibrate.gif": (
        "f64abc2629ceefd56ec0979757ebc842a58c112155b0f685cb893e008ba4d31a"
    ),
    "apollo-mmwave-gate-energy.gif": (
        "3a684039108cbd5288012d3279faf83cf6f3e9c7b2f6468423e17d8e51217201"
    ),
    "apollo-mmwave-zone-map.png": (
        "1604951e49fa7bd69d0fe8dbd49d48fa1329d64c3426df65c378449bacef306a"
    ),
}


@pytest.mark.parametrize(("name", "digest"), sorted(PUBLISHED_IMAGES.items()))
def test_published_readme_images_are_unchanged(name: str, digest: str) -> None:
    """A file a published README shows keeps the content it was released with."""
    path = IMAGES_DIR / name
    assert path.is_file(), f"{name} is gone, and a published README links it"
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, (
        f"{name} changed since its release: put the new render under a new name"
    )


def test_readme_images_load_from_main_and_exist() -> None:
    """Each image the README links is on main under docs/images."""
    links = IMAGE_URL.findall(README.read_text(encoding="utf-8"))
    assert links, "README.md links no images under docs/images"
    for ref, name in links:
        assert ref == "main", f"{name} loads from {ref}, not main"
        assert (IMAGES_DIR / name).is_file(), f"README.md links missing {name}"
