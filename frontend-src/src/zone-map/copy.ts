/**
 * Every string the zone map card shows that is not a user's own data.
 *
 * Kept in one module so the copy rules (US English, no em dash, the product
 * names as Apollo spells them) are checked in one place by copy.test.ts, and
 * so the docs can quote a string and be held to it. These are constants, never
 * user input, so the card may put them into its template; a zone name, a title
 * or an id still goes in through `textContent` or `.value`.
 */

export const OFFLINE_NOTE = "Radar offline";
export const IGNORED_SUFFIX = " (ignored)";
export const HELD_SUFFIX = " (held)";
export const LOCK_ON_TOAST = "Drawing and cone rotation locked. Unlock the map to change them.";
export const LOCK_OFF_TOAST = "Drawing and cone rotation unlocked. You can edit zones now.";
export const DRAW_LOCKED_TOAST = "Unlock the map to draw zones.";
export const CLEAR_LOCKED_TOAST = "Unlock the map to clear zones.";
export const SELECT_ZONE_TOAST = "Select a zone first.";
export const POLY_TOO_FEW_TOAST = "A polygon needs at least 3 different points.";
export const NO_SHAPE_TEXT = "No shape yet. Select the zone and draw it on the map.";
export const SIZE_PREFIX = "Size";
export const ZONE_SETTINGS_HINT =
  "Ignore drops targets inside that zone, such as a fan or a curtain, before the other zones are checked. Hold keeps a zone on for a while after the radar loses someone who sat still.";
export const ADMIN_ONLY_NOTE = "Only an administrator can change these.";
export const TYPE_LABEL = "Type";
export const TYPE_TITLE =
  "Detect turns this zone's presence sensor on. Ignore hides the targets inside it from the other zones.";
export const TYPE_OPTIONS = [{ value: "detect", label: "Detect" }, { value: "ignore", label: "Ignore" }];
export const HOLD_LABEL = "Hold";
// Labels come from formatHold: Off, 15 s, 30 s, 1 min, 2 min, 5 min, 10 min, 30 min.
export const HOLD_OPTIONS = [0, 15, 30, 60, 120, 300, 600, 1800];
export const HOLD_TITLE =
  "How long the zone stays on after someone inside goes still and the radar loses them";
export const HOLD_IGNORE_TITLE = "Ignore zones never hold";
export const ADMIN_ONLY_TITLE = "Only an administrator can change this";
export const WALK_BUTTON_TITLE = "Mark corners by walking";
export const WALK_CORNER = "Corner here";
export const WALK_UNDO = "Undo corner";
export const WALK_FINISH = "Finish";
export const WALK_CANCEL = "Cancel";
export const WALK_CANCEL_CONFIRM = "Drop the corners you marked?";
export const WALK_CANCEL_YES = "Drop them";
export const WALK_CANCEL_NO = "Keep marking";
export const WALK_HINT_NOBODY = "Nobody is on the map. Walk into the radar's view.";
export const WALK_HINT_CROWD =
  "More than one target is on the map. Only the person marking corners should be in view. If you are alone, a fan or curtain may be moving: add an ignore zone over it.";
export const WALK_HINT_START = "Stand still in one corner of the zone, then press Corner here.";

/** The Walk hint once `n` corners are marked (`n` is 1 or more). */
export function walkHintNext(n: number): string {
  if (n === 1) {
    return "Corner 1 marked. Walk along the edge to the next corner, stand still, and press Corner here.";
  }
  return `Corner ${n} marked. Keep going around the zone in order. Two corners make a rectangle, three or more a polygon. Press Finish when done.`;
}

export const WALK_HINT_FULL = "That is the most corners a zone can have. Press Finish.";
export const WALK_TOO_CLOSE_TOAST =
  "That is too close to the last corner. Walk farther, then press Corner here.";
export const WALK_CLOSED_TOAST = "That is where you started. Press Finish to save the zone.";
export const WALK_FLAT_TOAST =
  "Those corners make a zone too thin to use. Mark corners on opposite sides of the area.";
export const COVERAGE_LABEL = "Coverage";
export const COVERAGE_TITLE =
  "Paint where targets have been since this page opened (this browser only)";
export const COVERAGE_CLEAR = "Clear coverage";
export const HISTORY_LABEL = "History";
export const HISTORY_WALK_TITLE = "Finish or cancel the walk first.";
export const MIRROR_LABEL = "Flip the map left to right (display only)";
export const MIRROR_HINT = "Turn this on if a dot moves the opposite way from you.";
export const MOVEMENT_LABEL = "Movement history";
export const MOVEMENT_HINT =
  "Keeps up to 24 hours of target positions so administrators can replay them here. Backups include them. Turning it off deletes them from Home Assistant.";
export const MOVEMENT_ON_TOAST = "Movement history is on. Open History under the map to replay it.";
export const MOVEMENT_OFF_CONFIRM =
  "Turning this off deletes this radar's movement history from Home Assistant. Backups made while it was on keep their copy.";
export const MOVEMENT_OFF_CONFIRM_YES = "Turn off and delete";
export const MOVEMENT_OFF_CONFIRM_NO = "Keep it";
export const MOVEMENT_OFF_TOAST = "Movement history is off, and its history is deleted.";
export const HISTORY_TITLE = "Movement history";
export const HISTORY_RANGES = [{ hours: 1, label: "1 h" }, { hours: 6, label: "6 h" }, { hours: 24, label: "24 h" }];
export const HISTORY_HEATMAP = "Heatmap";
export const HISTORY_PLAY = "Play";
export const HISTORY_PAUSE = "Pause";
export const HISTORY_SPEEDS = [{ speed: 1, label: "1x" }, { speed: 10, label: "10x" }, { speed: 60, label: "60x" }];
export const HISTORY_SCRUB_LABEL = "Replay time";
export const HISTORY_HINT = "Zones are drawn with their current shapes, rotation and flip.";
export const HISTORY_EMPTY = "No movement recorded in this range yet.";
export const HISTORY_LOADING = "Loading movement history...";

/** What the History panel says when the movement read failed. */
export function historyError(message: string): string {
  return `Could not load movement history: ${message}`;
}

export const HISTORY_UNAUTHORIZED = "Only an administrator can open movement history.";
export const HISTORY_CLEAR = "Clear history";
export const HISTORY_CLEAR_CONFIRM = "Delete this radar's movement history?";
export const HISTORY_CLEAR_YES = "Delete";
export const HISTORY_CLEAR_NO = "Cancel";
export const HISTORY_CLEARED_TOAST = "Movement history cleared";
export const HISTORY_LIVE = "Back to live";

/** The badge over a replayed map. `time` is already formatted for the
 *  viewer's Home Assistant locale and time zone. */
export function replayBadge(time: string): string {
  return `Replay ${time}`;
}

/**
 * How long ago something happened, from its age in ms: "under a minute ago",
 * "N min ago" or "H h M min ago", in whole minutes rounded down, the way a
 * clock reads. A negative or unknown age (a clock slightly ahead of the
 * server's) reads as under a minute.
 */
export function formatAgo(ms: number): string {
  if (!(ms >= 60000)) return "under a minute ago";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
}

export const VIEW_ONLY_LABEL = "View only (the map without drawing tools)";
