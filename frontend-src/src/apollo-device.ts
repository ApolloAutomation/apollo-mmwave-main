import type { HomeAssistant } from "./types";
import { entitiesForDevice } from "./entity-index";
import { hasLd2450Device } from "./ld2450";
import { hasLd2460Device } from "./ld2460";
import {
  LD2410_PROFILE,
  LD2412_PROFILE,
  apolloModelInfo,
  isEsphomeDevice,
  type ApolloModelInfo,
  type RadarProfile,
} from "./profiles";

/**
 * What an Apollo device's radars are: its listed model first, else its
 * registered entities, so hardware this release does not list by model is
 * still set up from the radars it reports. Twin of device_radars in
 * models.py; fixtures/entity-radars-cases.json keeps the two alike.
 */

// Twins of _LD2412 and _LD2410 in models.py.
const LD2412 = /(?:^|_)ld2412_(?:engineering_mode|g\d{2}_(?:move|still)_threshold|presence)(?:_\d+)?$/;
const LD2410 = /(?:^|_)(?:radar_engineering_mode|g\d_(?:move|still)_threshold)(?:_\d+)?$/;
const RADAR_DOMAINS = new Set(["sensor", "switch", "number", "binary_sensor"]);
const OWN_PLATFORM = "apollo_mmwave";

/** The gate radar profile a device's registered entities show. */
export function entityGateProfile(hass: HomeAssistant, deviceId: string): RadarProfile | undefined {
  let profile: RadarProfile | undefined;
  for (const [id, e] of entitiesForDevice(hass.entities, deviceId)) {
    if (e.platform === OWN_PLATFORM) continue;
    const dot = id.indexOf(".");
    if (!RADAR_DOMAINS.has(id.slice(0, dot))) continue;
    const oid = id.slice(dot + 1);
    if (LD2412.test(oid)) return LD2412_PROFILE;
    if (!profile && LD2410.test(oid)) profile = LD2410_PROFILE;
  }
  return profile;
}

export function apolloDeviceInfo(hass: HomeAssistant, deviceId: string): ApolloModelInfo | undefined {
  if (!isEsphomeDevice(hass, deviceId)) return undefined;
  const device = hass.devices?.[deviceId];
  const known = apolloModelInfo(device);
  if (known) return known;
  if (device?.manufacturer?.toLowerCase() !== "apolloautomation") return undefined;
  const profile = entityGateProfile(hass, deviceId);
  const ld2460 = hasLd2460Device(hass, deviceId);
  const ld2450 = !ld2460 && hasLd2450Device(hass, deviceId);
  if (!profile && !ld2450 && !ld2460) return undefined;
  return { profile, ld2450, ld2460, derived: true };
}
