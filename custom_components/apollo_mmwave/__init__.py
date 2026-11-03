"""Apollo mmWave: zone-mapping backend + bundled radar-tuning dashboard."""

from __future__ import annotations

import asyncio
import logging
import math
from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.const import Platform
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.util import slugify

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine

    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant, ServiceCall
    from homeassistant.helpers.typing import ConfigType

from .calibration import async_setup_calibration
from .calibration_store import CalibrationStore
from .const import (
    ATTR_CX,
    ATTR_CY,
    ATTR_DATA,
    ATTR_NAME,
    ATTR_POINTS,
    ATTR_ROTATION_DEG,
    ATTR_RX,
    ATTR_RY,
    ATTR_SHAPE,
    ATTR_X_MAX,
    ATTR_X_MIN,
    ATTR_Y_MAX,
    ATTR_Y_MIN,
    CONF_AUTO_CREATE_VIEW,
    CONF_DASHBOARD_ID,
    CONF_DASHBOARD_URL_PATH,
    DASHBOARD_URL_PATH,
    DATA_MOVEMENT,
    DATA_STORE,
    DISPLAY_UNITS,
    DISPLAY_UNITS_AUTO,
    DOMAIN,
    ENTRY_MINOR_VERSION,
    EVENT_ZONE_UPDATED,
    HOLD_S_MAX,
    INPUT_UNIT_FACTORS,
    POLYGON_MAX_POINTS,
    POLYGON_MIN_POINTS,
    SERVICE_UPDATE_ZONE,
    SHAPE_ELLIPSE,
    SHAPE_NONE,
    SHAPE_POLYGON,
    SHAPE_RECT,
    SIGNAL_ZONES_UPDATED,
    STORE_ALIASES,
    STORE_DISPLAY_UNITS,
    STORE_ENTITIES,
    STORE_HOLD_S,
    STORE_INPUT_UNITS,
    STORE_LABEL,
    STORE_MIRROR_X,
    STORE_MOVEMENT_HISTORY,
    STORE_ZONE_TYPE,
    STORE_ZONES,
    SUPPORTED_SHAPES,
    WARN_ELLIPSE_INVALID,
    WARN_ELLIPSE_NON_POSITIVE,
    WARN_POLY_INSUFFICIENT,
    WARN_POLY_MALFORMED,
    WARN_POLY_TRUNCATING,
    WARN_RECT_INVALID,
    WARN_RECT_NON_NUM,
    WARN_ZONE_NO_GEOMETRY,
    ZONE_TYPE_DETECT,
    ZONE_TYPE_IGNORE,
    ZONE_TYPES,
)
from .frontend import (
    DashboardsUnreadableError,
    async_find_legacy_dashboard,
    async_register_frontend_assets,
    async_remove_dashboard,
    async_remove_lovelace_resources,
)
from .ld2450 import async_track_target_pairs
from .migration import (
    async_import_zone_mapper,
    async_migrate_legacy,
    async_migrate_unique_ids,
)
from .movement import MovementHistory, async_remove_movement_store
from .store import ZoneStore, device_flag, zone_hold_s, zone_type_of
from .websocket import async_register as async_register_websocket

# Every module setup uses is imported here, at module level. Home Assistant
# imports this package in its import executor, so the files are read off the
# event loop; an import inside an async function would read them on it.

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

PLATFORMS = [Platform.BINARY_SENSOR, Platform.SENSOR]

# hass.data flag so the `location` deprecation is logged once per run. The card
# calls update_zone on every rotation drag, which would otherwise flood the log.
_DATA_LOCATION_WARNED = "location_deprecation_warned"

# The largest integer a zone coordinate or zone id may be: JavaScript's
# Number.MAX_SAFE_INTEGER. Home Assistant writes the zone store, websocket
# replies and recorder rows with orjson, which refuses integers outside 64
# bits, so one bigger value made every later store write fail for every radar;
# the card could not read such a number exactly either. This is a
# serialization limit, not a geometry bound.
_MAX_SAFE_INT = 2**53 - 1


def get_store(hass: HomeAssistant) -> ZoneStore:
    """Return the loaded ZoneStore (setup guarantees it exists)."""
    return hass.data[DOMAIN][DATA_STORE]


def _finite_float(value: Any) -> float | None:
    """Return the value as a finite float, or None if it is not one."""
    if value is None:
        return None
    try:
        result = float(value)
    except TypeError, ValueError, OverflowError:
        # OverflowError: an int too large for a float, such as a long YAML
        # integer literal.
        return None
    # round() raises on inf (OverflowError) and nan (ValueError), so neither
    # may reach it. They are treated like any other value that is not a number.
    return result if math.isfinite(result) else None


# TODO(REVIEW_REPORT.md X17): booleans and YAML on/off  # noqa: FIX002, TD003
# pass as 1/0 here, and for rotation and zone_id, as HA's own validators
# do. If unwanted, refuse bool in both _coerce_float copies and the schema.
def _coerce_float(value: Any) -> float | None:
    """Return a zone coordinate as a float, or None if it cannot be stored."""
    result = _finite_float(value)
    if result is None or abs(result) > _MAX_SAFE_INT:
        return None
    return result


def _sanitize_rotation(rotation: Any) -> int | None:
    # Not `_coerce_float`: a huge but finite angle still clamps to the nearest
    # end of the range, as it always has. Only inf and nan are ignored.
    value = _finite_float(rotation)
    if value is None:
        return None
    return max(-180, min(180, round(value)))


