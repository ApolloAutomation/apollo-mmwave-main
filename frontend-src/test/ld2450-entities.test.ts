/**
 * LD2450 entity resolution across both Apollo firmwares. The R PRO-1 names
 * every LD2450 entity "LD2450 ..."; the MTR-1 leaves most of them bare, so a
 * bare name must stay scoped to the device and must not catch the R PRO-1's
 * LD2412 entities, a built-in zone's own counts or the whole-device ESP
 * buttons.
 */

import { describe, it, expect } from "vitest";
import {
  builtInZoneNumberIds,
  ld2450Entities,
  zonePresenceSensors,
} from "../src/ld2450-entities";
import type { HassEntity, HomeAssistant } from "../src/types";

type Entities = HomeAssistant["entities"];

/** A hass whose `deviceId` owns `ids` (ESPHome platform, state "0"). */
function hassWith(ids: string[], deviceId = "dev1", extra: Entities = {}): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  const entities: Entities = {};
  for (const id of ids) {
    states[id] = { entity_id: id, state: "0", attributes: {} };
    entities[id] = { device_id: deviceId, platform: "esphome" };
  }
  for (const [id, entry] of Object.entries(extra)) {
    states[id] = { entity_id: id, state: "0", attributes: {} };
    entities[id] = entry;
  }
  return { states, entities, devices: { [deviceId]: { name: "Radar" } } };
}

/** The R PRO-1 firmware's names, LD2412 entities included. */
function rproIds(d: string): string[] {
  const ids = [
    `select.${d}_ld2450_zone_type`,
    `switch.${d}_ld2450_multi_target_tracking`,
    `switch.${d}_ld2450_bluetooth`,
    `number.${d}_ld2450_timeout`,
    `button.${d}_ld2450_restart`,
    `button.${d}_ld2450_factory_reset`,
    `sensor.${d}_ld2450_firmware`,
    `binary_sensor.${d}_ld2450_presence`,
    `binary_sensor.${d}_ld2450_moving_target`,
    `binary_sensor.${d}_ld2450_still_target`,
    `sensor.${d}_ld2450_presence_target_count`,
    `sensor.${d}_ld2450_still_target_count`,
    `sensor.${d}_ld2450_moving_target_count`,
    // The other radar on the same device, and the whole-device buttons.
    `switch.${d}_ld2412_bluetooth`,
    `number.${d}_ld2412_timeout`,
    `button.${d}_ld2412_restart`,
    `button.${d}_ld2412_factory_reset`,
    `sensor.${d}_ld2412_firmware`,
    `binary_sensor.${d}_ld2412_presence`,
    `binary_sensor.${d}_ld2412_moving_target`,
    `binary_sensor.${d}_ld2412_still_target`,
    `button.${d}_esp_reboot`,
    `button.${d}_factory_reset_esp`,
  ];
  for (let n = 1; n <= 3; n++) {
    for (const f of ["x", "y", "speed", "angle", "distance", "direction"]) {
      ids.push(`sensor.${d}_ld2450_target_${n}_${f}`);
    }
    for (const f of ["x1", "y1", "x2", "y2"]) ids.push(`number.${d}_ld2450_zone_${n}_${f}`);
    for (const f of ["all", "still", "moving"]) {
      ids.push(`sensor.${d}_ld2450_zone_${n}_${f}_target_count`);
    }
  }
  return ids;
}

/** The MTR-1 firmware's names: mostly bare, a few with the chip prefix. */
function mtrIds(d: string): string[] {
  const ids = [
    `select.${d}_zone_type`,
    `switch.${d}_multi_target_tracking`,
    `switch.${d}_ld2450_bluetooth`,
    `number.${d}_timeout`,
    `button.${d}_factory_reset_ld2450`,
    `sensor.${d}_ld2450_firmware`,
    `binary_sensor.${d}_ld2450_presence`,
    `binary_sensor.${d}_ld2450_moving_target`,
    `binary_sensor.${d}_ld2450_still_target`,
    `sensor.${d}_presence_target_count`,
    `sensor.${d}_still_target_count`,
    `sensor.${d}_moving_target_count`,
    `button.${d}_esp_reboot`,
    `button.${d}_factory_reset_esp`,
  ];
  for (let n = 1; n <= 3; n++) {
    for (const f of ["x", "y", "speed", "angle", "distance", "direction", "resolution"]) {
      ids.push(`sensor.${d}_target_${n}_${f}`);
    }
    for (const f of ["x1", "y1", "x2", "y2"]) ids.push(`number.${d}_zone_${n}_${f}`);
    for (const f of ["all", "still", "moving"]) {
      ids.push(`sensor.${d}_zone_${n}_${f}_target_count`);
    }
  }
  return ids;
}

