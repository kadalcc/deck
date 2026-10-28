import { describe, expect, test } from "bun:test";
import { compile } from "@mdx-js/mdx";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

import { remarkTexDelimiters } from "./remark-tex-delimiters.ts";

async function jsx(source: string, katex = false): Promise<string> {
  const out = await compile(source, {
    remarkPlugins: [remarkMath, remarkTexDelimiters],
    rehypePlugins: katex ? [rehypeKatex] : [],
    outputFormat: "function-body",
    jsx: true,
  });
  return String(out);
}

describe("\\( … \\) and \\[ … \\]", () => {
  test("inline maths, braces and all, without MDX reading them as expressions", async () => {
    const out = await jsx("Area \\(\\frac{a}{b}^2\\) here.");
    expect(out).toContain('className="language-math math-inline"');
    expect(out).toContain('{"\\\\frac{a}{b}^2"}');
  });

  test("a \\[ … \\] paragraph is a display block, as $$ is", async () => {
    const tex = await jsx("\\[\n\\int_0^1 x\\,dx\n\\]");
    const dollars = await jsx("$$\n\\int_0^1 x\\,dx\n$$");
    expect(tex).toBe(dollars);
    expect(tex).toContain("math-display");
  });

  test("display maths inside a sentence renders in display mode", async () => {
    const out = await jsx("So \\[x = 1\\] holds.", true);
    expect(out).toContain("katex-display");
  });

  test("escapes, empties and code stay text", async () => {
    const out = await jsx("a \\\\(b\\\\) and \\(\\) and `\\(x\\)`\n\n```\n\\[y\\]\n```");
    expect(out).not.toContain("language-math");
    expect(out).toContain("(b");
    expect(out).toContain('{"\\\\(x\\\\)"}');
  });

  test("an unclosed opener is the plain escape it always was", async () => {
    const out = await jsx("See \\[1] and \\(2.");
    expect(out).not.toContain("language-math");
    expect(out).toContain("See [1] and (2.");
  });
});
