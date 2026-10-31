/**
 * The slider lock's two entities card rows. The lock state and the copy are
 * in `slider-lock.ts`.
 *
 * `apollo-radar-slider-row` holds Home Assistant's own number row, made with
 * `loadCardHelpers().createRowElement`, so the name, icon, unit, slider and
 * unavailable look stay HA's. While its radar is locked a clear shield lies
 * over the row. HA's slider takes every touch that lands on it (its track is
 * `touch-action: none` and sets the value on touch down), so a scroll that
 * starts there moves it. The shield is `touch-action: pan-y` instead: a
 * vertical swipe scrolls the page and nothing reaches the slider. A tap on
 * the slider half or a sideways drag is a try, which nudges and then
 * reminds; a tap on the name opens more-info, as HA's row would.
 * Capture-phase checks on the row stop the value keys and any `change` the
 * slider still sends, so nothing is written while locked, whatever moved it.
 *
 * `apollo-radar-slider-lock-row` is the Unlock / Lock button above the
 * sliders. Both rows name their radar with `device_id`, and neither is in
 * the card picker: the strategy writes them into its entities cards.
 */

import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, SliderLockRowConfig, SliderRowConfig } from "../types";
import { registerElement } from "../register";
import {
  DRAG_PX,
  LOCKED_HINT,
  LOCKED_TITLE,
  LOCKED_TOAST,
  LOCK_LABEL,
  NUDGE_MS,
  REMINDER_TOAST,
  SLIDER_LOCK_ROW_TAG,
  SLIDER_ROW_TAG,
  UNLOCKED_HINT,
  UNLOCKED_TITLE,
  UNLOCKED_TOAST,
  UNLOCK_LABEL,
  dragStarted,
  isUnlocked,
  noteSliderChange,
  noteTry,
  recentScroll,
  setUnlocked,
  showsSlider,
  watchSliderLock,
} from "./slider-lock";

type RowElement = HTMLElement & { hass?: HomeAssistant };

/** The part of HA's `custom-card-helpers` module the slider row uses. */
interface CardHelpers {
  createRowElement(config: Record<string, unknown>): RowElement;
}

/** HA's toast parameters (`ShowToastParams`). A toast with an `id` replaces
 *  the one already showing with that id. */
interface Toast {
  id: string;
  message: string;
  duration?: number;
  action?: { text: string; action: () => void };
}

/** A pointer that went down on a locked row's shield. */
interface Gesture {
  id: number;
  x: number;
  y: number;
  /** Down on the slider half of the row rather than the name. */
  slider: boolean;
  /** Moved DRAG_PX or more: a scroll or a drag, never a tap. */
  moved: boolean;
}

let helpersFn: unknown;
let helpers: Promise<CardHelpers | undefined> | undefined;

/** HA's card helpers, or undefined outside HA. Cached per loader, so a test
 *  can swap the loader. */
function cardHelpers(): Promise<CardHelpers | undefined> {
  const fn = (window as any).loadCardHelpers;
  if (typeof fn !== "function") return Promise.resolve(undefined);
  if (fn !== helpersFn) {
    helpersFn = fn;
    helpers = Promise.resolve()
      .then(() => fn())
      .catch(() => undefined);
  }
  return helpers!;
}

/** The keys that change a slider's value. */
const VALUE_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

/** Whether an event came from a slider inside the row. */
function fromSlider(e: Event): boolean {
  return e
    .composedPath()
    .some(
      (n) =>
        n instanceof Element &&
        (n.localName === "ha-slider" ||
          n.getAttribute("role") === "slider" ||
          (n.localName === "input" && (n as HTMLInputElement).type === "range"))
    );
}

/** One toast per radar: an unlock, a lock and a reminder replace each other. */
function toastId(deviceId: string): string {
  return `apollo-mmwave-sliders-${deviceId}`;
}

