"""
Empty-room gate calibration: the job, its services and its websocket payload.

One explicit, undoable device operation: ``apollo_mmwave.calibrate_gates``
turns Radar Engineering Mode on if it was off, counts down so the person can
leave, listens to every gate's move and still energy once a second, computes
each threshold as the observed maximum plus headroom (``calibration_math``),
saves a snapshot of every threshold to ``CalibrationStore`` before the first
device write, writes the number entities one at a time with pacing, reads
them back, and turns Engineering Mode off again only if the job turned it on.
``restore_gate_thresholds`` writes a saved snapshot back the same way (taking a
new snapshot first, so Undo doubles as Redo) and ``cancel_calibration`` asks a
running job to stop.

The job runs as a config-entry background task, so it survives the browser
closing; the card is only a view of it through ``calibration_payload`` and the
``SIGNAL_CALIBRATION_UPDATED`` dispatcher signal.

Timing is driven by one ``async_track_time_interval`` tick of ``TICK_S``: the
tick confirms engineering mode, runs the settle countdown and the energy
warmup side by side, takes the samples, evaluates the liveness guards and
counts the sampling window. SPEC NOTE: the spec drives the countdown and the
listen with ``async_call_later``; both are counted in ticks here (the addendum
allows it) so the sample count is exact: the tick on which sampling starts
takes the first sample and the tick on which ``len(ticks)`` reaches
``duration_s`` takes the last. The only ``asyncio.sleep`` calls are the three
constants tests set to 0.

Why the engineering-mode switch alone proves little: ESPHome's switch publishes
``on`` before it sends the UART command, so Home Assistant sees ``on`` the
moment the command reaches the ESP. The gate energies moving from ``unknown``
to numbers are the chip confirming the mode (the warmup), and the switch
flipping back to ``off`` is the only evidence that it stopped (the liveness
guard). Both drivers deduplicate sensor values, so liveness is judged on state
content, never on event arrival.

Only three device write shapes exist, all blocking and with the caller's
context: ``number.set_value``, ``switch.turn_on``/``turn_off`` and
``button.press``.
"""

from __future__ import annotations

import asyncio
import logging
import math
import uuid
from dataclasses import dataclass, field
from datetime import timedelta
from functools import partial
from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.auth.permissions.const import POLICY_CONTROL
from homeassistant.const import (
    EVENT_HOMEASSISTANT_STOP,
    STATE_OFF,
    STATE_ON,
    STATE_UNAVAILABLE,
)
from homeassistant.core import SupportsResponse, callback
from homeassistant.exceptions import (
    HomeAssistantError,
    ServiceValidationError,
    Unauthorized,
)
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.util import dt as dt_util

