/**
 * The Radar setup card's Target X and Y units note, mounted in happy-dom.
 * The card reads the units through `target_units/get` for an administrator
 * and switches them through `target_units/set`, apart from the radar checks:
 * never a check, never part of "Use recommended settings".
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApolloRadarSetupCard, SETUP_CARD_TAG } from "../src/cards/setup-card";
import {
  ALL_GOOD_LINE,
  NOTHING_TO_CHECK_LINE,
  OFFLINE_LINE,
  RECOMMENDED_LABEL,
  TARGET_UNITS_GET,
  TARGET_UNITS_SET,
  UNITS_LABEL,
  UNITS_NOT_LOADED,
  UNITS_PROGRESS,
  type TargetUnitRow,
} from "../src/cards/setup-checks";
import { NO_DEVICE_MESSAGE } from "../src/calibration/api";
import type { HassEntity } from "../src/types";

const R = "apollo_r_pro_1_7a711c";
const ZONE_TYPE = `select.${R}_ld2450_zone_type`;
const MULTI = `switch.${R}_ld2450_multi_target_tracking`;
const IDS = [1, 2, 3].flatMap((n) => [`sensor.${R}_ld2450_target_${n}_x`, `sensor.${R}_ld2450_target_${n}_y`]);
const NOTE_INCHES =
  "Home Assistant shows this radar's Target X and Y in inches. The zone map reads them" +
  " either way. In mm they match the radar's built-in zone corners and Apollo's zone guides.";
const HINT =
  "After the change, automations and templates that use these sensors read mm.";
const USED_HINT = "An automation or script uses them: check any number it compares them to.";

function row(entity_id: string, fields: Partial<TargetUnitRow> = {}): TargetUnitRow {
  return { entity_id, unit: "in", picked: false, convertible: true, used_by: [], ...fields };
}

/** An R PRO-1 with Zone Type Disabled, its six X and Y answering `rows()`. */
function fakeHass(
  rows: () => TargetUnitRow[],
  opts: { admin?: boolean; zoneType?: string; multi?: string } = {}
) {
  const states: Record<string, HassEntity> = {};
  const entities: Record<string, { device_id?: string; platform?: string }> = {};
  const add = (id: string, state: string, attributes: Record<string, any> = {}) => {
    states[id] = { entity_id: id, state, attributes };
    entities[id] = { device_id: "rpro", platform: "esphome" };
  };
  add(ZONE_TYPE, opts.zoneType ?? "Disabled", { options: ["Disabled", "Detection", "Filter"] });
  if (opts.multi) add(MULTI, opts.multi);
  for (const id of IDS) add(id, "12.3", { unit_of_measurement: "in" });
  const hass = {
    states,
    entities,
    devices: { rpro: { name: "Office R PRO-1" } },
    user: { is_admin: opts.admin ?? true },
    callService: vi.fn(async () => undefined),
    callWS: vi.fn(async (msg: Record<string, any>): Promise<any> => {
      if (msg.type === TARGET_UNITS_GET) return { targets: rows() };
      if (msg.type === TARGET_UNITS_SET) return { changed: [] };
      throw new Error(`unexpected ${msg.type}`);
    }),
  };
  return hass;
}

function calls(hass: ReturnType<typeof fakeHass>, type: string): any[] {
  return hass.callWS.mock.calls.filter(([msg]) => msg.type === type).map(([msg]) => msg);
}

async function settle(el: any): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await el.updateComplete;
}

