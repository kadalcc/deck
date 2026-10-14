import { describe, expect, test } from "bun:test";

import { PDF_LAYER_CSS } from "./pdf.ts";

/** A selector list split at its own commas, not the ones inside `:is(…)`. */
const list = (s: string) => {
  const out = [""];
  let depth = 0;
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) out.push("");
    else out[out.length - 1] += ch;
  }
  return out.map((x) => x.trim());
};

/** Every selector in the stylesheet, one per entry. */
const selectors = PDF_LAYER_CSS.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("}")
  .map((block) => block.split("{")[0]!.trim())
  .filter(Boolean)
  .flatMap(list);

const rule = (needle: string) => {
  const block = PDF_LAYER_CSS.split("}").find((b) => b.includes(needle));
  return block ?? "";
};

describe("the PDF's two layers", () => {
  test("touch nothing outside an export", () => {
    expect(selectors.length).toBeGreaterThan(5);
    for (const s of selectors)
      expect(s).toMatch(/^html\.kadal-pdf-(art|text) \.deck-print-page( |$)/);
  });

  test("the art hides the text and nothing else", () => {
    const art = rule("html.kadal-pdf-art .deck-print-page *,");
    expect(art).toContain("-webkit-text-fill-color: transparent");
    expect(art).not.toContain("background");
    expect(art).not.toContain("visibility");
  });

  test("the text layer drops every effect a PDF viewer can get wrong", () => {
    const text = rule("html.kadal-pdf-text .deck-print-page *,");
    for (const prop of ["background: none", "box-shadow: none", "filter: none", "mask: none"])
      expect(text).toContain(prop);
    expect(rule("svg),")).toContain("visibility: hidden");
    expect(PDF_LAYER_CSS).toContain("svg foreignObject *");
  });
});
