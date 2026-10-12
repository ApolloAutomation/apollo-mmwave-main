import {
  LitElement,
  html,
  css,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, Ld2410CardConfig } from "../types";
import {
  resolveRadar,
  drawnStatesChanged,
  watchResolved,
  anyResolved,
  type ResolvedRadar,
  type WatchedIds,
} from "./resolution";
import { registerCustomCard, registerElement } from "../register";
import {
  GATE_ENERGY_CHART_SLOTS,
  chartLegendStyles,
  renderGateEnergyChart,
} from "../charts/gate-energy-chart";

export class ApolloLd2410GateEnergyCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: Ld2410CardConfig;

  private _resolved?: ResolvedRadar;
  /** The ids of the entities the chart draws, for the resolution above. */
  private _watched?: WatchedIds;

  public setConfig(config: Ld2410CardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 6;
  }

  static getStubConfig(): Ld2410CardConfig {
    return { type: "custom:apollo-radar-gate-energy-card" };
  }

  /** Skip the hass ticks (most of them) that touch none of the entities the
   *  chart draws. */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!changed.has("hass") || changed.has("_config")) return true;
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (!oldHass || !this.hass || !this._config) return true;
    // Registry changes can alter resolution — re-render.
    if (
      oldHass.entities !== this.hass.entities ||
      oldHass.devices !== this.hass.devices
    ) {
      return true;
    }
    const cached = this._resolved;
    this._resolved = resolveRadar(cached, this.hass, this._config);
    this._watched = watchResolved(this._watched, this._resolved, GATE_ENERGY_CHART_SLOTS);
    return drawnStatesChanged(
      oldHass,
      this.hass,
      cached,
      this._resolved,
      this._watched.ids
    );
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    const { map: m, profile, radarIds } = this._resolved;
    // A configured card whose device vanished must say so, not render blank.
    // So must one pointed at a device with no gate radar (only its ESP Reboot
    // button resolves), where the chart has nothing to draw.
    if (!anyResolved(this.hass, radarIds)) return this._renderNotFound();
    // The chip the card is for; an undetermined profile keeps the LD2410
    // wording the card has always used.
    const label = profile?.label ?? "LD2410";
    const chart = renderGateEnergyChart(this.hass, m, label);
    if (chart === nothing) return nothing;
    return html`
      <ha-card .header=${this._config.title ?? `${label} Gate Energy`}>
        <div class="wrap">${chart}</div>
      </ha-card>
    `;
  }

  private _renderNotFound(): TemplateResult {
    const label = this._resolved?.profile?.label ?? "LD2410";
    return html`
      <ha-card .header=${this._config?.title ?? `${label} Gate Energy`}>
        <div class="not-found">
          Apollo mmWave: device not found — check the card's device
          configuration.
        </div>
      </ha-card>
    `;
  }

  static styles = [
    chartLegendStyles,
    css`
      .wrap {
        padding: 4px 12px 12px;
      }
      .not-found {
        padding: 12px 16px 16px;
        color: var(--error-color, #db4437);
        font-size: 0.9em;
      }
      /* The chart's engineering-mode button; its position is inline so the
         chart template is self-contained. */
      button.overlay {
        font: inherit;
        font-size: 0.9em;
        font-weight: 500;
        cursor: pointer;
        border: none;
        border-radius: 4px;
        padding: 8px 14px;
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        white-space: nowrap;
      }
    `,
  ];
}

registerElement("apollo-radar-gate-energy-card", ApolloLd2410GateEnergyCard);
registerCustomCard(
  "apollo-radar-gate-energy-card",
  "Apollo Radar Gate Energy Chart",
  "Per-gate move/still energy chart for Apollo MSR (LD2410) & R-PRO (LD2412)."
);
