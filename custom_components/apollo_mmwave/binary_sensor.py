"""
Presence binary sensor platform for Apollo mmWave.

One occupancy sensor per zone: on when any tracked LD2450 target's (x, y),
converted to millimeters by each sensor's unit and rotated by the device's
configured rotation, falls inside the zone's shape. Reading and testing the
targets lives in targets.py, which the movement recorder shares, so the two
can never read a target differently.
Identity is the radar's Home Assistant device id plus the zone id, and the
entity is registered against that device, so zone presence shows up on the
radar's device page where automations are built from, and renaming it is safe.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.core import callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_track_state_change_event

from .const import ATTR_DATA, ATTR_ROTATION_DEG, SIGNAL_ZONES_UPDATED
from .ld2450 import effective_target_pairs
from .targets import (
    build_point_rotator,
    fallback_factor,
    iter_slot_points,
    pair_ids,
    shape_tester,
)
from .zone_entities import ZoneEntityMixin, async_setup_zone_platform

if TYPE_CHECKING:
    import asyncio
    from collections.abc import Callable

    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import Event, EventStateChangedData, HomeAssistant
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

    from .store import ZoneStore

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create presence sensors for stored zones, and for zones added later."""
    from . import get_store  # noqa: PLC0415 - avoid a module import cycle

    store = get_store(hass)
    async_setup_zone_platform(
        hass,
        entry,
        "binary_sensor",
        lambda device_id, zone_id: ZonePresenceBinarySensor(
            hass, store, device_id, zone_id
        ),
        async_add_entities,
    )


class ZonePresenceBinarySensor(ZoneEntityMixin, BinarySensorEntity):
    """Occupancy: any tracked target inside this zone's shape."""

    _attr_should_poll = False
    _attr_icon = "mdi:motion-sensor"
    _attr_device_class = BinarySensorDeviceClass.OCCUPANCY
    _attr_has_entity_name = True

    def __init__(
        self, hass: HomeAssistant, store: ZoneStore, device_id: str, zone_id: int
    ) -> None:
        """Initialize from the store."""
        self._store = store
        self._device_id = device_id
        self._zone_id = zone_id
        self._attr_is_on = False
        self._unsub_state_listener: Callable[[], None] | None = None
        self._pending_eval: asyncio.Handle | None = None

        self._attr_name = f"Zone {zone_id} presence"
        self._attr_unique_id = f"{device_id}_zone_{zone_id}_presence"
        # Set before the entity reaches the platform so the registry entry is
        # created already linked to the radar. Attaching afterwards would leave
        # the first entity id and friendly name derived from a device-less
        # entity, which is what this rework exists to stop.
        self.device_entry = dr.async_get(hass).async_get(device_id)
        if self.device_entry is None:
            _LOGGER.warning(
                "Apollo mmWave: zone %s is stored against device %s, which no"
                " longer exists. Its presence entity will not appear on any"
                " device page; re-draw the zone on the radar's card.",
                zone_id,
                device_id,
            )

    async def async_added_to_hass(self) -> None:
        """Track zone updates and the device's coordinate entities."""
        await super().async_added_to_hass()

        # The signal also carries registry changes to the radar's own target
        # sensors, which is how a zone whose LD2450 entities land after this one
        # (first pairing, a re-adopted device, esphome setting up second) starts
        # tracking instead of reading "off" forever. See `async_track_target_pairs`.
        @callback
        def _zones_updated(device_id: str) -> None:
            if device_id == self._device_id:
                self._track_coordinate_entities()
                self._evaluate_and_write()

        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_ZONES_UPDATED, _zones_updated)
        )
        self._track_coordinate_entities()
        self._evaluate_and_write(write=False)

    async def async_will_remove_from_hass(self) -> None:
        """Stop tracking coordinate entities."""
        if self._pending_eval is not None:
            self._pending_eval.cancel()
            self._pending_eval = None
        if self._unsub_state_listener:
            self._unsub_state_listener()
            self._unsub_state_listener = None
        await super().async_will_remove_from_hass()

    def _tracked_pairs(self) -> list[dict[str, str]]:
        return effective_target_pairs(self.hass, self._store, self._device_id)

    # TODO(REVIEW_REPORT.md X07): a renamed pair goes dead.  # noqa: FIX002, TD003
    # A configured pair keeps the id it had before a rename, so this watches an
    # entity that no longer reports. See _registry_updated in ld2450.py.
    def _track_coordinate_entities(self) -> None:
        if self._unsub_state_listener:
            self._unsub_state_listener()
            self._unsub_state_listener = None

        # Each id once: pairs can share an entity (see `pair_ids`).
        entity_ids = pair_ids(self._tracked_pairs())
        if entity_ids:
            self._unsub_state_listener = async_track_state_change_event(
                self.hass, entity_ids, self._handle_coordinate_update
            )

    @callback
    def _handle_coordinate_update(self, _event: Event[EventStateChangedData]) -> None:
        # A target's X and Y are two entities written one after the other, so
        # evaluating inside each write tests a point no target occupied (the new
        # X with the old Y) and can pulse presence on and off. Scheduling one
        # evaluation with call_soon lets both writes land first. This is
        # best-effort coalescing: it removes the pulse when X and Y arrive in one
        # event-loop turn, which is how the ESPHome API normally delivers a
        # batched pair, but not when they arrive in separate turns. It adds no
        # timed window.
        if self._pending_eval is None:
            self._pending_eval = self.hass.loop.call_soon(self._flush_evaluation)

    @callback
    def _flush_evaluation(self) -> None:
        self._pending_eval = None
        self._evaluate_and_write()

    def _evaluate_and_write(self, *, write: bool = True) -> None:
        # TODO(REVIEW_REPORT.md X09): offline radar reads off.  # noqa: FIX002, TD003
        # With every tracked coordinate unavailable this writes off, unlike HA's
        # group and trend sensors. Suggested: unavailable when the pair list is
        # non-empty and every tracked id that has a state is unavailable (all ids
        # missing, or an empty list, stays off), with a test and a changelog note.
        self._attr_is_on = self._evaluate_presence()
        if write:
            self.async_write_ha_state()

    def _evaluate_presence(self) -> bool:
        zone_def = self._store.zone(self._device_id, self._zone_id)
        tester = shape_tester(zone_def)
        if tester is None:
            return False
        data = zone_def.get(ATTR_DATA)

        device = self._store.devices.get(self._device_id) or {}
        rotate = build_point_rotator(device.get(ATTR_ROTATION_DEG))
        fallback = fallback_factor(self._store, self._device_id)

        return any(
            tester(*rotate(x_val, y_val), data)
            for _slot, x_val, y_val in iter_slot_points(
                self.hass, self._tracked_pairs(), fallback
            )
        )
