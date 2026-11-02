"""
Movement history: what the recorder keeps, the file it keeps it in, and when.

Time is frozen at START, a whole second, so every record time is exact and the
frozen clock is both Home Assistant's timer clock and the records' epoch time.
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any
from unittest.mock import patch

import pytest
from homeassistant.const import (
    ATTR_UNIT_OF_MEASUREMENT,
    EVENT_HOMEASSISTANT_FINAL_WRITE,
    EVENT_HOMEASSISTANT_STOP,
    STATE_UNAVAILABLE,
)
from homeassistant.core import CoreState
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.json import prepare_save_json
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed_exact,
)
from pytest_homeassistant_custom_component.components.diagnostics import (
    get_diagnostics_for_config_entry,
)

from custom_components.apollo_mmwave import async_remove_entry, get_store, movement
from custom_components.apollo_mmwave.const import (
    DATA_MOVEMENT,
    DOMAIN,
    SERVICE_UPDATE_ZONE,
    STORE_MOVEMENT_HISTORY,
)

from .conftest import (
    MOVEMENT_EXAMPLE,
    MOVEMENT_EXAMPLE_RECORDS,
    RADAR_NAME,
    apollo_warnings,
    make_entry,
    pack_movement,
    setup_integration,
    unpack_movement,
)

if TYPE_CHECKING:
    from collections.abc import Iterable, Iterator

    from freezegun.api import FrozenDateTimeFactory

STORAGE_KEY = f"{DOMAIN}.movement"
ZONE_STORAGE_KEY = f"{DOMAIN}.zones"

START = datetime(2026, 1, 1, tzinfo=UTC)
START_MS = 1767225600000
HOUR_MS = 3600000
DAY_MS = 86400000

TARGET_1 = {
    "x": "sensor.r_pro_ld2450_target_1_x",
    "y": "sensor.r_pro_ld2450_target_1_y",
}
TARGET_2 = {
    "x": "sensor.r_pro_ld2450_target_2_x",
    "y": "sensor.r_pro_ld2450_target_2_y",
}

# Positions in millimeters that nothing else a test prints contains, so the
# privacy checks can look for them in logs and support files.
SPOT_A = (1371, 2903)
SPOT_B = (-642, 1888)
SPOT_C = (2417, 3529)
SPOT_VALUES = {str(abs(value)) for spot in (SPOT_A, SPOT_B, SPOT_C) for value in spot}

CORRUPT_COPY = f"{STORAGE_KEY}.corrupt.2026-01-01T00:00:00.000000+00:00"

# The real Store.async_remove, taken at import, before the hass_storage fixture
# swaps in a mock that only drops the key and leaves a pending write scheduled.
REAL_STORE_REMOVE = Store.async_remove


@pytest.fixture
def hass_config_dir(hass_tmp_config_dir: str) -> str:
    """Give each test its own config directory: some write real files there."""
    return hass_tmp_config_dir


@pytest.fixture(autouse=True)
def real_store_remove(hass_storage) -> Iterator[None]:
    """Remove store files the way Home Assistant does, pending write included."""

    async def _remove(store: Store) -> None:
        # Cancels the store's pending delayed write, as the mock does not.
        # The unlink finds no file: the mock storage never writes one.
        await REAL_STORE_REMOVE(store)
        hass_storage.pop(store.key, None)

    with patch.object(Store, "async_remove", _remove):
        yield


@pytest.fixture
def clock(freezer) -> FrozenDateTimeFactory:
    """Freeze time at START before anything is set up."""
    freezer.move_to(START)
    return freezer


@pytest.fixture
async def history_on(hass, clock, init_integration, device_id) -> str:
    """Set the integration up at START with movement history on for the radar."""
    _ = (clock, init_integration)
    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: True})
    return device_id


def _history(hass) -> movement.MovementHistory:
    return hass.data[DOMAIN][DATA_MOVEMENT]


def _now_ms() -> int:
    return round(time.time() * 1000)


def _records(hass, device_id: str) -> list[tuple[int, int, int, int]]:
    """Return a radar's records as (t, s, x, y), read as the card reads them."""
    return unpack_movement(_history(hass).payload(device_id, None, _now_ms()))


def _points(hass, device_id: str) -> list[tuple[int, int, int]]:
    """Return a radar's records as (s, x, y), without their times."""
    return [record[1:] for record in _records(hass, device_id)]


def _stored(hass_storage, device_id: str) -> list[tuple[int, int, int, int]]:
    """Return a radar's records as the movement file holds them."""
    return unpack_movement(hass_storage[STORAGE_KEY]["data"]["devices"][device_id])


def _stored_radars(hass_storage) -> set[str]:
    return set(hass_storage[STORAGE_KEY]["data"]["devices"])


def _seed(
    hass_storage,
    devices: dict[str, Any],
    saved_at: int | None = None,
) -> None:
    """Leave a movement file as an earlier run wrote it; lists of records pack."""
    data: dict[str, Any] = {
        "devices": {
            device_id: pack_movement(records) if isinstance(records, list) else records
            for device_id, records in devices.items()
        }
    }
    if saved_at is not None:
        data["saved_at"] = saved_at
    hass_storage[STORAGE_KEY] = {
        "version": 1,
        "minor_version": 1,
        "key": STORAGE_KEY,
        "data": data,
    }


def _seed_flags(hass_storage, *device_ids: str) -> None:
    """Leave a zone store with movement history on for the radars."""
    hass_storage[ZONE_STORAGE_KEY] = {
        "version": 2,
        "data": {
            "devices": {
                device_id: {"zones": {}, STORE_MOVEMENT_HISTORY: True}
                for device_id in device_ids
            },
            "orphans": {},
        },
    }


def _set_target(
    hass, pair: dict[str, str], x: object, y: object, unit: str | None = None
) -> None:
    """Report a target's X and Y in one loop turn, as ESPHome does."""
    attributes = None if unit is None else {ATTR_UNIT_OF_MEASUREMENT: unit}
    hass.states.async_set(pair["x"], str(x), attributes)
    hass.states.async_set(pair["y"], str(y), attributes)


