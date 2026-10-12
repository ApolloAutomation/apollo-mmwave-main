/**
 * The "Calibrate with empty room" card.
 *
 * The job runs in the backend (`calibration.py`); this card is only a view of
 * it. It subscribes to `apollo_mmwave/calibration/subscribe` for one device,
 * renders the pushed payload, and sends three service calls: start, cancel
 * and restore. It never waits on the start call for its UI: progress arrives
 * over the subscription, and the job keeps running when the browser closes.
 *
 * Live HA state wins over the payload's copy for the engineering switch and
 * the LD2412 background-correction status: the backend pushes only from job
 * code, so while no job runs the payload's `entities` is as old as the last
 * push.
 */

import {
  LitElement,
  html,
  css,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { property, state } from "lit/decorators.js";
import type { CalibrateCardConfig, HassConnection, HomeAssistant } from "../types";
import {
  resolveRadar,
  resolvedStatesChanged,
  resolvedDeviceId,
  anyResolved,
  type ResolvedRadar,
} from "./resolution";
import { registerElement } from "../register";
import {
  CALIBRATION_RETRY_DELAYS_MS,
  ERR_NOT_LOADED,
  ERR_THRESHOLDS_NOT_NUMERIC,
  cancelCalibration,
  describeError,
  describeServiceError,
  pressButton,
  refusalKey,
  restoreThresholds,
  startCalibration,
  subscribeCalibration,
  subscribeEntryLoads,
  turnEngineeringMode,
  type CalibrationApiHass,
  type CalibrationPayload,
  type CalibrationResult,
  type JobState,
  type ProfileKey,
  type StartOptions,
  type Unsubscribe,
} from "../calibration/api";
import {
  DEFAULT_DURATION_S,
  DEFAULT_SETTLE_S,
  INITIAL_LOCAL_STATE,
  WALK_AROUND_LINE,
  canStart,
  canStop,
  cancelledLine,
  failureLine,
  footerLine,
  formatTime,
  idleSentence,
  isFactoryThresholds,
  isTerminal,
  liveGateLimits,
  missingLine,
  nextLocalState,
  offChannelsBeforeRun,
  offGatesLine,
  offersUndo,
  phaseHeadline,
  phaseLabel,
  progress,
  reenabledLines,
  restoreSource,
  restoreSummaryLines,
  restoredLine,
  resultHeading,
  resultRows,
  savedLine,
  showsResultView,
  summaryLine,
  thresholdMax,
  undoLabel,
  undoTitle,
  unusedFootnote,
  warningLines,
  type LocalState,
  type Row,
} from "../calibration/model";

export const CALIBRATE_CARD_TAG = "apollo-radar-calibrate-card";
const DEFAULT_TITLE = "Auto-calibrate";

const PRIMARY_LABEL = "Calibrate with empty room";
const NO_DEVICE_HINT =
  "Add device_id to this card's configuration to enable auto-calibration.";
const OFFLINE_LINE =
  "Radar is offline. Calibration needs the radar online and its gate entities enabled.";
const STILL_LOADING = "Apollo mmWave is still loading...";
const NOT_LOADED = "Apollo mmWave is not loaded, so calibration is unavailable.";
const PREVIEW_HELPER =
  "Computes new thresholds without changing any of them. Radar Engineering Mode is still turned on for the listen.";
const FACTORY_HINT = "These look like factory thresholds. Calibrating sets them for your room.";
/** Offered when the radar has not reported its thresholds yet: it presses the
 *  radar's query params button, waits, then runs the refused job again. */
export const READ_SETTINGS_LABEL = "Read settings from the radar";
const READING_SETTINGS = "Reading settings from the radar...";
/** Time the radar gets to report its thresholds after the button press (the
 *  backend waits as long, `VERIFY_SETTLE_S`, after its own LD2412 press). */
export const READ_SETTINGS_WAIT_MS = 3000;
/** Without a query params button the card cannot ask, so it says where to. */
const QUERY_PARAMS_HINT =
  "Open the radar's device page, press its Query Params button in the Diagnostic section, wait a few seconds, then try again.";

type LoadState = "loading" | "idle" | "retrying" | "not_loaded" | "error";

interface ServiceFailure {
  /** Prefix for the failed line, e.g. "Calibration failed: ". */
  prefix: string;
  message: string;
  retry: () => void;
  /** The refusal's translation key, e.g. `thresholds_not_numeric`. */
  code?: string;
}

/** A threshold cell as its value and its trailing note ("100 → 15" and
 *  "(was off)"), so the table can wrap the note under the value. Text with
 *  no trailing note ("skipped: ...", "(not selected)") stays one piece. */
export function thresholdCell(text: string): TemplateResult {
  const m = /^(.+?) (\([^()]*\))$/.exec(text);
  if (!m) return html`<span class="value">${text}</span>`;
  return html`<span class="value">${m[1]}</span> <span class="note">${m[2]}</span>`;
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

export class ApolloRadarCalibrateCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: CalibrateCardConfig;
  @state() private _payload?: CalibrationPayload;
  @state() private _local: LocalState = INITIAL_LOCAL_STATE;
  @state() private _loadState: LoadState = "loading";
  @state() private _loadError = "";
  @state() private _failure?: ServiceFailure;
  /** A rejected Stop, shown inline in the running view; a running job must
   *  not be replaced by a failure view, nor its result after it ends. */
  @state() private _stopError?: string;
  /** A rejected "Turn it off", shown inside the interrupted banner. */
  @state() private _turnOffError?: string;
  @state() private _showLastResult = false;
  /** "Read settings from the radar" pressed the button and is waiting. */
  @state() private _readingSettings = false;
  /** A rejected press of the query params button. */
  @state() private _readSettingsError?: string;

  private _resolved?: ResolvedRadar;
  private _deviceId?: string;
  private _unsubscribe: Unsubscribe | null = null;
  /** A subscribe is in flight; its result is only honoured while this serial
   *  is still current. Bumped on every close so a late payload from a
   *  superseded connection (device change, re-attach, reconnect) is dropped. */
  private _serial = 0;
  private _pending = false;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryIndex = 0;
  private _listenedConnection?: HassConnection;
  private readonly _onReady = (): void => this._reopen();
  private readonly _onDisconnected = (): void => this._cancelRetry();
  /** The config entry feed (`subscribeEntryLoads`), opened once per
   *  connection; null when refused (non-admin) or not open. */
  private _entryFeed: Unsubscribe | null = null;
  private _entryFeedConnection?: HassConnection;
  private _entryFeedSerial = 0;
  /** `apply` of the last job a push showed, so "Try again" on a failed
   *  preview repeats the preview instead of writing thresholds. */
  private _lastJobApply: { jobId: string; apply: boolean } | null = null;
  /** Bumped to drop a pending "Read settings" retry (Close, a new run, a
   *  device change, leaving the page). */
  private _readSettingsToken = 0;
  private readonly _maxOf = (entityId: string | null): number => thresholdMax(this.hass, entityId);

  public setConfig(config: CalibrateCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 6;
  }

  static getStubConfig(): CalibrateCardConfig {
    return { type: `custom:${CALIBRATE_CARD_TAG}` };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  connectedCallback(): void {
    super.connectedCallback();
    this._attachConnectionListeners();
    this._open();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    // A retry that fires after the card left the page would start a job the
    // user can no longer see.
    this._cancelReadSettings();
    this._detachConnectionListeners();
    this._closeEntryFeed();
    this._close();
  }

  /** Skip the hass ticks (most of them) that touch none of our entities. */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (changed.size !== 1 || !changed.has("hass")) return true;
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (!oldHass || !this.hass || !this._config) return true;
    if (
      oldHass.entities !== this.hass.entities ||
      oldHass.devices !== this.hass.devices ||
      oldHass.connection !== this.hass.connection
    ) {
      return true;
    }
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    return resolvedStatesChanged(oldHass, this.hass, this._watchedIds());
  }

  protected willUpdate(changed: PropertyValues): void {
    if (!this.hass || !this._config) return;
    if (!changed.has("hass") && !changed.has("_config")) return;
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    const deviceId = resolvedDeviceId(this.hass, this._config, this._resolved.map);
    this._attachConnectionListeners();
    if (deviceId !== this._deviceId) {
      this._deviceId = deviceId;
      this._payload = undefined;
      this._local = INITIAL_LOCAL_STATE;
      this._failure = undefined;
      this._stopError = undefined;
      this._turnOffError = undefined;
      this._lastJobApply = null;
      this._showLastResult = false;
      this._cancelReadSettings();
      this._retryIndex = 0;
      this._loadState = "loading";
      this._close();
    }
    this._open();
  }

  /** The entity ids whose state changes re-render the card. */
  private _watchedIds(): string[] {
    const m = this._resolved?.map;
    if (!m) return [];
    const entities = this._payload?.entities;
    return [
      m.engineering_mode,
      ...m.move_threshold,
      ...m.still_threshold,
      // The gate range decides which turned-off gates the idle card names.
      m.max_move_distance,
      m.max_still_distance,
      m.radar_target,
      m.background_correction_status,
      entities?.engineering_mode,
      entities?.background_status,
    ].filter((id): id is string => !!id);
  }

  private _apiHass(): CalibrationApiHass | undefined {
    const h = this.hass;
    if (!h?.callService || !h.connection?.subscribeMessage) return undefined;
    return h as unknown as CalibrationApiHass;
  }

  // ---------------------------------------------------------------------------
  // Subscription
  // ---------------------------------------------------------------------------

  private _open(): void {
    this._openEntryFeed();
    if (!this.isConnected || this._unsubscribe || this._pending || this._retryTimer) return;
    const hass = this._apiHass();
    const deviceId = this._deviceId;
    if (!hass || !deviceId) return;
    const serial = ++this._serial;
    this._pending = true;
    subscribeCalibration(hass, deviceId, (payload) => {
      if (serial !== this._serial) return;
      this._applyPayload(payload);
    }).then(
      (unsubscribe) => {
        if (serial !== this._serial) {
          // Superseded while in flight: this one is ours to close.
          safeUnsubscribe(unsubscribe);
          return;
        }
        this._pending = false;
        this._unsubscribe = unsubscribe;
        this._retryIndex = 0;
        if (this._loadState !== "idle") this._loadState = this._payload ? "idle" : "loading";
      },
      (error) => {
        if (serial !== this._serial) return;
        this._pending = false;
        this._failOpen(error);
      }
    );
  }

  private _failOpen(error: unknown): void {
    const code = (error as { code?: string } | undefined)?.code;
    if (code === ERR_NOT_LOADED && this._retryIndex < CALIBRATION_RETRY_DELAYS_MS.length) {
      // The integration is mid-reload (or HA just restarted and has not loaded
      // it yet). Bounded backoff, then a manual Retry.
      const delay = CALIBRATION_RETRY_DELAYS_MS[this._retryIndex];
      this._retryIndex += 1;
      this._loadState = "retrying";
      this._retryTimer = setTimeout(() => {
        this._retryTimer = null;
        this._open();
      }, delay);
      return;
    }
    this._loadState = code === ERR_NOT_LOADED ? "not_loaded" : "error";
    this._loadError = describeError(error);
  }

  private _close(): void {
    this._serial += 1;
    this._pending = false;
    this._cancelRetry();
    const unsubscribe = this._unsubscribe;
    this._unsubscribe = null;
    if (unsubscribe) safeUnsubscribe(unsubscribe);
  }

  private _cancelRetry(): void {
    if (this._retryTimer === null) return;
    clearTimeout(this._retryTimer);
    this._retryTimer = null;
  }

  /**
   * Re-run the subscribe on the connection's `ready`. The websocket library
   * re-sends subscriptions on reconnect, but when that re-subscribe is
   * rejected (HA restarted and apollo_mmwave is not loaded yet, the normal
   * order after the one restart that matters) it is dropped silently, the
   * original promise having long been resolved.
   */
  private _reopen(): void {
    this._retryIndex = 0;
    this._close();
    this._open();
  }

  /**
   * Watch the config entry feed so an integration reload reopens the
   * subscription. Unloading the entry closes it server side without telling
   * the client, and neither `ready` nor `disconnected` fires on a reload, so
   * without this an open card would sit on its last payload until a page
   * reload. SPEC NOTE: the spec names only the `ready` handling; this is the
   * zone card's established `subscribeEntryLoads` pattern for the same
   * failure, copied into `calibration/api.ts` rather than imported.
   */
  private _openEntryFeed(): void {
    const hass = this._apiHass();
    const conn = hass?.connection as HassConnection | undefined;
    if (!this.isConnected || !hass || !conn || !this._deviceId) return;
    if (this._entryFeedConnection === conn) return;
    this._closeEntryFeed();
    this._entryFeedConnection = conn;
    const serial = ++this._entryFeedSerial;
    void subscribeEntryLoads(hass, () => {
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

  private _retryNow(): void {
    this._retryIndex = 0;
    this._loadState = "loading";
    this._close();
    this._open();
  }

  private _attachConnectionListeners(): void {
    const conn = this.hass?.connection;
    if (!this.isConnected || !conn || conn === this._listenedConnection) return;
    this._detachConnectionListeners();
    if (!conn.addEventListener) return;
    conn.addEventListener("ready", this._onReady);
    conn.addEventListener("disconnected", this._onDisconnected);
    this._listenedConnection = conn;
  }

  private _detachConnectionListeners(): void {
    const conn = this._listenedConnection;
    this._listenedConnection = undefined;
    if (!conn?.removeEventListener) return;
    conn.removeEventListener("ready", this._onReady);
    conn.removeEventListener("disconnected", this._onDisconnected);
  }

  private _applyPayload(payload: CalibrationPayload): void {
    const previousJobId = this._payload?.job?.job_id;
    this._local = nextLocalState(this._local, payload);
    this._payload = payload;
    this._loadState = "idle";
    const job = payload.job;
    if (job) this._lastJobApply = { jobId: job.job_id, apply: job.apply };
    if (job && !isTerminal(job.status)) {
      // A job is running now, so a stale rejection no longer describes the card.
      this._failure = undefined;
    }
    if (!job || isTerminal(job.status) || job.job_id !== previousJobId) {
      // A rejected Stop only describes the run it tried to stop.
      this._stopError = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  private _start(apply: boolean): void {
    const hass = this._apiHass();
    const deviceId = this._deviceId;
    if (!hass || !deviceId) return;
    this._cancelReadSettings();
    this._failure = undefined;
    this._showLastResult = false;
    this._local = { ...this._local, observedFinish: null };
    const opts: StartOptions = { ...(this._config?.calibration ?? {}) };
    if (!apply) opts.apply = false;
    // Progress comes from the subscription; only a rejection matters here.
    startCalibration(hass, deviceId, opts).catch((error) =>
      this._showServiceFailure("Calibration failed: ", error, () => this._start(apply))
    );
  }

  /** Render a rejected start or restore as the failed view, in the words of
   *  the backend's translated exception message. */
  private async _showServiceFailure(
    prefix: string,
    error: unknown,
    retry: () => void
  ): Promise<void> {
    const deviceId = this._deviceId;
    const message = await describeServiceError(this.hass ?? {}, error);
    if (deviceId !== this._deviceId) return;
    this._failure = { prefix, message, retry, code: refusalKey(error) };
  }

  private _stop(): void {
    const hass = this._apiHass();
    const deviceId = this._deviceId;
    if (!hass || !deviceId) return;
    this._stopError = undefined;
    cancelCalibration(hass, deviceId).catch(async (error) => {
      const message = await describeServiceError(this.hass ?? {}, error);
      if (deviceId !== this._deviceId) return;
      this._stopError = `Could not stop the calibration: ${message}`;
    });
  }

  /** Restore the newest snapshot (what every Undo label names), or the one a
   *  failed restore was writing back when "Try again" repeats it. */
  private _undo(snapshotId?: string): void {
    const hass = this._apiHass();
    const deviceId = this._deviceId;
    if (!hass || !deviceId) return;
    this._cancelReadSettings();
    this._failure = undefined;
    this._showLastResult = false;
    restoreThresholds(hass, deviceId, snapshotId).catch((error) =>
      this._showServiceFailure("Restore failed: ", error, () => this._undo(snapshotId))
    );
  }

  private _turnOff(): void {
    const hass = this._apiHass();
    const switchId = this._engineeringSwitchId();
    if (!hass || !switchId) return;
    const deviceId = this._deviceId;
    this._turnOffError = undefined;
    turnEngineeringMode(hass, switchId, false).catch(async (error) => {
      const message = await describeServiceError(this.hass ?? {}, error);
      if (deviceId !== this._deviceId) return;
      this._turnOffError = `Could not turn Radar Engineering Mode off: ${message}`;
    });
  }

  /**
   * Answer `thresholds_not_numeric`: press the radar's query params button,
   * give it `READ_SETTINGS_WAIT_MS` to report, then run the refused job again
   * with `retry` (the same calibration, preview or restore). A press HA
   * rejects is shown in the view instead.
   */
  private _readSettingsThenRetry(button: string, retry: () => void): void {
    const hass = this._apiHass();
    const deviceId = this._deviceId;
    if (!hass || !deviceId || this._readingSettings) return;
    const token = ++this._readSettingsToken;
    const current = () => token === this._readSettingsToken && deviceId === this._deviceId;
    this._readingSettings = true;
    this._readSettingsError = undefined;
    pressButton(hass, button).then(
      () => {
        setTimeout(() => {
          if (!current()) return;
          this._readingSettings = false;
          // A job started elsewhere meanwhile (another tab, an automation):
          // the running view shows it, and a second start would be refused.
          const running = this._payload?.job;
          if (running && !isTerminal(running.status)) return;
          retry();
        }, READ_SETTINGS_WAIT_MS);
      },
      async (error) => {
        const message = await describeServiceError(this.hass ?? {}, error);
        if (!current()) return;
        this._readingSettings = false;
        this._readSettingsError = `Could not ask the radar for its settings: ${message}`;
      }
    );
  }

  private _cancelReadSettings(): void {
    this._readSettingsToken += 1;
    this._readingSettings = false;
    this._readSettingsError = undefined;
  }

  /** "Close": back to Idle from a result or a failure. */
  private _closeResult(): void {
    this._cancelReadSettings();
    this._failure = undefined;
    this._local = { ...this._local, observedFinish: null };
  }

  // ---------------------------------------------------------------------------
  // Derived facts
  // ---------------------------------------------------------------------------

  private _profileKey(): ProfileKey | undefined {
    return this._resolved?.profile?.key ?? this._payload?.entities?.profile;
  }

  private _engineeringSwitchId(): string | undefined {
    return this._resolved?.map.engineering_mode ?? this._payload?.entities?.engineering_mode ?? undefined;
  }

  /** Live switch state first; the payload's copy when HA has no state. */
  private _engineeringOn(): boolean {
    const id = this._engineeringSwitchId();
    const live = id && this.hass ? this.hass.states[id]?.state : undefined;
    if (live !== undefined) return live === "on";
    return !!this._payload?.entities?.engineering_mode_on;
  }

  /** Live status first, as for the switch: the payload's copy is only as
   *  fresh as the last job push. */
  private _backgroundOn(): boolean {
    const id =
      this._payload?.entities?.background_status ??
      this._resolved?.map.background_correction_status;
    const live = id && this.hass ? this.hass.states[id]?.state : undefined;
    if (live !== undefined) return live === "on";
    return !!this._payload?.entities?.background_status_on;
  }

  /** The radar's query params button, from the payload (registry based) or
   *  the resolved map, when HA has it. */
  private _queryParamsButtonId(): string | undefined {
    const id = this._payload?.entities?.query_params_button ?? this._resolved?.map.query_params;
    return id && this.hass?.states[id] ? id : undefined;
  }

  /** The backend's warning codes, then the gates the run turned back on. */
  private _warningLines(result: CalibrationResult): string[] {
    return [...warningLines(result), ...reenabledLines(result, this._maxOf)];
  }

  private _online(): boolean {
    if (!this.hass || !this._resolved) return false;
    if (!anyResolved(this.hass, this._resolved.ids)) return false;
    const id = this._engineeringSwitchId();
    const state = id ? this.hass.states[id]?.state : undefined;
    return state !== undefined && state !== "unavailable";
  }

  // ---------------------------------------------------------------------------
  // Render
  //
  // Every helper returns a template whose bindings sit inside an element, never
  // at the template root: happy-dom (the test DOM) mis-clones root-level
  // child-part markers, and browsers do not care either way.
  // ---------------------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    return html`
      <ha-card .header=${this._config.title ?? DEFAULT_TITLE}>
        <div class="wrap">${this._renderSubtitle()} ${this._renderBody()}</div>
      </ha-card>
    `;
  }

  private _renderSubtitle(): TemplateResult | typeof nothing {
    const deviceId = this._deviceId;
    if (!deviceId || !this.hass) return nothing;
    const label = this._resolved?.profile?.label ?? this._profileKey()?.toUpperCase();
    const device = this.hass.devices[deviceId];
    const name = device?.name_by_user || device?.name;
    if (!label && !name) return nothing;
    return html`<div class="subtitle">${[label, name].filter(Boolean).join(" · ")}</div>`;
  }

  private _renderBody(): TemplateResult {
    if (!this._deviceId) return html`<p class="hint">${NO_DEVICE_HINT}</p>`;
    if (this._loadState === "retrying") {
      return html`<div class="status" aria-live="polite"><p>${STILL_LOADING}</p></div>`;
    }
    if (this._loadState === "not_loaded" || this._loadState === "error") {
      const text = this._loadState === "not_loaded" ? NOT_LOADED : this._loadError;
      return html`
        <div class="section">
          <div class="status" aria-live="polite"><p class="error">${text}</p></div>
          <div class="buttons">
            <button type="button" class="secondary" @click=${this._retryNow}>Retry</button>
          </div>
        </div>
      `;
    }
    const payload = this._payload;
    // SPEC NOTE: the spec names no copy for the moment between subscribing and
    // the first push (the backend answers immediately); a neutral placeholder
    // rather than an idle body whose buttons would act on an unknown state.
    if (!payload) return html`<div class="status" aria-live="polite"><p class="hint">Loading...</p></div>`;
    const job = payload.job;
    if (job && !isTerminal(job.status)) return this._renderRunning(job);
    if (this._failure) return this._renderFailure(this._failure, payload);
    if (job && payload.last_result?.job_id !== job.job_id) {
      // The job crossed the line but its result is not stored yet (the push
      // before the backend's finally runs); the next push brings it.
      return this._renderFinishing();
    }
    if (showsResultView(this._local, payload) && payload.last_result) {
      return this._renderResult(payload.last_result, payload);
    }
    return this._renderIdle(payload);
  }

  // --- running --------------------------------------------------------------

  private _renderRunning(job: JobState): TemplateResult {
    const lines = phaseLabel(job, this._profileKey());
    const { phase, detail } = phaseHeadline(job);
    const stoppable =
      job.kind === "calibrate" &&
      (job.status === "preparing" || job.status === "sampling" || job.status === "applying");
    // SPEC NOTE: the spec puts the status text in one aria-live region; only
    // the phase sentence is live here, because the countdown, the sample
    // count and the peaks change every second and would be re-announced
    // once a second for the whole listen. The progress bar carries
    // aria-valuenow for anyone who wants the number.
    return html`
      <div class="section">
        <div class="status">
          <p class="headline"><span class="phase" aria-live="polite">${phase}</span>${detail
              ? ` ${detail}`
              : ""}</p>
          ${lines.slice(1).map((line) => html`<p>${line}</p>`)}
        </div>
        ${this._renderBar(job)}
        ${stoppable
          ? html`
              <div class="buttons">
                <button
                  type="button"
                  class="secondary"
                  ?disabled=${!canStop(job)}
                  @click=${this._stop}
                >
                  ${job.cancel_requested ? "Stopping..." : "Stop"}
                </button>
              </div>
            `
          : nothing}
        ${this._stopError ? html`<p class="error" role="alert">${this._stopError}</p>` : nothing}
      </div>
    `;
  }

  private _renderBar(job: JobState): TemplateResult {
    const { fraction, label } = progress(job);
    const percent = fraction === null ? 100 : Math.round(fraction * 100);
    return html`
      <div
        class="bar ${fraction === null ? "indeterminate" : ""}"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${fraction === null ? nothing : percent}
        aria-label=${label || nothing}
      >
        <div class="fill" style="width:${percent}%"></div>
      </div>
    `;
  }

  private _renderFinishing(): TemplateResult {
    return html`
      <div class="section">
        <div class="status" aria-live="polite"><p class="headline">Finishing...</p></div>
        <div class="bar indeterminate" role="progressbar" aria-valuemin="0" aria-valuemax="100">
          <div class="fill" style="width:100%"></div>
        </div>
      </div>
    `;
  }

  // --- failure from a rejected service call ---------------------------------

  // SPEC NOTE: the spec lists only "Try again" for the failed state. A
  // refusal such as not_allowed fails the same way every time, so every
  // failure and result view also has a "Close" back to Idle (footer, Undo and
  // "Show last result"), and the interrupted banner renders above them all.
  private _closeButton(): TemplateResult {
    return html`<button type="button" class="text" @click=${this._closeResult}>Close</button>`;
  }

  private _renderFailure(failure: ServiceFailure, payload: CalibrationPayload): TemplateResult {
    return html`
      <div class="section">
        ${this._renderBanner(payload)}
        <div class="status" aria-live="polite">
          <p class="error">${failure.prefix}${failure.message}</p>
          ${this._renderReadSettingsLines(failure.code)}
        </div>
        <div class="buttons">
          ${this._renderRetryButton(failure.code, failure.retry)} ${this._closeButton()}
        </div>
      </div>
    `;
  }

  /** The `thresholds_not_numeric` extras under a failure: where the button
   *  is when the card cannot press it, the wait, a rejected press. */
  private _renderReadSettingsLines(code: string | undefined): TemplateResult | typeof nothing {
    if (code !== ERR_THRESHOLDS_NOT_NUMERIC) return nothing;
    const hint = this._queryParamsButtonId() ? "" : QUERY_PARAMS_HINT;
    return html`<div class="read-settings">
      ${hint ? html`<p>${hint}</p>` : nothing}
      ${this._readingSettings ? html`<p>${READING_SETTINGS}</p>` : nothing}
      ${this._readSettingsError ? html`<p class="error" role="alert">${this._readSettingsError}</p>` : nothing}
    </div>`;
  }

  /** "Try again", or for thresholds the radar has not reported, "Read
   *  settings from the radar" when the card knows its query params button. */
  private _renderRetryButton(code: string | undefined, retry: () => void): TemplateResult {
    const button = code === ERR_THRESHOLDS_NOT_NUMERIC ? this._queryParamsButtonId() : undefined;
    if (!button) {
      return html`<button type="button" class="primary" @click=${retry}>Try again</button>`;
    }
    return html`<button
      type="button"
      class="primary"
      ?disabled=${this._readingSettings}
      @click=${() => this._readSettingsThenRetry(button, retry)}
    >
      ${READ_SETTINGS_LABEL}
    </button>`;
  }

  // --- finished job ---------------------------------------------------------

  private _renderResult(result: CalibrationResult, payload: CalibrationPayload): TemplateResult {
    const snapshots = payload.snapshots ?? [];
    const banner = this._renderBanner(payload);
    const undo = snapshots.length
      ? html`<button
          type="button"
          class="secondary"
          title=${undoTitle(snapshots) ?? nothing}
          @click=${() => this._undo()}
        >
          ${undoLabel(snapshots)}
        </button>`
      : nothing;
    const again = (label: string) =>
      html`<button type="button" class="primary" @click=${() => this._start(true)}>${label}</button>`;

    if (result.status === "failed" || result.outcome === "failed") {
      return html`
        <div class="section">
          ${banner}
          <div class="status" aria-live="polite">
            <p class="error">${failureLine(result)}</p>
            ${this._renderReadSettingsLines(result.error?.code)}
          </div>
          <div class="buttons">
            ${offersUndo(result) ? undo : nothing} ${this._renderTryAgain(result, snapshots)}
            ${this._closeButton()}
          </div>
        </div>
      `;
    }
    if (result.outcome === "cancelled") {
      const writes = result.writes_done ?? 0;
      return html`
        <div class="section">
          ${banner}
          <div class="status" aria-live="polite"><p>${cancelledLine(result)}</p></div>
          <div class="buttons">
            ${writes > 0 ? undo : nothing} ${again(PRIMARY_LABEL)} ${this._closeButton()}
          </div>
        </div>
      `;
    }
    if (result.kind === "restore") {
      const missing = missingLine(result);
      return html`
        <div class="section">
          ${banner}
          <div class="status" aria-live="polite">
            <p class="headline">${restoredLine(result, snapshots)}</p>
            ${missing ? html`<p>${missing}</p>` : nothing}
            ${this._warningLines(result).map((line) => html`<p class="warning">${line}</p>`)}
          </div>
          ${this._renderIdleBody(payload)}
          <div class="buttons">${undo} ${again(PRIMARY_LABEL)}</div>
        </div>
      `;
    }
    if (result.outcome === "preview") {
      return html`
        <div class="section">
          ${banner}
          <div class="status" aria-live="polite">
            <p class="headline">Preview: no threshold was changed.</p>
            <p>These are the thresholds calibration would set:</p>
          </div>
          ${this._renderTable(result)}
          ${this._warningLines(result).map((line) => html`<p class="warning">${line}</p>`)}
          <div class="buttons">${again("Calibrate and apply")} ${this._closeButton()}</div>
        </div>
      `;
    }
    return html`
      <div class="section">
        ${banner}
        <div class="status" aria-live="polite">
          <p class="headline">${resultHeading(result)}</p>
          <p>${summaryLine(result)}</p>
        </div>
        ${this._renderTable(result)}
        ${this._warningLines(result).map((line) => html`<p class="warning">${line}</p>`)}
        <p>${WALK_AROUND_LINE}</p>
        <div class="buttons">${undo} ${again("Calibrate again")} ${this._closeButton()}</div>
      </div>
    `;
  }

  /**
   * "Try again" repeats the job that failed. A calibration restarts with the
   * same `apply` (a failed preview previews again). A restore writes back the
   * snapshot it was restoring, by id: once its redo snapshot is saved that is
   * the newest, and restoring the newest would put back the very values the
   * user was undoing. When the source cannot be told the button is left out
   * (Close and Undo remain). For thresholds the radar has not reported, the
   * button reads the radar's settings first (`_renderRetryButton`).
   */
  private _renderTryAgain(
    result: CalibrationResult,
    snapshots: CalibrationPayload["snapshots"]
  ): TemplateResult | typeof nothing {
    let retry: () => void;
    if (result.kind === "restore") {
      const source = restoreSource(result, snapshots);
      if (!source?.id) return nothing;
      const id = source.id;
      retry = () => this._undo(id);
    } else {
      const seen = this._lastJobApply;
      const apply = seen && seen.jobId === result.job_id ? seen.apply : true;
      retry = () => this._start(apply);
    }
    return this._renderRetryButton(result.error?.code, retry);
  }

  private _renderTable(result: CalibrationResult): TemplateResult {
    const rows = resultRows(result, this._maxOf);
    const footnotes = unusedFootnote(result);
    const cellClass = (flags: string[]) => (flags.includes("unused") ? "unused" : "");
    const renderRow = (row: Row) => html`
      <tr class=${row.unused ? "unused" : ""}>
        <th scope="row">${row.label}</th>
        <td class=${cellClass(row.move.flags)}>${row.move.peak}</td>
        <td class="threshold ${cellClass(row.move.flags)}">${thresholdCell(row.move.text)}</td>
        <td class=${cellClass(row.still.flags)}>${row.still.peak}</td>
        <td class="threshold ${cellClass(row.still.flags)}">${thresholdCell(row.still.text)}</td>
      </tr>
    `;
    return html`
      <div class="result">
        <div class="table-wrap">
          <table>
          <thead>
            <tr>
              <th scope="col">Gate</th>
              <th scope="col">Move peak</th>
              <th scope="col">Move threshold</th>
              <th scope="col">Still peak</th>
              <th scope="col">Still threshold</th>
            </tr>
          </thead>
            <tbody>
              ${rows.map(renderRow)}
            </tbody>
          </table>
        </div>
        ${footnotes.map((line) => html`<p class="footnote">${line}</p>`)}
      </div>
    `;
  }

  // --- idle -----------------------------------------------------------------

  private _renderIdle(payload: CalibrationPayload): TemplateResult {
    const online = this._online();
    const snapshots = payload.snapshots ?? [];
    return html`
      <div class="section">
        ${this._renderBanner(payload)}
        ${online
          ? this._renderIdleBody(payload)
          : html`<div class="status" aria-live="polite"><p>${OFFLINE_LINE}</p></div>`}
        ${this._renderIdleButtons(payload, online)}
        ${this._renderFooter(payload, snapshots)}
      </div>
    `;
  }

  private _renderIdleBody(payload: CalibrationPayload): TemplateResult {
    const settle = this._config?.calibration?.settle_s ?? DEFAULT_SETTLE_S;
    const duration = this._config?.calibration?.duration_s ?? DEFAULT_DURATION_S;
    const ld2412 = this._profileKey() === "ld2412";
    const engineeringBullet = this._engineeringOn()
      ? "Radar Engineering Mode is already on and will stay on."
      : "Home Assistant turns Radar Engineering Mode on for the listen and back off afterward.";
    const factory =
      this.hass && this._resolved
        ? isFactoryThresholds(this.hass, this._resolved.map, this._profileKey(), payload.snapshots ?? [])
        : false;
    const offLine = this._offGatesLine(payload);
    return html`
      <div class="idle-body">
        <p>${idleSentence(settle, duration)}</p>
        <ul>
        <li>Nobody in the radar's view: people, pets, robot vacuums.</li>
        <li>
          Fans, curtains and plants that normally move are part of the background. Leave them
          as they usually are.
        </li>
        <li>${engineeringBullet}</li>
        ${ld2412
          ? html`<li>
              LD2412: run Start Dynamic Background Correction (Controls card) first with the
              room empty and wait for its status to turn off. Calibrate afterward.
            </li>`
          : nothing}
        ${ld2412 && this._backgroundOn()
          ? html`<li>
              Background correction is running on the LD2412. Wait for its status to turn off.
            </li>`
          : nothing}
        </ul>
        ${offLine ? html`<p class="warning">${offLine}</p>` : nothing}
        ${factory ? html`<p class="hint">${FACTORY_HINT}</p>` : nothing}
      </div>
    `;
  }

  /** The in-use gates whose live threshold sits at the top (turned off), which
   *  a calibration would turn back on; null when there are none. A gate the
   *  last calibration turned off itself is not named: the user did not. */
  private _offGatesLine(payload: CalibrationPayload): string | null {
    if (!this.hass || !this._resolved) return null;
    const map = this._resolved.map;
    const profile = this._profileKey();
    const limits = liveGateLimits(this.hass, map, profile, payload.entities);
    return offGatesLine(offChannelsBeforeRun(this.hass, map, profile, limits, payload.last_result));
  }

  private _renderIdleButtons(payload: CalibrationPayload, online: boolean): TemplateResult {
    const enabled = canStart(payload, online, this._backgroundOn()) && !!this._apiHass();
    return html`
      <div class="actions">
        <div class="buttons">
          <button type="button" class="primary" ?disabled=${!enabled} @click=${() => this._start(true)}>
            ${PRIMARY_LABEL}
          </button>
          <button type="button" class="text" ?disabled=${!enabled} @click=${() => this._start(false)}>
            Preview only
          </button>
        </div>
        <p class="helper">${PREVIEW_HELPER}</p>
      </div>
    `;
  }

  private _renderFooter(
    payload: CalibrationPayload,
    snapshots: CalibrationPayload["snapshots"]
  ): TemplateResult | typeof nothing {
    const last = payload.last_result;
    if (!snapshots.length && !last) return nothing;
    // The saved time as text too: a tooltip never shows on a touch screen,
    // and these values may belong to an older run than the line above.
    const saved = savedLine(snapshots);
    return html`
      <div class="footer">
        ${snapshots.length
          ? html`
              <div class="last">
                ${last ? html`<p>${footerLine(last)}</p>` : nothing}
                <div class="buttons">
                  <button
                    type="button"
                    class="secondary"
                    title=${undoTitle(snapshots) ?? nothing}
                    @click=${() => this._undo()}
                  >
                    ${undoLabel(snapshots)}
                  </button>
                </div>
                ${saved ? html`<p class="helper">${saved}</p>` : nothing}
              </div>
            `
          : nothing}
        ${last
          ? html`
              <div class="stored-toggle">
                <div class="buttons">
                  <button
                    type="button"
                    class="text"
                    aria-expanded=${this._showLastResult ? "true" : "false"}
                    @click=${() => (this._showLastResult = !this._showLastResult)}
                  >
                    ${this._showLastResult ? "Hide last result" : "Show last result"}
                  </button>
                </div>
                ${this._showLastResult ? this._renderStoredResult(last) : nothing}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderStoredResult(result: CalibrationResult): TemplateResult {
    if (result.status === "failed" || result.outcome === "failed") {
      return html`<div class="stored"><p class="error">${failureLine(result)}</p></div>`;
    }
    const warnings = this._warningLines(result).map((line) => html`<p class="warning">${line}</p>`);
    // A restore result always carries `gates: []`: its lines are the summary
    // and the entities it could not find, never a table.
    if (result.kind === "restore") {
      return html`<div class="stored">
        ${restoreSummaryLines(result).map((line) => html`<p>${line}</p>`)} ${warnings}
      </div>`;
    }
    const hasTable = (result.gates ?? []).length > 0;
    return html`<div class="stored">
      <p>${summaryLine(result)}</p>
      ${hasTable ? this._renderTable(result) : nothing} ${warnings}
    </div>`;
  }

  /**
   * The interrupted banner. `phase` and `left_on` are independent facts: the
   * engineering line shows while the switch reads on for either, the
   * thresholds line while the marker's phase is `applying`.
   */
  private _renderBanner(payload: CalibrationPayload): TemplateResult | typeof nothing {
    const marker = payload.interrupted;
    if (!marker) return nothing;
    const switchOn = this._engineeringOn();
    const engineeringLine = switchOn && (marker.phase === "engineering" || marker.left_on);
    const thresholdsLine = marker.phase === "applying";
    if (!engineeringLine && !thresholdsLine) return nothing;
    // SPEC NOTE: the spec words the first line for a calibration; a restore
    // marker says restore. `left_on` is only ever set by a calibration (a
    // restore never touches engineering mode), so its line keeps the word.
    const first = marker.left_on
      ? "The last calibration could not turn Radar Engineering Mode back off (the radar was offline)."
      : marker.kind === "restore"
        ? "A restore was interrupted by a restart."
        : "A calibration was interrupted by a restart.";
    const snapshots = payload.snapshots ?? [];
    const saved = snapshots.find((s) => s.id === marker.snapshot_id) ?? snapshots[0];
    const savedAt = saved ? formatTime(saved.taken_at) : "the start";
    return html`
      <div class="banner" role="status">
        <p>${first}</p>
        ${engineeringLine
          ? html`<p>
              Radar Engineering Mode may still be on.
              <button type="button" class="secondary" @click=${this._turnOff}>Turn it off</button>
            </p>`
          : nothing}
        ${engineeringLine && this._turnOffError
          ? html`<p class="error" role="alert">${this._turnOffError}</p>`
          : nothing}
        ${thresholdsLine
          ? html`<p>
              Some thresholds may have been written. Undo restores the values saved at
              ${savedAt}.
              <button type="button" class="secondary" ?disabled=${!saved} @click=${() => this._undo()}>
                Undo
              </button>
            </p>`
          : nothing}
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    .wrap {
      padding: 0 16px 16px;
    }
    .subtitle {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      margin: -8px 0 12px;
    }
    p {
      margin: 0 0 8px;
    }
    ul {
      margin: 0 0 12px;
      padding-left: 20px;
    }
    li {
      margin: 4px 0;
    }
    .headline {
      font-weight: 500;
      font-size: 1.05em;
    }
    .hint,
    .helper,
    .footnote {
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
    .warning {
      color: var(--warning-color, #ff9800);
    }
    .error {
      color: var(--error-color, #db4437);
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin: 12px 0 8px;
    }
    button {
      font: inherit;
      cursor: pointer;
      border-radius: 4px;
      padding: 8px 16px;
      border: 1px solid var(--primary-color);
      background: none;
      color: var(--primary-color);
    }
    button.primary {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      font-weight: 500;
    }
    button.text {
      border-color: transparent;
      padding: 8px 8px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .banner p button,
    .footer .buttons {
      margin-top: 4px;
    }
    .banner {
      border: 1px solid var(--warning-color, #ff9800);
      border-radius: 8px;
      padding: 8px 12px;
      margin-bottom: 12px;
    }
    .banner p button {
      margin-left: 8px;
      padding: 4px 10px;
    }
    .footer {
      border-top: 1px solid var(--divider-color, #e0e0e0);
      margin-top: 12px;
      padding-top: 8px;
      font-size: 0.95em;
    }
    .bar {
      height: 6px;
      background: var(--divider-color, #e0e0e0);
      border-radius: 3px;
      overflow: hidden;
      margin: 4px 0 12px;
    }
    .bar .fill {
      height: 100%;
      background: var(--primary-color);
      transition: width 0.5s linear;
    }
    .bar.indeterminate .fill {
      width: 40% !important;
      animation: slide 1.4s infinite ease-in-out;
    }
    @keyframes slide {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(250%);
      }
    }
    .table-wrap {
      overflow-x: auto;
      margin: 8px 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 0.9em;
    }
    th,
    td {
      text-align: left;
      padding: 4px 6px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      white-space: nowrap;
    }
    /* A threshold cell may wrap, but only between its value and its note,
       so "(was off)" drops under "100 → 15" on a narrow card instead of
       pushing the column out of view. */
    td.threshold {
      white-space: normal;
    }
    td.threshold .value,
    td.threshold .note {
      white-space: nowrap;
    }
    th {
      color: var(--secondary-text-color);
      font-weight: 500;
    }
    tr.unused th,
    td.unused {
      opacity: 0.55;
    }
  `;
}

registerElement(CALIBRATE_CARD_TAG, ApolloRadarCalibrateCard);

const customCards = ((window as any).customCards = (window as any).customCards || []);
if (!customCards.some((c: { type?: string }) => c.type === CALIBRATE_CARD_TAG)) {
  customCards.push({
    type: CALIBRATE_CARD_TAG,
    name: "Apollo Radar Auto-Calibrate",
    description:
      "One-button empty-room calibration of every gate threshold on an Apollo MSR (LD2410) or R PRO (LD2412), with undo.",
    documentationURL: "https://github.com/ApolloAutomation/apollo-mmwave-main",
  });
}
