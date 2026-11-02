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
  | { error: "flat" | "few" };

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

/**
 * The zone that `mapCorners` (map frame mm, in walking order) describe.
 *
 * Each corner is clamped with `clamp` (the card's map extents) and rounded,
 * and a corner equal to the one before it is dropped. Fewer than 2 corners
 * left is "few". Two make a rectangle from their min and max, "flat" when
 * it is narrower or shallower than WALK_MIN_CORNER_GAP_MM. Three or more
 * make a polygon of the first `maxPoints`, "flat" when its area is under
 * WALK_MIN_AREA_MM2 (corners in a line, or nearly).
 */
export function walkShape(
  mapCorners: Point[],
  clamp: (p: Point) => Point,
  maxPoints: number
): WalkShape {
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
  const points = corners.slice(0, maxPoints);
  if (points.length < 3) return { error: "few" };
  if (shoelaceArea(points) < WALK_MIN_AREA_MM2) return { error: "flat" };
  return { shape: "polygon", points };
}
