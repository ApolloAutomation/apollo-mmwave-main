/**
 * The shape a walked set of corners saves as. Corners arrive in the map
 * frame, in walking order; the card's clamp keeps them on the map.
 */

import { describe, it, expect } from "vitest";
import {
  WALK_AVERAGE_MS,
  WALK_MIN_AREA_MM2,
  WALK_MIN_CORNER_GAP_MM,
  orderAroundCentroid,
  selfIntersects,
  walkCorners,
  walkOrder,
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

describe("corners walked around a ceiling radar", () => {
  const square = [
    { x: -2000, y: 2000 },
    { x: 2000, y: 2000 },
    { x: 2000, y: -2000 },
    { x: -2000, y: -2000 },
  ];
  // The same corners walked as an X: across the center twice.
  const crossed = [square[0], square[2], square[1], square[3]];

  it("tells a walk that crosses itself from one that does not", () => {
    expect(selfIntersects(square)).toBe(false);
    expect(selfIntersects(crossed)).toBe(true);
    // Too few edges to cross.
    expect(selfIntersects(square.slice(0, 3))).toBe(false);
  });

  it("puts corners in order around their centroid", () => {
    const ordered = orderAroundCentroid(crossed);
    expect(selfIntersects(ordered)).toBe(false);
    expect(new Set(ordered)).toEqual(new Set(crossed));
  });

  it("orders a crossed walk only around a ceiling radar", () => {
    const around = walkShape(crossed, onMap, 32, { aroundCenter: true });
    expect("points" in around && selfIntersects(around.points)).toBe(false);
    expect("points" in around && around.points.length).toBe(4);
    // A wall radar keeps walking order, as before: a bowtie reads flat.
    const wall = walkShape(crossed, onMap, 32);
    expect(wall).toEqual({ error: "flat" });
    expect(walkShape(crossed, onMap, 32, { aroundCenter: false })).toEqual(wall);
  });

  it("keeps a walk that does not cross in its own order", () => {
    expect(walkShape(square, onMap, 32, { aroundCenter: true })).toEqual({
      shape: "polygon",
      points: square,
    });
    expect(walkOrder(square, true)).toBe(square);
  });
});

describe("a walk around a ceiling radar that still crosses itself", () => {
  it("is refused, not saved, when ordering around the center cannot fix it", () => {
    const corners = [
      { x: 3000, y: 0 },
      { x: 1000, y: 0 },
      { x: 2000, y: 0 },
      { x: -3000, y: 1500 },
      { x: -3000, y: -1500 },
    ];
    expect(walkShape(corners, onMap, 32, { aroundCenter: true })).toEqual({ error: "crossed" });
  });

  it("still saves a bow-tie the ordering fixes", () => {
    const bowtie = [
      { x: -2000, y: -2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: -2000 },
      { x: -2000, y: 2000 },
    ];
    const result = walkShape(bowtie, onMap, 32, { aroundCenter: true });
    expect("points" in result && selfIntersects(result.points)).toBe(false);
  });
});

describe("walkCorners, the preview's corners", () => {
  it("drops corners the clamp makes repeats, as Finish does", () => {
    const clamp = clampTo(-2000, 2000, -2000, 2000);
    const walked = [
      { x: 2500, y: 2500 },
      { x: 3000, y: 2800 },
      { x: -2000, y: 2000 },
      { x: 0, y: -2000 },
    ];
    const preview = walkCorners(walked, clamp, 32, true);
    expect(preview).toHaveLength(3);
    const saved = walkShape(walked, clamp, 32, { aroundCenter: true });
    expect("points" in saved && saved.points).toEqual(preview);
  });
});
