# Architecture

This document is for a maintainer new to the `apollo_mmwave` repository. It describes what the integration is, how the Python and TypeScript halves fit together, where data flows at runtime, and which values are tuning knobs. Line numbers refer to the tree this document was written against and drift as files change; function names are the stable reference.

## Overview

`apollo_mmwave` is a Home Assistant custom integration (installed through HACS, `hacs.json`) for Apollo Automation mmWave radars: MSR-1 and MSR-2 (LD2410 chip), R-PRO-1 (LD2412 plus LD2450) and MTR-1 (LD2450 only). It does not talk to hardware. The ESPHome integration already exposes the radar's sensors; this integration adds drawn occupancy zones on top of the LD2450 X/Y target sensors and a tuning dashboard for the gate radars.

It has two halves that ship as one HACS package:

- The Python backend in `custom_components/apollo_mmwave/`. It owns a config entry, a persisted zone store (`.storage/apollo_mmwave.zones`), the `apollo_mmwave.update_zone` service, one `sensor` and one `binary_sensor` entity per zone, two websocket commands, and the Lovelace resource and dashboard registration.
- The TypeScript/Lit frontend in `frontend-src/`. Vite compiles it into two self-contained ES module bundles that are committed under `custom_components/apollo_mmwave/www/` (`apollo-radar-tuning.js` and `apollo-radar-zone-map-card.js`, `const.py` `JS_BUNDLES`).

The backend serves the committed bundles itself at `/apollo_mmwave/<bundle>?v=<manifest version>` and registers them as Lovelace module resources and extra JS URLs (`frontend.py` `async_register_frontend_assets`). Users therefore install one repository and get the cards, the strategy and the backend together. The `www/` folder is a committed build output, not a scratch directory (`frontend-src/vite.config.ts`), and CI fails if it is stale (see Build, test and CI).

## Repository layout

```
custom_components/apollo_mmwave/   Python integration (domain apollo_mmwave)
  __init__.py        entry lifecycle, update_zone service, zone payload normalisation
  config_flow.py     single-instance config flow + options flow
  const.py           shared constants (store keys, shapes, units, URLs, names)
  store.py           ZoneStore: .storage/apollo_mmwave.zones, v1 -> v2 migration
  migration.py       legacy restore-state import, zone_mapper import, unique-id rewrite
  zone_entities.py   one-entity-per-zone platform scaffolding and retry tracker
  binary_sensor.py   ZonePresenceBinarySensor: point-in-zone evaluation
  sensor.py          ZoneCoordsSensor: publishes zone geometry as attributes
  ld2450.py          LD2450 X/Y target pair discovery and cache
  websocket.py       apollo_mmwave/zones/get and /subscribe
  frontend.py        static paths, Lovelace resources, auto-created dashboard
  services.yaml, translations/en.json, manifest.json
  www/               committed Vite output (two bundles)
frontend-src/                       TypeScript sources, tests and build config
  src/index.ts                      tuning bundle entry
  src/register.ts                   polyfill-safe customElements.define
  src/entities.ts, profiles.ts, ld2450.ts, types.ts   detection and profiles
  src/strategy.ts, strategy-core.ts, panels/          dashboard strategy
  src/cards/, src/charts/                              distance and gate-energy cards
  src/zone-map/card.ts, editor.ts, api.ts             zone map card
  test/                             vitest suite (happy-dom, canvas stub)
  vite.config.ts, vite.zone-map.config.ts, vitest.config.ts, tsconfig.json
tests/                              pytest suite (pytest-homeassistant-custom-component)
.github/workflows/                  lint.yml, test.yml, validate.yml
scripts/                            bootstrap, develop, help, lint, lint-check, motd, setup, update
config/configuration.yaml           dev HA config used by scripts/develop
hacs.json, pyproject.toml, requirements.txt, requirements-test.txt
```

## Runtime data flow

### Device entity to integration to storage to presence sensors

