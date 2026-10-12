/**
 * The distance and gate-energy cards, mounted in happy-dom. These pin the
 * "device not found" guard: a card pointed at a device with no gate radar
 * must say so instead of rendering nothing. They also pin the default title,
 * which names the chip the card resolved to.
 */

import { afterEach, describe, it, expect } from "vitest";
import { ApolloLd2410DistanceCard } from "../src/cards/distance-card";
import { ApolloLd2410GateEnergyCard } from "../src/cards/gate-energy-card";
import { LD2410_PROFILE, LD2412_PROFILE } from "../src/profiles";
import type { HassEntity, HomeAssistant } from "../src/types";

const NOT_FOUND = "device not found";
const AIR = "apollo_air_1_abc123";
const MSR = "apollo_msr_2_abc123";
const RPRO = "apollo_r_pro_1_w_abc123";
const RPRO_BARE = "apollo_r_pro_1_w_def456";

function hassWith(devices: Record<string, { name: string; model: string; ids: string[] }>): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  const entities: HomeAssistant["entities"] = {};
  const registry: HomeAssistant["devices"] = {};
  for (const [deviceId, d] of Object.entries(devices)) {
    registry[deviceId] = { name: d.name, manufacturer: "ApolloAutomation", model: d.model };
    for (const id of d.ids) {
      states[id] = { entity_id: id, state: "0", attributes: {} };
      entities[id] = { device_id: deviceId };
    }
  }
  return { states, entities, devices: registry };
}

/** An AIR-1 whose only entity the radar resolver classifies is ESP Reboot,
 *  beside an MSR-2 and an R-PRO-1 with their engineering switch and gate
 *  entities, and an R-PRO-1 that has only its ESP Reboot button. */
function hass(): HomeAssistant {
  const m = LD2410_PROFILE.entityMap(MSR);
  const r = LD2412_PROFILE.entityMap(RPRO);
  return hassWith({
    air: {
      name: "Office AIR-1",
      model: "AIR-1",
      ids: [`button.${AIR}_esp_reboot`, `sensor.${AIR}_co2`],
    },
    msr: {
      name: "Living Room MSR-2",
      model: "MSR-2",
      ids: [
        m.esp_reboot!,
        m.engineering_mode!,
        m.gate_size!,
        ...m.move_threshold,
        ...m.still_threshold,
        ...m.move_energy,
        ...m.still_energy,
      ],
    },
    rpro: {
      name: "Office R-PRO-1",
      model: "R-PRO-1-W",
      ids: [
        r.esp_reboot!,
        r.engineering_mode!,
        r.gate_size!,
        r.max_move_distance!,
        r.max_still_distance!,
        ...r.move_threshold,
        ...r.still_threshold,
        ...r.move_energy,
        ...r.still_energy,
      ],
    },
    rpro_bare: {
      name: "Hall R-PRO-1",
      model: "R-PRO-1-W",
      ids: [`button.${RPRO_BARE}_esp_reboot`],
    },
  });
}

type Card = ApolloLd2410DistanceCard | ApolloLd2410GateEnergyCard;

async function mount(card: Card, config: Record<string, unknown>): Promise<Card> {
  document.body.appendChild(card);
  card.setConfig({ type: "custom:x", ...config });
  card.hass = hass();
  await card.updateComplete;
  return card;
}

afterEach(() => {
  document.body.innerHTML = "";
});

const CARDS: [string, () => Card][] = [
  ["distance card", () => new ApolloLd2410DistanceCard()],
  ["gate-energy card", () => new ApolloLd2410GateEnergyCard()],
];

describe.each(CARDS)("%s", (_name, make) => {
  it("says device not found for a device_id whose only match is ESP Reboot", async () => {
    const card = await mount(make(), { device_id: "air" });
    const root = card.shadowRoot!;
    expect(root.querySelector("ha-card")).not.toBeNull();
    expect(root.textContent).toContain(NOT_FOUND);
  });

  it("says device not found for a base name with only an ESP Reboot button", async () => {
    const card = await mount(make(), { device_base_name: AIR });
    const root = card.shadowRoot!;
    expect(root.textContent).toContain(NOT_FOUND);
    expect(root.querySelector("svg")).toBeNull();
  });

  it("renders the chart for an MSR-2", async () => {
    const card = await mount(make(), { device_id: "msr" });
    const root = card.shadowRoot!;
    expect(root.querySelector("ha-card")).not.toBeNull();
    expect(root.querySelector("svg")).not.toBeNull();
    expect(root.textContent).not.toContain(NOT_FOUND);
  });
});

// The card's default title and the chart's aria-label name the chip the card
// resolved to, as the strategy's own titles do; LD2410 stays the fallback.
const TITLED: [string, () => Card, string][] = [
  ["distance card", () => new ApolloLd2410DistanceCard(), "Distances"],
  ["gate-energy card", () => new ApolloLd2410GateEnergyCard(), "Gate Energy"],
];

function header(card: Card): unknown {
  return (card.shadowRoot!.querySelector("ha-card") as unknown as { header?: unknown }).header;
}

describe.each(TITLED)("%s title", (_name, make, what) => {
  it("names the LD2412 for an R-PRO-1 when the config has no title", async () => {
    const card = await mount(make(), { device_id: "rpro" });
    expect(header(card)).toBe(`LD2412 ${what}`);
    expect(card.shadowRoot!.querySelector("svg")?.getAttribute("aria-label")).toBe(
      `LD2412 ${what.toLowerCase()}`
    );
  });

  it("names the LD2410 for an MSR-2 when the config has no title", async () => {
    const card = await mount(make(), { device_id: "msr" });
    expect(header(card)).toBe(`LD2410 ${what}`);
    expect(card.shadowRoot!.querySelector("svg")?.getAttribute("aria-label")).toBe(
      `LD2410 ${what.toLowerCase()}`
    );
  });

  it("uses an explicit title over the chip name", async () => {
    const card = await mount(make(), { device_id: "rpro", title: "Office radar" });
    expect(header(card)).toBe("Office radar");
  });

  it("names the registry's chip on the device-not-found card", async () => {
    const card = await mount(make(), { device_id: "rpro_bare" });
    expect(card.shadowRoot!.textContent).toContain(NOT_FOUND);
    expect(header(card)).toBe(`LD2412 ${what}`);
  });

  it("keeps the LD2410 title when no profile resolves", async () => {
    const card = await mount(make(), { device_id: "air" });
    expect(card.shadowRoot!.textContent).toContain(NOT_FOUND);
    expect(header(card)).toBe(`LD2410 ${what}`);
  });
});
