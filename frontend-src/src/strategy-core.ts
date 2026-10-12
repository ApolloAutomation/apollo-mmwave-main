import type { CalibrationOptions, HassEntity, HomeAssistant } from "./types";
import {
  baseNameFromDevice,
  detectProfileFromEntities,
  entityMapFromDevice,
} from "./entities";
import { entitiesForDevice } from "./entity-index";
import { hasLd2450Device, ld2450EntityIds, zoneMapCard } from "./ld2450";
import { apolloModelInfo, isEsphomeDevice, type RadarProfile } from "./profiles";
import {
  controlRows,
  zoneConfigRows,
  moveThresholdRows,
  stillThresholdRows,
  occupancyRows,
  rangeRows,
  presentRows,
  type Row,
} from "./panels/entity-rows";
import { historyEntities } from "./panels/history";

export interface RadarDevice {
  deviceId: string;
  base: string;
  name: string;
  /** Gate-radar tuning profile (LD2410/LD2412). Undefined for zone-only
   *  devices such as the MTR-1, which has an LD2450 but no tunable gate radar. */
  profile?: RadarProfile;
  /** Whether the device exposes an LD2450 tracking radar (X/Y zones). */
  ld2450: boolean;
  /** Whether any recognised radar entity currently has a real state. An
   *  offline radar keeps its tab (with a note) so the user can see it is
   *  expected and not silently missing. */
  online: boolean;
}

export interface StrategyConfig {
  device_id?: string;
  /** Explicit selection: show exactly these devices, online or not. Set by
   *  the integration's "Dashboard devices" option (or by hand in YAML).
   *  Empty/absent means every detected Apollo radar, online or not. */
  devices?: string[];
  distance_unit?: string;
  /** Seeds the calibrate card's `calibration:` block on every gate-radar tab
   *  (duration, countdown and headroom sent to `calibrate_gates`). */
  calibration?: CalibrationOptions;
}

/** Whether a state object is a real reading. Only "unavailable" (or no state
 *  at all) means offline; "unknown" counts as live. `shouldRegenerate` uses
 *  the same test for its availability fast path, so the two cannot drift
 *  apart and miss an `online` flip in the device key. */
export function isLiveState(state: HassEntity | undefined): boolean {
  return state !== undefined && state.state !== "unavailable";
}

function isLive(hass: HomeAssistant, entityId: string | undefined): boolean {
  return !!entityId && isLiveState(hass.states[entityId]);
}

/** The platform this integration's own entities carry. Kept local rather than
 *  imported from `zone-map/api.ts` so that module stays out of this bundle. */
const OWN_PLATFORM = "apollo_mmwave";

/**
 * Whether a device shows LIVE radar evidence.
 *
 * A registry-matched Apollo radar gets a tab either way (an unplugged
 * testbench is still the user's radar, and a tab saying "offline" beats one
 * that is silently missing); this decides the note on that tab. A device
 * WITHOUT a registry model has nothing but its entity names to vouch for it,
 * so it needs at least one recognized radar entity with a real state. The
 * device registry keeps entries for hardware that was reflashed or re-added
 * under a new name; such a ghost now shows as an offline tab until the user
 * deletes the stale device, which is the right cleanup anyway.
 */
function hasLiveRadarEvidence(
  hass: HomeAssistant,
  deviceId: string,
  registryMatched: boolean
): boolean {
  const m = entityMapFromDevice(hass, deviceId);
  const radarIds: (string | undefined)[] = [];
  if (m) {
    // TODO(REVIEW_REPORT.md X37): omits bluetooth and gate_size, so a no-model device live only
    // on those is dropped; if changed, derive from entityIds(m) minus chip-agnostic buttons.
    radarIds.push(
      m.engineering_mode,
      m.radar_timeout,
      m.max_move_distance,
      m.max_still_distance,
      m.radar_target,
      m.moving_target,
      m.still_target,
      m.detection_distance,
      ...m.move_threshold,
      ...m.still_threshold,
      ...m.move_energy,
      ...m.still_energy
    );
  }
  radarIds.push(...ld2450EntityIds(hass, deviceId));
  if (radarIds.some((id) => isLive(hass, id))) return true;
  if (radarIds.some((id) => id !== undefined)) return false;

  // No recognizable radar entities: only a registry match keeps the device
  // (renamed-beyond-recognition case), and only while something is alive.
  // This integration's own zone sensors sit on the radar's device but never go
  // unavailable, so they say nothing about the radar and do not count. Only
  // that platform is skipped: older frontends send no platform at all.
  return (
    registryMatched &&
    entitiesForDevice(hass.entities, deviceId).some(
      ([id, e]) => e.platform !== OWN_PLATFORM && isLive(hass, id)
    )
  );
}

