import YAML from "yaml";

import type { RawSlide } from "../compiler/split.ts";
import { type DeckFiles, type SlideRef, findSlide, readDeck } from "./source.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EDITING A DECK AS TEXT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every operation finds the slide through `splitDeck`'s line ranges and rewrites only those lines
 * of the one file the slide lives in (deck.mdx, or a file it includes with `src:`), so every
 * other byte — comments, spacing, other slides — stays exactly as it was. Frontmatter is edited
 * with YAML's document model, which keeps comments and key order. Each operation re-splits the
 * result and refuses to return text that no longer parses.
 *
 * The first slide is special, as in Slidev: the YAML at the top of the file (the headmatter)
 * configures the whole deck AND is that slide's frontmatter. Edits to the first slide's
 * frontmatter therefore edit the headmatter; a full replace keeps the deck-level keys.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface EditResult {
  /** Changed files and their new text. Nothing is written; the caller saves them. */
  files: Record<string, string>;
  /** The edited (or added, or moved) slide's index after the edit, when there is one. */
  index: number | null;
  /** Things worth telling whoever asked (a stack that was split, a headmatter merge). */
  notes: string[];
}

export interface FrontmatterPatch {
  [key: string]: unknown;
}

const NOTES_BLOCK = /\n*[ \t]*<Notes(?:\s[^>]*)?>[\s\S]*?<\/Notes>[ \t]*/g;

class Doc {
  readonly texts = new Map<string, string>();
  constructor(private readonly base: DeckFiles) {}
  read = (path: string): string | null => this.texts.get(path) ?? this.base.read(path);
  files(): DeckFiles {
    return { entry: this.base.entry, read: this.read };
  }
  lines(file: string): { lines: string[]; eol: string } {
    const text = this.read(file);
    if (text === null) throw new Error(`${file} does not exist`);
    return { lines: text.split(/\r?\n/), eol: text.includes("\r\n") ? "\r\n" : "\n" };
  }
  splice(file: string, start: number, remove: number, insert: string[]) {
    const { lines, eol } = this.lines(file);
    lines.splice(start, remove, ...insert);
    this.texts.set(file, lines.join(eol));
  }
  deck() {
    const d = readDeck(this.files());
    if (d.problems.length)
      throw new Error(d.problems.map((p) => `${p.file}:${p.line}: ${p.message}`).join("\n"));
    return d;
  }
  result(index: number | null, notes: string[] = []): EditResult {
    // Refuse to hand back a deck that no longer splits.
    this.deck();
    return { files: Object.fromEntries(this.texts), index, notes };
  }
}

function require(slides: RawSlide[], ref: SlideRef): RawSlide {
  const s = findSlide(slides, ref);
  if (!s)
    throw new Error(
      `No slide ${JSON.stringify(ref)} (the deck has ${slides.length}: use an index 0–${slides.length - 1}, "h.v", or an id)`,
    );
  return s;
}

/** Content lines for a body: a blank line before (unless at the very top), one after. */
function bodyLines(content: string, top: boolean): string[] {
  const text = content.replace(/\r\n/g, "\n").replace(/^\n+|\s+$/g, "");
  const lines = text ? text.split("\n") : [];
  return top ? [...lines, ""] : ["", ...lines, ""];
}

function yamlLines(value: Record<string, unknown>): string[] {
  if (!Object.keys(value).length) return [];
  return YAML.stringify(value, { lineWidth: 0 }).replace(/\n+$/, "").split("\n");
}

/** The slide's body as written (notes included), from its own file. */
function rawBody(doc: Doc, s: RawSlide): string {
  const { lines } = doc.lines(s.range.file);
  return lines.slice(s.range.body, s.range.end).join("\n");
}

function notesOf(body: string): string[] {
  return [...body.matchAll(NOTES_BLOCK)].map((m) => m[0].trim());
}

/** Keys that configure the deck rather than a slide (they live only in the headmatter). */
export function deckOnlyKeys(deckKeys: Iterable<string>, slideKeys: Iterable<string>): Set<string> {
  const slide = new Set(slideKeys);
  return new Set([...deckKeys].filter((k) => !slide.has(k)));
}

