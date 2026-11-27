import type { HomeAssistant } from "./types";
import { entitiesForDevice } from "./entity-index";
import {
  LD2460_INSTALLATION_MODE,
  LD2460_TARGET_COUNT,
  LD2460_TARGETS,
  LD2460_X,
  LD2460_Y,
} from "./ld2460";

/**
 * The LD2460's sensors, resolved from one device's registered entities.
 *
 * Every name carries the `ld2460_` token, so matching by suffix is safe, and
 * this integration's own zone entities are skipped. An entity registered
 * under an older base (a device renamed, or reflashed under a new name)
 * still matches, and the first in registry order wins.
 */

/** One LD2460 target's sensors. */
export interface Ld2460Target {
  x?: string;
  y?: string;
  distance?: string;
  angle?: string;
}

/** The entity ids found on one device. Any field may be missing. */
export interface Ld2460Entities {
  installation_mode?: string;
  target_count?: string;
  /** The firmware's own presence, on while the radar counts anyone. */
  presence?: string;
  /** Targets 1 to 5, at index 0 to 4. */
  targets: Ld2460Target[];
}

const OWN_PLATFORM = "apollo_mmwave";
const PRESENCE = /(?:^|_)ld2460_presence(?:_\d+)?$/;
const TARGET_DISTANCE = /(?:^|_)ld2460_target_(\d+)_distance(?:_\d+)?$/;
const TARGET_ANGLE = /(?:^|_)ld2460_target_(\d+)_angle(?:_\d+)?$/;

const TARGET_FIELDS: [RegExp, keyof Ld2460Target][] = [
  [LD2460_X, "x"],
  [LD2460_Y, "y"],
  [TARGET_DISTANCE, "distance"],
  [TARGET_ANGLE, "angle"],
];

const CACHE = new WeakMap<HomeAssistant["entities"], Map<string, Ld2460Entities>>();

/** The LD2460 entities of one device, cached per registry object. */
export function ld2460Entities(hass: HomeAssistant, deviceId: string): Ld2460Entities {
  let perDevice = CACHE.get(hass.entities);
  if (!perDevice) {
    perDevice = new Map();
    CACHE.set(hass.entities, perDevice);
  }
  const cached = perDevice.get(deviceId);
  if (cached) return cached;

  const out: Ld2460Entities = {
    targets: Array.from({ length: LD2460_TARGETS }, () => ({})),
  };
  for (const [id, entry] of entitiesForDevice(hass.entities, deviceId)) {
    if (entry.platform === OWN_PLATFORM) continue;
    const dot = id.indexOf(".");
    const domain = id.slice(0, dot);
    const oid = id.slice(dot + 1);
    if (domain === "binary_sensor") {
      if (PRESENCE.test(oid)) out.presence ??= id;
      continue;
    }
    if (domain !== "sensor") continue;
    if (LD2460_INSTALLATION_MODE.test(oid)) {
      out.installation_mode ??= id;
      continue;
    }
    if (LD2460_TARGET_COUNT.test(oid)) {
      out.target_count ??= id;
      continue;
    }
    for (const [re, key] of TARGET_FIELDS) {
      const m = re.exec(oid);
      if (!m) continue;
      const target = out.targets[parseInt(m[1], 10) - 1];
      if (target) target[key] ??= id;
      break;
    }
  }
  perDevice.set(deviceId, out);
  return out;
}
