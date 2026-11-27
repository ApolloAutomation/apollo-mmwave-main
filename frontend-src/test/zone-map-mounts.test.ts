/** An LD2450 zone map on Wall, High and Ceiling. */

import { describe, expect, it, vi } from "vitest";
import { ZoneMapCard } from "../src/zone-map/card";
import { ZONES_GET } from "../src/zone-map/api";
import { CELL_MM, CellGrid } from "../src/zone-map/cells";
import { pointInPolygon, rotateToMap } from "../src/zone-map/geometry";
import { formatDistance } from "../src/zone-map/format";
import { COVERAGE_ZONE_STEPS, floorPoint, footprintOutline, mountGeometry } from "../src/mounts";
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

  it("lets only the latest mount save settle the choice", async () => {
    const hass = hassOf();
    const pending: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
    hass.callService = vi.fn(() => new Promise<void>((resolve, reject) => pending.push({ resolve, reject })));
    const card = await mount(hass);
    const high = card._chooseMount("high");
    const ceiling = card._chooseMount("ceiling");
    pending[1].resolve();
    await ceiling;
    pending[0].reject(new Error("Refused"));
    await high;
    expect(card._storedMount).toBe("ceiling");
  });

  it("falls back to the confirmed height when every pending save fails", async () => {
    const hass = hassOf({ payload: CEILING });
    const pending: Array<(e: Error) => void> = [];
    hass.callService = vi.fn(() => new Promise<void>((_resolve, reject) => pending.push(reject)));
    const card = await mount(hass);
    const first = card._chooseCeilingHeight("2.8");
    const second = card._chooseCeilingHeight("2.9");
    expect(card._storedHeightMm).toBe(2900);
    pending[0](new Error("Refused"));
    await first;
    pending[1](new Error("Refused"));
    await second;
    expect(card._storedHeightMm).toBeNull();
    expect(card._heightSave.state).toBe("failed");
  });

  it("never lets an old radar's failed save touch a new save", async () => {
    const hass = hassOf({ payload: HIGH });
    const pending: Array<(e: Error) => void> = [];
    hass.callService = vi.fn(() => new Promise<void>((_resolve, reject) => pending.push(reject)));
    const card = await mount(hass);
    const old = card._chooseMountNumber("mount_height_mm", "3");
    card._resetDeviceState();
    push(card, hass, HIGH);
    card._chooseMountNumber("mount_height_mm", "2.5");
    expect(card._storedMountHeightMm).toBe(2500);
    pending[0](new Error("Refused"));
    await old;
    expect(card._storedMountHeightMm).toBe(2500);
    expect(card._fieldSaves.mount_height_mm.state).toBe("saving");
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

  it("spaces Walk's corners on the floor, not by raw y", async () => {
    const hass = hassOf({ payload: CEILING });
    const card = await mount(hass);
    card._walk = { corners: [{ x: 0, y: 1700 }] };
    at(card, hass, [[0, raw(600, 1700)]]);
    card._walkCorner();
    expect(card._walk.corners).toHaveLength(2);
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

  it.each([0, 30])("puts someone under a flipped ceiling radar in its coverage zone, turned %s", async (turn) => {
    const payload = { ...CEILING, flip_room_side: true, rotation_deg: turn };
    const card = await mount(hassOf({ payload }));
    $(card, "btnRoomZoneAdd").click();
    await settle();
    const zone = card.zones.find((z: any) => z.shape === "polygon");
    const g = mountGeometry("ld2450", null, payload);
    for (const [x, y] of [
      [0, 1600],
      [1000, 1700],
    ]) {
      const floor = floorPoint(g, x, y);
      const at = rotateToMap(floor.x, floor.y, turn);
      expect(pointInPolygon(at.x, at.y, zone.data)).toBe(true);
    }
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

  it("ticks High's far edge only at the far edge, not at a side", async () => {
    const hass = hassOf({ payload: HIGH });
    const card = await mount(hass);
    $(card, "btnTestChip").click();
    at(card, hass, [[2600, raw(1000, 1200)]]);
    expect($(card, "testMessage").textContent).toBe(TEST_SIDE);
    expect($(card, "testCheckEdge").textContent).toBe(TEST_CHECK_FAR);
    at(card, hass, [[0, raw(5800, 1200)]]);
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

  it("gives Ceiling height the same full-width field", async () => {
    const card = await mount(hassOf({ payload: CEILING }));
    expect($(card, "ceilingHeightInput").closest(".mount-input")).not.toBeNull();
    expect($(card, "ceilingHeightInput").closest(".mount-field-row")).not.toBeNull();
  });
});

describe("the grid line under Map settings", () => {
  it("ends the coverage sentence once on High and Ceiling", async () => {
    for (const payload of [HIGH, CEILING]) {
      const card = await mount(hassOf({ payload }));
      const text = $(card, "gridInfo").textContent;
      expect(text).toMatch(/Radar range: Covers /);
      expect(text).not.toMatch(/[a-z]\.\./);
    }
  });
});

describe("Add coverage zone and History", () => {
  it("closes a replay, then adds the zone filled with the footprint", async () => {
    const hass = hassOf({ payload: { ...CEILING, movement_history: true } });
    const card = await mount(hass);
    card._history.open = true;
    card._history.series = { slots: [] };
    card._renderHistoryPanel();
    const button = $(card, "btnRoomZoneAdd");
    expect(button.hidden).toBe(false);
    button.click();
    await settle();
    expect(card._history.open).toBe(false);
    expect(card._replayShowing()).toBe(false);
    expect($(card, "historyPanel").hidden).toBe(true);
    expect(writes(hass).map((w) => [w.zone_id, w.shape])).toEqual([
      [1, "none"],
      [1, "polygon"],
    ]);
  });

  it("closes History before the zone is added, not after", async () => {
    const hass = hassOf({ payload: { ...CEILING, movement_history: true } });
    const card = await mount(hass);
    card._history.open = true;
    card._history.series = { slots: [] };
    const order: string[] = [];
    const close = card._closeHistory.bind(card);
    const add = card._handleAddZone.bind(card);
    card._closeHistory = () => (order.push(card._history.open ? "close" : "noop"), close());
    card._handleAddZone = () => (order.push("add"), add());
    card._addRoomZone();
    expect(order[0]).toBe("close");
    expect(order).toContain("add");
  });
});

describe("the fitted map on High and Ceiling", () => {
  it("keeps the radar and wall line off the map's edge", async () => {
    for (const payload of [HIGH, CEILING]) {
      const card = await mount(hassOf({ payload }));
      expect(card._fittedGrid().yMin).toBeLessThan(0);
    }
  });

  it("hugs a ceiling strip with a short map, leaving Wall and High near square", async () => {
    const shape = (g: any) => (g.yMax - g.yMin) / (g.xMax - g.xMin);
    for (const feet of [false, true]) {
      const card = await mount(hassOf({ payload: CEILING, feet }));
      const grid = card._fittedGrid();
      expect(shape(grid)).toBeLessThan(0.5);
      card._footprintMapPoints().forEach((p: any) => {
        expect(p.x).toBeGreaterThanOrEqual(grid.xMin);
        expect(p.x).toBeLessThanOrEqual(grid.xMax);
        expect(p.y).toBeGreaterThanOrEqual(grid.yMin);
        expect(p.y).toBeLessThanOrEqual(grid.yMax);
      });
    }
    for (const payload of [{}, HIGH]) {
      const card = await mount(hassOf({ payload }));
      expect(shape(card._fittedGrid())).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("keeps a short ceiling map tall enough for its buttons on a phone", async () => {
    const hass = hassOf({ payload: CEILING });
    const card = await mount(hass);
    const wide = card._fittedGrid();
    card._resizeCanvasTo(340);
    const tall = { xMin: card.xMin, xMax: card.xMax, yMin: card.yMin, yMax: card.yMax };
    const pxPerMm = 340 / (tall.xMax - tall.xMin);
    expect((tall.yMax - tall.yMin) * pxPerMm).toBeGreaterThanOrEqual(128);
    expect(tall.yMax - tall.yMin).toBeGreaterThan(wide.yMax - wide.yMin);
    // The strip's far edge stays clear of the bottom buttons.
    const far = Math.max(...card._footprintMapPoints().map((p: any) => p.y));
    expect((tall.yMax - far) * pxPerMm).toBeGreaterThanOrEqual(76 - 1);
    push(card, hass, { ceiling_height_mm: 4000 });
    expect(card.yMax).toBeGreaterThan(tall.yMax);
  });

  it("leaves the bottom buttons room under a zone that rounds out the top", async () => {
    const zone = { shape: "rect", data: { x_min: -5000, x_max: 5000, y_min: -503, y_max: 2000 } };
    const card = await mount(hassOf({ payload: { ...CEILING, zones: { "1": zone } } }));
    const grid = card._fittedGrid();
    const pxPerMm = 800 / (grid.xMax - grid.xMin);
    expect((grid.yMax - grid.yMin) / (grid.xMax - grid.xMin)).toBeLessThan(0.75);
    expect((grid.yMax - 2000) * pxPerMm).toBeGreaterThanOrEqual(76);
  });

  // 270 is stored as -90: rotation_deg is held to -180..180.
  for (const [label, rotation] of [["0", 0], ["45", 45], ["90", 90], ["180", 180], ["270", -90]] as const) {
    it(`fits a ceiling strip turned ${label} degrees around its turned box`, async () => {
      for (const width of [800, 340]) {
        const card = await mount(hassOf({ payload: { ...CEILING, rotation_deg: rotation } }));
        card._cssMapWidth = width;
        const grid = card._fittedGrid();
        const spanX = grid.xMax - grid.xMin;
        const spanY = grid.yMax - grid.yMin;
        const pxPerMm = width / spanX;
        const points = card._footprintMapPoints();
        points.forEach((p: any) => {
          expect(p.x).toBeGreaterThanOrEqual(grid.xMin);
          expect(p.x).toBeLessThanOrEqual(grid.xMax);
          expect(p.y).toBeGreaterThanOrEqual(grid.yMin);
          expect(p.y).toBeLessThanOrEqual(grid.yMax);
        });
        const ys = points.map((p: any) => p.y);
        const xs = points.map((p: any) => p.x);
        // The bottom buttons stay clear of the strip.
        expect((grid.yMax - Math.max(...ys)) * pxPerMm).toBeGreaterThanOrEqual(76 - 1);
        expect(spanY * pxPerMm).toBeGreaterThanOrEqual(128);
        expect(spanY / spanX).toBeGreaterThanOrEqual(0.3);
        expect(spanY / spanX).toBeLessThanOrEqual(1.5 + 1e-9);
        // Top stays within a margin and a step.
        expect(Math.min(...ys) - grid.yMin).toBeLessThanOrEqual(0.15 * spanY + grid.step);
        if (Math.abs(rotation) === 90) {
          expect(spanY).toBeGreaterThan(spanX);
          // The radar's wall stays on its edge of the map.
          const wall = rotation > 0 ? Math.min(...xs) - grid.xMin : grid.xMax - Math.max(...xs);
          expect(wall).toBeLessThanOrEqual(0.15 * spanX + grid.step);
        } else if (rotation === 0 || rotation === 180) {
          expect(spanY / spanX).toBeLessThan(0.75);
        }
      }
    });
  }

  it("bounds a turned strip's fit at a tiny width", async () => {
    const card = await mount(hassOf({ payload: { ...CEILING, rotation_deg: 90 } }));
    card._cssMapWidth = 44;
    const grid = card._fittedGrid();
    const spanX = grid.xMax - grid.xMin;
    const spanY = grid.yMax - grid.yMin;
    expect(spanY / spanX).toBeLessThanOrEqual(1.5 + grid.step / spanX);
    expect(spanX).toBeLessThan(20000);
    expect(spanY).toBeLessThan(20000);
  });

  it("keeps a turned strip sane on Expand at 360x640 under a tall header", async () => {
    const hass = hassOf({ payload: { ...CEILING, rotation_deg: 90 } });
    const card = await mount(hass);
    document.body.appendChild(card);
    card._openFullWindow();
    const title = card.shadowRoot.querySelector(".title-row");
    vi.spyOn(title, "getBoundingClientRect").mockImplementation(() => ({ height: 70 }) as DOMRect);
    card._cardMapWidth = 293;
    card._layoutFullWindow({ box: { width: 360, height: 640 } });
    expect(card._fullLayout).toMatchObject({ layout: "stacked", mapWidth: 293 });
    const spanX = card.xMax - card.xMin;
    const spanY = card.yMax - card.yMin;
    expect(spanY / spanX).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(spanY).toBeLessThan(20000);
    card._closeFullWindow({ reason: "user" });
    card.remove();
  });

  it("leaves the buttons room at the width the height cap shows a turned strip", async () => {
    const tall = window.innerHeight;
    try {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
      const hass = hassOf({ payload: { ...CEILING, rotation_deg: 90 } });
      const card = await mount(hass);
      document.body.appendChild(card);
      Object.defineProperty($(card, "mapStage"), "clientWidth", { configurable: true, get: () => 606 });
      card._refitAndDraw();
      const spanX = card.xMax - card.xMin;
      const spanY = card.yMax - card.yMin;
      // The canvas shows narrower than the 606 px stage.
      const shown = Math.min(606, 700 / (spanY / spanX));
      expect(shown).toBeLessThan(606);
      const pxPerMm = shown / spanX;
      const far = Math.max(...card._footprintMapPoints().map((p: any) => p.y));
      expect((card.yMax - far) * pxPerMm).toBeGreaterThanOrEqual(76 - 1);
      // A shorter screen refits for its own cap.
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 640 });
      expect(card._refitForWidth()).toBe(true);
      const shortX = card.xMax - card.xMin;
      const shortShown = Math.min(606, 440 / ((card.yMax - card.yMin) / shortX));
      expect((card.yMax - far) * (shortShown / shortX)).toBeGreaterThanOrEqual(76 - 1);
      card.remove();
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: tall });
    }
  });

  it("fits again when the map is turned, by the slider or the store", async () => {
    const hass = hassOf({ payload: CEILING });
    const card = await mount(hass);
    const wide = { xMin: card.xMin, xMax: card.xMax, yMin: card.yMin, yMax: card.yMax };
    expect(wide.yMax - wide.yMin).toBeLessThan(wide.xMax - wide.xMin);
    const slider = $(card, "coneAngleSlider");
    slider.value = "90";
    slider.dispatchEvent(new Event("input"));
    slider.dispatchEvent(new Event("change"));
    expect(card.yMax - card.yMin).toBeGreaterThan(card.xMax - card.xMin);
    push(card, hass, { rotation_deg: 180 });
    expect(card.yMax - card.yMin).toBeLessThan(card.xMax - card.xMin);
    expect(card.yMin).toBeLessThan(-1000);
  });

  it("refits a ceiling strip for the card's width when Expand closes", async () => {
    const hass = hassOf({ payload: CEILING });
    const card = await mount(hass);
    document.body.appendChild(card);
    let shown = 386;
    Object.defineProperty($(card, "mapStage"), "clientWidth", { configurable: true, get: () => shown });
    vi.spyOn(card.canvas, "getBoundingClientRect").mockImplementation(() => ({ width: shown }) as DOMRect);
    card._resizeCanvasTo(386);
    card._openFullWindow();
    expect(card._fullWindow).toBe(true);
    shown = 1880;
    card._layoutFullWindow({ box: { width: 1900, height: 900 } });
    expect(card._fitWidthSeen).toBe(card._fullLayout.mapWidth);
    push(card, hass, { ceiling_height_mm: 2701 });
    shown = 386;
    card._closeFullWindow({ reason: "user" });
    expect(card._fitWidthSeen).toBe(386);
    const pxPerMm = 386 / (card.xMax - card.xMin);
    const far = Math.max(...card._footprintMapPoints().map((p: any) => p.y));
    expect((card.yMax - far) * pxPerMm).toBeGreaterThanOrEqual(76 - 1);
    card.remove();
  });
});
