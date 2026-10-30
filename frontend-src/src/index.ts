// Keep in sync with custom_components/apollo_mmwave/manifest.json.
export const CARD_VERSION = "2.2.7";

import "./cards/distance-card";
import "./cards/gate-energy-card";
import "./cards/calibrate-card";
import "./strategy";

// TODO(REVIEW_REPORT.md X51): no ESLint is installed or run, so the directive below is inert;
// adopt eslint + typescript-eslint in CI, or replace it with a plain version-banner comment.
// eslint-disable-next-line no-console
console.info(
  `%c APOLLO-MMWAVE %c v${CARD_VERSION} `,
  "color:#fff;background:#03a9f4;font-weight:700;",
  "color:#03a9f4;background:#fff;font-weight:700;"
);