function deviceFromId(
  hass: HomeAssistant,
  deviceId: string,
  // An explicitly selected device (options / device_id / devices config) is
  // shown even while offline — the user asked for it by name.
  forced = false
): RadarDevice | undefined {
  const d = hass.devices[deviceId];
  if (forced && !d) return undefined; // selection points at a deleted device
  // Registry-first: manufacturer/model survive entity renames and `_2` dedup.
  // Only for an ESPHome device, though: a network integration's copy of the
  // same hardware carries the same strings and must not become a second tab.
  const reg = isEsphomeDevice(hass, deviceId) ? apolloModelInfo(d) : undefined;
  const base = baseNameFromDevice(hass, deviceId);
  if (!forced && !reg && !base) return undefined;

  // Liveness. A registry-matched radar is shown regardless (offline note on
  // its tab); anything else needs live radar evidence to count as a radar at
  // all. The freshly-added-device race (registry entry before its entities)
  // is covered either way: the later entities update changes the device key
  // and triggers a regeneration.
  const online = hasLiveRadarEvidence(hass, deviceId, !!reg);
  if (!forced && !reg && !online) return undefined;

  // Entities win over the registry model when they give a concrete chip match
  // (DIY/reflashed hardware); the registry decides when probing is blind
  // (e.g. every chip-specific entity disabled or renamed beyond recognition).
  const profile = detectProfileFromEntities(hass, deviceId) ?? reg?.profile;
  // LD2450 evidence is device-scoped only. Probing ids built from the base in
  // the global states would let a same-named radar's target sensors flag a
  // gate-only device, and this device's own sensors are in `hass.entities`.
  const ld2450 = hasLd2450Device(hass, deviceId) || (reg?.ld2450 ?? false);
  // Include the device if it has either a tunable gate radar or an LD2450 —
  // a forced device stays even if neither is detectable (offline + unknown
  // model): its tab explains the situation instead of silently vanishing.
  if (!forced && !profile && !ld2450) return undefined;
  return {
    deviceId,
    // The base doubles as the view path, so a registry-matched device whose
    // entity names yield no base still needs a stable unique key.
    base: base ?? deviceId,
    name: d?.name_by_user || d?.name || base || deviceId,
    profile,
    ld2450,
    online,
  };
}

/** Every Apollo mmWave device — a gate radar (LD2410/LD2412), an LD2450, or
 *  both. Registry-matched Apollo radars are included online or not. */
export function detectRadarDevices(hass: HomeAssistant): RadarDevice[] {
  const out: RadarDevice[] = [];
  for (const deviceId of Object.keys(hass.devices)) {
    const dev = deviceFromId(hass, deviceId);
    if (dev) out.push(dev);
  }
  return out;
}

/** The devices a strategy config renders: one explicit device, the explicit
 *  selection list (forced, shown even offline), or every detected one. */
export function strategyDevices(
  hass: HomeAssistant,
  config: StrategyConfig
): RadarDevice[] {
  if (config.device_id) {
    const d = deviceFromId(hass, config.device_id, true);
    return d ? [d] : [];
  }
  // TODO(REVIEW_REPORT.md X34): a hand-written `devices: "id"` string throws in .map; consider
  // normalizing (an array as is, a string to [string], else []) with a test.
  if (config.devices?.length) {
    return config.devices
      .map((id) => deviceFromId(hass, id, true))
      .filter((d): d is RadarDevice => d !== undefined);
  }
  return detectRadarDevices(hass);
}

