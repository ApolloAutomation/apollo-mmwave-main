/**
 * Polyfill-aware registration: HA's scoped-custom-element-registry polyfill
 * (loaded inside the async app bundle) can't see elements defined on the
 * native registry before it installs. registerElement must re-assert its
 * definitions through the new registry once the app boots.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { registerCustomCard, registerElement } from "../src/register";

type Register = typeof import("../src/register");

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const originalRegistry = window.customElements;
const NativeRegistry = originalRegistry.constructor as unknown as new (
  win: Window,
) => CustomElementRegistry;

function installRegistry(registry: unknown): void {
  Object.defineProperty(window, "customElements", {
    value: registry,
    configurable: true,
  });
}

/** A fresh, empty native registry (happy-dom's own implementation, which
 *  throws on a reused tag or class like a browser does), logging every tag
 *  defined on it. Each scenario gets its own, so `home-assistant` and
 *  `hc-main` start undefined every time. */
function freshNativeRegistry() {
  const registry = new NativeRegistry(window);
  const defined: string[] = [];
  const define = registry.define.bind(registry);
  registry.define = (tag, ctor, options) => {
    defined.push(tag);
    define(tag, ctor, options);
  };
  return { registry, defined };
}

/**
 * Model of the registry @webcomponents/scoped-custom-element-registry 0.0.10
 * (the copy inside HA frontend 20260930.2's app bundle) puts on
 * window.customElements:
 * - define() throws only when its OWN map already holds the tag or the class,
 *   records the definition, and native-defines a stand-in for the tag only
 *   when `native.get(tag)` is undefined; it then resolves its own pending
 *   whenDefined for the tag.
 * - get() and whenDefined() consult its own map only, so anything defined
 *   natively before the swap is invisible to them.
 * `rejects` lists tags whose define() throws before anything is recorded,
 * standing in for a polyfill that refuses a definition.
 */
function polyfillRegistry(native: CustomElementRegistry, rejects: string[] = []) {
  const byTag = new Map<string, CustomElementConstructor>();
  const byClass = new Set<CustomElementConstructor>();
  const waiting = new Map<string, () => void>();
  const pending = new Map<string, Promise<void>>();
  return {
    define(name: string, ctor: CustomElementConstructor): CustomElementConstructor {
      const tag = name.toLowerCase();
      if (rejects.includes(tag)) throw new DOMException(`test polyfill rejects "${tag}"`);
      if (byTag.has(tag)) {
        throw new DOMException(`the name "${tag}" has already been used with this registry`);
      }
      if (byClass.has(ctor)) {
        throw new DOMException("this constructor has already been used with this registry");
      }
      byTag.set(tag, ctor);
      byClass.add(ctor);
      if (native.get(tag) === undefined) native.define(tag, class StandIn extends HTMLElement {});
      waiting.get(tag)?.();
      waiting.delete(tag);
      pending.delete(tag);
      return ctor;
    },
    get(tag: string): CustomElementConstructor | undefined {
      return byTag.get(tag);
    },
    whenDefined(tag: string): Promise<void> {
      if (byTag.has(tag)) return Promise.resolve();
      let promise = pending.get(tag);
      if (promise === undefined) {
        promise = new Promise<void>((resolve) => waiting.set(tag, resolve));
        pending.set(tag, promise);
      }
      return promise;
    },
  };
}

/** A fresh copy of register.ts (its pending map and one-shot whenDefined
 *  hook are module state) with a fresh native registry installed. */
async function freshScenario(): Promise<
  { register: Register } & ReturnType<typeof freshNativeRegistry>
> {
  const native = freshNativeRegistry();
  installRegistry(native.registry);
  vi.resetModules();
  const register = await import("../src/register");
  return { register, ...native };
}