1. The ESPHome device exposes LD2450 target sensors named `sensor.<base>_ld2450_target_<n>_x` / `_y` (R-PRO-1) or `sensor.<base>_target_<n>_x` / `_y` (MTR-1). `resolve_target_pairs` (`ld2450.py`) scans the entity registry for one device, matches `TARGET_X` / `TARGET_Y` and returns `[{x, y}]` pairs sorted by target number, skipping disabled entities. `async_track_target_pairs` (`ld2450.py`) installs a per-device cache in `hass.data["apollo_mmwave"]["ld2450_pair_cache"]` and invalidates it on entity registry events, firing `SIGNAL_ZONES_UPDATED`. When setup runs before Home Assistant has finished starting, a one-shot `EVENT_HOMEASSISTANT_STARTED` listener invalidates every cached device and re-fires the signal for each, so pairs resolved before ESPHome registered its entities are resolved again.
2. At setup, zones can enter the store from the migration paths (`async_migrate_legacy`, `async_import_zone_mapper`, `_promote_resolvable_orphans` in `migration.py`, and the v1 to v2 rekey in `store.py`). After setup, zones enter the store only through the service. `handle_update_zone` (`__init__.py`) resolves the device via `_resolve_target_device`, refuses no-op calls in `_call_changes_something`, fetches `store.device(device_id)` (`store.py`), applies `rotation_deg` and `input_units` (`_apply_device_settings`), applies tracked pairs (`_apply_entity_pairs`), then either deletes, renames, or normalises geometry through `_normalize_zone_payload` into whole millimetres. Every mutating path ends in `_notify_zones_updated`, which schedules a debounced write (`ZoneStore.async_delay_save`, `SAVE_DELAY_SECONDS` in `store.py`), sends the dispatcher signal `SIGNAL_ZONES_UPDATED` with the device id, and fires the public bus event `apollo_mmwave_zone_updated`.
3. `async_setup_zone_platform` (`zone_entities.py`) runs `_sync_entities` once at platform setup and again on every `SIGNAL_ZONES_UPDATED`. It diffs `store.devices[*]["zones"]` against a `ZoneEntityTracker` and creates a `ZonePresenceBinarySensor` (`binary_sensor.py`) and a `ZoneCoordsSensor` (`sensor.py`) for each missing `(device_id, zone_id)`.
4. `ZonePresenceBinarySensor.async_added_to_hass` calls `_track_coordinate_entities`, which resolves pairs via `effective_target_pairs` (`ld2450.py`: the stored `entities` list if the key is present, else the cached auto-detected pairs) and subscribes `async_track_state_change_event` on every X/Y entity id. Each state change runs `_handle_coordinate_update` then `_evaluate_presence`: read the zone from `store.zone()`, pick a tester from `_SHAPE_TESTERS`, build a rotator from the device's `rotation_deg` (`_build_point_rotator`), and iterate `_iter_rotated_coordinates`. `_get_coordinate_pair` parses both states, drops `unknown`/`unavailable`, drops the exact `(0, 0)` idle-slot sentinel and multiplies by `INPUT_UNIT_FACTORS[input_units]` (default 1.0). Any rotated point inside the shape sets `is_on`.
5. `ZoneCoordsSensor.extra_state_attributes` (`sensor.py`) publishes `shape`, `data`, the effective `entities` list, `rotation_deg` and `name`; its state is the zone id. Both entities rewrite state on `SIGNAL_ZONES_UPDATED` for their device.

### Device entity to websocket to cards

1. The zone map card's `setConfig` (`frontend-src/src/zone-map/card.ts`) requires `device_id` and calls `_connectZones`, which hands off to `connectZones` (`frontend-src/src/zone-map/api.ts`). That subscribes first (`subscribeZones`, command `apollo_mmwave/zones/subscribe`), then reads once (`fetchZones`, command `apollo_mmwave/zones/get`), drops the read if a push already arrived, retries `not_loaded` with `RETRY_DELAYS_MS`, and re-opens both when `subscribeEntryLoads` sees this domain's config entry reach state `loaded`. `connectZones` serialises overlapping opens through a promise queue (`requestOpen`), so a reload burst or a retry landing on an entry update cannot leave an orphan server-side subscription. When `setConfig` is called with a different `device_id`, `_resetDeviceState` disposes the subscription and clears zones, tracked entities, the undo snapshot, cone angle and lock; `_connectZones` tags each connection so payloads from a superseded connection are dropped.
2. On the server, `ws_get_zones` and `ws_subscribe_zones` (`websocket.py`) both pass `_answerable` (`not_loaded` if the store is gone, `not_found` if the device id is not in the device registry) and answer with `_payload`, built from `store.devices.get(device_id)` plus fresh `resolve_target_pairs` as `suggested_entities`. The subscription's `_forward` listens to `SIGNAL_ZONES_UPDATED` and pushes a new payload for the matching device.
3. The card applies each payload in `_applyZoneConfig` (`card.ts`): `_applyZones` splits drawable zones from the name list, `_applyRotation` sets the cone angle and slider, `_applyTrackedEntities` uses `entities` when it is an array and `suggested_entities` when it is null.
4. Live targets are drawn on every `hass` assignment: `set hass` calls `drawGrid`, which calls `_drawTrackedTargets` to read `hass.states[pair.x].state` and `hass.states[pair.y].state`, scale by the card's `input_units` multiplier, rotate by the cone angle and skip near-zero readings.
5. Writes go the other way: `endDrawing` or `finishPolygon` produce a payload, `updateHomeAssistantShape` wraps it, and `_saveZoneUpdate` appends `input_units` and calls `hass.callService("apollo_mmwave", "update_zone", ...)`. The backend path above then pushes the result back over the subscription.
6. The tuning cards do not use the websocket. `ApolloLd2410DistanceCard.shouldUpdate` (`frontend-src/src/cards/distance-card.ts`) calls `resolveRadar` (`frontend-src/src/cards/resolution.ts`), memoised on `config`, `hass.entities` and `hass.devices`, which calls `resolveEntities` and `resolveProfile` (`frontend-src/src/entities.ts`). `render` then reads `hass.states` through `distanceModel` (`frontend-src/src/charts/distance-chart.ts`) or `gateEnergyModel` (`frontend-src/src/charts/gate-energy-chart.ts`).

