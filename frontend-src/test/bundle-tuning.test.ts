/// <reference types="vite/client" />
/**
 * The committed tuning bundle, www/apollo-radar-tuning.js, run as built.
 *
 * Every other card test imports the TypeScript sources, so none of them sees
 * what the bundler did. This one loads the file Home Assistant serves and
 * checks that it is one standalone module, that it defines every element its
 * sources register and lists its cards and strategy in the pickers, and that
 * the Lit cards render and then re-render when `hass` or a `@state` field
 * changes. The last part catches a TypeScript transform that emits decorated
 * fields as class fields: those shadow Lit's accessors, and the cards stop
 * updating after their first render.
 *
 * It also checks that the bundle defines its elements again through Home
 * Assistant's registry polyfill once the app boots, and that a second copy
 * of the bundle adds no second picker entry or element.
 *
 * The zone map bundle has its own file (bundle-zone-map.test.ts), so the two
 * bundles never register into the same window here. vitest.bundles.config.ts
 * runs the card and strategy suites against this bundle.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSync } from "vite";
// @ts-expect-error The committed bundle is plain JS with no type declarations.
import { CARD_VERSION } from "../../custom_components/apollo_mmwave/www/apollo-radar-tuning.js";
import bundleSource from "../../custom_components/apollo_mmwave/www/apollo-radar-tuning.js?raw";
import pkg from "../package.json";
import { registeredTags } from "./bundle-sources";
import { installRegistry, polyfillRegistry, tick } from "./registry-polyfill";

type Handler = (message: any) => void;

const CALIBRATION_SUBSCRIBE = "apollo_mmwave/calibration/subscribe";
const BASE = "apollo_msr_2_abc123";
const SWITCH = `switch.${BASE}_radar_engineering_mode`;
const GATES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const NOT_FOUND = "device not found";

/** An MSR-2 (LD2410) registered as device dev1, its engineering mode off. */
function msr2States(switchState = "off"): Record<string, any> {
  const ids = [
    `binary_sensor.${BASE}_radar_target`,
    `binary_sensor.${BASE}_radar_moving_target`,
    `binary_sensor.${BASE}_radar_still_target`,
    `sensor.${BASE}_radar_moving_distance`,
    `sensor.${BASE}_radar_still_distance`,
    `sensor.${BASE}_radar_detection_distance`,
    `number.${BASE}_radar_max_move_distance`,
    `number.${BASE}_radar_max_still_distance`,
    ...GATES.flatMap((g) => [
      `number.${BASE}_g${g}_move_threshold`,
      `number.${BASE}_g${g}_still_threshold`,
      `sensor.${BASE}_g${g}_move_energy`,
      `sensor.${BASE}_g${g}_still_energy`,
    ]),
  ];
  const states: Record<string, any> = {
    [SWITCH]: { entity_id: SWITCH, state: switchState, attributes: {} },
  };
  for (const id of ids) {
    states[id] = { entity_id: id, state: "20", attributes: { min: 0, max: 100, step: 1 } };
  }
  return states;
}

