/**
 * Corner snapping while a zone is drawn by hand: about a tenth of the grid
 * step the map shows, on round values in the map's unit, counted from the
 * radar.
 */

import { describe, expect, it } from "vitest";
import { snapDecimals, snapMm, snapStepMm } from "../src/zone-map/snap";

describe("zone map snap step", () => {
  it("is 10 cm at a 1 m grid, and finer as the grid gets finer", () => {
    expect(snapStepMm(1000, "m")).toBe(100);
    expect(snapStepMm(500, "m")).toBe(50);
    expect(snapStepMm(200, "m")).toBe(20);
    expect(snapStepMm(100, "m")).toBe(10);
    expect(snapStepMm(2000, "m")).toBe(200);
    expect(snapStepMm(5000, "m")).toBe(500);
  });

  it("never goes finer than 1 cm, or coarser than 1 m", () => {
    expect(snapStepMm(50, "m")).toBe(10);
    expect(snapStepMm(1, "m")).toBe(10);
    expect(snapStepMm(100000, "m")).toBe(1000);
  });

  it("snaps to whole inches in feet", () => {
    // 2 ft is 24 in, a tenth 2.4 in: 2 in.
    expect(snapStepMm(2 * 304.8, "ft")).toBeCloseTo(2 * 25.4, 9);
    expect(snapStepMm(304.8, "ft")).toBeCloseTo(25.4, 9);
    expect(snapStepMm(5 * 304.8, "ft")).toBeCloseTo(6 * 25.4, 9);
    expect(snapStepMm(10 * 304.8, "ft")).toBeCloseTo(12 * 25.4, 9);
    // 3 in and 6 in grids, zoomed in: never under an inch.
    expect(snapStepMm(76.2, "ft")).toBeCloseTo(25.4, 9);
    expect(snapStepMm(152.4, "ft")).toBeCloseTo(25.4, 9);
  });

  it("takes a step in feet that float error left a hair short", () => {
    // 10 ft as a fitted grid in feet can come out 3047.9999999 mm.
    expect(snapStepMm(10 * 304.8 - 1e-7, "ft")).toBeCloseTo(12 * 25.4, 9);
  });

  it("falls back to the finest snap for a grid step that is not a number", () => {
    expect(snapStepMm(NaN, "m")).toBe(10);
    expect(snapStepMm(NaN, "ft")).toBeCloseTo(25.4, 9);
  });
});

describe("zone map snapping", () => {
  it("puts a value on the nearest multiple of the step, counted from 0", () => {
    expect(snapMm(1234, 100)).toBe(1200);
    expect(snapMm(1250, 100)).toBe(1300);
    expect(snapMm(-1234, 100)).toBe(-1200);
    expect(snapMm(1234, 50)).toBe(1250);
    expect(snapMm(30, 100)).toBe(0);
    expect(Object.is(snapMm(-30, 100), 0)).toBe(true);
  });

  it("snaps to whole inches, which the save then rounds to whole mm", () => {
    // 3 in is 76.2 mm, saved as 76.
    expect(snapMm(80, 25.4)).toBeCloseTo(76.2, 9);
    expect(Math.round(snapMm(80, 25.4))).toBe(76);
  });

  it("leaves a value alone with no step to snap to", () => {
    expect(snapMm(1234.5, 0)).toBe(1234.5);
    expect(snapMm(1234.5, NaN)).toBe(1234.5);
    expect(snapMm(NaN, 100)).toBeNaN();
  });

  it("shows a second decimal in meters only for snaps finer than 10 cm", () => {
    expect(snapDecimals(100, "m")).toBe(1);
    expect(snapDecimals(200, "m")).toBe(1);
    expect(snapDecimals(50, "m")).toBe(2);
    expect(snapDecimals(10, "m")).toBe(2);
    expect(snapDecimals(25.4, "ft")).toBe(0);
  });
});
