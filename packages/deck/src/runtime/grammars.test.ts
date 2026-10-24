import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DEFAULT_LANGS } from "../compiler/langs.ts";
import { compileDeck } from "./compile.ts";
import { RUNTIME_GRAMMARS, grammarsFor, runtimeHasGrammar } from "./grammars.ts";

describe("the runtime compiler's grammars", () => {
  test("every default language has its grammar (or needs none), each loaded once", async () => {
    for (const lang of DEFAULT_LANGS) expect(runtimeHasGrammar(lang), lang).toBe(true);
    expect(grammarsFor(DEFAULT_LANGS)).toHaveLength(Object.keys(RUNTIME_GRAMMARS).length);
    expect(grammarsFor(["ts", "typescript", "TS", "text", "haskell"])).toHaveLength(1);
    const mod = (await grammarsFor(["sh"])[0]!()) as { default: Array<{ name: string }> };
    expect(mod.default.map((g) => g.name)).toContain("shellscript");
  });

  test("a page's own grammars come first, by id or fence name", () => {
    const mdx = async () => ({ default: [] });
    expect(grammarsFor(["mdx"], { mdx })).toEqual([mdx]);
    expect(grammarsFor(["ts"], { typescript: mdx })).toEqual([mdx]);
    expect(runtimeHasGrammar("mdx")).toBe(false);
  });

  test("compileDeck highlights a language only when it has its grammar", async () => {
    const deck = "# Code\n\n```mdx\n# Title\n\n<Chart data={[1, 2]} />\n```\n";
    const spans = async (o: Parameters<typeof compileDeck>[1]) => {
      const out = await compileDeck(deck, o);
      expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const Slide = (await out.manifest.slides[0]!.load()).default;
      return renderToStaticMarkup(createElement(Slide)).split("<span").length;
    };
    const plain = await spans({ shiki: { langs: ["mdx"] } });
    const coloured = await spans({
      shiki: { langs: ["mdx"] },
      grammars: { mdx: () => import("shiki/langs/mdx.mjs") },
    });
    expect(coloured).toBeGreaterThan(plain);
  });
});
