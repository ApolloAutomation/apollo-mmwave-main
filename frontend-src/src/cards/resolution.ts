import type { EntityMap, HomeAssistant, Ld2410CardConfig } from "../types";
import { resolveEntitiesDetailed, resolveProfile } from "../entities";
import { detectProfile, type RadarProfile } from "../profiles";

/**
 * Memoized entity/profile resolution for the custom cards.
 *
 * Resolution scans every registry entry against ~25 suffix regexes — far too
 * heavy to redo on every hass tick (HA replaces `hass` on each state change).
 * The result depends on the config object and the entity/device registries,
 * all of which HA replaces (never mutates) on change, so reference equality
 * on those three inputs is the main cache key. One input lives in
 * `hass.states`: when resolution falls back to building ids from a base name
 * (a `device_base_name`-only config, or a device whose entities are not in
 * the registry yet), `detectProfile(hass, base)` picks the chip by which
 * engineering-mode switch exists in states. The cache keeps that detection
 * result and is reused only while a fresh detection still agrees, so an
 * R-PRO-1 resolved before its states arrived does not stay on LD2410 ids.
 */
export interface ResolvedRadar {
  config: Ld2410CardConfig;
  entities: HomeAssistant["entities"];
  devices: HomeAssistant["devices"];
  map: EntityMap;
  profile?: RadarProfile;
  /** Flat list of the map's entity ids, for cheap changed-state checks. */
  ids: string[];
  /** `ids` minus the ESP Reboot button, for the "device not found" decision. */
  radarIds: string[];
  /** Base name of a base-name fallback resolution; undefined otherwise. */
  fallbackBase?: string;
  /** `detectProfile(hass, fallbackBase)` when resolved (undefined when no
   *  engineering-mode switch for that base was in states). */
  fallbackDetected?: RadarProfile;
}

/** Every entity id in the map (gate arrays flattened, holes skipped). */
export function entityIds(m: EntityMap): string[] {
  const out: string[] = [];
  for (const v of Object.values(m)) {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) for (const id of v) if (id) out.push(id);
  }
  return out;
}

/** Every entity id in the map except the ESP Reboot button. Any ESPHome device
 *  has that button (an AIR-1 or an MTR-1 too), so it says nothing about a gate
 *  radar being there; strategy-core's radar evidence leaves it out as well. */
export function radarEntityIds(m: EntityMap): string[] {
  return entityIds(m).filter((id) => id !== m.esp_reboot);
}

/** Return `cache` untouched while its inputs are reference-equal (and, for a
 *  base-name fallback, while the chip detected from states is unchanged),
 *  else resolve. */
export function resolveRadar(
  cache: ResolvedRadar | undefined,
  hass: HomeAssistant,
  config: Ld2410CardConfig
): ResolvedRadar {
  if (
    cache &&
    cache.config === config &&
    cache.entities === hass.entities &&
    cache.devices === hass.devices &&
    (cache.fallbackBase === undefined ||
      detectProfile(hass, cache.fallbackBase) === cache.fallbackDetected)
  ) {
    return cache;
  }
  const { map, fallbackBase } = resolveEntitiesDetailed(hass, config);
  return {
    config,
    entities: hass.entities,
    devices: hass.devices,
    map,
    profile: resolveProfile(hass, config),
    ids: entityIds(map),
    radarIds: radarEntityIds(map),
    fallbackBase,
    fallbackDetected:
      fallbackBase === undefined ? undefined : detectProfile(hass, fallbackBase),
  };
}

/** True when any of the resolved entities' state objects changed between hass
 *  ticks. HA replaces the state object of exactly the entities that changed,
 *  so reference comparison is both correct and cheap. */
export function resolvedStatesChanged(
  oldHass: HomeAssistant,
  newHass: HomeAssistant,
  ids: string[]
): boolean {
  return ids.some((id) => oldHass.states[id] !== newHass.states[id]);
}

/** True when any resolved entity id exists in states — a configured card whose
 *  device was removed/renamed resolves nothing and should say so, not blank. */
export function anyResolved(hass: HomeAssistant, ids: string[]): boolean {
  return ids.some((id) => id in hass.states);
}

/** The HA device id a card config points at: `device_id` when set, else the
 *  device of the first resolved entity the registry knows (the
 *  `device_base_name` fallback has no id of its own, so the entities vouch). */
export function resolvedDeviceId(
  hass: HomeAssistant,
  config: { device_id?: string },
  map: EntityMap
): string | undefined {
  if (config.device_id) return config.device_id;
  for (const id of entityIds(map)) {
    const deviceId = hass.entities[id]?.device_id;
    if (deviceId) return deviceId;
  }
  return undefined;
}
