/**
 * Zoom and pan over the zone map: which part of the map the canvas shows.
 *
 * The map's extents (the fitted or YAML grid) are the whole picture, drawn
 * at 1x. A view is a zoom factor and the map point, in mm, at the canvas's
 * center. The window it shows is the map's span divided by the zoom around
 * that point, and it always lies inside the map, so a zoomed canvas never
 * shows anything past the map's edge. A view is in the map frame, before
 * the card's left to right flip, so the same view shows the same part of
 * the room flipped or not. Pure functions: the card keeps the view and maps
 * every mm to canvas px through its window.
 */

/** Today's whole map. */
export const ZOOM_MIN = 1;
/** The closest the map zooms in. A fitted 12 m map then shows 1.5 m across,
 *  with grid lines 10 cm (or 3 in) apart. */
export const ZOOM_MAX = 8;
/** One press of + or -, and one notch of a mouse wheel: two make 2x. */
export const ZOOM_STEP = Math.SQRT2;
/** Fit leaves this fraction of the zones' longer side clear on each side of
 *  them, and never less than FIT_ZONES_MARGIN_MIN_MM. */
export const FIT_ZONES_MARGIN_FRACTION = 0.1;
export const FIT_ZONES_MARGIN_MIN_MM = 300;

export type Extents = { xMin: number; xMax: number; yMin: number; yMax: number };
export type View = { zoom: number; cx: number; cy: number };
export type Point = { x: number; y: number };

// A zoom this close to 1 is 1: zooming in and back out again in steps of
// ZOOM_STEP leaves float error.
const ZOOM_EPSILON = 1e-6;

/** An extent's length, never under 1 mm, as the card's canvas sizing takes it. */
function span(min: number, max: number): number {
  return Math.max(1, max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** `zoom` within ZOOM_MIN..ZOOM_MAX; anything that is not a number is 1. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_MIN;
  const clamped = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  return clamped - ZOOM_MIN < ZOOM_EPSILON ? ZOOM_MIN : clamped;
}

/** The whole map: 1x, centered. */
export function wholeView(map: Extents): View {
  return { zoom: ZOOM_MIN, cx: (map.xMin + map.xMax) / 2, cy: (map.yMin + map.yMax) / 2 };
}

/**
 * `view` (null is the whole map) with its zoom in range and its center
 * moved as little as it takes for the window to lie inside `map`. At 1x
 * that is the whole map, centered.
 */
export function clampView(view: View | null, map: Extents): View {
  if (!view) return wholeView(map);
  const zoom = clampZoom(view.zoom);
  if (zoom === ZOOM_MIN) return wholeView(map);
  const halfX = span(map.xMin, map.xMax) / zoom / 2;
  const halfY = span(map.yMin, map.yMax) / zoom / 2;
  const whole = wholeView(map);
  const cx = Number.isFinite(view.cx) ? view.cx : whole.cx;
  const cy = Number.isFinite(view.cy) ? view.cy : whole.cy;
  return {
    zoom,
    cx: clamp(cx, map.xMin + halfX, map.xMax - halfX),
    cy: clamp(cy, map.yMin + halfY, map.yMax - halfY),
  };
}

/** The part of `map` that `view` shows, in mm: exactly `map` at 1x. */
export function viewWindow(view: View | null, map: Extents): Extents {
  const clamped = clampView(view, map);
  if (clamped.zoom === ZOOM_MIN) return { ...map };
  const halfX = span(map.xMin, map.xMax) / clamped.zoom / 2;
  const halfY = span(map.yMin, map.yMax) / clamped.zoom / 2;
  return {
    xMin: clamped.cx - halfX,
    xMax: clamped.cx + halfX,
    yMin: clamped.cy - halfY,
    yMax: clamped.cy + halfY,
  };
}

/** Whether two views (null is the whole map) show the same window. */
export function sameView(a: View | null, b: View | null, map: Extents): boolean {
  const first = viewWindow(a, map);
  const second = viewWindow(b, map);
  return (["xMin", "xMax", "yMin", "yMax"] as const).every(
    (key) => Math.abs(first[key] - second[key]) < 1e-6
  );
}

/**
 * The view at `zoom` that shows map point `at` at `frac` of the window
 * (0 to 1, from its xMin and its yMin edge), clamped into the map. A pinch
 * and a drag hold the point they started on under the fingers this way.
 */
export function viewAt(map: Extents, zoom: number, at: Point, frac: Point): View {
  const z = clampZoom(zoom);
  const width = span(map.xMin, map.xMax) / z;
  const height = span(map.yMin, map.yMax) / z;
  return clampView(
    { zoom: z, cx: at.x + (0.5 - frac.x) * width, cy: at.y + (0.5 - frac.y) * height },
    map
  );
}

/**
 * `view` zoomed by `factor` around map point `at`, which keeps its place on
 * the canvas unless the map's edge stops the window there.
 */
export function zoomAt(view: View | null, map: Extents, factor: number, at: Point): View {
  const current = clampView(view, map);
  const win = viewWindow(current, map);
  const frac = {
    x: (at.x - win.xMin) / span(win.xMin, win.xMax),
    y: (at.y - win.yMin) / span(win.yMin, win.yMax),
  };
  return viewAt(map, current.zoom * factor, at, frac);
}

/** The box around `points`, or null for none. */
export function boundsOf(points: Point[]): Extents | null {
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  };
}

