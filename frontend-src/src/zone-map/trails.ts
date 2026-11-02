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
 * at (new X, old Y). The LD2450 writes each about once a second, often Y
 * about 0.45 s after X. A push within TRAIL_COALESCE_MS of the slot's last
 * sample replaces it, as two writes of one loop turn do. A push that moved
 * one coordinate leaves its sample waiting for the other, and when that one
 * moves within TRAIL_PAIR_MS it completes the sample in place. Coverage
 * paint reads only the samples that can no longer change, through
 * `takeFinal`, so it never counts the in-between point.
 */

/** How long a trail lasts behind its dot. */
export const TRAIL_MS = 3000;
/** A longer silence between two samples breaks the trail in two. */
export const TRAIL_GAP_MS = 1000;
/** A push this soon after the slot's last sample replaces that sample. */
export const TRAIL_COALESCE_MS = 60;
/**
 * How long a sample one coordinate moved waits for the other. The LD2450
 * writes Y 0.40 to 0.50 s after X, and its next X comes at least 0.62 s
 * after a Y, so a longer wait would let a lone Y take in the next X.
 */
export const TRAIL_PAIR_MS = 550;

export interface TrailSample {
  /** ms on the card's clock, of the first push in the sample. */
  t: number;
  /** mm, raw sensor frame (unit converted, not rotated). */
  x: number;
  y: number;
  /** ms of the last push merged into the sample, when one was. */
  tLast?: number;
  /** Set on the first sample after its slot was empty (see `gone`): no
   *  trail joins it to the samples before. */
  brk?: boolean;
}

interface SlotTrail {
  /** Oldest first. */
  samples: TrailSample[];
  /** How many leading samples `takeFinal` has handed out. */
  taken: number;
  /**
   * The reading last pushed for the slot, kept after its samples age out,
   * so a still target's next move is judged against where it stood. null
   * once the slot was empty: the next push starts a new run.
   */
  reading: { x: number; y: number } | null;
  /** The coordinate the newest sample still waits for, or null. */
  pending: 'x' | 'y' | null;
}

const NO_SAMPLES: readonly TrailSample[] = [];

export class TrailBuffer {
  private _slots = new Map<number, SlotTrail>();

  /** Record a target's position. Returns true when it was appended, false
   *  when it was merged into the slot's last sample (or was not a number). */
  push(slot: number, t: number, x: number, y: number): boolean {
    if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    let trail = this._slots.get(slot);
    if (!trail) {
      trail = { samples: [], taken: 0, reading: null, pending: null };
      this._slots.set(slot, trail);
    }
    const samples = trail.samples;
    const last = samples.length > 0 ? samples[samples.length - 1] : null;
    // A time before the last sample's would unsort the slot; it counts as
    // that sample's time.
    const at = last ? Math.max(t, last.t) : t;
    const before = trail.reading;
    trail.reading = { x, y };
    if (!before) {
      // The first sample since the slot was empty. One coordinate 0 may be
      // the first write of a target appearing in a slot that read (0, 0),
      // so it waits for the other.
      samples.push(last ? { t: at, x, y, brk: true } : { t: at, x, y });
      trail.pending = (x === 0) === (y === 0) ? null : x === 0 ? 'x' : 'y';
      return true;
    }
    const xMoved = x !== before.x;
    const yMoved = y !== before.y;
    const waitedFor = trail.pending === 'x' ? xMoved : trail.pending === 'y' ? yMoved : false;
    // A sample already handed to `takeFinal` is final and never changes.
    if (last && samples.length > trail.taken) {
      // The replacement keeps the first write's time, so the window closes
      // TRAIL_COALESCE_MS after it: a stream of quick pushes cannot hold one
      // sample open while the target walks on.
      if (at - last.t < TRAIL_COALESCE_MS) {
        samples[samples.length - 1] = { ...last, x, y, tLast: at };
        if (waitedFor) trail.pending = null;
        return false;
      }
      // The coordinate the sample waits for, and only that one: the second
      // write of a split X and Y update.
      if (waitedFor && xMoved !== yMoved && at - last.t < TRAIL_PAIR_MS) {
        samples[samples.length - 1] = { ...last, x, y, tLast: at };
        trail.pending = null;
        return false;
      }
    }
    // Anything else leaves the last sample final: a newer write of the
    // coordinate it moved means the other was not going to change, so a
    // radar that reports several times a second keeps every sample.
    samples.push({ t: at, x, y });
    trail.pending = xMoved === yMoved ? null : xMoved ? 'y' : 'x';
    return true;
  }

