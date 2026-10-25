import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileDeck } from "./compile.ts";
import { lineColumn, lineStarts } from "./edit-map.ts";

/** Stand-ins for the engine's components, so a slide renders without the deck around it. */
const box = (tag: string) => (p: { children?: unknown }) =>
  createElement(tag, null, p.children as never);
const components = { Kbd: box("kbd"), Card: box("section") };

/** Every slide rendered, as the preview renders it. */
async function render(text: string, options: Parameters<typeof compileDeck>[1] = {}) {
  const out = await compileDeck(text, { editable: true, ...options });
  return Promise.all(
    out.manifest.slides.map(async (s) =>
      renderToStaticMarkup(createElement((await s.load()).default, { components } as never)),
    ),
  );
}

const unescape = (html: string) =>
  html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

interface Spot {
  tag: string;
  file: string;
  from: number;
  to: number;
  shown: string;
}

/** The editable elements of rendered slides: their range and the text they show. */
function spots(html: string): Spot[] {
  const out: Spot[] = [];
  const re = /<(h[1-6]|p|li|td|th)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  for (const m of html.matchAll(re)) {
    const edit = /data-deck-edit="(\d+)-(\d+)"/.exec(m[2]!);
    if (!edit) continue;
    const file = /data-deck-file="([^"]*)"/.exec(m[2]!)![1]!;
    out.push({
      tag: m[1]!,
      file: unescape(file),
      from: Number(edit[1]),
      to: Number(edit[2]),
      shown: unescape(m[3]!),
    });
  }
  return out;
}

/** The editable texts of a deck, each checked against its file at the range it reports. */
async function editable(text: string, files: Record<string, string> = {}) {
  const pages = await render(text, { files });
  const all = pages.flatMap(spots);
  for (const s of all) {
    const source = s.file === "deck.mdx" ? text : files[s.file]!;
    expect(typeof source).toBe("string");
    // The range holds exactly the text on screen (CRLF spelled as LF on screen).
    expect(source.slice(s.from, s.to).replace(/\r\n/g, "\n")).toBe(s.shown);
  }
  return all;
}

