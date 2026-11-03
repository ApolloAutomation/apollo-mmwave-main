/**
 * The Radar setup card's version notice, mounted in happy-dom with a fake
 * hass whose `manifest/get` answers with the version Home Assistant runs.
 * The card is on every tab of the dashboard, so it is where a page that
 * still runs old cards after an update says so. Its own file, because the
 * check is once per page: each test hands in a new connection to ask again.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApolloRadarSetupCard, SETUP_CARD_TAG } from "../src/cards/setup-card";
import { ALL_GOOD_LINE } from "../src/cards/setup-checks";
import { CARD_VERSION } from "../src/version";

const R = "apollo_r_pro_1_7a711c";
const ZONE_TYPE = `select.${R}_ld2450_zone_type`;
const NEWER = "99.0.0";
const OLDER = "0.1.0";

/** An R PRO-1 whose settings all look right, on a connection that can fire
 *  `ready`, and whose `manifest/get` answers with `running()`. */
function fakeHass(running: () => unknown) {
  const listeners: (() => void)[] = [];
  const callWS = vi.fn(async (msg: Record<string, any>) => {
    if (msg.type !== "manifest/get") throw new Error(`unexpected ${msg.type}`);
    const version = running();
    if (version instanceof Error) throw version;
    return { domain: "apollo_mmwave", version };
  });
  const hass = {
    states: {
      [ZONE_TYPE]: {
        entity_id: ZONE_TYPE,
        state: "Disabled",
        attributes: { options: ["Disabled", "Detection", "Filter"] },
      },
    },
    entities: { [ZONE_TYPE]: { device_id: "rpro", platform: "esphome" } },
    devices: { rpro: { name: "Office R PRO-1" } },
    callService: vi.fn(async () => undefined),
    callWS,
    connection: {
      subscribeMessage: vi.fn(async () => () => undefined),
      addEventListener: vi.fn((event: string, cb: () => void) => {
        if (event === "ready") listeners.push(cb);
      }),
      removeEventListener: vi.fn(),
    },
  };
  return { hass, callWS, ready: () => listeners.forEach((cb) => cb()) };
}

async function settle(el: any): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await el.updateComplete;
}

async function mount(hass: unknown): Promise<ApolloRadarSetupCard> {
  const el = document.createElement(SETUP_CARD_TAG) as ApolloRadarSetupCard;
  el.setConfig({ type: `custom:${SETUP_CARD_TAG}`, device_id: "rpro" });
  el.hass = hass as any;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

/** A card's text, or an element's inside the card. */
function text(el: Element): string {
  return ((el.shadowRoot ?? el).textContent ?? "").replace(/\s+/g, " ").trim();
}

function notice(el: Element): HTMLElement | null {
  return el.shadowRoot!.querySelector(".version-notice");
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("setup card version notice", () => {
  // First in the file: a restart notice needs Home Assistant to have run the
  // same version since the page's first answer, and that answer is kept for
  // the page (this file), so a later test's newer answer would read as a
  // restart into another version.
  it("asks for a restart, with no button, when Home Assistant runs an older version", async () => {
    const el = await mount(fakeHass(() => OLDER).hass);
    expect(text(notice(el)!)).toBe(
      `Apollo mmWave ${CARD_VERSION} is installed, but Home Assistant still runs ${OLDER}.` +
        " Restart Home Assistant to finish updating."
    );
    expect(notice(el)!.querySelector("button")).toBeNull();
  });

  it("offers Reload above the checks when the page runs older cards", async () => {
    const page = fakeHass(() => NEWER);
    const el = await mount(page.hass);
    expect(page.callWS).toHaveBeenCalledWith({ type: "manifest/get", integration: "apollo_mmwave" });
    const box = notice(el)!;
    expect(box).not.toBeNull();
    expect(box.getAttribute("role")).toBe("status");
    expect(text(box)).toBe(
      `Apollo mmWave was updated to ${NEWER}, but this page still runs ${CARD_VERSION}.` +
        " Reload" +
        " In the Home Assistant app, if Reload does not help, close the app fully and open it again."
    );
    // The checks still show under it.
    expect(text(el)).toContain(ALL_GOOD_LINE);
    expect(text(el).indexOf("Reload")).toBeLessThan(text(el).indexOf(ALL_GOOD_LINE));

    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ reload } as any);
    const button = box.querySelector("button")!;
    expect(button.textContent!.trim()).toBe("Reload");
    button.click();
    expect(reload).toHaveBeenCalledTimes(1);
    // Reload writes nothing to Home Assistant.
    expect(page.hass.callService).not.toHaveBeenCalled();
  });

  it("shows nothing when the versions match, and asks again after a reconnect", async () => {
    let running = CARD_VERSION;
    const page = fakeHass(() => running);
    const el = await mount(page.hass);
    expect(notice(el)).toBeNull();
    expect(text(el)).toContain(ALL_GOOD_LINE);

    // Home Assistant restarts into a newer version: the websocket drops and
    // comes back, and the card asks again.
    running = NEWER;
    page.ready();
    await settle(el);
    expect(page.callWS).toHaveBeenCalledTimes(2);
    expect(text(notice(el)!)).toContain(`was updated to ${NEWER}`);

    running = CARD_VERSION;
    page.ready();
    await settle(el);
    expect(notice(el)).toBeNull();
  });

  it("renders its checks as usual when manifest/get fails", async () => {
    const el = await mount(fakeHass(() => new Error("socket closed")).hass);
    expect(notice(el)).toBeNull();
    expect(text(el)).toContain(ALL_GOOD_LINE);
  });

  it("shows the notice once on a tab with two setup cards, on the first", async () => {
    const page = fakeHass(() => NEWER);
    const first = await mount(page.hass);
    const second = await mount(page.hass);
    await settle(first);
    expect(notice(first)).not.toBeNull();
    expect(notice(second)).toBeNull();
    // The page asked once for both.
    expect(page.callWS).toHaveBeenCalledTimes(1);
    // The first leaves the page (another tab): the second shows it.
    first.remove();
    await settle(second);
    expect(notice(second)).not.toBeNull();
  });
});
