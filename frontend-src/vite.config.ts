import { defineConfig, type UserConfig } from "vite";

/**
 * Build one self-contained bundle straight into the integration's www/ folder,
 * which the Python side serves as a fixed list of filenames (see
 * custom_components/apollo_mmwave/const.py).
 *
 * Each bundle gets its own vite invocation on purpose. A single multi-entry
 * build hoists anything two entries share (today: src/register.ts) into a
 * hashed chunk both then import, and HA never fetches that third file. One
 * entry per build keeps every output standalone at the cost of duplicating a
 * few hundred bytes.
 *
 * emptyOutDir is off because www/ is a committed folder, not a scratch dir.
 */
export function bundle(name: string, entry: string): UserConfig {
  return {
    build: {
      outDir: "../custom_components/apollo_mmwave/www",
      emptyOutDir: false,
      lib: {
        entry,
        formats: ["es"],
        fileName: () => `${name}.js`,
      },
      // Vite 6's "modules" default. Vite 8 defaults to Safari 16.4 and
      // Chrome 111, which leaves class static blocks in the output that older
      // wall-tablet browsers (iOS 15 Safari) cannot parse.
      target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
      rolldownOptions: {
        output: {
          // Rolldown's name for Rollup's inlineDynamicImports: true. Any
          // dynamic import() stays in this file instead of a chunk HA would
          // never fetch.
          codeSplitting: false,
          // Vite drops legal comments whenever minify is on. Keep them so
          // lit's BSD-3-Clause notices stay in the shipped bundle.
          comments: { legal: true },
        },
      },
      // Vite 6 skipped terser for ES library output, so the bundles shipped
      // unminified until 2.2.2. Vite 8 runs it and keeps /* @__PURE__ */
      // annotations. Lit's legacy decorators come from tsconfig.json
      // (experimentalDecorators, useDefineForClassFields: false), which
      // Vite 8's Oxc transform reads.
      minify: "terser",
    },
  };
}

export default defineConfig(
  bundle("apollo-radar-tuning", "src/index.ts")
);
