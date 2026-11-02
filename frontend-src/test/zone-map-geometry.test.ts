/**
 * The zone map's point-in-zone tests and rotation, which must answer exactly
 * as the presence sensors' testers in custom_components/apollo_mmwave/targets.py
 * do. The card uses them to draw a target inside an ignore zone hollow and to
 * light the zones a replayed dot is in; a disagreement would show a target as
 * ignored that presence still counts. The cases follow tests/test_binary_sensor.py.
 */

import { describe, it, expect } from "vitest";
import {
  pointInEllipse,
  pointInPolygon,
  pointInRect,
  pointInZone,
  rotateToMap,
} from "../src/zone-map/geometry";

const RECT = { x_min: -1000, x_max: 1000, y_min: 0, y_max: 2000 };
const ELLIPSE = { cx: 0, cy: 1000, rx: 500, ry: 1000 };
const TRIANGLE = {
  points: [
    { x: -1000, y: 0 },
    { x: 1000, y: 0 },
    { x: 0, y: 2000 },
  ],
};
/** A U: the arms and the base count, the notch between the arms does not. */
const NOTCHED = {
  points: [
    { x: -1500, y: 0 },
    { x: 1500, y: 0 },
    { x: 1500, y: 3000 },
    { x: 500, y: 3000 },
    { x: 500, y: 1000 },
    { x: -500, y: 1000 },
    { x: -500, y: 3000 },
    { x: -1500, y: 3000 },
  ],
};

