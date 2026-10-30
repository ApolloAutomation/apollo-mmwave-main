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
import "../src/cards/setup-card";
import "../src/strategy";
import * as setupChecks from "../src/cards/setup-checks";
import * as gateSetupChecks from "../src/cards/gate-setup-checks";
import {
  LD2410_PROFILE,
  LD2412_PROFILE,
  PROFILES,
  rangeLimitTip,
  type RadarProfile,
} from "../src/profiles";
import { buildDeviceCards, type RadarDevice, type StrategyConfig } from "../src/strategy-core";
import { factoryResetRow } from "../src/panels/entity-rows";
import { ZoneMapCard } from "../src/zone-map/card";
import type { EntityMap, HomeAssistant } from "../src/types";

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
        "apollo-radar-setup-card",
      ].includes(c.type ?? "")
    );
    expect(strategies).toHaveLength(1);
    expect(cards).toHaveLength(4);
    const texts = [...strategies, ...cards].flatMap((e: { name: string; description: string }) => [
      e.name,
      e.description,
    ]);
    expect(copyProblems(texts)).toEqual([]);
    for (const e of [...strategies, ...cards]) expect(e.description).toContain("R PRO");
  });
});

describe("setup card copy", () => {
  const hass = (zoneType: string, multi: string): HomeAssistant => {
    const zone = "select.hall_zone_type";
    const sw = "switch.hall_multi_target_tracking";
    return {
      states: {
        [zone]: { entity_id: zone, state: zoneType, attributes: {} },
        [sw]: { entity_id: sw, state: multi, attributes: {} },
      },
      entities: { [zone]: { device_id: "mtr" }, [sw]: { device_id: "mtr" } },
      devices: { mtr: { name: "Hall" } },
    };
  };

  it("writes every line and button without em dashes", () => {
    const texts: string[] = Object.values(setupChecks as Record<string, unknown>).filter(
      (v): v is string => typeof v === "string"
    );
    expect(texts.length).toBeGreaterThan(5);
    for (const [zoneType, multi] of [
      ["Detection", "off"],
      ["Filter", "off"],
      ["Something new", "on"],
    ]) {
      const status = setupChecks.setupStatus(hass(zoneType, multi), "mtr");
      expect(status.kind).toBe("checked");
      if (status.kind !== "checked") continue;
      const fixes = status.problems.flatMap((p) => (p.fix ? [p.fix] : []));
      texts.push(...strings(status.problems), setupChecks.recommendedLine(fixes));
    }
    expect(copyProblems(texts)).toEqual([]);
  });
});

describe("gate setup card copy", () => {
  /** States for every id of a profile's map, with `overrides` on top. */
  type Overrides = (m: EntityMap) => Record<string, string>;
  const hass = (profile: RadarProfile, overrides: Overrides): HomeAssistant => {
    const m = profile.entityMap("hall");
    const states: HomeAssistant["states"] = {};
    for (const v of Object.values(m)) {
      for (const id of Array.isArray(v) ? v : [v]) {
        if (typeof id === "string") states[id] = { entity_id: id, state: "5", attributes: {} };
      }
    }
    if (m.gate_size) states[m.gate_size].state = "0.75m";
    for (const [id, state] of Object.entries(overrides(m))) {
      states[id] = { entity_id: id, state, attributes: { unit_of_measurement: "cm" } };
    }
    return { states, entities: {}, devices: {} };
  };

  it("writes every line and button without em dashes", () => {
    const texts: string[] = Object.values(gateSetupChecks as Record<string, unknown>).filter(
      (v): v is string => typeof v === "string"
    );
    expect(texts.length).toBeGreaterThan(3);
    const cases: [RadarProfile, Overrides][] = [
      [
        LD2410_PROFILE,
        (m) => ({
          [m.engineering_mode!]: "on",
          [m.radar_timeout!]: "unknown",
          [m.move_threshold[0]]: "unknown",
          [m.max_move_distance!]: "2",
          [m.max_still_distance!]: "unknown",
          [m.zone_1_start!]: "300",
          [m.end_zone_1!]: "100",
          [m.end_zone_2!]: "250",
          [m.end_zone_3!]: "200",
        }),
      ],
      [
        LD2410_PROFILE,
        (m) => ({
          [m.zone_1_start!]: "0",
          [m.end_zone_1!]: "50",
          [m.end_zone_2!]: "200",
          [m.end_zone_3!]: "300",
          [m.max_move_distance!]: "2",
          [m.max_still_distance!]: "2",
        }),
      ],
      [LD2412_PROFILE, (m) => ({ [m.max_move_distance!]: "4", [m.max_still_distance!]: "6" })],
      [LD2412_PROFILE, (m) => ({ [m.max_move_distance!]: "4", [m.max_still_distance!]: "4" })],
    ];
    for (const [profile, overrides] of cases) {
      const map = profile.entityMap("hall");
      const status = gateSetupChecks.gateSetupStatus(hass(profile, overrides), "hall", map, profile, "idle");
      expect(status.kind).toBe("checked");
      if (status.kind === "checked") {
        expect(status.problems.length).toBeGreaterThan(0);
        texts.push(...strings(status.problems));
      }
    }
    expect(copyProblems(texts)).toEqual([]);
  });
});

describe("controls and zone map copy", () => {
  it("asks before a factory reset without em dashes", () => {
    const texts = ["LD2410", "LD2412", "LD2450"].flatMap((chip) =>
      strings(factoryResetRow("button.hall_factory_reset", chip))
    );
    expect(texts).toContain(
      "Reset the LD2450 radar to its factory settings? It restarts and forgets its own settings."
    );
    expect(copyProblems(texts)).toEqual([]);
  });

  it("titles the m / ft switch without em dashes, for administrators and others", () => {
    const card: any = new ZoneMapCard();
    card.setConfig({ device_id: "hall" });
    const titles = (isAdmin: boolean): string[] => {
      card._hass = { user: { is_admin: isAdmin }, states: {} };
      card._renderUnitSwitch();
      return ["btnUnitM", "btnUnitFt"].map((id) => card.shadowRoot.getElementById(id).title);
    };
    const texts = [...titles(true), ...titles(false)];
    expect(texts).toEqual([
      "Show this radar's map in meters for everyone",
      "Show this radar's map in feet for everyone",
      "Show the map in meters",
      "Show the map in feet",
    ]);
    expect(copyProblems(texts)).toEqual([]);
  });
});
