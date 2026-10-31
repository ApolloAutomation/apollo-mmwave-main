import { describe, it, expect } from "vitest";
import {
  detectRadarDevices,
  buildDeviceCards,
  buildDeviceSections,
  deviceView,
  generateCards,
  generateSections,
  generateViews,
  markdownText,
  BUILT_IN_ZONES_NOTE,
  BUILT_IN_ZONES_TITLE,
  DEVICE_TITLE,
  LD2450_TIMEOUT_NOTE,
  SUPPORT_FILE_NOTE,
  WEAK_WIFI_DBM,
  WEAK_WIFI_NOTE,
  ZONE_PRESENCE_HINT,
  ZONE_PRESENCE_TITLE,
  zoneConfigNote,
  type RadarDevice,
} from "../src/strategy-core";
import { LD2410_PROFILE, LD2412_PROFILE } from "../src/profiles";
import type { HomeAssistant, HassEntity } from "../src/types";

const base = "apollo_msr_2_m4c4dd";
const m410 = LD2410_PROFILE.entityMap(base);

/** The MSR-2 fixture's entities: one of each card's rows. */
const DEVICE_IDS = [
  m410.engineering_mode!,
  m410.radar_timeout!,
  m410.zone_1_start!,
  m410.max_move_distance!,
  m410.move_threshold[0],
  m410.radar_target!,
  m410.detection_distance!,
];

/** One device (`dev1` by default) owning `ids`, each with a "0" state. */
function hassWithIds(
  ids: string[],
  device: HomeAssistant["devices"][string] = { name: "Living Room MSR-2" },
  deviceId = "dev1"
): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  const entities: Record<string, { device_id?: string }> = {};
  for (const id of ids) {
    states[id] = { entity_id: id, state: "0", attributes: {} };
    entities[id] = { device_id: deviceId };
  }
  return { states, entities, devices: { [deviceId]: device } };
}

function deviceHass(): HomeAssistant {
  return hassWithIds(DEVICE_IDS);
}

/** The MSR-2 fixture without the given entities. */
function deviceHassWithout(...drop: string[]): HomeAssistant {
  return hassWithIds(DEVICE_IDS.filter((id) => !drop.includes(id)));
}

/** Each section's cards, by title (or by type for untitled cards). */
function layout(sections: Record<string, any>[]): string[][] {
  return sections.map((s) => s.cards.map((c: any) => c.title ?? c.type));
}

const DISTANCE_CARD = "custom:apollo-radar-distance-card";
const GATE_SETUP = "custom:apollo-radar-setup-card";

const ld2410Dev: RadarDevice = {
  deviceId: "dev1",
  base,
  name: "Living Room MSR-2",
  profile: LD2410_PROFILE,
  ld2450: false,
  online: true,
};

describe("detectRadarDevices", () => {
  it("finds an LD2410 device and tags its profile", () => {
    const devices = detectRadarDevices(deviceHass());
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ deviceId: "dev1", base });
    expect(devices[0].profile?.key).toBe("ld2410");
  });

  it("detects an LD2412 (R-PRO) device by its ld2412 entities", () => {
    const b = "apollo_r_pro_1_abcd";
    const id = `switch.${b}_ld2412_engineering_mode`;
    const hass: HomeAssistant = {
      states: { [id]: { entity_id: id, state: "off", attributes: {} } },
      entities: { [id]: { device_id: "rpro" } },
      devices: { rpro: { name: "Office R-PRO-1" } },
    };
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].profile?.key).toBe("ld2412");
    expect(devices[0].ld2450).toBe(false);
  });

  it("ignores non-radar devices", () => {
    const id = "sensor.kitchen_temperature";
    const hass: HomeAssistant = {
      states: { [id]: { entity_id: id, state: "20", attributes: {} } },
      entities: { [id]: { device_id: "devX" } },
      devices: { devX: { name: "Thermometer" } },
    };
    expect(detectRadarDevices(hass)).toHaveLength(0);
  });
});

describe("buildDeviceCards", () => {
  const cards = buildDeviceCards(deviceHass(), ld2410Dev, "in");

  it("includes both custom chart cards bound to the device base name", () => {
    const types = cards.map((c: any) => c.type);
    expect(types).toContain("custom:apollo-radar-distance-card");
    expect(types).toContain("custom:apollo-radar-gate-energy-card");
    const distance = cards.find(
      (c: any) => c.type === "custom:apollo-radar-distance-card"
    );
    expect(distance).toMatchObject({ device_base_name: base, distance_unit: "in" });
  });

  it("leaves distance_unit off the distance card when the config sets none", () => {
    const byCards = buildDeviceCards(deviceHass(), ld2410Dev).find(
      (c: any) => c.type === DISTANCE_CARD
    );
    expect(byCards).toBeDefined();
    expect(byCards).not.toHaveProperty("distance_unit");
    const byView = generateViews(deviceHass(), {})[0]
      .sections.flatMap((s: any) => s.cards)
      .find((c: any) => c.type === DISTANCE_CARD);
    expect(byView).toBeDefined();
    expect(byView).not.toHaveProperty("distance_unit");
  });

  it("titles entity cards with the device's chip label", () => {
    const titles = cards
      .filter((c: any) => c.type === "entities")
      .map((c: any) => c.title);
    expect(titles).toContain("LD2410 Controls");
  });

  it("includes a markdown help card linking the wiki", () => {
    const help = cards.find((c: any) => c.type === "markdown") as any;
    expect(help.content).toContain(`[Full tuning guide →](${LD2410_PROFILE.wikiUrl})`);
  });

  it("starts the help card with the Start here checklist", () => {
    const help = cards.find((c: any) => c.type === "markdown") as any;
    expect(help.content).toContain("Start here");
    expect(help.content).toContain("Calibrate with empty room");
    expect(help.content).toContain("Max Move Gate / Max Still Gate");
    expect(help.content).toContain("Radar Timeout");
    expect(help.content).not.toContain("\u2014");
  });

  it("places the gate setup and calibrate cards right after the help card with the device ids", () => {
    expect(cards[0].type).toBe("markdown");
    expect(cards[1]).toEqual({ type: GATE_SETUP, device_id: "dev1", radar: "gate" });
    expect(cards[2]).toMatchObject({
      type: "custom:apollo-radar-calibrate-card",
      device_id: "dev1",
      device_base_name: base,
      title: "Auto-calibrate",
    });
    expect(cards[2]).not.toHaveProperty("calibration");
  });

  it("passes the strategy's calibration block through to the card", () => {
    const calibration = { duration_s: 120, settle_s: 0 };
    const withOptions = buildDeviceCards(deviceHass(), ld2410Dev, "in", calibration);
    const card = withOptions.find(
      (c: any) => c.type === "custom:apollo-radar-calibrate-card"
    ) as any;
    expect(card.calibration).toEqual(calibration);
    const fromConfig = generateCards(deviceHass(), { calibration }).find(
      (c: any) => c.type === "custom:apollo-radar-calibrate-card"
    ) as any;
    expect(fromConfig.calibration).toEqual(calibration);
  });
});

describe("tuning notes", () => {
  const titles = (hass: HomeAssistant) =>
    buildDeviceCards(hass, ld2410Dev).map((c: any) => c.title);
  const notes = (hass: HomeAssistant) =>
    buildDeviceCards(hass, ld2410Dev)
      .filter((c: any) => c.type === "markdown")
      .map((c: any) => c.content);

  it("adds the range tip only under a Detection Range card", () => {
    expect(titles(deviceHass())).toContain("LD2410 Detection Range");
    expect(notes(deviceHass())).toContain(LD2410_PROFILE.rangeTip("about 0.75 m"));

    const noRange = deviceHassWithout(m410.radar_timeout!, m410.max_move_distance!);
    expect(titles(noRange)).not.toContain("LD2410 Detection Range");
    expect(notes(noRange)).not.toContain(LD2410_PROFILE.rangeTip("about 0.75 m"));
  });

  it("adds the gate tip only with a threshold card", () => {
    expect(titles(deviceHass())).toContain("LD2410 Move Thresholds");
    expect(notes(deviceHass())).toContain(LD2410_PROFILE.gateTip);

    const noThresholds = deviceHassWithout(m410.move_threshold[0]);
    expect(titles(noThresholds)).not.toContain("LD2410 Move Thresholds");
    expect(notes(noThresholds)).not.toContain(LD2410_PROFILE.gateTip);

    // A still threshold alone is enough.
    const stillOnly = hassWithIds([
      ...DEVICE_IDS.filter((id) => id !== m410.move_threshold[0]),
      m410.still_threshold[0],
    ]);
    expect(titles(stillOnly)).toContain("LD2410 Still Thresholds");
    expect(notes(stillOnly)).toContain(LD2410_PROFILE.gateTip);
  });
});

describe("occupancy history card", () => {
  const m = LD2410_PROFILE.entityMap(base);
  const state = (id: string): HassEntity => ({
    entity_id: id,
    state: "off",
    attributes: {},
  });
  const historyCard = (hass: HomeAssistant) =>
    buildDeviceCards(hass, ld2410Dev).find((c: any) => c.type === "history-graph") as any;

  it("lists only the registered occupancy sensors that have a state", () => {
    const registered = [
      m.engineering_mode!,
      m.radar_target!,
      m.zone_1_occupancy!,
      m.zone_2_occupancy!,
      m.zone_3_occupancy!,
    ];
    const live = [m.engineering_mode!, m.radar_target!, m.zone_2_occupancy!];
    const hass: HomeAssistant = {
      states: Object.fromEntries(live.map((id) => [id, state(id)])),
      entities: Object.fromEntries(registered.map((id) => [id, { device_id: "dev1" }])),
      devices: { dev1: { name: "Living Room MSR-2" } },
    };
    expect(historyCard(hass)).toEqual({
      type: "history-graph",
      title: "LD2410 Occupancy History",
      hours_to_show: 24,
      entities: [
        { entity: m.radar_target, name: "Detected" },
        { entity: m.zone_2_occupancy, name: "Zone 2" },
      ],
    });
  });

  it("filters the constructed ids by state when the registry has no entities", () => {
    const live = [m.radar_target!, m.zone_3_occupancy!];
    const hass: HomeAssistant = {
      states: Object.fromEntries(live.map((id) => [id, state(id)])),
      entities: {},
      devices: { dev1: { name: "Living Room MSR-2" } },
    };
    expect(historyCard(hass).entities).toEqual([
      { entity: m.radar_target, name: "Detected" },
      { entity: m.zone_3_occupancy, name: "Zone 3" },
    ]);
  });

  it("is left out when no occupancy sensor has a state", () => {
    const registered = [m.engineering_mode!, m.radar_target!, m.zone_1_occupancy!];
    const hass: HomeAssistant = {
      states: { [m.engineering_mode!]: state(m.engineering_mode!) },
      entities: Object.fromEntries(registered.map((id) => [id, { device_id: "dev1" }])),
      devices: { dev1: { name: "Living Room MSR-2" } },
    };
    expect(historyCard(hass)).toBeUndefined();
  });

  it("is left out of the sections when the device has no occupancy sensor", () => {
    const sections = buildDeviceSections(deviceHassWithout(m410.radar_target!), ld2410Dev);
    const types = sections.flatMap((s) => s.cards.map((c: any) => c.type));
    expect(types).not.toContain("history-graph");
    // Its column held only the history card, so it is dropped entirely.
    expect(sections).toHaveLength(3);
  });
});

