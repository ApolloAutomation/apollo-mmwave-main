"""
Persistent zone storage for Apollo mmWave.

Zone definitions, tracked entity pairs, and device rotation used to live only
in ``hass.data``, "persisted" by piggybacking on a RestoreEntity sensor's
attributes and re-derived at boot by string-parsing entity friendly names.
That lost data on crashes (restore states are written periodically, not per
change) and broke when entities were renamed.

``ZoneStore`` owns the data now: a ``helpers.storage.Store`` under
``.storage/apollo_mmwave.zones``, saved (debounced) on every mutation. The
in-memory shape is::

    devices = {
        "<ha_device_id>": {
            "zones": {1: {"shape": ..., "data": ..., "name": ...}, ...},
            "entities": [{"x": "<entity_id>", "y": "<entity_id>"}, ...],  # optional
            "rotation_deg": 0,          # optional
            "label": "Apollo R_PRO-1 abc123",   # optional, display only
            "aliases": ["Kitchen"],   # optional, other merged v1 names
            "input_units": "mm",  # optional; absent means millimetres
        },
    }

``entities`` is three-valued on purpose. Absent means the user never picked
coordinate sensors, and readers fall back to the device's own LD2450 targets.
Present and empty means the user cleared the list, and clearing has to mean
"track nothing" rather than "track everything". Present and non-empty is an
explicit choice. So it is never seeded, and every reader branches on
``is None`` rather than on truthiness.

v1 keyed all of this by the device's display name. A rename orphaned the
zones, and two devices whose names slugified alike collided on one entity id.
The Home Assistant device id survives renames and is unique, so it is the key;
``label`` is carried along for display and is never used to build an
identifier. When several v1 names merge onto one device, the first is the
``label`` and the rest are kept in ``aliases``, so old unique ids and the
deprecated ``location`` service field still resolve through any of them. v1
entries that resolve to no device land in ``orphans``, still keyed by name, so
a user who renamed a device mid-upgrade does not silently lose their drawn
zones.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.util import slugify

from .const import (
    ATTR_ROTATION_DEG,
    DOMAIN,
    INPUT_UNIT_FACTORS,
    STORE_ALIASES,
    STORE_DEVICES,
    STORE_ENTITIES,
    STORE_INPUT_UNITS,
    STORE_LABEL,
    STORE_ORPHANS,
    STORE_ZONES,
)

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 2
STORAGE_KEY = f"{DOMAIN}.zones"
SAVE_DELAY_SECONDS = 2.0


def _empty_device() -> dict[str, Any]:
    # No `entities` key: a new device has never been configured, which is a
    # different thing from having been configured with nothing.
    return {STORE_ZONES: {}}


def resolve_device_id(hass: HomeAssistant, location: str, entities: Any) -> str | None:
    """Device id for a v1 location: by tracked entity first, then by name."""
    # A tracked coordinate entity points at its device directly, so it stays
    # correct even if the user renamed the device before upgrading. The name
    # match is the fallback for locations that never had entities attached.
    registry = er.async_get(hass)
    if isinstance(entities, list):
        for pair in entities:
            if not isinstance(pair, dict):
                continue
            for entity_id in (pair.get("x"), pair.get("y")):
                entry = (
                    registry.async_get(entity_id)
                    if isinstance(entity_id, str)
                    else None
                )
                if entry and entry.device_id:
                    return entry.device_id
    wanted = slugify(location)
    for device in dr.async_get(hass).devices.values():
        name = device.name_by_user or device.name or ""
        if slugify(name) == wanted:
            return device.id
    return None


def _record_location(target: dict[str, Any], location: str) -> None:
    """Remember a location name that merged onto this entry, first one as label."""
    # A rename left the old name behind as a second location on the same
    # device. Pre-2.0 unique ids were built from whichever name was current at
    # the time, so keeping only the first would strand the other name's
    # entities on their old unique ids and its `location` automations too.
    label = target.setdefault(STORE_LABEL, location)
    if location == label:
        return
    aliases = target.setdefault(STORE_ALIASES, [])
    if location not in aliases:
        aliases.append(location)


def _merge_location(
    target: dict[str, Any],
    raw: dict[str, Any],
    location: str,
    zone_sources: dict[str, str],
) -> None:
    """
    Fold one v1 location into a device entry, first writer wins.

    Two v1 locations can resolve to the same device: renaming a device mid-life
    left the old name behind as a second entry. A plain dict update would let
    the second entry silently wipe the first one's zones, and this migration
    runs once with no undo, so every zone id is kept and only true id-level
    conflicts are dropped (loudly). Empty placeholders do not count as writers:
    real data replaces one.
    """
    zones = target.setdefault(STORE_ZONES, {})
    incoming = raw.get(STORE_ZONES)
    if isinstance(incoming, dict):
        for raw_key, zone_def in incoming.items():
            zone_key = str(raw_key)
            if zones.get(zone_key):
                if zone_def:
                    _LOGGER.warning(
                        "Apollo mmWave: zone %s is defined by both '%s' and '%s',"
                        " which migrated to the same device; keeping the"
                        " definition from '%s'.",
                        zone_key,
                        zone_sources.get(zone_key, location),
                        location,
                        zone_sources.get(zone_key, location),
                    )
                continue
            zones[zone_key] = zone_def
            zone_sources[zone_key] = location
    entities = raw.get(STORE_ENTITIES)
    # v1 seeded `entities: []` on every location, so it had no way to say
    # "explicitly none" and an empty v1 list can only mean "never configured".
    # Carrying it over as an explicit empty would switch off the LD2450 fallback
    # for every existing user at once and leave their presence sensors dead, so
    # only a non-empty list migrates; otherwise the key stays absent.
    if isinstance(entities, list) and entities and target.get(STORE_ENTITIES) is None:
        target[STORE_ENTITIES] = entities
    rotation = raw.get(ATTR_ROTATION_DEG)
    # 0 degrees is a configured value, distinct from absent, so this gates on
    # presence rather than truthiness like the rest of the integration does.
    if rotation is not None and target.get(ATTR_ROTATION_DEG) is None:
        target[ATTR_ROTATION_DEG] = rotation
    _record_location(target, location)


class _MigratingStore(Store[dict[str, Any]]):
    """Store subclass that rekeys v1 (display name) data to device ids."""

    async def _async_migrate_func(
        self,
        old_major_version: int,
        old_minor_version: int,  # noqa: ARG002 - signature fixed by Store
        old_data: dict[str, Any],
    ) -> dict[str, Any]:
        # Store raises UnsupportedStorageVersionError for a major above
        # STORAGE_VERSION before calling this, since no `max_readable_version`
        # is passed, so a newer file fails setup instead of being read. A major
        # above 1 here is therefore the current one with a different minor
        # version, which has nothing to rekey.
        if old_major_version > 1:
            return old_data
        # Store hands over the file's `data` field verbatim, so a hand edit or a
        # partial restore can leave something other than an object here. There
        # is nothing to rekey in that case, so start empty rather than crash.
        if not isinstance(old_data, dict):
            _LOGGER.error(
                "Apollo mmWave: zone store version 1 payload is not an object;"
                " starting empty"
            )
            return {STORE_DEVICES: {}, STORE_ORPHANS: {}}
        devices: dict[str, Any] = {}
        orphans: dict[str, Any] = {}
        # Which location contributed each zone id, per device, so a collision
        # warning can name both sides of it.
        sources: dict[str, dict[str, str]] = {}
        locations = old_data.get("locations")
        if not isinstance(locations, dict):
            locations = {}
        for location, raw in locations.items():
            if not isinstance(raw, dict):
                continue
            device_id = resolve_device_id(self.hass, location, raw.get(STORE_ENTITIES))
            if device_id:
                _merge_location(
                    devices.setdefault(device_id, {}),
                    raw,
                    location,
                    sources.setdefault(device_id, {}),
                )
            else:
                # Orphans are still keyed by location, so they cannot collide.
                _merge_location(orphans.setdefault(location, {}), raw, location, {})
                _LOGGER.warning(
                    "Apollo mmWave: zone location '%s' matches no Home Assistant"
                    " device; its zones were kept but are not shown until you"
                    " re-draw them on the device's card.",
                    location,
                )
        return {STORE_DEVICES: devices, STORE_ORPHANS: orphans}


def _parse_entry(raw: Any, device_id: str | None = None) -> dict[str, Any] | None:
    """
    Normalise one stored device entry, or None if it is not a mapping.

    ``device_id`` (the entry's key, an orphan's location name included) only
    names the entry in the warning for each zone that has to be dropped.
    """
    if not isinstance(raw, dict):
        return None
    entry = _empty_device()
    zones = raw.get(STORE_ZONES)
    if isinstance(zones, dict):
        # JSON object keys are strings; zone ids are ints in memory.
        for zone_key, zone_def in zones.items():
            try:
                zone_id = int(zone_key)
            except TypeError, ValueError:
                _LOGGER.warning(
                    "Apollo mmWave: dropped zone '%s' of '%s' from %s; its key"
                    " is not a zone number.",
                    zone_key,
                    device_id,
                    STORAGE_KEY,
                )
                continue
            if isinstance(zone_def, dict):
                entry[STORE_ZONES][zone_id] = zone_def
            else:
                _LOGGER.warning(
                    "Apollo mmWave: dropped zone %s of '%s' from %s; its"
                    " definition is not an object.",
                    zone_key,
                    device_id,
                    STORAGE_KEY,
                )
    entities = raw.get(STORE_ENTITIES)
    if isinstance(entities, list):
        entry[STORE_ENTITIES] = entities
    rotation = raw.get(ATTR_ROTATION_DEG)
    if rotation is not None:
        entry[ATTR_ROTATION_DEG] = rotation
    label = raw.get(STORE_LABEL)
    if isinstance(label, str):
        entry[STORE_LABEL] = label
    aliases = raw.get(STORE_ALIASES)
    if isinstance(aliases, list):
        names = [alias for alias in aliases if isinstance(alias, str)]
        if names:
            entry[STORE_ALIASES] = names
    # Absent stays absent (millimetres). A value the service could never have
    # written is dropped rather than carried, so it reads as millimetres too.
    units = raw.get(STORE_INPUT_UNITS)
    if isinstance(units, str) and units in INPUT_UNIT_FACTORS:
        entry[STORE_INPUT_UNITS] = units
    return entry


class ZoneStore:
    """All zone state for the integration, persisted to disk."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Create the store; call ``async_load`` before first use."""
        self._store: Store[dict[str, Any]] = _MigratingStore(
            hass, STORAGE_VERSION, STORAGE_KEY
        )
        self.devices: dict[str, dict[str, Any]] = {}
        self.orphans: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> bool:
        """Load from disk. Returns False when there is no usable store file."""
        data = await self._store.async_load()
        if data is None:
            return False
        if not isinstance(data, dict):
            # Same outcome as a missing file: setup runs the legacy migration
            # and saves over this one, instead of failing with a traceback.
            _LOGGER.error(
                "Apollo mmWave: zone store payload is a %s, not an object; ignoring it",
                type(data).__name__,
            )
            return False
        self.devices = {}
        self.orphans = {}
        # The next save writes out only what was kept, which makes every drop
        # permanent, so each one is reported by its key.
        for device_id, raw in (data.get(STORE_DEVICES) or {}).items():
            entry = _parse_entry(raw, device_id)
            if entry is None:
                _LOGGER.warning(
                    "Apollo mmWave: dropped the entry for device '%s' from %s;"
                    " it is not an object.",
                    device_id,
                    STORAGE_KEY,
                )
                continue
            self.devices[device_id] = entry
        for location, raw in (data.get(STORE_ORPHANS) or {}).items():
            entry = _parse_entry(raw, location)
            if entry is None:
                _LOGGER.warning(
                    "Apollo mmWave: dropped the unmatched location '%s' from %s;"
                    " it is not an object.",
                    location,
                    STORAGE_KEY,
                )
                continue
            self.orphans[location] = entry
        return True

    def device(self, device_id: str) -> dict[str, Any]:
        """Return the mutable data dict for a device, creating it if new."""
        return self.devices.setdefault(device_id, _empty_device())

    def zone(self, device_id: str, zone_id: int) -> dict[str, Any] | None:
        """Return a zone definition or None, without creating the device."""
        # Read through `devices`, not `device()`: that one is a setdefault, and
        # asking for a zone must not write down an entry for an unknown device.
        zones = (self.devices.get(device_id) or {}).get(STORE_ZONES) or {}
        zone_def = zones.get(zone_id)
        return zone_def if isinstance(zone_def, dict) else None

    def async_delay_save(self) -> None:
        """Schedule a debounced write-out of the current data."""
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY_SECONDS)

    async def async_save(self) -> None:
        """Write the current data out immediately (used by tests/teardown)."""
        await self._store.async_save(self._data_to_save())

    async def async_remove(self) -> None:
        """Delete the store file (config entry removed)."""
        await self._store.async_remove()

    def _data_to_save(self) -> dict[str, Any]:
        return {STORE_DEVICES: self.devices, STORE_ORPHANS: self.orphans}
