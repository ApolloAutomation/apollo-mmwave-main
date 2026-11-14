"""Websocket API the zone and calibrate cards read their state through."""

from __future__ import annotations

import copy
import json
import logging
import time
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

import pytest
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import (
    DATA_DISPATCHER,
    async_dispatcher_connect,
    async_dispatcher_send,
)
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
)

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import (
    DATA_CALIBRATION_JOBS,
    DATA_CALIBRATION_STORE,
    DATA_MOVEMENT,
    DATA_STORE,
    DOMAIN,
    EVENT_ZONE_UPDATED,
    KEY_PRESENCE_ENTITY_ID,
    SIGNAL_CALIBRATION_UPDATED,
    SIGNAL_ZONES_PAYLOAD,
    SIGNAL_ZONES_UPDATED,
    STORE_LABEL,
    STORE_ZONES,
)
from custom_components.apollo_mmwave.zone_entities import ZoneEntityMixin

from .conftest import (
    MOVEMENT_EXAMPLE,
    MOVEMENT_EXAMPLE_RECORDS,
    RADAR_TARGET_COUNT,
    REPLACED_AT,
    RadarIds,
    finish_job,
    previous,
    radar_ids,
    unpack_movement,
)

if TYPE_CHECKING:
    from custom_components.apollo_mmwave.movement import MovementHistory

GET = "apollo_mmwave/zones/get"
SUBSCRIBE = "apollo_mmwave/zones/subscribe"

RECT_CALL = {
    "zone_id": 1,
    "shape": "rect",
    "data": {"x_min": 0, "x_max": 10, "y_min": 0, "y_max": 10},
}


def _forwarder_count(hass, signal: str = SIGNAL_ZONES_UPDATED) -> int:
    """Count the dispatcher targets live zone subscriptions own on a signal."""
    # Both entity platforms listen on the same signal, so counting the whole
    # target list would not show a leaked subscription. Only this module's
    # closures are counted.
    targets = hass.data.get(DATA_DISPATCHER, {}).get(signal, {})
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
    _ = init_integration
    # Owned by its own esphome entry, as every radar in the field is.
    other_entry = MockConfigEntry(domain="esphome", title="Other radar")
    other_entry.add_to_hass(hass)
    other = device_registry.async_get_or_create(
        config_entry_id=other_entry.entry_id,
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
    """The card can be shown to any user, so its commands are not admin-only."""
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


async def test_zones_payload_carries_the_saved_map_units(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """display_units is null until saved, then the saved unit, then null again."""
    _ = init_integration
    client = await hass_ws_client(hass)

    async def display_units() -> str | None:
        await client.send_json_auto_id({"type": GET, "device_id": device_id})
        return (await client.receive_json())["result"]["display_units"]

    assert await display_units() is None

    for unit in ("ft", "m"):
        await hass.services.async_call(
            DOMAIN,
            "update_zone",
            {"device_id": device_id, "display_units": unit},
            blocking=True,
        )
        assert await display_units() == unit

    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {"device_id": device_id, "display_units": "auto"},
        blocking=True,
    )
    assert await display_units() is None


async def test_zones_subscribe_pushes_a_map_unit_change(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Every open card hears about the new unit, not only the one that saved it."""
    _ = init_integration
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    assert (await client.receive_json())["success"] is True

    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {"device_id": device_id, "display_units": "ft"},
        blocking=True,
    )

    pushed = await client.receive_json()
    assert pushed["type"] == "event"
    assert pushed["event"]["display_units"] == "ft"


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
# What the card reads beside the geometry: each zone's presence entity id and
# settings, and the radar's flags
# ---------------------------------------------------------------------------

PRESENCE_1 = "binary_sensor.apollo_r_pro_1_abc123_zone_1_presence"


async def _get(client, device_id: str) -> dict:
    await client.send_json_auto_id({"type": GET, "device_id": device_id})
    return (await client.receive_json())["result"]


async def _subscribe_zones(client, device_id: str) -> int:
    await client.send_json_auto_id({"type": SUBSCRIBE, "device_id": device_id})
    message = await client.receive_json()
    assert message["success"] is True
    return message["id"]


async def test_zones_payload_carries_presence_entity_ids(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Each zone names its presence sensor, or null while none is registered."""
    _ = init_integration
    for zone_id in (1, 2):
        await hass.services.async_call(
            DOMAIN,
            "update_zone",
            {"device_id": device_id, **RECT_CALL, "zone_id": zone_id},
            blocking=True,
        )
    # Stored with no zone signal, so no entity has been made for it yet.
    get_store(hass).device(device_id)[STORE_ZONES][3] = {"shape": "none", "data": None}
    client = await hass_ws_client(hass)

    zones = (await _get(client, device_id))["zones"]

    assert {
        zone_id: zone[KEY_PRESENCE_ENTITY_ID] for zone_id, zone in zones.items()
    } == {
        "1": PRESENCE_1,
        "2": "binary_sensor.apollo_r_pro_1_abc123_zone_2_presence",
        "3": None,
    }


async def test_zone_creation_push_already_carries_the_presence_entity_id(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Both platforms register a new zone's entities before the push is built."""
    _ = init_integration
    client = await hass_ws_client(hass)
    await _subscribe_zones(client, device_id)

    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, **RECT_CALL}, blocking=True
    )
    await hass.async_block_till_done()

    [pushed] = await _drain(client)
    assert pushed["zones"]["1"][KEY_PRESENCE_ENTITY_ID] == PRESENCE_1


async def test_creating_a_named_zone_pushes_exactly_once(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Naming a new zone's entities after its zone signal is no second change."""
    _ = init_integration
    client = await hass_ws_client(hass)
    await _subscribe_zones(client, device_id)

    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {"device_id": device_id, **RECT_CALL, "name": "Couch"},
        blocking=True,
    )
    await hass.async_block_till_done()

    [pushed] = await _drain(client)
    assert pushed["zones"]["1"]["name"] == "Couch"
    assert pushed["zones"]["1"][KEY_PRESENCE_ENTITY_ID] == PRESENCE_1


@pytest.mark.usefixtures("init_integration")
async def test_presence_entity_rename_pushes_the_new_id(
    hass, hass_ws_client, entity_registry, device_id, monkeypatch
) -> None:
    """A new presence entity id is pushed once, with no zone signal or new entity."""
    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, **RECT_CALL}, blocking=True
    )
    await hass.async_block_till_done()
    renamed = "binary_sensor.couch_presence"

    def _ours() -> list[str]:
        return sorted(
            entry.entity_id
            for entry in er.async_entries_for_device(entity_registry, device_id)
            if entry.platform == DOMAIN
        )

    expected = sorted([*(eid for eid in _ours() if eid != PRESENCE_1), renamed])
    client = await hass_ws_client(hass)
    await _subscribe_zones(client, device_id)
    zone_signals: list[str] = []

    @callback
    def _zones_updated(changed_device_id: str) -> None:
        zone_signals.append(changed_device_id)

    unsub = async_dispatcher_connect(hass, SIGNAL_ZONES_UPDATED, _zones_updated)
    aborted: list[str] = []
    real_abort = ZoneEntityMixin.add_to_platform_abort

    def _abort(self) -> None:
        aborted.append(self.entity_id)
        real_abort(self)

    monkeypatch.setattr(ZoneEntityMixin, "add_to_platform_abort", _abort)

    entity_registry.async_update_entity(PRESENCE_1, new_entity_id=renamed)
    await hass.async_block_till_done()
    unsub()

    [pushed] = await _drain(client)
    assert pushed["zones"]["1"][KEY_PRESENCE_ENTITY_ID] == renamed
    # Home Assistant re-added the same entity under its new id: no zone signal
    # ran a platform sync against it, so nothing was added beside it.
    assert zone_signals == []
    assert aborted == []
    assert _ours() == expected
    assert hass.states.get(PRESENCE_1) is None
    assert hass.states.get(renamed).state == "off"

    # And it still follows the radar's targets.
    hass.states.async_set("sensor.r_pro_ld2450_target_1_x", "5")
    hass.states.async_set("sensor.r_pro_ld2450_target_1_y", "5")
    await hass.async_block_till_done()
    assert hass.states.get(renamed).state == "on"


