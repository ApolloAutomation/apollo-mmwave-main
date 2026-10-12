"""
Persistent calibration state: threshold snapshots, last results, markers.

``CalibrationStore`` wraps a ``helpers.storage.Store`` under
``.storage/apollo_mmwave.calibration``. It is a separate file from the zone
store on purpose: ``store.py`` keeps its allow-list untouched, and a downgrade
to an older build simply ignores this file instead of dropping the snapshots.
The in-memory shape is::

    devices = {
        "<ha_device_id>": {
            "snapshots": [            # newest first, at most MAX_SNAPSHOTS
                {
                    "id": "<uuid4 hex>",
                    "taken_at": "<iso timestamp>",
                    "reason": "calibrate" | "restore",
                    "job_id": "<uuid4 hex>",
                    "values": {
                        "number.<base>_g0_move_threshold": {
                            "value": 50.0, "unique_id": "...", "platform": "esphome"
                        },
                    },
                },
            ],
            "last_result": {...} | None,
            "interrupted": {
                "job_id": "...", "kind": "calibrate" | "restore",
                "phase": "engineering" | "applying", "started_at": "...",
                "engineering_mode_turned_on": True, "snapshot_id": "..." | None,
                "left_on": False,
            } | None,
        },
    }

Snapshots record ``unique_id`` and ``platform`` so a restore can re-resolve a
renamed entity through the entity registry before falling back to the stored
id. Malformed snapshots are dropped one at a time on load; the rest survive.

Durability: the calibrate job calls ``add_snapshot`` then awaits ``async_save``
before its first device write, and the ``interrupted`` marker is saved the same
way every time it changes, because both exist to survive a crash. Home
Assistant's ``Store`` catches a failed write (disk full, permission denied),
logs it and returns normally, so ``_ReportingStore`` records that failure and
``async_save`` raises it: a snapshot that did not reach disk must stop the job
before it writes anything. During a Home Assistant stop ``Store.async_save``
defers to the final-write stage, which still runs before the process exits but
after ``async_save`` has returned, so that one save cannot be checked.

A snapshot with no values is never handed out: ``snapshot`` and
``snapshots_summary`` skip it, so it can never hide a real one from Undo.

SPEC NOTE: the spec lists ``MAX_SNAPSHOTS`` among the constants of
``calibration.py``. It lives here because this module enforces it; patch
``calibration_store.MAX_SNAPSHOTS``, not a copy elsewhere.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.storage import Store
from homeassistant.util.file import WriteError
from homeassistant.util.json import SerializationError

from .const import DOMAIN
from .gates import finite_float

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.calibration"
SAVE_DELAY_SECONDS = 2.0
MAX_SNAPSHOTS = 5

KEY_DEVICES = "devices"
KEY_SNAPSHOTS = "snapshots"
KEY_LAST_RESULT = "last_result"
KEY_INTERRUPTED = "interrupted"
KEY_LEFT_ON = "left_on"
KEY_VALUES = "values"

_REASONS = ("calibrate", "restore")


def _empty_device() -> dict[str, Any]:
    return {KEY_SNAPSHOTS: [], KEY_LAST_RESULT: None, KEY_INTERRUPTED: None}


def _parse_values(raw: Any) -> dict[str, dict[str, Any]] | None:
    """Normalise a snapshot's values, or None if any entry is malformed."""
    if not isinstance(raw, dict) or not raw:
        return None
    values: dict[str, dict[str, Any]] = {}
    for entity_id, entry in raw.items():
        if not isinstance(entity_id, str) or not isinstance(entry, dict):
            return None
        value = finite_float(entry.get("value"))
        if value is None:
            return None
        unique_id = entry.get("unique_id")
        platform = entry.get("platform")
        values[entity_id] = {
            "value": value,
            "unique_id": unique_id if isinstance(unique_id, str) else None,
            "platform": platform if isinstance(platform, str) else None,
        }
    return values


def _parse_snapshot(raw: Any) -> dict[str, Any] | None:
    """Normalise one stored snapshot, or None if it cannot be trusted."""
    if not isinstance(raw, dict):
        return None
    snapshot_id = raw.get("id")
    taken_at = raw.get("taken_at")
    if not isinstance(snapshot_id, str) or not isinstance(taken_at, str):
        return None
    values = _parse_values(raw.get(KEY_VALUES))
    if values is None:
        return None
    reason = raw.get("reason")
    job_id = raw.get("job_id")
    return {
        "id": snapshot_id,
        "taken_at": taken_at,
        "reason": reason if reason in _REASONS else "calibrate",
        "job_id": job_id if isinstance(job_id, str) else None,
        KEY_VALUES: values,
    }


