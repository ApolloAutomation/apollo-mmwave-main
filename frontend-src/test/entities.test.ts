import { describe, it, expect } from "vitest";
import { render } from "lit";
import { renderDistanceChart } from "../src/charts/distance-chart";
import { renderGateEnergyChart } from "../src/charts/gate-energy-chart";
import { controlRows, moveThresholdRows } from "../src/panels/entity-rows";
import {
  baseNameFromDevice,
  classifyObjectId,
  detectProfileFromEntities,
  entityMapFromBaseName,
  entityMapFromDevice,
  resolveEntities,
  resolveEntitiesDetailed,
  resolveProfile,
  exists,
  deviceInfoEntities,
} from "../src/entities";
import { LD2412_PROFILE, detectProfile } from "../src/profiles";
import type { EntityMap, HomeAssistant } from "../src/types";
import { flat } from "./template-markup";

const base = "apollo_msr_2_m4c4dd";

function hassWith(entityIds: string[], deviceId = "dev1"): HomeAssistant {
  const states: HomeAssistant["states"] = {};
  const entities: HomeAssistant["entities"] = {};
  for (const id of entityIds) {
    states[id] = { entity_id: id, state: "0", attributes: {} };
    entities[id] = { device_id: deviceId };
  }
  return { states, entities, devices: { dev1: { name: "MSR-2" } } };
}

describe("baseNameFromDevice", () => {
  it("extracts the common base name across a device's entities", () => {
    const hass = hassWith([
      `sensor.${base}_radar_detection_distance`,
      `binary_sensor.${base}_radar_target`,
      `number.${base}_g3_move_threshold`,
    ]);
    expect(baseNameFromDevice(hass, "dev1")).toBe(base);
  });

  it("returns undefined for an unknown device", () => {
    const hass = hassWith([`sensor.${base}_radar_detection_distance`]);
    expect(baseNameFromDevice(hass, "nope")).toBeUndefined();
  });

  // Only a strictly higher count replaces the current best, so on a tie the
  // base seen first in registry order wins.
  it("keeps the first-seen base on a tie", () => {
    const alpha = "switch.alpha_radar_engineering_mode";
    const beta = "number.beta_radar_timeout";
    expect(baseNameFromDevice(hassWith([alpha, beta]), "dev1")).toBe("alpha");
    expect(baseNameFromDevice(hassWith([beta, alpha]), "dev1")).toBe("beta");
  });

  it("lets a strict majority win over the first-seen base", () => {
    const ids = [
      "switch.alpha_radar_engineering_mode",
      "number.beta_radar_timeout",
      "number.beta_g3_move_threshold",
    ];
    expect(baseNameFromDevice(hassWith(ids), "dev1")).toBe("beta");
  });

  // A device the user named after its chip ("Office LD2412") repeats the
  // chip token in every entity id; the base must keep it, not stop at the
  // first occurrence.
  const ld2412Ids = (b: string, tail: string) => [
    `switch.${b}_ld2412_engineering_mode${tail}`,
    `number.${b}_ld2412_g00_move_threshold${tail}`,
    `sensor.${b}_ld2412_g13_still_energy${tail}`,
    `binary_sensor.${b}_ld2412_presence${tail}`,
  ];
  const ld2450Ids = (b: string, tail: string) => [
    `sensor.${b}_ld2450_target_1_x${tail}`,
    `sensor.${b}_ld2450_target_1_y${tail}`,
    `sensor.${b}_ld2450_target_2_x${tail}`,
  ];

  for (const tail of ["", "_2"]) {
    const label = tail ? ` with a \`${tail}\` dedup tail` : "";

    it.each(["office_ld2412", "office_ld2412_radar"])(
      `keeps the full LD2412 base %s when it contains the chip token${label}`,
      (b) => {
        expect(baseNameFromDevice(hassWith(ld2412Ids(b, tail)), "dev1")).toBe(b);
      }
    );

    it.each(["den_ld2450", "den_ld2450_radar"])(
      `keeps the full LD2450 base %s when it contains the chip token${label}`,
      (b) => {
        expect(baseNameFromDevice(hassWith(ld2450Ids(b, tail)), "dev1")).toBe(b);
      }
    );

    it.each(["office", "apollo_r_pro_1_abcd"])(
      `still strips the chip suffix from a token-free base %s${label}`,
      (b) => {
        expect(baseNameFromDevice(hassWith(ld2412Ids(b, tail)), "dev1")).toBe(b);
        expect(baseNameFromDevice(hassWith(ld2450Ids(b, tail)), "dev1")).toBe(b);
      }
    );
  }
});

