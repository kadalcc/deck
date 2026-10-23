import { braceGroups } from "../compiler/loose-object.ts";
import { CODE_OPTION_KEYS, parseCodeMeta, parseLooseObject } from "../compiler/code-meta.ts";
import {
  MERMAID_CONFIG_KEYS,
  MERMAID_FENCE_KEYS,
  PLANTUML_FENCE_KEYS,
} from "../compiler/remark-fences.ts";
import { packageOf } from "../monaco/types-config.ts";
import { toJs, type Value } from "./expr.ts";
import type { Reporter } from "./report.ts";
import { scaleCssValue } from "./uno.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CODE FENCES  —  Slidev's meta, checked against what Kadal's code toolkit reads
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Kadal reads Slidev's fence syntax natively (compiler/code-meta.ts): `{2,3|5}`, `{*}{lines:true,
 * startLine:5,maxHeight:'200px'}`, `[filename]`, `twoslash`, `{monaco}` / `{monaco-run}` /
 * `{monaco-diff}` / `{monaco-write}`, ````md magic-move, `<<<` snippets, ```mermaid and ```plantuml
 * with their options, Shiki's `// [!code ++]` notation. So a fence is copied as written, with three
 * exceptions worth a line in the report:
 *
 *   - `maxHeight` is a length on Slidev's 980px canvas: scaled to Kadal's stage like every length.
 *   - `{at: …}` (when the highlight steps start) has no Kadal spelling: the steps take their place
 *     in the slide's click order. Dropped, reported.
 *   - a `{monaco-run}` that imports a local file or one of Node's modules: Kadal runs the code in
 *     a browser worker, which fetches packages from a CDN (`monacoRunImports`) but cannot read the
 *     deck's files, so that import fails when it runs. Kept, reported.
 *
 * The code inside a fence is never touched.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const OPEN = /^([ \t]*)(`{3,}|~{3,})([^\n]*)$/;

/** Scale `maxHeight`/`height` lengths in a fence's `{…}` options; drop `at`. */
function rewriteOptions(
  body: string,
  scale: number,
  kind: "code" | "mermaid" | "plantuml" | "magic",
  report: Reporter,
  line: number,
): string | null {
  let opts: Record<string, unknown>;
  try {
    opts = parseLooseObject(body.trim().replace(/^\{|\}$/g, ""));
  } catch {
    report({
      severity: "warning",
      line,
      what: `The fence options ${body} are not an object Kadal can read.`,
      suggestion: "Write them as `{key: value}`.",
    });
    return body;
  }
  let changed = false;
  for (const key of ["maxHeight", "height", "outputHeight"]) {
    const v = opts[key];
    if (typeof v === "string" && /px/.test(v)) {
      opts[key] = scaleCssValue(v, scale).replace(/^calc\((.*)\)$/, "calc($1)");
      changed = true;
    }
  }
  if (kind === "code" && "at" in opts) {
    delete opts.at;
    changed = true;
    report({
      severity: "warning",
      line,
      what: "A code block's `at` (when its highlight steps begin) has no Kadal equivalent; the steps follow the slide's other clicks in order.",
      suggestion:
        "Reorder the slide's clicks, or set `clicks:` in the frontmatter, if the timing matters.",
    });
  }
  if (kind === "code") {
    const unknown = Object.keys(opts).filter(
      (k) => !(CODE_OPTION_KEYS as readonly string[]).includes(k) && k !== "lines",
    );
    for (const k of unknown)
      report({
        severity: "info",
        line,
        what: `The code-block option \`${k}\` is not one Kadal reads; it is kept but does nothing.`,
      });
  }
  if (kind === "mermaid") {
    for (const k of Object.keys(opts))
      if (!MERMAID_FENCE_KEYS.includes(k) && !MERMAID_CONFIG_KEYS.includes(k) && k !== "alt")
        report({
          severity: "info",
          line,
          what: `The mermaid option \`${k}\` is not a Mermaid setting; it is ignored.`,
        });
  }
  if (kind === "plantuml")
    for (const k of Object.keys(opts))
      if (!PLANTUML_FENCE_KEYS.includes(k))
        report({ severity: "info", line, what: `The plantuml option \`${k}\` is ignored.` });
  return changed
    ? toJs(opts as Value)
        .replace(/^\{ /, "{")
        .replace(/ \}$/, "}")
    : body;
}

