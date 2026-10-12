"""Service, store, and unload behavior."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
import voluptuous as vol
from homeassistant.config_entries import ConfigEntryState
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.json import json_bytes
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.apollo_mmwave import (
    UPDATE_ZONE_SERVICE_SCHEMA,
    async_remove_entry,
    get_store,
)
from custom_components.apollo_mmwave.const import (
    ATTR_ROTATION_DEG,
    DATA_STORE,
    DOMAIN,
    EVENT_ZONE_UPDATED,
    SERVICE_CALIBRATE_GATES,
    SERVICE_CANCEL_CALIBRATION,
    SERVICE_RESTORE_GATE_THRESHOLDS,
    SERVICE_UPDATE_ZONE,
    STORE_DEVICES,
    STORE_ENTITIES,
    STORE_LABEL,
    STORE_ORPHANS,
    STORE_ZONES,
)

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


async def test_zones_reload_from_storage(
    hass, config_entry, esphome_device, hass_storage
) -> None:
    """A fresh setup reads zones straight from the store (no restore states)."""
    from .conftest import setup_integration  # noqa: PLC0415 - avoids a cycle

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


@pytest.mark.parametrize(("angle", "stored"), [(270.4, 180), (-12.6, -13), (1e20, 180)])
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
            "insufficient points",
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


@pytest.mark.parametrize("zone_id", [0, 2**53, 2**64, 18446744073709551616.0])
def test_zone_id_bounds_reject(zone_id) -> None:
    """0 and anything past the serialization limit fail validation."""
    # 18446744073709551616.0 is how a 2**64 JSON literal reaches the websocket.
    with pytest.raises(vol.Invalid):
        UPDATE_ZONE_SERVICE_SCHEMA({"device_id": "abc", "zone_id": zone_id})
