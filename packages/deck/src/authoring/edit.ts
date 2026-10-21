import YAML from "yaml";

import { catalog } from "../catalog/index.ts";
import { type RawSlide, type SplitResult, fencedRanges, notesBlocks } from "../compiler/split.ts";
import { type DeckFiles, type SlideRef, findSlide, readDeck } from "./source.ts";
import { rewriteDragPos } from "./drag.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EDITING A DECK AS TEXT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every operation finds the slide through `splitDeck`'s line ranges and rewrites only those lines
 * of the one file the slide lives in (deck.mdx, or a file it includes with `src:`), so every
 * other byte — comments, spacing, line endings, other slides — stays exactly as it was.
 * Frontmatter is edited with YAML's document model, which keeps comments and key order.
 *
 * Two guards make that a promise rather than a hope. Input that would change the deck's
 * structure (a `---` line in a body, an unclosed code fence, a `</Notes>` in notes) is refused
 * up front. And after every operation the result is split again and checked: the slide count is
 * what the operation means (n, n+1, n−1) and every slide it did not touch reads exactly as
 * before. If not, an EditError is thrown and nothing is returned for saving.
 *
 * The first slide is special, as in Slidev: the YAML at the top of the file (the headmatter)
 * configures the whole deck AND is that slide's frontmatter. Editing the first slide's
 * frontmatter edits the headmatter; a full replace keeps every deck setting it does not name.
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

/** A refused edit: the input would have changed more than it says. Nothing was written. */
export class EditError extends Error {
  override name = "EditError";
}

const DECK_KEYS = new Set(catalog.deckFrontmatter.map((k) => k.name));
const SLIDE_KEYS = new Set(catalog.slideFrontmatter.map((k) => k.name));
const SEPARATOR = /^-{3,}\s*$/;

/** Keys that configure the deck rather than a slide (they live only in the headmatter). */
export function deckOnlyKeys(deckKeys: Iterable<string>, slideKeys: Iterable<string>): Set<string> {
  const slide = new Set(slideKeys);
  return new Set([...deckKeys].filter((k) => !slide.has(k)));
}

const pick = (o: Record<string, unknown>, keys: Set<string>) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => keys.has(k)));

/** Refuse text that would change the deck's structure where it lands. */
function assertBody(text: string, what: string) {
  let fence: string | null = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1]!;
      else if (f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
      return;
    }
    if (!fence && SEPARATOR.test(line))
      throw new EditError(
        `${what} line ${i + 1} is "${line.trim()}", which would start a new slide. For a horizontal rule write *** (or <hr />); to add a slide, add one.`,
      );
  });
  if (fence)
    throw new EditError(
      `${what} opens a code fence (${fence}) it never closes, which would swallow every slide after it. Close the fence.`,
    );
  const fences = fencedRanges(text);
  const outside = (re: RegExp) =>
    [...text.matchAll(re)].filter((m) => !fences.some(([a, b]) => m.index! >= a && m.index! < b))
      .length;
  if (outside(/<Notes\b/g) !== outside(/<\/Notes>/g))
    throw new EditError(
      `${what} has an unbalanced <Notes> tag. Put speaker notes in the notes field instead.`,
    );
}

function assertNotes(notes: string) {
  if (/<\/?Notes\b/.test(notes))
    throw new EditError(
      "Notes must not contain <Notes> or </Notes> tags; give just the text of the notes.",
    );
  assertBody(notes, "The notes'");
}

/** A file as lines, each with its own line ending, so an edit never rewrites another line's. */
class Lines {
  readonly lines: string[] = [];
  readonly eols: string[] = [];
  constructor(text: string) {
    const parts = text.split(/(\r\n|\n)/);
    for (let i = 0; i < parts.length; i += 2) {
      this.lines.push(parts[i]!);
      this.eols.push(parts[i + 1] ?? "");
    }
  }
  /** The ending most lines use; new lines get it. */
  get eol(): string {
    const crlf = this.eols.filter((e) => e === "\r\n").length;
    return crlf > this.eols.filter((e) => e === "\n").length ? "\r\n" : "\n";
  }
  splice(start: number, remove: number, insert: string[]) {
    const eol = this.eol;
    const atEnd = start + remove >= this.lines.length;
    // Appending after a last line that had no ending: it gets one now.
    if (start >= this.lines.length && start > 0 && this.eols[start - 1] === "")
      this.eols[start - 1] = eol;
    const endings = insert.map((_, i) => (atEnd && i === insert.length - 1 ? "" : eol));
    this.lines.splice(start, remove, ...insert);
    this.eols.splice(start, remove, ...endings);
    // Cutting the tail: the line that is now last ends the file, as the cut one did.
    if (atEnd && insert.length === 0 && this.lines.length) this.eols[this.lines.length - 1] = "";
  }
  text(): string {
    return this.lines.map((l, i) => l + this.eols[i]).join("");
  }
}

