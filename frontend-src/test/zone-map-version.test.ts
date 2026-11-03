/**
 * The zone map card's version notice (version-check.ts), mounted in
 * happy-dom with a fake hass whose `manifest/get` answers with the version
 * Home Assistant runs. A tab that has no Radar setup card above the map, or
 * a dashboard of the user's own with the map alone, says there that the page
 * still runs old cards after an update. Its own file, because the check
 * keeps Home Assistant's first answer for the page: each test hands in a new
 * connection to ask again. vitest.bundles.config.ts runs it against the
 * committed bundle too.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ZoneMapCard } from "../src/zone-map/card";
import { ZONES_GET, ZONES_SUBSCRIBE } from "../src/zone-map/api";
import { CARD_VERSION } from "../src/version";

type Handler = (message: any) => void;

const NEWER = "99.0.0";
const OLDER = "0.1.0";

const ZONE_PAYLOAD = {
  zones: {
    "1": { shape: "rect", data: { x_min: 0, x_max: 1000, y_min: 0, y_max: 1000 }, name: "Couch" },
  },
  entities: null,
  rotation_deg: 0,
  label: "Office radar",
  suggested_entities: [{ x: "sensor.a_x", y: "sensor.a_y" }],
};

const RELOAD_TEXT =
  `Apollo mmWave was updated to ${NEWER}, but this page still runs ${CARD_VERSION}.` +
  " Reload" +
  " In the Home Assistant app, if Reload does not help, close the app fully and open it again.";

/** A hass whose zone store answers, on a connection that can fire `ready`,
 *  and whose `manifest/get` answers with `running()`. */