describe("calibrate card placement in sections", () => {
  it("follows the help and gate setup cards at the top of the first section for an LD2410 device", () => {
    const sections = buildDeviceSections(deviceHass(), ld2410Dev, "in");
    expect(sections[0].cards[0].type).toBe("markdown");
    expect(sections[0].cards[1]).toEqual({ type: GATE_SETUP, device_id: "dev1", radar: "gate" });
    expect(sections[0].cards[2].type).toBe("custom:apollo-radar-calibrate-card");
  });

  it("follows the help and gate setup cards at the top of the first section for an LD2412 device", () => {
    const b = "apollo_r_pro_1_abcd";
    const id = `switch.${b}_ld2412_engineering_mode`;
    const hass: HomeAssistant = {
      states: { [id]: { entity_id: id, state: "off", attributes: {} } },
      entities: { [id]: { device_id: "rpro" } },
      devices: { rpro: { name: "Office R-PRO-1" } },
    };
    const dev = detectRadarDevices(hass)[0];
    const sections = buildDeviceSections(hass, dev);
    expect(sections[0].cards[0].type).toBe("markdown");
    expect(sections[0].cards[1]).toEqual({ type: GATE_SETUP, device_id: "rpro", radar: "gate" });
    expect(sections[0].cards[2]).toMatchObject({
      type: "custom:apollo-radar-calibrate-card",
      device_id: "rpro",
      device_base_name: b,
    });
  });

  it("is absent for an LD2450-only device (MTR-1)", () => {
    const x = "sensor.apollo_mtr_1_abcd_target_1_x";
    const hass: HomeAssistant = {
      states: { [x]: { entity_id: x, state: "100", attributes: {} } },
      entities: { [x]: { device_id: "mtr" } },
      devices: { mtr: { name: "Hall MTR-1" } },
    };
    const dev = detectRadarDevices(hass)[0];
    expect(dev.profile).toBeUndefined();
    const types = buildDeviceCards(hass, dev).map((c: any) => c.type);
    expect(types).not.toContain("custom:apollo-radar-calibrate-card");
    const sectionTypes = buildDeviceSections(hass, dev).flatMap((s) =>
      s.cards.map((c: any) => c.type)
    );
    expect(sectionTypes).not.toContain("custom:apollo-radar-calibrate-card");
  });

  it("keeps the card on an offline gate radar so it can render its own offline state", () => {
    const offline: RadarDevice = { ...ld2410Dev, online: false };
    const sections = buildDeviceSections(deviceHass(), offline, "in");
    expect(sections[0].cards[2].type).toBe("custom:apollo-radar-calibrate-card");
  });
});

describe("buildDeviceSections column layout", () => {
  const rproBase = "apollo_r_pro_1_abcd";

  /** An LD2412 with one of each card's rows; optionally its LD2450 too. */
  function ld2412Hass(
    device: HomeAssistant["devices"][string],
    withLd2450: boolean
  ): HomeAssistant {
    const m = LD2412_PROFILE.entityMap(rproBase);
    const ids = [
      m.engineering_mode!,
      m.radar_timeout!,
      m.max_move_distance!,
      m.move_threshold[0],
      m.radar_target!,
    ];
    if (withLd2450) ids.push(`sensor.${rproBase}_ld2450_target_1_x`);
    return hassWithIds(ids, device, "rpro");
  }

  const LD2412_COLUMN_1 = [
    "markdown",
    GATE_SETUP,
    "Auto-calibrate",
    "LD2412 Controls",
    "LD2412 Target / Occupancy",
  ];
  const LD2412_TUNING = [
    ["LD2412 Distances", "LD2412 Detection Range", "markdown"],
    ["LD2412 Gate Energy", "LD2412 Move Thresholds", "markdown"],
  ];

  it("lays an MSR-2 out in four grid columns, occupancy in column 2", () => {
    const sections = buildDeviceSections(deviceHass(), ld2410Dev);
    for (const section of sections) expect(section.type).toBe("grid");
    expect(layout(sections)).toEqual([
      [
        "markdown",
        GATE_SETUP,
        "Auto-calibrate",
        "LD2410 Controls",
        "LD2410 Zone Config",
        "markdown",
      ],
      [
        "LD2410 Distances",
        "LD2410 Detection Range",
        "markdown",
        "LD2410 Target / Occupancy",
      ],
      ["LD2410 Gate Energy", "LD2410 Move Thresholds", "markdown"],
      // The Device card ends the tab. This fixture has none of its entities,
      // so it is the titled support note alone.
      ["LD2410 Occupancy History", "Device"],
    ]);
  });

  it("moves occupancy into column 1 on a DIY LD2412, which has no Zone Config", () => {
    const hass = ld2412Hass({ name: "Office radar" }, false);
    const [dev] = detectRadarDevices(hass);
    expect(dev.profile?.key).toBe("ld2412");
    expect(dev.ld2450).toBe(false);
    const sections = buildDeviceSections(hass, dev);
    for (const section of sections) expect(section.type).toBe("grid");
    expect(layout(sections)).toEqual([
      LD2412_COLUMN_1,
      ...LD2412_TUNING,
      ["LD2412 Occupancy History", "Device"],
    ]);
  });

  it("puts the Zone Map sections before the threshold cards on an R-PRO-1", () => {
    const hass = ld2412Hass(
      { name: "Office R-PRO-1", manufacturer: "ApolloAutomation", model: "R-PRO-1-W" },
      true
    );
    const [dev] = detectRadarDevices(hass);
    expect(dev.ld2450).toBe(true);
    const sections = buildDeviceSections(hass, dev);
    // Section order is a phone's reading order: column 1, then the zone map
    // and its LD2450 cards, then the LD2412's tuning. This fixture has only a
    // target sensor, so there is no setup card and only the zone presence
    // hint. The history covers both radars, so it names neither.
    expect(sections).toHaveLength(6);
    expect(layout([sections[0]])).toEqual([LD2412_COLUMN_1]);
    expect(sections[1].type).toBe("grid");
    expect(sections[1].cards).toHaveLength(2);
    expect(sections[1].cards[0]).toEqual({ type: "heading", heading: "Zone Map" });
    expect(sections[1].cards[1]).toMatchObject({
      type: "custom:apollo-radar-zone-map-card",
      device_id: "rpro",
    });
    expect(sections[2].type).toBe("grid");
    expect(sections[2].cards).toEqual([
      { type: "markdown", title: ZONE_PRESENCE_TITLE, content: ZONE_PRESENCE_HINT },
    ]);
    expect(layout(sections.slice(3))).toEqual([
      ...LD2412_TUNING,
      ["Occupancy History", "Device"],
    ]);
  });

  it("puts the offline note and the wiki link on an offline MSR-2's help card", () => {
    const live = hassWithIds(DEVICE_IDS, {
      name: "Living Room MSR-2",
      manufacturer: "ApolloAutomation",
      model: "MSR-2",
    });
    const states = Object.fromEntries(
      Object.keys(live.states).map((id) => [
        id,
        { entity_id: id, state: "unavailable", attributes: {} },
      ])
    );
    const hass = { ...live, states };
    const [dev] = detectRadarDevices(hass);
    expect(dev.profile?.key).toBe("ld2410");
    expect(dev.online).toBe(false);
    const [help, setup] = buildDeviceSections(hass, dev)[0].cards;
    // The setup card stays on an offline radar: it shows its own offline line.
    expect(setup).toEqual({ type: GATE_SETUP, device_id: "dev1", radar: "gate" });
    expect(help.type).toBe("markdown");
    expect(help.content).toContain("**Offline right now.**");
    expect(help.content).toContain(LD2410_PROFILE.wikiUrl);
  });
});

