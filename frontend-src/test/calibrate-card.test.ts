/**
 * The calibrate card, mounted in happy-dom. The job runs in the backend; the
 * card is a view of the subscription payload plus three service calls, so
 * these tests push payloads through a fake connection and read the rendered
 * copy, never the backend.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  ApolloRadarCalibrateCard,
  CALIBRATE_CARD_TAG,
  READ_SETTINGS_LABEL,
  READ_SETTINGS_WAIT_MS,
  thresholdCell,
} from "../src/cards/calibrate-card";
import { render } from "lit";
import {
  CALIBRATION_RETRY_DELAYS_MS,
  CALIBRATION_SUBSCRIBE,
  CONFIG_ENTRIES_SUBSCRIBE,
  type CalibrationPayload,
  type CalibrationResult,
  type ChannelResult,
  type EntitiesInfo,
  type GateResult,
  type JobState,
} from "../src/calibration/api";
import { LD2410_FACTORY_THRESHOLDS, LD2410_PROFILE, LD2412_PROFILE } from "../src/profiles";
import type { HassEntity } from "../src/types";

type Handler = (message: any) => void;

const BASE = "apollo_msr_2_abc123";
const M = LD2410_PROFILE.entityMap(BASE);
const RPRO_BASE = "apollo_r_pro_1_abc123";
const RM = LD2412_PROFILE.entityMap(RPRO_BASE);

interface FakeHass {
  states: Record<string, HassEntity>;
  entities: Record<string, { device_id?: string; platform?: string }>;
  devices: Record<string, any>;
  callService: ReturnType<typeof vi.fn>;
  callWS: ReturnType<typeof vi.fn>;
  connection: {
    subscribeMessage: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  /** Calibration subscriptions only; the config entry feed is kept apart. */
  handlers: Handler[];
  subscriptions: Record<string, any>[];
  unsubscribes: ReturnType<typeof vi.fn>[];
  entryHandlers: Handler[];
  entryUnsubscribes: ReturnType<typeof vi.fn>[];
  listeners: Record<string, (() => void)[]>;
  subscribeError: any;
  localize?: (key: string, values?: Record<string, any>) => string;
  loadBackendTranslation?: ReturnType<typeof vi.fn>;
}

function ent(id: string, state: string): HassEntity {
  return { entity_id: id, state, attributes: { min: 0, max: 100, step: 1 } };
}

/** An MSR-2 (LD2410) with factory thresholds, registered under device dev1. */
function ld2410Hass(opts: { switchState?: string; thresholds?: { move: number[]; still: number[] } } = {}): FakeHass {
  const states: Record<string, HassEntity> = {};
  const entities: FakeHass["entities"] = {};
  const add = (id: string, state: string) => {
    states[id] = ent(id, state);
    entities[id] = { device_id: "dev1", platform: "esphome" };
  };
  add(M.engineering_mode!, opts.switchState ?? "off");
  add(M.radar_target!, "off");
  const thresholds = opts.thresholds ?? LD2410_FACTORY_THRESHOLDS;
  for (let g = 0; g < 9; g++) {
    add(M.move_threshold[g], String(thresholds.move[g]));
    add(M.still_threshold[g], String(thresholds.still[g]));
    add(M.move_energy[g], "unknown");
    add(M.still_energy[g], "unknown");
  }
  return fakeHass(states, entities, {
    dev1: { name: "Living Room MSR-2", manufacturer: "ApolloAutomation", model: "MSR-2" },
  });
}

/** An R-PRO-1 (LD2412) registered under device rpro. */
function ld2412Hass(opts: { backgroundState?: string; switchState?: string } = {}): FakeHass {
  const states: Record<string, HassEntity> = {};
  const entities: FakeHass["entities"] = {};
  const add = (id: string, state: string) => {
    states[id] = ent(id, state);
    entities[id] = { device_id: "rpro", platform: "esphome" };
  };
  add(RM.engineering_mode!, opts.switchState ?? "off");
  add(RM.background_correction_status!, opts.backgroundState ?? "off");
  add(RM.background_correction!, "unknown");
  for (let g = 0; g < 14; g++) {
    add(RM.move_threshold[g], "30");
    add(RM.still_threshold[g], "30");
  }
  return fakeHass(states, entities, {
    rpro: { name: "Office R-PRO-1", manufacturer: "ApolloAutomation", model: "R-PRO-1-W" },
  });
}

