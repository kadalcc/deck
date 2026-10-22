import type { Element, Root } from "hast";
import type { Highlighter, ShikiTransformer } from "shiki";
import { visit } from "unist-util-visit";

import { type CodeMeta, parseCodeMeta, serialiseSteps } from "./code-meta.ts";
import type { ShikiThemeOption } from "./code-themes.ts";
import { diffLines, splitDiffSource } from "./diff-lines.ts";

/**
 * Turn every fenced code block into highlighted HTML at build time, and carry the fence meta over
 * as data attributes the runtime `<Code>` reads: which lines light up on which click, whether to
 * number lines, the title, the max height. Highlighting is Shiki with a light and a dark theme at
 * once — and every further theme the theme menu needs (compiler/code-themes.ts) — each colour a
 * CSS variable on the token; the CSS picks by the deck's colour scheme and the theme on show.
 *
 * Every block also runs the deck's Shiki transformers — the notation ones (`// [!code ++]`, see
 * compiler/transformers.ts) and whatever `deck({ shiki: { transformers } })` adds — and a
 * `twoslash` block runs TwoSlash when the caller has it (the Vite plugin, with TypeScript
 * installed). A `{monaco…}` block is highlighted too: that is its face in print, in export, on the
 * phone remote and until the editor has loaded; the editor reads its source from `data-code`.
 */
export interface RehypeCodeOptions {
  highlighter: Highlighter;
  /** The deck's pair, and the further keys the theme menu needs (compiler/code-themes.ts). */
  themes: ShikiThemeOption;
  /** Run on every block, in order: the notation transformers, then the deck's own. */
  transformers?: ShikiTransformer[];
  /** The TwoSlash transformer; null or absent renders `twoslash` blocks as plain highlighted code. */
  twoslash?: ShikiTransformer | null;
  /** Told when a `twoslash` block rendered without types because there is no TwoSlash here. */
  onTwoslashMissing?: () => void;
}

const TWOSLASH_LANGS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "typescript",
  "javascript",
  "mts",
  "cts",
]);

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

const classesOf = (props: Element["properties"]): string[] => {
  const out: string[] = [];
  for (const key of ["class", "className"] as const) {
    const v = (props as Record<string, unknown>)[key];
    if (typeof v === "string") out.push(...v.split(/\s+/));
    else if (Array.isArray(v)) out.push(...v.map(String));
  }
  return out.filter(Boolean);
};

/** Classes a transformer puts on the `pre` that the CSS keys on; Shiki's own theme names are not. */
const KEEP_PRE_CLASS = /^(has-|twoslash|lsp)/;

