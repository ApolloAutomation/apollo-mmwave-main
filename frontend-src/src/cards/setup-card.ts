/**
 * The "Radar setup" card: checks an LD2450's Zone Type and Multi Target
 * Tracking and offers the fix right above the zone map, so nobody has to open
 * the device page to find out why the map shows no dot.
 *
 * The checks are pure (`setup-checks.ts`) and re-run on every render from live
 * HA state, so a change made anywhere (this card, the LD2450 Controls card,
 * the device page) shows at once. The card never writes on its own: each
 * button names the setting it changes and makes that one service call.
 */

import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, SetupCardConfig } from "../types";
import { registerCustomCard, registerElement } from "../register";
import { hasLd2450Device } from "../ld2450";
import {
  ERR_NOT_FOUND,
  callService,
  describeServiceError,
  type CalibrationApiHass,
} from "../calibration/api";
import {
  ALL_GOOD_LINE,
  NOTHING_TO_CHECK_LINE,
  NO_DEVICE_LINE,
  OFFLINE_LINE,
  RECOMMENDED_LABEL,
  RECOMMENDED_PROGRESS,
  SETTING_NOT_FOUND,
  WAITING_LINE,
  recommendedLine,
  setupStatus,
  watchedSetupIds,
  type SetupProblem,
} from "./setup-checks";

export const SETUP_CARD_TAG = "apollo-radar-setup-card";
const DEFAULT_TITLE = "Radar setup";

/** A rejected call as one sentence. `describeServiceError` reads a domain-less
 *  `not_found` as this integration being unloaded, which is calibration's
 *  case; these calls go to the select and switch services instead. */
async function rejectionText(hass: HomeAssistant, error: any): Promise<string> {
  const code = error?.code ?? error?.error?.code;
  if (code === ERR_NOT_FOUND) return SETTING_NOT_FOUND;
  return describeServiceError(hass, error);
}

export class ApolloRadarSetupCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: SetupCardConfig;
  /** The progress line of the call in flight; every button is off meanwhile. */
  @state() private _busy?: string;
  /** The card's own line for a rejected call. */
  @state() private _error?: string;

  /** Bumped on a device change so a call that settles afterward is dropped. */
  private _serial = 0;
  private _deviceId?: string;

  public setConfig(config: SetupCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 2;
  }

  /** The first device with an LD2450, so a card added from the picker works
   *  as is. */
  static getStubConfig(hass?: HomeAssistant): SetupCardConfig {
    const deviceId = hass
      ? Object.keys(hass.devices ?? {}).find((id) => hasLd2450Device(hass, id))
      : undefined;
    return { type: `custom:${SETUP_CARD_TAG}`, ...(deviceId ? { device_id: deviceId } : {}) };
  }

  /** Skip the hass ticks that touch none of the checked entities. */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (changed.size !== 1 || !changed.has("hass")) return true;
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (!oldHass || !this.hass || !this._config) return true;
    if (oldHass.entities !== this.hass.entities || oldHass.devices !== this.hass.devices) {
      return true;
    }
    return watchedSetupIds(this.hass, this._config.device_id).some(
      (id) => oldHass.states[id] !== this.hass!.states[id]
    );
  }

  protected willUpdate(changed: PropertyValues): void {
    if (!changed.has("_config") && !changed.has("hass")) return;
    const deviceId = this._config?.device_id;
    if (deviceId !== this._deviceId) {
      this._deviceId = deviceId;
      this._serial++;
      this._busy = undefined;
      this._error = undefined;
    }
    // A failure is about a problem that is still there; once the checks pass
    // (the fix landed another way), the line would only confuse.
    if (this.hass && this._error && !this._problems().length) this._error = undefined;
  }

  private _problems(): SetupProblem[] {
    if (!this.hass) return [];
    const status = setupStatus(this.hass, this._config?.device_id);
    return status.kind === "checked" ? status.problems : [];
  }

  private async _apply(problems: SetupProblem[]): Promise<void> {
    const hass = this.hass;
    const fixable = problems.filter((p) => p.fix);
    if (!hass?.callService || this._busy || fixable.length === 0) return;
    const serial = this._serial;
    this._error = undefined;
    this._busy = fixable.length > 1 ? RECOMMENDED_PROGRESS : fixable[0].fix!.progress;
    const api = hass as unknown as Pick<CalibrationApiHass, "callService">;
    const results = await Promise.allSettled(
      fixable.map((p) => callService(api, p.fix!.domain, p.fix!.service, p.fix!.data))
    );
    const errors: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "rejected") {
        errors.push(`Could not change ${fixable[i].name}: ${await rejectionText(hass, r.reason)}`);
      }
    }
    if (serial !== this._serial) return;
    this._busy = undefined;
    this._error = errors.length ? errors.join(" ") : undefined;
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
    if (!name) return nothing;
    return html`<div class="subtitle">LD2450 · ${name}</div>`;
  }

  private _renderBody(): TemplateResult {
    const status = setupStatus(this.hass!, this._config?.device_id);
    switch (status.kind) {
      case "no_device":
        return html`<p class="hint">${NO_DEVICE_LINE}</p>`;
      case "nothing_to_check":
        return html`<p class="hint">${NOTHING_TO_CHECK_LINE}</p>`;
      case "offline":
        return html`<p class="hint">${OFFLINE_LINE}</p>`;
      case "waiting":
        return html`<p class="hint">${WAITING_LINE}</p>`;
      case "checked":
        return status.problems.length
          ? this._renderProblems(status.problems)
          : html`<p class="ok">${ALL_GOOD_LINE}</p>`;
    }
  }

  private _renderProblems(problems: SetupProblem[]): TemplateResult {
    const fixable = problems.filter((p) => p.fix);
    // More than one fix: one button for all of them instead of one each.
    const combined = fixable.length > 1;
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
        <div class="status" aria-live="polite">
          ${this._busy ? html`<p class="hint">${this._busy}</p>` : nothing}
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
  "Checks the LD2450 settings the zone map needs on an Apollo R PRO-1 or MTR-1 and fixes them with one click."
);
