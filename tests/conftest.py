"""Shared fixtures for Apollo mmWave tests."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import timedelta
from functools import partial
from typing import TYPE_CHECKING, Any

import pytest
import voluptuous as vol
from homeassistant.auth.permissions.const import POLICY_CONTROL
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.entity_registry import RegistryEntryDisabler
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
)

from custom_components.apollo_mmwave import calibration, get_store
from custom_components.apollo_mmwave.const import (
    DATA_CALIBRATION_JOBS,
    DOMAIN,
    SERVICE_CALIBRATE_GATES,
    SERVICE_CANCEL_CALIBRATION,
    SERVICE_RESTORE_GATE_THRESHOLDS,
    SIGNAL_ZONES_UPDATED,
    STORE_ZONES,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from homeassistant.core import Context
    from homeassistant.helpers.device_registry import DeviceEntry

RADAR_NAME = "Apollo R_PRO-1 abc123"
RADAR_TARGET_COUNT = 3

RECT_ZONE: dict[str, Any] = {
    "shape": "rect",
    "data": {"x_min": -1000, "x_max": 1000, "y_min": 0, "y_max": 2000},
}


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Let the test hass load custom_components/apollo_mmwave."""
    return


@pytest.fixture
def config_entry() -> MockConfigEntry:
    """
    Return a plain Apollo mmWave entry with the dashboard turned off.

    The dashboard/panel path pokes Lovelace internals that aren't interesting
    to most tests; individual tests opt back in via options.
    """
    return MockConfigEntry(
        domain=DOMAIN,
        title="Apollo mmWave",
        data={},
        options={"auto_create_view": False},
        unique_id=DOMAIN,
    )


@pytest.fixture
def esphome_device(hass, device_registry, entity_registry) -> DeviceEntry:
    """Register a radar device with a full set of LD2450 target sensors."""
    # The device registry refuses to link a device to a config entry that does
    # not exist, so the radar's owning esphome entry has to be real.
    esphome_entry = MockConfigEntry(domain="esphome", title=RADAR_NAME)
    esphome_entry.add_to_hass(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", "apollo_r_pro_1_abc123")},
        name=RADAR_NAME,
    )
    for target in range(1, RADAR_TARGET_COUNT + 1):
        for axis in ("x", "y"):
            entity_registry.async_get_or_create(
                "sensor",
                "esphome",
                f"target_{target}_{axis}",
                device_id=device.id,
                suggested_object_id=f"r_pro_ld2450_target_{target}_{axis}",
            )
    return device


@pytest.fixture
def device_id(esphome_device) -> str:
    """Return the radar's Home Assistant device id."""
    return esphome_device.id


async def setup_integration(hass, entry: MockConfigEntry) -> None:
    """Add the entry and set the integration up."""
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


@pytest.fixture
async def init_integration(hass, config_entry, esphome_device) -> MockConfigEntry:
    """Set the integration up with the radar device already registered."""
    _ = esphome_device
    await setup_integration(hass, config_entry)
    return config_entry


@pytest.fixture
async def setup_entry_with_zone(hass, init_integration, device_id) -> tuple[str, Any]:
    """Set the integration up with one rect zone drawn on the radar."""
    # Written straight to the store rather than through the update_zone service:
    # the service's payload is still being reshaped, and every consumer of this
    # fixture cares about the resulting entities, not about how they got there.
    store = get_store(hass)
    store.device(device_id)[STORE_ZONES][1] = dict(RECT_ZONE)
    async_dispatcher_send(hass, SIGNAL_ZONES_UPDATED, device_id)
    await hass.async_block_till_done()
    return device_id, init_integration


# ---------------------------------------------------------------------------
# Gate-radar fixtures for the calibration tests.
# ---------------------------------------------------------------------------

