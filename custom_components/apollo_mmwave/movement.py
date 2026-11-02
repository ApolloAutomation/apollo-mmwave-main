"""
Movement history: up to 24 hours of target positions, kept per radar.

An administrator turns history on for one radar at a time, with the zone
store's ``movement_history`` flag, and replays it on the zone map. Nothing is
recorded for a radar with the flag off, and turning the flag off deletes that
radar's history.

The recorder reads targets exactly as zone presence does
(``targets.masked_readings``), so a target inside an ignore zone is never
recorded: a fan or a curtain there cannot fill the store, keep a heartbeat
going or push real history out. Positions are whole millimeters in the raw
sensor frame, unit converted but not rotated or mirrored, so a replay follows
the radar's current rotation and flip.

A record is a point, where a slot's target was, or a gone marker, when the
slot lost it. A slot's point is recorded when it appears, when it has moved
50 mm or more (at most twice a second) and every 15 s while it stays. The
LD2450 writes each axis about once a second; a move under 50 mm is its
jitter, and Home Assistant writes nothing for a value that repeats, so the
heartbeat is what keeps a person sitting still on the map through a replay.
X and Y are separate entities, and the R PRO-1 often writes Y about 0.45 s
after X: a move is recorded only once the reading is whole (see
MOVEMENT_PAIR_MS), so no point pairs a new X with an old Y. A gone marker is
recorded at once.

``.storage/apollo_mmwave.movement`` keeps each radar's records as packed
little-endian columns, base64 encoded, about 13 bytes a record where JSON
lists take about 60; the websocket answer uses the same encoding. The file
exists only while some radar has records: whatever leaves none (a clear, the
flag turned off, a radar removed, records aging out, a load) removes it, and
with it the copies Home Assistant keeps of a corrupt one, which hold
positions that nothing else would ever delete. A retention timer prunes
records older than 24 hours even while nothing new is recorded.

Privacy: no position, record or payload is ever logged, at any level. Log
lines carry device ids and counts only.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import math
import sys
import time
from array import array
from bisect import bisect_left, bisect_right
from contextlib import suppress
from dataclasses import dataclass
from itertools import accumulate, pairwise
from pathlib import Path
from typing import TYPE_CHECKING, Any

from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import HassJob, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import (
    async_call_later,
    async_track_state_change_event,
)
from homeassistant.helpers.storage import Store

from .const import DATA_MOVEMENT, DOMAIN, SIGNAL_ZONES_UPDATED, STORE_MOVEMENT_HISTORY
from .hold import HALF_VANISH_MAX_S, half_vanished
from .ld2450 import effective_target_pairs
from .store import device_flag
from .targets import masked_readings, pair_ids

if TYPE_CHECKING:
    from datetime import datetime

    from homeassistant.core import (
        CALLBACK_TYPE,
        Event,
        EventStateChangedData,
        HomeAssistant,
    )

    from .store import ZoneStore

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.movement"

# A slot's new point is recorded once it is this far from its last one;
# anything closer is the radar's jitter. On an R PRO-1, a still object it
# tracked gave 53 records in 10 minutes, where the heartbeat alone gives 40.
MOVEMENT_MIN_MOVE_MM = 50
# A slot's points are at least this far apart, so a walk is kept as two
# points a second. Gone markers are never held back.
MOVEMENT_MIN_INTERVAL_MS = 500
# A slot that stays is recorded again this often.
MOVEMENT_HEARTBEAT_MS = 15000
# An axis written alone waits this long for the other axis's write, and
# counts as moving alone after it: above the 0.40 to 0.50 s the R PRO-1
# takes from X to Y, and below the 0.62 s from a Y to the next X, so a lone Y
# never pairs with the next reading's X.
MOVEMENT_PAIR_MS = 550
# A reading held back as the first of a target's two vanishing writes counts
# once it has stood unchanged this long. The same bound as zone presence's,
# so the two count someone who really stands on an axis line together.
MOVEMENT_HALF_VANISH_MAX_MS = round(HALF_VANISH_MAX_S * 1000)
MOVEMENT_RETENTION_MS = 86400000
# The time prune runs once the oldest record is this far past the retention,
# so it runs at most this often while history exists.
MOVEMENT_PRUNE_BATCH_MS = 600000
# Records kept per radar. Once a radar has the slack on top, its oldest are
# dropped back to the cap in one go rather than one at a time.
MOVEMENT_MAX_POINTS = 100000
MOVEMENT_PRUNE_SLACK = 5000
# The routine save waits this long, and so writes at most once a minute. A
# clear, the flag turned off or a radar removed waits only the shorter delay,
# so deleted history leaves the disk within a second.
MOVEMENT_SAVE_DELAY_S = 60.0
MOVEMENT_CLEAR_SAVE_DELAY_S = 1.0
# A get carries in each slot's last point from this long before its window.
MOVEMENT_CARRY_IN_MS = 30000
# A clock step back up to this, such as an NTP correction, stamps records at
# the last time. A bigger one drops the records from the future.
MOVEMENT_CLOCK_STEP_MS = 60000
# The x and y columns are int16, so a reading beyond this is no reading.
MOVEMENT_MAX_ABS_MM = 32767

# Column types: t int64 (memory only), dt uint32, s, x and y int16.
_INT64 = "q"
_UINT32 = "I"
_INT16 = "h"
# The columns go to disk and to the card little-endian, whatever the host is.
_BIG_ENDIAN = sys.byteorder == "big"


def _now_ms() -> int:
    """Return the time as epoch milliseconds, the time records are kept in."""
    # Rounded, not truncated: a float time of exactly n ms can read a hair
    # under it, and the 0.5 s floor compares whole milliseconds.
    return round(time.time() * 1000)


def _mono_ms() -> int:
    """Return the monotonic clock in milliseconds, which the floors run on."""
    # A clock step back stamps records at the last time (see _record), so
    # floors timed from the stamps would not come due until the clock caught
    # up again. No clock step moves this one.
    return round(time.monotonic() * 1000)


def _is_int(value: Any) -> bool:
    # A bool is an int to Python, but no count or time anyone wrote down.
    return isinstance(value, int) and not isinstance(value, bool)


def _slot_of(value: int) -> int:
    """Return the slot of an s column value: a gone marker is -1 - slot."""
    return value if value >= 0 else -1 - value


def _b64(column: array[int]) -> str:
    """Return a column as base64 of its little-endian bytes."""
    if _BIG_ENDIAN:
        column = array(column.typecode, column)
        column.byteswap()
    return base64.b64encode(column.tobytes()).decode("ascii")


def _unb64(text: Any, typecode: str, count: int) -> array[int] | None:
    """Return a base64 column, or None unless it holds exactly count values."""
    if not isinstance(text, str):
        return None
    try:
        raw = base64.b64decode(text, validate=True)
    except ValueError:
        # binascii.Error, and text that is not ASCII, are both ValueError.
        return None
    column = array(typecode)
    if len(raw) != count * column.itemsize:
        return None
    column.frombytes(raw)
    if _BIG_ENDIAN:
        column.byteswap()
    return column


def _pack(
    t0: int | None,
    dt: array[int],
    s: array[int],
    x: array[int],
    y: array[int],
) -> dict[str, Any]:
    """Return columns as the store file and the websocket answer carry them."""
    return {
        "t0": t0,
        "n": len(s),
        "dt": _b64(dt),
        "s": _b64(s),
        "x": _b64(x),
        "y": _b64(y),
    }


def _pick(column: array[int], indices: list[int]) -> array[int]:
    return array(column.typecode, [column[index] for index in indices])


class _Columns:
    """
    One radar's records, oldest first, about 18 bytes a record in memory.

    ``t`` is each record's epoch milliseconds and never goes down, so a time
    is found by bisection. ``dt`` holds the same times as the gap to the
    record before (0 for the first), which is the form on disk and on the
    wire, so encoding is a copy. ``s`` is the slot, or -1 - slot for a gone
    marker; ``x`` and ``y`` are millimeters, 0 on a gone marker.
    """

    def __init__(self) -> None:
        """Start with no records."""
        self.t: array[int] = array(_INT64)
        self.dt: array[int] = array(_UINT32)
        self.s: array[int] = array(_INT16)
        self.x: array[int] = array(_INT16)
        self.y: array[int] = array(_INT16)
        # What encode() returned, until the records change.
        self._encoded: dict[str, Any] | None = None

    def __len__(self) -> int:
        """Return the number of records."""
        return len(self.t)

    @property
    def last_t(self) -> int | None:
        """Return the time of the newest record, or None without records."""
        return self.t[-1] if self.t else None

    def append(self, t: int, s: int, x: int, y: int) -> None:
        """Add a record no older than the newest one."""
        self.dt.append(t - self.t[-1] if self.t else 0)
        self.t.append(t)
        self.s.append(s)
        self.x.append(x)
        self.y.append(y)
        self._encoded = None

    def drop_before(self, t_ms: int) -> int:
        """Drop every record older than t_ms; return how many went."""
        count = bisect_left(self.t, t_ms)
        self.drop_oldest(count)
        return count

    def drop_after(self, t_ms: int) -> int:
        """Drop every record newer than t_ms; return how many went."""
        start = bisect_right(self.t, t_ms)
        count = len(self.t) - start
        if count:
            for column in (self.t, self.dt, self.s, self.x, self.y):
                del column[start:]
            self._encoded = None
        return count

    def drop_oldest(self, count: int) -> None:
        """Drop the oldest count records."""
        if count <= 0:
            return
        for column in (self.t, self.dt, self.s, self.x, self.y):
            del column[:count]
        if self.dt:
            # The new first record has nothing before it.
            self.dt[0] = 0
        self._encoded = None

    def encode(self) -> dict[str, Any]:
        """Return the records as the store file keeps them."""
        # Cached, because every save encodes every radar and most radars
        # change far less often than the busiest one makes the file save.
        if self._encoded is None:
            self._encoded = _pack(
                self.t[0] if self.t else None, self.dt, self.s, self.x, self.y
            )
        return self._encoded

    def window(self, since_ms: int) -> dict[str, Any]:
        """
        Return the records a replay from since_ms shows, packed like encode().

        Every record from since_ms on, after each slot's last point in the
        MOVEMENT_CARRY_IN_MS before it: a person standing still at the start
        of the window is then on the map from its first moment.
        """
        start = bisect_left(self.t, since_ms)
        # The carried-in records and the first one of the window are picked
        # one by one. Everything after is sliced whole, so a day of records
        # costs a few C copies and no Python loop over them.
        head = self._carry_in(start, since_ms)
        if start < len(self.t):
            head.append(start)
        if not head:
            empty = array(_INT16)
            return _pack(None, array(_UINT32), empty, empty, empty)
        tail = start + 1
        dt = array(_UINT32, [0, *(self.t[b] - self.t[a] for a, b in pairwise(head))])
        return _pack(
            self.t[head[0]],
            dt + self.dt[tail:],
            _pick(self.s, head) + self.s[tail:],
            _pick(self.x, head) + self.x[tail:],
            _pick(self.y, head) + self.y[tail:],
        )

    def _carry_in(self, start: int, since_ms: int) -> list[int]:
        """Return each slot's last record before start, oldest first, if a point."""
        # The walk back stops at MOVEMENT_CARRY_IN_MS, which the 0.5 s floor
        # keeps to a few dozen records a slot.
        oldest = since_ms - MOVEMENT_CARRY_IN_MS
        seen: set[int] = set()
        carry: list[int] = []
        index = start - 1
        while index >= 0 and self.t[index] >= oldest:
            value = self.s[index]
            slot = _slot_of(value)
            if slot not in seen:
                seen.add(slot)
                if value >= 0:
                    carry.append(index)
            index -= 1
        carry.reverse()
        return carry

    @classmethod
    def decode(cls, raw: Any) -> _Columns | None:
        """Return the records of one radar of the store file, or None if malformed."""
        count = raw.get("n") if isinstance(raw, dict) else None
        if not _is_int(count) or count < 0:
            return None
        t0 = raw.get("t0")
        if count == 0:
            return cls() if t0 is None or _is_int(t0) else None
        packed = [
            _unb64(raw.get(key), typecode, count)
            for key, typecode in (
                ("dt", _UINT32),
                ("s", _INT16),
                ("x", _INT16),
                ("y", _INT16),
            )
        ]
        if not _is_int(t0) or any(column is None for column in packed):
            return None
        dt, s, x, y = packed
        # t[0] is t0 whatever dt[0] says, as the card reads the columns.
        dt[0] = 0
        try:
            # About 8 ms for a full radar, once a load.
            t = array(_INT64, accumulate(dt[1:], initial=t0))
        except OverflowError:
            # A hand-edited time past what int64 holds.
            return None
        columns = cls()
        columns.t, columns.dt, columns.s, columns.x, columns.y = t, dt, s, x, y
        return columns