async def test_zones_payload_normalizes_hand_edited_zone_settings(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """A setting presence reads as the default reaches the card as the default."""
    _ = init_integration
    rect = {"shape": "rect", "data": RECT_CALL["data"]}
    # Zone dicts load verbatim, so a hand edit can leave anything here.
    get_store(hass).device(device_id)[STORE_ZONES].update(
        {
            1: {**rect, "zone_type": "IGNORE", "hold_s": "60"},
            2: {**rect, "zone_type": "ignore", "hold_s": 30.7},
            3: {**rect, "zone_type": "detect", "hold_s": 99999},
            4: {**rect, "zone_type": None, "hold_s": True},
            5: {**rect, "zone_type": ["ignore"], "hold_s": -5},
        }
    )
    client = await hass_ws_client(hass)

    zones = (await _get(client, device_id))["zones"]

    settings = {
        zone_id: {key: zone[key] for key in ("zone_type", "hold_s") if key in zone}
        for zone_id, zone in zones.items()
    }
    assert settings == {
        "1": {},
        "2": {"zone_type": "ignore", "hold_s": 30},
        "3": {"hold_s": 3600},
        "4": {},
        "5": {},
    }
    assert all(zone["data"] == RECT_CALL["data"] for zone in zones.values())


async def test_zones_payload_does_not_mutate_the_store(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """The payload is built from copies; the store's zone dicts stay as stored."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {"device_id": device_id, **RECT_CALL, "hold_s": 30},
        blocking=True,
    )
    # Zone 1 keeps a previous shape the payload omits.
    await _draw(hass, device_id, 1, "rect", MOVED)
    store = get_store(hass)
    store.device(device_id)[STORE_ZONES][2] = {
        "shape": "none",
        "data": None,
        "zone_type": "IGNORE",
        "hold_s": "60",
    }
    before = copy.deepcopy(store._data_to_save())  # noqa: SLF001
    client = await hass_ws_client(hass)
    await _subscribe_zones(client, device_id)

    result = await _get(client, device_id)
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    [pushed] = await _drain(client)

    assert result["zones"]["1"]["hold_s"] == 30
    assert result["zones"]["1"]["previous_shape_drawn"] is True
    assert pushed["zones"]["2"][KEY_PRESENCE_ENTITY_ID] is not None
    assert store._data_to_save() == before  # noqa: SLF001
    assert (
        store.devices[device_id][STORE_ZONES][1]["previous_shape"]["data"]
        == (RECT_CALL["data"])
    )
    assert all(
        KEY_PRESENCE_ENTITY_ID not in zone
        for zone in store.devices[device_id][STORE_ZONES].values()
    )


async def test_zones_payload_carries_mirror_and_movement_flags(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Both flags are always there as booleans, false until turned on."""
    _ = init_integration
    client = await hass_ws_client(hass)

    result = await _get(client, device_id)
    assert result["mirror_x"] is False
    assert result["movement_history"] is False

    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {"device_id": device_id, "mirror_x": True, "movement_history": True},
        blocking=True,
    )
    result = await _get(client, device_id)
    assert result["mirror_x"] is True
    assert result["movement_history"] is True

    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {"device_id": device_id, "mirror_x": False},
        blocking=True,
    )
    result = await _get(client, device_id)
    assert result["mirror_x"] is False
    assert result["movement_history"] is True