describe("entityMapFromBaseName", () => {
  const map = entityMapFromBaseName(base);
  it("builds scalar control ids", () => {
    expect(map.engineering_mode).toBe(`switch.${base}_radar_engineering_mode`);
    expect(map.esp_reboot).toBe(`button.${base}_esp_reboot`);
  });
  it("builds 9-element gate arrays indexed 0..8", () => {
    expect(map.move_threshold).toHaveLength(9);
    expect(map.move_threshold[0]).toBe(`number.${base}_g0_move_threshold`);
    expect(map.still_energy[8]).toBe(`sensor.${base}_g8_still_energy`);
  });
  it("builds zone and distance ids", () => {
    expect(map.end_zone_2).toBe(`number.${base}_radar_end_zone_2`);
    expect(map.detection_distance).toBe(`sensor.${base}_radar_detection_distance`);
    expect(map.gate_size).toBe(`select.${base}_ld2410_gate_size`);
  });
});

describe("resolveEntities", () => {
  it("resolves from device_id", () => {
    const hass = hassWith([`sensor.${base}_radar_detection_distance`]);
    const map = resolveEntities(hass, { type: "x", device_id: "dev1" });
    expect(map.detection_distance).toBe(`sensor.${base}_radar_detection_distance`);
  });

  it("falls back to device_base_name when no device_id", () => {
    const hass = hassWith([]);
    const map = resolveEntities(hass, { type: "x", device_base_name: base });
    expect(map.engineering_mode).toBe(`switch.${base}_radar_engineering_mode`);
  });

  it("lets manual entities override resolved ids", () => {
    const hass = hassWith([]);
    const map = resolveEntities(hass, {
      type: "x",
      device_base_name: base,
      entities: { engineering_mode: "switch.custom_mode" },
    });
    expect(map.engineering_mode).toBe("switch.custom_mode");
  });

  it("returns empty gate arrays when nothing resolves", () => {
    const map = resolveEntities(hassWith([]), { type: "x" });
    expect(map.move_threshold).toEqual([]);
  });

  // YAML `move_threshold:` parses to null, and a single id is a string; the
  // casts stand in for that untyped card config.
  const badGateOverrides: [string, Partial<EntityMap>][] = [
    ["null", { move_threshold: null as unknown as string[] }],
    ["a string", { move_threshold: "number.foo" as unknown as string[] }],
    [
      "non-arrays in every gate slot",
      {
        move_threshold: null as unknown as string[],
        still_threshold: "number.foo" as unknown as string[],
        move_energy: undefined,
        still_energy: 3 as unknown as string[],
      },
    ],
  ];

  for (const [what, entities] of badGateOverrides) {
    it(`keeps the resolved gate arrays when a gate override is ${what}`, () => {
      const resolved = entityMapFromBaseName(base);
      const map = resolveEntities(hassWith([]), { type: "x", device_base_name: base, entities });
      expect(resolved.move_threshold).toHaveLength(9);
      expect(map.move_threshold).toEqual(resolved.move_threshold);
      expect(map.still_threshold).toEqual(resolved.still_threshold);
      expect(map.move_energy).toEqual(resolved.move_energy);
      expect(map.still_energy).toEqual(resolved.still_energy);
      expect(moveThresholdRows(map)).toHaveLength(9);
    });

    it(`renders the gate charts when a gate override is ${what}`, () => {
      const resolved = entityMapFromBaseName(base);
      const hass = hassWith([
        resolved.gate_size!,
        resolved.engineering_mode!,
        ...resolved.move_threshold,
        ...resolved.move_energy,
      ]);
      const map = resolveEntities(hass, { type: "x", device_base_name: base, entities });
      const distance = renderDistanceChart(hass, map, "m");
      const energy = renderGateEnergyChart(hass, map);
      expect(() => render(distance, document.createElement("div"))).not.toThrow();
      expect(() => render(energy, document.createElement("div"))).not.toThrow();
      // Both charts drew the nine resolved gates (G0..G8 on the energy chart).
      expect(flat(distance)).toContain(">G1</text>");
      expect(flat(energy)).toContain(">G8</text>");
      expect(flat(energy)).not.toContain(">G9</text>");
    });
  }

  it("lets an array gate override replace the resolved array", () => {
    const map = resolveEntities(hassWith([]), {
      type: "x",
      device_base_name: base,
      entities: { move_threshold: ["number.a", "number.b"] },
    });
    expect(map.move_threshold).toEqual(["number.a", "number.b"]);
  });

  it("still lets a null scalar override clear its slot", () => {
    const resolved = entityMapFromBaseName(base);
    const map = resolveEntities(hassWith([]), {
      type: "x",
      device_base_name: base,
      entities: { bluetooth: null as unknown as string },
    });
    expect(resolved.bluetooth).toBeDefined();
    expect(map.bluetooth).toBeNull();
    expect(controlRows(map, "LD2410").map((r) => r.entity)).not.toContain(resolved.bluetooth);
  });
});

