import type { EntityMap } from "../types";

/** Parse an LD2410 gate-size select state like "0.75m" / "0.2 m" into meters.
 *  Returns undefined if no numeric value can be parsed. */
export function parseGateSizeMeters(state: string | undefined): number | undefined {
  if (!state) return undefined;
  const match = state.replace(",", ".").match(/[0-9]*\.?[0-9]+/);
  if (!match) return undefined;
  const value = parseFloat(match[0]);
  // TODO(REVIEW_REPORT.md X22): "0m" parses to 0 and collapses the chart axis (no real state
  // does); if hardening, add only a value > 0 guard with geometry tests, keep the loose match.
  return Number.isFinite(value) ? value : undefined;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Map a value in [0, maxRange] onto [0, width] pixels, clamped. */
export function scaleX(value: number, maxRange: number, width: number): number {
  if (maxRange <= 0) return 0;
  return clamp((value / maxRange) * width, 0, width);
}

/** Number of gate registers the map describes: the longest of its four gate
 *  arrays. A device-resolved map sizes each array by that slot's highest
 *  registered gate, so a disabled top-gate threshold leaves move_threshold
 *  one short while the gate's energy sensors still report. */
export function gateRegisterCount(m: EntityMap): number {
  return Math.max(
    m.move_threshold.length,
    m.still_threshold.length,
    m.move_energy.length,
    m.still_energy.length
  );
}
