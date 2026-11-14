// Zone name layout: deterministic, never overlapping, never hidden.

export const ZONE_LABEL_FONT_PX = 24;
export const ZONE_LABEL_SMALL_FONT_PX = 20;
// Leader steps tried outward from a zone.
export const LEADER_RINGS = 3;

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface LabelItem {
  id: number;
  // Infinity when unknown.
  areaMm2: number;
  text: string;
  // Preferred name center.
  anchor: Point;
  box: { x: number; y: number; width: number; height: number };
}

export interface LabelPlacement {
  id: number;
  text: string;
  x: number;
  y: number;
  width: number;
  fontPx: number;
  // From the name's box to the anchor.
  leader: { x1: number; y1: number; x2: number; y2: number } | null;
  // Last resort: drawn on a background plate.
  plate: boolean;
}

export interface LabelLayoutOptions {
  width: number;
  height: number;
  // Buttons over the map, kept clear by gap.
  obstacles: Box[];
  gap: number;
  // Space between a zone edge and name.
  pad: number;
  measure: (text: string, fontPx: number) => number;
}

// Clear space between boxes, 0 when touching.
export function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.hypot(dx, dy);
}
export function placementBox(p: Pick<LabelPlacement, "x" | "y" | "width" | "fontPx">): Box {
  return {
    left: p.x - p.width / 2,
    right: p.x + p.width / 2,
    top: p.y - p.fontPx / 2,
    bottom: p.y + p.fontPx / 2,
  };
}

// Keeps a centered box on the canvas.
function clampOnto(value: number, half: number, extent: number): number {
  return half * 2 >= extent ? extent / 2 : Math.min(Math.max(value, half), extent - half);
}

function byArea(a: LabelItem, b: LabelItem): number {
  const areaA = Number.isFinite(a.areaMm2) ? a.areaMm2 : Infinity;
  const areaB = Number.isFinite(b.areaMm2) ? b.areaMm2 : Infinity;
  if (areaA < areaB) return -1;
  if (areaA > areaB) return 1;
  return a.id - b.id;
}

function nearestOn(box: Box, p: Point): Point {
  return {
    x: Math.min(Math.max(p.x, box.left), box.right),
    y: Math.min(Math.max(p.y, box.top), box.bottom),
  };
}

// Smaller zones first; result sorted by id.
export function layOutZoneLabels(items: LabelItem[], options: LabelLayoutOptions): LabelPlacement[] {
  const { width, height, obstacles, gap, pad, measure } = options;
  const placed: Box[] = [];
  const out: LabelPlacement[] = [];

  const clamp = (p: Point, w: number, h: number): Point => ({
    x: clampOnto(p.x, w / 2 + 2, width),
    y: clampOnto(p.y, h / 2, height),
  });
  const clear = (box: Box) =>
    placed.every((other) => boxGap(box, other) >= gap) &&
    obstacles.every((other) => boxGap(box, other) >= gap);

  const firstClear = (item: LabelItem, fontPx: number, spots: Point[]): LabelPlacement | null => {
    const w = measure(item.text, fontPx);
    const seen: Point[] = [];
    for (const spot of spots) {
      const at = clamp(spot, w, fontPx);
      if (seen.some((s) => Math.abs(s.x - at.x) < 1e-6 && Math.abs(s.y - at.y) < 1e-6)) continue;
      seen.push(at);
      const candidate = { id: item.id, text: item.text, x: at.x, y: at.y, width: w, fontPx };
      if (clear(placementBox(candidate))) return { ...candidate, leader: null, plate: false };
    }
    return null;
  };

  const place = (item: LabelItem): LabelPlacement => {
    const { anchor, box } = item;
    const top = box.y;
    const bottom = box.y + box.height;
    for (const fontPx of [ZONE_LABEL_FONT_PX, ZONE_LABEL_SMALL_FONT_PX]) {
      const h = fontPx;
      const spots: Point[] = [anchor];
      if (box.height >= h + 2 * pad) {
        spots.push({ x: anchor.x, y: top + pad + h / 2 }, { x: anchor.x, y: bottom - pad - h / 2 });
      }
      spots.push({ x: anchor.x, y: top - pad - h / 2 }, { x: anchor.x, y: bottom + pad + h / 2 });
      const found = firstClear(item, fontPx, spots);
      if (found) return found;
    }

    const fontPx = ZONE_LABEL_SMALL_FONT_PX;
    const h = fontPx;
    const w = measure(item.text, fontPx);
    const left = box.x;
    const right = box.x + box.width;
    for (let ring = 0; ring < LEADER_RINGS; ring += 1) {
      const off = pad + ring * (h + pad);
      const spots: Point[] = [
        { x: right + off + w / 2, y: anchor.y },
        { x: left - off - w / 2, y: anchor.y },
        { x: right + off + w / 2, y: top - off - h / 2 },
        { x: left - off - w / 2, y: top - off - h / 2 },
        { x: right + off + w / 2, y: bottom + off + h / 2 },
        { x: left - off - w / 2, y: bottom + off + h / 2 },
      ];
      const found = firstClear(item, fontPx, spots);
      if (found) {
        const end = nearestOn(placementBox(found), anchor);
        return { ...found, leader: { x1: end.x, y1: end.y, x2: anchor.x, y2: anchor.y } };
      }
    }

    const at = clamp(anchor, w, h);
    return { id: item.id, text: item.text, x: at.x, y: at.y, width: w, fontPx, leader: null, plate: true };
  };

  [...items].sort(byArea).forEach((item) => {
    const placement = place(item);
    placed.push(placementBox(placement));
    out.push(placement);
  });
  return out.sort((a, b) => a.id - b.id);
}
