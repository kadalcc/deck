import type { Element, ElementContent, Root, RootContent } from "hast";

import { diffLines } from "../compiler/diff-lines.ts";
import { type SlideRange, extractNotes } from "../compiler/split.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EDITING IN PLACE: where a slide's text sits in its file
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The builder's preview lets a person double-click a heading and retype it (runtime/edit.ts).
 * The preview never changes the deck: it tells the editor "replace characters from–to of this
 * file with this text", and the editor, which owns the text, does it. So every editable element
 * must know its range in the file AS THE EDITOR SENT IT — not in the string MDX compiled, which
 * is several steps away from it:
 *
 *   file text (CRLF or LF, headmatter, separators, frontmatter)
 *     → the slide's lines, `range.body` to `range.end` (split.ts; `\r` dropped)
 *     → notes, comments and `<style>` blanked (extractNotes: line breaks kept, so line k is line k)
 *     → trimmed (leading blank lines and the first line's indent gone)
 *     → snippets, `::slots::`, code groups and magic moves expanded (lines added or rewritten)
 *     → the string MDX compiles, whose positions the hast carries.
 *
 * The map runs that chain backwards by LINES, which every step but the last keeps: a compiled
 * line maps to a body line by the trim's offset (or, when the last step changed the text, by a
 * line diff — lines it did not touch are found again unchanged), and a body line to its file line
 * by `range.body`. Columns carry over only on lines the blanking left exactly as written; a line
 * with an inline `<Notes>` or comment does not map, and its text stays "edit in source".
 *
 * Nothing is trusted on the way: a range is handed out only when the file's own characters there
 * are the element's text (the CRLF spelling of a multi-line text counts), so a wrong guess can
 * only make an element not editable, never point an edit at the wrong text.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SourceLocator {
  /** The file offset (UTF-16) of an offset into the compiled slide, or null when it does not map. */
  offset(at: number): number | null;
  /**
   * The file range of the compiled slide's characters from `start`, when the file has exactly
   * `text` there (the compiled characters, or their CRLF spelling). Null otherwise.
   */
  range(start: number, text: string): { from: number; to: number } | null;
}

/** Offsets where each line starts in `text`, split as split.ts splits (`\r?\n`). */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

/** A line of `text` without its line break (`\r\n` or `\n`). */
const lineAt = (text: string, starts: number[], k: number): string => {
  const last = k + 1 >= starts.length;
  const line = text.slice(starts[k]!, last ? text.length : starts[k + 1]! - 1);
  return !last && line.endsWith("\r") ? line.slice(0, -1) : line;
};

/** 1-based line and column of a UTF-16 offset (a `\r` before the `\n` belongs to its line). */
export function lineColumn(text: string, offset: number): { line: number; column: number } {
  const at = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let start = 0;
  for (let i = text.indexOf("\n"); i >= 0 && i < at; i = text.indexOf("\n", i + 1)) {
    line++;
    start = i + 1;
  }
  return { line, column: at - start + 1 };
}

/**
 * The locator for one slide: `text` is its file's text as the editor sent it, `range` its lines
 * there (split.ts), `content` the string its MDX was compiled from (PreparedSlide.content).
 */
