import { describe, it, expect, vi } from "vitest";
import { nothing, render, type TemplateResult } from "lit";
import { gateEnergyModel, renderGateEnergyChart } from "../src/charts/gate-energy-chart";
import { entityMapFromBaseName } from "../src/entities";
import type { HomeAssistant, HassEntity } from "../src/types";

const base = "apollo_msr_2_m4c4dd";
const m = entityMapFromBaseName(base);

function ent(state: string): HassEntity {
  return { entity_id: "x", state, attributes: {} };
}

function hass(states: Record<string, HassEntity>): HomeAssistant {
  return { states, entities: {}, devices: {} };
}

describe("gateEnergyModel", () => {
  it("reports not present when no gate entities exist", () => {
    const model = gateEnergyModel(hass({}), m);
    expect(model.present).toBe(false);
    expect(model.gates).toHaveLength(9);
  });

  it("detects engineering mode on", () => {
    const h = hass({ [m.engineering_mode!]: ent("on") });
    expect(gateEnergyModel(h, m).engineeringMode).toBe(true);
  });

  it("reads energies (default 0) and thresholds per gate", () => {
    const h = hass({
      [m.move_energy[0]]: ent("42"),
      [m.still_energy[0]]: ent("17"),
      [m.move_threshold[0]]: ent("50"),
    });
    const model = gateEnergyModel(h, m);
    expect(model.present).toBe(true);
    expect(model.gates[0]).toMatchObject({ move: 42, still: 17, moveThr: 50 });
    expect(model.gates[0].stillThr).toBeUndefined();
    expect(model.gates[1].move).toBe(0);
  });
});

/** Render the chart template into the document so focus and clicks work. */
function mountChart(h: HomeAssistant): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(renderGateEnergyChart(h, m), container);
  return container;
}

/**
 * Serialise a Lit template result to its markup, bindings inlined. happy-dom
 * drops Lit's child-part markers inside <svg>, so the bars never reach the
 * DOM here; the template itself is what a browser renders, so assert on it.
 */
function flat(value: unknown): string {
  if (value === nothing || value === null || value === undefined || value === false) return "";
  if (Array.isArray(value)) return value.map(flat).join("");
  if (typeof value === "object" && "strings" in (value as object)) {
    const t = value as TemplateResult;
    return t.strings.reduce(
      (acc, s, i) => acc + s + (i < t.values.length ? flat(t.values[i]) : ""),
      ""
    );
  }
  return String(value);
}

