import { describe, expect, test } from "bun:test";
import { compile } from "@mdx-js/mdx";
import { createHighlighter } from "shiki";

import { applyCodeGroups } from "./code-groups.ts";
import { linesOn, parseCodeMeta, parseLooseObject } from "./code-meta.ts";
import { diffLines, splitDiffSource } from "./diff-lines.ts";
import { deckGlossary, mdxPlugins, prepareDeck } from "./pipeline.ts";
import { applySlots } from "./slots.ts";
import {
  expandSnippets,
  extractRegion,
  langOfPath,
  parseSnippetLine,
  regionMarker,
  replaceRegion,
} from "./snippets.ts";
import { notationTransformers } from "./transformers.ts";

const themes = { light: "github-light", dark: "github-dark" };
const highlighter = await createHighlighter({
  themes: ["github-light", "github-dark"],
  langs: ["ts", "sh", "python"],
});
const glossary = deckGlossary({}, () => null);

async function html(mdx: string, extra: Partial<Parameters<typeof mdxPlugins>[0]> = {}) {
  const out = await compile(mdx, {
    ...mdxPlugins({
      highlighter,
      themes,
      glossary,
      terms: null,
      math: (t) => t,
      warn: () => {},
      transformers: notationTransformers(),
      ...extra,
    }),
    jsx: true,
    development: false,
  });
  return String(out);
}

describe("code meta", () => {
  test("reads reveal.js's bracket form as steps and an offset, not a title", () => {
    const set = (...n: number[]) => new Set(n);
    const a = parseCodeMeta("[1-2|3]");
    expect([a.title, a.lines, a.startLine, a.steps]).toEqual([null, true, 1, [set(1, 2), set(3)]]);
    // reveal counts from the block's first line; Kadal's steps name the numbers shown.
    const b = parseCodeMeta("[712: 1-2|3]");
    expect([b.title, b.startLine, b.steps]).toEqual([null, 712, [set(712, 713), set(714)]]);
    expect(b.revealBrackets).toBe(true);
    const c = parseCodeMeta("[712:]");
    expect([c.startLine, c.steps, c.lines]).toEqual([712, null, true]);
    // A title needs a letter in it; a title beside the steps stays one.
    expect(parseCodeMeta("[app.ts]").title).toBe("app.ts");
    expect(parseCodeMeta("[app.ts] [2|3]")).toMatchObject({ title: "app.ts", lines: true });
    expect(parseCodeMeta("[]").lines).toBe(false);
  });

  test("reveal's attribute form counts from the block's first line too", () => {
    const m = parseCodeMeta('data-line-numbers="1|3" data-ln-start-from="10"');
    expect(m.steps).toEqual([new Set([10]), new Set([12])]);
  });

  test("a fence's {lines:false} reaches the runtime; silence leaves it to the deck", async () => {
    expect(await html("```ts {lines:false}\nx\n```")).toContain('data-lines="false"');
    expect(await html("```ts\nx\n```")).not.toContain("data-lines");
    expect(await html("```ts [3: 1]\nx\n```")).toContain('data-start="3"');
  });

  test("a block's own lines option wins over the deck's lineNumbers", () => {
    expect([linesOn("true", false), linesOn("false", true), linesOn(undefined, true)]).toEqual([
      true,
      false,
      true,
    ]);
    expect(linesOn(undefined, false)).toBe(false);
  });

  test("reads nested options, monaco directives and twoslash", () => {
    const m = parseCodeMeta(
      "{monaco-run} {autorun:false, showOutputAt:'+1', editorOptions:{wordWrap:'on'}} [demo.ts]",
    );
    expect(m.monaco).toBe("run");
    expect(m.title).toBe("demo.ts");
    expect(m.options).toEqual({
      autorun: false,
      showOutputAt: "+1",
      editorOptions: { wordWrap: "on" },
    });
    expect(m.steps).toBeNull();
    expect(parseCodeMeta("twoslash").twoslash).toBe(true);
    expect(parseCodeMeta("{monaco}").monaco).toBe("editor");
    expect(parseCodeMeta("{monaco-diff}").monaco).toBe("diff");
    expect(parseCodeMeta("{monaco-write}").monaco).toBe("write");
  });

  test("keeps the old forms working", () => {
    const m = parseCodeMeta("{2-3|5}{lines:true,startLine:7,maxHeight:'200px'} [app.ts]");
    expect(m.steps).toHaveLength(2);
    expect(m.lines).toBe(true);
    expect(m.startLine).toBe(7);
    expect(m.maxHeight).toBe("200px");
    expect(m.words).toEqual([]);
  });

  test("a loose object: bare strings, numbers, arrays, quotes", () => {
    expect(parseLooseObject("a:200px, b: 3, c:[1,'x'], d:\"q,w\", e:null, f:true")).toEqual({
      a: "200px",
      b: 3,
      c: [1, "x"],
      d: "q,w",
      e: null,
      f: true,
    });
  });

  test("words the meta does not understand are kept for the linter", () => {
    expect(parseCodeMeta("{1} frobnicate").words).toEqual(["frobnicate"]);
  });
});

