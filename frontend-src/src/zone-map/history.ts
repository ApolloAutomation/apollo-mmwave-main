/**
 * Movement history replay: the packed answer of `apollo_mmwave/movement/get`
 * decoded into one time series per slot, and what each slot shows at a
 * replay time T.
 *
 * Positions stay in the raw sensor frame (unit converted, not rotated, not
 * mirrored), so the card draws them through today's rotation and flip, like
 * the live dots. Times are the server's epoch ms; the replay never reads this
 * browser's clock.
 */

import type { MovementPayload } from "./api";
import { CellGrid } from "./cells";

/** A slot with no record for this long is hidden. A still target is
 *  recorded every 15 s, so a record this old means nobody is known there. */
export const REPLAY_VISIBLE_MS = 20000;
/** Two points of a slot further apart in time are not joined by a slide. */
export const REPLAY_INTERP_MAX_GAP_MS = 16000;
/** The most dwell one point stands for in the heatmap: a still target is
 *  recorded again every 15 s, so a longer silence is not known dwell. */
export const HEAT_WEIGHT_CAP_MS = 15000;

/**
 * How far a target can plausibly move between two records: the hold's
 * reacquire bound (hold.py HOLD_REACQUIRE_BASE_MM and
 * HOLD_REACQUIRE_MM_PER_MS). Further means the LD2450 handed the slot to
 * someone else.
 */
const PLAUSIBLE_BASE_MM = 600;
const PLAUSIBLE_MM_PER_MS = 1.6;

/** One slot's records, oldest first. */
export interface SlotSeries {
  /** Server epoch ms. */
  t: Float64Array;
  /** mm, raw sensor frame; 0 on a gone marker. */
  x: Int32Array;
  y: Int32Array;
  /** 1 where the slot lost its target (a gone marker), else 0. */
  gone: Uint8Array;
}

export interface MovementSeries {
  /** Keyed by slot, the 0-based index in the radar's tracked pairs, in
   *  ascending order. */
  slots: Map<number, SlotSeries>;
  since: number;
  now: number;
  /** Records in the answer, gone markers included. */
  count: number;
}

/** A column's bytes, checked against the length `n` records need. */
function columnView(name: string, column: unknown, expected: number, n: number): DataView {
  if (typeof column !== "string") throw new Error(`the ${name} column is missing`);
  let binary: string;
  try {
    binary = atob(column);
  } catch {
    throw new Error(`the ${name} column is not base64`);
  }
  if (binary.length !== expected) {
    throw new Error(
      `the ${name} column has ${binary.length} bytes where ${n} records need ${expected}`
    );
  }
  const bytes = new Uint8Array(expected);
  for (let i = 0; i < expected; i += 1) bytes[i] = binary.charCodeAt(i);
  return new DataView(bytes.buffer);
}

/**
 * Decode an answer into per-slot series. Throws when a column's length does
 * not match `n` or the answer cannot be decoded; the card shows the message
 * through `historyError`, so it reads as the end of a sentence.
 */
export function decodeMovement(p: MovementPayload): MovementSeries {
  const n = p.n;
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`the record count ${n} is not a whole number`);
  }
  const dt = columnView("dt", p.dt, n * 4, n);
  const s = columnView("s", p.s, n * 2, n);
  const x = columnView("x", p.x, n * 2, n);
  const y = columnView("y", p.y, n * 2, n);
  const t0 = p.t0;
  if (n > 0 && (typeof t0 !== "number" || !Number.isFinite(t0))) {
    throw new Error("the records have no start time");
  }

  // Count each slot's records first, so every array is made once at its size.
  const slotOf = new Int32Array(n);
  const sizes = new Map<number, number>();
  for (let i = 0; i < n; i += 1) {
    const raw = s.getInt16(i * 2, true);
    const slot = raw < 0 ? -1 - raw : raw;
    slotOf[i] = slot;
    sizes.set(slot, (sizes.get(slot) || 0) + 1);
  }
  const slots = new Map<number, SlotSeries>();
  const filled = new Map<number, number>();
  Array.from(sizes.keys())
    .sort((a, b) => a - b)
    .forEach((slot) => {
      const size = sizes.get(slot) as number;
      slots.set(slot, {
        t: new Float64Array(size),
        x: new Int32Array(size),
        y: new Int32Array(size),
        gone: new Uint8Array(size),
      });
      filled.set(slot, 0);
    });

  let t = n > 0 ? (t0 as number) : 0;
  for (let i = 0; i < n; i += 1) {
    // dt[0] is 0 by contract; the first record is at t0 either way.
    if (i > 0) t += dt.getUint32(i * 4, true);
    const slot = slotOf[i];
    const series = slots.get(slot) as SlotSeries;
    const j = filled.get(slot) as number;
    series.t[j] = t;
    series.x[j] = x.getInt16(i * 2, true);
    series.y[j] = y.getInt16(i * 2, true);
    series.gone[j] = s.getInt16(i * 2, true) < 0 ? 1 : 0;
    filled.set(slot, j + 1);
  }
  return { slots, since: p.since, now: p.now, count: n };
}