async def _report(hass, pair: dict[str, str], x: object, y: object) -> None:
    _set_target(hass, pair, x, y)
    await hass.async_block_till_done()


async def _advance(hass, freezer, seconds: float) -> None:
    """Move the frozen clock on, then run every timer that came due."""
    freezer.tick(timedelta(seconds=seconds))
    # A microsecond of slack for a timer whose float due time lands a hair
    # past the clock.
    async_fire_time_changed_exact(hass, dt_util.utcnow() + timedelta(microseconds=1))
    await hass.async_block_till_done()


async def _update_zone(hass, data: dict[str, Any]) -> None:
    await hass.services.async_call(DOMAIN, SERVICE_UPDATE_ZONE, data, blocking=True)
    await hass.async_block_till_done()


def _add_radar(hass, serial: str = "apollo_mtr_1_0a1b2c") -> tuple[str, dict[str, str]]:
    """Register another radar with one LD2450 target; return its id and pair."""
    esphome_entry = MockConfigEntry(domain="esphome", title=serial)
    esphome_entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", serial)},
        name=serial,
    )
    entity_registry = er.async_get(hass)
    pair = {
        axis: entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            f"{serial}_target_1_{axis}",
            device_id=device.id,
            suggested_object_id=f"{serial}_ld2450_target_1_{axis}",
        ).entity_id
        for axis in ("x", "y")
    }
    return device.id, pair


def _count_flushes(monkeypatch) -> list[None]:
    """Count the recorder's flushes from now on."""
    flushes: list[None] = []
    real = movement._Recorder._flush  # noqa: SLF001 - the subject

    def _flush(self) -> None:
        flushes.append(None)
        real(self)

    monkeypatch.setattr(movement._Recorder, "_flush", _flush)  # noqa: SLF001
    return flushes


def _slow_writes(store: Any, monkeypatch, gate: asyncio.Event | None = None) -> None:
    """
    Make a Store's writes wait on the disk, as real ones do.

    Store builds the data in the loop and hands only the write to the
    executor, so the data is built first. The write then waits a loop turn,
    or until gate is set.
    """
    real_write = store._async_write_data  # noqa: SLF001 - the write itself

    async def _write(data: dict) -> None:
        if "data_func" in data:
            data["data"] = data.pop("data_func")()
        if gate is None:
            await asyncio.sleep(0)
        else:
            await gate.wait()
        await real_write(data)

    monkeypatch.setattr(store, "_async_write_data", _write)


def _write_files(directory: Path, names: Iterable[str]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for name in names:
        (directory / name).write_text("{", encoding="utf-8")


def _storage_files(hass) -> set[str]:
    return {path.name for path in Path(hass.config.path(".storage")).iterdir()}


# ---------------------------------------------------------------------------
# The packed columns
# ---------------------------------------------------------------------------


def test_columns_pack_the_spec_example() -> None:
    """Records pack to the columns of SPEC 1.5, which load back to the records."""
    columns = movement._Columns()  # noqa: SLF001 - the subject
    for record in MOVEMENT_EXAMPLE_RECORDS:
        columns.append(*record)

    assert columns.encode() == MOVEMENT_EXAMPLE
    loaded = movement._Columns.decode(MOVEMENT_EXAMPLE)  # noqa: SLF001
    assert loaded is not None
    assert list(loaded.t) == [record[0] for record in MOVEMENT_EXAMPLE_RECORDS]
    assert loaded.encode() == MOVEMENT_EXAMPLE
    empty = movement._Columns.decode(pack_movement([]))  # noqa: SLF001
    assert empty is not None
    assert len(empty) == 0


@pytest.mark.parametrize(
    "raw",
    [
        [],
        {**MOVEMENT_EXAMPLE, "n": None},
        {**MOVEMENT_EXAMPLE, "n": True},
        {**MOVEMENT_EXAMPLE, "n": 4.0},
        {**MOVEMENT_EXAMPLE, "n": -1},
        {**MOVEMENT_EXAMPLE, "n": 5},
        {**MOVEMENT_EXAMPLE, "t0": None},
        {**MOVEMENT_EXAMPLE, "t0": True},
        {**MOVEMENT_EXAMPLE, "t0": str(MOVEMENT_EXAMPLE["t0"])},
        {**MOVEMENT_EXAMPLE, "t0": 2**63},
        {**MOVEMENT_EXAMPLE, "dt": MOVEMENT_EXAMPLE["dt"][:-4]},
        {**MOVEMENT_EXAMPLE, "x": "not base64!"},
        {**MOVEMENT_EXAMPLE, "y": "\u00e9"},
        {**MOVEMENT_EXAMPLE, "s": [0, 0, 1, -1]},
        {"t0": "soon", "n": 0, "dt": "", "s": "", "x": "", "y": ""},
    ],
    ids=[
        "not_an_object",
        "no_count",
        "boolean_count",
        "float_count",
        "negative_count",
        "count_past_the_columns",
        "no_first_time",
        "boolean_first_time",
        "text_first_time",
        "first_time_past_int64",
        "short_column",
        "not_base64",
        "not_ascii",
        "column_as_a_list",
        "empty_with_a_text_time",
    ],
)
def test_malformed_radars_do_not_load(raw: Any) -> None:
    """A radar whose columns cannot be trusted loads as nothing."""
    assert movement._Columns.decode(raw) is None  # noqa: SLF001 - the subject


# ---------------------------------------------------------------------------
# What the recorder keeps
# ---------------------------------------------------------------------------


async def test_nothing_is_recorded_or_written_while_the_flag_is_off(
    hass, clock, init_integration, device_id, hass_storage
) -> None:
    """A radar with history off has no records and no file, and gains no entry."""
    _ = init_integration
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 1)
    await _report(hass, TARGET_1, *SPOT_B)
    await _advance(hass, clock, 120)

    history = _history(hass)
    assert history.count(device_id) == 0
    assert history.payload(device_id, None, START_MS) == {
        "enabled": False,
        "now": START_MS,
        "since": START_MS - DAY_MS,
        "retention_s": 86400,
        "n": 0,
        "t0": None,
        "dt": "",
        "s": "",
        "x": "",
        "y": "",
    }
    assert STORAGE_KEY not in hass_storage
    assert device_id not in get_store(hass).devices


