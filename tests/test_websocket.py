"""Websocket API the zone and calibrate cards read their state through."""

from __future__ import annotations

import logging

import pytest
from homeassistant.helpers.dispatcher import DATA_DISPATCHER, async_dispatcher_send

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import (
    DATA_CALIBRATION_JOBS,
    DATA_CALIBRATION_STORE,
    DATA_STORE,
    DOMAIN,
    SIGNAL_CALIBRATION_UPDATED,
    SIGNAL_ZONES_UPDATED,
    STORE_LABEL,
    STORE_ZONES,
)

from .conftest import RADAR_TARGET_COUNT, RadarIds, finish_job, radar_ids

GET = "apollo_mmwave/zones/get"
SUBSCRIBE = "apollo_mmwave/zones/subscribe"

RECT_CALL = {
    "zone_id": 1,
    "shape": "rect",
    "data": {"x_min": 0, "x_max": 10, "y_min": 0, "y_max": 10},
}


def _forwarder_count(hass) -> int:
    """Count the dispatcher targets live zone subscriptions own."""
    # Both entity platforms listen on the same signal, so counting the whole
    # target list would not show a leaked subscription. Only this module's
    # closures are counted.
    targets = hass.data.get(DATA_DISPATCHER, {}).get(SIGNAL_ZONES_UPDATED, {})
    return sum(
        1
        for target in targets
        if getattr(target, "__module__", "").endswith("apollo_mmwave.websocket")
    )


async def test_zones_get_returns_stored_zones_and_suggested_pairs(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """A device with nothing drawn still reports the radar's own targets."""
    _ = init_integration
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})

    result = (await client.receive_json())["result"]
    assert result["zones"] == {}
    assert result["suggested_entities"] == [
        {
            "x": f"sensor.r_pro_ld2450_target_{target}_x",
            "y": f"sensor.r_pro_ld2450_target_{target}_y",
        }
        for target in range(1, RADAR_TARGET_COUNT + 1)
    ]


async def test_zones_get_returns_zone_ids_as_strings(
    hass, hass_ws_client, setup_entry_with_zone
) -> None:
    """Zone ids are ints in the store and have to be strings in JSON."""
    device_id, _ = setup_entry_with_zone
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})

    zones = (await client.receive_json())["result"]["zones"]
    assert list(zones) == ["1"]
    assert zones["1"]["shape"] == "rect"


async def test_zones_get_reports_never_configured_entities_as_null(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Never configured has to stay distinguishable from deliberately empty."""
    _ = init_integration
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})

    result = (await client.receive_json())["result"]
    assert result["entities"] is None
    assert result["rotation_deg"] is None
    assert result["label"] is None


async def test_zones_get_reports_cleared_entities_as_an_empty_list(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Clearing the list means track nothing, not fall back to the radar."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {"device_id": device_id, "clear_entities": True},
        blocking=True,
    )
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})

    result = (await client.receive_json())["result"]
    assert result["entities"] == []
    # The suggestion still travels: the card offers it, the user chose against it.
    assert len(result["suggested_entities"]) == RADAR_TARGET_COUNT


async def test_zones_get_does_not_create_a_store_entry(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Reading a device's configuration must not write one."""
    _ = init_integration
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})
    assert (await client.receive_json())["success"] is True

    assert get_store(hass).devices == {}


async def test_zones_get_rejects_an_unknown_device(
    hass, hass_ws_client, init_integration
) -> None:
    """A device id Home Assistant does not know is an error, not a blank card."""
    _ = init_integration
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": "no-such-device"})

    message = await client.receive_json()
    assert message["success"] is False
    assert message["error"]["code"] == "not_found"
    assert get_store(hass).devices == {}


async def test_zones_get_reports_the_integration_unloaded(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """The commands outlive the config entry, so they answer without the store."""
    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})

    message = await client.receive_json()
    assert message["success"] is False
    assert message["error"]["code"] == "not_loaded"


