import { describe, it, expect } from "vitest";
import { nothing, render, type TemplateResult } from "lit";
import {
  DISTANCE_CHART_SLOTS,
  distanceModel,
  renderDistanceChart,
} from "../src/charts/distance-chart";
import { entityMapFromBaseName, entityMapFromDevice } from "../src/entities";
import { LD2410_PROFILE, LD2412_PROFILE } from "../src/profiles";
import type { Uom } from "../src/charts/unit-convert";
import type { EntityMap, HomeAssistant, HassEntity } from "../src/types";
import { flat } from "./template-markup";

const base = "apollo_msr_2_m4c4dd";
const m = entityMapFromBaseName(base);

function ent(state: string, uom?: string): HassEntity {
  return {
    entity_id: "x",
    state,
    attributes: uom ? { unit_of_measurement: uom } : {},
  };
}

function hass(states: Record<string, HassEntity>): HomeAssistant {
  return { states, entities: {}, devices: {} };
}

/** G1..Gn, the labels of n distance bands. */
function gateLabels(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `G${i + 1}`);
}

/** The labels of the Gates row's bands, left to right. Each band is an hsl()
 *  colored rect followed by its label, and no other row uses hsl(). */
function bandLabels(markup: string): string[] {
  return [...markup.matchAll(/fill=hsl\([^)]*\)><\/rect>\s*<text[^>]*>([^<]*)<\/text>/g)].map(
    (b) => b[1]
  );
}

/** The rotated axis tick labels, left to right, as [value, unit] pairs. */
function ticks(markup: string): [string, string][] {
  return [...markup.matchAll(/transform="rotate\(-45 [^"]*"[^>]*>([^ <]+) ([a-z]+)<\/text>/g)].map(
    (t) => [t[1], t[2]]
  );
}

describe("distanceModel", () => {
  it("uses gate size to compute range in chart unit (cm)", () => {
    const h = hass({ [m.gate_size!]: ent("0.75m") });
    const model = distanceModel(h, m, "cm");
    expect(model.gateSizeChart).toBeCloseTo(75, 4);
    expect(model.maxRange).toBeCloseTo(600, 4);
  });

  it("defaults gate size to 0.75m when absent", () => {
    const model = distanceModel(hass({}), m, "m");
    expect(model.gateSizeChart).toBeCloseTo(0.75, 6);
  });

  it("converts distance sensors from their own UOM into the chart unit", () => {
    const h = hass({
      [m.gate_size!]: ent("0.75m"),
      [m.still_distance!]: ent("1", "m"), // 1 m -> 100 cm
      [m.moving_distance!]: ent("50", "cm"),
    });
    const model = distanceModel(h, m, "cm");
    const still = model.bars.find((b) => b.label === "Still");
    const moving = model.bars.find((b) => b.label === "Moving");
    expect(still?.value).toBeCloseTo(100, 3);
    expect(moving?.value).toBeCloseTo(50, 3);
  });

  it("omits bars whose entity is missing", () => {
    const model = distanceModel(hass({ [m.gate_size!]: ent("0.75m") }), m, "cm");
    expect(model.bars).toHaveLength(0);
  });

  it("builds zone segments with occupancy", () => {
    const h = hass({
      [m.gate_size!]: ent("0.75m"),
      [m.zone_1_start!]: ent("0", "m"),
      [m.end_zone_1!]: ent("1", "m"),
      [m.end_zone_2!]: ent("2", "m"),
      [m.end_zone_3!]: ent("3", "m"),
      [m.zone_1_occupancy!]: ent("on"),
    });
    const model = distanceModel(h, m, "m");
    expect(model.zones).toHaveLength(3);
    expect(model.zones[0]).toMatchObject({ start: 0, end: 1, occupied: true });
    expect(model.zones[1].occupied).toBe(false);
  });

  it("computes max still/move distances from gate counts", () => {
    const h = hass({
      [m.gate_size!]: ent("0.75m"),
      [m.max_still_distance!]: ent("8"),
      [m.max_move_distance!]: ent("6"),
    });
    const model = distanceModel(h, m, "m");
    expect(model.maxStill).toBeCloseTo(6, 6); // 8 * 0.75
    expect(model.maxMove).toBeCloseTo(4.5, 6); // 6 * 0.75
  });

  // A device-resolved map sizes each gate array by that slot's highest
  // registered gate, and HA leaves disabled entities out of hass.entities.
  // Register every gate entity of the base-name map, plus the gate size and
  // max move, except the ones named in `omit`.
  function deviceMap(omit: string[], states: Record<string, HassEntity>) {
    const ids = [
      ...m.move_threshold,
      ...m.still_threshold,
      ...m.move_energy,
      ...m.still_energy,
      m.gate_size!,
      m.max_move_distance!,
    ].filter((id) => !omit.includes(id));
    const h: HomeAssistant = { states: {}, entities: {}, devices: { dev1: { name: "MSR-2" } } };
    for (const id of ids) {
      h.states[id] = states[id] ?? ent("0");
      h.entities[id] = { device_id: "dev1" };
    }
    return { h, map: entityMapFromDevice(h, "dev1")! };
  }

  it("keeps 8 bands when the g8 threshold is unregistered", () => {
    const { h, map } = deviceMap([m.move_threshold[8]], {
      [m.gate_size!]: ent("0.75m"),
      [m.max_move_distance!]: ent("8"),
    });
    expect(map.move_threshold).toHaveLength(8);
    expect(map.still_threshold).toHaveLength(9);
    const model = distanceModel(h, map, "m");
    expect(model.gateCount).toBe(8);
    expect(model.maxRange).toBeCloseTo(6, 6);
    expect(model.maxMove).toBeCloseTo(6, 6);
    expect(model.maxMove!).toBeLessThanOrEqual(model.maxRange + 1e-9);
    // The chart draws all 8 bands, not 7 with the G8 bar clamped to the edge.
    expect(bandLabels(flat(renderDistanceChart(h, map, "m")))).toEqual(gateLabels(8));
  });

  it("keeps 8 bands when a middle threshold is unregistered", () => {
    const { h, map } = deviceMap([m.move_threshold[3]], {
      [m.gate_size!]: ent("0.75m"),
    });
    expect(map.move_threshold[3]).toBeUndefined();
    const model = distanceModel(h, map, "m");
    expect(model.gateCount).toBe(8);
    expect(model.maxRange).toBeCloseTo(6, 6);
  });
});

