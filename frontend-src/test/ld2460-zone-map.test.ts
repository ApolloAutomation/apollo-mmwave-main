/**
 * The LD2460 zone map's edge cases: someone right at the radar, a restart
 * of a ceiling mounted device, and the circle a ceiling mount draws.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ZoneMapCard } from "../src/zone-map/card";
import { ZONES_GET } from "../src/zone-map/api";
import { isLd2460Pair } from "../src/ld2460";

const DEV = "dev2460";
const B = "ceiling_radar";
const X1 = `sensor.${B}_ld2460_target_1_x`;
const Y1 = `sensor.${B}_ld2460_target_1_y`;
const MODE = `sensor.${B}_ld2460_installation_mode`;
const FT = { unit_of_measurement: "ft", device_class: "distance" };

function state(entity_id: string, value: string, attributes: Record<string, any> = {}) {
  return { entity_id, state: value, attributes };
}

function hassWith(mode: string, x = "3.0", y = "6.0"): any {
  const ids = [X1, Y1, MODE];
  return {
    states: {
      [X1]: state(X1, x, FT),
      [Y1]: state(Y1, y, FT),
      [MODE]: state(MODE, mode),
    },
    entities: Object.fromEntries(ids.map((id) => [id, { device_id: DEV, platform: "esphome" }])),
    devices: {
      [DEV]: { id: DEV, name: "Ceiling Radar", manufacturer: "ApolloAutomation", model: "XR-7" },
    },
    config: { unit_system: { length: "mi" } },
    callWS: vi.fn(async (msg: any) =>
      msg.type === ZONES_GET
        ? { zones: {}, entities: null, rotation_deg: 0, suggested_entities: [{ x: X1, y: Y1 }] }
        : []
    ),
    connection: { subscribeMessage: vi.fn(async () => () => {}) },
  };
}

async function mount(hass: any) {
  const card: any = new ZoneMapCard();
  card.setConfig({ device_id: DEV, unit_display: true });
  card.hass = hass;
  await vi.waitFor(() => expect(card._zoneConfigPayload || card._loadError).toBeTruthy());
  return card;
}

function withStates(hass: any, ...updates: ReturnType<typeof state>[]): any {
  const states = { ...hass.states };
  for (const s of updates) states[s.entity_id] = s;
  return { ...hass, states };
}

function recordCone(card: any): Array<[string, any[]]> {
  const calls: Array<[string, any[]]> = [];
  const sink: any = new Proxy(function () {} as object, {
    get: () => sink,
    apply: () => sink,
  });
  card.ctx = new Proxy({} as Record<string | symbol, any>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: any[]) => {
        calls.push([String(prop), args]);
        return sink;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  card.drawDeviceCone(card._getGridRenderState().metrics, null);
  return calls;
}

/** The cone's own outline: its moves and lines up to closePath. */
function conePath(card: any): Array<[string, any[]]> {
  const calls = recordCone(card);
  const end = calls.findIndex(([name]) => name === "closePath");
  return calls.slice(0, end).filter(([name]) => name === "moveTo" || name === "lineTo");
}

describe("the LD2460 zone map, reviewed", () => {
  afterEach(() => window.localStorage.clear());

  it("tells an LD2460 pair from an LD2450 one", () => {
    expect(isLd2460Pair({ x: X1, y: Y1 })).toBe(true);
    expect(isLd2460Pair({ x: "sensor.r_target_1_x", y: "sensor.r_target_1_y" })).toBe(false);
    expect(isLd2460Pair({ x: X1, y: "sensor.r_target_1_y" })).toBe(false);
    expect(isLd2460Pair(undefined)).toBe(false);
  });

  it("draws someone right under a ceiling radar, at (0, 0)", async () => {
    const hass = hassWith("top");
    const card = await mount(hass);
    card.hass = withStates(hass, state(X1, "0.0", FT), state(Y1, "0.0", FT));
    expect(card._currentTargets()).toEqual([{ slot: 0, x: 0, y: 0 }]);
  });

  it("keeps the circle while a ceiling mounted device restarts", async () => {
    const hass = hassWith("top");
    const card = await mount(hass);
    expect(card.coneFovDeg).toBe(360);
    const down = withStates(hass, state(MODE, "unavailable"));
    card.hass = down;
    expect([card.coneYMax, card.coneFovDeg]).toEqual([4000, 360]);
    // Back up, the radar answering side this time.
    card.hass = withStates(down, state(MODE, "side"));
    expect([card.coneYMax, card.coneFovDeg]).toEqual([6000, 120]);
  });

  it("never hands one radar's reported mount to another", async () => {
    const hass = hassWith("top");
    const other = "dev2460b";
    const ids = [X1, Y1, MODE].map((id) => id.replace(B, "other_radar"));
    for (const id of ids) {
      hass.entities[id] = { device_id: other, platform: "esphome" };
      hass.states[id] = state(id, id === ids[2] ? "unavailable" : "1.0", id === ids[2] ? {} : FT);
    }
    hass.devices[other] = { ...hass.devices[DEV], id: other };
    const card = await mount(hass);
    expect(card.coneFovDeg).toBe(360);
    card.setConfig({ device_id: other, unit_display: true });
    card.hass = { ...hass };
    await vi.waitFor(() => expect(card._zoneConfigPayload).toBeTruthy());
    expect(card.coneFovDeg).toBe(120);
  });

  it("starts as a wall cone when the mode is unavailable from the start", async () => {
    const card = await mount(hassWith("unavailable"));
    expect(card.coneFovDeg).toBe(120);
  });

  it("draws a ceiling mount's circle with no edge from the radar", async () => {
    const card = await mount(hassWith("top"));
    card.coneAngleDeg = 30;
    card._invalidateConeCache();
    const path = conePath(card);
    const apex = [card.valueToPixels(0, "x"), card.valueToPixels(0, "y")];
    const atApex = path.filter(([, [x, y]]) => Math.hypot(x - apex[0], y - apex[1]) < 1e-6);
    expect(atApex).toEqual([]);
    // Rounder than the wall cone's 48 pieces.
    expect(path.length).toBe(48 * 3 + 1);
  });

  it("still draws a wall cone's edges from the radar, in 48 pieces", async () => {
    const card = await mount(hassWith("side"));
    const path = conePath(card);
    const apex = [card.valueToPixels(0, "x"), card.valueToPixels(0, "y")];
    const near = ([x, y]: number[]) => Math.hypot(x - apex[0], y - apex[1]) < 1e-6;
    expect(near(path[0][1])).toBe(true);
    expect(near(path[path.length - 1][1])).toBe(true);
    // Apex, edge, 48 arc points, apex.
    expect(path.length).toBe(51);
  });
});
