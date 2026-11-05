/**
 * The card's identity and config contract.
 *
 * The element name is the load-bearing part here. `zone-mapper-card` is also
 * the name the standalone card registers, and whichever bundle a browser loads
 * first wins it, so a user running both got one integration's card writing to
 * the other's backend. We take a name in our own namespace and never answer to
 * the old one.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { ZoneMapCard } from "../src/zone-map/card";
import {
  CONFIG_ENTRIES_SUBSCRIBE,
  MOVEMENT_CLEAR,
  MOVEMENT_GET,
  ZONES_GET,
  ZONES_SUBSCRIBE,
} from "../src/zone-map/api";
import type { ZoneConfig } from "../src/zone-map/api";

type Handler = (message: any) => void;

const ZONE_PAYLOAD = {
  zones: {
    "1": {
      shape: "rect",
      data: { x_min: 0, x_max: 1000, y_min: 0, y_max: 1000 },
      name: "Doorway",
    },
  },
  entities: null as any,
  rotation_deg: 12,
  label: "Office radar",
  suggested_entities: [{ x: "sensor.a_x", y: "sensor.a_y" }],
};

/**
 * The fixed grid every card drew on before a card with no grid was fitted to
 * the radar's field of view: x -5000..5000 and y 0..10000 mm on the square
 * 800 px canvas a YAML grid keeps, 12.5 mm per bitmap px. The drawing and
 * label layout tests pin it, so their pixel arithmetic stays about drawing
 * and labels rather than about the fit.
 */
const TEN_METER_GRID = { grid: { x_min: -5000, x_max: 5000, y_min: 0, y_max: 10000 } };

/** A hass whose zone read answers from the store, never from attributes. */
function fakeHass(payload: any = ZONE_PAYLOAD, error?: any) {
  const handlers: Record<string, Handler[]> = {};
  const hass: any = {
    states: {},
    entities: {},
    devices: {},
    handlers,
    // Mutable, so a test can point the store at a second radar mid-life.
    payload,
    error,
    callService: vi.fn(),
    callWS: vi.fn(async (msg: any) => {
      if (msg.type === ZONES_GET) {
        if (hass.error) throw hass.error;
        return hass.payload;
      }
      return [];
    }),
    connection: {
      subscribeMessage: vi.fn(async (cb: Handler, msg: any) => {
        if (hass.error && msg.type === ZONES_SUBSCRIBE) throw hass.error;
        (handlers[msg.type] ||= []).push(cb);
        return () => {
          hass.closed.push(msg.type);
        };
      }),
    },
    closed: [] as string[],
  };
  return hass;
}

/** A target sensor's state object, carrying a unit_of_measurement when one is given. */
function targetState(state: string, unit?: unknown) {
  return unit === undefined ? { state } : { state, attributes: { unit_of_measurement: unit } };
}

/** A fakeHass with hass.themes.darkMode set, for the theme-follow tests. */
function themedHass(darkMode: boolean) {
  const hass = fakeHass();
  hass.themes = { darkMode };
  return hass;
}

/** Collect the toasts the card raises. */
function notifications(card: any): string[] {
  const seen: string[] = [];
  card.addEventListener("hass-notification", (event: any) => {
    seen.push(event.detail?.message);
  });
  return seen;
}

/** Attach a configured card to a hass and wait for the first payload. */
async function mountCard(hass: any, config: Record<string, any> = {}) {
  const card = new ZoneMapCard();
  card.setConfig({ device_id: "dev123", ...config } as any);
  (card as any).hass = hass;
  // Only the answer is worth waiting for. A card whose subscribe is refused
  // never reaches the read, and the card's only other websocket calls (the
  // registry lists the deleted pickers needed) are gone.
  await vi.waitFor(() =>
    expect((card as any)._zoneConfigPayload || (card as any)._loadError).toBeTruthy()
  );
  return card as any;
}

// Every card here mounts as dev123, and _applyAutoLock reads the lock toggle
// remembered for that radar, so a toggle one test stores must not reach the
// next one, whichever describe it is in.
afterEach(() => window.localStorage.clear());

describe("zone map card registration", () => {
  it("registers under the apollo-radar namespace and not the old name", () => {
    expect(customElements.get("apollo-radar-zone-map-card")).toBeDefined();
    expect(customElements.get("zone-mapper-card")).toBeUndefined();
  });

  it("advertises itself in the card picker with the LD2450 description", () => {
    const entry = (window as any).customCards.find(
      (c: any) => c.type === "apollo-radar-zone-map-card"
    );
    expect(entry.name).toBe("Apollo Zone Map");
    expect(entry.description).toContain("LD2450");
  });

  it("offers a stub config under the new type, keyed by device id", () => {
    const stub = ZoneMapCard.getStubConfig(fakeHass()) as any;
    expect(stub.type).toBe("custom:apollo-radar-zone-map-card");
    expect(stub).not.toHaveProperty("location");
  });

  it("omits start_locked from the stub so a picker-added card auto-locks", () => {
    // An explicit start_locked: false here switched the auto-lock off for
    // every card added through the UI, so a phone scroll could redraw zones.
    expect(ZoneMapCard.getStubConfig(fakeHass())).not.toHaveProperty("start_locked");
  });

  it("omits view_only from the stub so a picker-added card can draw", () => {
    expect(ZoneMapCard.getStubConfig(fakeHass())).not.toHaveProperty("view_only");
  });
});

describe("zone map card lock state", () => {
  const KEY = "apollo-mmwave.zone-map.lock.dev123";

  it("starts locked when the radar already has zones", async () => {
    const card = await mountCard(fakeHass());
    expect(card.isLocked).toBe(true);
  });

  it("starts unlocked when the radar has no zones yet", async () => {
    const card = await mountCard(fakeHass({ ...ZONE_PAYLOAD, zones: {} }));
    expect(card.isLocked).toBe(false);
  });

  it("remembers the lock toggle per radar across a reload", async () => {
    const card = await mountCard(fakeHass());
    card.shadowRoot.getElementById("btnLock").click();
    expect(card.isLocked).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("0");

    const again = await mountCard(fakeHass());
    expect(again.isLocked).toBe(false);

    again.shadowRoot.getElementById("btnLock").click();
    expect(window.localStorage.getItem(KEY)).toBe("1");
    expect((await mountCard(fakeHass({ ...ZONE_PAYLOAD, zones: {} }))).isLocked).toBe(true);
  });

  it("lets an explicit start_locked win over zones and the remembered toggle", async () => {
    window.localStorage.setItem(KEY, "1");
    const unlocked = await mountCard(fakeHass(), { start_locked: false });
    expect(unlocked.isLocked).toBe(false);

    window.localStorage.setItem(KEY, "0");
    const locked = await mountCard(fakeHass({ ...ZONE_PAYLOAD, zones: {} }), {
      start_locked: true,
    });
    expect(locked.isLocked).toBe(true);
  });
});

describe("zone map card cone rotation lock", () => {
  // The radar in ZONE_PAYLOAD has a zone, so the card starts locked.
  const slider = (card: any) => card.shadowRoot.getElementById("coneAngleSlider");
  const row = (card: any) => card.shadowRoot.getElementById("cone-controls");
  const hint = (card: any) => card.shadowRoot.getElementById("coneLockHint");

  function press(target: EventTarget, type: string, init: PointerEventInit = {}): void {
    target.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        isPrimary: true,
        pointerType: "touch",
        button: 0,
        clientX: 100,
        clientY: 20,
        bubbles: true,
        composed: true,
        ...init,
      })
    );
  }

  it("disables the slider and shows the hint while the map is locked", async () => {
    const card = await mountCard(fakeHass());
    expect(card.isLocked).toBe(true);
    expect(slider(card).disabled).toBe(true);
    expect(row(card).classList.contains("locked")).toBe(true);
    expect(hint(card).hidden).toBe(false);
    expect(hint(card).textContent).toBe(
      "Locked with the map. Press Locked on the map to change it."
    );

    card.shadowRoot.getElementById("btnLock").click();

    expect(slider(card).disabled).toBe(false);
    expect(row(card).classList.contains("locked")).toBe(false);
    expect(hint(card).hidden).toBe(true);
  });

  it("says under the slider to mount the sensor first, locked or not", async () => {
    // Nothing on the sensor tells the map how it is mounted, so the zones fit
    // the room only while it stays mounted the way the slider is set.
    const card = await mountCard(fakeHass());
    const mount = card.shadowRoot.getElementById("coneMountHint");
    const text =
      "Mount the sensor first, then set this. Zones match the room only while the sensor stays mounted that way.";
    expect(mount.textContent).toBe(text);
    expect(mount.hidden).toBe(false);
    // In the slider's row, after the slider and its label, and before the
    // lock's hint.
    const ids = Array.from(row(card).children, (el: any) => el.id);
    expect(ids.slice(-3)).toEqual(["coneAngleLabel", "coneMountHint", "coneLockHint"]);

    card.shadowRoot.getElementById("btnLock").click();
    expect(card.isLocked).toBe(false);
    expect(mount.hidden).toBe(false);
    expect(mount.textContent).toBe(text);
  });

  it("leaves the slider free on a radar with no zones yet", async () => {
    const card = await mountCard(fakeHass({ ...ZONE_PAYLOAD, zones: {} }));
    expect(slider(card).disabled).toBe(false);
    expect(hint(card).hidden).toBe(true);
  });

  it("neither turns the cone nor saves when a locked slider still gets input", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass, { cone: { angle_deg: 45 } });
    hass.callService.mockClear();

    slider(card).value = "90";
    slider(card).dispatchEvent(new Event("input"));
    slider(card).dispatchEvent(new Event("change"));
    slider(card).dispatchEvent(new MouseEvent("dblclick"));

    expect(card.coneAngleDeg).toBe(12);
    expect(slider(card).value).toBe("12");
    expect(card.shadowRoot.getElementById("coneAngleLabel").textContent).toBe("12°");
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("turns and saves again once the map is unlocked", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);
    card.shadowRoot.getElementById("btnLock").click();
    hass.callService.mockClear();

    slider(card).value = "30";
    slider(card).dispatchEvent(new Event("input"));
    slider(card).dispatchEvent(new Event("change"));

    expect(card.coneAngleDeg).toBe(30);
    expect(hass.callService.mock.calls.at(-1)[2]).toMatchObject({ rotation_deg: 30 });
  });

  it("reminds on a tap at the locked slider and rings the Locked button", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const card = await mountCard(fakeHass());
      const seen = notifications(card);
      const btnLock = card.shadowRoot.getElementById("btnLock");

      press(row(card), "pointerdown");
      press(row(card), "pointerup", { clientX: 103, clientY: 22 });

      expect(seen).toEqual([
        "Cone rotation is locked. Press Locked on the map to change it.",
      ]);
      expect(btnLock.classList.contains("nudge")).toBe(true);
      vi.advanceTimersByTime(1200);
      expect(btnLock.classList.contains("nudge")).toBe(false);

      // A second tap right away rings the button but does not toast again.
      press(row(card), "pointerdown");
      press(row(card), "pointerup");
      expect(seen).toHaveLength(1);
      expect(btnLock.classList.contains("nudge")).toBe(true);

      vi.advanceTimersByTime(1600);
      press(row(card), "pointerdown");
      press(row(card), "pointerup");
      expect(seen).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reminds once on a drag along the locked slider", async () => {
    const card = await mountCard(fakeHass());
    const seen = notifications(card);

    press(row(card), "pointerdown");
    press(row(card), "pointermove", { clientX: 115, clientY: 22 });
    press(row(card), "pointermove", { clientX: 160, clientY: 24 });
    press(row(card), "pointerup", { clientX: 160, clientY: 24 });

    expect(seen).toHaveLength(1);
  });

  it("says nothing about a scroll that starts on the locked slider", async () => {
    const card = await mountCard(fakeHass());
    const seen = notifications(card);

    // The browser takes the pan and cancels the pointer.
    press(row(card), "pointerdown");
    press(row(card), "pointermove", { clientX: 102, clientY: 60 });
    press(row(card), "pointercancel");
    // A mouse dragged up the row and let go.
    press(row(card), "pointerdown", { pointerType: "mouse" });
    press(row(card), "pointermove", { pointerType: "mouse", clientY: 80 });
    press(row(card), "pointerup", { pointerType: "mouse", clientY: 80 });

    expect(seen).toEqual([]);
  });

  it("says nothing about a tap on the slider row once the map is unlocked", async () => {
    const card = await mountCard(fakeHass(), { start_locked: false });
    const seen = notifications(card);

    press(row(card), "pointerdown");
    press(row(card), "pointerup");

    expect(seen).toEqual([]);
  });

  it("names the cone rotation in the lock toggle's toasts", async () => {
    const card = await mountCard(fakeHass());
    const seen = notifications(card);
    const btnLock = card.shadowRoot.getElementById("btnLock");

    btnLock.click();
    btnLock.click();

    expect(seen).toEqual([
      "Drawing and cone rotation unlocked. You can edit zones now.",
      "Drawing and cone rotation locked. Unlock the map to change them.",
    ]);
  });

  it("the lock toasts say map", async () => {
    // The button says Locked on the map, and the card has called its canvas
    // the map since the fitted grid; "grid" in a toast named nothing on screen.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const card = await mountCard(fakeHass(), TEN_METER_GRID);
      const seen = notifications(card);
      const btnLock = card.shadowRoot.getElementById("btnLock");
      btnLock.click();
      btnLock.click();

      card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));
      vi.advanceTimersByTime(1600);
      card.shadowRoot.getElementById("clearBtn").click();

      expect(seen).toEqual([
        "Drawing and cone rotation unlocked. You can edit zones now.",
        "Drawing and cone rotation locked. Unlock the map to change them.",
        "Unlock the map to draw zones.",
        "Unlock the map to clear zones.",
      ]);
      expect(seen.filter((message) => /\bgrid\b/i.test(message))).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a lock reminder rings the Locked button", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const card = await mountCard(fakeHass(), TEN_METER_GRID);
      expect(card.isLocked).toBe(true);
      const seen = notifications(card);
      const btnLock = card.shadowRoot.getElementById("btnLock");

      card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));

      expect(seen).toEqual(["Unlock the map to draw zones."]);
      expect(btnLock.classList.contains("nudge")).toBe(true);
      vi.advanceTimersByTime(1200);
      expect(btnLock.classList.contains("nudge")).toBe(false);

      // The draw, clear and cone reminders share one throttle: a clear tried
      // right after rings the button again but does not toast a second time.
      vi.advanceTimersByTime(100);
      card.shadowRoot.getElementById("clearBtn").click();
      expect(btnLock.classList.contains("nudge")).toBe(true);
      expect(seen).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("zone map card config", () => {
  it("rejects a config with no device_id and says what to do about it", () => {
    const card = new ZoneMapCard();
    expect(() => card.setConfig({} as any)).toThrow(/device_id/);
  });

  it("still rejects the old location-only config", () => {
    const card = new ZoneMapCard();
    expect(() => card.setConfig({ location: "Office" } as any)).toThrow();
  });

  it("renders with a device id, exercising the canvas stub", () => {
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "abc123" } as any);
    expect(card.shadowRoot?.querySelector("canvas")).toBeTruthy();
  });

  it("keeps title as display only, separate from the device id", () => {
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "abc123", title: "Kitchen" } as any);
    // Cast: the card is still @ts-nocheck, so its fields aren't declared.
    expect((card as any).deviceId).toBe("abc123");
    expect((card as any).cardTitle).toBe("Kitchen");
  });

  it("does not leak the title onto the host element's tooltip", () => {
    // `title` is a native HTMLElement accessor: assigning it would reflect to
    // the title attribute and put a browser tooltip over the whole card.
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "abc123", title: "Kitchen" } as any);
    expect(card.hasAttribute("title")).toBe(false);
  });

  it("keeps no location string at all", () => {
    // The location string was the backend key AND the slug the card built
    // entity ids from. Both are gone; the device id is the only key.
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "abc123", title: "Kitchen" } as any);
    expect((card as any).location).toBeUndefined();
    expect((card as any).updateZonesFromEntities).toBeUndefined();
  });
});

describe("zone map card theme", () => {
  it("follows the Home Assistant theme when dark_mode is not in the config", () => {
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "dev123" } as any);

    card.hass = themedHass(true);

    expect((card as any).darkMode).toBe(true);
    expect(
      card.shadowRoot!.querySelector(".container")?.classList.contains("dark")
    ).toBe(true);
  });

  it("lets an explicit dark_mode win over the theme in both directions", () => {
    const forcedLight = new ZoneMapCard();
    forcedLight.setConfig({ device_id: "dev123", dark_mode: false } as any);
    forcedLight.hass = themedHass(true);
    expect((forcedLight as any).darkMode).toBe(false);

    const forcedDark = new ZoneMapCard();
    forcedDark.setConfig({ device_id: "dev123", dark_mode: true } as any);
    forcedDark.hass = themedHass(false);
    expect((forcedDark as any).darkMode).toBe(true);
  });

  it("repaints the canvas when the theme flips while mounted, not just the field", () => {
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "dev123" } as any);
    card.hass = themedHass(false);

    const canvasBefore = card.shadowRoot!.querySelector("canvas");
    expect(
      card.shadowRoot!.querySelector(".container")?.classList.contains("dark")
    ).toBe(false);

    card.hass = themedHass(true);

    const canvasAfter = card.shadowRoot!.querySelector("canvas");
    expect((card as any).darkMode).toBe(true);
    expect(
      card.shadowRoot!.querySelector(".container")?.classList.contains("dark")
    ).toBe(true);
    // A fresh element, not the same node with a class swapped in: proves the
    // setter actually rebuilt the canvas rather than only flipping a field.
    expect(canvasAfter).not.toBe(canvasBefore);

    // The LD2450 pushes coordinates several times a second through this same
    // setter. A second call with no theme change must not rebuild again.
    card.hass = themedHass(true);
    expect(card.shadowRoot!.querySelector("canvas")).toBe(canvasAfter);
  });

  it("repaints the load-error screen when the theme flips", async () => {
    // The error screen replaces the map, so there is no canvas, but its
    // container is themed the same way and has to follow a theme flip too.
    const error = { code: "not_found", message: "No Home Assistant device with id dev123" };
    const lightHass = fakeHass(ZONE_PAYLOAD, error);
    lightHass.themes = { darkMode: false };
    const card = await mountCard(lightHass);
    expect(card.canvas).toBeNull();
    expect(
      card.shadowRoot!.querySelector(".container")?.classList.contains("dark")
    ).toBe(false);

    const darkHass = fakeHass(ZONE_PAYLOAD, error);
    darkHass.themes = { darkMode: true };
    card.hass = darkHass;

    expect(card.darkMode).toBe(true);
    const container = card.shadowRoot!.querySelector(".container");
    expect(container?.classList.contains("dark")).toBe(true);
    // Still the error screen, with its message, not a map brought back.
    expect(card.shadowRoot!.querySelector("canvas")).toBeNull();
    expect(card.shadowRoot!.getElementById("loadError")?.textContent).toContain("dev123");

    // A push with no theme change must not rebuild the error screen either.
    card.hass = darkHass;
    expect(card.shadowRoot!.querySelector(".container")).toBe(container);
  });

  it("omits dark_mode from the stub config so a manually added card follows the theme", () => {
    // HA's "Add Card" picker seeds a new card from this stub. A hardcoded key
    // here would ship every manually added card as a light-mode override, on
    // any dashboard, which is the exact bug this task exists to fix.
    const stub = ZoneMapCard.getStubConfig(fakeHass());
    expect(stub).not.toHaveProperty("dark_mode");

    const card = new ZoneMapCard();
    // fakeHass has no device registry, so the stub's own device_id lookup
    // comes back empty; that lookup is not what this test is about.
    card.setConfig({ ...stub, device_id: "dev123" } as any);
    card.hass = themedHass(true);

    expect((card as any).darkMode).toBe(true);
  });

  it("reverts to the theme when dark_mode is removed from a mounted card's config", () => {
    const card = new ZoneMapCard();
    card.setConfig({ device_id: "dev123", dark_mode: true } as any);
    // The theme is light, but the config override still wins.
    card.hass = themedHass(false);
    expect((card as any).darkMode).toBe(true);

    // Home Assistant re-calls setConfig on a live element whenever the config
    // changes; this is what a user editing the card to delete that line looks
    // like. Without reverting darkMode here, the render() at the end of
    // setConfig would still paint the stale (dark) value until the next hass
    // push happened to correct it, a wrong-theme flash on a card that is
    // theme-following the whole time.
    card.setConfig({ device_id: "dev123" } as any);
    expect((card as any).darkMode).toBe(false);
  });
});

describe("zone map card config keys removed on a live element", () => {
  // Home Assistant re-calls setConfig on a live element when the config
  // changes. A key deleted from it has to land where a freshly created card
  // with the same config would, not keep what the previous config asked for.
  const TYPE = "custom:apollo-radar-zone-map-card";
  const EMPTY = { ...ZONE_PAYLOAD, zones: {} };

  const FULL = {
    type: TYPE,
    grid: { x_min: -1000, x_max: 1000, y_min: 0, y_max: 2000 },
    cone: { y_max: 1500, fov_deg: 90, angle_deg: 30 },
    show_undo: false,
    unit_label_size: 24,
  };

  /** The fields setConfig derives from grid, cone, show_undo and unit_label_size. */
  function configured(card: any) {
    return {
      grid: [card.xMin, card.xMax, card.yMin, card.yMax],
      cone: [card.coneYMax, card.coneFovDeg, card.coneAngleDefault, card.coneAngleDeg],
      showUndo: card.showUndo,
      unitLabelSize: card.unitLabelSize,
    };
  }

  it("restores the defaults when grid, cone, show_undo, unit_label_size and start_locked go", async () => {
    // No zones on this radar, so the auto rule (no remembered toggle) unlocks.
    const card = await mountCard(fakeHass(EMPTY), { ...FULL, start_locked: true });
    expect(configured(card)).toEqual({
      grid: [-1000, 1000, 0, 2000],
      // The drawn angle is the store's rotation_deg, the YAML one only the reset.
      cone: [1500, 90, 30, 12],
      showUndo: false,
      unitLabelSize: 24,
    });
    expect(card.isLocked).toBe(true);
    expect(card.shadowRoot.getElementById("btnUndo").style.display).toBe("none");

    card.setConfig({ type: TYPE, device_id: "dev123" });

    const fresh = await mountCard(fakeHass(EMPTY), { type: TYPE });
    expect(configured(card)).toEqual(configured(fresh));
    expect(configured(card)).toEqual({
      grid: [fresh.xMin, fresh.xMax, fresh.yMin, fresh.yMax],
      cone: [fresh.coneYMax, fresh.coneFovDeg, fresh.coneAngleDefault, 12],
      showUndo: true,
      unitLabelSize: 18,
    });
    expect(card.shadowRoot.getElementById("btnUndo").style.display).not.toBe("none");
    expect(card.isLocked).toBe(false);
    expect(card.isLocked).toBe(fresh.isLocked);
    expect(card.shadowRoot.getElementById("btnLock").title).toBe(
      "Lock drawing and cone rotation"
    );
  });

  it("re-derives the lock from the radar's zones once start_locked is removed", async () => {
    const card = await mountCard(fakeHass(), { type: TYPE, start_locked: false });
    expect(card.isLocked).toBe(false);

    // The editor's "auto" choice deletes the key.
    card.setConfig({ type: TYPE, device_id: "dev123" });

    expect(card.isLocked).toBe(true);
    expect(card.shadowRoot.getElementById("btnLock").title).toBe(
      "Unlock drawing and cone rotation"
    );
  });

  it("puts the sub-keys a partial grid or cone leaves out back at their defaults", async () => {
    const card = await mountCard(fakeHass(), FULL);

    card.setConfig({
      type: TYPE,
      device_id: "dev123",
      grid: { x_min: -3000 },
      cone: { fov_deg: 60 },
    });

    const fresh = await mountCard(fakeHass(), { type: TYPE });
    expect(card.xMin).toBe(-3000);
    // A grid block naming any extent is a YAML grid, and the extents it leaves
    // out are the fixed ones a YAML grid always had, not the fitted ones.
    expect([card.xMax, card.yMin, card.yMax]).toEqual([5000, 0, 10000]);
    expect(card.coneFovDeg).toBe(60);
    expect([card.coneYMax, card.coneAngleDefault]).toEqual([
      fresh.coneYMax,
      fresh.coneAngleDefault,
    ]);
    expect(card.coneAngleDeg).toBe(12);
  });

  it("falls back to the default label size for an unusable unit_label_size", async () => {
    const card = await mountCard(fakeHass(), FULL);
    expect(card.unitLabelSize).toBe(24);

    card.setConfig({ ...FULL, device_id: "dev123", unit_label_size: "large" });

    expect(card.unitLabelSize).toBe(18);
  });
});

describe("zone map card grid and cone config", () => {
  it("reads the grid extents in grid_units and keeps them in mm", async () => {
    const card = await mountCard(fakeHass(), {
      grid_units: "cm",
      grid: { x_min: -300, x_max: 300, y_min: 0, y_max: 500 },
    });

    expect([card.xMin, card.xMax, card.yMin, card.yMax]).toEqual([-3000, 3000, 0, 5000]);
  });

  it("keeps the default for an extent that is not a number", async () => {
    const card = await mountCard(fakeHass(), {
      grid_units: "cm",
      grid: { x_min: "wide", x_max: 250 },
    });

    expect([card.xMin, card.xMax, card.yMin, card.yMax]).toEqual([-5000, 2500, 0, 10000]);
  });

  it("swaps inverted extents and widens equal ones by 1 mm, after converting", async () => {
    const card = await mountCard(fakeHass(), {
      grid_units: "ft",
      grid: { x_min: 10, x_max: -10, y_min: 5, y_max: 5 },
    });

    expect([card.xMin, card.xMax, card.yMin, card.yMax]).toEqual([-3048, 3048, 1524, 1525]);
    // The canvas spans the corrected extents, y_min on the top edge.
    expect(card.valueToPixels(-3048, "x")).toBe(0);
    expect(card.valueToPixels(3048, "x")).toBeCloseTo(800, 9);
    expect(card.valueToPixels(1524, "y")).toBe(0);
    expect(card.valueToPixels(1525, "y")).toBeCloseTo(800, 9);

    card.setConfig({
      device_id: "dev123",
      grid_units: "ft",
      grid: { x_min: 0, x_max: 0, y_min: 20, y_max: 10 },
    });
    expect([card.xMin, card.xMax, card.yMin, card.yMax]).toEqual([0, 1, 3048, 6096]);
  });

  it("reads the cone range in grid_units and keeps the cone config in bounds", async () => {
    const cm = await mountCard(fakeHass(), {
      grid_units: "cm",
      cone: { y_max: 450, fov_deg: 90 },
    });
    expect([cm.coneYMax, cm.coneFovDeg]).toEqual([4500, 90]);

    const card = await mountCard(fakeHass(), { cone: { y_max: -5, fov_deg: 0 } });
    expect([card.coneYMax, card.coneFovDeg]).toEqual([0, 1]);

    card.setConfig({ device_id: "dev123", cone: { fov_deg: 400 } });
    expect(card.coneFovDeg).toBe(360);

    // A value that is not a number keeps the default rather than going NaN.
    card.setConfig({ device_id: "dev123", cone: { y_max: "far", fov_deg: "wide" } });
    expect([card.coneYMax, card.coneFovDeg]).toEqual([6000, 120]);
  });

  it("labels ticks in the grid's display unit at the step's precision", async () => {
    const card = await mountCard(fakeHass());

    expect(
      ["mm", "cm", "m", "in", "ft", undefined, "furlong"].map((unit) =>
        card._gridDisplayUnit(unit)
      )
    ).toEqual(["m", "cm", "m", "ft", "ft", "m", "m"]);
    expect(card._formatTickLabel(500, 500, "m")).toBe("0.5m");
    expect(card._formatTickLabel(-2000, 1000, "m")).toBe("-2m");
    expect(card._formatTickLabel(1500, 1500, "m")).toBe("1.5m");
    expect(card._formatTickLabel(250, 250, "m")).toBe("0.25m");
    expect(card._formatTickLabel(150, 50, "cm")).toBe("15cm");
    // Feet read "5 ft", with a space; meters stay "2m".
    expect(card._formatTickLabel(304.8, 304.8, "ft")).toBe("1 ft");
    expect(card._formatTickLabel(762, 152.4, "ft")).toBe("2.5 ft");
  });

  /** One label per step from `from` to `to`, without the origin's. */
  function tickLabels(from: number, to: number, step: number, unit: string): string[] {
    return Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step)
      .filter((value) => value !== 0)
      .map((value) => `${value}${unit}`);
  }

  /** Each grid line's value, in `unitMm` units. */
  function lineValues(lines: any[], unitMm: number): number[] {
    return lines.map((line: any) => Number((line.value / unitMm).toFixed(6)));
  }

  /** Every step from `from` to `to`, the origin included. */
  function steps(from: number, to: number, step: number): number[] {
    return Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);
  }

  it("draws a line every half meter on the default mm grid and labels every meter", async () => {
    const card = await mountCard(fakeHass(), { ...TEN_METER_GRID, unit_display: true });

    const { labels, xLines, yLines } = card._getGridRenderState();

    // Every half-meter line stays. The test canvas cannot measure text, so
    // the card estimates it: "-4.5m" is wider than the 40 px between two
    // lines, and the X axis labels every other line. A label the canvas
    // edge would cut (-5m, 5m and 10m) is left out.
    expect(lineValues(xLines, 1000)).toEqual(steps(-5, 5, 0.5));
    expect(lineValues(yLines, 1000)).toEqual(steps(0, 10, 0.5));
    expect(labels.x.map((label: any) => label.text)).toEqual(tickLabels(-4, 4, 1, "m"));
    expect(labels.y.map((label: any) => label.text)).toEqual(tickLabels(0, 9.5, 0.5, "m"));
  });

  it("labels an inch grid in feet", async () => {
    const card = await mountCard(fakeHass(), {
      grid_units: "in",
      unit_display: true,
      grid: { x_min: -96, x_max: 96, y_min: 0, y_max: 192 },
    });

    const { labels, xLines } = card._getGridRenderState();

    // One foot is 50 px here. The test canvas cannot measure text, and the
    // card's estimate of "-7 ft" is wider than that, so the X axis labels
    // every other foot. The Y axis labels stack, so each one fits but the two
    // the edge cuts.
    expect(lineValues(xLines, 304.8)).toEqual(steps(-8, 8, 1));
    expect(labels.x.map((label: any) => label.text)).toEqual(tickLabels(-6, 6, 2, " ft"));
    expect(labels.y.map((label: any) => label.text)).toEqual(tickLabels(0, 15, 1, " ft"));
  });
});

/** Arial-like advance widths, in em, of the characters axis labels use. */
const GLYPH_EM: Record<string, number> = {
  "-": 0.333,
  ".": 0.278,
  c: 0.5,
  f: 0.278,
  m: 0.833,
  t: 0.278,
};

/** How wide `text` draws at `fontPx` in a browser's sans-serif. Digits are 0.556 em. */
function browserTextWidth(text: string, fontPx: number): number {
  return [...text].reduce((sum, ch) => sum + (GLYPH_EM[ch] ?? 0.556) * fontPx, 0);
}

interface DrawnText {
  text: string;
  x: number;
  y: number;
  align: string;
  baseline: string;
  size: number;
  /** The whole font string, weight included ("bold 11px sans-serif"). */
  font?: string;
  fill?: unknown;
}

/** The px size a canvas font string names, past any weight before it. */
function fontPx(font: string): number {
  return parseFloat(String(font).replace(/^\D+/, ""));
}

/**
 * A 2D context whose measureText answers with `measure`, and that notes each
 * fillText with the font size, alignment, baseline and fill it ran under.
 */
function textRecordingContext(measure: (text: string, fontPx: number) => number) {
  const texts: DrawnText[] = [];
  const state: Record<string | symbol, any> = {
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
  };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop === "measureText") {
        return (text: string) => ({ width: measure(text, fontPx(target.font)) });
      }
      if (prop === "fillText") {
        return (text: string, x: number, y: number) => {
          texts.push({
            text,
            x,
            y,
            align: target.textAlign,
            baseline: target.textBaseline,
            size: fontPx(target.font),
            font: target.font,
            fill: target.fillStyle,
          });
        };
      }
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx, texts };
}

/** The canvas laid out `cssWidth` CSS px square, as a card that wide shows it. */
function layOut(card: any, cssWidth: number) {
  vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: cssWidth,
    bottom: cssWidth,
    x: 0,
    y: 0,
    width: cssWidth,
    height: cssWidth,
    toJSON: () => ({}),
  } as DOMRect);
}

/** The box a drawn label covers, measured the way the browser would. */
function boxOf(label: DrawnText) {
  const width = browserTextWidth(label.text, label.size);
  let left = label.x;
  if (label.align === "center") left -= width / 2;
  else if (label.align === "right") left -= width;
  let top = label.y;
  if (label.baseline === "middle") top -= label.size / 2;
  else if (label.baseline === "bottom") top -= label.size;
  return { left, right: left + width, top, bottom: top + label.size };
}

/** The clear space between two drawn labels, 0 when they overlap. */
function spaceBetween(a: DrawnText, b: DrawnText): number {
  const boxA = boxOf(a);
  const boxB = boxOf(b);
  const dx = Math.max(0, boxA.left - boxB.right, boxB.left - boxA.right);
  const dy = Math.max(0, boxA.top - boxB.bottom, boxB.top - boxA.bottom);
  return Math.hypot(dx, dy);
}

/** Every two of `items`, once each. */
function pairs<T>(items: T[]): Array<[T, T]> {
  return items.flatMap((a, i) => items.slice(i + 1).map((b): [T, T] => [a, b]));
}

/**
 * Axis and cone ring labels on a narrow card.
 *
 * On a real R PRO-1 card about 500 CSS px wide the top axis read as one run,
 * "m-4.5m-4m-3.5m...". Lines were spaced 40 backing px apart, and "-4.5m" at
 * the 18 px label font is wider than that. The center axis printed "2m2m": a
 * cone ring label sat on top of the Y axis label with the same text. Labels
 * are now measured and thinned, and a ring label that a grid label at the
 * same distance repeats is left out. A ring label nothing repeats is kept, and
 * a grid label it would crowd makes room. The grid lines, the rings and every
 * saved value stay as they were.
 */
describe("zone map card axis labels", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A card with unit labels and `config`, rotated `rotationDeg`, drawn
   *  `cssWidth` CSS px wide on a context that measures text with `measure`. */
  async function drawnLabels(
    config: Record<string, any>,
    rotationDeg: number,
    cssWidth = 500,
    measure = browserTextWidth,
    withRangeLabel = true
  ) {
    const hass = fakeHass({ ...ZONE_PAYLOAD, zones: {}, rotation_deg: rotationDeg });
    const card = await mountCard(hass, { ...TEN_METER_GRID, unit_display: true, ...config });
    layOut(card, cssWidth);
    const { ctx, texts } = textRecordingContext(measure);
    card.ctx = ctx;
    if (!withRangeLabel) card._rangeLabel = () => null;
    card._invalidateGridCache();
    card.drawGrid();
    const labels = texts.filter((label) => label.size === card.unitLabelSize);
    // The grid labels draw first, then the cone's, then the range label. Ring
    // labels and the range label are the only ones centered on both axes.
    const range = labels.filter((label) => label.text.startsWith("Radar range"));
    const rings = labels.filter(
      (label) =>
        label.align === "center" && label.baseline === "middle" && !range.includes(label)
    );
    const grid = labels.filter((label) => !rings.includes(label) && !range.includes(label));
    return { card, hass, labels, rings, grid, range };
  }

  /** An R PRO-1 card on the 10 m grid, drawn the way drawnLabels draws one. */
  async function drawnCard(rotationDeg: number, cssWidth = 500) {
    return drawnLabels({}, rotationDeg, cssWidth);
  }

  /** The grid labels within two label heights of `ring` that name its
   *  distance from the radar, whatever their sign or unit. */
  function repeatsOf(ring: DrawnText, grid: DrawnText[], ringMm: number, unitMm: number) {
    return grid.filter(
      (label) =>
        Math.abs(Math.abs(parseFloat(label.text)) * unitMm - ringMm) < 1 &&
        spaceBetween(ring, label) < 2 * ring.size
    );
  }

  /** Whether `label` draws wholly inside the 800 px canvas. */
  function onCanvas(label: DrawnText): boolean {
    const box = boxOf(label);
    return box.left >= 0 && box.right <= 800 && box.top >= 0 && box.bottom <= 800;
  }

  /** A 40 m square grid, 20 backing px to the meter, with the 6 m cone. Its
   *  Y axis labels every 2 m, and the rings are 1 m apart. */
  const WIDE_GRID = {
    grid: { x_min: -20000, x_max: 20000, y_min: 0, y_max: 40000 },
    cone: { y_max: 6000 },
  };

  it.each([0, 12, 45])("keeps every label clear of the others at %i degrees", async (rotation) => {
    const { labels } = await drawnCard(rotation);

    expect(labels.length).toBeGreaterThan(20);
    const crowded = pairs(labels)
      .filter(([a, b]) => spaceBetween(a, b) < 4)
      .map(([a, b]) => `${a.text} at ${a.x},${a.y} / ${b.text} at ${b.x},${b.y}`);
    expect(crowded).toEqual([]);
    // No label hangs off the canvas, where only a fragment of it would show.
    const cut = labels.filter((label) => {
      const box = boxOf(label);
      return box.left < 0 || box.right > 800 || box.top < 0 || box.bottom > 800;
    });
    expect(cut.map((label) => label.text)).toEqual([]);
  });

  it("labels the top axis every meter and keeps every half-meter line", async () => {
    const { card, labels } = await drawnCard(0);

    const top = labels.filter((label) => label.baseline === "top");
    expect(top.map((label) => label.text)).toEqual(
      ["-4", "-3", "-2", "-1", "1", "2", "3", "4"].map((v) => `${v}m`)
    );
    expect(card._getGridRenderState().xLines).toHaveLength(21);
  });

  it("leaves out a ring label that sits on the Y axis label with the same text", async () => {
    const { card, labels, rings } = await drawnCard(0);

    expect(rings).toEqual([]);
    // The Y axis still names each ring's distance, once.
    const yAxis = labels.filter((label) => label.align === "right");
    for (const text of ["1m", "2m", "3m", "4m", "5m", "6m"]) {
      expect(yAxis.filter((label) => label.text === text)).toHaveLength(1);
    }
    // The rings themselves are all still drawn, out to the 6 m cone range.
    expect(card._coneRingsCache.rings).toHaveLength(6);
    expect(card.coneYMax).toBe(6000);
  });

  it("leaves out a ring label that sits close beside the same text", async () => {
    // Turned 12 degrees, the 1 m and 2 m ring labels sit a few px right of the
    // Y axis labels "1m" and "2m". The ones farther out read as their own.
    const { labels, rings } = await drawnCard(12);

    expect(rings.map((label) => label.text)).toEqual(["3m", "4m", "5m", "6m"]);
    const repeats = pairs(labels).filter(
      ([a, b]) => a.text === b.text && spaceBetween(a, b) < 2 * a.size
    );
    expect(repeats).toEqual([]);
  });

  it("keeps a ring label that no grid label repeats close by", async () => {
    const { rings } = await drawnCard(45);

    // Only the 1 m label goes: it sits right below the X axis label "1m".
    expect(rings.map((label) => label.text)).toEqual(["2m", "3m", "4m", "5m", "6m"]);
  });

  it("leaves out a ring label that a centimeter Y axis label repeats", async () => {
    // "200cm" on the Y axis names the same distance as the "2m" ring label.
    const { grid, rings } = await drawnLabels(
      { grid_units: "cm", grid: { x_min: -500, x_max: 500, y_min: 0, y_max: 1000 } },
      0
    );

    expect(rings).toEqual([]);
    const yAxis = grid.filter((label) => label.align === "right").map((label) => label.text);
    for (const text of ["100cm", "200cm", "300cm", "400cm", "500cm", "600cm"]) {
      expect(yAxis.filter((label) => label === text)).toHaveLength(1);
    }
  });

  it.each([-90, -80])(
    "leaves out a ring label that a negative X axis label repeats at %i degrees",
    async (rotation) => {
      // Turned toward the radar's left, the ring labels sit along the X axis
      // labels "-1m", "-2m" and so on, which name the same distances.
      const { grid, rings } = await drawnLabels({}, rotation);

      for (const ring of rings) {
        expect(repeatsOf(ring, grid, parseFloat(ring.text) * 1000, 1000)).toEqual([]);
      }
      const top = grid.filter((label) => label.baseline === "top").map((label) => label.text);
      expect(top).toEqual(["-4", "-3", "-2", "-1", "1", "2", "3", "4"].map((v) => `${v}m`));
      // At -80 degrees the 3 m and 4 m labels sit 13 px below "-3m" and "-4m".
      expect(rings.map((label) => label.text)).not.toContain("3m");
    }
  );

  it("keeps a crowded ring label that no grid label repeats", async () => {
    // The Y axis labels 2m, 4m and 6m. The 1 m, 3 m and 5 m ring labels sit
    // 2 px from them, and nothing else names those distances.
    const { grid, rings } = await drawnLabels({ ...WIDE_GRID, unit_label_size: 18 }, 0);

    expect(rings.map((label) => label.text)).toEqual(["1m", "3m", "5m"]);
    const yAxis = grid.filter((label) => label.align === "right").map((label) => label.text);
    expect(yAxis.slice(0, 3)).toEqual(["2m", "4m", "6m"]);
    const overlapping = pairs([...grid, ...rings]).filter(([a, b]) => spaceBetween(a, b) === 0);
    expect(overlapping).toEqual([]);
  });

  it("leaves out a ring label that would overlap the grid label naming another ring", async () => {
    // At 24 px the ring labels are taller than the 20 px between rings, so
    // "1m" would cover "2m", which names the 2 m ring.
    const { grid, rings } = await drawnLabels({ ...WIDE_GRID, unit_label_size: 24 }, 0);

    expect(rings).toEqual([]);
    const yAxis = grid.filter((label) => label.align === "right").map((label) => label.text);
    expect(yAxis.slice(0, 3)).toEqual(["2m", "4m", "6m"]);
  });

  it("drops a grid label that a ring label nothing repeats would crowd", async () => {
    // Turned to -84 degrees on a 3 m grid, the "1m" ring label sits beside
    // the X axis label "-0.8m". That label goes; its grid line and "-1.2m"
    // and "-0.4m" on either side still give its value.
    const { grid, rings } = await drawnLabels(
      { grid: { x_min: -1500, x_max: 1500, y_min: 0, y_max: 3000 }, unit_label_size: 24 },
      -84
    );

    expect(rings.map((label) => label.text)).toContain("1m");
    const top = grid.filter((label) => label.baseline === "top").map((label) => label.text);
    expect(top).toEqual(["-1.2m", "-0.4m", "0.4m", "0.8m", "1.2m"]);
    const crowded = pairs([...grid, ...rings].filter(onCanvas))
      .filter(([a, b]) => spaceBetween(a, b) < 4)
      .map(([a, b]) => `${a.text} / ${b.text}`);
    expect(crowded).toEqual([]);
  });

  it("keeps a grid label beside a ring label the canvas edge cuts", async () => {
    // The 20 ft ring label hangs a few px off the bottom edge, and the grid's
    // own "20 ft" label is cut, so the ring label is the only one that names
    // 20 ft. It is drawn, but it does not push out "19 ft", the full label
    // beside it. This canvas cannot measure text, so the card estimates.
    // The range label would sit just inside the arc here and take "19 ft"'s
    // place itself, which is not what this test is about, so it is left out.
    const { grid, rings } = await drawnLabels(
      {
        grid_units: "ft",
        grid: { x_min: -10, x_max: 10, y_min: 0, y_max: 20 },
        cone: { y_max: 20 },
        unit_label_size: 24,
      },
      -6,
      250,
      () => 0,
      false
    );

    const edge = rings.find((label) => label.text === "20 ft");
    expect(edge).toBeDefined();
    expect(onCanvas(edge!)).toBe(false);
    expect(grid.map((label) => label.text)).toContain("19 ft");
  });

  it("leaves out the axis and ring labels a zone's name would cover", async () => {
    // A couch across the radar's line: its name sits on x = 0, where the y
    // labels run down the map, and it covered the one at its depth.
    const couch = {
      shape: "rect",
      data: { x_min: -1500, x_max: 1500, y_min: 2000, y_max: 4000 },
      name: "Couch",
    };
    const draw = async (zones: Record<string, any>) => {
      const hass = fakeHass({ ...ZONE_PAYLOAD, zones, rotation_deg: 0 });
      const card = await mountCard(hass, { ...TEN_METER_GRID, unit_display: true });
      layOut(card, 800);
      const { ctx, texts } = textRecordingContext(browserTextWidth);
      card.ctx = ctx;
      card._invalidateGridCache();
      card.drawGrid();
      return texts;
    };

    // The y labels run down the radar's line, right-aligned against it.
    const yLabels = (texts: DrawnText[]) =>
      texts.filter((label) => label.size < 24 && label.align === "right").map((l) => l.text);

    // Without the zone the y labels at 2.5, 3 and 3.5 m are there.
    expect(yLabels(await draw({}))).toEqual(expect.arrayContaining(["2.5m", "3m", "3.5m"]));

    const texts = await draw({ "1": couch });
    const name = texts.find((label) => label.text === "Couch")!;
    expect([name.x, name.y]).toEqual([400, 240]);
    // Every label drawn under 24 px (the axis, ring and range labels) keeps
    // the label gap from the name; the 3 m y label, under it, is left out,
    // and the rest of the axis stays.
    const others = texts.filter((label) => label.size < 24);
    expect(others.filter((label) => spaceBetween(label, name) < 4)).toEqual([]);
    const shown = yLabels(texts);
    expect(shown).not.toContain("3m");
    expect(shown).toEqual(expect.arrayContaining(["2.5m", "3.5m", "1m", "5m"]));
  });

  it("leaves out the axis labels under the buttons over the map, not under the offline note", async () => {
    // A zoomed map moves an axis's labels to its edge, under the zoom row
    // and the unit switch, which are see-through: '16 ft' read as '16 ft2x'.
    // Here the zoom row lies across the y labels at 3 m.
    const hass = fakeHass({ ...ZONE_PAYLOAD, rotation_deg: 0 });
    const card = await mountCard(hass, { ...TEN_METER_GRID, unit_display: true });
    layOut(card, 800);
    const over = (id: string, box: { left: number; top: number; right: number; bottom: number }) =>
      vi.spyOn(card.shadowRoot.getElementById(id), "getBoundingClientRect").mockReturnValue({
        ...box,
        x: box.left,
        y: box.top,
        width: box.right - box.left,
        height: box.bottom - box.top,
        toJSON: () => ({}),
      } as DOMRect);
    const yLabels = () => {
      const { ctx, texts } = textRecordingContext(browserTextWidth);
      card.ctx = ctx;
      card._invalidateGridCache();
      card.drawGrid();
      return texts.filter((label) => label.size < 24 && label.align === "right").map((l) => l.text);
    };
    const row = { left: 340, top: 230, right: 800, bottom: 250 };

    expect(yLabels()).toEqual(expect.arrayContaining(["2.5m", "3m", "3.5m"]));

    const zoomRow = over("zoomControls", row);
    const shown = yLabels();
    expect(shown).not.toContain("3m");
    expect(shown).toEqual(expect.arrayContaining(["2.5m", "3.5m", "1m", "5m"]));
    zoomRow.mockRestore();

    // The offline note sits under the x labels, placed from them, so the
    // labels never make room for it.
    const note = card.shadowRoot.getElementById("offlineNote");
    note.hidden = false;
    over("offlineNote", row);
    expect(yLabels()).toEqual(expect.arrayContaining(["2.5m", "3m", "3.5m"]));
  });

  it("keeps more room between labels on a narrower card", async () => {
    const card = await mountCard(fakeHass(), { ...TEN_METER_GRID, unit_display: true });
    // Every label measures 30 px, 10 px less than the 40 px between lines.
    const { ctx } = textRecordingContext(() => 30);
    card.ctx = ctx;
    card._invalidateGridCache();
    // A frame reads the layout once, at its start, and lays the labels out
    // by it.
    const xTexts = () => {
      card.drawGrid();
      return card._getGridRenderState().labels.x.map((label: any) => label.text);
    };
    const halfMeters = ["-4.5", "-4", "-3.5", "-3", "-2.5", "-2", "-1.5", "-1", "-0.5"];
    const meters = ["-4", "-3", "-2", "-1"];

    // At 800 CSS px a backing px is a CSS px, and 10 px is room enough.
    layOut(card, 800);
    expect(xTexts()).toEqual(
      [...halfMeters, ...halfMeters.map((v) => v.slice(1)).reverse()].map((v) => `${v}m`)
    );

    // At 250 CSS px the 4 CSS px gap takes 12.8 backing px, so the labels thin
    // out. The grid lines do not.
    layOut(card, 250);
    expect(xTexts()).toEqual(
      [...meters, ...meters.map((v) => v.slice(1)).reverse()].map((v) => `${v}m`)
    );
    expect(card._getGridRenderState().xLines).toHaveLength(21);
  });
});

describe("zone map card zone loading", () => {
  it("reads zones from the store, not from entity attributes", async () => {
    const hass = fakeHass();
    // A stale zone entity carrying different geometry. The card must not look.
    hass.states["sensor.apollo_mmwave_dev123_zone_1"] = {
      entity_id: "sensor.apollo_mmwave_dev123_zone_1",
      state: "off",
      attributes: { shape: "rect", data: { x_min: -9, x_max: -8, y_min: -9, y_max: -8 } },
    };

    const card = await mountCard(hass);

    expect(hass.callWS).toHaveBeenCalledWith({ type: ZONES_GET, device_id: "dev123" });
    expect(card.zones).toEqual([
      { id: 1, shape: "rect", data: { x_min: 0, x_max: 1000, y_min: 0, y_max: 1000 } },
    ]);
    expect(card.zoneConfig).toEqual([{ id: 1, name: "Doorway" }]);
    expect(card.coneAngleDeg).toBe(12);
  });

  it("lists a placeholder zone by name without drawing it", async () => {
    // The legacy migration stores a pre-1.2 zone whose restore data was lost
    // as `{}`, so the entity is recreated and the zone can be redrawn. Typed,
    // so tsc holds ZoneDef to the placeholder the backend really serves.
    const payload: ZoneConfig = { ...ZONE_PAYLOAD, zones: { ...ZONE_PAYLOAD.zones, "3": {} } };
    const hass = fakeHass(payload);

    const card = await mountCard(hass);

    expect(card._loadError).toBeNull();
    expect(card.zones).toEqual([
      { id: 1, shape: "rect", data: { x_min: 0, x_max: 1000, y_min: 0, y_max: 1000 } },
    ]);
    expect(card.zoneConfig).toEqual([
      { id: 1, name: "Doorway" },
      { id: 3, name: "Zone 3" },
    ]);
  });

  it("applies a pushed payload without a page reload", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);

    hass.handlers[ZONES_SUBSCRIBE][0]({
      ...ZONE_PAYLOAD,
      zones: {},
      rotation_deg: -30,
    });

    expect(card.zones).toEqual([]);
    expect(card.coneAngleDeg).toBe(-30);
  });

  it("watches for the config entry reloading so it does not sit on stale data", async () => {
    const hass = fakeHass();
    await mountCard(hass);
    const zoneSubscribes = () =>
      hass.connection.subscribeMessage.mock.calls.filter(
        (call: any[]) => call[1].type === ZONES_SUBSCRIBE
      ).length;

    hass.handlers[CONFIG_ENTRIES_SUBSCRIBE][0]([
      { type: "updated", entry: { domain: "apollo_mmwave", state: "loaded" } },
    ]);

    await vi.waitFor(() => expect(zoneSubscribes()).toBe(2));
  });

  it("shows an error for an unknown device instead of an empty map", async () => {
    const hass = fakeHass(ZONE_PAYLOAD, {
      code: "not_found",
      message: "No Home Assistant device with id dev123",
    });

    const card = await mountCard(hass);

    expect(card._loadError).toBeTruthy();
    // Names the id the card asked about, so the fix is obvious.
    expect(card.shadowRoot.textContent).toContain("dev123");
    // An empty canvas reads as "this radar has no zones yet", which is exactly
    // the ambiguity this rework removes.
    expect(card.shadowRoot!.querySelector("canvas")).toBeNull();
  });

  it("brings the map back, with the payload laid over it, once a load error clears", async () => {
    // The integration was still loading when the card opened, so the store
    // could not answer. The config entry feed reopens the card once it loads.
    const hass = fakeHass(ZONE_PAYLOAD, { code: "not_loaded", message: "not loaded" });
    const card = await mountCard(hass);
    expect(card._loadError).toMatch(/not loaded/);
    expect(card.canvas).toBeNull();
    await vi.waitFor(() => expect(hass.handlers[CONFIG_ENTRIES_SUBSCRIBE]).toHaveLength(1));

    hass.error = undefined;
    hass.handlers[CONFIG_ENTRIES_SUBSCRIBE][0]([
      { type: "updated", entry: { domain: "apollo_mmwave", state: "loaded" } },
    ]);
    await vi.waitFor(() => expect(card._loadError).toBeNull());

    const root = card.shadowRoot;
    expect(root.getElementById("loadError")).toBeNull();
    expect(card.canvas).toBeTruthy();
    expect(card.canvas).toBe(root.querySelector("canvas"));
    // The re-render threw the error screen away; the payload is applied to
    // the rebuilt map, not left behind on the DOM that was replaced.
    expect(card.zones).toEqual([
      { id: 1, shape: "rect", data: { x_min: 0, x_max: 1000, y_min: 0, y_max: 1000 } },
    ]);
    expect(root.querySelector('#zone-buttons .zone-btn[data-zone-id="1"]').textContent).toBe(
      "Doorway"
    );
    expect(card.selectedZone).toBe(1);
    expect(root.getElementById("deviceTitle").textContent).toBe("Office radar");
    expect(root.getElementById("coneAngleSlider").value).toBe("12");
    expect(root.getElementById("entityStatus").textContent).toBe(
      "Using this radar's own detected targets (1)."
    );
  });

  it("retargets its reads when the card is pointed at another radar", async () => {
    // Home Assistant reuses a live element and calls setConfig again whenever
    // the config changes. A card that retargets its writes but keeps reading
    // the old radar will save one radar's geometry into the other's store.
    const hass = fakeHass();
    const card = await mountCard(hass);
    expect(card.zones).toHaveLength(1);

    hass.payload = { ...ZONE_PAYLOAD, zones: {}, label: "Bedroom" };
    card.setConfig({ type: "custom:apollo-radar-zone-map-card", device_id: "devB" });

    // Nothing from the old radar may survive the retarget, not even for the
    // round trip it takes the new one to answer.
    expect(card.zones).toEqual([]);
    expect(card._zoneConfigPayload).toBeNull();
    await vi.waitFor(() =>
      expect(hass.callWS).toHaveBeenCalledWith({ type: ZONES_GET, device_id: "devB" })
    );
    await vi.waitFor(() => expect(hass.closed).toContain(ZONES_SUBSCRIBE));
    expect(card.zones).toEqual([]);
    expect(
      hass.connection.subscribeMessage.mock.calls.filter(
        (call: any[]) => call[1].type === ZONES_SUBSCRIBE
      ).at(-1)[1].device_id
    ).toBe("devB");
  });

  it("drops undo, rotation and lock state when pointed at another radar", async () => {
    // The undo snapshot holds the OLD radar's geometry and _performUndo writes
    // it with whatever deviceId the card holds when the button is clicked, so a
    // snapshot that survives a retarget is the cross-device overwrite again,
    // reached through Undo instead of a drag.
    const hass = fakeHass();
    const card = await mountCard(hass);
    card._setUndoSnapshot([
      { zoneId: 1, shape: "rect", data: { x_min: 0, x_max: 1, y_min: 0, y_max: 1 } },
    ]);
    card.isLocked = true;
    expect(card.shadowRoot.getElementById("btnUndo").disabled).toBe(false);
    expect(card.coneAngleDeg).toBe(12);

    card.setConfig({ type: "custom:apollo-radar-zone-map-card", device_id: "devB" });

    expect(card._undoSnapshot).toBeNull();
    expect(card.shadowRoot.getElementById("btnUndo").disabled).toBe(true);
    // Not the previous radar's angle or lock for the round trip it takes the
    // new one to answer.
    expect(card.coneAngleDeg).toBe(0);
    expect(card.isLocked).toBe(false);
    expect(card._autoLockApplied).toBeFalsy();

    hass.callService.mockClear();
    card.shadowRoot.getElementById("btnUndo").click();
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("keeps its subscription when the config changes but the radar does not", async () => {
    // The manual card editor calls setConfig on every keystroke.
    const hass = fakeHass();
    const card = await mountCard(hass);

    card.setConfig({
      type: "custom:apollo-radar-zone-map-card",
      device_id: "dev123",
      title: "Kitc",
    });
    await Promise.resolve();

    expect(
      hass.connection.subscribeMessage.mock.calls.filter(
        (call: any[]) => call[1].type === ZONES_SUBSCRIBE
      )
    ).toHaveLength(1);
    expect(card.zones).toHaveLength(1);
  });

  it("closes its subscription when it leaves the page", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);

    card.disconnectedCallback();

    await vi.waitFor(() => expect(hass.closed).toContain(ZONES_SUBSCRIBE));
  });
});

describe("zone map card target pairs", () => {
  it("uses the radar's detected targets when none were ever configured", async () => {
    const card = await mountCard(fakeHass({ ...ZONE_PAYLOAD, entities: null }));

    expect(card.trackedEntities).toEqual([{ x: "sensor.a_x", y: "sensor.a_y" }]);
    expect(card.shadowRoot.getElementById("entityStatus").textContent).toMatch(
      /detected targets/i
    );
  });

  it("tracks nothing when the user deliberately cleared the list", async () => {
    // [] is not the same as null. Falling back to the suggestions here would
    // re-enable auto-detection for the one user who switched it off.
    const card = await mountCard(fakeHass({ ...ZONE_PAYLOAD, entities: [] }));

    expect(card.trackedEntities).toEqual([]);
    expect(card.shadowRoot.getElementById("entityStatus").textContent).toMatch(
      /no targets/i
    );
  });

  it("uses the saved pairs when the user chose them", async () => {
    const chosen = [{ x: "sensor.chosen_x", y: "sensor.chosen_y" }];
    const card = await mountCard(fakeHass({ ...ZONE_PAYLOAD, entities: chosen }));

    expect(card.trackedEntities).toEqual(chosen);
    expect(card.shadowRoot.getElementById("entityStatus").textContent).toMatch(
      /tracking 1 target pair\./i
    );
  });

  it("takes every payload, having nothing half-typed to protect", async () => {
    // The pair rows are gone, so there is no unsaved edit to hold a payload
    // off any more, and the hold that used to do it is gone with them.
    const hass = fakeHass({ ...ZONE_PAYLOAD, entities: [] });
    const card = await mountCard(hass);
    expect(card._entitiesDirty).toBeUndefined();

    hass.handlers[ZONES_SUBSCRIBE][0]({
      ...ZONE_PAYLOAD,
      entities: [{ x: "sensor.pushed_x", y: "sensor.pushed_y" }],
    });

    expect(card.trackedEntities).toEqual([{ x: "sensor.pushed_x", y: "sensor.pushed_y" }]);
  });

  it("does not claim the tracked list was cleared before the store has answered", async () => {
    // Before the first payload the card holds no pairs and is not using the
    // suggestions, which is also what a deliberately cleared list looks like.
    // An Apollo radar is tracking its own targets during that window.
    const hass = fakeHass();
    hass.callWS = vi.fn(async (msg: any) => {
      if (msg.type === ZONES_GET) return new Promise(() => {});
      return [];
    });
    const card: any = new ZoneMapCard();
    card.setConfig({ device_id: "dev123" } as any);
    card.hass = hass;
    await vi.waitFor(() =>
      expect(hass.callWS).toHaveBeenCalledWith({ type: ZONES_GET, device_id: "dev123" })
    );

    expect(card._zoneConfigPayload).toBeNull();
    const status = card.shadowRoot.getElementById("entityStatus").textContent;
    expect(status).toBe("Waiting for this radar's configuration.");
    expect(status).not.toMatch(/told to do/);
  });

  it("says it is waiting again while a retargeted radar's read is pending", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);
    expect(card.shadowRoot.getElementById("entityStatus").textContent).toMatch(
      /detected targets/i
    );

    hass.callWS = vi.fn(async (msg: any) => {
      if (msg.type === ZONES_GET) return new Promise(() => {});
      return [];
    });
    card.setConfig({ device_id: "dev999" } as any);
    await vi.waitFor(() =>
      expect(hass.callWS).toHaveBeenCalledWith({ type: ZONES_GET, device_id: "dev999" })
    );

    expect(card._zoneConfigPayload).toBeNull();
    const status = card.shadowRoot.getElementById("entityStatus").textContent;
    expect(status).toBe("Waiting for this radar's configuration.");
    expect(status).not.toMatch(/told to do/);
  });

  it("offers no pair-editing UI, only the read-only status line", async () => {
    // The pair pickers were a hand-rolled combobox whose list closed on a
    // 200ms blur timer, so a click held longer than that silently did nothing.
    // Pairs are resolved by the integration and overridden by the service.
    const card = await mountCard(fakeHass());

    expect(card.shadowRoot.getElementById("btnAddPair")).toBeNull();
    expect(card.shadowRoot.getElementById("btnApplyEntities")).toBeNull();
    expect(card.shadowRoot.getElementById("entityPairs")).toBeNull();
    expect(card.shadowRoot.getElementById("deviceComboWrapper")).toBeNull();
    expect(card.shadowRoot!.querySelector(".combo-list")).toBeNull();
    expect(card.shadowRoot.getElementById("entityStatus")).toBeTruthy();
  });

  it("never asks Home Assistant for the registries the pickers needed", async () => {
    // Two registry list calls per card on first hass, for dropdowns that are
    // no longer there.
    const hass = fakeHass();
    await mountCard(hass);

    const types = hass.callWS.mock.calls.map((call: any[]) => call[0].type);
    expect(types).not.toContain("config/device_registry/list");
    expect(types).not.toContain("config/entity_registry/list");
  });

  // The presence sensor (targets.py `build_point_rotator` and
  // `reading_unit_factor`) applies the same rotation and unit conversion
  // before its zone test, and test_binary_sensor.py pins the same results
  // there. A slip on either side draws a target inside a zone whose presence
  // sensor reads off.
  /** Mount on the suggested pair, set its reading, and return what is drawn.
   *  `xUnit` and `yUnit` become each sensor's unit_of_measurement; left out,
   *  the sensor has no attributes at all. */
  async function drawnTargets(
    payload: any,
    reading: { x: string; y: string; xUnit?: unknown; yUnit?: unknown },
    config: Record<string, any> = {}
  ) {
    const hass = fakeHass(payload);
    const card = await mountCard(hass, config);
    hass.states["sensor.a_x"] = targetState(reading.x, reading.xUnit);
    hass.states["sensor.a_y"] = targetState(reading.y, reading.yUnit);
    card.drawCurrentPosition = vi.fn();

    card._drawTrackedTargets();

    return card.drawCurrentPosition.mock.calls.map((call: any[]) => [call[0], call[1]]);
  }

  it("rotates a drawn target by the radar's rotation", async () => {
    const drawn = await drawnTargets(
      { ...ZONE_PAYLOAD, rotation_deg: 90 },
      { x: "1000", y: "0" }
    );

    expect(drawn).toHaveLength(1);
    expect(drawn[0][0]).toBeCloseTo(0);
    expect(drawn[0][1]).toBeCloseTo(-1000);
  });

  it("rotates by degrees, not radians, at an angle that is not a right angle", async () => {
    const drawn = await drawnTargets(
      { ...ZONE_PAYLOAD, rotation_deg: 45 },
      { x: "1000", y: "0" }
    );

    expect(drawn).toHaveLength(1);
    expect(drawn[0][0]).toBeCloseTo(1000 * Math.SQRT1_2);
    expect(drawn[0][1]).toBeCloseTo(-1000 * Math.SQRT1_2);
  });

  it("scales a drawn target by the card's input units", async () => {
    const drawn = await drawnTargets(
      { ...ZONE_PAYLOAD, rotation_deg: 0 },
      { x: "100", y: "25" },
      { input_units: "cm" }
    );

    expect(drawn).toHaveLength(1);
    expect(drawn[0][0]).toBeCloseTo(1000);
    expect(drawn[0][1]).toBeCloseTo(250);
  });

  it("draws nothing for the (0, 0) no-target reading", async () => {
    const drawn = await drawnTargets(
      { ...ZONE_PAYLOAD, rotation_deg: 90 },
      { x: "0", y: "0" },
      { input_units: "cm" }
    );

    expect(drawn).toEqual([]);
  });

  it("draws a reading in inches at its millimeter position", async () => {
    // Home Assistant set to US customary units shows ESPHome's millimeters in
    // inches. These are a report's live readings of a target at (194, 691) mm,
    // which the card used to draw at (7.6, 27.2) mm, on top of the sensor.
    const drawn = await drawnTargets(
      { ...ZONE_PAYLOAD, rotation_deg: 0 },
      { x: "7.63779527559055", y: "27.2047244094488", xUnit: "in", yUnit: "in" }
    );

    expect(drawn).toHaveLength(1);
    expect(drawn[0][0]).toBeCloseTo(194);
    expect(drawn[0][1]).toBeCloseTo(691);
  });

  it.each([
    ["mm", "1500", 1500],
    ["cm", "150", 1500],
    ["m", "1.5", 1500],
    ["km", "0.0015", 1500],
    ["in", "60", 1524],
    ["ft", "5", 1524],
    ["yd", "2", 1828.8],
    ["mi", "0.001", 1609.344],
    ["nmi", "0.001", 1852],
  ])("converts a reading in %s by its sensor's unit", async (unit, reading, mm) => {
    const drawn = await drawnTargets(
      { ...ZONE_PAYLOAD, rotation_deg: 0 },
      { x: "0", y: reading, xUnit: unit, yUnit: unit }
    );

    expect(drawn).toHaveLength(1);
    expect(drawn[0][1]).toBeCloseTo(mm);
  });

  it("prefers the sensor's own unit to the card's input units", async () => {
    // input_units is only the fallback for a sensor with no length unit.
    const drawn = await drawnTargets(
      { ...ZONE_PAYLOAD, rotation_deg: 0 },
      { x: "10", y: "60", xUnit: "in", yUnit: "in" },
      { input_units: "cm" }
    );

    expect(drawn).toHaveLength(1);
    expect(drawn[0][0]).toBeCloseTo(254);
    expect(drawn[0][1]).toBeCloseTo(1524);
  });

  it("converts X and Y each by its own unit", async () => {
    // Two separate entities, so a user can change one and not the other.
    const drawn = await drawnTargets(
      { ...ZONE_PAYLOAD, rotation_deg: 0 },
      { x: "0.5", y: "60", xUnit: "m", yUnit: "in" }
    );

    expect(drawn).toHaveLength(1);
    expect(drawn[0][0]).toBeCloseTo(500);
    expect(drawn[0][1]).toBeCloseTo(1524);
  });

  it("converts each axis before rotating", async () => {
    // (254, 1000) mm rotated by 90 degrees lands at (1000, -254). Rotating
    // the raw numbers first would mix inches into the meter axis.
    const drawn = await drawnTargets(
      { ...ZONE_PAYLOAD, rotation_deg: 90 },
      { x: "10", y: "1", xUnit: "in", yUnit: "m" }
    );

    expect(drawn).toHaveLength(1);
    expect(drawn[0][0]).toBeCloseTo(1000);
    expect(drawn[0][1]).toBeCloseTo(-254);
  });

  it("scales a sensor without a length unit by the card's input units", async () => {
    // A DIY template sensor may carry no unit; the other axis still uses its own.
    const drawn = await drawnTargets(
      { ...ZONE_PAYLOAD, rotation_deg: 0 },
      { x: "10", y: "25", xUnit: "in" },
      { input_units: "cm" }
    );

    expect(drawn).toHaveLength(1);
    expect(drawn[0][0]).toBeCloseTo(254);
    expect(drawn[0][1]).toBeCloseTo(250);
  });

  it.each([
    ["no unit", null],
    ["an empty unit", ""],
    ["a unit that is not a length", "%"],
    ["a spelled-out unit", "inches"],
    ["a unit in the wrong case", "IN"],
    ["an inherited object key", "constructor"],
    ["a unit that is not a string", ["in"]],
  ])("falls back to the card's input units for %s", async (_label, unit) => {
    const drawn = await drawnTargets(
      { ...ZONE_PAYLOAD, rotation_deg: 0 },
      { x: "100", y: "25", xUnit: unit, yUnit: unit },
      { input_units: "cm" }
    );

    expect(drawn).toHaveLength(1);
    expect(drawn[0][0]).toBeCloseTo(1000);
    expect(drawn[0][1]).toBeCloseTo(250);
  });

  it("still skips the (0, 0) no-target reading when it carries a unit", async () => {
    const drawn = await drawnTargets(
      { ...ZONE_PAYLOAD, rotation_deg: 0 },
      { x: "0", y: "0", xUnit: "in", yUnit: "cm" }
    );

    expect(drawn).toEqual([]);
  });
});

/**
 * Numbered target dots.
 *
 * With two or three people in view the map showed same-sized circles that
 * said nothing about which target each was. Each dot now carries its pair's
 * number (Target N on an Apollo radar, whose pairs are in target order), in
 * black or white, whichever reads better on its color, and a soft halo so it
 * stands out on a lit zone. A target inside an ignore zone, which presence
 * drops, is a hollow grey ring instead.
 */
describe("zone map card target dots", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const PAIRS = [1, 2, 3, 4, 5].map((n) => ({ x: `sensor.t${n}_x`, y: `sensor.t${n}_y` }));

  /** Tracking the first `readings.length` pairs at those (x, y) mm, facing
   *  ahead on the 10 m grid, with `zones`. */
  async function dotsCard(
    readings: [number, number][],
    zones: any = {},
    config: Record<string, any> = {}
  ) {
    const hass = fakeHass({
      ...ZONE_PAYLOAD,
      zones,
      rotation_deg: 0,
      entities: PAIRS.slice(0, readings.length),
    });
    const card = await mountCard(hass, { ...TEN_METER_GRID, ...config });
    hass.states = Object.fromEntries(
      readings.flatMap(([x, y], i) => [
        [PAIRS[i].x, { state: String(x) }],
        [PAIRS[i].y, { state: String(y) }],
      ])
    );
    return { card, hass };
  }

  it("numbers each target dot with its pair index + 1", async () => {
    // Pair 2 reads (0, 0), an LD2450's empty slot, so it has no dot, and
    // pair 3 keeps its own number.
    const { card } = await dotsCard([
      [-2000, 2000],
      [0, 0],
      [2000, 6000],
    ]);
    const { ctx, texts } = textRecordingContext(browserTextWidth);
    card.ctx = ctx;

    card.drawGrid();

    expect(texts.map((t) => [t.text, t.x, t.y, t.align, t.baseline])).toEqual([
      ["1", 240, 160, "center", "middle"],
      ["3", 560, 480, "center", "middle"],
    ]);
    // 11 px at scale 1, bold, and never the axis labels' size, which the
    // label layout tests pick drawn labels out by.
    expect(texts.map((t) => t.font)).toEqual(["bold 11px sans-serif", "bold 11px sans-serif"]);
    expect(card.unitLabelSize).toBe(18);
    expect(texts.filter((t) => t.size === card.unitLabelSize)).toEqual([]);
  });

  it("writes white on the purple dot and black on the others", async () => {
    const { card } = await dotsCard([
      [-4000, 1000],
      [-2000, 2000],
      [0, 3000],
      [2000, 4000],
      [4000, 5000],
    ]);
    const { ctx, draws } = drawRecordingContext();
    card.ctx = ctx;

    card._drawTrackedTargets();

    const numbers = draws.filter((draw) => draw.name === "fillText");
    expect(numbers.map((draw) => [draw.args[0], draw.fill])).toEqual([
      ["1", "#000000"],
      ["2", "#000000"],
      ["3", "#000000"],
      ["4", "#000000"],
      ["5", "#ffffff"],
    ]);
    // On red, blue, green, amber and purple dots.
    const cores = draws.filter((draw) => draw.name === "fill" && draw.alpha === 1);
    expect(cores.map((draw) => draw.fill)).toEqual([
      "#f44336",
      "#2196f3",
      "#4caf50",
      "#ffc107",
      "#9c27b0",
    ]);
  });

  it("keeps the dot radius 10 on an unscaled canvas", async () => {
    const { card } = await dotsCard([[0, 4000]]);
    /** The radii drawn at the target's spot, with the canvas `cssWidth` wide. */
    function radii(cssWidth: number | null) {
      if (cssWidth !== null) layOut(card, cssWidth);
      const { ctx, draws } = drawRecordingContext();
      card.ctx = ctx;
      card.drawGrid();
      const at = draws.filter(
        (draw) => draw.name === "arc" && draw.args[0] === 400 && draw.args[1] === 320
      );
      const label = draws.find((draw) => draw.name === "fillText");
      return [...at.map((draw) => draw.args[2]), label?.font];
    }

    // No layout box (a hidden tab) and a canvas shown at its own 800 px.
    expect(radii(null)).toEqual([17, 10, "bold 11px sans-serif"]);
    expect(radii(800)).toEqual([17, 10, "bold 11px sans-serif"]);
    // Shown at 400 CSS px, each backing px is half as big, so the dot grows
    // to stay about 9 CSS px.
    expect(radii(400)).toEqual([18 * 1.7, 18, "bold 20px sans-serif"]);
    // Shown wider than its backing store, it never drops below 10.
    expect(radii(1600)).toEqual([17, 10, "bold 11px sans-serif"]);
  });

  it("draws targets inside an ignore zone hollow and grey", async () => {
    const fan = {
      "1": {
        shape: "rect",
        data: { x_min: -3000, x_max: -1000, y_min: 1000, y_max: 3000 },
        zone_type: "ignore",
      },
    };
    const readings: [number, number][] = [
      [-2000, 2000],
      [2000, 2000],
    ];
    const { card } = await dotsCard(readings, fan);
    const { ctx, draws } = drawRecordingContext();
    card.ctx = ctx;

    card._drawTrackedTargets();

    const split = draws.findIndex((draw) => draw.name === "restore") + 1;
    const inside = draws.slice(0, split);
    const outside = draws.slice(split);
    // Target 1 is in the ignore zone: a grey ring with a grey number, no
    // halo and no fill.
    expect(inside.filter((d) => d.name === "arc").map((d) => d.args[2])).toEqual([10]);
    expect(inside.filter((d) => d.name === "fill")).toEqual([]);
    expect(inside.filter((d) => d.name === "stroke").map((d) => [d.stroke, d.lineWidth])).toEqual([
      ["#757575", 3],
    ]);
    expect(inside.filter((d) => d.name === "fillText").map((d) => [d.args[0], d.fill])).toEqual([
      ["1", "#757575"],
    ]);
    // Outlined first in the canvas color, 4 px wide at scale 1, so the
    // target's own grey trail inside the ring does not run through it.
    const outline = inside.filter((d) => d.name === "strokeText");
    expect(outline.map((d) => [d.args, d.stroke, d.lineWidth])).toEqual([
      [["1", 240, 160], "#ffffff", 4],
    ]);
    expect(inside.indexOf(outline[0])).toBeLessThan(inside.findIndex((d) => d.name === "fillText"));
    // Target 2 is not: its halo, its blue core with a white rim, a black number.
    expect(outside.filter((d) => d.name === "arc").map((d) => d.args[2])).toEqual([17, 10]);
    expect(outside.filter((d) => d.name === "fill").map((d) => [d.fill, d.alpha])).toEqual([
      ["#2196f3", 0.25],
      ["#2196f3", 1],
    ]);
    expect(outside.filter((d) => d.name === "stroke").map((d) => d.stroke)).toEqual(["#ffffff"]);
    expect(outside.filter((d) => d.name === "fillText").map((d) => d.fill)).toEqual(["#000000"]);
    // A filled dot's number needs no outline.
    expect(outside.filter((d) => d.name === "strokeText")).toEqual([]);

    // The grey and the outline follow a dark card.
    const dark = await dotsCard(readings, fan, { dark_mode: true });
    const darkDraws = drawRecordingContext();
    dark.card.ctx = darkDraws.ctx;
    dark.card._drawTrackedTargets();
    expect(darkDraws.draws.find((d) => d.name === "stroke")?.stroke).toBe("#8a8f98");
    expect(darkDraws.draws.filter((d) => d.name === "strokeText").map((d) => d.stroke)).toEqual([
      "#121316",
    ]);
  });
});

describe("zone map card writes", () => {
  it("saves a shape by device id and never carries the pair list along", async () => {
    // Sending the card's in-memory pair list on every zone edit is what erased
    // two customers' configuration.
    const hass = fakeHass();
    const card = await mountCard(hass);
    hass.callService.mockClear();

    card.updateHomeAssistantShape(1, "rect", { x_min: 0, x_max: 1, y_min: 0, y_max: 1 });

    expect(hass.callService).toHaveBeenCalledWith(
      "apollo_mmwave",
      "update_zone",
      {
        device_id: "dev123",
        zone_id: 1,
        shape: "rect",
        data: { x_min: 0, x_max: 1, y_min: 0, y_max: 1 },
        input_units: "mm",
      },
      undefined,
      false
    );
  });

  it("tells the backend which unit it draws in, so presence sensors scale the same way", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass, { input_units: "cm" });
    hass.callService.mockClear();

    card.updateHomeAssistantShape(1, "rect", { x_min: 0, x_max: 1, y_min: 0, y_max: 1 });

    expect(hass.callService.mock.calls[0][2].input_units).toBe("cm");
  });

  it("says a zone was saved only once the store took it", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);
    const toasts = notifications(card);

    await card.updateHomeAssistantShape(1, "rect", { x_min: 0, x_max: 1 }, "Zone 1 saved");
    expect(toasts).toEqual(["Zone 1 saved"]);

    hass.callService.mockRejectedValue(new Error("no such device"));
    await card.updateHomeAssistantShape(1, "rect", { x_min: 0, x_max: 1 }, "Zone 1 saved");
    expect(toasts).toHaveLength(2);
    expect(toasts[1]).toMatch(/could not save/i);
  });

  it("asks Home Assistant not to toast a failed save itself, so it shows once", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);
    const toasts = notifications(card);
    // HA's hass.callService raises its own error toast unless the fifth
    // argument (notifyOnError, default true) is false, then rethrows.
    hass.callService.mockImplementation(
      async (domain: string, service: string, _data: any, _target: any, notifyOnError = true) => {
        if (notifyOnError) toasts.push(`Failed to perform the action ${domain}/${service}.`);
        throw new Error("no such device");
      }
    );

    const saved = await card.updateHomeAssistantShape(
      1,
      "rect",
      { x_min: 0, x_max: 1 },
      "Zone 1 saved"
    );

    expect(saved).toBe(false);
    expect(hass.callService).toHaveBeenCalledWith(
      "apollo_mmwave",
      "update_zone",
      {
        device_id: "dev123",
        zone_id: 1,
        shape: "rect",
        data: { x_min: 0, x_max: 1 },
        input_units: "mm",
      },
      undefined,
      false
    );
    expect(toasts).toEqual(["Could not save: no such device"]);
  });

  it("persists rotation by device id", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);
    hass.callService.mockClear();
    card.coneAngleDeg = 45;

    card._persistRotation();

    expect(hass.callService).toHaveBeenCalledWith(
      "apollo_mmwave",
      "update_zone",
      { device_id: "dev123", rotation_deg: 45, input_units: "mm" },
      undefined,
      false
    );
  });

  it("adds a zone by device id", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);
    hass.callService.mockClear();

    card._handleAddZone();

    const payload = hass.callService.mock.calls[0][2];
    expect(payload.device_id).toBe("dev123");
    expect(payload).not.toHaveProperty("location");
  });

  it("adds the lowest free zone id with no shape and a default name", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);
    hass.callService.mockClear();

    card.shadowRoot.getElementById("btnAddZone").click();

    expect(hass.callService.mock.calls.map((call: any[]) => call[2])).toEqual([
      {
        device_id: "dev123",
        zone_id: 2,
        shape: "none",
        data: null,
        name: "Zone 2",
        input_units: "mm",
      },
    ]);
    expect(card.selectedZone).toBe(2);
    expect(card.zoneConfig).toEqual([
      { id: 1, name: "Doorway" },
      { id: 2, name: "Zone 2" },
    ]);
  });

  it("fills the first gap in the zone ids, counting zones only the YAML names", async () => {
    const hass = fakeHass({
      ...ZONE_PAYLOAD,
      zones: { ...ZONE_PAYLOAD.zones, "3": { shape: "none", data: null, name: "Couch" } },
    });
    const card = await mountCard(hass, { zones: [{ id: 4, name: "Desk" }] });
    hass.callService.mockClear();

    card._handleAddZone();
    card._handleAddZone();

    expect(
      hass.callService.mock.calls.map((call: any[]) => [call[2].zone_id, call[2].name])
    ).toEqual([
      [2, "Zone 2"],
      [5, "Zone 5"],
    ]);
    expect(card.selectedZone).toBe(5);
  });
});

/** A fakeHass whose viewer is an administrator: only one can edit zones. */
function adminHass(payload: any = ZONE_PAYLOAD) {
  const hass = fakeHass(payload);
  hass.user = { is_admin: true };
  return hass;
}

/** The update_zone payloads a hass was sent, in order. */
function zoneWrites(hass: any): any[] {
  return hass.callService.mock.calls
    .filter((call: any[]) => call[1] === "update_zone")
    .map((call: any[]) => call[2]);
}

/** Let resolved callService promises run on to what follows them. */
async function settleWrites() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Zone `zoneId`'s chip in the Zones panel. */
function chipOf(card: any, zoneId: number): any {
  return card.shadowRoot.querySelector(`#zone-buttons .zone-btn[data-zone-id="${zoneId}"]`);
}

/** The selected zone's editor under the chips, or null. */
function editorOf(card: any): any {
  return card.shadowRoot.querySelector("#zoneManager .zone-editor");
}

/** Press zone `zoneId`'s chip, and return the editor it opens. */
function openZone(card: any, zoneId: number): any {
  chipOf(card, zoneId).click();
  const editor = editorOf(card);
  expect(editor?.dataset.editorZone).toBe(String(zoneId));
  return editor;
}

/** The editor's name field. */
function nameFieldOf(card: any): any {
  return card.shadowRoot.getElementById("zoneName");
}

/** A keydown on `target`, as typed there. */
function pressKey(target: EventTarget, key: string) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true }));
}

describe("zone map card renaming a zone only the YAML names", () => {
  // The backend renames only zones the store holds. A name-only save for a
  // zone seeded from the card YAML was dropped, the card still said it was
  // saved, and the next payload put the YAML name back.
  const YAML_ZONES = { zones: [{ id: 7, name: "Desk" }] };

  /** Select a zone, type a name into its editor and press Enter. */
  function rename(card: any, zoneId: number, name: string) {
    openZone(card, zoneId);
    const input = nameFieldOf(card);
    input.value = name;
    pressKey(input, "Enter");
  }

  it("creates the zone with its name when the store has never seen it", async () => {
    const hass = adminHass();
    const card = await mountCard(hass, YAML_ZONES);
    hass.callService.mockClear();

    rename(card, 7, "Desk 2");

    expect(zoneWrites(hass)).toEqual([
      {
        device_id: "dev123",
        zone_id: 7,
        shape: "none",
        data: null,
        name: "Desk 2",
        input_units: "mm",
      },
    ]);
  });

  it("renames a stored zone without touching its shape", async () => {
    const hass = adminHass();
    const card = await mountCard(hass, YAML_ZONES);
    hass.callService.mockClear();

    rename(card, 1, "Front door");

    const saves = zoneWrites(hass);
    expect(saves).toEqual([
      { device_id: "dev123", zone_id: 1, name: "Front door", input_units: "mm" },
    ]);
    expect(saves[0]).not.toHaveProperty("shape");
    expect(saves[0]).not.toHaveProperty("data");
  });

  it("only renames before the first payload, when the store's zones are unknown", async () => {
    const hass = adminHass();
    // The read never answers, so the card has no payload to check against.
    hass.callWS = vi.fn(() => new Promise(() => {}));
    const card: any = new ZoneMapCard();
    card.setConfig({ device_id: "dev123", ...YAML_ZONES } as any);
    card.hass = hass;
    expect(card._zoneConfigPayload).toBeNull();

    rename(card, 7, "Desk 2");

    const saves = zoneWrites(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual({ device_id: "dev123", zone_id: 7, name: "Desk 2", input_units: "mm" });
  });

  it("leaves the card YAML's own zone entries as they were", async () => {
    // Before the first payload the zone list holds the YAML's objects, and a
    // dashboard's config can be frozen.
    const hass = adminHass();
    hass.callWS = vi.fn(() => new Promise(() => {}));
    const seeded = Object.freeze({ id: 7, name: "Desk" });
    const card: any = new ZoneMapCard();
    card.setConfig({ device_id: "dev123", zones: [seeded] } as any);
    card.hass = hass;

    rename(card, 7, "Desk 2");

    expect(seeded.name).toBe("Desk");
    expect(card._zoneLabel(7)).toBe("Desk 2");
    expect(zoneWrites(hass).map((save) => save.name)).toEqual(["Desk 2"]);
  });

  it("only renames a zone drawn here whose shape has not reached the store yet", async () => {
    const hass = adminHass();
    const card = await mountCard(hass, YAML_ZONES);
    // What a finished drag does before its save is echoed back.
    card._upsertZone(7, "rect", { x_min: 0, x_max: 10, y_min: 0, y_max: 10 });
    hass.callService.mockClear();

    rename(card, 7, "Desk 2");

    const saves = zoneWrites(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0]).not.toHaveProperty("shape");
    expect(saves[0].name).toBe("Desk 2");
  });
});

/**
 * A zone's name saves from its field on its own: on Enter, or when the field
 * loses focus to the page, as a press on another zone's chip. There is no
 * Save button. The save says so beside the editor's heading, Saving... then
 * Saved, or Not saved with the reason in a toast, and the chip and the map
 * take the name at once.
 */
describe("zone map card renaming a zone in its editor", () => {
  const TWO_ZONES = {
    ...ZONE_PAYLOAD,
    zones: { ...ZONE_PAYLOAD.zones, "2": { shape: "none", data: null, name: "Couch" } },
  };

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  async function renameCard(payload: any = TWO_ZONES) {
    const hass = adminHass(payload);
    const card = await mountCard(hass);
    document.body.appendChild(card);
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  const status = (card: any) => card.shadowRoot.getElementById("zoneSaveStatus");

  it("saves on Enter, with no toast, and says Saving... then Saved", async () => {
    const { card, hass, toasts } = await renameCard();
    const input = nameFieldOf(card);
    expect(input.value).toBe("Doorway");
    input.focus();
    input.value = "Front door";

    pressKey(input, "Enter");

    expect(zoneWrites(hass)).toEqual([
      { device_id: "dev123", zone_id: 1, name: "Front door", input_units: "mm" },
    ]);
    // The chip and the map's label take it at once, the chip in place.
    expect(chipOf(card, 1).textContent).toBe("Front door");
    expect(card._zoneLabel(1)).toBe("Front door");
    expect(status(card).textContent).toBe("Saving...");
    expect(status(card).getAttribute("role")).toBe("status");

    await settleWrites();

    expect(status(card).textContent).toBe("Saved");
    expect(toasts).toEqual([]);
    // Still in the field, so a second Enter has nothing new to save.
    expect(card.shadowRoot.activeElement).toBe(input);
    pressKey(input, "Enter");
    expect(zoneWrites(hass)).toHaveLength(1);
  });

  it("saves when the field loses focus to the page", async () => {
    const { card, hass } = await renameCard();
    const input = nameFieldOf(card);
    input.focus();
    input.value = "Kitchen";

    input.blur();

    expect(zoneWrites(hass)).toEqual([
      { device_id: "dev123", zone_id: 1, name: "Kitchen", input_units: "mm" },
    ]);
  });

  it("saves nothing when another window or tab takes the focus", async () => {
    const { card, hass } = await renameCard();
    const input = nameFieldOf(card);
    input.focus();
    input.value = "Kitch";
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    input.blur();

    expect(hass.callService).not.toHaveBeenCalled();
    expect(input.value).toBe("Kitch");
  });

  it("saves the old zone's name when a press on another chip takes the focus", async () => {
    const { card, hass } = await renameCard();
    const input = nameFieldOf(card);
    input.focus();
    input.value = "Kitchen";
    const couch = chipOf(card, 2);

    // A press: the field loses focus on the way down, the click lands on
    // the way up.
    couch.focus();
    couch.click();

    expect(zoneWrites(hass)).toEqual([
      { device_id: "dev123", zone_id: 1, name: "Kitchen", input_units: "mm" },
    ]);
    expect(card.selectedZone).toBe(2);
    expect(nameFieldOf(card).value).toBe("Couch");
    expect(chipOf(card, 1).textContent).toBe("Kitchen");
  });

  it("keeps the pressed chip through the echo of the name save", async () => {
    // A chip made again between the press and the release never gets the
    // click, so the selection would be lost.
    const { card, hass } = await renameCard();
    const couch = chipOf(card, 2);
    const doorway = chipOf(card, 1);

    hass.handlers[ZONES_SUBSCRIBE][0]({
      ...TWO_ZONES,
      zones: { ...TWO_ZONES.zones, "1": { ...TWO_ZONES.zones["1"], name: "Kitchen" } },
    });

    expect(chipOf(card, 2)).toBe(couch);
    expect(chipOf(card, 1)).toBe(doorway);
    expect(doorway.textContent).toBe("Kitchen");
    couch.click();
    expect(card.selectedZone).toBe(2);
  });

  it("saves nothing for a name the zone already has, and trims spaces", async () => {
    const { card, hass } = await renameCard();
    const input = nameFieldOf(card);
    input.focus();
    input.value = "  Doorway ";

    pressKey(input, "Enter");
    input.blur();

    expect(hass.callService).not.toHaveBeenCalled();
    expect(input.value).toBe("Doorway");
  });

  it("saves Zone N for an emptied field", async () => {
    const { card, hass } = await renameCard();
    const input = nameFieldOf(card);
    input.focus();
    input.value = "   ";

    pressKey(input, "Enter");

    expect(zoneWrites(hass)).toEqual([
      { device_id: "dev123", zone_id: 1, name: "Zone 1", input_units: "mm" },
    ]);
    expect(input.value).toBe("Zone 1");
  });

  it("puts the name back on Escape and saves nothing", async () => {
    const { card, hass } = await renameCard();
    const input = nameFieldOf(card);
    input.focus();
    input.value = "Kit";

    pressKey(input, "Escape");
    input.blur();

    expect(input.value).toBe("Doorway");
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("says Not saved when refused, puts the old name back and keeps the typed one", async () => {
    const { card, hass, toasts } = await renameCard();
    hass.callService.mockRejectedValue(new Error("Home Assistant is restarting"));
    const input = nameFieldOf(card);
    input.focus();
    input.value = "Kitchen";

    pressKey(input, "Enter");
    await settleWrites();

    expect(status(card).textContent).toBe("Not saved");
    expect(status(card).classList.contains("failed")).toBe(true);
    expect(toasts).toEqual(["Could not save: Home Assistant is restarting"]);
    expect(chipOf(card, 1).textContent).toBe("Doorway");
    expect(card._zoneLabel(1)).toBe("Doorway");
    // The typed name stays, for Enter to try again.
    expect(input.value).toBe("Kitchen");
    hass.callService.mockReset();
    pressKey(input, "Enter");
    expect(zoneWrites(hass).map((save) => save.name)).toEqual(["Kitchen"]);
    await settleWrites();
    expect(status(card).textContent).toBe("Saved");
  });

  it("a newer save settles the status, not an older one", async () => {
    const { card, hass } = await renameCard();
    const answers: Array<() => void> = [];
    hass.callService.mockImplementation(() => new Promise<void>((resolve) => answers.push(resolve)));
    const input = nameFieldOf(card);
    input.focus();
    input.value = "Kit";
    pressKey(input, "Enter");
    input.value = "Kitchen";
    pressKey(input, "Enter");

    answers[0]();
    await settleWrites();
    expect(status(card).textContent).toBe("Saving...");
    answers[1]();
    await settleWrites();
    expect(status(card).textContent).toBe("Saved");
  });

  it("clears the status for another zone", async () => {
    const { card } = await renameCard();
    const input = nameFieldOf(card);
    input.value = "Kitchen";
    pressKey(input, "Enter");
    await settleWrites();
    expect(status(card).textContent).toBe("Saved");

    openZone(card, 2);

    expect(status(card).textContent).toBe("");
  });

  it("gives a viewer the name read only", async () => {
    const hass = fakeHass(TWO_ZONES);
    const card = await mountCard(hass);
    hass.callService.mockClear();
    const input = nameFieldOf(card);

    expect(input.disabled).toBe(true);
    input.value = "Kitchen";
    pressKey(input, "Enter");

    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("closes a phone keyboard on Enter", async () => {
    const { card } = await renameCard();
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) => ({ matches: query === "(pointer: coarse)" }) as MediaQueryList
    );
    const input = nameFieldOf(card);
    input.focus();
    input.value = "Kitchen";

    pressKey(input, "Enter");

    expect(card.shadowRoot.activeElement).not.toBe(input);
  });

  it("labels the field Name, at a size iOS does not zoom in on", async () => {
    const { card } = await renameCard();
    const input = nameFieldOf(card);
    expect(card.shadowRoot.querySelector('label[for="zoneName"]').textContent).toBe("Name");
    expect(input.getAttribute("enterkeyhint")).toBe("done");
    expect(input.autocomplete).toBe("off");
    const css = card.shadowRoot.querySelector("style").textContent;
    expect(css).toContain(".zone-panel input, .zone-panel select { font-size: 16px; }");
  });
});

describe("zone map card zone names across payloads", () => {
  // Every payload reaches the editor, and the card's own Add zone and
  // rotation writes echo back as payloads. A rebuild used to put the stored
  // name back over whatever was being typed and drop the focus; the editor
  // is now kept and only its values are brought up to date.
  const TWO_ZONES = {
    ...ZONE_PAYLOAD,
    zones: {
      ...ZONE_PAYLOAD.zones,
      "2": { shape: "none", data: null, name: "Couch" },
    },
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  async function attachedCard(payload: any = TWO_ZONES) {
    const hass = adminHass(payload);
    const card = await mountCard(hass);
    document.body.appendChild(card);
    return { card, hass };
  }

  function push(hass: any, payload: any) {
    hass.handlers[ZONES_SUBSCRIBE][0](payload);
  }

  it("keeps a name being typed, and its focus and caret, when a payload lands", async () => {
    const { card, hass } = await attachedCard();
    const input = nameFieldOf(card);
    input.focus();
    input.value = "Kit";
    input.setSelectionRange(1, 2);
    expect(card.shadowRoot.activeElement).toBe(input);

    push(hass, { ...TWO_ZONES, rotation_deg: 20 });

    expect(card.coneAngleDeg).toBe(20);
    // The same field, as it was.
    expect(nameFieldOf(card)).toBe(input);
    expect(input.value).toBe("Kit");
    expect(card.shadowRoot.activeElement).toBe(input);
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(2);
  });

  it("keeps an edit over a rename from elsewhere, and Escape gives the new name", async () => {
    const { card, hass } = await attachedCard();
    const input = nameFieldOf(card);
    input.value = "Kit";

    push(hass, {
      ...TWO_ZONES,
      zones: { ...TWO_ZONES.zones, "1": { ...TWO_ZONES.zones["1"], name: "Hall" } },
    });

    expect(input.value).toBe("Kit");
    expect(chipOf(card, 1).textContent).toBe("Hall");
    pressKey(input, "Escape");
    expect(input.value).toBe("Hall");
  });

  it("gives a field nobody edited the name the payload carries", async () => {
    const { card, hass } = await attachedCard();
    openZone(card, 2);

    push(hass, {
      ...TWO_ZONES,
      zones: { ...TWO_ZONES.zones, "2": { shape: "none", data: null, name: "Sofa" } },
    });

    expect(nameFieldOf(card).value).toBe("Sofa");
  });

  it("gives a focused field nobody edited a rename and keeps its focus", async () => {
    const { card, hass } = await attachedCard();
    openZone(card, 2);
    nameFieldOf(card).focus();

    push(hass, {
      ...TWO_ZONES,
      zones: { ...TWO_ZONES.zones, "2": { shape: "none", data: null, name: "Sofa" } },
    });

    const after = nameFieldOf(card);
    expect(after.value).toBe("Sofa");
    expect(card.shadowRoot.activeElement).toBe(after);
  });

  it("saves the kept edit after the push", async () => {
    const { card, hass } = await attachedCard();
    const input = nameFieldOf(card);
    input.focus();
    input.value = "Kit";
    push(hass, { ...TWO_ZONES, rotation_deg: 20 });
    hass.callService.mockClear();

    pressKey(nameFieldOf(card), "Enter");

    expect(zoneWrites(hass)).toEqual([
      { device_id: "dev123", zone_id: 1, name: "Kit", input_units: "mm" },
    ]);
    expect(card.zoneConfig.find((z: any) => z.id === 1).name).toBe("Kit");
  });

  it("keeps a name typed into a new zone across its own Add zone echo", async () => {
    const { card, hass } = await attachedCard(ZONE_PAYLOAD);
    card._handleAddZone();
    const input = nameFieldOf(card);
    expect(input.dataset.zoneId).toBe("2");
    expect(input.value).toBe("Zone 2");
    input.focus();
    input.value = "Sofa";

    push(hass, {
      ...ZONE_PAYLOAD,
      zones: { ...ZONE_PAYLOAD.zones, "2": { shape: "none", data: null, name: "Zone 2" } },
    });

    expect(nameFieldOf(card).value).toBe("Sofa");
    expect(card.shadowRoot.activeElement).toBe(nameFieldOf(card));
  });

  it("drops the edit of a zone the payload removed, and saves nothing for it", async () => {
    const { card, hass } = await attachedCard();
    openZone(card, 2);
    const input = nameFieldOf(card);
    input.focus();
    input.value = "Sofa";
    hass.callService.mockClear();

    push(hass, ZONE_PAYLOAD);

    expect(card.selectedZone).toBe(1);
    expect(nameFieldOf(card).value).toBe("Doorway");
    // The field went with its editor, and its focus with it: nothing that
    // left made a zone 2 again.
    expect(hass.callService).not.toHaveBeenCalled();
  });

  // A zone written into the card YAML has no store entry until it is drawn,
  // and a geometry write carries no name, so the store then holds the zone
  // with its shape and no name. That used to swap the YAML name for "Zone 1"
  // on the payload right after the "saved" toast.
  const SEEDED = { zones: [{ id: 1, name: "Kitchen" }] };
  const RECT = { x_min: 0, x_max: 1000, y_min: 0, y_max: 1000 };

  async function seededCard() {
    const hass = adminHass({ ...ZONE_PAYLOAD, zones: {} });
    const card = await mountCard(hass, SEEDED);
    document.body.appendChild(card);
    return { card, hass };
  }

  it("keeps a seeded name for a store zone with geometry but no name", async () => {
    const { card, hass } = await seededCard();
    expect(card._zoneLabel(1)).toBe("Kitchen");

    push(hass, { ...ZONE_PAYLOAD, zones: { "1": { shape: "rect", data: RECT } } });

    expect(card.zones).toEqual([{ id: 1, shape: "rect", data: RECT }]);
    expect(card.zoneConfig).toEqual([{ id: 1, name: "Kitchen" }]);
    expect(card._zoneLabel(1)).toBe("Kitchen");
    expect(nameFieldOf(card).value).toBe("Kitchen");
    expect(chipOf(card, 1).textContent).toBe("Kitchen");
  });

  it("a stored name wins over the seed", async () => {
    const { card, hass } = await seededCard();

    push(hass, {
      ...ZONE_PAYLOAD,
      zones: { "1": { shape: "rect", data: RECT, name: "Hall" } },
    });

    expect(card.zoneConfig).toEqual([{ id: 1, name: "Hall" }]);
    expect(card._zoneLabel(1)).toBe("Hall");
    expect(nameFieldOf(card).value).toBe("Hall");
  });

  it("still falls back to Zone N for a nameless store zone the YAML does not name", async () => {
    const { card, hass } = await seededCard();

    push(hass, { ...ZONE_PAYLOAD, zones: { "2": { shape: "rect", data: RECT } } });

    expect(card.zoneConfig).toEqual([
      { id: 1, name: "Kitchen" },
      { id: 2, name: "Zone 2" },
    ]);
  });
});

/**
 * The selected zone's editor under the chips: its size, its Type and its
 * Hold, with what they do said in the text under them.
 *
 * The size follows the map's unit and every shape change without making the
 * editor again. Type (Detect or Ignore) and Hold save on change through
 * update_zone, without input_units, and an ignore zone never holds. A save
 * says so beside the editor's heading instead of in a toast. Only an
 * administrator can save them, and a viewer is told so in plain text as
 * well as in the titles.
 */
describe("zone map card zone editor settings", () => {
  afterEach(() => {
    // happy-dom hands out a proxy for a <select>, which its removal check
    // does not match, so a select that had focus stays the document's
    // active element after it is removed, and the next card's
    // shadowRoot.activeElement throws. Focusing and blurring an element of
    // the page's own clears it.
    const reset = document.body.appendChild(document.createElement("input"));
    reset.focus();
    reset.blur();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  const COUCH = { shape: "ellipse", data: { cx: 0, cy: 3000, rx: 1200, ry: 450 }, name: "Couch" };
  const NOOK = {
    shape: "polygon",
    data: {
      points: [
        { x: -2000, y: 1000 },
        { x: -500, y: 1400 },
        { x: -1200, y: 3100 },
      ],
    },
  };
  const DESK = { shape: "none", data: null, name: "Desk" };
  const FOUR_ZONES = {
    ...ZONE_PAYLOAD,
    zones: { ...ZONE_PAYLOAD.zones, "2": COUCH, "3": NOOK, "4": DESK },
  };

  async function listCard(
    payload: any = ZONE_PAYLOAD,
    { isAdmin = true, config = {} as Record<string, any> } = {}
  ) {
    const hass = fakeHass(payload);
    hass.user = { is_admin: isAdmin };
    const card = await mountCard(hass, config);
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  /** Zone `zoneId`'s editor, selecting it first. */
  function editor(card: any, zoneId: number): any {
    if (card.selectedZone !== zoneId) openZone(card, zoneId);
    return editorOf(card);
  }

  const sizeText = (card: any, zoneId: number) =>
    editor(card, zoneId).querySelector(".zone-size").textContent;
  const typeSelect = (card: any, zoneId: number) =>
    editor(card, zoneId).querySelector("select.zone-type");
  const holdSelect = (card: any, zoneId: number) =>
    editor(card, zoneId).querySelector("select.zone-hold");
  const hintText = (card: any, zoneId: number) =>
    editor(card, zoneId).querySelector("#zoneSettingsHint").textContent;
  const status = (card: any) => card.shadowRoot.getElementById("zoneSaveStatus").textContent;

  function options(select: any): string[][] {
    return Array.from(select.options).map((o: any) => [o.value, o.textContent]);
  }

  function choose(select: any, value: string) {
    select.value = value;
    select.dispatchEvent(new Event("change"));
  }

  function push(hass: any, payload: any) {
    hass.handlers[ZONES_SUBSCRIBE][0](payload);
  }

  it("shows each zone's size, and Not drawn yet without geometry", async () => {
    const { card } = await listCard(FOUR_ZONES, { config: { zones: [{ id: 7, name: "Hall" }] } });

    const listed = [1, 2, 3, 4, 7].map((id) => [
      editor(card, id).querySelector(".zone-editor-title").textContent,
      sizeText(card, id),
    ]);
    expect(listed).toEqual([
      ["Zone 1", "Size 1.0 m × 1.0 m"],
      // An ellipse is 2 rx by 2 ry; a polygon is the box around its points.
      ["Zone 2", "Size 2.4 m × 0.9 m"],
      ["Zone 3", "Size 1.5 m × 2.1 m"],
      ["Zone 4", "Not drawn yet"],
      // Only the card YAML names this one.
      ["Zone 7", "Not drawn yet"],
    ]);
    // One editor at a time, for the selected zone.
    expect(card.shadowRoot.querySelectorAll("#zoneManager .zone-editor")).toHaveLength(1);
  });

  it("updates the size on a unit switch without making the editor again", async () => {
    const { card } = await listCard(FOUR_ZONES);
    document.body.appendChild(card);
    const before = editor(card, 2);
    const name = nameFieldOf(card);
    name.focus();
    name.value = "Kit";

    card.shadowRoot.getElementById("btnUnitFt").click();

    expect(editorOf(card)).toBe(before);
    expect(sizeText(card, 2)).toBe("Size 7 ft 10 in × 2 ft 11 in");
    // What was being typed and the focus are left alone.
    expect(nameFieldOf(card).value).toBe("Kit");
    expect(card.shadowRoot.activeElement).toBe(name);
    expect(sizeText(card, 1)).toBe("Size 3 ft 3 in × 3 ft 3 in");
  });

  it("updates a polygon zone's size after Finish", async () => {
    const { card } = await listCard(ZONE_PAYLOAD, {
      config: { ...TEN_METER_GRID, start_locked: false },
    });
    expect(card.selectedZone).toBe(1);
    card._setDrawMode("polygon");
    layOut(card, 800);
    const click = (x: number, y: number) => {
      card._lastPolyTap = 0;
      card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: y }));
      card.canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: y }));
    };
    click(100, 100);
    click(300, 100);
    click(300, 300);
    // Corners do not change the saved zone until Finish.
    expect(sizeText(card, 1)).toBe("Size 1.0 m × 1.0 m");

    card.shadowRoot.getElementById("btnPolyFinish").click();

    // At once, ahead of the save's echo: (-3750, 1250) to (-1250, 3750) mm.
    expect(sizeText(card, 1)).toBe("Size 2.5 m × 2.5 m");
  });

  it("keeps the size current through a drag, Clear all shapes and Undo", async () => {
    const two = { ...ZONE_PAYLOAD, zones: { ...ZONE_PAYLOAD.zones, "2": COUCH } };
    const { card } = await listCard(two, { config: { ...TEN_METER_GRID, start_locked: false } });
    layOut(card, 800);
    const mouse = (type: string, x: number, y: number) =>
      card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));

    // A rect drag on Doorway: (-3750, 1250) to (-1250, 3125) mm.
    mouse("mousedown", 100, 100);
    mouse("mousemove", 300, 250);
    mouse("mouseup", 300, 250);
    expect(sizeText(card, 1)).toBe("Size 2.5 m × 1.9 m");

    card.shadowRoot.getElementById("btnUndo").click();
    expect(sizeText(card, 1)).toBe("Size 1.0 m × 1.0 m");

    card.shadowRoot.getElementById("clearBtn").click();
    card.shadowRoot.getElementById("btnClearAllYes").click();
    expect([sizeText(card, 1), sizeText(card, 2)]).toEqual(["Not drawn yet", "Not drawn yet"]);
    card.shadowRoot.getElementById("btnUndo").click();
    expect([sizeText(card, 1), sizeText(card, 2)]).toEqual([
      "Size 1.0 m × 1.0 m",
      "Size 2.4 m × 0.9 m",
    ]);
  });

  it("offers Detect and Ignore and saves a change, saying so beside the heading", async () => {
    const { card, hass, toasts } = await listCard();
    const type = typeSelect(card, 1);
    expect(options(type)).toEqual([
      ["detect", "Detect"],
      ["ignore", "Ignore"],
    ]);
    expect(type.value).toBe("detect");
    expect(type.disabled).toBe(false);
    // Labeled for assistive tech by the "Type" label beside it.
    const label = card.shadowRoot.querySelector(`label[for="${type.id}"]`);
    expect(label.textContent).toBe("Type");

    choose(type, "ignore");
    // An ignore zone never holds, and the hint says what Ignore does, at once.
    expect(holdSelect(card, 1).disabled).toBe(true);
    expect(hintText(card, 1)).toBe(
      "Ignore: targets inside, such as a fan or a curtain, are dropped before the other zones are checked. Ignore zones never hold."
    );
    expect(chipOf(card, 1).querySelector(".zone-dot").classList.contains("ignore")).toBe(true);
    expect(status(card)).toBe("Saving...");
    await settleWrites();

    // A zone setting says nothing about how readings scale: no input_units.
    expect(hass.callService.mock.calls).toEqual([
      [
        "apollo_mmwave",
        "update_zone",
        { device_id: "dev123", zone_id: 1, zone_type: "ignore" },
        undefined,
        false,
      ],
    ]);
    expect(status(card)).toBe("Saved");
    expect(toasts).toEqual([]);

    // The save's echo keeps the editor as an ignore zone's.
    push(hass, {
      ...ZONE_PAYLOAD,
      zones: { "1": { ...ZONE_PAYLOAD.zones["1"], zone_type: "ignore" } },
    });
    expect(typeSelect(card, 1).value).toBe("ignore");
    expect(holdSelect(card, 1).disabled).toBe(true);

    hass.callService.mockClear();
    choose(typeSelect(card, 1), "detect");
    expect(zoneWrites(hass)).toEqual([{ device_id: "dev123", zone_id: 1, zone_type: "detect" }]);
  });

  it("offers the hold options and saves a change", async () => {
    const { card, hass, toasts } = await listCard();
    const hold = holdSelect(card, 1);
    expect(options(hold)).toEqual([
      ["0", "Off"],
      ["15", "15 s"],
      ["30", "30 s"],
      ["60", "1 min"],
      ["120", "2 min"],
      ["300", "5 min"],
      ["600", "10 min"],
      ["1800", "30 min"],
    ]);
    expect(hold.value).toBe("0");
    expect(hold.disabled).toBe(false);
    expect(card.shadowRoot.querySelector(`label[for="${hold.id}"]`).textContent).toBe("Hold");

    choose(hold, "120");
    await settleWrites();

    // A number of seconds, not the option's string.
    expect(zoneWrites(hass)).toEqual([{ device_id: "dev123", zone_id: 1, hold_s: 120 }]);
    expect(toasts).toEqual([]);
    expect(status(card)).toBe("Saved");
  });

  it("says what Detect and Hold do under them", async () => {
    const { card } = await listCard();

    expect(hintText(card, 1)).toBe(
      "Detect: its presence sensor turns on while someone is inside. Hold keeps it on for a while after someone inside goes still and the radar loses them."
    );
  });

  it("shows a custom hold value it does not list", async () => {
    // Saved through the service, outside the list's choices.
    const { card } = await listCard({
      ...ZONE_PAYLOAD,
      zones: {
        "1": { ...ZONE_PAYLOAD.zones["1"], hold_s: 45 },
        "2": { ...COUCH, hold_s: 3600 },
        "3": { ...NOOK, hold_s: 60 },
      },
    });

    // In its place by length, selected.
    const hold = holdSelect(card, 1);
    expect(hold.value).toBe("45");
    expect(options(hold).map(([, label]) => label)).toEqual([
      "Off",
      "15 s",
      "30 s",
      "45 s",
      "1 min",
      "2 min",
      "5 min",
      "10 min",
      "30 min",
    ]);
    expect(holdSelect(card, 2).value).toBe("3600");
    expect(options(holdSelect(card, 2)).slice(-2)).toEqual([
      ["1800", "30 min"],
      ["3600", "1 h"],
    ]);
    // A listed value adds nothing.
    expect(holdSelect(card, 3).value).toBe("60");
    expect(options(holdSelect(card, 3))).toHaveLength(8);
  });

  it("disables hold for ignore zones", async () => {
    const { card } = await listCard({
      ...ZONE_PAYLOAD,
      zones: { ...ZONE_PAYLOAD.zones, "2": { ...COUCH, zone_type: "ignore", hold_s: 60 } },
    });

    expect(typeSelect(card, 2).value).toBe("ignore");
    expect(typeSelect(card, 2).disabled).toBe(false);
    expect(holdSelect(card, 2).disabled).toBe(true);
    expect(hintText(card, 2)).toContain("Ignore zones never hold.");
    // A detect zone's Hold stays free.
    expect(holdSelect(card, 1).disabled).toBe(false);
  });

  it("reverts a select when the save is refused", async () => {
    const { card, hass, toasts } = await listCard({
      ...ZONE_PAYLOAD,
      zones: { "1": { ...ZONE_PAYLOAD.zones["1"], hold_s: 30 } },
    });
    hass.callService.mockRejectedValue(new Error("Home Assistant is restarting"));

    choose(holdSelect(card, 1), "300");
    choose(typeSelect(card, 1), "ignore");
    expect(holdSelect(card, 1).value).toBe("300");
    await settleWrites();

    // Back to what the store holds.
    expect(holdSelect(card, 1).value).toBe("30");
    expect(typeSelect(card, 1).value).toBe("detect");
    expect(status(card)).toBe("Not saved");
    expect(toasts).toEqual([
      "Could not save: Home Assistant is restarting",
      "Could not save: Home Assistant is restarting",
    ]);
  });

  /** Saves that wait to be answered: answers[i] settles the i-th save. */
  function heldSaves(hass: any) {
    const answers: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    hass.callService.mockImplementation(
      () => new Promise<void>((resolve, reject) => answers.push({ resolve, reject }))
    );
    return answers;
  }

  const withHold = (holdS: number) => ({
    ...ZONE_PAYLOAD,
    zones: { "1": { ...ZONE_PAYLOAD.zones["1"], hold_s: holdS } },
  });

  it("keeps a select's newest choice through the echo of an earlier save", async () => {
    // Each arrow key on a focused select saves. The echo of the first save
    // put the select back to the store's value while the second was on its
    // way, and the next key stepped from there: the saves went out as 15,
    // 30, 30.
    const { card, hass, toasts } = await listCard();
    document.body.appendChild(card);
    const answers = heldSaves(hass);
    holdSelect(card, 1).focus();
    choose(holdSelect(card, 1), "15");
    choose(holdSelect(card, 1), "30");

    // The store took 15 and says so while 30 is on its way.
    push(hass, withHold(15));

    expect(holdSelect(card, 1).value).toBe("30");
    expect(card.shadowRoot.activeElement).toBe(holdSelect(card, 1));
    // So the next key steps on from 30.
    const hold = holdSelect(card, 1);
    choose(hold, hold.options[hold.selectedIndex + 1].value);
    expect(zoneWrites(hass).map((save) => save.hold_s)).toEqual([15, 30, 60]);

    answers[0].resolve();
    await settleWrites();
    expect(holdSelect(card, 1).value).toBe("60");
    answers[1].resolve();
    push(hass, withHold(30));
    await settleWrites();
    expect(holdSelect(card, 1).value).toBe("60");
    expect(status(card)).toBe("Saving...");
    answers[2].resolve();
    push(hass, withHold(60));
    await settleWrites();
    // Settled, the select shows the store again.
    expect(card._zoneSettingPending.size).toBe(0);
    expect(holdSelect(card, 1).value).toBe("60");
    push(hass, withHold(120));
    expect(holdSelect(card, 1).value).toBe("120");
    expect(status(card)).toBe("Saved");
    expect(toasts).toEqual([]);
  });

  it("a refused older save leaves a newer choice alone", async () => {
    const { card, hass, toasts } = await listCard();
    const answers = heldSaves(hass);
    choose(holdSelect(card, 1), "15");
    choose(holdSelect(card, 1), "30");

    // The older save is refused while the newer one is on its way.
    answers[0].reject(new Error("Home Assistant is restarting"));
    await settleWrites();

    expect(holdSelect(card, 1).value).toBe("30");
    expect(status(card)).toBe("Saving...");
    expect(toasts).toEqual(["Could not save: Home Assistant is restarting"]);
    answers[1].resolve();
    push(hass, withHold(30));
    await settleWrites();
    expect(holdSelect(card, 1).value).toBe("30");

    // Refused, the newest goes back to what the store holds.
    choose(holdSelect(card, 1), "60");
    answers[2].reject(new Error("Home Assistant is restarting"));
    await settleWrites();
    expect(holdSelect(card, 1).value).toBe("30");
  });

  it("gives Hold back when a refused Ignore had disabled it", async () => {
    const { card, hass } = await listCard(withHold(30));
    const answers = heldSaves(hass);
    choose(typeSelect(card, 1), "ignore");

    // A payload lands while the save is on its way: the editor shows
    // Ignore, and an ignore zone never holds.
    push(hass, { ...withHold(30), rotation_deg: 20 });
    expect(typeSelect(card, 1).value).toBe("ignore");
    expect(holdSelect(card, 1).disabled).toBe(true);

    answers[0].reject(new Error("Home Assistant is restarting"));
    await settleWrites();

    expect(typeSelect(card, 1).value).toBe("detect");
    expect(holdSelect(card, 1).disabled).toBe(false);
    expect(holdSelect(card, 1).value).toBe("30");
    expect(chipOf(card, 1).querySelector(".zone-dot").classList.contains("ignore")).toBe(false);
  });

  it("creates a YAML-only zone when its type is saved", async () => {
    // The backend applies a setting only to a zone the store holds, so a
    // zone only the card YAML names is created with it, as a rename does.
    const { card, hass } = await listCard(ZONE_PAYLOAD, {
      config: { zones: [{ id: 7, name: "Desk" }] },
    });

    choose(typeSelect(card, 7), "ignore");
    choose(holdSelect(card, 7), "60");
    // A stored zone keeps its shape.
    choose(holdSelect(card, 1), "15");

    expect(zoneWrites(hass)).toEqual([
      { device_id: "dev123", zone_id: 7, zone_type: "ignore", shape: "none", data: null },
      { device_id: "dev123", zone_id: 7, hold_s: 60, shape: "none", data: null },
      { device_id: "dev123", zone_id: 1, hold_s: 15 },
    ]);
  });

  it("keeps the name field the only element marked data-zone-id", async () => {
    // The name field saves for the zone in its data-zone-id, so the selects
    // are marked with data-zone instead.
    const { card } = await listCard(FOUR_ZONES);

    for (const id of [1, 2, 3, 4]) {
      const marked = Array.from(editor(card, id).querySelectorAll("[data-zone-id]"));
      expect(marked).toEqual([nameFieldOf(card)]);
      const selects = Array.from(editorOf(card).querySelectorAll("select")) as any[];
      expect(selects.map((s) => [s.dataset.zone, s.dataset.zoneSetting])).toEqual([
        [String(id), "zone_type"],
        [String(id), "hold_s"],
      ]);
    }
  });

  it("keeps a focused select, the same one, when a payload lands", async () => {
    const { card, hass } = await listCard();
    document.body.appendChild(card);
    const hold = holdSelect(card, 1);
    hold.focus();
    expect(card.shadowRoot.activeElement).toBe(hold);

    push(hass, { ...ZONE_PAYLOAD, rotation_deg: 20 });

    expect(card.coneAngleDeg).toBe(20);
    expect(holdSelect(card, 1)).toBe(hold);
    expect(card.shadowRoot.activeElement).toBe(hold);
  });

  it("tells a non-administrator why the fields are disabled, with no Delete zone", async () => {
    const { card, hass } = await listCard(ZONE_PAYLOAD, { isAdmin: false });
    const note = editorOf(card).querySelector(".zone-settings-note");

    expect(note.textContent).toBe("Only an administrator can change these.");
    expect(card.shadowRoot.getElementById("btnDeleteZone")).toBeNull();
    expect(card.shadowRoot.getElementById("zoneDraw").hidden).toBe(true);

    // An administrator on the same card gets the editor made for them.
    card.hass = { ...hass, user: { is_admin: true } };
    expect(editorOf(card).querySelector(".zone-settings-note")).toBeNull();
    expect(card.shadowRoot.getElementById("btnDeleteZone")).not.toBeNull();
    expect(typeSelect(card, 1).disabled).toBe(false);
    expect(nameFieldOf(card).disabled).toBe(false);
  });

  it("disables the fields for non-administrators", async () => {
    const { card, hass } = await listCard(
      { ...ZONE_PAYLOAD, zones: { ...ZONE_PAYLOAD.zones, "2": { ...COUCH, zone_type: "ignore" } } },
      { isAdmin: false }
    );

    for (const id of [1, 2]) {
      for (const select of [typeSelect(card, id), holdSelect(card, id)]) {
        expect(select.disabled).toBe(true);
        expect(select.title).toBe("Only an administrator can change this");
      }
      expect(nameFieldOf(card).disabled).toBe(true);
    }

    // Nothing that still reaches a disabled select saves.
    choose(holdSelect(card, 1), "60");
    await settleWrites();
    expect(hass.callService).not.toHaveBeenCalled();
    expect(holdSelect(card, 1).value).toBe("0");
  });
});

/**
 * Delete zone, at the foot of the editor, asks first in its place: the zone's
 * sensors leave Home Assistant, and Undo cannot bring them back.
 *
 * Undo writes every snapshot entry back with update_zone, and the backend
 * stores any zone id it is given and re-creates that zone's entities. A
 * snapshot entry that outlived a Delete brought the deleted zone back, or
 * overwrote a zone added later under the freed id, under an "Undid" toast.
 */
describe("zone map card Delete zone", () => {
  const TWO_ZONES = {
    ...ZONE_PAYLOAD,
    zones: {
      ...ZONE_PAYLOAD.zones,
      "2": {
        shape: "rect",
        data: { x_min: 0, x_max: 500, y_min: 0, y_max: 500 },
        name: "Window",
      },
    },
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  async function deleteCard(payload: any = TWO_ZONES) {
    const hass = adminHass(payload);
    const card = await mountCard(hass);
    document.body.appendChild(card);
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  const $ = (card: any, id: string) => card.shadowRoot.getElementById(id);

  /** Press Delete zone in zone `zoneId`'s editor, then Delete. */
  function deleteZone(card: any, zoneId: number) {
    openZone(card, zoneId);
    $(card, "btnDeleteZone").click();
    $(card, "btnDeleteZoneYes").click();
  }

  it("asks first, and Keep it sends nothing", async () => {
    const { card, hass } = await deleteCard();
    openZone(card, 2);

    $(card, "btnDeleteZone").click();

    expect($(card, "zoneDeleteConfirm").hidden).toBe(false);
    expect($(card, "btnDeleteZone").closest(".zone-delete-row").hidden).toBe(true);
    expect($(card, "zoneDeleteText").textContent).toBe(
      "Delete Window? Its sensors leave Home Assistant, so automations that use them stop working. This cannot be undone."
    );
    expect(card.shadowRoot.activeElement).toBe($(card, "btnDeleteZoneNo"));

    $(card, "btnDeleteZoneNo").click();

    expect($(card, "zoneDeleteConfirm").hidden).toBe(true);
    expect(card.shadowRoot.activeElement).toBe($(card, "btnDeleteZone"));
    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.zoneConfig.map((z: any) => z.id)).toEqual([1, 2]);
  });

  it("takes Escape for Keep it", async () => {
    const { card, hass } = await deleteCard();
    $(card, "btnDeleteZone").click();

    pressKey($(card, "btnDeleteZoneNo"), "Escape");

    expect($(card, "zoneDeleteConfirm").hidden).toBe(true);
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("keeps asking through a payload, and stops for another zone", async () => {
    const { card, hass } = await deleteCard();
    $(card, "btnDeleteZone").click();

    hass.handlers[ZONES_SUBSCRIBE][0]({ ...TWO_ZONES, rotation_deg: 20 });
    expect($(card, "zoneDeleteConfirm").hidden).toBe(false);

    openZone(card, 2);
    expect($(card, "zoneDeleteConfirm").hidden).toBe(true);
  });

  it("deletes on Delete, says so, and selects the next zone", async () => {
    const { card, hass, toasts } = await deleteCard();

    deleteZone(card, 1);
    await settleWrites();

    expect(zoneWrites(hass)).toEqual([
      { device_id: "dev123", zone_id: 1, delete: true, input_units: "mm" },
    ]);
    expect(toasts).toEqual(["Doorway deleted"]);
    expect(card.zoneConfig.map((z: any) => z.id)).toEqual([2]);
    expect(chipOf(card, 1)).toBeNull();
    expect(card.selectedZone).toBe(2);
    expect(card.shadowRoot.activeElement).toBe(chipOf(card, 2));
  });

  it("puts the focus on Add zone once the last zone is deleted", async () => {
    const { card } = await deleteCard(ZONE_PAYLOAD);

    deleteZone(card, 1);

    expect(card.selectedZone).toBeNull();
    expect(editorOf(card)).toBeNull();
    expect($(card, "zoneEmpty").hidden).toBe(false);
    expect(card.shadowRoot.activeElement).toBe($(card, "btnAddZone"));
  });

  it("drops the deleted zone's snapshot, so Undo cannot re-create it", async () => {
    const { card, hass } = await deleteCard();
    card._setUndoSnapshot(card._snapshotZones([2]));
    expect($(card, "btnUndo").disabled).toBe(false);

    deleteZone(card, 2);

    expect(zoneWrites(hass)).toEqual([
      { device_id: "dev123", zone_id: 2, delete: true, input_units: "mm" },
    ]);
    expect(card._undoSnapshot).toBeNull();
    expect($(card, "btnUndo").disabled).toBe(true);

    hass.callService.mockClear();
    $(card, "btnUndo").click();
    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.zones.map((z: any) => z.id)).toEqual([1]);
  });

  it("still undoes the other zones a snapshot holds", async () => {
    const { card, hass } = await deleteCard();
    card._setUndoSnapshot(card._snapshotZones([1, 2]));

    deleteZone(card, 2);

    expect(card._undoSnapshot.map((s: any) => s.zoneId)).toEqual([1]);
    expect($(card, "btnUndo").disabled).toBe(false);

    hass.callService.mockClear();
    $(card, "btnUndo").click();
    expect(zoneWrites(hass).map((p: any) => p.zone_id)).toEqual([1]);
  });

  it("deletes on a locked map too, which locks drawing only", async () => {
    const { card, hass } = await deleteCard();
    expect(card.isLocked).toBe(true);

    deleteZone(card, 2);

    expect(zoneWrites(hass).map((p: any) => p.delete)).toEqual([true]);
  });
});

describe("zone map card rotation source", () => {
  // The presence sensors rotate targets by the store's rotation_deg, and by 0
  // when it was never set. A card that kept the YAML cone.angle_deg for such a
  // radar drew targets inside zones that the sensors evaluated somewhere else.
  const UNROTATED = { ...ZONE_PAYLOAD, rotation_deg: null };

  /** Put one live target (the payload's suggested pair) at x, y in mm. */
  function trackTarget(hass: any, x: number, y: number) {
    hass.states["sensor.a_x"] = { entity_id: "sensor.a_x", state: String(x), attributes: {} };
    hass.states["sensor.a_y"] = { entity_id: "sensor.a_y", state: String(y), attributes: {} };
  }

  /** Where the card draws each live target, in mm. */
  function drawnTargets(card: any): number[][] {
    const spy = vi.spyOn(card, "drawCurrentPosition").mockImplementation(() => {});
    card._drawTrackedTargets();
    const points = spy.mock.calls.map((call: any[]) => [call[0], call[1]]);
    spy.mockRestore();
    return points;
  }

  it("draws an unset store rotation as 0, not the YAML angle", async () => {
    const hass = fakeHass(UNROTATED);
    trackTarget(hass, 0, 1000);
    const card = await mountCard(hass, { cone: { angle_deg: 45 } });

    expect(card.coneAngleDeg).toBe(0);
    expect(card.coneAngleDefault).toBe(45);
    expect(card.shadowRoot.getElementById("coneAngleSlider").value).toBe("0");
    expect(card.shadowRoot.getElementById("coneAngleLabel").textContent).toBe("0°");
    const points = drawnTargets(card);
    expect(points).toHaveLength(1);
    expect(points[0][0]).toBeCloseTo(0, 6);
    expect(points[0][1]).toBeCloseTo(1000, 6);

    // A same-radar setConfig (the editor, on every keystroke) re-reads the
    // YAML angle, and must not bring it back either.
    card.setConfig({ device_id: "dev123", cone: { angle_deg: 45 } });
    expect(card.coneAngleDeg).toBe(0);
    expect(card.shadowRoot.getElementById("coneAngleSlider").value).toBe("0");

    // Viewing a radar is not configuring it.
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("resets to the YAML angle on double-click and persists it", async () => {
    const hass = fakeHass(UNROTATED);
    const card = await mountCard(hass, { cone: { angle_deg: 45 }, start_locked: false });
    const slider = card.shadowRoot.getElementById("coneAngleSlider");

    slider.dispatchEvent(new MouseEvent("dblclick"));

    expect(card.coneAngleDeg).toBe(45);
    expect(slider.value).toBe("45");
    expect(hass.callService).toHaveBeenCalledWith(
      "apollo_mmwave",
      "update_zone",
      { device_id: "dev123", rotation_deg: 45, input_units: "mm" },
      undefined,
      false
    );
  });

  it("draws a stored rotation over the YAML angle", async () => {
    const hass = fakeHass();
    trackTarget(hass, 0, 1000);
    const card = await mountCard(hass, { cone: { angle_deg: 45 } });

    expect(card.coneAngleDeg).toBe(12);
    expect(card.shadowRoot.getElementById("coneAngleSlider").value).toBe("12");
    const theta = (12 * Math.PI) / 180;
    const points = drawnTargets(card);
    expect(points[0][0]).toBeCloseTo(1000 * Math.sin(theta), 6);
    expect(points[0][1]).toBeCloseTo(1000 * Math.cos(theta), 6);

    card.setConfig({ device_id: "dev123", cone: { angle_deg: 45 } });
    expect(card.coneAngleDeg).toBe(12);
    expect(hass.callService).not.toHaveBeenCalled();
  });
});

describe("zone map card connection ownership", () => {
  it("drops a late payload from the radar the card no longer shows", async () => {
    // Retargeting disposes the old connection only after its own round trips
    // finish, so its initial read can land after the new radar's did.
    const hass = fakeHass();
    let releaseFirstRead!: (payload: any) => void;
    let reads = 0;
    hass.callWS = vi.fn(async (msg: any) => {
      if (msg.type !== ZONES_GET) return [];
      reads += 1;
      if (reads === 1) {
        return new Promise((resolve) => {
          releaseFirstRead = resolve;
        });
      }
      return { ...ZONE_PAYLOAD, label: "Second radar", zones: {} };
    });

    const card: any = new ZoneMapCard();
    card.setConfig({ device_id: "devA" } as any);
    card.hass = hass;
    await vi.waitFor(() => expect(reads).toBe(1));

    card.setConfig({ device_id: "devB" } as any);
    await vi.waitFor(() => expect(card._zoneConfigPayload?.label).toBe("Second radar"));

    releaseFirstRead({
      ...ZONE_PAYLOAD,
      label: "First radar",
      zones: { "1": { shape: "rect", data: { x_min: 0, x_max: 10, y_min: 0, y_max: 10 } } },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(card._zoneConfigPayload.label).toBe("Second radar");
    expect(card.zones).toHaveLength(0);
  });

  it("restores the keyboard and outside-click listeners when re-attached", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);
    document.body.appendChild(card);
    expect(card._onKeyDown).toBeTruthy();

    card.remove();
    expect(card._onKeyDown).toBeNull();
    expect(card._outsideClickHandler).toBeNull();

    document.body.appendChild(card);
    expect(card._onKeyDown).toBeTruthy();
    // Behavior, not just presence: the re-attached handler still cancels.
    startPolygon(card);
    pressOn(card, "mousedown");
    expect(card.isDrawing).toBe(false);
    card.remove();
  });
});

/** Put the card mid-polygon, two vertices in, the way a touch user leaves it. */
function startPolygon(card: any) {
  card.drawMode = "polygon";
  card.isDrawing = true;
  card._polyPoints = [
    { x: 100, y: 200 },
    { x: 300, y: 400 },
  ];
}

/** Dispatch a composed press, so it reaches the card's document listener. */
function pressOn(target: EventTarget, type: "mousedown" | "touchstart") {
  const event =
    type === "mousedown"
      ? new MouseEvent(type, { bubbles: true, composed: true })
      : new Event(type, { bubbles: true, composed: true });
  target.dispatchEvent(event);
}

/**
 * A press elsewhere in the card cancels the shape being drawn.
 *
 * The listener sits on document, and a browser retargets `event.target` there
 * to the outermost shadow host, so the handler has to read the composed path.
 * happy-dom does not retarget: dispatched on an inner chip, document would see
 * the chip and the old `shadowRoot.contains(event.target)` check would pass
 * for the wrong reason. Dispatching on the card element itself gives document
 * the target a browser would, which is what makes these tests discriminate.
 */
describe("zone map card outside clicks", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("cancels an in-progress polygon on a press that document sees on the card host", async () => {
    const card = await mountCard(fakeHass());
    document.body.appendChild(card);
    startPolygon(card);

    pressOn(card, "mousedown");

    expect(card.isDrawing).toBe(false);
    expect(card._polyPoints).toHaveLength(0);
  });

  it("leaves the drawing alone for the Finish button inside the canvas container", async () => {
    const card = await mountCard(fakeHass());
    document.body.appendChild(card);
    startPolygon(card);

    pressOn(card.shadowRoot.getElementById("btnPolyFinish"), "mousedown");

    expect(card.isDrawing).toBe(true);
    expect(card._polyPoints).toHaveLength(2);
  });

  it("leaves the drawing alone for a press outside the card", async () => {
    const card = await mountCard(fakeHass());
    document.body.appendChild(card);
    startPolygon(card);

    pressOn(document.body, "mousedown");

    expect(card.isDrawing).toBe(true);
    expect(card._polyPoints).toHaveLength(2);
  });

  it("cancels on a touch on Add Zone, where no mouseleave fires first", async () => {
    const card = await mountCard(fakeHass());
    document.body.appendChild(card);
    startPolygon(card);

    pressOn(card.shadowRoot.getElementById("btnAddZone"), "touchstart");

    expect(card.isDrawing).toBe(false);
    expect(card._polyPoints).toHaveLength(0);
  });
});

/** Dispatch a composed keydown, so it bubbles out to the card's window listener. */
function keyOn(target: EventTarget, key: string) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));
}

/**
 * Backspace and Escape edit a half-drawn polygon, but not while the key is
 * typed into a text field.
 *
 * The listener sits on window, so it hears every keydown on the page. Before
 * the origin check, fixing a typo in a zone name popped a vertex per Backspace
 * and Escape threw the whole polygon away. A browser retargets `event.target`
 * at window to the outermost shadow host, which is why the handler reads the
 * composed path; happy-dom does not retarget, so these tests pin the behavior
 * rather than which of the two the handler reads.
 */
describe("zone map card polygon keyboard shortcuts", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  async function polygonInProgress() {
    const card = await mountCard(fakeHass());
    document.body.appendChild(card);
    startPolygon(card);
    const nameInput = card.shadowRoot.querySelector("#zoneManager input");
    expect(nameInput).toBeInstanceOf(HTMLInputElement);
    return { card, nameInput };
  }

  it("ignores Backspace typed into the zone-name input", async () => {
    const { card, nameInput } = await polygonInProgress();

    keyOn(nameInput, "Backspace");

    expect(card._polyPoints).toHaveLength(2);
    expect(card.isDrawing).toBe(true);
  });

  it("ignores Escape typed into the zone-name input", async () => {
    const { card, nameInput } = await polygonInProgress();

    keyOn(nameInput, "Escape");

    expect(card._polyPoints).toHaveLength(2);
    expect(card.isDrawing).toBe(true);
  });

  it("ignores keys typed into a field elsewhere on the dashboard", async () => {
    const { card } = await polygonInProgress();
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    keyOn(textarea, "Backspace");
    keyOn(textarea, "Escape");

    expect(card._polyPoints).toHaveLength(2);
    expect(card.isDrawing).toBe(true);
  });

  it("pops one vertex on Backspace from the page body", async () => {
    const { card } = await polygonInProgress();

    keyOn(document.body, "Backspace");

    expect(card._polyPoints).toEqual([{ x: 100, y: 200 }]);
    expect(card.isDrawing).toBe(true);
  });

  it("clears the polygon on Escape from the page body", async () => {
    const { card } = await polygonInProgress();

    keyOn(document.body, "Escape");

    expect(card._polyPoints).toHaveLength(0);
    expect(card.isDrawing).toBe(false);
  });
});

/**
 * Polygon finishing through the real canvas listeners.
 *
 * A double-click or double-tap finishes the polygon, and its second click is
 * the gesture, not a vertex. Two quick taps at different spots are two
 * vertices. The canvas is laid out at 800x800 CSS px over the 800x800 bitmap,
 * so one px is 12.5 mm on the default 10 m grid.
 */
describe("zone map card polygon double-tap", () => {
  let now = 0;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function polygonCard() {
    const hass = fakeHass({ ...ZONE_PAYLOAD, zones: {} });
    const card = await mountCard(hass, TEN_METER_GRID);
    card.isLocked = false;
    card.selectedZone = 1;
    card._setDrawMode("polygon");
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 800,
      x: 0,
      y: 0,
      width: 800,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect);
    now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    hass.callService.mockClear();
    return { card, hass };
  }

  function click(card: any, x: number, y: number, afterMs: number) {
    now += afterMs;
    card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: y }));
    card.canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: y }));
  }

  function tap(card: any, x: number, y: number, afterMs: number) {
    now += afterMs;
    const point = { clientX: x, clientY: y };
    const start = Object.assign(new Event("touchstart", { cancelable: true }), {
      touches: [point],
      changedTouches: [point],
    });
    const end = Object.assign(new Event("touchend", { cancelable: true }), {
      touches: [],
      changedTouches: [point],
    });
    card.canvas.dispatchEvent(start);
    card.canvas.dispatchEvent(end);
  }

  function polygonSaves(hass: any): any[] {
    return hass.callService.mock.calls
      .filter((call: any[]) => call[1] === "update_zone" && call[2].shape === "polygon")
      .map((call: any[]) => call[2].data.points);
  }

  function hasConsecutiveRepeat(points: any[]): boolean {
    return points.some(
      (p: any, i: number) => i > 0 && p.x === points[i - 1].x && p.y === points[i - 1].y
    );
  }

  const SQUARE = [
    { x: -3750, y: 1250 },
    { x: -1250, y: 1250 },
    { x: -1250, y: 3750 },
    { x: -3750, y: 3750 },
  ];

  /** Three corners placed slowly, so none of them is near a double-tap. */
  function threeSlowCorners(input: typeof click) {
    return (card: any) => {
      input(card, 100, 100, 1000);
      input(card, 300, 100, 1000);
      input(card, 300, 300, 1000);
    };
  }

  it("keeps drawing when three distinct vertices are clicked 300 ms apart", async () => {
    const { card, hass } = await polygonCard();

    click(card, 100, 100, 1000);
    click(card, 500, 100, 300);
    click(card, 500, 500, 300);

    expect(card.isDrawing).toBe(true);
    expect(card._polyPoints).toHaveLength(3);
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("adds a quick fourth vertex at a new spot instead of finishing", async () => {
    const { card, hass } = await polygonCard();

    threeSlowCorners(click)(card);
    click(card, 100, 300, 200);

    expect(card._polyPoints).toEqual(SQUARE);
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("finishes on a double-click at the last corner without storing the second click", async () => {
    const { card, hass } = await polygonCard();

    threeSlowCorners(click)(card);
    click(card, 100, 300, 1000);
    click(card, 100, 300, 100);
    card.canvas.dispatchEvent(new MouseEvent("dblclick"));

    const saves = polygonSaves(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual(SQUARE);
    expect(hasConsecutiveRepeat(saves[0])).toBe(false);
    expect(card._polyPoints).toHaveLength(0);
    expect(card.isDrawing).toBe(false);
  });

  it("drops the repeated corner when a slower double-click finishes through dblclick", async () => {
    const { card, hass } = await polygonCard();

    threeSlowCorners(click)(card);
    click(card, 100, 300, 1000);
    click(card, 100, 300, 400);
    expect(hass.callService).not.toHaveBeenCalled();
    card.canvas.dispatchEvent(new MouseEvent("dblclick"));

    const saves = polygonSaves(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual(SQUARE);
    expect(card._polyPoints).toHaveLength(0);
  });

  it("finishes on a touch double-tap at the last corner with four points", async () => {
    const { card, hass } = await polygonCard();

    threeSlowCorners(tap)(card);
    tap(card, 100, 300, 1000);
    tap(card, 100, 300, 150);

    const saves = polygonSaves(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual(SQUARE);
    expect(card.isDrawing).toBe(false);
  });

  it("still finishes when the second tap lands a few px off the corner", async () => {
    const { card, hass } = await polygonCard();

    threeSlowCorners(tap)(card);
    tap(card, 100, 300, 1000);
    tap(card, 103, 302, 150);

    const saves = polygonSaves(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual(SQUARE);
  });

  it("saves nothing for a same-spot double-tap with only two vertices", async () => {
    const { card, hass } = await polygonCard();

    tap(card, 100, 100, 1000);
    tap(card, 300, 100, 1000);
    tap(card, 300, 100, 150);

    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.isDrawing).toBe(true);
    expect(card._polyPoints).toEqual([
      { x: -3750, y: 1250 },
      { x: -1250, y: 1250 },
    ]);
  });

  it("auto-finishes at the 32-point cap with one save of all 32 points", async () => {
    const { card, hass } = await polygonCard();
    // 16 corners along the top edge, then 16 back along the bottom edge, all
    // a second apart so no click reads as a double-tap.
    const top = Array.from({ length: 16 }, (_, i) => ({ px: 100 + 40 * i, py: 100 }));
    const bottom = top.map(({ px }) => ({ px, py: 500 })).reverse();
    const corners = [...top, ...bottom];
    const expected = corners.map(({ px, py }) => ({ x: -5000 + 12.5 * px, y: 12.5 * py }));

    corners.slice(0, 31).forEach(({ px, py }) => click(card, px, py, 1000));
    expect(polygonSaves(hass)).toHaveLength(0);
    expect(card._polyPoints).toHaveLength(31);

    click(card, corners[31].px, corners[31].py, 1000);

    const saves = polygonSaves(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual(expected);
    expect(card._polyPoints).toHaveLength(0);
    expect(card.isDrawing).toBe(false);

    // The next click starts a fresh polygon rather than landing on a full one.
    click(card, 700, 700, 1000);
    expect(card._polyPoints).toEqual([{ x: 3750, y: 8750 }]);
    expect(polygonSaves(hass)).toHaveLength(1);
  });

  // A finish that saves nothing used to end in silence, so a user who
  // double-tapped two corners, or forgot to pick a zone, saw the shape vanish
  // and never learned why.
  it("finishing a polygon with under 3 points says so", async () => {
    const { card, hass } = await polygonCard();
    const toasts = notifications(card);
    tap(card, 100, 100, 1000);
    tap(card, 300, 100, 1000);

    // The double-tap keeps the polygon open for its missing corner.
    tap(card, 300, 100, 150);
    expect(card.isDrawing).toBe(true);
    expect(card._polyPoints).toHaveLength(2);
    expect(toasts).toEqual(["A polygon needs at least 3 different points."]);

    // Finish ends it, as it always did, and says why nothing was saved. Each
    // message toasts at most once per 1.5 s.
    now += 2000;
    card.shadowRoot.getElementById("btnPolyFinish").click();
    expect(card.isDrawing).toBe(false);
    expect(card._polyPoints).toEqual([]);
    expect(hass.callService).not.toHaveBeenCalled();
    expect(toasts).toEqual([
      "A polygon needs at least 3 different points.",
      "A polygon needs at least 3 different points.",
    ]);
  });

  it("finishing with no zone selected says so", async () => {
    const { card, hass } = await polygonCard();
    const toasts = notifications(card);
    click(card, 100, 100, 1000);
    click(card, 300, 100, 1000);
    click(card, 300, 300, 1000);
    card.selectedZone = null;

    card.finishPolygon();

    expect(toasts).toEqual(["Select a zone first."]);
    expect(card.isDrawing).toBe(false);
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("a double-click after a finished polygon says nothing", async () => {
    const { card, hass } = await polygonCard();
    const toasts = notifications(card);

    threeSlowCorners(click)(card);
    click(card, 100, 300, 1000);
    click(card, 100, 300, 100);
    // The browser's own dblclick lands after the double-click finished it.
    card.canvas.dispatchEvent(new MouseEvent("dblclick"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(polygonSaves(hass)).toEqual([SQUARE]);
    expect(toasts).toEqual(["Zone 1 saved"]);
  });

  it("a tap with no zone selected says nothing", async () => {
    const { card, hass } = await polygonCard();
    const toasts = notifications(card);
    card._setSelectedZone(null);

    tap(card, 100, 100, 1000);
    // The mouse events a browser makes of a tap the canvas left alone.
    click(card, 100, 100, 10);

    expect(toasts).toEqual([]);
    expect(card.isDrawing).toBe(false);
    expect(hass.callService).not.toHaveBeenCalled();
  });
});

/**
 * The pointer leaving the canvas container.
 *
 * In polygon mode `isDrawing` stays true for the whole multi-click session, so
 * a blanket cancel on mouseleave threw away every placed vertex as soon as the
 * pointer crossed onto the zone chips or the slider. Leaving now drops only the
 * rubber-band line for a polygon, and still cancels a rect or ellipse drag,
 * whose mouseup only the canvas hears.
 */
describe("zone map card pointer leaving the canvas", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function drawingCard(mode: string) {
    const hass = fakeHass({ ...ZONE_PAYLOAD, zones: {} });
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false });
    card._setSelectedZone(1);
    card._setDrawMode(mode);
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 800,
      x: 0,
      y: 0,
      width: 800,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect);
    hass.callService.mockClear();
    return { card, hass };
  }

  /** One mouse click on the canvas, never close enough in time to finish. */
  function click(card: any, x: number, y: number) {
    card._lastPolyTap = 0;
    card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: y }));
    card.canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: y }));
  }

  function leave(card: any) {
    card.canvas.parentElement.dispatchEvent(new MouseEvent("mouseleave"));
  }

  it("keeps a half-drawn polygon and only drops the rubber-band line", async () => {
    const { card, hass } = await drawingCard("polygon");

    click(card, 100, 100);
    click(card, 300, 100);
    click(card, 300, 300);
    card.canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 400 }));
    expect(card._cursorPoint).not.toBeNull();

    leave(card);

    expect(card._polyPoints).toHaveLength(3);
    expect(card.isDrawing).toBe(true);
    expect(card._cursorPoint).toBeNull();
    expect(hass.callService).not.toHaveBeenCalled();

    click(card, 100, 300);
    card.finishPolygon();

    const saves = hass.callService.mock.calls.filter(
      (call: any[]) => call[1] === "update_zone" && call[2].shape === "polygon"
    );
    expect(saves).toHaveLength(1);
    expect(saves[0][2].data.points).toEqual([
      { x: -3750, y: 1250 },
      { x: -1250, y: 1250 },
      { x: -1250, y: 3750 },
      { x: -3750, y: 3750 },
    ]);
  });

  it.each(["rect", "ellipse"])("still cancels a %s drag", async (mode) => {
    const { card, hass } = await drawingCard(mode);

    card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));
    expect(card.isDrawing).toBe(true);

    leave(card);

    expect(card.isDrawing).toBe(false);
    expect(card.startPoint).toBeNull();

    card.canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: 300, clientY: 300 }));

    expect(hass.callService).not.toHaveBeenCalled();
  });
});

/**
 * Mode changes, re-renders and retargets in the middle of a polygon.
 *
 * Every render() ends by re-applying the current draw mode, and so does a
 * click on the mode button that is already active. That call used to clear
 * `isDrawing` but keep the vertices, which hid them from the canvas while
 * Finish, Backspace and the next click still used them. Only a real mode
 * change, or pointing the card at another radar, drops a polygon in progress.
 */
describe("zone map card drawing across mode changes and re-renders", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** happy-dom has no layout: give the current canvas an 800x800 CSS box. */
  function stubLayout(card: any) {
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 800,
      x: 0,
      y: 0,
      width: 800,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect);
  }

  /** Unlocked on dev123 with zone 1 selected and two polygon vertices placed. */
  async function halfDrawnPolygon() {
    const hass = fakeHass();
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false });
    expect(card.selectedZone).toBe(1);
    card.shadowRoot.getElementById("btnModePolygon").click();
    stubLayout(card);
    click(card, 100, 100);
    click(card, 300, 100);
    expect(card.isDrawing).toBe(true);
    expect(card._polyPoints).toHaveLength(2);
    hass.callService.mockClear();
    return { card, hass };
  }

  /** One mouse click on the canvas, never close enough in time to finish. */
  function click(card: any, x: number, y: number) {
    card._lastPolyTap = 0;
    card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: y }));
    card.canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: y }));
  }

  function polygonSaves(hass: any): any[] {
    return hass.callService.mock.calls.filter(
      (call: any[]) => call[1] === "update_zone" && call[2].shape === "polygon"
    );
  }

  const TWO_CORNERS = [
    { x: -3750, y: 1250 },
    { x: -1250, y: 1250 },
  ];

  it("keeps the vertices visible when the active Polygon button is clicked again", async () => {
    const { card, hass } = await halfDrawnPolygon();

    card.shadowRoot.getElementById("btnModePolygon").click();

    expect(card.drawMode).toBe("polygon");
    expect(card.isDrawing).toBe(true);
    expect(card._polyPoints).toEqual(TWO_CORNERS);
    expect(card.shadowRoot.getElementById("btnModePolygon").classList.contains("active")).toBe(
      true
    );
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("keeps the vertices visible and live across a theme-flip render", async () => {
    const { card, hass } = await halfDrawnPolygon();
    const canvasBefore = card.canvas;

    hass.themes = { darkMode: true };
    card.hass = hass;

    // A fresh canvas proves render() ran and re-applied the draw mode.
    expect(card.canvas).not.toBe(canvasBefore);
    expect(card.drawMode).toBe("polygon");
    expect(card.isDrawing).toBe(true);
    expect(card._polyPoints).toEqual(TWO_CORNERS);
    expect(card.shadowRoot.getElementById("btnModePolygon").classList.contains("active")).toBe(
      true
    );
    expect(card.shadowRoot.getElementById("btnPolyFinish").style.display).toBe("block");

    stubLayout(card);
    click(card, 300, 300);
    card.shadowRoot.getElementById("btnPolyFinish").click();

    const saves = polygonSaves(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0][2].zone_id).toBe(1);
    expect(saves[0][2].data.points).toEqual([...TWO_CORNERS, { x: -1250, y: 3750 }]);
  });

  it("drops a half-drawn polygon when the mode actually changes", async () => {
    const { card, hass } = await halfDrawnPolygon();

    card.shadowRoot.getElementById("btnModeRect").click();

    expect(card.drawMode).toBe("rect");
    expect(card._polyPoints).toEqual([]);
    expect(card.isDrawing).toBe(false);
    expect(card.startPoint).toBeNull();
    expect(card.shadowRoot.getElementById("btnPolyFinish").style.display).toBe("none");
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("never leaves placed vertices behind a cleared isDrawing", async () => {
    const { card } = await halfDrawnPolygon();

    for (const mode of ["polygon", "rect", "rect", "polygon", "ellipse", "polygon", undefined]) {
      if (card.drawMode === "polygon") {
        click(card, 500, 500);
        click(card, 700, 500);
      }
      card._setDrawMode(mode);
      expect(card.isDrawing || card._polyPoints.length === 0).toBe(true);
    }
  });

  it("drops a half-drawn polygon when pointed at another radar", async () => {
    const { card, hass } = await halfDrawnPolygon();
    hass.payload = {
      ...ZONE_PAYLOAD,
      zones: {
        "7": { shape: "rect", data: { x_min: 0, x_max: 500, y_min: 0, y_max: 500 } },
      },
      label: "Bedroom",
    };

    card.setConfig({
      type: "custom:apollo-radar-zone-map-card",
      device_id: "devB",
      start_locked: false,
      ...TEN_METER_GRID,
    });

    expect(card._polyPoints).toEqual([]);
    expect(card.isDrawing).toBe(false);
    expect(card.startPoint).toBeNull();

    // Once devB answers, its first zone is selected, so a commit would land
    // there. One click starts a fresh polygon instead of extending dev123's.
    await vi.waitFor(() => expect(card.selectedZone).toBe(7));
    stubLayout(card);
    click(card, 300, 300);
    expect(card._polyPoints).toEqual([{ x: -1250, y: 3750 }]);
    card.finishPolygon();

    expect(polygonSaves(hass)).toEqual([]);
  });

  it("keeps a half-drawn polygon when the config changes but the radar does not", async () => {
    const { card } = await halfDrawnPolygon();

    card.setConfig({
      type: "custom:apollo-radar-zone-map-card",
      device_id: "dev123",
      start_locked: false,
      title: "Kitchen",
    });

    expect(card.isDrawing).toBe(true);
    expect(card._polyPoints).toEqual(TWO_CORNERS);
  });
});

/** A 2D context that records every method call and keeps property writes. */
function recordingContext() {
  const calls: Array<[string, any[]]> = [];
  const sink: any = new Proxy(function () {} as object, {
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      return sink;
    },
    set() {
      return true;
    },
    apply() {
      return sink;
    },
  });
  const ctx = new Proxy({} as Record<string | symbol, any>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: any[]) => {
        calls.push([String(prop), args]);
        return sink;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx, calls };
}

/**
 * A hass push that moved the radar's detected target (the suggested pair in
 * ZONE_PAYLOAD) 100 mm along x, which is the kind of push that repaints.
 */
function pushTargetMove(card: any, hass: any) {
  const x = Number(hass.states["sensor.a_x"]?.state ?? 0) + 100;
  hass.states = {
    ...hass.states,
    "sensor.a_x": { state: String(x) },
    "sensor.a_y": { state: "2000" },
  };
  card.hass = hass;
}

/**
 * The rect and ellipse rubber band across repaints.
 *
 * `set hass` repaints whenever a tracked target moves, and a zone payload
 * repaints too. The dashed rect or ellipse preview used to be painted
 * only by the pointer-move handler, right after its own repaint, so any other
 * repaint wiped it until the next move and a still finger saw it blink out.
 * The preview is now rebuilt from the stored cursor point on every repaint,
 * like the polygon one already was.
 */
describe("zone map card rect and ellipse preview across repaints", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Unlocked with zone 1 selected, an 800x800 CSS box and a recording ctx. */
  async function drawingCard(mode: string) {
    const hass = fakeHass({ ...ZONE_PAYLOAD, zones: {} });
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false });
    card._setSelectedZone(1);
    card._setDrawMode(mode);
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 800,
      x: 0,
      y: 0,
      width: 800,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect);
    const { ctx, calls } = recordingContext();
    card.ctx = ctx;
    hass.callService.mockClear();
    return { card, hass, calls };
  }

  /** How many times the rect/ellipse preview's 5px dash was set. */
  function dashes(calls: Array<[string, any[]]>): number {
    const isPreviewDash = ([name, args]: [string, any[]]) =>
      name === "setLineDash" && args[0]?.join() === "5,5";
    return calls.filter(isPreviewDash).length;
  }

  function rectPreviews(calls: Array<[string, any[]]>): any[][] {
    return calls.filter(([name]) => name === "strokeRect").map(([, args]) => args);
  }

  function ellipsePreviews(calls: Array<[string, any[]]>): any[][] {
    return calls.filter(([name]) => name === "ellipse").map(([, args]) => args);
  }

  /** Start a drag at canvas (100,100) and hold the pointer at (300,250).
   *  On this 0.5 m grid corners snap to 5 cm, so the pointer's corner,
   *  3125 mm down, is drawn at 3150 mm (252 px). */
  function dragTo300x250(card: any) {
    card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));
    card.canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 250 }));
  }

  it("keeps the rect preview when a hass push repaints mid-drag", async () => {
    const { card, hass, calls } = await drawingCard("rect");
    dragTo300x250(card);
    calls.length = 0;

    pushTargetMove(card, hass);

    expect(card.isDrawing).toBe(true);
    expect(calls.some(([name]) => name === "clearRect")).toBe(true);
    expect(dashes(calls)).toBe(1);
    expect(rectPreviews(calls)).toEqual([[100, 100, 200, 152]]);
  });

  it("keeps the ellipse preview when a hass push repaints mid-drag", async () => {
    const { card, hass, calls } = await drawingCard("ellipse");
    dragTo300x250(card);
    calls.length = 0;

    pushTargetMove(card, hass);

    expect(card.isDrawing).toBe(true);
    expect(calls.some(([name]) => name === "clearRect")).toBe(true);
    expect(dashes(calls)).toBe(1);
    expect(ellipsePreviews(calls)).toEqual([[200, 176, 100, 76, 0, 0, Math.PI * 2]]);
  });

  it("keeps the rect preview of a touch drag when a hass push repaints", async () => {
    const { card, hass, calls } = await drawingCard("rect");
    const touch = (type: string, x: number, y: number) =>
      Object.assign(new Event(type, { cancelable: true }), {
        touches: [{ clientX: x, clientY: y }],
        changedTouches: [{ clientX: x, clientY: y }],
      });
    card.canvas.dispatchEvent(touch("touchstart", 100, 100));
    card.canvas.dispatchEvent(touch("touchmove", 300, 250));
    calls.length = 0;

    pushTargetMove(card, hass);

    expect(card.isDrawing).toBe(true);
    expect(calls.some(([name]) => name === "clearRect")).toBe(true);
    expect(rectPreviews(calls)).toEqual([[100, 100, 200, 152]]);
  });

  it.each([
    ["rect", rectPreviews],
    ["ellipse", ellipsePreviews],
  ])("paints exactly one %s preview per pointer move", async (mode, previews) => {
    const { card, calls } = await drawingCard(mode as string);
    card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));
    // Nothing to outline before the pointer has moved.
    expect(dashes(calls)).toBe(0);
    expect((previews as typeof rectPreviews)(calls)).toEqual([]);

    calls.length = 0;
    card.canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 250 }));

    expect(calls.filter(([name]) => name === "clearRect")).toHaveLength(1);
    expect(dashes(calls)).toBe(1);
    expect((previews as typeof rectPreviews)(calls)).toHaveLength(1);
  });

  it.each([
    ["rect", rectPreviews],
    ["ellipse", ellipsePreviews],
  ])("leaves no stale %s preview after the drag ends", async (mode, previews) => {
    const { card, hass, calls } = await drawingCard(mode as string);
    dragTo300x250(card);
    card.canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: 300, clientY: 250 }));

    const saves = hass.callService.mock.calls.filter(
      (call: any[]) => call[1] === "update_zone"
    );
    expect(saves).toHaveLength(1);
    expect(saves[0][2].shape).toBe(mode);
    expect(card.isDrawing).toBe(false);
    expect(card.startPoint).toBeNull();
    expect(card._cursorPoint).toBeNull();

    calls.length = 0;
    pushTargetMove(card, hass);

    expect(calls.some(([name]) => name === "clearRect")).toBe(true);
    expect(dashes(calls)).toBe(0);
    // Only the saved zone's own solid outline, with no preview beside it.
    expect((previews as typeof rectPreviews)(calls)).toHaveLength(1);
  });
});

/**
 * Which hass pushes repaint the map.
 *
 * Home Assistant assigns a new hass on every state change in the instance,
 * and `set hass` used to repaint the whole canvas (grid, cone, every zone) for
 * each one. The tracked targets are the only part of the picture read from
 * hass, so only a push that changes one of their state strings repaints.
 */
describe("zone map card repaints on hass pushes", () => {
  function clears(calls: Array<[string, any[]]>): number {
    return calls.filter(([name]) => name === "clearRect").length;
  }

  /** Target circles drawn by drawCurrentPosition (radius 10). */
  function targets(calls: Array<[string, any[]]>): any[][] {
    return calls.filter(([name, args]) => name === "arc" && args[2] === 10).map(([, a]) => a);
  }

  /** Mounted on the payload's detected pair, with the target at (500, 2000). */
  async function trackingCard() {
    const hass = fakeHass();
    const card = await mountCard(hass);
    expect(card.trackedEntities).toEqual([{ x: "sensor.a_x", y: "sensor.a_y" }]);
    const { ctx, calls } = recordingContext();
    card.ctx = ctx;
    hass.states = {
      "sensor.a_x": { state: "500" },
      "sensor.a_y": { state: "2000" },
      "sensor.kitchen_light": { state: "off" },
    };
    card.hass = hass;
    expect(clears(calls)).toBe(1);
    expect(targets(calls)).toHaveLength(1);
    calls.length = 0;
    return { card, hass, calls };
  }

  it("paints on the first hass assignment", async () => {
    const hass = fakeHass();
    const card: any = new ZoneMapCard();
    card.setConfig({ device_id: "dev123" } as any);
    expect(card.canvas).toBeTruthy();
    const { ctx, calls } = recordingContext();
    card.ctx = ctx;

    card.hass = hass;

    expect(clears(calls)).toBe(1);
    await vi.waitFor(() => expect(card._zoneConfigPayload).toBeTruthy());
  });

  it("does not repaint for a new hass whose tracked states are unchanged", async () => {
    const { card, hass, calls } = await trackingCard();

    // A new object with equal state strings, as HA hands over on every push.
    card.hass = { ...hass, states: { ...hass.states, "sensor.a_x": { state: "500" } } };

    expect(clears(calls)).toBe(0);
    expect(calls).toEqual([]);
  });

  it("does not repaint when only an untracked entity changes", async () => {
    const { card, hass, calls } = await trackingCard();

    card.hass = {
      ...hass,
      states: { ...hass.states, "sensor.kitchen_light": { state: "on" } },
    };

    expect(clears(calls)).toBe(0);
  });

  it("repaints when a tracked x state changes", async () => {
    const { card, hass, calls } = await trackingCard();
    const before = card.valueToPixels(500, "x");

    card.hass = { ...hass, states: { ...hass.states, "sensor.a_x": { state: "750" } } };

    expect(clears(calls)).toBe(1);
    const painted = targets(calls);
    expect(painted).toHaveLength(1);
    expect(painted[0][0]).not.toBeCloseTo(before);
  });

  it("repaints when a tracked y state changes", async () => {
    const { card, hass, calls } = await trackingCard();

    card.hass = { ...hass, states: { ...hass.states, "sensor.a_y": { state: "2500" } } };

    expect(clears(calls)).toBe(1);
  });

  it("repaints to clear a target whose sensor went unavailable", async () => {
    const { card, hass, calls } = await trackingCard();

    card.hass = {
      ...hass,
      states: { ...hass.states, "sensor.a_x": { state: "unavailable" } },
    };

    expect(clears(calls)).toBe(1);
    expect(targets(calls)).toEqual([]);
  });

  it("repaints when only a tracked sensor's unit changes", async () => {
    // Changing a sensor's unit in its entity settings rewrites the state too,
    // but the state string and the unit can arrive as separate pushes. Same
    // number, new unit, new place.
    const { card, hass, calls } = await trackingCard();
    const withReading = (x: any, y: any) => ({
      ...hass,
      states: { ...hass.states, "sensor.a_x": x, "sensor.a_y": y },
    });
    // Where (2540, 5080) mm is drawn, rotation included.
    card.hass = withReading(targetState("2540"), targetState("5080"));
    const [inMillimeters] = targets(calls);
    card.hass = withReading(targetState("100"), targetState("200"));
    calls.length = 0;

    card.hass = withReading(targetState("100", "in"), targetState("200", "in"));

    expect(clears(calls)).toBe(1);
    const painted = targets(calls);
    expect(painted).toHaveLength(1);
    expect(painted[0][0]).toBeCloseTo(inMillimeters[0]);
    expect(painted[0][1]).toBeCloseTo(inMillimeters[1]);
  });

  it("does not repaint for a new hass whose tracked units are unchanged", async () => {
    const { card, hass, calls } = await trackingCard();
    const inInches = {
      ...hass.states,
      "sensor.a_x": targetState("100", "in"),
      "sensor.a_y": targetState("200", "in"),
    };
    card.hass = { ...hass, states: inInches };
    calls.length = 0;

    // Fresh objects with equal states and units, as HA hands over on every push.
    card.hass = {
      ...hass,
      states: {
        ...inInches,
        "sensor.a_x": targetState("100", "in"),
        "sensor.kitchen_light": targetState("on"),
      },
    };

    expect(clears(calls)).toBe(0);
  });

  it("repaints when a zone's presence flips with no target movement", async () => {
    // A zone lights from its presence sensor, so a flip is a change to the
    // picture even when no target moved, and a held zone's label changes
    // with its held attribute.
    const presence = "binary_sensor.office_zone_1_presence";
    const hass = fakeHass({
      ...ZONE_PAYLOAD,
      zones: { "1": { ...ZONE_PAYLOAD.zones["1"], presence_entity_id: presence } },
    });
    const card = await mountCard(hass);
    let states: Record<string, any> = {
      "sensor.a_x": { state: "500" },
      "sensor.a_y": { state: "2000" },
      [presence]: { state: "off", attributes: {} },
    };
    card.hass = { ...hass, states };
    const { ctx, calls } = recordingContext();
    card.ctx = ctx;
    const sampled = vi.spyOn(card, "_onTargetsChanged");
    const push = (changes: Record<string, any>) => {
      states = { ...states, ...changes };
      card.hass = { ...hass, states };
    };

    push({ [presence]: { state: "on", attributes: {} } });
    expect(clears(calls)).toBe(1);
    // Only a target move is sampled.
    expect(sampled).not.toHaveBeenCalled();

    calls.length = 0;
    push({ [presence]: { state: "on", attributes: {} } });
    expect(clears(calls)).toBe(0);

    push({ [presence]: { state: "on", attributes: { held: true } } });
    expect(clears(calls)).toBe(1);

    push({ "sensor.a_x": { state: "600" } });
    expect(clears(calls)).toBe(2);
    expect(sampled).toHaveBeenCalledTimes(1);
  });
});

/**
 * The "Radar offline" note.
 *
 * While a radar is offline its target sensors read unavailable: the map has no
 * dots and every zone greys out, which on its own looks like an empty room. A
 * note over the map's top left corner says what is going on, by the rule zone
 * presence uses to go unavailable: some tracked sensor has a state, and every
 * one that has a state is unavailable. `unknown` is a live state.
 */
describe("zone map card offline radar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const UNAVAILABLE = { state: "unavailable" };

  async function offlineCard(payload: any = ZONE_PAYLOAD, config: Record<string, any> = {}) {
    const hass = fakeHass(payload);
    const card = await mountCard(hass, config);
    const push = (states: Record<string, any>) => {
      card.hass = { ...hass, states };
    };
    return { card, hass, push };
  }

  const note = (card: any) => card.shadowRoot.getElementById("offlineNote");

  it("shows Radar offline when every tracked target is unavailable", async () => {
    const { card, push } = await offlineCard();
    expect(note(card).hidden).toBe(true);
    expect(note(card).textContent).toBe("Radar offline");
    expect(note(card).getAttribute("role")).toBe("status");

    push({ "sensor.a_x": UNAVAILABLE, "sensor.a_y": UNAVAILABLE });

    expect(note(card).hidden).toBe(false);
    // A render rebuilds the map with the note still up.
    card.render();
    expect(note(card).hidden).toBe(false);
  });

  it("hides the note when the radar is back", async () => {
    const { card, push } = await offlineCard();
    push({ "sensor.a_x": UNAVAILABLE, "sensor.a_y": UNAVAILABLE });
    expect(note(card).hidden).toBe(false);

    push({ "sensor.a_x": { state: "0" }, "sensor.a_y": { state: "0" } });
    expect(note(card).hidden).toBe(true);

    // Half a radar is not an offline radar, and unknown is a state a live
    // sensor can be in.
    push({ "sensor.a_x": UNAVAILABLE, "sensor.a_y": { state: "unknown" } });
    expect(note(card).hidden).toBe(true);
  });

  it("keeps the note off with no tracked pairs", async () => {
    // Cleared on purpose: nothing is tracked, so nothing can be offline.
    const cleared = await offlineCard({ ...ZONE_PAYLOAD, entities: [], suggested_entities: [] });
    cleared.push({ "sensor.a_x": UNAVAILABLE, "sensor.a_y": UNAVAILABLE });
    expect(note(cleared.card).hidden).toBe(true);

    // Pairs whose sensors have no state at all say nothing either way.
    const missing = await offlineCard();
    missing.push({ "sensor.kitchen_light": UNAVAILABLE });
    expect(note(missing.card).hidden).toBe(true);
  });

  it("shows the note in view_only", async () => {
    // A wall tablet showing the map alone needs the note most of all.
    const { card, push } = await offlineCard(ZONE_PAYLOAD, { view_only: true });
    expect(note(card).hidden).toBe(true);

    push({ "sensor.a_x": UNAVAILABLE, "sensor.a_y": UNAVAILABLE });

    expect(note(card).hidden).toBe(false);
    expect(note(card).textContent).toBe("Radar offline");
    expect(note(card).getAttribute("role")).toBe("status");
    card.render();
    expect(note(card).hidden).toBe(false);

    push({ "sensor.a_x": { state: "500" }, "sensor.a_y": { state: "2000" } });
    expect(note(card).hidden).toBe(true);
  });

  it("follows a payload that tracks other pairs", async () => {
    const { card, hass, push } = await offlineCard();
    push({
      "sensor.a_x": UNAVAILABLE,
      "sensor.a_y": UNAVAILABLE,
      "sensor.b_x": { state: "500" },
      "sensor.b_y": { state: "2000" },
    });
    expect(note(card).hidden).toBe(false);

    hass.handlers[ZONES_SUBSCRIBE][0]({
      ...ZONE_PAYLOAD,
      entities: [{ x: "sensor.b_x", y: "sensor.b_y" }],
    });

    expect(note(card).hidden).toBe(true);
  });

  /** Every canvas laid out `cssWidth` CSS px wide, a render's new one too. */
  function layOutEveryCanvas(cssWidth: number) {
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLCanvasElement
    ) {
      const height = (cssWidth * this.height) / this.width;
      return {
        left: 0,
        top: 0,
        right: cssWidth,
        bottom: height,
        x: 0,
        y: 0,
        width: cssWidth,
        height,
        toJSON: () => ({}),
      } as DOMRect;
    });
  }

  /** Where the notes sit (--zm-note-top), and the x labels a frame draws. */
  function notesAndLabels(card: any) {
    const { ctx, texts } = textRecordingContext(browserTextWidth);
    card.ctx = ctx;
    card.drawGrid();
    const container = card.shadowRoot.querySelector(".canvas-container");
    // Centered on their lines, and never on a middle baseline as the ring
    // and range labels are.
    const xLabels = texts.filter(
      (t) => t.size === card.unitLabelSize && t.align === "center" && t.baseline !== "middle"
    );
    return { top: container.style.getPropertyValue("--zm-note-top"), xLabels };
  }

  it("keeps the notes below the x labels along the top of a fitted map", async () => {
    // A fitted map has the radar, and so the x labels' row, on its top edge,
    // where on a phone the notes sat over "-16 ft" and "16 ft".
    layOutEveryCanvas(326);
    const fitted = { ...ZONE_PAYLOAD, rotation_deg: 0, display_units: "ft" };
    const { card, push } = await offlineCard(fitted, { unit_display: true });
    push({ "sensor.a_x": UNAVAILABLE, "sensor.a_y": UNAVAILABLE });

    const { top, xLabels } = notesAndLabels(card);

    const scale = card._frameScale;
    expect(scale).toBeCloseTo(800 / 326, 9);
    // The row runs from 2 to 20 backing px down, about 8 CSS px, and the
    // notes go 4 CSS px below it.
    expect(xLabels.length).toBeGreaterThan(2);
    expect(xLabels.every((t) => t.y === 2 && t.baseline === "top")).toBe(true);
    expect(top).toBe(`${4 + Math.ceil(20 / scale)}px`);
    expect(parseFloat(top)).toBeGreaterThanOrEqual(4 + 20 / scale);
    // Both notes take it: the Replay badge is a .map-note too.
    const css = card.shadowRoot.querySelector("style").textContent;
    expect(css).toMatch(/\.map-note \{ position: absolute; top: var\(--zm-note-top, 4px\);/);
    expect(card.shadowRoot.getElementById("replayBadge").classList.contains("map-note")).toBe(true);

    // A render brings a new container, which gets it too.
    card.render();
    const container = card.shadowRoot.querySelector(".canvas-container");
    expect(container.style.getPropertyValue("--zm-note-top")).toBe(top);
    expect(note(card).hidden).toBe(false);

    // So does a view-only map.
    const viewOnly = await offlineCard(fitted, { unit_display: true, view_only: true });
    expect(notesAndLabels(viewOnly.card).top).toBe(top);
    expect(viewOnly.card.shadowRoot.querySelector("style").textContent).toMatch(
      /\.map-note \{ position: absolute; top: var\(--zm-note-top, 4px\);/
    );
  });

  it("keeps the notes at the top while the x labels are further down", async () => {
    // A YAML grid whose y = 0 is in the middle draws the x labels' row just
    // above it, on a bottom baseline, clear of the notes.
    layOutEveryCanvas(326);
    const middle = await offlineCard(ZONE_PAYLOAD, {
      unit_display: true,
      grid: { x_min: -5000, x_max: 5000, y_min: -5000, y_max: 5000 },
    });
    const centered = notesAndLabels(middle.card);
    expect(centered.xLabels.length).toBeGreaterThan(2);
    expect(centered.xLabels.every((t) => t.y === 398 && t.baseline === "bottom")).toBe(true);
    expect(centered.top).toBe("4px");

    // Half a meter below the top, the same row runs under the notes, so
    // they go below it.
    const near = await offlineCard(ZONE_PAYLOAD, {
      unit_display: true,
      grid: { x_min: -5000, x_max: 5000, y_min: -500, y_max: 9500 },
    });
    const high = notesAndLabels(near.card);
    expect(high.xLabels.every((t) => t.y === 38 && t.baseline === "bottom")).toBe(true);
    expect(high.top).toBe(`${4 + Math.ceil(38 / near.card._frameScale)}px`);
  });
});

/**
 * Trails behind the live dots.
 *
 * Each target leaves about 3 s of fading trail, kept in the card element's
 * memory only. A hass push paints the newest point. Between pushes a fade
 * timer repaints about ten times a second, only while the card is on the page
 * and something is left to fade, and never right after a push painted. The
 * clock is faked, performance.now() included, so each test moves time itself.
 * Facing ahead on the 10 m grid, a target at (-2000, 2000) mm is drawn at
 * canvas (240, 160).
 */
describe("zone map card trails", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  /** Tracking the payload's detected pair, with `move` setting its reading
   *  in one push and `set` writing any of its states on its own. */
  async function trailCard(payload: any = { ...ZONE_PAYLOAD, rotation_deg: 0 }) {
    vi.useFakeTimers();
    const hass = fakeHass(payload);
    const card = await mountCard(hass, TEN_METER_GRID);
    let states: Record<string, any> = {};
    const set = (changes: Record<string, any>) => {
      states = { ...states, ...changes };
      card.hass = { ...hass, states };
    };
    const move = (x: number, y: number) =>
      set({ "sensor.a_x": { state: String(x) }, "sensor.a_y": { state: String(y) } });
    return { card, hass, move, set };
  }

  /** A target state as the LD2450 reads on a US customary install: inches
   *  with one decimal, or a state such as "unknown". */
  const inch = (value: number | string) => ({
    state: typeof value === "number" ? value.toFixed(1) : value,
    attributes: { unit_of_measurement: "in" },
  });

  /**
   * Target a walking through `steps`, [x, y] in mm, at the cadence an R
   * PRO-1 on firmware 26.10.21.1 reports: each step's X, its Y 450 ms later,
   * and the next X 620 ms after that.
   */
  function walkSplit(set: (changes: Record<string, any>) => void, steps: number[][]) {
    steps.forEach(([x, y], i) => {
      if (i > 0) vi.advanceTimersByTime(620);
      set({ "sensor.a_x": { state: String(x) } });
      vi.advanceTimersByTime(450);
      set({ "sensor.a_y": { state: String(y) } });
    });
  }

  /** The counted coverage cells as [ix, iy, count], sorted. */
  function cells(card: any): number[][] {
    return Array.from(card._coverage.entries() as Iterable<number[]>)
      .map((cell) => [...cell])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  /**
   * Each trail segment stroked in `color`: [x1, y1, x2, y2, alpha, width].
   * A segment is one moveTo and one lineTo; a dot's ring, also stroked in
   * its color, is an arc.
   */
  function segments(draws: Draw[], color = "#f44336"): number[][] {
    const out: number[][] = [];
    let path: Draw[] = [];
    for (const draw of draws) {
      if (draw.name === "beginPath") path = [];
      else if (draw.name !== "stroke") path.push(draw);
      else if (draw.stroke === color && path.map((d) => d.name).join() === "moveTo,lineTo") {
        const [from, to] = path.map((d) => d.args);
        out.push([...from, ...to, draw.alpha as number, draw.lineWidth as number]);
      }
    }
    return out;
  }

  /** Where in `draws` the last trail segment in `color` was stroked. */
  function lastSegmentAt(draws: Draw[], color = "#f44336"): number {
    let at = -1;
    draws.forEach((draw, i) => {
      const segment = draws[i - 1]?.name === "lineTo";
      if (draw.name === "stroke" && draw.stroke === color && segment) at = i;
    });
    return at;
  }

  function frame(card: any): Draw[] {
    const { ctx, draws } = drawRecordingContext();
    card.ctx = ctx;
    card.drawGrid();
    return draws;
  }

  /** A segment's [alpha, width] when its newer end is `ageMs` old. */
  function strength(ageMs: number): number[] {
    const f = Math.max(0.08, 1 - ageMs / 3000);
    return [0.6 * f, 1.5 + 2.5 * f];
  }

  function expectSegments(actual: number[][], expected: number[][]) {
    expect(actual).toHaveLength(expected.length);
    actual.forEach((segment, i) => {
      expect(segment.slice(0, 4)).toEqual(expected[i].slice(0, 4));
      expect(segment[4]).toBeCloseTo(expected[i][4], 9);
      expect(segment[5]).toBeCloseTo(expected[i][5], 9);
    });
  }

  it("keeps a trail behind a moving target", async () => {
    const { card, move } = await trailCard();
    move(-2000, 2000);
    vi.advanceTimersByTime(200);
    move(-1000, 2000);
    vi.advanceTimersByTime(200);
    move(0, 2000);

    // The newest segment strongest and widest, under the dot it leads to.
    const draws = frame(card);
    expectSegments(segments(draws), [
      [240, 160, 320, 160, ...strength(200)],
      [320, 160, 400, 160, ...strength(0)],
    ]);
    const dot = draws.findIndex((d) => d.name === "fill" && d.fill === "#f44336");
    expect(dot).toBeGreaterThan(lastSegmentAt(draws));

    // With no push for a second and a half, the same segments are fainter
    // and thinner.
    vi.advanceTimersByTime(1500);
    expectSegments(segments(frame(card)), [
      [240, 160, 320, 160, ...strength(1700)],
      [320, 160, 400, 160, ...strength(1500)],
    ]);
  });

  it("breaks the trail where its target went silent for over 2.5 s", async () => {
    const { card, move } = await trailCard();
    move(-2000, 2000);
    vi.advanceTimersByTime(2600);
    move(-1000, 2000);
    vi.advanceTimersByTime(200);
    move(0, 2000);

    expectSegments(segments(frame(card)), [[320, 160, 400, 160, ...strength(0)]]);
  });

  it("joins readings about a second apart when X and Y come together", async () => {
    // The LD2450 sometimes writes X and Y in the same instant, each about
    // every 1.07 s.
    const { card, move } = await trailCard();
    move(-2000, 2000);
    vi.advanceTimersByTime(1070);
    move(-1500, 2500);
    expectSegments(segments(frame(card)), [[240, 160, 280, 200, ...strength(0)]]);

    // A value that repeats writes nothing, so the next reading can come
    // 2.14 s later.
    vi.advanceTimersByTime(2140);
    move(-1000, 3000);
    expectSegments(segments(frame(card)), [[280, 200, 320, 240, ...strength(0)]]);
  });

  it("counts a silence from the last write merged into a sample", async () => {
    const { card, move, set } = await trailCard();
    move(-2000, 2000);
    vi.advanceTimersByTime(1000);
    set({ "sensor.a_x": { state: "-1500" } });
    vi.advanceTimersByTime(450);
    set({ "sensor.a_y": { state: "2500" } });
    // 2.95 s after that sample's X, but 2.5 s after its Y: one silence.
    vi.advanceTimersByTime(2500);
    move(-1000, 3000);

    expectSegments(segments(frame(card)), [[280, 200, 320, 240, ...strength(0)]]);
  });

  it("draws a diagonal walk at the measured cadence with no (new X, old Y) sample or cell", async () => {
    const { card, set } = await trailCard();
    // On the page, so fade frames take final samples between the writes.
    document.body.appendChild(card);
    set({ "sensor.a_x": inch("unknown"), "sensor.a_y": inch("unknown") });
    // About 0.7 m/s along a diagonal, in inches: X every 1070 ms, its Y
    // 450 ms after it, as an R PRO-1 on firmware 26.10.21.1 reports.
    const steps = Array.from({ length: 8 }, (_, k) => [-90 + 20 * k, 40 + 20 * k]);
    const mm = ([x, y]: number[]) => [parseFloat(x.toFixed(1)) * 25.4, parseFloat(y.toFixed(1)) * 25.4];
    const reported = steps.map((step) => mm(step).map(Math.round).join());
    const strays: string[] = [];
    let samples = 0;
    steps.forEach(([x, y], k) => {
      if (k > 0) vi.advanceTimersByTime(620);
      set({ "sensor.a_x": inch(x) });
      vi.advanceTimersByTime(450);
      set({ "sensor.a_y": inch(y) });
      // Once its Y is in, every sample is a position the radar reported.
      card._trails.samples(0).forEach((s: any) => {
        const at = [s.x, s.y].map(Math.round).join();
        if (!reported.includes(at)) strays.push(at);
      });
      samples = Math.max(samples, card._trails.samples(0).length);
    });
    vi.advanceTimersByTime(1000);

    expect(strays).toEqual([]);
    // One sample a step: the last 3 s hold three.
    expect(samples).toBe(3);
    // One count in each step's cell, and none in any other.
    const expected = steps.map((step) => {
      const [x, y] = mm(step);
      return [Math.floor(x / 200), Math.floor(y / 200), 1];
    });
    expect(cells(card)).toEqual(expected.sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  });

  it("still draws trail segments when Y lands 450 ms after X", async () => {
    const { card, set } = await trailCard();
    // Each sample is timed from its X, 1070 ms after the one before, but the
    // radar went silent for only 620 ms, from the Y before.
    walkSplit(set, [
      [-2000, 2000],
      [-1500, 2500],
      [-1000, 3000],
    ]);

    // Straight from one reported position to the next: (-1500, 2000), where
    // nobody stood, is in no segment.
    expectSegments(segments(frame(card)), [
      [240, 160, 280, 200, ...strength(1520)],
      [280, 200, 320, 240, ...strength(450)],
    ]);
  });

  it("draws no line from y = 0 for a target that appears X first in a slot that read 0/0", async () => {
    const { card, set } = await trailCard();
    document.body.appendChild(card);
    // Firmware that empties a slot as (0, 0), which is no target. The
    // target appears X first, so the card first reads (-1500, 0).
    set({ "sensor.a_x": { state: "0" }, "sensor.a_y": { state: "0" } });
    vi.advanceTimersByTime(1000);
    walkSplit(set, [
      [-1500, 3000],
      [-1000, 3500],
    ]);

    expectSegments(segments(frame(card)), [[280, 240, 320, 280, ...strength(450)]]);
    vi.advanceTimersByTime(1000);
    expect(card._trails.samples(0).map((s: any) => [s.x, s.y])).toEqual([
      [-1500, 3000],
      [-1000, 3500],
    ]);
    expect(cells(card)).toEqual([
      [-8, 15, 1],
      [-5, 17, 1],
    ]);
  });

  it("ends the trail at the last reading when X and Y turn unknown", async () => {
    const { card, set } = await trailCard();
    document.body.appendChild(card);
    walkSplit(set, [
      [-2000, 2000],
      [-1500, 2500],
      [-1000, 3000],
    ]);
    vi.advanceTimersByTime(300);
    // Firmware 26.10.21.1 loses a target as unknown on both axes at once.
    set({ "sensor.a_x": { state: "unknown" }, "sensor.a_y": { state: "unknown" } });

    // No dot now, and the trail runs straight to where it was last seen.
    const draws = frame(card);
    expect(draws.filter((d) => d.name === "fill" && d.fill === "#f44336")).toEqual([]);
    expectSegments(segments(draws), [
      [240, 160, 280, 200, ...strength(1820)],
      [280, 200, 320, 240, ...strength(750)],
    ]);
    vi.advanceTimersByTime(1000);
    expect(cells(card)).toEqual([
      [-10, 10, 1],
      [-8, 12, 1],
      [-5, 15, 1],
    ]);
  });

  it("takes back the (new X, old Y) point of a target lost between its X and its Y", async () => {
    const { card, set } = await trailCard();
    document.body.appendChild(card);
    walkSplit(set, [
      [-2000, 2000],
      [-1500, 2500],
      [-1000, 3000],
    ]);
    // The next step's X, and 200 ms later, before its Y, the radar loses
    // the target: unknown on both axes at once.
    vi.advanceTimersByTime(620);
    set({ "sensor.a_x": { state: "-500" } });
    vi.advanceTimersByTime(200);
    set({ "sensor.a_x": { state: "unknown" }, "sensor.a_y": { state: "unknown" } });

    // The trail ends at (-1000, 3000), the last position the radar reported
    // whole, and (-500, 3000), where nobody stood, is in no segment or cell.
    expectSegments(segments(frame(card)), [
      [240, 160, 280, 200, ...strength(2340)],
      [280, 200, 320, 240, ...strength(1270)],
    ]);
    vi.advanceTimersByTime(1000);
    expect(cells(card)).toEqual([
      [-10, 10, 1],
      [-8, 12, 1],
      [-5, 15, 1],
    ]);
  });

  it("does not join a target that vanished and came back within a second", async () => {
    const { card, move, set } = await trailCard();
    move(-2000, 2000);
    vi.advanceTimersByTime(200);
    move(-1000, 2500);
    vi.advanceTimersByTime(200);
    set({ "sensor.a_x": { state: "unknown" }, "sensor.a_y": { state: "unknown" } });
    // Back 0.5 s later on the other side of the room.
    vi.advanceTimersByTime(500);
    move(2000, 4000);
    vi.advanceTimersByTime(200);
    move(2500, 4000);

    expectSegments(segments(frame(card)), [
      [240, 160, 320, 200, ...strength(900)],
      [560, 320, 600, 320, ...strength(0)],
    ]);
  });

  it("draws the trail grey while its target stands in an ignore zone", async () => {
    const fan = {
      shape: "rect",
      data: { x_min: -500, x_max: 500, y_min: 1000, y_max: 3000 },
      zone_type: "ignore",
    };
    const { card, move } = await trailCard({
      ...ZONE_PAYLOAD,
      rotation_deg: 0,
      zones: { "2": fan },
    });
    move(-2000, 2000);
    vi.advanceTimersByTime(200);
    move(0, 2000);

    // The whole trail follows where the target is now.
    let draws = frame(card);
    expect(segments(draws)).toEqual([]);
    expect(segments(draws, "#757575")).toHaveLength(1);

    vi.advanceTimersByTime(200);
    move(2000, 2000);
    draws = frame(card);
    expect(segments(draws, "#757575")).toEqual([]);
    expect(segments(draws)).toHaveLength(2);
  });

  it("fades the trail on a timer only while the card is connected", async () => {
    const { card, move } = await trailCard();
    move(-2000, 2000);
    vi.advanceTimersByTime(200);
    move(-1000, 2000);
    const draw = vi.spyOn(card, "drawGrid");

    // Off the page nothing repaints between pushes.
    vi.advanceTimersByTime(1000);
    expect(draw).not.toHaveBeenCalled();

    // On the page, a frame every 100 ms...
    document.body.appendChild(card);
    vi.advanceTimersByTime(100);
    expect(draw).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(draw).toHaveBeenCalledTimes(2);

    // ...until the older sample is 3 s old. That frame paints the trail away
    // and is the last: frames ran from 1.3 s to 3.0 s after the first sample.
    vi.advanceTimersByTime(5000);
    expect(draw).toHaveBeenCalledTimes(18);
    expect(card._trails.hasTrail(performance.now())).toBe(false);
  });

  it("the fade timer skips a frame a hass push just painted", async () => {
    const { card, move } = await trailCard();
    document.body.appendChild(card);
    move(-2000, 2000);
    vi.advanceTimersByTime(200);
    // A trail now, so a fade frame is due 100 ms after this push.
    move(-1000, 2000);
    const draw = vi.spyOn(card, "drawGrid");

    vi.advanceTimersByTime(60);
    move(-500, 2000);
    expect(draw).toHaveBeenCalledTimes(1);
    // One fade timer at a time: the push did not start a second one.
    expect(vi.getTimerCount()).toBe(1);

    // Due, but the push painted 40 ms ago, so the frame waits out the rest.
    vi.advanceTimersByTime(40);
    expect(draw).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(59);
    expect(draw).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(draw).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(100);
    expect(draw).toHaveBeenCalledTimes(3);
  });

  it("restarts the fade timer after a render", async () => {
    const { card, move } = await trailCard();
    document.body.appendChild(card);
    move(-2000, 2000);
    vi.advanceTimersByTime(200);
    move(-1000, 2000);
    vi.advanceTimersByTime(50);

    // A theme flip renders the card again: a new canvas, painted at once.
    card.render();
    const draw = vi.spyOn(card, "drawGrid");

    // The frame that was due went with the old canvas...
    vi.advanceTimersByTime(50);
    expect(draw).not.toHaveBeenCalled();
    // ...and the trail fades on, a frame after the render painted.
    vi.advanceTimersByTime(50);
    expect(draw).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("stops the fade timer on disconnect", async () => {
    const { card, move } = await trailCard();
    document.body.appendChild(card);
    move(-2000, 2000);
    vi.advanceTimersByTime(200);
    move(-1000, 2000);
    const draw = vi.spyOn(card, "drawGrid");

    card.remove();
    vi.advanceTimersByTime(1000);
    expect(draw).not.toHaveBeenCalled();

    // Back on the page, the trail fades on from where it got to.
    document.body.appendChild(card);
    vi.advanceTimersByTime(100);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  /**
   * A still target as the bench object near an R PRO-1 reads, for `steps`
   * of 1070 ms: X wandering over about 15 cm and Y over about 10 cm, in
   * inches, each axis written about once a second, the Y 450 ms after the
   * X. Returns how many pushes it made.
   */
  function jitter(set: (changes: Record<string, any>) => void, steps: number) {
    const xs = [-5.0, -2.4, -8.5, -4.1, -6.3, -3.0];
    const ys = [13.5, 11.6, 15.7, 12.2, 14.8, 13.0];
    for (let step = 0; step < steps; step += 1) {
      set({ "sensor.a_x": inch(xs[step % xs.length]) });
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(450);
      set({ "sensor.a_y": inch(ys[step % ys.length]) });
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(620);
    }
    return 2 * steps;
  }

  it("paints a still jittering target once per push", async () => {
    const { card, set } = await trailCard();
    document.body.appendChild(card);
    set({ "sensor.a_x": inch("unknown"), "sensor.a_y": inch("unknown") });
    const draw = vi.spyOn(card, "drawGrid");

    // A minute of it. Its trail stays under its own dot's halo, so no fade
    // frame runs or waits: each push paints once, and nothing else does.
    const pushes = jitter(set, 56);

    expect(draw).toHaveBeenCalledTimes(pushes);
    expect(card._trails.hasTrail(performance.now())).toBe(true);
  });

  it("fades a lost still target's scribble away", async () => {
    const { card, set } = await trailCard();
    document.body.appendChild(card);
    set({ "sensor.a_x": inch("unknown"), "sensor.a_y": inch("unknown") });
    jitter(set, 10);
    expect(segments(frame(card)).length).toBeGreaterThan(0);

    // Lost, as unknown on both axes at once: no dot covers the trail now.
    set({ "sensor.a_x": inch("unknown"), "sensor.a_y": inch("unknown") });
    const draw = vi.spyOn(card, "drawGrid");
    vi.advanceTimersByTime(100);
    expect(draw).toHaveBeenCalledTimes(1);

    // Frames run until the trail is gone, and the last one paints it away.
    vi.advanceTimersByTime(3000);
    expect(card._trails.samples(0).length).toBeLessThan(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(segments(frame(card))).toEqual([]);
  });

  it("keeps fading a walker's trail", async () => {
    const { card, set } = await trailCard();
    document.body.appendChild(card);
    const draw = vi.spyOn(card, "drawGrid");
    const start = performance.now();

    // 1 m/s across the room, written at the radar's split cadence.
    walkSplit(
      set,
      Array.from({ length: 8 }, (_, k) => [-4000 + 1000 * k, 2000 + 300 * k])
    );

    // A fade frame every 100 ms between the pushes, which paint too.
    const perSecond = draw.mock.calls.length / ((performance.now() - start) / 1000);
    expect(perSecond).toBeGreaterThan(9);
    expect(perSecond).toBeLessThanOrEqual(11);
  });

  it("reads the canvas layout once a frame", async () => {
    const card = await mountCard(fakeHass({ ...ZONE_PAYLOAD, rotation_deg: 0 }), {
      ...TEN_METER_GRID,
      unit_display: true,
    });
    layOut(card, 326);
    const rect = card.canvas.getBoundingClientRect;
    rect.mockClear();

    // The grid labels and the range label keep their gap at the frame's
    // scale, read at the top of the frame.
    card.drawGrid();
    card.drawGrid();
    expect(rect).toHaveBeenCalledTimes(2);
    expect(card._getGridRenderState().labelGap).toBeCloseTo(4 * (800 / 326), 9);
  });

  it("drops trails when the tracked pairs change", async () => {
    const { card, hass, move } = await trailCard();
    move(-2000, 2000);
    vi.advanceTimersByTime(200);
    move(-1000, 2000);
    vi.advanceTimersByTime(200);
    move(0, 2000);
    expect(card._trails.slots()).toEqual([0]);
    expect(card._coverage.size).toBe(2);

    // A payload that keeps the pairs keeps the trails.
    hass.handlers[ZONES_SUBSCRIBE][0]({ ...ZONE_PAYLOAD, rotation_deg: 5 });
    expect(card._trails.samples(0)).toHaveLength(3);

    // Slot 0 of another pair list is another target.
    hass.handlers[ZONES_SUBSCRIBE][0]({
      ...ZONE_PAYLOAD,
      rotation_deg: 0,
      entities: [{ x: "sensor.b_x", y: "sensor.b_y" }],
    });
    expect(card._trails.slots()).toEqual([]);
    expect(segments(frame(card))).toEqual([]);
    // Coverage cells are places in the room, not slots, so they stay.
    expect(card._coverage.size).toBe(2);
  });

  it("does not repaint a live move while a replay is showing", async () => {
    const { card, move } = await trailCard();
    document.body.appendChild(card);
    move(-2000, 2000);
    vi.advanceTimersByTime(200);
    const replay = vi.spyOn(card, "_replayShowing").mockReturnValue(true);
    const { ctx, calls } = recordingContext();
    card.ctx = ctx;

    move(-1000, 2000);
    vi.advanceTimersByTime(1000);

    // No paint from the push or from a fade frame, but the move is kept for
    // when the live map comes back.
    expect(calls.filter(([name]) => name === "clearRect")).toEqual([]);
    expect(card._trails.samples(0).map((s: any) => s.x)).toEqual([-2000, -1000]);

    replay.mockReturnValue(false);
    move(0, 2000);
    expect(calls.filter(([name]) => name === "clearRect")).toHaveLength(1);
  });
});

/**
 * Coverage paint.
 *
 * Every live position since the page opened is counted in 200 mm cells,
 * whether or not the paint is shown, and a viewer's Coverage chip paints the
 * cells under everything else on the map, at an alpha that grows with the
 * log of the count. A position counts once it is final, so the in-between
 * point of a split X and Y update never paints. The toggle is remembered per
 * radar in this browser; the cells are page memory.
 */
describe("zone map card coverage", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  const ORANGE = "rgba(255, 152, 0, ";

  async function coverageCard(
    config: Record<string, any> = {},
    payload: any = { ...ZONE_PAYLOAD, rotation_deg: 0 }
  ) {
    vi.useFakeTimers();
    const hass = fakeHass(payload);
    const card = await mountCard(hass, { ...TEN_METER_GRID, ...config });
    let states: Record<string, any> = {};
    const set = (changes: Record<string, any>) => {
      states = { ...states, ...changes };
      card.hass = { ...hass, states };
    };
    const move = (x: number, y: number) =>
      set({ "sensor.a_x": { state: String(x) }, "sensor.a_y": { state: String(y) } });
    /** Three positions 200 ms apart, the last moving both coordinates, so
     *  none is the second write of a split update. The first two are final
     *  by the third. */
    const walk = () => {
      move(-2000, 2000);
      vi.advanceTimersByTime(200);
      move(-1000, 2000);
      vi.advanceTimersByTime(200);
      move(-800, 2200);
    };
    return { card, hass, set, move, walk };
  }

  /** The counted cells as [ix, iy, count], sorted. */
  function cells(card: any): number[][] {
    return Array.from(card._coverage.entries() as Iterable<number[]>)
      .map((cell) => [...cell])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  function frame(card: any): Draw[] {
    const { ctx, draws } = drawRecordingContext();
    card.ctx = ctx;
    card.drawGrid();
    return draws;
  }

  const coverageFills = (draws: Draw[]) =>
    draws.filter((d) => d.name === "fill" && String(d.fill).startsWith(ORANGE));

  const chip = (card: any) => card.shadowRoot.getElementById("btnCoverage");
  const clearChip = (card: any) => card.shadowRoot.getElementById("btnCoverageClear");

  it("paints coverage under the zones and before the grid labels", async () => {
    const { card, walk } = await coverageCard({ unit_display: true });
    chip(card).click();
    walk();

    const draws = frame(card);

    // One count in each of two cells: both at the strongest alpha, in one
    // fill, inside its own save and restore.
    const fills = coverageFills(draws);
    expect(fills.map((d) => [d.fill, d.depth])).toEqual([["rgba(255, 152, 0, 0.5)", 1]]);
    const at = draws.indexOf(fills[0]);
    // Right after the clear: no grid line, label, cone or zone before it.
    expect([...new Set(draws.slice(0, at).map((d) => d.name))]).toEqual([
      "clearRect",
      "save",
      "beginPath",
      "moveTo",
      "lineTo",
      "closePath",
    ]);
    expect(draws.findIndex((d) => d.name === "fillText")).toBeGreaterThan(at);
    expect(draws.findIndex((d) => d.name === "fillRect")).toBeGreaterThan(at);
    // Each cell a square of its four corners: (-2000, 2000) to (-1800, 2200)
    // mm is canvas (240, 160) to (256, 176).
    const quads = draws
      .slice(0, at)
      .filter((d) => d.name === "moveTo" || d.name === "lineTo")
      .map((d) => d.args);
    expect(quads).toEqual([
      [240, 160],
      [256, 160],
      [256, 176],
      [240, 176],
      [320, 160],
      [336, 160],
      [336, 176],
      [320, 176],
    ]);
  });

  it("turns and flips the cells with the map", async () => {
    // Rotated 90 degrees, (-2000, 2000) mm in the radar's frame is (2000,
    // 2000) on the map; flipped, x runs from 5000 on the left.
    const { card, move } = await coverageCard(
      {},
      { ...ZONE_PAYLOAD, rotation_deg: 90, mirror_x: true }
    );
    chip(card).click();
    move(-2000, 2000);
    vi.advanceTimersByTime(200);
    move(0, 0);

    const draws = frame(card);
    const at = draws.indexOf(coverageFills(draws)[0]);
    const corners = draws
      .slice(0, at)
      .filter((d) => d.name === "moveTo" || d.name === "lineTo")
      .map((d) => d.args);
    const expected = [
      [240, 160],
      [240, 144],
      [224, 144],
      [224, 160],
    ];
    expect(corners).toHaveLength(4);
    corners.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(expected[i][0], 6);
      expect(y).toBeCloseTo(expected[i][1], 6);
    });
  });

  it("Clear coverage empties the cells", async () => {
    const { card, walk } = await coverageCard();
    chip(card).click();
    walk();
    expect(cells(card)).toHaveLength(2);
    expect(clearChip(card).hidden).toBe(false);

    clearChip(card).click();

    expect(cells(card)).toEqual([]);
    expect(coverageFills(frame(card))).toEqual([]);
    // Still on, and counting again from here.
    expect(card._coverageOn).toBe(true);
  });

  it("remembers the toggle per radar in this browser", async () => {
    const { card } = await coverageCard();
    expect(card._coverageOn).toBe(false);

    chip(card).click();
    expect(window.localStorage.getItem("apollo-mmwave.zone-map.coverage.dev123")).toBe("1");

    // Another card for this radar, as after a reload, starts with it on.
    const again = await mountCard(fakeHass(), TEN_METER_GRID);
    expect(again._coverageOn).toBe(true);
    expect(chip(again).getAttribute("aria-pressed")).toBe("true");
    // Another radar's map does not.
    const other = await mountCard(fakeHass(), { device_id: "devB" });
    expect(other._coverageOn).toBe(false);

    // A card pointed at another radar takes that radar's toggle, and back.
    again.setConfig({ device_id: "devB", ...TEN_METER_GRID });
    expect(again._coverageOn).toBe(false);
    expect(chip(again).getAttribute("aria-pressed")).toBe("false");
    again.setConfig({ device_id: "dev123", ...TEN_METER_GRID });
    expect(again._coverageOn).toBe(true);

    // Off is remembered too.
    chip(again).click();
    expect(window.localStorage.getItem("apollo-mmwave.zone-map.coverage.dev123")).toBe("0");
    expect((await mountCard(fakeHass(), TEN_METER_GRID))._coverageOn).toBe(false);
  });

  it("accumulates while off", async () => {
    const { card, walk } = await coverageCard();
    expect(card._coverageOn).toBe(false);

    walk();

    // Counted, the newest not yet, since it can still be replaced.
    expect(cells(card)).toEqual([
      [-10, 10, 1],
      [-5, 10, 1],
    ]);
    expect(coverageFills(frame(card))).toEqual([]);

    // Turning it on shows everything since the page opened.
    chip(card).click();
    expect(coverageFills(frame(card))).toHaveLength(1);
  });

  it("counts a split X and Y update once, at its final position", async () => {
    const { card, set, move } = await coverageCard();
    // On the page, so the fade frames take final samples between pushes.
    document.body.appendChild(card);
    move(-2000, 2000);
    vi.advanceTimersByTime(200);

    // Home Assistant writes a move as two state changes, X first, and the
    // LD2450 often writes the Y about 450 ms after the X.
    set({ "sensor.a_x": { state: "-1000" } });
    vi.advanceTimersByTime(450);
    set({ "sensor.a_y": { state: "3000" } });
    vi.advanceTimersByTime(1000);

    // (-1000, 2000), where nobody stood, is in no cell.
    expect(cells(card)).toEqual([
      [-10, 10, 1],
      [-5, 15, 1],
    ]);
  });

  it("keeps the first write of a vanish out of the trail and the cells", async () => {
    const { card, set, move } = await coverageCard();
    document.body.appendChild(card);
    move(-2000, 2000);
    vi.advanceTimersByTime(200);
    move(-1000, 2000);
    vi.advanceTimersByTime(200);

    // The target leaves, and its X turns 0 about 450 ms before its Y does.
    // (0, 2000) is a point nobody stood at: a real move to x = 0 is
    // followed by more readings, not by an empty slot.
    set({ "sensor.a_x": { state: "0" } });
    vi.advanceTimersByTime(450);
    set({ "sensor.a_y": { state: "0" } });
    vi.advanceTimersByTime(1000);

    expect(card._trails.samples(0).map((s: any) => [s.x, s.y])).toEqual([
      [-2000, 2000],
      [-1000, 2000],
    ]);
    expect(cells(card)).toEqual([
      [-10, 10, 1],
      [-5, 10, 1],
    ]);

    // A target that stops at x = 0 is a real position, and counts.
    move(1000, 3000);
    vi.advanceTimersByTime(200);
    move(0, 3000);
    vi.advanceTimersByTime(1000);
    expect(cells(card)).toContainEqual([0, 15, 1]);
  });

  it("counts a still target once while another one moves", async () => {
    // Every push carries both pairs' states, but only the target that moved
    // is sampled: the still one would otherwise be counted again for each
    // move the other made, and its cell would outshine the whole walk.
    const pairs = [
      { x: "sensor.a_x", y: "sensor.a_y" },
      { x: "sensor.b_x", y: "sensor.b_y" },
    ];
    const { card, set, move } = await coverageCard(
      {},
      { ...ZONE_PAYLOAD, rotation_deg: 0, entities: pairs }
    );
    set({ "sensor.b_x": { state: "2000" }, "sensor.b_y": { state: "4000" } });
    for (let step = 0; step < 5; step += 1) {
      vi.advanceTimersByTime(200);
      move(-2000 + 200 * step, 2000);
    }
    vi.advanceTimersByTime(200);
    move(0, 2000);

    expect(card._trails.samples(1)).toHaveLength(1);
    expect(cells(card)).toEqual([
      [-10, 10, 1],
      [-9, 10, 1],
      [-8, 10, 1],
      [-7, 10, 1],
      [-6, 10, 1],
      [10, 20, 1],
    ]);
  });

  it("counts targets in ignore zones, which show where the ghosts are", async () => {
    const fan = {
      shape: "rect",
      data: { x_min: -3000, x_max: -500, y_min: 1000, y_max: 3000 },
      zone_type: "ignore",
    };
    const { card, walk } = await coverageCard(
      {},
      { ...ZONE_PAYLOAD, rotation_deg: 0, zones: { "2": fan } }
    );

    walk();

    expect(cells(card)).toEqual([
      [-10, 10, 1],
      [-5, 10, 1],
    ]);
  });

  it("marks the Coverage chip pressed", async () => {
    const { card } = await coverageCard();
    expect(chip(card).textContent).toBe("Coverage");
    expect(chip(card).title).toBe(
      "Paint where targets have been since this page opened (this browser only)"
    );
    expect(chip(card).classList.contains("zone-btn")).toBe(true);
    expect(chip(card).getAttribute("aria-pressed")).toBe("false");
    expect(chip(card).classList.contains("active")).toBe(false);
    expect(clearChip(card).hidden).toBe(true);

    chip(card).click();
    expect(chip(card).getAttribute("aria-pressed")).toBe("true");
    expect(chip(card).classList.contains("active")).toBe(true);
    expect(clearChip(card).hidden).toBe(false);
    expect(clearChip(card).textContent).toBe("Clear coverage");

    // A render (a theme flip) rebuilds the chips as they were.
    card.render();
    expect(chip(card).getAttribute("aria-pressed")).toBe("true");
    expect(clearChip(card).hidden).toBe(false);

    chip(card).click();
    expect(chip(card).getAttribute("aria-pressed")).toBe("false");
    expect(chip(card).classList.contains("active")).toBe(false);
    expect(clearChip(card).hidden).toBe(true);
  });

  it("shows no coverage controls in view_only", async () => {
    // Even with the toggle remembered on for this radar.
    window.localStorage.setItem("apollo-mmwave.zone-map.coverage.dev123", "1");
    const { card, walk } = await coverageCard({ view_only: true });

    expect(card.shadowRoot.getElementById("viewTools")).toBeNull();
    expect(chip(card)).toBeNull();
    expect(clearChip(card)).toBeNull();

    walk();

    // Nothing counted and nothing painted. The trail still shows.
    expect(cells(card)).toEqual([]);
    const draws = frame(card);
    expect(coverageFills(draws)).toEqual([]);
    expect(draws.filter((d) => d.name === "stroke" && d.stroke === "#f44336")).toHaveLength(2);
  });
});

/**
 * Gestures that carry no shape.
 *
 * The backend keeps a rect only when x_min < x_max and y_min < y_max, and for
 * anything else it stores data: null, which wipes the zone. A click, a tap or
 * a perfectly straight drag in rect mode used to send exactly that and then
 * toast "saved". A canvas with no layout box (a hidden tab, a collapsed
 * container) divided by zero, pinned every shape to the grid corner and gave
 * an ellipse NaN radii, with the same wipe and the same toast. None of these
 * may reach the store. The canvas is laid out at 800x800 CSS px over the
 * 800x800 bitmap unless a test collapses it.
 */
describe("zone map card gestures without a shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function box(width: number, height: number): DOMRect {
    return {
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect;
  }

  /** Unlocked on ZONE_PAYLOAD with zone 1 (Doorway, a 0..1000 rect) selected. */
  async function drawingCard(mode: string, width = 800, height = 800) {
    const hass = fakeHass();
    const card = await mountCard(hass, TEN_METER_GRID);
    card.isLocked = false;
    expect(card.selectedZone).toBe(1);
    card._setDrawMode(mode);
    const layout = vi
      .spyOn(card.canvas, "getBoundingClientRect")
      .mockReturnValue(box(width, height));
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts, layout };
  }

  function mouse(card: any, type: string, x: number, y: number) {
    card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
  }

  function touch(card: any, type: string, x: number, y: number) {
    const point = { clientX: x, clientY: y };
    const event = Object.assign(new Event(type, { cancelable: true }), {
      touches: type === "touchend" ? [] : [point],
      changedTouches: [point],
    });
    card.canvas.dispatchEvent(event);
  }

  /** Let a resolved callService run on to its success toast. */
  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function zoneSaves(hass: any): any[] {
    return hass.callService.mock.calls.filter((call: any[]) => call[1] === "update_zone");
  }

  function savedToasts(toasts: string[]): string[] {
    return toasts.filter((message) => /saved/i.test(message));
  }

  it("saves nothing for a click without a drag in rect mode, and still saves a real drag", async () => {
    const { card, hass, toasts } = await drawingCard("rect");
    const zonesBefore = structuredClone(card.zones);
    const undoBefore = card._undoSnapshot;

    mouse(card, "mousedown", 400, 400);
    mouse(card, "mouseup", 400, 400);
    await settle();

    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.zones).toEqual(zonesBefore);
    expect(card._undoSnapshot).toBe(undoBefore);
    expect(savedToasts(toasts)).toEqual([]);
    expect(card.isDrawing).toBe(false);
    expect(card.startPoint).toBeNull();
    expect(card._activeInput).toBeNull();

    mouse(card, "mousedown", 100, 100);
    mouse(card, "mousemove", 300, 300);
    mouse(card, "mouseup", 300, 300);
    await settle();

    const saves = zoneSaves(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0][2].shape).toBe("rect");
    const data = saves[0][2].data;
    expect(data.x_min).toBeLessThan(data.x_max);
    expect(data.y_min).toBeLessThan(data.y_max);
    expect(savedToasts(toasts)).toEqual(["Doorway saved"]);
  });

  it("saves nothing for a touch tap in rect mode", async () => {
    const { card, hass, toasts } = await drawingCard("rect");
    const zonesBefore = structuredClone(card.zones);

    touch(card, "touchstart", 300, 300);
    touch(card, "touchend", 300, 300);
    await settle();

    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.zones).toEqual(zonesBefore);
    expect(savedToasts(toasts)).toEqual([]);
    expect(card.isDrawing).toBe(false);
  });

  it.each([
    ["vertical", 400, 100, 400, 500],
    ["horizontal", 100, 400, 500, 400],
  ])("saves nothing for a perfectly %s rect drag", async (_name, x1, y1, x2, y2) => {
    const { card, hass, toasts } = await drawingCard("rect");
    const zonesBefore = structuredClone(card.zones);

    mouse(card, "mousedown", x1, y1);
    mouse(card, "mousemove", x2, y2);
    mouse(card, "mouseup", x2, y2);
    await settle();

    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.zones).toEqual(zonesBefore);
    expect(savedToasts(toasts)).toEqual([]);
    expect(card.isDrawing).toBe(false);
  });

  it("reads no point from a canvas with no layout box", async () => {
    const { card, layout } = await drawingCard("rect");
    expect(card._getPointFromEvent({ clientX: 200, clientY: 100 })).toEqual({ x: 200, y: 100 });
    // A touch end with no touch list has no coordinates at all.
    expect(card._getPointFromEvent({ touches: [], changedTouches: [] })).toBeNull();

    layout.mockReturnValue(box(0, 0));

    expect(card._getPointFromEvent({ clientX: 10, clientY: 10 })).toBeNull();
    expect(card._getPointFromEvent({ clientX: 0, clientY: 0 })).toBeNull();
  });

  it.each(["rect", "ellipse", "polygon"])(
    "saves nothing for a %s touch on a canvas with no layout box",
    async (mode) => {
      const { card, hass, toasts } = await drawingCard(mode, 0, 0);
      const zonesBefore = structuredClone(card.zones);

      touch(card, "touchstart", 10, 10);
      touch(card, "touchmove", 20, 20);
      touch(card, "touchend", 20, 20);
      await settle();

      expect(hass.callService).not.toHaveBeenCalled();
      expect(card.zones).toEqual(zonesBefore);
      expect(toasts).toEqual([]);
      expect(card.isDrawing).toBe(false);
      expect(card.startPoint).toBeNull();
      expect(card._polyPoints).toEqual([]);
    }
  );

  it.each(["rect", "ellipse"])(
    "drops a %s touch drag whose canvas loses its layout box before the touch ends",
    async (mode) => {
      const { card, hass, toasts, layout } = await drawingCard(mode);
      const zonesBefore = structuredClone(card.zones);

      touch(card, "touchstart", 100, 100);
      touch(card, "touchmove", 300, 300);
      expect(card._cursorPoint).toEqual({ x: 300, y: 300 });

      layout.mockReturnValue(box(0, 0));
      // A move on the collapsed canvas keeps the last real cursor point.
      touch(card, "touchmove", 350, 350);
      expect(card._cursorPoint).toEqual({ x: 300, y: 300 });
      touch(card, "touchend", 350, 350);
      await settle();

      expect(hass.callService).not.toHaveBeenCalled();
      expect(card.zones).toEqual(zonesBefore);
      expect(toasts).toEqual([]);
      expect(card.isDrawing).toBe(false);
      expect(card.startPoint).toBeNull();
      expect(card._cursorPoint).toBeNull();
    }
  );

  it("never places a polygon vertex from a canvas that lost its layout box", async () => {
    const { card, hass, toasts, layout } = await drawingCard("polygon");
    card._lastPolyTap = 0;
    mouse(card, "mousedown", 100, 100);
    mouse(card, "mouseup", 100, 100);
    card._lastPolyTap = 0;
    mouse(card, "mousedown", 300, 100);
    mouse(card, "mouseup", 300, 100);
    expect(card._polyPoints).toHaveLength(2);

    layout.mockReturnValue(box(0, 0));
    card._lastPolyTap = 0;
    mouse(card, "mousedown", 300, 300);
    mouse(card, "mouseup", 300, 300);
    await settle();

    expect(card._polyPoints).toEqual([]);
    expect(card.isDrawing).toBe(false);
    expect(hass.callService).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  /** Push a payload with no zones, which clears the card's selection. */
  function pushNoZones(card: any, hass: any) {
    hass.handlers[ZONES_SUBSCRIBE][0]({ ...ZONE_PAYLOAD, zones: {} });
    expect(card.selectedZone).toBeNull();
  }

  function zoneIds(card: any): number[] {
    return card.zones.map((zone: any) => Number(zone.id));
  }

  it.each(["rect", "ellipse"])(
    "saves nothing and draws no zone 0 for a %s drag that ends after its zone was removed",
    async (mode) => {
      const { card, hass, toasts } = await drawingCard(mode);

      mouse(card, "mousedown", 100, 100);
      mouse(card, "mousemove", 300, 300);
      pushNoZones(card, hass);
      expect(card.isDrawing).toBe(true);
      mouse(card, "mouseup", 300, 300);
      await settle();

      expect(zoneSaves(hass)).toEqual([]);
      expect(zoneIds(card)).not.toContain(0);
      expect(card.zones).toEqual([]);
      expect(card._undoSnapshot).toBeNull();
      expect(savedToasts(toasts)).toEqual([]);
      expect(card.isDrawing).toBe(false);
      expect(card.startPoint).toBeNull();
      expect(card._cursorPoint).toBeNull();
      expect(card._activeInput).toBeNull();
    }
  );

  it("a held touch drag whose zone was removed saves nothing and draws no zone 0", async () => {
    const { card, hass, toasts } = await drawingCard("rect");

    touch(card, "touchstart", 100, 100);
    touch(card, "touchmove", 300, 300);
    pushNoZones(card, hass);
    touch(card, "touchend", 300, 300);
    await settle();

    expect(zoneSaves(hass)).toEqual([]);
    expect(zoneIds(card)).not.toContain(0);
    expect(savedToasts(toasts)).toEqual([]);
    expect(card.isDrawing).toBe(false);
    expect(card._activeTouchId).toBeNull();
  });

  it("drops a half-drawn polygon on the next tap once its zone was removed", async () => {
    const { card, hass, toasts } = await drawingCard("polygon");
    card._lastPolyTap = 0;
    mouse(card, "mousedown", 100, 100);
    mouse(card, "mouseup", 100, 100);
    card._lastPolyTap = 0;
    mouse(card, "mousedown", 300, 100);
    mouse(card, "mouseup", 300, 100);
    expect(card._polyPoints).toHaveLength(2);

    pushNoZones(card, hass);
    card._lastPolyTap = 0;
    mouse(card, "mousedown", 300, 300);
    mouse(card, "mouseup", 300, 300);
    await settle();

    expect(card._polyPoints).toEqual([]);
    expect(card.isDrawing).toBe(false);
    expect(zoneIds(card)).not.toContain(0);
    expect(hass.callService).not.toHaveBeenCalled();
    expect(savedToasts(toasts)).toEqual([]);
  });
});

/**
 * An ellipse drag that ends past the edge of the grid.
 *
 * A touch keeps reporting to the canvas after the finger slides off it, so a
 * touch drag can end far outside the grid. The rect clamps both corners to
 * the grid, but the ellipse clamped only its center and took its radii from
 * the raw corners, so the same drag saved an ellipse pinned to the edge with
 * a radius reaching thousands of mm past it. The canvas is laid out at
 * 800x800 CSS px over the 800x800 bitmap, so one canvas px is 12.5 mm on the
 * default grid (x -5000..5000, y 0..10000).
 */
describe("zone map card ellipse drag past the grid", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Unlocked on ZONE_PAYLOAD with zone 1 (Doorway) selected in `mode`. */
  async function drawingCard(mode: string) {
    const hass = fakeHass();
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false });
    card._setSelectedZone(1);
    card._setDrawMode(mode);
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 800,
      x: 0,
      y: 0,
      width: 800,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect);
    hass.callService.mockClear();
    return { card, hass };
  }

  function touch(card: any, type: string, x: number, y: number) {
    const point = new Touch({ identifier: 1, target: card.canvas, clientX: x, clientY: y });
    card.canvas.dispatchEvent(
      new TouchEvent(type, {
        cancelable: true,
        touches: type === "touchend" ? [] : [point],
        targetTouches: type === "touchend" ? [] : [point],
        changedTouches: [point],
      })
    );
  }

  function mouse(card: any, type: string, x: number, y: number) {
    card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
  }

  function touchDrag(card: any, from: number[], to: number[]) {
    touch(card, "touchstart", from[0], from[1]);
    touch(card, "touchmove", to[0], to[1]);
    touch(card, "touchend", to[0], to[1]);
  }

  /** The data of every update_zone call, in order. */
  function savedData(hass: any): any[] {
    return hass.callService.mock.calls
      .filter((call: any[]) => call[1] === "update_zone")
      .map((call: any[]) => call[2].data);
  }

  it.each([
    [
      "past the far corner",
      [700, 700],
      [1200, 1200],
      { cx: 4375, cy: 9375, rx: 625, ry: 625 },
      { x_min: 3750, x_max: 5000, y_min: 8750, y_max: 10000 },
    ],
    [
      "past the near corner",
      [100, 100],
      [-400, -400],
      { cx: -4375, cy: 625, rx: 625, ry: 625 },
      { x_min: -5000, x_max: -3750, y_min: 0, y_max: 1250 },
    ],
  ])(
    "keeps a touch ellipse drag ending %s inside the grid, on the rect's box",
    async (_name, from, to, ellipse, rect) => {
      const { card, hass } = await drawingCard("ellipse");
      touchDrag(card, from as number[], to as number[]);

      const [data] = savedData(hass);
      expect(data).toEqual(ellipse);
      expect(data.cx + data.rx).toBeLessThanOrEqual(card.xMax);
      expect(data.cx - data.rx).toBeGreaterThanOrEqual(card.xMin);
      expect(data.cy + data.ry).toBeLessThanOrEqual(card.yMax);
      expect(data.cy - data.ry).toBeGreaterThanOrEqual(card.yMin);
      expect(card.zones.find((zone: any) => Number(zone.id) === 1)).toEqual(
        expect.objectContaining({ shape: "ellipse", data: ellipse })
      );

      // The same gesture in rect mode saves the box the ellipse is drawn in.
      card._setDrawMode("rect");
      hass.callService.mockClear();
      touchDrag(card, from as number[], to as number[]);
      expect(savedData(hass)).toEqual([rect]);
    }
  );

  it("saves an on-canvas ellipse drag unchanged", async () => {
    const { card, hass } = await drawingCard("ellipse");

    mouse(card, "mousedown", 100, 100);
    mouse(card, "mousemove", 300, 500);
    mouse(card, "mouseup", 300, 500);
    touchDrag(card, [100, 100], [500, 400]);

    expect(savedData(hass)).toEqual([
      { cx: -2500, cy: 3750, rx: 1250, ry: 2500 },
      { cx: -1250, cy: 3125, rx: 2500, ry: 1875 },
    ]);
  });
});

/**
 * A touch gesture follows the finger that started it.
 *
 * A second finger landing mid-drag (a resting thumb, a palm) used to restart
 * the drag at the first finger's current position, and the lift of either
 * finger then committed a collapsed or truncated shape over the saved zone
 * and toasted "saved". A touchcancel, which the browser sends instead of a
 * touchend when it takes a touch away, was not handled at all and left the
 * drag half open. These tests dispatch real TouchEvents with identifiers on
 * the canvas, laid out at 800x800 CSS px over the 800x800 bitmap, so one
 * canvas px is 12.5 mm on the default grid.
 */
describe("zone map card multi-touch and touchcancel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Unlocked on ZONE_PAYLOAD with zone 1 (Doorway) selected in `mode`. */
  async function drawingCard(mode: string) {
    const hass = fakeHass();
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false });
    card._setSelectedZone(1);
    card._setDrawMode(mode);
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 800,
      x: 0,
      y: 0,
      width: 800,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect);
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  /** Finger `id` on the canvas at (x, y). */
  function finger(card: any, id: number, x: number, y: number): Touch {
    return new Touch({ identifier: id, target: card.canvas, clientX: x, clientY: y });
  }

  /** Dispatch a TouchEvent the way a browser fills it: `down` is every finger
   *  still on the screen, `changed` the fingers this event is about. */
  function fire(card: any, type: string, down: Touch[], changed: Touch[]) {
    card.canvas.dispatchEvent(
      new TouchEvent(type, {
        cancelable: true,
        touches: down,
        targetTouches: down,
        changedTouches: changed,
      })
    );
  }

  /** Let a resolved callService run on to its success toast. */
  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function zoneSaves(hass: any): any[] {
    return hass.callService.mock.calls
      .filter((call: any[]) => call[1] === "update_zone")
      .map((call: any[]) => call[2]);
  }

  it.each([
    ["rect", { x_min: -3750, x_max: 1250, y_min: 1250, y_max: 5000 }],
    ["ellipse", { cx: -1250, cy: 3125, rx: 2500, ry: 1875 }],
  ])("keeps a %s drag on its first finger when a second one lands", async (mode, data) => {
    const { card, hass, toasts } = await drawingCard(mode as string);

    fire(card, "touchstart", [finger(card, 1, 100, 100)], [finger(card, 1, 100, 100)]);
    fire(card, "touchmove", [finger(card, 1, 300, 300)], [finger(card, 1, 300, 300)]);
    const both = [finger(card, 1, 300, 300), finger(card, 2, 500, 500)];
    fire(card, "touchstart", both, [finger(card, 2, 500, 500)]);

    expect(card.startPoint).toEqual({ x: 100, y: 100 });
    expect(card._cursorPoint).toEqual({ x: 300, y: 300 });

    // The second finger moving does not move the shape, and its lift does
    // not end the drag.
    fire(
      card,
      "touchmove",
      [finger(card, 1, 300, 300), finger(card, 2, 600, 600)],
      [finger(card, 2, 600, 600)]
    );
    expect(card._cursorPoint).toEqual({ x: 300, y: 300 });
    fire(card, "touchend", [finger(card, 1, 300, 300)], [finger(card, 2, 600, 600)]);
    await settle();

    expect(card.isDrawing).toBe(true);
    expect(card.startPoint).toEqual({ x: 100, y: 100 });
    expect(hass.callService).not.toHaveBeenCalled();

    fire(card, "touchmove", [finger(card, 1, 500, 400)], [finger(card, 1, 500, 400)]);
    expect(card._cursorPoint).toEqual({ x: 500, y: 400 });
    fire(card, "touchend", [], [finger(card, 1, 500, 400)]);
    await settle();

    expect(zoneSaves(hass)).toEqual([
      expect.objectContaining({ device_id: "dev123", zone_id: 1, shape: mode, data }),
    ]);
    expect(toasts.filter((message) => /saved/i.test(message))).toEqual(["Doorway saved"]);
    expect(card.isDrawing).toBe(false);
    expect(card.startPoint).toBeNull();
    expect(card._activeInput).toBeNull();
    expect(card._activeTouchId).toBeNull();
  });

  it("commits the first finger's drag when it lifts before the second one", async () => {
    const { card, hass } = await drawingCard("rect");

    fire(card, "touchstart", [finger(card, 1, 100, 100)], [finger(card, 1, 100, 100)]);
    fire(card, "touchmove", [finger(card, 1, 300, 300)], [finger(card, 1, 300, 300)]);
    fire(
      card,
      "touchstart",
      [finger(card, 1, 300, 300), finger(card, 2, 500, 500)],
      [finger(card, 2, 500, 500)]
    );
    fire(card, "touchend", [finger(card, 2, 500, 500)], [finger(card, 1, 300, 300)]);

    expect(zoneSaves(hass).map((call) => call.data)).toEqual([
      { x_min: -3750, x_max: -1250, y_min: 1250, y_max: 3750 },
    ]);

    // The finger left behind draws nothing of its own.
    fire(card, "touchmove", [finger(card, 2, 700, 700)], [finger(card, 2, 700, 700)]);
    fire(card, "touchend", [], [finger(card, 2, 700, 700)]);

    expect(zoneSaves(hass)).toHaveLength(1);
    expect(card.isDrawing).toBe(false);
  });

  it.each(["rect", "ellipse"])(
    "drops a %s drag on touchcancel and leaves the mouse free",
    async (mode) => {
      const { card, hass, toasts } = await drawingCard(mode);

      fire(card, "touchstart", [finger(card, 1, 100, 100)], [finger(card, 1, 100, 100)]);
      fire(card, "touchmove", [finger(card, 1, 300, 300)], [finger(card, 1, 300, 300)]);
      fire(card, "touchcancel", [], [finger(card, 1, 300, 300)]);
      await settle();

      expect(card.isDrawing).toBe(false);
      expect(card.startPoint).toBeNull();
      expect(card._cursorPoint).toBeNull();
      expect(card._activeInput).toBeNull();
      expect(card._activeTouchId).toBeNull();
      expect(hass.callService).not.toHaveBeenCalled();
      expect(toasts).toEqual([]);

      card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));
      card.canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 300 }));
      card.canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: 300, clientY: 300 }));

      const saves = zoneSaves(hass);
      expect(saves).toHaveLength(1);
      expect(saves[0].shape).toBe(mode);
    }
  );

  it("keeps the drag when only the second finger is cancelled", async () => {
    const { card, hass } = await drawingCard("rect");

    fire(card, "touchstart", [finger(card, 1, 100, 100)], [finger(card, 1, 100, 100)]);
    fire(card, "touchmove", [finger(card, 1, 300, 300)], [finger(card, 1, 300, 300)]);
    fire(
      card,
      "touchstart",
      [finger(card, 1, 300, 300), finger(card, 2, 500, 500)],
      [finger(card, 2, 500, 500)]
    );
    fire(card, "touchcancel", [finger(card, 1, 300, 300)], [finger(card, 2, 500, 500)]);

    expect(card.isDrawing).toBe(true);
    expect(card.startPoint).toEqual({ x: 100, y: 100 });

    fire(card, "touchend", [], [finger(card, 1, 300, 300)]);

    expect(zoneSaves(hass).map((call) => call.data)).toEqual([
      { x_min: -3750, x_max: -1250, y_min: 1250, y_max: 3750 },
    ]);
  });

  /** One single-finger tap with finger `id`, never close enough to finish. */
  function tap(card: any, id: number, x: number, y: number) {
    card._lastPolyTap = 0;
    fire(card, "touchstart", [finger(card, id, x, y)], [finger(card, id, x, y)]);
    fire(card, "touchend", [], [finger(card, id, x, y)]);
  }

  it("adds a vertex for a single-finger polygon tap and none for a second finger", async () => {
    const { card, hass } = await drawingCard("polygon");

    tap(card, 1, 100, 100);
    expect(card._polyPoints).toEqual([{ x: -3750, y: 1250 }]);

    // A second finger tapped while the first is held, once that one has
    // moved, adds nothing; the held finger's own lift is the next vertex.
    // (On a first finger that has not moved, a second one pinches: see the
    // zoom tests.)
    card._lastPolyTap = 0;
    fire(card, "touchstart", [finger(card, 2, 280, 100)], [finger(card, 2, 280, 100)]);
    fire(card, "touchmove", [finger(card, 2, 300, 100)], [finger(card, 2, 300, 100)]);
    fire(
      card,
      "touchstart",
      [finger(card, 2, 300, 100), finger(card, 3, 500, 500)],
      [finger(card, 3, 500, 500)]
    );
    fire(card, "touchend", [finger(card, 2, 300, 100)], [finger(card, 3, 500, 500)]);
    expect(card._polyPoints).toHaveLength(1);
    fire(card, "touchend", [], [finger(card, 2, 300, 100)]);

    expect(card._polyPoints).toEqual([
      { x: -3750, y: 1250 },
      { x: -1250, y: 1250 },
    ]);
    expect(card.isDrawing).toBe(true);
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("keeps the placed polygon vertices on touchcancel and drops only the cursor", async () => {
    const { card, hass } = await drawingCard("polygon");
    tap(card, 1, 100, 100);
    tap(card, 2, 300, 100);
    tap(card, 3, 300, 300);

    card._lastPolyTap = 0;
    fire(card, "touchstart", [finger(card, 4, 150, 250)], [finger(card, 4, 150, 250)]);
    fire(card, "touchmove", [finger(card, 4, 120, 280)], [finger(card, 4, 120, 280)]);
    expect(card._cursorPoint).toEqual({ x: 120, y: 280 });
    fire(card, "touchcancel", [], [finger(card, 4, 120, 280)]);

    expect(card._polyPoints).toHaveLength(3);
    expect(card.isDrawing).toBe(true);
    expect(card._cursorPoint).toBeNull();
    expect(card._activeInput).toBeNull();
    expect(card._activeTouchId).toBeNull();
    expect(hass.callService).not.toHaveBeenCalled();

    tap(card, 5, 100, 300);
    card.finishPolygon();

    const saves = zoneSaves(hass).filter((call) => call.shape === "polygon");
    expect(saves.map((call) => call.data.points)).toEqual([
      [
        { x: -3750, y: 1250 },
        { x: -1250, y: 1250 },
        { x: -1250, y: 3750 },
        { x: -3750, y: 3750 },
      ],
    ]);
  });
});

/**
 * Touches on a map nothing can be drawn on.
 *
 * The canvas took every touch (touch-action none and preventDefault), so a
 * locked map, which most phone users only scroll past, trapped the swipe: the
 * page would not scroll from it. A map that is locked, in Walk, or has no zone
 * selected now leaves the touch to the browser, and its canvas carries the
 * `pans` class that lets the browser scroll. A tap still turns into the
 * browser's mousedown, which is where a locked map says how to unlock.
 */
describe("zone map card touches on a map nothing can be drawn on", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function touchCard(config: Record<string, any> = {}, payload: any = ZONE_PAYLOAD) {
    const hass = fakeHass(payload);
    const card = await mountCard(hass, { ...TEN_METER_GRID, ...config });
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 800,
      x: 0,
      y: 0,
      width: 800,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect);
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  /** Dispatch a cancelable touch event and say whether the card prevented it. */
  function touch(card: any, type: string, x: number, y: number): boolean {
    const point = { clientX: x, clientY: y };
    const event = Object.assign(new Event(type, { cancelable: true }), {
      touches: type === "touchend" ? [] : [point],
      changedTouches: [point],
    });
    card.canvas.dispatchEvent(event);
    return event.defaultPrevented;
  }

  function swipe(card: any): boolean[] {
    return [
      touch(card, "touchstart", 400, 600),
      touch(card, "touchmove", 400, 300),
      touch(card, "touchend", 400, 300),
    ];
  }

  it("a locked canvas does not preventDefault touches", async () => {
    const { card, toasts } = await touchCard();
    expect(card.isLocked).toBe(true);

    expect(swipe(card)).toEqual([false, false, false]);
    // A scroll says nothing; only the mousedown of a tap reminds.
    expect(toasts).toEqual([]);
    expect(card.isDrawing).toBe(false);
  });

  it("an unlocked canvas with a selected zone does", async () => {
    const { card } = await touchCard({ start_locked: false });
    expect(card.selectedZone).toBe(1);

    expect(touch(card, "touchstart", 100, 100)).toBe(true);
    expect(card.isDrawing).toBe(true);
    expect(touch(card, "touchmove", 300, 300)).toBe(true);
    expect(touch(card, "touchend", 300, 300)).toBe(true);
    expect(card.isDrawing).toBe(false);
    expect(card.canvas.classList.contains("pans")).toBe(false);
  });

  it("a canvas in Walk does not preventDefault touches", async () => {
    const { card } = await touchCard({ start_locked: false });
    card.drawMode = "walk";

    expect(swipe(card)).toEqual([false, false, false]);
    expect(card.isDrawing).toBe(false);
  });

  it("a canvas with no zone selected lets a touch scroll", async () => {
    const { card, toasts } = await touchCard({}, { ...ZONE_PAYLOAD, zones: {} });
    expect(card.isLocked).toBe(false);
    expect(card.selectedZone).toBeNull();

    expect(swipe(card)).toEqual([false, false, false]);
    expect(card.canvas.classList.contains("pans")).toBe(true);
    expect(toasts).toEqual([]);

    // Add Zone selects the new zone, and the map takes touches for drawing.
    card.shadowRoot.getElementById("btnAddZone").click();
    expect(card.selectedZone).toBe(1);
    expect(card.canvas.classList.contains("pans")).toBe(false);
    expect(touch(card, "touchstart", 100, 100)).toBe(true);
  });

  it("a locked canvas carries the pans class", async () => {
    const { card } = await touchCard();
    expect(card.canvas.classList.contains("pans")).toBe(true);

    card.shadowRoot.getElementById("btnLock").click();
    expect(card.canvas.classList.contains("pans")).toBe(false);

    card.shadowRoot.getElementById("btnLock").click();
    expect(card.canvas.classList.contains("pans")).toBe(true);
    // A render rebuilds the canvas with the class it needs.
    card.render();
    expect(card.canvas.classList.contains("pans")).toBe(true);
  });

  it("finishes a drag that was under way when the map stopped taking touches", async () => {
    const { card, hass } = await touchCard({ start_locked: false });
    touch(card, "touchstart", 100, 100);
    touch(card, "touchmove", 300, 300);
    // The selection goes mid-drag (Delete on another device's echo, say).
    card.selectedZone = null;

    expect(touch(card, "touchend", 300, 300)).toBe(true);
    expect(card.isDrawing).toBe(false);
    expect(hass.callService).not.toHaveBeenCalled();
  });
});

/**
 * The map alone (view_only: true).
 *
 * A card for a wall tablet or a phone dashboard that only shows where people
 * are: the title and the map, with its lit zones, numbered dots, trails, the
 * offline note and the flip. No drawing tools, lock, undo, unit switch, chips,
 * Configure or zone list, and nothing listens on the canvas, so a swipe that
 * starts on the map scrolls the page. A live card switched to it drops what
 * it was drawing, since nothing would be left to finish it.
 */
describe("zone map card view only", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  const VIEW_ONLY = { ...TEN_METER_GRID, view_only: true };
  const PRESENCE = "binary_sensor.office_zone_1_presence";

  /** A cancelable touch on the canvas, and whether the card prevented it. */
  function touch(card: any, type: string, x: number, y: number): boolean {
    const point = { clientX: x, clientY: y };
    const event = Object.assign(new Event(type, { cancelable: true }), {
      touches: type === "touchend" ? [] : [point],
      changedTouches: [point],
    });
    card.canvas.dispatchEvent(event);
    return event.defaultPrevented;
  }

  function mouse(card: any, type: string, x: number, y: number) {
    card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
  }

  function frame(card: any): Draw[] {
    const { ctx, draws } = drawRecordingContext();
    card.ctx = ctx;
    card.drawGrid();
    return draws;
  }

  it("renders only the map in view_only", async () => {
    const card = await mountCard(fakeHass(), VIEW_ONLY);
    const root = card.shadowRoot;

    // versionNotice stays empty unless the page runs other cards than Home
    // Assistant (zone-map-version.test.ts).
    expect(Array.from(root.querySelectorAll("[id]"), (el: any) => el.id)).toEqual([
      "deviceTitle",
      "versionNotice",
      "zoneCanvas",
      "offlineNote",
    ]);
    expect(root.getElementById("deviceTitle").textContent).toBe("Office radar");
    expect(card.canvas).toBe(root.getElementById("zoneCanvas"));
    // Nothing to press or type into.
    expect(root.querySelectorAll("button, input, select")).toHaveLength(0);
    // No crosshair over a map nothing is drawn on, and a vertical swipe
    // scrolls the page.
    const canvasRule = /(?:^|\s)canvas \{([^}]*)\}/.exec(root.querySelector("style").textContent);
    expect(canvasRule?.[1].trim()).toBe(
      "width: 100%; height: 100%; cursor: default; touch-action: pan-y; touch-action: pan-y pinch-zoom;"
    );

    // The same card without the key is the full card again.
    card.setConfig({ device_id: "dev123", ...TEN_METER_GRID });
    for (const id of ["btnLock", "btnUndo", "btnModeMenu", "btnUnitM", "viewTools", "zoneManager"]) {
      expect(root.getElementById(id)).not.toBeNull();
    }
    // And anything but true leaves it the full card.
    card.setConfig({ device_id: "dev123", ...TEN_METER_GRID, view_only: "yes" });
    expect(root.getElementById("btnLock")).not.toBeNull();
  });

  it("shows the load error in view_only", async () => {
    const error = { code: "not_found", message: "No Home Assistant device with id dev123" };
    const card = await mountCard(fakeHass(ZONE_PAYLOAD, error), VIEW_ONLY);

    // Never a blank map: an empty canvas would look like an empty room.
    expect(card.canvas).toBeNull();
    expect(card.shadowRoot.querySelector("canvas")).toBeNull();
    expect(card.shadowRoot.getElementById("loadError").textContent).toContain("dev123");
  });

  it("attaches no canvas listeners in view_only and lets a touch scroll", async () => {
    // On the element classes the card's nodes are made of. The global
    // EventTarget here is not the one happy-dom's elements inherit from.
    const added = vi.spyOn(HTMLElement.prototype, "addEventListener");
    const hass = fakeHass();
    // Unlocked with zone 1 selected, where the full card takes every touch
    // for drawing, then switched to the map alone.
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false });
    expect(card.selectedZone).toBe(1);
    card.setConfig({ device_id: "dev123", ...VIEW_ONLY, start_locked: false });
    document.body.appendChild(card);
    layOut(card, 800);
    hass.callService.mockClear();
    const toasts = notifications(card);

    const on = (target: unknown) => added.mock.contexts.filter((context) => context === target);
    expect(on(card.canvas)).toEqual([]);
    expect(on(card.canvas.parentElement)).toEqual([]);
    // No key or press elsewhere on the page has a drawing to end either.
    expect(card._onKeyDown ?? null).toBeNull();
    expect(card._outsideClickHandler ?? null).toBeNull();

    expect([
      touch(card, "touchstart", 400, 600),
      touch(card, "touchmove", 400, 300),
      touch(card, "touchend", 400, 300),
    ]).toEqual([false, false, false]);
    mouse(card, "mousedown", 100, 100);
    mouse(card, "mousemove", 300, 300);
    mouse(card, "mouseup", 300, 300);
    card.canvas.dispatchEvent(new MouseEvent("dblclick"));
    expect(card.isDrawing).toBe(false);
    expect(hass.callService).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);

    // The guards behind it hold even when something calls them anyway.
    card.startDrawing(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));
    expect(card.isDrawing).toBe(false);
    card._attachGlobalListeners();
    expect(card._onKeyDown ?? null).toBeNull();
    card.remove();
    document.body.appendChild(card);
    expect(card._onKeyDown ?? null).toBeNull();

    // The full card takes the same touch for drawing.
    card.setConfig({ device_id: "dev123", ...TEN_METER_GRID, start_locked: false });
    layOut(card, 800);
    expect(touch(card, "touchstart", 100, 100)).toBe(true);
    expect(card.isDrawing).toBe(true);
  });

  it("keeps lit zones, numbered dots and trails in view_only", async () => {
    vi.useFakeTimers();
    const hass = fakeHass({
      ...ZONE_PAYLOAD,
      rotation_deg: 0,
      zones: { "1": { ...ZONE_PAYLOAD.zones["1"], presence_entity_id: PRESENCE } },
    });
    const card = await mountCard(hass, VIEW_ONLY);
    let states: Record<string, any> = { [PRESENCE]: { state: "on", attributes: {} } };
    const move = (x: number, y: number) => {
      states = {
        ...states,
        "sensor.a_x": { state: String(x) },
        "sensor.a_y": { state: String(y) },
      };
      card.hass = { ...hass, states };
    };
    move(-2000, 2000);
    vi.advanceTimersByTime(200);
    move(-1000, 2000);

    const draws = frame(card);

    // The Doorway, lit by its presence sensor and outlined solid.
    expect(draws.filter((d) => d.name === "fillRect").map((d) => d.fill)).toEqual([
      "rgba(244, 67, 54, 0.45)",
    ]);
    // Target 1's dot with its number, at (-1000, 2000) mm.
    expect(draws.filter((d) => d.name === "fillText").map((d) => d.args)).toEqual([
      ["Doorway", 440, 40],
      ["1", 320, 160],
    ]);
    // Its trail, from (-2000, 2000) mm.
    const segment = draws.findIndex(
      (d, i) => d.name === "stroke" && d.stroke === "#f44336" && draws[i - 1]?.name === "lineTo"
    );
    expect(draws.slice(segment - 2, segment).map((d) => d.args)).toEqual([
      [240, 160],
      [320, 160],
    ]);

    // On the page, the trail fades between pushes as on the full card.
    document.body.appendChild(card);
    const draw = vi.spyOn(card, "drawGrid");
    vi.advanceTimersByTime(100);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("drops the lock visual when a live card switches to view_only", async () => {
    // A full card sets up its Locked button, whose closure also sets the
    // canvas cursor. Switched before the first payload, the auto lock runs
    // later, on the view-only map, which has no Locked button.
    const hass = fakeHass();
    const card: any = new ZoneMapCard();
    card.setConfig({ device_id: "dev123", ...TEN_METER_GRID });
    expect(typeof card._updateLockVisual).toBe("function");

    card.setConfig({ device_id: "dev123", ...VIEW_ONLY });
    expect(card._updateLockVisual).toBeNull();
    card.hass = hass;
    await vi.waitFor(() => expect(card._zoneConfigPayload).toBeTruthy());

    // Locked by the auto rule (the radar has a zone), with no not-allowed
    // cursor left on a map that draws nothing.
    expect(card.isLocked).toBe(true);
    expect(card.canvas.style.cursor).toBe("");
  });

  it("drops a rect in progress when the card switches to view_only", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false });
    expect(card.selectedZone).toBe(1);
    layOut(card, 800);
    hass.callService.mockClear();
    mouse(card, "mousedown", 100, 100);
    mouse(card, "mousemove", 300, 250);
    expect(card.isDrawing).toBe(true);

    card.setConfig({ device_id: "dev123", ...VIEW_ONLY, start_locked: false });

    expect(card.isDrawing).toBe(false);
    expect([card.startPoint, card._cursorPoint, card._activeInput]).toEqual([null, null, null]);
    // No rubber band and no size readout on the map.
    const draws = frame(card);
    expect(draws.filter((d) => d.name === "setLineDash" && d.args[0].join() === "5,5")).toEqual([]);
    expect(draws.filter((d) => d.name === "fillText" && String(d.args[0]).includes(" × "))).toEqual(
      []
    );

    // Back on the full card, the release that never came saves nothing.
    card.setConfig({ device_id: "dev123", ...TEN_METER_GRID, start_locked: false });
    layOut(card, 800);
    mouse(card, "mouseup", 300, 250);
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("applies the flip in view_only", async () => {
    const hass = fakeHass({ ...ZONE_PAYLOAD, rotation_deg: 0, mirror_x: true });
    const card = await mountCard(hass, VIEW_ONLY);
    hass.states = { "sensor.a_x": { state: "-2000" }, "sensor.a_y": { state: "2000" } };
    expect(card._mirrorX).toBe(true);

    // Flipped, x runs from 5000 mm on the left: the Doorway's 0 to 1000 mm
    // is 400 to 320 px, and target 1 at -2000 mm is at 560 px.
    const draws = frame(card);
    const [rect] = draws.filter((d) => d.name === "fillRect").map((d) => d.args);
    expect(rect.map((v: number) => Math.round(v * 1e6) / 1e6)).toEqual([320, 0, 80, 80]);
    const dot = draws.find((d) => d.name === "fillText" && d.args[0] === "1");
    expect(dot?.args.slice(1).map((v: number) => Math.round(v * 1e6) / 1e6)).toEqual([560, 160]);

    // A pushed unflip follows.
    hass.handlers[ZONES_SUBSCRIBE][0]({ ...ZONE_PAYLOAD, rotation_deg: 0 });
    expect(card._mirrorX).toBe(false);
  });

  it("reports a card size of 6 in view_only", async () => {
    const card = await mountCard(fakeHass(), VIEW_ONLY);
    expect(card.getCardSize()).toBe(6);

    // The full card, with the Zones panel open under the map.
    card.setConfig({ device_id: "dev123", ...TEN_METER_GRID });
    expect(card.getCardSize()).toBe(14);
  });
});

/**
 * Undoing polygon vertices (Backspace or the undo button).
 *
 * With no vertices placed, the canvas draws a dot at `startPoint`, the last
 * press, and anchors the rubber band there, so the first press shows up
 * before its vertex lands. Undoing the only vertex left `startPoint` set, and
 * the canvas kept a dot and a dashed line at a vertex that no longer existed
 * until the next press, so the undo looked as if it had done nothing. The
 * canvas is laid out at 800x800 CSS px over the 800x800 bitmap, so canvas
 * (100,100) is the vertex at (-3750, 1250) mm on the default grid.
 */
describe("zone map card undoing polygon vertices", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  /** Unlocked polygon mode on zone 1, laid out, with a recording ctx. */
  async function polygonCard() {
    const hass = fakeHass({ ...ZONE_PAYLOAD, zones: {} });
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false });
    document.body.appendChild(card);
    card._setSelectedZone(1);
    card._setDrawMode("polygon");
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 800,
      x: 0,
      y: 0,
      width: 800,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect);
    const { ctx, calls } = recordingContext();
    card.ctx = ctx;
    return { card, calls };
  }

  function click(card: any, x: number, y: number) {
    card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: y }));
    card.canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: y }));
  }

  /** The vertex dots one repaint draws, as [x, y] canvas px. */
  function vertexDots(card: any, calls: Array<[string, any[]]>): number[][] {
    calls.length = 0;
    card.drawGrid();
    return calls
      .filter(([name, args]) => name === "arc" && args[2] === 3.5)
      .map(([, args]) => [args[0], args[1]]);
  }

  /** The dashed polygon rubber band strokes one repaint sets up. */
  function rubberBands(card: any, calls: Array<[string, any[]]>): number {
    calls.length = 0;
    card.drawGrid();
    const isRubberBand = ([name, args]: [string, any[]]) =>
      name === "setLineDash" && args[0]?.join() === "6,6";
    return calls.filter(isRubberBand).length;
  }

  const undoes: Array<[string, (card: any) => void]> = [
    ["Backspace", () => keyOn(document.body, "Backspace")],
    ["the undo button", (card) => card.shadowRoot.getElementById("btnPolyUndo").click()],
  ];

  it.each(undoes)("leaves no dot at the only vertex once %s removes it", async (_name, undo) => {
    const { card, calls } = await polygonCard();
    click(card, 100, 100);
    card.canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 250 }));
    expect(card._polyPoints).toEqual([{ x: -3750, y: 1250 }]);
    expect(vertexDots(card, calls)).toEqual([[100, 100]]);

    undo(card);

    expect(card._polyPoints).toEqual([]);
    expect(card.isDrawing).toBe(true);
    expect(card.startPoint).toBeNull();
    expect(vertexDots(card, calls)).toEqual([]);
    expect(rubberBands(card, calls)).toBe(0);

    // The next press starts the polygon over from where it lands.
    click(card, 500, 500);
    expect(card._polyPoints).toEqual([{ x: 1250, y: 6250 }]);
    expect(vertexDots(card, calls)).toEqual([[500, 500]]);
  });

  it.each(undoes)("keeps startPoint when %s leaves a vertex behind", async (_name, undo) => {
    const { card, calls } = await polygonCard();
    click(card, 100, 100);
    click(card, 300, 100);
    const startPoint = card.startPoint;
    expect(startPoint).toEqual({ x: 300, y: 100 });

    undo(card);

    expect(card._polyPoints).toEqual([{ x: -3750, y: 1250 }]);
    expect(card.startPoint).toBe(startPoint);
    expect(vertexDots(card, calls)).toEqual([[100, 100]]);
  });
});

/**
 * Non-primary mouse buttons on the canvas.
 *
 * Neither drawing handler read `button`, so a right or middle press started a
 * rect or ellipse drag, and in rect mode the matching release wrote the zone.
 * A polygon keeps `isDrawing` set between vertices, so after one left-click
 * vertex a right-button release alone placed another. Only the primary button
 * draws now; the browser's context menu is left alone. The canvas is laid out
 * at 800x800 CSS px over the 800x800 bitmap.
 */
describe("zone map card non-primary mouse buttons", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Unlocked on ZONE_PAYLOAD with zone 1 (Doorway) selected, laid out. */
  async function drawingCard(mode: string) {
    const hass = fakeHass();
    const card = await mountCard(hass, TEN_METER_GRID);
    card.isLocked = false;
    expect(card.selectedZone).toBe(1);
    card._setDrawMode(mode);
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 800,
      x: 0,
      y: 0,
      width: 800,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect);
    hass.callService.mockClear();
    return { card, hass };
  }

  function mouse(card: any, type: string, x: number, y: number, button = 0) {
    card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button }));
  }

  function zoneSaves(hass: any): any[] {
    return hass.callService.mock.calls.filter((call: any[]) => call[1] === "update_zone");
  }

  it.each([
    ["middle", 1],
    ["right", 2],
  ])("starts no rect drag and saves nothing for a %s-button drag", async (_name, button) => {
    const { card, hass } = await drawingCard("rect");

    mouse(card, "mousedown", 100, 100, button);
    expect(card.isDrawing).toBe(false);
    expect(card.startPoint).toBeNull();
    expect(card._activeInput).toBeNull();

    mouse(card, "mousemove", 300, 300);
    mouse(card, "mouseup", 300, 300, button);

    expect(zoneSaves(hass)).toEqual([]);
    expect(card.isDrawing).toBe(false);
  });

  it("places no polygon vertex for a right-button click after a left-click vertex", async () => {
    const { card, hass } = await drawingCard("polygon");
    mouse(card, "mousedown", 100, 100);
    mouse(card, "mouseup", 100, 100);
    expect(card._polyPoints).toEqual([{ x: -3750, y: 1250 }]);
    expect(card.isDrawing).toBe(true);
    const startPoint = card.startPoint;

    card._lastPolyTap = 0;
    mouse(card, "mousedown", 300, 100, 2);
    expect(card.startPoint).toBe(startPoint);
    mouse(card, "mouseup", 300, 100, 2);
    expect(card._polyPoints).toHaveLength(1);

    // A right-button release with no press of its own (the menu took the
    // press) adds nothing either.
    mouse(card, "mouseup", 500, 500, 2);
    expect(card._polyPoints).toHaveLength(1);
    expect(card.isDrawing).toBe(true);

    // The next left click is still the next vertex.
    card._lastPolyTap = 0;
    mouse(card, "mousedown", 300, 100);
    mouse(card, "mouseup", 300, 100);
    expect(card._polyPoints).toEqual([
      { x: -3750, y: 1250 },
      { x: -1250, y: 1250 },
    ]);
    expect(zoneSaves(hass)).toEqual([]);
  });

  it("still saves a left-button rect drag, past a right-button release mid-drag", async () => {
    const { card, hass } = await drawingCard("rect");

    mouse(card, "mousedown", 100, 100);
    mouse(card, "mousemove", 300, 300);
    mouse(card, "mouseup", 300, 300, 2);
    expect(card.isDrawing).toBe(true);
    expect(zoneSaves(hass)).toEqual([]);

    mouse(card, "mouseup", 300, 300);

    const saves = zoneSaves(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0][2]).toEqual(
      expect.objectContaining({
        zone_id: 1,
        shape: "rect",
        data: { x_min: -3750, x_max: -1250, y_min: 1250, y_max: 3750 },
      })
    );
    expect(card.isDrawing).toBe(false);
  });
});


interface Draw {
  name: string;
  args: any[];
  fill: unknown;
  stroke: unknown;
  lineWidth: unknown;
  alpha: unknown;
  font: unknown;
  /** How many save() calls are open when this call runs. */
  depth: number;
}

/**
 * A 2D context that notes every call with its arguments and the styles and
 * save depth it ran under. Styles are plain properties: restore() does not
 * put them back, so read the style a call ran under, not what a later call
 * inherits.
 */
function drawRecordingContext() {
  const draws: Draw[] = [];
  let depth = 0;
  const ctx = new Proxy({} as Record<string | symbol, any>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: any[]) => {
        if (prop === "restore") depth -= 1;
        draws.push({
          name: String(prop),
          args,
          fill: target.fillStyle,
          stroke: target.strokeStyle,
          lineWidth: target.lineWidth,
          alpha: target.globalAlpha,
          font: target.font,
          depth,
        });
        if (prop === "save") depth += 1;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx, draws };
}

/** A 2D context that notes the fill and stroke style each call ran under. */
function styleRecordingContext() {
  const draws: Array<[string, any, any]> = [];
  const ctx = new Proxy({} as Record<string | symbol, any>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {
        draws.push([String(prop), target.fillStyle, target.strokeStyle]);
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx, draws };
}

/**
 * The colors a zone and an in-progress shape are painted in.
 *
 * A zone's hue comes from its palette pair, picked by zone id so a zone keeps
 * its color when another one goes, and is outlined at full alpha. The fill's
 * alpha says whether its presence sensor is on: 0.45 on, 0.18 off, which is
 * also how a zone with no presence sensor draws.
 */
describe("zone map card drawing colors", () => {
  const RED = ["rgba(244, 67, 54, 0.18)", "rgba(244, 67, 54, 1)"];
  const BLUE = ["rgba(33, 150, 243, 0.18)", "rgba(33, 150, 243, 1)"];

  it("fills and outlines each zone with its id's palette pair", async () => {
    const hass = fakeHass({
      ...ZONE_PAYLOAD,
      zones: {
        "1": { shape: "rect", data: { x_min: -4000, x_max: -2000, y_min: 1000, y_max: 3000 } },
        "2": { shape: "ellipse", data: { cx: 0, cy: 5000, rx: 1000, ry: 800 } },
        "6": {
          shape: "polygon",
          data: {
            points: [
              { x: 1000, y: 6000 },
              { x: 4000, y: 6000 },
              { x: 2500, y: 9000 },
            ],
          },
        },
      },
    });
    const card = await mountCard(hass);
    const { ctx, draws } = styleRecordingContext();
    card.ctx = ctx;

    card.drawZones();

    const shapeDraws = draws.filter(([name]) =>
      ["fillRect", "strokeRect", "fill", "stroke"].includes(name)
    );
    expect(shapeDraws).toEqual([
      ["fillRect", ...RED],
      ["strokeRect", ...RED],
      ["fill", ...BLUE],
      ["stroke", ...BLUE],
      // Zone 6 wraps around the five-color palette to zone 1's pair.
      ["fill", ...RED],
      ["stroke", ...RED],
    ]);
  });

  /** From the first vertex dot on, each fill or stroke with the style it used. */
  function dotDraws(draws: Array<[string, any, any]>) {
    const first = draws.findIndex(([name]) => name === "arc");
    return draws
      .slice(first)
      .filter(([name]) => name === "fill" || name === "stroke")
      .map(([name, fill, stroke]) => [name, name === "fill" ? fill : stroke]);
  }

  it("draws each placed polygon vertex as a dot in the light theme's colors", async () => {
    const card = await mountCard(fakeHass(), { dark_mode: false });
    const { ctx, draws } = styleRecordingContext();
    card.ctx = ctx;
    startPolygon(card);

    card._drawInProgress();

    expect(draws.filter(([name]) => name === "arc")).toHaveLength(2);
    expect(dotDraws(draws)).toEqual([
      ["fill", "#000000"],
      ["stroke", "rgba(255,255,255,0.6)"],
      ["fill", "#000000"],
      ["stroke", "rgba(255,255,255,0.6)"],
    ]);
  });

  it("draws a rect's start point as a dot in the dark theme's colors", async () => {
    const card = await mountCard(fakeHass(), { dark_mode: true });
    const { ctx, draws } = styleRecordingContext();
    card.ctx = ctx;
    card.drawMode = "rect";
    card.isDrawing = true;
    card.startPoint = { x: 100, y: 100 };

    card._drawInProgress();

    expect(draws.filter(([name]) => name === "arc")).toHaveLength(1);
    expect(dotDraws(draws)).toEqual([
      ["fill", "#ffffff"],
      ["stroke", "rgba(0,0,0,0.6)"],
    ]);
  });
});

/**
 * Zones lit by their presence sensors, and ignore zones.
 *
 * The map used to draw every zone the same whatever its presence sensor said,
 * so it could not show which zone a target turned on. A detect zone now keeps
 * its hue and shows its sensor's state by alpha and dash: on is a strong fill
 * with a solid outline, off a faint fill with an [8, 6] dash, unavailable (the
 * radar is offline) a dashed grey. An ignore zone, where presence drops every
 * target before the other zones see it, is hatched grey and labeled so.
 */
describe("zone map card zone looks", () => {
  const PRESENCE = "binary_sensor.office_zone_1_presence";
  const RED_ON = "rgba(244, 67, 54, 0.45)";
  const RED_OFF = "rgba(244, 67, 54, 0.18)";
  const RED = "rgba(244, 67, 54, 1)";
  const WINDOW = { x_min: -4000, x_max: -2000, y_min: 1000, y_max: 3000 };

  /** ZONE_PAYLOAD's Doorway, naming `presence` as its sensor unless null,
   *  plus `extra` zones. */
  function payload(presence: string | null = PRESENCE, extra: Record<string, any> = {}) {
    const doorway: Record<string, any> = { ...ZONE_PAYLOAD.zones["1"] };
    if (presence !== null) doorway.presence_entity_id = presence;
    return { ...ZONE_PAYLOAD, zones: { "1": doorway, ...extra } };
  }

  async function looksCard(
    zones: any,
    states: Record<string, any> = {},
    config: Record<string, any> = {}
  ) {
    const hass = fakeHass(zones);
    const card = await mountCard(hass, { ...TEN_METER_GRID, ...config });
    hass.states = states;
    const { ctx, draws } = drawRecordingContext();
    card.ctx = ctx;
    return { card, hass, draws };
  }

  /** Each fill and stroke of a zone's shape, with the dash set before it. */
  function zoneDraws(draws: Draw[]) {
    let dash: number[] | null = null;
    const out: any[] = [];
    for (const draw of draws) {
      if (draw.name === "setLineDash") dash = draw.args[0];
      if (["fillRect", "fill"].includes(draw.name)) out.push([draw.name, draw.fill]);
      if (["strokeRect", "stroke"].includes(draw.name)) {
        out.push([draw.name, draw.stroke, draw.lineWidth, dash]);
      }
    }
    return out;
  }

  const labels = (draws: Draw[]) =>
    draws.filter((draw) => draw.name === "fillText").map((draw) => draw.args[0]);

  it("lights a zone whose presence sensor is on", async () => {
    const { card, draws } = await looksCard(payload(), {
      [PRESENCE]: { state: "on", attributes: {} },
    });

    card.drawZones();

    expect(zoneDraws(draws)).toEqual([
      ["fillRect", RED_ON],
      ["strokeRect", RED, 3, []],
    ]);
    expect(labels(draws)).toEqual(["Doorway"]);
  });

  it("dashes a zone whose presence sensor is off", async () => {
    const { card, draws } = await looksCard(payload(), {
      [PRESENCE]: { state: "off", attributes: {} },
    });

    card.drawZones();

    expect(zoneDraws(draws)).toEqual([
      ["fillRect", RED_OFF],
      ["strokeRect", RED, 2, [8, 6]],
    ]);
    // Set inside the zone's own save and restore, so it ends with the zone.
    const dashes = draws.filter((draw) => draw.name === "setLineDash");
    expect(dashes.map((draw) => [draw.args[0], draw.depth])).toEqual([[[8, 6], 1]]);
    const saves = draws.filter((draw) => draw.name === "save" && draw.depth === 0).length;
    const restores = draws.filter((draw) => draw.name === "restore" && draw.depth === 0).length;
    expect(saves).toBe(restores);
  });

  it("greys a zone whose presence sensor is unavailable", async () => {
    const offline = { [PRESENCE]: { state: "unavailable", attributes: {} } };
    const light = await looksCard(payload(), offline, { dark_mode: false });
    light.card.drawZones();
    expect(zoneDraws(light.draws)).toEqual([
      ["fillRect", "rgba(158, 158, 158, 0.18)"],
      ["strokeRect", "rgba(117, 117, 117, 0.9)", 2, [4, 4]],
    ]);

    const dark = await looksCard(payload(), offline, { dark_mode: true });
    dark.card.drawZones();
    expect(zoneDraws(dark.draws)).toEqual([
      ["fillRect", "rgba(138, 143, 152, 0.22)"],
      ["strokeRect", "rgba(160, 165, 175, 0.9)", 2, [4, 4]],
    ]);
  });

  it("draws a zone with no presence entity as off", async () => {
    // No id in the payload and none in the registry, a null id, a sensor
    // with no state yet, and one that is unknown all read as off.
    const cases: [any, Record<string, any>][] = [
      [payload(null), {}],
      [payload(null, {}), { [PRESENCE]: { state: "on", attributes: {} } }],
      [{ ...payload(null), zones: { "1": { ...payload(null).zones["1"], presence_entity_id: null } } }, {}],
      [payload(), {}],
      [payload(), { [PRESENCE]: { state: "unknown", attributes: {} } }],
    ];
    for (const [zones, states] of cases) {
      const { card, draws } = await looksCard(zones, states);
      card.drawZones();
      expect(zoneDraws(draws)).toEqual([
        ["fillRect", RED_OFF],
        ["strokeRect", RED, 2, [8, 6]],
      ]);
    }
  });

  it("labels a held zone (held)", async () => {
    // A held zone is on with nobody on the map, so its label says why.
    const { card, hass, draws } = await looksCard(payload(), {
      [PRESENCE]: { state: "on", attributes: { held: true } },
    });

    card.drawZones();
    expect(labels(draws)).toEqual(["Doorway (held)"]);
    expect(zoneDraws(draws)[0]).toEqual(["fillRect", RED_ON]);

    draws.length = 0;
    hass.states = { [PRESENCE]: { state: "on", attributes: { held: false } } };
    card.drawZones();
    expect(labels(draws)).toEqual(["Doorway"]);
  });

  it("finds a zone's presence sensor by its entity id pattern when the payload has none", async () => {
    // A 2.3.0 backend names no presence entity. The integration's own id for
    // zone 1's sensor on this radar still lights it.
    const { card, hass, draws } = await looksCard(payload(null), {
      [PRESENCE]: { state: "on", attributes: {} },
    });
    hass.entities = {
      "binary_sensor.office_zone_2_presence": { device_id: "dev123", platform: "apollo_mmwave" },
      [PRESENCE]: { device_id: "dev123", platform: "apollo_mmwave" },
      "binary_sensor.hall_zone_1_presence": { device_id: "other", platform: "apollo_mmwave" },
    };

    card.drawZones();

    expect(card._presenceEntityFor(1)).toBe(PRESENCE);
    expect(zoneDraws(draws)[0]).toEqual(["fillRect", RED_ON]);

    // The id the payload names wins over the pattern.
    const named = await looksCard(payload("binary_sensor.renamed"), {
      [PRESENCE]: { state: "on", attributes: {} },
      "binary_sensor.renamed": { state: "off", attributes: {} },
    });
    named.hass.entities = hass.entities;
    named.card.drawZones();
    expect(named.card._presenceEntityFor(1)).toBe("binary_sensor.renamed");
    expect(zoneDraws(named.draws)[0]).toEqual(["fillRect", RED_OFF]);
  });

  it("does not leak a line dash into the next frame", async () => {
    // Every dash a zone or a preview sets is undone by its own restore, so
    // the next frame's grid lines, previews and dots start solid.
    const { card, hass, draws } = await looksCard(
      payload(PRESENCE, {
        "2": {
          shape: "ellipse",
          data: { cx: 2500, cy: 6000, rx: 1000, ry: 800 },
          presence_entity_id: "binary_sensor.office_zone_2_presence",
        },
        "3": { shape: "rect", data: WINDOW, zone_type: "ignore" },
      }),
      {
        [PRESENCE]: { state: "off", attributes: {} },
        "binary_sensor.office_zone_2_presence": { state: "unavailable", attributes: {} },
        "sensor.a_x": { state: "500" },
        "sensor.a_y": { state: "2000" },
      },
      { start_locked: false, unit_display: true }
    );
    card._setSelectedZone(1);
    card.drawMode = "rect";
    card.isDrawing = true;
    card.startPoint = { x: 100, y: 100 };
    card._cursorPoint = { x: 300, y: 250 };
    card.hass = { ...hass };

    draws.length = 0;
    card.drawGrid();
    card.drawGrid();

    const dashes = draws.filter((draw) => draw.name === "setLineDash");
    expect(dashes.map((draw) => draw.args[0])).toEqual(
      expect.arrayContaining([[8, 6], [4, 4], [6, 4], [5, 5]])
    );
    expect(dashes.filter((draw) => draw.depth < 1)).toEqual([]);
    // Every save is restored within the frame.
    const last = draws[draws.length - 1];
    const depthAfter = last.depth + (last.name === "save" ? 1 : 0);
    expect(depthAfter).toBe(0);
    expect(draws.filter((draw) => draw.depth < 0)).toEqual([]);
  });

  it("hatches ignore zones and labels them (ignored)", async () => {
    const zones = payload(PRESENCE, { "2": { shape: "rect", data: WINDOW, name: "Fan", zone_type: "ignore" } });
    const { card, draws } = await looksCard(zones, { [PRESENCE]: { state: "on", attributes: {} } });
    const hatch = { pattern: "diagonal" };
    const createPattern = vi.fn((_tile: unknown, _repetition: string) => hatch);
    card.ctx.createPattern = createPattern;

    card.drawZones();

    // The ignore zone draws last, over any detect zone it overlaps.
    expect(zoneDraws(draws)).toEqual([
      ["fillRect", RED_ON],
      ["strokeRect", RED, 3, []],
      ["fillRect", hatch],
      ["strokeRect", "rgba(97, 97, 97, 0.9)", 2, [6, 4]],
    ]);
    expect(labels(draws)).toEqual(["Doorway", "Fan (ignored)"]);
    expect(createPattern).toHaveBeenCalledTimes(1);
    expect(createPattern.mock.calls[0][1]).toBe("repeat");
    expect((createPattern.mock.calls[0][0] as HTMLCanvasElement).width).toBe(12);

    // Made once, not on every frame.
    card.drawZones();
    expect(createPattern).toHaveBeenCalledTimes(1);
  });

  it("fills polygon zones by the even-odd rule presence uses", async () => {
    // A star drawn as one line goes around its center twice. Presence finds
    // nobody there (zone-map-geometry.test.ts), and the nonzero rule filled
    // it, or hatched it on an ignore zone. Walk can save such a shape.
    const star = (cx: number) =>
      [0, 2, 4, 1, 3].map((k) => ({
        x: cx + Math.round(1500 * Math.sin((2 * Math.PI * k) / 5)),
        y: Math.round(4000 - 1500 * Math.cos((2 * Math.PI * k) / 5)),
      }));
    const zones = payload(PRESENCE, {
      "2": { shape: "polygon", data: { points: star(-2000) }, name: "Star" },
      "3": { shape: "polygon", data: { points: star(2000) }, name: "Fan", zone_type: "ignore" },
    });
    const { card, draws } = await looksCard(zones);
    const hatch = { pattern: "diagonal" };
    card.ctx.createPattern = () => hatch;

    card.drawZones();

    // Doorway is a rect (fillRect); each star is filled by the even-odd
    // rule, the ignore zone's with its hatch.
    const fills = draws.filter((d) => d.name === "fill");
    expect(fills.map((d) => [d.args, d.fill === hatch])).toEqual([
      [["evenodd"], false],
      [["evenodd"], true],
    ]);
  });

  it("keeps each zone's label on the canvas", async () => {
    // Centered on a zone at a wall, a label ran off the canvas edge and lost
    // its start or its suffix.
    const LONG = "A".repeat(70);
    const rect = (x_min: number, x_max: number, y_min: number, y_max: number) => ({
      shape: "rect",
      data: { x_min, x_max, y_min, y_max },
    });
    const hass = fakeHass({
      ...ZONE_PAYLOAD,
      rotation_deg: 0,
      display_units: "ft",
      zones: {
        "1": { ...rect(-5400, -4800, 1000, 3000), name: "Window curtain", zone_type: "ignore" },
        "2": { ...rect(-1000, 1000, 2000, 3000), name: "Couch" },
        "3": {
          ...rect(4800, 5400, 4000, 6000),
          name: "Desk",
          presence_entity_id: "binary_sensor.desk",
        },
        "4": { ...rect(-1000, 1000, 0, 250), name: "Shelf" },
        "5": { ...rect(-3000, 3000, 7000, 8000), name: LONG },
      },
    });
    hass.states = { "binary_sensor.desk": { state: "on", attributes: { held: true } } };
    // Fitted to the cone in feet, as the dashboard's map is.
    const card = await mountCard(hass);
    expect(card._gridFromConfig).toBe(false);
    const { ctx, texts } = textRecordingContext(browserTextWidth);
    card.ctx = ctx;

    card.drawZones();

    const label = (text: string) => texts.find((t) => t.text === text)!;
    const width = card.canvas.width;
    // In by just enough, 2 px from the edge, on either side.
    expect(boxOf(label("Window curtain (ignored)")).left).toBeCloseTo(2, 9);
    expect(boxOf(label("Desk (held)")).right).toBeCloseTo(width - 2, 9);
    // Down from the top edge to half its height.
    expect(label("Shelf").y).toBe(12);
    // Wider than the canvas: centered on it.
    expect(label(LONG).x).toBe(width / 2);
    // A zone clear of the edges keeps its label on its center.
    const couch = label("Couch");
    const center = (a: number, b: number, axis: "x" | "y") =>
      (card.valueToPixels(a, axis) + card.valueToPixels(b, axis)) / 2;
    expect(couch.x).toBeCloseTo(center(-1000, 1000, "x"), 9);
    expect(couch.y).toBeCloseTo(center(2000, 3000, "y"), 9);
    // Every other label lies wholly on the canvas.
    expect(texts).toHaveLength(5);
    const off = texts.filter(
      (t) => t.text !== LONG && (boxOf(t).left < 0 || boxOf(t).right > width)
    );
    expect(off).toEqual([]);
  });

  it("draws no label for a zone wholly off the canvas", async () => {
    // A YAML grid smaller than the room, such as the one every card added
    // from the picker before 2.3.0 carries, beside a radar turned 90 degrees:
    // pulled onto the edge, the name of a zone off the map would label
    // whatever is drawn there.
    const rect = (x_min: number, x_max: number, y_min: number, y_max: number) => ({
      shape: "rect",
      data: { x_min, x_max, y_min, y_max },
    });
    const hass = fakeHass({
      ...ZONE_PAYLOAD,
      rotation_deg: 90,
      zones: {
        "1": { ...rect(1000, 3000, -3000, -1000), name: "Couch" },
        "2": { ...rect(1000, 3000, 1000, 3000), name: "Desk" },
        "3": { ...rect(-2000, -1000, -1000, 500), name: "Door" },
        "4": { shape: "ellipse", data: { cx: 7000, cy: 5000, rx: 500, ry: 500 }, name: "Plant" },
        "5": {
          shape: "polygon",
          data: {
            points: [
              { x: -8000, y: 1000 },
              { x: -7000, y: 1000 },
              { x: -7500, y: 2000 },
            ],
          },
          name: "Lamp",
        },
        "6": { ...rect(-1000, 1000, 12500, 13500), name: "Porch" },
      },
    });
    const card = await mountCard(hass, {
      grid: { x_min: -6000, x_max: 6000, y_min: 0, y_max: 12000 },
      grid_units: "mm",
    });
    const { ctx, texts } = textRecordingContext(browserTextWidth);
    card.ctx = ctx;

    card.drawZones();

    // Couch is above the canvas, Plant right of it, Lamp left of it and
    // Porch below it.
    expect(texts.map((t) => t.text).sort()).toEqual(["Desk", "Door"]);
    const label = (text: string) => texts.find((t) => t.text === text)!;
    const center = (a: number, b: number, axis: "x" | "y") =>
      (card.valueToPixels(a, axis) + card.valueToPixels(b, axis)) / 2;
    expect(label("Desk").x).toBeCloseTo(center(1000, 3000, "x"), 9);
    expect(label("Desk").y).toBeCloseTo(center(1000, 3000, "y"), 9);
    // Door reaches over the top edge, so its label is pulled onto the map.
    expect(label("Door").y).toBe(12);
  });

  it("fills an ignore zone flat when no pattern can be made", async () => {
    const zones = payload(PRESENCE, { "2": { shape: "rect", data: WINDOW, zone_type: "ignore" } });
    const ignored = (draws: Draw[]) => zoneDraws(draws).slice(2);

    // A context whose createPattern makes nothing, like the test contexts'.
    const light = await looksCard(zones, {}, { dark_mode: false });
    light.card.drawZones();
    expect(ignored(light.draws)).toEqual([
      ["fillRect", "rgba(97, 97, 97, 0.18)"],
      ["strokeRect", "rgba(97, 97, 97, 0.9)", 2, [6, 4]],
    ]);

    const dark = await looksCard(zones, {}, { dark_mode: true });
    dark.card.ctx.createPattern = () => {
      throw new Error("no patterns here");
    };
    dark.card.drawZones();
    expect(ignored(dark.draws)).toEqual([
      ["fillRect", "rgba(189, 189, 189, 0.16)"],
      ["strokeRect", "rgba(189, 189, 189, 0.9)", 2, [6, 4]],
    ]);

    const none = await looksCard(zones, {}, { dark_mode: false });
    none.card.ctx.createPattern = () => null;
    none.card.drawZones();
    expect(ignored(none.draws)[0]).toEqual(["fillRect", "rgba(97, 97, 97, 0.18)"]);
  });
});

/**
 * Canvas geometry and the shapes a gesture commits.
 *
 * setupCanvas fixes the bitmap at 800x800 px, so on the default grid (x
 * -5000..5000, y 0..10000 mm) one bitmap px is 12.5 mm on both axes, and y
 * grows downward from y_min on the top edge. happy-dom has no layout, so each
 * test gives the canvas its CSS box.
 */
describe("zone map card drawing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const DOORWAY = ZONE_PAYLOAD.zones["1"].data;

  function box(left: number, top: number, width: number, height: number): DOMRect {
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect;
  }

  /** Unlocked on ZONE_PAYLOAD with zone 1 (Doorway) selected in `mode`. */
  async function drawingCard(mode: string, layout = box(0, 0, 800, 800)) {
    const hass = fakeHass();
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false });
    expect(card.selectedZone).toBe(1);
    card._setDrawMode(mode);
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue(layout);
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  /** A mouse drag from `from` to `to`, with `init` (Alt held, say) on each
   *  event. */
  function drag(card: any, from: number[], to: number[], init: MouseEventInit = {}) {
    const mouse = (type: string, [x, y]: number[]) =>
      card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, ...init }));
    mouse("mousedown", from);
    mouse("mousemove", to);
    mouse("mouseup", to);
  }

  /** Let a resolved callService run on to its toast. */
  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function zoneSaves(hass: any): any[] {
    return hass.callService.mock.calls
      .filter((call: any[]) => call[1] === "update_zone")
      .map((call: any[]) => call[2]);
  }

  it("maps mm to bitmap px and back on the default grid, with y growing down", async () => {
    const card = await mountCard(fakeHass(), TEN_METER_GRID);

    expect([card.canvas.width, card.canvas.height]).toEqual([800, 800]);
    expect([card.pxPerX, card.pxPerY]).toEqual([0.08, 0.08]);
    expect(card.valueToPixels(-5000, "x")).toBe(0);
    expect(card.valueToPixels(0, "x")).toBeCloseTo(400, 9);
    expect(card.valueToPixels(5000, "x")).toBeCloseTo(800, 9);
    // y_min is the top edge, and a larger y is further down the canvas.
    expect(card.valueToPixels(0, "y")).toBe(0);
    expect(card.valueToPixels(2500, "y")).toBeCloseTo(200, 9);
    expect(card.valueToPixels(10000, "y")).toBeCloseTo(800, 9);
    expect(card.pixelsToValue(0, "x")).toBe(-5000);
    expect(card.pixelsToValue(200, "y")).toBeCloseTo(2500, 9);

    for (const value of [-5000, -1234.5, 0, 2500, 5000]) {
      expect(card.pixelsToValue(card.valueToPixels(value, "x"), "x")).toBeCloseTo(value, 6);
    }
    for (const value of [0, 1234.5, 5000, 10000]) {
      expect(card.pixelsToValue(card.valueToPixels(value, "y"), "y")).toBeCloseTo(value, 6);
    }
  });

  it("reads a pointer in bitmap px, scaled from the canvas's CSS box", async () => {
    // Laid out at 400x400 CSS px, 10 px in from the left and 20 px down.
    const { card } = await drawingCard("rect", box(10, 20, 400, 400));

    expect(card._getPointFromEvent({ clientX: 110, clientY: 70 })).toEqual({ x: 200, y: 100 });
    expect(card._getPointFromEvent({ clientX: 410, clientY: 420 })).toEqual({ x: 800, y: 800 });
  });

  it("saves an up-left rect drag with sorted, rounded corners, and Undo restores it", async () => {
    // 640 CSS px over the 800 px bitmap: one CSS px is 1.25 bitmap px, so the
    // release at CSS (81, 81) is bitmap (101.25, 101.25), (-3734.375, 1265.625) mm.
    // Alt is held, so the corners go where they are, in whole mm.
    const { card, hass, toasts } = await drawingCard("rect", box(0, 0, 640, 640));

    drag(card, [240, 240], [81, 81], { altKey: true });
    await settle();

    const rect = { x_min: -3734, x_max: -1250, y_min: 1266, y_max: 3750 };
    expect(zoneSaves(hass)).toEqual([
      { device_id: "dev123", zone_id: 1, shape: "rect", data: rect, input_units: "mm" },
    ]);
    expect(card.zones).toEqual([{ id: 1, shape: "rect", data: rect }]);
    expect(toasts).toEqual(["Doorway saved"]);
    expect(card._undoSnapshot).toEqual([{ zoneId: 1, shape: "rect", data: DOORWAY }]);
    expect(card.isDrawing).toBe(false);

    hass.callService.mockClear();
    card.shadowRoot.getElementById("btnUndo").click();
    await settle();

    expect(zoneSaves(hass)).toEqual([
      { device_id: "dev123", zone_id: 1, shape: "rect", data: DOORWAY, input_units: "mm" },
    ]);
    expect(card.zones).toEqual([{ id: 1, shape: "rect", data: DOORWAY }]);
    expect(toasts).toEqual(["Doorway saved", "Undid last zone change"]);
    expect(card._undoSnapshot).toBeNull();
    expect(card.shadowRoot.getElementById("btnUndo").disabled).toBe(true);
  });

  it("floors a flat ellipse's radius at 1 mm", async () => {
    const { card, hass } = await drawingCard("ellipse");

    drag(card, [100, 100], [100, 300]);

    expect(zoneSaves(hass).map((save) => save.data)).toEqual([
      { cx: -3750, cy: 2500, rx: 1, ry: 1250 },
    ]);
  });

  it("commits at most 32 vertices of a longer polygon, each clamped and rounded", async () => {
    const { card, hass, toasts } = await drawingCard("polygon");
    // The click path auto-finishes at 32 points, so only a longer list handed
    // to finishPolygon reaches its own cap.
    const vertices = Array.from({ length: 40 }, (_, i) => ({
      x: -4000 + 200 * i + 0.3,
      y: 250 * i + 0.7,
    }));
    vertices[0] = { x: -5200.4, y: 120.6 }; // past the left edge
    vertices[1] = { x: -4800.6, y: -30 }; // above the top edge
    vertices[31] = { x: 5300, y: 10400 }; // past the far corner, the last one kept
    card._polyPoints = vertices;
    card.isDrawing = true;

    card.finishPolygon();
    await settle();

    const saves = zoneSaves(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual(
      expect.objectContaining({ device_id: "dev123", zone_id: 1, shape: "polygon" })
    );
    const points = saves[0].data.points;
    expect(points).toHaveLength(32);
    expect(points.slice(0, 3)).toEqual([
      { x: -5000, y: 121 },
      { x: -4801, y: 0 },
      { x: -3600, y: 501 },
    ]);
    expect(points.slice(30)).toEqual([
      { x: 2000, y: 7501 },
      { x: 5000, y: 10000 },
    ]);
    for (const { x, y } of points) {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(x >= card.xMin && x <= card.xMax && y >= card.yMin && y <= card.yMax).toBe(true);
    }
    expect(card.zones).toEqual([{ id: 1, shape: "polygon", data: { points } }]);
    expect(toasts).toEqual(["Doorway saved"]);
    expect(card._undoSnapshot).toEqual([{ zoneId: 1, shape: "rect", data: DOORWAY }]);
    expect(card._polyPoints).toEqual([]);
    expect(card.isDrawing).toBe(false);
  });
});

/**
 * The size readout while a shape is drawn.
 *
 * A rect or ellipse drag, and a polygon's corners with the pointer, show
 * their width by depth in the map's unit on a plate over the pointer: 28 CSS
 * px above a mouse pointer, 64 above a finger. Where that would leave the top
 * of the canvas, a mouse pointer's goes as far below, and a finger's beside
 * it, or as far below where it does not fit beside it. The numbers come from
 * the same _shapeFromDrag the save uses, so the readout says what letting go
 * saves.
 * Facing ahead on the 10 m grid, canvas (100, 100) is (-3750, 1250) mm.
 */
describe("zone map card size readout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Unlocked on ZONE_PAYLOAD with zone 1 (Doorway) selected in `mode`. */
  async function drawingCard(mode: string, { feet = false, cssWidth = 800 } = {}) {
    const hass = fakeHass();
    if (feet) hass.config = { unit_system: { length: "mi" } };
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false });
    expect(card.selectedZone).toBe(1);
    card._setDrawMode(mode);
    layOut(card, cssWidth);
    hass.callService.mockClear();
    return { card, hass };
  }

  function mouse(card: any, type: string, x: number, y: number) {
    card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
  }

  function touch(card: any, type: string, x: number, y: number) {
    const point = { clientX: x, clientY: y };
    card.canvas.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), {
        touches: type === "touchend" ? [] : [point],
        changedTouches: [point],
      })
    );
  }

  /** The readouts one frame draws: text, center, font and the plate under it. */
  function readouts(card: any) {
    const { ctx, draws } = drawRecordingContext();
    card.ctx = ctx;
    card.drawGrid();
    return draws.flatMap((draw, i) => {
      if (draw.name !== "fillText" || !String(draw.args[0]).includes(" × ")) return [];
      const plate = draws[i - 1];
      expect(plate.name).toBe("fillRect");
      const [left, top, width, height] = plate.args;
      return [
        {
          text: draw.args[0],
          x: draw.args[1],
          y: draw.args[2],
          font: draw.font,
          plateCenter: [left + width / 2, top + height / 2].map((v) => Math.round(v * 1e6) / 1e6),
          plateFill: plate.fill,
          depth: draw.depth,
        },
      ];
    });
  }

  function zoneSaves(hass: any): any[] {
    return hass.callService.mock.calls
      .filter((call: any[]) => call[1] === "update_zone")
      .map((call: any[]) => call[2]);
  }

  it("shows the rect's size while drawing, in meters", async () => {
    const { card } = await drawingCard("rect");
    mouse(card, "mousedown", 100, 100);
    // Nothing to measure before the pointer moves.
    expect(readouts(card)).toEqual([]);

    mouse(card, "mousemove", 300, 250);

    // 2500 by 1875 mm, whose far corner snaps to 3150 mm (5 cm on this 0.5 m
    // grid), so 2500 by 1900 mm, read to the centimeter the snap needs.
    // Centered 28 px above the pointer on a plate in the canvas color,
    // inside its own save and restore.
    expect(readouts(card)).toEqual([
      {
        text: "2.50 m × 1.90 m",
        x: 300,
        y: 222,
        font: "bold 14px sans-serif",
        plateCenter: [300, 222],
        plateFill: "#ffffff",
        depth: 1,
      },
    ]);

    // Gone once the rect is saved.
    mouse(card, "mouseup", 300, 250);
    expect(readouts(card)).toEqual([]);
  });

  it("shows the rect's size while drawing, in feet and inches", async () => {
    const { card } = await drawingCard("rect", { feet: true });
    expect(card._displayUnit()).toBe("ft");
    mouse(card, "mousedown", 100, 100);
    mouse(card, "mousemove", 300, 250);

    // On this map's 2 ft grid the corners snap to 2 in: x -148 to -50 in and
    // y 50 to 124 in, 98 by 74 inches, read in whole inches.
    expect(readouts(card).map((r) => r.text)).toEqual(["8 ft 2 in × 6 ft 2 in"]);

    // The switch over the map changes the readout mid-drag. The first corner
    // stays where it was placed (-3759, 1270 mm), and the pointer's corner
    // snaps to 5 cm now: (-1250, 3150) mm.
    card.shadowRoot.getElementById("btnUnitM").click();
    expect(card.isDrawing).toBe(true);
    expect(readouts(card).map((r) => r.text)).toEqual(["2.51 m × 1.88 m"]);
  });

  it("shows the size the save will carry", async () => {
    // A finger dragged past the bottom right corner keeps reporting, and the
    // shape stops at the map's edge: 3750..5000 by 8750..10000 mm. The 2.5 m
    // the finger travelled is not what gets saved.
    for (const mode of ["rect", "ellipse"]) {
      const { card, hass } = await drawingCard(mode);
      touch(card, "touchstart", 700, 700);
      touch(card, "touchmove", 900, 900);
      const shown = readouts(card);
      touch(card, "touchend", 900, 900);

      const [save] = zoneSaves(hass);
      const data = save.data;
      const size =
        mode === "rect"
          ? [data.x_max - data.x_min, data.y_max - data.y_min]
          : [2 * data.rx, 2 * data.ry];
      expect(size).toEqual([1250, 1250]);
      expect(shown.map((r) => r.text)).toEqual(["1.25 m × 1.25 m"]);
      // Kept on the canvas, by the corner the shape stops at.
      const [{ x, y }] = shown;
      expect(x).toBeLessThan(800);
      expect(y).toBeLessThan(800);
    }
  });

  it("raises the readout above a finger", async () => {
    const { card } = await drawingCard("rect");
    touch(card, "touchstart", 100, 100);
    touch(card, "touchmove", 300, 400);
    expect(readouts(card).map((r) => [r.x, r.y])).toEqual([[300, 336]]);
    touch(card, "touchend", 300, 400);

    // A mouse pointer covers less, so the readout sits closer.
    mouse(card, "mousedown", 100, 100);
    mouse(card, "mousemove", 300, 400);
    expect(readouts(card).map((r) => [r.x, r.y])).toEqual([[300, 372]]);

    // At the top edge a mouse pointer's goes as far below the pointer
    // instead.
    mouse(card, "mousemove", 300, 20);
    expect(readouts(card).map((r) => [r.x, r.y])).toEqual([[300, 48]]);
    mouse(card, "mouseup", 300, 20);
    // A finger's would sit under the fingertip there, so it goes beside the
    // finger at its height, on the side with more room, its near edge 44 px
    // from the touch. The plate is 138 px wide here ("2.50 m × 3.10 m" by
    // the canvas's fallback estimate, and its padding).
    touch(card, "touchstart", 100, 300);
    touch(card, "touchmove", 300, 50);
    expect(readouts(card).map((r) => [r.x, r.y])).toEqual([[300 + 44 + 69, 50]]);
    touch(card, "touchend", 300, 50);
    touch(card, "touchstart", 700, 300);
    touch(card, "touchmove", 500, 30);
    expect(readouts(card).map((r) => [r.text, r.x, r.y])).toEqual([
      ["2.50 m × 3.35 m", 500 - 44 - 69, 30],
    ]);
    touch(card, "touchend", 500, 30);

    // Sized in CSS px: on a card shown at 400 px, each is twice as many
    // backing px, and the font with them.
    layOut(card, 400);
    touch(card, "touchstart", 50, 50);
    touch(card, "touchmove", 150, 200);
    expect(readouts(card).map((r) => [r.x, r.y, r.font])).toEqual([
      [300, 400 - 128, "bold 28px sans-serif"],
    ]);
    touch(card, "touchend", 150, 200);
    // Beside the finger too: 88 backing px from it, the 276 px plate kept
    // on the canvas.
    touch(card, "touchstart", 300, 150);
    touch(card, "touchmove", 100, 20);
    expect(readouts(card).map((r) => [r.x, r.y])).toEqual([[200 + 88 + 138, 40]]);
  });

  it("puts the readout below a finger where it does not fit beside it", async () => {
    // On a card shown 240 px wide the plate is 139 CSS px ("2.50 m × 3.75 m"
    // by the canvas's fallback estimate, and its padding). With its near
    // edge 44 px from the finger it needs 183 px beside it, more than either
    // half of the canvas. Pulled back onto the canvas it sat under the
    // fingertip, so it goes as far below the finger as a mouse pointer's.
    const { card } = await drawingCard("rect", { cssWidth: 240 });
    const scale = 800 / 240;
    touch(card, "touchstart", 60, 100);
    touch(card, "touchmove", 120, 10);

    const [readout] = readouts(card);
    expect(readout.text).toBe("2.50 m × 3.75 m");
    expect(readout.plateCenter[0]).toBeCloseTo(120 * scale, 6);
    expect(readout.plateCenter[1]).toBeCloseTo((10 + 64) * scale, 6);
  });

  it("draws the readout over the targets", async () => {
    // Facing ahead, so target a at (-1250, 4200) mm is at canvas (300, 336),
    // where the readout over a finger at (300, 400) goes.
    const hass = fakeHass({ ...ZONE_PAYLOAD, rotation_deg: 0 });
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false });
    card._setDrawMode("rect");
    layOut(card, 800);
    card.hass = {
      ...hass,
      states: { "sensor.a_x": { state: "-1250" }, "sensor.a_y": { state: "4200" } },
    };
    touch(card, "touchstart", 100, 100);
    touch(card, "touchmove", 300, 400);

    const { ctx, draws } = drawRecordingContext();
    card.ctx = ctx;
    card.drawGrid();

    const text = draws.findIndex(
      (d) => d.name === "fillText" && String(d.args[0]).includes(" × ")
    );
    expect(draws[text].args.slice(1)).toEqual([300, 336]);
    const dot = draws.filter((d) => d.name === "arc" && d.args[0] === 300 && d.args[1] === 336);
    expect(dot.map((d) => d.args[2])).toEqual([17, 10]);
    // The dot is drawn first, and nothing is drawn over the readout.
    expect(draws.indexOf(dot[1])).toBeLessThan(text);
    expect(
      draws.slice(text + 1).filter((d) => ["arc", "fillRect", "fill", "stroke"].includes(d.name))
    ).toEqual([]);
  });

  it("measures a polygon's corners and the pointer", async () => {
    const { card } = await drawingCard("polygon");
    const click = (x: number, y: number) => {
      card._lastPolyTap = 0;
      mouse(card, "mousedown", x, y);
      mouse(card, "mouseup", x, y);
    };
    click(100, 100);
    // The pointer still on the first corner has nothing to measure.
    expect(readouts(card)).toEqual([]);

    mouse(card, "mousemove", 300, 100);
    expect(readouts(card).map((r) => [r.text, r.x, r.y])).toEqual([
      ["2.50 m × 0.00 m", 300, 72],
    ]);

    click(300, 100);
    mouse(card, "mousemove", 200, 400);
    // The box around (-3750, 1250), (-1250, 1250) and the pointer at
    // (-2500, 5000) mm, to the centimeter the 5 cm snap needs.
    expect(readouts(card).map((r) => r.text)).toEqual(["2.50 m × 3.75 m"]);
  });
});

/**
 * Corners snap while a zone is drawn by hand.
 *
 * A corner lands on the nearest round value in the map's unit, about a
 * tenth of the grid step shown: on the 20 m grid here (40 px a meter, 1 m
 * lines) that is 10 cm, and 25 mm a px, so canvas (x, y) is
 * (-10000 + 25 x, 25 y) mm. Alt or Option held places a corner freely. The
 * save carries the snapped point in whole mm, and the size readout shows the
 * snapped size.
 */
describe("zone map card corner snapping", () => {
  const TWENTY_METER_GRID = { grid: { x_min: -10000, x_max: 10000, y_min: 0, y_max: 20000 } };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function drawingCard(
    mode: string,
    { feet = false, grid = TWENTY_METER_GRID }: { feet?: boolean; grid?: any } = {}
  ) {
    const hass = fakeHass();
    if (feet) hass.config = { unit_system: { length: "mi" } };
    const card = await mountCard(hass, { ...grid, start_locked: false });
    expect(card.selectedZone).toBe(1);
    card._setDrawMode(mode);
    layOut(card, 800);
    hass.callService.mockClear();
    return { card, hass };
  }

  function mouse(card: any, type: string, x: number, y: number, init: MouseEventInit = {}) {
    card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, ...init }));
  }

  function key(type: "keydown" | "keyup", name: string) {
    window.dispatchEvent(new KeyboardEvent(type, { key: name, altKey: type === "keydown" }));
  }

  function zoneSaves(hass: any): any[] {
    return hass.callService.mock.calls
      .filter((call: any[]) => call[1] === "update_zone")
      .map((call: any[]) => call[2].data);
  }

  function frame(card: any): Draw[] {
    const { ctx, draws } = drawRecordingContext();
    card.ctx = ctx;
    card.drawGrid();
    return draws;
  }

  const readouts = (draws: Draw[]) =>
    draws
      .filter((d) => d.name === "fillText" && String(d.args[0]).includes(" × "))
      .map((d) => d.args[0]);

  it("snaps a rect's corners to 10 cm at a 1 m grid, and shows the snapped size", async () => {
    const { card, hass } = await drawingCard("rect");
    expect(card._computeGridMetrics().stepX).toBe(1000);
    expect(card._snapStep()).toBe(100);

    // (-7425, 2525) mm to (-2475, 6175) mm.
    mouse(card, "mousedown", 103, 101);
    mouse(card, "mousemove", 301, 247);
    const draws = frame(card);
    expect(readouts(draws)).toEqual(["4.9 m × 3.7 m"]);
    // The preview, drawn after the zones, outlines the snapped corners:
    // (-7400, 2500) to (-2500, 6200) mm, canvas (104, 100) to (300, 248).
    const rects = draws.filter((d) => d.name === "strokeRect");
    const preview = rects[rects.length - 1];
    expect(preview?.args.map((v: number) => Math.round(v * 1e6) / 1e6)).toEqual([
      104, 100, 196, 148,
    ]);
    mouse(card, "mouseup", 301, 247);

    expect(zoneSaves(hass)).toEqual([{ x_min: -7400, x_max: -2500, y_min: 2500, y_max: 6200 }]);
  });

  it("places a corner freely while Alt or Option is held", async () => {
    const { card, hass } = await drawingCard("rect");
    mouse(card, "mousedown", 103, 101, { altKey: true });
    mouse(card, "mousemove", 301, 247, { altKey: true });
    expect(readouts(frame(card))).toEqual(["5.0 m × 3.6 m"]);
    mouse(card, "mouseup", 301, 247, { altKey: true });

    expect(zoneSaves(hass)).toEqual([{ x_min: -7425, x_max: -2475, y_min: 2525, y_max: 6175 }]);
  });

  it("keeps each corner as it was placed: the press snapped, the release free", async () => {
    const { card, hass } = await drawingCard("rect");
    mouse(card, "mousedown", 103, 101);
    mouse(card, "mousemove", 301, 247);
    mouse(card, "mouseup", 301, 247, { altKey: true });

    expect(zoneSaves(hass)).toEqual([{ x_min: -7400, x_max: -2475, y_min: 2500, y_max: 6175 }]);
  });

  it("follows Alt pressed and let go mid-drag, with no move needed", async () => {
    // TEN_METER_GRID: 0.5 m lines, 5 cm snaps, read to the centimeter, and
    // 12.5 mm a px. The press at (-3712.5, 1262.5) mm snaps to (-3700, 1250)
    // and the pointer at (-1237.5, 3087.5) to (-1250, 3100).
    const { card, hass } = await drawingCard("rect", { grid: TEN_METER_GRID });
    mouse(card, "mousedown", 103, 101);
    mouse(card, "mousemove", 301, 247);
    expect(readouts(frame(card))).toEqual(["2.45 m × 1.85 m"]);

    key("keydown", "Alt");
    // The first corner stays where the press put it; the pointer's is free.
    expect(readouts(frame(card))).toEqual(["2.46 m × 1.84 m"]);
    key("keyup", "Alt");
    expect(readouts(frame(card))).toEqual(["2.45 m × 1.85 m"]);

    mouse(card, "mouseup", 301, 247);
    expect(zoneSaves(hass)).toEqual([{ x_min: -3700, x_max: -1250, y_min: 1250, y_max: 3100 }]);
  });

  it("snaps an ellipse's corners before its center and radii", async () => {
    const { card, hass } = await drawingCard("ellipse");
    mouse(card, "mousedown", 103, 101);
    // A press, and a move under half a snap, measure nothing yet: the
    // pointer's corner is still on the first.
    expect(readouts(frame(card))).toEqual([]);
    mouse(card, "mousemove", 104, 101);
    expect(readouts(frame(card))).toEqual([]);
    mouse(card, "mousemove", 301, 247);
    mouse(card, "mouseup", 301, 247);

    // The box (-7400, 2500) to (-2500, 6200) mm.
    expect(zoneSaves(hass)).toEqual([{ cx: -4950, cy: 4350, rx: 2450, ry: 1850 }]);
  });

  it("snaps each polygon corner as it is placed, and Alt places one freely", async () => {
    const { card, hass } = await drawingCard("polygon");
    const click = (x: number, y: number, init: MouseEventInit = {}) => {
      card._lastPolyTap = 0;
      mouse(card, "mousedown", x, y, init);
      mouse(card, "mouseup", x, y, init);
    };
    click(103, 101);
    click(301, 103);
    // The pointer's corner snaps before the readout measures it: the box
    // around (-7400, 2500), (-2500, 2600) and (-5000, 6200) mm.
    mouse(card, "mousemove", 201, 247);
    expect(readouts(frame(card))).toEqual(["4.9 m × 3.7 m"]);
    click(201, 247, { altKey: true });
    card.finishPolygon();

    expect(zoneSaves(hass)).toEqual([
      {
        points: [
          { x: -7400, y: 2500 },
          { x: -2500, y: 2600 },
          { x: -4975, y: 6175 },
        ],
      },
    ]);
  });

  it("snaps to whole inches in feet, saved in whole mm", async () => {
    // TEN_METER_GRID in feet: 2 ft lines, so 2 in snaps (50.8 mm), and
    // 12.5 mm a px.
    const { card, hass } = await drawingCard("rect", { feet: true, grid: TEN_METER_GRID });
    expect(card._computeGridMetrics().stepX).toBeCloseTo(609.6, 9);
    expect(card._snapStep()).toBeCloseTo(50.8, 9);

    // (-3712.5, 1262.5) mm to (-1237.5, 3087.5) mm: -146 to -48 in across,
    // 50 to 122 in down once snapped.
    mouse(card, "mousedown", 103, 101);
    mouse(card, "mousemove", 301, 247);
    expect(readouts(frame(card))).toEqual(["8 ft 2 in × 6 ft"]);
    mouse(card, "mouseup", 301, 247);

    const [rect] = zoneSaves(hass);
    expect(rect).toEqual({ x_min: -3708, x_max: -1219, y_min: 1270, y_max: 3099 });
    // Each within half a mm of a whole number of inches.
    for (const mm of Object.values(rect) as number[]) {
      const inches = mm / 25.4;
      expect(Math.abs(inches - Math.round(inches)) * 25.4).toBeLessThanOrEqual(0.5);
    }
  });

  it("snaps finer as the map zooms in, and reads the size to the centimeter", async () => {
    const { card, hass } = await drawingCard("rect");
    // 4x on the map's middle: 160 px a meter, 0.5 m lines, 5 cm snaps. The
    // window is -2500 to 2500 by 7500 to 12500 mm, 6.25 mm a px.
    card._setView({ zoom: 4, cx: 0, cy: 10000 });
    expect(card._computeGridMetrics().stepX).toBe(500);
    expect(card._snapStep()).toBe(50);

    // (-1856.25, 8131.25) mm to (-618.75, 9043.75) mm.
    mouse(card, "mousedown", 103, 101);
    mouse(card, "mousemove", 301, 247);
    expect(readouts(frame(card))).toEqual(["1.25 m × 0.90 m"]);
    mouse(card, "mouseup", 301, 247);

    expect(zoneSaves(hass)).toEqual([{ x_min: -1850, x_max: -600, y_min: 8150, y_max: 9050 }]);
  });
});

/**
 * Marking a zone's corners by walking to them (Walk).
 *
 * An administrator on an unlocked map presses 🚶 in the drawing modes, walks
 * to each corner of the zone with a phone, stands still for about 3 seconds
 * (the radar updates each axis about once a second) and presses Corner here.
 * The corner is where the radar saw them over the last 1.5 s, weighted by
 * time. Two corners save a rectangle and three or more a polygon, through
 * the same commit a drawn shape takes. Only one person may be in view;
 * targets inside ignore zones do not count. Facing ahead on the 10 m grid,
 * (x, y) mm is canvas (400 + x / 12.5, y / 12.5).
 */
describe("zone map card walk", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  const PAIRS = [
    { x: "sensor.a_x", y: "sensor.a_y" },
    { x: "sensor.b_x", y: "sensor.b_y" },
  ];
  // An ignore zone over a fan, where target b moves.
  const FAN = {
    shape: "rect",
    data: { x_min: 2000, x_max: 4000, y_min: 4000, y_max: 6000 },
    zone_type: "ignore",
  };
  const WITH_FAN = { zones: { ...ZONE_PAYLOAD.zones, "2": FAN } };

  const HINT = {
    nobody: "Nobody is on the map. Walk into the radar's view.",
    crowd:
      "More than one target is on the map. Only the person marking corners should be in view. If you are alone, a fan or curtain may be moving: add an ignore zone over it.",
    start: "Stand still in one corner of the zone for about 3 seconds, then press Corner here.",
  };

  /**
   * An administrator's card, unlocked, with zone 1 (Doorway) selected,
   * tracking pairs a and b. `at` puts a target at (x, y) mm, or off the map
   * with null. The clock is faked, performance.now() included.
   */
  async function walkCard({
    admin = true,
    config = {},
    payload = {},
  }: { admin?: boolean; config?: Record<string, any>; payload?: Record<string, any> } = {}) {
    vi.useFakeTimers();
    const hass = fakeHass({ ...ZONE_PAYLOAD, rotation_deg: 0, entities: PAIRS, ...payload });
    hass.user = { is_admin: admin };
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false, ...config });
    hass.callService.mockClear();
    const toasts = notifications(card);
    let states: Record<string, any> = {};
    const at: PutTarget = (pair, x, y = 0) => {
      const reading = (value: number) => ({ state: x === null ? "0" : String(value) });
      states = {
        ...states,
        [`sensor.${pair}_x`]: reading(x ?? 0),
        [`sensor.${pair}_y`]: reading(y),
      };
      card.hass = { ...hass, states };
    };
    return { card, hass, toasts, at };
  }

  type PutTarget = (pair: "a" | "b", x: number | null, y?: number) => void;

  const $ = (card: any, id: string) => card.shadowRoot.getElementById(id);

  /** Target a stands at (x, y) mm for 2 s, which puts the corner exactly
   *  there, and Corner here is pressed. */
  function markCorner(card: any, at: PutTarget, x: number, y: number) {
    at("a", x, y);
    vi.advanceTimersByTime(2000);
    $(card, "btnWalkCorner").click();
  }

  /** Let a save's promise run on to its toast, under the fake clock. */
  async function settle() {
    await vi.advanceTimersByTimeAsync(0);
  }

  function frame(card: any): Draw[] {
    const { ctx, draws } = drawRecordingContext();
    card.ctx = ctx;
    card.drawGrid();
    return draws;
  }

  /** The size readouts a frame drew: [text, x, y]. */
  const readouts = (draws: Draw[]) =>
    draws
      .filter((d) => d.name === "fillText" && String(d.args[0]).includes(" × "))
      .map((d) => d.args);

  it("shows Walk only to administrators", async () => {
    const viewer = await walkCard({ admin: false });
    expect($(viewer.card, "btnModeWalk").style.display).toBe("none");
    // Nothing that still reaches the hidden button starts a walk.
    $(viewer.card, "btnModeWalk").click();
    expect(viewer.card._walk).toBeNull();
    expect(viewer.card.drawMode).toBe("rect");

    const { card, hass } = await walkCard();
    expect($(card, "btnModeWalk").style.display).toBe("");
    card.render();
    expect($(card, "btnModeWalk").style.display).toBe("");

    // A viewer who stops being an administrator loses it, and a walk under
    // way ends.
    $(card, "btnModeWalk").click();
    expect(card.drawMode).toBe("walk");
    card.hass = { ...hass, user: { is_admin: false } };
    expect($(card, "btnModeWalk").style.display).toBe("none");
    expect(card.drawMode).toBe("rect");
    expect(card._walk).toBeNull();
    expect($(card, "walkPanel").hidden).toBe(true);
  });

  it("names the Walk button for screen readers", async () => {
    const { card } = await walkCard();
    const button = $(card, "btnModeWalk");

    expect(button.textContent).toBe("🚶");
    expect(button.title).toBe("Mark corners by walking");
    expect(button.getAttribute("aria-label")).toBe("Mark corners by walking");
    // Between Undo point and Polygon in the drawing modes.
    expect(Array.from($(card, "modeGroup").children, (el: any) => el.id)).toEqual([
      "btnPolyFinish",
      "btnPolyUndo",
      "btnModeWalk",
      "btnModePolygon",
      "btnModeEllipse",
      "btnModeRect",
    ]);
    // Marked as the mode in use while Walk is on.
    button.click();
    expect(button.classList.contains("active")).toBe(true);
    expect($(card, "btnModeRect").classList.contains("active")).toBe(false);
  });

  it("offers Walk as a labeled chip beside Coverage on a phone", async () => {
    // On a phone 🚶 alone among the drawing modes is easy to miss, so the
    // row under the map names it. A mouse never sees the chip.
    const { card, hass } = await walkCard();
    const chip = $(card, "btnWalkChip");
    expect(chip.textContent).toBe("🚶 Mark corners by walking");
    expect(chip.hidden).toBe(false);
    expect(Array.from($(card, "viewTools").children, (el: any) => el.id).slice(0, 2)).toEqual([
      "btnWalkChip",
      "btnCoverage",
    ]);
    const css = card.shadowRoot.querySelector("style").textContent;
    expect(css).toContain(".walk-chip { display: none; }");
    expect(css).toContain(
      "@media (pointer: coarse) { .walk-chip:not([hidden]) { display: inline-block; } }"
    );

    // It starts Walk, and makes way for Walk's panel until the walk ends.
    chip.click();
    expect(card.drawMode).toBe("walk");
    expect($(card, "walkPanel").hidden).toBe(false);
    expect(chip.hidden).toBe(true);
    $(card, "btnWalkCancel").click();
    expect(card.drawMode).toBe("rect");
    expect(chip.hidden).toBe(false);

    // A rebuilt card keeps it, and a viewer who is not an administrator
    // never has it.
    card.render();
    expect($(card, "btnWalkChip").hidden).toBe(false);
    card.hass = { ...hass, user: { is_admin: false } };
    expect($(card, "btnWalkChip").hidden).toBe(true);
    const viewer = await walkCard({ admin: false });
    expect($(viewer.card, "btnWalkChip").hidden).toBe(true);
  });

  it("says how to unlock when the Walk chip is pressed on a locked map", async () => {
    const { card, toasts } = await walkCard({ config: { start_locked: true } });
    expect($(card, "btnWalkChip").hidden).toBe(false);

    $(card, "btnWalkChip").click();

    expect(toasts).toEqual(["Unlock the map to draw zones."]);
    expect(card._walk).toBeNull();
  });

  it("refuses Walk on a locked map with the lock toast", async () => {
    const { card, toasts } = await walkCard({ config: { start_locked: true } });
    expect(card.isLocked).toBe(true);
    // Shown on a locked map too, where a press says how to unlock.
    expect($(card, "btnModeWalk").style.display).toBe("");

    $(card, "btnModeWalk").click();

    expect(toasts).toEqual(["Unlock the map to draw zones."]);
    expect($(card, "btnLock").classList.contains("nudge")).toBe(true);
    expect(card.drawMode).toBe("rect");
    expect(card._walk).toBeNull();
    expect($(card, "walkPanel").hidden).toBe(true);
  });

  it("Corner here averages the last 1.5 s of the only visible target", async () => {
    const { card, at } = await walkCard();
    $(card, "btnModeWalk").click();
    // Walking in along y = 2000 mm, then standing at x = -1000.
    at("a", -3000, 2000);
    vi.advanceTimersByTime(500);
    at("a", -2000, 2000);
    vi.advanceTimersByTime(500);
    at("a", -1000, 2000);
    vi.advanceTimersByTime(1000);

    $(card, "btnWalkCorner").click();

    // -2000 for the first 0.5 s of the window, -1000 for the last 1 s. Home
    // Assistant sends changes only, so the plain mean of the samples, -2000,
    // would lean back toward the way in.
    expect(card._walk.corners).toHaveLength(1);
    const [corner] = card._walk.corners;
    expect(corner.x).toBeCloseTo(-4000 / 3, 6);
    expect(corner.y).toBe(2000);
  });

  it("Corner here falls back to the current reading of a still target", async () => {
    // Target b is the fan, whose moves keep pushes coming.
    const { card, at } = await walkCard({ payload: WITH_FAN });
    $(card, "btnModeWalk").click();
    at("a", -2000, 2000);
    vi.advanceTimersByTime(300);
    at("a", -1000, 2000);
    // Someone standing still sends nothing new, so after 3 s the pushes the
    // fan makes have pruned every sample of theirs.
    for (let i = 0; i < 8; i += 1) {
      vi.advanceTimersByTime(500);
      at("b", 3000 + (i % 2) * 100, 5000);
    }
    expect(card._trails.samples(0)).toEqual([]);

    $(card, "btnWalkCorner").click();

    expect(card._walk.corners).toEqual([{ x: -1000, y: 2000 }]);
  });

  it("Corner here is disabled with nobody or two people in view", async () => {
    const { card, at } = await walkCard();
    $(card, "btnModeWalk").click();
    const corner = $(card, "btnWalkCorner");
    const hint = $(card, "walkHint");

    expect($(card, "walkPanel").hidden).toBe(false);
    expect(hint.getAttribute("aria-live")).toBe("polite");
    expect(corner.disabled).toBe(true);
    expect(hint.textContent).toBe(HINT.nobody);

    at("a", -1000, 2000);
    expect(corner.disabled).toBe(false);
    expect(hint.textContent).toBe(HINT.start);
    // A step that leaves one person in view changes nothing the panel
    // shows, so the panel is left alone.
    hint.textContent = "as it was";
    at("a", -900, 2000);
    expect(hint.textContent).toBe("as it was");

    at("b", 1000, 2000);
    expect(corner.disabled).toBe(true);
    expect(hint.textContent).toBe(HINT.crowd);
    // A press that beat the push marks nothing.
    vi.advanceTimersByTime(2000);
    card._walkCorner();
    expect(card._walk.corners).toEqual([]);

    at("b", null);
    expect(corner.disabled).toBe(false);
    expect(hint.textContent).toBe(HINT.start);
  });

  it("targets inside ignore zones do not count for Walk", async () => {
    const { card, at } = await walkCard({ payload: WITH_FAN });
    $(card, "btnModeWalk").click();
    const corner = $(card, "btnWalkCorner");

    at("b", 3000, 5000);
    expect(corner.disabled).toBe(true);
    expect($(card, "walkHint").textContent).toBe(HINT.nobody);

    markCorner(card, at, -1000, 2000);
    expect(card._walk.corners).toEqual([{ x: -1000, y: 2000 }]);

    // Out of the ignore zone, the fan's target is someone else in view.
    at("b", 1000, 5000);
    expect(corner.disabled).toBe(true);
    expect($(card, "walkHint").textContent).toBe(HINT.crowd);
  });

  it("refuses a corner too close to the last one", async () => {
    const { card, toasts, at } = await walkCard();
    $(card, "btnModeWalk").click();
    markCorner(card, at, -1000, 2000);

    markCorner(card, at, -750, 2000);

    expect(toasts).toEqual([
      "That is too close to the last corner. Walk farther, then press Corner here.",
    ]);
    expect(card._walk.corners).toEqual([{ x: -1000, y: 2000 }]);

    // 300 mm away is far enough.
    markCorner(card, at, -700, 2000);
    expect(card._walk.corners).toEqual([
      { x: -1000, y: 2000 },
      { x: -700, y: 2000 },
    ]);
    expect($(card, "walkHint").textContent).toBe(
      "Corner 2 marked. Keep going around the zone in order, and stand still for about 3 seconds at each corner. Two corners make a rectangle, three or more a polygon. Press Finish when done."
    );
  });

  it("refuses a corner back at the start", async () => {
    const { card, toasts, at } = await walkCard();
    $(card, "btnModeWalk").click();
    markCorner(card, at, -2000, 2000);
    expect($(card, "walkHint").textContent).toBe(
      "Corner 1 marked. Walk along the edge to the next corner, stand still for about 3 seconds, and press Corner here."
    );
    markCorner(card, at, 2000, 2000);
    markCorner(card, at, 2000, 5000);

    markCorner(card, at, -1900, 2100);

    expect(toasts).toEqual(["That is where you started. Press Finish to save the zone."]);
    expect(card._walk.corners).toEqual([
      { x: -2000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 5000 },
    ]);
  });

  it("Finish with two corners saves a rect through the hand-drawn path", async () => {
    const { card, hass, toasts, at } = await walkCard();
    $(card, "btnModeWalk").click();
    markCorner(card, at, -1000, 3000);
    markCorner(card, at, -3000, 1000);
    expect($(card, "btnWalkFinish").disabled).toBe(false);

    $(card, "btnWalkFinish").click();
    await settle();

    const data = { x_min: -3000, x_max: -1000, y_min: 1000, y_max: 3000 };
    const walked = hass.callService.mock.calls.map((call: any[]) => call[2]);
    expect(walked).toEqual([
      { device_id: "dev123", zone_id: 1, shape: "rect", data, input_units: "mm" },
    ]);
    expect(toasts).toEqual(["Doorway saved"]);
    // Out of Walk, back in the mode it came from, the rect on the map at
    // once and Undo ready for it.
    expect(card.drawMode).toBe("rect");
    expect(card._walk).toBeNull();
    expect($(card, "walkPanel").hidden).toBe(true);
    expect(card.zones).toEqual([{ id: 1, shape: "rect", data }]);
    expect($(card, "btnUndo").disabled).toBe(false);

    // A drag over the same rect sends the same call and says the same.
    hass.callService.mockClear();
    layOut(card, 800);
    const mouse = (type: string, x: number, y: number) =>
      card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
    mouse("mousedown", 160, 80);
    mouse("mousemove", 320, 240);
    mouse("mouseup", 320, 240);
    await settle();
    expect(hass.callService.mock.calls.map((call: any[]) => call[2])).toEqual(walked);
    expect(toasts).toEqual(["Doorway saved", "Doorway saved"]);
  });

  it("keeps walked corners where the radar placed them, never snapped", async () => {
    // A drawn corner snaps to 5 cm on this 0.5 m grid; a walked one is the
    // radar's own average and saves as it is, in whole mm.
    const { card, hass, at } = await walkCard();
    $(card, "btnModeWalk").click();
    markCorner(card, at, -1234, 1017);
    markCorner(card, at, -2987, 3044);
    markCorner(card, at, -1611, 3982);
    $(card, "btnWalkFinish").click();
    await settle();

    expect(hass.callService.mock.calls.map((call: any[]) => call[2].data)).toEqual([
      {
        points: [
          { x: -1234, y: 1017 },
          { x: -2987, y: 3044 },
          { x: -1611, y: 3982 },
        ],
      },
    ]);
  });

  it("Finish with three corners saves through finishPolygon", async () => {
    const { card, hass, toasts, at } = await walkCard();
    card._setDrawMode("polygon");
    $(card, "btnModeWalk").click();
    const finish = vi.spyOn(card, "finishPolygon");
    markCorner(card, at, -3000, 1000);
    markCorner(card, at, -1000, 1000);
    markCorner(card, at, -2000, 3000);

    $(card, "btnWalkFinish").click();
    await settle();

    expect(finish).toHaveBeenCalledTimes(1);
    const points = [
      { x: -3000, y: 1000 },
      { x: -1000, y: 1000 },
      { x: -2000, y: 3000 },
    ];
    expect(hass.callService.mock.calls.map((call: any[]) => call[2])).toEqual([
      { device_id: "dev123", zone_id: 1, shape: "polygon", data: { points }, input_units: "mm" },
    ]);
    expect(toasts).toEqual(["Doorway saved"]);
    expect(card.zones).toEqual([{ id: 1, shape: "polygon", data: { points } }]);
    // Back in polygon mode with nothing left in progress.
    expect(card.drawMode).toBe("polygon");
    expect(card._polyPoints).toEqual([]);
    expect(card.isDrawing).toBe(false);
  });

  it("Finish with no zone selected keeps the corners", async () => {
    const { card, hass, toasts, at } = await walkCard();
    $(card, "btnModeWalk").click();
    markCorner(card, at, -3000, 1000);
    markCorner(card, at, -1000, 3000);
    // The only zone was deleted from another browser, say.
    card._setSelectedZone(null);

    $(card, "btnWalkFinish").click();

    expect(toasts).toEqual(["Select a zone first."]);
    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.drawMode).toBe("walk");
    expect(card._walk.corners).toHaveLength(2);

    // With a zone selected, the same corners save.
    card._setSelectedZone(1);
    $(card, "btnWalkFinish").click();
    expect(hass.callService).toHaveBeenCalledTimes(1);
  });

  it("refuses a zone too thin to use and keeps walking", async () => {
    const { card, hass, toasts, at } = await walkCard();
    $(card, "btnModeWalk").click();
    // Two corners along one wall, 0.2 m apart across it.
    markCorner(card, at, -3000, 1000);
    markCorner(card, at, -1000, 1200);

    $(card, "btnWalkFinish").click();

    const flat =
      "Those corners make a zone too thin to use. Mark corners on opposite sides of the area.";
    expect(toasts).toEqual([flat]);
    expect(hass.callService).not.toHaveBeenCalled();
    expect(card._walk.corners).toHaveLength(2);

    // A third corner in line with them is no better.
    markCorner(card, at, 1000, 1400);
    vi.advanceTimersByTime(1600);
    $(card, "btnWalkFinish").click();
    expect(toasts).toEqual([flat, flat]);
    expect(card._walk.corners).toHaveLength(3);
  });

  it("stops marking at the most corners a zone can have", async () => {
    const { card, at } = await walkCard();
    card.polyMaxPoints = 3;
    $(card, "btnModeWalk").click();
    markCorner(card, at, -3000, 1000);
    markCorner(card, at, -1000, 1000);
    markCorner(card, at, -2000, 3000);

    expect($(card, "walkHint").textContent).toBe(
      "That is the most corners a zone can have. Press Finish."
    );
    expect($(card, "btnWalkCorner").disabled).toBe(true);
    expect($(card, "btnWalkFinish").disabled).toBe(false);
    at("a", 2000, 5000);
    vi.advanceTimersByTime(2000);
    card._walkCorner();
    expect(card._walk.corners).toHaveLength(3);
  });

  it("Cancel with two corners asks first", async () => {
    const { card, at } = await walkCard();
    const confirm = () => $(card, "walkConfirm");
    const actions = () => $(card, "walkActions");

    // With one corner, Cancel ends Walk at once.
    $(card, "btnModeWalk").click();
    markCorner(card, at, -3000, 1000);
    $(card, "btnWalkCancel").click();
    expect(card.drawMode).toBe("rect");
    expect($(card, "walkPanel").hidden).toBe(true);

    // With two, it asks first, in the panel.
    $(card, "btnModeWalk").click();
    expect(card._walk.corners).toEqual([]);
    markCorner(card, at, -1000, 1000);
    markCorner(card, at, -3000, 3000);
    $(card, "btnWalkCancel").click();
    expect(card.drawMode).toBe("walk");
    expect(confirm().hidden).toBe(false);
    expect(actions().hidden).toBe(true);
    expect(confirm().textContent).toContain("Drop the corners you marked?");
    const answers = ["btnWalkCancelYes", "btnWalkCancelNo"].map((id) => $(card, id).textContent);
    expect(answers).toEqual(["Drop them", "Keep marking"]);

    // Keep marking puts the buttons back, corners and all.
    $(card, "btnWalkCancelNo").click();
    expect(confirm().hidden).toBe(true);
    expect(actions().hidden).toBe(false);
    expect(card._walk.corners).toHaveLength(2);

    // Drop them ends Walk without the corners.
    $(card, "btnWalkCancel").click();
    $(card, "btnWalkCancelYes").click();
    expect(card.drawMode).toBe("rect");
    expect(card._walk).toBeNull();
    expect($(card, "walkPanel").hidden).toBe(true);
    $(card, "btnModeWalk").click();
    expect(card._walk.corners).toEqual([]);
    expect(confirm().hidden).toBe(true);
  });

  it("Undo corner takes back the last corner", async () => {
    const { card, at } = await walkCard();
    $(card, "btnModeWalk").click();
    const undo = $(card, "btnWalkUndo");
    expect(undo.disabled).toBe(true);
    markCorner(card, at, -3000, 1000);
    markCorner(card, at, -1000, 3000);

    undo.click();

    expect(card._walk.corners).toEqual([{ x: -3000, y: 1000 }]);
    expect($(card, "btnWalkFinish").disabled).toBe(true);
    expect($(card, "walkHint").textContent).toBe(
      "Corner 1 marked. Walk along the edge to the next corner, stand still for about 3 seconds, and press Corner here."
    );
    undo.click();
    expect(card._walk.corners).toEqual([]);
    expect(undo.disabled).toBe(true);
    // Still walking, from the start.
    expect(card.drawMode).toBe("walk");
    expect($(card, "walkHint").textContent).toBe(HINT.start);
  });

  it("locking cancels the walk", async () => {
    const { card, toasts, at } = await walkCard();
    const walkTwoCorners = () => {
      $(card, "btnModeWalk").click();
      markCorner(card, at, -3000, 1000);
      markCorner(card, at, -1000, 3000);
      expect(card._walk.corners).toHaveLength(2);
    };
    walkTwoCorners();

    $(card, "btnLock").click();

    // Without asking: the lock says what it did.
    expect(card.isLocked).toBe(true);
    expect(card._walk).toBeNull();
    expect(card.drawMode).toBe("rect");
    expect($(card, "walkPanel").hidden).toBe(true);
    expect(toasts).toEqual(["Drawing and cone rotation locked. Unlock the map to change them."]);

    // So do another drawing mode, view_only and another radar.
    $(card, "btnLock").click();
    walkTwoCorners();
    $(card, "btnModeEllipse").click();
    expect(card._walk).toBeNull();
    expect(card.drawMode).toBe("ellipse");

    walkTwoCorners();
    const unlocked = { ...TEN_METER_GRID, start_locked: false };
    card.setConfig({ device_id: "dev123", ...unlocked, view_only: true });
    expect(card._walk).toBeNull();
    expect(card.drawMode).toBe("ellipse");

    card.setConfig({ device_id: "dev123", ...unlocked });
    walkTwoCorners();
    card.setConfig({ device_id: "devB", ...unlocked });
    expect(card._walk).toBeNull();
    expect($(card, "walkPanel").hidden).toBe(true);
  });

  it("pressing a walk button does not cancel anything", async () => {
    // The press listener on document cancels a shape being drawn when
    // something else in the card is pressed. Walk is not a shape being
    // drawn, and its buttons are outside the map.
    const { card, at } = await walkCard();
    document.body.appendChild(card);
    $(card, "btnModeWalk").click();
    markCorner(card, at, -3000, 1000);
    markCorner(card, at, -1000, 3000);

    for (const id of ["btnWalkUndo", "btnWalkFinish", "btnWalkCancel", "btnWalkCorner"]) {
      pressOn($(card, id), "mousedown");
      pressOn($(card, id), "touchstart");
    }
    expect(card.drawMode).toBe("walk");
    expect(card._walk.corners).toHaveLength(2);

    // A press and its click on Corner here mark the corner.
    at("a", 1000, 3000);
    vi.advanceTimersByTime(2000);
    pressOn($(card, "btnWalkCorner"), "mousedown");
    $(card, "btnWalkCorner").click();
    expect(card._walk.corners).toHaveLength(3);
  });

  it("entering Walk closes History and disables the History chip", async () => {
    // History's replay would hide the dot of the person walking.
    const { card } = await walkCard({ payload: { movement_history: true } });
    const chip = $(card, "btnHistory");
    chip.click();
    expect(card._history.open).toBe(true);
    expect($(card, "historyPanel").hidden).toBe(false);
    const close = vi.spyOn(card, "_closeHistory");

    $(card, "btnModeWalk").click();

    expect(close).toHaveBeenCalledTimes(1);
    expect(card.drawMode).toBe("walk");
    expect(card._history.open).toBe(false);
    expect($(card, "historyPanel").hidden).toBe(true);
    expect(chip.hidden).toBe(false);
    expect(chip.disabled).toBe(true);
    expect(chip.title).toBe("Finish or cancel the walk first.");
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    // Nothing that still reaches it opens History, and a render keeps it so.
    card._openHistory();
    expect(card._history.open).toBe(false);
    card.render();
    expect($(card, "btnHistory").disabled).toBe(true);

    // Leaving Walk gives it back.
    $(card, "btnWalkCancel").click();
    expect(card.drawMode).toBe("rect");
    expect($(card, "btnHistory").disabled).toBe(false);
    expect($(card, "btnHistory").title).toBe("");
  });

  it("lets the canvas pan and draws nothing with the pointer in Walk", async () => {
    const { card, toasts } = await walkCard();
    layOut(card, 800);
    expect(card.canvas.classList.contains("pans")).toBe(false);

    $(card, "btnModeWalk").click();

    expect(card.canvas.classList.contains("pans")).toBe(true);
    card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));
    expect(card.isDrawing).toBe(false);
    expect(toasts).toEqual([]);

    $(card, "btnWalkCancel").click();
    expect(card.canvas.classList.contains("pans")).toBe(false);
  });

  it("lays the walk back out after a render", async () => {
    const { card, at } = await walkCard();
    $(card, "btnModeWalk").click();
    markCorner(card, at, -3000, 1000);
    markCorner(card, at, -1000, 3000);
    $(card, "btnWalkCancel").click();

    // A theme flip renders the card again.
    card.render();

    expect($(card, "walkPanel").hidden).toBe(false);
    expect($(card, "walkConfirm").hidden).toBe(false);
    expect($(card, "btnWalkFinish").disabled).toBe(false);
    expect($(card, "btnModeWalk").classList.contains("active")).toBe(true);
    expect(card.canvas.classList.contains("pans")).toBe(true);
    // And keeps up with the people in view.
    at("b", 1000, 2000);
    expect($(card, "walkHint").textContent).toBe(HINT.crowd);
  });

  it("previews the walked zone dashed, with its size above the newest corner", async () => {
    const { card, at } = await walkCard();
    $(card, "btnModeWalk").click();
    markCorner(card, at, -3000, 1000);
    const dashes = (draws: Draw[]) =>
      draws.filter((d) => d.name === "setLineDash" && d.args[0].join() === "10,6");
    // One corner is no shape yet.
    expect(dashes(frame(card))).toEqual([]);

    markCorner(card, at, -1000, 3000);
    let draws = frame(card);
    // The rect between (-3000, 1000) and (-1000, 3000) mm, in a dash of its
    // own inside its own save and restore.
    expect(dashes(draws).map((d) => d.depth)).toEqual([1]);
    expect(draws.filter((d) => d.name === "rect").map((d) => [d.args, d.depth])).toEqual([
      [[160, 80, 160, 160], 1],
    ]);
    // Its size 64 px above the newest corner, clear of that corner's ring.
    expect(readouts(draws)).toEqual([["2.0 m × 2.0 m", 320, 176]]);

    markCorner(card, at, -2000, 5000);
    draws = frame(card);
    // Three corners: the polygon through them in walking order, closed.
    const at10 = draws.indexOf(dashes(draws)[0]);
    const path = draws
      .slice(at10)
      .filter((d) => ["moveTo", "lineTo", "closePath", "stroke"].includes(d.name));
    expect(path.slice(0, 5).map((d) => [d.name, d.args])).toEqual([
      ["moveTo", [160, 80]],
      ["lineTo", [320, 240]],
      ["lineTo", [240, 400]],
      ["closePath", []],
      ["stroke", []],
    ]);
    expect(readouts(draws)).toEqual([["2.0 m × 4.0 m", 240, 336]]);
  });

  it("keeps the size clear of earlier corners' rings and numbers on a phone", async () => {
    // On a phone's map the readout above the newest corner sits about 2 m
    // up, a common zone depth. Walking a couch's near side first put it on
    // the rings and numbers of corners 1 and 2; it goes below the newest
    // corner instead, where nothing is.
    const { card, at } = await walkCard({
      config: { grid: undefined },
      payload: { display_units: "ft" },
    });
    layOut(card, 326);
    $(card, "btnModeWalk").click();
    markCorner(card, at, -3000, 2000);
    markCorner(card, at, -1900, 2000);
    markCorner(card, at, -1900, 4200);
    // The walker moves on.
    at("a", -3000, 4200);

    const draws = frame(card);

    const text = draws.findIndex(
      (d) => d.name === "fillText" && String(d.args[0]).includes(" × ")
    );
    expect(draws[text].args[0]).toBe("3 ft 7 in × 7 ft 3 in");
    const plate = draws[text - 1];
    expect(plate.name).toBe("fillRect");
    const [left, top, width, height] = plate.args;
    /** Whether an arc's or a fillRect's box overlaps the plate. */
    const covers = (d: Draw) => {
      const [x, y, w, h] =
        d.name === "arc"
          ? [d.args[0] - d.args[2], d.args[1] - d.args[2], 2 * d.args[2], 2 * d.args[2]]
          : d.args;
      return x < left + width && left < x + w && y < top + height && top < y + h;
    };
    const ringRadius = Math.max(14, Math.round(14 * card._frameScale));
    const rings = draws.filter((d) => d.name === "arc" && d.args[2] === ringRadius);
    expect(rings).toHaveLength(3);
    expect(rings.map(covers)).toEqual([false, false, false]);
    // The corners' number plates are clear of it too.
    const numbers = draws
      .map((d, i) =>
        d.name === "fillText" && /^[123]$/.test(String(d.args[0])) && draws[i - 1].name === "fillRect"
          ? draws[i - 1]
          : null
      )
      .filter((d): d is Draw => d !== null);
    expect(numbers).toHaveLength(3);
    expect(numbers.map(covers)).toEqual([false, false, false]);
    // Below the newest corner, as far as above it would have been.
    const newestY = card.valueToPixels(4200, "y");
    expect(top + height / 2).toBeCloseTo(newestY + 64 * card._frameScale, 6);
    // ...and no ring, dot or plate is drawn over the readout.
    const after = draws
      .slice(text + 1)
      .filter((d) => (d.name === "arc" && d.args[2] >= 14) || d.name === "fillRect");
    expect(after.filter(covers)).toEqual([]);
    expect(draws.indexOf(rings[2])).toBeLessThan(text);
  });

  it("keeps the size from under the buttons over the map", async () => {
    // The drawing modes stand open down the map's left edge on a phone, and
    // a corner walked near them put the readout under 🚶.
    const { card, at } = await walkCard();
    layOut(card, 800);
    $(card, "btnModeWalk").click();
    markCorner(card, at, -4000, 6000);
    // The newest corner is canvas (90, 640), and "0.1 m × 2.0 m" is 121.2
    // px wide by the canvas's fallback estimate.
    markCorner(card, at, -3875, 8000);
    const plate = (draws: Draw[]) => {
      const text = draws.findIndex(
        (d) => d.name === "fillText" && String(d.args[0]).includes(" × ")
      );
      const [left, top, width, height] = draws[text - 1].args;
      return { left, x: left + width / 2, y: top + height / 2 };
    };
    // With nothing over the map there, above the corner.
    expect(plate(frame(card))).toMatchObject({ x: 90, y: 640 - 64 });

    // The drawing modes over the left 40 px from 400 px down: above and
    // below would reach under them, so it goes to the corner's right, at its
    // height, its near edge 54 px (64 less half its height) from the corner.
    const modes = $(card, "overlayControlsLeft");
    vi.spyOn(modes, "getBoundingClientRect").mockReturnValue({
      left: 4,
      top: 400,
      right: 40,
      bottom: 796,
      x: 4,
      y: 400,
      width: 36,
      height: 396,
      toJSON: () => ({}),
    } as DOMRect);
    const beside = plate(frame(card));
    expect(beside.y).toBe(640);
    expect(beside.x).toBeCloseTo(90 + 54 + 60.6, 9);
    expect(beside.left).toBeGreaterThanOrEqual(40 + 4);
  });

  it("draws the size over the rings of earlier corners where nothing is clear", async () => {
    // Above, below and both sides all crowded: the readout goes above the
    // newest corner, as before, over the rings, which are drawn first.
    const { card, at } = await walkCard();
    layOut(card, 800);
    $(card, "btnModeWalk").click();
    const crowd = { left: 0, right: 800, top: 0, bottom: 800 };
    vi.spyOn(card, "_overlayBoxes").mockReturnValue([crowd]);
    markCorner(card, at, -3000, 1000);
    markCorner(card, at, -1000, 3000);

    const draws = frame(card);
    const readout = draws.filter(
      (d) => d.name === "fillText" && String(d.args[0]).includes(" × ")
    );
    expect(readout.map((d) => d.args)).toEqual([["2.0 m × 2.0 m", 320, 176]]);
  });

  it("rings each corner with its number over the dots", async () => {
    const { card, at } = await walkCard();
    $(card, "btnModeWalk").click();
    markCorner(card, at, -3000, 1000);
    // Target 1 stands on corner 2.
    markCorner(card, at, -1000, 3000);

    const draws = frame(card);

    const rings = draws.filter((d) => d.name === "arc" && d.args[2] === 14);
    expect(rings.map((d) => d.args.slice(0, 2))).toEqual([
      [160, 80],
      [320, 240],
    ]);
    const dot = draws.findIndex((d) => d.name === "fill" && d.fill === "#f44336");
    expect(dot).toBeGreaterThan(-1);
    expect(draws.indexOf(rings[0])).toBeGreaterThan(dot);
    // Stroked 3 px in the axis color, not filled, so the dot shows.
    const ringStrokes = draws.filter(
      (d, i) => d.name === "stroke" && draws[i - 1]?.name === "arc" && draws[i - 1].args[2] === 14
    );
    expect(ringStrokes.map((d) => [d.stroke, d.lineWidth])).toEqual([
      ["#000000", 3],
      ["#000000", 3],
    ]);
    // Each number bold in the axis color outside its ring's upper right,
    // on a plate in the canvas color.
    const numbers = draws.filter((d) => d.name === "fillText" && ["1", "2"].includes(d.args[0]));
    const markerNumbers = numbers.filter((d) => d.font === "bold 14px sans-serif");
    expect(markerNumbers.map((d) => [d.args, d.fill])).toEqual([
      [["1", 174, 66], "#000000"],
      [["2", 334, 226], "#000000"],
    ]);
    markerNumbers.forEach((number) => {
      const plate = draws[draws.indexOf(number) - 1];
      expect([plate.name, plate.fill]).toEqual(["fillRect", "#ffffff"]);
    });
  });

  it("scales the dashed preview and the rings' lines with the card", async () => {
    // At 326 CSS px a backing px is about 0.4 CSS px, so 3 px lines drew
    // about 1.2 CSS px wide on a phone, faint beside the trails and dots.
    const { card, at } = await walkCard();
    layOut(card, 326);
    $(card, "btnModeWalk").click();
    markCorner(card, at, -3000, 1000);
    markCorner(card, at, -1000, 3000);

    const draws = frame(card);

    const scale = card._frameScale;
    expect(scale).toBeCloseTo(800 / 326, 9);
    // The two-corner preview is the frame's only rect path: its dash is set
    // just before it, and its stroke follows it.
    const rect = draws.findIndex((d) => d.name === "rect");
    expect(rect).toBeGreaterThan(-1);
    const dash = draws
      .slice(0, rect)
      .filter((d) => d.name === "setLineDash")
      .pop();
    expect(dash?.args[0]).toEqual([10 * scale, 6 * scale]);
    const preview = draws.slice(rect).find((d) => d.name === "stroke");
    expect(preview?.lineWidth).toBe(3 * scale);
    // Each ring, as wide in CSS px as at the desktop's 1:1.
    const r = Math.max(14, Math.round(14 * scale));
    const ringStrokes = draws.filter(
      (d, i) => d.name === "stroke" && draws[i - 1]?.name === "arc" && draws[i - 1].args[2] === r
    );
    expect(ringStrokes.map((d) => d.lineWidth)).toEqual([3 * scale, 3 * scale]);
  });

  it("keeps the corners in the radar's own frame through a rotation change", async () => {
    const { card, hass, at } = await walkCard();
    $(card, "btnModeWalk").click();
    markCorner(card, at, -3000, 1000);

    // Turned 90 degrees, (-3000, 1000) mm in the radar's frame is (1000,
    // 3000) on the map: the corner turns with it.
    hass.handlers[ZONES_SUBSCRIBE][0]({ ...ZONE_PAYLOAD, rotation_deg: 90, entities: PAIRS });

    expect(card._walk.corners).toEqual([{ x: -3000, y: 1000 }]);
    const [ring] = frame(card).filter((d) => d.name === "arc" && d.args[2] === 14);
    expect(ring.args[0]).toBeCloseTo(480, 6);
    expect(ring.args[1]).toBeCloseTo(240, 6);

    // A chip change keeps the walk too.
    $(card, "btnAddZone").click();
    expect(card.selectedZone).toBe(2);
    expect(card._walk.corners).toHaveLength(1);
  });

  it("follows the walker in a zoomed view and marks corners where the radar puts them", async () => {
    const { card, at } = await walkCard();
    // 4x on (-3000, 7000): x -4250..-1750, y 5750..8250, 0.32 px per mm.
    card._setView({ zoom: 4, cx: -3000, cy: 7000 });
    at("a", 2000, 2000);
    const before = { ...card._view };
    expect(before).toEqual({ zoom: 4, cx: -3000, cy: 7000 });

    // Walk goes to the walker at once, the zoom kept, 15% of the window in
    // from the edges they were past (2500 mm across: 375 mm).
    $(card, "btnModeWalk").click();
    expect(card._view.zoom).toBe(4);
    expect(card._viewXMax - 2000).toBeCloseTo(375, 6);
    expect(2000 - card._viewYMin).toBeCloseTo(375, 6);

    // Steps inside the view move nothing; one toward its edge pans after.
    const settled = { ...card._view };
    at("a", 1500, 2200);
    expect(card._view).toEqual(settled);
    at("a", 2400, 2200);
    expect(card._view.zoom).toBe(4);
    expect(card._viewXMax - 2400).toBeCloseTo(375, 6);

    // A corner is the radar's average, not anything on the canvas, so the
    // zoom changes nothing about where it lands.
    vi.advanceTimersByTime(2000);
    $(card, "btnWalkCorner").click();
    expect(card._walk.corners).toEqual([{ x: 2400, y: 2200 }]);
    const [ring] = frame(card).filter((d) => d.name === "arc" && d.args[2] === 14);
    expect(ring.args[0]).toBeCloseTo(card.valueToPixels(2400, "x"), 6);
    expect(ring.args[1]).toBeCloseTo(card.valueToPixels(2200, "y"), 6);

    // A second person in view zooms out as far as it takes to show both.
    at("b", -4000, 8000);
    expect(card._view.zoom).toBeLessThan(4);
    expect(card._viewXMin).toBeLessThanOrEqual(-4000);
    expect(card._viewXMax).toBeGreaterThanOrEqual(2400);
    expect(card._viewYMax).toBeGreaterThanOrEqual(8000);
  });
});

/**
 * Movement history: the Configure option, the History chip and panel, and
 * the replay.
 *
 * An administrator turns history on for a radar in Configure, and turning it
 * off, which deletes it, asks first. History, under the map, reads a range
 * from the server and replays it on the map in place of the live view:
 * numbered dots with their trails, and zones lit by the replayed dots through
 * the zones' current shapes, rotation and flip. Its times are the server's
 * epoch ms. Nobody else's card shows any of it or calls the movement
 * commands. The 10 m grid puts (x, y) mm at canvas ((x + 5000) * 0.08,
 * y * 0.08) px, unflipped.
 */
describe("zone map card movement history", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  /** The server's clock when it answers: 2026-01-01 01:00:00 UTC. */
  const NOW = 1767229200000;
  const HOUR = 3600000;
  /** Where the default 1 h range starts. */
  const START = NOW - HOUR;
  const PAIRS = [
    { x: "sensor.a_x", y: "sensor.a_y" },
    { x: "sensor.b_x", y: "sensor.b_y" },
  ];
  const ORANGE = "rgba(255, 152, 0, ";

  /** One record: [t, s, x, y], where s is -1 - slot on a gone marker. */
  type Row = [t: number, s: number, x: number, y: number];
  const point = (t: number, slot: number, x: number, y: number): Row => [t, slot, x, y];
  const gone = (t: number, slot: number): Row => [t, -1 - slot, 0, 0];

  /** Little-endian values as base64, the way the backend packs a column. */
  function column(values: number[], bytes: 2 | 4): string {
    const view = new DataView(new ArrayBuffer(values.length * bytes));
    values.forEach((value, i) => {
      if (bytes === 4) view.setUint32(i * 4, value, true);
      else view.setInt16(i * 2, value, true);
    });
    let binary = "";
    new Uint8Array(view.buffer).forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  /** The store's answer holding `rows` (sorted by time), built at `now`. */
  function pack(rows: Row[], now = NOW, since = now - HOUR) {
    const t = rows.map((row) => row[0]);
    return {
      enabled: true,
      now,
      since,
      retention_s: 86400,
      n: rows.length,
      t0: rows.length > 0 ? t[0] : null,
      dt: column(
        t.map((value, i) => (i === 0 ? 0 : value - t[i - 1])),
        4
      ),
      s: column(
        rows.map((row) => row[1]),
        2
      ),
      x: column(
        rows.map((row) => row[2]),
        2
      ),
      y: column(
        rows.map((row) => row[3]),
        2
      ),
    };
  }

  /**
   * Target 1 walks in 10 s into the hour, stands still at (-500, 2000) mm
   * from 10.5 s and leaves at 30 s; target 2 shows at (2000, 4000) mm at
   * 20 s and sends nothing after.
   */
  const WALK_IN = pack([
    point(START + 10000, 0, -1000, 2000),
    point(START + 10500, 0, -500, 2000),
    point(START + 20000, 1, 2000, 4000),
    gone(START + 30000, 0),
  ]);

  /**
   * An administrator's card for a radar that keeps movement history, on the
   * 10 m grid with no rotation, its viewer's Home Assistant in English on a
   * 12-hour clock in the server's time zone, UTC. The fake clock stands at
   * NOW. A movement read answers `hass.movement` (a payload, or a function of
   * the request); a clear answers `hass.clear(request)`.
   */
  async function historyCard({
    admin = true,
    payload = {},
    config = {},
    movement = WALK_IN as any,
  }: {
    admin?: boolean;
    payload?: Record<string, any>;
    config?: Record<string, any>;
    movement?: any;
  } = {}) {
    vi.useFakeTimers();
    const hass = fakeHass({
      ...ZONE_PAYLOAD,
      rotation_deg: 0,
      entities: PAIRS,
      movement_history: true,
      ...payload,
    });
    hass.user = { is_admin: admin };
    hass.locale = { language: "en", time_format: "12", time_zone: "server" };
    hass.config = { time_zone: "UTC" };
    hass.movement = movement;
    hass.clear = () => ({ cleared: 4 });
    hass.callWS = vi.fn(async (msg: any) => {
      if (msg.type === ZONES_GET) return hass.payload;
      if (msg.type === MOVEMENT_GET) {
        return typeof hass.movement === "function" ? hass.movement(msg) : hass.movement;
      }
      if (msg.type === MOVEMENT_CLEAR) return hass.clear(msg);
      return [];
    });
    const card = await mountCard(hass, { ...TEN_METER_GRID, ...config });
    vi.setSystemTime(NOW);
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  const $ = (card: any, id: string) => card.shadowRoot.getElementById(id);

  /** The movement requests of `type` the card sent, in order. */
  const movementCalls = (hass: any, type = MOVEMENT_GET) =>
    hass.callWS.mock.calls.map(([msg]: any[]) => msg).filter((msg: any) => msg.type === type);

  /** Let the store's answer land, under the fake clock. */
  async function settle() {
    await vi.advanceTimersByTimeAsync(0);
  }

  async function openHistory(card: any) {
    $(card, "btnHistory").click();
    await settle();
  }

  /** Move the scrubber to `seconds` into the range, as a drag does. */
  function scrub(card: any, seconds: number) {
    const input = $(card, "historyScrub");
    input.value = String(seconds);
    input.dispatchEvent(new Event("input"));
  }

  const rangeChip = (card: any, hours: number) =>
    card.shadowRoot.querySelector(`#historyPanel [data-hours="${hours}"]`);
  const speedChip = (card: any, speed: number) =>
    card.shadowRoot.querySelector(`#historyPanel [data-speed="${speed}"]`);

  /** An element's text, with the narrow no-break space some Intl versions
   *  put before AM read as a plain space. */
  const text = (element: any) => String(element.textContent).replace(/ /g, " ");

  /** A pushed payload for the same radar with `fields` changed. */
  function push(hass: any, fields: Record<string, any>) {
    hass.handlers[ZONES_SUBSCRIBE][0]({
      ...ZONE_PAYLOAD,
      rotation_deg: 0,
      entities: PAIRS,
      movement_history: true,
      ...fields,
    });
  }

  function frame(card: any): Draw[] {
    const { ctx, draws } = drawRecordingContext();
    card.ctx = ctx;
    card.drawGrid();
    return draws;
  }

  /** Rounded to 1e-6 px, so a rotated point compares by value. */
  const px = (value: number) => Math.round(value * 1e6) / 1e6;

  /** The numbered dots a frame drew: [number, x, y]. */
  const dots = (draws: Draw[]) =>
    draws
      .filter((d) => d.name === "fillText" && /^\d+$/.test(String(d.args[0])))
      .map((d) => [d.args[0], px(d.args[1]), px(d.args[2])]);

  /** The trail segments a frame stroked in `color`: [x1, y1, x2, y2]. */
  function segments(draws: Draw[], color = "#f44336"): number[][] {
    return draws
      .map((d, i) => [d, i] as const)
      .filter(([d, i]) => d.name === "stroke" && d.stroke === color && draws[i - 1]?.name === "lineTo")
      .map(([, i]) => [...draws[i - 2].args, ...draws[i - 1].args].map(px));
  }

  it("shows History only to administrators with movement history on", async () => {
    const { card, hass } = await historyCard();
    const chip = $(card, "btnHistory");
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe("History");
    expect(chip.classList.contains("zone-btn")).toBe(true);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(chip.getAttribute("aria-controls")).toBe("historyPanel");
    // With the viewer's other chips under the map (Walk's for a phone, then
    // Coverage's), and its panel under them.
    expect(Array.from($(card, "viewTools").children, (el: any) => el.id)).toEqual([
      "btnWalkChip",
      "btnCoverage",
      "btnCoverageClear",
      "btnHistory",
    ]);
    expect($(card, "viewTools").nextElementSibling.id).toBe("historyPanel");
    // Configure says it is on.
    expect($(card, "movementOption").hidden).toBe(false);
    expect($(card, "movementToggle").checked).toBe(true);

    chip.click();
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(chip.classList.contains("active")).toBe(true);
    expect($(card, "historyPanel").hidden).toBe(false);
    await settle();
    expect(card._replayShowing()).toBe(true);

    // The flag going off closes it and takes the chip away...
    push(hass, { movement_history: false });
    expect(chip.hidden).toBe(true);
    expect($(card, "historyPanel").hidden).toBe(true);
    expect(card._replayShowing()).toBe(false);
    expect($(card, "movementToggle").checked).toBe(false);
    // ...and so does a viewer who is an administrator no more.
    push(hass, { movement_history: true });
    expect(chip.hidden).toBe(false);
    await openHistory(card);
    expect($(card, "historyPanel").hidden).toBe(false);
    card.hass = { ...hass, user: { is_admin: false } };
    expect($(card, "historyPanel").hidden).toBe(true);
    expect(chip.hidden).toBe(true);
    expect($(card, "movementOption").hidden).toBe(true);

    // A radar that does not keep it shows no chip, even to an administrator,
    // who can turn it on.
    const off = await historyCard({ payload: { movement_history: false } });
    expect($(off.card, "btnHistory").hidden).toBe(true);
    expect($(off.card, "movementOption").hidden).toBe(false);
    expect($(off.card, "movementToggle").checked).toBe(false);
    // Anyone else's card shows neither.
    const viewer = await historyCard({ admin: false });
    expect($(viewer.card, "btnHistory").hidden).toBe(true);
    expect($(viewer.card, "movementOption").hidden).toBe(true);
    // A render keeps it so.
    viewer.card.render();
    expect($(viewer.card, "btnHistory").hidden).toBe(true);
    // A view-only map has no chips, panel or badge at all.
    const still = await historyCard({ config: { view_only: true } });
    expect($(still.card, "btnHistory")).toBeNull();
    expect($(still.card, "historyPanel")).toBeNull();
    expect($(still.card, "replayBadge")).toBeNull();
  });

  it("makes no movement call for non-administrators", async () => {
    const { card, hass } = await historyCard({ admin: false });

    // Nothing that still reaches the hidden chip or the panel's buttons asks.
    $(card, "btnHistory").click();
    card._openHistory();
    $(card, "btnHistoryClearYes").click();
    await settle();
    expect($(card, "historyPanel").hidden).toBe(true);
    // Nor does the hidden option ask or save.
    const toggle = $(card, "movementToggle");
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    expect($(card, "movementConfirm").hidden).toBe(true);
    expect(toggle.checked).toBe(true);
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    $(card, "btnMovementOffYes").click();
    await settle();

    const types = hass.callWS.mock.calls.map(([msg]: any[]) => String(msg.type));
    expect(types.filter((type: string) => type.startsWith("apollo_mmwave/movement/"))).toEqual([]);
    expect(hass.callService).not.toHaveBeenCalled();
    expect(toggle.checked).toBe(true);
    expect($(card, "movementConfirm").hidden).toBe(true);
  });

  it("replays through a zoomed view, which stays as zoomed as the live map", async () => {
    const { card } = await historyCard();
    // 2x on (0, 2500): x -2500..2500 and y 0..5000, at 0.16 px per mm.
    card._setView({ zoom: 2, cx: 0, cy: 2500 });
    await openHistory(card);
    scrub(card, 20);

    expect(dots(frame(card))).toEqual([
      ["1", 320, 320],
      ["2", 720, 640],
    ]);
    // The trail of target 1's walk-in, at the zoom.
    scrub(card, 11);
    expect(segments(frame(card))).toEqual([[240, 320, 320, 320]]);
    expect(card._zoom()).toBe(2);
    $(card, "btnHistoryLive").click();
    expect(card._zoom()).toBe(2);
  });

  it("fetches on open and replays numbered dots at the scrub time", async () => {
    const { card, hass } = await historyCard();
    // Live, target 1 stands at (3000, 6000) mm.
    card.hass = { ...hass, states: { "sensor.a_x": { state: "3000" }, "sensor.a_y": { state: "6000" } } };
    expect(dots(frame(card))).toEqual([["1", 640, 480]]);

    $(card, "btnHistory").click();

    // The last hour by the server's clock, asked for at once. The live map
    // stays until the answer comes.
    expect(movementCalls(hass)).toEqual([{ type: MOVEMENT_GET, device_id: "dev123", since: START }]);
    expect($(card, "historyStatus").textContent).toBe("Loading movement history...");
    expect($(card, "historyScrub").disabled).toBe(true);
    expect($(card, "btnHistoryPlay").disabled).toBe(true);
    expect($(card, "replayBadge").hidden).toBe(true);
    expect(dots(frame(card))).toEqual([["1", 640, 480]]);

    await settle();

    // The start of the hour, paused, where nobody was yet: no live dot either.
    const scrubber = $(card, "historyScrub");
    expect($(card, "historyStatus").textContent).toBe("");
    expect([scrubber.disabled, scrubber.min, scrubber.max, scrubber.step, scrubber.value]).toEqual([
      false,
      "0",
      "3600",
      "1",
      "0",
    ]);
    expect(scrubber.getAttribute("aria-label")).toBe("Replay time");
    expect($(card, "btnHistoryPlay").disabled).toBe(false);
    expect($(card, "btnHistoryPlay").textContent).toBe("Play");
    expect(dots(frame(card))).toEqual([]);

    // 10 s in, target 1 where it walked in at (-1000, 2000) mm.
    scrub(card, 10);
    expect(dots(frame(card))).toEqual([["1", 320, 160]]);
    // Its trail half a second later, aged against the replay time.
    scrub(card, 11);
    let draws = frame(card);
    expect(segments(draws)).toEqual([[320, 160, 360, 160]]);
    const trail = draws.find(
      (d, i) => d.name === "stroke" && d.stroke === "#f44336" && draws[i - 1]?.name === "lineTo"
    );
    expect(trail?.alpha).toBeCloseTo(0.6 * (1 - 500 / 3000), 9);
    // 20 s in, target 1 standing still and target 2 come in, numbered by pair.
    scrub(card, 20);
    draws = frame(card);
    expect(dots(draws)).toEqual([
      ["1", 360, 160],
      ["2", 560, 320],
    ]);
    expect(draws.filter((d) => d.name === "fillText").map((d) => d.fill)).toContain("#000000");
    // Target 1 left at 30 s, and target 2, silent for 20 s by 41 s, is gone too.
    scrub(card, 35);
    expect(dots(frame(card))).toEqual([["2", 560, 320]]);
    scrub(card, 41);
    expect(dots(frame(card))).toEqual([]);

    // The time under the scrubber, which it reads out as its value, and the
    // badge over the map.
    scrub(card, 20);
    expect(text($(card, "historyTime"))).toBe("12:00:20 AM, 59 min ago");
    expect(scrubber.getAttribute("aria-valuetext")).toBe($(card, "historyTime").textContent);
    expect($(card, "replayBadge").hidden).toBe(false);
    expect(text($(card, "replayBadge"))).toBe("Replay 12:00:20 AM");
  });

  it("lights zones whose current shapes contain a replayed dot", async () => {
    const PRESENCE_1 = "binary_sensor.office_zone_1_presence";
    const PRESENCE_2 = "binary_sensor.office_zone_2_presence";
    const zones = {
      // Around where target 1 stands from 10.5 s, (-500, 2000) mm.
      "1": {
        shape: "rect",
        data: { x_min: -1500, x_max: 0, y_min: 1000, y_max: 3000 },
        presence_entity_id: PRESENCE_1,
      },
      // Around target 2 at (2000, 4000) mm, which an ignore zone covers.
      "2": {
        shape: "rect",
        data: { x_min: 1000, x_max: 3000, y_min: 3000, y_max: 5000 },
        presence_entity_id: PRESENCE_2,
      },
      "3": {
        shape: "rect",
        data: { x_min: 1500, x_max: 2500, y_min: 3500, y_max: 4500 },
        zone_type: "ignore",
      },
    };
    // WALK_IN, with target 2 stepping in from (1900, 4000) mm half a second
    // before it stops.
    const { card, hass } = await historyCard({
      payload: { zones },
      movement: pack([
        point(START + 10000, 0, -1000, 2000),
        point(START + 10500, 0, -500, 2000),
        point(START + 19500, 1, 1900, 4000),
        point(START + 20000, 1, 2000, 4000),
        gone(START + 30000, 0),
      ]),
    });
    // Live, zone 2's presence sensor is on and zone 1's off.
    card.hass = {
      ...hass,
      states: {
        [PRESENCE_1]: { state: "off", attributes: {} },
        [PRESENCE_2]: { state: "on", attributes: {} },
      },
    };
    await openHistory(card);
    scrub(card, 20);

    const draws = frame(card);

    // The replay decides, not the sensors: target 1 lights zone 1, and zone 2
    // stays off, as target 2 stands in today's ignore zone, where presence
    // drops it. Detect zones first, the ignore zone flat grey on top.
    expect(draws.filter((d) => d.name === "fillRect").map((d) => d.fill)).toEqual([
      "rgba(244, 67, 54, 0.45)",
      "rgba(33, 150, 243, 0.18)",
      "rgba(97, 97, 97, 0.18)",
    ]);
    // Target 2 a hollow grey ring with a grey number, target 1 filled.
    const number = (n: string) => draws.find((d) => d.name === "fillText" && d.args[0] === n);
    expect(number("2")?.fill).toBe("#757575");
    expect(number("1")?.fill).toBe("#000000");
    const ring = draws.findIndex(
      (d, i) => d.name === "stroke" && d.stroke === "#757575" && draws[i - 1]?.name === "arc"
    );
    expect(draws[ring - 1].args.slice(0, 3).map(px)).toEqual([560, 320, 10]);
    expect(draws.filter((d) => d.name === "fill" && d.fill === "#2196f3")).toEqual([]);
    // And its trail grey, as a live one there is.
    expect(segments(draws, "#757575")).toEqual([[552, 320, 560, 320]]);
    expect(segments(draws, "#2196f3")).toEqual([]);

    // Zones are lit by their shapes now: zone 1 moved off where target 1
    // stood, and the ignore zone over target 2 is gone.
    push(hass, {
      zones: {
        "1": { ...zones["1"], data: { x_min: 500, x_max: 1500, y_min: 1000, y_max: 3000 } },
        "2": zones["2"],
      },
    });
    const after = frame(card);
    expect(after.filter((d) => d.name === "fillRect").map((d) => d.fill)).toEqual([
      "rgba(244, 67, 54, 0.18)",
      "rgba(33, 150, 243, 0.45)",
    ]);
    expect(after.find((d) => d.name === "fillText" && d.args[0] === "2")?.fill).toBe("#000000");
    expect(segments(after, "#2196f3")).toEqual([[552, 320, 560, 320]]);
  });

  it("applies the current rotation and flip to replayed points", async () => {
    // Turned 90 degrees, (x, y) mm in the radar's frame is (y, -x) on the
    // map; flipped, x runs from 5000 mm at the left edge.
    const { card, hass } = await historyCard({
      payload: { rotation_deg: 90, mirror_x: true },
      movement: pack([point(START + 9500, 0, -2000, 1500), point(START + 10000, 0, -2000, 2000)]),
    });
    await openHistory(card);
    scrub(card, 10);

    const draws = frame(card);

    // (-2000, 2000) mm is (2000, 2000) on the map, 240 px from the left, and
    // the trail comes from (-2000, 1500) mm, (1500, 2000) on the map.
    expect(dots(draws)).toEqual([["1", 240, 160]]);
    expect(segments(draws)).toEqual([[280, 160, 240, 160]]);

    // The heatmap's cells turn and flip the same way: the 200 mm cell from
    // (-2000, 2000) mm is the square from (240, 160) to (224, 144) px.
    $(card, "btnHistoryHeatmap").click();
    const heat = frame(card);
    const lastFill = heat.map((d) => d.name === "fill" && String(d.fill).startsWith(ORANGE)).lastIndexOf(true);
    const corners = heat
      .slice(0, lastFill)
      .filter((d) => d.name === "moveTo" || d.name === "lineTo")
      .map((d) => d.args.map(px));
    const quads = [];
    for (let i = 0; i < corners.length; i += 4) quads.push(corners.slice(i, i + 4));
    expect(quads).toContainEqual([
      [240, 160],
      [240, 144],
      [224, 144],
      [224, 160],
    ]);

    // A rotation changed since turns the replay with the map.
    push(hass, { rotation_deg: 0, mirror_x: true });
    expect(dots(frame(card))).toEqual([["1", 560, 160]]);
  });

  it("plays at 1x, 10x and 60x and stops at the end", async () => {
    const { card } = await historyCard();
    await openHistory(card);
    const play = $(card, "btnHistoryPlay");
    const elapsed = () => card._history.t - START;
    expect(speedChip(card, 1).getAttribute("aria-pressed")).toBe("true");

    play.click();
    expect(play.textContent).toBe("Pause");
    // A frame every 66 ms, each moving the replay on by the time since the
    // last: ten frames by 700 ms, the last at 660.
    vi.advanceTimersByTime(700);
    expect(elapsed()).toBeCloseTo(660, 6);
    expect($(card, "historyScrub").value).toBe("1");

    // A new speed counts from the press, 40 ms after that frame.
    speedChip(card, 10).click();
    vi.advanceTimersByTime(660);
    expect(elapsed()).toBeCloseTo(700 + 620 * 10, 6);

    speedChip(card, 60).click();
    vi.advanceTimersByTime(660);
    expect(elapsed()).toBeCloseTo(700 + 620 * 10 + 40 * 10 + 620 * 60, 6);
    expect(
      [1, 10, 60].map((speed) => [
        speedChip(card, speed).getAttribute("aria-pressed"),
        speedChip(card, speed).classList.contains("active"),
      ])
    ).toEqual([
      ["false", false],
      ["false", false],
      ["true", true],
    ]);

    // 10 s before the end it plays to the end and pauses there.
    scrub(card, 3590);
    vi.advanceTimersByTime(660);
    expect(card._history.t).toBe(NOW);
    expect(card._history.playing).toBe(false);
    expect(play.textContent).toBe("Play");
    expect($(card, "historyScrub").value).toBe("3600");
    const draw = vi.spyOn(card, "drawGrid");
    vi.advanceTimersByTime(1000);
    expect(draw).not.toHaveBeenCalled();

    // Play at the end plays it again from the start.
    play.click();
    expect(card._history.t).toBe(START);
    expect(card._history.playing).toBe(true);
    // Pause stops it where it got to, painted there once.
    vi.advanceTimersByTime(100);
    draw.mockClear();
    play.click();
    expect(card._history.playing).toBe(false);
    expect(elapsed()).toBeCloseTo(100 * 60, 6);
    expect(draw).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("drops a superseded movement answer", async () => {
    const { card, hass } = await historyCard();
    // Each read waits until the test answers it.
    const answers: Array<(payload: any) => void> = [];
    hass.movement = () => new Promise((resolve) => answers.push(resolve));
    const hourAnswer = WALK_IN;
    const dayAnswer = pack([point(NOW - 20 * HOUR, 0, 0, 3000)], NOW, NOW - 24 * HOUR);

    $(card, "btnHistory").click();
    rangeChip(card, 24).click();
    rangeChip(card, 1).click();
    expect(movementCalls(hass).map((msg: any) => msg.since)).toEqual([START, NOW - 24 * HOUR, START]);

    // The newest, for the hour, is applied...
    answers[2](hourAnswer);
    await settle();
    expect(card._history.since).toBe(START);
    // ...and the slow day that comes after it is not.
    answers[1](dayAnswer);
    await settle();
    expect(card._history.since).toBe(START);
    expect($(card, "historyScrub").max).toBe("3600");
    expect(rangeChip(card, 1).getAttribute("aria-pressed")).toBe("true");
    scrub(card, 20);
    expect(dots(frame(card))).toEqual([
      ["1", 360, 160],
      ["2", 560, 320],
    ]);

    // An answer that comes after the panel closed opens nothing.
    $(card, "btnHistoryLive").click();
    answers[0](hourAnswer);
    await settle();
    expect($(card, "historyPanel").hidden).toBe(true);
    expect(card._history.series).toBeNull();
    expect(card._replayShowing()).toBe(false);

    // Nor does one for a radar the card no longer shows.
    $(card, "btnHistory").click();
    card.setConfig({ device_id: "devB", ...TEN_METER_GRID });
    answers[3](hourAnswer);
    await settle();
    expect(card._history.open).toBe(false);
    expect(card._history.series).toBeNull();
  });

  it("Clear history asks first, then clears", async () => {
    const { card, hass, toasts } = await historyCard();
    await openHistory(card);
    const clear = $(card, "btnHistoryClear");
    const confirm = $(card, "historyClearConfirm");
    expect(clear.textContent).toBe("Clear history");
    expect(confirm.hidden).toBe(true);

    // It asks in place.
    clear.click();
    expect(confirm.hidden).toBe(false);
    expect(clear.hidden).toBe(true);
    expect(confirm.textContent).toContain("Delete this radar's movement history?");
    expect($(card, "btnHistoryClearYes").textContent).toBe("Delete");
    expect($(card, "btnHistoryClearNo").textContent).toBe("Cancel");
    expect(movementCalls(hass, MOVEMENT_CLEAR)).toEqual([]);
    // A render keeps the question.
    card.render();
    expect($(card, "historyClearConfirm").hidden).toBe(false);

    // Cancel keeps the history.
    $(card, "btnHistoryClearNo").click();
    expect($(card, "historyClearConfirm").hidden).toBe(true);
    expect($(card, "btnHistoryClear").hidden).toBe(false);
    expect(movementCalls(hass, MOVEMENT_CLEAR)).toEqual([]);

    // Delete clears it, says so, and reads what is left.
    hass.movement = pack([]);
    $(card, "btnHistoryClear").click();
    $(card, "btnHistoryClearYes").click();
    await settle();
    expect(movementCalls(hass, MOVEMENT_CLEAR)).toEqual([{ type: MOVEMENT_CLEAR, device_id: "dev123" }]);
    expect(toasts).toEqual(["Movement history cleared"]);
    expect(movementCalls(hass)).toHaveLength(2);
    expect($(card, "historyStatus").textContent).toBe("No movement recorded in this range yet.");
    expect($(card, "historyClearConfirm").hidden).toBe(true);

    // A refused clear says why and keeps the panel as it was.
    hass.clear = () => {
      throw { code: "home_assistant_error", message: "Home Assistant is restarting" };
    };
    $(card, "btnHistoryClear").click();
    $(card, "btnHistoryClearYes").click();
    await settle();
    expect(toasts.slice(1)).toEqual(["Could not clear movement history: Home Assistant is restarting"]);
    expect(movementCalls(hass)).toHaveLength(2);
  });

  it("turning movement history off asks first", async () => {
    const { card, hass, toasts } = await historyCard();
    await openHistory(card);
    const toggle = $(card, "movementToggle");
    const confirm = $(card, "movementConfirm");
    const check = (checked: boolean) => {
      toggle.checked = checked;
      toggle.dispatchEvent(new Event("change"));
    };
    expect(toggle.closest("label").textContent.trim()).toBe("Movement history");
    expect(confirm.hidden).toBe(true);

    // Unticking asks in place, with the box still ticked.
    check(false);
    expect(confirm.hidden).toBe(false);
    expect(confirm.textContent).toContain(
      "Turning this off deletes this radar's movement history from Home Assistant. Backups made while it was on keep their copy."
    );
    expect($(card, "btnMovementOffYes").textContent).toBe("Turn off and delete");
    expect($(card, "btnMovementOffNo").textContent).toBe("Keep it");
    expect(toggle.checked).toBe(true);
    expect(hass.callService).not.toHaveBeenCalled();
    // A render keeps the question.
    card.render();
    expect($(card, "movementConfirm").hidden).toBe(false);

    // Keep it changes nothing.
    $(card, "btnMovementOffNo").click();
    expect($(card, "movementConfirm").hidden).toBe(true);
    expect($(card, "movementToggle").checked).toBe(true);
    expect(hass.callService).not.toHaveBeenCalled();

    // Turn off and delete saves it off, without input_units.
    $(card, "movementToggle").checked = false;
    $(card, "movementToggle").dispatchEvent(new Event("change"));
    $(card, "btnMovementOffYes").click();
    expect($(card, "movementConfirm").hidden).toBe(true);
    expect($(card, "movementToggle").checked).toBe(false);
    await settle();
    expect(hass.callService.mock.calls).toEqual([
      ["apollo_mmwave", "update_zone", { device_id: "dev123", movement_history: false }, undefined, false],
    ]);
    expect(toasts).toEqual(["Movement history is off, and its history is deleted."]);
    // Its echo closes History.
    expect($(card, "historyPanel").hidden).toBe(false);
    push(hass, { movement_history: false });
    expect($(card, "historyPanel").hidden).toBe(true);
    expect($(card, "btnHistory").hidden).toBe(true);
  });

  it("turning movement history on saves it and says where to replay it", async () => {
    const { card, hass, toasts } = await historyCard({ payload: { movement_history: false } });
    const toggle = $(card, "movementToggle");
    expect($(card, "movementOption").textContent).toContain(
      "Keeps up to 24 hours of target positions so administrators can replay them here. Backups include them. Turning it off deletes them from Home Assistant."
    );

    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    await settle();

    // No question for turning it on.
    expect($(card, "movementConfirm").hidden).toBe(true);
    expect(hass.callService.mock.calls).toEqual([
      ["apollo_mmwave", "update_zone", { device_id: "dev123", movement_history: true }, undefined, false],
    ]);
    expect(toasts).toEqual(["Movement history is on. Open History under the map to replay it."]);
    // Its echo brings the History chip.
    expect($(card, "btnHistory").hidden).toBe(true);
    push(hass, { movement_history: true });
    expect($(card, "btnHistory").hidden).toBe(false);
    expect(toggle.checked).toBe(true);

    // A refused save unticks the box again.
    push(hass, { movement_history: false });
    hass.callService.mockRejectedValue(new Error("Home Assistant is restarting"));
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    await settle();
    expect(toggle.checked).toBe(false);
    expect(toasts.slice(1)).toEqual(["Could not save: Home Assistant is restarting"]);
  });

  it("stops playback on disconnect", async () => {
    const { card } = await historyCard();
    document.body.appendChild(card);
    await openHistory(card);
    $(card, "btnHistoryPlay").click();
    vi.advanceTimersByTime(660);
    expect(card._history.playing).toBe(true);

    card.remove();

    // Stopped, and closed: the card comes back to the page live.
    expect(card._history.playing).toBe(false);
    expect(card._history.timer).toBeNull();
    expect(card._history.open).toBe(false);
    const draw = vi.spyOn(card, "drawGrid");
    vi.advanceTimersByTime(1000);
    expect(draw).not.toHaveBeenCalled();
    document.body.appendChild(card);
    expect($(card, "historyPanel").hidden).toBe(true);
    expect($(card, "replayBadge").hidden).toBe(true);
    expect(card._replayShowing()).toBe(false);
  });

  it("formats the replay badge with the Home Assistant locale", async () => {
    // 10 s into the hour is 2026-01-01 00:00:10 UTC. The test runs in UTC.
    const { card, hass } = await historyCard();
    await openHistory(card);
    const badgeFor = (locale: Record<string, any>, serverZone = "Asia/Tokyo") => {
      card.hass = { ...hass, locale, config: { time_zone: serverZone } };
      scrub(card, 10);
      return text($(card, "replayBadge"));
    };

    // A 12-hour clock in the server's zone.
    expect(badgeFor({ language: "en", time_format: "12", time_zone: "server" }, "UTC")).toBe(
      "Replay 12:00:10 AM"
    );
    // A 24-hour clock, with two-digit hours as Home Assistant writes them.
    expect(badgeFor({ language: "de", time_format: "24", time_zone: "server" })).toBe(
      "Replay 09:00:10"
    );
    expect(badgeFor({ language: "en", time_format: "24", time_zone: "server" }, "UTC")).toBe(
      "Replay 00:00:10"
    );
    // This browser's zone unless the profile says the server's.
    expect(badgeFor({ language: "de", time_format: "24", time_zone: "local" })).toBe(
      "Replay 00:00:10"
    );
    // The language's own clock unless the profile picks one.
    expect(badgeFor({ language: "en", time_format: "language", time_zone: "server" }, "UTC")).toBe(
      "Replay 12:00:10 AM"
    );
    expect(badgeFor({ language: "en-GB", time_format: "system", time_zone: "server" }, "UTC")).toBe(
      "Replay 00:00:10"
    );
    // A zone or a language Intl does not know: this browser's own format.
    const browser = `Replay ${new Date(START + 10000).toLocaleTimeString()}`.replace(/ /g, " ");
    expect(badgeFor({ language: "en", time_format: "24", time_zone: "server" }, "Not/AZone")).toBe(
      browser
    );
    expect(badgeFor({ language: "en_US!", time_format: "24", time_zone: "local" })).toBe(browser);
    // No locale at all, as on an older Home Assistant.
    expect(badgeFor(undefined as any)).toBe(browser);
    // The time under the scrubber reads the same.
    expect(text($(card, "historyTime"))).toBe(`${browser.slice("Replay ".length)}, 59 min ago`);
  });

  it("asks again by the server's clock when this browser's is more than a minute off", async () => {
    const { card, hass } = await historyCard();
    // The server's clock is 2 min ahead of this browser's.
    hass.movement = () => pack([point(START + 130000, 0, -1000, 2000)], Date.now() + 120000);

    await openHistory(card);

    // The second read starts from the server's hour, and its answer is the
    // range: from 2 min after this browser's hour ago to the server's now.
    expect(movementCalls(hass).map((msg: any) => msg.since)).toEqual([START, START + 120000]);
    expect(card._history.since).toBe(START + 120000);
    expect(card._history.serverNow).toBe(NOW + 120000);
    scrub(card, 10);
    expect(dots(frame(card))).toEqual([["1", 320, 160]]);

    // The next read starts from the corrected clock, and once is enough.
    rangeChip(card, 6).click();
    await settle();
    expect(movementCalls(hass).map((msg: any) => msg.since)).toEqual([
      START,
      START + 120000,
      NOW + 120000 - 6 * HOUR,
    ]);

    // Under a minute off is not asked again.
    const near = await historyCard();
    near.hass.movement = () => pack([], Date.now() + 50000);
    await openHistory(near.card);
    expect(movementCalls(near.hass)).toHaveLength(1);
    expect(near.card._history.since).toBe(START + 50000);
  });

  it("says why movement history did not load, or that nothing was recorded", async () => {
    const { card, hass } = await historyCard();
    const statusAfter = async (movement: any) => {
      hass.movement = movement;
      $(card, "btnHistoryLive").click();
      await openHistory(card);
      return $(card, "historyStatus").textContent;
    };
    const refuse = (error: any) => () => Promise.reject(error);

    expect(await statusAfter(refuse({ code: "unauthorized", message: "Unauthorized" }))).toBe(
      "Only an administrator can open movement history."
    );
    // Nothing to play or scrub, and the live map stays.
    expect($(card, "btnHistoryPlay").disabled).toBe(true);
    expect($(card, "historyScrub").disabled).toBe(true);
    expect(card._replayShowing()).toBe(false);
    expect($(card, "replayBadge").hidden).toBe(true);

    expect(await statusAfter(refuse({ code: "not_loaded", message: "Apollo mmWave is not loaded." }))).toBe(
      "Could not load movement history: Apollo mmWave is not loaded."
    );
    expect(await statusAfter(refuse({ code: "unknown_error" }))).toBe(
      "Could not load movement history: Home Assistant rejected it."
    );
    // A column whose length does not match the record count.
    expect(await statusAfter({ ...WALK_IN, x: column([1, 2, 3], 2) })).toBe(
      "Could not load movement history: the x column has 6 bytes where 4 records need 8"
    );
    // Something that is not movement history at all, as Home Assistant's
    // answer to a command it does not know is not.
    expect(await statusAfter([])).toBe(
      "Could not load movement history: Home Assistant sent an answer this card cannot read."
    );
    expect(card._replayShowing()).toBe(false);

    // Nothing recorded, or only a target leaving: an empty replay.
    expect(await statusAfter(pack([]))).toBe("No movement recorded in this range yet.");
    expect(card._replayShowing()).toBe(true);
    expect(dots(frame(card))).toEqual([]);
    expect(await statusAfter(pack([gone(START + 5000, 0)]))).toBe(
      "No movement recorded in this range yet."
    );
    // The status line is a polite live region.
    expect($(card, "historyStatus").getAttribute("role")).toBe("status");
    expect(await statusAfter(WALK_IN)).toBe("");
  });

  it("paints the heatmap in place of coverage", async () => {
    const { card, hass } = await historyCard();
    let states: Record<string, any> = {};
    const move = (x: number, y: number) => {
      states = { ...states, "sensor.a_x": { state: String(x) }, "sensor.a_y": { state: String(y) } };
      card.hass = { ...hass, states };
    };
    // Live coverage on, where target 1 walked, around (-3000, 6000) mm.
    $(card, "btnCoverage").click();
    move(-3000, 6000);
    vi.advanceTimersByTime(200);
    move(-3000, 6400);
    vi.advanceTimersByTime(200);
    move(-3000, 6800);
    const cellFills = (draws: Draw[]) =>
      draws.filter((d) => d.name === "fill" && String(d.fill).startsWith(ORANGE));
    /** The first corner of each painted cell. */
    const cellCorners = (draws: Draw[]) => {
      const last = draws.indexOf(cellFills(draws).slice(-1)[0]);
      return draws.slice(0, last).filter((d) => d.name === "moveTo").map((d) => d.args.map(px));
    };
    const coverage = cellCorners(frame(card));
    expect(coverage).toEqual([
      [160, 480],
      [160, 512],
    ]);

    // A replay with Heatmap off keeps this viewer's coverage.
    await openHistory(card);
    const heatmap = $(card, "btnHistoryHeatmap");
    expect(heatmap.textContent).toBe("Heatmap");
    expect(heatmap.getAttribute("aria-pressed")).toBe("false");
    expect(cellCorners(frame(card))).toEqual(coverage);

    // Heatmap on paints where the replayed targets spent their time, from
    // dwell: half a second at (-1000, 2000) mm, faint, then 15 s each at
    // (-500, 2000) and (2000, 4000), strong.
    heatmap.click();
    expect(heatmap.getAttribute("aria-pressed")).toBe("true");
    expect(heatmap.classList.contains("active")).toBe(true);
    const draws = frame(card);
    const fills = cellFills(draws).map((d) => d.fill);
    expect(fills).toHaveLength(2);
    expect(fills[1]).toBe("rgba(255, 152, 0, 0.5)");
    expect(cellCorners(draws)).toEqual([
      [320, 160],
      [352, 160],
      [560, 320],
    ]);
    // Under everything else, as coverage is.
    expect(draws.findIndex((d) => d.name === "fillRect")).toBeGreaterThan(
      draws.indexOf(cellFills(draws)[1])
    );

    // Back to live, coverage again; the Heatmap pick stays for next time.
    $(card, "btnHistoryLive").click();
    expect(cellCorners(frame(card))).toEqual(coverage);
    await openHistory(card);
    expect($(card, "btnHistoryHeatmap").getAttribute("aria-pressed")).toBe("true");
  });

  it("draws the sparkline from the record counts", async () => {
    // Three positions in the range's first 30 s and one 30 min in; a target
    // leaving is no position.
    const { card } = await historyCard({
      movement: pack([
        point(START + 1000, 0, -1000, 2000),
        point(START + 2000, 0, -900, 2000),
        point(START + 3000, 0, -800, 2000),
        gone(START + 4000, 0),
        point(START + 1800000, 1, 0, 3000),
      ]),
    });
    expect($(card, "historySpark").innerHTML).toBe("");
    await openHistory(card);

    const spark = $(card, "historySpark");
    expect(spark.getAttribute("aria-hidden")).toBe("true");
    const svg = spark.querySelector("svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 120 24");
    // A bar per 30 s slice with a record, its height by the log of the count.
    expect(
      Array.from(spark.querySelectorAll("rect"), (rect: any) =>
        ["x", "y", "width", "height"].map((name) => rect.getAttribute(name))
      )
    ).toEqual([
      ["0", "0.00", "1", "24.00"],
      ["60", "12.00", "1", "12.00"],
    ]);
    // Nothing recorded draws no bars.
    $(card, "btnHistoryLive").click();
    expect($(card, "historySpark").innerHTML).toBe("");
  });

  it("a range change reads the new range and replays it from its start", async () => {
    const { card, hass } = await historyCard();
    await openHistory(card);
    scrub(card, 20);
    $(card, "btnHistoryPlay").click();
    expect(rangeChip(card, 1).getAttribute("aria-pressed")).toBe("true");
    hass.movement = pack([point(NOW - 5 * HOUR, 0, 0, 3000)], NOW, NOW - 6 * HOUR);
    const draw = vi.spyOn(card, "drawGrid");

    rangeChip(card, 6).click();

    // Stopped, the old answer dropped and the live map painted once while
    // the six hours load.
    expect(card._history.playing).toBe(false);
    expect(card._replayShowing()).toBe(false);
    expect(draw).toHaveBeenCalledTimes(1);
    expect($(card, "historyStatus").textContent).toBe("Loading movement history...");
    expect(
      [1, 6, 24].map((hours) => rangeChip(card, hours).getAttribute("aria-pressed"))
    ).toEqual(["false", "true", "false"]);
    expect(movementCalls(hass).map((msg: any) => msg.since)).toEqual([START, NOW - 6 * HOUR]);

    await settle();
    expect(card._history.t).toBe(NOW - 6 * HOUR);
    expect($(card, "historyScrub").max).toBe("21600");
    expect($(card, "historyScrub").value).toBe("0");
    expect(card._history.playing).toBe(false);
    scrub(card, 3600);
    expect(dots(frame(card))).toEqual([["1", 400, 240]]);
    // Pressing the range shown asks for nothing.
    rangeChip(card, 6).click();
    expect(movementCalls(hass)).toHaveLength(2);
  });

  it("keeps the panel and the replay through a render", async () => {
    const { card } = await historyCard();
    await openHistory(card);
    scrub(card, 20);
    $(card, "btnHistoryHeatmap").click();
    speedChip(card, 10).click();
    $(card, "btnHistoryPlay").click();

    // A theme flip renders the whole card again.
    card.render();

    expect($(card, "historyPanel").hidden).toBe(false);
    expect($(card, "btnHistory").getAttribute("aria-expanded")).toBe("true");
    expect($(card, "btnHistoryHeatmap").getAttribute("aria-pressed")).toBe("true");
    expect(speedChip(card, 10).getAttribute("aria-pressed")).toBe("true");
    expect(rangeChip(card, 1).getAttribute("aria-pressed")).toBe("true");
    expect($(card, "btnHistoryPlay").textContent).toBe("Pause");
    expect($(card, "historyScrub").value).toBe("20");
    expect($(card, "replayBadge").hidden).toBe(false);
    expect(text($(card, "replayBadge"))).toBe("Replay 12:00:20 AM");
    expect($(card, "historySpark").querySelectorAll("rect")).toHaveLength(1);
    // And plays on, on the new canvas.
    vi.advanceTimersByTime(660);
    expect(card._history.t - START).toBeCloseTo(20000 + 6600, 6);
    expect($(card, "historyScrub").value).toBe("27");
  });

  it("keeps live pushes off the map while the replay shows", async () => {
    const { card, hass } = await historyCard();
    document.body.appendChild(card);
    let states: Record<string, any> = {};
    const move = (x: number) => {
      states = { "sensor.a_x": { state: String(x) }, "sensor.a_y": { state: "2000" } };
      card.hass = { ...hass, states };
    };
    move(-2000);
    vi.advanceTimersByTime(200);
    // A live trail now, which a fade frame would paint.
    move(-1000);
    await openHistory(card);
    const draw = vi.spyOn(card, "drawGrid");

    // A target's move and a fade frame paint nothing.
    vi.advanceTimersByTime(200);
    move(0);
    vi.advanceTimersByTime(1000);
    expect(draw).not.toHaveBeenCalled();
    // A scrub paints once.
    scrub(card, 20);
    expect(draw).toHaveBeenCalledTimes(1);

    // Back to live paints the live map once, and the live trail fades on.
    $(card, "btnHistoryLive").click();
    expect(draw).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(100);
    expect(draw).toHaveBeenCalledTimes(3);
    expect(dots(frame(card))).toEqual([["1", 400, 160]]);
    expect(segments(frame(card))).toHaveLength(2);
  });

  it("fades the live trails on while another range loads, and after it fails", async () => {
    const { card, hass } = await historyCard();
    document.body.appendChild(card);
    const move = (x: number) => {
      const states = { "sensor.a_x": { state: String(x) }, "sensor.a_y": { state: "2000" } };
      card.hass = { ...hass, states };
    };
    move(-2000);
    vi.advanceTimersByTime(200);
    move(-1000);
    await openHistory(card);
    expect(card._replayShowing()).toBe(true);
    // The fade frame that was due stands down under the replay.
    vi.advanceTimersByTime(200);
    expect(card._trailTimer).toBeNull();
    let fail: (error: unknown) => void = () => {};
    hass.movement = () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      });
    rangeChip(card, 6).click();
    const draw = vi.spyOn(card, "drawGrid");

    // The radar sends nothing new, so only the fade timer paints the live
    // trail, which the range change put back on the map.
    vi.advanceTimersByTime(100);
    expect(draw).toHaveBeenCalledTimes(1);
    fail({ code: "unknown_error", message: "Timeout" });
    await settle();
    expect($(card, "historyStatus").textContent).toBe("Could not load movement history: Timeout");
    vi.advanceTimersByTime(100);
    expect(draw).toHaveBeenCalledTimes(2);
    // Until the trail is gone, then the timer stops.
    vi.advanceTimersByTime(3000);
    expect(segments(frame(card))).toEqual([]);
    expect(card._trailTimer).toBeNull();
  });

  it("closes History from Back to live, the chip, a load error, another radar and view_only", async () => {
    const { card, hass } = await historyCard();
    const closed = () => [
      $(card, "historyPanel")?.hidden ?? null,
      card._history.open,
      card._history.series,
      card._replayShowing(),
    ];

    await openHistory(card);
    expect($(card, "btnHistoryLive").textContent).toBe("Back to live");
    $(card, "btnHistoryLive").click();
    expect(closed()).toEqual([true, false, null, false]);
    expect($(card, "replayBadge").hidden).toBe(true);
    expect($(card, "btnHistory").getAttribute("aria-expanded")).toBe("false");

    // The chip closes it too. The range, speed and Heatmap stay picked.
    await openHistory(card);
    rangeChip(card, 6).click();
    speedChip(card, 60).click();
    $(card, "btnHistoryHeatmap").click();
    await settle();
    $(card, "btnHistory").click();
    expect(closed()).toEqual([true, false, null, false]);
    await openHistory(card);
    expect(movementCalls(hass).slice(-1)[0].since).toBe(NOW - 6 * HOUR);
    expect(speedChip(card, 60).getAttribute("aria-pressed")).toBe("true");
    expect($(card, "btnHistoryHeatmap").getAttribute("aria-pressed")).toBe("true");

    // So does the error screen when the store cannot answer, with nothing
    // playing behind it, and the map comes back live.
    $(card, "btnHistoryPlay").click();
    card._setLoadError("Apollo mmWave is not loaded.");
    expect([card._history.open, card._history.playing, card._history.timer]).toEqual([
      false,
      false,
      null,
    ]);
    push(hass, {});
    expect(closed()).toEqual([true, false, null, false]);
    await openHistory(card);

    // Pointing the card at another radar closes it.
    card.setConfig({ device_id: "devB", ...TEN_METER_GRID });
    expect(closed()).toEqual([true, false, null, false]);
    await vi.waitFor(() => expect(card._zoneConfigPayload).toBeTruthy());

    // So does view_only, whose map has no panel.
    await openHistory(card);
    expect(card._replayShowing()).toBe(true);
    card.setConfig({ device_id: "devB", ...TEN_METER_GRID, view_only: true });
    expect(closed()).toEqual([null, false, null, false]);
  });

  it("draws over the replay, and pressing a History control ends the shape", async () => {
    // Drawing stays possible with History open: the heatmap is a good guide.
    const { card } = await historyCard({ config: { start_locked: false } });
    document.body.appendChild(card);
    layOut(card, 800);
    await openHistory(card);
    scrub(card, 20);
    const mouse = (type: string, x: number, y: number) =>
      card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
    mouse("mousedown", 100, 100);
    mouse("mousemove", 300, 250);
    expect(card.isDrawing).toBe(true);

    // The rubber band and its size over the replayed zones, under its dots.
    const draws = frame(card);
    expect(draws.filter((d) => d.name === "setLineDash" && d.args[0].join() === "5,5")).toHaveLength(1);
    expect(draws.some((d) => d.name === "fillText" && String(d.args[0]).includes(" × "))).toBe(true);
    expect(dots(draws)).toEqual([
      ["1", 360, 160],
      ["2", 560, 320],
    ]);

    // A press on a History control ends it, as a press anywhere else in the
    // card outside the map does.
    pressOn($(card, "btnHistoryPlay"), "mousedown");
    expect(card.isDrawing).toBe(false);
  });
});

/**
 * The map flipped left to right (mirror_x).
 *
 * A radar mounted one way round shows a person who steps to its right
 * stepping left on the map. An administrator flips that radar's map for
 * everyone who opens it, and nothing stored flips: zones are saved, and
 * presence tests targets, in the radar's own frame. Every screen to mm
 * conversion goes through valueToPixels and pixelsToValue, and the drawing
 * paths that skip them (the grid's step, the cone rings, the range label's
 * direction) flip the same way. On the 10 m grid, symmetric about x = 0, a
 * flipped x pixel is 800 minus the unflipped one.
 */
describe("zone map card flipped map", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const PLAIN = { ...ZONE_PAYLOAD, rotation_deg: 30 };
  const FLIPPED = { ...PLAIN, mirror_x: true };

  async function mapCard(payload: any, config: Record<string, any> = {}, isAdmin = true) {
    const hass = fakeHass(payload);
    hass.user = { is_admin: isAdmin };
    const card = await mountCard(hass, { ...TEN_METER_GRID, ...config });
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  const toggle = (card: any) => card.shadowRoot.getElementById("mirrorToggle");
  const slider = (card: any) => card.shadowRoot.getElementById("coneAngleSlider");

  function check(card: any, checked: boolean) {
    toggle(card).checked = checked;
    toggle(card).dispatchEvent(new Event("change"));
  }

  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  /** The calls one draw makes, on a fresh recording context. */
  function record(card: any, draw: (card: any) => void): Array<[string, any[]]> {
    const { ctx, calls } = recordingContext();
    card.ctx = ctx;
    draw(card);
    return calls;
  }

  const named = (calls: Array<[string, any[]]>, ...names: string[]) =>
    calls.filter(([name]) => names.includes(name)).map(([, args]) => args);

  it("says to turn the map the way the room is before judging the flip", async () => {
    // At Cone rotation 180 a correct radar moves the dot against a step to
    // the reader's right on an unturned screen, so the hint asks for the map
    // turned to match the room first.
    const { card } = await mapCard(PLAIN);
    const hint = card.shadowRoot.querySelector("#mirrorOption + .map-option-hint");
    expect(hint?.textContent).toBe(
      "Turn this on if, with the map turned the way the room is, a dot moves the opposite way from you."
    );
  });

  it("mirrors zones, targets, cone and grid when mirror_x is on", async () => {
    const plain = await mapCard(PLAIN, { unit_display: true });
    const flipped = await mapCard(FLIPPED, { unit_display: true });
    for (const { hass } of [plain, flipped]) {
      hass.states = { "sensor.a_x": { state: "500" }, "sensor.a_y": { state: "2000" } };
    }
    const mirrored = (x: number) => 800 - x;

    // Grid lines, by value.
    const lines = (card: any) => card._getGridRenderState().xLines;
    expect(lines(plain.card).map((l: any) => l.value)).toEqual(
      lines(flipped.card).map((l: any) => l.value)
    );
    lines(plain.card).forEach((line: any, i: number) => {
      expect(lines(flipped.card)[i].pixel).toBeCloseTo(mirrored(line.pixel), 6);
    });
    // The X labels keep their stored values and move with their lines, so
    // they read high to low across the flipped map.
    const xLabels = (card: any) =>
      card._getGridRenderState().labels.x.map((l: any) => [l.text, l.x]);
    const plainLabels = xLabels(plain.card);
    expect(plainLabels.length).toBeGreaterThan(4);
    expect(xLabels(flipped.card)).toEqual(
      plainLabels.map(([text, x]: [string, number]) => [text, expect.closeTo(mirrored(x), 6)])
    );
    const leftToRight = [...xLabels(flipped.card)].sort((a, b) => a[1] - b[1]);
    expect(leftToRight[0][0]).toBe("4m");

    // The cone, its rings and their labels, point for point.
    const cone = (card: any) =>
      named(
        record(card, (c) => c.drawDeviceCone(c._getGridRenderState().metrics, null)),
        "moveTo",
        "lineTo",
        "fillText"
      ).map((args) => (typeof args[0] === "string" ? args : [null, ...args]));
    const plainCone = cone(plain.card);
    expect(plainCone.length).toBeGreaterThan(50);
    cone(flipped.card).forEach(([text, x, y], i) => {
      expect(text).toBe(plainCone[i][0]);
      expect(x).toBeCloseTo(mirrored(plainCone[i][1]), 6);
      expect(y).toBeCloseTo(plainCone[i][2], 6);
    });

    // The range label sits past the arc on the side the cone faces on screen.
    const plainRange = plain.card._rangeLabel();
    const flippedRange = flipped.card._rangeLabel();
    expect(flippedRange.x).toBeCloseTo(mirrored(plainRange.x), 6);
    expect(flippedRange.y).toBeCloseTo(plainRange.y, 6);

    // The zone and the target dot.
    const shapes = (card: any) => ({
      rects: named(
        record(card, (c) => c.drawZones()),
        "fillRect"
      ),
      dots: named(
        record(card, (c) => c._drawTrackedTargets()),
        "arc"
      ).filter((args) => args[2] === 10),
    });
    const plainShapes = shapes(plain.card);
    const flippedShapes = shapes(flipped.card);
    expect(plainShapes.rects).toHaveLength(1);
    const [x, y, w, h] = plainShapes.rects[0];
    expect(flippedShapes.rects).toEqual([
      [expect.closeTo(mirrored(x + w), 6), y, expect.closeTo(w, 6), h],
    ]);
    expect(plainShapes.dots).toHaveLength(1);
    expect(flippedShapes.dots[0][0]).toBeCloseTo(mirrored(plainShapes.dots[0][0]), 6);
    expect(flippedShapes.dots[0][1]).toBeCloseTo(plainShapes.dots[0][1], 6);

    // A pushed flip redraws flipped with no cache left behind.
    plain.hass.handlers[ZONES_SUBSCRIBE][0](FLIPPED);
    expect(lines(plain.card)[0].pixel).toBeCloseTo(800, 6);
  });

  it("pixelsToValue inverts valueToPixels under the flip", async () => {
    const { card } = await mapCard(FLIPPED);

    expect(card.valueToPixels(5000, "x")).toBe(0);
    expect(card.valueToPixels(-5000, "x")).toBeCloseTo(800, 9);
    expect(card.valueToPixels(1000, "x")).toBeCloseTo(320, 9);
    expect(card.pixelsToValue(0, "x")).toBe(5000);
    expect(card.pixelsToValue(320, "x")).toBeCloseTo(1000, 9);
    // Up and down never flip.
    expect(card.valueToPixels(2500, "y")).toBeCloseTo(200, 9);
    expect(card.pixelsToValue(200, "y")).toBeCloseTo(2500, 9);
    for (const value of [-5000, -1234.5, 0, 2500, 5000]) {
      expect(card.pixelsToValue(card.valueToPixels(value, "x"), "x")).toBeCloseTo(value, 6);
    }
  });

  it("saves a rect drawn on a flipped map in unflipped mm", async () => {
    const { card, hass, toasts } = await mapCard(FLIPPED, { start_locked: false });
    expect(card.selectedZone).toBe(1);
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 800,
      x: 0,
      y: 0,
      width: 800,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect);

    const mouse = (type: string, x: number, y: number) =>
      card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
    mouse("mousedown", 100, 100);
    mouse("mousemove", 300, 250);
    mouse("mouseup", 300, 250);
    await settle();

    // Canvas x 100 to 300 is 3750 to 1250 mm on the flipped map, where the
    // same drag on an unflipped one saves -3750 to -1250. Corners snap to
    // 5 cm on this 0.5 m grid, so 3125 mm down is saved as 3150.
    const data = { x_min: 1250, x_max: 3750, y_min: 1250, y_max: 3150 };
    expect(hass.callService.mock.calls.map((call: any[]) => call[2])).toEqual([
      { device_id: "dev123", zone_id: 1, shape: "rect", data, input_units: "mm" },
    ]);
    expect(card.zones).toEqual([{ id: 1, shape: "rect", data }]);
    expect(toasts).toEqual(["Doorway saved"]);
  });

  it("an administrator saves the flip without input_units", async () => {
    const { card, hass } = await mapCard(PLAIN);
    expect(toggle(card).disabled).toBe(false);
    expect(toggle(card).checked).toBe(false);
    expect(card.shadowRoot.getElementById("mapOptionsNote").hidden).toBe(true);

    check(card, true);

    // Flipped at once, ahead of the save's echo.
    expect(card._mirrorX).toBe(true);
    expect(card.valueToPixels(5000, "x")).toBe(0);
    expect(slider(card).style.direction).toBe("rtl");
    expect(hass.callService.mock.calls).toEqual([
      ["apollo_mmwave", "update_zone", { device_id: "dev123", mirror_x: true }, undefined, false],
    ]);

    // Unticking saves false, which removes the key from the store.
    hass.handlers[ZONES_SUBSCRIBE][0](FLIPPED);
    hass.callService.mockClear();
    check(card, false);
    expect(card._mirrorX).toBe(false);
    expect(hass.callService.mock.calls.map((call: any[]) => call[2])).toEqual([
      { device_id: "dev123", mirror_x: false },
    ]);
  });

  it("a viewer cannot change the flip", async () => {
    const { card, hass } = await mapCard(PLAIN, {}, false);
    const note = card.shadowRoot.getElementById("mapOptionsNote");
    expect(toggle(card).disabled).toBe(true);
    expect(toggle(card).title).toBe("Only an administrator can change this");
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe("Only an administrator can change these.");

    // Nothing that still reaches the disabled checkbox flips or saves.
    check(card, true);
    expect(card._mirrorX).toBe(false);
    expect(toggle(card).checked).toBe(false);
    expect(hass.callService).not.toHaveBeenCalled();

    // A viewer still sees the flip an administrator saved.
    hass.handlers[ZONES_SUBSCRIBE][0](FLIPPED);
    expect(card._mirrorX).toBe(true);
    expect(toggle(card).checked).toBe(true);
    expect(toggle(card).disabled).toBe(true);

    // And the checkbox wakes up when the viewer is an administrator.
    card.hass = { ...hass, user: { is_admin: true } };
    expect(toggle(card).disabled).toBe(false);
    expect(toggle(card).title).toBe("");
    expect(note.hidden).toBe(true);
  });

  it("reverts the flip when the save is refused", async () => {
    const { card, hass, toasts } = await mapCard(PLAIN);
    hass.callService.mockRejectedValue(new Error("Home Assistant is restarting"));

    check(card, true);
    expect(card._mirrorX).toBe(true);
    await settle();

    expect(card._mirrorX).toBe(false);
    expect(toggle(card).checked).toBe(false);
    expect(slider(card).style.direction).toBe("");
    expect(card.valueToPixels(-5000, "x")).toBe(0);
    expect(toasts).toEqual(["Could not save: Home Assistant is restarting"]);
  });

  it("flips the cone slider's drag direction", async () => {
    // Flipped, +X is on the left, so a slider dragged right would turn the
    // cone left on screen. It runs right to left instead.
    const { card, hass } = await mapCard(FLIPPED);
    expect(slider(card).style.direction).toBe("rtl");
    expect(toggle(card).checked).toBe(true);

    hass.handlers[ZONES_SUBSCRIBE][0](PLAIN);

    expect(slider(card).style.direction).toBe("");
    expect(toggle(card).checked).toBe(false);
  });

  it("keeps the flipped slider direction after a render", async () => {
    const { card, hass } = await mapCard(FLIPPED);

    card.render();
    expect(slider(card).style.direction).toBe("rtl");
    expect(toggle(card).checked).toBe(true);

    // A theme flip renders the whole card again too.
    card.hass = { ...hass, themes: { darkMode: true } };
    expect(card.shadowRoot.querySelector(".container.dark")).not.toBeNull();
    expect(slider(card).style.direction).toBe("rtl");
    expect(toggle(card).checked).toBe(true);
    expect(card.valueToPixels(5000, "x")).toBe(0);
  });

  it("forgets the flip when pointed at another radar", async () => {
    const { card, hass } = await mapCard(FLIPPED);
    hass.payload = PLAIN;

    card.setConfig({ device_id: "other", ...TEN_METER_GRID });
    expect(card._mirrorX).toBe(false);
    await vi.waitFor(() => expect(card._zoneConfigPayload).toBeTruthy());
    expect(card._mirrorX).toBe(false);
    expect(slider(card).style.direction).toBe("");
  });
});

/**
 * The Zones panel under the map.
 *
 * Adding a zone, renaming it, its Type, its Hold and Delete used to sit two
 * collapsed sections deep, under Configure and then Zones, and the chips
 * above them led nowhere. Now the panel is always open under the map: the
 * Zones heading with Add zone, the chips, and the selected zone's editor.
 * Map settings keeps what is set once for the map. A new radar says how to
 * start instead of a map that silently takes no drawing.
 */
describe("zone map card zones panel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  const EMPTY = { ...ZONE_PAYLOAD, zones: {} };
  const $ = (card: any, id: string) => card.shadowRoot.getElementById(id);

  it("sits outside Map settings, open while Map settings is shut", async () => {
    const card = await mountCard(adminHass());
    const settings = $(card, "configContent");

    expect(settings.hidden).toBe(true);
    for (const id of ["zonePanel", "btnAddZone", "zone-buttons", "zoneManager"]) {
      expect(settings.contains($(card, id))).toBe(false);
      expect($(card, id).closest("[hidden]")).toBeNull();
    }
    expect($(card, "zonePanelTitle").textContent).toBe("Zones");
    expect($(card, "btnAddZone").textContent).toBe("Add zone");
    expect(editorOf(card).dataset.editorZone).toBe("1");
    // Under the map's own chips (Coverage, History) and the History panel,
    // above Map settings.
    const order = ["viewTools", "historyPanel", "zonePanel", "btnConfigToggle"].map((id) => $(card, id));
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // The nested Zones section is gone.
    expect($(card, "toggleZones")).toBeNull();
    expect($(card, "sectionZones")).toBeNull();
  });

  it("opens and shuts Map settings as a real disclosure button", async () => {
    const card = await mountCard(adminHass());
    const toggle = $(card, "btnConfigToggle");

    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.querySelector(".config-title").textContent).toBe("Map settings");
    expect(toggle.getAttribute("aria-controls")).toBe("configContent");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.click();
    expect($(card, "configContent").hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.querySelector(".config-caret").textContent).toBe("▾");

    // Open it stays across a render, as page memory.
    card.render();
    expect($(card, "configContent").hidden).toBe(false);
    $(card, "btnConfigToggle").click();
    expect($(card, "configContent").hidden).toBe(true);
    expect($(card, "btnConfigToggle").getAttribute("aria-expanded")).toBe("false");
  });

  it("says how to start on a radar with no zones", async () => {
    const card = await mountCard(adminHass(EMPTY));

    expect($(card, "zoneEmpty").hidden).toBe(false);
    expect($(card, "zoneEmptyText").textContent).toBe(
      "No zones yet. Press Add zone, then drag on the map to draw it."
    );
    expect($(card, "zoneEmptyRotation").hidden).toBe(false);
    expect($(card, "zoneEmptyRotation").textContent).toBe(
      "Is the sensor turned, or mounted in a corner? Set Cone rotation under Map settings first."
    );
    expect($(card, "btnAddZone").hidden).toBe(false);
    expect(card.shadowRoot.querySelectorAll("#zone-buttons .zone-btn")).toHaveLength(0);
    expect(editorOf(card)).toBeNull();

    $(card, "btnAddZone").click();

    expect($(card, "zoneEmpty").hidden).toBe(true);
    expect(chipOf(card, 1).textContent).toBe("Zone 1");
    expect(editorOf(card).dataset.editorZone).toBe("1");
    // The focus stays on Add zone, so no phone keyboard opens over the map.
    expect(card.shadowRoot.activeElement).not.toBe(nameFieldOf(card));
  });

  it("tells a viewer an administrator adds zones, with no Add zone", async () => {
    const card = await mountCard(fakeHass(EMPTY));

    expect($(card, "zoneEmptyText").textContent).toBe("No zones yet. An administrator can add them.");
    expect($(card, "zoneEmptyRotation").hidden).toBe(true);
    expect($(card, "btnAddZone").hidden).toBe(true);
  });

  it("says to press Add zone at a press on the map of a radar with no zones", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const card = await mountCard(adminHass(EMPTY), TEN_METER_GRID);
      layOut(card, 800);
      const toasts = notifications(card);
      const press = () =>
        card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 400, clientY: 400 }));

      press();
      press();
      expect(toasts).toEqual(["Press Add zone under the map first."]);
      vi.advanceTimersByTime(1600);
      press();
      expect(toasts).toHaveLength(2);
      expect(card.isDrawing).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says nothing at a viewer's press on a map with no zones", async () => {
    const card = await mountCard(fakeHass(EMPTY), TEN_METER_GRID);
    layOut(card, 800);
    const toasts = notifications(card);

    card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 400, clientY: 400 }));

    expect(toasts).toEqual([]);
  });

  it("selects a zone from its chip, pressed, with its editor", async () => {
    const two = { ...ZONE_PAYLOAD, zones: { ...ZONE_PAYLOAD.zones, "2": { shape: "none", data: null, name: "Couch" } } };
    const card = await mountCard(adminHass(two));
    expect(chipOf(card, 1).getAttribute("aria-pressed")).toBe("true");
    expect(chipOf(card, 2).getAttribute("aria-pressed")).toBe("false");
    expect(chipOf(card, 2).getAttribute("aria-controls")).toBe("zoneManager");
    expect($(card, "zone-buttons").getAttribute("role")).toBe("group");

    chipOf(card, 2).click();

    expect(card.selectedZone).toBe(2);
    expect(chipOf(card, 2).getAttribute("aria-pressed")).toBe("true");
    expect(chipOf(card, 2).classList.contains("active")).toBe(true);
    expect(chipOf(card, 1).getAttribute("aria-pressed")).toBe("false");
    expect($(card, "zoneEditorTitle").textContent).toBe("Zone 2");
    expect(nameFieldOf(card).value).toBe("Couch");
    expect(editorOf(card).getAttribute("aria-labelledby")).toBe("zoneEditorTitle");
  });

  it("gives each chip its zone's color, hollow until drawn and hatched when ignored", async () => {
    const card = await mountCard(
      adminHass({
        ...ZONE_PAYLOAD,
        zones: {
          ...ZONE_PAYLOAD.zones,
          "2": { shape: "none", data: null, name: "Couch" },
          "3": { ...ZONE_PAYLOAD.zones["1"], name: "Fan", zone_type: "ignore" },
        },
      })
    );
    const dot = (id: number) => chipOf(card, id).querySelector(".zone-dot");

    expect(dot(1).style.getPropertyValue("--zone-color")).toBe("rgba(244, 67, 54, 1)");
    expect(dot(1).className).toBe("zone-dot");
    expect(dot(2).style.getPropertyValue("--zone-color")).toBe("rgba(33, 150, 243, 1)");
    expect(dot(2).className).toBe("zone-dot undrawn");
    expect(dot(3).className).toBe("zone-dot ignore");
    expect(dot(1).getAttribute("aria-hidden")).toBe("true");
    // The chip's text is the name alone.
    expect(chipOf(card, 3).textContent).toBe("Fan");
    // The editor is edged in the zone's color.
    expect(editorOf(card).style.getPropertyValue("--zone-color")).toBe("rgba(244, 67, 54, 1)");
  });

  it("clears nothing on a chip double-click", async () => {
    const hass = adminHass();
    const card = await mountCard(hass, { start_locked: false });
    hass.callService.mockClear();
    const toasts = notifications(card);

    chipOf(card, 1).dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));

    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.zones.map((z: any) => z.id)).toEqual([1]);
    expect(toasts).toEqual([]);
  });

  it("stops adding at zone 32, and says why", async () => {
    const zones: Record<string, any> = {};
    for (let id = 1; id <= 32; id += 1) zones[String(id)] = { shape: "none", data: null };
    const hass = adminHass({ ...ZONE_PAYLOAD, zones });
    const card = await mountCard(hass);
    hass.callService.mockClear();

    expect($(card, "btnAddZone").disabled).toBe(true);
    expect($(card, "zonesFull").hidden).toBe(false);
    expect($(card, "zonesFull").textContent).toBe(
      "The map holds up to 32 zones. Delete one to add another."
    );
    card._handleAddZone();
    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.zoneConfig).toHaveLength(32);

    // A free id below 32 is given out again.
    delete zones["7"];
    hass.handlers[ZONES_SUBSCRIBE][0]({ ...ZONE_PAYLOAD, zones });
    expect($(card, "btnAddZone").disabled).toBe(false);
    expect($(card, "zonesFull").hidden).toBe(true);
    $(card, "btnAddZone").click();
    expect(zoneWrites(hass).map((save) => save.zone_id)).toEqual([7]);
  });

  it("adds a zone on a locked map, whose editor says how to unlock it to draw", async () => {
    const hass = adminHass();
    const card = await mountCard(hass);
    expect(card.isLocked).toBe(true);
    const toasts = notifications(card);

    $(card, "btnAddZone").click();

    expect(card.selectedZone).toBe(2);
    expect(zoneWrites(hass).slice(-1)[0]).toMatchObject({ zone_id: 2, shape: "none" });
    expect($(card, "zoneDrawText").textContent).toBe(
      "The map is locked, so drawing is off. Unlock it to draw this zone or change its shape."
    );
    // A zone with no shape yet gets it at the top, as a callout.
    expect($(card, "zoneDraw").classList.contains("callout")).toBe(true);
    expect(editorOf(card).querySelector(".zone-editor-head").nextElementSibling).toBe($(card, "zoneDraw"));
    expect($(card, "btnZoneUnlock").hidden).toBe(false);
    expect($(card, "btnZoneUnlock").textContent).toBe("Unlock");

    $(card, "btnZoneUnlock").click();

    expect(card.isLocked).toBe(false);
    expect(window.localStorage.getItem("apollo-mmwave.zone-map.lock.dev123")).toBe("0");
    expect(toasts).toEqual(["Drawing and cone rotation unlocked. You can edit zones now."]);
    expect($(card, "btnLock").title).toBe("Lock drawing and cone rotation");
    expect($(card, "btnZoneUnlock").hidden).toBe(true);
    expect($(card, "zoneDrawText").textContent).toBe(
      "Drag on the map to draw this zone as a rectangle. ✎ on the map offers an ellipse or a polygon. A tap on another zone picks it."
    );
  });

  it("says how to draw in each mode, and how to change a drawn zone's shape", async () => {
    const card = await mountCard(adminHass(), { start_locked: false });
    const draw = () => $(card, "zoneDrawText").textContent;

    expect(draw()).toBe(
      "To change its shape, drag on the map to draw this zone as a rectangle. ✎ on the map offers an ellipse or a polygon. A tap on another zone picks it."
    );
    // A drawn zone's hint sits under its settings, not at the top.
    expect($(card, "zoneDraw").classList.contains("callout")).toBe(false);
    expect($(card, "zoneDraw").nextElementSibling.classList.contains("zone-delete-row")).toBe(true);

    $(card, "btnModeEllipse").click();
    expect(draw()).toBe(
      "To change its shape, drag on the map to draw this zone as an ellipse. ✎ on the map offers a rectangle or a polygon. A tap on another zone picks it."
    );
    $(card, "btnModePolygon").click();
    expect(draw()).toBe(
      "To change its shape, tap each corner of this zone on the map, up to 32, then double-tap the last one or press ✓."
    );

    // Cleared, the zone has no shape, and the hint moves up as a callout.
    $(card, "configContent").hidden = false;
    $(card, "clearBtn").click();
    $(card, "btnClearAllYes").click();
    expect(draw()).toBe(
      "Tap each corner of this zone on the map, up to 32, then double-tap the last one or press ✓."
    );
    expect($(card, "zoneDraw").classList.contains("callout")).toBe(true);
  });

  it("says Walk is marking the zone while it does", async () => {
    const card = await mountCard(adminHass(), { start_locked: false });

    card._enterWalk();

    expect($(card, "zoneDrawText").textContent).toBe(
      "Marking this zone's corners by walking. Follow the steps under the map."
    );
    expect($(card, "btnZoneUnlock").hidden).toBe(true);
    card._exitWalk();
    expect($(card, "zoneDrawText").textContent).toContain("as a rectangle");
  });

  it("says what the selected zone's presence sensor says now", async () => {
    const PRESENCE = "binary_sensor.office_zone_1_presence";
    const payload = {
      ...ZONE_PAYLOAD,
      zones: {
        "1": { ...ZONE_PAYLOAD.zones["1"], presence_entity_id: PRESENCE },
        "2": { shape: "none", data: null, name: "Couch" },
        "3": { ...ZONE_PAYLOAD.zones["1"], name: "Fan", zone_type: "ignore" },
        "4": { ...ZONE_PAYLOAD.zones["1"], name: "Desk" },
      },
    };
    const hass = adminHass(payload);
    const card = await mountCard(hass);
    const now = () => $(card, "zonePresence").textContent;
    const states = (state: string, held = false) => {
      card.hass = { ...hass, states: { [PRESENCE]: { state, attributes: { held } } } };
    };

    states("off");
    expect(now()).toBe("NowNobody is in this zone");
    expect($(card, "zonePresence").querySelector(".zone-presence-label").textContent).toBe("Now");
    states("on");
    expect($(card, "zonePresenceText").textContent).toBe("Someone is in this zone");
    states("on", true);
    expect($(card, "zonePresenceText").textContent).toBe("On, held for someone who went still");
    states("unavailable");
    expect($(card, "zonePresenceText").textContent).toBe("Radar offline");

    openZone(card, 2);
    expect($(card, "zonePresenceText").textContent).toBe("Turns on once the zone is drawn");
    openZone(card, 3);
    expect($(card, "zonePresenceText").textContent).toBe("Never turns on, since it ignores targets");
    openZone(card, 4);
    expect($(card, "zonePresenceText").textContent).toBe("No presence sensor yet");
  });

  it("makes every control in the panel finger sized, and its fields 16 px", async () => {
    const card = await mountCard(adminHass());
    const css = card.shadowRoot.querySelector("style").textContent;

    expect(css).toContain(
      ".zone-panel button, .zone-panel input, .zone-panel select, button.config-header, .clear-all button { min-height: 44px; box-sizing: border-box; }"
    );
    expect(css).toContain(".zone-panel input, .zone-panel select { font-size: 16px; }");
    // At 320 px the rows wrap rather than run off the card.
    expect(css).toContain(".zone-settings { display: flex; flex-wrap: wrap;");
    expect(css).toContain(".zone-panel-head { display: flex; flex-wrap: wrap;");
    expect(css).toContain("button.zone-btn[data-zone-id] { max-width: 100%; overflow: hidden; text-overflow: ellipsis;");
    expect(css).toContain(".zone-editor input { width: 100%; max-width: 420px; min-width: 0; }");
    // A keyboard user sees where the focus is.
    expect(css).toContain(".container :focus-visible { outline: 2px solid var(--primary-color);");
  });

  it("drops the drawing sentence from the grid line under Map settings", async () => {
    const card = await mountCard(adminHass());

    expect($(card, "gridInfo").textContent.startsWith("Grid units: ")).toBe(true);
  });
});

/**
 * A tap on the map picks the zone under it, the way a press on its chip
 * does.
 *
 * On TEN_METER_GRID laid out 800 CSS px square, a CSS px is 12.5 mm: x is
 * -5000 + 12.5 px and y is 12.5 px. Doorway (0..1000 by 0..1000 mm) is px
 * x 400..480, y 0..80; Couch here (2000..3000 by 2000..3000) is x 560..640,
 * y 160..240. A tap draws nothing, so Ellipse no longer saves a 1 mm one,
 * and a press on a zone on a locked map picks it without the lock's toast.
 */
describe("zone map card picking a zone on the map", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const COUCH = { x_min: 2000, x_max: 3000, y_min: 2000, y_max: 3000 };
  const TWO = {
    ...ZONE_PAYLOAD,
    zones: { ...ZONE_PAYLOAD.zones, "2": { shape: "rect", data: COUCH, name: "Couch" } },
  };

  async function mapCard(config: Record<string, any> = {}, payload: any = TWO) {
    const hass = adminHass(payload);
    const card = await mountCard(hass, { ...TEN_METER_GRID, ...config });
    layOut(card, 800);
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  function mouse(card: any, type: string, x: number, y: number) {
    card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
  }

  function tap(card: any, x: number, y: number) {
    mouse(card, "mousedown", x, y);
    mouse(card, "mouseup", x, y);
  }

  function touch(card: any, type: string, x: number, y: number) {
    const point = { clientX: x, clientY: y };
    const event = Object.assign(new Event(type, { cancelable: true }), {
      touches: type === "touchend" ? [] : [point],
      changedTouches: [point],
    });
    card.canvas.dispatchEvent(event);
  }

  it("picks a zone with a press on a locked map, with no toast", async () => {
    const { card, hass, toasts } = await mapCard();
    expect(card.isLocked).toBe(true);
    expect(card.selectedZone).toBe(1);

    mouse(card, "mousedown", 600, 200);

    expect(card.selectedZone).toBe(2);
    expect(editorOf(card).dataset.editorZone).toBe("2");
    expect(toasts).toEqual([]);
    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.isDrawing).toBe(false);

    // Off every zone, it is still a try at drawing.
    mouse(card, "mousedown", 100, 600);
    expect(toasts).toEqual(["Unlock the map to draw zones."]);
    expect(card.selectedZone).toBe(2);
  });

  it.each(["rect", "ellipse"])("picks a zone with a tap in %s mode and saves nothing", async (mode) => {
    const { card, hass, toasts } = await mapCard({ start_locked: false });
    card._setDrawMode(mode);
    const zonesBefore = structuredClone(card.zones);

    // A few px of finger jitter is still a tap.
    mouse(card, "mousedown", 600, 200);
    mouse(card, "mouseup", 604, 203);
    await settleWrites();

    expect(card.selectedZone).toBe(2);
    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.zones).toEqual(zonesBefore);
    expect(toasts).toEqual([]);
    expect(card.isDrawing).toBe(false);
    expect(card._undoSnapshot).toBeNull();
  });

  it("saves nothing for a tap in Ellipse mode off every zone", async () => {
    const { card, hass } = await mapCard({ start_locked: false });
    card._setDrawMode("ellipse");

    tap(card, 100, 600);
    await settleWrites();

    expect(card.selectedZone).toBe(1);
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("still draws the selected zone with a drag", async () => {
    const { card, hass } = await mapCard({ start_locked: false });
    openZone(card, 2);

    // From inside Doorway: a drag draws, it does not pick.
    mouse(card, "mousedown", 420, 20);
    mouse(card, "mousemove", 500, 100);
    mouse(card, "mouseup", 500, 100);

    expect(card.selectedZone).toBe(2);
    expect(zoneWrites(hass).map((save) => [save.zone_id, save.shape])).toEqual([[2, "rect"]]);
  });

  it("picks a zone with a touch tap", async () => {
    const { card, hass } = await mapCard({ start_locked: false });

    touch(card, "touchstart", 600, 200);
    touch(card, "touchend", 600, 200);

    expect(card.selectedZone).toBe(2);
    expect(hass.callService).not.toHaveBeenCalled();
  });

  // A pick on the map gives the name field no blur first: a press on a
  // locked map picks on the way down, and a touch on a map that can be drawn
  // on keeps the focus where it is. The name being typed was dropped.
  it.each([
    ["a press on a locked map", {}, (card: any) => mouse(card, "mousedown", 600, 200)],
    ["a mouse tap", { start_locked: false }, (card: any) => tap(card, 600, 200)],
    [
      "a touch tap",
      { start_locked: false },
      (card: any) => {
        touch(card, "touchstart", 600, 200);
        touch(card, "touchend", 600, 200);
      },
    ],
  ])("saves the name being typed when %s picks another zone", async (_how, config, pick) => {
    const { card, hass } = await mapCard(config);
    document.body.appendChild(card);
    const input = nameFieldOf(card);
    input.focus();
    input.value = "Front door";

    pick(card);

    expect(card.selectedZone).toBe(2);
    expect(zoneWrites(hass)).toEqual([
      { device_id: "dev123", zone_id: 1, name: "Front door", input_units: "mm" },
    ]);
    expect(chipOf(card, 1).textContent).toBe("Front door");
    expect(nameFieldOf(card).value).toBe("Couch");
    document.body.replaceChildren();
  });

  it("saves no name when a pick on the map leaves the field as it was", async () => {
    const { card, hass } = await mapCard();
    document.body.appendChild(card);
    nameFieldOf(card).focus();

    mouse(card, "mousedown", 600, 200);

    expect(card.selectedZone).toBe(2);
    expect(hass.callService).not.toHaveBeenCalled();
    document.body.replaceChildren();
  });

  it("places a corner, not a pick, with a tap in Polygon mode", async () => {
    const { card } = await mapCard({ start_locked: false });
    card._setDrawMode("polygon");

    tap(card, 600, 200);

    expect(card.selectedZone).toBe(1);
    expect(card._polyPoints).toHaveLength(1);
  });

  it("picks the smallest of overlapping zones, so a zone inside another can be picked", async () => {
    const INNER = { x_min: 200, x_max: 600, y_min: 200, y_max: 600 };
    const { card } = await mapCard({}, {
      ...ZONE_PAYLOAD,
      zones: { ...ZONE_PAYLOAD.zones, "2": { shape: "rect", data: INNER, name: "Rug" } },
    });

    // (300, 400) mm, inside both.
    mouse(card, "mousedown", 424, 32);
    expect(card.selectedZone).toBe(2);
    // (800, 800) mm, inside Doorway only.
    mouse(card, "mousedown", 464, 64);
    expect(card.selectedZone).toBe(1);
  });

  it("draws the selected zone thicker while the map can be drawn on", async () => {
    const { card } = await mapCard({ start_locked: false });
    const strokes = () => {
      const { ctx, draws } = drawRecordingContext();
      card.ctx = ctx;
      card.drawZones();
      return draws.filter((d) => d.name === "strokeRect").map((d) => d.lineWidth);
    };

    expect(strokes()).toEqual([4, 2]);
    openZone(card, 2);
    expect(strokes()).toEqual([2, 4]);
    // Locked, nothing is about to be drawn over.
    card._toggleLock();
    expect(strokes()).toEqual([2, 2]);
  });
});

/**
 * Clear all shapes, under Map settings, and undoing it.
 *
 * It clears every listed zone's shape with one update_zone of shape none per
 * zone, once its question was answered, and leaves an undo snapshot; Undo
 * writes each zone back. Both toast once for the whole batch, and only when
 * every write landed; a refused write says so itself. The zones keep their
 * names, types and hold times. It used to sit in the row of zone chips, one
 * stray press from wiping every zone, and a chip's double-click cleared one
 * zone; that is gone.
 */
describe("zone map card clearing zones", () => {
  const DOORWAY = ZONE_PAYLOAD.zones["1"].data;
  const WINDOW = { x_min: 0, x_max: 500, y_min: 0, y_max: 500 };
  const TWO_ZONES = {
    ...ZONE_PAYLOAD,
    zones: { ...ZONE_PAYLOAD.zones, "2": { shape: "rect", data: WINDOW, name: "Window" } },
  };
  const $ = (card: any, id: string) => card.shadowRoot.getElementById(id);

  async function clearingCard() {
    const hass = adminHass(TWO_ZONES);
    const card = await mountCard(hass, { start_locked: false });
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  function clearAll(card: any) {
    $(card, "clearBtn").click();
    $(card, "btnClearAllYes").click();
  }

  function undo(card: any) {
    $(card, "btnUndo").click();
  }

  /** Refuse the update_zone call for `zoneId` and let every other one land. */
  function refuse(hass: any, zoneId: number) {
    hass.callService.mockImplementation(async (_domain: string, _service: string, data: any) => {
      if (data.zone_id === zoneId) throw new Error(`zone ${zoneId} is busy`);
    });
  }

  function cleared(zoneId: number) {
    return { device_id: "dev123", zone_id: zoneId, shape: "none", data: null, input_units: "mm" };
  }

  function restored(zoneId: number, data: any) {
    return { device_id: "dev123", zone_id: zoneId, shape: "rect", data, input_units: "mm" };
  }

  it("sits under Map settings, not among the zone chips", async () => {
    const { card } = await clearingCard();

    expect($(card, "configContent").contains($(card, "clearBtn"))).toBe(true);
    expect($(card, "zone-buttons").contains($(card, "clearBtn"))).toBe(false);
    expect($(card, "clearBtn").textContent).toBe("Clear all shapes");
    expect($(card, "clearAll").hidden).toBe(false);
  });

  it("asks first, and Keep them clears nothing", async () => {
    const { card, hass } = await clearingCard();
    document.body.appendChild(card);

    $(card, "clearBtn").click();

    expect($(card, "clearAllConfirm").hidden).toBe(false);
    expect($(card, "clearBtn").hidden).toBe(true);
    expect($(card, "clearAllConfirm").firstElementChild.textContent).toBe(
      "Clear every zone's shape? The zones keep their names, types and hold times, and ↶ on the map brings the shapes back."
    );
    expect(card.shadowRoot.activeElement).toBe($(card, "btnClearAllNo"));

    $(card, "btnClearAllNo").click();

    expect($(card, "clearAllConfirm").hidden).toBe(true);
    expect($(card, "clearBtn").hidden).toBe(false);
    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.zones).toHaveLength(2);

    // Escape answers it the same way.
    $(card, "clearBtn").click();
    pressKey($(card, "btnClearAllNo"), "Escape");
    expect($(card, "clearAllConfirm").hidden).toBe(true);
    document.body.replaceChildren();
  });

  it("promises no undo on a card whose YAML hides ↶", async () => {
    const card = await mountCard(adminHass(TWO_ZONES), { start_locked: false, show_undo: false });
    expect($(card, "btnUndo").style.display).toBe("none");

    $(card, "clearBtn").click();

    expect($(card, "clearAllConfirm").firstElementChild.textContent).toBe(
      "Clear every zone's shape? The zones keep their names, types and hold times. This cannot be undone."
    );
  });

  it("clears every zone with a write each and one toast, and Undo restores them", async () => {
    const { card, hass, toasts } = await clearingCard();

    clearAll(card);
    await settleWrites();

    expect(zoneWrites(hass)).toEqual([cleared(1), cleared(2)]);
    expect(card.zones).toEqual([]);
    expect(toasts).toEqual(["All shapes cleared"]);
    expect(card._undoSnapshot).toEqual([
      { zoneId: 1, shape: "rect", data: DOORWAY },
      { zoneId: 2, shape: "rect", data: WINDOW },
    ]);
    // The zones stay, and with nothing left to clear the button goes.
    expect(card.zoneConfig.map((z: any) => z.id)).toEqual([1, 2]);
    expect($(card, "clearAll").hidden).toBe(true);

    hass.callService.mockClear();
    undo(card);
    await settleWrites();

    expect(zoneWrites(hass)).toEqual([restored(1, DOORWAY), restored(2, WINDOW)]);
    expect(card.zones).toEqual([
      { id: 1, shape: "rect", data: DOORWAY },
      { id: 2, shape: "rect", data: WINDOW },
    ]);
    expect(toasts).toEqual(["All shapes cleared", "Undid last zone change"]);
    expect($(card, "clearAll").hidden).toBe(false);
  });

  it("does not say all shapes were cleared when one of them was refused", async () => {
    const { card, hass, toasts } = await clearingCard();
    refuse(hass, 2);

    clearAll(card);
    await settleWrites();

    expect(zoneWrites(hass)).toEqual([cleared(1), cleared(2)]);
    expect(toasts).toEqual(["Could not save: zone 2 is busy"]);
  });

  it("does not say the undo happened when one of its writes was refused", async () => {
    const { card, hass, toasts } = await clearingCard();
    clearAll(card);
    await settleWrites();
    hass.callService.mockClear();
    refuse(hass, 1);

    undo(card);
    await settleWrites();

    expect(zoneWrites(hass)).toEqual([restored(1, DOORWAY), restored(2, WINDOW)]);
    expect(toasts).toEqual(["All shapes cleared", "Could not save: zone 1 is busy"]);
  });

  it("is an administrator's only", async () => {
    const card = await mountCard(fakeHass(TWO_ZONES), { start_locked: false });

    expect($(card, "clearAll").hidden).toBe(true);
  });
});

/**
 * Clear all shapes on a locked map.
 *
 * The lock used to guard drawing only, so a press on Clear All Zones still
 * wiped zones on a map the user had locked against exactly that. It now
 * refuses with a toast and rings the Locked button, without asking. It
 * stays enabled: a disabled button takes no tap, and a phone user would see
 * a dim button that does nothing and never learn why.
 */
describe("zone map card clearing zones on a locked map", () => {
  async function lockedCard() {
    const hass = adminHass();
    const card = await mountCard(hass);
    expect(card.isLocked).toBe(true);
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  it("Clear all shapes on a locked map toasts and clears nothing", async () => {
    const { card, hass, toasts } = await lockedCard();
    const zonesBefore = structuredClone(card.zones);
    const $ = (id: string) => card.shadowRoot.getElementById(id);
    expect($("clearBtn").disabled).toBe(false);
    expect($("clearBtn").classList.contains("locked-action")).toBe(true);
    expect($("clearBtn").getAttribute("aria-disabled")).toBe("true");

    $("clearBtn").click();

    expect($("clearAllConfirm").hidden).toBe(true);
    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.zones).toEqual(zonesBefore);
    expect(card._undoSnapshot).toBeNull();
    expect(toasts).toEqual(["Unlock the map to clear zones."]);
    expect($("btnLock").classList.contains("nudge")).toBe(true);

    // Unlocked, it looks as it always did, and asks first.
    $("btnLock").click();
    expect($("clearBtn").classList.contains("locked-action")).toBe(false);
    expect($("clearBtn").hasAttribute("aria-disabled")).toBe(false);
    $("clearBtn").click();
    $("btnClearAllYes").click();
    expect(card.zones).toEqual([]);
    expect(hass.callService.mock.calls.map((call: any[]) => call[2].shape)).toEqual(["none"]);
  });

  it("locking the map answers an open question with no", async () => {
    const { card, hass } = await lockedCard();
    const $ = (id: string) => card.shadowRoot.getElementById(id);
    $("btnLock").click();
    $("clearBtn").click();
    expect($("clearAllConfirm").hidden).toBe(false);

    $("btnLock").click();

    expect($("clearAllConfirm").hidden).toBe(true);
    hass.callService.mockClear();
    $("btnClearAllYes").click();
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("dims Clear all shapes again when a payload lands on a locked map", async () => {
    const { card, hass } = await lockedCard();

    hass.handlers[ZONES_SUBSCRIBE][0]({ ...ZONE_PAYLOAD, label: "Renamed radar" });

    const clearBtn = card.shadowRoot.getElementById("clearBtn");
    expect(clearBtn.classList.contains("locked-action")).toBe(true);
    expect(clearBtn.getAttribute("aria-disabled")).toBe("true");
  });
});

/**
 * The map's unit and extents.
 *
 * Every card drew a fixed 10 m square in millimeters, with labels in meters
 * whatever Home Assistant was set to, and the radar's 6 m, 120 degree field
 * of view sat in its top half and ran off both sides. Now a card with no grid
 * in its YAML fits the map to the field of view as currently rotated, and the
 * map is in feet or meters: what the viewer picked on the card's m / ft
 * switch, else what an administrator saved for the radar, else a hand-written
 * card's grid_units, else Home Assistant's unit system. Geometry stays mm.
 */
describe("zone map card units and fitted grid", () => {
  const FT = 304.8;
  const EMPTY = { ...ZONE_PAYLOAD, zones: {}, rotation_deg: 0 };

  /** A hass whose unit system has `length` ("mi" is US customary), and whose
   *  user is or is not an administrator. */
  function unitHass(length?: string, isAdmin = true, payload: any = EMPTY) {
    const hass = fakeHass(payload);
    if (length) hass.config = { unit_system: { length } };
    hass.user = { is_admin: isAdmin };
    return hass;
  }

  function extents(card: any): number[] {
    return [card.xMin, card.xMax, card.yMin, card.yMax];
  }

  /** The extents in feet, rounded clear of float error. */
  function extentsFt(card: any): number[] {
    return extents(card).map((mm) => Number((mm / FT).toFixed(6)));
  }

  function unitSaves(hass: any): any[] {
    return hass.callService.mock.calls
      .filter((call: any[]) => call[1] === "update_zone" && "display_units" in call[2])
      .map((call: any[]) => call[2]);
  }

  function pressed(card: any): string[] {
    return ["btnUnitM", "btnUnitFt"]
      .map((id) => card.shadowRoot.getElementById(id))
      .filter((button: any) => button.getAttribute("aria-pressed") === "true")
      .map((button: any) => button.dataset.unit);
  }

  function info(card: any): string {
    return card.shadowRoot.getElementById("gridInfo").textContent;
  }

  /** Push one payload to every open subscription, as the store does. */
  function push(hass: any, payload: any) {
    hass.handlers[ZONES_SUBSCRIBE].forEach((cb: Handler) => cb(payload));
  }

  /** Drag the mouse across a canvas laid out at its backing store's size. */
  function dragOnCanvas(card: any, from: [number, number], to: [number, number]) {
    const { width, height } = card.canvas;
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect);
    const mouse = (type: string, [x, y]: [number, number]) =>
      card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
    mouse("mousedown", from);
    mouse("mousemove", to);
    mouse("mouseup", to);
  }

  describe("automatic unit", () => {
    it("shows feet when Home Assistant is set to US customary units", async () => {
      const card = await mountCard(unitHass("mi"));

      expect(card._displayUnit()).toBe("ft");
      expect(pressed(card)).toEqual(["ft"]);
    });

    it.each([["km"], [undefined]])("shows meters for unit system %s", async (length) => {
      const card = await mountCard(unitHass(length));

      expect(card._displayUnit()).toBe("m");
      expect(pressed(card)).toEqual(["m"]);
    });

    it("follows a change of Home Assistant's unit system on a live card", async () => {
      const hass = unitHass("km");
      const card = await mountCard(hass);
      expect(card._displayUnit()).toBe("m");

      card.hass = { ...hass, config: { unit_system: { length: "mi" } } };

      expect(card._displayUnit()).toBe("ft");
      expect(extentsFt(card)).toEqual([-18, 18, 0, 28]);
      expect(pressed(card)).toEqual(["ft"]);
    });
  });

  describe("precedence", () => {
    it("lets a hand-written card's grid_units win over Home Assistant", async () => {
      const card = await mountCard(unitHass("mi"), { grid_units: "cm" });

      expect(card._displayUnit()).toBe("cm");
      // The switch shows the half the YAML unit belongs to.
      expect(pressed(card)).toEqual(["m"]);
    });

    it("ignores a grid_units it does not know, as if it were absent", async () => {
      const card = await mountCard(unitHass("mi"), { grid_units: "furlong" });

      expect(card._displayUnit()).toBe("ft");
    });

    it("lets the unit saved for the radar win over grid_units and Home Assistant", async () => {
      const hass = unitHass("mi", true, { ...EMPTY, display_units: "m" });
      const card = await mountCard(hass, { grid_units: "in" });

      expect(card._displayUnit()).toBe("m");
      expect(pressed(card)).toEqual(["m"]);
    });

    it("follows a unit another page saves, until this page's viewer picks one", async () => {
      const hass = unitHass("km", false);
      const card = await mountCard(hass);

      push(hass, { ...EMPTY, display_units: "ft" });
      expect(card._displayUnit()).toBe("ft");

      card.shadowRoot.getElementById("btnUnitM").click();
      push(hass, { ...EMPTY, display_units: "ft" });

      expect(card._displayUnit()).toBe("m");
    });

    it("drops a null or unknown saved unit back to the automatic one", async () => {
      const hass = unitHass("mi", true, { ...EMPTY, display_units: "furlong" });
      const card = await mountCard(hass);
      expect(card._displayUnit()).toBe("ft");

      push(hass, { ...EMPTY, display_units: "m" });
      expect(card._displayUnit()).toBe("m");
      push(hass, { ...EMPTY, display_units: null });
      expect(card._displayUnit()).toBe("ft");
    });

    it("forgets the saved unit and the viewer's pick when pointed at another radar", async () => {
      const hass = unitHass("km", false, { ...EMPTY, display_units: "m" });
      const card = await mountCard(hass);
      card.shadowRoot.getElementById("btnUnitFt").click();
      expect(card._viewDisplayUnits).toBe("ft");
      expect(card._storedDisplayUnits).toBe("m");

      hass.payload = EMPTY;
      card.setConfig({ device_id: "devB" });

      expect(card._viewDisplayUnits).toBeNull();
      expect(card._storedDisplayUnits).toBeNull();
      await vi.waitFor(() => expect(card._zoneConfigPayload).toBe(EMPTY));
      expect(card._displayUnit()).toBe("m");
    });
  });

  describe("the m / ft switch", () => {
    it("saves the unit for the radar when an administrator flips it", async () => {
      const hass = unitHass("km", true);
      const card = await mountCard(hass);
      const toasts = notifications(card);

      card.shadowRoot.getElementById("btnUnitFt").click();

      // Only the unit: input_units would also rescale presence for target
      // sensors without a length unit, and the switch says nothing of that.
      expect(unitSaves(hass)).toEqual([{ device_id: "dev123", display_units: "ft" }]);
      // Like every other save: the card shows its own toast on a rejection.
      expect(hass.callService.mock.calls.at(-1).slice(3)).toEqual([undefined, false]);
      expect(card._displayUnit()).toBe("ft");
      expect(pressed(card)).toEqual(["ft"]);
      expect(extentsFt(card)).toEqual([-18, 18, 0, 28]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(toasts).toEqual([]);
    });

    it("only changes the view for a user who is not an administrator", async () => {
      const hass = unitHass("km", false);
      const card = await mountCard(hass);
      const toasts = notifications(card);

      card.shadowRoot.getElementById("btnUnitFt").click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(hass.callService).not.toHaveBeenCalled();
      expect(toasts).toEqual([]);
      expect(card._displayUnit()).toBe("ft");
      expect(pressed(card)).toEqual(["ft"]);
    });

    it("saves nothing for a hass that names no user", async () => {
      const hass = unitHass("km");
      delete hass.user;
      const card = await mountCard(hass);

      card.shadowRoot.getElementById("btnUnitFt").click();

      expect(hass.callService).not.toHaveBeenCalled();
      expect(card._displayUnit()).toBe("ft");
    });

    it("does nothing for the unit already shown", async () => {
      const hass = unitHass("mi", true);
      const card = await mountCard(hass);

      card.shadowRoot.getElementById("btnUnitFt").click();

      expect(hass.callService).not.toHaveBeenCalled();
      expect(card._viewDisplayUnits).toBeNull();
    });

    it("says in its tooltips that an administrator's press is for everyone", async () => {
      const titles = (card: any) =>
        ["btnUnitM", "btnUnitFt"].map((id) => card.shadowRoot.getElementById(id).title);
      const admin = await mountCard(unitHass("km", true));
      const viewer = await mountCard(unitHass("km", false));

      expect(titles(admin)).toEqual([
        "Show this radar's map in meters for everyone",
        "Show this radar's map in feet for everyone",
      ]);
      expect(titles(viewer)).toEqual(["Show the map in meters", "Show the map in feet"]);

      // A hass for another user, on the same card, retitles it.
      const hass = unitHass("km", false);
      viewer.hass = { ...hass, user: { is_admin: true } };
      expect(titles(viewer)[1]).toBe("Show this radar's map in feet for everyone");
    });

    it("says the save failed when Home Assistant refuses it", async () => {
      const hass = unitHass("km", true);
      hass.callService.mockRejectedValue(new Error("Unauthorized"));
      const card = await mountCard(hass);
      const toasts = notifications(card);

      card.shadowRoot.getElementById("btnUnitFt").click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(toasts).toEqual(["Could not save: Unauthorized"]);
      // The map still shows what the viewer picked.
      expect(card._displayUnit()).toBe("ft");
    });

    it("leaves a polygon in progress alone and keeps its map until it is done", async () => {
      const hass = unitHass("km", true);
      const card = await mountCard(hass, { start_locked: false });
      card._setDrawMode("polygon");
      card.isDrawing = true;
      card._polyPoints = [{ x: 100, y: 200 }];
      const before = extents(card);

      card.shadowRoot.getElementById("btnUnitFt").click();

      expect(card._polyPoints).toEqual([{ x: 100, y: 200 }]);
      expect(extents(card)).toEqual(before);
      expect(card._displayUnit()).toBe("ft");
    });
  });

  describe("grid and labels in the map's unit", () => {
    it("steps a feet grid every 2 ft, ends it on whole steps and labels it in ft", async () => {
      const card = await mountCard(unitHass("mi"), { unit_display: true });

      const { labels, xLines, yLines, metrics } = card._getGridRenderState();

      expect(metrics.stepX).toBeCloseTo(2 * FT, 9);
      // + 0 turns the -0 of the origin's line into 0.
      expect(xLines.map((line: any) => Number((line.value / FT).toFixed(6)) + 0)).toEqual(
        Array.from({ length: 19 }, (_, i) => -18 + 2 * i)
      );
      expect(yLines.map((line: any) => Number((line.value / FT).toFixed(6)) + 0)).toEqual(
        Array.from({ length: 15 }, (_, i) => 2 * i)
      );
      // The test canvas cannot measure text, and its estimate of "-16 ft" is
      // wider than the 44 px between lines, so X labels every other line.
      expect(labels.x.map((label: any) => label.text)).toEqual(
        [-16, -12, -8, -4, 4, 8, 12, 16].map((ft) => `${ft} ft`)
      );
      expect(labels.y.map((label: any) => label.text)).toEqual(
        Array.from({ length: 13 }, (_, i) => `${2 * (i + 1)} ft`)
      );
    });

    it("labels the cone's rings in feet", async () => {
      const card = await mountCard(unitHass("mi"), { unit_display: true });

      card.drawGrid();

      expect(card._coneRingsCache.labels.map((label: any) => label.text)).toEqual([
        "4 ft",
        "8 ft",
        "12 ft",
        "16 ft",
      ]);
    });

    it("keeps meters as they were: 1 m steps, labels like 2m", async () => {
      const card = await mountCard(unitHass("km"), { unit_display: true });

      const { labels, metrics } = card._getGridRenderState();

      expect(metrics.stepX).toBe(1000);
      expect(labels.x.map((label: any) => label.text)).toEqual(
        [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5].map((m) => `${m}m`)
      );
    });

    it("says the range and width in the map's unit first, on the map and under it", async () => {
      const feet = await mountCard(unitHass("mi"), { unit_display: true });
      const meters = await mountCard(unitHass("km"), { unit_display: true });

      expect(feet._rangeLabel().text).toBe("Radar range 20 ft (6 m), 120°");
      expect(meters._rangeLabel().text).toBe("Radar range 6 m (20 ft), 120°");
      expect(info(feet)).toContain("Grid units: ft (X: -18..18, Y: 0..28)");
      expect(info(feet)).toContain("Radar range: 20 ft (6 m), 120°");
      expect(info(meters)).toContain("Grid units: m (X: -6..6, Y: 0..9)");
      expect(info(meters)).toContain("Radar range: 6 m (20 ft), 120°");
    });

    it("captions the arc just past it on the line the radar faces", async () => {
      const card = await mountCard(unitHass("km"), { unit_display: true });

      const label = card._rangeLabel();

      expect(label.x).toBeCloseTo(card.valueToPixels(0, "x"), 9);
      expect(label.y).toBeGreaterThan(card.valueToPixels(6000, "y") + card.unitLabelSize / 2);
      expect(label.y + card.unitLabelSize / 2).toBeLessThanOrEqual(card.canvas.height);
    });

    it("captions the arc just inside it when there is no room past it", async () => {
      // Turned 45 degrees, the 18 px caption does not fit between the arc and
      // the corner of the map, so it goes on the radar's side of the arc.
      const card = await mountCard(unitHass("km", true, { ...EMPTY, rotation_deg: 45 }), {
        unit_display: true,
        unit_label_size: 18,
      });

      const label = card._rangeLabel();

      const apexX = card.valueToPixels(0, "x");
      const apexY = card.valueToPixels(0, "y");
      const arc = 6000 * card.pxPerX;
      expect(label).not.toBeNull();
      expect(Math.hypot(label.x - apexX, label.y - apexY)).toBeLessThan(arc);
      // Still on the line the radar faces.
      expect(label.x - apexX).toBeCloseTo(label.y - apexY, 6);
    });

    it("captions the arc clear of the zoom row on a phone", async () => {
      // A 390 px phone shows the map 310 px wide, with the zoom row 4 px in
      // from its right edge and 40 px up, 104 by 32 px, over whatever is
      // drawn under it. Just past the arc, the caption lay under the row
      // turned 45 degrees, as in a corner, and under its left end facing
      // ahead in meters. It goes just inside the arc instead, still on the
      // line the radar faces.
      const rect = (left: number, top: number, right: number, bottom: number) =>
        ({
          left,
          top,
          right,
          bottom,
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
          toJSON: () => ({}),
        }) as DOMRect;
      for (const [length, rotation] of [
        ["mi", 45],
        ["km", 0],
      ] as const) {
        const hass = unitHass(length, true, { ...EMPTY, rotation_deg: rotation });
        const card = await mountCard(hass, { unit_display: true });
        const cssWidth = 310;
        const cssHeight = (cssWidth * card.canvas.height) / card.canvas.width;
        const scale = card.canvas.width / cssWidth;
        vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue(
          rect(0, 0, cssWidth, cssHeight)
        );
        const row = rect(cssWidth - 108, cssHeight - 72, cssWidth - 4, cssHeight - 40);
        const zoomControls = card.shadowRoot.getElementById("zoomControls");
        vi.spyOn(zoomControls, "getBoundingClientRect").mockReturnValue(row);
        const { ctx, texts } = textRecordingContext(browserTextWidth);
        card.ctx = ctx;
        card._invalidateGridCache();
        card.drawGrid();

        const range = texts.filter((label) => label.text.startsWith("Radar range"));
        expect(range).toHaveLength(1);
        const box = boxOf(range[0]);
        const rowBox = {
          left: row.left * scale,
          right: row.right * scale,
          top: row.top * scale,
          bottom: row.bottom * scale,
        };
        expect(card._boxGap(box, rowBox)).toBeGreaterThanOrEqual(4 * scale);
        const apexX = card.valueToPixels(0, "x");
        const apexY = card.valueToPixels(0, "y");
        const { x, y } = range[0];
        expect(Math.hypot(x - apexX, y - apexY)).toBeLessThan(card.coneYMax * card.pxPerX);
        const facing = (rotation * Math.PI) / 180;
        expect((x - apexX) * Math.cos(facing)).toBeCloseTo((y - apexY) * Math.sin(facing), 6);
      }
    });

    it("draws the range label only with distance labels on", async () => {
      const card = await mountCard(unitHass("km"), { unit_display: false });

      expect(card._rangeLabel()).toBeNull();
    });

    it("keeps an axis label off the range label and the range label on the canvas", async () => {
      const hass = unitHass("km", true, EMPTY);
      const card = await mountCard(hass, { unit_display: true });
      const { ctx, texts } = textRecordingContext(browserTextWidth);
      card.ctx = ctx;
      card._invalidateGridCache();
      card.drawGrid();

      const labels = texts.filter((label) => label.size === card.unitLabelSize);
      const range = labels.filter((label) => label.text.startsWith("Radar range"));
      expect(range).toHaveLength(1);
      const box = boxOf(range[0]);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(card.canvas.width);
      expect(box.bottom).toBeLessThanOrEqual(card.canvas.height);
      const crowding = labels
        .filter((label) => label !== range[0] && spaceBetween(label, range[0]) < 4)
        .map((label) => label.text);
      expect(crowding).toEqual([]);
      // The 6 m axis label sits on the arc, and the caption clears it.
      expect(labels.map((label) => label.text)).toContain("6m");
    });
  });

  describe("fitting the grid to the field of view", () => {
    it("fits the cone facing ahead, with the radar on the top edge", async () => {
      const card = await mountCard(unitHass("km"));

      expect(extents(card)).toEqual([-6000, 6000, 0, 9000]);
      // A fitted grid gets a canvas its own shape, so a meter is as long
      // across as down and the cone is not stretched.
      expect([card.canvas.width, card.canvas.height]).toEqual([800, 600]);
      expect(card.pxPerX).toBeCloseTo(card.pxPerY, 9);
      expect(card.shadowRoot.querySelector(".canvas-container").style.aspectRatio).toBe(
        "800 / 600"
      );
    });

    it("fits the cone turned 90 degrees, with the radar on the left edge", async () => {
      const card = await mountCard(unitHass("km", true, { ...EMPTY, rotation_deg: 90 }));

      // 7 m deep and 12 m tall, widened on the side the radar faces to keep
      // the canvas from being taller than it is wide.
      expect(extents(card)).toEqual([0, 12000, -6000, 6000]);
      expect([card.canvas.width, card.canvas.height]).toEqual([800, 800]);
    });

    it("fits the cone in whole feet steps on a US customary system", async () => {
      const card = await mountCard(unitHass("mi"));

      expect(extentsFt(card)).toEqual([-18, 18, 0, 28]);
      expect([card.canvas.width, card.canvas.height]).toEqual([800, 622]);
    });

    it("grows to take in a stored zone outside the cone", async () => {
      const zones = {
        "1": { shape: "rect", data: { x_min: 6000, x_max: 8000, y_min: 1000, y_max: 2000 } },
        "2": {
          shape: "polygon",
          data: { points: [{ x: 0, y: -500 }, { x: 500, y: 0 }, { x: -500, y: 0 }] },
        },
      };
      const card = await mountCard(unitHass("km", true, { ...EMPTY, zones }));

      expect(extents(card)).toEqual([-6000, 8000, -1000, 10000]);
    });

    it("grows to take in an ellipse by its radii", async () => {
      // Beside the cone, where neither the cone nor the aspect padding reaches
      // past x = 6000, so only the radius takes the map out to 8000.
      const zones = { "1": { shape: "ellipse", data: { cx: 6000, cy: 3000, rx: 2000, ry: 1000 } } };
      const card = await mountCard(unitHass("km", true, { ...EMPTY, zones }));

      expect(card.xMax).toBeGreaterThanOrEqual(8000);
    });

    it("reaches the arc where it crosses straight ahead, not only its ends", async () => {
      // A 60 degree cone's ends are 5.2 m ahead, but its arc reaches 6 m (6.3
      // with the margin) straight ahead, which is what the map is fitted to.
      const card = await mountCard(unitHass("km"), { cone: { fov_deg: 60 } });

      expect(extents(card)).toEqual([-3500, 3500, 0, 6500]);
    });

    it("grows a sideways radar's map evenly above and below it", async () => {
      // A zone far to the right makes the map wide, so it grows in height.
      // Facing neither up nor down, the radar stays near the middle.
      const zones = {
        "1": { shape: "rect", data: { x_min: 14000, x_max: 21000, y_min: -1000, y_max: 1000 } },
      };
      const card = await mountCard(unitHass("km", true, { ...EMPTY, rotation_deg: 90, zones }));

      expect(extents(card)).toEqual([0, 22000, -8000, 10000]);
    });

    it("leaves room past the arc when the radar is turned 45 degrees", async () => {
      // The arc reaches 6000 mm along both axes. The margin past it takes the
      // fit to the next 500 mm step instead of leaving the arc on the edge.
      const card = await mountCard(unitHass("km", true, { ...EMPTY, rotation_deg: 45 }));

      expect(extents(card)).toEqual([-2000, 6500, -2000, 6500]);
    });

    it("fits again when a payload turns the radar", async () => {
      const hass = unitHass("km");
      const card = await mountCard(hass);

      push(hass, { ...EMPTY, rotation_deg: 90 });

      expect(extents(card)).toEqual([0, 12000, -6000, 6000]);
      expect(info(card)).toContain("Grid units: m (X: 0..12, Y: -6..6)");
    });

    it("fits again when the rotation slider is let go, not while it is dragged", async () => {
      const hass = unitHass("km");
      const card = await mountCard(hass);
      const slider = card.shadowRoot.getElementById("coneAngleSlider");

      slider.value = "90";
      slider.dispatchEvent(new Event("input"));
      expect(extents(card)).toEqual([-6000, 6000, 0, 9000]);

      slider.dispatchEvent(new Event("change"));
      expect(extents(card)).toEqual([0, 12000, -6000, 6000]);
      expect(hass.callService.mock.calls.at(-1)[2]).toMatchObject({ rotation_deg: 90 });
    });

    it("does not move the map under a drag in progress", async () => {
      const hass = unitHass("km");
      const card = await mountCard(hass, { start_locked: false });
      card.isDrawing = true;

      push(hass, { ...EMPTY, rotation_deg: 90 });
      expect(extents(card)).toEqual([-6000, 6000, 0, 9000]);

      card.isDrawing = false;
      push(hass, { ...EMPTY, rotation_deg: 90 });
      expect(extents(card)).toEqual([0, 12000, -6000, 6000]);
    });

    it.each([
      [90, "rect"],
      [45, "rect"],
      [45, "ellipse"],
      [30, "rect"],
    ])(
      "keeps a feet map its size when a %s degree %s drawn past its corner comes back",
      async (rotation, shape) => {
        const payload = { ...EMPTY, rotation_deg: rotation, zones: { "1": {} } };
        const hass = unitHass("mi", true, payload);
        const card = await mountCard(hass, { start_locked: false });
        card._setDrawMode(shape);
        const before = extentsFt(card);
        const size = [card.canvas.width, card.canvas.height];

        dragOnCanvas(card, [400, 300], [size[0] + 100, size[1] + 100]);
        const save = hass.callService.mock.calls.find((call: any[]) => call[2].shape === shape);
        push(hass, { ...payload, zones: { "1": { shape, data: save[2].data } } });

        // The save is whole mm, up to 1 mm past a feet edge (22 ft is
        // 6705.6 mm), and must not round the map out a whole step.
        expect(extentsFt(card)).toEqual(before);
        expect([card.canvas.width, card.canvas.height]).toEqual(size);
        if (rotation === 90) expect(before).toEqual([0, 36, -18, 18]);
      }
    );

    it.each([
      ["Escape", () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))],
      ["cancelDrawing", (card: any) => card.cancelDrawing()],
      ["Finish with too few points", (card: any) => card.finishPolygon()],
      ["a mode change", (card: any) => card._setDrawMode("rect")],
    ])("fits a payload that came in mid-polygon once it ends by %s", async (_how, end) => {
      const hass = unitHass("km", true, { ...EMPTY, zones: { "1": {} } });
      const card = await mountCard(hass, { start_locked: false });
      card._setDrawMode("polygon");
      card.isDrawing = true;
      card._polyPoints = [{ x: 100, y: 200 }];

      push(hass, { ...EMPTY, zones: { "1": {} }, rotation_deg: 90 });
      expect(extents(card)).toEqual([-6000, 6000, 0, 9000]);

      end(card);

      expect(card.isDrawing).toBe(false);
      expect(extents(card)).toEqual([0, 12000, -6000, 6000]);
      expect(info(card)).toContain("Grid units: m (X: 0..12, Y: -6..6)");
    });

    it("fits a unit picked mid-polygon once the polygon is dropped", async () => {
      const hass = unitHass("km", false, { ...EMPTY, zones: { "1": {} } });
      const card = await mountCard(hass, { start_locked: false });
      card._setDrawMode("polygon");
      card.isDrawing = true;
      card._polyPoints = [{ x: 100, y: 200 }];

      card.shadowRoot.getElementById("btnUnitFt").click();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

      expect(extentsFt(card)).toEqual([-18, 18, 0, 28]);
      expect(info(card)).toContain("Grid units: ft (X: -18..18, Y: 0..28)");
    });

    it.each([
      // 2 ft lines come out at exactly 40 px on a 40 ft map, so float error
      // decided each axis's step apart.
      ["a 40 ft map", 0, { "1": { shape: "rect", data: { x_min: 0, x_max: 1000, y_min: 500, y_max: 11750 } } }],
      ["a 40 ft map turned 90 degrees", 90, { "1": { shape: "rect", data: { x_min: -5000, x_max: 0, y_min: 500, y_max: 5500 } } }],
      // Rounding out to 2 ft and to 5 ft took turns, and the fit stopped on
      // 2 ft edges that 5 ft lines missed.
      [
        "a fit whose step took turns",
        110,
        {
          "1": {
            shape: "polygon",
            data: { points: [{ x: 5945, y: -86 }, { x: -3716, y: 827 }, { x: 2076, y: 4349 }] },
          },
          "2": { shape: "ellipse", data: { cx: 2316, cy: -4965, rx: 2605, ry: 2475.5 } },
        },
      ],
    ])("draws X and Y lines at one step, with every edge on a line, on %s", async (_kind, rotation, zones) => {
      const card = await mountCard(unitHass("mi", true, { ...EMPTY, rotation_deg: rotation, zones }));

      const { metrics, xLines, yLines } = card._getGridRenderState();

      expect(metrics.stepY).toBe(metrics.stepX);
      for (const edge of extents(card)) {
        const steps = edge / metrics.stepX;
        expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
      }
      expect(xLines[0].value).toBeCloseTo(card.xMin, 6);
      expect(xLines.at(-1).value).toBeCloseTo(card.xMax, 6);
      expect(yLines[0].value).toBeCloseTo(card.yMin, 6);
      expect(yLines.at(-1).value).toBeCloseTo(card.yMax, 6);
    });

    it("lets a YAML grid win, on the square canvas it always had", async () => {
      const hass = unitHass("mi", true, { ...EMPTY, rotation_deg: 90 });
      const card = await mountCard(hass, {
        grid: { x_min: -2000, x_max: 2000, y_min: 0, y_max: 4000 },
      });

      expect(extents(card)).toEqual([-2000, 2000, 0, 4000]);
      expect([card.canvas.width, card.canvas.height]).toEqual([800, 800]);

      push(hass, { ...EMPTY, rotation_deg: 0, display_units: "m" });
      expect(extents(card)).toEqual([-2000, 2000, 0, 4000]);
    });

    it("fits a grid block that names no usable extent", async () => {
      const card = await mountCard(unitHass("km"), { grid: { x_min: "wide" } });

      expect(extents(card)).toEqual([-6000, 6000, 0, 9000]);
    });

    it("fits again once a YAML grid is removed from a live card", async () => {
      const card = await mountCard(unitHass("km"), TEN_METER_GRID);
      expect(extents(card)).toEqual([-5000, 5000, 0, 10000]);

      card.setConfig({ device_id: "dev123" });

      expect(extents(card)).toEqual([-6000, 6000, 0, 9000]);
      expect(card.canvas.height).toBe(600);
    });

    it("draws a new zone only inside the fitted map", async () => {
      // Zone 1 has no geometry yet, so it is selected and adds nothing to the fit.
      const hass = unitHass("km", true, { ...EMPTY, zones: { "1": {} } });
      const card = await mountCard(hass, { start_locked: false });
      expect(card.selectedZone).toBe(1);
      vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        toJSON: () => ({}),
      } as DOMRect);
      const mouse = (type: string, x: number, y: number) =>
        card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));

      // From the top left corner to past the bottom right one.
      mouse("mousedown", 0, 0);
      mouse("mousemove", 900, 700);
      mouse("mouseup", 900, 700);

      const save = hass.callService.mock.calls.find((call: any[]) => call[2].shape === "rect");
      expect(save[2].data).toEqual({ x_min: -6000, x_max: 6000, y_min: 0, y_max: 9000 });
    });
  });

  it("ships a stub that fits the map and follows Home Assistant's units", () => {
    const stub = ZoneMapCard.getStubConfig(fakeHass()) as any;

    expect(stub).not.toHaveProperty("grid");
    expect(stub).not.toHaveProperty("grid_units");
    expect(stub.unit_display).toBe(true);
  });
});

/**
 * Zoom and pan.
 *
 * A zoomed map shows part of the map's extents (the view's window) across
 * the whole canvas, and every layer goes through that window: zones, the
 * cone and its rings, the grid and its labels, Coverage cells, trails,
 * dots, Walk and the replay, and the pointer math that saves a drawn shape.
 * Handles, lines and text are drawn in canvas px, so they keep their size.
 * The + and - buttons, Fit, Ctrl or Cmd and the wheel, a two-finger pinch
 * and Shift-drag or the middle button zoom and pan; a plain wheel and a
 * one-finger swipe on a map that pans are still the page's. The 10 m grid
 * at 2x on (0, 5000) shows x -2500..2500 and y 2500..7500 at 0.16 px per mm,
 * laid out here at 800 by 800 CSS px over the 800 by 800 bitmap.
 */
describe("zone map card zoom and pan", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The canvas laid out at its bitmap's size, so a CSS px is a bitmap px. */
  function layOut(card: any) {
    const { width, height } = card.canvas;
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect);
  }

  /** Unlocked on the 10 m grid with zone 1 (Doorway) selected in `mode`. */
  async function zoomCard({
    config = {},
    payload = {},
    mode = "rect",
  }: { config?: Record<string, any>; payload?: Record<string, any>; mode?: string } = {}) {
    const hass = fakeHass({ ...ZONE_PAYLOAD, rotation_deg: 0, ...payload });
    hass.user = { is_admin: true };
    const card = await mountCard(hass, { ...TEN_METER_GRID, start_locked: false, ...config });
    card._setSelectedZone(1);
    card._setDrawMode(mode);
    layOut(card);
    hass.callService.mockClear();
    return { card, hass };
  }

  const $ = (card: any, id: string) => card.shadowRoot.getElementById(id);

  function zoneSaves(hass: any): any[] {
    return hass.callService.mock.calls
      .filter((call: any[]) => call[1] === "update_zone" && "shape" in call[2])
      .map((call: any[]) => call[2]);
  }

  function mouse(card: any, type: string, x: number, y: number, init: MouseEventInit = {}) {
    const event = new MouseEvent(type, { clientX: x, clientY: y, cancelable: true, ...init });
    card.canvas.dispatchEvent(event);
    return event;
  }

  /** A mouse event on the window, where a pan follows the pointer. */
  function windowMouse(type: string, x: number, y: number) {
    window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
  }

  /** A wheel event at (200, 600) px over the canvas. happy-dom's
   *  WheelEvent carries no pointer position or modifier keys, so they are
   *  laid on as a browser's WheelEvent, a MouseEvent, has them. */
  function wheel(
    card: any,
    {
      ctrlKey = false,
      metaKey = false,
      clientX = 200,
      clientY = 600,
      deltaY = -100,
      deltaMode = 0,
    }: Record<string, any>
  ) {
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY, deltaMode });
    Object.defineProperties(event, {
      ctrlKey: { value: ctrlKey },
      metaKey: { value: metaKey },
      clientX: { value: clientX },
      clientY: { value: clientY },
    });
    card.canvas.dispatchEvent(event);
    return event;
  }

  function finger(card: any, id: number, x: number, y: number): Touch {
    return new Touch({ identifier: id, target: card.canvas, clientX: x, clientY: y });
  }

  /** A TouchEvent as a browser fills it: `down` is every finger still on
   *  the screen, `changed` the fingers it is about. */
  function fire(card: any, type: string, down: Touch[], changed: Touch[], cancelable = true) {
    const event = new TouchEvent(type, {
      cancelable,
      touches: down,
      targetTouches: down,
      changedTouches: changed,
    });
    card.canvas.dispatchEvent(event);
    return event;
  }

  /** Two fingers land at `a` and `b`, the first a moment before. */
  function pinchStart(card: any, a: [number, number], b: [number, number]) {
    const one = finger(card, 1, ...a);
    fire(card, "touchstart", [one], [one]);
    const two = finger(card, 2, ...b);
    return fire(card, "touchstart", [one, two], [two]);
  }

  function pinchMove(card: any, a: [number, number], b: [number, number]) {
    const both = [finger(card, 1, ...a), finger(card, 2, ...b)];
    return fire(card, "touchmove", both, both);
  }

  function frame(card: any): Draw[] {
    const { ctx, draws } = drawRecordingContext();
    card.ctx = ctx;
    card.drawGrid();
    return draws;
  }

  /** The size readouts a frame drew. */
  const readouts = (draws: Draw[]) =>
    draws
      .filter((d) => d.name === "fillText" && String(d.args[0]).includes(" × "))
      .map((d) => d.args[0]);

  it("maps mm to px through the zoomed window and back, flipped or not", async () => {
    const { card } = await zoomCard();
    card._setView({ zoom: 2, cx: 1000, cy: 3000 });

    expect([card._viewXMin, card._viewXMax, card._viewYMin, card._viewYMax]).toEqual([
      -1500, 3500, 500, 5500,
    ]);
    expect([card.pxPerX, card.pxPerY]).toEqual([0.16, 0.16]);
    expect(card.valueToPixels(-1500, "x")).toBe(0);
    expect(card.valueToPixels(1000, "x")).toBeCloseTo(400, 9);
    expect(card.valueToPixels(5500, "y")).toBeCloseTo(800, 9);
    for (const [x, y] of [
      [0, 0],
      [-1234, 4321],
      [3499, 501],
    ]) {
      expect(card.pixelsToValue(card.valueToPixels(x, "x"), "x")).toBeCloseTo(x, 9);
      expect(card.pixelsToValue(card.valueToPixels(y, "y"), "y")).toBeCloseTo(y, 9);
    }

    // Flipped, the window's xMax is on the left edge, and the same part of
    // the room stays in view.
    card._setMirror(true);
    expect(card.valueToPixels(3500, "x")).toBe(0);
    expect(card.pixelsToValue(800, "x")).toBeCloseTo(-1500, 9);
    expect(card.pixelsToValue(card.valueToPixels(-1234, "x"), "x")).toBeCloseTo(-1234, 9);
  });

  it("zooms in and out from the buttons around the view's center, with a readout", async () => {
    const { card } = await zoomCard();
    const readout = $(card, "zoomReadout");
    expect($(card, "zoomControls").getAttribute("aria-label")).toBe("Map zoom");
    expect($(card, "btnZoomIn").getAttribute("aria-label")).toBe("Zoom in");
    expect($(card, "btnZoomIn").title).toBe(
      "Zoom in. You can also hold Ctrl or Cmd and scroll, or pinch."
    );
    expect($(card, "btnZoomOut").getAttribute("aria-label")).toBe("Zoom out");
    expect($(card, "btnZoomOut").title).toBe("Zoom out");
    expect(readout.hidden).toBe(true);
    expect(readout.title).toBe(
      "Move the map by dragging with Shift held, with the middle mouse button, or with two fingers."
    );
    expect($(card, "btnZoomOut").disabled).toBe(true);

    $(card, "btnZoomIn").click();
    expect(card._zoom()).toBeCloseTo(Math.SQRT2, 12);
    expect(card._view.cx).toBeCloseTo(0, 9);
    expect(card._view.cy).toBeCloseTo(5000, 9);
    expect(readout.hidden).toBe(false);
    expect(readout.textContent).toBe("1.4x");
    expect($(card, "btnZoomOut").disabled).toBe(false);
    $(card, "btnZoomIn").click();
    expect(readout.textContent).toBe("2x");

    for (let i = 0; i < 4; i += 1) $(card, "btnZoomIn").click();
    expect(card._zoom()).toBe(8);
    expect(readout.textContent).toBe("8x");
    expect($(card, "btnZoomIn").disabled).toBe(true);
    $(card, "btnZoomIn").click();
    expect(card._zoom()).toBe(8);

    for (let i = 0; i < 6; i += 1) $(card, "btnZoomOut").click();
    expect(card._view).toBeNull();
    expect(card._zoom()).toBe(1);
    expect(readout.hidden).toBe(true);
    expect($(card, "btnZoomOut").disabled).toBe(true);
    expect([card._viewXMin, card._viewXMax, card._viewYMin, card._viewYMax]).toEqual([
      -5000, 5000, 0, 10000,
    ]);
  });

  it("fits the zones with a margin, then shows the whole map", async () => {
    const { card } = await zoomCard();
    const fit = $(card, "btnZoomFit");
    expect(fit.textContent).toBe("Fit");
    expect(fit.title).toBe("Fit the zones in view");
    expect(fit.getAttribute("aria-label")).toBe("Fit the zones in view");
    expect(fit.disabled).toBe(false);

    // Doorway is 0..1000 by 0..1000: 300 mm around it (the floor beats a
    // tenth of 1 m), cut at the map's top edge, is 1.6 m by 1.3 m, so
    // 10 m / 1.6 m = 6.25x, moved down to keep the window on the map.
    fit.click();
    expect(card._view).toEqual({ zoom: 6.25, cx: 500, cy: 800 });
    expect(fit.title).toBe("Show the whole map");
    expect(fit.getAttribute("aria-label")).toBe("Show the whole map");
    expect($(card, "zoomReadout").textContent).toBe("6.3x");

    fit.click();
    expect(card._view).toBeNull();
    expect(fit.title).toBe("Fit the zones in view");
  });

  it("offers only the whole map when there are no zones", async () => {
    const { card } = await zoomCard({ payload: { zones: {} } });
    const fit = $(card, "btnZoomFit");
    expect(fit.title).toBe("Show the whole map");
    expect(fit.disabled).toBe(true);

    $(card, "btnZoomIn").click();
    expect(fit.disabled).toBe(false);
    fit.click();
    expect(card._view).toBeNull();
    expect(fit.disabled).toBe(true);
  });

  it("zooms around the pointer on Ctrl or Cmd and the wheel, and leaves a plain wheel to the page", async () => {
    const { card } = await zoomCard();
    // The pointer at (200, 600) px is (-2500, 7500) mm at 1x.
    const plain = wheel(card, {});
    expect(plain.defaultPrevented).toBe(false);
    expect(card._view).toBeNull();

    const ctrl = wheel(card, { ctrlKey: true });
    expect(ctrl.defaultPrevented).toBe(true);
    expect(card._zoom()).toBeCloseTo(Math.SQRT2, 12);
    expect(card.pixelsToValue(200, "x")).toBeCloseTo(-2500, 6);
    expect(card.pixelsToValue(600, "y")).toBeCloseTo(7500, 6);

    wheel(card, { metaKey: true });
    expect(card._zoom()).toBeCloseTo(2, 12);
    expect(card.pixelsToValue(200, "x")).toBeCloseTo(-2500, 6);
    // Down zooms out; one event counts for at most a notch.
    wheel(card, { ctrlKey: true, deltaY: 100 });
    expect(card._zoom()).toBeCloseTo(Math.SQRT2, 12);
    wheel(card, { ctrlKey: true, deltaY: -5000 });
    expect(card._zoom()).toBeCloseTo(2, 12);
    // Lines (Firefox's wheel) are 16 px each: 3 lines are 48% of a notch.
    wheel(card, { ctrlKey: true, deltaY: -3, deltaMode: 1 });
    expect(card._zoom()).toBeCloseTo(2 * Math.pow(Math.SQRT2, 0.48), 12);
    // A trackpad pinch: small Ctrl wheel steps.
    const before = card._zoom();
    for (let i = 0; i < 5; i += 1) wheel(card, { ctrlKey: true, deltaY: -4 });
    expect(card._zoom()).toBeCloseTo(before * Math.pow(Math.SQRT2, 0.2), 12);

    // Over the buttons on the map, too, rather than zooming the page.
    const over = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
    Object.defineProperties(over, {
      ctrlKey: { value: true },
      clientX: { value: 700 },
      clientY: { value: 760 },
    });
    const zoomed = card._zoom();
    $(card, "btnZoomFit").dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(card._zoom()).toBeCloseTo(zoomed * Math.SQRT2, 12);
  });

  it("pinches around the fingers' midpoint and pans with two fingers, drawing nothing", async () => {
    const { card, hass } = await zoomCard();
    const start = pinchStart(card, [300, 400], [500, 400]);
    expect(start.defaultPrevented).toBe(true);
    // The first finger had not moved: its rect is dropped for the pinch.
    expect(card.isDrawing).toBe(false);
    expect(card._gesture.kind).toBe("pinch");

    // Twice as far apart: 2x, with (0, 5000) mm still between them.
    const move = pinchMove(card, [200, 400], [600, 400]);
    expect(move.defaultPrevented).toBe(true);
    expect(card._zoom()).toBeCloseTo(2, 12);
    expect(card.valueToPixels(0, "x")).toBeCloseTo(400, 6);
    expect(card.valueToPixels(5000, "y")).toBeCloseTo(400, 6);
    expect($(card, "zoomReadout").textContent).toBe("2x");

    // Both 100 px right and down: the map moves with them.
    pinchMove(card, [300, 500], [700, 500]);
    expect(card._zoom()).toBeCloseTo(2, 12);
    expect(card.valueToPixels(0, "x")).toBeCloseTo(500, 6);
    expect(card.valueToPixels(5000, "y")).toBeCloseTo(500, 6);

    // One finger lifts; the one left behind does nothing until it lifts too.
    fire(card, "touchend", [finger(card, 2, 700, 500)], [finger(card, 1, 300, 500)]);
    const left = fire(card, "touchmove", [finger(card, 2, 100, 100)], [finger(card, 2, 100, 100)]);
    expect(left.defaultPrevented).toBe(true);
    expect(card.valueToPixels(0, "x")).toBeCloseTo(500, 6);
    fire(card, "touchend", [], [finger(card, 2, 100, 100)]);
    expect(card._gesture).toBeNull();
    expect(card.isDrawing).toBe(false);
    expect(zoneSaves(hass)).toEqual([]);

    // One finger draws again, through the zoom: x -3125..1875, y 1875..6875.
    const three = (x: number, y: number) => finger(card, 3, x, y);
    fire(card, "touchstart", [three(100, 100)], [three(100, 100)]);
    fire(card, "touchmove", [three(300, 300)], [three(300, 300)]);
    fire(card, "touchend", [], [three(300, 300)]);
    expect(zoneSaves(hass).map((call) => call.data)).toEqual([
      { x_min: -2500, x_max: -1250, y_min: 2500, y_max: 3750 },
    ]);
  });

  it("starts a pinch from two fresh fingers while a polygon is open, and keeps its corners", async () => {
    const { card, hass } = await zoomCard({ mode: "polygon" });
    const tap = (id: number, x: number, y: number) => {
      card._lastPolyTap = 0;
      fire(card, "touchstart", [finger(card, id, x, y)], [finger(card, id, x, y)]);
      fire(card, "touchend", [], [finger(card, id, x, y)]);
    };
    tap(1, 100, 100);
    tap(2, 300, 100);
    expect(card._polyPoints).toHaveLength(2);

    pinchStart(card, [400, 400], [600, 400]);
    pinchMove(card, [300, 400], [700, 400]);
    fire(card, "touchend", [finger(card, 2, 700, 400)], [finger(card, 1, 300, 400)]);
    fire(card, "touchend", [], [finger(card, 2, 700, 400)]);

    expect(card._zoom()).toBeCloseTo(2, 12);
    expect(card._polyPoints).toEqual([
      { x: -3750, y: 1250 },
      { x: -1250, y: 1250 },
    ]);
    expect(card.isDrawing).toBe(true);
    // (1250, 5000) mm, between the fingers as they landed, is still between
    // them at 2x: x -1875..3125 and y 2500..7500. The next corner lands
    // where the finger is: (500, 600) px is (-1875 + 500 / 0.16, 2500 +
    // 600 / 0.16) mm.
    tap(3, 500, 600);
    expect(card._polyPoints[2]).toEqual({ x: 1250, y: 6250 });
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("pinches a map that pans, and leaves one finger and a scrolling page to the browser", async () => {
    const { card } = await zoomCard({ config: { start_locked: true } });
    expect(card.isLocked).toBe(true);
    expect(card.canvas.classList.contains("pans")).toBe(true);
    // The browser keeps vertical scrolling but leaves pinches to the card.
    expect(card.shadowRoot.querySelector("style").textContent).toContain(
      "canvas.pans { touch-action: pan-y; }"
    );

    const one = finger(card, 1, 300, 400);
    expect(fire(card, "touchstart", [one], [one]).defaultPrevented).toBe(false);
    expect(fire(card, "touchmove", [one], [one]).defaultPrevented).toBe(false);
    // A second finger once the page is scrolling (the event can no longer
    // be cancelled) is the browser's too.
    const late = fire(
      card,
      "touchstart",
      [one, finger(card, 2, 500, 400)],
      [finger(card, 2, 500, 400)],
      false
    );
    expect(late.defaultPrevented).toBe(false);
    expect(card._gesture).toBeNull();
    fire(card, "touchend", [], [one, finger(card, 2, 500, 400)]);

    pinchStart(card, [300, 400], [500, 400]);
    pinchMove(card, [250, 400], [550, 400]);
    expect(card._zoom()).toBeCloseTo(1.5, 12);
    expect(card.isLocked).toBe(true);
  });

  it("pans with Shift-drag and the middle button, placing nothing", async () => {
    const { card, hass } = await zoomCard({ mode: "polygon" });
    card._setView({ zoom: 2, cx: 0, cy: 5000 });

    // (400, 400) px is (0, 5000) mm, and it stays under the pointer.
    mouse(card, "mousedown", 400, 400, { shiftKey: true });
    expect(card.isDrawing).toBe(false);
    windowMouse("mousemove", 300, 450);
    expect(card.valueToPixels(0, "x")).toBeCloseTo(300, 6);
    expect(card.valueToPixels(5000, "y")).toBeCloseTo(450, 6);
    mouse(card, "mouseup", 300, 450, { shiftKey: true });
    windowMouse("mouseup", 300, 450);
    expect(card._gesture).toBeNull();
    expect(card._polyPoints).toEqual([]);
    expect(card.isDrawing).toBe(false);

    // Moving after the release pans no more.
    windowMouse("mousemove", 100, 100);
    expect(card.valueToPixels(0, "x")).toBeCloseTo(300, 6);

    // The middle button, past the canvas: the window stops at the map's edge.
    const middle = mouse(card, "mousedown", 400, 400, { button: 1 });
    expect(middle.defaultPrevented).toBe(true);
    windowMouse("mousemove", 2000, 400);
    expect(card._viewXMin).toBe(-5000);
    windowMouse("mouseup", 2000, 400);
    expect(card._gesture).toBeNull();
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("saves a rect and a polygon where they were drawn on a zoomed map", async () => {
    const { card, hass } = await zoomCard();
    card._setView({ zoom: 2, cx: 0, cy: 5000 });
    // Alt held: the corners go exactly where they were drawn.
    const free = { altKey: true };

    mouse(card, "mousedown", 100, 100, free);
    mouse(card, "mousemove", 300, 500, free);
    // The readout shows what letting go saves: 1.25 m by 2.5 m.
    expect(readouts(frame(card))).toEqual(["1.25 m × 2.50 m"]);
    mouse(card, "mouseup", 300, 500, free);
    expect(zoneSaves(hass).map((call) => call.data)).toEqual([
      { x_min: -1875, x_max: -625, y_min: 3125, y_max: 5625 },
    ]);
    // The new zone is drawn where it was drawn.
    const rect = frame(card).find((d) => d.name === "strokeRect");
    expect(rect?.args.map((v: number) => Math.round(v * 1e6) / 1e6)).toEqual([100, 100, 200, 400]);

    card._setDrawMode("polygon");
    for (const [x, y] of [
      [100, 100],
      [300, 100],
      [300, 300],
    ]) {
      card._lastPolyTap = 0;
      mouse(card, "mousedown", x, y, free);
      mouse(card, "mouseup", x, y, free);
    }
    card.finishPolygon();
    expect(zoneSaves(hass)[1].data.points).toEqual([
      { x: -1875, y: 3125 },
      { x: -625, y: 3125 },
      { x: -625, y: 4375 },
    ]);
  });

  it("keeps a drag's first corner on the map when the view zooms under it", async () => {
    const { card, hass } = await zoomCard();
    card._setView({ zoom: 2, cx: 0, cy: 5000 });
    // (100, 100) px is (-1875, 3125) mm, which the press snaps to (-1850,
    // 3150): 5 cm at 2x, where the grid is 0.5 m.
    mouse(card, "mousedown", 100, 100);
    wheel(card, { ctrlKey: true, clientX: 400, clientY: 400 });
    // 2.83x on (0, 5000): the first corner is off the canvas now, still at
    // the same mm, and not snapped again to the finer 2 cm of a 0.2 m grid
    // (which would make it -1860 or -1840).
    expect(card.pixelsToValue(card.startPoint.x, "x")).toBeCloseTo(-1850, 6);
    expect(card.pixelsToValue(card.startPoint.y, "y")).toBeCloseTo(3150, 6);
    mouse(card, "mousemove", 300, 300);
    mouse(card, "mouseup", 300, 300);

    // Half the window: the 10 m map's span at 2 * SQRT2, halved. The release
    // snaps to 2 cm.
    const half = 10000 / (2 * Math.SQRT2) / 2;
    const perPx = (2 * half) / 800;
    const snap2cm = (mm: number) => Math.round(mm / 20) * 20;
    expect(zoneSaves(hass).map((call) => call.data)).toEqual([
      {
        x_min: -1850,
        x_max: snap2cm(-half + 300 * perPx),
        y_min: 3150,
        y_max: snap2cm(5000 - half + 300 * perPx),
      },
    ]);
  });

  it("draws finer grid lines as the map zooms in, in meters and in feet", async () => {
    for (const [length, steps] of [
      ["km", [1000, 500, 200, 100]],
      ["mi", [2, 1, 0.5, 0.25].map((ft) => ft * 304.8)],
    ] as const) {
      const hass = fakeHass({ ...ZONE_PAYLOAD, zones: {}, rotation_deg: 0 });
      hass.config = { unit_system: { length } };
      const card = await mountCard(hass);
      const seen = [1, 2, 4, 8].map((zoom) => {
        card._setView(zoom === 1 ? null : { zoom, cx: 0, cy: 4000 });
        const state = card._getGridRenderState();
        const { stepX, stepY, pxPerMmX } = state.metrics;
        expect(stepX).toBe(stepY);
        // The lines over the canvas and no more (one step past the left edge
        // at most), each on a whole step.
        const gap = stepX * pxPerMmX;
        expect(state.xLines[0].pixel).toBeGreaterThan(-gap);
        expect(state.xLines[0].pixel).toBeLessThan(1e-6);
        expect(state.xLines[state.xLines.length - 1].pixel).toBeGreaterThan(
          card.canvas.width - 1e-6
        );
        expect(state.xLines[state.xLines.length - 1].pixel).toBeLessThan(card.canvas.width + gap);
        for (const line of state.xLines) {
          expect(Math.abs(line.value / stepX - Math.round(line.value / stepX))).toBeLessThan(1e-6);
        }
        return stepX;
      });
      seen.forEach((step, i) => expect(step).toBeCloseTo(steps[i], 9));
    }
  });

  it("labels the axes along the nearer edge once their lines leave the zoomed view", async () => {
    const hass = fakeHass({ ...ZONE_PAYLOAD, zones: {}, rotation_deg: 0 });
    hass.config = { unit_system: { length: "km" } };
    const card = await mountCard(hass, { unit_display: true });
    // 4x on (3000, 6000): x 1500..4500 and y 4875..7125, so the radar's
    // lines (x = 0 and y = 0) are left of and above the canvas.
    card._setView({ zoom: 4, cx: 3000, cy: 6000 });
    let labels = card._getGridRenderState().labels;
    expect(labels.x.length).toBeGreaterThan(0);
    expect(labels.x.every((l: any) => l.y === 2 && l.baseline === "top")).toBe(true);
    expect(labels.y.every((l: any) => l.x === 2 && l.align === "left")).toBe(true);
    // The values are the 0.2 m step's, in the window.
    expect(labels.x.map((l: any) => l.text)).toContain("3m");
    expect(labels.x.every((l: any) => l.value >= 1500 && l.value <= 4500)).toBe(true);

    // On (-4000, 6000), x = 0 is right of the canvas.
    card._setView({ zoom: 4, cx: -4000, cy: 6000 });
    labels = card._getGridRenderState().labels;
    expect(labels.y.length).toBeGreaterThan(0);
    expect(labels.y.every((l: any) => l.x === card.canvas.width - 2 && l.align === "right")).toBe(
      true
    );
  });

  it("keeps dots, handles, lines and text the same size at any zoom", async () => {
    const { card, hass } = await zoomCard({
      payload: { entities: [{ x: "sensor.a_x", y: "sensor.a_y" }] },
    });
    card.hass = { ...hass, states: { "sensor.a_x": { state: "500" }, "sensor.a_y": { state: "1500" } } };
    const sizes = () => {
      const draws = frame(card);
      const dot = draws.filter((d) => d.name === "arc").map((d) => d.args[2]);
      const label = draws.find((d) => d.name === "fillText" && d.args[0] === "Doorway");
      const grid = draws.find((d) => d.name === "stroke" && d.lineWidth === 1);
      return { dot: Math.max(...dot), font: label?.font, grid: grid?.lineWidth };
    };
    const whole = sizes();
    // 4x on (500, 1250): x -750..1750 and y 0..2500, at 0.32 px per mm.
    card._setView({ zoom: 4, cx: 500, cy: 1250 });
    const zoomed = sizes();
    expect(zoomed).toEqual(whole);
    expect(whole.font).toBe("24px sans-serif");
    expect(whole.grid).toBe(1);

    // While the dot itself is where the zoom puts it.
    const dot = frame(card).find((d) => d.name === "arc" && d.args[2] > 10);
    expect(dot?.args[0]).toBeCloseTo((500 + 750) * 0.32, 6);
    expect(dot?.args[1]).toBeCloseTo(1500 * 0.32, 6);
  });

  it("paints Coverage cells and the cone through the zoom", async () => {
    const { card } = await zoomCard();
    card._coverage.add(100, 100);
    card._setCoverage(true);
    card._setView({ zoom: 2, cx: 0, cy: 2500 });
    const draws = frame(card);
    // A 200 mm cell is 32 px at 0.16 px per mm, its corner at (0, 0) mm,
    // which is (400, 0) px.
    const cell = draws.findIndex((d) => d.name === "moveTo" && d.args[0] === 400 && d.args[1] === 0);
    expect(cell).toBeGreaterThanOrEqual(0);
    expect(draws[cell + 1].args).toEqual([432, 0]);
    // The cone's apex is the radar, at the same (400, 0) px.
    const apex = draws.filter((d) => d.name === "moveTo" && d.args[0] === 400 && d.args[1] === 0);
    expect(apex.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the zoom across pushes, renders, unit changes and refits, inside the map", async () => {
    const hass = fakeHass({ ...ZONE_PAYLOAD, zones: {}, rotation_deg: 0 });
    hass.config = { unit_system: { length: "km" } };
    hass.user = { is_admin: true };
    const card = await mountCard(hass, { start_locked: false });
    // The fitted map is -6000..6000 by 0..9000.
    card._setView({ zoom: 2, cx: 3000, cy: 6000 });
    const view = { ...card._view };

    card.hass = { ...hass, states: { "sensor.a_x": { state: "100" } } };
    expect(card._view).toEqual(view);
    card.render();
    expect(card._view).toEqual(view);
    expect($(card, "zoomReadout").textContent).toBe("2x");
    expect($(card, "btnZoomOut").disabled).toBe(false);

    // A payload whose zone grows the map, and a unit change that rounds it
    // to feet: the view keeps its zoom and center where the map allows.
    hass.handlers[ZONES_SUBSCRIBE].forEach((cb: Handler) =>
      cb({
        ...ZONE_PAYLOAD,
        rotation_deg: 0,
        zones: { "1": { shape: "rect", data: { x_min: 6000, x_max: 8000, y_min: 0, y_max: 1000 } } },
      })
    );
    expect(card.xMax).toBe(8000);
    expect(card._view).toEqual(view);
    $(card, "btnUnitFt").click();
    expect(card._zoom()).toBe(2);
    expect(card._viewXMin).toBeGreaterThanOrEqual(card.xMin);
    expect(card._viewXMax).toBeLessThanOrEqual(card.xMax + 1e-6);
    expect(card._viewYMax).toBeLessThanOrEqual(card.yMax + 1e-6);
  });

  it("starts from the whole map for another radar, another rotation and the map alone", async () => {
    const { card, hass } = await zoomCard();
    const zoomIn = () => card._setView({ zoom: 2, cx: 1000, cy: 3000 });

    // A push with the same rotation keeps it; a new rotation does not.
    zoomIn();
    const push = (fields: Record<string, any>) =>
      hass.handlers[ZONES_SUBSCRIBE].forEach((cb: Handler) =>
        cb({ ...ZONE_PAYLOAD, rotation_deg: 0, ...fields })
      );
    push({});
    expect(card._zoom()).toBe(2);
    push({ rotation_deg: 30 });
    expect(card._view).toBeNull();
    expect($(card, "zoomReadout").hidden).toBe(true);
    expect(card.pxPerX).toBeCloseTo(0.08, 12);

    // A same-radar setConfig puts the YAML's cone back for a moment before
    // the store's rotation: not a new rotation.
    zoomIn();
    card.setConfig({ ...TEN_METER_GRID, device_id: "dev123", start_locked: false });
    expect(card.coneAngleDeg).toBe(30);
    expect(card._view).toEqual({ zoom: 2, cx: 1000, cy: 3000 });
    expect($(card, "zoomReadout").textContent).toBe("2x");

    // The slider, as it turns.
    zoomIn();
    const slider = $(card, "coneAngleSlider");
    slider.value = "45";
    slider.dispatchEvent(new Event("input"));
    expect(card._view).toBeNull();

    // Another radar.
    zoomIn();
    card.setConfig({ ...TEN_METER_GRID, device_id: "other" });
    expect(card._view).toBeNull();
    expect(card.pxPerX).toBeCloseTo(0.08, 12);

    // The map alone has no zoom: no buttons, and the wheel is the page's.
    zoomIn();
    card.setConfig({ ...TEN_METER_GRID, device_id: "other", view_only: true });
    expect(card._view).toBeNull();
    expect($(card, "zoomControls")).toBeNull();
    layOut(card);
    expect(wheel(card, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(card._view).toBeNull();

    // A page load is a new card, at 1x.
    expect(new ZoneMapCard() as any).toHaveProperty("_view", null);
  });

  it("caps the map's height to the screen and keeps its shape, on the map alone too", async () => {
    const hass = fakeHass({ ...ZONE_PAYLOAD, zones: {}, rotation_deg: 0 });
    hass.config = { unit_system: { length: "km" } };
    const rule =
      ".canvas-container { width: min(100%, calc(max(240px, 100vh - 200px) * var(--zm-aspect, 1)));" +
      " width: min(100%, calc(max(240px, 100dvh - 200px) * var(--zm-aspect, 1))); margin-inline: auto; }";
    for (const config of [{}, { view_only: true }]) {
      const card = await mountCard(hass, config);
      const container = card.shadowRoot.querySelector(".canvas-container");
      expect(card.shadowRoot.querySelector("style").textContent).toContain(rule);
      // The fitted map is 800 by 600: the capped width keeps 4:3.
      expect(container.style.aspectRatio).toBe("800 / 600");
      expect(container.style.getPropertyValue("--zm-aspect")).toBe(String(800 / 600));
      // The container queries the overlay buttons size by still apply.
      expect(card.shadowRoot.querySelector("style").textContent).toContain("container-type: size");
    }
  });
});
