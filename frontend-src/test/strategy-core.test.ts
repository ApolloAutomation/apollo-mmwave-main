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
  ZONE_PRESENCE_HINT,
  ZONE_PRESENCE_TITLE,
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

  it("places the calibrate card right after the help card with the device ids", () => {
    expect(cards[0].type).toBe("markdown");
    expect(cards[1]).toMatchObject({
      type: "custom:apollo-radar-calibrate-card",
      device_id: "dev1",
      device_base_name: base,
      title: "Auto-calibrate",
    });
    expect(cards[1]).not.toHaveProperty("calibration");
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
    expect(notes(deviceHass())).toContain(LD2410_PROFILE.rangeTip);

    const noRange = deviceHassWithout(m410.radar_timeout!, m410.max_move_distance!);
    expect(titles(noRange)).not.toContain("LD2410 Detection Range");
    expect(notes(noRange)).not.toContain(LD2410_PROFILE.rangeTip);
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
      hours_to_show: 1,
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
  it("is the first card of the first section for an LD2410 device", () => {
    const sections = buildDeviceSections(deviceHass(), ld2410Dev, "in");
    expect(sections[0].cards[0].type).toBe("custom:apollo-radar-calibrate-card");
    expect(sections[0].cards[1].type).toBe("markdown");
  });

  it("is the first card of the first section for an LD2412 device", () => {
    const b = "apollo_r_pro_1_abcd";
    const id = `switch.${b}_ld2412_engineering_mode`;
    const hass: HomeAssistant = {
      states: { [id]: { entity_id: id, state: "off", attributes: {} } },
      entities: { [id]: { device_id: "rpro" } },
      devices: { rpro: { name: "Office R-PRO-1" } },
    };
    const dev = detectRadarDevices(hass)[0];
    const sections = buildDeviceSections(hass, dev);
    expect(sections[0].cards[0]).toMatchObject({
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
    expect(sections[0].cards[0].type).toBe("custom:apollo-radar-calibrate-card");
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

  const LD2412_COLUMNS = [
    ["Auto-calibrate", "markdown", "LD2412 Controls", "LD2412 Target / Occupancy"],
    ["LD2412 Distances", "LD2412 Detection Range", "markdown"],
    ["LD2412 Gate Energy", "LD2412 Move Thresholds", "markdown"],
    ["LD2412 Occupancy History"],
  ];

  it("lays an MSR-2 out in four grid columns, occupancy in column 2", () => {
    const sections = buildDeviceSections(deviceHass(), ld2410Dev);
    for (const section of sections) expect(section.type).toBe("grid");
    expect(layout(sections)).toEqual([
      ["Auto-calibrate", "markdown", "LD2410 Controls", "LD2410 Zone Config"],
      [
        "LD2410 Distances",
        "LD2410 Detection Range",
        "markdown",
        "LD2410 Target / Occupancy",
      ],
      ["LD2410 Gate Energy", "LD2410 Move Thresholds", "markdown"],
      ["LD2410 Occupancy History"],
    ]);
  });

  it("moves occupancy into column 1 on a DIY LD2412, which has no Zone Config", () => {
    const hass = ld2412Hass({ name: "Office radar" }, false);
    const [dev] = detectRadarDevices(hass);
    expect(dev.profile?.key).toBe("ld2412");
    expect(dev.ld2450).toBe(false);
    const sections = buildDeviceSections(hass, dev);
    for (const section of sections) expect(section.type).toBe("grid");
    expect(layout(sections)).toEqual(LD2412_COLUMNS);
  });

  it("adds the Zone Map sections after the tuning columns on an R-PRO-1", () => {
    const hass = ld2412Hass(
      { name: "Office R-PRO-1", manufacturer: "ApolloAutomation", model: "R-PRO-1-W" },
      true
    );
    const [dev] = detectRadarDevices(hass);
    expect(dev.ld2450).toBe(true);
    const sections = buildDeviceSections(hass, dev);
    // The tuning columns are unchanged; the zone map gets the fifth section
    // and its LD2450 cards a sixth. This fixture has only a target sensor,
    // so there is no setup card and only the zone presence hint.
    expect(sections).toHaveLength(6);
    expect(layout(sections.slice(0, 4))).toEqual(LD2412_COLUMNS);
    expect(sections[4].type).toBe("grid");
    expect(sections[4].cards).toHaveLength(2);
    expect(sections[4].cards[0]).toEqual({ type: "heading", heading: "Zone Map" });
    expect(sections[4].cards[1]).toMatchObject({
      type: "custom:apollo-radar-zone-map-card",
      device_id: "rpro",
    });
    expect(sections[5].type).toBe("grid");
    expect(sections[5].cards).toEqual([
      { type: "markdown", title: ZONE_PRESENCE_TITLE, content: ZONE_PRESENCE_HINT },
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
    const help = buildDeviceSections(hass, dev)[0].cards[1];
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
  it("point the gate tip at the calibrate card and explain the timeout in the range tip", () => {
    for (const profile of [LD2410_PROFILE, LD2412_PROFILE]) {
      expect(profile.gateTip).toContain("Calibrate with empty room");
      expect(profile.rangeTip).toContain("**Radar Timeout** is how long presence stays on");
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
  /** The Factory Reset Radar row, which asks before it presses. */
  const factoryReset = (entity: string, chip: string) => ({
    type: "button",
    entity,
    name: "Factory Reset Radar",
    action_name: "Reset",
    tap_action: {
      action: "perform-action",
      perform_action: "button.press",
      target: { entity_id: entity },
      confirmation: {
        text: `Reset the ${chip} radar to its factory settings? It restarts and forgets its own settings.`,
      },
    },
  });

  it("puts the setup card above the zone map and the LD2450 cards beside it on an R PRO-1", () => {
    const hass = rproHass();
    const dev = deviceOf(hass);
    expect(dev.profile?.key).toBe("ld2412");
    const sections = buildDeviceSections(hass, dev);
    expect(sections).toHaveLength(6);
    expect(layout(sections.slice(0, 4))[0][0]).toBe("Auto-calibrate");
    expect(sections[4].cards.map((c: any) => c.type)).toEqual(["heading", SETUP, ZONE_MAP]);
    expect(sections[4].cards[1]).toEqual({ type: SETUP, device_id: "rpro" });
    expect(layout([sections[5]])).toEqual([
      [ZONE_PRESENCE_TITLE, "LD2450 Live", "LD2450 Controls", "conditional"],
    ]);
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
        { entity: `switch.${RPRO}_ld2450_bluetooth`, name: "Bluetooth" },
        { entity: `button.${RPRO}_ld2450_restart`, name: "Restart Radar" },
        factoryReset(`button.${RPRO}_ld2450_factory_reset`, "LD2450"),
      ],
    });
    // The LD2412's own Controls card keeps only LD2412 entities.
    const ld2412 = byTitle(cards, "LD2412 Controls");
    expect(ld2412.entities.every((r: any) => !r.entity.includes("ld2450"))).toBe(true);
  });

  it("asks before a factory reset on both radars' Controls cards", () => {
    const cards = buildDeviceCards(rproHass(), deviceOf(rproHass()));
    const m = LD2412_PROFILE.entityMap(RPRO);
    const resetRow = (title: string) =>
      byTitle(cards, title).entities.find((r: any) => r.name === "Factory Reset Radar");

    // HA's button row with a confirmation in its tap action asks first; a
    // plain button entity row presses on one tap.
    expect(resetRow("LD2412 Controls")).toEqual(factoryReset(m.factory_reset_radar!, "LD2412"));
    expect(resetRow("LD2450 Controls")).toEqual(
      factoryReset(`button.${RPRO}_ld2450_factory_reset`, "LD2450")
    );
    expect(resetRow("LD2450 Controls").tap_action.confirmation.text).toBe(
      "Reset the LD2450 radar to its factory settings? It restarts and forgets its own settings."
    );
    // Restart only restarts, and keeps its plain row.
    expect(byTitle(cards, "LD2450 Controls").entities).toContainEqual({
      entity: `button.${RPRO}_ld2450_restart`,
      name: "Restart Radar",
    });
  });

  it("adds Multi Target Tracking and Firmware once the user enables them", () => {
    const hass = rproHass({
      [`switch.${RPRO}_ld2450_multi_target_tracking`]: "on",
      [`sensor.${RPRO}_ld2450_firmware`]: "2.04",
    });
    const names = byTitle(buildDeviceCards(hass, deviceOf(hass)), "LD2450 Controls").entities.map(
      (r: any) => r.name
    );
    expect(names).toEqual([
      "Zone Type",
      "Multi Target Tracking",
      "Radar Timeout",
      "Bluetooth",
      "Restart Radar",
      "Factory Reset Radar",
      "Firmware",
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

  it("lays an MTR-1 out as setup and map, then status, then settings", () => {
    const hass = mtrHass();
    const dev = deviceOf(hass);
    expect(dev.profile).toBeUndefined();
    const sections = buildDeviceSections(hass, dev);
    expect(sections.map((s) => s.cards.map((c: any) => c.title ?? c.type))).toEqual([
      [SETUP, "Hall MTR-1"],
      [ZONE_PRESENCE_TITLE, "LD2450 Live"],
      ["LD2450 Controls", "conditional"],
    ]);
    expect(sections[0].cards[0]).toEqual({ type: SETUP, device_id: "mtr" });
    expect(sections[0].cards[1].type).toBe(ZONE_MAP);
    expect(buildDeviceCards(hass, dev).map((c) => c.title ?? c.type)).toEqual([
      "markdown",
      SETUP,
      "Hall MTR-1",
      ZONE_PRESENCE_TITLE,
      "LD2450 Live",
      "LD2450 Controls",
      "conditional",
    ]);
  });

  it("lists the MTR-1's controls in its own spelling and leaves the ESP buttons out", () => {
    const hass = mtrHass();
    const controls = byTitle(buildDeviceCards(hass, deviceOf(hass)), "LD2450 Controls");
    expect(controls.entities).toEqual([
      { entity: `select.${MTR}_zone_type`, name: "Zone Type" },
      { entity: `switch.${MTR}_multi_target_tracking`, name: "Multi Target Tracking" },
      { entity: `number.${MTR}_timeout`, name: "Radar Timeout" },
      { entity: `switch.${MTR}_ld2450_bluetooth`, name: "Bluetooth" },
      factoryReset(`button.${MTR}_factory_reset_ld2450`, "LD2450"),
      { entity: `sensor.${MTR}_ld2450_firmware`, name: "Firmware" },
    ]);
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

  it("keeps the offline note first on an offline MTR-1, then the setup card and map", () => {
    const hass = mtrHass([], () => "unavailable");
    const dev = deviceOf(hass);
    expect(dev.online).toBe(false);
    const sections = buildDeviceSections(hass, dev);
    expect(sections[0].cards).toHaveLength(1);
    expect(sections[0].cards[0].content).toContain("Offline right now");
    expect(sections[1].cards.map((c: any) => c.type)).toEqual([SETUP, ZONE_MAP]);
  });
});
