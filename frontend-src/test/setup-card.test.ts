/**
 * The "Radar setup" card, mounted in happy-dom. It reads Zone Type and Multi
 * Target Tracking from live HA state and writes only when a button is
 * clicked, so these tests change states and click buttons, then read the copy
 * and the recorded service calls.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApolloRadarSetupCard, SETUP_CARD_TAG } from "../src/cards/setup-card";
import {
  ALL_GOOD_LINE,
  NOTHING_TO_CHECK_LINE,
  NO_DEVICE_LINE,
  OFFLINE_LINE,
  RECOMMENDED_LABEL,
  RECOMMENDED_PROGRESS,
  SETTING_NOT_FOUND,
  WAITING_LINE,
  ZONE_TYPE_WAITING_LINE,
} from "../src/cards/setup-checks";
import type { HassEntity } from "../src/types";

const R = "apollo_r_pro_1_7a711c";
const ZONE_TYPE = `select.${R}_ld2450_zone_type`;
const MULTI = `switch.${R}_ld2450_multi_target_tracking`;
const LD2412_TIMEOUT = `number.${R}_ld2412_timeout`;
const ZONE_NUMBERS = [1, 2, 3].flatMap((n) =>
  ["x1", "y1", "x2", "y2"].map((f) => `number.${R}_ld2450_zone_${n}_${f}`)
);
const OPTIONS = ["Disabled", "Detection", "Filter"];

interface FakeHass {
  states: Record<string, HassEntity>;
  entities: Record<string, { device_id?: string; platform?: string }>;
  devices: Record<string, any>;
  callService: ReturnType<typeof vi.fn>;
  localize?: (key: string) => string;
}

/** An R PRO-1 on device rpro with the given Zone Type, Multi Target Tracking
 *  (null leaves it out, as HA does while it is disabled) and zone corners. */
function fakeHass(
  opts: {
    zoneType?: string | null;
    multi?: string | null;
    zones?: string;
    options?: string[];
  } = {}
): FakeHass {
  const states: FakeHass["states"] = {};
  const entities: FakeHass["entities"] = {};
  const add = (id: string, state: string, attributes: Record<string, any> = {}) => {
    states[id] = { entity_id: id, state, attributes };
    entities[id] = { device_id: "rpro", platform: "esphome" };
  };
  if (opts.zoneType !== null) {
    add(ZONE_TYPE, opts.zoneType ?? "Disabled", { options: opts.options ?? OPTIONS });
  }
  if (opts.multi !== null && opts.multi !== undefined) add(MULTI, opts.multi);
  for (const id of ZONE_NUMBERS) add(id, opts.zones ?? "0");
  add(LD2412_TIMEOUT, "5");
  return {
    states,
    entities,
    devices: { rpro: { name: "Office R PRO-1" } },
    callService: vi.fn(async () => undefined),
  };
}

/** The same hass after state changes: a new object with new `states`. */
function withStates(hass: FakeHass, changes: Record<string, string>): FakeHass {
  const states = { ...hass.states };
  for (const [id, state] of Object.entries(changes)) states[id] = { ...states[id], state };
  return { ...hass, states };
}