function fakeHass(
  states: Record<string, HassEntity>,
  entities: FakeHass["entities"],
  devices: Record<string, any>
): FakeHass {
  const hass: FakeHass = {
    states,
    entities,
    devices,
    callService: vi.fn(async () => undefined),
    callWS: vi.fn(async () => null),
    handlers: [],
    subscriptions: [],
    unsubscribes: [],
    entryHandlers: [],
    entryUnsubscribes: [],
    listeners: {},
    subscribeError: undefined,
    connection: {
      subscribeMessage: vi.fn(async (cb: Handler, msg: Record<string, any>) => {
        if (msg.type === CONFIG_ENTRIES_SUBSCRIBE) {
          hass.entryHandlers.push(cb);
          const unsubscribe = vi.fn();
          hass.entryUnsubscribes.push(unsubscribe);
          return unsubscribe;
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

const ENTITIES: EntitiesInfo = {
  profile: "ld2410",
  gate_count: 9,
  engineering_mode: M.engineering_mode!,
  engineering_mode_on: false,
  background_status: null,
  background_status_on: false,
  max_move_gate: 6,
  max_still_gate: 6,
  min_gate: null,
  max_gate: null,
};

function payload(overrides: Partial<CalibrationPayload> = {}): CalibrationPayload {
  return { job: null, snapshots: [], last_result: null, interrupted: null, entities: ENTITIES, ...overrides };
}

function job(overrides: Partial<JobState> = {}): JobState {
  return {
    job_id: "job1",
    kind: "calibrate",
    status: "sampling",
    sub_phase: null,
    started_at: "2026-10-11T14:30:00+00:00",
    elapsed_s: 18,
    remaining_s: 42,
    duration_s: 60,
    settle_s: 15,
    samples: 18,
    peaks: { move: { "0": 14, "1": 9 }, still: { "0": 97 } },
    writes_done: 0,
    writes_total: 0,
    apply: true,
    cancel_requested: false,
    engineering_mode_turned_on: true,
    ...overrides,
  };
}

function channel(entityId: string, overrides: Partial<ChannelResult> = {}): ChannelResult {
  return {
    entity_id: entityId,
    peak: 14,
    p95: 12,
    old: 50,
    new: 24,
    samples: 60,
    written: true,
    confirmed: true,
    actual: 24,
    flags: [],
    skipped: null,
    ...overrides,
  };
}

function gate(n: number, move: Partial<ChannelResult> = {}, still: Partial<ChannelResult> = {}): GateResult {
  return {
    gate: n,
    move: channel(M.move_threshold[n], move),
    still: channel(M.still_threshold[n], still),
  };
}

const SNAPSHOT_AT = new Date(2026, 9, 11, 14, 31).toISOString();
const SNAPSHOT = { id: "snap1", taken_at: SNAPSHOT_AT, reason: "calibrate" as const, count: 18 };

function result(overrides: Partial<CalibrationResult> = {}): CalibrationResult {
  return {
    job_id: "job1",
    device_id: "dev1",
    kind: "calibrate",
    status: "done",
    outcome: "applied",
    snapshot_id: "snap1",
    started_at: "2026-10-11T14:30:00+00:00",
    finished_at: new Date(2026, 9, 11, 14, 32).toISOString(),
    duration_s: 60,
    settle_s: 15,
    margin: 10,
    margin_pct: 25,
    kind_filter: "both",
    samples: 60,
    presence_fraction: 0.03,
    moving_fraction: 0,
    engineering_mode_turned_on: true,
    profile: "ld2410",
    max_move_gate: 6,
    max_still_gate: 6,
    min_gate: null,
    max_gate: null,
    gates: [gate(0), gate(1), gate(7, { flags: ["unused"] }, { flags: ["unused"] })],
    changed: 16,
    unchanged: 2,
    writes_done: 16,
    writes_total: 16,
    unverified: [],
    gates_off: [],
    warnings: [],
    error: null,
    ...overrides,
  };
}

const REDO_AT = new Date(2026, 9, 11, 14, 40).toISOString();
const REDO = { id: "snap2", taken_at: REDO_AT, reason: "restore" as const, count: 18 };

/** A restore result in the backend's real shape (`result_payload` for kind
 *  restore): `gates: []`, the calibrate-only keys null, plus `restored`,
 *  `missing` and `restored_from`. */
function restoreResult(overrides: Partial<CalibrationResult> = {}): CalibrationResult {
  return result({
    job_id: "job2",
    kind: "restore",
    outcome: "restored",
    snapshot_id: "snap2",
    finished_at: REDO_AT,
    duration_s: null,
    settle_s: null,
    margin: null,
    margin_pct: null,
    kind_filter: null,
    samples: 0,
    presence_fraction: null,
    moving_fraction: null,
    engineering_mode_turned_on: false,
    gates: [],
    changed: 16,
    unchanged: 2,
    writes_done: 16,
    writes_total: 16,
    restored: 16,
    missing: [],
    restored_from: { id: "snap1", taken_at: SNAPSHOT_AT },
    ...overrides,
  });
}

/** Let promise chains (a rejection, its translation load) and the render run. */
async function settle(card: ApolloRadarCalibrateCard): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await card.updateComplete;
}

/** How many calibration subscribes the card sent (the entry feed aside). */
function calSubscribes(hass: FakeHass): number {
  return hass.connection.subscribeMessage.mock.calls.filter(([, msg]) => msg.type === CALIBRATION_SUBSCRIBE)
    .length;
}

/** HA replaces `hass` and the changed state objects on every state change. */
async function setStates(
  card: ApolloRadarCalibrateCard,
  hass: FakeHass,
  changes: Record<string, string>
): Promise<FakeHass> {
  const states = { ...hass.states };
  for (const [id, state] of Object.entries(changes)) states[id] = ent(id, state);
  const next: FakeHass = { ...hass, states };
  (card as any).hass = next;
  await settle(card);
  return next;
}

async function mount(
  hass: FakeHass,
  config: Record<string, any> = { device_id: "dev1" },
  opts: { expectSubscribe?: boolean } = {}
): Promise<ApolloRadarCalibrateCard> {
  const card = new ApolloRadarCalibrateCard();
  document.body.appendChild(card);
  card.setConfig({ type: `custom:${CALIBRATE_CARD_TAG}`, ...config });
  (card as any).hass = hass;
  await settle(card);
  if (opts.expectSubscribe !== false) {
    await vi.waitFor(() => expect(hass.handlers.length).toBeGreaterThan(0));
  }
  return card;
}

async function push(card: ApolloRadarCalibrateCard, hass: FakeHass, p: CalibrationPayload): Promise<void> {
  hass.handlers[hass.handlers.length - 1](p);
  await settle(card);
}

function text(card: ApolloRadarCalibrateCard): string {
  return (card.shadowRoot?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function buttons(card: ApolloRadarCalibrateCard): HTMLButtonElement[] {
  return Array.from(card.shadowRoot!.querySelectorAll("button"));
}

function button(card: ApolloRadarCalibrateCard, label: string | RegExp): HTMLButtonElement | undefined {
  return buttons(card).find((b) => {
    const t = (b.textContent ?? "").replace(/\s+/g, " ").trim();
    return typeof label === "string" ? t === label : label.test(t);
  });
}

function expectedTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function expectedDayTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// The fixtures are stamped 2026-10-11, and the card adds the date to any time
// that is not today. Freeze today on the fixtures' day (Date only, so tests
// that fake setTimeout still install their own timers) or these tests fail on
// any other date.
const FIXTURE_NOW = new Date("2026-10-11T15:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("calibrate card registration", () => {
  it("registers as apollo-radar-calibrate-card and in window.customCards", () => {
    expect(CALIBRATE_CARD_TAG).toBe("apollo-radar-calibrate-card");
    expect(customElements.get("apollo-radar-calibrate-card")).toBe(ApolloRadarCalibrateCard);
    const entry = (window as any).customCards.find((c: any) => c.type === "apollo-radar-calibrate-card");
    expect(entry.name).toBe("Apollo Radar Auto-Calibrate");
  });

  it("subscribes to the calibration feed for the configured device", async () => {
    const hass = ld2410Hass();
    await mount(hass);
    expect(hass.subscriptions[0]).toEqual({ type: CALIBRATION_SUBSCRIBE, device_id: "dev1" });
    expect(hass.listeners.ready).toHaveLength(1);
    expect(hass.listeners.disconnected).toHaveLength(1);
  });
});

describe("calibrate card idle state", () => {
  it("renders the checklist, the countdown-and-listen sentence and the primary button", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload());
    const t = text(card);
    expect(t).toContain("LD2410 · Living Room MSR-2");
    expect(t).toContain(
      "It counts down 15 seconds so you can leave, listens for 1 minute, then sets every gate's move and still threshold a margin above the background it heard."
    );
    expect(t).toContain("Nobody in the radar's view: people, pets, robot vacuums.");
    expect(t).toContain(
      "Fans, curtains and plants that normally move are part of the background. Leave them as they usually are."
    );
    expect(t).toContain("Home Assistant turns Radar Engineering Mode on for the listen and back off afterward.");
    expect(card.shadowRoot!.querySelectorAll("li")).toHaveLength(3);
    const primary = button(card, "Calibrate with empty room")!;
    expect(primary.classList.contains("primary")).toBe(true);
    expect(primary.disabled).toBe(false);
    expect(t).not.toContain("LD2412:");
  });

  it("uses the config's durations in the first sentence", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass, { device_id: "dev1", calibration: { settle_s: 0, duration_s: 120 } });
    await push(card, hass, payload());
    expect(text(card)).toContain("It listens for 2 minutes, then sets");
    expect(text(card)).not.toContain("counts down");
  });

  it("renders the device-id hint and no button when no device resolves", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass, {}, { expectSubscribe: false });
    expect(text(card)).toContain("Add device_id to this card's configuration to enable auto-calibration.");
    expect(buttons(card)).toHaveLength(0);
    expect(hass.connection.subscribeMessage).not.toHaveBeenCalled();
    expect(hass.entryHandlers).toHaveLength(0);
  });

  it("resolves the device through device_base_name when the registry knows the entities", async () => {
    const hass = ld2410Hass();
    await mount(hass, { device_base_name: BASE });
    expect(hass.subscriptions[0].device_id).toBe("dev1");
  });

  it("switches the engineering bullet when the switch already reads on", async () => {
    const hass = ld2410Hass({ switchState: "on" });
    const card = await mount(hass);
    await push(card, hass, payload());
    expect(text(card)).toContain("Radar Engineering Mode is already on and will stay on.");
    expect(text(card)).not.toContain("turns Radar Engineering Mode on for the listen");
  });

  it("renders the LD2412 bullet and disables the button while background correction runs", async () => {
    const hass = ld2412Hass({ backgroundState: "on" });
    const card = await mount(hass, { device_id: "rpro" });
    const entities: EntitiesInfo = {
      ...ENTITIES,
      profile: "ld2412",
      gate_count: 14,
      engineering_mode: RM.engineering_mode!,
      background_status: RM.background_correction_status!,
      background_status_on: true,
      max_move_gate: null,
      max_still_gate: null,
      min_gate: 1,
      max_gate: 11,
    };
    await push(card, hass, payload({ entities }));
    const t = text(card);
    expect(t).toContain("LD2412 · Office R-PRO-1");
    expect(t).toContain(
      "LD2412: run Start Dynamic Background Correction (Controls card) first with the room empty and wait for its status to turn off. Calibrate afterward."
    );
    expect(t).toContain("Background correction is running on the LD2412. Wait for its status to turn off.");
    expect(button(card, "Calibrate with empty room")!.disabled).toBe(true);

    // The backend pushes only from job code, so with no job running the
    // payload keeps saying "on": the live state is what turns it off.
    const later = await setStates(card, hass, { [RM.background_correction_status!]: "off" });
    expect(text(card)).not.toContain("Background correction is running");
    expect(button(card, "Calibrate with empty room")!.disabled).toBe(false);

    await setStates(card, later, { [RM.background_correction_status!]: "on" });
    expect(text(card)).toContain("Background correction is running on the LD2412.");
    expect(button(card, "Calibrate with empty room")!.disabled).toBe(true);
  });

  it("disables the button when background correction starts after the last push", async () => {
    const hass = ld2412Hass({ backgroundState: "off" });
    const card = await mount(hass, { device_id: "rpro" });
    const entities: EntitiesInfo = {
      ...ENTITIES,
      profile: "ld2412",
      gate_count: 14,
      engineering_mode: RM.engineering_mode!,
      background_status: RM.background_correction_status!,
      background_status_on: false,
      max_move_gate: null,
      max_still_gate: null,
      min_gate: 1,
      max_gate: 11,
    };
    await push(card, hass, payload({ entities }));
    expect(button(card, "Calibrate with empty room")!.disabled).toBe(false);
    await setStates(card, hass, { [RM.background_correction_status!]: "on" });
    expect(text(card)).toContain("Background correction is running on the LD2412. Wait for its status to turn off.");
    expect(button(card, "Calibrate with empty room")!.disabled).toBe(true);
  });

  it("renders the offline text with the button disabled", async () => {
    const hass = ld2410Hass({ switchState: "unavailable" });
    const card = await mount(hass);
    await push(card, hass, payload());
    expect(text(card)).toContain(
      "Radar is offline. Calibration needs the radar online and its gate entities enabled."
    );
    expect(button(card, "Calibrate with empty room")!.disabled).toBe(true);
    expect(text(card)).not.toContain("Nobody in the radar's view");
  });

  it("shows the factory hint only for matching LD2410 thresholds without a snapshot", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload());
    expect(text(card)).toContain("These look like factory thresholds. Calibrating sets them for your room.");

    await push(card, hass, payload({ snapshots: [SNAPSHOT] }));
    expect(text(card)).not.toContain("These look like factory thresholds");

    const tweaked = ld2410Hass({
      thresholds: {
        move: [...LD2410_FACTORY_THRESHOLDS.move.slice(0, 8), 16],
        still: LD2410_FACTORY_THRESHOLDS.still,
      },
    });
    const other = await mount(tweaked);
    await push(other, tweaked, payload());
    expect(text(other)).not.toContain("These look like factory thresholds");
  });

  it("starts a calibration with the config's calibration values on the primary button", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass, {
      device_id: "dev1",
      calibration: { duration_s: 120, settle_s: 0, margin: 12 },
    });
    await push(card, hass, payload());
    button(card, "Calibrate with empty room")!.click();
    expect(hass.callService).toHaveBeenCalledWith(
      "apollo_mmwave",
      "calibrate_gates",
      { device_id: "dev1", duration_s: 120, settle_s: 0, margin: 12 },
      undefined,
      false
    );
  });

  it("sends only the device id when the config has no calibration block", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload());
    button(card, "Calibrate with empty room")!.click();
    expect(hass.callService.mock.calls[0][2]).toEqual({ device_id: "dev1" });
  });

  it("previews with apply false and explains that engineering mode still turns on", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload());
    expect(text(card)).toContain(
      "Computes new thresholds without changing any of them. Radar Engineering Mode is still turned on for the listen."
    );
    button(card, "Preview only")!.click();
    expect(hass.callService.mock.calls[0][2]).toEqual({ device_id: "dev1", apply: false });
    expect(hass.callService.mock.calls[0][4]).toBe(false);
  });

  it("renders a rejected service call's message in the failed state", async () => {
    const hass = ld2410Hass();
    // Exactly what HA's websocket call_service sends for the pre-flight
    // refusal: "Validation error: " plus the en.json text minus its period.
    hass.callService.mockRejectedValueOnce({
      code: "service_validation_error",
      message: "Validation error: The radar is unavailable right now. Check that it is online, then try again",
      translation_domain: "apollo_mmwave",
      translation_key: "device_offline",
      translation_placeholders: null,
    });
    const card = await mount(hass);
    await push(card, hass, payload());
    button(card, "Calibrate with empty room")!.click();
    await settle(card);
    const t = text(card);
    expect(t).toContain(
      "Calibration failed: The radar is unavailable right now. Check that it is online, then try again."
    );
    expect(t).not.toContain("Validation error");
    const again = button(card, "Try again")!;
    expect(again).toBeTruthy();
    again.click();
    expect(hass.callService).toHaveBeenCalledTimes(2);
  });

  it("renders a refusal from the backend's translation in the user's language", async () => {
    const hass = ld2410Hass();
    const localize = vi.fn((key: string) =>
      key === "component.apollo_mmwave.exceptions.calibration_running.message"
        ? "Für dieses Radar läuft bereits eine Kalibrierung."
        : ""
    );
    hass.loadBackendTranslation = vi.fn(async () => localize);
    hass.callService.mockRejectedValueOnce({
      code: "service_validation_error",
      message: "Validation error: A calibration or restore is already running for this radar",
      translation_domain: "apollo_mmwave",
      translation_key: "calibration_running",
      translation_placeholders: null,
    });
    const card = await mount(hass);
    await push(card, hass, payload());
    button(card, "Calibrate with empty room")!.click();
    await settle(card);
    expect(hass.loadBackendTranslation).toHaveBeenCalledWith("exceptions", "apollo_mmwave");
    expect(text(card)).toContain("Calibration failed: Für dieses Radar läuft bereits eine Kalibrierung.");
  });

  it("says the integration is not loaded when HA cannot find the service", async () => {
    const hass = ld2410Hass();
    hass.callService.mockRejectedValueOnce({
      code: "not_found",
      message: "Service apollo_mmwave.calibrate_gates not found.",
      translation_domain: "homeassistant",
      translation_key: "service_not_found",
      translation_placeholders: { domain: "apollo_mmwave", service: "calibrate_gates" },
    });
    const card = await mount(hass);
    await push(card, hass, payload());
    button(card, "Calibrate with empty room")!.click();
    await settle(card);
    expect(text(card)).toContain(
      "Calibration failed: Apollo mmWave is not loaded, so calibration is unavailable."
    );
    expect(text(card)).not.toContain("no device with this id");
  });

  it("goes back to idle from a refusal with Close", async () => {
    const hass = ld2410Hass();
    hass.callService.mockRejectedValueOnce({
      code: "service_validation_error",
      message: "Validation error: Your Home Assistant user is not allowed to control this radar's entities",
      translation_domain: "apollo_mmwave",
      translation_key: "not_allowed",
      translation_placeholders: null,
    });
    const card = await mount(hass);
    await push(card, hass, payload({ snapshots: [SNAPSHOT], last_result: result() }));
    button(card, "Calibrate with empty room")!.click();
    await settle(card);
    expect(text(card)).toContain(
      "Calibration failed: Your Home Assistant user is not allowed to control this radar's entities."
    );
    expect(button(card, "Show last result")).toBeUndefined();
    button(card, "Close")!.click();
    await settle(card);
    const t = text(card);
    expect(t).not.toContain("Calibration failed");
    expect(t).toContain("Nobody in the radar's view");
    expect(button(card, "Show last result")).toBeTruthy();
    expect(button(card, /^Undo \(restore .* values\)$/)).toBeTruthy();
  });

  it("shows Restore failed for a rejected Undo and retries the restore", async () => {
    const hass = ld2410Hass();
    hass.callService.mockRejectedValueOnce({
      code: "service_validation_error",
      message: "Validation error: The radar is unavailable right now. Check that it is online, then try again",
      translation_domain: "apollo_mmwave",
      translation_key: "device_offline",
      translation_placeholders: null,
    });
    const card = await mount(hass);
    await push(card, hass, payload({ snapshots: [SNAPSHOT], last_result: result() }));
    button(card, "Undo (restore your previous values)")!.click();
    await settle(card);
    expect(text(card)).toContain(
      "Restore failed: The radar is unavailable right now. Check that it is online, then try again."
    );
    button(card, "Try again")!.click();
    expect(hass.callService).toHaveBeenCalledTimes(2);
    expect(hass.callService.mock.calls[1].slice(0, 3)).toEqual([
      "apollo_mmwave",
      "restore_gate_thresholds",
      { device_id: "dev1" },
    ]);
  });

  it("shows a placeholder until the first push arrives", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    expect(text(card)).toContain("Loading...");
    expect(button(card, "Calibrate with empty room")).toBeUndefined();
    await push(card, hass, payload());
    expect(text(card)).not.toContain("Loading...");
  });

  it("renders the footer with Undo and Show last result on a fresh mount with a stored result", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ snapshots: [SNAPSHOT], last_result: result() }));
    const t = text(card);
    // Idle, not the Done view: this card never watched that job finish.
    expect(t).toContain("Nobody in the radar's view");
    expect(t).not.toContain("Thresholds updated");
    expect(t).toMatch(/Last calibrated .*16 of 18 thresholds changed\./);
    const undo = button(card, "Undo (restore your previous values)")!;
    expect(undo).toBeTruthy();
    // The label says what it restores; the time stays in the tooltip.
    expect(undo.title).toBe(`Saved at ${expectedTime(SNAPSHOT_AT)}`);
    expect(card.shadowRoot!.querySelector("table")).toBeNull();

    button(card, "Show last result")!.click();
    await settle(card);
    expect(card.shadowRoot!.querySelector("table")).toBeTruthy();
    expect(text(card)).toContain("50 → 24");
    expect(button(card, "Hide last result")).toBeTruthy();
  });

  it("shows when the Undo values were saved as text under the button, not only in its tooltip", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    // A later preview wrote nothing: the Undo still belongs to the calibration.
    const preview = result({ outcome: "preview", apply: false, snapshot_id: null, writes_done: 0, writes_total: 0 });
    await push(card, hass, payload({ snapshots: [SNAPSHOT], last_result: preview }));
    expect(text(card)).toMatch(/Last previewed /);
    const undo = button(card, "Undo (restore your previous values)")!;
    expect(undo.title).toBe(`Saved at ${expectedTime(SNAPSHOT_AT)}`);
    const helpers = Array.from(card.shadowRoot!.querySelectorAll(".footer .last p.helper")).map((p) =>
      (p.textContent ?? "").trim()
    );
    expect(helpers).toEqual([`Saved ${expectedDayTime(SNAPSHOT_AT)}.`]);
  });

  it("shows a stored restore as its summary and missing entities, never an empty table", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    const last = restoreResult({ missing: ["number.gone_g3_move_threshold"] });
    await push(card, hass, payload({ snapshots: [REDO, SNAPSHOT], last_result: last }));
    expect(text(card)).toContain("Last restored");
    button(card, "Show last result")!.click();
    await settle(card);
    const t = text(card);
    expect(t).toContain(`Restored 16 values at ${expectedTime(REDO_AT)}, 2 unchanged.`);
    expect(t).toContain("Not found any more: number.gone_g3_move_threshold.");
    expect(card.shadowRoot!.querySelector("table")).toBeNull();
  });

  it("shows a stored preview as what it would change", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    const last = result({
      outcome: "preview",
      snapshot_id: null,
      writes_done: 0,
      writes_total: 0,
      changed: 12,
      unchanged: 6,
      gates: [gate(0, { written: false, confirmed: null, actual: null })],
    });
    await push(card, hass, payload({ snapshots: [SNAPSHOT], last_result: last }));
    expect(text(card)).toContain("Last previewed");
    button(card, "Show last result")!.click();
    await settle(card);
    const t = text(card);
    expect(t).toMatch(/Previewed at .* from 60 samples\. 12 of 18 thresholds would change\./);
    expect(t).not.toContain("Calibrated at");
    expect(t).toContain("50 → 24");
    expect(t).not.toContain("(would set)");
  });

  it("shows a stored stop as the stopped sentence", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    const last = result({
      status: "cancelled",
      outcome: "cancelled",
      snapshot_id: null,
      writes_done: 0,
      writes_total: 0,
      changed: 0,
      unchanged: 0,
      gates: [],
    });
    await push(card, hass, payload({ snapshots: [SNAPSHOT], last_result: last }));
    expect(text(card)).toMatch(/Last calibration .* was stopped\./);
    button(card, "Show last result")!.click();
    await settle(card);
    expect(text(card)).toContain("Stopped. Nothing was changed.");
    expect(text(card)).not.toContain("0 of 0 thresholds changed");
    expect(card.shadowRoot!.querySelector("table")).toBeNull();
  });
});

