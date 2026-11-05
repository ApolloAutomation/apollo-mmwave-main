"""
Target X and Y units: an Apollo LD2450 radar's target positions in mm.

ESPHome reports an LD2450's Target X and Y in mm, and Home Assistant picks the
unit a distance sensor shows on its own: inches on US customary units. That
pick is the suggested unit in the sensor's ``sensor.private`` registry
options. Apollo mmWave reads X and Y in any length unit
(``targets.reading_unit_factor`` and the zone map's ``_readingUnitFactor``),
but the radar's built-in zone corners are in mm whatever the unit system, and
so are Apollo's zone guides. So this module shows X and Y in mm:

- A new Apollo LD2450 radar's X and Y show mm from the start
  (``_registry_updated`` and ``_new_sensors``).
- An existing radar's are switched once, after Home Assistant has started,
  with one persistent notification that names them (``_existing_sensors``).
- The Radar setup card gives an administrator one tap for any radar's paired
  X and Y (``target_unit_rows`` and ``async_show_in_mm``, from websocket.py).

A switch writes the sensor's unit option, ``options["sensor"]
["unit_of_measurement"]``. That is what the unit picker in the sensor's own
settings writes, so going back is that same picker. Nothing here writes
``sensor.private`` (Home Assistant's slot, recomputed when the unit system
changes), the radar, or Distance, Speed, Resolution, Angle or a zone corner
number.

Without a tap, only Home Assistant's own pick is ever switched, and only on an
Apollo LD2450 model's ESPHome sensors. A unit someone picked stays, and so
does a sensor that an automation, a script or another integration's entry (a
template helper, say) names, because those read the number the sensor shows.
Each sensor is decided once, and the decision is kept in its own registry
options under ``apollo_mmwave`` (``OPTION_TARGET_UNITS``), for a sensor left
as it was too. So a sensor kept because an automation reads it is not
switched once that automation is gone, the sensors of a metric install (mm
already) keep the inches Home Assistant shows once the install moves to US
customary units, and the decision survives a lost store, a downgrade, a
rename and a deleted entity that comes back. A disabled sensor, or one whose
unit Home Assistant is recomputing, is not decided yet.

Never from inside the registry's create event: it fires before the entity has
its registry entry and listens for registry updates, so the entity would keep
showing the old unit until a reload. A new sensor is decided
``TARGET_UNITS_DELAY_S`` later instead, and one created while Home Assistant
is still starting is left to the pass after the start, once every automation
that could name it is loaded.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import timedelta
from typing import TYPE_CHECKING, Any, NamedTuple

from homeassistant.components import persistent_notification
from homeassistant.components.automation import automations_with_entity
from homeassistant.components.script import scripts_with_entity
from homeassistant.components.sensor import DOMAIN as SENSOR_DOMAIN
from homeassistant.components.sensor import SensorDeviceClass
from homeassistant.const import (
    ATTR_FRIENDLY_NAME,
    ATTR_UNIT_OF_MEASUREMENT,
    CONF_UNIT_OF_MEASUREMENT,
    UnitOfLength,
)
from homeassistant.core import CoreState, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.debounce import Debouncer
from homeassistant.helpers.start import async_at_started
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    OPTION_TARGET_UNITS,
    SENSOR_UNIT_FACTORS,
    TARGET_UNITS_DELAY_S,
    TARGET_UNITS_FRESH_S,
    TARGET_UNITS_KEPT,
    TARGET_UNITS_MM,
    TARGET_UNITS_NOTIFICATION_ID,
)
from .ld2450 import _is_target_sensor, resolve_target_pairs
from .models import apollo_radars

if TYPE_CHECKING:
    from collections.abc import Iterable, Iterator

    from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant

_LOGGER = logging.getLogger(__name__)

ESPHOME_DOMAIN = "esphome"
SENSOR_PRIVATE = f"{SENSOR_DOMAIN}.private"
SUGGESTED_UNIT = "suggested_unit_of_measurement"
# Set in sensor.private while Home Assistant recomputes its pick after a unit
# system change; the sensor drops it once it has read the new unit.
REFRESH_FLAG = "refresh_initial_entity_options"
MM = UnitOfLength.MILLIMETERS

# What the notification after the pass over existing sensors says. Home
# Assistant shows a persistent notification as written, in Markdown.
NOTIFICATION_TITLE = "Apollo mmWave: Target X and Y now in mm"
NOTIFICATION_LEAD = (
    "Apollo mmWave switched these sensors from {units} to mm, the unit the"
    " radar reports and its built-in zone corners use. Home Assistant had"
    " picked {units} on its own. Nothing was written to the radar."
)
NOTIFICATION_READ = (
    "Automations, templates and history graphs now read these sensors in mm."
    " The zone map and zone presence work in either unit."
)
NOTIFICATION_IN_USE = (
    "Sensors that an automation, a script or a helper uses were left as they"
    " were. The Radar setup card above the zone map can switch them."
)
NOTIFICATION_BACK = (
    "To go back, open a sensor's settings and choose {symbols} under Unit of"
    " measurement. Apollo mmWave will not change it again."
)
# The words for a unit. The Radar setup card's UNIT_WORDS (setup-checks.ts)
# says them the same way; tests/test_contracts.py keeps the two equal.
UNIT_WORDS = {
    "in": "inches",
    "cm": "centimeters",
    "m": "meters",
    "ft": "feet",
    "yd": "yards",
    "km": "kilometers",
    "mi": "miles",
    "nmi": "nautical miles",
}

# Why a sensor was left as it was, for the debug log.
KEEP_PICKED = "its unit was picked in its settings"
KEEP_MM = "it already shows mm"


class _Verdict(NamedTuple):
    """Switch a sensor (``detail`` is the unit it showed) or keep it (why)."""

    switch: bool
    detail: str
    # Kept because an automation, a script or another entry names it.
    in_use: bool = False


def _strings(node: Any) -> Iterator[str]:
    """Yield every string in a config tree, keys included."""
    stack = [node]
    while stack:
        item = stack.pop()
        if isinstance(item, str):
            yield item
        elif isinstance(item, Mapping):
            for key, value in item.items():
                stack.extend((key, value))
        elif isinstance(item, list | tuple | set | frozenset):
            stack.extend(item)


def _text(*nodes: Any) -> str:
    """Return every string of some config trees, one per line."""
    # An entity id has no newline, so a match can never span two strings.
    return "\n".join(string for node in nodes for string in _strings(node))


def _raw_configs(hass: HomeAssistant, domain: str) -> Iterator[tuple[str, Any]]:
    """Yield each automation's or script's entity id and its config as written."""
    # The automation and script components keep their entities here. Their
    # raw config is not a public contract, so a missing one reads as empty.
    component = hass.data.get(domain)
    for entity in getattr(component, "entities", ()):
        yield entity.entity_id, getattr(entity, "raw_config", None)


class _Users:
    """
    Who reads a sensor: automations, scripts and other integrations' entries.

    ``referenced_entities`` alone misses a template, which names an entity
    only inside a string, and a device trigger or condition, which names it
    by its registry id (what the automation editor writes when a trigger is
    picked on the device page). So each automation's and script's config is
    also searched as text for either id, and so are the data and options of
    every other config entry, where a template helper keeps its template.
    Gathered once, when first asked. Still invisible: YAML template entities,
    dashboards and tools outside Home Assistant.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        """Bind to hass; nothing is read until a sensor is asked about."""
        self._hass = hass
        self._scripted: list[tuple[str, str]] | None = None
        self._entries: list[tuple[str, str]] | None = None

    def _load(self) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
        if self._scripted is None or self._entries is None:
            hass = self._hass
            self._scripted = [
                (entity_id, _text(config))
                for domain in ("automation", "script")
                for entity_id, config in _raw_configs(hass, domain)
            ]
            self._entries = [
                (
                    f"the {entry.domain} entry {entry.title}",
                    _text(
                        entry.data,
                        entry.options,
                        *(sub.data for sub in entry.subentries.values()),
                    ),
                )
                for entry in hass.config_entries.async_entries()
                if entry.domain != DOMAIN
            ]
        return self._scripted, self._entries

    def _names(self, entity_id: str) -> tuple[str, ...]:
        """Return the ids a config can name a sensor by: entity id, registry id."""
        entry = er.async_get(self._hass).async_get(entity_id)
        return (entity_id,) if entry is None else (entity_id, entry.id)

    def scripted(self, entity_id: str) -> list[str]:
        """Return the automations and scripts that name a sensor."""
        scripted, _ = self._load()
        names = self._names(entity_id)
        found = {
            *automations_with_entity(self._hass, entity_id),
            *scripts_with_entity(self._hass, entity_id),
        }
        found.update(
            who for who, text in scripted if any(name in text for name in names)
        )
        return sorted(found)

    def of(self, entity_id: str) -> list[str]:
        """Return everything that names a sensor, automations and scripts first."""
        _, entries = self._load()
        names = self._names(entity_id)
        return [
            *self.scripted(entity_id),
            *sorted(
                who for who, text in entries if any(name in text for name in names)
            ),
        ]