async def test_turning_the_flag_on_starts_recording(
    hass, clock, init_integration, device_id
) -> None:
    """Turning history on records whoever is in view at once, then every move."""
    _ = init_integration
    await _report(hass, TARGET_1, *SPOT_A)
    assert _records(hass, device_id) == []

    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: True})

    assert _records(hass, device_id) == [(START_MS, 0, *SPOT_A)]
    await _advance(hass, clock, 1)
    await _report(hass, TARGET_1, *SPOT_B)
    assert _records(hass, device_id) == [
        (START_MS, 0, *SPOT_A),
        (START_MS + 1000, 0, *SPOT_B),
    ]


async def test_first_reading_records_a_point_and_small_moves_do_not(
    hass, clock, history_on
) -> None:
    """Moves under 50 mm from the last point are the radar's jitter."""
    device_id = history_on
    await _report(hass, TARGET_1, 1000, 2000)
    for step in range(1, 6):
        await _advance(hass, clock, 1)
        await _report(hass, TARGET_1, 1000 + 9 * step, 2000 - 2 * step)

    assert _records(hass, device_id) == [(START_MS, 0, 1000, 2000)]


async def test_moves_of_50_mm_record_at_most_twice_a_second(
    hass, clock, history_on
) -> None:
    """A walk reported ten times a second is kept as two points a second."""
    device_id = history_on
    await _report(hass, TARGET_1, 0, 1000)
    for step in range(1, 21):
        await _advance(hass, clock, 0.1)
        await _report(hass, TARGET_1, 60 * step, 1000)
    # The last move's floor.
    await _advance(hass, clock, 0.5)

    assert _records(hass, device_id) == [
        (START_MS, 0, 0, 1000),
        (START_MS + 500, 0, 240, 1000),
        (START_MS + 1000, 0, 540, 1000),
        (START_MS + 1500, 0, 840, 1000),
        (START_MS + 2000, 0, 1140, 1000),
        (START_MS + 2500, 0, 1200, 1000),
    ]


async def test_a_pending_move_is_recorded_after_the_floor(
    hass, clock, history_on
) -> None:
    """A move inside the floor is recorded when it ends, unless it came back."""
    device_id = history_on
    await _report(hass, TARGET_1, 1000, 2000)
    await _advance(hass, clock, 0.2)
    await _report(hass, TARGET_1, 1100, 2000)
    assert _records(hass, device_id) == [(START_MS, 0, 1000, 2000)]

    await _advance(hass, clock, 0.3)

    assert _records(hass, device_id) == [
        (START_MS, 0, 1000, 2000),
        (START_MS + 500, 0, 1100, 2000),
    ]

    # Within the next floor the target moves away and back within 50 mm of
    # the last point, so nothing waits to be recorded.
    await _advance(hass, clock, 0.1)
    await _report(hass, TARGET_1, 1200, 2000)
    await _advance(hass, clock, 0.1)
    await _report(hass, TARGET_1, 1120, 2000)
    await _advance(hass, clock, 1)
    assert len(_records(hass, device_id)) == 2


async def test_every_loop_turn_with_a_change_is_flushed(
    hass, history_on, monkeypatch
) -> None:
    """X and Y reported in two loop turns give two flushes."""
    device_id = history_on
    flushes = _count_flushes(monkeypatch)

    hass.states.async_set(TARGET_1["x"], str(SPOT_A[0]))
    await hass.async_block_till_done()
    hass.states.async_set(TARGET_1["y"], str(SPOT_A[1]))
    await hass.async_block_till_done()

    assert len(flushes) == 2
    # The first turn had no Y yet, so it had nothing to record.
    assert _points(hass, device_id) == [(0, *SPOT_A)]


async def test_x_and_y_written_in_one_loop_turn_record_one_point(
    hass, clock, history_on, monkeypatch
) -> None:
    """Both writes of a move land before the one flush, so no mixed point exists."""
    device_id = history_on
    await _report(hass, TARGET_1, 1000, 2000)
    await _advance(hass, clock, 1)
    flushes = _count_flushes(monkeypatch)

    await _report(hass, TARGET_1, 1500, 2500)

    assert len(flushes) == 1
    assert _points(hass, device_id) == [(0, 1000, 2000), (0, 1500, 2500)]


async def test_heartbeat_records_a_still_target_every_15_seconds(
    hass, clock, history_on
) -> None:
    """A still target sends nothing, so the recorder records it on a timer."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 14)
    assert len(_records(hass, device_id)) == 1

    await _advance(hass, clock, 1)
    await _advance(hass, clock, 15)

    assert _records(hass, device_id) == [
        (START_MS, 0, *SPOT_A),
        (START_MS + 15000, 0, *SPOT_A),
        (START_MS + 30000, 0, *SPOT_A),
    ]


@pytest.mark.parametrize("lost", ["unavailable", "origin", "missing"])
async def test_gone_marker_when_a_slot_loses_its_target(
    hass, clock, history_on, lost
) -> None:
    """A slot that stops reading gets a gone marker, and no heartbeat after."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 1)

    if lost == "unavailable":
        _set_target(hass, TARGET_1, STATE_UNAVAILABLE, STATE_UNAVAILABLE)
    elif lost == "origin":
        _set_target(hass, TARGET_1, 0, 0)
    else:
        for entity_id in TARGET_1.values():
            hass.states.async_remove(entity_id)
    await hass.async_block_till_done()
    await _advance(hass, clock, 30)

    assert _records(hass, device_id) == [
        (START_MS, 0, *SPOT_A),
        (START_MS + 1000, -1, 0, 0),
    ]