LD2410_BASE = "apollo_msr_2_abc123"
LD2410_NAME = "Apollo MSR-2 abc123"
# The LD2412 radar gets its own serial so it never collides with the LD2450-only
# `esphome_device` fixture, which some calibration tests use side by side.
LD2412_SERIAL = "apollo_r_pro_1_def456"
LD2412_BASE = f"{LD2412_SERIAL}_ld2412"
LD2412_NAME = "Apollo R-PRO-1 def456"
LD2410_GATES = 9
LD2412_GATES = 14
# HLK-LD2410 manual defaults, the values a factory-reset MSR-2 shows.
LD2410_FACTORY = {
    "move": [50, 50, 40, 30, 20, 15, 15, 15, 15],
    "still": [0, 0, 40, 40, 30, 30, 20, 20, 20],
}
LD2412_FACTORY = {"move": [40] * LD2412_GATES, "still": [40] * LD2412_GATES}
NUMBER_ATTRS = {"min": 0, "max": 100, "step": 1}
GATE_RANGE_ATTRS = {"min": 1, "max": 13, "step": 1}
CALIBRATION_STORAGE_KEY = f"{DOMAIN}.calibration"


@dataclass(frozen=True)
class RadarIds:
    """Entity ids of one gate radar fixture, derived from its base name."""

    device_id: str
    base: str
    profile: str
    gate_count: int
    width: int

    def _gate(self, gate: int) -> str:
        return f"g{gate:0{self.width}d}"

    def threshold(self, gate: int, channel: str) -> str:
        """Return the threshold number of one gate channel."""
        return f"number.{self.base}_{self._gate(gate)}_{channel}_threshold"

    def energy(self, gate: int, channel: str) -> str:
        """Return the energy sensor of one gate channel."""
        return f"sensor.{self.base}_{self._gate(gate)}_{channel}_energy"

    def thresholds(self) -> list[str]:
        """Return every threshold in write order: gate ascending, move then still."""
        return [
            self.threshold(gate, channel)
            for gate in range(self.gate_count)
            for channel in ("move", "still")
        ]

    def _scalar(self, domain: str, ld2410: str, ld2412: str) -> str:
        suffix = ld2410 if self.profile == "ld2410" else ld2412
        return f"{domain}.{self.base}{suffix}"

    @property
    def engineering(self) -> str:
        """Return the engineering-mode switch."""
        return self._scalar("switch", "_radar_engineering_mode", "_engineering_mode")

    @property
    def max_move(self) -> str:
        """Return the LD2410 max move gate number."""
        return f"number.{self.base}_radar_max_move_distance"

    @property
    def max_still(self) -> str:
        """Return the LD2410 max still gate number."""
        return f"number.{self.base}_radar_max_still_distance"

    @property
    def min_gate(self) -> str:
        """Return the LD2412 min gate number."""
        return f"number.{self.base}_min_distance_gate"

    @property
    def max_gate(self) -> str:
        """Return the LD2412 max gate number."""
        return f"number.{self.base}_max_distance_gate"

    @property
    def moving_target(self) -> str:
        """Return the moving-target binary sensor."""
        return self._scalar("binary_sensor", "_radar_moving_target", "_moving_target")

    @property
    def radar_target(self) -> str:
        """Return the has-target binary sensor."""
        return self._scalar("binary_sensor", "_radar_target", "_presence")

    @property
    def bg_button(self) -> str:
        """Return the LD2412 background-correction button."""
        return f"button.{self.base}_start_dynamic_background_correction"

    @property
    def bg_status(self) -> str:
        """Return the LD2412 background-correction status sensor."""
        return f"binary_sensor.{self.base}_dynamic_background_correction_status"

    @property
    def query_params(self) -> str:
        """Return the LD2412 query-params button."""
        return f"button.{self.base}_query_params"


def radar_ids(device: DeviceEntry) -> RadarIds:
    """Derive a fixture radar's entity ids from its device entry."""
    serial = next(value for domain, value in device.identifiers if domain == "esphome")
    if serial == LD2412_SERIAL:
        return RadarIds(device.id, LD2412_BASE, "ld2412", LD2412_GATES, 2)
    return RadarIds(device.id, LD2410_BASE, "ld2410", LD2410_GATES, 1)


class EntityBuilder:
    """Register esphome entities on one device and give them states."""

    def __init__(self, hass, entity_registry, device_id: str) -> None:
        """Bind the builder to a device."""
        self.hass = hass
        self.entity_registry = entity_registry
        self.device_id = device_id

    def add(
        self,
        domain: str,
        object_id: str,
        state: str | None,
        attributes: dict[str, Any] | None = None,
        *,
        disabled: bool = False,
    ) -> str:
        """Register one entity (unique id derived from the object id)."""
        entry = self.entity_registry.async_get_or_create(
            domain,
            "esphome",
            f"uid_{object_id}",
            device_id=self.device_id,
            suggested_object_id=object_id,
            disabled_by=RegistryEntryDisabler.USER if disabled else None,
        )
        if state is not None:
            self.hass.states.async_set(entry.entity_id, state, attributes or {})
        return entry.entity_id


