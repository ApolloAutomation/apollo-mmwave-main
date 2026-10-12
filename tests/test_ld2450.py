"""LD2450 target pair resolution from the entity registry."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_registry import RegistryEntryDisabler
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave import get_store, ld2450
from custom_components.apollo_mmwave.const import (
    DATA_PAIR_CACHE,
    DOMAIN,
    SERVICE_UPDATE_ZONE,
    SIGNAL_ZONES_UPDATED,
)
from custom_components.apollo_mmwave.ld2450 import (
    async_track_target_pairs,
    effective_target_pairs,
    resolve_target_pairs,
)
from custom_components.apollo_mmwave.store import ZoneStore

from .conftest import RECT_ZONE

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from homeassistant.helpers.device_registry import DeviceEntry


def _make_radar(hass, device_registry, name: str) -> DeviceEntry:
    """Register an esphome radar device. Its entry has to be real."""
    # The device registry refuses to link a device to a config entry that does
    # not exist, so the radar's owning entry has to be real.
    esphome_entry = MockConfigEntry(domain="esphome", title=name)
    esphome_entry.add_to_hass(hass)
    return device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", name)},
        name=name,
    )


async def test_resolve_target_pairs_pairs_x_and_y_by_target_number(
    hass, entity_registry, device_registry
) -> None:
    """Each X sensor pairs with the Y carrying the same target number."""
    device = _make_radar(hass, device_registry, "R Pro")
    for suffix in ("target_1_x", "target_1_y", "target_2_x", "target_2_y"):
        entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            suffix,
            device_id=device.id,
            suggested_object_id=f"r_pro_ld2450_{suffix}",
        )

    pairs = resolve_target_pairs(hass, device.id)

    assert pairs == [
        {"x": "sensor.r_pro_ld2450_target_1_x", "y": "sensor.r_pro_ld2450_target_1_y"},
        {"x": "sensor.r_pro_ld2450_target_2_x", "y": "sensor.r_pro_ld2450_target_2_y"},
    ]


async def test_resolve_target_pairs_skips_unpaired_and_tolerates_dedup_suffix(
    hass, entity_registry, device_registry
) -> None:
    """A `_2` dedup suffix still matches, and a lone X is not returned."""
    device = _make_radar(hass, device_registry, "MTR")
    for suffix, object_id in (
        ("t1x", "mtr_ld2450_target_1_x_2"),
        ("t1y", "mtr_ld2450_target_1_y_2"),
        ("t2x", "mtr_ld2450_target_2_x"),
    ):
        entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            suffix,
            device_id=device.id,
            suggested_object_id=object_id,
        )

    assert resolve_target_pairs(hass, device.id) == [
        {"x": "sensor.mtr_ld2450_target_1_x_2", "y": "sensor.mtr_ld2450_target_1_y_2"}
    ]


async def test_resolve_target_pairs_accepts_mtr1_firmware_naming(
    hass, entity_registry, device_registry
) -> None:
    """The MTR-1 firmware names its targets "Target-1 X", with no LD2450 prefix."""
    device = _make_radar(hass, device_registry, "MTR-1")
    for suffix in ("target_1_x", "target_1_y", "target_3_x", "target_3_y"):
        entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            suffix,
            device_id=device.id,
            suggested_object_id=f"apollo_mtr_1_cbbdb4_{suffix}",
        )
    # Not a coordinate, and must not be mistaken for one.
    entity_registry.async_get_or_create(
        "binary_sensor",
        "esphome",
        "presence",
        device_id=device.id,
        suggested_object_id="apollo_mtr_1_cbbdb4_radar_target",
    )

    assert resolve_target_pairs(hass, device.id) == [
        {
            "x": "sensor.apollo_mtr_1_cbbdb4_target_1_x",
            "y": "sensor.apollo_mtr_1_cbbdb4_target_1_y",
        },
        {
            "x": "sensor.apollo_mtr_1_cbbdb4_target_3_x",
            "y": "sensor.apollo_mtr_1_cbbdb4_target_3_y",
        },
    ]


async def test_resolve_target_pairs_ignores_other_devices(
    hass, entity_registry, device_registry
) -> None:
    """A second radar in the house does not leak into the first one's pairs."""
    device = _make_radar(hass, device_registry, "Kitchen")
    other = _make_radar(hass, device_registry, "Office")
    for base, owner in (("kitchen", device), ("office", other)):
        for axis in ("x", "y"):
            entity_registry.async_get_or_create(
                "sensor",
                "esphome",
                f"{base}1{axis}",
                device_id=owner.id,
                suggested_object_id=f"{base}_ld2450_target_1_{axis}",
            )

    assert resolve_target_pairs(hass, device.id) == [
        {
            "x": "sensor.kitchen_ld2450_target_1_x",
            "y": "sensor.kitchen_ld2450_target_1_y",
        }
    ]


