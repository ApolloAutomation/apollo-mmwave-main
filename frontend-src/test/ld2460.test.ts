/**
 * An LD2460: detection, its entities, its dashboard tab, its Radar setup card
 * and its zone map. A device with an LD2412 and an LD2460, registered as Home
 * Assistant registers ESPHome's sensors (fixtures/ld2460-ceiling-radar.json),
 * X and Y in ft as Home Assistant shows them on a US customary install.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import radar from "./fixtures/ld2460-ceiling-radar.json";
import mountCases from "./fixtures/mount-cases.json";
import type { HassEntity, HomeAssistant } from "../src/types";
import { hasLd2450Device, ld2450EntityIds } from "../src/ld2450";
import {
  CEILING_HEIGHT,
  LD2460_LOOK_DOWN_HALF_DEG,
  LD2460_SIDE_CONE,
  LD2460_TOP_CONE,
  LD2460_TOP_RANGE_MM,
  ceilingRadiusMm,
  mountRule,
  hasLd2460Device,
  ld2460EntityIds,
  ld2460Mount,
  trackerOf,
} from "../src/ld2460";
import { ld2460Entities } from "../src/ld2460-entities";
import { ld2450Entities } from "../src/ld2450-entities";
import { apolloModelInfo, LD2412_PROFILE } from "../src/profiles";
import { apolloDeviceInfo } from "../src/apollo-device";
import {
  COMBINED_AUTOMATIONS,
  LD2460_MOUNT_NOTE,
  LD2450_TIMEOUT_NOTE,
  buildDeviceCards,
  buildDeviceSections,
  detectRadarDevices,
} from "../src/strategy-core";
import {
  LD2460_MODE_UNREAD,
  LD2460_NOTHING_TO_CHECK_LINE,
  ld2460SetupStatus,
  ld2460TargetsLine,
} from "../src/cards/tracker-setup-checks";
import { ApolloRadarSetupCard } from "../src/cards/setup-card";
import { LD2460_TRAIL_PAIR_MS, TrailBuffer } from "../src/zone-map/trails";
import { ZoneMapCard } from "../src/zone-map/card";
import { ZONES_GET } from "../src/zone-map/api";
import { firstTrackerDeviceId } from "../src/zone-map/editor";
import { shouldRegenerate } from "../src/strategy";

const DEV = radar.device_id;
const B = "ceiling_radar";
const T = "ceiling_radar_old";
const X1 = `sensor.${T}_ld2460_target_1_x`;
const Y1 = `sensor.${T}_ld2460_target_1_y`;
const X2 = `sensor.${B}_ld2460_target_2_x`;
const Y2 = `sensor.${B}_ld2460_target_2_y`;
const COUNT = `sensor.${B}_ld2460_presence_target_count`;
const MODE = `sensor.${B}_ld2460_installation_mode`;
const FT = { unit_of_measurement: "ft", device_class: "distance" };

/** Live-looking states: two people, target 1 3 m right and 2.1 m out. */
const LIVE: Record<string, [string, Record<string, any>?]> = {
  [X1]: ["9.84251968503937", FT],
  [Y1]: ["6.88976424885547", FT],
  [`sensor.${T}_ld2460_target_1_distance`]: ["12.01", FT],
  [`sensor.${T}_ld2460_target_1_angle`]: ["55.0", { unit_of_measurement: "°" }],
  [X2]: ["-3.28083989501312", FT],
  [Y2]: ["8.20209973753281", FT],
  [`sensor.${B}_ld2460_target_2_distance`]: ["8.83", FT],
  [`sensor.${B}_ld2460_target_2_angle`]: ["-21.8", { unit_of_measurement: "°" }],
  [COUNT]: ["2.0"],
  [`binary_sensor.${B}_ld2460_presence`]: ["on"],
  [`binary_sensor.${B}_combined_presence`]: ["on"],
  [`binary_sensor.${B}_ld2412_presence`]: ["unknown"],
  [`switch.${B}_ld2412_engineering_mode`]: ["off"],
};

interface Options {
  mode?: string;
  model?: string;
  drop?: RegExp;
  extra?: string[];
  states?: boolean;
}

