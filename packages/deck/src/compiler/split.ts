import YAML from "yaml";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECK FILE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A deck is one MDX file, `deck.mdx`, read the way Slidev reads its Markdown and reveal.js reads
 * its external Markdown — as text first, slides second:
 *
 *   ---            a line of three dashes starts the next slide (horizontal)
 *   ----           a line of four or more dashes starts a slide BENEATH the previous one
 *                  (a vertical stack, the reveal.js idea: a deep dive the audience may skip)
 *   ---            the block right after a separator is that slide's FRONTMATTER when it is YAML
 *   key: value     and closes with another line of three dashes; a fenced block at the very top
 *   ---            of the file is the HEADMATTER, which configures the whole deck
 *   <Notes>…</Notes>   anywhere in a slide: speaker notes, compiled as MDX of their own
 *   src: ./file.mdx    a frontmatter-only slide that pulls the slides of another file in
 *
 * Everything in between is MDX: Markdown, JSX, the engine's components. This module only cuts
 * the text; the Vite plugin turns the pieces into modules.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Frontmatter = Record<string, unknown>;

export interface RawSlide {
  /** Flat index in authored order, 0-based. */
  index: number;
  /** Horizontal column and vertical position in it. */
  h: number;
  v: number;
  frontmatter: Frontmatter;
  /** The slide's MDX with notes and frontmatter removed. */
  content: string;
  /** The notes' MDX, or null when the slide has none. */
  notes: string | null;
  /** Where the slide starts, for error messages and the editor. */
  source: { file: string; line: number };
  /** The slide's exact lines in its file, for tools that edit the deck as text. */
  range: SlideRange;
}

/**
 * Where a slide sits in its file, as 0-based line numbers into `text.split(/\r?\n/)`. Everything
 * an editor needs to rewrite one slide and leave every other byte alone.
 */
export interface SlideRange {
  file: string;
  /** First line of the slide's piece: its separator, or 0 for the piece at the top of the file. */
  start: number;
  /** Exclusive end: the next piece's separator, or the line count. */
  end: number;
  /** The separator line's kind; null for the piece at the top of the file. */
  separator: "horizontal" | "vertical" | null;
  /**
   * The fence lines around the slide's YAML, when it has some. On the top piece this is the
   * headmatter, which configures the deck as well as the first slide.
   */
  frontmatter: { open: number; close: number } | null;
  /** First line of the body (after the frontmatter or the separator). */
  body: number;
  /** True for the piece at the top of the file (no separator line of its own). */
  head: boolean;
  /** For a slide pulled in by `src:`, the including piece in the parent file. */
  includedBy: { file: string; start: number; end: number } | null;
}

export interface SplitResult {
  headmatter: Frontmatter;
  slides: RawSlide[];
}

export interface SplitOptions {
  file: string;
  /** Returns the text of an included file (the `src:` frontmatter), or null when it is missing. */
  resolveInclude?: (path: string, from: string) => { file: string; text: string } | null;
  /**
   * Called for a frontmatter block that is not valid YAML, or an include that cannot be read,
   * instead of throwing — for linters that want every problem, not the first. The block then
   * counts as empty and the include as no slides.
   */
  onError?: (error: { message: string; file: string; line: number }) => void;
}

const HORIZONTAL = /^---\s*$/;
const VERTICAL = /^----+\s*$/;
const FRONTMATTER_LINE = /^\s*[A-Za-z_][\w.-]*\s*:(\s|$)/;
const NOTES = /<Notes(?:\s[^>]*)?>([\s\S]*?)<\/Notes>/g;

/** True when every non-empty line of `lines` could be a YAML mapping line or a continuation. */
function looksLikeYaml(lines: string[]): boolean {
  let any = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^\s+/.test(line) || /^\s*-\s/.test(line) || /^\s*#/.test(line)) continue;
    if (!FRONTMATTER_LINE.test(line)) return false;
    any = true;
  }
  return any;
}