async def test_resolve_target_pairs_ignores_non_sensor_domains(
    hass, entity_registry, device_registry
) -> None:
    """A number entity named like a target sensor is not a coordinate source."""
    device = _make_radar(hass, device_registry, "Kitchen")
    for axis in ("x", "y"):
        entity_registry.async_get_or_create(
            "number",
            "esphome",
            f"k2{axis}",
            device_id=device.id,
            suggested_object_id=f"kitchen_ld2450_target_2_{axis}",
        )

    assert resolve_target_pairs(hass, device.id) == []


async def test_resolve_target_pairs_skips_disabled_entities(
    hass, entity_registry, device_registry
) -> None:
    """A disabled Y has no state to read, so its target is not offered."""
    device = _make_radar(hass, device_registry, "Den")
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "d1x",
        device_id=device.id,
        suggested_object_id="den_ld2450_target_1_x",
    )
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "d1y",
        device_id=device.id,
        suggested_object_id="den_ld2450_target_1_y",
        disabled_by=RegistryEntryDisabler.USER,
    )

    assert resolve_target_pairs(hass, device.id) == []


async def test_resolve_target_pairs_is_empty_for_a_device_without_a_radar(
    hass, device_registry
) -> None:
    """A device with no LD2450 entities resolves to nothing, not an error."""
    device = _make_radar(hass, device_registry, "Plug")

    assert resolve_target_pairs(hass, device.id) == []


async def test_resolve_target_pairs_sorts_numerically_not_lexically(
    hass, entity_registry, device_registry
) -> None:
    """Target 10 sorts after target 2, which string ordering would get wrong."""
    device = _make_radar(hass, device_registry, "Hall")
    for n in (10, 2):
        for axis in ("x", "y"):
            entity_registry.async_get_or_create(
                "sensor",
                "esphome",
                f"h{n}{axis}",
                device_id=device.id,
                suggested_object_id=f"hall_ld2450_target_{n}_{axis}",
            )

    assert [pair["x"] for pair in resolve_target_pairs(hass, device.id)] == [
        "sensor.hall_ld2450_target_2_x",
        "sensor.hall_ld2450_target_10_x",
    ]


async def test_effective_target_pairs_does_not_create_a_store_entry(
    hass, entity_registry, device_registry
) -> None:
    """Asking about an unstored device answers from the radar and writes nothing."""
    device = _make_radar(hass, device_registry, "Garage")
    for axis in ("x", "y"):
        entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            f"g1{axis}",
            device_id=device.id,
            suggested_object_id=f"garage_ld2450_target_1_{axis}",
        )
    store = ZoneStore(hass)

    pairs = effective_target_pairs(hass, store, device.id)

    assert pairs == [
        {
            "x": "sensor.garage_ld2450_target_1_x",
            "y": "sensor.garage_ld2450_target_1_y",
        }
    ]
    # A setdefault read here would leave a permanent entry for a device nobody
    # has configured, which is the phantom-entry bug this release exists to fix.
    assert store.devices == {}


def _started_listeners(hass) -> int:
    """Count the EVENT_HOMEASSISTANT_STARTED listeners on the bus."""
    # The key is dropped once its last listener goes, so read it with a default.
    return hass.bus.async_listeners().get(EVENT_HOMEASSISTANT_STARTED, 0)


