/**
 * Pure view model for the calibrate card: every sentence the card shows is
 * built here from the websocket payload, so the copy is testable without a
 * DOM. The backend sends codes (`warnings`, `flags`, `error.code`); this file
 * owns the sentences.
 */

import type { EntityMap, HomeAssistant } from "../types";
import { LD2410_FACTORY_THRESHOLDS } from "../profiles";
import type {
  CalibrationPayload,
  CalibrationResult,
  Channel,
  ChannelResult,
  JobState,
  ProfileKey,
  RestoredFrom,
  SnapshotSummary,
} from "./api";

export const DEFAULT_SETTLE_S = 15;
export const DEFAULT_DURATION_S = 60;
/** Mirrors the backend's VERIFY_TOLERANCE: within this of `old` is unchanged. */
const TOLERANCE = 0.5;

export const KEEP_ON_LD2410 = "Leave Radar Engineering Mode on until this finishes.";
export const KEEP_ON_LD2412 =
  "Leave Radar Engineering Mode on and do not press Start Dynamic Background Correction until this finishes.";
export const WALK_AROUND_LINE =
  "Now walk around, then sit still for a minute: the Radar Target row in Target / Occupancy should stay on the whole time you are in the room and turn off a few seconds after you leave (Radar Timeout).";
export const NOTHING_TO_RESTORE = "Nothing to restore yet";

const TERMINAL: ReadonlySet<string> = new Set(["done", "cancelled", "failed"]);

