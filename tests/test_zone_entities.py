"""A refused entity add is retried instead of leaving the zone entity-less."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.const import ATTR_RESTORED, STATE_UNAVAILABLE
from homeassistant.core import callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import (
    async_dispatcher_connect,
    async_dispatcher_send,
)
from homeassistant.helpers.entity_platform import DATA_ENTITY_PLATFORM
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import (
    DOMAIN,
    SERVICE_UPDATE_ZONE,
    SIGNAL_ZONES_UPDATED,
    STORE_DEVICES,
    STORE_INPUT_UNITS,
    STORE_ORPHANS,
    STORE_ZONES,
)
from custom_components.apollo_mmwave.store import STORAGE_KEY as ZONE_STORAGE_KEY
from custom_components.apollo_mmwave.zone_entities import (
    ZoneEntityMixin,
    ZoneEntityTracker,
)

from .conftest import RECT_ZONE, setup_integration

if TYPE_CHECKING:
    from homeassistant.helpers.entity_platform import EntityPlatform

DISABLED_RADAR_SERIAL = "apollo_mtr_1_fed789"
DISABLED_RADAR_NAME = "Apollo MTR-1 fed789"
# The live radar's first LD2450 target, as the `esphome_device` fixture names it.
TARGET_1_X = "sensor.r_pro_ld2450_target_1_x"
TARGET_1_Y = "sensor.r_pro_ld2450_target_1_y"


def _zone_entity_ids(hass, device_id: str) -> tuple[str | None, str | None]:
    registry = er.async_get(hass)
    return (
        registry.async_get_entity_id("sensor", DOMAIN, f"{device_id}_zone_1"),
        registry.async_get_entity_id(
            "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
        ),
    )


async def _draw(hass, device_id: str) -> None:
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, **RECT_ZONE},
        blocking=True,
    )


def _disabled_radar(hass, device_registry) -> str:
    """Register a second radar and disable it in the device registry."""
    # The device registry refuses to link a device to a config entry that does
    # not exist, so the radar's owning esphome entry has to be real.
    esphome_entry = MockConfigEntry(domain="esphome", title=DISABLED_RADAR_NAME)
    esphome_entry.add_to_hass(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", DISABLED_RADAR_SERIAL)},
        name=DISABLED_RADAR_NAME,
    )
    device_registry.async_update_device(
        device.id, disabled_by=dr.DeviceEntryDisabler.USER
    )
    return device.id


def _zone_platforms(hass) -> list[EntityPlatform]:
    return list(hass.data[DATA_ENTITY_PLATFORM][DOMAIN])


def _live_zone_entities(platforms: list[EntityPlatform]) -> list[ZoneEntityMixin]:
    return [
        entity
        for platform in platforms
        for entity in platform.entities.values()
        if isinstance(entity, ZoneEntityMixin)
    ]


async def test_delete_and_immediate_redraw_keeps_one_entity_per_zone(
    hass, init_integration, device_id
) -> None:
    """Deleting a zone and redrawing it before HA finishes removing the old entity."""
    _ = init_integration
    await _draw(hass, device_id)
    await hass.async_block_till_done()
    before = _zone_entity_ids(hass, device_id)
    assert all(before)

    # No block_till_done between the two: the old entities are still leaving.
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, "delete": True},
        blocking=True,
    )
    await _draw(hass, device_id)
    await hass.async_block_till_done()
    await hass.async_block_till_done()

    after = _zone_entity_ids(hass, device_id)
    assert all(after)
    assert after == before
    assert hass.states.get(after[0]) is not None
    assert hass.states.get(after[1]) is not None


async def test_refused_add_is_retried_on_the_next_zone_signal(
    hass, init_integration, device_id
) -> None:
    """An entity the platform aborted is offered again, not forgotten."""
    _ = init_integration
    tracker = ZoneEntityTracker(hass, "sensor")
    key = (device_id, 1)

    class _Fake:
        add_aborted = False

    first = _Fake()
    assert tracker.needs_entity(key)
    tracker.mark_pending(key, first)
    # Still in flight: no second copy.
    assert not tracker.needs_entity(key)

    first.add_aborted = True
    assert tracker.has_aborted
    assert tracker.needs_entity(key)

    second = _Fake()
    tracker.mark_pending(key, second)
    tracker.mark_live(key)
    assert not tracker.has_aborted
    assert not tracker.needs_entity(key)

    tracker.mark_gone(key)
    assert tracker.needs_entity(key)
    assert not tracker.is_disabled(f"{device_id}_zone_1")


async def test_zone_on_a_disabled_device_does_not_keep_an_aborted_attempt(
    hass, init_integration, device_id, device_registry, entity_registry
) -> None:
    """A zone the platform refuses for good stops counting as awaiting a retry."""
    _ = init_integration
    disabled_id = _disabled_radar(hass, device_registry)
    # The service only checks that the device exists, so this is reachable.
    await _draw(hass, disabled_id)
    await _draw(hass, device_id)
    await hass.async_block_till_done()
    for _ in range(2):
        async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, disabled_id)
        await hass.async_block_till_done()

    for domain, unique_id in (
        ("sensor", f"{disabled_id}_zone_1"),
        ("binary_sensor", f"{disabled_id}_zone_1_presence"),
    ):
        entity_id = entity_registry.async_get_entity_id(domain, DOMAIN, unique_id)
        assert entity_id is not None
        entry = entity_registry.async_get(entity_id)
        assert entry.disabled_by is er.RegistryEntryDisabler.DEVICE
        assert hass.states.get(entity_id) is None

    live = _live_zone_entities(_zone_platforms(hass))
    assert len(live) == 2
    assert not any(
        entity._tracker.has_aborted  # noqa: SLF001 - the tracker is the subject
        for entity in live
    )

    signals: list[str] = []

    @callback
    def _record(signal_device_id: str) -> None:
        signals.append(signal_device_id)

    unsub = async_dispatcher_connect(hass, SIGNAL_ZONES_UPDATED, _record)
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, "delete": True},
        blocking=True,
    )
    await hass.async_block_till_done()
    unsub()

    # The service's own signal and nothing else: no retry nudge per removal.
    assert signals == [device_id]


async def test_unload_with_a_refused_zone_entity_leaves_no_live_entity(
    hass, hass_storage, config_entry, esphome_device, caplog
) -> None:
    """Unloading next to a refused zone entity re-adds nothing to the old platforms."""
    disabled_id = _disabled_radar(hass, dr.async_get(hass))
    live_id = esphome_device.id
    hass_storage[ZONE_STORAGE_KEY] = {
        "version": 2,
        "data": {
            STORE_DEVICES: {
                disabled_id: {STORE_ZONES: {"1": dict(RECT_ZONE)}},
                live_id: {
                    STORE_ZONES: {
                        str(zone_id): dict(RECT_ZONE) for zone_id in (1, 2, 3)
                    }
                },
            },
            STORE_ORPHANS: {},
        },
    }
    await setup_integration(hass, config_entry)
    platforms = _zone_platforms(hass)
    zone_entity_ids = [entity.entity_id for entity in _live_zone_entities(platforms)]
    assert len(zone_entity_ids) == 6

    assert await hass.config_entries.async_unload(config_entry.entry_id)
    await hass.async_block_till_done()

    for entity_id in zone_entity_ids:
        state = hass.states.get(entity_id)
        assert state.state == STATE_UNAVAILABLE
        assert state.attributes.get(ATTR_RESTORED) is True
    assert all(not platform.entities for platform in platforms)

    assert await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()
    presence_id = er.async_get(hass).async_get_entity_id(
        "binary_sensor", DOMAIN, f"{live_id}_zone_1_presence"
    )
    hass.states.async_set(TARGET_1_X, "0")
    hass.states.async_set(TARGET_1_Y, "1000")
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "on"

    # The zone moves away from the target in the store the reload just loaded.
    get_store(hass).device(live_id)[STORE_ZONES][1] = {
        "shape": "rect",
        "data": {"x_min": 3000, "x_max": 4000, "y_min": 3000, "y_max": 4000},
    }
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, live_id)
    await hass.async_block_till_done()
    assert hass.states.get(presence_id).state == "off"

    assert not [
        record
        for record in caplog.records
        if "does not generate unique IDs" in record.getMessage()
    ]


async def test_input_units_round_trip_through_the_store(
    hass, init_integration, device_id
) -> None:
    """The service stores the unit and the websocket payload reports it."""
    _ = init_integration
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "input_units": "ft"},
        blocking=True,
    )
    await hass.async_block_till_done()
    assert get_store(hass).devices[device_id][STORE_INPUT_UNITS] == "ft"
