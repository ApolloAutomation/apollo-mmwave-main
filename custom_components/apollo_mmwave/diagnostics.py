"""
Diagnostics: the support file an administrator downloads for Apollo support.

Settings > Devices & services > Apollo mmWave > three dots > Download
diagnostics. Home Assistant wraps what ``async_get_config_entry_diagnostics``
returns with its own system details, the custom integrations and their
versions, and this integration's manifest. This adds what answering a support
question takes: the integration and Home Assistant versions, the unit system,
the entry's dashboard options, the Lovelace resource rows this integration
owns, and per Apollo radar its model, firmware, which radars were found, the
LD2450 target pairs with their readings, the zone store entry and the
calibration results.

Read only. Nothing here writes a device setting, a store, a dashboard or a
resource row, and no cache is filled: the tracked LD2450 pairs are read the
way ``effective_target_pairs`` answers, without its cache fill, and the
Lovelace resource collection is read only once it has loaded, because its
first load can import resources from an old dashboard config and save both
files. Setup has loaded it by the time anyone downloads this.

Only the entities named below are read, so the radar's IP address, MAC, BT MAC
and Wi-Fi SSID sensors are never collected. ``async_redact_data`` over the
whole result is the second net, for one of those keys a later field might
carry. Device names stay, because support needs them to tell radars apart.
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.components.update.const import (
    ATTR_IN_PROGRESS,
    ATTR_INSTALLED_VERSION,
    ATTR_LATEST_VERSION,
)
from homeassistant.const import ATTR_DEVICE_CLASS, ATTR_UNIT_OF_MEASUREMENT
from homeassistant.const import __version__ as ha_version
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.loader import async_get_integration

from .calibration import calibration_payload
from .const import (
    CONF_DASHBOARD_DEVICES,
    CONF_DASHBOARD_ID,
    CONF_DASHBOARD_URL_PATH,
    DATA_CALIBRATION_STORE,
    DATA_PAIR_CACHE,
    DATA_RESOURCE_URLS,
    DATA_STORE,
    DOMAIN,
    STATIC_URL_BASE,
    STORE_ENTITIES,
    STORE_ZONES,
)
from .frontend import async_dashboard_owned
from .gates import resolve_gate_entities
from .ld2450 import resolve_target_pairs

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant

    from .calibration_store import CalibrationStore
    from .store import ZoneStore

_LOGGER = logging.getLogger(__name__)

# Redacted wherever they appear. None of them is collected today; this catches
# one that a later field, or a value stored verbatim, carries.
TO_REDACT = {
    "access_token",
    "bssid",
    "bt_mac",
    "configuration_url",
    "connections",
    "host",
    "ip",
    "ip_address",
    "mac",
    "mac_address",
    "password",
    "refresh_token",
    "ssid",
    "token",
    "user_id",
    "wifi_ssid",
}

# The radars each Apollo model carries, by lower-cased model prefix, because
# hardware variants extend the model string (R-PRO-1-W, MSR-2_BLE). This is
# `APOLLO_MODELS` in frontend-src/src/profiles.ts, which detects the same
# hardware the same way; tests/test_diagnostics.py keeps the two equal.
APOLLO_MANUFACTURER = "apolloautomation"
MODEL_RADARS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("msr-1", ("ld2410",)),
    ("msr-2", ("ld2410",)),
    ("mtr-1", ("ld2450",)),
    ("r-pro-1", ("ld2412", "ld2450")),
)


def _suffix(name: str) -> re.Pattern[str]:
    """Match an object id ending in ``name``, with HA's ``_2`` dedup tail."""
    return re.compile(rf"(?:^|_){name}(?:_\d+)?$")


# Version sensors by what they report. The MSR firmware names the LD2410's
# "Radar Firmware Version"; the R PRO-1 and MTR-1 name theirs after the chip.
_VERSION_SENSORS = {
    "apollo": _suffix("apollo_firmware_version"),
    "esphome": _suffix("esphome_version"),
    "ld2410": _suffix("radar_firmware_version"),
    "ld2412": _suffix("ld2412_firmware"),
    "ld2450": _suffix("ld2450_firmware"),
}
# "LD2450 Zone Type" on the R PRO-1, "Zone Type" on the MTR-1: both end alike.
_ZONE_TYPE = _suffix("zone_type")
_MULTI_TARGET_TRACKING = _suffix("multi_target_tracking")
_RSSI = _suffix("rssi")


