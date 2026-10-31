/** ../src/cards/setup-card for vitest.bundles.config.ts: the source module's
 *  constants and the bundle's card class. */
import { bundled } from "../load-bundles";
import type { ApolloRadarSetupCard as SourceCard } from "../../../src/cards/setup-card";

export * from "../../../src/cards/setup-card";
export const ApolloRadarSetupCard = bundled<typeof SourceCard>("apollo-radar-setup-card");
