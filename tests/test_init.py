"""Service, store, and unload behavior."""

from __future__ import annotations

import asyncio
from datetime import timedelta
from typing import TYPE_CHECKING, Any
from unittest.mock import patch

import pytest
import voluptuous as vol
from homeassistant.config_entries import SOURCE_USER, ConfigEntryState
from homeassistant.core import Context, callback
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.json import json_bytes
from homeassistant.helpers.storage import Store
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
)

from custom_components.apollo_mmwave import (
    UPDATE_ZONE_SERVICE_SCHEMA,
    async_remove_entry,
    get_store,
)
from custom_components.apollo_mmwave import frontend as apollo_frontend
from custom_components.apollo_mmwave.const import (
    ATTR_ROTATION_DEG,
    CONF_AUTO_CREATE_VIEW,
    CONF_CREATE_DASHBOARD,
    CONF_DASHBOARD_DEVICES,
    CONF_DASHBOARD_ID,
    CONF_DASHBOARD_URL_PATH,
    DASHBOARD_ICON,
    DASHBOARD_STRATEGY_TYPE,
    DASHBOARD_TITLE,
    DASHBOARD_URL_PATH,
    DATA_MOVEMENT,
    DATA_STORE,
    DISPLAY_UNITS,
    DOMAIN,
    ENTRY_MINOR_VERSION,
    EVENT_ZONE_UPDATED,
    HOLD_S_MAX,
    INPUT_UNIT_FACTORS,
    POLYGON_MAX_POINTS,
    POLYGON_MIN_POINTS,
    SERVICE_CALIBRATE_GATES,
    SERVICE_CANCEL_CALIBRATION,
    SERVICE_RESTORE_GATE_THRESHOLDS,
    SERVICE_UPDATE_ZONE,
    SIGNAL_ZONES_UPDATED,
    STORE_DEVICES,
    STORE_DISPLAY_UNITS,
    STORE_ENTITIES,
    STORE_HOLD_S,
    STORE_INPUT_UNITS,
    STORE_LABEL,
    STORE_MIRROR_X,
    STORE_MOVEMENT_HISTORY,
    STORE_ORPHANS,
    STORE_ZONE_TYPE,
    STORE_ZONES,
    WARN_ELLIPSE_INVALID,
    WARN_ELLIPSE_NON_POSITIVE,
    WARN_POLY_INSUFFICIENT,
    WARN_POLY_MALFORMED,
    WARN_POLY_TRUNCATING,
    WARN_RECT_INVALID,
    WARN_RECT_NON_NUM,
    WARN_ZONE_NO_GEOMETRY,
)
from custom_components.apollo_mmwave.frontend import _dashboards_collection

from .conftest import (
    apollo_warnings,
    async_dashboard_config,
    async_owned_entry,
    record_dashboard_writes,
    rows_on_url_path,
    setup_integration,
)

if TYPE_CHECKING:
    from collections.abc import Callable

TRACKED = [
    {
        "x": "sensor.r_pro_ld2450_target_1_x",
        "y": "sensor.r_pro_ld2450_target_1_y",
    }
]

# JavaScript's Number.MAX_SAFE_INTEGER: the largest coordinate or zone id the
# service stores, since anything past 64 bits cannot be serialized by HA.
MAX_SAFE_INT = 2**53 - 1

ZONE_STORAGE_KEY = f"{DOMAIN}.zones"
MOVEMENT_STORAGE_KEY = f"{DOMAIN}.movement"

# The real Store.async_remove, taken at import, before the hass_storage fixture
# swaps in a mock that only drops the key and leaves a pending write scheduled.
REAL_STORE_REMOVE = Store.async_remove


async def _update_zone(hass, data: dict) -> None:
    await hass.services.async_call(DOMAIN, SERVICE_UPDATE_ZONE, data, blocking=True)
    await hass.async_block_till_done()


async def _create_rect_zone(hass, device_id: str) -> None:
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "rect",
            "data": {"x_min": -1000, "x_max": 1000, "y_min": 0, "y_max": 2000},
            "entities": TRACKED,
        },
        blocking=True,
    )
    await hass.async_block_till_done()


def _zone_entity_ids(hass, device_id: str) -> tuple[str | None, str | None]:
    registry = er.async_get(hass)
    return (
        registry.async_get_entity_id("sensor", DOMAIN, f"{device_id}_zone_1"),
        registry.async_get_entity_id(
            "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
        ),
    )


def _set_target(hass, pair: dict[str, str], x: float, y: float) -> None:
    hass.states.async_set(pair["x"], str(x))
    hass.states.async_set(pair["y"], str(y))


async def _rename_zone(hass, device_id: str, name: str) -> None:
    await _update_zone(hass, {"device_id": device_id, "zone_id": 1, "name": name})


async def test_service_creates_zone_entities(hass, init_integration, device_id) -> None:
    """A zone drawn through the service produces both entities and stored data."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)

    sensor_id, presence_id = _zone_entity_ids(hass, device_id)
    assert hass.states.get(sensor_id).state == "1"
    assert hass.states.get(presence_id).state == "off"
    assert get_store(hass).device(device_id)[STORE_ENTITIES] == TRACKED


async def test_zone_update_fires_the_public_event(
    hass, init_integration, device_id
) -> None:
    """The bus event is API surface, and it identifies the radar by device id."""
    _ = init_integration
    events = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)

    await _create_rect_zone(hass, device_id)

    assert [event.data for event in events] == [{"device_id": device_id}]


async def test_rotation_only_update_is_stored(
    hass, init_integration, device_id
) -> None:
    """A rotation update carries no geometry and must not clear the zone."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    device = get_store(hass).device(device_id)
    assert device[ATTR_ROTATION_DEG] == 90
    assert device[STORE_ZONES][1]["shape"] == "rect"


async def test_delete_zone_removes_entities_and_store(
    hass, init_integration, device_id
) -> None:
    """Deleting a zone removes both entities and the stored definition."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, "delete": True},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert _zone_entity_ids(hass, device_id) == (None, None)
    assert get_store(hass).device(device_id)[STORE_ZONES] == {}


async def test_zone_recreated_after_delete(hass, init_integration, device_id) -> None:
    """A re-created zone id gets fresh entities (tracker must not go stale)."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, "delete": True},
        blocking=True,
    )
    await hass.async_block_till_done()

    await _create_rect_zone(hass, device_id)
    assert _zone_entity_ids(hass, device_id)[0] is not None


async def test_zone_persists_to_storage(
    hass, init_integration, device_id, hass_storage
) -> None:
    """Unload flushes zones to .storage/apollo_mmwave.zones."""
    await _create_rect_zone(hass, device_id)

    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()

    stored = hass_storage[f"{DOMAIN}.zones"]["data"]
    assert stored[STORE_DEVICES][device_id][STORE_ZONES]["1"]["shape"] == "rect"


async def test_removing_the_entry_deletes_the_zone_store(
    hass, init_integration, device_id, hass_storage
) -> None:
    """Deleting the integration deletes .storage/apollo_mmwave.zones with it."""
    await _create_rect_zone(hass, device_id)
    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()
    assert f"{DOMAIN}.zones" in hass_storage

    await hass.config_entries.async_remove(init_integration.entry_id)
    await hass.async_block_till_done()
    assert f"{DOMAIN}.zones" not in hass_storage

    # Adding the integration again starts from an empty store.
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_CREATE_DASHBOARD: False}
    )
    await hass.async_block_till_done()
    assert get_store(hass).devices == {}


async def test_zones_reload_from_storage(
    hass, config_entry, esphome_device, hass_storage
) -> None:
    """A fresh setup reads zones straight from the store (no restore states)."""
    hass_storage[f"{DOMAIN}.zones"] = {
        "version": 2,
        "data": {
            STORE_DEVICES: {
                esphome_device.id: {
                    STORE_ZONES: {
                        "2": {
                            "shape": "rect",
                            "data": {
                                "x_min": 0,
                                "x_max": 10,
                                "y_min": 0,
                                "y_max": 10,
                            },
                        }
                    },
                    STORE_ENTITIES: TRACKED,
                }
            },
            STORE_ORPHANS: {},
        },
    }
    await setup_integration(hass, config_entry)

    sensor_id = er.async_get(hass).async_get_entity_id(
        "sensor", DOMAIN, f"{esphome_device.id}_zone_2"
    )
    assert sensor_id is not None
    assert hass.states.get(sensor_id).attributes["shape"] == "rect"


async def test_empty_entities_list_does_not_wipe_saved_pairs(
    hass, init_integration, device_id
) -> None:
    """A zone edit from a card that has not loaded its pairs must not erase them."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "rect",
            "data": {"x_min": 0, "x_max": 10, "y_min": 0, "y_max": 10},
            "entities": [],
        },
        blocking=True,
    )
    await hass.async_block_till_done()

    assert get_store(hass).device(device_id)[STORE_ENTITIES] == TRACKED


async def test_clear_entities_flag_explicitly_empties_the_list(
    hass, init_integration, device_id
) -> None:
    """`clear_entities` is the only way to write an explicit empty list."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "clear_entities": True},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert get_store(hass).device(device_id)[STORE_ENTITIES] == []


async def test_call_without_entities_never_seeds_the_key(
    hass, init_integration, device_id
) -> None:
    """Absent must stay absent, or the LD2450 presence fallback switches off."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert STORE_ENTITIES not in get_store(hass).device(device_id)


async def test_deprecated_location_resolves_through_the_stored_label(
    hass, init_integration, device_id
) -> None:
    """Automations written against the v1 `location` field keep working."""
    _ = init_integration
    get_store(hass).device(device_id)[STORE_LABEL] = "Apollo R_PRO-1 abc123"

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"location": "apollo r_pro-1 abc123", ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert get_store(hass).device(device_id)[ATTR_ROTATION_DEG] == 90


async def test_location_alias_resolves_every_merged_v1_name(
    hass, config_entry, hass_storage, esphome_device
) -> None:
    """Either name a rename left behind still reaches the radar."""
    # Both v1 locations tracked this radar's sensors, so they merged onto it and
    # only the first became the label. An automation may use either name.
    hass_storage[ZONE_STORAGE_KEY] = {
        "version": 1,
        "data": {
            "locations": {
                "Kitchen": {
                    "zones": {"1": {"shape": "rect", "data": {}}},
                    "entities": TRACKED,
                },
                "Den": {
                    "zones": {"2": {"shape": "rect", "data": {}}},
                    "entities": TRACKED,
                },
            }
        },
    }
    await setup_integration(hass, config_entry)

    await _update_zone(hass, {"location": "den", ATTR_ROTATION_DEG: 45})

    assert get_store(hass).devices[esphome_device.id].get(ATTR_ROTATION_DEG) == 45


async def test_unresolvable_location_writes_nothing(
    hass, init_integration, device_id
) -> None:
    """An unknown label must not invent a device entry the store never had."""
    _ = init_integration
    store = get_store(hass)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"location": "Some Room That Never Existed", ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert "Some Room That Never Existed" not in store.devices
    assert store.devices.get(device_id, {}).get(ATTR_ROTATION_DEG) is None


async def test_unknown_device_id_writes_nothing(hass, init_integration) -> None:
    """A stale or copy-pasted device id must not fabricate a phantom store entry."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": "totally-bogus-device-id", ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert "totally-bogus-device-id" not in get_store(hass).devices


