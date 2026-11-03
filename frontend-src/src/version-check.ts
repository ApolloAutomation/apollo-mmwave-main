/**
 * Whether this page runs the cards of the Apollo mmWave that Home Assistant
 * runs, and the notice to show when it does not.
 *
 * After an update the two drift apart in two ways. Home Assistant restarted
 * into the new version, but an open tab or a Home Assistant app still runs
 * the old bundles until a reload (or, in the apps, until the app is closed
 * fully: its service worker can serve the old page once more). Or the new
 * files are on disk and a browser fetched them, but Home Assistant has not
 * restarted, so it still runs the old integration.
 *
 * Home Assistant's own `manifest/get` command answers with the running
 * integration's manifest: `async_get_integration` caches it at startup, so
 * it keeps the old version until a restart. It is not admin-only. The page
 * asks once when a card first hands in a connection, and again every time
 * that connection reconnects (`ready`), which is when a restart shows. The
 * `ready` listener stays only while a card watches: once the last one has
 * left the page, the next card to arrive asks again, since a reconnect may
 * have gone by unheard. Each bundle carries its own copy of this module, so
 * each asks for itself and compares its own CARD_VERSION.
 *
 * Nothing here throws into a card: a missing `callWS`, a rejected call or an
 * answer without a version reads as unreadable, which shows nothing.
 */

import { CARD_VERSION } from "./version";

export const MANIFEST_GET = "manifest/get";
const DOMAIN = "apollo_mmwave";

export const VERSION_RELOAD_LABEL = "Reload";
/** Under the Reload line: the Home Assistant apps can serve the old page
 *  again on a reload, which closing the app fully gets past. */
export const VERSION_APP_LINE =
  "In the Home Assistant app, if Reload does not help, close the app fully and open it again.";

export function versionReloadLine(running: string, page: string): string {
  return `Apollo mmWave was updated to ${running}, but this page still runs ${page}.`;
}

export function versionRestartLine(running: string, page: string): string {
  return (
    `Apollo mmWave ${page} is installed, but Home Assistant still runs ${running}.` +
    " Restart Home Assistant to finish updating."
  );
}

export interface VersionNotice {
  /** "reload": this page is out of date, and a Reload button fixes it.
   *  "restart": Home Assistant is, and only a restart fixes it. */
  kind: "reload" | "restart";
  /** The sentences, in order. A reload notice's Reload button goes after the
   *  first, the app line after the button. */
  lines: string[];
}

/** A version as [major, minor, patch, pre-release rank, pre-release number]:
 *  the PEP 440 forms the manifest uses ("2.4.0", "2.4.0b2", "2.5.0rc1"). A
 *  release ranks above its pre-releases. */
type Parsed = [number, number, number, number, number];
const PRE_RANK: Record<string, number> = { a: 0, b: 1, rc: 2 };
const RELEASE_RANK = 3;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:(a|b|rc)(\d+))?$/;

function parseVersion(text: unknown): Parsed | undefined {
  if (typeof text !== "string") return undefined;
  const m = VERSION_RE.exec(text.trim());
  if (!m) return undefined;
  const pre = m[4] === undefined ? RELEASE_RANK : PRE_RANK[m[4]];
  return [Number(m[1]), Number(m[2]), Number(m[3]), pre, Number(m[5] ?? 0)];
}

