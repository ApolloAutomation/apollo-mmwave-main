"""
Which radars each Apollo model carries, read from the device registry.

ESPHome publishes the firmware project name as the device's manufacturer and
model ("ApolloAutomation" / "R-PRO-1-W"), which survives entity renames and
Home Assistant's ``_2`` entity id dedup. Diagnostics uses it to decide which
devices get a section; ``target_units.py`` uses it so that only an Apollo
LD2450 radar's sensors are ever switched without a click.

An Apollo device whose model is not listed here is judged by its registered
entities instead (``device_radars``), so new hardware with known radars gets
the same treatment without a release that names it.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from homeassistant.helpers import entity_registry as er

from .const import DOMAIN
from .ld2450 import TARGET_X
from .targets import LD2460_X

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
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


# Twins of the patterns in frontend-src/src/apollo-device.ts.
_LD2412 = re.compile(
    r"(?:^|_)ld2412_(?:engineering_mode|g\d{2}_(?:move|still)_threshold|presence)"
    r"(?:_\d+)?$"
)
_LD2410 = re.compile(
    r"(?:^|_)(?:radar_engineering_mode|g\d_(?:move|still)_threshold)(?:_\d+)?$"
)
_RADAR_DOMAINS = frozenset({"sensor", "switch", "number", "binary_sensor"})


def entity_radars(hass: HomeAssistant, device_id: str) -> list[str]:
    """Return the radars a device's registered entities show."""
    gate: str | None = None
    ld2460 = ld2450 = False
    for entry in er.async_entries_for_device(
        er.async_get(hass), device_id, include_disabled_entities=True
    ):
        if entry.platform == DOMAIN or entry.domain not in _RADAR_DOMAINS:
            continue
        object_id = entry.entity_id.partition(".")[2]
        if _LD2412.search(object_id):
            gate = "ld2412"
        elif gate is None and _LD2410.search(object_id):
            gate = "ld2410"
        if entry.domain == "sensor":
            if LD2460_X.search(object_id):
                ld2460 = True
            elif TARGET_X.search(object_id):
                ld2450 = True
    tracker = "ld2460" if ld2460 else "ld2450" if ld2450 else None
    return [radar for radar in (gate, tracker) if radar is not None]


def device_radars(
    hass: HomeAssistant, device: dr.DeviceEntry | None
) -> list[str] | None:
    """Known model first; else an Apollo device's entities decide."""
    known = apollo_radars(device)
    if known is not None:
        return known
    if device is None or (device.manufacturer or "").lower() != APOLLO_MANUFACTURER:
        return None
    return entity_radars(hass, device.id) or None