describe("editing in place: source ranges", () => {
  test("headings, paragraphs, list items, table cells and quotes, under the headmatter", async () => {
    const deck = `---
title: Ranges
---

# The title

A plain paragraph.

- First item
- Second item

| Name | Score |
| --- | --- |
| Ada | 10 |

> A quoted line.

---
layout: center
---

## Second slide
`;
    const all = await editable(deck);
    expect(all.map((s) => `${s.tag}:${s.shown}`)).toEqual([
      "h1:The title",
      "p:A plain paragraph.",
      "li:First item",
      "li:Second item",
      "th:Name",
      "th:Score",
      "td:Ada",
      "td:10",
      "p:A quoted line.",
      "h2:Second slide",
    ]);
    // Offsets are into the whole file, headmatter and all.
    expect(all[0]!.from).toBe(deck.indexOf("The title"));
    expect(all.at(-1)!.from).toBe(deck.indexOf("Second slide"));
  });

  test("text with inline markup, escapes or entities is not editable, but is located", async () => {
    const deck = `# Plain\n\nSome **bold** words.\n\nTom &amp; Jerry\n\nA \\*literal\\* star\n\nSee https://example.com now\n\nPress <Kbd>K</Kbd> to go.\n`;
    const html = (await render(deck)).join("");
    expect(spots(html).map((s) => s.shown)).toEqual(["Plain"]);
    // Every paragraph still says where it starts.
    const at = [...html.matchAll(/<p data-deck-at="(\d+)"/g)].map((m) => Number(m[1]));
    expect(at).toEqual(
      ["Some **bold**", "Tom &amp;", "A \\*literal", "See https", "Press <Kbd>"].map((t) =>
        deck.indexOf(t),
      ),
    );
  });

  test("a multi-line paragraph is one range; a lazy blockquote's second line is not", async () => {
    const deck = `# T\n\nOne line\nand the next.\n\n> quoted\n> twice\n`;
    const all = await editable(deck);
    expect(all.map((s) => s.shown)).toEqual(["T", "One line\nand the next."]);
  });

  test("CRLF files: offsets count the \\r, multi-line ranges span it", async () => {
    const deck =
      "---\r\ntitle: Windows\r\n---\r\n\r\n# Crlf title\r\n\r\nLine one\r\nline two\r\n\r\n---\r\n\r\n## Next\r\n";
    const all = await editable(deck);
    expect(all.map((s) => s.shown)).toEqual(["Crlf title", "Line one\nline two", "Next"]);
    expect(all[0]!.from).toBe(deck.indexOf("Crlf title"));
    expect(deck.slice(all[1]!.from, all[1]!.to)).toBe("Line one\r\nline two");
    expect(all[2]!.from).toBe(deck.indexOf("Next"));
  });

  test("non-ASCII text: offsets are UTF-16, as JavaScript strings count", async () => {
    const deck = `---\ntitle: வணக்கம் 👋\n---\n\n# வணக்கம் உலகம் 🌏\n\nஎமோஜி 🎉🎉 பின் உரை\n\n---\n\n## 👩‍💻 Next 🚀\n`;
    const all = await editable(deck);
    expect(all.map((s) => s.shown)).toEqual(["வணக்கம் உலகம் 🌏", "எமோஜி 🎉🎉 பின் உரை", "👩‍💻 Next 🚀"]);
    expect(all[2]!.from).toBe(deck.indexOf("👩‍💻 Next"));
  });

  test("notes, trailing comments, styles and separators of both kinds keep the lines true", async () => {
    const deck = `# One

<Notes>
Notes that say One again:
One
</Notes>

After notes.

<!-- a comment in the middle -->

Between.

<style>
h1 { color: red }
</style>

----

## Vertical

Body below.

<!-- trailing notes -->

---

\`\`\`yaml
layout: center
\`\`\`

## Block frontmatter
`;
    const all = await editable(deck);
    expect(all.map((s) => s.shown)).toEqual([
      "One",
      "After notes.",
      "Between.",
      "Vertical",
      "Body below.",
      "Block frontmatter",
    ]);
    // "One" is the heading, not the copy inside the notes.
    expect(all[0]!.from).toBe(2);
  });

  test("a line with an inline <Notes> does not map: it stays edit-in-source", async () => {
    const deck = `# Title\n\nSay this <Notes>not this</Notes> please.\n\nPlain after.\n`;
    const all = await editable(deck);
    expect(all.map((s) => s.shown)).toEqual(["Title", "Plain after."]);
  });

  test("indented first lines, components around text, and ::slots::", async () => {
    const deck = `---
layout: two-cols
---

   ## Indented title

<Card title="x">

Inside a card.

</Card>

::right::

Right column text.

- right item
`;
    const all = await editable(deck);
    expect(all.map((s) => s.shown)).toEqual([
      "Indented title",
      "Inside a card.",
      "Right column text.",
      "right item",
    ]);
  });

  test("multi-file decks: an included page reports its own file and offsets", async () => {
    const page = `# Page title\n\nFrom the page.\n\n---\n\n## Page two\n\nSecond page text.\n`;
    const deck = `---\ntitle: Main\n---\n\n# Main title\n\n---\nsrc: pages/intro.mdx\n---\n\n---\n\n## After include\n`;
    const all = await editable(deck, { "pages/intro.mdx": page });
    expect(all.map((s) => `${s.file}:${s.shown}`)).toEqual([
      "deck.mdx:Main title",
      "pages/intro.mdx:Page title",
      "pages/intro.mdx:From the page.",
      "pages/intro.mdx:Page two",
      "pages/intro.mdx:Second page text.",
      "deck.mdx:After include",
    ]);
    expect(all[1]!.from).toBe(page.indexOf("Page title"));
    expect(all[4]!.from).toBe(page.indexOf("Second page text."));
  });

  test("the same text twice on a slide: each copy has its own range", async () => {
    const deck = `# Same\n\nSame\n\n- Same\n`;
    const all = await editable(deck);
    expect(all.map((s) => s.from)).toEqual([2, 8, 16]);
  });

  test("code is located but never editable; a snippet expansion keeps the rest mapped", async () => {
    const deck = "# Code\n\n```ts\nconst a = 1\n```\n\n<<< @/snippets/a.ts\n\nAfter the snippet.\n";
    const all = await editable(deck, { "snippets/a.ts": "export const b = 2\n" });
    expect(all.map((s) => s.shown)).toEqual(["Code", "After the snippet."]);
    expect(all[1]!.from).toBe(deck.indexOf("After the snippet."));
  });

  test("published compiles carry no source positions at all", async () => {
    const deck = `# Title\n\nText.\n`;
    const out = await compileDeck(deck);
    const html = renderToStaticMarkup(
      createElement((await out.manifest.slides[0]!.load()).default),
    );
    expect(html).not.toContain("data-deck-");
    expect(html).toBe("<h1>Title</h1>\n<p>Text.</p>");
    // …nor does a preview compile of a deck with a preprocess hook (positions would be wrong).
    const pre = await compileDeck(deck, { editable: true, preprocess: (t) => t });
    expect(
      renderToStaticMarkup(createElement((await pre.manifest.slides[0]!.load()).default)),
    ).not.toContain("data-deck-");
  });
});

describe("lineColumn / lineStarts", () => {
  test("1-based lines and columns in UTF-16, CRLF's \\r on its own line", () => {
    const t = "ab\r\ncd\nவ👋x";
    expect(lineStarts(t)).toEqual([0, 4, 7]);
    expect(lineColumn(t, 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumn(t, 2)).toEqual({ line: 1, column: 3 });
    expect(lineColumn(t, 4)).toEqual({ line: 2, column: 1 });
    expect(lineColumn(t, t.indexOf("x"))).toEqual({ line: 3, column: 4 });
  });
});

describe("cleanTyped", () => {
  test("no-break spaces, line breaks and ends", async () => {
    const { cleanTyped } = await import("./edit.ts");
    expect(cleanTyped("  New  title \n", false)).toBe("New  title");
    expect(cleanTyped("one\n\n two\n", false)).toBe("one two");
    expect(cleanTyped("one  \n\n\n  two\n", true)).toBe("one\ntwo");
    expect(cleanTyped("வணக்கம் 🎉\n", true)).toBe("வணக்கம் 🎉");
  });
});
