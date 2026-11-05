import type { Ld2450Entities } from "../ld2450-entities";
import {
  factoryResetRow,
  RADAR_BLUETOOTH,
  restartRadarRow,
  row,
  type Row,
} from "./entity-rows";

/** The LD2450's own settings. The row names match the gate radars' Controls
 *  card, so the same button reads the same on every tab. Its firmware version
 *  is on the Device card, beside the other versions. */
export function ld2450ControlRows(l: Ld2450Entities): Row[] {
  return [
    ...row(l.zone_type, "Zone Type"),
    // Disabled by default on the R PRO-1, so usually absent there.
    ...row(l.multi_target_tracking, "Multi Target Tracking"),
    ...row(l.timeout, "Radar Timeout"),
    ...row(l.bluetooth, RADAR_BLUETOOTH),
    ...restartRadarRow(l.restart, "LD2450"),
    ...factoryResetRow(l.factory_reset, "LD2450"),
  ];
}

/** What the radar sees right now, so a user can tell whether it reports
 *  anyone even while the zone map shows no dot. Its presence is named for the
 *  chip: it covers the radar's whole view, not a room or a drawn zone, and
 *  the Radar Timeout note under LD2450 Controls calls it LD2450 Presence.
 *  The target count is not a row: see `targetCountText`. */
export function ld2450LiveRows(l: Ld2450Entities): Row[] {
  return [
    ...row(l.presence, "LD2450 Presence"),
    ...row(l.moving_target, "Moving Target"),
    ...row(l.still_target, "Still Target"),
    ...l.targets.flatMap((t, i) => [
      ...row(t.distance, `Target ${i + 1} Distance`),
      ...row(t.direction, `Target ${i + 1} Direction`),
    ]),
  ];
}

/**
 * The radar's target count, under the LD2450 Live rows, as a markdown
 * template. An entities row shows it as "0.0": Home Assistant's ESPHome
 * sensors report a float, and HA formats a sensor's number (with its display
 * precision) only when it has a unit or a state class, which the count has
 * neither of. No entities row can format it, so the template prints the
 * whole number, and Unavailable or Unknown as a row would.
 */
export function targetCountText(entity: string): string {
  return (
    `{% set n = states('${entity}') %}` +
    "Target Count: **{{ n | int if is_number(n) else n | capitalize }}**"
  );
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
