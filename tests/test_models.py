"""
Which radars a device carries: its listed model first, else its entities.

The cases in entity-radars-cases.json are shared with the card's
``apolloDeviceInfo`` (frontend-src/test/entity-radars.test.ts).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.components.diagnostics import (
    get_diagnostics_for_config_entry,
)

from custom_components.apollo_mmwave.config_flow import MMWAVE_MODELS
from custom_components.apollo_mmwave.const import DOMAIN
from custom_components.apollo_mmwave.models import (
    MODEL_RADARS,
    device_radars,
    entity_radars,
)

from .conftest import make_entry, setup_integration

CASES = json.loads(
    (
        Path(__file__).parents[1]
        / "frontend-src"
        / "test"
        / "fixtures"
        / "entity-radars-cases.json"
    ).read_text(encoding="utf-8")
)["cases"]


def _device(hass, case: dict[str, Any], name: str = "Den Radar") -> dr.DeviceEntry:
    """Register an ESPHome device and its entities, as a case gives them."""
    esphome_entry = MockConfigEntry(domain="esphome", title=name)
    esphome_entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", f"{name}-{case['model']}")},
        name=name,
        manufacturer=case["manufacturer"],
        model=case["model"],
    )
    for platform, ids in (
        ("esphome", case["entities"]),
        (DOMAIN, case.get("own_entities", [])),
    ):
        for entity_id in ids:
            domain, _, object_id = entity_id.partition(".")
            er.async_get(hass).async_get_or_create(
                domain,
                platform,
                f"uid_{entity_id}",
                device_id=device.id,
                suggested_object_id=object_id,
            )
    return device


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
async def test_device_radars_reads_each_case(hass, case: dict[str, Any]) -> None:
    """The same answer the card's apolloDeviceInfo gives."""
    device = _device(hass, case)
    assert device_radars(hass, device) == case["expect"]["radars"]


async def test_disabled_entities_still_count(hass, entity_registry) -> None:
    """A radar whose target sensors are disabled is still that radar."""
    device = _device(
        hass,
        {
            "manufacturer": "ApolloAutomation",
            "model": "XR-7",
            "entities": ["sensor.den_radar_ld2460_target_1_x"],
        },
    )
    entity_registry.async_update_entity(
        "sensor.den_radar_ld2460_target_1_x",
        disabled_by=er.RegistryEntryDisabler.USER,
    )
    assert entity_radars(hass, device.id) == ["ld2460"]


def test_device_radars_of_no_device_is_none(hass) -> None:
    """A device that left the registry has no radars."""
    assert device_radars(hass, None) is None


def test_known_model_tables_are_unchanged() -> None:
    """Listed models keep their exact radars and picker entries."""
    assert MODEL_RADARS == (
        ("msr-1", ("ld2410",)),
        ("msr-2", ("ld2410",)),
        ("mtr-1", ("ld2450",)),
        ("r-pro-1", ("ld2412", "ld2450")),
    )
    assert MMWAVE_MODELS == (
        "MSR-1",
        "MSR-1_BLE",
        "MSR-1_Factory",
        "MSR-2",
        "MSR-2_BLE",
        "MSR-2_Factory",
        "MTR-1",
        "R-PRO-1-W",
        "R-PRO-1-ETH",
    )


async def test_an_unlisted_apollo_radar_gets_a_support_section(
    hass, hass_client
) -> None:
    """Found by its entities, with the radars they show as expected."""
    ceiling = next(
        case for case in CASES if case["expect"]["radars"] == ["ld2412", "ld2460"]
    )
    radar = _device(hass, ceiling, name="Ceiling Radar")
    air = _device(
        hass,
        {
            "manufacturer": "ApolloAutomation",
            "model": "AIR-1",
            "entities": ["sensor.air_temperature", "button.air_esp_reboot"],
        },
        name="Air",
    )
    entry = make_entry()
    await setup_integration(hass, entry)

    result = await get_diagnostics_for_config_entry(hass, hass_client, entry)

    sections = {item["device_id"]: item for item in result["devices"]}
    assert radar.id in sections
    assert sections[radar.id]["radars"]["expected"] == ["ld2412", "ld2460"]
    assert air.id not in sections