async def test_device_id_accepts_the_target_block_shape(
    hass, init_integration, device_id
) -> None:
    """An automation using `target:` sends device_id as a single-item list."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": [device_id], ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert get_store(hass).device(device_id)[ATTR_ROTATION_DEG] == 90


async def test_targeting_several_devices_writes_nothing(
    hass, init_integration, device_id
) -> None:
    """A zone belongs to exactly one radar, so a multi-device target is refused."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": [device_id, "another-device"], ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert get_store(hass).devices.get(device_id, {}).get(ATTR_ROTATION_DEG) is None


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(
            lambda _: {"device_id": "totally-bogus-device-id", ATTR_ROTATION_DEG: 90},
            id="unknown-device",
        ),
        pytest.param(
            lambda device: {
                "device_id": [device, "another-device"],
                ATTR_ROTATION_DEG: 90,
            },
            id="several-devices",
        ),
        pytest.param(lambda device: {"device_id": device}, id="nothing-to-change"),
        pytest.param(
            lambda device: {"device_id": device, "delete": True, ATTR_ROTATION_DEG: 45},
            id="delete-without-zone-id",
        ),
        pytest.param(
            lambda _: {
                "location": "Some Room That Never Existed",
                ATTR_ROTATION_DEG: 90,
            },
            id="unresolvable-location",
        ),
    ],
)
async def test_refused_calls_fire_no_public_event(
    hass, init_integration, device_id, payload: Callable[[str], dict[str, Any]]
) -> None:
    """Automations listen on the bus, so a call that changed nothing stays silent."""
    _ = init_integration
    events = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)

    await hass.services.async_call(
        DOMAIN, SERVICE_UPDATE_ZONE, payload(device_id), blocking=True
    )
    await hass.async_block_till_done()

    assert events == []


async def test_location_deprecation_is_warned_about_once(
    hass, init_integration, device_id, caplog
) -> None:
    """The card rotates on every drag; the deprecation must not flood the log."""
    _ = init_integration
    get_store(hass).device(device_id)[STORE_LABEL] = "Office"

    for angle in (10, 20, 30):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_ZONE,
            {"location": "Office", ATTR_ROTATION_DEG: angle},
            blocking=True,
        )
    await hass.async_block_till_done()

    assert caplog.text.count("'location' field is deprecated") == 1
    assert get_store(hass).device(device_id)[ATTR_ROTATION_DEG] == 30


async def test_location_for_a_removed_radar_writes_nothing(
    hass, init_integration, device_id, device_registry
) -> None:
    """Nothing prunes the store, so a label can outlive the radar it named."""
    _ = init_integration
    store = get_store(hass)
    store.device(device_id)[STORE_LABEL] = "Office"
    device_registry.async_remove_device(device_id)
    await hass.async_block_till_done()

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"location": "Office", ATTR_ROTATION_DEG: 90},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert store.devices.get(device_id, {}).get(ATTR_ROTATION_DEG) is None


async def test_update_zone_requires_a_target(hass, init_integration) -> None:
    """Neither `device_id` nor `location`: the schema rejects the call."""
    _ = init_integration
    with pytest.raises(vol.Invalid):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_ZONE,
            {ATTR_ROTATION_DEG: 90},
            blocking=True,
        )


async def test_update_zone_is_admin_only(
    hass, init_integration, device_id, hass_read_only_user, hass_admin_user
) -> None:
    """
    Only administrators, and automations, can change zones.

    A call rewrites the zone configuration and creates, renames and removes
    zone entities, so a user who is not an administrator is refused before
    anything is written. Automations carry no user and still run.
    """
    _ = init_integration
    rect = {
        "device_id": device_id,
        "zone_id": 1,
        "shape": "rect",
        "data": {"x_min": -1000, "x_max": 1000, "y_min": 0, "y_max": 2000},
    }
    read_only = Context(user_id=hass_read_only_user.id)

    with pytest.raises(Unauthorized):
        await hass.services.async_call(
            DOMAIN, SERVICE_UPDATE_ZONE, rect, blocking=True, context=read_only
        )
    await hass.async_block_till_done()
    assert get_store(hass).zone(device_id, 1) is None
    assert _zone_entity_ids(hass, device_id) == (None, None)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        rect,
        blocking=True,
        context=Context(user_id=hass_admin_user.id),
    )
    await hass.async_block_till_done()
    assert all(_zone_entity_ids(hass, device_id))

    # Nor can that user delete the zone and its entities.
    with pytest.raises(Unauthorized):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_ZONE,
            {"device_id": device_id, "zone_id": 1, "delete": True},
            blocking=True,
            context=read_only,
        )
    await hass.async_block_till_done()
    assert get_store(hass).zone(device_id, 1) is not None
    assert all(_zone_entity_ids(hass, device_id))


async def test_unload_removes_service(
    hass, init_integration, device_id, hass_storage, caplog
) -> None:
    """Unloading removes the service once, drops the store and flushes it."""
    assert hass.services.has_service(DOMAIN, SERVICE_UPDATE_ZONE)
    # Only a delayed save is pending, so the stored value proves the unload
    # flushed the store.
    await _update_zone(hass, {"device_id": device_id, ATTR_ROTATION_DEG: 45})

    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()
    assert not hass.services.has_service(DOMAIN, SERVICE_UPDATE_ZONE)
    assert DATA_STORE not in hass.data.get(DOMAIN, {})
    stored = hass_storage[ZONE_STORAGE_KEY]["data"]
    assert stored[STORE_DEVICES][device_id][ATTR_ROTATION_DEG] == 45
    assert "Unable to remove unknown service" not in caplog.text


async def test_failed_platform_setup_removes_service_and_store(
    hass, config_entry, esphome_device
) -> None:
    """A setup that fails after registering the service leaves neither behind."""
    _ = esphome_device
    config_entry.add_to_hass(hass)
    with patch(
        "homeassistant.config_entries.ConfigEntries.async_forward_entry_setups",
        side_effect=RuntimeError("platform setup failed"),
    ):
        assert not await hass.config_entries.async_setup(config_entry.entry_id)
        await hass.async_block_till_done()

    assert config_entry.state is ConfigEntryState.SETUP_ERROR
    assert not hass.services.has_service(DOMAIN, SERVICE_UPDATE_ZONE)
    assert DATA_STORE not in hass.data.get(DOMAIN, {})


async def test_remove_after_failed_unload_does_not_rewrite_the_store(
    hass, init_integration, device_id, hass_storage
) -> None:
    """Removing the entry cancels the live store's pending write."""
    # Schedules the store's delayed save.
    await _update_zone(hass, {"device_id": device_id, ATTR_ROTATION_DEG: 15})

    async def _remove(store: Store) -> None:
        await REAL_STORE_REMOVE(store)
        hass_storage.pop(store.key, None)

    with (
        patch.object(Store, "async_remove", _remove),
        patch("homeassistant.helpers.storage.os.unlink"),
    ):
        # Called directly, as Home Assistant does after an unload that failed:
        # the live store and its pending write are still in place.
        await async_remove_entry(hass, init_integration)
    assert ZONE_STORAGE_KEY not in hass_storage

    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=5))
    await hass.async_block_till_done()
    assert ZONE_STORAGE_KEY not in hass_storage


async def test_calibration_services_registered_and_removed_on_unload(
    hass, init_integration
) -> None:
    """The three calibration services come and go with the entry."""
    services = (
        SERVICE_CALIBRATE_GATES,
        SERVICE_CANCEL_CALIBRATION,
        SERVICE_RESTORE_GATE_THRESHOLDS,
    )
    for service in services:
        assert hass.services.has_service(DOMAIN, service)
        assert hass.services.supports_response(DOMAIN, service) == "optional"

    assert await hass.config_entries.async_unload(init_integration.entry_id)
    await hass.async_block_till_done()
    for service in services:
        assert not hass.services.has_service(DOMAIN, service)


async def test_failed_platform_unload_keeps_the_service_and_store(
    hass, init_integration
) -> None:
    """A platform that refuses to unload leaves the service and store in place."""
    store = get_store(hass)

    with patch(
        "homeassistant.config_entries.ConfigEntries.async_unload_platforms",
        return_value=False,
    ):
        assert not await hass.config_entries.async_unload(init_integration.entry_id)
        await hass.async_block_till_done()

    assert init_integration.state is ConfigEntryState.FAILED_UNLOAD
    assert hass.services.has_service(DOMAIN, SERVICE_UPDATE_ZONE)
    assert get_store(hass) is store
    # Home Assistant skips the entry's on_unload hooks after a failed unload,
    # and the calibration services are torn down by one of them.
    assert hass.services.has_service(DOMAIN, SERVICE_CALIBRATE_GATES)


# ---------------------------------------------------------------------------
# The dashboard at setup: never written. Entries from 2.2.5 and earlier.
# ---------------------------------------------------------------------------