/** A hass with the MSR-2, a fake websocket and recorded subscriptions. */
function fakeHass(states: Record<string, any> = msr2States()) {
  const entities: Record<string, any> = {};
  for (const id of Object.keys(states)) entities[id] = { device_id: "dev1", platform: "esphome" };
  const handlers: Record<string, Handler[]> = {};
  return {
    states,
    entities,
    devices: { dev1: { name: "Living Room MSR-2", manufacturer: "ApolloAutomation", model: "MSR-2" } },
    config: { unit_system: { length: "km" } },
    handlers,
    callService: vi.fn(async () => undefined),
    callWS: vi.fn(async () => null),
    connection: {
      subscribeMessage: vi.fn(async (cb: Handler, msg: Record<string, any>) => {
        (handlers[msg.type] ||= []).push(cb);
        return () => undefined;
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  };
}

type FakeHass = ReturnType<typeof fakeHass>;

/** The same hass after a state change: HA hands cards a new object each time,
 *  with new `states` and the same registries. */
function withStates(hass: FakeHass, changes: Record<string, string>): FakeHass {
  const states = { ...hass.states };
  for (const [id, state] of Object.entries(changes)) states[id] = { ...states[id], state };
  return { ...hass, states };
}

function text(el: Element): string {
  return (el.shadowRoot?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Let the subscription promises and the following render settle. */
async function settle(el: any): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await el.updateComplete;
}

async function mount(tag: string, config: Record<string, unknown>, hass: unknown): Promise<any> {
  const el: any = document.createElement(tag);
  el.setConfig({ type: `custom:${tag}`, ...config });
  el.hass = hass;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("tuning bundle file", () => {
  it("is one ES module that imports nothing", () => {
    const { errors, module } = parseSync("apollo-radar-tuning.js", bundleSource, {
      sourceType: "module",
    });
    expect(errors).toEqual([]);
    expect(module.staticImports).toEqual([]);
    expect(module.dynamicImports).toEqual([]);
    expect(module.importMetas).toEqual([]);
  });

  it("was built from the current version", () => {
    // A version bump without a rebuild fails here as well as in CI's
    // bundle-sync step.
    expect(CARD_VERSION).toBe(pkg.version);
  });
});

describe("tuning bundle registration", () => {
  it("defines every element its sources register", () => {
    const tags = registeredTags("../src/index.ts");
    expect(tags).toEqual([
      "apollo-radar-calibrate-card",
      "apollo-radar-distance-card",
      "apollo-radar-gate-energy-card",
      "ll-strategy-dashboard-apollo-radar-tuning",
      "ll-strategy-section-apollo-radar-tuning",
      "ll-strategy-view-apollo-radar-tuning",
    ]);
    for (const tag of tags) expect(customElements.get(tag), tag).toBeDefined();
  });

  it("leaves the zone map bundle's elements to that bundle", () => {
    for (const tag of registeredTags("../src/zone-map/card.ts")) {
      expect(customElements.get(tag), tag).toBeUndefined();
    }
  });

  it("lists each of its three cards in the card picker once", () => {
    const cards = (window as any).customCards as { type: string; name: string }[];
    expect(cards.map((c) => [c.type, c.name])).toEqual([
      ["apollo-radar-distance-card", "Apollo Radar Distance Chart"],
      ["apollo-radar-gate-energy-card", "Apollo Radar Gate Energy Chart"],
      ["apollo-radar-calibrate-card", "Apollo Radar Auto-Calibrate"],
    ]);
  });

  it("lists the dashboard strategy in the strategy picker", () => {
    expect((window as any).customStrategies).toEqual([
      expect.objectContaining({ type: "apollo-radar-tuning", strategyType: "dashboard" }),
    ]);
  });
});

describe("tuning bundle Lit cards", () => {
  const LIT_CARDS = [
    "apollo-radar-calibrate-card",
    "apollo-radar-distance-card",
    "apollo-radar-gate-energy-card",
  ];

  it.each(LIT_CARDS)("%s keeps its reactive properties on Lit's accessors", (tag) => {
    const el: any = document.createElement(tag);
    const props = [...el.constructor.elementProperties.keys()];
    expect(props).toContain("hass");
    expect(props).toContain("_config");
    // A decorated field compiled as a class field would be an own property of
    // the instance, hiding the accessor Lit put on the prototype.
    for (const prop of props) {
      expect(Object.getOwnPropertyDescriptor(el, prop), prop).toBeUndefined();
    }
  });

  it("calibrate card renders, then re-renders for a new hass and a pushed payload", async () => {
    const hass = fakeHass();
    const card = await mount("apollo-radar-calibrate-card", { device_id: "dev1" }, hass);
    const push = (payload: Record<string, unknown>) => {
      const subscribers = hass.handlers[CALIBRATION_SUBSCRIBE];
      subscribers[subscribers.length - 1]({
        job: null,
        snapshots: [],
        last_result: null,
        interrupted: null,
        entities: {
          profile: "ld2410",
          gate_count: 9,
          engineering_mode: SWITCH,
          engineering_mode_on: false,
          background_status: null,
          background_status_on: false,
          max_move_gate: 8,
          max_still_gate: 8,
          min_gate: null,
          max_gate: null,
        },
        ...payload,
      });
    };

    push({});
    await settle(card);
    const idle = text(card);
    expect(idle).toContain("Home Assistant turns Radar Engineering Mode on for the listen");
    const start = Array.from(card.shadowRoot.querySelectorAll("button")).find(
      (b: any) => b.textContent.trim() === "Calibrate with empty room"
    ) as HTMLButtonElement;
    expect(start.disabled).toBe(false);

    // `hass` (@property): the switch turned on.
    card.hass = withStates(hass, { [SWITCH]: "on" });
    await settle(card);
    expect(text(card)).not.toBe(idle);
    expect(text(card)).toContain("Radar Engineering Mode is already on and will stay on.");

    // `_payload` (@state): a job started.
    push({
      job: {
        job_id: "job1",
        kind: "calibrate",
        status: "preparing",
        sub_phase: "settle",
        started_at: "2026-10-11T14:30:00+00:00",
        elapsed_s: 2,
        remaining_s: 73,
        duration_s: 60,
        settle_s: 15,
        samples: 0,
        peaks: { move: {}, still: {} },
        writes_done: 0,
        writes_total: 0,
        apply: true,
        cancel_requested: false,
        engineering_mode_turned_on: false,
      },
    });
    await settle(card);
    expect(text(card)).toContain("Leave the room now.");
    expect(text(card)).not.toContain("Calibrate with empty room");
  });

  it("gate energy card drops its turn-on button when the switch turns on", async () => {
    const hass = fakeHass();
    const card = await mount("apollo-radar-gate-energy-card", { device_id: "dev1" }, hass);
    const before = text(card);
    expect(card.shadowRoot.querySelector("svg")).not.toBeNull();
    expect(card.shadowRoot.querySelector("button.overlay")?.textContent).toContain(
      "Turn on Radar Engineering Mode"
    );

    card.hass = withStates(hass, { [SWITCH]: "on" });
    await settle(card);
    expect(card.shadowRoot.querySelector("button.overlay")).toBeNull();
    expect(text(card)).not.toBe(before);
  });

  it("distance card swaps device not found for its chart once the entities arrive", async () => {
    const bare = fakeHass({});
    const card = await mount("apollo-radar-distance-card", { device_id: "dev1" }, bare);
    expect(text(card)).toContain(NOT_FOUND);

    card.hass = fakeHass();
    await settle(card);
    expect(text(card)).not.toContain(NOT_FOUND);
    expect(card.shadowRoot.querySelector("svg")).not.toBeNull();

    // `_config` (@state): pointed at a device that does not exist.
    card.setConfig({ type: "custom:apollo-radar-distance-card", device_id: "gone" });
    await settle(card);
    expect(text(card)).toContain(NOT_FOUND);
  });
});

describe("tuning bundle and the registry polyfill", () => {
  it("defines its elements again through the polyfill once the app boots", async () => {
    // The bundle loaded on the native registry, as on a cold cache. The
    // polyfill then takes over window.customElements and cannot see them.
    const native = window.customElements;
    const tags = registeredTags("../src/index.ts");
    const polyfill = polyfillRegistry(native);
    installRegistry(polyfill);
    try {
      for (const tag of tags) expect(polyfill.get(tag), tag).toBeUndefined();
      polyfill.define("home-assistant", class HomeAssistant extends HTMLElement {});
      await tick();
      for (const tag of tags) expect(polyfill.get(tag), tag).toBe(native.get(tag));
    } finally {
      installRegistry(native);
    }
  });
});

// Last in this file: the second copy stays loaded, with its own registry hook.
describe("tuning bundle evaluated a second time", () => {
  it("adds no second picker entry and keeps the first copy's elements", async () => {
    // A second copy under another URL, such as a hand-added resource with an
    // older ?v=, runs the whole bundle again.
    const tags = registeredTags("../src/index.ts");
    const first = new Map(tags.map((tag) => [tag, customElements.get(tag)]));
    const banner = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      vi.resetModules();
      // @ts-expect-error The committed bundle is plain JS with no type declarations.
      await import("../../custom_components/apollo_mmwave/www/apollo-radar-tuning.js");
      // The version banner shows the second copy really ran.
      expect(banner).toHaveBeenCalledTimes(1);
    } finally {
      banner.mockRestore();
    }
    for (const tag of tags) expect(customElements.get(tag), tag).toBe(first.get(tag));
    const cards = (window as any).customCards as { type: string }[];
    expect(cards.map((c) => c.type)).toEqual([
      "apollo-radar-distance-card",
      "apollo-radar-gate-energy-card",
      "apollo-radar-calibrate-card",
    ]);
    expect((window as any).customStrategies).toHaveLength(1);
  });
});
