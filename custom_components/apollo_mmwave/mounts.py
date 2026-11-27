"""
How a radar is mounted, and where that puts its targets on the floor.

An LD2450 measures range and one angle, azimuth, from two receive antennas
side by side. Mounted level (no roll), it reports x as the true offset
along that baseline and y as the distance in the plane across it, which for
a person dz below the radar and Y out across the floor is sqrt(Y^2 + dz^2).
Tilting the radar down turns that plane about the baseline, which keeps the
length, so tilt changes only what the beam covers, never y. ``floor_point``
undoes the drop for a High or Ceiling mount: Y = sqrt(y^2 - dz^2), 0 when y
is below dz. Looking straight down the radar cannot tell which side of its
baseline someone is on, so a ceiling LD2450 puts everyone on the room side,
+Y, unless Flip room side is on.

dz is the mount height less the person height (where the radar sees a
person best, their chest), never under MIN_DROP_MM. An LD2460 corrects its
own output for its installation, so its floor point is its reading.

``footprint`` is the beam on the plane of the person: 60 degrees either
side in azimuth (|X| <= R sin 60), 35 above and below the boresight in
elevation, and 6 m of range, per the HLK-LD2450 manual. The beam's edge is
soft; this is the half-power edge, so it is about right, not exact.

Every function here has a twin of the same name in
``frontend-src/src/mounts.ts``, and ``frontend-src/test/fixtures/
mount-cases.json`` holds the cases both must pass. Nothing here imports
Home Assistant.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from .const import (
    CEILING_HEIGHT_MAX_MM,
    CEILING_HEIGHT_MIN_MM,
    CEILING_TILT_DEG,
    COVERAGE_ZONE_STEPS,
    COVERAGE_ZONE_WALL_MARGIN_MM,
    FOOTPRINT_STEPS,
    LD2450_AZIMUTH_HALF_DEG,
    LD2450_ELEVATION_HALF_DEG,
    LD2450_RANGE_MM,
    MIN_DROP_MM,
    MOUNT_CEILING,
    MOUNT_HIGH,
    MOUNT_WALL,
    STORE_FLIP_ROOM_SIDE,
)
from .hold import SIDE_COVERAGE, Coverage, Footprint
from .store import (
    ceiling_height_mm,
    device_flag,
    device_mount,
    mount_height_mm,
    target_height_mm,
    tilt_deg,
)

LD2450 = "ld2450"
LD2460 = "ld2460"
# What an LD2460 installation mode sensor reports.
MOUNT_TOP = "top"
MOUNT_SIDE = "side"
# Where an effective mount came from.
SOURCE_RADAR = "radar"
SOURCE_SAVED = "saved"
SOURCE_DEFAULT = "default"
# Manual's top mount limit, X and Y within 4 m.
LD2460_TOP_RANGE_MM = 4000.0
# How close to Y = 0 counts as on the wall line.
WALL_LINE_MM = 1e-6
# The antenna's own beam, 60 degrees either side, pointed down.
LD2460_LOOK_DOWN_HALF_DEG = 60.0


@dataclass(frozen=True, slots=True)
class MountGeometry:
    """
    A radar's mount and the settings in use for it.

    ``height_mm`` is the ceiling height on a ceiling and the mount height
    on a High mount, None on a wall. ``tilt_deg`` (90 on a ceiling),
    ``target_height_mm`` and ``dz_mm`` are set for a High or Ceiling LD2450
    only, and ``flip`` only for a Ceiling LD2450.
    """

    tracker: str | None
    mount: str
    source: str
    height_mm: int | None = None
    tilt_deg: int | None = None
    target_height_mm: int | None = None
    dz_mm: int | None = None
    flip: bool = False


def mount_rule(
    tracker: str | None, mode_state: str | None, saved: str | None
) -> tuple[str, str]:
    """
    Return the mount a radar's view is read by, and where it came from.

    An LD2460's radar report wins when it says side or top; any other
    state, a missing sensor included, falls to a saved ceiling, else a wall
    (its side mode is already a high, tilted wall mount it corrects itself,
    so it has no High). An LD2450 reports no mode: its saved High or
    Ceiling, else a wall. Anything else is a wall.
    """
    if tracker == LD2460:
        if mode_state == MOUNT_TOP:
            return MOUNT_CEILING, SOURCE_RADAR
        if mode_state == MOUNT_SIDE:
            return MOUNT_WALL, SOURCE_RADAR
        if saved == MOUNT_CEILING:
            return MOUNT_CEILING, SOURCE_SAVED
        return MOUNT_WALL, SOURCE_DEFAULT
    if tracker == LD2450 and saved in (MOUNT_HIGH, MOUNT_CEILING):
        return saved, SOURCE_SAVED
    return MOUNT_WALL, SOURCE_DEFAULT


def overridden_mount(
    tracker: str | None, mode_state: str | None, saved: str | None
) -> str | None:
    """
    Return the saved mount a radar report overrides, else None.

    That is the mount ``mount_rule`` gives with no report, when the saved
    choice gives it and the report gives another. It stays saved, and is
    used again when the report goes away.
    """
    mount, source = mount_rule(tracker, mode_state, saved)
    if source != SOURCE_RADAR:
        return None
    kept, kept_source = mount_rule(tracker, None, saved)
    return kept if kept_source == SOURCE_SAVED and kept != mount else None


def mount_geometry(
    tracker: str | None, mode_state: str | None, entry: Any
) -> MountGeometry:
    """Return the mount ``mount_rule`` gives, with the entry's settings."""
    mount, source = mount_rule(tracker, mode_state, device_mount(entry))
    if mount == MOUNT_WALL:
        return MountGeometry(tracker, mount, source)
    height = (
        ceiling_height_mm(entry) if mount == MOUNT_CEILING else mount_height_mm(entry)
    )
    if tracker != LD2450:
        return MountGeometry(tracker, mount, source, height)
    target = target_height_mm(entry)
    return MountGeometry(
        tracker,
        mount,
        source,
        height,
        tilt_deg(entry) if mount == MOUNT_HIGH else CEILING_TILT_DEG,
        target,
        height - min(target, height - MIN_DROP_MM),
        mount == MOUNT_CEILING and device_flag(entry, STORE_FLIP_ROOM_SIDE),
    )