OUR_CONFIG: dict[str, Any] = {"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}

# The dashboard 2.2.5 kept on our url path, exactly as Lovelace stores it.
LEGACY_ROW: dict[str, Any] = {
    "id": "apollo_mmwave",
    "url_path": DASHBOARD_URL_PATH,
    "title": DASHBOARD_TITLE,
    "icon": DASHBOARD_ICON,
    "show_in_sidebar": True,
    "require_admin": False,
    "mode": "storage",
}


async def _boot_lovelace_with_a_dashboard(
    hass, hass_storage, config: dict[str, Any] | None
) -> None:
    """Start Lovelace with LEGACY_ROW stored, holding ``config`` if not None."""
    hass_storage["lovelace_dashboards"] = {
        "version": 1,
        "minor_version": 1,
        "key": "lovelace_dashboards",
        "data": {"items": [dict(LEGACY_ROW)]},
    }
    if config is not None:
        key = f"lovelace.{LEGACY_ROW['id']}"
        hass_storage[key] = {"version": 1, "key": key, "data": {"config": config}}
    assert await async_setup_component(hass, "lovelace", {})


def _legacy_entry(**options: Any) -> MockConfigEntry:
    """Return an entry as 2.2.5 left it: minor version 1, the old options."""
    return MockConfigEntry(
        domain=DOMAIN,
        title="Apollo mmWave",
        data={},
        options=options,
        unique_id=DOMAIN,
    )


async def _setup_and_reload(hass, entry: MockConfigEntry) -> None:
    await setup_integration(hass, entry)
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()


async def test_setup_and_reload_never_write_our_dashboard(hass) -> None:
    """
    Setup, reload and an options change leave our dashboard exactly as it is.

    Nothing listens for option changes, so recording ownership, or any other
    options update outside the options flow, cannot set off dashboard work.
    """
    entry = await async_owned_entry(hass, **{CONF_DASHBOARD_DEVICES: ["dev1"]})

    with record_dashboard_writes(hass) as writes:
        await _setup_and_reload(hass, entry)
        hass.config_entries.async_update_entry(
            entry, options={**entry.options, CONF_DASHBOARD_DEVICES: ["dev2"]}
        )
        await hass.async_block_till_done()

    assert writes == []
    assert await async_dashboard_config(hass) == OUR_CONFIG


async def test_setup_never_recreates_a_dashboard_the_user_deleted(hass) -> None:
    """Deleting our dashboard keeps it deleted through restarts and reloads."""
    entry = await async_owned_entry(hass)
    await _dashboards_collection(hass).async_delete_item(
        entry.options[CONF_DASHBOARD_ID]
    )
    await hass.async_block_till_done()

    with record_dashboard_writes(hass) as writes:
        await _setup_and_reload(hass, entry)

    assert writes == []
    assert rows_on_url_path(hass) == []


async def test_migration_adopts_a_2_2_5_dashboard_without_writing(
    hass, hass_storage
) -> None:
    """An auto-created dashboard from 2.2.5 is recorded as ours and untouched."""
    config = {
        "strategy": {
            "type": DASHBOARD_STRATEGY_TYPE,
            "devices": ["dev1"],
            "distance_unit": "ft",
        }
    }
    await _boot_lovelace_with_a_dashboard(hass, hass_storage, config)
    entry = _legacy_entry(
        **{CONF_AUTO_CREATE_VIEW: True, CONF_DASHBOARD_DEVICES: ["dev1"]}
    )

    with record_dashboard_writes(hass) as writes:
        await _setup_and_reload(hass, entry)

    assert writes == []
    assert entry.minor_version == ENTRY_MINOR_VERSION
    assert entry.options == {
        CONF_DASHBOARD_DEVICES: ["dev1"],
        CONF_DASHBOARD_ID: LEGACY_ROW["id"],
        CONF_DASHBOARD_URL_PATH: DASHBOARD_URL_PATH,
    }
    # Left as it is: still visible to every user, config unchanged.
    assert rows_on_url_path(hass) == [LEGACY_ROW]
    assert await async_dashboard_config(hass) == config


async def test_migration_with_no_dashboard_records_none(hass) -> None:
    """With nothing on our url path the entry owns none, and none is made."""
    assert await async_setup_component(hass, "lovelace", {})
    entry = _legacy_entry(**{CONF_AUTO_CREATE_VIEW: True})

    with record_dashboard_writes(hass) as writes:
        await _setup_and_reload(hass, entry)

    assert writes == []
    assert entry.minor_version == ENTRY_MINOR_VERSION
    assert entry.options == {CONF_DASHBOARD_ID: None, CONF_DASHBOARD_URL_PATH: None}
    assert rows_on_url_path(hass) == []


@pytest.mark.parametrize(
    ("auto_create_view", "config"),
    [
        pytest.param(False, OUR_CONFIG, id="option-off-user-strategy-dashboard"),
        pytest.param(True, {"views": [{"title": "Mine"}]}, id="taken-over"),
        pytest.param(True, {**OUR_CONFIG, "title": "Mine"}, id="more-than-strategy"),
        pytest.param(True, None, id="no-config-yet"),
    ],
)
async def test_migration_leaves_a_dashboard_that_is_not_ours(
    hass, hass_storage, auto_create_view, config
) -> None:
    """
    Only our own unchanged strategy dashboard is adopted; others survive as is.

    With the option off, 2.2.5 deleted a strategy dashboard on our url path
    at every start, even one the user built by hand (X03). Now it is neither
    adopted nor deleted, and setup writes nothing.
    """
    await _boot_lovelace_with_a_dashboard(hass, hass_storage, config)
    entry = _legacy_entry(**{CONF_AUTO_CREATE_VIEW: auto_create_view})

    with record_dashboard_writes(hass) as writes:
        await _setup_and_reload(hass, entry)
        await hass.config_entries.async_remove(entry.entry_id)
        await hass.async_block_till_done()

    assert writes == []
    assert entry.options == {CONF_DASHBOARD_ID: None, CONF_DASHBOARD_URL_PATH: None}
    assert rows_on_url_path(hass) == [LEGACY_ROW]
    assert await async_dashboard_config(hass) == config


async def test_migration_without_the_dashboards_collection_tries_again(
    hass, hass_storage, caplog
) -> None:
    """
    An unreachable collection records nothing, and a later start adopts.

    Not being able to read the dashboards is not the same as there being no
    dashboard, so the entry keeps minor version 1 and the old option, and
    still sets up.
    """
    await _boot_lovelace_with_a_dashboard(hass, hass_storage, OUR_CONFIG)
    entry = _legacy_entry(**{CONF_AUTO_CREATE_VIEW: True})

    with patch.object(apollo_frontend, "_dashboards_collection", return_value=None):
        await setup_integration(hass, entry)

    assert entry.state is ConfigEntryState.LOADED
    assert entry.minor_version == 1
    assert entry.options == {CONF_AUTO_CREATE_VIEW: True}
    [warning] = apollo_warnings(caplog)
    assert "is not tracked yet" in warning
    assert "looks for it again at the next start" in warning

    with record_dashboard_writes(hass) as writes:
        assert await hass.config_entries.async_reload(entry.entry_id)
        await hass.async_block_till_done()

    assert writes == []
    assert entry.minor_version == ENTRY_MINOR_VERSION
    assert entry.options == {
        CONF_DASHBOARD_ID: LEGACY_ROW["id"],
        CONF_DASHBOARD_URL_PATH: DASHBOARD_URL_PATH,
    }
    assert rows_on_url_path(hass) == [LEGACY_ROW]
    assert await async_dashboard_config(hass) == OUR_CONFIG


async def test_migration_that_raises_records_nothing(
    hass, hass_storage, caplog
) -> None:
    """A lookup that fails is unknown too: no record, and setup goes ahead."""
    await _boot_lovelace_with_a_dashboard(hass, hass_storage, OUR_CONFIG)
    entry = _legacy_entry(**{CONF_AUTO_CREATE_VIEW: True})

    with patch.object(
        apollo_frontend, "_row_on_url_path", side_effect=RuntimeError("boom")
    ):
        await setup_integration(hass, entry)

    assert entry.state is ConfigEntryState.LOADED
    assert entry.minor_version == 1
    assert entry.options == {CONF_AUTO_CREATE_VIEW: True}
    [warning] = apollo_warnings(caplog)
    assert "could not read the dashboards" in warning


async def test_options_saved_before_adoption_keep_the_entry_unrecorded(
    hass, hass_storage
) -> None:
    """
    Saving options before the migration could read the dashboards records none.

    The options flow forgets only a dashboard the entry recorded. Writing
    "none" for an entry with no record would stop the next start adopting
    the old dashboard.
    """
    await _boot_lovelace_with_a_dashboard(hass, hass_storage, OUR_CONFIG)
    entry = _legacy_entry(**{CONF_AUTO_CREATE_VIEW: True})
    with patch.object(apollo_frontend, "_dashboards_collection", return_value=None):
        await setup_integration(hass, entry)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "dashboard_devices"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_DASHBOARD_DEVICES: ["dev1"]}
    )
    assert entry.options == {
        CONF_AUTO_CREATE_VIEW: True,
        CONF_DASHBOARD_DEVICES: ["dev1"],
    }

    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.minor_version == ENTRY_MINOR_VERSION
    assert entry.options == {
        CONF_DASHBOARD_DEVICES: ["dev1"],
        CONF_DASHBOARD_ID: LEGACY_ROW["id"],
        CONF_DASHBOARD_URL_PATH: DASHBOARD_URL_PATH,
    }
    assert await async_dashboard_config(hass) == OUR_CONFIG


async def test_call_with_nothing_to_change_mints_no_store_entry(
    hass, init_integration, device_id, caplog
) -> None:
    """A device_id alone must not create a permanent empty store entry."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN, SERVICE_UPDATE_ZONE, {"device_id": device_id}, blocking=True
    )
    await hass.async_block_till_done()

    assert device_id not in get_store(hass).devices
    assert "carried nothing to change" in caplog.text


async def test_delete_without_zone_id_changes_nothing(
    hass, init_integration, device_id, caplog
) -> None:
    """`delete: true` with no zone_id is refused instead of reinterpreted."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "delete": True, "rotation_deg": 45},
        blocking=True,
    )
    await hass.async_block_till_done()

    assert device_id not in get_store(hass).devices
    assert "without a zone_id" in caplog.text


RECT = {"x_min": -1000, "x_max": 1000, "y_min": 0, "y_max": 2000}


async def test_zone_id_alone_mints_no_store_entry(
    hass, init_integration, device_id, caplog
) -> None:
    """A zone_id with nothing to do to the zone is refused like a bare device_id."""
    _ = init_integration
    events = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)

    await _update_zone(hass, {"device_id": device_id, "zone_id": 1})

    assert device_id not in get_store(hass).devices
    assert events == []
    assert "carried nothing to change" in caplog.text


async def test_zone_id_with_data_but_no_shape_mints_nothing(
    hass, init_integration, device_id, caplog
) -> None:
    """Data without a shape is ignored, so the call must not count as a change."""
    _ = init_integration
    events = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)

    await _update_zone(hass, {"device_id": device_id, "zone_id": 1, "data": RECT})

    assert device_id not in get_store(hass).devices
    assert events == []
    assert "without a shape" in caplog.text
    assert "carried nothing to change" in caplog.text


async def test_rename_unknown_zone_warns(
    hass, init_integration, device_id, caplog
) -> None:
    """Renaming a zone that was never stored is reported and changes nothing."""
    _ = init_integration
    events = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)

    await _update_zone(hass, {"device_id": device_id, "zone_id": 7, "name": "Couch"})

    assert device_id not in get_store(hass).devices
    assert events == []
    assert "does not exist" in caplog.text


async def test_rename_unknown_zone_with_rotation_still_applies_rotation(
    hass, init_integration, device_id, caplog
) -> None:
    """A missing-zone rename must not drop the device-wide part of the call."""
    _ = init_integration
    events = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)

    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 7,
            "name": "Couch",
            ATTR_ROTATION_DEG: 90,
        },
    )

    device = get_store(hass).devices[device_id]
    assert device[ATTR_ROTATION_DEG] == 90
    assert 7 not in device[STORE_ZONES]
    assert len(events) == 1
    assert "does not exist" in caplog.text