## Backend modules

### `__init__.py`

`async_setup_entry` loads or migrates the store, runs `async_migrate_unique_ids`, stores the `ZoneStore` at `hass.data["apollo_mmwave"]["store"]`, installs the LD2450 pair cache, registers the service with `UPDATE_ZONE_SERVICE_SCHEMA`, registers the websocket commands, forwards `PLATFORMS = [binary_sensor, sensor]`, registers frontend assets, applies the dashboard option and adds an options update listener. `async_unload_entry` unloads platforms, removes the service, pops the store and flushes it. `async_remove_entry` removes the dashboard and deletes the storage file.

The service side:

- `_device_id_from_call` accepts `device_id` as a string or a one-item list (the shape a `target:` block produces) and refuses multi-device targets. `_device_is_registered` is applied on every path, so an unknown or stale device id never reaches the `store.device()` setdefault.
- Deprecated `location`: `_device_id_for_label` slug-matches the value against stored `label` fields only; `_device_id_for_deprecated_location` warns once per run via the `hass.data` flag `_DATA_LOCATION_WARNED` and refuses a label whose device has left the registry.
- `_normalize_entities`: an empty `entities` list means "no change", never "erase", because a card calling the service before it had loaded used to wipe people's tracked pairs. `clear_entities: true` is the only way to empty the list, and it takes precedence over `entities` in the same call (`_apply_entity_pairs`).
- Rename: `_update_registry_names` writes the registry `name` as `Zone {n} - {zone_name}` (or the bare base when the name is empty) and only when `_is_generated_name` says the current name is still generated, so user-typed names survive. Delete removes both registry entries via `_remove_zone_entities`.
- Geometry: `_normalize_rect` and `_normalize_polygon` return `{**data, ...}` and therefore persist any extra keys the caller put in `data`, while `_normalize_ellipse` rebuilds a clean dict. Polygons with more than `POLYGON_MAX_POINTS` points are truncated with a warning, not rejected (mirrored by the card).

The module also holds the unique-id contract `_zone_entity_unique_ids` and `get_store`, which `binary_sensor.py`, `sensor.py`, `zone_entities.py` and `websocket.py` import lazily.

### `config_flow.py`

`ApolloMmwaveConfigFlow.async_step_user` creates a single entry with `unique_id = "apollo_mmwave"`, empty `data` and `options = {auto_create_view}`. `ApolloMmwaveOptionsFlow.async_step_init` shows an `auto_create_view` toggle and a `dashboard_devices` `DeviceSelector` filtered to `integration=esphome`, `manufacturer=ApolloAutomation` and `model in MMWAVE_MODELS`. Option changes are applied without a reload by `_async_options_updated` (`__init__.py`).

### `const.py`

The home for shared names: `DOMAIN`, `SERVICE_UPDATE_ZONE`, `EVENT_ZONE_UPDATED`, `SIGNAL_ZONES_UPDATED`, most `hass.data` keys, store keys and `INPUT_UNIT_FACTORS`, shape names and polygon limits, `CARD_TYPE`, options keys, dashboard constants, `STATIC_URL_BASE`, `FRONTEND_DIR` and `JS_BUNDLES`, plus the `WARN_*` log templates. Two `hass.data` keys live elsewhere: `_DATA_LOCATION_WARNED = "location_deprecation_warned"` in `__init__.py` and `DATA_SUBSCRIPTIONS = "ws_subscriptions"` in `websocket.py`.

### `store.py`

`ZoneStore` wraps a `_MigratingStore` with key `apollo_mmwave.zones` and `STORAGE_VERSION = 2`. `async_load` returns `False` when no file exists. `_async_migrate_func` rekeys v1 `locations` (display names) into v2 `devices` (HA device ids) using `_resolve_device_id`, retaining unresolvable entries under `orphans`. `_parse_entry` normalises each loaded entry: int zone ids and an allow-list of keys (see Known limitations for what that allow-list drops). `device()` is a `setdefault`, so readers use `store.devices.get()` to avoid minting entries. `_data_to_save` dumps the live dicts verbatim.

