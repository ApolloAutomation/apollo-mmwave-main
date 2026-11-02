"""
Presence binary sensor platform for Apollo mmWave.

One occupancy sensor per zone: on when any tracked LD2450 target's (x, y),
converted to millimeters by each sensor's unit and rotated by the device's
configured rotation, falls inside the zone's shape. A target inside any
ignore zone of the radar is dropped before that test, so no zone sees it, and
an ignore zone's own sensor always reads off. While the radar is offline a
detect zone reads unavailable. Reading and testing the targets lives in
targets.py, which the movement recorder shares, so the two can never read a
target differently.
A detect zone with a hold time stays on after someone inside it is lost
without being seen to leave, until that time has passed since it emptied.
hold.py has the rules; the hold lives in memory only, so a restart or a
reload ends it.
Identity is the radar's Home Assistant device id plus the zone id, and the
entity is registered against that device, so zone presence shows up on the
radar's device page where automations are built from, and renaming it is safe.
"""

from __future__ import annotations

import json
import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.core import HassJob, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import (
    async_call_later,
    async_track_state_change_event,
)

from .const import (
    ATTR_DATA,
    ATTR_HELD,
    ATTR_ROTATION_DEG,
    ATTR_SHAPE,
    ATTR_ZONE_TYPE,
    SIGNAL_ZONES_UPDATED,
    STORE_INPUT_UNITS,
    STORE_ZONES,
    ZONE_TYPE_IGNORE,
)
from .hold import HoldTracker
from .ld2450 import effective_target_pairs
from .store import zone_hold_s, zone_type_of
from .targets import masked_readings, pair_ids, radar_offline, shape_tester
from .zone_entities import ZoneEntityMixin, async_setup_zone_platform