def floor_point(geom: MountGeometry, x: float, y: float) -> tuple[float, float]:
    """Return a raw reading's floor point; the reading itself on a wall."""
    if geom.dz_mm is None:
        return x, y
    forward = math.sqrt(max(0.0, y * y - geom.dz_mm * geom.dz_mm))
    return x, -forward if geom.flip else forward


def half_width_mm(dz: float, forward: float) -> float:
    """Return how far either side an LD2450 sees, forward mm out."""
    # Azimuth limit, then the range limit.
    azimuth = math.tan(math.radians(LD2450_AZIMUTH_HALF_DEG)) * math.hypot(forward, dz)
    reach = math.sqrt(max(0.0, LD2450_RANGE_MM**2 - dz * dz - forward * forward))
    return min(azimuth, reach)


def _band(geom: MountGeometry, dz: float) -> tuple[float, float]:
    # Near and far edge of the covered floor band.
    tilt = geom.tilt_deg if geom.tilt_deg is not None else CEILING_TILT_DEG
    half = LD2450_ELEVATION_HALF_DEG
    rmax = math.sqrt(max(0.0, LD2450_RANGE_MM**2 - dz * dz))
    near = (
        0.0
        if tilt + half >= CEILING_TILT_DEG
        else dz / math.tan(math.radians(tilt + half))
    )
    far = rmax if tilt <= half else min(rmax, dz / math.tan(math.radians(tilt - half)))
    return min(near, far), far


def footprint_outline(
    geom: MountGeometry, steps: int = FOOTPRINT_STEPS
) -> tuple[tuple[float, float], ...]:
    """Return a High or Ceiling LD2450's outline; () for any other mount."""
    if geom.tracker != LD2450 or geom.dz_mm is None:
        return ()
    dz = float(geom.dz_mm)
    near, far = _band(geom, dz)
    rows = [near + (far - near) * index / steps for index in range(steps + 1)]
    outline = [(half_width_mm(dz, row), row) for row in rows] + [
        (-half_width_mm(dz, row), row) for row in reversed(rows)
    ]
    if geom.flip:
        # Mirrored, and reversed to stay counter-clockwise.
        return tuple((x, -y) for x, y in reversed(outline))
    return tuple(outline)


def coverage_zone_outline(
    geom: MountGeometry, steps: int = COVERAGE_ZONE_STEPS
) -> tuple[tuple[float, float], ...]:
    """
    Return the card's coverage zone, floor frame; () for any other mount.

    The outline with its wall line pushed COVERAGE_ZONE_WALL_MARGIN_MM away
    from the room, so someone on the line is inside however the map turns
    and rounds it.
    """
    out = COVERAGE_ZONE_WALL_MARGIN_MM if geom.flip else -COVERAGE_ZONE_WALL_MARGIN_MM
    return tuple(
        (x, float(out)) if abs(y) <= WALL_LINE_MM else (x, y)
        for x, y in footprint_outline(geom, steps)
    )


def footprint(geom: MountGeometry) -> Footprint | None:
    """Return a High or Ceiling LD2450's view on the floor, else None."""
    outline = footprint_outline(geom)
    if not outline:
        return None
    near, far = _band(geom, float(geom.dz_mm or 0))
    return Footprint(near, far, outline)


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


def coverage_for(geom: MountGeometry) -> Coverage | Footprint:
    """Return the view hold times measure the edge of, floor frame."""
    view = footprint(geom)
    if view is not None:
        return view
    if geom.mount == MOUNT_CEILING and geom.height_mm is not None:
        return Coverage(ceiling_radius_mm(geom.height_mm), 180.0)
    return SIDE_COVERAGE
