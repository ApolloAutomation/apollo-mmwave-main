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
import { registerElement } from "../register";
import { DISTANCE_CHART_SLOTS, renderDistanceChart } from "../charts/distance-chart";
import { defaultDistanceUnit, isValidUom, type Uom } from "../charts/unit-convert";

export class ApolloLd2410DistanceCard extends LitElement {
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
    return { type: "custom:apollo-radar-distance-card" };
  }

  /** Skip the hass ticks (most of them) that touch none of the entities the
   *  chart draws. */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!changed.has("hass") || changed.has("_config")) return true;
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (!oldHass || !this.hass || !this._config) return true;
    // Registry or server-config changes can alter resolution/units — re-render.
    if (
      oldHass.entities !== this.hass.entities ||
      oldHass.devices !== this.hass.devices ||
      oldHass.config !== this.hass.config
    ) {
      return true;
    }
    const cached = this._resolved;
    this._resolved = resolveRadar(cached, this.hass, this._config);
    this._watched = watchResolved(this._watched, this._resolved, DISTANCE_CHART_SLOTS);
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
    const unit: Uom = isValidUom(this._config.distance_unit)
      ? this._config.distance_unit
      : defaultDistanceUnit(this.hass);
    // The chip the card is for; an undetermined profile keeps the LD2410
    // wording the card has always used.
    const label = profile?.label ?? "LD2410";
    const chart = renderDistanceChart(this.hass, m, unit, profile?.maxBarLabels, label);
    if (chart === nothing) return nothing;
    return html`
      <ha-card .header=${this._config.title ?? `${label} Distances`}>
        <div class="wrap">${chart}</div>
      </ha-card>
    `;
  }

  private _renderNotFound(): TemplateResult {
    const label = this._resolved?.profile?.label ?? "LD2410";
    return html`
      <ha-card .header=${this._config?.title ?? `${label} Distances`}>
        <div class="not-found">
          Apollo mmWave: device not found — check the card's device
          configuration.
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    .wrap {
      padding: 4px 12px 12px;
    }
    .not-found {
      padding: 12px 16px 16px;
      color: var(--error-color, #db4437);
      font-size: 0.9em;
    }
  `;
}

registerElement("apollo-radar-distance-card", ApolloLd2410DistanceCard);

const customCards = ((window as any).customCards =
  (window as any).customCards || []);
if (!customCards.some((c: { type?: string }) => c.type === "apollo-radar-distance-card")) {
  customCards.push({
    type: "apollo-radar-distance-card",
    name: "Apollo Radar Distance Chart",
    description: "Distance / zone chart for Apollo MSR (LD2410) & R-PRO (LD2412).",
    documentationURL: "https://github.com/ApolloAutomation/apollo-mmwave-main",
  });
}
