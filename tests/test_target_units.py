"""
Target X and Y units: an Apollo LD2450 radar's target positions in mm.

The registry entries are made the way an ESPHome LD2450 sensor's are on a US
customary install: device class distance, native mm, and Home Assistant's
own pick of inches in ``sensor.private``. A new one is decided after
TARGET_UNITS_DELAY_S, an existing one once Home Assistant has started, and
the Radar setup card's tap goes through the two websocket commands.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import pytest
from homeassistant.components import persistent_notification
from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import (
    ATTR_UNIT_OF_MEASUREMENT,
    EVENT_HOMEASSISTANT_STARTED,
    STATE_UNKNOWN,
    UnitOfLength,
)
from homeassistant.core import CoreState
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.entity_registry import RegistryEntryDisabler
from homeassistant.setup import async_setup_component
from homeassistant.util.unit_system import US_CUSTOMARY_SYSTEM
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    MockEntityPlatform,
)

from custom_components.apollo_mmwave import get_store
from custom_components.apollo_mmwave.const import (
    DOMAIN,
    SIGNAL_ZONES_UPDATED,
    STORE_ZONES,
    TARGET_UNITS_DELAY_S,
    TARGET_UNITS_NOTIFICATION_ID,
)
from custom_components.apollo_mmwave.target_units import async_show_in_mm

from .conftest import RECT_ZONE, make_entry, setup_integration

if TYPE_CHECKING:
    from homeassistant.helpers.device_registry import DeviceEntry

RPRO_SERIAL = "apollo_r_pro_1_abc123"
MTR_SERIAL = "apollo_mtr_1_def456"
IN_PRIVATE = {"sensor.private": {"suggested_unit_of_measurement": "in"}}
MM_PICKED = {"unit_of_measurement": "mm"}
GET = "apollo_mmwave/target_units/get"
SET = "apollo_mmwave/target_units/set"
INCHES = {ATTR_UNIT_OF_MEASUREMENT: "in"}
MILLIMETERS = {ATTR_UNIT_OF_MEASUREMENT: "mm"}

NOTIFICATION_RPRO = (
    "Apollo mmWave switched these sensors from inches to mm, the unit the radar"
    " reports and its built-in zone corners use. Home Assistant had picked"
    " inches on its own. Nothing was written to the radar.\n\n"
    "- Office R PRO-1: LD2450 Target-1 X, LD2450 Target-1 Y, LD2450 Target-2 X,"
    " LD2450 Target-2 Y, LD2450 Target-3 X, LD2450 Target-3 Y\n\n"
    "Automations, templates and history graphs now read these sensors in mm."
    " The zone map and zone presence work in either unit.\n\n"
    'To go back, open a sensor\'s settings and choose "in" under Unit of'
    " measurement. Apollo mmWave will not change it again."
)


def _radar(hass, device_registry, **fields: Any) -> DeviceEntry:
    """Register an ESPHome radar device: an R PRO-1 unless fields say otherwise."""
    device = {
        "serial": RPRO_SERIAL,
        "name": "Office R PRO-1",
        "manufacturer": "ApolloAutomation",
        "model": "R-PRO-1-W",
        **fields,
    }
    esphome_entry = MockConfigEntry(domain="esphome", title=device["name"])
    esphome_entry.add_to_hass(hass)
    return device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", device["serial"])},
        name=device["name"],
        manufacturer=device["manufacturer"],
        model=device["model"],
    )


def _sensor(entity_registry, device: DeviceEntry, object_id: str, **fields: Any) -> str:
    """
    Register one sensor as Home Assistant does when it first sees it.

    An ESPHome distance sensor in mm with Home Assistant's pick of inches,
    unless ``options``, ``platform``, ``device_class``, ``name`` or
    ``disabled`` say otherwise.
    """
    sensor = {
        "options": IN_PRIVATE,
        "platform": "esphome",
        "device_class": SensorDeviceClass.DISTANCE,
        "name": None,
        "disabled": False,
        **fields,
    }
    options = sensor["options"]
    entry = entity_registry.async_get_or_create(
        "sensor",
        sensor["platform"],
        f"uid_{object_id}",
        device_id=device.id,
        suggested_object_id=object_id,
        original_device_class=sensor["device_class"],
        original_name=sensor["name"],
        unit_of_measurement="mm",
        get_initial_options=(lambda: options) if options is not None else None,
        disabled_by=RegistryEntryDisabler.USER if sensor["disabled"] else None,
    )
    return entry.entity_id


def _targets(
    entity_registry,
    device: DeviceEntry,
    base: str,
    *,
    chip: str = "ld2450_",
    **kwargs: Any,
) -> list[str]:
    """Register a radar's X and Y, in X1, Y1, X2, Y2, X3, Y3 order."""
    label = "LD2450 " if chip else ""
    return [
        _sensor(
            entity_registry,
            device,
            f"{base}_{chip}target_{target}_{axis}",
            name=f"{label}Target-{target} {axis.upper()}",
            **kwargs,
        )
        for target in (1, 2, 3)
        for axis in ("x", "y")
    ]