function fire(el: HTMLElement, type: string, detail: unknown): void {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

export class ApolloRadarSliderRow extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: SliderRowConfig;
  /** HA's own row. Undefined until it is built; null when HA's helpers are
   *  missing or could not build it, and the read-only fallback shows. */
  @state() private _row?: RowElement | null;
  /** A try colors the slider for NUDGE_MS. */
  @state() private _nudge = false;

  /** Bumped on every build, so a build that was overtaken is dropped. */
  private _serial = 0;
  private _gesture?: Gesture;
  private _unwatch?: () => void;
  private _nudgeTimer?: ReturnType<typeof setTimeout>;

  // Capture phase on the row: these run before anything inside HA's row.
  private readonly _keyCapture = {
    handleEvent: (e: KeyboardEvent) => this._onKey(e),
    capture: true,
  };
  private readonly _changeCapture = {
    handleEvent: (e: Event) => this._onChange(e),
    capture: true,
  };
  private readonly _downCapture = {
    handleEvent: (e: PointerEvent) => this._onSliderDown(e),
    capture: true,
  };

  public setConfig(config: SliderRowConfig): void {
    if (!config?.entity || !config.device_id) {
      throw new Error("Apollo mmWave: a slider row needs entity and device_id.");
    }
    const moved = config.device_id !== this._config?.device_id;
    this._config = config;
    if (moved && this.isConnected) this._watch();
    void this._buildRow();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._watch();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unwatch?.();
    this._unwatch = undefined;
    clearTimeout(this._nudgeTimer);
    this._nudge = false;
    this._gesture = undefined;
  }

  /** Listen to the radar's lock. Also re-render: Home Assistant keeps a
   *  tab's cards and puts these same rows back when the user returns, and
   *  the radar may have locked while they were away. */
  private _watch(): void {
    this._unwatch?.();
    this._unwatch = this._config
      ? watchSliderLock(this._config.device_id, (change) => {
          if (change === "lock") this.requestUpdate();
        })
      : undefined;
    this.requestUpdate();
  }

  /** Build HA's number row from this row's config, less `type` and
   *  `device_id`. `color: "state"` is what the entities card adds to a plain
   *  row (it leaves custom rows alone), so an unavailable icon is grayed. */
  private async _buildRow(): Promise<void> {
    const serial = ++this._serial;
    const h = await cardHelpers();
    const config = this._config;
    if (serial !== this._serial || !config) return;
    const rest: Record<string, unknown> = { ...config };
    delete rest.type;
    delete rest.device_id;
    let row: RowElement | null = null;
    try {
      row = h?.createRowElement({ color: "state", ...rest }) ?? null;
    } catch {
      row = null;
    }
    if (row) row.hass = this.hass;
    this._row = row;
  }

  /** Hand every hass to HA's row; re-render only for this row's entity. */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has("hass") && this._row) this._row.hass = this.hass;
    if (changed.size !== 1 || !changed.has("hass")) return true;
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (!oldHass || !this.hass || !this._config) return true;
    const id = this._config.entity;
    return oldHass.states[id] !== this.hass.states[id] || oldHass.localize !== this.hass.localize;
  }

  /** Locked: the radar is locked and HA draws this number as a slider. A box
   *  or a missing entity never is: a scroll cannot change a box, and HA shows
   *  its own warning for a missing entity. An unavailable number keeps its
   *  range and mode, so it stays locked. */
  private _locked(): boolean {
    const c = this._config;
    return (
      !!c && !!this._row && !isUnlocked(c.device_id) && showsSlider(this.hass?.states[c.entity])
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  //
  // Bindings sit inside elements, never at the template root: happy-dom (the
  // test DOM) mis-clones root-level child-part markers.
  // ---------------------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    const locked = this._locked();
    const inner = this._row ? this._row : this._row === null ? this._renderFallback() : nothing;
    return html`
      <div
        class="row ${locked ? "locked" : ""} ${locked && this._nudge ? "nudge" : ""}"
        @keydown=${this._keyCapture}
        @change=${this._changeCapture}
        @pointerdown=${this._downCapture}
      >
        <div class="native">${inner}</div>
        ${locked
          ? html`<div
              class="shield"
              aria-hidden="true"
              @pointerdown=${this._onDown}
              @pointermove=${this._onMove}
              @pointercancel=${this._onCancel}
              @click=${this._onClick}
            ></div>`
          : nothing}
      </div>
    `;
  }

  /** Name and value only, when HA's row could not be made. Nothing in it
   *  can change a value. */
  private _renderFallback(): TemplateResult {
    const c = this._config!;
    const s = this.hass?.states[c.entity];
    const name = c.name ?? s?.attributes.friendly_name ?? c.entity;
    const value = s ? (this.hass!.formatEntityState?.(s) ?? s.state) : "";
    return html`<div class="fallback"><span>${name}</span><span>${value}</span></div>`;
  }

  // ---------------------------------------------------------------------------
  // The shield (locked only)
  // ---------------------------------------------------------------------------

  /** Whether `x` is on the slider half of the row (the end half in a
   *  right-to-left language). Without a slider to measure, the whole row is,
   *  so it stays locked and only the name tap is lost. */
  private _inSliderZone(x: number): boolean {
    const slider = this._row?.shadowRoot?.querySelector("ha-slider");
    if (!slider) return true;
    const r = slider.getBoundingClientRect();
    if (!r.width) return true;
    return getComputedStyle(this).direction === "rtl" ? x <= r.right + 8 : x >= r.left - 8;
  }

  private _onDown(e: PointerEvent): void {
    if (!e.isPrimary || e.button > 0) return;
    this._gesture = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      slider: this._inSliderZone(e.clientX),
      moved: false,
    };
  }

  private _onMove(e: PointerEvent): void {
    const g = this._gesture;
    if (!g || g.id !== e.pointerId || g.moved) return;
    // A mouse or pen let go somewhere else: that gesture is over.
    if (e.pointerType !== "touch" && e.buttons === 0) {
      this._gesture = undefined;
      return;
    }
    const dx = Math.abs(e.clientX - g.x);
    const dy = Math.abs(e.clientY - g.y);
    if (Math.max(dx, dy) < DRAG_PX) return;
    g.moved = true;
    // A sideways drag on the slider is a try. A vertical one is a scroll the
    // browser did not take (a mouse), never a try.
    if (g.slider && dx > dy) this._try(false);
  }

  /** The browser took the touch for a scroll, a zoom or itself. */
  private _onCancel(): void {
    this._gesture = undefined;
  }

  private _onClick(e: MouseEvent): void {
    const g = this._gesture;
    this._gesture = undefined;
    if (g?.moved || e.button > 0) return;
    const c = this._config!;
    const slider = g ? g.slider : this._inSliderZone(e.clientX);
    if (!slider) {
      // The same event HA's row fires on a tap.
      if (this.hass?.states[c.entity]) fire(this, "hass-more-info", { entityId: c.entity });
      return;
    }
    // A tap that stops a scroll is not a try.
    if (!recentScroll()) this._try(false);
  }

  // ---------------------------------------------------------------------------
  // Capture-phase checks on the row
  // ---------------------------------------------------------------------------

  /** A value key on a locked slider never reaches it. Tab, Enter and Space
   *  pass, so focus moves and Enter on the name still opens more-info. */
  private _onKey(e: KeyboardEvent): void {
    if (!VALUE_KEYS.has(e.key) || !this._locked() || !fromSlider(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) this._try(true);
  }

  /** HA's row writes on the slider's `change`. Locked, that change stops
   *  here and the row is built again so it shows the real value. Unlocked,
   *  a change restarts the relock countdown. */
  private _onChange(e: Event): void {
    const c = this._config;
    if (!c || !fromSlider(e)) return;
    if (this._locked()) {
      e.stopPropagation();
      void this._buildRow();
      return;
    }
    noteSliderChange(c.device_id);
  }

  /** A pointer down on an unlocked slider holds off the relock until it is
   *  up again. Only the main button drags, as on the shield and in HA's
   *  slider: a right click opens a menu that can take its pointerup. */
  private _onSliderDown(e: PointerEvent): void {
    const c = this._config;
    if (!c || !e.isPrimary || e.button > 0 || this._locked() || !fromSlider(e)) return;
    dragStarted(c.device_id, e.pointerId, e.pointerType);
  }

  /** Someone tried to move this locked slider: color it, buzz and, on a
   *  repeat, show the reminder with its own Unlock. */
  private _try(keyboard: boolean): void {
    const c = this._config!;
    const s = this.hass?.states[c.entity];
    // Unlocking would not help: HA's slider is off while unavailable.
    if (!s || s.state === "unavailable") return;
    const id = c.device_id;
    const outcome = noteTry(id, keyboard);
    this._nudge = true;
    clearTimeout(this._nudgeTimer);
    this._nudgeTimer = setTimeout(() => (this._nudge = false), NUDGE_MS);
    fire(this, "haptic", outcome === "remind" ? "warning" : "light");
    if (outcome === "remind") {
      const toast: Toast = {
        id: toastId(id),
        message: REMINDER_TOAST,
        duration: 6000,
        action: { text: UNLOCK_LABEL, action: () => setUnlocked(id, true) },
      };
      fire(this, "hass-notification", toast);
    }
  }

  static styles = css`
    :host {
      display: block;
    }
    .row {
      position: relative;
      min-height: 40px;
    }
    .native {
      display: block;
    }
    .locked .native {
      pointer-events: none;
    }
    /* HA's slider reads these: gray while locked, so it looks off and still
       shows where it is. The track keeps its own color. */
    .locked {
      --ha-slider-thumb-color: var(--secondary-text-color);
      --ha-slider-indicator-color: var(--secondary-text-color);
    }
    .locked.nudge {
      --ha-slider-thumb-color: var(--warning-color, #ffa600);
      --ha-slider-indicator-color: var(--warning-color, #ffa600);
    }
    /* Explicit sides rather than inset, for iOS 14 wall tablets. The second
       touch-action wins where pinch-zoom is known; pan-y stays where not. */
    .shield {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 1;
      cursor: pointer;
      touch-action: pan-y;
      touch-action: pan-y pinch-zoom;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
    }
    .fallback {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 40px;
    }
  `;
}

