/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RICH TEXT IN PLACE: bold, italic and links typed onto a slide, spelt as Markdown
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * While a text is edited in place (runtime/edit.ts), Cmd/Ctrl+B, I and K wrap the selection. The
 * shell still reports the text as typed (`edited.after`, plain), plus the marks over it:
 *
 *   after  "Ship it today"
 *   marks  [{ from: 0, to: 4, mark: "bold" }, { from: 8, to: 13, mark: "link", href: "https://x" }]
 *
 * and the editor, which escapes plain text for where it lands, spells them with
 * `markdownWithMarks(after, marks, escape)`: "**Ship** it [today](https://x)". Keeping the two
 * apart means an editor that knows nothing of marks still gets the right words, and that a `*`
 * the person typed is escaped while the `**` a shortcut made is not.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type EditMarkKind = "bold" | "italic" | "link";

export interface EditMark {
  /** UTF-16 offsets into `after`; `to` is exclusive. Marks nest, they never cross. */
  from: number;
  to: number;
  mark: EditMarkKind;
  /** The link's address (`link` only). */
  href?: string;
}

/** Where a mark opens and closes in the raw text `typed()` collects (private-use characters). */
export const MARK_OPEN = "";
export const MARK_CLOSE = "";

/**
 * The text with its mark sentinels taken out, and the marks at their offsets. `kinds` are the
 * marks in the order their sentinels open (document order); a sentinel pair left empty by the
 * clean-up, or one with no partner, is dropped.
 */
export function extractMarks(
  raw: string,
  kinds: Array<{ mark: EditMarkKind; href?: string }>,
): { text: string; marks: EditMark[] } {
  let text = "";
  const marks: EditMark[] = [];
  const open: Array<{ from: number; k: number }> = [];
  let next = 0;
  for (const ch of raw) {
    if (ch === MARK_OPEN) open.push({ from: text.length, k: next++ });
    else if (ch === MARK_CLOSE) {
      const o = open.pop();
      const kind = o ? kinds[o.k] : undefined;
      if (o && kind && text.length > o.from) marks.push({ from: o.from, to: text.length, ...kind });
    } else text += ch;
  }
  return { text, marks: marks.sort((a, b) => a.from - b.from || b.to - a.to) };
}

/** A typed address made safe to link: a scheme added to a bare domain, script URLs refused. */
export function cleanHref(raw: string): string | null {
  const href = raw.trim();
  if (!href || /\s/.test(href)) return null;
  if (/^(javascript|vbscript|data):/i.test(href)) return null;
  if (/^([a-z][\w+.-]*:|#|\/|\.\/|\.\.\/|\?)/i.test(href)) return href;
  if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(href)) return `https://${href}`;
  if (/^[^@\s]+@[\w-]+(\.[\w-]+)+$/.test(href)) return `mailto:${href}`;
  return href;
}

/**
 * `after` with its marks spelt in Markdown: `**bold**`, `_italic_` (`*italic*` inside a word, where
 * `_` would not emphasise), `[text](href)`. `escape(plain, atLineStart)` escapes each stretch of
 * plain text for its context (default: as it is). A mark's own spaces move outside it, since
 * `** bold**` is not bold; a mark that crosses another is dropped.
 */
export function markdownWithMarks(
  after: string,
  marks: readonly EditMark[],
  escape: (plain: string, atLineStart: boolean) => string = (s) => s,
): string {
  const ms: EditMark[] = [];
  for (const m of marks) {
    let { from, to } = m;
    if (!(from >= 0 && to <= after.length && from < to)) continue;
    while (from < to && /\s/.test(after[from]!)) from++;
    while (to > from && /\s/.test(after[to - 1]!)) to--;
    if (from >= to) continue;
    if (m.mark === "link" && !m.href) continue;
    const t = { ...m, from, to };
    if (
      ms.some(
        (x) =>
          (x.from < t.from && t.from < x.to && x.to < t.to) ||
          (t.from < x.from && x.from < t.to && t.to < x.to),
      )
    )
      continue;
    ms.push(t);
  }
  // outer first at the same start
  ms.sort((a, b) => a.from - b.from || b.to - a.to);
  const word = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);
  const openOf = (m: EditMark) =>
    m.mark === "bold"
      ? "**"
      : m.mark === "link"
        ? "["
        : word(after[m.from - 1]) || word(after[m.to])
          ? "*"
          : "_";
  const closeOf = (m: EditMark) =>
    m.mark === "bold"
      ? "**"
      : m.mark === "link"
        ? `](${/[\s()<>]/.test(m.href!) ? `<${m.href!.replace(/[<>]/g, encodeURIComponent)}>` : m.href})`
        : word(after[m.from - 1]) || word(after[m.to])
          ? "*"
          : "_";
  const points = [...new Set([0, after.length, ...ms.flatMap((m) => [m.from, m.to])])].sort(
    (a, b) => a - b,
  );
  const stack: EditMark[] = [];
  let out = "";
  let i = 0;
  for (let p = 0; p < points.length; p++) {
    const at = points[p]!;
    while (stack.length && stack[stack.length - 1]!.to === at) out += closeOf(stack.pop()!);
    while (i < ms.length && ms[i]!.from === at) {
      out += openOf(ms[i]!);
      stack.push(ms[i]!);
      i++;
    }
    const end = points[p + 1];
    if (end === undefined) break;
    const plain = after.slice(at, end);
    if (plain) out += escape(plain, at === 0 || after[at - 1] === "\n");
  }
  while (stack.length) out += closeOf(stack.pop()!);
  return out;
}
