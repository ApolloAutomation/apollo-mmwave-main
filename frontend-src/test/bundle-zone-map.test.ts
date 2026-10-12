/// <reference types="vite/client" />
/**
 * The committed zone map bundle, www/apollo-radar-zone-map-card.js, run as
 * built.
 *
 * zone-map-card.test.ts covers the card's behavior from the sources. This file
 * loads the file Home Assistant serves and checks that it is one standalone
 * module, that it defines the card and its editor and lists the card in the
 * card picker, and that the card renders a store payload and repaints when a
 * new payload, a new `hass` or a new config arrives. It also checks that
 * the bundle defines its elements again through Home Assistant's registry
 * polyfill once the app boots.
 *
 * The tuning bundle has its own file (bundle-tuning.test.ts), so the two
 * bundles never register into the same window here. vitest.bundles.config.ts
 * runs the zone map suites against this bundle.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSync } from "vite";
// @ts-expect-error The committed bundle is plain JS with no type declarations.
import { ZoneMapCard } from "../../custom_components/apollo_mmwave/www/apollo-radar-zone-map-card.js";
import bundleSource from "../../custom_components/apollo_mmwave/www/apollo-radar-zone-map-card.js?raw";
import { registeredTags } from "./bundle-sources";
import { installRegistry, polyfillRegistry, tick } from "./registry-polyfill";

type Handler = (message: any) => void;

const TAG = "apollo-radar-zone-map-card";
const ZONES_GET = "apollo_mmwave/zones/get";
const ZONES_SUBSCRIBE = "apollo_mmwave/zones/subscribe";

function payload(name: string) {
  return {
    zones: {
      "1": { shape: "rect", data: { x_min: 0, x_max: 1000, y_min: 0, y_max: 1000 }, name },
    },
    entities: null,
    rotation_deg: 0,
    label: "Office radar",
    suggested_entities: [{ x: "sensor.a_x", y: "sensor.a_y" }],
  };
}

/** A hass whose zone store answers the read and records subscriptions. */
function fakeHass() {
  const handlers: Record<string, Handler[]> = {};
  return {
    states: {},
    entities: {},
    devices: {},
    handlers,
    callService: vi.fn(),
    callWS: vi.fn(async (msg: any) => (msg.type === ZONES_GET ? payload("Doorway") : [])),
    connection: {
      subscribeMessage: vi.fn(async (cb: Handler, msg: any) => {
        (handlers[msg.type] ||= []).push(cb);
        return () => undefined;
      }),
    },
  };
}

function text(el: Element): string {
  return (el.shadowRoot?.textContent ?? "").replace(/\s+/g, " ").trim();
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("zone map bundle file", () => {
  it("is one ES module that imports nothing", () => {
    const { errors, module } = parseSync("apollo-radar-zone-map-card.js", bundleSource, {
      sourceType: "module",
    });
    expect(errors).toEqual([]);
    expect(module.staticImports).toEqual([]);
    expect(module.dynamicImports).toEqual([]);
    expect(module.importMetas).toEqual([]);
  });
});

describe("zone map bundle registration", () => {
  it("defines every element its sources register", () => {
    const tags = registeredTags("../src/zone-map/card.ts");
    expect(tags).toEqual([TAG, "apollo-radar-zone-map-card-editor"]);
    for (const tag of tags) expect(customElements.get(tag), tag).toBeDefined();
    expect(customElements.get(TAG)).toBe(ZoneMapCard);
  });

  it("leaves the tuning bundle's elements to that bundle", () => {
    for (const tag of registeredTags("../src/index.ts")) {
      expect(customElements.get(tag), tag).toBeUndefined();
    }
  });

  it("lists the card in the card picker once", () => {
    const cards = (window as any).customCards as { type: string; name: string }[];
    expect(cards.map((c) => [c.type, c.name])).toEqual([[TAG, "Apollo Zone Map"]]);
  });
});

describe("zone map bundle card", () => {
  it("renders the store's zones, then repaints for a push, a new hass and a new config", async () => {
    const hass = fakeHass();
    const card: any = document.createElement(TAG);
    card.setConfig({ device_id: "dev123", title: "Kitchen" });
    card.hass = hass;
    document.body.appendChild(card);
    await vi.waitFor(() => expect(text(card)).toContain("Doorway"));
    expect(card.shadowRoot.getElementById("deviceTitle").textContent).toBe("Kitchen");
    expect(card.shadowRoot.querySelector("canvas")).not.toBeNull();

    // A zone renamed elsewhere arrives through the subscription.
    hass.handlers[ZONES_SUBSCRIBE][0](payload("Hallway"));
    await vi.waitFor(() => expect(text(card)).toContain("Hallway"));
    expect(text(card)).not.toContain("Doorway");

    // `hass`: the theme turned dark.
    expect(card.shadowRoot.querySelector(".container.dark")).toBeNull();
    card.hass = { ...hass, themes: { darkMode: true } };
    expect(card.shadowRoot.querySelector(".container.dark")).not.toBeNull();
    expect(text(card)).toContain("Hallway");

    // A new config: the title is display only.
    card.setConfig({ device_id: "dev123", title: "Office" });
    expect(card.shadowRoot.getElementById("deviceTitle").textContent).toBe("Office");
    expect(text(card)).toContain("Hallway");
  });
});

describe("zone map bundle and the registry polyfill", () => {
  it("defines its elements again through the polyfill once the app boots", async () => {
    const native = window.customElements;
    const tags = registeredTags("../src/zone-map/card.ts");
    const polyfill = polyfillRegistry(native);
    installRegistry(polyfill);
    try {
      for (const tag of tags) expect(polyfill.get(tag), tag).toBeUndefined();
      polyfill.define("home-assistant", class HomeAssistant extends HTMLElement {});
      await tick();
      for (const tag of tags) expect(polyfill.get(tag), tag).toBe(native.get(tag));
    } finally {
      installRegistry(native);
    }
  });
});
