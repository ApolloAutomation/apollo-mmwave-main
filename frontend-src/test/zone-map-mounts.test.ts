/** An LD2450 zone map on Wall, High and Ceiling. */

import { describe, expect, it, vi } from "vitest";
import { ZoneMapCard } from "../src/zone-map/card";
import { ZONES_GET } from "../src/zone-map/api";
import { CELL_MM, CellGrid } from "../src/zone-map/cells";
import { rotateToMap } from "../src/zone-map/geometry";
import { formatDistance } from "../src/zone-map/format";
import { COVERAGE_ZONE_STEPS, footprintOutline, mountGeometry } from "../src/mounts";
import {
  ADMIN_ONLY_TITLE,
  CEILING_SIDE_EXPLAIN,
  COVERAGE_ZONE_LABEL,
  FIRMWARE_ZONES_NOTE,
  MOUNT_STATUS_DEFAULT_LD2450,
  MOUNT_STATUS_SAVED_CEILING_LD2450,
  MOUNT_STATUS_SAVED_HIGH,
  ROOM_ZONE_ADD_LABEL,
  TEST_CHECK_FAR,
  TEST_CHECK_NEAR,
  TEST_CHECK_WALL_LINE,
  TEST_LABEL,
  TEST_LABEL_CEILING_LD2450,
  TEST_LABEL_HIGH,
  TEST_NEAR,
  TEST_SIDE,
  TEST_WALL_LINE,
  TILT_LOCKED_TOAST,
  ceilingStripLine,
  highCoverageLine,
  testFar,
  testOut,
} from "../src/zone-map/copy";

const DEV = "devhall";
const B = "hallway_radar";
const MM = { unit_of_measurement: "mm", device_class: "distance" };
const PAIRS = [1, 2, 3].map((n) => ({ x: `sensor.${B}_target_${n}_x`, y: `sensor.${B}_target_${n}_y` }));
const LD2460_PAIRS = [1, 2].map((n) => ({
  x: `sensor.${B}_ld2460_target_${n}_x`,
  y: `sensor.${B}_ld2460_target_${n}_y`,
}));

type Options = { payload?: Record<string, any>; admin?: boolean; feet?: boolean; ld2460?: boolean };

function hassOf({ payload = {}, admin = true, feet = false, ld2460 = false }: Options = {}): any {
  const pairs = ld2460 ? LD2460_PAIRS : PAIRS;
  const ids = pairs.flatMap((p) => [p.x, p.y]);
  const states: Record<string, any> = {};
  ids.forEach((id) => {
    states[id] = { entity_id: id, state: "0", attributes: MM };
  });
  const hass: any = {
    states,
    entities: Object.fromEntries(ids.map((id) => [id, { device_id: DEV, platform: "esphome" }])),
    devices: { [DEV]: { id: DEV, name: "Hallway Radar", manufacturer: "Espressif", model: "esp32" } },
    config: { unit_system: { length: feet ? "mi" : "km" } },
    user: { is_admin: admin },
    payload: {
      zones: {},
      entities: null,
      rotation_deg: 0,
      label: null,
      suggested_entities: pairs,
      ...payload,
    },
    callService: vi.fn(async () => {}),
    connection: { subscribeMessage: vi.fn(async () => () => {}) },
  };
  hass.callWS = vi.fn(async (msg: any) => (msg.type === ZONES_GET ? hass.payload : []));
  return hass;
}

async function mount(hass: any, config: Record<string, any> = {}) {
  const card: any = new ZoneMapCard();
  card.setConfig({ device_id: DEV, start_locked: false, ...config });
  card.hass = hass;
  await vi.waitFor(() => expect(card._zoneConfigPayload || card._loadError).toBeTruthy());
  return card;
}

const $ = (card: any, id: string) => card.shadowRoot.getElementById(id);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function writes(hass: any): any[] {
  return hass.callService.mock.calls
    .filter((call: any[]) => call[1] === "update_zone")
    .map((call: any[]) => call[2]);
}

function toasts(card: any): string[] {
  const seen: string[] = [];
  card.addEventListener("hass-notification", (event: any) => seen.push(event.detail?.message));
  return seen;
}

function push(card: any, hass: any, changes: Record<string, any>) {
  hass.payload = { ...hass.payload, ...changes };
  card._applyZoneConfig(hass.payload);
}