function rewriteMeta(
  lang: string,
  meta: string,
  scale: number,
  report: Reporter,
  line: number,
  magic: boolean,
): string {
  const kind = magic
    ? "magic"
    : lang === "mermaid"
      ? "mermaid"
      : lang === "plantuml"
        ? "plantuml"
        : "code";
  let out = meta;
  for (const group of braceGroups(meta)) {
    const inner = group.trim();
    if (!/^\{\s*['"]?[\w-]+['"]?\s*:/.test(inner)) continue;
    const next = rewriteOptions(inner, scale, kind, report, line);
    if (next !== null && next !== inner) out = out.replace(group, next);
  }
  return out;
}

/**
 * One fenced block of a Slidev slide, as Kadal reads it. `line` is the fence's first line in the
 * source, for the report.
 */
export function convertFence(
  text: string,
  scale: number,
  report: Reporter,
  line: number,
  /** Collects the packages a `twoslash` block imports (TwoSlash needs their types installed). */
  typeImports?: Set<string>,
): string {
  const lines = text.split("\n");
  const open = OPEN.exec(lines[0]!);
  if (!open) return text;
  const [, indent, mark, info] = open;
  const m = /^\s*([\w+#.-]*)(.*)$/.exec(info!)!;
  const lang = m[1]!;
  const meta = m[2]!;
  const magic = mark!.length >= 4 && lang === "md" && /^\s*magic-move/.test(meta);
  lines[0] = `${indent}${mark}${lang}${rewriteMeta(lang, meta, scale, report, line, magic)}`;
  if (magic) {
    // the steps inside: each is a fence of its own
    for (let i = 1; i < lines.length - 1; i++) {
      const inner = OPEN.exec(lines[i]!);
      if (!inner || inner[2]!.length >= mark!.length) continue;
      const im = /^\s*([\w+#.-]*)(.*)$/.exec(inner[3]!)!;
      if (!im[1] && !im[2]!.trim()) continue;
      lines[i] =
        `${inner[1]}${inner[2]}${im[1]}${rewriteMeta(im[1]!, im[2]!, scale, report, line + i, false)}`;
    }
    return lines.join("\n");
  }
  const parsed = parseCodeMeta(meta);
  for (const w of parsed.words)
    if (!/^magic-move$/.test(w))
      report({
        severity: "info",
        line,
        what: `The fence word \`${w}\` means nothing to Kadal; it is kept.`,
      });
  if (parsed.twoslash && typeImports) {
    const code = lines.slice(1, -1).join("\n");
    for (const m of code.matchAll(/^\s*import\s[^'"]*['"]([^'"./][^'"]*)['"]/gm))
      typeImports.add(
        m[1]!.startsWith("@") ? m[1]!.split("/").slice(0, 2).join("/") : m[1]!.split("/")[0]!,
      );
  }
  if (parsed.monaco === "run") {
    const code = lines.slice(1, -1).join("\n");
    // A package (`zod`, `vue`) is fetched from the deck's `monacoRunImports` CDN when the block
    // runs (monaco/run-js.ts); a file of the deck's or a Node module is not.
    const imports = [...code.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)]
      .map((x) => x[1]!)
      .filter((x) => /^\.{0,2}\//.test(x) || packageOf(x) === "@types/node");
    if (imports.length)
      report({
        severity: "warning",
        line,
        what: `This {monaco-run} block imports ${imports.map((x) => `\`${x}\``).join(", ")}; Kadal runs the code in a browser worker that can fetch packages but not the deck's files or Node's modules, so that import fails when it runs.`,
        suggestion: "Inline what it imports, or register a runner for it (registerCodeRunner).",
      });
  }
  return lines.join("\n");
}

/** How many clicks a fence takes on its slide: its highlight steps less one, or its magic-move steps. */
export function fenceClicks(text: string): number {
  const first = text.split("\n", 1)[0]!;
  const open = OPEN.exec(first);
  if (!open) return 0;
  const m = /^\s*([\w+#.-]*)(.*)$/.exec(open[3]!)!;
  if (open[2]!.length >= 4 && m[1] === "md" && /^\s*magic-move/.test(m[2]!)) {
    const steps = text
      .split("\n")
      .slice(1, -1)
      .filter((l) => /^\s*(`{3}|~{3})[\w+#.-]+/.test(l)).length;
    return Math.max(0, steps - 1);
  }
  const meta = parseCodeMeta(m[2]!);
  return meta.steps ? Math.max(0, meta.steps.length - 1) : 0;
}