function entitiesCard(title: string, rows: Row[]): Record<string, any> | undefined {
  if (rows.length === 0) return undefined;
  return {
    type: "entities",
    title,
    show_header_toggle: false,
    entities: rows.map((r) => ({ entity: r.entity, name: r.name })),
  };
}

const OFFLINE_NOTE =
  "\n\n**Offline right now.** Its entities are unavailable, so the cards" +
  " below will fill in once it reconnects. If this radar was replaced or" +
  " reflashed under a new name, delete the old device in Home Assistant to" +
  " drop this tab.";

function helpCard(dev: RadarDevice): Record<string, any> {
  const card = helpCardBody(dev);
  if (!dev.online && (dev.profile || dev.ld2450)) {
    card.content = `${card.content}${OFFLINE_NOTE}`;
  }
  return card;
}

function helpCardBody(dev: RadarDevice): Record<string, any> {
  if (!dev.profile && !dev.ld2450) {
    // Forced (explicitly selected) device with nothing detectable — offline
    // and no registry model to go by.
    return {
      type: "markdown",
      content:
        `**${dev.name}**: no radar data available right now.\n\n` +
        `The device looks offline (or exposes no recognizable radar ` +
        `entities). Its cards will appear here once it reports in.`,
    };
  }
  if (!dev.profile) {
    return {
      type: "markdown",
      content:
        `**${dev.name}**, Apollo mmWave (LD2450 tracking radar).\n\n` +
        `Draw occupancy zones over the live target positions below.`,
    };
  }
  const p = dev.profile;
  return {
    type: "markdown",
    content:
      `**${dev.name}**, Apollo ${p.label} radar.\n\n` +
      `**Start here**\n` +
      `1. Press **Calibrate with empty room** on the Auto-calibrate card and leave the room.\n` +
      `2. Set how far it should look: **${p.rangeLabels[0]} / ${p.rangeLabels[1]}** on the` +
      ` Detection Range card (each gate is 0.75 m unless you changed ${p.gateSizeLabel}).\n` +
      `3. Set how long presence stays on after you stop moving: **Radar Timeout**, same card.\n` +
      `4. Walk the room and watch the Gate Energy chart. Raise a gate's threshold if it` +
      ` triggers with nobody there, lower it if it misses you.\n\n` +
      `[Full tuning guide →](${p.wikiUrl})`,
  };
}

function noteCard(text: string): Record<string, any> {
  return { type: "markdown", content: text };
}

interface DeviceCards {
  help: Record<string, any>;
  /** The auto-calibrate card, first on every gate-radar tab. */
  calibrate?: Record<string, any>;
  controls?: Record<string, any>;
  range?: Record<string, any>;
  rangeNote?: Record<string, any>;
  zone?: Record<string, any>;
  distance?: Record<string, any>;
  gateEnergy?: Record<string, any>;
  moveThr?: Record<string, any>;
  stillThr?: Record<string, any>;
  gateNote?: Record<string, any>;
  occupancy?: Record<string, any>;
  history?: Record<string, any>;
  // LD2450 zone-mapping (R-PRO-1 / MTR-1).
  zoneHeader?: Record<string, any>;
  zoneMap?: Record<string, any>;
}