def _device_class(entry: er.RegistryEntry) -> str | None:
    return entry.device_class or entry.original_device_class


def unit_picked(entry: er.RegistryEntry | None) -> bool:
    """Whether a unit was picked for a sensor in its settings (or by a tap)."""
    if entry is None:
        return False
    return CONF_UNIT_OF_MEASUREMENT in (entry.options.get(SENSOR_DOMAIN) or {})


def decision(entry: er.RegistryEntry | None) -> str | None:
    """Return the sensor's recorded decision, or None when it has none."""
    if entry is None:
        return None
    ours = entry.options.get(DOMAIN) or {}
    value = ours.get(OPTION_TARGET_UNITS)
    return value if isinstance(value, str) else None


def _is_apollo_ld2450(hass: HomeAssistant, entry: er.RegistryEntry) -> bool:
    if entry.device_id is None:
        return False
    device = dr.async_get(hass).async_get(entry.device_id)
    return "ld2450" in (apollo_radars(device) or [])


def _decidable(hass: HomeAssistant, entry: er.RegistryEntry | None) -> bool:
    """
    Whether a sensor is decided now, without a tap.

    Not for a sensor that is not ours to decide (not an Apollo LD2450 model's
    ESPHome target sensor with a distance device class, or one already
    decided), nor yet for one that is disabled or whose unit Home Assistant
    is recomputing.
    """
    if (
        entry is None
        or entry.platform != ESPHOME_DOMAIN
        or not _is_target_sensor(entry.entity_id)
        or decision(entry) is not None
        or _device_class(entry) != SensorDeviceClass.DISTANCE
    ):
        return False
    if not _is_apollo_ld2450(hass, entry):
        _LOGGER.debug("Leaving %s as it is: not an Apollo LD2450", entry.entity_id)
        return False
    private = entry.options.get(SENSOR_PRIVATE) or {}
    return not (entry.disabled or REFRESH_FLAG in private)


