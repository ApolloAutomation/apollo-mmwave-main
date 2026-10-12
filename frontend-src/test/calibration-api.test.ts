/**
 * The calibrate card's data protocol. Every service call must pass
 * `notifyOnError = false` as the fifth `callService` argument: the card
 * renders the rejection itself, and HA's own toast would show it twice.
 */

import { describe, it, expect, vi } from "vitest";
import {
  CALIBRATION_GET,
  CALIBRATION_RETRY_DELAYS_MS,
  CALIBRATION_SUBSCRIBE,
  CONFIG_ENTRIES_SUBSCRIBE,
  NOT_LOADED_MESSAGE,
  callService,
  cancelCalibration,
  describeError,
  describeServiceError,
  fetchCalibration,
  pressButton,
  refusalKey,
  restoreThresholds,
  startCalibration,
  subscribeCalibration,
  subscribeEntryLoads,
  turnEngineeringMode,
} from "../src/calibration/api";

/**
 * A pre-flight refusal exactly as HA's websocket `call_service` sends it
 * (`websocket_api/commands.py`): the message is "Validation error: " plus
 * `str(err)`, and `str(err)` is the en.json text with its final period
 * stripped (`async_get_exception_message`).
 */
function validationError(
  key: string,
  english: string,
  placeholders: Record<string, string> | null = null
): Record<string, any> {
  let text = english.replace(/\.+$/, "");
  for (const [name, value] of Object.entries(placeholders ?? {})) {
    text = text.replace(`{${name}}`, value);
  }
  return {
    code: "service_validation_error",
    message: `Validation error: ${text}`,
    translation_domain: "apollo_mmwave",
    translation_key: key,
    translation_placeholders: placeholders,
  };
}

const DEVICE_OFFLINE_EN =
  "The radar is unavailable right now. Check that it is online, then try again.";
const NO_SNAPSHOT_EN = "There are no saved thresholds to restore for this radar.";
const NOT_NUMERIC_EN = "The radar has not reported {count} of its threshold values yet.";

/** HA's localize over a table of this integration's exception messages. */
function localizeFrom(table: Record<string, string>) {
  return vi.fn((key: string, values?: Record<string, any>) => {
    const match = /^component\.apollo_mmwave\.exceptions\.(.+)\.message$/.exec(key);
    let text = match ? table[match[1]] ?? "" : "";
    for (const [name, value] of Object.entries(values ?? {})) {
      text = text.replace(`{${name}}`, String(value));
    }
    return text;
  });
}

function fakeHass() {
  const handlers: ((message: any) => void)[] = [];
  const unsubscribe = vi.fn();
  return {
    handlers,
    unsubscribe,
    callService: vi.fn(async (..._args: any[]) => undefined),
    callWS: vi.fn(async (_msg: Record<string, any>): Promise<any> => ({ job: null })),
    connection: {
      subscribeMessage: vi.fn(async (cb: (message: any) => void, _msg: Record<string, any>) => {
        handlers.push(cb);
        return unsubscribe;
      }),
    },
  };
}

describe("subscribeCalibration / fetchCalibration", () => {
  it("subscribes with the calibration command and the device id", async () => {
    const hass = fakeHass();
    const cb = vi.fn();

    const unsubscribe = await subscribeCalibration(hass, "dev123", cb);

    expect(CALIBRATION_SUBSCRIBE).toBe("apollo_mmwave/calibration/subscribe");
    expect(hass.connection.subscribeMessage).toHaveBeenCalledWith(cb, {
      type: "apollo_mmwave/calibration/subscribe",
      device_id: "dev123",
    });
    expect(unsubscribe).toBe(hass.unsubscribe);
  });

  it("reads the payload once with the get command", async () => {
    const hass = fakeHass();
    await fetchCalibration(hass, "dev123");
    expect(CALIBRATION_GET).toBe("apollo_mmwave/calibration/get");
    expect(hass.callWS).toHaveBeenCalledWith({
      type: "apollo_mmwave/calibration/get",
      device_id: "dev123",
    });
  });
});

