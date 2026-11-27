/**
 * Test center and edge, a ceiling map's check of where the radar sees the
 * person testing. Kept out of card.ts so the bundle suites can import them.
 */

/** "Right under the radar" is within this many mm of (0, 0). */
export const TEST_CENTER_MM = 500;
/** A tester lost this recently (ms) is reported lost, not gone. */
export const TEST_LOST_SHOW_MS = 5000;
/** The edge band inside the circle, hold.py's HOLD_EXIT_MARGIN_MM. */
export const TEST_EDGE_BAND_MM = 300;