describe("renderDistanceChart bands and ticks", () => {
  const ld2412 = LD2412_PROFILE.entityMap(base);

  function gates075(map: EntityMap): HomeAssistant {
    return hass({ [map.gate_size!]: ent("0.75m") });
  }

  it("renders nothing for a map with no gate entities", () => {
    const empty: EntityMap = {
      ...m,
      move_threshold: [],
      still_threshold: [],
      move_energy: [],
      still_energy: [],
    };
    const h = hass({ [m.gate_size!]: ent("0.75m"), [m.detection_distance!]: ent("1", "m") });
    expect(renderDistanceChart(h, empty, "m")).toBe(nothing);
  });

  it("renders meter ticks every 0.75 m from 0 to 6, with no repeats", () => {
    const t = ticks(flat(renderDistanceChart(gates075(m), m, "m")));
    // toFixed(0) once rendered these as "0, 1, 2, 2, 3, 4, 5, 5, 6".
    expect(t.map(([v]) => v)).toEqual(["0", "0.75", "1.5", "2.25", "3", "3.75", "4.5", "5.25", "6"]);
    expect(t.every(([, u]) => u === "m")).toBe(true);
  });

  it("renders inch ticks as distinct whole numbers", () => {
    const t = ticks(flat(renderDistanceChart(gates075(m), m, "in")));
    const values = t.map(([v]) => v);
    expect(values).toHaveLength(9);
    for (const v of values) expect(v).toMatch(/^\d+$/);
    expect(new Set(values).size).toBe(values.length);
    expect(t.every(([, u]) => u === "in")).toBe(true);
  });

  it("renders centimeter ticks from 0 to 600 in steps of 75", () => {
    const t = ticks(flat(renderDistanceChart(gates075(m), m, "cm")));
    expect(t.map(([v]) => v)).toEqual(Array.from({ length: 9 }, (_, i) => String(75 * i)));
  });

  it("labels the LD2410's 8 bands G1..G8, with no G0 or G9", () => {
    const markup = flat(renderDistanceChart(gates075(m), m, "m"));
    expect(bandLabels(markup)).toEqual(gateLabels(8));
    for (const g of gateLabels(8)) expect(markup).toContain(`>${g}<`);
    expect(markup).not.toContain(">G0<");
    expect(markup).not.toContain(">G9<");
    expect(ticks(markup)).toHaveLength(9);
  });

  it("labels the LD2412's 13 bands G1..G13, with 14 ticks and Max/Min Gate rows", () => {
    const h = hass({
      [ld2412.gate_size!]: ent("0.75m"),
      [ld2412.max_move_distance!]: ent("12"),
      [ld2412.max_still_distance!]: ent("1"),
    });
    const markup = flat(
      renderDistanceChart(h, ld2412, "m", LD2412_PROFILE.maxBarLabels, "LD2412")
    );
    expect(bandLabels(markup)).toEqual(gateLabels(13));
    for (const g of gateLabels(13)) expect(markup).toContain(`>${g}<`);
    expect(markup).not.toContain(">G0<");
    expect(markup).not.toContain(">G14<");
    expect(ticks(markup)).toHaveLength(14);
    expect(markup).toContain(">Max Gate</text>");
    expect(markup).toContain(">Min Gate</text>");
    expect(markup).not.toContain("Max Move");
    expect(markup).not.toContain("Max Still");
  });
});

