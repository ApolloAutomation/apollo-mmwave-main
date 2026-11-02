/**
 * The zone card's Lovelace config editor.
 *
 * The card used to carry its own dropdown, built out of an input, a div list
 * and a 200ms blur timer. Clicking an option only worked if the mouse button
 * came back up inside 200ms: the list was hidden before mouseup, so the item
 * never got its click and the selection silently did nothing. HA's own
 * `ha-device-picker` is what every other card uses and has no such race.
 *
 * `ha-device-picker` and `ha-textfield` belong to the Home Assistant frontend
 * and are not defined here, so these tests drive the editor the way HA does:
 * set properties on the elements it renders, dispatch the `value-changed` the
 * real elements dispatch, and read the config it emits back.
 */

import { describe, it, expect, vi } from "vitest";
import { ZoneMapCard } from "../src/zone-map/card";
import { ZoneMapCardEditor, firstLd2450DeviceId } from "../src/zone-map/editor";

const CARD_TYPE = "custom:apollo-radar-zone-map-card";

/** A hass whose registry holds one LD2450 radar and one unrelated device. */
function fakeHass() {
  return {
    states: {},
    devices: {
      lamp: { name: "Hall lamp" },
      radar: { name: "Office radar" },
    },
    entities: {
      "light.hall": { device_id: "lamp" },
      "sensor.office_ld2450_target_1_x": { device_id: "radar" },
      "sensor.office_ld2450_target_1_y": { device_id: "radar" },
    },
  } as any;
}

/** The editor, configured and given a hass, as HA sets one up. */
function mountEditor(config: Record<string, any> = {}) {
  const editor = new ZoneMapCardEditor();
  editor.setConfig({ type: CARD_TYPE, device_id: "", ...config } as any);
  editor.hass = fakeHass();
  return editor;
}

function picker(editor: ZoneMapCardEditor): any {
  return editor.shadowRoot!.querySelector("ha-device-picker");
}

function titleField(editor: ZoneMapCardEditor): any {
  return editor.shadowRoot!.querySelector("ha-textfield");
}

/** The config from the last config-changed the editor fired. */
function emitted(editor: ZoneMapCardEditor) {
  const seen: any[] = [];
  editor.addEventListener("config-changed", (event: any) => {
    seen.push(event.detail?.config);
  });
  return seen;
}

describe("zone map card editor wiring", () => {
  it("exposes a config element and a stub config pointing at a real radar", () => {
    const element = (ZoneMapCard as any).getConfigElement();
    expect(element.tagName.toLowerCase()).toBe("apollo-radar-zone-map-card-editor");
    expect(customElements.get("apollo-radar-zone-map-card-editor")).toBeDefined();

    const stub = (ZoneMapCard as any).getStubConfig(fakeHass());
    expect(stub.type).toBe(CARD_TYPE);
    // A card dragged out of the Lovelace picker used to open straight onto the
    // "device_id required" error, because the stub named no device.
    expect(stub.device_id).toBe("radar");
  });

  it("finds no device when nothing on the system is an LD2450", () => {
    const hass = { states: {}, devices: { lamp: {} }, entities: { "light.hall": { device_id: "lamp" } } } as any;
    expect(firstLd2450DeviceId(hass)).toBeUndefined();
    expect((ZoneMapCard as any).getStubConfig(hass).device_id).toBe("");
  });

  it("finds the radar from the entity registry when hass carries no devices", () => {
    const hass = fakeHass();
    delete hass.devices;
    expect(firstLd2450DeviceId(hass)).toBe("radar");
  });
});

describe("zone map card editor rendering", () => {
  it("renders a device picker and a title field, filtered to LD2450 radars", () => {
    const editor = mountEditor({ device_id: "radar", title: "Office" });

    expect(picker(editor).value).toBe("radar");
    expect(picker(editor).hass).toBeTruthy();
    expect(picker(editor).deviceFilter({ id: "radar" })).toBe(true);
    // Every other device on the system would be a card that cannot draw.
    expect(picker(editor).deviceFilter({ id: "lamp" })).toBe(false);
    expect(titleField(editor).value).toBe("Office");
  });

  it("has no hand-rolled combobox left anywhere in the editor", () => {
    const editor = mountEditor();
    expect(editor.shadowRoot!.querySelector(".combo-list")).toBeNull();
    expect(editor.shadowRoot!.querySelector(".combobox-wrapper")).toBeNull();
  });
});