# TODO(REVIEW_REPORT.md X14): a blank name is stored and  # noqa: FIX002, TD003
# pins the bare base as the registry name. Consider stripping it and
# treating blank as a clear (services.yaml documents today's result).
def _coerce_zone_name(name: Any) -> str | None:
    if name is None:
        return None
    if isinstance(name, str):
        return name
    return str(name)


def _normalize_entities(entities: Any) -> list[dict[str, str]] | None:
    """
    Normalize a pairs list. An EMPTY list means "no change", not "erase".

    Cards send their whole in-memory pair list on every zone edit, and a card
    that has not finished loading sends an empty one. Treating that as an erase
    destroyed real user configuration (two reported cases). Emptying the list is
    only ever done through `clear_entities: true`, which is explicit.
    """
    if not isinstance(entities, list) or not entities:
        return None
    normalized: list[dict[str, str]] = []
    for pair in entities:
        if not isinstance(pair, dict):
            continue
        x_id = pair.get("x")
        y_id = pair.get("y")
        if isinstance(x_id, str) and isinstance(y_id, str):
            normalized.append({"x": x_id, "y": y_id})
    # Same rule once validation is done: nothing left is still not an erase.
    return normalized or None


def _normalize_zone_payload(
    shape: str, data: Any, zone_id: int, device_id: str
) -> dict[str, Any] | None:
    if shape == SHAPE_NONE or data is None:
        return None
    if shape == SHAPE_RECT:
        return _normalize_rect(data, zone_id, device_id)
    if shape == SHAPE_ELLIPSE:
        return _normalize_ellipse(data, zone_id, device_id)
    if shape == SHAPE_POLYGON:
        return _normalize_polygon(data, zone_id, device_id)
    return None


def _normalize_rect(data: Any, zone_id: int, device_id: str) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None
    x_min = _coerce_float(data.get(ATTR_X_MIN))
    x_max = _coerce_float(data.get(ATTR_X_MAX))
    y_min = _coerce_float(data.get(ATTR_Y_MIN))
    y_max = _coerce_float(data.get(ATTR_Y_MAX))
    if x_min is None or x_max is None or y_min is None or y_max is None:
        _LOGGER.warning(WARN_RECT_NON_NUM, zone_id, device_id)
        return None
    x_min_i = round(x_min)
    x_max_i = round(x_max)
    y_min_i = round(y_min)
    y_max_i = round(y_max)
    if not (x_min_i < x_max_i and y_min_i < y_max_i):
        _LOGGER.warning(WARN_RECT_INVALID, zone_id, device_id)
        return None
    # Only the bounds are kept, as for an ellipse: an extra caller key would be
    # stored, published as an attribute, and could hold a value (an int past
    # 64 bits, say) that makes every later store write fail.
    return {
        ATTR_X_MIN: x_min_i,
        ATTR_X_MAX: x_max_i,
        ATTR_Y_MIN: y_min_i,
        ATTR_Y_MAX: y_max_i,
    }


def _normalize_ellipse(
    data: Any, zone_id: int, device_id: str
) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None
    cx = _coerce_float(data.get(ATTR_CX))
    cy = _coerce_float(data.get(ATTR_CY))
    rx = _coerce_float(data.get(ATTR_RX))
    ry = _coerce_float(data.get(ATTR_RY))
    if cx is None or cy is None or rx is None or ry is None:
        _LOGGER.warning(WARN_ELLIPSE_INVALID, zone_id, device_id)
        return None
    if rx <= 0 or ry <= 0:
        _LOGGER.warning(WARN_ELLIPSE_NON_POSITIVE, zone_id, device_id)
        return None
    return {
        ATTR_CX: round(cx),
        ATTR_CY: round(cy),
        ATTR_RX: max(1, round(rx)),
        ATTR_RY: max(1, round(ry)),
    }


def _normalize_polygon(
    data: Any, zone_id: int, device_id: str
) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None
    points = data.get(ATTR_POINTS)
    if not isinstance(points, list) or len(points) < POLYGON_MIN_POINTS:
        _LOGGER.warning(WARN_POLY_INSUFFICIENT, zone_id, device_id, POLYGON_MIN_POINTS)
        return None
    total_points = len(points)
    # TODO(REVIEW_REPORT.md X11): slicing before the filter  # noqa: FIX002, TD003
    # lets malformed points use up slots; filter, then slice (limit stays 32).
    trimmed = list(points[:POLYGON_MAX_POINTS])
    if total_points > POLYGON_MAX_POINTS:
        _LOGGER.warning(
            WARN_POLY_TRUNCATING, zone_id, device_id, total_points, POLYGON_MAX_POINTS
        )
    normalized_points = []
    for point in trimmed:
        if not isinstance(point, dict):
            continue
        x_float = _coerce_float(point.get("x"))
        y_float = _coerce_float(point.get("y"))
        if x_float is None or y_float is None:
            continue
        normalized_points.append({"x": round(x_float), "y": round(y_float)})
    if len(normalized_points) < POLYGON_MIN_POINTS:
        _LOGGER.warning(
            WARN_POLY_MALFORMED,
            zone_id,
            device_id,
            len(trimmed),
            len(normalized_points),
            POLYGON_MIN_POINTS,
        )
        return None
    # Only the points are kept, for the same reason as in _normalize_rect.
    return {ATTR_POINTS: normalized_points}