/** A hass holding the device as registered, and its live-looking states. */
function radarHass(options: Options = {}): HomeAssistant {
  const entities: HomeAssistant["entities"] = {};
  const states: Record<string, HassEntity> = {};
  const ids = radar.entities.filter((e) => !options.drop?.test(e.entity_id));
  const all = [...ids, ...(options.extra ?? []).map((entity_id) => ({ entity_id, platform: "esphome" }))];
  if (options.mode !== undefined) all.push({ entity_id: MODE, platform: "esphome" });
  for (const { entity_id, platform } of all) {
    entities[entity_id] = { device_id: DEV, platform };
    if (options.states === false) continue;
    const [state, attributes] = LIVE[entity_id] ?? ["unknown", {}];
    states[entity_id] = { entity_id, state, attributes: attributes ?? {} };
  }
  if (options.mode !== undefined && options.states !== false) {
    states[MODE] = { entity_id: MODE, state: options.mode, attributes: {} };
  }
  return {
    states,
    entities,
    devices: { [DEV]: { ...radar.device, model: options.model ?? radar.device.model } },
    config: { unit_system: { length: "mi" } },
  } as HomeAssistant;
}

const NO_LD2412 = /ld2412|combined_presence/;

describe("LD2460 detection", () => {
  it("finds the LD2460 by its X, under either base", () => {
    const hass = radarHass();
    expect(hasLd2460Device(hass, DEV)).toBe(true);
    expect(hasLd2450Device(hass, DEV)).toBe(false);
    expect(ld2450EntityIds(hass, DEV)).toEqual([]);
    expect(ld2460EntityIds(hass, DEV)).toContain(X1);
    expect(ld2460EntityIds(hass, DEV)).toContain(COUNT);
    expect(trackerOf(hass, DEV)).toBe("ld2460");
  });

  it("reads a _2 dedup tail", () => {
    const hass = radarHass({ drop: /ld2460_target_\d_x$/, extra: [`sensor.${B}_ld2460_target_3_x_2`] });
    expect(hasLd2460Device(hass, DEV)).toBe(true);
  });

  it("lets LD2460 entities win over stale LD2450 ones, and LD2450 ones over the model", () => {
    const stale = radarHass({ extra: [`sensor.${B}_ld2450_target_1_x`] });
    expect(trackerOf(stale, DEV)).toBe("ld2460");
    expect(detectRadarDevices(stale)[0]).toMatchObject({ ld2460: true, ld2450: false });

    const built450 = radarHass({
      drop: /ld2460/,
      extra: [`sensor.${B}_ld2450_target_1_x`, `sensor.${B}_ld2450_target_1_y`],
    });
    expect(trackerOf(built450, DEV)).toBe("ld2450");
    expect(detectRadarDevices(built450)[0]).toMatchObject({ ld2460: false, ld2450: true });
  });

  it("falls back to a listed model with no tracker entities", () => {
    expect(trackerOf(radarHass({ drop: /ld2460/ }), DEV)).toBeUndefined();
    expect(trackerOf(radarHass({ drop: /ld2460/, model: "R-PRO-1-W" }), DEV)).toBe("ld2450");
  });

  it("derives an unknown Apollo model's radars from its entities", () => {
    const info = (model: string) => apolloModelInfo({ manufacturer: "ApolloAutomation", model });
    expect(info("XR-7")).toBeUndefined();
    expect(info("R-PRO-1-W")?.ld2460).toBe(false);
    expect(apolloDeviceInfo(radarHass(), DEV)).toEqual({
      profile: LD2412_PROFILE,
      ld2450: false,
      ld2460: true,
      derived: true,
    });
    expect(apolloDeviceInfo(radarHass({ model: "R-PRO-1-W" }), DEV)).toEqual(info("R-PRO-1-W"));
  });

  it("reads only side and top as a mount", () => {
    expect(ld2460Mount("side")).toBe("side");
    expect(ld2460Mount("top")).toBe("top");
    expect(ld2460Mount("unknown")).toBeUndefined();
    expect(ld2460Mount(undefined)).toBeUndefined();
  });
});