def _options(entity_registry, entity_id: str) -> dict[str, Any]:
    return {
        domain: dict(value)
        for domain, value in entity_registry.async_get(entity_id).options.items()
    }


def _unit(entity_registry, entity_id: str) -> str | None:
    """Return the unit picked in a sensor's own options, None for none."""
    sensor = entity_registry.async_get(entity_id).options.get("sensor") or {}
    return sensor.get("unit_of_measurement")


def _decision(entity_registry, entity_id: str) -> str | None:
    ours = entity_registry.async_get(entity_id).options.get(DOMAIN) or {}
    return ours.get("target_units")


def _notification(hass) -> dict[str, Any] | None:
    return persistent_notification._async_get_or_create_notifications(hass).get(  # noqa: SLF001
        TARGET_UNITS_NOTIFICATION_ID
    )


@pytest.fixture
def us_customary(hass) -> None:
    """Show distances in US customary units, as the install the issue came from."""
    hass.config.units = US_CUSTOMARY_SYSTEM


@pytest.fixture
async def loaded(hass) -> MockConfigEntry:
    """Set Apollo mmWave up with no radar yet."""
    entry = make_entry()
    await setup_integration(hass, entry)
    return entry


@pytest.fixture
def booting(hass):
    """Set Apollo mmWave up during boot; return a function that ends the boot."""

    async def _started() -> None:
        hass.set_state(CoreState.running)
        hass.bus.async_fire(EVENT_HOMEASSISTANT_STARTED)
        await hass.async_block_till_done()

    hass.set_state(CoreState.not_running)
    return _started


# ---------------------------------------------------------------------------
# A new radar
# ---------------------------------------------------------------------------