describe("zone map geometry", () => {
  it("matches the backend's rect, ellipse and polygon rules", () => {
    // Rect: inclusive on every edge.
    expect(pointInRect(0, 1000, RECT)).toBe(true);
    expect(pointInRect(-1000, 0, RECT)).toBe(true);
    expect(pointInRect(1000, 2000, RECT)).toBe(true);
    expect(pointInRect(1000.001, 1000, RECT)).toBe(false);
    expect(pointInRect(0, -0.001, RECT)).toBe(false);

    // Ellipse: the center and the rim count, a point past the rim does not.
    expect(pointInEllipse(0, 1000, ELLIPSE)).toBe(true);
    expect(pointInEllipse(500, 1000, ELLIPSE)).toBe(true);
    expect(pointInEllipse(0, 2000, ELLIPSE)).toBe(true);
    expect(pointInEllipse(600, 1000, ELLIPSE)).toBe(false);

    // Polygon: inside the triangle, and out past its slanted edge while still
    // inside its bounding box.
    expect(pointInPolygon(0, 500, TRIANGLE)).toBe(true);
    expect(pointInPolygon(900, 1500, TRIANGLE)).toBe(false);
    expect(pointInPolygon(2000, 1000, TRIANGLE)).toBe(false);
    expect(pointInPolygon(0, 500, NOTCHED)).toBe(true);
    expect(pointInPolygon(0, 2000, NOTCHED)).toBe(false);
    expect(pointInPolygon(1000, 2000, NOTCHED)).toBe(true);
    expect(pointInPolygon(-1000, 2500, NOTCHED)).toBe(true);
    // Points on the boundary read inside or out by which edge they are on,
    // not by any rule a user would expect. These are the backend testers'
    // own answers for the triangle's edges and corners.
    const boundary: [number, number, boolean][] = [
      [500, 1000, true], // right slanted edge
      [-500, 1000, false], // left slanted edge
      [0, 0, true], // base edge
      [-1000, 0, false],
      [1000, 0, true],
      [0, 2000, false],
    ];
    for (const [x, y, inside] of boundary) {
      expect([x, y, pointInPolygon(x, y, TRIANGLE)]).toEqual([x, y, inside]);
    }

    // The shape picks the tester.
    expect(pointInZone("rect", RECT, 0, 1000)).toBe(true);
    expect(pointInZone("ellipse", ELLIPSE, 0, 1000)).toBe(true);
    expect(pointInZone("polygon", TRIANGLE, 0, 500)).toBe(true);
  });

  it.each([
    ["no shape", undefined, RECT],
    ["shape none", "none", RECT],
    ["an unknown shape", "blob", RECT],
    ["a prototype key as the shape", "constructor", RECT],
    ["rect with no data", "rect", null],
    ["rect with a list for data", "rect", [0, 0, 1, 1]],
    ["a zero-width rect", "rect", { x_min: 0, x_max: 0, y_min: 0, y_max: 2000 }],
    ["an inverted rect", "rect", { x_min: 1000, x_max: -1000, y_min: 0, y_max: 2000 }],
    ["a rect missing a corner", "rect", { x_min: -1000, x_max: 1000, y_min: 0 }],
    ["a rect with a word for a corner", "rect", { ...RECT, x_max: "far" }],
    ["a flat ellipse", "ellipse", { cx: 0, cy: 1000, rx: 0, ry: 1000 }],
    ["an ellipse with a negative radius", "ellipse", { cx: 0, cy: 1000, rx: -5, ry: 10 }],
    ["a two-point polygon", "polygon", { points: [{ x: -1000, y: 0 }, { x: 1000, y: 2000 }] }],
    ["a polygon with a bad point", "polygon", { points: [...TRIANGLE.points, null] }],
    ["a polygon with a missing y", "polygon", { points: [...TRIANGLE.points, { x: 5 }] }],
    ["a polygon whose points are not a list", "polygon", { points: "0,0 1,1 2,0" }],
  ])("never reads a point inside %s", (_label, shape, data) => {
    expect(pointInZone(shape as string | undefined, data, 0, 1000)).toBe(false);
    expect(pointInZone(shape as string | undefined, data, 0, 500)).toBe(false);
  });

  it("reads stored numbers the way Python's float() does", () => {
    // A hand-edited store can hold strings and booleans; the backend's
    // _coerce_float reads them with float(), so the card does too.
    const strings = { x_min: " -1_000 ", x_max: "1e3", y_min: "0.", y_max: "+2000" };
    expect(pointInRect(0, 1000, strings)).toBe(true);
    expect(pointInRect(0, 1000, { ...RECT, x_min: true })).toBe(false);
    expect(pointInRect(0.5, 1000, { ...RECT, x_min: false, x_max: true })).toBe(true);
    expect(pointInRect(5000, 1000, { ...RECT, x_max: "Infinity" })).toBe(true);
    // Spellings Python refuses are no number at all, not 0 or 16.
    for (const bad of ["", "0x10", "1__0", "1e", "_1"]) {
      expect(pointInRect(0, 1000, { ...RECT, x_min: bad })).toBe(false);
    }
    // nan compares false everywhere, so no point is ever inside.
    expect(pointInRect(0, 1000, { ...RECT, x_min: "nan" })).toBe(false);
    expect(pointInEllipse(0, 1000, { ...ELLIPSE, rx: "NaN" })).toBe(false);
  });

  it("rotates points the way the presence sensor does", () => {
    // tests/test_binary_sensor.py pins the same table for build_point_rotator.
    const cases: [number, number, number][] = [
      [90, 0, -1000],
      [-90, 0, 1000],
      [180, -1000, 0],
      // Not a right angle, so degrees taken as radians cannot pass by luck.
      [45, 1000 / Math.SQRT2, -1000 / Math.SQRT2],
      [0, 1000, 0],
      [NaN, 1000, 0],
      [Infinity, 1000, 0],
    ];
    for (const [deg, x, y] of cases) {
      const p = rotateToMap(1000, 0, deg);
      expect(p.x).toBeCloseTo(x, 6);
      expect(p.y).toBeCloseTo(y, 6);
    }
    // Straight ahead turns to the radar's right under a positive rotation.
    const ahead = rotateToMap(0, 2000, 90);
    expect(ahead.x).toBeCloseTo(2000, 6);
    expect(ahead.y).toBeCloseTo(0, 6);
  });
});
