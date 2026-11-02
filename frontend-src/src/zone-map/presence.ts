/**
 * Which presence sensor lights a zone on the zone map, and how its state
 * looks there.
 *
 * The zones payload names each zone's presence entity (`presence_entity_id`),
 * so a renamed entity id still lights its zone. A 2.3.0 backend sends no id,
 * and a push can come in before the registry has one, so the card falls back
 * to the id this integration gives the sensor,
 * `binary_sensor.<device>_zone_<n>_presence`, maybe with Home Assistant's
 * dedup tail.
 */

import { entitiesForDevice } from "../entity-index";
import type { HomeAssistant } from "../types";

type EntityRegistry = HomeAssistant["entities"];

/** The platform this integration's own entities carry. */
const OWN_PLATFORM = "apollo_mmwave";

/** A zone presence sensor's id; group 1 is the zone id as written. */
const ZONE_PRESENCE_ID = /^binary_sensor\..+_zone_(\d+)_presence(?:_\d+)?$/;

/** Per registry object, per device: zone id as written -> entity id. Like
 *  `entity-index.ts`, this relies on Home Assistant replacing, never
 *  mutating, `hass.entities`, so a renamed or new sensor is a new object. */
const CACHE = new WeakMap<EntityRegistry, Map<string, Map<string, string>>>();

/**
 * The presence sensor id the integration would give zone `zoneId` of device
 * `deviceId`, from the entity registry, or null when there is none. Only the
 * device's own entries count, from this integration or with no platform (older
 * frontends send none); the first one in registry order wins.
 */
export function fallbackPresenceId(
  entities: EntityRegistry | undefined,
  deviceId: string,
  zoneId: number | string
): string | null {
  if (!entities) return null;
  let perDevice = CACHE.get(entities);
  if (!perDevice) {
    perDevice = new Map();
    CACHE.set(entities, perDevice);
  }
  let zones = perDevice.get(deviceId);
  if (!zones) {
    zones = new Map();
    for (const [id, entry] of entitiesForDevice(entities, deviceId)) {
      if (entry.platform && entry.platform !== OWN_PLATFORM) continue;
      const match = ZONE_PRESENCE_ID.exec(id);
      if (match && !zones.has(match[1])) zones.set(match[1], id);
    }
    perDevice.set(deviceId, zones);
  }
  return zones.get(String(zoneId)) ?? null;
}

/** How a detect zone is drawn for its presence sensor's state. */
export type PresenceLook = "on" | "off" | "unavailable";

/**
 * `on` lights the zone and `unavailable` greys it (the radar is offline).
 * Anything else, `off`, `unknown` or no state at all, draws as off: a zone
 * whose sensor has not reported yet is not occupied as far as anyone knows.
 */
export function presenceLook(state: string | null | undefined): PresenceLook {
  if (state === "on") return "on";
  if (state === "unavailable") return "unavailable";
  return "off";
}