export class ApolloRadarSliderLockRow extends LitElement {
  /** Set by the entities card; the row reads nothing from it. */
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: SliderLockRowConfig;
  /** "flash-a" or "flash-b" while a try flashes the button. The class flips
   *  on every try, so the animation starts again. */
  @state() private _flash = "";

  private _flashTimer?: ReturnType<typeof setTimeout>;
  private _unwatch?: () => void;

  public setConfig(config: SliderLockRowConfig): void {
    if (!config?.device_id) {
      throw new Error("Apollo mmWave: the slider lock row needs device_id.");
    }
    const moved = config.device_id !== this._config?.device_id;
    this._config = config;
    if (moved && this.isConnected) this._watch();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._watch();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unwatch?.();
    this._unwatch = undefined;
    clearTimeout(this._flashTimer);
    this._flash = "";
  }

  /** Listen to the radar's lock, and re-render for the same reason as the
   *  slider row. */
  private _watch(): void {
    this._unwatch?.();
    this._unwatch = this._config
      ? watchSliderLock(this._config.device_id, (change) => {
          if (change === "lock") this.requestUpdate();
          else this._flashButton();
        })
      : undefined;
    this.requestUpdate();
  }

  private _flashButton(): void {
    this._flash = this._flash === "flash-a" ? "flash-b" : "flash-a";
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => (this._flash = ""), NUDGE_MS);
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    return changed.size !== 1 || !changed.has("hass");
  }

  private _toggle(): void {
    const id = this._config!.device_id;
    const unlock = !isUnlocked(id);
    setUnlocked(id, unlock);
    const toast: Toast = { id: toastId(id), message: unlock ? UNLOCKED_TOAST : LOCKED_TOAST };
    fire(this, "hass-notification", toast);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    const unlocked = isUnlocked(this._config.device_id);
    return html`
      <div class="lock ${unlocked ? "unlocked" : ""}">
        <div class="icon" aria-hidden="true">
          <ha-icon .icon=${unlocked ? "mdi:lock-open-variant" : "mdi:lock"}></ha-icon>
        </div>
        <div class="info" id="state">
          <div>${unlocked ? UNLOCKED_TITLE : LOCKED_TITLE}</div>
          <div class="secondary">${unlocked ? UNLOCKED_HINT : LOCKED_HINT}</div>
        </div>
        <button type="button" class=${this._flash} aria-describedby="state" @click=${this._toggle}>
          ${unlocked ? LOCK_LABEL : UNLOCK_LABEL}
        </button>
      </div>
    `;
  }

  // Laid out like an HA row: a 40 px icon column, the text, then the button.
  static styles = css`
    :host {
      display: block;
    }
    .lock {
      display: flex;
      align-items: center;
      min-height: 40px;
    }
    .icon {
      flex: 0 0 40px;
      display: flex;
      justify-content: center;
      color: var(--state-icon-color);
    }
    .unlocked .icon {
      color: var(--primary-color);
    }
    .info {
      flex: 1 1 auto;
      min-width: 0;
      padding-inline: 16px 8px;
    }
    .secondary {
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
    button {
      flex: none;
      font: inherit;
      font-weight: 500;
      cursor: pointer;
      border-radius: 4px;
      padding: 6px 16px;
      min-height: 36px;
      border: 1px solid var(--primary-color);
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    button.flash-a {
      animation: apollo-lock-flash-a 0.6s ease-in-out 2;
    }
    button.flash-b {
      animation: apollo-lock-flash-b 0.6s ease-in-out 2;
    }
    @keyframes apollo-lock-flash-a {
      50% {
        box-shadow: 0 0 0 4px var(--warning-color, #ffa600);
      }
    }
    @keyframes apollo-lock-flash-b {
      50% {
        box-shadow: 0 0 0 4px var(--warning-color, #ffa600);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      button.flash-a,
      button.flash-b {
        animation: none;
        box-shadow: 0 0 0 3px var(--warning-color, #ffa600);
      }
    }
  `;
}

registerElement(SLIDER_ROW_TAG, ApolloRadarSliderRow);
registerElement(SLIDER_LOCK_ROW_TAG, ApolloRadarSliderLockRow);
