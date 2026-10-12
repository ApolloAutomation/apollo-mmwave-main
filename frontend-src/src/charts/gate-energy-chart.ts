import { html, svg, nothing, type TemplateResult } from "lit";
import type { EntityMap, HomeAssistant } from "../types";
import { numState } from "./entity-read";
import { callService } from "../calibration/api";

const MOVE_COLOR = "#4b0082";
const MOVE_THR_COLOR = "#9467bd";
const STILL_COLOR = "#274e13";
const STILL_THR_COLOR = "#8cb640";

export interface GateRow {
  index: number;
  move: number;
  still: number;
  moveThr?: number;
  stillThr?: number;
}

export interface GateEnergyModel {
  engineeringMode: boolean;
  present: boolean;
  gates: GateRow[];
}

export function gateEnergyModel(hass: HomeAssistant, m: EntityMap): GateEnergyModel {
  let present = false;
  const seen = (id?: string) => {
    if (id && id in hass.states) present = true;
  };

  const count = m.move_threshold.length;
  const gates: GateRow[] = Array.from({ length: count }, (_, n) => {
    seen(m.move_energy[n]);
    seen(m.still_energy[n]);
    seen(m.move_threshold[n]);
    seen(m.still_threshold[n]);
    return {
      index: n,
      move: numState(hass, m.move_energy[n]) ?? 0,
      still: numState(hass, m.still_energy[n]) ?? 0,
      moveThr: numState(hass, m.move_threshold[n]),
      stillThr: numState(hass, m.still_threshold[n]),
    };
  });

  return {
    engineeringMode:
      !!m.engineering_mode && hass.states[m.engineering_mode]?.state === "on",
    present,
    gates,
  };
}

const WIDTH = 470;
const HEIGHT = 220;
const PAD_L = 26;
const PAD_B = 24;
const PAD_T = 10;
const PLOT_H = HEIGHT - PAD_B - PAD_T;
const MAX_ENERGY = 100;
/** Where the overlay button sits, as a fraction of the plot height: below the
 *  two-line SVG text centred at 0.5. */
const BUTTON_PLOT_FRACTION = 0.8;

/** Y pixel for an energy value 0..100 (0 at the bottom axis). */
function yFor(energy: number): number {
  const clamped = Math.max(0, Math.min(MAX_ENERGY, energy));
  return PAD_T + PLOT_H * (1 - clamped / MAX_ENERGY);
}

