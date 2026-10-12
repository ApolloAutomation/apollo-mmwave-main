import type { HomeAssistant } from "./types";
import { registerElement } from "./register";
import {
  isLiveState,
  strategyDevices,
  generateCards,
  generateSections,
  generateViews,
  type StrategyConfig,
} from "./strategy-core";

/** Stable key for the devices this strategy config would render. Includes
 *  detected capabilities so a forced (explicitly selected) device whose
 *  entities register late still triggers a rebuild, liveness so the offline
 *  note on a tab tracks the radar, and the name and base so a rename
 *  refreshes the tab title, help-card heading, zone-map title and view path.
 *  Each entry is JSON so no name can run into the next field. */
function radarDeviceKey(hass: HomeAssistant, config: StrategyConfig): string {
  return strategyDevices(hass, config)
    .map((d) =>
      JSON.stringify([d.deviceId, d.profile?.key ?? "", d.ld2450, d.online, d.name, d.base])
    )
    .sort()
    .join(",");
}

/** The older `strategy: {type, options: {...}}` form, which Home Assistant
 *  still accepts. */
interface LegacyStrategyConfig {
  type?: string;
  options: StrategyConfig;
}

/** Home Assistant's own legacy test: exactly two keys, one of them an
 *  `options` object. Its dispatcher unwraps `options` before it calls
 *  `generate()`, but hands `shouldRegenerate` the raw strategy object, so the
 *  hook has to unwrap the same way or it keys on the wrong device selection. */
function isLegacyOptions(
  config: StrategyConfig | LegacyStrategyConfig
): config is LegacyStrategyConfig {
  const options = (config as Partial<LegacyStrategyConfig>).options;
  return (
    Object.keys(config).length === 2 && typeof options === "object" && options !== null
  );
}

/**
 * Only rebuild the dashboard when what it renders for the detected devices
 * changes.
 *
 * HA regenerates a strategy dashboard whenever `hass.entities`/`devices`/`areas`
 * changes. Drawing a zone creates new `apollo_mmwave` zone sensors, which mutates
 * `hass.entities`; regenerating mid-draw would tear down the zone-mapper card
 * ("Subscription not found") and wipe the in-progress zone. Comparing the actual
 * detected-device key keeps "add a device, a tab appears" while ignoring that
 * churn. The zone sensors are attached to the radar device, but their ids
 * (`<base>_zone_N`, `<base>_zone_N_presence`) match no radar entity pattern, so
 * the device's base, capabilities and liveness, and with them the key, are
 * unchanged.
 *
 * The fast path must include `entities`: a freshly added ESPHome device lands
 * in the device registry *before* its entities/states register, so detection
 * fails at that moment. The follow-up updates only touch `hass.entities` — if
 * we short-circuited on `devices` alone, the new device's tab would never
 * appear until a manual page reload.
 */
export function shouldRegenerate(
  config: StrategyConfig | LegacyStrategyConfig,
  oldHass: HomeAssistant,
  newHass: HomeAssistant
): boolean {
  // Fast path: registry objects are replaced (not mutated) on registry
  // changes, so routine state churn (moving targets) short-circuits here.
  //
  // With one exception. A tab needs LIVE radar evidence, and liveness lives in
  // `hass.states`, which the registries never reflect. A dashboard opened
  // while the radars were still reconnecting after a Home Assistant restart
  // saw every one of them `unavailable`, drew none, and then never looked
  // again: the devices coming online touched states only. So an entity
  // crossing the available/unavailable line falls through to the full key.
  if (oldHass.devices === newHass.devices && oldHass.entities === newHass.entities) {
    if (!availabilityChanged(oldHass, newHass)) return false;
  }
  const cfg = isLegacyOptions(config) ? { ...config, ...config.options } : config;
  return radarDeviceKey(oldHass, cfg) !== radarDeviceKey(newHass, cfg);
}

/** True when an entity present in `newHass` became available or unavailable.
 *  Home Assistant replaces the state object of exactly the entities that
 *  changed, so unchanged ones are skipped on reference equality. Only ids in
 *  `newHass` are compared; a vanished state needs no check, because a removed
 *  registry entity keeps a restored "unavailable" state and deleting the
 *  registry entry replaces `hass.entities`, which bypasses this check. */
function availabilityChanged(oldHass: HomeAssistant, newHass: HomeAssistant): boolean {
  for (const id in newHass.states) {
    const next = newHass.states[id];
    const prev = oldHass.states[id];
    if (prev === next) continue;
    if (isLiveState(prev) !== isLiveState(next)) return true;
  }
  return false;
}

