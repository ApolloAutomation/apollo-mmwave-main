/**
 * Polyfill-aware registration: HA's scoped-custom-element-registry polyfill
 * (loaded inside the async app bundle) can't see elements defined on the
 * native registry before it installs. registerElement must re-assert its
 * definitions through the new registry once the app boots.
 */

import { describe, it, expect } from "vitest";
import { registerCustomCard, registerElement } from "../src/register";

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Minimal stand-in for the scoped-CE polyfill's replaced registry: own
 *  definition map, blind to anything defined natively before the swap. */
function fakePolyfillRegistry() {
  const defs = new Map<string, CustomElementConstructor>();
  return {
    defs,
    define(tag: string, ctor: CustomElementConstructor) {
      if (defs.has(tag)) throw new Error(`${tag} already defined`);
      defs.set(tag, ctor);
    },
    get(tag: string) {
      return defs.get(tag);
    },
    whenDefined() {
      return new Promise<void>(() => {});
    },
  };
}

describe("registerElement", () => {
  it("defines immediately on the current registry", () => {
    class A extends HTMLElement {}
    registerElement("test-immediate-el", A);
    expect(customElements.get("test-immediate-el")).toBe(A);
  });

  it("re-asserts definitions after the registry is replaced and the HA app boots", async () => {
    const native = window.customElements;

    class B extends HTMLElement {}
    // Registered pre-takeover: lands on the native registry.
    registerElement("test-reassert-el", B);
    expect(native.get("test-reassert-el")).toBe(B);

    // The polyfill takes over: new registry that can't see native defines.
    const polyfilled = fakePolyfillRegistry();
    Object.defineProperty(window, "customElements", {
      value: polyfilled,
      configurable: true,
    });
    try {
      expect(window.customElements.get("test-reassert-el")).toBeUndefined();

      // The app boots: it defines <home-assistant>, and the real polyfill
      // registers a native stand-in — which is what resolves the native
      // whenDefined('home-assistant') that registerElement is holding.
      class HomeAssistant extends HTMLElement {}
      native.define("home-assistant", HomeAssistant);
      await tick();

      // The re-assert must have gone through the NEW registry.
      expect(polyfilled.get("test-reassert-el")).toBe(B);
      // Everything registered earlier is re-asserted too.
      expect(polyfilled.get("test-immediate-el")).toBeDefined();
    } finally {
      Object.defineProperty(window, "customElements", {
        value: native,
        configurable: true,
      });
    }
  });
});

describe("registerCustomCard", () => {
  it("adds a card picker entry once per type, with the docs link", () => {
    const before = (window as any).customCards;
    (window as any).customCards = undefined;
    try {
      registerCustomCard("test-picker-card", "Test Card", "A card for tests.");
      registerCustomCard("test-picker-card", "Test Card again", "Ignored.");
      expect((window as any).customCards).toEqual([
        {
          type: "test-picker-card",
          name: "Test Card",
          description: "A card for tests.",
          documentationURL: "https://github.com/ApolloAutomation/apollo-mmwave-main",
        },
      ]);
    } finally {
      (window as any).customCards = before;
    }
  });

  it("keeps the entries other cards already added", () => {
    const before = (window as any).customCards;
    const other = { type: "someone-elses-card", name: "Other" };
    (window as any).customCards = [other];
    try {
      registerCustomCard("test-picker-card", "Test Card", "A card for tests.");
      const cards = (window as any).customCards as { type: string }[];
      expect(cards[0]).toBe(other);
      expect(cards.map((c) => c.type)).toEqual(["someone-elses-card", "test-picker-card"]);
    } finally {
      (window as any).customCards = before;
    }
  });
});
