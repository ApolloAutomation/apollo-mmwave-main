/**
 * The "Radar setup" card in gate mode (`radar: "gate"`), mounted in happy-dom,
 * and its pure checks. The card reads an MSR-1's, MSR-2's or R PRO-1's gate
 * radar from live HA state, learns from the calibration feed whether a job
 * owns Radar Engineering Mode, and writes only when a button is clicked, so
 * these tests change states, push feed payloads and click buttons, then read
 * the copy and the recorded service calls.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApolloRadarSetupCard, SETUP_CARD_TAG } from "../src/cards/setup-card";
import {
  CHECKING_LINE,
  ENGINEERING_OFF_LABEL,
  GATE_NOTHING_TO_CHECK_LINE,
  NO_ANSWER_LINE,
  gateSetupStatus,
  gateWatchedIds,
} from "../src/cards/gate-setup-checks";
import {
  ALL_GOOD_LINE,
  NO_DEVICE_LINE,
  OFFLINE_LINE,
  RECOMMENDED_LABEL,
  SETTING_NOT_FOUND,
  WAITING_LINE,
  type SetupProblem,
  type SetupStatus,
} from "../src/cards/setup-checks";
import {
  CALIBRATION_RETRY_DELAYS_MS,
  CALIBRATION_SUBSCRIBE,
  CONFIG_ENTRIES_SUBSCRIBE,
  type JobState,
} from "../src/calibration/api";
import {
  READING_SETTINGS,
  READ_SETTINGS_LABEL,
  READ_SETTINGS_WAIT_MS,
} from "../src/calibration/model";
import type { JobActivity } from "../src/calibration/job-watch";
import { entityMapFromDevice, resolveProfile } from "../src/entities";
import type { HassEntity, HomeAssistant } from "../src/types";

type Handler = (message: any) => void;

const MSR2 = "apollo_msr_2_abc123";
const MSR1 = "apollo_msr_1_def456";
const RPRO = "apollo_r_pro_1_w_7a711c";

/** MSR-2 spellings; the MSR-1 differs only in Bluetooth and gate size. */
const ld2410Ids = (base: string) => ({
  engineering: `switch.${base}_radar_engineering_mode`,
  query: `button.${base}_query_params`,
  timeout: `number.${base}_radar_timeout`,
  maxMove: `number.${base}_radar_max_move_distance`,
  maxStill: `number.${base}_radar_max_still_distance`,
  start1: `number.${base}_radar_zone_1_start`,
  end1: `number.${base}_radar_end_zone_1`,
  end2: `number.${base}_radar_end_zone_2`,
  end3: `number.${base}_radar_end_zone_3`,
  move: (g: number) => `number.${base}_g${g}_move_threshold`,
  still: (g: number) => `number.${base}_g${g}_still_threshold`,
});
const M2 = ld2410Ids(MSR2);
const M1 = ld2410Ids(MSR1);
const M2_GATE_SIZE = `select.${MSR2}_ld2410_gate_size`;
const M1_GATE_SIZE = `select.${MSR1}_radar_distance_resolution`;
const M1_BLUETOOTH = `switch.${MSR1}_radar_control_bluetooth`;
const M2_BLUETOOTH = `switch.${MSR2}_ld2410_bluetooth`;

const R = {
  engineering: `switch.${RPRO}_ld2412_engineering_mode`,
  query: `button.${RPRO}_ld2412_query_params`,
  timeout: `number.${RPRO}_ld2412_timeout`,
  maxGate: `number.${RPRO}_ld2412_max_distance_gate`,
  minGate: `number.${RPRO}_ld2412_min_distance_gate`,
  move: (g: number) => `number.${RPRO}_ld2412_g${String(g).padStart(2, "0")}_move_threshold`,
  still: (g: number) => `number.${RPRO}_ld2412_g${String(g).padStart(2, "0")}_still_threshold`,
  zoneType: `select.${RPRO}_ld2450_zone_type`,
  targetX: `sensor.${RPRO}_ld2450_target_1_x`,
};