function cardMap(
  hass: HomeAssistant,
  dev: RadarDevice,
  distanceUnit?: string,
  calibration?: CalibrationOptions
): DeviceCards {
  const cards: DeviceCards = { help: helpCard(dev) };

  // Gate-radar tuning cards (LD2410 / LD2412), only when the device has a
  // tunable gate radar.
  if (dev.profile) {
    const profile = dev.profile;
    // Online or not: the card renders its own offline state, and a tab that
    // always starts with the same card is easier to learn.
    cards.calibrate = {
      type: "custom:apollo-radar-calibrate-card",
      device_id: dev.deviceId,
      device_base_name: dev.base,
      title: "Auto-calibrate",
      ...(calibration ? { calibration } : {}),
    };
    // Prefer the device's actual entity ids (rename/dedup-proof); constructed
    // ids are only right when nothing was renamed.
    const m = entityMapFromDevice(hass, dev.deviceId) ?? profile.entityMap(dev.base);
    const label = profile.label;
    const historyRows = presentRows(hass, historyEntities(m));
    const range = entitiesCard(
      `${label} Detection Range`,
      presentRows(hass, rangeRows(m, profile.rangeLabels, profile.gateSizeLabel))
    );
    const moveThr = entitiesCard(
      `${label} Move Thresholds`,
      presentRows(hass, moveThresholdRows(m))
    );
    const stillThr = entitiesCard(
      `${label} Still Thresholds`,
      presentRows(hass, stillThresholdRows(m))
    );
    cards.controls = entitiesCard(
      `${label} Controls`,
      presentRows(hass, controlRows(m))
    );
    cards.range = range;
    cards.rangeNote = range ? noteCard(profile.rangeTip) : undefined;
    cards.zone = entitiesCard(
      `${label} Zone Config`,
      presentRows(hass, zoneConfigRows(m))
    );
    // TODO(REVIEW_REPORT.md X35): emitted even for offline or unresolvable devices (deliberate,
    // per OFFLINE_NOTE); at most drop device_base_name when dev.base === dev.deviceId.
    // device_id is the durable reference; device_base_name is kept so configs
    // still resolve on older card bundles (and as the in-card fallback).
    cards.distance = {
      type: "custom:apollo-radar-distance-card",
      device_id: dev.deviceId,
      device_base_name: dev.base,
      title: `${label} Distances`,
      ...(distanceUnit ? { distance_unit: distanceUnit } : {}),
    };
    cards.gateEnergy = {
      type: "custom:apollo-radar-gate-energy-card",
      device_id: dev.deviceId,
      device_base_name: dev.base,
      title: `${label} Gate Energy`,
    };
    cards.moveThr = moveThr;
    cards.stillThr = stillThr;
    cards.gateNote = moveThr || stillThr ? noteCard(profile.gateTip) : undefined;
    cards.occupancy = entitiesCard(
      `${label} Target / Occupancy`,
      presentRows(hass, occupancyRows(m))
    );
    cards.history = historyRows.length
      ? {
          type: "history-graph",
          title: `${label} Occupancy History`,
          hours_to_show: 1,
          entities: historyRows,
        }
      : undefined;
  }

  // LD2450 zone map (R-PRO-1 / MTR-1). Only labelled when it shares a tab with
  // tuning cards (R-PRO-1) — a thin native section heading, so it's clear the
  // LD2450 is a separate radar. Zone-only devices (MTR-1) get no header: the
  // card is the whole tab.
  if (dev.ld2450) {
    cards.zoneHeader = dev.profile
      ? { type: "heading", heading: "Zone Map" }
      : undefined;
    cards.zoneMap = zoneMapCard(dev.deviceId, dev.name);
  }

  return cards;
}

/** Flat card list for a device (used by the view strategy / tests). */
export function buildDeviceCards(
  hass: HomeAssistant,
  dev: RadarDevice,
  distanceUnit?: string,
  calibration?: CalibrationOptions
): Record<string, any>[] {
  const c = cardMap(hass, dev, distanceUnit, calibration);
  return [
    c.help,
    c.calibrate,
    c.controls,
    c.range,
    c.rangeNote,
    c.zone,
    c.distance,
    c.gateEnergy,
    c.moveThr,
    c.stillThr,
    c.gateNote,
    c.occupancy,
    c.history,
    c.zoneHeader,
    c.zoneMap,
  ].filter(Boolean) as Record<string, any>[];
}

/** Sections for one device, grouped into the reference column layout. The
 *  Detection Range card sits under the distance chart, a help/wiki card on top. */
