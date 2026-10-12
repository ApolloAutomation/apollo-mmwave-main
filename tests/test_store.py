"""Zone store: device-id keying and the v1 (display name) migration."""

from __future__ import annotations

import copy
import logging
from typing import TYPE_CHECKING

from homeassistant.config_entries import ConfigEntryState
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
)

from custom_components.apollo_mmwave.binary_sensor import ZonePresenceBinarySensor
from custom_components.apollo_mmwave.const import (
    DATA_STORE,
    DOMAIN,
    SERVICE_UPDATE_ZONE,
    STORE_ZONES,
)
from custom_components.apollo_mmwave.sensor import ZoneCoordsSensor
from custom_components.apollo_mmwave.store import STORAGE_KEY as ZONE_STORAGE_KEY
from custom_components.apollo_mmwave.store import ZoneStore

from .conftest import CALIBRATION_STORAGE_KEY, radar_ids, setup_integration

if TYPE_CHECKING:
    from homeassistant.helpers.device_registry import DeviceEntry

TARGET_X = "sensor.apollo_r_pro_1_abc123_ld2450_target_1_x"
TARGET_Y = "sensor.apollo_r_pro_1_abc123_ld2450_target_1_y"


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


async def test_load_v1_migrates_location_keys_to_device_ids(
    hass, hass_storage, device_registry, entity_registry
) -> None:
    """A v1 store keyed by display name is rekeyed to the device id."""
    # The device registry refuses to link a device to a config entry that does
    # not exist, so the radar's owning entry has to be real.
    esphome_entry = MockConfigEntry(domain="esphome", title="R_PRO-1")
    esphome_entry.add_to_hass(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=esphome_entry.entry_id,
        identifiers={("esphome", "r-pro-1-abc")},
        name="Apollo R_PRO-1 abc123",
    )
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "x1",
        device_id=device.id,
        suggested_object_id="apollo_r_pro_1_abc123_ld2450_target_1_x",
    )
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                "Apollo R_PRO-1 abc123": {
                    "zones": {
                        "1": {
                            "shape": "rect",
                            "data": {
                                "x_min": 0,
                                "x_max": 10,
                                "y_min": 0,
                                "y_max": 10,
                            },
                        }
                    },
                    "entities": [
                        {
                            "x": "sensor.apollo_r_pro_1_abc123_ld2450_target_1_x",
                            "y": "sensor.apollo_r_pro_1_abc123_ld2450_target_1_y",
                        }
                    ],
                    "rotation_deg": 15,
                }
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert list(store.devices) == [device.id]
    entry = store.devices[device.id]
    assert entry["zones"][1]["shape"] == "rect"
    assert entry["rotation_deg"] == 15
    assert entry["label"] == "Apollo R_PRO-1 abc123"


async def test_load_v1_unresolvable_location_is_kept_as_orphan(
    hass, hass_storage, caplog
) -> None:
    """A location matching no device is preserved, not silently dropped."""
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                "Ghost Room": {
                    "zones": {"2": {"shape": "none", "data": None}},
                    "entities": [],
                }
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert store.devices == {}
    assert store.orphans["Ghost Room"]["zones"][2]["shape"] == "none"
    assert "Ghost Room" in caplog.text
    assert any(
        record.levelname == "WARNING" and "Ghost Room" in record.message
        for record in caplog.records
    )


async def test_v1_resolves_by_tracked_entity_when_name_does_not_match(
    hass, hass_storage, device_registry, entity_registry
) -> None:
    """The tracked entity pair alone is enough: the location key is ignored."""
    device = _make_radar(hass, device_registry, "Apollo R_PRO-1 abc123")
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "x1",
        device_id=device.id,
        suggested_object_id="apollo_r_pro_1_abc123_ld2450_target_1_x",
    )
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                # Nothing about "Old Name" slugifies to the device's name, so
                # only the entity-registry branch can resolve this.
                "Old Name": {
                    "zones": {"1": {"shape": "rect", "data": {}}},
                    "entities": [{"x": TARGET_X, "y": TARGET_Y}],
                }
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert list(store.devices) == [device.id]
    assert store.devices[device.id]["label"] == "Old Name"
    assert store.orphans == {}


