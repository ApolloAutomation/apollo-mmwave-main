import { describe, it, expect } from "vitest";
import { entitiesForDevice } from "../src/entity-index";
import type { HomeAssistant } from "../src/types";

describe("entitiesForDevice", () => {
  const entities: HomeAssistant["entities"] = {
    "switch.a_radar_engineering_mode": { device_id: "dev1", platform: "esphome" },
    "light.hall": { device_id: "lamp" },
    "input_boolean.helper": {},
    "number.a_g0_move_threshold": { device_id: "dev1" },
    "number.a_g0_move_threshold_2": { device_id: "dev1", platform: "esphome" },
  };

  it("keeps exactly one device's entries, in registry order", () => {
    expect(entitiesForDevice(entities, "dev1")).toEqual([
      ["switch.a_radar_engineering_mode", entities["switch.a_radar_engineering_mode"]],
      ["number.a_g0_move_threshold", entities["number.a_g0_move_threshold"]],
      ["number.a_g0_move_threshold_2", entities["number.a_g0_move_threshold_2"]],
    ]);
    expect(entitiesForDevice(entities, "lamp").map(([id]) => id)).toEqual(["light.hall"]);
  });

  it("returns nothing for a device with no entities", () => {
    expect(entitiesForDevice(entities, "missing")).toEqual([]);
  });

  it("reuses the index for the same registry object", () => {
    expect(entitiesForDevice(entities, "dev1")).toBe(entitiesForDevice(entities, "dev1"));
  });

  it("reflects a replaced registry object", () => {
    const replaced: HomeAssistant["entities"] = {
      ...entities,
      "sensor.a_ld2450_target_1_x": { device_id: "dev1" },
    };
    expect(entitiesForDevice(entities, "dev1")).toHaveLength(3);
    expect(entitiesForDevice(replaced, "dev1").map(([id]) => id)).toEqual([
      "switch.a_radar_engineering_mode",
      "number.a_g0_move_threshold",
      "number.a_g0_move_threshold_2",
      "sensor.a_ld2450_target_1_x",
    ]);
  });
});
