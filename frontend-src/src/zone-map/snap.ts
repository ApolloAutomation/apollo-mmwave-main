/**
 * Corner snapping while a zone is drawn by hand.
 *
 * A corner placed with the mouse or a finger lands on the nearest round
 * value in the map's unit, about a tenth of the grid step the map shows:
 * 10 cm at a 1 m grid, 5 cm at 0.5 m, 2 in at 2 ft, finer as the map zooms
 * in. Round values count from the radar (0, 0), as the grid lines do. The
 * card saves the snapped point in whole mm, and Alt or Option held places
 * a corner freely. A corner marked by walking is the radar's own average
 * and never snaps. Pure functions: the card picks the grid step and the
 * unit and maps px to mm around them.
 */

import type { UnitFamily } from "./format";

/** A snap is about this fraction of the grid step. */
export const SNAP_GRID_FRACTION = 0.1;

const MM_PER_INCH = 25.4;

/** The round snaps of each unit family, finest first: mm for meters,
 *  inches for feet. The finest is the snap however far the map zooms in. */
const SNAP_STEPS: Record<UnitFamily, readonly number[]> = Object.freeze({
  m: Object.freeze([10, 20, 50, 100, 200, 500, 1000]),
  ft: Object.freeze([1, 2, 3, 6, 12, 24]),
});

/**
 * The snap for a grid `gridStepMm` apart, in mm: the largest of the
 * family's round snaps that is no more than SNAP_GRID_FRACTION of the step,
 * or the finest one under a step that fine. 100 mm at a 1 m grid, 1 in
 * (25.4 mm) at 1 ft and 2 in at 2 ft.
 */
export function snapStepMm(gridStepMm: number, family: UnitFamily): number {
  const unitMm = family === "ft" ? MM_PER_INCH : 1;
  const steps = SNAP_STEPS[family];
  const most = (Number.isFinite(gridStepMm) ? gridStepMm : 0) * SNAP_GRID_FRACTION;
  let snap = steps[0];
  for (const step of steps) {
    // The tolerance takes a grid step in feet, given or taken float error.
    if (step * unitMm <= most * (1 + 1e-9)) snap = step;
  }
  return snap * unitMm;
}

/** `mm` on the nearest multiple of `stepMm`, counted from 0. Not rounded
 *  to whole mm: the card clamps onto the map and rounds when it saves. */
export function snapMm(mm: number, stepMm: number): number {
  if (!(stepMm > 0) || !Number.isFinite(mm)) return mm;
  // `+ 0` turns the -0 a snap of a small negative value gives into 0.
  return Math.round(mm / stepMm) * stepMm + 0;
}

/**
 * The decimals a size in meters needs to show a snapped length exactly:
 * 1 (0.1 m) for snaps of 10 cm or more, 2 for finer ones. Feet read in
 * whole inches, which every inch snap fills, so they need none.
 */
export function snapDecimals(stepMm: number, family: UnitFamily): number {
  if (family === "ft") return 0;
  return stepMm < 100 ? 2 : 1;
}
