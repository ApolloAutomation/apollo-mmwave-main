/**
 * User-visible copy. Every tip, help card, empty dashboard and picker entry
 * the frontend writes itself is US English with no em dash (U+2014), and
 * names the R PRO-1 the way Apollo spells it. Device names, entity ids and
 * model strings ("R-PRO-1-W") are data, not copy, so the fixtures below use
 * names that cannot trip the checks.
 */

import { describe, it, expect } from "vitest";
import "../src/cards/distance-card";
import "../src/cards/gate-energy-card";
import "../src/cards/calibrate-card";
import "../src/strategy";
import { LD2410_PROFILE, LD2412_PROFILE, PROFILES, rangeLimitTip } from "../src/profiles";
import { buildDeviceCards, type RadarDevice, type StrategyConfig } from "../src/strategy-core";
import type { HomeAssistant } from "../src/types";

const EM_DASH = "\u2014";

/** Every string reachable from `value`, depth first. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

/** The copy rules each string must keep, as readable failures. */
function copyProblems(texts: string[]): string[] {
  const problems: string[] = [];
  for (const t of texts) {
    if (t.includes(EM_DASH)) problems.push(`em dash: ${t}`);
    if (/R-PRO-1\b/.test(t)) problems.push(`R-PRO-1 spelling: ${t}`);
    if (/\bafterwards\b/i.test(t)) problems.push(`afterwards: ${t}`);
  }
  return problems;
}

const emptyHass: HomeAssistant = { states: {}, entities: {}, devices: {} };

describe("profile tips", () => {
  it.each(PROFILES.map((p) => [p.label, p] as const))(
    "keeps the %s labels and tips free of em dashes",
    (_label, profile) => {
      const texts = [
        profile.label,
        ...profile.maxBarLabels,
        ...(profile.maxBarTips ?? []),
        ...profile.rangeLabels,
        profile.gateSizeLabel,
        profile.rangeTip,
        profile.gateTip,
        rangeLimitTip(profile.label),
      ];
      expect(texts.every((t) => t.length > 0)).toBe(true);
      expect(copyProblems(texts)).toEqual([]);
    }
  );
});

describe("help card builders", () => {
  const ld2410: RadarDevice = {
    deviceId: "msr",
    base: "apollo_msr_2_abc123",
    name: "Den",
    profile: LD2410_PROFILE,
    ld2450: false,
    online: true,
  };
  const ld2412: RadarDevice = {
    deviceId: "rpro",
    base: "apollo_r_pro_1_w_abc123",
    name: "Office",
    profile: LD2412_PROFILE,
    ld2450: true,
    online: true,
  };
  const zoneOnly: RadarDevice = {
    deviceId: "mtr",
    base: "apollo_mtr_1_abc123",
    name: "Hall",
    ld2450: true,
    online: true,
  };
  const nothingDetected: RadarDevice = {
    deviceId: "mystery",
    base: "garage_sensor",
    name: "Garage",
    ld2450: false,
    online: false,
  };
  const DEVICES: [string, RadarDevice][] = [
    ["an LD2410", ld2410],
    ["an offline LD2410", { ...ld2410, online: false }],
    ["an LD2412 with an LD2450", ld2412],
    ["an offline LD2412 with an LD2450", { ...ld2412, online: false }],
    ["a zone-only LD2450", zoneOnly],
    ["an offline zone-only LD2450", { ...zoneOnly, online: false }],
    ["a selected device with nothing detectable", nothingDetected],
  ];

  it.each(DEVICES)("writes %s tab without em dashes", (_kind, dev) => {
    const cards = buildDeviceCards(emptyHass, dev);
    const markdown = cards.filter((c) => c.type === "markdown");
    expect(markdown.length).toBeGreaterThan(0);
    expect(copyProblems(strings(cards))).toEqual([]);
  });

  it("joins the device name to the zone-only and nothing-detected help with punctuation", () => {
    expect(buildDeviceCards(emptyHass, zoneOnly)[0].content).toMatch(
      /^\*\*Hall\*\*, Apollo mmWave \(LD2450 tracking radar\)\./
    );
    expect(buildDeviceCards(emptyHass, nothingDetected)[0].content).toMatch(
      /^\*\*Garage\*\*: no radar data available right now\./
    );
  });
});

describe("dashboard empty states and picker entries", () => {
  type Strategy = {
    generate(config: StrategyConfig, hass: HomeAssistant): Promise<Record<string, any>>;
  };

  function dashboardStrategy(): Strategy {
    const ctor = customElements.get("ll-strategy-dashboard-apollo-radar-tuning");
    expect(ctor).toBeDefined();
    return ctor as unknown as Strategy;
  }

  it("writes both empty dashboards without em dashes", async () => {
    const config = { type: "custom:apollo-radar-tuning" } as StrategyConfig;
    const none = await dashboardStrategy().generate(config, emptyHass);
    const stale = await dashboardStrategy().generate({ ...config, devices: ["gone"] }, emptyHass);
    expect(copyProblems([...strings(none), ...strings(stale)])).toEqual([]);
    expect(strings(none).join(" ")).toContain("R PRO-1 (LD2412 + LD2450)");
  });

  it("names and describes every picker entry without em dashes", () => {
    const strategies = ((window as any).customStrategies ?? []).filter(
      (s: { type?: string }) => s.type === "apollo-radar-tuning"
    );
    const cards = ((window as any).customCards ?? []).filter((c: { type?: string }) =>
      [
        "apollo-radar-distance-card",
        "apollo-radar-gate-energy-card",
        "apollo-radar-calibrate-card",
      ].includes(c.type ?? "")
    );
    expect(strategies).toHaveLength(1);
    expect(cards).toHaveLength(3);
    const texts = [...strategies, ...cards].flatMap((e: { name: string; description: string }) => [
      e.name,
      e.description,
    ]);
    expect(copyProblems(texts)).toEqual([]);
    for (const e of [...strategies, ...cards]) expect(e.description).toContain("R PRO");
  });
});