def _verdict(entry: er.RegistryEntry, users: _Users) -> _Verdict:
    """
    Decide a sensor that ``_decidable`` accepts.

    Switch it only when the unit it shows is Home Assistant's own pick,
    another length unit than mm, and nothing names it.
    """
    if unit_picked(entry):
        return _Verdict(switch=False, detail=KEEP_PICKED)
    suggested = (entry.options.get(SENSOR_PRIVATE) or {}).get(SUGGESTED_UNIT)
    # Home Assistant shows the native mm for no suggestion or one that is not
    # a length unit.
    if suggested == MM or suggested not in SENSOR_UNIT_FACTORS:
        return _Verdict(switch=False, detail=KEEP_MM)
    if used_by := users.of(entry.entity_id):
        return _Verdict(
            switch=False, detail=f"used by {', '.join(used_by)}", in_use=True
        )
    return _Verdict(switch=True, detail=suggested)


@callback
def _record(registry: er.EntityRegistry, entity_id: str, value: str) -> None:
    """Write a sensor's decision to its own options, keeping any other key."""
    entry = registry.async_get(entity_id)
    if entry is None:
        return
    ours = dict(entry.options.get(DOMAIN) or {})
    ours[OPTION_TARGET_UNITS] = value
    registry.async_update_entity_options(entity_id, DOMAIN, ours)


