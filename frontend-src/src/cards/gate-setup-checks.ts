/**
 * What the "Radar setup" card checks on a gate radar (the LD2410 on an MSR-1
 * or MSR-2, the LD2412 on an R PRO-1), as pure functions of HA state and the
 * device's resolved entity map. The results take the LD2450 checks' shape
 * (`setup-checks.ts`), so one card renders and applies both.
 *
 * It looks for what a user cannot spot on their own:
 * - Radar Engineering Mode left on. The firmware then publishes every gate's
 *   move and still energy about once a second, and the recorder keeps each
 *   one. Not while a calibration job runs: the job owns the switch then, and
 *   turning it off would fail the job. Until the card knows (`JobActivity`
 *   "unknown") the line is held back.
 * - Settings the radar has not reported: a threshold, a range gate or the
 *   timeout reads "unknown", so its row is blank, and an unread threshold
 *   stops calibration from starting. The query params button only asks the
 *   radar to send them.
 * - LD2410 distance zones that can never turn on. The firmware counts Zone 1
 *   from Start Zone 1 up to End Zone 1, and each later zone from past the
 *   previous end up to its own, so an end at or below the one before leaves
 *   that zone empty. A zone past the radar's reach (the larger max gate times
 *   the gate size) is empty too, or partly.
 * - An LD2412 Min Gate at or above its Max Gate.
 *
 * Nothing here writes. The zone and range problems are explained only: new
 * bounds are the user's call, so the card never reorders or sets them.
 */

import type { EntityMap, HomeAssistant } from "../types";
import type { RadarProfile } from "../profiles";
import type { JobActivity } from "../calibration/job-watch";
import { READING_SETTINGS, READ_SETTINGS_LABEL, READ_SETTINGS_WAIT_MS } from "../calibration/model";
import { numState, uomOf } from "../charts/entity-read";
import { parseGateSizeMeters } from "../charts/geometry";
import { convert, type Uom } from "../charts/unit-convert";
import { isLive, isRead, type SetupProblem, type SetupStatus } from "./setup-checks";

export const GATE_NOTHING_TO_CHECK_LINE = "This device has no gate radar settings to check.";
/** Radar Engineering Mode is on and the calibration feed has not answered. */
export const CHECKING_LINE = "Checking the radar's settings...";
export const ENGINEERING_OFF_LABEL = "Turn off Radar Engineering Mode";
/** After "Read settings from the radar", when the values still read unknown. */
export const NO_ANSWER_LINE = "The radar has not sent its settings yet. Try again in a moment.";

const ENGINEERING_LINE =
  "Radar Engineering Mode is on, so every gate's energy is saved to the database about once a second.";
const ENGINEERING_HINT =
  "Turn it off when you finish tuning. The Gate Energy chart needs it only while you watch it.";
const UNREAD_HINT = "This only asks the radar to send them. Nothing on the radar changes.";
const NO_QUERY_BUTTON_HINT =
  "Press Query Params on the radar's device page to make it send them.";
const ZONE_ORDER_HINT =
  "Each zone starts where the one before it ends. Change the distances on the Zone Config card.";

/** The Zone Config card's row names for zone_1_start and end_zone_1..3. */
const ZONE_BOUND_LABELS = ["Start Zone 1", "End Zone 1", "End Zone 2", "End Zone 3"];
/** The distance chart's gate size when the gate size select is off (it is
 *  disabled by default on every model). */
const DEFAULT_GATE_SIZE_M = 0.75;

