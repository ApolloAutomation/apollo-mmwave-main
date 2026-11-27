/**
 * What the "Radar setup" card checks on an LD2460, as pure functions of HA
 * state. The LD2460 has no settings to change from Home Assistant, so no
 * problem here carries a fix: the card only says what it found.
 */

import type { HomeAssistant } from "../types";
import { ld2460Entities } from "../ld2460-entities";
import { ld2460Mount } from "../ld2460";
import { isLive, type SetupProblem, type SetupStatus } from "./setup-checks";

export const LD2460_NOTHING_TO_CHECK_LINE =
  "This device has no LD2460 Installation Mode or targets to check.";
export const LD2460_MODE_UNREAD =
  "The LD2460 has not answered the installation mode query, so ESPHome treats it as" +
  " side mounted. Check the radar's TX wire, or restart the device. Until it answers, the" +
  " zone map uses the mount chosen under Map settings.";

/** The target count note: the radar sees more people than HA has targets for. */
export function ld2460TargetsLine(seen: number, paired: number): string {
  return (
    `The radar sees ${seen} people, but Home Assistant has X and Y for only ${paired} of` +
    ` its 5 targets, so the zone map shows ${paired}. The device's firmware sets which` +
    " targets it sends."
  );
}

/** The ids the checks read: the mode, the count and each target's X and Y. */
export function ld2460WatchedIds(hass: HomeAssistant, deviceId: string | undefined): string[] {
  if (!deviceId) return [];
  const l = ld2460Entities(hass, deviceId);
  return [
    l.installation_mode,
    l.target_count,
    ...l.targets.flatMap((t) => [t.x, t.y]),
  ].filter((id): id is string => id !== undefined);
}

/** The card's state for an LD2460, from live HA state. */
export function ld2460SetupStatus(
  hass: HomeAssistant,
  deviceId: string | undefined
): SetupStatus {
  if (!deviceId) return { kind: "no_device" };
  const l = ld2460Entities(hass, deviceId);
  const xs = l.targets.map((t) => t.x).filter((id): id is string => id !== undefined);
  if (!l.installation_mode && xs.length === 0) return { kind: "nothing_to_check" };
  const checked = ld2460WatchedIds(hass, deviceId);
  if (!checked.some((id) => isLive(hass.states[id]))) return { kind: "offline" };
  const problems: SetupProblem[] = [];
  const mode = l.installation_mode ? hass.states[l.installation_mode] : undefined;
  if (l.installation_mode && isLive(mode) && !ld2460Mount(mode.state)) {
    problems.push({
      setting: "installation_mode",
      name: "Installation Mode",
      entityId: l.installation_mode,
      level: "warning",
      text: LD2460_MODE_UNREAD,
    });
  }
  const count = l.target_count ? Number(hass.states[l.target_count]?.state) : NaN;
  const paired = l.targets.filter((t) => t.x && t.y).length;
  if (l.target_count && Number.isFinite(count) && Math.round(count) > paired) {
    problems.push({
      setting: "target_count",
      name: "Target Count",
      entityId: l.target_count,
      level: "note",
      text: ld2460TargetsLine(Math.round(count), paired),
    });
  }
  return { kind: "checked", problems };
}