def _open_slots(columns: _Columns) -> list[int]:
    """Return the slots whose last record is a point, in slot order."""
    unseen = {_slot_of(value) for value in set(columns.s)}
    open_slots: list[int] = []
    for value in reversed(columns.s):
        if not unseen:
            break
        slot = _slot_of(value)
        if slot in unseen:
            unseen.discard(slot)
            if value >= 0:
                open_slots.append(slot)
    return sorted(open_slots)


def _movement_store(hass: HomeAssistant) -> Store[dict[str, Any]]:
    # Private, so only Home Assistant's user can read it. Atomic, so a crash
    # mid-write leaves the last file instead of a corrupt one, whose copy
    # would keep positions.
    return Store(hass, STORAGE_VERSION, STORAGE_KEY, private=True, atomic_writes=True)


def _delete_corrupt_copies(path: str) -> int:
    """Delete the copies Home Assistant kept of a corrupt file; return how many."""
    store_file = Path(path)
    deleted = 0
    for copy in store_file.parent.glob(f"{store_file.name}.corrupt.*"):
        with suppress(OSError):
            copy.unlink()
            deleted += 1
    return deleted


def _log_deleted_copies(deleted: int) -> None:
    if deleted:
        _LOGGER.info(
            "Apollo mmWave: deleted %d copies of a corrupt %s. They held target"
            " positions, and nothing needs restoring from them.",
            deleted,
            STORAGE_KEY,
        )


