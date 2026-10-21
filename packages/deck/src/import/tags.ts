import { fenceRanges, htmlComments } from "../compiler/comments.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A SLIDEV SLIDE AS TEXT AND TAGS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The importer never parses a slide as Markdown: Markdown stays Markdown, byte for byte. What it
 * needs are the HTML/Vue tags in it — with their attributes as Vue wrote them (`v-click.hide`,
 * `:initial="{ x: -80 }"`, `@click="…"`, `#1-3`) and which closing tag ends which element — and the
 * stretches where a `<` is not a tag at all: fenced and inline code, maths, comments, `<style>` and
 * `<script>` blocks, `<https://autolinks>`.
 *
 * `scanSlide` returns those spans and a tree of elements over the rest. A tag that never closes
 * runs to its parent's end (as HTML does) and is flagged; a closing tag with no opener is kept as
 * a stray, for the report.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type SpanKind =
  | "fence"
  | "code"
  | "math"
  | "comment"
  | "style"
  | "script"
  | "autolink"
  | "snippet";

export interface Span {
  kind: SpanKind;
  start: number;
  end: number;
}

export interface Attr {
  name: string;
  /** `true` for a bare attribute (`v-click`, `two-way`). */
  value: string | true;
}

export interface El {
  name: string;
  attrs: Attr[];
  /** Offsets: `<` of the opening tag, just past its `>`, `<` of the closing tag, past its `>`. */
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  selfClosing: boolean;
  unclosed: boolean;
  children: El[];
  parent: El | null;
}

export const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/** Inline maths `$…$` (no space inside the dollars, no digit after) and `$$…$$` blocks. */
function mathSpans(text: string, skip: (at: number) => boolean): Span[] {
  const out: Span[] = [];
  const block = /^[ \t]*\$\$/gm;
  for (const m of text.matchAll(block)) {
    const start = m.index! + m[0].length - 2;
    if (skip(start) || out.some((s) => start < s.end)) continue;
    // `$$ x $$` on one line, else up to the next line that holds `$$`.
    const sameLine = text.indexOf("$$", start + 2);
    const lineEnd = text.indexOf("\n", start);
    if (
      sameLine !== -1 &&
      (lineEnd === -1 || sameLine < lineEnd) &&
      /\S/.test(text.slice(start + 2, sameLine)) &&
      !/^\s*\{/.test(text.slice(start + 2))
    ) {
      out.push({ kind: "math", start, end: sameLine + 2 });
      continue;
    }
    const close = /^[^\n]*\$\$/m;
    const rest = text.slice(lineEnd === -1 ? text.length : lineEnd + 1);
    const c = close.exec(rest);
    const end = c ? lineEnd + 1 + c.index + c[0].length : text.length;
    out.push({ kind: "math", start, end });
  }
  const inline = /(?<![\\$])\$(?=[^\s$])([^$\n]*?[^\s\\$])\$(?!\d)/g;
  for (const m of text.matchAll(inline)) {
    const start = m.index!;
    if (skip(start) || out.some((s) => start >= s.start && start < s.end)) continue;
    out.push({ kind: "math", start, end: start + m[0].length });
  }
  return out;
}

/** Every stretch of a slide where `<` and `{` are not markup. Sorted, not overlapping. */
export function protectedSpans(text: string, htmlOnly = false): Span[] {
  const spans: Span[] = [];
  if (htmlOnly) {
    // a Vue file's template is HTML: only comments and <style>/<script> are not markup
    for (const c of htmlComments(text, []))
      spans.push({ kind: "comment", start: c.start, end: c.end });
    for (const kind of ["style", "script"] as const)
      for (const m of text.matchAll(
        new RegExp(`<${kind}(\\s[^>]*)?>[\\s\\S]*?</${kind}\\s*>`, "gi"),
      ))
        if (!spans.some((x) => m.index! >= x.start && m.index! < x.end))
          spans.push({ kind, start: m.index!, end: m.index! + m[0].length });
    return spans.sort((x, y) => x.start - y.start);
  }
  const inside = (at: number) => spans.some((s) => at >= s.start && at < s.end);
  for (const [a, b] of fenceRanges(text)) spans.push({ kind: "fence", start: a, end: b });
  for (const c of htmlComments(
    text,
    spans.map((s) => [s.start, s.end] as [number, number]),
  ))
    spans.push({ kind: "comment", start: c.start, end: c.end });
  // inline code (outside fences and comments): a run of backticks closed by the same run
  for (const m of text.matchAll(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g)) {
    if (inside(m.index!)) continue;
    if (m[0].includes("\n\n")) continue;
    spans.push({ kind: "code", start: m.index!, end: m.index! + m[0].length });
  }
  for (const kind of ["style", "script"] as const) {
    const re = new RegExp(`<${kind}(\\s[^>]*)?>[\\s\\S]*?</${kind}\\s*>`, "gi");
    for (const m of text.matchAll(re)) {
      if (inside(m.index!)) continue;
      spans.push({ kind, start: m.index!, end: m.index! + m[0].length });
    }
  }
  // `<<< @/snippets/x.ts#region {2|3}`: Kadal reads the line itself (compiler/snippets.ts)
  for (const m of text.matchAll(/^[ \t]*<<<[ \t][^\n]*/gm)) {
    if (inside(m.index!)) continue;
    spans.push({ kind: "snippet", start: m.index!, end: m.index! + m[0].length });
  }
  for (const m of text.matchAll(/<((?:https?|ftp|mailto):[^\s<>]+|[\w.+-]+@[\w-]+\.[\w.-]+)>/gi)) {
    if (inside(m.index!)) continue;
    spans.push({ kind: "autolink", start: m.index!, end: m.index! + m[0].length });
  }
  spans.push(...mathSpans(text, inside));
  spans.sort((x, y) => x.start - y.start);
  // drop anything that starts inside an earlier span
  const out: Span[] = [];
  for (const s of spans) if (!out.length || s.start >= out[out.length - 1]!.end) out.push(s);
  return out;
}

const NAME_START = /[A-Za-z]/;

/** Parse the opening tag at `at` (text[at] === "<"), or null when it is not one. */
export function parseOpenTag(
  text: string,
  at: number,
): { name: string; attrs: Attr[]; end: number; selfClosing: boolean } | null {
  let i = at + 1;
  if (!NAME_START.test(text[i] ?? "")) return null;
  const nameM = /^[A-Za-z][\w:.-]*/.exec(text.slice(i));
  if (!nameM) return null;
  const name = nameM[0];
  i += name.length;
  const attrs: Attr[] = [];
  for (;;) {
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i >= text.length) return null;
    if (text[i] === ">") return { name, attrs, end: i + 1, selfClosing: false };
    if (text[i] === "/" && text[i + 1] === ">")
      return { name, attrs, end: i + 2, selfClosing: true };
    if (text[i] === "<") return null;
    const start = i;
    while (i < text.length && !/[\s=>]/.test(text[i]!) && !(text[i] === "/" && text[i + 1] === ">"))
      i++;
    const attrName = text.slice(start, i);
    if (!attrName) return null;
    let j = i;
    while (j < text.length && /[ \t]/.test(text[j]!)) j++;
    if (text[j] !== "=") {
      attrs.push({ name: attrName, value: true });
      continue;
    }
    j++;
    while (j < text.length && /[ \t\n]/.test(text[j]!)) j++;
    const q = text[j];
    if (q === '"' || q === "'") {
      const close = text.indexOf(q, j + 1);
      if (close === -1) return null;
      attrs.push({ name: attrName, value: text.slice(j + 1, close) });
      i = close + 1;
    } else {
      let k = j;
      while (k < text.length && !/[\s>]/.test(text[k]!)) k++;
      if (text[k - 1] === "/" && text[k] === ">") k--;
      attrs.push({ name: attrName, value: text.slice(j, k) });
      i = k;
    }
  }
}