describe("notation transformers", () => {
  test("mark lines and words, and drop the comments", async () => {
    const out = await html(
      "```ts\nconst a = 1 // [!code --]\nconst b = 2 // [!code ++]\nconst c = 3 // [!code highlight]\nconst d = 4 // [!code focus]\nthrow e // [!code error]\n// [!code word:tide]\nconst tide = 1\n```",
    );
    expect(out).toContain("diff remove");
    expect(out).toContain("diff add");
    expect(out).toContain("highlighted");
    expect(out).toContain("focused");
    expect(out).toContain("highlighted error");
    expect(out).toContain("highlighted-word");
    expect(out).toContain("has-diff");
    expect(out).toContain("has-focused");
    expect(out).not.toContain("[!code");
  });

  test("coexist with click steps", async () => {
    const out = await html("```ts {1|2}\nconst a = 1 // [!code ++]\nconst b = 2\n```");
    expect(out).toContain('data-steps="1|2"');
    expect(out).toContain("diff add");
  });

  test("a deck's own transformer runs on every block", async () => {
    const out = await html("```ts\nconst a = 1\n```", {
      transformers: [
        ...notationTransformers(),
        {
          name: "mine",
          pre(el) {
            this.addClassToHast(el, "has-mine");
          },
        },
      ],
    });
    expect(out).toContain("has-mine");
  });
});

describe("twoslash", () => {
  test("without TwoSlash the block renders plain and says so", async () => {
    let told = 0;
    const out = await html("```ts twoslash\n// @errors: 2322\nconst a = 1\n//    ^?\n```", {
      twoslash: null,
      onTwoslashMissing: () => told++,
    });
    expect(told).toBe(1);
    expect(out).not.toContain("^?");
    expect(out).not.toContain("@errors");
    expect(out).toContain('data-twoslash="true"');
  });
});

describe("monaco blocks", () => {
  test("carry their source, options and a static face", async () => {
    const out = await html("```ts {monaco-run}{autorun:false}\nconsole.log(1)\n```");
    expect(out).toContain('data-monaco="run"');
    expect(out).toContain('data-code="console.log(1)"');
    expect(out).toContain('data-monaco-options="{&quot;autorun&quot;:false}"');
  });

  test("a diff has both sides, and its static face is a line diff", async () => {
    const out = await html(
      "```ts {monaco-diff}\nconst a = 1\nconst b = 2\n~~~\nconst a = 1\nconst b = 3\n```",
    );
    expect(out).toContain('data-monaco="diff"');
    expect(out).toContain('data-original="const a = 1\nconst b = 2"');
    expect(out).toContain("diff remove");
    expect(out).toContain("diff add");
  });

  test("diffLines and the ~~~ separator", () => {
    expect(splitDiffSource("a\n~~~\nb")).toEqual({ original: "a", modified: "b" });
    expect(diffLines("a\nb\nc", "a\nx\nc").map((o) => o.kind)).toEqual([
      "same",
      "remove",
      "add",
      "same",
    ]);
  });
});

