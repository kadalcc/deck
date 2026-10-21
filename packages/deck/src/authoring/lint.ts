import {
  type Catalog,
  backgroundNames,
  builtinComponentNames,
  catalog as builtin,
} from "../catalog/index.ts";
import { parseCodeMeta } from "../compiler/code-meta.ts";
import { DEFAULT_LANGS } from "../compiler/langs.ts";
import {
  type RawSlide,
  unclosedSettings,
  unclosedSettingsMessage,
} from "../compiler/split.ts";
import { resolveBackground, splitTransition } from "../core/model.ts";
import { DEFAULT_GLOSSARY, buildMatcher, glossaryOptions } from "../glossary/model.ts";
import { parseGlossary } from "../glossary/parse.ts";
import { type DeckFiles, dirOf, idOf, joinPath, readDeck } from "./source.ts";
import { checkValue, closest } from "./validate.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LINTING A DECK  —  what `kadal-deck check` and the deck_check tool report
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Everything that would make a slide render wrong or not at all, found without a browser:
 * frontmatter that is not YAML or names an unknown key or a wrong type; layouts, backgrounds,
 * themes and transitions the engine does not have; MDX that does not compile (with the line in
 * the file, not in the slide); JSX tags that are neither built in, the deck's own, nor imported;
 * includes that cannot be read; local images and videos that will not be served; glossary
 * problems; code-fence options the highlighter will ignore. Errors break the deck; warnings are
 * worth a look. Pure apart from the MDX compiler, which is imported only when `compile` is on.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: Severity;
  /** Stable, kebab-case: what kind of problem (`layout-unknown`, `mdx`, `asset-missing`…). */
  code: string;
  message: string;
  file: string;
  /** 1-based. */
  line: number;
  column?: number;
  /** The slide's index, when the problem belongs to one. */
  slide?: number;
  hint?: string;
}

export interface LintResult {
  ok: boolean;
  errors: number;
  warnings: number;
  slides: number;
  diagnostics: Diagnostic[];
}

/** What the deck adds to the engine, read from its own source (src/components.tsx and friends). */
export interface DeckExtensions {
  components: string[];
  layouts: string[];
  backgrounds: string[];
  /** True when the components map could not be read completely (a spread, a computed key). */
  open: boolean;
}

export interface LintOptions {
  files: DeckFiles;
  /** Does a file exist (assets)? Defaults to `files.read(path) !== null`. */
  exists?: (path: string) => boolean;
  /** The deck folder, where public/ lives. Defaults to the entry's folder. */
  root?: string;
  extensions?: DeckExtensions;
  /** Themes the deck ships (its config.themes); defaults to the built-in ones. */
  themes?: string[];
  /** Keys deck.config.ts sets; they override the headmatter, so setting them there does nothing. */
  configKeys?: string[];
  /** Compile every slide's MDX (slower, finds syntax errors). Default true. */
  compile?: boolean;
  catalog?: Catalog;
}

const LANG_ALIASES = new Set([
  "typescript",
  "javascript",
  "shell",
  "shellscript",
  "zsh",
  "console",
  "py",
  "yml",
  "markdown",
  "rs",
  "golang",
  "c++",
  "plaintext",
  "txt",
  "plain",
  "mermaid",
  "math",
]);

const ASSET_ATTRS: Record<string, string[]> = {
  Image: ["src"],
  img: ["src"],
  Video: ["src", "poster"],
  video: ["src", "poster"],
  Audio: ["src"],
  audio: ["src"],
  Sketch: ["src"],
  Iframe: ["poster"],
};

const LIVE_IDS = new Set(["Poll", "Quiz", "WordCloud"]);
/** Attributes React or MDX handle on any element. */
const PASS_PROPS = new Set(["key", "ref", "className", "style", "children", "id", "title"]);

interface Node {
  type: string;
  name?: string | null;
  url?: string;
  lang?: string | null;
  meta?: string | null;
  value?: string;
  attributes?: Array<{ type: string; name?: string; value?: unknown }>;
  position?: { start: { line: number; column: number } };
  children?: Node[];
}

