/**
 * Websocket and service client for the integration's calibration API.
 *
 * The job itself runs in the backend; this module only starts, stops and
 * watches it. Nothing here constructs an entity id: the card sends a device id
 * and the backend resolves the radar's gate entities.
 *
 * `RETRY_DELAYS_MS` and `subscribeEntryLoads` are copied from
 * `zone-map/api.ts` rather than imported so this module stays off the audited
 * zone file.
 */

import type { CalibrationOptions } from "../types";

export const DOMAIN = "apollo_mmwave";
export const CALIBRATION_GET = `${DOMAIN}/calibration/get`;
export const CALIBRATION_SUBSCRIBE = `${DOMAIN}/calibration/subscribe`;
/** Home Assistant's own config entry feed, used to notice a reload. */
export const CONFIG_ENTRIES_SUBSCRIBE = "config_entries/subscribe";

export const SERVICE_CALIBRATE_GATES = "calibrate_gates";
export const SERVICE_CANCEL_CALIBRATION = "cancel_calibration";
export const SERVICE_RESTORE_GATE_THRESHOLDS = "restore_gate_thresholds";

/**
 * Backoff for reopening the subscription while the integration answers
 * `not_loaded`, in milliseconds. Bounded: after this the entry is not
 * mid-reload, it is broken or disabled, and the card shows a manual Retry.
 */
export const CALIBRATION_RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 20000];

export const ERR_NOT_LOADED = "not_loaded";
export const ERR_NOT_FOUND = "not_found";
/** HA's websocket code for a `ServiceValidationError` (pre-flight refusals). */
export const ERR_SERVICE_VALIDATION = "service_validation_error";

/** Sent for `not_loaded`, and for a service call HA could not find because
 *  the integration is unloaded or disabled. */
export const NOT_LOADED_MESSAGE = "Apollo mmWave is not loaded, so calibration is unavailable.";
export const NO_DEVICE_MESSAGE =
  "Home Assistant has no device with this id. The radar was probably removed and" +
  " re-added; reload the dashboard, or set device_id in the card YAML.";
const REJECTED_MESSAGE = "Home Assistant rejected the request.";
/** HA's websocket `call_service` prefixes a `ServiceValidationError` with this. */
const VALIDATION_PREFIX = /^Validation error:\s*/;

export type Unsubscribe = () => void | Promise<void>;

export type JobKind = "calibrate" | "restore";
export type JobStatus =
  | "preparing"
  | "sampling"
  | "applying"
  | "verifying"
  | "done"
  | "cancelled"
  | "failed";
export type SubPhase = "engineering" | "settle" | "warmup" | "refresh" | null;
export type Outcome =
  | "applied"
  | "partial"
  | "preview"
  | "cancelled"
  | "failed"
  | "restored";
export type Channel = "move" | "still";
export type ProfileKey = "ld2410" | "ld2412";

/** `job` in the websocket payload (`CalibrationJob.public_state()`). */
export interface JobState {
  job_id: string;
  kind: JobKind;
  status: JobStatus;
  sub_phase: SubPhase;
  started_at: string;
  elapsed_s: number;
  remaining_s: number | null;
  duration_s: number;
  settle_s: number;
  samples: number;
  /** Gate keys are strings on the wire. */
  peaks: { move: Record<string, number>; still: Record<string, number> };
  writes_done: number;
  writes_total: number;
  apply: boolean;
  cancel_requested: boolean;
  engineering_mode_turned_on: boolean;
}

export interface ChannelResult {
  entity_id: string | null;
  peak: number | null;
  p95: number | null;
  old: number | null;
  new: number | null;
  samples: number;
  written: boolean;
  confirmed: boolean | null;
  actual: number | null;
  flags: string[];
  skipped: string | null;
}

export interface GateResult {
  gate: number;
  move: ChannelResult;
  still: ChannelResult;
}

export interface UnverifiedEntry {
  entity_id: string;
  asked: number;
  actual: number | null;
}

export interface GateOffEntry {
  gate: number;
  channel: Channel;
  peak: number;
}

export interface JobError {
  code: string;
  message: string;
}

/** The snapshot a restore job wrote back. */
export interface RestoredFrom {
  id: string | null;
  taken_at: string | null;
}

/** `job.result_payload()`: what `last_result` stores and `wait: true` returns.
 *  A restore result has `gates: []`, null calibrate keys and adds `restored`,
 *  `missing` and `restored_from`; the per-gate fields stay optional so an
 *  older stored result still reads. */
export interface CalibrationResult {
  job_id: string;
  device_id: string;
  kind: JobKind;
  status: JobStatus;
  outcome: Outcome;
  snapshot_id: string | null;
  started_at: string;
  finished_at: string;
  duration_s?: number | null;
  settle_s?: number | null;
  margin?: number | null;
  margin_pct?: number | null;
  kind_filter?: "both" | Channel | null;
  samples?: number;
  presence_fraction?: number | null;
  moving_fraction?: number | null;
  engineering_mode_turned_on?: boolean;
  profile?: ProfileKey;
  max_move_gate?: number | null;
  max_still_gate?: number | null;
  min_gate?: number | null;
  max_gate?: number | null;
  gates?: GateResult[];
  changed?: number;
  unchanged?: number;
  writes_done?: number;
  writes_total?: number;
  unverified?: UnverifiedEntry[];
  gates_off?: GateOffEntry[];
  warnings?: string[];
  error: JobError | null;
  // Restore results only.
  restored?: number;
  missing?: string[];
  /** SPEC NOTE: additive backend key (see `result_payload`); the spec's
   *  restore result does not name its source, so readers fall back to the
   *  snapshot list when it is absent. */
  restored_from?: RestoredFrom | null;
}

