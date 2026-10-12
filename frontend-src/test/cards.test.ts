/**
 * The distance and gate-energy cards, mounted in happy-dom. These pin the
 * "device not found" guard: a card pointed at a device with no gate radar
 * must say so instead of rendering nothing. They also pin the default title,
 * which names the chip the card resolved to, and the render gate: each card
 * re-renders only for the entities its own chart draws.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { nothing } from "lit";
import { ApolloLd2410DistanceCard } from "../src/cards/distance-card";
import { ApolloLd2410GateEnergyCard } from "../src/cards/gate-energy-card";
import { entityIds, resolveRadar, watchedIds } from "../src/cards/resolution";
import { DISTANCE_CHART_SLOTS, renderDistanceChart } from "../src/charts/distance-chart";
import {
  GATE_ENERGY_CHART_SLOTS,
  chartLegendStyles,
  renderGateEnergyChart,
} from "../src/charts/gate-energy-chart";
import { LD2410_PROFILE, LD2412_PROFILE } from "../src/profiles";
import type { EntityMap, HassEntity, HomeAssistant } from "../src/types";
import { flat } from "./template-markup";

const NOT_FOUND = "device not found";
const AIR = "apollo_air_1_abc123";
const MSR = "apollo_msr_2_abc123";
const RPRO = "apollo_r_pro_1_w_abc123";
const RPRO_BARE = "apollo_r_pro_1_w_def456";

function hassWith(devices: Record<string, { name: string; model: string; ids: string[] }>): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  const entities: HomeAssistant["entities"] = {};
  const registry: HomeAssistant["devices"] = {};
  for (const [deviceId, d] of Object.entries(devices)) {
    registry[deviceId] = { name: d.name, manufacturer: "ApolloAutomation", model: d.model };
    for (const id of d.ids) {
      states[id] = { entity_id: id, state: "0", attributes: {} };
      entities[id] = { device_id: deviceId };
    }
  }
  return { states, entities, devices: registry };
}

/** An AIR-1 whose only entity the radar resolver classifies is ESP Reboot,
 *  beside an MSR-2 and an R-PRO-1 with their engineering switch and gate
 *  entities, and an R-PRO-1 that has only its ESP Reboot button. */
function hass(): HomeAssistant {
  const m = LD2410_PROFILE.entityMap(MSR);
  const r = LD2412_PROFILE.entityMap(RPRO);
  return hassWith({
    air: {
      name: "Office AIR-1",
      model: "AIR-1",
      ids: [`button.${AIR}_esp_reboot`, `sensor.${AIR}_co2`],
    },
    msr: {
      name: "Living Room MSR-2",
      model: "MSR-2",
      ids: [
        m.esp_reboot!,
        m.engineering_mode!,
        m.gate_size!,
        ...m.move_threshold,
        ...m.still_threshold,
        ...m.move_energy,
        ...m.still_energy,
      ],
    },
    rpro: {
      name: "Office R-PRO-1",
      model: "R-PRO-1-W",
      ids: [
        r.esp_reboot!,
        r.engineering_mode!,
        r.gate_size!,
        r.max_move_distance!,
        r.max_still_distance!,
        ...r.move_threshold,
        ...r.still_threshold,
        ...r.move_energy,
        ...r.still_energy,
      ],
    },
    rpro_bare: {
      name: "Hall R-PRO-1",
      model: "R-PRO-1-W",
      ids: [`button.${RPRO_BARE}_esp_reboot`],
    },
  });
}

type Card = ApolloLd2410DistanceCard | ApolloLd2410GateEnergyCard;

async function mount(card: Card, config: Record<string, unknown>): Promise<Card> {
  document.body.appendChild(card);
  card.setConfig({ type: "custom:x", ...config });
  card.hass = hass();
  await card.updateComplete;
  return card;
}

afterEach(() => {
  document.body.innerHTML = "";
});

const CARDS: [string, () => Card][] = [
  ["distance card", () => new ApolloLd2410DistanceCard()],
  ["gate-energy card", () => new ApolloLd2410GateEnergyCard()],
];

describe.each(CARDS)("%s", (_name, make) => {
  it("says device not found for a device_id whose only match is ESP Reboot", async () => {
    const card = await mount(make(), { device_id: "air" });
    const root = card.shadowRoot!;
    expect(root.querySelector("ha-card")).not.toBeNull();
    expect(root.textContent).toContain(NOT_FOUND);
  });

  it("says device not found for a base name with only an ESP Reboot button", async () => {
    const card = await mount(make(), { device_base_name: AIR });
    const root = card.shadowRoot!;
    expect(root.textContent).toContain(NOT_FOUND);
    expect(root.querySelector("svg")).toBeNull();
  });

  it("renders the chart for an MSR-2", async () => {
    const card = await mount(make(), { device_id: "msr" });
    const root = card.shadowRoot!;
    expect(root.querySelector("ha-card")).not.toBeNull();
    expect(root.querySelector("svg")).not.toBeNull();
    expect(root.textContent).not.toContain(NOT_FOUND);
  });
});

