import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DeckManifest } from "../core/model.ts";
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