export interface SnapshotSummary {
  id: string;
  taken_at: string;
  reason: "calibrate" | "restore";
  count: number;
}

/** The store's `interrupted` marker. `phase` and `left_on` are independent
 *  facts: any job's clean finish clears the write phase, and `left_on` is only
 *  cleared once the engineering switch reads off. */
export interface InterruptedMarker {
  job_id: string;
  kind: JobKind;
  phase: "engineering" | "applying" | null;
  started_at: string;
  engineering_mode_turned_on: boolean;
  snapshot_id: string | null;
  left_on: boolean;
}

export interface EntitiesInfo {
  profile: ProfileKey;
  gate_count: number;
  engineering_mode: string | null;
  engineering_mode_on: boolean;
  background_status: string | null;
  background_status_on: boolean;
  max_move_gate: number | null;
  max_still_gate: number | null;
  min_gate: number | null;
  max_gate: number | null;
}

export interface CalibrationPayload {
  job: JobState | null;
  snapshots: SnapshotSummary[];
  last_result: CalibrationResult | null;
  interrupted: InterruptedMarker | null;
  entities: EntitiesInfo | null;
}

/** HA's `localize`: an empty string when the key is unknown. */
export type LocalizeFunc = (key: string, values?: Record<string, any>) => string;

/** The slice of Home Assistant this module needs. */
export interface CalibrationApiHass {
  callWS<T>(message: Record<string, any>): Promise<T>;
  /**
   * HA's `callService(domain, service, serviceData?, target?, notifyOnError =
   * true, returnResponse = false)`. The frontend shows its own error toast on
   * rejection unless the fifth argument is false; the card renders the message
   * itself, so every call here passes false or the error appears twice.
   */
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, any>,
    target?: unknown,
    notifyOnError?: boolean
  ): Promise<any>;
  connection: {
    subscribeMessage<T>(
      callback: (message: T) => void,
      subscription: Record<string, any>
    ): Promise<Unsubscribe>;
    addEventListener?(event: string, callback: () => void): void;
    removeEventListener?(event: string, callback: () => void): void;
  };
  /** Used to render a rejection's translation in the user's language. */
  localize?: LocalizeFunc;
  loadBackendTranslation?(category: string, integration?: string | string[]): Promise<LocalizeFunc>;
}

export interface StartOptions extends CalibrationOptions {
  apply?: boolean;
}

/** Read one radar's calibration state once. */
export async function fetchCalibration(
  hass: Pick<CalibrationApiHass, "callWS">,
  deviceId: string
): Promise<CalibrationPayload> {
  return hass.callWS<CalibrationPayload>({
    type: CALIBRATION_GET,
    device_id: deviceId,
  });
}

/** Receive the payload now and again on every change. */
export async function subscribeCalibration(
  hass: Pick<CalibrationApiHass, "connection">,
  deviceId: string,
  callback: (payload: CalibrationPayload) => void
): Promise<Unsubscribe> {
  return hass.connection.subscribeMessage<CalibrationPayload>(callback, {
    type: CALIBRATION_SUBSCRIBE,
    device_id: deviceId,
  });
}

interface ConfigEntryChange {
  type?: string;
  entry?: { domain?: string; state?: string };
}

/**
 * Call back whenever an Apollo mmWave config entry finishes loading.
 *
 * Unloading the entry tears the calibration subscription down server side
 * without telling the client, and neither `ready` nor `disconnected` fires on
 * a reload, so this is how a card notices it. Resolves to null when the feed
 * is refused: it is an admin-only command, so a non-admin viewer loses reload
 * recovery, not the card.
 */