describe("ld2450Entities on an R PRO-1", () => {
  const d = "apollo_r_pro_1_7a711c";
  const l = ld2450Entities(hassWith(rproIds(d)), "dev1");

  it("finds every LD2450 setting and leaves the LD2412 and ESP entities alone", () => {
    expect(l).toMatchObject({
      zone_type: `select.${d}_ld2450_zone_type`,
      multi_target_tracking: `switch.${d}_ld2450_multi_target_tracking`,
      bluetooth: `switch.${d}_ld2450_bluetooth`,
      timeout: `number.${d}_ld2450_timeout`,
      restart: `button.${d}_ld2450_restart`,
      factory_reset: `button.${d}_ld2450_factory_reset`,
      firmware: `sensor.${d}_ld2450_firmware`,
    });
  });

  it("finds the live sensors and the radar-wide counts, not a zone's", () => {
    expect(l).toMatchObject({
      presence: `binary_sensor.${d}_ld2450_presence`,
      moving_target: `binary_sensor.${d}_ld2450_moving_target`,
      still_target: `binary_sensor.${d}_ld2450_still_target`,
      presence_target_count: `sensor.${d}_ld2450_presence_target_count`,
      still_target_count: `sensor.${d}_ld2450_still_target_count`,
      moving_target_count: `sensor.${d}_ld2450_moving_target_count`,
    });
  });

  it("finds each target's readings and each built-in zone by number", () => {
    expect(l.targets).toEqual(
      [1, 2, 3].map((n) => ({
        distance: `sensor.${d}_ld2450_target_${n}_distance`,
        direction: `sensor.${d}_ld2450_target_${n}_direction`,
        speed: `sensor.${d}_ld2450_target_${n}_speed`,
      }))
    );
    expect(l.zones[1]).toEqual({
      x1: `number.${d}_ld2450_zone_2_x1`,
      y1: `number.${d}_ld2450_zone_2_y1`,
      x2: `number.${d}_ld2450_zone_2_x2`,
      y2: `number.${d}_ld2450_zone_2_y2`,
      all_target_count: `sensor.${d}_ld2450_zone_2_all_target_count`,
      still_target_count: `sensor.${d}_ld2450_zone_2_still_target_count`,
      moving_target_count: `sensor.${d}_ld2450_zone_2_moving_target_count`,
    });
    expect(builtInZoneNumberIds(l)).toHaveLength(12);
  });

  it("matches nothing on a device with only LD2412 entities", () => {
    const ld2412Only = rproIds(d).filter((id) => !id.includes("_ld2450_"));
    const none = ld2450Entities(hassWith(ld2412Only), "dev1");
    const { targets, zones, ...scalars } = none;
    expect(scalars).toEqual({});
    expect(targets.every((t) => Object.keys(t).length === 0)).toBe(true);
    expect(zones.every((z) => Object.keys(z).length === 0)).toBe(true);
  });

  it("keeps the LD2412 out even when the device itself is named after it", () => {
    // Device "Office LD2412": the LD2412's timeout is office_ld2412_ld2412_timeout.
    const named = ld2450Entities(
      hassWith(["number.office_ld2412_ld2412_timeout", "number.office_ld2412_ld2450_timeout"]),
      "dev1"
    );
    expect(named.timeout).toBe("number.office_ld2412_ld2450_timeout");
  });

  it("finds a disabled-by-default entity under the generic id it was registered with", () => {
    // The user renamed the device to "Office" and later enabled Multi Target
    // Tracking, which kept the id derived from the original device name.
    const ids = rproIds("office").filter((id) => !id.endsWith("_multi_target_tracking"));
    const hass = hassWith([...ids, `switch.${d}_ld2450_multi_target_tracking`]);
    const found = ld2450Entities(hass, "dev1");
    expect(found.multi_target_tracking).toBe(`switch.${d}_ld2450_multi_target_tracking`);
    expect(found.zone_type).toBe("select.office_ld2450_zone_type");
  });

  it("leaves Multi Target Tracking unset while it is disabled (absent from the registry)", () => {
    const ids = rproIds(d).filter((id) => !id.endsWith("_multi_target_tracking"));
    expect(ld2450Entities(hassWith(ids), "dev1").multi_target_tracking).toBeUndefined();
  });
});

