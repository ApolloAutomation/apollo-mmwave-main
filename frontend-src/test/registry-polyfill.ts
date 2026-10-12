/**
 * Test doubles for the registry swap that registerElement (src/register.ts)
 * works around. register.test.ts drives a fresh copy of register.ts with
 * them, and bundle-tuning.test.ts and bundle-zone-map.test.ts drive the
 * committed bundles, which each carry their own copy.
 */

/** Let the whenDefined callbacks run. */
export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Put `registry` on window.customElements, as the polyfill does. */
export function installRegistry(registry: unknown): void {
  Object.defineProperty(window, "customElements", {
    value: registry,
    configurable: true,
  });
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
export function polyfillRegistry(native: CustomElementRegistry, rejects: string[] = []) {
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