export async function subscribeEntryLoads(
  hass: Pick<CalibrationApiHass, "connection">,
  callback: () => void
): Promise<Unsubscribe | null> {
  try {
    return await hass.connection.subscribeMessage<ConfigEntryChange[]>(
      (changes) => {
        const list = Array.isArray(changes) ? changes : [changes];
        // The feed's first message is a dump of every entry with `type: null`;
        // that is not a reload. "added" and "updated" carry the loaded state.
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

/** Every service call goes through here so none of them toasts twice. The
 *  default is no toast; only a caller with nowhere to show an error (the gate
 *  energy chart) asks for HA's own. */
export function callService(
  hass: Pick<CalibrationApiHass, "callService">,
  domain: string,
  service: string,
  data: Record<string, any>,
  notifyOnError = false
): Promise<any> {
  return hass.callService(domain, service, data, undefined, notifyOnError);
}

function definedOnly(opts: StartOptions): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(opts)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Start a calibration job. Absent options are not sent, so the backend
 *  defaults apply; the returned promise resolves when the job has started,
 *  not when it ends (progress comes from the subscription). */
export function startCalibration(
  hass: Pick<CalibrationApiHass, "callService">,
  deviceId: string,
  opts: StartOptions = {}
): Promise<any> {
  return callService(hass, DOMAIN, SERVICE_CALIBRATE_GATES, {
    device_id: deviceId,
    ...definedOnly(opts),
  });
}

export function cancelCalibration(
  hass: Pick<CalibrationApiHass, "callService">,
  deviceId: string
): Promise<any> {
  return callService(hass, DOMAIN, SERVICE_CANCEL_CALIBRATION, {
    device_id: deviceId,
  });
}

/** Restore the newest snapshot, or a chosen one. */
export function restoreThresholds(
  hass: Pick<CalibrationApiHass, "callService">,
  deviceId: string,
  snapshotId?: string
): Promise<any> {
  return callService(hass, DOMAIN, SERVICE_RESTORE_GATE_THRESHOLDS, {
    device_id: deviceId,
    ...(snapshotId ? { snapshot_id: snapshotId } : {}),
  });
}

export function turnEngineeringMode(
  hass: Pick<CalibrationApiHass, "callService">,
  switchId: string,
  on: boolean
): Promise<any> {
  return callService(hass, "switch", on ? "turn_on" : "turn_off", {
    entity_id: switchId,
  });
}

/** Where a rejection came from: the subscription (or get), or a service call. */
export type ErrorSource = "subscribe" | "service";

export interface DescribeOptions {
  source?: ErrorSource;
  /** HA's localize with the rejection's exception translations loaded. */
  localize?: LocalizeFunc;
}

/** The error payload itself: a lost connection rejects with the whole result
 *  message (`{type: "result", success: false, error}`) instead. */
function errorPayload(error: any): any {
  if (error && typeof error === "object" && error.code === undefined) {
    const inner = error.error;
    if (inner && typeof inner === "object") return inner;
  }
  return error;
}

/** HA strips the final period from a translated exception message. */
function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function localized(err: any, localize: LocalizeFunc | undefined): string | null {
  const domain = err?.translation_domain;
  const key = err?.translation_key;
  if (!localize || !domain || !key) return null;
  let text: string;
  try {
    text = localize(
      `component.${domain}.exceptions.${key}.message`,
      err.translation_placeholders ?? undefined
    );
  } catch {
    return null;
  }
  // HA's localize returns "" for an unknown key and a "Translation error"
  // string when the message cannot be formatted.
  if (!text || text.startsWith("Translation error")) return null;
  return sentence(text);
}

/**
 * One readable sentence for a websocket or service rejection.
 *
 * A pre-flight refusal arrives as HA's `{code: "service_validation_error",
 * message: "Validation error: <text without its final period>",
 * translation_domain, translation_key, translation_placeholders}`; it is
 * rendered from the translation when `localize` knows it (which also follows
 * the user's language), else from the message with HA's prefix dropped and
 * the period put back.
 */
export function describeError(error: any, opts: DescribeOptions = {}): string {
  const err = errorPayload(error);
  const code = err?.code;
  if (code === ERR_NOT_FOUND) {
    if (opts.source !== "service") return NO_DEVICE_MESSAGE;
    // A service HA cannot find: the integration is unloaded or disabled. A
    // missing service of another domain keeps HA's own words.
    const domain = err?.translation_placeholders?.domain;
    if (domain === undefined || domain === DOMAIN) return NOT_LOADED_MESSAGE;
  }
  if (code === ERR_NOT_LOADED) return NOT_LOADED_MESSAGE;
  const translated = localized(err, opts.localize);
  if (translated) return translated;
  const raw = typeof err === "string" ? err : err?.message;
  if (raw) {
    const message = String(raw).replace(VALIDATION_PREFIX, "");
    if (message.trim()) return sentence(message);
  }
  return REJECTED_MESSAGE;
}

/** HA's localize with the rejection's exception translations loaded, or the
 *  plain localize (or nothing) when the frontend cannot load them. */
export async function exceptionLocalizer(
  hass: Partial<Pick<CalibrationApiHass, "localize" | "loadBackendTranslation">>,
  error: any
): Promise<LocalizeFunc | undefined> {
  const domain = errorPayload(error)?.translation_domain;
  if (domain && typeof hass.loadBackendTranslation === "function") {
    try {
      const loaded = await hass.loadBackendTranslation("exceptions", domain);
      if (typeof loaded === "function") return loaded;
    } catch {
      // Fall back to whatever is already loaded.
    }
  }
  return typeof hass.localize === "function" ? hass.localize.bind(hass) : undefined;
}

/** `describeError` for a rejected service call, translations loaded first. */
export async function describeServiceError(
  hass: Partial<Pick<CalibrationApiHass, "localize" | "loadBackendTranslation">>,
  error: any
): Promise<string> {
  const localize = await exceptionLocalizer(hass, error);
  return describeError(error, { source: "service", localize });
}