export interface Scan {
  spans: Span[];
  root: El;
  /** Closing tags that close nothing (offsets), for the report. */
  stray: Array<{ name: string; at: number }>;
}

/** The slide's spans and its element tree. */
export function scanSlide(text: string, htmlOnly = false): Scan {
  const spans = protectedSpans(text, htmlOnly);
  const root: El = {
    name: "#root",
    attrs: [],
    start: 0,
    openEnd: 0,
    closeStart: text.length,
    end: text.length,
    selfClosing: false,
    unclosed: false,
    children: [],
    parent: null,
  };
  const stray: Array<{ name: string; at: number }> = [];
  const stack: El[] = [root];
  let s = 0;
  let i = 0;
  while (i < text.length) {
    while (s < spans.length && spans[s]!.end <= i) s++;
    const span = spans[s];
    if (span && i >= span.start) {
      i = span.end;
      continue;
    }
    const lt = text.indexOf("<", i);
    if (lt === -1) break;
    if (span && lt >= span.start) {
      i = span.start;
      continue;
    }
    const close = /^<\/([A-Za-z][\w:.-]*)\s*>/.exec(text.slice(lt));
    if (close) {
      const name = close[1]!;
      let k = stack.length - 1;
      while (
        k > 0 &&
        stack[k]!.name !== name &&
        stack[k]!.name.toLowerCase() !== name.toLowerCase()
      )
        k--;
      if (k === 0) stray.push({ name, at: lt });
      else {
        while (stack.length - 1 > k) {
          const open = stack.pop()!;
          open.unclosed = true;
          open.closeStart = open.end = lt;
        }
        const el = stack.pop()!;
        el.closeStart = lt;
        el.end = lt + close[0].length;
      }
      i = lt + close[0].length;
      continue;
    }
    const open = parseOpenTag(text, lt);
    if (!open) {
      i = lt + 1;
      continue;
    }
    const parent = stack[stack.length - 1]!;
    // `<link>` is void, `<Link>` is Slidev's component: only a lowercase name is an HTML element
    const isVoid =
      VOID_ELEMENTS.has(open.name) ||
      (open.name === open.name.toUpperCase() && VOID_ELEMENTS.has(open.name.toLowerCase()));
    const el: El = {
      name: open.name,
      attrs: open.attrs,
      start: lt,
      openEnd: open.end,
      closeStart: open.end,
      end: open.end,
      selfClosing: open.selfClosing || isVoid,
      unclosed: false,
      children: [],
      parent,
    };
    parent.children.push(el);
    if (!el.selfClosing) stack.push(el);
    i = open.end;
  }
  while (stack.length > 1) {
    const open = stack.pop()!;
    open.unclosed = true;
    open.closeStart = open.end = text.length;
  }
  return { spans, root, stray };
}
