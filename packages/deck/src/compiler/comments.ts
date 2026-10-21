/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HTML COMMENTS IN A SLIDE: Slidev's speaker notes, and MDX's blind spot
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Slidev reads the comment block(s) at the END of a slide as its speaker notes:
 *
 *   # Slide two
 *
 *   <!-- Not a note: it is not at the end. -->
 *
 *   The second page
 *
 *   <!--
 *   This is the note. [click] And this part lights up with the first click.
 *   -->
 *
 * MDX, on the other hand, rejects `<!--` anywhere ("Unexpected character `!`"). So every comment
 * is dealt with before MDX sees the slide: the trailing ones become notes (split.ts) and every
 * other one is blanked — removed but for its newlines, so the lines after it keep their numbers
 * and an error message still points at the right line. Comments inside fenced or inline
 * code are code, and are left exactly as written.
 *
 * An unclosed `<!--` runs to the end of the slide, as it does in HTML.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface CommentSpan {
  /** Offsets into the text: `<!--` and just past `-->` (or the end, when unclosed). */
  start: number;
  end: number;
  /** What is between the markers. */
  inner: string;
  closed: boolean;
}

/**
 * Character ranges of fenced code blocks (``` or ~~~, closed by a fence of the same kind and at
 * least the same length, or the end of the text). split.ts re-exports it as `fencedRanges`; it
 * lives here so the modules split.ts depends on do not depend on split.ts back.
 */
export function fenceRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let open: { start: number; mark: string } | null = null;
  let offset = 0;
  for (const line of text.split("\n")) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (m) {
      const mark = m[1]!;
      if (!open) open = { start: offset, mark };
      else if (mark[0] === open.mark[0] && mark.length >= open.mark.length) {
        out.push([open.start, offset + line.length]);
        open = null;
      }
    }
    offset += line.length + 1;
  }
  if (open) out.push([open.start, text.length]);
  return out;
}

/** Fenced code plus inline code spans (`…`) outside the fences: where syntax is only text. */
export function codeSpans(text: string): Array<[number, number]> {
  const fences = fenceRanges(text);
  const out = [...fences];
  for (const m of text.matchAll(/(`+)(?:(?!\1)[^\n])+?\1/g)) {
    const start = m.index!;
    if (fences.some(([a, b]) => start >= a && start < b)) continue;
    out.push([start, start + m[0].length]);
  }
  return out;
}

const inside = (ranges: Array<[number, number]>, at: number) =>
  ranges.some(([a, b]) => at >= a && at < b);

/** Every HTML comment in `text` that does not start inside code, in order. */
export function htmlComments(
  text: string,
  code: Array<[number, number]> = codeSpans(text),
): CommentSpan[] {
  const out: CommentSpan[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf("<!--", from);
    if (start < 0) break;
    if (inside(code, start)) {
      from = start + 4;
      continue;
    }
    const close = text.indexOf("-->", start + 4);
    const closed = close >= 0;
    const end = closed ? close + 3 : text.length;
    out.push({ start, end, inner: text.slice(start + 4, closed ? close : text.length), closed });
    from = end;
  }
  return out;
}

/** The same text with `[start, end)` removed except its newlines, so later lines keep their numbers. */
export function blank(text: string, start: number, end: number): string {
  return text.slice(0, start) + text.slice(start, end).replace(/[^\n]/g, "") + text.slice(end);
}

/**
 * The text with every HTML comment outside code blanked, so MDX can compile it. Line numbers do
 * not move.
 */
export function blankHtmlComments(text: string): string {
  if (!text.includes("<!--")) return text;
  let out = text;
  // Last first: blanking shortens the text, and earlier offsets must stay true.
  for (const c of htmlComments(text).reverse()) out = blank(out, c.start, c.end);
  return out;
}