/** The targets stand at raw `points` (mm); the other slots are empty. */
function at(card: any, hass: any, points: Array<[number, number]>) {
  const states = { ...hass.states };
  PAIRS.forEach((pair, i) => {
    const p = points[i] ?? [0, 0];
    states[pair.x] = { entity_id: pair.x, state: String(p[0]), attributes: MM };
    states[pair.y] = { entity_id: pair.y, state: String(p[1]), attributes: MM };
  });
  hass.states = states;
  card.hass = { ...hass, states };
}

function type(card: any, id: string, value: string) {
  const input = $(card, id);
  input.value = value;
  input.dispatchEvent(new Event("change"));
}

const HIGH = { mount: "high" };
const CEILING = { mount: "ceiling" };
const raw = (floorY: number, dz: number) => Math.sqrt(floorY * floorY + dz * dz);

describe("Mounted on, for an LD2450", () => {
  it("offers Wall, High and Ceiling, and an LD2460 only Wall and Ceiling", async () => {
    const card = await mount(hassOf());
    expect($(card, "mountOption").hidden).toBe(false);
    expect(["btnMountWall", "btnMountHigh", "btnMountCeiling"].map((id) => $(card, id).hidden)).toEqual([
      false,
      false,
      false,
    ]);
    expect($(card, "mountSwitch").classList.contains("three")).toBe(true);
    const ld2460 = await mount(hassOf({ ld2460: true }));
    expect($(ld2460, "btnMountHigh").hidden).toBe(true);
    expect($(ld2460, "mountSwitch").classList.contains("three")).toBe(false);
  });

  it("keeps a wall exactly as before: the cone, no new fields or tools", async () => {
    const card = await mount(hassOf());
    expect($(card, "mountStatus").textContent).toBe(MOUNT_STATUS_DEFAULT_LD2450);
    expect($(card, "btnMountWall").getAttribute("aria-checked")).toBe("true");
    expect($(card, "mountDetails").hidden).toBe(true);
    expect($(card, "ceilingHeightOption").hidden).toBe(true);
    expect($(card, "btnTestChip").hidden).toBe(true);
    expect($(card, "btnRoomZoneAdd").hidden).toBe(true);
    expect($(card, "historyMountNote").hidden).toBe(true);
    expect(card._footprint()).toBeUndefined();
    expect([card.coneYMax, card.coneFovDeg]).toEqual([6000, 120]);
    expect($(card, "coneRotationLabel").textContent).toBe("Cone rotation: ");
    expect(card._toMap(300, 1562)).toEqual({ x: 300, y: 1562 });
  });

  it("saves High at once, with only the mount, and shows its fields", async () => {
    const hass = hassOf();
    const card = await mount(hass);
    const said = toasts(card);
    $(card, "btnMountHigh").click();
    expect(writes(hass)).toEqual([{ device_id: DEV, mount: "high" }]);
    await settle();
    expect(said).toContain("Map set to a high mount");
    expect($(card, "mountStatus").textContent).toBe(MOUNT_STATUS_SAVED_HIGH);
    expect($(card, "mountDetails").hidden).toBe(false);
    expect(["mountHeightField", "tiltField", "personHeightField"].map((id) => $(card, id).hidden)).toEqual([
      false,
      false,
      false,
    ]);
    expect($(card, "flipSideOption").hidden).toBe(true);
    expect($(card, "ceilingSideExplain").hidden).toBe(true);
    expect($(card, "footprintLine").textContent).toBe(highCoverageLine("0.6 m", "5.9 m"));
    expect($(card, "highNearNote").hidden).toBe(false);
    expect($(card, "firmwareZonesNote").textContent).toBe(FIRMWARE_ZONES_NOTE);
    expect($(card, "historyMountNote").hidden).toBe(false);
    expect($(card, "coneRotationLabel").textContent).toBe("Cone rotation: ");
    expect($(card, "mountHeightInput").value).toBe("2.20");
    expect($(card, "personHeightInput").value).toBe("1.00");
    expect($(card, "tiltSlider").value).toBe("30");
  });

  it("words the coverage line in feet on a feet map", async () => {
    const card = await mount(hassOf({ feet: true, payload: HIGH }));
    expect($(card, "footprintLine").textContent).toBe(
      highCoverageLine(formatDistance(559.6, "ft"), formatDistance(5878.8, "ft"))
    );
    expect($(card, "mountHeightInput").value).toBe("7.2");
  });

  it("shows Ceiling's explanation, Flip room side and the strip", async () => {
    const card = await mount(hassOf({ payload: CEILING }));
    expect($(card, "mountStatus").textContent).toBe(MOUNT_STATUS_SAVED_CEILING_LD2450);
    expect($(card, "ceilingHeightOption").hidden).toBe(false);
    expect($(card, "ceilingCoverageLine").hidden).toBe(true);
    expect($(card, "mountHeightField").hidden).toBe(true);
    expect($(card, "tiltField").hidden).toBe(true);
    expect($(card, "ceilingSideExplain").textContent).toBe(CEILING_SIDE_EXPLAIN);
    expect($(card, "ceilingSideExplain").hidden).toBe(false);
    expect($(card, "flipSideOption").hidden).toBe(false);
    expect($(card, "ceilingStripNote").hidden).toBe(false);
    expect($(card, "footprintLine").textContent).toBe(ceilingStripLine("5.9 m", "1.2 m"));
    expect($(card, "coneRotationLabel").textContent).toBe("Map rotation: ");
    expect(card._isTopDown()).toBe(false);
  });

  it("lets only an administrator change anything, and says what is in use", async () => {
    const card = await mount(hassOf({ admin: false, payload: HIGH }));
    expect($(card, "mountStatus").textContent).toBe(MOUNT_STATUS_SAVED_HIGH);
    for (const id of ["btnMountWall", "btnMountHigh", "btnMountCeiling"]) {
      expect($(card, id).disabled).toBe(true);
      expect($(card, id).title).toBe(ADMIN_ONLY_TITLE);
    }
    for (const id of ["mountHeightInput", "personHeightInput", "tiltSlider"]) {
      expect($(card, id).disabled).toBe(true);
    }
  });
});

