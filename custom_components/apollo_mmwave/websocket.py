"""
Websocket API: how the zone card reads its configuration.

Before 2.0 the card built ``sensor.apollo_mmwave_<slug>_zone_<n>`` out of a
display name and read zone geometry from that entity's state attributes. That
tied configuration to entity naming and to entity availability: an unavailable
entity has its attributes stripped, so the card read an empty config and wrote
the emptiness back over the real one. Renaming the radar orphaned everything,
and a radar could not be configured before it had a zone, because the zone
entity was the storage.

These two commands are the replacement. The store is the single source of
truth, the Home Assistant device id is the key, and nothing here builds an
entity id.

One zone write lives here, admin only like ``update_zone``: the restore
command puts back the shape a zone's last shape change replaced, which the
zone map card's Undo and "Restore previous shape" send.

The movement commands read and clear a radar's movement history
(movement.py). They are admin-only: positions over time say far more about a
household than the zones do.

The target units commands are the Radar setup card's "Show Target X and Y in
mm" (target_units.py). Reading which unit each X and Y shows is open, like the
zones; switching them is admin-only, because it is an entity registry change,
which Home Assistant only lets an administrator make.
"""

from __future__ import annotations

import copy
from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .calibration import calibration_payload
from .const import (
    ATTR_DATA,
    ATTR_ROTATION_DEG,
    ATTR_SHAPE,
    DATA_CALIBRATION_JOBS,
    DATA_CALIBRATION_STORE,
    DATA_MOVEMENT,
    DATA_STORE,
    DOMAIN,
    KEY_PRESENCE_ENTITY_ID,
    KEY_PREVIOUS_SHAPE_AT,
    KEY_PREVIOUS_SHAPE_DRAWN,
    MAX_SAFE_INT,
    PREVIOUS_REPLACED_AT,
    RESTORE_SHAPE_MAX_ZONES,
    SHAPE_NONE,
    SIGNAL_CALIBRATION_UPDATED,
    SIGNAL_ZONES_PAYLOAD,
    SIGNAL_ZONES_UPDATED,
    STORE_DISPLAY_UNITS,
    STORE_ENTITIES,
    STORE_HOLD_S,
    STORE_INPUT_UNITS,
    STORE_LABEL,
    STORE_MIRROR_X,
    STORE_MOVEMENT_HISTORY,
    STORE_PREVIOUS_SHAPE,
    STORE_ZONE_TYPE,
    STORE_ZONES,
    SUPPORTED_SHAPES,
    ZONE_TYPE_IGNORE,
)
from .ld2450 import resolve_target_pairs
from .movement import _now_ms
from .store import (
    device_flag,
    make_previous_shape,
    previous_shape_of,
    shape_of,
    zone_hold_s,
    zone_type_of,
)
from .target_units import async_show_in_mm, switchable, target_unit_rows

if TYPE_CHECKING:
    from homeassistant.components.websocket_api import ActiveConnection
    from homeassistant.core import CALLBACK_TYPE, HomeAssistant

    from .movement import MovementHistory
    from .store import ZoneStore

TYPE_GET = f"{DOMAIN}/zones/get"
TYPE_SUBSCRIBE = f"{DOMAIN}/zones/subscribe"
TYPE_RESTORE_SHAPE = f"{DOMAIN}/zones/restore_shape"
TYPE_CALIBRATION_GET = f"{DOMAIN}/calibration/get"
TYPE_CALIBRATION_SUBSCRIBE = f"{DOMAIN}/calibration/subscribe"
TYPE_MOVEMENT_GET = f"{DOMAIN}/movement/get"
TYPE_MOVEMENT_CLEAR = f"{DOMAIN}/movement/clear"
TYPE_TARGET_UNITS_GET = f"{DOMAIN}/target_units/get"
TYPE_TARGET_UNITS_SET = f"{DOMAIN}/target_units/set"

# Detected pairs the user has not chosen, offered so the card can say "using the
# radar's own targets" instead of demanding a manual pick.
KEY_SUGGESTED_ENTITIES = "suggested_entities"

# Live subscriptions, so unloading the config entry can close them. Commands
# themselves are never unregistered: Home Assistant has no API for that.
DATA_SUBSCRIPTIONS = "ws_subscriptions"

