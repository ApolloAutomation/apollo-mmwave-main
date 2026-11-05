"""
Strings the Python backend and the TypeScript frontend must spell alike.

Each check is a literal search in a file read relative to the repo root, so a
rename on either side fails here instead of silently breaking detection or the
dashboard. The bundles in www/ are what Home Assistant serves, and CI keeps them
in sync with a fresh build, so the element names are checked there.

The zone map's websocket answers are checked against the interfaces api.ts
declares for them. Both suites read the movement example in
frontend-src/test/fixtures: here the backend has to answer its columns for its
records, and test/zone-map-history.test.ts has to decode them back.
"""

from __future__ import annotations

import base64
import json
import re
import struct
from datetime import UTC, datetime
from itertools import accumulate
from pathlib import Path
from typing import Any

import pytest

from custom_components.apollo_mmwave import (
    binary_sensor,
    ld2450,
    movement,
    target_units,
    targets,
    websocket,
)
from custom_components.apollo_mmwave.const import (
    CARD_TYPE,
    DASHBOARD_STRATEGY_TYPE,
    DATA_MOVEMENT,
    DOMAIN,
    FRONTEND_DIR,
    HOLD_S_MAX,
    SENSOR_UNIT_FACTORS,
    STORE_HOLD_S,
    STORE_MOVEMENT_HISTORY,
    STORE_ZONE_TYPE,
    STORE_ZONES,
    ZONE_TYPE_IGNORE,
    ZONE_TYPES,
)

from .conftest import MOVEMENT_EXAMPLE

