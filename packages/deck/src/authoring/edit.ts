import YAML from "yaml";

import { catalog } from "../catalog/index.ts";
import { type RawSlide, type SplitResult, fencedRanges, notesBlocks } from "../compiler/split.ts";
import { type DeckFiles, type SlideRef, findSlide, readDeck } from "./source.ts";

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