ERR_NOT_LOADED = "not_loaded"


@callback
def async_register(hass: HomeAssistant) -> CALLBACK_TYPE:
    """Register the zone commands and return the config entry's teardown."""
    # Registration is a keyed assignment, so a second setup in the same run
    # (a reload) replaces the handlers rather than stacking them.
    websocket_api.async_register_command(hass, ws_get_zones)
    websocket_api.async_register_command(hass, ws_subscribe_zones)
    websocket_api.async_register_command(hass, ws_restore_shape)
    websocket_api.async_register_command(hass, ws_get_movement)
    websocket_api.async_register_command(hass, ws_clear_movement)
    websocket_api.async_register_command(hass, ws_get_calibration)
    websocket_api.async_register_command(hass, ws_subscribe_calibration)
    websocket_api.async_register_command(hass, ws_get_target_units)
    websocket_api.async_register_command(hass, ws_set_target_units)
    hass.data.setdefault(DOMAIN, {}).setdefault(DATA_SUBSCRIPTIONS, set())

    @callback
    def _close_subscriptions() -> None:
        for teardown in list(_subscriptions(hass)):
            teardown()
        hass.data.get(DOMAIN, {}).pop(DATA_SUBSCRIPTIONS, None)

    return _close_subscriptions


def _subscriptions(hass: HomeAssistant) -> set[CALLBACK_TYPE]:
    return hass.data.setdefault(DOMAIN, {}).setdefault(DATA_SUBSCRIPTIONS, set())


def _zones(
    hass: HomeAssistant, device_id: str, entry: dict[str, Any]
) -> dict[str, Any]:
    """Return a radar's zones as the card reads them."""
    from . import _zone_entity_unique_ids  # noqa: PLC0415 - avoid a module import cycle

    registry = er.async_get(hass)
    zones: dict[str, Any] = {}
    for zone_id, zone in entry.get(STORE_ZONES, {}).items():
        # A copy, so the keys added and dropped here never reach the store.
        item = dict(zone)
        # Normalized for the card: a hand-edited value that presence reads as
        # the default is left out, as the default always is, so the map and
        # the presence sensor agree on what the zone does.
        item.pop(STORE_ZONE_TYPE, None)
        item.pop(STORE_HOLD_S, None)
        if zone_type_of(zone) == ZONE_TYPE_IGNORE:
            item[STORE_ZONE_TYPE] = ZONE_TYPE_IGNORE
        if hold_s := zone_hold_s(zone):
            item[STORE_HOLD_S] = hold_s
        # Only when and whether drawn; the geometry stays server side.
        item.pop(STORE_PREVIOUS_SHAPE, None)
        if (previous := previous_shape_of(zone)) is not None:
            item[KEY_PREVIOUS_SHAPE_AT] = previous[PREVIOUS_REPLACED_AT]
            item[KEY_PREVIOUS_SHAPE_DRAWN] = previous[ATTR_SHAPE] != SHAPE_NONE
        # The card lights a zone from its presence sensor's state, under
        # whatever entity id that sensor has now; null while it is not
        # registered.
        item[KEY_PRESENCE_ENTITY_ID] = registry.async_get_entity_id(
            "binary_sensor", DOMAIN, _zone_entity_unique_ids(device_id, zone_id)[1]
        )
        # Zone ids are ints in the store; JSON object keys can only be strings.
        zones[str(zone_id)] = item
    return zones


