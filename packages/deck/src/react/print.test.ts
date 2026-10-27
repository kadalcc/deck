import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { resolveConfig, resolveSlideOptions } from "../core/model.ts";
import { initialNav } from "../core/navigation.ts";
import { createStore } from "../core/store.ts";
import { DeckContext, type DeckRuntime } from "./context.ts";
import { PrintView, printPages } from "./PrintView.tsx";

describe("printPages", () => {
  const slides = [
    { h: 0, v: 0 },
    { h: 1, v: 0 },
    { h: 1, v: 1 },
  ];
  const totals = { "0,0": 0, "1,0": 3, "1,1": 1 };

  test("a page per click step when fragments print separately", () => {
    const pages = printPages(slides, totals, true);
    expect(pages.map((p) => `${p.h}.${p.v}@${p.click}`)).toEqual([
      "0.0@0",
      "1.0@0",
      "1.0@1",
      "1.0@2",
      "1.0@3",
      "1.1@0",
      "1.1@1",
    ]);
    // Σ (clicks + 1) over the slides
    expect(pages).toHaveLength(1 + 4 + 2);
  });

  test("one page per slide, at its last step, otherwise", () => {
    const pages = printPages(slides, totals, false);
    expect(pages.map((p) => `${p.h}.${p.v}@${p.click}`)).toEqual(["0.0@0", "1.0@3", "1.1@1"]);
  });

  test("a slide with clicksStart prints from the step it opens at", () => {
    const pages = printPages([{ h: 0, v: 0, start: 1 }], { "0,0": 3 }, true);
    expect(pages.map((p) => p.click)).toEqual([1, 2, 3]);
    expect(pages.map((p) => p.first)).toEqual([true, false, false]);
  });

  test("a slide that has not reported yet is one page", () => {
    expect(printPages([{ h: 0, v: 0 }], {}, true)).toHaveLength(1);
  });
});

/**
 * Slides report their click totals from their own effects, and a child's effects run before its
 * parent's: by the time the print view subscribes to the nav store, a slide whose total is known
 * at mount (`clicks:` in its frontmatter) has already reported, and never reports again. A print
 * view that only listened for later changes printed every such slide as one page at click 0, and
 * a deck that set `clicks:` on every slide never stepped at all.
 */
describe("the print view reads the totals already reported", () => {
  const slide = (index: number) => ({
    index,
    id: `s${index}`,
    title: null,
    frontmatter: {},
    hasNotes: false,
    load: () => new Promise(() => {}),
    loadNotes: null,
    loadMagic: null,
  });
  const config = resolveConfig({});
  const columns = [
    { h: 0, slides: [slide(0)] },
    { h: 1, slides: [slide(1)] },
  ];
  const deck = (totals: Record<string, number>) =>
    ({
      manifest: { dev: false, headmatter: {}, slides: [] },
      config,
      columns,
      options: new Map(
        ["0,0", "1,0"].map((k) => [k, resolveSlideOptions({}, config, k === "0,0")]),
      ),
      nav: createStore({ ...initialNav(), totals }),
      ui: createStore({ theme: "classic", colorScheme: "light" }),
      mode: "print",
      layers: null,
      components: {},
    }) as unknown as DeckRuntime;
  const steps = (html: string) =>
    [...html.matchAll(/class="deck-print-page" data-slide="(\d+)"[^>]*data-click="(\d+)"/g)].map(
      (m) => `${m[1]}@${m[2]}`,
    );

  test("a page per step for totals reported before it mounted", () => {
    const html = renderToStaticMarkup(
      createElement(
        DeckContext.Provider,
        { value: deck({ "0,0": 2, "1,0": 1 }) },
        createElement(PrintView, { options: { clicks: true } }),
      ),
    );
    expect(steps(html)).toEqual(["0@0", "0@1", "0@2", "1@0", "1@1"]);
  });
});
