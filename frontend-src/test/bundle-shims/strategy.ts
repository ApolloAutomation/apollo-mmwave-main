/** ../src/strategy for vitest.bundles.config.ts: the bundle's
 *  shouldRegenerate, read off its dashboard strategy element, which shares
 *  it with the view and section strategies. */
import { bundled } from "./load-bundles";
import type { shouldRegenerate as sourceShouldRegenerate } from "../../src/strategy";

export const shouldRegenerate = bundled<{ shouldRegenerate: typeof sourceShouldRegenerate }>(
  "ll-strategy-dashboard-apollo-radar-tuning"
).shouldRegenerate;
