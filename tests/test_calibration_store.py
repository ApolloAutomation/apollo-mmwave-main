"""Calibration store: snapshots, last results and the interrupted marker."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from homeassistant.core import CoreState
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util.file import WriteError

from custom_components.apollo_mmwave.calibration_store import (
    MAX_SNAPSHOTS,
    STORAGE_KEY,
    CalibrationStore,
)

DEVICE = "device-1"
STORE_WRITE = "homeassistant.helpers.storage.Store._async_write_data"


async def _disk_full(_store, _data) -> None:
    raise WriteError(OSError(28, "No space left on device"))


def _snapshot(index: int, *, reason: str = "calibrate") -> dict:
    return {
        "id": f"snap{index}",
        "taken_at": f"2026-10-11T14:{index:02d}:00+00:00",
        "reason": reason,
        "job_id": f"job{index}",
        "values": {
            "number.radar_g0_move_threshold": {
                "value": 50.0 + index,
                "unique_id": "uid0",
                "platform": "esphome",
            }
        },
    }


async def test_round_trip_through_hass_storage(hass, hass_storage) -> None:
    """Everything written comes back the same from a fresh store."""
    store = CalibrationStore(hass)
    await store.async_load()
    store.add_snapshot(DEVICE, _snapshot(1))
    store.set_last_result(DEVICE, {"job_id": "job1", "outcome": "applied"})
    store.set_interrupted(DEVICE, {"job_id": "job1", "phase": "applying"})
    await store.async_save()

    assert STORAGE_KEY in hass_storage
    reloaded = CalibrationStore(hass)
    await reloaded.async_load()

    assert reloaded.snapshot(DEVICE) == _snapshot(1)
    assert reloaded.snapshot(DEVICE, "snap1") == _snapshot(1)
    assert reloaded.snapshot(DEVICE, "nope") is None
    assert reloaded.snapshots_summary(DEVICE) == [
        {
            "id": "snap1",
            "taken_at": "2026-10-11T14:01:00+00:00",
            "reason": "calibrate",
            "count": 1,
        }
    ]
    assert reloaded.last_result(DEVICE) == {"job_id": "job1", "outcome": "applied"}
    assert reloaded.interrupted(DEVICE) == {
        "job_id": "job1",
        "phase": "applying",
        "left_on": False,
    }


async def test_save_raises_when_the_write_fails(hass, hass_storage) -> None:
    """HA's Store only logs a failed write; the calibration store raises it."""
    store = CalibrationStore(hass)
    await store.async_load()
    store.add_snapshot(DEVICE, _snapshot(1))

    with (
        patch(STORE_WRITE, new=_disk_full),
        pytest.raises(HomeAssistantError, match="No space left"),
    ):
        await store.async_save()
    assert STORAGE_KEY not in hass_storage

    # The next save that reaches disk reports nothing stale.
    await store.async_save()
    assert STORAGE_KEY in hass_storage


async def test_save_while_stopping_defers_without_raising(hass, hass_storage) -> None:
    """During an HA stop the save waits for the final write and cannot be checked."""
    store = CalibrationStore(hass)
    await store.async_load()
    store.add_snapshot(DEVICE, _snapshot(1))
    hass.set_state(CoreState.stopping)
    try:
        with patch(STORE_WRITE, new=_disk_full):
            await store.async_save()
    finally:
        hass.set_state(CoreState.running)

    assert STORAGE_KEY not in hass_storage


async def test_snapshot_without_values_is_never_handed_out(hass) -> None:
    """An empty snapshot cannot become the newest and hide a real one from Undo."""
    store = CalibrationStore(hass)
    store.add_snapshot(DEVICE, _snapshot(1))
    store.add_snapshot(DEVICE, {**_snapshot(2), "values": {}})

    assert store.snapshot(DEVICE)["id"] == "snap1"
    assert store.snapshot(DEVICE, "snap2") is None
    assert [item["id"] for item in store.snapshots_summary(DEVICE)] == ["snap1"]