export function isTerminal(status: string | undefined): boolean {
  return status !== undefined && TERMINAL.has(status);
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
const DAY_OPTS: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

/** "14:31" when `iso` falls on today in the browser's time zone, otherwise
 *  "10 Oct 14:31"; both in the browser locale. */
export function formatTime(iso: string, now: Date = new Date()): string {
  const d = parseDate(iso);
  if (!d) return iso;
  const opts = sameDay(d, now) ? TIME_OPTS : { ...DAY_OPTS, ...TIME_OPTS };
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

/** Always "11 Oct 14:32", for lines that describe something in the past. */
export function formatDayTime(iso: string): string {
  const d = parseDate(iso);
  if (!d) return iso;
  return new Intl.DateTimeFormat(undefined, { ...DAY_OPTS, ...TIME_OPTS }).format(d);
}

// ---------------------------------------------------------------------------
// Durations and the idle sentence
// ---------------------------------------------------------------------------

/** "15 seconds", "30 seconds", "1 minute", "2 minutes", "5 minutes". Whole
 *  minutes read as minutes; anything else stays in seconds. */
export function durationText(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

/** The first idle paragraph. With `settleS` 0 the countdown clause is dropped. */
export function idleSentence(settleS: number, durationS: number): string {
  const listen = `listens for ${durationText(durationS)}, then sets every gate's move and still threshold just above the background it heard.`;
  const middle =
    settleS > 0
      ? `It counts down ${durationText(settleS)} so you can leave, ${listen}`
      : `It ${listen}`;
  return `Teach the radar what your empty room looks like. ${middle} Your current thresholds are saved first, so you can undo.`;
}

// ---------------------------------------------------------------------------
// Running job
// ---------------------------------------------------------------------------

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

function sortedGateKeys(peaks: Record<string, number>): string[] {
  return Object.keys(peaks).sort((a, b) => Number(a) - Number(b));
}

/** "Highest so far, move: G0 14 · G1 9" and the still twin; a channel with no
 *  peaks yet yields no line. */
export function livePeaksLine(job: JobState): string[] {
  const lines: string[] = [];
  for (const channel of ["move", "still"] as Channel[]) {
    const peaks = job.peaks?.[channel] ?? {};
    const keys = sortedGateKeys(peaks);
    if (keys.length === 0) continue;
    const parts = keys.map((k) => `G${k} ${peaks[k]}`).join(" · ");
    lines.push(`Highest so far, ${channel}: ${parts}`);
  }
  return lines;
}

function keepOnLine(profile: ProfileKey | undefined): string {
  return profile === "ld2412" ? KEEP_ON_LD2412 : KEEP_ON_LD2410;
}

const READING_THRESHOLDS = "Reading the radar's current thresholds...";
const VERIFYING = "Checking that the radar accepted the new values...";
const RESTORING = "Restoring saved thresholds...";
const ENGINEERING_ON = "Turning on Radar Engineering Mode...";
const FINISHING = "Finishing...";

/**
 * The running headline split in two: `phase` is the sentence that changes
 * only when the job changes phase, `detail` the counter that follows it
 * ("42 s left", "7 of 18"), or "". The card puts only `phase` in its live
 * region so a screen reader is not read a countdown once a second.
 */
export function phaseHeadline(job: JobState): { phase: string; detail: string } {
  if (job.kind === "restore") {
    switch (job.status) {
      case "applying":
        return job.sub_phase === "refresh"
          ? { phase: READING_THRESHOLDS, detail: "" }
          : { phase: RESTORING, detail: `${job.writes_done} of ${job.writes_total}` };
      case "verifying":
        return { phase: VERIFYING, detail: "" };
      case "preparing":
        // SPEC NOTE: the spec names no copy for a restore's preparing moment;
        // it lasts under a second, so the applying headline without a count.
        return { phase: RESTORING, detail: "" };
      default:
        return { phase: FINISHING, detail: "" };
    }
  }
  switch (job.status) {
    case "preparing":
      if (job.sub_phase === "settle") return { phase: "Leave the room now.", detail: "" };
      if (job.sub_phase === "warmup") {
        return { phase: "Waiting for gate energy from the radar...", detail: "" };
      }
      // SPEC NOTE: sub_phase null before the backend picks one; same copy as
      // the engineering step, which is what happens next.
      return { phase: ENGINEERING_ON, detail: "" };
    case "sampling":
      return {
        phase: "Listening to the empty room...",
        detail: `${job.remaining_s ?? job.duration_s} s left`,
      };
    case "applying":
      if (job.sub_phase === "refresh") return { phase: READING_THRESHOLDS, detail: "" };
      return {
        phase: `Writing ${job.writes_total} thresholds to the radar...`,
        detail: `${job.writes_done} of ${job.writes_total}`,
      };
    case "verifying":
      return { phase: VERIFYING, detail: "" };
    default:
      return { phase: FINISHING, detail: "" };
  }
}

/** The status lines for a running job, headline first. */
export function phaseLabel(job: JobState, profile: ProfileKey | undefined): string[] {
  const keepOn = keepOnLine(profile);
  const { phase, detail } = phaseHeadline(job);
  const headline = detail ? `${phase} ${detail}` : phase;
  if (job.kind === "restore") return [headline];
  switch (job.status) {
    case "preparing":
      if (job.sub_phase === "engineering") return [headline];
      if (job.sub_phase === "settle") {
        const remaining = job.remaining_s ?? job.settle_s;
        return [headline, `Listening starts in ${remaining} s.`, keepOn];
      }
      return [headline, keepOn];
    case "sampling":
      return [
        headline,
        `Keep the room empty. ${plural(job.samples, "sample")} so far.`,
        ...livePeaksLine(job),
        keepOn,
      ];
    case "applying":
      if (job.sub_phase === "refresh") return [headline];
      return [headline, "Values already written stay until you undo."];
    default:
      return [headline];
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** Progress bar input: a 0..1 fraction, or null for an indeterminate phase. */
export function progress(job: JobState): { fraction: number | null; label: string } {
  if (job.status === "preparing" && job.sub_phase === "settle" && job.settle_s > 0) {
    return {
      fraction: clamp01(job.elapsed_s / job.settle_s),
      label: `${job.remaining_s ?? job.settle_s} s`,
    };
  }
  if (job.status === "sampling" && job.duration_s > 0) {
    return {
      fraction: clamp01(job.elapsed_s / job.duration_s),
      label: `${job.remaining_s ?? job.duration_s} s left`,
    };
  }
  if (job.status === "applying" && job.sub_phase !== "refresh" && job.writes_total > 0) {
    return {
      fraction: clamp01(job.writes_done / job.writes_total),
      label: `${job.writes_done} of ${job.writes_total}`,
    };
  }
  return { fraction: null, label: "" };
}

/** Whether the Stop button applies: a calibrate job before verification. A
 *  restore is never stopped from the card, and a cancel already requested is
 *  not sent again. */
export function canStop(job: JobState | null | undefined): boolean {
  if (!job || job.kind !== "calibrate" || job.cancel_requested) return false;
  return job.status === "preparing" || job.status === "sampling" || job.status === "applying";
}

/** Whether the primary button is enabled. `backgroundOn` is the live
 *  LD2412 background-correction status: the payload only refreshes while a
 *  job runs, so its copy (the default) goes stale while the card is idle. */
export function canStart(
  payload: CalibrationPayload | undefined,
  online: boolean,
  backgroundOn: boolean = payload?.entities?.background_status_on ?? false
): boolean {
  if (!online || !payload?.entities) return false;
  if (payload.job) return false;
  if (!payload.entities.engineering_mode) return false;
  return !backgroundOn;
}

// ---------------------------------------------------------------------------
// Result table
// ---------------------------------------------------------------------------

export interface Cell {
  /** The peak column: "14", "92 (spike seen)" or "" when nothing was sampled. */
  peak: string;
  /** The threshold column. */
  text: string;
  flags: string[];
}

export interface Row {
  gate: number;
  label: string;
  move: Cell;
  still: Cell;
  /** Every sampled channel is beyond the radar's range; the card dims it. */
  unused: boolean;
}

function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(Math.round(v * 10) / 10);
}

function peakText(ch: ChannelResult): string {
  if (ch.peak === null || ch.peak === undefined) return "";
  return ch.flags.includes("spike") ? `${num(ch.peak)} (spike seen)` : num(ch.peak);
}

function thresholdText(ch: ChannelResult, preview: boolean): string {
  if (ch.skipped === "not selected") {
    return ch.old === null ? "(not selected)" : `${num(ch.old)} (not selected)`;
  }
  if (ch.skipped) return `skipped: ${ch.skipped}`;
  if (ch.new === null || ch.new === undefined) return "no data";
  if (ch.written && ch.confirmed === false && ch.actual === null) {
    return "not confirmed (radar offline)";
  }
  // SPEC NOTE: the spec lists "100 (off)" as a cell form without saying
  // whether the old value is kept; a gate that moved to 100 reads
  // "0 → 100 (off)" so the before value is not lost, an unchanged one "100 (off)".
  const off = ch.flags.includes("off");
  const changed = ch.old === null || Math.abs(ch.new - ch.old) > TOLERANCE;
  if (!changed) return off ? `${num(ch.new)} (off)` : `${num(ch.old)} (unchanged)`;
  const arrow = `${num(ch.old)} → ${num(ch.new)}`;
  if (preview) {
    // SPEC NOTE: the spec asks for "would set" in the threshold columns of a
    // preview without fixing the cell text; the arrow plus the tag keeps the
    // table identical to the applied one.
    return off ? `${arrow} (off, would set)` : `${arrow} (would set)`;
  }
  if (ch.written && ch.confirmed === false) {
    // SPEC NOTE: a mismatch (actual differs from asked) has no cell text in the
    // spec; the warning line carries the numbers, the cell says it is unproven.
    return off ? `${arrow} (off, not confirmed)` : `${arrow} (not confirmed)`;
  }
  return off ? `${arrow} (off)` : arrow;
}

function cell(ch: ChannelResult, preview: boolean): Cell {
  return { peak: peakText(ch), text: thresholdText(ch, preview), flags: [...ch.flags] };
}

function rowUnused(gate: { move: ChannelResult; still: ChannelResult }): boolean {
  const sampled = [gate.move, gate.still].filter((ch) => ch.skipped !== "not selected");
  return sampled.length > 0 && sampled.every((ch) => ch.flags.includes("unused"));
}

export function resultRows(result: CalibrationResult): Row[] {
  const preview = result.outcome === "preview";
  return (result.gates ?? []).map((g) => ({
    gate: g.gate,
    label: `G${g.gate}`,
    move: cell(g.move, preview),
    still: cell(g.still, preview),
    unused: rowUnused(g),
  }));
}

function gateList(gates: number[]): string {
  return gates.map((g) => `G${g}`).join(", ");
}

/** Footnotes under the table naming the gates beyond the radar's range. */
export function unusedFootnote(result: CalibrationResult): string[] {
  const gates = result.gates ?? [];
  const lines: string[] = [];
  if (result.profile === "ld2412") {
    const flagged = gates.filter(
      (g) => g.move.flags.includes("unused") || g.still.flags.includes("unused")
    );
    const min = result.min_gate ?? null;
    const max = result.max_gate ?? null;
    const below = flagged.filter((g) => min !== null && g.gate < min).map((g) => g.gate);
    const beyond = flagged.filter((g) => max !== null && g.gate > max).map((g) => g.gate);
    if (below.length) lines.push(`${gateList(below)}: not used (below Min Gate ${min})`);
    if (beyond.length) lines.push(`${gateList(beyond)}: not used (beyond Max Gate ${max})`);
    return lines;
  }
  const move = gates.filter((g) => g.move.flags.includes("unused")).map((g) => g.gate);
  const still = gates.filter((g) => g.still.flags.includes("unused")).map((g) => g.gate);
  if (move.length) {
    lines.push(`${gateList(move)}: not used (beyond Max Move Gate ${result.max_move_gate ?? "?"})`);
  }
  if (still.length) {
    lines.push(`${gateList(still)}: not used (beyond Max Still Gate ${result.max_still_gate ?? "?"})`);
  }
  return lines;
}

/** "G3 move" for an entity id in the result, or the id itself when the
 *  result carries no gate table (a restore). */
function channelLabel(result: CalibrationResult, entityId: string): string {
  for (const g of result.gates ?? []) {
    if (g.move.entity_id === entityId) return `G${g.gate} move`;
    if (g.still.entity_id === entityId) return `G${g.gate} still`;
  }
  return entityId;
}

function unverifiedLine(result: CalibrationResult): string | null {
  const entries = result.unverified ?? [];
  if (entries.length === 0) return null;
  const parts = entries.map((e) => {
    const label = channelLabel(result, e.entity_id);
    if (e.actual === null || e.actual === undefined) {
      return `${label} could not be read (radar offline)`;
    }
    return `${label} still reports ${num(e.actual)} (asked for ${num(e.asked)})`;
  });
  return `${plural(entries.length, "value")} could not be confirmed: ${parts.join(", ")}. Check the Move / Still Thresholds cards.`;
}

/** The sentences for the result's warning codes, in the backend's order. */
export function warningLines(result: CalibrationResult): string[] {
  const lines: string[] = [];
  const warnings = result.warnings ?? [];
  for (const code of warnings) {
    if (code === "presence") {
      const pct = Math.round((result.presence_fraction ?? 0) * 100);
      lines.push(
        `The radar reported someone present for ${pct}% of the listen. If someone was in the room, even sitting still, press Undo and run it again.`
      );
    } else if (code === "radar_unavailable") {
      lines.push(
        "The radar was unavailable for part of the listen; gates with too few readings were left as they were."
      );
    } else if (code === "unverified") {
      const line = unverifiedLine(result);
      if (line) lines.push(line);
    } else if (code === "gate_off") {
      for (const entry of result.gates_off ?? []) {
        lines.push(
          `G${entry.gate} ${entry.channel} is now off (its background peaked at ${num(entry.peak)}). If a fan or curtain moves there all day this is fine; if not, press Undo and run again with the room really empty.`
        );
      }
    }
  }
  // A restore result lists unverified ids without the warning code.
  if (!warnings.includes("unverified") && result.kind === "restore") {
    const line = unverifiedLine(result);
    if (line) lines.push(line);
  }
  return lines;
}

/** The Undo button text. The newest snapshot is the one the restore service
 *  picks when no id is given, so the label names exactly that one. */
export function undoLabel(snapshots: SnapshotSummary[], now: Date = new Date()): string {
  const newest = snapshots[0];
  if (!newest) return NOTHING_TO_RESTORE;
  return `Undo (restore ${formatTime(newest.taken_at, now)} values)`;
}

function changedOfTotal(result: CalibrationResult, verb = "changed"): string {
  const changed = result.changed ?? 0;
  const total = changed + (result.unchanged ?? 0);
  return `${changed} of ${total} thresholds ${verb}`;
}

/** The Cancelled view's sentence. */
export function cancelledLine(result: CalibrationResult): string {
  const writes = result.writes_done ?? 0;
  if (writes === 0) return "Stopped. Nothing was changed.";
  return `Stopped after ${writes} of ${result.writes_total ?? writes} values were written. Undo restores the saved values.`;
}

/** The line under a result's heading, one form per outcome: a preview says
 *  what it would change, never that it changed anything. */
export function summaryLine(result: CalibrationResult, now: Date = new Date()): string {
  if (result.status === "failed" || result.outcome === "failed") return failureLine(result);
  if (result.outcome === "cancelled") return cancelledLine(result);
  const when = formatTime(result.finished_at, now);
  if (result.kind === "restore") {
    const restored = result.restored ?? 0;
    const unchanged = result.unchanged ?? 0;
    return `Restored ${plural(restored, "value")} at ${when}, ${unchanged} unchanged.`;
  }
  const samples = plural(result.samples ?? 0, "sample");
  if (result.outcome === "preview") {
    // SPEC NOTE: the spec words the summary for an applied result only; a
    // stored preview reads as what it would have done.
    return `Previewed at ${when} from ${samples}. ${changedOfTotal(result, "would change")}.`;
  }
  return `Calibrated at ${when} from ${samples}. ${changedOfTotal(result)}.`;
}

/** The idle footer line describing `last_result`. */
export function footerLine(result: CalibrationResult): string {
  const when = formatDayTime(result.finished_at);
  // SPEC NOTE: the spec words the footer for applied and restored results
  // only; the other outcomes say what happened without claiming a change,
  // and name a restore as a restore.
  const job = result.kind === "restore" ? "restore" : "calibration";
  switch (result.outcome) {
    case "applied":
    case "partial":
      return `Last calibrated ${when}, ${changedOfTotal(result)}.`;
    case "restored":
      return `Last restored ${when}.`;
    case "preview":
      return `Last previewed ${when}.`;
    case "cancelled":
      return `Last ${job} ${when} was stopped.`;
    default:
      return `Last ${job} ${when} failed.`;
  }
}

/** Heading for a finished calibrate job. */
export function resultHeading(result: CalibrationResult): string {
  if (result.outcome === "partial") {
    const n = (result.unverified ?? []).length;
    return `Thresholds updated, ${n} could not be confirmed`;
  }
  return "Thresholds updated";
}

const SAYS_NOTHING_CHANGED = /nothing was changed/i;

/** The failed-state sentence. Code independent: " Nothing was changed." is
 *  appended only when nothing was written and the message does not already
 *  say so (in any case: `snapshot_failed` says "so nothing was changed"). */
export function failureLine(result: CalibrationResult): string {
  const message = result.error?.message ?? "Unknown error.";
  // SPEC NOTE: the spec words only "Calibration failed: "; a failed restore
  // job uses the same shape with "Restore failed: ".
  const prefix = result.kind === "restore" ? "Restore failed: " : "Calibration failed: ";
  const writes = result.writes_done ?? 0;
  if (writes === 0 && !SAYS_NOTHING_CHANGED.test(message)) {
    return `${prefix}${message} Nothing was changed.`;
  }
  return `${prefix}${message}`;
}

/** Whether a finished job left values the saved snapshot can put back. */
export function offersUndo(result: CalibrationResult): boolean {
  return (result.writes_done ?? 0) > 0 && !!result.snapshot_id;
}

/**
 * The snapshot a restore result wrote back, or null when it cannot be told.
 *
 * `restored_from` names it exactly. Without it: a restore takes its redo
 * snapshot (`snapshot_id`) of the values it overwrites before writing, so the
 * source is the one just older than that in the list; a restore that failed
 * before taking one still had the newest as its source.
 */
export function restoreSource(
  result: CalibrationResult,
  snapshots: SnapshotSummary[]
): RestoredFrom | null {
  const named = result.restored_from;
  if (named?.id || named?.taken_at) return named;
  if (result.snapshot_id) {
    const index = snapshots.findIndex((s) => s.id === result.snapshot_id);
    const older = index >= 0 ? snapshots[index + 1] : undefined;
    return older ? { id: older.id, taken_at: older.taken_at } : null;
  }
  const newest = snapshots[0];
  return newest ? { id: newest.id, taken_at: newest.taken_at } : null;
}

/** "Restored the thresholds from 14:31." */
export function restoredLine(
  result: CalibrationResult,
  snapshots: SnapshotSummary[],
  now: Date = new Date()
): string {
  const takenAt = restoreSource(result, snapshots)?.taken_at;
  // SPEC NOTE: when neither the result nor the list reveals the restored
  // snapshot the line drops the time rather than guess one.
  if (!takenAt) return "Restored the saved thresholds.";
  return `Restored the thresholds from ${formatTime(takenAt, now)}.`;
}

/** "Not found any more: <ids>." for snapshot entities a restore could not
 *  find, or null when it found them all. */
export function missingLine(result: CalibrationResult): string | null {
  const missing = result.missing ?? [];
  return missing.length ? `Not found any more: ${missing.join(", ")}.` : null;
}

/** Summary lines for a restore result shown from "Show last result". */
export function restoreSummaryLines(result: CalibrationResult): string[] {
  const lines = [summaryLine(result)];
  const missing = missingLine(result);
  if (missing) lines.push(missing);
  return lines;
}

// ---------------------------------------------------------------------------
// Factory hint
// ---------------------------------------------------------------------------

/** True only on an LD2410 whose 18 thresholds all equal the HLK factory table
 *  and that has never been calibrated (no snapshot). */
export function isFactoryThresholds(
  hass: HomeAssistant,
  map: EntityMap,
  profile: ProfileKey | undefined,
  snapshots: SnapshotSummary[] = []
): boolean {
  if (profile !== "ld2410" || snapshots.length > 0) return false;
  const table = LD2410_FACTORY_THRESHOLDS;
  const matches = (ids: string[], expected: number[]): boolean => {
    if (expected.length === 0) return false;
    for (let i = 0; i < expected.length; i++) {
      const id = ids[i];
      if (!id) return false;
      const state = hass.states[id]?.state;
      if (state === undefined) return false;
      const value = parseFloat(state);
      if (!Number.isFinite(value) || value !== expected[i]) return false;
    }
    return true;
  };
  return matches(map.move_threshold, table.move) && matches(map.still_threshold, table.still);
}

// ---------------------------------------------------------------------------
// State selection
// ---------------------------------------------------------------------------

/** Card-local memory of which job this card watched finish. */
export interface LocalState {
  /** `job_id` of the job whose terminal view may render, or null. */
  observedFinish: string | null;
  /** The last pushed job id and whether it was still running. */
  lastJobId: string | null;
  lastJobTerminal: boolean;
}

export const INITIAL_LOCAL_STATE: LocalState = {
  observedFinish: null,
  lastJobId: null,
  lastJobTerminal: false,
};

/** Fold one push into the local state: the terminal views are only earned by
 *  watching a job cross the line, never by reading a stored result. */
export function nextLocalState(prev: LocalState, payload: CalibrationPayload): LocalState {
  const job = payload.job;
  if (job) {
    const terminal = isTerminal(job.status);
    return {
      observedFinish: terminal ? job.job_id : prev.observedFinish,
      lastJobId: job.job_id,
      lastJobTerminal: terminal,
    };
  }
  let observed = prev.observedFinish;
  if (
    prev.lastJobId !== null &&
    !prev.lastJobTerminal &&
    payload.last_result?.job_id === prev.lastJobId
  ) {
    observed = prev.lastJobId;
  }
  return { observedFinish: observed, lastJobId: null, lastJobTerminal: false };
}

/** The state-selection rule: a terminal view renders only for a job this card
 *  watched finish, and only once its result is stored. */
export function showsResultView(local: LocalState, payload: CalibrationPayload): boolean {
  if (local.observedFinish === null) return false;
  if (payload.job && !isTerminal(payload.job.status)) return false;
  return payload.last_result?.job_id === local.observedFinish;
}
