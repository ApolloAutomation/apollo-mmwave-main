/// <reference types="vite/client" />
/**
 * What a committed bundle must define, read from the TypeScript sources.
 *
 * test/bundle-tuning.test.ts and test/bundle-zone-map.test.ts load the built
 * files in www/, not the sources. This module tells them which custom
 * elements each bundle has to define: it follows the relative value imports
 * from a bundle's entry (`import type` adds nothing at runtime, so it is
 * skipped) and collects the tag of every registerElement and
 * customElements.define call it reaches. A tag held in a constant
 * (`CALIBRATE_CARD_TAG`) is looked up in the sources. An element added to
 * the sources is then expected in the built bundle without editing the
 * bundle tests.
 *
 * Nothing here imports a source module, so no source registration can stand
 * in for one the bundle failed to make.
 */

const SOURCES = import.meta.glob<string>("../src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** A key of SOURCES ("../src/index.ts") as an absolute URL, so relative
 *  import specifiers resolve with the URL parser. */
const BASE = "file:///frontend-src/test/";
const byUrl = new Map(
  Object.entries(SOURCES).map(([key, text]) => [new URL(key, BASE).href, text])
);

const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?(?:[^;]*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/gm;
const REGISTER_RE = /registerElement\(\s*(?:(["'])([^"']+)\1|([A-Za-z_$][\w$]*))\s*,/g;
const DEFINE_RE = /customElements\.define\(\s*(["'])([^"']+)\1/g;

function resolveImport(fromUrl: string, specifier: string): string {
  const target = new URL(specifier, fromUrl).href;
  for (const candidate of [target, `${target}.ts`, `${target}/index.ts`]) {
    if (byUrl.has(candidate)) return candidate;
  }
  throw new Error(`${fromUrl} imports ${specifier}, which is not a file under src/`);
}

/** Every source file a bundle entry pulls in at runtime, entry included. */
function moduleGraph(entry: string): string[] {
  const start = new URL(entry, BASE).href;
  if (!byUrl.has(start)) throw new Error(`no source file ${entry}`);
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const url = queue.shift()!;
    for (const match of byUrl.get(url)!.matchAll(IMPORT_RE)) {
      if (match[1]) continue; // import type / export type
      const dep = resolveImport(url, match[2]);
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  return [...seen];
}

/** The string a `const NAME = "..."` in the sources holds. */
function constantValue(name: string): string {
  const re = new RegExp(`\\bconst\\s+${name}\\s*=\\s*(["'])([^"']+)\\1`);
  for (const text of byUrl.values()) {
    const match = re.exec(text);
    if (match) return match[2];
  }
  throw new Error(`registerElement uses ${name}, but no source declares it as a string`);
}

/** The custom element tags a bundle built from `entry` must define, sorted.
 *  `entry` is relative to this folder, for example "../src/index.ts". */
export function registeredTags(entry: string): string[] {
  const tags = new Set<string>();
  for (const url of moduleGraph(entry)) {
    const text = byUrl.get(url)!;
    for (const match of text.matchAll(REGISTER_RE)) {
      tags.add(match[2] ?? constantValue(match[3]));
    }
    for (const match of text.matchAll(DEFINE_RE)) tags.add(match[2]);
  }
  return [...tags].sort();
}
