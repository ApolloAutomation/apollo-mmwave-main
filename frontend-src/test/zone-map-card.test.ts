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
    expect(card.shadowRoot.getElementById("btnLock").title).toBe("Lock drawing");
  });

  it("re-derives the lock from the radar's zones once start_locked is removed", async () => {
    const card = await mountCard(fakeHass(), { type: TYPE, start_locked: false });
    expect(card.isLocked).toBe(false);

    // The editor's "auto" choice deletes the key.
    card.setConfig({ type: TYPE, device_id: "dev123" });

    expect(card.isLocked).toBe(true);
    expect(card.shadowRoot.getElementById("btnLock").title).toBe("Unlock drawing");
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
    expect([card.xMax, card.yMin, card.yMax]).toEqual([fresh.xMax, fresh.yMin, fresh.yMax]);
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
    expect(card._formatTickLabel(304.8, 304.8, "ft")).toBe("1ft");
    expect(card._formatTickLabel(762, 152.4, "ft")).toBe("2.5ft");
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
    const card = await mountCard(fakeHass(), { unit_display: true });

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

    // One foot is 50 px here, room for every label but the two the edge cuts.
    expect(lineValues(xLines, 304.8)).toEqual(steps(-8, 8, 1));
    expect(labels.x.map((label: any) => label.text)).toEqual(tickLabels(-7, 7, 1, "ft"));
    expect(labels.y.map((label: any) => label.text)).toEqual(tickLabels(0, 15, 1, "ft"));
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
}

/**
 * A 2D context whose measureText answers with `measure`, and that notes each
 * fillText with the font size, alignment and baseline it ran under.
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
        return (text: string) => ({ width: measure(text, parseFloat(target.font)) });
      }
      if (prop === "fillText") {
        return (text: string, x: number, y: number) => {
          texts.push({
            text,
            x,
            y,
            align: target.textAlign,
            baseline: target.textBaseline,
            size: parseFloat(target.font),
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
    measure = browserTextWidth
  ) {
    const hass = fakeHass({ ...ZONE_PAYLOAD, zones: {}, rotation_deg: rotationDeg });
    const card = await mountCard(hass, { unit_display: true, ...config });
    layOut(card, cssWidth);
    const { ctx, texts } = textRecordingContext(measure);
    card.ctx = ctx;
    card._invalidateGridCache();
    card.drawGrid();
    const labels = texts.filter((label) => label.size === card.unitLabelSize);
    // The grid labels draw first, then the cone's. Ring labels are the only
    // ones centered on both axes.
    const rings = labels.filter((label) => label.align === "center" && label.baseline === "middle");
    const grid = labels.filter((label) => !rings.includes(label));
    return { card, hass, labels, rings, grid };
  }

  /** A default R PRO-1 card, drawn the way drawnLabels draws one. */
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
    // own 20ft label is cut, so the ring label is the only one that names
    // 20 ft. It is drawn, but it does not push out "19ft", the full label
    // beside it. This canvas cannot measure text, so the card estimates.
    const { grid, rings } = await drawnLabels(
      {
        grid_units: "ft",
        grid: { x_min: -10, x_max: 10, y_min: 0, y_max: 20 },
        cone: { y_max: 20 },
        unit_label_size: 24,
      },
      -6,
      250,
      () => 0
    );

    const edge = rings.find((label) => label.text === "20ft");
    expect(edge).toBeDefined();
    expect(onCanvas(edge!)).toBe(false);
    expect(grid.map((label) => label.text)).toContain("19ft");
  });

  it("keeps more room between labels on a narrower card", async () => {
    const card = await mountCard(fakeHass(), { unit_display: true });
    // Every label measures 30 px, 10 px less than the 40 px between lines.
    const { ctx } = textRecordingContext(() => 30);
    card.ctx = ctx;
    card._invalidateGridCache();
    const xTexts = () => card._getGridRenderState().labels.x.map((label: any) => label.text);
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

  // The presence sensor (binary_sensor.py `_build_point_rotator` and
  // `_reading_unit_factor`) applies the same rotation and unit conversion
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

describe("zone map card renaming a zone only the YAML names", () => {
  // The backend renames only zones the store holds. A name-only save for a
  // zone seeded from the card YAML was dropped, the card still said it was
  // saved, and the next payload put the YAML name back.
  const YAML_ZONES = { zones: [{ id: 7, name: "Desk" }] };

  /** Type a name into a zone manager row and press its Save button. */
  function rename(card: any, zoneId: number, name: string) {
    const rows = Array.from(card.shadowRoot.querySelectorAll("#zoneManager .entity-row"));
    const row: any = rows.find(
      (r: any) => r.querySelector("label")?.textContent === `Zone ${zoneId}`
    );
    expect(row).toBeTruthy();
    row.querySelector("input").value = name;
    const save: any = Array.from(row.querySelectorAll("button")).find(
      (b: any) => b.textContent === "Save"
    );
    save.click();
  }

  function zoneSaves(hass: any): any[] {
    return hass.callService.mock.calls
      .filter((call: any[]) => call[1] === "update_zone")
      .map((call: any[]) => call[2]);
  }

  it("creates the zone with its name when the store has never seen it", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass, YAML_ZONES);
    hass.callService.mockClear();

    rename(card, 7, "Desk 2");

    expect(zoneSaves(hass)).toEqual([
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
    const hass = fakeHass();
    const card = await mountCard(hass, YAML_ZONES);
    hass.callService.mockClear();

    rename(card, 1, "Front door");

    const saves = zoneSaves(hass);
    expect(saves).toEqual([
      { device_id: "dev123", zone_id: 1, name: "Front door", input_units: "mm" },
    ]);
    expect(saves[0]).not.toHaveProperty("shape");
    expect(saves[0]).not.toHaveProperty("data");
  });

  it("only renames before the first payload, when the store's zones are unknown", async () => {
    const hass = fakeHass();
    // The read never answers, so the card has no payload to check against.
    hass.callWS = vi.fn(() => new Promise(() => {}));
    const card: any = new ZoneMapCard();
    card.setConfig({ device_id: "dev123", ...YAML_ZONES } as any);
    card.hass = hass;
    expect(card._zoneConfigPayload).toBeNull();

    rename(card, 7, "Desk 2");

    const saves = zoneSaves(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual({ device_id: "dev123", zone_id: 7, name: "Desk 2", input_units: "mm" });
  });

  it("only renames a zone drawn here whose shape has not reached the store yet", async () => {
    const hass = fakeHass();
    const card = await mountCard(hass, YAML_ZONES);
    // What a finished drag does before its save is echoed back.
    card._upsertZone(7, "rect", { x_min: 0, x_max: 10, y_min: 0, y_max: 10 });
    hass.callService.mockClear();

    rename(card, 7, "Desk 2");

    const saves = zoneSaves(hass);
    expect(saves).toHaveLength(1);
    expect(saves[0]).not.toHaveProperty("shape");
    expect(saves[0].name).toBe("Desk 2");
  });
});

describe("zone map card zone names across payloads", () => {
  // Every payload rebuilds the zone manager rows, and the card's own Add Zone
  // and rotation writes echo back as payloads. A rebuild used to put the
  // stored name back over whatever was being typed and drop the focus.
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
    const hass = fakeHass(payload);
    const card = await mountCard(hass);
    document.body.appendChild(card);
    return { card, hass };
  }

  function push(hass: any, payload: any) {
    hass.handlers[ZONES_SUBSCRIBE][0](payload);
  }

  function nameInput(card: any, zoneId: number): any {
    return card.shadowRoot.querySelector(`#zoneManager input[data-zone-id="${zoneId}"]`);
  }

  function saveButton(card: any, zoneId: number): any {
    const row = nameInput(card, zoneId).closest(".entity-row");
    return Array.from(row.querySelectorAll("button")).find(
      (b: any) => b.textContent === "Save"
    );
  }

  function zoneSaves(hass: any): any[] {
    return hass.callService.mock.calls
      .filter((call: any[]) => call[1] === "update_zone")
      .map((call: any[]) => call[2]);
  }

  it("keeps a name being typed, and its focus and caret, when a payload lands", async () => {
    const { card, hass } = await attachedCard();
    const input = nameInput(card, 1);
    input.focus();
    input.value = "Kit";
    input.setSelectionRange(1, 2);
    expect(card.shadowRoot.activeElement).toBe(input);

    push(hass, { ...TWO_ZONES, rotation_deg: 20 });

    expect(card.coneAngleDeg).toBe(20);
    const after = nameInput(card, 1);
    expect(after.value).toBe("Kit");
    expect(card.shadowRoot.activeElement).toBe(after);
    expect(after.selectionStart).toBe(1);
    expect(after.selectionEnd).toBe(2);
  });

  it("gives a row nobody edited the name the payload carries", async () => {
    const { card, hass } = await attachedCard();
    // Typed into and then left, without saving.
    nameInput(card, 1).value = "Kit";

    push(hass, {
      ...TWO_ZONES,
      zones: { ...TWO_ZONES.zones, "2": { shape: "none", data: null, name: "Sofa" } },
    });

    expect(nameInput(card, 1).value).toBe("Kit");
    expect(nameInput(card, 2).value).toBe("Sofa");
  });

  it("gives a focused row nobody edited a rename and keeps its focus", async () => {
    const { card, hass } = await attachedCard();
    nameInput(card, 2).focus();

    push(hass, {
      ...TWO_ZONES,
      zones: { ...TWO_ZONES.zones, "2": { shape: "none", data: null, name: "Sofa" } },
    });

    const after = nameInput(card, 2);
    expect(after.value).toBe("Sofa");
    expect(card.shadowRoot.activeElement).toBe(after);
  });

  it("saves the kept draft after the push", async () => {
    const { card, hass } = await attachedCard();
    const input = nameInput(card, 1);
    input.focus();
    input.value = "Kit";
    push(hass, { ...TWO_ZONES, rotation_deg: 20 });
    hass.callService.mockClear();

    saveButton(card, 1).click();

    expect(zoneSaves(hass)).toEqual([
      { device_id: "dev123", zone_id: 1, name: "Kit", input_units: "mm" },
    ]);
    expect(card.zoneConfig.find((z: any) => z.id === 1).name).toBe("Kit");
  });

  it("keeps a name typed into a new zone across its own Add Zone echo", async () => {
    const { card, hass } = await attachedCard(ZONE_PAYLOAD);
    card._handleAddZone();
    const input = nameInput(card, 2);
    expect(input.value).toBe("Zone 2");
    input.focus();
    input.value = "Sofa";

    push(hass, {
      ...ZONE_PAYLOAD,
      zones: { ...ZONE_PAYLOAD.zones, "2": { shape: "none", data: null, name: "Zone 2" } },
    });

    expect(nameInput(card, 2).value).toBe("Sofa");
    expect(card.shadowRoot.activeElement).toBe(nameInput(card, 2));
  });

  it("drops the draft of a zone the payload removed", async () => {
    const { card, hass } = await attachedCard();
    nameInput(card, 2).value = "Sofa";

    push(hass, ZONE_PAYLOAD);

    expect(nameInput(card, 2)).toBeNull();
    expect(nameInput(card, 1).value).toBe("Doorway");
  });

  // A zone written into the card YAML has no store entry until it is drawn,
  // and a geometry write carries no name, so the store then holds the zone
  // with its shape and no name. That used to swap the YAML name for "Zone 1"
  // on the payload right after the "saved" toast.
  const SEEDED = { zones: [{ id: 1, name: "Kitchen" }] };
  const RECT = { x_min: 0, x_max: 1000, y_min: 0, y_max: 1000 };

  async function seededCard() {
    const hass = fakeHass({ ...ZONE_PAYLOAD, zones: {} });
    const card = await mountCard(hass, SEEDED);
    document.body.appendChild(card);
    return { card, hass };
  }

  function chipText(card: any, zoneId: number): string | undefined {
    const chips = Array.from(
      card.shadowRoot.querySelectorAll("#zone-buttons .zone-btn[data-zone-id]")
    );
    const chip: any = chips.find((b: any) => b.dataset.zoneId === String(zoneId));
    return chip?.textContent;
  }

  it("keeps a seeded name for a store zone with geometry but no name", async () => {
    const { card, hass } = await seededCard();
    expect(card._zoneLabel(1)).toBe("Kitchen");

    push(hass, { ...ZONE_PAYLOAD, zones: { "1": { shape: "rect", data: RECT } } });

    expect(card.zones).toEqual([{ id: 1, shape: "rect", data: RECT }]);
    expect(card.zoneConfig).toEqual([{ id: 1, name: "Kitchen" }]);
    expect(card._zoneLabel(1)).toBe("Kitchen");
    expect(nameInput(card, 1).value).toBe("Kitchen");
    expect(chipText(card, 1)).toBe("Kitchen");
  });

  it("a stored name wins over the seed", async () => {
    const { card, hass } = await seededCard();

    push(hass, {
      ...ZONE_PAYLOAD,
      zones: { "1": { shape: "rect", data: RECT, name: "Hall" } },
    });

    expect(card.zoneConfig).toEqual([{ id: 1, name: "Hall" }]);
    expect(card._zoneLabel(1)).toBe("Hall");
    expect(nameInput(card, 1).value).toBe("Hall");
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

describe("zone map card undo after a zone manager Delete", () => {
  // Undo writes every snapshot entry back with update_zone, and the backend
  // stores any zone id it is given and re-creates that zone's entities. A
  // snapshot entry that outlived a Delete brought the deleted zone back, or
  // overwrote a zone added later under the freed id, under an "Undid" toast.
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

  /** Press the Delete button in a zone manager row. */
  function deleteZone(card: any, zoneId: number) {
    const rows = Array.from(card.shadowRoot.querySelectorAll("#zoneManager .entity-row"));
    const row: any = rows.find(
      (r: any) => r.querySelector("label")?.textContent === `Zone ${zoneId}`
    );
    expect(row).toBeTruthy();
    const del: any = Array.from(row.querySelectorAll("button")).find(
      (b: any) => b.textContent === "Delete"
    );
    del.click();
  }

  function zoneSaves(hass: any): any[] {
    return hass.callService.mock.calls
      .filter((call: any[]) => call[1] === "update_zone")
      .map((call: any[]) => call[2]);
  }

  it("drops the deleted zone's snapshot, so Undo cannot re-create it", async () => {
    const hass = fakeHass(TWO_ZONES);
    const card = await mountCard(hass);
    card._setUndoSnapshot(card._snapshotZones([2]));
    expect(card.shadowRoot.getElementById("btnUndo").disabled).toBe(false);
    hass.callService.mockClear();

    deleteZone(card, 2);

    expect(zoneSaves(hass)).toEqual([
      { device_id: "dev123", zone_id: 2, delete: true, input_units: "mm" },
    ]);
    expect(card._undoSnapshot).toBeNull();
    expect(card.shadowRoot.getElementById("btnUndo").disabled).toBe(true);

    hass.callService.mockClear();
    card.shadowRoot.getElementById("btnUndo").click();
    expect(hass.callService).not.toHaveBeenCalled();
    expect(card.zones.map((z: any) => z.id)).toEqual([1]);
  });

  it("still undoes the other zones a snapshot holds", async () => {
    const hass = fakeHass(TWO_ZONES);
    const card = await mountCard(hass);
    card._setUndoSnapshot(card._snapshotZones([1, 2]));

    deleteZone(card, 2);

    expect(card._undoSnapshot.map((s: any) => s.zoneId)).toEqual([1]);
    expect(card.shadowRoot.getElementById("btnUndo").disabled).toBe(false);

    hass.callService.mockClear();
    card.shadowRoot.getElementById("btnUndo").click();
    expect(zoneSaves(hass).map((p: any) => p.zone_id)).toEqual([1]);
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
    const card = await mountCard(hass, { cone: { angle_deg: 45 } });
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

    pushTargetMove(card, hass);

    expect(card.isDrawing).toBe(true);
    expect(calls.some(([name]) => name === "clearRect")).toBe(true);
    expect(dashes(calls)).toBe(1);
    expect(rectPreviews(calls)).toEqual([[100, 100, 200, 150]]);
  });

  it("keeps the ellipse preview when a hass push repaints mid-drag", async () => {
    const { card, hass, calls } = await drawingCard("ellipse");
    dragTo300x250(card);
    calls.length = 0;

    pushTargetMove(card, hass);

    expect(card.isDrawing).toBe(true);
    expect(calls.some(([name]) => name === "clearRect")).toBe(true);
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

    pushTargetMove(card, hass);

    expect(card.isDrawing).toBe(true);
    expect(calls.some(([name]) => name === "clearRect")).toBe(true);
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
    const card = await mountCard(hass);
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

    // A second finger tapped while the first is held adds nothing; the held
    // finger's own lift is the next vertex.
    card._lastPolyTap = 0;
    fire(card, "touchstart", [finger(card, 2, 300, 100)], [finger(card, 2, 300, 100)]);
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
    const card = await mountCard(hass, { start_locked: false });
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
    const card = await mountCard(hass);
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
 * A zone fills with its palette color at 0.30 alpha and outlines it at full
 * alpha, picked by zone id so a zone keeps its color when another one goes.
 */
describe("zone map card drawing colors", () => {
  const RED = ["rgba(244, 67, 54, 0.30)", "rgba(244, 67, 54, 1)"];
  const BLUE = ["rgba(33, 150, 243, 0.30)", "rgba(33, 150, 243, 1)"];

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
    const card = await mountCard(hass, { start_locked: false });
    expect(card.selectedZone).toBe(1);
    card._setDrawMode(mode);
    vi.spyOn(card.canvas, "getBoundingClientRect").mockReturnValue(layout);
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  function drag(card: any, from: number[], to: number[]) {
    const mouse = (type: string, [x, y]: number[]) =>
      card.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));
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
    const card = await mountCard(fakeHass());

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
    const { card, hass, toasts } = await drawingCard("rect", box(0, 0, 640, 640));

    drag(card, [240, 240], [81, 81]);
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
 * Clearing zones from the chips, and undoing it.
 *
 * A double-click on a zone chip clears that zone and Clear All Zones clears
 * every listed one, with one update_zone of shape none per zone. Both leave an
 * undo snapshot, and Undo writes each zone back. Clear All and Undo toast once
 * for the whole batch, and only when every write landed; a refused write says
 * so itself. Unlocked throughout, so nothing here depends on whether the lock
 * should guard these controls.
 */
describe("zone map card clearing zones", () => {
  const DOORWAY = ZONE_PAYLOAD.zones["1"].data;
  const WINDOW = { x_min: 0, x_max: 500, y_min: 0, y_max: 500 };
  const TWO_ZONES = {
    ...ZONE_PAYLOAD,
    zones: { ...ZONE_PAYLOAD.zones, "2": { shape: "rect", data: WINDOW, name: "Window" } },
  };

  async function clearingCard() {
    const hass = fakeHass(TWO_ZONES);
    const card = await mountCard(hass, { start_locked: false });
    hass.callService.mockClear();
    const toasts = notifications(card);
    return { card, hass, toasts };
  }

  function clearAll(card: any) {
    card.shadowRoot.getElementById("clearBtn").click();
  }

  function undo(card: any) {
    card.shadowRoot.getElementById("btnUndo").click();
  }

  /** Let the resolved callService calls run on to their toasts. */
  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function zoneSaves(hass: any): any[] {
    return hass.callService.mock.calls
      .filter((call: any[]) => call[1] === "update_zone")
      .map((call: any[]) => call[2]);
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

  it("clears one zone on a chip double-click, and Undo puts it back", async () => {
    const { card, hass, toasts } = await clearingCard();
    const chip = card.shadowRoot.querySelector('#zone-buttons .zone-btn[data-zone-id="1"]');

    chip.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    await settle();

    expect(zoneSaves(hass)).toEqual([cleared(1)]);
    expect(card.zones).toEqual([{ id: 2, shape: "rect", data: WINDOW }]);
    expect(toasts).toEqual(["Doorway cleared"]);
    expect(card._undoSnapshot).toEqual([{ zoneId: 1, shape: "rect", data: DOORWAY }]);

    hass.callService.mockClear();
    undo(card);
    await settle();

    expect(zoneSaves(hass)).toEqual([restored(1, DOORWAY)]);
    expect(card.zones).toContainEqual({ id: 1, shape: "rect", data: DOORWAY });
    expect(toasts).toEqual(["Doorway cleared", "Undid last zone change"]);
  });

  it("clears every zone with a write each and one toast, and Undo restores them", async () => {
    const { card, hass, toasts } = await clearingCard();

    clearAll(card);
    await settle();

    expect(zoneSaves(hass)).toEqual([cleared(1), cleared(2)]);
    expect(card.zones).toEqual([]);
    expect(toasts).toEqual(["All zones cleared"]);
    expect(card._undoSnapshot).toEqual([
      { zoneId: 1, shape: "rect", data: DOORWAY },
      { zoneId: 2, shape: "rect", data: WINDOW },
    ]);

    hass.callService.mockClear();
    undo(card);
    await settle();

    expect(zoneSaves(hass)).toEqual([restored(1, DOORWAY), restored(2, WINDOW)]);
    expect(card.zones).toEqual([
      { id: 1, shape: "rect", data: DOORWAY },
      { id: 2, shape: "rect", data: WINDOW },
    ]);
    expect(toasts).toEqual(["All zones cleared", "Undid last zone change"]);
  });

  it("does not say all zones were cleared when one of them was refused", async () => {
    const { card, hass, toasts } = await clearingCard();
    refuse(hass, 2);

    clearAll(card);
    await settle();

    expect(zoneSaves(hass)).toEqual([cleared(1), cleared(2)]);
    expect(toasts).toEqual(["Could not save: zone 2 is busy"]);
  });

  it("does not say the undo happened when one of its writes was refused", async () => {
    const { card, hass, toasts } = await clearingCard();
    clearAll(card);
    await settle();
    hass.callService.mockClear();
    refuse(hass, 1);

    undo(card);
    await settle();

    expect(zoneSaves(hass)).toEqual([restored(1, DOORWAY), restored(2, WINDOW)]);
    expect(toasts).toEqual(["All zones cleared", "Could not save: zone 1 is busy"]);
  });
});