### `migration.py`

Three one-way upgrade paths run from setup. `async_migrate_legacy` rebuilds zones from the RestoreEntity attributes of pre-1.2 sensors whose unique id is `apollo_mmwave_<slug>_zone_<n>`; it keeps an empty placeholder for a zone with no shape so the entity is recreated. `async_import_zone_mapper` does the same for the standalone `zone_mapper` platform, except that it skips zones whose restore attributes carry no `shape`; the import is read-only with respect to that integration. Both run only when no store file exists. `async_migrate_unique_ids` runs on every setup: it promotes orphans that now resolve (`_promote_resolvable_orphans`) and rewrites pre-2.0 unique ids matching `_OLD_UID` to `<device_id>_zone_<n>[_presence]`.

### `zone_entities.py`

`ZoneEntityTracker` keeps exactly one entity per `(device_id, zone_id)` per platform, remembers refused adds (`add_to_platform_abort`) and skips user-disabled registry entries (`is_disabled`). `ZoneEntityMixin.async_will_remove_from_hass` re-dispatches `SIGNAL_ZONES_UPDATED` when an aborted add is pending, so a delete followed by an immediate redraw still ends with one entity.

### `binary_sensor.py`

`ZonePresenceBinarySensor` has unique id `{device_id}_zone_{n}_presence`, name `Zone {n} presence`, device class occupancy, and is linked to the radar's device entry. Shape testers: `_point_in_rect` (inclusive bounds), `_point_in_ellipse`, `_point_in_polygon` (even-odd ray cast, at least `POLYGON_MIN_POINTS`). Rotation uses `x' = x cos t + y sin t`, `y' = -x sin t + y cos t`.

### `sensor.py`

`ZoneCoordsSensor` has unique id `{device_id}_zone_{n}` and name `Zone {n}`. It exists so automations and the sensor attributes expose the geometry; the card itself reads the websocket instead.

### `ld2450.py`

`resolve_target_pairs`, `effective_target_pairs` and `async_track_target_pairs` as described above. `effective_target_pairs` is the only answer both platforms use, so the sensor's `entities` attribute matches what presence tracks. The `entities` store key is three-valued: absent means auto-detect, `[]` means track nothing, a list means exactly those pairs. The registry listener invalidates the changed entity's device when that device is cached; otherwise it scans every cached device whose pairs reference the entity id and invalidates those, which covers an entity moved away from a cached device.

### `websocket.py`

`async_register` registers `apollo_mmwave/zones/get` and `apollo_mmwave/zones/subscribe` on every config entry setup; registration is a keyed assignment that replaces the previous handlers rather than stacking them, and the commands are never unregistered. It returns a teardown that closes this entry's subscriptions on unload. Neither command requires admin. Zone ids are stringified in the payload.

### `frontend.py`

