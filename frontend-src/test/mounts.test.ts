/** The mount math, through the cases the backend shares. */

import { describe, expect, it } from "vitest";
import cases from "./fixtures/mount-cases.json";
import {
  COVERAGE_ZONE_STEPS,
  FOOTPRINT_STEPS,
  SIDE_COVERAGE,
  coverageEdgeDistanceMm,
  coverageFor,
  floorPoint,
  footprint,
  footprintHalfWidth,
  footprintOutline,
  insidePolygon,
  mountGeometry,
  mountRule,
} from "../src/mounts";
import { mountRule as ld2460MountRule } from "../src/ld2460";

const label = (c: unknown) => JSON.stringify(c);
const geom = (c: { tracker: string; entry: Record<string, unknown>; mode_state?: string | null }) =>
  mountGeometry(c.tracker, c.mode_state ?? null, c.entry);

describe("the mount in effect", () => {
  it.each(cases.mount.map((c) => [label(c), c] as const))("%s", (_name, c) => {
    expect(mountRule(c.tracker, c.mode_state, c.saved)).toEqual(c.expect);
    expect(ld2460MountRule(c.tracker, c.mode_state, c.saved)).toEqual(c.expect);
  });
});

describe("the geometry in use", () => {
  it.each(cases.geometry.map((c) => [label(c), c] as const))("%s", (_name, c) => {
    expect(geom(c)).toEqual(c.expect);
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
    expect(Math.abs(p.x - c.expect.x)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(p.y - c.expect.y)).toBeLessThanOrEqual(0.1);
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
    for (const { y, w } of c.expect.half_width) {
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
});

describe("the distance to the edge of the view", () => {
  it.each(cases.edge.map((c) => [label(c), c] as const))("%s", (_name, c) => {
    const print = footprint(geom(c))!;
    expect(insidePolygon(print.outline, c.x, c.y)).toBe(c.expect.inside);
    expect(Math.abs(coverageEdgeDistanceMm(c.x, c.y, print) - c.expect.edge_mm)).toBeLessThanOrEqual(0.5);
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