def apollo_radars(device: dr.DeviceEntry | None) -> list[str] | None:
    """Return the radars an Apollo model carries, or None for any other device."""
    if device is None or not device.manufacturer or not device.model:
        return None
    if device.manufacturer.lower() != APOLLO_MANUFACTURER:
        return None
    model = device.model.lower()
    return next(
        (list(radars) for prefix, radars in MODEL_RADARS if model.startswith(prefix)),
        None,
    )


def _find(
    entries: list[er.RegistryEntry], domain: str, pattern: re.Pattern[str]
) -> str | None:
    """Return the first entity of a domain whose object id matches, or None."""
    return next(
        (
            entry.entity_id
            for entry in entries
            if entry.domain == domain
            and pattern.search(entry.entity_id.partition(".")[2])
        ),
        None,
    )


def _entity(hass: HomeAssistant, entity_id: Any) -> dict[str, Any]:
    """Return one entity's state, unit, device class and registry status."""
    if not isinstance(entity_id, str):
        # A configured pair is stored verbatim, so it may hold anything.
        return {"entity_id": entity_id, "registered": False}
    entry = er.async_get(hass).async_get(entity_id)
    state = hass.states.get(entity_id)
    attributes = state.attributes if state is not None else {}
    return {
        "entity_id": entity_id,
        "state": _state(hass, entity_id),
        "unit_of_measurement": attributes.get(ATTR_UNIT_OF_MEASUREMENT),
        "device_class": attributes.get(ATTR_DEVICE_CLASS),
        "registered": entry is not None,
        "disabled_by": entry.disabled_by if entry is not None else None,
    }


def _state(hass: HomeAssistant, entity_id: str) -> str | None:
    """Return an entity's state, or None when it has no state object."""
    state = hass.states.get(entity_id)
    return state.state if state is not None else None


def _found(hass: HomeAssistant, entity_id: str | None) -> dict[str, Any] | None:
    """Return ``_entity`` for an entity that was found, else None."""
    return _entity(hass, entity_id) if entity_id is not None else None


def _pairs(hass: HomeAssistant, pairs: Any) -> list[dict[str, Any]]:
    """Return each X/Y pair with both entities' readings."""
    if not isinstance(pairs, list):
        return []
    return [
        {axis: _entity(hass, pair.get(axis)) for axis in ("x", "y")}
        if isinstance(pair, dict)
        else {"pair": pair}
        for pair in pairs
    ]


def _target_pairs(
    hass: HomeAssistant, device_id: str, zone_entry: dict[str, Any] | None
) -> dict[str, Any]:
    """
    Return the pairs the radar offers and the pairs its zones track.

    ``tracked`` is what ``effective_target_pairs`` answers: the configured list
    when there is one (empty means the user cleared it), else the cached pairs,
    else the radar's own. It reads the cache without filling it.
    """
    detected = resolve_target_pairs(hass, device_id)
    configured = (zone_entry or {}).get(STORE_ENTITIES)
    if configured is not None:
        source = "configured" if configured else "cleared"
        tracked = configured
    else:
        source = "detected"
        cache = hass.data.get(DOMAIN, {}).get(DATA_PAIR_CACHE) or {}
        tracked = cache.get(device_id, detected)
    return {
        "source": source,
        "tracked": _pairs(hass, tracked),
        "detected": _pairs(hass, detected),
    }


