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
(``effective_mount``). An LD2450 reports no mode, so its saved High or
Ceiling mount decides, else a wall; ``mounts.py`` holds the rule and what
each mount does to a reading.

A pair is the LD2460's when both its ids carry the ``_ld2460_target_`` token,
which ESPHome's ld2460 component gives them. A list counts as the LD2460's only
when every pair in it is, so a mixed or hand-picked list keeps the LD2450's
rules. The zone map card tells the radars apart the same way in
``frontend-src/src/ld2460.ts``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from homeassistant.helpers import entity_registry as er

from .const import DOMAIN
from .hold import LD2460_TOP_COVERAGE, SIDE_COVERAGE, Coverage, Footprint
from .mounts import (
    LD2450,
    LD2460,
    LD2460_LOOK_DOWN_HALF_DEG,
    LD2460_TOP_RANGE_MM,
    MOUNT_SIDE,
    MOUNT_TOP,
    SOURCE_DEFAULT,
    SOURCE_RADAR,
    SOURCE_SAVED,
    MountGeometry,
    ceiling_radius_mm,
    coverage_for,
    mount_geometry,
    mount_rule,
)
from .store import ceiling_height_mm
from .targets import (
    LD2450_TIMING,
    LD2460_TIMING,
    LD2460_X,
    LD2460_Y,
    TrackerTiming,
    pair_tracker,
    pairs_tracker,
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
    "MOUNT_SIDE",
    "MOUNT_TOP",
    "SIDE_COVERAGE",
    "SOURCE_DEFAULT",
    "SOURCE_RADAR",
    "SOURCE_SAVED",
    "Coverage",
    "Footprint",
    "Mount",
    "MountGeometry",
    "ceiling_radius_mm",
    "effective_geometry",
    "effective_mount",
    "installation_mode_entity",
    "mount_for",
    "mount_geometry",
    "mount_rule",
    "pair_tracker",
    "pairs_tracker",
    "timing_for",
]

INSTALLATION_MODE = re.compile(r"(?:^|_)ld2460_installation_mode(?:_\d+)?$")


def _object_id(entity_id: Any) -> str:
    return entity_id.partition(".")[2] if isinstance(entity_id, str) else ""


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


@dataclass(frozen=True, slots=True)
class Mount:
    """How a radar's view is read: its mount, why, and what it sees."""

    mount: str
    source: str
    height_mm: int
    coverage: Coverage | Footprint


def mount_for(tracker: str, mode_state: str | None, entry: Any) -> Mount:
    """Return the Mount ``mount_rule`` gives, with the entry's ceiling height."""
    geom = mount_geometry(tracker, mode_state, entry)
    return Mount(geom.mount, geom.source, ceiling_height_mm(entry), coverage_for(geom))


def _mode_state(hass: HomeAssistant, device_id: str, tracker: str) -> str | None:
    # Only an LD2460 reports an installation mode.
    if tracker != LD2460:
        return None
    mode_entity = installation_mode_entity(hass, device_id)
    state = hass.states.get(mode_entity) if mode_entity is not None else None
    return state.state if state is not None else None


def effective_geometry(
    hass: HomeAssistant, device_id: str, pairs: Any, entry: Any
) -> MountGeometry:
    """Return the mount and settings of a device's tracked pairs."""
    tracker = pairs_tracker(pairs)
    return mount_geometry(tracker, _mode_state(hass, device_id, tracker), entry)


def effective_mount(
    hass: HomeAssistant, device_id: str, pairs: Any, entry: Any
) -> Mount:
    """Return the mount and view of a device's tracked pairs (``mount_rule``)."""
    tracker = pairs_tracker(pairs)
    return mount_for(tracker, _mode_state(hass, device_id, tracker), entry)