describe("calibrate card running states", () => {
  it("renders the settle countdown with Stop, and Stop cancels", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(
      card,
      hass,
      payload({ job: job({ status: "preparing", sub_phase: "settle", elapsed_s: 3, remaining_s: 12 }) })
    );
    const t = text(card);
    expect(t).toContain("Leave the room now.");
    expect(t).toContain("Listening starts in 12 s.");
    expect(t).toContain("Leave Radar Engineering Mode on until this finishes.");
    const bar = card.shadowRoot!.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("20");
    expect(card.shadowRoot!.querySelector('[aria-live="polite"]')).toBeTruthy();
    button(card, "Stop")!.click();
    expect(hass.callService).toHaveBeenCalledWith(
      "apollo_mmwave",
      "cancel_calibration",
      { device_id: "dev1" },
      undefined,
      false
    );
  });

  it("renders the engineering step", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ job: job({ status: "preparing", sub_phase: "engineering" }) }));
    expect(text(card)).toContain("Turning on Radar Engineering Mode...");
    expect(button(card, "Stop")).toBeTruthy();
    const bar = card.shadowRoot!.querySelector('[role="progressbar"]')!;
    expect(bar.classList.contains("indeterminate")).toBe(true);
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
  });

  it("renders the warmup wait", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ job: job({ status: "preparing", sub_phase: "warmup" }) }));
    expect(text(card)).toContain("Waiting for gate energy from the radar...");
    expect(text(card)).toContain("Leave Radar Engineering Mode on until this finishes.");
  });

  it("renders the listen with live peaks", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ job: job() }));
    const t = text(card);
    expect(t).toContain("Listening to the empty room... 42 s left");
    expect(t).toContain("Keep the room empty. 18 samples so far.");
    expect(t).toContain("Highest so far, move: G0 14 · G1 9");
    expect(t).toContain("Highest so far, still: G0 97");
    expect(button(card, "Stop")).toBeTruthy();
  });

  it("uses the LD2412 keep-on line", async () => {
    const hass = ld2412Hass();
    const card = await mount(hass, { device_id: "rpro" });
    await push(card, hass, payload({ job: job(), entities: { ...ENTITIES, profile: "ld2412" } }));
    expect(text(card)).toContain(
      "Leave Radar Engineering Mode on and do not press Start Dynamic Background Correction until this finishes."
    );
  });

  it("renders the write progress", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ job: job({ status: "applying", writes_done: 7, writes_total: 18 }) }));
    const t = text(card);
    expect(t).toContain("Writing 18 thresholds to the radar... 7 of 18");
    expect(t).toContain("Values already written stay until you undo.");
    expect(card.shadowRoot!.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow")).toBe("39");
    expect(button(card, "Stop")).toBeTruthy();
  });

  it("renders the LD2412 refresh with Stop and verification without it", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ job: job({ status: "applying", sub_phase: "refresh" }) }));
    expect(text(card)).toContain("Reading the radar's current thresholds...");
    expect(button(card, "Stop")).toBeTruthy();
    await push(card, hass, payload({ job: job({ status: "verifying" }) }));
    expect(text(card)).toContain("Checking that the radar accepted the new values...");
    expect(button(card, "Stop")).toBeUndefined();
  });

  it("announces only the phase sentence, not the per-second counters", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ job: job() }));
    const live = Array.from(card.shadowRoot!.querySelectorAll("[aria-live]"));
    expect(live).toHaveLength(1);
    expect(live[0].getAttribute("aria-live")).toBe("polite");
    expect(live[0].textContent!.trim()).toBe("Listening to the empty room...");
    // The visible headline still carries the countdown.
    expect(text(card)).toContain("Listening to the empty room... 42 s left");

    await push(card, hass, payload({ job: job({ elapsed_s: 19, remaining_s: 41, samples: 19 }) }));
    const after = card.shadowRoot!.querySelector("[aria-live]")!;
    expect(after.textContent!.trim()).toBe("Listening to the empty room...");
    expect(after.textContent).not.toMatch(/s left|samples so far|Highest so far/);
  });

  it("shows a rejected Stop inline and drops it once the job ends", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ job: job() }));
    hass.callService.mockRejectedValueOnce({
      code: "home_assistant_error",
      message: "Connection to Home Assistant failed",
    });
    button(card, "Stop")!.click();
    await settle(card);
    expect(text(card)).toContain("Could not stop the calibration: Connection to Home Assistant failed.");
    // Still the running view: the job carries on.
    expect(text(card)).toContain("Listening to the empty room... 42 s left");

    await push(card, hass, payload({ job: null, last_result: result(), snapshots: [SNAPSHOT] }));
    const t = text(card);
    expect(t).toContain("Thresholds updated");
    expect(t).not.toContain("Could not stop the calibration");
    expect(button(card, "Try again")).toBeUndefined();
  });

  it("disables Stop once a cancel was requested", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ job: job({ cancel_requested: true }) }));
    const stop = button(card, "Stopping...")!;
    expect(stop.disabled).toBe(true);
  });

  it("renders a restore in progress without a button", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(
      card,
      hass,
      payload({ job: job({ kind: "restore", status: "applying", writes_done: 7, writes_total: 18 }) })
    );
    expect(text(card)).toContain("Restoring saved thresholds... 7 of 18");
    expect(buttons(card)).toHaveLength(0);
    expect(card.shadowRoot!.querySelector('[role="progressbar"]')).toBeTruthy();
  });
});