describe("startCalibration", () => {
  it("calls calibrate_gates with the device id and the given options, toast off", async () => {
    const hass = fakeHass();
    await startCalibration(hass, "dev123", { duration_s: 120 });
    expect(hass.callService).toHaveBeenCalledWith(
      "apollo_mmwave",
      "calibrate_gates",
      { device_id: "dev123", duration_s: 120 },
      undefined,
      false
    );
  });

  it("omits undefined options so the backend defaults apply", async () => {
    const hass = fakeHass();
    await startCalibration(hass, "dev123", {
      duration_s: undefined,
      settle_s: 0,
      margin: undefined,
      apply: false,
    });
    expect(hass.callService.mock.calls[0][2]).toEqual({
      device_id: "dev123",
      settle_s: 0,
      apply: false,
    });
  });

  it("sends only the device id when no options are given", async () => {
    const hass = fakeHass();
    await startCalibration(hass, "dev123");
    expect(hass.callService.mock.calls[0][2]).toEqual({ device_id: "dev123" });
  });
});

describe("cancelCalibration / restoreThresholds", () => {
  it("cancels by device id with the toast off", async () => {
    const hass = fakeHass();
    await cancelCalibration(hass, "dev123");
    expect(hass.callService).toHaveBeenCalledWith(
      "apollo_mmwave",
      "cancel_calibration",
      { device_id: "dev123" },
      undefined,
      false
    );
  });

  it("restores the newest snapshot when no id is given", async () => {
    const hass = fakeHass();
    await restoreThresholds(hass, "dev123");
    expect(hass.callService).toHaveBeenCalledWith(
      "apollo_mmwave",
      "restore_gate_thresholds",
      { device_id: "dev123" },
      undefined,
      false
    );
  });

  it("restores a chosen snapshot when an id is given", async () => {
    const hass = fakeHass();
    await restoreThresholds(hass, "dev123", "snap1");
    expect(hass.callService.mock.calls[0][2]).toEqual({
      device_id: "dev123",
      snapshot_id: "snap1",
    });
    expect(hass.callService.mock.calls[0][4]).toBe(false);
  });
});

describe("turnEngineeringMode", () => {
  it("turns the switch off through switch.turn_off", async () => {
    const hass = fakeHass();
    await turnEngineeringMode(hass, "switch.radar_engineering_mode", false);
    expect(hass.callService).toHaveBeenCalledWith(
      "switch",
      "turn_off",
      { entity_id: "switch.radar_engineering_mode" },
      undefined,
      false
    );
  });

  it("turns the switch on through switch.turn_on", async () => {
    const hass = fakeHass();
    await turnEngineeringMode(hass, "switch.radar_engineering_mode", true);
    expect(hass.callService.mock.calls[0].slice(0, 3)).toEqual([
      "switch",
      "turn_on",
      { entity_id: "switch.radar_engineering_mode" },
    ]);
  });
});

describe("pressButton", () => {
  it("presses the button through button.press without HA's toast", async () => {
    const hass = fakeHass();
    await pressButton(hass, "button.radar_query_params");
    expect(hass.callService).toHaveBeenCalledWith(
      "button",
      "press",
      { entity_id: "button.radar_query_params" },
      undefined,
      false
    );
  });
});

describe("refusalKey", () => {
  it("reads this integration's pre-flight key and nothing else", () => {
    const error = validationError("thresholds_not_numeric", NOT_NUMERIC_EN, { count: "18" });
    expect(refusalKey(error)).toBe("thresholds_not_numeric");
    // A lost connection rejects with the whole result message.
    expect(refusalKey({ type: "result", success: false, error })).toBe("thresholds_not_numeric");
    expect(
      refusalKey({ code: "not_found", translation_domain: "homeassistant", translation_key: "service_not_found" })
    ).toBeUndefined();
    expect(refusalKey({ code: "unknown_error", message: "boom" })).toBeUndefined();
    expect(refusalKey(undefined)).toBeUndefined();
  });
});

