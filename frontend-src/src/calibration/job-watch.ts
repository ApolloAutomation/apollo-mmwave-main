/**
 * Whether a calibration job is running on one radar, for a card that needs
 * only that fact: the setup card hides its Radar Engineering Mode line while
 * a job runs, because the job owns the switch then and turning it off fails
 * the job.
 *
 * It opens the same `apollo_mmwave/calibration/subscribe` feed as the
 * calibrate card and copies that card's recovery: the `not_loaded` backoff,
 * a reopen on the connection's `ready` (a re-subscribe the server rejects
 * after a restart is dropped silently) and on the integration loading again
 * (an unload closes the feed without telling the client). It keeps none of
 * the payload beyond the job's status.
 */

import type { HassConnection, HomeAssistant } from "../types";
import {
  CALIBRATION_RETRY_DELAYS_MS,
  ERR_NOT_LOADED,
  subscribeCalibration,
  subscribeEntryLoads,
  type CalibrationApiHass,
  type CalibrationPayload,
  type Unsubscribe,
} from "./api";
import { isTerminal } from "./model";

/** "unknown" until the feed has answered. A refused feed reads "idle": the
 *  integration is not loaded or does not know the device, and either way no
 *  job of its can be running. */
export type JobActivity = "unknown" | "idle" | "running";

/** A job counts until it has fully finished: past its last status, the job
 *  still turns Radar Engineering Mode back off (when it turned it on) before
 *  it stores its result, as the calibrate card's "finishing" view knows. */
export function jobActivity(payload: CalibrationPayload | null | undefined): JobActivity {
  const job = payload?.job;
  if (!job) return "idle";
  const finished = isTerminal(job.status) && payload?.last_result?.job_id === job.job_id;
  return finished ? "idle" : "running";
}

function safeUnsubscribe(unsubscribe: Unsubscribe): void {
  try {
    const result = unsubscribe();
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // The server side is already gone (reload, restart): nothing to close.
  }
}

export class CalibrationJobWatch {
  private _activity: JobActivity = "unknown";
  private _api?: Pick<CalibrationApiHass, "connection">;
  private _deviceId?: string;
  private _unsubscribe: Unsubscribe | null = null;
  /** Bumped on every close so a late answer from a superseded feed is dropped. */
  private _serial = 0;
  private _pending = false;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryIndex = 0;
  /** The feed was refused for good (retries spent, or an error no retry
   *  helps); only a reopen trigger tries again, not every `watch` call. */
  private _refused = false;
  private _listened?: HassConnection;
  private readonly _onReady = (): void => this._reopen();
  private readonly _onDisconnected = (): void => this._cancelRetry();
  private _entryFeed: Unsubscribe | null = null;
  private _entryFeedConnection?: HassConnection;
  private _entryFeedSerial = 0;
  private readonly _onChange: () => void;

  /** `onChange` runs whenever `activity` changes. */
  constructor(onChange: () => void) {
    this._onChange = onChange;
  }

  get activity(): JobActivity {
    return this._activity;
  }

  /** Watch `deviceId` over this hass's connection, reopening when either
   *  changes. Without a device or a connection it watches nothing. */
  watch(hass: HomeAssistant | undefined, deviceId: string | undefined): void {
    const conn = hass?.connection;
    if (!conn?.subscribeMessage || !deviceId) {
      this.close();
      return;
    }
    if (deviceId !== this._deviceId || conn !== this._api?.connection) {
      this.close();
      this._api = { connection: conn as CalibrationApiHass["connection"] };
      this._deviceId = deviceId;
    }
    this._listen(conn);
    this._openEntryFeed(conn);
    this._open();
  }

  /** Stop watching: the feed, its retry, the listeners and the entry feed. */
  close(): void {
    this._retryIndex = 0;
    this._closeFeed();
    this._unlisten();
    this._closeEntryFeed();
    this._api = undefined;
    this._deviceId = undefined;
    this._set("unknown");
  }

  private _set(activity: JobActivity): void {
    if (activity === this._activity) return;
    this._activity = activity;
    this._onChange();
  }

  private _open(): void {
    const api = this._api;
    const deviceId = this._deviceId;
    if (!api || !deviceId || this._unsubscribe || this._pending || this._retryTimer) return;
    if (this._refused) return;
    const serial = ++this._serial;
    this._pending = true;
    subscribeCalibration(api, deviceId, (payload) => {
      if (serial !== this._serial) return;
      this._set(jobActivity(payload));
    }).then(
      (unsubscribe) => {
        if (serial !== this._serial) {
          safeUnsubscribe(unsubscribe);
          return;
        }
        this._pending = false;
        this._unsubscribe = unsubscribe;
        this._retryIndex = 0;
      },
      (error) => {
        if (serial !== this._serial) return;
        this._pending = false;
        this._set("idle");
        // Mid-reload, or just after a restart: try again for a while, as the
        // calibrate card does, so a job started afterward is seen.
        const code = (error as { code?: string } | undefined)?.code;
        if (code !== ERR_NOT_LOADED || this._retryIndex >= CALIBRATION_RETRY_DELAYS_MS.length) {
          this._refused = true;
          return;
        }
        const delay = CALIBRATION_RETRY_DELAYS_MS[this._retryIndex];
        this._retryIndex += 1;
        this._retryTimer = setTimeout(() => {
          this._retryTimer = null;
          this._open();
        }, delay);
      }
    );
  }

  private _closeFeed(): void {
    this._serial += 1;
    this._pending = false;
    this._refused = false;
    this._cancelRetry();
    const unsubscribe = this._unsubscribe;
    this._unsubscribe = null;
    if (unsubscribe) safeUnsubscribe(unsubscribe);
  }

  /** Reopen with the last known activity kept, so the card does not flicker;
   *  the reopened feed's first push replaces it. */
  private _reopen(): void {
    this._retryIndex = 0;
    this._closeFeed();
    this._open();
  }

  private _cancelRetry(): void {
    if (this._retryTimer === null) return;
    clearTimeout(this._retryTimer);
    this._retryTimer = null;
  }

  private _listen(conn: HassConnection): void {
    if (conn === this._listened) return;
    this._unlisten();
    if (!conn.addEventListener) return;
    conn.addEventListener("ready", this._onReady);
    conn.addEventListener("disconnected", this._onDisconnected);
    this._listened = conn;
  }

  private _unlisten(): void {
    const conn = this._listened;
    this._listened = undefined;
    if (!conn?.removeEventListener) return;
    conn.removeEventListener("ready", this._onReady);
    conn.removeEventListener("disconnected", this._onDisconnected);
  }

  /** The config entry feed is open to every user on the supported Home
   *  Assistant versions; if it is ever refused, only the reopen after an
   *  integration reload is lost. */
  private _openEntryFeed(conn: HassConnection): void {
    const api = this._api;
    if (!api || this._entryFeedConnection === conn) return;
    this._closeEntryFeed();
    this._entryFeedConnection = conn;
    const serial = ++this._entryFeedSerial;
    void subscribeEntryLoads(api, () => {
      if (serial === this._entryFeedSerial) this._reopen();
    }).then((unsubscribe) => {
      if (serial !== this._entryFeedSerial) {
        if (unsubscribe) safeUnsubscribe(unsubscribe);
        return;
      }
      this._entryFeed = unsubscribe;
    });
  }

  private _closeEntryFeed(): void {
    this._entryFeedSerial += 1;
    this._entryFeedConnection = undefined;
    const unsubscribe = this._entryFeed;
    this._entryFeed = null;
    if (unsubscribe) safeUnsubscribe(unsubscribe);
  }
}
