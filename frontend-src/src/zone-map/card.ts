// @ts-nocheck
/**
 * The 2D zone-drawing card.
 *
 * Moved here from `custom_components/apollo_mmwave/www/zone-mapper-card.js` as
 * untyped JS, so `@ts-nocheck` above is deliberate rather than a defect: 2,650
 * lines could not be typed in the same commit that moves them. `@ts-nocheck`
 * is file-level, so a section only gets typed by leaving this file: the data
 * protocol did, into the fully typed `./api`. What is left is the drawing,
 * the canvas and the in-card controls. Do not delete it wholesale, delete it
 * when the last untyped section is gone.
 *
 * This copy is a fork, not a vendor drop. Fixes land here first and get
 * back-ported to ApolloAutomation/zone-mapper-card later.
 */

import { registerElement } from '../register';
import { versionNoticeElement, watchVersion } from '../version-check';
import { clearMovement, connectZones, fetchMovement, isMovementPayload } from './api';
import { CELL_MM, CellGrid, bucketCells } from './cells';
import {
  ADMIN_ONLY_NOTE,
  ADMIN_ONLY_TITLE,
  CLEAR_LOCKED_TOAST,
  CONE_MOUNT_HINT,
  COVERAGE_CLEAR,
  COVERAGE_LABEL,
  COVERAGE_TITLE,
  DRAW_LOCKED_TOAST,
  HELD_SUFFIX,
  HISTORY_CLEAR,
  HISTORY_CLEAR_CONFIRM,
  HISTORY_CLEAR_NO,
  HISTORY_CLEAR_YES,
  HISTORY_CLEARED_TOAST,
  HISTORY_EMPTY,
  HISTORY_HEATMAP,
  HISTORY_HINT,
  HISTORY_LABEL,
  HISTORY_LIVE,
  HISTORY_LOADING,
  HISTORY_PAUSE,
  HISTORY_PLAY,
  HISTORY_RANGES,
  HISTORY_SCRUB_LABEL,
  HISTORY_SPEEDS,
  HISTORY_TITLE,
  HISTORY_UNAUTHORIZED,
  HISTORY_UNREADABLE,
  HISTORY_WALK_TITLE,
  HOLD_IGNORE_TITLE,
  HOLD_LABEL,
  HOLD_OPTIONS,
  HOLD_TITLE,
  IGNORED_SUFFIX,
  LOCK_OFF_TOAST,
  LOCK_ON_TOAST,
  MIRROR_HINT,
  MIRROR_LABEL,
  MOVEMENT_HINT,
  MOVEMENT_LABEL,
  MOVEMENT_OFF_CONFIRM,
  MOVEMENT_OFF_CONFIRM_NO,
  MOVEMENT_OFF_CONFIRM_YES,
  MOVEMENT_OFF_TOAST,
  MOVEMENT_ON_TOAST,
  NO_SHAPE_TEXT,
  OFFLINE_NOTE,
  POLY_TOO_FEW_TOAST,
  SELECT_ZONE_TOAST,
  SIZE_PREFIX,
  TYPE_LABEL,
  TYPE_OPTIONS,
  TYPE_TITLE,
  WALK_BUTTON_TITLE,
  WALK_CANCEL,
  WALK_CANCEL_CONFIRM,
  WALK_CANCEL_NO,
  WALK_CANCEL_YES,
  WALK_CLOSED_TOAST,
  WALK_CORNER,
  WALK_FINISH,
  WALK_FLAT_TOAST,
  WALK_HINT_CROWD,
  WALK_HINT_FULL,
  WALK_HINT_NOBODY,
  WALK_HINT_START,
  WALK_TOO_CLOSE_TOAST,
  WALK_UNDO,
  ZONE_SETTINGS_HINT,
  ZOOM_FIT,
  ZOOM_FIT_ALL_LABEL,
  ZOOM_FIT_ZONES_LABEL,
  ZOOM_GROUP_LABEL,
  ZOOM_IN_LABEL,
  ZOOM_IN_TITLE,
  ZOOM_OUT_LABEL,
  ZOOM_PAN_HINT,
  formatAgo,
  historyClearError,
  historyError,
  replayBadge,
  walkHintNext,
  zoomReadout,
} from './copy';
import { ZONE_MAP_EDITOR_TAG, firstLd2450DeviceId } from './editor';
import { formatHold, formatSize, zoneSize } from './format';
import { pointInZone, rotateToMap } from './geometry';
import { decodeMovement, heatCells, positionAt, sparkBuckets, trailAt } from './history';
import { fallbackPresenceId, presenceLook } from './presence';
import { snapDecimals, snapMm, snapStepMm } from './snap';
import { TRAIL_GAP_MS, TRAIL_MS, TrailBuffer } from './trails';
import {
  ZOOM_MAX,
  ZOOM_STEP,
  boundsOf,
  clampView,
  fitView,
  followPoints,
  sameView,
  viewAt,
  viewWindow,
  zoomAt,
} from './view';
import { WALK_AVERAGE_MS, WALK_MIN_CORNER_GAP_MM, walkShape } from './walk';

const COLOR = Object.freeze({
  ui: {
    lightCanvasBackground: '#ffffff',
    darkContainerBackground: '#1e1f23',
    darkContainerText: '#eceff4',
    darkCanvasBorder: '#3a3d45',
    darkCanvasBackground: '#121316',
    overlayButtonLightBg: 'rgba(0, 0, 0, 0.50)',
    overlayButtonLightBorder: 'rgba(255, 255, 255, 0.25)',
    overlayButtonDarkBg: 'rgba(255, 255, 255, 0.16)',
    overlayButtonDarkBorder: 'rgba(255, 255, 255, 0.25)',
    overlayButtonText: '#ffffff',
    overlayButtonActiveOutline: '#4caf50',
    darkPrimaryButton: '#2d7dd2',
    darkZoneButtonBg: '#2a2c31',
    darkZoneButtonText: '#e5e9f0',
    darkZoneButtonBorder: '#3a3d45',
    darkZoneButtonActiveBg: '#2d7dd2',
    darkZoneButtonActiveBorder: '#2d7dd2',
    infoDarkText: '#b0b6c2',
    zoneItemDarkBg: '#2a2c31',
    zoneItemDarkText: '#d8dee9',
    darkSelectBg: '#202226',
    darkSelectBorder: '#3a3d45',
    darkSelectText: '#e5e9f0',
    primaryButtonText: '#ffffff',
  },
  canvas: {
    defaultTarget: '#ff6b6b',
    targetStroke: '#ffffff',
    gridLine: '#e0e0e0',
    axisLight: '#000000',
    axisDark: '#ffffff',
    polygonPreviewLight: 'rgba(100,100,100,0.75)',
    polygonPreviewDark: 'rgba(255,255,255,0.75)',
    polygonVertexFillLight: '#000000',
    polygonVertexFillDark: '#ffffff',
    polygonVertexStrokeLight: 'rgba(255,255,255,0.6)',
    polygonVertexStrokeDark: 'rgba(0,0,0,0.6)',
    polygonStrokeLight: 'rgba(33,33,33,0.85)',
    polygonStrokeDark: 'rgba(255,255,255,0.85)',
    drawStrokeLight: 'rgba(100, 100, 100, 0.5)',
    drawStrokeDark: 'rgba(255,255,255,0.75)',
    deviceConeFill: 'rgba(128, 233, 31, 0.06)',
    deviceConeStroke: 'rgba(117, 243, 33, 0.6)',
    // Hue says which zone it is; the fill's alpha (and the stroke's dash)
    // says whether its presence sensor is on.
    zonePalette: [
      {
        fillOn: 'rgba(244, 67, 54, 0.45)',
        fillOff: 'rgba(244, 67, 54, 0.18)',
        stroke: 'rgba(244, 67, 54, 1)',
      },
      {
        fillOn: 'rgba(33, 150, 243, 0.45)',
        fillOff: 'rgba(33, 150, 243, 0.18)',
        stroke: 'rgba(33, 150, 243, 1)',
      },
      {
        fillOn: 'rgba(76, 175, 80, 0.45)',
        fillOff: 'rgba(76, 175, 80, 0.18)',
        stroke: 'rgba(76, 175, 80, 1)',
      },
      {
        fillOn: 'rgba(255, 193, 7, 0.45)',
        fillOff: 'rgba(255, 193, 7, 0.18)',
        stroke: 'rgba(255, 193, 7, 1)',
      },
      {
        fillOn: 'rgba(156, 39, 176, 0.45)',
        fillOff: 'rgba(156, 39, 176, 0.18)',
        stroke: 'rgba(156, 39, 176, 1)',
      },
    ],
    // A detect zone whose presence sensor is unavailable (the radar is offline).
    zoneUnavailableFillLight: 'rgba(158, 158, 158, 0.18)',
    zoneUnavailableFillDark: 'rgba(138, 143, 152, 0.22)',
    zoneUnavailableStrokeLight: 'rgba(117, 117, 117, 0.9)',
    zoneUnavailableStrokeDark: 'rgba(160, 165, 175, 0.9)',
    // Ignore zones: a grey hatch, or a flat grey where no pattern can be made.
    ignoreHatchLight: 'rgba(97, 97, 97, 0.45)',
    ignoreHatchDark: 'rgba(189, 189, 189, 0.40)',
    ignoreFillLight: 'rgba(97, 97, 97, 0.18)',
    ignoreFillDark: 'rgba(189, 189, 189, 0.16)',
    ignoreStrokeLight: 'rgba(97, 97, 97, 0.9)',
    ignoreStrokeDark: 'rgba(189, 189, 189, 0.9)',
    targetPalette: ['#f44336', '#2196f3', '#4caf50', '#ffc107', '#9c27b0'],
    // The number on each target dot, by the same index: black on red, blue,
    // green and amber, white on purple, whichever contrasts more.
    targetNumber: ['#000000', '#000000', '#000000', '#000000', '#ffffff'],
    // A target inside an ignore zone, which presence does not see.
    ignoredTargetLight: '#757575',
    ignoredTargetDark: '#8a8f98',
    // The Coverage paint, as the "r, g, b" an rgba() fill takes with each
    // cell's alpha.
    coverageLight: '255, 152, 0',
    coverageDark: '255, 183, 77',
  },
});

const DRAW_MODES = Object.freeze({
  RECT: 'rect',
  ELLIPSE: 'ellipse',
  POLYGON: 'polygon',
  // Corners are marked by walking to them, not drawn, so the canvas pans.
  WALK: 'walk',
});

const DEFAULT_GRID = Object.freeze({
  xMin: -5000,
  xMax: 5000,
  yMin: 0,
  yMax: 10000,
});

const DEFAULT_CONE = Object.freeze({
  yMax: 6000,
  fovDeg: 120,
  angleDeg: 0,
});

// The canvas backing store is this wide. A YAML grid keeps it square, as it
// always was; a fitted grid sets its height from the grid's own shape.
const CANVAS_WIDTH_PX = 800;

// A card whose YAML has no grid shows the radar's field of view as it is
// currently rotated, instead of the fixed 10 m square DEFAULT_GRID, where the
// 6 m cone sat in the top half and ran off both sides. The arc gets this share
// of the cone's range as room past it, so its edge and the range label clear
// the canvas border. The apex gets none: behind the radar is its wall.
const FIT_MARGIN_FRACTION = 0.05;
// The fitted map is never taller than it is wide, and never shorter than this
// share of its width. Facing ahead, the cone is about 12 m by 6.5 m, which
// would be shorter still, but the drawing buttons open upward from the bottom
// edge, up to six buttons tall in polygon mode, and need the height on a phone.
const FIT_MIN_ASPECT = 0.75;
// A fitted edge within this many mm of a grid step stays on that step. The
// card saves zones in whole mm, rounded from a point clamped to the map, and a
// feet edge is rarely a whole mm (22 ft is 6705.6 mm), so a zone drawn to the
// edge comes back from the store up to 0.4 mm past it, an ellipse's center
// plus radius up to 0.8 mm and a tapped 1 mm ellipse up to 1.4 mm. Without
// the slack, that echo grew the map by a whole step right after the save.
const FIT_EDGE_SLACK_MM = 2;

// The units the m / ft switch offers, and the ones the zone store saves per
// radar as display_units. Display only: zone geometry stays millimeters.
const DISPLAY_UNITS = Object.freeze(['m', 'ft']);

// The m / ft switch's tooltips. An administrator's press is saved for the
// radar, so it changes the map for every viewer on every dashboard; anyone
// else's changes only their own view.
const UNIT_SWITCH_TITLES = Object.freeze({
  admin: Object.freeze({
    m: "Show this radar's map in meters for everyone",
    ft: "Show this radar's map in feet for everyone",
  }),
  viewer: Object.freeze({ m: 'Show the map in meters', ft: 'Show the map in feet' }),
});

// What a card without show_undo or unit_label_size uses. setConfig assigns
// them when the key is absent, so removing the key from a live card's config
// reverts it the same way a freshly created card starts.
const DEFAULT_SHOW_UNDO = true;
const DEFAULT_UNIT_LABEL_SIZE = 18; // px

// Axis label layout. Labels are drawn in canvas backing px, and the card
// scales the 800 px backing store to its width. The clear space kept between
// two labels is set in CSS px, so it holds on a narrow card too. When the
// canvas cannot measure text (the test stub), a label is guessed at 0.6 of the
// font size per character. That is a little wider than real digits, so the
// guess errs toward fewer labels, never toward overlapping ones.
const LABEL_GAP_CSS_PX = 4;
const LABEL_FALLBACK_EM_PER_CHAR = 0.6;
// A cone ring label is left out when a grid label at the same distance sits
// within this many label heights of it. On the center axis the two name the
// same distance, and drawing both printed "2m2m". The distance is compared,
// not the text, so "200cm" and "-2m" repeat a "2m" ring label too.
const RING_LABEL_REPEAT_EM = 2;
// How close (mm) a grid label's distance from the radar must be to a ring's
// radius to name the same distance. Both are sums of float steps.
const RING_LABEL_SAME_DISTANCE_MM = 1;

const POLYGON_MAX_POINTS = 32;

// How far (CSS px) the second tap of a polygon double-tap may land from the
// last vertex and still count as the finishing gesture rather than a new
// vertex. A UI gesture tolerance for finger jitter, not a radar setting.
const POLY_DOUBLE_TAP_SLOP_PX = 24;

// How far (CSS px) a press on the locked Cone rotation slider moves along it
// before it is a try at turning the cone, and how far it may move up or down
// and still be a tap rather than the end of a scroll.
const CONE_TRY_PX = 10;
// How long a try at the locked slider rings the Locked button.
const LOCK_NUDGE_MS = 1200;
// The lock reminders and the drawing toasts say each thing at most this
// often, so a burst of taps does not stack copies of one message.
const TOAST_THROTTLE_MS = 1500;
// The trail fade timer paints a frame at most this often (ms), about ten a
// second, and waits out the rest of a frame a hass push already painted.
const TRAIL_FRAME_MS = 100;
// How far (CSS px) the size readout sits above the pointer while a shape is
// drawn. A fingertip covers far more than a mouse pointer does.
const READOUT_OFFSET_MOUSE_PX = 28;
const READOUT_OFFSET_TOUCH_PX = 64;
// Where the readout has no room above a finger (near the radar, on a fitted
// map), it goes beside the finger instead, its near edge this far (CSS px,
// about a fingertip's width) from the touch point. Where it does not fit that
// far out on either side, as a wide feet readout near the middle of a phone's
// map, it goes below the finger, never closer.
const READOUT_BESIDE_TOUCH_PX = 44;
// Walk's readout keeps this much clear space (CSS px) from the corners'
// rings and numbers and from the buttons over the map, where it can.
const READOUT_CLEAR_CSS_PX = 4;
// A second finger that lands while the first has moved less than this (CSS
// px) since it went down starts a pinch, and the first finger's shape is
// dropped. Once the first finger has moved farther it is drawing, and a
// second finger (a resting thumb, a palm) changes nothing.
const PINCH_SLOP_CSS_PX = 10;
// Ctrl or Cmd and this much wheel travel (CSS px, a mouse wheel's notch)
// zoom by one ZOOM_STEP, as one press of + or - does. A trackpad pinch
// arrives as many small Ctrl wheel events and zooms smoothly. One event
// counts for at most a notch, so a page-sized delta cannot jump to 8x.
const WHEEL_PX_PER_STEP = 100;
// Walk keeps the walker this fraction of a zoomed view's width and height
// inside each edge, panning (and zooming out only if it must) to do so.
const WALK_FOLLOW_INSET = 0.15;
// The map is never taller than the screen less this much (CSS px): Home
// Assistant's toolbar, the card's padding and title, and the row of chips
// under the map. A double-width section on a short screen would otherwise
// push the chips off the bottom. Never below MAP_MIN_HEIGHT_PX, so a phone
// on its side still gets a map to work on.
const MAP_HEIGHT_ROOM_PX = 200;
const MAP_MIN_HEIGHT_PX = 240;
// The notes over the map's top corners ("Radar offline" and the Replay
// badge) sit this far (CSS px) below its top edge, and are about this tall:
// .map-note's 12 px text at line height 1.3, with 4 px padding above and
// below.
const MAP_NOTE_INSET_CSS_PX = 4;
const MAP_NOTE_HEIGHT_CSS_PX = 24;
// A movement replay that plays paints a frame this often (ms), about 15 a
// second: smooth enough for a dot sliding between records half a second
// apart, and a third of the work of an animation frame.
const HISTORY_FRAME_MS = 66;
// A first movement answer whose clock is further than this (ms) from the
// one the request assumed is asked again with the start corrected, so the
// range is not missing its first minutes.
const HISTORY_SKEW_REFETCH_MS = 60000;
// The sparkline over the replay's scrubber: this many bars across the range,
// in a viewBox this many units tall.
const HISTORY_SPARK_BUCKETS = 120;
const HISTORY_SPARK_HEIGHT = 24;
// Why a refused call failed, when Home Assistant gave no message.
const REJECTED_REASON = 'Home Assistant rejected it.';

const CONE_LOCKED_HINT = 'Locked with the map. Press Locked on the map to change it.';
const CONE_LOCKED_TOAST = 'Cone rotation is locked. Press Locked on the map to change it.';

const LOCK_STORAGE_PREFIX = 'apollo-mmwave.zone-map.lock';

function lockStorageKey(deviceId) {
  return `${LOCK_STORAGE_PREFIX}.${deviceId}`;
}

/** `value` moved just far enough that a box reaching `half` either side of
 *  it stays within 0..`extent`, or the middle when the box is wider. */
function clampOnto(value, half, extent) {
  return half * 2 >= extent ? extent / 2 : Math.min(Math.max(value, half), extent - half);
}

// Remember the lock toggle per radar so a reload keeps the grid locked
function readStoredLock(deviceId) {
  try {
    const raw = window.localStorage.getItem(lockStorageKey(deviceId));
    if (raw === '1') return true;
    if (raw === '0') return false;
    return null;
  } catch {
    return null;
  }
}

function writeStoredLock(deviceId, locked) {
  try {
    window.localStorage.setItem(lockStorageKey(deviceId), locked ? '1' : '0');
  } catch {
    // Nothing to do; the toggle still applies for the current page load
  }
}

const COVERAGE_STORAGE_PREFIX = 'apollo-mmwave.zone-map.coverage';

function coverageStorageKey(deviceId) {
  return `${COVERAGE_STORAGE_PREFIX}.${deviceId}`;
}

// The Coverage toggle is a viewer's own, remembered per radar in this browser
// like the lock. The paint itself is page memory and never stored.
function readStoredCoverage(deviceId) {
  try {
    return window.localStorage.getItem(coverageStorageKey(deviceId)) === '1';
  } catch {
    return false;
  }
}

function writeStoredCoverage(deviceId, on) {
  try {
    window.localStorage.setItem(coverageStorageKey(deviceId), on ? '1' : '0');
  } catch {
    // Nothing to do; the toggle still applies for the current page load
  }
}

/** The Touch with `identifier` in a TouchList, or null. A TouchList is
 *  array-like, not an array, so walk it by index. */
function findTouch(list, identifier) {
  if (!list) return null;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].identifier === identifier) return list[i];
  }
  return null;
}

/**
 * Whether a target's reading (x, y) may be the first of the two writes of a
 * target that vanishes: exactly one coordinate turned 0 since `last`, the
 * slot's previous reading. The second write, the other coordinate
 * turning 0, then shows the slot empty. `half_vanished` in hold.py, by which
 * the hold and the movement recorder skip such a point, has the same rule
 * for a slot with a previous reading. It also flags the first write of a
 * target appearing in a slot that read 0/0, which has none; here
 * TrailBuffer.push holds that sample for its other coordinate instead.
 */
function halfVanished(last, x, y) {
  if (!last || (x === 0) === (y === 0)) return false;
  return x === 0 ? last.x !== 0 : last.y !== 0;
}

/**
 * A clock time with seconds in `language`, on a 12-hour clock when `hour12`
 * is true, a 24-hour one when false, the language's own when undefined, in
 * `timeZone` or this browser's. A 24-hour clock writes 09:05:00, as Home
 * Assistant's own times do; a 12-hour one 9:05:00 AM. Throws what Intl
 * throws for a language or time zone it does not know.
 */
function clockFormat(language, hour12, timeZone) {
  const options = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
  if (hour12 !== undefined) options.hour12 = hour12;
  if (timeZone) options.timeZone = timeZone;
  const format = new Intl.DateTimeFormat(language, options);
  if (format.resolvedOptions().hour12) return format;
  return new Intl.DateTimeFormat(language, { ...options, hour: '2-digit' });
}

// TODO(REVIEW_REPORT.md X04): no yd here (backend and tuning cards accept it, so yd becomes
// mm), and the YAML input_units overwrites the store's on every save. Decide the owner; if the
// card keeps it, add yd: 914.4 plus yard aliases and test the keys against INPUT_UNIT_FACTORS.
const LENGTH_UNITS = Object.freeze({
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
});

// Millimeters per Home Assistant length unit, keyed by the UnitOfLength symbols exactly as
// Home Assistant writes them, for reading a target sensor in the unit its state is in. ESPHome
// reports LD2450 targets in mm, but Home Assistant set to US customary units shows a new
// distance sensor reported in mm (or cm) in inches, and anyone can pick another unit in an
// entity's settings. Not LENGTH_UNITS, which holds the grid and YAML units and takes aliases.
// SENSOR_UNIT_FACTORS in const.py is this table, and the presence sensor also converts with one
// multiplication, so the dot drawn here and the zone's presence agree on every reading.
// tests/test_contracts.py keeps the two equal.
const SENSOR_LENGTH_UNITS = Object.freeze({
  mm: 1,
  cm: 10,
  m: 1000,
  km: 1000000,
  in: 25.4,
  ft: 304.8,
  yd: 914.4,
  mi: 1609344,
  nmi: 1852000,
});

const GRID_STEP_CANDIDATES = Object.freeze({
  in: Object.freeze([1, 2, 3, 6, 12, 24, 36, 48, 60, 72, 96, 120]),
  ft: Object.freeze([0.25, 0.5, 1, 2, 5, 10, 20, 50, 100]),
  default: Object.freeze([0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]),
});

const UNIT_ALIASES = Object.freeze({
  mm: 'mm',
  millimeter: 'mm',
  millimeters: 'mm',
  millimetre: 'mm',
  millimetres: 'mm',
  cm: 'cm',
  centimeter: 'cm',
  centimeters: 'cm',
  centimetre: 'cm',
  centimetres: 'cm',
  m: 'm',
  meter: 'm',
  meters: 'm',
  metre: 'm',
  metres: 'm',
  in: 'in',
  inch: 'in',
  inches: 'in',
  ft: 'ft',
  foot: 'ft',
  feet: 'ft',
});

export class ZoneMapCard extends HTMLElement {
  static get GRID_MIN_SPACING_PX() {
    return 40;
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // Defaults
    this.darkMode = false;
    // False until setConfig sees a dark_mode key. While false, darkMode
    // follows hass.themes.darkMode instead of staying at whatever it was set to.
    this._darkModeConfigured = false;
    this.isDrawing = false;
    this.startPoint = null;
    this._cursorPoint = null;
    // Whether the pointer's corner at _cursorPoint goes where it is or
    // snaps to a round value (see _placeMm): Alt or Option held at the last
    // move places it freely. startPoint is placed when pressed, snapped or
    // not, and stays there.
    this._cursorFree = false;
    this._activeInput = null;
    // The identifier of the finger a touch gesture follows, null when no
    // finger is tracked (mouse input, or between gestures).
    this._activeTouchId = null;
    this.trackedEntities = [];
    // What `set hass` last painted the tracked targets from (see
    // _trackedStatesKey). null until it first paints, so that one always does.
    this._paintedTrackedKey = null;
    // The same for the zones' presence states (see _zoneStatesKey).
    this._paintedZoneKey = null;
    // Per zone id, what the payload says beyond the geometry:
    // { presence: entity id or null, type: 'detect' | 'ignore', holdS }.
    this._zoneMeta = new Map();
    // The newest choice of each zone setting select whose save is still on
    // its way, as { value, seq } keyed '<zone id>:<setting>', and the number
    // the next save takes (see _saveZoneSetting).
    this._zoneSettingPending = new Map();
    this._zoneSettingSeq = 0;
    // The radar's map is drawn mirrored left to right (mirror_x).
    this._mirrorX = false;
    // An administrator keeps this radar's movement history (movement_history),
    // and whether Configure is asking before turning it off.
    this._movementHistory = false;
    this._movementConfirm = false;
    // The History panel and its replay (see _openHistory). The range, speed
    // and Heatmap are this viewer's picks and outlive a close; the rest
    // belongs to one answer. `t` is the replay time, `since` the range's
    // start and `serverNow` its end, all in the server's epoch ms, and
    // `clientAt` this browser's clock when the answer came.
    this._history = {
      open: false,
      rangeH: HISTORY_RANGES[0].hours,
      heatmap: false,
      playing: false,
      speed: HISTORY_SPEEDS[0].speed,
      t: null,
      series: null,
      heat: null,
      loading: false,
      error: null,
      serverNow: null,
      clientAt: null,
      since: null,
      timer: null,
      // When the playing replay last moved on, on the _now() clock.
      lastTick: 0,
      confirmClear: false,
    };
    // The newest movement request's number: an answer to an older one, or
    // one that comes after the panel closed, is dropped.
    this._historyReq = 0;
    // How far the server's clock is ahead of this browser's, as the last
    // answer showed. A property of the two clocks, not of a radar.
    this._historySkewMs = 0;
    // The replay's time format and the locale it was made for.
    this._replayFormat = null;
    // When _notifyThrottled last showed each message, by message.
    this._toastAt = new Map();
    // Whether the "Radar offline" note is showing (see _renderOfflineNote).
    this._offlineShown = false;
    // The page's version check while the card is on the page, and the
    // notice it last put under the title (see _renderVersionNotice).
    this._version = null;
    this._versionShown = undefined;
    // The ignore zones' hatch pattern per theme, made once per context.
    this._hatch = { light: null, dark: null };
    // Canvas backing px per CSS px, read once at the top of each frame.
    this._frameScale = 1;
    // When the canvas was last painted, on the _now() clock.
    this._lastDrawAt = 0;
    // A few seconds of each live target's positions, page memory only: the
    // trails behind the dots draw from it and Coverage counts from it.
    this._trails = new TrailBuffer();
    // Each live target's reading as last pushed into the trails, by slot.
    this._trailReadings = new Map();
    // The pending trail fade frame (see _kickTrailTimer), or null.
    this._trailTimer = null;
    // Every live position since the page loaded, in cells, and whether this
    // viewer paints it (remembered per radar in this browser).
    this._coverage = new CellGrid();
    this._coverageOn = false;
    // A card that shows only the map (view_only), with no coverage.
    this._viewOnly = false;
    // Walk, marking a zone's corners by walking to them: { corners } (mm in
    // the radar's own frame, in walking order) while it is on, else null;
    // the drawing mode it came from; whether its Cancel is asking first; and
    // what its panel last showed (see _renderWalkPanel).
    this._walk = null;
    this._modeBeforeWalk = null;
    this._walkConfirmCancel = false;
    this._walkVisible = null;
    this.showZones = false;
    this.showConfig = false;
    this._polyPoints = [];
    this.zones = [];
    this.zoneConfig = [];
    this.selectedZone = null;
    // Zone protocol state. The store answers over the websocket; these hold
    // what it last said, why it could not answer, and the live subscription.
    this._zoneConfigPayload = null;
    this._loadError = null;
    this._zoneConnection = null;
    this._deviceLabel = null;
    // null entities means the radar's own detected targets are in use. The
    // card has to say which of the two it is showing.
    this._usingSuggestedEntities = false;
    // Grid defaults (mm). setConfig replaces them, with a YAML grid's extents
    // or with the fit to the radar's field of view (_refitGrid).
    this.xMin = DEFAULT_GRID.xMin;
    this.xMax = DEFAULT_GRID.xMax;
    this.yMin = DEFAULT_GRID.yMin;
    this.yMax = DEFAULT_GRID.yMax;
    // Zoom and pan (see ./view): the zoom and the map point at the canvas's
    // center, or null for the whole map. Page memory only, kept across
    // renders, refits and unit changes; a page load, another radar or a new
    // rotation starts from the whole map. _applyView lays it over the
    // extents: the window it shows (mm) and pxPerX / pxPerY, the 1x px per
    // mm (_basePxPerX / _basePxPerY) times the zoom.
    this._view = null;
    this._viewAngle = null;
    this._basePxPerX = 0;
    this._basePxPerY = 0;
    // A pinch or a mouse pan in progress (see _startPinch, _startMousePan),
    // or { kind: 'pinched' } while fingers a pinch left behind are down.
    this._gesture = null;
    this._onPanMove = null;
    this._onPanEnd = null;
    // True when the YAML grid set the extents, which then never move. False
    // means they are fitted to the cone and the zones.
    this._gridFromConfig = false;
    // The step and unit of the last fit, { step, unit } (see _fittedStep).
    this._fitStep = null;
    // The map's unit (_displayUnit) comes from, in order: what this page's
    // viewer picked on the m / ft switch, the unit saved for the radar, the
    // YAML grid_units of a hand-written card, and Home Assistant's unit system.
    this._viewDisplayUnits = null;
    this._storedDisplayUnits = null;
    this._gridUnitsConfigured = false;
    // Cone defaults
    this.coneYMax = DEFAULT_CONE.yMax;
    this.coneFovDeg = DEFAULT_CONE.fovDeg;
    this.coneAngleDeg = DEFAULT_CONE.angleDeg;
    this.coneAngleDefault = DEFAULT_CONE.angleDeg;
    // Drawing/UI
    this.polyMaxPoints = POLYGON_MAX_POINTS;
    this.drawMode = DRAW_MODES.RECT;
    this.showModeMenu = false;
    this.isLocked = false;
    this._lastLockWarningTs = 0;
    this.showUndo = DEFAULT_SHOW_UNDO;
    this._undoSnapshot = null;
    this.inputUnits = 'mm';
    this.gridUnits = 'mm';
    this.inputUnitMultiplier = LENGTH_UNITS.mm;
    this.unitDisplay = false;
    this.unitLabelSize = DEFAULT_UNIT_LABEL_SIZE;
    this._gridCache = null;
    this._coneRingsCache = null;
    this._applyView();
  }

  /** The card's config UI, an `ha-device-picker` and a title field. */
  static getConfigElement() {
    return document.createElement(ZONE_MAP_EDITOR_TAG);
  }

  // Default stub config
  static getStubConfig(hass) {
    return {
      type: 'custom:apollo-radar-zone-map-card',
      // Deliberately no dark_mode key: an explicit key here would ship every
      // manually added card as a light-mode override, following the theme
      // is the point of this key being absent. Same for start_locked: absent
      // means the card locks itself once the radar has zones.
      show_undo: true,
      // Distance labels on, like the cards the Apollo mmWave dashboard makes.
      unit_display: true,
      // unit_label_size: 18,
      // optional, px label size override
      input_units: 'mm',
      // No grid_units and no grid: a card without them shows its map in Home
      // Assistant's unit system (or the unit saved for the radar) and fits it
      // to the radar's field of view. Seeding either here switched both off
      // for every card added from the picker.
      // A card dragged out of the Lovelace picker opened straight onto the
      // "device_id required" error while this was blank. Empty when no device
      // has registered LD2450 target sensors, which includes a radar whose
      // sensors are not in yet even though the editor's picker offers it.
      device_id: firstLd2450DeviceId(hass) ?? '',
      title: '',
      // Units support: 'mm', 'cm', 'm', 'in', 'ft' converts to millimeters internally
      // Zones can be managed in-card; you can optionally pre-seed a list here:
      // zones: [ { id: 1, name: 'Zone 1' } ],
      // An optional grid: { x_min, x_max, y_min, y_max } in grid_units fixes the
      // map's extents. Grid is y-down oriented, so y_min is top, y_max is bottom
      cone: {
        y_max: 6000,
        fov_deg: 120,
        // Only the slider's double-click reset target. What is drawn and what
        // the presence sensors evaluate is the store's rotation_deg (0 when it
        // was never set), which the slider writes.
        angle_deg: 0,
      },
    };
  }

  setConfig(config) {
    // Identity is the device id: it survives renames, cannot collide with
    // another device's slug, and is what the zone store is keyed by.
    if (!config.device_id) {
      throw new Error(
        'The Apollo Zone Map card needs a device_id. Set `device_id:` to the' +
          " Home Assistant device id of your radar (Settings > Devices, the id" +
          ' in the URL), or add the card from the Apollo mmWave dashboard,' +
          ' which fills it in for you.'
      );
    }

    this.config = config;
    const previousDeviceId = this.deviceId;
    this.deviceId = String(config.device_id);
    if (previousDeviceId !== this.deviceId) {
      // A live element can be pointed at another radar: a parent that
      // reassigns `config` on the same hui-card, or a wrapper card that calls
      // setConfig directly. (On supported Home Assistant the editor preview
      // and a regenerated view or section build a fresh element instead.)
      // Retargeting the writes without retargeting the reads would leave the
      // card drawing one radar and saving to another.
      this._resetDeviceState();
      // This viewer's Coverage toggle for the radar now shown.
      this._coverageOn = readStoredCoverage(this.deviceId);
    }
    // Absent, or anything but true, is the full card.
    const wasViewOnly = this._viewOnly;
    this._viewOnly = config.view_only === true;
    if (this._viewOnly && !wasViewOnly) {
      // The map alone has no handler left to end a rect or polygon in
      // progress, no Walk panel and no History, so all three end here. It
      // has no zoom buttons either, so it shows the whole map.
      this._resetDrawingState();
      this._exitWalk();
      this._closeHistory();
      this._resetView();
    }
    // Display only, so a user can call the card "Kitchen" and still share zone
    // data with the auto-generated dashboard. Deliberately NOT `this.title`:
    // that is a native HTMLElement accessor and would put a browser tooltip
    // over the whole card.
    this.cardTitle = config.title === undefined ? '' : String(config.title);

    const wasLockConfigured = this._lockConfigured;
    this._lockConfigured = config.start_locked !== undefined;
    if (this._lockConfigured) {
      this.isLocked = !!config.start_locked;
    } else if (wasLockConfigured) {
      // start_locked was removed (the editor's "auto" choice deletes it). The
      // forced value would otherwise stick: _applyAutoLock runs once, and it
      // already ran under the explicit key. render() below re-applies the last
      // payload, which re-derives the lock from the auto rule.
      this._autoLockApplied = false;
    }
    this.showUndo =
      config.show_undo === undefined ? DEFAULT_SHOW_UNDO : !!config.show_undo;
    
    this.inputUnits = this._normalizeUnit(config.input_units);
    // gridUnits always reads the YAML grid and cone values. Only a unit the
    // card knows also picks the map's unit; a misspelled one leaves that to
    // the saved unit or Home Assistant, as an absent one does.
    this.gridUnits = this._normalizeUnit(config.grid_units);
    this._gridUnitsConfigured = this._knownUnit(config.grid_units) !== null;
    this.inputUnitMultiplier = this._unitMultiplier(this.inputUnits);
    this.unitDisplay = !!config.unit_display;
    // Starts from the default every time, so a removed (or unusable) key does
    // not leave a live card at the size the previous config asked for.
    let unitLabelSize = DEFAULT_UNIT_LABEL_SIZE;
    if (config.unit_label_size !== undefined) {
      const s = Number(config.unit_label_size);
      if (Number.isFinite(s)) {
        // clamp between 8 and 24 px for sanity
        unitLabelSize = Math.max(8, Math.min(24, Math.round(s)));
      }
    }
    this.unitLabelSize = unitLabelSize;

    this.zoneConfig = Array.isArray(config.zones) ? [...config.zones] : [];
    this.trackedEntities = this.buildTrackedEntities(config);

    this._darkModeConfigured = config.dark_mode !== undefined;
    if (this._darkModeConfigured) {
      this.darkMode = !!config.dark_mode;
    } else if (this._hass) {
      // dark_mode was removed or was never set: fall back to whatever theme
      // hass is already carrying, instead of leaving darkMode at a stale value.
      this.darkMode = !!this._hass.themes?.darkMode;
    }

    this._applyGridConfig(config.grid);
    this._applyConeConfig(config.cone);
    // After the cone, which a fitted grid is drawn around. render() fits it
    // again over the zones and rotation of the last payload.
    this._refitGrid();

    this._invalidateGridCache();
    this._invalidateConeCache();
    this.render();
    // Opens the subscription for a card that was pointed at another radar, and
    // is a no-op for one whose device did not change or that has no hass yet.
    this._connectZones();
  }