async def test_targets_inside_ignore_zones_are_not_recorded(
    hass, clock, history_on
) -> None:
    """A target in an ignore zone is never recorded, and entering one is leaving."""
    device_id = history_on
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "rect",
            "data": {"x_min": -500, "x_max": 500, "y_min": 1000, "y_max": 2000},
            "zone_type": "ignore",
        },
    )
    # A fan inside the ignore zone, and someone outside it.
    await _report(hass, TARGET_1, 0, 1500)
    await _report(hass, TARGET_2, *SPOT_A)
    await _advance(hass, clock, 1)

    await _report(hass, TARGET_2, 100, 1600)
    # The fan keeps no heartbeat going either.
    await _advance(hass, clock, 30)

    assert _records(hass, device_id) == [
        (START_MS, 1, *SPOT_A),
        (START_MS + 1000, -2, 0, 0),
    ]


async def test_half_vanished_reading_is_not_recorded(hass, clock, history_on) -> None:
    """The first of a vanishing target's two writes is neither a point nor gone."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 1)

    hass.states.async_set(TARGET_1["x"], "0")
    await hass.async_block_till_done()
    assert _records(hass, device_id) == [(START_MS, 0, *SPOT_A)]

    hass.states.async_set(TARGET_1["y"], "0")
    await hass.async_block_till_done()
    assert _records(hass, device_id) == [
        (START_MS, 0, *SPOT_A),
        (START_MS + 1000, -1, 0, 0),
    ]


async def test_points_are_unit_converted_and_not_rotated(hass, history_on) -> None:
    """Points are millimeters in the radar's own frame, whatever the map shows."""
    device_id = history_on
    await _update_zone(hass, {"device_id": device_id, "rotation_deg": 90})

    _set_target(hass, TARGET_1, 10, 50, unit="in")
    await hass.async_block_till_done()

    assert _points(hass, device_id) == [(0, 254, 1270)]


# ---------------------------------------------------------------------------
# The file
# ---------------------------------------------------------------------------


async def test_store_file_is_packed_and_bounded(
    hass, clock, history_on, hass_storage
) -> None:
    """A radar at the cap fits in 1.5 MB on disk, as base64 strings."""
    device_id = history_on
    history = _history(hass)
    count = 100000
    first = START_MS - count * 500
    for index in range(count):
        history._record(  # noqa: SLF001 - fills the cap fast
            device_id,
            first + index * 500,
            index % 3,
            index % 6000 - 3000,
            500 + index % 5000,
        )

    await _advance(hass, clock, 60)

    stored = hass_storage[STORAGE_KEY]["data"]["devices"][device_id]
    assert {key: type(value) for key, value in stored.items()} == {
        "t0": int,
        "n": int,
        "dt": str,
        "s": str,
        "x": str,
        "y": str,
    }
    assert stored["n"] == count
    _mode, written = prepare_save_json(hass_storage[STORAGE_KEY])
    assert len(written) <= 1_500_000
    records = unpack_movement(stored)
    assert records[0] == (first, 0, -3000, 500)
    assert records[-1] == (START_MS - 500, 0, 999, 5499)


async def test_records_older_than_24_hours_are_dropped_on_save_and_load(
    hass, clock, config_entry, history_on, hass_storage
) -> None:
    """Neither a save nor a load keeps a record past the 24 hours."""
    device_id = history_on
    history = _history(hass)
    # 30 s inside the 24 hours now, and 30 s past them when the save runs.
    aging = [
        (START_MS - DAY_MS + 30000, 0, *SPOT_A),
        (START_MS - DAY_MS + 31000, -1, 0, 0),
    ]
    recent = [
        (START_MS - HOUR_MS, 1, *SPOT_B),
        (START_MS - HOUR_MS + 1000, -2, 0, 0),
    ]
    for record in aging + recent:
        history._record(device_id, *record)  # noqa: SLF001 - an earlier day

    await _advance(hass, clock, 60)

    assert _stored(hass_storage, device_id) == recent
    assert _records(hass, device_id) == recent

    # A file from an earlier run, read again a little later.
    old = [
        (START_MS - DAY_MS, 0, *SPOT_C),
        (START_MS - DAY_MS + 1000, -1, 0, 0),
    ]
    _seed(hass_storage, {device_id: old + recent}, saved_at=START_MS)
    assert await hass.config_entries.async_reload(config_entry.entry_id)
    await hass.async_block_till_done()

    assert _records(hass, device_id) == recent


async def test_history_ages_out_on_disk_with_no_new_records(
    hass, clock, history_on, hass_storage
) -> None:
    """Nobody in view for a day: the file empties and goes, with no new record."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 1)
    await _report(hass, TARGET_1, 0, 0)
    await _advance(hass, clock, 60)
    assert len(_stored(hass_storage, device_id)) == 2

    # 24 hours on, the prune waits for its 10 minute batch.
    await _advance(hass, clock, 24 * 3600)
    assert len(_stored(hass_storage, device_id)) == 2

    await _advance(hass, clock, 600)
    await hass.async_block_till_done(wait_background_tasks=True)

    assert STORAGE_KEY not in hass_storage
    assert _history(hass).count(device_id) == 0


async def test_load_that_drops_old_records_rewrites_the_file(
    hass, clock, config_entry, device_id, hass_storage
) -> None:
    """A load that keeps less than the file holds writes the rest back."""
    old = [
        (START_MS - DAY_MS - 5000, 0, *SPOT_A),
        (START_MS - DAY_MS - 4000, -1, 0, 0),
    ]
    recent = [
        (START_MS - HOUR_MS, 1, *SPOT_B),
        (START_MS - HOUR_MS + 1000, -2, 0, 0),
    ]
    _seed_flags(hass_storage, device_id)
    _seed(hass_storage, {device_id: old + recent}, saved_at=START_MS - HOUR_MS)

    await setup_integration(hass, config_entry)

    assert _records(hass, device_id) == recent
    # With the routine save, not at once.
    assert _stored(hass_storage, device_id) == old + recent
    await _advance(hass, clock, 60)
    assert _stored(hass_storage, device_id) == recent


async def test_history_is_capped_per_radar_dropping_the_oldest(
    hass, clock, history_on, monkeypatch
) -> None:
    """Past the cap and its slack, the oldest records go, back to the cap."""
    device_id = history_on
    monkeypatch.setattr(movement, "MOVEMENT_MAX_POINTS", 10)
    monkeypatch.setattr(movement, "MOVEMENT_PRUNE_SLACK", 5)
    for step in range(15):
        await _report(hass, TARGET_1, 100 * step, 2000)
        await _advance(hass, clock, 1)
    assert len(_records(hass, device_id)) == 15

    await _report(hass, TARGET_1, 1500, 2000)

    assert _points(hass, device_id) == [(0, 100 * step, 2000) for step in range(6, 16)]


async def test_a_clock_step_back_keeps_columns_sorted(
    hass, clock, history_on, caplog
) -> None:
    """A correction of up to a minute stamps records at the last time."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)

    clock.move_to(START - timedelta(seconds=30))
    await _report(hass, TARGET_2, *SPOT_B)
    await _report(hass, TARGET_1, 0, 0)

    assert _records(hass, device_id) == [
        (START_MS, 0, *SPOT_A),
        (START_MS, 1, *SPOT_B),
        (START_MS, -1, 0, 0),
    ]
    assert apollo_warnings(caplog) == []


