/**
 * The distance and gate-energy cards, mounted in happy-dom. These pin the
 * "device not found" guard: a card pointed at a device with no gate radar
 * must say so instead of rendering nothing.
 */

import { afterEach, describe, it, expect } from "vitest";
import { ApolloLd2410DistanceCard } from "../src/cards/distance-card";
import { ApolloLd2410GateEnergyCard } from "../src/cards/gate-energy-card";
import { LD2410_PROFILE } from "../src/profiles";
import type { HassEntity, HomeAssistant } from "../src/types";

const NOT_FOUND = "device not found";
const AIR = "apollo_air_1_abc123";
const MSR = "apollo_msr_2_abc123";

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
 *  beside an MSR-2 with its engineering switch and gate entities. */
function hass(): HomeAssistant {
  const m = LD2410_PROFILE.entityMap(MSR);
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
