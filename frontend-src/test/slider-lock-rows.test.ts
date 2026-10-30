/**
 * The slider lock's rows (src/cards/slider-lock-rows.ts): the slider row
 * around Home Assistant's own number row, and the lock row above it.
 *
 * vitest.bundles.config.ts runs this suite again against the committed
 * bundle, whose rows use the bundle's own copy of the lock store. So the
 * tests drive the lock only through the rows (the lock row's button, a
 * toast's action), never through the store, and every test uses its own
 * device id. The copy and timing constants come from the source store.
 *
 * HA's row is a stand-in made by a stubbed `loadCardHelpers`: a shadow root
 * with an <ha-slider> whose own shadow root holds a `div[role=slider]`, and
 * a `change` listener on the ha-slider that records what HA's row would
 * have written.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApolloRadarSliderLockRow, ApolloRadarSliderRow } from "../src/cards/slider-lock-rows";
import {
  LOCKED_HINT,
  LOCKED_TITLE,
  LOCKED_TOAST,
  LOCK_LABEL,
  NUDGE_MS,
  RELOCK_AFTER_MS,
  REMINDER_TOAST,
  SLIDER_LOCK_ROW_TAG,
  SLIDER_ROW_TAG,
  UNLOCKED_HINT,
  UNLOCKED_TITLE,
  UNLOCKED_TOAST,
  UNLOCK_LABEL,
  LEAVE_GRACE_MS,
} from "../src/cards/slider-lock";

const ENTITY = "number.apollo_msr_2_abc123_g0_move_threshold";
const NAME = "G0 (at the sensor)";
const SLIDER_ATTRS = { mode: "auto", min: 0, max: 100, step: 1, unit_of_measurement: "%" };
/** Where the stand-in slider sits: x 200 to 400. */
const SLIDER_X = 300;
const NAME_X = 50;

interface FakeRow extends HTMLElement {
  hass?: unknown;
  config: Record<string, unknown>;
  /** What HA's row would have written. */
  writes: number;
  /** Keys that reached the slider. */
  keys: string[];
  slider?: HTMLElement;
  thumb?: HTMLElement;
}

/** HA's number row, as far as the slider row can see it. */
function fakeRow(config: Record<string, unknown>, withSlider = true): FakeRow {
  const row = document.createElement("div") as unknown as FakeRow;
  row.config = config;
  row.writes = 0;
  row.keys = [];
  const root = row.attachShadow({ mode: "open" });
  if (!withSlider) {
    root.appendChild(document.createElement("span"));
    return row;
  }
  const slider = document.createElement("ha-slider");
  const thumb = document.createElement("div");
  thumb.setAttribute("role", "slider");
  thumb.tabIndex = 0;
  slider.attachShadow({ mode: "open" }).appendChild(thumb);
  slider.getBoundingClientRect = () =>
    ({ left: 200, right: 400, width: 200, top: 0, bottom: 40, height: 40, x: 200, y: 0 }) as DOMRect;
  slider.addEventListener("change", () => row.writes++);
  thumb.addEventListener("keydown", (e) => row.keys.push(e.key));
  root.appendChild(slider);
  row.slider = slider;
  row.thumb = thumb;
  return row;
}

let createRowElement: ReturnType<typeof vi.fn>;
let ids = 0;
const cleanups: (() => void)[] = [];

/** A device id no other test has used, so no lock state carries over. */
function freshId(): string {
  return `dev-${++ids}`;
}

function hassWith(
  attributes: Record<string, unknown> = SLIDER_ATTRS,
  state = "20",
  entity = ENTITY
): any {
  return {
    states: { [entity]: { entity_id: entity, state, attributes } },
    entities: {},
    devices: {},
    formatEntityState: (s: { state: string }) => `${s.state} %`,
  };
}

async function settle(...els: any[]): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  for (const el of els) await el.updateComplete;
}