async def test_snapshots_pruned_to_five_newest_first(hass) -> None:
    """The newest snapshot is first and only five are kept."""
    store = CalibrationStore(hass)
    for index in range(1, 8):
        store.add_snapshot(DEVICE, _snapshot(index))

    summary = store.snapshots_summary(DEVICE)

    assert len(summary) == MAX_SNAPSHOTS
    assert [item["id"] for item in summary] == [
        "snap7",
        "snap6",
        "snap5",
        "snap4",
        "snap3",
    ]
    assert store.snapshot(DEVICE)["id"] == "snap7"


async def test_discard_snapshot_forgets_an_unsaved_snapshot(hass) -> None:
    """A snapshot whose save failed is dropped so memory matches the disk."""
    store = CalibrationStore(hass)
    store.add_snapshot(DEVICE, _snapshot(1))
    store.add_snapshot(DEVICE, _snapshot(2))

    store.discard_snapshot(DEVICE, "snap2")
    store.discard_snapshot(DEVICE, "never-saved")
    store.discard_snapshot("never-seen", "snap1")

    assert [item["id"] for item in store.snapshots_summary(DEVICE)] == ["snap1"]


async def test_malformed_snapshot_dropped_individually(
    hass, hass_storage, caplog
) -> None:
    """One bad snapshot is dropped and logged; its neighbours survive."""
    good = _snapshot(1)
    hass_storage[STORAGE_KEY] = {
        "version": 1,
        "data": {
            "devices": {
                DEVICE: {
                    "snapshots": [
                        "not a dict",
                        {"id": "no_values", "taken_at": "t"},
                        {
                            "id": "bad_value",
                            "taken_at": "t",
                            "values": {"number.x": {"value": "abc"}},
                        },
                        good,
                    ],
                    "last_result": "garbage",
                    "interrupted": None,
                },
                "other": "garbage",
            }
        },
    }
    store = CalibrationStore(hass)

    await store.async_load()

    assert [item["id"] for item in store.snapshots_summary(DEVICE)] == ["snap1"]
    assert store.last_result(DEVICE) is None
    assert "other" not in store.devices
    assert caplog.text.count("malformed threshold snapshot") == 3


async def test_interrupted_marker_round_trip(hass, hass_storage) -> None:
    """`left_on` round-trips, and a marker without the key reads False."""
    hass_storage[STORAGE_KEY] = {
        "version": 1,
        "data": {
            "devices": {
                DEVICE: {
                    "snapshots": [],
                    "last_result": None,
                    "interrupted": {"job_id": "old", "phase": "engineering"},
                }
            }
        },
    }
    store = CalibrationStore(hass)
    await store.async_load()
    assert store.interrupted(DEVICE) == {
        "job_id": "old",
        "phase": "engineering",
        "left_on": False,
    }

    store.set_interrupted(
        DEVICE, {"job_id": "new", "phase": "applying", "left_on": True}
    )
    await store.async_save()
    reloaded = CalibrationStore(hass)
    await reloaded.async_load()
    assert reloaded.interrupted(DEVICE)["left_on"] is True

    assert reloaded.clear_interrupted(DEVICE) is True
    assert reloaded.interrupted(DEVICE) is None
    assert reloaded.clear_interrupted(DEVICE) is False
    assert reloaded.clear_interrupted("never-seen") is False


async def test_unreadable_file_starts_empty_and_warns(
    hass, hass_storage, caplog
) -> None:
    """A file that cannot be read or parsed is a warning, not a setup failure."""
    hass_storage[STORAGE_KEY] = {"version": 1, "data": "not a mapping"}
    store = CalibrationStore(hass)
    await store.async_load()
    assert store.devices == {}
    assert "malformed" in caplog.text

    caplog.clear()
    with patch(
        "homeassistant.helpers.storage.Store.async_load",
        side_effect=HomeAssistantError("corrupt"),
    ):
        broken = CalibrationStore(hass)
        await broken.async_load()
    assert broken.devices == {}
    assert "could not be read" in caplog.text


async def test_remove_deletes_file(hass, hass_storage) -> None:
    """Removing the store deletes its file."""
    store = CalibrationStore(hass)
    store.add_snapshot(DEVICE, _snapshot(1))
    await store.async_save()
    assert STORAGE_KEY in hass_storage

    await store.async_remove()

    assert STORAGE_KEY not in hass_storage
