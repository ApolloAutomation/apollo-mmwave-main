import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import base from "./vitest.config.ts";

/**
 * `npm run test:bundles`: the card, strategy and zone map suites again, run
 * against the committed bundles in www/ instead of the TypeScript sources.
 *
 * test/bundle-*.test.ts (in `npm test`) check that each bundle registers its
 * elements and that its cards render and re-render, which catches a
 * transform that breaks Lit's decorators. A bundle that lost a service name,
 * a label or an event listener still passes them. Here each source module
 * that defines a custom element is swapped for the shim at the same path
 * under test/bundle-shims/, which hands the suite the class the bundle
 * defined. test/bundle-shims/load-bundles.ts, a setup file, loads both
 * bundles before the suite imports anything.
 *
 * Suites that import none of those modules have nothing to swap, so they
 * are left out.
 */

const SHIMMED = [
  "cards/calibrate-card",
  "cards/distance-card",
  "cards/gate-energy-card",
  "strategy",
  "zone-map/card",
  "zone-map/editor",
];
const SPECIFIER = `\\.\\./src/(${SHIMMED.join("|")})(?:\\.ts)?`;

const testDir = new URL("./test/", import.meta.url);
const suites = readdirSync(testDir)
  // bundle-*.test.ts load one bundle each and already run in `npm test`.
  .filter((name) => name.endsWith(".test.ts") && !name.startsWith("bundle-"))
  .filter((name) =>
    new RegExp(`["']${SPECIFIER}["']`).test(readFileSync(new URL(name, testDir), "utf8"))
  )
  .map((name) => `test/${name}`);

/** Tests that compare against an object from a source module, which a
 *  bundle carries its own copy of, so they can only pass on the sources. */
const SOURCE_ONLY = [
  // cards.test.ts: the gate energy card's styles hold the chart module's
  // CSSResult object itself.
  "styles the gate-energy chart's legend from the chart module",
  // strategy.test.ts: re-imports ../src/strategy and expects a new module
  // instance. bundle-tuning.test.ts evaluates the bundle a second time
  // instead.
  "stays one entry when the bundle is evaluated again",
];
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default defineConfig({
  ...base,
  resolve: {
    alias: [
      {
        find: new RegExp(`^${SPECIFIER}$`),
        replacement: fileURLToPath(new URL("./test/bundle-shims/$1.ts", import.meta.url)),
      },
    ],
  },
  test: {
    ...base.test,
    include: suites,
    setupFiles: [base.test?.setupFiles ?? [], "test/bundle-shims/load-bundles.ts"].flat(),
    testNamePattern: new RegExp(`^(?!.*(?:${SOURCE_ONLY.map(escape).join("|")}))`),
  },
});
