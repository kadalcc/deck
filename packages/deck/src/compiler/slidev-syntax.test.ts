import { describe, expect, test } from "bun:test";
import { compile } from "@mdx-js/mdx";
import { createHighlighter } from "shiki";

import { compileDeck } from "../runtime/compile.ts";
import { buildMatcher, DEFAULT_GLOSSARY } from "../glossary/model.ts";
import { blankHtmlComments, htmlComments } from "./comments.ts";
import { braceGroups, parseLoose } from "./loose-object.ts";
import { type MdxPipelineOptions, mdxPlugins, prepareDeck } from "./pipeline.ts";
import { encodePlantUml, plantUmlBase64, plantUmlUrl, storedDeflate } from "./plantuml.ts";
import { katexOptions, slideDefaults } from "./setup.ts";
import { deckStylesheet, extractStyles, scopeCss, splitSelectors } from "./slide-style.ts";
import { notesBlocks, parseSlideRange, splitDeck } from "./split.ts";

const highlighter = await createHighlighter({
  themes: ["github-light", "github-dark"],
  langs: ["ts"],
});

async function mdx(source: string, extra: Partial<MdxPipelineOptions> = {}): Promise<string> {
  const warnings: string[] = [];
  const out = await compile(source, {
    ...mdxPlugins({
      highlighter,
      themes: { light: "github-light", dark: "github-dark" },
      glossary: { options: DEFAULT_GLOSSARY, entries: [], matcher: buildMatcher([]) },
      terms: null,
      math: (t) => t,
      warn: (m) => warnings.push(m),
      ...extra,
    }),
    outputFormat: "function-body",
    providerImportSource: "@kadal/deck/mdx-provider",
  });
  return `${String(out)}\n/* warnings: ${JSON.stringify(warnings)} */`;
}

describe("HTML-comment speaker notes", () => {
  test("the comment block at the end of a slide is its notes; others are blanked", () => {
    const { slides } = splitDeck(
      `# One

<!-- Not a note: it is not at the end. -->

The first page

<!--
This is the **note**.

[click] And this lights up with the first click.
-->

---

# Two

\`<!-- inline code stays -->\`

\`\`\`html
<!-- fenced code stays -->
\`\`\`
`,
      { file: "deck.mdx" },
    );
    expect(slides[0]!.notes).toBe(
      "This is the **note**.\n\n[click] And this lights up with the first click.",
    );
    expect(slides[0]!.content).not.toContain("<!--");
    expect(slides[0]!.content).toContain("The first page");
    // Line numbers survive: the blanked comment keeps its line.
    expect(slides[0]!.content.split("\n")[2]!.trim()).toBe("");
    expect(slides[1]!.notes).toBeNull();
    expect(slides[1]!.content).toContain("`<!-- inline code stays -->`");
    expect(slides[1]!.content).toContain("<!-- fenced code stays -->");
  });

  test("several trailing comments, and <Notes>, combine in order", () => {
    const { slides } = splitDeck(
      `# Mixed\n\n<Notes>First, from Notes.</Notes>\n\nBody text.\n\n<!-- Second. -->\n\n<!-- Third. -->\n`,
      { file: "deck.mdx" },
    );
    expect(slides[0]!.notes).toBe("First, from Notes.\n\nSecond.\n\nThird.");
    expect(slides[0]!.content).toContain("Body text.");
    expect(slides[0]!.content).not.toContain("Second");
  });

  test("a comment followed by <Notes> at the end is still trailing", () => {
    const blocks = notesBlocks(`Text\n\n<!-- a -->\n<Notes>b</Notes>\n`);
    expect(blocks.map((b) => b.kind)).toEqual(["comment", "notes"]);
  });

  test("an unclosed comment runs to the end and reads as notes", () => {
    const { slides } = splitDeck(`# T\n\n<!--\nForgot to close\n`, { file: "deck.mdx" });
    expect(slides[0]!.notes).toBe("Forgot to close");
  });

  test("comments inside <Notes> are dropped from the notes", () => {
    const { slides } = splitDeck(`# T\n\n<Notes>Say <!-- hidden --> this.</Notes>\n`, {
      file: "deck.mdx",
    });
    expect(slides[0]!.notes!.replace(/\s+/g, " ")).toBe("Say this.");
  });

  test("blankHtmlComments keeps code and line count", () => {
    const t = "a <!-- x -->\n```\n<!-- y -->\n```\n<!--\nz\n-->";
    const out = blankHtmlComments(t);
    expect(out.split("\n")).toHaveLength(t.split("\n").length);
    expect(out).toContain("<!-- y -->");
    expect(out).not.toContain("<!-- x");
    expect(htmlComments(t)).toHaveLength(2);
  });

  test("both compilers: notes and notesText from comments; the slide compiles", async () => {
    const out = await compileDeck(
      `# Hello\n\n<!-- mid comment -->\n\nWords.\n\n<!--\nSpeak. [click] Then this.\n-->\n`,
    );
    expect(out.diagnostics).toEqual([]);
    const s = out.manifest.slides[0]!;
    expect(s.hasNotes).toBe(true);
    expect(s.notesText).toBe("Speak. [click] Then this.");
    expect(typeof (await s.loadNotes!()).default).toBe("function");
  });

  test("Slidev notes that are not MDX still compile, as Markdown", async () => {
    const out = await compileDeck(`# Hi\n\n<!--\nA line<br>with { braces }\n-->\n`);
    expect(out.ok).toBe(true);
    expect(out.manifest.slides[0]!.hasNotes).toBe(true);
    expect(
      out.diagnostics.some((d) => d.severity === "warning" && /plain Markdown/.test(d.message)),
    ).toBe(true);
  });
});

