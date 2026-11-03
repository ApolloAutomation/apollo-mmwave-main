/**
 * The version both bundles were built as. It lives in a module of its own so
 * the zone map bundle can read it without pulling in the tuning bundle's
 * entry, which imports every tuning card and the strategy.
 */

// Keep in sync with custom_components/apollo_mmwave/manifest.json.
export const CARD_VERSION = "2.4.0b2";