def _zone_entity_unique_ids(device_id: str, zone_id: int) -> tuple[str, str]:
    return (
        f"{device_id}_zone_{zone_id}",
        f"{device_id}_zone_{zone_id}_presence",
    )


def _is_generated_name(name: str | None, base: str) -> bool:
    """Report whether a registry name is one this integration wrote."""
    return name is None or name == base or name.startswith(f"{base} - ")


def _update_registry_names(
    hass: HomeAssistant, device_id: str, zone_id: int, zone_name: str
) -> None:
    # The registry `name` is the same field the entity settings dialog edits.
    # A name the user typed there is theirs: a zone rename only rewrites a
    # name that is still one of ours, so "Kitchen door" stays "Kitchen door".
    registry = er.async_get(hass)
    sensor_uid, presence_uid = _zone_entity_unique_ids(device_id, zone_id)
    # The zone list's Save sends the default name for a cleared field, and
    # for a row nobody touched: a clear, never "Zone 1 - Zone 1".
    default = zone_name == f"Zone {zone_id}"

    for domain, unique_id, base in (
        ("sensor", sensor_uid, f"Zone {zone_id}"),
        ("binary_sensor", presence_uid, f"Zone {zone_id} presence"),
    ):
        entity_id = registry.async_get_entity_id(domain, DOMAIN, unique_id)
        if not entity_id:
            continue
        entry = registry.async_get(entity_id)
        if entry is not None and not _is_generated_name(entry.name, base):
            continue
        if default and (entry is None or entry.name is None):
            # Never named, so there is nothing to clear.
            continue
        registry.async_update_entity(
            entity_id,
            name=f"{base} - {zone_name}" if zone_name and not default else base,
        )


def _clear_generated_names(hass: HomeAssistant, device_id: str, zone_id: int) -> None:
    # Add Zone reuses the lowest free zone id, and Home Assistant restores a
    # deleted entity's registry name, and its entity id, when the same unique
    # id is registered again. So a new zone 1 would come back as "Zone 1
    # presence - Couch", and automations written for the old zone would
    # follow it. A name this integration wrote is cleared; one the user typed
    # stays. The entity id comes back all the same: no public API stops that.
    registry = er.async_get(hass)
    sensor_uid, presence_uid = _zone_entity_unique_ids(device_id, zone_id)
    for domain, unique_id, base in (
        ("sensor", sensor_uid, f"Zone {zone_id}"),
        ("binary_sensor", presence_uid, f"Zone {zone_id} presence"),
    ):
        entity_id = registry.async_get_entity_id(domain, DOMAIN, unique_id)
        entry = registry.async_get(entity_id) if entity_id else None
        if (
            entry is not None
            and entry.name is not None
            and _is_generated_name(entry.name, base)
        ):
            registry.async_update_entity(entry.entity_id, name=None)


def _remove_zone_entities(hass: HomeAssistant, device_id: str, zone_id: int) -> None:
    registry = er.async_get(hass)
    sensor_uid, presence_uid = _zone_entity_unique_ids(device_id, zone_id)

    sensor_eid = registry.async_get_entity_id("sensor", DOMAIN, sensor_uid)
    if sensor_eid:
        registry.async_remove(sensor_eid)

    presence_eid = registry.async_get_entity_id("binary_sensor", DOMAIN, presence_uid)
    if presence_eid:
        registry.async_remove(presence_eid)


def _notify_zones_updated(hass: HomeAssistant, device_id: str) -> None:
    """Persist and fan out a zone change (internal signal + public event)."""
    get_store(hass).async_delay_save()
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    hass.bus.async_fire(EVENT_ZONE_UPDATED, {"device_id": device_id})


def _device_id_for_label(store: ZoneStore, location: Any) -> str | None:
    """Resolve a deprecated `location` value against the stored device labels."""
    # Matching is slug-based so a v1 automation still hits its device however the
    # name was capitalized or punctuated. Only stored names are consulted: the
    # service must not invent a target the store has never heard of.
    if not isinstance(location, str) or not location.strip():
        return None
    # TODO(REVIEW_REPORT.md X16): labels that slugify alike  # noqa: FIX002, TD003
    # resolve by store order with no warning, and '???' matches '!!!' via the
    # 'unknown' slug. Try an exact match, then a unique slug match, else warn.
    wanted = slugify(location)
    for device_id, entry in store.devices.items():
        label = entry.get(STORE_LABEL)
        if isinstance(label, str) and slugify(label) == wanted:
            return device_id
    # A second v1 name that merged onto a device is as valid a target as the
    # label, but a label wins a tie, the same as in the unique-id rewrite.
    for device_id, entry in store.devices.items():
        if any(slugify(alias) == wanted for alias in entry.get(STORE_ALIASES, [])):
            return device_id
    return None


def _device_is_registered(hass: HomeAssistant, device_id: str) -> bool:
    """Report whether the id still names a device Home Assistant knows about."""
    # Every path into `store.device()` goes through this. That call is a
    # setdefault, so an id no Home Assistant device answers to becomes a phantom
    # store entry: persisted forever, rendering nothing, reported as vanished
    # zones.
    return dr.async_get(hass).async_get(device_id) is not None