async def test_geometry_without_zone_id_warns(
    hass, init_integration, device_id, caplog
) -> None:
    """Geometry with no zone_id is named as ignored, with or without other fields."""
    _ = init_integration
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "shape": "rect",
            "data": RECT,
            ATTR_ROTATION_DEG: 10,
        },
    )

    device = get_store(hass).devices[device_id]
    assert device[ATTR_ROTATION_DEG] == 10
    assert device[STORE_ZONES] == {}
    assert "geometry without a zone_id" in caplog.text


async def test_geometry_without_zone_id_alone_is_refused(
    hass, init_integration, device_id, caplog
) -> None:
    """Geometry with no zone_id and nothing else writes no store entry."""
    _ = init_integration
    await _update_zone(hass, {"device_id": device_id, "shape": "rect", "data": RECT})

    assert device_id not in get_store(hass).devices
    assert "geometry without a zone_id" in caplog.text
    assert "carried nothing to change" in caplog.text


async def test_shape_none_clears_zone_geometry(
    hass, init_integration, device_id
) -> None:
    """`shape: none` is the documented way to clear a zone, and it works."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)

    await _update_zone(hass, {"device_id": device_id, "zone_id": 1, "shape": "none"})

    zone = get_store(hass).devices[device_id][STORE_ZONES][1]
    assert zone == {"shape": "none", "data": None}


async def test_data_null_without_shape_keeps_geometry(
    hass, init_integration, device_id, caplog
) -> None:
    """`data: null` without a shape is not a clear, and is refused as a no-op."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    events = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)

    await _update_zone(hass, {"device_id": device_id, "zone_id": 1, "data": None})

    zone = get_store(hass).devices[device_id][STORE_ZONES][1]
    assert zone == {"shape": "rect", "data": RECT}
    assert events == []
    assert "carried nothing to change" in caplog.text


async def test_zone_rename_updates_generated_names_only(
    hass, init_integration, device_id
) -> None:
    """A name the user typed in the entity settings dialog survives a rename."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    registry = er.async_get(hass)
    sensor_eid, presence_eid = _zone_entity_ids(hass, device_id)
    assert sensor_eid
    assert presence_eid

    async def rename(name: str) -> None:
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_ZONE,
            {"device_id": device_id, "zone_id": 1, "name": name},
            blocking=True,
        )
        await hass.async_block_till_done()

    # Nothing typed yet: both names are ours to write.
    await rename("Couch")
    assert registry.async_get(sensor_eid).name == "Zone 1 - Couch"
    assert registry.async_get(presence_eid).name == "Zone 1 presence - Couch"

    # The user renames the presence entity by hand, then renames the zone.
    registry.async_update_entity(presence_eid, name="Kitchen door")
    await rename("Sofa")
    assert registry.async_get(sensor_eid).name == "Zone 1 - Sofa"
    assert registry.async_get(presence_eid).name == "Kitchen door"


@pytest.mark.parametrize("angle", [float("inf"), float("-inf"), "inf", float("nan")])
async def test_rotation_inf_is_ignored(
    hass, init_integration, device_id, caplog, angle
) -> None:
    """An infinite angle is ignored like nan instead of raising OverflowError."""
    _ = init_integration
    await _update_zone(hass, {"device_id": device_id, ATTR_ROTATION_DEG: angle})

    assert device_id not in get_store(hass).devices
    assert "carried nothing to change" in caplog.text


@pytest.mark.parametrize(
    ("angle", "stored"),
    [
        (270.4, 180),
        (450, 180),
        (-12.6, -13),
        (-200, -180),
        (15.6, 16),
        ("90", 90),
        (1e20, 180),
    ],
)
async def test_finite_rotation_still_clamps(
    hass, init_integration, device_id, angle, stored
) -> None:
    """Finite angles are still rounded and clamped, however large."""
    _ = init_integration
    await _update_zone(hass, {"device_id": device_id, ATTR_ROTATION_DEG: angle})

    assert get_store(hass).device(device_id)[ATTR_ROTATION_DEG] == stored


async def test_rect_with_infinite_bound_is_cleared(
    hass, init_integration, device_id, caplog
) -> None:
    """A non-finite bound clears the zone, and the rest of the call still lands."""
    _ = init_integration
    events = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)

    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "rect",
            "data": {
                "x_min": float("inf"),
                "x_max": 1000,
                "y_min": 0,
                "y_max": 2000,
            },
            ATTR_ROTATION_DEG: 45,
            "entities": TRACKED,
        },
    )

    device = get_store(hass).device(device_id)
    assert device[STORE_ZONES][1] == {"shape": "rect", "data": None}
    # These used to be written to memory and then stranded by the exception,
    # with no save scheduled and no signal sent.
    assert device[ATTR_ROTATION_DEG] == 45
    assert device[STORE_ENTITIES] == TRACKED
    assert "non-numeric bounds" in caplog.text
    assert len(events) == 1


async def test_ellipse_with_nan_center_is_cleared(
    hass, init_integration, device_id, caplog
) -> None:
    """A nan center clears the ellipse instead of raising ValueError."""
    _ = init_integration
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "ellipse",
            "data": {"cx": float("nan"), "cy": 1000, "rx": 500, "ry": 500},
        },
    )

    zone = get_store(hass).device(device_id)[STORE_ZONES][1]
    assert zone == {"shape": "ellipse", "data": None}
    assert "has invalid radii" in caplog.text


async def test_polygon_point_with_infinite_coordinate_is_dropped(
    hass, init_integration, device_id
) -> None:
    """Only the bad point goes; the polygon keeps the rest of its points."""
    _ = init_integration
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "polygon",
            "data": {
                "points": [
                    {"x": 0, "y": 0},
                    {"x": float("inf"), "y": 500},
                    {"x": 1000, "y": 0},
                    {"x": 500, "y": 1000},
                ]
            },
        },
    )

    zone = get_store(hass).device(device_id)[STORE_ZONES][1]
    assert zone["data"]["points"] == [
        {"x": 0, "y": 0},
        {"x": 1000, "y": 0},
        {"x": 500, "y": 1000},
    ]


@pytest.mark.parametrize(
    "case",
    [
        (
            "rect",
            {"x_min": "left", "x_max": 1000, "y_min": 0, "y_max": 2000},
            WARN_RECT_NON_NUM,
            (),
        ),
        (
            "rect",
            {"x_min": 1000, "x_max": -1000, "y_min": 0, "y_max": 2000},
            WARN_RECT_INVALID,
            (),
        ),
        (
            "ellipse",
            {"cx": 0, "cy": 1000, "rx": 0, "ry": 500},
            WARN_ELLIPSE_NON_POSITIVE,
            (),
        ),
        (
            "ellipse",
            {"cx": 0, "cy": 1000, "rx": 500, "ry": -500},
            WARN_ELLIPSE_NON_POSITIVE,
            (),
        ),
        (
            "ellipse",
            {"cx": 0, "cy": 1000, "rx": "wide", "ry": 500},
            WARN_ELLIPSE_INVALID,
            (),
        ),
        (
            "ellipse",
            {"cx": 0, "cy": 1000, "rx": 500},
            WARN_ELLIPSE_INVALID,
            (),
        ),
        (
            "polygon",
            {"points": [{"x": 0, "y": 0}, {"x": 1000, "y": 0}]},
            WARN_POLY_INSUFFICIENT,
            (POLYGON_MIN_POINTS,),
        ),
        # The natural YAML spelling: four points, but none of them is an
        # {x, y} object, so the log must not claim too few were sent.
        (
            "polygon",
            {"points": [[0, 0], [1000, 0], [1000, 1000], [0, 1000]]},
            WARN_POLY_MALFORMED,
            (4, 0, POLYGON_MIN_POINTS),
        ),
    ],
    ids=[
        "rect_non_numeric",
        "rect_invalid",
        "ellipse_non_positive",
        "ellipse_negative",
        "ellipse_invalid",
        "ellipse_missing_radius",
        "polygon_insufficient",
        "polygon_list_points",
    ],
)
@pytest.mark.usefixtures("init_integration")
async def test_rejected_geometry_warning_names_the_device_and_cause(
    hass, device_id, caplog, case
) -> None:
    """Each geometry rejection names the radar's device id and the real cause."""
    shape, data, template, extra_args = case
    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, "shape": shape, "data": data}
    )

    zone = get_store(hass).device(device_id)[STORE_ZONES][1]
    assert zone == {"shape": shape, "data": None}
    expected = template % (1, device_id, *extra_args)
    assert expected in caplog.messages
    assert f"zone 1 on device '{device_id}'" in expected
    assert "in location" not in caplog.text


async def test_polygon_insufficient_warning_text_is_unchanged(
    hass, init_integration, device_id, caplog
) -> None:
    """The limit is now a template argument; the emitted text stays the same."""
    _ = init_integration
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "polygon",
            "data": {"points": [{"x": 0, "y": 0}]},
        },
    )

    assert (
        f"Polygon zone 1 on device '{device_id}' has insufficient points (<3);"
        " clearing zone."
    ) in caplog.messages


@pytest.mark.parametrize("total", [POLYGON_MAX_POINTS + 1, 40])
async def test_polygon_truncation_warning_names_the_device(
    hass, init_integration, device_id, caplog, total
) -> None:
    """Too many points are truncated, and the warning says by how much."""
    _ = init_integration
    points = [{"x": i, "y": i * i} for i in range(total)]
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "polygon",
            "data": {"points": points},
        },
    )

    zone = get_store(hass).device(device_id)[STORE_ZONES][1]
    assert zone["data"]["points"] == points[:POLYGON_MAX_POINTS]
    expected = WARN_POLY_TRUNCATING % (1, device_id, total, POLYGON_MAX_POINTS)
    assert expected in caplog.messages


async def test_unknown_shape_is_rejected_by_schema(
    hass, init_integration, device_id
) -> None:
    """The schema is the only guard against an unknown shape, and it holds."""
    _ = init_integration
    call = {"device_id": device_id, "zone_id": 1, "shape": "triangle", "data": RECT}
    with pytest.raises(vol.Invalid):
        UPDATE_ZONE_SERVICE_SCHEMA(call)
    with pytest.raises(vol.Invalid):
        await hass.services.async_call(DOMAIN, SERVICE_UPDATE_ZONE, call, blocking=True)
    await hass.async_block_till_done()

    assert device_id not in get_store(hass).devices