interface Expect {
  count: number;
  /** [old index, new index, compare frontmatter too?] for every slide the edit must not touch. */
  same: Array<[number, number, boolean]>;
}

class Doc {
  readonly texts = new Map<string, string>();
  readonly before: SplitResult;
  constructor(private readonly base: DeckFiles) {
    this.before = this.deck();
  }
  read = (path: string): string | null => this.texts.get(path) ?? this.base.read(path);
  files(): DeckFiles {
    return { entry: this.base.entry, read: this.read };
  }
  lines(file: string): Lines {
    const text = this.read(file);
    if (text === null) throw new EditError(`${file} does not exist`);
    return new Lines(text);
  }
  splice(file: string, start: number, remove: number, insert: string[]) {
    const l = this.lines(file);
    l.splice(start, remove, insert);
    this.texts.set(file, l.text());
  }
  deck() {
    const d = readDeck(this.files());
    if (d.problems.length)
      throw new EditError(d.problems.map((p) => `${p.file}:${p.line}: ${p.message}`).join("\n"));
    return d;
  }
  /** Check the edit did what it says and nothing else, then hand back the changed files. */
  result(index: number | null, notes: string[], expect: Expect): EditResult {
    const after = this.deck();
    if (after.slides.length !== expect.count)
      throw new EditError(
        `This edit would leave ${after.slides.length} slides instead of ${expect.count}, so it was not made. Check the content for separators, fences or frontmatter-like lines.`,
      );
    for (const [o, n, fm] of expect.same) {
      const a = this.before.slides[o]!;
      const b = after.slides[n]!;
      const same =
        a.content === b.content &&
        a.notes === b.notes &&
        (!fm || JSON.stringify(a.frontmatter) === JSON.stringify(b.frontmatter));
      if (!same)
        throw new EditError(
          `This edit would also change slide ${o} ("${a.content.split("\n")[0]!.slice(0, 50)}"), so it was not made.`,
        );
    }
    return { files: Object.fromEntries(this.texts), index, notes };
  }
}

function require(slides: RawSlide[], ref: SlideRef): RawSlide {
  const s = findSlide(slides, ref);
  if (!s)
    throw new EditError(
      `No slide ${JSON.stringify(ref)} (the deck has ${slides.length}: use an index 0–${slides.length - 1}, "h.v", or an id)`,
    );
  return s;
}

/** Every slide but `skip`, mapped to its index after the edit, compared in full. */
const untouched = (
  n: number,
  skip: number,
  map: (i: number) => number = (i) => i,
): Expect["same"] =>
  Array.from({ length: n }, (_, i) => i)
    .filter((i) => i !== skip)
    .map((i) => [i, map(i), true]);

/** Content lines for a body: a blank line before (unless at the very top), one after. */
function bodyLines(content: string, top: boolean): string[] {
  const text = content.replace(/\r\n/g, "\n").replace(/^\n+|\s+$/g, "");
  if (!text) return top ? [] : [""];
  const lines = text.split("\n");
  return top ? [...lines, ""] : ["", ...lines, ""];
}

function yamlLines(value: Record<string, unknown>): string[] {
  if (!Object.keys(value).length) return [];
  return YAML.stringify(value, { lineWidth: 0 }).replace(/\n+$/, "").split("\n");
}

/** The slide's body as written (notes included), from its own file. */
function rawBody(doc: Doc, s: RawSlide): string {
  return doc.lines(s.range.file).lines.slice(s.range.body, s.range.end).join("\n");
}

/**
 * A body without its notes blocks (those outside code fences: `<Notes>` and the trailing HTML
 * comments Slidev reads as notes), the blocks verbatim, and whether they were all comments.
 */
function withoutNotes(body: string): { body: string; notes: string[]; comments: boolean } {
  const blocks = notesBlocks(body);
  let out = "";
  let at = 0;
  for (const b of blocks) {
    out += body.slice(at, b.start).replace(/[ \t]*$/, "");
    at = b.end;
  }
  out += body.slice(at);
  return {
    body: out.replace(/\n{3,}/g, "\n\n"),
    notes: blocks.map((b) => body.slice(b.start, b.end)),
    comments: blocks.length > 0 && blocks.every((b) => b.kind === "comment"),
  };
}

