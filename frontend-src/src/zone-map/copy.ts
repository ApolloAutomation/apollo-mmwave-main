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
// The Locked button's tooltip, which says what a press does.
export const LOCK_TITLE = "Lock drawing and cone rotation";
export const UNLOCK_TITLE = "Unlock drawing and cone rotation";
export const DRAW_LOCKED_TOAST = "Unlock the map to draw zones.";
export const CLEAR_LOCKED_TOAST = "Unlock the map to clear zones.";
export const SELECT_ZONE_TOAST = "Select a zone first.";
export const POLY_TOO_FEW_TOAST = "A polygon needs at least 3 different points.";
export const NO_SHAPE_TEXT = "Not drawn yet";
export const SIZE_PREFIX = "Size";
export const ADMIN_ONLY_NOTE = "Only an administrator can change these.";
export const TYPE_LABEL = "Type";
export const TYPE_OPTIONS = [{ value: "detect", label: "Detect" }, { value: "ignore", label: "Ignore" }];
export const HOLD_LABEL = "Hold";
// Labels come from formatHold: Off, 15 s, 30 s, 1 min, 2 min, 5 min, 10 min, 30 min.
export const HOLD_OPTIONS = [0, 15, 30, 60, 120, 300, 600, 1800];
export const ADMIN_ONLY_TITLE = "Only an administrator can change this";

// The Zones panel under the map: its heading and Add zone, the chips, and
// the selected zone's editor. What Type and Hold do is said in the text under
// them, which follows the zone's type: a title never reaches touch users.
export const ZONES_TITLE = "Zones";
export const ADD_ZONE_LABEL = "Add zone";
export const ZONES_EMPTY = "No zones yet. Press Add zone, then drag on the map to draw it.";
export const ZONES_EMPTY_ROTATION =
  "Is the sensor turned, or mounted in a corner? Set Cone rotation under Map settings first.";
export const ZONES_EMPTY_VIEWER = "No zones yet. An administrator can add them.";
// A press on the map of a radar with no zones, where nothing can be drawn.
export const ADD_ZONE_FIRST_TOAST = "Press Add zone under the map first.";

/** Under Add zone once every zone id the map gives out is taken. */
export function zonesFullNote(max: number): string {
  return `The map holds up to ${max} zones. Delete one to add another.`;
}

export const ZONE_NAME_LABEL = "Name";
export const TYPE_DETECT_HINT = "Detect: its presence sensor turns on while someone is inside.";
export const TYPE_IGNORE_HINT =
  "Ignore: targets inside, such as a fan or a curtain, are dropped before the other zones are checked.";
export const HOLD_HINT =
  "Hold keeps it on for a while after someone inside goes still and the radar loses them.";
export const HOLD_IGNORE_HINT = "Ignore zones never hold.";
// A name, a Type or a Hold saves on its own, and says so beside the zone's
// heading. A shape still toasts "<name> saved".
export const ZONE_SAVING = "Saving...";
export const ZONE_SAVED = "Saved";
export const ZONE_NOT_SAVED = "Not saved";
// The selected zone's presence sensor, live.
export const PRESENCE_LABEL = "Now";
export const PRESENCE_ON = "Someone is in this zone";
export const PRESENCE_HELD = "On, held for someone who went still";
export const PRESENCE_OFF = "Nobody is in this zone";
export const PRESENCE_IGNORED = "Never turns on, since it ignores targets";
export const PRESENCE_NOT_DRAWN = "Turns on once the zone is drawn";
export const PRESENCE_NO_SENSOR = "No presence sensor yet";
export const DELETE_ZONE_LABEL = "Delete zone";

/** The question Delete zone asks first, in place of the button. */
export function deleteZoneConfirm(name: string): string {
  return `Delete ${name}? Its sensors leave Home Assistant, so automations that use them stop working. This cannot be undone.`;
}

export const DELETE_ZONE_YES = "Delete";
export const DELETE_ZONE_NO = "Keep it";
// Under Map settings: one press clears every zone's shape, so it asks first.
export const CLEAR_ALL_LABEL = "Clear all shapes";
export const CLEAR_ALL_CONFIRM =
  "Clear every zone's shape? The zones keep their names, types and hold times, and ↶ on the map or Restore previous shape in each zone brings the shapes back.";
// The same question on a card whose YAML hides ↶ (show_undo: false).
export const CLEAR_ALL_CONFIRM_NO_UNDO =
  "Clear every zone's shape? The zones keep their names, types and hold times, and Restore previous shape in each zone brings its shape back.";
