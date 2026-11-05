"""
Which radars each Apollo model carries, read from the device registry.

ESPHome publishes the firmware project name as the device's manufacturer and
model ("ApolloAutomation" / "R-PRO-1-W"), which survives entity renames and
Home Assistant's ``_2`` entity id dedup. Diagnostics uses it to decide which
devices get a section; ``target_units.py`` uses it so that only an Apollo
LD2450 radar's sensors are ever switched without a click.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from homeassistant.helpers import device_registry as dr

# The radars each Apollo model carries, by lower-cased model prefix, because
# hardware variants extend the model string (R-PRO-1-W, MSR-2_BLE). This is
# `APOLLO_MODELS` in frontend-src/src/profiles.ts, which detects the same
# hardware the same way; tests/test_diagnostics.py keeps the two equal.
APOLLO_MANUFACTURER = "apolloautomation"
MODEL_RADARS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("msr-1", ("ld2410",)),
    ("msr-2", ("ld2410",)),
    ("mtr-1", ("ld2450",)),
    ("r-pro-1", ("ld2412", "ld2450")),
)


def apollo_radars(device: dr.DeviceEntry | None) -> list[str] | None:
    """Return the radars an Apollo model carries, or None for any other device."""
    if device is None or not device.manufacturer or not device.model:
        return None
    if device.manufacturer.lower() != APOLLO_MANUFACTURER:
        return None
    model = device.model.lower()
    return next(
        (list(radars) for prefix, radars in MODEL_RADARS if model.startswith(prefix)),
        None,
    )
