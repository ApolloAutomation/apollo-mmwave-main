/**
 * The slider lock: whether a radar's threshold and range sliders take input.
 *
 * Home Assistant's slider sets its value where a finger lands and blocks the
 * page scroll that starts on it, so on a phone a scroll that begins on a
 * slider changes a threshold. The rows in `slider-lock-rows.ts` keep each
 * slider behind a shield while its radar is locked. This module holds the
 * lock state they share and the copy they show. It is pure: it defines no
 * elements, so the strategy can import the tags and `showsSlider` from it.
 *
 * One lock per radar, keyed by `device_id`, in module memory only. Nothing is
 * saved, so every page load starts locked (unlike the zone map's Locked
 * button, which the browser remembers). Once unlocked, the radar locks again
 * after RELOCK_AFTER_MS without a slider change, when every row of it has
 * been gone for LEAVE_GRACE_MS (the user left the tab or the dashboard), and
 * never while a finger or the mouse is still down on one of its sliders.
 */

import type { HassEntity } from "../types";

export const SLIDER_ROW_TAG = "apollo-radar-slider-row";
export const SLIDER_LOCK_ROW_TAG = "apollo-radar-slider-lock-row";

/** After an unlock or the last slider change. */
export const RELOCK_AFTER_MS = 5 * 60 * 1000;
/** A radar whose rows are all gone this long locks. A strategy regeneration
 *  puts new rows in within milliseconds and keeps the state. */
export const LEAVE_GRACE_MS = 2000;
/** A try this soon after the last one shows the reminder. */
export const REMIND_WITHIN_MS = 10 * 1000;
/** At most one reminder toast this often: Home Assistant's shortest toast. */
export const REMINDER_GAP_MS = 4000;
/** How long a try colors the slider and flashes the Unlock button. */
export const NUDGE_MS = 1200;
/** How far a pointer moves before it is a drag rather than a tap. */
export const DRAG_PX = 10;
/** A tap this soon after the page scrolled is the scroll stopping, not a try. */
export const SCROLL_GUARD_MS = 300;

export const LOCKED_TITLE = "Sliders locked";
export const LOCKED_HINT = "A scroll cannot move them.";
export const UNLOCKED_TITLE = "Sliders unlocked";
export const UNLOCKED_HINT = "They lock again after 5 minutes without a change.";
export const UNLOCK_LABEL = "Unlock";
export const LOCK_LABEL = "Lock";
export const REMINDER_TOAST = "These sliders are locked. Press Unlock above them to change one.";
export const UNLOCKED_TOAST =
  "Sliders unlocked. They lock again after 5 minutes without a change.";
export const LOCKED_TOAST = "Sliders locked.";

/** What a watcher hears: the radar locked or unlocked, or someone tried a
 *  locked slider. */
export type LockChange = "lock" | "try";

interface RadarLock {
  unlocked: boolean;
  /** When an unlocked radar locks again, unless a change moves it. */
  deadline: number;
  timer?: ReturnType<typeof setTimeout>;
  leaveTimer?: ReturnType<typeof setTimeout>;
  /** Pointers down on one of this radar's unlocked sliders. */
  drags: Set<number>;
  lastTry: number;
  lastReminder: number;
  listeners: Set<(change: LockChange) => void>;
}

const radars = new Map<string, RadarLock>();
let lastScrollAt = -Infinity;
let installed = false;

function radar(id: string): RadarLock {
  let l = radars.get(id);
  if (!l) {
    l = {
      unlocked: false,
      deadline: 0,
      drags: new Set(),
      lastTry: -Infinity,
      lastReminder: -Infinity,
      listeners: new Set(),
    };
    radars.set(id, l);
  }
  return l;
}

function emit(l: RadarLock, change: LockChange): void {
  for (const listener of [...l.listeners]) listener(change);
}

function lock(l: RadarLock): void {
  clearTimeout(l.timer);
  l.timer = undefined;
  if (!l.unlocked) return;
  l.unlocked = false;
  emit(l, "lock");
}

/** Start the relock countdown again. */
function arm(id: string, l: RadarLock): void {
  l.deadline = Date.now() + RELOCK_AFTER_MS;
  clearTimeout(l.timer);
  l.timer = setTimeout(() => expire(id), RELOCK_AFTER_MS);
}

/** Lock the radar if its time is up and nothing holds one of its sliders. */
function expire(id: string): void {
  const l = radars.get(id);
  if (!l?.unlocked) return;
  const left = l.deadline - Date.now();
  if (left > 0) {
    clearTimeout(l.timer);
    l.timer = setTimeout(() => expire(id), left);
    return;
  }
  // The end of the drag checks again.
  if (l.drags.size > 0) return;
  lock(l);
}