describe("ld2450Entities on an MTR-1", () => {
  const d = "apollo_mtr_1_cbbdb4";
  const l = ld2450Entities(hassWith(mtrIds(d)), "dev1");

  it("finds the bare, prefixed and suffixed spellings", () => {
    expect(l).toMatchObject({
      zone_type: `select.${d}_zone_type`,
      multi_target_tracking: `switch.${d}_multi_target_tracking`,
      bluetooth: `switch.${d}_ld2450_bluetooth`,
      timeout: `number.${d}_timeout`,
      factory_reset: `button.${d}_factory_reset_ld2450`,
      firmware: `sensor.${d}_ld2450_firmware`,
      presence: `binary_sensor.${d}_ld2450_presence`,
      presence_target_count: `sensor.${d}_presence_target_count`,
      still_target_count: `sensor.${d}_still_target_count`,
      moving_target_count: `sensor.${d}_moving_target_count`,
    });
    expect(l.targets[2]).toEqual({
      distance: `sensor.${d}_target_3_distance`,
      direction: `sensor.${d}_target_3_direction`,
      speed: `sensor.${d}_target_3_speed`,
    });
    expect(l.zones[0].x1).toBe(`number.${d}_zone_1_x1`);
    expect(l.zones[2].moving_target_count).toBe(`sensor.${d}_zone_3_moving_target_count`);
  });

  it("has no restart (the firmware has none) and never takes the ESP buttons", () => {
    expect(l.restart).toBeUndefined();
    expect(l.factory_reset).not.toContain("esp");
  });

  it("keeps a built-in zone's counts off the radar-wide count slots", () => {
    const zoneOnly = [`sensor.${d}_zone_1_still_target_count`, `sensor.${d}_zone_2_all_target_count`];
    const found = ld2450Entities(hassWith(zoneOnly), "dev1");
    expect(found.still_target_count).toBeUndefined();
    expect(found.presence_target_count).toBeUndefined();
    expect(found.zones[0].still_target_count).toBe(zoneOnly[0]);
  });

  it("accepts HA's dedup tail on every spelling", () => {
    const ids = [
      `select.${d}_zone_type_2`,
      `switch.${d}_multi_target_tracking_2`,
      `button.${d}_factory_reset_ld2450_2`,
      `sensor.${d}_target_1_distance_2`,
      `number.${d}_zone_3_y2_2`,
      `select.office_ld2450_zone_type_3`,
    ];
    const found = ld2450Entities(hassWith(ids.slice(0, 5)), "dev1");
    expect(found.zone_type).toBe(ids[0]);
    expect(found.multi_target_tracking).toBe(ids[1]);
    expect(found.factory_reset).toBe(ids[2]);
    expect(found.targets[0].distance).toBe(ids[3]);
    expect(found.zones[2].y2).toBe(ids[4]);
    expect(ld2450Entities(hassWith([ids[5]]), "dev1").zone_type).toBe(ids[5]);
  });
});

