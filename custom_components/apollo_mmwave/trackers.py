"""
Which tracking radar a device's target pairs belong to, and what follows.

Zone presence and the movement recorder pair LD2450 and LD2460 targets
alike (``ld2450.TARGET_X``), but the two chips write them differently. The
LD2450 writes Y up to about 0.45 s after X and empties a slot as 0/0, so
an axis written alone waits for the other's write and one axis turning 0
can be half of a vanish. The LD2460 writes X and Y of a frame together,
reports a lost target as unknown, and sees a 6 m, 120 degree cone on a wall
but a circle of up to 4 m on a ceiling, which it reports at boot as its
installation mode. When it reports none, the mount saved for the radar
(store ``mount``) decides, else a wall, as ESPHome assumes
(``effective_mount``).

A pair is the LD2460's when both its ids carry the ``_ld2460_target_`` token,
which every Apollo firmware gives them. A list counts as the LD2460's only
when every pair in it is, so a mixed or hand-picked list keeps the LD2450's
rules. The zone map card tells the radars apart the same way in
``frontend-src/src/ld2460.ts``.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from homeassistant.helpers import entity_registry as er

from .const import (
    CEILING_HEIGHT_MAX_MM,
    CEILING_HEIGHT_MIN_MM,
    DOMAIN,
    MOUNT_CEILING,
    MOUNT_WALL,
)
from .hold import LD2460_TOP_COVERAGE, SIDE_COVERAGE, Coverage
from .store import ceiling_height_mm, device_mount
from .targets import (
    LD2450_TIMING,
    LD2460_TIMING,
    LD2460_X,
    LD2460_Y,
    TrackerTiming,
    is_ld2460_pair,
)

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

__all__ = [
    "LD2450",
    "LD2460",
    "LD2460_LOOK_DOWN_HALF_DEG",
    "LD2460_TOP_COVERAGE",
    "LD2460_TOP_RANGE_MM",
    "LD2460_X",
    "LD2460_Y",
    "SIDE_COVERAGE",
    "Coverage",
    "Mount",
    "ceiling_radius_mm",
    "effective_mount",
    "installation_mode_entity",
    "mount_for",
    "mount_rule",
    "pair_tracker",
    "pairs_tracker",
    "timing_for",
]

LD2450 = "ld2450"
LD2460 = "ld2460"

INSTALLATION_MODE = re.compile(r"(?:^|_)ld2460_installation_mode(?:_\d+)?$")
MOUNT_TOP = "top"
MOUNT_SIDE = "side"
# Where an effective mount came from.
SOURCE_RADAR = "radar"
SOURCE_SAVED = "saved"
SOURCE_DEFAULT = "default"
# Manual's top mount limit, X and Y within 4 m.
LD2460_TOP_RANGE_MM = 4000.0
# The antenna's own beam, 60 degrees either side, pointed down.
LD2460_LOOK_DOWN_HALF_DEG = 60.0


def _object_id(entity_id: Any) -> str:
    return entity_id.partition(".")[2] if isinstance(entity_id, str) else ""


def pair_tracker(pair: Any) -> str:
    """Return which radar one X/Y pair belongs to."""
    return LD2460 if is_ld2460_pair(pair) else LD2450


def pairs_tracker(pairs: Any) -> str:
    """Return the radar a pair list belongs to: LD2460 only when all are."""
    if (
        isinstance(pairs, list)
        and pairs
        and all(pair_tracker(pair) == LD2460 for pair in pairs)
    ):
        return LD2460
    return LD2450


def timing_for(pairs: Any) -> TrackerTiming:
    """Return how a pair list's X and Y writes make a reading."""
    return LD2460_TIMING if pairs_tracker(pairs) == LD2460 else LD2450_TIMING


def installation_mode_entity(hass: HomeAssistant, device_id: str) -> str | None:
    """Return the device's LD2460 installation mode sensor, or None."""
    return next(
        (
            entry.entity_id
            for entry in er.async_entries_for_device(er.async_get(hass), device_id)
            if entry.domain == "sensor"
            and entry.platform != DOMAIN
            and INSTALLATION_MODE.search(_object_id(entry.entity_id))
        ),
        None,
    )


def ceiling_radius_mm(height_mm: float) -> float:
    """
    Return how far out from the spot under a ceiling LD2460 it sees, in mm.

    ``min(4000, h * tan(60 degrees))``, with h clamped to 2000 to 4000 mm.
    The 60 degrees is the antenna's beam, 60 degrees either side, which the
    wall mount draws as its 120 degree cone; pointed down it makes a cone of
    that half angle. The cap is the manual's top mount limit, X and Y each
    from -4 to 4 m, which the beam reaches from about 2.31 m up, so the
    manual's 2.5 to 3 m heights all see 4 m.
    """
    height = min(max(float(height_mm), CEILING_HEIGHT_MIN_MM), CEILING_HEIGHT_MAX_MM)
    reach = height * math.tan(math.radians(LD2460_LOOK_DOWN_HALF_DEG))
    return min(LD2460_TOP_RANGE_MM, reach)


@dataclass(frozen=True, slots=True)
class Mount:
    """How a radar's view is read: its mount, why, and what it sees."""

    mount: str
    source: str
    height_mm: int
    coverage: Coverage


def mount_rule(
    tracker: str, mode_state: str | None, saved: str | None
) -> tuple[str, str]:
    """
    Return the mount a radar's view is read by, and where it came from.

    Only LD2460 pairs can be on a ceiling. Their radar's report wins when it
    says side or top; any other state, a missing sensor included, falls to
    the saved mount, else a wall. The zone map card's ``mountRule`` in
    ``frontend-src/src/ld2460.ts`` is this rule's twin. The card alone keeps
    the last side or top it saw while the sensor is unavailable, so its map
    does not flicker through a restart; no target is tracked then, so the
    hold, which reads this, cannot differ.
    """
    if tracker != LD2460:
        return MOUNT_WALL, SOURCE_DEFAULT
    if mode_state == MOUNT_TOP:
        return MOUNT_CEILING, SOURCE_RADAR
    if mode_state == MOUNT_SIDE:
        return MOUNT_WALL, SOURCE_RADAR
    if saved == MOUNT_CEILING:
        return MOUNT_CEILING, SOURCE_SAVED
    return MOUNT_WALL, SOURCE_DEFAULT


def mount_for(tracker: str, mode_state: str | None, entry: Any) -> Mount:
    """Return the Mount ``mount_rule`` gives, with the entry's height."""
    mount, source = mount_rule(tracker, mode_state, device_mount(entry))
    height = ceiling_height_mm(entry)
    view = (
        Coverage(ceiling_radius_mm(height), 180.0)
        if mount == MOUNT_CEILING
        else SIDE_COVERAGE
    )
    return Mount(mount, source, height, view)


def effective_mount(
    hass: HomeAssistant, device_id: str, pairs: Any, entry: Any
) -> Mount:
    """Return the mount and view of a device's tracked pairs (``mount_rule``)."""
    mode_entity = installation_mode_entity(hass, device_id)
    state = hass.states.get(mode_entity) if mode_entity is not None else None
    return mount_for(
        pairs_tracker(pairs), state.state if state is not None else None, entry
    )
