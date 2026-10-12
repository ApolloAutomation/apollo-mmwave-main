/**
 * Offline and ghost devices. A registry-matched Apollo radar gets a tab
 * whether or not it is online (an unplugged testbench is still the user's
 * radar); its tab carries an offline note until it reports in. A device with
 * no registry model has only its entity names to vouch for it, so it needs a
 * live radar entity to count at all.
 */

import { describe, it, expect } from "vitest";
import {
  buildDeviceCards,
  detectRadarDevices,
  generateSections,
  generateViews,
  strategyDevices,
} from "../src/strategy-core";
import type { HassEntity, HomeAssistant } from "../src/types";

type Entities = Record<string, { device_id?: string; platform?: string }>;
type States = Record<string, HassEntity>;

function hassWith(
  states: States,
  entities: Entities,
  devices: HomeAssistant["devices"]
): HomeAssistant {
  return { states, entities, devices };
}

function state(id: string, value: string): HassEntity {
  return { entity_id: id, state: value, attributes: {} };
}

const MTR_DEVICE = {
  name: "Apollo MTR-1 cbbdb4",
  manufacturer: "ApolloAutomation",
  model: "MTR-1",
};

function mtrFixture(targetState: string | undefined): {
  states: States;
  entities: Entities;
} {
  const x = "sensor.apollo_mtr_1_cbbdb4_ld2450_target_1_x";
  const y = "sensor.apollo_mtr_1_cbbdb4_ld2450_target_1_y";
  const entities: Entities = {
    [x]: { device_id: "mtr" },
    [y]: { device_id: "mtr" },
  };
  const states: States = {};
  if (targetState !== undefined) {
    states[x] = state(x, targetState);
    states[y] = state(y, targetState);
  }
  return { states, entities };
}

