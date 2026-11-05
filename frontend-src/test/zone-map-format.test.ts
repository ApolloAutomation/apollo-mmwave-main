/**
 * Sizes and hold times as the zone map writes them: the readout while
 * drawing, the Walk preview, the zone editor and the Hold select all read
 * from these, so the exact strings are pinned here.
 */

import { describe, it, expect } from "vitest";
import { formatHold, formatLength, formatSize, zoneSize } from "../src/zone-map/format";

describe("formatLength", () => {
  it("formats meters to 0.1 m", () => {
    expect(formatLength(2400, "m")).toBe("2.4 m");
    expect(formatLength(1000, "m")).toBe("1.0 m");
    expect(formatLength(6000, "m")).toBe("6.0 m");
    expect(formatLength(1234, "m")).toBe("1.2 m");
    expect(formatLength(1250, "m")).toBe("1.3 m");
    expect(formatLength(12345, "m")).toBe("12.3 m");
    expect(formatLength(49, "m")).toBe("0.0 m");
    expect(formatLength(0, "m")).toBe("0.0 m");
  });

  it("formats feet and inches with the 12-inch carry", () => {
    expect(formatLength(3657.6, "ft")).toBe("12 ft");
    // 143.6 in rounds to 144 before the split, so it never reads "11 ft 12 in".
    expect(formatLength(3647, "ft")).toBe("12 ft");
    expect(formatLength(2413, "ft")).toBe("7 ft 11 in");
    expect(formatLength(279, "ft")).toBe("11 in");
    expect(formatLength(2438.4, "ft")).toBe("8 ft");
    expect(formatLength(2997.2, "ft")).toBe("9 ft 10 in");
    expect(formatLength(305, "ft")).toBe("1 ft");
    expect(formatLength(13, "ft")).toBe("1 in");
  });

  it("reads a length that rounds to nothing as zero, in either family", () => {
    expect(formatLength(0, "ft")).toBe("0 ft");
    expect(formatLength(12, "ft")).toBe("0 ft");
    expect(formatLength(-12, "ft")).toBe("0 ft");
    expect(formatLength(-40, "m")).toBe("0.0 m");
    expect(formatLength(-0, "m")).toBe("0.0 m");
  });

  it("keeps the sign of a negative length", () => {
    expect(formatLength(-2400, "m")).toBe("-2.4 m");
    expect(formatLength(-60, "m")).toBe("-0.1 m");
    expect(formatLength(-2413, "ft")).toBe("-7 ft 11 in");
    expect(formatLength(-279, "ft")).toBe("-11 in");
    expect(formatLength(-3647, "ft")).toBe("-12 ft");
  });

  it("takes a second decimal in meters, for corners that snap finer than 10 cm", () => {
    expect(formatLength(2450, "m", 2)).toBe("2.45 m");
    expect(formatLength(2400, "m", 2)).toBe("2.40 m");
    expect(formatLength(20, "m", 2)).toBe("0.02 m");
    expect(formatLength(-4, "m", 2)).toBe("0.00 m");
    expect(formatLength(-2450, "m", 2)).toBe("-2.45 m");
    // Feet read in whole inches whatever the decimals.
    expect(formatLength(2413, "ft", 2)).toBe("7 ft 11 in");
  });
});

describe("formatSize", () => {
  it("formats a size as width × depth", () => {
    expect(formatSize(2400, 1800, "m")).toBe("2.4 m × 1.8 m");
    expect(formatSize(2413, 2997.2, "ft")).toBe("7 ft 11 in × 9 ft 10 in");
    expect(formatSize(2438.4, 279, "ft")).toBe("8 ft × 11 in");
    // A multiplication sign, not the letter x.
    const joiner = formatSize(1000, 1000, "m").slice("1.0 m".length, -"1.0 m".length);
    expect(joiner).toBe(" × ");
  });

  it("gives both sides the decimals asked for", () => {
    expect(formatSize(2450, 1800, "m", 2)).toBe("2.45 m × 1.80 m");
    expect(formatSize(2438.4, 279, "ft", 2)).toBe("8 ft × 11 in");
  });
});

