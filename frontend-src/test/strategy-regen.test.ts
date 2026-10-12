import { describe, it, expect } from "vitest";
import { shouldRegenerate } from "../src/strategy";
import type { HomeAssistant, HassEntity } from "../src/types";

const base = "apollo_msr_2_m4c4dd";
const eng = `switch.${base}_radar_engineering_mode`;

function hassWith(
  states: Record<string, HassEntity>,
  entities: HomeAssistant["entities"],
  devices: HomeAssistant["devices"]
): HomeAssistant {
  return { states, entities, devices };
}

function state(id: string, value: string): HassEntity {
  return { entity_id: id, state: value, attributes: {} };
}

describe("shouldRegenerate", () => {
  const devices = { dev1: { name: "Living Room MSR-2" } };
  const baseStates: Record<string, HassEntity> = {
    [eng]: { entity_id: eng, state: "off", attributes: {} },
  };
  const baseEntities = { [eng]: { device_id: "dev1" } };
  const oldHass = hassWith(baseStates, baseEntities, devices);

  it("does NOT regenerate when only entities change (e.g. a zone sensor appears)", () => {
    const zone = `sensor.${base}_zone_1`;
    // `hass.entities` changed, so the full key is recomputed. The zone
    // sensor's id matches no radar entity pattern, so the key is the same.
    const newHass = hassWith(
      { ...baseStates, [zone]: { entity_id: zone, state: "1", attributes: {} } },
      { ...baseEntities, [zone]: { device_id: "dev1" } },
      devices
    );
    expect(shouldRegenerate({}, oldHass, newHass)).toBe(false);
  });

  it("regenerates when a new radar device is added", () => {
    const b2 = "apollo_r_pro_1_abcd";
    const eng2 = `switch.${b2}_ld2412_engineering_mode`;
    const newHass = hassWith(
      { ...baseStates, [eng2]: { entity_id: eng2, state: "off", attributes: {} } },
      { ...baseEntities, [eng2]: { device_id: "dev2" } },
      { ...devices, dev2: { name: "Office R-PRO-1" } }
    );
    expect(shouldRegenerate({}, oldHass, newHass)).toBe(true);
  });

  it("does NOT regenerate when devices object changes but the device set is the same", () => {
    // New registry object, same radar devices -> no rebuild.
    const newHass = hassWith(baseStates, baseEntities, { ...devices });
    expect(shouldRegenerate({}, oldHass, newHass)).toBe(false);
  });

  it("regenerates when a device added earlier becomes detectable via a later entities update", () => {
    // Race on device add: the device-registry event arrives before the
    // device's entities register. At that point detection fails, so no regen.
    const b2 = "apollo_r_pro_1_abcd";
    const eng2 = `switch.${b2}_ld2412_engineering_mode`;
    const devicesWithNew = { ...devices, dev2: { name: "Office R-PRO-1" } };
    const bareHass = hassWith(baseStates, baseEntities, devicesWithNew);
    expect(shouldRegenerate({}, oldHass, bareHass)).toBe(false);

    // The entities then register: `devices` is reference-equal, only
    // `entities`/`states` changed. This MUST regenerate (previously the
    // devices-only fast path returned false forever -> tab never appeared).
    const readyHass = hassWith(
      { ...baseStates, [eng2]: { entity_id: eng2, state: "off", attributes: {} } },
      { ...baseEntities, [eng2]: { device_id: "dev2" } },
      devicesWithNew
    );
    expect(shouldRegenerate({}, bareHass, readyHass)).toBe(true);
  });

  it("regenerates when a radar is renamed (name_by_user)", () => {
    // The device name is the tab title, the help-card heading and the
    // zone-map title, so a rename must rebuild the open dashboard.
    const newHass = hassWith(baseStates, baseEntities, {
      dev1: { ...devices.dev1, name_by_user: "Kitchen Radar" },
    });
    expect(shouldRegenerate({}, oldHass, newHass)).toBe(true);
  });

  it("regenerates when entity ids are renamed (base changes)", () => {
    // "Rename entity ids" replaces `hass.entities` and the states with the
    // new prefix; the base is the view path, so the tab must be rebuilt.
    const renamed = "switch.kitchen_radar_radar_engineering_mode";
    const newHass = hassWith(
      { [renamed]: state(renamed, "off") },
      { [renamed]: { device_id: "dev1" } },
      devices
    );
    expect(shouldRegenerate({}, oldHass, newHass)).toBe(true);
  });
});