describe("resolveEntitiesDetailed", () => {
  it("reports the base name only when the base-name fallback ran", () => {
    const hass = hassWith([`sensor.${base}_radar_detection_distance`]);
    expect(
      resolveEntitiesDetailed(hass, { type: "x", device_id: "dev1" }).fallbackBase
    ).toBeUndefined();
    expect(
      resolveEntitiesDetailed(hassWith([]), { type: "x", device_base_name: base })
        .fallbackBase
    ).toBe(base);
    // A device_id whose entities are not registered falls back too.
    expect(
      resolveEntitiesDetailed(hassWith([]), {
        type: "x",
        device_id: "dev1",
        device_base_name: base,
      }).fallbackBase
    ).toBe(base);
    expect(resolveEntitiesDetailed(hassWith([]), { type: "x" }).fallbackBase).toBeUndefined();
  });

  it("returns the same map resolveEntities does", () => {
    const config = {
      type: "x",
      device_base_name: base,
      entities: { engineering_mode: "switch.custom_mode" },
    };
    const hass = hassWith([]);
    expect(resolveEntitiesDetailed(hass, config).map).toEqual(resolveEntities(hass, config));
  });
});

describe("resolveEntities base-name fallback profile", () => {
  // The device's only registered entity is an LD2450 target: it yields the
  // base name but classifies into no EntityMap slot, so the fallback runs.
  const target = "sensor.office_ld2450_target_1_x";

  it("base-name fallback builds the map with the registry profile", () => {
    const hass = hassWith([target]);
    hass.devices.dev1 = { manufacturer: "ApolloAutomation", model: "R-PRO-1-W" };
    const config = { type: "x", device_id: "dev1" };
    const { map, fallbackBase } = resolveEntitiesDetailed(hass, config);
    expect(fallbackBase).toBe("office");
    expect(resolveProfile(hass, config)?.key).toBe("ld2412");
    expect(map.engineering_mode).toBe("switch.office_ld2412_engineering_mode");
    expect(map.move_threshold).toHaveLength(14);
    expect(map).toEqual(LD2412_PROFILE.entityMap("office"));
  });

  it("keeps the LD2410 default for a registry-matched zone-only model (MTR-1)", () => {
    const hass = hassWith([target]);
    hass.devices.dev1 = { manufacturer: "ApolloAutomation", model: "MTR-1" };
    const config = { type: "x", device_id: "dev1" };
    const { map, fallbackBase } = resolveEntitiesDetailed(hass, config);
    expect(fallbackBase).toBe("office");
    expect(map.engineering_mode).toBe("switch.office_radar_engineering_mode");
    expect(map).toEqual(entityMapFromBaseName("office"));
  });

  it("keeps the LD2410 default for a device the registry no longer has", () => {
    const hass = hassWith([]);
    const config = { type: "x", device_id: "gone", device_base_name: base };
    expect(resolveEntities(hass, config)).toEqual(entityMapFromBaseName(base));
  });

  it("still probes states for a device_base_name-only config", () => {
    expect(resolveEntities(hassWith([]), { type: "x", device_base_name: "office" })).toEqual(
      entityMapFromBaseName("office")
    );
    const hass = hassWith(["switch.office_ld2412_engineering_mode"], "elsewhere");
    expect(resolveEntities(hass, { type: "x", device_base_name: "office" })).toEqual(
      LD2412_PROFILE.entityMap("office")
    );
  });
});