describe("zoneSize", () => {
  it("measures rect, ellipse and polygon zones", () => {
    expect(zoneSize("rect", { x_min: -1200, x_max: 1200, y_min: 500, y_max: 2300 })).toEqual({
      width: 2400,
      depth: 1800,
    });
    expect(zoneSize("ellipse", { cx: 0, cy: 2000, rx: 900, ry: 600 })).toEqual({
      width: 1800,
      depth: 1200,
    });
    // The bounding box, whatever order the points come in and however
    // concave the outline is.
    expect(
      zoneSize("polygon", {
        points: [
          { x: 800, y: 3000 },
          { x: -700, y: 1000 },
          { x: 0, y: 1800 },
          { x: 1500, y: 1200 },
        ],
      })
    ).toEqual({ width: 2200, depth: 2000 });
    expect(
      zoneSize("polygon", {
        points: [
          { x: 0, y: 1000 },
          { x: 1000, y: 1000 },
          { x: 500, y: 2500 },
        ],
      })
    ).toEqual({ width: 1000, depth: 1500 });
  });

  it("gives no size to a zone without geometry", () => {
    // Zones from Add Zone, or cleared with shape none, store {}.
    expect(zoneSize(undefined, undefined)).toBeNull();
    expect(zoneSize(undefined, null)).toBeNull();
    expect(zoneSize("none", null)).toBeNull();
    expect(zoneSize("rect", null)).toBeNull();
    expect(zoneSize("rect", {})).toBeNull();
    expect(zoneSize("circle", { cx: 0, cy: 0, r: 500 })).toBeNull();
  });

  it("measures a degenerate shape by the same formula, sign kept", () => {
    // A two-corner walk along one wall previews as a rect with no depth.
    expect(zoneSize("rect", { x_min: -1000, x_max: 1500, y_min: 3000, y_max: 3000 })).toEqual({
      width: 2500,
      depth: 0,
    });
    // Only a hand edit of the store gets an inverted rect past update_zone.
    expect(zoneSize("rect", { x_min: 1200, x_max: -1200, y_min: 500, y_max: 2300 })).toEqual({
      width: -2400,
      depth: 1800,
    });
    expect(zoneSize("ellipse", { cx: 0, cy: 2000, rx: 0, ry: 600 })).toEqual({
      width: 0,
      depth: 1200,
    });
    expect(
      zoneSize("polygon", {
        points: [
          { x: 0, y: 1000 },
          { x: 1000, y: 1000 },
          { x: 2000, y: 1000 },
        ],
      })
    ).toEqual({ width: 2000, depth: 0 });
  });

  it("gives no size to data missing a number the shape needs", () => {
    // Only a hand edit of the store leaves these.
    expect(zoneSize("rect", { x_min: 0, x_max: 100, y_min: 500 })).toBeNull();
    expect(zoneSize("rect", { x_min: 0, x_max: 100, y_min: null, y_max: 900 })).toBeNull();
    expect(zoneSize("rect", { x_min: 0, x_max: NaN, y_min: 0, y_max: 900 })).toBeNull();
    expect(zoneSize("ellipse", { cy: 2000, rx: 900, ry: 600 })).toBeNull();
    expect(zoneSize("ellipse", { cx: 0, cy: 2000, rx: Infinity, ry: 600 })).toBeNull();
    // A polygon needs 3 points, each with both numbers.
    expect(
      zoneSize("polygon", {
        points: [
          { x: 0, y: 1000 },
          { x: 1000, y: 1000 },
        ],
      })
    ).toBeNull();
    expect(
      zoneSize("polygon", {
        points: [{ x: 0, y: 1000 }, { x: 1000, y: 1000 }, { x: 500 }],
      })
    ).toBeNull();
    expect(
      zoneSize("polygon", {
        points: [{ x: 0, y: 1000 }, { x: 1000, y: 1000 }, null],
      })
    ).toBeNull();
    expect(zoneSize("polygon", { points: "0,0 1,1 2,0" })).toBeNull();
    expect(zoneSize("polygon", {})).toBeNull();
  });

  it("reads coordinates stored as numeric strings, as the backend does", () => {
    expect(zoneSize("rect", { x_min: "-1200", x_max: "1200", y_min: 500, y_max: "2300" })).toEqual(
      { width: 2400, depth: 1800 }
    );
    expect(zoneSize("ellipse", { cx: "0", cy: 2000, rx: "900", ry: 600 })).toEqual({
      width: 1800,
      depth: 1200,
    });
    expect(zoneSize("rect", { x_min: "", x_max: 1200, y_min: 500, y_max: 2300 })).toBeNull();
    expect(zoneSize("rect", { x_min: "left", x_max: 1200, y_min: 500, y_max: 2300 })).toBeNull();
    expect(zoneSize("rect", { x_min: true, x_max: 1200, y_min: 500, y_max: 2300 })).toBeNull();
  });
});

describe("formatHold", () => {
  it("formats hold times", () => {
    expect(formatHold(0)).toBe("Off");
    expect(formatHold(45)).toBe("45 s");
    expect(formatHold(120)).toBe("2 min");
    expect(formatHold(3600)).toBe("1 h");
    expect(formatHold(5400)).toBe("90 min");
    expect(formatHold(90)).toBe("90 s");
    expect(formatHold(7200)).toBe("2 h");
    expect(formatHold(1)).toBe("1 s");
  });

  it("labels every Hold option the card offers", () => {
    expect([0, 15, 30, 60, 120, 300, 600, 1800].map(formatHold)).toEqual([
      "Off",
      "15 s",
      "30 s",
      "1 min",
      "2 min",
      "5 min",
      "10 min",
      "30 min",
    ]);
  });

  it("reads anything but a positive number as no hold", () => {
    expect(formatHold(-30)).toBe("Off");
    expect(formatHold(NaN)).toBe("Off");
  });
});
