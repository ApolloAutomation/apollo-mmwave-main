"""The calibration job, its three services, and the entry lifecycle around it."""

from __future__ import annotations

import asyncio
import json
import logging
import math
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Context, CoreState, callback
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_registry import RegistryEntryDisabler
from homeassistant.helpers.translation import async_get_translations
from homeassistant.util.file import WriteError

from custom_components.apollo_mmwave import calibration
from custom_components.apollo_mmwave.calibration_store import CalibrationStore
from custom_components.apollo_mmwave.const import (
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

from .conftest import (
    CALIBRATION_STORAGE_KEY,
    LD2410_FACTORY,
    LD2410_GATES,
    LD2412_GATES,
    CalibrationRig,
    RadarIds,
    finish_job,
    radar_ids,
    settle,
    setup_integration,
)

# An energy that moves every LD2410 factory threshold: 60 + max(10, 15) = 75.
ALL_CHANGE = 60
ALL_CHANGE_NEW = 75
# Ten points of energy gives 10 + max(10, 2.5) = 20, which equals four factory
# values (g4 move, g6/g7/g8 still), so those four are reported unchanged.
QUIET = 10
QUIET_NEW = 20
QUIET_UNCHANGED = 4

EN_JSON = Path(calibration.__file__).parent / "translations" / "en.json"
EXCEPTION_MESSAGES = json.loads(EN_JSON.read_text(encoding="utf-8"))["exceptions"]
STORE_WRITE = "homeassistant.helpers.storage.Store._async_write_data"


async def _disk_full(_store, _data) -> None:
    raise WriteError(OSError(28, "No space left on device"))


def proposal(peak: float) -> int:
    """Mirror the two-part headroom rule for expectations."""
    return min(100, math.ceil(peak + max(10, peak * 25 / 100)))


def _jobs(hass) -> dict[str, calibration.CalibrationJob]:
    return hass.data[DOMAIN][DATA_CALIBRATION_JOBS]


def _store(hass) -> CalibrationStore:
    return hass.data[DOMAIN][DATA_CALIBRATION_STORE]


def _cell(result: dict[str, Any], gate: int, channel: str) -> dict[str, Any]:
    return result["gates"][gate][channel]


@pytest.fixture
def harness(calibration_rig) -> CalibrationRig:
    """Return the shared calibration rig under its short local name."""
    return calibration_rig


@pytest.fixture
def msr(ld2410_device) -> RadarIds:
    """Return the LD2410 radar's ids."""
    return radar_ids(ld2410_device)


@pytest.fixture
def rpro(ld2412_device) -> RadarIds:
    """Return the LD2412 radar's ids."""
    return radar_ids(ld2412_device)


async def _reject(
    hass, service: str, data: dict[str, Any], key: str
) -> ServiceValidationError:
    # Rendering the message through HA's translation cache means a key or
    # placeholder that is wrong in en.json fails here, not in a user's log.
    await async_get_translations(hass, "en", "exceptions", [DOMAIN])
    with pytest.raises(ServiceValidationError) as info:
        await hass.services.async_call(DOMAIN, service, data, blocking=True)
    assert info.value.translation_domain == DOMAIN
    assert info.value.translation_key == key
    template = EXCEPTION_MESSAGES[key]["message"].rstrip(".")
    placeholders = info.value.translation_placeholders or {}
    assert str(info.value) == template.format(**placeholders)
    return info.value


def test_every_preflight_translation_key_is_in_en_json() -> None:
    """The `exceptions` block holds exactly the pre-flight keys, nothing stale."""
    keys = {
        value for name, value in vars(calibration).items() if name.startswith("TR_")
    }
    assert keys == set(EXCEPTION_MESSAGES)


# --------------------------------------------------------------- phases


async def test_calibrate_turns_engineering_mode_on_first_and_back_off(
    harness, msr
) -> None:
    """The switch goes on at t = 0 and off once after the last write."""
    task = harness.start(msr)
    assert [call[:3] for call in harness.services.calls] == [
        ("switch", "turn_on", msr.engineering)
    ]
    harness.feed.set_all(ALL_CHANGE, ALL_CHANGE, msr)
    await harness.advance(15)
    result = await finish_job(task)

    assert result["outcome"] == "applied"
    kinds = [call[1] for call in harness.services.calls]
    assert kinds.count("turn_off") == 1
    assert kinds.index("turn_off") > max(
        index for index, kind in enumerate(kinds) if kind == "set_value"
    )
    assert result["engineering_mode_turned_on"] is True


async def test_calibrate_leaves_engineering_mode_on_when_it_was_on(
    harness, msr
) -> None:
    """A switch that already read on is never touched."""
    harness.hass.states.async_set(msr.engineering, "on")

    result = await harness.run(msr)

    assert result["outcome"] == "applied"
    assert [call for call in harness.services.calls if call[0] == "switch"] == []
    assert result["engineering_mode_turned_on"] is False


async def test_calibrate_fails_when_engineering_mode_never_confirms(
    harness, msr
) -> None:
    """Ten ticks without the switch reading on is a failure, with nothing to undo."""
    harness.services.echo_switch = False
    task = harness.start(msr)
    await harness.advance(9)
    assert harness.job(msr).status == "preparing"
    await harness.advance(1)
    result = await finish_job(task)

    assert result["status"] == "failed"
    assert result["error"]["code"] == "engineering_mode_not_confirmed"
    assert harness.services.writes() == []
    assert harness.services.of("turn_off") == []
    assert _store(harness.hass).interrupted(msr.device_id) is None


@pytest.mark.parametrize("settle_s", [0, 60])
async def test_calibrate_fails_when_no_energy_arrives(harness, msr, settle_s) -> None:
    """No numeric energy 20 s after the switch read on fails, even mid-countdown."""
    task = harness.start(msr, settle_s=settle_s, duration_s=15)
    await harness.advance(19)
    assert harness.job(msr).status == "preparing"
    await harness.advance(1)
    result = await finish_job(task)

    assert result["error"]["code"] == "no_energy_data"
    assert harness.services.writes() == []
    assert len(harness.services.of("turn_off")) == 1


async def test_calibrate_sampling_starts_at_max_of_countdown_and_first_energy(
    harness, msr
) -> None:
    """Sampling waits for both the countdown and the first numeric energy."""
    task = harness.start(msr, settle_s=15, duration_s=15)
    await harness.advance(5)
    harness.feed.set_all(QUIET, QUIET, msr)
    job = harness.job(msr)
    await harness.advance(9)
    assert (job.status, job.sub_phase, job.remaining_s) == ("preparing", "settle", 1)
    await harness.advance(1)
    assert (job.status, job.samples) == ("sampling", 1)
    await harness.advance(14)
    result = await finish_job(task)
    assert result["samples"] == 15

    harness.feed.set_all("unknown", "unknown", msr)
    task = harness.start(msr, settle_s=15, duration_s=15)
    job = harness.job(msr)
    phases = []
    for _ in range(18):
        await harness.advance(1)
        phases.append((job.status, job.sub_phase))
        if len(phases) == 17:
            harness.feed.set_all(QUIET, QUIET, msr)
    assert phases[13] == ("preparing", "settle")
    assert phases[14:17] == [("preparing", "warmup")] * 3
    assert phases[17] == ("sampling", None)
    assert job.samples == 1
    await harness.advance(14)
    result = await finish_job(task)
    assert result["samples"] == 15


async def test_calibrate_fails_when_engineering_mode_is_turned_off_mid_sampling(
    harness, msr
) -> None:
    """Two ticks with the switch reading off abort the listen without a turn_off."""
    task = harness.start(msr, duration_s=60)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(20)
    harness.hass.states.async_set(msr.engineering, "off")
    await harness.advance(1)
    assert harness.job(msr).status == "sampling"
    await harness.advance(1)
    result = await finish_job(task)

    assert result["error"]["code"] == "engineering_mode_lost"
    assert harness.services.writes() == []
    assert harness.services.of("turn_off") == []
    assert _store(harness.hass).interrupted(msr.device_id) is None


async def test_calibrate_fails_when_background_correction_starts_mid_sampling(
    harness, rpro
) -> None:
    """The LD2412 status turning on aborts the listen and restores the mode."""
    task = harness.start(rpro, duration_s=60)
    harness.feed.set_all(QUIET, QUIET, rpro)
    await harness.advance(20)
    harness.hass.states.async_set(rpro.bg_status, "on")
    await harness.advance(1)
    result = await finish_job(task)

    assert result["error"]["code"] == "background_correction_started"
    assert harness.services.writes() == []
    assert len(harness.services.of("turn_off")) == 1


async def test_calibrate_samples_count_ticks_not_events(harness, msr) -> None:
    """Values reported between ticks raise the peak but are never counted."""
    task = harness.start(msr)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(3)
    for value in (10, 50, 20, 30, 15):
        harness.feed.set({(2, "move"): value}, msr)
    await harness.advance(12)
    result = await finish_job(task)

    assert result["samples"] == 15
    assert _cell(result, 2, "move")["samples"] == 15
    assert _cell(result, 2, "move")["peak"] == 50
    assert _cell(result, 2, "move")["new"] == proposal(50)


# -------------------------------------------------------------- snapshot


async def test_calibrate_snapshots_all_thresholds_before_first_write(
    harness, msr, hass_storage
) -> None:
    """Every threshold is on disk, with its unique id, before the first write."""
    seen: list[bool] = []

    def _on_call(domain: str, service: str, _entity_id: str) -> None:
        if (domain, service) == ("number", "set_value") and not seen:
            stored = hass_storage.get(CALIBRATION_STORAGE_KEY, {}).get("data", {})
            snapshots = (
                stored.get("devices", {}).get(msr.device_id, {}).get("snapshots")
            )
            seen.append(bool(snapshots) and len(snapshots[0]["values"]) == 18)

    harness.services.on_call = _on_call
    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert seen == [True]
    snapshot = _store(harness.hass).snapshot(msr.device_id)
    assert snapshot["id"] == result["snapshot_id"]
    assert snapshot["reason"] == "calibrate"
    assert sorted(snapshot["values"]) == sorted(msr.thresholds())
    entry = snapshot["values"][msr.threshold(3, "still")]
    assert entry["value"] == LD2410_FACTORY["still"][3]
    assert entry["platform"] == "esphome"
    assert entry["unique_id"] == "uid_apollo_msr_2_abc123_g3_still_threshold"


async def test_calibrate_snapshot_reflects_values_at_apply_time(harness, msr) -> None:
    """A slider moved during the listen is what the snapshot and `old` record."""
    task = harness.start(msr)
    harness.feed.set_all(ALL_CHANGE, ALL_CHANGE, msr)
    await harness.advance(5)
    harness.hass.states.async_set(
        msr.threshold(0, "move"), "33", {"min": 0, "max": 100}
    )
    await harness.advance(10)
    result = await finish_job(task)

    snapshot = _store(harness.hass).snapshot(msr.device_id)
    assert snapshot["values"][msr.threshold(0, "move")]["value"] == 33
    assert _cell(result, 0, "move")["old"] == 33


async def test_calibrate_refuses_to_write_when_snapshot_save_fails(
    harness, msr, init_integration, caplog, hass_storage
) -> None:
    """A snapshot that cannot be saved means no write at all."""
    harness.hass.states.async_set(msr.engineering, "on")

    # HA's own Store catches a WriteError and only logs it, so this patches the
    # real write path rather than CalibrationStore.async_save.
    with patch(STORE_WRITE, new=_disk_full):
        result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

        assert result["error"]["code"] == "snapshot_failed"
        assert harness.services.writes() == []
        assert result["snapshot_id"] is None
        assert _store(harness.hass).snapshots_summary(msr.device_id) == []
        assert CALIBRATION_STORAGE_KEY not in hass_storage

        # The entry still unloads while the disk refuses; the failure is logged.
        assert await harness.hass.config_entries.async_unload(init_integration.entry_id)
        await harness.hass.async_block_till_done()
    assert "could not save apollo_mmwave.calibration while unloading" in caplog.text


async def test_calibrate_refuses_to_turn_engineering_mode_on_without_a_saved_marker(
    harness, msr
) -> None:
    """The marker must reach disk before switch.turn_on, or the switch is left alone."""
    with patch(STORE_WRITE, new=_disk_full):
        result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["error"]["code"] == "snapshot_failed"
    assert result["engineering_mode_turned_on"] is False
    assert harness.services.calls == []
    assert _store(harness.hass).interrupted(msr.device_id) is None


async def test_calibrate_marker_without_store_stops_before_the_switch(
    harness, msr, monkeypatch
) -> None:
    """A job whose store is gone (entry unloading) never turns the mode on."""
    monkeypatch.setattr(
        calibration.CalibrationJob, "_store_if_present", lambda _self: None
    )

    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["error"]["code"] == "cancelled_by_shutdown"
    assert harness.services.calls == []


# ---------------------------------------------------------------- writes


async def test_calibrate_writes_peak_plus_margin_per_gate(harness, msr) -> None:
    """Each threshold is the gate's own peak plus headroom."""
    # g2 move ships at the factory value 40, which is also the proposal for a
    # peak of 30, so it would be skipped as unchanged; start it elsewhere.
    harness.hass.states.async_set(
        msr.threshold(2, "move"), "50", {"min": 0, "max": 100}
    )
    task = harness.start(msr)
    harness.feed.set_all(0, 0, msr)
    harness.feed.set({(2, "move"): 10, (0, "still"): 97}, msr)
    await harness.advance(5)
    harness.feed.set({(2, "move"): 30}, msr)
    await harness.advance(5)
    harness.feed.set({(2, "move"): 25}, msr)
    await harness.advance(5)
    result = await finish_job(task)

    writes = dict(harness.services.writes())
    assert writes[msr.threshold(2, "move")] == 40
    assert writes[msr.threshold(0, "still")] == 100
    assert _cell(result, 2, "move")["peak"] == 30
    assert _cell(result, 0, "still")["flags"] == ["off"]


async def test_calibrate_skips_values_equal_to_current(harness, msr) -> None:
    """Thresholds already at the proposal are not rewritten."""
    for entity_id in msr.thresholds():
        harness.hass.states.async_set(entity_id, str(QUIET_NEW), {"min": 0, "max": 100})

    result = await harness.run(msr)

    assert harness.services.writes() == []
    assert result["unchanged"] == 18
    assert result["changed"] == 0
    assert result["writes_total"] == 0
    assert result["outcome"] == "applied"
    assert _cell(result, 0, "move")["written"] is False
    assert _cell(result, 0, "move")["confirmed"] is None


async def test_calibrate_takes_no_snapshot_when_nothing_changes(
    harness, msr, monkeypatch
) -> None:
    """A second identical run writes nothing, so it saves no snapshot or marker."""
    first = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    harness.services.calls.clear()
    phases: list[str | None] = []
    set_interrupted = CalibrationStore.set_interrupted

    def _record(self, device_id: str, marker: dict[str, Any]) -> None:
        phases.append(marker.get("phase"))
        set_interrupted(self, device_id, marker)

    monkeypatch.setattr(CalibrationStore, "set_interrupted", _record)

    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["outcome"] == "applied"
    assert result["changed"] == 0
    assert result["unchanged"] == 18
    assert result["snapshot_id"] is None
    assert harness.services.writes() == []
    summary = _store(harness.hass).snapshots_summary(msr.device_id)
    assert [item["id"] for item in summary] == [first["snapshot_id"]]
    # Only the engineering marker for the switch; no applying marker.
    assert phases == ["engineering"]
    assert _store(harness.hass).interrupted(msr.device_id) is None


async def test_calibrate_fails_when_every_gate_has_no_data(
    harness, msr, hass_storage
) -> None:
    """A listen in which every gate starved writes nothing and keeps Undo intact."""
    first = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    harness.services.calls.clear()
    task = harness.start(msr)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(2)
    # Readings going `unknown` (not `unavailable`) raise no radar warning.
    for entity_id in [
        msr.energy(gate, channel)
        for gate in range(LD2410_GATES)
        for channel in ("move", "still")
    ]:
        harness.hass.states.async_set(entity_id, "unknown")
    await harness.advance(15)
    result = await finish_job(task)

    assert result["status"] == "failed"
    assert result["error"]["code"] == "no_gate_data"
    assert result["error"]["message"] == calibration.ERROR_MESSAGES["no_gate_data"]
    assert "Nothing was changed." in result["error"]["message"]
    assert result["snapshot_id"] is None
    assert result["changed"] == 0
    assert harness.services.writes() == []
    assert len(harness.services.of("turn_off")) == 1
    assert _cell(result, 0, "move")["flags"] == ["no_data"]
    summary = _store(harness.hass).snapshots_summary(msr.device_id)
    assert [(item["id"], item["count"]) for item in summary] == [
        (first["snapshot_id"], 18)
    ]
    assert _store(harness.hass).interrupted(msr.device_id) is None

    undo = await harness.restore(msr)
    assert undo["outcome"] == "restored"
    assert undo["restored"] == 18
    assert undo["restored_from"]["id"] == first["snapshot_id"]


async def test_calibrate_writes_in_gate_order_move_then_still_with_spacing(
    paced_rig, msr, monkeypatch
) -> None:
    """Writes go gate by gate, move then still, each followed by one 0.25 s pause."""
    events: list[tuple[str, Any]] = []
    real_sleep = asyncio.sleep

    async def _sleep(delay: float, *args: Any) -> None:
        if delay:
            events.append(("sleep", delay))
        await real_sleep(0, *args)

    monkeypatch.setattr(calibration, "RESTORE_READBACK_S", 0)
    monkeypatch.setattr(calibration.asyncio, "sleep", _sleep)
    paced_rig.services.on_set_value = lambda _i, eid, _v: events.append(("write", eid))
    task = paced_rig.start(msr)
    paced_rig.feed.set_all(ALL_CHANGE, ALL_CHANGE, msr)
    await paced_rig.advance(15)
    await finish_job(task)

    writes = [eid for kind, eid in events if kind == "write"]
    assert writes == msr.thresholds()
    for index, (kind, payload) in enumerate(events):
        if kind == "write":
            assert events[index + 1] == ("sleep", 0.25), payload
    assert sum(1 for kind, delay in events if kind == "sleep" and delay == 0.25) == 18


async def test_calibrate_skips_gates_without_energy_or_threshold(
    harness, msr, entity_registry
) -> None:
    """A channel without both entities is reported, with the reason, never written."""
    entity_registry.async_remove(msr.energy(4, "move"))
    entity_registry.async_remove(msr.threshold(5, "still"))

    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    move4 = _cell(result, 4, "move")
    assert move4["skipped"] == "no energy sensor"
    assert move4["flags"] == ["skipped"]
    assert move4["new"] is None
    assert move4["entity_id"] == msr.threshold(4, "move")
    still5 = _cell(result, 5, "still")
    assert still5["skipped"] == "no threshold entity"
    assert still5["entity_id"] is None
    written = {eid for eid, _ in harness.services.writes()}
    assert msr.threshold(4, "move") not in written
    assert msr.threshold(5, "still") not in written
    assert len(written) == 16


async def test_calibrate_flags_unused_gates_ld2410_per_channel(harness, msr) -> None:
    """Beyond the max gate a channel is flagged unused but still calibrated."""
    harness.hass.states.async_set(msr.max_move, "6")
    harness.hass.states.async_set(msr.max_still, "4")

    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert "unused" in _cell(result, 5, "still")["flags"]
    assert "unused" in _cell(result, 7, "move")["flags"]
    assert "unused" not in _cell(result, 5, "move")["flags"]
    assert "unused" not in _cell(result, 6, "move")["flags"]
    assert result["max_move_gate"] == 6
    assert result["max_still_gate"] == 4
    assert len(harness.services.writes()) == 18
    assert all(
        cell["written"]
        for gate in result["gates"]
        for cell in (gate["move"], gate["still"])
    )


async def test_calibrate_flags_unused_gates_ld2412_by_min_max(harness, rpro) -> None:
    """Below the min gate or above the max gate both channels are unused."""
    harness.hass.states.async_set(rpro.min_gate, "2")
    harness.hass.states.async_set(rpro.max_gate, "11")

    result = await harness.run(rpro, move=ALL_CHANGE, still=ALL_CHANGE)

    for gate in (0, 1, 12, 13):
        assert "unused" in _cell(result, gate, "move")["flags"]
        assert "unused" in _cell(result, gate, "still")["flags"]
    for gate in (2, 11):
        assert "unused" not in _cell(result, gate, "move")["flags"]
    assert result["min_gate"] == 2
    assert result["max_gate"] == 11
    assert result["profile"] == "ld2412"
    assert len(harness.services.writes()) == 2 * LD2412_GATES


async def test_calibrate_warns_gate_off_for_used_gates_only(harness, msr) -> None:
    """Only a used gate that is not LD2410 g0/g1 still is called out as off."""
    task = harness.start(msr)
    harness.feed.set_all(QUIET, QUIET, msr)
    harness.feed.set({(3, "move"): 92, (0, "still"): 97, (8, "still"): 97}, msr)
    await harness.advance(15)
    result = await finish_job(task)

    assert result["gates_off"] == [{"gate": 3, "channel": "move", "peak": 92}]
    assert "gate_off" in result["warnings"]
    assert "off" in _cell(result, 0, "still")["flags"]
    assert _cell(result, 8, "still")["flags"] == ["off", "unused"]


async def test_calibrate_rejects_non_numeric_thresholds_on_both_chips(
    harness, msr, rpro
) -> None:
    """A threshold without a value refuses the run on either chip."""
    for ids in (msr, rpro):
        harness.hass.states.async_set(ids.threshold(2, "move"), "unknown")
        err = await _reject(
            harness.hass,
            SERVICE_CALIBRATE_GATES,
            {"device_id": ids.device_id},
            "thresholds_not_numeric",
        )
        assert err.translation_placeholders == {
            "count": "1",
            "entity_ids": ids.threshold(2, "move"),
        }
    assert harness.services.calls == []


async def test_non_numeric_refusal_counts_the_values_and_logs_the_ids(
    harness, msr, caplog
) -> None:
    """A radar that never reported its thresholds gets one short sentence."""
    # A radar whose ESP has been up a long time reads unknown for every number
    # until its query params button is pressed.
    for entity_id in msr.thresholds():
        harness.hass.states.async_set(entity_id, "unknown")

    with caplog.at_level(logging.WARNING, logger=calibration.__name__):
        err = await _reject(
            harness.hass,
            SERVICE_CALIBRATE_GATES,
            {"device_id": msr.device_id},
            "thresholds_not_numeric",
        )

    message = str(err)
    assert message == "The radar has not reported 18 of its threshold values yet"
    assert "number." not in message
    assert err.translation_placeholders["count"] == str(2 * LD2410_GATES)
    assert msr.threshold(8, "still") in err.translation_placeholders["entity_ids"]
    logged = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any(
        msr.threshold(0, "move") in line and msr.threshold(8, "still") in line
        for line in logged
    )
    assert harness.services.calls == []


async def test_calibrate_kind_move_checks_every_ld2412_threshold(harness, rpro) -> None:
    """Every LD2412 write re-sends the still registers too, so they must be numeric."""
    harness.hass.states.async_set(rpro.threshold(5, "still"), "unknown")

    err = await _reject(
        harness.hass,
        SERVICE_CALIBRATE_GATES,
        {"device_id": rpro.device_id, "kind": "move"},
        "thresholds_not_numeric",
    )

    assert err.translation_placeholders == {
        "count": "1",
        "entity_ids": rpro.threshold(5, "still"),
    }
    assert harness.services.calls == []


async def test_calibrate_kind_move_checks_both_numbers_of_written_ld2410_gates(
    harness, msr, entity_registry
) -> None:
    """An LD2410 write sends its gate's pair, so only written gates need both."""
    harness.hass.states.async_set(msr.threshold(3, "still"), "unknown")

    err = await _reject(
        harness.hass,
        SERVICE_CALIBRATE_GATES,
        {"device_id": msr.device_id, "kind": "move"},
        "thresholds_not_numeric",
    )
    assert err.translation_placeholders == {
        "count": "1",
        "entity_ids": msr.threshold(3, "still"),
    }

    # With g3 move skipped (no energy sensor) nothing is sent for gate 3.
    entity_registry.async_remove(msr.energy(3, "move"))
    result = await harness.run(msr, kind="move", move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["outcome"] == "applied"
    written = {eid for eid, _ in harness.services.writes()}
    assert msr.threshold(3, "move") not in written
    assert len(written) == LD2410_GATES - 1


async def test_calibrate_ld2412_refreshes_before_capture_and_before_verify(
    harness, rpro
) -> None:
    """The query-params button is pressed before the snapshot and before verify."""
    writes_at_press: list[int] = []

    def _on_press() -> None:
        writes_at_press.append(len(harness.services.writes()))
        if len(writes_at_press) == 1:
            harness.hass.states.async_set(rpro.threshold(1, "move"), "37", {"min": 0})

    harness.services.on_press[rpro.query_params] = _on_press
    result = await harness.run(rpro, move=ALL_CHANGE, still=ALL_CHANGE)

    assert writes_at_press == [0, 2 * LD2412_GATES]
    assert [call[2] for call in harness.services.of("press")] == [rpro.query_params] * 2
    snapshot = _store(harness.hass).snapshot(rpro.device_id)
    assert snapshot["values"][rpro.threshold(1, "move")]["value"] == 37
    assert _cell(result, 1, "move")["old"] == 37
    assert result["outcome"] == "applied"


async def test_calibrate_ld2412_fails_when_refresh_leaves_a_threshold_non_numeric(
    harness, rpro, caplog
) -> None:
    """A value the chip could not report after the refresh stops the job."""
    harness.services.on_press[rpro.query_params] = lambda: (
        harness.hass.states.async_set(rpro.threshold(1, "move"), "unknown")
    )

    with caplog.at_level(logging.WARNING, logger=calibration.__name__):
        result = await harness.run(rpro, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["error"]["code"] == "thresholds_not_numeric"
    # Counted in the message the card shows, named in the log.
    assert result["error"]["message"] == (
        "The radar has not reported 1 of its threshold values. Nothing was changed."
    )
    assert rpro.threshold(1, "move") in caplog.text
    assert harness.services.writes() == []
    assert _store(harness.hass).snapshots_summary(rpro.device_id) == []


async def test_calibrate_ld2412_refresh_checks_the_channel_it_does_not_write(
    harness, rpro
) -> None:
    """After the refresh the unselected channel is re-checked, since it is sent."""
    harness.services.on_press[rpro.query_params] = lambda: (
        harness.hass.states.async_set(rpro.threshold(7, "still"), "unknown")
    )

    result = await harness.run(rpro, kind="move", move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["error"]["code"] == "thresholds_not_numeric"
    assert "1 of its threshold values" in result["error"]["message"]
    assert harness.services.writes() == []


async def test_calibrate_ld2412_refresh_change_is_counted_once(harness, rpro) -> None:
    """A value the refresh moved is written and never also counted unchanged."""
    # A peak of 30 proposes 40, the LD2412 factory value, so every move channel
    # is unchanged at compute time; the refresh then reports g3 move at 35.
    harness.services.on_press[rpro.query_params] = lambda: (
        None
        if harness.services.writes()
        else harness.hass.states.async_set(
            rpro.threshold(3, "move"), "35", {"min": 0, "max": 100, "step": 1}
        )
    )

    result = await harness.run(rpro, move=30, still=ALL_CHANGE)

    assert _cell(result, 3, "move")["old"] == 35
    assert _cell(result, 3, "move")["written"] is True
    assert result["changed"] == LD2412_GATES + 1
    assert result["unchanged"] == LD2412_GATES - 1
    assert result["changed"] + result["unchanged"] == 2 * LD2412_GATES


async def test_calibrate_refuses_while_background_correction_running(
    harness, rpro
) -> None:
    """An LD2412 mid background correction publishes no energies, so refuse."""
    harness.hass.states.async_set(rpro.bg_status, "on")

    await _reject(
        harness.hass,
        SERVICE_CALIBRATE_GATES,
        {"device_id": rpro.device_id},
        "background_correction_running",
    )


async def test_calibrate_rejects_zero_margins(harness, msr) -> None:
    """Both headrooms at 0 is refused; one of them at 0 is fine."""
    await _reject(
        harness.hass,
        SERVICE_CALIBRATE_GATES,
        {"device_id": msr.device_id, "margin": 0, "margin_pct": 0},
        "margin_zero",
    )

    result = await harness.run(msr, margin=0, margin_pct=25)

    assert result["outcome"] == "applied"
    assert result["margin"] == 0
    assert _cell(result, 0, "move")["new"] == 13


async def test_calibrate_dry_run_writes_nothing_and_takes_no_snapshot(
    harness, rpro
) -> None:
    """A preview computes and reports, but touches only the engineering switch."""
    result = await harness.run(rpro, apply=False)

    assert result["outcome"] == "preview"
    assert result["status"] == "done"
    assert _cell(result, 0, "move")["new"] == QUIET_NEW
    assert _cell(result, 0, "move")["written"] is False
    assert harness.services.writes() == []
    assert harness.services.of("press") == []
    assert _store(harness.hass).snapshots_summary(rpro.device_id) == []
    assert result["snapshot_id"] is None
    assert [call[1] for call in harness.services.calls] == ["turn_on", "turn_off"]
    assert result["changed"] == 2 * LD2412_GATES


async def test_result_records_apply_for_calibrations_only(harness, msr) -> None:
    """A result says whether it was a preview, so the card can name it one."""
    preview = await harness.run(msr, apply=False)
    applied = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    restored = await harness.restore(msr)

    assert preview["apply"] is False
    assert applied["apply"] is True
    assert restored["apply"] is None
    assert _store(harness.hass).last_result(msr.device_id)["apply"] is None


async def test_preview_stopped_by_unload_is_stored_as_a_preview(
    harness, msr, init_integration
) -> None:
    """The footer can say "Last preview ... was stopped" after a restart."""
    task = harness.start(msr, duration_s=60, apply=False)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(5)

    assert await harness.hass.config_entries.async_unload(init_integration.entry_id)
    await harness.hass.async_block_till_done()
    result = await finish_job(task)

    assert result["error"]["code"] == "cancelled_by_shutdown"
    assert result["writes_done"] == 0
    assert result["apply"] is False


async def test_calibrate_ld2410_never_presses_its_query_params_button(
    harness, msr
) -> None:
    """Only the LD2412 job refreshes; the MSR's button is there for the card."""
    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["outcome"] == "applied"
    assert harness.hass.states.get(msr.query_params) is not None
    assert harness.services.of("press") == []


async def test_calibrate_kind_move_only_leaves_still_untouched(harness, msr) -> None:
    """`kind: move` reports every still channel as not selected and never writes it."""
    result = await harness.run(msr, kind="move", move=ALL_CHANGE, still=ALL_CHANGE)

    written = {eid for eid, _ in harness.services.writes()}
    assert all(eid.endswith("_move_threshold") for eid in written)
    assert len(written) == LD2410_GATES
    for gate in range(LD2410_GATES):
        still = _cell(result, gate, "still")
        assert still["new"] is None
        assert still["skipped"] == "not selected"
        assert still["flags"] == ["skipped"]
        assert still["old"] == LD2410_FACTORY["still"][gate]
        assert still["entity_id"] == msr.threshold(gate, "still")
    assert result["changed"] + result["unchanged"] == LD2410_GATES
    assert result["kind_filter"] == "move"


# ---------------------------------------------------------- concurrency


async def test_calibrate_refuses_second_job_for_same_device(harness, msr) -> None:
    """One job per device."""
    task = harness.start(msr)
    harness.feed.set_all(QUIET, QUIET, msr)
    await _reject(
        harness.hass,
        SERVICE_CALIBRATE_GATES,
        {"device_id": msr.device_id},
        "calibration_running",
    )

    await harness.advance(15)
    result = await finish_job(task)
    assert result["outcome"] == "applied"


async def test_calibrate_allows_two_devices_concurrently(harness, msr, rpro) -> None:
    """Different radars calibrate side by side."""
    first = harness.start(msr)
    second = harness.start(rpro)
    harness.feed.set_all(QUIET, QUIET, msr)
    harness.feed.set_all(QUIET, QUIET, rpro)
    assert len(_jobs(harness.hass)) == 2
    await harness.advance(15)

    results = [await finish_job(first), await finish_job(second)]

    assert [result["outcome"] for result in results] == ["applied", "applied"]
    assert [result["profile"] for result in results] == ["ld2410", "ld2412"]
    assert _jobs(harness.hass) == {}


# ----------------------------------------------------------- pre-flight


async def test_calibrate_rejects_multi_device_target(harness, msr, rpro) -> None:
    """Calibration works on one radar at a time."""
    err = await _reject(
        harness.hass,
        SERVICE_CALIBRATE_GATES,
        {"device_id": [msr.device_id, rpro.device_id]},
        "multiple_devices",
    )
    assert err.translation_placeholders == {"count": "2"}


async def test_calibrate_rejects_unknown_device(harness) -> None:
    """A device id Home Assistant does not know is refused by name."""
    err = await _reject(
        harness.hass,
        SERVICE_CALIBRATE_GATES,
        {"device_id": "no-such-device"},
        "unknown_device",
    )
    assert err.translation_placeholders == {"device_id": "no-such-device"}


async def test_calibrate_rejects_device_without_gate_entities(
    harness, esphome_device
) -> None:
    """An LD2450-only device has nothing to calibrate."""
    await _reject(
        harness.hass,
        SERVICE_CALIBRATE_GATES,
        {"device_id": [esphome_device.id]},
        "no_gate_entities",
    )


async def test_calibrate_rejects_missing_engineering_switch(
    harness, msr, entity_registry
) -> None:
    """Without the switch the energies can never be read."""
    entity_registry.async_remove(msr.engineering)

    await _reject(
        harness.hass,
        SERVICE_CALIBRATE_GATES,
        {"device_id": msr.device_id},
        "engineering_mode_missing",
    )


async def test_calibrate_rejects_unavailable_device(harness, msr) -> None:
    """An unavailable switch or threshold means the writes would be no-ops."""
    harness.hass.states.async_set(msr.threshold(1, "still"), "unavailable")

    await _reject(
        harness.hass,
        SERVICE_CALIBRATE_GATES,
        {"device_id": msr.device_id},
        "device_offline",
    )


async def test_calibrate_rejects_device_with_no_state_object(harness, msr) -> None:
    """A registered threshold with no state yet looks like a connecting radar."""
    harness.hass.states.async_remove(msr.threshold(1, "move"))

    await _reject(
        harness.hass,
        SERVICE_CALIBRATE_GATES,
        {"device_id": msr.device_id},
        "device_offline",
    )


async def test_calibrate_rejects_read_only_user_in_preflight(
    harness, msr, hass_read_only_user
) -> None:
    """A user who may not control the switch is refused before any device call."""
    with pytest.raises(ServiceValidationError) as info:
        await harness.hass.services.async_call(
            DOMAIN,
            SERVICE_CALIBRATE_GATES,
            {"device_id": msr.device_id},
            blocking=True,
            context=Context(user_id=hass_read_only_user.id),
        )

    assert info.value.translation_key == "not_allowed"
    assert harness.services.calls == []


async def test_calibrate_fails_not_allowed_when_write_raises_unauthorized(
    harness, msr, caplog
) -> None:
    """An Unauthorized mid-run is a quiet warning, and the mode is still restored."""
    harness.services.unauthorized = {msr.threshold(0, "move")}

    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["error"]["code"] == "not_allowed"
    assert result["writes_done"] == 0
    assert len(harness.services.of("turn_off")) == 1
    records = [
        record
        for record in caplog.records
        if "may not control" in record.message and record.name.endswith("calibration")
    ]
    assert [record.levelname for record in records] == ["WARNING"]
    assert records[0].exc_info is None


async def test_calibrate_unauthorized_after_some_writes_keeps_the_count(
    harness, msr
) -> None:
    """A refusal on the third value keeps the two writes and the snapshot for Undo."""
    harness.services.unauthorized = {msr.thresholds()[2]}

    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["error"] == {
        "code": "not_allowed",
        "message": calibration.ERROR_MESSAGES["not_allowed"],
    }
    assert result["writes_done"] == 2
    assert result["writes_total"] == 18
    assert result["snapshot_id"] is not None
    assert [eid for eid, _ in harness.services.writes()] == msr.thresholds()[:2]
    assert len(harness.services.of("turn_off")) == 1


# --------------------------------------------------------------- cancel


async def test_cancel_during_settle_writes_nothing_and_restores_engineering_mode(
    harness, msr
) -> None:
    """A cancel in the countdown stops cleanly and turns the mode back off."""
    task = harness.start(msr, settle_s=15)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(3)
    assert await harness.cancel(msr) == {"cancelled": True}
    await harness.advance(1)
    result = await finish_job(task)

    assert result["status"] == "cancelled"
    assert result["outcome"] == "cancelled"
    assert harness.services.writes() == []
    assert len(harness.services.of("turn_off")) == 1
    assert result["snapshot_id"] is None


async def test_cancel_during_sampling_writes_nothing(harness, msr) -> None:
    """A cancel during the listen never reaches the writer."""
    task = harness.start(msr, duration_s=60)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(10)
    await harness.cancel(msr)
    await harness.advance(1)
    result = await finish_job(task)

    assert result["status"] == "cancelled"
    assert result["samples"] == 10
    assert harness.services.writes() == []
    assert _store(harness.hass).snapshots_summary(msr.device_id) == []


async def test_cancel_during_apply_stops_after_in_flight_write(harness, msr) -> None:
    """A cancel between writes lets the current write finish and keeps the count."""

    async def _on_set_value(index: int, _entity_id: str, _value: float) -> None:
        if index == 3:
            await harness.cancel(msr)

    harness.services.on_set_value = _on_set_value
    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert len(harness.services.writes()) == 3
    assert result["status"] == "cancelled"
    assert result["writes_done"] == 3
    assert result["writes_total"] == 18
    assert result["snapshot_id"] is not None
    assert result["changed"] == 3


async def test_cancel_without_job_is_a_noop(harness, msr, caplog) -> None:
    """A double tap must not throw."""
    caplog.set_level(
        logging.DEBUG, logger="custom_components.apollo_mmwave.calibration"
    )

    assert await harness.cancel(msr) == {"cancelled": False}

    assert "found no running job" in caplog.text


# ------------------------------------------------------------- presence


async def test_calibrate_reports_presence_warning(harness, msr) -> None:
    """The has-target sensor on for a third of the listen is worth a warning."""
    task = harness.start(msr, duration_s=60)
    harness.feed.set_all(QUIET, QUIET, msr)
    harness.hass.states.async_set(msr.radar_target, "on")
    await harness.advance(20)
    harness.hass.states.async_set(msr.radar_target, "off")
    await harness.advance(40)
    result = await finish_job(task)

    assert "presence" in result["warnings"]
    assert result["presence_fraction"] == pytest.approx(1 / 3)
    assert result["moving_fraction"] == 0


async def test_calibrate_reports_presence_warning_for_still_target_only(
    harness, msr
) -> None:
    """A person sitting still trips has-target but never the moving sensor."""
    task = harness.start(msr, duration_s=60)
    harness.feed.set_all(QUIET, QUIET, msr)
    harness.hass.states.async_set(msr.radar_target, "on")
    await harness.advance(30)
    harness.hass.states.async_set(msr.radar_target, "off")
    await harness.advance(30)
    result = await finish_job(task)

    assert "presence" in result["warnings"]
    assert result["presence_fraction"] == pytest.approx(0.5)
    assert result["moving_fraction"] == 0


async def test_calibrate_presence_fraction_null_without_radar_target_sensor(
    harness, msr, entity_registry
) -> None:
    """Without the sensor the fraction is null and no presence warning is possible."""
    entity_registry.async_remove(msr.radar_target)

    result = await harness.run(msr)

    assert result["presence_fraction"] is None
    assert "presence" not in result["warnings"]


# --------------------------------------------------------------- verify


async def test_calibrate_marks_unverified_writes_as_partial(harness, msr) -> None:
    """A radar that never echoes the values is reported, never claimed."""
    harness.services.echo_numbers = False

    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["outcome"] == "partial"
    assert result["status"] == "done"
    assert "unverified" in result["warnings"]
    assert [entry["entity_id"] for entry in result["unverified"]] == msr.thresholds()
    assert result["unverified"][0] == {
        "entity_id": msr.threshold(0, "move"),
        "asked": ALL_CHANGE_NEW,
        "actual": LD2410_FACTORY["move"][0],
    }
    assert _cell(result, 0, "move")["confirmed"] is False
    assert _cell(result, 0, "move")["actual"] == LD2410_FACTORY["move"][0]


async def test_calibrate_marks_offline_values_unverified_with_null_actual(
    harness, msr
) -> None:
    """Values that cannot be read back are `not confirmed`, with a null actual."""

    def _on_set_value(index: int, _entity_id: str, _value: float) -> None:
        if index == 18:
            harness.feed.unavailable(msr.thresholds())

    harness.services.on_set_value = _on_set_value
    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["outcome"] == "partial"
    assert len(result["unverified"]) == 18
    assert all(entry["actual"] is None for entry in result["unverified"])
    assert _cell(result, 4, "still")["actual"] is None
    assert _cell(result, 4, "still")["confirmed"] is False


async def test_calibrate_stops_when_device_goes_unavailable_during_apply(
    harness, msr
) -> None:
    """A radar dropping out mid-apply stops the writer and keeps Undo possible."""

    def _on_set_value(index: int, _entity_id: str, _value: float) -> None:
        if index == 4:
            harness.feed.unavailable(msr.thresholds())

    harness.services.on_set_value = _on_set_value
    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["status"] == "failed"
    assert result["error"]["code"] == "device_offline"
    assert "4 of 18" in result["error"]["message"]
    assert "Use Undo" in result["error"]["message"]
    assert result["writes_done"] == 4
    assert result["snapshot_id"] is not None
    assert len(harness.services.writes()) == 4


async def test_calibrate_offline_before_the_first_write_says_nothing_was_changed(
    harness, msr, monkeypatch
) -> None:
    """With 0 values written the message drops the Undo clause and says so."""
    harness.hass.states.async_set(msr.engineering, "on")
    save = CalibrationStore.async_save

    async def _save_then_drop(self) -> None:
        await save(self)
        harness.feed.unavailable(msr.thresholds())

    monkeypatch.setattr(CalibrationStore, "async_save", _save_then_drop)
    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["error"] == {
        "code": "device_offline",
        "message": (
            "The radar went offline before any value was written. Nothing was changed."
        ),
    }
    assert result["writes_done"] == 0
    assert harness.services.writes() == []


async def test_calibrate_echo_compares_numerically_with_tolerance(harness, msr) -> None:
    """A `35.0` echo confirms a write of 35 (a peak of 25 plus 10 headroom)."""
    harness.hass.states.async_set(
        msr.threshold(2, "move"), "40", {"min": 0, "max": 100}
    )
    task = harness.start(msr)
    harness.feed.set_all(QUIET, QUIET, msr)
    harness.feed.set({(2, "move"): 25}, msr)
    await harness.advance(15)
    result = await finish_job(task)

    assert harness.hass.states.get(msr.threshold(2, "move")).state == "35.0"
    assert _cell(result, 2, "move")["new"] == 35
    assert _cell(result, 2, "move")["confirmed"] is True
    assert _cell(result, 2, "move")["actual"] == 35
    assert result["outcome"] == "applied"
    assert result["unverified"] == []


async def test_calibrate_write_error_fails_with_count(harness, msr) -> None:
    """An error from the number entity stops the writer with the count so far."""
    harness.services.raise_on = {msr.threshold(2, "still")}

    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["error"]["code"] == "write_failed"
    assert result["writes_done"] == 5
    assert "5 of 18" in result["error"]["message"]
    assert msr.threshold(2, "still") in result["error"]["message"]
    assert "Use Undo" in result["error"]["message"]
    assert result["snapshot_id"] is not None


async def test_calibrate_write_error_on_the_first_value_says_nothing_was_changed(
    harness, msr
) -> None:
    """A refusal on the first value has nothing for Undo to put back."""
    first = msr.threshold(0, "move")
    harness.services.raise_on = {first}

    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["error"] == {
        "code": "write_failed",
        "message": (
            f"Writing failed on the first value ({first} raised an error)."
            " Nothing was changed."
        ),
    }
    assert "Use Undo" not in result["error"]["message"]
    assert result["writes_done"] == 0
    assert harness.services.writes() == []


# ------------------------------------------------------------- responses


async def test_calibrate_returns_response_when_waiting(harness, msr) -> None:
    """`wait: true` returns the full result."""
    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["kind"] == "calibrate"
    assert result["status"] == "done"
    assert len(result["gates"]) == LD2410_GATES
    assert result["snapshot_id"] == _store(harness.hass).snapshot(msr.device_id)["id"]
    assert result["changed"] == 18
    assert result["writes_done"] == result["writes_total"] == 18
    assert result["duration_s"] == 15
    assert result["settle_s"] == 0
    assert result["finished_at"] is not None
    assert _store(harness.hass).last_result(msr.device_id) == result


async def test_calibrate_returns_started_state_without_wait(harness, msr) -> None:
    """Without `wait` the call returns as soon as the job is running."""
    response = await harness.hass.services.async_call(
        DOMAIN,
        SERVICE_CALIBRATE_GATES,
        {"device_id": msr.device_id, "settle_s": 0, "duration_s": 15},
        blocking=True,
        return_response=True,
    )

    assert response["status"] == "preparing"
    assert response["job_id"] == harness.job(msr).job_id
    assert response["apply"] is True
    assert response["cancel_requested"] is False

    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(15)
    await settle(50)
    assert harness.job(msr) is None


async def test_calibrate_fires_started_and_finished_events(harness, msr) -> None:
    """Both bus events identify the radar and the job."""
    started: list[dict] = []
    finished: list[dict] = []
    harness.hass.bus.async_listen(
        EVENT_CALIBRATION_STARTED, lambda e: started.append(e.data)
    )
    harness.hass.bus.async_listen(
        EVENT_CALIBRATION_FINISHED, lambda e: finished.append(e.data)
    )

    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert started == [
        {"device_id": msr.device_id, "job_id": result["job_id"], "kind": "calibrate"}
    ]
    assert finished == [
        {
            "device_id": msr.device_id,
            "job_id": result["job_id"],
            "kind": "calibrate",
            "status": "done",
            "outcome": "applied",
            "changed": 18,
            "snapshot_id": result["snapshot_id"],
        }
    ]


async def test_calibrate_survives_caller_cancellation(harness, msr) -> None:
    """Cancelling the waiting service call does not cancel the job."""
    task = harness.start(msr)
    harness.feed.set_all(ALL_CHANGE, ALL_CHANGE, msr)
    await harness.advance(2)
    task.cancel()
    await settle()
    assert task.cancelled()
    await harness.advance(13)
    await settle(50)

    assert harness.job(msr) is None
    assert len(harness.services.writes()) == 18
    assert _store(harness.hass).last_result(msr.device_id)["outcome"] == "applied"


async def test_calibrate_pushes_progress_once_per_tick(harness, msr) -> None:
    """Ten sampling ticks are ten pushes, no more."""
    task = harness.start(msr, duration_s=60)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(1)
    pushes: list[str] = []
    unsub = async_dispatcher_connect(
        harness.hass, SIGNAL_CALIBRATION_UPDATED, pushes.append
    )
    await harness.advance(10)
    unsub()

    assert pushes == [msr.device_id] * 10

    await harness.cancel(msr)
    await harness.advance(1)
    await finish_job(task)


def _record_job_pushes(hass, ids: RadarIds) -> list[dict[str, Any]]:
    """Collect the job's public state at every push for one radar."""
    states: list[dict[str, Any]] = []

    @callback
    def _on_push(device_id: str) -> None:
        job = _jobs(hass).get(device_id)
        if device_id == ids.device_id and job is not None:
            states.append(job.public_state())

    async_dispatcher_connect(hass, SIGNAL_CALIBRATION_UPDATED, _on_push)
    return states


async def test_calibrate_first_applying_push_carries_the_plan(harness, msr) -> None:
    """The card never sees "0 of 0", and remaining_s is null after the listen."""
    states = _record_job_pushes(harness.hass, msr)

    await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    applying = [state for state in states if state["status"] == "applying"]
    assert applying[0]["writes_total"] == 18
    assert applying[0]["writes_done"] == 0
    assert all(state["writes_total"] == 18 for state in applying)
    after_listen = [
        state for state in states if state["status"] in ("applying", "verifying")
    ]
    assert after_listen
    assert all(state["remaining_s"] is None for state in after_listen)
    sampling = [state for state in states if state["status"] == "sampling"]
    assert sampling[-1]["remaining_s"] == 0


async def test_calibrate_ld2412_pushes_refresh_then_the_plan(harness, rpro) -> None:
    """An LD2412 shows its refresh first, then the full write count."""
    states = _record_job_pushes(harness.hass, rpro)

    await harness.run(rpro, move=ALL_CHANGE, still=ALL_CHANGE)

    applying = [state for state in states if state["status"] == "applying"]
    assert applying[0]["sub_phase"] == "refresh"
    assert applying[0]["remaining_s"] is None
    writing = [state for state in applying if state["sub_phase"] is None]
    assert writing[0]["writes_total"] == 2 * LD2412_GATES


async def test_restore_first_applying_push_carries_the_plan(harness, msr) -> None:
    """A restore's first applying push already knows how many values it writes."""
    await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    states = _record_job_pushes(harness.hass, msr)

    await harness.restore(msr)

    applying = [state for state in states if state["status"] == "applying"]
    assert applying[0]["writes_total"] == 18
    assert all(state["remaining_s"] is None for state in states)


async def test_calibrate_uses_caller_context(harness, msr) -> None:
    """Every device write carries the service call's context."""
    context = Context()
    task = harness.start(msr, context=context)
    harness.feed.set_all(ALL_CHANGE, ALL_CHANGE, msr)
    await harness.advance(15)
    await finish_job(task)

    assert len(harness.services.calls) == 20
    assert {call[4] for call in harness.services.calls} == {context.id}


# ---------------------------------------------------------------- marker


async def test_interrupted_marker_set_and_cleared(harness, msr, hass_storage) -> None:
    """The marker is on disk before the switch write and gone after the finish."""
    seen: dict[str, Any] = {}

    def _marker() -> dict | None:
        data = hass_storage.get(CALIBRATION_STORAGE_KEY, {}).get("data", {})
        return data.get("devices", {}).get(msr.device_id, {}).get("interrupted")

    def _on_call(domain: str, service: str, _entity_id: str) -> None:
        key = f"{domain}.{service}"
        if key not in seen:
            seen[key] = _marker()

    harness.services.on_call = _on_call
    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert seen["switch.turn_on"]["phase"] == "engineering"
    assert seen["switch.turn_on"]["left_on"] is False
    assert seen["switch.turn_on"]["job_id"] == result["job_id"]
    assert seen["number.set_value"]["phase"] == "applying"
    assert seen["number.set_value"]["snapshot_id"] == result["snapshot_id"]
    assert _store(harness.hass).interrupted(msr.device_id) is None
    await harness.advance(3)
    assert _marker() is None


async def test_interrupted_marker_kept_with_left_on_when_turn_off_does_not_echo(
    harness, msr
) -> None:
    """A turn_off the radar never acknowledged leaves a marker with left_on."""

    def _on_set_value(index: int, _entity_id: str, _value: float) -> None:
        if index == 1:
            harness.services.echo_switch = False

    harness.services.on_set_value = _on_set_value
    result = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    assert result["outcome"] == "applied"
    assert len(harness.services.of("turn_off")) == 1
    marker = _store(harness.hass).interrupted(msr.device_id)
    assert marker["left_on"] is True
    # The job finished on its own, so its write phase is gone; what remains is
    # the engineering fact the banner needs for "Turn it off".
    assert marker["phase"] == "engineering"
    assert marker["job_id"] == result["job_id"]


# ------------------------------------------------------------- lifecycle


async def test_unload_cancels_running_job_and_restores_engineering_mode(
    harness, msr, init_integration
) -> None:
    """Unloading mid-listen fails the job, restores the mode and removes everything."""
    task = harness.start(msr, duration_s=60)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(5)
    job = harness.job(msr)

    assert await harness.hass.config_entries.async_unload(init_integration.entry_id)
    await harness.hass.async_block_till_done()
    result = await finish_job(task)

    assert job.status == "failed"
    assert result["error"]["code"] == "cancelled_by_shutdown"
    assert len(harness.services.of("turn_off")) == 1
    assert harness.services.writes() == []
    for service in (
        SERVICE_CALIBRATE_GATES,
        SERVICE_CANCEL_CALIBRATION,
        SERVICE_RESTORE_GATE_THRESHOLDS,
    ):
        assert not harness.hass.services.has_service(DOMAIN, service)
    assert DATA_CALIBRATION_STORE not in harness.hass.data[DOMAIN]
    assert DATA_CALIBRATION_JOBS not in harness.hass.data[DOMAIN]
    assert job.result["status"] == "failed"
    assert harness.hass.states.get(msr.engineering).state == "off"


async def test_unload_with_running_job_leaves_no_pending_store_write(
    harness, msr, init_integration, hass_storage
) -> None:
    """A result persisted during the unload cannot resurrect a removed store."""
    task = harness.start(msr, duration_s=60)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(5)

    assert await harness.hass.config_entries.async_unload(init_integration.entry_id)
    await harness.hass.async_block_till_done()
    await finish_job(task)
    assert (
        hass_storage[CALIBRATION_STORAGE_KEY]["data"]["devices"][msr.device_id][
            "last_result"
        ]["error"]["code"]
        == "cancelled_by_shutdown"
    )
    await harness.hass.config_entries.async_remove(init_integration.entry_id)
    await harness.hass.async_block_till_done()

    assert CALIBRATION_STORAGE_KEY not in hass_storage
    await harness.advance(5)
    assert CALIBRATION_STORAGE_KEY not in hass_storage


async def test_unload_twice_does_not_stack_stop_listeners(
    harness, msr, init_integration
) -> None:
    """A reload leaves one stop listener, and a stop cancels the job once."""
    hass = harness.hass
    listeners_after_first_setup = hass.bus.async_listeners()[EVENT_HOMEASSISTANT_STOP]
    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()
    assert hass.bus.async_listeners().get(EVENT_HOMEASSISTANT_STOP, 0) == (
        listeners_after_first_setup - 1
    )
    assert await hass.config_entries.async_setup(init_integration.entry_id)
    await hass.async_block_till_done()
    assert (
        hass.bus.async_listeners()[EVENT_HOMEASSISTANT_STOP]
        == listeners_after_first_setup
    )

    task = harness.start(msr, duration_s=60)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(5)
    hass.bus.async_fire(EVENT_HOMEASSISTANT_STOP)
    await harness.advance(1)
    result = await finish_job(task)

    assert result["error"]["code"] == "cancelled_by_shutdown"
    assert len(harness.services.of("turn_off")) == 1


async def test_hass_stop_cancels_running_job(harness, msr) -> None:
    """The stop event ends the job; an unacknowledged turn_off leaves left_on."""
    task = harness.start(msr, duration_s=60)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(5)
    harness.services.echo_switch = False
    harness.hass.bus.async_fire(EVENT_HOMEASSISTANT_STOP)
    await harness.advance(1)
    result = await finish_job(task)

    assert result["status"] == "failed"
    assert result["error"]["code"] == "cancelled_by_shutdown"
    assert len(harness.services.of("turn_off")) == 1
    marker = _store(harness.hass).interrupted(msr.device_id)
    assert marker["phase"] == "engineering"
    assert marker["left_on"] is True


async def test_calls_during_the_unload_wait_are_refused(
    harness, msr, rpro, init_integration
) -> None:
    """A job started while the teardown waits would outlive the unload."""
    hass = harness.hass
    release = asyncio.Event()

    async def _slow_turn_off(call) -> None:
        await release.wait()
        for entity_id in call.data["entity_id"]:
            hass.states.async_set(entity_id, "off")

    task = harness.start(msr, duration_s=60)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(3)
    hass.services.async_register("switch", "turn_off", _slow_turn_off)
    unload = hass.async_create_task(
        hass.config_entries.async_unload(init_integration.entry_id)
    )
    await settle(20)
    assert not unload.done()
    assert hass.services.has_service(DOMAIN, SERVICE_CALIBRATE_GATES)

    for service in (SERVICE_CALIBRATE_GATES, SERVICE_RESTORE_GATE_THRESHOLDS):
        with pytest.raises(HomeAssistantError, match="not loaded"):
            await hass.services.async_call(
                DOMAIN, service, {"device_id": rpro.device_id}, blocking=True
            )
    # A cancel is still a harmless no-op-or-ack, never an error.
    assert await harness.cancel(msr) == {"cancelled": True}

    release.set()
    assert await unload
    result = await finish_job(task)

    assert result["error"]["code"] == "cancelled_by_shutdown"
    assert [call for call in harness.services.calls if rpro.base in call[2]] == []
    assert not [key for key in hass.data[DOMAIN] if key.startswith("calibration")]


async def test_calls_while_home_assistant_is_stopping_are_refused(harness, msr) -> None:
    """HA has already cancelled every background task, so nothing may start."""
    hass = harness.hass
    hass.set_state(CoreState.stopping)
    try:
        with pytest.raises(HomeAssistantError, match="is stopping"):
            await hass.services.async_call(
                DOMAIN,
                SERVICE_CALIBRATE_GATES,
                {"device_id": msr.device_id},
                blocking=True,
            )
    finally:
        hass.set_state(CoreState.running)

    assert harness.services.calls == []
    assert _jobs(hass) == {}


# -------------------------------------------------------------- restore


async def test_restore_writes_snapshot_values_and_takes_redo_snapshot(
    harness, msr
) -> None:
    """Undo writes the saved values back and saves the current ones first."""
    await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    harness.services.calls.clear()

    result = await harness.restore(msr)

    assert result["kind"] == "restore"
    assert result["outcome"] == "restored"
    assert result["status"] == "done"
    assert harness.services.writes() == [
        (msr.threshold(gate, channel), float(LD2410_FACTORY[channel][gate]))
        for gate in range(LD2410_GATES)
        for channel in ("move", "still")
    ]
    assert result["restored"] == 18
    assert result["unchanged"] == 0
    assert result["missing"] == []
    assert result["unverified"] == []
    summary = _store(harness.hass).snapshots_summary(msr.device_id)
    assert [item["reason"] for item in summary] == ["restore", "calibrate"]
    assert result["snapshot_id"] == summary[0]["id"]
    assert result["restored_from"] == {
        "id": summary[1]["id"],
        "taken_at": summary[1]["taken_at"],
    }
    assert (
        _store(harness.hass).snapshot(msr.device_id)["values"][
            msr.threshold(0, "move")
        ]["value"]
        == ALL_CHANGE_NEW
    )


async def test_restore_resolves_renamed_entity_by_unique_id(
    harness, msr, entity_registry
) -> None:
    """A renamed threshold is found again through its unique id."""
    await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    old_id = msr.threshold(3, "move")
    new_id = "number.kitchen_radar_g3_move_threshold"
    entity_registry.async_update_entity(old_id, new_entity_id=new_id)
    harness.hass.states.async_remove(old_id)
    harness.hass.states.async_set(new_id, str(ALL_CHANGE_NEW), {"min": 0, "max": 100})
    harness.services.calls.clear()

    result = await harness.restore(msr)

    assert result["missing"] == []
    writes = dict(harness.services.writes())
    assert writes[new_id] == LD2410_FACTORY["move"][3]
    assert old_id not in writes


async def test_restore_skips_missing_entities_and_reports_them(
    harness, msr, entity_registry
) -> None:
    """A threshold that left the registry is listed, not written."""
    await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    gone = msr.threshold(3, "move")
    entity_registry.async_remove(gone)
    harness.hass.states.async_remove(gone)
    harness.services.calls.clear()

    result = await harness.restore(msr)

    assert result["missing"] == [gone]
    assert result["restored"] == 17
    assert gone not in dict(harness.services.writes())


async def test_restore_reports_disabled_entities_as_missing(
    harness, msr, entity_registry
) -> None:
    """A disabled threshold has no state, so it is listed rather than refusing all."""
    await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    disabled = msr.threshold(4, "move")
    entity_registry.async_update_entity(
        disabled, disabled_by=RegistryEntryDisabler.USER
    )
    harness.hass.states.async_remove(disabled)
    harness.services.calls.clear()

    result = await harness.restore(msr)

    assert result["outcome"] == "restored"
    assert result["missing"] == [disabled]
    assert result["restored"] == 17
    assert disabled not in dict(harness.services.writes())


async def test_restore_takes_no_redo_snapshot_when_nothing_differs(
    harness, msr
) -> None:
    """Restoring values the radar already holds writes nothing and saves nothing."""
    first = await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    await harness.restore(msr)
    before = _store(harness.hass).snapshots_summary(msr.device_id)
    harness.services.calls.clear()

    result = await harness.restore(msr, snapshot_id=first["snapshot_id"])

    assert result["outcome"] == "restored"
    assert result["restored"] == 0
    assert result["unchanged"] == 18
    assert result["snapshot_id"] is None
    assert result["restored_from"]["id"] == first["snapshot_id"]
    assert harness.services.writes() == []
    assert _store(harness.hass).snapshots_summary(msr.device_id) == before


async def test_restore_ld2412_checks_thresholds_outside_the_snapshot(
    harness, rpro
) -> None:
    """A move-only snapshot still re-sends every still register on the LD2412."""
    await harness.run(rpro, kind="move", move=ALL_CHANGE, still=ALL_CHANGE)
    assert _store(harness.hass).snapshots_summary(rpro.device_id)[0]["count"] == (
        LD2412_GATES
    )
    harness.hass.states.async_set(rpro.threshold(2, "still"), "unknown")

    err = await _reject(
        harness.hass,
        SERVICE_RESTORE_GATE_THRESHOLDS,
        {"device_id": rpro.device_id},
        "thresholds_not_numeric",
    )

    assert err.translation_placeholders == {
        "count": "1",
        "entity_ids": rpro.threshold(2, "still"),
    }


async def test_restore_with_unknown_snapshot_id_raises(harness, msr) -> None:
    """A snapshot id nobody saved is refused."""
    await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)

    await _reject(
        harness.hass,
        SERVICE_RESTORE_GATE_THRESHOLDS,
        {"device_id": msr.device_id, "snapshot_id": "nope"},
        "no_snapshot",
    )


async def test_restore_without_any_snapshot_raises(harness, msr) -> None:
    """Nothing saved yet means nothing to restore."""
    await _reject(
        harness.hass,
        SERVICE_RESTORE_GATE_THRESHOLDS,
        {"device_id": msr.device_id},
        "no_snapshot",
    )


async def test_restore_refused_while_job_running(harness, msr) -> None:
    """Calibrate and restore share the one slot per device."""
    await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    task = harness.start(msr, duration_s=60)
    harness.feed.set_all(QUIET, QUIET, msr)
    await harness.advance(2)

    await _reject(
        harness.hass,
        SERVICE_RESTORE_GATE_THRESHOLDS,
        {"device_id": msr.device_id},
        "calibration_running",
    )

    await harness.cancel(msr)
    await harness.advance(1)
    await finish_job(task)


async def test_restore_refuses_when_device_offline(harness, msr) -> None:
    """A restore needs the radar online as much as a calibration does."""
    await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    harness.feed.unavailable([msr.threshold(2, "still")])

    await _reject(
        harness.hass,
        SERVICE_RESTORE_GATE_THRESHOLDS,
        {"device_id": msr.device_id},
        "device_offline",
    )


async def test_restore_ld2412_refuses_non_numeric_thresholds(harness, rpro) -> None:
    """The LD2412 re-sends every register, so every number must have a value."""
    await harness.run(rpro, move=ALL_CHANGE, still=ALL_CHANGE)
    harness.hass.states.async_set(rpro.threshold(7, "still"), "unknown")

    await _reject(
        harness.hass,
        SERVICE_RESTORE_GATE_THRESHOLDS,
        {"device_id": rpro.device_id},
        "thresholds_not_numeric",
    )


async def test_restore_refuses_while_background_correction_running(
    harness, rpro
) -> None:
    """A background correction in progress blocks a restore too."""
    await harness.run(rpro, move=ALL_CHANGE, still=ALL_CHANGE)
    harness.hass.states.async_set(rpro.bg_status, "on")

    await _reject(
        harness.hass,
        SERVICE_RESTORE_GATE_THRESHOLDS,
        {"device_id": rpro.device_id},
        "background_correction_running",
    )


async def test_restore_ld2412_presses_query_params_before_redo_snapshot_and_before_verify(  # noqa: E501 - the spec's test name
    harness, rpro
) -> None:
    """The restore refreshes before its own snapshot and again before verifying."""
    await harness.run(rpro, move=ALL_CHANGE, still=ALL_CHANGE)
    harness.services.calls.clear()
    writes_at_press: list[int] = []
    harness.services.on_press[rpro.query_params] = lambda: writes_at_press.append(
        len(harness.services.writes())
    )

    result = await harness.restore(rpro)

    assert result["outcome"] == "restored"
    assert writes_at_press == [0, 2 * LD2412_GATES]
    assert len(harness.services.of("press")) == 2


async def test_restore_never_touches_engineering_mode(harness, msr) -> None:
    """A restore writes numbers only."""
    await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    harness.services.calls.clear()

    result = await harness.restore(msr)

    assert result["outcome"] == "restored"
    assert [call for call in harness.services.calls if call[0] == "switch"] == []
    assert result["engineering_mode_turned_on"] is False


async def test_restore_keeps_an_engineering_marker_while_the_switch_is_on(
    harness, msr
) -> None:
    """Undo after a crash must not hide the Turn-it-off banner."""
    store = _store(harness.hass)
    await harness.run(msr, move=ALL_CHANGE, still=ALL_CHANGE)
    store.set_interrupted(
        msr.device_id,
        {
            "job_id": "crashed",
            "kind": "calibrate",
            "phase": "applying",
            "left_on": False,
        },
    )
    harness.hass.states.async_set(msr.engineering, "on")

    result = await harness.restore(msr)

    assert result["outcome"] == "restored"
    marker = store.interrupted(msr.device_id)
    # The restore's own marker inherits the crashed job's engineering fact.
    assert marker["job_id"] == result["job_id"]
    assert marker["engineering_mode_turned_on"] is True
    assert marker["phase"] == "engineering"
    assert marker["left_on"] is False

    harness.hass.states.async_set(msr.engineering, "off")
    await harness.restore(msr)
    assert store.interrupted(msr.device_id) is None


async def test_setup_integration_registers_services(hass, config_entry, msr) -> None:
    """A bare setup (no fake services) still registers the three services."""
    await setup_integration(hass, config_entry)

    for service in (
        SERVICE_CALIBRATE_GATES,
        SERVICE_CANCEL_CALIBRATION,
        SERVICE_RESTORE_GATE_THRESHOLDS,
    ):
        assert hass.services.has_service(DOMAIN, service)
    assert (
        hass.services.supports_response(DOMAIN, SERVICE_CALIBRATE_GATES) == "optional"
    )
    _ = msr