  /**
   * Send one update_zone call and say whether it landed.
   *
   * Fire and forget told users a save had happened when it had not. The call is
   * rejected, and the card says it could not save, while the config entry is
   * reloading (the service is unregistered, so Home Assistant answers
   * not_found) and when the call fails the service schema. A radar that has
   * left the device registry is not a rejection: the backend logs a warning
   * and ignores the call, Home Assistant still answers success, and no new
   * payload arrives, so the edit stays on the canvas until the page reloads.
   * The success toast therefore means Home Assistant accepted the call, not
   * that the zone store took the change.
   *
   * `withInputUnits: false` leaves the card's input_units out, for a write
   * that says it changes nothing else (the m / ft switch).
   */
  async _saveZoneUpdate(payload, successMessage, { withInputUnits = true } = {}) {
    if (!this._hass) return false;
    // A target sensor with no length unit of its own is scaled by this unit,
    // here and in the presence sensors alike, so every zone and rotation
    // write carries it. Absent on the backend means millimeters, which is
    // also this card's default.
    const request = withInputUnits ? { ...payload, input_units: this.inputUnits } : { ...payload };
    try {
      // notifyOnError false: the catch below raises the card's own toast, and
      // HA's default would show a second one for the same rejection.
      await this._hass.callService('apollo_mmwave', 'update_zone', request, undefined, false);
    } catch (error) {
      const reason = error?.message ? String(error.message) : REJECTED_REASON;
      this._notify(`Could not save: ${reason}`);
      return false;
    }
    if (successMessage) this._notify(successMessage);
    return true;
  }

  /** Drop everything that belonged to the radar this card used to show. */
  _resetDeviceState() {
    this._disconnectZones();
    this._zoneConfigPayload = null;
    this._loadError = null;
    this._deviceLabel = null;
    this._usingSuggestedEntities = false;
    this.zones = [];
    this.trackedEntities = [];
    this.selectedZone = null;
    // The snapshot holds the OLD radar's geometry, and _performUndo writes it
    // under whatever device the card points at when the button is clicked. A
    // snapshot that outlives the retarget is the same cross-device overwrite as
    // a drag, just reached through Undo. render() disables the button from here.
    this._undoSnapshot = null;
    // Same for a polygon in progress: its vertices were placed on the old
    // radar's map, and Finish would save them under the new radar's zone.
    this._resetDrawingState();
    // Cosmetic, but both belong to the radar that was being shown: the slider
    // would hold the old angle and the lock the old state until the new radar
    // answers. Both are re-applied from the new config below and from the first
    // payload after it.
    this.coneAngleDeg = DEFAULT_CONE.angleDeg;
    this._invalidateConeCache();
    this.isLocked = false;
    this._autoLockApplied = false;
    // The saved unit is the old radar's, and so is the viewer's pick: a
    // switch flipped on one radar's map says nothing about another's.
    this._storedDisplayUnits = null;
    this._viewDisplayUnits = null;
    // The zones, their sensors and the device-wide flags are the old radar's
    // too, and the new one's first payload brings its own. A setting saved
    // on the old radar settles nothing on the new one's rows.
    this._zoneMeta = new Map();
    this._zoneSettingPending = new Map();
    this._paintedZoneKey = null;
    this._mirrorX = false;
    this._movementHistory = false;
    this._movementConfirm = false;
    this._toastAt = new Map();
    this._offlineShown = false;
    this._hatch = { light: null, dark: null };
    this._frameScale = 1;
    this._lastDrawAt = 0;
    // So are the positions behind the trails and the coverage paint. The
    // Coverage toggle is per radar, and setConfig reads the new one's.
    this._stopTrailTimer();
    this._trails.clear();
    this._trailReadings = new Map();
    this._coverage.clear();
    this._coverageOn = false;
    // The replay is the old radar's history, and an answer still on its way
    // is too (closing drops it).
    this._closeHistory();
    // Corners walked on the old radar's map are no corners on the new one.
    this._exitWalk();
    this._walkVisible = null;
    // The new radar's map starts whole.
    this._resetView();
  }

  set hass(hass) {
    const firstTime = !this._hass;
    // The automatic map unit reads Home Assistant's unit system off hass, so
    // the first hass, or a change of that setting, can change the unit.
    const unitBefore = this._displayUnit();
    // Who is viewing decides the m / ft switch's tooltips (whether a press
    // saves for everyone) and which controls can be used.
    const adminBefore = this._isAdmin();
    this._hass = hass;
    // The version check asks again on a new connection (version-check.ts).
    this._version?.update(hass);
    // hass is set repeatedly, several times a second while the LD2450 pushes
    // coordinates, so this only acts when the card is not overriding the
    // theme AND the theme actually changed. Anything else here would redraw
    // on every coordinate push instead of only on an actual theme flip.
    if (!this._darkModeConfigured) {
      const themeDark = !!hass?.themes?.darkMode;
      if (themeDark !== this.darkMode) {
        this.darkMode = themeDark;
        // The error screen has no canvas but carries the same "dark" class on
        // its container, so it repaints too. _loadError is only ever set by
        // _setLoadError, which renders, so this never renders before setConfig.
        if (this.canvas || this._loadError) {
          // The palette lives in the geometry caches' draw calls, not their
          // keys, so this is belt and suspenders with the rest of the card's
          // cache-then-render pattern (see setConfig). A full render() is what
          // actually repaints: it rebuilds the container element, whose
          // "dark" class is baked into the template at render time.
          this._invalidateGridCache();
          this._invalidateConeCache();
          this.render();
        }
      }
    }
    if (this._displayUnit() !== unitBefore) this._displayUnitChanged();
    if (this._isAdmin() !== adminBefore) {
      // The switch's tooltips, the controls only an administrator can use and
      // the zone list's settings all depend on who is viewing.
      this._renderUnitSwitch();
      this._renderAdminControls();
      this._renderZoneManager();
    }
    // Home Assistant assigns a new hass on every state change in the whole
    // instance, and the tracked targets and the zones' presence sensors are
    // the only parts of the picture drawn from it. Everything else (zone
    // shapes, rotation, mode, lock, theme, config) repaints itself when it
    // changes, so a push that moved no tracked target and flipped no zone
    // leaves the canvas as it is.
    if (this.canvas) {
      const trackedKey = this._trackedStatesKey();
      const zoneKey = this._zoneStatesKey();
      const trackedChanged = trackedKey !== this._paintedTrackedKey;
      if (trackedChanged || zoneKey !== this._paintedZoneKey) {
        this._paintedTrackedKey = trackedKey;
        this._paintedZoneKey = zoneKey;
        // Only a target move is sampled: a presence flip moved nobody.
        if (trackedChanged) this._onTargetsChanged(this._now());
        // A replay paints on its own timer and hides live dots and lit zones.
        if (!this._replayShowing()) this.drawGrid();
      }
    }
    // The help line names the units the target sensors show, which change
    // only when someone picks another one for a sensor.
    if (this._targetUnitsText() !== this._infoUnits) this._renderInfo();
    if (firstTime && this._hass) {
      // The store, not the entity registry, is where zones live now, so this
      // does not wait for a canvas or for any entity to exist.
      this._connectZones();
    }
  }

  /**
   * Everything _drawTrackedTargets reads from hass: each pair's entity ids,
   * the state strings of both and their units, since the same number in
   * another unit lands somewhere else. Two hass objects with the same key
   * paint the same targets.
   */
  _trackedStatesKey() {
    const states = this._hass?.states;
    return JSON.stringify(
      this.trackedEntities.map((pair) => [
        pair.x,
        states?.[pair.x]?.state,
        states?.[pair.x]?.attributes?.unit_of_measurement,
        pair.y,
        states?.[pair.y]?.state,
        states?.[pair.y]?.attributes?.unit_of_measurement,
      ]),
    );
  }

  /**
   * Everything a zone's look reads from hass: each zone's presence sensor,
   * its state and whether it is holding. Two hass objects with the same key
   * draw the same zones.
   */
  _zoneStatesKey() {
    const states = this._hass?.states;
    const parts = [];
    this._zoneMeta.forEach((_meta, id) => {
      const entityId = this._presenceEntityFor(id);
      if (!entityId) return;
      const stateObj = states?.[entityId];
      parts.push([id, entityId, stateObj?.state, stateObj?.attributes?.held === true]);
    });
    return JSON.stringify(parts);
  }

  /**
   * The presence sensor whose state lights zone `zoneId`: the one the payload
   * names, else the one the integration's naming points at in the registry,
   * which covers a 2.3.0 backend and a push that came in before the registry
   * had the entity. null when there is neither.
   */
  _presenceEntityFor(zoneId) {
    const presence = this._zoneMeta.get(Number(zoneId))?.presence;
    if (typeof presence === 'string' && presence) return presence;
    return fallbackPresenceId(this._hass?.entities, this.deviceId, zoneId);
  }

  /** The clock trails, the fade timer's frame gate and Walk run on. Toast
   *  throttles keep Date.now(), and history runs on the server's clock. */
  _now() {
    return performance.now();
  }

  /**
   * Whether a movement replay is on the map: the History panel is open and
   * its answer has come. While one is, its own timer (or one paint on a
   * pause, a scrub, a range change or the close) is the only painter, and
   * live target moves and presence flips leave the canvas alone.
   */
  _replayShowing() {
    return !!(this._history.open && this._history.series);
  }

  /**
   * The live targets moved (or appeared, or went). Everything that follows
   * them between paints samples here, once per move, before the repaint.
   */
  _onTargetsChanged(now) {
    // Only a target whose reading changed is sampled. Another target's move
    // says nothing new about a still one, and Coverage would count the still
    // one's cell again for every move the other made.
    const readings = new Map();
    this._currentTargets().forEach(({ slot, x, y }) => {
      const last = this._trailReadings.get(slot);
      if (last && last.x === x && last.y === y) {
        readings.set(slot, last);
        return;
      }
      this._trails.push(slot, now, x, y);
      readings.set(slot, { x, y, halfVanished: halfVanished(last, x, y) });
    });
    // A target gone right after one coordinate turned 0 left a point nobody
    // stood at, (0, old y) or (old x, 0), where its X and Y writes came in
    // two pushes. Taken back while it still waits for its other coordinate,
    // too new for Coverage to have counted, so no trail runs out to the line
    // x = 0 or y = 0 and no cell there is painted. A real reading with a 0
    // in it is followed by more readings and stays. gone() takes back the
    // (new X, old Y) of a target lost between its X write and its Y the
    // same way. Either way the trail ends there, and whatever the slot
    // reads next starts a new one.
    this._trailReadings.forEach((last, slot) => {
      if (readings.has(slot)) return;
      if (last.halfVanished) this._trails.retract(slot);
      this._trails.gone(slot, now);
    });
    this._trailReadings = readings;
    // Before the prune, so a position is counted before it ages out.
    this._feedCoverage(now);
    this._trails.prune(now);
    // The same states say whether the radar went offline or came back.
    this._renderOfflineNote();
    // Walk's hint and Corner here follow who is in view, and a zoomed
    // view follows the walker. The repaint after this shows both.
    this._renderWalkPanel();
    this._followWalker();
    this._kickTrailTimer();
  }

  /**
   * Count in the Coverage paint the trail samples that became final since
   * the last count: too old for the next push to replace (see
   * TrailBuffer.takeFinal), so the in-between point of an X write whose Y
   * lands up to TRAIL_PAIR_MS later never paints. A view-only card shows no
   * coverage, so it keeps none.
   */
  _feedCoverage(now) {
    if (this._viewOnly) return;
    this._trails.takeFinal(now).forEach(({ x, y }) => this._coverage.add(x, y));
  }

  /**
   * Keep the trails fading between hass pushes: one frame every
   * TRAIL_FRAME_MS while a frame would change a trail anyone can see (see
   * _trailCanChange). One timer at a time, and only on a card that is on
   * the page and has a canvas, so a card nobody can see schedules nothing.
   * A replay paints on its own timer and shows no live trails.
   */
  _kickTrailTimer() {
    if (this._replayShowing()) return;
    if (!this.isConnected || !this.canvas || this._trailTimer !== null) return;
    const now = this._now();
    if (!this._trails.hasTrail(now) || !this._trailCanChange(now)) return;
    this._trailTimer = setTimeout(() => this._onTrailFrame(), TRAIL_FRAME_MS);
  }

  /**
   * Whether a fade frame would change what the map shows: some slot has a
   * trail, two samples from the last TRAIL_MS, and either its target is
   * gone, so the trail has to fade out, or a sample lies farther from the
   * newest than its dot's halo reaches. A still target's reading changes
   * about once a second, and the trail its jitter leaves stays under its
   * own dot, where a frame would fade nothing anyone can see; the next hass
   * push paints it anyway. Positions are in canvas px, as drawn.
   */
  _trailCanChange(now) {
    const cutoff = now - TRAIL_MS;
    const halo = this._dotRadius() * 1.7;
    const toCanvas = ({ x, y }) => {
      const m = this._toMap(x, y);
      return { x: this.valueToPixels(m.x, 'x'), y: this.valueToPixels(m.y, 'y') };
    };
    return this._trails.slots().some((slot) => {
      const samples = this._trails.samples(slot);
      if (samples.length < 2 || samples[samples.length - 2].t <= cutoff) return false;
      if (!this._trailReadings.has(slot)) return true;
      const newest = toCanvas(samples[samples.length - 1]);
      return samples.some((sample) => {
        if (sample.t <= cutoff) return false;
        const at = toCanvas(sample);
        return Math.hypot(at.x - newest.x, at.y - newest.y) > halo;
      });
    });
  }

  /**
   * One fade frame: count what became final, drop what aged out, and paint,
   * unless a hass push painted less than a frame ago. Then it waits out the
   * rest of that frame, so a radar that pushes often is not painted twice as
   * often. The frame that paints the last of a trail away, or leaves only
   * what a still target's dot covers, is the last: the timer stops there.
   */
  _onTrailFrame() {
    this._trailTimer = null;
    const now = this._now();
    this._feedCoverage(now);
    this._trails.prune(now);
    if (this._replayShowing()) return;
    const since = now - this._lastDrawAt;
    if (since < TRAIL_FRAME_MS) {
      this._trailTimer = setTimeout(() => this._onTrailFrame(), TRAIL_FRAME_MS - since);
      return;
    }
    this.drawGrid();
    this._kickTrailTimer();
  }

  _stopTrailTimer() {
    if (this._trailTimer === null) return;
    clearTimeout(this._trailTimer);
    this._trailTimer = null;
  }