describe("describeError", () => {
  it("explains an unknown device from the subscription with advice that fits any card", () => {
    const text = describeError({ code: "not_found", message: "x" });
    expect(text).toMatch(/no device with this id/);
    expect(text).toContain("reload the dashboard, or set device_id in the card YAML.");
    expect(text).not.toContain("pick it again");
    expect(describeError({ code: "not_found" }, { source: "subscribe" })).toBe(text);
  });

  it("says the integration is not loaded for a service HA cannot find", () => {
    // HA's websocket call_service answer when apollo_mmwave is unloaded.
    const error = {
      code: "not_found",
      message: "Service apollo_mmwave.calibrate_gates not found.",
      translation_domain: "homeassistant",
      translation_key: "service_not_found",
      translation_placeholders: { domain: "apollo_mmwave", service: "calibrate_gates" },
    };
    expect(describeError(error, { source: "service" })).toBe(NOT_LOADED_MESSAGE);
    expect(describeError(error, { source: "service" })).not.toMatch(/device/);
  });

  it("keeps HA's words for a missing service of another domain", () => {
    const error = {
      code: "not_found",
      message: "Service switch.turn_off not found.",
      translation_domain: "homeassistant",
      translation_key: "service_not_found",
      translation_placeholders: { domain: "switch", service: "turn_off" },
    };
    expect(describeError(error, { source: "service" })).toBe("Service switch.turn_off not found.");
  });

  it("explains an unloaded integration", () => {
    expect(describeError({ code: "not_loaded" })).toBe(
      "Apollo mmWave is not loaded, so calibration is unavailable."
    );
  });

  it("drops HA's Validation error prefix and puts the final period back", () => {
    expect(describeError(validationError("device_offline", DEVICE_OFFLINE_EN))).toBe(DEVICE_OFFLINE_EN);
    expect(describeError(validationError("no_snapshot", NO_SNAPSHOT_EN), { source: "service" })).toBe(
      NO_SNAPSHOT_EN
    );
    const placeholders = { count: "2", entity_ids: "number.a_g0_move_threshold, number.a_g1_move_threshold" };
    expect(describeError(validationError("thresholds_not_numeric", NOT_NUMERIC_EN, placeholders))).toBe(
      "The radar has not reported 2 of its threshold values yet."
    );
  });

  it("renders the translation when localize knows the key, with its placeholders", () => {
    const localize = localizeFrom({ thresholds_not_numeric: "Noch kein Wert ({entity_ids})." });
    const error = validationError("thresholds_not_numeric", NOT_NUMERIC_EN, { entity_ids: "number.a" });
    expect(describeError(error, { localize })).toBe("Noch kein Wert (number.a).");
    expect(localize).toHaveBeenCalledWith(
      "component.apollo_mmwave.exceptions.thresholds_not_numeric.message",
      { entity_ids: "number.a" }
    );
  });

  it("falls back to the message when localize has no text or cannot format it", () => {
    const error = validationError("device_offline", DEVICE_OFFLINE_EN);
    expect(describeError(error, { localize: () => "" })).toBe(DEVICE_OFFLINE_EN);
    expect(describeError(error, { localize: () => "Translation error: bad placeholder" })).toBe(
      DEVICE_OFFLINE_EN
    );
    expect(
      describeError(error, {
        localize: () => {
          throw new Error("boom");
        },
      })
    ).toBe(DEVICE_OFFLINE_EN);
  });

  it("passes a plain rejection's message through as a sentence", () => {
    expect(describeError({ message: "The radar is unavailable right now." })).toBe(
      "The radar is unavailable right now."
    );
    expect(describeError({ code: "home_assistant_error", message: "Device is offline" })).toBe(
      "Device is offline."
    );
  });

  it("reads a lost connection, which rejects with the whole result message", () => {
    expect(
      describeError({ type: "result", success: false, error: { code: 3, message: "Connection lost" } })
    ).toBe("Connection lost.");
  });

  it("never returns an empty string", () => {
    expect(describeError(undefined)).toBeTruthy();
    expect(describeError({})).toBeTruthy();
    expect(describeError({ message: "Validation error: " })).toBe("Home Assistant rejected the request.");
    expect(describeError("Validation error: ")).toBe("Home Assistant rejected the request.");
    expect(describeError("Request timed out")).toBe("Request timed out.");
  });
});