# SPEC NOTE: the spec puts every tuning constant in this module so tests can
# patch it here. Four of them live with the code that reads them instead, and
# are deliberately not re-exported, so patching a copy here cannot silently do
# nothing: MIN_SAMPLES, SPIKE_ABS and SPIKE_RATIO in `calibration_math` (read by
# `compute_channel`, which also lives there) and MAX_SNAPSHOTS in
# `calibration_store`. Patch them on those modules. `Bounds` is defined in
# `calibration_math` too and re-exported here and by `gates`.
from .calibration_math import (
    FLAG_OFF,
    FLAG_SKIPPED,
    FLAG_UNUSED,
    Bounds,
    ChannelResult,
    ChannelSamples,
    Margins,
    compute_channel,
)
from .calibration_store import (
    KEY_LEFT_ON,
    STORAGE_KEY,
    CalibrationStore,
)
from .const import (
    DATA_CALIBRATION_JOBS,
    DATA_CALIBRATION_STORE,
    DOMAIN,
    EVENT_CALIBRATION_FINISHED,
    EVENT_CALIBRATION_STARTED,
    SERVICE_CALIBRATE_GATES,
    SERVICE_CANCEL_CALIBRATION,
    SERVICE_RESTORE_GATE_THRESHOLDS,
    SIGNAL_CALIBRATION_UPDATED,
)
from .gates import (
    GateEntities,
    finite_float,
    is_offline,
    number_bounds,
    numeric_state,
    resolve_gate_entities,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine
    from datetime import datetime

    from homeassistant.auth.models import User
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import (
        CALLBACK_TYPE,
        Context,
        Event,
        EventStateChangedData,
        HomeAssistant,
        ServiceCall,
        ServiceResponse,
    )

__all__ = [
    "DEFAULT_DURATION_S",
    "DEFAULT_MARGIN",
    "DEFAULT_MARGIN_PCT",
    "DEFAULT_SETTLE_S",
    "ENERGY_WARMUP_TIMEOUT_S",
    "ENGINEERING_CONFIRM_TIMEOUT_S",
    "ENGINEERING_LOST_TICKS",
    "PRESENCE_WARN_FRACTION",
    "RESTORE_READBACK_S",
    "SHUTDOWN_RESTORE_TIMEOUT_S",
    "TICK_S",
    "VERIFY_SETTLE_S",
    "VERIFY_TOLERANCE",
    "WRITE_SPACING_S",
    "Bounds",
    "CalibrationJob",
    "ChannelResult",
    "ChannelSamples",
    "JobSpec",
    "Margins",
    "async_setup_calibration",
    "calibration_payload",
    "compute_channel",
]

_LOGGER = logging.getLogger(__name__)

DEFAULT_DURATION_S = 60
DEFAULT_SETTLE_S = 15
# Headroom above the observed empty-room peak; the larger of the two wins per
# gate. 2.2.4 raised these from 10 points / 25 % after live testing on MSR-1
# panels: the listen sees about one in ten of the chip's frames, and quiet
# gates calibrated 10 points over their noise still tripped on short spikes
# the listen never caught (fans cycling, HVAC), well below the factory values.
DEFAULT_MARGIN = 15
DEFAULT_MARGIN_PCT = 35
TICK_S = 1  # sampling and progress tick
ENGINEERING_CONFIRM_TIMEOUT_S = 10  # switch must read "on" within this
ENERGY_WARMUP_TIMEOUT_S = 20  # an energy sensor must be numeric within this
ENGINEERING_LOST_TICKS = 2  # consecutive "off" ticks that abort the listen
WRITE_SPACING_S = 0.25  # asyncio.sleep between number.set_value calls (tests: 0)
VERIFY_SETTLE_S = 3.0  # asyncio.sleep before reading numbers back (tests: 0)
RESTORE_READBACK_S = 1.0  # asyncio.sleep after switch.turn_off (tests: 0)
VERIFY_TOLERANCE = 0.5  # |state - target| <= this counts as confirmed
PRESENCE_WARN_FRACTION = 0.25  # ticks with the radar-target sensor "on"
SHUTDOWN_RESTORE_TIMEOUT_S = 5  # bound on the engineering-mode restore

KIND_CALIBRATE = "calibrate"
KIND_RESTORE = "restore"

STATUS_PREPARING = "preparing"
STATUS_SAMPLING = "sampling"
STATUS_APPLYING = "applying"
STATUS_VERIFYING = "verifying"
STATUS_DONE = "done"
STATUS_CANCELLED = "cancelled"
STATUS_FAILED = "failed"

SUB_ENGINEERING = "engineering"
SUB_SETTLE = "settle"
SUB_WARMUP = "warmup"
SUB_REFRESH = "refresh"

OUTCOME_APPLIED = "applied"
OUTCOME_PARTIAL = "partial"
OUTCOME_PREVIEW = "preview"
OUTCOME_CANCELLED = "cancelled"
OUTCOME_FAILED = "failed"
OUTCOME_RESTORED = "restored"

PHASE_ENGINEERING = "engineering"
PHASE_APPLYING = "applying"

CHANNEL_MOVE = "move"
CHANNEL_STILL = "still"
CHANNELS = (CHANNEL_MOVE, CHANNEL_STILL)

SKIP_NO_ENERGY = "no energy sensor"
SKIP_NO_THRESHOLD = "no threshold entity"
SKIP_NOT_SELECTED = "not selected"

WARN_PRESENCE = "presence"
WARN_RADAR_UNAVAILABLE = "radar_unavailable"
WARN_UNVERIFIED = "unverified"
WARN_GATE_OFF = "gate_off"

# Job failure codes (the `error.code` of a failed result).
ERR_ENGINEERING_MODE_NOT_CONFIRMED = "engineering_mode_not_confirmed"
ERR_NO_ENERGY_DATA = "no_energy_data"
ERR_ENGINEERING_MODE_LOST = "engineering_mode_lost"
ERR_BACKGROUND_CORRECTION_STARTED = "background_correction_started"
ERR_THRESHOLDS_NOT_NUMERIC = "thresholds_not_numeric"
ERR_SNAPSHOT_FAILED = "snapshot_failed"
ERR_DEVICE_OFFLINE = "device_offline"
ERR_WRITE_FAILED = "write_failed"
ERR_NOT_ALLOWED = "not_allowed"
ERR_CANCELLED_BY_SHUTDOWN = "cancelled_by_shutdown"
ERR_UNEXPECTED = "unexpected"
# SPEC NOTE: not in the spec's table. A listen in which no gate collected
# MIN_SAMPLES readings (the radar dropped off Wi-Fi, say) has nothing to write;
# failing is the conservative answer, because finishing "applied" with no data
# would take an empty snapshot that hides the real one from Undo. The card
# renders any code from its message, which already says "Nothing was changed."
ERR_NO_GATE_DATA = "no_gate_data"

ERROR_MESSAGES = {
    ERR_ENGINEERING_MODE_NOT_CONFIRMED: (
        "Home Assistant could not turn Radar Engineering Mode on within 10 s."
        " Is the radar online?"
    ),
    ERR_NO_ENERGY_DATA: (
        "No gate energy readings arrived within 20 s of turning Radar Engineering"
        " Mode on. Check that the radar is online and that Radar Engineering Mode"
        " works from its device page."
    ),
    ERR_ENGINEERING_MODE_LOST: (
        "Radar Engineering Mode turned off during the listen. Nothing was changed."
        " Leave it on until calibration finishes, then try again."
    ),
    ERR_BACKGROUND_CORRECTION_STARTED: (
        "Dynamic Background Correction was started during the listen. Nothing was"
        " changed. Wait for its status to turn off, then calibrate again."
    ),
    # The ids are logged (`_log_missing_thresholds`), not shown: listing all 28
    # of an LD2412 in the card buried the sentence under entity ids.
    ERR_THRESHOLDS_NOT_NUMERIC: (
        "The radar has not reported {count} of its threshold values."
        " Nothing was changed."
    ),
    ERR_SNAPSHOT_FAILED: (
        "Could not save the current thresholds, so nothing was changed. Check the"
        " Home Assistant log and free disk space."
    ),
    ERR_DEVICE_OFFLINE: (
        "The radar went offline after {n} of {total} values were written."
        " Use Undo once it is back."
    ),
    ERR_WRITE_FAILED: (
        "Writing stopped after {n} of {total} values ({entity_id} raised an error)."
        " Use Undo to put the saved values back."
    ),
    ERR_NOT_ALLOWED: (
        "Your Home Assistant user is not allowed to control this radar's entities."
    ),
    ERR_CANCELLED_BY_SHUTDOWN: (
        "Home Assistant stopped or the integration reloaded during the calibration."
    ),
    ERR_UNEXPECTED: "Something went wrong: {exception}. See the Home Assistant log.",
    ERR_NO_GATE_DATA: (
        "No gate collected enough energy readings during the listen to set a"
        " threshold. Nothing was changed. Check that the radar stayed online and"
        " in Radar Engineering Mode, then try again."
    ),
}
# The Undo clause only makes sense once something was written (addendum 6).
# SPEC NOTE: the addendum only drops the Undo clause; "after 0 of 18 values"
# reads badly, so the zero-write forms are also reworded.
_NOTHING_WRITTEN_MESSAGES = {
    ERR_DEVICE_OFFLINE: (
        "The radar went offline before any value was written. Nothing was changed."
    ),
    ERR_WRITE_FAILED: (
        "Writing failed on the first value ({entity_id} raised an error)."
        " Nothing was changed."
    ),
}

# Pre-flight translation keys (`translations/en.json` "exceptions").
TR_UNKNOWN_DEVICE = "unknown_device"
TR_MULTIPLE_DEVICES = "multiple_devices"
TR_CALIBRATION_RUNNING = "calibration_running"
TR_NO_GATE_ENTITIES = "no_gate_entities"
TR_ENGINEERING_MODE_MISSING = "engineering_mode_missing"
TR_DEVICE_OFFLINE = "device_offline"
TR_BACKGROUND_CORRECTION_RUNNING = "background_correction_running"
TR_THRESHOLDS_NOT_NUMERIC = "thresholds_not_numeric"
TR_MARGIN_ZERO = "margin_zero"
TR_NOT_ALLOWED = "not_allowed"
TR_NO_SNAPSHOT = "no_snapshot"

PROFILE_LD2410 = "ld2410"
PROFILE_LD2412 = "ld2412"
# LD2410 gate 0 and 1 still energy idle near saturation, so "off" there is
# expected and not reported in `gates_off`.
_LD2410_EXPECTED_OFF_STILL_GATES = (0, 1)

DEVICE_ID = vol.Any(cv.string, [cv.string])  # a target: block yields a list

CALIBRATE_GATES_SCHEMA = vol.Schema(
    {
        vol.Required("device_id"): DEVICE_ID,
        vol.Optional("duration_s", default=DEFAULT_DURATION_S): vol.All(
            vol.Coerce(int), vol.Range(min=15, max=600)
        ),
        vol.Optional("settle_s", default=DEFAULT_SETTLE_S): vol.All(
            vol.Coerce(int), vol.Range(min=0, max=120)
        ),
        vol.Optional("margin", default=DEFAULT_MARGIN): vol.All(
            vol.Coerce(int), vol.Range(min=0, max=50)
        ),
        vol.Optional("margin_pct", default=DEFAULT_MARGIN_PCT): vol.All(
            vol.Coerce(int), vol.Range(min=0, max=100)
        ),
        vol.Optional("kind", default="both"): vol.In(["both", "move", "still"]),
        vol.Optional("apply", default=True): cv.boolean,
        vol.Optional("wait", default=False): cv.boolean,
    },
    extra=vol.PREVENT_EXTRA,
)

CANCEL_CALIBRATION_SCHEMA = vol.Schema(
    {vol.Required("device_id"): DEVICE_ID}, extra=vol.PREVENT_EXTRA
)

RESTORE_GATE_THRESHOLDS_SCHEMA = vol.Schema(
    {
        vol.Required("device_id"): DEVICE_ID,
        vol.Optional("snapshot_id"): cv.string,
        vol.Optional("wait", default=False): cv.boolean,
    },
    extra=vol.PREVENT_EXTRA,
)

_SERVICES = (
    SERVICE_CALIBRATE_GATES,
    SERVICE_CANCEL_CALIBRATION,
    SERVICE_RESTORE_GATE_THRESHOLDS,
)
# Set in `hass.data[DOMAIN]` while the entry's teardown runs, so no new job can
# register after it started waiting for the running ones.
_DATA_CALIBRATION_CLOSING = "calibration_closing"


class _JobFailedError(Exception):
    """A phase failed with a job error code; `run()` turns it into `failed`."""

    def __init__(self, code: str, **placeholders: object) -> None:
        super().__init__(code)
        self.code = code
        template = ERROR_MESSAGES[code]
        if code in _NOTHING_WRITTEN_MESSAGES and not placeholders.get("n"):
            template = _NOTHING_WRITTEN_MESSAGES[code]
        self.message = template.format(**placeholders)


class _JobCancelledError(Exception):
    """A cancel request was honoured; `run()` turns it into `cancelled`."""


def _validation_error(key: str, **placeholders: str) -> ServiceValidationError:
    return ServiceValidationError(
        translation_domain=DOMAIN,
        translation_key=key,
        translation_placeholders=placeholders or None,
    )


def _log_missing_thresholds(device_id: str, missing: list[str]) -> None:
    _LOGGER.warning(
        "Apollo mmWave: device %s has not reported %d threshold values: %s",
        device_id,
        len(missing),
        ", ".join(missing),
    )


def _gate_number(hass: HomeAssistant, entity_id: str | None) -> int | None:
    """Read a gate-range number (max move gate, min gate, ...) as an int."""
    value = numeric_state(hass, entity_id)
    return None if value is None else int(value)


def _state_of(hass: HomeAssistant, entity_id: str | None) -> str | None:
    if entity_id is None:
        return None
    state = hass.states.get(entity_id)
    return None if state is None else state.state


@dataclass(frozen=True)
class JobSpec:
    """Everything the pre-flight established, handed to the job unchanged."""

    device_id: str
    kind: str
    params: dict[str, Any]
    entities: GateEntities
    context: Context
    max_move_gate: int | None = None
    max_still_gate: int | None = None
    min_gate: int | None = None
    max_gate: int | None = None
    restore_targets: dict[str, float] | None = None  # resolved id -> value
    restore_missing: tuple[str, ...] = ()
    restore_from: dict[str, Any] | None = None  # the snapshot being restored


@dataclass
class _Cell:
    """One gate channel's bookkeeping, from discovery to the result row."""

    gate: int
    channel: str
    threshold: str | None
    energy: str | None
    skipped: str | None
    unused: bool
    old: float | None = None
    new: int | None = None
    peak: int | None = None
    p95: int | None = None
    samples: int = 0
    flags: list[str] = field(default_factory=list)
    written: bool = False
    unchanged: bool = False
    confirmed: bool | None = None
    actual: float | None = None

    def payload(self) -> dict[str, Any]:
        """Return the wire shape of this channel's result."""
        return {
            "entity_id": self.threshold,
            "peak": self.peak,
            "p95": self.p95,
            "old": self.old,
            "new": self.new,
            "samples": self.samples,
            "written": self.written,
            "confirmed": self.confirmed,
            "actual": self.actual,
            "flags": list(self.flags),
            "skipped": self.skipped,
        }


@dataclass
class _WriteItem:
    """One threshold the job intends to write."""

    entity_id: str
    target: float
    cell: _Cell | None = None
    written: bool = False


def _gate_unused(spec: JobSpec, gate: int, channel: str) -> bool:
    if spec.entities.profile == PROFILE_LD2412:
        below = spec.min_gate is not None and gate < spec.min_gate
        above = spec.max_gate is not None and gate > spec.max_gate
        return below or above
    limit = spec.max_move_gate if channel == CHANNEL_MOVE else spec.max_still_gate
    return limit is not None and gate > limit


def _build_cells(spec: JobSpec) -> list[_Cell]:
    """Lay out every (gate, channel) of the device, ascending, move then still."""
    cells: list[_Cell] = []
    kind_filter = spec.params.get("kind", "both")
    for gate in spec.entities.gates():
        for channel in CHANNELS:
            threshold = spec.entities.threshold(gate, channel)
            energy = spec.entities.energy(gate, channel)
            skipped: str | None = None
            if kind_filter not in ("both", channel):
                skipped = SKIP_NOT_SELECTED
            elif energy is None:
                skipped = SKIP_NO_ENERGY
            elif threshold is None:
                skipped = SKIP_NO_THRESHOLD
            cells.append(
                _Cell(
                    gate=gate,
                    channel=channel,
                    threshold=threshold,
                    energy=energy,
                    skipped=skipped,
                    unused=_gate_unused(spec, gate, channel),
                )
            )
    return cells


def _planned_thresholds(spec: JobSpec) -> list[str]:
    """Return the threshold ids a calibrate job would write, in write order."""
    return [
        cell.threshold
        for cell in _build_cells(spec)
        if cell.skipped is None and cell.threshold is not None
    ]


def _chip_sent_thresholds(entities: GateEntities, written: list[str]) -> list[str]:
    """
    Return every threshold number whose state the chip receives with `written`.

    SPEC NOTE: the spec runs the numeric check over the thresholds the job
    "would write", but its own reasoning is about what the chip is sent. Every
    LD2412 write re-sends all 14 move and 14 still registers from the numbers'
    current states, so there the check covers every threshold of the device. An
    LD2410 write sends both numbers of its gate, and nothing at all when either
    lacks a value, so there it covers both numbers of every gate written. As
    the spec says, disabled entities are not visible to the check.
    """
    wanted = set(written)
    ordered: list[str] = []
    for gate in entities.gates():
        pair = [
            threshold
            for channel in CHANNELS
            if (threshold := entities.threshold(gate, channel)) is not None
        ]
        if entities.profile == PROFILE_LD2412 or wanted.intersection(pair):
            ordered.extend(pair)
    ordered.extend(entity_id for entity_id in written if entity_id not in ordered)
    return ordered


class CalibrationJob:
    """One calibrate or restore run for one device."""

    def __init__(
        self, hass: HomeAssistant, store: CalibrationStore, spec: JobSpec
    ) -> None:
        """Set the job up; `run()` does the work."""
        self.hass = hass
        self.spec = spec
        self.job_id = uuid.uuid4().hex
        self.device_id = spec.device_id
        self.kind = spec.kind
        self.params = spec.params
        self.entities = spec.entities
        self.context = spec.context
        self.status = STATUS_PREPARING
        self.sub_phase: str | None = None
        self.outcome: str | None = None
        self.started_at = dt_util.utcnow()
        self.finished_at: datetime | None = None
        self.phase_deadline: datetime | None = None
        self.elapsed_s: int | None = 0
        self.remaining_s: int | None = None
        self.samples = 0
        self.peaks: dict[str, dict[int, int]] = {CHANNEL_MOVE: {}, CHANNEL_STILL: {}}
        self.presence_ticks = 0
        self.moving_ticks = 0
        self.unavailable_seen = False
        self.engineering_off_ticks = 0
        self.captured: dict[str, float] = {}
        self.writes_done = 0
        self.writes_total = 0
        self.engineering_mode_turned_on = False
        self.cancel_requested = asyncio.Event()
        self.shutdown_requested = False
        self.done = asyncio.Event()
        self.result: dict[str, Any] | None = None
        self.error: dict[str, str] | None = None
        self.task: asyncio.Task[None] | None = None
        self.snapshot_id: str | None = None
        self.unverified: list[dict[str, Any]] = []
        self.gates_off: list[dict[str, Any]] = []
        self.restore_missing = list(spec.restore_missing)

        self._store = store
        self._cells = _build_cells(spec) if spec.kind == KIND_CALIBRATE else []
        self._sampled = [cell for cell in self._cells if cell.skipped is None]
        self._items: list[_WriteItem] = []
        self._unchanged = 0  # items captured within tolerance of their target
        self._init_tick_state()

    def _init_tick_state(self) -> None:
        """Reset the bookkeeping the 1 s tick and the phase signal share."""
        self._ticks: dict[str, list[float]] = {}
        self._event_peak: dict[str, float] = {}
        self._tick = 0
        self._t0: int | None = None
        self._phase_start_tick = 0
        self._signal_event = asyncio.Event()
        self._signals_sent = 0
        self._signals_seen = 0
        self._pending: Exception | None = None
        self._unsub_tick: CALLBACK_TYPE | None = None
        self._unsub_state: CALLBACK_TYPE | None = None

    # ----------------------------------------------------------------- views

    def public_state(self) -> dict[str, Any]:
        """Return the `job` object of the websocket payload."""
        return {
            "job_id": self.job_id,
            "kind": self.kind,
            "status": self.status,
            "sub_phase": self.sub_phase,
            "started_at": self.started_at.isoformat(),
            "elapsed_s": self.elapsed_s,
            "remaining_s": self.remaining_s,
            "duration_s": self.params.get("duration_s"),
            "settle_s": self.params.get("settle_s"),
            "samples": self.samples,
            "peaks": {
                channel: {str(gate): value for gate, value in table.items()}
                for channel, table in self.peaks.items()
            },
            "writes_done": self.writes_done,
            "writes_total": self.writes_total,
            "apply": bool(self.params.get("apply", True)),
            "cancel_requested": self.cancel_requested.is_set(),
            "engineering_mode_turned_on": self.engineering_mode_turned_on,
        }

    def _fraction(self, ticks: int, sensor: str | None) -> float | None:
        if sensor is None or self.samples == 0:
            return None
        return ticks / self.samples

    def _warnings(self) -> list[str]:
        warnings: list[str] = []
        presence = self._fraction(self.presence_ticks, self.entities.radar_target)
        if presence is not None and presence > PRESENCE_WARN_FRACTION:
            warnings.append(WARN_PRESENCE)
        if self.unavailable_seen:
            warnings.append(WARN_RADAR_UNAVAILABLE)
        if self.unverified:
            warnings.append(WARN_UNVERIFIED)
        if self.gates_off:
            warnings.append(WARN_GATE_OFF)
        return warnings

    def _counts(self) -> tuple[int, int]:
        if self.kind == KIND_RESTORE:
            return self.writes_done, self._unchanged
        computed = [cell for cell in self._cells if cell.new is not None]
        if self.outcome == OUTCOME_PREVIEW:
            unchanged = sum(1 for cell in computed if cell.unchanged)
            return len(computed) - unchanged, unchanged
        return (
            sum(1 for cell in computed if cell.written),
            sum(1 for cell in computed if cell.unchanged),
        )

    def result_payload(self) -> dict[str, Any]:
        """Return the result dict stored as `last_result` and returned by `wait`."""
        changed, unchanged = self._counts()
        gates = sorted({cell.gate for cell in self._cells})
        by_gate = {(cell.gate, cell.channel): cell for cell in self._cells}
        payload: dict[str, Any] = {
            "job_id": self.job_id,
            "device_id": self.device_id,
            "kind": self.kind,
            "status": self.status,
            "outcome": self.outcome,
            "snapshot_id": self.snapshot_id,
            "started_at": self.started_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "duration_s": self.params.get("duration_s"),
            "settle_s": self.params.get("settle_s"),
            "margin": self.params.get("margin"),
            "margin_pct": self.params.get("margin_pct"),
            "kind_filter": self.params.get("kind"),
            # False for a preview, so a stored failure or stop can be named as
            # one ("Last preview ... was stopped"); None on a restore.
            "apply": self.params.get("apply"),
            "samples": self.samples,
            "presence_fraction": self._fraction(
                self.presence_ticks, self.entities.radar_target
            ),
            "moving_fraction": self._fraction(
                self.moving_ticks, self.entities.moving_target
            ),
            "engineering_mode_turned_on": self.engineering_mode_turned_on,
            "profile": self.entities.profile,
            "max_move_gate": self.spec.max_move_gate,
            "max_still_gate": self.spec.max_still_gate,
            "min_gate": self.spec.min_gate,
            "max_gate": self.spec.max_gate,
            "gates": [
                {
                    "gate": gate,
                    CHANNEL_MOVE: by_gate[(gate, CHANNEL_MOVE)].payload(),
                    CHANNEL_STILL: by_gate[(gate, CHANNEL_STILL)].payload(),
                }
                for gate in gates
            ],
            "changed": changed,
            "unchanged": unchanged,
            "writes_done": self.writes_done,
            "writes_total": self.writes_total,
            "unverified": list(self.unverified),
            "gates_off": list(self.gates_off),
            "warnings": self._warnings(),
            "error": self.error,
        }
        if self.kind == KIND_RESTORE:
            source = self.spec.restore_from or {}
            # SPEC NOTE: `restored_from` is additive. The spec's restore result
            # names `restored`, `unchanged`, `missing` and `unverified`; the id
            # and time of the snapshot that was written back are recorded so a
            # reader need not infer them from the snapshot list.
            payload.update(
                {
                    "restored": changed,
                    "missing": list(self.restore_missing),
                    "restored_from": {
                        "id": source.get("id"),
                        "taken_at": source.get("taken_at"),
                    },
                }
            )
        return payload

    def push(self) -> None:
        """Tell subscribed cards the job changed (once per tick at most)."""
        async_dispatcher_send(self.hass, SIGNAL_CALIBRATION_UPDATED, self.device_id)

    def request_shutdown(self) -> None:
        """Ask the job to stop because the entry is unloading or HA is stopping."""
        self.shutdown_requested = True
        self.cancel_requested.set()

    # --------------------------------------------------------------- helpers

    def _switch_state(self) -> str | None:
        return _state_of(self.hass, self.entities.engineering_mode)

    def _switch_reads_off(self) -> bool:
        return (
            self.entities.engineering_mode is None or self._switch_state() == STATE_OFF
        )

    def _store_if_present(self) -> CalibrationStore | None:
        store = self.hass.data.get(DOMAIN, {}).get(DATA_CALIBRATION_STORE)
        return store if store is self._store else None

    async def _call(
        self, domain: str, service: str, entity_id: str, value: float | None = None
    ) -> None:
        data: dict[str, Any] = {"entity_id": entity_id}
        if value is not None:
            data["value"] = value
        _LOGGER.debug(
            "Apollo mmWave: job %s calling %s.%s on %s%s",
            self.job_id,
            domain,
            service,
            entity_id,
            "" if value is None else f" with {value}",
        )
        await self.hass.services.async_call(
            domain, service, data, blocking=True, context=self.context
        )

    def _set_status(self, status: str, sub_phase: str | None = None) -> None:
        self.status = status
        self.sub_phase = sub_phase
        if status != STATUS_SAMPLING:
            # Only the settle countdown and the listen count down (spec 3.6).
            self.remaining_s = None
        self._phase_start_tick = self._tick
        _LOGGER.info(
            "Apollo mmWave: %s job %s on device %s is now %s%s",
            self.kind,
            self.job_id,
            self.device_id,
            status,
            f" ({sub_phase})" if sub_phase else "",
        )

    def _check_interrupt(self) -> None:
        if self.shutdown_requested:
            raise _JobFailedError(ERR_CANCELLED_BY_SHUTDOWN)
        if self.cancel_requested.is_set():
            raise _JobCancelledError

    def _fail(self, code: str, message: str) -> None:
        self.status = STATUS_FAILED
        self.outcome = OUTCOME_FAILED
        self.sub_phase = None
        self.error = {"code": code, "message": message}

    def _marker(self, phase: str | None) -> dict[str, Any]:
        prior = self._store.interrupted(self.device_id)
        return {
            "job_id": self.job_id,
            "kind": self.kind,
            "phase": phase,
            "started_at": self.started_at.isoformat(),
            # Both engineering facts outlive the job that set them until a
            # read-back says off: an earlier interrupted job may have left the
            # mode on, and a restore must not hide that.
            "engineering_mode_turned_on": self.engineering_mode_turned_on
            or bool(prior and prior.get("engineering_mode_turned_on", True)),
            "snapshot_id": self.snapshot_id,
            KEY_LEFT_ON: bool(prior and prior.get(KEY_LEFT_ON)),
        }

    async def _save_marker(self, phase: str) -> None:
        """
        Write the `interrupted` marker and hard-save it (it exists to survive).

        Raises a job failure when it cannot, because the marker must be on disk
        before the device write it describes: with the store gone the entry is
        unloading (`cancelled_by_shutdown`), and a failed save is reported like
        a failed snapshot save (`snapshot_failed`, nothing was changed yet).
        """
        store = self._store_if_present()
        if store is None:
            raise _JobFailedError(ERR_CANCELLED_BY_SHUTDOWN)
        prior = store.interrupted(self.device_id)
        store.set_interrupted(self.device_id, self._marker(phase))
        try:
            await store.async_save()
        except Exception as err:
            # Memory must match disk, as for the snapshot.
            if prior is None:
                store.clear_interrupted(self.device_id)
            else:
                store.set_interrupted(self.device_id, prior)
            _LOGGER.warning(
                "Apollo mmWave: could not save the calibration marker for %s: %s",
                self.device_id,
                err,
            )
            raise _JobFailedError(ERR_SNAPSHOT_FAILED) from err

    # ------------------------------------------------------------------ tick

    def _install_tick(self) -> None:
        self._unsub_tick = async_track_time_interval(
            self.hass,
            self._on_tick,
            timedelta(seconds=TICK_S),
            name=f"apollo_mmwave calibration {self.device_id}",
        )

    def _remove_timers(self) -> None:
        if self._unsub_tick is not None:
            self._unsub_tick()
            self._unsub_tick = None
        if self._unsub_state is not None:
            self._unsub_state()
            self._unsub_state = None

    @callback
    def _on_tick(self, _now: datetime) -> None:
        self._tick += 1
        try:
            self._run_tick()
        except (_JobFailedError, _JobCancelledError) as err:
            self._deliver(err)
        except Exception as err:
            _LOGGER.exception("Apollo mmWave: job %s tick failed", self.job_id)
            self._deliver(
                _JobFailedError(
                    ERR_UNEXPECTED, exception=f"{type(err).__name__}: {err}"
                )
            )
        finally:
            self.push()

    def _run_tick(self) -> None:
        if self.kind != KIND_CALIBRATE or self.status not in (
            STATUS_PREPARING,
            STATUS_SAMPLING,
        ):
            return
        self._check_interrupt()
        if self._t0 is not None:
            self._check_liveness()
        if self.status == STATUS_PREPARING:
            self._tick_preparing()
        else:
            self._tick_sampling()

    def _check_liveness(self) -> None:
        """Abort when the mode was turned off or background correction started."""
        if self._switch_state() == STATE_OFF:
            self.engineering_off_ticks += 1
            if self.engineering_off_ticks >= ENGINEERING_LOST_TICKS:
                raise _JobFailedError(ERR_ENGINEERING_MODE_LOST)
        else:
            self.engineering_off_ticks = 0
        if _state_of(self.hass, self.entities.background_status) == STATE_ON:
            raise _JobFailedError(ERR_BACKGROUND_CORRECTION_STARTED)

    def _engineering_confirmed(self) -> None:
        """Record t0: the countdown and the warmup both start now."""
        self._t0 = self._tick
        settle_s = int(self.params["settle_s"])
        self.sub_phase = SUB_SETTLE if settle_s > 0 else SUB_WARMUP
        self.elapsed_s = 0
        self.remaining_s = settle_s if settle_s > 0 else None
        self.phase_deadline = dt_util.utcnow() + timedelta(
            seconds=max(settle_s, ENERGY_WARMUP_TIMEOUT_S)
        )

    def _any_energy_numeric(self) -> bool:
        return any(
            numeric_state(self.hass, cell.energy) is not None for cell in self._sampled
        )

    def _tick_preparing(self) -> None:
        if self._t0 is None:
            if self._switch_state() == STATE_ON:
                self._engineering_confirmed()
            elif self._tick - self._phase_start_tick >= ENGINEERING_CONFIRM_TIMEOUT_S:
                raise _JobFailedError(ERR_ENGINEERING_MODE_NOT_CONFIRMED)
            else:
                self.elapsed_s = self._tick - self._phase_start_tick
                return
            if self._t0 is None:
                return
        since_t0 = self._tick - self._t0
        settle_s = int(self.params["settle_s"])
        energy_ok = self._any_energy_numeric()
        self.elapsed_s = since_t0
        if since_t0 >= settle_s and energy_ok:
            self._start_sampling()
            return
        if not energy_ok and since_t0 >= ENERGY_WARMUP_TIMEOUT_S:
            raise _JobFailedError(ERR_NO_ENERGY_DATA)
        if since_t0 >= settle_s:
            self.sub_phase = SUB_WARMUP
            self.remaining_s = None
        else:
            self.sub_phase = SUB_SETTLE
            self.remaining_s = settle_s - since_t0

    def _start_sampling(self) -> None:
        self._set_status(STATUS_SAMPLING)
        self.remaining_s = None
        energies = [cell.energy for cell in self._sampled if cell.energy]
        if energies:
            self._unsub_state = async_track_state_change_event(
                self.hass, energies, self._on_energy_event
            )
        self._signal()
        self._tick_sampling()

    @callback
    def _on_energy_event(self, event: Event[EventStateChangedData]) -> None:
        new_state = event.data["new_state"]
        if new_state is None:
            return
        value = finite_float(new_state.state)
        if value is None:
            return
        entity_id = event.data["entity_id"]
        self._event_peak[entity_id] = max(self._event_peak.get(entity_id, value), value)

    def _tick_sampling(self) -> None:
        self.samples += 1
        for cell in self._sampled:
            if cell.energy is None:
                continue
            state = self.hass.states.get(cell.energy)
            if state is None or state.state == STATE_UNAVAILABLE:
                self.unavailable_seen = True
                continue
            value = finite_float(state.state)
            if value is not None:
                self._ticks.setdefault(cell.energy, []).append(value)
        if _state_of(self.hass, self.entities.radar_target) == STATE_ON:
            self.presence_ticks += 1
        if _state_of(self.hass, self.entities.moving_target) == STATE_ON:
            self.moving_ticks += 1
        self._update_peaks()
        duration_s = int(self.params["duration_s"])
        self.elapsed_s = self.samples
        self.remaining_s = duration_s - self.samples
        if self.samples >= duration_s:
            self.remaining_s = 0
            self._signal()

    def _update_peaks(self) -> None:
        for cell in self._sampled:
            if cell.energy is None:
                continue
            ticks = self._ticks.get(cell.energy)
            event_peak = self._event_peak.get(cell.energy)
            candidates = [max(ticks)] if ticks else []
            if event_peak is not None:
                candidates.append(event_peak)
            if candidates:
                self.peaks[cell.channel][cell.gate] = math.ceil(max(candidates))

    def _signal(self) -> None:
        self._signals_sent += 1
        self._signal_event.set()

    def _deliver(self, err: Exception) -> None:
        if self._pending is None:
            self._pending = err
        self._signal_event.set()

    async def _await_signal(self) -> None:
        """Wait for the tick to end the current phase, or to deliver an abort."""
        while self._pending is None and self._signals_seen >= self._signals_sent:
            self._signal_event.clear()
            await self._signal_event.wait()
        if (pending := self._pending) is not None:
            self._pending = None
            raise pending
        self._signals_seen += 1

    # ---------------------------------------------------------------- phases

    async def _prepare(self) -> None:
        """Turn engineering mode on if needed, then wait for sampling to start."""
        switch = self.entities.engineering_mode
        if switch is None:
            raise _JobFailedError(ERR_ENGINEERING_MODE_NOT_CONFIRMED)
        if self._switch_state() == STATE_ON:
            self._engineering_confirmed()
        else:
            self.sub_phase = SUB_ENGINEERING
            self.push()
            # The marker goes to disk before the device write, so a crash in
            # between still leaves a banner (addendum 4).
            self.engineering_mode_turned_on = True
            try:
                await self._save_marker(PHASE_ENGINEERING)
            except _JobFailedError:
                # The switch was never touched.
                self.engineering_mode_turned_on = False
                raise
            await self._call("switch", "turn_on", switch)
            if self._switch_state() == STATE_ON:
                self._engineering_confirmed()
        self.push()
        await self._await_signal()

    async def _sample(self) -> None:
        """Wait for the tick to collect `duration_s` samples."""
        await self._await_signal()
        if self._unsub_state is not None:
            self._unsub_state()
            self._unsub_state = None

    def _expected_off(self, cell: _Cell) -> bool:
        return (
            self.entities.profile == PROFILE_LD2410
            and cell.channel == CHANNEL_STILL
            and cell.gate in _LD2410_EXPECTED_OFF_STILL_GATES
        )

    def _compute(self) -> None:
        """Turn the samples into proposals (pure, `compute_channel`)."""
        margins = Margins(
            absolute=int(self.params["margin"]), percent=int(self.params["margin_pct"])
        )
        for cell in self._cells:
            cell.old = numeric_state(self.hass, cell.threshold)
            if (
                cell.skipped is not None
                or cell.threshold is None
                or cell.energy is None
            ):
                cell.flags = [FLAG_SKIPPED]
                continue
            samples = ChannelSamples(
                ticks=tuple(self._ticks.get(cell.energy, ())),
                event_peak=self._event_peak.get(cell.energy),
            )
            result = compute_channel(
                samples, cell.old, number_bounds(self.hass, cell.threshold), margins
            )
            cell.new = result.new
            cell.peak = result.peak
            cell.p95 = result.p95
            cell.samples = result.samples
            cell.flags = list(result.flags)
            if cell.unused:
                cell.flags.append(FLAG_UNUSED)
            if cell.new is not None and cell.old is not None:
                cell.unchanged = abs(cell.new - cell.old) <= VERIFY_TOLERANCE
            if (
                FLAG_OFF in cell.flags
                and not cell.unused
                and not self._expected_off(cell)
            ):
                self.gates_off.append(
                    {"gate": cell.gate, "channel": cell.channel, "peak": cell.peak}
                )

    def _write_items(self) -> list[_WriteItem]:
        if self.kind == KIND_RESTORE:
            targets = self.spec.restore_targets or {}
            return [
                _WriteItem(entity_id=entity_id, target=targets[entity_id])
                for entity_id in self._restore_order(targets)
            ]
        return [
            _WriteItem(entity_id=cell.threshold, target=cell.new, cell=cell)
            for cell in self._cells
            if cell.skipped is None
            and cell.threshold is not None
            and cell.new is not None
        ]

    def _restore_order(self, targets: dict[str, float]) -> list[str]:
        """Gate by gate, move then still, with unmatched ids last."""
        position: dict[str, int] = {}
        for index, gate in enumerate(self.entities.gates()):
            for offset, channel in enumerate(CHANNELS):
                threshold = self.entities.threshold(gate, channel)
                if threshold is not None:
                    position[threshold] = index * len(CHANNELS) + offset
        return sorted(targets, key=lambda eid: (position.get(eid, len(position)), eid))

    async def _refresh(self) -> None:
        """LD2412: ask the chip for its thresholds so the capture is not optimistic."""
        self.sub_phase = SUB_REFRESH
        self.push()
        button = self.entities.query_params_button
        if button is not None:
            await self._call("button", "press", button)
        else:
            # SPEC NOTE: the spec assumes the button exists; without it the
            # capture is HA's copy and the read-back plus Undo are the backstop.
            _LOGGER.warning(
                "Apollo mmWave: device %s has no query params button; thresholds"
                " could not be refreshed before the snapshot.",
                self.device_id,
            )
        await asyncio.sleep(VERIFY_SETTLE_S)
        self._check_interrupt()
        self.sub_phase = None

    def _require_numeric(self, items: list[_WriteItem]) -> None:
        sent = _chip_sent_thresholds(self.entities, [item.entity_id for item in items])
        missing = [
            entity_id
            for entity_id in sent
            if numeric_state(self.hass, entity_id) is None
        ]
        if missing:
            _log_missing_thresholds(self.device_id, missing)
            raise _JobFailedError(ERR_THRESHOLDS_NOT_NUMERIC, count=len(missing))

    def _capture(self, items: list[_WriteItem]) -> dict[str, float]:
        """Read every threshold to be written, right now, as the single source."""
        captured: dict[str, float] = {}
        for item in items:
            value = numeric_state(self.hass, item.entity_id)
            if value is None:
                # `_require_numeric` ran a moment ago; treat a vanished state as
                # the radar dropping out rather than guessing.
                raise _JobFailedError(
                    ERR_DEVICE_OFFLINE, n=self.writes_done, total=len(items)
                )
            captured[item.entity_id] = value
            if item.cell is not None:
                item.cell.old = value
        self.captured = captured
        return captured

    async def _save_snapshot(self, captured: dict[str, float]) -> None:
        registry = er.async_get(self.hass)
        values: dict[str, dict[str, Any]] = {}
        for entity_id, value in captured.items():
            entry = registry.async_get(entity_id)
            values[entity_id] = {
                "value": value,
                "unique_id": entry.unique_id if entry else None,
                "platform": entry.platform if entry else None,
            }
        snapshot = {
            "id": uuid.uuid4().hex,
            "taken_at": dt_util.utcnow().isoformat(),
            "reason": self.kind,
            "job_id": self.job_id,
            "values": values,
        }
        store = self._store_if_present()
        if store is None:
            # The entry is unloading; this is not a disk problem.
            raise _JobFailedError(ERR_CANCELLED_BY_SHUTDOWN)
        store.add_snapshot(self.device_id, snapshot)
        try:
            await store.async_save()
        except Exception as err:
            # Memory must match disk, or the card would offer an Undo that a
            # restart forgets.
            store.discard_snapshot(self.device_id, snapshot["id"])
            _LOGGER.warning(
                "Apollo mmWave: could not save the threshold snapshot for %s: %s",
                self.device_id,
                err,
            )
            raise _JobFailedError(ERR_SNAPSHOT_FAILED) from err
        self.snapshot_id = snapshot["id"]

    async def _write_all(self, plan: list[_WriteItem]) -> None:
        for item in plan:
            self._check_interrupt()
            if numeric_state(self.hass, item.entity_id) is None:
                raise _JobFailedError(
                    ERR_DEVICE_OFFLINE, n=self.writes_done, total=self.writes_total
                )
            try:
                await self._call("number", "set_value", item.entity_id, item.target)
            except Unauthorized:
                raise
            except Exception as err:
                raise _JobFailedError(
                    ERR_WRITE_FAILED,
                    n=self.writes_done,
                    total=self.writes_total,
                    entity_id=item.entity_id,
                ) from err
            item.written = True
            if item.cell is not None:
                item.cell.written = True
            self.writes_done += 1
            await asyncio.sleep(WRITE_SPACING_S)

    async def _apply(self) -> None:
        """Refresh (LD2412), capture, snapshot, mark, then write with pacing."""
        if not self.params.get("apply", True):
            self.outcome = OUTCOME_PREVIEW
            return
        items = self._write_items()
        if not items:
            # Every gate was `no_data` (a restore always has targets): fail
            # before any device touch rather than finish with an empty result.
            raise _JobFailedError(ERR_NO_GATE_DATA)
        self._set_status(STATUS_APPLYING)
        self._items = items
        if self.entities.profile == PROFILE_LD2412:
            await self._refresh()
        self._require_numeric(items)
        captured = self._capture(items)
        plan: list[_WriteItem] = []
        for item in items:
            within = abs(item.target - captured[item.entity_id]) <= VERIFY_TOLERANCE
            if item.cell is not None:
                # `_compute` judged this against the value before the refresh;
                # the capture is the reference, so a cell is never both.
                item.cell.unchanged = within
            if not within:
                plan.append(item)
        self.writes_total = len(plan)
        self._unchanged = len(items) - len(plan)
        # The first applying push waits for the plan, so the card never shows
        # "0 of 0" (an LD2412 has already shown its refresh sub-phase).
        self.push()
        if not plan:
            # SPEC NOTE: the spec takes the snapshot unconditionally. With
            # nothing to write, no snapshot or marker is taken and
            # `snapshot_id` stays null: a snapshot guards writes, and a copy of
            # values that did not change would only push an older snapshot out
            # of the history.
            return
        await self._save_snapshot(captured)
        await self._save_marker(PHASE_APPLYING)
        await self._write_all(plan)

    async def _verify(self) -> None:
        """Read every written number back and compare it with its target."""
        if self.outcome == OUTCOME_PREVIEW:
            return
        self._set_status(STATUS_VERIFYING)
        self.push()
        button = self.entities.query_params_button
        if self.entities.profile == PROFILE_LD2412 and button is not None:
            await self._call("button", "press", button)
        await asyncio.sleep(VERIFY_SETTLE_S)
        for item in self._items:
            if not item.written:
                continue
            actual = numeric_state(self.hass, item.entity_id)
            confirmed = (
                actual is not None and abs(actual - item.target) <= VERIFY_TOLERANCE
            )
            if item.cell is not None:
                item.cell.confirmed = confirmed
                item.cell.actual = actual
            if not confirmed:
                self.unverified.append(
                    {
                        "entity_id": item.entity_id,
                        "asked": item.target,
                        "actual": actual,
                    }
                )
        if self.unverified:
            _LOGGER.warning(
                "Apollo mmWave: job %s could not confirm %d written values on %s: %s",
                self.job_id,
                len(self.unverified),
                self.device_id,
                ", ".join(entry["entity_id"] for entry in self.unverified),
            )
        if self.kind == KIND_RESTORE:
            self.outcome = OUTCOME_RESTORED
        else:
            self.outcome = OUTCOME_PARTIAL if self.unverified else OUTCOME_APPLIED

    # ------------------------------------------------------------------- run

    async def run(self) -> None:
        """Run every phase; the finally contract runs on every exit path."""
        cancelled: asyncio.CancelledError | None = None
        _LOGGER.info(
            "Apollo mmWave: %s job %s started on device %s",
            self.kind,
            self.job_id,
            self.device_id,
        )
        try:
            await self._run_phases()
        except _JobCancelledError:
            self.status = STATUS_CANCELLED
            self.outcome = OUTCOME_CANCELLED
            self.sub_phase = None
        except _JobFailedError as err:
            self._fail(err.code, err.message)
        except asyncio.CancelledError as err:
            # Delivered once; HA cancels every background task before it fires
            # EVENT_HOMEASSISTANT_STOP and again on unload, so the flag is not
            # consulted (addendum 1).
            cancelled = err
            self._fail(
                ERR_CANCELLED_BY_SHUTDOWN, ERROR_MESSAGES[ERR_CANCELLED_BY_SHUTDOWN]
            )
        except Unauthorized:
            _LOGGER.warning(
                "Apollo mmWave: job %s stopped: the user may not control the"
                " radar's entities (%s written)",
                self.job_id,
                self.writes_done,
            )
            self._fail(ERR_NOT_ALLOWED, ERROR_MESSAGES[ERR_NOT_ALLOWED])
        except Exception as err:
            _LOGGER.exception("Apollo mmWave: job %s failed unexpectedly", self.job_id)
            self._fail(
                ERR_UNEXPECTED,
                ERROR_MESSAGES[ERR_UNEXPECTED].format(
                    exception=f"{type(err).__name__}: {err}"
                ),
            )
        finally:
            cancelled = await self._finish(cancelled)
        if cancelled is not None:
            raise cancelled

    async def _run_phases(self) -> None:
        self._install_tick()
        if self.kind == KIND_CALIBRATE:
            await self._prepare()
            await self._sample()
            self._compute()
        await self._apply()
        await self._verify()
        self.status = STATUS_DONE
        self.sub_phase = None

    async def _restore_engineering_mode(
        self, cancelled: asyncio.CancelledError | None
    ) -> asyncio.CancelledError | None:
        """Turn the switch back off if this job turned it on; never raises."""
        switch = self.entities.engineering_mode
        if (
            switch is None
            or not self.engineering_mode_turned_on
            or self._switch_state() == STATE_OFF
        ):
            return cancelled
        try:
            async with asyncio.timeout(SHUTDOWN_RESTORE_TIMEOUT_S):
                await self._call("switch", "turn_off", switch)
                await asyncio.sleep(RESTORE_READBACK_S)
        except asyncio.CancelledError as err:
            # A second cancellation is tolerated: the restore attempt was made.
            _LOGGER.warning(
                "Apollo mmWave: job %s was cancelled again while turning Radar"
                " Engineering Mode off",
                self.job_id,
            )
            return cancelled if cancelled is not None else err
        except Exception as err:  # noqa: BLE001 - the finally must never raise
            _LOGGER.warning(
                "Apollo mmWave: job %s could not turn Radar Engineering Mode off"
                " (%s): %s",
                self.job_id,
                type(err).__name__,
                err,
            )
        return cancelled

    async def _settle_marker(self) -> None:
        """
        Clear or rewrite the `interrupted` marker from the switch read-back.

        `phase` and `left_on` are independent facts (addendum 3). A finish the
        job reached on its own, whatever its status, clears the write phase:
        the result it persists carries `writes_done`, and only a shutdown keeps
        the phase it was in so the banner can still offer Undo after the
        restart. The engineering fact survives any finish while the switch does
        not read `off`, whether this job turned the mode on or an earlier
        interrupted one did; `left_on` is set when this job's own turn-off was
        not echoed. Everything is cleared the moment the switch reads `off`.
        """
        store = self._store_if_present()
        if store is None:
            return
        current = store.interrupted(self.device_id)
        switch_off = self._switch_reads_off()
        if current is None and (switch_off or not self.engineering_mode_turned_on):
            return
        shutdown = (
            self.error is not None and self.error["code"] == ERR_CANCELLED_BY_SHUTDOWN
        )
        own = current is not None and current.get("job_id") == self.job_id
        # SPEC NOTE: a marker without the key predates it; assume the mode may
        # still be on rather than hide the banner.
        prior_turned_on = bool(
            current and current.get("engineering_mode_turned_on", True)
        )
        turned_on = not switch_off and (
            self.engineering_mode_turned_on or prior_turned_on
        )
        left_on = not switch_off and (
            self.engineering_mode_turned_on
            or bool(current and current.get(KEY_LEFT_ON))
        )
        phase: str | None
        if shutdown and own and (current.get("phase") == PHASE_APPLYING or turned_on):
            phase = current.get("phase")
        elif turned_on:
            phase = PHASE_ENGINEERING
        else:
            phase = None
        if phase is None and not left_on:
            changed = store.clear_interrupted(self.device_id)
        else:
            base = current if current is not None else self._marker(phase)
            store.set_interrupted(
                self.device_id, {**base, "phase": phase, KEY_LEFT_ON: left_on}
            )
            changed = True
        if not changed:
            return
        try:
            await store.async_save()
        except Exception as err:  # noqa: BLE001 - the finally must never raise
            _LOGGER.warning(
                "Apollo mmWave: could not save the calibration marker for %s: %s",
                self.device_id,
                err,
            )

    async def _finish(
        self, cancelled: asyncio.CancelledError | None
    ) -> asyncio.CancelledError | None:
        """Run the finally contract: timers, restore, marker, result, registry."""
        self.finished_at = dt_util.utcnow()
        self.remaining_s = None
        self._remove_timers()
        cancelled = await self._restore_engineering_mode(cancelled)
        await self._settle_marker()
        self.result = self.result_payload()
        store = self._store_if_present()
        if store is not None:
            store.set_last_result(self.device_id, self.result)
            store.async_delay_save()
        else:
            _LOGGER.info(
                "Apollo mmWave: job %s finished after the store was unloaded;"
                " its result was not persisted",
                self.job_id,
            )
        jobs = self.hass.data.get(DOMAIN, {}).get(DATA_CALIBRATION_JOBS)
        if jobs is not None and jobs.get(self.device_id) is self:
            del jobs[self.device_id]
        self.push()
        self.hass.bus.async_fire(
            EVENT_CALIBRATION_FINISHED,
            {
                "device_id": self.device_id,
                "job_id": self.job_id,
                "kind": self.kind,
                "status": self.status,
                "outcome": self.outcome,
                "changed": self.result["changed"],
                "snapshot_id": self.snapshot_id,
            },
        )
        _LOGGER.info(
            "Apollo mmWave: %s job %s on device %s finished: %s (%s)%s",
            self.kind,
            self.job_id,
            self.device_id,
            self.status,
            self.outcome,
            f", {self.error['code']}: {self.error['message']}" if self.error else "",
        )
        self.done.set()
        return cancelled


# ------------------------------------------------------------------ payload


def _entities_info(hass: HomeAssistant, entities: GateEntities) -> dict[str, Any]:
    return {
        "profile": entities.profile,
        "gate_count": entities.gate_count,
        "engineering_mode": entities.engineering_mode,
        "engineering_mode_on": _state_of(hass, entities.engineering_mode) == STATE_ON,
        "background_status": entities.background_status,
        "background_status_on": _state_of(hass, entities.background_status) == STATE_ON,
        # The card presses it to fetch thresholds a long-running radar never
        # reported (its answer to `thresholds_not_numeric`), on either chip.
        "query_params_button": entities.query_params_button,
        "max_move_gate": _gate_number(hass, entities.max_move_gate),
        "max_still_gate": _gate_number(hass, entities.max_still_gate),
        "min_gate": _gate_number(hass, entities.min_gate),
        "max_gate": _gate_number(hass, entities.max_gate),
    }


def calibration_payload(hass: HomeAssistant, device_id: str) -> dict[str, Any]:
    """Build one device's calibration state as the card sees it."""
    data = hass.data.get(DOMAIN, {})
    store: CalibrationStore | None = data.get(DATA_CALIBRATION_STORE)
    jobs: dict[str, CalibrationJob] = data.get(DATA_CALIBRATION_JOBS) or {}
    job = jobs.get(device_id)
    # Rebuilt on every push (one registry scan) so a device whose entities
    # registered late becomes calibratable without a reload.
    entities = resolve_gate_entities(hass, device_id)
    return {
        "job": job.public_state() if job is not None else None,
        "snapshots": store.snapshots_summary(device_id) if store else [],
        "last_result": store.last_result(device_id) if store else None,
        "interrupted": store.interrupted(device_id) if store else None,
        "entities": _entities_info(hass, entities) if entities else None,
    }


# ---------------------------------------------------------------- pre-flight


def _single_device_id(hass: HomeAssistant, call: ServiceCall) -> str:
    """Read the one device a call targets, or raise a translated refusal."""
    raw = call.data.get("device_id")
    if isinstance(raw, list):
        if len(raw) > 1:
            raise _validation_error(TR_MULTIPLE_DEVICES, count=str(len(raw)))
        raw = raw[0] if raw else ""
    device_id = raw.strip() if isinstance(raw, str) else ""
    if not device_id or dr.async_get(hass).async_get(device_id) is None:
        raise _validation_error(TR_UNKNOWN_DEVICE, device_id=device_id)
    return device_id


async def _user_for_call(hass: HomeAssistant, call: ServiceCall) -> User | None:
    """Look the calling user up (the only await of the pre-flight)."""
    user_id = call.context.user_id
    if user_id is None:
        return None
    user = await hass.auth.async_get_user(user_id)
    if user is None:
        # SPEC NOTE: a user id that names no user is refused rather than treated
        # as unrestricted.
        raise _validation_error(TR_NOT_ALLOWED)
    return user


def _runtime(
    hass: HomeAssistant, *, starting: bool = True
) -> tuple[CalibrationStore, dict[str, CalibrationJob]]:
    """
    Return the store and the job registry, or refuse the call.

    A call that would start a job is also refused while the entry's teardown
    runs or Home Assistant is stopping: its task would be created after the
    entry's tasks were cancelled, so nothing would stop it or wait for it.
    """
    data = hass.data.get(DOMAIN, {})
    store = data.get(DATA_CALIBRATION_STORE)
    jobs = data.get(DATA_CALIBRATION_JOBS)
    closing = starting and bool(data.get(_DATA_CALIBRATION_CLOSING))
    if store is None or jobs is None or closing:
        msg = "Apollo mmWave calibration is not loaded."
        raise HomeAssistantError(msg)
    if starting and hass.is_stopping:
        msg = "Home Assistant is stopping, so no calibration or restore can start."
        raise HomeAssistantError(msg)
    return store, jobs


def _check_online(hass: HomeAssistant, entity_ids: list[str]) -> None:
    if any(is_offline(hass, entity_id) for entity_id in entity_ids):
        raise _validation_error(TR_DEVICE_OFFLINE)


def _check_background(hass: HomeAssistant, entities: GateEntities) -> None:
    if _state_of(hass, entities.background_status) == STATE_ON:
        raise _validation_error(TR_BACKGROUND_CORRECTION_RUNNING)


def _check_numeric(hass: HomeAssistant, device_id: str, entity_ids: list[str]) -> None:
    missing = [eid for eid in entity_ids if numeric_state(hass, eid) is None]
    if missing:
        _log_missing_thresholds(device_id, missing)
        # The message only counts them; the ids stay in the placeholders for
        # anyone who reads the error object, and in the log line above.
        raise _validation_error(
            TR_THRESHOLDS_NOT_NUMERIC,
            count=str(len(missing)),
            entity_ids=", ".join(missing),
        )


def _check_permissions(user: User | None, entity_ids: list[str]) -> None:
    if user is None:
        return
    if not all(
        user.permissions.check_entity(eid, POLICY_CONTROL) for eid in entity_ids
    ):
        raise _validation_error(TR_NOT_ALLOWED)


def _gate_limits(hass: HomeAssistant, entities: GateEntities) -> dict[str, int | None]:
    return {
        "max_move_gate": _gate_number(hass, entities.max_move_gate),
        "max_still_gate": _gate_number(hass, entities.max_still_gate),
        "min_gate": _gate_number(hass, entities.min_gate),
        "max_gate": _gate_number(hass, entities.max_gate),
    }


def _preflight_calibrate(
    hass: HomeAssistant,
    jobs: dict[str, CalibrationJob],
    user: User | None,
    call: ServiceCall,
    device_id: str,
) -> JobSpec:
    """Run every calibrate check synchronously, then describe the job."""
    if device_id in jobs:
        raise _validation_error(TR_CALIBRATION_RUNNING)
    entities = resolve_gate_entities(hass, device_id)
    if entities is None:
        raise _validation_error(TR_NO_GATE_ENTITIES)
    params = dict(call.data)
    spec = JobSpec(
        device_id=device_id,
        kind=KIND_CALIBRATE,
        params=params,
        entities=entities,
        context=call.context,
        **_gate_limits(hass, entities),
    )
    thresholds = _planned_thresholds(spec)
    if not thresholds:
        raise _validation_error(TR_NO_GATE_ENTITIES)
    switch = entities.engineering_mode
    if switch is None:
        raise _validation_error(TR_ENGINEERING_MODE_MISSING)
    _check_online(hass, [switch, *thresholds])
    _check_background(hass, entities)
    _check_numeric(hass, device_id, _chip_sent_thresholds(entities, thresholds))
    if params["margin"] == 0 and params["margin_pct"] == 0:
        raise _validation_error(TR_MARGIN_ZERO)
    _check_permissions(user, [switch, *thresholds])
    return spec


def _resolve_snapshot_targets(
    hass: HomeAssistant, snapshot: dict[str, Any]
) -> tuple[dict[str, float], list[str]]:
    """
    Map stored ids to live ids (unique id first), listing the ones that are gone.

    A disabled entity counts as gone: it has no state object, so it could not
    be written, and refusing the whole restore as offline over it would be
    wrong (addendum 5).
    """
    registry = er.async_get(hass)
    targets: dict[str, float] = {}
    missing: list[str] = []
    for entity_id, stored in snapshot["values"].items():
        resolved: str | None = None
        unique_id = stored.get("unique_id")
        platform = stored.get("platform")
        if unique_id and platform:
            resolved = registry.async_get_entity_id(
                entity_id.partition(".")[0], platform, unique_id
            )
        if resolved is None and registry.async_get(entity_id) is not None:
            resolved = entity_id
        entry = registry.async_get(resolved) if resolved is not None else None
        if entry is None or entry.disabled_by is not None:
            missing.append(entity_id)
            continue
        targets[entry.entity_id] = float(stored["value"])
    return targets, missing


def _preflight_restore(
    hass: HomeAssistant,
    jobs: dict[str, CalibrationJob],
    user: User | None,
    call: ServiceCall,
    device_id: str,
) -> JobSpec:
    """Run the shared checks plus snapshot resolution, then describe the job."""
    store = _runtime(hass)[0]
    if device_id in jobs:
        raise _validation_error(TR_CALIBRATION_RUNNING)
    entities = resolve_gate_entities(hass, device_id)
    if entities is None:
        raise _validation_error(TR_NO_GATE_ENTITIES)
    snapshot = store.snapshot(device_id, call.data.get("snapshot_id"))
    if snapshot is None:
        raise _validation_error(TR_NO_SNAPSHOT)
    targets, missing = _resolve_snapshot_targets(hass, snapshot)
    if not targets:
        # SPEC NOTE: every stored entity is gone; nothing restorable is left.
        raise _validation_error(TR_NO_SNAPSHOT)
    resolved = list(targets)
    _check_online(hass, resolved)
    _check_background(hass, entities)
    _check_numeric(hass, device_id, _chip_sent_thresholds(entities, resolved))
    _check_permissions(user, resolved)
    return JobSpec(
        device_id=device_id,
        kind=KIND_RESTORE,
        params=dict(call.data),
        entities=entities,
        context=call.context,
        restore_targets=targets,
        restore_missing=tuple(missing),
        restore_from=snapshot,
        **_gate_limits(hass, entities),
    )


async def _launch(
    hass: HomeAssistant, entry: ConfigEntry, spec: JobSpec, call: ServiceCall
) -> ServiceResponse:
    """Register the job, start its task, fire the started event, maybe wait."""
    store, jobs = _runtime(hass)
    job = CalibrationJob(hass, store, spec)
    jobs[spec.device_id] = job
    job.task = entry.async_create_background_task(
        hass, job.run(), name=f"apollo_mmwave calibration {spec.device_id}"
    )
    hass.bus.async_fire(
        EVENT_CALIBRATION_STARTED,
        {"device_id": spec.device_id, "job_id": job.job_id, "kind": spec.kind},
    )
    job.push()
    if call.data.get("wait"):
        # The shield keeps a cancelled automation or a closed websocket from
        # cancelling the job itself.
        await asyncio.shield(job.done.wait())
        return job.result_payload() if call.return_response else None
    return job.public_state() if call.return_response else None


async def handle_calibrate_gates(
    hass: HomeAssistant, entry: ConfigEntry, call: ServiceCall
) -> ServiceResponse:
    """Start an empty-room calibration for one radar."""
    device_id = _single_device_id(hass, call)
    user = await _user_for_call(hass, call)
    # From here to the registration nothing awaits, so two calls cannot both
    # register a job for the same device.
    jobs = _runtime(hass)[1]
    spec = _preflight_calibrate(hass, jobs, user, call, device_id)
    return await _launch(hass, entry, spec, call)


async def handle_cancel_calibration(
    hass: HomeAssistant, call: ServiceCall
) -> ServiceResponse:
    """Ask the running job for one radar to stop; a no-op without one."""
    device_id = _single_device_id(hass, call)
    jobs = _runtime(hass, starting=False)[1]
    job = jobs.get(device_id)
    if job is None:
        _LOGGER.debug(
            "Apollo mmWave: cancel_calibration for %s found no running job", device_id
        )
    else:
        job.cancel_requested.set()
        job.push()
    return {"cancelled": job is not None} if call.return_response else None


async def handle_restore_gate_thresholds(
    hass: HomeAssistant, entry: ConfigEntry, call: ServiceCall
) -> ServiceResponse:
    """Write a saved snapshot back to one radar."""
    device_id = _single_device_id(hass, call)
    user = await _user_for_call(hass, call)
    jobs = _runtime(hass)[1]
    spec = _preflight_restore(hass, jobs, user, call, device_id)
    return await _launch(hass, entry, spec, call)


# --------------------------------------------------------------------- setup


async def async_setup_calibration(
    hass: HomeAssistant, entry: ConfigEntry
) -> Callable[[], Coroutine[Any, Any, None]]:
    """Load the store, register the services, and return the entry's teardown."""
    store = CalibrationStore(hass)
    await store.async_load()
    data = hass.data.setdefault(DOMAIN, {})
    data.pop(_DATA_CALIBRATION_CLOSING, None)
    data[DATA_CALIBRATION_STORE] = store
    jobs: dict[str, CalibrationJob] = {}
    data[DATA_CALIBRATION_JOBS] = jobs

    hass.services.async_register(
        DOMAIN,
        SERVICE_CALIBRATE_GATES,
        partial(handle_calibrate_gates, hass, entry),
        schema=CALIBRATE_GATES_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_CANCEL_CALIBRATION,
        partial(handle_cancel_calibration, hass),
        schema=CANCEL_CALIBRATION_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_RESTORE_GATE_THRESHOLDS,
        partial(handle_restore_gate_thresholds, hass, entry),
        schema=RESTORE_GATE_THRESHOLDS_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )

    @callback
    def _on_stop(_event: Event) -> None:
        # Synchronous on purpose: HA cancels every background task before it
        # fires this event, so the jobs are already in their finally. The flag
        # only matters for a job that was not cancelled (addendum 1).
        for job in list(jobs.values()):
            job.request_shutdown()

    unsub_stop = hass.bus.async_listen(EVENT_HOMEASSISTANT_STOP, _on_stop)

    async def _teardown() -> None:
        # Before the first await: a call accepted while this waits would start
        # a job after HA cancelled the entry's tasks, and it would outlive us.
        if (domain_data := hass.data.get(DOMAIN)) is not None:
            domain_data[_DATA_CALIBRATION_CLOSING] = True
        for job in list(jobs.values()):
            job.request_shutdown()
        if jobs:
            # HA cancels the job tasks right after scheduling this coroutine;
            # the jobs run their bounded finally while this waits.
            waits = asyncio.gather(
                *(job.done.wait() for job in list(jobs.values())),
                return_exceptions=True,
            )
            try:
                await asyncio.wait_for(waits, timeout=SHUTDOWN_RESTORE_TIMEOUT_S + 2)
            except TimeoutError:
                _LOGGER.warning(
                    "Apollo mmWave: a calibration job did not finish before the"
                    " entry unloaded"
                )
        for service in _SERVICES:
            hass.services.async_remove(DOMAIN, service)
        unsub_stop()
        try:
            await store.async_save()
        except Exception as err:  # noqa: BLE001 - an unload must finish regardless
            _LOGGER.warning(
                "Apollo mmWave: could not save %s while unloading: %s", STORAGE_KEY, err
            )
        remaining = hass.data.get(DOMAIN, {})
        remaining.pop(DATA_CALIBRATION_STORE, None)
        remaining.pop(DATA_CALIBRATION_JOBS, None)
        remaining.pop(_DATA_CALIBRATION_CLOSING, None)

    return _teardown