describe("High and Ceiling settings", () => {
  it("saves a mount height in mm, and a default to be forgotten", async () => {
    const hass = hassOf({ payload: HIGH });
    const card = await mount(hass);
    type(card, "mountHeightInput", "2.5");
    expect(writes(hass)).toEqual([{ device_id: DEV, mount_height_mm: 2500 }]);
    expect(card._storedMountHeightMm).toBe(2500);
    expect(card._mountInfo().geom.height_mm).toBe(2500);
    await settle();
    type(card, "mountHeightInput", "2.2");
    expect(writes(hass)[1]).toEqual({ device_id: DEV, mount_height_mm: 2200 });
    expect(card._storedMountHeightMm).toBeNull();
  });

  it("clamps a height out of range and says so, and saves nothing for a word", async () => {
    const hass = hassOf({ payload: HIGH });
    const card = await mount(hass);
    type(card, "mountHeightInput", "abc");
    expect(writes(hass)).toEqual([]);
    expect($(card, "mountHeightNote").hidden).toBe(false);
    type(card, "mountHeightInput", "9");
    expect(writes(hass)).toEqual([{ device_id: DEV, mount_height_mm: 4000 }]);
    expect($(card, "mountHeightNote").hidden).toBe(false);
  });

  it("saves the person height in feet as mm", async () => {
    const hass = hassOf({ feet: true, payload: CEILING });
    const card = await mount(hass);
    type(card, "personHeightInput", "2.5");
    expect(writes(hass)).toEqual([{ device_id: DEV, target_height_mm: 760 }]);
  });

  it("saves the tilt when let go, and never while locked", async () => {
    const hass = hassOf({ payload: HIGH });
    const card = await mount(hass);
    const slider = $(card, "tiltSlider");
    slider.value = "45";
    slider.dispatchEvent(new Event("input"));
    expect(card._footprint().y_near).toBeCloseTo(211.6, 0);
    expect(writes(hass)).toEqual([]);
    slider.dispatchEvent(new Event("change"));
    expect(writes(hass)).toEqual([{ device_id: DEV, tilt_deg: 45 }]);
    await settle();
    card._toggleLock();
    expect(slider.disabled).toBe(true);
    expect($(card, "tiltLockHint").hidden).toBe(false);
    const said = toasts(card);
    slider.value = "10";
    slider.dispatchEvent(new Event("change"));
    expect(writes(hass)).toHaveLength(1);
    expect(said).toContain(TILT_LOCKED_TOAST);
  });

  it("saves Flip room side as on, and off to forget it", async () => {
    const hass = hassOf({ payload: CEILING });
    const card = await mount(hass);
    const toggle = $(card, "flipSideToggle");
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    expect(writes(hass)).toEqual([{ device_id: DEV, flip_room_side: true }]);
    expect(card._mountInfo().geom.flip).toBe(true);
    await settle();
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    expect(writes(hass)[1]).toEqual({ device_id: DEV, flip_room_side: false });
  });

  it("puts a setting back when its save is refused", async () => {
    const hass = hassOf({ payload: HIGH });
    hass.callService = vi.fn(async () => {
      throw new Error("Unauthorized");
    });
    const card = await mount(hass);
    type(card, "mountHeightInput", "3");
    await vi.waitFor(() => expect(card._fieldSaves.mount_height_mm.state).toBe("failed"));
    expect(card._storedMountHeightMm).toBeNull();
  });

  it("reads a stored default, a wrong type or a value out of range as the default", async () => {
    const card = await mount(
      hassOf({
        payload: { mount: "high", mount_height_mm: 2200, tilt_deg: 61, target_height_mm: "900" },
      })
    );
    expect([card._storedMountHeightMm, card._storedTiltDeg, card._storedTargetHeightMm]).toEqual([
      null,
      null,
      null,
    ]);
    expect(card._mountInfo().geom).toMatchObject({ height_mm: 2200, tilt_deg: 30, target_height_mm: 1000 });
  });

  it("never offers High to an LD2460 with High saved", async () => {
    const card = await mount(hassOf({ ld2460: true, payload: HIGH }));
    expect(card._mountInfo().mount).toBe("wall");
    expect($(card, "mountDetails").hidden).toBe(true);
    expect(card._toMap(0, 1562)).toEqual({ x: 0, y: 1562 });
  });
});