function fakeHass(running: () => unknown, zoneError?: unknown) {
  const listeners: (() => void)[] = [];
  const callWS = vi.fn(async (msg: Record<string, any>) => {
    if (msg.type === "manifest/get") {
      const version = running();
      if (version instanceof Error) throw version;
      return { domain: "apollo_mmwave", version };
    }
    if (msg.type === ZONES_GET) {
      if (zoneError) throw zoneError;
      return ZONE_PAYLOAD;
    }
    return [];
  });
  const hass: any = {
    states: {},
    entities: {},
    devices: {},
    user: { is_admin: true },
    callService: vi.fn(),
    callWS,
    connection: {
      subscribeMessage: vi.fn(async (_cb: Handler, msg: any) => {
        if (zoneError && msg.type === ZONES_SUBSCRIBE) throw zoneError;
        return () => undefined;
      }),
      addEventListener: vi.fn((event: string, cb: () => void) => {
        if (event === "ready") listeners.push(cb);
      }),
      removeEventListener: vi.fn(),
    },
  };
  return { hass, callWS, ready: () => listeners.forEach((cb) => cb()) };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** A card on the page, as Home Assistant adds one: config, hass, attach. */
async function mount(hass: unknown, config: Record<string, unknown> = {}): Promise<any> {
  const card: any = new ZoneMapCard();
  card.setConfig({ device_id: "dev123", ...config });
  card.hass = hass;
  document.body.appendChild(card);
  await vi.waitFor(() => expect(card._zoneConfigPayload || card._loadError).toBeTruthy());
  await settle();
  return card;
}

function notice(card: any): HTMLElement | null {
  return card.shadowRoot.querySelector("#versionNotice .apollo-version-notice");
}

/** The notice's lines and its button, in order, one string. */
function text(el: Element): string {
  return Array.from(el.children, (child) => (child.textContent ?? "").trim()).join(" ");
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("zone map card version notice", () => {
  // First in the file: a restart notice needs Home Assistant to have run the
  // same version since the page's first answer, and the page (this file)
  // keeps that answer, so a later test's newer answer reads as a restart.
  it("asks for a restart, with no button, when Home Assistant runs an older version", async () => {
    const card = await mount(fakeHass(() => OLDER).hass);
    expect(text(notice(card)!)).toBe(
      `Apollo mmWave ${CARD_VERSION} is installed, but Home Assistant still runs ${OLDER}.` +
        " Restart Home Assistant to finish updating."
    );
    expect(notice(card)!.querySelector("button")).toBeNull();
  });

  it("offers Reload under the title and over the map when the page runs older cards", async () => {
    const page = fakeHass(() => NEWER);
    const card = await mount(page.hass);
    expect(page.callWS).toHaveBeenCalledWith({ type: "manifest/get", integration: "apollo_mmwave" });
    const box = notice(card)!;
    expect(box).not.toBeNull();
    expect(box.getAttribute("role")).toBe("status");
    expect(text(box)).toBe(RELOAD_TEXT);
    // Between the title and the map, outside it: a button over the canvas
    // would sit under the map's own controls.
    const host = card.shadowRoot.getElementById("versionNotice");
    expect(host.previousElementSibling.id).toBe("deviceTitle");
    expect(host.nextElementSibling.classList.contains("canvas-container")).toBe(true);
    expect(card.shadowRoot.querySelector(".canvas-container #versionNotice")).toBeNull();

    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ reload } as any);
    const button = box.querySelector("button")!;
    expect(button.textContent!.trim()).toBe("Reload");
    button.click();
    expect(reload).toHaveBeenCalledTimes(1);
    // Reload writes nothing to Home Assistant.
    expect(page.hass.callService).not.toHaveBeenCalled();
  });

  it("keeps the notice through a render and a hass push", async () => {
    const page = fakeHass(() => NEWER);
    const card = await mount(page.hass);
    expect(notice(card)).not.toBeNull();
    card.render();
    expect(text(notice(card)!)).toBe(RELOAD_TEXT);
    const before = notice(card);
    // A push of the same hass, as the LD2450 sends several a second, asks
    // nothing and touches nothing.
    card.hass = page.hass;
    await settle();
    expect(notice(card)).toBe(before);
    expect(page.callWS.mock.calls.filter(([msg]) => msg.type === "manifest/get")).toHaveLength(1);
  });

  it("shows the notice on the map alone (view_only)", async () => {
    const card = await mount(fakeHass(() => NEWER).hass, { view_only: true });
    expect(card.shadowRoot.getElementById("zoomControls")).toBeNull();
    const host = card.shadowRoot.getElementById("versionNotice");
    expect(host.nextElementSibling.classList.contains("canvas-container")).toBe(true);
    expect(text(notice(card)!)).toBe(RELOAD_TEXT);
  });

  it("shows the notice over a zone read that failed", async () => {
    // A zone read refused right after an update is often the old
    // integration still running, or the old card talking to the new one.
    const error = { code: "unknown_command", message: "Unknown command." };
    const card = await mount(fakeHass(() => NEWER, error).hass);
    expect(card.canvas).toBeNull();
    expect(card.shadowRoot.getElementById("loadError").textContent).not.toBe("");
    expect(text(notice(card)!)).toBe(RELOAD_TEXT);
  });

  it("shows nothing when the versions match, and asks again after a reconnect", async () => {
    let running: unknown = CARD_VERSION;
    const page = fakeHass(() => running);
    const card = await mount(page.hass);
    expect(notice(card)).toBeNull();

    // Home Assistant restarts into a newer version: the websocket drops and
    // comes back, and the page asks again.
    running = NEWER;
    page.ready();
    await settle();
    expect(text(notice(card)!)).toContain(`was updated to ${NEWER}`);

    running = CARD_VERSION;
    page.ready();
    await settle();
    expect(notice(card)).toBeNull();
    expect(card.shadowRoot.getElementById("versionNotice").children).toHaveLength(0);
  });

  it("draws the map as usual when manifest/get fails", async () => {
    const card = await mount(fakeHass(() => new Error("socket closed")).hass);
    expect(notice(card)).toBeNull();
    expect(card.canvas).not.toBeNull();
    expect(card._loadError).toBeNull();
  });

  it("shows the notice once on a page with two maps, on the first", async () => {
    const page = fakeHass(() => NEWER);
    const first = await mount(page.hass);
    const second = await mount(page.hass, { view_only: true });
    expect(notice(first)).not.toBeNull();
    expect(notice(second)).toBeNull();
    // The page asked once for both.
    expect(page.callWS.mock.calls.filter(([msg]) => msg.type === "manifest/get")).toHaveLength(1);
    // The first leaves the page (another tab): the second shows it, and the
    // first, back on the page, comes after it.
    first.remove();
    await settle();
    expect(notice(first)).toBeNull();
    expect(text(notice(second)!)).toBe(RELOAD_TEXT);
    document.body.appendChild(first);
    await settle();
    expect(notice(first)).toBeNull();
    expect(notice(second)).not.toBeNull();
    // No listener stays behind once both are gone.
    first.remove();
    second.remove();
    expect(page.hass.connection.removeEventListener).toHaveBeenCalledWith(
      "ready",
      expect.any(Function)
    );
  });
});
