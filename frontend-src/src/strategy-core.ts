import type { CalibrationOptions, EntityMap, HassEntity, HomeAssistant } from "./types";
import {
  baseNameFromDevice,
  detectProfileFromEntities,
  deviceInfoEntities,
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
import { parseGateSizeMeters } from "./charts/geometry";
import {
  aboutDistance,
  controlRows,
  gateName,
  zoneConfigRows,
  moveThresholdRows,
  stillThresholdRows,
  occupancyRows,
  rangeRows,
  presentRows,
  type LengthUnit,
  type Row,
} from "./panels/entity-rows";
import { deviceRows, type DeviceRestart } from "./panels/device-rows";
import { historyEntities, ld2450HistoryEntities, type HistoryRow } from "./panels/history";
import { gateCheckedIds } from "./cards/gate-setup-checks";

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

function entitiesCard(
  title: string,
  rows: Row[],
  options: Record<string, any> = {}
): Record<string, any> | undefined {
  if (rows.length === 0) return undefined;
  return {
    type: "entities",
    title,
    show_header_toggle: false,
    ...options,
    entities: rows.map(entityRow),
  };
}

/**
 * One entities card row. A row with `confirm` becomes HA's special button row,
 * whose tap action carries a confirmation, so Home Assistant asks the question
 * before it presses the button; a plain button entity row presses at once.
 */
function entityRow(r: Row): Record<string, any> {
  if (!r.confirm) return { entity: r.entity, name: r.name };
  return {
    type: "button",
    entity: r.entity,
    name: r.name,
    action_name: r.confirm.action,
    tap_action: {
      action: "perform-action",
      perform_action: "button.press",
      target: { entity_id: r.entity },
      confirmation: { text: r.confirm.text },
    },
  };
}

const OFFLINE_NOTE =
  "\n\n**Offline right now.** Its entities are unavailable, so the cards" +
  " below will fill in once it reconnects. If this radar was replaced or" +
  " reflashed under a new name, delete the old device in Home Assistant to" +
  " drop this tab.";

/** What the help card says beyond the device itself. */
interface HelpContext {
  /** One gate's depth in the user's unit, such as "about 0.75 m". */
  gateDepth: string;
  /** Whether the tab has the gate radar's Radar setup card to point at. */
  gateSetup: boolean;
  /** Whether the tab has the LD2450's Radar setup card to point at. */
  ld2450Setup: boolean;
  /** Whether the gate radar's presence sensor exists. An R PRO-1 built
   *  without the optional LD2412 has none to recommend. */
  gatePresence: boolean;
  /** Whether the device has any of the gate radar's entities. An R PRO-1
   *  built without the optional LD2412 keeps the LD2412 profile from its
   *  registry model, but has only the LD2450. */
  gateRadar: boolean;
}

function helpCard(dev: RadarDevice, ctx: HelpContext): Record<string, any> {
  const card = helpCardBody(dev, ctx);
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

/** A markdown link to the device's own page in Home Assistant, where every
 *  setting this dashboard leaves out lives. */
function deviceLink(dev: RadarDevice): string {
  const path = `/config/devices/device/${encodeURIComponent(dev.deviceId)}`;
  return `[All settings for this device →](${path})`;
}

function numbered(steps: string[]): string {
  return steps.map((step, i) => `${i + 1}. ${step}`).join("\n");
}

/** For automations on a tab with an LD2450 and no gate radar presence. */
const LD2450_AUTOMATIONS =
  "**In automations**, use a zone's presence sensor, or **LD2450 Presence** for" +
  " anywhere the radar sees.";

/** The gate radar's first steps. On a tab with two radars they name the chip. */
function gateSteps(p: RadarProfile, ctx: HelpContext, twoRadars: boolean): string[] {
  const it = twoRadars ? `the ${p.label}` : "it";
  const presence = twoRadars ? `${p.label} presence` : "presence";
  const setup = twoRadars ? `the ${p.label}'s Radar setup card` : "the Radar setup card";
  return [
    ...(ctx.gateSetup ? [`Fix anything ${setup} flags.`] : []),
    "Press **Calibrate with empty room** on the Auto-calibrate card and leave the room.",
    `Set how far ${it} should look: **${p.rangeLabels[0]} / ${p.rangeLabels[1]}** on the` +
      ` Detection Range card (each gate is ${ctx.gateDepth}).`,
    `Set how long ${presence} stays on after you stop moving: **Radar Timeout**, same card.`,
    "Walk the room and watch the Gate Energy chart. Raise a gate's threshold if it" +
      " triggers with nobody there, lower it if it misses you.",
  ];
}

function helpCardBody(dev: RadarDevice, ctx: HelpContext): Record<string, any> {
  const name = markdownText(dev.name);
  if (!dev.profile && !dev.ld2450) {
    // Forced (explicitly selected) device with nothing detectable — offline
    // and no registry model to go by.
    return {
      type: "markdown",
      content:
        `**${name}**: no radar data available right now.\n\n` +
        `The device looks offline (or exposes no recognizable radar ` +
        `entities). Its cards will appear here once it reports in.\n\n` +
        deviceLink(dev),
    };
  }
  // An LD2450 alone: an MTR-1, or an R PRO-1 built without the LD2412. A
  // new zone's sensor joins Zone presence only after a page reload.
  if (!dev.profile || (dev.ld2450 && !ctx.gateRadar)) {
    const steps = [
      ...(ctx.ld2450Setup ? ["Fix anything the Radar setup card flags."] : []),
      "Set **Cone rotation** (under Configure on the zone map) to match how the sensor is mounted.",
      "Draw a zone on the map, reload this page, then walk into the zone and watch it" +
        " turn on under Zone presence.",
    ];
    return {
      type: "markdown",
      content:
        `**${name}**, Apollo mmWave (LD2450 tracking radar).\n\n` +
        `Draw occupancy zones over the live target positions below.\n\n` +
        `**Start here**\n${numbered(steps)}\n\n` +
        `${LD2450_AUTOMATIONS}\n\n` +
        deviceLink(dev),
    };
  }
  const p = dev.profile;
  const links = `[Full tuning guide →](${p.wikiUrl}) · ${deviceLink(dev)}`;
  if (!dev.ld2450) {
    return {
      type: "markdown",
      content:
        `**${name}**, Apollo ${p.label} radar.\n\n` +
        `**Start here**\n${numbered(gateSteps(p, ctx, false))}\n\n` +
        links,
    };
  }
  // Two radars (R PRO-1): what each one is for, then both radars' steps, and
  // which presence sensor an automation should use.
  const setup = ctx.ld2450Setup ? "fix anything Radar setup flags above the zone map, " : "";
  const automations = ctx.gatePresence
    ? `**In automations**, use **${p.label} Presence** (Radar Target on this tab)` +
      " for the whole room, or a zone's presence sensor for one part of it."
    : LD2450_AUTOMATIONS;
  return {
    type: "markdown",
    content:
      `**${name}**, Apollo mmWave with two radars. The **${p.label}** senses people` +
      ` anywhere in range, even sitting still. The **LD2450** tracks where people are` +
      ` and drives the zone map.\n\n` +
      `**Start here**\n` +
      numbered([
        ...gateSteps(p, ctx, true),
        `For the LD2450, ${setup}set **Cone rotation** (under Configure on the zone map) to` +
          " match how the sensor is mounted, then draw a zone and walk into it.",
      ]) +
      `\n\n${automations}\n\n` +
      links,
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

/** Under the LD2450 Controls card: what its Radar Timeout holds, and what it
 *  does not. Drawn zones are evaluated from the live X/Y with no hold. */
export const LD2450_TIMEOUT_NOTE =
  "💡 **Radar Timeout** is how long LD2450 Presence stays on after the radar last" +
  " sees someone. It does not hold the zones you draw: a zone turns off as soon as" +
  " nobody is in it.";

/**
 * Under the LD2410 Zone Config card. The boxes are template numbers in cm, and
 * Home Assistant converts no number entity's unit but temperature, so they
 * stay cm on a US customary system too. `anyZone` adds the automation advice
 * only when the any-zone sensor exists.
 */
export function zoneConfigNote(unit: LengthUnit, anyZone: boolean): string {
  return (
    `💡 The boxes are in cm${unit === "ft" ? " (100 cm is about 3.3 ft)" : ""}.` +
    " The zones sit back to back: Zone 1 runs from Start Zone 1 to End Zone 1," +
    " Zone 2 from there to End Zone 2, and Zone 3 from there to End Zone 3." +
    (anyZone
      ? " In automations, use **Any zone**: it is on while someone is in any of the" +
        " three zones, so it ignores people past End Zone 3."
      : "")
  );
}

export const DEVICE_TITLE = "Device";
/** Below this signal (dBm) the Device card shows the weak Wi-Fi note. */
export const WEAK_WIFI_DBM = -75;
export const WEAK_WIFI_NOTE =
  "**Weak Wi-Fi.** The signal is below -75 dBm, so presence updates can lag or" +
  " drop out. Move the device or your Wi-Fi router closer, or add an access point.";
export const SUPPORT_FILE_NOTE =
  "**Download a support file** for Apollo support: open" +
  " [Apollo mmWave](/config/integrations/integration/apollo_mmwave), then pick" +
  " **Download diagnostics** from the three dots menu.";

/** The whole-device restart, named for what it takes down with it.
 *  `gateRadar` is whether the device has any of the gate radar's entities. */
function deviceRestart(dev: RadarDevice, gateRadar: boolean): DeviceRestart {
  if (dev.profile && gateRadar && dev.ld2450) {
    return {
      name: "Restart device (both radars)",
      text:
        "Restart the whole device? Both radars stop, and the device is offline for a" +
        " short while before it reconnects.",
    };
  }
  if (dev.ld2450) {
    return {
      name: "Restart device (also restarts the radar)",
      text:
        "Restart the whole device? The radar restarts with it, and the device is" +
        " offline for a short while before it reconnects.",
    };
  }
  return {
    name: "Restart device",
    text: "Restart the whole device? It is offline for a short while before it reconnects.",
  };
}

/**
 * The Device card, last on every tab: versions, the update entity, the
 * restart (which asks first), a weak Wi-Fi note and where to get help.
 *
 * The note is a native conditional card, so it follows the live signal with
 * no dashboard regeneration and stays hidden while the device is offline (an
 * "unavailable" state is not below anything).
 */
function deviceCard(
  hass: HomeAssistant,
  dev: RadarDevice,
  gateRadar: boolean
): Record<string, any> {
  const d = deviceInfoEntities(hass, dev.deviceId);
  const restart = deviceRestart(dev, gateRadar);
  const rows = entitiesCard(DEVICE_TITLE, presentRows(hass, deviceRows(d, restart)));
  const cards: Record<string, any>[] = rows ? [rows] : [];
  if (exists(hass, d.rssi)) {
    cards.push({
      type: "conditional",
      conditions: [{ condition: "numeric_state", entity: d.rssi, below: WEAK_WIFI_DBM }],
      card: { type: "markdown", content: WEAK_WIFI_NOTE },
    });
  }
  cards.push({
    type: "markdown",
    ...(rows ? {} : { title: DEVICE_TITLE }),
    content: `${deviceLink(dev)}\n\n${SUPPORT_FILE_NOTE}`,
  });
  return cards.length === 1 ? cards[0] : { type: "vertical-stack", cards };
}

/** Feet on a US customary system, meters otherwise. */
function lengthUnit(hass: HomeAssistant): LengthUnit {
  return hass.config?.unit_system?.length === "mi" ? "ft" : "m";
}

/** The chips' stock gate depth. The gate size control ships disabled. */
const DEFAULT_GATE_SIZE_M = 0.75;

/** One gate's depth in meters: the gate size control's value when the user
 *  enabled it, otherwise the stock depth. */
function gateSizeMeters(hass: HomeAssistant, m: EntityMap): number {
  const size = parseGateSizeMeters(m.gate_size ? hass.states[m.gate_size]?.state : undefined);
  return size !== undefined && size > 0 ? size : DEFAULT_GATE_SIZE_M;
}

/**
 * This integration's zone presence sensors for the radar, one per drawn zone,
 * so a user can walk into a zone and watch it turn on. The rows carry no
 * name: HA shows each sensor's own name, which follows a zone rename.
 *
 * Drawing or deleting a zone does not regenerate the dashboard (that would
 * rebuild the zone map mid-edit, see `shouldRegenerate`), so the rows are the
 * zones there were when the page loaded. A new zone's sensor shows after the
 * next page load; only the empty card says so, since with zones listed the
 * extra line is noise. A deleted zone's sensor leaves `hass.states`, and HA
 * draws a row for a missing entity as an "Entity not available" warning, right
 * beside the map the zone was just deleted on. So each row is a conditional
 * row that hides itself once its sensor is gone: a condition reads a missing
 * entity as "unavailable", and these sensors never are otherwise.
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
    // Colored while occupied, so a zone turning on is easy to spot. The
    // conditional row builds its row from `row` alone, so the row carries it
    // too.
    state_color: true,
    entities: ids.map((entity) => ({
      type: "conditional",
      conditions: [{ condition: "state", entity, state_not: "unavailable" }],
      row: { entity, state_color: true },
    })),
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
  /** The gate radar's "Radar setup" card, under the help card on every
   *  gate-radar tab. */
  gateSetup?: Record<string, any>;
  /** The auto-calibrate card, right below it. */
  calibrate?: Record<string, any>;
  controls?: Record<string, any>;
  range?: Record<string, any>;
  rangeNote?: Record<string, any>;
  zone?: Record<string, any>;
  zoneNote?: Record<string, any>;
  distance?: Record<string, any>;
  gateEnergy?: Record<string, any>;
  moveThr?: Record<string, any>;
  stillThr?: Record<string, any>;
  gateNote?: Record<string, any>;
  occupancy?: Record<string, any>;
  /** Every radar's presence on the tab, and the drawn zones. */
  history?: Record<string, any>;
  // LD2450 zone-mapping (R-PRO-1 / MTR-1).
  zoneHeader?: Record<string, any>;
  /** The "Radar setup" card, right above the zone map. */
  ld2450Setup?: Record<string, any>;
  zoneMap?: Record<string, any>;
  zonePresence?: Record<string, any>;
  ld2450Live?: Record<string, any>;
  ld2450Controls?: Record<string, any>;
  /** What the LD2450's Radar Timeout holds. */
  ld2450ControlsNote?: Record<string, any>;
  /** Shown only while Zone Type is not Disabled (a conditional card). */
  builtInZones?: Record<string, any>;
  /** Versions, update, restart and support, at the bottom of every tab. */
  device: Record<string, any>;
}

/** A history graph of `rows` over the last day, so an overnight false
 *  trigger or dropout is still on it in the morning. */
function historyCard(title: string, rows: HistoryRow[]): Record<string, any> | undefined {
  if (rows.length === 0) return undefined;
  return { type: "history-graph", title, hours_to_show: 24, entities: rows };
}

function cardMap(
  hass: HomeAssistant,
  dev: RadarDevice,
  distanceUnit?: string,
  calibration?: CalibrationOptions
): DeviceCards {
  const unit = lengthUnit(hass);
  let gateSizeM = DEFAULT_GATE_SIZE_M;
  let gatePresence = false;
  let gateRadar = false;
  const cards: Partial<DeviceCards> = {};
  // On a tab with two radars (R PRO-1) each history line names its chip.
  const twoRadars = !!dev.profile && dev.ld2450;
  const historyRows: HistoryRow[] = [];

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
    // Online or not, like the calibrate card: it renders its own offline
    // line. Left out when none of the settings it checks exists (an R PRO-1
    // built without the LD2412).
    cards.gateSetup = gateCheckedIds(m, profile).some((id) => exists(hass, id))
      ? { type: "custom:apollo-radar-setup-card", device_id: dev.deviceId, radar: "gate" }
      : undefined;
    gateSizeM = gateSizeMeters(hass, m);
    gatePresence = exists(hass, m.radar_target);
    // The help card and the Device card's restart describe the radars the
    // device has, not the ones its registry model can carry.
    gateRadar = !!cards.gateSetup || gatePresence;
    // Each threshold row says how far out its gate reaches.
    const gate = (n: number) => gateName(n, gateSizeM, unit);
    historyRows.push(...historyEntities(m, twoRadars ? label : undefined));
    const range = entitiesCard(
      `${label} Detection Range`,
      presentRows(hass, rangeRows(m, profile.rangeLabels, profile.gateSizeLabel))
    );
    const moveThr = entitiesCard(
      `${label} Move Thresholds`,
      presentRows(hass, moveThresholdRows(m, gate))
    );
    const stillThr = entitiesCard(
      `${label} Still Thresholds`,
      presentRows(hass, stillThresholdRows(m, gate))
    );
    cards.controls = entitiesCard(
      `${label} Controls`,
      presentRows(hass, controlRows(m, label))
    );
    cards.range = range;
    // The note gives the same gate depth as the help card and the G rows.
    cards.rangeNote = range
      ? noteCard(profile.rangeTip(aboutDistance(gateSizeM, unit)))
      : undefined;
    cards.zone = entitiesCard(
      `${label} Zone Config`,
      presentRows(hass, zoneConfigRows(m))
    );
    cards.zoneNote = cards.zone
      ? noteCard(zoneConfigNote(unit, exists(hass, m.zone_occupancy)))
      : undefined;
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
    // Colored while on, so a user walking the room sees detection flip.
    cards.occupancy = entitiesCard(
      `${label} Target / Occupancy`,
      presentRows(hass, occupancyRows(m)),
      { state_color: true }
    );
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
    cards.ld2450Live = entitiesCard("LD2450 Live", presentRows(hass, ld2450LiveRows(l)), {
      state_color: true,
    });
    cards.ld2450Controls = entitiesCard(
      "LD2450 Controls",
      presentRows(hass, ld2450ControlRows(l))
    );
    cards.ld2450ControlsNote = exists(hass, l.timeout) ? noteCard(LD2450_TIMEOUT_NOTE) : undefined;
    cards.builtInZones = builtInZonesCard(hass, l);
    historyRows.push(
      ...ld2450HistoryEntities(
        l,
        zonePresenceSensors(hass, dev.deviceId),
        twoRadars ? "LD2450" : undefined
      )
    );
  }

  // One graph for every radar on the tab. Named for the chip on a gate radar
  // alone, as the tab's other gate-radar cards are.
  cards.history = historyCard(
    dev.profile && !dev.ld2450 ? `${dev.profile.label} Occupancy History` : "Occupancy History",
    presentRows(hass, historyRows)
  );
  cards.help = helpCard(dev, {
    gateDepth: aboutDistance(gateSizeM, unit),
    gateSetup: !!cards.gateSetup,
    ld2450Setup: !!cards.ld2450Setup,
    gatePresence,
    gateRadar,
  });
  cards.device = deviceCard(hass, dev, gateRadar);
  return cards as DeviceCards;
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
    c.gateSetup,
    c.calibrate,
    c.controls,
    c.range,
    c.rangeNote,
    c.zone,
    c.zoneNote,
    c.distance,
    c.gateEnergy,
    c.moveThr,
    c.stillThr,
    c.gateNote,
    c.occupancy,
    c.zoneHeader,
    c.ld2450Setup,
    c.zoneMap,
    c.zonePresence,
    c.ld2450Live,
    c.history,
    c.ld2450Controls,
    c.ld2450ControlsNote,
    c.builtInZones,
    c.device,
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
  type Column = (Record<string, any> | undefined)[];

  // LD2450 zone map gets its own column, the setup card right above it. On a
  // shared tab (R-PRO-1) a thin heading precedes them and the LD2450's status
  // and settings fill one more column next to the map; on a zone-only device
  // (MTR-1) the tab title already names the device, the help card leads as on
  // every tab, and the LD2450's cards split into two columns so each reads at
  // a glance.
  const zoneColumns: Column[] = [];
  if (c.zoneMap) {
    if (dev.profile) {
      zoneColumns.push(
        [c.zoneHeader, c.ld2450Setup, c.zoneMap],
        [c.zonePresence, c.ld2450Live, c.ld2450Controls, c.ld2450ControlsNote, c.builtInZones]
      );
    } else {
      zoneColumns.push(
        [c.help, c.ld2450Setup, c.zoneMap],
        [c.zonePresence, c.ld2450Live, c.history],
        [c.ld2450Controls, c.ld2450ControlsNote, c.builtInZones]
      );
    }
  }

  const columns: Column[] = [];
  // Gate-radar tuning columns: help+setup+calibrate+controls |
  // distance+config | gate-energy+move | history+still. LD2412 has no Zone
  // Config, so column 1 is short; put occupancy there instead of column 2 to
  // balance it.
  //
  // Section order is also the phone's reading order. The help card leads, so
  // its steps come before the cards they point at. On a tab with both radars
  // (R-PRO-1) the zone map and the LD2450's cards follow column 1, so a phone
  // reaches them before the 28 LD2412 threshold rows.
  if (dev.profile) {
    const col1: Column = [c.help, c.gateSetup, c.calibrate, c.controls, c.zone, c.zoneNote];
    const col2: Column = [c.distance, c.range, c.rangeNote];
    (c.zone ? col2 : col1).push(c.occupancy);
    columns.push(
      col1,
      ...zoneColumns,
      col2,
      [c.gateEnergy, c.moveThr, c.gateNote],
      [c.history, c.stillThr]
    );
  } else if (c.zoneMap) {
    columns.push(...zoneColumns);
  } else {
    // A device with nothing detectable has only its help card to show.
    columns.push([c.help]);
  }

  const sections = columns
    .map((col) => col.filter(Boolean) as Record<string, any>[])
    .filter((col) => col.length > 0);
  // The Device card goes last on the tab: at the bottom of the last column.
  sections[sections.length - 1].push(c.device);
  return sections.map((cards) => ({ type: "grid", cards }));
}

/** One full view (a tab) for a single device. */
export function deviceView(
  hass: HomeAssistant,
  dev: RadarDevice,
  distanceUnit?: string,
  path: string = dev.base,
  calibration?: CalibrationOptions
): Record<string, any> {
  // TODO(REVIEW_REPORT.md X36): no max_columns, so an R-PRO-1's six sections wrap its gate
  // tuning to a second row (HA default is 4); choose max_columns 6, a column_span, or accept it.
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
