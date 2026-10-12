/** ../src/zone-map/card for vitest.bundles.config.ts: the zone map bundle's
 *  card class. */
import { bundled } from "../load-bundles";
import type { ZoneMapCard as SourceCard } from "../../../src/zone-map/card";

export const ZoneMapCard = bundled<typeof SourceCard>("apollo-radar-zone-map-card");
