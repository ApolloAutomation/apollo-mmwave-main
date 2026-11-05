/**
 * Expand map's pure parts (full-window.ts): how the window is split
 * between the map and its panel, the icons, and the dialog check.
 */

import { describe, it, expect } from "vitest";
import {
  ICON_CLOSE,
  ICON_COLLAPSE,
  ICON_EXPAND,
  fullWindowLayout,
  iconSvg,
  insideDialog,
} from "../src/zone-map/full-window";

describe("fullWindowLayout", () => {
  // Content boxes, inside the full window's 8 px padding and safe areas.
  it.each([
    ["1080p", { width: 1904, height: 944, aspect: 4 / 3 }, "side", 1258],
    ["the 800 px pane", { width: 784, height: 884, aspect: 4 / 3, cardMapWidth: 704 }, "stacked", 784],
    ["the 800 px pane, square", { width: 784, height: 884, aspect: 1, cardMapWidth: 700 }, "stacked", 700],
    ["an iPhone upright", { width: 377, height: 743, aspect: 4 / 3 }, "stacked", 377],
    ["an iPhone sideways", { width: 718, height: 356, aspect: 4 / 3, cardMapWidth: 320 }, "side", 402],
    ["an iPad sideways", { width: 1164, height: 760, aspect: 4 / 3, cardMapWidth: 768 }, "side", 799],
    ["an iPad sideways, square", { width: 1164, height: 760, aspect: 1 }, "side", 760],
    ["an iPad upright", { width: 804, height: 1120, aspect: 4 / 3 }, "stacked", 804],
  ])("lays out %s", (_name, box, layout, mapWidth) => {
    expect(fullWindowLayout(box)).toMatchObject({ layout, mapWidth });
  });

  it("gives the panel beside the map 30% of the width, from 300 to 420 px", () => {
    expect(fullWindowLayout({ width: 1904, height: 944, aspect: 4 / 3 }).sideWidth).toBe(420);
    expect(fullWindowLayout({ width: 1164, height: 760, aspect: 1 }).sideWidth).toBe(349);
    expect(fullWindowLayout({ width: 718, height: 356, aspect: 4 / 3 }).sideWidth).toBe(300);
  });

  it("lays the map beside the panel when both ways give it the same width", () => {
    // Beside: min(1000 - 300 - 16, 500 * 1) = 500 px. Stacked:
    // min(1000, max(240, 500, (500 - 64 - 160) * 1)) = 500 px.
    expect(fullWindowLayout({ width: 1000, height: 500, aspect: 1, cardMapWidth: 500 })).toEqual({
      layout: "side",
      mapWidth: 500,
      sideWidth: 300,
    });
  });

  it("never shows a stacked map narrower than the card did, nor under 240 px tall", () => {
    // Room for 576 px of map over the panel, but the card's map was 600:
    // that leaves the panel 136 px.
    expect(fullWindowLayout({ width: 640, height: 800, aspect: 1, cardMapWidth: 600 })).toMatchObject({
      layout: "stacked",
      mapWidth: 600,
    });
    // Room for 226 px, and no room beside it for a 240 px map: 146 px left.
    expect(fullWindowLayout({ width: 520, height: 450, aspect: 1 })).toMatchObject({
      layout: "stacked",
      mapWidth: 240,
    });
  });

  // The zone map's fitted shape, the measured header and the card's map, in
  // content boxes inside the full window's 8 px padding.
  const PHONE_MAP = { aspect: 800 / 622, headerPx: 64, cardMapWidth: 310.7 };
  /** How tall the panel is: the window's height beside the map, what the
   *  map and the header leave under it. */
  const panelHeight = (box: { width: number; height: number; aspect: number; headerPx: number }) => {
    const { layout, mapWidth } = fullWindowLayout(box);
    return layout === "side" ? box.height : box.height - box.headerPx - mapWidth / box.aspect;
  };

  it.each([
    ["an iPhone SE sideways", 552, 304, 236],
    ["a 360 dp Android phone sideways", 624, 344, 308],
    ["a 720p laptop at 200% zoom", 624, 289, 308],
  ])("puts the panel beside the map on %s, where under it would leave it no room", (_name, width, height, mapWidth) => {
    const box = { width, height, ...PHONE_MAP };
    expect(fullWindowLayout(box)).toMatchObject({ layout: "side", mapWidth, sideWidth: 300 });
    expect(panelHeight(box)).toBeGreaterThanOrEqual(120);
  });

  it("keeps the panel under the map where it has 120 px, or nothing beside it has any width", () => {
    // The 800 px pane, square: 884 - 64 - 700 leaves the panel 120 px.
    expect(fullWindowLayout({ width: 784, height: 884, aspect: 1, cardMapWidth: 700 }).layout).toBe("stacked");
    // 316 px wide: a 300 px panel and the gap leave the map nothing.
    expect(fullWindowLayout({ width: 316, height: 300, aspect: 1 })).toMatchObject({
      layout: "stacked",
      mapWidth: 240,
    });
  });

  it("takes the header it is given, and a map shape that is not a number as square", () => {
    const tall = fullWindowLayout({ width: 400, height: 900, aspect: NaN, headerPx: 200 });
    expect(tall).toMatchObject({ layout: "stacked", mapWidth: 400 });
    expect(fullWindowLayout({ width: 300, height: 700, aspect: 1, headerPx: 400 }).mapWidth).toBe(240);
  });
});

describe("iconSvg", () => {
  it("draws a 20 px icon in the text color that assistive tech skips", () => {
    for (const path of [ICON_EXPAND, ICON_COLLAPSE, ICON_CLOSE]) {
      const host = document.createElement("div");
      host.innerHTML = iconSvg(path);
      const svg = host.querySelector("svg")!;
      expect(svg.getAttribute("width")).toBe("20");
      expect(svg.getAttribute("height")).toBe("20");
      expect(svg.getAttribute("fill")).toBe("currentColor");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("focusable")).toBe("false");
      expect(svg.querySelector("path")!.getAttribute("d")).toBe(path);
    }
  });
});

describe("insideDialog", () => {
  it("finds a native dialog or Home Assistant's dialogs around a node, through shadow roots", () => {
    for (const tag of ["dialog", "ha-dialog", "wa-dialog"]) {
      const dialog = document.createElement(tag);
      const host = document.createElement("div");
      const root = host.attachShadow({ mode: "open" });
      const card = document.createElement("span");
      root.append(card);
      dialog.append(host);
      document.body.append(dialog);
      expect(insideDialog(card), tag).toBe(true);
      dialog.remove();
    }
  });

  it("finds none around a card on the page, or in its own shadow root", () => {
    const card = document.createElement("div");
    const root = card.attachShadow({ mode: "open" });
    root.append(document.createElement("dialog"));
    document.body.append(card);
    expect(insideDialog(card)).toBe(false);
    expect(insideDialog(null)).toBe(false);
    card.remove();
  });
});