describe("renderDistanceChart axis band", () => {
  // Layout constants from distance-chart.ts: rows start at TOP and each is
  // ROW_H tall, so everything below TOP + rows x ROW_H is the axis band.
  const TOP = 6;
  const ROW_H = 30;
  // A tick label is end-anchored at plotBottom + 13 and rotated -45 deg, so
  // the widest label ("6000 mm" / "9750 mm", ~47 px at 11 px Roboto) reaches
  // about 48 px below the plot. The band must hold it or the svg clips it.
  const NEEDED = 48;

  function axisBand(map: EntityMap, gateSize: string, unit: Uom): number {
    const h = hass({ [map.gate_size!]: ent(gateSize) });
    const container = document.createElement("div");
    render(renderDistanceChart(h, map, unit) as TemplateResult, container);
    // happy-dom drops the nested svg parts, but the outer viewBox is real.
    const viewBox = container.querySelector("svg")!.getAttribute("viewBox")!;
    const height = Number(viewBox.split(/\s+/)[3]);
    const model = distanceModel(h, map, unit);
    const rows =
      (model.zones.length ? 1 : 0) +
      model.bars.length +
      1 + // the Gates row
      (model.maxMove === undefined ? 0 : 1) +
      (model.maxStill === undefined ? 0 : 1);
    return height - (TOP + rows * ROW_H);
  }

  const maps: Record<string, EntityMap> = {
    LD2410: m,
    LD2412: LD2412_PROFILE.entityMap(base),
  };

  it.each([
    ["LD2410", "0.75m", "mm"],
    ["LD2410", "0.2m", "ft"],
    ["LD2410", "0.2m", "in"],
    ["LD2412", "0.75m", "mm"],
    ["LD2412", "0.2m", "in"],
  ] as [string, string, Uom][])(
    "fits rotated tick labels (%s, %s gates, %s)",
    (chip, gateSize, unit) => {
      expect(axisBand(maps[chip], gateSize, unit)).toBeGreaterThanOrEqual(NEEDED);
    }
  );
});