async def test_a_large_clock_step_back_drops_future_records(
    hass, clock, history_on, caplog
) -> None:
    """A step back past a minute drops what lies ahead of it, warning once."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 1)
    await _report(hass, TARGET_1, *SPOT_B)

    clock.move_to(START - timedelta(minutes=5))
    await _report(hass, TARGET_1, *SPOT_C)

    assert _records(hass, device_id) == [(START_MS - 300000, 0, *SPOT_C)]
    [warning] = apollo_warnings(caplog)
    assert device_id in warning
    assert "2 records" in warning

    clock.move_to(START - timedelta(minutes=10))
    await _report(hass, TARGET_1, *SPOT_A)

    assert _records(hass, device_id) == [(START_MS - 600000, 0, *SPOT_A)]
    assert len(apollo_warnings(caplog)) == 1


async def test_delayed_save_is_scheduled_once_per_dirty_period(
    hass, clock, history_on, hass_storage
) -> None:
    """Records do not push the save out: one schedule until the save runs."""
    device_id = history_on
    store = _history(hass)._store  # noqa: SLF001 - the subject's Store
    with patch.object(
        store, "async_delay_save", wraps=store.async_delay_save
    ) as delay_save:
        for step in range(20):
            await _report(hass, TARGET_1, 100 * step, 2000)
            await _advance(hass, clock, 1)
        await _report(hass, TARGET_1, 0, 0)
        assert delay_save.call_count == 1
        assert STORAGE_KEY not in hass_storage

        await _advance(hass, clock, 40)
        assert len(_stored(hass_storage, device_id)) == 21

        await _report(hass, TARGET_1, *SPOT_A)
        assert delay_save.call_count == 2


async def test_flag_off_deletes_history_and_saves_promptly(
    hass, clock, history_on, hass_storage
) -> None:
    """Turning history off deletes the radar's records, on disk within a second."""
    device_id = history_on
    other_id, other_pair = _add_radar(hass)
    await _update_zone(hass, {"device_id": other_id, STORE_MOVEMENT_HISTORY: True})
    await _report(hass, TARGET_1, *SPOT_A)
    await _report(hass, other_pair, *SPOT_B)
    await _advance(hass, clock, 60)
    assert _stored_radars(hass_storage) == {device_id, other_id}

    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: False})

    history = _history(hass)
    assert history.count(device_id) == 0
    assert history.payload(device_id, None, _now_ms())["enabled"] is False
    await _advance(hass, clock, 1)
    assert _stored_radars(hass_storage) == {other_id}
    # The radar is no longer recorded; the other one still is.
    await _report(hass, TARGET_1, *SPOT_C)
    assert history.count(device_id) == 0
    assert history.count(other_id) > 0


async def test_flag_off_on_the_last_radar_removes_the_file(
    hass, clock, history_on, hass_storage
) -> None:
    """With no radar left with records, the file goes instead of being saved."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 60)
    assert STORAGE_KEY in hass_storage

    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: False})
    await hass.async_block_till_done(wait_background_tasks=True)

    assert STORAGE_KEY not in hass_storage
    await _advance(hass, clock, 120)
    assert STORAGE_KEY not in hass_storage


async def test_turning_history_off_during_a_save_still_removes_the_file(
    hass, clock, history_on, hass_storage, monkeypatch
) -> None:
    """A save already on its way to disk lands before the removal, not after it."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    gate = asyncio.Event()
    _slow_writes(_history(hass)._store, monkeypatch, gate)  # noqa: SLF001

    async def _remove_at_once(store: Store) -> None:
        # Store.async_remove, with its unlink done before the held save can
        # land: the order a fast unlink and a slow write can take on a disk.
        store._async_cleanup_delay_listener()  # noqa: SLF001
        store._async_cleanup_final_write_listener()  # noqa: SLF001
        hass_storage.pop(store.key, None)

    monkeypatch.setattr(Store, "async_remove", _remove_at_once)
    # The routine save starts, with the radar's records, and waits on the disk.
    clock.tick(timedelta(seconds=60))
    async_fire_time_changed_exact(hass, dt_util.utcnow() + timedelta(microseconds=1))

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, STORE_MOVEMENT_HISTORY: False},
        blocking=True,
    )
    gate.set()
    await hass.async_block_till_done(wait_background_tasks=True)

    assert STORAGE_KEY not in hass_storage