describe("calibrate card finished states", () => {
  async function finish(
    hass: FakeHass,
    card: ApolloRadarCalibrateCard,
    last: CalibrationResult,
    extra: Partial<CalibrationPayload> = {}
  ): Promise<void> {
    await push(card, hass, payload({ job: job({ job_id: last.job_id }) }));
    await push(card, hass, payload({ job: null, last_result: last, snapshots: [SNAPSHOT], ...extra }));
  }

  it("renders the table, the walk-around line and Undo after watching the job finish", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await finish(hass, card, result());
    const t = text(card);
    expect(t).toContain("Thresholds updated");
    expect(t).toMatch(/Calibrated at .* from 60 samples\. 16 of 18 thresholds changed\./);
    const headers = Array.from(card.shadowRoot!.querySelectorAll("th[scope=col]")).map((th) =>
      th.textContent!.trim()
    );
    expect(headers).toEqual(["Gate", "Move peak", "Move threshold", "Still peak", "Still threshold"]);
    expect(t).toContain("50 → 24");
    expect(t).toContain("G7: not used (beyond Max Move Gate 6)");
    expect(t).toContain("G7: not used (beyond Max Still Gate 6)");
    expect(card.shadowRoot!.querySelector("tr.unused")).toBeTruthy();
    expect(t).toContain(
      "Now walk around, then sit still for a minute: the Radar Target row in Target / Occupancy should stay on the whole time you are in the room and turn off a few seconds after you leave (Radar Timeout)."
    );
    const undo = button(card, "Undo (restore your previous values)")!;
    expect(undo).toBeTruthy();
    expect(button(card, "Calibrate again")).toBeTruthy();
    undo.click();
    expect(hass.callService).toHaveBeenCalledWith(
      "apollo_mmwave",
      "restore_gate_thresholds",
      { device_id: "dev1" },
      undefined,
      false
    );
  });

  it("shows Finishing while the job is terminal but its result is not stored yet", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ job: job() }));
    await push(card, hass, payload({ job: job({ status: "done" }), last_result: null }));
    expect(text(card)).toContain("Finishing...");
    await push(card, hass, payload({ job: null, last_result: result(), snapshots: [SNAPSHOT] }));
    expect(text(card)).toContain("Thresholds updated");
  });

  it("returns to idle on Calibrate again and starts a new job", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await finish(hass, card, result());
    button(card, "Calibrate again")!.click();
    await settle(card);
    expect(hass.callService.mock.calls[0][1]).toBe("calibrate_gates");
    expect(text(card)).not.toContain("Thresholds updated");
    expect(text(card)).toContain("Nobody in the radar's view");
  });

  it("renders the partial heading and the unverified line", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await finish(
      hass,
      card,
      result({
        outcome: "partial",
        warnings: ["unverified"],
        unverified: [
          { entity_id: M.move_threshold[0], asked: 24, actual: 35 },
          { entity_id: M.still_threshold[1], asked: 12, actual: null },
        ],
      })
    );
    const t = text(card);
    expect(t).toContain("Thresholds updated, 2 could not be confirmed");
    expect(t).toContain(
      "2 values could not be confirmed: G0 move threshold reads back 35 (asked for 24), G1 still threshold could not be read (radar offline). Check the Move / Still Thresholds cards."
    );
  });

  it("renders one sentence per gate that went off", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await finish(
      hass,
      card,
      result({ warnings: ["gate_off"], gates_off: [{ gate: 3, channel: "move", peak: 92 }] })
    );
    expect(text(card)).toContain(
      "The G3 move threshold is now off (its background peaked at 92). If a fan or curtain moves there all day this is fine; if not, press Undo and run again with the room really empty."
    );
  });

  it("renders the presence warning", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await finish(hass, card, result({ warnings: ["presence"], presence_fraction: 0.4 }));
    expect(text(card)).toContain("The radar reported someone present for 40% of the listen.");
  });

  it("renders a preview with Calibrate and apply, and Close returns to idle", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await finish(
      hass,
      card,
      result({
        outcome: "preview",
        snapshot_id: null,
        writes_done: 0,
        writes_total: 0,
        gates: [gate(0, { written: false, confirmed: null, actual: null })],
      }),
      { snapshots: [] }
    );
    const t = text(card);
    expect(t).toContain("Preview: no threshold was changed.");
    expect(t).toContain("These are the thresholds calibration would set:");
    expect(t).toContain("50 → 24");
    expect(t).not.toContain("(would set)");
    const apply = button(card, "Calibrate and apply")!;
    expect(apply).toBeTruthy();
    button(card, "Close")!.click();
    await settle(card);
    expect(text(card)).toContain("Nobody in the radar's view");
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("offers Undo for a cancelled job that already wrote values", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await finish(
      hass,
      card,
      result({ status: "cancelled", outcome: "cancelled", writes_done: 7, writes_total: 18, changed: 7 })
    );
    expect(text(card)).toContain(
      "Stopped after 7 of 18 values were written. Undo restores the saved values."
    );
    expect(button(card, /^Undo \(restore .* values\)$/)).toBeTruthy();
    expect(button(card, "Calibrate with empty room")).toBeTruthy();
  });

  it("says nothing was changed for a cancel before any write", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await finish(
      hass,
      card,
      result({ status: "cancelled", outcome: "cancelled", writes_done: 0, writes_total: 0, snapshot_id: null })
    );
    expect(text(card)).toContain("Stopped. Nothing was changed.");
    expect(button(card, /^Undo/)).toBeUndefined();
    expect(button(card, "Calibrate with empty room")).toBeTruthy();
  });

  it("offers Undo for a device_offline failure with writes done", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await finish(
      hass,
      card,
      result({
        status: "failed",
        outcome: "failed",
        writes_done: 4,
        writes_total: 18,
        error: {
          code: "device_offline",
          message: "The radar went offline after 4 of 18 values were written. Use Undo once it is back.",
        },
      })
    );
    expect(text(card)).toContain(
      "Calibration failed: The radar went offline after 4 of 18 values were written. Use Undo once it is back."
    );
    expect(text(card)).not.toContain("Nothing was changed.");
    expect(button(card, /^Undo \(restore .* values\)$/)).toBeTruthy();
    expect(button(card, "Try again")).toBeTruthy();
  });

  it("renders a zero-write failure with the message and no Undo", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await finish(
      hass,
      card,
      result({
        status: "failed",
        outcome: "failed",
        writes_done: 0,
        writes_total: 0,
        snapshot_id: null,
        error: {
          code: "no_energy_data",
          message: "No gate energy readings arrived within 20 s of turning Radar Engineering Mode on.",
        },
      }),
      { snapshots: [] }
    );
    expect(text(card)).toContain(
      "Calibration failed: No gate energy readings arrived within 20 s of turning Radar Engineering Mode on. Nothing was changed."
    );
    expect(button(card, /^Undo/)).toBeUndefined();
    button(card, "Try again")!.click();
    expect(hass.callService.mock.calls[0][1]).toBe("calibrate_gates");
  });

  it("renders the restored line with the idle body and a redo Undo", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ job: job({ job_id: "job2", kind: "restore", status: "applying" }) }));
    await push(card, hass, payload({ job: null, snapshots: [REDO, SNAPSHOT], last_result: restoreResult() }));
    const t = text(card);
    expect(t).toContain("Restored your previous values.");
    expect(t).not.toContain("Not found any more");
    expect(t).toContain("Nobody in the radar's view");
    expect(card.shadowRoot!.querySelector("table")).toBeNull();
    // The newest snapshot now holds the calibrated values the Undo replaced,
    // so the button offers them back instead of naming a time.
    expect(button(card, "Redo (put the calibrated values back)")).toBeTruthy();
    expect(button(card, /^Undo/)).toBeUndefined();
    expect(button(card, "Calibrate with empty room")).toBeTruthy();
  });

  it("names the snapshot the backend restored, not the list's neighbour", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    const olderAt = new Date(2026, 9, 11, 9, 5).toISOString();
    const older = { id: "snap0", taken_at: olderAt, reason: "calibrate" as const, count: 18 };
    await push(card, hass, payload({ job: job({ job_id: "job2", kind: "restore", status: "applying" }) }));
    await push(
      card,
      hass,
      payload({
        job: null,
        snapshots: [REDO, SNAPSHOT, older],
        last_result: restoreResult({
          restored_from: { id: "snap0", taken_at: olderAt },
          missing: ["number.gone_g3_move_threshold"],
        }),
      })
    );
    const t = text(card);
    expect(t).toContain(`Restored the thresholds from ${expectedTime(olderAt)}.`);
    expect(t).toContain("Not found any more: number.gone_g3_move_threshold.");
  });

  it("retries a failed restore with the snapshot it was restoring, not its own redo snapshot", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ job: job({ job_id: "job2", kind: "restore", status: "applying" }) }));
    await push(
      card,
      hass,
      payload({
        job: null,
        snapshots: [REDO, SNAPSHOT],
        last_result: restoreResult({
          status: "failed",
          outcome: "failed",
          writes_done: 4,
          writes_total: 18,
          changed: 4,
          restored: 4,
          error: {
            code: "device_offline",
            message: "The radar went offline after 4 of 18 values were written. Use Undo once it is back.",
          },
        }),
      })
    );
    expect(text(card)).toContain(
      "Restore failed: The radar went offline after 4 of 18 values were written. Use Undo once it is back."
    );
    // Undo puts back what the partial restore overwrote: the redo snapshot.
    expect(button(card, "Redo (put the calibrated values back)")).toBeTruthy();
    button(card, "Try again")!.click();
    expect(hass.callService).toHaveBeenCalledWith(
      "apollo_mmwave",
      "restore_gate_thresholds",
      { device_id: "dev1", snapshot_id: "snap1" },
      undefined,
      false
    );
  });

  it("retries a failed preview as a preview", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(card, hass, payload({ job: job({ apply: false }) }));
    await push(
      card,
      hass,
      payload({
        job: null,
        last_result: result({
          status: "failed",
          outcome: "failed",
          snapshot_id: null,
          writes_done: 0,
          writes_total: 0,
          error: {
            code: "engineering_mode_lost",
            message:
              "Radar Engineering Mode turned off during the listen. Nothing was changed. Leave it on until calibration finishes, then try again.",
          },
        }),
      })
    );
    button(card, "Try again")!.click();
    expect(hass.callService.mock.calls[0][2]).toEqual({ device_id: "dev1", apply: false });
  });

  it("goes back to idle from the result with Close", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await finish(hass, card, result());
    expect(text(card)).toContain("Thresholds updated");
    button(card, "Close")!.click();
    await settle(card);
    const t = text(card);
    expect(t).not.toContain("Thresholds updated");
    expect(t).toMatch(/Last calibrated .*16 of 18 thresholds changed\./);
    expect(button(card, "Show last result")).toBeTruthy();
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("offers Undo and Close on a failed result whatever its code", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await finish(
      hass,
      card,
      result({
        status: "failed",
        outcome: "failed",
        writes_done: 2,
        writes_total: 18,
        error: {
          code: "not_allowed",
          message: "Your Home Assistant user is not allowed to control this radar's entities.",
        },
      })
    );
    // Undo is offered by write count, whatever the code (addendum 6).
    expect(text(card)).toContain(
      "Calibration failed: Your Home Assistant user is not allowed to control this radar's entities."
    );
    expect(text(card)).not.toContain("Nothing was changed.");
    expect(button(card, /^Undo \(restore .* values\)$/)).toBeTruthy();
    button(card, "Close")!.click();
    await settle(card);
    expect(text(card)).toContain("Nobody in the radar's view");
  });

  it("keeps the Turn it off banner above a result whose job left engineering mode on", async () => {
    const hass = ld2410Hass({ switchState: "on" });
    const card = await mount(hass);
    const marker = {
      job_id: "job1",
      kind: "calibrate" as const,
      phase: "engineering" as const,
      started_at: "2026-10-11T14:30:00+00:00",
      engineering_mode_turned_on: true,
      snapshot_id: "snap1",
      left_on: true,
    };
    await finish(hass, card, result(), { interrupted: marker });
    const t = text(card);
    expect(t).toContain("Thresholds updated");
    expect(t).toContain(
      "The last calibration could not turn Radar Engineering Mode back off (the radar was offline)."
    );
    button(card, "Turn it off")!.click();
    expect(hass.callService).toHaveBeenCalledWith(
      "switch",
      "turn_off",
      { entity_id: M.engineering_mode },
      undefined,
      false
    );
  });
});

