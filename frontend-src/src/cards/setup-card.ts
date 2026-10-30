/**
 * The "Radar setup" card: checks one radar's settings and offers the fix
 * where the user already is, so nobody has to open the device page to find
 * out why something is off.
 *
 * `radar` picks the radar. "ld2450" (the default) checks an LD2450's Zone
 * Type and Multi Target Tracking right above the zone map (`setup-checks.ts`).
 * "gate" checks the device's gate radar, the LD2410 or LD2412 its profile
 * names (`gate-setup-checks.ts`): Radar Engineering Mode left on, settings
 * the radar has not reported, and LD2410 zones or an LD2412 range that can
 * never see anyone. An R PRO-1 tab has one card of each.
 *
 * The checks are pure and re-run on every render from live HA state, so a
 * change made anywhere (this card, a Controls card, the device page) shows
 * at once. The card never writes on its own: each button names what it
 * changes and makes that one service call.
 */

import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, Ld2410CardConfig, SetupCardConfig } from "../types";
import { registerCustomCard, registerElement } from "../register";
import { hasLd2450Device } from "../ld2450";
import { detectProfileFromEntities } from "../entities";
import {
  ERR_NOT_FOUND,
  callService,
  describeServiceError,
  type CalibrationApiHass,
} from "../calibration/api";
import { CalibrationJobWatch } from "../calibration/job-watch";
import { resolveRadar, type ResolvedRadar } from "./resolution";
import {
  ALL_GOOD_LINE,
  NOTHING_TO_CHECK_LINE,
  NO_DEVICE_LINE,
  OFFLINE_LINE,
  RECOMMENDED_LABEL,
  RECOMMENDED_PROGRESS,
  SETTING_NOT_FOUND,
  WAITING_LINE,
  ZONE_TYPE_WAITING_LINE,
  recommendedLine,
  setupStatus,
  watchedSetupIds,
  type SettingKey,
  type SetupProblem,
  type SetupStatus,
} from "./setup-checks";
import {
  CHECKING_LINE,
  GATE_NOTHING_TO_CHECK_LINE,
  gateSetupStatus,
  gateWatchedIds,
} from "./gate-setup-checks";

export const SETUP_CARD_TAG = "apollo-radar-setup-card";
const DEFAULT_TITLE = "Radar setup";

/** A rejected call as one sentence. `describeServiceError` reads a domain-less
 *  `not_found` as this integration being unloaded, which is calibration's
 *  case; these calls go to the select, switch and button services instead. */
async function rejectionText(hass: HomeAssistant, error: any): Promise<string> {
  const code = error?.code ?? error?.error?.code;
  if (code === ERR_NOT_FOUND) return SETTING_NOT_FOUND;
  return describeServiceError(hass, error);
}

/** A fix whose effect arrives later, waiting for the problem to clear. */
interface Settling {
  problems: SetupProblem[];
  timer: ReturnType<typeof setTimeout>;
}