async def test_clear_keeps_the_flag_and_recording(
    hass, clock, history_on, hass_storage, monkeypatch
) -> None:
    """A clear deletes the records only: a still target is recorded again at once."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 1)
    await _report(hass, TARGET_1, *SPOT_B)
    await _advance(hass, clock, 60)
    history = _history(hass)
    # The file is still being removed when the target is recorded again, and
    # that record's save must outlive the removal.
    _slow_writes(history._store, monkeypatch)  # noqa: SLF001 - the subject's Store
    before = history.count(device_id)
    assert before > 2
    cleared_at = _now_ms()

    assert history.clear(device_id) == before
    await hass.async_block_till_done(wait_background_tasks=True)

    assert _records(hass, device_id) == [(cleared_at, 0, *SPOT_B)]
    assert get_store(hass).devices[device_id][STORE_MOVEMENT_HISTORY] is True
    # The file held only what was cleared, so it went at once.
    assert STORAGE_KEY not in hass_storage
    await _advance(hass, clock, 60)
    assert _stored(hass_storage, device_id)[0] == (cleared_at, 0, *SPOT_B)


async def test_clear_with_nothing_recorded_writes_nothing(
    hass, clock, history_on, hass_storage
) -> None:
    """Clearing an empty history saves, schedules and removes nothing."""
    device_id = history_on
    history = _history(hass)
    store = history._store  # noqa: SLF001 - the subject's Store
    with (
        patch.object(store, "async_save") as save,
        patch.object(store, "async_delay_save") as delay_save,
        patch.object(store, "async_remove") as remove,
    ):
        assert history.clear(device_id) == 0
        await _advance(hass, clock, 120)

    save.assert_not_called()
    delay_save.assert_not_called()
    remove.assert_not_called()
    assert STORAGE_KEY not in hass_storage


async def test_stop_closes_slots_before_the_final_write(
    hass, clock, history_on, hass_storage
) -> None:
    """The final write already holds a gone marker for everyone on the map."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 1)

    hass.set_state(CoreState.stopping)
    hass.bus.async_fire(EVENT_HOMEASSISTANT_STOP)
    await hass.async_block_till_done()
    # Store defers every write to the final write while Home Assistant stops.
    assert STORAGE_KEY not in hass_storage
    hass.bus.async_fire(EVENT_HOMEASSISTANT_FINAL_WRITE)
    await hass.async_block_till_done()

    assert _stored(hass_storage, device_id) == [
        (START_MS, 0, *SPOT_A),
        (START_MS + 1000, -1, 0, 0),
    ]


@pytest.mark.parametrize(
    ("saved_at", "closed_at"),
    [
        (START_MS - 60000, START_MS - 60000),
        (START_MS + HOUR_MS, START_MS),
        (None, START_MS - 80000),
    ],
    ids=["at_the_last_save", "now_when_saved_later", "at_its_last_record"],
)
@pytest.mark.usefixtures("clock")
async def test_load_closes_open_slots_with_gone_markers(
    hass, device_id, hass_storage, saved_at, closed_at
) -> None:
    """Home Assistant was down, so whoever was on the map is closed off."""
    saved = [
        (START_MS - 100000, 0, *SPOT_A),
        (START_MS - 90000, 1, *SPOT_B),
        (START_MS - 85000, -2, 0, 0),
        (START_MS - 80000, 0, *SPOT_C),
    ]
    _seed_flags(hass_storage, device_id)
    _seed(hass_storage, {device_id: saved}, saved_at=saved_at)

    await setup_integration(hass, make_entry())

    assert _records(hass, device_id) == [*saved, (closed_at, -1, 0, 0)]


async def test_load_drops_history_of_radars_without_the_flag(
    hass, clock, device_id, hass_storage
) -> None:
    """Only a radar with the flag on and still in Home Assistant keeps its file."""
    flag_off_id, _pair = _add_radar(hass)
    kept = [(START_MS - 2000, 0, *SPOT_A), (START_MS - 1000, -1, 0, 0)]
    dropped = [(START_MS - 2000, 0, *SPOT_B), (START_MS - 1000, -1, 0, 0)]
    _seed_flags(hass_storage, device_id, "removed-radar")
    _seed(
        hass_storage,
        {device_id: kept, flag_off_id: dropped, "removed-radar": dropped},
        saved_at=START_MS,
    )

    await setup_integration(hass, make_entry())

    history = _history(hass)
    assert _records(hass, device_id) == kept
    assert history.count(flag_off_id) == 0
    assert history.count("removed-radar") == 0
    # Dropped by the load itself, so the file is rewritten with the routine
    # save, not within the second a radar removed while running gets.
    await _advance(hass, clock, 1)
    assert _stored_radars(hass_storage) == {device_id, flag_off_id, "removed-radar"}
    await _advance(hass, clock, 59)
    assert _stored_radars(hass_storage) == {device_id}


async def test_removed_radar_stops_recording_and_loses_its_history(
    hass, clock, init_integration, device_id, hass_storage
) -> None:
    """A radar gone from Home Assistant is forgotten, and records again restored."""
    _ = init_integration
    device_registry = dr.async_get(hass)
    radar = device_registry.async_get(device_id)
    assert radar is not None
    # Pairs configured from the start keep the radar out of the pair cache, so
    # its removal reaches the history only as a device registry change.
    await _update_zone(
        hass,
        {"device_id": device_id, "entities": [TARGET_1], STORE_MOVEMENT_HISTORY: True},
    )
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 60)
    assert STORAGE_KEY in hass_storage

    device_registry.async_remove_device(device_id)
    await hass.async_block_till_done(wait_background_tasks=True)

    assert _history(hass).count(device_id) == 0
    assert STORAGE_KEY not in hass_storage
    # Its zone store entry and flag stay (X08).
    assert get_store(hass).devices[device_id][STORE_MOVEMENT_HISTORY] is True
    await _report(hass, TARGET_1, *SPOT_B)
    assert _history(hass).count(device_id) == 0

    # Restored with its old id, the radar records again.
    for entity_id in TARGET_1.values():
        hass.states.async_remove(entity_id)
    restored = device_registry.async_get_or_create(
        config_entry_id=radar.config_entry_id,
        identifiers=radar.identifiers,
        name=RADAR_NAME,
    )
    assert restored.id == device_id
    entity_registry = er.async_get(hass)
    pair = {
        axis: entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            f"target_1_{axis}",
            device_id=device_id,
            suggested_object_id=f"r_pro_ld2450_target_1_{axis}",
        ).entity_id
        for axis in ("x", "y")
    }
    await hass.async_block_till_done()
    await _report(hass, pair, *SPOT_C)

    assert _points(hass, device_id) == [(0, *SPOT_C)]