async def test_a_new_radar_shows_target_x_and_y_in_mm_after_the_delay(
    hass, advance, entity_registry, device_registry, loaded
) -> None:
    """Six X and Y switch for each radar; nothing else on the device is touched."""
    _ = loaded
    rpro = _radar(hass, device_registry)
    mtr = _radar(
        hass, device_registry, serial=MTR_SERIAL, name="Hall MTR-1", model="MTR-1"
    )
    # A stale entity holds the MTR-1's first id, so its X 1 gets the _2 dedup.
    stale = _sensor(
        entity_registry, rpro, f"{MTR_SERIAL}_target_1_x", platform="template"
    )
    targets = [
        *_targets(entity_registry, rpro, RPRO_SERIAL),
        *_targets(entity_registry, mtr, MTR_SERIAL, chip=""),
    ]
    assert f"sensor.{MTR_SERIAL}_target_1_x_2" in targets
    # A display precision picked in the settings is carried over.
    precise = _sensor(
        entity_registry,
        rpro,
        f"{RPRO_SERIAL}_ld2450_target_4_x",
        options={**IN_PRIVATE, "sensor": {"display_precision": 2}},
    )
    others = [
        stale,
        _sensor(entity_registry, rpro, f"{RPRO_SERIAL}_ld2450_target_1_distance"),
        _sensor(entity_registry, rpro, f"{RPRO_SERIAL}_ld2450_target_1_speed"),
        entity_registry.async_get_or_create(
            "number",
            "esphome",
            "uid_zone_1_x1",
            device_id=rpro.id,
            suggested_object_id=f"{RPRO_SERIAL}_ld2450_zone_1_x1",
            original_device_class="distance",
        ).entity_id,
    ]
    before = {entity_id: _options(entity_registry, entity_id) for entity_id in others}

    await hass.async_block_till_done()
    # Nothing is written inside the create event, nor before the delay.
    assert [_unit(entity_registry, entity_id) for entity_id in targets] == [None] * 12

    await advance(int(TARGET_UNITS_DELAY_S) + 1)

    for entity_id in [*targets, precise]:
        options = _options(entity_registry, entity_id)
        assert options["sensor"]["unit_of_measurement"] == "mm", entity_id
        # Home Assistant's own slot is never written.
        assert options["sensor.private"] == IN_PRIVATE["sensor.private"]
        assert options[DOMAIN] == {"target_units": "mm"}
    assert _options(entity_registry, precise)["sensor"] == {
        "display_precision": 2,
        "unit_of_measurement": "mm",
    }
    assert {
        entity_id: _options(entity_registry, entity_id) for entity_id in others
    } == before
    # A new radar is switched without a notification.
    assert _notification(hass) is None


class _Target(SensorEntity):
    """An LD2450 target sensor as ESPHome adds it: distance, in mm."""

    _attr_has_entity_name = True
    _attr_device_class = SensorDeviceClass.DISTANCE
    _attr_native_unit_of_measurement = UnitOfLength.MILLIMETERS

    def __init__(self, name: str, value: float) -> None:
        self._attr_name = name
        self._attr_unique_id = f"{RPRO_SERIAL}-{name}"
        self._attr_native_value = value
        self._attr_device_info = DeviceInfo(identifiers={("esphome", RPRO_SERIAL)})


@pytest.mark.usefixtures("us_customary", "loaded")
async def test_a_real_sensor_shows_inches_then_mm(
    hass, advance, device_registry
) -> None:
    """The sensor reads the new unit at once: a write in the create event misses."""
    rpro = _radar(hass, device_registry)
    platform = MockEntityPlatform(hass, domain="sensor", platform_name="esphome")
    platform.config_entry = hass.config_entries.async_get_entry(rpro.config_entry_id)

    await platform.async_add_entities([_Target("LD2450 Target-1 X", 1000.0)])
    await hass.async_block_till_done()
    entity_id = "sensor.office_r_pro_1_ld2450_target_1_x"
    state = hass.states.get(entity_id)
    assert state.attributes[ATTR_UNIT_OF_MEASUREMENT] == "in"
    assert float(state.state) == pytest.approx(1000 / 25.4)

    await advance(int(TARGET_UNITS_DELAY_S) + 1)

    state = hass.states.get(entity_id)
    assert state.attributes[ATTR_UNIT_OF_MEASUREMENT] == "mm"
    assert state.state == "1000.0"


async def test_a_new_radar_on_a_metric_install_is_left_as_it_is(
    hass, advance, entity_registry, device_registry, loaded
) -> None:
    """Home Assistant already shows mm: no unit is written, the decision is."""
    _ = loaded
    rpro = _radar(hass, device_registry)
    # A metric install suggests no unit, so the sensor has no options at all.
    targets = _targets(entity_registry, rpro, RPRO_SERIAL, options=None)

    await advance(int(TARGET_UNITS_DELAY_S) + 1)

    for entity_id in targets:
        assert _options(entity_registry, entity_id) == {
            DOMAIN: {"target_units": "kept"}
        }