@dataclass(slots=True)
class _SlotState:
    """What the recorder knows about one slot of a radar's pair list."""

    recorded_present: bool = False  # the last record of this slot is a point
    last_t: int = 0  # ms of the last record of this slot, point or gone marker
    last_mono: int = 0  # the same moment on the monotonic clock, see _mono_ms
    last_x: int = 0
    last_y: int = 0
    move_pending: bool = False  # a move of 50 mm or more waits for the 0.5 s floor
    # The last reading seen, recorded or not, for half_vanished.
    seen_raw: tuple[float, float] | None = None
    # The last reading not held back, which stands in for one that is, and
    # the reading held back as the first of two writes, since when.
    good_raw: tuple[float, float] | None = None
    half_raw: tuple[float, float] | None = None
    half_since: int = 0
    # The axis (0 for X, 1 for Y) last written alone, while the other axis's
    # write may still follow, and when; and an axis written twice before the
    # other, which moves alone until the other is written.
    lone_axis: int | None = None
    lone_at: int = 0
    solo_axis: int | None = None

    def pair(
        self,
        previous: tuple[float, float] | None,
        raw: tuple[float, float],
        at: int,
    ) -> None:
        """Follow which axes changed from previous to raw, written at time at."""
        if previous is None:
            # A new reading: neither axis waits for the other.
            self.lone_axis = self.solo_axis = None
            return
        if self.lone_axis is not None and at - self.lone_at >= MOVEMENT_PAIR_MS:
            # The other axis never followed, so it did not change.
            self.lone_axis = None
        x_changed = raw[0] != previous[0]
        if x_changed == (raw[1] != previous[1]):
            if x_changed:
                # Both in one loop turn.
                self.lone_axis = self.solo_axis = None
            return
        axis = 0 if x_changed else 1
        if self.lone_axis == axis:
            # Written again before the other axis, which is then not changing.
            # This keeps a radar that reports several times a second at two
            # points a second along one axis.
            self.lone_axis, self.solo_axis = None, axis
        elif self.lone_axis is not None:
            # The other axis's write: the pair is whole.
            self.lone_axis = None
        elif self.solo_axis is None:
            self.lone_axis, self.lone_at = axis, at
        elif self.solo_axis != axis:
            # The other axis changes after all: the reading is whole, and the
            # next axis written alone waits for its pair again.
            self.solo_axis = None

    def whole(self, at: int) -> bool:
        """Report whether the reading at time at waits for no axis's write."""
        return self.lone_axis is None or at - self.lone_at >= MOVEMENT_PAIR_MS

    def due(self) -> int | None:
        """Return when the tick has something to record, or None for nothing."""
        due: int | None = None
        if self.move_pending:
            due = self.last_mono + MOVEMENT_MIN_INTERVAL_MS
        elif self.recorded_present:
            due = self.last_mono + MOVEMENT_HEARTBEAT_MS
        if due is not None and self.lone_axis is not None:
            # No sooner than the reading can be whole.
            due = max(due, self.lone_at + MOVEMENT_PAIR_MS)
        if self.half_raw is not None:
            # When a reading held back counts, if nothing is written before.
            counts_at = self.half_since + MOVEMENT_HALF_VANISH_MAX_MS
            due = counts_at if due is None else min(due, counts_at)
        return due


