import { describe, it, expect } from "vitest";
import {
  aboutDistance,
  controlRows,
  gateName,
  zoneConfigRows,
  moveThresholdRows,
  stillThresholdRows,
  rangeRows,
  occupancyRows,
  presentRows,
  restartRadarRow,
} from "../src/panels/entity-rows";
import { deviceRows } from "../src/panels/device-rows";
import { builtInZoneRows, ld2450ControlRows, ld2450LiveRows } from "../src/panels/ld2450-rows";
import { entityMapFromBaseName, entityMapFromDevice } from "../src/entities";
import { LD2412_PROFILE } from "../src/profiles";
import type { HomeAssistant } from "../src/types";

const base = "apollo_msr_2_m4c4dd";
const m = entityMapFromBaseName(base);

describe("row builders", () => {
  it("controls include engineering mode but leave the whole-device reboot to the Device card", () => {
    const ids = controlRows(m, "LD2410").map((r) => r.entity);
    expect(ids).toContain(`switch.${base}_radar_engineering_mode`);
    expect(ids).not.toContain(`button.${base}_esp_reboot`);
  });

  it("names the radar's own Bluetooth so it is not taken for the Bluetooth proxy", () => {
    expect(controlRows(m, "LD2410")).toContainEqual({
      entity: `switch.${base}_ld2410_bluetooth`,
      name: "Radar Bluetooth (HLK app)",
    });
  });

  it("asks before Restart Radar and Factory Reset Radar press", () => {
    const rows = controlRows(m, "LD2410");
    expect(rows.find((r) => r.name === "Restart Radar")).toEqual({
      entity: `button.${base}_restart_radar`,
      name: "Restart Radar",
      confirm: {
        text: "Restart the LD2410 radar? It stops detecting for a few seconds while it starts up.",
        action: "Restart",
      },
    });
    expect(rows.find((r) => r.name === "Factory Reset Radar")?.confirm?.action).toBe("Reset");
    expect(rows.filter((r) => !r.confirm).map((r) => r.name)).toEqual([
      "Radar Engineering Mode",
      "Radar Bluetooth (HLK app)",
    ]);
  });

  it("adds no restart row for an unresolved button", () => {
    expect(restartRadarRow(undefined, "LD2450")).toEqual([]);
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

  it("marks only the two range gates and every threshold for the slider lock", () => {
    const range = rangeRows(m, ["Max Move Gate", "Max Still Gate"], "Gate Size");
    expect(range.filter((r) => r.slider).map((r) => r.name)).toEqual([
      "Max Move Gate",
      "Max Still Gate",
    ]);
    // Radar Timeout is a box and Gate Size a select: a scroll moves neither.
    expect(range.slice(0, 2).every((r) => r.slider === undefined)).toBe(true);
    for (const r of [...moveThresholdRows(m), ...stillThresholdRows(m)]) {
      expect(r.slider, r.name).toBe(true);
    }
    const l = {
      zone_type: "select.hall_zone_type",
      timeout: "number.hall_timeout",
      presence: "binary_sensor.hall_presence",
      targets: [],
      zones: [{ x1: "number.hall_zone_1_x1", y1: "number.hall_zone_1_y1" }],
    };
    const plain = [
      ...zoneConfigRows(m),
      ...controlRows(m, "LD2410"),
      ...occupancyRows(m),
      ...ld2450ControlRows(l),
      ...ld2450LiveRows(l),
      ...builtInZoneRows(l, 0),
    ];
    expect(plain.length).toBeGreaterThan(15);
    for (const r of plain) {
      expect(r.slider, r.name).toBeUndefined();
    }
  });

  it("occupancy has target/moving/still + 3 zones + any zone = 7 rows", () => {
    const rows = occupancyRows(m);
    expect(rows).toHaveLength(7);
    expect(rows[6]).toEqual({
      entity: `binary_sensor.${base}_radar_zone_occupancy`,
      name: "Any zone",
    });
  });

  it("labels thresholds with the name function it is given", () => {
    const names = moveThresholdRows(m, (n) => gateName(n, 0.75, "m")).map((r) => r.name);
    expect(names.slice(0, 5)).toEqual([
      "G0 (at the sensor)",
      "G1 (about 0.75 m)",
      "G2 (about 1.5 m)",
      "G3 (about 2.3 m)",
      "G4 (about 3 m)",
    ]);
    expect(stillThresholdRows(m, (n) => `Gate ${n}`)[8].name).toBe("Gate 8");
  });
});

describe("gate distances", () => {
  it("writes meters with two decimals below 1 m and one above", () => {
    expect(aboutDistance(0.75, "m")).toBe("about 0.75 m");
    expect(aboutDistance(0.2 * 3, "m")).toBe("about 0.6 m");
    expect(aboutDistance(3, "m")).toBe("about 3 m");
    expect(aboutDistance(9.75, "m")).toBe("about 9.8 m");
  });

  it("writes feet with one decimal below 3 ft and whole feet above", () => {
    expect(aboutDistance(0.75, "ft")).toBe("about 2.5 ft");
    expect(aboutDistance(3, "ft")).toBe("about 10 ft");
    expect(aboutDistance(6, "ft")).toBe("about 20 ft");
  });

  it("names each gate by the far end of its band, gate 0 at the sensor", () => {
    expect(gateName(0, 0.75, "ft")).toBe("G0 (at the sensor)");
    expect(gateName(4, 0.75, "m")).toBe("G4 (about 3 m)");
    expect(gateName(4, 0.75, "ft")).toBe("G4 (about 10 ft)");
    expect(gateName(13, 0.5, "m")).toBe("G13 (about 6.5 m)");
  });
});

describe("LD2450 control rows", () => {
  const l = {
    zone_type: "select.hall_zone_type",
    timeout: "number.hall_timeout",
    bluetooth: "switch.hall_ld2450_bluetooth",
    restart: "button.hall_ld2450_restart",
    factory_reset: "button.hall_factory_reset_ld2450",
    targets: [{}, {}, {}],
    zones: [{}, {}, {}],
  };

  it("names the radar's own Bluetooth and asks before both buttons", () => {
    const rows = ld2450ControlRows(l);
    expect(rows.map((r) => r.name)).toEqual([
      "Zone Type",
      "Radar Timeout",
      "Radar Bluetooth (HLK app)",
      "Restart Radar",
      "Factory Reset Radar",
    ]);
    expect(rows.filter((r) => r.confirm).map((r) => r.entity)).toEqual([
      "button.hall_ld2450_restart",
      "button.hall_factory_reset_ld2450",
    ]);
  });
});

describe("Device card rows", () => {
  const restart = { name: "Restart device", text: "Restart the whole device?" };

  it("lists the versions, the update entity and a restart that asks first", () => {
    const rows = deviceRows(
      {
        apollo_firmware: "sensor.den_apollo_firmware_version",
        ld2410_firmware: "sensor.den_radar_firmware_version",
        update: "update.den_firmware_update",
        rssi: "sensor.den_rssi",
        esp_reboot: "button.den_esp_reboot",
      },
      restart
    );
    expect(rows).toEqual([
      { entity: "sensor.den_apollo_firmware_version", name: "Apollo firmware" },
      { entity: "sensor.den_radar_firmware_version", name: "LD2410 firmware" },
      { entity: "update.den_firmware_update", name: "Firmware update" },
      {
        entity: "button.den_esp_reboot",
        name: "Restart device",
        confirm: { text: "Restart the whole device?", action: "Restart" },
      },
    ]);
  });

  it("shows both chip versions on a device with two radars", () => {
    const names = deviceRows(
      { ld2412_firmware: "sensor.o_ld2412_firmware", ld2450_firmware: "sensor.o_ld2450_firmware" },
      restart
    ).map((r) => r.name);
    expect(names).toEqual(["LD2412 firmware", "LD2450 firmware"]);
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
      { entity: `number.${b}_ld2412_max_distance_gate`, name: "Max Gate", slider: true },
      { entity: `number.${b}_ld2412_min_distance_gate`, name: "Min Gate", slider: true },
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
    expect(moveThresholdRows(sparse)).toEqual([{ entity: id, name: "G3", slider: true }]);
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
