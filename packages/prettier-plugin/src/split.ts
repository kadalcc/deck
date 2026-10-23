/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CUTTING A DECK INTO PIECES, the engine's way
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The same reading of the text as `@kadal/deck`'s compiler (packages/deck/src/compiler/split.ts,
 * `cut`), kept here so the plugin installs without the engine: a `---` line starts a slide, a
 * `----` line starts one beneath the last, the block after a separator is that slide's YAML when
 * it reads as YAML and a `---` closes it, a bare ```yaml fence as the first thing in a body is
 * "block frontmatter", and the fenced YAML at the top of the file is the headmatter. Fenced code
 * is never cut. split.test.ts checks this file against the engine's on the showcase and on the
 * tricky fixtures, piece for piece.
 *
 * Unlike the engine's, a piece here keeps the lines as written — the separator, the fences, the
 * blank lines — because a formatter rebuilds the text from them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const HORIZONTAL = /^---\s*$/;
export const VERTICAL = /^----+\s*$/;
const FRONTMATTER_LINE = /^\s*[A-Za-z_][\w.-]*\s*:(\s|$)/;
const COMARK_OPEN = /^\s*(:{2,})[A-Za-z][\w-]*(?:[[{].*)?\s*$/;
const COMARK_CLOSE = /^\s*(:{2,})\s*$/;

/** True when every non-empty line could be a YAML mapping line or a continuation (split.ts). */
export function looksLikeYaml(lines: string[]): boolean {
  let any = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^\s+/.test(line) || /^\s*-\s/.test(line) || /^\s*#/.test(line)) continue;
    if (!FRONTMATTER_LINE.test(line)) return false;
    any = true;
  }
  return any;
}

export interface PieceFrontmatter {
  /** `---` fences (the separator opens it), or a ```yaml block as the body's first thing. */
  kind: "fence" | "block";
  /** The YAML between the fences, as written. */
  yaml: string;
  /** For a block: its opening and closing fence lines as written (```yaml … ```). */
  open: string;
  close: string;
}

export interface Piece {
  /** The separator line as written; null for the piece at the top of the file. */
  separator: string | null;
  vertical: boolean;
  frontmatter: PieceFrontmatter | null;
  /** The body's lines (after the frontmatter, or the separator), as written. */
  body: string[];
  /** 0-based line where the piece starts in the text, for messages. */
  line: number;
}

/**
 * Cut the text at separators (the engine's `cut`, line for line). The head piece is always first,
 * possibly empty.
 */
export function cutDeck(text: string): Piece[] {
  const lines = text.split(/\r?\n/);
  const pieces: Piece[] = [];

  const blockAt = (from: number): { yaml: string; open: number; close: number } | null => {
    let k = from;
    while (k < lines.length && !lines[k]!.trim()) k++;
    const open = /^\s*(`{3,}|~{3,})ya?ml\s*$/.exec(lines[k] ?? "");
    if (!open) return null;
    const mark = open[1]!;
    for (let c = k + 1; c < lines.length; c++) {
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(lines[c]!);
      if (close && close[1]![0] === mark[0] && close[1]!.length >= mark.length)
        return { yaml: lines.slice(k + 1, c).join("\n"), open: k, close: c };
    }
    return null;
  };

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

  // A `---` inside a closed Comark block is its props or content (the engine's comarkCloseOf).
  const comarkCloseOf = (at: number, colons: number): number => {
    let code = "";
    for (let k = at + 1; k < lines.length; k++) {
      const l = lines[k]!;
      const f = /^\s*(`{3,}|~{3,})/.exec(l)?.[1];
      if (f && !code) code = f;
      else if (f && f[0] === code[0] && f.length >= code.length) code = "";
      if (code) continue;
      if (COMARK_CLOSE.exec(l)?.[1]!.length === colons) return k;
      if (COMARK_OPEN.exec(l)?.[1]!.length === colons) return -1;
    }
    return -1;
  };
  let comarkUntil = -1;

  let i = 0;
  let firstContent = 0;
  while (firstContent < lines.length && !lines[firstContent]!.trim()) firstContent++;
  const head: Piece = { separator: null, vertical: false, frontmatter: null, body: [], line: 0 };
  if (firstContent < lines.length && HORIZONTAL.test(lines[firstContent]!)) {
    const fm = frontmatterAt(firstContent + 1);
    if (fm) {
      head.frontmatter = { kind: "fence", yaml: fm.yaml, open: "---", close: "---" };
      i = fm.next;
    }
  }
  pieces.push(head);

  let inFence = false;
  let fence = "";
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
    if (!inFence && i > comarkUntil) {
      const open = COMARK_OPEN.exec(line);
      if (open) comarkUntil = comarkCloseOf(i, open[1]!.length);
    }
    if (!inFence && i > comarkUntil && (HORIZONTAL.test(line) || VERTICAL.test(line))) {
      const vertical = VERTICAL.test(line);
      const fm = frontmatterAt(i + 1);
      const block = fm ? null : blockAt(i + 1);
      const piece: Piece = { separator: line, vertical, frontmatter: null, body: [], line: i };
      if (fm) {
        piece.frontmatter = { kind: "fence", yaml: fm.yaml, open: "---", close: "---" };
        i = fm.next - 1;
      } else if (block) {
        piece.frontmatter = {
          kind: "block",
          yaml: block.yaml,
          open: lines[block.open]!,
          close: lines[block.close]!,
        };
        i = block.close;
      }
      pieces.push(piece);
      continue;
    }
    pieces[pieces.length - 1]!.body.push(line);
  }
  return pieces;
}

/** Whether a piece becomes a slide in the engine (split.ts: an empty head is not; an empty
 * later piece is one only when it carries frontmatter). */
export function isSlide(piece: Piece, index: number, frontmatterKeys: number): boolean {
  const blank = !piece.body.join("\n").trim();
  if (!blank) return true;
  return index > 0 && frontmatterKeys > 0;
}
