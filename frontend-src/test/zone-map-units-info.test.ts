/**
 * The zone map's help line names the units the tracked Target X and Y
 * sensors show, and says the input unit only when one of them has no length
 * unit, since only such a sensor is read in it. Its own file, so it stays
 * apart from the card's layout tests.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ZoneMapCard } from "../src/zone-map/card";
import { ZONES_GET } from "../src/zone-map/api";

type Handler = (message: any) => void;

const PAYLOAD = {
  zones: {},
  entities: null as any,
  rotation_deg: 0,
  label: "Office radar",
  suggested_entities: [{ x: "sensor.a_x", y: "sensor.a_y" }],
};
const INPUT_CLAUSE = "Input units (sensors without a length unit): mm.";

/** A target sensor's state, with a unit_of_measurement when one is given. */
function reading(state: string, unit?: string) {
  return { state, attributes: unit === undefined ? {} : { unit_of_measurement: unit } };
}

function fakeHass(states: Record<string, any>) {
  const handlers: Record<string, Handler[]> = {};
  return {
    states,
    entities: {},
    devices: {},
    handlers,
    callService: vi.fn(),
    callWS: vi.fn(async (msg: any) => (msg.type === ZONES_GET ? PAYLOAD : [])),
    connection: {
      subscribeMessage: vi.fn(async (cb: Handler, msg: any) => {
        (handlers[msg.type] ||= []).push(cb);
        return () => undefined;
      }),
    },
  } as any;
}

async function mountCard(hass: any) {
  const card = new ZoneMapCard();
  card.setConfig({ device_id: "dev123" } as any);
  (card as any).hass = hass;
  await vi.waitFor(() => expect((card as any)._zoneConfigPayload).toBeTruthy());
  return card as any;
}

function info(card: any): string {
  return card.shadowRoot.getElementById("gridInfo").textContent;
}

afterEach(() => window.localStorage.clear());

describe("zone map help line units", () => {
  it("names mm, and leaves the input unit out, for an Apollo radar in mm", async () => {
    const card = await mountCard(
      fakeHass({ "sensor.a_x": reading("120", "mm"), "sensor.a_y": reading("900", "mm") })
    );

    expect(info(card)).toContain(" Target sensors: mm. Radar range:");
    expect(info(card)).not.toContain("Input units");
  });

  it("names inches when Home Assistant shows them", async () => {
    const card = await mountCard(
      fakeHass({ "sensor.a_x": reading("4.7", "in"), "sensor.a_y": reading("35.4", "in") })
    );

    expect(info(card)).toContain(" Target sensors: in.");
    expect(info(card)).not.toContain("Input units");
  });

  it("names both units of a mixed pair, mm first", async () => {
    const card = await mountCard(
      fakeHass({ "sensor.a_x": reading("4.7", "in"), "sensor.a_y": reading("900", "mm") })
    );

    expect(info(card)).toContain(" Target sensors: mm and in.");
  });

  it("adds the input unit when a sensor has no length unit", async () => {
    const card = await mountCard(
      fakeHass({ "sensor.a_x": reading("120"), "sensor.a_y": reading("35.4", "in") })
    );

    expect(info(card)).toContain(` Target sensors: in. ${INPUT_CLAUSE} Radar range:`);
  });

  it("says only the input unit when no sensor has a length unit", async () => {
    const card = await mountCard(
      fakeHass({ "sensor.a_x": reading("120", "dBm"), "sensor.a_y": reading("900") })
    );

    expect(info(card)).toContain(`). ${INPUT_CLAUSE} Radar range:`);
    expect(info(card)).not.toContain("Target sensors");
  });

  it("keeps today's input clause while no tracked sensor has a state", async () => {
    const card = await mountCard(fakeHass({}));

    expect(info(card)).toContain(`). ${INPUT_CLAUSE} Radar range:`);
    expect(info(card)).not.toContain("Target sensors");
  });

  it("follows a unit picked on a live card, and skips ticks that change none", async () => {
    const hass = fakeHass({
      "sensor.a_x": reading("4.7", "in"),
      "sensor.a_y": reading("35.4", "in"),
    });
    const card = await mountCard(hass);
    const spy = vi.spyOn(card, "_renderInfo");

    card.hass = {
      ...hass,
      states: { "sensor.a_x": reading("5.1", "in"), "sensor.a_y": reading("36.0", "in") },
    };
    expect(spy).not.toHaveBeenCalled();

    card.hass = {
      ...hass,
      states: { "sensor.a_x": reading("130", "mm"), "sensor.a_y": reading("914", "mm") },
    };
    expect(spy).toHaveBeenCalledTimes(1);
    expect(info(card)).toContain(" Target sensors: mm.");
  });
});