class _Recorder:
    """Records one radar's targets while its movement history is on."""

    def __init__(
        self,
        hass: HomeAssistant,
        history: MovementHistory,
        zone_store: ZoneStore,
        device_id: str,
    ) -> None:
        """Bind the recorder to a radar; start() begins tracking."""
        self._hass = hass
        self._history = history
        self._zone_store = zone_store
        self._device_id = device_id
        self._ids: list[str] | None = None
        self._unsub: CALLBACK_TYPE | None = None
        self._pending: asyncio.Handle | None = None
        self._slots: dict[int, _SlotState] = {}
        self._tick: CALLBACK_TYPE | None = None
        self._tick_due: int | None = None

    def start(self) -> None:
        """Start tracking the radar's targets and record who is in view."""
        self.retrack()

    def retrack(self) -> None:
        """Follow the radar's pair list; a new list closes every slot first."""
        ids = pair_ids(self._pairs())
        if ids == self._ids and self._unsub is not None:
            return
        # A slot is a position in the pair list, so under a new list the same
        # number can name another target.
        self._close_slots(_now_ms())
        if self._unsub is not None:
            self._unsub()
            self._unsub = None
        self._ids = ids
        if ids:
            self._unsub = async_track_state_change_event(
                self._hass, ids, self._on_state
            )
        self._flush()

    def reset_slots(self) -> None:
        """Forget every slot, so a cleared point gets no gone marker."""
        self._slots.clear()

    def stop(self, now: int) -> None:
        """Stop tracking, and close every slot with a gone marker."""
        if self._pending is not None:
            self._pending.cancel()
            self._pending = None
        self._cancel_tick()
        if self._unsub is not None:
            self._unsub()
            self._unsub = None
        self._close_slots(now)

    def _pairs(self) -> list[dict[str, str]]:
        return effective_target_pairs(self._hass, self._zone_store, self._device_id)

    @callback
    def _on_state(self, _event: Event[EventStateChangedData]) -> None:
        # A target's X and Y are two entities written one after the other, so
        # a flush inside the first write would see half a move. One flush per
        # loop turn, as presence evaluates. The R PRO-1 often writes Y about
        # 0.45 s after X, in a turn of its own: _SlotState.pair holds such a
        # move back until its Y is written.
        if self._pending is None:
            self._pending = self._hass.loop.call_soon(self._flush_soon)

    @callback
    def _flush_soon(self) -> None:
        # The next change schedules a new flush.
        self._pending = None
        self._flush()

    def _flush(self) -> None:
        # The wall clock stamps the records; the monotonic one times the
        # floors, the heartbeat and the waits below.
        now, mono = _now_ms(), _mono_ms()
        if self._slots and now + MOVEMENT_CLOCK_STEP_MS < max(
            state.last_t for state in self._slots.values()
        ):
            # Stamped before the clock went back further than a correction:
            # those times are in the future now, and _record drops what lies
            # there.
            self._slots.clear()
        seen: set[int] = set()
        for reading in masked_readings(
            self._hass, self._zone_store, self._device_id, self._pairs()
        ):
            x, y = round(reading.raw[0]), round(reading.raw[1])
            if abs(x) > MOVEMENT_MAX_ABS_MM or abs(y) > MOVEMENT_MAX_ABS_MM:
                continue
            state = self._slots.setdefault(reading.slot, _SlotState())
            previous, state.seen_raw = state.seen_raw, reading.raw
            seen.add(reading.slot)
            held_since = state.half_since if reading.raw == state.half_raw else None
            if half_vanished(previous, reading.raw) or (
                held_since is not None
                and mono - held_since < MOVEMENT_HALF_VANISH_MAX_MS
            ):
                # The first of the two writes of a target vanishing (or
                # appearing): a point nobody occupied, and not yet gone
                # either, however often the slot is read before the second
                # write lands. The slot's last good reading stands in for it,
                # so a heartbeat still records the person.
                if held_since is None:
                    state.half_raw, state.half_since = reading.raw, mono
                if state.good_raw is not None:
                    good_x, good_y = state.good_raw
                    self._point(reading.slot, round(good_x), round(good_y), now, mono)
                continue
            state.half_raw = None
            # A reading that was held back changed when it was first read.
            changed_at = mono if held_since is None else held_since
            state.pair(state.good_raw, reading.raw, changed_at)
            state.good_raw = reading.raw
            self._point(reading.slot, x, y, now, mono)
        for slot, state in self._slots.items():
            if slot not in seen:
                state.seen_raw = state.good_raw = state.half_raw = None
                self._gone(slot, now, mono)
        self._history.trim(self._device_id, now)
        self._schedule_tick(mono)

    def _point(self, slot: int, x: int, y: int, now: int, mono: int) -> None:
        state = self._slots[slot]
        due = state.last_t == 0 or mono - state.last_mono >= MOVEMENT_MIN_INTERVAL_MS
        # A new X with the old Y is a point nobody occupied, so nothing is
        # recorded until the reading is whole.
        whole = state.whole(mono)
        if (
            not state.recorded_present
            or math.dist((x, y), (state.last_x, state.last_y)) >= MOVEMENT_MIN_MOVE_MM
        ):
            # An appearance or a move. Before the floor, or while one axis
            # waits for the other, it waits for the tick, which records
            # wherever the target is by then.
            if due and whole:
                self._record_point(slot, x, y, now, mono)
            else:
                state.move_pending = True
            return
        # Within 50 mm of the last point: a move that waited came back before
        # the floor, and the heartbeat records the person once it is due.
        state.move_pending = False
        if mono - state.last_mono >= MOVEMENT_HEARTBEAT_MS and whole:
            self._record_point(slot, x, y, now, mono)

    def _gone(self, slot: int, now: int, mono: int) -> None:
        state = self._slots[slot]
        state.move_pending = False
        if state.recorded_present:
            self._record_gone(slot, now, mono)

    def _record_point(self, slot: int, x: int, y: int, now: int, mono: int) -> None:
        state = self._slots[slot]
        state.last_t = self._history._record(self._device_id, now, slot, x, y)  # noqa: SLF001 - its owner
        state.last_mono = mono
        state.recorded_present = True
        state.last_x, state.last_y = x, y
        state.move_pending = False

    def _record_gone(self, slot: int, now: int, mono: int) -> None:
        state = self._slots[slot]
        state.last_t = self._history._record(self._device_id, now, -1 - slot, 0, 0)  # noqa: SLF001 - its owner
        state.last_mono = mono
        state.recorded_present = False

    def _close_slots(self, now: int) -> None:
        mono = _mono_ms()
        for slot in sorted(self._slots):
            if self._slots[slot].recorded_present:
                self._record_gone(slot, now, mono)
        self._slots.clear()

    def _schedule_tick(self, mono: int) -> None:
        # One timer per radar, and only while a slot is present or holds a
        # reading back: the floor of a pending move, else the next heartbeat,
        # either one no sooner than the reading is whole, or the moment a
        # reading held back counts. Home Assistant writes nothing for a value
        # that repeats, so a person sitting still can send nothing for seconds.
        due = min(
            (
                slot_due
                for state in self._slots.values()
                if (slot_due := state.due()) is not None
            ),
            default=None,
        )
        if due is None:
            self._cancel_tick()
            return
        if self._tick is not None and self._tick_due == due:
            return
        self._cancel_tick()
        self._tick_due = due
        self._tick = async_call_later(
            self._hass,
            max(0.05, (due - mono) / 1000),
            HassJob(self._on_tick, cancel_on_shutdown=True),
        )

    def _cancel_tick(self) -> None:
        if self._tick is not None:
            self._tick()
            self._tick = None
        self._tick_due = None

    @callback
    def _on_tick(self, _now: datetime) -> None:
        # Reads the states again: a heartbeat, a move whose floor came or
        # whose other axis never did, or a reading held back long enough.
        self._tick = None
        self._tick_due = None
        self._flush()