describe("calibrate card interrupted banner", () => {
  const marker = {
    job_id: "job0",
    kind: "calibrate" as const,
    phase: "engineering" as const,
    started_at: "2026-10-11T14:30:00+00:00",
    engineering_mode_turned_on: true,
    snapshot_id: null,
    left_on: false,
  };

  it("offers Turn it off only while the switch reads on, and turns it off", async () => {
    const off = ld2410Hass({ switchState: "off" });
    const quiet = await mount(off);
    await push(quiet, off, payload({ interrupted: marker }));
    expect(text(quiet)).not.toContain("A calibration was interrupted by a restart.");
    expect(button(quiet, "Turn it off")).toBeUndefined();

    const on = ld2410Hass({ switchState: "on" });
    const card = await mount(on);
    await push(card, on, payload({ interrupted: marker }));
    expect(text(card)).toContain("A calibration was interrupted by a restart.");
    expect(text(card)).toContain("Radar Engineering Mode may still be on.");
    expect(text(card)).not.toContain("Some thresholds may have been written.");
    button(card, "Turn it off")!.click();
    expect(on.callService).toHaveBeenCalledWith(
      "switch",
      "turn_off",
      { entity_id: M.engineering_mode },
      undefined,
      false
    );
  });

  it("reads the left_on first line when the marker says so", async () => {
    const hass = ld2410Hass({ switchState: "on" });
    const card = await mount(hass);
    await push(card, hass, payload({ interrupted: { ...marker, phase: null, left_on: true } }));
    expect(text(card)).toContain(
      "The last calibration could not turn Radar Engineering Mode back off (the radar was offline)."
    );
    expect(button(card, "Turn it off")).toBeTruthy();
  });

  it("shows both lines for a write phase whose job also left engineering mode on", async () => {
    const hass = ld2410Hass({ switchState: "on" });
    const card = await mount(hass);
    await push(
      card,
      hass,
      payload({
        interrupted: { ...marker, phase: "applying", snapshot_id: "snap1", left_on: true },
        snapshots: [SNAPSHOT],
      })
    );
    const t = text(card);
    expect(t).toContain(
      "The last calibration could not turn Radar Engineering Mode back off (the radar was offline)."
    );
    expect(t).toContain("Radar Engineering Mode may still be on.");
    expect(t).toContain(
      `Some thresholds may have been written. Undo restores the values saved at ${expectedTime(SNAPSHOT_AT)}.`
    );
    expect(button(card, "Turn it off")).toBeTruthy();
    expect(button(card, "Undo")).toBeTruthy();
  });

  it("names a restore as a restore", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await push(
      card,
      hass,
      payload({
        interrupted: { ...marker, kind: "restore", phase: "applying", snapshot_id: "snap2" },
        snapshots: [REDO, SNAPSHOT],
      })
    );
    expect(text(card)).toContain("A restore was interrupted by a restart.");
    expect(text(card)).not.toContain("A calibration was interrupted");
  });

  it("shows a rejected Turn it off inside the banner", async () => {
    const hass = ld2410Hass({ switchState: "on" });
    hass.callService.mockRejectedValueOnce({ code: "home_assistant_error", message: "Device is offline" });
    const card = await mount(hass);
    await push(card, hass, payload({ interrupted: marker }));
    button(card, "Turn it off")!.click();
    await settle(card);
    expect(text(card)).toContain("Could not turn Radar Engineering Mode off: Device is offline.");
    // The idle view stays: no failure view replaces it.
    expect(button(card, "Try again")).toBeUndefined();
    expect(text(card)).toContain("Nobody in the radar's view");
  });

  it("offers Undo for an interrupted write phase and names the snapshot time", async () => {
    const hass = ld2410Hass({ switchState: "off" });
    const card = await mount(hass);
    await push(
      card,
      hass,
      payload({ interrupted: { ...marker, phase: "applying", snapshot_id: "snap1" }, snapshots: [SNAPSHOT] })
    );
    expect(text(card)).toContain(
      `Some thresholds may have been written. Undo restores the values saved at ${expectedTime(SNAPSHOT_AT)}.`
    );
    expect(button(card, "Turn it off")).toBeUndefined();
    button(card, "Undo")!.click();
    expect(hass.callService.mock.calls[0][1]).toBe("restore_gate_thresholds");
  });
});