def _make_gate_radar(
    hass, device_registry, entity_registry, *, serial: str, name: str
) -> DeviceEntry:
    esphome_entry = MockConfigEntry(domain="esphome", title=name)
    esphome_entry.add_to_hass(hass)
    return device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", serial)},
        name=name,
    )


def _register_gates(builder: EntityBuilder, ids: RadarIds, factory) -> None:
    for gate in range(ids.gate_count):
        for channel in ("move", "still"):
            builder.add(
                "number",
                ids.threshold(gate, channel).partition(".")[2],
                str(factory[channel][gate]),
                NUMBER_ATTRS,
            )
            builder.add(
                "sensor", ids.energy(gate, channel).partition(".")[2], "unknown"
            )


@pytest.fixture
def active_radars() -> list[RadarIds]:
    """Track the gate radars a test registered, newest last."""
    return []


@pytest.fixture
def ld2410_device(hass, device_registry, entity_registry, active_radars) -> DeviceEntry:
    """Register an MSR-2 (LD2410) with its gate, range and target entities."""
    device = _make_gate_radar(
        hass, device_registry, entity_registry, serial=LD2410_BASE, name=LD2410_NAME
    )
    ids = radar_ids(device)
    builder = EntityBuilder(hass, entity_registry, device.id)
    builder.add("switch", f"{LD2410_BASE}_radar_engineering_mode", "off")
    _register_gates(builder, ids, LD2410_FACTORY)
    range_attrs = {"min": 2, "max": 8, "step": 1}
    builder.add("number", f"{LD2410_BASE}_radar_max_move_distance", "6", range_attrs)
    builder.add("number", f"{LD2410_BASE}_radar_max_still_distance", "6", range_attrs)
    builder.add("binary_sensor", f"{LD2410_BASE}_radar_moving_target", "off")
    builder.add("binary_sensor", f"{LD2410_BASE}_radar_target", "off")
    active_radars.append(ids)
    return device


@pytest.fixture
def ld2412_device(hass, device_registry, entity_registry, active_radars) -> DeviceEntry:
    """Register an R-PRO-1 (LD2412) with its gate, range, button and status entities."""
    device = _make_gate_radar(
        hass, device_registry, entity_registry, serial=LD2412_SERIAL, name=LD2412_NAME
    )
    ids = radar_ids(device)
    builder = EntityBuilder(hass, entity_registry, device.id)
    builder.add("switch", f"{LD2412_BASE}_engineering_mode", "off")
    _register_gates(builder, ids, LD2412_FACTORY)
    builder.add("number", f"{LD2412_BASE}_min_distance_gate", "1", GATE_RANGE_ATTRS)
    builder.add("number", f"{LD2412_BASE}_max_distance_gate", "11", GATE_RANGE_ATTRS)
    builder.add(
        "button", f"{LD2412_BASE}_start_dynamic_background_correction", "unknown"
    )
    builder.add("button", f"{LD2412_BASE}_query_params", "unknown")
    builder.add(
        "binary_sensor", f"{LD2412_BASE}_dynamic_background_correction_status", "off"
    )
    builder.add("binary_sensor", f"{LD2412_BASE}_moving_target", "off")
    builder.add("binary_sensor", f"{LD2412_BASE}_presence", "off")
    active_radars.append(ids)
    return device


_CALL_SCHEMA = vol.Schema(
    {
        vol.Required("entity_id"): cv.entity_ids,
        vol.Optional("value"): vol.Coerce(float),
    },
    extra=vol.ALLOW_EXTRA,
)


