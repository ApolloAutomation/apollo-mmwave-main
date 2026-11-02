/**
 * The cell grid behind coverage paint and the history heatmap: positions in
 * raw frame mm binned into 200 mm cells, drawn with an alpha that follows
 * the log of each cell's value, a few alpha groups at a time.
 */

import { describe, it, expect } from "vitest";
import { CELL_MM, CellGrid, bucketCells, cellAlpha } from "../src/zone-map/cells";

/** The grid's cells as "ix,iy" -> value, for order-free comparison. */
function cells(grid: CellGrid): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [ix, iy, value] of grid.entries()) out[`${ix},${iy}`] = value;
  return out;
}

describe("CellGrid", () => {
  it("bins positions into 200 mm cells", () => {
    expect(CELL_MM).toBe(200);
    const grid = new CellGrid();
    grid.add(0, 0);
    grid.add(199.9, 199.9);
    grid.add(200, 0);
    grid.add(399, 1999);
    // Below zero the cells continue the same way (floor, not truncation).
    grid.add(-1, -1);
    grid.add(-200, 0);
    grid.add(-200.5, 0);

    expect(cells(grid)).toEqual({
      "0,0": 2,
      "1,0": 1,
      "1,9": 1,
      "-1,-1": 1,
      "-1,0": 1,
      "-2,0": 1,
    });
    expect(grid.size).toBe(6);
    expect(grid.max).toBe(2);
  });

  it("adds weights and keeps the largest cell", () => {
    const grid = new CellGrid();
    grid.add(100, 100, 2.5);
    grid.add(150, 150, 0.5);
    grid.add(900, 100);

    expect(cells(grid)).toEqual({ "0,0": 3, "4,0": 1 });
    expect(grid.max).toBe(3);
  });

  it("adds nothing for a position or a weight it cannot use", () => {
    const grid = new CellGrid();
    grid.add(NaN, 100);
    grid.add(100, Infinity);
    grid.add(100, 100, 0);
    grid.add(100, 100, -1);
    grid.add(100, 100, NaN);
    grid.add(100, 100, Infinity);

    expect(grid.size).toBe(0);
    expect(grid.max).toBe(0);
    expect([...grid.entries()]).toEqual([]);
  });

  it("uses the cell size it is given, and 200 mm for anything else", () => {
    const wide = new CellGrid(500);
    wide.add(499, 0);
    wide.add(500, 0);
    expect(cells(wide)).toEqual({ "0,0": 1, "1,0": 1 });

    for (const size of [0, -5, NaN, Infinity]) {
      const grid = new CellGrid(size);
      grid.add(199, 0);
      grid.add(200, 0);
      expect(cells(grid), String(size)).toEqual({ "0,0": 1, "1,0": 1 });
    }
  });

  it("clear empties the grid", () => {
    const grid = new CellGrid();
    grid.add(0, 0, 4);
    grid.add(500, 500);

    grid.clear();

    expect(grid.size).toBe(0);
    expect(grid.max).toBe(0);
    expect([...grid.entries()]).toEqual([]);
    grid.add(0, 0);
    expect(grid.max).toBe(1);
  });
});

describe("cellAlpha", () => {
  it("alpha follows the log of the count", () => {
    expect(cellAlpha(0, 10)).toBeCloseTo(0.06, 12);
    expect(cellAlpha(10, 10)).toBeCloseTo(0.5, 12);
    expect(cellAlpha(1, 1)).toBeCloseTo(0.5, 12);
    // log1p(9) / log1p(99) is ln 10 / ln 100: halfway up the range.
    expect(cellAlpha(9, 99)).toBeCloseTo(0.28, 12);
    // Half the count is far more than half the alpha, so a spot passed once
    // still shows next to one where someone stood for an hour.
    expect(cellAlpha(50, 100)).toBeGreaterThan(0.43);
    expect(cellAlpha(1, 3600)).toBeGreaterThan(0.09);
  });

  it("is 0 with nothing counted", () => {
    expect(cellAlpha(0, 0)).toBe(0);
    expect(cellAlpha(5, 0)).toBe(0);
    expect(cellAlpha(5, -1)).toBe(0);
  });

  it("takes its own alpha range", () => {
    expect(cellAlpha(0, 10, 0.1, 0.9)).toBeCloseTo(0.1, 12);
    expect(cellAlpha(10, 10, 0.1, 0.9)).toBeCloseTo(0.9, 12);
    expect(cellAlpha(9, 99, 0.1, 0.9)).toBeCloseTo(0.5, 12);
  });

  it("reads a value outside 0..max as the nearer end", () => {
    expect(cellAlpha(-5, 10)).toBeCloseTo(0.06, 12);
    expect(cellAlpha(NaN, 10)).toBeCloseTo(0.06, 12);
    expect(cellAlpha(20, 10)).toBeCloseTo(0.5, 12);
  });
});

describe("bucketCells", () => {
  it("buckets cells for drawing", () => {
    const grid = new CellGrid();
    grid.add(100, 100, 1); // cell 0,0
    grid.add(300, 100, 10); // cell 1,0
    grid.add(500, 100, 100); // cell 2,0
    grid.add(700, 100, 100); // cell 3,0

    const buckets = bucketCells(grid);

    // Nearest of 10 alphas from 0.06 to 0.5: steps 1, 5 and 9 of 9.
    expect(buckets.map((b) => b.cells)).toEqual([[[0, 0]], [[1, 0]], [[2, 0], [3, 0]]]);
    expect(buckets[0].alpha).toBeCloseTo(0.06 + (0.44 * 1) / 9, 12);
    expect(buckets[1].alpha).toBeCloseTo(0.06 + (0.44 * 5) / 9, 12);
    // The busiest cells keep their full alpha.
    expect(buckets[2].alpha).toBe(0.5);
  });

  it("puts every cell in the group nearest its own alpha, faintest first", () => {
    const grid = new CellGrid();
    const values = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610];
    values.forEach((value, i) => grid.add(i * 200, 0, value));

    const buckets = bucketCells(grid);

    const placed = buckets.flatMap((b) => b.cells.map(([ix]) => ix)).sort((a, b) => a - b);
    expect(placed).toEqual(values.map((_value, i) => i));
    const alphas = buckets.map((b) => b.alpha);
    expect(alphas).toEqual([...alphas].sort((a, b) => a - b));
    expect(new Set(alphas).size).toBe(alphas.length);
    const halfStep = 0.44 / 9 / 2;
    for (const bucket of buckets) {
      for (const [ix] of bucket.cells) {
        expect(Math.abs(bucket.alpha - cellAlpha(values[ix], 610))).toBeLessThanOrEqual(
          halfStep + 1e-12
        );
      }
    }
  });

  it("takes the number of groups it is given", () => {
    const grid = new CellGrid();
    grid.add(0, 0, 1);
    grid.add(200, 0, 30);
    grid.add(400, 0, 1000);

    const three = bucketCells(grid, 3);
    expect(three.map((b) => b.cells.length)).toEqual([1, 1, 1]);
    expect(three[0].alpha).toBeCloseTo(0.06, 12);
    expect(three[1].alpha).toBeCloseTo(0.28, 12);
    expect(three[2].alpha).toBe(0.5);

    const one = bucketCells(grid, 1);
    expect(one).toEqual([{ alpha: 0.5, cells: [[0, 0], [1, 0], [2, 0]] }]);
  });

  it("returns no groups for an empty grid", () => {
    expect(bucketCells(new CellGrid())).toEqual([]);
  });
});