@pytest.mark.parametrize(
    "case",
    [(1, {}), (1, {"data": None}), (2, {}), (2, {"data": None})],
    ids=[
        "existing_zone_data_omitted",
        "existing_zone_data_null",
        "new_zone_data_omitted",
        "new_zone_data_null",
    ],
)
@pytest.mark.usefixtures("init_integration")
async def test_drawable_shape_without_data_warns(hass, device_id, caplog, case) -> None:
    """A drawable shape with no data is stored without geometry, and says so."""
    zone_id, extra = case
    await _create_rect_zone(hass, device_id)
    caplog.clear()

    await _update_zone(
        hass, {"device_id": device_id, "zone_id": zone_id, "shape": "rect", **extra}
    )

    zone = get_store(hass).device(device_id)[STORE_ZONES][zone_id]
    assert zone == {"shape": "rect", "data": None}
    assert WARN_ZONE_NO_GEOMETRY % (zone_id, device_id, "rect") in caplog.messages


@pytest.mark.parametrize(
    "extra", [{}, {"data": None}], ids=["data_omitted", "data_null"]
)
async def test_shape_none_without_data_does_not_warn(
    hass, init_integration, device_id, caplog, extra
) -> None:
    """`shape: none` is the documented clear, so it logs nothing."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    caplog.clear()

    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, "shape": "none", **extra}
    )

    zone = get_store(hass).device(device_id)[STORE_ZONES][1]
    assert zone == {"shape": "none", "data": None}
    assert "no geometry" not in caplog.text


@pytest.mark.parametrize(
    "case",
    [
        (
            "rect",
            {"x_min": 0, "x_max": 1e20, "y_min": 0, "y_max": 10},
            "non-numeric bounds",
        ),
        (
            "rect",
            {"x_min": -1e19, "x_max": 10, "y_min": 0, "y_max": 10},
            "non-numeric bounds",
        ),
        # YAML keeps a long integer literal as an int, not a float.
        (
            "rect",
            {"x_min": 0, "x_max": 10**20, "y_min": 0, "y_max": 10},
            "non-numeric bounds",
        ),
        # Too large for a float at all: float() itself raises OverflowError.
        (
            "rect",
            {"x_min": 0, "x_max": 10, "y_min": 0, "y_max": 10**400},
            "non-numeric bounds",
        ),
        ("ellipse", {"cx": 0, "cy": 1000, "rx": 500, "ry": 1e25}, "invalid radii"),
        (
            "polygon",
            {"points": [{"x": 0, "y": 0}, {"x": 1e30, "y": 0}, {"x": 0, "y": 10}]},
            "has 3 points but only 2 are valid",
        ),
    ],
    ids=[
        "rect_x_max_1e20",
        "rect_x_min_neg_1e19",
        "rect_int_10e20",
        "rect_int_10e400",
        "ellipse_ry_1e25",
        "polygon_x_1e30",
    ],
)
@pytest.mark.usefixtures("init_integration")
async def test_out_of_range_geometry_is_rejected(
    hass, hass_ws_client, device_id, caplog, case
) -> None:
    """A value past 64 bits would make every later store write fail."""
    shape, data, warning = case
    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, "shape": shape, "data": data}
    )

    store = get_store(hass)
    assert store.device(device_id)[STORE_ZONES][1] == {"shape": shape, "data": None}
    assert warning in caplog.text
    # The same serializer Home Assistant writes the store with.
    json_bytes(store._data_to_save())  # noqa: SLF001

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "apollo_mmwave/zones/get", "device_id": device_id}
    )
    msg = await client.receive_json()
    assert msg["success"]
    assert msg["result"]["zones"]["1"]["data"] is None


@pytest.mark.parametrize(
    "case",
    [
        (
            "rect",
            {"x_min": 0, "x_max": 100, "y_min": 0, "y_max": 50},
            {"x_min": 0, "x_max": 100, "y_min": 0, "y_max": 50},
        ),
        (
            "polygon",
            {"points": [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 0, "y": 10}]},
            {"points": [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 0, "y": 10}]},
        ),
    ],
    ids=["rect", "polygon"],
)
@pytest.mark.usefixtures("init_integration")
async def test_extra_data_keys_are_dropped(
    hass, hass_ws_client, device_id, case
) -> None:
    """Extra keys in data are not stored, so they cannot break the store."""
    shape, data, expected = case
    # An int past 64 bits in an extra key used to be stored verbatim and made
    # every later store write fail, the failure the geometry bound prevents.
    noisy = {**data, "note": 10**20, "color": "red"}
    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, "shape": shape, "data": noisy}
    )

    store = get_store(hass)
    assert store.device(device_id)[STORE_ZONES][1] == {
        "shape": shape,
        "data": expected,
    }
    json_bytes(store._data_to_save())  # noqa: SLF001

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "apollo_mmwave/zones/get", "device_id": device_id}
    )
    msg = await client.receive_json()
    assert msg["success"]
    assert msg["result"]["zones"]["1"]["data"] == expected


async def test_geometry_at_the_safe_bound_is_kept(
    hass, init_integration, device_id
) -> None:
    """The bound rejects only what cannot be stored; the limit itself is kept."""
    _ = init_integration
    data = {
        "x_min": -MAX_SAFE_INT,
        "x_max": MAX_SAFE_INT,
        "y_min": -MAX_SAFE_INT,
        "y_max": MAX_SAFE_INT,
    }
    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, "shape": "rect", "data": data}
    )

    store = get_store(hass)
    assert store.device(device_id)[STORE_ZONES][1] == {"shape": "rect", "data": data}
    json_bytes(store._data_to_save())  # noqa: SLF001


async def test_zone_id_zero_is_rejected(hass, init_integration, device_id) -> None:
    """Ids start at 1: the card cannot edit, rename or delete a zone 0."""
    _ = init_integration
    with pytest.raises(vol.Invalid):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_ZONE,
            {
                "device_id": device_id,
                "zone_id": 0,
                "shape": "rect",
                "data": {"x_min": -1000, "x_max": 1000, "y_min": 0, "y_max": 2000},
            },
            blocking=True,
        )
    await hass.async_block_till_done()

    assert 0 not in get_store(hass).devices.get(device_id, {}).get(STORE_ZONES, {})
    registry = er.async_get(hass)
    assert registry.async_get_entity_id("sensor", DOMAIN, f"{device_id}_zone_0") is None
    assert (
        registry.async_get_entity_id(
            "binary_sensor", DOMAIN, f"{device_id}_zone_0_presence"
        )
        is None
    )


@pytest.mark.parametrize(
    ("zone_id", "expected"), [(1, 1), ("1", 1), (MAX_SAFE_INT, MAX_SAFE_INT)]
)
def test_zone_id_bounds_accept(zone_id, expected) -> None:
    """Every id from 1 to the serialization limit is accepted."""
    validated = UPDATE_ZONE_SERVICE_SCHEMA({"device_id": "abc", "zone_id": zone_id})
    assert validated["zone_id"] == expected


@pytest.mark.parametrize("unit", ["m", "ft", "auto"])
def test_display_units_schema_accepts(unit) -> None:
    """The map unit takes m, ft, and auto to forget the saved one."""
    validated = UPDATE_ZONE_SERVICE_SCHEMA({"device_id": "abc", "display_units": unit})
    assert validated["display_units"] == unit


@pytest.mark.parametrize("unit", ["mm", "in", "yd", "M", "feet", "", 1])
def test_display_units_schema_rejects(unit) -> None:
    """Only the two map units the card shows, never a target sensor unit."""
    with pytest.raises(vol.Invalid):
        UPDATE_ZONE_SERVICE_SCHEMA({"device_id": "abc", "display_units": unit})


@pytest.mark.parametrize("zone_id", [0, 2**53, 2**64, 18446744073709551616.0])
def test_zone_id_bounds_reject(zone_id) -> None:
    """0 and anything past the serialization limit fail validation."""
    # 18446744073709551616.0 is how a 2**64 JSON literal reaches the websocket.
    with pytest.raises(vol.Invalid):
        UPDATE_ZONE_SERVICE_SCHEMA({"device_id": "abc", "zone_id": zone_id})


@pytest.mark.parametrize(
    "case",
    [
        (
            {"x_min": "left", "x_max": 1000, "y_min": 0, "y_max": 2000},
            WARN_RECT_NON_NUM,
        ),
        ({"x_min": -1000, "x_max": 1000, "y_min": 0}, WARN_RECT_NON_NUM),
        ({"x_min": 1000, "x_max": -1000, "y_min": 0, "y_max": 2000}, WARN_RECT_INVALID),
        ({"x_min": -1000, "x_max": 1000, "y_min": 2000, "y_max": 0}, WARN_RECT_INVALID),
        ({"x_min": 500, "x_max": 500, "y_min": 0, "y_max": 2000}, WARN_RECT_INVALID),
        (
            {"x_min": -1000, "x_max": 1000, "y_min": 700, "y_max": 700},
            WARN_RECT_INVALID,
        ),
        # Both bounds round to 0 mm, so the span is zero once stored.
        ({"x_min": 0.2, "x_max": 0.4, "y_min": 0, "y_max": 2000}, WARN_RECT_INVALID),
    ],
    ids=[
        "non_numeric",
        "missing_bound",
        "inverted_x",
        "inverted_y",
        "zero_width",
        "zero_height",
        "sub_mm_width",
    ],
)
@pytest.mark.usefixtures("init_integration")
async def test_invalid_rect_bounds_clear_the_geometry_but_keep_the_zone(
    hass, device_id, caplog, case
) -> None:
    """A rejected rectangle drops its geometry; the zone, pairs and entities stay."""
    data, template = case
    await _create_rect_zone(hass, device_id)
    sensor_id, presence_id = _zone_entity_ids(hass, device_id)
    _set_target(hass, TRACKED[0], 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, "shape": "rect", "data": data}
    )

    device = get_store(hass).device(device_id)
    zone = device[STORE_ZONES][1]
    assert zone["data"] is None
    # Records current behavior rather than a contract: the zone keeps shape
    # "rect" with no geometry instead of becoming "none".
    assert zone["shape"] == "rect"
    assert device[STORE_ENTITIES] == TRACKED
    assert template % (1, device_id) in caplog.messages
    assert _zone_entity_ids(hass, device_id) == (sensor_id, presence_id)
    attributes = hass.states.get(sensor_id).attributes
    assert attributes["shape"] == "rect"
    assert attributes["data"] is None
    assert hass.states.get(presence_id).state == "off"


async def test_rect_bounds_are_rounded_to_whole_mm(
    hass, init_integration, device_id
) -> None:
    """Fractional rectangle bounds are stored as whole millimeters."""
    _ = init_integration
    data = {"x_min": -1000.4, "x_max": 999.6, "y_min": 0.3, "y_max": 2000.7}
    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, "shape": "rect", "data": data}
    )

    stored = get_store(hass).device(device_id)[STORE_ZONES][1]["data"]
    bounds = {key: stored[key] for key in ("x_min", "x_max", "y_min", "y_max")}
    assert bounds == {"x_min": -1000, "x_max": 1000, "y_min": 0, "y_max": 2001}
    assert all(type(value) is int for value in bounds.values())


async def test_ellipse_radii_are_rounded_and_floored_at_1mm(
    hass, init_integration, device_id
) -> None:
    """A positive radius under half a millimeter is kept as 1 mm, not 0."""
    _ = init_integration
    data = {"cx": 10.4, "cy": 999.6, "rx": 0.2, "ry": 2.6}
    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, "shape": "ellipse", "data": data}
    )

    zone = get_store(hass).device(device_id)[STORE_ZONES][1]
    assert zone == {
        "shape": "ellipse",
        "data": {"cx": 10, "cy": 1000, "rx": 1, "ry": 3},
    }


async def test_polygon_malformed_points_are_dropped(
    hass, init_integration, device_id, caplog
) -> None:
    """Points that are not {x, y} numbers go; the valid ones keep their order."""
    _ = init_integration
    points = [
        {"x": 0, "y": 0},
        [500, 500],
        {"x": 1000.4, "y": 0},
        {"x": "abc", "y": 1},
        {"x": 1000, "y": 999.6},
        {"y": 3},
        None,
        {"x": 0, "y": 1000},
    ]
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "polygon",
            "data": {"points": points},
        },
    )

    zone = get_store(hass).device(device_id)[STORE_ZONES][1]
    assert zone["shape"] == "polygon"
    assert zone["data"]["points"] == [
        {"x": 0, "y": 0},
        {"x": 1000, "y": 0},
        {"x": 1000, "y": 1000},
        {"x": 0, "y": 1000},
    ]
    assert "clearing zone" not in caplog.text


@pytest.mark.parametrize(
    "extra", [{}, {"input_units": "mm"}], ids=["service_call", "card_payload"]
)
async def test_add_zone_protocol_creates_a_named_empty_zone(
    hass, init_integration, device_id, extra
) -> None:
    """The card's add-zone call stores an empty named zone and creates entities."""
    _ = init_integration
    # The payload the card's add-zone button sends; the card adds input_units
    # to every write.
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "none",
            "data": None,
            "name": "Zone 1",
            **extra,
        },
    )

    zone = get_store(hass).device(device_id)[STORE_ZONES][1]
    assert zone == {"shape": "none", "data": None, "name": "Zone 1"}
    sensor_id, presence_id = _zone_entity_ids(hass, device_id)
    assert sensor_id
    assert presence_id
    sensor = hass.states.get(sensor_id)
    assert sensor.state == "1"
    assert sensor.attributes["shape"] == "none"
    assert sensor.attributes["data"] is None
    assert sensor.attributes["name"] == "Zone 1"
    assert hass.states.get(presence_id).state == "off"


