/**
 * Which zone a point is in, the way the presence sensors decide it.
 *
 * A port of the shape testers and the point rotator in
 * custom_components/apollo_mmwave/targets.py, rule for rule, so a target the
 * card draws hollow inside an ignore zone is one presence also drops, and a
 * zone a replayed dot lights is one presence would have turned on. Stored
 * zones are hand-editable JSON, so every reader here takes whatever the store
 * holds and answers false for anything it cannot use, as the backend does.
 */

/** Python's `float()` over what JSON can carry, as the backend's
 *  `_coerce_float` reads a stored coordinate: numbers and booleans (Python's
 *  bool is an int), numeric strings in Python's spelling, else null. Unicode
 *  digits other than 0 to 9, which Python also reads, are not read here. */
const PY_FLOAT = /^\s*[+-]?(?:inf|infinity|nan|(?:\d(?:_?\d)*)?\.\d(?:_?\d)*(?:e[+-]?\d(?:_?\d)*)?|\d(?:_?\d)*\.?(?:e[+-]?\d(?:_?\d)*)?)\s*$/i;

function coerceFloat(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value !== "string" || !PY_FLOAT.test(value)) return null;
  const text = value.trim().replace(/_/g, "").toLowerCase();
  const sign = text.startsWith("-") ? -1 : 1;
  const bare = text.replace(/^[+-]/, "");
  if (bare === "nan") return NaN;
  if (bare === "inf" || bare === "infinity") return sign * Infinity;
  return Number(text);
}

/** A JSON object, the only thing Python's `isinstance(x, dict)` accepts. */
function isDict(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Inclusive on every edge; a rect needs x_min < x_max and y_min < y_max. */
export function pointInRect(x: number, y: number, d: any): boolean {
  if (!isDict(d)) return false;
  const xMin = coerceFloat(d.x_min);
  const xMax = coerceFloat(d.x_max);
  const yMin = coerceFloat(d.y_min);
  const yMax = coerceFloat(d.y_max);
  if (xMin === null || xMax === null || yMin === null || yMax === null) return false;
  if (!(xMin < xMax && yMin < yMax)) return false;
  return xMin <= x && x <= xMax && yMin <= y && y <= yMax;
}

/** Inclusive on the rim; an ellipse needs both radii above 0. */
export function pointInEllipse(x: number, y: number, d: any): boolean {
  if (!isDict(d)) return false;
  const cx = coerceFloat(d.cx);
  const cy = coerceFloat(d.cy);
  const rx = coerceFloat(d.rx);
  const ry = coerceFloat(d.ry);
  if (cx === null || cy === null || rx === null || ry === null) return false;
  if (rx <= 0 || ry <= 0) return false;
  const dx = x - cx;
  const dy = y - cy;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}

/**
 * Even-odd ray cast toward +x over 3 or more points. A point exactly on a
 * slanted or vertical edge counts as a crossing and one on a horizontal edge
 * never does, so a boundary point reads inside or out by which edge it is on,
 * as in the backend. Any point that is not an object with numeric x and y
 * makes the whole polygon unusable.
 */
export function pointInPolygon(x: number, y: number, d: any): boolean {
  if (!isDict(d)) return false;
  const points = d.points;
  if (!Array.isArray(points) || points.length < 3) return false;
  let inside = false;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!isDict(a) || !isDict(b)) return false;
    const x1 = coerceFloat(a.x);
    const y1 = coerceFloat(a.y);
    const x2 = coerceFloat(b.x);
    const y2 = coerceFloat(b.y);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return false;
    // The crossing test already rules out y1 === y2, so the division is safe;
    // the backend's epsilon fallback for it never runs (REVIEW_REPORT X59).
    if (y1 > y !== y2 > y) {
      const xAtY = x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
      if (xAtY >= x) inside = !inside;
    }
  }
  return inside;
}

/** Whether (x, y), in the map frame, is inside a stored zone. A shape the
 *  backend has no tester for (none, a typo, a hand-edited list) is never. */
export function pointInZone(shape: string | undefined, data: any, x: number, y: number): boolean {
  switch (shape) {
    case "rect":
      return pointInRect(x, y, data);
    case "ellipse":
      return pointInEllipse(x, y, data);
    case "polygon":
      return pointInPolygon(x, y, data);
    default:
      return false;
  }
}

/**
 * A raw sensor point turned into the map frame by the radar's rotation:
 * x' = x cos θ + y sin θ, y' = -x sin θ + y cos θ. Positive degrees swing the
 * radar's facing toward its right, so 90 maps (x, y) to (y, -x). A rotation
 * that is not a finite number is no rotation, as in the presence sensor.
 */
export function rotateToMap(x: number, y: number, deg: number): { x: number; y: number } {
  if (!Number.isFinite(deg)) return { x, y };
  const theta = (deg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return { x: x * cos + y * sin, y: -x * sin + y * cos };
}