describe("device_base_name on an R-PRO-1 (LD2412)", () => {
  const b = "apollo_r_pro_1_abcd";
  const config = { type: "x", device_base_name: b };

  it("resolves the LD2412 profile and 14-gate map", () => {
    const hass = hassWith([`switch.${b}_ld2412_engineering_mode`]);
    expect(detectProfile(hass, b)?.key).toBe("ld2412");
    expect(resolveProfile(hass, config)?.key).toBe("ld2412");
    const { map, fallbackBase } = resolveEntitiesDetailed(hass, config);
    expect(fallbackBase).toBe(b);
    expect(map.engineering_mode).toBe(`switch.${b}_ld2412_engineering_mode`);
    expect(map.move_threshold).toHaveLength(14);
    expect(map.move_threshold[0]).toBe(`number.${b}_ld2412_g00_move_threshold`);
    expect(map.still_energy[13]).toBe(`sensor.${b}_ld2412_g13_still_energy`);
    expect(map).toEqual(LD2412_PROFILE.entityMap(b));
  });

  // detectProfile probes only each profile's engineering-mode switch, so with
  // that switch disabled or renamed the base-name path keeps the LD2410
  // default even though other LD2412 entities exist. A device_id config still
  // reads the chip from the device's registered entities.
  it("falls back to LD2410 when no engineering-mode switch exists", () => {
    const hass = hassWith([`number.${b}_ld2412_g00_move_threshold`]);
    hass.devices.dev1 = { manufacturer: "ApolloAutomation", model: "R-PRO-1-W" };
    expect(detectProfile(hass, b)).toBeUndefined();
    expect(resolveProfile(hass, config)?.key).toBe("ld2410");
    const map = resolveEntities(hass, config);
    expect(map.engineering_mode).toBe(`switch.${b}_radar_engineering_mode`);
    expect(map.move_threshold).toHaveLength(9);
    expect(map).toEqual(entityMapFromBaseName(b));
    expect(resolveProfile(hass, { type: "x", device_id: "dev1" })?.key).toBe("ld2412");
  });
});

