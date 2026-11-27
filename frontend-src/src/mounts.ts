/** Radar mounts and floor correction, twin of the backend. */
// Reported y is sqrt(Y^2 + dz^2); tilt never moves points.

export const MOUNT_WALL = "wall";
export const MOUNT_HIGH = "high";
export const MOUNT_CEILING = "ceiling";
export const MOUNTS = Object.freeze([MOUNT_WALL, MOUNT_HIGH, MOUNT_CEILING] as const);

// Store keys and websocket payload keys, as const.py names them.
export const STORE_MOUNT = "mount";
export const STORE_CEILING_HEIGHT_MM = "ceiling_height_mm";
export const STORE_MOUNT_HEIGHT_MM = "mount_height_mm";
export const STORE_TILT_DEG = "tilt_deg";
export const STORE_TARGET_HEIGHT_MM = "target_height_mm";
export const STORE_FLIP_ROOM_SIDE = "flip_room_side";

export const CEILING_HEIGHT_DEFAULT_MM = 2700;
export const CEILING_HEIGHT_MIN_MM = 2000;
export const CEILING_HEIGHT_MAX_MM = 4000;
export const MOUNT_HEIGHT_DEFAULT_MM = 2200;
export const MOUNT_HEIGHT_MIN_MM = 1200;
export const MOUNT_HEIGHT_MAX_MM = 4000;
export const TILT_DEFAULT_DEG = 30;
export const TILT_MIN_DEG = 0;
export const TILT_MAX_DEG = 60;
export const TARGET_HEIGHT_DEFAULT_MM = 1000;
export const TARGET_HEIGHT_MIN_MM = 0;
export const TARGET_HEIGHT_MAX_MM = 2000;
/** The least drop from radar to person. */
export const MIN_DROP_MM = 500;

// The LD2450's beam, from its manual.
export const LD2450_RANGE_MM = 6000;
export const LD2450_AZIMUTH_HALF_DEG = 60;
export const LD2450_ELEVATION_HALF_DEG = 35;
/** Rows in a footprint outline: 50 points. */
export const FOOTPRINT_STEPS = 24;
/** Rows in a coverage zone: 32 points, the limit. */
export const COVERAGE_ZONE_STEPS = 15;
/** A coverage zone reaches this far past the wall line. */
export const COVERAGE_ZONE_WALL_MARGIN_MM = 50;
/** An LD2450 ceiling looks straight down. */
export const CEILING_TILT_DEG = 90;

export type Mount = "wall" | "high" | "ceiling";
export type MountSource = "radar" | "saved" | "default";

/** The mount settings a store entry or zones payload carries. */
export interface MountConfig {
  mount?: unknown;
  ceiling_height_mm?: unknown;
  mount_height_mm?: unknown;
  tilt_deg?: unknown;
  target_height_mm?: unknown;
  flip_room_side?: unknown;
}

/** Everything that places a radar's targets, twin of MountGeometry. */
export interface MountGeometry {
  tracker: string | null;
  mount: Mount;
  source: MountSource;
  /** Ceiling height, or High's mount height, else null. */
  height_mm: number | null;
  /** Tilt on High, 90 on an LD2450 ceiling, else null. */
  tilt_deg: number | null;
  /** Person height for a corrected LD2450, else null. */
  target_height_mm: number | null;
  /** The drop taken out of y, else null. */
  dz_mm: number | null;
  /** An LD2450 ceiling with Flip room side on. */
  flip: boolean;
}

export interface Point {
  x: number;
  y: number;
}

/** An LD2450's High or Ceiling coverage, floor frame. */
export interface Footprint {
  y_near: number;
  y_far: number;
  /** Counter-clockwise, 2 * (FOOTPRINT_STEPS + 1) points. */
  outline: Point[];
}

/** A cone ahead; 180 or more is a circle. */
export interface ConeCoverage {
  range_mm: number;
  half_fov_deg: number;
}

export type Coverage = ConeCoverage | Footprint;

/** An LD2450, or LD2460 on a wall. */
export const SIDE_COVERAGE: ConeCoverage = Object.freeze({ range_mm: 6000, half_fov_deg: 60 });

/** The mount in effect and its source, twin of mount_rule. */
export function mountRule(
  tracker: string | null | undefined,
  modeState: string | null | undefined,
  saved: string | null | undefined
): { mount: Mount; source: MountSource } {
  if (tracker === "ld2460") {
    if (modeState === "top") return { mount: "ceiling", source: "radar" };
    if (modeState === "side") return { mount: "wall", source: "radar" };
    if (saved === "ceiling") return { mount: "ceiling", source: "saved" };
    return { mount: "wall", source: "default" };
  }
  if (tracker === "ld2450" && (saved === "high" || saved === "ceiling")) {
    return { mount: saved, source: "saved" };
  }
  return { mount: "wall", source: "default" };
}

