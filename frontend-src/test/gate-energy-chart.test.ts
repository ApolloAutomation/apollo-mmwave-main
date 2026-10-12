import { describe, it, expect, vi } from "vitest";
import { render } from "lit";
import { gateEnergyModel, renderGateEnergyChart } from "../src/charts/gate-energy-chart";
import { entityMapFromBaseName, entityMapFromDevice } from "../src/entities";
import { LD2412_PROFILE } from "../src/profiles";
import type { EntityMap, HomeAssistant, HassEntity } from "../src/types";
import { flat } from "./template-markup";

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

  it("reports an unavailable switch as unavailable, not as engineering mode", () => {
    const model = gateEnergyModel(hass({ [m.engineering_mode!]: ent("unavailable") }), m);
    expect(model.engineeringMode).toBe(false);
    expect(model.unavailable).toBe(true);
  });

  it("does not report an off, unknown or missing switch as unavailable", () => {
    expect(gateEnergyModel(hass({ [m.engineering_mode!]: ent("off") }), m).unavailable).toBe(false);
    // Only "unavailable" means offline, as in strategy-core's isLive.
    expect(gateEnergyModel(hass({ [m.engineering_mode!]: ent("unknown") }), m).unavailable).toBe(
      false
    );
    expect(gateEnergyModel(hass({}), m).unavailable).toBe(false);
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

  it("draws gate 8 energy when only its threshold is missing", () => {
    // HA leaves a disabled entity out of hass.entities, so a device-resolved
    // map whose g8 move threshold is disabled has move_threshold length 8.
    const ids = [...m.move_threshold, ...m.still_threshold, ...m.move_energy, ...m.still_energy]
      .filter((id) => id !== m.move_threshold[8]);
    const h: HomeAssistant = { states: {}, entities: {}, devices: { dev1: { name: "MSR-2" } } };
    for (const id of ids) {
      h.states[id] = ent("0");
      h.entities[id] = { device_id: "dev1" };
    }
    h.states[m.move_energy[8]] = ent("99");
    const map = entityMapFromDevice(h, "dev1")!;
    expect(map.move_threshold).toHaveLength(8);
    const model = gateEnergyModel(h, map);
    expect(model.gates).toHaveLength(9);
    expect(model.gates[8].move).toBe(99);
    expect(model.gates[8].moveThr).toBeUndefined();
    expect(model.gates[8].stillThr).toBe(0);
  });
});

/** Render the chart template into the document so focus and clicks work. */
function mountChart(h: HomeAssistant): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(renderGateEnergyChart(h, m), container);
  return container;
}

/** The <rect> tags of the energy bars (threshold markers are <path>). */
function barMarkup(h: HomeAssistant): string[] {
  return flat(renderGateEnergyChart(h, m)).match(/<rect[^>]*fill=#(?:4b0082|274e13)[^>]*>/g) ?? [];
}

describe("renderGateEnergyChart axis labels", () => {
  it("give the secondary text color a fallback, like the distance chart", () => {
    const markup = flat(
      renderGateEnergyChart(hass({ [m.engineering_mode!]: ent("on"), [m.move_energy[0]]: ent("0") }), m)
    );
    const fallback = "fill=var(--secondary-text-color, #9aa0a6)>";
    // Nine gate labels (G0..G8) and five gridline labels (0..100).
    for (let g = 0; g <= 8; g++) expect(markup).toContain(`${fallback}G${g}</text>`);
    for (const v of [0, 25, 50, 75, 100]) expect(markup).toContain(`${fallback}${v}</text>`);
    expect(markup).not.toContain('"var(--secondary-text-color)"');
  });
});

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

  it("says the radar is unavailable instead of asking for engineering mode", () => {
    const offline = flat(
      renderGateEnergyChart(
        hass({ [m.engineering_mode!]: ent("unavailable"), [m.move_energy[0]]: ent("unavailable") }),
        m
      )
    );
    expect(offline).toContain("Radar unavailable");
    expect(offline).toContain("Waiting for the device to reconnect");
    expect(offline).not.toContain("to see gate energy values");
    expect(offline).not.toContain(">Turn on Radar Engineering Mode<");

    const switchedOff = flat(renderGateEnergyChart(hass(off), m));
    expect(switchedOff).toContain(">Turn on Radar Engineering Mode<");
    expect(switchedOff).toContain("to see gate energy values");
    expect(switchedOff).not.toContain("Radar unavailable");
    expect(switchedOff).not.toContain("Waiting for the device to reconnect");
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

describe("renderGateEnergyChart gates, triangles and clamping", () => {
  /** Every gate of `map` at energy 30 under threshold 50, with the
   *  engineering-mode switch reading `mode`. */
  function allGates(map: EntityMap, mode: string): HomeAssistant {
    const states: Record<string, HassEntity> = { [map.engineering_mode!]: ent(mode) };
    for (const id of [...map.move_energy, ...map.still_energy]) states[id] = ent("30");
    for (const id of [...map.move_threshold, ...map.still_threshold]) states[id] = ent("50");
    return hass(states);
  }

  /** The threshold triangles (the chart's only <path> elements). */
  function triangles(markup: string): string[] {
    return markup.match(/<path d="M [^"]*"/g) ?? [];
  }

  it("draws 14 gate slots, G0..G13, for an LD2412", () => {
    const r = LD2412_PROFILE.entityMap("apollo_r_pro_1_w_abc123");
    const markup = flat(renderGateEnergyChart(allGates(r, "on"), r, "LD2412"));
    for (let g = 0; g <= 13; g++) expect(markup).toContain(`>G${g}</text>`);
    expect(markup).not.toContain(">G14</text>");
    expect(markup.match(/<rect[^>]*fill=#(?:4b0082|274e13)[^>]*>/g)).toHaveLength(28);
    expect(triangles(markup)).toHaveLength(28);
  });

  it("draws threshold triangles only while engineering mode is on", () => {
    expect(triangles(flat(renderGateEnergyChart(allGates(m, "on"), m)))).toHaveLength(18);
    expect(triangles(flat(renderGateEnergyChart(allGates(m, "off"), m)))).toEqual([]);
  });

  it("shows the overlay text only while engineering mode is off", () => {
    // The <title> also mentions turning on Radar Engineering Mode, so assert
    // on the overlay's second line, which only the overlay has.
    const OVERLAY = "to see gate energy values";
    expect(flat(renderGateEnergyChart(allGates(m, "off"), m))).toContain(OVERLAY);
    expect(flat(renderGateEnergyChart(allGates(m, "on"), m))).not.toContain(OVERLAY);
  });

  it("clamps energies to the 0..100 plot", () => {
    const at = (move: string, still: string) =>
      flat(
        renderGateEnergyChart(
          hass({
            [m.engineering_mode!]: ent("on"),
            [m.move_energy[0]]: ent(move),
            [m.still_energy[0]]: ent(still),
          }),
          m
        )
      );
    // 150 draws as a full bar and -20 as an empty one, never past the axes.
    expect(at("150", "-20")).toBe(at("100", "0"));
    expect(at("150", "-20")).not.toMatch(/height=-/);
  });
});
