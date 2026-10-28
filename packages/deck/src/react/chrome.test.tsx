import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DeckManifest } from "../core/model.ts";
import { jumpTarget, newlyShown, statusText } from "./chrome.tsx";
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

describe("the screen-reader live region", () => {
  test("is in the play view, polite and atomic, and not inside anything aria-hidden", () => {
    const html = render();
    const region = /<div class="deck-sr-only deck-announcer"[^>]*>/.exec(html)?.[0] ?? "";
    expect(region).toContain('aria-live="polite"');
    expect(region).toContain('aria-atomic="true"');
    // Not in an editor's preview, where the slide is the author's own and nothing is presented.
    expect(render(false)).not.toContain("deck-announcer");
  });

  // A tiny stand-in for the DOM: bun test has none, and the walk reads only these members.
  type Fake = {
    nodeType: number;
    tagName?: string;
    textContent?: string;
    childNodes: Fake[];
    dataset: Record<string, string>;
    getAttribute: (k: string) => string | null;
    contains: (o: Fake) => boolean;
    querySelectorAll: (sel: string) => Fake[];
  };
  const all = (n: Fake): Fake[] => [n, ...n.childNodes.flatMap(all)];
  const el = (tag: string, attrs: Record<string, string>, ...children: (Fake | string)[]) => {
    const node: Fake = {
      nodeType: 1,
      tagName: tag,
      childNodes: children.map((c) =>
        typeof c === "string"
          ? ({ nodeType: 3, textContent: c, childNodes: [] } as unknown as Fake)
          : c,
      ),
      dataset: attrs["data-click-at"] ? { clickAt: attrs["data-click-at"] } : {},
      getAttribute: (k) => attrs[k] ?? null,
      contains: (o) => all(node).includes(o),
      querySelectorAll: () => all(node).filter((n) => n !== node && n.dataset?.clickAt),
    };
    return node;
  };
  const asNode = (f: Fake) => f as unknown as HTMLElement;

  test("reads the words a viewer can see: not aria-hidden, not scripts, an image's alt", () => {
    const slide = el(
      "SECTION",
      {},
      el("H1", {}, "Two  points"),
      el("P", { "aria-hidden": "true" }, "a hidden click"),
      el("STYLE", {}, ".x { color: red }"),
      el("IMG", { alt: "A chart of sales" }),
      el("P", {}, "Shown\n  now"),
    );
    expect(statusText(asNode(slide))).toBe("Two points A chart of sales Shown now");
  });

  test("on a step forward, the elements that step brought in, outermost once", () => {
    const inner = el("SPAN", { "data-click-at": "2" }, "nested");
    const slide = el(
      "SECTION",
      {},
      el("P", { "data-click-at": "1" }, "First"),
      el("DIV", { "data-click-at": "2" }, "Second ", inner),
      el("P", { "data-click-at": "3", "aria-hidden": "true" }, "Third"),
    );
    expect(newlyShown(asNode(slide), 0, 1)).toBe("First");
    expect(newlyShown(asNode(slide), 1, 2)).toBe("Second nested");
    // A jump of several steps reads them all; a step that shows nothing says nothing.
    expect(newlyShown(asNode(slide), 0, 2)).toBe("First Second nested");
    expect(newlyShown(asNode(slide), 2, 3)).toBe("");
  });
});

describe("the auto-slide control", () => {
  const withHead = (headmatter: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(DeckRuntimeView, { manifest: { ...manifest, headmatter } }),
    );
  test("is in the corner row on a deck that auto-slides and lets the viewer stop it", () => {
    const html = withHead({ autoSlide: 4000 });
    const button = /<button[^>]*class="deck-autoslide[^"]*"[^>]*>/.exec(html)?.[0] ?? "";
    expect(button).toContain("aria-label=");
    expect(button).toContain("aria-pressed=");
    expect(html).toContain("deck-autoslide-dial");
  });
  test("is not there without an interval, or with autoSlideStoppable: false", () => {
    expect(withHead({})).not.toContain("deck-autoslide");
    expect(withHead({ autoSlide: 4000, autoSlideStoppable: false })).not.toContain(
      "deck-autoslide",
    );
  });
});