`async_register_frontend_assets` is guarded by `hass.data["apollo_mmwave"]["assets_registered"]`, reads the manifest version for the `?v=` cache buster, registers each existing bundle as a static path with `cache_headers=True` (the cache duration itself is Home Assistant's `CACHE_TIME` in `homeassistant/components/http/static.py`, 31 days at the time of writing), adds it as an extra JS URL and reconciles the Lovelace resource collection (`_async_register_lovelace_resources`): an existing row with an older `?v=` is updated in place rather than duplicated, stale `/apollo_mmwave/` rows are deleted, and a YAML-mode resource collection only produces a warning listing the URLs to add by hand. `async_register_dashboard` creates the storage dashboard at url path `apollo-mmwave` once and keeps its config at `{"strategy": {"type": "custom:apollo-radar-tuning", "devices": [...]?}}` (`_desired_config`), only when `_is_ours` agrees; a YAML dashboard already holding the `apollo-mmwave` url path is left alone. The dashboards collection is borrowed from HA's `lovelace/dashboards/list` handler. `async_remove_dashboard` deletes it only if still ours.

### `services.yaml`, `translations/en.json`, `manifest.json`

`services.yaml` documents `update_zone`: `device_id`, deprecated `location`, `zone_id`, `shape`, `data`, `name`, `delete`, `input_units`, `rotation_deg`, `entities`, `clear_entities`. `translations/en.json` carries the config and options flow strings. `manifest.json` declares `config_flow: true`, dependencies `frontend`, `http`, `lovelace`, `websocket_api`, `integration_type: service`, `iot_class: local_push`, and the version.

## Frontend modules

### Detection and profiles (`register.ts`, `entities.ts`, `profiles.ts`, `ld2450.ts`, `types.ts`, `index.ts`)

`index.ts` is the tuning bundle entry: it exports `CARD_VERSION` and side-effect imports the two cards and the strategy. `registerElement` (`register.ts`) defines an element immediately and re-asserts every pending definition once `home-assistant` or `hc-main` is defined, because HA's scoped-custom-element-registry polyfill replaces `window.customElements` after boot. `profiles.ts` holds the chip tables: `LD2410_PROFILE` (9 gates g0..g8, MSR-2 naming) and `LD2412_PROFILE` (14 gates g00..g13, `ld2412_` naming), `APOLLO_MODELS` (model prefix to profile and LD2450 flag), `apolloModelInfo` and `isEsphomeDevice`. `entities.ts` turns registered entity ids into an `EntityMap` (`types.ts`): `baseNameFromDevice` strips `KNOWN_SUFFIXES`, `classifyObjectId` matches `GATE_PATTERNS` then `SCALAR_PATTERNS`, `entityMapFromDevice` builds a possibly sparse map, and `resolveEntities` / `resolveProfile` add the base-name fallback and `config.entities` overrides. `ld2450.ts` detects LD2450 target sensors with the same regexes as the backend and emits the zone map card config (`zoneMapCard`).

### Strategy (`strategy.ts`, `strategy-core.ts`, `panels/`)

`strategy.ts` registers `ll-strategy-dashboard-apollo-radar-tuning`, `ll-strategy-view-apollo-radar-tuning` and `ll-strategy-section-apollo-radar-tuning` and pushes a `window.customStrategies` entry. All three share `shouldRegenerate`, which returns false when `hass.devices` and `hass.entities` are reference-equal and no entity crossed the `unavailable` line, and otherwise compares `radarDeviceKey` (device id, profile key, LD2450 flag, online flag). `strategy-core.ts` does the work: `strategyDevices` picks `config.device_id`, `config.devices` or `detectRadarDevices`; `deviceFromId` combines registry match, base name, liveness and profile; `cardMap` builds entities cards from `panels/entity-rows.ts`, a history graph from `panels/history.ts`, the two custom chart cards, a help card and the zone map card; `buildDeviceSections`, `deviceView` and `generateViews` lay them out as one sections view per device. `generateViews` appends the device id to the view path when two devices share a base name, because HA opens the first view matching the URL.

### Tuning cards and charts (`cards/`, `charts/`)

`ApolloLd2410DistanceCard` (`cards/distance-card.ts`, element `apollo-radar-distance-card`) and `ApolloLd2410GateEnergyCard` (`cards/gate-energy-card.ts`, element `apollo-radar-gate-energy-card`) are Lit elements that take `device_id`, `device_base_name`, `entities`, `title` and `distance_unit` (`types.ts`). `cards/resolution.ts` memoises entity resolution and gates re-renders to ticks that changed a resolved entity's state (`resolvedStatesChanged`). `charts/distance-chart.ts` renders zones, detection/moving/still bars, gate bands and max-gate bars scaled to gate size times gate count; `charts/gate-energy-chart.ts` renders per-gate move/still energy with threshold markers, visible only while the engineering-mode switch is on. `charts/geometry.ts`, `charts/entity-read.ts` and `charts/unit-convert.ts` are pure helpers.

### Zone map (`zone-map/card.ts`, `editor.ts`, `api.ts`)

`ZoneMapCard` (element `apollo-radar-zone-map-card`) is a plain `HTMLElement` with an 800 by 800 canvas (`setupCanvas`). It draws rect, ellipse and polygon zones in millimetres, Y-down, over live targets and a device cone, with a rotation slider (`_persistRotation`), per-radar lock persisted in `localStorage` (`readStoredLock`), a single-level undo and a zone manager for rename, delete and add (`_renderZoneManager`, `_handleAddZone`). Lock precedence: `_applyAutoLock` runs once per page load and uses the `start_locked` config first, then the stored `localStorage` value, then "locked if the radar already has zones". The file is `@ts-nocheck` by design (see its header comment). `ZoneMapCardEditor` (`editor.ts`, element `apollo-radar-zone-map-card-editor`) edits `device_id`, `title`, `dark_mode` and `start_locked` using `ha-device-picker`, `ha-textfield` and `ha-selector`. `api.ts` is the typed websocket client described under Runtime data flow.

## Contracts between frontend and backend

**Websocket commands** (`websocket.py`, `api.ts`): `apollo_mmwave/zones/get {device_id}` returns one payload; `apollo_mmwave/zones/subscribe {device_id}` returns null then pushes the same payload on every change. Error codes: `not_loaded` (retried by the card) and HA's `not_found` (terminal). The card's reload recovery also uses HA's admin-only `config_entries/subscribe`.

**Payload** (`websocket.py` `_payload`, `api.ts` `ZoneConfig`): `{zones: {"<id>": {shape, data, name?}}, entities: [{x, y}] | null, rotation_deg: number | null, label: string | null, input_units: string | null, suggested_entities: [{x, y}]}`. The server always sends `input_units`; the TypeScript interface declares it optional. Zone ids are ints in the store and strings on the wire. `entities: null` means never configured (the card uses `suggested_entities`); `[]` means cleared.

**Service** `apollo_mmwave.update_zone` (`UPDATE_ZONE_SERVICE_SCHEMA` in `__init__.py`, `services.yaml`): at least one of `device_id` (str or one-item list) or deprecated `location`; `zone_id` (`cv.positive_int`); `shape` in `none`, `rect`, `ellipse`, `polygon`; `data` dict or null; `name`; `delete`; `rotation_deg` (coerced to float, then rounded and clamped to [-180, 180] by `_sanitize_rotation`); `input_units` in `INPUT_UNIT_FACTORS`; `entities` as `[{x: entity_id, y: entity_id}]`, where an empty list means no change; `clear_entities`, which wins over `entities`. Extra top-level keys are rejected. The card sends: `{device_id, zone_id, shape, data}` for geometry (`updateHomeAssistantShape`), `{device_id, zone_id, name}` for rename, `{device_id, zone_id, delete: true}` for delete, `{device_id, rotation_deg}` for rotation (`_persistRotation`), `{device_id, zone_id, shape: "none", data: null, name}` for a new zone, and always adds `input_units` (`_saveZoneUpdate`). It never sends `entities`, `clear_entities` or `location`.

**Geometry**: integer millimetres, X to the radar's right, Y away from the radar. `rect {x_min, x_max, y_min, y_max}` with strict `x_min < x_max` and `y_min < y_max`; `ellipse {cx, cy, rx, ry}` with radii floored at 1 mm; `polygon {points: [{x, y}]}` with `POLYGON_MIN_POINTS` to `POLYGON_MAX_POINTS` points (`const.py`). The rotation formula is the same in `binary_sensor.py` (`_build_point_rotator`) and `card.ts` (`_drawTrackedTargets`).

**Bus event** `apollo_mmwave_zone_updated` with data `{"device_id": "<ha device id>"}` (`EVENT_ZONE_UPDATED`, fired from `_notify_zones_updated`). The internal dispatcher signal `apollo_mmwave_zones_updated` (`SIGNAL_ZONES_UPDATED`) carries the device id as its only positional argument.

**Storage schema** (`store.py`): key `apollo_mmwave.zones`, version 2, shape `{"devices": {<device_id>: {"zones": {"<n>": {shape, data, name?}}, "entities"?: [...], "rotation_deg"?: int, "label"?: str, "input_units"?: str}}, "orphans": {<v1 location>: same}}`. Version 1 files have `{"locations": {<display name>: {zones, entities, rotation_deg}}}`.

**Entity unique ids**: `{device_id}_zone_{n}` and `{device_id}_zone_{n}_presence` (`_zone_entity_unique_ids` in `__init__.py`, used by `sensor.py`, `binary_sensor.py`, `migration.py`). Registry base names `Zone {n}` and `Zone {n} presence` (`_update_registry_names`) must match `_attr_name` on the platforms.

**Custom element names**: `apollo-radar-zone-map-card` (`card.ts`, `const.py` `CARD_TYPE` as `custom:apollo-radar-zone-map-card`), `apollo-radar-zone-map-card-editor` (`editor.ts`), `apollo-radar-distance-card` (`distance-card.ts`), `apollo-radar-gate-energy-card` (`gate-energy-card.ts`), `ll-strategy-{dashboard,view,section}-apollo-radar-tuning` (`strategy.ts`) for strategy type `custom:apollo-radar-tuning` (`const.py` `DASHBOARD_STRATEGY_TYPE`).

**Static URL paths**: `/apollo_mmwave/apollo-radar-tuning.js` and `/apollo_mmwave/apollo-radar-zone-map-card.js` (`const.py` `STATIC_URL_BASE`, `JS_BUNDLES`), served from `custom_components/apollo_mmwave/www` with `?v=<manifest version>` (`frontend.py`). Bundle names must match `frontend-src/vite.config.ts` and `vite.zone-map.config.ts`.

**Dashboard strategy config**: `{"strategy": {"type": "custom:apollo-radar-tuning", "devices"?: [device ids], ...user keys}}` written by `frontend.py` `_desired_config` from the `dashboard_devices` option; read by `StrategyConfig` (`strategy-core.ts`: `device_id`, `devices`, `distance_unit`).

**LD2450 naming regex**: `(?:_ld2450)?_target_(\d+)_x(?:_\d+)?$` and the `_y` twin must stay identical in `ld2450.py` (`TARGET_X`, `TARGET_Y`) and `ld2450.ts`.

## Tuning parameters and where they live

| Name | File | Value | Meaning | Source of truth |
|---|---|---|---|---|
| `INPUT_UNIT_FACTORS` | `const.py` | mm 1, cm 10, m 1000, in 25.4, ft 304.8, yd 914.4 | mm per unit applied to target readings | SI and imperial definitions |
| `LENGTH_UNITS` | `card.ts` | mm, cm, m, in, ft (no yd) | Card-side copy of the unit table | Same definitions; subset of backend |
| `POLYGON_MAX_POINTS` | `const.py`, `card.ts` | 32 | Polygon vertex cap on the write path | Project choice |
| `POLYGON_MIN_POINTS` | `const.py` | 3 | Minimum polygon vertices | Geometry |
| Rotation clamp | `__init__.py` `_sanitize_rotation`, `card.ts` | [-180, 180], integer | Device-wide rotation of target readings | Project choice, mirrored in `services.yaml` |
| Ellipse radius floor | `__init__.py` `_normalize_ellipse`, `card.ts` | 1 mm | Smallest persisted radius | Project choice |
| Origin sentinel | `binary_sensor.py` `_get_coordinate_pair`, `card.ts` `_drawTrackedTargets` | exactly (0, 0) backend; abs < 1e-6 card | Idle target slot is not a target | LD2450 firmware reports (0, 0) when a slot is empty |
| `SAVE_DELAY_SECONDS` | `store.py` | 2.0 | Store write debounce after each service call | Project choice |
| `STORAGE_VERSION` | `store.py` | 2 | Store schema version; v1 triggers rekey | Integration history |
| `DEFAULT_AUTO_CREATE_VIEW` | `const.py` | True | Sidebar dashboard created unless opted out | Product choice |
| `MMWAVE_MODELS` | `config_flow.py` | MSR-1, MSR-1_BLE, MSR-1_Factory, MSR-2, MSR-2_BLE, MSR-2_Factory, MTR-1, R-PRO-1-W, R-PRO-1-ETH | Exact models offered by the options device picker | Apollo ESPHome project names |
| `APOLLO_MODELS` | `profiles.ts` | msr-1, msr-2 (LD2410); mtr-1 (LD2450); r-pro-1 (LD2412 + LD2450) | Model prefix to chip profile for detection | Apollo ESPHome project names |
| `TARGET_X` / `TARGET_Y` | `ld2450.py`, `ld2450.ts` | `(?:_ld2450)?_target_(\d+)_[xy](?:_\d+)?$` | LD2450 target sensor naming | R-PRO-1 and MTR-1 firmware naming |
| LD2410 gate count | `profiles.ts` `LD2410_PROFILE` | 9 (g0..g8) | Threshold and energy array length | LD2410 datasheet and MSR firmware |
| LD2412 gate count | `profiles.ts` `LD2412_PROFILE` | 14 (g00..g13) | Threshold and energy array length | LD2412 and R-PRO-1 firmware |
| `DEFAULT_GATE_SIZE_M` | `distance-chart.ts` | 0.75 | Gate width when the select is unreadable | HLK-LD2410 manual default |
| `GATE_COUNT` | `distance-chart.ts` | 8 | Fallback number of distance bands | LD2410: 9 registers, gate 0 has no width |
| `MAX_ENERGY` | `gate-energy-chart.ts` | 100 | Energy and threshold full scale | LD2410/LD2412 0..100 scale |
| `defaultDistanceUnit` | `unit-convert.ts` | `mi` to `in`, else `m` | Chart unit when `distance_unit` is absent | UI choice from `hass.config.unit_system.length` |
| `DEFAULT_GRID` | `card.ts` | x -5000..5000, y 0..10000 mm | Default zone map extent | UI choice |
| `getStubConfig` grid | `card.ts` | x -6000..6000, y 0..12000 mm | Extent for picker-added cards | UI choice (differs from `DEFAULT_GRID`) |
| `DEFAULT_CONE` | `card.ts` | 6000 mm, 120 deg, 0 deg | Drawn cone range, FOV, rotation | UI approximation of LD2450 |
| `GRID_MIN_SPACING_PX` | `card.ts` | 40 | Minimum pixel spacing of grid lines | UI choice |
| Canvas backing size | `card.ts` `setupCanvas` | 800 x 800 px | Internal canvas resolution | UI choice |
| `RETRY_DELAYS_MS` | `api.ts` | 1000, 2000, 5000, 10000, 20000 | Backoff while the backend is `not_loaded` | UI choice |
| `hours_to_show` | `strategy-core.ts` | 1 | Occupancy history window | UI choice |
| Lock storage key | `card.ts` | `apollo-mmwave.zone-map.lock.<device_id>` | Per-radar remembered lock | UI choice |
| `zone_id` selector | `services.yaml` | min 1, max 32 | UI bound only; the schema has no upper bound | UI choice |
| Manifest version | `manifest.json`, `index.ts`, `package.json` | 2.1.3 | Integration version and JS `?v=` cache buster | Release process, hand-synced |
| Minimum HA | `hacs.json` | 2026.8.1 | HACS install floor | Release choice |
| `requires-python` | `pyproject.toml` | >= 3.14.2 | Interpreter floor | HA 2026.8.1 requirement |

## Build, test and CI

The frontend is built and tested from `frontend-src/` (`frontend-src/package.json`):

```sh
cd frontend-src
npm ci              # CI uses npm ci
npx tsc --noEmit    # type check src and test (tsconfig.json)
npm test            # vitest run (vitest.config.ts: happy-dom, test/**/*.test.ts, test/setup-canvas.ts)
npm run build       # vite build && vite build --config vite.zone-map.config.ts
```

`npm run build` runs Vite twice on purpose (`vite.config.ts`): a single multi-entry build would hoist `src/register.ts` into a shared chunk that HA never fetches, so each bundle is built standalone and written to `../custom_components/apollo_mmwave/www/<name>.js` with `emptyOutDir: false` and terser minification. The two outputs, `apollo-radar-tuning.js` (from `src/index.ts`) and `apollo-radar-zone-map-card.js` (from `src/zone-map/card.ts`), are committed because the Python side serves exactly those filenames (`const.py` `JS_BUNDLES`) and HACS users never run npm. Any change under `frontend-src/src` must therefore be followed by a rebuild and a commit of `www/`.

The Python suite (`tests/`):

```sh
uv venv && uv pip install -r requirements-test.txt
uv run --no-project pytest tests/
```

`requirements-test.txt` pins `pytest-homeassistant-custom-component` (which pins a matching `homeassistant`) and `home-assistant-frontend`, needed because `manifest.json` depends on `frontend`. `pyproject.toml` sets `testpaths = ["tests"]` and `asyncio_mode = "auto"`. `tests/conftest.py` auto-enables custom integrations; fixtures register an ESPHome radar device with three target pairs.

Linting:

```sh
scripts/bootstrap     # venv + pip install -r requirements.txt + pre-commit install
scripts/lint-check    # uv run ruff format . --check && uv run ruff check .
scripts/lint          # same, with --fix
```

Ruff is configured in `pyproject.toml` (`select = ["ALL"]`, target py314, test exemptions). `.pre-commit-config.yaml` runs `ruff check --fix` and `ruff format` on staged Python files.

CI (`.github/workflows/`):

- `lint.yml`: Python 3.14, uv, `scripts/bootstrap`, `scripts/lint-check`.
- `test.yml` job `pytest`: `uv venv`, `uv pip install -r requirements-test.txt`, `uv run --no-project pytest tests/ -q`.
- `test.yml` job `frontend` (working directory `frontend-src`): `npm ci`, `npx tsc --noEmit`, `npm test`, then `npm run build` followed by `git diff --exit-code ../custom_components/apollo_mmwave/www`. The diff fails the job when the committed bundles do not match a fresh build, which is how stale `www/` output is caught.
- `validate.yml`: hassfest and HACS validation (`category: integration`, `ignore: brands`) on push, pull request, daily cron and manual dispatch.

Local development uses `scripts/develop`, which runs `hass --config config --debug` with `./custom_components` on `PYTHONPATH` and `config/configuration.yaml` (debug logging for `custom_components.apollo_mmwave`). The devcontainer (`.devcontainer.json`) runs `scripts/motd` on start.

## Known limitations

These were confirmed against the code when this document was written. `README.md` lists the user-facing ones under "Known limitations". Items fixed by the full audit are recorded in `REVIEW_REPORT.md`; the list below describes behavior that is still present.

- The card overwrites `input_units` on every write with its own YAML value (`_saveZoneUpdate`) and never reads the payload's `input_units`. `yd` is accepted by the backend (`INPUT_UNIT_FACTORS`) but absent from the card's `LENGTH_UNITS`, which normalises unknown units to `mm`.
- The LD2450 registry listener has no event filter and reacts to this integration's own zone entities as well as the radar's.
- JS cache busting uses only the `manifest.json` `version` for the `?v=` query, with Home Assistant's long-lived cache header on the static path. A `www/` rebuild without a version bump is invisible to browsers that cached the old module.
- `radarDeviceKey` (`strategy.ts`) omits the device name and base name, so a device rename does not refresh the tab title or path until a page reload; entities registered after the first detection do not add rows either.
- Zone card reload recovery depends on the admin-only `config_entries/subscribe` feed; non-admin viewers recover only through the bounded `not_loaded` retry or a page reload.
- Editing a strategy view in the Home Assistant UI discards its cards; that is how Home Assistant treats strategy views. Use "take control" on the dashboard instead.