class FakeDeviceServices:
    """Real handlers for the four device services the job calls."""

    def __init__(self, hass) -> None:
        """Register the handlers; every call lands in `calls`."""
        self.hass = hass
        self.calls: list[tuple[str, str, str, float | None, str]] = []
        self.echo_switch = True
        self.echo_numbers = True
        self.raise_on: set[str] = set()
        self.unauthorized: set[str] = set()
        self.on_press: dict[str, Callable[[], Any]] = {}
        self.on_set_value: Callable[[int, str, float], Any] | None = None
        # Called with (domain, service, entity_id) after a call is recorded and
        # before it is echoed, so a test can look at storage mid-write.
        self.on_call: Callable[[str, str, str], Any] | None = None
        for domain, service in (
            ("number", "set_value"),
            ("switch", "turn_on"),
            ("switch", "turn_off"),
            ("button", "press"),
        ):
            hass.services.async_register(
                domain, service, partial(self._handle, domain, service), _CALL_SCHEMA
            )

    @property
    def echo(self) -> bool:
        """Report whether writes are reflected into `hass.states`."""
        return self.echo_switch and self.echo_numbers

    @echo.setter
    def echo(self, value: bool) -> None:
        self.echo_switch = value
        self.echo_numbers = value

    def writes(self) -> list[tuple[str, float]]:
        """Return `(entity_id, value)` for every number write, in order."""
        return [(call[2], call[3]) for call in self.calls if call[1] == "set_value"]

    def of(self, service: str) -> list[tuple[str, str, str, float | None, str]]:
        """Return the recorded calls of one service."""
        return [call for call in self.calls if call[1] == service]

    async def _handle(self, domain: str, service: str, call) -> None:
        value = call.data.get("value")
        for entity_id in call.data["entity_id"]:
            if entity_id in self.unauthorized:
                raise Unauthorized(entity_id=entity_id, permission=POLICY_CONTROL)
            if entity_id in self.raise_on:
                msg = f"{entity_id} refused the write"
                raise HomeAssistantError(msg)
            self.calls.append((domain, service, entity_id, value, call.context.id))
            if self.on_call is not None:
                self.on_call(domain, service, entity_id)
            await self._echo(domain, service, entity_id, value)

    async def _echo(
        self, domain: str, service: str, entity_id: str, value: float | None
    ) -> None:
        state = self.hass.states.get(entity_id)
        attributes = dict(state.attributes) if state else {}
        if domain == "switch" and self.echo_switch:
            self.hass.states.async_set(
                entity_id, "on" if service == "turn_on" else "off", attributes
            )
        elif domain == "number" and self.echo_numbers and value is not None:
            self.hass.states.async_set(entity_id, str(value), attributes)
        if domain == "number" and self.on_set_value is not None:
            result = self.on_set_value(len(self.writes()), entity_id, value)
            if asyncio.iscoroutine(result):
                await result
        if domain == "button" and entity_id in self.on_press:
            result = self.on_press[entity_id]()
            if asyncio.iscoroutine(result):
                await result


@pytest.fixture
def fake_device_services(hass) -> FakeDeviceServices:
    """Register number/switch/button handlers that record and echo writes."""
    return FakeDeviceServices(hass)


class EnergyFeed:
    """Set gate energy states for the active radar fixture."""

    def __init__(self, hass, radars: list[RadarIds]) -> None:
        """Remember hass and the fixture list (the newest radar is the default)."""
        self.hass = hass
        self._radars = radars

    @property
    def radar(self) -> RadarIds:
        """Return the radar energies go to unless one is named."""
        return self._radars[-1]

    def set(
        self, values: dict[tuple[int, str], float], radar: RadarIds | None = None
    ) -> None:
        """Set `(gate, channel) -> energy` states."""
        ids = radar or self.radar
        for (gate, channel), value in values.items():
            self.hass.states.async_set(ids.energy(gate, channel), str(value))

    def set_all(self, move: float, still: float, radar: RadarIds | None = None) -> None:
        """Set every gate's move and still energy."""
        ids = radar or self.radar
        self.set(
            {
                **{(gate, "move"): move for gate in range(ids.gate_count)},
                **{(gate, "still"): still for gate in range(ids.gate_count)},
            },
            ids,
        )

    def unavailable(self, entity_ids: list[str]) -> None:
        """Mark entities unavailable, keeping their attributes."""
        for entity_id in entity_ids:
            state = self.hass.states.get(entity_id)
            attributes = dict(state.attributes) if state else {}
            self.hass.states.async_set(entity_id, "unavailable", attributes)

    def remove(self, entity_ids: list[str]) -> None:
        """Drop the state objects (the entities stay registered)."""
        for entity_id in entity_ids:
            self.hass.states.async_remove(entity_id)


@pytest.fixture
def energy_feed(hass, active_radars) -> EnergyFeed:
    """Return a helper that feeds energy readings to the active radar."""
    return EnergyFeed(hass, active_radars)