@pytest.mark.usefixtures("booting")
async def test_a_restored_entity_is_not_new(
    hass, freezer, advance, entity_registry, device_registry
) -> None:
    """A deleted sensor that comes back keeps its old created_at: no write."""
    rpro = _radar(hass, device_registry)
    entity_id = _sensor(entity_registry, rpro, f"{RPRO_SERIAL}_ld2450_target_1_x")
    entity_registry.async_remove(entity_id)
    freezer.tick(120)
    await setup_integration(hass, make_entry())
    # Running, with the pass over existing sensors still waiting for the start.
    hass.set_state(CoreState.running)

    restored = _sensor(entity_registry, rpro, f"{RPRO_SERIAL}_ld2450_target_1_x")
    await advance(int(TARGET_UNITS_DELAY_S) + 1)

    assert restored == entity_id
    assert _options(entity_registry, entity_id) == IN_PRIVATE


@pytest.mark.parametrize(
    "case",
    [
        ("Espressif", "esp32dev", "esphome"),
        (None, None, "esphome"),
        ("ApolloAutomation", "MSR-2", "esphome"),
        ("ApolloAutomation", "R-PRO-1-W", "template"),
    ],
    ids=["diy", "no-model", "no-ld2450", "not-esphome"],
)
@pytest.mark.usefixtures("loaded")
async def test_a_new_sensor_that_is_not_an_apollo_ld2450s_is_untouched(
    hass, advance, entity_registry, device_registry, case
) -> None:
    """Only an Apollo LD2450 model's ESPHome sensors are switched without a tap."""
    manufacturer, model, platform = case
    device = _radar(hass, device_registry, manufacturer=manufacturer, model=model)
    targets = _targets(entity_registry, device, RPRO_SERIAL, platform=platform)

    await advance(int(TARGET_UNITS_DELAY_S) + 1)

    for entity_id in targets:
        assert _options(entity_registry, entity_id) == IN_PRIVATE


async def test_a_sensor_with_no_distance_device_class_is_not_decided(
    hass, advance, entity_registry, device_registry, loaded
) -> None:
    """Home Assistant converts no unit without one, so nothing is written to it."""
    _ = loaded
    rpro = _radar(hass, device_registry)
    targets = _targets(
        entity_registry, rpro, RPRO_SERIAL, options=None, device_class=None
    )

    await advance(int(TARGET_UNITS_DELAY_S) + 1)
    await hass.config_entries.async_reload(loaded.entry_id)
    await hass.async_block_till_done()

    for entity_id in targets:
        assert _options(entity_registry, entity_id) == {}


async def test_a_unit_picked_at_creation_stays(
    hass, advance, entity_registry, device_registry, loaded
) -> None:
    """Only Home Assistant's own pick is switched."""
    _ = loaded
    rpro = _radar(hass, device_registry)
    picked = {**IN_PRIVATE, "sensor": {"unit_of_measurement": "cm"}}
    targets = _targets(entity_registry, rpro, RPRO_SERIAL, options=picked)

    await advance(int(TARGET_UNITS_DELAY_S) + 1)

    for entity_id in targets:
        assert _unit(entity_registry, entity_id) == "cm"
        assert _decision(entity_registry, entity_id) == "kept"


async def test_a_new_sensor_an_automation_uses_is_left_and_never_revisited(
    hass, advance, entity_registry, device_registry, loaded
) -> None:
    """A re-adopted radar's automations come back with it: those sensors stay."""
    x1 = f"sensor.{RPRO_SERIAL}_ld2450_target_1_x"
    assert await async_setup_component(
        hass,
        "automation",
        {
            "automation": {
                "id": "uses_x1",
                "alias": "Uses X 1",
                "triggers": [
                    {"trigger": "numeric_state", "entity_id": x1, "above": 20}
                ],
                "actions": [],
            }
        },
    )
    rpro = _radar(hass, device_registry)
    targets = _targets(entity_registry, rpro, RPRO_SERIAL)
    assert targets[0] == x1

    await advance(int(TARGET_UNITS_DELAY_S) + 1)

    assert _unit(entity_registry, x1) is None
    assert _decision(entity_registry, x1) == "kept"
    assert [_unit(entity_registry, entity_id) for entity_id in targets[1:]] == [
        "mm"
    ] * 5

    # The automation goes; the next pass still leaves X 1 as it was.
    await hass.data["automation"].async_remove_entity("automation.uses_x_1")
    await hass.config_entries.async_reload(loaded.entry_id)
    await hass.async_block_till_done()
    assert _unit(entity_registry, x1) is None