function parseYaml(
  text: string,
  where: string,
  onError?: SplitOptions["onError"],
  at?: { file: string; line: number },
): Frontmatter {
  if (onError && at) {
    try {
      return parseYaml(text, where);
    } catch (e) {
      // YAML's own position, relative to the block, when it has one.
      const pos = (e as { linePos?: Array<{ line: number }> }).linePos?.[0]?.line;
      const message = (e instanceof Error ? e.message : String(e)).split("\n")[0]!;
      onError({ message, file: at.file, line: at.line + (pos ? pos - 1 : 0) });
      return {};
    }
  }
  const value = YAML.parse(text) as unknown;
  if (value === null || value === undefined) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${where}: frontmatter must be a YAML mapping`);
  }
  return value as Frontmatter;
}

interface Piece {
  vertical: boolean;
  frontmatter: string | null;
  lines: string[];
  /** 1-based line of the piece's first content line. */
  line: number;
  /** 0-based first line (the separator) and exclusive end; the fence lines when there is YAML. */
  start: number;
  end: number;
  fence: { open: number; close: number } | null;
}

/**
 * Cut the text at separators, taking fenced frontmatter as it goes. After a separator at line i,
 * if the lines up to the next `---` read as YAML, they are that piece's frontmatter and the closing
 * fence is consumed rather than treated as another separator. The head piece works the same way
 * when the file opens with a fence. Fenced code is never cut.
 */
function cut(text: string): Piece[] {
  const lines = text.split(/\r?\n/);
  const pieces: Piece[] = [];
  let inFence = false;
  let fence = "";

  /** Try to read a fenced YAML block starting at `from` (the line after an opening fence). */
  const frontmatterAt = (from: number): { yaml: string; next: number } | null => {
    let close = -1;
    for (let k = from; k < lines.length; k++) {
      const l = lines[k]!;
      if (HORIZONTAL.test(l)) {
        close = k;
        break;
      }
      if (VERTICAL.test(l)) return null;
    }
    if (close === -1) return null;
    const block = lines.slice(from, close);
    if (!looksLikeYaml(block)) return null;
    return { yaml: block.join("\n"), next: close + 1 };
  };

  let i = 0;
  // The head: an opening fence at the very top is headmatter.
  let firstContent = 0;
  while (firstContent < lines.length && !lines[firstContent]!.trim()) firstContent++;
  let head: Piece = {
    vertical: false,
    frontmatter: null,
    lines: [],
    line: 1,
    start: 0,
    end: lines.length,
    fence: null,
  };
  if (firstContent < lines.length && HORIZONTAL.test(lines[firstContent]!)) {
    const fm = frontmatterAt(firstContent + 1);
    if (fm) {
      head = {
        ...head,
        frontmatter: fm.yaml,
        line: fm.next + 1,
        fence: { open: firstContent, close: fm.next - 1 },
      };
      i = fm.next;
    }
  }
  pieces.push(head);

  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const mark = fenceMatch[1]!;
      if (!inFence) {
        inFence = true;
        fence = mark;
      } else if (mark[0] === fence[0] && mark.length >= fence.length) {
        inFence = false;
      }
    }
    if (!inFence && (HORIZONTAL.test(line) || VERTICAL.test(line))) {
      const vertical = VERTICAL.test(line);
      const fm = frontmatterAt(i + 1);
      pieces[pieces.length - 1]!.end = i;
      const base = { vertical, lines: [], start: i, end: lines.length };
      if (fm) {
        pieces.push({
          ...base,
          frontmatter: fm.yaml,
          line: fm.next + 1,
          fence: { open: i, close: fm.next - 1 },
        });
        i = fm.next - 1;
      } else {
        pieces.push({ ...base, frontmatter: null, line: i + 2, fence: null });
      }
      continue;
    }
    pieces[pieces.length - 1]!.lines.push(line);
  }
  return pieces;
}

/**
 * Character ranges of fenced code blocks (``` or ~~~, closed by a fence of the same kind and at
 * least the same length, or the end of the text). Things that look like syntax inside them — a
 * `<Notes>` in an example, a `---` in YAML — are code, not structure.
 */