/**
 * The view Fit shows: `box` (the zones, in mm) with a margin on every side
 * (FIT_ZONES_MARGIN_FRACTION of its longer side, at least
 * FIT_ZONES_MARGIN_MIN_MM), as large as the canvas takes it, up to
 * ZOOM_MAX, or the whole map for no box. The part of the box past the map
 * is left out, since the window stays inside it.
 */
export function fitView(map: Extents, box: Extents | null): View {
  if (!box) return wholeView(map);
  const longer = Math.max(box.xMax - box.xMin, box.yMax - box.yMin);
  const margin = Math.max(FIT_ZONES_MARGIN_MIN_MM, FIT_ZONES_MARGIN_FRACTION * longer);
  const xMin = clamp(box.xMin - margin, map.xMin, map.xMax);
  const xMax = clamp(box.xMax + margin, map.xMin, map.xMax);
  const yMin = clamp(box.yMin - margin, map.yMin, map.yMax);
  const yMax = clamp(box.yMax + margin, map.yMin, map.yMax);
  const zoom = clampZoom(
    Math.min(
      span(map.xMin, map.xMax) / span(xMin, xMax),
      span(map.yMin, map.yMax) / span(yMin, yMax)
    )
  );
  return clampView({ zoom, cx: (xMin + xMax) / 2, cy: (yMin + yMax) / 2 }, map);
}

/**
 * `view` moved as little as it takes, and zoomed out only as far as it
 * must, for every one of `points` (clamped onto the map) to lie inside its
 * window with `inset` (a fraction of the window's width and height) to
 * spare at each edge. Walk follows the walker this way. The whole map is
 * left as it is.
 */
export function followPoints(view: View | null, map: Extents, points: Point[], inset: number): View {
  const current = clampView(view, map);
  if (current.zoom === ZOOM_MIN || !points.length) return current;
  const box = boundsOf(
    points.map((p) => ({
      x: clamp(p.x, map.xMin, map.xMax),
      y: clamp(p.y, map.yMin, map.yMax),
    }))
  );
  if (!box) return current;
  const keep = Math.max(0.01, 1 - 2 * inset);
  const spanX = span(map.xMin, map.xMax);
  const spanY = span(map.yMin, map.yMax);
  const needed = Math.max(
    (box.xMax - box.xMin) / keep / spanX,
    (box.yMax - box.yMin) / keep / spanY
  );
  const zoom = needed > 0 ? clampZoom(Math.min(current.zoom, 1 / needed)) : current.zoom;
  if (zoom === ZOOM_MIN) return wholeView(map);
  const width = spanX / zoom;
  const height = spanY / zoom;
  const move = (center: number, size: number, min: number, max: number) => {
    const lo = center - size / 2 + size * inset;
    const hi = center + size / 2 - size * inset;
    if (min < lo) return center - (lo - min);
    if (max > hi) return center + (max - hi);
    return center;
  };
  return clampView(
    {
      zoom,
      cx: move(current.cx, width, box.xMin, box.xMax),
      cy: move(current.cy, height, box.yMin, box.yMax),
    },
    map
  );
}
