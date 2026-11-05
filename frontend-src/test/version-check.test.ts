/**
 * The page's version check against a fake hass: what it asks Home Assistant,
 * when it asks again, which notice it gives and which card shows it. Each
 * test loads a fresh copy of the module, since the check is once per page.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARD_VERSION } from "../src/version";

type VersionCheck = typeof import("../src/version-check");

const HOLDERS_KEY = Symbol.for("apollo_mmwave.version_notice.v1");
const NEWER = "99.0.0";
const OLDER = "0.1.0";

async function fresh(): Promise<VersionCheck> {
  vi.resetModules();
  return import("../src/version-check");
}

/** A hass whose `manifest/get` answers with `version`, or with what
 *  `answer` returns, and whose connection can fire `ready`. */
function fakeHass(answer: (msg: Record<string, any>) => any = () => ({ version: CARD_VERSION })) {
  const listeners: Record<string, (() => void)[]> = {};
  const callWS = vi.fn(async (msg: Record<string, any>) => answer(msg));
  const connection = {
    addEventListener: vi.fn((event: string, cb: () => void) => {
      (listeners[event] ||= []).push(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: () => void) => {
      listeners[event] = (listeners[event] ?? []).filter((c) => c !== cb);
    }),
  };
  return {
    hass: { callWS, connection } as any,
    callWS,
    connection,
    listeners,
    ready: () => (listeners.ready ?? []).forEach((cb) => cb()),
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  delete (globalThis as any)[HOLDERS_KEY];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("compareVersions", () => {
  it("orders the manifest's PEP 440 forms, a release above its pre-releases", async () => {
    const { compareVersions } = await fresh();
    const ordered = ["2.3.0", "2.4.0a1", "2.4.0b1", "2.4.0b2", "2.4.0b10", "2.4.0rc1", "2.4.0", "2.4.1", "2.10.0"];
    for (let i = 0; i + 1 < ordered.length; i++) {
      expect(compareVersions(ordered[i], ordered[i + 1]), ordered[i]).toBeLessThan(0);
      expect(compareVersions(ordered[i + 1], ordered[i]), ordered[i]).toBeGreaterThan(0);
    }
    expect(compareVersions("2.4.0b2", "2.4.0b2")).toBe(0);
    expect(compareVersions("2.4", "2.4.0")).toBeUndefined();
    expect(compareVersions("main", "2.4.0")).toBeUndefined();
  });
});

describe("versionNotice", () => {
  it("asks an older page to reload, with a line for the Home Assistant apps", async () => {
    const { versionNotice } = await fresh();
    expect(versionNotice("2.4.0b3", "2.4.0b2")).toEqual({
      kind: "reload",
      lines: [
        "Apollo mmWave was updated to 2.4.0b3, but this page still runs 2.4.0b2.",
        "In the Home Assistant app, if Reload does not help, close the app fully and open it again.",
      ],
    });
  });

  it("asks for a restart when the page is newer than what Home Assistant runs", async () => {
    const { versionNotice } = await fresh();
    expect(versionNotice("2.4.0b2", "2.4.0b3")).toEqual({
      kind: "restart",
      lines: [
        "Apollo mmWave 2.4.0b3 is installed, but Home Assistant still runs 2.4.0b2." +
          " Restart Home Assistant to finish updating.",
      ],
    });
  });

  it("says nothing when the versions match or either cannot be read", async () => {
    const { versionNotice } = await fresh();
    expect(versionNotice("2.4.0b2", "2.4.0b2")).toBeUndefined();
    for (const running of [undefined, null, "", "main", 240, { version: "2.4.0" }]) {
      expect(versionNotice(running, "2.4.0b2"), String(running)).toBeUndefined();
    }
    expect(versionNotice("2.4.0b3", "dev")).toBeUndefined();
  });

  it("asks a newer page to reload once Home Assistant restarted into another version", async () => {
    const { versionNotice } = await fresh();
    // The page opened on 2.4.1, then Home Assistant went back to 2.4.0 and
    // restarted. The page still runs 2.4.1, and a reload fixes it.
    expect(versionNotice("2.4.0", "2.4.1", "2.4.1")?.kind).toBe("reload");
    // A newer bundle reached the page while Home Assistant kept running
    // 2.4.0b2 from the start: only a restart fixes it.
    expect(versionNotice("2.4.0b2", "2.4.0b3", "2.4.0b2")?.kind).toBe("restart");
    expect(versionNotice("2.4.0b2", "2.4.0b3")?.kind).toBe("restart");
    // An older page is a reload whatever ran before.
    expect(versionNotice("2.4.0b3", "2.4.0b2", "2.4.0b2")?.kind).toBe("reload");
    expect(versionNotice("2.4.0b3", "2.4.0b2", "2.4.0b3")?.kind).toBe("reload");
    // An unreadable first answer changes nothing.
    expect(versionNotice("2.4.0", "2.4.1", "garbage")?.kind).toBe("restart");
  });

  it("reads the update from the last beta to the release the right way round", async () => {
    const { compareVersions, versionNotice } = await fresh();
    expect(compareVersions("2.4.0b3", "2.4.0")).toBeLessThan(0);
    // Home Assistant restarted into 2.4.0 while a tab still runs 2.4.0b3.
    expect(versionNotice("2.4.0", "2.4.0b3")).toEqual({
      kind: "reload",
      lines: [
        "Apollo mmWave was updated to 2.4.0, but this page still runs 2.4.0b3.",
        "In the Home Assistant app, if Reload does not help, close the app fully and open it again.",
      ],
    });
    // The 2.4.0 files reached the browser before Home Assistant restarted.
    expect(versionNotice("2.4.0b3", "2.4.0")?.kind).toBe("restart");
  });
});

describe("watchVersion", () => {
  it("asks manifest/get once for the page, however many cards watch", async () => {
    const vc = await fresh();
    const page = fakeHass(() => ({ domain: "apollo_mmwave", version: NEWER }));
    const a = vc.watchVersion(() => {});
    const b = vc.watchVersion(() => {});
    a.update(page.hass);
    b.update(page.hass);
    a.update({ ...page.hass });
    await flush();
    expect(page.callWS).toHaveBeenCalledTimes(1);
    expect(page.callWS).toHaveBeenCalledWith({ type: "manifest/get", integration: "apollo_mmwave" });
    expect(page.connection.addEventListener).toHaveBeenCalledTimes(1);
    expect(a.notice).toEqual(vc.versionNotice(NEWER, CARD_VERSION));
    expect(a.notice?.kind).toBe("reload");
  });

  it("shows the notice on the first card only, and hands it on when that card leaves", async () => {
    const vc = await fresh();
    const page = fakeHass(() => ({ version: NEWER }));
    const changes = { a: 0, b: 0 };
    const a = vc.watchVersion(() => changes.a++);
    const b = vc.watchVersion(() => changes.b++);
    a.update(page.hass);
    await flush();
    expect(changes).toEqual({ a: 1, b: 1 });
    expect(a.notice?.kind).toBe("reload");
    expect(b.notice).toBeUndefined();
    a.close();
    expect(a.notice).toBeUndefined();
    expect(b.notice?.kind).toBe("reload");
    expect(changes.b).toBe(2);
    // A closed watch takes no more updates.
    a.close();
    expect(changes.b).toBe(2);
  });

  it("asks again when the connection comes back, and clears the notice once it matches", async () => {
    const vc = await fresh();
    let running = CARD_VERSION;
    const page = fakeHass(() => ({ version: running }));
    let changes = 0;
    const w = vc.watchVersion(() => changes++);
    w.update(page.hass);
    await flush();
    expect(w.notice).toBeUndefined();
    // Equal before and after: no repaint for nothing.
    expect(changes).toBe(0);

    // Home Assistant restarted into a newer version.
    running = NEWER;
    page.ready();
    await flush();
    expect(page.callWS).toHaveBeenCalledTimes(2);
    expect(w.notice?.lines[0]).toBe(
      `Apollo mmWave was updated to ${NEWER}, but this page still runs ${CARD_VERSION}.`
    );
    expect(changes).toBe(1);

    // And back: nothing to say.
    running = CARD_VERSION;
    page.ready();
    await flush();
    expect(w.notice).toBeUndefined();
    expect(changes).toBe(2);
  });

  it("listens for reconnects only while a card watches, and asks again when one comes back", async () => {
    const vc = await fresh();
    const page = fakeHass(() => ({ version: CARD_VERSION }));
    const a = vc.watchVersion(() => {});
    const b = vc.watchVersion(() => {});
    a.update(page.hass);
    await flush();
    expect(page.listeners.ready).toHaveLength(1);
    a.close();
    expect(page.listeners.ready).toHaveLength(1);
    b.close();
    // No card on the page: nothing left on the connection.
    expect(page.listeners.ready).toEqual([]);
    expect(page.callWS).toHaveBeenCalledTimes(1);
    // A reconnect may have gone by unheard, so the next card asks again.
    const c = vc.watchVersion(() => {});
    c.update(page.hass);
    await flush();
    expect(page.callWS).toHaveBeenCalledTimes(2);
    expect(page.listeners.ready).toHaveLength(1);
    c.close();
  });

  it("asks a page left open over a downgrade to reload, not to restart", async () => {
    const vc = await fresh();
    // The page opened while Home Assistant ran a newer version than the
    // bundle (files changed, no restart yet)...
    let running = OLDER;
    const page = fakeHass(() => ({ version: running }));
    const w = vc.watchVersion(() => {});
    w.update(page.hass);
    await flush();
    expect(w.notice?.kind).toBe("restart");
    // ...then Home Assistant restarted into another version, older than the
    // page's still: what is out of date now is the page.
    running = "0.0.1";
    page.ready();
    await flush();
    expect(w.notice?.kind).toBe("reload");
    expect(w.notice?.lines[0]).toBe(
      `Apollo mmWave was updated to 0.0.1, but this page still runs ${CARD_VERSION}.`
    );
    w.close();
  });

  it("asks for a restart when Home Assistant still runs an older version", async () => {
    const vc = await fresh();
    const page = fakeHass(() => ({ version: OLDER }));
    const w = vc.watchVersion(() => {});
    w.update(page.hass);
    await flush();
    expect(w.notice).toEqual({
      kind: "restart",
      lines: [
        `Apollo mmWave ${CARD_VERSION} is installed, but Home Assistant still runs ${OLDER}.` +
          " Restart Home Assistant to finish updating.",
      ],
    });
  });

  it("shows nothing and throws nothing when the answer cannot be read", async () => {
    const vc = await fresh();
    const answers = [
      () => Promise.reject({ code: "not_found", message: "Integration not found" }),
      () => {
        throw new Error("socket closed");
      },
      () => ({ domain: "apollo_mmwave" }),
      () => null,
      () => ({ version: 2 }),
    ];
    for (const answer of answers) {
      const page = fakeHass(answer);
      const w = vc.watchVersion(() => {});
      expect(() => w.update(page.hass)).not.toThrow();
      await flush();
      expect(w.notice).toBeUndefined();
      w.close();
    }
    // No callWS at all, a connection that refuses listeners, and no hass.
    const w = vc.watchVersion(() => {});
    expect(() => w.update({} as any)).not.toThrow();
    expect(() =>
      w.update({
        callWS: async () => ({ version: NEWER }),
        connection: {
          addEventListener: () => {
            throw new Error("no listeners");
          },
        },
      } as any)
    ).not.toThrow();
    expect(() => w.update(undefined)).not.toThrow();
    await flush();
    // The connection without listeners still got its first check.
    expect(w.notice?.kind).toBe("reload");
  });

  it("drops an answer that a newer check overtook", async () => {
    const vc = await fresh();
    const pending: ((v: any) => void)[] = [];
    const page = fakeHass(() => new Promise((resolve) => pending.push(resolve)));
    const w = vc.watchVersion(() => {});
    w.update(page.hass);
    page.ready();
    expect(pending).toHaveLength(2);
    // The reconnect's answer lands first, then the stale first answer.
    pending[1]({ version: CARD_VERSION });
    await flush();
    pending[0]({ version: NEWER });
    await flush();
    expect(w.notice).toBeUndefined();
  });

  it("lets a notice from another bundle's card show first, but never a fresh bundle hide one", async () => {
    const vc = await fresh();
    const page = fakeHass(() => ({ version: NEWER }));
    // Another bundle's card that started first, with a notice of its own.
    const other = { notice: { kind: "reload", lines: ["other"] } as any, changed: vi.fn() };
    const holders: any[] = [{ own: () => other.notice, changed: other.changed }];
    (globalThis as any)[HOLDERS_KEY] = holders;
    const w = vc.watchVersion(() => {});
    w.update(page.hass);
    await flush();
    expect(other.changed).toHaveBeenCalled();
    expect(w.notice).toBeUndefined();
    // That bundle is up to date after all: this card shows its own notice.
    other.notice = undefined;
    expect(w.notice?.kind).toBe("reload");
    // An entry that throws hides nothing.
    holders.unshift({
      own: () => {
        throw new Error("broken");
      },
      changed: () => {
        throw new Error("broken");
      },
    });
    expect(w.notice?.kind).toBe("reload");
    expect(() => w.close()).not.toThrow();
  });
});

describe("the notice as DOM and the Reload button", () => {
  it("reloads the page", async () => {
    const { reloadPage } = await fresh();
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ reload } as any);
    reloadPage();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("builds a reload notice with its button between the lines, and a restart one without", async () => {
    const vc = await fresh();
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ reload } as any);
    const box = vc.versionNoticeElement(vc.versionNotice("2.4.0b3", "2.4.0b2")!);
    expect(box.getAttribute("role")).toBe("status");
    expect(Array.from(box.children).map((el) => el.tagName)).toEqual(["P", "BUTTON", "P"]);
    expect(box.children[0].textContent).toBe(
      "Apollo mmWave was updated to 2.4.0b3, but this page still runs 2.4.0b2."
    );
    expect(box.children[1].textContent).toBe("Reload");
    expect(box.children[2].textContent).toBe(vc.VERSION_APP_LINE);
    (box.children[1] as HTMLButtonElement).click();
    expect(reload).toHaveBeenCalledTimes(1);

    const restart = vc.versionNoticeElement(vc.versionNotice("2.4.0b2", "2.4.0b3")!);
    expect(restart.querySelector("button")).toBeNull();
    expect(restart.textContent).toContain("Restart Home Assistant to finish updating.");
  });

  it("puts a version from the server in as text, never as markup", async () => {
    const vc = await fresh();
    const box = vc.versionNoticeElement({ kind: "restart", lines: ["<img src=x onerror=alert(1)>"] });
    expect(box.querySelector("img")).toBeNull();
    expect(box.textContent).toBe("<img src=x onerror=alert(1)>");
  });
});
