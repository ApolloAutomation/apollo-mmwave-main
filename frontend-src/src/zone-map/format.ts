/**
 * Text for the zone map's sizes and hold times.
 *
 * The size readout while drawing, the Walk preview and the zone editor all go
 * through `formatSize`, so the three always agree. Sizes follow the map's
 * m / ft switch (the card's `_unitFamily`), and a size is width (x) by depth
 * (y) in millimeters, the units zone geometry is stored in. In meters the
 * readout while drawing takes a second decimal while corners snap finer
 * than 10 cm (see ./snap), so it shows the snapped size exactly; the zone
 * editor reads to 0.1 m.
 */

export type UnitFamily = "m" | "ft";

const MM_PER_INCH = 25.4;
const INCHES_PER_FOOT = 12;

/** "2.4 m" (or "2.45 m" at 2 `decimals`), or "7 ft 11 in", "8 ft" and
 *  "11 in". Feet always read in whole inches. */
export function formatLength(mm: number, family: UnitFamily, decimals = 1): string {
  if (family === "ft") {
    // Rounded to whole inches before the split, so 143.6 in carries to
    // "12 ft" instead of reading "11 ft 12 in".
    const total = Math.round(Math.abs(mm) / MM_PER_INCH);
    const feet = Math.floor(total / INCHES_PER_FOOT);
    const inches = total % INCHES_PER_FOOT;
    // A length that rounds to nothing has no side.
    const sign = mm < 0 && total > 0 ? "-" : "";
    if (inches === 0) return `${sign}${feet} ft`;
    if (feet === 0) return `${sign}${inches} in`;
    return `${sign}${feet} ft ${inches} in`;
  }
  const meters = (mm / 1000).toFixed(decimals);
  // A length that rounds to nothing has no side here either.
  return `${Number(meters) === 0 ? (0).toFixed(decimals) : meters} m`;
}

/** "2.4 m × 1.8 m": width by depth, joined by a multiplication sign, with
 *  `decimals` as formatLength takes them. */
export function formatSize(
  widthMm: number,
  depthMm: number,
  family: UnitFamily,
  decimals = 1
): string {
  return `${formatLength(widthMm, family, decimals)} × ${formatLength(depthMm, family, decimals)}`;
}

/**
 * A coordinate the way the backend's shape tests read one: a finite number,
 * or a string holding one (a hand edit of the store can leave either).
 */
function coordinate(value: unknown): number | null {
  let n = NaN;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.trim() !== "") n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * A zone's width and depth in mm: x_max - x_min by y_max - y_min for a rect,
 * 2 rx by 2 ry for an ellipse, the bounding box of a polygon's 3 or more
 * points. null for a zone without geometry: no shape, a shape the map does
 * not draw, or data missing a number the shape needs.
 */
export function zoneSize(
  shape: string | undefined,
  data: any
): { width: number; depth: number } | null {
  if (!data || typeof data !== "object") return null;
  if (shape === "rect") {
    const xMin = coordinate(data.x_min);
    const xMax = coordinate(data.x_max);
    const yMin = coordinate(data.y_min);
    const yMax = coordinate(data.y_max);
    if (xMin === null || xMax === null || yMin === null || yMax === null) return null;
    return { width: xMax - xMin, depth: yMax - yMin };
  }
  if (shape === "ellipse") {
    const cx = coordinate(data.cx);
    const cy = coordinate(data.cy);
    const rx = coordinate(data.rx);
    const ry = coordinate(data.ry);
    if (cx === null || cy === null || rx === null || ry === null) return null;
    return { width: 2 * rx, depth: 2 * ry };
  }
  if (shape === "polygon") {
    const points = data.points;
    if (!Array.isArray(points) || points.length < 3) return null;
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const point of points) {
      const x = coordinate(point?.x);
      const y = coordinate(point?.y);
      // The presence sensor drops a polygon with any bad point.
      if (x === null || y === null) return null;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
    return { width: xMax - xMin, depth: yMax - yMin };
  }
  return null;
}

/**
 * "Off", "45 s", "2 min", "1 h". A whole number of hours or minutes reads in
 * that unit, so 5400 s reads "90 min".
 */
export function formatHold(seconds: number): string {
  // Anything but a positive number is no hold, as the backend reads it.
  if (!(seconds > 0)) return "Off";
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}