  /**
   * The samples that can no longer change and were not handed out before,
   * oldest first across every slot: at least TRAIL_COALESCE_MS old, or
   * TRAIL_PAIR_MS for a newest sample still waiting for its other
   * coordinate. A later push can no longer replace them, so each is a
   * position the target really reported.
   */
  takeFinal(now: number): TrailSample[] {
    const taken: TrailSample[] = [];
    this._slots.forEach((trail) => {
      const samples = trail.samples;
      let i = trail.taken;
      while (i < samples.length) {
        const waiting = trail.pending !== null && i === samples.length - 1;
        if (now - samples[i].t < (waiting ? TRAIL_PAIR_MS : TRAIL_COALESCE_MS)) break;
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
   * Take back the slot's newest sample while it is not final, that is while
   * `takeFinal` has not handed it out. For the first of the two writes of a
   * target that vanishes, (0, old y) or (old x, 0): a point nobody stood at,
   * which shows only when the next push finds the target gone. It waits
   * TRAIL_PAIR_MS for its other coordinate, so the second write about 0.45 s
   * later still finds it. Returns whether a sample was taken back.
   */
  retract(slot: number): boolean {
    const trail = this._slots.get(slot);
    if (!trail || trail.samples.length <= trail.taken) return false;
    trail.samples.pop();
    trail.pending = null;
    if (trail.samples.length === 0) this._slots.delete(slot);
    return true;
  }

  /**
   * The slot's target is gone. Its newest sample waits for nothing more,
   * and the slot's next push starts a new run (`brk`), judged as a first
   * sample, so no trail joins where the target vanished to where it shows
   * up next.
   */
  gone(slot: number): void {
    const trail = this._slots.get(slot);
    if (!trail) return;
    if (trail.samples.length === 0) {
      this._slots.delete(slot);
      return;
    }
    trail.reading = null;
    trail.pending = null;
  }

  /**
   * Drop the samples TRAIL_MS old or older. The cut is the one `hasTrail`
   * uses, so once it reports no trail, nothing is left that the card could
   * still draw. A slot left with no sample is forgotten once its target is
   * gone; while the target is in view, the slot keeps where it stood.
   */
  prune(now: number): void {
    const cutoff = now - TRAIL_MS;
    this._slots.forEach((trail, slot) => {
      const samples = trail.samples;
      let drop = 0;
      while (drop < samples.length && samples[drop].t <= cutoff) drop += 1;
      if (drop === 0) return;
      if (drop === samples.length && !trail.reading) {
        this._slots.delete(slot);
        return;
      }
      samples.splice(0, drop);
      trail.taken = Math.max(0, trail.taken - drop);
      if (samples.length === 0) trail.pending = null;
    });
  }

  /** The slot's samples, oldest first. Read them before the next push. */
  samples(slot: number): readonly TrailSample[] {
    const trail = this._slots.get(slot);
    return trail ? trail.samples : NO_SAMPLES;
  }

  /** Every slot that has a sample, in ascending order. */
  slots(): number[] {
    const slots: number[] = [];
    this._slots.forEach((trail, slot) => {
      if (trail.samples.length > 0) slots.push(slot);
    });
    return slots.sort((a, b) => a - b);
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