describe("describeServiceError", () => {
  it("loads the error's exception translations first and renders them", async () => {
    const localize = localizeFrom({ device_offline: "Das Radar ist gerade nicht erreichbar." });
    const hass = {
      localize: vi.fn(() => ""),
      loadBackendTranslation: vi.fn(async () => localize),
    };
    const text = await describeServiceError(hass, validationError("device_offline", DEVICE_OFFLINE_EN));
    expect(hass.loadBackendTranslation).toHaveBeenCalledWith("exceptions", "apollo_mmwave");
    expect(text).toBe("Das Radar ist gerade nicht erreichbar.");
  });

  it("falls back to the loaded localize, then to the message", async () => {
    const localize = localizeFrom({ no_snapshot: NO_SNAPSHOT_EN });
    const failing = { localize, loadBackendTranslation: vi.fn(async () => Promise.reject(new Error("x"))) };
    expect(await describeServiceError(failing, validationError("no_snapshot", NO_SNAPSHOT_EN))).toBe(
      NO_SNAPSHOT_EN
    );
    expect(await describeServiceError({}, validationError("device_offline", DEVICE_OFFLINE_EN))).toBe(
      DEVICE_OFFLINE_EN
    );
  });

  it("treats not_found as the integration being unloaded", async () => {
    const error = {
      code: "not_found",
      message: "Service apollo_mmwave.restore_gate_thresholds not found.",
      translation_domain: "homeassistant",
      translation_key: "service_not_found",
      translation_placeholders: { domain: "apollo_mmwave", service: "restore_gate_thresholds" },
    };
    expect(await describeServiceError({}, error)).toBe(NOT_LOADED_MESSAGE);
  });
});

describe("callService", () => {
  it("turns HA's toast off by default and on only when asked", async () => {
    const hass = fakeHass();
    await callService(hass, "switch", "turn_on", { entity_id: "switch.x" });
    expect(hass.callService.mock.calls[0][4]).toBe(false);
    await callService(hass, "switch", "turn_on", { entity_id: "switch.x" }, true);
    expect(hass.callService.mock.calls[1][4]).toBe(true);
  });
});

describe("subscribeEntryLoads", () => {
  it("subscribes to the config entry feed and calls back only for a loaded apollo_mmwave entry", async () => {
    const hass = fakeHass();
    const cb = vi.fn();
    const unsubscribe = await subscribeEntryLoads(hass, cb);
    expect(unsubscribe).toBe(hass.unsubscribe);
    expect(hass.connection.subscribeMessage.mock.calls[0][1]).toEqual({ type: CONFIG_ENTRIES_SUBSCRIBE });
    const feed = hass.handlers[0];
    // The first message dumps every entry with type null: not a reload.
    feed([{ type: null, entry: { domain: "apollo_mmwave", state: "loaded" } }]);
    feed([{ type: "updated", entry: { domain: "apollo_mmwave", state: "not_loaded" } }]);
    feed([{ type: "updated", entry: { domain: "esphome", state: "loaded" } }]);
    expect(cb).not.toHaveBeenCalled();
    feed([{ type: "updated", entry: { domain: "apollo_mmwave", state: "loaded" } }]);
    feed({ type: "added", entry: { domain: "apollo_mmwave", state: "loaded" } });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("resolves to null when the admin-only feed is refused", async () => {
    const hass = fakeHass();
    hass.connection.subscribeMessage.mockRejectedValueOnce({ code: "unauthorized" });
    expect(await subscribeEntryLoads(hass, vi.fn())).toBeNull();
  });
});

describe("CALIBRATION_RETRY_DELAYS_MS", () => {
  it("matches the zone card's backoff", () => {
    expect(CALIBRATION_RETRY_DELAYS_MS).toEqual([1000, 2000, 5000, 10000, 20000]);
  });
});