describe("LD2460 entities", () => {
  it("resolves the mode, the count, presence and targets 1 to 5", () => {
    const l = ld2460Entities(radarHass({ mode: "side" }), DEV);
    expect(l.installation_mode).toBe(MODE);
    expect(l.target_count).toBe(COUNT);
    expect(l.presence).toBe(`binary_sensor.${B}_ld2460_presence`);
    expect(l.targets.map((t) => t.x)).toEqual([
      X1,
      X2,
      `sensor.${B}_ld2460_target_3_x`,
      `sensor.${B}_ld2460_target_4_x`,
      `sensor.${B}_ld2460_target_5_x`,
    ]);
    expect(l.targets[0].angle).toBe(`sensor.${T}_ld2460_target_1_angle`);
  });

  it("skips this integration's own entities", () => {
    const hass = radarHass();
    hass.entities[`sensor.${B}_zone_1_ld2460_presence_target_count`] = {
      device_id: DEV,
      platform: "apollo_mmwave",
    };
    const fresh = { ...hass, entities: { ...hass.entities } };
    expect(ld2460Entities(fresh, DEV).target_count).toBe(COUNT);
  });

  it("is never read as the LD2450's target distance", () => {
    const l = ld2450Entities(radarHass(), DEV);
    expect(l.targets.every((t) => t.distance === undefined)).toBe(true);
  });
});

describe("an LD2460 device's tab", () => {
  const titles = (cards: Record<string, any>[]) =>
    cards.map((c) => c.title ?? c.heading ?? c.cards?.[0]?.title ?? c.type);

  it("lays out the LD2412's cards and the LD2460's zone map", () => {
    const hass = radarHass({ mode: "side" });
    const [dev] = detectRadarDevices(hass);
    expect(dev).toMatchObject({ ld2460: true, ld2450: false, profile: LD2412_PROFILE, online: true });
    const sections = buildDeviceSections(hass, dev);
    expect(sections.map((s) => titles(s.cards))).toEqual([
      ["markdown", "custom:apollo-radar-setup-card", "Auto-calibrate", "LD2412 Controls", "LD2412 Target / Occupancy"],
      ["Zone Map", "custom:apollo-radar-setup-card", dev.name],
      [ "Zone presence", "LD2460 Live"],
      ["LD2412 Distances", "LD2412 Detection Range", "markdown"],
      ["LD2412 Gate Energy", "LD2412 Move Thresholds", "markdown"],
      ["Occupancy History", "LD2412 Still Thresholds", "Device"],
    ]);
    const setup = sections[1].cards[1];
    expect(setup).toEqual({
      type: "custom:apollo-radar-setup-card",
      device_id: DEV,
      radar: "ld2460",
      grid_options: { columns: "full" },
    });
    expect(sections[1].cards[2]).toMatchObject({
      type: "custom:apollo-radar-zone-map-card",
      device_id: DEV,
    });
    expect(sections[1].cards[2].cone).toBeUndefined();
  });

  it("shows LD2460 Live with its rows, count and mount note", () => {
    const hass = radarHass({ mode: "side" });
    const [dev] = detectRadarDevices(hass);
    const live = buildDeviceCards(hass, dev).find((c) => c.cards?.[0]?.title === "LD2460 Live")!;
    expect(live.cards[0].entities.map((r: any) => r.name)).toEqual([
      "LD2460 Presence",
      "Installation Mode",
      ...[1, 2, 3, 4, 5].flatMap((n) => [`Target ${n} Distance`, `Target ${n} Angle`]),
    ]);
    expect(live.cards[0].state_color).toBe(true);
    expect(live.cards[1].content).toContain(`states('${COUNT}')`);
    expect(live.cards[1].content).toContain("Target Count:");
    expect(live.cards[2].content).toBe(LD2460_MOUNT_NOTE);
  });

  it("leaves out the mount note without an installation mode", () => {
    const hass = radarHass();
    const [dev] = detectRadarDevices(hass);
    const cards = buildDeviceCards(hass, dev);
    const live = cards.find((c) => c.cards?.[0]?.title === "LD2460 Live")!;
    expect(live.cards).toHaveLength(2);
  });

  it("keeps the setup card for the target count check alone", () => {
    const hass = radarHass();
    const [dev] = detectRadarDevices(hass);
    expect(buildDeviceCards(hass, dev).some((c) => c.radar === "ld2460")).toBe(true);
    const bare = radarHass({ drop: /target_count/ });
    const [alone] = detectRadarDevices(bare);
    expect(buildDeviceCards(bare, alone).some((c) => c.radar === "ld2460")).toBe(false);
  });

  it("has nothing of the LD2450's", () => {
    const hass = radarHass({ mode: "side" });
    const [dev] = detectRadarDevices(hass);
    const text = JSON.stringify(buildDeviceCards(hass, dev));
    expect(text).not.toContain("LD2450");
    expect(text).not.toContain(LD2450_TIMEOUT_NOTE);
    expect(text).not.toContain("built-in zones");
    expect(text).not.toMatch(/\bmm\b/);
  });

  it("says what each radar is for and where to start", () => {
    const hass = radarHass({ mode: "side" });
    const [dev] = detectRadarDevices(hass);
    const help = buildDeviceCards(hass, dev)[0].content as string;
    expect(help).toContain(
      "The **LD2412** senses people anywhere in range, even sitting still. The **LD2460**" +
        " tracks where up to 5 people are and drives the zone map."
    );
    expect(help).toContain(
      "For the LD2460, check **Installation Mode** under LD2460 Live (side for a wall, top" +
        " for a ceiling), fix anything Radar setup flags above the zone map, choose **Wall** or" +
        " **Ceiling** under Map settings on the zone map (a radar that reports its mount sets" +
        " this itself), set **Cone rotation** (**Map rotation** on a ceiling) to match how the" +
        " sensor is mounted, then press **Add zone**, draw the zone and walk into it."
    );
    expect(help).toContain(COMBINED_AUTOMATIONS);
  });

  it("names the restart and the history for both radars", () => {
    const hass = radarHass({ mode: "side" });
    const [dev] = detectRadarDevices(hass);
    const cards = buildDeviceCards(hass, dev);
    expect(JSON.stringify(cards)).toContain("Restart device (both radars)");
    const history = cards.find((c) => c.type === "history-graph")!;
    expect(history.entities.map((r: any) => r.name ?? r.entity)).toEqual([
      "LD2412 Presence",
      "LD2412 Moving",
      "LD2412 Still",
      "LD2460 Presence",
      `binary_sensor.${B}_zone_1_presence`,
    ]);
  });

  it("gives an LD2460 alone its own help and layout", () => {
    const hass = radarHass({ drop: NO_LD2412, mode: "top" });
    const [dev] = detectRadarDevices(hass);
    const sections = buildDeviceSections(hass, dev);
    // No LD2412 entities, so no LD2412 cards.
    expect(dev.profile).toBeUndefined();
    expect(sections.map((s) => titles(s.cards))).toEqual([
      ["markdown", "custom:apollo-radar-setup-card", dev.name],
      ["Zone presence", "LD2460 Live", "Occupancy History", "Device"],
    ]);
    const help = sections[0].cards[0].content as string;
    expect(help).toContain("Apollo mmWave (LD2460 tracking radar).");
    expect(help).toContain("Check **Installation Mode** under LD2460 Live");
    // Then the mount, then the rotation, each its own step.
    expect(help).toContain(
      "3. Under Map settings on the zone map, choose **Wall** or **Ceiling**. A radar that" +
        " reports its mount sets this itself.\n4. Set **Cone rotation** (**Map rotation** on a" +
        " ceiling) under Map settings to match how the sensor is mounted."
    );
    expect(help).toContain("or **LD2460 Presence** for anywhere the radar sees.");
  });

  it("keeps an offline Apollo device a tracker tab from its registered entities", () => {
    const hass = radarHass({ states: false });
    const [dev] = detectRadarDevices(hass);
    expect(dev).toMatchObject({ ld2460: true, online: false });
    const help = buildDeviceCards(hass, dev)[0].content as string;
    expect(help).toContain("**Offline right now.**");
    expect(buildDeviceCards(hass, dev).some((c) => c.type === "custom:apollo-radar-zone-map-card")).toBe(true);
  });
});