function expireAll(): void {
  for (const id of [...radars.keys()]) expire(id);
}

/** A drag ended. If the time ran out during it, check again one tick later:
 *  the slider sends its `change` just after the pointerup, and that change
 *  restarts the countdown, so a drag that set a value never ends in a relock. */
function onPointerEnd(e: PointerEvent): void {
  for (const [id, l] of radars) {
    if (!l.drags.delete(e.pointerId) || l.drags.size > 0) continue;
    if (l.unlocked && Date.now() >= l.deadline) setTimeout(() => expire(id), 0);
  }
}

function onVisibility(): void {
  if (document.visibilityState === "hidden") {
    // A pointerup lost while hidden must not hold a radar open.
    for (const l of radars.values()) l.drags.clear();
  } else {
    // Phone timers sleep in the background.
    expireAll();
  }
}

function onScroll(): void {
  lastScrollAt = Date.now();
}

function install(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("pointerup", onPointerEnd, { capture: true, passive: true });
  window.addEventListener("pointercancel", onPointerEnd, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", expireAll);
  // Home Assistant's dashboards scroll the window.
  window.addEventListener("scroll", onScroll, { passive: true });
}

/** Whether the radar's sliders take input. An unknown radar is locked. */
export function isUnlocked(id: string): boolean {
  return radars.get(id)?.unlocked ?? false;
}

/** Unlock or lock a radar's sliders. Unlocking a radar no row shows does
 *  nothing, so a stale toast's Unlock cannot open a radar nobody sees. */
export function setUnlocked(id: string, unlocked: boolean): void {
  const l = radars.get(id);
  if (!unlocked) {
    if (l) lock(l);
    return;
  }
  if (!l?.listeners.size) return;
  l.unlocked = true;
  l.lastTry = -Infinity;
  l.lastReminder = -Infinity;
  arm(id, l);
  emit(l, "lock");
}

/** A slider of an unlocked radar changed: the countdown starts again. */
export function noteSliderChange(id: string): void {
  const l = radars.get(id);
  if (l?.unlocked) arm(id, l);
}

/** A pointer went down on one of the radar's unlocked sliders. Until it is
 *  up again, the radar does not lock on its own. */
export function dragStarted(id: string, pointerId: number): void {
  install();
  radar(id).drags.add(pointerId);
}

/**
 * Someone tried a locked slider. Every try nudges; a second try within
 * REMIND_WITHIN_MS, or any try from the keyboard, also reminds, at most once
 * per REMINDER_GAP_MS. Watchers hear "try", so the lock rows flash.
 */
export function noteTry(id: string, keyboard = false, now = Date.now()): "nudge" | "remind" {
  const l = radar(id);
  const again = now - l.lastTry <= REMIND_WITHIN_MS;
  l.lastTry = now;
  emit(l, "try");
  if ((keyboard || again) && now - l.lastReminder >= REMINDER_GAP_MS) {
    l.lastReminder = now;
    return "remind";
  }
  return "nudge";
}

/** Listen to a radar's lock. The returned function stops listening; once the
 *  radar's last listener has been gone LEAVE_GRACE_MS, the radar locks. */
export function watchSliderLock(id: string, listener: (change: LockChange) => void): () => void {
  install();
  const l = radar(id);
  clearTimeout(l.leaveTimer);
  l.leaveTimer = undefined;
  l.listeners.add(listener);
  let watching = true;
  return () => {
    if (!watching) return;
    watching = false;
    l.listeners.delete(listener);
    if (l.listeners.size > 0) return;
    clearTimeout(l.leaveTimer);
    l.leaveTimer = setTimeout(() => {
      if (l.listeners.size > 0) return;
      lock(l);
      if (radars.get(id) === l) radars.delete(id);
    }, LEAVE_GRACE_MS);
  };
}

/** Whether Home Assistant draws this number as a slider: its own
 *  `showNumberSlider` (src/data/number.ts, the same in 2026.8 and 2026.10).
 *  False without a state. */
export function showsSlider(s?: HassEntity): boolean {
  if (!s) return false;
  const { mode, min, max, step } = s.attributes;
  return (
    mode === "slider" ||
    (mode === "auto" && (Number(max) - Number(min)) / Number(step) <= 256)
  );
}

/** Whether the page scrolled within the last SCROLL_GUARD_MS. */
export function recentScroll(now = Date.now()): boolean {
  return now - lastScrollAt < SCROLL_GUARD_MS;
}

/** Tests only: forget every radar and stop their timers. */
export function resetSliderLocks(): void {
  for (const l of radars.values()) {
    clearTimeout(l.timer);
    clearTimeout(l.leaveTimer);
  }
  radars.clear();
  lastScrollAt = -Infinity;
}
