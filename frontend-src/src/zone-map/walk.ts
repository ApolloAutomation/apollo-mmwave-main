/**
 * Mark corners by walking: the shape a walked set of corners saves as.
 *
 * The card keeps the corners in the raw sensor frame while the walk goes
 * on and maps them to the map frame at Finish. Two corners are opposite
 * corners of a rectangle; three or more, walked around the zone in order,
 * are a polygon. A shape too thin to use (corners marked along one wall, or
 * in a line) is refused rather than saved, and the corners stay, so the
 * walk can go on.
 */

/** A corner is the target's time-weighted position over this long. */
export const WALK_AVERAGE_MS = 1500;
/** The least distance between two corners, and the least width or depth of
 *  a two-corner rectangle. */
export const WALK_MIN_CORNER_GAP_MM = 300;
/** The least area of a walked polygon: 0.3 m by 0.3 m. */
export const WALK_MIN_AREA_MM2 = 90000;

export type WalkShape =
  | { shape: "rect"; data: { x_min: number; x_max: number; y_min: number; y_max: number } }
  | { shape: "polygon"; points: { x: number; y: number }[] }
  | { error: "flat" | "few" | "crossed" };

type Point = { x: number; y: number };

/** The polygon's area in mm² (the shoelace formula). A walk that crosses
 *  itself reads smaller than it looks, which errs toward "flat". */
function shoelaceArea(points: Point[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** Whether segments ab and cd cross, touching ends included. */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const onSegment = (p: Point, q: Point, r: Point) =>
    Math.min(p.x, q.x) <= r.x &&
    r.x <= Math.max(p.x, q.x) &&
    Math.min(p.y, q.y) <= r.y &&
    r.y <= Math.max(p.y, q.y);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  if (d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0) return true;
  if (d1 === 0 && onSegment(c, d, a)) return true;
  if (d2 === 0 && onSegment(c, d, b)) return true;
  if (d3 === 0 && onSegment(a, b, c)) return true;
  if (d4 === 0 && onSegment(a, b, d)) return true;
  return false;
}

/** Whether the closed polygon through `points` crosses itself. Edges
 *  that share a corner are not tested against each other. */
export function selfIntersects(points: Point[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 2; j < n; j += 1) {
      // The last edge shares the first corner with edge 0.
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(a, b, points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** `points` sorted by their angle around their centroid. */
export function orderAroundCentroid(points: Point[]): Point[] {
  if (points.length < 3) return [...points];
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return points
    .map((p, index) => ({ p, index, angle: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((a, b) => a.angle - b.angle || a.index - b.index)
    .map(({ p }) => p);
}

/** The corners in walking order, or around their centroid when
 *  `aroundCenter` and walking order crosses itself. */
export function walkOrder(points: Point[], aroundCenter: boolean): Point[] {
  return aroundCenter && points.length >= 3 && selfIntersects(points)
    ? orderAroundCentroid(points)
    : points;
}

/**
 * The corners as the zone saves them: each clamped with `clamp`, rounded,
 * a repeat of the one before dropped, and, past two, the first
 * `maxPoints` in walkOrder. Walk's preview draws these too.
 */
export function walkCorners(
  mapCorners: Point[],
  clamp: (p: Point) => Point,
  maxPoints: number,
  aroundCenter: boolean
): Point[] {
  const corners: Point[] = [];
  for (const corner of mapCorners) {
    const clamped = clamp(corner);
    // Math.round(-0.4) is -0; adding 0 makes it the 0 a saved zone holds.
    const p = { x: Math.round(clamped.x) + 0, y: Math.round(clamped.y) + 0 };
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const previous = corners.length > 0 ? corners[corners.length - 1] : null;
    if (previous && previous.x === p.x && previous.y === p.y) continue;
    corners.push(p);
  }
  if (corners.length <= 2) return corners;
  // A cap under 3 leaves no polygon.
  const capped = corners.slice(0, maxPoints);
  return capped.length < 3 ? [] : walkOrder(capped, aroundCenter);
}

/**
 * The zone that `mapCorners` (map frame mm, in walking order) describe.
 *
 * Each corner is clamped with `clamp` (the card's map extents) and rounded,
 * and a corner equal to the one before it is dropped. Fewer than 2 corners
 * left is "few". Two make a rectangle from their min and max, "flat" when
 * it is narrower or shallower than WALK_MIN_CORNER_GAP_MM. Three or more
 * make a polygon of the first `maxPoints`, "flat" when its area is under
 * WALK_MIN_AREA_MM2 (corners in a line, or nearly). With `aroundCenter`,
 * a polygon whose walking order crosses itself is put in order around its
 * centroid first, as corners walked around a ceiling radar can come in
 * any order, and one that still crosses itself is "crossed".
 */
export function walkShape(
  mapCorners: Point[],
  clamp: (p: Point) => Point,
  maxPoints: number,
  { aroundCenter = false }: { aroundCenter?: boolean } = {}
): WalkShape {
  const corners = walkCorners(mapCorners, clamp, maxPoints, aroundCenter);
  if (corners.length < 2) return { error: "few" };
  if (corners.length === 2) {
    const [a, b] = corners;
    const data = {
      x_min: Math.min(a.x, b.x),
      x_max: Math.max(a.x, b.x),
      y_min: Math.min(a.y, b.y),
      y_max: Math.max(a.y, b.y),
    };
    const thinnest = Math.min(data.x_max - data.x_min, data.y_max - data.y_min);
    if (thinnest < WALK_MIN_CORNER_GAP_MM) return { error: "flat" };
    return { shape: "rect", data };
  }
  const points = corners;
  if (shoelaceArea(points) < WALK_MIN_AREA_MM2) return { error: "flat" };
  if (aroundCenter && selfIntersects(points)) return { error: "crossed" };
  return { shape: "polygon", points };
}
