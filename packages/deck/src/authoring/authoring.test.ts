import { describe, expect, test } from "bun:test";

import {
  type DeckFiles,
  addSlide,
  estimateClicks,
  lintDeck,
  moveSlide,
  outlineDeck,
  readDeck,
  readExtensions,
  removeSlide,
  setNotes,
  updateHeadmatter,
  updateSlide,
} from "./index.ts";

const DECK = `---
# the deck
title: Edits
theme: minimal
layout: cover
---

# Edits

The title slide.

<Notes>Hello. [click] there.</Notes>

---
layout: section # a comment that must survive
---

# Part one

----

## Beneath

---

## Last

- a
- b
`;

function files(
  texts: Record<string, string>,
  entry = "deck.mdx",
): DeckFiles & { texts: Record<string, string> } {
  return { entry, texts, read: (p) => texts[p] ?? null };
}

function apply(f: ReturnType<typeof files>, result: { files: Record<string, string> }) {
  Object.assign(f.texts, result.files);
  return f;
}

const titles = (f: DeckFiles) => outlineDeck(f).slides.map((s) => s.title);

describe("outline", () => {
  test("lists slides with positions, layouts and line ranges", () => {
    const o = outlineDeck(files({ "deck.mdx": DECK }));
    expect(o.slides.map((s) => [s.index, s.h, s.v, s.layout, s.title])).toEqual([
      [0, 0, 0, "cover", "Edits"],
      [1, 1, 0, "section", "Part one"],
      [2, 1, 1, "default", "Beneath"],
      [3, 2, 0, "default", "Last"],
    ]);
    expect(o.slides[0]!.notes).toBe(true);
    expect(o.slides[0]!.noteClicks).toBe(1);
    expect(o.slides[1]!.source).toEqual({
      file: "deck.mdx",
      startLine: 14,
      endLine: 19,
      bodyLine: 17,
    });
  });

  test("estimates clicks", () => {
    expect(estimateClicks({ content: "<Click>a</Click>\n<Click>b</Click>", frontmatter: {} })).toBe(
      2,
    );
    expect(
      estimateClicks({ content: "<Clicks>\n\n- a\n- b\n- c\n\n</Clicks>", frontmatter: {} }),
    ).toBe(3);
    expect(estimateClicks({ content: "```ts {1|2|3}\na\nb\nc\n```", frontmatter: {} })).toBe(2);
    expect(estimateClicks({ content: "x", frontmatter: { clicks: 5 } })).toBe(5);
  });
});

describe("edits change only the slide's lines", () => {
  test("updating a body keeps every other byte and the slide's notes", () => {
    const f = files({ "deck.mdx": DECK });
    const r = updateSlide(f, 3, { content: "## Last, rewritten\n\n- c" });
    const after = r.files["deck.mdx"]!;
    expect(after.startsWith(DECK.slice(0, DECK.indexOf("## Last")))).toBe(true);
    expect(after.endsWith("## Last, rewritten\n\n- c\n")).toBe(true);
    const head = updateSlide(f, 0, { content: "# New title" }).files["deck.mdx"]!;
    expect(head).toContain(
      "# New title\n\n<Notes>Hello. [click] there.</Notes>\n\n---\nlayout: section",
    );
    expect(updateSlide(f, 0, { content: "# T", keepNotes: false }).files["deck.mdx"]).not.toContain(
      "<Notes>",
    );
  });

  test("frontmatter patches keep comments and order; null deletes", () => {
    const f = files({ "deck.mdx": DECK });
    const out = updateSlide(f, "1", { patch: { background: "aurora", layout: null } }).files[
      "deck.mdx"
    ]!;
    expect(out).toContain("---\nbackground: aurora\n---\n\n# Part one");
    const kept = updateSlide(f, 1, { patch: { class: "big" } }).files["deck.mdx"]!;
    expect(kept).toContain("layout: section # a comment that must survive\nclass: big\n---");
  });

  test("a slide without frontmatter gets a block; emptying it removes the block", () => {
    const f = files({ "deck.mdx": DECK });
    apply(f, updateSlide(f, "s3", { patch: { layout: "center" } }));
    expect(f.texts["deck.mdx"]).toContain("---\nlayout: center\n---\n\n## Last");
    expect(readDeck(f).slides[3]!.frontmatter).toEqual({ layout: "center" });
    apply(f, updateSlide(f, 3, { patch: { layout: null } }));
    expect(f.texts["deck.mdx"]).toBe(DECK);
  });

  test("replacing the first slide's frontmatter keeps the deck settings", () => {
    const f = files({ "deck.mdx": DECK });
    const deckKeys = new Set(["title", "theme"]);
    apply(f, updateSlide(f, 0, { frontmatter: { layout: "center" } }, deckKeys));
    expect(readDeck(f).headmatter).toEqual({ title: "Edits", theme: "minimal", layout: "center" });
    expect(f.texts["deck.mdx"]).toContain("# the deck");
  });

  test("a deck with no headmatter gets one", () => {
    const f = files({ "deck.mdx": "# Plain\n\n---\n\n## Two\n" });
    apply(f, updateHeadmatter(f, { title: "Plain" }));
    expect(f.texts["deck.mdx"]).toBe("---\ntitle: Plain\n---\n\n# Plain\n\n---\n\n## Two\n");
    apply(f, updateHeadmatter(f, { theme: "rla", title: null }));
    expect(readDeck(f).headmatter).toEqual({ theme: "rla" });
  });

  test("notes are set and removed", () => {
    const f = files({ "deck.mdx": DECK });
    apply(f, setNotes(f, 3, "Say it. [click] Then this."));
    expect(f.texts["deck.mdx"]).toContain("- b\n\n<Notes>\nSay it. [click] Then this.\n</Notes>\n");
    expect(readDeck(f).slides[3]!.notes).toBe("Say it. [click] Then this.");
    apply(f, setNotes(f, 3, ""));
    expect(f.texts["deck.mdx"]).toBe(DECK);
  });
});