describe("block frontmatter", () => {
  const text = `---
theme: minimal
---

# Slide 1

---

\`\`\`yaml
layout: center
class: big
\`\`\`

# Slide 2

---

\`\`\`yaml [ci.yml]
on: push
\`\`\`

# Slide 3
`;
  test("a ```yaml fence first in a slide is its frontmatter", () => {
    const { slides } = splitDeck(text, { file: "deck.mdx" });
    expect(slides).toHaveLength(3);
    expect(slides[1]!.frontmatter).toEqual({ layout: "center", class: "big" });
    expect(slides[1]!.content.startsWith("# Slide 2")).toBe(true);
    const r = slides[1]!.range;
    const lines = text.split("\n");
    expect(lines[r.start]).toBe("---");
    expect(r.frontmatter).toEqual({ open: 8, close: 11, block: true });
    expect(lines[r.frontmatter!.open]).toBe("```yaml");
    expect(lines[r.frontmatter!.close]).toBe("```");
    expect(lines[r.body - 1]).toBe("```");
    expect(slides[1]!.source.line).toBe(13);
  });

  test("a fence with a title or highlights is code to show", () => {
    const { slides } = splitDeck(text, { file: "deck.mdx" });
    expect(slides[2]!.frontmatter).toEqual({});
    expect(slides[2]!.content).toContain("```yaml [ci.yml]");
  });

  test("bad YAML in a block is reported at its line", () => {
    const errors: Array<{ line: number }> = [];
    splitDeck(`# A\n\n---\n\n\`\`\`yaml\nlayout: [\n\`\`\`\n\n# B\n`, {
      file: "deck.mdx",
      onError: (e) => errors.push(e),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.line).toBeGreaterThanOrEqual(6);
  });
});

describe("defaults headmatter", () => {
  test("every slide gets the defaults unless it sets the key; theme layers sit beneath", () => {
    const deck = prepareDeck(
      `---\ndefaults:\n  layout: center\n  transition: fade\n---\n\n# One\n\n---\nlayout: cover\n---\n\n# Two\n`,
      { file: "deck.mdx", defaults: { class: "from-theme", layout: "theme-layout" } },
    );
    expect(deck.slides[0]!.frontmatter.layout).toBe("center");
    expect(deck.slides[0]!.frontmatter.class).toBe("from-theme");
    expect(deck.slides[1]!.frontmatter).toMatchObject({ layout: "cover", transition: "fade" });
    expect(slideDefaults({ defaults: { a: 1 } }, { a: 0, b: 2 })).toEqual({ a: 1, b: 2 });
  });
});

describe("src slide ranges", () => {
  const more = ["# M1", "# M2", "# M3", "# M4", "# M5", "# M6", "# M7"].join("\n\n---\n\n");
  const read = (path: string) => (path === "./more.mdx" ? { file: "more.mdx", text: more } : null);
  const titles = (src: string, onError?: (e: { message: string }) => void) =>
    splitDeck(`# Main\n\n---\nsrc: ${src}\nclass: merged\n---\n`, {
      file: "deck.mdx",
      resolveInclude: read,
      onError,
    }).slides.map((s) => s.content);

  test("#2-5 and #1,3,5-7 pick those slides", () => {
    expect(titles("./more.mdx#2-5")).toEqual(["# Main", "# M2", "# M3", "# M4", "# M5"]);
    expect(titles("./more.mdx#1,3,5-7")).toEqual([
      "# Main",
      "# M1",
      "# M3",
      "# M5",
      "# M6",
      "# M7",
    ]);
    expect(titles("./more.mdx#6-")).toEqual(["# Main", "# M6", "# M7"]);
    expect(titles("./more.mdx")).toHaveLength(8);
  });

  test("the including frontmatter merges into the first picked slide only", () => {
    const { slides } = splitDeck(`# Main\n\n---\nsrc: ./more.mdx#3-4\nclass: merged\n---\n`, {
      file: "deck.mdx",
      resolveInclude: read,
    });
    expect(slides[1]!.frontmatter).toEqual({ class: "merged" });
    expect(slides[2]!.frontmatter).toEqual({});
    expect(slides[1]!.range.includedBy).toMatchObject({ file: "deck.mdx" });
  });

  test("a bad range is a problem with its reason; the valid parts still count", () => {
    const problems: string[] = [];
    const got = titles("./more.mdx#2,x,9", (e) => problems.push(e.message));
    expect(got).toEqual(["# Main", "# M2"]);
    expect(problems.join("\n")).toContain('"x" is not a slide number');
    expect(problems.join("\n")).toContain("slide 9 does not exist");
    expect(parseSlideRange("5-2", 7).problems[0]).toContain("runs backwards");
    expect(parseSlideRange("0", 7).problems[0]).toContain("from 1");
    expect(() => titles("./more.mdx#x")).toThrow(/not a slide number/);
  });

  test("a circular include is reported, not a stack overflow", () => {
    const problems: string[] = [];
    splitDeck(`# A\n\n---\nsrc: ./b.mdx\n---\n`, {
      file: "a.mdx",
      resolveInclude: (p) =>
        p === "./b.mdx"
          ? { file: "b.mdx", text: "# B\n\n---\nsrc: ./a.mdx\n---\n" }
          : { file: "a.mdx", text: "# A\n\n---\nsrc: ./b.mdx\n---\n" },
      onError: (e) => problems.push(e.message),
    });
    expect(problems[0]).toContain("circular include");
  });

  test("the runtime compiler resolves a ranged include from its files", async () => {
    const out = await compileDeck(`# Main\n\n---\nsrc: ./more.mdx#2\n---\n`, {
      files: { "more.mdx": more },
    });
    expect(out.ok).toBe(true);
    expect(out.manifest.slides.map((s) => s.title)).toEqual(["Main", "M2"]);
  });
});

describe("slide-scoped <style>", () => {
  test("styles are lifted out, lines kept; global is flagged", () => {
    const { content, styles } = extractStyles(
      "# Red\n\n<style>\nh1 { color: red; }\n</style>\n\n<style global>\n.x { color: blue }\n</style>\n\n```html\n<style>.code{}</style>\n```",
    );
    expect(styles).toHaveLength(2);
    expect(styles[0]).toMatchObject({ global: false, line: 2 });
    expect(styles[1]!.global).toBe(true);
    expect(content).not.toContain("color: red");
    expect(content).toContain("<style>.code{}</style>");
    expect(content.split("\n")).toHaveLength(13);
  });

  test("selectors are scoped; at-rules hoisted or recursed", () => {
    const S = '.deck-slide[data-index="2"]';
    const out = scopeCss(
      `@import url("x.css");
color: navy;
h1, .a > .b:is(.c, .d) { color: red; strong { color: teal; } }
:scope { background: black }
@media (min-width: 10px) { p { margin: 0 } }
@keyframes spin { from { transform: rotate(0) } to { transform: rotate(1turn) } }
@font-face { font-family: X; src: url(x.woff2); }
/* a } in a comment */
a[title="x, y { }"] { color: green }`,
      S,
    );
    expect(out.imports).toEqual(['@import url("x.css");']);
    expect(out.hoisted.join("\n")).toContain("@keyframes spin");
    expect(out.hoisted.join("\n")).toContain("@font-face");
    const rules = out.rules.join("\n");
    expect(rules).toContain(`${S} {\n  color: navy;\n}`);
    expect(rules).toContain(
      `${S} h1,\n${S} .a > .b:is(.c, .d) { color: red; strong { color: teal; } }`,
    );
    expect(rules).toContain(`${S} { background: black }`);
    expect(rules).toContain(`@media (min-width: 10px) {\n${S} p { margin: 0 }\n}`);
    expect(rules).toContain(`${S} a[title="x, y { }"] { color: green }`);
    expect(splitSelectors('a, b:is(c, d), [x="1,2"]')).toEqual(["a", "b:is(c, d)", '[x="1,2"]']);
    // Page-level parts stay ancestors (Vue's scoped CSS reads them so too).
    const page = scopeCss(
      'html.dark h1 { color: white } .dark p { color: grey } :root { --x: 1 } html[data-color-scheme="dark"] { color: red } body > h2 { margin: 0 }',
      S,
    ).rules.join("\n");
    expect(page).toContain(`html.dark ${S} h1 { color: white }`);
    expect(page).toContain(`.dark ${S} p { color: grey }`);
    expect(page).toContain(`${S} { --x: 1 }`);
    expect(page).toContain(`html[data-color-scheme="dark"] ${S} { color: red }`);
    expect(page).toContain(`${S} h2 { margin: 0 }`);
  });

  test("an inline `<style>` in prose does not hide a real block after it", () => {
    const { styles, content } = extractStyles(
      "A `<style>` tag.\n\n<style>\nh1 { color: red }\n</style>\n",
    );
    expect(styles).toHaveLength(1);
    expect(styles[0]!.css.trim()).toBe("h1 { color: red }");
    expect(content).toContain("A `<style>` tag.");
  });

  test("the deck stylesheet puts imports first and leaves global CSS alone", () => {
    const css = deckStylesheet([
      { index: 0, styles: [{ css: "h1 { color: red }", global: false, line: 0 }] },
      {
        index: 1,
        styles: [{ css: '@import "y.css";\n.everywhere { color: blue }', global: true, line: 0 }],
      },
    ]);
    expect(css.startsWith('@import "y.css";')).toBe(true);
    expect(css).toContain('.deck-slide[data-index="0"] h1 { color: red }');
    expect(css).toContain(".everywhere { color: blue }");
  });

  test("both compilers: the manifest carries the scoped sheet and the slide compiles", async () => {
    const out = await compileDeck(`# Red\n\n<style>\nh1 { color: red; }\n</style>\n`);
    expect(out.ok).toBe(true);
    expect(out.manifest.styles).toContain('.deck-slide[data-index="0"] h1 { color: red; }');
  });
});

describe("loose fence options", () => {
  test("parses JavaScript object literals without evaluating them", () => {
    expect(parseLoose("{theme: 'neutral', scale: 0.8}")).toEqual({ theme: "neutral", scale: 0.8 });
    expect(parseLoose('{"a": [1, -2, true, null], b: {c: "d",},}')).toEqual({
      a: [1, -2, true, null],
      b: { c: "d" },
    });
    expect(() => parseLoose("{a: alert(1)}")).toThrow(/Expected a value/);
    expect(braceGroups("{1|3|all} {at: 2, s: '}'}")).toEqual(["{1|3|all}", "{at: 2, s: '}'}"]);
  });
});

describe("```mermaid fences", () => {
  test("render through <Mermaid> with Slidev's options", async () => {
    const js = await mdx(
      "```mermaid {theme: 'neutral', scale: 0.8, look: 'handDrawn'}\ngraph TD\nA-->B\n```\n",
    );
    expect(js).toContain("_jsx(Mermaid, {");
    expect(js).toContain('code: "graph TD\\nA-->B"');
    expect(js).toContain('theme: "neutral"');
    expect(js).toContain("scale: 0.8");
    expect(js).toContain('"look": "handDrawn"');
    expect(js).not.toContain("language-mermaid");
  });

  test("an unknown option warns, a broken one too, and the diagram still renders", async () => {
    const js = await mdx(
      "```mermaid {sacle: 2}\ngraph TD\n```\n\n```mermaid {theme: }\ngraph LR\n```\n",
    );
    expect(js).toContain('Unknown mermaid option \\"sacle\\"');
    expect(js).toContain("options do not parse");
    expect(js.match(/_jsx\(Mermaid/g)).toHaveLength(2);
  });
});

describe("```plantuml fences", () => {
  test("PlantUML's encoding matches the reference encoder", async () => {
    // PlantUML's alphabet: 0xFB 0xFF 0x00 → 62, 63, 60, 0 → "-", "_", "y", "0".
    expect(plantUmlBase64(new Uint8Array([0xfb, 0xff, 0x00]))).toBe("-_y0");
    const stored = storedDeflate(new TextEncoder().encode("A -> B"));
    expect(Array.from(stored.slice(0, 5))).toEqual([1, 6, 0, 0xf9, 0xff]);
    const encoded = await encodePlantUml("@startuml\nAlice -> Bob : Hello!\n@enduml");
    expect(encoded).toMatch(/^[0-9A-Za-z_-]+$/);
    // Round trip through the platform's inflate proves it is real DEFLATE.
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
    const bytes: number[] = [];
    for (let i = 0; i < encoded.length; i += 4) {
      const [a, b, c, d] = encoded
        .slice(i, i + 4)
        .split("")
        .map((ch) => alphabet.indexOf(ch));
      bytes.push((a! << 2) | (b! >> 4), ((b! & 15) << 4) | (c! >> 2), ((c! & 3) << 6) | d!);
    }
    const ds = new DecompressionStream("deflate-raw");
    const w = ds.writable.getWriter();
    void w.write(new Uint8Array(bytes));
    void w.close();
    const text = await new Response(ds.readable).text().catch(async () => "");
    expect(text.replace(/\0+$/, "")).toContain("Alice -> Bob : Hello!");
    expect(await plantUmlUrl("x", "https://example.com/plantuml/")).toMatch(
      /^https:\/\/example\.com\/plantuml\/svg\/[0-9A-Za-z_-]+$/,
    );
  });

  test("a fence renders as an image from the deck's server", async () => {
    const js = await mdx(
      "```plantuml {alt: 'Login', scale: 0.5}\n@startuml\nA -> B\n@enduml\n```\n",
      {
        plantUmlServer: "https://uml.example.com",
      },
    );
    expect(js).toMatch(/src: "https:\/\/uml\.example\.com\/svg\/[0-9A-Za-z_-]+"/);
    expect(js).toContain('alt: "Login"');
    expect(js).toContain('loading: "eager"');
    expect(js).toContain('"zoom": 0.5');
  });
});

describe("$$ {1|3|all} maths lines", () => {
  test("display maths with steps wraps in <KatexLines>, KaTeX inside", async () => {
    const js = await mdx(
      "$$ {1|3|all} {at: 2}\n\\begin{aligned}\na &= 1 \\\\\nb &= 2 \\\\\nc &= 3\n\\end{aligned}\n$$\n",
    );
    expect(js).toContain("_jsx(KatexLines, {");
    expect(js).toContain('steps: "1|3|all"');
    expect(js).toContain("at: 2");
    expect(js).toContain("katex-display");
  });

  test("macros from the setup and the headmatter reach KaTeX", async () => {
    const katex = katexOptions(
      { katex: { macros: { "\\RR": "\\mathbb{R}" } } },
      { katex: { macros: { "\\NN": "\\mathbb{N}" } } },
    );
    expect(katex.macros).toEqual({ "\\NN": "\\mathbb{N}", "\\RR": "\\mathbb{R}" });
    const js = await mdx("$\\RR$", { katex });
    expect(js).toContain("mathbb");
    expect(js).not.toContain("katex-error");
  });
});

describe("notes auto-ruby", () => {
  test("words in the notes get their reading", async () => {
    const js = await mdx("私は日本語を勉強しています。`日本語`", {
      ruby: { 日本語: "ni hon go", 勉強: "べんきょう" },
    });
    expect(js).toContain(
      '_jsxs(_components.ruby, {\n      children: ["日本語", _jsx(_components.rt, {\n        children: "ni hon go"',
    );
    expect(js).toContain("べんきょう");
    // Inline code is left alone.
    expect(js).toContain('children: "日本語"\n    })');
  });

  test("the runtime compiler reads notesAutoRuby from the headmatter, for notes only", async () => {
    const out = await compileDeck(
      `---\nnotesAutoRuby:\n  日本語: ni hon go\n---\n\n# 日本語\n\n<!-- 日本語 -->\n`,
    );
    expect(out.ok).toBe(true);
    expect(out.manifest.slides[0]!.notesText).toBe("日本語");
  });
});

describe("--without-notes", () => {
  test("no notes, hasNotes false, notesText null", async () => {
    const out = await compileDeck(
      `# A\n\n<Notes>secret</Notes>\n\n---\n\n# B\n\n<!-- also secret -->\n`,
      {
        withoutNotes: true,
      },
    );
    for (const s of out.manifest.slides) {
      expect(s.hasNotes).toBe(false);
      expect(s.notesText).toBeNull();
      expect(s.loadNotes).toBeNull();
    }
  });
});

describe("setup hooks in the runtime compiler", () => {
  test("remark and rehype plugins and preprocess run", async () => {
    const seen: string[] = [];
    const out = await compileDeck(`# @@TITLE@@\n`, {
      preprocess: (t) => t.replace("@@TITLE@@", "Replaced"),
      remarkPlugins: [() => () => void seen.push("remark")],
      rehypePlugins: [() => () => void seen.push("rehype")],
      mermaid: { theme: "forest" },
    });
    expect(out.manifest.slides[0]!.title).toBe("Replaced");
    expect(seen).toContain("remark");
    expect(seen).toContain("rehype");
    expect(out.manifest.headmatter.mermaid).toEqual({ theme: "forest" });
  });
});
