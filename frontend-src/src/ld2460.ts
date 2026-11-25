import type { HomeAssistant } from "./types";
import { entitiesForDevice } from "./entity-index";
import { hasLd2450Device } from "./ld2450";
import { apolloModelInfo, isEsphomeDevice } from "./profiles";

/**
 * LD2460 tracking radar support (ESPHome's ld2460 component). Like the
 * LD2450 it reports X and Y per target, which the zone map draws, but it
 * writes both axes of a frame together, reports a lost target as unknown
 * rather than 0/0, and sees a 6 m, 120 degree cone on a wall or a 4 m circle
 * on a ceiling: its installation mode, read once at boot.
 *
 * ESPHome's ld2460 component names the sensors "LD2460 Target-1 X" and so
 * on, giving `sensor.<base>_ld2460_target_<n>_x` / `_y`, maybe with HA's
 * `_2` dedup tail. The `ld2460_` token is required. ld2450.py pairs these
 * for zone presence too; trackers.py tells the two radars apart there.
 */

// Twins of LD2460_X / LD2460_Y in trackers.py.
export const LD2460_X = /(?:^|_)ld2460_target_(\d+)_x(?:_\d+)?$/;
export const LD2460_Y = /(?:^|_)ld2460_target_(\d+)_y(?:_\d+)?$/;
export const LD2460_INSTALLATION_MODE = /(?:^|_)ld2460_installation_mode(?:_\d+)?$/;
/** "LD2460 Presence Target Count", or the component's own name. */
export const LD2460_TARGET_COUNT = /(?:^|_)ld2460_(?:presence_)?target_count(?:_\d+)?$/;

/** How many targets the LD2460 reports. */
export const LD2460_TARGETS = 5;

/** The zone map's view for each mount, in mm and degrees. */
export const LD2460_SIDE_CONE = Object.freeze({ yMax: 6000, fovDeg: 120 });
export const LD2460_TOP_CONE = Object.freeze({ yMax: 4000, fovDeg: 360 });

// Twins of trackers.py and const.py; see ceiling_radius_mm.
export const LD2460_LOOK_DOWN_HALF_DEG = 60;
export const LD2460_TOP_RANGE_MM = 4000;
export const CEILING_HEIGHT = Object.freeze({ minMm: 2000, defaultMm: 2700, maxMm: 4000 });

export type Ld2460Mount = "side" | "top";

/** How the zone map is drawn: from the side, or from above. */
export type MapMount = "wall" | "ceiling";
/** Who chose the mount in effect. */
export type MountSource = "radar" | "saved" | "default";

/**
 * The mount in effect, twin of mount_rule in trackers.py. Only an LD2460
 * can be on a ceiling. Its own report wins when it says side or top;
 * otherwise the mount saved under Map settings, else the wall.
 */
export function mountRule(
  tracker: string | undefined,
  modeState: string | null | undefined,
  saved: string | null | undefined
): { mount: MapMount; source: MountSource } {
  if (tracker !== "ld2460") return { mount: "wall", source: "default" };
  if (modeState === "top") return { mount: "ceiling", source: "radar" };
  if (modeState === "side") return { mount: "wall", source: "radar" };
  if (saved === "ceiling") return { mount: "ceiling", source: "saved" };
  return { mount: "wall", source: "default" };
}

/**
 * How far out from the spot under a ceiling radar it sees, in mm, twin of
 * ceiling_radius_mm: min(4000, h × tan 60°), with h clamped to the ceiling
 * height bounds. 2.5 m × tan 60° is 4.33 m, so the manual's ±4 m holds at
 * its recommended 2.5 to 3 m; only below about 2.31 m does the circle shrink.
 */
export function ceilingRadiusMm(heightMm: number): number {
  const h = Number.isFinite(heightMm)
    ? Math.min(CEILING_HEIGHT.maxMm, Math.max(CEILING_HEIGHT.minMm, heightMm))
    : CEILING_HEIGHT.defaultMm;
  const tan = Math.tan((LD2460_LOOK_DOWN_HALF_DEG * Math.PI) / 180);
  return Math.min(LD2460_TOP_RANGE_MM, h * tan);
}

export type Tracker = "ld2450" | "ld2460";

/** The mount an installation mode state names, or undefined for any other. */
export function ld2460Mount(state?: string): Ld2460Mount | undefined {
  return state === "side" || state === "top" ? state : undefined;
}

const objectId = (id: string) => id.slice(id.indexOf(".") + 1);

/** Whether both ids of an X/Y pair are the LD2460's (is_ld2460_pair). */
export function isLd2460Pair(pair: { x?: unknown; y?: unknown } | undefined): boolean {
  const x = pair?.x;
  const y = pair?.y;
  return (
    typeof x === "string" &&
    typeof y === "string" &&
    LD2460_X.test(objectId(x)) &&
    LD2460_Y.test(objectId(y))
  );
}

/** Every LD2460 X, Y, target count and installation mode id of a device. */
export function ld2460EntityIds(hass: HomeAssistant, deviceId: string): string[] {
  const ids: string[] = [];
  for (const [id] of entitiesForDevice(hass.entities, deviceId)) {
    if (!id.startsWith("sensor.")) continue;
    const oid = objectId(id);
    if (
      LD2460_X.test(oid) ||
      LD2460_Y.test(oid) ||
      LD2460_TARGET_COUNT.test(oid) ||
      LD2460_INSTALLATION_MODE.test(oid)
    ) {
      ids.push(id);
    }
  }
  return ids;
}

/** True when the device's registered entities include an LD2460 Target X. */
export function hasLd2460Device(hass: HomeAssistant, deviceId: string): boolean {
  for (const [id] of entitiesForDevice(hass.entities, deviceId)) {
    if (id.startsWith("sensor.") && LD2460_X.test(objectId(id))) return true;
  }
  return false;
}

/**
 * Which tracking radar a device has. Its entities decide first: an LD2460 X
 * makes it an LD2460 even beside stale LD2450 sensors, then an LD2450 X makes
 * it an LD2450. Only with neither does the registry model decide.
 */
export function trackerOf(hass: HomeAssistant, deviceId: string): Tracker | undefined {
  if (hasLd2460Device(hass, deviceId)) return "ld2460";
  if (hasLd2450Device(hass, deviceId)) return "ld2450";
  if (!isEsphomeDevice(hass, deviceId)) return undefined;
  const reg = apolloModelInfo(hass.devices?.[deviceId]);
  if (reg?.ld2460) return "ld2460";
  if (reg?.ld2450) return "ld2450";
  return undefined;
}