@pytest.fixture
def advance(hass, freezer):
    """Return `advance(seconds)`: one frozen second and one timer pass per step."""

    async def _advance(seconds: int) -> None:
        for _ in range(seconds):
            freezer.tick(timedelta(seconds=1))
            async_fire_time_changed(hass)
            await hass.async_block_till_done()

    return _advance


@pytest.fixture
def fast_writes(monkeypatch) -> None:
    """Zero the three real-time sleeps so the writer and the read-backs are instant."""
    monkeypatch.setattr(calibration, "WRITE_SPACING_S", 0)
    monkeypatch.setattr(calibration, "VERIFY_SETTLE_S", 0)
    monkeypatch.setattr(calibration, "RESTORE_READBACK_S", 0)


@pytest.fixture
def start_job(hass):
    """Return `start_job(device_id, **fields)`: a waiting service call as a task."""

    def _start(
        device_id: str,
        *,
        service: str = SERVICE_CALIBRATE_GATES,
        context: Context | None = None,
        **fields: Any,
    ) -> asyncio.Task:
        coro = hass.services.async_call(
            DOMAIN,
            service,
            {"device_id": device_id, "wait": True, **fields},
            blocking=True,
            return_response=True,
            context=context,
        )
        return hass.async_create_background_task(coro, "test calibration call")

    return _start


async def finish_job(task: asyncio.Task, iterations: int = 5000) -> dict[str, Any]:
    """Let the job run to completion (bounded) and return the service response."""
    for _ in range(iterations):
        if task.done():
            return task.result()
        await asyncio.sleep(0)
    task.cancel()
    pytest.fail("the calibration job did not finish")


async def settle(iterations: int = 10) -> None:
    """Yield to the loop a few times so a background job can make progress."""
    for _ in range(iterations):
        await asyncio.sleep(0)


@dataclass
class CalibrationRig:
    """The fixtures a calibration run needs, with a one-call happy path."""

    hass: Any
    services: FakeDeviceServices
    feed: EnergyFeed
    advance: Callable[[int], Awaitable[None]]
    start_job: Callable[..., asyncio.Task]

    def start(self, ids: RadarIds, **fields: Any) -> asyncio.Task:
        """Start a calibrate call with no countdown and a short listen by default."""
        fields.setdefault("settle_s", 0)
        fields.setdefault("duration_s", 15)
        return self.start_job(ids.device_id, **fields)

    async def run(
        self, ids: RadarIds, *, move: float = 10, still: float = 10, **fields: Any
    ) -> dict[str, Any]:
        """Run a whole calibration with constant energies and return the result."""
        task = self.start(ids, **fields)
        self.feed.set_all(move, still, ids)
        await self.advance(fields.get("settle_s", 0) + fields.get("duration_s", 15))
        return await finish_job(task)

    async def restore(self, ids: RadarIds, **fields: Any) -> dict[str, Any]:
        """Run a restore and return its result."""
        task = self.start_job(
            ids.device_id, service=SERVICE_RESTORE_GATE_THRESHOLDS, **fields
        )
        return await finish_job(task)

    def job(self, ids: RadarIds) -> calibration.CalibrationJob | None:
        """Return the registered job for a radar, if any."""
        return self.hass.data[DOMAIN][DATA_CALIBRATION_JOBS].get(ids.device_id)

    async def cancel(self, ids: RadarIds) -> dict[str, Any] | None:
        """Call the cancel service."""
        return await self.hass.services.async_call(
            DOMAIN,
            SERVICE_CANCEL_CALIBRATION,
            {"device_id": ids.device_id},
            blocking=True,
            return_response=True,
        )


@pytest.fixture
def _rig_tools(energy_feed, advance, start_job) -> tuple[Any, Any, Any]:
    return energy_feed, advance, start_job


@pytest.fixture
async def paced_rig(
    hass, init_integration, fake_device_services, _rig_tools
) -> CalibrationRig:
    """Return a rig that keeps the real write spacing and read-back sleeps."""
    _ = init_integration
    feed, advance, start_job = _rig_tools
    return CalibrationRig(hass, fake_device_services, feed, advance, start_job)


@pytest.fixture
def calibration_rig(paced_rig, fast_writes) -> CalibrationRig:
    """Return the rig with the three real-time sleeps zeroed."""
    _ = fast_writes
    return paced_rig
