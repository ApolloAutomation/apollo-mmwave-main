import { describe, it, expect } from "vitest";
import {
  detectRadarDevices,
  buildDeviceCards,
  buildDeviceSections,
  deviceView,
  generateCards,
  generateViews,
  type RadarDevice,
} from "../src/strategy-core";
import { LD2410_PROFILE, LD2412_PROFILE } from "../src/profiles";
import type { HomeAssistant, HassEntity } from "../src/types";

const base = "apollo_msr_2_m4c4dd";

function deviceHass(): HomeAssistant {
  const m = LD2410_PROFILE.entityMap(base);
  const states: Record<string, HassEntity> = {};
  const entities: Record<string, { device_id?: string }> = {};
  const ids = [
    m.engineering_mode!,
    m.radar_timeout!,
    m.zone_1_start!,
    m.max_move_distance!,
    m.move_threshold[0],
    m.radar_target!,
    m.detection_distance!,
  ];
  for (const id of ids) {
    states[id] = { entity_id: id, state: "0", attributes: {} };
    entities[id] = { device_id: "dev1" };
  }
  return { states, entities, devices: { dev1: { name: "Living Room MSR-2" } } };
}

const ld2410Dev: RadarDevice = {
  deviceId: "dev1",
  base,
  name: "Living Room MSR-2",
  profile: LD2410_PROFILE,
  ld2450: false,
  online: true,
};

describe("detectRadarDevices", () => {
  it("finds an LD2410 device and tags its profile", () => {
    const devices = detectRadarDevices(deviceHass());
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ deviceId: "dev1", base });
    expect(devices[0].profile?.key).toBe("ld2410");
  });

  it("detects an LD2412 (R-PRO) device by its ld2412 entities", () => {
    const b = "apollo_r_pro_1_abcd";
    const id = `switch.${b}_ld2412_engineering_mode`;
    const hass: HomeAssistant = {
      states: { [id]: { entity_id: id, state: "off", attributes: {} } },
      entities: { [id]: { device_id: "rpro" } },
      devices: { rpro: { name: "Office R-PRO-1" } },
    };
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].profile?.key).toBe("ld2412");
    expect(devices[0].ld2450).toBe(false);
  });

  it("ignores non-radar devices", () => {
    const id = "sensor.kitchen_temperature";
    const hass: HomeAssistant = {
      states: { [id]: { entity_id: id, state: "20", attributes: {} } },
      entities: { [id]: { device_id: "devX" } },
      devices: { devX: { name: "Thermometer" } },
    };
    expect(detectRadarDevices(hass)).toHaveLength(0);
  });
});

describe("buildDeviceCards", () => {
  const cards = buildDeviceCards(deviceHass(), ld2410Dev, "in");

  it("includes both custom chart cards bound to the device base name", () => {
    const types = cards.map((c: any) => c.type);
    expect(types).toContain("custom:apollo-radar-distance-card");
    expect(types).toContain("custom:apollo-radar-gate-energy-card");
    const distance = cards.find(
      (c: any) => c.type === "custom:apollo-radar-distance-card"
    );
    expect(distance).toMatchObject({ device_base_name: base, distance_unit: "in" });
  });

  it("titles entity cards with the device's chip label", () => {
    const titles = cards
      .filter((c: any) => c.type === "entities")
      .map((c: any) => c.title);
    expect(titles).toContain("LD2410 Controls");
  });

  it("includes a markdown help card linking the wiki", () => {
    const help = cards.find((c: any) => c.type === "markdown") as any;
    expect(help.content).toContain(LD2410_PROFILE.wikiUrl);
  });

  it("starts the help card with the Start here checklist", () => {
    const help = cards.find((c: any) => c.type === "markdown") as any;
    expect(help.content).toContain("Start here");
    expect(help.content).toContain("Calibrate with empty room");
    expect(help.content).toContain("Max Move Gate / Max Still Gate");
    expect(help.content).toContain("Radar Timeout");
    expect(help.content).not.toContain("\u2014");
  });

  it("places the calibrate card right after the help card with the device ids", () => {
    expect(cards[0].type).toBe("markdown");
    expect(cards[1]).toMatchObject({
      type: "custom:apollo-radar-calibrate-card",
      device_id: "dev1",
      device_base_name: base,
      title: "Auto-calibrate",
    });
    expect(cards[1]).not.toHaveProperty("calibration");
  });

  it("passes the strategy's calibration block through to the card", () => {
    const calibration = { duration_s: 120, settle_s: 0 };
    const withOptions = buildDeviceCards(deviceHass(), ld2410Dev, "in", calibration);
    const card = withOptions.find(
      (c: any) => c.type === "custom:apollo-radar-calibrate-card"
    ) as any;
    expect(card.calibration).toEqual(calibration);
    const fromConfig = generateCards(deviceHass(), { calibration }).find(
      (c: any) => c.type === "custom:apollo-radar-calibrate-card"
    ) as any;
    expect(fromConfig.calibration).toEqual(calibration);
  });
});

