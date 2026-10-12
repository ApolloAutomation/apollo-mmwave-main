import type { HomeAssistant } from "./types";

type EntityRegistry = HomeAssistant["entities"];
type EntityEntry = EntityRegistry[string];

/** One device's registry entries as `[entityId, entry]` pairs, in the order
 *  `Object.entries(hass.entities)` yields them. */
export type DeviceEntities = readonly (readonly [string, EntityEntry])[];

/** Registry entries grouped by their `device_id` value. */
type DeviceIndex = Map<string | undefined, [string, EntityEntry][]>;

const NO_ENTITIES: DeviceEntities = [];

/**
 * Per-device view of the entity registry, built once per registry object.
 *
 * Every detection helper (base name, profile, entity map, ESPHome check,
 * LD2450 sensors, liveness) needs only one device's entries, and the strategy
 * asks for every device in `hass.devices`. Scanning the whole registry in each
 * helper made detection O(devices x entities), and `shouldRegenerate` runs it
 * for two hass objects whenever any entity crosses the unavailable line. One
 * grouping pass per registry object keeps it linear.
 *
 * The cache is keyed on the `hass.entities` object itself. That relies on Home
 * Assistant replacing (never mutating) `hass.entities` on a registry change,
 * the same invariant `cards/resolution.ts` memoises on. Callers, tests
 * included, must not add, remove or re-home entries of a `hass.entities`
 * object in place once a helper has read it: build a new object instead.
 *
 * Entries are grouped by their `device_id` value as is, so each device's list
 * holds exactly the entries an `e.device_id === deviceId` filter would keep,
 * in registry order (first-match-wins and tie-breaks are unchanged).
 */
const INDEX = new WeakMap<EntityRegistry, DeviceIndex>();

function indexFor(entities: EntityRegistry): DeviceIndex {
  let index = INDEX.get(entities);
  if (!index) {
    index = new Map();
    for (const [id, e] of Object.entries(entities)) {
      const list = index.get(e.device_id);
      if (list) list.push([id, e]);
      else index.set(e.device_id, [[id, e]]);
    }
    INDEX.set(entities, index);
  }
  return index;
}

/** The registry entries attached to `deviceId`, in registry order. */
export function entitiesForDevice(
  entities: EntityRegistry,
  deviceId: string
): DeviceEntities {
  return indexFor(entities).get(deviceId) ?? NO_ENTITIES;
}