export function renderGateEnergyChart(
  hass: HomeAssistant,
  m: EntityMap
): TemplateResult | typeof nothing {
  const model = gateEnergyModel(hass, m);
  if (!model.present) return nothing;

  const slot = (WIDTH - PAD_L) / model.gates.length;
  const barW = slot * 0.32;
  const baseY = yFor(0);

  const bars = model.gates.map((g) => {
    const cx = PAD_L + slot * g.index + slot / 2;
    const moveX = cx - barW - 2;
    const stillX = cx + 2;
    const els: TemplateResult[] = [];
    // A bar above its threshold is the gate detecting right now; outline it
    // in the threshold colour so the walk test is visible on the chart.
    // Lit drops an attribute whose value is `nothing`, so a quiet bar carries
    // no stroke at all.
    const moveAbove =
      model.engineeringMode && g.moveThr !== undefined && g.move > g.moveThr;
    const stillAbove =
      model.engineeringMode && g.stillThr !== undefined && g.still > g.stillThr;
    els.push(svg`
      <rect x=${moveX} y=${yFor(g.move)} width=${barW} height=${baseY - yFor(g.move)}
        fill=${MOVE_COLOR}
        stroke="${moveAbove ? MOVE_THR_COLOR : nothing}"
        stroke-width="${moveAbove ? "2" : nothing}"></rect>
      <rect x=${stillX} y=${yFor(g.still)} width=${barW} height=${baseY - yFor(g.still)}
        fill=${STILL_COLOR}
        stroke="${stillAbove ? STILL_THR_COLOR : nothing}"
        stroke-width="${stillAbove ? "2" : nothing}"></rect>
      <text x=${cx} y=${HEIGHT - 7} font-size="13" text-anchor="middle"
        fill="var(--secondary-text-color)">G${g.index}</text>`);
    if (model.engineeringMode && g.moveThr !== undefined) {
      const ty = yFor(g.moveThr);
      const tx = moveX + barW / 2;
      // right-pointing triangle = move threshold
      els.push(svg`<path d="M ${tx - 5} ${ty - 5} L ${tx - 5} ${ty + 5} L ${tx + 5} ${ty} Z"
        fill=${MOVE_THR_COLOR}></path>`);
    }
    if (model.engineeringMode && g.stillThr !== undefined) {
      const ty = yFor(g.stillThr);
      const tx = stillX + barW / 2;
      // left-pointing triangle = still threshold
      els.push(svg`<path d="M ${tx + 5} ${ty - 5} L ${tx + 5} ${ty + 5} L ${tx - 5} ${ty} Z"
        fill=${STILL_THR_COLOR}></path>`);
    }
    return els;
  });

  const gridlines = [0, 25, 50, 75, 100].map(
    (v) => svg`
      <line x1=${PAD_L} y1=${yFor(v)} x2=${WIDTH} y2=${yFor(v)}
        stroke="var(--divider-color, #888)" stroke-width="1" opacity="0.3"></line>
      <text x=${PAD_L - 4} y=${yFor(v) + 3} font-size="11" text-anchor="end"
        fill="var(--secondary-text-color)">${v}</text>`
  );

  const overlay = model.engineeringMode
    ? nothing
    : svg`
        <rect x=${PAD_L} y=${PAD_T} width=${WIDTH - PAD_L} height=${PLOT_H}
          fill="var(--card-background-color, #000)" opacity="0.78"></rect>
        <text x=${(WIDTH + PAD_L) / 2} y=${PAD_T + PLOT_H / 2} font-size="20"
          font-weight="600" text-anchor="middle" fill="var(--primary-text-color, #e6e6e6)">
          <tspan x=${(WIDTH + PAD_L) / 2} dy="-4">Turn on Radar Engineering Mode</tspan>
          <tspan x=${(WIDTH + PAD_L) / 2} dy="28">to see gate energy values</tspan>
        </text>`;

  // A real HTML button over the plot, not an SVG element with an ARIA role: a
  // `<g role="button">` inside `role="img"` is presentational to assistive
  // technology and unreachable by keyboard. The SVG keeps the explanatory
  // text; the button sits below it inside the dimmed plot area. There is no
  // "turn it off" line here: the calibration job turns the mode on for its
  // listen, and that line would invite a click in the middle of it. The
  // button is left out while the switch is missing or unavailable, where a
  // click could never work.
  const switchId = m.engineering_mode;
  const switchState = switchId ? hass.states[switchId]?.state : undefined;
  const canTurnOn =
    !model.engineeringMode &&
    !!switchId &&
    !!hass.callService &&
    switchState !== undefined &&
    switchState !== "unavailable";
  const buttonTop = ((PAD_T + PLOT_H * BUTTON_PLOT_FRACTION) / HEIGHT) * 100;
  const buttonLeft = ((PAD_L + (WIDTH - PAD_L) / 2) / WIDTH) * 100;
  // SPEC NOTE: the spec routes this click through the calibration
  // `callService` helper, whose default turns HA's error toast off because
  // the calibrate card renders rejections itself. The chart has nowhere to
  // show an error, so it asks the helper for HA's own toast, and catches the
  // rejection so it is not left unhandled. `tabindex="0"` repeats a native
  // button's default; it stays because happy-dom (the test DOM) reports -1
  // without it and the spec's test asserts tabIndex 0.
  const turnOn = () =>
    callService(
      hass as Required<Pick<HomeAssistant, "callService">>,
      "switch",
      "turn_on",
      { entity_id: switchId },
      true
    ).catch(() => undefined);
  const overlayButton = canTurnOn
    ? html`<button
        type="button"
        class="overlay"
        tabindex="0"
        style="position:absolute;left:${buttonLeft}%;top:${buttonTop}%;transform:translate(-50%,-50%)"
        @click=${turnOn}
      >
        Turn on Radar Engineering Mode
      </button>`
    : nothing;

  // The SVG is its own template on purpose: happy-dom (the test DOM) loses
  // Lit's child-part markers inside <svg>, which would shift every binding
  // that follows it. Browsers render both forms identically.
  const plot = html`
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" role="img"
      aria-label="LD2410 gate energy">
      <title>
        Per-gate signal energy (bars) vs your thresholds (triangles). A gate
        detects a target when its energy rises above the threshold. Turn on
        Radar Engineering Mode to see live energy.
      </title>
      ${gridlines} ${bars} ${overlay}
    </svg>
  `;

  return html`
    <div class="chart-plot" style="position:relative">
      ${plot} ${overlayButton}
    </div>
    <div class="chart-legend">
      <span><span style="color:${MOVE_COLOR}">■</span> Move energy</span>
      <span><span style="color:${STILL_COLOR}">■</span> Still energy</span>
      <span><span style="color:${MOVE_THR_COLOR}">▶</span> Move threshold</span>
      <span><span style="color:${STILL_THR_COLOR}">◀</span> Still threshold</span>
      <span>outlined bar = above threshold (detecting)</span>
    </div>
  `;
}
