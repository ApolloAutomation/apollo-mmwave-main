import type { Uom } from "./charts/unit-convert";

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  /** `platform` is the integration that owns the entity (HA sends it to the
   *  frontend as `pl`); older frontends may omit it. */
  entities: Record<string, { device_id?: string; platform?: string }>;
  devices: Record<
    string,
    {
      name?: string;
      name_by_user?: string;
      /** ESPHome fills these from the firmware project name
       *  (e.g. "ApolloAutomation.MSR-2") — used for registry-first detection. */
      manufacturer?: string;
      model?: string;
    }
  >;
  /** Server config; `unit_system.length` is "km" (metric) or "mi" (US). */
  config?: { unit_system?: { length?: string } };
  /** HA's service call. The fifth argument (`notifyOnError`) must be false
   *  when a card renders the rejection itself, or the error toasts twice.
   *  Optional so existing fixtures built from `{states, entities, devices}`
   *  still type-check. */
  callService?(
    domain: string,
    service: string,
    data?: Record<string, any>,
    target?: unknown,
    notifyOnError?: boolean
  ): Promise<any>;
  callWS?<T>(msg: Record<string, any>): Promise<T>;
  connection?: HassConnection;
  /** HA's translator; "" for an unknown key. Used to render a rejected
   *  service call's translated exception message. */
  localize?(key: string, values?: Record<string, any>): string;
  /** Loads a translation category for an integration and resolves to the
   *  updated `localize`. */
  loadBackendTranslation?(
    category: string,
    integration?: string | string[]
  ): Promise<(key: string, values?: Record<string, any>) => string>;
}

/** The slice of home-assistant-js-websocket's Connection the cards use. */
export interface HassConnection {
  subscribeMessage<T>(
    callback: (message: T) => void,
    subscription: Record<string, any>
  ): Promise<() => void | Promise<void>>;
  addEventListener?(event: string, callback: () => void): void;
  removeEventListener?(event: string, callback: () => void): void;
}

/** Resolved entity ids. Gate arrays are indexed by gate number (0..8 on an
 *  LD2410, 0..13 on an LD2412) and may be sparse when built from the
 *  registry, which skips gates the device does not expose. Any field may be
 *  an id that does not exist in hass.states; callers must existence-check. */
export interface EntityMap {
  // controls
  engineering_mode?: string;
  bluetooth?: string;
  restart_radar?: string;
  factory_reset_radar?: string;
  esp_reboot?: string;
  // LD2412 only: the chip's own background correction and its status.
  background_correction?: string;
  background_correction_status?: string;
  // Both chips: the button that makes the radar report every threshold.
  query_params?: string;
  // zone config
  radar_timeout?: string;
  zone_1_start?: string;
  end_zone_1?: string;
  end_zone_2?: string;
  end_zone_3?: string;
  // gate config + charts
  // LD2410: max move / max still gate. LD2412: max_move_distance holds the
  // max distance gate and max_still_distance the MIN distance gate. Label
  // these via RadarProfile.rangeLabels / maxBarLabels, never by slot name.
  max_move_distance?: string;
  max_still_distance?: string;
  gate_size?: string;
  move_threshold: string[];
  still_threshold: string[];
  move_energy: string[];
  still_energy: string[];
  // distances
  still_distance?: string;
  moving_distance?: string;
  detection_distance?: string;
  // occupancy
  radar_target?: string;
  moving_target?: string;
  still_target?: string;
  zone_1_occupancy?: string;
  zone_2_occupancy?: string;
  zone_3_occupancy?: string;
}

export interface Ld2410CardConfig {
  type: string;
  device_id?: string;
  device_base_name?: string;
  entities?: Partial<EntityMap>;
  title?: string;
  distance_unit?: Uom;
}

/** Options the calibrate card forwards to `apollo_mmwave.calibrate_gates`.
 *  Absent keys are not sent, so the backend defaults apply. */
export interface CalibrationOptions {
  duration_s?: number;
  settle_s?: number;
  margin?: number;
  margin_pct?: number;
}

export interface CalibrateCardConfig {
  type: string;
  device_id?: string;
  device_base_name?: string;
  title?: string;
  calibration?: CalibrationOptions;
}