export class ApolloRadarSetupCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: SetupCardConfig;
  /** The progress line of the call in flight; every button is off meanwhile. */
  @state() private _busy?: string;
  /** The card's own line for a rejected call. */
  @state() private _error?: string;
  /** A fix that went through but whose problem stayed (`SettingFix.noAnswer`). */
  @state() private _note?: { setting: SettingKey; text: string };

  /** Bumped on a device change so a call that settles afterward is dropped. */
  private _serial = 0;
  private _deviceId?: string;
  private _settling?: Settling;
  /** Gate mode: the device's entities, memoized on the registries. */
  private _resolved?: ResolvedRadar;
  /** Gate mode: the config `resolveRadar` keys on, kept per `setConfig`. */
  private _radarConfig?: Ld2410CardConfig;
  /** Gate mode: whether a calibration job owns Radar Engineering Mode. */
  private readonly _jobWatch = new CalibrationJobWatch(() => this.requestUpdate());

  public setConfig(config: SetupCardConfig): void {
    this._config = config;
    this._radarConfig = {
      type: config.type,
      ...(config.device_id ? { device_id: config.device_id } : {}),
    };
  }

  public getCardSize(): number {
    return 2;
  }

  /** The first device with an LD2450, so a card added from the picker works
   *  as is; else the first with a gate radar, checking that. */
  static getStubConfig(hass?: HomeAssistant): SetupCardConfig {
    const type = `custom:${SETUP_CARD_TAG}`;
    if (!hass) return { type };
    const ids = Object.keys(hass.devices ?? {});
    const ld2450 = ids.find((id) => hasLd2450Device(hass, id));
    if (ld2450) return { type, device_id: ld2450 };
    // From the device's own entities only: a registry model match alone can
    // be another integration's copy of the device (`isEsphomeDevice`).
    const gate = ids.find((id) => detectProfileFromEntities(hass, id) !== undefined);
    return gate ? { type, device_id: gate, radar: "gate" } : { type };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._watchJobs();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._jobWatch.close();
    this._endSettling(false);
  }

  private _isGate(): boolean {
    return this._config?.radar === "gate";
  }

  /** Gate mode only: the device's resolved entity map and profile. */
  private _resolve(): ResolvedRadar | undefined {
    if (!this._isGate() || !this.hass || !this._radarConfig) return undefined;
    this._resolved = resolveRadar(this._resolved, this.hass, this._radarConfig);
    return this._resolved;
  }

  private _watchJobs(): void {
    if (this.isConnected && this._isGate()) {
      this._jobWatch.watch(this.hass, this._config?.device_id);
    } else {
      this._jobWatch.close();
    }
  }

  private _status(): SetupStatus {
    const deviceId = this._config?.device_id;
    const resolved = this._resolve();
    if (!resolved) return setupStatus(this.hass!, deviceId);
    return gateSetupStatus(
      this.hass!,
      deviceId,
      resolved.map,
      resolved.profile,
      this._jobWatch.activity
    );
  }

  private _watchedIds(): string[] {
    const resolved = this._resolve();
    if (resolved) return gateWatchedIds(resolved.map, resolved.profile);
    return watchedSetupIds(this.hass!, this._config?.device_id);
  }

  /** Skip the hass ticks that touch none of the checked entities. */
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
    return this._watchedIds().some((id) => oldHass.states[id] !== this.hass!.states[id]);
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config") || changed.has("hass")) {
      const deviceId = this._config?.device_id;
      if (deviceId !== this._deviceId) {
        this._deviceId = deviceId;
        this._serial++;
        this._endSettling(false);
        this._busy = undefined;
        this._error = undefined;
        this._note = undefined;
      }
      this._watchJobs();
    }
    if (!this.hass) return;
    const problems = this._problems();
    const present = (setting: SettingKey) => problems.some((p) => p.setting === setting);
    // A failure is about a problem that is still there; once the checks pass
    // (the fix landed another way), the line would only confuse.
    if (this._error && !problems.length) this._error = undefined;
    if (this._note && !present(this._note.setting)) this._note = undefined;
    // The answer arrived: no need to wait out the rest of the settle time.
    if (this._settling && !this._settling.problems.some((p) => present(p.setting))) {
      this._endSettling(false);
    }
  }

  private _problems(): SetupProblem[] {
    if (!this.hass) return [];
    const status = this._status();
    return status.kind === "checked" ? status.problems : [];
  }

  private async _apply(problems: SetupProblem[]): Promise<void> {
    const hass = this.hass;
    const fixable = problems.filter((p) => p.fix);
    if (!hass?.callService || this._busy || fixable.length === 0) return;
    const serial = this._serial;
    this._error = undefined;
    this._note = undefined;
    this._busy = fixable.length > 1 ? RECOMMENDED_PROGRESS : fixable[0].fix!.progress;
    const api = hass as unknown as Pick<CalibrationApiHass, "callService">;
    const results = await Promise.allSettled(
      fixable.map((p) => callService(api, p.fix!.domain, p.fix!.service, p.fix!.data))
    );
    const errors: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "rejected") {
        const fix = fixable[i].fix!;
        const lead = fix.failure ?? `Could not change ${fixable[i].name}`;
        errors.push(`${lead}: ${await rejectionText(hass, r.reason)}`);
      }
    }
    if (serial !== this._serial) return;
    this._error = errors.length ? errors.join(" ") : undefined;
    // A query's answer arrives as state changes a moment after the call
    // returns: keep the progress line up until it does, or the wait runs out.
    const waiting = fixable.filter(
      (p, i) => results[i].status === "fulfilled" && p.fix!.settleMs !== undefined
    );
    const current = this._problems();
    if (waiting.some((p) => current.some((c) => c.setting === p.setting))) {
      const ms = Math.max(...waiting.map((p) => p.fix!.settleMs!));
      this._settling = {
        problems: waiting,
        timer: setTimeout(() => {
          if (serial === this._serial) this._endSettling(true);
        }, ms),
      };
      return;
    }
    this._busy = undefined;
  }

  /** End a settle wait. Timed out with the problem still there, the card
   *  says so (`noAnswer`), so the user knows the click did go through. */
  private _endSettling(timedOut: boolean): void {
    const settling = this._settling;
    if (!settling) return;
    clearTimeout(settling.timer);
    this._settling = undefined;
    this._busy = undefined;
    if (!timedOut || !this.hass) return;
    const current = this._problems();
    const left = settling.problems.find((p) => current.some((c) => c.setting === p.setting));
    if (left?.fix?.noAnswer) this._note = { setting: left.setting, text: left.fix.noAnswer };
  }

  // ---------------------------------------------------------------------------
  // Render
  //
  // Every helper wraps its bindings in an element, never at the template root:
  // happy-dom (the test DOM) mis-clones root-level child-part markers.
  // ---------------------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    return html`
      <ha-card .header=${this._config.title ?? DEFAULT_TITLE}>
        <div class="wrap">${this._renderSubtitle()} ${this._renderBody()}</div>
      </ha-card>
    `;
  }

  private _renderSubtitle(): TemplateResult | typeof nothing {
    const deviceId = this._config?.device_id;
    const device = deviceId ? this.hass?.devices[deviceId] : undefined;
    const name = device?.name_by_user || device?.name;
    if (!this._isGate()) {
      return name ? html`<div class="subtitle">LD2450 · ${name}</div>` : nothing;
    }
    const text = [this._resolve()?.profile?.label, name].filter(Boolean).join(" · ");
    return text ? html`<div class="subtitle">${text}</div>` : nothing;
  }

  private _renderBody(): TemplateResult {
    const status = this._status();
    switch (status.kind) {
      case "no_device":
        return html`<p class="hint">${NO_DEVICE_LINE}</p>`;
      case "nothing_to_check": {
        const line = this._isGate() ? GATE_NOTHING_TO_CHECK_LINE : NOTHING_TO_CHECK_LINE;
        return html`<p class="hint">${line}</p>`;
      }
      case "offline":
        return html`<p class="hint">${OFFLINE_LINE}</p>`;
      case "waiting":
        return html`<p class="hint">${WAITING_LINE}</p>`;
      case "checking":
        return html`<p class="hint">${CHECKING_LINE}</p>`;
      case "checked":
        return status.problems.length
          ? this._renderProblems(status.problems, !!status.zoneTypeUnread)
          : html`<p class="ok">${ALL_GOOD_LINE}</p>`;
    }
  }

  private _renderProblems(problems: SetupProblem[], zoneTypeUnread: boolean): TemplateResult {
    const fixable = problems.filter((p) => p.fix);
    // More than one LD2450 fix: one button for all of them instead of one
    // each. A gate radar's fixes (a switch, a read) stay apart.
    const combined = !this._isGate() && fixable.length > 1;
    const canCall = !!this.hass?.callService && !this._busy;
    return html`
      <div class="problems">
        ${problems.map(
          (p) => html`
            <div class="problem ${p.level}">
              <p class=${p.level}>${p.text}</p>
              ${p.hint ? html`<p class="hint">${p.hint}</p>` : nothing}
              ${p.fix && !combined
                ? html`<div class="buttons">
                    <button
                      type="button"
                      class="primary"
                      ?disabled=${!canCall}
                      @click=${() => this._apply([p])}
                    >
                      ${p.fix.label}
                    </button>
                  </div>`
                : nothing}
            </div>
          `
        )}
        ${combined
          ? html`<div class="combined">
              <div class="buttons">
                <button
                  type="button"
                  class="primary"
                  ?disabled=${!canCall}
                  @click=${() => this._apply(fixable)}
                >
                  ${RECOMMENDED_LABEL}
                </button>
              </div>
              <p class="hint">${recommendedLine(fixable.map((p) => p.fix!))}</p>
            </div>`
          : nothing}
        ${zoneTypeUnread ? html`<p class="hint">${ZONE_TYPE_WAITING_LINE}</p>` : nothing}
        <div class="status" aria-live="polite">
          ${this._busy ? html`<p class="hint">${this._busy}</p>` : nothing}
          ${this._note ? html`<p class="hint">${this._note.text}</p>` : nothing}
          ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
        </div>
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
    .problem + .problem {
      border-top: 1px solid var(--divider-color, #e0e0e0);
      padding-top: 8px;
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
    .ok {
      margin: 0;
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
      margin: 8px 0;
    }
    button {
      font: inherit;
      cursor: pointer;
      border-radius: 4px;
      padding: 8px 16px;
      border: 1px solid var(--primary-color);
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      font-weight: 500;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .status p:last-child {
      margin-bottom: 0;
    }
  `;
}

registerElement(SETUP_CARD_TAG, ApolloRadarSetupCard);
registerCustomCard(
  SETUP_CARD_TAG,
  "Apollo Radar Setup",
  "Checks an Apollo radar's settings and offers one-click fixes: the LD2450 on an" +
    " R PRO-1 or MTR-1, or the gate radar on an MSR-1, MSR-2 or R PRO-1."
);