async def test_unloading_after_startup_logs_no_listener_error(
    hass, esphome_device, caplog
) -> None:
    """The one-shot STARTED listener must not be removed twice on reload."""
    # The test hass boots already running, where no one-shot is registered at
    # all, so step back to not_running, where integrations set up during boot.
    hass.set_state(CoreState.not_running)
    baseline = _started_listeners(hass)
    unsubscribe = async_track_target_pairs(hass)
    assert _started_listeners(hass) == baseline + 1
    # A pair resolved before boot finished is what the one-shot re-resolves.
    assert effective_target_pairs(hass, ZoneStore(hass), esphome_device.id)
    signals = _record_signals(hass)

    hass.set_state(CoreState.running)
    hass.bus.async_fire(EVENT_HOMEASSISTANT_STARTED)
    await hass.async_block_till_done()

    assert signals == [esphome_device.id]
    assert hass.data[DOMAIN][DATA_PAIR_CACHE] == {}
    # Other one-shots on this event fire too, so the count after it says
    # nothing about ours. The error log is what a second removal leaves.
    unsubscribe()
    assert "Unable to remove unknown job listener" not in caplog.text


async def test_unloading_before_startup_removes_the_pending_listener(
    hass, caplog
) -> None:
    """A reload during boot takes its one-shot with it rather than leaving it."""
    hass.set_state(CoreState.not_running)
    baseline = _started_listeners(hass)
    unsubscribe = async_track_target_pairs(hass)
    assert _started_listeners(hass) == baseline + 1

    unsubscribe()

    assert _started_listeners(hass) == baseline
    assert "Unable to remove unknown job listener" not in caplog.text


async def test_subscribing_once_running_adds_no_startup_listener(hass, caplog) -> None:
    """Once Home Assistant is already running there is nothing to wait for."""
    assert hass.is_running
    baseline = _started_listeners(hass)

    unsubscribe = async_track_target_pairs(hass)
    assert _started_listeners(hass) == baseline
    unsubscribe()

    assert "Unable to remove unknown job listener" not in caplog.text


def _add_targets(
    entity_registry, device: DeviceEntry, base: str, suffixes: tuple[str, ...]
) -> None:
    """Register `<base>_ld2450_target_<suffix>` sensors on a device."""
    for suffix in suffixes:
        entity_registry.async_get_or_create(
            "sensor",
            "esphome",
            f"{base}_{suffix}",
            device_id=device.id,
            suggested_object_id=f"{base}_ld2450_target_{suffix}",
        )


def _pair(x_base: str, y_base: str, target: int) -> dict[str, str]:
    """Return one target's X/Y pair, the X and Y possibly from different radars."""
    return {
        "x": f"sensor.{x_base}_ld2450_target_{target}_x",
        "y": f"sensor.{y_base}_ld2450_target_{target}_y",
    }


def _record_signals(hass) -> list[str]:
    """Collect the device id of every SIGNAL_ZONES_UPDATED from now on."""
    signals: list[str] = []

    @callback
    def _record(device_id: str) -> None:
        signals.append(device_id)

    async_dispatcher_connect(hass, SIGNAL_ZONES_UPDATED, _record)
    return signals


@pytest.fixture
async def pair_tracking(hass) -> AsyncGenerator[None]:
    """Run the registry listener the integration starts on setup."""
    unsubscribe = async_track_target_pairs(hass)
    yield
    unsubscribe()


async def test_moving_a_target_sensor_to_another_device_invalidates_both_caches(
    hass, entity_registry, device_registry, pair_tracking
) -> None:
    """The radar a target left must stop tracking it, not just the one it joined."""
    _ = pair_tracking
    alpha = _make_radar(hass, device_registry, "Alpha")
    beta = _make_radar(hass, device_registry, "Beta")
    _add_targets(entity_registry, alpha, "alpha", ("1_x", "1_y"))
    _add_targets(entity_registry, beta, "beta", ("1_y", "2_x", "2_y"))
    store = ZoneStore(hass)
    assert effective_target_pairs(hass, store, alpha.id) == [_pair("alpha", "alpha", 1)]
    assert effective_target_pairs(hass, store, beta.id) == [_pair("beta", "beta", 2)]
    signals = _record_signals(hass)

    entity_registry.async_update_entity(
        "sensor.alpha_ld2450_target_1_x", device_id=beta.id
    )
    await hass.async_block_till_done()

    assert sorted(signals) == sorted([alpha.id, beta.id])
    # Alpha is left with a lone Y, which is no pair at all.
    assert effective_target_pairs(hass, store, alpha.id) == []
    # Beta's own Y for target 1 now has an X to pair with.
    assert effective_target_pairs(hass, store, beta.id) == [
        _pair("alpha", "beta", 1),
        _pair("beta", "beta", 2),
    ]