/** The saved mount a radar report overrides, else null. */
export function overriddenMount(
  tracker: string | null | undefined,
  modeState: string | null | undefined,
  saved: string | null | undefined
): Mount | null {
  const used = mountRule(tracker, modeState, saved);
  if (used.source !== "radar") return null;
  const kept = mountRule(tracker, null, saved);
  return kept.source === "saved" && kept.mount !== used.mount ? kept.mount : null;
}

/** A stored whole number in bounds, else the default. */
export function wholeSetting(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

/** The saved mount a payload holds: "high", "ceiling" or null. */
export function savedMount(config: MountConfig | null | undefined): "high" | "ceiling" | null {
  const mount = config?.mount;
  return mount === "high" || mount === "ceiling" ? mount : null;
}

export const ceilingHeightMm = (c: MountConfig | null | undefined) =>
  wholeSetting(c?.ceiling_height_mm, CEILING_HEIGHT_DEFAULT_MM, CEILING_HEIGHT_MIN_MM, CEILING_HEIGHT_MAX_MM);
export const mountHeightMm = (c: MountConfig | null | undefined) =>
  wholeSetting(c?.mount_height_mm, MOUNT_HEIGHT_DEFAULT_MM, MOUNT_HEIGHT_MIN_MM, MOUNT_HEIGHT_MAX_MM);
export const tiltDeg = (c: MountConfig | null | undefined) =>
  wholeSetting(c?.tilt_deg, TILT_DEFAULT_DEG, TILT_MIN_DEG, TILT_MAX_DEG);
export const targetHeightMm = (c: MountConfig | null | undefined) =>
  wholeSetting(c?.target_height_mm, TARGET_HEIGHT_DEFAULT_MM, TARGET_HEIGHT_MIN_MM, TARGET_HEIGHT_MAX_MM);

/** The geometry in use for a radar, twin of mount_geometry. */
export function mountGeometry(
  tracker: string | null | undefined,
  modeState: string | null | undefined,
  config: MountConfig | null | undefined
): MountGeometry {
  const { mount, source } = mountRule(tracker, modeState, savedMount(config));
  const corrected = tracker === "ld2450" && mount !== "wall";
  const height =
    mount === "ceiling" ? ceilingHeightMm(config) : mount === "high" ? mountHeightMm(config) : null;
  let tilt: number | null = null;
  let target: number | null = null;
  let dz: number | null = null;
  let flip = false;
  if (corrected && height !== null) {
    tilt = mount === "high" ? tiltDeg(config) : CEILING_TILT_DEG;
    target = targetHeightMm(config);
    dz = height - Math.min(target, height - MIN_DROP_MM);
    flip = mount === "ceiling" && config?.flip_room_side === true;
  }
  return {
    tracker: tracker ?? null,
    mount,
    source,
    height_mm: height,
    tilt_deg: tilt,
    target_height_mm: target,
    dz_mm: dz,
    flip,
  };
}

/** A raw reading moved to the floor, room side up. */
export function floorPoint(geom: MountGeometry, x: number, y: number): Point {
  const dz = geom.dz_mm;
  if (dz === null) return { x, y };
  const out = Math.sqrt(Math.max(0, y * y - dz * dz));
  return { x, y: geom.flip ? -out : out };
}

/** Half the footprint's width at `y` out (mm), floor frame. */
export function footprintHalfWidth(geom: MountGeometry, y: number): number {
  const dz = geom.dz_mm ?? 0;
  return Math.min(
    Math.sqrt(3) * Math.sqrt(y * y + dz * dz),
    Math.sqrt(Math.max(0, LD2450_RANGE_MM ** 2 - dz * dz - y * y))
  );
}

const rad = (deg: number) => (deg * Math.PI) / 180;
/** How close to Y = 0 counts as on the wall line. */
const WALL_LINE_MM = 1e-6;

/** Near and far edge out from the radar's foot. */
function footprintBand(geom: MountGeometry): { near: number; far: number } {
  const dz = geom.dz_mm ?? 0;
  const t = geom.tilt_deg ?? 0;
  const rmax = Math.sqrt(Math.max(0, LD2450_RANGE_MM ** 2 - dz * dz));
  const near = t + LD2450_ELEVATION_HALF_DEG >= CEILING_TILT_DEG ? 0 : dz / Math.tan(rad(t + LD2450_ELEVATION_HALF_DEG));
  const far =
    t <= LD2450_ELEVATION_HALF_DEG
      ? rmax
      : Math.min(rmax, dz / Math.tan(rad(t - LD2450_ELEVATION_HALF_DEG)));
  return { near: Math.min(near, far), far };
}

/** Outline up the right side, back down the left. */
export function footprintOutline(geom: MountGeometry, steps = FOOTPRINT_STEPS): Point[] {
  const { near, far } = footprintBand(geom);
  const rows: number[] = [];
  for (let i = 0; i <= steps; i += 1) rows.push(near + ((far - near) * i) / steps);
  const right = rows.map((y) => ({ x: footprintHalfWidth(geom, y), y }));
  const left = [...rows].reverse().map((y) => ({ x: -footprintHalfWidth(geom, y), y }));
  const outline = [...right, ...left];
  return geom.flip ? outline.reverse().map((p) => ({ x: p.x, y: -p.y })) : outline;
}

/**
 * The card's coverage zone: the outline, its wall line pushed
 * COVERAGE_ZONE_WALL_MARGIN_MM away from the room, so someone on the
 * line is inside however the map turns and rounds it.
 */
export function coverageZoneOutline(geom: MountGeometry, steps = COVERAGE_ZONE_STEPS): Point[] {
  const out = geom.flip ? COVERAGE_ZONE_WALL_MARGIN_MM : -COVERAGE_ZONE_WALL_MARGIN_MM;
  return footprintOutline(geom, steps).map((p) => (Math.abs(p.y) <= WALL_LINE_MM ? { x: p.x, y: out } : p));
}

/** What an LD2450 on High or Ceiling covers; undefined otherwise. */
export function footprint(geom: MountGeometry): Footprint | undefined {
  if (geom.dz_mm === null) return undefined;
  const { near, far } = footprintBand(geom);
  return { y_near: near, y_far: far, outline: footprintOutline(geom) };
}

/** The view hold edges use, twin of coverage_for. */
export function coverageFor(geom: MountGeometry, ceilingRadiusMm?: number): Coverage {
  const print = footprint(geom);
  if (print) return print;
  if (geom.tracker === "ld2460" && geom.mount === "ceiling" && ceilingRadiusMm !== undefined) {
    return { range_mm: ceilingRadiusMm, half_fov_deg: 180 };
  }
  return SIDE_COVERAGE;
}

/** Whether (x, y) is inside the closed polygon `points`. */
export function insidePolygon(points: Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Least distance in mm to the outline's sides. */
export function outlineDistanceMm(points: Point[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    best = Math.min(best, segmentDistance({ x, y }, points[i], points[(i + 1) % points.length]));
  }
  return best;
}

const wallSide = (a: Point, b: Point) => Math.abs(a.y) <= WALL_LINE_MM && Math.abs(b.y) <= WALL_LINE_MM;

/**
 * Distance to the view's edge in mm, 0 outside. A footprint side on
 * Y = 0 is the wall line, which nobody walks out across: a point on it
 * is inside, a point past it folds back across it, and only the other
 * sides count, as in hold.py.
 */
export function coverageEdgeDistanceMm(x: number, yIn: number, coverage: Coverage): number {
  let y = yIn;
  if ("outline" in coverage) {
    const points = coverage.outline;
    if (points.length < 3) return 0;
    const sides = points.map((a, i) => [a, points[(i + 1) % points.length]] as const);
    if (sides.some(([a, b]) => wallSide(a, b))) {
      // Fold onto the room side; flipped outlines lie below.
      const room = Math.max(...points.map((p) => p.y)) > WALL_LINE_MM;
      y = room ? Math.abs(y) : -Math.abs(y);
    }
    const onWall =
      Math.abs(y) <= WALL_LINE_MM &&
      sides.some(([a, b]) => wallSide(a, b) && Math.min(a.x, b.x) <= x && x <= Math.max(a.x, b.x));
    if (!onWall && !insidePolygon(points, x, y)) return 0;
    let best = Infinity;
    for (const [a, b] of sides) if (!wallSide(a, b)) best = Math.min(best, segmentDistance({ x, y }, a, b));
    return Number.isFinite(best) ? best : 0;
  }
  const distance = Math.hypot(x, y);
  if (coverage.half_fov_deg >= 180) return Math.max(0, coverage.range_mm - distance);
  const angle = (Math.atan2(Math.abs(x), y) * 180) / Math.PI;
  if (distance >= coverage.range_mm || angle >= coverage.half_fov_deg) return 0;
  return Math.min(coverage.range_mm - distance, distance * Math.sin(rad(coverage.half_fov_deg - angle)));
}