async def test_v1_resolves_by_device_name_when_no_entities(
    hass, hass_storage, device_registry
) -> None:
    """With no entities to follow, the slugified device name resolves it."""
    device = _make_radar(hass, device_registry, "Apollo R_PRO-1 abc123")
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                "apollo r_pro-1 abc123": {
                    "zones": {"1": {"shape": "rect", "data": {}}},
                    "entities": [],
                }
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert list(store.devices) == [device.id]
    assert store.devices[device.id]["zones"][1]["shape"] == "rect"


async def test_v1_locations_colliding_on_one_device_are_merged(
    hass, hass_storage, device_registry, entity_registry, caplog
) -> None:
    """A mid-life rename leaves two locations on one device; keep both zones."""
    device = _make_radar(hass, device_registry, "Apollo R_PRO-1 abc123")
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "x1",
        device_id=device.id,
        suggested_object_id="apollo_r_pro_1_abc123_ld2450_target_1_x",
    )
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                "Kitchen": {
                    "zones": {
                        "1": {"shape": "rect", "data": {}},
                        "2": {"shape": "rect", "data": {}},
                    },
                    "entities": [{"x": TARGET_X, "y": TARGET_Y}],
                    "rotation_deg": 15,
                },
                "Apollo R_PRO-1 abc123": {
                    "zones": {
                        "2": {"shape": "ellipse", "data": {}},
                        "3": {"shape": "polygon", "data": {}},
                    },
                    "entities": [],
                    "rotation_deg": 90,
                },
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    entry = store.devices[device.id]
    assert sorted(entry["zones"]) == [1, 2, 3]
    # First writer wins on a conflicting zone id, and on the scalars.
    assert entry["zones"][2]["shape"] == "rect"
    assert entry["zones"][3]["shape"] == "polygon"
    assert entry["entities"] == [{"x": TARGET_X, "y": TARGET_Y}]
    assert entry["rotation_deg"] == 15
    assert entry["label"] == "Kitchen"

    conflict = [
        record.message
        for record in caplog.records
        if record.levelname == "WARNING" and "Kitchen" in record.message
    ]
    assert conflict, "expected a warning about the conflicting zone id"
    assert "Apollo R_PRO-1 abc123" in conflict[0]
    assert "2" in conflict[0]


def _v1_payload(*locations: tuple[str, dict]) -> dict:
    """Build a v1 zone file from (location, entry) pairs, in that order."""
    return {"version": 1, "data": {"locations": dict(locations)}}


def _collision_warnings(caplog) -> list[str]:
    return [
        record.message
        for record in caplog.records
        if record.levelname == "WARNING" and "is defined by both" in record.message
    ]


async def test_v1_placeholder_zone_is_replaced_by_real_definition(
    hass, hass_storage, device_registry, entity_registry, caplog
) -> None:
    """An empty placeholder is a gap, so a later real zone fills it silently."""
    device = _make_radar(hass, device_registry, "Apollo R_PRO-1 abc123")
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "x1",
        device_id=device.id,
        suggested_object_id="apollo_r_pro_1_abc123_ld2450_target_1_x",
    )
    hass_storage["apollo_mmwave.zones"] = _v1_payload(
        (
            "Kitchen",
            {
                "zones": {"2": {}, "3": {}},
                "entities": [{"x": TARGET_X, "y": TARGET_Y}],
            },
        ),
        (
            "Apollo R_PRO-1 abc123",
            {"zones": {"2": {"shape": "rect", "data": {}}}, "entities": []},
        ),
    )

    store = ZoneStore(hass)
    assert await store.async_load() is True

    entry = store.devices[device.id]
    assert entry["zones"][2]["shape"] == "rect"
    # A placeholder nobody else defines is still kept as one.
    assert entry["zones"][3] == {}
    # Scalars stay first writer.
    assert entry["entities"] == [{"x": TARGET_X, "y": TARGET_Y}]
    assert entry["label"] == "Kitchen"
    assert _collision_warnings(caplog) == []