describe("regenerating an LD2460 device's tab", () => {
  it("rebuilds when the tracker flips, not when the mount does", () => {
    const ld2460 = radarHass({ mode: "side" });
    const ld2450 = radarHass({
      mode: "side",
      drop: /ld2460_target/,
      extra: [`sensor.${B}_ld2450_target_1_x`, `sensor.${B}_ld2450_target_1_y`],
    });
    expect(shouldRegenerate({}, ld2460, ld2450)).toBe(true);
    const top = { ...ld2460, states: { ...ld2460.states, [MODE]: { entity_id: MODE, state: "top", attributes: {} } } };
    expect(shouldRegenerate({}, ld2460, top)).toBe(false);
  });
});

describe("the LD2460 Radar setup checks", () => {
  it("is all good on a read mount", () => {
    expect(ld2460SetupStatus(radarHass({ mode: "side" }), DEV)).toEqual({ kind: "checked", problems: [] });
  });

  it("warns while the mode reads unknown", () => {
    const status = ld2460SetupStatus(radarHass({ mode: "unknown" }), DEV);
    expect(status.kind === "checked" && status.problems.map((p) => [p.level, p.text, !!p.fix])).toEqual([
      ["warning", LD2460_MODE_UNREAD, false],
    ]);
  });

  it("notes more people than the firmware sends targets for", () => {
    const hass = radarHass({ mode: "side", drop: /ld2460_target_[345]_/ });
    hass.states[COUNT] = { entity_id: COUNT, state: "3.0", attributes: {} };
    const status = ld2460SetupStatus(hass, DEV);
    expect(status.kind === "checked" && status.problems.map((p) => p.text)).toEqual([
      ld2460TargetsLine(3, 2),
    ]);
  });

  it("is offline, or has nothing to check", () => {
    const offline = radarHass({ mode: "side" });
    for (const id of Object.keys(offline.states)) offline.states[id] = { ...offline.states[id], state: "unavailable" };
    expect(ld2460SetupStatus(offline, DEV)).toEqual({ kind: "offline" });
    expect(ld2460SetupStatus(radarHass({ drop: /ld2460/ }), DEV)).toEqual({ kind: "nothing_to_check" });
    expect(LD2460_NOTHING_TO_CHECK_LINE).toContain("LD2460");
  });

  it("renders without a units read, and the stub picks the LD2460", async () => {
    const hass: any = radarHass({ mode: "unknown" });
    hass.user = { is_admin: true };
    hass.callWS = vi.fn(async () => ({ targets: [] }));
    const card = new ApolloRadarSetupCard();
    card.setConfig({ type: "custom:apollo-radar-setup-card", device_id: DEV, radar: "ld2460" });
    card.hass = hass;
    document.body.appendChild(card);
    await card.updateComplete;
    const text = card.shadowRoot!.textContent!;
    expect(text).toContain("LD2460 · Ceiling Radar");
    expect(text).toContain(LD2460_MODE_UNREAD);
    expect(card.shadowRoot!.querySelector("button")).toBeNull();
    expect(hass.callWS.mock.calls.map((c: any[]) => c[0].type)).not.toContain(
      "apollo_mmwave/target_units/get"
    );
    card.remove();
    expect(ApolloRadarSetupCard.getStubConfig(hass)).toEqual({
      type: "custom:apollo-radar-setup-card",
      device_id: DEV,
      radar: "ld2460",
    });
  });
});