describe("where targets are drawn", () => {
  it("draws a High target where it stands on the floor, rotation and all", async () => {
    const hass = hassOf({ payload: HIGH });
    const card = await mount(hass);
    const m = card._toMap(0, 1562);
    expect(m.x).toBeCloseTo(0, 6);
    expect(m.y).toBeCloseTo(1000, -1);
    push(card, hass, { rotation_deg: 90 });
    const turned = card._toMap(0, 1562);
    const expected = rotateToMap(0, Math.sqrt(1562 ** 2 - 1200 ** 2), 90);
    expect(turned.x).toBeCloseTo(expected.x, 6);
    expect(turned.y).toBeCloseTo(expected.y, 6);
  });

  it("puts a ceiling target on the room side, or the other with the flip", async () => {
    const hass = hassOf({ payload: CEILING });
    const card = await mount(hass);
    expect(card._toMap(800, 2000).y).toBeCloseTo(1053.6, 0);
    push(card, hass, { flip_room_side: true });
    expect(card._toMap(800, 2000).y).toBeCloseTo(-1053.6, 0);
    expect(card._toMap(0, 1600)).toEqual({ x: 0, y: -0 });
  });

  it("hides a target in an ignore zone by where it stands on the floor", async () => {
    const zones = {
      "1": { name: "Hall", shape: "rect", data: { x_min: -500, x_max: 500, y_min: 800, y_max: 1200 }, zone_type: "ignore" },
    };
    const hass = hassOf({ payload: { ...HIGH, zones } });
    const card = await mount(hass);
    at(card, hass, [[0, 1562]]);
    expect(card._walkTargets()).toEqual([]);
    push(card, hass, { mount: null });
    expect(card._walkTargets()).toHaveLength(1);
  });

  it("finishes Walk's corners on the floor", async () => {
    const card = await mount(hassOf({ payload: HIGH }));
    card._walk = { corners: [{ x: -1000, y: 1562 }, { x: 1000, y: raw(3000, 1200) }] };
    const corners = card._walkMapCorners();
    expect(corners).toEqual([
      { x: -1000, y: 1000 },
      { x: 1000, y: 3000 },
    ]);
  });

  it("draws a live trail where the target stood on the floor", async () => {
    const card = await mount(hassOf({ payload: HIGH }));
    const lines: number[][] = [];
    const ctx = new Proxy({} as any, {
      get: (target, prop) =>
        prop in target
          ? target[prop]
          : (...a: number[]) => {
              if (prop === "moveTo" || prop === "lineTo") lines.push(a);
            },
      set: (target, prop, value) => ((target[prop] = value), true),
    });
    card._drawTrail(ctx, [{ t: 1000, x: 0, y: 1562 }, { t: 1100, x: 0, y: raw(2000, 1200) }], 1200, "red");
    expect(lines[0][1]).toBeCloseTo(card.valueToPixels(Math.sqrt(1562 ** 2 - 1200 ** 2), "y"), 6);
    expect(lines[1][1]).toBeCloseTo(card.valueToPixels(2000, "y"), 6);
  });

  it("paints coverage and heat cells where people stood on the floor", async () => {
    const card = await mount(hassOf({ payload: HIGH }));
    const points: number[][] = [];
    const ctx = new Proxy({} as any, {
      get: (target, prop) =>
        prop in target
          ? target[prop]
          : (...a: number[]) => {
              if (prop === "moveTo" || prop === "lineTo") points.push(a);
            },
      set: (target, prop, value) => ((target[prop] = value), true),
    });
    const grid = new CellGrid();
    grid.add(10, 2010);
    card._drawCells(ctx, grid, "0, 0, 0");
    const iy = Math.floor(2010 / CELL_MM);
    const floor = (y: number) => Math.sqrt(y * y - 1200 * 1200);
    expect(points).toHaveLength(4);
    expect(points[0][1]).toBeCloseTo(card.valueToPixels(floor(iy * CELL_MM), "y"), 6);
    expect(points[2][1]).toBeCloseTo(card.valueToPixels(floor((iy + 1) * CELL_MM), "y"), 6);
  });

  it("points the ceiling puck at the room side", async () => {
    const hass = hassOf({ payload: CEILING });
    const card = await mount(hass);
    const room = card._puckFrame();
    push(card, hass, { flip_room_side: true });
    const flipped = card._puckFrame();
    expect(Math.sign(flipped.dirY)).toBe(-Math.sign(room.dirY));
  });

  it("replays History with the mount in use now, and says so", async () => {
    const card = await mount(hassOf({ payload: HIGH }));
    const slot = {
      t: new Float64Array([1000]),
      x: new Int32Array([0]),
      y: new Int32Array([1562]),
      gone: new Uint8Array([0]),
    };
    card._history.series = { slots: new Map([[0, slot]]), since: 0, now: 2000, count: 1 };
    card._history.t = 1500;
    const frame = card._replayFrame();
    expect(frame.items[0].m.y).toBeCloseTo(1000, -1);
    expect($(card, "historyMountNote").hidden).toBe(false);
  });

  it("draws the footprint, not the cone, and a wall line on a ceiling", async () => {
    const hass = hassOf({ payload: HIGH });
    const card = await mount(hass);
    const calls: string[] = [];
    card.ctx = new Proxy({} as any, {
      get: (target, prop) => (prop in target ? target[prop] : (..._a: any[]) => calls.push(String(prop))),
      set: (target, prop, value) => ((target[prop] = value), true),
    });
    card.drawDeviceCone(null);
    expect(calls.filter((c) => c === "lineTo")).toHaveLength(49);
    expect(calls).not.toContain("setLineDash");
    calls.length = 0;
    push(card, hass, { mount: "ceiling" });
    card.drawDeviceCone(null);
    expect(calls).toContain("setLineDash");
    expect(calls).toContain("arc");
  });

  it("fits the map around the room side, flipped or not", async () => {
    const hass = hassOf({ payload: CEILING });
    const card = await mount(hass);
    const room = card._fittedGrid();
    expect(room.yMax).toBeGreaterThan(1000);
    push(card, hass, { flip_room_side: true });
    const flipped = card._fittedGrid();
    expect(flipped.yMin).toBeLessThan(-1000);
  });
});