export function rehypeDeckCode(options: RehypeCodeOptions) {
  const { highlighter, themes } = options;
  const extra = options.transformers ?? [];
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || !parent || index === undefined) return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;
      const lang = langOf(code);
      if (lang === "math") return; // remark-math's display blocks belong to KaTeX
      const rawMeta = (code.data as { meta?: string } | undefined)?.meta ?? "";
      const meta = parseCodeMeta(rawMeta);
      const source = textOf(code).replace(/\n$/, "");
      const loaded = highlighter.getLoadedLanguages();
      const useLang = loaded.includes(lang) ? lang : "text";

      // A diff editor's static face: one listing, removed lines then added ones where they differ.
      let shown = source;
      let diffKinds: string[] | null = null;
      let diff: { original: string; modified: string } | null = null;
      if (meta.monaco === "diff") {
        diff = splitDiffSource(source);
        const ops = diffLines(diff.original, diff.modified);
        shown = ops.map((o) => o.text).join("\n");
        diffKinds = ops.map((o) => o.kind);
      }

      const transformers: ShikiTransformer[] = meta.monaco ? [] : [...extra];
      if (meta.twoslash && !meta.monaco && TWOSLASH_LANGS.has(lang)) {
        if (options.twoslash) transformers.push(options.twoslash);
        else {
          options.onTwoslashMissing?.();
          shown = withoutTwoslashNotation(shown);
        }
      }
      transformers.push({
        name: "kadal:lines",
        line(el, line) {
          el.properties["data-line"] = String(line + meta.startLine - 1);
          const kind = diffKinds?.[line - 1];
          if (kind === "add" || kind === "remove") this.addClassToHast(el, ["diff", kind]);
        },
        pre(el) {
          if (diffKinds) this.addClassToHast(el, "has-diff");
        },
      });

      let hast: Root;
      try {
        hast = highlighter.codeToHast(shown, {
          lang: useLang,
          themes,
          defaultColor: false,
          transformers,
          meta: { __raw: rawMeta },
        }) as Root;
      } catch {
        // A transformer that throws (a broken custom one) costs the block its extras, not the slide.
        hast = highlighter.codeToHast(shown, {
          lang: useLang,
          themes,
          defaultColor: false,
          transformers: [transformers[transformers.length - 1]!],
        }) as Root;
      }
      const pre = hast.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "pre",
      );
      if (!pre) return;
      // TwoSlash's popups hold highlighted code of their own: a `pre` inside the block would come
      // back through the `pre` mapping as a whole second code block (title bar, copy button).
      visit(pre, "element", (el: Element) => {
        if (el !== pre && el.tagName === "pre") {
          el.tagName = "span";
          el.properties = { className: ["twoslash-popup-pre", ...classesOf(el.properties)] };
        }
      });
      const kept = classesOf(pre.properties).filter((c) => KEEP_PRE_CLASS.test(c));
      const { class: _class, ...props } = pre.properties as Record<string, unknown>;
      pre.properties = {
        ...(props as Element["properties"]),
        ...dataAttributes(meta, lang, shown.split("\n").length),
        ...(meta.monaco ? monacoAttributes(meta, source, diff) : null),
      };
      pre.properties.className = ["deck-code", "shiki", ...kept];
      (parent as Element).children[index] = pre;
    });
  };
}

/**
 * A `twoslash` block shown without TwoSlash still reads as it would with it: the directives
 * (`// ^?` queries, `// @errors: 2322`, `// @filename: a.ts`) go, and so does everything above a
 * `// ---cut---` line.
 */
function withoutTwoslashNotation(code: string): string {
  let lines = code.split("\n");
  const cut = lines.findIndex((l) => /^\s*\/\/\s*---cut(-after)?---\s*$/.test(l));
  if (cut >= 0) lines = lines.slice(cut + 1);
  return lines
    .filter((l) => !/^\s*\/\/\s*(\^[?|^]|@\w+|---cut-(start|end|before)---)/.test(l))
    .join("\n");
}

function dataAttributes(meta: CodeMeta, lang: string, totalLines: number) {
  const out: Record<string, string> = { "data-lang": lang, "data-total": String(totalLines) };
  if (meta.steps && !meta.monaco) out["data-steps"] = serialiseSteps(meta.steps);
  if (meta.lines) out["data-lines"] = "true";
  if (meta.startLine !== 1) out["data-start"] = String(meta.startLine);
  if (meta.title) out["data-title"] = meta.title;
  if (meta.maxHeight) out["data-max-height"] = meta.maxHeight;
  if (meta.hideUntilStep && !meta.monaco) out["data-hide-until-step"] = "true";
  if (meta.twoslash) out["data-twoslash"] = "true";
  return out;
}

/** What the editor needs: its mode, its source (both sides for a diff), options, where it came from. */
function monacoAttributes(
  meta: CodeMeta,
  source: string,
  diff: { original: string; modified: string } | null,
) {
  const out: Record<string, string> = {
    "data-monaco": meta.monaco!,
    "data-code": diff ? diff.modified : source,
  };
  if (diff) out["data-original"] = diff.original;
  if (Object.keys(meta.options).length) out["data-monaco-options"] = JSON.stringify(meta.options);
  if (meta.snippet)
    out["data-snippet"] =
      `${meta.snippet.path}${meta.snippet.region ? `#${meta.snippet.region}` : ""}`;
  return out;
}