async def test_zones_subscribe_pushes_on_change(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Every zone change reaches a subscribed card."""
    _ = init_integration
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    assert (await client.receive_json())["success"] is True

    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, **RECT_CALL}, blocking=True
    )

    message = await client.receive_json()
    assert message["event"]["zones"]["1"]["shape"] == "rect"


async def test_zones_subscribe_ignores_other_devices(
    hass, hass_ws_client, init_integration, device_id, device_registry
) -> None:
    """A card only hears about the radar it is showing."""
    other = device_registry.async_get_or_create(
        config_entry_id=init_integration.entry_id,
        identifiers={("esphome", "some_other_radar")},
        name="Other radar",
    )
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": other.id})
    assert (await client.receive_json())["success"] is True

    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, **RECT_CALL}, blocking=True
    )

    await client.send_json_auto_id({"type": "ping"})
    assert (await client.receive_json())["type"] == "pong"


async def test_zones_subscribe_rejects_an_unknown_device(
    hass, hass_ws_client, init_integration
) -> None:
    """A rejected subscription leaves no dispatcher connection behind."""
    _ = init_integration
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": "no-such-device"})

    message = await client.receive_json()
    assert message["success"] is False
    assert message["error"]["code"] == "not_found"
    assert _forwarder_count(hass) == 0
    assert get_store(hass).devices == {}


async def test_zones_subscribe_stops_on_unsubscribe(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Unsubscribing drops the dispatcher connection and the pushes with it."""
    _ = init_integration
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    subscription = (await client.receive_json())["id"]
    assert _forwarder_count(hass) == 1

    await client.send_json_auto_id(
        {"type": "unsubscribe_events", "subscription": subscription}
    )
    assert (await client.receive_json())["success"] is True
    assert _forwarder_count(hass) == 0

    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, **RECT_CALL}, blocking=True
    )

    # A pong arriving next proves no event was queued ahead of it.
    await client.send_json_auto_id({"type": "ping"})
    assert (await client.receive_json())["type"] == "pong"


async def test_zones_subscribe_is_torn_down_when_the_entry_unloads(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Unloading the entry drops live subscriptions, and unsubscribing after is safe."""
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    subscription = (await client.receive_json())["id"]
    assert _forwarder_count(hass) == 1

    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()
    assert _forwarder_count(hass) == 0

    # The client has no way to know the entry went away, so its unsubscribe still
    # arrives and must not tear the same connection down twice.
    await client.send_json_auto_id(
        {"type": "unsubscribe_events", "subscription": subscription}
    )
    assert (await client.receive_json())["success"] is True


async def test_zone_commands_survive_a_reload(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Registration runs again on every setup, so it has to be idempotent."""
    await hass.config_entries.async_reload(init_integration.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    assert (await client.receive_json())["success"] is True

    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, **RECT_CALL}, blocking=True
    )

    message = await client.receive_json()
    assert message["event"]["zones"]["1"]["shape"] == "rect"
    assert get_store(hass).device(device_id)[STORE_ZONES][1]["shape"] == "rect"


async def test_one_zone_edit_pushes_exactly_once(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Our own zone entities landing in the registry are not a second change."""
    _ = init_integration
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    assert (await client.receive_json())["success"] is True

    # The first zone creates both of its entities on the radar device.
    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, **RECT_CALL}, blocking=True
    )
    await hass.async_block_till_done()
    created = await _drain(client)
    assert len(created) == 1
    assert created[0]["zones"]["1"]["shape"] == "rect"

    # A rename rewrites both entities' registry names.
    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {"device_id": device_id, "zone_id": 1, "name": "Couch"},
        blocking=True,
    )
    await hass.async_block_till_done()
    renamed = await _drain(client)
    assert len(renamed) == 1
    assert renamed[0]["zones"]["1"]["name"] == "Couch"


async def test_non_admin_users_can_read_and_subscribe(
    hass, hass_ws_client, hass_read_only_access_token, init_integration, device_id
) -> None:
    """The dashboard is not admin-only, so neither are the commands its card needs."""
    _ = init_integration
    token = hass.auth.async_validate_access_token(hass_read_only_access_token)
    assert not token.user.is_admin
    client = await hass_ws_client(hass, hass_read_only_access_token)

    await client.send_json_auto_id({"type": GET, "device_id": device_id})
    assert (await client.receive_json())["success"] is True

    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    assert (await client.receive_json())["success"] is True
    assert _forwarder_count(hass) == 1


async def test_zones_get_reports_input_units_rotation_and_label(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Stored units, rotation and label reach the client, not only their nulls."""
    _ = init_integration
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": GET, "device_id": device_id})
    assert (await client.receive_json())["result"]["input_units"] is None

    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {"device_id": device_id, "input_units": "ft", "rotation_deg": 45},
        blocking=True,
    )
    get_store(hass).device(device_id)[STORE_LABEL] = "Office"

    await client.send_json_auto_id({"type": GET, "device_id": device_id})
    result = (await client.receive_json())["result"]
    assert result["input_units"] == "ft"
    assert result["rotation_deg"] == 45
    assert result["label"] == "Office"