async def test_a_disabled_sensor_waits_until_it_is_enabled(
    hass, advance, entity_registry, device_registry, loaded
) -> None:
    """Disabled is undecided: once enabled, the next pass switches it."""
    rpro = _radar(hass, device_registry)
    x1 = _sensor(
        entity_registry, rpro, f"{RPRO_SERIAL}_ld2450_target_1_x", disabled=True
    )

    await advance(int(TARGET_UNITS_DELAY_S) + 1)
    assert _options(entity_registry, x1) == IN_PRIVATE

    entity_registry.async_update_entity(x1, disabled_by=None)
    await hass.config_entries.async_reload(loaded.entry_id)
    await hass.async_block_till_done()
    assert _unit(entity_registry, x1) == "mm"
    assert _notification(hass) is not None


async def test_an_unload_during_the_delay_writes_nothing(
    hass, advance, entity_registry, device_registry, loaded
) -> None:
    """The teardown cancels the decision that was waiting."""
    rpro = _radar(hass, device_registry)
    targets = _targets(entity_registry, rpro, RPRO_SERIAL)
    assert await hass.config_entries.async_unload(loaded.entry_id)

    await advance(int(TARGET_UNITS_DELAY_S) + 1)

    for entity_id in targets:
        assert _options(entity_registry, entity_id) == IN_PRIVATE


# ---------------------------------------------------------------------------
# Existing radars, once Home Assistant has started
# ---------------------------------------------------------------------------


async def test_existing_sensors_switch_once_started_with_one_notification(
    hass, caplog, entity_registry, device_registry, booting
) -> None:
    """The pass waits for the start, then names what it switched and how to go back."""
    rpro = _radar(hass, device_registry)
    targets = _targets(entity_registry, rpro, RPRO_SERIAL)
    for entity_id in targets:
        hass.states.async_set(entity_id, "48.3", INCHES)
    caplog.set_level(logging.DEBUG, logger="custom_components.apollo_mmwave")
    await setup_integration(hass, make_entry())

    # Before the start, automations may not be loaded: nothing is decided.
    for entity_id in targets:
        assert _options(entity_registry, entity_id) == IN_PRIVATE

    await booting()

    for entity_id in targets:
        assert _unit(entity_registry, entity_id) == "mm"
        assert _decision(entity_registry, entity_id) == "mm"
    notification = _notification(hass)
    assert notification["title"] == "Apollo mmWave: Target X and Y now in mm"
    assert notification["message"] == NOTIFICATION_RPRO
    assert (
        f"Showing {targets[0]} in mm, the unit the radar reports, instead of in"
        in caplog.text
    )
    # The log names what changed, never where anyone was.
    assert "48.3" not in caplog.text


async def test_a_sensor_created_while_starting_waits_for_the_start(
    hass, advance, entity_registry, device_registry, booting
) -> None:
    """Automations may not be loaded yet, so the pass after the start decides."""
    await setup_integration(hass, make_entry())
    rpro = _radar(hass, device_registry)
    targets = _targets(entity_registry, rpro, RPRO_SERIAL)

    await advance(int(TARGET_UNITS_DELAY_S) + 1)
    for entity_id in targets:
        assert _options(entity_registry, entity_id) == IN_PRIVATE

    await booting()

    for entity_id in targets:
        assert _unit(entity_registry, entity_id) == "mm"
    assert _notification(hass)["message"] == NOTIFICATION_RPRO