describe("device names in the help card", () => {
  const NAME = "Office {{ states('x') }} {#c#} {%d%} *1* _2_ [a](b) `c`";

  it("shows every character as typed and starts no template tag", () => {
    const escaped = markdownText(NAME);
    expect(escaped).not.toMatch(/\{[{%#]/);
    expect(escaped.replace(/\\(.)/g, "$1")).toBe(NAME);
    expect(markdownText("Living Room 2")).toBe("Living Room 2");
    expect(markdownText("MSR-2")).toBe("MSR\\-2");
  });

  it("escapes the name on every kind of help card", () => {
    const devs: RadarDevice[] = [
      { ...ld2410Dev, name: NAME },
      { ...ld2410Dev, name: NAME, profile: undefined, ld2450: true },
      { ...ld2410Dev, name: NAME, profile: undefined, ld2450: false, online: false },
    ];
    for (const dev of devs) {
      const help = buildDeviceCards(deviceHass(), dev).find(
        (c: any) => c.type === "markdown"
      ) as any;
      expect(help.content.startsWith(`**${markdownText(NAME)}**`)).toBe(true);
      expect(help.content).not.toMatch(/\{[{%#]/);
    }
  });
});

describe("profile tips", () => {
  it("point the gate tip at the calibrate card and say what the timeout holds in the range tip", () => {
    for (const profile of [LD2410_PROFILE, LD2412_PROFILE]) {
      expect(profile.gateTip).toContain("Calibrate with empty room");
      expect(profile.rangeTip("about 0.75 m")).toContain("Each gate is about 0.75 m deep.");
      expect(profile.rangeTip("about 2.5 ft")).toContain("Each gate is about 2.5 ft deep.");
    }
    expect(LD2410_PROFILE.rangeTip("about 0.75 m")).toContain(
      "**Radar Timeout** is how long **Radar Target** stays on after the radar last detects someone"
    );
    expect(LD2412_PROFILE.rangeTip("about 0.75 m")).toContain(
      "**Radar Timeout** is how long **LD2412 Presence** (Radar Target) stays on"
    );
  });

  it("never send users to the gate size control, which ships hidden", () => {
    for (const profile of [LD2410_PROFILE, LD2412_PROFILE]) {
      expect(profile.rangeTip("about 0.75 m")).not.toContain(profile.gateSizeLabel);
    }
  });

  it("link the help card to the dashboard's wiki tuning guide, the LD2412 to the R PRO-1 copy's section", () => {
    // The LD2410 profile serves both the MSR-1 and MSR-2, so it opens the
    // general guide; the LD2412 only exists on the R PRO-1, so it opens that
    // sensor's own copy of the guide, which keeps the wiki sidebar on the R PRO-1.
    expect(LD2410_PROFILE.wikiUrl).toBe(
      "https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard/"
    );
    expect(LD2412_PROFILE.wikiUrl).toBe(
      "https://wiki.apolloautomation.com/products/rpro1/setup/apollo-mmwave-dashboard/#r-pro-1-and-its-ld2412-radar"
    );
  });
});

describe("LD2412 gate count", () => {
  it("builds 14 gates (g00..g13) in the entity map", () => {
    const m = LD2412_PROFILE.entityMap("apollo_r_pro_1_abcd");
    expect(m.move_threshold).toHaveLength(14);
    expect(m.move_threshold[0]).toBe(
      "number.apollo_r_pro_1_abcd_ld2412_g00_move_threshold"
    );
    expect(m.move_threshold[13]).toBe(
      "number.apollo_r_pro_1_abcd_ld2412_g13_move_threshold"
    );
  });
});

describe("deviceView / generateViews", () => {
  const view = deviceView(deviceHass(), ld2410Dev, "in");

  it("is a sections view titled with the device name", () => {
    expect(view).toMatchObject({
      title: "Living Room MSR-2",
      path: base,
      type: "sections",
    });
  });

  it("groups cards into multiple column sections", () => {
    expect(view.sections.length).toBeGreaterThan(1);
    for (const section of view.sections) {
      expect(section.type).toBe("grid");
      expect(section.cards.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("produces one view (tab) per detected device", () => {
    expect(generateViews(deviceHass(), {})).toHaveLength(1);
  });

  it("gives three radars sharing one base three distinct paths", () => {
    // Three R-PRO-1s renamed to the same name with "rename entity ids"
    // ticked: HA's `_2`/`_3` dedup tails are stripped with the suffix, so
    // every base is `office`. Later tabs get their device id appended.
    const ids: Record<string, string> = {
      "switch.office_ld2412_engineering_mode": "a",
      "switch.office_ld2412_engineering_mode_2": "b",
      "switch.office_ld2412_engineering_mode_3": "c",
    };
    const hass: HomeAssistant = {
      states: Object.fromEntries(
        Object.keys(ids).map((id) => [id, { entity_id: id, state: "off", attributes: {} }])
      ),
      entities: Object.fromEntries(
        Object.entries(ids).map(([id, deviceId]) => [id, { device_id: deviceId }])
      ),
      devices: { a: { name: "Office" }, b: { name: "Office" }, c: { name: "Office" } },
    };
    expect(detectRadarDevices(hass).map((d) => d.base)).toEqual([
      "office",
      "office",
      "office",
    ]);
    expect(generateViews(hass, {}).map((v) => v.path)).toEqual([
      "office",
      "office_b",
      "office_c",
    ]);
  });

  it("falls back to the device id for a registry MSR-2 renamed beyond recognition", () => {
    // No entity id yields a base, so the device id is the base: the view
    // path and the cards' device_base_name.
    const renamed = "sensor.den_motion_distance";
    const hass: HomeAssistant = {
      states: { [renamed]: { entity_id: renamed, state: "42", attributes: {} } },
      entities: { [renamed]: { device_id: "msr" } },
      devices: {
        msr: { name: "Den MSR-2", manufacturer: "ApolloAutomation", model: "MSR-2" },
      },
    };
    const [dev] = detectRadarDevices(hass);
    expect(dev.profile?.key).toBe("ld2410");
    expect(dev.base).toBe(dev.deviceId);
    expect(dev.base).toBe("msr");
    expect(generateViews(hass, {}).map((v) => v.path)).toEqual(["msr"]);
    const distance = buildDeviceCards(hass, dev).find(
      (c: any) => c.type === DISTANCE_CARD
    );
    expect(distance).toMatchObject({ device_id: "msr", device_base_name: "msr" });
  });
});

describe("generateCards (section strategy)", () => {
  it("returns a flat card list for all detected devices", () => {
    const cards = generateCards(deviceHass(), {});
    expect(cards.length).toBeGreaterThan(1);
    // Flat list of cards, not sections.
    for (const card of cards) expect(card.type).toBeDefined();
    expect(cards.some((c) => c.type === "grid")).toBe(false);
  });

  it("limits to one device when device_id is set", () => {
    expect(generateCards(deviceHass(), { device_id: "nope" })).toHaveLength(0);
    expect(
      generateCards(deviceHass(), { device_id: "dev1" }).length
    ).toBeGreaterThan(1);
  });
});

describe("generateSections (view strategy)", () => {
  /** The MSR-2 fixture plus a live R-PRO-1 LD2412 on `rpro`. */
  function twoRadarHass(): HomeAssistant {
    const hass = deviceHass();
    const eng = "switch.apollo_r_pro_1_abcd_ld2412_engineering_mode";
    return {
      states: { ...hass.states, [eng]: { entity_id: eng, state: "off", attributes: {} } },
      entities: { ...hass.entities, [eng]: { device_id: "rpro" } },
      devices: { ...hass.devices, rpro: { name: "Office R-PRO-1" } },
    };
  }

  it("flattens every device's sections into one list, in device order", () => {
    const hass = twoRadarHass();
    const [msr, rpro] = detectRadarDevices(hass);
    expect([msr.deviceId, rpro.deviceId]).toEqual(["dev1", "rpro"]);
    const sections = generateSections(hass, {});
    expect(sections).toEqual([
      ...buildDeviceSections(hass, msr),
      ...buildDeviceSections(hass, rpro),
    ]);
    for (const section of sections) expect(section.type).toBe("grid");
  });

  it("limits to one device when device_id is set", () => {
    const hass = twoRadarHass();
    const rpro = detectRadarDevices(hass)[1];
    expect(generateSections(hass, { device_id: "rpro" })).toEqual(
      buildDeviceSections(hass, rpro)
    );
    expect(generateSections(hass, { device_id: "nope" })).toEqual([]);
  });
});

describe("LD2450 zone mapping", () => {
  function ld2450Hass(extra: Record<string, HassEntity> = {}): {
    hass: HomeAssistant;
    base: string;
  } {
    const b = "apollo_r_pro_1_abcd";
    const x = `sensor.${b}_ld2450_target_1_x`;
    const states: Record<string, HassEntity> = {
      [x]: { entity_id: x, state: "100", attributes: {} },
      ...extra,
    };
    const entities: Record<string, { device_id?: string }> = {};
    for (const id of Object.keys(states)) entities[id] = { device_id: "rpro" };
    return {
      hass: { states, entities, devices: { rpro: { name: "Office R-PRO-1" } } },
      base: b,
    };
  }

  it("detects an LD2450-only device (e.g. MTR-1) with no tuning profile", () => {
    const { hass } = ld2450Hass();
    const devices = detectRadarDevices(hass);
    expect(devices).toHaveLength(1);
    expect(devices[0].profile).toBeUndefined();
    expect(devices[0].ld2450).toBe(true);
  });

  it("gives the zone card a device id, not a location name", () => {
    const { hass } = ld2450Hass();
    const dev = detectRadarDevices(hass)[0];
    const cards = buildDeviceCards(hass, dev);
    const zone = cards.find(
      (c: any) => c.type === "custom:apollo-radar-zone-map-card"
    ) as any;
    expect(zone).toBeDefined();
    expect(zone.device_id).toBe(dev.deviceId);
    expect(zone.location).toBeUndefined();
    // The name still rides along, as a display title only.
    expect(zone.title).toBe("Office R-PRO-1");
  });

  it("adds the zone map alongside tuning on a device with both radars", () => {
    const b = "apollo_r_pro_1_abcd";
    const eng = `switch.${b}_ld2412_engineering_mode`;
    const x = `sensor.${b}_ld2450_target_1_x`;
    const states: Record<string, HassEntity> = {
      [eng]: { entity_id: eng, state: "off", attributes: {} },
      [x]: { entity_id: x, state: "100", attributes: {} },
    };
    const entities: Record<string, { device_id?: string }> = {
      [eng]: { device_id: "rpro" },
      [x]: { device_id: "rpro" },
    };
    const hass: HomeAssistant = {
      states,
      entities,
      devices: { rpro: { name: "Office R-PRO-1" } },
    };
    const dev = detectRadarDevices(hass)[0];
    expect(dev.profile?.key).toBe("ld2412");
    expect(dev.ld2450).toBe(true);
    const cards = buildDeviceCards(hass, dev);
    const types = cards.map((c: any) => c.type);
    expect(types).toContain("custom:apollo-radar-gate-energy-card");
    expect(types).toContain("custom:apollo-radar-zone-map-card");
  });
});

describe("LD2450 detection across same-named radars", () => {
  // Two radars renamed to the same HA name with "rename entity ids" ticked
  // share the base `office`; the second one's ids carry HA's `_2` tail. The
  // LD2450 flag must come from a device's own entities (or its registry
  // model), never from another device's target sensors that share its base.
  const msrIds = [
    "switch.office_radar_engineering_mode_2",
    "number.office_g3_move_threshold_2",
  ];
  const trackers = [
    {
      label: "R-PRO-1",
      model: "R-PRO-1-W",
      ids: [
        "switch.office_ld2412_engineering_mode",
        "sensor.office_ld2450_target_1_x",
        "sensor.office_ld2450_target_1_y",
      ],
    },
    {
      label: "MTR-1",
      model: "MTR-1",
      ids: ["sensor.office_target_1_x", "sensor.office_target_1_y"],
    },
  ];

  function sameNameHass(
    trackerIds: string[],
    trackerModel: string,
    withModels: boolean
  ): HomeAssistant {
    const states: Record<string, HassEntity> = {};
    const entities: HomeAssistant["entities"] = {};
    const own = (ids: string[], deviceId: string): void => {
      for (const id of ids) {
        const state = id.startsWith("sensor.") ? "1200" : "off";
        states[id] = { entity_id: id, state, attributes: {} };
        entities[id] = { device_id: deviceId, platform: "esphome" };
      }
    };
    own(msrIds, "msr");
    own(trackerIds, "tracker");
    const reg = (model: string) =>
      withModels ? { manufacturer: "ApolloAutomation", model } : {};
    return {
      states,
      entities,
      devices: {
        msr: { name: "Office", ...reg("MSR-2") },
        tracker: { name: "Office", ...reg(trackerModel) },
      },
    };
  }

  const isZoneMap = (c: any) => c.type === "custom:apollo-radar-zone-map-card";
  const isZoneHeader = (c: any) =>
    c.type === "heading" && c.heading === "Zone Map";

  for (const tracker of trackers) {
    for (const withModels of [true, false]) {
      const variant = withModels ? "registry models" : "no registry models, DIY";
      const name =
        `keeps an MSR-2 sharing a base with an ${tracker.label} ` +
        `off the zone map (${variant})`;
      it(name, () => {
        const hass = sameNameHass(tracker.ids, tracker.model, withModels);
        const devices = detectRadarDevices(hass);
        const msr = devices.find((d) => d.deviceId === "msr")!;
        const other = devices.find((d) => d.deviceId === "tracker")!;
        expect(msr.base).toBe("office");
        expect(other.base).toBe("office");

        expect(msr.profile?.key).toBe("ld2410");
        expect(msr.ld2450).toBe(false);
        const msrCards = buildDeviceCards(hass, msr);
        expect(msrCards.some(isZoneHeader)).toBe(false);
        expect(msrCards.some(isZoneMap)).toBe(false);

        expect(other.ld2450).toBe(true);
        const zone = buildDeviceCards(hass, other).find(isZoneMap);
        expect(zone?.device_id).toBe("tracker");
      });
    }
  }
});

describe("LD2450 cards beside the zone map", () => {
  const RPRO = "apollo_r_pro_1_7a711c";
  const MTR = "apollo_mtr_1_cbbdb4";
  const SETUP = "custom:apollo-radar-setup-card";
  const ZONE_MAP = "custom:apollo-radar-zone-map-card";

  type Entities = HomeAssistant["entities"];

  /** `deviceId` owning `ids` (id to state), ESPHome entities unless the id is
   *  listed in `own`, which this integration owns. */
  function hassOf(
    deviceId: string,
    device: HomeAssistant["devices"][string],
    ids: Record<string, string>,
    own: string[] = []
  ): HomeAssistant {
    const states: Record<string, HassEntity> = {};
    const entities: Entities = {};
    for (const [id, value] of Object.entries(ids)) {
      const attributes = id.startsWith("select.")
        ? { options: ["Disabled", "Detection", "Filter"] }
        : {};
      states[id] = { entity_id: id, state: value, attributes };
      entities[id] = {
        device_id: deviceId,
        platform: own.includes(id) ? "apollo_mmwave" : "esphome",
      };
    }
    return { states, entities, devices: { [deviceId]: device } };
  }

  /** Targets 1 to 3 and the built-in zones in a firmware's spelling. */
  function radarIds(d: string, chip: "ld2450_" | ""): Record<string, string> {
    const ids: Record<string, string> = {};
    for (let n = 1; n <= 3; n++) {
      ids[`sensor.${d}_${chip}target_${n}_x`] = "0";
      ids[`sensor.${d}_${chip}target_${n}_y`] = "0";
      ids[`sensor.${d}_${chip}target_${n}_speed`] = "0";
      ids[`sensor.${d}_${chip}target_${n}_distance`] = "0";
      ids[`sensor.${d}_${chip}target_${n}_direction`] = "NA";
      for (const f of ["x1", "y1", "x2", "y2"]) ids[`number.${d}_${chip}zone_${n}_${f}`] = "0";
      for (const f of ["all", "still", "moving"]) {
        ids[`sensor.${d}_${chip}zone_${n}_${f}_target_count`] = "0";
      }
    }
    return ids;
  }

  /** A live R PRO-1 as it ships: Multi Target Tracking and the LD2450
   *  firmware sensor are disabled by default, so HA has neither. */
  function rproHass(extra: Record<string, string> = {}, own: string[] = []): HomeAssistant {
    const m = LD2412_PROFILE.entityMap(RPRO);
    return hassOf(
      "rpro",
      { name: "Office R PRO-1", manufacturer: "ApolloAutomation", model: "R-PRO-1-W" },
      {
        [m.engineering_mode!]: "off",
        [m.radar_timeout!]: "5",
        [m.max_move_distance!]: "12",
        [m.move_threshold[0]]: "30",
        [m.radar_target!]: "off",
        [m.bluetooth!]: "on",
        [m.restart_radar!]: "unknown",
        [m.factory_reset_radar!]: "unknown",
        [`select.${RPRO}_ld2450_zone_type`]: "Disabled",
        [`switch.${RPRO}_ld2450_bluetooth`]: "on",
        [`number.${RPRO}_ld2450_timeout`]: "5",
        [`button.${RPRO}_ld2450_restart`]: "unknown",
        [`button.${RPRO}_ld2450_factory_reset`]: "unknown",
        [`binary_sensor.${RPRO}_ld2450_presence`]: "off",
        [`binary_sensor.${RPRO}_ld2450_moving_target`]: "off",
        [`binary_sensor.${RPRO}_ld2450_still_target`]: "off",
        [`sensor.${RPRO}_ld2450_presence_target_count`]: "0",
        ...radarIds(RPRO, "ld2450_"),
        ...extra,
      },
      own
    );
  }

  /** A live MTR-1: bare names, Multi Target Tracking present. */
  function mtrHass(drop: string[] = [], state = (_id: string, v: string) => v): HomeAssistant {
    const ids: Record<string, string> = {
      [`select.${MTR}_zone_type`]: "Disabled",
      [`switch.${MTR}_multi_target_tracking`]: "on",
      [`switch.${MTR}_ld2450_bluetooth`]: "on",
      [`number.${MTR}_timeout`]: "5",
      [`button.${MTR}_factory_reset_ld2450`]: "unknown",
      [`sensor.${MTR}_ld2450_firmware`]: "2.04",
      [`binary_sensor.${MTR}_ld2450_presence`]: "off",
      [`binary_sensor.${MTR}_ld2450_moving_target`]: "off",
      [`binary_sensor.${MTR}_ld2450_still_target`]: "off",
      [`sensor.${MTR}_presence_target_count`]: "0",
      [`button.${MTR}_esp_reboot`]: "unknown",
      [`button.${MTR}_factory_reset_esp`]: "unknown",
      ...radarIds(MTR, ""),
    };
    for (const id of drop) delete ids[id];
    for (const id of Object.keys(ids)) ids[id] = state(id, ids[id]);
    return hassOf(
      "mtr",
      { name: "Hall MTR-1", manufacturer: "ApolloAutomation", model: "MTR-1" },
      ids
    );
  }

  const deviceOf = (hass: HomeAssistant) => detectRadarDevices(hass)[0];
  const byTitle = (cards: Record<string, any>[], title: string): Record<string, any> =>
    cards.find((c) => c.title === title)!;
  /** A button row that asks `text` before it presses. */
  const confirmed = (entity: string, name: string, action: string, text: string) => ({
    type: "button",
    entity,
    name,
    action_name: action,
    tap_action: {
      action: "perform-action",
      perform_action: "button.press",
      target: { entity_id: entity },
      confirmation: { text },
    },
  });
  /** The Factory Reset Radar row, which asks before it presses. */
  const factoryReset = (entity: string, chip: string) =>
    confirmed(
      entity,
      "Factory Reset Radar",
      "Reset",
      `Reset the ${chip} radar to its factory settings? It restarts and forgets its own settings.`
    );
  /** The Restart Radar row, which asks before it presses. */
  const restartRadar = (entity: string, chip: string) =>
    confirmed(
      entity,
      "Restart Radar",
      "Restart",
      `Restart the ${chip} radar? It stops detecting for a few seconds while it starts up.`
    );

  it("puts the setup card above the zone map and the LD2450 cards beside it on an R PRO-1", () => {
    const hass = rproHass();
    const dev = deviceOf(hass);
    expect(dev.profile?.key).toBe("ld2412");
    const sections = buildDeviceSections(hass, dev);
    expect(sections).toHaveLength(6);
    // One setup card per radar: the LD2412's sits under the help at the top
    // of column 1, the LD2450's above the zone map.
    expect(layout(sections)[0].slice(0, 3)).toEqual(["markdown", SETUP, "Auto-calibrate"]);
    expect(sections[0].cards[1]).toEqual({ type: SETUP, device_id: "rpro", radar: "gate" });
    expect(sections[1].cards.map((c: any) => c.type)).toEqual(["heading", SETUP, ZONE_MAP]);
    expect(sections[1].cards[1]).toEqual({ type: SETUP, device_id: "rpro" });
    expect(layout([sections[2]])).toEqual([
      [ZONE_PRESENCE_TITLE, "LD2450 Live", "LD2450 Controls", "markdown", "conditional"],
    ]);
    expect(sections[2].cards[3]).toEqual({ type: "markdown", content: LD2450_TIMEOUT_NOTE });
  });

  it("reaches the zone map and the LD2450's cards before any threshold row on a phone", () => {
    const hass = rproHass({ [LD2412_PROFILE.entityMap(RPRO).still_threshold[0]]: "30" });
    const order = buildDeviceSections(hass, deviceOf(hass))
      .flatMap((s) => s.cards)
      .map((c: any) => c.title ?? c.type);
    const at = (title: string) => order.indexOf(title);
    expect(at(ZONE_MAP)).toBeLessThan(at("LD2412 Move Thresholds"));
    expect(at("LD2450 Live")).toBeLessThan(at("LD2412 Move Thresholds"));
    expect(at("LD2412 Still Thresholds")).toBeGreaterThan(at("LD2412 Move Thresholds"));
    // The Device card ends the tab. This fixture has none of its entities,
    // so it is the titled support note alone.
    expect(order[order.length - 1]).toBe(DEVICE_TITLE);
  });

  it("lists the R PRO-1's LD2450 controls, skipping what HA does not have", () => {
    const cards = buildDeviceCards(rproHass(), deviceOf(rproHass()));
    expect(byTitle(cards, "LD2450 Controls")).toEqual({
      type: "entities",
      title: "LD2450 Controls",
      show_header_toggle: false,
      entities: [
        { entity: `select.${RPRO}_ld2450_zone_type`, name: "Zone Type" },
        { entity: `number.${RPRO}_ld2450_timeout`, name: "Radar Timeout" },
        { entity: `switch.${RPRO}_ld2450_bluetooth`, name: "Radar Bluetooth (HLK app)" },
        restartRadar(`button.${RPRO}_ld2450_restart`, "LD2450"),
        factoryReset(`button.${RPRO}_ld2450_factory_reset`, "LD2450"),
      ],
    });
    // The LD2412's own Controls card keeps only LD2412 entities.
    const ld2412 = byTitle(cards, "LD2412 Controls");
    expect(ld2412.entities.every((r: any) => !r.entity.includes("ld2450"))).toBe(true);
  });

  it("asks before a factory reset or a restart on both radars' Controls cards", () => {
    const cards = buildDeviceCards(rproHass(), deviceOf(rproHass()));
    const m = LD2412_PROFILE.entityMap(RPRO);
    const named = (title: string, name: string) =>
      byTitle(cards, title).entities.find((r: any) => r.name === name);

    // HA's button row with a confirmation in its tap action asks first; a
    // plain button entity row presses on one tap.
    expect(named("LD2412 Controls", "Factory Reset Radar")).toEqual(
      factoryReset(m.factory_reset_radar!, "LD2412")
    );
    expect(named("LD2450 Controls", "Factory Reset Radar")).toEqual(
      factoryReset(`button.${RPRO}_ld2450_factory_reset`, "LD2450")
    );
    expect(named("LD2450 Controls", "Factory Reset Radar").tap_action.confirmation.text).toBe(
      "Reset the LD2450 radar to its factory settings? It restarts and forgets its own settings."
    );
    expect(named("LD2412 Controls", "Restart Radar")).toEqual(
      restartRadar(m.restart_radar!, "LD2412")
    );
    expect(named("LD2450 Controls", "Restart Radar")).toEqual(
      restartRadar(`button.${RPRO}_ld2450_restart`, "LD2450")
    );
  });

  it("adds Multi Target Tracking once enabled, and both chip versions to the Device card", () => {
    const hass = rproHass({
      [`switch.${RPRO}_ld2450_multi_target_tracking`]: "on",
      [`sensor.${RPRO}_ld2450_firmware`]: "2.04",
      [`sensor.${RPRO}_ld2412_firmware`]: "1.26",
    });
    const cards = buildDeviceCards(hass, deviceOf(hass));
    expect(byTitle(cards, "LD2450 Controls").entities.map((r: any) => r.name)).toEqual([
      "Zone Type",
      "Multi Target Tracking",
      "Radar Timeout",
      "Radar Bluetooth (HLK app)",
      "Restart Radar",
      "Factory Reset Radar",
    ]);
    const device = cards[cards.length - 1].cards[0];
    expect(device.title).toBe(DEVICE_TITLE);
    expect(device.entities.slice(0, 2)).toEqual([
      { entity: `sensor.${RPRO}_ld2412_firmware`, name: "LD2412 firmware" },
      { entity: `sensor.${RPRO}_ld2450_firmware`, name: "LD2450 firmware" },
    ]);
  });

  it("shows what the radar sees in the LD2450 Live card", () => {
    const cards = buildDeviceCards(rproHass(), deviceOf(rproHass()));
    const live = byTitle(cards, "LD2450 Live");
    expect(live.state_color).toBe(true);
    expect(live.entities.slice(0, 6)).toEqual([
      { entity: `binary_sensor.${RPRO}_ld2450_presence`, name: "Presence" },
      { entity: `binary_sensor.${RPRO}_ld2450_moving_target`, name: "Moving Target" },
      { entity: `binary_sensor.${RPRO}_ld2450_still_target`, name: "Still Target" },
      { entity: `sensor.${RPRO}_ld2450_presence_target_count`, name: "Target Count" },
      { entity: `sensor.${RPRO}_ld2450_target_1_distance`, name: "Target 1 Distance" },
      { entity: `sensor.${RPRO}_ld2450_target_1_direction`, name: "Target 1 Direction" },
    ]);
    expect(live.entities.map((r: any) => r.name).slice(6)).toEqual([
      "Target 2 Distance",
      "Target 2 Direction",
      "Target 3 Distance",
      "Target 3 Direction",
    ]);
  });

  it("shows the built-in zones only while Zone Type is not Disabled", () => {
    const cards = buildDeviceCards(rproHass(), deviceOf(rproHass()));
    const conditional = cards.find((c) => c.type === "conditional")!;
    expect(conditional.conditions).toEqual([
      {
        condition: "state",
        entity: `select.${RPRO}_ld2450_zone_type`,
        state_not: ["Disabled", "unavailable", "unknown"],
      },
    ]);
    expect(conditional.card.type).toBe("vertical-stack");
    const [note, rows] = conditional.card.cards;
    expect(note).toEqual({
      type: "markdown",
      title: BUILT_IN_ZONES_TITLE,
      content: BUILT_IN_ZONES_NOTE,
    });
    expect(rows.type).toBe("entities");
    expect(rows.entities.slice(0, 8)).toEqual([
      { type: "section", label: "Zone 1" },
      { entity: `number.${RPRO}_ld2450_zone_1_x1`, name: "X1" },
      { entity: `number.${RPRO}_ld2450_zone_1_y1`, name: "Y1" },
      { entity: `number.${RPRO}_ld2450_zone_1_x2`, name: "X2" },
      { entity: `number.${RPRO}_ld2450_zone_1_y2`, name: "Y2" },
      { entity: `sensor.${RPRO}_ld2450_zone_1_all_target_count`, name: "Target Count" },
      { entity: `sensor.${RPRO}_ld2450_zone_1_still_target_count`, name: "Still Target Count" },
      { entity: `sensor.${RPRO}_ld2450_zone_1_moving_target_count`, name: "Moving Target Count" },
    ]);
    expect(rows.entities).toHaveLength(24);
  });

  it("lists the zone presence sensors this integration made for the radar", () => {
    const zone2 = "binary_sensor.office_r_pro_1_zone_2_presence";
    const zone1 = "binary_sensor.office_r_pro_1_zone_1_presence";
    const hass = rproHass(
      { [zone2]: "off", [zone1]: "on", "sensor.office_r_pro_1_zone_1": "rect" },
      [zone2, zone1, "sensor.office_r_pro_1_zone_1"]
    );
    const card = byTitle(buildDeviceCards(hass, deviceOf(hass)), ZONE_PRESENCE_TITLE);
    const presenceRow = (entity: string) => ({
      type: "conditional",
      conditions: [{ condition: "state", entity, state_not: "unavailable" }],
      // No name: HA shows each sensor's own, which follows a zone rename.
      row: { entity, state_color: true },
    });
    expect(card).toEqual({
      type: "entities",
      title: ZONE_PRESENCE_TITLE,
      show_header_toggle: false,
      state_color: true,
      entities: [presenceRow(zone1), presenceRow(zone2)],
    });
  });

  it("hides a zone presence row once its zone is deleted, without a reload", () => {
    // HA's conditional row, as hui-conditional-row checks a state condition:
    // a missing entity reads as "unavailable".
    const shown = (row: any, hass: HomeAssistant) =>
      row.conditions.every((c: any) => {
        const state = hass.states[c.entity]?.state ?? "unavailable";
        return c.state_not !== undefined ? state !== c.state_not : state === c.state;
      });
    const zone2 = "binary_sensor.office_r_pro_1_zone_2_presence";
    const zone1 = "binary_sensor.office_r_pro_1_zone_1_presence";
    const hass = rproHass({ [zone2]: "off", [zone1]: "on" }, [zone2, zone1]);
    const rows = byTitle(buildDeviceCards(hass, deviceOf(hass)), ZONE_PRESENCE_TITLE).entities;
    expect(rows.map((row: any) => shown(row, hass))).toEqual([true, true]);

    // update_zone delete removes both registry entries, so the sensor leaves
    // hass.states while the generated card still lists it.
    const { [zone2]: _deleted, ...states } = hass.states;
    const after = { ...hass, states };

    expect(rows.map((row: any) => shown(row, after))).toEqual([true, false]);
    // "off" is a reading, not a missing sensor: an empty zone stays listed.
    expect(shown(rows[1], hass)).toBe(true);
  });

  it("explains how to get zone presence sensors before any zone is drawn", () => {
    const card = byTitle(buildDeviceCards(rproHass(), deviceOf(rproHass())), ZONE_PRESENCE_TITLE);
    expect(card).toEqual({ type: "markdown", title: ZONE_PRESENCE_TITLE, content: ZONE_PRESENCE_HINT });
  });

  it("lays an MTR-1 out as help, setup and map, then status, then settings", () => {
    const hass = mtrHass();
    const dev = deviceOf(hass);
    expect(dev.profile).toBeUndefined();
    const sections = buildDeviceSections(hass, dev);
    expect(sections.map((s) => s.cards.map((c: any) => c.title ?? c.type))).toEqual([
      ["markdown", SETUP, "Hall MTR-1"],
      [ZONE_PRESENCE_TITLE, "LD2450 Live", "Occupancy History"],
      ["LD2450 Controls", "markdown", "conditional", "vertical-stack"],
    ]);
    expect(sections[0].cards[0].content).toContain("**Start here**");
    expect(sections[0].cards[1]).toEqual({ type: SETUP, device_id: "mtr" });
    expect(sections[0].cards[2].type).toBe(ZONE_MAP);
    expect(buildDeviceCards(hass, dev).map((c) => c.title ?? c.type)).toEqual([
      "markdown",
      SETUP,
      "Hall MTR-1",
      ZONE_PRESENCE_TITLE,
      "LD2450 Live",
      "Occupancy History",
      "LD2450 Controls",
      "markdown",
      "conditional",
      "vertical-stack",
    ]);
  });

  it("lists the MTR-1's controls in its own spelling and leaves the ESP buttons out", () => {
    const hass = mtrHass();
    const controls = byTitle(buildDeviceCards(hass, deviceOf(hass)), "LD2450 Controls");
    expect(controls.entities).toEqual([
      { entity: `select.${MTR}_zone_type`, name: "Zone Type" },
      { entity: `switch.${MTR}_multi_target_tracking`, name: "Multi Target Tracking" },
      { entity: `number.${MTR}_timeout`, name: "Radar Timeout" },
      { entity: `switch.${MTR}_ld2450_bluetooth`, name: "Radar Bluetooth (HLK app)" },
      factoryReset(`button.${MTR}_factory_reset_ld2450`, "LD2450"),
    ]);
  });

  it("restarts an MTR-1 from its Device card, saying the radar restarts too", () => {
    const hass = mtrHass();
    const cards = buildDeviceCards(hass, deviceOf(hass));
    const device = cards[cards.length - 1];
    expect(device.type).toBe("vertical-stack");
    expect(device.cards[0]).toEqual({
      type: "entities",
      title: DEVICE_TITLE,
      show_header_toggle: false,
      entities: [
        { entity: `sensor.${MTR}_ld2450_firmware`, name: "LD2450 firmware" },
        confirmed(
          `button.${MTR}_esp_reboot`,
          "Restart device (also restarts the radar)",
          "Restart",
          "Restart the whole device? The radar restarts with it, and the device is offline" +
            " for a short while before it reconnects."
        ),
      ],
    });
    // Factory Reset ESP is never shown.
    expect(JSON.stringify(cards)).not.toContain("factory_reset_esp");
  });

  it("graphs the MTR-1's presence and its drawn zones over the last day", () => {
    const zone = "binary_sensor.hall_zone_1_presence";
    const base = mtrHass();
    const hass: HomeAssistant = {
      ...base,
      states: { ...base.states, [zone]: { entity_id: zone, state: "off", attributes: {} } },
      entities: { ...base.entities, [zone]: { device_id: "mtr", platform: "apollo_mmwave" } },
    };
    expect(byTitle(buildDeviceCards(hass, deviceOf(hass)), "Occupancy History")).toEqual({
      type: "history-graph",
      title: "Occupancy History",
      hours_to_show: 24,
      entities: [
        { entity: `binary_sensor.${MTR}_ld2450_presence`, name: "Presence" },
        { entity: zone },
      ],
    });
  });

  it("leaves out the setup and built-in zone cards without a Zone Type or Multi Target Tracking", () => {
    const hass = mtrHass([`select.${MTR}_zone_type`, `switch.${MTR}_multi_target_tracking`]);
    const types = buildDeviceCards(hass, deviceOf(hass)).map((c) => c.type);
    expect(types).not.toContain(SETUP);
    expect(types).not.toContain("conditional");
    expect(types).toContain(ZONE_MAP);
  });

  it("keeps the setup card for Multi Target Tracking alone", () => {
    const hass = mtrHass([`select.${MTR}_zone_type`]);
    const types = buildDeviceCards(hass, deviceOf(hass)).map((c) => c.type);
    expect(types).toContain(SETUP);
    expect(types).not.toContain("conditional");
  });

  it("drops a built-in zone with no rows and the card with none at all", () => {
    const zone2 = Object.keys(radarIds(MTR, "")).filter((id) => /_zone_2_/.test(id));
    const partial = mtrHass(zone2);
    const conditional = buildDeviceCards(partial, deviceOf(partial)).find(
      (c) => c.type === "conditional"
    )!;
    const labels = conditional.card.cards[1].entities
      .filter((r: any) => r.type === "section")
      .map((r: any) => r.label);
    expect(labels).toEqual(["Zone 1", "Zone 3"]);

    const allZones = Object.keys(radarIds(MTR, "")).filter((id) => /_zone_\d_/.test(id));
    const none = mtrHass(allZones);
    expect(buildDeviceCards(none, deviceOf(none)).some((c) => c.type === "conditional")).toBe(false);
  });

  it("keeps the help and its offline note first on an offline MTR-1, then the setup card and map", () => {
    const hass = mtrHass([], () => "unavailable");
    const dev = deviceOf(hass);
    expect(dev.online).toBe(false);
    const sections = buildDeviceSections(hass, dev);
    expect(sections[0].cards.map((c: any) => c.type)).toEqual(["markdown", SETUP, ZONE_MAP]);
    expect(sections[0].cards[0].content).toContain("Offline right now");
  });
});

describe("plain help, labels and the Device card", () => {
  const MSR = "apollo_msr_1_abc123";
  const RPRO = "apollo_r_pro_1_7a711c";
  const m = LD2410_PROFILE.entityMap(MSR);

  /** `deviceId` owning `ids` (id to state); `us` picks US customary units. */
  function hassOf(
    deviceId: string,
    device: HomeAssistant["devices"][string],
    ids: Record<string, string>,
    us = false
  ): HomeAssistant {
    const states: Record<string, HassEntity> = {};
    const entities: HomeAssistant["entities"] = {};
    for (const [id, value] of Object.entries(ids)) {
      states[id] = { entity_id: id, state: value, attributes: {} };
      entities[id] = { device_id: deviceId, platform: "esphome" };
    }
    return {
      states,
      entities,
      devices: { [deviceId]: device },
      config: { unit_system: { length: us ? "mi" : "km" } },
    };
  }

  /** A stock MSR-1: gate size ships disabled, so HA has no such entity. */
  function msrHass(extra: Record<string, string> = {}, us = false): HomeAssistant {
    const ids: Record<string, string> = {};
    for (const value of Object.values(m)) {
      if (Array.isArray(value)) for (const id of value) ids[id] = "30";
      else if (value) ids[value] = "off";
    }
    delete ids[m.gate_size!];
    return hassOf(
      "msr",
      { name: "Den MSR-1", manufacturer: "ApolloAutomation", model: "MSR-1" },
      {
        ...ids,
        [`sensor.${MSR}_apollo_firmware_version`]: "26.10.12.1",
        [`sensor.${MSR}_radar_firmware_version`]: "2.04",
        [`update.${MSR}_firmware_update`]: "off",
        // The forced-install template button ends the same way as the update
        // entity, and must never be shown.
        [`button.${MSR}_firmware_update`]: "unknown",
        [`sensor.${MSR}_rssi`]: "-60",
        ...extra,
      },
      us
    );
  }

  /** A stock R PRO-1 with one drawn zone. */
  function rproHass(): HomeAssistant {
    const r = LD2412_PROFILE.entityMap(RPRO);
    const zone = "binary_sensor.office_zone_1_presence";
    const hass = hassOf(
      "rpro",
      { name: "Office", manufacturer: "ApolloAutomation", model: "R-PRO-1-W" },
      {
        [r.engineering_mode!]: "off",
        [r.radar_timeout!]: "5",
        [r.move_threshold[4]]: "30",
        [r.radar_target!]: "off",
        [r.moving_target!]: "off",
        [r.still_target!]: "off",
        [r.esp_reboot!]: "unknown",
        [`select.${RPRO}_ld2450_zone_type`]: "Disabled",
        [`sensor.${RPRO}_ld2450_target_1_x`]: "0",
        [`binary_sensor.${RPRO}_ld2450_presence`]: "off",
        [zone]: "off",
      }
    );
    hass.entities[zone] = { device_id: "rpro", platform: "apollo_mmwave" };
    return hass;
  }

  const deviceOf = (hass: HomeAssistant) => detectRadarDevices(hass)[0];
  const cardsOf = (hass: HomeAssistant) => buildDeviceCards(hass, deviceOf(hass));
  const byTitle = (cards: Record<string, any>[], title: string): Record<string, any> =>
    cards.find((c) => c.title === title)!;
  const help = (hass: HomeAssistant): string => cardsOf(hass)[0].content;

  it("links every kind of help card to the device's own page", () => {
    const devs: RadarDevice[] = [
      ld2410Dev,
      { ...ld2410Dev, profile: LD2412_PROFILE, ld2450: true },
      { ...ld2410Dev, profile: undefined, ld2450: true },
      { ...ld2410Dev, profile: undefined, ld2450: false, online: false },
    ];
    for (const dev of devs) {
      const content = buildDeviceCards(deviceHass(), dev)[0].content;
      expect(content).toContain("[All settings for this device →](/config/devices/device/dev1)");
    }
  });

  it("gives each gate's depth in feet on a US customary system and never names the gate size", () => {
    expect(help(msrHass({}, true))).toContain("(each gate is about 2.5 ft)");
    expect(help(msrHass())).toContain("(each gate is about 0.75 m)");
    for (const hass of [msrHass(), rproHass()]) {
      expect(help(hass)).not.toContain("Gate Size");
      expect(help(hass)).not.toContain("Distance Resolution");
    }
  });

  it("follows the gate size control once the user enables it", () => {
    const hass = msrHass({ [`select.${MSR}_radar_distance_resolution`]: "0.2m" });
    expect(help(hass)).toContain("(each gate is about 0.2 m)");
    const names = byTitle(cardsOf(hass), "LD2410 Move Thresholds")
      .entities.filter((r: any) => r.entity)
      .map((r: any) => r.name);
    expect(names[4]).toBe("G4 (about 0.8 m)");
    // The note under Detection Range gives the same depth.
    const notes = cardsOf(hass).map((c) => c.content);
    expect(notes).toContain(LD2410_PROFILE.rangeTip("about 0.2 m"));
    expect(LD2410_PROFILE.rangeTip("about 0.2 m")).toContain("Each gate is about 0.2 m deep.");
  });

  it("gives the gate depth under Detection Range in the user's unit", () => {
    const range = (hass: HomeAssistant) => {
      const cards = cardsOf(hass);
      return cards[cards.findIndex((c) => c.title === "LD2410 Detection Range") + 1].content;
    };
    expect(range(msrHass())).toContain("Each gate is about 0.75 m deep.");
    expect(range(msrHass({}, true))).toContain("Each gate is about 2.5 ft deep.");
  });

  it("shows how far out each threshold's gate reaches, in the user's unit", () => {
    const names = (hass: HomeAssistant, title: string) =>
      byTitle(cardsOf(hass), title)
        .entities.filter((r: any) => r.entity)
        .map((r: any) => r.name);
    expect(names(msrHass(), "LD2410 Move Thresholds").slice(0, 5)).toEqual([
      "G0 (at the sensor)",
      "G1 (about 0.75 m)",
      "G2 (about 1.5 m)",
      "G3 (about 2.3 m)",
      "G4 (about 3 m)",
    ]);
    expect(names(msrHass({}, true), "LD2410 Still Thresholds")[4]).toBe("G4 (about 10 ft)");
    expect(names(rproHass(), "LD2412 Move Thresholds")).toEqual(["G4 (about 3 m)"]);
  });

  it("explains the cm boxes and the back-to-back zones under Zone Config", () => {
    const cards = cardsOf(msrHass({}, true));
    const zone = cards.findIndex((c) => c.title === "LD2410 Zone Config");
    expect(cards[zone + 1]).toEqual({ type: "markdown", content: zoneConfigNote("ft", true) });
    expect(zoneConfigNote("ft", true)).toContain("in cm (100 cm is about 3.3 ft)");
    expect(zoneConfigNote("ft", true)).toContain("use **Any zone**");
    expect(zoneConfigNote("m", true)).toContain("The boxes are in cm.");
    expect(cardsOf(msrHass()).map((c) => c.content)).toContain(zoneConfigNote("m", true));
    // Without the any-zone sensor, the note does not point at it.
    const noAnyZone = msrHass();
    delete noAnyZone.states[m.zone_occupancy!];
    expect(cardsOf(noAnyZone).map((c) => c.content)).toContain(zoneConfigNote("m", false));
    expect(zoneConfigNote("m", false)).not.toContain("Any zone");
  });

  it("colors Target / Occupancy and ends it with Any zone", () => {
    const card = byTitle(cardsOf(msrHass()), "LD2410 Target / Occupancy");
    expect(card.state_color).toBe(true);
    expect(card.entities[card.entities.length - 1]).toEqual({
      entity: m.zone_occupancy,
      name: "Any zone",
    });
  });

  it("graphs both radars' presence and the drawn zones on an R PRO-1", () => {
    expect(byTitle(cardsOf(rproHass()), "Occupancy History")).toEqual({
      type: "history-graph",
      title: "Occupancy History",
      hours_to_show: 24,
      entities: [
        { entity: `binary_sensor.${RPRO}_ld2412_presence`, name: "LD2412 Presence" },
        { entity: `binary_sensor.${RPRO}_ld2412_moving_target`, name: "LD2412 Moving" },
        { entity: `binary_sensor.${RPRO}_ld2412_still_target`, name: "LD2412 Still" },
        { entity: `binary_sensor.${RPRO}_ld2450_presence`, name: "LD2450 Presence" },
        { entity: "binary_sensor.office_zone_1_presence" },
      ],
    });
  });

  it("covers both radars in the R PRO-1 help and says which presence to automate on", () => {
    const content = help(rproHass());
    expect(content).toContain("Apollo mmWave with two radars");
    expect(content).toContain("The **LD2450** tracks where people are");
    expect(content).toContain("1. Fix anything the LD2412's Radar setup card flags.");
    expect(content).toContain("6. For the LD2450, fix anything Radar setup flags above the zone map");
    expect(content).toContain("**In automations**, use **LD2412 Presence**");
    expect(content).toContain(`[Full tuning guide →](${LD2412_PROFILE.wikiUrl})`);
  });

  it("points automations at the LD2450 on an R PRO-1 built without the LD2412", () => {
    const hass = hassOf(
      "rpro",
      { name: "Office", manufacturer: "ApolloAutomation", model: "R-PRO-1-W" },
      {
        [`sensor.${RPRO}_ld2450_target_1_x`]: "0",
        [`binary_sensor.${RPRO}_ld2450_presence`]: "off",
      }
    );
    const content = help(hass);
    expect(content).not.toContain("**LD2412 Presence**");
    expect(content).toContain("**LD2450 Presence** for anywhere the radar sees");
  });

  it("gives a live MTR-1 three Start here steps, two without a setup card", () => {
    const mtr = "apollo_mtr_1_cbbdb4";
    const ids = {
      [`sensor.${mtr}_target_1_x`]: "0",
      [`select.${mtr}_zone_type`]: "Disabled",
    };
    const device = { name: "Hall", manufacturer: "ApolloAutomation", model: "MTR-1" };
    const steps = (content: string) => content.split("\n").filter((l) => /^\d\. /.test(l));
    expect(steps(help(hassOf("mtr", device, ids)))).toEqual([
      "1. Fix anything the Radar setup card flags.",
      "2. Set **Cone rotation** (under Configure on the zone map) to match how the sensor is mounted.",
      "3. Draw a zone on the map, reload this page, then walk into the zone and watch it" +
        " turn on under Zone presence.",
    ]);
    const noSetup = hassOf("mtr", device, { [`sensor.${mtr}_target_1_x`]: "0" });
    expect(steps(help(noSetup))).toHaveLength(2);
    expect(help(noSetup)).toContain("**LD2450 Presence** for anywhere the radar sees");
  });

  it("puts the gate radar's setup card right under the help on an MSR-1 and points step 1 at it", () => {
    const hass = msrHass();
    const sections = buildDeviceSections(hass, deviceOf(hass));
    expect(sections[0].cards[0].type).toBe("markdown");
    expect(sections[0].cards[1]).toEqual({ type: GATE_SETUP, device_id: "msr", radar: "gate" });
    const steps = help(hass)
      .split("\n")
      .filter((l) => /^\d\. /.test(l));
    expect(steps).toHaveLength(5);
    expect(steps[0]).toBe("1. Fix anything the Radar setup card flags.");
    expect(steps[1]).toMatch(/^2\. Press \*\*Calibrate with empty room\*\*/);
    // One card for the gate radar, no LD2450 card: an MSR has no LD2450.
    const setups = cardsOf(hass).filter((c) => c.type === GATE_SETUP);
    expect(setups).toEqual([{ type: GATE_SETUP, device_id: "msr", radar: "gate" }]);
  });

  it("gives the gate setup card to the section strategy as well", () => {
    const hass = msrHass();
    const cards = generateCards(hass, {});
    expect(cards.filter((c) => c.type === GATE_SETUP)).toEqual([
      { type: GATE_SETUP, device_id: "msr", radar: "gate" },
    ]);
  });

  it("leaves the gate setup card and the LD2412 help off an R PRO-1 built without the LD2412", () => {
    const hass = hassOf(
      "rpro",
      { name: "Office", manufacturer: "ApolloAutomation", model: "R-PRO-1-W" },
      {
        [`sensor.${RPRO}_ld2450_target_1_x`]: "0",
        [`select.${RPRO}_ld2450_zone_type`]: "Disabled",
        [`button.${RPRO}_esp_reboot`]: "unknown",
      }
    );
    const dev = deviceOf(hass);
    // The registry model still gives it the LD2412 profile (a known limitation).
    expect(dev.profile?.key).toBe("ld2412");
    const setups = cardsOf(hass).filter((c) => c.type === GATE_SETUP);
    expect(setups).toEqual([{ type: GATE_SETUP, device_id: "rpro" }]);
    // The help and the restart describe the one radar it has.
    const content = help(hass);
    expect(content).toMatch(/^\*\*Office\*\*, Apollo mmWave \(LD2450 tracking radar\)\./);
    expect(content).not.toContain("two radars");
    expect(content).not.toContain("LD2412");
    expect(content).not.toContain("Calibrate with empty room");
    expect(content).toContain("1. Fix anything the Radar setup card flags.");
    const cards = cardsOf(hass);
    const [restart] = cards[cards.length - 1].cards[0].entities;
    expect(restart.name).toBe("Restart device (also restarts the radar)");
    expect(restart.tap_action.confirmation.text).not.toContain("Both radars");
  });

  it("never gives an MTR-1 a gate setup card", () => {
    const mtr = "apollo_mtr_1_cbbdb4";
    const hass = hassOf(
      "mtr",
      { name: "Hall", manufacturer: "ApolloAutomation", model: "MTR-1" },
      { [`sensor.${mtr}_target_1_x`]: "0", [`select.${mtr}_zone_type`]: "Disabled" }
    );
    const setups = cardsOf(hass).filter((c) => c.type === GATE_SETUP);
    expect(setups).toEqual([{ type: GATE_SETUP, device_id: "mtr" }]);
  });

  it("moves the whole-device restart out of every Controls card", () => {
    for (const hass of [msrHass(), rproHass()]) {
      const cards = cardsOf(hass);
      for (const card of cards.filter((c) => /Controls$/.test(c.title ?? ""))) {
        expect(card.entities.some((r: any) => r.entity.endsWith("_esp_reboot"))).toBe(false);
      }
    }
  });

  it("puts versions, the update entity, a confirmed restart and help on the MSR's Device card", () => {
    const cards = cardsOf(msrHass());
    const device = cards[cards.length - 1];
    expect(device.type).toBe("vertical-stack");
    const [rows, wifi, note] = device.cards;
    expect(rows).toEqual({
      type: "entities",
      title: DEVICE_TITLE,
      show_header_toggle: false,
      entities: [
        { entity: `sensor.${MSR}_apollo_firmware_version`, name: "Apollo firmware" },
        { entity: `sensor.${MSR}_radar_firmware_version`, name: "LD2410 firmware" },
        // A plain row: a tap opens HA's own update dialog.
        { entity: `update.${MSR}_firmware_update`, name: "Firmware update" },
        {
          type: "button",
          entity: `button.${MSR}_esp_reboot`,
          name: "Restart device",
          action_name: "Restart",
          tap_action: {
            action: "perform-action",
            perform_action: "button.press",
            target: { entity_id: `button.${MSR}_esp_reboot` },
            confirmation: {
              text: "Restart the whole device? It is offline for a short while before it reconnects.",
            },
          },
        },
      ],
    });
    expect(wifi).toEqual({
      type: "conditional",
      conditions: [
        { condition: "numeric_state", entity: `sensor.${MSR}_rssi`, below: WEAK_WIFI_DBM },
      ],
      card: { type: "markdown", content: WEAK_WIFI_NOTE },
    });
    expect(WEAK_WIFI_DBM).toBe(-75);
    expect(WEAK_WIFI_NOTE).toContain("below -75 dBm");
    expect(note).toEqual({
      type: "markdown",
      content: `[All settings for this device →](/config/devices/device/msr)\n\n${SUPPORT_FILE_NOTE}`,
    });
    expect(SUPPORT_FILE_NOTE).toContain("(/config/integrations/integration/apollo_mmwave)");
    expect(SUPPORT_FILE_NOTE).toContain("**Download diagnostics**");
    // The forced-install button never appears anywhere on the tab.
    expect(JSON.stringify(cards)).not.toContain(`button.${MSR}_firmware_update`);
  });

  it("leaves the weak Wi-Fi note out on a device with no signal sensor", () => {
    const hass = msrHass();
    delete hass.states[`sensor.${MSR}_rssi`];
    const cards = cardsOf(hass);
    const device = cards[cards.length - 1];
    expect(device.cards.map((c: any) => c.type)).toEqual(["entities", "markdown"]);
  });

  it("names the R PRO-1's restart for both radars", () => {
    const cards = cardsOf(rproHass());
    const rows = cards[cards.length - 1].cards[0].entities;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Restart device (both radars)");
    expect(rows[0].tap_action.confirmation.text).toBe(
      "Restart the whole device? Both radars stop, and the device is offline for a short" +
        " while before it reconnects."
    );
  });

  it("adds the LD2450 timeout note only with the timeout row", () => {
    const cards = cardsOf(rproHass());
    expect(cards.some((c) => c.content === LD2450_TIMEOUT_NOTE)).toBe(false);
    expect(LD2450_TIMEOUT_NOTE).toContain("does not hold the zones you draw");
  });
});

describe("slider lock rows", () => {
  const MSR = "apollo_msr_2_abc123";
  const RPRO = "apollo_r_pro_1_7a711c";
  const MTR = "apollo_mtr_1_cbbdb4";
  const LOCK = "custom:apollo-radar-slider-lock-row";
  const SLIDER = "custom:apollo-radar-slider-row";
  /** What the firmware reports for a threshold: Home Assistant draws a slider. */
  const PERCENT = { mode: "auto", min: 0, max: 100, step: 1, unit_of_measurement: "%" };
  const GATES = { mode: "auto", min: 1, max: 13, step: 1 };
  /** Radar Timeout spans 900 steps, so Home Assistant draws a box. */
  const TIMEOUT = { mode: "auto", min: 0, max: 900, step: 1, unit_of_measurement: "s" };

  /** `deviceId` owning `ids` (id to attributes), every state "20". */
  function hassOf(
    deviceId: string,
    device: HomeAssistant["devices"][string],
    ids: Record<string, Record<string, any>>
  ): HomeAssistant {
    const states: Record<string, HassEntity> = {};
    const entities: HomeAssistant["entities"] = {};
    for (const [id, attributes] of Object.entries(ids)) {
      states[id] = { entity_id: id, state: "20", attributes };
      entities[id] = { device_id: deviceId, platform: "esphome" };
    }
    return { states, entities, devices: { [deviceId]: device } };
  }

  /** A gate radar's range and threshold numbers, plus `extra`. */
  function gateIds(
    m: ReturnType<typeof LD2410_PROFILE.entityMap>,
    threshold: Record<string, any> = PERCENT
  ): Record<string, Record<string, any>> {
    const ids: Record<string, Record<string, any>> = {
      [m.engineering_mode!]: {},
      [m.radar_timeout!]: TIMEOUT,
      [m.max_move_distance!]: GATES,
      [m.max_still_distance!]: GATES,
      [m.radar_target!]: {},
    };
    for (const id of [...m.move_threshold, ...m.still_threshold]) ids[id] = threshold;
    return ids;
  }

  const MSR_DEVICE = { name: "Den MSR-2", manufacturer: "ApolloAutomation", model: "MSR-2" };
  const RPRO_DEVICE = { name: "Office", manufacturer: "ApolloAutomation", model: "R-PRO-1-W" };

  function msrHass(extra: Record<string, Record<string, any>> = {}): HomeAssistant {
    return hassOf("msr", MSR_DEVICE, { ...gateIds(LD2410_PROFILE.entityMap(MSR)), ...extra });
  }

  function rproHass(): HomeAssistant {
    const r = LD2412_PROFILE.entityMap(RPRO);
    return hassOf("rpro", RPRO_DEVICE, {
      ...gateIds(r),
      [r.gate_size!]: { options: ["0.2m", "0.5m", "0.75m"] },
      [`select.${RPRO}_ld2450_zone_type`]: { options: ["Disabled", "Detection", "Filter"] },
      [`number.${RPRO}_ld2450_timeout`]: TIMEOUT,
      [`number.${RPRO}_ld2450_zone_1_x1`]: { mode: "box", min: -4860, max: 4860, step: 1 },
      [`sensor.${RPRO}_ld2450_target_1_x`]: {},
    });
  }

  const cardsOf = (hass: HomeAssistant) =>
    buildDeviceCards(hass, detectRadarDevices(hass)[0]);
  const byTitle = (cards: Record<string, any>[], title: string): Record<string, any> =>
    cards.find((c) => c.title === title)!;
  const slider = (entity: string, name: string, device_id: string) => ({
    type: SLIDER,
    entity,
    name,
    device_id,
  });
  const LOCKED = /apollo-radar-slider/;

  it("puts the LD2410 range gates behind the lock and leaves Radar Timeout and Gate Size alone", () => {
    const m = LD2410_PROFILE.entityMap(MSR);
    expect(byTitle(cardsOf(msrHass()), "LD2410 Detection Range").entities).toEqual([
      { entity: m.radar_timeout, name: "Radar Timeout" },
      { type: LOCK, device_id: "msr" },
      slider(m.max_move_distance!, "Max Move Gate", "msr"),
      slider(m.max_still_distance!, "Max Still Gate", "msr"),
    ]);
    const withGateSize = msrHass({ [m.gate_size!]: { options: ["0.2m", "0.75m"] } });
    expect(byTitle(cardsOf(withGateSize), "LD2410 Detection Range").entities).toEqual([
      { entity: m.radar_timeout, name: "Radar Timeout" },
      { entity: m.gate_size, name: LD2410_PROFILE.gateSizeLabel },
      { type: LOCK, device_id: "msr" },
      slider(m.max_move_distance!, "Max Move Gate", "msr"),
      slider(m.max_still_distance!, "Max Still Gate", "msr"),
    ]);
  });

  it("puts the LD2412 Max Gate and Min Gate behind the lock on an R PRO-1", () => {
    const r = LD2412_PROFILE.entityMap(RPRO);
    expect(byTitle(cardsOf(rproHass()), "LD2412 Detection Range").entities).toEqual([
      { entity: r.radar_timeout, name: "Radar Timeout" },
      { entity: r.gate_size, name: "Distance Resolution" },
      { type: LOCK, device_id: "rpro" },
      slider(r.max_move_distance!, "Max Gate", "rpro"),
      slider(r.max_still_distance!, "Min Gate", "rpro"),
    ]);
  });

  it("starts each threshold card with the lock row, then every gate's slider", () => {
    for (const [hass, label, id, profile, base, gates] of [
      [msrHass(), "LD2410", "msr", LD2410_PROFILE, MSR, 9],
      [rproHass(), "LD2412", "rpro", LD2412_PROFILE, RPRO, 14],
    ] as const) {
      const m = profile.entityMap(base);
      for (const [title, ids] of [
        [`${label} Move Thresholds`, m.move_threshold],
        [`${label} Still Thresholds`, m.still_threshold],
      ] as const) {
        const rows = byTitle(cardsOf(hass), title).entities;
        expect(rows[0]).toEqual({ type: LOCK, device_id: id });
        expect(rows).toHaveLength(gates + 1);
        rows.slice(1).forEach((r: any, n: number) => {
          expect(r).toEqual({ type: SLIDER, entity: ids[n], name: expect.any(String), device_id: id });
        });
        expect(rows[1].name).toBe("G0 (at the sensor)");
        expect(rows.filter((r: any) => r.type === LOCK)).toHaveLength(1);
      }
    }
  });

  it("locks nothing on the other cards or on an MTR-1 tab", () => {
    const gateCards = /(Detection Range|Move Thresholds|Still Thresholds)$/;
    for (const hass of [msrHass(), rproHass()]) {
      const cards = cardsOf(hass);
      expect(cards.filter((c) => LOCKED.test(JSON.stringify(c))).map((c) => c.title)).toEqual(
        cards.filter((c) => gateCards.test(c.title ?? "")).map((c) => c.title)
      );
    }
    const mtr = hassOf(
      "mtr",
      { name: "Hall MTR-1", manufacturer: "ApolloAutomation", model: "MTR-1" },
      {
        [`select.${MTR}_zone_type`]: { options: ["Disabled", "Detection", "Filter"] },
        [`number.${MTR}_timeout`]: TIMEOUT,
        [`number.${MTR}_zone_1_x1`]: { mode: "box", min: -4860, max: 4860, step: 1 },
        [`sensor.${MTR}_target_1_x`]: {},
      }
    );
    const sections = buildDeviceSections(mtr, detectRadarDevices(mtr)[0]);
    expect(JSON.stringify(sections)).toContain("LD2450 Controls");
    expect(JSON.stringify(sections)).not.toMatch(LOCKED);
  });

  it("leaves a number Home Assistant draws as a box unlocked, with no lock row for it alone", () => {
    const m = LD2410_PROFILE.entityMap(MSR);
    const box = { mode: "box", min: 0, max: 100, step: 1 };
    const moveBoxes = Object.fromEntries(m.move_threshold.map((id) => [id, box]));
    const cards = cardsOf(msrHass(moveBoxes));
    const move = byTitle(cards, "LD2410 Move Thresholds").entities;
    expect(move).toHaveLength(9);
    expect(move[0]).toEqual({ entity: m.move_threshold[0], name: "G0 (at the sensor)" });
    expect(JSON.stringify(move)).not.toMatch(LOCKED);
    // The still thresholds are sliders still.
    expect(byTitle(cards, "LD2410 Still Thresholds").entities[0]).toEqual({
      type: LOCK,
      device_id: "msr",
    });
  });

  it("keeps the lock on a DIY radar whose numbers report no mode", () => {
    // deviceHass() has no registry model and empty attributes.
    const move = buildDeviceCards(deviceHass(), ld2410Dev).find(
      (c: any) => c.title === "LD2410 Move Thresholds"
    ) as any;
    expect(move.entities).toEqual([
      { type: LOCK, device_id: "dev1" },
      slider(m410.move_threshold[0], "G0 (at the sensor)", "dev1"),
    ]);
  });

  it("keeps the three cards as Home Assistant's entities cards, in the same columns", () => {
    const sections = buildDeviceSections(msrHass(), detectRadarDevices(msrHass())[0]);
    for (const title of ["LD2410 Detection Range", "LD2410 Move Thresholds", "LD2410 Still Thresholds"]) {
      const card = sections.flatMap((s) => s.cards).find((c: any) => c.title === title);
      expect(card).toMatchObject({ type: "entities", show_header_toggle: false });
    }
  });
});