describe("zone map card editor changes", () => {
  it("emits config-changed when the device picker changes", () => {
    const editor = mountEditor({ device_id: "" });
    const configs = emitted(editor);

    picker(editor).dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "dev999" } })
    );

    expect(configs).toHaveLength(1);
    expect(configs[0].device_id).toBe("dev999");
    expect(configs[0].type).toBe(CARD_TYPE);
  });

  it("bubbles the change out of the shadow root, where HA listens", () => {
    const editor = mountEditor();
    const handler = vi.fn();
    document.body.appendChild(editor);
    document.body.addEventListener("config-changed", handler);

    picker(editor).dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "dev999" } })
    );

    expect(handler).toHaveBeenCalled();
    document.body.removeEventListener("config-changed", handler);
    editor.remove();
  });

  it("keeps the rest of the config when one field changes", () => {
    const editor = mountEditor({ device_id: "radar", title: "Office", unit_display: true });
    const configs = emitted(editor);

    titleField(editor).value = "Kitchen";
    titleField(editor).dispatchEvent(new CustomEvent("input"));

    expect(configs[0]).toMatchObject({
      type: CARD_TYPE,
      device_id: "radar",
      title: "Kitchen",
      unit_display: true,
    });
  });

  it("drops an emptied title rather than writing an empty string", () => {
    const editor = mountEditor({ device_id: "radar", title: "Office" });
    const configs = emitted(editor);

    titleField(editor).value = "";
    titleField(editor).dispatchEvent(new CustomEvent("input"));

    expect(configs[0]).not.toHaveProperty("title");
    expect(configs[0].device_id).toBe("radar");
  });

  it("says nothing when the picker reports the device it already holds", () => {
    // HA re-renders the editor on every config-changed, and the picker echoes
    // its own value back. Re-emitting an identical config loops.
    const editor = mountEditor({ device_id: "radar" });
    const configs = emitted(editor);

    picker(editor).dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "radar" } })
    );

    expect(configs).toHaveLength(0);
  });
});

describe("zone map card editor device filter", () => {
  it("offers a registry-matched Apollo LD2450 model whose target entities are not in yet", () => {
    const editor = mountEditor({ device_id: "" });
    const hass = fakeHass();
    hass.devices.fresh = { name: "Apollo MTR-1 aabbcc", manufacturer: "ApolloAutomation", model: "MTR-1" };
    hass.entities["binary_sensor.apollo_mtr_1_aabbcc_online"] = { device_id: "fresh", platform: "esphome" };
    hass.devices.bare = { ...hass.devices.fresh };
    hass.devices.msr = { name: "Apollo MSR-2 aabbcc", manufacturer: "ApolloAutomation", model: "MSR-2" };
    editor.hass = hass;
    expect(picker(editor).deviceFilter({ id: "fresh" })).toBe(true);
    // Nothing at all registered yet: could be anyone's copy of the hardware.
    expect(picker(editor).deviceFilter({ id: "bare" })).toBe(false);
    // An MSR-2 has no LD2450, so it can never draw.
    expect(picker(editor).deviceFilter({ id: "msr" })).toBe(false);
  });

  it("does not offer another integration's copy of a radar", () => {
    const editor = mountEditor({ device_id: "" });
    const hass = fakeHass();
    hass.devices.copy = { name: "Apollo MTR-1 cbbdb4", manufacturer: "ApolloAutomation", model: "MTR-1" };
    hass.entities["device_tracker.apollo_mtr_1_cbbdb4"] = { device_id: "copy", platform: "unifi" };
    editor.hass = hass;
    expect(picker(editor).deviceFilter({ id: "copy" })).toBe(false);
  });

  it("offers an MTR-1 named the way its firmware names it", () => {
    const editor = mountEditor({ device_id: "" });
    const hass = fakeHass();
    hass.devices.mtr = { name: "Apollo MTR-1 cbbdb4" };
    hass.entities["sensor.apollo_mtr_1_cbbdb4_target_1_x"] = { device_id: "mtr" };
    editor.hass = hass;
    expect(picker(editor).deviceFilter({ id: "mtr" })).toBe(true);
  });
});

describe("zone map card editor appearance", () => {
  function themeSelect(editor: ZoneMapCardEditor): any {
    return editor.shadowRoot!.querySelector("ha-selector");
  }

  it("renders a dropdown reflecting the dark_mode key", () => {
    expect(themeSelect(mountEditor({ device_id: "radar" })).value).toBe("auto");
    expect(themeSelect(mountEditor({ device_id: "radar", dark_mode: true })).value).toBe("dark");
    expect(themeSelect(mountEditor({ device_id: "radar", dark_mode: false })).value).toBe("light");
    const select = themeSelect(mountEditor({ device_id: "radar" }));
    expect(select.selector.select.options.map((o: any) => o.value)).toEqual([
      "auto",
      "light",
      "dark",
    ]);
  });

  it("writes dark_mode true/false for Dark/Light and drops the key for Auto", () => {
    const editor = mountEditor({ device_id: "radar", title: "Office" });
    const configs = emitted(editor);
    const select = themeSelect(editor);

    select.dispatchEvent(new CustomEvent("value-changed", { detail: { value: "dark" } }));
    expect(configs[0]).toMatchObject({ device_id: "radar", title: "Office", dark_mode: true });

    select.dispatchEvent(new CustomEvent("value-changed", { detail: { value: "light" } }));
    expect(configs[1].dark_mode).toBe(false);

    select.dispatchEvent(new CustomEvent("value-changed", { detail: { value: "auto" } }));
    expect(configs[2]).not.toHaveProperty("dark_mode");
    expect(configs[2].device_id).toBe("radar");
  });

  it("says nothing when the dropdown echoes the value it already holds", () => {
    const editor = mountEditor({ device_id: "radar", dark_mode: true });
    const configs = emitted(editor);
    themeSelect(editor).dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "dark" } })
    );
    expect(configs).toHaveLength(0);
  });
});

