/**
 * The dashboard strategy's empty states. With no device selection an empty
 * dashboard means no radar was found; with an explicit selection it means
 * every selected id has left the device registry (replaced hardware, a re-add
 * after the deleted-device window, a hand-typed id), so the message has to
 * point at the selection instead of telling the user to add their radar.
 */

import { describe, it, expect } from "vitest";
import "../src/strategy";
import { strategyDevices, type StrategyConfig } from "../src/strategy-core";
import type { HomeAssistant } from "../src/types";

type DashboardStrategy = {
  generate(config: StrategyConfig, hass: HomeAssistant): Promise<Record<string, any>>;
};

const TYPE = "custom:apollo-radar-tuning";
const EMPTY_TEXT =
  "No Apollo mmWave devices found. Make sure your MSR-1/MSR-2 (LD2410), " +
  "R-PRO-1 (LD2412 + LD2450), or MTR-1 (LD2450) is added to Home Assistant.";

function dashboardStrategy(): DashboardStrategy {
  const ctor = customElements.get("ll-strategy-dashboard-apollo-radar-tuning");
  expect(ctor).toBeDefined();
  return ctor as unknown as DashboardStrategy;
}

const emptyHass: HomeAssistant = { states: {}, entities: {}, devices: {} };

/** One live MSR-2, found by auto-detection. */
function hassWithLiveRadar(): HomeAssistant {
  const eng = "switch.apollo_msr_2_m4c4dd_radar_engineering_mode";
  return {
    states: { [eng]: { entity_id: eng, state: "off", attributes: {} } },
    entities: { [eng]: { device_id: "dev1" } },
    devices: { dev1: { name: "Living Room MSR-2" } },
  };
}

function markdownOf(dashboard: Record<string, any>): string {
  expect(dashboard.views).toHaveLength(1);
  const card = dashboard.views[0].cards[0];
  expect(card.type).toBe("markdown");
  return card.content;
}

describe("dashboard strategy empty states", () => {
  it("explains a stale devices selection while a live radar exists", async () => {
    const hass = hassWithLiveRadar();
    // The radar is added and live: auto-detection would show it.
    expect(strategyDevices(hass, {})).toHaveLength(1);
    const dashboard = await dashboardStrategy().generate(
      { type: TYPE, devices: ["gone"] } as StrategyConfig,
      hass
    );
    const content = markdownOf(dashboard);
    expect(content).toContain("device selection");
    expect(content).toContain("Dashboard devices");
    expect(content).not.toContain("No Apollo mmWave devices found");
  });

  it("explains a stale device_id the same way", async () => {
    const dashboard = await dashboardStrategy().generate(
      { type: TYPE, device_id: "gone" } as StrategyConfig,
      hassWithLiveRadar()
    );
    expect(markdownOf(dashboard)).toContain("Dashboard devices");
  });

  it("keeps the original empty view when nothing is selected or found", async () => {
    const dashboard = await dashboardStrategy().generate(
      { type: TYPE } as StrategyConfig,
      emptyHass
    );
    expect(markdownOf(dashboard)).toBe(EMPTY_TEXT);
  });

  it("keeps the original empty view for an empty devices list", async () => {
    // An empty list means "show every device", the same as no selection.
    const dashboard = await dashboardStrategy().generate(
      { type: TYPE, devices: [] } as StrategyConfig,
      emptyHass
    );
    expect(markdownOf(dashboard)).toBe(EMPTY_TEXT);
  });

  it("renders the radar tabs when a selection or detection finds devices", async () => {
    const hass = hassWithLiveRadar();
    for (const config of [{ type: TYPE }, { type: TYPE, devices: ["dev1", "gone"] }]) {
      const dashboard = await dashboardStrategy().generate(config as StrategyConfig, hass);
      expect(dashboard.views).toHaveLength(1);
      expect(dashboard.views[0].title).toBe("Living Room MSR-2");
    }
  });
});
