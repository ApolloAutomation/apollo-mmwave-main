/**
 * Websocket client for the integration's zone API.
 *
 * The pre-2.0 card built `sensor.apollo_mmwave_<slug>_zone_<n>` from a display
 * name and read its attributes. That made configuration depend on entity
 * naming and on the entity being available, and an unavailable entity has its
 * attributes stripped, so the card would read an empty config and write it
 * back over the real one. Nothing here constructs an entity id.
 *
 * The movement history commands live here too. Unlike the zone commands, only
 * an administrator may call them.
 */

export const DOMAIN = "apollo_mmwave";
export const ZONES_GET = `${DOMAIN}/zones/get`;
export const ZONES_SUBSCRIBE = `${DOMAIN}/zones/subscribe`;
/** Put back zones' previous shapes. Administrators only. */
export const ZONES_RESTORE_SHAPE = `${DOMAIN}/zones/restore_shape`;
/** Movement history. Administrators only: anyone else gets `unauthorized`. */
export const MOVEMENT_GET = `${DOMAIN}/movement/get`;
export const MOVEMENT_CLEAR = `${DOMAIN}/movement/clear`;
/** Home Assistant's own config entry feed, used to notice a reload. */
export const CONFIG_ENTRIES_SUBSCRIBE = "config_entries/subscribe";

/** The units the zone map card's switch offers and the store saves. */
export type DisplayUnits = "m" | "ft";

export interface TargetPair {
  x: string;
  y: string;
}

/**
 * What a zone does with the targets inside it: "detect" turns its presence
 * sensor on, "ignore" hides them from the radar's other zones.
 */
export type ZoneType = "detect" | "ignore";

export interface ZoneDef {
  /** Both absent on a legacy zone whose data was lost: `{}` means no geometry. */
  shape?: string;
  data?: Record<string, any> | null;
  name?: string;
  /** Absent means detect. The backend never sends a default. */
  zone_type?: ZoneType;
  /** Seconds the zone stays on after the radar loses someone who sat still
   *  in it, 1 to 3600. Absent means 0, no hold. */
  hold_s?: number;
  /** The zone's presence sensor. null: not registered (yet); absent: a
   *  backend older than 2.4.0. */
  presence_entity_id?: string | null;
  /** When its shape was last replaced (UTC); absent if never. */
  previous_shape_at?: string;
  /** Whether that previous shape had geometry. */
  previous_shape_drawn?: boolean;
}

export interface ZoneConfig {
  /** Keyed by zone id. Ints in the store, strings once through JSON. */
  zones: Record<string, ZoneDef>;
  /**
   * The pairs the user picked, or null if they never picked any.
   *
   * The distinction is load-bearing. null means the radar's auto-detected
   * targets are in use, so the card offers `suggested_entities`. [] means the
   * user cleared the list and wants nothing tracked. Collapsing the two
   * re-enables auto-detection for the one user who switched it off.
   */
  entities: TargetPair[] | null;
  rotation_deg: number | null;
  label: string | null;
  /**
   * Unit the presence sensors scale a target reading by when its sensor has
   * no length unit of its own; null means mm.
   */
  input_units?: string | null;
  /**
   * The unit an administrator saved for this radar's map with the card's
   * m / ft switch; null means the card follows Home Assistant's unit system.
   * Display only: zone geometry is millimeters whatever this says.
   */
  display_units?: DisplayUnits | null;
  /** What the radar detected, offered regardless of what the user picked. */
  suggested_entities: TargetPair[];
  /**
   * Draw this radar's map mirrored left to right, for everyone who opens it.
   * Display only: zone geometry, presence and movement history never flip.
   * Absent from a backend older than 2.4.0.
   */
  mirror_x?: boolean;
  /** An administrator turned movement history on for this radar. */
  movement_history?: boolean;
}

/** A zone's stored geometry; shape "none" has data null. */
export interface ShapeGeometry {
  shape: string;
  data: Record<string, any> | null;
}

/** What `apollo_mmwave/zones/restore_shape` answers. */
export interface RestoreShapeReply {
  /** Each restored zone's geometry after the swap. */
  restored: Array<{ zone_id: number } & ShapeGeometry>;
  /** Zones not restored: missing, nothing to restore, or changed. */
  skipped: number[];
}

