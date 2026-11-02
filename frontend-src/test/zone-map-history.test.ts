/**
 * Movement history replay: the packed columns of apollo_mmwave/movement/get
 * decoded into per-slot series, and what a slot shows at a replay time T.
 * Positions are raw frame mm; times are the server's epoch ms.
 */

import { describe, it, expect } from "vitest";
import type { MovementPayload } from "../src/zone-map/api";
import {
  HEAT_WEIGHT_CAP_MS,
  REPLAY_INTERP_MAX_GAP_MS,
  REPLAY_VISIBLE_MS,
  decodeMovement,
  heatCells,
  positionAt,
  sparkBuckets,
  trailAt,
  type MovementSeries,
  type SlotSeries,
} from "../src/zone-map/history";

/** The backend's example answer (the integration's contract). */
const EXAMPLE: MovementPayload = {
  enabled: true,
  now: 1767229200000,
  since: 1767225600000,
  retention_s: 86400,
  n: 4,
  t0: 1767225590000,
  dt: "AAAAAPQBAAAAAgAAjDoAAA==",
  s: "AAAAAAEA//8=",
  x: "eACqAOD8AAA=",
  y: "YAlqCRwMAAA=",
};

/** One record: [t, s, x, y], with s = -1 - slot on a gone marker. */
type Row = [t: number, s: number, x: number, y: number];

const point = (t: number, slot: number, x: number, y: number): Row => [t, slot, x, y];
const gone = (t: number, slot: number): Row => [t, -1 - slot, 0, 0];