describe("registerElement", () => {
  afterEach(() => installRegistry(originalRegistry));

  it("defines immediately on the current registry", () => {
    class A extends HTMLElement {}
    registerElement("test-immediate-el", A);
    expect(customElements.get("test-immediate-el")).toBe(A);
  });

  it("re-asserts through the polyfill once the HA app defines <home-assistant>", async () => {
    const { register, registry: native, defined } = await freshScenario();

    class A extends HTMLElement {}
    class B extends HTMLElement {}
    // Registered pre-takeover (cold cache): lands on the native registry.
    register.registerElement("test-reassert-a", A);
    register.registerElement("test-reassert-b", B);
    expect(native.get("test-reassert-a")).toBe(A);
    expect(native.get("test-reassert-b")).toBe(B);

    // The polyfill takes over and can't see the native definitions.
    const polyfill = polyfillRegistry(native);
    installRegistry(polyfill);
    expect(polyfill.get("test-reassert-a")).toBeUndefined();

    // The app boots through the polyfill. Its native stand-in for
    // <home-assistant> is what resolves the native whenDefined that
    // registerElement has been holding since before the swap.
    class HomeAssistant extends HTMLElement {}
    polyfill.define("home-assistant", HomeAssistant);
    expect(native.get("home-assistant")).toBeDefined();
    expect(native.get("home-assistant")).not.toBe(HomeAssistant);
    await tick();

    // Every pending definition went through the NEW registry...
    expect(polyfill.get("test-reassert-a")).toBe(A);
    expect(polyfill.get("test-reassert-b")).toBe(B);
    // ...and the polyfill kept the native ones: no tag was defined natively twice.
    expect(defined).toEqual(["test-reassert-a", "test-reassert-b", "home-assistant"]);
    expect(native.get("test-reassert-a")).toBe(A);
  });

  it("re-asserts once the cast receiver defines <hc-main>", async () => {
    const { register, registry: native, defined } = await freshScenario();

    class C extends HTMLElement {}
    register.registerElement("test-reassert-cast", C);

    const polyfill = polyfillRegistry(native);
    installRegistry(polyfill);
    polyfill.define("hc-main", class HcMain extends HTMLElement {});
    await tick();

    expect(polyfill.get("test-reassert-cast")).toBe(C);
    expect(defined).toEqual(["test-reassert-cast", "hc-main"]);
  });

  it("defines through the polyfill when it is already installed (warm cache)", async () => {
    const { register, registry: native, defined } = await freshScenario();
    const polyfill = polyfillRegistry(native);
    installRegistry(polyfill);

    class D extends HTMLElement {}
    register.registerElement("test-warm-el", D);
    expect(polyfill.get("test-warm-el")).toBe(D);
    // The polyfill forwarded a stand-in, since native lacked the tag.
    expect(native.get("test-warm-el")).toBeDefined();
    expect(native.get("test-warm-el")).not.toBe(D);

    // The boot re-assert finds the tag already defined and leaves it alone.
    polyfill.define("home-assistant", class HomeAssistant extends HTMLElement {});
    await tick();
    expect(polyfill.get("test-warm-el")).toBe(D);
    expect(defined).toEqual(["test-warm-el", "home-assistant"]);
  });

  it("swallows a define that throws, at registration and during the re-assert", async () => {
    const { register, registry: native } = await freshScenario();
    const polyfill = polyfillRegistry(native, ["test-rejected-el"]);
    installRegistry(polyfill);

    class Rejected extends HTMLElement {}
    class Accepted extends HTMLElement {}
    // safeDefine's bare catch hides the throw: the caller never sees it.
    expect(() => register.registerElement("test-rejected-el", Rejected)).not.toThrow();
    register.registerElement("test-accepted-el", Accepted);
    expect(polyfill.get("test-rejected-el")).toBeUndefined();

    // The re-assert retries the rejected tag, swallows the throw again (no
    // unhandled rejection from the whenDefined callback) and still reaches
    // every other pending tag.
    polyfill.define("home-assistant", class HomeAssistant extends HTMLElement {});
    await tick();
    expect(polyfill.get("test-rejected-el")).toBeUndefined();
    expect(native.get("test-rejected-el")).toBeUndefined();
    expect(polyfill.get("test-accepted-el")).toBe(Accepted);
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
