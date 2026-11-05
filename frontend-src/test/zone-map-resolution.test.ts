/**
 * The zone map canvas's backing store and logical width (resolution.ts).
 */

import { describe, it, expect } from "vitest";
import {
  BACKING_MAX_PIXELS,
  FULL_WINDOW_LOGICAL_MAX_PX,
  backingStore,
  logicalWidth,
} from "../src/zone-map/resolution";

describe("backingStore", () => {
  it("gives a 4:3 map drawn 800 CSS px wide at DPR 2 a 1600 x 1200 store", () => {
    expect(backingStore(800, 600, 800, 2)).toEqual({ width: 1600, height: 1200 });
  });

  it("never goes under one store px per logical px", () => {
    // 400 CSS px at DPR 2 is 800 device px: the logical 800 already.
    expect(backingStore(800, 600, 400, 2)).toEqual({ width: 800, height: 600 });
    // A canvas with no layout box yet.
    expect(backingStore(800, 600, 0, 2)).toEqual({ width: 800, height: 600 });
    expect(backingStore(800, 600, NaN, 1)).toEqual({ width: 800, height: 600 });
  });

  it("follows the device px between one and three per logical px", () => {
    expect(backingStore(800, 800, 1000, 1)).toEqual({ width: 1000, height: 1000 });
    expect(backingStore(800, 600, 1000, 3)).toEqual({ width: 2400, height: 1800 });
    // A ratio that is not a number is 1.
    expect(backingStore(800, 600, 900, NaN)).toEqual({ width: 900, height: 675 });
  });

  it("keeps the store at or under six million px", () => {
    const store = backingStore(1600, 1200, 1700, 2);
    expect(store.width * store.height).toBeLessThanOrEqual(BACKING_MAX_PIXELS);
    // Still the map's shape, and still sharper than one px per logical px.
    expect(store.width / store.height).toBeCloseTo(1600 / 1200, 2);
    expect(store.width).toBeGreaterThan(1600);
  });
});

describe("logicalWidth", () => {
  it("is the card's 800 px, and while expanded the map's width up to the cap", () => {
    expect(logicalWidth(800, null)).toBe(800);
    expect(logicalWidth(800, 500)).toBe(800);
    expect(logicalWidth(800, 1257.6)).toBe(1258);
    expect(logicalWidth(800, 2400)).toBe(FULL_WINDOW_LOGICAL_MAX_PX);
  });
});
