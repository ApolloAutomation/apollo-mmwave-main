/** The mount math, through the cases the backend shares. */

import { describe, expect, it } from "vitest";
import cases from "./fixtures/mount-cases.json";
import {
  COVERAGE_ZONE_STEPS,
  FOOTPRINT_STEPS,
  SIDE_COVERAGE,
  coverageEdgeDistanceMm,
  coverageZoneOutline,
  coverageFor,
  floorPoint,
  footprint,
  footprintHalfWidth,
  footprintOutline,
  insidePolygon,
  mountGeometry,
  mountRule,
} from "../src/mounts";
import * as mounts from "../src/mounts";
import { pointInPolygon, rotateToMap } from "../src/zone-map/geometry";
import { ceilingRadiusMm, mountRule as ld2460MountRule } from "../src/ld2460";
import type { MountGeometry } from "../src/mounts";

const label = (c: unknown) => JSON.stringify(c);
const geom = (c: { geometry: unknown }) => c.geometry as MountGeometry;

describe("the shared constants", () => {
  it.each(Object.entries(cases.constants))("%s", (name, value) => {
    expect((mounts as Record<string, unknown>)[name]).toBe(value);
  });
});

describe("the mount in effect", () => {
  it.each(cases.mount.map((c) => [label(c), c] as const))("%s", (_name, c) => {
    const saved = c.saved as string | null;
    expect(mountRule(c.tracker, c.mode_state, saved)).toEqual(c.expect);
    expect(ld2460MountRule(c.tracker, c.mode_state, saved)).toEqual(c.expect);
  });
});

describe("the geometry in use", () => {
  it.each(cases.geometry.map((c) => [label(c), c] as const))("%s", (_name, c) => {
    expect(mountGeometry(c.tracker, c.mode_state, c.entry as mounts.MountConfig | null)).toEqual(c.expect);
  });

  it("keeps at least half a meter between radar and person", () => {
    const g = mountGeometry("ld2450", null, {
      mount: "high",
      mount_height_mm: 1200,
      target_height_mm: 2000,
    });
    expect(g.dz_mm).toBe(500);
  });
});

describe("the floor point", () => {
  it.each(cases.floor.map((c) => [label(c), c] as const))("%s", (_name, c) => {
    const p = floorPoint(geom(c), c.x, c.y);
    expect(Math.abs(p.x - c.expect[0])).toBeLessThanOrEqual(0.1);
    expect(Math.abs(p.y - c.expect[1])).toBeLessThanOrEqual(0.1);
  });

  it("never moves a point sideways", () => {
    const g = mountGeometry("ld2450", null, { mount: "ceiling", flip_room_side: true });
    for (const x of [-2500, -10, 0, 900]) expect(floorPoint(g, x, 1900).x).toBe(x);
  });
});

describe("the footprint", () => {
  it.each(cases.footprint.map((c) => [label(c), c] as const))("%s", (_name, c) => {
    const g = geom(c);
    const print = footprint(g);
    if (c.expect === null) {
      expect(print).toBeUndefined();
      return;
    }
    expect(print).toBeDefined();
    expect(Math.abs(print!.y_near - c.expect.y_near)).toBeLessThanOrEqual(1);
    expect(Math.abs(print!.y_far - c.expect.y_far)).toBeLessThanOrEqual(1);
    expect(print!.outline).toHaveLength(c.expect.points);
    const near = (p: { x: number; y: number }, [x, y]: number[]) =>
      Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1;
    expect(near(print!.outline[0], c.expect.first)).toBe(true);
    expect(near(print!.outline[print!.outline.length - 1], c.expect.last)).toBe(true);
    for (const [y, w] of c.expect.widths) {
      expect(Math.abs(footprintHalfWidth(g, y) - w)).toBeLessThanOrEqual(1);
    }
  });

  it("goes counter-clockwise, and mirrored when flipped", () => {
    const shoelace = (points: { x: number; y: number }[]) =>
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length];
        return sum + p.x * q.y - q.x * p.y;
      }, 0);
    const room = mountGeometry("ld2450", null, { mount: "ceiling" });
    const flipped = mountGeometry("ld2450", null, { mount: "ceiling", flip_room_side: true });
    expect(shoelace(footprintOutline(room))).toBeGreaterThan(0);
    expect(shoelace(footprintOutline(flipped))).toBeGreaterThan(0);
    expect(footprintOutline(flipped).every((p) => p.y <= 0)).toBe(true);
    expect(footprintOutline(room)).toHaveLength(2 * (FOOTPRINT_STEPS + 1));
    expect(footprintOutline(room, COVERAGE_ZONE_STEPS)).toHaveLength(32);
  });

  it.each(cases.coverage_zone.map((c) => [label(c), c] as const))("coverage zone %s", (_name, c) => {
    const outline = coverageZoneOutline(geom(c), c.steps);
    expect(outline).toHaveLength(c.expect.length);
    outline.forEach((p, i) => {
      expect(Math.abs(p.x - c.expect[i][0])).toBeLessThanOrEqual(0.1);
      expect(Math.abs(p.y - c.expect[i][1])).toBeLessThanOrEqual(0.1);
    });
  });
});

