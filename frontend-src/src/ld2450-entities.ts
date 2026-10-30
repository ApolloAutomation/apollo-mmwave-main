import type { HomeAssistant } from "./types";
import { entitiesForDevice } from "./entity-index";

/**
 * The LD2450's settings and live sensors, resolved from one device's
 * registered entities.
 *
 * Two Apollo firmwares name them differently. The R PRO-1 puts "LD2450 " in
 * front of every name ("LD2450 Zone Type" gives `select.<dev>_ld2450_zone_type`)
 * because it also carries an LD2412. The MTR-1 mostly does not ("Zone Type"
 * gives `select.<dev>_zone_type`), keeps the prefix on a few ("LD2450
 * Bluetooth", "LD2450 Presence") and puts it last on one ("Factory Reset
 * LD2450"). Either spelling may carry HA's `_2` dedup tail, and an entity
 * that is disabled by default keeps the id it was registered with
 * (`switch.apollo_r_pro_1_7a711c_ld2450_multi_target_tracking`) after the
 * user renames the device, so only the suffix counts, never the base.
 *
 * The MTR-1's bare names ("timeout", "zone_type") are generic, so every
 * lookup is scoped to the radar's own device (`entitiesForDevice`), a bare
 * name must not follow another chip's token (`ld2412_timeout` is the R
 * PRO-1's other radar) or a zone token (`zone_1_still_target_count` is not
 * the radar-wide count), and this integration's own zone entities are
 * skipped. The whole-device ESP Reboot and Factory Reset ESP buttons match
 * no spelling here.
 */

/** One LD2450 target's live readings. */
export interface Ld2450Target {
  distance?: string;
  direction?: string;
  speed?: string;
}

/** One of the radar chip's own built-in zones: its corners (mm) and counts. */
export interface Ld2450BuiltInZone {
  x1?: string;
  y1?: string;
  x2?: string;
  y2?: string;
  all_target_count?: string;
  still_target_count?: string;
  moving_target_count?: string;
}

/** The entity ids found on one device. Any field may be missing. */
export interface Ld2450Entities {
  zone_type?: string;
  multi_target_tracking?: string;
  timeout?: string;
  bluetooth?: string;
  /** R PRO-1 only: the MTR-1 firmware has no LD2450 restart button. */
  restart?: string;
  factory_reset?: string;
  firmware?: string;
  presence?: string;
  moving_target?: string;
  still_target?: string;
  presence_target_count?: string;
  still_target_count?: string;
  moving_target_count?: string;
  /** Targets 1 to 3, at index 0 to 2. */
  targets: Ld2450Target[];
  /** Built-in zones 1 to 3, at index 0 to 2. */
  zones: Ld2450BuiltInZone[];
}

/** How many targets and built-in zones the LD2450 has. */
export const LD2450_TARGETS = 3;
export const LD2450_ZONES = 3;

/** The platform this integration's own entities carry. Kept local rather than
 *  imported from `zone-map/api.ts` so that module stays out of this bundle. */
const OWN_PLATFORM = "apollo_mmwave";

const DEDUP = "(?:_\\d+)?$";

/** A bare (unprefixed) name must not follow these tokens: another chip's
 *  entity, or a built-in zone's own count. */
const FOREIGN_BEFORE = /(?:^|_)(?:ld2410|ld2412|zone_\d+)$/;

interface Spelling {
  re: RegExp;
  /** Bare names are checked against `FOREIGN_BEFORE`. */
  bare: boolean;
}

/** "LD2450 <name>": the R PRO-1 spelling, also used by a few MTR-1 names. */
const chip = (suffix: string): Spelling => ({
  re: new RegExp(`(?:^|_)ld2450_${suffix}${DEDUP}`),
  bare: false,
});

/** "<name>" with no chip prefix: the MTR-1 spelling. */
const bare = (suffix: string): Spelling => ({
  re: new RegExp(`(?:^|_)${suffix}${DEDUP}`),
  bare: true,
});

/** A spelling that carries the chip token somewhere else in the name. */
const exact = (suffix: string): Spelling => ({
  re: new RegExp(`(?:^|_)${suffix}${DEDUP}`),
  bare: false,
});

type ScalarSlot = Exclude<keyof Ld2450Entities, "targets" | "zones">;
type TargetField = keyof Ld2450Target;
type ZoneField = keyof Ld2450BuiltInZone;

/** Where a match goes in the result. */
type Slot =
  | { kind: "scalar"; key: ScalarSlot }
  | { kind: "target"; index: number; key: TargetField }
  | { kind: "zone"; index: number; key: ZoneField };

interface Pattern {
  slot: Slot;
  domain: string;
  /** In order of preference: an earlier spelling wins over a later one. */
  spellings: Spelling[];
}

const scalar = (key: ScalarSlot, domain: string, spellings: Spelling[]): Pattern => ({
  slot: { kind: "scalar", key },
  domain,
  spellings,
});

/** Both spellings of a name the MTR-1 firmware leaves unprefixed. */
const either = (suffix: string): Spelling[] => [chip(suffix), bare(suffix)];

