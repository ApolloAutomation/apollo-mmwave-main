import type { CalibrationOptions, HassEntity, HomeAssistant } from "./types";
import {
  baseNameFromDevice,
  detectProfileFromEntities,
  entityMapFromDevice,
  exists,
} from "./entities";
import { entitiesForDevice } from "./entity-index";
import { hasLd2450Device, ld2450EntityIds, zoneMapCard } from "./ld2450";
import {
  LD2450_ZONES,
  ld2450Entities,
  zonePresenceSensors,
  type Ld2450Entities,
} from "./ld2450-entities";
import { builtInZoneRows, ld2450ControlRows, ld2450LiveRows } from "./panels/ld2450-rows";
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
  /** A single device to show. Takes precedence over `devices`: when both are
   *  set, only this device is rendered and `devices` is ignored. */
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

/**
 * Text, such as a device name, to show as typed inside a markdown card.
 * Home Assistant renders a markdown card's content as a template first, so
 * `{{`, `{%` or `{#` in a name would be evaluated, and `*`, `_`, `[` or a
 * backtick would change the formatting. A backslash before every ASCII
 * punctuation character covers both: markdown shows each one as typed, and
 * no `{` is followed by a template delimiter any more.
 */
export function markdownText(text: string): string {
  return text.replace(/[!-\/:-@\[-`{-~]/g, "\\$&");
}

function helpCardBody(dev: RadarDevice): Record<string, any> {
  const name = markdownText(dev.name);
  if (!dev.profile && !dev.ld2450) {
    // Forced (explicitly selected) device with nothing detectable — offline
    // and no registry model to go by.
    return {
      type: "markdown",
      content:
        `**${name}**: no radar data available right now.\n\n` +
        `The device looks offline (or exposes no recognizable radar ` +
        `entities). Its cards will appear here once it reports in.`,
    };
  }
  if (!dev.profile) {
    return {
      type: "markdown",
      content:
        `**${name}**, Apollo mmWave (LD2450 tracking radar).\n\n` +
        `Draw occupancy zones over the live target positions below.`,
    };
  }
  const p = dev.profile;
  return {
    type: "markdown",
    content:
      `**${name}**, Apollo ${p.label} radar.\n\n` +
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

export const ZONE_PRESENCE_TITLE = "Zone presence";
export const ZONE_PRESENCE_HINT =
  "Draw a zone on the map to get a presence sensor for it. Reload this page to see it here.";
export const BUILT_IN_ZONES_TITLE = "Radar's built-in zones";
export const BUILT_IN_ZONES_NOTE =
  "These are the radar chip's own zones, not the ones on the zone map." +
  " Zone Type Disabled is recommended, because the zone map replaces them.";

/**
 * This integration's zone presence sensors for the radar, one per drawn zone,
 * so a user can walk into a zone and watch it turn on. The rows carry no
 * name: HA shows each sensor's own name, which follows a zone rename.
 *
 * Drawing a zone does not regenerate the dashboard (that would rebuild the
 * zone map mid-edit, see `shouldRegenerate`), so a new zone's sensor shows
 * after the next page load. Only the empty card says so; with zones listed
 * the extra line is noise.
 */
function zonePresenceCard(hass: HomeAssistant, deviceId: string): Record<string, any> {
  const ids = zonePresenceSensors(hass, deviceId).filter((id) => exists(hass, id));
  if (ids.length === 0) {
    return { type: "markdown", title: ZONE_PRESENCE_TITLE, content: ZONE_PRESENCE_HINT };
  }
  return {
    type: "entities",
    title: ZONE_PRESENCE_TITLE,
    show_header_toggle: false,
    // Colored while occupied, so a zone turning on is easy to spot.
    state_color: true,
    entities: ids.map((entity) => ({ entity })),
  };
}

/**
 * The radar chip's own built-in zones, shown only while Zone Type is not
 * Disabled. A native conditional card reads the live state, so the card
 * appears the moment someone picks Detection or Filter and goes away again
 * on Disabled, without a dashboard regeneration. Offline ("unavailable") and
 * unreported ("unknown") hide it too: there is nothing to act on then.
 */
function builtInZonesCard(
  hass: HomeAssistant,
  l: Ld2450Entities
): Record<string, any> | undefined {
  if (!exists(hass, l.zone_type)) return undefined;
  const entities: Record<string, any>[] = [];
  for (let i = 0; i < LD2450_ZONES; i++) {
    const rows = presentRows(hass, builtInZoneRows(l, i));
    if (rows.length === 0) continue;
    entities.push(
      { type: "section", label: `Zone ${i + 1}` },
      ...rows.map((r) => ({ entity: r.entity, name: r.name }))
    );
  }
  if (entities.length === 0) return undefined;
  return {
    type: "conditional",
    conditions: [
      {
        condition: "state",
        entity: l.zone_type,
        state_not: ["Disabled", "unavailable", "unknown"],
      },
    ],
    card: {
      type: "vertical-stack",
      cards: [
        { type: "markdown", title: BUILT_IN_ZONES_TITLE, content: BUILT_IN_ZONES_NOTE },
        { type: "entities", show_header_toggle: false, entities },
      ],
    },
  };
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
  /** The "Radar setup" card, right above the zone map. */
  ld2450Setup?: Record<string, any>;
  zoneMap?: Record<string, any>;
  zonePresence?: Record<string, any>;
  ld2450Live?: Record<string, any>;
  ld2450Controls?: Record<string, any>;
  /** Shown only while Zone Type is not Disabled (a conditional card). */
  builtInZones?: Record<string, any>;
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
  // tuning cards (R-PRO-1): a thin native section heading, so it's clear the
  // LD2450 is a separate radar. Zone-only devices (MTR-1) get no header: every
  // card on the tab is the LD2450's.
  if (dev.ld2450) {
    cards.zoneHeader = dev.profile
      ? { type: "heading", heading: "Zone Map" }
      : undefined;
    // Everything a user needs to get a dot on the map sits beside it. The
    // ids come from this device's own entities only: the MTR-1's bare names
    // ("Timeout", "Zone Type") would match any device's.
    const l = ld2450Entities(hass, dev.deviceId);
    // Online or not, like the calibrate card: it renders its own offline
    // line. Left out when neither setting it checks exists on the device.
    cards.ld2450Setup =
      exists(hass, l.zone_type) || exists(hass, l.multi_target_tracking)
        ? { type: "custom:apollo-radar-setup-card", device_id: dev.deviceId }
        : undefined;
    cards.zoneMap = zoneMapCard(dev.deviceId, dev.name);
    cards.zonePresence = zonePresenceCard(hass, dev.deviceId);
    const live = entitiesCard("LD2450 Live", presentRows(hass, ld2450LiveRows(l)));
    cards.ld2450Live = live ? { ...live, state_color: true } : undefined;
    cards.ld2450Controls = entitiesCard(
      "LD2450 Controls",
      presentRows(hass, ld2450ControlRows(l))
    );
    cards.builtInZones = builtInZonesCard(hass, l);
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
    c.ld2450Setup,
    c.zoneMap,
    c.zonePresence,
    c.ld2450Live,
    c.ld2450Controls,
    c.builtInZones,
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
  // offline note, or that nothing is detectable). A live MTR-1 starts with
  // its setup card and zone map instead.
  if (!dev.profile && (!dev.online || !c.zoneMap)) {
    columns.push([c.help]);
  }

  // LD2450 zone map gets its own column, the setup card right above it. On a
  // shared tab (R-PRO-1) a thin heading precedes them and the LD2450's status
  // and settings fill one more column next to the map; on a zone-only device
  // (MTR-1) the tab title already names the device, and those cards split
  // into two columns so each reads at a glance. Section order is also the
  // phone's reading order, so the setup card and the map come first.
  if (c.zoneMap) {
    columns.push([c.zoneHeader, c.ld2450Setup, c.zoneMap]);
    if (dev.profile) {
      columns.push([c.zonePresence, c.ld2450Live, c.ld2450Controls, c.builtInZones]);
    } else {
      columns.push([c.zonePresence, c.ld2450Live], [c.ld2450Controls, c.builtInZones]);
    }
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
  // TODO(REVIEW_REPORT.md X36): no max_columns, so an R-PRO-1's six sections wrap the Zone
  // Map to a second row (HA default is 4); choose max_columns 6, a column_span, or accept it.
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