async function mountRow(
  deviceId: string,
  hass: any = hassWith(),
  extra: Record<string, unknown> = {}
): Promise<any> {
  const el: any = document.createElement(SLIDER_ROW_TAG);
  el.setConfig({
    type: `custom:${SLIDER_ROW_TAG}`,
    entity: ENTITY,
    name: NAME,
    device_id: deviceId,
    ...extra,
  });
  el.hass = hass;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

async function mountLock(deviceId: string): Promise<any> {
  const el: any = document.createElement(SLIDER_LOCK_ROW_TAG);
  el.setConfig({ type: `custom:${SLIDER_LOCK_ROW_TAG}`, device_id: deviceId });
  el.hass = hassWith();
  document.body.appendChild(el);
  await settle(el);
  return el;
}

const shield = (el: any): HTMLElement | null => el.shadowRoot.querySelector(".shield");
const rowClasses = (el: any): DOMTokenList => el.shadowRoot.querySelector(".row").classList;
const inner = (el: any): FakeRow => el.shadowRoot.querySelector(".native").firstElementChild;
const button = (lock: any): HTMLButtonElement => lock.shadowRoot.querySelector("button");
const text = (el: any): string => (el.shadowRoot.textContent ?? "").replace(/\s+/g, " ").trim();

/** Every `type` event that reaches the window, by its detail. */
function record(type: string): any[] {
  const seen: any[] = [];
  const listener = (e: Event) => seen.push((e as CustomEvent).detail);
  window.addEventListener(type, listener);
  cleanups.push(() => window.removeEventListener(type, listener));
  return seen;
}

function click(el: any, clientX: number, init: MouseEventInit = {}): void {
  shield(el)!.dispatchEvent(
    new MouseEvent("click", { clientX, bubbles: true, composed: true, ...init })
  );
}

function pointer(target: EventTarget, type: string, init: PointerEventInit = {}): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      isPrimary: true,
      pointerType: "touch",
      clientX: SLIDER_X,
      clientY: 20,
      bubbles: true,
      composed: true,
      ...init,
    })
  );
}