describe("calibrate card subscription lifecycle", () => {
  it("unsubscribes and removes the connection listeners when it leaves the page", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await vi.waitFor(() => expect(hass.unsubscribes).toHaveLength(1));
    card.remove();
    expect(hass.unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(hass.connection.removeEventListener).toHaveBeenCalledWith("ready", expect.any(Function));
    expect(hass.connection.removeEventListener).toHaveBeenCalledWith("disconnected", expect.any(Function));
    expect(hass.listeners.ready).toHaveLength(0);
  });

  it("resubscribes when re-attached", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await vi.waitFor(() => expect(hass.unsubscribes).toHaveLength(1));
    card.remove();
    document.body.appendChild(card);
    await settle(card);
    await vi.waitFor(() => expect(hass.handlers).toHaveLength(2));
    expect(hass.listeners.ready).toHaveLength(1);
  });

  it("resubscribes on a device change and drops a late push from the old connection", async () => {
    const hass = ld2410Hass();
    const other = `switch.${RPRO_BASE}_ld2412_engineering_mode`;
    hass.states[other] = ent(other, "off");
    hass.entities[other] = { device_id: "dev2", platform: "esphome" };
    hass.devices.dev2 = { name: "Office R-PRO-1" };
    const card = await mount(hass);
    await vi.waitFor(() => expect(hass.unsubscribes).toHaveLength(1));
    const stale = hass.handlers[0];

    card.setConfig({ type: `custom:${CALIBRATE_CARD_TAG}`, device_id: "dev2" });
    await settle(card);
    await vi.waitFor(() => expect(hass.handlers).toHaveLength(2));
    expect(hass.unsubscribes[0]).toHaveBeenCalled();
    expect(hass.subscriptions[1].device_id).toBe("dev2");

    stale(payload({ job: job() }));
    await settle(card);
    expect(text(card)).not.toContain("Listening to the empty room");

    hass.handlers[1](payload({ job: job({ remaining_s: 7 }) }));
    await settle(card);
    expect(text(card)).toContain("Listening to the empty room... 7 s left");
  });

  it("keeps its subscription when the config changes but the device does not", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    card.setConfig({ type: `custom:${CALIBRATE_CARD_TAG}`, device_id: "dev1", title: "Kitchen" });
    await settle(card);
    expect(calSubscribes(hass)).toBe(1);
  });

  it("re-subscribes on ready after a not_loaded rejection and renders once it succeeds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hass = ld2410Hass();
    hass.subscribeError = { code: "not_loaded", message: "not loaded" };
    const card = await mount(hass, { device_id: "dev1" }, { expectSubscribe: false });
    expect(calSubscribes(hass)).toBe(1);
    expect(text(card)).toContain("Apollo mmWave is still loading...");
    expect(buttons(card)).toHaveLength(0);

    // HA comes back: the library's own re-subscribe would be refused and
    // dropped, so the card re-runs its subscribe itself.
    hass.listeners.ready[0]();
    await settle(card);
    expect(calSubscribes(hass)).toBe(2);
    expect(text(card)).toContain("Apollo mmWave is still loading...");

    hass.subscribeError = undefined;
    hass.listeners.ready[0]();
    await settle(card);
    expect(calSubscribes(hass)).toBe(3);
    hass.handlers[0](payload({ job: job() }));
    await settle(card);
    expect(text(card)).toContain("Listening to the empty room... 42 s left");
  });

  it("retries not_loaded with the bounded backoff and shows Retry only after the last delay", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hass = ld2410Hass();
    hass.subscribeError = { code: "not_loaded", message: "not loaded" };
    const card = await mount(hass, { device_id: "dev1" }, { expectSubscribe: false });
    expect(calSubscribes(hass)).toBe(1);

    for (let i = 0; i < CALIBRATION_RETRY_DELAYS_MS.length; i++) {
      expect(text(card)).toContain("Apollo mmWave is still loading...");
      expect(button(card, "Retry")).toBeUndefined();
      await vi.advanceTimersByTimeAsync(CALIBRATION_RETRY_DELAYS_MS[i] - 1);
      expect(calSubscribes(hass)).toBe(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      await settle(card);
      expect(calSubscribes(hass)).toBe(i + 2);
    }
    expect(text(card)).toContain("Apollo mmWave is not loaded, so calibration is unavailable.");
    const retry = button(card, "Retry")!;
    expect(retry).toBeTruthy();

    hass.subscribeError = undefined;
    retry.click();
    await settle(card);
    expect(calSubscribes(hass)).toBe(CALIBRATION_RETRY_DELAYS_MS.length + 2);
    hass.handlers[0](payload());
    await settle(card);
    expect(text(card)).toContain("Nobody in the radar's view");
  });

  it("reopens the subscription when the integration reloads", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await vi.waitFor(() => expect(hass.unsubscribes).toHaveLength(1));
    await vi.waitFor(() => expect(hass.entryHandlers).toHaveLength(1));
    expect(hass.connection.subscribeMessage).toHaveBeenCalledWith(expect.any(Function), {
      type: CONFIG_ENTRIES_SUBSCRIBE,
    });
    await push(card, hass, payload({ job: job() }));
    const feed = hass.entryHandlers[0];

    // The feed's first message lists the existing entries: not a reload.
    feed([{ type: null, entry: { domain: "apollo_mmwave", state: "loaded" } }]);
    await settle(card);
    expect(calSubscribes(hass)).toBe(1);

    // A reload closed the subscription server side without a word; the
    // entry reporting loaded again makes the card subscribe afresh.
    feed([{ type: "updated", entry: { domain: "apollo_mmwave", state: "loaded" } }]);
    await settle(card);
    expect(calSubscribes(hass)).toBe(2);
    expect(hass.unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(hass.entryHandlers).toHaveLength(1);

    // The job was cancelled by the reload; the fresh push reports it.
    await push(
      card,
      hass,
      payload({
        job: null,
        last_result: result({
          status: "failed",
          outcome: "failed",
          writes_done: 0,
          writes_total: 0,
          snapshot_id: null,
          error: {
            code: "cancelled_by_shutdown",
            message: "Home Assistant stopped or the integration reloaded during the calibration.",
          },
        }),
      })
    );
    expect(text(card)).toContain(
      "Calibration failed: Home Assistant stopped or the integration reloaded during the calibration. Nothing was changed."
    );
  });

  it("closes the entry feed when it leaves the page and reopens it on re-attach", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    await vi.waitFor(() => expect(hass.entryHandlers).toHaveLength(1));
    card.remove();
    expect(hass.entryUnsubscribes[0]).toHaveBeenCalledTimes(1);
    document.body.appendChild(card);
    await settle(card);
    await vi.waitFor(() => expect(hass.entryHandlers).toHaveLength(2));
    // The closed feed no longer reopens anything.
    const before = calSubscribes(hass);
    hass.entryHandlers[0]([{ type: "updated", entry: { domain: "apollo_mmwave", state: "loaded" } }]);
    await settle(card);
    expect(calSubscribes(hass)).toBe(before);
  });

  it("recovers from the Not loaded state when the entry loads", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hass = ld2410Hass();
    hass.subscribeError = { code: "not_loaded", message: "not loaded" };
    const card = await mount(hass, { device_id: "dev1" }, { expectSubscribe: false });
    for (const delay of CALIBRATION_RETRY_DELAYS_MS) await vi.advanceTimersByTimeAsync(delay);
    await settle(card);
    expect(text(card)).toContain("Apollo mmWave is not loaded, so calibration is unavailable.");
    hass.subscribeError = undefined;
    hass.entryHandlers[0]([{ type: "updated", entry: { domain: "apollo_mmwave", state: "loaded" } }]);
    await settle(card);
    hass.handlers[0](payload());
    await settle(card);
    expect(text(card)).toContain("Nobody in the radar's view");
  });

  it("renders a not_found rejection and never retries it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hass = ld2410Hass();
    hass.subscribeError = { code: "not_found", message: "no device" };
    const card = await mount(hass, { device_id: "dev1" }, { expectSubscribe: false });
    expect(text(card)).toContain("Home Assistant has no device with this id.");
    await vi.advanceTimersByTimeAsync(60000);
    expect(calSubscribes(hass)).toBe(1);
  });
});

