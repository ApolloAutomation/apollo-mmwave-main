"""
Gate-radar entity discovery for a device (LD2410 and LD2412).

The MSR-1 and MSR-2 (LD2410) name their gate entities ``<base>_g3_move_threshold``
and ``<base>_g3_move_energy``; the R-PRO-1 (LD2412) names them
``<base>_ld2412_g03_move_threshold``. Both end in ``_g<digits>_<channel>_<kind>``,
so one regex covers both chips and the gate is keyed by the captured digits,
never by position: a disabled gate leaves a hole rather than shifting its
neighbours.

Matching is on the entity id suffix, so a renamed prefix does not break
detection, and the optional trailing ``_2`` absorbs Home Assistant's dedup
suffix (the gate digits sit before it, so they cannot be misread as one).

This is the Python twin of ``frontend-src/src/entities.ts`` (``GATE_PATTERNS``
and ``SCALAR_PATTERNS``). The regexes and the first-writer-wins rule are
shared, so change both together. Like ``ld2450.py``, this side drops disabled
entities because it reads the entity registry, which carries that signal; the
TypeScript side cannot, so do not loosen this side to match it.

The MSR-2 firmware names the LD2410's ``has_target`` sensor "Radar Target" and
the R-PRO-1 firmware names the LD2412's "LD2412 Presence", which is where the
two ``RADAR_TARGET`` suffixes come from.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.helpers import entity_registry as er

from .calibration_math import Bounds

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

__all__ = [
    "BG_BUTTON",
    "BG_STATUS",
    "ENGINEERING_SUFFIXES",
    "GATE_RE",
    "LD2410_MAX_MOVE",
    "LD2410_MAX_STILL",
    "LD2412_MAX_GATE",
    "LD2412_MIN_GATE",
    "MOVING_TARGET",
    "QUERY_PARAMS",
    "RADAR_TARGET",
    "Bounds",
    "GateEntities",
    "finite_float",
    "is_offline",
    "number_bounds",
    "numeric_state",
    "resolve_gate_entities",
]

GATE_RE = re.compile(r"_g(\d+)_(move|still)_(threshold|energy)(?:_\d+)?$")

# Scalar suffixes. Each is compiled with the same dedup tail as entities.ts.
ENGINEERING_SUFFIXES = {
    "_radar_engineering_mode": "switch",
    "_ld2412_engineering_mode": "switch",
}
LD2410_MAX_MOVE = "_radar_max_move_distance"  # number
LD2410_MAX_STILL = "_radar_max_still_distance"  # number
LD2412_MAX_GATE = "_ld2412_max_distance_gate"  # number
LD2412_MIN_GATE = "_ld2412_min_distance_gate"  # number
MOVING_TARGET = ("_radar_moving_target", "_ld2412_moving_target")  # binary_sensor
RADAR_TARGET = ("_radar_target", "_ld2412_presence")  # binary_sensor (has_target)
BG_BUTTON = "_ld2412_start_dynamic_background_correction"  # button
BG_STATUS = "_ld2412_dynamic_background_correction_status"  # binary_sensor
QUERY_PARAMS = "_ld2412_query_params"  # button

_DEDUP = r"(?:_\d+)?$"
_LD2412_MARKER = "_ld2412_"

# (slot name, domain, compiled suffix) in the order they are tried. First
# writer wins per slot, like `ld2450.py resolve_target_pairs`.
_SCALAR_PATTERNS: tuple[tuple[str, str, re.Pattern[str]], ...] = tuple(
    (slot, domain, re.compile(re.escape(suffix) + _DEDUP))
    for slot, domain, suffix in (
        *(
            ("engineering_mode", domain, suffix)
            for suffix, domain in ENGINEERING_SUFFIXES.items()
        ),
        ("max_move_gate", "number", LD2410_MAX_MOVE),
        ("max_still_gate", "number", LD2410_MAX_STILL),
        ("max_gate", "number", LD2412_MAX_GATE),
        ("min_gate", "number", LD2412_MIN_GATE),
        *(("moving_target", "binary_sensor", suffix) for suffix in MOVING_TARGET),
        *(("radar_target", "binary_sensor", suffix) for suffix in RADAR_TARGET),
        ("background_button", "button", BG_BUTTON),
        ("background_status", "binary_sensor", BG_STATUS),
        ("query_params_button", "button", QUERY_PARAMS),
    )
)

_GATE_DOMAINS = {"threshold": "number", "energy": "sensor"}


@dataclass(frozen=True)
class GateEntities:
    """Every entity the calibration job can use on one device, by role."""

    profile: Literal["ld2410", "ld2412"]
    engineering_mode: str | None
    move_threshold: dict[int, str]
    still_threshold: dict[int, str]
    move_energy: dict[int, str]
    still_energy: dict[int, str]
    max_move_gate: str | None  # LD2410 only
    max_still_gate: str | None  # LD2410 only
    min_gate: str | None  # LD2412 only
    max_gate: str | None  # LD2412 only
    moving_target: str | None
    radar_target: str | None
    background_button: str | None
    background_status: str | None
    query_params_button: str | None

    @property
    def gate_count(self) -> int:
        """Return the highest gate number plus one across the four maps."""
        keys = [
            *self.move_threshold,
            *self.still_threshold,
            *self.move_energy,
            *self.still_energy,
        ]
        return max(keys) + 1 if keys else 0

    def gates(self) -> list[int]:
        """Return every gate number any of the four maps mentions, ascending."""
        return sorted(
            set(self.move_threshold)
            | set(self.still_threshold)
            | set(self.move_energy)
            | set(self.still_energy)
        )

    def threshold(self, gate: int, channel: str) -> str | None:
        """Return the threshold number of one gate channel, if registered."""
        table = self.move_threshold if channel == "move" else self.still_threshold
        return table.get(gate)

    def energy(self, gate: int, channel: str) -> str | None:
        """Return the energy sensor of one gate channel, if registered."""
        table = self.move_energy if channel == "move" else self.still_energy
        return table.get(gate)


def resolve_gate_entities(hass: HomeAssistant, device_id: str) -> GateEntities | None:
    """
    Classify a device's enabled registry entries into gate and scalar roles.

    Returns None when no gate slot matched at all: an MTR-1, or a radar whose
    gate entities are all disabled.
    """
    gate_slots: dict[str, dict[int, str]] = {
        "move_threshold": {},
        "still_threshold": {},
        "move_energy": {},
        "still_energy": {},
    }
    scalars: dict[str, str] = {}
    saw_ld2412 = False
    for entry in er.async_entries_for_device(
        er.async_get(hass), device_id, include_disabled_entities=False
    ):
        object_id = entry.entity_id.partition(".")[2]
        if _LD2412_MARKER in object_id:
            saw_ld2412 = True
        if match := GATE_RE.search(object_id):
            gate, channel, kind = match.groups()
            if entry.domain == _GATE_DOMAINS[kind]:
                gate_slots[f"{channel}_{kind}"].setdefault(int(gate), entry.entity_id)
            continue
        for slot, domain, pattern in _SCALAR_PATTERNS:
            if entry.domain == domain and pattern.search(object_id):
                scalars.setdefault(slot, entry.entity_id)
                break
    if not any(gate_slots.values()):
        return None
    return GateEntities(
        profile="ld2412" if saw_ld2412 else "ld2410",
        engineering_mode=scalars.get("engineering_mode"),
        move_threshold=gate_slots["move_threshold"],
        still_threshold=gate_slots["still_threshold"],
        move_energy=gate_slots["move_energy"],
        still_energy=gate_slots["still_energy"],
        max_move_gate=scalars.get("max_move_gate"),
        max_still_gate=scalars.get("max_still_gate"),
        min_gate=scalars.get("min_gate"),
        max_gate=scalars.get("max_gate"),
        moving_target=scalars.get("moving_target"),
        radar_target=scalars.get("radar_target"),
        background_button=scalars.get("background_button"),
        background_status=scalars.get("background_status"),
        query_params_button=scalars.get("query_params_button"),
    )


def finite_float(value: object) -> float | None:
    """Coerce a state or attribute to a finite float, or None."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except TypeError, ValueError:
        return None
    return number if math.isfinite(number) else None