describe("the LD2460 zone map", () => {
  afterEach(() => window.localStorage.clear());

  function mapHass(mode?: string): any {
    const hass: any = radarHass({ mode });
    hass.callWS = vi.fn(async (msg: any) =>
      msg.type === ZONES_GET
        ? {
            zones: {},
            entities: null,
            rotation_deg: 0,
            suggested_entities: [
              { x: X1, y: Y1 },
              { x: X2, y: Y2 },
            ],
          }
        : []
    );
    hass.connection = { subscribeMessage: vi.fn(async () => () => {}) };
    return hass;
  }

  async function mount(hass: any, config: Record<string, any> = {}) {
    const card: any = new ZoneMapCard();
    card.setConfig({ device_id: DEV, ...config });
    card.hass = hass;
    await vi.waitFor(() => expect(card._zoneConfigPayload || card._loadError).toBeTruthy());
    return card;
  }

  it("draws a side mount's cone, and a top mount's circle, following the mode", async () => {
    const hass = mapHass("side");
    const card = await mount(hass);
    expect([card.coneYMax, card.coneFovDeg]).toEqual([LD2460_SIDE_CONE.yMax, LD2460_SIDE_CONE.fovDeg]);

    const top = { ...hass, states: { ...hass.states, [MODE]: { entity_id: MODE, state: "top", attributes: {} } } };
    card.hass = top;
    expect([card.coneYMax, card.coneFovDeg]).toEqual([LD2460_TOP_CONE.yMax, LD2460_TOP_CONE.fovDeg]);
    // Feet first: the fixture's unit system is US customary.
    expect(card._rangeText()).toBe("13 ft (4 m) around the radar");
    // A fitted grid sits evenly around a ceiling radar.
    expect(card.xMin).toBe(-card.xMax);
    expect(card.yMin).toBeLessThan(0);
  });

  it("keeps a YAML cone", async () => {
    const hass = mapHass("top");
    const card = await mount(hass, { cone: { y_max: 5000, fov_deg: 100 } });
    expect([card.coneYMax, card.coneFovDeg]).toEqual([5000, 100]);
  });

  it("puts the targets where the radar reports them, in mm", async () => {
    const card = await mount(mapHass("side"));
    const targets = card._currentTargets();
    expect(targets.map((t: any) => [t.slot, Math.round(t.x), Math.round(t.y)])).toEqual([
      [0, 3000, 2100],
      [1, -1000, 2500],
    ]);
  });

  it("neither waits for the other axis nor takes back a real X = 0", async () => {
    const hass = mapHass("side");
    const card = await mount(hass);
    expect(card._trails._pairMs).toBe(LD2460_TRAIL_PAIR_MS);
    const at = (x: string) => ({ ...hass, states: { ...hass.states, [X1]: { entity_id: X1, state: x, attributes: FT } } });
    card.hass = at("0");
    expect(card._trailReadings.get(0)).toMatchObject({ x: 0, halfVanished: false });
  });

  it("is offered by the stub with no cone", () => {
    const hass = radarHass();
    expect(firstTrackerDeviceId(hass)).toBe(DEV);
    const stub = (ZoneMapCard as any).getStubConfig(hass);
    expect(stub.device_id).toBe(DEV);
    expect(stub.cone).toBeUndefined();
  });
});