function writeFrontmatter(
  doc: Doc,
  s: RawSlide,
  edit: (current: YAML.Document | null) => YAML.Document | null,
) {
  const r = s.range;
  const { lines } = doc.lines(r.file);
  if (r.frontmatter) {
    const yamlStart = r.frontmatter.open + 1;
    const current = YAML.parseDocument(lines.slice(yamlStart, r.frontmatter.close).join("\n"));
    const next = edit(current);
    const empty = !next || !YAML.isMap(next.contents) || next.contents.items.length === 0;
    if (empty) {
      // Drop the block: the fence lines too (a slide keeps its separator; a ```yaml block has
      // its own two fence lines, both of which go).
      if (r.head || r.frontmatter.block)
        doc.splice(r.file, r.frontmatter.open, r.frontmatter.close - r.frontmatter.open + 1, []);
      else doc.splice(r.file, yamlStart, r.frontmatter.close - yamlStart + 1, []);
      return;
    }
    const text = next.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n+$/, "");
    doc.splice(r.file, yamlStart, r.frontmatter.close - yamlStart, text.split("\n"));
    return;
  }
  const next = edit(null);
  if (!next || !YAML.isMap(next.contents) || next.contents.items.length === 0) return;
  const yaml = next
    .toString({ lineWidth: 0, flowCollectionPadding: false })
    .replace(/\n+$/, "")
    .split("\n");
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
  /** Replace the frontmatter (on the first slide, deck settings it does not name are kept). */
  frontmatter?: Record<string, unknown>;
  /** Merge into the frontmatter; a null value deletes that key. */
  patch?: FrontmatterPatch;
  /** With `content`: false drops the old notes too. Default true. */
  keepNotes?: boolean;
}

/**
 * Update one slide's body and/or frontmatter. On the first slide (whose frontmatter is the
 * headmatter) a `frontmatter` replace keeps every deck setting (`deckKeys`, by default every
 * deck option the engine knows) that the replacement does not name.
 */
export function updateSlide(
  files: DeckFiles,
  ref: SlideRef,
  update: SlideUpdate,
  deckKeys: Set<string> = DECK_KEYS,
): EditResult {
  const doc = new Doc(files);
  const notes: string[] = [];
  let s = require(doc.before.slides, ref);
  const index = s.index;
  const n = doc.before.slides.length;
  if (update.content !== undefined) {
    assertBody(update.content, "The content");
    let content = update.content;
    if (update.keepNotes !== false && !notesBlocks(content).length) {
      const old = withoutNotes(rawBody(doc, s)).notes;
      if (old.length) content = `${content.replace(/\s+$/, "")}\n\n${old.join("\n\n")}`;
    }
    const fmAfter = update.frontmatter ?? { ...s.frontmatter, ...update.patch };
    if (!content.trim() && !Object.values(fmAfter).some((v) => v !== null && v !== undefined))
      throw new EditError("An empty slide needs frontmatter (or remove it with slide_remove).");
    doc.splice(
      s.range.file,
      s.range.body,
      s.range.end - s.range.body,
      bodyLines(content, s.range.head && !s.range.frontmatter),
    );
    s = require(doc.deck().slides, index);
  }
  if (update.frontmatter || update.patch) {
    if (s.range.includedBy)
      notes.push(`Slide ${index} lives in ${s.range.file}; its frontmatter was edited there.`);
    writeFrontmatter(doc, s, (current) => {
      let d = current;
      if (update.frontmatter) {
        const existing = (current?.toJS() ?? {}) as Record<string, unknown>;
        const patch: FrontmatterPatch = { ...update.frontmatter };
        // Keys that stay keep their comments and order; the rest go — except deck settings.
        for (const k of Object.keys(existing))
          if (!(k in update.frontmatter) && !(s.range.head && deckKeys.has(k))) patch[k] = null;
        d = patchDocument(current, patch);
      }
      if (update.patch) d = patchDocument(d, update.patch);
      return d;
    });
  }
  return doc.result(index, notes, { count: n, same: untouched(n, index) });
}

/**
 * Set (or with null/"" remove) a slide's speaker notes. `[click]` markers pace them. A slide whose
 * notes were HTML comments (Slidev's spelling) keeps that spelling; any other gets `<Notes>`.
 */
