/** ../src/cards/slider-lock-rows for vitest.bundles.config.ts: the bundle's
 *  slider row and lock row. Those use the bundle's own copy of the lock store
 *  (src/cards/slider-lock.ts), so the suite drives the lock through the rows
 *  alone. */
import { bundled } from "../load-bundles";
import type {
  ApolloRadarSliderLockRow as SourceLockRow,
  ApolloRadarSliderRow as SourceRow,
} from "../../../src/cards/slider-lock-rows";

export * from "../../../src/cards/slider-lock-rows";
export const ApolloRadarSliderRow = bundled<typeof SourceRow>("apollo-radar-slider-row");
export const ApolloRadarSliderLockRow = bundled<typeof SourceLockRow>(
  "apollo-radar-slider-lock-row"
);
