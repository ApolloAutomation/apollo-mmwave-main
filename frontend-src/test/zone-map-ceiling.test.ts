/**
 * The ceiling zone map: the Wall / Ceiling switch under Map settings, the
 * ceiling height that sizes the circle, the top-down look, the whole-room
 * zones, Walk around a ceiling radar, and Test center and edge. The radar
 * is an LD2460 with made-up ids; a gate-only device shows none of it, and
 * an LD2450's mounts are in zone-map-mounts.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZoneMapCard } from "../src/zone-map/card";
import { TEST_CENTER_MM, TEST_EDGE_BAND_MM, TEST_LOST_SHOW_MS } from "../src/zone-map/ceiling";
import { ZONES_GET } from "../src/zone-map/api";
import { placementBox } from "../src/zone-map/labels";
import { selfIntersects } from "../src/zone-map/walk";
import {
  ADMIN_ONLY_TITLE,
  CEILING_MIRROR_HINT,
  CEILING_ROTATION_HINT,
  CONE_LOCKED_TOAST,
  CONE_MOUNT_HINT,
  DRAW_LOCKED_TOAST,
  LOCK_OFF_TOAST,
  LOCK_OFF_TOAST_CEILING,
  LOCK_ON_TOAST,
  LOCK_ON_TOAST_CEILING,
  LOCK_TITLE,
  LOCK_TITLE_CEILING,
  MAP_ROTATION_LOCKED_HINT,
  MAP_ROTATION_LOCKED_TOAST,
  MIRROR_HINT,
  MOUNT_CONFLICT,
  MOUNT_RADAR_TITLE,
  MOUNT_STATUS_DEFAULT,
  MOUNT_STATUS_RADAR_CEILING,
  MOUNT_STATUS_RADAR_WALL,
  MOUNT_STATUS_SAVED,
  MOUNT_STATUS_SAVED_SILENT,
  TEST_CENTER,
  TEST_CROWD,
  TEST_NOBODY,
  TEST_WALK_TITLE,
  UNLOCK_TITLE_CEILING,
  WALK_HINT_NOBODY_CEILING,
  WALK_HINT_START,
  WALK_HINT_START_CEILING,
  ZONES_EMPTY_ROTATION,
  ZONES_EMPTY_ROTATION_CEILING,
  testBetween,
  testEdge,
  testLost,
  testLostEdge,
} from "../src/zone-map/copy";

const DEV = "devceil";
const B = "kitchen_radar";
const X = (n: number) => `sensor.${B}_ld2460_target_${n}_x`;
const Y = (n: number) => `sensor.${B}_ld2460_target_${n}_y`;
const MODE = `sensor.${B}_ld2460_installation_mode`;
const MM = { unit_of_measurement: "mm", device_class: "distance" };
const PAIRS = [1, 2, 3].map((n) => ({ x: X(n), y: Y(n) }));

type Options = {
  mode?: string | null;
  payload?: Record<string, any>;
  admin?: boolean;
  feet?: boolean;
  tracker?: "ld2460" | "ld2450" | "none";
};

/** A hass for one radar. `mode` null means no Installation Mode sensor. */
function hassOf({ mode = null, payload = {}, admin = true, feet = false, tracker = "ld2460" }: Options = {}): any {
  const ids =
    tracker === "ld2460"
      ? [...PAIRS.flatMap((p) => [p.x, p.y]), ...(mode === null ? [] : [MODE])]
      : tracker === "ld2450"
        ? ["sensor.msr_ab2450_target_1_x", "sensor.msr_ab2450_target_1_y"]
        : ["sensor.gate_ab2410_moving_distance"];
  const states: Record<string, any> = {};
  ids.forEach((id) => {
    states[id] = { entity_id: id, state: "unknown", attributes: id === MODE ? {} : MM };
  });
  if (mode !== null && tracker === "ld2460") states[MODE].state = mode;
  const hass: any = {
    states,
    entities: Object.fromEntries(ids.map((id) => [id, { device_id: DEV, platform: "esphome" }])),
    devices: {
      [DEV]: { id: DEV, name: "Test radar", manufacturer: "ApolloAutomation", model: "TEST-1" },
    },
    config: { unit_system: { length: feet ? "mi" : "km" } },
    user: { is_admin: admin },
    payload: {
      zones: {},
      entities: null,
      rotation_deg: 0,
      label: null,
      suggested_entities:
        tracker === "ld2460"
          ? PAIRS
          : tracker === "ld2450"
            ? [{ x: "sensor.msr_ab2450_target_1_x", y: "sensor.msr_ab2450_target_1_y" }]
            : [],
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

function toasts(card: any): string[] {
  const seen: string[] = [];
  card.addEventListener("hass-notification", (event: any) => seen.push(event.detail?.message));
  return seen;
}

function writes(hass: any): any[] {
  return hass.callService.mock.calls
    .filter((call: any[]) => call[1] === "update_zone")
    .map((call: any[]) => call[2]);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A new payload from the store, as the subscription pushes it. */
function push(card: any, hass: any, changes: Record<string, any>) {
  hass.payload = { ...hass.payload, ...changes };
  card._applyZoneConfig(hass.payload);
}

/** The targets stand at `points` (mm); the other slots are empty. */
function at(card: any, hass: any, points: Array<[number, number]>) {
  const states = { ...hass.states };
  PAIRS.forEach((pair, i) => {
    const p = points[i];
    states[pair.x] = { entity_id: pair.x, state: p ? String(p[0]) : "unknown", attributes: MM };
    states[pair.y] = { entity_id: pair.y, state: p ? String(p[1]) : "unknown", attributes: MM };
  });
  hass.states = states;
  card.hass = { ...hass, states };
}

/** Record every 2D call made while `draw` runs. */
function recordCalls(card: any, draw: () => void): Array<[string, any[]]> {
  const calls: Array<[string, any[]]> = [];
  const sink: any = new Proxy(function () {} as object, { get: () => sink, apply: () => sink });
  const before = card.ctx;
  card.ctx = new Proxy({} as Record<string | symbol, any>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: any[]) => {
        calls.push([String(prop), args]);
        return sink;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  try {
    draw();
  } finally {
    card.ctx = before;
  }
  return calls;
}

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("the Wall / Ceiling switch", () => {
  it("shows on an LD2460 map, starting as a wall", async () => {
    const card = await mount(hassOf());
    expect($(card, "mountOption").hidden).toBe(false);
    expect($(card, "btnMountWall").getAttribute("aria-checked")).toBe("true");
    expect($(card, "btnMountCeiling").getAttribute("aria-checked")).toBe("false");
    expect($(card, "mountSwitch").getAttribute("role")).toBe("radiogroup");
    expect($(card, "mountStatus").textContent).toBe(MOUNT_STATUS_DEFAULT);
    expect($(card, "ceilingHeightOption").hidden).toBe(true);
    expect([card.coneYMax, card.coneFovDeg]).toEqual([6000, 120]);
    // Its own blocks come first under Map settings.
    expect($(card, "configContent").firstElementChild.id).toBe("mountOption");
  });

  it.each([["a gate radar alone", "none"]] as const)(
    "is nowhere on %s's map, even with a ceiling saved", async (_name, tracker) => {
    const card = await mount(
      hassOf({ tracker, payload: { mount: "ceiling", ceiling_height_mm: 2000 } })
    );
    expect($(card, "mountOption").hidden).toBe(true);
    expect($(card, "ceilingHeightOption").hidden).toBe(true);
    expect($(card, "btnTestChip").hidden).toBe(true);
    expect([card.coneYMax, card.coneFovDeg]).toEqual([6000, 120]);
    expect($(card, "coneRotationLabel").textContent).toBe("Cone rotation: ");
    expect($(card, "coneMountHint").textContent).toBe(CONE_MOUNT_HINT);
    expect(card._isCeiling()).toBe(false);
  });

  it("offers an LD2450 High as well, never the LD2460's circle", async () => {
    const card = await mount(
      hassOf({ tracker: "ld2450", payload: { mount: "ceiling", ceiling_height_mm: 2000 } })
    );
    expect($(card, "mountOption").hidden).toBe(false);
    expect($(card, "btnMountHigh").hidden).toBe(false);
    expect($(card, "btnTestChip").hidden).toBe(false);
    expect([card.coneYMax, card.coneFovDeg]).toEqual([6000, 120]);
    expect(card._isCeiling()).toBe(true);
    expect(card._isTopDown()).toBe(false);
  });

  it("saves Ceiling for an administrator and draws the circle at once", async () => {
    const hass = hassOf();
    const card = await mount(hass);
    const said = toasts(card);
    $(card, "btnMountCeiling").click();
    expect(writes(hass)).toEqual([{ device_id: DEV, mount: "ceiling" }]);
    expect([card.coneYMax, card.coneFovDeg]).toEqual([4000, 360]);
    expect($(card, "btnMountCeiling").getAttribute("aria-checked")).toBe("true");
    expect($(card, "mountStatus").textContent).toBe(MOUNT_STATUS_SAVED);
    await settle();
    expect(said).toContain("Map set to a ceiling mount");
    // The same choice again sends nothing.
    $(card, "btnMountCeiling").click();
    expect(writes(hass)).toHaveLength(1);
    push(card, hass, { mount: "ceiling" });
    $(card, "btnMountWall").click();
    expect(writes(hass)[1]).toEqual({ device_id: DEV, mount: "wall" });
    expect(card.coneFovDeg).toBe(120);
  });

  it("goes back when the save is refused", async () => {
    const hass = hassOf();
    hass.callService = vi.fn(async () => {
      throw new Error("Unauthorized");
    });
    const card = await mount(hass);
    const said = toasts(card);
    $(card, "btnMountCeiling").click();
    expect(card.coneFovDeg).toBe(360);
    await settle();
    expect(card.coneFovDeg).toBe(120);
    expect($(card, "btnMountWall").getAttribute("aria-checked")).toBe("true");
    expect(said).toContain("Could not save: Unauthorized");
  });

  it("leaves another radar's mount alone when a save is refused late", async () => {
    const hass = hassOf();
    let refuse: (error: Error) => void = () => {};
    hass.callService = vi.fn(() => new Promise((_resolve, reject) => (refuse = reject)));
    const card = await mount(hass);
    $(card, "btnMountCeiling").click();
    hass.payload = { ...hass.payload, mount: "ceiling" };
    card.setConfig({ device_id: "other", start_locked: false });
    await settle();
    expect(card._storedMount).toBe("ceiling");
    refuse(new Error("Unauthorized"));
    await settle();
    await settle();
    expect(card._storedMount).toBe("ceiling");
  });

  it("is a viewer's to read, not to press", async () => {
    const hass = hassOf({ admin: false });
    const card = await mount(hass);
    for (const id of ["btnMountWall", "btnMountCeiling"]) {
      expect($(card, id).disabled).toBe(true);
      expect($(card, id).title).toBe(ADMIN_ONLY_TITLE);
    }
    expect($(card, "mapOptionsNote").hidden).toBe(false);
    card._chooseMount("ceiling");
    expect(writes(hass)).toEqual([]);
  });

  it("follows the radar's own report, and keeps what was chosen", async () => {
    const hass = hassOf({ mode: "top" });
    const card = await mount(hass);
    for (const id of ["btnMountWall", "btnMountCeiling"]) {
      expect($(card, id).disabled).toBe(true);
      expect($(card, id).title).toBe(MOUNT_RADAR_TITLE);
    }
    expect($(card, "btnMountCeiling").getAttribute("aria-checked")).toBe("true");
    expect($(card, "mountStatus").textContent).toBe(MOUNT_STATUS_RADAR_CEILING);
    expect(card.coneFovDeg).toBe(360);
    card._chooseMount("wall");
    expect(writes(hass)).toEqual([]);
  });

  it("says when the radar's wall overrides a ceiling chosen here", async () => {
    const card = await mount(hassOf({ mode: "side", payload: { mount: "ceiling" } }));
    expect($(card, "mountConflict").hidden).toBe(false);
    expect($(card, "mountConflict").textContent).toBe(MOUNT_CONFLICT);
    expect($(card, "mountStatus").textContent).toBe(MOUNT_STATUS_RADAR_WALL);
    expect($(card, "btnMountWall").getAttribute("aria-checked")).toBe("true");
    expect([card.coneYMax, card.coneFovDeg]).toEqual([6000, 120]);
  });

  it("tells how to use the saved Ceiling, and brings it back when the report goes", async () => {
    const hass = hassOf({ mode: "side", payload: { mount: "ceiling" } });
    const card = await mount(hass);
    const note = $(card, "mountConflict").textContent;
    expect(note).toContain("so Wall is used");
    expect(note).toContain("set on the radar itself and only read here, under LD2460 Live");
    expect(note).toContain("reports top (ceiling)");
    expect(note).toContain("Ceiling stays saved");
    expect($(card, "btnMountCeiling").disabled).toBe(true);
    // The radar stops reporting: the saved Ceiling is used, unwritten.
    const states = { ...hass.states, [MODE]: { entity_id: MODE, state: "unknown", attributes: {} } };
    hass.states = states;
    card.hass = { ...hass, states };
    expect(card._mountInfo()).toMatchObject({ mount: "ceiling", source: "saved" });
    expect($(card, "mountConflict").hidden).toBe(true);
    expect($(card, "mountStatus").textContent).toBe(MOUNT_STATUS_SAVED_SILENT);
    expect(card.coneFovDeg).toBe(360);
    // Top agrees with the saved Ceiling: nothing to say.
    const top = { ...states, [MODE]: { entity_id: MODE, state: "top", attributes: {} } };
    hass.states = top;
    card.hass = { ...hass, states: top };
    expect($(card, "mountConflict").hidden).toBe(true);
    expect(writes(hass)).toEqual([]);
  });

  it.each([
    [null, null, MOUNT_STATUS_DEFAULT, 120],
    [null, "ceiling", MOUNT_STATUS_SAVED, 360],
    ["unknown", "ceiling", MOUNT_STATUS_SAVED_SILENT, 360],
    ["top", null, MOUNT_STATUS_RADAR_CEILING, 360],
    ["side", null, MOUNT_STATUS_RADAR_WALL, 120],
  ])("with mode %s and %s saved, says %s", async (mode, saved, status, fov) => {
    const card = await mount(hassOf({ mode, payload: { mount: saved } }));
    expect($(card, "mountStatus").textContent).toBe(status);
    expect($(card, "mountConflict").hidden).toBe(true);
    expect(card.coneFovDeg).toBe(fov);
  });

  it("reads an older backend's payload, which has neither key, as a wall", async () => {
    const hass = hassOf();
    delete hass.payload.mount;
    delete hass.payload.ceiling_height_mm;
    const card = await mount(hass);
    expect(card._mountInfo()).toMatchObject({ mount: "wall", source: "default", heightMm: 2700 });
  });

  it("follows a ceiling saved from another page, and a bad height reads as the default", async () => {
    const hass = hassOf();
    const card = await mount(hass);
    push(card, hass, { mount: "ceiling", ceiling_height_mm: 2000 });
    expect(card.coneYMax).toBeCloseTo(3464.1, 1);
    push(card, hass, { ceiling_height_mm: 1999 });
    expect(card.coneYMax).toBe(4000);
    push(card, hass, { mount: "Ceiling", ceiling_height_mm: null });
    expect(card.coneFovDeg).toBe(120);
  });
});

describe("the ceiling's coverage", () => {
  it("sizes the circle from the ceiling height", async () => {
    const hass = hassOf({ payload: { mount: "ceiling", ceiling_height_mm: 2000 } });
    const card = await mount(hass);
    expect(card.coneYMax).toBeCloseTo(3464.1, 1);
    expect(card.coneFovDeg).toBe(360);
    push(card, hass, { ceiling_height_mm: null });
    expect(card.coneYMax).toBe(4000);
  });

  it("labels the circle as coverage around the radar", async () => {
    const card = await mount(hassOf({ feet: true, payload: { mount: "ceiling" } }));
    card._viewDisplayUnits = "m";
    card._displayUnitChanged();
    expect(card._rangeLabelText()).toBe("Coverage 4 m (13 ft) around the radar");
    expect($(card, "gridInfo").textContent).toContain("Radar range: 4 m (13 ft) around the radar.");
    // A wall map keeps its own label.
    push(card, card._hass, { mount: null });
    expect(card._rangeLabelText()).toBe("Radar range 6 m (20 ft), 120°");
  });

  it("keeps the coverage label under the circle when the map is turned", async () => {
    const hass = hassOf({ payload: { mount: "ceiling" } });
    const card = await mount(hass, { unit_display: true });
    const still = card._rangeLabel();
    push(card, hass, { rotation_deg: 25 });
    expect(card.coneAngleDeg).toBe(25);
    const turned = card._rangeLabel();
    expect(turned.x).toBeCloseTo(still.x, 6);
    expect(turned.y).toBeCloseTo(still.y, 6);
    expect(turned.x).toBeCloseTo(card.valueToPixels(0, "x"), 6);
  });
});

describe("the ceiling height", () => {
  it("shows only while the map is on a ceiling", async () => {
    const hass = hassOf();
    const card = await mount(hass);
    expect($(card, "ceilingHeightOption").hidden).toBe(true);
    push(card, hass, { mount: "ceiling" });
    expect($(card, "ceilingHeightOption").hidden).toBe(false);
    expect($(card, "ceilingHeightInput").value).toBe("2.70");
    expect($(card, "ceilingHeightInput").step).toBe("0.05");
    expect($(card, "ceilingHeightUnit").textContent).toBe("m");
  });

  it("reads and saves in feet on a map in feet", async () => {
    const hass = hassOf({ feet: true, payload: { mount: "ceiling" } });
    const card = await mount(hass);
    const input = $(card, "ceilingHeightInput");
    expect(input.value).toBe("8.9");
    expect(input.step).toBe("0.1");
    expect($(card, "ceilingHeightUnit").textContent).toBe("ft");
    input.value = "9";
    input.dispatchEvent(new Event("change"));
    expect(writes(hass)).toEqual([{ device_id: DEV, ceiling_height_mm: 2740 }]);
    expect($(card, "ceilingHeightStatus").textContent).toBe("Saving...");
    await settle();
    expect($(card, "ceilingHeightStatus").textContent).toBe("Saved");
  });

  it("clamps a height out of range and says the range", async () => {
    const hass = hassOf({ payload: { mount: "ceiling" } });
    const card = await mount(hass);
    const input = $(card, "ceilingHeightInput");
    input.value = "1.5";
    input.dispatchEvent(new Event("change"));
    expect(writes(hass)).toEqual([{ device_id: DEV, ceiling_height_mm: 2000 }]);
    expect(input.value).toBe("2.00");
    expect($(card, "ceilingRangeNote").hidden).toBe(false);
    expect($(card, "ceilingRangeNote").textContent).toBe("Enter a height from 2.0 m to 4.0 m.");
    expect(card.coneYMax).toBeCloseTo(3464.1, 1);
    // The next good height clears the note; 2700 is sent and the backend drops it.
    input.value = "2.7";
    input.dispatchEvent(new Event("change"));
    expect(writes(hass)[1]).toEqual({ device_id: DEV, ceiling_height_mm: 2700 });
    expect($(card, "ceilingRangeNote").hidden).toBe(true);
  });

  it("sends nothing for a height that is not a number", async () => {
    const hass = hassOf({ payload: { mount: "ceiling" } });
    const card = await mount(hass);
    card._chooseCeilingHeight("abc");
    expect(writes(hass)).toEqual([]);
    expect($(card, "ceilingRangeNote").hidden).toBe(false);
  });

  it("warns above 3 m, and words how far the radar sees", async () => {
    const hass = hassOf({ payload: { mount: "ceiling", ceiling_height_mm: 3200 } });
    const card = await mount(hass);
    expect($(card, "ceilingHighNote").hidden).toBe(false);
    expect($(card, "ceilingHighNote").textContent).toBe(
      "Above 3 m, people far from the center may be missed. 2.5 to 3 m (8.2 to 9.8 ft) works best."
    );
    expect($(card, "ceilingCoverageLine").textContent).toBe(
      "The radar covers up to 4.0 m out from the spot under it, its most."
    );
    push(card, hass, { ceiling_height_mm: 2000 });
    expect($(card, "ceilingHighNote").hidden).toBe(true);
    expect($(card, "ceilingCoverageLine").textContent).toBe(
      "At this height the radar covers about 3.5 m out from the spot under it. Mounted higher, it covers up to 4.0 m."
    );
  });

  it("shows no save status on another radar's map", async () => {
    const hass = hassOf({ payload: { mount: "ceiling" } });
    const card = await mount(hass);
    const input = $(card, "ceilingHeightInput");
    input.value = "2.5";
    input.dispatchEvent(new Event("change"));
    await settle();
    expect($(card, "ceilingHeightStatus").textContent).toBe("Saved");
    // Away to another radar and back: the save was before.
    card.setConfig({ device_id: "other", start_locked: false });
    card.setConfig({ device_id: DEV, start_locked: false });
    await settle();
    expect(card._isCeiling()).toBe(true);
    expect($(card, "ceilingHeightStatus").textContent).toBe("");
  });

  it("is a viewer's to read only", async () => {
    const card = await mount(hassOf({ admin: false, payload: { mount: "ceiling" } }));
    expect($(card, "ceilingHeightInput").disabled).toBe(true);
    expect($(card, "ceilingHeightInput").title).toBe(ADMIN_ONLY_TITLE);
  });
});

describe("the top-down look", () => {
  it("draws the ceiling unit at the radar, with no edges from it", async () => {
    const card = await mount(hassOf({ payload: { mount: "ceiling" } }));
    const calls = recordCalls(card, () => card.drawDeviceCone(card._getGridRenderState().metrics, null));
    const ox = card.valueToPixels(0, "x");
    const oy = card.valueToPixels(0, "y");
    const arcs = calls.filter(([name, [x, y]]) => name === "arc" && x === ox && y === oy);
    expect(arcs).toHaveLength(1);
    const end = calls.findIndex(([name]) => name === "closePath");
    const apexLines = calls
      .slice(0, end)
      .filter(([name, [x, y]]) => (name === "lineTo" || name === "moveTo") && x === ox && y === oy);
    expect(apexLines).toEqual([]);
  });

  it("draws no ceiling unit on a wall map", async () => {
    const card = await mount(hassOf());
    const calls = recordCalls(card, () => card.drawDeviceCone(card._getGridRenderState().metrics, null));
    expect(calls.filter(([name]) => name === "arc")).toEqual([]);
  });

  it("turns the unit's tick with the map rotation", async () => {
    const card = await mount(hassOf({ payload: { mount: "ceiling" } }));
    const up = card._puckFrame();
    push(card, card._hass, { rotation_deg: 90 });
    const turned = card._puckFrame();
    expect(Math.abs(up.dirX)).toBeLessThan(1e-6);
    expect(Math.abs(turned.dirY)).toBeLessThan(1e-6);
  });

  it("keeps the radar at the center of the grid, whatever the zones", async () => {
    const card = await mount(
      hassOf({
        payload: {
          mount: "ceiling",
          zones: { "1": { shape: "rect", data: { x_min: 3000, x_max: 4500, y_min: 0, y_max: 500 } } },
        },
      })
    );
    expect(card.xMin).toBe(-card.xMax);
    expect(card.yMin).toBe(-card.yMax);
    expect(card.xMax).toBe(card.yMax);
    expect(card.xMax).toBeGreaterThanOrEqual(4500);
  });

  it("fits a wall map as before", async () => {
    const card = await mount(hassOf());
    expect([card.xMin, card.xMax, card.yMin, card.yMax]).toEqual([-6000, 6000, 0, 9000]);
  });

  it("words rotation, the flip and the lock for a ceiling", async () => {
    const hass = hassOf({ payload: { mount: "ceiling" } });
    const card = await mount(hass);
    const said = toasts(card);
    expect($(card, "coneRotationLabel").textContent).toBe("Map rotation: ");
    expect($(card, "coneMountHint").textContent).toBe(CEILING_ROTATION_HINT);
    expect($(card, "coneLockHint").textContent).toBe(MAP_ROTATION_LOCKED_HINT);
    expect($(card, "mirrorHint").textContent).toBe(CEILING_MIRROR_HINT);
    expect($(card, "btnLock").title).toBe(LOCK_TITLE_CEILING);
    expect($(card, "zoneEmptyRotation").textContent).toBe(ZONES_EMPTY_ROTATION_CEILING);
    $(card, "btnLock").click();
    expect($(card, "btnLock").title).toBe(UNLOCK_TITLE_CEILING);
    expect(card._coneLockedToast()).toBe(MAP_ROTATION_LOCKED_TOAST);
    $(card, "btnLock").click();
    expect(said).toEqual([LOCK_ON_TOAST_CEILING, LOCK_OFF_TOAST_CEILING]);

    // Back on a wall, the words are as they were.
    push(card, hass, { mount: null });
    expect($(card, "coneRotationLabel").textContent).toBe("Cone rotation: ");
    expect($(card, "coneMountHint").textContent).toBe(CONE_MOUNT_HINT);
    expect($(card, "mirrorHint").textContent).toBe(MIRROR_HINT);
    expect($(card, "btnLock").title).toBe(LOCK_TITLE);
    expect($(card, "zoneEmptyRotation").textContent).toBe(ZONES_EMPTY_ROTATION);
    expect(card._coneLockedToast()).toBe(CONE_LOCKED_TOAST);
    $(card, "btnLock").click();
    $(card, "btnLock").click();
    expect(said.slice(2)).toEqual([LOCK_ON_TOAST, LOCK_OFF_TOAST]);
  });

  it("keeps a whole-room zone's name off the ceiling unit", async () => {
    const card = await mount(
      hassOf({
        payload: {
          mount: "ceiling",
          zones: { "1": { shape: "ellipse", data: { cx: 0, cy: 0, rx: 4000, ry: 4000 }, name: "Room" } },
        },
      })
    );
    const labels = card._zoneLabelLayout(null, { rangeLabel: null });
    expect(labels).toHaveLength(1);
    const label = placementBox(labels[0]);
    const puck = card._puckBox();
    const apart =
      label.right <= puck.left ||
      label.left >= puck.right ||
      label.bottom <= puck.top ||
      label.top >= puck.bottom;
    expect(apart).toBe(true);
  });
});

describe("whole-room zones", () => {
  const ROOM = { "1": { shape: "none", data: null, name: "Room" } };

  async function roomCard(options: Options = {}, height: number | null = null) {
    const hass = hassOf({
      ...options,
      payload: { mount: "ceiling", ceiling_height_mm: height, zones: ROOM, ...options.payload },
    });
    const card = await mount(hass);
    card._setSelectedZone(1);
    card._renderZoneManager();
    hass.callService.mockClear();
    return { card, hass };
  }

  it("hides and refuses the room buttons while a replay shows", async () => {
    const { card, hass } = await roomCard({ payload: { movement_history: true } });
    expect($(card, "zoneRoom").hidden).toBe(false);
    card._history.open = true;
    card._history.series = { slots: [] };
    card._renderHistoryPanel();
    expect($(card, "zoneRoom").hidden).toBe(true);
    card._drawRoomShape(1, "circle");
    expect(writes(hass)).toEqual([]);
    card._closeHistory();
    expect($(card, "zoneRoom").hidden).toBe(false);
  });

  it("gives the zone a square or a circle as big as the coverage", async () => {
    const { card, hass } = await roomCard();
    expect($(card, "zoneRoom").hidden).toBe(false);
    $(card, "btnRoomSquare").click();
    expect(writes(hass)[0]).toMatchObject({
      zone_id: 1,
      shape: "rect",
      data: { x_min: -4000, x_max: 4000, y_min: -4000, y_max: 4000 },
    });
    $(card, "btnRoomCircle").click();
    expect(writes(hass)[1]).toMatchObject({
      zone_id: 1,
      shape: "ellipse",
      data: { cx: 0, cy: 0, rx: 4000, ry: 4000 },
    });
  });

  it("follows a low ceiling's smaller circle", async () => {
    const { card, hass } = await roomCard({}, 2000);
    $(card, "btnRoomCircle").click();
    expect(writes(hass)[0].data).toEqual({ cx: 0, cy: 0, rx: 3464, ry: 3464 });
  });

  it("says to unlock a locked map and saves nothing", async () => {
    const { card, hass } = await roomCard();
    const said = toasts(card);
    $(card, "btnLock").click();
    expect($(card, "zoneRoom").hidden).toBe(false);
    expect($(card, "btnRoomSquare").getAttribute("aria-disabled")).toBe("true");
    $(card, "btnRoomSquare").click();
    expect(writes(hass)).toEqual([]);
    expect(said).toContain(DRAW_LOCKED_TOAST);
  });

  it("is not offered to a viewer, on a wall, or for an ignore zone", async () => {
    const viewer = await roomCard({ admin: false });
    expect($(viewer.card, "zoneRoom").hidden).toBe(true);
    const wall = await roomCard({ payload: { mount: null } });
    expect($(wall.card, "zoneRoom").hidden).toBe(true);
    const ignore = await roomCard({
      payload: { zones: { "1": { shape: "none", data: null, name: "Fan", zone_type: "ignore" } } },
    });
    expect($(ignore.card, "zoneRoom").hidden).toBe(true);
  });

  it("adds a whole-room zone in one tap, which Undo takes back", async () => {
    const hass = hassOf({ payload: { mount: "ceiling" } });
    const card = await mount(hass);
    const said = toasts(card);
    expect($(card, "btnRoomZoneAdd").hidden).toBe(false);
    $(card, "btnRoomZoneAdd").click();
    expect(writes(hass).map((w) => [w.zone_id, w.shape])).toEqual([
      [1, "none"],
      [1, "ellipse"],
    ]);
    expect(writes(hass)[1].data).toEqual({ cx: 0, cy: 0, rx: 4000, ry: 4000 });
    await settle();
    expect(said).toContain("Zone 1 drawn");
    hass.callWS.mockImplementation(async (msg: any) => ({ restored: [{ zone_id: 1, shape: "none", data: null }], skipped: [], msg }));
    await card._undoChange(card._undo);
    const restore = hass.callWS.mock.calls.map(([msg]: any[]) => msg).find((msg: any) => msg.zones);
    expect(restore.zones).toEqual([
      {
        zone_id: 1,
        current: { shape: "ellipse", data: { cx: 0, cy: 0, rx: 4000, ry: 4000 } },
        previous: { shape: "none", data: null },
      },
    ]);
    expect(card._getZone(1)).toBeFalsy();
  });

  it("closes a replay and adds a filled whole-room zone", async () => {
    const hass = hassOf({ payload: { mount: "ceiling", movement_history: true } });
    const card = await mount(hass);
    card._history.open = true;
    card._history.series = { slots: [] };
    card._renderHistoryPanel();
    expect(card._replayShowing()).toBe(true);
    expect($(card, "btnRoomZoneAdd").hidden).toBe(false);
    $(card, "btnRoomZoneAdd").click();
    expect(card._history.open).toBe(false);
    expect($(card, "historyPanel").hidden).toBe(true);
    expect(writes(hass).map((w) => [w.zone_id, w.shape])).toEqual([
      [1, "none"],
      [1, "ellipse"],
    ]);
  });

  it("offers no whole-room zone on a wall map or to a viewer", async () => {
    expect($(await mount(hassOf()), "btnRoomZoneAdd").hidden).toBe(true);
    const viewer = await mount(hassOf({ admin: false, payload: { mount: "ceiling" } }));
    expect($(viewer, "btnRoomZoneAdd").hidden).toBe(true);
  });

  it("offers no whole-room zone during Walk, and adds none from it", async () => {
    const hass = hassOf({ payload: { mount: "ceiling" } });
    const card = await mount(hass);
    card._enterWalk();
    expect($(card, "btnRoomZoneAdd").hidden).toBe(true);
    card._addRoomZone();
    expect(writes(hass)).toEqual([]);
    card._exitWalk();
    expect($(card, "btnRoomZoneAdd").hidden).toBe(false);
  });
});

describe("Walk around a ceiling radar", () => {
  beforeEach(() => vi.useFakeTimers());

  async function walkCard(payload: Record<string, any>) {
    const hass = hassOf({ payload: { zones: { "1": { shape: "none", data: null } }, ...payload } });
    const card = await mount(hass);
    card._setSelectedZone(1);
    card._enterWalk();
    hass.callService.mockClear();
    const corner = (x: number, y: number) => {
      at(card, hass, [[x, y]]);
      vi.advanceTimersByTime(2000);
      $(card, "btnWalkCorner").click();
    };
    return { card, hass, corner };
  }

  it("says corners can be on any side of the radar", async () => {
    const { card, hass } = await walkCard({ mount: "ceiling" });
    expect($(card, "walkHint").textContent).toBe(WALK_HINT_NOBODY_CEILING);
    at(card, hass, [[0, 0]]);
    expect($(card, "walkHint").textContent).toBe(WALK_HINT_START_CEILING);
  });

  it("saves corners walked as an X as a polygon around the center", async () => {
    const { card, hass, corner } = await walkCard({ mount: "ceiling" });
    corner(-2000, 2000);
    corner(2000, -2000);
    corner(2000, 2000);
    corner(-2000, -2000);
    // The dashed preview runs around the room as Finish will save it.
    const calls = recordCalls(card, () => card._drawWalkPreview(card.ctx));
    const drawn = calls
      .filter(([name]) => name === "moveTo" || name === "lineTo")
      .map(([, [x, y]]) => ({ x, y }));
    expect(selfIntersects(drawn)).toBe(false);
    $(card, "btnWalkFinish").click();
    const saved = writes(hass)[0];
    expect(saved.shape).toBe("polygon");
    expect(saved.data.points).toHaveLength(4);
    expect(selfIntersects(saved.data.points)).toBe(false);
  });

  it("keeps a wall map's walking order and hints", async () => {
    const { card, hass, corner } = await walkCard({});
    at(card, hass, [[0, 2000]]);
    expect($(card, "walkHint").textContent).toBe(WALK_HINT_START);
    corner(-2000, 1000);
    corner(2000, 4000);
    corner(2000, 1000);
    corner(-2000, 4000);
    $(card, "btnWalkFinish").click();
    // A bowtie in walking order is too thin, as it always was.
    expect(writes(hass)).toEqual([]);
  });
});

describe("Test center and edge", () => {
  beforeEach(() => vi.useFakeTimers());

  async function testCard(payload: Record<string, any> = { mount: "ceiling" }, options: Options = {}) {
    const hass = hassOf({ ...options, payload });
    const card = await mount(hass);
    return { card, hass };
  }

  it("is a ceiling map's chip, for every viewer", async () => {
    expect($((await testCard({})).card, "btnTestChip").hidden).toBe(true);
    const { card } = await testCard({ mount: "ceiling" }, { admin: false });
    expect($(card, "btnTestChip").hidden).toBe(false);
    $(card, "btnTestChip").click();
    expect($(card, "testPanel").hidden).toBe(false);
    expect($(card, "btnTestChip").getAttribute("aria-pressed")).toBe("true");
  });

  it("says what the radar sees, one message at a time", async () => {
    const { card, hass } = await testCard();
    $(card, "btnTestChip").click();
    const message = () => $(card, "testMessage").textContent;
    expect(message()).toBe(TEST_NOBODY);
    at(card, hass, [
      [0, 0],
      [1000, 1000],
    ]);
    expect(message()).toBe(TEST_CROWD);
    // (0, 0) is a real LD2460 point: right under it.
    at(card, hass, [[0, 0]]);
    expect(message()).toBe(TEST_CENTER);
    at(card, hass, [[0, 1200]]);
    expect(message()).toBe(testBetween("1.2 m", "2.8 m"));
    at(card, hass, [[0, 4000 - 200]]);
    expect(message()).toBe(testEdge("4.0 m"));
    at(card, hass, []);
    expect(message()).toBe(testLostEdge("3.8 m"));
    vi.advanceTimersByTime(TEST_LOST_SHOW_MS + 100);
    expect(message()).toBe(TEST_NOBODY);
    at(card, hass, [[2000, 0]]);
    at(card, hass, []);
    expect(message()).toBe(testLost("2.0 m"));
    expect($(card, "testMessage").getAttribute("aria-live")).toBe("polite");
  });

  it("leaves out a target in an ignore zone, as presence does", async () => {
    const fan = { x_min: 1500, x_max: 2500, y_min: 1500, y_max: 2500 };
    const { card, hass } = await testCard({
      mount: "ceiling",
      zones: { "1": { shape: "rect", data: fan, name: "Fan", zone_type: "ignore" } },
    });
    $(card, "btnTestChip").click();
    at(card, hass, [
      [0, 0],
      [2000, 2000],
    ]);
    expect($(card, "testMessage").textContent).toBe(TEST_CENTER);
  });

  it("ticks the center and the edge until the test is turned off", async () => {
    const { card, hass } = await testCard();
    $(card, "btnTestChip").click();
    at(card, hass, [[100, -100]]);
    at(card, hass, [[0, -3900]]);
    at(card, hass, [[0, 2000]]);
    expect($(card, "testCheckCenter").textContent).toBe("✓ Right under the radar");
    expect($(card, "testCheckEdge").textContent).toBe("✓ At the edge");
    $(card, "btnTestChip").click();
    expect($(card, "testPanel").hidden).toBe(true);
    $(card, "btnTestChip").click();
    expect($(card, "testCheckCenter").textContent).toBe("Right under the radar");
    expect($(card, "testCheckEdge").textContent).toBe("At the edge");
  });

  it("steps aside for Walk and for History", async () => {
    const { card, hass } = await testCard({ mount: "ceiling", movement_history: true });
    $(card, "btnTestChip").click();
    card._enterWalk();
    expect(card._test).toBeNull();
    expect($(card, "btnTestChip").disabled).toBe(true);
    expect($(card, "btnTestChip").title).toBe(TEST_WALK_TITLE);
    card._exitWalk();
    expect($(card, "btnTestChip").disabled).toBe(false);
    $(card, "btnTestChip").click();
    hass.callWS.mockImplementation(async () => new Promise(() => {}));
    card._openHistory();
    expect(card._test).toBeNull();
    expect($(card, "btnTestChip").hidden).toBe(true);
  });

  it("draws the center ring and the edge band only while on", async () => {
    const { card, hass } = await testCard();
    const draw = () => recordCalls(card, () => card._drawTestRings(card.ctx));
    expect(draw()).toEqual([]);
    $(card, "btnTestChip").click();
    at(card, hass, [[0, 0]]);
    const calls = draw();
    const radii = calls.filter(([name]) => name === "arc").map(([, args]) => args[2]);
    const px = (mm: number) => Math.abs(card.valueToPixels(mm, "x") - card.valueToPixels(0, "x"));
    expect(radii).toEqual([px(4000), px(4000 - TEST_EDGE_BAND_MM), px(TEST_CENTER_MM)]);
    // Turned off with the ticks; a wall map turns it off too.
    push(card, hass, { mount: null });
    expect(card._test).toBeNull();
    expect(draw()).toEqual([]);
  });
});

describe("Test center and edge, timing and lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());

  it("counts a loss from when the target goes, not its last move", async () => {
    const hass = hassOf({ payload: { mount: "ceiling" } });
    const card = await mount(hass);
    $(card, "btnTestChip").click();
    at(card, hass, [[0, 1200]]);
    vi.advanceTimersByTime(TEST_LOST_SHOW_MS + 1000);
    at(card, hass, []);
    expect($(card, "testMessage").textContent).toBe(testLost("1.2 m"));
  });

  it("lets a loss message expire across a detach", async () => {
    const hass = hassOf({ payload: { mount: "ceiling" } });
    const card = await mount(hass);
    $(card, "btnTestChip").click();
    at(card, hass, [[0, 1200]]);
    at(card, hass, []);
    card.disconnectedCallback();
    vi.advanceTimersByTime(TEST_LOST_SHOW_MS + 100);
    card.connectedCallback();
    expect($(card, "testMessage").textContent).toBe(TEST_NOBODY);
  });

  it("stops when the same card turns view-only", async () => {
    const hass = hassOf({ payload: { mount: "ceiling" } });
    const card = await mount(hass);
    $(card, "btnTestChip").click();
    expect(card._test).not.toBeNull();
    card.setConfig({ device_id: DEV, start_locked: false, view_only: true });
    expect(card._test).toBeNull();
  });

  it("draws the edge band from the radius it tests by, whatever the YAML cone", async () => {
    const hass = hassOf({ payload: { mount: "ceiling" } });
    const card = await mount(hass, { cone: { y_max: 2000 } });
    $(card, "btnTestChip").click();
    const calls = recordCalls(card, () => card._drawTestRings(card.ctx));
    const radii = calls.filter(([name]) => name === "arc").map(([, args]) => args[2]);
    const px = (mm: number) => Math.abs(card.valueToPixels(mm, "x") - card.valueToPixels(0, "x"));
    expect(radii[0]).toBeCloseTo(px(card._mountInfo().radiusMm), 6);
    expect(card._mountInfo().radiusMm).toBe(4000);
  });
});

describe("the ceiling map, expanded", () => {
  let observers: any[] = [];
  class FakeResizeObserver {
    constructor(public callback: any) {
      observers.push(this);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  beforeEach(() => {
    observers = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.spyOn(history, "back").mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    history.replaceState(null, "");
  });

  function box(width: number, height: number): DOMRect {
    return { left: 0, top: 0, right: width, bottom: height, x: 0, y: 0, width, height, toJSON: () => ({}) } as DOMRect;
  }

  it.each([
    ["side", 1200, 700],
    ["stacked", 374, 780],
  ])("keeps the switch, the height and the test working %s", async (layout, width, height) => {
    const hass = hassOf();
    const card = await mount(hass);
    document.body.appendChild(card);
    const container = card.shadowRoot.querySelector(".container");
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue(box(width + 16, height + 16));
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element: Element, pseudo?: string | null) =>
      element === container
        ? ({ paddingLeft: "8px", paddingRight: "8px", paddingTop: "8px", paddingBottom: "8px" } as any)
        : real(element, pseudo)
    );
    $(card, "btnFullWindow").click();
    expect(card.shadowRoot.querySelector(".container").dataset.layout).toBe(layout);
    expect($(card, "fullWindow").contains($(card, "mountOption"))).toBe(true);
    $(card, "btnMountCeiling").click();
    expect(writes(hass)).toEqual([{ device_id: DEV, mount: "ceiling" }]);
    const input = $(card, "ceilingHeightInput");
    expect($(card, "ceilingHeightOption").hidden).toBe(false);
    input.value = "2.5";
    input.dispatchEvent(new Event("change"));
    expect(writes(hass)[1]).toEqual({ device_id: DEV, ceiling_height_mm: 2500 });
    $(card, "btnTestChip").click();
    expect($(card, "testPanel").hidden).toBe(false);
    expect($(card, "fullWindow").contains($(card, "testPanel"))).toBe(true);
  });
});
