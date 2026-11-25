/**
 * An Apollo device whose model is not listed is set up from its registered
 * entities. The cases are shared with tests/test_models.py, which runs them
 * through device_radars.
 */

import { describe, expect, it } from "vitest";
import fixture from "./fixtures/entity-radars-cases.json";
import { apolloDeviceInfo } from "../src/apollo-device";
import { buildDeviceCards, detectRadarDevices } from "../src/strategy-core";
import type { HassEntity, HomeAssistant } from "../src/types";

const DEV = "dev1";

interface Case {
  name: string;
  manufacturer: string;
  model: string;
  entities: string[];
  own_entities?: string[];
  expect: { radars: string[] | null; profile: string | null; ld2450: boolean; ld2460: boolean };
}

function hassFor(c: Case, live = true): HomeAssistant {
  const entities: HomeAssistant["entities"] = {};
  const states: Record<string, HassEntity> = {};
  const add = (id: string, platform: string) => {
    entities[id] = { device_id: DEV, platform };
    if (live) states[id] = { entity_id: id, state: "0", attributes: {} };
  };
  for (const id of c.entities) add(id, "esphome");
  for (const id of c.own_entities ?? []) add(id, "apollo_mmwave");
  return {
    states,
    entities,
    devices: { [DEV]: { id: DEV, name: "Den Radar", manufacturer: c.manufacturer, model: c.model } },
  } as HomeAssistant;
}

const cases = (fixture.cases as Case[]).map((c) => [c.name, c] as const);

describe("apolloDeviceInfo", () => {
  it.each(cases)("reads the radars as device_radars does: %s", (_name, c) => {
    const info = apolloDeviceInfo(hassFor(c), DEV);
    if (c.expect.radars === null) {
      expect(info).toBeUndefined();
      return;
    }
    expect(info).toBeDefined();
    expect(info!.profile?.key ?? null).toBe(c.expect.profile);
    expect(info!.ld2450).toBe(c.expect.ld2450);
    expect(info!.ld2460).toBe(c.expect.ld2460);
    const radars = [info!.profile?.key, info!.ld2460 ? "ld2460" : info!.ld2450 ? "ld2450" : undefined];
    expect(radars.filter(Boolean)).toEqual(c.expect.radars);
  });

  it("marks only an unlisted model as derived", () => {
    const [unlisted, listed] = ["XR-7", "R-PRO-1-W"].map(
      (model) => fixture.cases.find((c) => c.model === model && c.expect.radars) as Case
    );
    expect(apolloDeviceInfo(hassFor(unlisted), DEV)?.derived).toBe(true);
    expect(apolloDeviceInfo(hassFor(listed), DEV)?.derived).toBeUndefined();
  });
});

describe("an unlisted Apollo model on the dashboard", () => {
  const unlisted = fixture.cases.find((c) => c.model === "XR-7" && c.expect.ld2450) as Case;
  const diy = { ...unlisted, manufacturer: "Espressif", model: "esp32dev" };

  it("keeps its tab while offline, with the offline note", () => {
    const hass = hassFor(unlisted, false);
    const [dev] = detectRadarDevices(hass);
    expect(dev).toMatchObject({ deviceId: DEV, online: false, ld2450: true });
    expect(buildDeviceCards(hass, dev)[0].content).toContain("**Offline right now.**");
  });

  it("gets a tab while online", () => {
    expect(detectRadarDevices(hassFor(unlisted))[0]).toMatchObject({ online: true, ld2450: true });
  });

  it("leaves a DIY device with no live state off the dashboard, as before", () => {
    expect(detectRadarDevices(hassFor(diy, false))).toEqual([]);
    expect(detectRadarDevices(hassFor(diy))[0]).toMatchObject({ online: true, ld2450: true });
  });
});
