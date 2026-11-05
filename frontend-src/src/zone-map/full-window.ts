/**
 * Expand map: the zone map card shown full window, and the canvas's
 * resolution there and in the card.
 *
 * The card moves its own DOM into a modal `<dialog>` (the top layer), so
 * the map, its buttons, the zone chips, the zone editor and Map settings
 * keep every bit of state they had. This module holds the pure parts: how
 * the window is split between the map and the panel beside or under it,
 * how big the canvas's backing store is for a screen's device pixels, the
 * button icons, and whether a card sits inside someone else's dialog.
 */

/** The panel beside the map takes this share of the window's width ... */
export const FULL_WINDOW_SIDE_SHARE = 0.3;
/** ... but never less than this ... */
export const FULL_WINDOW_SIDE_MIN_PX = 300;
/** ... nor more. */
export const FULL_WINDOW_SIDE_MAX_PX = 420;
/** The gap between the map and the panel beside it. */
export const FULL_WINDOW_GAP_PX = 16;
/** The least height the panel under the map keeps, where it can. */
export const FULL_WINDOW_ROOM_PX = 160;
/** Under this, a stacked map leaves its panel too little room to use, so the
 *  panel goes beside the map instead, however narrow that makes the map. */
export const FULL_WINDOW_PANEL_MIN_PX = 120;
/** The title row, the version notice and the row gaps above a stacked map,
 *  when the card has not measured them. */
export const FULL_WINDOW_HEADER_PX = 64;
/** The smallest map the window shows, as the card's height cap does. */
export const FULL_WINDOW_MAP_MIN_PX = 240;
/** How long the card waits for the popstate of its own history.back(). */
export const FULL_WINDOW_BACK_MS = 1000;

export type FullWindowLayout = {
  /** The map beside the panel, or the panel under the map. */
  layout: 'side' | 'stacked';
  /** The map's width in CSS px, its border included. */
  mapWidth: number;
  /** The panel's width in CSS px. */
  sideWidth: number;
};

export type FullWindowBox = {
  /** The full window's content box (inside the safe area padding). */
  width: number;
  height: number;
  /** The map's width over its height. */
  aspect: number;
  /** What sits above a stacked map: the title row, the version notice and
   *  the row gaps. */
  headerPx?: number;
  /** How wide the map was in the card, which the stacked map never goes
   *  under. */
  cardMapWidth?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Split the full window between the map and its panel. Beside each other,
 * the panel takes FULL_WINDOW_SIDE_SHARE of the width (between the MIN and
 * MAX) and the map the rest, as tall as the window lets it. Stacked, the
 * map takes the width, leaving FULL_WINDOW_ROOM_PX under it for the panel,
 * but never less than FULL_WINDOW_MAP_MIN_PX tall nor narrower than it was
 * in the card. Whichever gives the wider map wins, and beside each other
 * wins a tie. On a short window, such as a phone held sideways, those two
 * floors can leave a stacked panel under FULL_WINDOW_PANEL_MIN_PX, where
 * the zone chips, the zone editor and Map settings cannot be reached: then
 * the panel goes beside the map whenever there is any width left for it.
 */
export function fullWindowLayout({
  width,
  height,
  aspect,
  headerPx = FULL_WINDOW_HEADER_PX,
  cardMapWidth = 0,
}: FullWindowBox): FullWindowLayout {
  const shape = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const side = clamp(
    Math.round(FULL_WINDOW_SIDE_SHARE * width),
    FULL_WINDOW_SIDE_MIN_PX,
    FULL_WINDOW_SIDE_MAX_PX,
  );
  const room = width - side - FULL_WINDOW_GAP_PX;
  const sideW = Math.min(room, height * shape);
  const stackW = Math.min(
    width,
    Math.max(
      FULL_WINDOW_MAP_MIN_PX * shape,
      cardMapWidth,
      (height - headerPx - FULL_WINDOW_ROOM_PX) * shape,
    ),
  );
  const cramped = height - headerPx - stackW / shape < FULL_WINDOW_PANEL_MIN_PX;
  if ((room >= FULL_WINDOW_MAP_MIN_PX || (cramped && room > 0)) && (sideW >= stackW || cramped)) {
    return { layout: 'side', mapWidth: Math.max(0, Math.floor(sideW)), sideWidth: side };
  }
  return {
    layout: 'stacked',
    mapWidth: Math.max(0, Math.floor(stackW)),
    sideWidth: Math.max(0, Math.floor(width)),
  };
}

// mdi icons (Pictogrammers, Apache 2.0): mdiFullscreen, mdiFullscreenExit
// and mdiClose.
export const ICON_EXPAND = 'M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z';
export const ICON_COLLAPSE = 'M14,14H19V16H16V19H14V14M5,14H10V19H8V16H5V14M8,5H10V10H5V8H8V5M19,8V10H14V5H16V8H19Z';
export const ICON_CLOSE =
  'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z';

/** A 20 px icon in the text color, hidden from assistive tech: the button
 *  around it carries the label. */
export function iconSvg(path: string): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false"><path d="${path}"></path></svg>`;
}

/**
 * Whether `node` sits inside a dialog: a native `<dialog>`, or Home
 * Assistant's `ha-dialog` or `wa-dialog`, as a more-info popup or a
 * third-party popup card puts a card in. Walks out through shadow roots.
 * The card's own expanded dialog is inside the card, never around it.
 */
export function insideDialog(node: Node | null): boolean {
  let current: Node | null = node ? (node.parentNode ?? (node as unknown as ShadowRoot).host ?? null) : null;
  while (current) {
    if (typeof HTMLDialogElement !== 'undefined' && current instanceof HTMLDialogElement) return true;
    const tag = (current as Element).localName;
    if (tag === 'ha-dialog' || tag === 'wa-dialog') return true;
    current = current.parentNode ?? (current as unknown as ShadowRoot).host ?? null;
  }
  return false;
}