export function buildDeviceSections(
  hass: HomeAssistant,
  dev: RadarDevice,
  distanceUnit?: string,
  calibration?: CalibrationOptions
): Record<string, any>[] {
  const c = cardMap(hass, dev, distanceUnit, calibration);
  const columns: (Record<string, any> | undefined)[][] = [];

  // Gate-radar tuning columns: calibrate+help+controls | distance+config |
  // gate-energy+move | history+still. LD2412 has no Zone Config, so column 1
  // is short; put occupancy there instead of column 2 to balance it.
  if (dev.profile) {
    const col1 = [c.calibrate, c.help, c.controls, c.zone];
    const col2: (Record<string, any> | undefined)[] = [
      c.distance,
      c.range,
      c.rangeNote,
    ];
    (c.zone ? col2 : col1).push(c.occupancy);
    columns.push(
      col1,
      col2,
      [c.gateEnergy, c.moveThr, c.gateNote],
      [c.history, c.stillThr]
    );
  }

  // A zone-only or undetectable device has no tuning column to carry the help
  // card, so it gets its own section only when it has something to say (the
  // offline note, or that nothing is detectable). A live MTR-1 stays just the
  // zone map.
  if (!dev.profile && (!dev.online || !c.zoneMap)) {
    columns.push([c.help]);
  }

  // LD2450 zone map gets its own column. On a shared tab (R-PRO-1) a thin
  // heading precedes it; on a zone-only device (MTR-1) it's just the card —
  // the tab title already names the device.
  if (c.zoneMap) {
    columns.push([c.zoneHeader, c.zoneMap]);
  }

  return columns
    .map((col) => col.filter(Boolean) as Record<string, any>[])
    .filter((col) => col.length > 0)
    .map((cards) => ({ type: "grid", cards }));
}

/** One full view (a tab) for a single device. */
export function deviceView(
  hass: HomeAssistant,
  dev: RadarDevice,
  distanceUnit?: string,
  path: string = dev.base,
  calibration?: CalibrationOptions
): Record<string, any> {
  // TODO(REVIEW_REPORT.md X36): no max_columns, so an R-PRO-1's five sections wrap the Zone
  // Map to a second row (HA default is 4); choose max_columns 5, a column_span, or accept it.
  return {
    title: dev.name,
    path,
    type: "sections",
    sections: buildDeviceSections(hass, dev, distanceUnit, calibration),
  };
}

/** One view (tab) per detected device — the dashboard strategy output.
 *
 *  View paths must be unique: Home Assistant opens the first view matching the
 *  URL, so two tabs on one path show the same device and the other looks
 *  missing. Two radars renamed to the same name in HA (with "rename entity
 *  ids" ticked) get bases `office` and `office` again, because the `_2` dedup
 *  tail is stripped with the suffix. The second such tab gets the device id
 *  appended. */
export function generateViews(
  hass: HomeAssistant,
  config: StrategyConfig
): Record<string, any>[] {
  const used = new Set<string>();
  return strategyDevices(hass, config).map((d) => {
    // TODO(REVIEW_REPORT.md X33): the bare path goes to whichever same-base device hass.devices
    // lists first; if adopted, sort colliders by deviceId (or suffix all) with an order test.
    let path = d.base;
    if (used.has(path)) path = `${d.base}_${d.deviceId}`;
    used.add(path);
    return deviceView(hass, d, config.distance_unit, path, config.calibration);
  });
}

/** All device sections in a single view — used by the view strategy. */
export function generateSections(
  hass: HomeAssistant,
  config: StrategyConfig
): Record<string, any>[] {
  // TODO(REVIEW_REPORT.md X38): several devices run together in one grid with no separator;
  // document the view strategy as single-device, or head each device when more than one.
  return strategyDevices(hass, config).flatMap((d) =>
    buildDeviceSections(hass, d, config.distance_unit, config.calibration)
  );
}

/** Flat card list across the targeted devices — used by the section strategy,
 *  which must return exactly one grid section. */
export function generateCards(
  hass: HomeAssistant,
  config: StrategyConfig
): Record<string, any>[] {
  return strategyDevices(hass, config).flatMap((d) =>
    buildDeviceCards(hass, d, config.distance_unit, config.calibration)
  );
}