export function setNotes(files: DeckFiles, ref: SlideRef, notes: string | null): EditResult {
  const doc = new Doc(files);
  const s = require(doc.before.slides, ref);
  if (notes) assertNotes(notes);
  const old = withoutNotes(rawBody(doc, s));
  const body = old.body.replace(/\s+$/, "");
  const asComment = old.comments && !notes?.includes("-->");
  const next = notes?.trim()
    ? asComment
      ? `${body}\n\n<!--\n${notes.trim()}\n-->`
      : `${body}\n\n<Notes>\n${notes.trim()}\n</Notes>`
    : body;
  if (!next.trim() && !s.range.frontmatter)
    throw new EditError("Removing the notes would leave an empty slide; remove the slide instead.");
  doc.splice(
    s.range.file,
    s.range.body,
    s.range.end - s.range.body,
    bodyLines(next, s.range.head && !s.range.frontmatter),
  );
  const n = doc.before.slides.length;
  return doc.result(s.index, [], { count: n, same: untouched(n, s.index) });
}

/**
 * Replace the body of one code fence on a slide: the fence whose code is `original` (the first
 * such fence when the slide has several alike), with `code`. The fence lines themselves — the
 * language, the meta, the indentation — stay as written. What `{monaco-write}` saves through in
 * `kadal-deck dev`; refused when no fence on the slide holds `original` any more (the file was
 * edited elsewhere since the slide was loaded) or when `code` would close the fence early.
 */
