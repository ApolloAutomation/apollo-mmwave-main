/**
 * The shape a walked set of corners saves as. Corners arrive in the map
 * frame, in walking order; the card's clamp keeps them on the map.
 */

import { describe, it, expect } from "vitest";
import {
  WALK_AVERAGE_MS,
  WALK_MIN_AREA_MM2,
  WALK_MIN_CORNER_GAP_MM,
  walkShape,
} from "../src/zone-map/walk";

type Point = { x: number; y: number };

/** No clamping: every corner is on the map. */
const onMap = (p: Point): Point => p;

/** The card's clamp: to the map's extents, then rounded. */
function clampTo(xMin: number, xMax: number, yMin: number, yMax: number) {
  return (p: Point): Point => ({
    x: Math.round(Math.max(xMin, Math.min(xMax, p.x))),
    y: Math.round(Math.max(yMin, Math.min(yMax, p.y))),
  });
}

describe("walkShape", () => {
  it("names its limits", () => {
    expect(WALK_AVERAGE_MS).toBe(1500);
    expect(WALK_MIN_CORNER_GAP_MM).toBe(300);
    expect(WALK_MIN_AREA_MM2).toBe(90000);
  });

  it("two corners make an axis-aligned rect", () => {
    const corners = [
      { x: 1200.4, y: 3000.6 },
      { x: -800, y: 1000 },
    ];
    const rect = {
      shape: "rect",
      data: { x_min: -800, x_max: 1200, y_min: 1000, y_max: 3001 },
    };

    expect(walkShape(corners, onMap, 32)).toEqual(rect);
    // Either diagonal, walked either way, is the same rect.
    expect(walkShape([...corners].reverse(), onMap, 32)).toEqual(rect);
    expect(
      walkShape(
        [
          { x: -800, y: 3000.6 },
          { x: 1200.4, y: 1000 },
        ],
        onMap,
        32
      )
    ).toEqual(rect);
  });

  it("three or more make a polygon", () => {
    const room = [
      { x: -1500.2, y: 1000.4 },
      { x: 1400, y: 1100 },
      { x: 1600.6, y: 3900 },
      { x: -1300, y: 4100 },
    ];

    expect(walkShape(room, onMap, 32)).toEqual({
      shape: "polygon",
      points: [
        { x: -1500, y: 1000 },
        { x: 1400, y: 1100 },
        { x: 1601, y: 3900 },
        { x: -1300, y: 4100 },
      ],
    });
    expect(walkShape(room.slice(0, 3), onMap, 32)).toEqual({
      shape: "polygon",
      points: [
        { x: -1500, y: 1000 },
        { x: 1400, y: 1100 },
        { x: 1601, y: 3900 },
      ],
    });
  });

  it("two corners along one wall are flat", () => {
    const along = [
      { x: -1000, y: 3000 },
      { x: 1500, y: 3120 },
    ];
    expect(walkShape(along, onMap, 32)).toEqual({ error: "flat" });

    // 300 mm on the thinner side is enough; 299 mm is not.
    expect(
      walkShape(
        [
          { x: 0, y: 1000 },
          { x: 300, y: 3000 },
        ],
        onMap,
        32
      )
    ).toEqual({ shape: "rect", data: { x_min: 0, x_max: 300, y_min: 1000, y_max: 3000 } });
    expect(
      walkShape(
        [
          { x: 0, y: 1000 },
          { x: 2000, y: 1299 },
        ],
        onMap,
        32
      )
    ).toEqual({ error: "flat" });
  });

  it("three corners in a line are flat", () => {
    const line = [
      { x: 0, y: 1000 },
      { x: 1000, y: 2000 },
      { x: 2000, y: 3000 },
    ];
    expect(walkShape(line, onMap, 32)).toEqual({ error: "flat" });

    // Nearly in a line: 0.05 m² is under the 0.09 m² floor.
    const sliver = [
      { x: 0, y: 1000 },
      { x: 1000, y: 1050 },
      { x: 2000, y: 1000 },
    ];
    expect(walkShape(sliver, onMap, 32)).toEqual({ error: "flat" });

    // Exactly 0.09 m² is enough.
    const small = [
      { x: 0, y: 1000 },
      { x: 600, y: 1000 },
      { x: 0, y: 1300 },
    ];
    expect(walkShape(small, onMap, 32)).toEqual({ shape: "polygon", points: small });
  });

  it("caps a polygon at maxPoints", () => {
    const corners = [
      { x: 0, y: 1000 },
      { x: 2000, y: 1000 },
      { x: 2000, y: 3000 },
      { x: 1000, y: 3500 },
      { x: 0, y: 3000 },
      { x: -500, y: 2000 },
    ];

    expect(walkShape(corners, onMap, 4)).toEqual({
      shape: "polygon",
      points: corners.slice(0, 4),
    });
    expect(walkShape(corners, onMap, 32)).toEqual({ shape: "polygon", points: corners });
    // A cap under 3 leaves no polygon.
    expect(walkShape(corners, onMap, 2)).toEqual({ error: "few" });
  });

  it("clamps and rounds each corner before anything else", () => {
    const clamp = clampTo(-3000, 3000, 0, 6000);
    const corners = [
      { x: -3500, y: 1000.4 },
      { x: 2000, y: 6400 },
    ];

    expect(walkShape(corners, clamp, 32)).toEqual({
      shape: "rect",
      data: { x_min: -3000, x_max: 2000, y_min: 1000, y_max: 6000 },
    });
    // A clamp that does not round still gets whole millimeters out.
    const unrounded = (p: Point): Point => ({ x: Math.min(p.x, 2000.4), y: p.y });
    expect(
      walkShape(
        [
          { x: 0, y: 1000 },
          { x: 2500, y: 2000.6 },
        ],
        unrounded,
        32
      )
    ).toEqual({ shape: "rect", data: { x_min: 0, x_max: 2000, y_min: 1000, y_max: 2001 } });
  });

  it("drops a corner equal to the one before it", () => {
    // Two corners off the same edge of the map clamp to one point.
    const clamp = clampTo(-3000, 3000, 0, 6000);
    const corners = [
      { x: -3500, y: 1000.2 },
      { x: -3200, y: 999.8 },
      { x: 1000, y: 3000 },
    ];
    expect(walkShape(corners, clamp, 32)).toEqual({
      shape: "rect",
      data: { x_min: -3000, x_max: 1000, y_min: 1000, y_max: 3000 },
    });

    // Only a repeat of the corner right before it is dropped.
    const back = [
      { x: 0, y: 1000 },
      { x: 2000, y: 1000 },
      { x: 2000, y: 1000 },
      { x: 2000, y: 3000 },
      { x: 0, y: 1000 },
    ];
    expect(walkShape(back, onMap, 32)).toEqual({
      shape: "polygon",
      points: [
        { x: 0, y: 1000 },
        { x: 2000, y: 1000 },
        { x: 2000, y: 3000 },
        { x: 0, y: 1000 },
      ],
    });
  });

  it("needs two different corners", () => {
    expect(walkShape([], onMap, 32)).toEqual({ error: "few" });
    expect(walkShape([{ x: 0, y: 1000 }], onMap, 32)).toEqual({ error: "few" });
    expect(
      walkShape(
        [
          { x: 0, y: 1000 },
          { x: 0.2, y: 999.6 },
        ],
        onMap,
        32
      )
    ).toEqual({ error: "few" });
  });

  it("skips a corner that is not a number", () => {
    const corners = [
      { x: 0, y: 1000 },
      { x: NaN, y: 2000 },
      { x: 1500, y: 3000 },
    ];
    expect(walkShape(corners, onMap, 32)).toEqual({
      shape: "rect",
      data: { x_min: 0, x_max: 1500, y_min: 1000, y_max: 3000 },
    });
  });

  it("saves 0, never -0", () => {
    const result = walkShape(
      [
        { x: -0.4, y: 1000 },
        { x: 1500, y: -0.2 },
      ],
      onMap,
      32
    );
    if (!("shape" in result) || result.shape !== "rect") throw new Error("expected a rect");
    expect(Object.is(result.data.x_min, 0)).toBe(true);
    expect(Object.is(result.data.y_min, 0)).toBe(true);
  });
});
