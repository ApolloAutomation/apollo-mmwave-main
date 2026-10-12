/** ../src/cards/calibrate-card for vitest.bundles.config.ts: the source
 *  module's constants and thresholdCell, and the bundle's card class. */
import { bundled } from "../load-bundles";
import type { ApolloRadarCalibrateCard as SourceCard } from "../../../src/cards/calibrate-card";

export * from "../../../src/cards/calibrate-card";
export const ApolloRadarCalibrateCard = bundled<typeof SourceCard>("apollo-radar-calibrate-card");