@callback
def _switch(registry: er.EntityRegistry, entity_id: str, was: str | None) -> bool:
    """Show one sensor in mm and record it; False when the registry refused."""
    entry = registry.async_get(entity_id)
    if entry is None:
        return False
    # The whole sensor options are replaced, so the rest (a display precision
    # picked in the settings, say) is carried over.
    options = dict(entry.options.get(SENSOR_DOMAIN) or {})
    options[CONF_UNIT_OF_MEASUREMENT] = MM
    try:
        registry.async_update_entity_options(entity_id, SENSOR_DOMAIN, options)
        _record(registry, entity_id, TARGET_UNITS_MM)
    except (KeyError, ValueError) as err:
        _LOGGER.warning("Could not set %s to mm: %s", entity_id, err)
        return False
    _LOGGER.info(
        "Showing %s in mm, the unit the radar reports, instead of %s",
        entity_id,
        was,
    )
    return True


@callback
def _keep(registry: er.EntityRegistry, entry: er.RegistryEntry, why: str) -> None:
    """Record a sensor as left as it was, so it is never looked at again."""
    unit = (entry.options.get(SENSOR_DOMAIN) or {}).get(CONF_UNIT_OF_MEASUREMENT)
    shown = unit or (entry.options.get(SENSOR_PRIVATE) or {}).get(SUGGESTED_UNIT)
    _LOGGER.debug("Leaving %s in %s: %s", entry.entity_id, shown or MM, why)
    try:
        _record(registry, entry.entity_id, TARGET_UNITS_KEPT)
    except (KeyError, ValueError) as err:
        _LOGGER.warning(
            "Could not record %s as left in place: %s", entry.entity_id, err
        )


def _words(units: Iterable[str]) -> str:
    """Return units as words in their first order, joined by "and"."""
    return " and ".join(UNIT_WORDS.get(unit, unit) for unit in dict.fromkeys(units))


def _sensor_name(hass: HomeAssistant, entry: er.RegistryEntry) -> str:
    if name := entry.name or entry.original_name:
        return name
    state = hass.states.get(entry.entity_id)
    if state is not None and (friendly := state.attributes.get(ATTR_FRIENDLY_NAME)):
        return str(friendly)
    return f"`{entry.entity_id}`"


def _notification(
    hass: HomeAssistant,
    switched: list[tuple[er.RegistryEntry, str]],
    *,
    in_use: bool,
) -> str:
    """Return the message naming the switched sensors, radar by radar."""
    devices = dr.async_get(hass)
    radars: dict[str, list[str]] = {}
    for entry, _was in switched:
        device = devices.async_get(entry.device_id) if entry.device_id else None
        radar = (device.name_by_user or device.name or "") if device else ""
        radars.setdefault(radar or "Radar", []).append(_sensor_name(hass, entry))
    was = [unit for _entry, unit in switched]
    lines = "\n".join(
        f"- {radar}: {', '.join(sorted(names))}"
        for radar, names in sorted(radars.items())
    )
    symbols = " or ".join(f'"{unit}"' for unit in dict.fromkeys(was))
    parts = [
        NOTIFICATION_LEAD.format(units=_words(was)),
        lines,
        NOTIFICATION_READ + (f" {NOTIFICATION_IN_USE}" if in_use else ""),
        NOTIFICATION_BACK.format(symbols=symbols),
    ]
    return "\n\n".join(parts)


@callback
def _decide(
    hass: HomeAssistant, entries: Iterable[er.RegistryEntry | None]
) -> tuple[list[tuple[er.RegistryEntry, str]], bool]:
    """
    Decide each sensor, write the outcome and return the ones switched.

    Also returns whether any was kept because something names it.
    """
    registry = er.async_get(hass)
    users = _Users(hass)
    switched: list[tuple[er.RegistryEntry, str]] = []
    in_use = False
    for entry in entries:
        if entry is None or not _decidable(hass, entry):
            continue
        verdict = _verdict(entry, users)
        if not verdict.switch:
            _keep(registry, entry, verdict.detail)
            in_use = in_use or verdict.in_use
        elif _switch(registry, entry.entity_id, verdict.detail):
            switched.append((entry, verdict.detail))
    return switched, in_use