describe("classifyObjectId", () => {
  it("classifies gate entities and parses the gate index", () => {
    expect(classifyObjectId("number", `${base}_g1_move_threshold`)).toEqual({
      slot: "move_threshold",
      gate: 1,
    });
    expect(classifyObjectId("sensor", `${base}_g8_still_energy`)).toEqual({
      slot: "still_energy",
      gate: 8,
    });
  });

  it("tolerates HA dedup suffixes without misparsing the gate", () => {
    // `_2` here is HA's collision suffix, NOT gate 2.
    expect(classifyObjectId("number", `${base}_g3_move_threshold_2`)).toEqual({
      slot: "move_threshold",
      gate: 3,
    });
    expect(classifyObjectId("switch", `${base}_radar_engineering_mode_2`)).toEqual({
      slot: "engineering_mode",
    });
  });

  it("classifies zero-padded LD2412 gate names", () => {
    expect(
      classifyObjectId("number", `${base}_ld2412_g05_still_threshold`)
    ).toEqual({ slot: "still_threshold", gate: 5 });
  });

  it("classifies LD2412 scalar names into shared slots", () => {
    expect(classifyObjectId("switch", `${base}_ld2412_engineering_mode`)).toEqual({
      slot: "engineering_mode",
    });
    expect(classifyObjectId("number", `${base}_ld2412_max_distance_gate`)).toEqual({
      slot: "max_move_distance",
    });
    expect(classifyObjectId("binary_sensor", `${base}_ld2412_presence`)).toEqual({
      slot: "radar_target",
    });
  });

  it("classifies the LD2412 background-correction and query-params entities", () => {
    expect(
      classifyObjectId("button", `${base}_ld2412_start_dynamic_background_correction`)
    ).toEqual({ slot: "background_correction" });
    expect(
      classifyObjectId("binary_sensor", `${base}_ld2412_dynamic_background_correction_status`)
    ).toEqual({ slot: "background_correction_status" });
    expect(classifyObjectId("button", `${base}_ld2412_query_params`)).toEqual({
      slot: "query_params",
    });
    // Dedup suffixes still land on the same slots.
    expect(classifyObjectId("button", `${base}_ld2412_query_params_2`)).toEqual({
      slot: "query_params",
    });
  });

  it("classifies the MSR firmware's query params button, which has no chip prefix", () => {
    expect(classifyObjectId("button", `${base}_query_params`)).toEqual({ slot: "query_params" });
    expect(classifyObjectId("button", `${base}_query_params_2`)).toEqual({ slot: "query_params" });
    expect(classifyObjectId("sensor", `${base}_query_params`)).toBeUndefined();
  });

  it("rejects the LD2412 calibration entities in the wrong domain", () => {
    expect(
      classifyObjectId("switch", `${base}_ld2412_start_dynamic_background_correction`)
    ).toBeUndefined();
    expect(
      classifyObjectId("sensor", `${base}_ld2412_dynamic_background_correction_status`)
    ).toBeUndefined();
    expect(classifyObjectId("sensor", `${base}_ld2412_query_params`)).toBeUndefined();
  });

  it("does not confuse target with moving/still target", () => {
    expect(classifyObjectId("binary_sensor", `${base}_radar_moving_target`)).toEqual({
      slot: "moving_target",
    });
    expect(classifyObjectId("binary_sensor", `${base}_radar_target_2`)).toEqual({
      slot: "radar_target",
    });
  });

  it("keeps the any-zone sensor apart from the numbered zones", () => {
    expect(classifyObjectId("binary_sensor", `${base}_radar_zone_occupancy`)).toEqual({
      slot: "zone_occupancy",
    });
    expect(classifyObjectId("binary_sensor", `${base}_radar_zone_occupancy_2`)).toEqual({
      slot: "zone_occupancy",
    });
    expect(classifyObjectId("binary_sensor", `${base}_radar_zone_2_occupancy`)).toEqual({
      slot: "zone_2_occupancy",
    });
  });

  it("rejects a matching suffix in the wrong domain", () => {
    expect(classifyObjectId("automation", `${base}_radar_engineering_mode`)).toBeUndefined();
    expect(classifyObjectId("sensor", `${base}_g3_move_threshold`)).toBeUndefined();
  });

  // The first pattern whose suffix matches decides: a domain mismatch returns
  // undefined at once instead of trying later patterns. No two suffixes
  // overlap today; if one is added that also matches these ids in these
  // domains, this pins which one wins.
  it("a wrong-domain hit short-circuits classification", () => {
    expect(classifyObjectId("sensor", `${base}_radar_engineering_mode`)).toBeUndefined();
    expect(classifyObjectId("number", `${base}_g3_move_energy`)).toBeUndefined();
    expect(classifyObjectId("sensor", `${base}_ld2412_presence`)).toBeUndefined();
    expect(classifyObjectId("switch", `${base}_radar_timeout_2`)).toBeUndefined();
  });

  it("returns undefined for unrelated object ids", () => {
    expect(classifyObjectId("sensor", "kitchen_temperature")).toBeUndefined();
  });
});