describe("zone map card editor lock", () => {
  function lockSelect(editor: ZoneMapCardEditor): any {
    return editor.shadowRoot!.querySelectorAll("ha-selector")[1];
  }

  it("renders a dropdown reflecting the start_locked key", () => {
    expect(lockSelect(mountEditor({ device_id: "radar" })).value).toBe("auto");
    expect(lockSelect(mountEditor({ device_id: "radar", start_locked: true })).value).toBe("locked");
    expect(lockSelect(mountEditor({ device_id: "radar", start_locked: false })).value).toBe("unlocked");
  });

  it("writes start_locked true/false and drops the key for Auto", () => {
    const editor = mountEditor({ device_id: "radar" });
    const configs = emitted(editor);
    const select = lockSelect(editor);

    select.dispatchEvent(new CustomEvent("value-changed", { detail: { value: "locked" } }));
    expect(configs[0]).toMatchObject({ device_id: "radar", start_locked: true });

    select.dispatchEvent(new CustomEvent("value-changed", { detail: { value: "unlocked" } }));
    expect(configs[1].start_locked).toBe(false);

    select.dispatchEvent(new CustomEvent("value-changed", { detail: { value: "auto" } }));
    expect(configs[2]).not.toHaveProperty("start_locked");
    expect(configs).toHaveLength(3);
  });
});

describe("zone map card editor view only", () => {
  function lockSelect(editor: ZoneMapCardEditor): any {
    return editor.shadowRoot!.querySelectorAll("ha-selector")[1];
  }

  function viewOnlySelect(editor: ZoneMapCardEditor): any {
    return editor.shadowRoot!.querySelectorAll("ha-selector")[2];
  }

  function toggle(editor: ZoneMapCardEditor, value: unknown, init: EventInit = {}) {
    viewOnlySelect(editor).dispatchEvent(
      new CustomEvent("value-changed", { detail: { value }, ...init })
    );
  }

  it("offers View only after the lock selector", () => {
    const editor = mountEditor({ device_id: "radar" });

    const form = editor.shadowRoot!.querySelector(".form")!;
    expect(Array.from(form.children, (el) => el.tagName.toLowerCase())).toEqual([
      "ha-device-picker",
      "ha-textfield",
      "ha-selector",
      "ha-selector",
      "ha-selector",
      "div",
    ]);
    const select = viewOnlySelect(editor);
    expect(select.label).toBe("View only (the map without drawing tools)");
    expect(select.selector).toEqual({ boolean: {} });
    expect(select.hass).toBeTruthy();
    expect(select.value).toBe(false);
    expect(viewOnlySelect(mountEditor({ device_id: "radar", view_only: true })).value).toBe(true);
    // Anything but true is the full card, as the card reads it.
    expect(viewOnlySelect(mountEditor({ device_id: "radar", view_only: "yes" })).value).toBe(false);
  });

  it("writes view_only: true and deletes it on false", () => {
    const editor = mountEditor({ device_id: "radar", title: "Office" });
    const configs = emitted(editor);
    const raw = vi.fn();
    editor.addEventListener("value-changed", raw);

    toggle(editor, true, { bubbles: true, composed: true });
    expect(configs[0]).toEqual({
      type: CARD_TYPE,
      device_id: "radar",
      title: "Office",
      view_only: true,
    });

    toggle(editor, false, { bubbles: true, composed: true });
    expect(configs[1]).toEqual({ type: CARD_TYPE, device_id: "radar", title: "Office" });
    expect(configs).toHaveLength(2);
    // Lovelace sees the config, not the selector's own event.
    expect(raw).not.toHaveBeenCalled();
  });

  it("emits nothing on an echo", () => {
    const on = mountEditor({ device_id: "radar", view_only: true });
    const onConfigs = emitted(on);
    toggle(on, true);
    expect(onConfigs).toHaveLength(0);

    const off = mountEditor({ device_id: "radar" });
    const offConfigs = emitted(off);
    toggle(off, false);
    expect(offConfigs).toHaveLength(0);
  });

  it("hides the lock selector while View only is on", () => {
    // A view-only map has no lock, so the lock choice would do nothing.
    const editor = mountEditor({ device_id: "radar", start_locked: true });
    expect(lockSelect(editor).hidden).toBe(false);

    editor.setConfig({ type: CARD_TYPE, device_id: "radar", start_locked: true, view_only: true });
    expect(lockSelect(editor).hidden).toBe(true);
    expect(viewOnlySelect(editor).hidden).toBe(false);

    editor.setConfig({ type: CARD_TYPE, device_id: "radar", start_locked: true });
    expect(lockSelect(editor).hidden).toBe(false);
    expect(lockSelect(editor).value).toBe("locked");
  });
});