export const CLEAR_ALL_YES = "Clear shapes";
export const CLEAR_ALL_NO = "Keep them";
export const ALL_CLEARED_TOAST = "All shapes cleared";
export const MAP_SETTINGS_LABEL = "Map settings";
// Where the editor says how to draw: the lock stops drawing, not editing.
export const ZONES_LOCKED_HINT =
  "The map is locked, so drawing is off. Unlock it to draw this zone or change its shape.";
export const UNLOCK_LABEL = "Unlock";
export const DRAW_HINT_WALKING =
  "Marking this zone's corners by walking. Follow the steps under the map.";

// A drag draws only once armed for one zone.
export const DRAW_SHAPE_LABEL = "Draw shape";
export const REDRAW_SHAPE_LABEL = "Redraw shape";
export const CANCEL_DRAWING_LABEL = "Cancel drawing";
export const BANNER_CANCEL = "Cancel";

// The chip's ✎ label.
export function drawChipLabel(name: string, drawn: boolean): string {
  return `${drawn ? "Redraw" : "Draw"} ${name}`;
}

// Banner on the map while armed.
export function drawingBanner(name: string): string {
  return `Drawing ${name}`;
}

// The same banner during Walk.
export function walkingBanner(name: string): string {
  return name ? `Marking ${name} by walking` : "Marking corners by walking";
}

// A press on a map not armed.
export function armFirstToast(name: string, drawn: boolean): string {
  return drawn
    ? `To redraw ${name}, press Redraw shape first.`
    : `To draw ${name}, press Draw shape first.`;
}

/**
 * How to draw the selected zone in drawing mode `mode` (rect, ellipse or
 * polygon), up to `maxCorners` corners for a polygon. `drawn` says the zone
 * has a shape, which a new one replaces.
 */
export function drawHint(
  mode: string,
  drawn: boolean,
  maxCorners: number,
  { armed = false, canExpand = false }: { armed?: boolean; canExpand?: boolean } = {}
): string {
  const press = drawn ? "Press Redraw shape" : "Press Draw shape";
  const stop = " Cancel drawing or Esc stops without a change.";
  const tail = canExpand && !armed ? ` ${EXPAND_HINT}` : "";
  if (mode === "polygon") {
    if (armed) {
      return `Tap each corner of this zone on the map, up to ${maxCorners}, then double-tap the last one or press ✓.${stop}`;
    }
    const corners = drawn ? "each corner of the new shape" : "each corner of this zone";
    return `${press}, then tap ${corners} on the map, up to ${maxCorners}, and double-tap the last one or press ✓.${tail}`;
  }
  const shape = mode === "ellipse" ? "an ellipse" : "a rectangle";
  if (armed) return `Drag on the map to draw this zone as ${shape}.${stop}`;
  const others = mode === "ellipse" ? "a rectangle or a polygon" : "an ellipse or a polygon";
  const lead = drawn
    ? `${press}, then drag on the map to give this zone a new ${mode === "ellipse" ? "ellipse" : "rectangle"}.`
    : `${press}, then drag on the map to draw this zone as ${shape}.`;
  return `${lead} ✎ on the map offers ${others}. A tap on a zone on the map picks it.${tail}`;
}

// Undo: toast, ↶ and Restore previous shape.
export const UNDO_ACTION = "Undo";
export const UNDO_TITLE = "Undo last zone change";
export const UNDONE_CLEAR_TOAST = "Undid Clear all shapes";
export const RESTORE_SHAPE_LABEL = "Restore previous shape";
export const RESTORE_LOCKED_TOAST = "Unlock the map to restore a shape.";
export const UNDO_LOCKED_TOAST = "Unlock the map to undo a shape change.";

// After a zone's first shape saved.
export function zoneDrawnToast(name: string): string {
  return `${name} drawn`;
}

// After a new shape replaced the old.
export function zoneRedrawnToast(name: string): string {
  return `${name} redrawn`;
}

export function shapeRestoredToast(name: string): string {
  return `Previous shape of ${name} restored`;
}

export function undoneToast(name: string): string {
  return `Undid the change to ${name}`;
}

// "A", "A and B", "A, B, and C".
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

// Zones changed since, which Undo skipped.
export function undoSkippedToast(names: string[]): string {
  return names.length === 1
    ? `${names[0]} was changed in the meantime, so it was not undone.`
    : `${nameList(names)} were changed in the meantime, so they were not undone.`;
}

export function restoreSkippedToast(name: string): string {
  return `${name} was changed in the meantime, so nothing was restored.`;
}

export function couldNotUndo(reason: string): string {
  return `Could not undo: ${reason}`;
}

