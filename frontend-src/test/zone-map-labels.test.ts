/** Zone names that never overlap (zone-map/labels.ts). */

import { describe, it, expect } from "vitest";
import {
  ZONE_LABEL_FONT_PX,
  ZONE_LABEL_SMALL_FONT_PX,
  boxGap,
  layOutZoneLabels,
  placementBox,
  type Box,
  type LabelItem,
} from "../src/zone-map/labels";

/** 10 px a character at 24 px, scaled with the font. */
const measure = (text: string, fontPx: number) => (text.length * fontPx * 10) / 24;
const OPTIONS = { width: 800, height: 800, obstacles: [] as Box[], gap: 4, pad: 4, measure };

function item(id: number, x: number, y: number, w: number, h: number, text = `Zone ${id}`): LabelItem {
  return {
    id,
    areaMm2: w * h,
    text,
    anchor: { x: x + w / 2, y: y + h / 2 },
    box: { x, y, width: w, height: h },
  };
}

function overlaps(placements: ReturnType<typeof layOutZoneLabels>, gap = 0): boolean {
  const boxes = placements.map(placementBox);
  return boxes.some((a, i) => boxes.slice(i + 1).some((b) => boxGap(a, b) < gap || boxGap(a, b) === 0));
}

describe("zone label layout", () => {
  it("keeps labels with no collision on their centers at the big font", () => {
    const placed = layOutZoneLabels([item(1, 100, 100, 200, 200), item(2, 500, 500, 200, 200)], OPTIONS);
    expect(placed.map((p) => [p.id, p.x, p.y, p.fontPx, p.leader, p.plate])).toEqual([
      [1, 200, 200, ZONE_LABEL_FONT_PX, null, false],
      [2, 600, 600, ZONE_LABEL_FONT_PX, null, false],
    ]);
  });

  it("gives a nested zone its center and moves the bigger zone's name", () => {
    const outer = item(1, 100, 100, 400, 400, "Living room");
    const inner = item(2, 250, 250, 100, 100, "Couch");
    const placed = layOutZoneLabels([outer, inner], OPTIONS);
    const [living, couch] = placed;
    expect([couch.x, couch.y]).toEqual([300, 300]);
    // The first clear spot is the top inside the bigger zone.
    expect([living.x, living.y]).toEqual([300, 100 + 4 + 12]);
    expect(overlaps(placed, 4)).toBe(false);
  });

  it("places the lower id first when areas are equal", () => {
    const placed = layOutZoneLabels(
      [item(2, 100, 100, 200, 200, "Two"), item(1, 100, 100, 200, 200, "One")],
      OPTIONS
    );
    expect(placed.find((p) => p.id === 1)!.y).toBe(200);
    expect(placed.find((p) => p.id === 2)!.y).not.toBe(200);
  });

  it("tries the top inside, the bottom inside, above and below in turn", () => {
    const zone = item(9, 300, 300, 200, 200, "Hall");
    // Each step blocks one more spot with an obstacle.
    const block = (y: number): Box => ({ left: 0, right: 800, top: y - 10, bottom: y + 10 });
    const centers = [400, 316, 484, 284, 516];
    const seen: number[] = [];
    for (let blocked = 0; blocked < centers.length; blocked += 1) {
      const obstacles = centers.slice(0, blocked).map(block);
      const [placed] = layOutZoneLabels([zone], { ...OPTIONS, gap: 0.5, obstacles });
      seen.push(placed.y);
    }
    expect(seen).toEqual(centers);
  });

  it("checks every placed label and every obstacle", () => {
    const zones = [item(1, 300, 300, 200, 200, "Hall"), item(2, 330, 330, 140, 140, "Rug")];
    const button: Box = { left: 0, right: 800, top: 300, bottom: 330 };
    const placed = layOutZoneLabels(zones, { ...OPTIONS, obstacles: [button] });
    expect(overlaps(placed, 4)).toBe(false);
    for (const p of placed) expect(boxGap(placementBox(p), button)).toBeGreaterThanOrEqual(4);
  });

  it("clamps a label onto the canvas, 2 px in at the sides", () => {
    const [left] = layOutZoneLabels([item(1, -50, 0, 100, 10, "Window curtain")], OPTIONS);
    expect(placementBox(left).left).toBe(2);
    expect(left.y).toBe(12);
    const [right] = layOutZoneLabels([item(1, 760, 780, 100, 40, "Desk")], OPTIONS);
    expect(placementBox(right).right).toBe(798);
    expect(right.y).toBe(788);
  });

  it("shrinks to the small font where the big one fits nowhere", () => {
    // A zone whose only clear spot is 21 px tall.
    const zone = item(1, 300, 300, 200, 21, "Rug");
    const obstacles: Box[] = [
      { left: 0, right: 800, top: 0, bottom: 299 },
      { left: 0, right: 800, top: 322, bottom: 800 },
    ];
    const [placed] = layOutZoneLabels([zone], { ...OPTIONS, gap: 0.5, obstacles });
    expect(placed.fontPx).toBe(ZONE_LABEL_SMALL_FONT_PX);
    expect(placed.leader).toBeNull();
  });

  it("draws a leader line from a label beside its zone back to the zone", () => {
    // Taken: the zone, above, below, two steps right.
    const zone = item(1, 300, 300, 100, 100, "Rug");
    const obstacles: Box[] = [{ left: 200, right: 440, top: 0, bottom: 800 }];
    const [placed] = layOutZoneLabels([zone], { ...OPTIONS, obstacles });
    expect(placed.fontPx).toBe(ZONE_LABEL_SMALL_FONT_PX);
    expect(placed.plate).toBe(false);
    const box = placementBox(placed);
    expect(boxGap(box, obstacles[0])).toBeGreaterThanOrEqual(4);
    // From the label's nearest point to the anchor.
    expect(placed.leader).toEqual({ x1: box.left, y1: 350, x2: 350, y2: 350 });
    // The third step past the zone's right edge.
    expect(box.left).toBe(400 + 4 + 2 * 24);
  });

  it("goes out step by step past the canvas, then falls back to a plate at the center", () => {
    const zone = item(1, 300, 300, 100, 100, "Rug");
    const all: Box[] = [{ left: 0, right: 800, top: 0, bottom: 800 }];
    const [placed] = layOutZoneLabels([zone], { ...OPTIONS, obstacles: all });
    expect(placed.plate).toBe(true);
    expect(placed.leader).toBeNull();
    expect([placed.x, placed.y, placed.fontPx]).toEqual([350, 350, ZONE_LABEL_SMALL_FONT_PX]);
  });

  it("never hides a label, however crowded", () => {
    const zones = Array.from({ length: 12 }, (_, i) => item(i + 1, 350, 350, 100 + i, 100 + i));
    const placed = layOutZoneLabels(zones, OPTIONS);
    expect(placed.map((p) => p.id)).toEqual(zones.map((z) => z.id));
  });

  it("keeps 32 zones in a dense room apart on a 320 px card", () => {
    // 24 grid zones, plus a seat inside eight.
    const scale = 800 / 270;
    const names = ["Couch", "Desk", "Bed", "Door", "Closet", "Window", "Chair", "Table"];
    const zones: LabelItem[] = [];
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        const id = row * 6 + col + 1;
        const zone = item(id, 137.5 + col * 87.5, 43.7 + row * 94.75, 72.9, 80.2);
        zones.push({ ...zone, areaMm2: 1_100_000, text: `${names[(id - 1) % 8]} ${id}` });
      }
    }
    for (let k = 0; k < 8; k += 1) {
      const step = k % 4;
      const x = 144.8 + (k < 4 ? 0 : 262.5) + step * 65.6;
      const zone = item(25 + k, x, 51 + step * 94.75, 21.9, 29.2, `Inner seat ${25 + k}`);
      zones.push({ ...zone, areaMm2: 120_000 });
    }
    // The unlocked card's buttons.
    const buttons: Box[] = [
      { left: 11.9, right: 106.7, top: 515.3, bottom: 610.1 },
      { left: 223.9, right: 788.1, top: 515.3, bottom: 610.1 },
      { left: 480, right: 788.1, top: 408.7, bottom: 503.5 },
      { left: 693.3, right: 788.1, top: 32.6, bottom: 127.4 },
    ];
    const placed = layOutZoneLabels(zones, {
      width: 800,
      height: 622,
      obstacles: buttons,
      gap: 4 * scale,
      pad: 4 * scale,
      // The card's own fallback measure.
      measure: (text, fontPx) => text.length * fontPx * 0.6,
    });

    expect(placed).toHaveLength(32);
    expect(placed.filter((p) => p.plate)).toEqual([]);
    expect(overlaps(placed)).toBe(false);
  });

  it("gives the same result whatever order the zones come in", () => {
    const zones = [
      item(1, 100, 100, 400, 400, "Living room"),
      item(2, 250, 250, 100, 100, "Couch"),
      item(3, 260, 260, 80, 80, "Fan"),
      item(4, 200, 200, 300, 300, "Reading nook by the big window"),
    ];
    const forward = layOutZoneLabels(zones, OPTIONS);
    const backward = layOutZoneLabels([...zones].reverse(), OPTIONS);
    expect(backward).toEqual(forward);
    expect(forward.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });

  it("skips the inside spots of a zone too short for a label", () => {
    const zone = item(1, 300, 300, 200, 20, "Shelf");
    const block: Box = { left: 0, right: 800, top: 305, bottom: 315 };
    const [placed] = layOutZoneLabels([zone], { ...OPTIONS, gap: 0.5, obstacles: [block] });
    // Too short for inside spots: just above.
    expect(placed.y).toBe(300 - 4 - 12);
  });
});
