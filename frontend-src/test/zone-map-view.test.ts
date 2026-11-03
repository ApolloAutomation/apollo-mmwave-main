/**
 * The zone map's zoom and pan, as pure functions over the map's extents.
 *
 * A view is a zoom and the map point at the canvas's center; its window,
 * the part of the map the canvas shows, never leaves the map. The card maps
 * every mm through that window, so these pin the arithmetic it relies on.
 */

import { describe, expect, it } from "vitest";
import {
  FIT_ZONES_MARGIN_MIN_MM,
  ZOOM_MAX,
  ZOOM_STEP,
  boundsOf,
  clampView,
  clampZoom,
  fitView,
  followPoints,
  sameView,
  viewAt,
  viewWindow,
  wholeView,
  zoomAt,
} from "../src/zone-map/view";

/** A fitted map's shape: 12 m across, 8 m deep, the radar on the top edge. */
const MAP = { xMin: -6000, xMax: 6000, yMin: 0, yMax: 8000 };

describe("zone map view window", () => {
  it("shows exactly the map at 1x, and for no view at all", () => {
    expect(viewWindow(null, MAP)).toEqual(MAP);
    expect(viewWindow({ zoom: 1, cx: 123, cy: 456 }, MAP)).toEqual(MAP);
    expect(clampView(null, MAP)).toEqual(wholeView(MAP));
    expect(wholeView(MAP)).toEqual({ zoom: 1, cx: 0, cy: 4000 });
  });

  it("divides the map's span by the zoom around the view's center", () => {
    expect(viewWindow({ zoom: 2, cx: 0, cy: 4000 }, MAP)).toEqual({
      xMin: -3000,
      xMax: 3000,
      yMin: 2000,
      yMax: 6000,
    });
    expect(viewWindow({ zoom: 4, cx: 1000, cy: 3000 }, MAP)).toEqual({
      xMin: -500,
      xMax: 2500,
      yMin: 2000,
      yMax: 4000,
    });
  });

  it("keeps the zoom between 1x and ZOOM_MAX", () => {
    expect(ZOOM_MAX).toBe(8);
    expect(clampZoom(0.5)).toBe(1);
    expect(clampZoom(20)).toBe(8);
    expect(clampZoom(Number.NaN)).toBe(1);
    // Float error from zooming in and back out is still 1x.
    expect(clampZoom(ZOOM_STEP * (1 / ZOOM_STEP))).toBe(1);
    expect(clampView({ zoom: 50, cx: 0, cy: 4000 }, MAP).zoom).toBe(8);
  });

  it("moves a window that would leave the map back inside it", () => {
    // Centered on the radar at 2x: half the window would be above y = 0.
    expect(viewWindow({ zoom: 2, cx: -6000, cy: 0 }, MAP)).toEqual({
      xMin: -6000,
      xMax: 0,
      yMin: 0,
      yMax: 4000,
    });
    expect(viewWindow({ zoom: 2, cx: 99999, cy: 99999 }, MAP)).toEqual({
      xMin: 0,
      xMax: 6000,
      yMin: 4000,
      yMax: 8000,
    });
    // A center that is not a number is the map's center.
    expect(clampView({ zoom: 2, cx: Number.NaN, cy: Number.NaN }, MAP)).toEqual({
      zoom: 2,
      cx: 0,
      cy: 4000,
    });
  });

  it("tells two views apart by the window they show", () => {
    expect(sameView(null, { zoom: 1, cx: 5, cy: 5 }, MAP)).toBe(true);
    // Both clamp to the same window.
    expect(sameView({ zoom: 2, cx: 9000, cy: 0 }, { zoom: 2, cx: 3000, cy: 2000 }, MAP)).toBe(
      true
    );
    expect(sameView({ zoom: 2, cx: 0, cy: 4000 }, null, MAP)).toBe(false);
  });
});