describe("shouldRegenerate while a zone is being drawn", () => {
  // The backend registers both zone entities on the radar's own device
  // (sensor.<slug>_zone_N and binary_sensor.<slug>_zone_N_presence, platform
  // apollo_mmwave). Their ids match no radar entity pattern, so the radar's
  // base, capabilities and liveness, and with them the key, do not change.
  const fixtures = [
    {
      model: "R-PRO-1-W",
      slug: "apollo_r_pro_1_abc123",
      radar: [
        "switch.apollo_r_pro_1_abc123_ld2412_engineering_mode",
        "sensor.apollo_r_pro_1_abc123_ld2450_target_1_x",
        "sensor.apollo_r_pro_1_abc123_ld2450_target_1_y",
      ],
    },
    {
      model: "MTR-1",
      slug: "apollo_mtr_1_cbbdb4",
      radar: [
        "sensor.apollo_mtr_1_cbbdb4_target_1_x",
        "sensor.apollo_mtr_1_cbbdb4_target_1_y",
      ],
    },
  ];

  it.each(fixtures)("does NOT regenerate when zone entities appear on an $model", (f) => {
    const states: Record<string, HassEntity> = {};
    const entities: HomeAssistant["entities"] = {};
    for (const id of f.radar) {
      states[id] = state(id, id.startsWith("switch.") ? "off" : "1200");
      entities[id] = { device_id: "radar", platform: "esphome" };
    }
    const devices = {
      radar: { name: `Apollo ${f.model}`, manufacturer: "ApolloAutomation", model: f.model },
    };
    const before = hassWith(states, entities, devices);

    const zone = `sensor.${f.slug}_zone_1`;
    const presence = `binary_sensor.${f.slug}_zone_1_presence`;
    const zoneEntry = { device_id: "radar", platform: "apollo_mmwave" };
    const after = hassWith(
      { ...states, [zone]: state(zone, "rect"), [presence]: state(presence, "off") },
      { ...entities, [zone]: zoneEntry, [presence]: zoneEntry },
      // A replaced registry object with the same content, so the full key
      // is compared rather than short-circuiting on the fast path.
      { ...devices }
    );
    expect(shouldRegenerate({}, before, after)).toBe(false);
  });
});

describe("shouldRegenerate on availability changes", () => {
  // A dashboard opened while the radars were still reconnecting after a Home
  // Assistant restart saw them all `unavailable` and drew no tabs. The devices
  // coming online changed `hass.states` only, so the registry fast path
  // returned false forever and the tabs never appeared without a page reload.
  const devices = { dev1: { name: "Living Room MSR-2" } };
  const entities = { [eng]: { device_id: "dev1" } };
  const offline = hassWith(
    { [eng]: { entity_id: eng, state: "unavailable", attributes: {} } },
    entities,
    devices
  );
  const online = hassWith(
    { [eng]: { entity_id: eng, state: "off", attributes: {} } },
    entities,
    devices
  );

  it("regenerates when a radar comes online with the registries untouched", () => {
    expect(shouldRegenerate({}, offline, online)).toBe(true);
  });

  it("regenerates when a radar goes unavailable, so its tab does not go stale", () => {
    expect(shouldRegenerate({}, online, offline)).toBe(true);
  });

  it("still ignores ordinary state churn on a live radar", () => {
    const moved = hassWith(
      { [eng]: { entity_id: eng, state: "on", attributes: {} } },
      entities,
      devices
    );
    expect(shouldRegenerate({}, online, moved)).toBe(false);
  });

  it("ignores availability flips on entities that belong to no radar", () => {
    const lamp = "light.hall";
    const withLampOff = hassWith(
      { ...online.states, [lamp]: { entity_id: lamp, state: "unavailable", attributes: {} } },
      { ...entities, [lamp]: { device_id: "lamp" } },
      { ...devices, lamp: { name: "Hall lamp" } }
    );
    const withLampOn = hassWith(
      { ...withLampOff.states, [lamp]: { entity_id: lamp, state: "on", attributes: {} } },
      withLampOff.entities,
      withLampOff.devices
    );
    // The full key is recomputed, but the radar set is the same.
    expect(shouldRegenerate({}, withLampOff, withLampOn)).toBe(false);
  });
});