describe("ghost/offline device filtering", () => {
  it("keeps a registry-matched radar whose states are all unavailable, marked offline", () => {
    const { states, entities } = mtrFixture("unavailable");
    const hass = hassWith(states, entities, { mtr: MTR_DEVICE });
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].online).toBe(false);
    expect(devices[0].ld2450).toBe(true);
    const cards = buildDeviceCards(hass, devices[0]);
    expect(cards[0].content).toContain("Offline right now");
  });

  it("keeps a registry-matched radar with registered entities but no states", () => {
    const { states, entities } = mtrFixture(undefined);
    const hass = hassWith(states, entities, { mtr: MTR_DEVICE });
    expect(detectRadarDevices(hass)[0].online).toBe(false);
  });

  it("waits for entities before listing a registry-matched device (add race)", () => {
    const hass = hassWith({}, {}, { mtr: MTR_DEVICE });
    expect(detectRadarDevices(hass)).toHaveLength(0);
  });

  it("ignores another integration's copy of a radar (same manufacturer and model)", () => {
    // UniFi tracks the same hardware by MAC and creates its own device entry
    // with the Apollo strings copied onto it. Seen live: three such copies
    // turned six tabs into nine.
    const tracker = "device_tracker.dining_room_mmwave_sensor";
    const real = mtrFixture("1200");
    for (const e of Object.values(real.entities)) (e as any).platform = "esphome";
    const hass = hassWith(
      { ...real.states, [tracker]: state(tracker, "home") },
      { ...real.entities, [tracker]: { device_id: "copy", platform: "unifi" } },
      { mtr: MTR_DEVICE, copy: { ...MTR_DEVICE }, bare: { ...MTR_DEVICE } }
    );
    expect(detectRadarDevices(hass).map((d) => d.deviceId)).toEqual(["mtr"]);
  });

  it("detects a live MTR-1 with no offline note", () => {
    const { states, entities } = mtrFixture("1200");
    const hass = hassWith(states, entities, { mtr: MTR_DEVICE });
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].ld2450).toBe(true);
    expect(devices[0].online).toBe(true);
    expect(buildDeviceCards(hass, devices[0])[0].content).not.toContain("Offline");
  });

  it("skips a device with no registry model until a radar entity is live", () => {
    // DIY / pre-project firmware: entity names are the only evidence.
    const x = "sensor.diy_ld2450_target_1_x";
    const dead = hassWith(
      { [x]: state(x, "unavailable") },
      { [x]: { device_id: "diy" } },
      { diy: { name: "DIY radar" } }
    );
    expect(detectRadarDevices(dead)).toHaveLength(0);
    const live = hassWith(
      { [x]: state(x, "10") },
      { [x]: { device_id: "diy" } },
      { diy: { name: "DIY radar" } }
    );
    expect(detectRadarDevices(live)).toHaveLength(1);
  });

  it("skips a non-mmWave Apollo device with only generic live entities", () => {
    // e.g. a dev board exposing esp_reboot but no radar entities at all.
    const reboot = "button.apollo_dev_1_esp_reboot";
    const hass = hassWith(
      { [reboot]: state(reboot, "unknown") },
      { [reboot]: { device_id: "dev1" } },
      {
        dev1: {
          name: "Apollo DEV-1",
          manufacturer: "ApolloAutomation",
          model: "DEV-1",
        },
      }
    );
    expect(detectRadarDevices(hass)).toHaveLength(0);
  });

  it("shows an explicitly selected device even while offline (devices config)", () => {
    const { states, entities } = mtrFixture("unavailable");
    const hass = hassWith(states, entities, { mtr: { name: "Unknown radar" } });
    // No registry model and nothing live: auto-detection skips it…
    expect(strategyDevices(hass, {})).toHaveLength(0);
    // …but an explicit selection forces it, capabilities from its entities.
    const devices = strategyDevices(hass, { devices: ["mtr"] });
    expect(devices).toHaveLength(1);
    expect(devices[0].ld2450).toBe(true);
  });

  it("shows exactly the selected devices, hiding unselected live ones", () => {
    const live = mtrFixture("1200");
    const hass = hassWith(live.states, live.entities, {
      mtr: MTR_DEVICE,
      other: { ...MTR_DEVICE, name: "Other MTR-1" },
    });
    const devices = strategyDevices(hass, { devices: ["other"] });
    expect(devices.map((d) => d.deviceId)).toEqual(["other"]);
  });

  it("drops a selected device that no longer exists in the registry", () => {
    const hass = hassWith({}, {}, {});
    expect(strategyDevices(hass, { devices: ["gone"] })).toHaveLength(0);
  });

  it("renders an offline note for a forced device with nothing detectable", () => {
    const hass = hassWith({}, {}, {
      mystery: { name: "Garage Sensor" }, // no manufacturer/model, no entities
    });
    const devices = strategyDevices(hass, { devices: ["mystery"] });
    expect(devices).toHaveLength(1);
    const cards = buildDeviceCards(hass, devices[0]);
    expect(cards[0].type).toBe("markdown");
    expect(cards[0].content).toContain("no radar data");
  });

  it("keeps a registry-matched device whose entities were renamed beyond recognition", () => {
    const renamed = "sensor.den_motion_distance";
    const hass = hassWith(
      { [renamed]: state(renamed, "42") },
      { [renamed]: { device_id: "msr" } },
      {
        msr: {
          name: "Den MSR-2",
          manufacturer: "ApolloAutomation",
          model: "MSR-2",
        },
      }
    );
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].profile?.key).toBe("ld2410");
  });

  describe("renamed beyond recognition, with a drawn zone", () => {
    // The integration attaches its own zone sensors to the radar's device and
    // they never go unavailable, so they must not stand in for the radar.
    const renamed = "sensor.den_motion_distance";
    const zone = "sensor.den_zone_1";
    const presence = "binary_sensor.den_zone_1_presence";
    const MSR_DEVICE = {
      name: "Den MSR-2",
      manufacturer: "ApolloAutomation",
      model: "MSR-2",
    };
    const zoneEntry = { device_id: "msr", platform: "apollo_mmwave" };
    const denWith = (extra: States, extraEntities: Entities) =>
      hassWith(
        {
          [renamed]: state(renamed, "unavailable"),
          [zone]: state(zone, "1"),
          [presence]: state(presence, "off"),
          ...extra,
        },
        {
          [renamed]: { device_id: "msr", platform: "esphome" },
          [zone]: zoneEntry,
          [presence]: zoneEntry,
          ...extraEntities,
        },
        { msr: MSR_DEVICE }
      );

    it("a live zone sensor does not keep a renamed, unavailable radar online", () => {
      const hass = denWith({}, {});
      const devices = detectRadarDevices(hass);
      expect(devices).toHaveLength(1);
      expect(devices[0].online).toBe(false);
      expect(buildDeviceCards(hass, devices[0])[0].content).toContain(
        "Offline right now"
      );
    });

    it("still counts a live esphome entity on the same device as online", () => {
      const wifi = "sensor.den_wifi_signal";
      const hass = denWith(
        { [wifi]: state(wifi, "-60") },
        { [wifi]: { device_id: "msr", platform: "esphome" } }
      );
      const devices = detectRadarDevices(hass);
      expect(devices).toHaveLength(1);
      expect(devices[0].online).toBe(true);
      expect(buildDeviceCards(hass, devices[0])[0].content).not.toContain("Offline");
    });

    it("still counts a live entity with no platform (older frontends)", () => {
      const wifi = "sensor.den_wifi_signal";
      const hass = denWith({ [wifi]: state(wifi, "-60") }, { [wifi]: { device_id: "msr" } });
      expect(detectRadarDevices(hass)[0].online).toBe(true);
    });
  });
});

