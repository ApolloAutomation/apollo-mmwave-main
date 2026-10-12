import { describe, it, expect } from "vitest";
import {
  anyResolved,
  entityIds,
  radarEntityIds,
  resolveRadar,
  resolvedDeviceId,
  resolvedStatesChanged,
} from "../src/cards/resolution";
import type { EntityMap, HomeAssistant, HassEntity } from "../src/types";

const base = "apollo_msr_2_m4c4dd";
const eng = `switch.${base}_radar_engineering_mode`;
const thr = `number.${base}_g0_move_threshold`;

function hassWith(entityIds: string[]): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  const entities: Record<string, { device_id?: string }> = {};
  for (const id of entityIds) {
    states[id] = { entity_id: id, state: "0", attributes: {} };
    entities[id] = { device_id: "dev1" };
  }
  return { states, entities, devices: { dev1: { name: "MSR-2" } } };
}

describe("entityIds", () => {
  it("flattens scalars and gate arrays, skipping holes", () => {
    const m: EntityMap = {
      engineering_mode: eng,
      move_threshold: [thr, undefined as any, `number.${base}_g2_move_threshold`],
      still_threshold: [],
      move_energy: [],
      still_energy: [],
    };
    expect(entityIds(m)).toEqual([eng, thr, `number.${base}_g2_move_threshold`]);
  });
});

describe("resolveRadar memoization", () => {
  const config = { type: "x", device_id: "dev1" };

  it("returns the cached object while config and registries are reference-equal", () => {
    const hass = hassWith([eng, thr]);
    const first = resolveRadar(undefined, hass, config);
    // A state tick replaces `hass` but keeps the registry objects.
    const tick: HomeAssistant = { ...hass, states: { ...hass.states } };
    expect(resolveRadar(first, tick, config)).toBe(first);
  });

  it("recomputes when the entity registry object is replaced", () => {
    const hass = hassWith([eng]);
    const first = resolveRadar(undefined, hass, config);
    const changed: HomeAssistant = { ...hass, entities: { ...hass.entities } };
    const second = resolveRadar(first, changed, config);
    expect(second).not.toBe(first);
    expect(second.map.engineering_mode).toBe(eng);
  });

  it("recomputes when the device registry object or the config is replaced", () => {
    const hass = hassWith([eng]);
    const first = resolveRadar(undefined, hass, config);
    expect(
      resolveRadar(first, { ...hass, devices: { ...hass.devices } }, config)
    ).not.toBe(first);
    expect(resolveRadar(first, hass, { ...config })).not.toBe(first);
  });

  it("resolves the map, profile, and flat id list", () => {
    const hass = hassWith([eng, thr]);
    const r = resolveRadar(undefined, hass, config);
    expect(r.map.engineering_mode).toBe(eng);
    expect(r.profile?.key).toBe("ld2410");
    expect(r.ids).toContain(eng);
    expect(r.ids).toContain(thr);
  });
});

describe("resolveRadar base-name fallback", () => {
  const rpro = "apollo_r_pro_1_abc123";
  const ld2410Eng = `switch.${rpro}_radar_engineering_mode`;
  const ld2412Eng = `switch.${rpro}_ld2412_engineering_mode`;

  /** A states-only tick: new hass and states, same registry objects. */
  function tick(hass: HomeAssistant, ids: string[]): HomeAssistant {
    const states = { ...hass.states };
    for (const id of ids) states[id] = { entity_id: id, state: "off", attributes: {} };
    return { ...hass, states };
  }

  it("recomputes when a base-name fallback resolution later gains LD2412 states", () => {
    const config = { type: "x", device_base_name: rpro };
    const before: HomeAssistant = { states: {}, entities: {}, devices: {} };
    const first = resolveRadar(undefined, before, config);
    // No engineering-mode switch in states yet: the LD2410 default.
    expect(first.map.engineering_mode).toBe(ld2410Eng);
    expect(first.profile?.key).toBe("ld2410");

    const after = tick(before, [ld2412Eng]);
    expect(after.entities).toBe(before.entities);
    expect(after.devices).toBe(before.devices);
    const second = resolveRadar(first, after, config);
    expect(second).not.toBe(first);
    expect(second.map.engineering_mode).toBe(ld2412Eng);
    expect(second.profile?.key).toBe("ld2412");
    expect(anyResolved(after, second.radarIds)).toBe(true);
    // The card's shouldUpdate sees the new ids change, so it re-renders.
    expect(resolvedStatesChanged(before, after, second.ids)).toBe(true);

    // Healed once, it stays cached while the detection holds.
    expect(resolveRadar(second, tick(after, ["sensor.kitchen_temperature"]), config)).toBe(
      second
    );
  });

  it("recomputes a device_id config whose entities are not registered yet", () => {
    // Strategy-shaped config: device_id plus device_base_name.
    const config = { type: "x", device_id: "dev9", device_base_name: rpro };
    const before: HomeAssistant = { states: {}, entities: {}, devices: {} };
    const first = resolveRadar(undefined, before, config);
    expect(first.map.engineering_mode).toBe(ld2410Eng);
    const second = resolveRadar(first, tick(before, [ld2412Eng]), config);
    expect(second.map.engineering_mode).toBe(ld2412Eng);
  });

  it("a fallback cache stays reference-equal across states-only ticks while the device has no states", () => {
    const config = { type: "x", device_base_name: rpro };
    const hass: HomeAssistant = { states: {}, entities: {}, devices: {} };
    const first = resolveRadar(undefined, hass, config);
    expect(first.fallbackBase).toBe(rpro);
    const t1 = tick(hass, ["sensor.kitchen_temperature"]);
    const t2 = tick(t1, ["light.hallway"]);
    expect(resolveRadar(first, t1, config)).toBe(first);
    expect(resolveRadar(first, t2, config)).toBe(first);
    expect(anyResolved(t2, first.radarIds)).toBe(false);
  });

  it("a fallback cache for an LD2410 device stays reference-equal across ticks", () => {
    const config = { type: "x", device_base_name: base };
    const hass = tick({ states: {}, entities: {}, devices: {} }, [eng]);
    const first = resolveRadar(undefined, hass, config);
    expect(first.map.engineering_mode).toBe(eng);
    expect(resolveRadar(first, tick(hass, [eng, thr]), config)).toBe(first);
  });

  it("records no fallback base when the registry resolves the device", () => {
    const r = resolveRadar(undefined, hassWith([eng, thr]), { type: "x", device_id: "dev1" });
    expect(r.fallbackBase).toBeUndefined();
    expect(r.fallbackDetected).toBeUndefined();
  });
});