/** Negative when `a` is older than `b`, 0 when equal, positive when newer. */
export function compareVersions(a: string, b: string): number | undefined {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return undefined;
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * The notice for a page running `page` while Home Assistant runs `running`,
 * or undefined when they match or either cannot be read.
 *
 * Which side is out of date: an older page needs a reload, a newer one a
 * restart. `before` is what Home Assistant ran at this page's first answer:
 * when it has changed since, Home Assistant restarted into another version
 * while the page stayed open, so the page needs a reload even when it is the
 * newer one (a downgrade). The bundle does not read its own `?v=` for this:
 * that takes `import.meta`, which the bundles keep out of their code (the
 * "imports nothing" checks in test/bundle-tuning.test.ts and
 * test/bundle-zone-map.test.ts).
 */
export function versionNotice(
  running: unknown,
  page: string,
  before?: string
): VersionNotice | undefined {
  if (typeof running !== "string") return undefined;
  const order = compareVersions(page, running);
  if (order === undefined || order === 0) return undefined;
  const restarted = before !== undefined && (compareVersions(before, running) ?? 0) !== 0;
  return order > 0 && !restarted
    ? { kind: "restart", lines: [versionRestartLine(running, page)] }
    : { kind: "reload", lines: [versionReloadLine(running, page), VERSION_APP_LINE] };
}

/** The slice of Home Assistant's connection the check uses. */
interface VersionConnection {
  addEventListener?(event: string, callback: () => void): void;
  removeEventListener?(event: string, callback: () => void): void;
}

/** What the check needs from Home Assistant's `hass`. */
export interface VersionHass {
  callWS?<T>(msg: Record<string, any>): Promise<T>;
  connection?: VersionConnection;
}

// ---------------------------------------------------------------------------
// The page's check (this bundle's copy)
// ---------------------------------------------------------------------------

let pageNotice: VersionNotice | undefined;
/** The version Home Assistant ran at this page's first readable answer. */
let firstRunning: string | undefined;
/** The newest hass any card handed in, for the check after a reconnect. */
let latestHass: VersionHass | undefined;
/** Bumped per check, so an answer that a newer check overtook is dropped. */
let serial = 0;
/** This bundle's cards watching now, and the `ready` listener while any do. */
let watching = 0;
let attached: { connection: VersionConnection; listener: () => void } | undefined;
let checkedWithoutConnection = false;

async function check(): Promise<void> {
  const hass = latestHass;
  const id = ++serial;
  let running: unknown;
  try {
    if (typeof hass?.callWS === "function") {
      const manifest = await hass.callWS<{ version?: unknown } | null>({
        type: MANIFEST_GET,
        integration: DOMAIN,
      });
      running = manifest?.version;
    }
  } catch {
    running = undefined;
  }
  if (id !== serial) return;
  const next = versionNotice(running, CARD_VERSION, firstRunning);
  if (firstRunning === undefined && typeof running === "string" && parseVersion(running)) {
    firstRunning = running;
  }
  if (JSON.stringify(next) === JSON.stringify(pageNotice)) return;
  pageNotice = next;
  notifyAll();
}

/** Check on the first hass with a connection not listened to yet, and
 *  again each time that connection comes back. */
function track(hass: VersionHass | undefined): void {
  if (!hass) return;
  latestHass = hass;
  const connection = hass.connection;
  if (connection && typeof connection === "object") {
    if (attached?.connection === connection) return;
    detach();
    const listener = () => void check();
    attached = { connection, listener };
    try {
      connection.addEventListener?.("ready", listener);
    } catch {
      // A connection that takes no listener still gets the first check.
    }
    void check();
  } else if (!attached && !checkedWithoutConnection) {
    checkedWithoutConnection = true;
    void check();
  }
}

function detach(): void {
  const was = attached;
  attached = undefined;
  try {
    was?.connection.removeEventListener?.("ready", was.listener);
  } catch {
    // Nothing to undo on a connection that took no listener.
  }
}

// ---------------------------------------------------------------------------
// Which card shows it
// ---------------------------------------------------------------------------

/**
 * Every card watching on the page, in the order they started, shared by both
 * bundles through one global list so a tab shows the notice once. Each entry
 * answers with its own bundle's notice, and a card shows its notice only
 * when no earlier entry has one: a fresh bundle's card never hides an old
 * bundle's notice. The two bundles can be different versions while the
 * notice matters, so this protocol must not change: a later version that
 * needs another one uses another key.
 */
interface Holder {
  own(): VersionNotice | undefined;
  changed(): void;
}
const HOLDERS_KEY = Symbol.for("apollo_mmwave.version_notice.v1");

function holders(): Holder[] {
  const g = globalThis as Record<symbol, unknown>;
  if (!Array.isArray(g[HOLDERS_KEY])) g[HOLDERS_KEY] = [];
  return g[HOLDERS_KEY] as Holder[];
}

function notifyAll(): void {
  for (const holder of [...holders()]) {
    try {
      holder.changed();
    } catch {
      // One card's failed repaint must not stop the others.
    }
  }
}

export interface VersionWatch {
  /** The notice this card shows: undefined when the page needs none, or an
   *  earlier card on the page already shows one. */
  readonly notice: VersionNotice | undefined;
  /** Hand in Home Assistant's newest `hass` (on every update). */
  update(hass: VersionHass | undefined): void;
  /** Stop watching (when the card leaves the page). */
  close(): void;
}

/**
 * Watch the page's version notice from a card: `onChange` runs whenever the
 * notice this card should show may have changed. Call `update` with each new
 * `hass`, and `close` when the card leaves the page.
 */
export function watchVersion(onChange: () => void): VersionWatch {
  const entry: Holder = { own: () => pageNotice, changed: onChange };
  let open = true;
  holders().push(entry);
  watching++;
  return {
    get notice() {
      if (!open) return undefined;
      for (const holder of holders()) {
        if (holder === entry) return pageNotice;
        try {
          if (holder.own()) return undefined;
        } catch {
          // A broken entry shows nothing, so it hides nothing either.
        }
      }
      return undefined;
    },
    update(hass) {
      if (open) track(hass);
    },
    close() {
      if (!open) return;
      open = false;
      watching--;
      if (watching === 0) detach();
      const list = holders();
      const at = list.indexOf(entry);
      if (at >= 0) list.splice(at, 1);
      // A card further down may show the notice now.
      notifyAll();
    },
  };
}

/** The Reload button's action. */
export function reloadPage(): void {
  window.location.reload();
}

/**
 * The notice as plain DOM, for a card without Lit (the zone map card): the
 * lines as text, and a reload notice's Reload button after the first. It
 * carries its own inline styles, so it reads the same in any card.
 */
export function versionNoticeElement(notice: VersionNotice, doc: Document = document): HTMLElement {
  const box = doc.createElement("div");
  box.className = "apollo-version-notice";
  box.setAttribute("role", "status");
  box.style.cssText =
    "border-left: 4px solid var(--warning-color, #ff9800); padding: 4px 0 4px 12px; margin: 0 0 12px;";
  const line = (text: string, secondary = false) => {
    const p = doc.createElement("p");
    p.textContent = text;
    p.style.cssText = secondary
      ? "margin: 0; color: var(--secondary-text-color); font-size: 0.9em;"
      : "margin: 0 0 8px;";
    return p;
  };
  const [first, ...rest] = notice.lines;
  box.append(line(first));
  if (notice.kind === "reload") {
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = VERSION_RELOAD_LABEL;
    button.style.cssText =
      "font: inherit; cursor: pointer; border-radius: 4px; padding: 8px 16px; margin: 0 0 8px;" +
      " border: 1px solid var(--primary-color); background: var(--primary-color);" +
      " color: var(--text-primary-color, #fff); font-weight: 500;";
    button.addEventListener("click", () => reloadPage());
    box.append(button);
  }
  for (const text of rest) box.append(line(text, true));
  return box;
}
