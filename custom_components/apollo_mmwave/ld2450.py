"""
LD2450 tracking-radar target sensors for a device.

The LD2450 in R_PRO-1 and MTR-1 reports moving-target positions as one X and
one Y sensor per target, named ``sensor.<base>_ld2450_target_<n>_x`` / ``_y``
by the R_PRO-1 firmware and ``sensor.<base>_target_<n>_x`` / ``_y`` by the
MTR-1 firmware. Resolving those from the entity registry is what lets the card
stop asking the user to hand-pick them.

Matching is on the entity id suffix rather than the whole id, so a renamed
prefix does not break detection, and the optional trailing ``_2`` absorbs Home
Assistant's dedup suffix. The target number sits before those dedup digits, so
it cannot be misread as one.

This is the Python twin of ``frontend-src/src/ld2450.ts``. The two regexes are
shared, so change both together.

The pairing rule (an X is only offered with the Y of the same target number)
and the disabled-entity filter live only on this side. The TypeScript uses its
regexes for radar detection alone and pairs nothing from the registry, and the
``hass.entities`` it reads already leaves disabled entries out. This side is
authoritative because it is what the presence and geometry sensors track and
what the websocket payload offers the card as ``suggested_entities``. Do not
"fix" a mismatch by loosening this side: a target whose Y is disabled has no
drawable position, so dropping it is the correct answer.

``effective_target_pairs`` is the one answer to "which pairs does this zone
use", shared by both platforms so the geometry sensor cannot advertise a
different list from the one its own presence sensor is tracking.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DATA_PAIR_CACHE, DOMAIN, SIGNAL_ZONES_UPDATED, STORE_ENTITIES

if TYPE_CHECKING:
    from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant

    from .store import ZoneStore

# The R_PRO-1 firmware names its targets "LD2450 Target-1 X"; the MTR-1 firmware
# names the same sensors "Target-1 X", with no chip prefix. Both end in
# `_target_<n>_x`, so the prefix is optional rather than assumed.
TARGET_X = re.compile(r"(?:_ld2450)?_target_(\d+)_x(?:_\d+)?$")
TARGET_Y = re.compile(r"(?:_ld2450)?_target_(\d+)_y(?:_\d+)?$")


def _is_target_sensor(entity_id: str) -> bool:
    """Report whether an entity id is one `resolve_target_pairs` would pair."""
    domain, _, object_id = entity_id.partition(".")
    return domain == "sensor" and bool(
        TARGET_X.search(object_id) or TARGET_Y.search(object_id)
    )


def resolve_target_pairs(hass: HomeAssistant, device_id: str) -> list[dict[str, str]]:
    """Return the device's LD2450 X/Y sensor pairs, ordered by target number."""
    xs: dict[int, str] = {}
    ys: dict[int, str] = {}
    for entry in er.async_entries_for_device(
        er.async_get(hass), device_id, include_disabled_entities=False
    ):
        if entry.domain != "sensor":
            continue
        object_id = entry.entity_id.partition(".")[2]
        if match := TARGET_X.search(object_id):
            # First writer wins: a duplicate target number is a misnamed entity,
            # and the registry's own order is the closest thing to canonical.
            xs.setdefault(int(match.group(1)), entry.entity_id)
        elif match := TARGET_Y.search(object_id):
            ys.setdefault(int(match.group(1)), entry.entity_id)
    # A half-present target (Y disabled, say) has no drawable position, so it is
    # dropped rather than returned incomplete.
    return [{"x": xs[n], "y": ys[n]} for n in sorted(xs) if n in ys]


def effective_target_pairs(
    hass: HomeAssistant, store: ZoneStore, device_id: str
) -> list[dict[str, str]]:
    """Return the pairs a device's zones track, configured or resolved."""
    # Read through `devices` rather than `store.device()`. That accessor is a
    # setdefault, so reading through it would mint a permanent store entry for
    # any device this is asked about. Every caller today passes a device that is
    # already stored, but asking which pairs a radar tracks is a question, not a
    # reason to write it down.
    configured = (store.devices.get(device_id) or {}).get(STORE_ENTITIES)
    # Absent means never configured, so the radar's own targets stand in. An
    # empty list is the user having cleared it, and clearing means nothing.
    if configured is not None:
        return configured if isinstance(configured, list) else []
    cache = hass.data.get(DOMAIN, {}).get(DATA_PAIR_CACHE)
    if cache is None:
        return resolve_target_pairs(hass, device_id)
    if device_id not in cache:
        # Cached because presence re-reads this on every coordinate update, and
        # the LD2450 pushes several a second per target, while resolving scans
        # the device's whole entity list with a regex.
        cache[device_id] = resolve_target_pairs(hass, device_id)
    return cache[device_id]


@callback
def async_track_target_pairs(hass: HomeAssistant) -> CALLBACK_TYPE:
    """Keep resolved pairs fresh, and republish a device's zones when they move."""
    cache: dict[str, list[dict[str, str]]] = {}
    hass.data.setdefault(DOMAIN, {})[DATA_PAIR_CACHE] = cache

    @callback
    def _invalidate(device_ids: list[str]) -> None:
        for device_id in device_ids:
            cache.pop(device_id, None)
            # Both platforms already refresh on this signal, so reusing it keeps
            # the geometry sensor and its presence sensor in step by
            # construction rather than by two parallel subscriptions.
            async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)

    @callback
    def _registry_updated(event: Event[Any]) -> None:
        entity_id = event.data["entity_id"]
        # A rename also reports the id the entity had before, and a pair cached
        # under that id is just as stale as one under the new id.
        ids = {entity_id, event.data.get("old_entity_id")} - {None}
        # Pairs only ever hold target sensors, and resolving only ever finds
        # them, so no other entity's event can change an answer. That includes
        # this integration's own zone entities, which live on the radar device
        # and would otherwise republish its zones on every zone create and
        # rename, on top of the push the edit itself already sends.
        if not any(_is_target_sensor(changed) for changed in ids):
            return
        # Every cached device whose pairs name the entity under either id. A
        # removed entity has no entry left to point at its device, and a moved
        # or renamed one leaves its old device holding a pair it no longer owns.
        affected = {
            device_id
            for device_id, pairs in cache.items()
            if any(pair["x"] in ids or pair["y"] in ids for pair in pairs)
        }
        # Plus the device it belongs to now, which may gain a pair it lacked.
        entry = er.async_get(hass).async_get(entity_id)
        if entry is not None and entry.device_id in cache:
            affected.add(entry.device_id)
        _invalidate(sorted(affected))

    unsub_started: CALLBACK_TYPE | None = None

    @callback
    def _started(_event: Event[Any]) -> None:
        # A one-shot listener removes itself when it fires. Removing it again
        # from the teardown logs "Unable to remove unknown job listener" at
        # error level on every reload after boot, so forget it here.
        nonlocal unsub_started
        unsub_started = None
        _invalidate(list(cache))

    unsub_registry = hass.bus.async_listen(
        er.EVENT_ENTITY_REGISTRY_UPDATED, _registry_updated
    )
    if not hass.is_running:
        unsub_started = hass.bus.async_listen_once(
            EVENT_HOMEASSISTANT_STARTED, _started
        )

    @callback
    def _unsubscribe() -> None:
        unsub_registry()
        if unsub_started is not None:
            unsub_started()
        hass.data.get(DOMAIN, {}).pop(DATA_PAIR_CACHE, None)

    return _unsubscribe