describe("snippets", () => {
  const file = [
    "import x from 'y'",
    "// #region ask",
    "  function ask(q: string) {",
    "    // #region inner",
    "    return q",
    "    // #endregion inner",
    "  }",
    "// #endregion ask",
    "# region py",
    "print(1)",
    "# endregion py",
    "<!-- #region html -->",
    "<p>hi</p>",
    "<!-- #endregion html -->",
    "/* #region css */",
    "a { color: red }",
    "/* #endregion css */",
    "#region cs",
    "var a = 1;",
    "#endregion",
  ].join("\n");

  test("region markers in any comment style", () => {
    expect(regionMarker("// #region ask")).toEqual({ end: false, name: "ask" });
    expect(regionMarker("<!-- #endregion html -->")).toEqual({ end: true, name: "html" });
    expect(regionMarker("const region = 1")).toBeNull();
    expect(regionMarker("// a region of interest")).toBeNull();
    expect(extractRegion(file, "py")!.code).toBe("print(1)");
    expect(extractRegion(file, "html")!.code).toBe("<p>hi</p>");
    expect(extractRegion(file, "css")!.code).toBe("a { color: red }");
    expect(extractRegion(file, "cs")!.code).toBe("var a = 1;");
  });

  test("a region is dedented and loses its inner markers", () => {
    const r = extractRegion(file, "ask")!;
    expect(r.code).toBe("function ask(q: string) {\n  return q\n}");
    expect(r.nested).toBe(true);
    expect(extractRegion(file, "nope")).toBeNull();
  });

  test("a save puts the region back, re-indented", () => {
    const text = "a\n  // #region r\n  one\n  // #endregion r\nb\n";
    expect(replaceRegion(text, "r", "two\nthree")).toBe(
      "a\n  // #region r\n  two\n  three\n  // #endregion r\nb\n",
    );
    expect(replaceRegion(text, null, "whole")).toBe("whole\n");
    expect(replaceRegion(file, "ask", "x")).toBeNull(); // nested markers: refused
  });

  test("the <<< line: path, region, language, meta", () => {
    expect(parseSnippetLine("<<< @/snippets/a.ts#ask {2,3|5}{lines:true} [a.ts]")).toEqual({
      spec: "@/snippets/a.ts#ask",
      path: "snippets/a.ts",
      region: "ask",
      lang: "ts",
      meta: "{2,3|5}{lines:true} [a.ts]",
    });
    expect(parseSnippetLine("<<< ./x.js ts {monaco}", "slides")!).toMatchObject({
      path: "slides/x.js",
      lang: "ts",
      meta: "{monaco}",
    });
    expect(parseSnippetLine("<<< ../x.py", "slides")!.path).toBe("x.py");
    expect(langOfPath("a/b.py")).toBe("python");
    expect(parseSnippetLine("<< not one")).toBeNull();
  });

  test("expands outside fences only, and into magic move", () => {
    const read = (p: string) => (p === "s.ts" ? { path: p, text: "const a = 1" } : null);
    const out = expandSnippets(
      "<<< @/s.ts {1}\n\n```md\n<<< @/s.ts\n```\n\n<<< @/gone.ts",
      "",
      read,
    );
    expect(out.text).toContain('```ts {1} kadal-snippet="s.ts"\nconst a = 1\n```');
    expect(out.text).toContain("```md\n<<< @/s.ts\n```");
    expect(out.text).toContain("Snippet not found:");
    expect(out.missing).toEqual(["gone.ts"]);
    const magic = expandSnippets("````md magic-move\n<<< @/s.ts\n````", "", read);
    expect(magic.text).toBe(
      '````md magic-move\n```ts kadal-snippet="s.ts"\nconst a = 1\n```\n````',
    );
  });

  test("a fence longer than the code's own backticks", () => {
    const read = (p: string) => ({ path: p, text: "x\n```\ny" });
    expect(expandSnippets("<<< @/a.md", "", read).text.startsWith("````md")).toBe(true);
  });

  test("prepareDeck reads snippets per slide and compiles them as fences", async () => {
    const deck = prepareDeck("# One\n\n<<< @/s.ts#r {monaco-write}\n", {
      file: "deck.mdx",
      snippets: {
        dirOf: () => "",
        read: (p) =>
          p === "s.ts" ? { path: p, text: "// #region r\nlet x = 1\n// #endregion r" } : null,
      },
    });
    expect(deck.slides[0]!.snippets).toEqual(["s.ts"]);
    const out = await html(deck.slides[0]!.content);
    expect(out).toContain('data-snippet="s.ts#r"');
    expect(out).toContain('data-monaco="write"');
  });
});

describe("code groups", () => {
  test("::code-group becomes <CodeGroup> around the fences", () => {
    const out = applyCodeGroups(
      "::code-group\n\n```sh [npm]\nnpm i\n```\n\n```sh [bun]\nbun add\n```\n\n::",
    );
    expect(out).toContain("<CodeGroup>");
    expect(out).toContain("</CodeGroup>");
    expect(out).toContain("```sh [npm]");
  });

  test("options, the three-colon form, and fences that show the syntax", () => {
    expect(
      applyCodeGroups(":::code-group {clicks:true, print:'all'}\n```ts\na\n```\n:::"),
    ).toContain('<CodeGroup clicks print="all">');
    const shown = "````md\n::code-group\n```ts\na\n```\n::\n````";
    expect(applyCodeGroups(shown)).toBe(shown);
  });

  test("does not disturb ::slot:: markers", () => {
    const body = applyCodeGroups(
      applySlots("left\n\n::right::\n\n::code-group\n```ts [a.ts]\na\n```\n::"),
    );
    expect(body).toContain('data-slot="right"');
    expect(body).toContain("<CodeGroup>");
  });

  test("compiles: the fences arrive as children with their titles", async () => {
    const out = await html(
      applyCodeGroups("::code-group\n\n```sh [npm]\nnpm i\n```\n\n```sh [bun]\nbun add\n```\n\n::"),
    );
    expect(out).toContain("CodeGroup");
    expect(out).toContain('data-title="npm"');
    expect(out).toContain('data-title="bun"');
  });
});

describe("magic move line numbers", () => {
  test("`{lines: true}` numbers the keyed tokens (shiki-magic-move numbers them when it tokenises)", async () => {
    const { findMagicMoves } = await import("./magic-move.ts");
    const { magicMoveData } = await import("./pipeline.ts");
    const text = [
      "````md magic-move {lines: true}",
      "```ts",
      "let a = 1",
      "```",
      "```ts",
      "const a = 1",
      "```",
      "````",
    ].join("\n");
    const numbered = magicMoveData(findMagicMoves(text).blocks, highlighter, themes)[0]!;
    expect(numbered.steps.every((s) => (s.tokens as { lineNumbers?: boolean }).lineNumbers)).toBe(
      true,
    );
    const plain = magicMoveData(
      findMagicMoves(text.replace(" {lines: true}", "")).blocks,
      highlighter,
      themes,
    )[0]!;
    expect((plain.steps[0]!.tokens as { lineNumbers?: boolean }).lineNumbers).toBe(false);
  });
});