/** Little-endian values as base64, the way the backend packs a column. */
function column(values: number[], bytes: 2 | 4): string {
  const view = new DataView(new ArrayBuffer(values.length * bytes));
  values.forEach((value, i) => {
    if (bytes === 4) view.setUint32(i * 4, value, true);
    else view.setInt16(i * 2, value, true);
  });
  let binary = "";
  new Uint8Array(view.buffer).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/** An answer holding `rows`, which must be sorted by time. */
function pack(rows: Row[], now = 1767229200000, since = now - 3600000): MovementPayload {
  const t = rows.map((row) => row[0]);
  return {
    enabled: true,
    now,
    since,
    retention_s: 86400,
    n: rows.length,
    t0: rows.length > 0 ? t[0] : null,
    dt: column(
      t.map((value, i) => (i === 0 ? 0 : value - t[i - 1])),
      4
    ),
    s: column(
      rows.map((row) => row[1]),
      2
    ),
    x: column(
      rows.map((row) => row[2]),
      2
    ),
    y: column(
      rows.map((row) => row[3]),
      2
    ),
  };
}

/** One slot's series straight from rows of that slot. */
function series(rows: Row[]): SlotSeries {
  const slots = decodeMovement(pack(rows)).slots;
  expect(slots.size).toBe(1);
  return slots.values().next().value as SlotSeries;
}

/** A slot's series as plain arrays, for toEqual. */
function plain(s: SlotSeries | undefined) {
  if (!s) return undefined;
  return {
    t: Array.from(s.t),
    x: Array.from(s.x),
    y: Array.from(s.y),
    gone: Array.from(s.gone),
  };
}

describe("decodeMovement", () => {
  it("decodes base64 columns into sorted per-slot series", () => {
    const decoded = decodeMovement(EXAMPLE);

    expect(decoded.since).toBe(1767225600000);
    expect(decoded.now).toBe(1767229200000);
    expect(decoded.count).toBe(4);
    expect(Array.from(decoded.slots.keys())).toEqual([0, 1]);
    // dt [0, 500, 512, 14988]; s [0, 0, 1, -1]: the last record is slot 0's
    // gone marker. The first record is a carry-in, before since.
    expect(plain(decoded.slots.get(0))).toEqual({
      t: [1767225590000, 1767225590500, 1767225606000],
      x: [120, 170, 0],
      y: [2400, 2410, 0],
      gone: [0, 0, 1],
    });
    expect(plain(decoded.slots.get(1))).toEqual({
      t: [1767225591012],
      x: [-800],
      y: [3100],
      gone: [0],
    });
    const slot0 = decoded.slots.get(0)!;
    expect(slot0.t).toBeInstanceOf(Float64Array);
    expect(slot0.x).toBeInstanceOf(Int32Array);
    expect(slot0.y).toBeInstanceOf(Int32Array);
    expect(slot0.gone).toBeInstanceOf(Uint8Array);
  });

  it("packs the example the way the backend does", () => {
    // Pins this file's encoder, which the other tests build answers with.
    const packed = pack(
      [
        point(1767225590000, 0, 120, 2400),
        point(1767225590500, 0, 170, 2410),
        point(1767225591012, 1, -800, 3100),
        gone(1767225606000, 0),
      ],
      EXAMPLE.now,
      EXAMPLE.since
    );
    expect(packed).toEqual(EXAMPLE);
  });

  it("orders the slots by number, whichever reports first", () => {
    const decoded = decodeMovement(
      pack([point(1000, 2, 100, 1000), point(1200, 0, -100, 1000), point(1400, 1, 0, 2000)])
    );

    expect(Array.from(decoded.slots.keys())).toEqual([0, 1, 2]);
    expect(plain(decoded.slots.get(2))?.t).toEqual([1000]);
  });

  it("decodes an answer with no records", () => {
    const off: MovementPayload = {
      enabled: false,
      now: 1767229200000,
      since: 1767142800000,
      retention_s: 86400,
      n: 0,
      t0: null,
      dt: "",
      s: "",
      x: "",
      y: "",
    };

    const decoded = decodeMovement(off);

    expect(decoded.slots.size).toBe(0);
    expect(decoded.count).toBe(0);
    expect(decoded.since).toBe(1767142800000);
    expect(decoded.now).toBe(1767229200000);
  });

  it("rejects columns whose length does not match n", () => {
    expect(() => decodeMovement({ ...EXAMPLE, n: 3 })).toThrow(
      "the dt column has 16 bytes where 3 records need 12"
    );
    expect(() => decodeMovement({ ...EXAMPLE, n: 5 })).toThrow(/dt column/);
    const short = btoa(atob(EXAMPLE.x).slice(0, 7));
    expect(() => decodeMovement({ ...EXAMPLE, x: short })).toThrow(
      "the x column has 7 bytes where 4 records need 8"
    );
    expect(() => decodeMovement({ ...EXAMPLE, y: "" })).toThrow(/y column/);
    expect(() => decodeMovement({ ...EXAMPLE, s: EXAMPLE.x + "AAAA" })).toThrow(/s column/);
  });

  it("rejects an answer it cannot decode", () => {
    expect(() => decodeMovement({ ...EXAMPLE, s: "not base64!" })).toThrow(
      "the s column is not base64"
    );
    expect(() => decodeMovement({ ...EXAMPLE, t0: null })).toThrow(/no start time/);
    expect(() => decodeMovement({ ...EXAMPLE, n: 1.5 })).toThrow(/not a whole number/);
    expect(() => decodeMovement({ ...EXAMPLE, n: -1 })).toThrow(/not a whole number/);
    expect(() => decodeMovement({ ...EXAMPLE, dt: [0, 500] as any })).toThrow(/dt column/);
  });
});

describe("positionAt", () => {
  it("shows nothing before a slot's first record", () => {
    const s = series([point(1000, 0, 100, 2000)]);

    expect(positionAt(s, 999)).toBeNull();
    expect(positionAt(s, 1000)).toEqual({ x: 100, y: 2000 });
  });

  it("hides a slot after its gone marker", () => {
    const s = series([
      point(0, 0, 100, 1000),
      point(400, 0, 150, 1000),
      gone(5000, 0),
      point(8000, 0, -2000, 3000),
    ]);

    // No slide toward a gone marker: the dot stays put until it.
    expect(positionAt(s, 4999)).toEqual({ x: 150, y: 1000 });
    expect(positionAt(s, 5000)).toBeNull();
    expect(positionAt(s, 7999)).toBeNull();
    expect(positionAt(s, 8000)).toEqual({ x: -2000, y: 3000 });
  });

  it("hides a slot after 20 s without records", () => {
    expect(REPLAY_VISIBLE_MS).toBe(20000);
    const s = series([point(0, 0, 100, 1000), point(40000, 0, 120, 1000)]);

    expect(positionAt(s, 20000)).toEqual({ x: 100, y: 1000 });
    expect(positionAt(s, 20001)).toBeNull();
    expect(positionAt(s, 39999)).toBeNull();
    expect(positionAt(s, 40000)).toEqual({ x: 120, y: 1000 });
    expect(positionAt(s, 60000)).toEqual({ x: 120, y: 1000 });
    expect(positionAt(s, 60001)).toBeNull();
  });

  it("interpolates only plausible gaps", () => {
    // A walk: the dot slides between records.
    const walk = series([point(0, 0, 0, 2000), point(1000, 0, 500, 2000)]);
    expect(positionAt(walk, 250)).toEqual({ x: 125, y: 2000 });
    expect(positionAt(walk, 1000)).toEqual({ x: 500, y: 2000 });

    // 600 mm plus 1.6 mm per ms of gap is as far as a person goes: 2.2 m in
    // 1 s slides, a step more jumps.
    const reach = series([point(0, 0, 0, 2000), point(1000, 0, 2200, 2000)]);
    expect(positionAt(reach, 500)).toEqual({ x: 1100, y: 2000 });
    const swap = series([point(0, 0, 0, 2000), point(1000, 0, 2201, 2000)]);
    expect(positionAt(swap, 500)).toEqual({ x: 0, y: 2000 });
    expect(positionAt(swap, 999)).toEqual({ x: 0, y: 2000 });
    expect(positionAt(swap, 1000)).toEqual({ x: 2201, y: 2000 });

    // Two records more than 16 s apart are not joined either.
    expect(REPLAY_INTERP_MAX_GAP_MS).toBe(16000);
    const joined = series([point(0, 0, 0, 2000), point(16000, 0, 160, 2000)]);
    expect(positionAt(joined, 8000)).toEqual({ x: 80, y: 2000 });
    const apart = series([point(0, 0, 0, 2000), point(16001, 0, 160, 2000)]);
    expect(positionAt(apart, 8000)).toEqual({ x: 0, y: 2000 });
    expect(positionAt(apart, 16000)).toEqual({ x: 0, y: 2000 });
    expect(positionAt(apart, 16001)).toEqual({ x: 160, y: 2000 });
  });

  it("holds a still target between its 15 s heartbeats", () => {
    const s = series([
      point(0, 0, 700, 2500),
      point(15000, 0, 700, 2500),
      point(30000, 0, 700, 2500),
    ]);

    for (const T of [0, 7500, 15000, 29999, 30000, 50000]) {
      expect(positionAt(s, T), String(T)).toEqual({ x: 700, y: 2500 });
    }
    expect(positionAt(s, 50001)).toBeNull();
  });
});

describe("trailAt", () => {
  const walk = series([
    point(0, 0, 0, 2000),
    point(500, 0, 200, 2000),
    point(1000, 0, 400, 2000),
    point(1500, 0, 600, 2000),
    gone(2000, 0),
    point(2300, 0, -1500, 4000),
    point(2600, 0, -1400, 4000),
  ]);

  it("runs from the window start to the dot", () => {
    expect(trailAt(walk, 1250, 1000)).toEqual([
      { t: 500, x: 200, y: 2000 },
      { t: 1000, x: 400, y: 2000 },
      // The dot has slid halfway to the next record.
      { t: 1250, x: 500, y: 2000 },
    ]);
    expect(trailAt(walk, 1500, 3000)).toEqual([
      { t: 0, x: 0, y: 2000 },
      { t: 500, x: 200, y: 2000 },
      { t: 1000, x: 400, y: 2000 },
      { t: 1500, x: 600, y: 2000 },
    ]);
  });

  it("ends a trail at a gone marker", () => {
    // The slot's next target can be someone else entirely.
    expect(trailAt(walk, 2700, 3000)).toEqual([
      { t: 2300, x: -1500, y: 4000 },
      { t: 2600, x: -1400, y: 4000 },
    ]);
  });

  it("is empty while the slot shows nothing", () => {
    expect(trailAt(walk, -1, 3000)).toEqual([]);
    expect(trailAt(walk, 2100, 3000)).toEqual([]);
  });

  it("keeps only the slide when every record is older than the window", () => {
    const slow = series([point(0, 0, 0, 2000), point(10000, 0, 1000, 2000)]);

    expect(trailAt(slow, 5000, 3000)).toEqual([{ t: 5000, x: 500, y: 2000 }]);
  });
});

describe("heatCells", () => {
  it("time-weights the heatmap", () => {
    expect(HEAT_WEIGHT_CAP_MS).toBe(15000);
    // Someone crosses two cells in a second, then stands in a third for
    // 39 s (heartbeats every 15 s) and leaves.
    const m = decodeMovement(
      pack([
        point(0, 0, 100, 100),
        point(500, 0, 500, 100),
        point(1000, 0, 900, 100),
        point(16000, 0, 900, 100),
        point(31000, 0, 900, 100),
        gone(40000, 0),
      ])
    );

    const grid = heatCells(m, 0, 60000);

    const weights: Record<string, number> = {};
    for (const [ix, iy, value] of grid.entries()) weights[`${ix},${iy}`] = value;
    expect(weights).toEqual({ "0,0": 0.5, "2,0": 0.5, "4,0": 39 });
    expect(grid.max).toBe(39);
  });

  it("caps the dwell of one point at 15 s", () => {
    const m = decodeMovement(
      pack([point(0, 0, 100, 100), point(60000, 0, 500, 100), point(60500, 1, -900, 100)])
    );

    const weights: Record<string, number> = {};
    for (const [ix, iy, value] of heatCells(m, 0, 120000).entries()) {
      weights[`${ix},${iy}`] = value;
    }
    // A slot's last point stands until `to`, capped the same way.
    expect(weights).toEqual({ "0,0": 15, "2,0": 15, "-5,0": 15 });
  });

  it("counts only the dwell inside the range", () => {
    // A carry-in point from before the range start, and a last point whose
    // dwell would run past the end.
    const m = decodeMovement(pack([point(-10000, 0, 100, 100), point(5000, 1, 900, 100)]));

    const weights: Record<string, number> = {};
    for (const [ix, iy, value] of heatCells(m, 0, 8000).entries()) {
      weights[`${ix},${iy}`] = value;
    }
    expect(weights).toEqual({ "0,0": 5, "4,0": 3 });
  });

  it("bins raw frame points into the cell size it is given", () => {
    const m = decodeMovement(pack([point(0, 0, 450, -450), point(1000, 0, 550, -450)]));

    const cells: [number, number, number][] = [...heatCells(m, 0, 2000, 500).entries()];

    expect(cells).toEqual([
      [0, -1, 1],
      [1, -1, 1],
    ]);
  });

  it("adds nothing for gone markers or an empty answer", () => {
    expect(heatCells(decodeMovement(pack([gone(0, 0), gone(500, 1)])), 0, 1000).size).toBe(0);
    expect(heatCells(decodeMovement(pack([])), 0, 1000).size).toBe(0);
  });
});

describe("sparkBuckets", () => {
  it("buckets the sparkline", () => {
    const m: MovementSeries = decodeMovement(
      pack([
        point(-10, 0, 100, 100), // carry-in, before the range
        point(0, 0, 100, 100),
        point(100, 1, 100, 100),
        point(300, 0, 100, 100),
        gone(600, 0),
        point(999, 1, 100, 100),
        point(1000, 1, 100, 100), // the range end counts in the last bucket
        point(1001, 1, 100, 100), // after the range
      ])
    );

    expect(sparkBuckets(m, 0, 1000, 4)).toEqual([2, 1, 0, 2]);
    expect(sparkBuckets(m, 0, 1000, 1)).toEqual([5]);
  });

  it("returns empty buckets for an empty range or answer", () => {
    const m = decodeMovement(pack([point(500, 0, 100, 100)]));

    expect(sparkBuckets(m, 1000, 1000, 3)).toEqual([0, 0, 0]);
    expect(sparkBuckets(m, 2000, 1000, 3)).toEqual([0, 0, 0]);
    expect(sparkBuckets(decodeMovement(pack([])), 0, 1000, 2)).toEqual([0, 0]);
    expect(sparkBuckets(m, 0, 1000, 0)).toEqual([]);
    expect(sparkBuckets(m, 0, 1000, NaN)).toEqual([]);
  });

  it("spreads 120 buckets over a range", () => {
    const rows: Row[] = [];
    for (let t = 0; t < 3600000; t += 30000) rows.push(point(t, 0, 100, 100));
    const m = decodeMovement(pack(rows));

    const buckets = sparkBuckets(m, 0, 3600000, 120);

    expect(buckets).toHaveLength(120);
    expect(buckets.every((count) => count === 1)).toBe(true);
  });
});
