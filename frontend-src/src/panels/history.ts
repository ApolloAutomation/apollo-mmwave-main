import type { EntityMap } from "../types";
import { row, type Row } from "./entity-rows";

export type HistoryRow = Row;

/** Occupancy history rows with short, readable names (the device prefix would
 *  otherwise repeat and truncate to the same thing on every row). */
export function historyEntities(m: EntityMap): HistoryRow[] {
  return [
    ...row(m.radar_target, "Detected"),
    ...row(m.zone_1_occupancy, "Zone 1"),
    ...row(m.zone_2_occupancy, "Zone 2"),
    ...row(m.zone_3_occupancy, "Zone 3"),
  ];
}