describe("calibrate card placement in sections", () => {
  it("is the first card of the first section for an LD2410 device", () => {
    const sections = buildDeviceSections(deviceHass(), ld2410Dev, "in");
    expect(sections[0].cards[0].type).toBe("custom:apollo-radar-calibrate-card");
    expect(sections[0].cards[1].type).toBe("markdown");
  });

  it("is the first card of the first section for an LD2412 device", () => {
    const b = "apollo_r_pro_1_abcd";
    const id = `switch.${b}_ld2412_engineering_mode`;
    const hass: HomeAssistant = {
      states: { [id]: { entity_id: id, state: "off", attributes: {} } },
      entities: { [id]: { device_id: "rpro" } },
      devices: { rpro: { name: "Office R-PRO-1" } },
    };
    const dev = detectRadarDevices(hass)[0];
    const sections = buildDeviceSections(hass, dev);
    expect(sections[0].cards[0]).toMatchObject({
      type: "custom:apollo-radar-calibrate-card",
      device_id: "rpro",
      device_base_name: b,
    });
  });

  it("is absent for an LD2450-only device (MTR-1)", () => {
    const x = "sensor.apollo_mtr_1_abcd_target_1_x";
    const hass: HomeAssistant = {
      states: { [x]: { entity_id: x, state: "100", attributes: {} } },
      entities: { [x]: { device_id: "mtr" } },
      devices: { mtr: { name: "Hall MTR-1" } },
    };
    const dev = detectRadarDevices(hass)[0];
    expect(dev.profile).toBeUndefined();
    const types = buildDeviceCards(hass, dev).map((c: any) => c.type);
    expect(types).not.toContain("custom:apollo-radar-calibrate-card");
    const sectionTypes = buildDeviceSections(hass, dev).flatMap((s) =>
      s.cards.map((c: any) => c.type)
    );
    expect(sectionTypes).not.toContain("custom:apollo-radar-calibrate-card");
  });

  it("keeps the card on an offline gate radar so it can render its own offline state", () => {
    const offline: RadarDevice = { ...ld2410Dev, online: false };
    const sections = buildDeviceSections(deviceHass(), offline, "in");
    expect(sections[0].cards[0].type).toBe("custom:apollo-radar-calibrate-card");
  });
});

describe("profile tips", () => {
  it("point the gate tip at the calibrate card and explain the timeout in the range tip", () => {
    for (const profile of [LD2410_PROFILE, LD2412_PROFILE]) {
      expect(profile.gateTip).toContain("Calibrate with empty room");
      expect(profile.rangeTip).toContain("**Radar Timeout** is how long presence stays on");
    }
  });
});

describe("LD2412 gate count", () => {
  it("builds 14 gates (g00..g13) in the entity map", () => {
    const m = LD2412_PROFILE.entityMap("apollo_r_pro_1_abcd");
    expect(m.move_threshold).toHaveLength(14);
    expect(m.move_threshold[0]).toBe(
      "number.apollo_r_pro_1_abcd_ld2412_g00_move_threshold"
    );
    expect(m.move_threshold[13]).toBe(
      "number.apollo_r_pro_1_abcd_ld2412_g13_move_threshold"
    );
  });
});