async def test_v1_real_zone_is_kept_over_a_later_placeholder(
    hass, hass_storage, device_registry, entity_registry, caplog
) -> None:
    """A placeholder arriving second is not a conflict and logs nothing."""
    device = _make_radar(hass, device_registry, "Apollo R_PRO-1 abc123")
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "x1",
        device_id=device.id,
        suggested_object_id="apollo_r_pro_1_abc123_ld2450_target_1_x",
    )
    hass_storage["apollo_mmwave.zones"] = _v1_payload(
        (
            "Apollo R_PRO-1 abc123",
            {"zones": {"2": {"shape": "rect", "data": {}}}, "entities": []},
        ),
        (
            "Kitchen",
            {
                "zones": {"2": {}},
                "entities": [{"x": TARGET_X, "y": TARGET_Y}],
            },
        ),
    )

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert store.devices[device.id]["zones"][2]["shape"] == "rect"
    assert _collision_warnings(caplog) == []


async def test_v1_empty_entities_list_becomes_absent(
    hass, hass_storage, device_registry
) -> None:
    """v1 seeded `entities: []` everywhere, so it cannot mean "cleared"."""
    # Migrating it as an explicit empty would switch off the LD2450 fallback for
    # every existing user and leave their presence sensors dead.
    device = _make_radar(hass, device_registry, "Apollo R_PRO-1 abc123")
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                "Apollo R_PRO-1 abc123": {
                    "zones": {"1": {"shape": "rect", "data": {}}},
                    "entities": [],
                }
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert "entities" not in store.devices[device.id]


async def test_v1_non_empty_entities_carry_over(
    hass, hass_storage, device_registry, entity_registry
) -> None:
    """A hand-picked v1 pair list is a real choice and has to survive."""
    device = _make_radar(hass, device_registry, "Apollo R_PRO-1 abc123")
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "x1",
        device_id=device.id,
        suggested_object_id="apollo_r_pro_1_abc123_ld2450_target_1_x",
    )
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                "Apollo R_PRO-1 abc123": {
                    "zones": {"1": {"shape": "rect", "data": {}}},
                    "entities": [{"x": TARGET_X, "y": TARGET_Y}],
                }
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert store.devices[device.id]["entities"] == [{"x": TARGET_X, "y": TARGET_Y}]


async def test_explicit_empty_entities_survive_a_round_trip(
    hass, hass_storage, device_registry
) -> None:
    """A cleared list only stays cleared if it reloads empty, not absent."""
    device = _make_radar(hass, device_registry, "Apollo R_PRO-1 abc123")
    store = ZoneStore(hass)
    store.devices[device.id] = {"zones": {}, "entities": []}
    await store.async_save()

    reloaded = ZoneStore(hass)
    assert await reloaded.async_load() is True

    assert reloaded.devices[device.id]["entities"] == []


async def test_input_units_survive_a_round_trip(hass, hass_storage) -> None:
    """The unit the presence sensor scales by has to come back after a restart."""
    store = ZoneStore(hass)
    store.devices["dev"] = {"zones": {}, "input_units": "cm"}
    await store.async_save()
    on_disk = hass_storage[ZONE_STORAGE_KEY]["data"]["devices"]["dev"]
    assert on_disk["input_units"] == "cm"

    reloaded = ZoneStore(hass)
    assert await reloaded.async_load() is True

    assert reloaded.devices["dev"]["input_units"] == "cm"


