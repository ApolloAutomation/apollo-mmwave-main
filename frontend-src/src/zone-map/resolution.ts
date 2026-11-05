/**
 * The zone map canvas's resolution.
 *
 * The card draws in logical px: 800 px wide in the card, the width every px
 * size in it (labels, lines, dots, the grid's 40 px spacing) was made for,
 * and while the map is expanded about as wide as it shows, so text and lines
 * keep their size and the grid gets finer. Under that sits the backing
 * store, one px per device px, so a HiDPI screen gets a sharp map. Pure
 * functions: the card sizes the canvas and scales each frame to the store.
 */

/** The canvas's logical width while expanded follows the map's CSS width,
 *  from the card's 800 px up to this. */
export const FULL_WINDOW_LOGICAL_MAX_PX = 1600;
/** The backing store is at most this many device px per logical px ... */
export const BACKING_SCALE_MAX = 3;
/** ... and at most this many px in all. */
export const BACKING_MAX_PIXELS = 6_000_000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** The canvas's logical width: 800 in the card, and while expanded the
 *  map's CSS width, from 800 up to FULL_WINDOW_LOGICAL_MAX_PX. */
export function logicalWidth(cardWidth: number, mapWidth: number | null): number {
  if (mapWidth === null || !Number.isFinite(mapWidth)) return cardWidth;
  return clamp(Math.round(mapWidth), cardWidth, FULL_WINDOW_LOGICAL_MAX_PX);
}

export type BackingStore = { width: number; height: number };

/**
 * The canvas's backing store for a logical `mapW` x `mapH` drawn `cssWidth`
 * CSS px wide on a screen of `dpr` device pixels per CSS px: one store px
 * per device px, but never fewer than one per logical px, never more than
 * BACKING_SCALE_MAX, and never more than BACKING_MAX_PIXELS in all. A
 * canvas with no layout box yet keeps one per logical px.
 */
export function backingStore(
  mapW: number,
  mapH: number,
  cssWidth: number,
  dpr: number,
): BackingStore {
  const ratio = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const css = cssWidth > 0 && Number.isFinite(cssWidth) ? cssWidth : 0;
  const bw = clamp(Math.round(css * ratio), mapW, BACKING_SCALE_MAX * mapW);
  let k = bw / mapW;
  let width = Math.round(mapW * k);
  let height = Math.round(mapH * k);
  if (width * height > BACKING_MAX_PIXELS) {
    k = Math.sqrt(BACKING_MAX_PIXELS / (mapW * mapH));
    width = Math.floor(mapW * k);
    height = Math.floor(mapH * k);
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
}