export function replaceCode(
  files: DeckFiles,
  ref: SlideRef,
  original: string,
  code: string,
): EditResult {
  const doc = new Doc(files);
  const s = require(doc.before.slides, ref);
  const { lines } = doc.lines(s.range.file);
  const want = original.replace(/\r\n/g, "\n").replace(/\n$/, "");
  for (let i = s.range.body; i < s.range.end; i++) {
    const open = /^([ \t]*)(`{3,}|~{3,})(.*)$/.exec(lines[i]!);
    if (!open) continue;
    const [, indent, mark] = open as unknown as [string, string, string];
    let close = i + 1;
    const closing = new RegExp(`^[ \\t]*\\${mark[0]}{${mark.length},}[ \\t]*$`);
    while (close < s.range.end && !closing.test(lines[close]!)) close++;
    if (close >= s.range.end) break;
    const body = lines
      .slice(i + 1, close)
      .map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l.trimStart()))
      .join("\n");
    if (body !== want) {
      i = close;
      continue;
    }
    const next = code.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
    if (next.some((l) => closing.test(l)))
      throw new EditError(
        `The code has a line of ${mark[0].repeat(mark.length)} that would close its fence early; use a longer fence in the deck.`,
      );
    doc.splice(
      s.range.file,
      i + 1,
      close - i - 1,
      next.map((l) => (l ? indent + l : l)),
    );
    const n = doc.before.slides.length;
    return doc.result(s.index, [], { count: n, same: untouched(n, s.index) });
  }
  throw new EditError(
    `No code block on slide ${s.index} holds that code any more — the file changed since the slide was loaded. Reload the deck and edit again.`,
  );
}

/** Merge into the deck's headmatter (null deletes a key). */
export function updateHeadmatter(files: DeckFiles, patch: FrontmatterPatch): EditResult {
  const doc = new Doc(files);
  const n = doc.before.slides.length;
  const first = doc.before.slides[0];
  const headSlide = !!first && first.range.head && first.range.file === files.entry;
  const expect = { count: n, same: untouched(n, headSlide ? 0 : -1) };
  if (headSlide) {
    writeFrontmatter(doc, first!, (current) => patchDocument(current, patch));
    return doc.result(null, [], expect);
  }
  // No slide comes from the top piece (an empty body, or an empty file): edit the fence directly.
  const { lines } = doc.lines(files.entry);
  let at = 0;
  while (at < lines.length && !lines[at]!.trim()) at++;
  if (lines[at] === "---" && Object.keys(doc.before.headmatter).length) {
    let close = at + 1;
    while (close < lines.length && lines[close] !== "---") close++;
    const current = YAML.parseDocument(lines.slice(at + 1, close).join("\n"));
    const next = patchDocument(current, patch)
      .toString({ lineWidth: 0, flowCollectionPadding: false })
      .replace(/\n+$/, "");
    doc.splice(files.entry, at + 1, close - at - 1, next.split("\n"));
    return doc.result(null, [], expect);
  }
  const yaml = yamlLines(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null)));
  if (yaml.length)
    doc.splice(files.entry, 0, 0, ["---", ...yaml, "---", ...(lines.join("").trim() ? [""] : [])]);
  return doc.result(null, [], expect);
}

export interface NewSlide {
  /** MDX body. */
  content: string;
  frontmatter?: Record<string, unknown>;
  notes?: string;
}

function withNotes(slide: NewSlide): string {
  let content = slide.content.replace(/\s+$/, "");
  if (slide.notes?.trim()) content += `\n\n<Notes>\n${slide.notes.trim()}\n</Notes>`;
  return content;
}

function pieceLines(slide: NewSlide, vertical: boolean, yamlRaw?: string[]): string[] {
  const fm = yamlRaw ?? yamlLines(slide.frontmatter ?? {});
  return [
    vertical ? "----" : "---",
    ...(fm.length ? [...fm, "---"] : []),
    ...bodyLines(withNotes(slide), false),
  ];
}

/** Insert a piece so it becomes slide `at`. */
function insertPiece(doc: Doc, at: number, piece: string[], slide: NewSlide): string[] {
  const notes: string[] = [];
  const slides = doc.deck().slides;
  const entry = doc.files().entry;
  if (at >= slides.length) {
    const l = doc.lines(entry);
    let end = l.lines.length;
    while (end > 0 && !l.lines[end - 1]!.trim()) end--;
    doc.splice(entry, end, l.lines.length - end, [...(end ? [""] : []), ...piece]);
    return notes;
  }
  const target = slides[at]!;
  const r = target.range;
  if (!(r.head && r.file === entry)) {
    // Before the target's separator — or, for the first slide of an include, before the include.
    if (r.head && r.includedBy) doc.splice(r.includedBy.file, r.includedBy.start, 0, piece);
    else doc.splice(r.file, r.start, 0, piece);
    return notes;
  }
  // The new slide goes before the slide at the top of the file.
  const oldBody = rawBody(doc, target);
  if (r.frontmatter) {
    // The headmatter stays where it is, now followed by an empty body, so it configures the deck
    // and is no slide's frontmatter; then the new slide; then the old first slide, which keeps
    // the headmatter's slide keys (layout, background…) as its own frontmatter.
    const keep = pick(target.frontmatter, SLIDE_KEYS);
    doc.splice(r.file, r.body, r.end - r.body, [
      "",
      ...piece.map((l, i) => (i === 0 ? "---" : l)),
      ...pieceLines({ content: oldBody }, false, yamlLines(keep)),
    ]);
    if (Object.keys(keep).length)
      notes.push(
        `The previous first slide keeps the headmatter's slide keys (${Object.keys(keep).join(", ")}) as its own frontmatter.`,
      );
    return notes;
  }
  // No headmatter: the new slide's frontmatter (if any) becomes it, as the first slide's always is.
  const fm = yamlLines(slide.frontmatter ?? {});
  doc.splice(r.file, 0, 0, [
    ...(fm.length ? ["---", ...fm, "---", ""] : []),
    ...bodyLines(withNotes(slide), true),
    "---",
    "",
  ]);
  const both = Object.keys(slide.frontmatter ?? {}).filter((k) => DECK_KEYS.has(k));
  if (both.length)
    notes.push(
      `The first slide's frontmatter is the headmatter, so ${both.join(", ")} now also set${both.length === 1 ? "s" : ""} the deck default.`,
    );
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
  assertBody(slide.content, "The content");
  if (slide.notes) assertNotes(slide.notes);
  if (!slide.content.trim() && !Object.keys(slide.frontmatter ?? {}).length)
    throw new EditError("A new slide needs content or frontmatter.");
  const before = doc.before.slides;
  const n = before.length;
  const target = at === undefined ? n : Math.max(0, Math.min(at, n));
  const notes: string[] = [];
  if (vertical && target === 0)
    notes.push("A vertical slide needs a slide before it; added as a horizontal one.");
  const v = vertical && target > 0;
  if (!v && target < n && before[target]!.v > 0)
    notes.push(
      `Slide ${target} was inside a vertical stack; the new horizontal slide starts a new column there and takes the rest of the stack with it.`,
    );
  notes.push(...insertPiece(doc, target, pieceLines(slide, v), slide));
  const same = untouched(n, -1, (i) => (i < target ? i : i + 1)).map(
    ([o, now]) => [o, now, !(o === 0 && target === 0)] as [number, number, boolean],
  );
  return doc.result(target, notes, { count: n + 1, same });
}

function removeLines(doc: Doc, s: RawSlide, notes: string[]) {
  const r = s.range;
  if (r.includedBy) {
    const siblings = doc.deck().slides.filter((x) => x.range.file === r.file);
    if (siblings.length === 1) {
      doc.splice(r.includedBy.file, r.includedBy.start, r.includedBy.end - r.includedBy.start, []);
      notes.push(
        `Removed the include of ${r.file} (its only slide); the file itself is untouched.`,
      );
      return;
    }
  }
  const { lines } = doc.lines(r.file);
  if (s.v === 0 && r.end < lines.length && /^----+\s*$/.test(lines[r.end]!))
    doc.splice(r.file, r.end, 1, ["---"]);
  if (r.head) {
    if (r.frontmatter) {
      doc.splice(r.file, r.body, r.end - r.body, [""]);
      notes.push(
        "The headmatter (deck settings) stays at the top; the next slide is now the first one and keeps its own frontmatter.",
      );
    } else doc.splice(r.file, 0, r.end, []);
  } else doc.splice(r.file, r.start, r.end - r.start, []);
}

