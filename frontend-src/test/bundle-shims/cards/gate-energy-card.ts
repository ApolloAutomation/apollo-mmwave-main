/** ../src/cards/gate-energy-card for vitest.bundles.config.ts: the bundle's
 *  card class. */
import { bundled } from "../load-bundles";
import type { ApolloLd2410GateEnergyCard as SourceCard } from "../../../src/cards/gate-energy-card";

export const ApolloLd2410GateEnergyCard = bundled<typeof SourceCard>(
  "apollo-radar-gate-energy-card"
);