if TYPE_CHECKING:
    import asyncio
    from collections.abc import Callable
    from datetime import datetime

    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import (
        CALLBACK_TYPE,
        Event,
        EventStateChangedData,
        HomeAssistant,
    )
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

    from .hold import Reading
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
    """Occupancy: a tracked target no ignore zone masks inside, or a hold."""

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
        self._attr_extra_state_attributes = {}
        self._unsub_state_listener: Callable[[], None] | None = None
        self._pending_eval: asyncio.Handle | None = None
        self._hold = HoldTracker()
        self._unsub_hold: CALLBACK_TYPE | None = None
        self._hold_deadline: float | None = None
        # What presence read this zone by at the last zone signal (see
        # _hold_fingerprint), or None before the entity is added.
        self._fingerprint: str | None = None

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
                # A hold keeps people at the positions they were lost at, read
                # the way this zone read them then. Once that way changes (see
                # _hold_fingerprint), those positions mean nothing, so the
                # hold ends.
                fingerprint = self._hold_fingerprint()
                if fingerprint != self._fingerprint:
                    self._fingerprint = fingerprint
                    self._drop_hold()
                self._track_coordinate_entities()
                self._evaluate_and_write()

        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_ZONES_UPDATED, _zones_updated)
        )
        self._track_coordinate_entities()
        # Seeded before the first evaluation, so the first zone signal compares
        # against what that evaluation read. A reload while Home Assistant runs
        # gets no STARTED nudge, so that signal can come long after a hold
        # began, and an unseeded fingerprint would end the hold.
        self._fingerprint = self._hold_fingerprint()
        self._evaluate_and_write(write=False)

    async def async_will_remove_from_hass(self) -> None:
        """Stop tracking coordinate entities and drop the hold timer."""
        self._cancel_hold_timer()
        if self._pending_eval is not None:
            self._pending_eval.cancel()
            self._pending_eval = None
        if self._unsub_state_listener:
            self._unsub_state_listener()
            self._unsub_state_listener = None
        await super().async_will_remove_from_hass()

    def _tracked_pairs(self) -> list[dict[str, str]]:
        return effective_target_pairs(self.hass, self._store, self._device_id)

    def _hold_fingerprint(self) -> str:
        """Return what turns this zone's readings into presence, as one string."""
        # This zone's geometry and type, the radar's rotation and input units,
        # the tracked pairs and every ignore zone. Not the name, the hold time,
        # other detect zones or display settings, which leave a hold standing.
        device = self._store.devices.get(self._device_id) or {}
        zone_def = self._store.zone(self._device_id, self._zone_id) or {}
        ignore_zones = sorted(
            (
                [str(zone_id), zone.get(ATTR_SHAPE), zone.get(ATTR_DATA)]
                for zone_id, zone in (device.get(STORE_ZONES) or {}).items()
                if zone_type_of(zone) == ZONE_TYPE_IGNORE
            ),
            key=lambda ignore_zone: ignore_zone[0],
        )
        return json.dumps(
            [
                zone_def.get(ATTR_SHAPE),
                zone_def.get(ATTR_DATA),
                zone_type_of(zone_def),
                device.get(ATTR_ROTATION_DEG),
                device.get(STORE_INPUT_UNITS),
                self._tracked_pairs(),
                ignore_zones,
            ],
            sort_keys=True,
            default=str,
        )

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

    def _readings(self) -> list[Reading]:
        return masked_readings(
            self.hass, self._store, self._device_id, self._tracked_pairs()
        )

    def _evaluate_and_write(self, *, write: bool = True) -> None:
        zone_def = self._store.zone(self._device_id, self._zone_id)
        # Ignore first: an ignore zone reads off even while the radar is
        # offline, so its zone_type attribute, which Home Assistant leaves off
        # an unavailable entity, always says what the zone is.
        if zone_type_of(zone_def) == ZONE_TYPE_IGNORE:
            self._write_ignore()
        elif radar_offline(self.hass, self._tracked_pairs()):
            self._write_offline()
        else:
            self._write_detect(zone_def)
        if write:
            self.async_write_ha_state()

    def _write_ignore(self) -> None:
        # A mask, not a sensor: every target inside it is dropped before any
        # zone is tested, this one included, so it has nothing to turn on for
        # and nothing to hold.
        self._drop_hold()
        self._attr_available = True
        self._attr_is_on = False
        self._attr_extra_state_attributes = {ATTR_ZONE_TYPE: ZONE_TYPE_IGNORE}

    def _write_offline(self) -> None:
        # Every tracked coordinate is unavailable, so nothing says whether the
        # zone is empty. Unavailable says so, as Home Assistant's group and
        # trend sensors do, where off would claim nobody is there. Whoever a
        # hold kept is unknown now too, so the hold ends with the connection.
        self._drop_hold()
        self._attr_available = False
        self._attr_is_on = False
        self._attr_extra_state_attributes = {}

    def _write_detect(self, zone_def: dict[str, Any] | None) -> None:
        self._attr_available = True
        hold_s = zone_hold_s(zone_def)
        tester = shape_tester(zone_def)
        data = zone_def.get(ATTR_DATA) if tester else None
        readings = self._readings() if tester else []
        if hold_s <= 0:
            # Presence exactly as before holds existed: on while a reading is
            # inside, with no half-vanish filter.
            self._drop_hold()
            self._attr_is_on = any(tester(*reading.map, data) for reading in readings)
            self._attr_extra_state_attributes = {}
            return
        now = time.monotonic()
        inside: list[Reading] = []
        outside: list[Reading] = []
        for reading in self._hold.usable(readings):
            (inside if tester(*reading.map, data) else outside).append(reading)
        is_on = self._hold.step(now, inside, outside, zone_def.get(ATTR_SHAPE), data)
        deadline = self._hold.deadline(hold_s)
        if deadline is not None and now >= deadline:
            # A timer that ran late, or a hold time lowered below how long the
            # zone has been empty.
            self._hold.pending = []
            is_on = bool(inside)
        self._attr_is_on = is_on
        self._schedule_hold_expiry(now, self._hold.deadline(hold_s))
        self._attr_extra_state_attributes = {ATTR_HELD: self._hold.holding}

    def _schedule_hold_expiry(self, now: float, deadline: float | None) -> None:
        if deadline is None:
            self._cancel_hold_timer()
            return
        # Every evaluation of a held zone lands here, and the deadline only
        # moves when the hold time changes, so the timer is replaced only then.
        if self._unsub_hold is not None and self._hold_deadline == deadline:
            return
        self._cancel_hold_timer()
        self._hold_deadline = deadline
        self._unsub_hold = async_call_later(
            self.hass,
            max(0.0, deadline - now),
            HassJob(self._hold_expired, cancel_on_shutdown=True),
        )

    @callback
    def _hold_expired(self, _now: datetime) -> None:
        self._unsub_hold = None
        self._hold_deadline = None
        # The hold ran its course: whoever is still unaccounted for is let go.
        self._hold.pending = []
        self._evaluate_and_write()

    def _drop_hold(self) -> None:
        self._hold.reset()
        self._cancel_hold_timer()

    def _cancel_hold_timer(self) -> None:
        if self._unsub_hold is not None:
            self._unsub_hold()
            self._unsub_hold = None
        self._hold_deadline = None

    def _evaluate_presence(self) -> bool:
        """Report whether a live target no ignore zone masks is inside now."""
        zone_def = self._store.zone(self._device_id, self._zone_id)
        tester = shape_tester(zone_def)
        if tester is None or zone_type_of(zone_def) == ZONE_TYPE_IGNORE:
            return False
        data = zone_def.get(ATTR_DATA)
        return any(tester(*reading.map, data) for reading in self._readings())
