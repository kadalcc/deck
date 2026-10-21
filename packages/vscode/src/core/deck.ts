import {
  type DeckFiles,
  type OutlineSlide,
  type SplitProblem,
  moveSlide,
  outlineSlide,
  readDeck,
} from "@kadal/deck/authoring";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECK AS THE EXTENSION SEES IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Everything here is the engine's own reading of a deck (`@kadal/deck/authoring`, bundled into
 * the extension): the same split, the same slide ids, the same text edits the CLI and the MCP
 * server make. Nothing in this folder imports `vscode`, so it is tested with plain `bun test`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ParsedDeck {
  entry: string;
  headmatter: Record<string, unknown>;
  slides: OutlineSlide[];
  problems: SplitProblem[];
  /** 0-based lines in the entry file that close a frontmatter block (`---` after the YAML). */
  closeLines: Set<number>;
  /** 0-based lines in the entry file where a slide starts: its separator, or the headmatter fence. */
  startLines: Set<number>;
}

/** Read a deck through `read` (the open editors' text first, the disk after). */
export function parseDeck(entry: string, read: (path: string) => string | null): ParsedDeck {
  const files: DeckFiles = { entry, read };
  const deck = readDeck(files);
  const closeLines = new Set<number>();
  const startLines = new Set<number>();
  for (const s of deck.slides) {
    if (s.range.file !== entry) continue;
    if (s.range.frontmatter && !s.range.frontmatter.block) {
      closeLines.add(s.range.frontmatter.close);
      startLines.add(s.range.frontmatter.open);
    }
    if (!s.range.head) startLines.add(s.range.start);
  }
  return {
    entry,
    headmatter: deck.headmatter,
    slides: deck.slides.map(outlineSlide),
    problems: deck.problems,
    closeLines,
    startLines,
  };
}

export interface SlideNode {
  slide: OutlineSlide;
  /** The slides stacked beneath this one (a vertical column); only on a column's top slide. */
  children: SlideNode[];
}

/** The slides as the tree shows them: one node per column, its stack nested under it. */
export function slideTree(slides: OutlineSlide[]): SlideNode[] {
  const out: SlideNode[] = [];
  for (const slide of slides) {
    const top = out[out.length - 1];
    if (slide.v > 0 && top && top.slide.h === slide.h) top.children.push({ slide, children: [] });
    else out.push({ slide, children: [] });
  }
  return out;
}

/** "3. Title" — the 1-based number the deck shows, and the title (or the first words). */
export function slideLabel(slide: OutlineSlide): string {
  const title = slide.title ?? (slide.excerpt.slice(0, 48) || "(untitled)");
  return `${slide.index + 1}. ${title}`;
}

/**
 * The slide whose source holds `line` (0-based) of `file`. A line in the deck file that belongs
 * to an include (`src:`) piece answers with the first slide that include brings in; lines before
 * the first slide (blank lines above the headmatter) answer with the first slide.
 */
export function slideAtLine(deck: ParsedDeck, file: string, line: number): OutlineSlide | null {
  let best: OutlineSlide | null = null;
  for (const s of deck.slides) {
    const start = s.source.startLine - 1;
    const end = s.source.endLine; // exclusive, 0-based
    const where = s.includedFrom === file && s.source.file !== file ? null : s.source.file;
    if (where === file && line >= start && line < Math.max(end, start + 1)) return s;
    if (where === file && start <= line) best = s;
  }
  if (best) return best;
  return deck.slides.find((s) => s.source.file === file || s.includedFrom === file) ?? null;
}

/**
 * The URL hash that shows a slide: its id (`#/s4`, or the frontmatter `id`), which the deck
 * resolves itself — so hidden slides and vertical stacks never put the preview on the wrong one.
 */
export function slideHash(slide: OutlineSlide): string {
  return `#/${encodeURIComponent(slide.id)}`;
}

/**
 * Move slide `from` so it lands where slide `onto` is now (the tree's drag and drop): beneath it
 * in its stack when `onto` is in a stack, as a column of its own otherwise. Returns the changed
 * files (path → text), or null when nothing moves.
 */
export function dropSlide(
  entry: string,
  read: (path: string) => string | null,
  from: number,
  onto: number,
): { files: Record<string, string>; index: number | null; notes: string[] } | null {
  if (from === onto) return null;
  const deck = parseDeck(entry, read);
  const target = deck.slides[onto];
  if (!target) return null;
  const result = moveSlide({ entry, read }, from, onto, target.v > 0);
  return Object.keys(result.files).length ? result : null;
}