def _device_id_from_call(hass: HomeAssistant, call: ServiceCall) -> str | None:
    """Read `device_id` off a call, or None if it names no real device."""
    raw = call.data.get("device_id")
    # An automation written with `target:` instead of `data:` arrives with
    # device_id as a list, and hand-written YAML does that legitimately. More
    # than one is refused rather than guessed at: a zone belongs to one radar.
    if isinstance(raw, list):
        if len(raw) > 1:
            _LOGGER.warning(
                "Apollo mmWave: update_zone was targeted at %d devices, but a zone"
                " belongs to exactly one radar; nothing was changed.",
                len(raw),
            )
            return None
        raw = raw[0] if raw else None
    if not isinstance(raw, str) or not raw.strip():
        _LOGGER.warning(
            "Apollo mmWave: update_zone was given an empty device_id;"
            " nothing was changed."
        )
        return None
    device_id = raw.strip()
    # A stale id from a copied automation, or from a radar that was removed and
    # re-added, must not reach the store.
    # TODO(REVIEW_REPORT.md X08): zones stored under an id  # noqa: FIX002, TD003
    # that left the registry for good can never be deleted. Accept delete
    # (only) for such an id; do not prune the store on device removal.
    if not _device_is_registered(hass, device_id):
        _LOGGER.warning(
            "Apollo mmWave: update_zone device id '%s' matches no Home Assistant"
            " device; nothing was changed.",
            device_id,
        )
        return None
    return device_id


def _device_id_for_deprecated_location(
    hass: HomeAssistant, store: ZoneStore, call: ServiceCall
) -> str | None:
    """Resolve the v1 `location` alias, warning about it once per run."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    if not domain_data.get(_DATA_LOCATION_WARNED):
        domain_data[_DATA_LOCATION_WARNED] = True
        _LOGGER.warning(
            "Apollo mmWave: the update_zone 'location' field is deprecated and will"
            " be removed in a future release; pass 'device_id' instead."
        )
    location = call.data.get("location")
    resolved = _device_id_for_label(store, location)
    if resolved is None:
        _LOGGER.warning(
            "Apollo mmWave: update_zone location '%s' matches no known radar;"
            " nothing was changed.",
            location,
        )
        return None
    # Nothing prunes a store entry when its device leaves the device registry,
    # so a label outlives the radar it named and keeps resolving to a dead id.
    # Writing through it would rebuild the same phantom entry an unknown
    # device_id does, just by the other door.
    if not _device_is_registered(hass, resolved):
        _LOGGER.warning(
            "Apollo mmWave: the radar behind update_zone location '%s' (device"
            " %s) is no longer in Home Assistant, so nothing was changed. If you"
            " re-added it, re-draw its zones and switch the automation to"
            " device_id.",
            location,
            resolved,
        )
        return None
    return resolved


def _resolve_target_device(
    hass: HomeAssistant, store: ZoneStore, call: ServiceCall
) -> str | None:
    """Return the device id a call targets, or None if it names no known radar."""
    # TODO(REVIEW_REPORT.md X12): location is ignored with  # noqa: FIX002, TD003
    # no deprecation warning when device_id is also given; warn whenever it
    # is present. The schema's 'Exactly one' comment should say at least one.
    if "device_id" in call.data:
        return _device_id_from_call(hass, call)
    if "location" in call.data:
        return _device_id_for_deprecated_location(hass, store, call)
    _LOGGER.warning(
        "Apollo mmWave: update_zone needs a device_id; nothing was changed."
    )
    return None


def _apply_device_settings(
    device: dict[str, Any], call: ServiceCall, rotation: int | None
) -> None:
    """Write the device-wide rotation and units, when the call sets them."""
    if rotation is not None:
        device[ATTR_ROTATION_DEG] = rotation
    input_units = call.data.get("input_units")
    if input_units is not None:
        device[STORE_INPUT_UNITS] = input_units
    display_units = call.data.get(STORE_DISPLAY_UNITS)
    if display_units == DISPLAY_UNITS_AUTO:
        # Absent is how the store says "follow Home Assistant's unit system".
        device.pop(STORE_DISPLAY_UNITS, None)
    elif display_units is not None:
        device[STORE_DISPLAY_UNITS] = display_units


def _apply_entity_pairs(device: dict[str, Any], call: ServiceCall) -> None:
    """Write the tracked pair list, but only when the call really asks for it."""
    # `clear_entities` wins over `entities` when a call carries both: it is the
    # only explicit way to empty the list, so it must not be second-guessed.
    if call.data.get("clear_entities"):
        device[STORE_ENTITIES] = []
        return
    entities = _normalize_entities(call.data.get("entities"))
    if entities is not None:
        device[STORE_ENTITIES] = entities


def _apply_device_flags(device: dict[str, Any], call: ServiceCall) -> None:
    """Write mirror_x and movement_history: on stores True, off forgets the key."""
    # Absent is how the store says off, so False is never written down.
    for key in (STORE_MIRROR_X, STORE_MOVEMENT_HISTORY):
        value = call.data.get(key)
        if value:
            device[key] = True
        elif value is not None:
            device.pop(key, None)


def _zone_settings_in_call(call: ServiceCall) -> bool:
    """Report whether a call carries a zone setting, zone_type or hold_s."""
    return STORE_ZONE_TYPE in call.data or STORE_HOLD_S in call.data


def _apply_zone_settings(zone_entry: dict[str, Any], call: ServiceCall) -> None:
    """Write the call's zone_type and hold_s; a default forgets the key."""
    # Absent means a detect zone with no hold, so neither default is stored.
    zone_type = call.data.get(STORE_ZONE_TYPE)
    if zone_type == ZONE_TYPE_IGNORE:
        zone_entry[STORE_ZONE_TYPE] = ZONE_TYPE_IGNORE
    elif zone_type == ZONE_TYPE_DETECT:
        zone_entry.pop(STORE_ZONE_TYPE, None)
    hold_s = call.data.get(STORE_HOLD_S)
    if hold_s:
        zone_entry[STORE_HOLD_S] = hold_s
    elif hold_s is not None:
        zone_entry.pop(STORE_HOLD_S, None)