describe("adding, removing, moving", () => {
  test("add at the end, in the middle, vertically and as the first slide", () => {
    const f = files({ "deck.mdx": DECK });
    apply(f, addSlide(f, { content: "## End", frontmatter: { layout: "end" } }));
    expect(titles(f)).toEqual(["Edits", "Part one", "Beneath", "Last", "End"]);
    expect(f.texts["deck.mdx"]!.endsWith("- b\n\n---\nlayout: end\n---\n\n## End\n")).toBe(true);
    apply(f, addSlide(f, { content: "## Middle", notes: "N" }, 1));
    expect(titles(f)).toEqual(["Edits", "Middle", "Part one", "Beneath", "Last", "End"]);
    apply(f, addSlide(f, { content: "## Under" }, 3, true));
    const o = outlineDeck(f).slides;
    expect(o.map((s) => [s.title, s.h, s.v])).toEqual([
      ["Edits", 0, 0],
      ["Middle", 1, 0],
      ["Part one", 2, 0],
      ["Under", 2, 1],
      ["Beneath", 2, 2],
      ["Last", 3, 0],
      ["End", 4, 0],
    ]);
    const first = addSlide(f, { content: "# Before everything" }, 0);
    apply(f, first);
    // The first slide takes the headmatter (whose `title` is the deck's), so compare bodies.
    expect(
      readDeck(f)
        .slides.slice(0, 2)
        .map((s) => s.content.split("\n")[0]),
    ).toEqual(["# Before everything", "# Edits"]);
    expect(readDeck(f).headmatter.title).toBe("Edits");
    expect(first.notes.join(" ")).toContain("headmatter");
  });

  test("removing a stack's top slide hands its column to the slide beneath", () => {
    const f = files({ "deck.mdx": DECK });
    apply(f, removeSlide(f, 1));
    expect(outlineDeck(f).slides.map((s) => [s.title, s.h, s.v])).toEqual([
      ["Edits", 0, 0],
      ["Beneath", 1, 0],
      ["Last", 2, 0],
    ]);
  });

  test("removing and restoring the last slide round-trips", () => {
    const f = files({ "deck.mdx": DECK });
    apply(f, removeSlide(f, 3));
    apply(f, addSlide(f, { content: "## Last\n\n- a\n- b" }));
    expect(f.texts["deck.mdx"]).toBe(DECK);
  });

  test("move keeps the slide's text and frontmatter", () => {
    const f = files({ "deck.mdx": DECK });
    apply(f, moveSlide(f, 1, 3));
    expect(titles(f)).toEqual(["Edits", "Beneath", "Last", "Part one"]);
    expect(f.texts["deck.mdx"]).toContain(
      "---\nlayout: section # a comment that must survive\n---\n\n# Part one\n",
    );
    apply(f, moveSlide(f, 3, 1));
    expect(titles(f)).toEqual(["Edits", "Part one", "Beneath", "Last"]);
  });

  test("slides from an included file are edited in that file", () => {
    const f = files({
      "deck.mdx": "# Main\n\n---\nsrc: ./part.mdx\n---\n\n---\n\n# Tail\n",
      "part.mdx": "# P1\n\n---\n\n# P2\n",
    });
    expect(titles(f)).toEqual(["Main", "P1", "P2", "Tail"]);
    const r = updateSlide(f, 2, { content: "# P2 changed" });
    expect(Object.keys(r.files)).toEqual(["part.mdx"]);
    apply(f, r);
    expect(titles(f)).toEqual(["Main", "P1", "P2 changed", "Tail"]);
  });

  test("bad references say what exists", () => {
    const f = files({ "deck.mdx": DECK });
    expect(() => updateSlide(f, 9, { content: "x" })).toThrow(/has 4/);
    expect(() => removeSlide(f, "nope")).toThrow(/No slide/);
  });
});