def _parse_marker(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    # A missing `left_on` reads as False: the key was added after the marker.
    return {**raw, KEY_LEFT_ON: bool(raw.get(KEY_LEFT_ON, False))}


def _parse_device(raw: Any) -> dict[str, Any] | None:
    """Normalise one stored device entry, dropping malformed snapshots singly."""
    if not isinstance(raw, dict):
        return None
    entry = _empty_device()
    snapshots = raw.get(KEY_SNAPSHOTS)
    if isinstance(snapshots, list):
        for item in snapshots:
            parsed = _parse_snapshot(item)
            if parsed is None:
                _LOGGER.warning(
                    "Apollo mmWave: dropped a malformed threshold snapshot from"
                    " %s; the others were kept.",
                    STORAGE_KEY,
                )
                continue
            entry[KEY_SNAPSHOTS].append(parsed)
        del entry[KEY_SNAPSHOTS][MAX_SNAPSHOTS:]
    last_result = raw.get(KEY_LAST_RESULT)
    if isinstance(last_result, dict):
        entry[KEY_LAST_RESULT] = last_result
    entry[KEY_INTERRUPTED] = _parse_marker(raw.get(KEY_INTERRUPTED))
    return entry


def _usable(snapshots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return the snapshots that hold at least one value, newest first."""
    return [item for item in snapshots if item.get(KEY_VALUES)]


class _ReportingStore(Store[dict[str, Any]]):
    """
    A ``Store`` that remembers why its last write failed.

    ``Store._async_handle_write_data`` catches ``WriteError`` (disk full,
    permission denied) and ``SerializationError``, logs them and returns, so
    ``await Store.async_save()`` cannot fail. The error is recorded here so
    ``CalibrationStore.async_save`` can raise it. ``_async_write_data`` is the
    one method every write goes through, the delayed and final writes
    included, and the test harness patches the same method on ``Store``.
    """

    write_error: HomeAssistantError | None = None

    async def _async_write_data(self, data: dict) -> None:
        try:
            await super()._async_write_data(data)
        except (SerializationError, WriteError) as err:
            self.write_error = err
            raise
        self.write_error = None


class CalibrationStore:
    """Snapshots, last results and interrupted markers, persisted to disk."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Create the store; call ``async_load`` before first use."""
        self._store = _ReportingStore(hass, STORAGE_VERSION, STORAGE_KEY)
        self.devices: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> None:
        """Load from disk; a missing or malformed file means an empty store."""
        try:
            data = await self._store.async_load()
        except HomeAssistantError as err:
            _LOGGER.warning(
                "Apollo mmWave: %s could not be read (%s); starting with no"
                " saved thresholds.",
                STORAGE_KEY,
                err,
            )
            data = None
        self.devices = {}
        if data is None:
            return
        raw_devices = data.get(KEY_DEVICES) if isinstance(data, dict) else None
        if not isinstance(raw_devices, dict):
            _LOGGER.warning(
                "Apollo mmWave: %s is malformed; starting with no saved thresholds.",
                STORAGE_KEY,
            )
            return
        for device_id, raw in raw_devices.items():
            entry = _parse_device(raw)
            if entry is not None:
                self.devices[device_id] = entry

    def _device(self, device_id: str) -> dict[str, Any]:
        return self.devices.setdefault(device_id, _empty_device())

    def add_snapshot(self, device_id: str, snapshot: dict[str, Any]) -> None:
        """Prepend a snapshot and prune the list to ``MAX_SNAPSHOTS``."""
        snapshots = self._device(device_id)[KEY_SNAPSHOTS]
        snapshots.insert(0, snapshot)
        del snapshots[MAX_SNAPSHOTS:]

    def discard_snapshot(self, device_id: str, snapshot_id: str) -> None:
        """Forget a snapshot that could not be persisted."""
        device = self.devices.get(device_id)
        if device is None:
            return
        device[KEY_SNAPSHOTS] = [
            item for item in device[KEY_SNAPSHOTS] if item["id"] != snapshot_id
        ]

    def snapshot(
        self, device_id: str, snapshot_id: str | None = None
    ) -> dict[str, Any] | None:
        """Return one snapshot with values (the newest when no id is given)."""
        device = self.devices.get(device_id) or _empty_device()
        snapshots = _usable(device[KEY_SNAPSHOTS])
        if snapshot_id is None:
            return snapshots[0] if snapshots else None
        return next((item for item in snapshots if item["id"] == snapshot_id), None)

    def snapshots_summary(self, device_id: str) -> list[dict[str, Any]]:
        """Return ``[{id, taken_at, reason, count}]`` newest first, values only."""
        device = self.devices.get(device_id) or _empty_device()
        snapshots = _usable(device[KEY_SNAPSHOTS])
        return [
            {
                "id": item["id"],
                "taken_at": item["taken_at"],
                "reason": item["reason"],
                "count": len(item[KEY_VALUES]),
            }
            for item in snapshots
        ]

    def last_result(self, device_id: str) -> dict[str, Any] | None:
        """Return the stored result of the last finished job, or None."""
        return (self.devices.get(device_id) or _empty_device())[KEY_LAST_RESULT]

    def set_last_result(self, device_id: str, result: dict[str, Any]) -> None:
        """Remember the result of a finished job."""
        self._device(device_id)[KEY_LAST_RESULT] = result

    def set_interrupted(self, device_id: str, marker: dict[str, Any]) -> None:
        """Write the in-progress marker (the caller saves it)."""
        self._device(device_id)[KEY_INTERRUPTED] = _parse_marker(marker)

    def clear_interrupted(self, device_id: str) -> bool:
        """Drop the marker; returns whether there was one to drop."""
        device = self.devices.get(device_id)
        if device is None or device[KEY_INTERRUPTED] is None:
            return False
        device[KEY_INTERRUPTED] = None
        return True

    def interrupted(self, device_id: str) -> dict[str, Any] | None:
        """Return the marker a crashed job left behind, or None."""
        return (self.devices.get(device_id) or _empty_device())[KEY_INTERRUPTED]

    def async_delay_save(self) -> None:
        """Schedule a debounced write-out of the current data."""
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY_SECONDS)

    async def async_save(self) -> None:
        """
        Write the current data out immediately; raise if it did not reach disk.

        While Home Assistant is stopping, ``Store.async_save`` only registers
        the final-write listener and returns, so that save is not checked.
        """
        self._store.write_error = None
        await self._store.async_save(self._data_to_save())
        if (error := self._store.write_error) is not None:
            msg = f"{STORAGE_KEY} could not be written: {error}"
            raise HomeAssistantError(msg) from error

    async def async_remove(self) -> None:
        """Delete the store file (config entry removed)."""
        await self._store.async_remove()

    def _data_to_save(self) -> dict[str, Any]:
        return {KEY_DEVICES: self.devices}
