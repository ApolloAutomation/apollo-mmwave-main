"""
Exit-aware hold for zone presence, kept free of Home Assistant.

The hold works on ``Reading`` objects: one tracked target as presence and the
movement recorder see it, with its slot in the radar's pair list, its position
in millimeters in the raw sensor frame, and the same point rotated into the
map frame by the radar's ``rotation_deg``. ``targets.masked_readings`` builds
them. Nothing here imports Home Assistant and time is passed in, so the rules
can be tested with plain numbers.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Reading:
    """One tracked target, unit converted and not inside any ignore zone."""

    # The index in the radar's pair list. LD2450 slots swap between people,
    # so it names a target from one reading to the next, not a person.
    slot: int
    raw: tuple[float, float]  # mm, raw sensor frame
    map: tuple[float, float]  # rotated by rotation_deg
