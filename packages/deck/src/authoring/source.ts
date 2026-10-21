import { type RawSlide, type SplitResult, levelOf, splitDeck, titleOf } from "../compiler/split.ts";

/**
 * A deck as files of text, for tools that read and rewrite it: the CLI, the MCP server, an editor
 * or a hosted service that keeps decks somewhere other than a disk. `read` returns a file's text
 * (paths are whatever the host uses; includes resolve against the including file's directory).
 */
export interface DeckFiles {
  /** The deck file, e.g. `deck.mdx` or `/abs/path/deck.mdx`. */
  entry: string;
  read(path: string): string | null;
}

export function dirOf(path: string): string {
  const i = path.replace(/\\/g, "/").lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** `a/b` + `./c.mdx` → `a/b/c.mdx` (POSIX-style, `..` folded). */
export function joinPath(dir: string, rel: string): string {
  if (/^([a-z]:)?[\\/]/i.test(rel)) return rel;
  const parts = `${dir ? `${dir}/` : ""}${rel}`.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "." || (p === "" && out.length)) continue;
    if (p === ".." && out.length && out[out.length - 1] !== "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

export interface SplitProblem {
  message: string;
  file: string;
  line: number;
}

/** Split the deck with includes resolved through `files`, collecting problems instead of throwing. */
export function readDeck(
  files: DeckFiles,
  { root }: { root?: string } = {},
): SplitResult & { problems: SplitProblem[]; text: string } {
  const text = files.read(files.entry);
  if (text === null) throw new Error(`${files.entry} does not exist`);
  const problems: SplitProblem[] = [];
  const outside = new Set<string>();
  const inside = (file: string) =>
    !root || file === root || file.startsWith(`${root.replace(/\/+$/, "")}/`);
  const result = splitDeck(text, {
    file: files.entry,
    resolveInclude: (path, from) => {
      const file = joinPath(dirOf(from), path);
      if (!inside(file)) {
        outside.add(path);
        return null;
      }
      const inc = files.read(file);
      return inc === null ? null : { file, text: inc };
    },
    onError: (e) => {
      const src = /cannot include "(.*)"$/.exec(e.message)?.[1];
      problems.push(
        src && outside.has(src)
          ? { ...e, message: `"${src}" is outside the deck folder; includes must stay inside it` }
          : e,
      );
    },
  });
  return { ...result, problems, text };
}

/** A slide reference: its 0-based index, `"h.v"`, or its id (frontmatter `id`, or `s<index>`). */
export type SlideRef = number | string;

export function idOf(slide: RawSlide): string {
  return typeof slide.frontmatter.id === "string" ? slide.frontmatter.id : `s${slide.index}`;
}

export function findSlide(slides: RawSlide[], ref: SlideRef): RawSlide | null {
  if (typeof ref === "number") return slides[ref] ?? null;
  const r = ref.trim();
  if (/^\d+$/.test(r)) return slides[Number(r)] ?? null;
  const hv = /^(\d+)\.(\d+)$/.exec(r);
  if (hv) return slides.find((s) => s.h === Number(hv[1]) && s.v === Number(hv[2])) ?? null;
  // An id someone wrote wins over a generated `s<index>` that happens to match it.
  return (
    slides.find((s) => s.frontmatter.id === r || s.frontmatter.routeAlias === r) ??
    slides.find((s) => idOf(s) === r) ??
    null
  );
}

const CLICK_TAG = /<(Click|Fragment)\b(?![\w-])([^>]*)>/g;

/**
 * About how many click steps a slide has, read from its text: `clicks:` when it says, else the
 * click elements, `<Clicks>` items and code-step fences. The runtime counts exactly; this is for
 * outlines and pacing advice.
 */
export function estimateClicks(slide: Pick<RawSlide, "content" | "frontmatter">): number {
  if (typeof slide.frontmatter.clicks === "number") return slide.frontmatter.clicks;
  const text = slide.content;
  let n = 0;
  for (const m of text.matchAll(CLICK_TAG)) {
    const at = /\bat=\{?\s*["']?(\+?\d+)/.exec(m[2] ?? "");
    if (!at) n++;
    else if (at[1]!.startsWith("+")) n += Number(at[1]!.slice(1));
    else n = Math.max(n, Number(at[1]));
  }
  for (const block of text.matchAll(/<Clicks\b[^>]*>([\s\S]*?)<\/Clicks>/g))
    n += (block[1]!.match(/^\s*(?:[-*+]|\d+[.)])\s+/gm) ?? []).length;
  for (const fence of text.matchAll(/^\s*(`{3,}|~{3,})\S*[^\n]*?\{([^}]*\|[^}]*)\}/gm))
    n += fence[2]!.split("|").length - 1;
  // `$$ {1|3|all}`: stepped maths lines, one click per step after the first.
  for (const math of text.matchAll(/^\s*\$\$\s*\{([^}:]*\|[^}:]*)\}/gm))
    n += math[1]!.split("|").length - 1;
  for (const m of text.matchAll(/^````+md magic-move[\s\S]*?^````+\s*$/gm))
    n += Math.max(0, (m[0].match(/^```(?!`)/gm) ?? []).length / 2 - 1);
  return n;
}

export interface OutlineSlide {
  index: number;
  h: number;
  v: number;
  /** What `#/<id>` and the slide tools accept. */
  id: string;
  title: string | null;
  level: number;
  layout: string;
  hidden: boolean;
  frontmatter: Record<string, unknown>;
  /** An estimate (see estimateClicks). */
  clicks: number;
  notes: boolean;
  /** `[click]` markers in the notes. */
  noteClicks: number;
  /** 1-based lines in `file`: the slide's first line (its separator) through its last. */
  source: { file: string; startLine: number; endLine: number; bodyLine: number };
  /** The file whose `src:` pulled this slide in. */
  includedFrom: string | null;
  /** The first ~140 characters of its text, for a glance. */
  excerpt: string;
}

export function outlineSlide(s: RawSlide): OutlineSlide {
  const fm = s.frontmatter;
  const hidden = fm.hide === true || fm.disabled === true || fm.visibility === "hidden";
  const excerpt = s.content
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`>|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  return {
    index: s.index,
    h: s.h,
    v: s.v,
    id: idOf(s),
    title: titleOf(s),
    level: levelOf(s),
    layout: typeof fm.layout === "string" ? fm.layout : s.index === 0 ? "cover" : "default",
    hidden,
    frontmatter: fm,
    clicks: estimateClicks(s),
    notes: s.notes !== null,
    noteClicks: (s.notes?.match(/\[click(?::\d+)?\]/g) ?? []).length,
    source: {
      file: s.range.file,
      startLine: s.range.start + 1,
      endLine: Math.max(s.range.start + 1, s.range.end),
      bodyLine: s.range.body + 1,
    },
    includedFrom: s.range.includedBy?.file ?? null,
    excerpt,
  };
}

export interface DeckOutline {
  entry: string;
  headmatter: Record<string, unknown>;
  title: string | null;
  slides: OutlineSlide[];
  columns: number;
  problems: SplitProblem[];
}

export function outlineDeck(files: DeckFiles): DeckOutline {
  const deck = readDeck(files);
  return {
    entry: files.entry,
    headmatter: deck.headmatter,
    title:
      typeof deck.headmatter.title === "string"
        ? deck.headmatter.title
        : deck.slides[0]
          ? titleOf(deck.slides[0])
          : null,
    slides: deck.slides.map(outlineSlide),
    columns: deck.slides.length ? deck.slides[deck.slides.length - 1]!.h + 1 : 0,
    problems: deck.problems,
  };
}