async def test_a_read_after_the_flag_went_off_shows_nothing(hass, history_on) -> None:
    """Between the flag's save and the zone signal (D37), a read shows no record."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)

    # The store as update_zone leaves it while it saves, before the signal
    # that deletes the history.
    del get_store(hass).devices[device_id][STORE_MOVEMENT_HISTORY]

    payload = _history(hass).payload(device_id, None, _now_ms())
    assert payload["enabled"] is False
    assert payload["n"] == 0
    assert payload["x"] == ""


async def test_corrupt_movement_file_copy_is_deleted(
    hass, clock, config_entry, device_id, hass_storage
) -> None:
    """A corrupt file's copies hold positions: load and every removal delete them."""
    storage = Path(hass.config.path(".storage"))
    kept = {
        f"{ZONE_STORAGE_KEY}.corrupt.2026-01-01T00:00:00.000000+00:00",
        f"{STORAGE_KEY}_old.corrupt.1",
    }
    await hass.async_add_executor_job(_write_files, storage, {CORRUPT_COPY, *kept})

    await setup_integration(hass, config_entry)

    files = await hass.async_add_executor_job(_storage_files, hass)
    assert CORRUPT_COPY not in files
    assert kept <= files

    # Removing the file removes a copy too.
    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: True})
    await _report(hass, TARGET_1, *SPOT_A)
    await hass.async_add_executor_job(_write_files, storage, [CORRUPT_COPY])
    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: False})
    await hass.async_block_till_done(wait_background_tasks=True)
    assert CORRUPT_COPY not in await hass.async_add_executor_job(_storage_files, hass)

    # So does removing the integration.
    await hass.async_add_executor_job(_write_files, storage, [CORRUPT_COPY])
    await hass.config_entries.async_remove(config_entry.entry_id)
    await hass.async_block_till_done()
    files = await hass.async_add_executor_job(_storage_files, hass)
    assert CORRUPT_COPY not in files
    assert kept <= files


async def test_a_new_pair_list_closes_slots_and_resubscribes(
    hass, clock, history_on
) -> None:
    """Slot numbers follow the pair list, so a new list starts every slot over."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _report(hass, TARGET_2, *SPOT_B)
    await _advance(hass, clock, 1)

    await _update_zone(hass, {"device_id": device_id, "entities": [TARGET_2]})

    assert _records(hass, device_id) == [
        (START_MS, 0, *SPOT_A),
        (START_MS, 1, *SPOT_B),
        (START_MS + 1000, -1, 0, 0),
        (START_MS + 1000, -2, 0, 0),
        (START_MS + 1000, 0, *SPOT_B),
    ]

    # Target 1 is no longer tracked; target 2 is, as slot 0.
    await _advance(hass, clock, 1)
    await _report(hass, TARGET_1, *SPOT_C)
    assert len(_records(hass, device_id)) == 5
    await _report(hass, TARGET_2, *SPOT_C)
    assert _records(hass, device_id)[5:] == [(START_MS + 2000, 0, *SPOT_C)]


async def test_unload_stops_tracking_and_saves_only_when_dirty(
    hass, clock, config_entry, history_on, hass_storage
) -> None:
    """An unload closes the slots and writes at once, and only what is pending."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 1)
    assert STORAGE_KEY not in hass_storage

    assert await hass.config_entries.async_unload(config_entry.entry_id)
    await hass.async_block_till_done()

    assert _stored(hass_storage, device_id) == [
        (START_MS, 0, *SPOT_A),
        (START_MS + 1000, -1, 0, 0),
    ]
    # Nothing tracks the radar any more, and no save is left pending.
    written = copy.deepcopy(hass_storage[STORAGE_KEY])
    await _report(hass, TARGET_1, *SPOT_B)
    await _advance(hass, clock, 120)
    assert hass_storage[STORAGE_KEY] == written

    # Set up again with nobody in view, nothing is pending, and the next
    # unload writes nothing: the marker below would not survive a write.
    await _report(hass, TARGET_1, 0, 0)
    hass_storage[STORAGE_KEY]["unwritten"] = True
    assert await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()
    assert _history(hass).count(device_id) == 2
    assert await hass.config_entries.async_unload(config_entry.entry_id)
    await hass.async_block_till_done()
    assert hass_storage[STORAGE_KEY]["unwritten"] is True


async def test_an_unloaded_history_never_touches_the_file_again(
    hass, clock, config_entry, history_on
) -> None:
    """Closing a slot at unload leaves no timer behind to prune and save later."""
    _ = history_on
    # Someone in view, so the unload records a gone marker.
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 1)
    unloaded = _history(hass)
    unloaded_store = unloaded._store  # noqa: SLF001 - the subject's Store

    assert await hass.config_entries.async_reload(config_entry.entry_id)
    await hass.async_block_till_done()

    assert _history(hass) is not unloaded
    with (
        patch.object(unloaded_store, "async_save") as save,
        patch.object(unloaded_store, "async_delay_save") as delay_save,
        patch.object(unloaded_store, "async_remove") as remove,
    ):
        # Past the day and the prune batch of every record the unloaded
        # history held, when its retention timer would have pruned them all.
        await _advance(hass, clock, DAY_MS / 1000 + 600)
        await hass.async_block_till_done(wait_background_tasks=True)

    save.assert_not_called()
    delay_save.assert_not_called()
    remove.assert_not_called()


async def test_stop_leaves_no_retention_timer(hass, clock, history_on) -> None:
    """The gone markers written at stop start no timer that outlives it."""
    _ = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 1)

    hass.set_state(CoreState.stopping)
    hass.bus.async_fire(EVENT_HOMEASSISTANT_STOP)
    await hass.async_block_till_done()

    # Home Assistant cancels its timers before STOP, so one started in answer
    # to it would run on.
    assert _history(hass)._retention is None  # noqa: SLF001 - the subject's timer