export function fencedRanges(text: string): Array<[number, number]> {
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

/** The `<Notes>…</Notes>` blocks of a slide that are not inside fenced code. */
export function notesBlocks(content: string): Array<{ start: number; end: number; inner: string }> {
  const fences = fencedRanges(content);
  const out: Array<{ start: number; end: number; inner: string }> = [];
  for (const m of content.matchAll(NOTES)) {
    const start = m.index!;
    if (fences.some(([a, b]) => start >= a && start < b)) continue;
    out.push({ start, end: start + m[0].length, inner: m[1]! });
  }
  return out;
}

function extractNotes(content: string): { content: string; notes: string | null } {
  const blocks = notesBlocks(content);
  if (!blocks.length) return { content, notes: null };
  let stripped = "";
  let at = 0;
  for (const b of blocks) {
    stripped += content.slice(at, b.start);
    at = b.end;
  }
  stripped += content.slice(at);
  return { content: stripped, notes: blocks.map((b) => b.inner.trim()).join("\n\n") };
}

/**
 * Split a deck file into slides. Includes (`src:`) are expanded in place; a piece that is only
 * frontmatter with a `src` contributes the included file's slides, with the included file's own
 * headmatter and the piece's remaining frontmatter merged into the first of them.
 */
export function splitDeck(text: string, options: SplitOptions): SplitResult {
  const pieces = cut(text);
  const head = pieces[0]!;
  const headmatter = head.frontmatter
    ? parseYaml(head.frontmatter, `${options.file}:1`, options.onError, {
        file: options.file,
        line: (head.fence?.open ?? 0) + 2,
      })
    : {};

  const slides: RawSlide[] = [];
  let h = -1;
  let v = 0;

  const push = (
    content: string,
    frontmatter: Frontmatter,
    vertical: boolean,
    source: RawSlide["source"],
    range: SlideRange,
  ) => {
    if (vertical && h >= 0) v++;
    else {
      h++;
      v = 0;
    }
    const { content: body, notes } = extractNotes(content);
    slides.push({
      index: slides.length,
      h,
      v,
      frontmatter,
      content: body.trim(),
      notes,
      source,
      range,
    });
  };
  const rangeOf = (piece: Piece, i: number): SlideRange => ({
    file: options.file,
    start: piece.start,
    end: piece.end,
    separator: i === 0 ? null : piece.vertical ? "vertical" : "horizontal",
    frontmatter: piece.fence,
    body: piece.line - 1,
    head: i === 0,
    includedBy: null,
  });

  pieces.forEach((piece, i) => {
    const where = `${options.file}:${piece.line}`;
    // The head piece's fence is headmatter — and, as in Slidev, the first slide's frontmatter too,
    // so `layout: cover` or `background:` at the top of the file style the title slide.
    const frontmatter =
      i === 0
        ? { ...headmatter }
        : !piece.frontmatter
          ? {}
          : parseYaml(piece.frontmatter, where, options.onError, {
              file: options.file,
              line: piece.start + 2,
            });
    const content = piece.lines.join("\n");
    const blank = !content.trim();

    if (typeof frontmatter.src === "string") {
      const { src, ...merge } = frontmatter;
      const included = options.resolveInclude?.(src, options.file);
      if (!included) {
        const message = `cannot include "${src}"`;
        if (!options.onError) throw new Error(`${where}: ${message}`);
        options.onError({ message, file: options.file, line: piece.start + 2 });
        return;
      }
      const inner = splitDeck(included.text, { ...options, file: included.file });
      inner.slides.forEach((s, j) => {
        push(
          s.content + (s.notes ? `\n\n<Notes>${s.notes}</Notes>` : ""),
          j === 0 ? { ...inner.headmatter, ...s.frontmatter, ...merge } : s.frontmatter,
          j === 0 ? piece.vertical : s.v > 0,
          s.source,
          {
            ...s.range,
            includedBy: s.range.includedBy ?? {
              file: options.file,
              start: piece.start,
              end: piece.end,
            },
          },
        );
      });
      return;
    }
    // An empty head piece is not a slide; an empty later piece is a blank slide only when it
    // carries frontmatter (a deliberate pause), otherwise it is skipped.
    if (blank && (i === 0 || !Object.keys(frontmatter).length)) return;
    push(
      content,
      frontmatter,
      piece.vertical,
      { file: options.file, line: piece.line },
      rangeOf(piece, i),
    );
  });

  return { headmatter, slides };
}

/** The title a slide reports to the table of contents: frontmatter `title`, else its first heading. */
export function titleOf(slide: Pick<RawSlide, "content" | "frontmatter">): string | null {
  if (typeof slide.frontmatter.title === "string") return slide.frontmatter.title;
  const m = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/m.exec(slide.content);
  if (!m) return null;
  return (
    m[1]!
      .replace(/[*_`~]/g, "")
      .replace(/<[^>]+>/g, "")
      .trim() || null
  );
}

/** The level of the title, for the table of contents: frontmatter `level`, else the heading depth. */
export function levelOf(slide: Pick<RawSlide, "content" | "frontmatter">): number {
  if (typeof slide.frontmatter.level === "number") return slide.frontmatter.level;
  const m = /^\s*(#{1,6})\s+/m.exec(slide.content);
  return m ? m[1]!.length : 1;
}
