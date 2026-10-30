/**
 * The slider lock's store (src/cards/slider-lock.ts): per-radar state, the
 * relock timers, drags, the leave rule and the try counter. The rows that
 * use it are in slider-lock-rows.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEAVE_GRACE_MS,
  RELOCK_AFTER_MS,
  dragStarted,
  isUnlocked,
  noteSliderChange,
  noteTry,
  recentScroll,
  resetSliderLocks,
  setUnlocked,
  showsSlider,
  watchSliderLock,
  type LockChange,
} from "../src/cards/slider-lock";
import type { HassEntity } from "../src/types";

const MIN = 60 * 1000;

/** A watcher on `id` that records what it hears. */
function watch(id: string): { changes: LockChange[]; unwatch: () => void } {
  const changes: LockChange[] = [];
  const unwatch = watchSliderLock(id, (c) => changes.push(c));
  return { changes, unwatch };
}

function pointer(type: string, pointerId: number): void {
  window.dispatchEvent(new PointerEvent(type, { pointerId, isPrimary: true }));
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  resetSliderLocks();
  setVisibility("visible");
  vi.useRealTimers();
});

describe("slider lock state", () => {
  it("starts locked and ignores an unlock for a radar nobody watches", () => {
    expect(isUnlocked("dev1")).toBe(false);
    setUnlocked("dev1", true);
    expect(isUnlocked("dev1")).toBe(false);
  });

  it("locks again 5 minutes after the unlock or the last change", () => {
    const w = watch("dev1");
    setUnlocked("dev1", true);
    expect(w.changes).toEqual(["lock"]);
    vi.advanceTimersByTime(RELOCK_AFTER_MS - 1);
    expect(isUnlocked("dev1")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isUnlocked("dev1")).toBe(false);
    expect(w.changes).toEqual(["lock", "lock"]);

    // A change at 4:00 moves the relock to 9:00.
    setUnlocked("dev1", true);
    vi.advanceTimersByTime(4 * MIN);
    noteSliderChange("dev1");
    vi.advanceTimersByTime(5 * MIN - 1);
    expect(isUnlocked("dev1")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isUnlocked("dev1")).toBe(false);
  });

  it("locks by hand at once, clearing the timer", () => {
    const w = watch("dev1");
    setUnlocked("dev1", true);
    setUnlocked("dev1", false);
    expect(isUnlocked("dev1")).toBe(false);
    expect(w.changes).toEqual(["lock", "lock"]);
    vi.advanceTimersByTime(RELOCK_AFTER_MS);
    // No second relock once the timer is gone.
    expect(w.changes).toEqual(["lock", "lock"]);
    // Locking a locked radar says nothing.
    setUnlocked("dev1", false);
    expect(w.changes).toEqual(["lock", "lock"]);
  });

  it("ignores a change while locked", () => {
    watch("dev1");
    noteSliderChange("dev1");
    expect(isUnlocked("dev1")).toBe(false);
  });
});

describe("slider lock and drags", () => {
  it("waits for the end of a drag, then locks one tick later", () => {
    watch("dev1");
    setUnlocked("dev1", true);
    vi.advanceTimersByTime(4 * MIN);
    dragStarted("dev1", 7);
    vi.advanceTimersByTime(2 * MIN);
    expect(isUnlocked("dev1")).toBe(true);
    pointer("pointerup", 7);
    expect(isUnlocked("dev1")).toBe(true);
    vi.advanceTimersByTime(0);
    expect(isUnlocked("dev1")).toBe(false);
  });

  it("stays open when the drag's change arrives before that tick", () => {
    watch("dev1");
    setUnlocked("dev1", true);
    dragStarted("dev1", 7);
    vi.advanceTimersByTime(6 * MIN);
    pointer("pointerup", 7);
    noteSliderChange("dev1");
    vi.advanceTimersByTime(5 * MIN - 1);
    expect(isUnlocked("dev1")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isUnlocked("dev1")).toBe(false);
  });

  it("ends a drag on pointercancel too, but not on another pointer", () => {
    watch("dev1");
    setUnlocked("dev1", true);
    dragStarted("dev1", 7);
    vi.advanceTimersByTime(6 * MIN);
    pointer("pointerup", 8);
    vi.advanceTimersByTime(0);
    expect(isUnlocked("dev1")).toBe(true);
    pointer("pointercancel", 7);
    vi.advanceTimersByTime(0);
    expect(isUnlocked("dev1")).toBe(false);
  });
});