describe("resolvedStatesChanged", () => {
  const oldHass = hassWith([eng, thr]);

  it("is false when no tracked state object was replaced", () => {
    // hass replaced, but the tracked state objects are the same references.
    const newHass: HomeAssistant = { ...oldHass, states: { ...oldHass.states } };
    expect(resolvedStatesChanged(oldHass, newHass, [eng, thr])).toBe(false);
  });

  it("is true when a tracked entity's state object changed", () => {
    const newHass: HomeAssistant = {
      ...oldHass,
      states: {
        ...oldHass.states,
        [eng]: { entity_id: eng, state: "on", attributes: {} },
      },
    };
    expect(resolvedStatesChanged(oldHass, newHass, [eng, thr])).toBe(true);
  });

  it("ignores changes to entities outside the resolved set", () => {
    const other = "sensor.kitchen_temperature";
    const newHass: HomeAssistant = {
      ...oldHass,
      states: {
        ...oldHass.states,
        [other]: { entity_id: other, state: "21", attributes: {} },
      },
    };
    expect(resolvedStatesChanged(oldHass, newHass, [eng, thr])).toBe(false);
  });
});

describe("anyResolved", () => {
  const hass = hassWith([eng]);

  it("is true when at least one resolved id exists in states", () => {
    expect(anyResolved(hass, [eng, "number.gone_g0_move_threshold"])).toBe(true);
  });

  it("is false when nothing resolves (device removed/renamed)", () => {
    expect(anyResolved(hass, ["switch.gone_radar_engineering_mode"])).toBe(false);
    expect(anyResolved(hass, [])).toBe(false);
  });
});

describe("radar ids (not-found decision)", () => {
  const reboot = `button.${base}_esp_reboot`;

  it("radarEntityIds drops only the ESP Reboot button", () => {
    const m: EntityMap = {
      engineering_mode: eng,
      esp_reboot: reboot,
      move_threshold: [thr],
      still_threshold: [],
      move_energy: [],
      still_energy: [],
    };
    expect(entityIds(m)).toContain(reboot);
    expect(radarEntityIds(m)).toEqual([eng, thr]);
  });

  it("anyResolved over radarIds is false when only esp_reboot resolves", () => {
    const air = "button.apollo_air_1_abc123_esp_reboot";
    const hass = hassWith([air]);
    const r = resolveRadar(undefined, hass, { type: "x", device_id: "dev1" });
    // The full list still tracks the button for changed-state checks.
    expect(r.ids).toEqual([air]);
    expect(r.radarIds).toEqual([]);
    expect(anyResolved(hass, r.ids)).toBe(true);
    expect(anyResolved(hass, r.radarIds)).toBe(false);
  });

  it("is false for a base name whose only live entity is the ESP Reboot button", () => {
    const air = "apollo_air_1_abc123";
    const hass = hassWith([`button.${air}_esp_reboot`]);
    const r = resolveRadar(undefined, hass, { type: "x", device_base_name: air });
    expect(r.map.move_threshold.length).toBeGreaterThan(0);
    expect(anyResolved(hass, r.ids)).toBe(true);
    expect(anyResolved(hass, r.radarIds)).toBe(false);
  });

  it("is true when a gate radar entity exists beside the ESP Reboot button", () => {
    const hass = hassWith([reboot, thr]);
    const r = resolveRadar(undefined, hass, { type: "x", device_id: "dev1" });
    expect(r.radarIds).toEqual([thr]);
    expect(anyResolved(hass, r.radarIds)).toBe(true);
  });
});

describe("resolvedDeviceId", () => {
  const hass = hassWith([eng, thr]);
  const map = resolveRadar(undefined, hass, { type: "x", device_id: "dev1" }).map;

  it("prefers the configured device_id", () => {
    expect(resolvedDeviceId(hass, { device_id: "other" }, map)).toBe("other");
  });

  it("falls back to the device of the first resolved entity in the registry", () => {
    expect(resolvedDeviceId(hass, {}, map)).toBe("dev1");
  });

  it("is undefined when no resolved entity is registered", () => {
    const empty: HomeAssistant = { states: hass.states, entities: {}, devices: {} };
    expect(resolvedDeviceId(empty, {}, map)).toBeUndefined();
    expect(
      resolvedDeviceId(hass, {}, { move_threshold: [], still_threshold: [], move_energy: [], still_energy: [] })
    ).toBeUndefined();
  });
});
