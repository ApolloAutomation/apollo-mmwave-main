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
import { entityMapFromBaseName } from "../src/entities";
import { LD2412_PROFILE } from "../src/profiles";
import type { HomeAssistant } from "../src/types";

const base = "apollo_msr_2_m4c4dd";
const m = entityMapFromBaseName(base);

describe("row builders", () => {
  it("controls include engineering mode and reboot", () => {
    const ids = controlRows(m).map((r) => r.entity);
    expect(ids).toContain(`switch.${base}_radar_engineering_mode`);
    expect(ids).toContain(`button.${base}_esp_reboot`);
  });

  it("adds the two LD2412 background-correction rows right after engineering mode", () => {
    const b = "apollo_r_pro_1_abcd";
    const rows = controlRows(LD2412_PROFILE.entityMap(b));
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
    const names = controlRows(m).map((r) => r.name);
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

describe("presentRows", () => {
  it("drops rows whose entity is absent from hass", () => {
    const present = `switch.${base}_radar_engineering_mode`;
    const hass: HomeAssistant = {
      states: { [present]: { entity_id: present, state: "off", attributes: {} } },
      entities: {},
      devices: {},
    };
    const filtered = presentRows(hass, controlRows(m));
    expect(filtered.every((r) => r.entity === present)).toBe(true);
    expect(filtered).toHaveLength(1);
  });
});