function writeFrontmatter(
  doc: Doc,
  s: RawSlide,
  edit: (current: YAML.Document | null) => YAML.Document | null,
) {
  const r = s.range;
  const { lines } = doc.lines(r.file);
  if (r.frontmatter) {
    const yamlStart = r.head ? r.frontmatter.open + 1 : r.frontmatter.open + 1;
    const current = YAML.parseDocument(lines.slice(yamlStart, r.frontmatter.close).join("\n"));
    const next = edit(current);
    const empty = !next || !YAML.isMap(next.contents) || next.contents.items.length === 0;
    if (empty) {
      // Drop the block: the fence lines too (a slide keeps its separator).
      if (r.head)
        doc.splice(r.file, r.frontmatter.open, r.frontmatter.close - r.frontmatter.open + 1, []);
      else doc.splice(r.file, yamlStart, r.frontmatter.close - yamlStart + 1, []);
      return;
    }
    const text = next.toString({ lineWidth: 0 }).replace(/\n+$/, "");
    doc.splice(r.file, yamlStart, r.frontmatter.close - yamlStart, text.split("\n"));
    return;
  }
  const next = edit(null);
  if (!next || !YAML.isMap(next.contents) || next.contents.items.length === 0) return;
  const yaml = next.toString({ lineWidth: 0 }).replace(/\n+$/, "").split("\n");
  if (r.head) {
    // No fence at the top yet: open one. A body that starts right away gets a blank line after.
    let at = 0;
    while (at < r.end && !lines[at]!.trim()) at++;
    doc.splice(r.file, at, 0, ["---", ...yaml, "---", ...(lines[at]?.trim() ? [""] : [])]);
  } else doc.splice(r.file, r.start + 1, 0, [...yaml, "---"]);
}

function patchDocument(current: YAML.Document | null, patch: FrontmatterPatch): YAML.Document {
  const d = current ?? new YAML.Document({});
  if (!YAML.isMap(d.contents)) d.contents = d.createNode({}) as never;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) d.delete(k);
    else d.set(k, v);
  }
  return d;
}

export interface SlideUpdate {
  /** New MDX body. Speaker notes already on the slide are kept unless this has its own <Notes>. */
  content?: string;
  /** Replace the frontmatter entirely (on the first slide, deck-level keys are kept). */
  frontmatter?: Record<string, unknown>;
  /** Merge into the frontmatter; a null value deletes that key. */
  patch?: FrontmatterPatch;
  /** With `content`: false drops the old notes too. Default true. */
  keepNotes?: boolean;
}

/**
 * Update one slide's body and/or frontmatter. `deckKeys` (names that are deck-level only) keeps
 * the headmatter's deck settings when the first slide's frontmatter is replaced.
 */
export function updateSlide(
  files: DeckFiles,
  ref: SlideRef,
  update: SlideUpdate,
  deckKeys: Set<string> = new Set(),
): EditResult {
  const doc = new Doc(files);
  const notes: string[] = [];
  let s = require(doc.deck().slides, ref);
  const index = s.index;
  if (update.content !== undefined) {
    let content = update.content;
    if (update.keepNotes !== false && !/<Notes\b/.test(content)) {
      const old = notesOf(rawBody(doc, s));
      if (old.length) content = `${content.replace(/\s+$/, "")}\n\n${old.join("\n\n")}`;
    }
    doc.splice(
      s.range.file,
      s.range.body,
      s.range.end - s.range.body,
      bodyLines(content, s.range.head && !s.range.frontmatter),
    );
    s = require(doc.deck().slides, index);
  }
  if (update.frontmatter || update.patch) {
    if (s.range.includedBy && Object.keys(update.patch ?? update.frontmatter ?? {}).length)
      notes.push(`Slide ${index} lives in ${s.range.file}; its frontmatter was edited there.`);
    writeFrontmatter(doc, s, (current) => {
      let d = current;
      if (update.frontmatter) {
        const keep: Record<string, unknown> = {};
        if (s.range.head && current) {
          const now = (current.toJS() ?? {}) as Record<string, unknown>;
          for (const [k, v] of Object.entries(now)) if (deckKeys.has(k)) keep[k] = v;
        }
        const replacement = { ...keep, ...update.frontmatter };
        // Keep comments and order for keys that stay; drop the rest.
        d = current ?? new YAML.Document({});
        const existing = (d.toJS() ?? {}) as Record<string, unknown>;
        const patch: FrontmatterPatch = { ...replacement };
        for (const k of Object.keys(existing)) if (!(k in replacement)) patch[k] = null;
        d = patchDocument(d, patch);
      }
      if (update.patch) d = patchDocument(d, update.patch);
      return d;
    });
  }
  return doc.result(index, notes);
}