async def test_clear_entities_wins_over_entities_in_the_same_call(
    hass, init_integration, device_id
) -> None:
    """The explicit clear is never overridden by a pair list sent alongside it."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)

    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "clear_entities": True,
            "entities": [
                {
                    "x": "sensor.r_pro_ld2450_target_2_x",
                    "y": "sensor.r_pro_ld2450_target_2_y",
                }
            ],
        },
    )

    assert get_store(hass).device(device_id)[STORE_ENTITIES] == []


async def test_entity_pairs_are_reduced_to_x_and_y(
    hass, init_integration, device_id
) -> None:
    """Only the two entity ids of a pair are stored."""
    _ = init_integration
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "entities": [{**TRACKED[0], "label": "Target 1", "color": "red"}],
        },
    )

    assert get_store(hass).device(device_id)[STORE_ENTITIES] == TRACKED


@pytest.mark.parametrize(
    "update",
    [
        {
            "shape": "rect",
            "data": {"x_min": 2000, "x_max": 3000, "y_min": 0, "y_max": 500},
        },
        {"shape": "none"},
    ],
    ids=["new_geometry", "cleared"],
)
async def test_geometry_update_keeps_the_existing_zone_name(
    hass, init_integration, device_id, update
) -> None:
    """Redrawing or clearing a zone without a name keeps the one it has."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    await _rename_zone(hass, device_id, "Couch")
    registry = er.async_get(hass)
    sensor_id, presence_id = _zone_entity_ids(hass, device_id)
    _set_target(hass, TRACKED[0], 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    await _update_zone(hass, {"device_id": device_id, "zone_id": 1, **update})

    zone = get_store(hass).device(device_id)[STORE_ZONES][1]
    assert zone["shape"] == update["shape"]
    assert zone["name"] == "Couch"
    assert _zone_entity_ids(hass, device_id) == (sensor_id, presence_id)
    assert registry.async_get(sensor_id).name == "Zone 1 - Couch"
    assert registry.async_get(presence_id).name == "Zone 1 presence - Couch"
    assert hass.states.get(sensor_id).attributes["name"] == "Couch"
    # Both updates move the zone off the target, so presence follows.
    assert hass.states.get(presence_id).state == "off"


@pytest.mark.parametrize("unit", sorted(INPUT_UNIT_FACTORS))
async def test_valid_input_units_are_stored(
    hass, init_integration, device_id, unit
) -> None:
    """Every unit the presence sensor can scale by is accepted and stored."""
    _ = init_integration
    await _update_zone(hass, {"device_id": device_id, "input_units": unit})

    assert get_store(hass).device(device_id)[STORE_INPUT_UNITS] == unit


@pytest.mark.parametrize("unit", DISPLAY_UNITS)
async def test_display_units_alone_are_stored(
    hass, init_integration, device_id, unit, caplog
) -> None:
    """A call carrying only the map unit counts as a change and is stored."""
    _ = init_integration
    events = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)

    await _update_zone(hass, {"device_id": device_id, STORE_DISPLAY_UNITS: unit})

    assert get_store(hass).devices[device_id][STORE_DISPLAY_UNITS] == unit
    assert len(events) == 1
    assert "carried nothing to change" not in caplog.text


async def test_display_units_auto_forgets_the_saved_unit(
    hass, init_integration, device_id
) -> None:
    """Saving auto removes the key, so the card follows the unit system again."""
    _ = init_integration
    await _update_zone(hass, {"device_id": device_id, STORE_DISPLAY_UNITS: "ft"})
    events = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)

    await _update_zone(hass, {"device_id": device_id, STORE_DISPLAY_UNITS: "auto"})

    assert STORE_DISPLAY_UNITS not in get_store(hass).devices[device_id]
    assert len(events) == 1


async def test_display_units_auto_with_nothing_saved_changes_nothing(
    hass, init_integration, device_id, caplog
) -> None:
    """Forgetting a unit that was never saved mints no store entry."""
    _ = init_integration
    events = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)

    await _update_zone(hass, {"device_id": device_id, STORE_DISPLAY_UNITS: "auto"})

    assert device_id not in get_store(hass).devices
    assert events == []
    assert "carried nothing to change" in caplog.text


async def test_display_units_leave_zones_and_input_units_alone(
    hass, init_integration, device_id
) -> None:
    """The map unit is display only: geometry and the target unit stay as stored."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    await _update_zone(hass, {"device_id": device_id, "input_units": "cm"})
    before = dict(get_store(hass).devices[device_id][STORE_ZONES])

    await _update_zone(hass, {"device_id": device_id, STORE_DISPLAY_UNITS: "ft"})

    device = get_store(hass).devices[device_id]
    assert device[STORE_ZONES] == before
    assert device[STORE_INPUT_UNITS] == "cm"


async def test_device_id_wins_over_location(
    hass, init_integration, device_id, caplog
) -> None:
    """With both fields set, `location` is not consulted at all."""
    _ = init_integration
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "location": "Some Room That Never Existed",
            ATTR_ROTATION_DEG: 90,
        },
    )

    assert get_store(hass).device(device_id)[ATTR_ROTATION_DEG] == 90
    assert "deprecated" not in caplog.text
    assert "matches no known radar" not in caplog.text


@pytest.mark.parametrize("empty", ["", "   ", []], ids=["empty", "blank", "no_items"])
async def test_empty_device_id_writes_nothing(
    hass, init_integration, caplog, empty
) -> None:
    """An empty device_id, in any spelling the schema admits, is refused."""
    _ = init_integration
    await _update_zone(hass, {"device_id": empty, ATTR_ROTATION_DEG: 90})

    assert get_store(hass).devices == {}
    assert "empty device_id" in caplog.text


async def test_empty_name_clears_the_zone_name(
    hass, init_integration, device_id
) -> None:
    """Renaming to '' drops the name, and a later rename still applies."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    # Named in a call of its own, as the card's Save button names a stored
    # zone. A name sent with the creating call reaches the registry as well
    # (test_name_on_the_creating_call_reaches_the_registry).
    await _rename_zone(hass, device_id, "Couch")
    registry = er.async_get(hass)
    sensor_id, presence_id = _zone_entity_ids(hass, device_id)
    assert registry.async_get(sensor_id).name == "Zone 1 - Couch"

    await _rename_zone(hass, device_id, "")

    assert "name" not in hass.states.get(sensor_id).attributes
    assert registry.async_get(sensor_id).name in (None, "Zone 1")
    assert registry.async_get(presence_id).name in (None, "Zone 1 presence")

    await _rename_zone(hass, device_id, "Sofa")

    assert registry.async_get(sensor_id).name == "Zone 1 - Sofa"
    assert registry.async_get(presence_id).name == "Zone 1 presence - Sofa"


@pytest.mark.parametrize(
    "bad",
    [
        {"bogus": 1},
        {"input_units": "furlong"},
        {"display_units": "in"},
        {"display_units": "metric"},
        {"display_units": None},
        {"zone_id": 1, "shape": "triangle", "data": RECT},
        {"entities": [{"x": "not an id", "y": "sensor.b"}]},
        {"zone_id": -1},
        {"zone_id": "abc"},
    ],
    ids=[
        "unknown_key",
        "unknown_unit",
        "display_units_inches",
        "display_units_unknown",
        "display_units_null",
        "unknown_shape",
        "pair_not_an_entity_id",
        "negative_zone_id",
        "non_integer_zone_id",
    ],
)
async def test_schema_rejects_malformed_calls(
    hass, init_integration, device_id, bad
) -> None:
    """A malformed field fails the whole call, and nothing is written."""
    _ = init_integration
    # The rotation alone would be stored if the call got past the schema.
    call = {"device_id": device_id, ATTR_ROTATION_DEG: 90, **bad}
    with pytest.raises(vol.Invalid):
        await hass.services.async_call(DOMAIN, SERVICE_UPDATE_ZONE, call, blocking=True)
    await hass.async_block_till_done()

    assert device_id not in get_store(hass).devices