const EMPTY_VIEW = {
  title: "Apollo Radar Tuning",
  cards: [
    {
      type: "markdown",
      content:
        "No Apollo mmWave devices found. Make sure your MSR-1/MSR-2 (LD2410), " +
        "R-PRO-1 (LD2412 + LD2450), or MTR-1 (LD2450) is added to Home Assistant.",
    },
  ],
};

/** Shown instead of EMPTY_VIEW when the config names devices (`devices` or
 *  `device_id`) and none of them is in the device registry any more: replaced
 *  hardware with a new MAC, a re-add after Home Assistant's deleted-device
 *  window, or a hand-typed id. The radars may well be added and live, so the
 *  fix is the selection, not the device. */
const STALE_SELECTION_VIEW = {
  title: "Apollo Radar Tuning",
  cards: [
    {
      type: "markdown",
      content:
        "The dashboard's device selection points at devices that no longer exist " +
        "in Home Assistant. Open Settings > Devices & Services > Apollo mmWave > " +
        "Configure and clear or update Dashboard devices (leave it empty to show " +
        "every Apollo mmWave device automatically).",
    },
  ],
};

/**
 * View strategy: turns a single view into one sections view holding the
 * sections of every detected Apollo mmWave device (MSR-1/MSR-2 LD2410,
 * R-PRO-1 LD2412 + LD2450, MTR-1 LD2450). Usage in a view config:
 *   strategy:
 *     type: custom:apollo-radar-tuning
 */
class ApolloLd2410ViewStrategy extends HTMLElement {
  static shouldRegenerate = shouldRegenerate;

  static async generate(
    config: StrategyConfig,
    hass: HomeAssistant
  ): Promise<Record<string, any>> {
    return { type: "sections", sections: generateSections(hass, config) };
  }
}

/**
 * Dashboard strategy: builds a whole dashboard with one sections view (tab)
 * per detected Apollo mmWave device (MSR-1/MSR-2 LD2410, R-PRO-1 LD2412 +
 * LD2450, MTR-1 LD2450). Usage in a dashboard config:
 *   strategy:
 *     type: custom:apollo-radar-tuning
 */
class ApolloLd2410DashboardStrategy extends HTMLElement {
  static shouldRegenerate = shouldRegenerate;

  static async generate(
    config: StrategyConfig,
    hass: HomeAssistant
  ): Promise<Record<string, any>> {
    const views = generateViews(hass, config);
    // A selected device is rendered whenever it is in the registry, so an
    // explicit selection that yields no views means every selected id is gone.
    const empty =
      config.devices?.length || config.device_id ? STALE_SELECTION_VIEW : EMPTY_VIEW;
    return {
      title: "Apollo Radar Tuning",
      views: views.length ? views : [empty],
    };
  }
}

/**
 * Section strategy: a single grid section with the mmWave cards, for dropping
 * into an existing sections dashboard (add section → "Apollo Radar Tuning").
 * Pass `device_id` to limit it to one device; otherwise every detected device's
 * cards are included (each group starts with a help card naming the device).
 * Usage in a section config:
 *   strategy:
 *     type: custom:apollo-radar-tuning
 *     device_id: abc123...   # optional
 */
class ApolloRadarSectionStrategy extends HTMLElement {
  static shouldRegenerate = shouldRegenerate;

  static async generate(
    config: StrategyConfig,
    hass: HomeAssistant
  ): Promise<Record<string, any>> {
    return { type: "grid", cards: generateCards(hass, config) };
  }
}

registerElement("ll-strategy-view-apollo-radar-tuning", ApolloLd2410ViewStrategy);
registerElement(
  "ll-strategy-section-apollo-radar-tuning",
  ApolloRadarSectionStrategy
);
registerElement(
  "ll-strategy-dashboard-apollo-radar-tuning",
  ApolloLd2410DashboardStrategy
);

// Surface the dashboard strategy in HA's "New Dashboard → Community Dashboards"
// picker (HA 2026.5+), so users add the tuning dashboard with no YAML.
(window as any).customStrategies = (window as any).customStrategies || [];
if (
  !(window as any).customStrategies.some(
    (s: { type?: string }) => s.type === "apollo-radar-tuning"
  )
) {
  (window as any).customStrategies.push({
    type: "apollo-radar-tuning",
    strategyType: "dashboard",
    name: "Apollo Radar Tuning",
    description:
      "Auto-built tuning dashboard for Apollo radar devices " +
      "(MSR / LD2410, R-PRO / LD2412 + LD2450, MTR-1 / LD2450).",
    documentationURL: "https://github.com/ApolloAutomation/apollo-mmwave-main",
  });
}