const isUrl = (u: string) => /^([a-z][a-z0-9+.-]*:|\/\/|#|\{)/i.test(u);

/** Names a slide's own `import` and `export` lines bring into scope. */
function esmNames(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/import\s+([\s\S]+?)\s+from\s+["'][^"']+["']/g)) {
    const spec = m[1]!;
    const def = /^([A-Za-z_$][\w$]*)/.exec(spec);
    if (def && !spec.startsWith("{")) out.push(def[1]!);
    const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(spec);
    if (ns) out.push(ns[1]!);
    const named = /\{([^}]*)\}/.exec(spec);
    if (named)
      for (const part of named[1]!.split(",")) {
        const n = part
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim();
        if (n) out.push(n);
      }
  }
  for (const m of code.matchAll(/export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g))
    out.push(m[1]!);
  return out;
}

export async function lintDeck(options: LintOptions): Promise<LintResult> {
  const cat = options.catalog ?? builtin;
  const files = options.files;
  const root = options.root ?? dirOf(files.entry);
  const exists = options.exists ?? ((p: string) => files.read(p) !== null);
  const ext = options.extensions ?? { components: [], layouts: [], backgrounds: [], open: false };
  const diagnostics: Diagnostic[] = [];
  const add = (d: Diagnostic) => diagnostics.push(d);

  let deck: ReturnType<typeof readDeck>;
  try {
    deck = readDeck(files, { root });
  } catch (e) {
    add({
      severity: "error",
      code: "deck-missing",
      message: e instanceof Error ? e.message : String(e),
      file: files.entry,
      line: 1,
    });
    return finish(diagnostics, 0);
  }
  for (const p of deck.problems)
    add({
      severity: "error",
      code: /outside the deck folder/.test(p.message)
        ? "include-outside"
        : /cannot include/.test(p.message)
          ? "include-missing"
          : "yaml",
      message: p.message,
      file: p.file,
      line: p.line,
    });
  if (!deck.slides.length)
    add({
      severity: "error",
      code: "empty-deck",
      message: "The deck has no slides.",
      file: files.entry,
      line: 1,
    });

  const slideKeys = new Map(cat.slideFrontmatter.map((k) => [k.name, k]));
  const deckKeys = new Map(cat.deckFrontmatter.map((k) => [k.name, k]));
  const layouts = new Set([...cat.layouts.map((l) => l.name), ...ext.layouts]);
  const bgs = new Set([...backgroundNames(cat), ...ext.backgrounds]);
  const transitions = new Set(cat.transitions.map((t) => t.name));
  const themes = new Set(options.themes ?? cat.themes.map((t) => t.name));
  const components = new Set([...builtinComponentNames(cat), ...ext.components]);
  // Built-in components the deck has not replaced with its own of the same name.
  const byName = new Map(
    cat.components.filter((c) => !ext.components.includes(c.name)).map((c) => [c.name, c]),
  );

  // ── frontmatter ──────────────────────────────────────────────────────────────────────────
  const ids = new Map<string, RawSlide>();
  for (const s of deck.slides) {
    const head = s.index === 0 && s.range.head;
    const fmLine = s.range.frontmatter ? s.range.frontmatter.open + 2 : s.range.start + 1;
    const at = { file: s.range.file, line: fmLine, slide: s.index };
    for (const [key, value] of Object.entries(s.frontmatter)) {
      const sk = slideKeys.get(key);
      const dk = deckKeys.get(key);
      const def = sk ?? dk;
      // A layout of the deck's own is read from frontmatter by its author's code: its keys are
      // the layout's business, not unknown.
      const ownLayout = typeof s.frontmatter.layout === "string" && ext.layouts.includes(s.frontmatter.layout);
      if (!def && ownLayout) continue;
      if (!def) {
        const near = closest(key, [...slideKeys.keys(), ...(head ? deckKeys.keys() : [])]);
        add({
          ...at,
          severity: "warning",
          code: "frontmatter-unknown-key",
          message: `Unknown frontmatter key "${key}".`,
          hint: near
            ? `Did you mean "${near}"?`
            : "Custom layouts may read their own keys; otherwise remove it.",
        });
        continue;
      }
      if (!sk && !head && !s.range.includedBy)
        add({
          ...at,
          severity: "warning",
          code: "frontmatter-deck-key",
          message: `"${key}" is a deck setting; it only takes effect in the headmatter at the top of ${files.entry}.`,
        });
      if (head && options.configKeys?.includes(key) && !sk)
        add({
          ...at,
          severity: "warning",
          code: "frontmatter-overridden",
          message: `"${key}" is also set in deck.config.ts, which wins over the headmatter.`,
          hint: "Change it in deck.config.ts, or remove it there to let the headmatter decide.",
        });
      const why = checkValue(def.type, value);
      if (why)
        add({ ...at, severity: "error", code: "frontmatter-type", message: `"${key}": ${why}.` });
    }
    const layout = s.frontmatter.layout;
    if (typeof layout === "string" && !layouts.has(layout)) {
      const near = closest(layout, layouts);
      add({
        ...at,
        severity: "error",
        code: "layout-unknown",
        message: `Unknown layout "${layout}" (the slide would fall back to "default").`,
        hint: near
          ? `Did you mean "${near}"?`
          : `Layouts: ${[...layouts].join(", ")}; or register "layout:${layout}" in src/components.tsx.`,
      });
    }
    const bg = resolveBackground(s.frontmatter);
    if (bg?.component && !bgs.has(bg.component)) {
      const near = closest(bg.component, bgs);
      add({
        ...at,
        severity: "error",
        code: "background-unknown",
        message: `Unknown background "${bg.component}".`,
        hint: near
          ? `Did you mean "${near}"?`
          : 'Use a registered background, a colour like "#0f172a", a gradient, or an image path.',
      });
    }
    for (const key of ["transition", "backgroundTransition"]) {
      const t = s.frontmatter[key];
      // `zoom-in fade-out` (reveal.js's split form) is two known names, one for each half.
      const halves = typeof t === "string" ? splitTransition(t, "none") : null;
      if (typeof t === "string" && !(transitions.has(t) || (transitions.has(halves!.in) && transitions.has(halves!.out))))
        add({
          ...at,
          severity: "warning",
          code: "transition-unknown",
          message: `Unknown ${key} "${t}".`,
          hint: `One of: ${[...transitions].join(", ")}.`,
        });
    }
    if (head && typeof s.frontmatter.theme === "string" && !themes.has(s.frontmatter.theme))
      add({
        ...at,
        severity: "warning",
        code: "theme-unknown",
        message: `Theme "${s.frontmatter.theme}" is not one the deck ships (${[...themes].join(", ")}).`,
        hint: "Install it as a package (@kadal/theme-<name> or kadal-theme-<name>), point at a folder (theme: ./theme), define .theme-<name> in your CSS, or pick a built-in theme.",
      });
    const id = idOf(s);
    if (typeof s.frontmatter.id === "string") {
      const prev = ids.get(id);
      if (prev)
        add({
          ...at,
          severity: "warning",
          code: "duplicate-id",
          message: `Slide id "${id}" is also used by slide ${prev.index}.`,
        });
      else ids.set(id, s);
    }
    for (const key of ["image", "poster", "backgroundImage", "backgroundVideo"]) {
      const v = s.frontmatter[key];
      if (typeof v === "string") checkAsset(v, at.file, at.line, s.index);
    }
    if (bg?.image) checkAsset(bg.image, at.file, at.line, s.index);
    if (bg?.video) checkAsset(bg.video, at.file, at.line, s.index);
    const loose = unclosedSettings(s.content);
    if (loose)
      add({
        severity: "warning",
        code: "frontmatter-unclosed",
        message: unclosedSettingsMessage(loose),
        file: s.range.file,
        line: s.range.body + 1,
        slide: s.index,
        hint: "Slide settings sit between two `---` lines: `---`, then `background: spotlight`, then `---`, then the slide.",
      });
  }

  function checkAsset(url: string, file: string, line: number, slide: number, column?: number) {
    if (!url || isUrl(url) || url.startsWith("data:")) return;
    const clean = url.split(/[?#]/)[0]!.replace(/^\.\//, "");
    const inPublic = joinPath(joinPath(root, "public"), clean.replace(/^\//, ""));
    if (exists(inPublic)) return;
    const local = joinPath(clean.startsWith("/") ? root : dirOf(file), clean.replace(/^\//, ""));
    const where = { file, line, slide, ...(column ? { column } : {}) };
    if (exists(local))
      add({
        ...where,
        severity: "error",
        code: "asset-not-public",
        message: `"${url}" exists but not in public/, so the built deck will not serve it.`,
        hint: `Move it to public/${clean.replace(/^\//, "")} and reference it as "/${clean.replace(/^\//, "")}".`,
      });
    else
      add({
        ...where,
        severity: "error",
        code: "asset-missing",
        message: `"${url}" not found (looked in public/).`,
      });
  }

  // ── glossary ─────────────────────────────────────────────────────────────────────────────
  const gOpts = glossaryOptions(deck.headmatter.glossary);
  let matcher = buildMatcher([]);
  if (gOpts.src) {
    const gFile = joinPath(dirOf(files.entry), gOpts.src);
    const text = files.read(gFile);
    if (text !== null) {
      const parsed = parseGlossary(text, gFile);
      matcher = buildMatcher(parsed.entries);
      for (const w of parsed.warnings)
        add({
          severity: "warning",
          code: "glossary",
          message: w.replace(`${gFile}: `, ""),
          file: gFile,
          line: Number(/:(\d+)/.exec(w)?.[1] ?? 1),
        });
    } else if (gOpts.src !== DEFAULT_GLOSSARY.src)
      add({
        severity: "warning",
        code: "glossary",
        message: `The glossary file "${gOpts.src}" does not exist.`,
        file: files.entry,
        line: 1,
      });
  }

  // ── each slide's MDX ─────────────────────────────────────────────────────────────────────
  const liveIds = new Map<string, number>();
  if (options.compile !== false && deck.slides.length) {
    const [
      { createProcessor },
      { default: remarkGfm },
      { default: remarkMath },
      { rehypeGlossary },
    ] = await Promise.all([
      import("@mdx-js/mdx"),
      import("remark-gfm"),
      import("remark-math"),
      import("../compiler/rehype-glossary.ts"),
    ]);
    const lineCache = new Map<string, string[]>();
    const linesOf = (file: string) => {
      let l = lineCache.get(file);
      if (!l) {
        l = (files.read(file) ?? "").split(/\r?\n/);
        lineCache.set(file, l);
      }
      return l;
    };
    for (const s of deck.slides) {
      const body = linesOf(s.range.file).slice(s.range.body, s.range.end).join("\n");
      const offset = s.range.body;
      const file = s.range.file;
      const nodes: Node[] = [];
      const collect = () => (tree: Node) => {
        const walk = (n: Node) => {
          nodes.push(n);
          n.children?.forEach(walk);
        };
        walk(tree);
      };
      const terms = s.frontmatter.terms;
      const termWarnings: string[] = [];
      const processor = createProcessor({
        format: "mdx",
        jsx: false,
        remarkPlugins: [remarkGfm, remarkMath, collect],
        rehypePlugins: [
          [
            rehypeGlossary,
            {
              matcher,
              auto: terms !== false,
              repeat: gOpts.repeat,
              headings: gOpts.headings,
              skip: gOpts.skip,
              warn: (m: string) => termWarnings.push(m),
            },
          ],
        ],
      });
      try {
        await processor.process({ value: body, path: file });
      } catch (e) {
        const err = e as {
          message?: string;
          reason?: string;
          line?: number;
          column?: number;
          place?: { line?: number; column?: number; start?: { line: number; column: number } };
        };
        const text = err.reason ?? err.message ?? String(e);
        const inText = /\((\d+):(\d+)(?:-\d+:\d+)?\)/.exec(text);
        const line =
          err.line ?? err.place?.line ?? err.place?.start?.line ?? Number(inText?.[1] ?? 1);
        const column =
          err.column ??
          err.place?.column ??
          err.place?.start?.column ??
          (inText ? Number(inText[2]) : undefined);
        add({
          severity: "error",
          code: "mdx",
          message: text.split("\n")[0]!.replace(/\s*\(\d+:\d+(?:-\d+:\d+)?\)/, ""),
          file,
          line: offset + line,
          ...(column ? { column } : {}),
          slide: s.index,
          hint: "MDX is strict: close every tag, wrap {braces} and <angles> meant as text in backticks, and leave blank lines around Markdown inside JSX.",
        });
        continue;
      }
      for (const m of termWarnings)
        add({
          severity: "warning",
          code: "term-unknown",
          message: m,
          file,
          line: offset + 1,
          slide: s.index,
        });

      const scope = new Set<string>();
      for (const n of nodes)
        if (n.type === "mdxjsEsm" && n.value) for (const x of esmNames(n.value)) scope.add(x);
      for (const n of nodes) {
        const line = offset + (n.position?.start.line ?? 1);
        const column = n.position?.start.column;
        const at = { file, line, slide: s.index, ...(column ? { column } : {}) };
        if ((n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement") && n.name) {
          const base = n.name.split(".")[0]!;
          if (/^[A-Z]/.test(base) || n.name.includes(".")) {
            if (!components.has(base) && !scope.has(base)) {
              const near = closest(base, components);
              add({
                ...at,
                severity: ext.open ? "warning" : "error",
                code: "component-unknown",
                message: `<${n.name}> is not a built-in component, not in src/components.tsx, and not imported in this slide.`,
                hint:
                  near && near !== base
                    ? `Did you mean <${near}>?`
                    : "Add it to src/components.tsx (export const components = { Name }), or import it in the slide.",
              });
            }
          }
          const info = byName.get(n.name);
          if (info && !info.openProps && !scope.has(base))
            for (const attr of n.attributes ?? []) {
              const name = attr.type === "mdxJsxAttribute" ? attr.name : null;
              if (!name || PASS_PROPS.has(name) || /^(data|aria)-/.test(name)) continue;
              if (!info.props.some((p) => p.name === name)) {
                const near = closest(
                  name,
                  info.props.map((p) => p.name),
                );
                add({
                  ...at,
                  severity: "warning",
                  code: "prop-unknown",
                  message: `<${n.name}> has no prop "${name}"; it is ignored.`,
                  hint: near
                    ? `Did you mean "${near}"?`
                    : `Props: ${info.props.map((p) => p.name).join(", ") || "none"}.`,
                });
              }
            }
          for (const attr of n.attributes ?? []) {
            if (attr.type !== "mdxJsxAttribute" || typeof attr.value !== "string") continue;
            if (ASSET_ATTRS[n.name]?.includes(attr.name ?? ""))
              checkAsset(attr.value, file, line, s.index, column);
            if (LIVE_IDS.has(n.name) && attr.name === "id") {
              const prev = liveIds.get(attr.value);
              if (prev !== undefined && prev !== s.index)
                add({
                  ...at,
                  severity: "error",
                  code: "live-id-duplicate",
                  message: `<${n.name} id="${attr.value}"> is also used on slide ${prev}; results would be shared.`,
                });
              else liveIds.set(attr.value, s.index);
            }
          }
        }
        if (n.type === "image" && n.url) checkAsset(n.url, file, line, s.index, column);
        if (n.type === "code") {
          const lang = n.lang ?? "";
          const meta = n.meta ?? "";
          if (lang === "md" && /magic-move/.test(meta)) continue;
          if (lang && !DEFAULT_LANGS.includes(lang) && !LANG_ALIASES.has(lang))
            add({
              ...at,
              severity: "info",
              code: "code-lang",
              message: `\`${lang}\` is not among the languages loaded by default; it renders as plain text unless vite.config.ts passes deck({ shiki: { langs: [...] } }).`,
            });
          if (!meta) continue;
          const total = (n.value ?? "").split("\n").length;
          const parsed = parseCodeMeta(meta);
          const beyond = (parsed.steps ?? [])
            .flatMap((st) => (st ? [...st] : []))
            .filter((x) => x > total + parsed.startLine - 1);
          if (beyond.length)
            add({
              ...at,
              severity: "warning",
              code: "code-meta",
              message: `Highlight line ${beyond[0]} is past the end of the block (${total} lines).`,
            });
          for (const b of meta.matchAll(/\{([^}]*)\}/g)) {
            if (!/^\s*[\w-]+\s*:/.test(b[1]!)) continue;
            for (const pair of b[1]!.split(",")) {
              const key = /^\s*([\w-]+)\s*:/.exec(pair)?.[1];
              if (key && !["lines", "startLine", "maxHeight"].includes(key))
                add({
                  ...at,
                  severity: "warning",
                  code: "code-meta",
                  message: `Unknown code option "${key}" (lines, startLine, maxHeight).`,
                });
            }
          }
          const braces = meta
            .replace(/\[[^\]]*\]/g, "")
            .replace(/\{[^}]*\}/g, "")
            .replace(/data-[\w-]+(="[^"]*")?/g, "")
            .trim();
          if (braces && !/^(magic-move|\{|twoslash)/.test(braces))
            add({
              ...at,
              severity: "info",
              code: "code-meta",
              message: `Code fence meta "${braces}" is not understood and is ignored.`,
            });
        }
      }
    }
  }
  return finish(diagnostics, deck.slides.length);
}

function finish(diagnostics: Diagnostic[], slides: number): LintResult {
  const order = { error: 0, warning: 1, info: 2 };
  diagnostics.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || order[a.severity] - order[b.severity],
  );
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  return { ok: errors === 0, errors, warnings, slides, diagnostics };
}

/** `file:line:col severity code message` lines, the way compilers print them. */
export function formatDiagnostics(
  result: LintResult,
  relative: (file: string) => string = (f) => f,
): string {
  const lines = result.diagnostics.map((d) => {
    const where = `${relative(d.file)}:${d.line}${d.column ? `:${d.column}` : ""}`;
    const slide = d.slide !== undefined ? ` [slide ${d.slide}]` : "";
    return `${where}  ${d.severity.padEnd(7)} ${d.message}${slide}  (${d.code})${d.hint ? `\n    ${d.hint}` : ""}`;
  });
  const summary = `${result.slides} slides · ${result.errors} error${result.errors === 1 ? "" : "s"} · ${result.warnings} warning${result.warnings === 1 ? "" : "s"}`;
  return [...lines, lines.length ? "" : null, summary].filter((l) => l !== null).join("\n");
}

/**
 * The deck's own additions, read from source text without running it: component names in the
 * object `src/components.tsx` exports, `layout:name` keys, and `registerBackground("name", …)`
 * calls anywhere under src/.
 */
export function readExtensions(
  componentsSource: string | null,
  otherSources: string[] = [],
): DeckExtensions {
  const out: DeckExtensions = { components: [], layouts: [], backgrounds: [], open: false };
  if (componentsSource) {
    const src = componentsSource;
    for (const m of src.matchAll(/export\s+(?:const|function|class)\s+([A-Z][\w$]*)/g))
      out.components.push(m[1]!);
    const obj = /export\s+const\s+components\b[^=]*=\s*\{/.exec(src);
    if (obj) {
      let depth = 0;
      let i = obj.index + obj[0].length - 1;
      const start = i + 1;
      for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) break;
      }
      // Comments out: a comment line above a key became part of that key's text and hid it.
      const body = src
        .slice(start, i)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/[^\n]*$/gm, "");
      // Top-level keys only: strip nested braces/brackets/parens first.
      let flat = body;
      for (let k = 0; k < 6; k++) flat = flat.replace(/\{[^{}]*\}|\[[^[\]]*\]|\([^()]*\)/g, "");
      if (/\.\.\./.test(flat) || /\[[^\]]*\]\s*:/.test(body)) out.open = true;
      for (const part of flat.split(",")) {
        const key = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*(?::|$)/.exec(part);
        const name = key?.[1] ?? key?.[2] ?? key?.[3];
        if (!name) continue;
        if (name.startsWith("layout:")) out.layouts.push(name.slice("layout:".length));
        else out.components.push(name);
      }
    } else if (!/export\s+const\s+components/.test(src)) out.open = true;
  }
  for (const s of [componentsSource ?? "", ...otherSources])
    for (const m of s.matchAll(/registerBackground\(\s*["']([^"']+)["']/g))
      out.backgrounds.push(m[1]!);
  return out;
}
