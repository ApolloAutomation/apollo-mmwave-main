import type { DeviceInfoEntities } from "../entities";
import { confirmRow, row, type Row } from "./entity-rows";

/** What the device's restart button is called and asks, by what it restarts. */
export interface DeviceRestart {
  name: string;
  text: string;
}

/** The whole-device rows: versions, the update entity and the restart.
 *
 *  The update entity is a plain row: it shows whether an update is out, and a
 *  tap opens Home Assistant's own update dialog. Installing happens only
 *  there, never from a button on this card. Chip firmware sensors that ship
 *  disabled simply have no row until the user enables them. */
export function deviceRows(d: DeviceInfoEntities, restart: DeviceRestart): Row[] {
  return [
    ...row(d.apollo_firmware, "Apollo firmware"),
    ...row(d.ld2410_firmware, "LD2410 firmware"),
    ...row(d.ld2412_firmware, "LD2412 firmware"),
    ...row(d.ld2450_firmware, "LD2450 firmware"),
    ...row(d.update, "Firmware update"),
    ...confirmRow(d.esp_reboot, restart.name, restart.text, "Restart"),
  ];
}