describe("ld2450Entities on a device named like a built-in zone", () => {
  // An MTR-1 renamed "Garage Zone 2", entity ids renamed with it, so the
  // base itself ends in a zone token.
  const d = "garage_zone_2";
  const ids = [
    ...mtrIds(d),
    `sensor.${d}_target_1_x`,
    `sensor.${d}_target_1_y`,
    `sensor.${d}_target_2_x`,
    `sensor.${d}_target_2_y`,
  ];
  const l = ld2450Entities(hassWith(ids), "dev1");

  it("still finds its bare settings, targets and built-in zone corners", () => {
    expect(l).toMatchObject({
      zone_type: `select.${d}_zone_type`,
      multi_target_tracking: `switch.${d}_multi_target_tracking`,
      timeout: `number.${d}_timeout`,
      presence_target_count: `sensor.${d}_presence_target_count`,
    });
    expect(l.targets[0].distance).toBe(`sensor.${d}_target_1_distance`);
    expect(l.zones[0].x1).toBe(`number.${d}_zone_1_x1`);
    expect(l.zones[2].y2).toBe(`number.${d}_zone_3_y2`);
  });

  it("files the radar-wide counts as the radar's, not as built-in zone 2's", () => {
    expect(l.still_target_count).toBe(`sensor.${d}_still_target_count`);
    expect(l.moving_target_count).toBe(`sensor.${d}_moving_target_count`);
    expect(l.zones[1]).toEqual({
      x1: `number.${d}_zone_2_x1`,
      y1: `number.${d}_zone_2_y1`,
      x2: `number.${d}_zone_2_x2`,
      y2: `number.${d}_zone_2_y2`,
      all_target_count: `sensor.${d}_zone_2_all_target_count`,
      still_target_count: `sensor.${d}_zone_2_still_target_count`,
      moving_target_count: `sensor.${d}_zone_2_moving_target_count`,
    });
  });

  it("matches an id registered under another base by its suffix", () => {
    // A disabled-by-default entity keeps the id it was registered with.
    const generic = "switch.apollo_mtr_1_cbbdb4_multi_target_tracking";
    const others = ids.filter((id) => !id.endsWith("_multi_target_tracking"));
    const found = ld2450Entities(hassWith([...others, generic]), "dev1");
    expect(found.multi_target_tracking).toBe(generic);
  });
});

describe("ld2450Entities scoping", () => {
  it("only looks at the asked device", () => {
    const hass = hassWith(["select.hall_zone_type"], "other");
    expect(ld2450Entities(hass, "dev1").zone_type).toBeUndefined();
    expect(ld2450Entities(hass, "other").zone_type).toBe("select.hall_zone_type");
  });

  it("checks the domain of each slot", () => {
    const found = ld2450Entities(
      hassWith(["sensor.hall_zone_type", "number.hall_multi_target_tracking", "sensor.hall_timeout"]),
      "dev1"
    );
    expect(found.zone_type).toBeUndefined();
    expect(found.multi_target_tracking).toBeUndefined();
    expect(found.timeout).toBeUndefined();
  });

  it("prefers the LD2450 prefixed spelling over a bare one", () => {
    const found = ld2450Entities(
      hassWith(["select.hall_zone_type", "select.hall_ld2450_zone_type"]),
      "dev1"
    );
    expect(found.zone_type).toBe("select.hall_ld2450_zone_type");
  });

  it("skips this integration's own entities", () => {
    const own = "binary_sensor.hall_ld2450_presence";
    const hass = hassWith([], "dev1", { [own]: { device_id: "dev1", platform: "apollo_mmwave" } });
    expect(ld2450Entities(hass, "dev1").presence).toBeUndefined();
  });
});

describe("zonePresenceSensors", () => {
  const own = (deviceId = "dev1") => ({ device_id: deviceId, platform: "apollo_mmwave" });

  it("lists the integration's binary sensors on the device, by zone number", () => {
    const hass = hassWith(["binary_sensor.hall_ld2450_presence"], "dev1", {
      "binary_sensor.hall_zone_10_presence": own(),
      "binary_sensor.hall_zone_2_presence": own(),
      "sensor.hall_zone_2": own(),
      "binary_sensor.kitchen_door": own(),
      "binary_sensor.hall_zone_1_presence_2": own(),
      "binary_sensor.other_zone_1_presence": own("dev2"),
    });
    expect(zonePresenceSensors(hass, "dev1")).toEqual([
      "binary_sensor.hall_zone_1_presence_2",
      "binary_sensor.hall_zone_2_presence",
      "binary_sensor.hall_zone_10_presence",
      // Renamed by the user: no zone number left, so it goes last.
      "binary_sensor.kitchen_door",
    ]);
  });

  it("falls back to the id shape when the frontend sends no platform", () => {
    const hass = hassWith([], "dev1", {
      "binary_sensor.hall_zone_1_presence": { device_id: "dev1" },
      "binary_sensor.hall_motion": { device_id: "dev1" },
    });
    expect(zonePresenceSensors(hass, "dev1")).toEqual(["binary_sensor.hall_zone_1_presence"]);
  });

  it("is empty before any zone is drawn", () => {
    expect(zonePresenceSensors(hassWith(mtrIds("hall")), "dev1")).toEqual([]);
  });
});
