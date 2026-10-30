import type { EntityMap, HomeAssistant } from "../types";
import { exists } from "../entities";

export interface Row {
  entity: string;
  name: string;
  /** For a button that must not go off on one stray tap: the question Home
   *  Assistant asks before pressing it, and the row's button text. */
  confirm?: { text: string; action: string };
}

/** One row for a resolved entity, none for an unresolved slot. */
export function row(entity: string | undefined, name: string): Row[] {
  return entity ? [{ entity, name }] : [];
}

/** A button row that asks `text` before it presses, with `action` as its
 *  button text. A plain button row presses on one tap, so a tap while
 *  scrolling on a phone would do it. */
export function confirmRow(
  entity: string | undefined,
  name: string,
  text: string,
  action: string
): Row[] {
  return entity ? [{ entity, name, confirm: { text, action } }] : [];
}

/**
 * The Factory Reset Radar row, which asks first. A factory reset wipes what
 * the user set on the chip (thresholds, zones, Zone Type). `chip` names the
 * radar, since an R PRO-1 tab has two.
 */
export function factoryResetRow(entity: string | undefined, chip: string): Row[] {
  return confirmRow(
    entity,
    "Factory Reset Radar",
    `Reset the ${chip} radar to its factory settings?` +
      " It restarts and forgets its own settings.",
    "Reset"
  );
}

/** The Restart Radar row, which asks first: the radar stops detecting while
 *  it restarts. */
export function restartRadarRow(entity: string | undefined, chip: string): Row[] {
  return confirmRow(
    entity,
    "Restart Radar",
    `Restart the ${chip} radar? It stops detecting for a few seconds while it starts up.`,
    "Restart"
  );
}

/** The radar chip's own Bluetooth, which the HLK phone app connects to. The
 *  name keeps it apart from the device's Bluetooth proxy. */
export const RADAR_BLUETOOTH = "Radar Bluetooth (HLK app)";

/** The chip's settings and buttons. The whole-device restart is on the
 *  Device card, since it restarts every radar on the device. */
export function controlRows(m: EntityMap, chip: string): Row[] {
  return [
    ...row(m.engineering_mode, "Radar Engineering Mode"),
    // LD2412 only: the chip's own background correction. Both slots are
    // undefined on an LD2410, so these rows simply do not appear there.
    ...row(m.background_correction, "Start Dynamic Background Correction"),
    ...row(m.background_correction_status, "Background Correction Running"),
    ...row(m.bluetooth, RADAR_BLUETOOTH),
    ...restartRadarRow(m.restart_radar, chip),
    ...factoryResetRow(m.factory_reset_radar, chip),
  ];
}

/** Detection range / timeout / gate-size — kept separate from the threshold sliders. */
export function rangeRows(
  m: EntityMap,
  rangeLabels: [string, string],
  gateSizeLabel: string
): Row[] {
  return [
    ...row(m.radar_timeout, "Radar Timeout"),
    ...row(m.gate_size, gateSizeLabel),
    ...row(m.max_move_distance, rangeLabels[0]),
    ...row(m.max_still_distance, rangeLabels[1]),
  ];
}

export function zoneConfigRows(m: EntityMap): Row[] {
  return [
    ...row(m.zone_1_start, "Start Zone 1"),
    ...row(m.end_zone_1, "End Zone 1"),
    ...row(m.end_zone_2, "End Zone 2"),
    ...row(m.end_zone_3, "End Zone 3"),
  ];
}

/** The unit a distance in a label is written in: feet on a US customary
 *  system, meters otherwise. */
export type LengthUnit = "m" | "ft";

/** "about 3 m" or "about 10 ft". Below 1 m two decimals and below 3 ft one,
 *  so the first gates do not all round to the same number. */
export function aboutDistance(meters: number, unit: LengthUnit): string {
  if (unit === "ft") {
    const ft = meters / 0.3048;
    return `about ${ft < 3 ? Number(ft.toFixed(1)) : Math.round(ft)} ft`;
  }
  return `about ${Number(meters.toFixed(meters < 1 ? 2 : 1))} m`;
}

/** A gate's label: its number, and how far out it reaches. Gate N is the band
 *  ending at N gate sizes; gate 0 is the bin at the sensor itself. */
export function gateName(n: number, gateSizeM: number, unit: LengthUnit): string {
  return n === 0 ? "G0 (at the sensor)" : `G${n} (${aboutDistance(n * gateSizeM, unit)})`;
}

/** Per-gate move thresholds, labelled by gate (the card title says "Move"). */
export function moveThresholdRows(
  m: EntityMap,
  name: (n: number) => string = (n) => `G${n}`
): Row[] {
  const rows: Row[] = [];
  for (let n = 0; n < m.move_threshold.length; n++) {
    rows.push(...row(m.move_threshold[n], name(n)));
  }
  return rows;
}

/** Per-gate still thresholds. */
export function stillThresholdRows(
  m: EntityMap,
  name: (n: number) => string = (n) => `G${n}`
): Row[] {
  const rows: Row[] = [];
  for (let n = 0; n < m.still_threshold.length; n++) {
    rows.push(...row(m.still_threshold[n], name(n)));
  }
  return rows;
}

export function occupancyRows(m: EntityMap): Row[] {
  return [
    ...row(m.radar_target, "Radar Target"),
    ...row(m.moving_target, "Radar Moving Target"),
    ...row(m.still_target, "Radar Still Target"),
    ...row(m.zone_1_occupancy, "Radar Zone 1 Occupancy"),
    ...row(m.zone_2_occupancy, "Radar Zone 2 Occupancy"),
    ...row(m.zone_3_occupancy, "Radar Zone 3 Occupancy"),
    ...row(m.zone_occupancy, "Any zone"),
  ];
}

export function presentRows<T extends { entity: string }>(hass: HomeAssistant, rows: T[]): T[] {
  return rows.filter((r) => exists(hass, r.entity));
}