// The card's default title and the chart's aria-label name the chip the card
// resolved to, as the strategy's own titles do; LD2410 stays the fallback.
const TITLED: [string, () => Card, string][] = [
  ["distance card", () => new ApolloLd2410DistanceCard(), "Distances"],
  ["gate-energy card", () => new ApolloLd2410GateEnergyCard(), "Gate Energy"],
];

function header(card: Card): unknown {
  return (card.shadowRoot!.querySelector("ha-card") as unknown as { header?: unknown }).header;
}

describe.each(TITLED)("%s title", (_name, make, what) => {
  it("names the LD2412 for an R-PRO-1 when the config has no title", async () => {
    const card = await mount(make(), { device_id: "rpro" });
    expect(header(card)).toBe(`LD2412 ${what}`);
    expect(card.shadowRoot!.querySelector("svg")?.getAttribute("aria-label")).toBe(
      `LD2412 ${what.toLowerCase()}`
    );
  });

  it("names the LD2410 for an MSR-2 when the config has no title", async () => {
    const card = await mount(make(), { device_id: "msr" });
    expect(header(card)).toBe(`LD2410 ${what}`);
    expect(card.shadowRoot!.querySelector("svg")?.getAttribute("aria-label")).toBe(
      `LD2410 ${what.toLowerCase()}`
    );
  });

  it("uses an explicit title over the chip name", async () => {
    const card = await mount(make(), { device_id: "rpro", title: "Office radar" });
    expect(header(card)).toBe("Office radar");
  });

  it("names the registry's chip on the device-not-found card", async () => {
    const card = await mount(make(), { device_id: "rpro_bare" });
    expect(card.shadowRoot!.textContent).toContain(NOT_FOUND);
    expect(header(card)).toBe(`LD2412 ${what}`);
  });

  it("keeps the LD2410 title when no profile resolves", async () => {
    const card = await mount(make(), { device_id: "air" });
    expect(card.shadowRoot!.textContent).toContain(NOT_FOUND);
    expect(header(card)).toBe(`LD2410 ${what}`);
  });
});

describe("card picker and chart styles", () => {
  it("lists both cards in window.customCards once, with the docs link", () => {
    const cards = (window as any).customCards as { type: string }[];
    for (const [type, name] of [
      ["apollo-radar-distance-card", "Apollo Radar Distance Chart"],
      ["apollo-radar-gate-energy-card", "Apollo Radar Gate Energy Chart"],
    ]) {
      const entries = cards.filter((c) => c.type === type);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        name,
        documentationURL: "https://github.com/ApolloAutomation/apollo-mmwave-main",
      });
      expect(entries[0]).toHaveProperty("description");
    }
  });

  it("styles the gate-energy chart's legend from the chart module", () => {
    const styles = ApolloLd2410GateEnergyCard.styles as unknown[];
    expect(styles).toContain(chartLegendStyles);
    expect(String(chartLegendStyles)).toContain(".chart-legend");
  });

  it("passes the profile's max-row tooltips to the distance chart", async () => {
    // The R-PRO-1 fixture registers both range gates (state "0"), so the
    // chart draws the Max Gate and Min Gate rows.
    const card = await mount(new ApolloLd2410DistanceCard(), { device_id: "rpro" });
    const markup = flat((card as unknown as { render(): unknown }).render());
    expect(markup).toContain("<title>Min Gate: gates below this one are ignored for detection.</title>");
  });
});

// ---------------------------------------------------------------------------
// Render gate: a card re-renders only for the entities its chart draws, so an
// engineering-mode energy tick does not redraw the distance chart, nor a
// distance tick the gate-energy chart.
// ---------------------------------------------------------------------------

/** A state for `id` that takes every branch of both charts: numeric
 *  distances and zone bounds in meters, occupied zones, a gate size, and
 *  engineering mode on. */
function liveState(id: string, n: number): HassEntity {
  const domain = id.slice(0, id.indexOf("."));
  if (domain === "switch" || domain === "binary_sensor") {
    return { entity_id: id, state: "on", attributes: {} };
  }
  if (domain === "select") return { entity_id: id, state: "0.75m", attributes: {} };
  if (domain === "button") return { entity_id: id, state: "unknown", attributes: {} };
  return { entity_id: id, state: String((n % 5) + 1), attributes: { unit_of_measurement: "m" } };
}