interface FakeHass {
  states: Record<string, HassEntity>;
  entities: Record<string, { device_id?: string; platform?: string }>;
  devices: Record<string, any>;
  callService: ReturnType<typeof vi.fn>;
  connection: {
    subscribeMessage: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  /** Calibration feed handlers and their subscribe messages. */
  handlers: Handler[];
  subscriptions: Record<string, any>[];
  unsubscribes: ReturnType<typeof vi.fn>[];
  entryHandlers: Handler[];
  listeners: Record<string, (() => void)[]>;
  subscribeError: any;
}

function fakeHass(): FakeHass {
  const hass: FakeHass = {
    states: {},
    entities: {},
    devices: {},
    callService: vi.fn(async () => undefined),
    handlers: [],
    subscriptions: [],
    unsubscribes: [],
    entryHandlers: [],
    listeners: {},
    subscribeError: undefined,
    connection: {
      subscribeMessage: vi.fn(async (cb: Handler, msg: Record<string, any>) => {
        if (msg.type === CONFIG_ENTRIES_SUBSCRIBE) {
          hass.entryHandlers.push(cb);
          return vi.fn();
        }
        if (hass.subscribeError) throw hass.subscribeError;
        hass.handlers.push(cb);
        hass.subscriptions.push(msg);
        const unsubscribe = vi.fn();
        hass.unsubscribes.push(unsubscribe);
        return unsubscribe;
      }),
      addEventListener: vi.fn((event: string, cb: () => void) => {
        (hass.listeners[event] ||= []).push(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: () => void) => {
        hass.listeners[event] = (hass.listeners[event] ?? []).filter((c) => c !== cb);
      }),
    },
  };
  return hass;
}

function add(
  hass: FakeHass,
  deviceId: string,
  id: string,
  state: string,
  attributes: Record<string, any> = {}
): void {
  hass.states[id] = { entity_id: id, state, attributes };
  hass.entities[id] = { device_id: deviceId, platform: "esphome" };
}

interface Ld2410Opts {
  engineering?: string;
  thresholds?: string;
  maxMove?: string;
  maxStill?: string;
  timeout?: string;
  zones?: [string, string, string, string];
  gateSize?: string;
  query?: boolean;
}

/** An MSR-2 (or, with `msr1`, an MSR-1) on device msr2 / msr1, defaulting to
 *  the firmware's own values: zones 0 / 50 / 150 / 250 cm, max gates 8. */
function ld2410Hass(opts: Ld2410Opts = {}, msr1 = false): FakeHass {
  const hass = fakeHass();
  addLd2410(hass, opts, msr1);
  return hass;
}

function addLd2410(hass: FakeHass, opts: Ld2410Opts = {}, msr1 = false): void {
  const dev = msr1 ? "msr1" : "msr2";
  const m = msr1 ? M1 : M2;
  const put = (id: string, state: string, attributes?: Record<string, any>) =>
    add(hass, dev, id, state, attributes);
  put(m.engineering, opts.engineering ?? "off");
  if (opts.query !== false) put(m.query, "unknown");
  put(m.timeout, opts.timeout ?? "5", { unit_of_measurement: "s" });
  put(m.maxMove, opts.maxMove ?? "8");
  put(m.maxStill, opts.maxStill ?? "8");
  for (let g = 0; g < 9; g++) {
    put(m.move(g), opts.thresholds ?? "50");
    put(m.still(g), opts.thresholds ?? "30");
  }
  const zones = opts.zones ?? ["0", "50", "150", "250"];
  [m.start1, m.end1, m.end2, m.end3].forEach((id, i) =>
    put(id, zones[i], { unit_of_measurement: "cm" })
  );
  put(msr1 ? M1_BLUETOOTH : M2_BLUETOOTH, "off");
  if (opts.gateSize !== undefined) put(msr1 ? M1_GATE_SIZE : M2_GATE_SIZE, opts.gateSize);
  hass.devices[dev] = msr1
    ? { name: "Den MSR-1", manufacturer: "ApolloAutomation", model: "MSR-1" }
    : { name: "Den MSR-2", manufacturer: "ApolloAutomation", model: "MSR-2" };
}

/** An R PRO-1 on device rpro: its LD2412 plus a few LD2450 entities. */
function rproHass(
  opts: { engineering?: string; maxGate?: string; minGate?: string; thresholds?: string } = {}
): FakeHass {
  const hass = fakeHass();
  const put = (id: string, state: string) => add(hass, "rpro", id, state);
  put(R.engineering, opts.engineering ?? "off");
  put(R.query, "unknown");
  put(R.timeout, "5");
  put(R.maxGate, opts.maxGate ?? "13");
  put(R.minGate, opts.minGate ?? "1");
  for (let g = 0; g < 14; g++) {
    put(R.move(g), opts.thresholds ?? "30");
    put(R.still(g), opts.thresholds ?? "30");
  }
  put(R.zoneType, "Detection");
  put(R.targetX, "0");
  hass.devices.rpro = { name: "Office R PRO-1", manufacturer: "ApolloAutomation", model: "R-PRO-1-W" };
  return hass;
}

/** The same hass after state changes: a new object with new `states`. */
function withStates(hass: FakeHass, changes: Record<string, string>): FakeHass {
  const states = { ...hass.states };
  for (const [id, state] of Object.entries(changes)) states[id] = { ...states[id], state };
  return { ...hass, states };
}

function job(overrides: Partial<JobState> = {}): JobState {
  return {
    job_id: "job1",
    kind: "calibrate",
    status: "sampling",
    sub_phase: null,
    started_at: "2026-10-30T14:30:00+00:00",
    elapsed_s: 18,
    remaining_s: 42,
    duration_s: 60,
    settle_s: 15,
    samples: 18,
    peaks: { move: {}, still: {} },
    writes_done: 0,
    writes_total: 0,
    apply: true,
    cancel_requested: false,
    engineering_mode_turned_on: false,
    ...overrides,
  };
}

async function settle(el: any): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await el.updateComplete;
}

/** Push a calibration payload to every open feed; `stored` is the job id of
 *  the stored last result. */
async function push(
  el: any,
  hass: FakeHass,
  running: JobState | null,
  stored?: string
): Promise<void> {
  const last_result = stored ? { job_id: stored } : null;
  for (const h of hass.handlers) {
    h({ job: running, snapshots: [], last_result, interrupted: null, entities: null });
  }
  await settle(el);
}

async function mount(
  hass: FakeHass,
  config: Record<string, unknown> = { device_id: "msr2", radar: "gate" }
): Promise<ApolloRadarSetupCard & HTMLElement> {
  const el = document.createElement(SETUP_CARD_TAG) as ApolloRadarSetupCard & HTMLElement;
  el.setConfig({ type: `custom:${SETUP_CARD_TAG}`, ...config });
  el.hass = hass as any;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

/** Mounted, with the feed answered: no job running. */
async function mountIdle(
  hass: FakeHass,
  config?: Record<string, unknown>
): Promise<ApolloRadarSetupCard & HTMLElement> {
  const el = await mount(hass, config);
  await push(el, hass, null);
  return el;
}

function text(el: Element): string {
  return (el.shadowRoot?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function labels(el: Element): string[] {
  return Array.from(el.shadowRoot!.querySelectorAll("button")).map((b) => b.textContent!.trim());
}

function button(el: Element, label: string): HTMLButtonElement {
  const found = Array.from(el.shadowRoot!.querySelectorAll("button")).find(
    (b) => b.textContent!.trim() === label
  );
  if (!found) throw new Error(`no button "${label}" in: ${text(el)}`);
  return found;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Pure checks
// ---------------------------------------------------------------------------

/** gateSetupStatus for a device, resolved the way the card resolves it. */
function statusOf(
  hass: FakeHass,
  deviceId: string | undefined,
  job: JobActivity = "idle"
): SetupStatus {
  const h = hass as unknown as HomeAssistant;
  const map = (deviceId && entityMapFromDevice(h, deviceId)) || {
    move_threshold: [],
    still_threshold: [],
    move_energy: [],
    still_energy: [],
  };
  const profile = deviceId ? resolveProfile(h, { type: "x", device_id: deviceId }) : undefined;
  return gateSetupStatus(h, deviceId, map, profile, job);
}

function problemsOf(status: SetupStatus): SetupProblem[] {
  expect(status.kind).toBe("checked");
  return status.kind === "checked" ? status.problems : [];
}

function problem(status: SetupStatus, setting: SetupProblem["setting"]): SetupProblem | undefined {
  return problemsOf(status).find((p) => p.setting === setting);
}

describe("gate setup checks", () => {
  it("finds nothing wrong with the firmware's own values", () => {
    expect(statusOf(ld2410Hass(), "msr2")).toEqual({ kind: "checked", problems: [] });
    expect(statusOf(ld2410Hass({}, true), "msr1")).toEqual({ kind: "checked", problems: [] });
    expect(statusOf(rproHass(), "rpro")).toEqual({ kind: "checked", problems: [] });
  });

  it("needs a device, and a gate radar on it", () => {
    expect(statusOf(ld2410Hass(), undefined).kind).toBe("no_device");
    // An MTR-1: an LD2450 and no gate radar.
    const hass = fakeHass();
    add(hass, "mtr", "sensor.apollo_mtr_1_abc_target_1_x", "0");
    add(hass, "mtr", "select.apollo_mtr_1_abc_zone_type", "Disabled");
    hass.devices.mtr = { name: "Hall", manufacturer: "ApolloAutomation", model: "MTR-1" };
    expect(statusOf(hass, "mtr").kind).toBe("nothing_to_check");
  });

  it("is offline when every checked entity is unavailable", () => {
    const hass = ld2410Hass({ engineering: "on" });
    const off = withStates(
      hass,
      Object.fromEntries(Object.keys(hass.states).map((id) => [id, "unavailable"]))
    );
    expect(statusOf(off, "msr2").kind).toBe("offline");
  });

  it("flags Radar Engineering Mode left on with a named switch.turn_off", () => {
    const p = problem(statusOf(ld2410Hass({ engineering: "on" }), "msr2"), "engineering_mode")!;
    expect(p.level).toBe("note");
    expect(p.text).toBe(
      "Radar Engineering Mode is on, so every gate's energy is saved to the database about once a second."
    );
    expect(p.hint).toBe(
      "Turn it off when you finish tuning. The Gate Energy chart needs it only while you watch it."
    );
    expect(p.fix).toMatchObject({
      domain: "switch",
      service: "turn_off",
      data: { entity_id: M2.engineering },
      label: "Turn off Radar Engineering Mode",
      progress: "Turning off Radar Engineering Mode...",
      failure: "Could not turn Radar Engineering Mode off",
    });
  });

  it("leaves Radar Engineering Mode to a running calibration job", () => {
    expect(statusOf(ld2410Hass({ engineering: "on" }), "msr2", "running")).toEqual({
      kind: "checked",
      problems: [],
    });
  });

  it("holds the Radar Engineering Mode line back until it knows about jobs", () => {
    expect(statusOf(ld2410Hass({ engineering: "on" }), "msr2", "unknown")).toEqual({
      kind: "checking",
    });
    // Off, there is nothing to wait for.
    expect(statusOf(ld2410Hass(), "msr2", "unknown")).toEqual({ kind: "checked", problems: [] });
    // Other problems show meanwhile, without the switch's.
    const status = statusOf(ld2410Hass({ engineering: "on", timeout: "unknown" }), "msr2", "unknown");
    expect(problemsOf(status).map((p) => p.setting)).toEqual(["settings_unread"]);
  });

  it.each([
    [{ thresholds: "unknown" }, "gate thresholds"],
    [{ maxStill: "unknown" }, "detection range"],
    [{ timeout: "unknown" }, "timeout"],
    [{ thresholds: "unknown", timeout: "unknown" }, "gate thresholds and timeout"],
    [
      { thresholds: "unknown", maxMove: "unknown", timeout: "unknown" },
      "gate thresholds, detection range, and timeout",
    ],
  ] as [Ld2410Opts, string][])("names what the radar has not reported (%o)", (opts, parts) => {
    const p = problem(statusOf(ld2410Hass(opts), "msr2"), "settings_unread")!;
    expect(p.text).toBe(`The radar has not reported its ${parts} yet, so those settings are blank.`);
    expect(p.hint).toBe("This only asks the radar to send them. Nothing on the radar changes.");
    expect(p.fix).toMatchObject({
      domain: "button",
      service: "press",
      data: { entity_id: M2.query },
      label: READ_SETTINGS_LABEL,
      progress: READING_SETTINGS,
      settleMs: READ_SETTINGS_WAIT_MS,
      noAnswer: NO_ANSWER_LINE,
    });
  });

  it("says where the button is when it cannot press it", () => {
    const noButton = ld2410Hass({ timeout: "unknown", query: false });
    const missing = problem(statusOf(noButton, "msr2"), "settings_unread")!;
    expect(missing.fix).toBeUndefined();
    expect(missing.hint).toBe("Press Query Params on the radar's device page to make it send them.");
    const hass = ld2410Hass({ timeout: "unknown" });
    const down = withStates(hass, { [M2.query]: "unavailable" });
    expect(problem(statusOf(down, "msr2"), "settings_unread")!.fix).toBeUndefined();
  });

  it.each([
    [
      ["300", "50", "150", "250"],
      "Zone 1 can never turn on. Start Zone 1 (300 cm) must be smaller than End Zone 1 (50 cm).",
    ],
    [
      ["0", "150", "100", "250"],
      "Zone 2 can never turn on. End Zone 2 (100 cm) must be larger than End Zone 1 (150 cm).",
    ],
    [
      ["0", "50", "150", "150"],
      "Zone 3 can never turn on. End Zone 3 (150 cm) must be larger than End Zone 2 (150 cm).",
    ],
  ] as [Ld2410Opts["zones"], string][])("explains zones out of order %j", (zones, line) => {
    const p = problem(statusOf(ld2410Hass({ zones }), "msr2"), "zone_order")!;
    expect(p.level).toBe("warning");
    expect(p.text).toBe(line);
    expect(p.hint).toBe(
      "Each zone starts where the one before it ends. Change the distances on the Zone Config card."
    );
    expect(p.fix).toBeUndefined();
  });

  it("lists every zone that can never turn on in one problem", () => {
    const status = statusOf(ld2410Hass({ zones: ["0", "200", "100", "50"] }), "msr2");
    expect(problemsOf(status).map((p) => p.setting)).toEqual(["zone_order"]);
    expect(problem(status, "zone_order")!.text).toBe(
      "Zone 2 can never turn on. End Zone 2 (100 cm) must be larger than End Zone 1 (200 cm)." +
        " Zone 3 can never turn on. End Zone 3 (50 cm) must be larger than End Zone 2 (100 cm)."
    );
  });

  it("accepts a zone that starts where it ends, as the firmware does", () => {
    expect(statusOf(ld2410Hass({ zones: ["50", "50", "150", "250"] }), "msr2")).toEqual({
      kind: "checked",
      problems: [],
    });
  });

  it("notes a zone that runs past the radar's reach", () => {
    // Max gates 3 at 0.75 m: about 225 cm.
    const p = problem(statusOf(ld2410Hass({ maxMove: "3", maxStill: "2" }), "msr2"), "zone_reach")!;
    expect(p.level).toBe("note");
    expect(p.text).toBe("Zone 3 ends at 250 cm, past the radar's reach of about 225 cm.");
    expect(p.hint).toBe(
      "The reach comes from Max Move Gate and Max Still Gate. Lower the zone distances," +
        " or raise those gates on the Detection Range card."
    );
    expect(p.fix).toBeUndefined();
  });

  it("warns when a zone starts past the radar's reach", () => {
    const p = problem(
      statusOf(ld2410Hass({ maxMove: "2", maxStill: "2", zones: ["0", "100", "200", "300"] }), "msr2"),
      "zone_reach"
    )!;
    expect(p.level).toBe("warning");
    expect(p.text).toBe(
      "Zone 2 ends at 200 cm, past the radar's reach of about 150 cm." +
        " Zone 3 starts at 200 cm, past the radar's reach of about 150 cm, so it can never turn on."
    );
  });

  it("does not repeat a zone that is already out of order as past the reach", () => {
    const status = statusOf(
      ld2410Hass({ maxMove: "2", maxStill: "2", zones: ["0", "100", "50", "120"] }),
      "msr2"
    );
    expect(problemsOf(status).map((p) => p.setting)).toEqual(["zone_order"]);
  });

  it("reads the gate size from the select when it is enabled, on either model", () => {
    // 8 gates of 0.2 m: about 160 cm.
    const msr2 = problem(statusOf(ld2410Hass({ gateSize: "0.2m" }), "msr2"), "zone_reach")!;
    expect(msr2.text).toBe("Zone 3 ends at 250 cm, past the radar's reach of about 160 cm.");
    const msr1 = problem(statusOf(ld2410Hass({ gateSize: "0.2m" }, true), "msr1"), "zone_reach")!;
    expect(msr1.text).toBe("Zone 3 ends at 250 cm, past the radar's reach of about 160 cm.");
    // The select's own unknown state falls back to 0.75 m gates.
    expect(statusOf(ld2410Hass({ gateSize: "unknown" }), "msr2")).toEqual({
      kind: "checked",
      problems: [],
    });
  });

  it("skips the reach until a max gate reads", () => {
    const status = statusOf(ld2410Hass({ maxMove: "unknown", maxStill: "unknown" }), "msr2");
    expect(problemsOf(status).map((p) => p.setting)).toEqual(["settings_unread"]);
  });

  it("warns when an LD2412's Min Gate is above its Max Gate", () => {
    const p = problem(statusOf(rproHass({ minGate: "9", maxGate: "5" }), "rpro"), "gate_range")!;
    expect(p.level).toBe("warning");
    expect(p.text).toBe(
      "Min Gate (9) is above Max Gate (5). The LD2412 only detects people from Min Gate" +
        " out to Max Gate, so it may never see anyone."
    );
    expect(p.hint).toBe("Set Min Gate lower than Max Gate on the Detection Range card.");
    expect(p.fix).toBeUndefined();
  });

  it("warns when an LD2412's Min Gate equals its Max Gate", () => {
    const p = problem(statusOf(rproHass({ minGate: "5", maxGate: "5" }), "rpro"), "gate_range")!;
    expect(p.text).toBe(
      "Min Gate and Max Gate are both 5. The LD2412 only detects people from Min Gate" +
        " out to Max Gate, so it covers one narrow band."
    );
  });

  it("checks the LD2412's own switch and query button", () => {
    const status = statusOf(rproHass({ engineering: "on", thresholds: "unknown" }), "rpro");
    const fixes = problemsOf(status).map((p) => p.fix);
    expect(fixes.map((f) => [f!.domain, f!.service, f!.data])).toEqual([
      ["switch", "turn_off", { entity_id: R.engineering }],
      ["button", "press", { entity_id: R.query }],
    ]);
  });

  it("waits while nothing it checks has a value", () => {
    const hass = fakeHass();
    add(hass, "msr2", M2.engineering, "unknown");
    add(hass, "msr2", M2.move(0), "50");
    hass.states[M2.move(0)].state = "unavailable";
    hass.devices.msr2 = { name: "Den", manufacturer: "ApolloAutomation", model: "MSR-2" };
    expect(statusOf(hass, "msr2")).toEqual({ kind: "waiting" });
  });

  it("watches the checked entities and the gate size select", () => {
    const hass = ld2410Hass({ gateSize: "0.75m" }) as unknown as HomeAssistant;
    const map = entityMapFromDevice(hass, "msr2")!;
    const ids = gateWatchedIds(map, resolveProfile(hass, { type: "x", device_id: "msr2" }));
    expect(ids).toEqual(
      expect.arrayContaining([M2.engineering, M2.query, M2.timeout, M2.end3, M2.move(8), M2_GATE_SIZE])
    );
    expect(ids).not.toContain(M2_BLUETOOTH);
    expect(gateWatchedIds(map, undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

describe("gate setup card states", () => {
  it("says the settings look good, with the chip and device name, and no buttons", async () => {
    const el = await mountIdle(ld2410Hass());
    expect(text(el)).toContain(ALL_GOOD_LINE);
    expect(text(el)).toContain("LD2410 · Den MSR-2");
    expect(labels(el)).toEqual([]);
    expect((el.shadowRoot!.querySelector("ha-card") as any).header).toBe("Radar setup");
  });

  it("subscribes to this device's calibration feed only in gate mode", async () => {
    const hass = ld2410Hass();
    await mount(hass);
    expect(hass.subscriptions).toEqual([{ type: CALIBRATION_SUBSCRIBE, device_id: "msr2" }]);
    const ld2450 = rproHass();
    await mount(ld2450, { device_id: "rpro" });
    expect(ld2450.subscriptions).toEqual([]);
  });

  it("holds the Radar Engineering Mode line until the feed answers", async () => {
    const hass = ld2410Hass({ engineering: "on" });
    const el = await mount(hass);
    expect(text(el)).toContain(CHECKING_LINE);
    expect(text(el)).not.toContain(ALL_GOOD_LINE);
    expect(labels(el)).toEqual([]);
    await push(el, hass, null);
    expect(text(el)).toContain("Radar Engineering Mode is on");
    expect(labels(el)).toEqual([ENGINEERING_OFF_LABEL]);
  });

  it("hides the Radar Engineering Mode line while a calibration job runs", async () => {
    const hass = ld2410Hass({ engineering: "on" });
    const el = await mountIdle(hass);
    expect(labels(el)).toEqual([ENGINEERING_OFF_LABEL]);

    await push(el, hass, job());
    expect(text(el)).not.toContain("Radar Engineering Mode is on");
    expect(labels(el)).toEqual([]);
    expect(text(el)).toContain(ALL_GOOD_LINE);

    // A restore job hides it as well.
    await push(el, hass, job({ kind: "restore", status: "applying" }));
    expect(labels(el)).toEqual([]);
    // Past its last status the job may still be turning the switch off; only
    // its stored result, or its leaving the registry, gives the line back.
    await push(el, hass, job({ status: "done" }), "older");
    expect(labels(el)).toEqual([]);
    await push(el, hass, job({ status: "done" }), "job1");
    expect(labels(el)).toEqual([ENGINEERING_OFF_LABEL]);
    await push(el, hass, job());
    await push(el, hass, null, "job1");
    expect(labels(el)).toEqual([ENGINEERING_OFF_LABEL]);
  });

  it("shows the line when the integration is not loaded, then retries the feed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hass = ld2410Hass({ engineering: "on" });
    hass.subscribeError = { code: "not_loaded", message: "Apollo mmWave is not loaded." };
    const el = await mount(hass);
    expect(labels(el)).toEqual([ENGINEERING_OFF_LABEL]);
    const calls = () =>
      hass.connection.subscribeMessage.mock.calls.filter(([, m]) => m.type === CALIBRATION_SUBSCRIBE)
        .length;
    expect(calls()).toBe(1);
    hass.subscribeError = undefined;
    await vi.advanceTimersByTimeAsync(CALIBRATION_RETRY_DELAYS_MS[0]);
    await settle(el);
    expect(calls()).toBe(2);
    await push(el, hass, job());
    expect(labels(el)).toEqual([]);
  });

  it("does not resubscribe on every tick after a refusal", async () => {
    const hass = ld2410Hass({ engineering: "on" });
    hass.subscribeError = { code: "not_found", message: "No device" };
    const el = await mount(hass);
    el.hass = withStates(hass, { [M2.timeout]: "6" }) as any;
    await settle(el);
    const calls = hass.connection.subscribeMessage.mock.calls.filter(
      ([, m]) => m.type === CALIBRATION_SUBSCRIBE
    );
    expect(calls).toHaveLength(1);
    expect(labels(el)).toEqual([ENGINEERING_OFF_LABEL]);
  });

  it("reopens the feed when the connection is ready again", async () => {
    const hass = ld2410Hass({ engineering: "on" });
    const el = await mountIdle(hass);
    await push(el, hass, job());
    for (const cb of hass.listeners.ready ?? []) cb();
    await settle(el);
    expect(hass.unsubscribes[0]).toHaveBeenCalled();
    expect(hass.subscriptions).toHaveLength(2);
    // Until the new feed speaks, the last answer stands.
    expect(labels(el)).toEqual([]);
    const [, reopened] = hass.handlers;
    reopened({ job: null, snapshots: [], last_result: null, interrupted: null, entities: null });
    await settle(el);
    expect(labels(el)).toEqual([ENGINEERING_OFF_LABEL]);
  });

  it("reopens the feed when Apollo mmWave loads again", async () => {
    const hass = ld2410Hass();
    const el = await mountIdle(hass);
    for (const cb of hass.entryHandlers) {
      cb([{ type: "updated", entry: { domain: "apollo_mmwave", state: "loaded" } }]);
    }
    await settle(el);
    expect(hass.subscriptions).toHaveLength(2);
  });

  it("closes the feed when it leaves the page", async () => {
    const hass = ld2410Hass();
    const el = await mountIdle(hass);
    el.remove();
    expect(hass.unsubscribes[0]).toHaveBeenCalled();
    expect(hass.listeners.ready ?? []).toEqual([]);
  });

  it("asks for a device id, and says when the device has no gate radar", async () => {
    expect(text(await mount(ld2410Hass(), { radar: "gate" }))).toContain(NO_DEVICE_LINE);
    const hass = ld2410Hass();
    hass.devices.mtr = { name: "Hall", manufacturer: "ApolloAutomation", model: "MTR-1" };
    add(hass, "mtr", "sensor.apollo_mtr_1_abc_target_1_x", "0");
    expect(text(await mountIdle(hass, { device_id: "mtr", radar: "gate" }))).toContain(
      GATE_NOTHING_TO_CHECK_LINE
    );
  });

  it("says the radar is offline and hides every button", async () => {
    const hass = ld2410Hass({ engineering: "on", timeout: "unknown" });
    const off = withStates(
      hass,
      Object.fromEntries(Object.keys(hass.states).map((id) => [id, "unavailable"]))
    );
    const el = await mountIdle(off);
    expect(text(el)).toContain(OFFLINE_LINE);
    expect(labels(el)).toEqual([]);
  });

  it("waits while the radar has reported nothing it checks", async () => {
    const hass = fakeHass();
    add(hass, "msr2", M2.engineering, "unknown");
    hass.devices.msr2 = { name: "Den", manufacturer: "ApolloAutomation", model: "MSR-2" };
    const el = await mountIdle(hass);
    expect(text(el)).toContain(WAITING_LINE);
  });

  it("explains zone and range problems without a button", async () => {
    const el = await mountIdle(ld2410Hass({ zones: ["0", "150", "100", "250"] }));
    expect(text(el)).toContain("Zone 2 can never turn on.");
    expect(el.shadowRoot!.querySelector("p.warning")).not.toBeNull();
    expect(labels(el)).toEqual([]);
    const rpro = await mountIdle(rproHass({ minGate: "9", maxGate: "5" }), {
      device_id: "rpro",
      radar: "gate",
    });
    expect(text(rpro)).toContain("Min Gate (9) is above Max Gate (5).");
    expect(labels(rpro)).toEqual([]);
  });

  it("follows the live state without a click", async () => {
    const hass = ld2410Hass({ engineering: "on" });
    const el = await mountIdle(hass);
    el.hass = withStates(hass, { [M2.engineering]: "off" }) as any;
    await settle(el);
    expect(text(el)).toContain(ALL_GOOD_LINE);
  });

  it("skips hass ticks that change none of its entities", async () => {
    const hass = ld2410Hass({ engineering: "on" });
    const el = await mountIdle(hass);
    const spy = vi.spyOn(el as any, "render");
    el.hass = withStates(hass, { [M2_BLUETOOTH]: "on" }) as any;
    await settle(el);
    expect(spy).not.toHaveBeenCalled();
    el.hass = withStates(hass, { [M2.end3]: "900" }) as any;
    await settle(el);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("gate setup card on each model", () => {
  it("uses the MSR-1's entities", async () => {
    const hass = ld2410Hass({ engineering: "on", thresholds: "unknown" }, true);
    const el = await mountIdle(hass, { device_id: "msr1", radar: "gate" });
    expect(text(el)).toContain("LD2410 · Den MSR-1");
    button(el, ENGINEERING_OFF_LABEL).click();
    await settle(el);
    button(el, READ_SETTINGS_LABEL).click();
    await settle(el);
    expect(hass.callService.mock.calls).toEqual([
      ["switch", "turn_off", { entity_id: M1.engineering }, undefined, false],
      ["button", "press", { entity_id: M1.query }, undefined, false],
    ]);
  });

  it("uses the MSR-2's entities", async () => {
    const hass = ld2410Hass({ engineering: "on", thresholds: "unknown" });
    const el = await mountIdle(hass);
    button(el, ENGINEERING_OFF_LABEL).click();
    await settle(el);
    button(el, READ_SETTINGS_LABEL).click();
    await settle(el);
    expect(hass.callService.mock.calls).toEqual([
      ["switch", "turn_off", { entity_id: M2.engineering }, undefined, false],
      ["button", "press", { entity_id: M2.query }, undefined, false],
    ]);
  });

  it("checks the R PRO-1's LD2412, not its LD2450", async () => {
    const hass = rproHass({ engineering: "on", thresholds: "unknown" });
    const el = await mountIdle(hass, { device_id: "rpro", radar: "gate" });
    expect(text(el)).toContain("LD2412 · Office R PRO-1");
    expect(text(el)).not.toContain("Zone Type");
    expect(hass.subscriptions).toEqual([{ type: CALIBRATION_SUBSCRIBE, device_id: "rpro" }]);
    // One button per fix, never the combined LD2450 one.
    expect(labels(el)).toEqual([ENGINEERING_OFF_LABEL, READ_SETTINGS_LABEL]);
    expect(labels(el)).not.toContain(RECOMMENDED_LABEL);
    button(el, ENGINEERING_OFF_LABEL).click();
    await settle(el);
    button(el, READ_SETTINGS_LABEL).click();
    await settle(el);
    expect(hass.callService.mock.calls).toEqual([
      ["switch", "turn_off", { entity_id: R.engineering }, undefined, false],
      ["button", "press", { entity_id: R.query }, undefined, false],
    ]);
  });

  it("keeps the LD2450 checks on the same device in LD2450 mode", async () => {
    const el = await mount(rproHass({ engineering: "on" }), { device_id: "rpro" });
    expect(text(el)).toContain("LD2450 · Office R PRO-1");
    expect(text(el)).toContain("Zone Type is Detection.");
    expect(text(el)).not.toContain("Radar Engineering Mode");
  });
});

describe("gate setup card buttons", () => {
  it("disables every button and names the change while a call runs", async () => {
    const hass = ld2410Hass({ engineering: "on", timeout: "unknown" });
    let finish!: () => void;
    hass.callService.mockImplementation(
      () => new Promise<void>((resolve) => (finish = () => resolve()))
    );
    const el = await mountIdle(hass);
    button(el, ENGINEERING_OFF_LABEL).click();
    await el.updateComplete;
    expect(text(el)).toContain("Turning off Radar Engineering Mode...");
    expect(button(el, ENGINEERING_OFF_LABEL).disabled).toBe(true);
    expect(button(el, READ_SETTINGS_LABEL).disabled).toBe(true);
    button(el, READ_SETTINGS_LABEL).click();
    expect(hass.callService).toHaveBeenCalledTimes(1);

    finish();
    await settle(el);
    expect(text(el)).not.toContain("Turning off");
    expect(button(el, READ_SETTINGS_LABEL).disabled).toBe(false);
  });

  it("keeps reading until the settings arrive", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hass = ld2410Hass({ thresholds: "unknown" });
    const el = await mountIdle(hass);
    button(el, READ_SETTINGS_LABEL).click();
    await settle(el);
    expect(hass.callService.mock.calls).toEqual([
      ["button", "press", { entity_id: M2.query }, undefined, false],
    ]);
    // The press returned, but the radar has not answered yet.
    expect(text(el)).toContain(READING_SETTINGS);
    expect(button(el, READ_SETTINGS_LABEL).disabled).toBe(true);

    const answered: Record<string, string> = {};
    for (let g = 0; g < 9; g++) {
      answered[M2.move(g)] = "50";
      answered[M2.still(g)] = "30";
    }
    el.hass = withStates(hass, answered) as any;
    await settle(el);
    expect(text(el)).not.toContain(READING_SETTINGS);
    expect(text(el)).toContain(ALL_GOOD_LINE);
    await vi.advanceTimersByTimeAsync(READ_SETTINGS_WAIT_MS);
    await settle(el);
    expect(text(el)).not.toContain(NO_ANSWER_LINE);
  });

  it("says so when the radar does not answer, and lets the user try again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hass = ld2410Hass({ timeout: "unknown" });
    const el = await mountIdle(hass);
    button(el, READ_SETTINGS_LABEL).click();
    await settle(el);
    await vi.advanceTimersByTimeAsync(READ_SETTINGS_WAIT_MS - 1);
    await settle(el);
    expect(text(el)).toContain(READING_SETTINGS);
    await vi.advanceTimersByTimeAsync(1);
    await settle(el);
    expect(text(el)).not.toContain(READING_SETTINGS);
    expect(text(el)).toContain(NO_ANSWER_LINE);
    expect(button(el, READ_SETTINGS_LABEL).disabled).toBe(false);

    // A second try clears the line; the answer arriving clears it too.
    button(el, READ_SETTINGS_LABEL).click();
    await settle(el);
    expect(text(el)).not.toContain(NO_ANSWER_LINE);
    el.hass = withStates(hass, { [M2.timeout]: "30" }) as any;
    await settle(el);
    expect(text(el)).toContain(ALL_GOOD_LINE);
  });

  it("drops the no-answer line once the settings arrive", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hass = ld2410Hass({ timeout: "unknown" });
    const el = await mountIdle(hass);
    button(el, READ_SETTINGS_LABEL).click();
    await settle(el);
    await vi.advanceTimersByTimeAsync(READ_SETTINGS_WAIT_MS);
    await settle(el);
    expect(text(el)).toContain(NO_ANSWER_LINE);
    el.hass = withStates(hass, { [M2.timeout]: "30" }) as any;
    await settle(el);
    expect(text(el)).not.toContain(NO_ANSWER_LINE);
  });

  it("shows its own error line when the switch call fails, and clears it on the next try", async () => {
    const hass = ld2410Hass({ engineering: "on" });
    hass.callService.mockRejectedValueOnce({
      code: "home_assistant_error",
      message: "Device is offline",
    });
    const el = await mountIdle(hass);
    button(el, ENGINEERING_OFF_LABEL).click();
    await settle(el);
    expect(el.shadowRoot!.querySelector("p.error")!.textContent).toBe(
      "Could not turn Radar Engineering Mode off: Device is offline."
    );
    button(el, ENGINEERING_OFF_LABEL).click();
    await settle(el);
    expect(el.shadowRoot!.querySelector("p.error")).toBeNull();
  });

  it("names a failed read, and does not wait for an answer to it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hass = ld2410Hass({ timeout: "unknown" });
    hass.callService.mockRejectedValueOnce({ code: "not_found", message: "Entity not found" });
    const el = await mountIdle(hass);
    button(el, READ_SETTINGS_LABEL).click();
    await settle(el);
    expect(el.shadowRoot!.querySelector("p.error")!.textContent).toBe(
      `Could not ask the radar for its settings: ${SETTING_NOT_FOUND}`
    );
    expect(text(el)).not.toContain(READING_SETTINGS);
    expect(button(el, READ_SETTINGS_LABEL).disabled).toBe(false);
  });

  it("never calls a service on its own", async () => {
    const hass = ld2410Hass({
      engineering: "on",
      thresholds: "unknown",
      zones: ["300", "50", "40", "30"],
    });
    const el = await mountIdle(hass);
    await push(el, hass, job());
    await push(el, hass, null);
    el.hass = withStates(hass, { [M2.end3]: "20", [M2.engineering]: "on" }) as any;
    await settle(el);
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("drops a call that settles after the device changed", async () => {
    const hass = ld2410Hass({ engineering: "on" });
    addLd2410(hass, { engineering: "on" }, true);
    let fail!: () => void;
    hass.callService.mockImplementation(
      () => new Promise<void>((_, reject) => (fail = () => reject({ message: "Timed out" })))
    );
    const el = await mountIdle(hass);
    button(el, ENGINEERING_OFF_LABEL).click();
    await settle(el);
    el.setConfig({ type: `custom:${SETUP_CARD_TAG}`, device_id: "msr1", radar: "gate" });
    await settle(el);
    await push(el, hass, null);
    expect(text(el)).toContain("LD2410 · Den MSR-1");
    fail();
    await settle(el);
    expect(el.shadowRoot!.querySelector("p.error")).toBeNull();
    expect(button(el, ENGINEERING_OFF_LABEL).disabled).toBe(false);
    // The new device has its own feed.
    const latest = hass.subscriptions[hass.subscriptions.length - 1];
    expect(latest).toEqual({ type: CALIBRATION_SUBSCRIBE, device_id: "msr1" });
  });
});

describe("gate setup card registration", () => {
  it("stubs a gate radar when no device has an LD2450", () => {
    const hass = ld2410Hass();
    expect(ApolloRadarSetupCard.getStubConfig(hass as any)).toEqual({
      type: `custom:${SETUP_CARD_TAG}`,
      device_id: "msr2",
      radar: "gate",
    });
    // An LD2450 still wins.
    const both = rproHass();
    addLd2410(both);
    expect(ApolloRadarSetupCard.getStubConfig(both as any)).toEqual({
      type: `custom:${SETUP_CARD_TAG}`,
      device_id: "rpro",
    });
  });

  it("describes both radars in the card picker", () => {
    const entry = ((window as any).customCards ?? []).find(
      (c: { type?: string }) => c.type === SETUP_CARD_TAG
    );
    expect(entry.description).toBe(
      "Checks an Apollo radar's settings and offers one-click fixes: the LD2450 on an" +
        " R PRO-1 or MTR-1, or the gate radar on an MSR-1, MSR-2 or R PRO-1."
    );
  });
});