def number_bounds(hass: HomeAssistant, entity_id: str) -> Bounds:
    """Read a number entity's ``min``, ``max`` and ``step`` with 0/100/1 fallbacks."""
    defaults = Bounds()
    state = hass.states.get(entity_id)
    if state is None:
        return defaults
    attributes = state.attributes
    lo = finite_float(attributes.get("min"))
    hi = finite_float(attributes.get("max"))
    step = finite_float(attributes.get("step"))
    return Bounds(
        lo=defaults.lo if lo is None else lo,
        hi=defaults.hi if hi is None else hi,
        step=defaults.step if step is None or step <= 0 else step,
    )


def numeric_state(hass: HomeAssistant, entity_id: str | None) -> float | None:
    """Return an entity's state as a finite float, or None for anything else."""
    if entity_id is None:
        return None
    state = hass.states.get(entity_id)
    if state is None:
        return None
    return finite_float(state.state)


def is_offline(hass: HomeAssistant, entity_id: str) -> bool:
    """Report whether an entity has no state object or reads ``unavailable``."""
    # A registered entity with no state object yet is what an ESPHome device
    # still connecting looks like; `entity_service_call` would silently skip
    # it, so it counts as offline for the pre-flight.
    state = hass.states.get(entity_id)
    return state is None or state.state == STATE_UNAVAILABLE