/** The index of the last record at or before T, -1 when there is none. */
function lastAtOrBefore(t: Float64Array, T: number): number {
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (t[mid] <= T) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * Where the slot's target is at T, raw frame mm, or null when the slot shows
 * nothing: no record yet, a gone marker, or a last point more than
 * REPLAY_VISIBLE_MS old. Between two points the dot slides, but only across
 * a gap of at most REPLAY_INTERP_MAX_GAP_MS and a distance a person could
 * cover in it, so a slot handed to someone else jumps instead of sliding
 * across the room.
 */
export function positionAt(s: SlotSeries, T: number): { x: number; y: number } | null {
  const i = lastAtOrBefore(s.t, T);
  if (i < 0 || s.gone[i]) return null;
  const next = i + 1;
  if (next < s.t.length && !s.gone[next]) {
    // t[next] > T >= t[i], so the gap is never 0.
    const gap = s.t[next] - s.t[i];
    const dx = s.x[next] - s.x[i];
    const dy = s.y[next] - s.y[i];
    if (
      gap <= REPLAY_INTERP_MAX_GAP_MS &&
      Math.hypot(dx, dy) <= PLAUSIBLE_BASE_MM + PLAUSIBLE_MM_PER_MS * gap
    ) {
      const f = (T - s.t[i]) / gap;
      return { x: s.x[i] + dx * f, y: s.y[i] + dy * f };
    }
  }
  return T - s.t[i] <= REPLAY_VISIBLE_MS ? { x: s.x[i], y: s.y[i] } : null;
}

/**
 * The slot's trail at T: its points from T - windowMs to T, oldest first,
 * ending where `positionAt` puts the dot (a slide adds that point at T). A
 * gone marker ends a trail, since the slot's next point can be someone
 * else. Empty while the slot is gone.
 */
export function trailAt(
  s: SlotSeries,
  T: number,
  windowMs: number
): { t: number; x: number; y: number }[] {
  const i = lastAtOrBefore(s.t, T);
  if (i < 0 || s.gone[i]) return [];
  const from = T - windowMs;
  let first = i + 1;
  while (first > 0 && !s.gone[first - 1] && s.t[first - 1] >= from) first -= 1;
  const trail: { t: number; x: number; y: number }[] = [];
  for (let k = first; k <= i; k += 1) trail.push({ t: s.t[k], x: s.x[k], y: s.y[k] });
  const dot = positionAt(s, T);
  if (dot && (dot.x !== s.x[i] || dot.y !== s.y[i])) trail.push({ t: T, x: dot.x, y: dot.y });
  return trail;
}

/**
 * Dwell per cell from `from` to `to`, in seconds, raw frame. Each point
 * stands for the time until its slot's next record (or `to`), at most
 * HEAT_WEIGHT_CAP_MS, counted only inside from..to. Weighing by time rather
 * than by record keeps walking, which records twice a second, from drowning
 * out where people stay.
 */
export function heatCells(
  m: MovementSeries,
  from: number,
  to: number,
  cellMm?: number
): CellGrid {
  const grid = new CellGrid(cellMm);
  m.slots.forEach((s) => {
    const last = s.t.length - 1;
    for (let i = 0; i <= last && s.t[i] <= to; i += 1) {
      if (s.gone[i]) continue;
      const t = s.t[i];
      const next = i < last ? s.t[i + 1] : to;
      const end = Math.min(t + Math.min(next - t, HEAT_WEIGHT_CAP_MS), to);
      const start = Math.max(t, from);
      if (end > start) grid.add(s.x[i], s.y[i], (end - start) / 1000);
    }
  });
  return grid;
}

/**
 * Point records (gone markers left out) in each of `buckets` equal slices
 * of from..to, for the sparkline. A point exactly at `to` counts in the
 * last slice.
 */
export function sparkBuckets(
  m: MovementSeries,
  from: number,
  to: number,
  buckets: number
): number[] {
  const count = Number.isFinite(buckets) && buckets > 0 ? Math.floor(buckets) : 0;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push(0);
  if (count === 0 || !(to > from)) return out;
  const span = to - from;
  m.slots.forEach((s) => {
    for (let i = 0; i < s.t.length; i += 1) {
      const t = s.t[i];
      if (s.gone[i] || t < from || t > to) continue;
      out[Math.min(count - 1, Math.floor(((t - from) / span) * count))] += 1;
    }
  });
  return out;
}