export type Unsubscribe = () => void | Promise<void>;

/**
 * Backoff for reopening while the integration is unloaded, in milliseconds.
 *
 * Bounded, because after this much the entry is not mid-reload, it is broken or
 * disabled, and a card must not hammer the websocket forever. The config entry
 * feed reopens the card once the entry reports loaded; this covers a card that
 * mounts while the integration is still loading but misses that event, for
 * example because the entry finished loading before the feed was open, or
 * because Home Assistant refused the feed.
 */
export const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 20000];

/** The slice of Home Assistant this module needs. */
export interface ZoneApiHass {
  callWS<T>(message: Record<string, any>): Promise<T>;
  connection: {
    subscribeMessage<T>(
      callback: (message: T) => void,
      subscription: Record<string, any>
    ): Promise<Unsubscribe>;
  };
}

export interface ZoneConnectionHandlers {
  onConfig: (config: ZoneConfig) => void;
  /** Called with something a user can read, never with a blank map. */
  onError: (message: string) => void;
}

interface ConfigEntryChange {
  type?: string;
  entry?: { domain?: string; state?: string };
}

/** Read one radar's zone configuration. */
export async function fetchZones(
  hass: ZoneApiHass,
  deviceId: string
): Promise<ZoneConfig> {
  return hass.callWS<ZoneConfig>({ type: ZONES_GET, device_id: deviceId });
}

/** Receive that configuration again on every change. */
export async function subscribeZones(
  hass: ZoneApiHass,
  deviceId: string,
  callback: (config: ZoneConfig) => void
): Promise<Unsubscribe> {
  // TODO(REVIEW_REPORT.md X48): a library re-subscribe after a reconnect can be
  // refused silently. Consider resubscribe: false plus a "ready" listener that
  // calls requestOpen (removed on dispose), with a fake-connection test.
  return hass.connection.subscribeMessage<ZoneConfig>(callback, {
    type: ZONES_SUBSCRIBE,
    device_id: deviceId,
  });
}

/**
 * Call back whenever an Apollo mmWave config entry finishes loading.
 *
 * Resolves to null when the feed is refused. Home Assistant does not limit it
 * to admins in any supported version, but a refusal must cost reload recovery,
 * not the card.
 */
export async function subscribeEntryLoads(
  hass: ZoneApiHass,
  callback: () => void
): Promise<Unsubscribe | null> {
  try {
    return await hass.connection.subscribeMessage<ConfigEntryChange[]>(
      (changes) => {
        const list = Array.isArray(changes) ? changes : [changes];
        // "added" and "updated" both carry the loaded state, and an options
        // change reports loaded too. Re-subscribing on one of those is a wasted
        // round trip, which is cheaper than missing a reload. The feed's first
        // message is a dump of every existing entry with `type: null`; that is
        // not a reload, and reacting to it opened every card twice.
        if (
          list.some(
            (change) =>
              (change?.type === "updated" || change?.type === "added") &&
              change?.entry?.domain === DOMAIN &&
              change?.entry?.state === "loaded"
          )
        ) {
          callback();
        }
      },
      { type: CONFIG_ENTRIES_SUBSCRIBE }
    );
  } catch {
    return null;
  }
}

export const ERR_NOT_LOADED = "not_loaded";
/**
 * Home Assistant's own answer for a command type with no handler. The zone
 * commands are registered when the config entry sets up, so on a fresh boot,
 * with the websocket already up and this integration still loading, this is
 * how "not loaded" arrives.
 */
export const ERR_UNKNOWN_COMMAND = "unknown_command";
export const ERR_NOT_FOUND = "not_found";

/** True for either way the backend reports that it has not loaded yet. */
function isNotLoaded(code: unknown): boolean {
  return code === ERR_NOT_LOADED || code === ERR_UNKNOWN_COMMAND;
}