async def test_unknown_input_units_on_disk_are_dropped(hass, hass_storage) -> None:
    """Only a unit the service accepts is restored; anything else reads as mm."""
    hass_storage[ZONE_STORAGE_KEY] = {
        "version": 2,
        "data": {
            "devices": {
                "number": {"zones": {}, "input_units": 5},
                "furlong": {"zones": {}, "input_units": "furlong"},
                "feet": {"zones": {}, "input_units": "ft"},
                "none": {"zones": {}},
            },
            "orphans": {"Ghost Room": {"zones": {}, "input_units": "in"}},
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert "input_units" not in store.devices["number"]
    assert "input_units" not in store.devices["furlong"]
    assert "input_units" not in store.devices["none"]
    assert store.devices["feet"]["input_units"] == "ft"
    assert store.orphans["Ghost Room"]["input_units"] == "in"


async def test_only_string_aliases_on_disk_are_kept(hass, hass_storage) -> None:
    """Merged v1 names come back; anything that is not a name is dropped."""
    hass_storage[ZONE_STORAGE_KEY] = {
        "version": 2,
        "data": {
            "devices": {
                "mixed": {"zones": {}, "label": "Kitchen", "aliases": ["Den", 5, None]},
                "scalar": {"zones": {}, "label": "Kitchen", "aliases": "Den"},
                "nothing_left": {"zones": {}, "label": "Kitchen", "aliases": [7]},
            },
            "orphans": {},
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert store.devices["mixed"]["aliases"] == ["Den"]
    assert "aliases" not in store.devices["scalar"]
    assert "aliases" not in store.devices["nothing_left"]


async def test_a_new_device_entry_has_no_entities_key(hass) -> None:
    """A device nobody has configured must read as unconfigured, not cleared."""
    store = ZoneStore(hass)

    assert "entities" not in store.device("some_device_id")


def _store_with_one_zone(hass) -> ZoneStore:
    store = ZoneStore(hass)
    store.device("stored")[STORE_ZONES][1] = {"shape": "rect", "data": {}}
    return store


async def test_reading_a_zone_does_not_create_the_device(hass) -> None:
    """Asking for a zone is a read, so an unknown device stays unknown."""
    store = _store_with_one_zone(hass)
    before = copy.deepcopy(store._data_to_save())  # noqa: SLF001

    assert store.zone("ghost", 1) is None
    assert store.zone("stored", 2) is None
    assert store.zone("stored", 1) == {"shape": "rect", "data": {}}

    assert "ghost" not in store.devices
    assert store._data_to_save() == before  # noqa: SLF001


async def test_zone_entities_reading_an_unknown_device_store_nothing(hass) -> None:
    """Evaluating presence or publishing geometry never mints a device entry."""
    store = _store_with_one_zone(hass)
    before = copy.deepcopy(store._data_to_save())  # noqa: SLF001
    presence = ZonePresenceBinarySensor(hass, store, "ghost", 1)
    presence.hass = hass
    geometry = ZoneCoordsSensor(hass, store, "ghost", 1)
    geometry.hass = hass

    assert presence._evaluate_presence() is False  # noqa: SLF001
    assert geometry.extra_state_attributes == {
        "shape": None,
        "data": None,
        "entities": [],
    }

    assert "ghost" not in store.devices
    assert store._data_to_save() == before  # noqa: SLF001


async def test_v1_merge_keeps_an_explicit_zero_rotation(
    hass, hass_storage, device_registry, entity_registry
) -> None:
    """0 degrees is a configured value, not an absent one, so it still wins."""
    device = _make_radar(hass, device_registry, "Apollo R_PRO-1 abc123")
    entity_registry.async_get_or_create(
        "sensor",
        "esphome",
        "x1",
        device_id=device.id,
        suggested_object_id="apollo_r_pro_1_abc123_ld2450_target_1_x",
    )
    hass_storage["apollo_mmwave.zones"] = {
        "version": 1,
        "data": {
            "locations": {
                "Kitchen": {
                    "zones": {"1": {"shape": "rect", "data": {}}},
                    "entities": [{"x": TARGET_X, "y": TARGET_Y}],
                    "rotation_deg": 0,
                },
                "Apollo R_PRO-1 abc123": {
                    "zones": {"2": {"shape": "rect", "data": {}}},
                    "entities": [],
                    "rotation_deg": 90,
                },
            }
        },
    }

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert store.devices[device.id]["rotation_deg"] == 0


async def test_calibration_file_is_separate_from_zone_store(
    hass, hass_storage, calibration_rig, ld2410_device, device_id
) -> None:
    """A calibration writes its own file and leaves the zone file byte-identical."""
    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_ZONE,
        {
            "device_id": device_id,
            "zone_id": 1,
            "shape": "rect",
            "data": {"x_min": 0, "x_max": 10, "y_min": 0, "y_max": 10},
        },
        blocking=True,
    )
    async_fire_time_changed(hass, fire_all=True)
    await hass.async_block_till_done()
    zone_file = copy.deepcopy(hass_storage[ZONE_STORAGE_KEY])
    assert CALIBRATION_STORAGE_KEY not in hass_storage

    result = await calibration_rig.run(radar_ids(ld2410_device), move=60, still=60)
    async_fire_time_changed(hass, fire_all=True)
    await hass.async_block_till_done()

    assert result["outcome"] == "applied"
    assert hass_storage[ZONE_STORAGE_KEY] == zone_file
    calibration_file = hass_storage[CALIBRATION_STORAGE_KEY]["data"]
    snapshots = calibration_file["devices"][ld2410_device.id]["snapshots"]
    assert [snapshot["id"] for snapshot in snapshots] == [result["snapshot_id"]]
    assert "zones" not in calibration_file
    assert "devices" in hass_storage[ZONE_STORAGE_KEY]["data"]


def _malformed_file(version: int, data: object) -> dict:
    """Build a syntactically valid zone file whose payload has the wrong shape."""
    return {
        "version": version,
        "minor_version": 1,
        "key": ZONE_STORAGE_KEY,
        "data": data,
    }


async def _assert_setup_survives(hass, config_entry, caplog) -> ZoneStore:
    """Set the entry up and check it logged an error but no traceback."""
    await setup_integration(hass, config_entry)

    assert config_entry.state is ConfigEntryState.LOADED
    assert any(
        record.levelno == logging.ERROR and "zone store" in record.getMessage()
        for record in caplog.records
    )
    assert not any(record.exc_info for record in caplog.records)
    assert "Error setting up entry" not in caplog.text
    return hass.data[DOMAIN][DATA_STORE]


async def test_v1_null_data_loads_empty(
    hass, hass_storage, config_entry, caplog
) -> None:
    """A v1 file with `data: null` starts empty instead of failing setup."""
    hass_storage[ZONE_STORAGE_KEY] = _malformed_file(1, None)

    store = await _assert_setup_survives(hass, config_entry, caplog)

    assert store.devices == {}
    assert store.orphans == {}


async def test_v1_list_data_loads_empty(
    hass, hass_storage, config_entry, caplog
) -> None:
    """A v1 file whose payload is a list starts empty instead of failing setup."""
    hass_storage[ZONE_STORAGE_KEY] = _malformed_file(1, [])

    store = await _assert_setup_survives(hass, config_entry, caplog)

    assert store.devices == {}
    assert store.orphans == {}


async def test_v1_list_locations_loads_empty(hass, hass_storage) -> None:
    """A non-empty `locations` list has no names to rekey, so nothing migrates."""
    hass_storage[ZONE_STORAGE_KEY] = _malformed_file(1, {"locations": [1]})

    store = ZoneStore(hass)
    assert await store.async_load() is True

    assert store.devices == {}
    assert store.orphans == {}


async def test_v2_list_data_is_reported_and_ignored(
    hass, hass_storage, config_entry, caplog
) -> None:
    """A v2 list payload is treated like a missing file and saved over."""
    hass_storage[ZONE_STORAGE_KEY] = _malformed_file(2, [])

    store = await _assert_setup_survives(hass, config_entry, caplog)

    assert store.devices == {}
    assert any("list" in record.getMessage() for record in caplog.records)
    assert hass_storage[ZONE_STORAGE_KEY]["data"] == {"devices": {}, "orphans": {}}