/** Remove a slide. A stack's top slide hands its column to the slide beneath it. */
export function removeSlide(files: DeckFiles, ref: SlideRef): EditResult {
  const doc = new Doc(files);
  const s = require(doc.before.slides, ref);
  const notes: string[] = [];
  removeLines(doc, s, notes);
  const n = doc.before.slides.length;
  return doc.result(null, notes, {
    count: n - 1,
    same: untouched(n, s.index, (i) => (i < s.index ? i : i - 1)),
  });
}

/** Move a slide so it ends up at index `to`; `vertical` stacks it beneath the slide before it. */
export function moveSlide(
  files: DeckFiles,
  ref: SlideRef,
  to: number,
  vertical = false,
): EditResult {
  const doc = new Doc(files);
  const s = require(doc.before.slides, ref);
  const n = doc.before.slides.length;
  const target = Math.max(0, Math.min(to, n - 1));
  if (s.index === target && s.v > 0 === vertical)
    return { files: {}, index: target, notes: ["Already there."] };
  const r = s.range;
  const { lines } = doc.lines(r.file);
  // Keep the moved slide's YAML exactly as written (comments included); a slide that was the
  // first takes the headmatter's slide keys along as its own.
  const frontmatter = r.head ? pick(s.frontmatter, SLIDE_KEYS) : s.frontmatter;
  const yamlRaw = r.head
    ? yamlLines(frontmatter)
    : r.frontmatter
      ? lines.slice(r.frontmatter.open + 1, r.frontmatter.close)
      : [];
  const body = lines.slice(r.body, r.end).join("\n");
  const notes: string[] = [];
  removeLines(doc, s, notes);
  const v = vertical && target > 0;
  notes.push(
    ...insertPiece(doc, target, pieceLines({ content: body }, v, yamlRaw), {
      content: body,
      frontmatter,
    }),
  );
  const order = doc.before.slides.map((x) => x.index).filter((i) => i !== s.index);
  order.splice(target, 0, s.index);
  const same: Expect["same"] = order.map((old, now) => [old, now, old !== 0 && now !== 0]);
  return doc.result(target, notes, { count: n, same });
}

/* ── notes, edited where they are written ─────────────────────────────────── */

/**
 * How a slide's notes are written: a `<Notes>` block, a trailing HTML comment (Slidev's form,
 * where the compiler reads one), or not at all.
 */
export type NotesForm = "notes" | "comment" | "none";

export interface NotesSource {
  /** The slide's index in the deck (what `SlideRef` numbers mean). */
  index: number;
  /** The notes as written — Markdown/MDX, `[click]` markers and all; "" when there are none. */
  text: string;
  form: NotesForm;
  /** A short fingerprint of `text`: hand it back to `writeNotes` to refuse a stale write. */
  version: string;
}

/** The notes were changed by someone else since they were read; nothing was written. */
export class NotesConflict extends EditError {
  override name = "NotesConflict";
  constructor(readonly current: NotesSource) {
    super(`Slide ${current.index}'s notes changed since they were read.`);
  }
}