function key(target: EventTarget, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent("keydown", {
    key: k,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(e);
  return e;
}

async function pressLockButton(lock: any, ...rows: any[]): Promise<void> {
  button(lock).click();
  await settle(lock, ...rows);
}

beforeEach(() => {
  createRowElement = vi.fn((config: Record<string, unknown>) => fakeRow(config));
  (window as any).loadCardHelpers = async () => ({ createRowElement });
});

afterEach(() => {
  document.body.replaceChildren();
  while (cleanups.length) cleanups.pop()!();
  vi.useRealTimers();
});

describe("slider row and Home Assistant's row", () => {
  it("is the bundle's element", () => {
    expect(customElements.get(SLIDER_ROW_TAG)).toBe(ApolloRadarSliderRow);
    expect(customElements.get(SLIDER_LOCK_ROW_TAG)).toBe(ApolloRadarSliderLockRow);
  });

  it("hands HA's row its own config, less type and device_id, and every hass", async () => {
    const hass = hassWith();
    const el = await mountRow(freshId(), hass);
    expect(createRowElement).toHaveBeenCalledTimes(1);
    expect(createRowElement.mock.calls[0][0]).toEqual({ color: "state", entity: ENTITY, name: NAME });
    expect(inner(el).hass).toBe(hass);

    const next = hassWith(SLIDER_ATTRS, "30");
    el.hass = next;
    await settle(el);
    expect(inner(el).hass).toBe(next);
    // A hass that changes nothing of this row's still reaches HA's row.
    const other = { ...next, states: { ...next.states } };
    el.hass = other;
    await settle(el);
    expect(inner(el).hass).toBe(other);
  });

  it("keeps HA's row when nothing can be locked: a box or a missing entity", async () => {
    const box = await mountRow(freshId(), hassWith({ ...SLIDER_ATTRS, mode: "box" }));
    expect(shield(box)).toBeNull();
    expect(inner(box).config).toMatchObject({ entity: ENTITY });
    const missing = await mountRow(freshId(), hassWith(SLIDER_ATTRS, "20", "number.other"));
    expect(shield(missing)).toBeNull();
  });

  it("shows the name and value with no shield outside Home Assistant", async () => {
    delete (window as any).loadCardHelpers;
    const el = await mountRow(freshId());
    expect(shield(el)).toBeNull();
    const spans = [...el.shadowRoot.querySelectorAll(".fallback span")].map(
      (span: Element) => span.textContent
    );
    expect(spans).toEqual([NAME, "20 %"]);
  });

  it("throws without entity or device_id", () => {
    const el: any = document.createElement(SLIDER_ROW_TAG);
    const type = `custom:${SLIDER_ROW_TAG}`;
    expect(() => el.setConfig({ type, device_id: "x" })).toThrow(
      "Apollo mmWave: a slider row needs entity and device_id."
    );
    expect(() => el.setConfig({ type, entity: ENTITY })).toThrow(
      "Apollo mmWave: a slider row needs entity and device_id."
    );
    const lock: any = document.createElement(SLIDER_LOCK_ROW_TAG);
    expect(() => lock.setConfig({ type: `custom:${SLIDER_LOCK_ROW_TAG}` })).toThrow(
      "Apollo mmWave: the slider lock row needs device_id."
    );
  });

  it("is in no card picker", () => {
    const types = ((window as any).customCards ?? []).map((c: { type: string }) => c.type);
    expect(types).not.toContain(SLIDER_ROW_TAG);
    expect(types).not.toContain(SLIDER_LOCK_ROW_TAG);
  });

  it("lets a vertical swipe scroll the page and keeps the flash still with reduced motion", () => {
    const row = String((ApolloRadarSliderRow as any).styles.cssText);
    expect(row).toContain("touch-action: pan-y");
    const lock = String((ApolloRadarSliderLockRow as any).styles.cssText);
    expect(lock).toContain("prefers-reduced-motion");
  });
});

describe("locking and unlocking", () => {
  it("starts locked and unlocks every row of that radar from its lock row", async () => {
    const id = freshId();
    const a = await mountRow(id);
    const b = await mountRow(id);
    const other = await mountRow(freshId());
    for (const el of [a, b, other]) {
      expect(shield(el)).not.toBeNull();
      expect(rowClasses(el).contains("locked")).toBe(true);
    }
    const lock = await mountLock(id);
    await pressLockButton(lock, a, b, other);
    expect(shield(a)).toBeNull();
    expect(shield(b)).toBeNull();
    expect(rowClasses(a).contains("locked")).toBe(false);
    expect(shield(other)).not.toBeNull();

    await pressLockButton(lock, a, b);
    expect(shield(a)).not.toBeNull();
    expect(shield(b)).not.toBeNull();
  });

  it("names the state and the action on the lock row, and toasts each change", async () => {
    const id = freshId();
    const toasts = record("hass-notification");
    const lock = await mountLock(id);
    expect(text(lock)).toBe(`${LOCKED_TITLE} ${LOCKED_HINT} ${UNLOCK_LABEL}`);
    expect(button(lock).getAttribute("aria-describedby")).toBe("state");
    expect(lock.shadowRoot.getElementById("state")).not.toBeNull();
    expect(button(lock).hasAttribute("aria-pressed")).toBe(false);

    await pressLockButton(lock);
    expect(text(lock)).toBe(`${UNLOCKED_TITLE} ${UNLOCKED_HINT} ${LOCK_LABEL}`);
    expect(toasts).toEqual([{ id: `apollo-mmwave-sliders-${id}`, message: UNLOCKED_TOAST }]);

    await pressLockButton(lock);
    expect(text(lock)).toBe(`${LOCKED_TITLE} ${LOCKED_HINT} ${UNLOCK_LABEL}`);
    expect(toasts[1]).toEqual({ id: `apollo-mmwave-sliders-${id}`, message: LOCKED_TOAST });
  });

  it("locks again 2 seconds after the radar's rows leave the page", async () => {
    vi.useFakeTimers();
    const id = freshId();
    const row = await mountRow(id);
    const lock = await mountLock(id);
    await pressLockButton(lock, row);
    expect(shield(row)).toBeNull();

    row.remove();
    lock.remove();
    vi.advanceTimersByTime(LEAVE_GRACE_MS);
    // Home Assistant puts the same rows back when the user returns to the tab.
    document.body.append(row, lock);
    await settle(row, lock);
    expect(shield(row)).not.toBeNull();
    expect(text(lock)).toContain(LOCKED_TITLE);
  });

  it("stays unlocked when the rows come back within 2 seconds", async () => {
    vi.useFakeTimers();
    const id = freshId();
    const row = await mountRow(id);
    const lock = await mountLock(id);
    await pressLockButton(lock, row);
    row.remove();
    lock.remove();
    vi.advanceTimersByTime(LEAVE_GRACE_MS - 500);
    document.body.append(row, lock);
    await settle(row, lock);
    vi.advanceTimersByTime(LEAVE_GRACE_MS);
    await settle(row, lock);
    expect(shield(row)).toBeNull();
  });
});

describe("tries on a locked slider", () => {
  it("nudges on the first tap and reminds on the second, with an Unlock that works", async () => {
    vi.useFakeTimers();
    const id = freshId();
    const toasts = record("hass-notification");
    const haptics = record("haptic");
    const el = await mountRow(id);

    click(el, SLIDER_X);
    await settle(el);
    expect(rowClasses(el).contains("nudge")).toBe(true);
    expect(haptics).toEqual(["light"]);
    expect(toasts).toEqual([]);
    vi.advanceTimersByTime(NUDGE_MS);
    await settle(el);
    expect(rowClasses(el).contains("nudge")).toBe(false);

    vi.advanceTimersByTime(3000);
    click(el, SLIDER_X);
    await settle(el);
    expect(haptics).toEqual(["light", "warning"]);
    expect(toasts).toHaveLength(1);
    const [toast] = toasts;
    expect(toast).toMatchObject({
      id: `apollo-mmwave-sliders-${id}`,
      message: REMINDER_TOAST,
      duration: 6000,
      action: { text: UNLOCK_LABEL },
    });
    // The value did not change.
    expect(inner(el).writes).toBe(0);

    toast.action.action();
    await settle(el);
    expect(shield(el)).toBeNull();
  });

  it("opens more-info from a tap on the name and counts no try", async () => {
    const haptics = record("haptic");
    const moreInfo = record("hass-more-info");
    const el = await mountRow(freshId());
    click(el, NAME_X);
    expect(moreInfo).toEqual([{ entityId: ENTITY }]);
    expect(haptics).toEqual([]);
    // A tap that starts with a pointerdown on the name too.
    pointer(shield(el)!, "pointerdown", { clientX: NAME_X });
    click(el, NAME_X);
    expect(moreInfo).toHaveLength(2);
    expect(haptics).toEqual([]);
  });

  it("counts every tap as a try when it cannot find the slider", async () => {
    createRowElement.mockImplementation((config: Record<string, unknown>) => fakeRow(config, false));
    const haptics = record("haptic");
    const moreInfo = record("hass-more-info");
    const el = await mountRow(freshId());
    click(el, NAME_X);
    expect(haptics).toEqual(["light"]);
    expect(moreInfo).toEqual([]);
  });

  it("counts a sideways drag once and not its click", async () => {
    const haptics = record("haptic");
    const el = await mountRow(freshId());
    const s = shield(el)!;
    pointer(s, "pointerdown");
    pointer(s, "pointermove", { clientX: SLIDER_X + 20, clientY: 22 });
    pointer(s, "pointermove", { clientX: SLIDER_X + 40, clientY: 22 });
    click(el, SLIDER_X + 40);
    expect(haptics).toEqual(["light"]);
  });

  it("never counts a vertical move, a cancelled touch, a second finger or a right click", async () => {
    const haptics = record("haptic");
    const moreInfo = record("hass-more-info");
    const el = await mountRow(freshId());
    const s = shield(el)!;

    // A mouse that moved down 20 px, then let go on the row.
    pointer(s, "pointerdown", { pointerType: "mouse", buttons: 1 });
    pointer(s, "pointermove", { pointerType: "mouse", buttons: 1, clientX: SLIDER_X + 2, clientY: 40 });
    click(el, SLIDER_X + 2);

    // The browser took the touch for a scroll.
    pointer(s, "pointerdown");
    pointer(s, "pointercancel");

    // A second finger.
    pointer(s, "pointerdown", { pointerId: 2, isPrimary: false });
    pointer(s, "pointermove", { pointerId: 2, isPrimary: false, clientX: SLIDER_X + 30 });

    // A right click.
    pointer(s, "pointerdown", { pointerId: 3, pointerType: "mouse", button: 2, buttons: 2 });
    pointer(s, "pointermove", { pointerId: 3, pointerType: "mouse", buttons: 2, clientX: SLIDER_X + 30 });
    click(el, SLIDER_X + 30, { button: 2 });

    expect(haptics).toEqual([]);
    expect(moreInfo).toEqual([]);
  });

  it("ignores a tap that stops a scroll", async () => {
    vi.useFakeTimers();
    // A clock far from the real one, so this scroll cannot reach other tests.
    vi.setSystemTime(new Date(2000, 0, 1));
    const haptics = record("haptic");
    const el = await mountRow(freshId());
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(200);
    click(el, SLIDER_X);
    expect(haptics).toEqual([]);
    vi.advanceTimersByTime(200);
    click(el, SLIDER_X);
    expect(haptics).toEqual(["light"]);
  });

  it("does nothing on an unavailable slider but still opens its details", async () => {
    const haptics = record("haptic");
    const moreInfo = record("hass-more-info");
    const el = await mountRow(freshId(), hassWith(SLIDER_ATTRS, "unavailable"));
    expect(shield(el)).not.toBeNull();
    click(el, SLIDER_X);
    click(el, SLIDER_X);
    expect(haptics).toEqual([]);
    click(el, NAME_X);
    expect(moreInfo).toEqual([{ entityId: ENTITY }]);
  });

  it("flashes the radar's lock rows on each try", async () => {
    vi.useFakeTimers();
    const id = freshId();
    const el = await mountRow(id);
    const lock = await mountLock(id);
    click(el, SLIDER_X);
    await settle(lock);
    expect(button(lock).className).toBe("flash-a");
    click(el, SLIDER_X);
    await settle(lock);
    expect(button(lock).className).toBe("flash-b");
    vi.advanceTimersByTime(NUDGE_MS);
    await settle(lock);
    expect(button(lock).className).toBe("");
  });
});

describe("keys and changes on a locked slider", () => {
  it("stops a value key before the slider and reminds at once", async () => {
    const id = freshId();
    const toasts = record("hass-notification");
    const haptics = record("haptic");
    const el = await mountRow(id);
    const fake = inner(el);

    const e = key(fake.thumb!, "ArrowRight");
    expect(e.defaultPrevented).toBe(true);
    expect(fake.keys).toEqual([]);
    expect(toasts.map((t) => t.message)).toEqual([REMINDER_TOAST]);
    expect(haptics).toEqual(["warning"]);

    // A held key repeats: one try only.
    key(fake.thumb!, "ArrowRight", { repeat: true });
    expect(haptics).toHaveLength(1);
    expect(fake.keys).toEqual([]);

    // Tab moves on.
    const tab = key(fake.thumb!, "Tab");
    expect(tab.defaultPrevented).toBe(false);
    expect(fake.keys).toEqual(["Tab"]);

    const lock = await mountLock(id);
    await pressLockButton(lock, el);
    key(fake.thumb!, "ArrowRight");
    expect(fake.keys).toEqual(["Tab", "ArrowRight"]);
  });

  it("stops a change before HA's row writes it and builds the row again", async () => {
    const el = await mountRow(freshId());
    const first = inner(el);
    first.slider!.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    expect(first.writes).toBe(0);
    await settle(el);
    expect(createRowElement).toHaveBeenCalledTimes(2);
    const second = inner(el);
    expect(second).not.toBe(first);
    expect(second.hass).toBe(el.hass);
    expect(shield(el)).not.toBeNull();
  });

  it("lets a change through while unlocked and counts the 5 minutes from it", async () => {
    vi.useFakeTimers();
    const id = freshId();
    const el = await mountRow(id);
    const lock = await mountLock(id);
    await pressLockButton(lock, el);
    const fake = inner(el);

    vi.advanceTimersByTime(4 * 60 * 1000);
    fake.slider!.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    expect(fake.writes).toBe(1);
    vi.advanceTimersByTime(RELOCK_AFTER_MS - 1);
    await settle(el);
    expect(shield(el)).toBeNull();
    vi.advanceTimersByTime(1);
    await settle(el);
    expect(shield(el)).not.toBeNull();
  });

  it("never locks under a finger: it waits for the pointerup, then one tick", async () => {
    vi.useFakeTimers();
    const id = freshId();
    const el = await mountRow(id);
    const lock = await mountLock(id);
    await pressLockButton(lock, el);

    pointer(inner(el).thumb!, "pointerdown", { pointerId: 9 });
    vi.advanceTimersByTime(RELOCK_AFTER_MS + 60 * 1000);
    await settle(el);
    expect(shield(el)).toBeNull();

    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 9, isPrimary: true }));
    await settle(el);
    expect(shield(el)).toBeNull();
    vi.advanceTimersByTime(0);
    await settle(el);
    expect(shield(el)).not.toBeNull();
  });
});
