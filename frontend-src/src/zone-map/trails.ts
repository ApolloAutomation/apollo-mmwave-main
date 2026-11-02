/**
 * The few seconds of positions behind each live target dot, kept in page
 * memory by one card element and never saved.
 *
 * Samples are raw sensor frame mm (unit converted, not rotated), so a
 * rotation or flip change redraws them in place. Times come from the card's
 * clock, `performance.now()`, which never runs backward.
 *
 * Home Assistant writes a target's X and Y as two state changes, so one move
 * reaches the card as two pushes, and the first is a position nobody stood
 * at (new X, old Y). A push that comes within TRAIL_COALESCE_MS of the
 * slot's last sample replaces it. Coverage paint reads only the samples past
 * that window, through `takeFinal`, so it never counts the in-between point.
 */

/** How long a trail lasts behind its dot. */
export const TRAIL_MS = 3000;
/** A longer silence between two samples breaks the trail in two. */
export const TRAIL_GAP_MS = 1000;
/** A push this soon after the slot's last sample replaces that sample. */
export const TRAIL_COALESCE_MS = 60;

export interface TrailSample {
  /** ms on the card's clock. */
  t: number;
  /** mm, raw sensor frame (unit converted, not rotated). */
  x: number;
  y: number;
}

interface SlotTrail {
  /** Oldest first. */
  samples: TrailSample[];
  /** How many leading samples `takeFinal` has handed out. */
  taken: number;
}

const NO_SAMPLES: readonly TrailSample[] = [];

export class TrailBuffer {
  private _slots = new Map<number, SlotTrail>();

  /** Record a target's position. Returns true when it was appended, false
   *  when it replaced the slot's last sample (or was not a number). */
  push(slot: number, t: number, x: number, y: number): boolean {
    if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    let trail = this._slots.get(slot);
    if (!trail) {
      trail = { samples: [], taken: 0 };
      this._slots.set(slot, trail);
    }
    const samples = trail.samples;
    const last = samples.length > 0 ? samples[samples.length - 1] : null;
    if (!last) {
      samples.push({ t, x, y });
      return true;
    }
    // A time before the last sample's would unsort the slot; it counts as
    // that sample's time.
    const at = Math.max(t, last.t);
    // The replacement keeps the first write's time, so the window closes
    // TRAIL_COALESCE_MS after it: a stream of quick pushes cannot hold one
    // sample open while the target walks on. A sample already handed to
    // `takeFinal` is final and never changes.
    if (at - last.t < TRAIL_COALESCE_MS && samples.length > trail.taken) {
      samples[samples.length - 1] = { t: last.t, x, y };
      return false;
    }
    samples.push({ t: at, x, y });
    return true;
  }

  /**
   * The samples at least TRAIL_COALESCE_MS old that were not handed out
   * before, oldest first across every slot. A later push can no longer
   * replace them, so each is a position the target really reported.
   */
  takeFinal(now: number): TrailSample[] {
    const taken: TrailSample[] = [];
    this._slots.forEach((trail) => {
      const samples = trail.samples;
      let i = trail.taken;
      while (i < samples.length && now - samples[i].t >= TRAIL_COALESCE_MS) {
        taken.push(samples[i]);
        i += 1;
      }
      trail.taken = i;
    });
    // Each slot's run is already in order; the sort is stable, so on a tie
    // the slots keep the order they were first pushed in.
    return taken.sort((a, b) => a.t - b.t);
  }

  /**
   * Drop the samples TRAIL_MS old or older, and every slot left empty. The
   * cut is the one `hasTrail` uses, so once it reports no trail, nothing is
   * left that the card could still draw.
   */
  prune(now: number): void {
    const cutoff = now - TRAIL_MS;
    this._slots.forEach((trail, slot) => {
      const samples = trail.samples;
      let drop = 0;
      while (drop < samples.length && samples[drop].t <= cutoff) drop += 1;
      if (drop === 0) return;
      if (drop === samples.length) {
        this._slots.delete(slot);
        return;
      }
      samples.splice(0, drop);
      trail.taken = Math.max(0, trail.taken - drop);
    });
  }

  /** The slot's samples, oldest first. Read them before the next push. */
  samples(slot: number): readonly TrailSample[] {
    const trail = this._slots.get(slot);
    return trail ? trail.samples : NO_SAMPLES;
  }

  /** Every slot that has a sample, in ascending order. */
  slots(): number[] {
    return Array.from(this._slots.keys()).sort((a, b) => a - b);
  }

  /**
   * Where the slot's target was over the last `windowMs`, weighted by time:
   * each sample counts for as long as it was current inside the window
   * (until the next sample, the last one until `now`), and a sample current
   * at the window start counts from the window start. Home Assistant reports
   * changes only, so someone who walked in and stood still left many samples
   * on the way and few or none where they stand, and a plain mean of the
   * samples would lean toward the walk in.
   *
   * With no time inside the window (`now` is the last sample's time, or the
   * window is empty), the position current at `now`. null when the slot has
   * no sample.
   */
  average(slot: number, now: number, windowMs: number): { x: number; y: number } | null {
    const samples = this._slots.get(slot)?.samples;
    if (!samples || samples.length === 0) return null;
    const start = now - windowMs;
    let sumX = 0;
    let sumY = 0;
    let total = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i];
      const end = i + 1 < samples.length ? Math.min(samples[i + 1].t, now) : now;
      const weight = end - Math.max(sample.t, start);
      if (weight <= 0) continue;
      sumX += sample.x * weight;
      sumY += sample.y * weight;
      total += weight;
    }
    if (total > 0) return { x: sumX / total, y: sumY / total };
    let current = samples[0];
    for (const sample of samples) {
      if (sample.t <= now) current = sample;
    }
    return { x: current.x, y: current.y };
  }

  /** Whether some slot has two samples newer than now - TRAIL_MS, the least
   *  a trail needs. The card's fade timer runs only while one does. */
  hasTrail(now: number): boolean {
    const cutoff = now - TRAIL_MS;
    for (const trail of this._slots.values()) {
      const samples = trail.samples;
      // Oldest first, so the second newest decides.
      if (samples.length >= 2 && samples[samples.length - 2].t > cutoff) return true;
    }
    return false;
  }

  /** Forget every sample, handed out or not. */
  clear(): void {
    this._slots.clear();
  }
}