/** The <rect> tags of the energy bars (threshold markers are <path>). */
function barMarkup(h: HomeAssistant): string[] {
  return flat(renderGateEnergyChart(h, m)).match(/<rect[^>]*fill=#(?:4b0082|274e13)[^>]*>/g) ?? [];
}

describe("renderGateEnergyChart engineering-mode overlay", () => {
  const off = { [m.engineering_mode!]: ent("off"), [m.move_energy[0]]: ent("0") };

  it("renders a real button only when hass.callService exists", () => {
    const without = mountChart(hass(off));
    expect(without.querySelector("button.overlay")).toBeNull();
    // The SVG text still explains what to do.
    expect(flat(renderGateEnergyChart(hass(off), m))).toContain("Turn on Radar Engineering Mode");

    const h: HomeAssistant = { ...hass(off), callService: vi.fn(async () => undefined) };
    const container = mountChart(h);
    const button = container.querySelector("button.overlay") as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.textContent?.trim()).toBe("Turn on Radar Engineering Mode");
    expect(button.getAttribute("type")).toBe("button");
    // Positioned over the plot, inside a relatively positioned wrapper.
    expect(button.parentElement?.style.position).toBe("relative");
    expect(button.style.position).toBe("absolute");
  });

  it("is keyboard reachable: tabIndex 0 and focus() lands on it", () => {
    const h: HomeAssistant = { ...hass(off), callService: vi.fn(async () => undefined) };
    const container = mountChart(h);
    const button = container.querySelector("button.overlay") as HTMLButtonElement;
    expect(button.tabIndex).toBe(0);
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("turns the engineering switch on through switch.turn_on, with HA's own error toast", () => {
    // The chart has nowhere to show a rejection, so unlike the calibrate
    // card it leaves notifyOnError on.
    const callService = vi.fn(async () => undefined);
    const container = mountChart({ ...hass(off), callService });
    (container.querySelector("button.overlay") as HTMLButtonElement).click();
    expect(callService).toHaveBeenCalledWith(
      "switch",
      "turn_on",
      { entity_id: m.engineering_mode },
      undefined,
      true
    );
  });

  it("catches a rejected turn-on instead of leaving it unhandled", async () => {
    const unhandled = vi.fn();
    // Node's process, which vitest runs the test in (no @types/node here).
    const node = (globalThis as any).process;
    node.on("unhandledRejection", unhandled);
    try {
      // A plain function, not vi.fn: a spy attaches its own handler to the
      // promises it returns, which would hide a missing catch.
      let calls = 0;
      const callService = () => {
        calls += 1;
        return Promise.reject({ code: "home_assistant_error", message: "Device is offline" });
      };
      const container = mountChart({ ...hass(off), callService });
      (container.querySelector("button.overlay") as HTMLButtonElement).click();
      expect(calls).toBe(1);
      // Node reports an unhandled rejection after the microtask queue drains.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      node.off("unhandledRejection", unhandled);
    }
  });

  it("leaves the button out while the switch is unavailable or missing", () => {
    const callService = vi.fn(async () => undefined);
    const unavailable = mountChart({
      ...hass({ [m.engineering_mode!]: ent("unavailable"), [m.move_energy[0]]: ent("0") }),
      callService,
    });
    expect(unavailable.querySelector("button.overlay")).toBeNull();
    const missing = mountChart({ ...hass({ [m.move_energy[0]]: ent("0") }), callService });
    expect(missing.querySelector("button.overlay")).toBeNull();
    // The SVG still explains why the plot is dimmed.
    expect(flat(renderGateEnergyChart(hass({ [m.move_energy[0]]: ent("0") }), m))).toContain(
      "Turn on Radar Engineering Mode"
    );
  });

  it("renders no button and no turn-off text once engineering mode is on", () => {
    const h: HomeAssistant = {
      ...hass({ [m.engineering_mode!]: ent("on"), [m.move_energy[0]]: ent("0") }),
      callService: vi.fn(async () => undefined),
    };
    const container = mountChart(h);
    expect(container.querySelector("button.overlay")).toBeNull();
    const markup = flat(renderGateEnergyChart(h, m)).toLowerCase();
    expect(markup).not.toContain("turn it off");
    expect(markup).not.toContain("turn off");
    expect(markup).not.toContain("turn on radar engineering mode");
  });
});

describe("renderGateEnergyChart threshold outline", () => {
  it("outlines a bar above its threshold and leaves one below plain", () => {
    const h = hass({
      [m.engineering_mode!]: ent("on"),
      [m.move_energy[0]]: ent("60"),
      [m.move_threshold[0]]: ent("50"),
      [m.still_energy[0]]: ent("10"),
      [m.still_threshold[0]]: ent("40"),
    });
    const [move, still] = barMarkup(h);
    expect(move).toContain('stroke-width="2"');
    expect(move).toContain('stroke="#9467bd"');
    expect(still).toContain('stroke-width=""');
    expect(still).not.toContain('stroke-width="2"');
    // Exactly one bar on the whole chart is outlined.
    expect(barMarkup(h).filter((r) => r.includes('stroke-width="2"'))).toHaveLength(1);
    expect(mountChart(h).textContent).toContain("outlined bar = above threshold (detecting)");
  });

  it("never outlines while engineering mode is off", () => {
    const h = hass({
      [m.engineering_mode!]: ent("off"),
      [m.move_energy[0]]: ent("60"),
      [m.move_threshold[0]]: ent("50"),
    });
    expect(barMarkup(h)).toHaveLength(18);
    expect(barMarkup(h).some((r) => r.includes('stroke-width="2"'))).toBe(false);
  });
});
