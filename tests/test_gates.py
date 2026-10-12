"""Gate-radar entity discovery from the entity registry."""

from __future__ import annotations

from homeassistant.helpers.entity_registry import RegistryEntryDisabler

from custom_components.apollo_mmwave.calibration_math import Bounds
from custom_components.apollo_mmwave.gates import (
    is_offline,
    number_bounds,
    numeric_state,
    resolve_gate_entities,
)

from .conftest import (
    LD2410_BASE,
    LD2410_GATES,
    LD2412_GATES,
    EntityBuilder,
    radar_ids,
)


async def test_resolve_gate_entities_ld2410_naming(hass, ld2410_device) -> None:
    """The MSR-2 naming resolves nine gates and the LD2410 scalars."""
    ids = radar_ids(ld2410_device)

    entities = resolve_gate_entities(hass, ld2410_device.id)

    assert entities is not None
    assert entities.profile == "ld2410"
    for table in (
        entities.move_threshold,
        entities.still_threshold,
        entities.move_energy,
        entities.still_energy,
    ):
        assert sorted(table) == list(range(LD2410_GATES))
    assert entities.move_threshold[3] == ids.threshold(3, "move")
    assert entities.still_energy[8] == ids.energy(8, "still")
    assert entities.engineering_mode == ids.engineering
    assert entities.max_move_gate == ids.max_move
    assert entities.max_still_gate == ids.max_still
    assert entities.min_gate is None
    assert entities.max_gate is None
    assert entities.background_status is None
    assert entities.background_button is None
    # The MSR firmware spells it without the chip prefix the LD2412 uses.
    assert entities.query_params_button == ids.query_params
    assert ids.query_params == f"button.{LD2410_BASE}_query_params"
    assert entities.radar_target == ids.radar_target
    assert entities.moving_target == ids.moving_target
    assert entities.gate_count == LD2410_GATES


async def test_resolve_gate_entities_ld2412_naming(hass, ld2412_device) -> None:
    """The R-PRO-1 naming resolves fourteen zero-padded gates and the LD2412 scalars."""
    ids = radar_ids(ld2412_device)

    entities = resolve_gate_entities(hass, ld2412_device.id)

    assert entities is not None
    assert entities.profile == "ld2412"
    assert sorted(entities.move_threshold) == list(range(LD2412_GATES))
    assert entities.move_threshold[5] == ids.threshold(5, "move")
    assert entities.still_threshold[13] == ids.threshold(13, "still")
    assert entities.min_gate == ids.min_gate
    assert entities.max_gate == ids.max_gate
    assert entities.max_move_gate is None
    assert entities.max_still_gate is None
    assert entities.background_button == ids.bg_button
    assert entities.background_status == ids.bg_status
    assert entities.query_params_button == ids.query_params
    assert entities.radar_target == ids.radar_target
    assert entities.moving_target == ids.moving_target
    assert entities.engineering_mode == ids.engineering
    assert entities.gate_count == LD2412_GATES


async def test_resolve_gate_entities_skips_disabled_and_wrong_domain(
    hass, entity_registry, ld2410_device
) -> None:
    """A disabled gate leaves a hole, and a misnamed sensor is not a threshold."""
    ids = radar_ids(ld2410_device)
    entity_registry.async_update_entity(
        ids.energy(3, "still"), disabled_by=RegistryEntryDisabler.USER
    )
    builder = EntityBuilder(hass, entity_registry, ld2410_device.id)
    builder.add("sensor", f"{LD2410_BASE}_g1_move_threshold", "5")

    entities = resolve_gate_entities(hass, ld2410_device.id)

    assert entities is not None
    assert 3 not in entities.still_energy
    assert 3 in entities.move_energy
    assert 3 in entities.still_threshold
    assert entities.move_threshold[1] == ids.threshold(1, "move")


async def test_resolve_gate_entities_handles_dedup_suffix(
    hass, device_registry, entity_registry
) -> None:
    """Home Assistant's `_2` dedup suffix does not hide the gate digit."""
    from .conftest import _make_gate_radar  # noqa: PLC0415 - test-local helper

    device = _make_gate_radar(
        hass, device_registry, entity_registry, serial="dedup_radar", name="Dedup"
    )
    builder = EntityBuilder(hass, entity_registry, device.id)
    builder.add("number", "dedup_radar_g3_move_threshold_2", "10")
    builder.add("sensor", "dedup_radar_g3_move_energy_2", "unknown")
    builder.add("switch", "dedup_radar_radar_engineering_mode_2", "off")

    entities = resolve_gate_entities(hass, device.id)

    assert entities is not None
    assert entities.move_threshold == {3: "number.dedup_radar_g3_move_threshold_2"}
    assert entities.move_energy == {3: "sensor.dedup_radar_g3_move_energy_2"}
    assert entities.engineering_mode == "switch.dedup_radar_radar_engineering_mode_2"
    assert entities.gate_count == 4


async def test_resolve_gate_entities_returns_none_for_ld2450_only_device(
    hass, esphome_device
) -> None:
    """An MTR-1 style device has no gate slot at all."""
    assert resolve_gate_entities(hass, esphome_device.id) is None


async def test_number_bounds_fallbacks(hass) -> None:
    """Missing attributes fall back to 0..100 step 1; strings are coerced."""
    hass.states.async_set("number.bare", "5")
    hass.states.async_set("number.stepped", "5", {"min": "10", "max": 90, "step": "5"})

    assert number_bounds(hass, "number.bare") == Bounds(0, 100, 1)
    assert number_bounds(hass, "number.missing") == Bounds(0, 100, 1)
    assert number_bounds(hass, "number.stepped") == Bounds(10.0, 90.0, 5.0)


async def test_is_offline_for_missing_state_and_unavailable(hass) -> None:
    """No state object and `unavailable` are offline; `unknown` and `off` are not."""
    hass.states.async_set("switch.gone", "unavailable")
    hass.states.async_set("switch.unknown", "unknown")
    hass.states.async_set("switch.off", "off")

    assert is_offline(hass, "switch.never_seen")
    assert is_offline(hass, "switch.gone")
    assert not is_offline(hass, "switch.unknown")
    assert not is_offline(hass, "switch.off")


async def test_numeric_state_rejects_non_numbers(hass) -> None:
    """Only a finite number counts; everything else reads as None."""
    hass.states.async_set("number.ok", "35.0")
    hass.states.async_set("number.nan", "nan")
    hass.states.async_set("number.text", "unknown")

    assert numeric_state(hass, "number.ok") == 35.0
    assert numeric_state(hass, "number.nan") is None
    assert numeric_state(hass, "number.text") is None
    assert numeric_state(hass, "number.missing") is None
    assert numeric_state(hass, None) is None
