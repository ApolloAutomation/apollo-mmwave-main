import type { Ld2460Entities } from "../ld2460-entities";
import { row, type Row } from "./entity-rows";

/** What the LD2460 reports right now: its presence, the mount it read at
 *  boot, and each target's distance and angle. The count is not a row, as
 *  under LD2450 Live (`targetCountText`). */
export function ld2460LiveRows(l: Ld2460Entities): Row[] {
  return [
    ...row(l.presence, "LD2460 Presence"),
    ...row(l.installation_mode, "Installation Mode"),
    ...l.targets.flatMap((t, i) => [
      ...row(t.distance, `Target ${i + 1} Distance`),
      ...row(t.angle, `Target ${i + 1} Angle`),
    ]),
  ];
}
