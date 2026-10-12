/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import configFlowSource from "../../custom_components/apollo_mmwave/config_flow.py?raw";
import { apolloModelInfo, isEsphomeDevice } from "../src/profiles";
import { detectRadarDevices } from "../src/strategy-core";
import type { HomeAssistant, HassEntity } from "../src/types";

type Device = HomeAssistant["devices"][string];

function hassWith(
  entityIds: string[],
  device: Device,
  deviceId = "dev1"
): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  const entities: Record<string, { device_id?: string }> = {};
  for (const id of entityIds) {
    states[id] = { entity_id: id, state: "0", attributes: {} };
    entities[id] = { device_id: deviceId };
  }
  return { states, entities, devices: { [deviceId]: device } };
}

describe("apolloModelInfo", () => {
  it("maps MSR models to the LD2410 profile without an LD2450", () => {
    for (const model of ["MSR-1", "MSR-2"]) {
      const info = apolloModelInfo({ manufacturer: "ApolloAutomation", model })!;
      expect(info.profile?.key).toBe("ld2410");
      expect(info.ld2450).toBe(false);
    }
  });

  it("maps both R-PRO-1 hardware variants to LD2412 + LD2450", () => {
    for (const model of ["R-PRO-1-W", "R-PRO-1-ETH"]) {
      const info = apolloModelInfo({ manufacturer: "ApolloAutomation", model })!;
      expect(info.profile?.key).toBe("ld2412");
      expect(info.ld2450).toBe(true);
    }
  });

  it("maps MTR-1 to LD2450-only (no gate-radar profile)", () => {
    const info = apolloModelInfo({
      manufacturer: "ApolloAutomation",
      model: "MTR-1",
    })!;
    expect(info.profile).toBeUndefined();
    expect(info.ld2450).toBe(true);
  });

  it("matches manufacturer and model case-insensitively", () => {
    const info = apolloModelInfo({ manufacturer: "apolloautomation", model: "msr-2" })!;
    expect(info.profile?.key).toBe("ld2410");
  });

  it("rejects other manufacturers, unknown models, and missing fields", () => {
    expect(
      apolloModelInfo({ manufacturer: "Everything Presence", model: "MSR-2" })
    ).toBeUndefined();
    expect(
      apolloModelInfo({ manufacturer: "ApolloAutomation", model: "AIR-1" })
    ).toBeUndefined();
    expect(apolloModelInfo({ manufacturer: "ApolloAutomation" })).toBeUndefined();
    expect(apolloModelInfo(undefined)).toBeUndefined();
  });
});