function describeError(error: any, deviceId: string, willRetry: boolean): string {
  const code = error?.code;
  if (code === ERR_NOT_FOUND) {
    return (
      `Home Assistant has no device with id ${deviceId}. The radar was probably` +
      " removed and re-added; pick it again in this card's settings."
    );
  }
  if (isNotLoaded(code)) {
    // Only promise recovery while a retry is still coming. Saying the zones
    // return on their own and then never trying again is the same kind of lie
    // as a save toast for a save that did not happen.
    return willRetry
      ? "Apollo mmWave is not loaded, so this radar's zones cannot be read." +
          " They will come back on their own once the integration finishes loading."
      : "Apollo mmWave is still not loaded, so this radar's zones cannot be" +
          " read. Reload the page once the integration is back.";
  }
  return error?.message
    ? String(error.message)
    : "Could not read this radar's zone configuration.";
}

/**
 * Keep a card's copy of one radar's configuration current.
 *
 * Opens the live subscription, delivers the current configuration once, and
 * re-opens both after a config entry reload: unloading the entry tears live
 * subscriptions down without telling the client, so a card would otherwise sit
 * on stale data until someone reloaded the page.
 *
 * Never rejects. A failure is reported through `onError` because the card has
 * to show something other than an empty zone map.
 */
export async function connectZones(
  hass: ZoneApiHass,
  deviceId: string,
  handlers: ZoneConnectionHandlers
): Promise<Unsubscribe> {
  let disposed = false;
  let unsubscribeZones: Unsubscribe | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryIndex = 0;

  const cancelRetry = () => {
    if (retryTimer === null) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  };

  const closeZones = async () => {
    const current = unsubscribeZones;
    unsubscribeZones = null;
    if (!current) return;
    try {
      await current();
    } catch {
      // The server side is already gone after a reload, which is the case this
      // exists for. Nothing to recover.
    }
  };

  const open = async () => {
    cancelRetry();
    await closeZones();
    // Subscribe before reading so no change can slip through the gap between
    // the two. That means a push can beat the read, in which case the read is
    // the older of the two and gets dropped.
    let pushed = false;
    try {
      const unsubscribe = await subscribeZones(hass, deviceId, (config) => {
        if (disposed) return;
        pushed = true;
        handlers.onConfig(config);
      });
      if (disposed) {
        // Disposed while the subscribe was in flight: the teardown already ran
        // and found nothing to close, so this one is ours to close.
        try {
          await unsubscribe();
        } catch {
          // Nothing left server side.
        }
        return;
      }
      unsubscribeZones = unsubscribe;
      const config = await fetchZones(hass, deviceId);
      retryIndex = 0;
      if (disposed || pushed) return;
      handlers.onConfig(config);
    } catch (error) {
      if (disposed) return;
      // Only "not loaded" is worth waiting out, including the unknown command
      // Home Assistant answers before the integration has registered its
      // commands. A device that is not in the registry will not appear because
      // a card asked again.
      const willRetry =
        isNotLoaded((error as any)?.code) && retryIndex < RETRY_DELAYS_MS.length;
      handlers.onError(describeError(error, deviceId, willRetry));
      if (willRetry) scheduleRetry();
    }
  };

  // One open at a time. Two overlapping opens (a reload's burst of entry
  // updates, or an update landing on top of a retry) both found nothing to
  // close, both subscribed, and the second handle overwrote the first, so the
  // orphan stayed open server side and every payload arrived twice.
  let queue: Promise<void> = Promise.resolve();
  const requestOpen = (): Promise<void> => {
    queue = queue.then(open);
    return queue;
  };

  const scheduleRetry = () => {
    if (disposed || retryIndex >= RETRY_DELAYS_MS.length) return;
    const delay = RETRY_DELAYS_MS[retryIndex];
    retryIndex += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void requestOpen();
    }, delay);
  };

  await requestOpen();

  const unsubscribeEntries = await subscribeEntryLoads(hass, () => {
    if (disposed) return;
    void requestOpen();
  });

  return async () => {
    disposed = true;
    cancelRetry();
    await closeZones();
    if (unsubscribeEntries) {
      try {
        await unsubscribeEntries();
      } catch {
        // Same as above: a closed connection has nothing left to unsubscribe.
      }
    }
  };
}

/**
 * One radar's recorded target positions, as `apollo_mmwave/movement/get`
 * answers them.
 *
 * A radar keeps up to 100,000 records, so they come packed: four base64
 * columns of little-endian integers, about 13 bytes a record, instead of
 * JSON lists. `history.ts` decodes them. Records are sorted by time across
 * every slot.
 */
