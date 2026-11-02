import { css, html, svg, nothing, type TemplateResult } from "lit";
import type { EntityMap, HomeAssistant } from "../types";
import { numState } from "./entity-read";
import { gateRegisterCount } from "./geometry";
import { callService, type ProfileKey } from "../calibration/api";
import { gateInUse, liveGateLimits } from "../calibration/model";

const MOVE_COLOR = "#4b0082";
const MOVE_THR_COLOR = "#9467bd";
const STILL_COLOR = "#274e13";
const STILL_THR_COLOR = "#8cb640";
const TXT2 = "var(--secondary-text-color, #9aa0a6)";

/** Styles for the `.chart-legend` row renderGateEnergyChart emits, for the
 *  card that hosts the chart to add to its own styles. */
export const chartLegendStyles = css`
  .chart-legend {
    font-size: 0.8em;
    color: var(--secondary-text-color);
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 6px;
  }
  .chart-verdict {
    font-size: 0.9em;
    margin-top: 6px;
  }
  .chart-verdict.note {
    color: var(--secondary-text-color);
    margin-top: 2px;
  }
`;

/** Opacity of a bar or threshold the radar ignores: beyond Max Move Gate or
 *  Max Still Gate on an LD2410, outside Min Gate to Max Gate on an LD2412. */
const OUT_OF_RANGE_OPACITY = 0.3;

export interface GateRow {
  index: number;
  move: number;
  still: number;
  moveThr?: number;
  stillThr?: number;
  /** Whether the radar uses this gate for moving or still targets. An unread
   *  range counts as in use, as in the calibration model. */
  moveInUse: boolean;
  stillInUse: boolean;
}

export interface GateEnergyModel {
  engineeringMode: boolean;
  /** The engineering-mode switch exists but reads "unavailable": the radar is
   *  offline, so the plot says so instead of asking for the switch. Only
   *  "unavailable" counts, matching strategy-core's isLive. */
  unavailable: boolean;
  present: boolean;
  gates: GateRow[];
  /** What the radar itself reports right now, from Radar Moving Target and
   *  Radar Still Target; undefined while either is missing or unread. */
  verdict?: string;
  /** Both target sensors read off: the radar reports nobody. */
  noTarget: boolean;
}

/** The radar's own answer when it reports nobody. */
export const NO_TARGET_VERDICT = "The radar reports no target.";
/** Under that answer while an in-range bar is above its threshold. The
 *  LD2410 drops a person who sits very still and often waits for movement
 *  before it reports them again, whatever the still energy does (seen on an
 *  MSR-2 in the field and in esphome#17620), so an outline and "no target"
 *  can sit side by side. Measured on the LD2410 only, so an LD2412 chart
 *  leaves it out. */
export const NEEDS_MOVEMENT_LINE =
  "Energy above a threshold does not always mean a target. Once the LD2410 loses" +
  " someone who sits still, it often needs them to move before it detects them again.";

/** The EntityMap slots whose states gateEnergyModel and renderGateEnergyChart
 *  read, so the gate-energy card re-renders only when one of them changes. */
export const GATE_ENERGY_CHART_SLOTS: readonly (keyof EntityMap)[] = [
  "engineering_mode",
  "move_threshold",
  "still_threshold",
  "move_energy",
  "still_energy",
  "max_move_distance",
  "max_still_distance",
  "moving_target",
  "still_target",
];

/** The radar's own answer under the bars, so an outline the radar does not
 *  agree with is easy to spot. */
function verdictLine(hass: HomeAssistant, m: EntityMap): string | undefined {
  const read = (id?: string) => (id ? hass.states[id]?.state : undefined);
  const moving = read(m.moving_target);
  const still = read(m.still_target);
  if (!["on", "off"].includes(moving ?? "") || !["on", "off"].includes(still ?? "")) {
    return undefined;
  }
  if (moving === "on" && still === "on") return "The radar reports a moving and a still target.";
  if (moving === "on") return "The radar reports a moving target.";
  if (still === "on") return "The radar reports a still target.";
  return NO_TARGET_VERDICT;
}