/** Set (or with null/"" remove) a slide's speaker notes. `[click]` markers pace them. */
export function setNotes(files: DeckFiles, ref: SlideRef, notes: string | null): EditResult {
  const doc = new Doc(files);
  const s = require(doc.deck().slides, ref);
  const body = rawBody(doc, s).replace(NOTES_BLOCK, "").replace(/\s+$/, "");
  const next = notes?.trim() ? `${body}\n\n<Notes>\n${notes.trim()}\n</Notes>` : body;
  doc.splice(
    s.range.file,
    s.range.body,
    s.range.end - s.range.body,
    bodyLines(next, s.range.head && !s.range.frontmatter),
  );
  return doc.result(s.index);
}

/** Merge into the deck's headmatter (null deletes a key). */
export function updateHeadmatter(files: DeckFiles, patch: FrontmatterPatch): EditResult {
  const doc = new Doc(files);
  const { lines, eol } = doc.lines(files.entry);
  const deck = doc.deck();
  const first = deck.slides[0];
  if (first && first.range.head && first.range.file === files.entry) {
    writeFrontmatter(doc, first, (current) => patchDocument(current, patch));
    return doc.result(null);
  }
  // No slide comes from the top piece (an empty body, or an empty file): edit the fence directly.
  let at = 0;
  while (at < lines.length && !lines[at]!.trim()) at++;
  if (lines[at] === "---") {
    let close = at + 1;
    while (close < lines.length && lines[close] !== "---") close++;
    const current = YAML.parseDocument(lines.slice(at + 1, close).join("\n"));
    const next = patchDocument(current, patch).toString({ lineWidth: 0 }).replace(/\n+$/, "");
    if (close < lines.length && deck.headmatter && Object.keys(deck.headmatter).length) {
      doc.splice(files.entry, at + 1, close - at - 1, next.split("\n"));
      return doc.result(null);
    }
  }
  const yaml = yamlLines(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null)));
  doc.texts.set(files.entry, ["---", ...yaml, "---", "", ...lines].join(eol));
  return doc.result(null);
}

export interface NewSlide {
  /** MDX body. */
  content: string;
  frontmatter?: Record<string, unknown>;
  notes?: string;
}

function pieceLines(slide: NewSlide, vertical: boolean): string[] {
  const fm = yamlLines(slide.frontmatter ?? {});
  let content = slide.content.replace(/\s+$/, "");
  if (slide.notes?.trim()) content += `\n\n<Notes>\n${slide.notes.trim()}\n</Notes>`;
  return [
    vertical ? "----" : "---",
    ...(fm.length ? [...fm, "---"] : []),
    ...bodyLines(content, false),
  ];
}

/** Where a new piece goes so that it becomes slide `at`: a file and a line to insert before. */
function insertionPoint(
  doc: Doc,
  slides: RawSlide[],
  at: number,
): { file: string; line: number } | "top" | "end" {
  if (at >= slides.length) return "end";
  const target = slides[at]!;
  const r = target.range;
  if (r.head && r.file === doc.files().entry) return "top";
  if (r.head && r.includedBy) return { file: r.includedBy.file, line: r.includedBy.start };
  return { file: r.file, line: r.start };
}

function insertPiece(doc: Doc, at: number, lines: string[], slide: NewSlide): string[] {
  const notes: string[] = [];
  const slides = doc.deck().slides;
  const point = insertionPoint(doc, slides, Math.max(0, at));
  if (point === "end") {
    const entry = doc.files().entry;
    const { lines: all } = doc.lines(entry);
    while (all.length && !all[all.length - 1]!.trim()) all.pop();
    doc.splice(entry, 0, Infinity, [...all, ...(all.length ? [""] : []), ...lines]);
    return notes;
  }
  if (point === "top") {
    // The new slide becomes the title slide: its body goes right after the headmatter, and the
    // old first slide follows behind a separator.
    const first = slides[0]!;
    let content = slide.content.replace(/\s+$/, "");
    if (slide.notes?.trim()) content += `\n\n<Notes>\n${slide.notes.trim()}\n</Notes>`;
    doc.splice(first.range.file, first.range.body, 0, [
      ...bodyLines(content, !first.range.frontmatter),
      "---",
    ]);
    if (slide.frontmatter && Object.keys(slide.frontmatter).length) {
      const s0 = doc.deck().slides[0]!;
      writeFrontmatter(doc, s0, (current) => patchDocument(current, slide.frontmatter!));
      notes.push(
        "The first slide's frontmatter is the headmatter: the new slide's keys were merged into it.",
      );
    }
    if (first.range.frontmatter)
      notes.push(
        "The previous first slide no longer gets the headmatter's slide keys (layout, background…); set them on it if it needs them.",
      );
    return notes;
  }
  doc.splice(point.file, point.line, 0, lines);
  return notes;
}