describe("entityMapFromDevice", () => {
  it("builds the map from the device's actual (renamed) entity ids", () => {
    // Each entity keeps its firmware suffix but the user renamed the prefixes —
    // base-name extraction would disagree across entities, device lookup won't.
    const ids = [
      "switch.kitchen_presence_radar_engineering_mode",
      "number.some_other_name_g3_move_threshold_2",
      "sensor.foo_g8_still_energy",
      "binary_sensor.bar_radar_target",
    ];
    const hass = hassWith(ids);
    const map = entityMapFromDevice(hass, "dev1")!;
    expect(map.engineering_mode).toBe(ids[0]);
    expect(map.move_threshold[3]).toBe(ids[1]);
    expect(map.still_energy[8]).toBe(ids[2]);
    expect(map.radar_target).toBe(ids[3]);
  });

  it("ignores entities belonging to other devices", () => {
    const hass = hassWith([`switch.${base}_radar_engineering_mode`]);
    hass.states["switch.other_radar_engineering_mode"] = {
      entity_id: "switch.other_radar_engineering_mode",
      state: "off",
      attributes: {},
    };
    hass.entities["switch.other_radar_engineering_mode"] = { device_id: "dev2" };
    const map = entityMapFromDevice(hass, "dev1")!;
    expect(map.engineering_mode).toBe(`switch.${base}_radar_engineering_mode`);
  });

  it("returns undefined when nothing classifies", () => {
    expect(entityMapFromDevice(hassWith(["sensor.kitchen_temperature"]), "dev1")).toBeUndefined();
    expect(entityMapFromDevice(hassWith([]), "dev1")).toBeUndefined();
  });
});

describe("detectProfileFromEntities", () => {
  it("detects LD2412 from ld2412-marked entities", () => {
    const hass = hassWith([`switch.${base}_ld2412_engineering_mode`]);
    expect(detectProfileFromEntities(hass, "dev1")?.key).toBe("ld2412");
  });

  it("detects LD2410 from its concrete markers", () => {
    const hass = hassWith([`number.${base}_g3_move_threshold`]);
    expect(detectProfileFromEntities(hass, "dev1")?.key).toBe("ld2410");
  });

  it("is inconclusive on chip-agnostic entities (e.g. esp_reboot)", () => {
    const hass = hassWith([`button.${base}_esp_reboot`]);
    expect(detectProfileFromEntities(hass, "dev1")).toBeUndefined();
  });
});

describe("resolveEntities via device_id with dedup/renamed ids", () => {
  it("resolves deduped entity ids that base-name construction would miss", () => {
    // HA appended `_2` on collision — constructed ids would point at the
    // other device's entities.
    const ids = [
      `switch.${base}_radar_engineering_mode_2`,
      `number.${base}_g0_move_threshold_2`,
      `sensor.${base}_radar_detection_distance_2`,
    ];
    const map = resolveEntities(hassWith(ids), { type: "x", device_id: "dev1" });
    expect(map.engineering_mode).toBe(ids[0]);
    expect(map.move_threshold[0]).toBe(ids[1]);
    expect(map.detection_distance).toBe(ids[2]);
  });
});