describe("zone map zoom at a point", () => {
  it("keeps the point it zooms around where it was in the window", () => {
    const at = { x: 1500, y: 2000 };
    const before = viewWindow(null, MAP);
    const next = zoomAt(null, MAP, 2, at);
    const after = viewWindow(next, MAP);
    const frac = (win: typeof MAP) => ({
      x: (at.x - win.xMin) / (win.xMax - win.xMin),
      y: (at.y - win.yMin) / (win.yMax - win.yMin),
    });
    expect(next.zoom).toBe(2);
    expect(frac(after).x).toBeCloseTo(frac(before).x, 9);
    expect(frac(after).y).toBeCloseTo(frac(before).y, 9);
  });

  it("zooms back out to the whole map", () => {
    let view = zoomAt(null, MAP, ZOOM_STEP, { x: 2000, y: 1000 });
    view = zoomAt(view, MAP, ZOOM_STEP, { x: -1000, y: 5000 });
    view = zoomAt(view, MAP, 1 / ZOOM_STEP, { x: 0, y: 0 });
    view = zoomAt(view, MAP, 1 / ZOOM_STEP, { x: 0, y: 0 });
    expect(view).toEqual(wholeView(MAP));
  });

  it("stops at the edge when the point is near it", () => {
    // Zooming around the radar on the top edge: the window cannot go above
    // y = 0, so it starts there.
    const win = viewWindow(zoomAt(null, MAP, 4, { x: 0, y: 0 }), MAP);
    expect(win.yMin).toBe(0);
    expect(win.yMax).toBe(2000);
    expect(win.xMin).toBeCloseTo(-1500, 9);
  });

  it("shows a map point at a fraction of the window, as a pinch holds it", () => {
    const view = viewAt(MAP, 2, { x: 1000, y: 3000 }, { x: 0.25, y: 0.5 });
    const win = viewWindow(view, MAP);
    expect(win.xMin + 0.25 * (win.xMax - win.xMin)).toBeCloseTo(1000, 9);
    expect(win.yMin + 0.5 * (win.yMax - win.yMin)).toBeCloseTo(3000, 9);
  });
});

describe("zone map fit", () => {
  it("fits the zones with a margin, as large as the window allows", () => {
    // A 2 m by 1 m couch zone: its longer side's 10% (200 mm) is under the
    // floor, so 300 mm on every side, 2.6 m by 1.6 m. 12 / 2.6 across and
    // 8 / 1.6 down: the narrower fit, 4.615x, wins.
    const box = { xMin: 1000, xMax: 3000, yMin: 2000, yMax: 3000 };
    const view = fitView(MAP, box);
    expect(view.zoom).toBeCloseTo(12000 / 2600, 9);
    expect(view.cx).toBe(2000);
    expect(view.cy).toBe(2500);
    const win = viewWindow(view, MAP);
    expect(win.xMin).toBeCloseTo(box.xMin - FIT_ZONES_MARGIN_MIN_MM, 9);
    expect(win.xMax).toBeCloseTo(box.xMax + FIT_ZONES_MARGIN_MIN_MM, 9);
    expect(win.yMin).toBeLessThanOrEqual(box.yMin);
    expect(win.yMax).toBeGreaterThanOrEqual(box.yMax);
  });

  it("leaves a tenth of a large box's longer side clear", () => {
    const box = { xMin: -4000, xMax: 2000, yMin: 1000, yMax: 4000 };
    const win = viewWindow(fitView(MAP, box), MAP);
    expect(win.xMin).toBeCloseTo(-4600, 9);
    expect(win.xMax).toBeCloseTo(2600, 9);
  });

  it("shows the whole map with no zones, and stops at ZOOM_MAX for a tiny one", () => {
    expect(fitView(MAP, null)).toEqual(wholeView(MAP));
    expect(fitView(MAP, { xMin: 0, xMax: 10, yMin: 4000, yMax: 4010 }).zoom).toBe(8);
  });

  it("finds the box around points", () => {
    expect(boundsOf([])).toBeNull();
    expect(
      boundsOf([
        { x: 3, y: -1 },
        { x: -2, y: 4 },
      ])
    ).toEqual({ xMin: -2, xMax: 3, yMin: -1, yMax: 4 });
  });
});

describe("zone map follow", () => {
  const zoomed = { zoom: 4, cx: 0, cy: 4000 }; // x -1500..1500, y 3000..5000

  it("leaves the view alone while the walker is well inside it", () => {
    expect(followPoints(zoomed, MAP, [{ x: 0, y: 4000 }], 0.15)).toEqual(zoomed);
  });

  it("pans no farther than it takes to keep the walker inside the inset", () => {
    const next = followPoints(zoomed, MAP, [{ x: 1400, y: 4000 }], 0.15);
    const win = viewWindow(next, MAP);
    expect(next.zoom).toBe(4);
    // 15% of the 3000 mm window is 450 mm: the walker's x is that far in.
    expect(win.xMax - 1400).toBeCloseTo(450, 9);
    expect(next.cy).toBe(4000);
  });

  it("zooms out only as far as two people in view need", () => {
    const next = followPoints(
      zoomed,
      MAP,
      [
        { x: -3000, y: 4000 },
        { x: 3000, y: 4000 },
      ],
      0.15
    );
    expect(next.zoom).toBeCloseTo(12000 / (6000 / 0.7), 9);
    const win = viewWindow(next, MAP);
    expect(win.xMin).toBeLessThanOrEqual(-3000);
    expect(win.xMax).toBeGreaterThanOrEqual(3000);
  });

  it("never follows on the whole map", () => {
    expect(followPoints(null, MAP, [{ x: 5000, y: 7000 }], 0.15)).toEqual(wholeView(MAP));
  });
});
