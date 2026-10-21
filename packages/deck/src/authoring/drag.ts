import { codeSpans, htmlComments } from "../compiler/comments.ts";
import { DRAG_TAGS } from "../compiler/remark-drag.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DRAG SITES IN A SLIDE'S SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The text-side twin of compiler/remark-drag.ts: the same sites — a `<Drag>`/`<DragArrow>` (or a
 * Slidev spelling of one), or any element carrying Slidev's `v-drag` directive — counted in the
 * same order, so the n-th site here is the element the compiler stamped `data-drag-index="n"`.
 * Code (fenced and inline), HTML comments and `{/* JSX comments *\/}` are not sites.
 *
 * `rewriteDragPos` puts a new position on one site and changes nothing else in the text: the
 * value inside its `pos="…"` (or `v-drag="[…]"`), or a `pos="…"` added after the tag's name.
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface Span {
  start: number;
  end: number;
}

export interface DragSite {
  /** The tag's name as written. */
  tag: string;
  /** Where the tag's name ends (a new attribute goes here). */
  nameEnd: number;
  /** The `pos` attribute's value, when it has one: its text and where that text sits. */
  pos: (Span & { value: string }) | null;
  /** `pos={…}` that is not a plain string: a position the editor cannot write. */
  posExpression: boolean;
  /** For an element with Slidev's `v-drag` directive: the directive's value (inside its quotes). */
  directive: (Span & { value: string }) | null;
}

const NAME = /[A-Za-z][\w.:-]*/y;

/** Ranges that are only text to the compiler: code, HTML comments, JSX comments. */
function skipped(text: string): Span[] {
  const code = codeSpans(text);
  const out: Span[] = code.map(([start, end]) => ({ start, end }));
  for (const c of htmlComments(text, code)) out.push({ start: c.start, end: c.end });
  for (const m of text.matchAll(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g))
    out.push({ start: m.index!, end: m.index! + m[0].length });
  return out.sort((a, b) => a.start - b.start);
}

interface Attr {
  name: string;
  /** The value's inner text span (inside the quotes or braces); null for a bare attribute. */
  value: (Span & { text: string; quoted: boolean }) | null;
}

/** Read a tag's attributes from just after its name; returns them and where the tag ends. */
function readAttrs(text: string, from: number): { attrs: Attr[]; end: number } | null {
  const attrs: Attr[] = [];
  let i = from;
  while (i < text.length) {
    while (/\s/.test(text[i] ?? "")) i++;
    const ch = text[i];
    if (ch === undefined) return null;
    if (ch === ">") return { attrs, end: i + 1 };
    if (ch === "/" && text[i + 1] === ">") return { attrs, end: i + 2 };
    if (ch === "{") {
      // A spread, `{...props}`: skip it whole.
      const close = matchBrace(text, i);
      if (close < 0) return null;
      i = close + 1;
      continue;
    }
    const m = /[^\s=/>{]+/y;
    m.lastIndex = i;
    const name = m.exec(text)?.[0];
    if (!name) return null;
    i += name.length;
    while (/[ \t]/.test(text[i] ?? "")) i++;
    if (text[i] !== "=") {
      attrs.push({ name, value: null });
      continue;
    }
    i++;
    while (/[ \t]/.test(text[i] ?? "")) i++;
    const q = text[i];
    if (q === '"' || q === "'") {
      const close = text.indexOf(q, i + 1);
      if (close < 0) return null;
      attrs.push({
        name,
        value: { start: i + 1, end: close, text: text.slice(i + 1, close), quoted: true },
      });
      i = close + 1;
    } else if (q === "{") {
      const close = matchBrace(text, i);
      if (close < 0) return null;
      attrs.push({
        name,
        value: { start: i + 1, end: close, text: text.slice(i + 1, close), quoted: false },
      });
      i = close + 1;
    } else return null;
  }
  return null;
}

/** The `}` that closes the `{` at `open`, past strings and nested braces; -1 when none does. */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const close = text.indexOf(c, i + 1);
      if (close < 0) return -1;
      i = close;
    } else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Every drag site in a slide body, in document order. */