export function couldNotRestore(reason: string): string {
  return `Could not restore: ${reason}`;
}

// Under Restore previous shape.
export function restoreShapeHint(ago: string): string {
  return `Replaced ${ago}`;
}

// A negative or unknown age reads as under a minute.
export function formatReplacedAgo(ms: number): string {
  if (!(ms >= 60000)) return "under a minute ago";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
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
// A corner is where the radar placed the walker over the last 1.5 s, and the
// LD2450 updates each axis about once a second, so the hints ask for about
// 3 seconds of standing still before Corner here.
export const WALK_HINT_START =
  "Stand still in one corner of the zone for about 3 seconds, then press Corner here.";

/** The Walk hint once `n` corners are marked (`n` is 1 or more). */
export function walkHintNext(n: number): string {
  if (n === 1) {
    return "Corner 1 marked. Walk along the edge to the next corner, stand still for about 3 seconds, and press Corner here.";
  }
  return `Corner ${n} marked. Keep going around the zone in order, and stand still for about 3 seconds at each corner. Two corners make a rectangle, three or more a polygon. Press Finish when done.`;
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
// The zoom buttons over the map's lower right corner. A label is also its
// button's tooltip, but for + (ZOOM_IN_TITLE, which names the gestures).
// Fit's says what the next press does: fit the zones, or, once they fill
// the view or with none drawn, show the whole map.
export const ZOOM_GROUP_LABEL = "Map zoom";
export const ZOOM_IN_LABEL = "Zoom in";
export const ZOOM_IN_TITLE = "Zoom in. You can also hold Ctrl or Cmd and scroll, or pinch.";
export const ZOOM_OUT_LABEL = "Zoom out";
export const ZOOM_FIT = "Fit";
export const ZOOM_FIT_ZONES_LABEL = "Fit the zones in view";
export const ZOOM_FIT_ALL_LABEL = "Show the whole map";
// The tooltip on the zoom readout ("2x"), which shows while the map is
// zoomed, when there is somewhere to move it.
export const ZOOM_PAN_HINT =
  "Move the map by dragging with Shift held, with the middle mouse button, or with two fingers.";

/** The zoom readout: "2x", "1.4x". */
export function zoomReadout(zoom: number): string {
  return `${Number(zoom.toFixed(1))}x`;
}

// Expand map: the button in the map's top right corner, and while the map
// fills the window, the same button (now closing it) and the X beside the
// title. The X's label is also its tooltip.
export const FULL_WINDOW_OPEN_LABEL = "Expand map";
// Beside the icon where the map has room.
export const FULL_WINDOW_OPEN_TEXT = "Expand";
export const EXPAND_HINT = "Expand, at the map's top right, fills the window with the map.";
export const FULL_WINDOW_OPEN_TITLE = "Expand the map to fill the window. Press Esc to return.";
export const FULL_WINDOW_CLOSE_LABEL = "Close expanded map";
export const FULL_WINDOW_CLOSE_TITLE = "Close expanded map. You can also press Esc.";

/** What a screen reader calls the expanded map: "Office zone map". */
export function fullWindowLabel(title: string): string {
  return title ? `${title} zone map` : "Zone map";
}

export const MIRROR_LABEL = "Flip the map left to right (display only)";
// Under Cone rotation. Nothing on the radar tells the map how it is
// mounted, so a unit turned on its side or picked up moves the room under
// the zones.
export const CONE_MOUNT_HINT =
  "Mount the sensor first, then set this. Zones match the room only while the sensor stays mounted that way.";
// The walk test behind the flip holds only with the map turned to match the
// room: at Cone rotation 180, a step to the right moves the dot left on an
// unturned screen, and the radar is right.
export const MIRROR_HINT =
  "Turn this on if, with the map turned the way the room is, a dot moves the opposite way from you.";
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

/** The end of `historyError` for an answer that is not movement history,
 *  as from a backend whose answer changed shape. */
export const HISTORY_UNREADABLE = "Home Assistant sent an answer this card cannot read.";
export const HISTORY_UNAUTHORIZED = "Only an administrator can open movement history.";
export const HISTORY_CLEAR = "Clear history";
export const HISTORY_CLEAR_CONFIRM = "Delete this radar's movement history?";
export const HISTORY_CLEAR_YES = "Delete";
export const HISTORY_CLEAR_NO = "Cancel";
export const HISTORY_CLEARED_TOAST = "Movement history cleared";

/** What the card says when Clear history was refused. */
export function historyClearError(message: string): string {
  return `Could not clear movement history: ${message}`;
}
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