async def test_a_second_pass_changes_nothing_and_notifies_nothing(
    hass, entity_registry, device_registry, loaded
) -> None:
    """Decided sensors are never looked at again, even with no notification left."""
    rpro = _radar(hass, device_registry)
    targets = _targets(entity_registry, rpro, RPRO_SERIAL)
    await hass.config_entries.async_reload(loaded.entry_id)
    await hass.async_block_till_done()
    assert _notification(hass) is not None
    persistent_notification.async_dismiss(hass, TARGET_UNITS_NOTIFICATION_ID)
    # Someone picks inches again for X 1: that is theirs to keep.
    entity_registry.async_update_entity_options(
        targets[0], "sensor", {"unit_of_measurement": "in"}
    )
    after = {entity_id: _options(entity_registry, entity_id) for entity_id in targets}

    await hass.config_entries.async_reload(loaded.entry_id)
    await hass.async_block_till_done()

    assert {
        entity_id: _options(entity_registry, entity_id) for entity_id in targets
    } == after
    assert _notification(hass) is None


async def test_existing_sensors_something_names_are_left_and_recorded(
    hass, entity_registry, device_registry, booting
) -> None:
    """Structured references, templates, scripts and helpers all keep a sensor."""
    rpro = _radar(hass, device_registry)
    targets = _targets(entity_registry, rpro, RPRO_SERIAL)
    x1, y1, x2, y2, x3, _ = targets
    # X 3 had a unit picked in its settings.
    entity_registry.async_update_entity_options(
        x3, "sensor", {"unit_of_measurement": "in"}
    )
    assert await async_setup_component(
        hass,
        "automation",
        {
            "automation": [
                {
                    "id": "structured",
                    "triggers": [{"trigger": "state", "entity_id": x1}],
                    "actions": [],
                },
                {
                    "id": "template",
                    "triggers": [
                        {
                            "trigger": "template",
                            "value_template": f"{{{{ states('{y1}') | float > 3 }}}}",
                        }
                    ],
                    "actions": [],
                },
            ]
        },
    )
    assert await async_setup_component(
        hass,
        "script",
        {
            "script": {
                "reads_x2": {
                    "sequence": [
                        {"variables": {"x": f"{{{{ states.{x2}.state }}}}"}},
                    ]
                }
            }
        },
    )
    MockConfigEntry(
        domain="template",
        title="Bed side",
        options={"template_type": "sensor", "state": f"{{{{ states('{y2}') }}}}"},
    ).add_to_hass(hass)
    await setup_integration(hass, make_entry())

    await booting()

    assert [_unit(entity_registry, entity_id) for entity_id in targets] == [
        None,
        None,
        None,
        None,
        "in",
        "mm",
    ]
    assert [_decision(entity_registry, entity_id) for entity_id in targets] == [
        "kept",
        "kept",
        "kept",
        "kept",
        "kept",
        "mm",
    ]
    message = _notification(hass)["message"]
    assert "- Office R PRO-1: LD2450 Target-3 Y\n" in message
    assert (
        "Sensors that an automation, a script or a helper uses were left as they"
        " were. The Radar setup card above the zone map can switch them."
    ) in message


async def test_a_metric_install_that_moves_to_us_customary_keeps_its_inches(
    hass, entity_registry, device_registry, loaded
) -> None:
    """A sensor kept in mm is not switched back after Home Assistant re-picks."""
    rpro = _radar(hass, device_registry)
    x1 = _sensor(
        entity_registry, rpro, f"{RPRO_SERIAL}_ld2450_target_1_x", options=None
    )
    await hass.config_entries.async_reload(loaded.entry_id)
    await hass.async_block_till_done()
    assert _decision(entity_registry, x1) == "kept"

    # What Home Assistant's "update units" leaves once the sensor re-read it.
    entity_registry.async_update_entity_options(
        x1, "sensor.private", IN_PRIVATE["sensor.private"]
    )
    await hass.config_entries.async_reload(loaded.entry_id)
    await hass.async_block_till_done()

    assert _unit(entity_registry, x1) is None


