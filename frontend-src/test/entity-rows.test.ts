import { describe, it, expect } from "vitest";
import {
  controlRows,
  zoneConfigRows,
  moveThresholdRows,
  stillThresholdRows,
  rangeRows,
  occupancyRows,
  presentRows,
} from "../src/panels/entity-rows";
import { entityMapFromBaseName, entityMapFromDevice } from "../src/entities";
import { LD2412_PROFILE } from "../src/profiles";
import type { HomeAssistant } from "../src/types";

const base = "apollo_msr_2_m4c4dd";
const m = entityMapFromBaseName(base);

describe("row builders", () => {
  it("controls include engineering mode and reboot", () => {
    const ids = controlRows(m, "LD2410").map((r) => r.entity);
    expect(ids).toContain(`switch.${base}_radar_engineering_mode`);
    expect(ids).toContain(`button.${base}_esp_reboot`);
  });

  it("adds the two LD2412 background-correction rows right after engineering mode", () => {
    const b = "apollo_r_pro_1_abcd";
    const rows = controlRows(LD2412_PROFILE.entityMap(b), "LD2412");
    expect(rows.slice(0, 3)).toEqual([
      { entity: `switch.${b}_ld2412_engineering_mode`, name: "Radar Engineering Mode" },
      {
        entity: `button.${b}_ld2412_start_dynamic_background_correction`,
        name: "Start Dynamic Background Correction",
      },
      {
        entity: `binary_sensor.${b}_ld2412_dynamic_background_correction_status`,
        name: "Background Correction Running",
      },
    ]);
  });

  it("omits the background-correction rows when the slots are unset (LD2410)", () => {
    const names = controlRows(m, "LD2410").map((r) => r.name);
    expect(names).not.toContain("Start Dynamic Background Correction");
    expect(names).not.toContain("Background Correction Running");
    expect(names[0]).toBe("Radar Engineering Mode");
  });

  it("splits thresholds into 9 move + 9 still rows (LD2410), labelled by gate", () => {
    expect(moveThresholdRows(m)).toHaveLength(9);
    expect(stillThresholdRows(m)).toHaveLength(9);
    expect(moveThresholdRows(m)[0].name).toBe("G0");
  });

  it("zone config has 4 zone bounds (no timeout)", () => {
    expect(zoneConfigRows(m)).toHaveLength(4);
  });

  it("range card has timeout, gate size, and max/min gates (no doubled 'Gate')", () => {
    const rows = rangeRows(m, ["Max Move Gate", "Max Still Gate"], "Gate Size");
    const names = rows.map((r) => r.name);
    expect(names).toEqual([
      "Radar Timeout",
      "Gate Size",
      "Max Move Gate",
      "Max Still Gate",
    ]);
  });

  it("occupancy has target/moving/still + 3 zones = 6 rows", () => {
    expect(occupancyRows(m)).toHaveLength(6);
  });
});

describe("row builders on an LD2412 map", () => {
  const b = "apollo_r_pro_1_abcd";
  const m2 = LD2412_PROFILE.entityMap(b);
  const gateNames = Array.from({ length: 14 }, (_, n) => `G${n}`);

  it("splits thresholds into 14 move + 14 still rows, labeled G0..G13", () => {
    expect(moveThresholdRows(m2).map((r) => r.name)).toEqual(gateNames);
    expect(stillThresholdRows(m2).map((r) => r.name)).toEqual(gateNames);
    expect(moveThresholdRows(m2)[13].entity).toBe(`number.${b}_ld2412_g13_move_threshold`);
    expect(stillThresholdRows(m2)[0].entity).toBe(`number.${b}_ld2412_g00_still_threshold`);
  });

  it("labels the range rows from the profile, so the min gate slot reads 'Min Gate'", () => {
    const rows = rangeRows(m2, LD2412_PROFILE.rangeLabels, LD2412_PROFILE.gateSizeLabel);
    expect(rows).toEqual([
      { entity: `number.${b}_ld2412_timeout`, name: "Radar Timeout" },
      { entity: `select.${b}_ld2412_distance_resolution`, name: "Distance Resolution" },
      { entity: `number.${b}_ld2412_max_distance_gate`, name: "Max Gate" },
      { entity: `number.${b}_ld2412_min_distance_gate`, name: "Min Gate" },
    ]);
  });

  it("has no zone config rows", () => {
    expect(zoneConfigRows(m2)).toEqual([]);
  });
});

describe("row builders on a sparse registry map", () => {
  it("skips missing gates and keeps the real gate number in the label", () => {
    const id = "number.kitchen_radar_g3_move_threshold";
    const hass: HomeAssistant = {
      states: { [id]: { entity_id: id, state: "50", attributes: {} } },
      entities: { [id]: { device_id: "dev1" } },
      devices: { dev1: { name: "Kitchen radar" } },
    };
    const sparse = entityMapFromDevice(hass, "dev1")!;
    expect(moveThresholdRows(sparse)).toEqual([{ entity: id, name: "G3" }]);
    expect(stillThresholdRows(sparse)).toEqual([]);
  });
});

describe("presentRows", () => {
  it("drops rows whose entity is absent from hass", () => {
    const present = `switch.${base}_radar_engineering_mode`;
    const hass: HomeAssistant = {
      states: { [present]: { entity_id: present, state: "off", attributes: {} } },
      entities: {},
      devices: {},
    };
    const filtered = presentRows(hass, controlRows(m, "LD2410"));
    expect(filtered.every((r) => r.entity === present)).toBe(true);
    expect(filtered).toHaveLength(1);
  });
});