describe("renderDistanceChart max rows", () => {
  const ld2412 = LD2412_PROFILE.entityMap(base);
  const LIMIT = "the configured detection-range limit, shown as a gate number.";

  function ld2410Hass(): HomeAssistant {
    return hass({
      [m.gate_size!]: ent("0.75m"),
      [m.max_move_distance!]: ent("6"),
      [m.max_still_distance!]: ent("8"),
    });
  }

  function ld2412Hass(): HomeAssistant {
    return hass({
      [ld2412.gate_size!]: ent("0.75m"),
      [ld2412.max_move_distance!]: ent("12"),
      [ld2412.max_still_distance!]: ent("1"),
    });
  }

  /** The hover tooltip of every row, top to bottom. */
  function titles(markup: string): string[] {
    return [...markup.matchAll(/<title>([^<]*)<\/title>/g)].map((t) => t[1].trim());
  }

  /** The markup of the row whose tooltip starts with `tip`. */
  function rowWithTip(markup: string, tip: string): string {
    const row = markup.split("<g>").find((g) => g.includes(`<title>${tip}`));
    expect(row).toBeDefined();
    return row!;
  }

  it("keeps the LD2410 range-limit tooltip on both max rows", () => {
    const markup = flat(
      renderDistanceChart(ld2410Hass(), m, "m", LD2410_PROFILE.maxBarLabels, "LD2410", LD2410_PROFILE.maxBarTips)
    );
    expect(titles(markup).slice(-2)).toEqual([`Max Move: ${LIMIT}`, `Max Still: ${LIMIT}`]);
  });

  it("says the LD2412 Min Gate ignores the gates below it", () => {
    const markup = flat(
      renderDistanceChart(ld2412Hass(), ld2412, "m", LD2412_PROFILE.maxBarLabels, "LD2412", LD2412_PROFILE.maxBarTips)
    );
    expect(titles(markup).slice(-2)).toEqual([
      `Max Gate: ${LIMIT}`,
      "Min Gate: gates below this one are ignored for detection.",
    ]);
    expect(markup).not.toContain(`Min Gate: ${LIMIT}`);
  });

  it("explains the Gates row in plain sentences, with no em dash", () => {
    const markup = flat(renderDistanceChart(ld2410Hass(), m, "m"));
    expect(titles(markup)).toContain(
      "The radar splits its range into gates. Each colored segment is one distance bin (G1, G2, ...)."
    );
    expect(titles(markup).filter((t) => t.includes("\u2014"))).toEqual([]);
  });

  it("falls back to the range-limit tooltip when no tips are passed", () => {
    const markup = flat(
      renderDistanceChart(ld2412Hass(), ld2412, "m", LD2412_PROFILE.maxBarLabels, "LD2412")
    );
    expect(titles(markup).slice(-2)).toEqual([`Max Gate: ${LIMIT}`, `Min Gate: ${LIMIT}`]);
  });

  it("defaults the max row labels to the LD2410 profile's", () => {
    const byDefault = flat(renderDistanceChart(ld2410Hass(), m, "m"));
    expect(byDefault).toBe(
      flat(renderDistanceChart(ld2410Hass(), m, "m", LD2410_PROFILE.maxBarLabels))
    );
    expect(byDefault).toContain(">Max Move</text>");
    expect(byDefault).toContain(">Max Still</text>");
  });

  it("labels each max row with its gate number", () => {
    const markup = flat(renderDistanceChart(ld2410Hass(), m, "m"));
    const move = rowWithTip(markup, "Max Move:");
    const still = rowWithTip(markup, "Max Still:");
    expect(move).toContain(">G6</text>");
    expect(still).toContain(">G8</text>");
    // Not the distance the bar reaches (6 x 0.75 m, 8 x 0.75 m).
    expect(move).not.toContain("4.5 m");
    expect(still).not.toContain("6.0 m");
  });

  it("leaves a max row out when its gate is not numeric", () => {
    const h = ld2410Hass();
    h.states[m.max_still_distance!] = ent("unavailable");
    const markup = flat(renderDistanceChart(h, m, "m"));
    expect(titles(markup)).toContain(`Max Move: ${LIMIT}`);
    expect(markup).not.toContain("Max Still");
  });
});