async def test_a_unit_being_recomputed_waits(
    hass, entity_registry, device_registry, loaded
) -> None:
    """While Home Assistant recomputes its pick, the sensor is not decided."""
    rpro = _radar(hass, device_registry)
    refreshing = {
        "sensor.private": {
            "suggested_unit_of_measurement": "mm",
            "refresh_initial_entity_options": True,
        }
    }
    x1 = _sensor(
        entity_registry, rpro, f"{RPRO_SERIAL}_ld2450_target_1_x", options=refreshing
    )
    await hass.config_entries.async_reload(loaded.entry_id)
    await hass.async_block_till_done()
    assert _decision(entity_registry, x1) is None

    entity_registry.async_update_entity_options(
        x1, "sensor.private", IN_PRIVATE["sensor.private"]
    )
    await hass.config_entries.async_reload(loaded.entry_id)
    await hass.async_block_till_done()

    assert _unit(entity_registry, x1) == "mm"


async def test_existing_sensors_of_other_devices_are_untouched(
    hass, entity_registry, device_registry, booting
) -> None:
    """A DIY LD2450 build keeps whatever Home Assistant picked for it."""
    diy = _radar(hass, device_registry, manufacturer="Espressif", model="esp32dev")
    targets = _targets(entity_registry, diy, "diy_radar")
    await setup_integration(hass, make_entry())

    await booting()

    for entity_id in targets:
        assert _options(entity_registry, entity_id) == IN_PRIVATE
    assert _notification(hass) is None


# ---------------------------------------------------------------------------
# Presence across a live switch
# ---------------------------------------------------------------------------


async def test_presence_and_a_hold_survive_a_live_switch(
    hass, advance, entity_registry, setup_entry_with_zone
) -> None:
    """The zone reads the same person in mm as in inches, and keeps holding."""
    device_id, _ = setup_entry_with_zone
    get_store(hass).device(device_id)[STORE_ZONES][1] = {**RECT_ZONE, "hold_s": 60}
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    presence_id = entity_registry.async_get_entity_id(
        "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
    )
    x1 = "sensor.r_pro_ld2450_target_1_x"
    y1 = "sensor.r_pro_ld2450_target_1_y"
    changes: list[str] = []
    hass.bus.async_listen(
        "state_changed",
        lambda event: (
            changes.append(event.data["new_state"].state)
            if event.data["entity_id"] == presence_id
            else None
        ),
    )

    async def _report(x: str, y: str, attributes: dict[str, str]) -> None:
        hass.states.async_set(x1, x, attributes)
        hass.states.async_set(y1, y, attributes)
        await hass.async_block_till_done()
        await advance(3)

    # 254 mm right of the line and 1016 mm out: 10 and 40 inches.
    await _report("10.0", "40.0", INCHES)
    assert hass.states.get(presence_id).state == "on"

    assert async_show_in_mm(hass, [x1, y1]) == [x1, y1]
    await hass.async_block_till_done()
    await _report("254.0", "1016.0", MILLIMETERS)
    assert hass.states.get(presence_id).state == "on"
    assert "off" not in changes

    # Lost while still: the zone holds, and a switch while it holds keeps it.
    await _report(STATE_UNKNOWN, STATE_UNKNOWN, INCHES)
    assert hass.states.get(presence_id).attributes.get("held") is True
    assert async_show_in_mm(hass, [x1, y1]) == [x1, y1]
    await _report(STATE_UNKNOWN, STATE_UNKNOWN, MILLIMETERS)
    state = hass.states.get(presence_id)
    assert (state.state, state.attributes.get("held")) == ("on", True)
    assert "off" not in changes


# ---------------------------------------------------------------------------
# The Radar setup card's tap
# ---------------------------------------------------------------------------


def _rows_radar(hass, entity_registry, device_registry) -> tuple[str, list[str]]:
    """Register a radar whose X and Y show inches, picked inches, mm or no unit."""
    rpro = _radar(hass, device_registry)
    targets = _targets(entity_registry, rpro, RPRO_SERIAL)
    x1, y1, x2, y2, x3, y3 = targets
    entity_registry.async_update_entity_options(
        x2, "sensor", {"unit_of_measurement": "in"}
    )
    for entity_id, unit in ((x1, "in"), (y1, "in"), (x2, "in"), (y2, "mm"), (y3, "in")):
        hass.states.async_set(entity_id, "12", {ATTR_UNIT_OF_MEASUREMENT: unit})
    # X 3 has no length unit, as a sensor with no device class would.
    entity_registry.async_update_entity(x3, original_device_class=None)
    hass.states.async_set(x3, "12", {})
    return rpro.id, targets