def _payload(hass: HomeAssistant, device_id: str) -> dict[str, Any]:
    """Build one device's configuration as the card sees it."""
    from . import get_store  # noqa: PLC0415 - avoid a module import cycle

    # Read through `devices` rather than `store.device()`. That accessor is a
    # setdefault, so reading through it would let any websocket client mint a
    # permanent store entry for any device just by asking about it. A radar with
    # nothing stored yet is answered from an empty dict, which is the whole point
    # of this task: configuration can exist before a zone does, and asking about
    # a radar is not configuring it.
    entry = get_store(hass).devices.get(device_id) or {}
    return {
        STORE_ZONES: _zones(hass, device_id, entry),
        # null means never configured, so the card offers the suggestions below;
        # [] means the user cleared the list and wants nothing tracked. Sending
        # [] for both would re-offer auto-detection to the one user who switched
        # it off, and re-enable it the moment they saved anything else.
        STORE_ENTITIES: entry.get(STORE_ENTITIES),
        ATTR_ROTATION_DEG: entry.get(ATTR_ROTATION_DEG),
        # TODO(REVIEW_REPORT.md X27): a frozen v1 name that  # noqa: FIX002, TD003
        # goes stale after a rename. Send the registry name_by_user or name,
        # falling back to the label, and fix 'display only' in store and const.
        STORE_LABEL: entry.get(STORE_LABEL),
        # What the presence sensor scales a target reading by when its sensor
        # has no length unit of its own; null means mm.
        STORE_INPUT_UNITS: entry.get(STORE_INPUT_UNITS),
        # The unit an administrator picked for this radar's map, "m" or "ft";
        # null means the card follows Home Assistant's unit system.
        STORE_DISPLAY_UNITS: entry.get(STORE_DISPLAY_UNITS),
        # The radar's flags, always booleans: whether every viewer sees the map
        # flipped left to right, and whether movement history is kept.
        STORE_MIRROR_X: device_flag(entry, STORE_MIRROR_X),
        STORE_MOVEMENT_HISTORY: device_flag(entry, STORE_MOVEMENT_HISTORY),
        # TODO(REVIEW_REPORT.md X53): resolved per subscriber.  # noqa: FIX002, TD003
        # Every subscriber re-resolves on every signal (about 66 us each). Low
        # priority now that zone edits send one signal; reusing DATA_PAIR_CACHE
        # would change what zone-less devices are pushed.
        # Raw detection, not `effective_target_pairs`: this field is what the
        # radar offers, which stays meaningful next to whatever the user picked.
        KEY_SUGGESTED_ENTITIES: resolve_target_pairs(hass, device_id),
    }