// The config flow's device picker lists MMWAVE_MODELS by exact string, and
// apolloModelInfo matches APOLLO_MODELS by prefix. Read the Python tuple so a
// model added there fails here until the frontend recognizes it too.
describe("MMWAVE_MODELS parity with apolloModelInfo", () => {
  const tuple = /^MMWAVE_MODELS\b[^=\n]*=\s*\(([^)]*)\)/m.exec(configFlowSource);
  const models = [...(tuple?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  // [profile key, ld2450] each model family should resolve to.
  const expected = (model: string): [string | undefined, boolean] | undefined => {
    const m = model.toLowerCase();
    if (m.startsWith("msr-")) return ["ld2410", false];
    if (m.startsWith("r-pro-1")) return ["ld2412", true];
    if (m.startsWith("mtr-1")) return [undefined, true];
    return undefined;
  };

  it("reads the model tuple from config_flow.py", () => {
    expect(models).toContain("MSR-2");
    expect(models).toContain("MTR-1");
    expect(models).toContain("R-PRO-1-W");
  });

  it("resolves every config-flow model to its expected profile and LD2450", () => {
    for (const model of models) {
      const info = apolloModelInfo({ manufacturer: "ApolloAutomation", model });
      expect(expected(model), `no expected hardware for ${model}`).toBeDefined();
      expect(info && [info.profile?.key, info.ld2450], model).toEqual(expected(model));
    }
  });
});

describe("isEsphomeDevice", () => {
  const hassOf = (entities: HomeAssistant["entities"]): HomeAssistant => ({
    states: {},
    entities,
    devices: { dev1: { name: "Office Radar" }, dev2: { name: "Other" } },
  });

  it("is false for a device with no entities", () => {
    const hass = hassOf({ "sensor.other_temp": { device_id: "dev2", platform: "esphome" } });
    expect(isEsphomeDevice(hass, "dev1")).toBe(false);
  });

  it("is true when any of the device's entities is an esphome entity", () => {
    const hass = hassOf({
      "sensor.office_rssi": { device_id: "dev1", platform: "unifi" },
      "switch.office_radar_engineering_mode": { device_id: "dev1", platform: "esphome" },
    });
    expect(isEsphomeDevice(hass, "dev1")).toBe(true);
  });

  it("gives entities without a platform field the benefit of the doubt", () => {
    const hass = hassOf({
      "switch.office_radar_engineering_mode": { device_id: "dev1" },
      "sensor.office_radar_detection_distance": { device_id: "dev1" },
    });
    expect(isEsphomeDevice(hass, "dev1")).toBe(true);
  });

  it("is false when every entity carries a non-esphome platform", () => {
    const hass = hassOf({
      "sensor.office_rssi": { device_id: "dev1", platform: "unifi" },
      "device_tracker.office": { device_id: "dev1", platform: "unifi" },
    });
    expect(isEsphomeDevice(hass, "dev1")).toBe(false);
  });

  it("is false for platform-less entities mixed with a non-esphome one", () => {
    const hass = hassOf({
      "switch.office_radar_engineering_mode": { device_id: "dev1" },
      "sensor.office_rssi": { device_id: "dev1", platform: "unifi" },
    });
    expect(isEsphomeDevice(hass, "dev1")).toBe(false);
  });
});

describe("registry-first detectRadarDevices", () => {
  const apollo = (model: string): Device => ({
    name: "Office Radar",
    manufacturer: "ApolloAutomation",
    model,
  });

  it("detects an R-PRO-1-W by registry even when no entity name is recognizable", () => {
    // Every entity fully renamed — suffix probing finds nothing, registry wins.
    const hass = hassWith(["sensor.completely_renamed"], apollo("R-PRO-1-W"));
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].profile?.key).toBe("ld2412");
    expect(devices[0].ld2450).toBe(true);
  });

  it("detects an R-PRO-1-ETH and a lower-cased model the same way", () => {
    for (const model of ["R-PRO-1-ETH", "r-pro-1-eth"]) {
      const devices = detectRadarDevices(
        hassWith(["sensor.completely_renamed"], apollo(model))
      );
      expect(devices).toHaveLength(1);
      expect(devices[0].profile?.key).toBe("ld2412");
    }
  });

  it("detects a registry MTR-1 as zone-only", () => {
    const hass = hassWith(["sensor.completely_renamed"], apollo("MTR-1"));
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].profile).toBeUndefined();
    expect(devices[0].ld2450).toBe(true);
  });

  it("prefers a concrete entity match over a conflicting registry model", () => {
    // Reflashed R-PRO enclosure running MSR firmware: entities say LD2410.
    const hass = hassWith(
      ["switch.office_radar_engineering_mode"],
      apollo("R-PRO-1-W")
    );
    expect(detectRadarDevices(hass)[0].profile?.key).toBe("ld2410");
  });

  it("waits for a registry device's entities before listing it", () => {
    // Device-add race: the registry event lands before the entities. With no
    // entity to say which integration owns the device, it could as well be a
    // network integration's copy, so it waits; the later entities update
    // flips the device key and the strategy regenerates with the tab.
    const hass = hassWith([], apollo("MSR-2"));
    expect(detectRadarDevices(hass)).toHaveLength(0);
    const ready = hassWith(["sensor.completely_renamed"], apollo("MSR-2"));
    ready.entities["sensor.completely_renamed"].platform = "esphome";
    const devices = detectRadarDevices(ready);
    expect(devices).toHaveLength(1);
    expect(devices[0].online).toBe(true);
    expect(devices[0].profile?.key).toBe("ld2410");
  });

  it("falls back to entity-suffix detection when manufacturer is missing (DIY)", () => {
    const base = "diy_ld2410_sensor";
    const hass = hassWith([`switch.${base}_radar_engineering_mode`], {
      name: "DIY Radar",
    });
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].profile?.key).toBe("ld2410");
    expect(devices[0].base).toBe(base);
  });

  it("still classifies dedup-suffixed entity ids on a fallback device", () => {
    const base = "diy_ld2410_sensor";
    const hass = hassWith([`switch.${base}_radar_engineering_mode`], {
      name: "DIY Radar",
    });
    // A second radar caused HA to dedup this device's threshold entity.
    const dedup = `number.${base}_g3_move_threshold_2`;
    hass.states[dedup] = { entity_id: dedup, state: "0", attributes: {} };
    hass.entities[dedup] = { device_id: "dev1" };
    expect(detectRadarDevices(hass)).toHaveLength(1);
  });
});