class MovementHistory:
    """
    The movement history of every radar: recorders, records and their file.

    One per config entry, at ``hass.data[DOMAIN][DATA_MOVEMENT]``. Call
    ``async_load``, then ``async_start``; ``async_stop`` unloads it.
    """

    def __init__(self, hass: HomeAssistant, zone_store: ZoneStore) -> None:
        """Create the history of the radars in a zone store."""
        self._hass = hass
        # Held directly: the entry's teardown pops the zone store from
        # hass.data before this one stops.
        self._zone_store = zone_store
        self._store = _movement_store(hass)
        self._columns: dict[str, _Columns] = {}
        self._recorders: dict[str, _Recorder] = {}
        # Whether a save is scheduled, see _mark_dirty.
        self._save_scheduled = False
        # Whether a save has started in this run, see _async_remove_file.
        self._saved = False
        # Set when the config entry is removed: nothing is written after.
        self._removed = False
        self._retention: CALLBACK_TYPE | None = None
        self._remove_task: asyncio.Task[None] | None = None
        self._unsubs: list[CALLBACK_TYPE] = []
        self._unsub_stop: CALLBACK_TYPE | None = None
        # Radars whose clock step back was already reported this run.
        self._clock_warned: set[str] = set()

    async def async_load(self) -> None:
        """Load the saved history, keeping only what may still be kept."""
        try:
            data = await self._store.async_load()
        except HomeAssistantError as err:
            _LOGGER.warning(
                "Apollo mmWave: %s could not be read (%s); starting with no"
                " movement history.",
                STORAGE_KEY,
                err,
            )
            data = None
        # A corrupt file loads as None: Home Assistant renamed it, and the
        # copy holds positions nothing else would ever delete.
        await self._async_delete_corrupt_copies()
        if data is None:
            return
        self._columns, changed = self._load_devices(data, _now_ms())
        _LOGGER.debug(
            "Apollo mmWave: loaded the movement history of %d radars, %d records",
            len(self._columns),
            sum(len(columns) for columns in self._columns.values()),
        )
        if not self._columns:
            # The file exists and nothing in it may be kept.
            self._remove_file_soon()
        elif changed:
            self._mark_dirty()
        self._schedule_retention()

    def _load_devices(self, data: Any, now: int) -> tuple[dict[str, _Columns], bool]:
        """Return the radars of a loaded file that stay, and whether any changed."""
        devices = data.get("devices") if isinstance(data, dict) else None
        if not isinstance(devices, dict):
            _LOGGER.warning(
                "Apollo mmWave: %s is malformed; starting with no movement history.",
                STORAGE_KEY,
            )
            return {}, True
        saved_at = data.get("saved_at")
        loaded: dict[str, _Columns] = {}
        changed = False
        for device_id, raw in devices.items():
            columns, radar_changed = self._load_radar(
                device_id, raw, now, saved_at if _is_int(saved_at) else None
            )
            changed |= radar_changed
            if columns is not None:
                loaded[device_id] = columns
        return loaded, changed

    def _load_radar(
        self, device_id: str, raw: Any, now: int, saved_at: int | None
    ) -> tuple[_Columns | None, bool]:
        """Return one radar's records if they stay, and whether they changed."""
        # History is kept only while the flag is on, and an earlier run can
        # have turned it off without reaching this file (D37 saves the flag
        # first). A radar gone from Home Assistant has none either.
        if not device_flag(
            self._zone_store.devices.get(device_id), STORE_MOVEMENT_HISTORY
        ) or (dr.async_get(self._hass).async_get(device_id) is None):
            return None, True
        columns = _Columns.decode(raw)
        if columns is None:
            _LOGGER.warning(
                "Apollo mmWave: dropped the movement history of device '%s' from"
                " %s; it is malformed.",
                device_id,
                STORAGE_KEY,
            )
            return None, True
        changed = bool(columns.drop_before(now - MOVEMENT_RETENTION_MS))
        # Stamped by a clock that was ahead; no since..now window shows them.
        changed |= bool(columns.drop_after(now + MOVEMENT_CLOCK_STEP_MS))
        if not columns:
            return None, True
        # Home Assistant was down, so nobody is known to be there any more:
        # each slot still on the map is closed when the file was last saved,
        # or at its last record when the file does not say.
        last_t = columns.t[-1]
        closed_at = last_t if saved_at is None else max(last_t, min(saved_at, now))
        for slot in _open_slots(columns):
            columns.append(closed_at, -1 - slot, 0, 0)
            changed = True
        return columns, changed

    @callback
    def async_start(self) -> None:
        """Record every radar whose flag is on, and follow flags and radars."""
        self._unsubs = [
            async_dispatcher_connect(self._hass, SIGNAL_ZONES_UPDATED, self._reconcile),
            self._hass.bus.async_listen(
                dr.EVENT_DEVICE_REGISTRY_UPDATED, self._device_registry_updated
            ),
        ]
        self._unsub_stop = self._hass.bus.async_listen_once(
            EVENT_HOMEASSISTANT_STOP, self._on_stop
        )
        for device_id, entry in list(self._zone_store.devices.items()):
            if device_flag(entry, STORE_MOVEMENT_HISTORY):
                self._reconcile(device_id)

    @callback
    def _device_registry_updated(
        self, event: Event[dr.EventDeviceRegistryUpdatedData]
    ) -> None:
        # A radar removed from Home Assistant loses its history. Its zone store
        # entry and flag stay (X08), so a radar restored with the same id
        # records again.
        if event.data["action"] not in ("create", "remove"):
            return
        device_id = event.data["device_id"]
        if device_id in self._zone_store.devices:
            self._reconcile(device_id)

    @callback
    def _reconcile(self, device_id: str) -> None:
        """Record a radar while its flag is on and it is registered, else forget it."""
        on = (
            device_flag(self._zone_store.devices.get(device_id), STORE_MOVEMENT_HISTORY)
            and dr.async_get(self._hass).async_get(device_id) is not None
        )
        recorder = self._recorders.get(device_id)
        if on:
            if recorder is not None:
                recorder.retrack()
                return
            recorder = self._recorders[device_id] = _Recorder(
                self._hass, self, self._zone_store, device_id
            )
            _LOGGER.debug(
                "Apollo mmWave: recording the movement history of device %s",
                device_id,
            )
            recorder.start()
            return
        if recorder is not None:
            recorder.stop(_now_ms())
            del self._recorders[device_id]
            _LOGGER.debug(
                "Apollo mmWave: stopped recording the movement history of device %s",
                device_id,
            )
        if device_id in self._columns:
            # Turning the flag off, or removing the radar, deletes its history.
            del self._columns[device_id]
            self._save_soon()

    def payload(
        self, device_id: str, since_ms: int | None, now_ms: int
    ) -> dict[str, Any]:
        """
        Return a radar's history from since_ms to now_ms as the card reads it.

        Never trims, saves or schedules anything, so a read writes nothing.
        """
        oldest = now_ms - MOVEMENT_RETENTION_MS
        since = oldest if since_ms is None else min(max(since_ms, oldest), now_ms)
        enabled = device_flag(
            self._zone_store.devices.get(device_id), STORE_MOVEMENT_HISTORY
        )
        columns = self._columns.get(device_id) if enabled else None
        if columns is None:
            empty = array(_INT16)
            window = _pack(None, array(_UINT32), empty, empty, empty)
        else:
            window = columns.window(since)
        return {
            "enabled": enabled,
            "now": now_ms,
            "since": since,
            "retention_s": MOVEMENT_RETENTION_MS // 1000,
            "n": window["n"],
            "t0": window["t0"],
            "dt": window["dt"],
            "s": window["s"],
            "x": window["x"],
            "y": window["y"],
        }

    def count(self, device_id: str) -> int:
        """Return how many records a radar has; never trims, saves or schedules."""
        columns = self._columns.get(device_id)
        return len(columns) if columns is not None else 0

    def clear(self, device_id: str) -> int:
        """Delete a radar's history and keep recording; return the records removed."""
        columns = self._columns.pop(device_id, None)
        removed = len(columns) if columns is not None else 0
        recorder = self._recorders.get(device_id)
        if recorder is not None:
            recorder.reset_slots()
        if removed:
            self._save_soon()
        if recorder is not None:
            # A target in view is recorded again at once.
            recorder._flush()  # noqa: SLF001 - our own recorder
        _LOGGER.debug(
            "Apollo mmWave: cleared %d records of the movement history of device %s",
            removed,
            device_id,
        )
        return removed

    def trim(self, device_id: str, now: int) -> None:
        """Hold a radar to the cap and the retention, the cheap checks first."""
        columns = self._columns.get(device_id)
        if columns is None:
            return
        dropped = 0
        if len(columns) > MOVEMENT_MAX_POINTS + MOVEMENT_PRUNE_SLACK:
            dropped = len(columns) - MOVEMENT_MAX_POINTS
            columns.drop_oldest(dropped)
        if (
            columns
            and columns.t[0] < now - MOVEMENT_RETENTION_MS - MOVEMENT_PRUNE_BATCH_MS
        ):
            dropped += columns.drop_before(now - MOVEMENT_RETENTION_MS)
        if not dropped:
            return
        if not columns:
            del self._columns[device_id]
        if self._columns:
            self._mark_dirty()
        else:
            self._remove_file_soon()

    def _record(self, device_id: str, t: int, s: int, x: int, y: int) -> int:
        """Append a record to a radar's history; return the time it was stamped."""
        columns = self._columns.get(device_id)
        if columns is None:
            columns = self._columns[device_id] = _Columns()
        last = columns.last_t
        # Time only moves forward in the columns: bisection and the uint32
        # gaps need it.
        if last is not None and t < last:
            if last - t <= MOVEMENT_CLOCK_STEP_MS:
                # An NTP correction: the record keeps the last time.
                t = last
            else:
                # A board without a clock that booted before NTP, or a manual
                # change. What lies past the new time no window could show.
                dropped = columns.drop_after(t)
                if device_id not in self._clock_warned:
                    self._clock_warned.add(device_id)
                    _LOGGER.warning(
                        "Apollo mmWave: the clock went back by more than %d"
                        " seconds, so %d records of the movement history of"
                        " device '%s' that lay ahead of it were dropped.",
                        MOVEMENT_CLOCK_STEP_MS // 1000,
                        dropped,
                        device_id,
                    )
        last = columns.last_t
        if last is not None and t - last > MOVEMENT_RETENTION_MS:
            # Records this far behind the new one are past the retention
            # anyway, and a gap of 50 days or more would not fit in dt.
            columns.drop_before(t - MOVEMENT_RETENTION_MS)
        columns.append(t, s, x, y)
        self._mark_dirty()
        if self._retention is None:
            self._schedule_retention()
        return t

    def _mark_dirty(self) -> None:
        # Store.async_delay_save is a trailing debounce: calling it per record
        # would push the write out for as long as anyone moves. So it is
        # called once per dirty period, and _data_to_save ends the period.
        if self._removed or self._save_scheduled:
            return
        self._save_scheduled = True
        self._store.async_delay_save(self._data_to_save, MOVEMENT_SAVE_DELAY_S)

    def _save_soon(self) -> None:
        # Privacy: a clear, a flag turned off or a removed radar reaches disk
        # within a second.
        if self._removed:
            return
        if not self._columns:
            self._remove_file_soon()
            return
        self._save_scheduled = True
        self._store.async_delay_save(self._data_to_save, MOVEMENT_CLEAR_SAVE_DELAY_S)

    def _remove_file_soon(self) -> None:
        if self._removed:
            return
        self._remove_task = self._hass.async_create_background_task(
            self._async_remove_file(), "apollo_mmwave movement history file removal"
        )

    async def _async_remove_file(self) -> None:
        if self._saved:
            # Store writes one at a time, so this empty save first waits out a
            # write already on its way to disk, which would otherwise land
            # after the unlink and bring the file back. Before the first save
            # of a run nothing can be on its way, so a clear or the flag turned
            # off then never writes the file only to remove it.
            await self._store.async_save({"saved_at": _now_ms(), "devices": {}})
        # Also cancels a pending delayed write.
        await self._store.async_remove()
        # After the remove, which also cancels a delayed write scheduled while
        # the empty save ran: the check below then schedules it again.
        self._save_scheduled = False
        await self._async_delete_corrupt_copies()
        if self._columns:
            # Recorded again while the file was being removed.
            self._mark_dirty()

    def _data_to_save(self) -> dict[str, Any]:
        # Called as a write starts, which then may still be on its way to disk
        # when the file is removed.
        self._save_scheduled = False
        self._saved = True
        now = _now_ms()
        self._prune(now)
        return {
            "saved_at": now,
            "devices": {
                device_id: columns.encode()
                for device_id, columns in self._columns.items()
            },
        }

    def _prune(self, now: int) -> int:
        """Drop every record past the retention; return how many went."""
        dropped = 0
        for device_id, columns in list(self._columns.items()):
            dropped += columns.drop_before(now - MOVEMENT_RETENTION_MS)
            if not columns:
                del self._columns[device_id]
        return dropped

    def _schedule_retention(self) -> None:
        # Event driven, not polling: one timer, for when the oldest record is
        # MOVEMENT_PRUNE_BATCH_MS past the retention, so it fires at most that
        # often while history exists and never without.
        self._cancel_retention()
        oldest = min(
            (columns.t[0] for columns in self._columns.values() if columns),
            default=None,
        )
        if oldest is None:
            return
        due_ms = oldest + MOVEMENT_RETENTION_MS + MOVEMENT_PRUNE_BATCH_MS
        self._retention = async_call_later(
            self._hass,
            max(0.0, (due_ms - _now_ms()) / 1000),
            HassJob(self._retention_due, cancel_on_shutdown=True),
        )

    def _cancel_retention(self) -> None:
        if self._retention is not None:
            self._retention()
            self._retention = None

    @callback
    def _retention_due(self, _now: datetime) -> None:
        self._retention = None
        dropped = self._prune(_now_ms())
        if not self._columns:
            # Also when an earlier save already pruned everything and wrote an
            # empty file. Removing a file that is not there does nothing.
            self._remove_file_soon()
        elif dropped:
            self._mark_dirty()
        self._schedule_retention()

    @callback
    def _on_stop(self, _event: Event) -> None:
        # Stopping does not unload the entry. A save still pending is written
        # at the final write, where Store defers it while Home Assistant
        # stops, so the slots are closed first: a replay never shows someone
        # frozen in place across the downtime.
        self._unsub_stop = None
        now = _now_ms()
        for recorder in self._recorders.values():
            recorder.stop(now)
        self._recorders.clear()
        # After the recorders: a gone marker starts the timer when none is set.
        self._cancel_retention()

    async def async_stop(self) -> None:
        """Stop recording and write what is pending (config entry unloaded)."""
        await self.async_shutdown(save=True)

    async def async_remove(self) -> None:
        """Stop for good, writing nothing, and delete the file (entry removed)."""
        await self.async_shutdown(save=False)
        await self._async_remove_file()

    async def async_shutdown(self, *, save: bool) -> None:
        """
        Stop every recorder and listener, closing open slots.

        With save, a pending save is written now (or the file removed when no
        record is left). Without, nothing is written from then on, as the
        config entry is being removed with its history.
        """
        if not save:
            self._removed = True
        for unsub in self._unsubs:
            unsub()
        self._unsubs = []
        if self._unsub_stop is not None:
            self._unsub_stop()
            self._unsub_stop = None
        now = _now_ms()
        for recorder in self._recorders.values():
            recorder.stop(now)
        self._recorders.clear()
        # After the recorders, whose gone markers start the timer when none is
        # set. Left running, it would prune this history a day later and save
        # it, or remove the file, over the history set up after this one.
        self._cancel_retention()
        if self._remove_task is not None:
            # A removal under way finishes first: its unlink must not land
            # after the save below, and nothing it schedules may outlive this.
            await asyncio.wait([self._remove_task])
        if not save:
            self._columns.clear()
            return
        if not self._save_scheduled:
            return
        data = self._data_to_save()
        if data["devices"]:
            await self._store.async_save(data)
        else:
            await self._async_remove_file()

    async def _async_delete_corrupt_copies(self) -> None:
        _log_deleted_copies(
            await self._hass.async_add_executor_job(
                _delete_corrupt_copies, self._store.path
            )
        )


async def async_remove_movement_store(hass: HomeAssistant) -> None:
    """Delete the movement history file and its corrupt copies (entry removed)."""
    live: MovementHistory | None = hass.data.get(DOMAIN, {}).get(DATA_MOVEMENT)
    if live is not None:
        # Left in place by an unload that failed, and still recording: it is
        # shut down first, or its recorders would write the file back within a
        # minute, and its own Store cancels the write it has pending.
        await live.async_remove()
        return
    store = _movement_store(hass)
    await store.async_remove()
    _log_deleted_copies(
        await hass.async_add_executor_job(_delete_corrupt_copies, store.path)
    )