def _carry_zone_settings(
    zone_entry: dict[str, Any], existing: dict[str, Any] | None
) -> None:
    """Copy a zone's type and hold time into the dict that replaces it."""
    # A redraw, an Undo, Clear All and shape: none change where a zone is,
    # not what it does. Read through the store's readers, so a hand-edited
    # value that presence ignores is not carried along either.
    if zone_type_of(existing) == ZONE_TYPE_IGNORE:
        zone_entry[STORE_ZONE_TYPE] = ZONE_TYPE_IGNORE
    if hold_s := zone_hold_s(existing):
        zone_entry[STORE_HOLD_S] = hold_s


def _zone_settings_change(call: ServiceCall, zone_def: dict[str, Any]) -> bool:
    """Report whether the call's zone_type or hold_s acts on a stored zone."""
    # Like a map unit, a setting counts even when it is the one stored. A
    # default only forgets a setting, so it counts only when there is one.
    zone_type = call.data.get(STORE_ZONE_TYPE)
    if zone_type == ZONE_TYPE_IGNORE or (
        zone_type == ZONE_TYPE_DETECT and zone_type_of(zone_def) == ZONE_TYPE_IGNORE
    ):
        return True
    hold_s = call.data.get(STORE_HOLD_S)
    if hold_s is None:
        return False
    return hold_s > 0 or zone_hold_s(zone_def) > 0


def _zone_part_changes_something(
    call: ServiceCall, store: ZoneStore, device_id: str, zone_id: int | None
) -> bool:
    """Report whether the zone fields of a call act on a zone."""
    if zone_id is None:
        return False
    if call.data.get("delete") or call.data.get("shape") is not None:
        return True
    # A zone_id alone, or with data but no shape, writes nothing to the zone.
    renames = call.data.get("name") is not None
    settings = _zone_settings_in_call(call)
    if not renames and not settings:
        return False
    # A rename or a zone setting without geometry only lands on a stored zone.
    # `store.zone()` reads through `devices`, so the lookup mints no entry.
    zone_def = store.zone(device_id, zone_id)
    if zone_def is None:
        if settings:
            _LOGGER.warning(
                "Apollo mmWave: update_zone for device '%s' named zone %s, which"
                " does not exist; nothing was applied to it.",
                device_id,
                zone_id,
            )
        else:
            _LOGGER.warning(
                "Apollo mmWave: update_zone for device '%s' named zone %s, which"
                " does not exist; the name was not applied.",
                device_id,
                zone_id,
            )
        return False
    return renames or _zone_settings_change(call, zone_def)


def _display_units_change_something(
    call: ServiceCall, store: ZoneStore, device_id: str
) -> bool:
    """Report whether the call's display_units changes what the card shows."""
    display_units = call.data.get(STORE_DISPLAY_UNITS)
    if display_units is None:
        return False
    if display_units != DISPLAY_UNITS_AUTO:
        # Like input_units, a unit counts even when it is the one stored.
        return True
    # "auto" only forgets a saved unit. Read through `devices`, because
    # `store.device()` would mint an entry for a radar with nothing to forget.
    return STORE_DISPLAY_UNITS in (store.devices.get(device_id) or {})


def _flag_changes_something(
    call: ServiceCall, store: ZoneStore, device_id: str, key: str
) -> bool:
    """Report whether the call's mirror_x or movement_history changes the radar."""
    value = call.data.get(key)
    if value is None:
        return False
    if value:
        # Like a map unit, a flag turned on counts even when it is on.
        return True
    # Off only forgets a stored flag, read through `devices` as for "auto".
    return device_flag(store.devices.get(device_id), key)