describe("LD2460 trails", () => {
  it("make every sample final at once", () => {
    const trails = new TrailBuffer(LD2460_TRAIL_PAIR_MS);
    trails.push(0, 0, 1000, 2000);
    trails.push(0, 100, 1300, 2000);
    expect(trails.takeFinal(200).map((s) => [s.x, s.y])).toEqual([
      [1000, 2000],
      [1300, 2000],
    ]);
    trails.push(0, 300, 1300, 2400);
    trails.gone(0, 310);
    expect(trails.samples(0).map((s) => [s.x, s.y])).toEqual([
      [1000, 2000],
      [1300, 2000],
      [1300, 2400],
    ]);
  });
});

describe("LD2460 fixture", () => {
  // A live capture must not replace these made-up ids.
  it("uses a made-up device id and generic names", () => {
    expect(radar.device_id).toBe("0000000000000000000000000000d246");
    for (const { entity_id } of radar.entities) {
      expect(entity_id.slice(entity_id.indexOf(".") + 1)).toMatch(/^ceiling_radar_(?:old_)?[a-z0-9_]+$/);
    }
    expect(radar.device.name).toBe("Ceiling Radar");
    expect(radar.device.model).toBe("XR-7");
  });
});

describe("the LD2460's mount and ceiling coverage", () => {
  it.each(mountCases.mount.map((c) => [JSON.stringify(c), c] as const))(
    "reads the mount in effect as trackers.py does: %s",
    (_name, c) => {
      expect(mountRule(c.tracker, c.mode_state, c.saved as string | null)).toEqual(c.expect);
    }
  );

  it.each(mountCases.radius.map((c) => [c.height_mm, c.radius_mm] as const))(
    "covers a circle of the shared radius at %i mm",
    (height, radius) => {
      expect(Math.abs(ceilingRadiusMm(height) - radius)).toBeLessThan(0.05);
    }
  );

  it("never covers past 4 m, and never less from higher up", () => {
    let last = 0;
    for (let h = 1500; h <= 5000; h += 10) {
      const r = ceilingRadiusMm(h);
      expect(r).toBeLessThanOrEqual(LD2460_TOP_RANGE_MM);
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
    // The cap starts at 4000 / tan 60°, about 2309.4 mm.
    expect(ceilingRadiusMm(2309)).toBeLessThan(4000);
    expect(ceilingRadiusMm(2310)).toBe(4000);
    expect(ceilingRadiusMm(NaN)).toBe(4000);
  });

  it("names the bounds the backend holds", () => {
    expect(CEILING_HEIGHT).toEqual({ minMm: 2000, defaultMm: 2700, maxMm: 4000 });
    expect(LD2460_LOOK_DOWN_HALF_DEG).toBe(60);
    expect(LD2460_TOP_CONE.yMax).toBe(LD2460_TOP_RANGE_MM);
  });

  it("says where to choose the mount when the radar does not say", () => {
    expect(LD2460_MOUNT_NOTE).toBe(
      "💡 **Installation Mode** is read from the radar when the device starts: side for a" +
        " wall, top for a ceiling. If it is missing or unknown, choose **Wall** or **Ceiling**" +
        " under Map settings on the zone map."
    );
    expect(LD2460_MODE_UNREAD.endsWith(
      " Until it answers, the zone map uses the mount chosen under Map settings."
    )).toBe(true);
  });
});