describe("slider lock and the page in the background", () => {
  it("clears drags when hidden and locks on return once the time is up", () => {
    watch("dev1");
    setUnlocked("dev1", true);
    dragStarted("dev1", 7);
    setVisibility("hidden");
    // The phone slept: its clock moved on, its timers did not fire.
    vi.setSystemTime(Date.now() + 6 * MIN);
    expect(isUnlocked("dev1")).toBe(true);
    setVisibility("visible");
    expect(isUnlocked("dev1")).toBe(false);
  });

  it("checks the time on pageshow as well", () => {
    watch("dev1");
    setUnlocked("dev1", true);
    vi.setSystemTime(Date.now() + 6 * MIN);
    window.dispatchEvent(new Event("pageshow"));
    expect(isUnlocked("dev1")).toBe(false);
  });

  it("stays open on return before the time is up", () => {
    watch("dev1");
    setUnlocked("dev1", true);
    vi.setSystemTime(Date.now() + 2 * MIN);
    setVisibility("hidden");
    setVisibility("visible");
    expect(isUnlocked("dev1")).toBe(true);
  });
});

describe("tries on a locked slider", () => {
  it("nudges first and reminds on a second try within 10 seconds, at most every 4 seconds", () => {
    const w = watch("dev1");
    const t = 1_000_000;
    expect(noteTry("dev1", false, t)).toBe("nudge");
    expect(noteTry("dev1", false, t + 5000)).toBe("remind");
    expect(noteTry("dev1", false, t + 7000)).toBe("nudge");
    expect(noteTry("dev1", false, t + 10000)).toBe("remind");
    expect(noteTry("dev1", false, t + 21000)).toBe("nudge");
    expect(w.changes).toEqual(["try", "try", "try", "try", "try"]);
  });

  it("reminds at once from the keyboard", () => {
    watch("dev1");
    expect(noteTry("dev1", true, 1_000_000)).toBe("remind");
  });

  it("starts counting again after an unlock", () => {
    watch("dev1");
    const t = Date.now();
    expect(noteTry("dev1", false, t)).toBe("nudge");
    setUnlocked("dev1", true);
    setUnlocked("dev1", false);
    expect(noteTry("dev1", false, t + 1000)).toBe("nudge");
    expect(noteTry("dev1", true, t + 2000)).toBe("remind");
  });
});

describe("slider lock per radar", () => {
  it("keeps two radars apart", () => {
    const a = watch("dev1");
    const b = watch("dev2");
    setUnlocked("dev1", true);
    expect(isUnlocked("dev1")).toBe(true);
    expect(isUnlocked("dev2")).toBe(false);
    expect(b.changes).toEqual([]);
    noteTry("dev2");
    expect(a.changes).toEqual(["lock"]);
    expect(b.changes).toEqual(["try"]);
  });

  it("locks 2 seconds after its last watcher leaves", () => {
    const a = watch("dev1");
    const b = watch("dev1");
    setUnlocked("dev1", true);
    a.unwatch();
    vi.advanceTimersByTime(LEAVE_GRACE_MS);
    expect(isUnlocked("dev1")).toBe(true);
    b.unwatch();
    vi.advanceTimersByTime(LEAVE_GRACE_MS - 1);
    expect(isUnlocked("dev1")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isUnlocked("dev1")).toBe(false);
    // The entry is gone: a stale Unlock does nothing.
    setUnlocked("dev1", true);
    expect(isUnlocked("dev1")).toBe(false);
  });

  it("stays unlocked when a watcher comes back within 2 seconds", () => {
    const a = watch("dev1");
    setUnlocked("dev1", true);
    a.unwatch();
    vi.advanceTimersByTime(LEAVE_GRACE_MS - 100);
    watch("dev1");
    vi.advanceTimersByTime(LEAVE_GRACE_MS);
    expect(isUnlocked("dev1")).toBe(true);
  });
});

describe("showsSlider", () => {
  const number = (attributes: Record<string, any>): HassEntity => ({
    entity_id: "number.x",
    state: "20",
    attributes,
  });

  it("follows Home Assistant's rule for a slider", () => {
    expect(showsSlider(number({ mode: "slider", min: 0, max: 900, step: 1 }))).toBe(true);
    expect(showsSlider(number({ mode: "auto", min: 0, max: 100, step: 1 }))).toBe(true);
    expect(showsSlider(number({ mode: "auto", min: 0, max: 256, step: 1 }))).toBe(true);
    expect(showsSlider(number({ mode: "auto", min: 0, max: 900, step: 1 }))).toBe(false);
    expect(showsSlider(number({ mode: "box", min: 0, max: 100, step: 1 }))).toBe(false);
    expect(showsSlider(number({}))).toBe(false);
    expect(showsSlider(undefined)).toBe(false);
  });
});

describe("recentScroll", () => {
  it("is true within 300 ms of a window scroll", () => {
    watch("dev1");
    expect(recentScroll()).toBe(false);
    window.dispatchEvent(new Event("scroll"));
    expect(recentScroll()).toBe(true);
    vi.advanceTimersByTime(299);
    expect(recentScroll()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(recentScroll()).toBe(false);
  });
});
