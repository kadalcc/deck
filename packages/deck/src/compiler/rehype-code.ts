import type { Element, Root } from "hast";
import type { Highlighter } from "shiki";
import { visit } from "unist-util-visit";

import { type CodeMeta, parseCodeMeta, serialiseSteps } from "./code-meta.ts";

/**
 * Turn every fenced code block into highlighted HTML at build time, and carry the fence meta over
 * as data attributes the runtime `<Code>` reads: which lines light up on which click, whether to
 * number lines, the title, the max height. Highlighting is Shiki with a light and a dark theme at
 * once; the CSS picks by the deck's colour scheme.
 */
export interface RehypeCodeOptions {
  highlighter: Highlighter;
  themes: { light: string; dark: string };
}

function langOf(node: Element): string {
  const cls = node.properties?.className;
  const list = Array.isArray(cls) ? cls : typeof cls === "string" ? [cls] : [];
  for (const c of list) {
    const m = /^language-([\w+-]+)$/.exec(String(c));
    if (m) return m[1]!;
  }
  return "text";
}

function textOf(node: Element): string {
  let out = "";
  const walk = (n: Element | { type: string; value?: string; children?: unknown[] }) => {
    if (n.type === "text") out += (n as { value: string }).value;
    for (const c of (n as { children?: unknown[] }).children ?? []) walk(c as Element);
  };
  walk(node);
  return out;
}

export function rehypeDeckCode(options: RehypeCodeOptions) {
  const { highlighter, themes } = options;
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || !parent || index === undefined) return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;
      const lang = langOf(code);
      if (lang === "math") return; // remark-math's display blocks belong to KaTeX
      const meta = parseCodeMeta((code.data as { meta?: string } | undefined)?.meta);
      const source = textOf(code).replace(/\n$/, "");
      const loaded = highlighter.getLoadedLanguages();
      const useLang = loaded.includes(lang) ? lang : "text";
      const hast = highlighter.codeToHast(source, {
        lang: useLang,
        themes,
        defaultColor: false,
        transformers: [
          {
            line(el, line) {
              el.properties["data-line"] = String(line + meta.startLine - 1);
            },
          },
        ],
      }) as Root;
      const pre = hast.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "pre",
      );
      if (!pre) return;
      pre.properties = {
        ...pre.properties,
        ...dataAttributes(meta, lang, source.split("\n").length),
      };
      pre.properties.className = ["deck-code", "shiki"];
      (parent as Element).children[index] = pre;
    });
  };
}

function dataAttributes(meta: CodeMeta, lang: string, totalLines: number) {
  const out: Record<string, string> = { "data-lang": lang, "data-total": String(totalLines) };
  if (meta.steps) out["data-steps"] = serialiseSteps(meta.steps);
  if (meta.lines) out["data-lines"] = "true";
  if (meta.startLine !== 1) out["data-start"] = String(meta.startLine);
  if (meta.title) out["data-title"] = meta.title;
  if (meta.maxHeight) out["data-max-height"] = meta.maxHeight;
  if (meta.hideUntilStep) out["data-hide-until-step"] = "true";
  return out;
}