describe("calibrate card turned-off gates", () => {
  function thresholds(edit: (t: { move: number[]; still: number[] }) => void) {
    const t = { move: [...LD2410_FACTORY_THRESHOLDS.move], still: [...LD2410_FACTORY_THRESHOLDS.still] };
    edit(t);
    return t;
  }

  function idleWarnings(card: ApolloRadarCalibrateCard): string[] {
    return Array.from(card.shadowRoot!.querySelectorAll(".idle-body p.warning")).map((p) =>
      (p.textContent ?? "").trim()
    );
  }

  it("warns before a run about the in-use gates that are turned off", async () => {
    // G8 still is beyond Max Still Gate 6, so lowering it turns nothing on.
    const hass = ld2410Hass({ thresholds: thresholds((t) => ((t.still[2] = 100), (t.still[8] = 100))) });
    const card = await mount(hass);
    await push(card, hass, payload());
    expect(idleWarnings(card)).toEqual(["The G2 still threshold is off (set to 100). Calibrating will turn it back on."]);
  });

  it("names several gates in one sentence and drops the line once they are set", async () => {
    let hass = ld2410Hass({ thresholds: thresholds((t) => ((t.still[2] = 100), (t.move[0] = 100))) });
    const card = await mount(hass);
    await push(card, hass, payload());
    expect(idleWarnings(card)).toEqual([
      "These thresholds are off (set to 100): G0 move, G2 still. Calibrating will turn them back on.",
    ]);
    hass = await setStates(card, hass, { [M.still_threshold[2]]: "40" });
    expect(idleWarnings(card)).toEqual(["The G0 move threshold is off (set to 100). Calibrating will turn it back on."]);
    await setStates(card, hass, { [M.move_threshold[0]]: "50" });
    expect(idleWarnings(card)).toEqual([]);
  });

  it("does not warn about a gate the last calibration turned off itself", async () => {
    const hass = ld2410Hass({ thresholds: thresholds((t) => (t.move[3] = 100)) });
    const card = await mount(hass);
    const last = result({
      warnings: ["gate_off"],
      gates_off: [{ gate: 3, channel: "move", peak: 96 }],
      gates: [gate(0), gate(3, { old: 40, new: 100, flags: ["off"], actual: 100 })],
    });
    await push(card, hass, payload({ snapshots: [SNAPSHOT], last_result: last }));
    expect(text(card)).toContain("Nobody in the radar's view");
    expect(idleWarnings(card)).toEqual([]);
  });

  it("marks a gate the run turned back on and says how to turn it off again", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    const last = result({ gates: [gate(0), gate(2, {}, { old: 100, new: 15, peak: 5, actual: 15 })] });
    await push(card, hass, payload({ job: job({ job_id: last.job_id }) }));
    await push(card, hass, payload({ job: null, last_result: last, snapshots: [SNAPSHOT] }));
    const t = text(card);
    expect(t).toContain("100 → 15 (was off)");
    expect(t).toContain(
      "The G2 still threshold was off (set to 100) and calibration turned it back on (now 15). If you turned it off on purpose, set it back to 100 on the Still Thresholds card, or press Undo to put back all your previous values."
    );
  });

  it("words a preview as what calibration would do, against the number's own max", async () => {
    const hass = ld2410Hass();
    hass.states[M.move_threshold[3]] = {
      entity_id: M.move_threshold[3],
      state: "80",
      attributes: { min: 0, max: 80, step: 1 },
    };
    const card = await mount(hass);
    const last = result({
      outcome: "preview",
      snapshot_id: null,
      writes_done: 0,
      writes_total: 0,
      gates: [gate(3, { old: 80, new: 30, written: false, confirmed: null, actual: null })],
    });
    await push(card, hass, payload({ job: job({ job_id: last.job_id, apply: false }) }));
    await push(card, hass, payload({ job: null, last_result: last }));
    const t = text(card);
    expect(t).toContain("80 → 30 (was off)");
    expect(t).not.toContain("would set)");
    expect(t).toContain(
      "The G3 move threshold is off (set to 80) and calibration would turn it back on (would set 30). If you turned it off on purpose, set it back to 80 on the Move Thresholds card after you calibrate."
    );
    // On a narrow card the note wraps under the value, never inside it.
    const cell = Array.from(card.shadowRoot!.querySelectorAll("td.threshold")).find((td) =>
      td.textContent?.includes("80 → 30")
    )!;
    expect(cell).toBeTruthy();
    expect(cell.querySelector(".value")?.textContent).toBe("80 → 30");
    expect(cell.querySelector(".note")?.textContent).toBe("(was off)");
  });
});

describe("thresholdCell", () => {
  const parts = (s: string) => {
    const host = document.createElement("div");
    render(thresholdCell(s), host);
    return [host.querySelector(".value")?.textContent ?? null, host.querySelector(".note")?.textContent ?? null];
  };

  it("splits a trailing note off the value", () => {
    expect(parts("100 → 15 (was off)")).toEqual(["100 → 15", "(was off)"]);
    expect(parts("100 → 15 (was off, not confirmed)")).toEqual(["100 → 15", "(was off, not confirmed)"]);
    expect(parts("50 (unchanged)")).toEqual(["50", "(unchanged)"]);
    expect(parts("26 (not selected)")).toEqual(["26", "(not selected)"]);
  });

  it("keeps text without a trailing note in one piece", () => {
    expect(parts("50 → 24")).toEqual(["50 → 24", null]);
    expect(parts("(not selected)")).toEqual(["(not selected)", null]);
    expect(parts("no data")).toEqual(["no data", null]);
    expect(parts("skipped: radar unavailable")).toEqual(["skipped: radar unavailable", null]);
  });
});

