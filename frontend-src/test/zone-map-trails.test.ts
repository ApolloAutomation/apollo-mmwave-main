/**
 * The live trail buffer behind each target dot. Times are the card's clock
 * (performance.now()), positions raw frame mm. Home Assistant writes a
 * target's X and Y as two state changes, which the buffer has to fold into
 * one position before coverage paint may count it.
 */

import { describe, it, expect } from "vitest";
import {
  TRAIL_COALESCE_MS,
  TRAIL_GAP_MS,
  TRAIL_MS,
  TrailBuffer,
  type TrailSample,
} from "../src/zone-map/trails";

/** The card's trail segments: runs of samples at most TRAIL_GAP_MS apart. */
function segments(samples: readonly TrailSample[]): number[][] {
  const runs: number[][] = [];
  samples.forEach((sample, i) => {
    if (i === 0 || sample.t - samples[i - 1].t > TRAIL_GAP_MS) runs.push([]);
    runs[runs.length - 1].push(sample.t);
  });
  return runs;
}

describe("TrailBuffer", () => {
  it("keeps 3 s of samples per slot", () => {
    expect(TRAIL_MS).toBe(3000);
    const trails = new TrailBuffer();
    for (let t = 0; t <= 5000; t += 500) trails.push(0, t, t / 10, 2000);
    trails.push(1, 4200, -500, 1500);
    trails.push(1, 4800, -450, 1500);

    trails.prune(5000);

    // A sample exactly 3 s old is gone: the same cut hasTrail makes.
    expect(trails.samples(0).map((s) => s.t)).toEqual([2500, 3000, 3500, 4000, 4500, 5000]);
    expect(trails.samples(0)[0]).toEqual({ t: 2500, x: 250, y: 2000 });
    expect(trails.samples(1)).toEqual([
      { t: 4200, x: -500, y: 1500 },
      { t: 4800, x: -450, y: 1500 },
    ]);
    expect(trails.slots()).toEqual([0, 1]);
  });

  it("forgets a slot once its newest sample is 3 s old", () => {
    const trails = new TrailBuffer();
    trails.push(2, 0, 100, 1000);
    trails.push(0, 0, 300, 1000);
    trails.push(0, 2000, 350, 1000);

    trails.prune(2999);
    expect(trails.slots()).toEqual([0, 2]);

    trails.prune(3000);
    expect(trails.slots()).toEqual([0]);
    expect(trails.samples(2)).toEqual([]);

    trails.prune(5000);
    expect(trails.slots()).toEqual([]);
    expect(trails.samples(0)).toEqual([]);
  });

  it("starts a new segment after a gap over 1 s", () => {
    expect(TRAIL_GAP_MS).toBe(1000);
    const trails = new TrailBuffer();
    // A gap of exactly 1 s still joins; 1.1 s breaks the trail in two.
    for (const t of [0, 200, 400, 1400, 2500, 2700]) {
      expect(trails.push(0, t, t, 2000)).toBe(true);
    }

    expect(trails.samples(0).map((s) => s.t)).toEqual([0, 200, 400, 1400, 2500, 2700]);
    expect(segments(trails.samples(0))).toEqual([
      [0, 200, 400, 1400],
      [2500, 2700],
    ]);
  });

  it("coalesces an X push and a Y push under 60 ms into one sample", () => {
    expect(TRAIL_COALESCE_MS).toBe(60);
    const trails = new TrailBuffer();
    trails.push(0, 0, 400, 2000);

    // The target moved to (500, 2100). X lands first, so the card pushes
    // (500, 2000), where nobody stood; Y follows 30 ms later.
    expect(trails.push(0, 1000, 500, 2000)).toBe(true);
    expect(trails.push(0, 1030, 500, 2100)).toBe(false);

    expect(trails.samples(0)).toEqual([
      { t: 0, x: 400, y: 2000 },
      { t: 1000, x: 500, y: 2100 },
    ]);

    // 60 ms or more after the sample's first write is a new sample.
    expect(trails.push(0, 1060, 520, 2120)).toBe(true);
    expect(trails.samples(0)).toHaveLength(3);
  });

  it("keeps the first write's time, so quick pushes cannot hold one sample open", () => {
    const trails = new TrailBuffer();
    trails.push(0, 0, 0, 2000);
    expect(trails.push(0, 40, 40, 2000)).toBe(false);
    // 40 ms after the replacement but 80 ms after the first write.
    expect(trails.push(0, 80, 80, 2000)).toBe(true);

    expect(trails.samples(0)).toEqual([
      { t: 0, x: 40, y: 2000 },
      { t: 80, x: 80, y: 2000 },
    ]);
  });

  it("coalesces each slot on its own", () => {
    const trails = new TrailBuffer();
    trails.push(0, 0, 100, 1000);
    expect(trails.push(1, 20, -100, 1000)).toBe(true);
    expect(trails.push(0, 30, 110, 1000)).toBe(false);

    expect(trails.samples(0)).toEqual([{ t: 0, x: 110, y: 1000 }]);
    expect(trails.samples(1)).toEqual([{ t: 20, x: -100, y: 1000 }]);
  });

  it("hands each sample to takeFinal once, after 60 ms", () => {
    const trails = new TrailBuffer();
    trails.push(0, 0, 100, 1000);

    expect(trails.takeFinal(59)).toEqual([]);
    expect(trails.takeFinal(60)).toEqual([{ t: 0, x: 100, y: 1000 }]);
    expect(trails.takeFinal(100)).toEqual([]);

    // A split X/Y write reaches takeFinal once, at its final position.
    trails.push(0, 200, 300, 1000);
    trails.push(0, 230, 300, 1200);
    expect(trails.takeFinal(259)).toEqual([]);
    expect(trails.takeFinal(260)).toEqual([{ t: 200, x: 300, y: 1200 }]);
    expect(trails.takeFinal(10000)).toEqual([]);
  });

  it("hands samples out oldest first across slots", () => {
    const trails = new TrailBuffer();
    trails.push(1, 0, -100, 1000);
    trails.push(0, 10, 100, 1000);
    trails.push(1, 100, -120, 1000);
    trails.push(0, 120, 120, 1000);
    trails.push(0, 400, 140, 1000);

    expect(trails.takeFinal(200).map((s) => [s.t, s.x])).toEqual([
      [0, -100],
      [10, 100],
      [100, -120],
      [120, 120],
    ]);
    expect(trails.takeFinal(460).map((s) => s.t)).toEqual([400]);
  });

  it("hands out the samples left after a prune, and none twice", () => {
    const trails = new TrailBuffer();
    for (const t of [0, 1000, 2000, 3000]) trails.push(0, t, t, 1000);
    expect(trails.takeFinal(1500).map((s) => s.t)).toEqual([0, 1000]);

    trails.prune(4500);

    expect(trails.samples(0).map((s) => s.t)).toEqual([2000, 3000]);
    expect(trails.takeFinal(4500).map((s) => s.t)).toEqual([2000, 3000]);
    expect(trails.takeFinal(9000)).toEqual([]);
  });

  it("never changes a sample it has handed out", () => {
    // The card's clock never runs backward; a push stamped before the last
    // sample still keeps the slot in time order and a final sample final.
    const trails = new TrailBuffer();
    trails.push(0, 100, 100, 1000);
    expect(trails.takeFinal(200)).toEqual([{ t: 100, x: 100, y: 1000 }]);

    expect(trails.push(0, 130, 999, 999)).toBe(true);
    expect(trails.push(0, 50, 150, 1000)).toBe(false);

    expect(trails.samples(0)).toEqual([
      { t: 100, x: 100, y: 1000 },
      { t: 130, x: 150, y: 1000 },
    ]);
  });

  it("ignores a position that is not a number", () => {
    const trails = new TrailBuffer();
    expect(trails.push(0, 0, NaN, 1000)).toBe(false);
    expect(trails.push(0, NaN, 100, 1000)).toBe(false);
    expect(trails.push(0, 0, 100, Infinity)).toBe(false);

    expect(trails.slots()).toEqual([]);
    expect(trails.samples(0)).toEqual([]);
  });

  it("averages a slot over the last 1.5 s weighted by time", () => {
    // Someone walks in toward (1500, 2500), slowing down as they arrive, and
    // stands still for 1 s. Home Assistant reports changes only, so standing
    // adds no samples at all.
    const trails = new TrailBuffer();
    const away = [2000, 1700, 1400, 1100, 850, 600, 400, 250, 160, 90, 40, 10, 0];
    away.forEach((d, i) => {
      trails.push(0, i * 100, Math.round(1500 - d * 0.6), Math.round(2500 + d * 0.8));
    });
    const now = 1200 + 1000;

    const corner = trails.average(0, now, 1500)!;

    expect(Math.hypot(corner.x - 1500, corner.y - 2500)).toBeLessThan(50);
    // The samples in the same window, averaged plainly, lean toward the walk in.
    const recent = trails.samples(0).filter((s) => s.t >= now - 1500);
    const plain = {
      x: recent.reduce((sum, s) => sum + s.x, 0) / recent.length,
      y: recent.reduce((sum, s) => sum + s.y, 0) / recent.length,
    };
    expect(Math.hypot(plain.x - 1500, plain.y - 2500)).toBeGreaterThan(80);
  });

  it("counts a sample current at the window start from the window start", () => {
    const trails = new TrailBuffer();
    trails.push(0, -1000, -5000, 1000); // current until 0, before the window
    trails.push(0, 0, 0, 1000); // current from 0, counted from 500
    trails.push(0, 1000, 1000, 1000); // current until now

    const mean = trails.average(0, 2000, 1500)!;

    expect(mean.x).toBeCloseTo((0 * 500 + 1000 * 1000) / 1500, 9);
    expect(mean.y).toBeCloseTo(1000, 9);
  });

  it("averages to where a still target stands when its samples are old", () => {
    // Every sample is older than the window: the last one has been current
    // all along.
    const trails = new TrailBuffer();
    trails.push(0, 0, 0, 1000);
    trails.push(0, 100, 600, 1400);

    expect(trails.average(0, 2900, 1500)).toEqual({ x: 600, y: 1400 });
  });

  it("averages to the current position when no time has passed", () => {
    const trails = new TrailBuffer();
    trails.push(0, 1000, 700, 2100);
    expect(trails.average(0, 1000, 1500)).toEqual({ x: 700, y: 2100 });

    trails.push(0, 1200, 900, 2300);
    expect(trails.average(0, 1200, 0)).toEqual({ x: 900, y: 2300 });
    // A now before the newest sample reads the sample current at that time.
    expect(trails.average(0, 1100, 0)).toEqual({ x: 700, y: 2100 });
  });

  it("has no average for a slot without samples", () => {
    const trails = new TrailBuffer();
    trails.push(0, 0, 100, 1000);

    expect(trails.average(1, 100, 1500)).toBeNull();
    trails.prune(5000);
    expect(trails.average(0, 5000, 1500)).toBeNull();
  });

  it("reports a trail only with two recent samples", () => {
    const trails = new TrailBuffer();
    expect(trails.hasTrail(0)).toBe(false);

    trails.push(0, 0, 100, 1000);
    expect(trails.hasTrail(100)).toBe(false);
    // One sample in each of two slots draws no segment either.
    trails.push(1, 100, -100, 1000);
    expect(trails.hasTrail(200)).toBe(false);

    trails.push(0, 500, 150, 1000);
    expect(trails.hasTrail(600)).toBe(true);
    expect(trails.hasTrail(2999)).toBe(true);
    // The older of the two is TRAIL_MS old here, which prune drops.
    expect(trails.hasTrail(3000)).toBe(false);
  });

  it("clear forgets every sample, handed out or not", () => {
    const trails = new TrailBuffer();
    trails.push(0, 0, 100, 1000);
    trails.push(0, 500, 150, 1000);
    trails.push(1, 500, -100, 1000);

    trails.clear();

    expect(trails.slots()).toEqual([]);
    expect(trails.samples(0)).toEqual([]);
    expect(trails.hasTrail(600)).toBe(false);
    expect(trails.takeFinal(10000)).toEqual([]);
    expect(trails.push(0, 700, 200, 1000)).toBe(true);
  });
});
