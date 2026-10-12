/** ../src/zone-map/editor for vitest.bundles.config.ts: the source module's
 *  constants and config helpers, and the zone map bundle's editor class. */
import { bundled } from "../load-bundles";
import type { ZoneMapCardEditor as SourceEditor } from "../../../src/zone-map/editor";

export * from "../../../src/zone-map/editor";
export const ZoneMapCardEditor = bundled<typeof SourceEditor>("apollo-radar-zone-map-card-editor");