async def test_zones_subscribe_ignores_a_change_after_the_store_is_gone(
    hass, hass_ws_client, init_integration, device_id, caplog
) -> None:
    """A change landing in the unload window builds no payload from a gone store."""
    _ = init_integration
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    assert (await client.receive_json())["success"] is True
    assert _forwarder_count(hass) == 1

    # Without the guard the dispatcher swallows the KeyError and logs it, and the
    # ping below still gets its pong, so only the log can tell the two apart.
    data = hass.data[DOMAIN]
    store = data.pop(DATA_STORE)
    try:
        async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
        await hass.async_block_till_done()
        assert await _drain(client) == []
    finally:
        data[DATA_STORE] = store

    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


async def test_zones_subscription_is_dropped_when_the_client_disconnects(
    hass, hass_ws_client, init_integration, device_id, caplog
) -> None:
    """Closing the tab ends its subscriptions, not just unsubscribing or unloading."""
    # Home Assistant runs every teardown while iterating the connection's
    # subscriptions, so a teardown that touched that dict would stop the loop
    # after the first one and leak the rest. Only the close path shows that,
    # hence two subscriptions, as two cards on one tab would hold.
    _ = init_integration
    client = await hass_ws_client(hass)
    for _card in range(2):
        await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
        assert (await client.receive_json())["success"] is True
    assert _forwarder_count(hass) == 2
    caplog.clear()

    await client.close()
    await hass.async_block_till_done()
    assert _forwarder_count(hass) == 0

    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, **RECT_CALL}, blocking=True
    )
    await hass.async_block_till_done()
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]


# ---------------------------------------------------------------------------
# Calibration commands
# ---------------------------------------------------------------------------

CALIBRATION_GET = "apollo_mmwave/calibration/get"
CALIBRATION_SUBSCRIBE = "apollo_mmwave/calibration/subscribe"


def _calibration_forwarder_count(hass) -> int:
    """Count the dispatcher targets live calibration subscriptions own."""
    targets = hass.data.get(DATA_DISPATCHER, {}).get(SIGNAL_CALIBRATION_UPDATED, {})
    return sum(
        1
        for target in targets
        if getattr(target, "__module__", "").endswith("apollo_mmwave.websocket")
    )


async def _subscribe(client, device_id: str) -> tuple[int, dict]:
    """Subscribe and return the subscription id and the immediate first event."""
    await client.send_json_auto_id(
        {"type": CALIBRATION_SUBSCRIBE, "device_id": device_id}
    )
    message = await client.receive_json()
    assert message["success"] is True
    assert message["result"] is None
    first = await client.receive_json()
    assert first["type"] == "event"
    return message["id"], first["event"]


async def _drain(client) -> list[dict]:
    """Return every event queued so far; a pong proves nothing is left."""
    await client.send_json_auto_id({"type": "ping"})
    events: list[dict] = []
    while True:
        message = await client.receive_json()
        if message["type"] == "pong":
            return events
        events.append(message["event"])


@pytest.fixture
def msr(ld2410_device) -> RadarIds:
    """Return the LD2410 radar's ids."""
    return radar_ids(ld2410_device)


async def test_calibration_subscribe_sends_current_state_immediately(
    hass, hass_ws_client, init_integration, msr
) -> None:
    """The subscription answers null, then pushes the idle state at once."""
    _ = init_integration
    client = await hass_ws_client(hass)

    _, payload = await _subscribe(client, msr.device_id)

    assert payload["job"] is None
    assert payload["snapshots"] == []
    assert payload["last_result"] is None
    assert payload["interrupted"] is None
    assert payload["entities"]["profile"] == "ld2410"
    assert payload["entities"]["gate_count"] == 9
    assert payload["entities"]["engineering_mode"] == msr.engineering
    assert payload["entities"]["engineering_mode_on"] is False
    assert payload["entities"]["max_move_gate"] == 6
    assert payload["entities"]["min_gate"] is None


async def test_calibration_subscribe_pushes_running_job_progress(
    hass_ws_client, calibration_rig, msr
) -> None:
    """A subscribed card follows the countdown and the first sample tick by tick."""
    rig = calibration_rig
    client = await hass_ws_client(rig.hass)
    await _subscribe(client, msr.device_id)
    rig.feed.set_all(10, 10, msr)
    task = rig.start(msr, settle_s=2, duration_s=15)

    await rig.advance(1)
    job = (await _drain(client))[-1]["job"]
    assert (job["status"], job["sub_phase"], job["remaining_s"]) == (
        "preparing",
        "settle",
        1,
    )
    assert job["engineering_mode_turned_on"] is True

    await rig.advance(1)
    job = (await _drain(client))[-1]["job"]
    assert (job["status"], job["sub_phase"], job["samples"]) == ("sampling", None, 1)
    assert job["remaining_s"] == 14
    assert job["peaks"] == {
        "move": {str(gate): 10 for gate in range(9)},
        "still": {str(gate): 10 for gate in range(9)},
    }

    await rig.advance(14)
    result = await finish_job(task)
    final = (await _drain(client))[-1]
    assert final["job"] is None
    assert final["last_result"]["job_id"] == result["job_id"]
    assert final["snapshots"][0]["id"] == result["snapshot_id"]