export function slideLocator(text: string, range: SlideRange, content: string): SourceLocator {
  const starts = lineStarts(text);
  const end = Math.min(range.end, starts.length);
  const original: string[] = [];
  for (let k = range.body; k < end; k++) original.push(lineAt(text, starts, k));
  // What split.ts made of those lines before trimming them: the same lines, notes blanked.
  const body = extractNotes(original.join("\n")).content;
  const bodyLines = body.split("\n");
  const lead = body.length - body.trimStart().length;
  const leadLines = body.slice(0, lead).split("\n").length - 1;
  const leadColumns = lead - (body.lastIndexOf("\n", lead - 1) + 1);
  const trimmed = body.trim();

  // Compiled line → trimmed line: the same, unless snippets/slots/groups/magic rewrote the text.
  const compiledStarts = lineStarts(content);
  let toTrimmed: (line: number) => number | null = (line) => line;
  if (content !== trimmed) {
    const map = new Map<number, number>();
    let a = 0;
    let b = 0;
    for (const op of diffLines(trimmed, content)) {
      if (op.kind === "same") map.set(b++, a++);
      else if (op.kind === "remove") a++;
      else b++;
    }
    toTrimmed = (line) => map.get(line) ?? null;
  }

  const offset = (at: number): number | null => {
    if (at < 0 || at > content.length) return null;
    let line = 0;
    while (line + 1 < compiledStarts.length && compiledStarts[line + 1]! <= at) line++;
    const t = toTrimmed(line);
    if (t === null) return null;
    const k = t + leadLines;
    const column = at - compiledStarts[line]! + (t === 0 ? leadColumns : 0);
    // Columns carry over only where the blanking left the line exactly as written.
    if (k >= original.length || bodyLines[k] !== original[k]) return null;
    if (column > original[k]!.length) return null;
    return starts[range.body + k]! + column;
  };

  return {
    offset,
    range(start, expect) {
      const from = offset(start);
      if (from === null) return null;
      if (text.startsWith(expect, from)) return { from, to: from + expect.length };
      if (expect.includes("\n")) {
        const crlf = expect.replace(/\n/g, "\r\n");
        if (text.startsWith(crlf, from)) return { from, to: from + crlf.length };
      }
      return null;
    },
  };
}

/**
 * The elements whose text a person may retype in the preview, when that text is ONE plain run
 * of the source: headings, paragraphs, list items, table cells. (A blockquote's text is its
 * paragraph's.) Every other element is only located — a click puts the editor's cursor there.
 */
export const EDITABLE = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "td", "th"]);

/** Elements that take a line break (Shift+Enter) while edited: a paragraph's soft break. */
export const MULTILINE = new Set(["p"]);

export interface RehypeEditSpotsOptions {
  file: string;
  /** The string MDX compiled (the slide's content). */
  source: string;
  locate: SourceLocator;
}

/**
 * The rehype pass, first among them so it sees the tree as Markdown made it (before the glossary
 * wraps terms or code is highlighted). Every element with a position gets `data-deck-at` (its
 * file offset) and `data-deck-file`; an editable one whose only content is one text run, spelled
 * in the source exactly as shown, also gets `data-deck-edit="from-to"`. Preview compiles only
 * (`compileDeck({ editable: true })`); nothing else ever runs it.
 */
export function rehypeEditSpots(options: RehypeEditSpotsOptions) {
  const { file, source, locate } = options;
  const tag = (el: Element) => {
    const start = el.position?.start.offset;
    const at = start === undefined ? null : locate.offset(start);
    if (at === null) return;
    el.properties = { ...el.properties, dataDeckAt: String(at), dataDeckFile: file };
    if (!EDITABLE.has(el.tagName)) return;
    // Markdown adds line-break text nodes between block children; they have no position.
    const content = el.children.filter(
      (c) => !(c.type === "text" && !c.position && !c.value.trim()),
    );
    const only = content.length === 1 ? content[0]! : null;
    if (only?.type !== "text" || !only.value.trim()) return;
    const a = only.position?.start.offset;
    const b = only.position?.end.offset;
    if (a === undefined || b === undefined) return;
    // The text as shown must be the source as written: no escapes, entities or autolinks.
    if (source.slice(a, b) !== only.value) return;
    const r = locate.range(a, only.value);
    if (r) el.properties.dataDeckEdit = `${r.from}-${r.to}`;
  };
  const visit = (node: Root | RootContent | ElementContent) => {
    if (node.type === "element") tag(node);
    if ("children" in node) for (const child of node.children) visit(child as RootContent);
  };
  return () => (tree: Root) => visit(tree);
}
