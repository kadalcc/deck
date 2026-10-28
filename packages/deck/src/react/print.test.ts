import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { resolveConfig, resolveSlideOptions } from "../core/model.ts";
import { initialNav } from "../core/navigation.ts";
import { createStore } from "../core/store.ts";
import { DeckContext, type DeckRuntime } from "./context.ts";
import { PrintView, printPages, spillOf } from "./PrintView.tsx";

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
  const columns = [
    { h: 0, slides: [slide(0)] },
    { h: 1, slides: [slide(1)] },
  ];
  const deck = (totals: Record<string, number>, config = resolveConfig({})) =>
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

  // reveal.js numbers the printed pages with showSlideNumber "all" or "print" (R095).
  const numbers = (input: Record<string, unknown>) =>
    [
      ...renderToStaticMarkup(
        createElement(
          DeckContext.Provider,
          { value: deck({ "0,0": 1, "1,0": 0 }, resolveConfig(input)) },
          createElement(PrintView, { options: { clicks: true } }),
        ),
      ).matchAll(/<div class="deck-slide-number deck-print-slide-number">([^<]*)<\/div>/g),
    ].map((m) => m[1]);

  test("every page carries the slide number with showSlideNumber all or print", () => {
    expect(numbers({ slideNumber: "c/t" })).toEqual(["1 / 2", "1 / 2", "2 / 2"]);
    expect(numbers({ slideNumber: "c", showSlideNumber: "print" })).toEqual(["1", "1", "2"]);
  });

  test("no number without slideNumber, or when it is the speaker view's only", () => {
    expect(numbers({})).toEqual([]);
    expect(numbers({ slideNumber: true, showSlideNumber: "speaker" })).toEqual([]);
  });
});

describe("pdfMaxPagesPerSlide: how many pages a slide spills onto", () => {
  // A print page and its slide's layout, as far as the measurement reads them (bun has no DOM).
  const page = (pageHeight: number, layout: { client: number; scroll?: number; fit?: number }) =>
    ({
      clientHeight: pageHeight,
      querySelector: () => ({
        clientHeight: layout.client,
        scrollHeight: layout.scroll ?? layout.client,
        classList: { contains: (c: string) => c === "is-fitted" && layout.fit !== undefined },
        style: { getPropertyValue: () => String(layout.fit ?? "") },
      }),
    }) as unknown as HTMLElement;

  test("a slide that fits stays on one page", () => {
    expect(spillOf(page(1080, { client: 960 }), 1)).toBe(1);
  });
  test("content that overflows by half a page needs two", () => {
    // 120px of padding around a 960px layout whose content is 1500px tall.
    expect(spillOf(page(1080, { client: 960, scroll: 1500 }), 1)).toBe(2);
  });
  test("a layout autoFit shrank to half wants twice its box", () => {
    expect(spillOf(page(1080, { client: 1920, fit: 0.5 }), 1)).toBe(2);
    expect(spillOf(page(1080, { client: 960 / 0.3, fit: 0.3 }), 1)).toBe(4);
  });
  test("measured again once grown, it keeps its pages rather than shrink back", () => {
    expect(spillOf(page(2160, { client: 2040 }), 2)).toBe(2);
  });
});
