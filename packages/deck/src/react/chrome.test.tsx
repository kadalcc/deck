import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DeckManifest } from "../core/model.ts";
import { jumpTarget } from "./chrome.tsx";
import { DeckRuntimeView } from "./Deck.tsx";

const manifest: DeckManifest = {
  headmatter: { badge: true, progress: true },
  slides: [0, 1].map((index) => ({
    index,
    h: index,
    v: 0,
    id: `s${index}`,
    title: `Slide ${index + 1}`,
    level: 1,
    frontmatter: {},
    hasNotes: false,
    text: "",
    notesText: null,
    source: { file: "deck.mdx", line: 1 + index * 4 },
    load: () => Promise.resolve({ default: () => createElement("h1", null, `Slide ${index + 1}`) }),
    loadNotes: null,
    loadMagic: null,
  })) as DeckManifest["slides"],
};

const render = (chrome?: boolean) =>
  renderToStaticMarkup(
    createElement(DeckRuntimeView, { manifest, ...(chrome === undefined ? {} : { chrome }) }),
  );

describe("the play view's chrome", () => {
  test("on by default: arrows, progress and the theme button", () => {
    const html = render();
    expect(html).toContain("deck-controls");
    expect(html).toContain("deck-progress");
    expect(html).toContain("deck-theme-button");
    expect(render(true)).toBe(html);
  });

  // The watermark (a slide's own, drawn once it loads) is checked in a browser: tools/shell-check.mjs.
  test("off (an editor's preview): none of it", () => {
    const html = render(false);
    expect(html).not.toContain("deck-controls");
    expect(html).not.toContain("deck-progress");
    expect(html).not.toContain("deck-theme-button");
    expect(html).not.toContain("deck-slide-number");
    expect(html).toContain("deck-chrome-area");
  });
});

describe("the pause curtain", () => {
  // It is always in the page, drawn at opacity 0 until B pauses the deck.
  test("is hidden from assistive technology while the deck is not paused", () => {
    const curtain = /<div class="deck-pause-curtain"[^>]*>/.exec(render())?.[0] ?? "";
    expect(curtain).toContain('aria-hidden="true"');
  });
});

describe("jump-to", () => {
  test("a number, a column and row in either of reveal.js's spellings, or an id", () => {
    expect(jumpTarget(" 12 ")).toEqual({ flat: 11 });
    expect(jumpTarget("6/2")).toEqual({ h: 5, v: 1 });
    expect(jumpTarget("6.2")).toEqual({ h: 5, v: 1 });
    expect(jumpTarget("intro")).toEqual({ id: "intro" });
    expect(jumpTarget("   ")).toBeNull();
  });
});