describe("shouldRegenerate with a device selection", () => {
  // dev1 is an entity-detected MSR-2; dev2 a registry-matched R-PRO-1, which
  // auto-detection lists online or not.
  const eng2 = "switch.apollo_r_pro_1_abcd_ld2412_engineering_mode";
  const devices: HomeAssistant["devices"] = {
    dev1: { name: "Living Room MSR-2" },
    dev2: { name: "Office R-PRO-1", manufacturer: "ApolloAutomation", model: "R-PRO-1-W" },
  };
  const entities: HomeAssistant["entities"] = {
    [eng]: { device_id: "dev1" },
    [eng2]: { device_id: "dev2", platform: "esphome" },
  };
  const both = hassWith(
    { [eng]: state(eng, "off"), [eng2]: state(eng2, "off") },
    entities,
    devices
  );

  // Home Assistant still accepts the older `{type, options: {...}}` form. It
  // unwraps `options` before generate() but hands shouldRegenerate the raw
  // strategy object.
  function legacy(selection: string[]) {
    return { type: "custom:apollo-radar-tuning", options: { devices: selection } };
  }

  it("ignores an unselected device flipping availability (legacy options)", () => {
    const dev2Offline = hassWith(
      { ...both.states, [eng2]: state(eng2, "unavailable") },
      entities,
      devices
    );
    expect(shouldRegenerate(legacy(["dev1"]), both, dev2Offline)).toBe(false);
  });

  it("regenerates when the selected device flips availability (legacy options)", () => {
    const dev1Offline = hassWith(
      { ...both.states, [eng]: state(eng, "unavailable") },
      entities,
      devices
    );
    expect(shouldRegenerate(legacy(["dev1"]), both, dev1Offline)).toBe(true);
  });

  it("regenerates when a forced registry-less device gains capability (legacy options)", () => {
    // dev3 has no registry model and its entities register while still
    // unavailable: auto-detection skips it before and after, but a selected
    // device is shown regardless and its tab now has a profile.
    const dev3Eng = "switch.garage_radar_radar_engineering_mode";
    const withDev3 = { ...devices, dev3: { name: "Garage radar" } };
    const bare = hassWith(both.states, entities, withDev3);
    const ready = hassWith(
      { ...both.states, [dev3Eng]: state(dev3Eng, "unavailable") },
      { ...entities, [dev3Eng]: { device_id: "dev3", platform: "esphome" } },
      withDev3
    );
    expect(shouldRegenerate(legacy(["dev3"]), bare, ready)).toBe(true);
  });

  it("regenerates when a forced device's entities register late", () => {
    const withDev4 = { ...devices, dev4: { name: "Hall MSR-2" } };
    const dev4Eng = "switch.hall_msr_2_radar_engineering_mode";
    const bare = hassWith(both.states, entities, withDev4);
    const ready = hassWith(
      { ...both.states, [dev4Eng]: state(dev4Eng, "off") },
      { ...entities, [dev4Eng]: { device_id: "dev4" } },
      withDev4
    );
    expect(shouldRegenerate({ devices: ["dev4"] }, bare, ready)).toBe(true);
  });

  it("does NOT regenerate a forced device on plain state churn", () => {
    const moved = hassWith({ ...both.states, [eng2]: state(eng2, "on") }, entities, devices);
    expect(shouldRegenerate({ devices: ["dev2"] }, both, moved)).toBe(false);
  });
});

describe('shouldRegenerate treats "unknown" as live', () => {
  // Only "unavailable" (or no state) is offline, for both the device key's
  // online flag and the availability fast path.
  const devices = { dev1: { name: "Living Room MSR-2" } };
  const entities = { [eng]: { device_id: "dev1" } };
  const at = (value: string) => hassWith({ [eng]: state(eng, value) }, entities, devices);

  it("does not regenerate when a radar goes from unknown to a value", () => {
    expect(shouldRegenerate({}, at("unknown"), at("off"))).toBe(false);
  });

  it("regenerates when a radar goes from unavailable to unknown", () => {
    expect(shouldRegenerate({}, at("unavailable"), at("unknown"))).toBe(true);
  });
});
