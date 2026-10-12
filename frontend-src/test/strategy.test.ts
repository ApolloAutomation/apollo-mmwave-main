/**
 * The strategy elements Home Assistant looks up by tag: the view, section and
 * dashboard strategies and the shapes their generate() returns.
 *
 * The dashboard strategy's empty states. With no device selection an empty
 * dashboard means no radar was found; with an explicit selection it means
 * every selected id has left the device registry (replaced hardware, a re-add
 * after the deleted-device window, a hand-typed id), so the message has to
 * point at the selection instead of telling the user to add their radar.
 *
 * Also the "New dashboard" picker entry, whose description Home Assistant
 * shows verbatim, so it has to name every supported device family.
 */

import { describe, it, expect, vi } from "vitest";
import { shouldRegenerate } from "../src/strategy";
import {
  generateCards,
  generateSections,
  strategyDevices,
  type StrategyConfig,
} from "../src/strategy-core";
import type { HomeAssistant } from "../src/types";

type Strategy = {
  shouldRegenerate: unknown;
  generate(config: StrategyConfig, hass: HomeAssistant): Promise<Record<string, any>>;
};

const TYPE = "custom:apollo-radar-tuning";
const EMPTY_TEXT =
  "No Apollo mmWave devices found. Make sure your MSR-1/MSR-2 (LD2410), " +
  "R-PRO-1 (LD2412 + LD2450), or MTR-1 (LD2450) is added to Home Assistant.";

const VIEW_TAG = "ll-strategy-view-apollo-radar-tuning";
const SECTION_TAG = "ll-strategy-section-apollo-radar-tuning";
const DASHBOARD_TAG = "ll-strategy-dashboard-apollo-radar-tuning";

function strategyElement(tag: string): Strategy {
  const ctor = customElements.get(tag);
  expect(ctor).toBeDefined();
  return ctor as unknown as Strategy;
}

function dashboardStrategy(): Strategy {
  return strategyElement(DASHBOARD_TAG);
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

/** The live MSR-2 plus a live R-PRO-1 LD2412. */
function hassWithTwoRadars(): HomeAssistant {
  const hass = hassWithLiveRadar();
  const eng = "switch.apollo_r_pro_1_abcd_ld2412_engineering_mode";
  return {
    states: { ...hass.states, [eng]: { entity_id: eng, state: "off", attributes: {} } },
    entities: { ...hass.entities, [eng]: { device_id: "dev2" } },
    devices: { ...hass.devices, dev2: { name: "Office R-PRO-1" } },
  };
}

function markdownOf(dashboard: Record<string, any>): string {
  expect(dashboard.views).toHaveLength(1);
  const card = dashboard.views[0].cards[0];
  expect(card.type).toBe("markdown");
  return card.content;
}

describe("strategy elements", () => {
  const config = { type: TYPE } as StrategyConfig;

  it("defines the view, section and dashboard strategies with one regeneration hook", () => {
    for (const tag of [VIEW_TAG, SECTION_TAG, DASHBOARD_TAG]) {
      expect(strategyElement(tag).shouldRegenerate).toBe(shouldRegenerate);
    }
  });

  it("view strategy returns one sections view holding every device's sections", async () => {
    const view = strategyElement(VIEW_TAG);
    expect(await view.generate(config, emptyHass)).toEqual({
      type: "sections",
      sections: [],
    });
    const hass = hassWithTwoRadars();
    const result = await view.generate(config, hass);
    expect(result.type).toBe("sections");
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.sections).toEqual(generateSections(hass, config));
  });

  it("section strategy returns one grid section holding every device's cards", async () => {
    const section = strategyElement(SECTION_TAG);
    expect(await section.generate(config, emptyHass)).toEqual({ type: "grid", cards: [] });
    const hass = hassWithTwoRadars();
    const result = await section.generate(config, hass);
    expect(result.type).toBe("grid");
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.cards).toEqual(generateCards(hass, config));
  });

  it("dashboard strategy returns one sections view (tab) per device", async () => {
    const dashboard = await dashboardStrategy().generate(config, hassWithTwoRadars());
    expect(dashboard.title).toBe("Apollo Radar Tuning");
    expect(dashboard.views.map((v: any) => [v.type, v.title])).toEqual([
      ["sections", "Living Room MSR-2"],
      ["sections", "Office R-PRO-1"],
    ]);
  });
});

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

describe("dashboard picker entry", () => {
  type PickerEntry = {
    type?: string;
    strategyType?: string;
    name?: string;
    description?: string;
  };

  function pickerEntries(): PickerEntry[] {
    const all = (window as any).customStrategies as PickerEntry[] | undefined;
    return (all ?? []).filter((s) => s.type === "apollo-radar-tuning");
  }

  it("registers one dashboard strategy entry", () => {
    const entries = pickerEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].strategyType).toBe("dashboard");
    expect(entries[0].name).toBe("Apollo Radar Tuning");
  });

  it("names every supported device family, including MTR-1", () => {
    const description = pickerEntries()[0].description ?? "";
    for (const family of ["MSR", "LD2410", "R-PRO", "LD2412", "LD2450", "MTR-1"]) {
      expect(description).toContain(family);
    }
  });

  it("stays one entry when the bundle is evaluated again", async () => {
    // If the bundle is evaluated a second time (a second copy under a
    // different URL, say), the guard must keep the picker to one entry.
    vi.resetModules();
    const again = await import("../src/strategy");
    // A fresh module instance, so the registration code really ran again.
    expect(again.shouldRegenerate).not.toBe(shouldRegenerate);
    const entries = pickerEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: "apollo-radar-tuning",
      strategyType: "dashboard",
    });
    expect(entries[0].description).toContain("MTR-1");
    // The first definitions stay in place.
    expect(strategyElement(DASHBOARD_TAG).shouldRegenerate).toBe(shouldRegenerate);
  });
});
