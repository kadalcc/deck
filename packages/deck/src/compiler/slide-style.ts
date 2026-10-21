import { blank, codeSpans } from "./comments.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SLIDE-SCOPED <style>
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * As in Slidev, a `<style>` block written in a slide styles that slide only:
 *
 *   # This is red
 *
 *   <style>
 *   h1 { color: red; }
 *   </style>
 *
 * MDX cannot take the block as it is — `{` opens an expression — so the compiler lifts every
 * `<style>` out of the slide's text (outside code) before MDX sees it, and blanks its lines so the
 * rest keep their numbers. The CSS is then scoped to the slide: each selector of each top-level
 * rule is prefixed with the slide's own selector, `.deck-slide[data-index="N"]`, recursing into
 * `@media`, `@supports`, `@container`, `@layer` and `@scope` blocks. Rules nested INSIDE a rule
 * are left to the browser's CSS nesting, exactly as written. Things that cannot be scoped and
 * mean nothing when nested — `@keyframes`, `@font-face`, `@import`, `@property`, `@counter-style`,
 * `@font-feature-values`, `@font-palette-values`, `@page`, `@namespace`, `@layer a, b;` — are
 * hoisted out unchanged, `@import` to the very top of the sheet where the cascade requires it.
 *
 *   :scope / &          the slide itself (`:scope { background: … }`)
 *   html.dark h1        page-level parts stay ancestors: this slide's h1, in the dark scheme
 *   color: red;         declarations outside any rule apply to the slide itself too
 *   <style global>      no scoping at all: the CSS applies to the whole deck, every view
 *
 * Every slide's CSS ends up in one stylesheet in the manifest (`styles`), which `<Deck>` renders
 * once. Scoped by attribute rather than by where the `<style>` element sits, it applies wherever
 * the slide is drawn — the stage, the presenter's previews, the overview, print and export — and
 * a slide that is not mounted costs nothing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SlideStyle {
  css: string;
  /** `<style global>`: applied to the deck as written. */
  global: boolean;
  /** 0-based line of the `<style>` tag in the slide's content. */
  line: number;
}

const STYLE = /<style(\s[^>]*)?>([\s\S]*?)<\/style\s*>/gi;

/** Lift the `<style>` blocks (outside code) out of a slide's MDX; their lines are blanked. */
export function extractStyles(content: string): { content: string; styles: SlideStyle[] } {
  if (!/<style[\s>]/i.test(content)) return { content, styles: [] };
  // Code is masked before matching, not skipped after: an inline `<style>` in a sentence would
  // otherwise match through to a real block's `</style>` and hide it.
  let masked = content;
  for (const [a, b] of codeSpans(content))
    masked = masked.slice(0, a) + masked.slice(a, b).replace(/[^\n]/g, "\uE000") + masked.slice(b);
  const styles: SlideStyle[] = [];
  const cuts: Array<[number, number]> = [];
  for (const m of masked.matchAll(STYLE)) {
    const start = m.index!;
    const end = start + m[0].length;
    const attrs = content.slice(start + "<style".length, start + m[0].indexOf(">"));
    // Self-closing `<style ... />` has no body to scope; JSX can keep it.
    if (/\/\s*$/.test(attrs)) continue;
    const whole = content.slice(start, end);
    styles.push({
      css: whole.slice(whole.indexOf(">") + 1, whole.toLowerCase().lastIndexOf("</style")),
      global: /(^|\s)(global|is:global)(\s|=|$)/.test(attrs),
      line: content.slice(0, start).split("\n").length - 1,
    });
    cuts.push([start, end]);
  }
  // Last first: blanking shortens the text, and earlier offsets must stay true.
  let out = content;
  for (const [a, b] of cuts.reverse()) out = blank(out, a, b);
  return { content: out, styles };
}

/** The selector one slide's scoped CSS hangs off. */
export const slideScope = (index: number) => `.deck-slide[data-index="${index}"]`;

/** At-rules that are hoisted out of the scope unchanged. */
const HOIST = new Set([
  "keyframes",
  "-webkit-keyframes",
  "-moz-keyframes",
  "font-face",
  "import",
  "property",
  "counter-style",
  "font-feature-values",
  "font-palette-values",
  "page",
  "namespace",
  "charset",
  "view-transition",
]);
/** Group rules whose contents are rules again: their contents are scoped. */
const GROUPS = new Set([
  "media",
  "supports",
  "container",
  "layer",
  "scope",
  "document",
  "starting-style",
]);

interface Item {
  /** The prelude: a selector list, an at-rule's head, or declarations (no block). */
  prelude: string;
  /** The block's contents, or null for a statement (`@import …;`, a bare declaration). */
  block: string | null;
}

/**
 * Split CSS into its top-level items, respecting strings, comments, parentheses and nested
 * braces. Comments are dropped (they cannot break anything once gone).
 */
function items(css: string): Item[] {
  const out: Item[] = [];
  let prelude = "";
  let i = 0;
  const n = css.length;
  while (i < n) {
    const c = css[i]!;
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = stringEnd(css, i);
      prelude += css.slice(i, end);
      i = end;
      continue;
    }
    if (c === ";") {
      if (prelude.trim()) out.push({ prelude: `${prelude.trim()};`, block: null });
      prelude = "";
      i++;
      continue;
    }
    if (c === "{") {
      const end = blockEnd(css, i);
      out.push({ prelude: prelude.trim(), block: css.slice(i + 1, end) });
      prelude = "";
      i = end + 1;
      continue;
    }
    if (c === "}") {
      // A stray closing brace: drop it rather than let it close our scope.
      i++;
      continue;
    }
    prelude += c;
    i++;
  }
  if (prelude.trim()) out.push({ prelude: prelude.trim(), block: null });
  return out;
}