@pytest.mark.parametrize("deleted_by", ["clear", "flag_off"])
async def test_history_deleted_before_its_first_save_writes_no_file(
    hass, clock, history_on, hass_storage, deleted_by
) -> None:
    """Records that never reached disk are deleted without writing the file."""
    device_id = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    # Gone again, so a clear has nobody in view to record at once.
    await _report(hass, TARGET_1, 0, 0)
    history = _history(hass)
    store = history._store  # noqa: SLF001 - the subject's Store

    with patch.object(store, "async_save", wraps=store.async_save) as save:
        if deleted_by == "clear":
            assert history.clear(device_id) == 2
        else:
            await _update_zone(
                hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: False}
            )
        await hass.async_block_till_done(wait_background_tasks=True)
        # The routine save that was pending went with the records.
        await _advance(hass, clock, 120)

    save.assert_not_called()
    assert STORAGE_KEY not in hass_storage
    assert history.count(device_id) == 0


async def test_remove_after_failed_unload_writes_nothing_first(
    hass, clock, config_entry, history_on, hass_storage
) -> None:
    """With nothing saved yet this run, the removal writes no file to remove."""
    _ = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 1)
    store = _history(hass)._store  # noqa: SLF001 - the subject's Store

    with patch.object(store, "async_save", wraps=store.async_save) as save:
        await async_remove_entry(hass, config_entry)
        await hass.async_block_till_done(wait_background_tasks=True)
        await _advance(hass, clock, 60)

    save.assert_not_called()
    assert STORAGE_KEY not in hass_storage


async def test_remove_entry_deletes_the_movement_file(
    hass, clock, config_entry, history_on, hass_storage
) -> None:
    """Removing the integration removes every position it kept."""
    _ = history_on
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 60)
    assert STORAGE_KEY in hass_storage

    await hass.config_entries.async_remove(config_entry.entry_id)
    await hass.async_block_till_done()

    assert STORAGE_KEY not in hass_storage
    await _advance(hass, clock, 120)
    assert STORAGE_KEY not in hass_storage


async def test_remove_after_failed_unload_leaves_no_file(
    hass, clock, config_entry, history_on, hass_storage
) -> None:
    """A history left recording by a failed unload writes nothing back."""
    device_id = history_on
    # A save is pending, and the slot is open.
    await _report(hass, TARGET_1, *SPOT_A)
    await _advance(hass, clock, 1)

    # Called directly, as Home Assistant does after an unload that failed: the
    # live history, its recorder and its pending save are still in place.
    await async_remove_entry(hass, config_entry)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert STORAGE_KEY not in hass_storage

    await _report(hass, TARGET_1, *SPOT_B)
    await _advance(hass, clock, 60)
    assert STORAGE_KEY not in hass_storage
    assert _history(hass).count(device_id) == 0


# ---------------------------------------------------------------------------
# Privacy
# ---------------------------------------------------------------------------


async def test_movement_never_logs_positions(
    hass, clock, device_id, hass_storage, caplog
) -> None:
    """No log line at any level carries a coordinate: records, load, clear, unload."""
    caplog.set_level(logging.DEBUG, logger="custom_components.apollo_mmwave")
    other_id, _pair = _add_radar(hass)
    saved = [(START_MS - 5000, 0, *SPOT_A), (START_MS - 4000, 1, *SPOT_B)]
    _seed_flags(hass_storage, device_id, other_id)
    # The other radar's history is malformed, which is warned about.
    _seed(
        hass_storage,
        {device_id: saved, other_id: {**pack_movement(saved), "n": 3}},
        saved_at=START_MS - 3000,
    )
    entry = make_entry()
    await setup_integration(hass, entry)

    for spot in (SPOT_C, SPOT_A, SPOT_B):
        await _report(hass, TARGET_1, *spot)
        await _advance(hass, clock, 1)
    await _advance(hass, clock, 15)
    clock.move_to(START - timedelta(minutes=5))
    await _report(hass, TARGET_1, *SPOT_C)
    clock.move_to(START + timedelta(minutes=1))
    await _advance(hass, clock, 60)
    _history(hass).clear(device_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()

    messages = [
        record.getMessage().replace(device_id, "").replace(other_id, "")
        for record in caplog.records
        if record.name.startswith("custom_components.apollo_mmwave")
    ]
    # The session did log: the malformed radar, the clock, the debug lines.
    assert len(messages) >= 5
    assert any("malformed" in message for message in messages)
    assert any("clock" in message for message in messages)
    columns = pack_movement(saved)
    for message in messages:
        assert not any(value in message for value in SPOT_VALUES), message
        assert not any(columns[key] in message for key in ("dt", "s", "x", "y"))


async def test_diagnostics_never_carry_points(
    hass, clock, config_entry, history_on, hass_client
) -> None:
    """The support file says the flag and the count, and writes nothing."""
    # hass_client after clock: its access token is issued at START, not in
    # what the frozen clock calls the future.
    device_id = history_on
    for spot in (SPOT_A, SPOT_B, SPOT_C):
        await _report(hass, TARGET_1, *spot)
        await _advance(hass, clock, 1)
    # The live reading, which the file does carry, no longer shows any of them.
    await _report(hass, TARGET_1, 0, 0)
    history = _history(hass)
    columns = history.payload(device_id, None, _now_ms())
    store = history._store  # noqa: SLF001 - the subject's Store

    with (
        patch.object(store, "async_save") as save,
        patch.object(store, "async_delay_save") as delay_save,
    ):
        result = await get_diagnostics_for_config_entry(hass, hass_client, config_entry)

    assert result["movement_store_loaded"] is True
    [section] = [item for item in result["devices"] if item["device_id"] == device_id]
    assert section["movement_history"] == {"enabled": True, "points": 4}
    dumped = json.dumps(result["devices"]).replace(device_id, "")
    assert not any(value in dumped for value in SPOT_VALUES)
    assert not any(columns[key] in dumped for key in ("dt", "s", "x", "y"))
    save.assert_not_called()
    delay_save.assert_not_called()