describe("the room tools on High and Ceiling", () => {
  it("adds a coverage zone of 32 points, the footprint turned with the map", async () => {
    const hass = hassOf({ payload: { ...HIGH, rotation_deg: 30 } });
    const card = await mount(hass);
    const button = $(card, "btnRoomZoneAdd");
    expect(button.hidden).toBe(false);
    expect(button.textContent).toBe(COVERAGE_ZONE_LABEL);
    button.click();
    await settle();
    const zone = card.zones.find((z: any) => z.shape === "polygon");
    const g = mountGeometry("ld2450", null, HIGH);
    const turned = footprintOutline(g, COVERAGE_ZONE_STEPS).map((p) => rotateToMap(p.x, p.y, 30));
    expect(turned).toHaveLength(32);
    // The two far corners meet at 6 m, so one goes.
    const want = turned.filter(
      (p, i) => i === 0 || Math.round(p.x) !== Math.round(turned[i - 1].x) || Math.round(p.y) !== Math.round(turned[i - 1].y)
    );
    expect(zone.data.points).toHaveLength(want.length);
    expect(want.length).toBeGreaterThanOrEqual(31);
    zone.data.points.forEach((p: any, i: number) => {
      expect(Math.abs(p.x - want[i].x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(p.y - want[i].y)).toBeLessThanOrEqual(0.5);
    });
  });

  it("keeps the LD2460's whole-room button for its circle", async () => {
    const card = await mount(hassOf({ ld2460: true, payload: CEILING }));
    expect($(card, "btnRoomZoneAdd").textContent).toBe(ROOM_ZONE_ADD_LABEL);
    expect($(card, "btnTestChip").textContent).toBe(TEST_LABEL);
  });
});

describe("Test near and far edge, and Test wall line and edge", () => {
  it("finds the near edge, the far edge, a side and the space between on High", async () => {
    const hass = hassOf({ payload: HIGH });
    const card = await mount(hass);
    const chip = $(card, "btnTestChip");
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe(TEST_LABEL_HIGH);
    chip.click();
    at(card, hass, [[0, raw(659.6, 1200)]]);
    expect($(card, "testMessage").textContent).toBe(TEST_NEAR);
    at(card, hass, [[0, raw(3000, 1200)]]);
    expect($(card, "testMessage").textContent).toBe(testOut("3.0 m", "2.4 m"));
    at(card, hass, [[0, raw(5800, 1200)]]);
    expect($(card, "testMessage").textContent).toBe(testFar("5.9 m"));
    at(card, hass, [[2600, raw(1000, 1200)]]);
    expect($(card, "testMessage").textContent).toBe(TEST_SIDE);
    expect($(card, "testCheckCenter").textContent).toBe(`✓ ${TEST_CHECK_NEAR}`);
    expect($(card, "testCheckEdge").textContent).toBe(`✓ ${TEST_CHECK_FAR}`);
  });

  it("finds the wall line and the far edge on a ceiling", async () => {
    const hass = hassOf({ payload: CEILING });
    const card = await mount(hass);
    const chip = $(card, "btnTestChip");
    expect(chip.textContent).toBe(TEST_LABEL_CEILING_LD2450);
    chip.click();
    at(card, hass, [[0, 1700]]);
    expect($(card, "testMessage").textContent).toBe(TEST_WALL_LINE);
    at(card, hass, [[0, 2000]]);
    expect($(card, "testMessage").textContent).toBe(testFar("1.2 m"));
    expect($(card, "testCheckCenter").textContent).toBe(`✓ ${TEST_CHECK_WALL_LINE}`);
  });

  it("turns off when the mount changes", async () => {
    const hass = hassOf({ payload: HIGH });
    const card = await mount(hass);
    $(card, "btnTestChip").click();
    expect(card._test).not.toBeNull();
    $(card, "btnMountWall").click();
    expect(card._test).toBeNull();
    expect($(card, "btnTestChip").hidden).toBe(true);
  });
});

describe("Map settings on a phone", () => {
  it("lays out one column, full-width fields and 44 px buttons", async () => {
    const card = await mount(hassOf({ payload: HIGH }));
    const css = card.shadowRoot.querySelector("style").textContent;
    expect(css).toContain(".mount-switch button { flex: 1; min-height: 44px;");
    expect(css).toContain(".mount-field-row label { flex-basis: 100%; }");
    expect(css).toContain(".mount-input { display: inline-flex; align-items: center; gap: 6px; flex: 1 1 100%; min-width: 0; }");
    expect(css).toContain("#tiltSlider { width: 100%; min-height: 44px; }");
    expect(css).toContain("@container map-side (min-width: 480px) and (max-width: 599px) { .mount-switch.three { width: 100%;");
    expect(css).not.toMatch(/\.mount-(?:details|field|explain)[^{]*\{[^}]*\bwidth: \d+px/);
    expect($(card, "mountHeightInput").closest(".mount-input")).not.toBeNull();
  });
});
