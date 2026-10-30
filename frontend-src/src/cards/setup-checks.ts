/**
 * What the "Radar setup" card checks on an LD2450, as pure functions of HA
 * state, so the card only renders and calls services.
 *
 * Two settings decide whether the zone map can show anyone. Zone Type is
 * handed straight to the radar chip: Detection reports only people inside the
 * chip's built-in zones (with all of them at 0 that is nobody, so the zone map
 * never gets a dot) and Filter reports everyone except people inside them.
 * The zone map replaces those zones, so Disabled is recommended. Multi Target
 * Tracking off tracks one person only. Apollo firmware never sets either, so
 * they are whatever the chip holds.
 *
 * Nothing here writes: each problem carries the one service call that fixes
 * it, and the card makes that call only when the user clicks its button.
 */

import type { HassEntity, HomeAssistant } from "../types";
import { builtInZoneNumberIds, ld2450Entities, type Ld2450Entities } from "../ld2450-entities";

export const ZONE_TYPE_DISABLED = "Disabled";

export const ALL_GOOD_LINE = "Radar settings look good.";
export const OFFLINE_LINE = "Radar is offline. Its settings are checked once it reconnects.";
export const WAITING_LINE = "Waiting for the radar to report its settings.";
/** Under a Multi Target Tracking warning while Zone Type is still unread. */
export const ZONE_TYPE_WAITING_LINE = "Waiting for the radar to report its Zone Type.";
export const NO_DEVICE_LINE =
  "Add device_id to this card's configuration to check the radar's settings.";
export const NOTHING_TO_CHECK_LINE =
  "This device has no Zone Type or Multi Target Tracking setting to check.";
export const RECOMMENDED_LABEL = "Use recommended settings";
export const RECOMMENDED_PROGRESS = "Applying recommended settings...";
export const SETTING_NOT_FOUND =
  "Home Assistant could not find this setting. Reload the page and try again.";

const DETECTION_LINE =
  "Zone Type is Detection. This radar only reports people inside its built-in zones.";
const DETECTION_EMPTY = "None are set, so it reports nobody and the zone map stays empty.";
const DETECTION_SET = "Anyone outside them is missing from the zone map.";
const DISABLED_HINT =
  "Zone Type should be Disabled. The zone map replaces the radar's built-in zones.";
const FILTER_LINE =
  "Zone Type is Filter. This radar ignores people inside its built-in zones." +
  " Disabled is recommended because the zone map replaces them.";
const MULTI_TARGET_LINE = "Multi Target Tracking is off. Only one person is tracked.";

export type SettingKey = "zone_type" | "multi_target_tracking";

/** The one service call that fixes a problem, and how the card names it. */
export interface SettingFix {
  domain: string;
  service: string;
  data: Record<string, any>;
  /** Button text, naming the setting and what it becomes. */
  label: string;
  /** The same change as a clause of the combined button's helper line. */
  clause: string;
  /** Shown while the call runs. */
  progress: string;
}

export interface SetupProblem {
  setting: SettingKey;
  /** The setting's display name, used in the error line. */
  name: string;
  entityId: string;
  /** "warning" when the zone map misses people, "note" for milder advice. */
  level: "warning" | "note";
  text: string;
  /** A second, quieter line under the text. */
  hint?: string;
  /** Undefined when the card cannot fix it from here. */
  fix?: SettingFix;
}

export type SetupStatus =
  | { kind: "no_device" }
  | { kind: "nothing_to_check" }
  | { kind: "offline" }
  /** Online, but no checked setting has a value yet ("unknown"), or Zone
   *  Type has none and nothing else needs fixing. */
  | { kind: "waiting" }
  /** `zoneTypeUnread`: the problems are all Multi Target Tracking's, and
   *  Zone Type, which can empty the map, has not been read yet. */
  | { kind: "checked"; problems: SetupProblem[]; zoneTypeUnread?: boolean };

/** Only "unavailable" or no state at all is offline, as in strategy-core. */
function isLive(state: HassEntity | undefined): state is HassEntity {
  return state !== undefined && state.state !== "unavailable";
}

/** Whether the radar has reported a value: live, and not "unknown". */
function isRead(state: HassEntity | undefined): state is HassEntity {
  return isLive(state) && state.state !== "unknown";
}

/** Whether every built-in zone corner reads 0, which with Zone Type Detection
 *  means the radar reports nobody. False when any corner is missing a number,
 *  so the card never claims "none are set" without reading them all. */