async def test_rename_and_move_invalidates_the_old_device(
    hass, entity_registry, device_registry, pair_tracking
) -> None:
    """A rename reports the old id too, and the old radar cached that one."""
    _ = pair_tracking
    alpha = _make_radar(hass, device_registry, "Alpha")
    beta = _make_radar(hass, device_registry, "Beta")
    _add_targets(entity_registry, alpha, "alpha", ("1_x", "1_y"))
    store = ZoneStore(hass)
    assert effective_target_pairs(hass, store, alpha.id) == [_pair("alpha", "alpha", 1)]
    signals = _record_signals(hass)

    entity_registry.async_update_entity(
        "sensor.alpha_ld2450_target_1_x",
        new_entity_id="sensor.beta_ld2450_target_1_x",
        device_id=beta.id,
    )
    await hass.async_block_till_done()

    # Beta was never cached, so only alpha has anything to drop.
    assert signals == [alpha.id]
    assert effective_target_pairs(hass, store, alpha.id) == []


@pytest.mark.parametrize(
    "changes",
    [
        # Away from the target naming: only the old id still looks like one.
        {"new_entity_id": "sensor.den_living_room_x"},
        {"disabled_by": RegistryEntryDisabler.USER},
    ],
    ids=["renamed-away", "disabled"],
)
async def test_renaming_or_disabling_a_target_sensor_still_invalidates(
    hass, entity_registry, device_registry, pair_tracking, changes: dict[str, Any]
) -> None:
    """Skipping events for other entities must not skip the targets themselves."""
    _ = pair_tracking
    den = _make_radar(hass, device_registry, "Den")
    _add_targets(entity_registry, den, "den", ("1_x", "1_y", "2_x", "2_y"))
    store = ZoneStore(hass)
    assert len(effective_target_pairs(hass, store, den.id)) == 2
    signals = _record_signals(hass)

    entity_registry.async_update_entity("sensor.den_ld2450_target_1_x", **changes)
    await hass.async_block_till_done()

    assert signals == [den.id]
    assert effective_target_pairs(hass, store, den.id) == [_pair("den", "den", 2)]


async def test_registry_events_for_zone_entities_do_not_invalidate_the_cache(
    hass, entity_registry, init_integration, device_id, monkeypatch
) -> None:
    """Drawing or renaming a zone writes our own entities, not the radar's targets."""
    _ = init_integration
    # Warm the cache first, so any resolve after this is an invalidation.
    assert effective_target_pairs(hass, get_store(hass), device_id)
    resolved: list[str] = []
    real = ld2450.resolve_target_pairs

    def _counting(hass_, target_device_id: str) -> list[dict[str, str]]:
        resolved.append(target_device_id)
        return real(hass_, target_device_id)

    monkeypatch.setattr(ld2450, "resolve_target_pairs", _counting)
    signals = _record_signals(hass)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, **RECT_ZONE},
        blocking=True,
    )
    await hass.async_block_till_done()
    presence_id = entity_registry.async_get_entity_id(
        "binary_sensor", DOMAIN, f"{device_id}_zone_1_presence"
    )
    # The zone's entities did land in the registry, on the radar device.
    assert entity_registry.async_get(presence_id).device_id == device_id
    assert entity_registry.async_get_entity_id("sensor", DOMAIN, f"{device_id}_zone_1")
    assert signals == [device_id]

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {"device_id": device_id, "zone_id": 1, "name": "Couch"},
        blocking=True,
    )
    await hass.async_block_till_done()

    # The rename did write the registry, and that write is not a second change.
    assert entity_registry.async_get(presence_id).name == "Zone 1 presence - Couch"
    assert signals == [device_id, device_id]
    assert resolved == []