def _call_changes_something(
    call: ServiceCall, store: ZoneStore, device_id: str, rotation: int | None
) -> bool:
    """Refuse the schema-legal calls that would change nothing, and say why."""
    zone_id = call.data.get("zone_id")
    if call.data.get("delete") and zone_id is None:
        _LOGGER.warning(
            "Apollo mmWave: update_zone was asked to delete a zone on device"
            " '%s' without a zone_id; nothing was changed.",
            device_id,
        )
        return False
    if call.data.get("data") is not None and call.data.get("shape") is None:
        _LOGGER.warning(
            "Apollo mmWave: update_zone for device '%s' carried zone data"
            " without a shape, so the data was ignored.",
            device_id,
        )
    if zone_id is None and (
        call.data.get("shape") is not None or call.data.get("data") is not None
    ):
        _LOGGER.warning(
            "Apollo mmWave: update_zone for device '%s' carried zone geometry"
            " without a zone_id, so the geometry was ignored.",
            device_id,
        )
    if zone_id is None and _zone_settings_in_call(call):
        _LOGGER.warning(
            "Apollo mmWave: update_zone for device '%s' carried zone_type or"
            " hold_s without a zone_id, so they were ignored.",
            device_id,
        )
    # Evaluated first so a rename of a missing zone is reported even when the
    # call's device-wide fields count on their own and still go through.
    zone_counts = _zone_part_changes_something(call, store, device_id, zone_id)
    if (
        rotation is not None
        or call.data.get("input_units") is not None
        or _display_units_change_something(call, store, device_id)
        or call.data.get("clear_entities")
        or _normalize_entities(call.data.get("entities")) is not None
        or _flag_changes_something(call, store, device_id, STORE_MIRROR_X)
        or _flag_changes_something(call, store, device_id, STORE_MOVEMENT_HISTORY)
        or zone_counts
    ):
        return True
    # `store.device()` is a setdefault: reading it for this call would mint a
    # permanent, empty entry for a radar the call never configured.
    _LOGGER.warning(
        "Apollo mmWave: update_zone for device '%s' carried nothing to change;"
        " nothing was changed.",
        device_id,
    )
    return False


def _write_zone_geometry(
    store: ZoneStore, device_id: str, zone_id: int, call: ServiceCall
) -> str | None:
    """
    Store a zone's new shape, keeping its name, type and hold time.

    Returns the name the zone's entities take in the registry, or None to
    leave their registry names alone.
    """
    shape = call.data["shape"]
    data = call.data.get("data")
    zone_name = _coerce_zone_name(call.data.get("name"))
    # `shape` is one of SUPPORTED_SHAPES here: the schema rejects any other.
    # A drawable shape with no `data` (omitted or null) is still stored, with
    # no geometry, so say so as every rejected geometry does. `none` is the
    # documented way to clear a zone and stays quiet.
    if shape != SHAPE_NONE and data is None:
        _LOGGER.warning(WARN_ZONE_NO_GEOMETRY, zone_id, device_id, shape)

    # Read before the write: the dict built here replaces the stored one.
    existing = store.zone(device_id, zone_id)
    zone_entry = {
        ATTR_SHAPE: shape,
        ATTR_DATA: _normalize_zone_payload(shape, data, zone_id, device_id),
    }

    if zone_name is not None:
        zone_entry[ATTR_NAME] = zone_name
    elif existing is not None and isinstance(existing.get(ATTR_NAME), str):
        zone_entry[ATTR_NAME] = existing[ATTR_NAME]
    _carry_zone_settings(zone_entry, existing)
    _apply_zone_settings(zone_entry, call)

    store.device(device_id)[STORE_ZONES][zone_id] = zone_entry

    # The card's Add Zone creates a zone with its default name. Written to the
    # registry by that creating call, it would make the entities read
    # "Zone 1 - Zone 1".
    if zone_name is None or (existing is None and zone_name == f"Zone {zone_id}"):
        return None
    return zone_name


def _build_update_zone_handler(
    hass: HomeAssistant,
) -> Callable[[ServiceCall], Coroutine[Any, Any, None]]:
    async def update_zone(call: ServiceCall) -> None:
        store = get_store(hass)
        device_id = _resolve_target_device(hass, store, call)
        if device_id is None:
            return

        zone_id = call.data.get("zone_id")
        shape = call.data.get("shape")
        rotation = _sanitize_rotation(call.data.get(ATTR_ROTATION_DEG))
        zone_name = _coerce_zone_name(call.data.get("name"))
        delete_zone = bool(call.data.get("delete"))

        if not _call_changes_something(call, store, device_id, rotation):
            return

        # Read before the flags are written: only a stored flag is turned off.
        history_off = call.data.get(STORE_MOVEMENT_HISTORY) is False and device_flag(
            store.devices.get(device_id), STORE_MOVEMENT_HISTORY
        )
        device = store.device(device_id)
        registry_name: str | None = None
        creating = False

        _apply_device_settings(device, call, rotation)
        _apply_entity_pairs(device, call)
        _apply_device_flags(device, call)

        if delete_zone and zone_id is not None:
            # TODO(REVIEW_REPORT.md X15): an unknown zone id  # noqa: FIX002, TD003
            # still mints a store entry and fires the event; warn and return
            # when the call has nothing else to change.
            device[STORE_ZONES].pop(zone_id, None)
            _remove_zone_entities(hass, device_id, zone_id)
        elif zone_id is None or shape is None:
            # Device-wide fields only, or a rename or zone settings without
            # geometry, which only land on a stored zone.
            zone_entry = None if zone_id is None else store.zone(device_id, zone_id)
            if zone_entry is not None:
                if zone_name is not None:
                    zone_entry[ATTR_NAME] = zone_name
                    _update_registry_names(hass, device_id, zone_id, zone_name)
                _apply_zone_settings(zone_entry, call)
        else:
            creating = store.zone(device_id, zone_id) is None
            registry_name = _write_zone_geometry(store, device_id, zone_id, call)

        if history_off:
            # Turning movement history off deletes this radar's positions in
            # answer to the zone signal, and the movement file can start to
            # change inside it. So the zone store is written first, and now
            # rather than after its save delay: a crash between the two writes
            # must never leave the flag on disk to turn recording back on at
            # the next start.
            await store.async_save()

        _notify_zones_updated(hass, device_id)

        if registry_name is not None:
            # After the zone signal, not before: both platforms register a new
            # zone's entities inside it, so a name sent with the call that
            # creates the zone reaches the registry too.
            _update_registry_names(hass, device_id, zone_id, registry_name)
        elif creating:
            # A new zone with no name of its own, as Add Zone creates one, on
            # a zone id that may have been used before.
            _clear_generated_names(hass, device_id, zone_id)

    # One call at a time. Turning movement history off saves the zone store
    # before the zone signal that deletes the history, and that save is the
    # only await above: a call run inside it, such as a second administrator
    # turning history back on, would set the flag again before that signal,
    # which then keeps the history the first call was to delete, or would
    # send its own zone signal while the off state is not yet on disk.
    lock = asyncio.Lock()

    async def handle_update_zone(call: ServiceCall) -> None:
        async with lock:
            await update_zone(call)

    return handle_update_zone