# ---------------------------------------------------------------------------
# Zone settings (zone_type, hold_s) and the radar flags (mirror_x,
# movement_history). A default is never stored: the key is popped instead.
# ---------------------------------------------------------------------------

MOVED = {"x_min": 0, "x_max": 500, "y_min": 0, "y_max": 500}


def _stored_zone(hass, device_id: str, zone_id: int = 1) -> dict[str, Any]:
    return get_store(hass).devices[device_id][STORE_ZONES][zone_id]


def _zone_events(hass) -> list:
    events: list = []
    hass.bus.async_listen(EVENT_ZONE_UPDATED, events.append)
    return events


async def test_hold_s_is_stored_and_zero_pops_it(
    hass, init_integration, device_id
) -> None:
    """A hold time is stored in whole seconds, and 0, the default, forgets it."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    _, presence_id = _zone_entity_ids(hass, device_id)
    events = _zone_events(hass)

    await _update_zone(hass, {"device_id": device_id, "zone_id": 1, STORE_HOLD_S: 30.9})

    zone = _stored_zone(hass, device_id)
    assert zone == {"shape": "rect", "data": RECT, "hold_s": 30}
    assert type(zone["hold_s"]) is int
    assert hass.states.get(presence_id).attributes["held"] is False
    # Like a map unit, a hold time counts even when it is the one stored.
    await _update_zone(hass, {"device_id": device_id, "zone_id": 1, STORE_HOLD_S: 30})
    assert len(events) == 2

    await _update_zone(hass, {"device_id": device_id, "zone_id": 1, STORE_HOLD_S: 0})

    assert _stored_zone(hass, device_id) == {"shape": "rect", "data": RECT}
    assert "held" not in hass.states.get(presence_id).attributes
    assert len(events) == 3


async def test_zone_settings_survive_a_redraw(
    hass, init_integration, device_id
) -> None:
    """A redraw keeps a zone's name, type and hold time; its own settings win."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    # A zone switched to ignore keeps its hold time stored, for when it is
    # switched back, so both settings can sit on one zone.
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            "name": "Fan",
            STORE_ZONE_TYPE: "ignore",
            STORE_HOLD_S: 45,
        },
    )

    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, "shape": "rect", "data": MOVED}
    )

    assert _stored_zone(hass, device_id) == {
        "shape": "rect",
        "data": MOVED,
        "name": "Fan",
        "zone_type": "ignore",
        "hold_s": 45,
    }

    # Undo sends the earlier geometry the same way; a setting in the same call
    # applies on top of what was carried over.
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "polygon",
            "data": {
                "points": [{"x": 0, "y": 0}, {"x": 500, "y": 0}, {"x": 0, "y": 500}]
            },
            STORE_HOLD_S: 0,
        },
    )

    zone = _stored_zone(hass, device_id)
    assert zone["shape"] == "polygon"
    assert zone["name"] == "Fan"
    assert zone["zone_type"] == "ignore"
    assert "hold_s" not in zone


async def test_zone_settings_survive_shape_none(
    hass, init_integration, device_id
) -> None:
    """Clearing a zone, as Clear and Clear All do, keeps its type and hold time."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            STORE_ZONE_TYPE: "ignore",
            STORE_HOLD_S: 45,
        },
    )

    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, "shape": "none", "data": None}
    )

    assert _stored_zone(hass, device_id) == {
        "shape": "none",
        "data": None,
        "zone_type": "ignore",
        "hold_s": 45,
    }
    _, presence_id = _zone_entity_ids(hass, device_id)
    assert hass.states.get(presence_id).attributes["zone_type"] == "ignore"


@pytest.mark.parametrize(
    "bad",
    [
        {STORE_HOLD_S: -1},
        {STORE_HOLD_S: HOLD_S_MAX + 1},
        {STORE_HOLD_S: "abc"},
        # vol.Coerce(int) alone would read True, or YAML on, as a 1 s hold.
        {STORE_HOLD_S: True},
        {STORE_ZONE_TYPE: "exclude"},
    ],
    ids=["hold_negative", "hold_over_an_hour", "hold_text", "hold_boolean", "type"],
)
async def test_schema_rejects_bad_zone_settings(
    hass, init_integration, device_id, bad
) -> None:
    """A bad zone setting fails the whole call, and nothing is written."""
    _ = init_integration
    # The rotation alone would be stored if the call got past the schema.
    call = {"device_id": device_id, "zone_id": 1, ATTR_ROTATION_DEG: 90, **bad}
    with pytest.raises(vol.Invalid):
        UPDATE_ZONE_SERVICE_SCHEMA(call)
    with pytest.raises(vol.Invalid):
        await hass.services.async_call(DOMAIN, SERVICE_UPDATE_ZONE, call, blocking=True)
    await hass.async_block_till_done()

    assert device_id not in get_store(hass).devices


@pytest.mark.parametrize(
    ("settings", "expected"),
    [
        ({STORE_HOLD_S: 0}, {STORE_HOLD_S: 0}),
        ({STORE_HOLD_S: HOLD_S_MAX}, {STORE_HOLD_S: HOLD_S_MAX}),
        ({STORE_HOLD_S: "45"}, {STORE_HOLD_S: 45}),
        ({STORE_HOLD_S: 30.9}, {STORE_HOLD_S: 30}),
        ({STORE_ZONE_TYPE: "detect"}, {STORE_ZONE_TYPE: "detect"}),
        ({STORE_ZONE_TYPE: "ignore"}, {STORE_ZONE_TYPE: "ignore"}),
    ],
    ids=["hold_zero", "hold_an_hour", "hold_text", "hold_fraction", "detect", "ignore"],
)
def test_schema_accepts_zone_settings(settings, expected) -> None:
    """Hold times from 0 to an hour, in whole seconds, and both zone types pass."""
    validated = UPDATE_ZONE_SERVICE_SCHEMA(
        {"device_id": "abc", "zone_id": 1, **settings}
    )
    assert {key: validated[key] for key in expected} == expected


@pytest.mark.parametrize(
    ("settings", "tail"),
    [
        ({STORE_ZONE_TYPE: "ignore"}, "nothing was applied to it."),
        ({STORE_HOLD_S: 30}, "nothing was applied to it."),
        ({"name": "Fan", STORE_HOLD_S: 30}, "nothing was applied to it."),
        # A rename alone keeps the message it always had.
        ({"name": "Fan"}, "the name was not applied."),
    ],
    ids=["type", "hold", "named_hold", "rename_only"],
)
@pytest.mark.usefixtures("init_integration")
async def test_zone_settings_on_a_missing_zone_are_refused(
    hass, device_id, caplog, settings, tail
) -> None:
    """Settings for a zone that is not stored mint no entry and fire no event."""
    events = _zone_events(hass)

    await _update_zone(hass, {"device_id": device_id, "zone_id": 7, **settings})

    assert device_id not in get_store(hass).devices
    assert events == []
    assert (
        f"Apollo mmWave: update_zone for device '{device_id}' named zone 7,"
        f" which does not exist; {tail}"
    ) in caplog.messages
    assert "carried nothing to change" in caplog.text

    # On a radar with other zones, those zones stay exactly as they were.
    await _create_rect_zone(hass, device_id)
    events.clear()
    await _update_zone(hass, {"device_id": device_id, "zone_id": 7, **settings})

    assert get_store(hass).devices[device_id][STORE_ZONES] == {
        1: {"shape": "rect", "data": RECT}
    }
    assert events == []


async def test_zone_settings_without_zone_id_are_ignored(
    hass, init_integration, device_id, caplog
) -> None:
    """Zone settings need a zone_id; without one they are named and dropped."""
    _ = init_integration
    events = _zone_events(hass)
    warning = (
        f"Apollo mmWave: update_zone for device '{device_id}' carried zone_type or"
        " hold_s without a zone_id, so they were ignored."
    )

    # Alone they change nothing, so the call is refused and mints nothing.
    await _update_zone(
        hass, {"device_id": device_id, STORE_ZONE_TYPE: "ignore", STORE_HOLD_S: 30}
    )
    assert device_id not in get_store(hass).devices
    assert events == []
    assert warning in caplog.messages
    assert "carried nothing to change" in caplog.text

    # Beside a device-wide field, that field still lands and no zone changes.
    await _create_rect_zone(hass, device_id)
    events.clear()
    caplog.clear()
    await _update_zone(
        hass, {"device_id": device_id, STORE_HOLD_S: 30, ATTR_ROTATION_DEG: 15}
    )

    device = get_store(hass).devices[device_id]
    assert device[ATTR_ROTATION_DEG] == 15
    assert device[STORE_ZONES] == {1: {"shape": "rect", "data": RECT}}
    assert len(events) == 1
    assert warning in caplog.messages


@pytest.mark.parametrize(
    "settings",
    [
        {STORE_ZONE_TYPE: "detect"},
        {STORE_HOLD_S: 0},
        {STORE_ZONE_TYPE: "detect", STORE_HOLD_S: 0},
    ],
    ids=["detect", "no_hold", "both"],
)
async def test_default_zone_settings_alone_are_refused(
    hass, init_integration, device_id, caplog, settings
) -> None:
    """A default only forgets a stored setting, so with none stored it is a no-op."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    events = _zone_events(hass)

    await _update_zone(hass, {"device_id": device_id, "zone_id": 1, **settings})

    assert _stored_zone(hass, device_id) == {"shape": "rect", "data": RECT}
    assert events == []
    assert "carried nothing to change" in caplog.text


@pytest.mark.parametrize(
    ("call", "stored"),
    [
        (
            {"shape": "rect", "data": RECT, STORE_ZONE_TYPE: "ignore"},
            {"shape": "rect", "data": RECT, "zone_type": "ignore"},
        ),
        (
            {"shape": "rect", "data": RECT, STORE_HOLD_S: 45},
            {"shape": "rect", "data": RECT, "hold_s": 45},
        ),
        # How the card saves a setting for a zone it has not stored yet.
        (
            {"shape": "none", "data": None, STORE_ZONE_TYPE: "ignore"},
            {"shape": "none", "data": None, "zone_type": "ignore"},
        ),
        # Defaults are never stored, not even by the call that creates a zone.
        (
            {"shape": "rect", "data": RECT, STORE_ZONE_TYPE: "detect", STORE_HOLD_S: 0},
            {"shape": "rect", "data": RECT},
        ),
    ],
    ids=["ignore", "hold", "card_unsaved_zone", "defaults"],
)
async def test_zone_settings_with_shape_create_the_zone_with_them(
    hass, init_integration, device_id, call, stored
) -> None:
    """The call that creates a zone can carry its settings, and they are stored."""
    _ = init_integration

    await _update_zone(hass, {"device_id": device_id, "zone_id": 1, **call})

    assert _stored_zone(hass, device_id) == stored
    _, presence_id = _zone_entity_ids(hass, device_id)
    attributes = hass.states.get(presence_id).attributes
    assert attributes.get("zone_type") == stored.get("zone_type")
    assert ("held" in attributes) == ("hold_s" in stored)