describe("the distance to the edge of the view", () => {
  it.each(cases.edge.map((c) => [label(c), c] as const))("%s", (_name, c) => {
    const g = geom(c);
    const coverage = coverageFor(g, g.height_mm === null ? undefined : ceilingRadiusMm(g.height_mm));
    const distance = coverageEdgeDistanceMm(c.x, c.y, coverage);
    expect(Math.abs(distance - c.expect.edge_mm)).toBeLessThanOrEqual(0.5);
    expect(distance > 0).toBe(c.expect.inside);
  });

  it("never counts the wall line as an edge", () => {
    for (const flip of [false, true]) {
      const g = mountGeometry("ld2450", null, { mount: "ceiling", flip_room_side: flip });
      const print = footprint(g)!;
      expect(coverageEdgeDistanceMm(0, flip ? -0 : 0, print)).toBeCloseTo(print.y_far, 6);
      expect(insidePolygon(print.outline, 0, flip ? -1 : 1)).toBe(true);
    }
  });

  it("measures a cone and a circle as hold.py does", () => {
    expect(coverageEdgeDistanceMm(0, 3000, SIDE_COVERAGE)).toBeCloseTo(3000 * Math.sin(Math.PI / 3), 6);
    expect(coverageEdgeDistanceMm(0, 5900, SIDE_COVERAGE)).toBeCloseTo(100, 6);
    expect(coverageEdgeDistanceMm(5000, 100, SIDE_COVERAGE)).toBe(0);
    expect(coverageEdgeDistanceMm(1000, -1000, { range_mm: 4000, half_fov_deg: 180 })).toBeCloseTo(
      4000 - Math.SQRT2 * 1000,
      6
    );
  });

  it("measures each mount against its own view", () => {
    expect(coverageFor(mountGeometry("ld2450", null, {}))).toBe(SIDE_COVERAGE);
    expect(coverageFor(mountGeometry("ld2460", "side", {}))).toBe(SIDE_COVERAGE);
    expect(coverageFor(mountGeometry("ld2460", "top", {}), 4000)).toEqual({ range_mm: 4000, half_fov_deg: 180 });
    expect("outline" in coverageFor(mountGeometry("ld2450", null, { mount: "high" }))).toBe(true);
  });
});

describe("the coverage zone and the wall line", () => {
  const spots = [
    [0, 1600],
    [1000, 1700],
    [-2000, 1500],
  ];
  it.each([false, true].flatMap((flip) => [0, 30, 90, 180, -45].map((turn) => [flip, turn] as const)))(
    "takes in someone on the line, flip %s, turned %s",
    (flip, turn) => {
      const g = mountGeometry("ld2450", null, { mount: "ceiling", flip_room_side: flip });
      const zone = coverageZoneOutline(g).map((p) => {
        const m = rotateToMap(p.x, p.y, turn);
        return { x: Math.round(m.x) + 0, y: Math.round(m.y) + 0 };
      });
      for (const [x, y] of spots) {
        const floor = floorPoint(g, x, y);
        const at = rotateToMap(floor.x, floor.y, turn);
        expect(pointInPolygon(at.x, at.y, { points: zone })).toBe(true);
      }
    }
  );

  it("folds a point past the line back onto the room side", () => {
    const room = coverageFor(mountGeometry("ld2450", null, { mount: "ceiling" }));
    const flipped = coverageFor(mountGeometry("ld2450", null, { mount: "ceiling", flip_room_side: true }));
    expect(coverageEdgeDistanceMm(0, -100, room)).toBeCloseTo(coverageEdgeDistanceMm(0, 100, room), 6);
    expect(coverageEdgeDistanceMm(0, 100, flipped)).toBeCloseTo(coverageEdgeDistanceMm(0, -100, flipped), 6);
    expect(coverageEdgeDistanceMm(0, -100, room)).toBeGreaterThan(1000);
  });
});