def _ld2450(
    hass: HomeAssistant,
    device_id: str,
    entries: list[er.RegistryEntry],
    zone_entry: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """
    Return the LD2450's Zone Type, Multi Target Tracking and target pairs.

    None for a radar with no LD2450 and no configured pairs, an MSR-1 or MSR-2.
    """
    zone_type = _find(entries, "select", _ZONE_TYPE)
    tracking = _find(entries, "switch", _MULTI_TARGET_TRACKING)
    pairs = _target_pairs(hass, device_id, zone_entry)
    found = bool(zone_type or tracking or pairs["detected"])
    if not found and pairs["source"] == "detected":
        return None
    return {
        "found": found,
        "zone_type": _found(hass, zone_type),
        "multi_target_tracking": _found(hass, tracking),
        "target_pairs": pairs,
    }


def _firmware(hass: HomeAssistant, entries: list[er.RegistryEntry]) -> dict[str, Any]:
    """Return the version sensors and every update entity on the device."""
    firmware: dict[str, Any] = {
        role: _found(hass, _find(entries, "sensor", pattern))
        for role, pattern in _VERSION_SENSORS.items()
    }
    updates = []
    for entry in entries:
        if entry.domain != "update":
            continue
        state = hass.states.get(entry.entity_id)
        attributes = state.attributes if state is not None else {}
        updates.append(
            {
                **_entity(hass, entry.entity_id),
                ATTR_INSTALLED_VERSION: attributes.get(ATTR_INSTALLED_VERSION),
                ATTR_LATEST_VERSION: attributes.get(ATTR_LATEST_VERSION),
                ATTR_IN_PROGRESS: attributes.get(ATTR_IN_PROGRESS),
            }
        )
    firmware["updates"] = updates
    return firmware


def _gate_radar(hass: HomeAssistant, device_id: str) -> dict[str, Any] | None:
    """Return the gate radar's profile and every threshold's current state."""
    gates = resolve_gate_entities(hass, device_id)
    if gates is None:
        return None
    return {
        "profile": gates.profile,
        "gate_count": gates.gate_count,
        # "unknown" here is a radar that never reported its settings.
        "thresholds": {
            channel: {
                str(gate): _state(hass, entity_id)
                for gate, entity_id in sorted(table.items())
            }
            for channel, table in (
                ("move", gates.move_threshold),
                ("still", gates.still_threshold),
            )
        },
    }


def _zone_entry(entry: dict[str, Any] | None) -> dict[str, Any] | None:
    """Return a zone store entry with its zone ids as JSON keys."""
    if entry is None:
        return None
    result = dict(entry)
    zones = result.get(STORE_ZONES)
    if isinstance(zones, dict):
        # Zone ids are ints in the store; JSON object keys can only be strings.
        result[STORE_ZONES] = {str(zone_id): zone for zone_id, zone in zones.items()}
    return result


def _device_info(hass: HomeAssistant, device: dr.DeviceEntry) -> dict[str, Any]:
    """Return the registry fields support reads, and none that hold a MAC or IP."""
    # Home Assistant 2026.10 gives a device one config entry, as
    # config_entry_id, and deprecates the config_entries set; older versions
    # only have the set.
    entry_ids = (
        {device.config_entry_id}
        if hasattr(device, "config_entry_id")
        else device.config_entries
    )
    domains = {
        config_entry.domain
        for entry_id in entry_ids
        if (config_entry := hass.config_entries.async_get_entry(entry_id))
    }
    return {
        "name": device.name,
        "name_by_user": device.name_by_user,
        "manufacturer": device.manufacturer,
        "model": device.model,
        "model_id": device.model_id,
        "sw_version": device.sw_version,
        "hw_version": device.hw_version,
        "disabled_by": device.disabled_by,
        "integrations": sorted(domains),
    }


def _device(
    hass: HomeAssistant,
    device_id: str,
    store: ZoneStore | None,
    dashboard_devices: list[str],
) -> dict[str, Any]:
    """Return everything support reads about one radar."""
    device = dr.async_get(hass).async_get(device_id)
    every_entry = er.async_entries_for_device(
        er.async_get(hass), device_id, include_disabled_entities=True
    )
    # The radar's own entities; this integration's zone entities are listed
    # apart, and the version and LD2450 lookups must never match one of them.
    entries = [entry for entry in every_entry if entry.platform != DOMAIN]
    zone_entry = store.devices.get(device_id) if store is not None else None
    gate_radar = _gate_radar(hass, device_id)
    ld2450 = _ld2450(hass, device_id, entries, zone_entry)
    # A section can exist for configured pairs alone, on a radar without one.
    ld2450_found = bool(ld2450 and ld2450.pop("found"))
    return {
        "device_id": device_id,
        "registered": device is not None,
        **(_device_info(hass, device) if device is not None else {}),
        "selected_for_dashboard": device_id in dashboard_devices,
        "radars": {
            "expected": apollo_radars(device),
            "gate_radar": gate_radar["profile"] if gate_radar else None,
            "ld2450": ld2450_found,
        },
        "firmware": _firmware(hass, entries),
        "wifi_signal": _found(hass, _find(entries, "sensor", _RSSI)),
        "gate_radar": gate_radar,
        "ld2450": ld2450,
        "calibration": calibration_payload(hass, device_id),
        "zone_store": _zone_entry(zone_entry),
        "zone_entities": sorted(
            (
                _entity(hass, entry.entity_id)
                for entry in every_entry
                if entry.platform == DOMAIN
            ),
            key=lambda info: info["entity_id"],
        ),
    }


def _device_ids(
    hass: HomeAssistant,
    store: ZoneStore | None,
    calibration_store: CalibrationStore | None,
    dashboard_devices: list[str],
) -> list[str]:
    """
    Return every radar worth a section, by name.

    Apollo radars in the device registry, plus any device the zone store, the
    calibration store or the dashboard's device list names, which covers a DIY
    radar with zones and a radar that has since left the registry.
    """
    # Every Apollo radar is an ESPHome device. Reading the registry through
    # the ESPHome config entries avoids `registry.devices` as a mapping, which
    # Home Assistant deprecates.
    registry = dr.async_get(hass)
    ids = {
        device.id
        for esphome_entry in hass.config_entries.async_entries("esphome")
        for device in dr.async_entries_for_config_entry(
            registry, esphome_entry.entry_id
        )
        if apollo_radars(device) is not None
    }
    if store is not None:
        ids.update(store.devices)
    if calibration_store is not None:
        ids.update(calibration_store.devices)
    ids.update(dashboard_devices)

    def _order(device_id: str) -> tuple[str, str]:
        device = registry.async_get(device_id)
        name = (device.name_by_user or device.name or "") if device else ""
        return name.lower(), device_id

    return sorted(ids, key=_order)


def _lovelace(hass: HomeAssistant) -> dict[str, Any]:
    """Return the resource mode, the urls this run serves and our resource rows."""
    lovelace = hass.data.get(LOVELACE_DATA)
    rows: list[dict[str, Any]] | None = None
    try:
        resources = getattr(lovelace, "resources", None)
        # Not loading it: see the module docstring. A YAML collection reports
        # itself loaded.
        if resources is not None and getattr(resources, "loaded", True):
            prefix = f"{STATIC_URL_BASE}/"
            rows = [
                {"url": item.get("url"), "type": item.get("type")}
                for item in resources.async_items()
                if str(item.get("url", "")).startswith(prefix)
            ]
    except Exception:
        # Lovelace internals are not a public contract; the file still goes out.
        _LOGGER.debug("Apollo mmWave: could not read the resources", exc_info=True)
        rows = None
    return {
        "resource_mode": getattr(lovelace, "resource_mode", None),
        "served_urls": list(hass.data.get(DOMAIN, {}).get(DATA_RESOURCE_URLS) or []),
        # None when the collection could not be read without loading it.
        "resource_rows": rows,
    }


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    """Return the support file for the Apollo mmWave entry."""
    data = hass.data.get(DOMAIN, {})
    store: ZoneStore | None = data.get(DATA_STORE)
    calibration_store: CalibrationStore | None = data.get(DATA_CALIBRATION_STORE)
    options = dict(entry.options)
    dashboard_devices = [
        device_id
        for device_id in options.get(CONF_DASHBOARD_DEVICES) or []
        if isinstance(device_id, str)
    ]
    integration = await async_get_integration(hass, DOMAIN)
    result = {
        "versions": {
            "integration": str(integration.version) if integration.version else None,
            "home_assistant": ha_version,
        },
        # What the cards read: a length of "mi" makes them show feet.
        "unit_system": hass.config.units.as_dict(),
        "entry": {
            "title": entry.title,
            "state": entry.state.value,
            "version": entry.version,
            "minor_version": entry.minor_version,
            "options": options,
            # Whether the recorded dashboard is still our strategy: True,
            # False, or None when the dashboards could not be read.
            "dashboard_is_ours": await async_dashboard_owned(
                hass,
                options.get(CONF_DASHBOARD_ID),
                options.get(CONF_DASHBOARD_URL_PATH),
            ),
        },
        "lovelace": _lovelace(hass),
        # False while the entry is not loaded: the stores are then not read.
        "zone_store_loaded": store is not None,
        "calibration_store_loaded": calibration_store is not None,
        "orphans": {
            location: _zone_entry(orphan)
            for location, orphan in (store.orphans if store is not None else {}).items()
        },
        "devices": [
            _device(hass, device_id, store, dashboard_devices)
            for device_id in _device_ids(
                hass, store, calibration_store, dashboard_devices
            )
        ],
    }
    return async_redact_data(result, TO_REDACT)