def _hold_seconds(value: Any) -> Any:
    # vol.Coerce(int) alone reads True, or YAML on, as a 1 s hold.
    if isinstance(value, bool):
        msg = "hold_s is a number of seconds, not a boolean"
        raise vol.Invalid(msg)
    return value


UPDATE_ZONE_SERVICE_SCHEMA = vol.All(
    # `location` is the v1 spelling, kept for one release so existing automations
    # keep working. Exactly one of the two has to be there.
    cv.has_at_least_one_key("device_id", "location"),
    vol.Schema(
        {
            # A list is the shape a `target:` block produces; see
            # `_device_id_from_call`.
            vol.Optional("device_id"): vol.Any(cv.string, [cv.string]),
            vol.Optional("location"): cv.string,
            vol.Optional("clear_entities"): cv.boolean,
            # Ids start at 1, as services.yaml documents and the card assumes;
            # it refuses to edit, rename or delete a zone 0. The upper bound is
            # the serialization limit above, not a zone count.
            vol.Optional("zone_id"): vol.All(
                vol.Coerce(int), vol.Range(min=1, max=_MAX_SAFE_INT)
            ),
            vol.Optional("shape"): vol.In(list(SUPPORTED_SHAPES)),
            vol.Optional("data"): vol.Any(None, dict),
            vol.Optional(ATTR_ROTATION_DEG): vol.Coerce(float),
            vol.Optional("input_units"): vol.In(list(INPUT_UNIT_FACTORS)),
            vol.Optional(STORE_DISPLAY_UNITS): vol.In(
                [*DISPLAY_UNITS, DISPLAY_UNITS_AUTO]
            ),
            # Zone settings, which need zone_id, then the radar's flags.
            vol.Optional(STORE_ZONE_TYPE): vol.In(list(ZONE_TYPES)),
            vol.Optional(STORE_HOLD_S): vol.All(
                _hold_seconds,
                vol.Coerce(int),
                vol.Range(min=0, max=HOLD_S_MAX),
            ),
            vol.Optional(STORE_MIRROR_X): cv.boolean,
            vol.Optional(STORE_MOVEMENT_HISTORY): cv.boolean,
            vol.Optional("name"): cv.string,
            vol.Optional("delete"): cv.boolean,
            vol.Optional("entities"): vol.All(
                cv.ensure_list,
                [
                    vol.Schema(
                        {
                            vol.Required("x"): cv.entity_id,
                            vol.Required("y"): cv.entity_id,
                        },
                        extra=vol.ALLOW_EXTRA,
                    )
                ],
            ),
        },
        extra=vol.PREVENT_EXTRA,
    ),
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Config-entry-only integration; nothing to do for YAML."""
    _ = (hass, config)
    return True


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """
    Record which dashboard an entry from 2.2.5 or earlier owns. Read only.

    Those releases kept the Apollo mmWave dashboard in place on every setup
    while the "auto-create dashboard" option was on, and identified it by its
    url path. From minor version 2 the entry records the row it owns instead,
    by id and url path, and setup never writes a dashboard. With the option on,
    a row on our url path whose config is still our strategy is recorded as
    ours, without writing to it. With the option off, or with no such row,
    the entry owns none, and nothing is ever recreated. The option itself is
    dropped. ``dashboard_devices`` is kept as it is.

    When the dashboards cannot be read, whether such a row exists is unknown,
    so nothing is recorded: the entry stays on minor version 1 with the old
    option, and the next start looks again.

    Never fails: a migration error would keep the zones and the services from
    loading, and until the row is recorded nothing writes to or deletes it.
    """
    if entry.version == 1 and entry.minor_version < ENTRY_MINOR_VERSION:
        options = dict(entry.options)
        keep_dashboard = bool(options.pop(CONF_AUTO_CREATE_VIEW, True))
        if CONF_DASHBOARD_ID not in options:
            try:
                dashboard_id = (
                    await async_find_legacy_dashboard(hass) if keep_dashboard else None
                )
            except DashboardsUnreadableError:
                # Unknown is not none. Setup goes ahead with the entry owning
                # no dashboard for now, and nothing is written.
                return True
            options[CONF_DASHBOARD_ID] = dashboard_id
            options[CONF_DASHBOARD_URL_PATH] = (
                DASHBOARD_URL_PATH if dashboard_id else None
            )
        hass.config_entries.async_update_entry(
            entry, options=options, minor_version=ENTRY_MINOR_VERSION
        )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """
    Set up Apollo mmWave from a config entry.

    Loads (or migrates) the zone store, loads the movement history, registers
    the update service, forwards the sensor/binary_sensor platforms and serves
    the bundled frontend.

    Setup never creates, rewrites or deletes a dashboard. The Apollo mmWave
    dashboard is created once, when an administrator asks for it in the config
    or options flow, and later changes to it come only from options flow
    actions on the row the entry recorded (``config_flow.py``). The frontend
    assets are registered whether or not that dashboard exists: the cards and
    strategy work on any dashboard.
    """
    store = ZoneStore(hass)
    if not await store.async_load():
        await async_migrate_legacy(hass, store)
        # Second, so our own data is the first writer on any zone id the two
        # setups share. Both ran against the same radars for these users.
        await async_import_zone_mapper(hass, store)
        await store.async_save()
    # Before the platforms: an entity still on a pre-2.0 unique id would
    # otherwise be abandoned and recreated fresh, losing its name and area.
    await async_migrate_unique_ids(hass, store)
    hass.data.setdefault(DOMAIN, {})[DATA_STORE] = store
    # Loaded after the zone store, whose flags decide which radars keep their
    # history, and before anything can ask for it.
    movement = MovementHistory(hass, store)
    await movement.async_load()
    hass.data[DOMAIN][DATA_MOVEMENT] = movement

    # Before the platforms, so no entity can resolve pairs without the cache in
    # place and then hold a stale answer.
    entry.async_on_unload(async_track_target_pairs(hass))

    # Recording starts with the pair cache in place. The teardown is a hook,
    # as for the zone store below, so it also runs when a later step raises.
    # Hooks run last registered first, so the zone teardown has popped the
    # zone store by then; the history holds its own reference to it.
    movement.async_start()

    def _movement_teardown() -> Coroutine[Any, Any, None]:
        hass.data.get(DOMAIN, {}).pop(DATA_MOVEMENT, None)
        return movement.async_stop()

    entry.async_on_unload(_movement_teardown)

    # Admin only: a call rewrites the zone configuration and creates, renames
    # and removes zone entities. Automations carry no user and still run; a
    # non-admin user gets Unauthorized, which the card shows as its "Could not
    # save" toast. Reading zones stays open to every user (websocket.py).
    async_register_admin_service(
        hass,
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        _build_update_zone_handler(hass),
        schema=UPDATE_ZONE_SERVICE_SCHEMA,
    )

    def _teardown() -> Coroutine[Any, Any, None]:
        # A hook rather than code in `async_unload_entry`: Home Assistant runs
        # the hooks when a later setup step raises too, and never calls
        # `async_unload_entry` for an entry that failed to set up. The returned
        # flush is awaited before the unload finishes.
        hass.services.async_remove(DOMAIN, SERVICE_UPDATE_ZONE)
        hass.data.get(DOMAIN, {}).pop(DATA_STORE, None)
        return store.async_save()

    entry.async_on_unload(_teardown)

    # How the card reads its configuration. Registering the commands is
    # idempotent and they are never unregistered (Home Assistant has no API for
    # it), so the teardown only closes the subscriptions this entry owns.
    entry.async_on_unload(async_register_websocket(hass))

    # The gate calibration services and their store. The teardown is an
    # `async def`: it asks running jobs to stop and waits for their bounded
    # finally before the services and the store go away.
    entry.async_on_unload(await async_setup_calibration(hass, entry))

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # `frontend`, `http`, and `lovelace` are manifest dependencies, so they are
    # ready by now: register immediately. Waiting for EVENT_HOMEASSISTANT_STARTED
    # (the old behavior) left a window where a page load during startup missed
    # the extra JS module and the dashboard timed out waiting for the strategy.
    await async_register_frontend_assets(hass)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """
    Unload the entry's platforms.

    The service, the store and the rest go in the `entry.async_on_unload` hooks
    `async_setup_entry` registered, which Home Assistant runs only when this
    returns True.

    An unload, like a reload, never writes a dashboard.
    """
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Delete our dashboard, resources and every store when the entry is removed."""
    # Only the row this entry recorded, and only while its config is still our
    # strategy (frontend.async_remove_dashboard). An entry that owns none
    # leaves every dashboard alone.
    await async_remove_dashboard(
        hass,
        entry.options.get(CONF_DASHBOARD_ID),
        entry.options.get(CONF_DASHBOARD_URL_PATH),
    )
    # The resource rows load the cards for every entry. The config flow allows
    # only one, so this keeps them for a second entry made some other way.
    # Home Assistant drops the removed entry from the list before calling this;
    # the id check covers a direct call.
    if not any(
        other.entry_id != entry.entry_id
        for other in hass.config_entries.async_entries(DOMAIN, include_ignore=False)
    ):
        await async_remove_lovelace_resources(hass)
    # The live store when an unload failed and left it in place: removing it
    # cancels its pending delayed save, which a fresh instance cannot reach and
    # which would write the file back after the delete.
    store = hass.data.get(DOMAIN, {}).get(DATA_STORE) or ZoneStore(hass)
    await store.async_remove()
    await CalibrationStore(hass).async_remove()
    # Every position goes with the entry, and the copies of a corrupt file too.
    await async_remove_movement_store(hass)