REPO_ROOT = Path(__file__).parents[1]
FRONTEND_SRC = REPO_ROOT / "frontend-src" / "src"
WWW = REPO_ROOT / "custom_components" / DOMAIN / FRONTEND_DIR
API_TS = FRONTEND_SRC / "zone-map" / "api.ts"
TRAILS_TS = FRONTEND_SRC / "zone-map" / "trails.ts"
COPY_TS = FRONTEND_SRC / "zone-map" / "copy.ts"
MOVEMENT_FIXTURE = (
    REPO_ROOT / "frontend-src" / "test" / "fixtures" / "movement-example.json"
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _has_string_literal(source: str, value: str) -> bool:
    """Report whether `value` appears as a whole quoted JS string literal."""
    return f'"{value}"' in source or f"'{value}'" in source


def _interface_fields(source: str, name: str) -> set[str]:
    """Return the field names an exported TypeScript interface declares."""
    body = re.search(
        rf"^export interface {name} \{{\n(.*?)^\}}$", source, re.MULTILINE | re.DOTALL
    )
    assert body is not None
    # Fields sit two spaces in; doc comment lines start with a slash or a star.
    return set(re.findall(r"^  (\w+)\??: ", body[1], re.MULTILINE))


def _movement_example() -> dict[str, Any]:
    return json.loads(_read(MOVEMENT_FIXTURE))


def test_ld2450_target_regexes_match_the_frontend() -> None:
    """ld2450.ts detects LD2450 targets with the same patterns as ld2450.py."""
    source = _read(FRONTEND_SRC / "ld2450.ts")

    assert f"const TARGET_X = /{ld2450.TARGET_X.pattern}/;" in source
    assert f"const TARGET_Y = /{ld2450.TARGET_Y.pattern}/;" in source


def test_dashboard_strategy_element_matches_the_strategy_type() -> None:
    """The tuning bundle registers the element HA loads for the dashboard strategy."""
    # HA resolves strategy type `custom:<name>` to the element
    # `ll-strategy-dashboard-<name>`.
    name = DASHBOARD_STRATEGY_TYPE.removeprefix("custom:")
    assert name != DASHBOARD_STRATEGY_TYPE

    bundle = _read(WWW / "apollo-radar-tuning.js")

    assert _has_string_literal(bundle, f"ll-strategy-dashboard-{name}")


def test_zone_map_card_element_matches_card_type() -> None:
    """The zone map bundle registers the element CARD_TYPE names."""
    # HA resolves card type `custom:<name>` to the custom element `<name>`.
    tag = CARD_TYPE.removeprefix("custom:")
    assert tag != CARD_TYPE

    bundle = _read(WWW / "apollo-radar-zone-map-card.js")

    assert _has_string_literal(bundle, tag)


def test_zone_map_editor_card_type_matches_card_type() -> None:
    """The card editor writes the same card type the backend names."""
    source = _read(FRONTEND_SRC / "zone-map" / "editor.ts")

    assert f'export const ZONE_MAP_CARD_TYPE = "{CARD_TYPE}";' in source


def test_sensor_unit_factors_match_the_zone_card() -> None:
    """The card draws each target with the factor presence tests it with."""
    # Both sides multiply a reading by its unit's factor, so equal tables mean
    # the dot on the card and the zone's presence sensor never disagree about
    # a reading, not even at a zone's edge.
    source = _read(FRONTEND_SRC / "zone-map" / "card.ts")
    table = re.search(
        r"^const SENSOR_LENGTH_UNITS = Object\.freeze\(\{\n(.*?)^\}\);$",
        source,
        re.MULTILINE | re.DOTALL,
    )
    assert table is not None

    entries = re.findall(r"^  (\w+): ([\d.]+),$", table[1], re.MULTILINE)
    assert len(entries) == len(table[1].splitlines())
    assert {unit: float(factor) for unit, factor in entries} == SENSOR_UNIT_FACTORS


@pytest.mark.parametrize(
    ("name", "command"),
    [
        ("ZONES_GET", websocket.TYPE_GET),
        ("ZONES_SUBSCRIBE", websocket.TYPE_SUBSCRIBE),
        ("MOVEMENT_GET", websocket.TYPE_MOVEMENT_GET),
        ("MOVEMENT_CLEAR", websocket.TYPE_MOVEMENT_CLEAR),
    ],
)
def test_zone_map_commands_match_the_backend(name: str, command: str) -> None:
    """api.ts sends the zone and movement commands under the names registered here."""
    source = _read(API_TS)
    path = command.removeprefix(f"{DOMAIN}/")
    assert path != command

    assert f'export const DOMAIN = "{DOMAIN}";' in source
    assert f"export const {name} = `${{DOMAIN}}/{path}`;" in source


async def test_zones_payload_keys_are_the_fields_api_ts_declares(
    hass, hass_ws_client, init_integration, device_id
) -> None:
    """ZoneConfig and ZoneDef declare every key zones/get sends, and no other."""
    _ = init_integration
    # A zone with a name and a hold and an ignore zone: between them they carry
    # every key a zone can have. The radar's flags are always sent.
    rect = {"shape": "rect", "data": {"x_min": 0, "x_max": 10, "y_min": 0, "y_max": 10}}
    for call in (
        {"zone_id": 1, **rect, "name": "Couch", STORE_HOLD_S: 60},
        {"zone_id": 2, **rect, STORE_ZONE_TYPE: ZONE_TYPE_IGNORE},
    ):
        await hass.services.async_call(
            DOMAIN, "update_zone", {"device_id": device_id, **call}, blocking=True
        )
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": websocket.TYPE_GET, "device_id": device_id})
    result = (await client.receive_json())["result"]
    source = _read(API_TS)

    assert set(result) == _interface_fields(source, "ZoneConfig")
    zone_keys = {key for zone in result[STORE_ZONES].values() for key in zone}
    assert zone_keys == _interface_fields(source, "ZoneDef")


@pytest.fixture
def example_now(freezer) -> None:
    """Freeze time an hour after the movement example's first record."""
    # A fixture, so the websocket client's access token is issued at this time
    # too; one issued later than now is refused. A day's answer holds the whole
    # example.
    freezer.move_to(datetime(2026, 1, 1, 1, tzinfo=UTC))


async def test_movement_answer_is_what_api_ts_declares(
    hass, example_now, hass_ws_client, init_integration, device_id
) -> None:
    """movement/get answers the shared example's columns under MovementPayload keys."""
    _ = (example_now, init_integration)
    example = _movement_example()
    columns, values = example["columns"], example["values"]
    await hass.services.async_call(
        DOMAIN,
        "update_zone",
        {"device_id": device_id, STORE_MOVEMENT_HISTORY: True},
        blocking=True,
    )
    await hass.async_block_till_done()
    history = hass.data[DOMAIN][DATA_MOVEMENT]
    times = accumulate(values["dt"][1:], initial=columns["t0"])
    for record in zip(times, values["s"], values["x"], values["y"], strict=True):
        history._record(device_id, *record)  # noqa: SLF001 - the example's records
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": websocket.TYPE_MOVEMENT_GET, "device_id": device_id}
    )
    result = (await client.receive_json())["result"]

    assert set(result) == _interface_fields(_read(API_TS), "MovementPayload")
    assert {key: result[key] for key in columns} == columns