/** One registered device with a live state for every id of `m`. */
function liveHass(m: EntityMap, model: string): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  const entities: HomeAssistant["entities"] = {};
  entityIds(m).forEach((id, n) => {
    states[id] = liveState(id, n);
    entities[id] = { device_id: "dev" };
  });
  return {
    states,
    entities,
    devices: { dev: { name: "Radar", manufacturer: "ApolloAutomation", model } },
    config: { unit_system: { length: "km" } },
  };
}

/** `h` after HA replaced just `id`'s state object, with a new value. */
function tick(h: HomeAssistant, id: string): HomeAssistant {
  const old = h.states[id];
  const state = old.state === "on" ? "off" : old.state === "off" ? "on" : `${old.state}0`;
  return { ...h, states: { ...h.states, [id]: { ...old, state } } };
}

/** Hand `next` to the card and report whether it called render() for it. */
async function rendersFor(card: Card, next: HomeAssistant): Promise<boolean> {
  const spy = vi.spyOn(card as unknown as { render(): unknown }, "render");
  card.hass = next;
  await card.updateComplete;
  const called = spy.mock.calls.length > 0;
  spy.mockRestore();
  return called;
}

const GATED: [string, () => Card, readonly (keyof EntityMap)[]][] = [
  ["distance card", () => new ApolloLd2410DistanceCard(), DISTANCE_CHART_SLOTS],
  ["gate-energy card", () => new ApolloLd2410GateEnergyCard(), GATE_ENERGY_CHART_SLOTS],
];

describe.each(GATED)("%s render gate", (name, make, slots) => {
  const config = { type: "custom:x", device_id: "dev" };
  const msrHass = liveHass(LD2410_PROFILE.entityMap(MSR), "MSR-2");
  const map = resolveRadar(undefined, msrHass, config).map;
  const drawn = watchedIds(map, slots);
  const undrawn = entityIds(map).filter((id) => !drawn.includes(id));

  async function mountLive(h: HomeAssistant): Promise<Card> {
    const card = make();
    document.body.appendChild(card);
    card.setConfig(config);
    card.hass = h;
    await card.updateComplete;
    return card;
  }

  it("partitions the device's entities into drawn and undrawn ones", () => {
    if (name === "distance card") {
      expect(undrawn).toEqual(expect.arrayContaining([
        map.engineering_mode,
        ...map.move_energy,
        ...map.still_energy,
        ...map.move_threshold,
        ...map.still_threshold,
      ]));
      expect(drawn).toContain(map.detection_distance);
    } else {
      expect(undrawn).toEqual(expect.arrayContaining([
        map.gate_size,
        map.detection_distance,
        map.moving_distance,
        map.still_distance,
        map.zone_1_start,
        map.end_zone_3,
        map.zone_2_occupancy,
        map.max_move_distance,
        map.max_still_distance,
      ]));
      expect(drawn).toContain(map.move_energy[3]);
    }
  });

  it("does not re-render for a tick of an entity its chart does not draw", async () => {
    let h = msrHass;
    const card = await mountLive(h);
    expect(card.shadowRoot!.querySelector("svg")).not.toBeNull();
    const rendered: string[] = [];
    for (const id of undrawn) {
      h = tick(h, id);
      if (await rendersFor(card, h)) rendered.push(id);
    }
    expect(rendered).toEqual([]);
  });

  it("re-renders for a tick of each entity its chart draws", async () => {
    let h = msrHass;
    const card = await mountLive(h);
    const skipped: string[] = [];
    for (const id of drawn) {
      h = tick(h, id);
      if (!(await rendersFor(card, h))) skipped.push(id);
    }
    expect(skipped).toEqual([]);
  });

  it("re-renders when the entity or device registry is replaced", async () => {
    const card = await mountLive(msrHass);
    expect(await rendersFor(card, { ...msrHass, entities: { ...msrHass.entities } })).toBe(true);
    expect(await rendersFor(card, { ...card.hass!, devices: { ...msrHass.devices } })).toBe(true);
    // Still gated after the registries were replaced and resolved again.
    expect(await rendersFor(card, tick(card.hass!, undrawn[0]))).toBe(false);
    expect(await rendersFor(card, tick(card.hass!, drawn[0]))).toBe(true);
  });

  it("re-renders when an undrawn radar entity ends the device-not-found state", async () => {
    // Registered, but no states yet: the card says the device is not found.
    const card = await mountLive({ ...msrHass, states: {} });
    expect(card.shadowRoot!.textContent).toContain(NOT_FOUND);
    const id = undrawn.find((u) => u !== map.esp_reboot)!;
    const arrived: HomeAssistant = {
      ...card.hass!,
      states: { [id]: msrHass.states[id] },
    };
    expect(await rendersFor(card, arrived)).toBe(true);
    expect(card.shadowRoot!.textContent).not.toContain(NOT_FOUND);
  });
});