/**
 * Add a slide so that it ends up at index `at` (default: the end). `vertical` puts it beneath
 * the slide before it, in the same column (reveal.js's vertical stack).
 */
export function addSlide(
  files: DeckFiles,
  slide: NewSlide,
  at?: number,
  vertical = false,
): EditResult {
  const doc = new Doc(files);
  const before = doc.deck().slides;
  const target = at === undefined ? before.length : Math.max(0, Math.min(at, before.length));
  const notes: string[] = [];
  if (vertical && target === 0)
    notes.push("A vertical slide needs a slide before it; added as a horizontal one.");
  const v = vertical && target > 0;
  if (!v && target < before.length && before[target]!.v > 0)
    notes.push(
      `Slide ${target} was inside a vertical stack; the new horizontal slide starts a new column there and takes the rest of the stack with it.`,
    );
  notes.push(...insertPiece(doc, target, pieceLines(slide, v), slide));
  return doc.result(target, notes);
}

/** Remove a slide. A stack's top slide hands its column to the slide beneath it. */
export function removeSlide(files: DeckFiles, ref: SlideRef): EditResult {
  const doc = new Doc(files);
  const deck = doc.deck();
  const s = require(deck.slides, ref);
  const notes: string[] = [];
  const r = s.range;
  if (r.includedBy) {
    const siblings = deck.slides.filter((x) => x.range.file === r.file);
    if (siblings.length === 1) {
      doc.splice(r.includedBy.file, r.includedBy.start, r.includedBy.end - r.includedBy.start, []);
      notes.push(
        `Removed the include of ${r.file} (its only slide); the file itself is untouched.`,
      );
      return doc.result(null, notes);
    }
  }
  const { lines } = doc.lines(r.file);
  const promote = s.v === 0 && r.end < lines.length && /^----+\s*$/.test(lines[r.end]!);
  if (promote) doc.splice(r.file, r.end, 1, ["---"]);
  if (r.head) {
    if (r.frontmatter) {
      doc.splice(r.file, r.body, r.end - r.body, [""]);
      notes.push(
        "The headmatter (deck settings) stays at the top; the next slide is now the first one and does not inherit the headmatter's slide keys (layout, background…).",
      );
    } else doc.splice(r.file, 0, r.end, []);
  } else doc.splice(r.file, r.start, r.end - r.start, []);
  return doc.result(null, notes);
}

/** Move a slide so it ends up at index `to`; `vertical` stacks it beneath the slide before it. */
export function moveSlide(
  files: DeckFiles,
  ref: SlideRef,
  to: number,
  vertical = false,
): EditResult {
  const doc = new Doc(files);
  const deck = doc.deck();
  const s = require(deck.slides, ref);
  if (s.index === to && s.v > 0 === vertical)
    return { files: {}, index: to, notes: ["Already there."] };
  const r = s.range;
  const { lines } = doc.lines(r.file);
  const frontmatter = r.head
    ? undefined
    : r.frontmatter
      ? (YAML.parse(lines.slice(r.frontmatter.open + 1, r.frontmatter.close).join("\n")) as Record<
          string,
          unknown
        >)
      : undefined;
  const yamlRaw =
    !r.head && r.frontmatter ? lines.slice(r.frontmatter.open + 1, r.frontmatter.close) : [];
  const body = lines.slice(r.body, r.end).join("\n");
  const removed = removeSlide(files, s.index);
  const after = new Doc({ entry: files.entry, read: (p) => removed.files[p] ?? files.read(p) });
  for (const [f, t] of Object.entries(removed.files)) after.texts.set(f, t);
  const count = after.deck().slides.length;
  const target = Math.max(0, Math.min(to, count));
  const v = vertical && target > 0;
  // Keep the moved slide's YAML exactly as written (comments included).
  const piece = [
    v ? "----" : "---",
    ...(yamlRaw.length ? [...yamlRaw, "---"] : []),
    ...bodyLines(body, false),
  ];
  const notes = insertPiece(after, target, piece, { content: body, frontmatter });
  return after.result(target, notes);
}