def _answerable(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> bool:
    """Report whether a request can be served, sending the error if it cannot."""
    from . import _device_is_registered  # noqa: PLC0415 - avoid a module import cycle

    if DATA_STORE not in hass.data.get(DOMAIN, {}):
        # The commands outlive the config entry, so a dashboard left open keeps
        # calling them after an unload or during a reload.
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Apollo mmWave is not loaded.")
        return False
    device_id = msg["device_id"]
    if not _device_is_registered(hass, device_id):
        # An empty payload would read as "this radar has no zones", which is the
        # same thing the card used to see when an entity went unavailable, and
        # what it did next was save that emptiness. A stale or mistyped id has to
        # be an error, not a blank canvas.
        connection.send_error(
            msg["id"],
            websocket_api.ERR_NOT_FOUND,
            f"No Home Assistant device with id {device_id}",
        )
        return False
    return True


# Reads are open, writes are admin-only. Neither zone read here is
# admin-only, and that is deliberate: the Apollo mmWave dashboard is admin-only
# only when the administrator leaves that box ticked (the ones made before
# 2.2.6 are not), and the card can sit on any dashboard, so non-admin users
# open the card, and the card draws nothing without these two read commands.
# Nor do they open much up: every user can already read the zone geometry,
# rotation and tracked pairs from the zone sensors' state attributes. Adding
# `require_admin` here would quietly break the card for every non-admin user.
# The zone writes, the `update_zone` service, registered as an admin service
# in __init__.py, and `ws_restore_shape` below, are admin-only, so a non-admin
# user sees the zones but cannot change them.
# TODO(REVIEW_REPORT.md X52): device_id "" is not_found.  # noqa: FIX002, TD003
# Both zone schemas accept an empty device_id, which _answerable answers
# not_found. Keep as is; optionally pin it in tests (missing gives
# invalid_format, "" gives not_found with no store entry or forwarder).
@websocket_api.websocket_command(
    {vol.Required("type"): TYPE_GET, vol.Required("device_id"): str}
)
@callback
def ws_get_zones(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return one radar's zone configuration."""
    if not _answerable(hass, connection, msg):
        return
    connection.send_result(msg["id"], _payload(hass, msg["device_id"]))


@websocket_api.websocket_command(
    {vol.Required("type"): TYPE_SUBSCRIBE, vol.Required("device_id"): str}
)
@callback
def ws_subscribe_zones(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Push a radar's zone configuration on every change."""
    if not _answerable(hass, connection, msg):
        return
    device_id = msg["device_id"]
    active = _subscriptions(hass)
    closed = False

    @callback
    def _forward(changed_device_id: str) -> None:
        if changed_device_id != device_id:
            return
        # A safety net: the entry's teardown closes this subscription before it
        # pops the store, and a payload built without the store would raise.
        if DATA_STORE not in hass.data.get(DOMAIN, {}):
            return
        connection.send_event(msg["id"], _payload(hass, device_id))

    unsub_dispatcher = async_dispatcher_connect(hass, SIGNAL_ZONES_UPDATED, _forward)
    # A renamed presence entity id changes this payload and nothing else, so it
    # comes on a signal only these forwarders hear (see ld2450.py).
    unsub_payload = async_dispatcher_connect(hass, SIGNAL_ZONES_PAYLOAD, _forward)

    @callback
    def _teardown() -> None:
        # Three things can end this subscription: the client unsubscribing, the
        # connection closing, and the config entry unloading. Any of them can
        # come first and the other two still fire, so this has to be a no-op the
        # second time. It deliberately leaves `connection.subscriptions` alone:
        # the connection iterates that dict while closing it down.
        nonlocal closed
        if closed:
            return
        closed = True
        active.discard(_teardown)
        unsub_dispatcher()
        unsub_payload()

    active.add(_teardown)
    connection.subscriptions[msg["id"]] = _teardown
    connection.send_result(msg["id"])


def _restore_zone_shape(
    store: ZoneStore, device_id: str, zone_id: int, item: dict[str, Any]
) -> dict[str, Any] | None:
    """
    Swap one zone's shape with its previous shape; None when it is skipped.

    Skipped when the zone or its previous shape is missing, when the zone's
    shape is no longer the item's ``current``, when the previous shape is
    not the item's ``previous`` or was not replaced at its ``previous_at``
    (either one, when sent), or when the previous geometry does not
    normalize. A restore is a swap, so a zone can come back to the shape a
    client saw while its previous shape is another one; the expected
    previous shape keeps that client's Undo from bringing the other one
    back. The swap keeps the zone's name, type and hold time, and the shape
    it replaces becomes the new previous shape, so it can be undone.
    """
    from . import _normalize_zone_payload  # noqa: PLC0415 - avoid a module import cycle

    # Reads through `devices`, so a missing radar mints nothing.
    zone_def = store.zone(device_id, zone_id)
    # None for a missing zone too.
    previous = previous_shape_of(zone_def)
    if previous is None or item.get("previous_at") not in (
        None,
        previous[PREVIOUS_REPLACED_AT],
    ):
        return None
    replaced = shape_of(zone_def)
    if _requested_shape(item["current"], zone_id, device_id) != replaced:
        return None
    shape, data = previous[ATTR_SHAPE], previous[ATTR_DATA]
    if shape != SHAPE_NONE:
        data = _normalize_zone_payload(shape, data, zone_id, device_id)
    expected = item.get("previous")
    if (shape != SHAPE_NONE and data is None) or (
        expected is not None
        and _requested_shape(expected, zone_id, device_id) != (shape, data)
    ):
        return None
    zone_def[ATTR_SHAPE] = shape
    zone_def[ATTR_DATA] = data
    zone_def[STORE_PREVIOUS_SHAPE] = make_previous_shape(*replaced)
    return {ATTR_SHAPE: shape, ATTR_DATA: copy.deepcopy(data)}


def _requested_shape(
    current: dict[str, Any], zone_id: int, device_id: str
) -> tuple[str, dict[str, Any] | None]:
    """Return a request's ``current`` normalized as update_zone would store it."""
    from . import _normalize_zone_payload  # noqa: PLC0415 - avoid a module import cycle

    shape = current["shape"]
    data = _normalize_zone_payload(shape, current.get(ATTR_DATA), zone_id, device_id)
    return (SHAPE_NONE, None) if data is None else (shape, data)


_GEOMETRY_SCHEMA = vol.Schema(
    {
        vol.Required("shape"): vol.In(list(SUPPORTED_SHAPES)),
        vol.Optional("data"): vol.Any(None, dict),
    }
)


# Admin only, like update_zone; schema errors come first.
@websocket_api.websocket_command(
    {
        vol.Required("type"): TYPE_RESTORE_SHAPE,
        vol.Required("device_id"): str,
        vol.Required("zones"): vol.All(
            [
                vol.Schema(
                    {
                        vol.Required("zone_id"): vol.All(
                            vol.Coerce(int), vol.Range(min=1, max=MAX_SAFE_INT)
                        ),
                        # Restore only while this is still the zone's shape.
                        vol.Required("current"): _GEOMETRY_SCHEMA,
                        # And only to the shape the client expects back.
                        vol.Optional("previous"): _GEOMETRY_SCHEMA,
                        vol.Optional("previous_at"): str,
                    }
                )
            ],
            vol.Length(min=1, max=RESTORE_SHAPE_MAX_ZONES),
        ),
    }
)
@websocket_api.require_admin
@callback
def ws_restore_shape(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """
    Put back zones' previous shapes; reply with what was restored and skipped.

    Each zone names the shape the client last saw, ``current``, and is only
    restored while that is still its shape, so an Undo never reverts a later
    edit made elsewhere. It can also name the shape it expects back,
    ``previous``, or when that shape was replaced, ``previous_at``; then it
    is only restored while the zone's previous shape is that one. One push
    and one event cover the whole request.
    """
    from . import _notify_zones_updated, get_store  # noqa: PLC0415 - avoid a module import cycle

    if not _answerable(hass, connection, msg):
        return
    device_id = msg["device_id"]
    store = get_store(hass)
    restored: list[dict[str, Any]] = []
    skipped: list[int] = []
    seen: set[int] = set()
    # Synchronous: update_zone's only await follows its geometry write.
    for item in msg["zones"]:
        zone_id = item["zone_id"]
        if zone_id in seen:
            continue
        seen.add(zone_id)
        geometry = _restore_zone_shape(store, device_id, zone_id, item)
        if geometry is None:
            skipped.append(zone_id)
        else:
            restored.append({"zone_id": zone_id, **geometry})
    if restored:
        _notify_zones_updated(hass, device_id)
    connection.send_result(msg["id"], {"restored": restored, "skipped": skipped})


def _movement_answerable(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> MovementHistory | None:
    """Return the movement history if a request can be served, else send the error."""
    from . import _device_is_registered  # noqa: PLC0415 - avoid a module import cycle

    data = hass.data.get(DOMAIN, {})
    movement: MovementHistory | None = data.get(DATA_MOVEMENT)
    # The history reads its flags from the zone store, and the entry's
    # teardown pops the two at different moments.
    if movement is None or DATA_STORE not in data:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Apollo mmWave is not loaded.")
        return None
    device_id = msg["device_id"]
    if not _device_is_registered(hass, device_id):
        connection.send_error(
            msg["id"],
            websocket_api.ERR_NOT_FOUND,
            f"No Home Assistant device with id {device_id}",
        )
        return None
    return movement


# Admin only, unlike the zone commands: replaying where people were is not
# something every user of a dashboard should be able to do. A non-admin gets
# `unauthorized` for any well-formed request. Home Assistant checks the schema
# first, so a malformed one gets `invalid_format` whoever sends it. Neither
# command mints a zone store entry, and a radar whose history is off answers
# `enabled: false` with no records rather than an error.
@websocket_api.websocket_command(
    {
        vol.Required("type"): TYPE_MOVEMENT_GET,
        vol.Required("device_id"): str,
        # Epoch milliseconds; the answer clamps it to the last 24 hours.
        vol.Optional("since"): vol.All(vol.Coerce(int), vol.Range(min=0)),
    }
)
@websocket_api.require_admin
@callback
def ws_get_movement(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return one radar's movement history since a time, as packed columns."""
    movement = _movement_answerable(hass, connection, msg)
    if movement is None:
        return
    connection.send_result(
        msg["id"], movement.payload(msg["device_id"], msg.get("since"), _now_ms())
    )


@websocket_api.websocket_command(
    {vol.Required("type"): TYPE_MOVEMENT_CLEAR, vol.Required("device_id"): str}
)
@websocket_api.require_admin
@callback
def ws_clear_movement(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Delete one radar's movement history; recording goes on."""
    movement = _movement_answerable(hass, connection, msg)
    if movement is None:
        return
    connection.send_result(msg["id"], {"cleared": movement.clear(msg["device_id"])})


@websocket_api.websocket_command(
    {vol.Required("type"): TYPE_TARGET_UNITS_GET, vol.Required("device_id"): str}
)
@callback
def ws_get_target_units(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return which unit each of a radar's paired X and Y shows."""
    if not _answerable(hass, connection, msg):
        return
    connection.send_result(
        msg["id"], {"targets": target_unit_rows(hass, msg["device_id"])}
    )


# Admin only: the same entity registry change as picking a unit in each
# sensor's settings. A non-admin gets `unauthorized`. The rows are worked out
# again here rather than taken from the card, and only Home Assistant's own
# pick is switched: a unit someone picked stays.
@websocket_api.websocket_command(
    {vol.Required("type"): TYPE_TARGET_UNITS_SET, vol.Required("device_id"): str}
)
@websocket_api.require_admin
@callback
def ws_set_target_units(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Show a radar's paired X and Y in mm; return the sensors switched."""
    if not _answerable(hass, connection, msg):
        return
    rows = target_unit_rows(hass, msg["device_id"])
    connection.send_result(
        msg["id"], {"changed": async_show_in_mm(hass, switchable(rows))}
    )


def _calibration_loaded(hass: HomeAssistant) -> bool:
    # The zone `_answerable` tests only DATA_STORE, which the zone teardown pops
    # while the calibration teardown may still be waiting on a job; a
    # half-set-up entry can have the reverse. The calibration commands need
    # both of their own keys.
    data = hass.data.get(DOMAIN, {})
    return DATA_CALIBRATION_STORE in data and DATA_CALIBRATION_JOBS in data


def _calibration_answerable(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> bool:
    """Report whether a calibration request can be served, sending the error if not."""
    from . import _device_is_registered  # noqa: PLC0415 - avoid a module import cycle

    if not _calibration_loaded(hass):
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Apollo mmWave is not loaded.")
        return False
    device_id = msg["device_id"]
    if not _device_is_registered(hass, device_id):
        connection.send_error(
            msg["id"],
            websocket_api.ERR_NOT_FOUND,
            f"No Home Assistant device with id {device_id}",
        )
        return False
    return True


@websocket_api.websocket_command(
    {vol.Required("type"): TYPE_CALIBRATION_GET, vol.Required("device_id"): str}
)
@callback
def ws_get_calibration(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return one radar's calibration state (job, snapshots, last result)."""
    if not _calibration_answerable(hass, connection, msg):
        return
    connection.send_result(msg["id"], calibration_payload(hass, msg["device_id"]))


@websocket_api.websocket_command(
    {vol.Required("type"): TYPE_CALIBRATION_SUBSCRIBE, vol.Required("device_id"): str}
)
@callback
def ws_subscribe_calibration(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Push a radar's calibration state now and on every job change."""
    if not _calibration_answerable(hass, connection, msg):
        return
    device_id = msg["device_id"]
    active = _subscriptions(hass)
    closed = False

    @callback
    def _forward(changed_device_id: str) -> None:
        if changed_device_id != device_id:
            return
        # A job finishing during the unload window would otherwise build a
        # payload from a store that is no longer there.
        if not _calibration_loaded(hass):
            return
        connection.send_event(msg["id"], calibration_payload(hass, device_id))

    unsub_dispatcher = async_dispatcher_connect(
        hass, SIGNAL_CALIBRATION_UPDATED, _forward
    )

    @callback
    def _teardown() -> None:
        # Same three-way race as `ws_subscribe_zones`: a no-op the second time.
        nonlocal closed
        if closed:
            return
        closed = True
        active.discard(_teardown)
        unsub_dispatcher()

    active.add(_teardown)
    connection.subscriptions[msg["id"]] = _teardown
    connection.send_result(msg["id"])
    # The current state follows at once, so a tab opened mid-run shows the
    # running job with no get/subscribe race.
    connection.send_event(msg["id"], calibration_payload(hass, device_id))