async def test_zone_type_ignore_is_stored_and_detect_pops_it(
    hass, init_integration, device_id
) -> None:
    """Ignore is stored on the zone, and detect, the default, forgets it."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    _, presence_id = _zone_entity_ids(hass, device_id)
    _set_target(hass, TRACKED[0], 0, 1000)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"
    events = _zone_events(hass)

    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, STORE_ZONE_TYPE: "ignore"}
    )

    assert _stored_zone(hass, device_id) == {
        "shape": "rect",
        "data": RECT,
        "zone_type": "ignore",
    }
    state = hass.states.get(presence_id)
    assert state.state == "off"
    assert state.attributes["zone_type"] == "ignore"
    # Ignore counts even on a zone that already is one.
    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, STORE_ZONE_TYPE: "ignore"}
    )
    assert len(events) == 2

    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, STORE_ZONE_TYPE: "detect"}
    )

    assert _stored_zone(hass, device_id) == {"shape": "rect", "data": RECT}
    state = hass.states.get(presence_id)
    assert state.state == "on"
    assert "zone_type" not in state.attributes
    assert len(events) == 3


async def test_mirror_x_true_is_stored_false_pops_it(
    hass, init_integration, device_id
) -> None:
    """The flip is stored as True, and turning it off forgets the key."""
    _ = init_integration
    events = _zone_events(hass)

    await _update_zone(hass, {"device_id": device_id, STORE_MIRROR_X: True})

    assert get_store(hass).devices[device_id] == {STORE_ZONES: {}, STORE_MIRROR_X: True}
    # Like a map unit, on counts even when the flip is already on.
    await _update_zone(hass, {"device_id": device_id, STORE_MIRROR_X: "on"})
    assert len(events) == 2

    await _update_zone(hass, {"device_id": device_id, STORE_MIRROR_X: False})

    assert get_store(hass).devices[device_id] == {STORE_ZONES: {}}
    assert len(events) == 3


async def test_mirror_x_false_with_nothing_stored_is_refused(
    hass, init_integration, device_id, caplog
) -> None:
    """Turning off a flip that was never on mints no store entry."""
    _ = init_integration
    events = _zone_events(hass)

    await _update_zone(hass, {"device_id": device_id, STORE_MIRROR_X: False})

    assert device_id not in get_store(hass).devices
    assert events == []
    assert "carried nothing to change" in caplog.text


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (True, True),
        (False, False),
        ("on", True),
        ("off", False),
        ("true", True),
        (1, True),
        (0, False),
    ],
)
@pytest.mark.parametrize("key", [STORE_MIRROR_X, STORE_MOVEMENT_HISTORY])
def test_schema_accepts_device_flags(key, value, expected) -> None:
    """Both radar flags take anything Home Assistant reads as a boolean."""
    validated = UPDATE_ZONE_SERVICE_SCHEMA({"device_id": "abc", key: value})
    assert validated[key] is expected


async def test_movement_history_flag_round_trip(
    hass, init_integration, device_id, hass_storage, caplog
) -> None:
    """The flag is saved and loads back, and turning it off forgets it."""
    # Off with nothing stored is a no-op, as for the flip.
    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: False})
    assert device_id not in get_store(hass).devices
    assert "carried nothing to change" in caplog.text

    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: True})
    assert await hass.config_entries.async_reload(init_integration.entry_id)
    await hass.async_block_till_done()

    stored = hass_storage[ZONE_STORAGE_KEY]["data"][STORE_DEVICES][device_id]
    assert stored[STORE_MOVEMENT_HISTORY] is True
    assert get_store(hass).devices[device_id] == {
        STORE_ZONES: {},
        STORE_MOVEMENT_HISTORY: True,
    }

    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: False})

    assert get_store(hass).devices[device_id] == {STORE_ZONES: {}}
    stored = hass_storage[ZONE_STORAGE_KEY]["data"][STORE_DEVICES][device_id]
    assert STORE_MOVEMENT_HISTORY not in stored


async def test_movement_history_off_clears_history(
    hass, init_integration, device_id, hass_storage
) -> None:
    """Turning movement history off deletes the radar's history and its file."""
    _ = init_integration
    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: True})
    _set_target(hass, TRACKED[0], 1371, 2903)
    await hass.async_block_till_done()
    history = hass.data[DOMAIN][DATA_MOVEMENT]
    assert history.count(device_id) == 1
    # Past the routine save delay, so the history is on disk.
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=61))
    await hass.async_block_till_done()
    assert device_id in hass_storage[MOVEMENT_STORAGE_KEY]["data"]["devices"]

    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: False})
    await hass.async_block_till_done(wait_background_tasks=True)

    assert history.count(device_id) == 0
    assert MOVEMENT_STORAGE_KEY not in hass_storage
    # The target still in view is not recorded any more.
    _set_target(hass, TRACKED[0], 1500, 2500)
    await hass.async_block_till_done()
    assert history.count(device_id) == 0


async def test_movement_history_off_then_on_concurrently_deletes_the_old_history(
    hass, init_integration, device_id, monkeypatch
) -> None:
    """An on call made while an off call saves runs after it: the history goes."""
    _ = init_integration
    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: True})
    # Someone walked by: a point and a gone marker.
    _set_target(hass, TRACKED[0], 1371, 2903)
    await hass.async_block_till_done()
    _set_target(hass, TRACKED[0], 0, 0)
    await hass.async_block_till_done()
    history = hass.data[DOMAIN][DATA_MOVEMENT]
    assert history.count(device_id) == 2
    # The off call's save of the zone store waits on the disk, as on a slow
    # SD card.
    zone_file = get_store(hass)._store  # noqa: SLF001 - its Store
    writing, written = asyncio.Event(), asyncio.Event()
    real_write = zone_file._async_write_data  # noqa: SLF001 - the write itself

    async def _slow_write(data: dict) -> None:
        writing.set()
        await written.wait()
        await real_write(data)

    monkeypatch.setattr(zone_file, "_async_write_data", _slow_write)

    off = hass.async_create_task(
        hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_ZONE,
            {"device_id": device_id, STORE_MOVEMENT_HISTORY: False},
            blocking=True,
        )
    )
    await writing.wait()
    # Meanwhile another administrator, or a quick second tick, turns it on.
    on = hass.async_create_task(
        hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_ZONE,
            {"device_id": device_id, STORE_MOVEMENT_HISTORY: True},
            blocking=True,
        )
    )
    for _ in range(10):
        await asyncio.sleep(0)
    written.set()
    await asyncio.gather(off, on)
    await hass.async_block_till_done(wait_background_tasks=True)

    assert get_store(hass).devices[device_id][STORE_MOVEMENT_HISTORY] is True
    # Nothing from before the off call is left, and recording goes on.
    assert history.count(device_id) == 0
    _set_target(hass, TRACKED[0], 1500, 2500)
    await hass.async_block_till_done()
    assert history.count(device_id) == 1


@pytest.mark.parametrize(
    "extra",
    [
        {},
        {"zone_id": 1, "shape": "rect", "data": MOVED},
        {"zone_id": 1, "delete": True},
    ],
    ids=["alone", "with_a_redraw", "with_a_delete"],
)
async def test_turning_movement_history_off_saves_the_zone_store_at_once(
    hass, init_integration, device_id, hass_storage, extra
) -> None:
    """The off state is on disk before the movement history is deleted."""
    _ = init_integration
    await _create_rect_zone(hass, device_id)
    await _update_zone(hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: True})
    # Turning it on waits for the save delay; written out here, the file shows
    # it on before the call under test.
    await get_store(hass).async_save()
    stored = hass_storage[ZONE_STORAGE_KEY]["data"][STORE_DEVICES][device_id]
    assert stored[STORE_MOVEMENT_HISTORY] is True
    # What the movement history, or any listener, finds on disk when the zone
    # signal reaches it: it deletes the radar's positions in answer.
    flag_on_disk_at_signal: list[bool] = []

    @callback
    def _zones_updated(_device_id: str) -> None:
        stored = hass_storage[ZONE_STORAGE_KEY]["data"][STORE_DEVICES][device_id]
        flag_on_disk_at_signal.append(STORE_MOVEMENT_HISTORY in stored)

    async_dispatcher_connect(hass, SIGNAL_ZONES_UPDATED, _zones_updated)

    # No time passes, so only a write made by the call itself shows it off.
    await _update_zone(
        hass, {"device_id": device_id, STORE_MOVEMENT_HISTORY: False, **extra}
    )

    assert flag_on_disk_at_signal == [False]
    stored = hass_storage[ZONE_STORAGE_KEY]["data"][STORE_DEVICES][device_id]
    assert STORE_MOVEMENT_HISTORY not in stored


async def test_name_on_the_creating_call_reaches_the_registry(
    hass, init_integration, device_id
) -> None:
    """A name sent with the call that creates a zone names its entities too."""
    _ = init_integration
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "rect",
            "data": RECT,
            "name": "Couch",
        },
    )

    registry = er.async_get(hass)
    sensor_id, presence_id = _zone_entity_ids(hass, device_id)
    assert registry.async_get(sensor_id).name == "Zone 1 - Couch"
    assert registry.async_get(presence_id).name == "Zone 1 presence - Couch"
    assert hass.states.get(sensor_id).attributes["friendly_name"] == "Zone 1 - Couch"
    assert (
        hass.states.get(presence_id).attributes["friendly_name"]
        == "Zone 1 presence - Couch"
    )


async def test_default_name_on_the_creating_call_leaves_registry_names_alone(
    hass, init_integration, device_id
) -> None:
    """Add Zone's default name is stored but never makes "Zone 1 - Zone 1"."""
    _ = init_integration
    # The payload the card's Add Zone button sends.
    await _update_zone(
        hass,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "none",
            "data": None,
            "name": "Zone 1",
            "input_units": "mm",
        },
    )

    assert _stored_zone(hass, device_id)["name"] == "Zone 1"
    registry = er.async_get(hass)
    sensor_id, presence_id = _zone_entity_ids(hass, device_id)
    assert registry.async_get(sensor_id).name is None
    assert registry.async_get(presence_id).name is None

    # Drawing the zone's shape later carries the name and leaves them alone too.
    await _update_zone(
        hass, {"device_id": device_id, "zone_id": 1, "shape": "rect", "data": RECT}
    )
    assert registry.async_get(sensor_id).name is None

    # A name the user gives it still reaches the registry.
    await _rename_zone(hass, device_id, "Couch")
    assert registry.async_get(sensor_id).name == "Zone 1 - Couch"
    assert registry.async_get(presence_id).name == "Zone 1 presence - Couch"