describe("resolveProfile", () => {
  it("prefers the registry model when entity probing is blind", () => {
    const hass = hassWith([`button.${base}_esp_reboot`]);
    hass.devices.dev1 = { manufacturer: "ApolloAutomation", model: "R-PRO-1-W" };
    expect(resolveProfile(hass, { type: "x", device_id: "dev1" })?.key).toBe("ld2412");
  });

  it("prefers a concrete entity match over a conflicting registry model", () => {
    const hass = hassWith([`switch.${base}_radar_engineering_mode`]);
    hass.devices.dev1 = { manufacturer: "ApolloAutomation", model: "R-PRO-1-W" };
    expect(resolveProfile(hass, { type: "x", device_id: "dev1" })?.key).toBe("ld2410");
  });

  it("returns no profile for a registry-matched zone-only model (MTR-1)", () => {
    const hass = hassWith(["sensor.foo_ld2450_target_1_x"]);
    hass.devices.dev1 = { manufacturer: "ApolloAutomation", model: "MTR-1" };
    expect(resolveProfile(hass, { type: "x", device_id: "dev1" })).toBeUndefined();
  });
});

describe("LD2412_PROFILE.entityMap", () => {
  it("includes the background-correction button, its status and query params", () => {
    const b = "apollo_r_pro_1_abcd";
    const map = LD2412_PROFILE.entityMap(b);
    expect(map.background_correction).toBe(
      `button.${b}_ld2412_start_dynamic_background_correction`
    );
    expect(map.background_correction_status).toBe(
      `binary_sensor.${b}_ld2412_dynamic_background_correction_status`
    );
    expect(map.query_params).toBe(`button.${b}_ld2412_query_params`);
  });

  it("leaves the background-correction slots unset on the LD2410 map", () => {
    const map = entityMapFromBaseName(base);
    expect(map.background_correction).toBeUndefined();
    expect(map.background_correction_status).toBeUndefined();
    // The MSR has a query params button too, spelled without the chip prefix.
    expect(map.query_params).toBe(`button.${base}_query_params`);
  });
});

describe("exists", () => {
  const hass = hassWith([`switch.${base}_radar_engineering_mode`]);
  it("is true for present ids and false otherwise", () => {
    expect(exists(hass, `switch.${base}_radar_engineering_mode`)).toBe(true);
    expect(exists(hass, `switch.${base}_missing`)).toBe(false);
    expect(exists(hass, undefined)).toBe(false);
  });
});

describe("deviceInfoEntities", () => {
  it("finds an MSR's versions, update entity, signal and restart", () => {
    const hass = hassWith([
      `button.${base}_firmware_update`,
      `sensor.${base}_apollo_firmware_version`,
      `sensor.${base}_radar_firmware_version`,
      `update.${base}_firmware_update`,
      `sensor.${base}_rssi`,
      `button.${base}_esp_reboot`,
    ]);
    expect(deviceInfoEntities(hass, "dev1")).toEqual({
      apollo_firmware: `sensor.${base}_apollo_firmware_version`,
      ld2410_firmware: `sensor.${base}_radar_firmware_version`,
      // The update domain only: the template button of the same name installs
      // with no dialog, so it is never picked, even listed first.
      update: `update.${base}_firmware_update`,
      rssi: `sensor.${base}_rssi`,
      esp_reboot: `button.${base}_esp_reboot`,
    });
  });

  it("finds both chip versions on an R PRO-1 and skips this integration's own entities", () => {
    const d = "apollo_r_pro_1_7a711c";
    const hass = hassWith([
      `sensor.${d}_ld2412_firmware`,
      `sensor.${d}_ld2450_firmware_2`,
      `sensor.${d}_zone_1_rssi`,
    ]);
    hass.entities[`sensor.${d}_zone_1_rssi`].platform = "apollo_mmwave";
    expect(deviceInfoEntities(hass, "dev1")).toEqual({
      ld2412_firmware: `sensor.${d}_ld2412_firmware`,
      ld2450_firmware: `sensor.${d}_ld2450_firmware_2`,
    });
  });

  it("is empty for a device with none of them", () => {
    expect(deviceInfoEntities(hassWith([`sensor.${base}_rssi`]), "other")).toEqual({});
  });
});