async def test_zones_subscribe_pushes_a_flip(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Every open card hears about the flip, not only the one that saved it."""
    _ = init_integration
    client = await hass_ws_client(hass)
    await _subscribe_zones(client, device_id)

    await hass.services.async_call(
        DOMAIN, "update_zone", {"device_id": device_id, "mirror_x": True}, blocking=True
    )

    pushed = await client.receive_json()
    assert pushed["type"] == "event"
    assert pushed["event"]["mirror_x"] is True


@pytest.mark.parametrize("ending", ["unsubscribe", "close", "unload"])
async def test_zones_subscription_end_drops_both_forwarders(
    hass, hass_ws_client, init_integration, device_id, ending
) -> None:
    """However a subscription ends, neither of its two signal forwarders stays."""
    client = await hass_ws_client(hass)
    subscription = await _subscribe_zones(client, device_id)
    assert _forwarder_count(hass) == 1
    assert _forwarder_count(hass, SIGNAL_ZONES_PAYLOAD) == 1

    if ending == "unsubscribe":
        await client.send_json_auto_id(
            {"type": "unsubscribe_events", "subscription": subscription}
        )
        assert (await client.receive_json())["success"] is True
    elif ending == "close":
        await client.close()
        await hass.async_block_till_done()
    else:
        assert await hass.config_entries.async_unload(init_integration.entry_id)
        await hass.async_block_till_done()

    assert _forwarder_count(hass) == 0
    assert _forwarder_count(hass, SIGNAL_ZONES_PAYLOAD) == 0


# ---------------------------------------------------------------------------
# Restoring a zone's previous shape, administrators only
# ---------------------------------------------------------------------------

RESTORE = "apollo_mmwave/zones/restore_shape"
RECT_A = RECT_CALL["data"]
MOVED = {"x_min": 0, "x_max": 500, "y_min": 0, "y_max": 500}
ZONE_STORAGE_KEY = f"{DOMAIN}.zones"
TWENTY_MINUTES_LATER = "2026-11-13T15:24:05+00:00"


async def _draw(
    hass, device_id: str, zone_id: int, shape: str, data: Any, **extra: Any
) -> None:
    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {
            "device_id": device_id,
            "zone_id": zone_id,
            "shape": shape,
            "data": data,
            **extra,
        },
        blocking=True,
    )
    await hass.async_block_till_done()


def _current(shape: str, data=None) -> dict:
    return {"shape": shape, "data": data}


async def _restore(
    client, device_id: str, *zones: tuple[int, dict], pushed: list | None = None
) -> dict:
    """
    Send a restore for (zone_id, current) pairs and return the reply.

    The zone push comes before the reply; each one goes into `pushed`.
    """
    await client.send_json_auto_id(
        {
            "type": RESTORE,
            "device_id": device_id,
            "zones": [
                {"zone_id": zone_id, "current": current} for zone_id, current in zones
            ],
        }
    )
    while (message := await client.receive_json())["type"] == "event":
        assert pushed is not None
        pushed.append(message["event"])
    return message


def _zone(hass, device_id: str, zone_id: int = 1) -> dict:
    return get_store(hass).devices[device_id][STORE_ZONES][zone_id]


def _zone_event_count(hass) -> list:
    events: list = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)
    return events


@pytest.mark.usefixtures("replaced_at", "init_integration")
async def test_restore_shape_swaps_current_and_previous(
    hass, freezer, hass_ws_client, device_id, hass_storage
) -> None:
    """The previous shape comes back, and the one it replaces becomes the previous."""
    await _draw(hass, device_id, 1, "rect", RECT_A)
    await _draw(hass, device_id, 1, "rect", MOVED)
    assert _zone(hass, device_id)["previous_shape"] == previous(
        "rect", RECT_A, REPLACED_AT
    )
    # Before the tick: an access token lasts 30 minutes.
    client = await hass_ws_client(hass)
    freezer.tick(timedelta(minutes=20))

    reply = await _restore(client, device_id, (1, _current("rect", MOVED)))

    assert reply["success"] is True
    assert reply["result"] == {
        "restored": [{"zone_id": 1, "shape": "rect", "data": RECT_A}],
        "skipped": [],
    }
    assert _zone(hass, device_id) == {
        "shape": "rect",
        "data": RECT_A,
        "previous_shape": previous("rect", MOVED, TWENTY_MINUTES_LATER),
    }
    # Saved after the store's usual delay, like every zone change.
    freezer.tick(timedelta(seconds=3))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    on_disk = hass_storage[ZONE_STORAGE_KEY]["data"]["devices"][device_id]
    assert on_disk["zones"]["1"]["data"] == RECT_A


async def test_restore_shape_twice_puts_the_change_back(
    hass, replaced_at, hass_ws_client, init_integration, device_id
) -> None:
    """A restore can itself be undone, by restoring again."""
    _ = (replaced_at, init_integration)
    await _draw(hass, device_id, 1, "rect", RECT_A)
    await _draw(
        hass, device_id, 1, "ellipse", {"cx": 0, "cy": 900, "rx": 300, "ry": 200}
    )
    client = await hass_ws_client(hass)
    ellipse = _zone(hass, device_id)["data"]

    first = await _restore(client, device_id, (1, _current("ellipse", ellipse)))
    second = await _restore(client, device_id, (1, _current("rect", RECT_A)))

    assert first["result"]["restored"] == [
        {"zone_id": 1, "shape": "rect", "data": RECT_A}
    ]
    assert second["result"]["restored"] == [
        {"zone_id": 1, "shape": "ellipse", "data": ellipse}
    ]
    zone = _zone(hass, device_id)
    assert (zone["shape"], zone["data"]) == ("ellipse", ellipse)
    assert zone["previous_shape"] == previous("rect", RECT_A, replaced_at)


async def test_restore_shape_keeps_name_type_and_hold(
    hass, replaced_at, hass_ws_client, init_integration, device_id
) -> None:
    """Only the geometry changes; what the zone does stays."""
    _ = init_integration
    await _draw(
        hass, device_id, 1, "rect", RECT_A, name="Couch", zone_type="ignore", hold_s=45
    )
    await _draw(hass, device_id, 1, "rect", MOVED)
    client = await hass_ws_client(hass)

    await _restore(client, device_id, (1, _current("rect", MOVED)))

    assert _zone(hass, device_id) == {
        "shape": "rect",
        "data": RECT_A,
        "name": "Couch",
        "zone_type": "ignore",
        "hold_s": 45,
        "previous_shape": previous("rect", MOVED, replaced_at),
    }


@pytest.mark.parametrize(
    "current",
    [
        # What the zone had before someone else redrew it.
        _current("rect", RECT_A),
        _current("none"),
        _current("rect", {**MOVED, "x_max": 400}),
        _current("ellipse", {"cx": 0, "cy": 0, "rx": 500, "ry": 500}),
    ],
    ids=["older_shape", "none", "other_rect", "other_shape"],
)
@pytest.mark.usefixtures("replaced_at", "init_integration")
async def test_restore_shape_skips_a_zone_changed_since(
    hass, hass_ws_client, device_id, current
) -> None:
    """A zone whose shape is not the one the client saw is left as it is."""
    await _draw(hass, device_id, 1, "rect", RECT_A)
    await _draw(hass, device_id, 1, "rect", MOVED)
    before = copy.deepcopy(get_store(hass)._data_to_save())  # noqa: SLF001
    client = await hass_ws_client(hass)
    await _subscribe_zones(client, device_id)
    events = _zone_event_count(hass)

    reply = await _restore(client, device_id, (1, current))

    assert reply["result"] == {"restored": [], "skipped": [1]}
    assert get_store(hass)._data_to_save() == before  # noqa: SLF001
    await hass.async_block_till_done()
    assert await _drain(client) == []
    assert events == []


async def test_restore_shape_matches_current_as_the_store_rounds_it(
    hass, replaced_at, hass_ws_client, init_integration, device_id
) -> None:
    """The card names what it sent, unrounded; the store kept whole millimeters."""
    _ = (replaced_at, init_integration)
    await _draw(hass, device_id, 1, "rect", RECT_A)
    sent = {"x_min": 0.3, "x_max": 499.8, "y_min": -0.2, "y_max": 500.1}
    await _draw(hass, device_id, 1, "rect", sent)
    assert _zone(hass, device_id)["data"] == MOVED
    client = await hass_ws_client(hass)

    reply = await _restore(client, device_id, (1, _current("rect", sent)))

    assert reply["result"]["restored"] == [
        {"zone_id": 1, "shape": "rect", "data": RECT_A}
    ]


async def test_restore_shape_skips_missing_zones_and_zones_without_previous(
    hass, replaced_at, hass_ws_client, init_integration, device_id
) -> None:
    """Only a zone that has a previous shape is restored; the rest are listed."""
    _ = (replaced_at, init_integration)
    await _draw(hass, device_id, 1, "rect", RECT_A)
    await _draw(hass, device_id, 2, "rect", RECT_A)
    await _draw(hass, device_id, 2, "rect", MOVED)
    client = await hass_ws_client(hass)

    reply = await _restore(
        client,
        device_id,
        (1, _current("rect", RECT_A)),
        (2, _current("rect", MOVED)),
        (3, _current("none")),
    )

    assert reply["result"] == {
        "restored": [{"zone_id": 2, "shape": "rect", "data": RECT_A}],
        "skipped": [1, 3],
    }
    assert _zone(hass, device_id, 1) == {"shape": "rect", "data": RECT_A}
    assert 3 not in get_store(hass).devices[device_id][STORE_ZONES]


async def test_restore_shape_acts_once_on_a_repeated_id(
    hass, replaced_at, hass_ws_client, init_integration, device_id
) -> None:
    """A zone listed twice is restored once, not swapped back by its second entry."""
    _ = (replaced_at, init_integration)
    await _draw(hass, device_id, 1, "rect", RECT_A)
    await _draw(hass, device_id, 1, "rect", MOVED)
    client = await hass_ws_client(hass)

    reply = await _restore(
        client, device_id, (1, _current("rect", MOVED)), (1, _current("rect", RECT_A))
    )

    assert reply["result"] == {
        "restored": [{"zone_id": 1, "shape": "rect", "data": RECT_A}],
        "skipped": [],
    }
    assert _zone(hass, device_id)["data"] == RECT_A


async def test_restore_shape_batch_pushes_once(
    hass, replaced_at, hass_ws_client, init_integration, device_id
) -> None:
    """Undoing Clear all restores every zone with one push and one event."""
    _ = init_integration
    ellipse = {"cx": 0, "cy": 900, "rx": 300, "ry": 200}
    await _draw(hass, device_id, 1, "rect", RECT_A)
    await _draw(hass, device_id, 2, "ellipse", ellipse)
    for zone_id in (1, 2):
        await _draw(hass, device_id, zone_id, "none", None)
    client = await hass_ws_client(hass)
    await _subscribe_zones(client, device_id)
    events = _zone_event_count(hass)

    pushed: list = []

    reply = await _restore(
        client, device_id, (1, _current("none")), (2, _current("none")), pushed=pushed
    )

    assert reply["result"] == {
        "restored": [
            {"zone_id": 1, "shape": "rect", "data": RECT_A},
            {"zone_id": 2, "shape": "ellipse", "data": ellipse},
        ],
        "skipped": [],
    }
    await hass.async_block_till_done()
    assert await _drain(client) == []
    [payload] = pushed
    assert {key: zone["shape"] for key, zone in payload["zones"].items()} == {
        "1": "rect",
        "2": "ellipse",
    }
    # The cleared state is now the previous shape.
    assert payload["zones"]["1"]["previous_shape_at"] == replaced_at
    assert payload["zones"]["1"]["previous_shape_drawn"] is False
    assert len(events) == 1
    assert events[0].data == {"device_id": device_id}


async def test_restore_shape_requires_admin(
    hass, hass_ws_client, hass_read_only_access_token, init_integration, device_id
) -> None:
    """A non-admin gets unauthorized first; a malformed request is invalid_format."""
    _ = init_integration
    await _draw(hass, device_id, 1, "rect", RECT_A)
    await _draw(hass, device_id, 1, "rect", MOVED)
    before = copy.deepcopy(get_store(hass)._data_to_save())  # noqa: SLF001
    user = await hass_ws_client(hass, hass_read_only_access_token)
    admin = await hass_ws_client(hass)

    # Unauthorized comes before not_found, whatever the device.
    for device in (device_id, "no-such-device"):
        reply = await _restore(user, device, (1, _current("rect", MOVED)))
        assert reply["success"] is False
        assert reply["error"]["code"] == "unauthorized"
    assert get_store(hass)._data_to_save() == before  # noqa: SLF001

    # Home Assistant checks the schema before the admin check.
    for client in (user, admin):
        for message in (
            {"type": RESTORE, "device_id": device_id, "zones": []},
            {"type": RESTORE, "device_id": device_id},
            {
                "type": RESTORE,
                "device_id": device_id,
                "zones": [{"zone_id": 0, "current": _current("none")}],
            },
            {
                "type": RESTORE,
                "device_id": device_id,
                "zones": [{"zone_id": 1, "current": {"shape": "circle"}}],
            },
            {
                "type": RESTORE,
                "device_id": device_id,
                "zones": [{"zone_id": 1}],
            },
        ):
            reply = await _ask(client, message)
            assert reply["error"]["code"] == "invalid_format", message
    reply = await _restore(admin, device_id, (1, _current("rect", MOVED)))
    assert reply["success"] is True
    assert reply["result"]["skipped"] == []


async def test_restore_shape_unknown_device_is_not_found(
    hass, hass_ws_client, init_integration
) -> None:
    """A device id Home Assistant does not know is an error, and mints nothing."""
    _ = init_integration
    client = await hass_ws_client(hass)

    reply = await _restore(client, "no-such-device", (1, _current("none")))

    assert reply["success"] is False
    assert reply["error"]["code"] == "not_found"
    assert get_store(hass).devices == {}


async def test_restore_shape_not_loaded_after_unload(
    hass, hass_ws_client, hass_read_only_access_token, init_integration, device_id
) -> None:
    """The command outlives the config entry, so it answers without the store."""
    client = await hass_ws_client(hass)
    user = await hass_ws_client(hass, hass_read_only_access_token)
    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()

    for device in (device_id, "no-such-device"):
        reply = await _restore(client, device, (1, _current("none")))
        assert reply["success"] is False
        assert reply["error"]["code"] == "not_loaded"
    reply = await _restore(user, device_id, (1, _current("none")))
    assert reply["error"]["code"] == "unauthorized"


async def test_restore_shape_does_not_mint_a_store_entry(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Asking about a radar with nothing stored skips its zones and stores nothing."""
    _ = init_integration
    client = await hass_ws_client(hass)

    reply = await _restore(client, device_id, (1, _current("none")))

    assert reply["result"] == {"restored": [], "skipped": [1]}
    assert get_store(hass).devices == {}


async def test_restore_shape_moves_presence(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """The zone's presence sensor follows the restored geometry at once."""
    _ = init_integration
    await _draw(hass, device_id, 1, "rect", RECT_A)
    await _draw(hass, device_id, 1, "rect", MOVED)
    # Inside MOVED, outside RECT_A.
    hass.states.async_set("sensor.r_pro_ld2450_target_1_x", "100")
    hass.states.async_set("sensor.r_pro_ld2450_target_1_y", "100")
    await hass.async_block_till_done()
    assert hass.states.get(PRESENCE_1).state == "on"
    client = await hass_ws_client(hass)

    await _restore(client, device_id, (1, _current("rect", MOVED)))
    await hass.async_block_till_done()

    assert hass.states.get(PRESENCE_1).state == "off"


@pytest.mark.parametrize(
    "case",
    [
        # x_min above x_max: update_zone would never have stored it.
        (
            {"shape": "rect", "data": {"x_min": 9, "x_max": 1, "y_min": 0, "y_max": 9}},
            "invalid bounds",
        ),
        ({"shape": "polygon", "data": {"points": [{"x": 0, "y": 0}]}}, "insufficient"),
        # Not a previous shape, so nothing is logged.
        ({"shape": "rect", "data": [0, 9, 0, 9]}, None),
    ],
    ids=["bad_rect", "bad_polygon", "list_data"],
)
@pytest.mark.usefixtures("init_integration")
async def test_restore_shape_skips_a_bad_previous_shape(
    hass, hass_ws_client, device_id, caplog, case
) -> None:
    """A hand-edited previous shape that does not normalize is never written."""
    bad, warned = case
    await _draw(hass, device_id, 1, "rect", MOVED)
    _zone(hass, device_id)["previous_shape"] = {
        **bad,
        "replaced_at": "2026-11-13T15:04:05+00:00",
    }
    before = copy.deepcopy(get_store(hass)._data_to_save())  # noqa: SLF001
    client = await hass_ws_client(hass)
    caplog.clear()

    reply = await _restore(client, device_id, (1, _current("rect", MOVED)))

    assert reply["result"] == {"restored": [], "skipped": [1]}
    assert get_store(hass)._data_to_save() == before  # noqa: SLF001
    if warned:
        assert warned in caplog.text
    else:
        assert "zone 1" not in caplog.text.lower()


async def test_zones_payload_carries_previous_shape_at(
    hass, replaced_at, hass_ws_client, init_integration, device_id
) -> None:
    """Each zone says when its shape was last replaced, and whether that had one."""
    _ = init_integration
    # Redrawn, drawn for the first time, and only created.
    await _draw(hass, device_id, 1, "rect", RECT_A)
    await _draw(hass, device_id, 1, "rect", MOVED)
    await _draw(hass, device_id, 2, "none", None, name="Zone 2")
    await _draw(hass, device_id, 2, "rect", RECT_A)
    await _draw(hass, device_id, 3, "rect", RECT_A)
    client = await hass_ws_client(hass)

    zones = (await _get(client, device_id))["zones"]

    assert {
        zone_id: {
            key: zone[key]
            for key in ("previous_shape_at", "previous_shape_drawn")
            if key in zone
        }
        for zone_id, zone in zones.items()
    } == {
        "1": {"previous_shape_at": replaced_at, "previous_shape_drawn": True},
        "2": {"previous_shape_at": replaced_at, "previous_shape_drawn": False},
        "3": {},
    }
    # The previous geometry itself stays on the server.
    assert all("previous_shape" not in zone for zone in zones.values())


async def test_zones_payload_ignores_a_hand_edited_previous_shape(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """A previous shape the service could not have written is left out."""
    _ = init_integration
    rect = {"shape": "rect", "data": RECT_A}
    at = "2026-11-13T15:04:05+00:00"
    get_store(hass).device(device_id)[STORE_ZONES].update(
        {
            1: {**rect, "previous_shape": ["rect", RECT_A]},
            2: {**rect, "previous_shape": {**rect}},
            3: {**rect, "previous_shape": {**rect, "replaced_at": 1763046245}},
            4: {**rect, "previous_shape": {"shape": "circle", "replaced_at": at}},
            5: {**rect, "previous_shape": {**rect, "data": [0, 1], "replaced_at": at}},
            # Read as no shape: a rect with no geometry.
            6: {**rect, "previous_shape": {"shape": "rect", "replaced_at": at}},
        }
    )
    client = await hass_ws_client(hass)

    zones = (await _get(client, device_id))["zones"]

    for zone_id in ("1", "2", "3", "4", "5"):
        assert "previous_shape_at" not in zones[zone_id]
        assert "previous_shape_drawn" not in zones[zone_id]
    assert zones["6"]["previous_shape_at"] == at
    assert zones["6"]["previous_shape_drawn"] is False
    assert all("previous_shape" not in zone for zone in zones.values())


# ---------------------------------------------------------------------------
# Movement history commands, administrators only
# ---------------------------------------------------------------------------

MOVEMENT_GET = "apollo_mmwave/movement/get"
MOVEMENT_CLEAR = "apollo_mmwave/movement/clear"
DAY_MS = 86400000


@pytest.fixture
def example_now(freezer) -> None:
    """Freeze time at the now of SPEC 1.5's example answer."""
    freezer.move_to(datetime(2026, 1, 1, 1, tzinfo=UTC))


def _now_ms() -> int:
    return round(time.time() * 1000)


async def _history_on(hass, device_id: str) -> MovementHistory:
    """Turn movement history on for the radar and return the history."""
    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {"device_id": device_id, "movement_history": True},
        blocking=True,
    )
    await hass.async_block_till_done()
    return hass.data[DOMAIN][DATA_MOVEMENT]


async def _ask(client, message: dict) -> dict:
    await client.send_json_auto_id(message)
    return await client.receive_json()


async def test_movement_get_requires_admin(
    hass, hass_ws_client, hass_read_only_access_token, init_integration, device_id
) -> None:
    """A non-admin gets unauthorized first; a malformed request is invalid_format."""
    _ = init_integration
    await _history_on(hass, device_id)
    user = await hass_ws_client(hass, hass_read_only_access_token)
    admin = await hass_ws_client(hass)

    # Unauthorized comes before not_found, whatever the device.
    for device in (device_id, "no-such-device"):
        reply = await _ask(user, {"type": MOVEMENT_GET, "device_id": device})
        assert reply["success"] is False
        assert reply["error"]["code"] == "unauthorized"

    # Home Assistant checks the schema before the admin check.
    for client in (user, admin):
        for message in (
            {"type": MOVEMENT_GET},
            {"type": MOVEMENT_GET, "device_id": device_id, "since": -1},
        ):
            reply = await _ask(client, message)
            assert reply["error"]["code"] == "invalid_format"
    reply = await _ask(admin, {"type": MOVEMENT_GET, "device_id": device_id})
    assert reply["success"] is True


async def test_movement_clear_requires_admin(
    hass, hass_ws_client, hass_read_only_access_token, init_integration, device_id
) -> None:
    """A non-admin cannot clear a radar's history, and it stays."""
    _ = init_integration
    history = await _history_on(hass, device_id)
    history._record(device_id, _now_ms(), 0, 1371, 2903)  # noqa: SLF001 - a record
    user = await hass_ws_client(hass, hass_read_only_access_token)

    reply = await _ask(user, {"type": MOVEMENT_CLEAR, "device_id": device_id})

    assert reply["success"] is False
    assert reply["error"]["code"] == "unauthorized"
    assert history.count(device_id) == 1


async def test_movement_get_returns_packed_columns(
    hass, example_now, hass_ws_client, init_integration, device_id
) -> None:
    """The answer is SPEC 1.5's example: little-endian columns in base64."""
    _ = (example_now, init_integration)
    history = await _history_on(hass, device_id)
    for record in MOVEMENT_EXAMPLE_RECORDS:
        history._record(device_id, *record)  # noqa: SLF001 - the example's records
    client = await hass_ws_client(hass)

    reply = await _ask(client, {"type": MOVEMENT_GET, "device_id": device_id})

    assert reply["result"] == {
        "enabled": True,
        "now": 1767229200000,
        "since": 1767229200000 - DAY_MS,
        "retention_s": 86400,
        **MOVEMENT_EXAMPLE,
    }
    assert unpack_movement(reply["result"]) == MOVEMENT_EXAMPLE_RECORDS


async def test_movement_get_since_filters_and_carries_in_the_last_point(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """A window starts at since, after each slot's last point up to 30 s before."""
    _ = init_integration
    history = await _history_on(hass, device_id)
    since = _now_ms() - 3600000
    records = [
        # Slot 2's last point, more than 30 s before the window.
        (since - 40000, 2, 900, 900),
        (since - 10000, 0, 120, 2400),
        # Slot 0's last point before the window: carried in.
        (since - 9500, 0, 170, 2410),
        (since - 8988, 1, -800, 3100),
        # Slot 1 left before the window, so nothing of it is carried in.
        (since - 5000, -2, 0, 0),
        (since + 6000, -1, 0, 0),
        (since + 7000, 1, 300, 1500),
    ]
    for record in records:
        history._record(device_id, *record)  # noqa: SLF001 - an hour ago
    client = await hass_ws_client(hass)

    result = (
        await _ask(
            client, {"type": MOVEMENT_GET, "device_id": device_id, "since": since}
        )
    )["result"]

    assert result["since"] == since
    assert result["t0"] == since - 9500
    assert unpack_movement(result) == [records[2], records[5], records[6]]

    # No since, or one before the 24 hours: the whole 24 hours.
    for message in (
        {"type": MOVEMENT_GET, "device_id": device_id},
        {"type": MOVEMENT_GET, "device_id": device_id, "since": 0},
    ):
        result = (await _ask(client, message))["result"]
        assert result["since"] == result["now"] - DAY_MS
        assert unpack_movement(result) == records
    # A since after now is now.
    result = (
        await _ask(
            client,
            {
                "type": MOVEMENT_GET,
                "device_id": device_id,
                "since": since + 2 * 3600000,
            },
        )
    )["result"]
    assert result["since"] == result["now"]
    assert result["n"] == 0


async def test_movement_get_at_the_cap_stays_under_2_mb(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """A full radar, cap and slack, answers in under 2 MB."""
    _ = init_integration
    history = await _history_on(hass, device_id)
    count = 105000
    first = _now_ms() - count * 500
    for index in range(count):
        history._record(  # noqa: SLF001 - fills the cap fast
            device_id, first + index * 500, index % 3, index % 6000 - 3000, index % 5000
        )
    client = await hass_ws_client(hass)

    reply = await _ask(client, {"type": MOVEMENT_GET, "device_id": device_id})

    assert reply["result"]["n"] == count
    assert len(json.dumps(reply["result"])) < 2_000_000


async def test_movement_get_unknown_device_is_not_found(
    hass, hass_ws_client, init_integration
) -> None:
    """A device id Home Assistant does not know is an error for both commands."""
    _ = init_integration
    client = await hass_ws_client(hass)

    for command in (MOVEMENT_GET, MOVEMENT_CLEAR):
        reply = await _ask(client, {"type": command, "device_id": "no-such-device"})
        assert reply["success"] is False
        assert reply["error"]["code"] == "not_found"
    assert get_store(hass).devices == {}


async def test_movement_get_not_loaded_after_unload(
    hass, hass_ws_client, hass_read_only_access_token, init_integration, device_id
) -> None:
    """Without the history or the zone store, both commands say not loaded."""
    client = await hass_ws_client(hass)
    user = await hass_ws_client(hass, hass_read_only_access_token)
    data = hass.data[DOMAIN]
    # Mid-unload, the teardowns pop the two at different moments.
    for key in (DATA_MOVEMENT, DATA_STORE):
        saved = data.pop(key)
        reply = await _ask(client, {"type": MOVEMENT_GET, "device_id": device_id})
        assert reply["error"]["code"] == "not_loaded"
        data[key] = saved

    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()

    for command in (MOVEMENT_GET, MOVEMENT_CLEAR):
        reply = await _ask(client, {"type": command, "device_id": device_id})
        assert reply["success"] is False
        assert reply["error"]["code"] == "not_loaded"
    # Unauthorized comes first, then not_loaded, then not_found.
    reply = await _ask(user, {"type": MOVEMENT_GET, "device_id": device_id})
    assert reply["error"]["code"] == "unauthorized"
    reply = await _ask(client, {"type": MOVEMENT_GET, "device_id": "no-such-device"})
    assert reply["error"]["code"] == "not_loaded"


async def test_movement_commands_do_not_mint_a_store_entry(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """A radar with history off answers empty, and asking writes nothing down."""
    _ = init_integration
    client = await hass_ws_client(hass)

    result = (await _ask(client, {"type": MOVEMENT_GET, "device_id": device_id}))[
        "result"
    ]
    assert result["enabled"] is False
    assert (result["n"], result["t0"]) == (0, None)
    assert [result[key] for key in ("dt", "s", "x", "y")] == ["", "", "", ""]
    reply = await _ask(client, {"type": MOVEMENT_CLEAR, "device_id": device_id})
    assert reply["result"] == {"cleared": 0}

    assert get_store(hass).devices == {}


async def test_movement_clear_empties_and_reports_the_count(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """Clear says how many records went, and keeps the flag on."""
    _ = init_integration
    history = await _history_on(hass, device_id)
    now = _now_ms()
    for offset in (3000, 2000, 1000):
        history._record(device_id, now - offset, 0, 1000 + offset, 2000)  # noqa: SLF001
    client = await hass_ws_client(hass)

    reply = await _ask(client, {"type": MOVEMENT_CLEAR, "device_id": device_id})

    assert reply["result"] == {"cleared": 3}
    result = (await _ask(client, {"type": MOVEMENT_GET, "device_id": device_id}))[
        "result"
    ]
    assert result["enabled"] is True
    assert result["n"] == 0


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
    assert payload["entities"]["query_params_button"] == msr.query_params


async def test_calibration_payload_names_the_ld2412_query_params_button(
    hass, hass_ws_client, init_integration, ld2412_device
) -> None:
    """The card finds the R PRO-1's button in the payload as it does the MSR's."""
    _ = init_integration
    rpro = radar_ids(ld2412_device)
    client = await hass_ws_client(hass)

    _, payload = await _subscribe(client, rpro.device_id)

    assert payload["entities"]["profile"] == "ld2412"
    assert payload["entities"]["query_params_button"] == rpro.query_params
    assert rpro.query_params.endswith("_ld2412_query_params")


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