describe("deviceView / generateViews", () => {
  const view = deviceView(deviceHass(), ld2410Dev, "in");

  it("is a sections view titled with the device name", () => {
    expect(view).toMatchObject({
      title: "Living Room MSR-2",
      path: base,
      type: "sections",
    });
  });

  it("groups cards into multiple column sections", () => {
    expect(view.sections.length).toBeGreaterThan(1);
    for (const section of view.sections) {
      expect(section.type).toBe("grid");
      expect(section.cards.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("produces one view (tab) per detected device", () => {
    expect(generateViews(deviceHass(), {})).toHaveLength(1);
  });
});

describe("generateCards (section strategy)", () => {
  it("returns a flat card list for all detected devices", () => {
    const cards = generateCards(deviceHass(), {});
    expect(cards.length).toBeGreaterThan(1);
    // Flat list of cards, not sections.
    for (const card of cards) expect(card.type).toBeDefined();
    expect(cards.some((c) => c.type === "grid")).toBe(false);
  });

  it("limits to one device when device_id is set", () => {
    expect(generateCards(deviceHass(), { device_id: "nope" })).toHaveLength(0);
    expect(
      generateCards(deviceHass(), { device_id: "dev1" }).length
    ).toBeGreaterThan(1);
  });
});

describe("LD2450 zone mapping", () => {
  function ld2450Hass(extra: Record<string, HassEntity> = {}): {
    hass: HomeAssistant;
    base: string;
  } {
    const b = "apollo_r_pro_1_abcd";
    const x = `sensor.${b}_ld2450_target_1_x`;
    const states: Record<string, HassEntity> = {
      [x]: { entity_id: x, state: "100", attributes: {} },
      ...extra,
    };
    const entities: Record<string, { device_id?: string }> = {};
    for (const id of Object.keys(states)) entities[id] = { device_id: "rpro" };
    return {
      hass: { states, entities, devices: { rpro: { name: "Office R-PRO-1" } } },
      base: b,
    };
  }

  it("detects an LD2450-only device (e.g. MTR-1) with no tuning profile", () => {
    const { hass } = ld2450Hass();
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].profile).toBeUndefined();
    expect(devices[0].ld2450).toBe(true);
  });

  it("gives the zone card a device id, not a location name", () => {
    const { hass } = ld2450Hass();
    const dev = detectRadarDevices(hass)[0];
    const cards = buildDeviceCards(hass, dev);
    const zone = cards.find(
      (c: any) => c.type === "custom:apollo-radar-zone-map-card"
    ) as any;
    expect(zone).toBeDefined();
    expect(zone.device_id).toBe(dev.deviceId);
    expect(zone.location).toBeUndefined();
    // The name still rides along, as a display title only.
    expect(zone.title).toBe("Office R-PRO-1");
  });

  it("adds the zone map alongside tuning on a device with both radars", () => {
    const b = "apollo_r_pro_1_abcd";
    const eng = `switch.${b}_ld2412_engineering_mode`;
    const x = `sensor.${b}_ld2450_target_1_x`;
    const states: Record<string, HassEntity> = {
      [eng]: { entity_id: eng, state: "off", attributes: {} },
      [x]: { entity_id: x, state: "100", attributes: {} },
    };
    const entities: Record<string, { device_id?: string }> = {
      [eng]: { device_id: "rpro" },
      [x]: { device_id: "rpro" },
    };
    const hass: HomeAssistant = {
      states,
      entities,
      devices: { rpro: { name: "Office R-PRO-1" } },
    };
    const dev = detectRadarDevices(hass)[0];
    expect(dev.profile?.key).toBe("ld2412");
    expect(dev.ld2450).toBe(true);
    const cards = buildDeviceCards(hass, dev);
    const types = cards.map((c: any) => c.type);
    expect(types).toContain("custom:apollo-radar-gate-energy-card");
    expect(types).toContain("custom:apollo-radar-zone-map-card");
  });
});
