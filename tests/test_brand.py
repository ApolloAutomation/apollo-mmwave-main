"""
The integration ships its own brand icons.

Home Assistant 2026.3 and later serves a custom integration's brand/ images at
/api/brands/integration/<domain>/<image>, so the integrations page shows the
Apollo icon instead of a placeholder. It serves only the file names in
ALLOWED_IMAGES, and only when the loader finds a brand folder.
"""

from __future__ import annotations

import struct
from pathlib import Path

import pytest
from homeassistant.components.brands.const import ALLOWED_IMAGES
from homeassistant.loader import async_get_integration

from custom_components.apollo_mmwave.const import DOMAIN

BRAND_DIR = (
    Path(__file__).resolve().parent.parent / "custom_components" / DOMAIN / "brand"
)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
ICONS = [("icon.png", 256), ("icon@2x.png", 512)]


def _png_size(path: Path) -> tuple[int, int]:
    """Return a PNG's width and height, read from its IHDR chunk."""
    with path.open("rb") as file:
        header = file.read(24)
    assert header[:8] == PNG_SIGNATURE, f"{path.name} is not a PNG"
    # The first chunk is always IHDR: a 4-byte length (13), the type, then
    # the width and height as big-endian 32-bit integers.
    length, chunk_type, width, height = struct.unpack(">I4sII", header[8:24])
    assert (length, chunk_type) == (13, b"IHDR"), f"{path.name} has no IHDR first"
    return width, height


@pytest.mark.parametrize(("name", "size"), ICONS)
def test_brand_icon_is_a_square_png(name: str, size: int) -> None:
    """Each icon is a PNG of the size Home Assistant expects."""
    path = BRAND_DIR / name
    assert path.is_file(), f"{name} is missing from {BRAND_DIR}"
    assert _png_size(path) == (size, size)


def test_brand_images_are_ones_home_assistant_serves() -> None:
    """Every PNG in brand/ has a name the brands view will serve."""
    names = {path.name for path in BRAND_DIR.glob("*.png")}
    assert names == {name for name, _ in ICONS}
    assert names <= ALLOWED_IMAGES


async def test_loader_finds_the_brand_folder(hass) -> None:
    """The loader reports brand assets, so the local icons are served."""
    integration = await async_get_integration(hass, DOMAIN)
    assert integration.has_branding