export interface MovementPayload {
  /** False for a radar whose history is off; it then has no records. */
  enabled: boolean;
  /** Server epoch ms when the answer was built. The replay reads time from
   *  here, never from this browser's clock. */
  now: number;
  /** Epoch ms the answer starts from, after the server clamped the request
   *  to the last 24 hours. */
  since: number;
  /** How long the server keeps a record, in seconds. */
  retention_s: number;
  /** Number of records. */
  n: number;
  /** Epoch ms of the first record; null when `n` is 0. It can be before
   *  `since`: each slot's last point within 30 s before `since` is carried
   *  in, so someone standing still shows at the window start. */
  t0: number | null;
  /** uint32 per record: ms since the previous record, 0 for the first. */
  dt: string;
  /** int16 per record: the slot, the 0-based index in the radar's tracked
   *  pairs. A gone marker (the slot lost its target) is `-1 - slot`. */
  s: string;
  /** int16 per record: mm in the raw sensor frame (unit converted, not
   *  rotated, not mirrored); 0 on a gone marker. */
  x: string;
  /** int16 per record, like `x`. */
  y: string;
}

/** The slice of Home Assistant the movement commands need. */
export type MovementApiHass = Pick<ZoneApiHass, "callWS">;

/**
 * Read one radar's movement history from `sinceMs` (epoch ms) to the
 * server's now. Without `sinceMs` the server sends the last 24 hours.
 */
export async function fetchMovement(
  hass: MovementApiHass,
  deviceId: string,
  sinceMs?: number
): Promise<MovementPayload> {
  return hass.callWS<MovementPayload>({
    type: MOVEMENT_GET,
    device_id: deviceId,
    // The command's schema takes a whole, non-negative number of ms.
    ...(sinceMs === undefined ? {} : { since: Math.max(0, Math.round(sinceMs)) }),
  });
}

/** Delete one radar's movement history. The radar keeps recording. */
export async function clearMovement(
  hass: MovementApiHass,
  deviceId: string
): Promise<{ cleared: number }> {
  return hass.callWS<{ cleared: number }>({ type: MOVEMENT_CLEAR, device_id: deviceId });
}

/** Swap zones back to their previous shapes, if still `current`. */
export async function restoreShapes(
  hass: Pick<ZoneApiHass, "callWS">,
  deviceId: string,
  zones: Array<{ zone_id: number; current: ShapeGeometry }>
): Promise<RestoreShapeReply> {
  return hass.callWS<RestoreShapeReply>({
    type: ZONES_RESTORE_SHAPE,
    device_id: deviceId,
    zones: zones.map(({ zone_id, current }) => ({
      zone_id,
      current: { shape: current.shape, data: current.data ?? null },
    })),
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isZoneId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** Whether an answer has the shape of a `RestoreShapeReply`. */
export function isRestoreShapeReply(value: unknown): value is RestoreShapeReply {
  if (!isObject(value)) return false;
  const { restored, skipped } = value;
  return (
    Array.isArray(restored) &&
    restored.every(
      (item) =>
        isObject(item) &&
        isZoneId(item.zone_id) &&
        typeof item.shape === "string" &&
        (item.data === null || isObject(item.data))
    ) &&
    Array.isArray(skipped) &&
    skipped.every(isZoneId)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Whether an answer has the shape of a `MovementPayload`.
 *
 * Types only: `decodeMovement` in `history.ts` checks each column's length
 * against `n` and throws on a mismatch. A test's fake hass answers commands
 * it does not know with [], which must not read as an empty history.
 */
export function isMovementPayload(value: unknown): value is MovementPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.enabled === "boolean" &&
    isFiniteNumber(p.now) &&
    isFiniteNumber(p.since) &&
    isFiniteNumber(p.retention_s) &&
    isFiniteNumber(p.n) &&
    Number.isInteger(p.n) &&
    p.n >= 0 &&
    (p.t0 === null || isFiniteNumber(p.t0)) &&
    typeof p.dt === "string" &&
    typeof p.s === "string" &&
    typeof p.x === "string" &&
    typeof p.y === "string"
  );
}
