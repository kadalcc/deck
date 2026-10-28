import { describe, expect, test } from "bun:test";

import {
  type DeckFiles,
  EditError,
  addSlide,
  estimateClicks,
  lintDeck,
  moveSlide,
  outlineDeck,
  readDeck,
  readExtensions,
  removeSlide,
  replaceCode,
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

  test("replaceCode swaps one fence's body and nothing else", () => {
    const text =
      "# A\n\n  ```ts {monaco-write}\n  const a = 1\n  ```\n\n---\n\n# B\n\n```ts\nconst a = 1\n```\n";
    const f = files({ "/d/deck.mdx": text }, "/d/deck.mdx");
    const r = replaceCode(f, 0, "const a = 1", "const a = 2\nconst b = 3");
    expect(r.files["/d/deck.mdx"]).toBe(
      "# A\n\n  ```ts {monaco-write}\n  const a = 2\n  const b = 3\n  ```\n\n---\n\n# B\n\n```ts\nconst a = 1\n```\n",
    );
    expect(() => replaceCode(f, 0, "not there", "x")).toThrow(/changed since/);
    expect(() => replaceCode(f, 0, "const a = 1", "```\nboom")).toThrow(/close its fence/);
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

  test("the drawing options lint clean; a wrong one is named", async () => {
    const head = (d: string) => `---\ntitle: T\ndrawings:\n${d}---\n\n# One\n`;
    expect(
      await codes(head("  persist: files\n  perClick: true\n  enabled: dev\n  syncAll: false\n")),
    ).toEqual([]);
    expect((await codes(head("  persist: disk\n"))).length).toBeGreaterThan(0);
  });

  test("Slidev syntax that compiles but does nothing is a warning pointing at the importer", async () => {
    const r = await lint(
      '# A\n\n<div v-click>x</div>\n\n<v-clicks>\n\n- a\n\n</v-clicks>\n\n<img v-drag src="/a.png" />\n',
    );
    const slidev = r.diagnostics.filter((d) => d.code === "slidev-syntax");
    expect(slidev.map((d) => `${d.severity}:${d.line}`)).toEqual(["warning:3", "warning:5"]);
    expect(slidev[0]!.hint).toContain("kadal-deck import slidev");
  });

  test("slide settings with no closing --- are a warning at their line", async () => {
    const d = await codes("# A\n\n---\nbackground: spotlight\n\n## B\n");
    expect(d).toEqual(["warning:frontmatter-unclosed:4"]);
  });

  test("a pro/ layout set by defaults owns its slides' keys too", async () => {
    const md =
      "---\ntitle: X\ndefaults:\n  layout: pro/claim\n---\n\n# A\n\n---\nkicker: Stop 1\n---\n\n# B\n";
    expect(await codes(md)).toEqual([]);
  });

  test("reveal.js's options are known keys, with their types", async () => {
    const head = [
      "title: X",
      "preloadIframes: true",
      "respondToHashChanges: false",
      "keyboardCondition: focused",
      "autoSlide: false",
      "autoSlideMethod: next",
      "autoAnimateStyles: [opacity, color]",
      "scrollLayout: full",
      "parallaxBackgroundImage: /stars.jpg",
      'parallaxBackgroundSize: "2100px 900px"',
      "parallaxBackgroundHorizontal: 200",
      "parallaxBackgroundVertical: 50",
      "disableLayout: true",
      "postMessage: false",
      "postMessageEvents: true",
      "focusBodyOnPageVisibilityChange: false",
    ].join("\n");
    const slide = [
      "autoAnimate: true",
      "autoAnimateEasing: ease-out",
      "autoAnimateDuration: 0.4",
      "autoAnimateUnmatched: false",
    ].join("\n");
    expect(await codes(`---\n${head}\n---\n\n# A\n\n---\n${slide}\n---\n\n# B\n`)).toEqual([]);
    // A function is deck.config.ts's; in YAML only the plain forms are.
    const wrong = "---\ntitle: X\nscrollLayout: wide\nkeyboardCondition: always\n---\n\n# A\n";
    const r = await lint(wrong);
    expect(r.diagnostics.map((d) => [d.code, d.message.split(":")[0]])).toEqual([
      ["frontmatter-type", '"scrollLayout"'],
      ["frontmatter-type", '"keyboardCondition"'],
    ]);
  });

  test("a talk's date is a known headmatter key (listings sort by it)", async () => {
    expect(await codes("---\ntitle: X\ndate: 2026-10-11\n---\n\n# A\n")).toEqual([]);
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
    // `pro/` names belong to the host's library: no unknown layout, background or layout keys.
    const pro = await lint(
      "# A\n\n---\nlayout: pro/kpi-board\nbackground: pro/neon-drift\nperiod: Q3\n---\n\n# B\n",
    );
    expect(pro.diagnostics).toEqual([]);
    // A background 0.6 removed says where it went instead of guessing a near name.
    const gone = await lint("# A\n\n---\nbackground: signer\n---\n\n# B\n");
    expect(gone.diagnostics.map((d) => d.code)).toEqual(["background-unknown"]);
    expect(gone.diagnostics[0]!.hint).toBe(
      "`signer` was removed in Kadal Deck 0.6. Copy it into your deck: https://deck.kadal.cc/docs/backgrounds/#removed-in-06",
    );
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

  test("the code kit: snippets, code groups, notation, monaco, twoslash", async () => {
    const deck = [
      "# A", // 1
      "",
      "<<< @/snippets/a.ts#ask {1}{lines:true} [a.ts]", // 3
      "<<< @/snippets/gone.ts", // 4
      "<<< @/snippets/a.ts#nope", // 5
      "",
      "::code-group {clicks:true}", // 7
      "",
      "```sh [npm]",
      "npm i",
      "```",
      "",
      "::",
      "",
      "```ts {monaco-run}{autorun:false,showOutputAt:'+1',editorOptions:{wordWrap:'on'}}", // 15
      "console.log(1) // [!code ++]",
      "```",
      "",
      "```rust {monaco-run}", // 19
      "fn main() {}",
      "```",
      "",
      "```ts {monaco-diff}", // 23
      "a",
      "```",
      "",
      "```ts twoslash", // 27
      "const a = 1",
      "```",
      "",
      "```ts {1}{bogus:1}", // 31
      "a",
      "```",
      "",
      "````md",
      "<<< @/shown/only.ts",
      "````",
      "",
    ].join("\n");
    const d = await codes(deck, {
      "/d/snippets/a.ts": "// #region ask\nconst a = 1\n// #endregion ask\n",
    });
    expect(d).toEqual([
      "warning:snippet-missing:4",
      "warning:snippet-region:5",
      "info:code-runner:19",
      "warning:code-meta:23",
      "warning:code-meta:31",
    ]);
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

  // what the showcase taught the checker
  test("a commented key in components is still a key", async () => {
    const r = await lint(
      "# A\n\n---\nlayout: spotlight\neyebrow: Mine\n---\n\n# B\n",
      {},
      'export const components: Record<string, C> = {\n  How: How as C,\n  // picks `layout: spotlight`\n  "layout:spotlight": S as unknown as C,\n};',
    );
    expect(r.errors).toBe(0);
    expect(r.warnings).toBe(0); // `eyebrow` belongs to the deck's own layout
  });

  test("reveal.js's split transitions are known names", async () => {
    const r = await lint("# A\n\n---\ntransition: zoom-in fade-out\n---\n\n# B\n");
    expect(r.warnings).toBe(0);
  });
});

describe("check knows the deck's own code runners", () => {
  const runnerInfo = async (lang: string, extensions: ReturnType<typeof readExtensions>) =>
    (
      await lintDeck({
        files: files(
          { "/d/deck.mdx": `# A\n\n\`\`\`${lang} {monaco-run}\nx\n\`\`\`\n` },
          "/d/deck.mdx",
        ),
        root: "/d",
        extensions,
      })
    ).diagnostics.filter((d) => d.code === "code-runner").length;

  test("built-ins, setup/code-runners.ts keys and registerCodeRunner calls all count", async () => {
    const none = readExtensions(null);
    expect(await runnerInfo("TS", none)).toBe(0);
    expect(await runnerInfo("sql", none)).toBe(1);
    const setup = readExtensions(
      null,
      ['registerCodeRunner(["sh", "bash"], run);'],
      'import { defineCodeRunners } from "@kadal/deck";\nexport default defineCodeRunners({\n  // a comment\n  async sql(code) { return { text: code }; },\n  "c++": (code) => ({ text: code }),\n  ruby: run,\n});\n',
    );
    expect(setup.runners).toEqual(["sh", "bash", "sql", "c++", "ruby"]);
    for (const lang of ["sql", "c++", "ruby", "bash", "sh"])
      expect(await runnerInfo(lang, setup)).toBe(0);
    expect(await runnerInfo("go", setup)).toBe(1);
  });

  test("a setup file that builds its map in a function silences the note", async () => {
    const fn = readExtensions(null, [], "export default defineCodeRunners(async () => load());\n");
    expect(fn.runnersOpen).toBe(true);
    expect(await runnerInfo("go", fn)).toBe(0);
  });
});

describe("review regressions (PR #6)", () => {
  const THREE = "# A\n\n---\n\n## B\n\n---\n\n## C\n";

  test("content that would change the structure is refused, and nothing is returned", () => {
    const f = files({ "deck.mdx": THREE });
    expect(() => updateSlide(f, 1, { content: "## X\n\n```js\nconst a = 1;" })).toThrow(EditError);
    expect(() => updateSlide(f, 1, { content: "## X\n\n```js\nconst a = 1;" })).toThrow(
      /never closes/,
    );
    expect(() => updateSlide(f, 1, { content: "## X\n\n---\n\n## Y" })).toThrow(/new slide/);
    expect(() => addSlide(f, { content: "## X\n----\n## Y" })).toThrow(/new slide/);
    expect(() => setNotes(f, 1, "evil </Notes> # Heading")).toThrow(/<\/Notes>/);
    expect(() => addSlide(f, { content: "" })).toThrow(/content or frontmatter/);
    // A fence that holds a separator is fine.
    const ok = updateSlide(f, 1, { content: "## X\n\n```yaml\n---\na: 1\n---\n```" });
    expect(readDeck({ entry: "deck.mdx", read: (p) => ok.files[p] ?? null }).slides.length).toBe(3);
  });

  test("a frontmatter-only slide moved or added to the top stays a slide of its own", () => {
    const deck =
      "---\ntitle: X\n---\n\n# A\n\n---\nlayout: center\nbackground: aurora\n---\n\n---\n\n## C\n";
    const f = files({ "deck.mdx": deck });
    apply(f, moveSlide(f, 1, 0));
    const d = readDeck(f);
    expect(d.slides.length).toBe(3);
    expect(d.slides[0]!.frontmatter).toEqual({ layout: "center", background: "aurora" });
    expect(d.headmatter).toEqual({ title: "X" });
    expect(d.slides[1]!.content).toBe("# A");
    const g = files({ "deck.mdx": deck });
    apply(g, addSlide(g, { content: "", frontmatter: { layout: "end" } }, 0));
    expect(readDeck(g).slides.map((s) => s.frontmatter.layout ?? null)).toEqual([
      "end",
      null,
      "center",
      null,
    ]);
  });

  test("replacing the first slide's frontmatter keeps every deck setting, including title", () => {
    const f = files({
      "deck.mdx":
        "---\ntitle: T\ntheme: minimal\ntransition: fade\nlayout: cover\n---\n\n# A\n\n---\n\n## B\n",
    });
    apply(f, updateSlide(f, 0, { frontmatter: { layout: "center" } }));
    expect(readDeck(f).headmatter).toEqual({
      title: "T",
      theme: "minimal",
      transition: "fade",
      layout: "center",
    });
  });

  test("<Notes> inside a code fence is code, not notes", () => {
    const deck =
      "# A\n\n---\n\n## Syntax\n\n```mdx\n<Notes>\nexample\n</Notes>\n```\n\n---\n\n## C\n";
    const f = files({ "deck.mdx": deck });
    expect(readDeck(f).slides[1]!.notes).toBeNull();
    expect(readDeck(f).slides[1]!.content).toContain("<Notes>\nexample\n</Notes>");
    apply(f, setNotes(f, 1, "real"));
    expect(readDeck(f).slides[1]!.notes).toBe("real");
    expect(f.texts["deck.mdx"]).toContain("```mdx\n<Notes>\nexample\n</Notes>\n```");
  });

  test("line endings are kept per line in a mixed file", () => {
    const deck = "# A\r\n\r\n---\n\n## B\n\n---\r\n\r\n## C\r\n";
    const r = updateSlide(files({ "deck.mdx": deck }), 0, { content: "# Z" });
    expect(r.files["deck.mdx"]!.endsWith("---\n\n## B\n\n---\r\n\r\n## C\r\n")).toBe(true);
  });

  test("an explicit id wins over a generated one", () => {
    const f = files({ "deck.mdx": "# A\n\n---\nid: s0\n---\n\n## B\n" });
    expect(updateSlide(f, "s0", { content: "## B2" }).index).toBe(1);
  });

  test("lint: includes may not leave the deck folder; unknown props warn", async () => {
    const r = await lintDeck({
      files: files(
        {
          "/d/deck.mdx":
            '# A\n\n---\nsrc: ../outside.mdx\n---\n\n---\n\n<Poll id="p" question="q" bogusProp="x" />\n<Click effect="fade-up" data-x="1" anyThing />\n',
          "/outside.mdx": "# Out",
        },
        "/d/deck.mdx",
      ),
      root: "/d",
    });
    expect(r.diagnostics.map((d) => `${d.severity}:${d.code}:${d.line}`)).toEqual([
      "error:include-outside:4",
      "warning:prop-unknown:9",
    ]);
    expect(r.diagnostics[0]!.message).toBe(
      '"../outside.mdx" is outside the deck folder; includes must stay inside it',
    );
  });
});
