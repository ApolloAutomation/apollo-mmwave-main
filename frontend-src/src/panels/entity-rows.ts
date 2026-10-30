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

/**
 * The Factory Reset Radar row, which asks first. A plain button row presses
 * on one tap of Press, and a factory reset wipes what the user set on the
 * chip (thresholds, zones, Zone Type), so a tap while scrolling on a phone
 * must not do it. `chip` names the radar, since an R PRO-1 tab has two.
 */
export function factoryResetRow(entity: string | undefined, chip: string): Row[] {
  if (!entity) return [];
  return [
    {
      entity,
      name: "Factory Reset Radar",
      confirm: {
        text:
          `Reset the ${chip} radar to its factory settings?` +
          " It restarts and forgets its own settings.",
        action: "Reset",
      },
    },
  ];
}

export function controlRows(m: EntityMap, chip: string): Row[] {
  return [
    ...row(m.engineering_mode, "Radar Engineering Mode"),
    // LD2412 only: the chip's own background correction. Both slots are
    // undefined on an LD2410, so these rows simply do not appear there.
    ...row(m.background_correction, "Start Dynamic Background Correction"),
    ...row(m.background_correction_status, "Background Correction Running"),
    ...row(m.bluetooth, "Bluetooth"),
    ...row(m.restart_radar, "Restart Radar"),
    ...factoryResetRow(m.factory_reset_radar, chip),
    ...row(m.esp_reboot, "ESP Reboot"),
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

/** Per-gate move thresholds, labelled just by gate (the card title says "Move"). */
export function moveThresholdRows(m: EntityMap): Row[] {
  const rows: Row[] = [];
  for (let n = 0; n < m.move_threshold.length; n++) {
    rows.push(...row(m.move_threshold[n], `G${n}`));
  }
  return rows;
}

/** Per-gate still thresholds. */
export function stillThresholdRows(m: EntityMap): Row[] {
  const rows: Row[] = [];
  for (let n = 0; n < m.still_threshold.length; n++) {
    rows.push(...row(m.still_threshold[n], `G${n}`));
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
  ];
}

export function presentRows(hass: HomeAssistant, rows: Row[]): Row[] {
  return rows.filter((r) => exists(hass, r.entity));
}