function stringEnd(css: string, from: number): number {
  const q = css[from]!;
  let i = from + 1;
  while (i < css.length && css[i] !== q && css[i] !== "\n") i += css[i] === "\\" ? 2 : 1;
  return Math.min(css.length, i + 1);
}

/** Index of the `}` matching the `{` at `open` (or the end). */
function blockEnd(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const c = css[i]!;
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end < 0) return css.length;
      i = end + 1;
    } else if (c === '"' || c === "'") i = stringEnd(css, i) - 1;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return css.length;
}

/** Split a selector list at its top-level commas (not inside `:is(a, b)` or `[x="a,b"]`). */
export function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    if (c === '"' || c === "'") {
      const end = stringEnd(list, i);
      cur += list.slice(i, end);
      i = end - 1;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    if (c === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * One selector, under the scope. `&` and `:scope` are the slide itself. A selector that starts at
 * the page — `html`, `body`, `:root`, or Slidev's `.dark` (the dark scheme's class on <html>) —
 * keeps that part as an ancestor, so `html.dark h1` is "an h1 of this slide, in the dark scheme",
 * which is what Vue's scoped CSS makes of it; `html` or `:root` alone is the slide.
 */
function scopeSelector(selector: string, scope: string): string {
  const s = selector.trim();
  if (/(^|[^\w-])(&|:scope)(?![\w-])/.test(s)) return s.replace(/&|:scope(?![\w-])/g, scope);
  const page = /^(?:html|body|:root|\.dark)(?![\w-])(?:\[[^\]]*\]|[^\s>+~[])*/.exec(s);
  if (page) {
    const rest = s.slice(page[0].length).trim();
    const bare = /^(html|body|:root)$/.test(page[0]);
    if (!rest) return bare ? scope : `${page[0]} ${scope}`;
    if (/^[>+~]/.test(rest)) return `${scope} ${rest.replace(/^[>+~]\s*/, "")}`;
    return bare ? `${scope} ${rest}` : `${page[0]} ${scope} ${rest}`;
  }
  return `${scope} ${s}`;
}

interface Scoped {
  imports: string[];
  hoisted: string[];
  rules: string[];
}

function scopeItems(css: string, scope: string, into: Scoped) {
  const loose: string[] = [];
  for (const item of items(css)) {
    const at = /^@([\w-]+)/.exec(item.prelude);
    if (at) {
      const name = at[1]!.toLowerCase();
      if (name === "import" || name === "charset") {
        if (name === "import") into.imports.push(item.prelude);
        continue;
      }
      if (HOIST.has(name) || (name === "layer" && item.block === null)) {
        into.hoisted.push(item.block === null ? item.prelude : `${item.prelude} {${item.block}}`);
        continue;
      }
      if (GROUPS.has(name) && item.block !== null) {
        const inner: Scoped = { imports: into.imports, hoisted: into.hoisted, rules: [] };
        scopeItems(item.block, scope, inner);
        into.rules.push(`${item.prelude} {\n${inner.rules.join("\n")}\n}`);
        continue;
      }
      // Anything else (a future at-rule): nest it in the slide, where it cannot leak.
      into.rules.push(
        `${scope} {\n${item.prelude}${item.block === null ? "" : ` {${item.block}}`}\n}`,
      );
      continue;
    }
    if (item.block === null) {
      // A bare declaration (`color: red;`): it styles the slide itself.
      loose.push(item.prelude);
      continue;
    }
    const selectors = splitSelectors(item.prelude).map((s) => scopeSelector(s, scope));
    into.rules.push(`${selectors.join(",\n")} {${item.block}}`);
  }
  if (loose.length) into.rules.unshift(`${scope} {\n  ${loose.join("\n  ")}\n}`);
}

/** Scope one block of CSS to `scope`; at-rules that cannot be scoped come back hoisted. */
export function scopeCss(css: string, scope: string): Scoped {
  const out: Scoped = { imports: [], hoisted: [], rules: [] };
  scopeItems(css, scope, out);
  return out;
}

/**
 * The deck's slide stylesheet: every slide's `<style>` blocks, scoped to their slide (or not, for
 * `<style global>`), with `@import`s first. Empty when no slide has any.
 */
export function deckStylesheet(slides: Array<{ index: number; styles?: SlideStyle[] }>): string {
  const imports: string[] = [];
  const body: string[] = [];
  for (const s of slides) {
    for (const style of s.styles ?? []) {
      if (style.global) {
        const parts = items(style.css);
        for (const p of parts) {
          if (/^@import\b/i.test(p.prelude)) imports.push(p.prelude);
        }
        body.push(
          `/* slide ${s.index + 1}, global */\n${style.css.replace(/@import\b[^;]*;/gi, "").trim()}`,
        );
        continue;
      }
      const scoped = scopeCss(style.css, slideScope(s.index));
      imports.push(...scoped.imports);
      body.push(`/* slide ${s.index + 1} */\n${[...scoped.hoisted, ...scoped.rules].join("\n")}`);
    }
  }
  if (!body.length) return "";
  return [...imports, ...body].join("\n");
}
