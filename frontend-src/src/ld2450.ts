import type { HomeAssistant } from "./types";

/**
 * LD2450 tracking radar support (X/Y target coordinates), used by R-PRO-1 and
 * MTR-1. This is deliberately separate from the gate-radar *tuning* profiles
 * (LD2410/LD2412): the LD2450 reports moving-target positions, which the
 * Apollo Zone Map card draws occupancy zones over, it is not tuned with
 * per-gate thresholds, so it has no tuning profile.
 *
 * Entity naming comes from the Apollo ESPHome firmware, which exposes three
 * targets. The R-PRO-1 names them "LD2450 Target-1 X" and so on, giving
 * `sensor.<base>_ld2450_target_<n>_x` / `_y`; the MTR-1 names them
 * "Target-1 X", giving `sensor.<base>_target_<n>_x` / `_y`. Either spelling
 * may carry HA's `_2` dedup tail.
 */

// Suffix-matched against actual entity ids so renamed prefixes and HA's `_2`
// dedup suffix don't break detection. The target number sits before the dedup
// digits, so it can't be misread. The R-PRO-1 firmware names the sensors
// "LD2450 Target-1 X"; the MTR-1 firmware names them "Target-1 X" with no chip
// prefix, so the prefix is optional. Keep in sync with ld2450.py.
const TARGET_X = /(?:_ld2450)?_target_(\d+)_x(?:_\d+)?$/;
const TARGET_Y = /(?:_ld2450)?_target_(\d+)_y(?:_\d+)?$/;

/** Every LD2450 target coordinate entity of a device, paired or not (a lone
 *  X with its Y disabled still counts as radar evidence). */
export function ld2450EntityIds(hass: HomeAssistant, deviceId: string): string[] {
  const ids: string[] = [];
  for (const [id, e] of Object.entries(hass.entities)) {
    if (e.device_id !== deviceId || !id.startsWith("sensor.")) continue;
    const oid = id.slice(id.indexOf(".") + 1);
    if (TARGET_X.test(oid) || TARGET_Y.test(oid)) ids.push(id);
  }
  return ids;
}

/** True when the device's registered entities include LD2450 target sensors.
 *  Only the X sensor is required — Y may be individually disabled. */
export function hasLd2450Device(hass: HomeAssistant, deviceId: string): boolean {
  for (const [id, e] of Object.entries(hass.entities)) {
    if (e.device_id !== deviceId || !id.startsWith("sensor.")) continue;
    if (TARGET_X.test(id.slice(id.indexOf(".") + 1))) return true;
  }
  return false;
}

/**
 * An Apollo Zone Map card config for a device's LD2450.
 *
 * Identity is the device id: it survives renames, cannot collide with another
 * device's slug, and is what the zone store is keyed by. `title` is display
 * only, so a user can call the card "Kitchen" and still share zone data with
 * the auto-generated dashboard.
 */
export function zoneMapCard(
  deviceId: string,
  title: string
): Record<string, any> {
  return {
    type: "custom:apollo-radar-zone-map-card",
    device_id: deviceId,
    title,
    unit_display: true,
  };
}