/** A number for copy: at most two decimals, no trailing zeros. */
function num(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** "a", "a and b", "a, b, and c". */
function listText(parts: string[]): string {
  if (parts.length < 3) return parts.join(" and ");
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function thresholdIds(m: EntityMap): string[] {
  return [...m.move_threshold, ...m.still_threshold].filter((id): id is string => !!id);
}

function zoneIds(m: EntityMap): (string | undefined)[] {
  return [m.zone_1_start, m.end_zone_1, m.end_zone_2, m.end_zone_3];
}

/** The entities whose states decide the checks (and "offline"). The strategy
 *  leaves the card off a tab where none of them exists. */
export function gateCheckedIds(m: EntityMap, profile: RadarProfile): string[] {
  return [
    m.engineering_mode,
    m.query_params,
    ...thresholdIds(m),
    m.max_move_distance,
    m.max_still_distance,
    m.radar_timeout,
    ...(profile.key === "ld2410" ? zoneIds(m) : []),
  ].filter((id): id is string => !!id);
}

function engineeringProblem(
  hass: HomeAssistant,
  m: EntityMap,
  job: JobActivity
): SetupProblem | undefined {
  const entityId = m.engineering_mode;
  if (!entityId || job !== "idle" || hass.states[entityId]?.state !== "on") return undefined;
  return {
    setting: "engineering_mode",
    name: "Radar Engineering Mode",
    entityId,
    level: "note",
    text: ENGINEERING_LINE,
    hint: ENGINEERING_HINT,
    fix: {
      domain: "switch",
      service: "turn_off",
      data: { entity_id: entityId },
      label: ENGINEERING_OFF_LABEL,
      clause: "turns off Radar Engineering Mode",
      progress: "Turning off Radar Engineering Mode...",
      failure: "Could not turn Radar Engineering Mode off",
    },
  };
}

function unreadProblem(hass: HomeAssistant, m: EntityMap): SetupProblem | undefined {
  const unknown = (id: string | undefined): id is string =>
    !!id && hass.states[id]?.state === "unknown";
  const groups: [string, (string | undefined)[]][] = [
    ["gate thresholds", thresholdIds(m)],
    ["detection range", [m.max_move_distance, m.max_still_distance]],
    ["timeout", [m.radar_timeout]],
  ];
  const parts = groups.filter(([, ids]) => ids.some(unknown)).map(([part]) => part);
  if (parts.length === 0) return undefined;
  const entityId = groups.flatMap(([, ids]) => ids).find(unknown)!;
  // The press needs the button live; without it the card says where it is.
  const button = m.query_params && isLive(hass.states[m.query_params]) ? m.query_params : undefined;
  return {
    setting: "settings_unread",
    name: "the radar's settings",
    entityId,
    level: "note",
    text: `The radar has not reported its ${listText(parts)} yet, so those settings are blank.`,
    hint: button ? UNREAD_HINT : NO_QUERY_BUTTON_HINT,
    fix: button
      ? {
          domain: "button",
          service: "press",
          data: { entity_id: button },
          label: READ_SETTINGS_LABEL,
          clause: "asks the radar for its settings",
          progress: READING_SETTINGS,
          failure: "Could not ask the radar for its settings",
          settleMs: READ_SETTINGS_WAIT_MS,
          noAnswer: NO_ANSWER_LINE,
        }
      : undefined,
  };
}

interface ZoneBound {
  entityId: string;
  label: string;
  cm: number;
  /** The value as its box shows it, with the box's unit ("150 cm"). */
  text: string;
  unit: Uom;
}

/** Start Zone 1 and End Zone 1..3, undefined where a box has no number. The
 *  firmware's boxes are in cm; a box with another length unit is converted. */
function zoneBounds(hass: HomeAssistant, m: EntityMap): (ZoneBound | undefined)[] {
  return zoneIds(m).map((entityId, i) => {
    const value = numState(hass, entityId);
    if (!entityId || value === undefined) return undefined;
    const unit = uomOf(hass, entityId, "cm");
    return {
      entityId,
      label: ZONE_BOUND_LABELS[i],
      cm: convert(value, unit, "cm"),
      text: `${num(value)} ${unit}`,
      unit,
    };
  });
}

/** How far the LD2410 reports a target, in cm: the larger max gate times
 *  the gate size, as on the distance chart. Undefined until a max gate reads. */
function reachCm(hass: HomeAssistant, m: EntityMap): number | undefined {
  const gates = [numState(hass, m.max_move_distance), numState(hass, m.max_still_distance)].filter(
    (g): g is number => g !== undefined
  );
  if (gates.length === 0) return undefined;
  const size = parseGateSizeMeters(m.gate_size ? hass.states[m.gate_size]?.state : undefined);
  const gateSizeM = size !== undefined && size > 0 ? size : DEFAULT_GATE_SIZE_M;
  return Math.max(...gates) * gateSizeM * 100;
}

/** The zones whose bounds are out of order, and those past the radar's reach. */
function ld2410ZoneProblems(
  hass: HomeAssistant,
  m: EntityMap,
  profile: RadarProfile
): SetupProblem[] {
  const b = zoneBounds(hass, m);
  const problems: SetupProblem[] = [];
  // Zone n runs from b[n - 1] to b[n]: inclusive for Zone 1, past the
  // previous end for Zones 2 and 3 (the firmware's zone lambdas).
  const dead = new Set<number>();
  const order: { entityId: string; line: string }[] = [];
  for (let n = 1; n <= 3; n++) {
    const lo = b[n - 1];
    const hi = b[n];
    if (!lo || !hi) continue;
    const empty = n === 1 ? lo.cm > hi.cm : hi.cm <= lo.cm;
    if (!empty) continue;
    dead.add(n);
    order.push({
      entityId: hi.entityId,
      line:
        n === 1
          ? `Zone 1 can never turn on. ${lo.label} (${lo.text}) must be smaller than ${hi.label} (${hi.text}).`
          : `Zone ${n} can never turn on. ${hi.label} (${hi.text}) must be larger than ${lo.label} (${lo.text}).`,
    });
  }
  if (order.length) {
    problems.push({
      setting: "zone_order",
      name: "the zone distances",
      entityId: order[0].entityId,
      level: "warning",
      text: order.map((o) => o.line).join(" "),
      hint: ZONE_ORDER_HINT,
    });
  }

  const reach = reachCm(hass, m);
  if (reach === undefined) return problems;
  const reachText = (unit: Uom) => `about ${num(convert(reach, "cm", unit))} ${unit}`;
  const past: { entityId: string; line: string; never: boolean }[] = [];
  for (let n = 1; n <= 3; n++) {
    const lo = b[n - 1];
    const hi = b[n];
    if (dead.has(n) || !hi) continue;
    if (lo && lo.cm >= reach) {
      past.push({
        entityId: lo.entityId,
        line: `Zone ${n} starts at ${lo.text}, past the radar's reach of ${reachText(lo.unit)}, so it can never turn on.`,
        never: true,
      });
    } else if (hi.cm > reach) {
      past.push({
        entityId: hi.entityId,
        line: `Zone ${n} ends at ${hi.text}, past the radar's reach of ${reachText(hi.unit)}.`,
        never: false,
      });
    }
  }
  if (past.length) {
    const [maxMove, maxStill] = profile.rangeLabels;
    problems.push({
      setting: "zone_reach",
      name: "the zone distances",
      entityId: past[0].entityId,
      level: past.some((p) => p.never) ? "warning" : "note",
      text: past.map((p) => p.line).join(" "),
      hint:
        `The reach comes from ${maxMove} and ${maxStill}. Lower the zone distances,` +
        " or raise those gates on the Detection Range card.",
    });
  }
  return problems;
}

/** The LD2412 detects from its Min Gate out to its Max Gate. On its map,
 *  max_move_distance holds Max Gate and max_still_distance Min Gate. */
function ld2412RangeProblem(
  hass: HomeAssistant,
  m: EntityMap,
  profile: RadarProfile
): SetupProblem | undefined {
  const max = numState(hass, m.max_move_distance);
  const min = numState(hass, m.max_still_distance);
  if (max === undefined || min === undefined || min < max) return undefined;
  const [maxLabel, minLabel] = profile.rangeLabels;
  const span = `The ${profile.label} only detects people from ${minLabel} out to ${maxLabel}`;
  return {
    setting: "gate_range",
    name: minLabel,
    entityId: m.max_still_distance!,
    level: "warning",
    text:
      min > max
        ? `${minLabel} (${num(min)}) is above ${maxLabel} (${num(max)}). ${span}, so it may never see anyone.`
        : `${minLabel} and ${maxLabel} are both ${num(min)}. ${span}, so it covers one narrow band.`,
    hint: `Set ${minLabel} lower than ${maxLabel} on the Detection Range card.`,
  };
}

/**
 * The card's state for one gate radar, from live HA state. `map` and
 * `profile` come from the device's own entities (`resolveRadar`); `job` says
 * whether a calibration job is running on it.
 */
export function gateSetupStatus(
  hass: HomeAssistant,
  deviceId: string | undefined,
  map: EntityMap,
  profile: RadarProfile | undefined,
  job: JobActivity
): SetupStatus {
  if (!deviceId) return { kind: "no_device" };
  // No gate radar (an MTR-1), or nothing of one resolved.
  const checked = profile ? gateCheckedIds(map, profile) : [];
  if (!profile || checked.length === 0) return { kind: "nothing_to_check" };
  const states = checked.map((id) => hass.states[id]);
  if (!states.some(isLive)) return { kind: "offline" };
  const problems = [
    engineeringProblem(hass, map, job),
    unreadProblem(hass, map),
    ...(profile.key === "ld2410"
      ? ld2410ZoneProblems(hass, map, profile)
      : [ld2412RangeProblem(hass, map, profile)]),
  ].filter((p): p is SetupProblem => p !== undefined);
  if (problems.length) return { kind: "checked", problems };
  // "Radar settings look good" must not hide a switch left on while the card
  // still waits to hear whether a job owns it, nor stand on no value at all.
  const engineering = map.engineering_mode ? hass.states[map.engineering_mode] : undefined;
  if (job === "unknown" && engineering?.state === "on") return { kind: "checking" };
  if (!states.some(isRead)) return { kind: "waiting" };
  return { kind: "checked", problems };
}

/** The entity ids whose state changes can change `gateSetupStatus`. */
export function gateWatchedIds(map: EntityMap, profile: RadarProfile | undefined): string[] {
  if (!profile) return [];
  return [...gateCheckedIds(map, profile), map.gate_size].filter((id): id is string => !!id);
}
