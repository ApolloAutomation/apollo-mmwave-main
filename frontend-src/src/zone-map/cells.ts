/**
 * Positions binned into square cells: the live coverage paint counts target
 * positions in them and the movement history heatmap adds dwell time.
 *
 * Cells are in the raw sensor frame (unit converted, not rotated), so the
 * card draws each one's four corners through the same rotation and flip as
 * the live dots, and the paint follows a rotation change.
 */

export const CELL_MM = 200;

/** The faintest and strongest cell, as fill alpha. */
const MIN_ALPHA = 0.06;
const MAX_ALPHA = 0.5;

interface Cell {
  ix: number;
  iy: number;
  value: number;
}

export class CellGrid {
  private readonly _cellMm: number;
  private _cells = new Map<string, Cell>();
  private _max = 0;

  /** `cellMm` is the side of a cell; anything but a positive number means
   *  CELL_MM. */
  constructor(cellMm?: number) {
    this._cellMm =
      typeof cellMm === "number" && Number.isFinite(cellMm) && cellMm > 0 ? cellMm : CELL_MM;
  }

  /** Add `weight` (1 by default) to the cell holding (x, y), raw frame mm.
   *  A position that is not a number, or a weight that is not positive,
   *  adds nothing, so no cell ever holds 0. */
  add(x: number, y: number, weight = 1): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!Number.isFinite(weight) || weight <= 0) return;
    const ix = Math.floor(x / this._cellMm);
    const iy = Math.floor(y / this._cellMm);
    const key = `${ix},${iy}`;
    const cell = this._cells.get(key);
    let value = weight;
    if (cell) {
      cell.value += weight;
      value = cell.value;
    } else {
      this._cells.set(key, { ix, iy, value });
    }
    if (value > this._max) this._max = value;
  }

  /** How many cells hold something. */
  get size(): number {
    return this._cells.size;
  }

  /** The largest value of any cell, 0 when there is none. */
  get max(): number {
    return this._max;
  }

  clear(): void {
    this._cells.clear();
    this._max = 0;
  }

  /** Every cell that holds something: its indexes (the cell spans
   *  ix * cellMm to (ix + 1) * cellMm on x, likewise y) and its value. */
  *entries(): Iterable<[ix: number, iy: number, value: number]> {
    for (const cell of this._cells.values()) yield [cell.ix, cell.iy, cell.value];
  }
}

/**
 * A cell's fill alpha by the log of its value against the largest, so a
 * spot passed once still shows next to one stood in for an hour. 0 when
 * there is nothing (`max` <= 0); a value outside 0..max counts as the
 * nearer end.
 */
export function cellAlpha(
  value: number,
  max: number,
  minAlpha = MIN_ALPHA,
  maxAlpha = MAX_ALPHA
): number {
  if (!(max > 0)) return 0;
  const v = value > 0 ? Math.min(value, max) : 0;
  return minAlpha + ((maxAlpha - minAlpha) * Math.log1p(v)) / Math.log1p(max);
}

/**
 * The grid's cells grouped by alpha, so the card sets one fill style and
 * fills one path per group rather than one per cell. Each cell goes to the
 * nearest of `buckets` alphas spread evenly from the faintest to the
 * strongest (one bucket: the strongest), so the busiest cell keeps its full
 * alpha. Only groups that hold cells are returned, faintest first.
 */
export function bucketCells(
  grid: CellGrid,
  buckets = 10
): { alpha: number; cells: [number, number][] }[] {
  const max = grid.max;
  if (grid.size === 0 || !(max > 0)) return [];
  const count = Number.isFinite(buckets) && buckets >= 1 ? Math.floor(buckets) : 1;
  const steps = count - 1;
  const groups: [number, number][][] = [];
  for (let i = 0; i < count; i += 1) groups.push([]);
  for (const [ix, iy, value] of grid.entries()) {
    const share = Math.log1p(Math.min(value, max)) / Math.log1p(max);
    groups[steps === 0 ? 0 : Math.round(share * steps)].push([ix, iy]);
  }
  const out: { alpha: number; cells: [number, number][] }[] = [];
  groups.forEach((cells, level) => {
    if (cells.length === 0) return;
    const alpha =
      steps === 0 ? MAX_ALPHA : MIN_ALPHA + ((MAX_ALPHA - MIN_ALPHA) * level) / steps;
    out.push({ alpha, cells });
  });
  return out;
}