def test_movement_example_columns_hold_its_numbers() -> None:
    """The shared example's columns are little-endian base64 of the numbers it lists."""
    example = _movement_example()
    columns, values = example["columns"], example["values"]

    for key, code in (("dt", "I"), ("s", "h"), ("x", "h"), ("y", "h")):
        packed = base64.b64decode(columns[key], validate=True)
        assert list(struct.unpack(f"<{columns['n']}{code}", packed)) == values[key]
    # The backend's own tests pack and read the same example.
    assert columns == MOVEMENT_EXAMPLE


def test_hold_options_are_hold_times_update_zone_takes() -> None:
    """Every time the card's Hold select offers is a hold_s update_zone accepts."""
    source = _read(COPY_TS)
    options = re.search(
        r"^export const HOLD_OPTIONS = \[([\d, ]+)\];$", source, re.MULTILINE
    )
    assert options is not None

    seconds = [int(value) for value in options[1].split(", ")]
    assert seconds
    assert all(0 <= value <= HOLD_S_MAX for value in seconds)


def test_zone_types_match_the_frontend() -> None:
    """The card reads and offers the zone types update_zone takes."""
    union = " | ".join(f'"{zone_type}"' for zone_type in ZONE_TYPES)
    assert f"export type ZoneType = {union};" in _read(API_TS)

    options = re.search(
        r"^export const TYPE_OPTIONS = \[(.*)\];$", _read(COPY_TS), re.MULTILINE
    )
    assert options is not None
    assert tuple(re.findall(r'value: "(\w+)"', options[1])) == ZONE_TYPES


def test_presence_the_recorder_and_the_trails_pair_x_and_y_alike() -> None:
    """One wait for a target's other axis: presence, the recorder and the card."""
    # The card's trails and Coverage pair by TRAIL_PAIR_MS.
    window = re.search(
        r"^export const TRAIL_PAIR_MS = (\d+);$", _read(TRAILS_TS), re.MULTILINE
    )
    assert window is not None
    assert int(window[1]) == targets.TARGET_PAIR_MS

    # Presence and the recorder both pair by targets.AxisPairing, which waits
    # TARGET_PAIR_MS, and neither keeps a window of its own.
    split = targets.AxisPairing()
    split.follow((0.0, 1000.0), (100.0, 1000.0), 0)
    assert not split.whole(targets.TARGET_PAIR_MS - 1)
    assert split.whole(targets.TARGET_PAIR_MS)
    assert isinstance(movement._SlotState().split, targets.AxisPairing)  # noqa: SLF001
    assert binary_sensor.ReadingPairer is targets.ReadingPairer
    for module in (binary_sensor, movement):
        assert not [
            name
            for name, value in vars(module).items()
            if name.endswith("_PAIR_MS") and value is not targets.TARGET_PAIR_MS
        ]


def test_the_radar_setup_card_asks_for_target_units_as_registered() -> None:
    """setup-checks.ts sends the units commands, and says units, as the backend."""
    source = _read(FRONTEND_SRC / "cards" / "setup-checks.ts")
    for name, command in (
        ("TARGET_UNITS_GET", websocket.TYPE_TARGET_UNITS_GET),
        ("TARGET_UNITS_SET", websocket.TYPE_TARGET_UNITS_SET),
    ):
        assert f'export const {name} = "{command}";' in source

    words = re.search(
        r"^export const UNIT_WORDS: .*? = Object\.freeze\(\{\n(.*?)^\}\);$",
        source,
        re.MULTILINE | re.DOTALL,
    )
    assert words is not None
    entries = re.findall(r'^  (\w+): "([\w ]+)",$', words[1], re.MULTILINE)
    assert len(entries) == len(words[1].splitlines())
    assert dict(entries) == target_units.UNIT_WORDS
    # Every length unit but mm, which the note never names.
    assert set(target_units.UNIT_WORDS) == set(SENSOR_UNIT_FACTORS) - {"mm"}