describe("distance card render gate and server config", () => {
  it("re-renders when hass.config is replaced (the default unit may change)", async () => {
    const h = liveHass(LD2410_PROFILE.entityMap(MSR), "MSR-2");
    const card = new ApolloLd2410DistanceCard();
    document.body.appendChild(card);
    card.setConfig({ type: "custom:x", device_id: "dev" });
    card.hass = h;
    await card.updateComplete;
    expect(
      await rendersFor(card, { ...h, config: { unit_system: { length: "mi" } } })
    ).toBe(true);
  });
});

describe("distance card render gate and a base-name fallback", () => {
  it("re-renders when the LD2412 switch alone arrives and the chip detection changes", async () => {
    // Base-name config, nothing registered: the chip is detected from which
    // engineering-mode switch is in states. Without one it falls back to the
    // LD2410 ids, none of which exist for an R-PRO-1, so the card says the
    // device is not found although its LD2412 distance entities are there.
    const r = LD2412_PROFILE.entityMap(RPRO);
    const live = liveHass(r, "R-PRO-1-W");
    const { [r.engineering_mode!]: eng, ...withoutSwitch } = live.states;
    const before: HomeAssistant = { states: withoutSwitch, entities: {}, devices: {} };
    const card = new ApolloLd2410DistanceCard();
    document.body.appendChild(card);
    card.setConfig({ type: "custom:x", device_base_name: RPRO });
    card.hass = before;
    await card.updateComplete;
    expect(card.shadowRoot!.textContent).toContain(NOT_FOUND);

    // The switch is not drawn by the distance chart, but it re-resolves the
    // card onto the LD2412 map, so the card must re-render.
    const after: HomeAssistant = {
      ...before,
      states: { ...before.states, [r.engineering_mode!]: eng },
    };
    expect(await rendersFor(card, after)).toBe(true);
    expect(card.shadowRoot!.textContent).not.toContain(NOT_FOUND);
    expect(header(card)).toBe("LD2412 Distances");
  });
});

/** `m` behind a Proxy that records each slot whose entity ids are read: a
 *  scalar slot when it is read, a gate array only when one of its entries is
 *  (its length alone is the gate count, which comes from the map, not from
 *  states). */
function recordingMap(m: EntityMap): { map: EntityMap; read: Set<keyof EntityMap> } {
  const read = new Set<keyof EntityMap>();
  const map = new Proxy(m, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver);
      if (typeof key !== "string") return v;
      const slot = key as keyof EntityMap;
      if (!Array.isArray(v)) {
        read.add(slot);
        return v;
      }
      return new Proxy(v, {
        get(arr, k, r) {
          if (typeof k === "string" && /^\d+$/.test(k)) read.add(slot);
          return Reflect.get(arr, k, r);
        },
      });
    },
  });
  return { map, read };
}

// Every slot whose state a chart reads must be in its card's watch list, or
// the card would keep drawing a stale value when that entity changes.
describe("chart slot lists cover every state the chart reads", () => {
  const DEVICES: [string, EntityMap, string][] = [
    ["MSR-2 (LD2410)", LD2410_PROFILE.entityMap(MSR), "MSR-2"],
    ["R-PRO-1 (LD2412)", LD2412_PROFILE.entityMap(RPRO), "R-PRO-1-W"],
  ];

  describe.each(DEVICES)("%s", (_name, m, model) => {
    const on = liveHass(m, model);
    const off: HomeAssistant = {
      ...on,
      callService: async () => undefined,
      states: {
        ...on.states,
        [m.engineering_mode!]: { ...on.states[m.engineering_mode!], state: "off" },
      },
    };

    it.each([
      ["on", on],
      ["off", off],
    ])("distance chart, engineering mode %s", (_mode, h) => {
      const { map, read } = recordingMap(m);
      expect(renderDistanceChart(h, map, "m")).not.toBe(nothing);
      expect(read).toContain("gate_size");
      expect(read).toContain("detection_distance");
      expect([...read].filter((s) => !DISTANCE_CHART_SLOTS.includes(s))).toEqual([]);
    });

    it.each([
      ["on", on],
      ["off", off],
    ])("gate-energy chart, engineering mode %s", (_mode, h) => {
      const { map, read } = recordingMap(m);
      expect(renderGateEnergyChart(h, map)).not.toBe(nothing);
      expect(read).toContain("engineering_mode");
      expect(read).toContain("move_energy");
      expect([...read].filter((s) => !GATE_ENERGY_CHART_SLOTS.includes(s))).toEqual([]);
    });
  });
});
