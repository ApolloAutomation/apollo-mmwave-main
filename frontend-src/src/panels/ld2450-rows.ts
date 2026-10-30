import type { Ld2450Entities } from "../ld2450-entities";
import { factoryResetRow, row, type Row } from "./entity-rows";

/** The LD2450's own settings. The row names match the gate radars' Controls
 *  card, so the same button reads the same on every tab. */
export function ld2450ControlRows(l: Ld2450Entities): Row[] {
  return [
    ...row(l.zone_type, "Zone Type"),
    // Disabled by default on the R PRO-1, so usually absent there.
    ...row(l.multi_target_tracking, "Multi Target Tracking"),
    ...row(l.timeout, "Radar Timeout"),
    ...row(l.bluetooth, "Bluetooth"),
    ...row(l.restart, "Restart Radar"),
    ...factoryResetRow(l.factory_reset, "LD2450"),
    ...row(l.firmware, "Firmware"),
  ];
}

/** What the radar sees right now, so a user can tell whether it reports
 *  anyone even while the zone map shows no dot. */
export function ld2450LiveRows(l: Ld2450Entities): Row[] {
  return [
    ...row(l.presence, "Presence"),
    ...row(l.moving_target, "Moving Target"),
    ...row(l.still_target, "Still Target"),
    ...row(l.presence_target_count, "Target Count"),
    ...l.targets.flatMap((t, i) => [
      ...row(t.distance, `Target ${i + 1} Distance`),
      ...row(t.direction, `Target ${i + 1} Direction`),
    ]),
  ];
}

/** One built-in zone's rows: its corners, then its counts. */
export function builtInZoneRows(l: Ld2450Entities, index: number): Row[] {
  const z = l.zones[index];
  return [
    ...row(z.x1, "X1"),
    ...row(z.y1, "Y1"),
    ...row(z.x2, "X2"),
    ...row(z.y2, "Y2"),
    ...row(z.all_target_count, "Target Count"),
    ...row(z.still_target_count, "Still Target Count"),
    ...row(z.moving_target_count, "Moving Target Count"),
  ];
}