async def test_calibration_subscribe_ignores_other_devices(
    hass_ws_client, calibration_rig, msr, device_id
) -> None:
    """A card only hears about the radar it is showing."""
    rig = calibration_rig
    client = await hass_ws_client(rig.hass)
    _, payload = await _subscribe(client, device_id)
    assert payload["entities"] is None

    result = await rig.run(msr, move=60, still=60)

    assert result["outcome"] == "applied"
    assert await _drain(client) == []


async def test_calibration_get_returns_last_result_after_a_run(
    hass_ws_client, calibration_rig, msr
) -> None:
    """A one-shot read carries the stored result and the snapshot it took."""
    rig = calibration_rig
    result = await rig.run(msr, move=60, still=60)
    client = await hass_ws_client(rig.hass)

    await client.send_json_auto_id(
        {"type": CALIBRATION_GET, "device_id": msr.device_id}
    )

    payload = (await client.receive_json())["result"]
    assert payload["job"] is None
    assert payload["last_result"] == result
    assert payload["snapshots"] == [
        {
            "id": result["snapshot_id"],
            "taken_at": payload["snapshots"][0]["taken_at"],
            "reason": "calibrate",
            "count": 18,
        }
    ]
    assert payload["interrupted"] is None


async def test_calibration_get_not_found_for_unknown_device(
    hass, hass_ws_client, init_integration
) -> None:
    """A device id Home Assistant does not know is refused."""
    _ = init_integration
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": CALIBRATION_GET, "device_id": "no-such-device"}
    )

    message = await client.receive_json()
    assert message["success"] is False
    assert message["error"]["code"] == "not_found"


async def test_calibration_get_not_loaded_after_unload(
    hass, hass_ws_client, init_integration, msr
) -> None:
    """The commands outlive the entry and say so."""
    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": CALIBRATION_GET, "device_id": msr.device_id}
    )

    message = await client.receive_json()
    assert message["success"] is False
    assert message["error"]["code"] == "not_loaded"


async def test_calibration_get_not_loaded_when_only_zone_store_is_present(
    hass, hass_ws_client, init_integration, msr
) -> None:
    """The zone store alone is not enough: both calibration keys are required."""
    _ = init_integration
    data = hass.data[DOMAIN]
    saved = {
        key: data.pop(key) for key in (DATA_CALIBRATION_STORE, DATA_CALIBRATION_JOBS)
    }
    assert DATA_STORE in data
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": CALIBRATION_GET, "device_id": msr.device_id}
    )

    message = await client.receive_json()
    assert message["success"] is False
    assert message["error"]["code"] == "not_loaded"
    data.update(saved)


async def test_calibration_subscriptions_closed_on_unload(
    hass, hass_ws_client, init_integration, msr
) -> None:
    """Unloading the entry drops the subscription; a late unsubscribe is harmless."""
    client = await hass_ws_client(hass)
    subscription, _ = await _subscribe(client, msr.device_id)
    assert _calibration_forwarder_count(hass) == 1

    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()
    assert _calibration_forwarder_count(hass) == 0

    await client.send_json_auto_id(
        {"type": "unsubscribe_events", "subscription": subscription}
    )
    assert (await client.receive_json())["success"] is True


async def test_calibration_forward_drops_push_after_keys_are_gone(
    hass, hass_ws_client, init_integration, msr
) -> None:
    """A signal arriving in the unload window builds no payload from a gone store."""
    _ = init_integration
    client = await hass_ws_client(hass)
    await _subscribe(client, msr.device_id)
    data = hass.data[DOMAIN]
    saved = {
        key: data.pop(key) for key in (DATA_CALIBRATION_STORE, DATA_CALIBRATION_JOBS)
    }

    async_dispatcher_send(hass, SIGNAL_CALIBRATION_UPDATED, msr.device_id)
    await hass.async_block_till_done()

    assert await _drain(client) == []
    data.update(saved)
    async_dispatcher_send(hass, SIGNAL_CALIBRATION_UPDATED, msr.device_id)
    await hass.async_block_till_done()
    assert len(await _drain(client)) == 1