async function mount(hass: FakeHass, config: Record<string, unknown> = { device_id: "rpro" }) {
  const el = document.createElement(SETUP_CARD_TAG) as ApolloRadarSetupCard & HTMLElement;
  el.setConfig({ type: `custom:${SETUP_CARD_TAG}`, ...config });
  el.hass = hass as any;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function text(el: Element): string {
  return (el.shadowRoot?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function buttons(el: Element): HTMLButtonElement[] {
  return Array.from(el.shadowRoot!.querySelectorAll("button"));
}

function button(el: Element, label: string): HTMLButtonElement {
  const found = buttons(el).find((b) => b.textContent!.trim() === label);
  if (!found) throw new Error(`no button "${label}" in: ${text(el)}`);
  return found;
}

async function settle(el: any): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await el.updateComplete;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("setup card states", () => {
  it("says the settings look good when Zone Type is Disabled, with no buttons", async () => {
    const el = await mount(fakeHass());
    expect(text(el)).toContain(ALL_GOOD_LINE);
    expect(text(el)).toContain("LD2450 · Office R PRO-1");
    expect(text(el)).not.toContain("should be Disabled");
    expect(buttons(el)).toHaveLength(0);
  });

  it("warns that Detection with no built-in zones reports nobody", async () => {
    const el = await mount(fakeHass({ zoneType: "Detection" }));
    const shown = text(el);
    expect(shown).toContain(
      "Zone Type is Detection. This radar only reports people inside its built-in zones." +
        " None are set, so it reports nobody and the zone map stays empty."
    );
    // "Should be", not "should stay": it is Detection right now.
    expect(shown).toContain(
      "Zone Type should be Disabled. The zone map replaces the radar's built-in zones."
    );
    expect(el.shadowRoot!.querySelector("p.warning")).not.toBeNull();
    expect(buttons(el).map((b) => b.textContent!.trim())).toEqual(["Set Zone Type to Disabled"]);
  });

  it("says who goes missing when Detection has built-in zones set", async () => {
    const hass = fakeHass({ zoneType: "Detection" });
    const el = await mount(withStates(hass, { [ZONE_NUMBERS[2]]: "1500" }));
    expect(text(el)).toContain("Anyone outside them is missing from the zone map.");
    expect(text(el)).not.toContain("None are set");
  });

  it("does not claim no zones are set when a corner cannot be read", async () => {
    const hass = fakeHass({ zoneType: "Detection" });
    const el = await mount(withStates(hass, { [ZONE_NUMBERS[0]]: "unavailable" }));
    expect(text(el)).not.toContain("None are set");
  });

  it("gives Filter a milder note", async () => {
    const el = await mount(fakeHass({ zoneType: "Filter" }));
    expect(text(el)).toContain(
      "Zone Type is Filter. This radar ignores people inside its built-in zones." +
        " Disabled is recommended because the zone map replaces them."
    );
    expect(el.shadowRoot!.querySelector("p.warning")).toBeNull();
    expect(el.shadowRoot!.querySelector("p.note")).not.toBeNull();
    expect(buttons(el)).toHaveLength(1);
  });

  it("warns that only one person is tracked while Multi Target Tracking is off", async () => {
    const el = await mount(fakeHass({ multi: "off" }));
    expect(text(el)).toContain("Multi Target Tracking is off. Only one person is tracked.");
    expect(buttons(el).map((b) => b.textContent!.trim())).toEqual([
      "Turn on Multi Target Tracking",
    ]);
  });

  it("says nothing about Multi Target Tracking while HA does not have it", async () => {
    const el = await mount(fakeHass({ multi: null }));
    expect(text(el)).not.toContain("Multi Target Tracking");
    expect(text(el)).toContain(ALL_GOOD_LINE);
  });

  it("offers one button for both fixes and says what it changes", async () => {
    const el = await mount(fakeHass({ zoneType: "Detection", multi: "off" }));
    expect(buttons(el).map((b) => b.textContent!.trim())).toEqual([RECOMMENDED_LABEL]);
    expect(text(el)).toContain("Sets Zone Type to Disabled and turns on Multi Target Tracking.");
    expect(text(el)).toContain("None are set");
    expect(text(el)).toContain("Only one person is tracked.");
  });

  it("says the radar is offline and hides every button", async () => {
    const hass = fakeHass({ zoneType: "Detection", multi: "off" });
    const el = await mount(withStates(hass, { [ZONE_TYPE]: "unavailable", [MULTI]: "unavailable" }));
    expect(text(el)).toContain(OFFLINE_LINE);
    expect(text(el)).not.toContain("Zone Type is");
    expect(buttons(el)).toHaveLength(0);
  });

  it("waits while the radar has not reported Zone Type yet", async () => {
    const el = await mount(fakeHass({ zoneType: "unknown" }));
    expect(text(el)).toContain(WAITING_LINE);
    expect(text(el)).not.toContain(ALL_GOOD_LINE);
  });

  it.each([["unknown"], ["unavailable"]])(
    "does not say the settings look good with Zone Type %s and Multi Target Tracking on",
    async (zoneType) => {
      const el = await mount(fakeHass({ zoneType, multi: "on" }));
      expect(text(el)).toContain(WAITING_LINE);
      expect(text(el)).not.toContain(ALL_GOOD_LINE);
    }
  );

  it("shows a Multi Target Tracking warning and still waits for Zone Type", async () => {
    const el = await mount(fakeHass({ zoneType: "unknown", multi: "off" }));
    expect(text(el)).toContain("Multi Target Tracking is off.");
    expect(text(el)).toContain(ZONE_TYPE_WAITING_LINE);
    expect(buttons(el).map((b) => b.textContent!.trim())).toEqual([
      "Turn on Multi Target Tracking",
    ]);
  });

  it("says the settings look good once Zone Type reads Disabled", async () => {
    const hass = fakeHass({ zoneType: "unknown", multi: "on" });
    const el = await mount(hass);
    el.hass = withStates(hass, { [ZONE_TYPE]: "Disabled" }) as any;
    await el.updateComplete;
    expect(text(el)).toContain(ALL_GOOD_LINE);
    expect(text(el)).not.toContain(WAITING_LINE);
  });

  it("explains the explanation-only case when the select has no Disabled option", async () => {
    const el = await mount(fakeHass({ zoneType: "Detection", options: ["Detection", "Filter"] }));
    expect(text(el)).toContain("Zone Type is Detection.");
    expect(buttons(el)).toHaveLength(0);
  });

  it("asks for a device id, and says when a device has nothing to check", async () => {
    expect(text(await mount(fakeHass(), {}))).toContain(NO_DEVICE_LINE);
    const bare = fakeHass({ zoneType: null });
    expect(text(await mount(bare))).toContain(NOTHING_TO_CHECK_LINE);
  });

  it("checks only its own device", async () => {
    const hass = fakeHass({ zoneType: "Detection" });
    hass.devices.other = { name: "Hall" };
    const el = await mount(hass, { device_id: "other" });
    expect(text(el)).toContain(NOTHING_TO_CHECK_LINE);
  });

  it("follows the live state without a click", async () => {
    const hass = fakeHass({ zoneType: "Detection" });
    const el = await mount(hass);
    el.hass = withStates(hass, { [ZONE_TYPE]: "Disabled" }) as any;
    await el.updateComplete;
    expect(text(el)).toContain(ALL_GOOD_LINE);
  });

  it("uses a configured title", async () => {
    const el = await mount(fakeHass(), { device_id: "rpro", title: "Hall setup" });
    expect((el.shadowRoot!.querySelector("ha-card") as any).header).toBe("Hall setup");
  });
});

describe("setup card buttons", () => {
  it("sets Zone Type to Disabled on that device's select, with no toast", async () => {
    const hass = fakeHass({ zoneType: "Detection" });
    const el = await mount(hass);
    button(el, "Set Zone Type to Disabled").click();
    await settle(el);
    expect(hass.callService).toHaveBeenCalledTimes(1);
    expect(hass.callService).toHaveBeenCalledWith(
      "select",
      "select_option",
      { entity_id: ZONE_TYPE, option: "Disabled" },
      undefined,
      false
    );
  });

  it("turns on Multi Target Tracking", async () => {
    const hass = fakeHass({ multi: "off" });
    const el = await mount(hass);
    button(el, "Turn on Multi Target Tracking").click();
    await settle(el);
    expect(hass.callService).toHaveBeenCalledWith(
      "switch",
      "turn_on",
      { entity_id: MULTI },
      undefined,
      false
    );
  });

  it("applies both fixes from the recommended settings button", async () => {
    const hass = fakeHass({ zoneType: "Filter", multi: "off" });
    const el = await mount(hass);
    button(el, RECOMMENDED_LABEL).click();
    await settle(el);
    expect(hass.callService.mock.calls).toEqual([
      ["select", "select_option", { entity_id: ZONE_TYPE, option: "Disabled" }, undefined, false],
      ["switch", "turn_on", { entity_id: MULTI }, undefined, false],
    ]);
  });

  it("disables the buttons and says what it is doing while a call runs", async () => {
    const hass = fakeHass({ zoneType: "Detection" });
    let finish!: () => void;
    hass.callService.mockImplementation(
      () => new Promise<void>((resolve) => (finish = () => resolve()))
    );
    const el = await mount(hass);
    const fix = button(el, "Set Zone Type to Disabled");
    fix.click();
    await el.updateComplete;
    expect(fix.disabled).toBe(true);
    expect(text(el)).toContain("Setting Zone Type to Disabled...");
    // A second click while it runs sends nothing.
    fix.click();
    expect(hass.callService).toHaveBeenCalledTimes(1);

    finish();
    await settle(el);
    expect(fix.disabled).toBe(false);
    expect(text(el)).not.toContain("Setting Zone Type to Disabled...");
  });

  it("names the combined change while it runs", async () => {
    const hass = fakeHass({ zoneType: "Detection", multi: "off" });
    hass.callService.mockImplementation(() => new Promise(() => undefined));
    const el = await mount(hass);
    button(el, RECOMMENDED_LABEL).click();
    await el.updateComplete;
    expect(text(el)).toContain(RECOMMENDED_PROGRESS);
    expect(button(el, RECOMMENDED_LABEL).disabled).toBe(true);
  });

  it("shows its own error line when the call fails, and clears it on the next try", async () => {
    const hass = fakeHass({ zoneType: "Detection" });
    hass.callService.mockRejectedValueOnce({ code: "home_assistant_error", message: "Device is offline" });
    const el = await mount(hass);
    button(el, "Set Zone Type to Disabled").click();
    await settle(el);
    expect(el.shadowRoot!.querySelector("p.error")!.textContent).toBe(
      "Could not change Zone Type: Device is offline."
    );
    button(el, "Set Zone Type to Disabled").click();
    await settle(el);
    expect(el.shadowRoot!.querySelector("p.error")).toBeNull();
  });

  it("names each failed setting of the recommended settings", async () => {
    const hass = fakeHass({ zoneType: "Detection", multi: "off" });
    hass.callService.mockImplementation(async (domain: string) => {
      if (domain === "switch") throw { code: "not_found", message: "Service not found" };
    });
    const el = await mount(hass);
    button(el, RECOMMENDED_LABEL).click();
    await settle(el);
    expect(el.shadowRoot!.querySelector("p.error")!.textContent).toBe(
      `Could not change Multi Target Tracking: ${SETTING_NOT_FOUND}`
    );
  });

  it("drops a stale error once the setting is fixed some other way", async () => {
    const hass = fakeHass({ zoneType: "Detection" });
    hass.callService.mockRejectedValueOnce({ code: "home_assistant_error", message: "Timed out" });
    const el = await mount(hass);
    button(el, "Set Zone Type to Disabled").click();
    await settle(el);
    expect(el.shadowRoot!.querySelector("p.error")).not.toBeNull();
    el.hass = withStates(hass, { [ZONE_TYPE]: "Disabled" }) as any;
    await el.updateComplete;
    expect(text(el)).toContain(ALL_GOOD_LINE);
    el.hass = withStates(hass, { [ZONE_TYPE]: "Detection" }) as any;
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector("p.error")).toBeNull();
  });

  it("never calls a service on its own", async () => {
    const hass = fakeHass({ zoneType: "Detection", multi: "off" });
    const el = await mount(hass);
    el.hass = withStates(hass, { [ZONE_NUMBERS[0]]: "100" }) as any;
    await settle(el);
    expect(hass.callService).not.toHaveBeenCalled();
  });
});

describe("setup card registration", () => {
  it("is defined and listed in the card picker once", () => {
    expect(customElements.get(SETUP_CARD_TAG)).toBe(ApolloRadarSetupCard);
    const entries = ((window as any).customCards ?? []).filter(
      (c: { type?: string }) => c.type === SETUP_CARD_TAG
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("Apollo Radar Setup");
  });

  it("stubs the first device with an LD2450", () => {
    const hass = fakeHass();
    const x = `sensor.${R}_ld2450_target_1_x`;
    hass.entities[x] = { device_id: "rpro", platform: "esphome" };
    hass.devices = { msr: { name: "Den" }, rpro: hass.devices.rpro };
    expect(ApolloRadarSetupCard.getStubConfig(hass as any)).toEqual({
      type: `custom:${SETUP_CARD_TAG}`,
      device_id: "rpro",
    });
    expect(ApolloRadarSetupCard.getStubConfig()).toEqual({ type: `custom:${SETUP_CARD_TAG}` });
  });

  it("skips hass ticks that change none of its entities", async () => {
    const hass = fakeHass({ zoneType: "Detection" });
    const el = await mount(hass);
    const spy = vi.spyOn(el as any, "render");
    el.hass = withStates(hass, { [LD2412_TIMEOUT]: "6" }) as any;
    await el.updateComplete;
    expect(spy).not.toHaveBeenCalled();
    el.hass = withStates(hass, { [ZONE_NUMBERS[5]]: "200" }) as any;
    await el.updateComplete;
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