@callback
def async_track_target_units(hass: HomeAssistant) -> CALLBACK_TYPE:
    """Show new and existing Apollo LD2450 X and Y in mm; return the teardown."""
    registry = er.async_get(hass)
    # Registry entry ids, which survive a rename between the create and the
    # decision.
    pending: set[str] = set()

    @callback
    def _new_sensors() -> None:
        ids = sorted(pending)
        pending.clear()
        # Each sensor gets this one chance at its creation; a new sensor that
        # is not decided now (disabled, say) waits for the next start.
        _decide(hass, (registry.async_get(registry_id) for registry_id in ids))

    debouncer = Debouncer(
        hass,
        _LOGGER,
        cooldown=TARGET_UNITS_DELAY_S,
        immediate=False,
        function=_new_sensors,
    )

    @callback
    def _registry_updated(event: Event[Any]) -> None:
        # Only looks: see the module docstring for why nothing is written here.
        # While Home Assistant starts, the pass after the start decides.
        if event.data.get("action") != "create" or hass.state is not CoreState.running:
            return
        entity_id = event.data["entity_id"]
        if not _is_target_sensor(entity_id):
            return
        entry = registry.async_get(entity_id)
        if entry is None or entry.platform != ESPHOME_DOMAIN:
            return
        if dt_util.utcnow() - entry.created_at > timedelta(
            seconds=TARGET_UNITS_FRESH_S
        ):
            return
        pending.add(entry.id)
        debouncer.async_schedule_call()

    @callback
    def _existing_sensors(_hass: HomeAssistant) -> None:
        # After Home Assistant has started, when every automation and script
        # is loaded: before that, nothing reads as using a sensor.
        candidates = [
            entry
            for entry in registry.entities.values()
            if entry.platform == ESPHOME_DOMAIN and _is_target_sensor(entry.entity_id)
        ]
        switched, in_use = _decide(hass, candidates)
        if switched:
            persistent_notification.async_create(
                hass,
                _notification(hass, switched, in_use=in_use),
                title=NOTIFICATION_TITLE,
                notification_id=TARGET_UNITS_NOTIFICATION_ID,
            )

    unsub_registry = hass.bus.async_listen(
        er.EVENT_ENTITY_REGISTRY_UPDATED, _registry_updated
    )
    unsub_started = async_at_started(hass, _existing_sensors)

    @callback
    def _unsubscribe() -> None:
        unsub_registry()
        unsub_started()
        debouncer.async_shutdown()
        pending.clear()

    return _unsubscribe


@callback
def target_unit_rows(hass: HomeAssistant, device_id: str) -> list[dict[str, Any]]:
    """
    Return a radar's paired X and Y as the Radar setup card reads them.

    In X1, Y1, X2, Y2, X3, Y3 order. ``unit`` is the unit the sensor shows,
    ``picked`` whether a unit was picked in its settings, ``convertible``
    whether it is a distance sensor in a length unit, and ``used_by`` the
    automations and scripts that name it.
    """
    registry = er.async_get(hass)
    users = _Users(hass)
    rows: list[dict[str, Any]] = []
    for pair in resolve_target_pairs(hass, device_id):
        for entity_id in (pair["x"], pair["y"]):
            entry = registry.async_get(entity_id)
            state = hass.states.get(entity_id)
            unit = state.attributes.get(ATTR_UNIT_OF_MEASUREMENT) if state else None
            device_class = _device_class(entry) if entry is not None else None
            rows.append(
                {
                    "entity_id": entity_id,
                    "unit": unit,
                    "picked": unit_picked(entry),
                    "convertible": device_class == SensorDeviceClass.DISTANCE
                    and unit in SENSOR_UNIT_FACTORS,
                    "used_by": users.scripted(entity_id),
                }
            )
    return rows


@callback
def async_show_in_mm(hass: HomeAssistant, entity_ids: Iterable[str]) -> list[str]:
    """Show each sensor in mm, as an administrator's tap asks; return those switched."""
    registry = er.async_get(hass)
    changed: list[str] = []
    for entity_id in entity_ids:
        state = hass.states.get(entity_id)
        was = state.attributes.get(ATTR_UNIT_OF_MEASUREMENT) if state else None
        if _switch(registry, entity_id, was):
            changed.append(entity_id)
    return changed


def switchable(rows: list[dict[str, Any]]) -> list[str]:
    """Return the rows a tap switches: Home Assistant's pick, in a unit not mm."""
    return [
        row["entity_id"]
        for row in rows
        if row["convertible"] and not row["picked"] and row["unit"] != MM
    ]