describe("calibrate card thresholds the radar has not reported", () => {
  const QP = `button.${BASE}_query_params`;

  /** The pre-flight refusal exactly as HA's websocket call_service sends it. */
  function notReported(count = 18): Record<string, any> {
    return {
      code: "service_validation_error",
      message: `Validation error: The radar has not reported ${count} of its threshold values yet`,
      translation_domain: "apollo_mmwave",
      translation_key: "thresholds_not_numeric",
      translation_placeholders: { count: String(count), entity_ids: "number.a_g0_move_threshold" },
    };
  }

  function withQueryParams(hass: FakeHass): FakeHass {
    hass.states[QP] = ent(QP, "unknown");
    hass.entities[QP] = { device_id: "dev1", platform: "esphome" };
    return hass;
  }

  function fakeTimeouts(): void {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(FIXTURE_NOW);
  }

  it("reads the radar's settings, waits, then calibrates again", async () => {
    const hass = withQueryParams(ld2410Hass());
    hass.callService.mockRejectedValueOnce(notReported());
    const card = await mount(hass, { device_id: "dev1", calibration: { duration_s: 30 } });
    await push(card, hass, payload({ entities: { ...ENTITIES, query_params_button: QP } }));
    button(card, "Calibrate with empty room")!.click();
    await settle(card);
    const t = text(card);
    expect(t).toContain("Calibration failed: The radar has not reported 18 of its threshold values yet.");
    expect(t).not.toContain("number.a_g0_move_threshold");
    expect(button(card, "Try again")).toBeUndefined();
    expect(button(card, "Close")).toBeTruthy();

    fakeTimeouts();
    const read = button(card, "Read settings from the radar")!;
    expect(READ_SETTINGS_LABEL).toBe("Read settings from the radar");
    expect(read.classList.contains("primary")).toBe(true);
    read.click();
    await settle(card);
    expect(hass.callService.mock.calls[1]).toEqual(["button", "press", { entity_id: QP }, undefined, false]);
    expect(text(card)).toContain("Reading settings from the radar...");
    expect(button(card, "Read settings from the radar")!.disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(READ_SETTINGS_WAIT_MS - 1);
    expect(hass.callService).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await settle(card);
    expect(hass.callService).toHaveBeenCalledTimes(3);
    expect(hass.callService.mock.calls[2].slice(0, 3)).toEqual([
      "apollo_mmwave",
      "calibrate_gates",
      { device_id: "dev1", duration_s: 30 },
    ]);
    expect(text(card)).not.toContain("Calibration failed");
    expect(text(card)).not.toContain("Reading settings");
  });

  it("repeats a preview as a preview", async () => {
    const hass = withQueryParams(ld2410Hass());
    hass.callService.mockRejectedValueOnce(notReported());
    const card = await mount(hass);
    await push(card, hass, payload());
    button(card, "Preview only")!.click();
    await settle(card);
    fakeTimeouts();
    // Found through the registry when the payload does not name it.
    button(card, "Read settings from the radar")!.click();
    await settle(card);
    expect(hass.callService.mock.calls[1].slice(0, 3)).toEqual(["button", "press", { entity_id: QP }]);
    await vi.advanceTimersByTimeAsync(READ_SETTINGS_WAIT_MS);
    await settle(card);
    expect(hass.callService.mock.calls[2].slice(0, 3)).toEqual([
      "apollo_mmwave",
      "calibrate_gates",
      { device_id: "dev1", apply: false },
    ]);
  });

  it("does not start a second job when one started during the wait", async () => {
    const hass = withQueryParams(ld2410Hass());
    hass.callService.mockRejectedValueOnce(notReported());
    const card = await mount(hass);
    await push(card, hass, payload());
    button(card, "Calibrate with empty room")!.click();
    await settle(card);
    fakeTimeouts();
    button(card, "Read settings from the radar")!.click();
    await settle(card);
    // An automation (or another tab) started a run before the wait ended.
    await push(card, hass, payload({ job: job({ job_id: "elsewhere", status: "preparing", sub_phase: "settle" }) }));
    await vi.advanceTimersByTimeAsync(READ_SETTINGS_WAIT_MS);
    await settle(card);
    expect(hass.callService).toHaveBeenCalledTimes(2);
    expect(text(card)).toContain("Leave the room now.");
  });

  it("drops the retry when the failure is closed during the wait", async () => {
    const hass = withQueryParams(ld2410Hass());
    hass.callService.mockRejectedValueOnce(notReported());
    const card = await mount(hass);
    await push(card, hass, payload());
    button(card, "Calibrate with empty room")!.click();
    await settle(card);
    fakeTimeouts();
    button(card, "Read settings from the radar")!.click();
    await settle(card);
    button(card, "Close")!.click();
    await settle(card);
    await vi.advanceTimersByTimeAsync(READ_SETTINGS_WAIT_MS);
    await settle(card);
    expect(hass.callService).toHaveBeenCalledTimes(2);
    expect(text(card)).toContain("Nobody in the radar's view");
  });

  it("reads the radar's settings, then repeats a refused Undo", async () => {
    const hass = withQueryParams(ld2410Hass());
    hass.callService.mockRejectedValueOnce(notReported());
    const card = await mount(hass);
    await push(card, hass, payload({ snapshots: [SNAPSHOT], last_result: result() }));
    button(card, "Undo (restore your previous values)")!.click();
    await settle(card);
    expect(text(card)).toContain("Restore failed: The radar has not reported 18 of its threshold values yet.");
    expect(button(card, "Try again")).toBeUndefined();
    fakeTimeouts();
    button(card, "Read settings from the radar")!.click();
    await settle(card);
    expect(hass.callService.mock.calls[1].slice(0, 3)).toEqual(["button", "press", { entity_id: QP }]);
    await vi.advanceTimersByTimeAsync(READ_SETTINGS_WAIT_MS);
    await settle(card);
    expect(hass.callService).toHaveBeenCalledTimes(3);
    expect(hass.callService.mock.calls[2].slice(0, 3)).toEqual([
      "apollo_mmwave",
      "restore_gate_thresholds",
      { device_id: "dev1" },
    ]);
  });

  it("drops the retry when the card leaves the page during the wait", async () => {
    const hass = withQueryParams(ld2410Hass());
    hass.callService.mockRejectedValueOnce(notReported());
    const card = await mount(hass);
    await push(card, hass, payload());
    button(card, "Calibrate with empty room")!.click();
    await settle(card);
    fakeTimeouts();
    button(card, "Read settings from the radar")!.click();
    await settle(card);
    card.remove();
    await vi.advanceTimersByTimeAsync(READ_SETTINGS_WAIT_MS);
    await settle(card);
    expect(hass.callService).toHaveBeenCalledTimes(2);
  });

  it("drops the retry when the card's device changes during the wait", async () => {
    const hass = withQueryParams(ld2410Hass());
    hass.callService.mockRejectedValueOnce(notReported());
    const card = await mount(hass);
    await push(card, hass, payload());
    button(card, "Calibrate with empty room")!.click();
    await settle(card);
    fakeTimeouts();
    button(card, "Read settings from the radar")!.click();
    await settle(card);
    card.setConfig({ type: `custom:${CALIBRATE_CARD_TAG}`, device_id: "dev2" });
    await settle(card);
    await vi.advanceTimersByTimeAsync(READ_SETTINGS_WAIT_MS);
    await settle(card);
    // Only the refused start and the button press: no retry for dev1 or dev2.
    expect(hass.callService).toHaveBeenCalledTimes(2);
    expect(hass.callService.mock.calls.filter(([, service]) => service === "calibrate_gates")).toHaveLength(1);
  });

  it("shows a rejected button press and lets the user press again", async () => {
    const hass = withQueryParams(ld2410Hass());
    hass.callService
      .mockRejectedValueOnce(notReported())
      .mockRejectedValueOnce({ code: "home_assistant_error", message: "The button is unavailable." });
    const card = await mount(hass);
    await push(card, hass, payload());
    button(card, "Calibrate with empty room")!.click();
    await settle(card);
    button(card, "Read settings from the radar")!.click();
    await settle(card);
    expect(text(card)).toContain("Could not ask the radar for its settings: The button is unavailable.");
    expect(text(card)).not.toContain("Reading settings");
    expect(button(card, "Read settings from the radar")!.disabled).toBe(false);
  });

  it("says where the button is when the card cannot press it", async () => {
    const hass = ld2410Hass();
    hass.callService.mockRejectedValueOnce(notReported());
    const card = await mount(hass);
    await push(card, hass, payload());
    button(card, "Calibrate with empty room")!.click();
    await settle(card);
    expect(text(card)).toContain(
      "Open the radar's device page, press its Query Params button in the Diagnostic section, wait a few seconds, then try again."
    );
    expect(button(card, "Read settings from the radar")).toBeUndefined();
    button(card, "Try again")!.click();
    expect(hass.callService.mock.calls[1][1]).toBe("calibrate_gates");
  });

  it("offers it for an LD2412 job that failed on unreported thresholds", async () => {
    const hass = ld2412Hass();
    const qp = RM.query_params!;
    hass.states[qp] = ent(qp, "unknown");
    const card = await mount(hass, { device_id: "rpro" });
    const entities: EntitiesInfo = {
      ...ENTITIES,
      profile: "ld2412",
      gate_count: 14,
      engineering_mode: RM.engineering_mode!,
      max_move_gate: null,
      max_still_gate: null,
      min_gate: 1,
      max_gate: 13,
      query_params_button: qp,
    };
    const failed = result({
      device_id: "rpro",
      profile: "ld2412",
      status: "failed",
      outcome: "failed",
      writes_done: 0,
      writes_total: 0,
      snapshot_id: null,
      gates: [],
      error: {
        code: "thresholds_not_numeric",
        message: "The radar has not reported 1 of its threshold values. Nothing was changed.",
      },
    });
    await push(card, hass, payload({ entities, job: job({ job_id: failed.job_id }) }));
    await push(card, hass, payload({ entities, job: null, last_result: failed }));
    expect(text(card)).toContain(
      "Calibration failed: The radar has not reported 1 of its threshold values. Nothing was changed."
    );
    expect(button(card, "Try again")).toBeUndefined();
    fakeTimeouts();
    button(card, "Read settings from the radar")!.click();
    await settle(card);
    expect(hass.callService.mock.calls[0].slice(0, 3)).toEqual(["button", "press", { entity_id: qp }]);
    await vi.advanceTimersByTimeAsync(READ_SETTINGS_WAIT_MS);
    await settle(card);
    expect(hass.callService.mock.calls[1].slice(0, 3)).toEqual([
      "apollo_mmwave",
      "calibrate_gates",
      { device_id: "rpro" },
    ]);
  });
});

describe("calibrate card footer after a restart", () => {
  it("says a restart stopped the last preview and nothing was changed", async () => {
    const hass = ld2410Hass();
    const card = await mount(hass);
    const last = result({
      status: "failed",
      outcome: "failed",
      apply: false,
      writes_done: 0,
      writes_total: 0,
      snapshot_id: null,
      gates: [],
      error: {
        code: "cancelled_by_shutdown",
        message: "Home Assistant stopped or the integration reloaded during the calibration.",
      },
    });
    await push(card, hass, payload({ snapshots: [SNAPSHOT], last_result: last }));
    expect(text(card)).toMatch(
      /Last preview .* was stopped by a Home Assistant restart\. Nothing was changed\./
    );
    expect(text(card)).not.toMatch(/Last (preview|calibration) .* failed/);
  });
});
