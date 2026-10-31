import type { EntityMap } from "../types";
import type { Ld2450Entities } from "../ld2450-entities";
import { row } from "./entity-rows";

/** A history line. A drawn zone's line carries no name, so HA shows the
 *  sensor's own, which follows a zone rename. */
export interface HistoryRow {
  entity: string;
  name?: string;
}

/** Occupancy history rows with short, readable names (the device prefix would
 *  otherwise repeat and truncate to the same thing on every row). On a tab
 *  with two radars, `chip` names the gate radar on each of its lines. */
export function historyEntities(m: EntityMap, chip?: string): HistoryRow[] {
  return [
    ...row(m.radar_target, chip ? `${chip} Presence` : "Detected"),
    ...row(m.moving_target, chip ? `${chip} Moving` : "Moving"),
    ...row(m.still_target, chip ? `${chip} Still` : "Still"),
    ...row(m.zone_occupancy, "Any zone"),
    ...row(m.zone_1_occupancy, "Zone 1"),
    ...row(m.zone_2_occupancy, "Zone 2"),
    ...row(m.zone_3_occupancy, "Zone 3"),
  ];
}

/** The LD2450's presence and this integration's drawn zone sensors. `chip`
 *  names the LD2450 on a tab with two radars. */
export function ld2450HistoryEntities(
  l: Ld2450Entities,
  zoneSensors: string[],
  chip?: string
): HistoryRow[] {
  return [
    ...row(l.presence, chip ? `${chip} Presence` : "Presence"),
    ...zoneSensors.map((entity) => ({ entity })),
  ];
}
