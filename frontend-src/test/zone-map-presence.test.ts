/**
 * Which presence sensor lights a zone when the zones payload does not name
 * it (a 2.3.0 backend, or a push that came in before the registry had the
 * entity), and how a sensor's state looks on the map.
 */

import { describe, it, expect } from "vitest";
import { fallbackPresenceId, presenceLook } from "../src/zone-map/presence";
import type { HomeAssistant } from "../src/types";

type Registry = HomeAssistant["entities"];

const OWN = { device_id: "dev123", platform: "apollo_mmwave" };

describe("zone presence fallback", () => {
  it("finds a zone's presence sensor by the id the integration gives it", () => {
    const entities: Registry = {
      "binary_sensor.office_zone_1_presence": OWN,
      "binary_sensor.office_zone_12_presence_2": OWN,
      "sensor.office_zone_1": OWN,
    };

    expect(fallbackPresenceId(entities, "dev123", 1)).toBe("binary_sensor.office_zone_1_presence");
    expect(fallbackPresenceId(entities, "dev123", "12")).toBe(
      "binary_sensor.office_zone_12_presence_2"
    );
    expect(fallbackPresenceId(entities, "dev123", 2)).toBeNull();
  });

  it("counts only this device's own entries, or entries with no platform", () => {
    const entities: Registry = {
      "binary_sensor.hall_zone_1_presence": { device_id: "other", platform: "apollo_mmwave" },
      "binary_sensor.office_zone_1_presence": { device_id: "dev123", platform: "template" },
      "binary_sensor.office_zone_2_presence": { device_id: "dev123" },
    };

    expect(fallbackPresenceId(entities, "dev123", 1)).toBeNull();
    expect(fallbackPresenceId(entities, "dev123", 2)).toBe("binary_sensor.office_zone_2_presence");
  });

  it("matches the zone id as written, so zone 1 never takes zone 11 or 01", () => {
    const entities: Registry = {
      "binary_sensor.office_zone_11_presence": OWN,
      "binary_sensor.office_zone_01_presence": OWN,
      "binary_sensor.office_zone_1_presence_zone_2_presence": OWN,
    };

    expect(fallbackPresenceId(entities, "dev123", 1)).toBeNull();
    expect(fallbackPresenceId(entities, "dev123", 11)).toBe(
      "binary_sensor.office_zone_11_presence"
    );
    expect(fallbackPresenceId(entities, "dev123", 2)).toBe(
      "binary_sensor.office_zone_1_presence_zone_2_presence"
    );
  });

  it("answers from a cache per registry object", () => {
    const entities: Registry = { "binary_sensor.office_zone_1_presence": OWN };
    expect(fallbackPresenceId(entities, "dev123", 1)).toBe("binary_sensor.office_zone_1_presence");

    // Home Assistant replaces hass.entities on every registry change, so an
    // edit in place is never seen; a new object is.
    entities["binary_sensor.office_zone_2_presence"] = OWN;
    expect(fallbackPresenceId(entities, "dev123", 2)).toBeNull();
    expect(fallbackPresenceId({ ...entities }, "dev123", 2)).toBe(
      "binary_sensor.office_zone_2_presence"
    );
  });

  it("has nothing to offer without a registry", () => {
    expect(fallbackPresenceId(undefined, "dev123", 1)).toBeNull();
  });
});

describe("zone presence look", () => {
  it("lights on, greys unavailable and draws everything else as off", () => {
    expect(presenceLook("on")).toBe("on");
    expect(presenceLook("unavailable")).toBe("unavailable");
    for (const state of ["off", "unknown", "", undefined, null, "home"]) {
      expect(presenceLook(state)).toBe("off");
    }
  });
});