  /**
   * Whether the radar is offline, decided the way zone presence decides it:
   * the tracked pairs name some sensor, at least one of them has a state, and
   * every one that has a state is unavailable. Ids with no state at all (a
   * pair list naming sensors that never existed) say nothing either way.
   */
  _radarOffline() {
    const states = this._hass?.states;
    if (!states) return false;
    const ids = [];
    (this.trackedEntities || []).forEach((pair) => {
      [pair?.x, pair?.y].forEach((id) => {
        if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id);
      });
    });
    const present = ids.map((id) => states[id]).filter(Boolean);
    return present.length > 0 && present.every((stateObj) => stateObj.state === 'unavailable');
  }

  /**
   * Show "Radar offline" over the map while _radarOffline holds: the zones
   * grey out from their own unavailable states, and an empty map would
   * otherwise read as an empty room. Touches the DOM only when the answer
   * changes; the template draws the note from _offlineShown after a render.
   */
  _renderOfflineNote() {
    const offline = this._radarOffline();
    if (offline === this._offlineShown) return;
    this._offlineShown = offline;
    const note = this.shadowRoot?.getElementById('offlineNote');
    if (note) note.hidden = !offline;
  }

  /**
   * Each live target with a reading, in mm in the radar's own frame (unit
   * converted, not rotated): `{ slot, x, y }`, where `slot` is the pair's
   * index in the tracked list. A reading that is not a number, or the (0, 0)
   * an LD2450 reports for an empty slot, is no target.
   */
  _currentTargets() {
    const states = this._hass?.states;
    if (!states) return [];
    const targets = [];
    this.trackedEntities.forEach((pair, slot) => {
      if (!pair.x || !pair.y) return;
      const stateX = states[pair.x];
      const stateY = states[pair.y];
      if (!stateX || !stateY) return;
      const xRaw = parseFloat(stateX.state);
      const yRaw = parseFloat(stateY.state);
      if (Number.isNaN(xRaw) || Number.isNaN(yRaw)) return;
      if (Math.abs(xRaw) < 1e-6 && Math.abs(yRaw) < 1e-6) return;
      targets.push({
        slot,
        x: xRaw * this._readingUnitFactor(stateX),
        y: yRaw * this._readingUnitFactor(stateY),
      });
    });
    return targets;
  }

  /** A point in the radar's own frame, in the map frame the zones are drawn
   *  in: turned by the rotation, as the presence sensors turn it. */
  _toMap(x, y) {
    return rotateToMap(x, y, this.coneAngleDeg || 0);
  }

  /** Whether a map-frame point is inside one of this radar's ignore zones,
   *  where presence drops a target before any detect zone sees it. */
  _isIgnored(mx, my) {
    return (this.zones || []).some(
      (zone) =>
        this._zoneMeta.get(Number(zone.id))?.type === 'ignore' &&
        pointInZone(zone.shape, zone.data, mx, my),
    );
  }

  connectedCallback() {
    // Home Assistant detaches and re-attaches cards as views change, and
    // `disconnectedCallback` closed the subscription and dropped the window
    // and document listeners on the way out. The canvas keeps its own
    // listeners across a detach, so only the global ones come back here. A
    // view-only map never had any.
    this._connectZones();
    if (this.canvas && !this._onKeyDown && !this._viewOnly) this._attachGlobalListeners();
    // The page's version check, while the card is on the page.
    if (!this._version) {
      const version = watchVersion(() => {
        if (this._version === version) this._renderVersionNotice();
      });
      this._version = version;
      version.update(this._hass);
    }
    this._renderVersionNotice();
    // A trail that was fading when the card left the page fades on.
    this._kickTrailTimer();
  }

  _connectZones() {
    if (this._zoneConnection || !this._hass || !this.deviceId) return;
    // Tagged, so a payload from a connection this card has since replaced
    // (retargeted to another radar, or detached and re-attached) is dropped:
    // `_disconnectZones` can only dispose the old one after its own round trips
    // finish, and its initial read can land after the new radar's did.
    const connection = connectZones(this._hass, this.deviceId, {
      onConfig: (config) => {
        if (this._zoneConnection === connection) this._applyZoneConfig(config);
      },
      onError: (message) => {
        if (this._zoneConnection === connection) this._setLoadError(message);
      },
    });
    this._zoneConnection = connection;
  }

  _disconnectZones() {
    const pending = this._zoneConnection;
    this._zoneConnection = null;
    if (!pending) return;
    pending.then((dispose) => dispose()).catch(() => {
      // connectZones reports failures through onError; there is nothing left
      // to close if it never opened.
    });
  }

  _setLoadError(message) {
    if (this._loadError === message) return;
    this._loadError = message;
    // The replay goes with the map, and nothing plays on behind the error:
    // the map comes back live once the store answers again.
    this._closeHistory();
    // A full re-render, because the error state replaces the map: an empty
    // canvas looks exactly like a radar with no zones drawn yet.
    this.render();
  }

  /** Apply one payload from the zone API. */
  _applyZoneConfig(config) {
    if (!config) return;
    this._zoneConfigPayload = config;
    if (this._loadError !== null) {
      this._loadError = null;
      // Brings the canvas back, and render() re-applies the payload below.
      this.render();
      return;
    }
    this._applyZones(config);
    this._applyRotation(config);
    this._applyMirror(config);
    this._applyDisplayUnits(config);
    this._applyTrackedEntities(config);
    this._movementHistory = config.movement_history === true;
    this._deviceLabel = typeof config.label === 'string' ? config.label : null;
    this._renderTitle();
    this._applyAutoLock();
    this.renderZoneButtons();
    this._renderZoneManager();
    this._renderAdminControls();
    // After the zones, rotation and unit a fitted grid is drawn around.
    this._refitGrid();
    this._renderUnitSwitch();
    this._renderInfo();
    this.drawGrid();
  }

  /** Take the unit saved for the radar's map, or null for none. */
  _applyDisplayUnits(config) {
    const saved = config.display_units;
    this._storedDisplayUnits = DISPLAY_UNITS.includes(saved) ? saved : null;
  }

  _applyZones(config) {
    const zones = config.zones && typeof config.zones === 'object' ? config.zones : {};
    const ids = Object.keys(zones)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
      .sort((a, b) => a - b);

    this.zones = [];
    // Kept apart from this.zones, whose entries _upsertZone and _performUndo
    // rebuild as { id, shape, data }: a redraw must not lose a zone's type or
    // its presence sensor. Every stored zone gets an entry, geometry or not.
    this._zoneMeta = new Map();
    ids.forEach((id) => {
      const entry = zones[String(id)] || {};
      if (entry.shape && entry.shape !== 'none' && entry.data) {
        this.zones.push({ id, shape: entry.shape, data: entry.data });
      }
      // The backend sends only valid non-defaults, but a 2.3.0 backend sends
      // none of these, and an absent key is the default.
      const hold = entry.hold_s;
      this._zoneMeta.set(id, {
        presence: typeof entry.presence_entity_id === 'string' ? entry.presence_entity_id : null,
        type: entry.zone_type === 'ignore' ? 'ignore' : 'detect',
        holdS: Number.isInteger(hold) && hold >= 1 && hold <= 3600 ? hold : 0,
      });
    });

    // The zone list the buttons and the manager render. The store is
    // authoritative, but a zone written into the card's YAML has to survive a
    // radar that has never been drawn on.
    const seeded = Array.isArray(this.config?.zones) ? this.config.zones : [];
    const names = new Map();
    seeded.forEach((zone) => {
      const id = Number(zone?.id);
      if (Number.isFinite(id)) names.set(id, zone.name || `Zone ${id}`);
    });
    // A stored name wins. Geometry writes carry no name, so drawing on a
    // seeded zone stores it without one, and that must not swap the YAML name
    // for the fallback.
    ids.forEach((id) => {
      const stored = zones[String(id)]?.name;
      names.set(
        id,
        typeof stored === 'string' && stored.trim() ? stored : (names.get(id) ?? `Zone ${id}`)
      );
    });
    this.zoneConfig = Array.from(names.keys())
      .sort((a, b) => a - b)
      .map((id) => ({ id, name: names.get(id) }));
  }

  _applyRotation(config) {
    // The store is authoritative for rotation. A radar whose slider was never
    // moved has no stored value (null), and the presence sensors rotate its
    // targets by 0, so the card draws them at 0 too. Keeping the YAML
    // cone.angle_deg here instead drew targets in a frame the sensors do not
    // evaluate. That YAML angle is only where the slider's double-click reset
    // goes, and nothing is written to the store until the slider is used.
    const stored = typeof config.rotation_deg === 'number' ? config.rotation_deg : 0;
    const nextAngle = this._clampConeAngle(Math.round(stored));
    if (nextAngle !== this.coneAngleDeg) {
      this.coneAngleDeg = nextAngle;
      this._invalidateConeCache();
    }
    // Turned, the map shows the room another way round, and whatever was
    // zoomed in on is somewhere else: start from the whole map again. Held
    // against the rotation the view was set at, not the drawn one, which a
    // same-radar setConfig puts back to the YAML's for a moment.
    if (this._view && this._viewAngle !== this.coneAngleDeg) this._resetView();
    const angleSlider = this.shadowRoot.getElementById('coneAngleSlider');
    const angleLabel = this.shadowRoot.getElementById('coneAngleLabel');
    if (angleSlider) angleSlider.value = String(this.coneAngleDeg);
    if (angleLabel) angleLabel.textContent = `${this.coneAngleDeg}°`;
  }

  /** Take the flip the store holds for the radar's map (mirror_x). */
  _applyMirror(config) {
    this._setMirror(config?.mirror_x === true);
  }

  /**
   * Draw the map mirrored left to right, or not. Display only: zones are
   * saved, and presence tests targets, in the radar's own frame, and every
   * screen to mm conversion goes through valueToPixels and pixelsToValue.
   */
  _setMirror(on) {
    if (on !== this._mirrorX) {
      this._mirrorX = on;
      // Every x on the canvas moves. The extents do not, so nothing refits.
      this._invalidateGridCache();
      this._invalidateConeCache();
    }
    // On every call, the way _applyRotation sets the slider's value: render()
    // rebuilds both from the template. Flipped, +X is on the left, so the
    // slider runs right to left and drags the way the cone turns on screen.
    const angleSlider = this.shadowRoot?.getElementById('coneAngleSlider');
    if (angleSlider) angleSlider.style.direction = this._mirrorX ? 'rtl' : '';
    const toggle = this.shadowRoot?.getElementById('mirrorToggle');
    if (toggle) toggle.checked = this._mirrorX;
  }

  /** Take the store's answer. Nothing in the card edits the pair list, so
   *  there is never an unsaved edit here to protect. */
  _applyTrackedEntities(config) {
    const pairIds = () => JSON.stringify(this.trackedEntities.map((pair) => [pair?.x, pair?.y]));
    const pairsBefore = pairIds();
    const suggested = Array.isArray(config.suggested_entities)
      ? config.suggested_entities
      : [];
    if (config.entities === null || config.entities === undefined) {
      // Never configured: the radar's own targets are what is being drawn.
      this._usingSuggestedEntities = true;
      this.trackedEntities = suggested.map((pair) => ({ ...pair }));
    } else {
      // Including an empty list. The user cleared it and wants nothing tracked,
      // which is not the same thing as never having chosen.
      this._usingSuggestedEntities = false;
      this.trackedEntities = (Array.isArray(config.entities) ? config.entities : []).map(
        (pair) => ({ ...pair }),
      );
    }
    if (pairIds() !== pairsBefore) {
      // A trail belongs to a slot, a place in the pair list, and under
      // another list that place holds another target. Coverage keeps its
      // cells: those are places in the room.
      this._trails.clear();
      this._trailReadings = new Map();
    }
    this._renderEntityStatus();
    // Other pairs can be online when the old ones were not, and the other way.
    this._renderOfflineNote();
  }

  processEntityConfig(entityConfig) {
    if (!entityConfig || !Array.isArray(entityConfig)) {
      return [];
    }
    const entityPairs = {};
    entityConfig.forEach((item) => {
      const key = Object.keys(item)[0];
      const value = item[key];
      const match = key.match(/([xy])(\d+)/);
      if (match) {
        const axis = match[1];
        const index = match[2];
        if (!entityPairs[index]) entityPairs[index] = {};
        entityPairs[index][axis] = value;
      }
    });
    return Object.values(entityPairs).filter((pair) => pair.x && pair.y);
  }

  buildTrackedEntities(cfg) {
    // TODO(REVIEW_REPORT.md X41): direct_entity pairs are a placeholder the first store payload
    // replaces. Retire the key deliberately (release note, zone-mapper-card) or document it.
    if (cfg && cfg.direct_entity) {
      return this.processEntityConfig(cfg.entities);
    }
    return [];
  }

  /**
   * The heading: the card's own title, else the label the store holds.
   *
   * Assigned as text rather than interpolated into the template, because both
   * of those are strings a user typed.
   */
  _renderTitle() {
    const host = this.shadowRoot.getElementById('deviceTitle');
    if (!host) return;
    host.textContent = this.cardTitle || this._deviceLabel || '';
  }

  /**
   * Under the title, on the map alone and the error screen too: the page's
   * version notice (version-check.ts), Reload when this page runs older
   * cards than the Apollo mmWave Home Assistant runs, a restart when it
   * runs newer ones. A failed zone read after an update is often that, so
   * the error screen says it as well. One card on the page shows it, the
   * first that started watching. Touches the DOM only when the notice
   * changes; render() resets _versionShown with its empty host.
   */
  _renderVersionNotice() {
    const notice = this._version?.notice;
    if (notice === this._versionShown) return;
    const host = this.shadowRoot?.getElementById('versionNotice');
    if (!host) return;
    this._versionShown = notice;
    host.replaceChildren(...(notice ? [versionNoticeElement(notice)] : []));
  }

  /**
   * What the card shows when the store could not answer.
   *
   * Deliberately not a blank map: an empty canvas is indistinguishable from a
   * radar nobody has drawn on yet, and that ambiguity is what let the old card
   * save an empty configuration over a real one.
   */
  _errorTemplate() {
    return `
      <style>
        :host { display: block; padding: 16px; }
        .container { background: var(--card-background-color); border-radius: var(--ha-card-border-radius, 12px); box-shadow: var(--ha-card-box-shadow); padding: 16px; }
        .container.dark { background: ${COLOR.ui.darkContainerBackground}; color: ${COLOR.ui.darkContainerText}; }
        .device-title { font-size: 1.2em; font-weight: bold; margin-bottom: 8px; }
        .load-error { font-size: 14px; color: var(--error-color, ${COLOR.canvas.defaultTarget}); }
      </style>
      <div class="container ${this.darkMode ? 'dark' : ''}">
        <div class="device-title" id="deviceTitle"></div>
        <div id="versionNotice"></div>
        <div class="load-error" id="loadError"></div>
      </div>
    `;
  }

  /**
   * The canvas container's width, the same on the full card and the map
   * alone: as wide as the card, but never so wide that the map, at its
   * shape (--zm-aspect, which _sizeCanvas sets), is taller than the screen
   * less MAP_HEIGHT_ROOM_PX (or MAP_MIN_HEIGHT_PX, if that is more), and
   * centered when that holds it in. The width gives way, not the height, so
   * a meter stays as long across as it is down. A section of the usual
   * width only meets the cap on a short screen (a phone on its side); a
   * double-width section can meet it on a 1080p monitor. Two
   * declarations: a browser without dvh (the height the screen shows now,
   * past its toolbars) keeps the vh one.
   */
  _mapSizeRule() {
    const cap = (unit) =>
      `width: min(100%, calc(max(${MAP_MIN_HEIGHT_PX}px, 100${unit} - ${MAP_HEIGHT_ROOM_PX}px) * var(--zm-aspect, 1)));`;
    return `.canvas-container { ${cap('vh')} ${cap('dvh')} margin-inline: auto; }`;
  }

  _template() {
    // First: a load error is never a blank map, view-only or not.
    if (this._loadError) {
      return this._errorTemplate();
    }
    if (this._viewOnly) return this._viewOnlyTemplate();
    return `
      <style>
        :host { display: block; padding: 16px; }
        /* Theme tokens */
        :host {
          --zm-gap: 8px;
          --zm-radius: 10px;
          --zm-chip-bg: var(--secondary-background-color);
          --zm-chip-active: var(--primary-color);
          --zm-chip-color: var(--primary-text-color);
        }
        .container { background: var(--card-background-color); border-radius: var(--ha-card-border-radius, 12px); box-shadow: var(--ha-card-box-shadow); padding: 16px; }
        /* color-scheme: the native checkboxes, selects and sliders follow the
           card's dark_mode, which can differ from the page's theme. */
        .container.dark { background: ${COLOR.ui.darkContainerBackground}; color: ${COLOR.ui.darkContainerText}; color-scheme: dark; }
        .container input { accent-color: var(--primary-color); }
        .container.dark .canvas-container { border-color: ${COLOR.ui.darkCanvasBorder}; background: ${COLOR.ui.darkCanvasBackground}; }
        .canvas-container { position: relative; aspect-ratio: 1; border: 1px solid var(--divider-color); border-radius: var(--zm-radius); overflow: hidden; background: ${COLOR.ui.lightCanvasBackground}; isolation: isolate; container-type: size; }
        ${this._mapSizeRule()}
        canvas { width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
        /* A map that cannot be drawn on (locked, in Walk, or with no zone
           selected) lets a vertical swipe scroll the page. Not a pinch: two
           fingers zoom and pan the map (_pinchTouch). */
        canvas.pans { touch-action: pan-y; }
        /* A note over the map's top left corner. It takes no pointer, so a
           press on it still lands on the canvas. _placeMapNotes moves it
           below the x labels when they run along the top edge. */
        .map-note { position: absolute; top: var(--zm-note-top, 4px); left: 4px; z-index: 1; pointer-events: none; padding: 4px 8px; border-radius: 6px; font-size: 12px; line-height: 1.3; background: ${COLOR.ui.overlayButtonLightBg}; color: ${COLOR.ui.overlayButtonText}; }
        /* The same kind of note in the top right corner while a replay shows. */
        .map-note.replay-badge { left: auto; right: 4px; font-variant-numeric: tabular-nums; }
        .overlay-controls { position: absolute; bottom: 4px; display: flex; gap: 4px; z-index: 1; }
        .overlay-controls-left { left: 4px; flex-direction: column; align-items: flex-start; }
        .overlay-controls-right { right: 4px; }
        /* The zoom row, over the row of unit switch, Undo and Locked (32 px
           tall, 4 px from the edge, with a 4 px gap). */
        .overlay-controls-zoom { right: 4px; bottom: 40px; align-items: center; }
        #zoomControls button { font-size: 18px; width: 32px; height: 32px; min-width: 32px; padding: 0; }
        #zoomControls #btnZoomFit { width: auto; font-size: 13px; padding: 6px 8px; }
        .zoom-readout { padding: 4px 6px; border-radius: 6px; font-size: 12px; line-height: 1.3; font-variant-numeric: tabular-nums; background: ${COLOR.ui.overlayButtonLightBg}; color: ${COLOR.ui.overlayButtonText}; }
        .container.dark .zoom-readout { background: ${COLOR.ui.overlayButtonDarkBg}; }
        .overlay-controls button { background: ${COLOR.ui.overlayButtonLightBg}; color: ${COLOR.ui.overlayButtonText}; border: none; border-radius: 6px; font-size: 11px; line-height: 1; cursor: pointer; backdrop-filter: blur(4px); display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px; min-height: 32px; }
        #modeGroup button { font-size: 16px; width: 32px; height: 32px; min-width: 32px; min-height: 32px; padding: 0; }
        /* A fitted map can be shorter than wide, and on a phone shorter than the
           six polygon buttons. They wrap into a second column rather than run
           off the top, keeping clear of the menu button below them (32 px, the
           4 px gaps and the 4 px edge). */
        #modeGroup { flex-wrap: wrap; align-content: flex-start; max-height: calc(100cqh - 44px); }
        #btnModeMenu { font-size: 16px; width: 32px; height: 32px; min-width: 32px; min-height: 32px; padding: 0; }
        .overlay-controls button span { font-size: 13px; line-height: 1; }
        .overlay-controls button.lock-toggle { padding: 6px; }
        .overlay-controls button.undo-toggle { padding: 6px; font-size: 1.1em; line-height: 1; }
        .overlay-controls button.undo-toggle:disabled { opacity: 0.35; cursor: not-allowed; }
        .overlay-controls button.lock-toggle .icon { font-size: 1.35em; line-height: 1; }
        .overlay-controls button.lock-toggle.nudge { outline: 2px solid var(--warning-color, #ffa600); }
        .container.dark .overlay-controls button { background: ${COLOR.ui.overlayButtonDarkBg}; color: ${COLOR.ui.overlayButtonText}; border-color: ${COLOR.ui.overlayButtonDarkBorder}; }
        .overlay-controls button.active { outline: 2px solid ${COLOR.ui.overlayButtonActiveOutline}; }
        .overlay-controls button:disabled { opacity: 0.4; cursor: default; }
        /* The m / ft switch: two halves of one control, the shown unit filled. */
        .overlay-controls .unit-switch { display: inline-flex; }
        .overlay-controls .unit-switch button { min-width: 32px; font-size: 13px; padding: 6px 8px; }
        .overlay-controls .unit-switch button:first-child { border-radius: 6px 0 0 6px; }
        .overlay-controls .unit-switch button:last-child { border-radius: 0 6px 6px 0; }
        .overlay-controls .unit-switch button.active { background: var(--primary-color); outline: none; }
        .container.dark .overlay-controls .unit-switch button.active { background: ${COLOR.ui.darkPrimaryButton}; }
        .controls { margin: 12px 0; display: flex; gap: var(--zm-gap); flex-wrap: wrap; }
        #cone-controls { align-items: center; padding-top: 8px; }
        /* A locked slider takes no pointer, so a scroll that starts on it
           scrolls the page and a tap lands on the row (_watchLockedConeTries). */
        #cone-controls.locked input[type="range"] { pointer-events: none; }
        #cone-controls .cone-hint, #cone-controls .cone-lock-hint { flex-basis: 100%; font-size: 0.85em; opacity: 0.75; }
        #coneAngleSlider { flex: 1; min-width: 160px; }
        .map-options { display: flex; flex-direction: column; gap: 4px; padding: 4px 0 8px; }
        .map-option { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .map-option input { margin: 0; flex: none; }
        .map-option input:disabled { cursor: not-allowed; }
        .map-option input:disabled + span { opacity: 0.6; }
        .map-option-hint { font-size: 0.85em; opacity: 0.75; }
        /* Movement history and the question before it is turned off (and
           the one before Clear history). Flex columns like the options
           around them, so [hidden] needs saying. */
        .movement-option, .movement-confirm, .history-confirm { display: flex; flex-direction: column; gap: 4px; }
        .movement-option[hidden], .movement-option [hidden] { display: none; }
        .confirm-row { display: flex; flex-wrap: wrap; gap: var(--zm-gap); }
        button { padding: 8px 16px; background: var(--primary-color); color: ${COLOR.ui.primaryButtonText}; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
        .container.dark button { background: ${COLOR.ui.darkPrimaryButton}; }
        button:hover { opacity: 0.9; }
        button.zone-btn {
          padding: 6px 10px;
          border-radius: 999px;
          background: var(--zm-chip-bg);
          color: var(--zm-chip-color);
          border: 1px solid var(--divider-color);
        }
        button.zone-btn.active {
          background: var(--zm-chip-active);
          color: ${COLOR.ui.overlayButtonText};
          border-color: var(--zm-chip-active);
        }
        .container.dark button.zone-btn {
          background: ${COLOR.ui.darkZoneButtonBg};
          color: ${COLOR.ui.darkZoneButtonText};
          border-color: ${COLOR.ui.darkZoneButtonBorder};
        }
        .container.dark button.zone-btn.active {
          /* Match other buttons' dark color */
          background: ${COLOR.ui.darkZoneButtonActiveBg};
          color: ${COLOR.ui.overlayButtonText};
          border-color: ${COLOR.ui.darkZoneButtonActiveBorder};
        }
        /* Dimmed, not disabled, while the map is locked: a disabled button
           takes no tap, so a phone user would get no word of why. */
        button.zone-btn.locked-action { opacity: 0.5; cursor: not-allowed; }
        /* Walk's panel under the map, used on a phone carried around the
           room: Corner here across a row of its own, and every button a
           finger-sized 48 px. Its rows are flex, so [hidden] needs saying. */
        .walk-panel, .walk-confirm { display: flex; flex-direction: column; gap: var(--zm-gap); }
        .walk-panel { margin: 12px 0; }
        .walk-hint { font-size: 14px; }
        .walk-row { display: flex; gap: var(--zm-gap); }
        .walk-row button { flex: 1; min-height: 48px; }
        .walk-row button:disabled { opacity: 0.5; cursor: not-allowed; }
        .walk-panel[hidden], .walk-panel [hidden] { display: none; }
        /* The History chip, disabled while Walk is on. */
        #viewTools button:disabled { opacity: 0.5; cursor: not-allowed; }
        /* Walk's labeled chip, for a phone or a tablet, where 🚶 alone among
           the drawing modes is easy to miss. A mouse keeps the drawing modes'
           🚶 and this row stays as it was. */
        .walk-chip { display: none; }
        @media (pointer: coarse) { .walk-chip:not([hidden]) { display: inline-block; } }
        /* The History panel under the chips, whose rows wrap on a phone.
           The panel and its rows are flex, so [hidden] needs saying again. */
        .history-panel { display: flex; flex-direction: column; gap: var(--zm-gap); margin: 12px 0; }
        .history-panel[hidden], .history-panel [hidden] { display: none; }
        .history-head, .history-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--zm-gap); }
        .history-head { justify-content: space-between; }
        .history-title { font-weight: 600; }
        .history-panel button:disabled { opacity: 0.5; cursor: not-allowed; }
        /* The sparkline spans the scrubber under it, so a bar sits over the
           part of the range it counts. */
        .history-spark { height: 24px; }
        .history-spark svg { display: block; width: 100%; height: 100%; fill: var(--primary-color); }
        #historyScrub { width: 100%; margin: 0; }
        .history-time { font-variant-numeric: tabular-nums; }
        .history-status, .history-hint { font-size: 0.85em; opacity: 0.75; }
        .info { margin-top: 12px; font-size: 14px; color: var(--secondary-text-color); }
        .container.dark .info { color: ${COLOR.ui.infoDarkText}; }
        .container.dark .zone-item { background: ${COLOR.ui.zoneItemDarkBg}; color: ${COLOR.ui.zoneItemDarkText}; }
        .entity-selection { margin: 4px 0; padding: 0; background: transparent; border-radius: 0; }
        .entity-row { display: grid; grid-template-columns: auto 1fr 1fr auto; gap: 6px; align-items: center; margin: 6px 0; }
        .entity-row label { font-weight: 600; opacity: 0.95; }
        .entity-row select, .entity-row input { width: 100%; padding: 2px 6px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 12px; height: 28px; box-sizing: border-box; }
        .container.dark .entity-row select, .container.dark .entity-row input { background: ${COLOR.ui.darkSelectBg}; border-color: ${COLOR.ui.darkSelectBorder}; color: ${COLOR.ui.darkSelectText}; }
        /* A zone row's second line, under its name: the size, then the Type
           and Hold selects, each kept beside its label when the line wraps. */
        .entity-row .zone-meta { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 12px; }
        .entity-row .zone-meta label { font-weight: normal; }
        .entity-row .zone-meta select { width: auto; }
        .entity-row .zone-meta select:disabled { opacity: 0.6; cursor: not-allowed; }
        .zone-setting { display: inline-flex; align-items: center; gap: 4px; }
        .zone-size { opacity: 0.85; }
        .zone-settings-hint { font-size: 0.85em; opacity: 0.75; margin: 4px 0; }
        .device-title { font-size: 1.2em; font-weight: bold; margin-bottom: 8px; }
        .entity-controls { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
        .entity-controls select, .entity-controls input { width: 100%; }
        .pair-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
        .subtle { opacity: 0.85; font-size: 0.92em; }
        .config { margin-top: 0; }
        .config-header { display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: 4px 0; background: transparent; border-radius: 0; }
        .config-title { font-weight: 600; }
        .config-content { max-height: 0; overflow: hidden; transition: max-height 200ms ease, padding 200ms ease; padding: 0; }
        /* Only a cap for the open transition. Zone rows take two lines, so
           1200 px clipped the list at about a dozen zones. */
        .config-content.open { max-height: 5000px; padding: 4px 0; }
        .subsection-header { display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: 4px 0; background: transparent; border-radius: 0; margin-top: 4px; }
        .subsection-title { font-weight: 600; }
        @media (max-width: 520px) { .entity-row { grid-template-columns: 1fr; } }
      </style>
      <div class="container ${this.darkMode ? 'dark' : ''}">
        <div class="device-title" id="deviceTitle"></div>
        <div id="versionNotice"></div>
        <div class="canvas-container">
          <canvas id="zoneCanvas"></canvas>
          <div class="map-note" id="offlineNote" role="status" ${this._offlineShown ? '' : 'hidden'}>${OFFLINE_NOTE}</div>
          <!-- _renderHistoryTime shows it while a replay is on the map. -->
          <div class="map-note replay-badge" id="replayBadge" hidden></div>
          <div class="overlay-controls overlay-controls-left" id="overlayControlsLeft">
            <div id="modeGroup" style="display: ${this.showModeMenu ? 'flex' : 'none'}; flex-direction: column; gap: 4px;">
              <button id="btnPolyFinish" title="Finish polygon">✓</button>
              <button id="btnPolyUndo" title="Undo last point">↺</button>
              <!-- Administrators only: _renderAdminControls shows it. -->
              <button id="btnModeWalk" title="${WALK_BUTTON_TITLE}" aria-label="${WALK_BUTTON_TITLE}" style="display: none">🚶</button>
              <button id="btnModePolygon" title="Polygon">⬠</button>
              <button id="btnModeEllipse" title="Ellipse">◯</button>
              <button id="btnModeRect" title="Rectangle">▭</button>
            </div>
            <button id="btnModeMenu" title="Drawing modes">✎</button>
          </div>
          <div class="overlay-controls overlay-controls-right" id="overlayControlsRight">
            <div class="unit-switch" role="group" aria-label="Map units">
              <!-- _renderUnitSwitch sets the titles, which depend on the viewer. -->
              <button id="btnUnitM" data-unit="m" aria-pressed="false">m</button>
              <button id="btnUnitFt" data-unit="ft" aria-pressed="false">ft</button>
            </div>
            <button id="btnUndo" class="undo-toggle" title="Undo last zone change" disabled>↶</button>
            <button id="btnLock" class="lock-toggle" title="Lock drawing and cone rotation">🔓</button>
          </div>
          <!-- _renderZoomControls sets the readout, what is disabled and what Fit says. -->
          <div class="overlay-controls overlay-controls-zoom" id="zoomControls" role="group" aria-label="${ZOOM_GROUP_LABEL}">
            <span class="zoom-readout" id="zoomReadout" title="${ZOOM_PAN_HINT}" hidden></span>
            <button id="btnZoomOut" title="${ZOOM_OUT_LABEL}" aria-label="${ZOOM_OUT_LABEL}" disabled>−</button>
            <button id="btnZoomIn" title="${ZOOM_IN_TITLE}" aria-label="${ZOOM_IN_LABEL}">+</button>
            <button id="btnZoomFit" title="${ZOOM_FIT_ALL_LABEL}" aria-label="${ZOOM_FIT_ALL_LABEL}">${ZOOM_FIT}</button>
          </div>
        </div>
        ${this._walkPanelTemplate()}
        ${this._viewToolsTemplate()}
        ${this._historyPanelTemplate()}
        <div class="controls" id="zone-buttons">
        </div>
        <div class="config">
          <div id="btnConfigToggle" class="config-header">
            <span class="config-title">Configure</span>
            <span>${this.showConfig ? '▾' : '▸'}</span>
          </div>
          <div id="configContent" class="config-content ${this.showConfig ? 'open' : ''}">
            <div class="controls" id="cone-controls">
              <label for="coneAngleSlider">Cone rotation: </label>
              <input type="range" id="coneAngleSlider" min="-180" max="180" step="1" value="${this.coneAngleDeg}" />
              <span id="coneAngleLabel">${this.coneAngleDeg}°</span>
              <span id="coneMountHint" class="cone-hint">${CONE_MOUNT_HINT}</span>
              <span id="coneLockHint" class="cone-lock-hint" hidden>${CONE_LOCKED_HINT}</span>
            </div>
            <!-- _renderAdminControls sets what depends on the viewer. -->
            <div class="map-options" id="mapOptions">
              <label class="map-option" id="mirrorOption">
                <input type="checkbox" id="mirrorToggle" />
                <span>${MIRROR_LABEL}</span>
              </label>
              <div class="map-option-hint">${MIRROR_HINT}</div>
              <div class="map-option-hint" id="mapOptionsNote" hidden>${ADMIN_ONLY_NOTE}</div>
              <!-- Administrators only: _renderMovementOption shows it. -->
              <div class="movement-option" id="movementOption" hidden>
                <label class="map-option">
                  <input type="checkbox" id="movementToggle" />
                  <span>${MOVEMENT_LABEL}</span>
                </label>
                <div class="map-option-hint">${MOVEMENT_HINT}</div>
                <div class="movement-confirm" id="movementConfirm" hidden>
                  <div>${MOVEMENT_OFF_CONFIRM}</div>
                  <div class="confirm-row">
                    <button id="btnMovementOffYes">${MOVEMENT_OFF_CONFIRM_YES}</button>
                    <button id="btnMovementOffNo" class="zone-btn">${MOVEMENT_OFF_CONFIRM_NO}</button>
                  </div>
                </div>
              </div>
            </div>
            <!-- Read only. The radar's X/Y targets are resolved by the
                 integration, and the DIY override is the update_zone
                 service, not a second pair picker in here. -->
            <div class="info subtle" id="entityStatus"></div>
            <div class="subsection-header" id="toggleZones">
              <span class="subsection-title">Zones</span>
              <span id="caretZones">${this.showZones ? '▾' : '▸'}</span>
            </div>
            <div class="config-content ${this.showZones ? 'open' : ''}" id="sectionZones">
              <div class="entity-selection">
                <div class="entity-controls">
                  <div class="pair-actions">
                    <button id="btnAddZone" title="Add new zone">Add Zone</button>
                  </div>
                  <div id="zoneManager"></div>
                </div>
              </div>
            </div>
            <!-- Filled by _renderInfo, which a unit change or a refit calls
                 again without rebuilding the card. -->
            <div class="info" id="gridInfo"></div>
          </div>

        </div>
      </div>
    `;
  }

  /**
   * The map alone (view_only): the title, the version notice, the canvas
   * and the offline note, with no drawing tools, chips, Configure or zone
   * list. render() attaches no listeners to it, and the canvas leaves a
   * vertical swipe to the browser, so a phone scrolls past the card. The rules are _template's for
   * the same elements, but for the canvas's cursor and touch-action.
   */
  _viewOnlyTemplate() {
    return `
      <style>
        :host { display: block; padding: 16px; --zm-radius: 10px; }
        .container { background: var(--card-background-color); border-radius: var(--ha-card-border-radius, 12px); box-shadow: var(--ha-card-box-shadow); padding: 16px; }
        .container.dark { background: ${COLOR.ui.darkContainerBackground}; color: ${COLOR.ui.darkContainerText}; color-scheme: dark; }
        .container.dark .canvas-container { border-color: ${COLOR.ui.darkCanvasBorder}; background: ${COLOR.ui.darkCanvasBackground}; }
        .canvas-container { position: relative; aspect-ratio: 1; border: 1px solid var(--divider-color); border-radius: var(--zm-radius); overflow: hidden; background: ${COLOR.ui.lightCanvasBackground}; isolation: isolate; container-type: size; }
        ${this._mapSizeRule()}
        /* Nothing to draw, so no crosshair, and a vertical swipe scrolls the
           page. Two declarations: iOS 14 does not know pinch-zoom and keeps
           the first. */
        canvas { width: 100%; height: 100%; cursor: default; touch-action: pan-y; touch-action: pan-y pinch-zoom; }
        .map-note { position: absolute; top: var(--zm-note-top, 4px); left: 4px; z-index: 1; pointer-events: none; padding: 4px 8px; border-radius: 6px; font-size: 12px; line-height: 1.3; background: ${COLOR.ui.overlayButtonLightBg}; color: ${COLOR.ui.overlayButtonText}; }
        .device-title { font-size: 1.2em; font-weight: bold; margin-bottom: 8px; }
      </style>
      <div class="container ${this.darkMode ? 'dark' : ''}">
        <div class="device-title" id="deviceTitle"></div>
        <div id="versionNotice"></div>
        <div class="canvas-container">
          <canvas id="zoneCanvas"></canvas>
          <div class="map-note" id="offlineNote" role="status" ${this._offlineShown ? '' : 'hidden'}>${OFFLINE_NOTE}</div>
        </div>
      </div>
    `;
  }

  /**
   * The chips under the map that change only what this viewer sees: Coverage
   * and, while it is on, Clear coverage; History for an administrator on a
   * radar that keeps it. _renderCoverageControls and _renderHistoryChip set
   * their state from `this`.
   */
  _viewToolsTemplate() {
    return `
        <div class="controls" id="viewTools">
          <!-- Administrators only, out of Walk: _renderWalkChip shows it. -->
          <button id="btnWalkChip" class="zone-btn walk-chip" hidden><span aria-hidden="true">🚶</span> ${WALK_BUTTON_TITLE}</button>
          <button id="btnCoverage" class="zone-btn" aria-pressed="false">${COVERAGE_LABEL}</button>
          <button id="btnCoverageClear" class="zone-btn" hidden>${COVERAGE_CLEAR}</button>
          <button id="btnHistory" class="zone-btn" aria-expanded="false" aria-controls="historyPanel" hidden>${HISTORY_LABEL}</button>
        </div>
    `;
  }

  /**
   * The History panel, under the chips and hidden until History opens: the
   * title and Back to live, the range and Heatmap chips, the sparkline over
   * the scrubber, Play with the speed chips and the time, the status line,
   * the hint, and Clear history, which asks in place first. Built from
   * copy.ts constants and numbers only; _renderHistoryPanel sets its state.
   */
  _historyPanelTemplate() {
    const ranges = HISTORY_RANGES.map(
      ({ hours, label }) =>
        `<button class="zone-btn" data-hours="${hours}" aria-pressed="false">${label}</button>`,
    ).join('');
    const speeds = HISTORY_SPEEDS.map(
      ({ speed, label }) =>
        `<button class="zone-btn" data-speed="${speed}" aria-pressed="false">${label}</button>`,
    ).join('');
    return `
        <div class="history-panel" id="historyPanel" hidden>
          <div class="history-head">
            <span class="history-title">${HISTORY_TITLE}</span>
            <button id="btnHistoryLive" class="zone-btn">${HISTORY_LIVE}</button>
          </div>
          <div class="history-row" id="historyRanges">
            ${ranges}
            <button id="btnHistoryHeatmap" class="zone-btn" aria-pressed="false">${HISTORY_HEATMAP}</button>
          </div>
          <div class="history-spark" id="historySpark" aria-hidden="true"></div>
          <input type="range" id="historyScrub" min="0" max="3600" step="1" value="0" aria-label="${HISTORY_SCRUB_LABEL}" disabled />
          <div class="history-row">
            <button id="btnHistoryPlay" disabled>${HISTORY_PLAY}</button>
            <span class="history-row" id="historySpeeds">${speeds}</span>
            <span class="history-time" id="historyTime"></span>
          </div>
          <div class="history-status" id="historyStatus" role="status"></div>
          <div class="history-hint">${HISTORY_HINT}</div>
          <div class="history-row">
            <button id="btnHistoryClear" class="zone-btn">${HISTORY_CLEAR}</button>
          </div>
          <div class="history-confirm" id="historyClearConfirm" hidden>
            <div>${HISTORY_CLEAR_CONFIRM}</div>
            <div class="confirm-row">
              <button id="btnHistoryClearYes">${HISTORY_CLEAR_YES}</button>
              <button id="btnHistoryClearNo" class="zone-btn">${HISTORY_CLEAR_NO}</button>
            </div>
          </div>
        </div>
    `;
  }

  render() {
    // TODO(REVIEW_REPORT.md X47): with a cached payload, chips, manager, status and drawGrid run
    // twice. Skipping the first pass changes selection on a same-device setConfig; decide first.
    // The old template's lock closure would otherwise set a cursor and a
    // slider that are about to go, from _applyAutoLock, on a template that
    // has no Locked button to make a new one.
    this._updateLockVisual = null;
    // The Walk panel comes back hidden, to be laid out again.
    this._walkVisible = null;
    // Started again at the end, once the new canvas has its picture.
    this._stopTrailTimer();
    this._detachGlobalListeners();
    this.shadowRoot.innerHTML = this._template();
    this._renderTitle();
    // The new template's host is empty, whatever the old one showed.
    this._versionShown = undefined;
    this._renderVersionNotice();

    if (this._loadError) {
      // Assigned as text, not interpolated into the markup: the message quotes
      // a device id that came in from the card's configuration.
      const host = this.shadowRoot.getElementById('loadError');
      if (host) host.textContent = this._loadError;
      this.canvas = null;
      this.ctx = null;
      return;
    }

    this.renderZoneButtons();
    this.setupCanvas();
    // The map alone takes no input, so a phone scrolls past it. The renderers
    // below find no host for what its template leaves out and return.
    if (!this._viewOnly) this.attachEventListeners();
    this._renderEntityStatus();
    this._renderZoneManager();
    this._renderUnitSwitch();
    this._renderInfo();
    if (this._zoneConfigPayload) {
      // A render throws the old DOM away, so the last payload the store sent
      // has to be laid back over the new one.
      this._applyZoneConfig(this._zoneConfigPayload);
    }
    // The rest of the DOM state lives on `this`, which outlives a render.
    this._renderAdminControls();
    this._renderCoverageControls();
    this._renderWalkPanel();
    this._renderHistoryPanel();
    this._updateCanvasTouchMode();
    // A trail fading when the theme flipped keeps fading on the new canvas.
    this._kickTrailTimer();
  }

  renderZoneButtons() {
    const container = this.shadowRoot.getElementById('zone-buttons');
    if (!container) return;
    container.innerHTML = '';
    if (!this.zoneConfig || this.zoneConfig.length === 0) {
      this._setSelectedZone(null);
    }
    this.zoneConfig.forEach((zone) => {
      const btn = document.createElement('button');
      btn.className = 'zone-btn';
      btn.dataset.zoneId = zone.id;
      btn.textContent = this._zoneLabel(zone.id);
      btn.addEventListener('click', () => this._setSelectedZone(zone.id));
      btn.addEventListener('dblclick', (e) => {
        e.preventDefault();
        // One quick gesture, which a stray double tap on a phone makes too,
        // so the lock guards it like drawing.
        if (this.isLocked) {
          this._remindLocked(CLEAR_LOCKED_TOAST);
          return;
        }
        this._clearZone(zone.id, true);
      });
      container.appendChild(btn);
    });

    const clearBtn = document.createElement('button');
    clearBtn.id = 'clearBtn';
    clearBtn.className = 'zone-btn clear-all';
    clearBtn.textContent = 'Clear All Zones';
    this._renderClearAllLock(clearBtn);
    container.appendChild(clearBtn);

    const firstZone = container.querySelector('.zone-btn[data-zone-id]');
    if (this.selectedZone !== null && this.selectedZone !== undefined) {
      const existingSelection = container.querySelector(
        `.zone-btn[data-zone-id="${this.selectedZone}"]`,
      );
      if (existingSelection) {
        this._setSelectedZone(this.selectedZone);
        return;
      }
    }
    if (firstZone) {
      this._setSelectedZone(Number(firstZone.dataset.zoneId));
    }
  }

  /** A target dot's radius in backing px: it follows the card's width,
   *  never below 10. Its halo reaches 1.7 times as far. */
  _dotRadius() {
    return Math.max(10, Math.round(9 * (this._frameScale || 1)));
  }

  /**
   * One target dot at map-frame mm (x, y), with `label` (its number) on it.
   * A dot is a filled core with a soft halo, so it reads over a lit zone; a
   * target presence ignores (`hollow`) is a grey ring with a grey number
   * instead, the number outlined in the canvas color: the ring has no fill,
   * and the target's own grey trail runs under it. The radius is
   * _dotRadius().
   */
  drawCurrentPosition(
    x,
    y,
    color = COLOR.canvas.defaultTarget,
    label = null,
    { hollow = false, numberColor = '#000000' } = {},
  ) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const pixelX = this.valueToPixels(x, 'x');
    const pixelY = this.valueToPixels(y, 'y');
    if (pixelX < 0 || pixelX > this.canvas.width || pixelY < 0 || pixelY > this.canvas.height) {
      return;
    }
    const r = this._dotRadius();
    let textColor = numberColor;
    ctx.save();
    if (hollow) {
      textColor = this.darkMode ? COLOR.canvas.ignoredTargetDark : COLOR.canvas.ignoredTargetLight;
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, r, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, r * 1.7, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = COLOR.canvas.targetStroke;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (label !== null && label !== undefined && label !== '') {
      ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (hollow) {
        // A fan's sweep keeps the trail inside the ring, where it scribbled
        // through a number in the same grey.
        ctx.strokeStyle = this.darkMode
          ? COLOR.ui.darkCanvasBackground
          : COLOR.ui.lightCanvasBackground;
        ctx.lineWidth = 4 * (this._frameScale || 1);
        ctx.lineJoin = 'round';
        ctx.strokeText(String(label), pixelX, pixelY);
      }
      ctx.fillStyle = textColor;
      ctx.fillText(String(label), pixelX, pixelY);
    }
    ctx.restore();
  }

  attachEventListeners() {
    this._attachZoneListEvents();
    this._attachCanvasEvents();
    this._attachZoomControls();
    this._attachConeControls();
    this._attachDrawingModeControls();
    this._attachUnitSwitch();
    this._attachConfigEvents();
    this._attachMapOptions();
    this._attachWalkPanel();
    this._attachViewTools();
    this._attachHistoryPanel();
  }

  _attachViewTools() {
    const walk = this.shadowRoot.getElementById('btnWalkChip');
    if (walk) walk.addEventListener('click', () => this._enterWalk());
    const coverage = this.shadowRoot.getElementById('btnCoverage');
    if (coverage) coverage.addEventListener('click', () => this._setCoverage(!this._coverageOn));
    const clear = this.shadowRoot.getElementById('btnCoverageClear');
    if (clear) clear.addEventListener('click', () => this._clearCoverage());
    const history = this.shadowRoot.getElementById('btnHistory');
    if (history) {
      history.addEventListener('click', () => {
        if (this._history.open) this._closeHistory();
        else this._openHistory();
      });
    }
  }

  _attachHistoryPanel() {
    const root = this.shadowRoot;
    const on = (id, handler) => {
      const element = root.getElementById(id);
      if (element) element.addEventListener('click', handler);
    };
    on('btnHistoryLive', () => this._closeHistory());
    root.querySelectorAll('#historyPanel [data-hours]').forEach((button) => {
      button.addEventListener('click', () => this._setHistoryRange(Number(button.dataset.hours)));
    });
    on('btnHistoryHeatmap', () => this._setHistoryHeatmap(!this._history.heatmap));
    root.querySelectorAll('#historyPanel [data-speed]').forEach((button) => {
      button.addEventListener('click', () => this._setHistorySpeed(Number(button.dataset.speed)));
    });
    on('btnHistoryPlay', () => {
      if (this._history.playing) this._pauseHistory();
      else this._playHistory();
    });
    const scrub = root.getElementById('historyScrub');
    if (scrub) scrub.addEventListener('input', () => this._scrubHistory(Number(scrub.value)));
    on('btnHistoryClear', () => {
      this._history.confirmClear = true;
      this._renderHistoryPanel();
    });
    on('btnHistoryClearYes', () => this._clearHistory());
    on('btnHistoryClearNo', () => {
      this._history.confirmClear = false;
      this._renderHistoryPanel();
    });
  }

  /**
   * Paint where live targets have been, or stop, for this viewer only, and
   * remember it for the radar in this browser. Positions are counted either
   * way, so turning it on shows everything since the page opened.
   */
  _setCoverage(on) {
    this._coverageOn = on;
    writeStoredCoverage(this.deviceId, on);
    this._renderCoverageControls();
    this.drawGrid();
  }

  _clearCoverage() {
    this._coverage.clear();
    this.drawGrid();
  }

  /** The Coverage chip pressed or not, and Clear coverage only while on. */
  _renderCoverageControls() {
    const button = this.shadowRoot?.getElementById('btnCoverage');
    if (button) {
      button.classList.toggle('active', this._coverageOn);
      button.setAttribute('aria-pressed', this._coverageOn ? 'true' : 'false');
      button.title = COVERAGE_TITLE;
    }
    const clear = this.shadowRoot?.getElementById('btnCoverageClear');
    if (clear) clear.hidden = !this._coverageOn;
  }

  _attachUnitSwitch() {
    ['btnUnitM', 'btnUnitFt'].forEach((id) => {
      const button = this.shadowRoot.getElementById(id);
      if (!button) return;
      button.addEventListener('click', () => this._chooseDisplayUnit(button.dataset.unit));
    });
  }

  /**
   * The m / ft switch. The unit is saved per radar, so everyone who opens this
   * radar's map sees the one an administrator picked. update_zone is
   * admin-only, so for anyone else the switch changes this page's view and
   * saves nothing: asking would only earn them a "Could not save" toast for a
   * switch that visibly did what they asked. The pick stays this page's from
   * then on, for an administrator too, so a later save from another page does
   * not flip the map under someone who just chose.
   */
  _chooseDisplayUnit(unit) {
    if (!DISPLAY_UNITS.includes(unit)) return;
    if (this._unitFamily(this._displayUnit()) === unit) return;
    this._viewDisplayUnits = unit;
    this._displayUnitChanged();
    if (this._isAdmin()) {
      // No toast on success: the map changing is the feedback. The switch
      // says it shows the map in a unit, so it saves that and nothing else:
      // input_units would also rescale presence for sensors without a unit.
      this._saveZoneUpdate({ device_id: this.deviceId, display_units: unit }, null, {
        withInputUnits: false,
      });
    }
  }

  /** Whether this page's viewer can save, as update_zone is admin-only. */
  _isAdmin() {
    return !!this._hass?.user?.is_admin;
  }

  /**
   * The controls whose state depends on who is viewing. The template is built
   * before the first hass, and the user behind hass can change, so this runs
   * after every render, every payload and every change of viewer.
   */
  _renderAdminControls() {
    const admin = this._isAdmin();
    // The flip stays visible, so a viewer can see the map is flipped on
    // purpose, but update_zone is admin-only and would refuse the save. A
    // disabled checkbox's title never reaches touch or keyboard users, so
    // the note under it says the same.
    const mirror = this.shadowRoot?.getElementById('mirrorToggle');
    if (mirror) {
      mirror.disabled = !admin;
      mirror.title = admin ? '' : ADMIN_ONLY_TITLE;
    }
    const mirrorOption = this.shadowRoot?.getElementById('mirrorOption');
    if (mirrorOption) mirrorOption.title = admin ? '' : ADMIN_ONLY_TITLE;
    const note = this.shadowRoot?.getElementById('mapOptionsNote');
    if (note) note.hidden = admin;
    // Walk saves a zone, so it is an administrator's, and like drawing it
    // needs the map unlocked. The button stays for a locked map, where a
    // press says how to unlock.
    const walk = this.shadowRoot?.getElementById('btnModeWalk');
    if (walk) walk.style.display = admin ? '' : 'none';
    if (!admin || this.isLocked) this._exitWalk();
    this._renderWalkChip();
    // Movement history is an administrator's, on a radar that keeps it.
    // Anyone else never sees its option or History, and the question before
    // turning it off has nothing left to ask once it is off.
    if (!admin || !this._movementHistory) {
      this._closeHistory();
      this._movementConfirm = false;
    }
    this._renderMovementOption();
    this._renderHistoryChip();
  }

  /** Configure's Movement history option: shown to administrators only,
   *  ticked as the store holds it, and asking while _movementConfirm. */
  _renderMovementOption() {
    const option = this.shadowRoot?.getElementById('movementOption');
    if (option) option.hidden = !this._isAdmin();
    const toggle = this.shadowRoot?.getElementById('movementToggle');
    if (toggle) toggle.checked = this._movementHistory;
    const confirm = this.shadowRoot?.getElementById('movementConfirm');
    if (confirm) confirm.hidden = !this._movementConfirm;
  }

  /**
   * The Movement history box was ticked or unticked by an administrator.
   * Ticked saves it at once. Unticked deletes the radar's history, so it
   * asks first, in place, with the box left ticked until the answer.
   */
  async _chooseMovementHistory(on) {
    if (!this._isAdmin()) {
      // A hidden checkbox gets no change event, but nothing that still
      // reaches it (a screen reader, say) saves.
      this._renderMovementOption();
      return;
    }
    this._movementConfirm = !on;
    this._renderMovementOption();
    // Ticked, it is being saved; unticked, the store keeps it until the
    // answer. Either way the box stays ticked for now.
    const toggle = this.shadowRoot?.getElementById('movementToggle');
    if (toggle) toggle.checked = true;
    if (!on) return;
    // A device-wide setting, so input_units, which rescales presence for
    // sensors without a unit, stays out of it, as with the flip. The save's
    // echo shows the History chip.
    const saved = await this._saveZoneUpdate(
      { device_id: this.deviceId, movement_history: true },
      MOVEMENT_ON_TOAST,
      { withInputUnits: false },
    );
    // Back to what the store holds, which the refused save did not change.
    if (!saved) this._renderMovementOption();
  }

  /** The answer to the question: turn movement history off, which deletes
   *  this radar's history. The save's echo closes History. */
  async _turnMovementHistoryOff() {
    this._movementConfirm = false;
    this._renderMovementOption();
    if (!this._isAdmin()) return;
    const toggle = this.shadowRoot?.getElementById('movementToggle');
    if (toggle) toggle.checked = false;
    const saved = await this._saveZoneUpdate(
      { device_id: this.deviceId, movement_history: false },
      MOVEMENT_OFF_TOAST,
      { withInputUnits: false },
    );
    if (!saved) this._renderMovementOption();
  }

  _attachWalkPanel() {
    const on = (id, handler) => {
      const button = this.shadowRoot.getElementById(id);
      if (button) button.addEventListener('click', handler);
    };
    on('btnWalkCorner', () => this._walkCorner());
    on('btnWalkUndo', () => this._walkUndo());
    on('btnWalkFinish', () => this._walkFinish());
    on('btnWalkCancel', () => this._walkCancel());
    on('btnWalkCancelYes', () => this._exitWalk());
    on('btnWalkCancelNo', () => {
      this._walkConfirmCancel = false;
      this._renderWalkPanel();
    });
  }

  /**
   * Walk's panel, right under the map and hidden until Walk is on: the hint,
   * read out as it changes, Corner here on a row of its own, then Undo
   * corner, Finish and Cancel, which swap for Cancel's question while it
   * asks. _renderWalkPanel sets them from `this`.
   */
  _walkPanelTemplate() {
    return `
        <div class="walk-panel" id="walkPanel" hidden>
          <div class="walk-hint" id="walkHint" aria-live="polite"></div>
          <div class="walk-row">
            <button id="btnWalkCorner">${WALK_CORNER}</button>
          </div>
          <div class="walk-row" id="walkActions">
            <button id="btnWalkUndo">${WALK_UNDO}</button>
            <button id="btnWalkFinish">${WALK_FINISH}</button>
            <button id="btnWalkCancel" class="zone-btn">${WALK_CANCEL}</button>
          </div>
          <div class="walk-confirm" id="walkConfirm" hidden>
            <div class="walk-hint">${WALK_CANCEL_CONFIRM}</div>
            <div class="walk-row">
              <button id="btnWalkCancelYes">${WALK_CANCEL_YES}</button>
              <button id="btnWalkCancelNo" class="zone-btn">${WALK_CANCEL_NO}</button>
            </div>
          </div>
        </div>
    `;
  }

  /**
   * Lay Walk's panel out from the state on `this`: shown while Walk is on,
   * with the hint for who is in view and how many corners are down; Corner
   * here only with exactly one person in view and room for another corner,
   * Undo corner with a corner to undo, Finish with two; Cancel's question in
   * place of those three while it asks. It runs on every target move, so it
   * touches the DOM only when one of those changed (_walkVisible), and
   * render() lays a rebuilt panel out again.
   */
  _renderWalkPanel() {
    const panel = this.shadowRoot?.getElementById('walkPanel');
    if (!panel) return;
    if (!this._walk) {
      if (this._walkVisible !== null) {
        panel.hidden = true;
        this._walkVisible = null;
      }
      return;
    }
    const visible = this._walkTargets().length;
    const corners = this._walk.corners.length;
    const confirm = this._walkConfirmCancel;
    const shown = this._walkVisible;
    const same =
      shown && shown.visible === visible && shown.corners === corners && shown.confirm === confirm;
    if (same) return;
    this._walkVisible = { visible, corners, confirm };
    panel.hidden = false;
    const full = corners >= this.polyMaxPoints;
    let hint;
    if (full) hint = WALK_HINT_FULL;
    else if (visible === 0) hint = WALK_HINT_NOBODY;
    else if (visible >= 2) hint = WALK_HINT_CROWD;
    else if (corners === 0) hint = WALK_HINT_START;
    else hint = walkHintNext(corners);
    const set = (id, apply) => {
      const element = this.shadowRoot.getElementById(id);
      if (element) apply(element);
    };
    set('walkHint', (element) => {
      element.textContent = hint;
    });
    set('btnWalkCorner', (element) => {
      element.disabled = full || visible !== 1;
    });
    set('btnWalkUndo', (element) => {
      element.disabled = corners === 0;
    });
    set('btnWalkFinish', (element) => {
      element.disabled = corners < 2;
    });
    set('walkActions', (element) => {
      element.hidden = confirm;
    });
    set('walkConfirm', (element) => {
      element.hidden = !confirm;
    });
  }

  /**
   * Start marking a zone's corners by walking to them, as an administrator
   * on an unlocked map. History closes first: its replay would hide the dot
   * of the person walking. The canvas pans in Walk, so a phone carried
   * around the room still scrolls the page.
   */
  _enterWalk() {
    if (this._viewOnly || !this._isAdmin() || this._walk) return;
    if (this.isLocked) {
      this._remindLocked(DRAW_LOCKED_TOAST);
      return;
    }
    this._closeHistory();
    this._modeBeforeWalk = this.drawMode;
    this._walk = { corners: [] };
    this._walkConfirmCancel = false;
    // Ends any shape in progress, shows the panel and lets the canvas pan.
    this._setDrawMode(DRAW_MODES.WALK);
    // A zoomed view goes to the walker now, not at their next step.
    this._followWalker({ draw: true });
  }

  /** Leave Walk, back to the drawing mode it came from, and drop the
   *  corners without asking. */
  _exitWalk() {
    if (this.drawMode !== DRAW_MODES.WALK) return;
    const mode = this._modeBeforeWalk;
    this._setDrawMode(mode && mode !== DRAW_MODES.WALK ? mode : DRAW_MODES.RECT);
  }

  /** The live targets Walk can mark a corner at: every target outside the
   *  ignore zones, where presence does not see them either. */
  _walkTargets() {
    return this._currentTargets().filter(({ x, y }) => {
      const m = this._toMap(x, y);
      return !this._isIgnored(m.x, m.y);
    });
  }

  /**
   * Corner here: mark where the one person in view stands, as their
   * time-weighted position over the last WALK_AVERAGE_MS, so the steps up to
   * the corner weigh little. Once they have stood still for so long that
   * every sample aged out, their current reading. Kept in the radar's own
   * frame, so a rotation changed mid-walk turns the corners with the map. A
   * corner too close to the last one, or back at the first once three are
   * down, is refused and the corners stay.
   */
  _walkCorner() {
    if (!this._walk) return;
    const corners = this._walk.corners;
    const targets = this._walkTargets();
    if (targets.length !== 1 || corners.length >= this.polyMaxPoints) {
      // The press beat a push: the panel says why now.
      this._renderWalkPanel();
      return;
    }
    const [target] = targets;
    const at = this._trails.average(target.slot, this._now(), WALK_AVERAGE_MS) || target;
    const corner = { x: at.x, y: at.y };
    const near = (other) =>
      Math.hypot(corner.x - other.x, corner.y - other.y) < WALK_MIN_CORNER_GAP_MM;
    if (corners.length > 0 && near(corners[corners.length - 1])) {
      this._notifyThrottled(WALK_TOO_CLOSE_TOAST);
      return;
    }
    // Back where the walk started is a closed shape, which Finish saves; a
    // corner there would only repeat the first.
    if (corners.length >= 3 && near(corners[0])) {
      this._notifyThrottled(WALK_CLOSED_TOAST);
      return;
    }
    corners.push(corner);
    // Still marking, so a question Cancel was asking is answered.
    this._walkConfirmCancel = false;
    this._renderWalkPanel();
    this.drawGrid();
  }

  _walkUndo() {
    if (!this._walk || this._walk.corners.length === 0) return;
    this._walk.corners.pop();
    this._walkConfirmCancel = false;
    this._renderWalkPanel();
    this.drawGrid();
  }

  /** Cancel: with two or more corners down, which took a walk around the
   *  room to mark, ask first, in the panel. */
  _walkCancel() {
    if (!this._walk) return;
    if (this._walk.corners.length >= 2) {
      this._walkConfirmCancel = true;
      this._renderWalkPanel();
      return;
    }
    this._exitWalk();
  }

  /**
   * Finish: save the walked corners as the selected zone's shape, through
   * the same commit a drawn rect or polygon takes (an undo snapshot, the
   * shape on the map at once, the save and its "<label> saved"). Two corners
   * are a rectangle, three or more a polygon. With no zone selected, or a
   * shape too thin to use, the walk goes on with its corners.
   */
  _walkFinish() {
    if (!this._walk || this._walk.corners.length < 2) return;
    const zoneId = this.selectedZone;
    if (zoneId === null || zoneId === undefined) {
      this._notifyThrottled(SELECT_ZONE_TOAST);
      return;
    }
    const mapCorners = this._walk.corners.map(({ x, y }) => this._toMap(x, y));
    const clamp = (p) => ({
      x: this._clampAndRound(p.x, this.xMin, this.xMax),
      y: this._clampAndRound(p.y, this.yMin, this.yMax),
    });
    const result = walkShape(mapCorners, clamp, this.polyMaxPoints);
    if (result.error) {
      this._notifyThrottled(result.error === 'flat' ? WALK_FLAT_TOAST : POLY_TOO_FEW_TOAST);
      return;
    }
    if (result.shape === DRAW_MODES.RECT) {
      const { x_min, y_min, x_max, y_max } = result.data;
      const payload = this._rectFromMm(x_min, y_min, x_max, y_max);
      this._exitWalk();
      this._commitZoneShape(zoneId, payload);
      return;
    }
    this._exitWalk();
    this._polyPoints = result.points;
    this.finishPolygon();
  }

  /** Whether this viewer may open History: an administrator, on a radar
   *  that keeps movement history, on the full card. Anyone else's card
   *  never calls the movement commands. */
  _historyAllowed() {
    return !this._viewOnly && this._isAdmin() && this._movementHistory;
  }

  /**
   * Walk's labeled chip beside Coverage: an administrator's, as the 🚶 in
   * the drawing modes is, and gone while Walk is on, whose panel is right
   * above it. Only a phone or a tablet shows it (the .walk-chip rule). On a
   * locked map a press says how to unlock, as 🚶's does.
   */
  _renderWalkChip() {
    const chip = this.shadowRoot?.getElementById('btnWalkChip');
    if (!chip) return;
    chip.hidden = !this._isAdmin() || this.drawMode === DRAW_MODES.WALK;
  }

  /** The History chip: shown only where History is allowed, disabled while
   *  Walk is on (its replay would hide the walker's dot), pressed and
   *  expanded while the panel is open. */
  _renderHistoryChip() {
    const chip = this.shadowRoot?.getElementById('btnHistory');
    if (!chip) return;
    chip.hidden = !this._historyAllowed();
    const walking = !!this._walk;
    chip.disabled = walking;
    chip.title = walking ? HISTORY_WALK_TITLE : '';
    const open = this._history.open;
    chip.classList.toggle('active', open);
    chip.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /**
   * Open the History panel and read the range from the server. The live map
   * stays until the answer comes; from then the replay takes the map, at
   * the start of the range and paused.
   */
  _openHistory() {
    const h = this._history;
    if (h.open || this._walk || !this._historyAllowed()) return;
    h.open = true;
    this._fetchHistory();
  }

  /**
   * Close the History panel, back to the live map: stop the replay, drop its
   * answer and every answer still on its way. Back to live, the History
   * chip, the flag going off, an administrator who is one no more, Walk, a
   * card leaving the page, another radar and view_only all end here. The
   * range, speed and Heatmap stay for the next open.
   */
  _closeHistory() {
    const h = this._history;
    this._historyReq += 1;
    this._stopPlayback();
    if (!h.open) return;
    const showing = this._replayShowing();
    h.open = false;
    this._dropHistoryAnswer();
    h.loading = false;
    h.error = null;
    h.confirmClear = false;
    this._renderHistoryPanel();
    if (showing) {
      // The live map, which the replay kept from painting, and its trails.
      this.drawGrid();
      this._kickTrailTimer();
    }
  }

  /** Forget the answer the replay shows, and where in it the replay was. */
  _dropHistoryAnswer() {
    const h = this._history;
    h.series = null;
    h.heat = null;
    h.t = null;
    h.serverNow = null;
    h.clientAt = null;
    h.since = null;
  }

  /** Stop a replay that plays; it stays where it got to. */
  _stopPlayback() {
    const h = this._history;
    h.playing = false;
    if (h.timer !== null) {
      clearTimeout(h.timer);
      h.timer = null;
    }
  }

  /**
   * Read the open panel's range from the server, by the server's clock. The
   * request starts at this browser's clock corrected by the skew the last
   * answer showed; the range ends at the answer's `now` and starts its
   * length before that. A first answer more than a minute off the clock the
   * request assumed is asked again with the start corrected, so the range
   * is not missing its first minutes. Only the newest request of a panel
   * still open for the same radar is applied: a slow 24 h answer must not
   * replace a later 1 h one, or reopen a closed panel.
   */
  async _fetchHistory(retry = true) {
    const h = this._history;
    const token = ++this._historyReq;
    const deviceId = this.deviceId;
    const rangeMs = h.rangeH * 3600000;
    const skewMs = this._historySkewMs;
    const showing = this._replayShowing();
    this._stopPlayback();
    this._dropHistoryAnswer();
    h.loading = true;
    h.error = null;
    this._renderHistoryPanel();
    if (showing) {
      // The live map while the range loads, or after it failed to. Its
      // trails fade on: the replay stood the fade timer down, and a radar
      // with nobody moving sends no push to start it again.
      this.drawGrid();
      this._kickTrailTimer();
    }
    const fail = (message) => {
      // Nothing older may land on top of what this says.
      this._historyReq += 1;
      h.loading = false;
      h.error = message;
      this._renderHistoryPanel();
    };
    let payload;
    try {
      payload = await fetchMovement(this._hass, deviceId, Date.now() + skewMs - rangeMs);
    } catch (error) {
      if (this._historyAnswerCurrent(token, deviceId)) fail(this._historyErrorText(error));
      return;
    }
    if (!this._historyAnswerCurrent(token, deviceId)) return;
    const clientAt = Date.now();
    if (!isMovementPayload(payload)) {
      fail(historyError(HISTORY_UNREADABLE));
      return;
    }
    this._historySkewMs = payload.now - clientAt;
    if (retry && Math.abs(this._historySkewMs - skewMs) > HISTORY_SKEW_REFETCH_MS) {
      this._fetchHistory(false);
      return;
    }
    let series;
    try {
      series = decodeMovement(payload);
    } catch (error) {
      fail(historyError(error?.message ? String(error.message) : HISTORY_UNREADABLE));
      return;
    }
    const since = payload.now - rangeMs;
    h.loading = false;
    h.series = series;
    // Once per answer: dwell does not change while the replay moves.
    h.heat = heatCells(series, since, payload.now);
    h.serverNow = payload.now;
    h.clientAt = clientAt;
    h.since = since;
    h.t = since;
    this._renderHistoryPanel();
    this.drawGrid();
  }

  /** Whether the answer to request `token` for `deviceId` may still be
   *  applied: it is the newest one, and its panel is still open. */
  _historyAnswerCurrent(token, deviceId) {
    return token === this._historyReq && this._history.open && this.deviceId === deviceId;
  }

  /** What the status line says about a refused movement read. */
  _historyErrorText(error) {
    if (error?.code === 'unauthorized') return HISTORY_UNAUTHORIZED;
    return historyError(error?.message ? String(error.message) : REJECTED_REASON);
  }

  /** Another range, read again from the server and replayed from its start. */
  _setHistoryRange(hours) {
    const h = this._history;
    if (!h.open || hours === h.rangeH) return;
    if (!HISTORY_RANGES.some((range) => range.hours === hours)) return;
    h.rangeH = hours;
    this._fetchHistory();
  }

  /** Paint where people spent their time over the range, or stop. */
  _setHistoryHeatmap(on) {
    this._history.heatmap = on;
    this._renderHistoryPanel();
    if (this._replayShowing()) this.drawGrid();
  }

  /** Play at another speed, from the moment it was pressed. */
  _setHistorySpeed(speed) {
    const h = this._history;
    if (!HISTORY_SPEEDS.some((option) => option.speed === speed)) return;
    if (h.playing) this._advanceHistory();
    h.speed = speed;
    this._renderHistoryPanel();
  }

  /** Play the replay from where it is, or from the start once it has
   *  played to the end. The replay timer is then the map's only painter. */
  _playHistory() {
    const h = this._history;
    if (h.playing || !this._replayShowing()) return;
    const restart = h.t >= h.serverNow;
    if (restart) h.t = h.since;
    h.playing = true;
    h.lastTick = this._now();
    h.timer = setTimeout(() => this._onHistoryFrame(), HISTORY_FRAME_MS);
    this._renderHistoryPanel();
    if (restart) this.drawGrid();
  }

  /** Pause where the replay is now, painted there once. */
  _pauseHistory() {
    if (!this._history.playing) return;
    this._advanceHistory();
    this._stopPlayback();
    this._renderHistoryPanel();
    this.drawGrid();
  }

  /** Move a playing replay on by the time since it last moved, times its
   *  speed, never past the end of the range. */
  _advanceHistory() {
    const h = this._history;
    const now = this._now();
    h.t = Math.min(h.serverNow, h.t + (now - h.lastTick) * h.speed);
    h.lastTick = now;
  }

  /** One frame of a playing replay. At the end of the range it pauses. */
  _onHistoryFrame() {
    const h = this._history;
    h.timer = null;
    if (!h.playing || !this._replayShowing()) return;
    this._advanceHistory();
    if (h.t >= h.serverNow) {
      h.playing = false;
      this._renderHistoryPanel();
    } else {
      h.timer = setTimeout(() => this._onHistoryFrame(), HISTORY_FRAME_MS);
      this._renderHistoryTime();
    }
    this.drawGrid();
  }

  /** The scrubber moved to `seconds` into the range. A playing replay plays
   *  on from there. */
  _scrubHistory(seconds) {
    const h = this._history;
    if (!this._replayShowing() || !Number.isFinite(seconds)) return;
    h.t = Math.min(h.serverNow, Math.max(h.since, h.since + seconds * 1000));
    if (h.playing) h.lastTick = this._now();
    this._renderHistoryTime();
    this.drawGrid();
  }

  /**
   * The answer to Clear history's question: delete this radar's movement
   * history. The radar keeps recording, so the panel, if it is still open
   * for this radar, reads the range again.
   */
  async _clearHistory() {
    const h = this._history;
    h.confirmClear = false;
    this._renderHistoryPanel();
    if (!this._hass || !this._historyAllowed()) return;
    const deviceId = this.deviceId;
    try {
      await clearMovement(this._hass, deviceId);
    } catch (error) {
      this._notify(historyClearError(error?.message ? String(error.message) : REJECTED_REASON));
      return;
    }
    this._notify(HISTORY_CLEARED_TOAST);
    if (h.open && this.deviceId === deviceId) this._fetchHistory();
  }

  /** Lay the History panel out from the state on `this`, after a change of
   *  it and after render() rebuilt the DOM. A playing replay updates only
   *  its time (_renderHistoryTime). */
  _renderHistoryPanel() {
    this._renderHistoryChip();
    const root = this.shadowRoot;
    const panel = root?.getElementById('historyPanel');
    if (panel) {
      const h = this._history;
      const pressed = (button, on) => {
        button.classList.toggle('active', on);
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
      };
      panel.hidden = !h.open;
      panel.querySelectorAll('[data-hours]').forEach((button) => {
        pressed(button, Number(button.dataset.hours) === h.rangeH);
      });
      panel.querySelectorAll('[data-speed]').forEach((button) => {
        pressed(button, Number(button.dataset.speed) === h.speed);
      });
      const heatmap = root.getElementById('btnHistoryHeatmap');
      if (heatmap) pressed(heatmap, h.heatmap);
      const loaded = !!h.series;
      const play = root.getElementById('btnHistoryPlay');
      if (play) {
        play.textContent = h.playing ? HISTORY_PAUSE : HISTORY_PLAY;
        play.disabled = !loaded;
      }
      const scrub = root.getElementById('historyScrub');
      if (scrub) {
        // Before the value, which the old maximum would clamp.
        scrub.max = String(h.rangeH * 3600);
        scrub.disabled = !loaded;
      }
      const status = root.getElementById('historyStatus');
      if (status) status.textContent = this._historyStatusText();
      const spark = root.getElementById('historySpark');
      if (spark) spark.innerHTML = this._sparklineMarkup();
      const clear = root.getElementById('btnHistoryClear');
      if (clear) clear.hidden = h.confirmClear;
      const confirm = root.getElementById('historyClearConfirm');
      if (confirm) confirm.hidden = !h.confirmClear;
    }
    this._renderHistoryTime();
  }

  /**
   * What moves with the replay time: the scrubber, the time under it (which
   * the scrubber reads out as its value) and the badge over the map. Runs
   * every frame of a playing replay.
   */
  _renderHistoryTime() {
    const root = this.shadowRoot;
    const h = this._history;
    const showing = this._replayShowing();
    const time = showing ? this._replayTime(h.t) : '';
    const readout = showing ? `${time}, ${formatAgo(this._historyNow() - h.t)}` : '';
    const scrub = root?.getElementById('historyScrub');
    if (scrub) {
      scrub.value = String(showing ? Math.round((h.t - h.since) / 1000) : 0);
      if (readout) scrub.setAttribute('aria-valuetext', readout);
      else scrub.removeAttribute('aria-valuetext');
    }
    const host = root?.getElementById('historyTime');
    if (host) host.textContent = readout;
    const badge = root?.getElementById('replayBadge');
    if (badge) {
      badge.hidden = !showing;
      badge.textContent = showing ? replayBadge(time) : '';
    }
  }

  /** The server's clock now, from the answer's `now` and the time since it
   *  came on this browser's clock. */
  _historyNow() {
    const h = this._history;
    return h.serverNow + (Date.now() - h.clientAt);
  }

  /** The status line: loading, why the read failed, or that the range has
   *  nothing to replay; empty while a replay shows. */
  _historyStatusText() {
    const h = this._history;
    if (h.loading) return HISTORY_LOADING;
    if (h.error) return h.error;
    if (h.series && !this._historyHasPoints()) return HISTORY_EMPTY;
    return '';
  }

  /** Whether the answer holds a position to replay, not only the marks of
   *  targets leaving. */
  _historyHasPoints() {
    const slots = this._history.series?.slots;
    if (!slots) return false;
    for (const series of slots.values()) {
      if (series.gone.includes(0)) return true;
    }
    return false;
  }

  /**
   * The sparkline over the scrubber: how many positions were recorded in
   * each of HISTORY_SPARK_BUCKETS slices of the range, as bars whose height
   * follows the log of the count, so one busy minute does not flatten the
   * rest. Markup from numbers only. Empty with nothing recorded.
   */
  _sparklineMarkup() {
    const h = this._history;
    if (!h.series) return '';
    const counts = sparkBuckets(h.series, h.since, h.serverNow, HISTORY_SPARK_BUCKETS);
    const top = Math.max(0, ...counts);
    if (top === 0) return '';
    const scale = HISTORY_SPARK_HEIGHT / Math.log1p(top);
    const bars = counts
      .map((count, i) => {
        if (count === 0) return '';
        const height = Math.log1p(count) * scale;
        const y = HISTORY_SPARK_HEIGHT - height;
        return `<rect x="${i}" y="${y.toFixed(2)}" width="1" height="${height.toFixed(2)}"></rect>`;
      })
      .join('');
    return (
      `<svg viewBox="0 0 ${HISTORY_SPARK_BUCKETS} ${HISTORY_SPARK_HEIGHT}"` +
      ` preserveAspectRatio="none" focusable="false">${bars}</svg>`
    );
  }

  /**
   * Server epoch ms `t` as a clock time the way this viewer's Home Assistant
   * shows times: its language, its 12 or 24 hour choice, and the server's
   * time zone when the profile says so (else this browser's). A language or
   * zone Intl does not know falls back to this browser's own format. The
   * format is made once per locale, not once per frame.
   */
  _replayTime(t) {
    const locale = this._hass?.locale;
    const language = locale?.language || undefined;
    let hour12;
    if (locale?.time_format === '12') hour12 = true;
    else if (locale?.time_format === '24') hour12 = false;
    const timeZone =
      locale?.time_zone === 'server' ? this._hass?.config?.time_zone || undefined : undefined;
    const key = JSON.stringify([language, hour12, timeZone]);
    if (this._replayFormat?.key !== key) {
      let format;
      try {
        format = clockFormat(language, hour12, timeZone);
      } catch {
        format = clockFormat(undefined, undefined, undefined);
      }
      this._replayFormat = { key, format };
    }
    return this._replayFormat.format.format(t);
  }

  _attachMapOptions() {
    const mirror = this.shadowRoot.getElementById('mirrorToggle');
    if (mirror) mirror.addEventListener('change', () => this._chooseMirror(mirror.checked));
    const movement = this.shadowRoot.getElementById('movementToggle');
    if (movement) {
      movement.addEventListener('change', () => this._chooseMovementHistory(movement.checked));
    }
    const yes = this.shadowRoot.getElementById('btnMovementOffYes');
    if (yes) yes.addEventListener('click', () => this._turnMovementHistoryOff());
    const no = this.shadowRoot.getElementById('btnMovementOffNo');
    if (no) {
      no.addEventListener('click', () => {
        this._movementConfirm = false;
        this._renderMovementOption();
      });
    }
  }

  /**
   * Flip this radar's map for everyone who opens it, as an administrator.
   * The map flips at once and flips back if Home Assistant refuses the save;
   * the save's own echo confirms it.
   */
  async _chooseMirror(on) {
    if (!this._isAdmin()) {
      // A disabled checkbox gets no change event, but nothing that still
      // reaches it (a screen reader, say) flips the map or saves.
      this._applyMirror(this._zoneConfigPayload);
      return;
    }
    if (on === this._mirrorX) return;
    this._setMirror(on);
    this.drawGrid();
    // A display setting, so input_units, which rescales presence for sensors
    // without a unit, stays out of it, as with the m / ft switch.
    const saved = await this._saveZoneUpdate({ device_id: this.deviceId, mirror_x: on }, null, {
      withInputUnits: false,
    });
    if (!saved) {
      // Back to what the store holds, which the refused save did not change.
      this._applyMirror(this._zoneConfigPayload);
      this.drawGrid();
    }
  }

  /**
   * Show the switch half for the map's unit as the pressed one, with a
   * tooltip that says what a press does: for an administrator it saves the
   * unit for everyone who opens this radar's map, on any dashboard.
   */
  _renderUnitSwitch() {
    const shown = this._unitFamily(this._displayUnit());
    const titles = this._isAdmin() ? UNIT_SWITCH_TITLES.admin : UNIT_SWITCH_TITLES.viewer;
    ['btnUnitM', 'btnUnitFt'].forEach((id) => {
      const button = this.shadowRoot?.getElementById(id);
      if (!button) return;
      const pressed = button.dataset.unit === shown;
      button.classList.toggle('active', pressed);
      button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      button.title = titles[button.dataset.unit];
    });
  }

  /** The help line under the map, in the map's unit. */
  _renderInfo() {
    const host = this.shadowRoot?.getElementById('gridInfo');
    if (!host) return;
    const value = (mm) => this._formatGridValue(mm);
    this._infoUnits = this._targetUnitsText();
    host.textContent =
      'Click & drag for Rectangle/Ellipse. Polygon: click points, double-click to finish' +
      ` (max ${this.polyMaxPoints} pts). Grid units: ${this._unitLabel(this._displayUnit())}` +
      ` (X: ${value(this.xMin)}..${value(this.xMax)}, Y: ${value(this.yMin)}..${value(this.yMax)}).` +
      this._infoUnits +
      ` Radar range: ${this._rangeText()}`;
  }

  /**
   * The help line's units: the length units the tracked targets' sensors show,
   * then the input unit only when one of them has no length unit, since only
   * such a sensor is read in it. With no tracked state, the input unit alone.
   */
  _targetUnitsText() {
    const states = this._hass?.states;
    const units = new Set();
    let tracked = false;
    let unitless = false;
    this.trackedEntities.forEach((pair) => {
      [pair.x, pair.y].forEach((id) => {
        const stateObj = id ? states?.[id] : undefined;
        if (!stateObj) return;
        tracked = true;
        const unit = stateObj.attributes?.unit_of_measurement;
        if (typeof unit === 'string' && Object.prototype.hasOwnProperty.call(SENSOR_LENGTH_UNITS, unit)) {
          units.add(unit);
        } else {
          unitless = true;
        }
      });
    });
    const input = ` Input units (sensors without a length unit): ${this._unitLabel(this.inputUnits)}.`;
    if (!tracked) return input;
    const shown = Object.keys(SENSOR_LENGTH_UNITS).filter((unit) => units.has(unit));
    return (shown.length ? ` Target sensors: ${shown.join(' and ')}.` : '') + (unitless ? input : '');
  }

  /** Redraw everything that shows the map's unit, after it changed. */
  _displayUnitChanged() {
    // A fitted grid's extents are whole steps of the unit, so they move too.
    this._refitGrid();
    this._invalidateGridCache();
    this._invalidateConeCache();
    this._renderUnitSwitch();
    this._renderInfo();
    this._renderZoneSizes();
    this.drawGrid();
  }

  /**
   * The unit the map is shown in: what this page's viewer picked on the
   * switch, else the unit saved for the radar, else a hand-written card's
   * YAML grid_units, else Home Assistant's unit system. The YAML unit is
   * returned as written (mm, cm, m, in or ft) so such a card draws exactly as
   * it did before the switch existed; the other three are m or ft.
   */
  _displayUnit() {
    if (this._viewDisplayUnits) return this._viewDisplayUnits;
    if (this._storedDisplayUnits) return this._storedDisplayUnits;
    if (this._gridUnitsConfigured) return this.gridUnits;
    // The same rule the distance card uses: US customary is "mi".
    return this._hass?.config?.unit_system?.length === 'mi' ? 'ft' : 'm';
  }

  /** Which half of the m / ft switch a unit belongs to. */
  _unitFamily(unit) {
    return unit === 'ft' || unit === 'in' ? 'ft' : 'm';
  }

  /**
   * "6 m (20 ft), 120°": the cone's range in the map's unit first and the
   * other in parentheses, since the spec sheet says 6 m, then its width.
   */
  _rangeText() {
    const meters = `${Number((this.coneYMax / LENGTH_UNITS.m).toFixed(1))} m`;
    const feet = `${Math.round(this.coneYMax / LENGTH_UNITS.ft)} ft`;
    const [first, second] =
      this._unitFamily(this._displayUnit()) === 'ft' ? [feet, meters] : [meters, feet];
    return `${first} (${second}), ${Math.round(this.coneFovDeg)}°`;
  }

  _attachZoneListEvents() {
    const zoneButtons = this.shadowRoot.getElementById('zone-buttons');
    if (!zoneButtons) return;
    zoneButtons.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || target.id !== 'clearBtn') {
        return;
      }
      // One press wipes every zone, so the lock guards it like drawing. The
      // button stays enabled (see _renderClearAllLock) so the press can say why.
      if (this.isLocked) {
        this._remindLocked(CLEAR_LOCKED_TOAST);
        return;
      }
      this._clearAllZones();
    });
  }

  /** Dim Clear All Zones while the map is locked, and tell assistive tech it
   *  will not act. It stays enabled: a disabled button takes no tap and shows
   *  no tooltip on touch, so a phone user would see a dim chip that does
   *  nothing and not know why. */
  _renderClearAllLock(clearBtn) {
    if (!clearBtn) return;
    clearBtn.classList.toggle('locked-action', !!this.isLocked);
    if (this.isLocked) clearBtn.setAttribute('aria-disabled', 'true');
    else clearBtn.removeAttribute('aria-disabled');
  }

  _attachCanvasEvents() {
    if (!this.canvas) return;

    // Shift and the left button, or the middle button, pan the map instead
    // of drawing, and the release that ends a pan places no corner.
    const handleMouseDown = (event) => {
      if (this._startMousePan(event)) return;
      this.startDrawing(event);
    };
    const handleMouseMove = (event) => this.draw(event);
    const handleMouseUp = (event) => {
      if (this._gesture?.kind === 'pan') return;
      this.endDrawing(event);
    };

    this.canvas.addEventListener('mousedown', handleMouseDown);
    this.canvas.addEventListener('mousemove', handleMouseMove);
    this.canvas.addEventListener('mouseup', handleMouseUp);
    // On the canvas's container, so the wheel over the buttons on the map
    // zooms it too. Not passive: Ctrl or Cmd and the wheel zoom the map, not
    // the page.
    this.canvas.parentElement?.addEventListener('wheel', (event) => this._onWheel(event), {
      passive: false,
    });

    // A map nothing can be drawn on (see _canvasPans) leaves the touch to the
    // browser, so a swipe that starts on it scrolls the page instead of
    // trapping a phone user in the card. A tap still reaches startDrawing
    // through the mousedown the browser makes of it, so a locked map still
    // says how to unlock. Read at event time, and a gesture already drawing
    // finishes or cancels as before. Two fingers pinch and pan the map on
    // any map, one that pans or not (see _pinchTouch), before all of that.
    this.canvas.addEventListener(
      'touchstart',
      (event) => {
        if (this._pinchTouch(event, 'touchstart')) return;
        if (this._canvasPans() && !this.isDrawing) return;
        event.preventDefault();
        this.startDrawing(event);
      },
      { passive: false },
    );
    this.canvas.addEventListener(
      'touchmove',
      (event) => {
        if (this._pinchTouch(event, 'touchmove')) return;
        if (this._canvasPans() && !this.isDrawing) return;
        event.preventDefault();
        this.draw(event);
      },
      { passive: false },
    );
    this.canvas.addEventListener(
      'touchend',
      (event) => {
        if (this._pinchTouch(event, 'touchend')) return;
        if (this._canvasPans() && !this.isDrawing) return;
        event.preventDefault();
        this.endDrawing(event);
      },
      { passive: false },
    );
    // The browser ends a touch it takes away (a system gesture, an incoming
    // call, an app switch, palm rejection) with touchcancel, never touchend.
    this.canvas.addEventListener(
      'touchcancel',
      (event) => {
        if (this._pinchTouch(event, 'touchcancel')) return;
        this._cancelTouch(event);
      },
      { passive: true },
    );

    this.canvas.addEventListener('dblclick', (event) => {
      // The second press of a Shift double-click panned; it placed nothing.
      if (event.shiftKey) return;
      if (this.drawMode === DRAW_MODES.POLYGON) {
        this.finishPolygon();
      }
    });

    this._attachGlobalListeners();

    const canvasContainer = this.canvas.parentElement;
    if (canvasContainer) {
      canvasContainer.addEventListener('mouseleave', () => {
        if (!this.isDrawing) return;
        // A polygon is a multi-click session with its own Finish, Undo,
        // Escape and click-away cancel, so leaving the canvas only drops the
        // rubber-band line. A rect or ellipse drag is still cancelled: only
        // the canvas listens for its mouseup, so a release outside would
        // leave the drag stuck.
        if (this.drawMode === DRAW_MODES.POLYGON) {
          this._cursorPoint = null;
          this.drawGrid();
          return;
        }
        this.cancelDrawing();
      });
    }
  }

  /** The window and document listeners. Separate from the canvas ones because
   *  `disconnectedCallback` removes exactly these, and a re-attached card has
   *  to get them back without re-wiring a canvas that never lost its own. */
  _attachGlobalListeners() {
    // TODO(REVIEW_REPORT.md X40): render() reaches this on a detached card, so these listeners
    // retain it. If tightened, attach (and subscribe) only while isConnected; update the tests.
    // A view-only map draws nothing for a key or a press elsewhere to end.
    if (!this.canvas || this._viewOnly) return;
    this._detachGlobalListeners();

    this._onKeyDown = (event) => {
      // Keys typed into a text field belong to that field, not to the
      // drawing: without this, editing a zone name (in this card's manager or
      // anywhere else on the dashboard) popped a vertex per Backspace and
      // Escape threw the polygon away. A listener on window sees
      // `event.target` retargeted to the outermost shadow host, so ask the
      // composed path for the real origin. A field inside a closed shadow
      // root stays hidden from it and keeps the old behavior; Home
      // Assistant's own fields use open roots.
      const origin = event.composedPath()[0];
      if (
        origin instanceof HTMLInputElement ||
        origin instanceof HTMLTextAreaElement ||
        origin instanceof HTMLSelectElement ||
        origin?.isContentEditable
      ) {
        return;
      }
      if (event.key === 'Alt') {
        this._setCursorFree(true);
        return;
      }
      if (this.drawMode !== DRAW_MODES.POLYGON) return;
      if (event.key === 'Escape') {
        this._polyPoints = [];
        this.isDrawing = false;
        // A payload or a unit change that came in while the polygon was open
        // was not fitted (see _refitGrid), so the map catches up now.
        this._refitAndDraw();
      } else if (event.key === 'Backspace' && this._polyPoints.length > 0) {
        this._popPolyPoint();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
    // Alt or Option let go mid-drag snaps the pointer's corner again.
    this._onKeyUp = (event) => {
      if (event.key === 'Alt') this._setCursorFree(false);
    };
    window.addEventListener('keyup', this._onKeyUp);

    const canvasContainer = this.canvas.parentElement;
    this._outsideClickHandler = (event) => {
      if (!this.canvas) return;
      // A listener on document sees `event.target` retargeted to the
      // outermost shadow host (this card, or Home Assistant's wrapper when
      // nested), which neither the shadow root nor the canvas container
      // contains. The composed path still lists the real nodes, so ask it.
      const path = event.composedPath();
      // The overlay buttons (Finish, Undo, mode, lock) live in the container
      // and act on the drawing, so a press on them must not cancel it.
      if (canvasContainer && path.includes(canvasContainer)) return;
      if (!path.includes(this)) return;
      if (this.isDrawing) this.cancelDrawing();
    };
    document.addEventListener('mousedown', this._outsideClickHandler, true);
    document.addEventListener('touchstart', this._outsideClickHandler, true);
  }

  _attachConeControls() {
    const angleSlider = this.shadowRoot.getElementById('coneAngleSlider');
    const angleLabel = this.shadowRoot.getElementById('coneAngleLabel');
    if (!angleSlider || !angleLabel) return;
    const coneControls = this.shadowRoot.getElementById('cone-controls');
    if (coneControls) this._watchLockedConeTries(coneControls);

    const updateDisplay = () => {
      angleLabel.textContent = `${this.coneAngleDeg}°`;
      angleSlider.value = String(this.coneAngleDeg);
    };

    // A fitted grid follows the cone only once the slider is let go. Fitting
    // on every step would resize the canvas, and the slider below it with it,
    // under the finger that is dragging it.
    // The Locked button covers the slider too: _updateLockVisual disables it.
    // The handlers check as well, so nothing that still reaches a locked
    // slider (a screen reader, say) turns the cone or saves.
    angleSlider.addEventListener('input', () => {
      if (this.isLocked) {
        updateDisplay();
        return;
      }
      const value = parseInt(angleSlider.value, 10);
      if (Number.isNaN(value)) return;
      this.coneAngleDeg = this._clampConeAngle(value);
      this._invalidateConeCache();
      // A new rotation starts from the whole map (see _applyRotation).
      this._resetView();
      updateDisplay();
      this.drawGrid();
    });

    angleSlider.addEventListener('change', () => {
      if (this.isLocked) {
        updateDisplay();
        return;
      }
      this._refitAndDraw();
      this._persistRotation();
    });

    angleSlider.addEventListener('dblclick', () => {
      if (this.isLocked) return;
      this.coneAngleDeg = this.coneAngleDefault;
      this._invalidateConeCache();
      this._resetView();
      updateDisplay();
      this._refitAndDraw();
      this._persistRotation();
    });

    updateDisplay();
  }

  /**
   * A locked slider takes no pointer, so a press on it lands on its row. A
   * tap there, or a drag along the slider, is someone trying to turn the
   * cone: say where the lock is. A press that moves up or down is a scroll
   * (the browser scrolls the page and may cancel the pointer), not a try.
   */
  _watchLockedConeTries(row) {
    let press = null;
    row.addEventListener('pointerdown', (e) => {
      press =
        this.isLocked && e.button === 0
          ? { id: e.pointerId, x: e.clientX, y: e.clientY, tried: false }
          : null;
    });
    row.addEventListener('pointermove', (e) => {
      if (!press || press.tried || e.pointerId !== press.id) return;
      const dx = Math.abs(e.clientX - press.x);
      if (dx > CONE_TRY_PX && dx > Math.abs(e.clientY - press.y)) {
        press.tried = true;
        this._remindLocked(CONE_LOCKED_TOAST);
      }
    });
    row.addEventListener('pointerup', (e) => {
      if (!press || e.pointerId !== press.id) return;
      const { tried, y } = press;
      press = null;
      if (!tried && Math.abs(e.clientY - y) <= CONE_TRY_PX) this._remindLocked(CONE_LOCKED_TOAST);
    });
    row.addEventListener('pointercancel', () => {
      press = null;
    });
  }

  /**
   * Something the lock guards was tried: ring the Locked button, so the way
   * out is in view, and say `message`. The draw, clear and cone reminders
   * share one throttle, so a burst of tries on a locked map toasts once per
   * 1.5 s whichever control was tried.
   */
  _remindLocked(message) {
    const btnLock = this.shadowRoot?.getElementById('btnLock');
    if (btnLock) {
      btnLock.classList.add('nudge');
      clearTimeout(this._lockNudgeTimer);
      this._lockNudgeTimer = setTimeout(() => btnLock.classList.remove('nudge'), LOCK_NUDGE_MS);
    }
    const now = Date.now();
    if (this._lastLockWarningTs && now - this._lastLockWarningTs <= TOAST_THROTTLE_MS) return;
    this._lastLockWarningTs = now;
    this._notify(message);
  }

  /** Say `message`, unless it was said in the last 1.5 s: a repeated gesture
   *  (a double tap that keeps landing on too few points) gets one toast. */
  _notifyThrottled(message) {
    const now = Date.now();
    const last = this._toastAt.get(message);
    if (last !== undefined && now - last <= TOAST_THROTTLE_MS) return;
    this._toastAt.set(message, now);
    this._notify(message);
  }

  _attachDrawingModeControls() {
    const btnModeMenu = this.shadowRoot.getElementById('btnModeMenu');
    const modeGroup = this.shadowRoot.getElementById('modeGroup');
    const btnModeRect = this.shadowRoot.getElementById('btnModeRect');
    const btnModeEllipse = this.shadowRoot.getElementById('btnModeEllipse');
    const btnModePolygon = this.shadowRoot.getElementById('btnModePolygon');
    const btnPolyUndo = this.shadowRoot.getElementById('btnPolyUndo');
    const btnPolyFinish = this.shadowRoot.getElementById('btnPolyFinish');
    const btnLock = this.shadowRoot.getElementById('btnLock');

    if (btnModeMenu && modeGroup) {
      btnModeMenu.addEventListener('click', () => {
        this.showModeMenu = !this.showModeMenu;
        modeGroup.style.display = this.showModeMenu ? 'flex' : 'none';
      });
    }

    if (btnModeRect)
      btnModeRect.addEventListener('click', () => this._setDrawMode(DRAW_MODES.RECT));
    if (btnModeEllipse)
      btnModeEllipse.addEventListener('click', () => this._setDrawMode(DRAW_MODES.ELLIPSE));
    if (btnModePolygon)
      btnModePolygon.addEventListener('click', () => this._setDrawMode(DRAW_MODES.POLYGON));
    const btnModeWalk = this.shadowRoot.getElementById('btnModeWalk');
    if (btnModeWalk) btnModeWalk.addEventListener('click', () => this._enterWalk());

    if (btnPolyUndo) {
      btnPolyUndo.addEventListener('click', () => {
        if (this.drawMode === DRAW_MODES.POLYGON && this._polyPoints.length) {
          this._popPolyPoint();
        }
      });
    }

    if (btnPolyFinish) {
      btnPolyFinish.addEventListener('click', () => {
        if (this.drawMode === DRAW_MODES.POLYGON) this.finishPolygon();
      });
    }

    if (btnLock) {
      const updateLockVisual = () => {
        btnLock.innerHTML = this.isLocked
          ? '<span>Locked</span><span class="icon">🔒</span>'
          : '<span>Unlocked</span><span class="icon">🔓</span>';
        btnLock.title = this.isLocked
          ? 'Unlock drawing and cone rotation'
          : 'Lock drawing and cone rotation';
        if (this.canvas) {
          this.canvas.style.cursor = this.isLocked ? 'not-allowed' : 'crosshair';
        }
        const angleSlider = this.shadowRoot.getElementById('coneAngleSlider');
        if (angleSlider) angleSlider.disabled = this.isLocked;
        const coneControls = this.shadowRoot.getElementById('cone-controls');
        if (coneControls) coneControls.classList.toggle('locked', this.isLocked);
        const hint = this.shadowRoot.getElementById('coneLockHint');
        if (hint) hint.hidden = !this.isLocked;
        this._renderClearAllLock(this.shadowRoot.getElementById('clearBtn'));
        this._updateCanvasTouchMode();
      };
      btnLock.addEventListener('click', () => {
        this.isLocked = !this.isLocked;
        writeStoredLock(this.deviceId, this.isLocked);
        updateLockVisual();
        this._lastLockWarningTs = 0;
        if (this.isLocked) {
          if (this.isDrawing) this.cancelDrawing();
          // Walk saves a zone too, so the lock ends it, corners and all.
          this._exitWalk();
          this._notify(LOCK_ON_TOAST);
        } else {
          this._notify(LOCK_OFF_TOAST);
        }
      });
      this._updateLockVisual = updateLockVisual;
      updateLockVisual();
    }

    const btnUndo = this.shadowRoot.getElementById('btnUndo');
    if (btnUndo) {
      if (!this.showUndo) {
        btnUndo.style.display = 'none';
      } else {
        btnUndo.addEventListener('click', () => this._performUndo());
      }
      this._refreshUndoButton();
    }

    this._setDrawMode(this.drawMode || DRAW_MODES.RECT);
  }

  _attachConfigEvents() {
    const btnConfigToggle = this.shadowRoot.getElementById('btnConfigToggle');
    const configContent = this.shadowRoot.getElementById('configContent');
    if (btnConfigToggle && configContent) {
      btnConfigToggle.addEventListener('click', () => {
        this.showConfig = !this.showConfig;
        configContent.classList.toggle('open', this.showConfig);
        const caret = btnConfigToggle.querySelector('span:last-child');
        if (caret) caret.textContent = this.showConfig ? '▾' : '▸';
      });
    }

    const btnAddZone = this.shadowRoot.getElementById('btnAddZone');
    if (btnAddZone) {
      btnAddZone.addEventListener('click', () => this._handleAddZone());
    }

    const toggleZones = this.shadowRoot.getElementById('toggleZones');
    const caretZones = this.shadowRoot.getElementById('caretZones');
    const sectionZones = this.shadowRoot.getElementById('sectionZones');
    if (toggleZones && caretZones && sectionZones) {
      toggleZones.addEventListener('click', () => {
        this.showZones = !this.showZones;
        sectionZones.classList.toggle('open', this.showZones);
        caretZones.textContent = this.showZones ? '▾' : '▸';
      });
    }
  }

  _applyGridConfig(grid) {
    this._invalidateGridCache();
    this._invalidateConeCache();
    const convert = (value) => this._convertToMm(value, this.gridUnits);
    const next =
      grid && typeof grid === 'object'
        ? {
            xMin: convert(grid.x_min),
            xMax: convert(grid.x_max),
            yMin: convert(grid.y_min),
            yMax: convert(grid.y_max),
          }
        : null;
    // A grid block with no usable extent is no grid at all, and the extents
    // are left to _refitGrid, which setConfig calls once the cone is known.
    // They are not reset here: a same-radar setConfig can land mid-drag, and
    // the map must not jump under the gesture (see _refitGrid).
    this._gridFromConfig = !!next && Object.values(next).some((value) => value !== null);
    if (!this._gridFromConfig) return;

    // A YAML grid starts from DEFAULT_GRID on every call: setConfig runs
    // again on a live element, and a sub-key dropped from the block has to
    // land where it always did, not at the previous extents.
    this.xMin = DEFAULT_GRID.xMin;
    this.xMax = DEFAULT_GRID.xMax;
    this.yMin = DEFAULT_GRID.yMin;
    this.yMax = DEFAULT_GRID.yMax;

    if (next.xMin !== null) this.xMin = next.xMin;
    if (next.xMax !== null) this.xMax = next.xMax;
    if (next.yMin !== null) this.yMin = next.yMin;
    if (next.yMax !== null) this.yMax = next.yMax;

    if (this.xMin > this.xMax) {
      [this.xMin, this.xMax] = [this.xMax, this.xMin];
    }
    if (this.yMin > this.yMax) {
      [this.yMin, this.yMax] = [this.yMax, this.yMin];
    }
    if (this.xMin === this.xMax) {
      this.xMax = this.xMin + 1;
    }
    if (this.yMin === this.yMax) {
      this.yMax = this.yMin + 1;
    }
    this._sizeCanvas();
  }

  /**
   * Fit the grid to the radar's field of view, unless the YAML set it.
   *
   * Leaves the extents alone while a shape is being drawn: a rect or ellipse
   * drag holds its start point in canvas pixels, so moving the map under it
   * would save the zone somewhere the user never pointed, and a polygon holds
   * its vertices until it is finished. Every path that ends or drops the
   * gesture (a save, Finish, Escape, cancelDrawing, a mode change) fits
   * again, so a payload or unit change skipped meanwhile is not lost. Returns
   * whether the extents changed; the caller draws.
   */
  _refitGrid() {
    if (this._gridFromConfig || this.isDrawing) return false;
    const { step, ...next } = this._fittedGrid();
    // The grid lines are drawn at this step (_fittedStep), and only in the
    // unit it was chosen for.
    this._fitStep = { step, unit: this._displayUnit() };
    const same = ['xMin', 'xMax', 'yMin', 'yMax'].every(
      (key) => Math.abs(next[key] - this[key]) < 1e-6,
    );
    if (same) return false;
    this.xMin = next.xMin;
    this.xMax = next.xMax;
    this.yMin = next.yMin;
    this.yMax = next.yMax;
    this._sizeCanvas();
    return true;
  }

  /** Fit the grid again and, when that moved it, redraw what shows it. */
  _refitAndDraw() {
    if (this._refitGrid()) this._renderInfo();
    this.drawGrid();
  }

  /**
   * The step in mm a fitted grid's edges were rounded to, or null for a YAML
   * grid, before the first fit, or when the map's unit changed since the fit
   * (a refit skipped while a shape was being drawn).
   */
  _fittedStep() {
    if (this._gridFromConfig || !this._fitStep) return null;
    return this._fitStep.unit === this._displayUnit() ? this._fitStep.step : null;
  }

  /**
   * The extents of a fitted grid, in mm, and the grid step they were rounded
   * to (`step`).
   *
   * The box around the cone as it is rotated now (its apex, its two edges and
   * any point of its arc due ahead, behind or to a side), with the arc pushed
   * out by FIT_MARGIN_FRACTION, grown to take in every stored zone so none is
   * cut off, then rounded out to whole grid steps of the map's unit so the
   * edges land on grid lines. Last, the short side is grown, in whole steps,
   * to keep the canvas between FIT_MIN_ASPECT and square. It grows on the
   * side the radar faces, so a wall-mounted radar stays on the edge it is
   * mounted on, and evenly when the radar faces neither way along that axis.
   *
   * The step depends on the span, through the 40 px line spacing, and
   * rounding out can widen the span past the next step, so the rounding
   * repeats until the step settles. It need not settle: rounding out to a
   * larger step can leave a narrower span than a smaller step did (-14.5 ft
   * rounds to -16 on 2 ft steps but to -15 on 5 ft ones), narrow enough for
   * the smaller step again, so two steps can take turns forever. Then the
   * larger one is used, whose lines are further apart than the minimum.
   * Either way both axes are drawn at the step returned (_computeGridMetrics),
   * so every edge lands on a grid line.
   */
  _fittedGrid() {
    // A cone hidden with y_max 0 still leaves the radar's real range to map.
    const range = this.coneYMax > 0 ? this.coneYMax : DEFAULT_CONE.yMax;
    const box = this._sectorBox(range * (1 + FIT_MARGIN_FRACTION));
    this._zonePoints().forEach(({ x, y }) => {
      box.xMin = Math.min(box.xMin, x);
      box.xMax = Math.max(box.xMax, x);
      box.yMin = Math.min(box.yMin, y);
      box.yMax = Math.max(box.yMax, y);
    });
    const unit = this._displayUnit();
    const facing = (this.coneAngleDeg * Math.PI) / 180;
    const stepFor = (fitted) => {
      const spanX = Math.max(1, fitted.xMax - fitted.xMin);
      return this._chooseGridStep(CANVAS_WIDTH_PX / spanX, spanX, unit);
    };
    const fit = (step) =>
      this._shapeFit(this._roundOut(box, step), step, Math.sin(facing), Math.cos(facing));
    let step = stepFor(box);
    let fitted = fit(step);
    const tried = [step];
    for (;;) {
      const next = stepFor(fitted);
      if (next === step) break;
      // A step seen before is a cycle. The pass cap only guards the
      // candidate list's span / 10 fallback, which is not a fixed set.
      const seen = tried.indexOf(next);
      if (seen !== -1 || tried.length >= 8) {
        const largest = Math.max(...(seen !== -1 ? tried.slice(seen) : [...tried, next]));
        if (largest !== step) fitted = fit(largest);
        step = largest;
        break;
      }
      tried.push(next);
      step = next;
      fitted = fit(step);
    }
    return { ...fitted, step };
  }

  /** The box around a cone of `radius` mm at the card's width and rotation. */
  _sectorBox(radius) {
    const box = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
    const add = (deg) => {
      const rad = (deg * Math.PI) / 180;
      const x = radius * Math.sin(rad);
      const y = radius * Math.cos(rad);
      box.xMin = Math.min(box.xMin, x);
      box.xMax = Math.max(box.xMax, x);
      box.yMin = Math.min(box.yMin, y);
      box.yMax = Math.max(box.yMax, y);
    };
    const half = Math.min(360, this.coneFovDeg) / 2;
    const start = this.coneAngleDeg - half;
    const end = this.coneAngleDeg + half;
    add(start);
    add(end);
    // The arc reaches farthest along an axis where it crosses a multiple of 90.
    for (let deg = Math.ceil(start / 90) * 90; deg <= end; deg += 90) add(deg);
    return box;
  }

  /** Every corner, extreme and vertex of the stored zones, in mm. */
  _zonePoints() {
    const points = [];
    (this.zones || []).forEach((zone) => {
      const data = zone?.data;
      if (!data) return;
      if (zone.shape === DRAW_MODES.RECT) {
        points.push({ x: data.x_min, y: data.y_min }, { x: data.x_max, y: data.y_max });
      } else if (zone.shape === DRAW_MODES.ELLIPSE) {
        points.push(
          { x: data.cx - data.rx, y: data.cy - data.ry },
          { x: data.cx + data.rx, y: data.cy + data.ry },
        );
      } else if (zone.shape === DRAW_MODES.POLYGON && Array.isArray(data.points)) {
        points.push(...data.points);
      }
    });
    return points
      .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
      .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
  }

  /** `box` grown out to the nearest multiples of `step`. */
  _roundOut(box, step) {
    // An edge already on a step, give or take FIT_EDGE_SLACK_MM of the card's
    // own rounding and the float error in the division, stays where it is
    // instead of moving a whole step out.
    const down = (value) => Math.floor((value + FIT_EDGE_SLACK_MM) / step + 1e-9) * step;
    const up = (value) => Math.ceil((value - FIT_EDGE_SLACK_MM) / step - 1e-9) * step;
    return { xMin: down(box.xMin), xMax: up(box.xMax), yMin: down(box.yMin), yMax: up(box.yMax) };
  }

  /**
   * `box` with its short side grown so its height is between FIT_MIN_ASPECT
   * of its width and its width, toward the side the radar faces along that
   * axis (`facingX`, `facingY`), or evenly when it faces neither way.
   */
  _shapeFit(box, step, facingX, facingY) {
    const grow = (min, max, steps, facing) => {
      if (Math.abs(facing) < 1e-6) {
        const before = Math.floor(steps / 2);
        return [min - before * step, max + (steps - before) * step];
      }
      return facing > 0 ? [min, max + steps * step] : [min - steps * step, max];
    };
    const width = box.xMax - box.xMin;
    const height = box.yMax - box.yMin;
    const fitted = { ...box };
    if (height > width) {
      const steps = Math.round((height - width) / step);
      [fitted.xMin, fitted.xMax] = grow(box.xMin, box.xMax, steps, facingX);
    } else if (height < FIT_MIN_ASPECT * width) {
      const steps = Math.ceil((FIT_MIN_ASPECT * width - height) / step - 1e-9);
      [fitted.yMin, fitted.yMax] = grow(box.yMin, box.yMax, steps, facingY);
    }
    return fitted;
  }

  _applyConeConfig(cone) {
    // Same as the grid: a removed cone block or sub-key reverts to the default.
    // The drawn angle is reset with the rest, and render() lays the store's
    // rotation_deg back over it from the last payload.
    this.coneYMax = DEFAULT_CONE.yMax;
    this.coneFovDeg = DEFAULT_CONE.fovDeg;
    this.coneAngleDefault = DEFAULT_CONE.angleDeg;
    this.coneAngleDeg = DEFAULT_CONE.angleDeg;
    if (!cone || typeof cone !== 'object') return;
    if (cone.y_max !== undefined) {
      const mmValue = this._convertToMm(cone.y_max, this.gridUnits);
      if (mmValue !== null) {
        this.coneYMax = Math.max(0, mmValue);
      }
    }
    if (cone.fov_deg !== undefined) {
      const fov = Number(cone.fov_deg);
      this.coneFovDeg = Number.isFinite(fov) ? Math.min(360, Math.max(1, fov)) : this.coneFovDeg;
    }
    if (cone.angle_deg !== undefined) {
      // cone.angle_deg is only the slider's double-click reset default. The
      // store's rotation_deg (0 when unset) is what is drawn and evaluated:
      // _applyRotation lays it over the angle set here as soon as a payload
      // arrives, and render() re-applies the last payload after every
      // setConfig.
      const angle = this._clampConeAngle(Number(cone.angle_deg));
      this.coneAngleDefault = angle;
      this.coneAngleDeg = angle;
    }

    this._invalidateConeCache();
  }

  _clampConeAngle(angle) {
    if (Number.isNaN(angle)) return 0;
    return Math.max(-180, Math.min(180, angle));
  }

  _clampValue(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    if (min > max) return numeric;
    return Math.max(min, Math.min(max, numeric));
  }

  _clampAndRound(value, min, max) {
    return Math.round(this._clampValue(value, min, max));
  }

  _normalizeUnit(unit) {
    return this._knownUnit(unit) || 'mm';
  }

  /** The LENGTH_UNITS key a YAML unit or alias names, or null for none. */
  _knownUnit(unit) {
    if (unit === null || unit === undefined) return null;
    const key = String(unit).trim().toLowerCase();
    if (!key) return null;
    return UNIT_ALIASES[key] || (LENGTH_UNITS[key] ? key : null);
  }

  _unitMultiplier(unit) {
    return LENGTH_UNITS[unit] || LENGTH_UNITS.mm;
  }

  _unitLabel(unit) {
    return this._normalizeUnit(unit);
  }

  _convertToMm(value, unit) {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return numeric * this._unitMultiplier(unit);
  }

  _mmToUnit(value, unit) {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const multiplier = this._unitMultiplier(unit);
    if (!multiplier) return numeric;
    return numeric / multiplier;
  }

  _formatNumber(value) {
    if (!Number.isFinite(value)) return '0';
    const abs = Math.abs(value);
    const decimals = abs >= 1000 ? 0 : abs >= 100 ? 1 : 2;
    const rounded = Number(value.toFixed(decimals));
    return rounded.toString();
  }

  _formatGridValue(mmValue) {
    const converted = this._mmToUnit(mmValue, this._displayUnit());
    if (converted === null) return '0';
    return this._formatNumber(converted);
  }

  _gridDisplayUnit(unit) {
    const normalized = this._normalizeUnit(unit);
    if (normalized === 'mm') return 'm';
    if (normalized === 'in') return 'ft';
    return normalized;
  }

  _gridStepCandidates(unit) {
    if (unit === 'in') return GRID_STEP_CANDIDATES.in;
    if (unit === 'ft') return GRID_STEP_CANDIDATES.ft;
    return GRID_STEP_CANDIDATES.default;
  }

  _countSteps(endInclusive, start, step) {
    if (!(step > 0) || !Number.isFinite(step)) return 0;
    return Math.floor((endInclusive - start) / step + 1e-6) + 1;
  }

  _roundKeyValue(value, precision = 1e6) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * precision) / precision;
  }

  _invalidateGridCache() {
    this._gridCache = null;
  }

  _invalidateConeCache() {
    this._coneRingsCache = null;
  }

  /** The grid step in mm: the smallest of the unit's candidate steps that
   *  draws lines at least GRID_MIN_SPACING_PX apart at `pxPerMm`. */
  _chooseGridStep(pxPerMm, spanMm, unit) {
    const unitMm = this._unitMultiplier(unit);
    const candidates = this._gridStepCandidates(unit);
    for (let scale = 0; scale < 4; scale++) {
      for (const stepUnits of candidates) {
        if (stepUnits <= 0) continue;
        const stepMm = stepUnits * unitMm * Math.pow(10, scale);
        if (stepMm * pxPerMm >= ZoneMapCard.GRID_MIN_SPACING_PX) return stepMm;
      }
    }
    return Math.max(unitMm, spanMm / 10);
  }

  _computeGridMetrics() {
    const unit = this._displayUnit();
    // At the zoom, so a zoomed map gets finer lines (and labels) wherever
    // the coarser step would leave them over GRID_MIN_SPACING_PX apart.
    const pxPerMmX = this.pxPerX || 0;
    const pxPerMmY = this.pxPerY || 0;
    // The part of the map on the canvas: the whole map at 1x.
    const spanX = Math.max(1, this._viewXMax - this._viewXMin);
    const spanY = Math.max(1, this._viewYMax - this._viewYMin);

    // A fitted grid draws both axes at the one step its edges were rounded
    // to. Picking each axis's step from its own px per mm drew X and Y lines
    // at different steps when 2 ft came out at exactly 40 px (float error
    // decided each axis), and could pick a step the edges were not rounded
    // to. A YAML grid can scale X and Y apart, so it keeps a step per axis.
    // Zoomed in, a fitted grid takes the finer step the zoom allows, still
    // one for both axes and never coarser than the fit's.
    let fittedStep = this._fittedStep();
    if (fittedStep !== null && this._zoom() > 1) {
      fittedStep = Math.min(
        fittedStep,
        this._chooseGridStep(Math.min(pxPerMmX, pxPerMmY), Math.max(spanX, spanY), unit),
      );
    }
    const stepX = fittedStep ?? this._chooseGridStep(pxPerMmX, spanX, unit);
    const stepY = fittedStep ?? this._chooseGridStep(pxPerMmY, spanY, unit);
    // The tolerance keeps an edge that is a whole number of steps, give or
    // take float error (a fitted grid in feet), from growing a line off the
    // canvas past it. Only the lines in the view's window are drawn.
    const startX = Math.floor(this._viewXMin / stepX + 1e-9) * stepX;
    const startY = Math.floor(this._viewYMin / stepY + 1e-9) * stepY;
    const endX = Math.ceil(this._viewXMax / stepX - 1e-9) * stepX;
    const endY = Math.ceil(this._viewYMax / stepY - 1e-9) * stepY;
    const countX = this._countSteps(endX, startX, stepX);
    const countY = this._countSteps(endY, startY, stepY);

    return {
      unit,
      labelUnit: this._gridDisplayUnit(unit),
      stepX,
      stepY,
      startX,
      startY,
      endX,
      endY,
      pxPerMmX,
      pxPerMmY,
      countX,
      countY,
      pixelStartX: this.valueToPixels(startX, 'x'),
      pixelStartY: this.valueToPixels(startY, 'y'),
      skipTolX: stepX * 0.001,
      skipTolY: stepY * 0.001,
      // A flipped map runs x right to left (valueToPixels), so each step
      // along it moves left.
      pixelStepX: (this._mirrorX ? -stepX : stepX) * pxPerMmX,
      pixelStepY: stepY * pxPerMmY,
    };
  }

  _getGridRenderState() {
    const canvasWidth = this.canvas?.width || 0;
    const canvasHeight = this.canvas?.height || 0;
    // The labels' clear space is set in CSS px, so a resized card lays them
    // out again. The frame's scale, so a frame reads the layout once.
    const labelGap = LABEL_GAP_CSS_PX * (this._frameScale || 1);
    const keyParts = [
      this._displayUnit(),
      this._roundKeyValue(this._fittedStep() ?? 0),
      this._roundKeyValue(this.xMin),
      this._roundKeyValue(this.xMax),
      this._roundKeyValue(this.yMin),
      this._roundKeyValue(this.yMax),
      this._roundKeyValue(this.pxPerX),
      this._roundKeyValue(this.pxPerY),
      // The view's window, which a pan moves at the same zoom.
      this._roundKeyValue(this._viewXMin),
      this._roundKeyValue(this._viewXMax),
      this._roundKeyValue(this._viewYMin),
      this._roundKeyValue(this._viewYMax),
      canvasWidth,
      canvasHeight,
      this.unitDisplay ? 1 : 0,
      this.unitLabelSize,
      this._roundKeyValue(labelGap, 1e3),
      this._mirrorX ? 1 : 0,
    ];
    const key = keyParts.join('|');
    if (this._gridCache && this._gridCache.key === key) {
      return this._gridCache;
    }

    const metrics = this._computeGridMetrics();
    const hasPath2D = typeof Path2D === 'function';
    const gridPath = hasPath2D ? new Path2D() : null;
    const xLines = [];
    const yLines = [];

    let pixelX = metrics.pixelStartX;
    for (let i = 0, x = metrics.startX; i < metrics.countX; i += 1, x += metrics.stepX) {
      const drawX = metrics.pixelStepX ? pixelX : this.valueToPixels(x, 'x');
      if (Number.isFinite(drawX)) {
        xLines.push({ pixel: drawX, value: x });
        if (gridPath) {
          gridPath.moveTo(drawX, 0);
          gridPath.lineTo(drawX, canvasHeight);
        }
      }
      if (metrics.pixelStepX) {
        pixelX += metrics.pixelStepX;
      }
    }

    let pixelY = metrics.pixelStartY;
    for (let i = 0, y = metrics.startY; i < metrics.countY; i += 1, y += metrics.stepY) {
      const drawY = metrics.pixelStepY ? pixelY : this.valueToPixels(y, 'y');
      if (Number.isFinite(drawY)) {
        yLines.push({ pixel: drawY, value: y });
        if (gridPath) {
          gridPath.moveTo(0, drawY);
          gridPath.lineTo(canvasWidth, drawY);
        }
      }
      if (metrics.pixelStepY) {
        pixelY += metrics.pixelStepY;
      }
    }

    const labels = this._buildGridLabels(
      metrics,
      xLines,
      yLines,
      canvasWidth,
      canvasHeight,
      labelGap,
    );
    this._gridCache = { key, metrics, gridPath, xLines, yLines, labels, labelGap };
    return this._gridCache;
  }

  /** Canvas backing px per CSS px. The backing store is a fixed 800 px that
   *  the card scales to its width. 1 while the canvas has no layout box.
   *  `rect` is the canvas's box where the caller has read it already. */
  _canvasScale(rect = this.canvas?.getBoundingClientRect?.()) {
    if (!this.canvas || !(this.canvas.width > 0)) return 1;
    const rendered = rect?.width;
    if (!(rendered > 0)) return 1;
    return this.canvas.width / rendered;
  }

  /** Sets `width` on each label: how wide its text draws at the label font,
   *  in backing px. A canvas that cannot measure gets an estimate instead. */
  _measureLabels(labels) {
    if (!labels.length) return;
    const ctx = this.ctx;
    const estimatePerChar = this.unitLabelSize * LABEL_FALLBACK_EM_PER_CHAR;
    if (ctx) {
      ctx.save();
      ctx.font = `${this.unitLabelSize}px sans-serif`;
    }
    labels.forEach((label) => {
      const measured = ctx?.measureText?.(label.text)?.width;
      label.width =
        typeof measured === 'number' && measured > 0
          ? measured
          : String(label.text).length * estimatePerChar;
    });
    if (ctx) ctx.restore();
  }

  /** The box a measured label covers when drawn at its align and baseline. */
  _labelBox(label) {
    const width = label.width || 0;
    const height = this.unitLabelSize;
    let left = label.x;
    if (label.align === 'center') left -= width / 2;
    else if (label.align === 'right') left -= width;
    let top = label.y;
    if (label.baseline === 'middle') top -= height / 2;
    else if (label.baseline === 'bottom') top -= height;
    return { left, right: left + width, top, bottom: top + height };
  }

  /** The clear space between two boxes, 0 when they touch or overlap. */
  _boxGap(a, b) {
    const dx = Math.max(0, a.left - b.right, b.left - a.right);
    const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
    return Math.hypot(dx, dy);
  }

  /** Whether every two of `labels` keep `gap` backing px between them. */
  _labelsClear(labels, gap) {
    const boxes = labels.map((label) => this._labelBox(label));
    return boxes.every((box, i) =>
      boxes.slice(i + 1).every((other) => this._boxGap(box, other) >= gap),
    );
  }

  /** One axis's labels thinned to every nth line, with n as small as keeps
   *  `gap` backing px between any two. Lines are counted from the origin, so
   *  the labels left are round values. Only labels go: every grid line stays. */
  _thinAxisLabels(labels, gap) {
    for (let every = 1; every <= labels.length; every += 1) {
      const kept = labels.filter((label) => label.index % every === 0);
      if (this._labelsClear(kept, gap)) return kept;
    }
    return [];
  }

  /**
   * The grid labels and cone ring labels to draw, laid out together.
   *
   * A ring label is left out when a grid label at the same distance from the
   * radar sits close by, because that grid label already names the ring. Any
   * other ring label is drawn, and a grid label it would crowd is left out
   * instead: that label's grid line and the labels on either side of it still
   * give its value. Two kinds of grid label stay put: one that names a ring
   * left out above, and one next to a ring label the canvas edge cuts. A ring
   * label may crowd one of those, but it is left out if it would overlap one.
   *
   * Returns `{ grid: { x, y }, rings }`. The cached grid labels are not changed.
   */
  _layOutLabels(ringLabels, gridState) {
    const grid = gridState?.labels || { x: [], y: [] };
    if (!ringLabels?.length) return { grid, rings: [] };
    const gap = gridState?.labelGap ?? LABEL_GAP_CSS_PX;
    const repeatGap = RING_LABEL_REPEAT_EM * this.unitLabelSize;
    const width = this.canvas?.width || 0;
    const height = this.canvas?.height || 0;
    const placed = [...grid.x, ...grid.y].map((label) => ({ label, box: this._labelBox(label) }));
    const rings = ringLabels.map((label) => ({ ...label, align: 'center', baseline: 'middle' }));
    this._measureLabels(rings);
    const ringBoxes = rings.map((ring) => this._labelBox(ring));

    // Which rings a grid label already names, and the grid labels that do.
    const namers = new Set();
    const named = rings.map((ring, i) => {
      const repeats = placed.filter(
        (item) =>
          Math.abs(Math.abs(item.label.value) - ring.value) <= RING_LABEL_SAME_DISTANCE_MM &&
          this._boxGap(ringBoxes[i], item.box) < repeatGap,
      );
      repeats.forEach((item) => namers.add(item));
      return repeats.length > 0;
    });

    const dropped = new Set();
    const shown = rings.filter((ring, i) => {
      if (named[i]) return false;
      const box = ringBoxes[i];
      const onCanvas = box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height;
      const crowded = placed.filter((item) => this._boxGap(box, item.box) < gap);
      const fixed = crowded.filter((item) => !onCanvas || namers.has(item));
      if (fixed.some((item) => this._boxGap(box, item.box) === 0)) return false;
      crowded.forEach((item) => {
        if (!fixed.includes(item)) dropped.add(item.label);
      });
      return true;
    });
    if (!dropped.size) return { grid, rings: shown };
    return {
      grid: {
        x: grid.x.filter((label) => !dropped.has(label)),
        y: grid.y.filter((label) => !dropped.has(label)),
      },
      rings: shown,
    };
  }

  _buildGridLabels(metrics, xLines, yLines, canvasWidth, canvasHeight, gap = LABEL_GAP_CSS_PX) {
    const labelData = { x: [], y: [] };
    if (!this.unitDisplay) return labelData;

    const y0 = this.valueToPixels(0, 'y');
    let xLabelY;
    let xBaseline;
    if (Number.isFinite(y0) && y0 >= 0 && y0 <= canvasHeight) {
      const margin = 2;
      if (y0 > this.unitLabelSize + margin) {
        xLabelY = y0 - margin;
        xBaseline = 'bottom';
      } else {
        xLabelY = y0 + margin;
        xBaseline = 'top';
      }
    } else if (Number.isFinite(y0) && y0 < 0) {
      // The radar's line is above the canvas (a map zoomed in on the room,
      // or a YAML grid that starts past it): the labels run along the top
      // edge, the nearer one, as they do on a fitted map at 1x.
      xLabelY = 2;
      xBaseline = 'top';
    } else {
      xLabelY = canvasHeight - 2;
      xBaseline = 'bottom';
    }

    const width = canvasWidth;
    const height = canvasHeight;

    xLines.forEach(({ pixel, value }) => {
      if (!Number.isFinite(pixel) || pixel < -40 || pixel > width + 40) return;
      if (Math.abs(value) < metrics.skipTolX) return;
      const label = this._formatTickLabel(value, metrics.stepX, metrics.labelUnit);
      labelData.x.push({
        x: pixel,
        y: xLabelY,
        value,
        text: label,
        align: 'center',
        baseline: xBaseline,
        index: Math.round(value / metrics.stepX),
      });
    });

    const x0 = this.valueToPixels(0, 'x');
    let yLabelX;
    let yAlign;
    if (Number.isFinite(x0) && x0 >= 0 && x0 <= width) {
      const margin = 4;
      if (x0 > this.unitLabelSize + margin * 2) {
        yLabelX = x0 - margin;
        yAlign = 'right';
      } else {
        yLabelX = x0 + margin;
        yAlign = 'left';
      }
    } else if (Number.isFinite(x0) && x0 > width) {
      // The same along the nearer side edge.
      yLabelX = width - 2;
      yAlign = 'right';
    } else {
      yLabelX = 2;
      yAlign = 'left';
    }

    yLines.forEach(({ pixel, value }) => {
      if (!Number.isFinite(pixel) || pixel < -40 || pixel > height + 40) return;
      if (Math.abs(value) < metrics.skipTolY) return;
      const label = this._formatTickLabel(value, metrics.stepY, metrics.labelUnit);
      labelData.y.push({
        x: yLabelX,
        y: pixel,
        value,
        text: label,
        align: yAlign,
        baseline: 'middle',
        index: Math.round(value / metrics.stepY),
      });
    });

    // A label cut by the canvas edge reads as a fragment ("m"), so a label
    // that runs off the end of its axis is left out. Then each axis keeps
    // every nth label, so that none overlaps its neighbor. At 0.5 m steps on
    // an 800 px canvas, "-4.5m" is wider than the 40 px between lines.
    this._measureLabels([...labelData.x, ...labelData.y]);
    const xFits = labelData.x.filter((item) => {
      const box = this._labelBox(item);
      return box.left >= 0 && box.right <= width;
    });
    const yFits = labelData.y.filter((item) => {
      const box = this._labelBox(item);
      return box.top >= 0 && box.bottom <= height;
    });
    labelData.x = this._thinAxisLabels(xFits, gap);
    labelData.y = this._thinAxisLabels(yFits, gap);
    return labelData;
  }

  _formatTickLabel(mmValue, stepMm, displayUnit) {
    const unitMm = this._unitMultiplier(displayUnit);
    const stepUnits = stepMm / unitMm;
    const isIntegerStep = Math.abs(stepUnits - Math.round(stepUnits)) < 1e-6;
    let decimals = 0;
    if (!isIntegerStep && stepUnits >= 1) decimals = 1;
    else if (stepUnits < 1 && stepUnits >= 0.5) decimals = 1;
    else if (stepUnits < 0.5) decimals = 2;
    const valUnits = this._mmToUnit(mmValue, displayUnit) || 0;
    const rounded = Number(valUnits.toFixed(decimals));
    // "5 ft" reads as feet; "5ft" reads as a typo. Meters stay "2m", as the
    // labels always were.
    const unitLabel = this._unitLabel(displayUnit);
    return unitLabel === 'ft' ? `${rounded} ft` : `${rounded}${unitLabel}`;
  }

  _persistRotation() {
    // No toast on success: the slider is dragged constantly and the angle is
    // its own feedback. A rejection still has to be said out loud.
    return this._saveZoneUpdate(
      { device_id: this.deviceId, rotation_deg: this.coneAngleDeg },
      null,
    );
  }

  _setDrawMode(mode) {
    const nextMode = mode || DRAW_MODES.RECT;
    if (this.drawMode === nextMode) {
      // Re-selecting the active mode, or the call at the end of every
      // render() (a theme flip, a same-radar setConfig), leaves a shape in
      // progress alone. Clearing just `isDrawing` would hide placed polygon
      // vertices that Finish, Backspace and the next click still act on. The
      // rebuilt buttons still need their highlight.
      this._highlightActiveModeButton();
      this._updatePolygonButtonsVisibility();
      return;
    }
    // Walk starts only through _enterWalk, which checks who is viewing and
    // the lock and sets up its corners first.
    if (nextMode === DRAW_MODES.WALK && !this._walk) {
      this._enterWalk();
      return;
    }
    // Any other mode ends a walk, and its corners go without asking.
    if (this.drawMode === DRAW_MODES.WALK) {
      this._walk = null;
      this._modeBeforeWalk = null;
      this._walkConfirmCancel = false;
    }
    this.drawMode = nextMode;
    // A shape drawn in one mode cannot be finished in another.
    this._resetDrawingState();
    this._highlightActiveModeButton();
    this._updatePolygonButtonsVisibility();
    // Into or out of Walk, which has its panel, lets the canvas pan and
    // keeps History shut.
    this._updateCanvasTouchMode();
    this._renderWalkPanel();
    this._renderWalkChip();
    this._renderHistoryChip();
    this._invalidateGridCache();
    this._refitAndDraw();
  }

  _highlightActiveModeButton() {
    const rectBtn = this.shadowRoot?.getElementById('btnModeRect');
    const ellipseBtn = this.shadowRoot?.getElementById('btnModeEllipse');
    const polyBtn = this.shadowRoot?.getElementById('btnModePolygon');
    const walkBtn = this.shadowRoot?.getElementById('btnModeWalk');
    [rectBtn, ellipseBtn, polyBtn, walkBtn].forEach((btn) => {
      if (!btn) return;
      const shouldActivate =
        (btn === rectBtn && this.drawMode === DRAW_MODES.RECT) ||
        (btn === ellipseBtn && this.drawMode === DRAW_MODES.ELLIPSE) ||
        (btn === polyBtn && this.drawMode === DRAW_MODES.POLYGON) ||
        (btn === walkBtn && this.drawMode === DRAW_MODES.WALK);
      btn.classList.toggle('active', shouldActivate);
    });
  }

  _setSelectedZone(zoneId) {
    if (zoneId === null || zoneId === undefined) {
      this.selectedZone = null;
      this._updateCanvasTouchMode();
      return;
    }
    this.selectedZone = Number(zoneId);
    this._updateCanvasTouchMode();
    const buttons = this.shadowRoot?.querySelectorAll('.zone-btn[data-zone-id]');
    if (!buttons) return;
    buttons.forEach((btn) => {
      const targetId = Number(btn.dataset.zoneId);
      btn.classList.toggle('active', targetId === this.selectedZone);
    });
  }

  /**
   * Whether a touch on the canvas belongs to the page rather than to drawing:
   * the map is locked, Walk is on (corners come from the radar, not the
   * finger), or no zone is selected, so nothing could be drawn. A new radar's
   * map starts unlocked with no zones, and a phone must still scroll past it.
   */
  _canvasPans() {
    return (
      !!this.isLocked ||
      this.drawMode === DRAW_MODES.WALK ||
      this.selectedZone === null ||
      this.selectedZone === undefined
    );
  }

  /** The canvas's touch-action follows _canvasPans (CSS `canvas.pans`). The
   *  touch handlers leave such a touch alone, but under the canvas's own
   *  touch-action: none the browser still would not scroll for it. */
  _updateCanvasTouchMode() {
    if (this.canvas) this.canvas.classList.toggle('pans', this._canvasPans());
  }

  /** Undo the last polygon vertex (Backspace or the undo button). Popping
   *  the only one also drops `startPoint`, the press that placed it: with no
   *  vertices left, `_drawInProgress` draws a dot and anchors the rubber band
   *  there, so the removed vertex stayed on the canvas until the next press. */
  _popPolyPoint() {
    this._polyPoints.pop();
    if (!this._polyPoints.length) this.startPoint = null;
    this.drawGrid();
  }

  _resetDrawingState() {
    this.isDrawing = false;
    this._polyPoints = [];
    this._cursorPoint = null;
    this.startPoint = null;
    this._cursorFree = false;
    this._lastPolyTap = 0;
    this._activeInput = null;
    this._activeTouchId = null;
  }

  _getZone(zoneId) {
    return this.zones.find((zone) => Number(zone.id) === Number(zoneId)) || null;
  }

  _zoneLabel(zoneId) {
    if (zoneId === null || zoneId === undefined) {
      return 'Zone';
    }
    const numericId = Number(zoneId);
    const configZone = (this.zoneConfig || []).find(
      (zone) => Number(zone.id) === Number(numericId),
    );
    const name = typeof configZone?.name === 'string' ? configZone.name.trim() : '';
    if (name) {
      return name;
    }
    if (!Number.isNaN(numericId)) {
      return `Zone ${numericId}`;
    }
    return `Zone ${zoneId}`;
  }

  _upsertZone(zoneId, shape, data) {
    const index = this.zones.findIndex((zone) => Number(zone.id) === Number(zoneId));
    const entry = { id: Number(zoneId), shape, data };
    if (index === -1) {
      this.zones.push(entry);
    } else {
      this.zones[index] = entry;
    }
  }

  _removeZone(zoneId) {
    const index = this.zones.findIndex((zone) => Number(zone.id) === Number(zoneId));
    if (index !== -1) {
      this.zones.splice(index, 1);
    }
  }

  _clearZone(zoneId, notifyBackend = false) {
    if (notifyBackend) {
      this._setUndoSnapshot(this._snapshotZones([zoneId]));
    }
    this._removeZone(zoneId);
    this._renderZoneSizes();
    if (notifyBackend) {
      this.updateHomeAssistantShape(zoneId, 'none', null, `${this._zoneLabel(zoneId)} cleared`);
    }
    if (Number(this.selectedZone) === Number(zoneId)) {
      this._resetDrawingState();
    }
    this.drawGrid();
  }

  _clearAllZones() {
    // TODO(REVIEW_REPORT.md X43): this and undo write shape none for YAML-seeded ids the store
    // never held. Consider clearing only ids in this.zones or the payload; no delete from undo.
    const zoneIds = (this.zoneConfig || []).map((zone) => zone.id);
    this._setUndoSnapshot(this._snapshotZones(zoneIds));
    this.zones = [];
    this._renderZoneSizes();
    this._resetDrawingState();
    this.drawGrid();
    if (!zoneIds.length) return;
    // One toast for the batch, and only if every zone actually cleared. A
    // partial failure has already said which one refused.
    Promise.all(zoneIds.map((id) => this.updateHomeAssistantShape(id, 'none', null))).then(
      (saved) => {
        if (saved.every(Boolean)) this._notify('All zones cleared');
      },
    );
  }

  endDrawing(e) {
    // Only the primary button draws (see startDrawing). A polygon keeps
    // isDrawing set between vertices, so a right-button release would
    // otherwise still place a vertex.
    if (typeof e.button === 'number' && e.button !== 0) return;
    if (!this.isDrawing) return;
    const isTouch = !!(e.changedTouches || e.touches);
    if (
      this._activeInput &&
      ((isTouch && this._activeInput !== 'touch') || (!isTouch && this._activeInput !== 'mouse'))
    ) {
      return;
    }
    // Another finger lifting is not the end of this gesture.
    if (isTouch && !this._carriesTrackedTouch(e)) return;
    // The selection can go away mid-gesture (a payload with no zones, or
    // Delete on the only zone during a held touch). Committing then would
    // upsert a zone with id 0 that the backend refuses but the map still
    // draws, so drop the gesture the way finishPolygon does.
    if (this.selectedZone === null || this.selectedZone === undefined) {
      this.cancelDrawing();
      return;
    }
    if (this.drawMode === DRAW_MODES.POLYGON) {
      const p = this._getPointFromEvent(e);
      if (!p) {
        this.cancelDrawing();
        return;
      }
      const now = Date.now();
      // Double-tap / double-click detection for finishing polygon on mobile.
      // The second tap is the gesture, not a vertex, so it is never pushed.
      if (this._isPolyFinishTap(p, now)) {
        if (this._polyPoints.length >= 3) this.finishPolygon();
        // The polygon stays open for the corners it still needs, but a finish
        // that does nothing has to say why.
        else this._notifyThrottled(POLY_TOO_FEW_TOAST);
        return;
      }
      // Add a vertex on each other mouse/touch end, snapped unless Alt or
      // Option is held.
      const placed = this._placeMm(p, !!e.altKey);
      const vx = this._clampAndRound(placed.x, this.xMin, this.xMax);
      const vy = this._clampAndRound(placed.y, this.yMin, this.yMax);
      if (this._polyPoints.length < this.polyMaxPoints) {
        this._polyPoints.push({ x: vx, y: vy });
        // Auto-finish if we hit max and have at least 3 points
        if (this._polyPoints.length === this.polyMaxPoints && this._polyPoints.length >= 3) {
          this.finishPolygon();
          return;
        }
        this._lastPolyTap = now;
      }
      this.drawGrid();
      return;
    }
    this.isDrawing = false;
    if (!this.startPoint) {
      this._activeInput = null;
      this._activeTouchId = null;
      return;
    }
    const endPoint = this._getPointFromEvent(e);
    this._activeTouchId = null;
    if (!endPoint) {
      this.cancelDrawing();
      return;
    }
    // The release places the last corner, freely if Alt or Option is held.
    this._cursorFree = !!e.altKey;
    const payload = this._shapeFromDrag(this.startPoint, endPoint, this.drawMode);
    if (!payload) {
      // A click, a tap or a perfectly straight drag has no area. The backend
      // only keeps a rect with x_min < x_max and y_min < y_max and clears the
      // zone for anything else, so saving this would wipe the zone's current
      // shape. Drop the gesture silently, like a drag that leaves the canvas.
      this.cancelDrawing();
      return;
    }
    this._commitZoneShape(this.selectedZone, payload);
    this._activeInput = null;
    this.startPoint = null;
    this._cursorPoint = null;
  }

  /**
   * The `{ shape, data }` a rect or ellipse drag from canvas point `startPx`
   * to `endPx` (backing px) saves, in whole mm clamped to the map, or null
   * for a rect with no area. `startPx` is the corner as placed when pressed
   * (startDrawing snaps it), and `endPx` snaps here (see _placeMm) unless
   * Alt or Option is held (_cursorFree). Anything that shows a drag's
   * result (the size readout) reads it from here, so it always matches what
   * is saved.
   */
  _shapeFromDrag(startPx, endPx, mode) {
    const start = this._placeMm(startPx, true);
    const end = this._placeMm(endPx, this._cursorFree);
    if (mode === DRAW_MODES.RECT) {
      return this._rectFromMm(start.x, start.y, end.x, end.y);
    }
    if (mode === DRAW_MODES.ELLIPSE) {
      // Bounding box -> ellipse center/radii. The corners are clamped to the
      // grid first, like the rect's: a touch keeps reporting after the finger
      // leaves the canvas, and an unclamped corner gave an edge-pinned center
      // with a radius reaching past the grid.
      const x1 = this._clampValue(start.x, this.xMin, this.xMax);
      const y1 = this._clampValue(start.y, this.yMin, this.yMax);
      const x2 = this._clampValue(end.x, this.xMin, this.xMax);
      const y2 = this._clampValue(end.y, this.yMin, this.yMax);
      const cx = this._clampAndRound((x1 + x2) / 2, this.xMin, this.xMax);
      const cy = this._clampAndRound((y1 + y2) / 2, this.yMin, this.yMax);
      const rx = Math.max(1, Math.round(Math.abs(x2 - x1) / 2));
      const ry = Math.max(1, Math.round(Math.abs(y2 - y1) / 2));
      return { shape: DRAW_MODES.ELLIPSE, data: { cx, cy, rx, ry } };
    }
    // A polygon is saved by finishPolygon, from its vertices.
    return null;
  }

  /**
   * The rect two corners in mm span, in whole mm clamped to the map, as the
   * `{ shape, data }` a save carries, or null when it has no area. Shared by
   * a dragged rect and one marked by walking to two corners.
   */
  _rectFromMm(x1, y1, x2, y2) {
    const xMin = this._clampAndRound(Math.min(x1, x2), this.xMin, this.xMax);
    const xMax = this._clampAndRound(Math.max(x1, x2), this.xMin, this.xMax);
    const yMin = this._clampAndRound(Math.min(y1, y2), this.yMin, this.yMax);
    const yMax = this._clampAndRound(Math.max(y1, y2), this.yMin, this.yMax);
    if (xMin === xMax || yMin === yMax) return null;
    return {
      shape: DRAW_MODES.RECT,
      data: { x_min: xMin, x_max: xMax, y_min: yMin, y_max: yMax },
    };
  }

  /**
   * The snap for corners drawn now, in mm (see ./snap): about a tenth of
   * the grid step the map shows at its zoom, in the map's unit, so 10 cm at
   * a 1 m grid and 2 in at a 2 ft one. A YAML grid with a step per axis
   * snaps both axes to the finer one's.
   */
  _snapStep() {
    const { stepX, stepY } = this._computeGridMetrics();
    return snapStepMm(Math.min(stepX, stepY), this._unitFamily(this._displayUnit()));
  }

  /**
   * The map point (mm) a corner drawn at canvas point `px` (backing px)
   * goes to: on the nearest round value of the snap, or right under the
   * pointer when `free` (Alt or Option held). Not clamped or rounded yet:
   * the shape's save does both, so what is saved is the snapped point in
   * whole mm. A walked corner never comes through here.
   */
  _placeMm(px, free = false) {
    const at = { x: this.pixelsToValue(px.x, 'x'), y: this.pixelsToValue(px.y, 'y') };
    if (free) return at;
    const step = this._snapStep();
    return { x: snapMm(at.x, step), y: snapMm(at.y, step) };
  }

  /** Alt or Option pressed (`free`) or let go while a shape is drawn: the
   *  pointer's corner and the readout follow at once, with no move needed.
   *  A corner already placed stays where it went. */
  _setCursorFree(free) {
    if (!this.isDrawing || this._cursorFree === free) return;
    this._cursorFree = free;
    this.drawGrid();
  }

  /** `px` (backing px) moved to where _placeMm puts its corner, for the
   *  previews, so they show the corner where it will be saved. */
  _placedPx(px, free = false) {
    const at = this._placeMm(px, free);
    return { x: this.valueToPixels(at.x, 'x'), y: this.valueToPixels(at.y, 'y') };
  }

  /**
   * Save a finished rect or ellipse as zone `zoneId`'s shape: an undo
   * snapshot of what it replaces, the new shape on the map at once, and the
   * write, which toasts "<label> saved" once Home Assistant takes it.
   */
  _commitZoneShape(zoneId, payload) {
    this._setUndoSnapshot(this._snapshotZones([zoneId]));
    this._upsertZone(zoneId, payload.shape, payload.data);
    this._renderZoneSizes();
    // The save's echo fits the map again, but a refused save sends none.
    this._refitAndDraw();
    const savedMessage =
      zoneId === null || zoneId === undefined ? null : `${this._zoneLabel(zoneId)} saved`;
    return this.updateHomeAssistantShape(zoneId, payload.shape, payload.data, savedMessage);
  }

  /** Whether a polygon tap at canvas point `p` (backing px) finishes the
   *  polygon: it came within 350 ms of the previous vertex AND landed within
   *  POLY_DOUBLE_TAP_SLOP_PX CSS px of the last placed vertex. Time alone is
   *  not a double-tap: two quick taps at different spots are two vertices. */
  _isPolyFinishTap(p, now) {
    if (!this._lastPolyTap || now - this._lastPolyTap >= 350) return false;
    const last = this._polyPoints[this._polyPoints.length - 1];
    if (!last || !this.canvas) return false;
    const rect = this.canvas.getBoundingClientRect();
    const cssPerPxX = this.canvas.width ? rect.width / this.canvas.width : 1;
    const cssPerPxY = this.canvas.height ? rect.height / this.canvas.height : 1;
    const dx = (p.x - this.valueToPixels(last.x, 'x')) * cssPerPxX;
    const dy = (p.y - this.valueToPixels(last.y, 'y')) * cssPerPxY;
    return Math.hypot(dx, dy) <= POLY_DOUBLE_TAP_SLOP_PX;
  }

  /** The event's position in canvas backing px, or null when there is no
   *  usable point: a canvas with no layout box (a hidden tab or a collapsed
   *  container) would divide by zero and pin every shape to the grid corner.
   *  A touch event is read at finger `touchId` (the tracked one by default),
   *  and has no point when that finger is not in it. */
  _getPointFromEvent(e, touchId = this._activeTouchId) {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    let source = e;
    if (e.touches || e.changedTouches) {
      source = this._touchFor(e, touchId);
      if (!source) return null;
    }
    const x = (source.clientX - rect.left) * scaleX;
    const y = (source.clientY - rect.top) * scaleY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  /** The Touch of finger `touchId` in a touch event: its live position in
   *  `touches`, else its last one in `changedTouches` (a lifted finger is only
   *  there). With no finger tracked the first touch stands in, which is all an
   *  event without identifiers offers. Null when the finger is absent. */
  _touchFor(e, touchId) {
    if (touchId === null || touchId === undefined) {
      return (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null;
    }
    return findTouch(e.touches, touchId) || findTouch(e.changedTouches, touchId);
  }

  /** The identifier of the finger a touchstart is about, or null when the
   *  event carries none to track. */
  _touchIdOf(e) {
    const touch = e.changedTouches && e.changedTouches[0];
    return touch && typeof touch.identifier === 'number' ? touch.identifier : null;
  }

  /** Whether a touch event is about the tracked finger. Every touch event is
   *  when no finger is tracked. */
  _carriesTrackedTouch(e) {
    if (this._activeTouchId === null) return true;
    return findTouch(e.changedTouches, this._activeTouchId) !== null;
  }

  /** A cancelled touch never finished, so nothing it drew is committed. A
   *  rect or ellipse drag is dropped. A polygon keeps its placed vertices, as
   *  when the mouse leaves the canvas, and only loses the rubber-band line and
   *  the finger. A cancelled finger other than the tracked one changes
   *  nothing, as its touchend would not. */
  _cancelTouch(e) {
    if (!this.isDrawing || !this._carriesTrackedTouch(e)) return;
    if (this.drawMode === DRAW_MODES.POLYGON) {
      this._cursorPoint = null;
      this._activeInput = null;
      this._activeTouchId = null;
      this.drawGrid();
      return;
    }
    this.cancelDrawing();
  }

  _snapshotZones(zoneIds) {
    const snap = [];
    (zoneIds || []).forEach((rawId) => {
      const id = Number(rawId);
      if (!Number.isFinite(id) || id <= 0) return;
      const existing = (this.zones || []).find((z) => Number(z.id) === id);
      if (existing) {
        snap.push({ zoneId: id, shape: existing.shape, data: existing.data });
      } else {
        snap.push({ zoneId: id, shape: 'none', data: null });
      }
    });
    return snap;
  }

  _setUndoSnapshot(snap) {
    this._undoSnapshot = snap && snap.length ? snap : null;
    this._refreshUndoButton();
  }

  _refreshUndoButton() {
    const btn = this.shadowRoot?.getElementById('btnUndo');
    if (!btn) return;
    btn.disabled = !(this._undoSnapshot && this._undoSnapshot.length);
  }

  _performUndo() {
    if (!this._undoSnapshot || !this._undoSnapshot.length) return;
    const snap = this._undoSnapshot;
    this._undoSnapshot = null;
    const writes = snap.map(({ zoneId, shape, data }) => {
      if (shape === 'none' || !data) {
        this._removeZone(zoneId);
      } else {
        this._upsertZone(zoneId, shape, data);
      }
      return this.updateHomeAssistantShape(
        zoneId,
        shape || 'none',
        data == null ? null : data,
      );
    });
    this._renderZoneSizes();
    this.drawGrid();
    Promise.all(writes).then((saved) => {
      if (saved.every(Boolean)) this._notify('Undid last zone change');
    });
    this._refreshUndoButton();
  }

  /**
   * Save one zone's geometry.
   *
   * The pair list is deliberately absent. Sending the card's in-memory copy on
   * every zone edit is what erased two customers' configuration: a card that
   * had not finished loading sent an empty one, and the service took it.
   */
  updateHomeAssistantShape(zoneId, shape, data, successMessage = null) {
    if (!this._hass) return Promise.resolve(false);
    const numericZoneId = Number(zoneId);
    if (!Number.isFinite(numericZoneId) || numericZoneId <= 0) {
      return Promise.resolve(false);
    }
    return this._saveZoneUpdate(
      {
        device_id: this.deviceId,
        zone_id: numericZoneId,
        shape,
        data,
      },
      successMessage,
    );
  }

  _applyAutoLock() {
    // An explicit start_locked in config always wins. Otherwise use the last
    // toggle remembered for this radar, and fall back to locking whenever
    // zones already exist. Only runs once per page load.
    if (this._autoLockApplied) return;
    if (this._lockConfigured) {
      this._autoLockApplied = true;
      return;
    }
    const stored = readStoredLock(this.deviceId);
    this.isLocked = stored !== null ? stored : (this.zones || []).length > 0;
    this._autoLockApplied = true;
    if (typeof this._updateLockVisual === 'function') {
      this._updateLockVisual();
    }
  }

  _renderZoneManager() {
    const host = this.shadowRoot?.getElementById('zoneManager');
    if (!host) return;
    // Every payload rebuilds these rows, and the card's own Add Zone and
    // rotation writes echo back as payloads, as does any other client's save.
    // What the user is typing, and where the caret is, has to outlive that.
    const drafts = this._captureZoneNameDrafts(host);
    host.innerHTML = '';
    const zones = (this.zoneConfig || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
    const admin = this._isAdmin();
    if (zones.length) {
      // What the two selects on each row do, said once above the rows. A
      // disabled select's title never reaches touch or keyboard users, so a
      // viewer is told in plain text why they cannot change them.
      const hint = document.createElement('div');
      hint.className = 'zone-settings-hint';
      hint.textContent = ZONE_SETTINGS_HINT;
      host.appendChild(hint);
      if (!admin) {
        const note = document.createElement('div');
        note.className = 'zone-settings-hint zone-settings-note';
        note.textContent = ADMIN_ONLY_NOTE;
        host.appendChild(note);
      }
    }
    zones.forEach((z) => {
      const row = document.createElement('div');
      row.className = 'entity-row';
      const label = document.createElement('label');
      label.textContent = `Zone ${z.id}`;
      const input = document.createElement('input');
      input.type = 'text';
      const storedName = z.name || `Zone ${z.id}`;
      input.value = storedName;
      input.placeholder = `Zone ${z.id}`;
      // What the row was built with, so the next rebuild can tell an edit.
      input.dataset.zoneId = String(z.id);
      input.dataset.storedName = storedName;
      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';

      saveBtn.addEventListener('click', () => {
        const newName = input.value?.trim() || `Zone ${z.id}`;
        // By id, at click time: _applyZones replaces every zoneConfig entry on
        // each payload, so the `z` this row was built from may be a stale copy.
        const current = (this.zoneConfig || []).find((zz) => String(zz.id) === String(z.id));
        if (current) current.name = newName;
        // Persist the friendly name to backend. A stored zone keeps its
        // shape and data; one only the YAML names is created without a shape.
        if (this._hass) {
          const zoneId = Number(z.id);
          if (!Number.isFinite(zoneId) || zoneId <= 0) {
            this._notify('Unable to save name: invalid zone id');
            return;
          }
          const rename = { device_id: this.deviceId, zone_id: zoneId, name: newName };
          const payload = this._zoneIsUnsaved(zoneId)
            ? { ...rename, shape: 'none', data: null }
            : rename;
          this._saveZoneUpdate(payload, `${this._zoneLabel(z.id)} saved`);
        }
        this.renderZoneButtons();
        this.drawGrid();
      });

      delBtn.addEventListener('click', () => {
        const label = this._zoneLabel(z.id);
        // Delete the zone and remove its entities
        if (this._hass) {
          const zoneId = Number(z.id);
          if (!Number.isFinite(zoneId) || zoneId <= 0) {
            this._notify('Unable to delete: invalid zone id');
            return;
          }
          this._saveZoneUpdate(
            { device_id: this.deviceId, zone_id: zoneId, delete: true },
            `${label} deleted`,
          );
        }
        // Remove from UI state
        this.zoneConfig = (this.zoneConfig || []).filter((zz) => String(zz.id) !== String(z.id));
        this.zones = (this.zones || []).filter((zz) => String(zz.id) !== String(z.id));
        if (String(this.selectedZone) === String(z.id)) this.selectedZone = null;
        // Undo writes every snapshot entry back, and the backend stores any
        // zone id it is given, so an entry for this zone would re-create it and
        // its entities (or overwrite a zone added later under the freed id).
        // Delete itself is not undoable; the other entries still are.
        const removedId = Number(z.id);
        this._setUndoSnapshot((this._undoSnapshot || []).filter((s) => s.zoneId !== removedId));
        this.renderZoneButtons();
        this._renderZoneManager();
        this.drawGrid();
      });

      // The first line stays label, name, Save and Delete; the second spans
      // the row under them.
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(saveBtn);
      row.appendChild(delBtn);
      row.appendChild(this._zoneMetaLine(z.id, admin));
      host.appendChild(row);
    });
    this._restoreZoneNameDrafts(host, drafts);
  }

  /**
   * A zone row's second line: the zone's size (what _renderZoneSizes keeps
   * current), then its Type and its Hold. Only an administrator can save
   * either, and an ignore zone never holds, so its Hold is disabled too.
   * The selects carry data-zone, never data-zone-id, which marks the name
   * inputs whose drafts a rebuild keeps.
   *
   * A select shows its newest choice while that choice's save is on its
   * way, not what the store holds: the echo of an earlier save rebuilds the
   * rows, and the next arrow key would step from the older value.
   */
  _zoneMetaLine(zoneId, admin) {
    const stored = this._zoneMeta.get(Number(zoneId)) || { type: 'detect', holdS: 0 };
    const pending = (setting) =>
      this._zoneSettingPending.get(`${Number(zoneId)}:${setting}`)?.value;
    const meta = {
      ...stored,
      type: pending('zone_type') ?? stored.type,
      holdS: pending('hold_s') ?? stored.holdS,
    };
    const line = document.createElement('div');
    line.className = 'zone-meta';

    const size = document.createElement('span');
    size.className = 'zone-size';
    size.dataset.zone = String(zoneId);
    size.textContent = this._zoneSizeText(zoneId);
    line.appendChild(size);

    const type = this._zoneSettingSelect(zoneId, 'zone_type', TYPE_OPTIONS, meta.type);
    type.className = 'zone-type';
    type.disabled = !admin;
    type.title = admin ? TYPE_TITLE : ADMIN_ONLY_TITLE;
    line.appendChild(this._zoneSettingLabel(TYPE_LABEL, type));

    // A hold the list does not offer (saved through the service) still shows,
    // as one more option in its place by length.
    const holds = HOLD_OPTIONS.includes(meta.holdS)
      ? HOLD_OPTIONS
      : [...HOLD_OPTIONS, meta.holdS].sort((a, b) => a - b);
    const hold = this._zoneSettingSelect(
      zoneId,
      'hold_s',
      holds.map((seconds) => ({ value: String(seconds), label: formatHold(seconds) })),
      String(meta.holdS),
    );
    hold.className = 'zone-hold';
    const ignore = meta.type === 'ignore';
    hold.disabled = !admin || ignore;
    if (!admin) hold.title = ADMIN_ONLY_TITLE;
    else hold.title = ignore ? HOLD_IGNORE_TITLE : HOLD_TITLE;
    line.appendChild(this._zoneSettingLabel(HOLD_LABEL, hold));
    return line;
  }

  /** A select for zone setting `setting` (a key update_zone takes) that
   *  saves each change on its own. */
  _zoneSettingSelect(zoneId, setting, options, value) {
    const select = document.createElement('select');
    select.id = `zoneSetting-${setting}-${zoneId}`;
    select.dataset.zone = String(zoneId);
    select.dataset.zoneSetting = setting;
    options.forEach((option) => {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      select.appendChild(element);
    });
    select.value = value;
    select.addEventListener('change', () => {
      const chosen = setting === 'hold_s' ? Number(select.value) : select.value;
      this._saveZoneSetting(zoneId, { [setting]: chosen });
    });
    return select;
  }

  /** `select` with its visible label, kept together when the line wraps. */
  _zoneSettingLabel(text, select) {
    const wrap = document.createElement('span');
    wrap.className = 'zone-setting';
    const label = document.createElement('label');
    label.htmlFor = select.id;
    label.textContent = text;
    wrap.appendChild(label);
    wrap.appendChild(select);
    return wrap;
  }

  /**
   * Save one zone setting (`{ zone_type }` or `{ hold_s }`) for zone
   * `zoneId`. A zone only the card YAML names is created with it, the way a
   * rename creates one. A setting changes nothing about how readings scale,
   * so input_units stays out, as with the flip. Each change saves, and until
   * the newest save for this select settles, a rebuild shows its value
   * (_zoneMetaLine). Only that save settles the select: refused, the rows
   * are built again from what the store holds, which also puts back a Hold
   * that a pending Ignore disabled; accepted, the save's echo rebuilt the
   * row. An older save settles nothing, so it cannot undo a newer choice.
   */
  async _saveZoneSetting(zoneId, fields) {
    const id = Number(zoneId);
    const [setting] = Object.keys(fields);
    // A disabled select gets no change event, but nothing that still reaches
    // one (a screen reader, say) saves for a viewer.
    if (!this._isAdmin() || !Number.isFinite(id) || id <= 0) {
      this._revertZoneSetting(id, setting);
      return false;
    }
    const payload = {
      device_id: this.deviceId,
      zone_id: id,
      ...fields,
      ...(this._zoneIsUnsaved(id) ? { shape: 'none', data: null } : {}),
    };
    const key = `${id}:${setting}`;
    this._zoneSettingSeq += 1;
    const seq = this._zoneSettingSeq;
    this._zoneSettingPending.set(key, { value: fields[setting], seq });
    const saved = await this._saveZoneUpdate(payload, `${this._zoneLabel(id)} saved`, {
      withInputUnits: false,
    });
    // A newer choice, or another radar since, owns the select now.
    if (this._zoneSettingPending.get(key)?.seq !== seq) return saved;
    this._zoneSettingPending.delete(key);
    if (!saved) this._renderZoneManager();
    return saved;
  }

  /** Put zone `zoneId`'s `setting` select back to the stored value. */
  _revertZoneSetting(zoneId, setting) {
    const meta = this._zoneMeta.get(Number(zoneId)) || { type: 'detect', holdS: 0 };
    const select = Array.from(
      this.shadowRoot?.querySelectorAll('#zoneManager select[data-zone-setting]') || [],
    ).find((s) => s.dataset.zone === String(zoneId) && s.dataset.zoneSetting === setting);
    if (select) select.value = String(setting === 'hold_s' ? meta.holdS : meta.type);
  }

  /** "Size 2.4 m × 1.8 m" in the map's unit, or the hint for a zone with no
   *  shape to measure. */
  _zoneSizeText(zoneId) {
    const zone = this._getZone(zoneId);
    const size = zone ? zoneSize(zone.shape, zone.data) : null;
    if (!size) return NO_SHAPE_TEXT;
    const family = this._unitFamily(this._displayUnit());
    return `${SIZE_PREFIX} ${formatSize(size.width, size.depth, family)}`;
  }

  /**
   * Bring each zone row's size up to date after a shape or the map's unit
   * changed. Only the size texts change, so a name being typed, a focused
   * select and an open dropdown are left alone.
   */
  _renderZoneSizes() {
    const host = this.shadowRoot?.getElementById('zoneManager');
    if (!host) return;
    host.querySelectorAll('.zone-size').forEach((span) => {
      span.textContent = this._zoneSizeText(span.dataset.zone);
    });
  }

  /**
   * The zone-name edits a rebuild of the manager rows would throw away.
   *
   * `values` holds every input whose text differs from the name its row was
   * built with, keyed by zone id; a row nobody edited is left out, so it picks
   * up a rename from the payload. `focus` is the focused input's zone id and
   * selection, or null when focus is elsewhere. `selectFocus` is the focused
   * setting select's zone and setting: a select saves on change, so it has no
   * draft, but keyboard focus on it has to outlive the rebuild too.
   */
  _captureZoneNameDrafts(host) {
    const values = new Map();
    let focus = null;
    let selectFocus = null;
    const active = this.shadowRoot?.activeElement;
    host.querySelectorAll('input[data-zone-id]').forEach((input) => {
      const zoneId = input.dataset.zoneId;
      if (input.value !== input.dataset.storedName) values.set(zoneId, input.value);
      if (input === active) {
        focus = {
          zoneId,
          start: input.selectionStart,
          end: input.selectionEnd,
          direction: input.selectionDirection,
        };
      }
    });
    host.querySelectorAll('select[data-zone-setting]').forEach((select) => {
      if (select === active) {
        selectFocus = { zone: select.dataset.zone, setting: select.dataset.zoneSetting };
      }
    });
    return { values, focus, selectFocus };
  }

  /** Lay captured drafts back over the rebuilt rows of the zones still listed. */
  _restoreZoneNameDrafts(host, drafts) {
    const inputs = new Map();
    host.querySelectorAll('input[data-zone-id]').forEach((input) => {
      inputs.set(input.dataset.zoneId, input);
    });
    drafts.values.forEach((value, zoneId) => {
      const input = inputs.get(zoneId);
      if (input) input.value = value;
    });
    if (drafts.selectFocus) {
      const { zone, setting } = drafts.selectFocus;
      const select = Array.from(host.querySelectorAll('select[data-zone-setting]')).find(
        (s) => s.dataset.zone === zone && s.dataset.zoneSetting === setting,
      );
      if (select) select.focus({ preventScroll: true });
    }
    const focused = drafts.focus ? inputs.get(drafts.focus.zoneId) : null;
    if (!focused) return;
    focused.focus({ preventScroll: true });
    const { start, end, direction } = drafts.focus;
    if (typeof start === 'number' && typeof end === 'number') {
      focused.setSelectionRange(start, end, direction || undefined);
    }
  }

  /**
   * Whether a zone row exists only because the card YAML names it.
   *
   * The backend renames only zones the store holds, so a name-only save for
   * such a zone was dropped while the card said it was saved, and the next
   * payload put the YAML name back. Saving it the way Add Zone does creates it.
   * Before the first payload the store's contents are unknown, and a zone drawn
   * here may still be on its way to the store; shape none would erase real
   * geometry in either case, so both keep the name-only save.
   */
  _zoneIsUnsaved(zoneId) {
    const config = this._zoneConfigPayload;
    if (!config) return false;
    const stored = config.zones && typeof config.zones === 'object' ? config.zones : {};
    if (String(zoneId) in stored) return false;
    return !(this.zones || []).some((zone) => Number(zone.id) === zoneId);
  }

  _handleAddZone() {
    // Compute next available id
    const ids = new Set([
      ...(this.zoneConfig || []).map((z) => Number(z.id)),
      ...(this.zones || []).map((z) => Number(z.id)),
    ]);
    // TODO(REVIEW_REPORT.md X19): no upper bound here, but services.yaml says
    // max 32 and the schema allows any safe integer; pick one rule for all three.
    let next = 1;
    while (ids.has(next)) next += 1;
    const newZone = { id: next, name: `Zone ${next}` };
    this.zoneConfig = [...(this.zoneConfig || []), newZone];
    this.selectedZone = next;
    // Persist the empty zone so its entities are created. It carries the
    // default name, which the backend stores but keeps out of the registry,
    // so the entities keep the names they were created with.
    this._saveZoneUpdate(
      {
        device_id: this.deviceId,
        zone_id: next,
        shape: 'none',
        data: null,
        name: newZone.name,
      },
      null,
    );
    this.renderZoneButtons();
    this._renderZoneManager();
  }

  finishPolygon() {
    // Drop consecutive repeated vertices. A double-click slow enough to finish
    // through the dblclick listener (350 to ~500 ms) has already stored its
    // second click as a vertex, and a zero-length edge is never intended.
    const pts = this._polyPoints.filter(
      (p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y,
    );
    // Either way the polygon ends, as it always did. Only a polygon that was
    // in progress says why nothing was saved: the dblclick that follows a
    // double-tap finish, or Finish on an empty canvas, has nothing to report.
    const inProgress = this._polyPoints.length > 0;
    if (this.selectedZone === null || this.selectedZone === undefined) {
      if (inProgress) this._notifyThrottled(SELECT_ZONE_TOAST);
    } else if (pts.length < 3) {
      if (inProgress) this._notifyThrottled(POLY_TOO_FEW_TOAST);
    } else {
      const zoneId = this.selectedZone;
      // Enforce max points on commit
      const points = pts.slice(0, this.polyMaxPoints).map((pt) => ({
        x: this._clampAndRound(pt.x, this.xMin, this.xMax),
        y: this._clampAndRound(pt.y, this.yMin, this.yMax),
      }));
      const payload = {
        shape: DRAW_MODES.POLYGON,
        data: { points },
      };
      this._setUndoSnapshot(this._snapshotZones([zoneId]));
      this._upsertZone(zoneId, payload.shape, payload.data);
      this._renderZoneSizes();
      this.updateHomeAssistantShape(
        zoneId,
        payload.shape,
        payload.data,
        `${this._zoneLabel(zoneId)} saved`,
      );
    }
    this._resetDrawingState();
    // Also when nothing was saved, which brings no payload to fit again.
    this._refitAndDraw();
  }

  /**
   * Paint the whole map, bottom layer first: painted cells, the grid, its
   * labels and the cone, the zones, a shape being drawn, then the targets,
   * and last the size of a shape being drawn or walked, so nothing covers
   * it. While a replay shows, its zones are lit by its dots, and its trails
   * and dots take the place of the live ones.
   */
  drawGrid() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    // One layout read per frame; what is sized in CSS px reads it from here.
    const canvasRect = this.canvas.getBoundingClientRect?.();
    this._frameScale = this._canvasScale(canvasRect);
    // Worked out before anything is drawn: the zones its dots light are
    // drawn before the dots.
    const replay = this._replayShowing() ? this._replayFrame() : null;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // First, so no grid, ring or range label is tinted by the cells, and
    // still under the zones.
    this._drawCellLayer(ctx);

    const gridState = this._getGridRenderState();
    const gridMetrics = gridState?.metrics;
    if (gridState) {
      this._drawGridLines(ctx, gridState);
    }
    this._drawAxes(ctx);
    // A ring label can take a grid label's place, and the range label can
    // take either's, so all three are laid out before any is drawn.
    let ringLabels = [];
    let rangeLabel = null;
    let xLabels = [];
    if (this.unitDisplay) {
      const { thetaStart, thetaEnd, radius } = this._coneSector();
      const rings = this._getConeRingsRenderState(thetaStart, thetaEnd, radius, gridMetrics);
      const buttons = this._overlayBoxes({ notes: false, canvasRect });
      rangeLabel = this._rangeLabel(buttons);
      const gap = gridState?.labelGap ?? LABEL_GAP_CSS_PX;
      // The zones' names keep their places too: a zone across the radar's
      // line (x = 0) put its name over the y labels running down it. So do
      // the buttons over the map: a zoomed map moves an axis's labels to the
      // edge, where they showed through the zoom row and the unit switch.
      const labels = this._clearOfBoxes(
        this._clearAround(this._layOutLabels(rings?.labels, gridState), rangeLabel, gap),
        [...this._zoneLabelBoxes(replay?.lit ?? null), ...buttons],
        gap,
      );
      if (gridState) {
        this._drawGridLabels(ctx, labels.grid);
        xLabels = labels.grid.x;
      }
      ringLabels = labels.rings;
    }
    this._placeMapNotes(xLabels);

    this.drawDeviceCone(gridMetrics, ringLabels);
    this._drawRangeLabel(ctx, rangeLabel);

    this.drawZones(replay ? { lit: replay.lit } : {});
    this._drawInProgress();
    this._drawWalkPreview(ctx);
    // Trails under the dots, which they lead up to.
    if (replay) {
      this._drawReplayTrails(ctx, replay);
      this._drawReplayDots(replay);
    } else {
      this._drawTrails(ctx);
      this._drawTrackedTargets();
    }
    // Corner markers over the dots, so the walker's own dot never hides the
    // newest corner.
    this._drawWalkMarkers(ctx);
    // The size readouts over all of it. A readout sits up to 64 CSS px from
    // its corner or finger, about 2 m on a phone's map, where an earlier
    // corner's ring, a trail or a dot can be.
    this._drawInProgressReadout(ctx);
    this._drawWalkReadout(ctx);
    // What Fit does follows the zones, which any frame can be showing anew.
    this._renderZoomControls();
    // The trail fade timer skips a frame a hass push painted a moment ago.
    this._lastDrawAt = this._now();
  }

  /**
   * Cells painted under the whole map: while a replay shows with Heatmap on,
   * where people spent their time over its range; else where live targets
   * have been, while this viewer has Coverage on. Both in the Coverage
   * colors, as both say where targets were, and never both at once. A
   * view-only card paints neither.
   */
  _drawCellLayer(ctx) {
    const rgb = this.darkMode ? COLOR.canvas.coverageDark : COLOR.canvas.coverageLight;
    const heat = this._history.heat;
    if (this._history.heatmap && heat && this._replayShowing()) {
      this._drawCells(ctx, heat, rgb);
      return;
    }
    if (this._viewOnly || !this._coverageOn) return;
    this._drawCells(ctx, this._coverage, rgb);
  }

  /**
   * What the replay shows at its time T, worked out once per frame: each
   * slot with a position then, in the map frame through today's rotation
   * (the flip comes with valueToPixels), whether one of today's ignore zones
   * holds it (history can be older than they are), its trail, and the detect
   * zones its dot lights, by their current shapes. null without an answer.
   */
  _replayFrame() {
    const { series, t } = this._history;
    if (!series) return null;
    const items = [];
    const lit = new Set();
    const detectZones = (this.zones || []).filter((zone) => !this._isIgnoreZone(zone.id));
    series.slots.forEach((slotSeries, slot) => {
      const p = positionAt(slotSeries, t);
      if (!p) return;
      const m = this._toMap(p.x, p.y);
      const ignored = this._isIgnored(m.x, m.y);
      items.push({ slot, m, ignored, trail: trailAt(slotSeries, t, TRAIL_MS) });
      // Presence drops a target inside an ignore zone, so it lights nothing.
      if (ignored) return;
      detectZones.forEach((zone) => {
        if (pointInZone(zone.shape, zone.data, m.x, m.y)) lit.add(Number(zone.id));
      });
    });
    return { items, lit };
  }

  /** The replayed trails, aged against the replay time as the live ones are
   *  against now, grey where today's ignore zones hold the target. */
  _drawReplayTrails(ctx, replay) {
    const colors = COLOR.canvas.targetPalette;
    const grey = this.darkMode ? COLOR.canvas.ignoredTargetDark : COLOR.canvas.ignoredTargetLight;
    replay.items.forEach(({ slot, ignored, trail }) => {
      if (trail.length < 2) return;
      this._drawTrail(ctx, trail, this._history.t, ignored ? grey : colors[slot % colors.length]);
    });
  }

  /** The replayed dots, numbered by slot as the live ones are, hollow and
   *  grey inside today's ignore zones. */
  _drawReplayDots(replay) {
    const colors = COLOR.canvas.targetPalette;
    const numbers = COLOR.canvas.targetNumber;
    replay.items.forEach(({ slot, m, ignored }) => {
      this.drawCurrentPosition(m.x, m.y, colors[slot % colors.length], String(slot + 1), {
        hollow: ignored,
        numberColor: numbers[slot % numbers.length],
      });
    });
  }

  /**
   * Paint `grid`'s cells in `rgb` ("r, g, b"), each at the alpha its value
   * earns, with one fill style, one path and one fill per alpha (bucketCells)
   * rather than one per cell. A cell is a square in the radar's own frame, so
   * its corners turn and flip with the dots. Both steps are linear, so the
   * corners of every cell are whole steps along two fixed vectors on the
   * canvas, worked out once per frame instead of once per corner.
   */
  _drawCells(ctx, grid, rgb) {
    const groups = bucketCells(grid);
    if (!groups.length) return;
    const toPixels = (x, y) => {
      const m = this._toMap(x, y);
      return { x: this.valueToPixels(m.x, 'x'), y: this.valueToPixels(m.y, 'y') };
    };
    const origin = toPixels(0, 0);
    const alongX = toPixels(CELL_MM, 0);
    const alongY = toPixels(0, CELL_MM);
    const ux = alongX.x - origin.x;
    const uy = alongX.y - origin.y;
    const vx = alongY.x - origin.x;
    const vy = alongY.y - origin.y;
    ctx.save();
    groups.forEach(({ alpha, cells }) => {
      ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
      ctx.beginPath();
      cells.forEach(([ix, iy]) => {
        const x = origin.x + ix * ux + iy * vx;
        const y = origin.y + ix * uy + iy * vy;
        ctx.moveTo(x, y);
        ctx.lineTo(x + ux, y + uy);
        ctx.lineTo(x + ux + vx, y + uy + vy);
        ctx.lineTo(x + vx, y + vy);
        ctx.closePath();
      });
      ctx.fill();
    });
    ctx.restore();
  }

  /** The corners walked so far in the map frame, turned with the rotation
   *  and clamped to the map as Finish saves them, in walking order. */
  _walkMapCorners() {
    return (this._walk?.corners || []).map(({ x, y }) => {
      const m = this._toMap(x, y);
      return {
        x: this._clampAndRound(m.x, this.xMin, this.xMax),
        y: this._clampAndRound(m.y, this.yMin, this.yMax),
      };
    });
  }

  /**
   * The zone the corners walked so far make, dashed: two as the rectangle
   * between them, three or more as the polygon through them in walking
   * order. _drawWalkReadout gives its size. Its line and dash follow the
   * card's width, as the rings, trails and dots do, so they do not thin out
   * on a phone.
   */
  _drawWalkPreview(ctx) {
    const corners = this._walkMapCorners();
    if (corners.length < 2) return;
    const points = corners.map((c) => ({
      x: this.valueToPixels(c.x, 'x'),
      y: this.valueToPixels(c.y, 'y'),
    }));
    const scale = this._frameScale || 1;
    ctx.save();
    ctx.strokeStyle = this.darkMode
      ? COLOR.canvas.polygonStrokeDark
      : COLOR.canvas.polygonStrokeLight;
    ctx.lineWidth = 3 * scale;
    // A dash of its own, apart from a drawn shape's rubber band and a zone.
    ctx.setLineDash([10 * scale, 6 * scale]);
    ctx.beginPath();
    if (points.length === 2) {
      const [a, b] = points;
      ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The size of the zone the corners walked so far make, above the newest
   * corner, as far above as over a finger, which keeps it clear of that
   * corner's ring and number. On a phone's map that is about 2 m, where an
   * earlier corner's ring and number, or the buttons over the map, can be,
   * so it goes below or beside the corner instead where that is clear of
   * them all. drawGrid draws it after the rings, so where nothing is clear
   * no ring runs through it.
   */
  _drawWalkReadout(ctx) {
    const corners = this._walkMapCorners();
    if (corners.length < 2) return;
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const newest = corners[corners.length - 1];
    const markers = this._walkMarkerLayout(ctx).flatMap((marker) => [marker.ring, marker.plate]);
    this._drawSizeReadout(
      ctx,
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      { x: this.valueToPixels(newest.x, 'x'), y: this.valueToPixels(newest.y, 'y') },
      { offsetCssPx: READOUT_OFFSET_TOUCH_PX, avoid: [...markers, ...this._overlayBoxes()] },
    );
  }

  /**
   * The fading trail behind each live target: its last TRAIL_MS of
   * positions in its dot's color, or grey while it stands in an ignore zone,
   * where presence does not see it. A target that has gone keeps the color
   * of where it was last seen until its trail fades.
   */
  _drawTrails(ctx) {
    // A replay draws the trails it replays instead.
    if (this._replayShowing()) return;
    const now = this._now();
    const colors = COLOR.canvas.targetPalette;
    const grey = this.darkMode ? COLOR.canvas.ignoredTargetDark : COLOR.canvas.ignoredTargetLight;
    this._trails.slots().forEach((slot) => {
      const samples = this._trails.samples(slot);
      if (samples.length < 2) return;
      const at = this._trailReadings.get(slot) || samples[samples.length - 1];
      const m = this._toMap(at.x, at.y);
      const color = this._isIgnored(m.x, m.y) ? grey : colors[slot % colors.length];
      this._drawTrail(ctx, samples, now, color);
    });
  }

  /**
   * One trail through `points` ({ t, x, y } in the radar's own frame, oldest
   * first), as segments between consecutive points, aged against `now`: the
   * newest strongest and widest, fading to a faint thin line at TRAIL_MS. A
   * point that starts a new run (`brk`: its target had vanished) joins none
   * before it, and a silence over TRAIL_GAP_MS breaks it too, counted from
   * the last write merged into the point before (`tLast`), so a target that
   * vanished and came back elsewhere is not joined to where it was.
   */
  _drawTrail(ctx, points, now, color) {
    const scale = this._frameScale || 1;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    let previous = null;
    points.forEach(({ t, tLast, x, y, brk }) => {
      const m = this._toMap(x, y);
      const point = {
        t: tLast ?? t,
        x: this.valueToPixels(m.x, 'x'),
        y: this.valueToPixels(m.y, 'y'),
      };
      if (previous && !brk && t - previous.t <= TRAIL_GAP_MS) {
        const f = Math.max(0.08, 1 - (now - t) / TRAIL_MS);
        ctx.globalAlpha = 0.6 * f;
        ctx.lineWidth = scale * (1.5 + 2.5 * f);
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
      previous = point;
    });
    ctx.restore();
  }

  /**
   * A ring on each corner walked so far, with its number outside the ring's
   * upper right on a plate in the canvas color. Drawn over the dots, so the
   * walker's own dot never hides the newest corner, and hollow, so the dot
   * shows through.
   */
  _drawWalkMarkers(ctx) {
    const markers = this._walkMarkerLayout(ctx);
    if (!markers.length) return;
    const scale = this._frameScale || 1;
    const axis = this.darkMode ? COLOR.canvas.axisDark : COLOR.canvas.axisLight;
    const plate = this.darkMode ? COLOR.ui.darkCanvasBackground : COLOR.ui.lightCanvasBackground;
    ctx.save();
    ctx.lineWidth = 3 * scale;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    markers.forEach(({ x, y, r, text, font, plate: box }) => {
      ctx.font = font;
      ctx.strokeStyle = axis;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = plate;
      ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
      ctx.fillStyle = axis;
      // From the ring's corner box outward, so the plate clears the ring.
      ctx.fillText(text, x + r, y - r);
    });
    ctx.restore();
  }

  /**
   * Where each walked corner's marker goes, in backing px: its center, its
   * ring's radius `r` and box, and its number's text, font and plate box,
   * up and to the right of the ring. _drawWalkMarkers draws from it and
   * _drawWalkReadout keeps clear of it.
   */
  _walkMarkerLayout(ctx) {
    const corners = this._walkMapCorners();
    if (!corners.length) return [];
    const scale = this._frameScale || 1;
    const r = Math.max(14, Math.round(14 * scale));
    const pad = 2 * scale;
    const font = `bold ${r}px sans-serif`;
    if (ctx) {
      ctx.save();
      ctx.font = font;
    }
    const markers = corners.map((corner, i) => {
      const x = this.valueToPixels(corner.x, 'x');
      const y = this.valueToPixels(corner.y, 'y');
      const text = String(i + 1);
      // The same estimate _measureLabels falls back to where the canvas
      // cannot measure text.
      const measured = ctx?.measureText?.(text)?.width;
      const width =
        typeof measured === 'number' && measured > 0
          ? measured
          : text.length * r * LABEL_FALLBACK_EM_PER_CHAR;
      const left = x + r;
      const bottom = y - r;
      return {
        x,
        y,
        r,
        text,
        font,
        ring: { left: x - r, right: x + r, top: y - r, bottom: y + r },
        plate: {
          left: left - pad,
          right: left + width + pad,
          top: bottom - r - pad,
          bottom: bottom + pad,
        },
      };
    });
    if (ctx) ctx.restore();
    return markers;
  }

  /**
   * Where the "Radar range 6 m (20 ft), 120°" label goes, in canvas px, or
   * null when the card shows no distance labels or no cone.
   *
   * Centered on the line the radar faces along, just past the arc, where it
   * reads as the arc's caption. It goes just inside the arc when the canvas
   * has no room past it, or when one of `buttons` comes within the label gap
   * there: the boxes (backing px) of the buttons over the map, through which
   * nothing can be read. On a phone the arc can end under the zoom row. When
   * it fits in neither place, as on a YAML grid that cuts the arc off, it is
   * left out: there is no arc on the map for it to caption, and the help
   * line under the map still gives the range.
   */
  _rangeLabel(buttons = this._overlayBoxes({ notes: false })) {
    if (!this.unitDisplay || !this.canvas || !(this.coneYMax > 0)) return null;
    const label = {
      text: `Radar range ${this._rangeText()}`,
      x: 0,
      y: 0,
      align: 'center',
      baseline: 'middle',
    };
    this._measureLabels([label]);
    const width = this.canvas.width;
    const height = this.canvas.height;
    const halfWidth = label.width / 2;
    const halfHeight = this.unitLabelSize / 2;
    const facing = (this.coneAngleDeg * Math.PI) / 180;
    const arcX = this.valueToPixels(this.coneYMax * Math.sin(facing), 'x');
    const arcY = this.valueToPixels(this.coneYMax * Math.cos(facing), 'y');
    // The facing direction in canvas px, where a YAML grid can scale X and Y
    // apart, as a unit vector. A flipped map runs x right to left.
    let dirX = Math.sin(facing) * (this.pxPerX || 0) * (this._mirrorX ? -1 : 1);
    let dirY = Math.cos(facing) * (this.pxPerY || 0);
    const length = Math.hypot(dirX, dirY) || 1;
    dirX /= length;
    dirY /= length;
    // Far enough along that line for the box's near edge to clear the arc by
    // half a label height and the label gap, so an axis label centered on the
    // arc (the 6 m one, facing ahead on a 1 m grid) keeps its place. The extra
    // px absorbs float error in the gap test.
    const gap = LABEL_GAP_CSS_PX * (this._frameScale || 1);
    const offset =
      Math.abs(dirX) * halfWidth + Math.abs(dirY) * halfHeight + halfHeight + gap + 1;
    const fits = (x, y) =>
      x - halfWidth >= 0 &&
      x + halfWidth <= width &&
      y - halfHeight >= 0 &&
      y + halfHeight <= height &&
      buttons.every((box) => this._boxGap(box, this._labelBox({ ...label, x, y })) >= gap);
    for (const side of [1, -1]) {
      const x = arcX + side * dirX * offset;
      const y = arcY + side * dirY * offset;
      if (fits(x, y)) return { ...label, x, y };
    }
    return null;
  }

  /** `labels` without the grid and ring labels that would crowd `rangeLabel`.
   *  The range label is the one that says what the cone is, so it stays. */
  _clearAround(labels, rangeLabel, gap) {
    if (!rangeLabel) return labels;
    return this._clearOfBoxes(labels, [this._labelBox(rangeLabel)], gap);
  }

  /** `labels` without the grid and ring labels that come within `gap` of
   *  any of `boxes` (backing px). Their lines, and the labels either side,
   *  still give the values left out. */
  _clearOfBoxes(labels, boxes, gap) {
    if (!boxes.length) return labels;
    const clear = (label) => {
      const box = this._labelBox(label);
      return boxes.every((other) => this._boxGap(other, box) >= gap);
    };
    return {
      grid: { x: labels.grid.x.filter(clear), y: labels.grid.y.filter(clear) },
      rings: labels.rings.filter(clear),
    };
  }

  _drawRangeLabel(ctx, label) {
    if (!label) return;
    ctx.save();
    ctx.font = `${this.unitLabelSize}px sans-serif`;
    ctx.textAlign = label.align;
    ctx.textBaseline = label.baseline;
    // A plate in the canvas color keeps it legible where the Y axis or a grid
    // line runs through it. It covers the label's box, which _clearAround
    // already keeps every other label out of.
    const box = this._labelBox(label);
    ctx.fillStyle = this.darkMode
      ? COLOR.ui.darkCanvasBackground
      : COLOR.ui.lightCanvasBackground;
    ctx.fillRect(box.left - 2, box.top, box.right - box.left + 4, box.bottom - box.top);
    ctx.fillStyle = this.darkMode ? COLOR.canvas.axisDark : COLOR.canvas.axisLight;
    ctx.fillText(label.text, label.x, label.y);
    ctx.restore();
  }

  _drawGridLines(ctx, gridState) {
    if (!gridState) return;
    ctx.strokeStyle = COLOR.canvas.gridLine;
    ctx.lineWidth = 1;
    if (gridState.gridPath) {
      ctx.stroke(gridState.gridPath);
      return;
    }

    const { xLines, yLines } = gridState;
    if ((!xLines || !xLines.length) && (!yLines || !yLines.length)) return;

    ctx.beginPath();
    if (xLines && xLines.length) {
      xLines.forEach(({ pixel }) => {
        ctx.moveTo(pixel, 0);
        ctx.lineTo(pixel, this.canvas.height);
      });
    }
    if (yLines && yLines.length) {
      yLines.forEach(({ pixel }) => {
        ctx.moveTo(0, pixel);
        ctx.lineTo(this.canvas.width, pixel);
      });
    }
    ctx.stroke();
  }

  _drawAxes(ctx) {
    const originColor = this.darkMode ? COLOR.canvas.axisDark : COLOR.canvas.axisLight;
    ctx.strokeStyle = originColor;
    ctx.lineWidth = 1.5;

    const y0 = this.valueToPixels(0, 'y');
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(this.canvas.width, y0);
    ctx.stroke();

    const x0 = this.valueToPixels(0, 'x');
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, this.canvas.height);
    ctx.stroke();

    ctx.fillStyle = originColor;
    ctx.beginPath();
    ctx.arc(x0, y0, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawGridLabels(ctx, labels) {
    if (!labels) return;
    const axisColor = this.darkMode ? COLOR.canvas.axisDark : COLOR.canvas.axisLight;
    ctx.save();
    ctx.fillStyle = axisColor;
    ctx.font = `${this.unitLabelSize}px sans-serif`;
    if (labels.x && labels.x.length) {
      labels.x.forEach((item) => {
        ctx.textAlign = item.align;
        ctx.textBaseline = item.baseline;
        ctx.fillText(item.text, item.x, item.y);
      });
    }

    if (labels.y && labels.y.length) {
      labels.y.forEach((item) => {
        ctx.textAlign = item.align;
        ctx.textBaseline = item.baseline;
        ctx.fillText(item.text, item.x, item.y);
      });
    }

    ctx.restore();
  }

  /**
   * Keep the notes over the map's top corners clear of the x labels drawn
   * this frame (`xLabels`). A fitted map has the radar, and so y = 0 and the
   * x labels' row, on its top edge, where the notes covered the outer
   * labels; when the row runs under them, they go MAP_NOTE_INSET_CSS_PX
   * below it instead. Set as --zm-note-top on the canvas's container, and
   * only when it changes. A render's new container has none, so the
   * render's own first frame sets it again.
   */
  _placeMapNotes(xLabels) {
    const container = this.canvas?.parentElement;
    if (!container) return;
    const scale = this._frameScale || 1;
    let top = MAP_NOTE_INSET_CSS_PX;
    if (xLabels.length) {
      const boxes = xLabels.map((label) => this._labelBox(label));
      const rowTop = Math.min(...boxes.map((box) => box.top)) / scale;
      const rowBottom = Math.max(...boxes.map((box) => box.bottom)) / scale;
      if (rowTop < MAP_NOTE_INSET_CSS_PX + MAP_NOTE_HEIGHT_CSS_PX) {
        top = MAP_NOTE_INSET_CSS_PX + Math.ceil(rowBottom);
      }
    }
    const value = `${top}px`;
    if (container.style.getPropertyValue('--zm-note-top') !== value) {
      container.style.setProperty('--zm-note-top', value);
    }
  }

  /**
   * Each live target as a dot numbered by its pair (Target N on an Apollo
   * radar, whose pairs are in target order), hollow and grey inside an
   * ignore zone, where presence drops it.
   */
  _drawTrackedTargets() {
    if (!this._hass) return;
    const colors = COLOR.canvas.targetPalette;
    const numbers = COLOR.canvas.targetNumber;
    this._currentTargets().forEach(({ slot, x, y }) => {
      const m = this._toMap(x, y);
      this.drawCurrentPosition(m.x, m.y, colors[slot % colors.length], String(slot + 1), {
        hollow: this._isIgnored(m.x, m.y),
        numberColor: numbers[slot % numbers.length],
      });
    });
  }

  /**
   * Millimeters per unit of one target reading. Home Assistant hands over the
   * state in the entity's display unit, not the millimeters ESPHome reports:
   * inches when the system is set to US customary units, or whatever the user
   * picked in the entity's settings. X and Y are separate entities, so each is
   * read by its own unit. A sensor with no length unit, such as a DIY template
   * sensor, is scaled by the YAML input_units as before. Must match
   * `reading_unit_factor` in targets.py.
   */
  _readingUnitFactor(stateObj) {
    const unit = stateObj?.attributes?.unit_of_measurement;
    // An own key only, so a unit such as "constructor" is not a length unit.
    const known =
      typeof unit === 'string' && Object.prototype.hasOwnProperty.call(SENSOR_LENGTH_UNITS, unit);
    return known ? SENSOR_LENGTH_UNITS[unit] : this.inputUnitMultiplier || 1;
  }

  /**
   * Every zone with a shape, in id order, ignore zones last so their hatch
   * shows over a detect zone they overlap. `lit`, a Set of zone ids, stands
   * in for the presence sensors when a replay draws zones as they were.
   */
  drawZones({ lit = null } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const colors = COLOR.canvas.zonePalette;
    const byId = [...this.zones].sort((a, b) => Number(a.id) - Number(b.id));
    const orderedZones = [
      ...byId.filter((zone) => !this._isIgnoreZone(zone?.id)),
      ...byId.filter((zone) => this._isIgnoreZone(zone?.id)),
    ];
    orderedZones.forEach((zone, idx) => {
      if (!zone || !zone.shape || !zone.data) return;
      const color = colors[(Number(zone.id) - 1) % colors.length] || colors[idx % colors.length];
      const look = this._zoneLook(zone.id, color, lit);
      // Each zone in its own save and restore, so its dash never reaches the
      // grid lines, a shape being drawn or the dots.
      ctx.save();
      ctx.strokeStyle = look.stroke;
      ctx.fillStyle = look.fill;
      ctx.lineWidth = look.lineWidth;
      ctx.setLineDash(look.dash);
      // {x, y, width, height} in px, the one _zoneLabelBoxes lays the
      // labels out from too.
      const bbox = this._zonePixelBox(zone);
      if (zone.shape === DRAW_MODES.RECT) {
        const { x, y, width, height } = bbox;
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
      } else if (zone.shape === DRAW_MODES.ELLIPSE) {
        const { x, y, width, height } = bbox;
        ctx.beginPath();
        ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (zone.shape === DRAW_MODES.POLYGON && Array.isArray(zone.data.points)) {
        const pts = zone.data.points.map((point) => ({
          x: this.valueToPixels(point.x, 'x'),
          y: this.valueToPixels(point.y, 'y'),
        }));
        if (pts.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          // By the even-odd rule, the one presence tests a point by
          // (pointInPolygon), so a polygon that goes around an area twice,
          // as a second lap of Walk can, is not filled where presence finds
          // nobody.
          ctx.fill('evenodd');
          ctx.stroke();
        }
      }
      ctx.restore();
      if (this._zoneLabeled(bbox)) {
        this._drawZoneLabel(zone, bbox, look.suffix);
      }
    });
  }

  /**
   * Zone `zone`'s box on the canvas, `{ x, y, width, height }` in backing
   * px: a rect's corners, an ellipse's center and radii, the box around a
   * polygon's 3 or more points. null for any other shape.
   */
  _zonePixelBox(zone) {
    const data = zone?.data;
    if (!data) return null;
    if (zone.shape === DRAW_MODES.RECT) {
      const x1 = this.valueToPixels(data.x_min, 'x');
      const y1 = this.valueToPixels(data.y_min, 'y');
      const x2 = this.valueToPixels(data.x_max, 'x');
      const y2 = this.valueToPixels(data.y_max, 'y');
      return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      };
    }
    if (zone.shape === DRAW_MODES.ELLIPSE) {
      const { cx, cy, rx, ry } = data;
      const cxPix = this.valueToPixels(cx, 'x');
      const cyPix = this.valueToPixels(cy, 'y');
      const rxPix = Math.abs(this.valueToPixels(cx + rx, 'x') - cxPix);
      const ryPix = Math.abs(this.valueToPixels(cy + ry, 'y') - cyPix);
      return { x: cxPix - rxPix, y: cyPix - ryPix, width: rxPix * 2, height: ryPix * 2 };
    }
    const points = data.points;
    if (zone.shape === DRAW_MODES.POLYGON && Array.isArray(points) && points.length >= 3) {
      const xs = points.map((point) => this.valueToPixels(point.x, 'x'));
      const ys = points.map((point) => this.valueToPixels(point.y, 'y'));
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    }
    return null;
  }

  /** Whether a zone this big on the canvas (_zonePixelBox) gets its name. */
  _zoneLabeled(bbox) {
    return !!bbox && bbox.width > 20 && bbox.height > 14;
  }

  /**
   * The boxes (backing px) the zones' names cover this frame, laid out as
   * _drawZoneLabel lays them out, for the axis and ring labels to keep
   * clear of. `lit` is a replay's lit zones, as drawZones takes it.
   */
  _zoneLabelBoxes(lit = null) {
    if (!this.ctx || !this.canvas) return [];
    return (this.zones || []).flatMap((zone) => {
      if (!zone || !zone.shape || !zone.data) return [];
      const bbox = this._zonePixelBox(zone);
      if (!this._zoneLabeled(bbox)) return [];
      const place = this._zoneLabelPlacement(zone, bbox, this._zoneSuffix(zone.id, lit));
      if (!place) return [];
      return [
        {
          left: place.x - place.width / 2,
          right: place.x + place.width / 2,
          top: place.y - place.fontPx / 2,
          bottom: place.y + place.fontPx / 2,
        },
      ];
    });
  }

  /** What zone `zoneId`'s name is followed by on the map: " (ignored)" for
   *  an ignore zone, " (held)" while its sensor says a hold keeps it on
   *  (never in a replay, which has no holds to show), else nothing. */
  _zoneSuffix(zoneId, lit = null) {
    if (this._isIgnoreZone(zoneId)) return IGNORED_SUFFIX;
    if (lit) return '';
    const entityId = this._presenceEntityFor(zoneId);
    const stateObj = entityId ? this._hass?.states?.[entityId] : null;
    return stateObj?.attributes?.held === true ? HELD_SUFFIX : '';
  }

  /** Whether zone `zoneId` is an ignore zone, by the payload's zone_type. */
  _isIgnoreZone(zoneId) {
    return this._zoneMeta.get(Number(zoneId))?.type === 'ignore';
  }

  /**
   * How zone `zoneId` is drawn: `{ fill, stroke, dash, lineWidth, suffix }`.
   * A detect zone keeps its hue, `color`, so on and off show by alpha and
   * dash alone: on is a strong fill with a solid outline, off (and unknown,
   * or no sensor at all) a faint fill with a dashed one. Unavailable, the
   * radar being offline, greys it out. A held zone's label says so, since it
   * is lit with nobody on the map. An ignore zone, whose sensor always reads
   * off, is hatched grey.
   */
  _zoneLook(zoneId, color, lit) {
    const dark = this.darkMode;
    if (this._isIgnoreZone(zoneId)) {
      return {
        fill:
          this._hatchPattern(dark) ||
          (dark ? COLOR.canvas.ignoreFillDark : COLOR.canvas.ignoreFillLight),
        stroke: dark ? COLOR.canvas.ignoreStrokeDark : COLOR.canvas.ignoreStrokeLight,
        dash: [6, 4],
        lineWidth: 2,
        suffix: IGNORED_SUFFIX,
      };
    }
    let state = null;
    if (lit) {
      state = lit.has(Number(zoneId)) ? 'on' : 'off';
    } else {
      const entityId = this._presenceEntityFor(zoneId);
      const stateObj = entityId ? this._hass?.states?.[entityId] : null;
      state = presenceLook(stateObj?.state);
    }
    const suffix = this._zoneSuffix(zoneId, lit);
    if (state === 'on') {
      return { fill: color.fillOn, stroke: color.stroke, dash: [], lineWidth: 3, suffix };
    }
    if (state === 'unavailable') {
      return {
        fill: dark ? COLOR.canvas.zoneUnavailableFillDark : COLOR.canvas.zoneUnavailableFillLight,
        stroke: dark
          ? COLOR.canvas.zoneUnavailableStrokeDark
          : COLOR.canvas.zoneUnavailableStrokeLight,
        dash: [4, 4],
        lineWidth: 2,
        suffix,
      };
    }
    // A longer dash than the previews' [5, 5] and [6, 6], so a zone at rest
    // does not look like a shape being drawn.
    return { fill: color.fillOff, stroke: color.stroke, dash: [8, 6], lineWidth: 2, suffix };
  }

  /**
   * The ignore zones' fill: one diagonal grey line on a 12 x 12 px tile,
   * repeated. Made once per theme and per context (a render brings a new
   * canvas). null when the context cannot make a pattern (createPattern
   * missing, throwing or returning nothing, as in some browsers), and the
   * zone is then filled flat.
   */
  _hatchPattern(dark) {
    const key = dark ? 'dark' : 'light';
    const cached = this._hatch[key];
    if (cached && cached.ctx === this.ctx) return cached.pattern;
    let pattern = null;
    try {
      const tile = document.createElement('canvas');
      tile.width = 12;
      tile.height = 12;
      const tileCtx = tile.getContext('2d');
      if (tileCtx && typeof this.ctx?.createPattern === 'function') {
        tileCtx.strokeStyle = dark ? COLOR.canvas.ignoreHatchDark : COLOR.canvas.ignoreHatchLight;
        tileCtx.lineWidth = 2;
        tileCtx.beginPath();
        // The diagonal, then its ends in the two other corners, so the tiles
        // join into unbroken stripes.
        tileCtx.moveTo(0, 12);
        tileCtx.lineTo(12, 0);
        tileCtx.moveTo(-2, 2);
        tileCtx.lineTo(2, -2);
        tileCtx.moveTo(10, 14);
        tileCtx.lineTo(14, 10);
        tileCtx.stroke();
        pattern = this.ctx.createPattern(tile, 'repeat') || null;
      }
    } catch {
      pattern = null;
    }
    this._hatch[key] = { ctx: this.ctx, pattern };
    return pattern;
  }

  _drawInProgress() {
    const ctx = this.ctx;
    // Draw in-progress indicators
    if (this.drawMode === DRAW_MODES.POLYGON && this.isDrawing) {
      const pts = (this._polyPoints || []).map((p) => ({
        x: this.valueToPixels(p.x, 'x'),
        y: this.valueToPixels(p.y, 'y'),
      }));
      if (pts.length >= 2) {
        ctx.save();
        ctx.strokeStyle = this.darkMode
          ? COLOR.canvas.polygonStrokeDark
          : COLOR.canvas.polygonStrokeLight;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.restore();
      }
      // Rubber-band from last point to first, to where the pointer's
      // corner would go (snapped, or free with Alt or Option).
      if (this._cursorPoint && (pts.length || this.startPoint)) {
        const cur = this._placedPx(this._cursorPoint, this._cursorFree);
        const previewColor = this.darkMode
          ? COLOR.canvas.polygonPreviewDark
          : COLOR.canvas.polygonPreviewLight;
        ctx.save();
        ctx.strokeStyle = previewColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        const anchor = pts.length
          ? pts[pts.length - 1]
          : { x: this.startPoint?.x ?? null, y: this.startPoint?.y ?? null };
        if (anchor.x != null && anchor.y != null) {
          ctx.moveTo(anchor.x, anchor.y);
          ctx.lineTo(cur.x, cur.y);
        }
        if (pts.length >= 1) {
          const first = pts[0];
          ctx.moveTo(cur.x, cur.y);
          ctx.lineTo(first.x, first.y);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      for (const pt of pts) this._drawVertexDot(ctx, pt.x, pt.y);

      if (!pts.length && this.startPoint) {
        this._drawVertexDot(ctx, this.startPoint.x, this.startPoint.y);
      }
      ctx.restore();
    } else if (
      this.isDrawing &&
      this.startPoint &&
      (this.drawMode === DRAW_MODES.RECT || this.drawMode === DRAW_MODES.ELLIPSE)
    ) {
      // The start corner, placed when pressed.
      const pt = this.startPoint;
      ctx.save();
      this._drawVertexDot(ctx, pt.x, pt.y);
      ctx.restore();
      // The dashed rubber band from the start point to the pointer's corner,
      // where it will be saved: snapped, or free with Alt or Option. Nothing
      // to outline until that corner has moved off the first.
      const cur = this._cursorPoint && this._placedPx(this._cursorPoint, this._cursorFree);
      if (cur && (cur.x !== pt.x || cur.y !== pt.y)) {
        const width = cur.x - pt.x;
        const height = cur.y - pt.y;
        ctx.save();
        ctx.strokeStyle = this.darkMode
          ? COLOR.canvas.drawStrokeDark
          : COLOR.canvas.drawStrokeLight;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        if (this.drawMode === DRAW_MODES.RECT) {
          ctx.strokeRect(pt.x, pt.y, width, height);
        } else {
          ctx.beginPath();
          ctx.ellipse(
            pt.x + width / 2,
            pt.y + height / 2,
            Math.abs(width) / 2,
            Math.abs(height) / 2,
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  /**
   * The size of the shape being drawn. drawGrid draws it after the trails
   * and dots, so none of them runs through it. A rect or an ellipse shows
   * the size of exactly what letting go would save, snapped corners and
   * all, so the readout and the zone list agree to the mm; a rect with no
   * area saves nothing and shows no size. In meters it reads to 0.01 m
   * while corners snap finer than 10 cm (_readoutDecimals).
   */
  _drawInProgressReadout(ctx) {
    if (!this.isDrawing) return;
    if (this.drawMode === DRAW_MODES.POLYGON) {
      this._drawPolygonSize(ctx);
      return;
    }
    if (this.drawMode !== DRAW_MODES.RECT && this.drawMode !== DRAW_MODES.ELLIPSE) return;
    const pt = this.startPoint;
    const cur = this._cursorPoint;
    if (!pt || !cur) return;
    // Nothing to measure until the pointer's corner has moved off the first,
    // which a move shorter than half a snap does not do.
    const placed = this._placedPx(cur, this._cursorFree);
    if (placed.x === pt.x && placed.y === pt.y) return;
    const payload = this._shapeFromDrag(pt, cur, this.drawMode);
    const size = payload ? zoneSize(payload.shape, payload.data) : null;
    if (size) {
      this._drawSizeReadout(ctx, size.width, size.depth, cur, {
        decimals: this._readoutDecimals(),
      });
    }
  }

  /** The decimals a drawn shape's size reads to in meters: enough to show
   *  a size snapped at this zoom exactly (see snapDecimals). A corner placed
   *  freely reads at the same precision. */
  _readoutDecimals() {
    return snapDecimals(this._snapStep(), this._unitFamily(this._displayUnit()));
  }

  /**
   * The size of a polygon being drawn: the box around its corners and the
   * pointer, which is where the next corner would go, measured the way that
   * corner would be saved (clamped to the map, whole mm).
   */
  _drawPolygonSize(ctx) {
    const cur = this._cursorPoint;
    const corners = this._polyPoints || [];
    if (!cur || !corners.length) return;
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const next = this._placeMm(cur, this._cursorFree);
    xs.push(this._clampAndRound(next.x, this.xMin, this.xMax));
    ys.push(this._clampAndRound(next.y, this.yMin, this.yMax));
    const width = Math.max(...xs) - Math.min(...xs);
    const depth = Math.max(...ys) - Math.min(...ys);
    // The pointer still on the first corner has nothing to measure yet.
    if (width === 0 && depth === 0) return;
    this._drawSizeReadout(ctx, width, depth, cur, { decimals: this._readoutDecimals() });
  }

  /**
   * "2.4 m × 1.8 m" (or feet and inches, with the map's unit) on a plate in
   * the canvas color, centered above `anchorPx`, the pointer. A fingertip
   * covers more than a mouse pointer, so the readout sits further above it.
   * Where that runs off the top of the canvas, a mouse pointer's goes as far
   * below; a finger's goes beside it at its height instead, on the side with
   * more room, since below it would sit under the fingertip. Where the plate
   * does not fit there with READOUT_BESIDE_TOUCH_PX clear of the touch, it
   * goes as far below as a mouse pointer's: pulled back onto the canvas
   * beside the finger, it would sit under the fingertip. Sized in CSS
   * px, so it reads the same on a phone and a desktop. `offsetCssPx` sets
   * the distance where the anchor is not the pointer (Walk's newest
   * corner), which goes below too, and `decimals` the meters' precision
   * (formatSize). With `avoid`, boxes in backing px ({ left, right, top,
   * bottom }), the readout takes the first of above, below, right and left
   * of the anchor that lies on the canvas clear of all of them, and the
   * placement above otherwise.
   */
  _drawSizeReadout(
    ctx,
    widthMm,
    depthMm,
    anchorPx,
    { offsetCssPx = null, decimals = 1, avoid = null } = {},
  ) {
    if (!ctx || !this.canvas || !anchorPx) return;
    const scale = this._frameScale || 1;
    const fontPx = Math.round(14 * scale);
    const text = formatSize(widthMm, depthMm, this._unitFamily(this._displayUnit()), decimals);
    ctx.save();
    ctx.font = `bold ${fontPx}px sans-serif`;
    // The same estimate _measureLabels falls back to where the canvas
    // cannot measure text.
    const measured = ctx.measureText?.(text)?.width;
    const textWidth =
      typeof measured === 'number' && measured > 0
        ? measured
        : text.length * fontPx * LABEL_FALLBACK_EM_PER_CHAR;
    const plateWidth = textWidth + 12 * scale;
    const plateHeight = fontPx + 6 * scale;
    const finger = offsetCssPx === null && this._activeInput === 'touch';
    const pointerOffset = finger ? READOUT_OFFSET_TOUCH_PX : READOUT_OFFSET_MOUSE_PX;
    const offset = (offsetCssPx ?? pointerOffset) * scale;
    let x = anchorPx.x;
    let y = anchorPx.y - offset;
    const clearSpot = avoid
      ? this._clearReadoutSpot(anchorPx, offset, plateWidth, plateHeight, avoid)
      : null;
    if (clearSpot) {
      ({ x, y } = clearSpot);
    } else if (y - plateHeight / 2 < 0) {
      // A finger's goes beside it on the side with more room, the one side
      // worth trying, and below it where the plate does not fit there.
      const besideOffset = READOUT_BESIDE_TOUCH_PX * scale + plateWidth / 2;
      const roomRight = this.canvas.width - anchorPx.x;
      if (finger && Math.max(roomRight, anchorPx.x) >= besideOffset + plateWidth / 2) {
        x = anchorPx.x + (roomRight >= anchorPx.x ? 1 : -1) * besideOffset;
        y = anchorPx.y;
      } else {
        y = anchorPx.y + offset;
      }
    }
    // A finger keeps reporting after it leaves the canvas, and the shape
    // stops at the map's edge, so the readout stays on the canvas too.
    y = clampOnto(y, plateHeight / 2, this.canvas.height);
    x = clampOnto(x, plateWidth / 2, this.canvas.width);
    ctx.fillStyle = this.darkMode ? COLOR.ui.darkCanvasBackground : COLOR.ui.lightCanvasBackground;
    ctx.fillRect(x - plateWidth / 2, y - plateHeight / 2, plateWidth, plateHeight);
    ctx.fillStyle = this.darkMode ? COLOR.canvas.axisDark : COLOR.canvas.axisLight;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * Where a readout plate `width` by `height` (backing px) can sit around
   * `anchor`: centered `offset` above it, as far below, or beside it at its
   * height, right then left, with its near edge `offset` minus half its
   * height away. The first that lies wholly on the canvas and keeps
   * READOUT_CLEAR_CSS_PX from every box in `avoid`, or null for none.
   */
  _clearReadoutSpot(anchor, offset, width, height, avoid) {
    const gap = READOUT_CLEAR_CSS_PX * (this._frameScale || 1);
    const beside = offset - height / 2 + width / 2;
    const spots = [
      { x: anchor.x, y: anchor.y - offset },
      { x: anchor.x, y: anchor.y + offset },
      { x: anchor.x + beside, y: anchor.y },
      { x: anchor.x - beside, y: anchor.y },
    ];
    const { width: canvasW, height: canvasH } = this.canvas;
    return (
      spots.find(({ x, y }) => {
        const box = {
          left: x - width / 2,
          right: x + width / 2,
          top: y - height / 2,
          bottom: y + height / 2,
        };
        if (box.left < 0 || box.top < 0 || box.right > canvasW || box.bottom > canvasH) {
          return false;
        }
        return avoid.every((other) => this._boxGap(box, other) >= gap);
      }) || null
    );
  }

  /**
   * The boxes (backing px) of the buttons and notes laid over the canvas
   * that are showing now: the drawing modes, the unit switch, Undo and
   * Locked, the zoom row and the offline note. Nothing drawn on the canvas
   * under them can be read. None while the canvas has no layout box. With
   * `notes` false, the buttons only: _placeMapNotes puts the offline note
   * under the x labels, so the labels never make room for it. `canvasRect`
   * is the canvas's box where the frame has read it already.
   */
  _overlayBoxes({ notes = true, canvasRect = this.canvas?.getBoundingClientRect?.() } = {}) {
    const root = this.shadowRoot;
    if (!root || !canvasRect || !(canvasRect.width > 0) || !(canvasRect.height > 0)) return [];
    const scaleX = this.canvas.width / canvasRect.width;
    const scaleY = this.canvas.height / canvasRect.height;
    const ids = ['overlayControlsLeft', 'overlayControlsRight', 'zoomControls'];
    if (notes) ids.push('offlineNote');
    return ids.flatMap((id) => {
      const element = root.getElementById(id);
      if (!element || element.hidden) return [];
      const rect = element.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return [];
      return [
        {
          left: (rect.left - canvasRect.left) * scaleX,
          right: (rect.right - canvasRect.left) * scaleX,
          top: (rect.top - canvasRect.top) * scaleY,
          bottom: (rect.bottom - canvasRect.top) * scaleY,
        },
      ];
    });
  }

  /** One in-progress vertex marker: a filled dot with a contrasting ring. */
  _drawVertexDot(ctx, x, y) {
    const fill = this.darkMode
      ? COLOR.canvas.polygonVertexFillDark
      : COLOR.canvas.polygonVertexFillLight;
    const stroke = this.darkMode
      ? COLOR.canvas.polygonVertexStrokeDark
      : COLOR.canvas.polygonVertexStrokeLight;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  /** The zone's name at its center, followed by `suffix` (" (held)" or
   *  " (ignored)") when its look needs one, moved in as far as it takes to
   *  stay on the canvas. A zone wholly off the canvas gets none. */
  _drawZoneLabel(zone, bbox, suffix = '') {
    const place = this._zoneLabelPlacement(zone, bbox, suffix);
    if (!place) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${place.fontPx}px sans-serif`;
    ctx.fillStyle = this.darkMode ? COLOR.canvas.axisDark : COLOR.canvas.axisLight;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = this.darkMode
      ? COLOR.canvas.polygonVertexStrokeDark
      : COLOR.canvas.polygonVertexStrokeLight;
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillText(place.text, place.x, place.y);
    ctx.restore();
  }

  /**
   * Where zone `zone`'s name goes: `{ text, x, y, width, fontPx }` in
   * backing px, centered at (x, y), or null for none. At the shape's center
   * (a polygon's centroid, anything else's box center), moved in as far as
   * it takes to stay on the canvas. A zone wholly off the canvas gets none.
   */
  _zoneLabelPlacement(zone, bbox, suffix = '') {
    const ctx = this.ctx;
    const name = this._zoneLabel(zone.id);
    if (!name || !ctx || !this.canvas) return null;
    // A YAML grid smaller than the room can leave a zone off the canvas,
    // and its name, pulled onto the edge, would label whatever is drawn
    // there. A fitted map takes in every zone.
    const { width: canvasW, height: canvasH } = this.canvas;
    if (bbox.x >= canvasW || bbox.x + bbox.width <= 0) return null;
    if (bbox.y >= canvasH || bbox.y + bbox.height <= 0) return null;
    const text = `${name}${suffix}`;
    const fontPx = 24;

    // Shape center; polygons use centroid, others use bbox center
    let cx = bbox.x + bbox.width / 2;
    let cy = bbox.y + bbox.height / 2;
    if (
      zone.shape === DRAW_MODES.POLYGON &&
      Array.isArray(zone.data?.points) &&
      zone.data.points.length >= 3
    ) {
      let A = 0,
        Cx = 0,
        Cy = 0;
      for (let i = 0, j = zone.data.points.length - 1; i < zone.data.points.length; j = i++) {
        const xi = this.valueToPixels(zone.data.points[i].x, 'x');
        const yi = this.valueToPixels(zone.data.points[i].y, 'y');
        const xj = this.valueToPixels(zone.data.points[j].x, 'x');
        const yj = this.valueToPixels(zone.data.points[j].y, 'y');
        const cross = xi * yj - xj * yi;
        A += cross;
        Cx += (xi + xj) * cross;
        Cy += (yi + yj) * cross;
      }
      A *= 0.5;
      if (Math.abs(A) > 1e-6) {
        cx = Cx / (6 * A);
        cy = Cy / (6 * A);
      }
    }
    // Centered on a zone at a wall, a label ran off the canvas and lost its
    // start or its " (ignored)". Measured the way _drawSizeReadout measures,
    // with 2 px to spare at either side; one wider than the canvas is
    // centered on it.
    ctx.save();
    ctx.font = `${fontPx}px sans-serif`;
    const measured = ctx.measureText?.(text)?.width;
    ctx.restore();
    const width =
      typeof measured === 'number' && measured > 0
        ? measured
        : text.length * fontPx * LABEL_FALLBACK_EM_PER_CHAR;
    cx = clampOnto(cx, width / 2 + 2, canvasW);
    cy = clampOnto(cy, fontPx / 2, canvasH);
    return { text, x: cx, y: cy, width, fontPx };
  }

  /** The cone's edges in radians, rotation applied, and its range in mm. A
   *  positive rotation turns the cone to the device's right. */
  _coneSector() {
    const halfFovRad = ((this.coneFovDeg / 2) * Math.PI) / 180;
    const rotRad = (this.coneAngleDeg * Math.PI) / 180;
    return {
      thetaStart: -halfFovRad + rotRad,
      thetaEnd: halfFovRad + rotRad,
      radius: Math.max(0, this.coneYMax),
    };
  }

  /** Draws the cone, its rings and `ringLabels`. Without them it labels every
   *  ring, as no grid label has been laid out to make room for. */
  drawDeviceCone(gridMetrics, ringLabels = null) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const apex = { x: 0, y: 0 };

    const { thetaStart, thetaEnd, radius } = this._coneSector();
    const ax = this.valueToPixels(apex.x, 'x');
    const ay = this.valueToPixels(apex.y, 'y');

    // Point on arc at angle ang on circle with radius
    const pAt = (ang) => ({ x: radius * Math.sin(ang), y: radius * Math.cos(ang) });
    const L = pAt(thetaStart);
    const lx = this.valueToPixels(L.x, 'x');
    const ly = this.valueToPixels(L.y, 'y');

    // Build filled sector: apex -> left ray -> arc -> right ray -> apex
    const segments = 48;
    const step = (thetaEnd - thetaStart) / segments;

    ctx.save();
    ctx.fillStyle = COLOR.canvas.deviceConeFill;
    ctx.strokeStyle = COLOR.canvas.deviceConeStroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(lx, ly);
    for (let i = 1; i <= segments; i++) {
      const ang = thetaStart + step * i;
      const pt = pAt(ang);
      const px = this.valueToPixels(pt.x, 'x');
      const py = this.valueToPixels(pt.y, 'y');
      ctx.lineTo(px, py);
    }
    ctx.lineTo(ax, ay);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Draw range rings and labels within the cone when unit labels are enabled
    if (this.unitDisplay) {
      this._drawConeRings(thetaStart, thetaEnd, radius, gridMetrics, ringLabels);
    }
  }

  _getConeRingsRenderState(thetaStart, thetaEnd, radius, gridMetrics) {
    if (!this.unitDisplay) return null;
    if (!Number.isFinite(radius) || radius <= 0) return null;
    const angleSpan = thetaEnd - thetaStart;
    if (!Number.isFinite(angleSpan) || Math.abs(angleSpan) < 1e-6) return null;

    const gridUnit = gridMetrics ? gridMetrics.unit : this._displayUnit();
    const imperial = gridUnit === 'in' || gridUnit === 'ft';
    const labelUnit = imperial ? 'ft' : 'm';
    const stepUnits = imperial ? 4 : 1;
    const stepMm = stepUnits * this._unitMultiplier(labelUnit);
    if (!Number.isFinite(stepMm) || stepMm <= 0) return null;

    const pxPerMmX = gridMetrics ? gridMetrics.pxPerMmX : this.pxPerX || 0;
    const pxPerMmY = gridMetrics ? gridMetrics.pxPerMmY : this.pxPerY || 0;
    if (!pxPerMmX || !pxPerMmY) return null;

    const mirror = this._mirrorX;
    const keyParts = [
      this._roundKeyValue(thetaStart),
      this._roundKeyValue(thetaEnd),
      this._roundKeyValue(radius),
      this._roundKeyValue(pxPerMmX),
      this._roundKeyValue(pxPerMmY),
      this._roundKeyValue(this._viewXMin),
      this._roundKeyValue(this._viewXMax),
      this._roundKeyValue(this._viewYMin),
      labelUnit,
      stepMm,
      this.canvas?.width || 0,
      this.canvas?.height || 0,
      mirror ? 1 : 0,
    ];
    const key = keyParts.join('|');
    if (this._coneRingsCache && this._coneRingsCache.key === key) {
      return this._coneRingsCache;
    }

    const hasPath2D = typeof Path2D === 'function';
    const ringsPath = hasPath2D ? new Path2D() : null;
    const rings = [];
    const labels = [];

    const segments = 48;
    const angStep = angleSpan / segments;
    const sinStep = Math.sin(angStep);
    const cosStep = Math.cos(angStep);
    const sinStart = Math.sin(thetaStart);
    const cosStart = Math.cos(thetaStart);
    // The rings skip valueToPixels for speed, so they repeat its mapping
    // through the view's window: (x - xMin) * px, or (xMax - x) * px on a
    // flipped map, and (y - yMin) * px.
    const signX = mirror ? -1 : 1;
    const offsetX = mirror ? this._viewXMax * pxPerMmX : -this._viewXMin * pxPerMmX;
    const offsetY = -this._viewYMin * pxPerMmY;

    // TODO(REVIEW_REPORT.md X45): rings run out to cone.y_max (no ceiling), even past the grid.
    // If touched, stop at the farthest grid corner distance; do not clamp y_max.
    for (let r = stepMm; r <= radius + 1e-6; r += stepMm) {
      let sinAng = sinStart;
      let cosAng = cosStart;
      const points = [];
      for (let i = 0; i <= segments; i++) {
        const x = r * sinAng;
        const y = r * cosAng;
        const px = signX * x * pxPerMmX + offsetX;
        const py = y * pxPerMmY + offsetY;
        points.push([px, py]);
        if (i < segments) {
          const nextSin = sinAng * cosStep + cosAng * sinStep;
          const nextCos = cosAng * cosStep - sinAng * sinStep;
          sinAng = nextSin;
          cosAng = nextCos;
        }
      }
      if (ringsPath && points.length) {
        ringsPath.moveTo(points[0][0], points[0][1]);
        for (let idx = 1; idx < points.length; idx += 1) {
          ringsPath.lineTo(points[idx][0], points[idx][1]);
        }
      }
      rings.push(points);

      const mid = (thetaStart + thetaEnd) / 2;
      const lx = signX * r * Math.sin(mid) * pxPerMmX + offsetX;
      const ly = r * Math.cos(mid) * pxPerMmY + offsetY;
      labels.push({
        x: lx,
        y: ly,
        value: r,
        text: this._formatTickLabel(r, stepMm, labelUnit),
      });
    }

    this._coneRingsCache = { key, path: ringsPath, rings, labels };
    return this._coneRingsCache;
  }

  _drawConeRings(thetaStart, thetaEnd, radius, gridMetrics, ringLabels = null) {
    const ctx = this.ctx;
    if (!ctx) return;
    const state = this._getConeRingsRenderState(thetaStart, thetaEnd, radius, gridMetrics);
    if (!state) return;

    const axisColor = this.darkMode ? COLOR.canvas.axisDark : COLOR.canvas.axisLight;
    ctx.save();
    ctx.strokeStyle = COLOR.canvas.deviceConeStroke;
    ctx.lineWidth = 1;
    ctx.font = `${this.unitLabelSize}px sans-serif`;
    ctx.fillStyle = axisColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (state.path) {
      ctx.stroke(state.path);
    } else if (state.rings && state.rings.length) {
      ctx.beginPath();
      state.rings.forEach((points) => {
        if (!points.length) return;
        ctx.moveTo(points[0][0], points[0][1]);
        for (let idx = 1; idx < points.length; idx += 1) {
          ctx.lineTo(points[idx][0], points[idx][1]);
        }
      });
      ctx.stroke();
    }

    // drawGrid has already left out the ring labels a grid label names.
    (ringLabels ?? state.labels).forEach((label) => {
      ctx.fillText(label.text, label.x, label.y);
    });

    ctx.restore();
  }

  setupCanvas() {
    this.canvas = this.shadowRoot.getElementById('zoneCanvas');
    if (!this.canvas) {
      // The error state renders no canvas at all.
      this.ctx = null;
      return;
    }
    this.ctx = this.canvas.getContext('2d');
    this._sizeCanvas();
    this.drawGrid();
  }

  /**
   * Size the canvas backing store to the grid and set the px per mm.
   *
   * A YAML grid keeps the square 800 px store it always had. A fitted grid
   * gets a store the grid's own shape (_shapeFit keeps it between
   * FIT_MIN_ASPECT and square), and the container takes the same aspect
   * ratio, so a meter is as long across as it is down and the cone is not
   * stretched.
   */
  _sizeCanvas() {
    this._invalidateGridCache();
    this._invalidateConeCache();
    if (!this.canvas) {
      // No canvas to size, but the view still follows the extents.
      this._applyView();
      return;
    }
    // TODO(REVIEW_REPORT.md X39): fixed 800 px store with no devicePixelRatio (blurry on HiDPI);
    // non-square YAML grids draw stretched. DPR sizing must scale the px constants; document stretch.
    const safeWidth = Math.max(1, this.xMax - this.xMin);
    const safeHeight = Math.max(1, this.yMax - this.yMin);
    const width = CANVAS_WIDTH_PX;
    const height = this._gridFromConfig
      ? CANVAS_WIDTH_PX
      : Math.max(1, Math.round((CANVAS_WIDTH_PX * safeHeight) / safeWidth));
    // Assigning a size clears the canvas even when it is the same one.
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this._basePxPerX = width / safeWidth;
    this._basePxPerY = height / safeHeight;
    this._applyView();
    const container = this.canvas.parentElement;
    if (container) {
      container.style.aspectRatio = `${width} / ${height}`;
      // The height cap's width (see the .canvas-container rule) keeps this
      // shape too.
      container.style.setProperty('--zm-aspect', String(width / height));
    }
  }

  startDrawing(e) {
    // Nothing listens on a view-only map, and nothing there could end a
    // drawing that started anyway. In Walk the radar marks the corners, not
    // the pointer, and the canvas pans.
    if (this._viewOnly || this.drawMode === DRAW_MODES.WALK) return;
    // A right or middle press opens the browser menu or autoscroll; it must
    // not start a drag or place a vertex. Touch events carry no button.
    if (typeof e.button === 'number' && e.button !== 0) return;
    const isTouch = !!e.touches;
    // A second finger on the canvas is never a new gesture. Restarting here
    // moved the drag's origin to the first finger, and the next lift of
    // either finger committed a collapsed or truncated shape over the zone.
    if (isTouch && e.touches.length > 1) return;
    if (this.isLocked) {
      this._remindLocked(DRAW_LOCKED_TOAST);
      return;
    }
    if (this.selectedZone === null) return;
    if (!this.canvas) return;
    const touchId = isTouch ? this._touchIdOf(e) : null;
    const point = this._getPointFromEvent(e, touchId);
    if (!point) return;
    this.isDrawing = true;
    this._activeInput = isTouch ? 'touch' : 'mouse';
    this._activeTouchId = touchId;
    // The press places the first corner: on a round value, or right where
    // it is with Alt or Option held. A zoom or a pan mid-drag carries it
    // across in mm (_setView), so it never snaps again.
    this.startPoint = this._placedPx(point, !!e.altKey);
    this._cursorPoint = point;
    this._cursorFree = !!e.altKey;
    this.drawGrid();
  }

  draw(e) {
    if (this.isLocked || !this.isDrawing) return;
    const isTouch = !!(e.touches || e.changedTouches);
    if (
      this._activeInput &&
      ((isTouch && this._activeInput !== 'touch') || (!isTouch && this._activeInput !== 'mouse'))
    ) {
      return;
    }
    // Only the tracked finger moves the shape.
    if (isTouch && !this._carriesTrackedTouch(e)) return;
    // Every mode keeps the cursor point and lets drawGrid() rebuild the
    // preview from it, so any other repaint (a hass push, a zone payload)
    // redraws the rubber band instead of wiping it until the next move.
    const point = this._getPointFromEvent(e);
    if (!point) return;
    this._cursorPoint = point;
    this._cursorFree = !!e.altKey;
    this.drawGrid();
  }

  /** Map-frame mm to canvas backing px, through the view's window (the
   *  whole map at 1x), so a zoomed map draws every layer zoomed and a
   *  handle, a line or a label drawn in px keeps its size. */
  valueToPixels(val, axis) {
    if (axis === 'x') {
      // A flipped map (mirror_x) puts the window's xMax on the left edge.
      // Only these two transforms flip, never the context (ctx.scale(-1, 1)
      // or a CSS scaleX(-1) would mirror the text and the pointer math too).
      return this._mirrorX
        ? (this._viewXMax - val) * (this.pxPerX || 0)
        : (val - this._viewXMin) * (this.pxPerX || 0);
    } else {
      // Y increases downward: map directly without flipping
      return (val - this._viewYMin) * (this.pxPerY || 0);
    }
  }

  pixelsToValue(pix, axis) {
    if (axis === 'x') {
      if (!this.pxPerX) return this._mirrorX ? this._viewXMax : this._viewXMin;
      return this._mirrorX
        ? this._viewXMax - pix / this.pxPerX
        : pix / this.pxPerX + this._viewXMin;
    } else {
      // Inverse of valueToPixels when Y increases downward
      if (!this.pxPerY) return this._viewYMin;
      return this._viewYMin + pix / this.pxPerY;
    }
  }

  /** The map's extents, the whole picture a view is a part of. */
  _mapExtents() {
    return { xMin: this.xMin, xMax: this.xMax, yMin: this.yMin, yMax: this.yMax };
  }

  /** How far the map is zoomed in: 1 for the whole map. */
  _zoom() {
    return this._view ? clampView(this._view, this._mapExtents()).zoom : 1;
  }

  /**
   * Lay the view over the extents as they are now and set the window
   * valueToPixels maps through, and pxPerX / pxPerY at the zoom. The window
   * is clamped inside the map (a refit or a unit change can shrink it), but
   * the view is kept as it was set: a setConfig fits the map around the
   * YAML's cone for a moment before the store's rotation is laid back over
   * it, and the view must not lose its place to that. A view at 1x is the
   * whole map, null.
   */
  _applyView() {
    const map = this._mapExtents();
    if (this._view && clampView(this._view, map).zoom <= 1) this._view = null;
    const win = viewWindow(this._view, map);
    this._viewXMin = win.xMin;
    this._viewXMax = win.xMax;
    this._viewYMin = win.yMin;
    this._viewYMax = win.yMax;
    const zoom = this._zoom();
    this.pxPerX = (this._basePxPerX || 0) * zoom;
    this.pxPerY = (this._basePxPerY || 0) * zoom;
  }

  /**
   * Show `next` (a view, or null for the whole map). A rect or ellipse drag
   * holds its start and the pointer in canvas px (startDrawing), so both are
   * carried across in mm: the shape keeps its corner where it was put on the
   * map. A polygon's corners are in mm already.
   */
  _setView(next, { draw = true } = {}) {
    const toMm = (p) => (p ? { x: this.pixelsToValue(p.x, 'x'), y: this.pixelsToValue(p.y, 'y') } : p);
    const start = toMm(this.startPoint);
    const cursor = toMm(this._cursorPoint);
    this._view = next;
    // The rotation it was set at: another one starts from the whole map
    // (see _applyRotation).
    this._viewAngle = this.coneAngleDeg;
    this._applyView();
    const toPx = (m) => (m ? { x: this.valueToPixels(m.x, 'x'), y: this.valueToPixels(m.y, 'y') } : m);
    this.startPoint = toPx(start);
    this._cursorPoint = toPx(cursor);
    this._renderZoomControls();
    if (draw) this.drawGrid();
  }

  /** Back to the whole map, with no pinch or pan going on: another radar or
   *  another rotation is another picture. The caller draws. */
  _resetView() {
    this._endGesture();
    if (!this._view) return;
    this._setView(null, { draw: false });
  }

  /** The map point at canvas point `p` (backing px). */
  _mmAt(p) {
    return { x: this.pixelsToValue(p.x, 'x'), y: this.pixelsToValue(p.y, 'y') };
  }

  /** Where canvas point `p` (backing px) lies across the view's window, as
   *  viewAt takes it: 0 to 1 from the window's xMin and yMin edges, which a
   *  flipped map draws on the right. */
  _windowFrac(p) {
    const fx = this.canvas?.width ? p.x / this.canvas.width : 0.5;
    const fy = this.canvas?.height ? p.y / this.canvas.height : 0.5;
    return { x: this._mirrorX ? 1 - fx : fx, y: fy };
  }

  /** Zoom by `factor` around map point `at` (mm), the view's center when
   *  none is given (the + and - buttons). */
  _zoomBy(factor, at = null) {
    const map = this._mapExtents();
    const view = clampView(this._view, map);
    this._setView(zoomAt(view, map, factor, at || { x: view.cx, y: view.cy }));
  }

  /** The view Fit shows next: the zones with a margin, or the whole map
   *  when there are none or the view already shows them so. */
  _fitTarget() {
    const map = this._mapExtents();
    const box = boundsOf(this._zonePoints());
    const fit = box ? fitView(map, box) : null;
    if (!fit || fit.zoom <= 1 || sameView(fit, this._view, map)) return null;
    return fit;
  }

  /**
   * Lay the zoom buttons out from the view: the readout while zoomed, + and
   * - disabled at the ends of the range, and Fit labeled with what it does
   * next, disabled when that changes nothing. drawGrid calls it on every
   * frame, since a zone drawn, saved or deleted changes what Fit does, so
   * it touches the DOM only when one of those changed (the readout's
   * data-shown); render() builds the buttons again without it. A view-only
   * card has none.
   */
  _renderZoomControls() {
    const root = this.shadowRoot;
    const readout = root?.getElementById('zoomReadout');
    if (!readout) return;
    const zoom = this._zoom();
    const target = this._fitTarget();
    const key = `${zoom}|${!!target}`;
    if (readout.dataset.shown === key) return;
    readout.dataset.shown = key;
    readout.hidden = zoom <= 1;
    readout.textContent = zoom > 1 ? zoomReadout(zoom) : '';
    const zoomIn = root.getElementById('btnZoomIn');
    if (zoomIn) zoomIn.disabled = zoom >= ZOOM_MAX - 1e-9;
    const zoomOut = root.getElementById('btnZoomOut');
    if (zoomOut) zoomOut.disabled = zoom <= 1;
    const fit = root.getElementById('btnZoomFit');
    if (fit) {
      const label = target ? ZOOM_FIT_ZONES_LABEL : ZOOM_FIT_ALL_LABEL;
      fit.title = label;
      fit.setAttribute('aria-label', label);
      fit.disabled = !target && zoom <= 1;
    }
  }

  /** The zoom buttons and the gestures over the canvas. View-only cards
   *  attach none (render() skips them), and their map never zooms. */
  _attachZoomControls() {
    const on = (id, handler) => {
      const button = this.shadowRoot.getElementById(id);
      if (button) button.addEventListener('click', handler);
    };
    on('btnZoomIn', () => this._zoomBy(ZOOM_STEP));
    on('btnZoomOut', () => this._zoomBy(1 / ZOOM_STEP));
    on('btnZoomFit', () => this._setView(this._fitTarget()));
    this._renderZoomControls();
  }

  /**
   * Ctrl or Cmd and the wheel (a trackpad pinch on most browsers arrives
   * the same way) zoom around the pointer. A plain wheel is left to the
   * page, which scrolls as it always did.
   */
  _onWheel(event) {
    if (!(event.ctrlKey || event.metaKey)) return;
    // Also keeps the browser from zooming the whole page.
    event.preventDefault();
    const p = this._getPointFromEvent(event);
    if (!p) return;
    // A wheel that counts in lines (Firefox, on some systems) moves about
    // 16 px a line; one that counts in pages, a canvas's height.
    const perLine = 16;
    const unit =
      event.deltaMode === 1 ? perLine : event.deltaMode === 2 ? this.canvas.height : 1;
    const travel = Math.max(-WHEEL_PX_PER_STEP, Math.min(WHEEL_PX_PER_STEP, event.deltaY * unit));
    if (!travel) return;
    this._zoomBy(Math.pow(ZOOM_STEP, -travel / WHEEL_PX_PER_STEP), this._mmAt(p));
  }

  /**
   * Shift and the left button, or the middle button, drag the map. The map
   * point pressed stays under the pointer, and the window listeners follow
   * the drag past the canvas's edge. Returns whether the press was one.
   */
  _startMousePan(event) {
    const pans = event.button === 1 || (event.button === 0 && event.shiftKey);
    if (!pans || this._gesture) return false;
    const p = this._getPointFromEvent(event);
    if (!p) return false;
    // The middle button would start the browser's autoscroll.
    event.preventDefault();
    this._gesture = { kind: 'pan', at: this._mmAt(p), zoom: this._zoom() };
    this._onPanMove = (move) => {
      if (this._gesture?.kind !== 'pan') return;
      const q = this._getPointFromEvent(move);
      if (!q) return;
      const map = this._mapExtents();
      this._setView(viewAt(map, this._gesture.zoom, this._gesture.at, this._windowFrac(q)));
    };
    this._onPanEnd = () => this._endGesture();
    window.addEventListener('mousemove', this._onPanMove);
    window.addEventListener('mouseup', this._onPanEnd);
    return true;
  }

  /** End a pinch or a pan, and drop the window listeners a pan added. */
  _endGesture() {
    this._gesture = null;
    if (this._onPanMove) window.removeEventListener('mousemove', this._onPanMove);
    if (this._onPanEnd) window.removeEventListener('mouseup', this._onPanEnd);
    this._onPanMove = null;
    this._onPanEnd = null;
  }

  /**
   * Whether a second finger landing now starts a pinch. Not while the
   * browser already scrolls the page for the first finger (the event can no
   * longer be cancelled), and not once the first finger has drawn: moved
   * more than PINCH_SLOP_CSS_PX since it went down, it is drawing a shape,
   * and the second finger is a resting thumb or a palm, as it always was.
   */
  _pinchStarts(event) {
    if (!event.touches || event.touches.length < 2 || !event.cancelable) return false;
    const drawing =
      this.isDrawing &&
      this._activeInput === 'touch' &&
      findTouch(event.touches, this._activeTouchId) !== null;
    if (!drawing || !this.startPoint || !this._cursorPoint) return true;
    const scale = this._canvasScale();
    const moved = Math.hypot(
      this._cursorPoint.x - this.startPoint.x,
      this._cursorPoint.y - this.startPoint.y,
    );
    return moved / scale <= PINCH_SLOP_CSS_PX;
  }

  /**
   * Two fingers down: from here they zoom around their midpoint and pan,
   * and the stroke the first one began is dropped (a polygon keeps the
   * corners it has). The map point between them stays between them.
   */
  _startPinch(event) {
    if (this.isDrawing && this._activeInput === 'touch') {
      if (this.drawMode === DRAW_MODES.POLYGON && this._polyPoints.length) {
        this._cursorPoint = null;
        this._activeInput = null;
        this._activeTouchId = null;
      } else {
        // Also fits what a payload brought in while the finger was down.
        this.cancelDrawing();
      }
    }
    const [a, b] = [event.touches[0], event.touches[1]];
    const pa = this._getPointFromEvent(event, a.identifier);
    const pb = this._getPointFromEvent(event, b.identifier);
    if (!pa || !pb) return;
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    this._gesture = {
      kind: 'pinch',
      ids: [a.identifier, b.identifier],
      distance: Math.max(1, Math.hypot(pb.x - pa.x, pb.y - pa.y)),
      zoom: this._zoom(),
      at: this._mmAt(mid),
    };
    this.drawGrid();
  }

  /** The two pinching fingers moved: zoom by how far apart they are now
   *  against when they landed, with the map point that was between them
   *  between them still. */
  _movePinch(event) {
    const gesture = this._gesture;
    const pa = this._getPointFromEvent(event, gesture.ids[0]);
    const pb = this._getPointFromEvent(event, gesture.ids[1]);
    if (!pa || !pb) return;
    const distance = Math.max(1, Math.hypot(pb.x - pa.x, pb.y - pa.y));
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const zoom = gesture.zoom * (distance / gesture.distance);
    this._setView(viewAt(this._mapExtents(), zoom, gesture.at, this._windowFrac(mid)));
  }

  /**
   * Route a touch event to a pinch. Returns true when the pinch took it:
   * two fingers down (see _pinchStarts), the pinch's own moves, and every
   * touch until the last finger it left behind lifts, which draws nothing
   * and scrolls nothing. Otherwise the drawing handlers get it.
   */
  _pinchTouch(event, type) {
    if (this._viewOnly) return false;
    const gesture = this._gesture;
    if (gesture?.kind === 'pan') return false;
    if (type === 'touchstart') {
      // A finger put back down after a pinch can start another.
      if (gesture?.kind !== 'pinch' && this._pinchStarts(event)) {
        event.preventDefault();
        this._startPinch(event);
        return true;
      }
      if (!gesture) return false;
      if (event.cancelable) event.preventDefault();
      return true;
    }
    if (!gesture) return false;
    if (type === 'touchmove') {
      if (event.cancelable) event.preventDefault();
      if (gesture.kind === 'pinch') this._movePinch(event);
      return true;
    }
    // touchend or touchcancel: the pinch is over once either of its fingers
    // lifts, and the gesture once every finger has.
    if (type === 'touchend' && event.cancelable) event.preventDefault();
    const lifted =
      gesture.kind === 'pinch' &&
      gesture.ids.some((id) => findTouch(event.changedTouches, id) !== null);
    if (!event.touches || event.touches.length === 0) this._gesture = null;
    else if (lifted) this._gesture = { kind: 'pinched' };
    return true;
  }

  /**
   * Walk keeps the person walking in a zoomed view: when their dot nears
   * the view's edge, the view pans after them, and zooms out only if two
   * people in view no longer fit. Not during a pinch or a pan, which the
   * user is steering.
   */
  _followWalker({ draw = false } = {}) {
    if (this.drawMode !== DRAW_MODES.WALK || !this._view || this._gesture) return;
    const points = this._walkTargets().map(({ x, y }) => this._toMap(x, y));
    if (!points.length) return;
    const map = this._mapExtents();
    const next = followPoints(this._view, map, points, WALK_FOLLOW_INSET);
    if (!sameView(next, this._view, map)) this._setView(next, { draw });
  }

  getCardSize() {
    // The map alone has no chips, Configure or zone list under it.
    return this._viewOnly ? 6 : 8;
  }

  _updatePolygonButtonsVisibility() {
    const undo = this.shadowRoot.getElementById('btnPolyUndo');
    const fin = this.shadowRoot.getElementById('btnPolyFinish');
    // Polygon only: Walk has its own Undo corner and Finish in its panel.
    const show = this.drawMode === DRAW_MODES.POLYGON;
    [undo, fin].forEach((btn) => {
      if (!btn) return;
      btn.style.display = show ? 'block' : 'none';
    });
  }

  cancelDrawing() {
    this._resetDrawingState();
    // Fits what a payload or a unit change brought in mid-gesture.
    this._refitAndDraw();
  }

  disconnectedCallback() {
    this._detachGlobalListeners();
    // A pan's window listeners would keep the card alive and moving.
    this._endGesture();
    this._disconnectZones();
    this._stopTrailTimer();
    // A replay nobody can see stops, and the card comes back live.
    this._closeHistory();
    // A card further down the page may show the notice now.
    this._version?.close();
    this._version = null;
    this._renderVersionNotice();
  }

  _detachGlobalListeners() {
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._onKeyUp) {
      window.removeEventListener('keyup', this._onKeyUp);
      this._onKeyUp = null;
    }
    if (this._outsideClickHandler) {
      document.removeEventListener('mousedown', this._outsideClickHandler, true);
      document.removeEventListener('touchstart', this._outsideClickHandler, true);
      this._outsideClickHandler = null;
    }
  }

  /**
   * Say which of the three states the target list is in.
   *
   * Never configured and deliberately cleared both draw an empty canvas, and
   * telling a user that nothing is tracked when the radar is quietly tracking
   * its own targets is how the old card hid its state. Until the store has
   * answered (the first load, or the round trip after a retarget) none of the
   * three is known, so the line says so instead of guessing. Read only: the
   * integration resolves the pairs and `apollo_mmwave.update_zone` overrides
   * them.
   */
  _renderEntityStatus() {
    const host = this.shadowRoot?.getElementById('entityStatus');
    if (!host) return;
    if (this._zoneConfigPayload === null) {
      // The pre-payload state (no pairs, not using suggestions) is the same as
      // a user who cleared the list, so it cannot be read off trackedEntities.
      host.textContent = "Waiting for this radar's configuration.";
      return;
    }
    const configured = (this.trackedEntities || []).filter((pair) => pair.x && pair.y);
    if (this._usingSuggestedEntities) {
      host.textContent = configured.length
        ? `Using this radar's own detected targets (${configured.length}).`
        : "This radar has no detected targets yet, and none are configured.";
      return;
    }
    host.textContent = configured.length
      ? `Tracking ${configured.length} target pair${configured.length === 1 ? '' : 's'}.`
      : 'No targets are tracked, which is what this radar was told to do.';
  }

  _notify(message) {
    try {
      const ev = new Event('hass-notification', { bubbles: true, composed: true });
      ev.detail = { message };
      this.dispatchEvent(ev);
    } catch {
      alert(message);
    }
  }
}

// This used to be a hand-maintained copy of registerElement's define-then-
// re-assert dance. Same behavior, one implementation now.
//
// The name is in our own namespace and the old `zone-mapper-card` is not
// aliased. Both bundles used to claim that one name, so whichever loaded first
// won it and the loser's cards silently drove the winner's backend.
registerElement('apollo-radar-zone-map-card', ZoneMapCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'apollo-radar-zone-map-card',
  name: 'Apollo Zone Map',
  description: 'Draw occupancy zones over LD2450 tracking-radar targets',
});
