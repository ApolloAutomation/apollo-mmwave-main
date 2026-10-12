/// <reference types="vite/client" />
/**
 * Setup file of vitest.bundles.config.ts: loads both committed bundles into
 * the suite's window before the suite imports anything, then records the
 * class each bundle defined for each tag its sources register. The shims
 * next to this file hand those classes to the suites in place of the source
 * modules. Home Assistant also loads both bundles into one window.
 *
 * Loading first matters because two shims re-export helpers from their
 * source module (calibrate-card.ts, zone-map/editor.ts), which runs that
 * module's registerElement call too. The call finds the bundle's element
 * already defined and does nothing. A tag the bundle failed to define is
 * missing from the record, so its shim throws instead of handing out the
 * class the source module defined in its place.
 */

import "../../../custom_components/apollo_mmwave/www/apollo-radar-tuning.js";
import "../../../custom_components/apollo_mmwave/www/apollo-radar-zone-map-card.js";
import { registeredTags } from "../bundle-sources";

const defined = new Map<string, CustomElementConstructor>();
for (const entry of ["../src/index.ts", "../src/zone-map/card.ts"]) {
  for (const tag of registeredTags(entry)) {
    const ctor = customElements.get(tag);
    if (ctor !== undefined) defined.set(tag, ctor);
  }
}

/** The class a committed bundle defined for `tag`, typed as its source
 *  counterpart. */
export function bundled<T>(tag: string): T {
  const ctor = defined.get(tag);
  if (ctor === undefined) throw new Error(`no committed bundle defines <${tag}>`);
  return ctor as unknown as T;
}