// A distance sensor keeps a restored last value after an HA restart, while
// its target sensor reads off. On an empty-room MSR-1 the chart once drew
// "Detection 135.0 in" and "Still 179.5 in" bars from those old values.
describe("distance rows with no current target", () => {
  type Slot = "radar_target" | "moving_target" | "still_target";

  /** Old distances on every row, and each target sensor as given (left out = absent). */
  function staleHass(targets: Partial<Record<Slot, string>>): HomeAssistant {
    const states: Record<string, HassEntity> = {
      [m.gate_size!]: ent("0.75m"),
      [m.detection_distance!]: ent("135", "in"),
      [m.moving_distance!]: ent("42", "in"),
      [m.still_distance!]: ent("179.5", "in"),
    };
    for (const [slot, state] of Object.entries(targets) as [Slot, string][]) {
      states[m[slot]!] = ent(state);
    }
    return hass(states);
  }

  const ALL_OFF = { radar_target: "off", moving_target: "off", still_target: "off" };

  /** The markup of the row whose tooltip starts with `tip`. */
  function row(markup: string, tip: string): string {
    const found = markup.split("<g>").find((g) => g.includes(`<title>${tip}`));
    expect(found).toBeDefined();
    return found!;
  }

  /** The svg viewBox height, which grows with the number of rows. */
  function height(markup: string): number {
    const vb = /viewBox="0 0 \d+ (\d+)"/.exec(markup);
    expect(vb).not.toBeNull();
    return Number(vb![1]);
  }

  const ROWS: [string, Slot, string][] = [
    ["Detection", "radar_target", "Current distance to the detected target."],
    ["Moving", "moving_target", "Current distance to a moving target."],
    ["Still", "still_target", "Current distance to a still (stationary) target."],
  ];
  const READINGS: Record<string, number> = { Detection: 135, Moving: 42, Still: 179.5 };

  it.each(ROWS)("drops the %s distance when %s is off", (label, slot) => {
    const targets = { radar_target: "on", moving_target: "on", still_target: "on", [slot]: "off" };
    const model = distanceModel(staleHass(targets), m, "in");
    expect(model.bars.map((b) => b.label)).toEqual(["Detection", "Moving", "Still"]);
    for (const bar of model.bars) {
      if (bar.label === label) {
        expect(bar).toMatchObject({ noTarget: true, value: 0 });
      } else {
        expect(bar.noTarget).toBe(false);
        expect(bar.value).toBeCloseTo(READINGS[bar.label], 6);
      }
    }
  });

  it.each([["on"], ["unavailable"], ["unknown"]])(
    "keeps every distance when the target sensors read %s",
    (state) => {
      const targets = { radar_target: state, moving_target: state, still_target: state };
      const model = distanceModel(staleHass(targets), m, "in");
      expect(model.bars.map((b) => [b.label, b.noTarget, b.value])).toEqual([
        ["Detection", false, 135],
        ["Moving", false, 42],
        ["Still", false, 179.5],
      ]);
    }
  );

  it("keeps every distance when the target sensors are missing", () => {
    const model = distanceModel(staleHass({}), m, "in");
    expect(model.bars.every((b) => !b.noTarget)).toBe(true);
    expect(model.bars.map((b) => b.value)).toEqual([135, 42, 179.5]);
  });

  it("writes no target in place of the old distances, on dimmed rows", () => {
    const markup = flat(renderDistanceChart(staleHass(ALL_OFF), m, "in"));
    expect(markup).not.toContain("135.0 in");
    expect(markup).not.toContain("42.0 in");
    expect(markup).not.toContain("179.5 in");
    for (const [, , tip] of ROWS) {
      const r = row(markup, tip);
      expect(r).toContain(">no target</text>");
      expect(r).toContain("<g opacity=0.45>");
      expect(r).toContain(`<title>${tip} The radar reports no target right now.</title>`);
    }
  });

  it("dims only the row whose target sensor is off", () => {
    const targets = { radar_target: "on", moving_target: "on", still_target: "off" };
    const markup = flat(renderDistanceChart(staleHass(targets), m, "in"));
    expect(row(markup, "Current distance to the detected target.")).toContain(">135.0 in</text>");
    expect(row(markup, "Current distance to a moving target.")).toContain(">42.0 in</text>");
    const still = row(markup, "Current distance to a still (stationary) target.");
    expect(still).toContain(">no target</text>");
    expect(markup.match(/<g opacity=/g)).toHaveLength(1);
    expect(markup.match(/>no target</g)).toHaveLength(1);
  });

  it("keeps the rows, so the chart height does not change", () => {
    const on = { radar_target: "on", moving_target: "on", still_target: "on" };
    const withTargets = flat(renderDistanceChart(staleHass(on), m, "in"));
    const without = flat(renderDistanceChart(staleHass(ALL_OFF), m, "in"));
    expect(withTargets).not.toContain("no target");
    expect(withTargets).not.toContain("<g opacity=");
    expect(height(without)).toBe(height(withTargets));
  });

  it("leaves the gate bands alone", () => {
    const markup = flat(renderDistanceChart(staleHass(ALL_OFF), m, "in"));
    expect(bandLabels(markup)).toEqual(gateLabels(8));
    expect(ticks(markup)).toHaveLength(9);
  });

  it("watches the target sensors, so the card redraws when one changes", () => {
    expect(DISTANCE_CHART_SLOTS).toEqual(
      expect.arrayContaining(["radar_target", "moving_target", "still_target"])
    );
  });
});