async function mount(hass: unknown, config: Record<string, unknown> = { device_id: "rpro" }) {
  const el = document.createElement(SETUP_CARD_TAG) as ApolloRadarSetupCard & HTMLElement;
  el.setConfig({ type: `custom:${SETUP_CARD_TAG}`, ...config });
  el.hass = hass as any;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

function text(el: Element): string {
  return (el.shadowRoot?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function labels(el: Element): string[] {
  return Array.from(el.shadowRoot!.querySelectorAll("button")).map((b) => b.textContent!.trim());
}

function button(el: Element, label: string): HTMLButtonElement {
  const found = Array.from(el.shadowRoot!.querySelectorAll("button")).find(
    (b) => b.textContent!.trim() === label
  );
  if (!found) throw new Error(`no button "${label}" in: ${text(el)}`);
  return found;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("setup card units note", () => {
  it("shows an administrator the note, the hint and the button", async () => {
    const el = await mount(fakeHass(() => IDS.map((id) => row(id))));

    expect(text(el)).toContain(ALL_GOOD_LINE);
    expect(text(el)).toContain(NOTE_INCHES);
    expect(text(el)).toContain(HINT);
    expect(text(el)).not.toContain(USED_HINT);
    expect(labels(el)).toEqual([UNITS_LABEL]);
  });

  it("never reads or shows it for a user who is not an administrator", async () => {
    const hass = fakeHass(() => IDS.map((id) => row(id)), { admin: false });
    const el = await mount(hass);

    expect(text(el)).not.toContain("Target X and Y");
    expect(hass.callWS).not.toHaveBeenCalled();
  });

  it("says nothing when every row is picked, in mm or has no length unit", async () => {
    const rows = [
      row(IDS[0], { picked: true }),
      row(IDS[1], { unit: "mm" }),
      row(IDS[2], { unit: null, convertible: false }),
      row(IDS[3], { unit: "mm", picked: true }),
    ];
    const el = await mount(fakeHass(() => rows));

    expect(text(el)).toContain(ALL_GOOD_LINE);
    expect(text(el)).not.toContain("Target X and Y");
    expect(labels(el)).toEqual([]);
  });

  it("names every unit it would switch in words, and warns when something uses them", async () => {
    const rows = [
      row(IDS[0], { unit: "ft" }),
      row(IDS[1], { unit: "in", used_by: ["automation.bed"] }),
      row(IDS[2], { unit: "cm", picked: true }),
    ];
    const el = await mount(fakeHass(() => rows));

    expect(text(el)).toContain("Home Assistant shows this radar's Target X and Y in feet and inches.");
    expect(text(el)).toContain(`${HINT} ${USED_HINT}`);
  });

  it("shows alongside an offline radar", async () => {
    const hass = fakeHass(() => IDS.map((id) => row(id)), { zoneType: "unavailable" });
    const el = await mount(hass);

    expect(text(el)).toContain(OFFLINE_LINE);
    expect(text(el)).toContain(NOTE_INCHES);
  });

  it("stays out of the recommended settings button", async () => {
    const hass = fakeHass(() => IDS.map((id) => row(id)), { zoneType: "Detection", multi: "off" });
    const el = await mount(hass);

    expect(labels(el)).toEqual([RECOMMENDED_LABEL, UNITS_LABEL]);
    expect(text(el)).toContain("Sets Zone Type to Disabled and turns on Multi Target Tracking.");
    button(el, RECOMMENDED_LABEL).click();
    await settle(el);

    expect(hass.callService).toHaveBeenCalledTimes(2);
    expect(calls(hass, TARGET_UNITS_SET)).toEqual([]);
  });

  it("is not part of a device with nothing to check, nor of the gate radar card", async () => {
    const hass = fakeHass(() => IDS.map((id) => row(id)));
    delete (hass.states as any)[ZONE_TYPE];
    delete (hass.entities as any)[ZONE_TYPE];
    const bare = await mount(hass);
    expect(text(bare)).toContain(NOTHING_TO_CHECK_LINE);
    expect(text(bare)).not.toContain("Target X and Y");

    const gate = await mount(fakeHass(() => IDS.map((id) => row(id))), {
      device_id: "rpro",
      radar: "gate",
    });
    expect(text(gate)).not.toContain("Target X and Y");
  });
});

describe("setup card units reads", () => {
  it("reads once on mount, never on a state tick, again on a registry change", async () => {
    const hass = fakeHass(() => IDS.map((id) => row(id)));
    const el = await mount(hass);
    expect(calls(hass, TARGET_UNITS_GET)).toEqual([{ type: TARGET_UNITS_GET, device_id: "rpro" }]);

    el.hass = { ...hass, states: { ...hass.states, [IDS[0]]: { ...hass.states[IDS[0]], state: "13.1" } } } as any;
    el.hass = { ...hass, states: { ...hass.states, [ZONE_TYPE]: { ...hass.states[ZONE_TYPE] } } } as any;
    await settle(el);
    expect(calls(hass, TARGET_UNITS_GET)).toHaveLength(1);

    el.hass = { ...hass, entities: { ...hass.entities } } as any;
    await settle(el);
    expect(calls(hass, TARGET_UNITS_GET)).toHaveLength(2);
  });

  it("reads the new device on a device change", async () => {
    const hass = fakeHass(() => IDS.map((id) => row(id)));
    (hass.devices as any).hall = { name: "Hall" };
    const el = await mount(hass);

    el.setConfig({ type: `custom:${SETUP_CARD_TAG}`, device_id: "hall" });
    await settle(el);

    expect(calls(hass, TARGET_UNITS_GET).map((msg) => msg.device_id)).toEqual(["rpro", "hall"]);
  });

  it("drops an answer for the device it showed before", async () => {
    const hass = fakeHass(() => IDS.map((id) => row(id)));
    (hass.devices as any).hall = { name: "Hall" };
    const hallZoneType = "select.hall_ld2450_zone_type";
    hass.states[hallZoneType] = { entity_id: hallZoneType, state: "Disabled", attributes: {} };
    hass.entities[hallZoneType] = { device_id: "hall", platform: "esphome" };
    let answerRpro!: () => void;
    hass.callWS.mockImplementation(async (msg: Record<string, any>): Promise<any> => {
      if (msg.device_id === "hall") throw { code: "not_found", message: "No device" };
      await new Promise<void>((resolve) => (answerRpro = resolve));
      return { targets: IDS.map((id) => row(id)) };
    });
    const el = await mount(hass);

    el.setConfig({ type: `custom:${SETUP_CARD_TAG}`, device_id: "hall" });
    await settle(el);
    answerRpro();
    await settle(el);

    expect(text(el)).toContain("LD2450 · Hall");
    expect(text(el)).toContain(ALL_GOOD_LINE);
    expect(text(el)).not.toContain("Target X and Y");
  });

  it("shows no note when the integration cannot answer", async () => {
    const hass = fakeHass(() => IDS.map((id) => row(id)));
    hass.callWS.mockRejectedValue({ code: "not_loaded", message: "Apollo mmWave is not loaded." });
    const el = await mount(hass);

    expect(text(el)).toContain(ALL_GOOD_LINE);
    expect(text(el)).not.toContain("Target X and Y");
  });
});

describe("setup card units button", () => {
  it("switches through the backend, then reads again and drops the note", async () => {
    let rows = IDS.map((id) => row(id));
    const hass = fakeHass(() => rows);
    let finish!: () => void;
    hass.callWS.mockImplementation(async (msg: Record<string, any>): Promise<any> => {
      if (msg.type === TARGET_UNITS_GET) return { targets: rows };
      await new Promise<void>((resolve) => (finish = resolve));
      rows = IDS.map((id) => row(id, { unit: "mm", picked: true }));
      return { changed: IDS };
    });
    const el = await mount(hass);

    button(el, UNITS_LABEL).click();
    await settle(el);
    expect(text(el)).toContain(UNITS_PROGRESS);
    expect(button(el, UNITS_LABEL).disabled).toBe(true);
    // A second click while it runs sends nothing.
    button(el, UNITS_LABEL).click();
    expect(calls(hass, TARGET_UNITS_SET)).toEqual([{ type: TARGET_UNITS_SET, device_id: "rpro" }]);

    finish();
    await settle(el);

    expect(calls(hass, TARGET_UNITS_GET)).toHaveLength(2);
    expect(text(el)).not.toContain("Target X and Y");
    expect(text(el)).not.toContain(UNITS_PROGRESS);
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "home_assistant_error", message: "Entity is read only" }, "Entity is read only."],
    [{ code: "not_loaded", message: "Apollo mmWave is not loaded." }, UNITS_NOT_LOADED],
    [{ code: "not_found", message: "No Home Assistant device with id rpro" }, NO_DEVICE_MESSAGE],
  ])("shows its own failure line for %o", async (error, reason) => {
    const hass = fakeHass(() => IDS.map((id) => row(id)));
    hass.callWS.mockImplementation(async (msg: Record<string, any>): Promise<any> => {
      if (msg.type === TARGET_UNITS_GET) return { targets: IDS.map((id) => row(id)) };
      throw error;
    });
    const el = await mount(hass);

    button(el, UNITS_LABEL).click();
    await settle(el);

    expect(el.shadowRoot!.querySelector(".units p.error")!.textContent).toBe(
      `Could not change the Target X and Y units: ${reason}`
    );
    expect(button(el, UNITS_LABEL).disabled).toBe(false);
    // The radar checks keep no error of their own.
    expect(el.shadowRoot!.querySelectorAll("p.error")).toHaveLength(1);
  });
});