export function builtInZonesEmpty(hass: HomeAssistant, l: Ld2450Entities): boolean {
  const ids = builtInZoneNumberIds(l);
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const raw = hass.states[id]?.state;
    return raw !== undefined && raw.trim() !== "" && Number(raw) === 0;
  });
}

function zoneTypeProblem(hass: HomeAssistant, l: Ld2450Entities): SetupProblem | undefined {
  const entityId = l.zone_type;
  const state = entityId ? hass.states[entityId] : undefined;
  if (!entityId || !isLive(state)) return undefined;
  const value = state.state;
  if (value === ZONE_TYPE_DISABLED || value === "unknown") return undefined;
  // A select only accepts one of its own options; a firmware without
  // "Disabled" gets the explanation but no button.
  const options = state.attributes?.options;
  const fix: SettingFix | undefined =
    Array.isArray(options) && !options.includes(ZONE_TYPE_DISABLED)
      ? undefined
      : {
          domain: "select",
          service: "select_option",
          data: { entity_id: entityId, option: ZONE_TYPE_DISABLED },
          label: "Set Zone Type to Disabled",
          clause: "sets Zone Type to Disabled",
          progress: "Setting Zone Type to Disabled...",
        };
  const base = { setting: "zone_type" as const, name: "Zone Type", entityId, fix };
  if (value === "Detection") {
    const second = builtInZonesEmpty(hass, l) ? DETECTION_EMPTY : DETECTION_SET;
    return {
      ...base,
      level: "warning",
      text: `${DETECTION_LINE} ${second}`,
      hint: DISABLED_HINT,
    };
  }
  if (value === "Filter") return { ...base, level: "note", text: FILTER_LINE };
  // An option this card does not know: still not the recommended one.
  return {
    ...base,
    level: "note",
    text:
      `Zone Type is ${value}. Disabled is recommended because the zone map` +
      ` replaces the radar's built-in zones.`,
  };
}

function multiTargetProblem(hass: HomeAssistant, l: Ld2450Entities): SetupProblem | undefined {
  const entityId = l.multi_target_tracking;
  // Disabled by default on the R PRO-1, so usually absent; the radar's own
  // default is multi target, so there is nothing to say then.
  if (!entityId || hass.states[entityId]?.state !== "off") return undefined;
  return {
    setting: "multi_target_tracking",
    name: "Multi Target Tracking",
    entityId,
    level: "warning",
    text: MULTI_TARGET_LINE,
    fix: {
      domain: "switch",
      service: "turn_on",
      data: { entity_id: entityId },
      label: "Turn on Multi Target Tracking",
      clause: "turns on Multi Target Tracking",
      progress: "Turning on Multi Target Tracking...",
    },
  };
}

/** The card's state for one device, from live HA state. */
export function setupStatus(hass: HomeAssistant, deviceId: string | undefined): SetupStatus {
  if (!deviceId) return { kind: "no_device" };
  const l = ld2450Entities(hass, deviceId);
  const checked = [l.zone_type, l.multi_target_tracking].filter(
    (id): id is string => id !== undefined
  );
  if (checked.length === 0) return { kind: "nothing_to_check" };
  const states = checked.map((id) => hass.states[id]);
  if (!states.some(isLive)) return { kind: "offline" };
  // "Radar settings look good" must mean a value was read, not that none was.
  if (!states.some(isRead)) return { kind: "waiting" };
  const problems = [zoneTypeProblem(hass, l), multiTargetProblem(hass, l)].filter(
    (p): p is SetupProblem => p !== undefined
  );
  // Nor may it stand on Multi Target Tracking alone: Zone Type is the
  // setting that empties the map, and until the chip answers its query it
  // reads "unknown". With a Multi Target Tracking warning to show, the card
  // shows it and says it still waits for Zone Type.
  if (l.zone_type !== undefined && !isRead(hass.states[l.zone_type])) {
    return problems.length ? { kind: "checked", problems, zoneTypeUnread: true } : { kind: "waiting" };
  }
  return { kind: "checked", problems };
}

/** The entity ids whose state changes can change `setupStatus`. */
export function watchedSetupIds(hass: HomeAssistant, deviceId: string | undefined): string[] {
  if (!deviceId) return [];
  const l = ld2450Entities(hass, deviceId);
  return [l.zone_type, l.multi_target_tracking, ...builtInZoneNumberIds(l)].filter(
    (id): id is string => id !== undefined
  );
}

/** The helper line under "Use recommended settings": what it changes. */
export function recommendedLine(fixes: SettingFix[]): string {
  const text = fixes.map((f) => f.clause).join(" and ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