/** FNV-1a over the text: a version for a conflict check, not a security token. */
export function notesVersion(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(36)}.${text.length.toString(36)}`;
}

/**
 * Where a slide's notes are, in its raw body: the first notes block's inner span, its form, and
 * every block (compiler/split.ts `notesBlocks`: the `<Notes>` tags and the trailing HTML comments
 * the compiler reads as notes, so an editor sees exactly what the presenter shows).
 */
function locateNotes(body: string) {
  const blocks = notesBlocks(body);
  const b = blocks[0];
  if (!b) return null;
  if (b.kind === "comment")
    return { form: "comment" as const, blocks, innerStart: b.start + 4, innerEnd: b.end - 3 };
  const innerStart = body.indexOf(">", b.start) + 1;
  return { form: "notes" as const, blocks, innerStart, innerEnd: b.end - "</Notes>".length };
}

/** A slide's notes as written, for an editor to start from. */
export function readNotes(files: DeckFiles, ref: SlideRef): NotesSource {
  const doc = new Doc(files);
  const s = require(doc.before.slides, ref);
  const body = rawBody(doc, s);
  const at = locateNotes(body);
  // Several notes blocks compile as one, joined by a blank line; an editor sees that whole.
  const text =
    at && at.blocks.length > 1
      ? at.blocks.map((b) => b.inner.trim()).join("\n\n")
      : at
        ? trimBlock(body.slice(at.innerStart, at.innerEnd))
        : "";
  return { index: s.index, text, form: at?.form ?? "none", version: notesVersion(text) };
}

/** Inner text without the line breaks that sit just inside the tags. */
const trimBlock = (inner: string) =>
  inner
    .replace(/^[ \t]*\r?\n/, "")
    .replace(/\r?\n[ \t]*$/, "")
    .trim();

/**
 * Replace a slide's notes IN PLACE, in whatever form they are written: the inside of its
 * `<Notes>` block (a second and later block fold into the first), or of the trailing comment the
 * compiler reads as notes. A slide without notes gets a `<Notes>` block at its end. Empty `notes`
 * removes them. Every other byte of the file stays as it was.
 *
 * `expected` is the `version` from `readNotes`: when the notes on disk no longer match it, a
 * `NotesConflict` carrying what is there now is thrown instead of overwriting someone's edit.
 */
export function writeNotes(
  files: DeckFiles,
  ref: SlideRef,
  notes: string | null,
  options: { expected?: string } = {},
): EditResult {
  const before = readNotes(files, ref);
  if (options.expected !== undefined && options.expected !== before.version)
    throw new NotesConflict(before);
  const text = (notes ?? "").replace(/\r\n/g, "\n").trim();
  if (text === before.text) return { files: {}, index: before.index, notes: ["Unchanged."] };
  if (before.form === "none") return setNotes(files, ref, text || null);
  // Emptied: every notes block goes (with the blank lines before it), whatever its spelling.
  if (!text) return setNotes(files, ref, null);

  const doc = new Doc(files);
  const s = require(doc.before.slides, ref);
  const body = rawBody(doc, s);
  const at = locateNotes(body)!;
  if (at.form === "notes") assertNotes(text);
  else {
    if (text.includes("-->"))
      throw new EditError("Notes kept in an HTML comment cannot contain `-->`.");
    assertBody(text, "The notes'");
  }
  const inner = body.slice(at.innerStart, at.innerEnd);
  // Keep the block's shape: on lines of their own when it was written that way, or the new text
  // has lines; inline when it was inline and still fits on one line.
  const multiline = /\n/.test(inner) || text.includes("\n");
  const pad = at.form === "comment" && !multiline ? " " : "";
  const replacement = !text ? "" : multiline ? `\n${text}\n` : `${pad}${text}${pad}`;
  let next = body.slice(0, at.innerStart) + replacement + body.slice(at.innerEnd);
  if (at.blocks.length > 1) {
    // Fold the later blocks into the first: cut them, last first so the offsets hold.
    const shift = replacement.length - (at.innerEnd - at.innerStart);
    for (const b of at.blocks.slice(1).reverse()) {
      const start = b.start + shift;
      const end = b.end + shift;
      const rest = next.slice(end);
      // A block that ended the body takes the blank lines before it along.
      next = next.slice(0, start).replace(rest.trim() ? /[ \t]*$/ : /\s+$/, "") + rest;
    }
    next = next.replace(/\n{3,}/g, "\n\n");
  }
  doc.splice(s.range.file, s.range.body, s.range.end - s.range.body, next.split("\n"));
  const n = doc.before.slides.length;
  return doc.result(s.index, [], { count: n, same: untouched(n, s.index) });
}

/**
 * Save a draggable element's position (`<Drag>`, `<DragArrow>`, Slidev's `v-drag`), what
 * `/__kadal/drag` writes in `kadal-deck dev` (vite/drag-dev.ts). `pos` is "x,y,w,h[,r]" (`_` for
 * an automatic height), stage pixels.
 *
 *   { name }             the slide's frontmatter `dragPos.<name>` (added when missing); its
 *                        comments and every other key stay as written
 *   { index, expected }  the slide's drag site `index` (authoring/drag.ts): the value of its `pos`,
 *                        or a `pos` added to the tag; `expected` is the position the editor
 *                        started from, and a source that no longer says so is refused
 */
export function setDragPosition(
  files: DeckFiles,
  ref: SlideRef,
  target: { name: string } | { index: number; expected?: string },
  pos: string,
): EditResult {
  if (!/^-?[\d.]+(,(-?[\d.]+|_)){2,4}$/.test(pos.replace(/\s+/g, "")))
    throw new EditError(`"${pos}" is not a position: write x,y,w,h with an optional rotation.`);
  const doc = new Doc(files);
  const s = require(doc.before.slides, ref);
  const n = doc.before.slides.length;
  if ("name" in target) {
    if (!/^[\w-]+$/.test(target.name))
      throw new EditError(`"${target.name}" is not a dragPos name (letters, digits, - and _).`);
    writeFrontmatter(doc, s, (current) => {
      const d = current ?? new YAML.Document({});
      if (!YAML.isMap(d.contents)) d.contents = d.createNode({}) as never;
      const existing = d.get("dragPos");
      if (existing !== undefined && !YAML.isMap(existing))
        throw new EditError("This slide's dragPos is not a map of names to positions.");
      d.setIn(["dragPos", target.name], pos);
      return d;
    });
  } else {
    const body = rawBody(doc, s);
    let next: string;
    try {
      next = rewriteDragPos(body, target.index, pos, target.expected);
    } catch (e) {
      throw new EditError((e as Error).message);
    }
    doc.splice(s.range.file, s.range.body, s.range.end - s.range.body, next.split("\n"));
  }
  return doc.result(s.index, [], { count: n, same: untouched(n, s.index) });
}

/* ── a slide's whole source, edited as text (the dev server's side editor) ──── */

/**
 * One slide exactly as written in its file — its separator line (none for the slide at the top),
 * its frontmatter fences and YAML, its body and its notes — for an editor that shows the slide's
 * source beside the slide (`kadal-deck dev`'s side editor, vite/source-dev.ts).
 */
export interface SlideSource {
  /** The slide's index in the deck (what `SlideRef` numbers mean). */
  index: number;
  /** The slide's lines, blank lines at either end left out (they are spacing between slides). */
  text: string;
  /** The file the slide is written in: the deck, or a file it includes with `src:`. */
  file: string;
  /** 1-based line of `text`'s first line in `file`. */
  line: number;
  /** Whether this is the piece at the top of its file (its YAML, if any, is the headmatter). */
  head: boolean;
  /** A short fingerprint of `text`: hand it back to `writeSlideSource` to refuse a stale write. */
  version: string;
}

/** The slide was changed by someone else since it was read; nothing was written. */
export class SourceConflict extends EditError {
  override name = "SourceConflict";
  constructor(readonly current: SlideSource) {
    super(`Slide ${current.index} changed since it was read.`);
  }
}

/** The slide's lines in its file, without the blank lines at either end. */
function sourceSpan(doc: Doc, s: RawSlide): { lines: string[]; start: number; end: number } {
  const { lines } = doc.lines(s.range.file);
  let start = s.range.start;
  let end = s.range.end;
  while (start < end && !lines[start]!.trim()) start++;
  while (end > start && !lines[end - 1]!.trim()) end--;
  return { lines, start, end };
}

/** A slide's whole source as written, for an editor to start from. */
export function readSlideSource(files: DeckFiles, ref: SlideRef): SlideSource {
  const doc = new Doc(files);
  const s = require(doc.before.slides, ref);
  const span = sourceSpan(doc, s);
  const text = span.lines.slice(span.start, span.end).join("\n");
  return {
    index: s.index,
    text,
    file: s.range.file,
    line: span.start + 1,
    head: s.range.head,
    version: notesVersion(text),
  };
}

/**
 * Replace a slide's whole source with `text` — frontmatter, body and notes as one piece of text,
 * the way `readSlideSource` hands it out. Every other byte of the file stays as it was, and the
 * usual checks hold: the deck keeps its number of slides (a `---` line in the middle would start
 * another one; write `***` for a rule) and no other slide changes. A slide that is not the first
 * of its file must keep its separator as its first line. `expected` is the `version` from
 * `readSlideSource`: a slide that changed since is a `SourceConflict` carrying what is there now.
 */
export function writeSlideSource(
  files: DeckFiles,
  ref: SlideRef,
  text: string,
  options: { expected?: string } = {},
): EditResult {
  const before = readSlideSource(files, ref);
  if (options.expected !== undefined && options.expected !== before.version)
    throw new SourceConflict(before);
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[0]!.trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  if (lines.join("\n") === before.text)
    return { files: {}, index: before.index, notes: ["Unchanged."] };
  if (!lines.length)
    throw new EditError("An empty slide is not a slide; remove it from the deck instead.");
  if (!before.head && !SEPARATOR.test(lines[0]!))
    throw new EditError(
      `The first line must stay the slide's separator (${before.text.split("\n")[0]!.trim()}); without it this slide would run into the one before.`,
    );
  const doc = new Doc(files);
  const s = require(doc.before.slides, ref);
  const span = sourceSpan(doc, s);
  doc.splice(s.range.file, span.start, span.end - span.start, lines);
  const n = doc.before.slides.length;
  return doc.result(s.index, [], { count: n, same: untouched(n, s.index) });
}