@pytest.mark.usefixtures("booting")
async def test_target_units_get_reads_for_any_user(
    hass, hass_ws_client, hass_read_only_access_token, entity_registry, device_registry
) -> None:
    """Order, fields and who uses a sensor, for a non-admin too."""
    device_id, targets = _rows_radar(hass, entity_registry, device_registry)
    x1, y1, x2, y2, x3, y3 = targets
    assert await async_setup_component(
        hass,
        "automation",
        {
            "automation": {
                "id": "uses_y1",
                "alias": "Uses Y1",
                "triggers": [{"trigger": "state", "entity_id": y1}],
                "actions": [],
            }
        },
    )
    entry = make_entry()
    # Set up during boot and never started, so nothing is switched before the
    # rows are read.
    await setup_integration(hass, entry)
    user = await hass_ws_client(hass, hass_read_only_access_token)

    await user.send_json_auto_id({"type": GET, "device_id": device_id})
    reply = await user.receive_json()

    assert reply["success"] is True
    assert reply["result"] == {
        "targets": [
            {
                "entity_id": x1,
                "unit": "in",
                "picked": False,
                "convertible": True,
                "used_by": [],
            },
            {
                "entity_id": y1,
                "unit": "in",
                "picked": False,
                "convertible": True,
                "used_by": ["automation.uses_y1"],
            },
            {
                "entity_id": x2,
                "unit": "in",
                "picked": True,
                "convertible": True,
                "used_by": [],
            },
            {
                "entity_id": y2,
                "unit": "mm",
                "picked": False,
                "convertible": True,
                "used_by": [],
            },
            {
                "entity_id": x3,
                "unit": None,
                "picked": False,
                "convertible": False,
                "used_by": [],
            },
            {
                "entity_id": y3,
                "unit": "in",
                "picked": False,
                "convertible": True,
                "used_by": [],
            },
        ]
    }

    await user.send_json_auto_id({"type": GET, "device_id": "no-such-device"})
    assert (await user.receive_json())["error"]["code"] == "not_found"
    assert await hass.config_entries.async_unload(entry.entry_id)
    await user.send_json_auto_id({"type": GET, "device_id": device_id})
    assert (await user.receive_json())["error"]["code"] == "not_loaded"


@pytest.mark.usefixtures("booting")
async def test_target_units_set_switches_only_home_assistants_pick(
    hass, hass_ws_client, hass_read_only_access_token, entity_registry, device_registry
) -> None:
    """Admin only, the rows worked out again, a picked unit kept, and idempotent."""
    device_id, targets = _rows_radar(hass, entity_registry, device_registry)
    x1, y1, _, _, _, y3 = targets
    await setup_integration(hass, make_entry())
    user = await hass_ws_client(hass, hass_read_only_access_token)
    admin = await hass_ws_client(hass)

    await user.send_json_auto_id({"type": SET, "device_id": device_id})
    assert (await user.receive_json())["error"]["code"] == "unauthorized"
    assert [_unit(entity_registry, entity_id) for entity_id in targets] == [
        None,
        None,
        "in",
        None,
        None,
        None,
    ]

    await admin.send_json_auto_id({"type": SET, "device_id": device_id})
    reply = await admin.receive_json()

    assert reply["result"] == {"changed": [x1, y1, y3]}
    assert [_unit(entity_registry, entity_id) for entity_id in targets] == [
        "mm",
        "mm",
        "in",
        None,
        None,
        "mm",
    ]
    assert _decision(entity_registry, x1) == "mm"
    for entity_id in (x1, y1, y3):
        hass.states.async_set(entity_id, "305", MILLIMETERS)

    await admin.send_json_auto_id({"type": SET, "device_id": device_id})
    assert (await admin.receive_json())["result"] == {"changed": []}
    await admin.send_json_auto_id({"type": SET, "device_id": "no-such-device"})
    assert (await admin.receive_json())["error"]["code"] == "not_found"
