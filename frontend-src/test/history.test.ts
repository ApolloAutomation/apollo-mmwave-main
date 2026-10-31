import { describe, it, expect } from "vitest";
import { historyEntities, ld2450HistoryEntities } from "../src/panels/history";
import { entityMapFromBaseName } from "../src/entities";
import type { Ld2450Entities } from "../src/ld2450-entities";
import { LD2412_PROFILE } from "../src/profiles";

const base = "apollo_msr_2_m4c4dd";
const m = entityMapFromBaseName(base);

describe("historyEntities", () => {
  it("starts with the radar target named 'Detected'", () => {
    expect(historyEntities(m)[0]).toEqual({
      entity: `binary_sensor.${base}_radar_target`,
      name: "Detected",
    });
  });

  it("adds moving, still, the any-zone sensor and the three zones with short names", () => {
    expect(historyEntities(m)).toEqual([
      { entity: `binary_sensor.${base}_radar_target`, name: "Detected" },
      { entity: `binary_sensor.${base}_radar_moving_target`, name: "Moving" },
      { entity: `binary_sensor.${base}_radar_still_target`, name: "Still" },
      { entity: `binary_sensor.${base}_radar_zone_occupancy`, name: "Any zone" },
      { entity: `binary_sensor.${base}_radar_zone_1_occupancy`, name: "Zone 1" },
      { entity: `binary_sensor.${base}_radar_zone_2_occupancy`, name: "Zone 2" },
      { entity: `binary_sensor.${base}_radar_zone_3_occupancy`, name: "Zone 3" },
    ]);
  });

  it("does not include the gate threshold entities", () => {
    const ids = historyEntities(m).map((r) => r.entity);
    expect(ids.some((id) => id.includes("_threshold"))).toBe(false);
  });

  it("has presence, moving and still on an LD2412 (no distance zones)", () => {
    const b = "apollo_r_pro_1_abcd";
    expect(historyEntities(LD2412_PROFILE.entityMap(b))).toEqual([
      { entity: `binary_sensor.${b}_ld2412_presence`, name: "Detected" },
      { entity: `binary_sensor.${b}_ld2412_moving_target`, name: "Moving" },
      { entity: `binary_sensor.${b}_ld2412_still_target`, name: "Still" },
    ]);
  });

  it("names the chip on each line when the tab has two radars", () => {
    const b = "apollo_r_pro_1_abcd";
    expect(historyEntities(LD2412_PROFILE.entityMap(b), "LD2412").map((r) => r.name)).toEqual([
      "LD2412 Presence",
      "LD2412 Moving",
      "LD2412 Still",
    ]);
  });
});

describe("ld2450HistoryEntities", () => {
  const l: Ld2450Entities = {
    presence: "binary_sensor.hall_ld2450_presence",
    targets: [{}, {}, {}],
    zones: [{}, {}, {}],
  };
  const zones = ["binary_sensor.hall_zone_1_presence", "binary_sensor.hall_zone_2_presence"];

  it("graphs the LD2450's presence, then each drawn zone under its own name", () => {
    expect(ld2450HistoryEntities(l, zones)).toEqual([
      { entity: "binary_sensor.hall_ld2450_presence", name: "Presence" },
      { entity: zones[0] },
      { entity: zones[1] },
    ]);
  });

  it("names the LD2450 when the tab has two radars", () => {
    expect(ld2450HistoryEntities(l, [], "LD2450")).toEqual([
      { entity: "binary_sensor.hall_ld2450_presence", name: "LD2450 Presence" },
    ]);
  });

  it("still lists the drawn zones when the presence sensor is missing", () => {
    const none: Ld2450Entities = { targets: [{}, {}, {}], zones: [{}, {}, {}] };
    expect(ld2450HistoryEntities(none, zones)).toEqual(zones.map((entity) => ({ entity })));
  });
});