const PATTERNS: Pattern[] = [
  scalar("zone_type", "select", either("zone_type")),
  scalar("multi_target_tracking", "switch", either("multi_target_tracking")),
  scalar("timeout", "number", either("timeout")),
  scalar("bluetooth", "switch", [chip("bluetooth")]),
  scalar("restart", "button", [chip("restart")]),
  scalar("factory_reset", "button", [chip("factory_reset"), exact("factory_reset_ld2450")]),
  scalar("firmware", "sensor", [chip("firmware")]),
  scalar("presence", "binary_sensor", [chip("presence")]),
  scalar("moving_target", "binary_sensor", [chip("moving_target")]),
  scalar("still_target", "binary_sensor", [chip("still_target")]),
  scalar("presence_target_count", "sensor", either("presence_target_count")),
  scalar("still_target_count", "sensor", either("still_target_count")),
  scalar("moving_target_count", "sensor", either("moving_target_count")),
];
for (let n = 1; n <= LD2450_TARGETS; n++) {
  for (const key of ["distance", "direction", "speed"] as TargetField[]) {
    PATTERNS.push({
      slot: { kind: "target", index: n - 1, key },
      domain: "sensor",
      spellings: either(`target_${n}_${key}`),
    });
  }
}
for (let n = 1; n <= LD2450_ZONES; n++) {
  for (const key of ["x1", "y1", "x2", "y2"] as ZoneField[]) {
    PATTERNS.push({
      slot: { kind: "zone", index: n - 1, key },
      domain: "number",
      spellings: either(`zone_${n}_${key}`),
    });
  }
  for (const key of ["all", "still", "moving"]) {
    PATTERNS.push({
      slot: { kind: "zone", index: n - 1, key: `${key}_target_count` as ZoneField },
      domain: "sensor",
      spellings: either(`zone_${n}_${key}_target_count`),
    });
  }
}

/** The preference rank of the first spelling `objectId` matches, or -1. */
function rank(objectId: string, spellings: Spelling[]): number {
  for (let i = 0; i < spellings.length; i++) {
    const { re, bare: isBare } = spellings[i];
    const m = re.exec(objectId);
    if (!m) continue;
    if (isBare && FOREIGN_BEFORE.test(objectId.slice(0, m.index))) continue;
    return i;
  }
  return -1;
}

function emptyEntities(): Ld2450Entities {
  return {
    targets: Array.from({ length: LD2450_TARGETS }, () => ({})),
    zones: Array.from({ length: LD2450_ZONES }, () => ({})),
  };
}

function assign(out: Ld2450Entities, slot: Slot, entityId: string): void {
  if (slot.kind === "scalar") out[slot.key] = entityId;
  else if (slot.kind === "target") out.targets[slot.index][slot.key] = entityId;
  else out.zones[slot.index][slot.key] = entityId;
}

/** Resolved per registry object and device. Like `entity-index.ts`, this
 *  relies on HA replacing, never mutating, `hass.entities`. */
const CACHE = new WeakMap<HomeAssistant["entities"], Map<string, Ld2450Entities>>();

/**
 * The LD2450 entities of one device. Each slot takes the device's entity whose
 * object id matches the most preferred spelling (the "LD2450 " prefixed one
 * first), in registry order among equals, and only from the slot's domain.
 */
export function ld2450Entities(hass: HomeAssistant, deviceId: string): Ld2450Entities {
  let perDevice = CACHE.get(hass.entities);
  if (!perDevice) {
    perDevice = new Map();
    CACHE.set(hass.entities, perDevice);
  }
  const cached = perDevice.get(deviceId);
  if (cached) return cached;

  const out = emptyEntities();
  const best = new Map<Pattern, number>();
  for (const [id, entry] of entitiesForDevice(hass.entities, deviceId)) {
    if (entry.platform === OWN_PLATFORM) continue;
    const dot = id.indexOf(".");
    const domain = id.slice(0, dot);
    const objectId = id.slice(dot + 1);
    for (const pattern of PATTERNS) {
      if (pattern.domain !== domain) continue;
      const r = rank(objectId, pattern.spellings);
      if (r < 0) continue;
      const previous = best.get(pattern);
      if (previous !== undefined && previous <= r) continue;
      best.set(pattern, r);
      assign(out, pattern.slot, id);
    }
  }
  perDevice.set(deviceId, out);
  return out;
}

/** The ids of the 12 built-in zone corner numbers that resolved. */
export function builtInZoneNumberIds(entities: Ld2450Entities): string[] {
  return entities.zones
    .flatMap((z) => [z.x1, z.y1, z.x2, z.y2])
    .filter((id): id is string => id !== undefined);
}

/** This integration's zone presence sensor ids, as `zone_entities.py` names
 *  them: `binary_sensor.<device>_zone_<n>_presence`, maybe with a dedup tail. */
const ZONE_PRESENCE_ID = /^binary_sensor\..+_zone_(\d+)_presence(?:_\d+)?$/;

function zoneNumber(entityId: string): number {
  const m = ZONE_PRESENCE_ID.exec(entityId);
  return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
}

/**
 * The zone presence binary sensors this integration created for the device,
 * one per drawn zone (`ZonePresenceBinarySensor`, attached to the radar's own
 * device), sorted by zone number when the id still carries it. An entry with
 * no platform (older frontends do not send it) counts only when its id has
 * the integration's own shape.
 */
export function zonePresenceSensors(hass: HomeAssistant, deviceId: string): string[] {
  const ids: string[] = [];
  for (const [id, entry] of entitiesForDevice(hass.entities, deviceId)) {
    if (!id.startsWith("binary_sensor.")) continue;
    if (entry.platform === OWN_PLATFORM || (!entry.platform && ZONE_PRESENCE_ID.test(id))) {
      ids.push(id);
    }
  }
  // A stable sort keeps registry order for ids the user renamed.
  return ids.sort((a, b) => {
    const na = zoneNumber(a);
    const nb = zoneNumber(b);
    return na === nb ? 0 : na < nb ? -1 : 1;
  });
}