export function dragSites(text: string): DragSite[] {
  const skip = skipped(text);
  const out: DragSite[] = [];
  let k = 0;
  for (let i = text.indexOf("<"); i >= 0; i = text.indexOf("<", i + 1)) {
    while (k < skip.length && skip[k]!.end <= i) k++;
    if (k < skip.length && skip[k]!.start <= i) {
      i = skip[k]!.end - 1;
      continue;
    }
    NAME.lastIndex = i + 1;
    const tag = NAME.exec(text)?.[0];
    if (!tag) continue;
    const nameEnd = i + 1 + tag.length;
    const read = readAttrs(text, nameEnd);
    if (!read) continue;
    const pos = read.attrs.find((a) => a.name === "pos") ?? null;
    const directive = read.attrs.find((a) => a.name === "v-drag") ?? null;
    if (!(tag in DRAG_TAGS) && !directive) continue;
    let posValue: DragSite["pos"] = null;
    let posExpression = false;
    if (pos?.value) {
      const v = pos.value;
      const str = v.quoted ? null : /^\s*(["'`])([^"'`]*)\1\s*$/.exec(v.text);
      if (v.quoted) posValue = { start: v.start, end: v.end, value: v.text };
      else if (str) {
        const s = v.start + v.text.indexOf(str[1]!) + 1;
        posValue = { start: s, end: s + str[2]!.length, value: str[2]! };
      } else posExpression = true;
    }
    out.push({
      tag,
      nameEnd,
      pos: posValue,
      posExpression,
      directive:
        directive?.value?.quoted === true
          ? { start: directive.value.start, end: directive.value.end, value: directive.value.text }
          : null,
    });
  }
  return out;
}

export class DragSourceError extends Error {
  override name = "DragSourceError";
}

/**
 * The text with site `index`'s position set to `pos` ("x,y,w,h[,r]"). `expected` is what the
 * editor believed the position was (its `pos`, or "" for none): when the source says otherwise —
 * the file was edited since the slide was compiled — nothing is changed and an error says so.
 */
export function rewriteDragPos(
  text: string,
  index: number,
  pos: string,
  expected?: string,
): string {
  const site = dragSites(text)[index];
  if (!site)
    throw new DragSourceError(
      `There is no draggable element #${index + 1} on this slide any more — the file changed since the slide was loaded. Reload and drag again.`,
    );
  if (site.posExpression)
    throw new DragSourceError(
      `<${site.tag}>'s pos is an expression, so it cannot be rewritten. Write it as pos="x,y,w,h" or name a frontmatter position (pos="name" with dragPos: { name: … }).`,
    );
  if (site.directive && !(site.tag in DRAG_TAGS)) {
    const current = site.directive.value.trim();
    const now = /^\[(.*)\]$/.exec(current)?.[1]?.replace(/\s+/g, "").replace(/NaN/g, "_") ?? "";
    if (expected !== undefined && now !== expected)
      throw new DragSourceError(
        `The v-drag position on this slide changed since it was loaded (it is now ${current || "empty"}). Reload and drag again.`,
      );
    const value = `[${pos.replace(/(^|,)_(?=,|$)/g, "$1NaN")}]`;
    return text.slice(0, site.directive.start) + value + text.slice(site.directive.end);
  }
  const now = site.pos?.value.trim() ?? "";
  if (expected !== undefined && now !== expected)
    throw new DragSourceError(
      `<${site.tag}>'s position changed since the slide was loaded (it is now ${now ? `"${now}"` : "unset"}). Reload and drag again.`,
    );
  if (site.pos) return text.slice(0, site.pos.start) + pos + text.slice(site.pos.end);
  return `${text.slice(0, site.nameEnd)} pos="${pos}"${text.slice(site.nameEnd)}`;
}