export function gateEnergyModel(
  hass: HomeAssistant,
  m: EntityMap,
  profile?: ProfileKey
): GateEnergyModel {
  let present = false;
  const limits = liveGateLimits(hass, m, profile, null);
  const seen = (id?: string) => {
    if (id && id in hass.states) present = true;
  };

  const count = gateRegisterCount(m);
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
      moveInUse: gateInUse(profile, limits, n, "move"),
      stillInUse: gateInUse(profile, limits, n, "still"),
    };
  });

  const verdict = verdictLine(hass, m);
  return {
    engineeringMode:
      !!m.engineering_mode && hass.states[m.engineering_mode]?.state === "on",
    unavailable:
      !!m.engineering_mode && hass.states[m.engineering_mode]?.state === "unavailable",
    present,
    gates,
    verdict,
    noTarget: verdict === NO_TARGET_VERDICT,
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
 *  two-line SVG text centered at 0.5. */
const BUTTON_PLOT_FRACTION = 0.8;

/** Y pixel for an energy value 0..100 (0 at the bottom axis). */
function yFor(energy: number): number {
  const clamped = Math.max(0, Math.min(MAX_ENERGY, energy));
  return PAD_T + PLOT_H * (1 - clamped / MAX_ENERGY);
}

export function renderGateEnergyChart(
  hass: HomeAssistant,
  m: EntityMap,
  label = "LD2410",
  profile?: ProfileKey
): TemplateResult | typeof nothing {
  const model = gateEnergyModel(hass, m, profile);
  if (!model.present) return nothing;

  const slot = (WIDTH - PAD_L) / model.gates.length;
  const barW = slot * 0.32;
  const baseY = yFor(0);

  // Whether an in-range bar is outlined, for the line under the radar's answer.
  let aboveInRange = false;
  const bars = model.gates.map((g) => {
    const cx = PAD_L + slot * g.index + slot / 2;
    const moveX = cx - barW - 2;
    const stillX = cx + 2;
    const els: TemplateResult[] = [];
    // A bar above its threshold is outlined in the threshold color, so the
    // walk test is visible on the chart. The radar's own answer under the
    // chart says whether it reports a target: an outline alone does not.
    // Lit drops an attribute whose value is `nothing`, so a quiet bar carries
    // no stroke at all. A gate the radar ignores (beyond Max Move Gate or Max
    // Still Gate, or outside Min Gate to Max Gate) is faded and never
    // outlined: its energy does not count, however high it is.
    const moveAbove =
      model.engineeringMode && g.moveInUse && g.moveThr !== undefined && g.move > g.moveThr;
    const stillAbove =
      model.engineeringMode && g.stillInUse && g.stillThr !== undefined && g.still > g.stillThr;
    if (moveAbove || stillAbove) aboveInRange = true;
    const moveOpacity = g.moveInUse ? nothing : OUT_OF_RANGE_OPACITY;
    const stillOpacity = g.stillInUse ? nothing : OUT_OF_RANGE_OPACITY;
    els.push(svg`
      <rect x=${moveX} y=${yFor(g.move)} width=${barW} height=${baseY - yFor(g.move)}
        fill=${MOVE_COLOR} opacity="${moveOpacity}"
        stroke="${moveAbove ? MOVE_THR_COLOR : nothing}"
        stroke-width="${moveAbove ? "2" : nothing}"></rect>
      <rect x=${stillX} y=${yFor(g.still)} width=${barW} height=${baseY - yFor(g.still)}
        fill=${STILL_COLOR} opacity="${stillOpacity}"
        stroke="${stillAbove ? STILL_THR_COLOR : nothing}"
        stroke-width="${stillAbove ? "2" : nothing}"></rect>
      <text x=${cx} y=${HEIGHT - 7} font-size="13" text-anchor="middle"
        fill=${TXT2}>G${g.index}</text>`);
    if (model.engineeringMode && g.moveThr !== undefined) {
      const ty = yFor(g.moveThr);
      const tx = moveX + barW / 2;
      // right-pointing triangle = move threshold
      els.push(svg`<path d="M ${tx - 5} ${ty - 5} L ${tx - 5} ${ty + 5} L ${tx + 5} ${ty} Z"
        fill=${MOVE_THR_COLOR} opacity="${moveOpacity}"></path>`);
    }
    if (model.engineeringMode && g.stillThr !== undefined) {
      const ty = yFor(g.stillThr);
      const tx = stillX + barW / 2;
      // left-pointing triangle = still threshold
      els.push(svg`<path d="M ${tx + 5} ${ty - 5} L ${tx + 5} ${ty + 5} L ${tx - 5} ${ty} Z"
        fill=${STILL_THR_COLOR} opacity="${stillOpacity}"></path>`);
    }
    return els;
  });

  const gridlines = [0, 25, 50, 75, 100].map(
    (v) => svg`
      <line x1=${PAD_L} y1=${yFor(v)} x2=${WIDTH} y2=${yFor(v)}
        stroke="var(--divider-color, #888)" stroke-width="1" opacity="0.3"></line>
      <text x=${PAD_L - 4} y=${yFor(v) + 3} font-size="11" text-anchor="end"
        fill=${TXT2}>${v}</text>`
  );

  // An unavailable switch is not an "off" one: the radar is offline, and
  // asking the user to turn the switch on would send them after a control
  // that cannot respond. The same dimmed plot says so instead.
  const [overlayLine1, overlayLine2] = model.unavailable
    ? ["Radar unavailable", "Waiting for the device to reconnect"]
    : ["Turn on Radar Engineering Mode", "to see gate energy values"];
  const overlay = model.engineeringMode
    ? nothing
    : svg`
        <rect x=${PAD_L} y=${PAD_T} width=${WIDTH - PAD_L} height=${PLOT_H}
          fill="var(--card-background-color, #000)" opacity="0.78"></rect>
        <text x=${(WIDTH + PAD_L) / 2} y=${PAD_T + PLOT_H / 2} font-size="20"
          font-weight="600" text-anchor="middle" fill="var(--primary-text-color, #e6e6e6)">
          <tspan x=${(WIDTH + PAD_L) / 2} dy="-4">${overlayLine1}</tspan>
          <tspan x=${(WIDTH + PAD_L) / 2} dy="28">${overlayLine2}</tspan>
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
      aria-label="${label} gate energy">
      <title>
        Per-gate signal energy (bars) vs your thresholds (triangles). A bar
        above its threshold is outlined. Faded gates are outside the range the
        radar uses, so their energy does not count. Turn on Radar Engineering
        Mode to see live energy.
      </title>
      ${gridlines} ${bars} ${overlay}
    </svg>
  `;

  // The legend explains fading only while some gate is faded, and the
  // radar's own answer shows only while the bars are live. The answer sits
  // in a wrapper so no binding is at the template root (happy-dom, the test
  // DOM, mis-clones root-level child-part markers).
  const faded = model.gates.some((g) => !g.moveInUse || !g.stillInUse);
  const verdict = model.engineeringMode && model.verdict ? model.verdict : undefined;
  const needsMovement = !!verdict && model.noTarget && aboveInRange && profile !== "ld2412";
  return html`
    <div class="chart-plot" style="position:relative">
      ${plot} ${overlayButton}
    </div>
    <div class="chart-legend">
      <span><span style="color:${MOVE_COLOR}">■</span> Move energy</span>
      <span><span style="color:${STILL_COLOR}">■</span> Still energy</span>
      <span><span style="color:${MOVE_THR_COLOR}">▶</span> Move threshold</span>
      <span><span style="color:${STILL_THR_COLOR}">◀</span> Still threshold</span>
      <span>outlined bar = above threshold</span>
      ${faded ? html`<span>faded = outside the radar's range (ignored)</span>` : nothing}
    </div>
    <div class="chart-answer">
      ${verdict ? html`<div class="chart-verdict">${verdict}</div>` : nothing}
      ${needsMovement ? html`<div class="chart-verdict note">${NEEDS_MOVEMENT_LINE}</div>` : nothing}
    </div>
  `;
}