describe("help card on the sections strategies (dashboard and view)", () => {
  // buildDeviceSections used to place the help card only in the gate-radar
  // tuning column, so a device without a profile lost it: an offline MTR-1
  // showed an empty zone map with no note, and a forced device with nothing
  // detectable got a tab with no sections at all.
  const sectionCards = (sections: Record<string, any>[]) =>
    sections.flatMap((s) => s.cards as Record<string, any>[]);
  const offlineMtr = () => {
    const { states, entities } = mtrFixture("unavailable");
    return hassWith(states, entities, { mtr: MTR_DEVICE });
  };
  const mystery = () => hassWith({}, {}, { mystery: { name: "Garage Sensor" } });

  it("carries the offline note for an offline MTR-1 on the dashboard strategy", () => {
    const views = generateViews(offlineMtr(), {});
    expect(views).toHaveLength(1);
    const cards = sectionCards(views[0].sections);
    expect(cards.some((c) => c.content?.includes("Offline right now"))).toBe(true);
    // The zone map is still there, after the note.
    expect(cards[cards.length - 1].type).toBe("custom:apollo-radar-zone-map-card");
  });

  it("carries the offline note for an offline MTR-1 on the view strategy", () => {
    const cards = sectionCards(generateSections(offlineMtr(), {}));
    expect(cards.some((c) => c.content?.includes("Offline right now"))).toBe(true);
  });

  it("keeps a live MTR-1 tab as just the zone map", () => {
    const { states, entities } = mtrFixture("1200");
    const hass = hassWith(states, entities, { mtr: MTR_DEVICE });
    const sections = generateViews(hass, {})[0].sections;
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe("grid");
    expect(sections[0].cards).toHaveLength(1);
    expect(sections[0].cards[0].type).toBe("custom:apollo-radar-zone-map-card");
  });

  it("explains a forced device with nothing detectable on the dashboard strategy", () => {
    const sections = generateViews(mystery(), { devices: ["mystery"] })[0].sections;
    expect(sections).toHaveLength(1);
    expect(sections[0].cards).toHaveLength(1);
    expect(sections[0].cards[0].content).toContain("no radar data");
    expect(sections[0].cards[0].content).not.toContain("Offline right now");
  });

  it("explains a forced device with nothing detectable on the view strategy", () => {
    const sections = generateSections(mystery(), { devices: ["mystery"] });
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe("grid");
    expect(sections[0].cards[0].content).toContain("no radar data");
  });
});

describe("MTR-1 firmware entity naming", () => {
  // Shipped MTR-1 firmware names the target sensors "Target-1 X" (no LD2450
  // prefix). Before 2.0.1 nothing recognised them: the tab appeared only via
  // the registry model, and the zone card had no targets to draw.
  const x = "sensor.apollo_mtr_1_cbbdb4_target_1_x";
  const y = "sensor.apollo_mtr_1_cbbdb4_target_1_y";
  const entities: Entities = { [x]: { device_id: "mtr" }, [y]: { device_id: "mtr" } };
  const states: States = { [x]: state(x, "1200"), [y]: state(y, "800") };

  it("detects a live MTR-1 by its target sensors even without a registry model", () => {
    const hass = hassWith(states, entities, { mtr: { name: "Apollo MTR-1 cbbdb4" } });
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].ld2450).toBe(true);
    expect(devices[0].base).toBe("apollo_mtr_1_cbbdb4");
  });

  it("marks it offline once its target sensors go unavailable", () => {
    const dead: States = { [x]: state(x, "unavailable"), [y]: state(y, "unavailable") };
    const hass = hassWith(dead, entities, { mtr: MTR_DEVICE });
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].online).toBe(false);
  });
});