describe("lint", () => {
  const lint = (deck: string, extra: Record<string, string> = {}, components = "") =>
    lintDeck({
      files: files({ "/d/deck.mdx": deck, ...extra }, "/d/deck.mdx"),
      root: "/d",
      extensions: readExtensions(components || null),
    });
  const codes = async (deck: string, extra?: Record<string, string>, components?: string) =>
    (await lint(deck, extra, components)).diagnostics.map(
      (d) => `${d.severity}:${d.code}:${d.line}`,
    );

  test("a clean deck", async () => {
    const r = await lint(DECK);
    expect(r).toMatchObject({ ok: true, errors: 0, slides: 4 });
  });

  test("frontmatter: unknown keys, wrong types, unknown layouts, backgrounds, transitions", async () => {
    const d = await codes(
      "---\ntitle: X\nthemee: rla\n---\n\n# A\n\n---\nlayout: two-col\nbackground: aurorra\nclicks: many\ntransition: wobble\n---\n\n# B\n",
    );
    expect(d).toEqual([
      "warning:frontmatter-unknown-key:2",
      "error:frontmatter-type:9",
      "error:layout-unknown:9",
      "error:background-unknown:9",
      "warning:transition-unknown:9",
    ]);
    const r = await lint("# A\n\n---\nlayout: two-col\n---\n\n# B\n");
    expect(r.diagnostics[0]!.hint).toContain('"two-cols"');
  });

  test("YAML, includes and MDX errors point at the file's own lines", async () => {
    const d = await codes(
      "# A\n\n---\nlayout: [x\n---\n\n# B\n\n---\nsrc: ./missing.mdx\n---\n\n---\n\n# C\n\n<div>\nopen\n",
    );
    expect(d).toEqual(["error:yaml:4", "error:include-missing:10", "error:mdx:17"]);
  });

  test("components: built in, the deck's own, imported, or an error", async () => {
    const deck =
      '# A\n\n<Poll id="p" question="q" />\n<Mine />\n<Theirs />\n<Pol />\n\n---\n\nimport { Chart } from \'./chart.tsx\'\n\n<Chart />\n';
    const d = await lint(deck, {}, "export const components = { Mine: () => null };");
    expect(d.diagnostics.map((x) => [x.code, x.line, x.message.slice(0, 9)])).toEqual([
      ["component-unknown", 5, "<Theirs> "],
      ["component-unknown", 6, "<Pol> is "],
    ]);
    expect(d.diagnostics[1]!.hint).toContain("<Col>");
  });

  test("assets must be in public/", async () => {
    const d = await codes(
      '# A\n\n![](/here.png)\n![](/gone.png)\n![](./local.png)\n<Image src="https://x.test/a.png" />\n',
      {
        "/d/public/here.png": "png",
        "/d/local.png": "png",
      },
    );
    expect(d).toEqual(["error:asset-missing:4", "error:asset-not-public:5"]);
  });

  test("live ids are unique; code meta is checked", async () => {
    const d = await codes(
      '<Poll id="a" question="q" />\n\n---\n\n<Quiz id="a" question="q" options={["x"]} correct={0} />\n\n---\n\n```ts {7}{lines:true,wrap:true}\nx\n```\n',
    );
    expect(d).toEqual(["error:live-id-duplicate:5", "warning:code-meta:9", "warning:code-meta:9"]);
  });

  test("glossary problems and unknown terms", async () => {
    const d = await codes("# A\n\n<Term>Nope</Term>\n", {
      "/d/glossary.yaml": "GIS:\n  full: x\n",
    });
    expect(d).toContain("warning:glossary:1");
    expect(d).toContain("warning:term-unknown:1");
  });

  test("the deck's own layouts and backgrounds count", async () => {
    const r = await lint(
      "# A\n\n---\nlayout: wide\nbackground: rain\n---\n\n# B\n",
      {},
      'export const components = { "layout:wide": W };\nregisterBackground("rain", Rain);',
    );
    expect(r.errors).toBe(0);
  });
});
