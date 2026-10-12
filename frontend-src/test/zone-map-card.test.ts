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
import { CONFIG_ENTRIES_SUBSCRIBE, ZONES_GET, ZONES_SUBSCRIBE } from "../src/zone-map/api";

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

describe("zone map card registration", () => {
  it("registers under the apollo-radar namespace and not the old name", async () => {
    await import("../src/zone-map/card");
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
});

describe("zone map card lock state", () => {
  const KEY = "apollo-mmwave.zone-map.lock.dev123";

  afterEach(() => window.localStorage.clear());

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
});

describe("zone map card writes", () => {
  it("saves a shape by device id and never carries the pair list along", async () => {
    // Sending the card's in-memory pair list on every zone edit is what erased
    // two customers' configuration.
    const hass = fakeHass();
    const card = await mountCard(hass);
    hass.callService.mockClear();

    card.updateHomeAssistantShape(1, "rect", { x_min: 0, x_max: 1, y_min: 0, y_max: 1 });

    expect(hass.callService).toHaveBeenCalledWith("apollo_mmwave", "update_zone", {
      device_id: "dev123",
      zone_id: 1,
      shape: "rect",
      data: { x_min: 0, x_max: 1, y_min: 0, y_max: 1 },
      input_units: "mm",
    });
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

  it("persists rotation by device id", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass);
    hass.callService.mockClear();
    card.coneAngleDeg = 45;

    card._persistRotation();

    expect(hass.callService).toHaveBeenCalledWith("apollo_mmwave", "update_zone", {
      device_id: "dev123",
      rotation_deg: 45,
      input_units: "mm",
    });
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
    const card = await mountCard(hass);
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
    const card = await mountCard(hass, { start_locked: false });
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
    const card = await mountCard(hass, { start_locked: false });
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

/**
 * The rect and ellipse rubber band across repaints.
 *
 * `set hass` repaints on every state change in the instance, and a zone
 * payload repaints too. The dashed rect or ellipse preview used to be painted
 * only by the pointer-move handler, right after its own repaint, so any other
 * repaint wiped it until the next move and a still finger saw it blink out.
 * The preview is now rebuilt from the stored cursor point on every repaint,
 * like the polygon one already was.
 */
describe("zone map card rect and ellipse preview across repaints", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  /** Unlocked with zone 1 selected, an 800x800 CSS box and a recording ctx. */
  async function drawingCard(mode: string) {
    const hass = fakeHass({ ...ZONE_PAYLOAD, zones: {} });
    const card = await mountCard(hass, { start_locked: false });
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

  /** Start a drag at canvas (100,100) and hold the pointer at (300,250). */
  function dragTo300x250(card: any) {
    card.canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));
    card.canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 250 }));
  }

  it("keeps the rect preview when a hass push repaints mid-drag", async () => {
    const { card, hass, calls } = await drawingCard("rect");
    dragTo300x250(card);
    calls.length = 0;

    card.hass = hass;

    expect(card.isDrawing).toBe(true);
    expect(calls.some(([name]) => name === "clearRect")).toBe(true);
    expect(dashes(calls)).toBe(1);
    expect(rectPreviews(calls)).toEqual([[100, 100, 200, 150]]);
  });

  it("keeps the ellipse preview when a hass push repaints mid-drag", async () => {
    const { card, hass, calls } = await drawingCard("ellipse");
    dragTo300x250(card);
    calls.length = 0;

    card.hass = hass;

    expect(card.isDrawing).toBe(true);
    expect(dashes(calls)).toBe(1);
    expect(ellipsePreviews(calls)).toEqual([[200, 175, 100, 75, 0, 0, Math.PI * 2]]);
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

    card.hass = hass;

    expect(card.isDrawing).toBe(true);
    expect(rectPreviews(calls)).toEqual([[100, 100, 200, 150]]);
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
    card.hass = hass;

    expect(calls.some(([name]) => name === "clearRect")).toBe(true);
    expect(dashes(calls)).toBe(0);
    // Only the saved zone's own solid outline, with no preview beside it.
    expect((previews as typeof rectPreviews)(calls)).toHaveLength(1);
  });
});
