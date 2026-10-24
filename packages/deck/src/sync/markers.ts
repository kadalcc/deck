/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFLICT MARKERS: git's, read and written as text
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * When a merge cannot decide, it leaves both sides in the file the way git does, so every editor
 * highlights them and every person already knows what they mean:
 *
 *   <<<<<<< local (your files)
 *   your lines
 *   ||||||| base v12                (optional: what both started from)
 *   the lines before either edit
 *   =======
 *   their lines
 *   >>>>>>> web v14 (Quick edit by Asha, 25 Oct 14:02)
 *
 * A marker is only a marker at the start of a line (column 0), as in git, so a talk about git can
 * show one inside a code block by indenting it a space. A side whose label ends with
 * DELETED_SUFFIX deleted the whole slide; choosing that side removes the slide, not just its body.
 *
 * No imports: the slide splitter (compiler/split.ts) reads these too, to keep a conflict from
 * cutting a slide in two.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const OURS_MARK = "<<<<<<<";
export const BASE_MARK = "|||||||";
export const SEP_MARK = "=======";
export const THEIRS_MARK = ">>>>>>>";

/** Appended to a side's label when that side deleted the slide the conflict is on. */
export const DELETED_SUFFIX = " (deleted this slide)";

const isMark = (line: string, mark: string) =>
  line === mark || (line.startsWith(mark) && line[mark.length] === " ");
/** Any of the four marker lines (a line made of exactly `=======` included). */
export const isMarkerLine = (line: string): boolean =>
  isMark(line, OURS_MARK) ||
  isMark(line, BASE_MARK) ||
  line === SEP_MARK ||
  isMark(line, THEIRS_MARK);

const labelOf = (line: string, mark: string) => line.slice(mark.length).trim();

/** One well-formed block of markers, as 0-based line numbers into `text.split("\n")`. */
export interface MarkerBlock {
  /** The `<<<<<<<` line. */
  start: number;
  /** The `|||||||` line, or null when the block has no base section. */
  base: number | null;
  /** The `=======` line. */
  sep: number;
  /** The `>>>>>>>` line. */
  end: number;
  oursLabel: string;
  baseLabel: string | null;
  theirsLabel: string;
  ours: string[];
  baseLines: string[] | null;
  theirs: string[];
}

/**
 * Every well-formed marker block, in order. A block is `<<<<<<<`, optionally `|||||||`, then
 * `=======`, then `>>>>>>>`; an opener that never reaches its closer is not a block (see
 * `strayMarkers` for those).
 */
export function markerBlocks(text: string): MarkerBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: MarkerBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isMark(lines[i]!, OURS_MARK)) continue;
    let base: number | null = null;
    let sep = -1;
    let end = -1;
    for (let k = i + 1; k < lines.length; k++) {
      const l = lines[k]!;
      if (isMark(l, OURS_MARK)) break;
      if (sep < 0 && base === null && isMark(l, BASE_MARK)) base = k;
      else if (sep < 0 && l === SEP_MARK) sep = k;
      else if (sep >= 0 && isMark(l, THEIRS_MARK)) {
        end = k;
        break;
      }
    }
    if (sep < 0 || end < 0) continue;
    out.push({
      start: i,
      base,
      sep,
      end,
      oursLabel: labelOf(lines[i]!, OURS_MARK),
      baseLabel: base === null ? null : labelOf(lines[base]!, BASE_MARK),
      theirsLabel: labelOf(lines[end]!, THEIRS_MARK),
      ours: lines.slice(i + 1, base ?? sep),
      baseLines: base === null ? null : lines.slice(base + 1, sep),
      theirs: lines.slice(sep + 1, end),
    });
    i = end;
  }
  return out;
}

/**
 * Lines that look like the start or end of a conflict but belong to no whole block — what is
 * left when someone deleted half of one by hand. They still block publishing.
 */
export function strayMarkers(text: string): number[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const inBlock = new Set<number>();
  for (const b of markerBlocks(text)) for (let k = b.start; k <= b.end; k++) inBlock.add(k);
  const out: number[] = [];
  lines.forEach((l, i) => {
    if (!inBlock.has(i) && (isMark(l, OURS_MARK) || isMark(l, THEIRS_MARK))) out.push(i);
  });
  return out;
}

/** True when the text has an unresolved conflict: a whole block, or the remains of one. */
export function hasConflictMarkers(text: string): boolean {
  if (!text.includes(OURS_MARK) && !text.includes(THEIRS_MARK)) return false;
  return markerBlocks(text).length > 0 || strayMarkers(text).length > 0;
}

/**
 * Settle conflict blocks: keep `ours`, `theirs`, or `both` (ours, then theirs). `which` is the
 * block's 0-based position among the text's blocks; without it, every block is settled the same
 * way. Choosing the side that deleted a slide (its label ends with DELETED_SUFFIX) removes that
 * slide — its separator, settings and all; `removeSlideAt` is how (the splitter's job, passed in
 * so this module stays import-free). Text that is not a block is never touched.
 */
export function resolveMarkers(
  text: string,
  choice: "ours" | "theirs" | "both",
  which: number | undefined,
  removeSlideAt: (lines: string[], line: number) => string[],
): string {
  const crlf = /\r\n/.test(text);
  let lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks = markerBlocks(lines.join("\n"));
  const picked = which === undefined ? blocks : blocks[which] ? [blocks[which]!] : [];
  const SENTINEL = "\u0000kadal-deck:remove-slide\u0000";
  // Last first, so earlier line numbers stay true.
  for (const b of [...picked].reverse()) {
    const deletes =
      (choice === "ours" && b.oursLabel.endsWith(DELETED_SUFFIX.trim())) ||
      (choice === "theirs" && b.theirsLabel.endsWith(DELETED_SUFFIX.trim()));
    const keep = deletes
      ? [SENTINEL]
      : choice === "ours"
        ? b.ours
        : choice === "theirs"
          ? b.theirs
          : [...b.ours, ...b.theirs];
    lines.splice(b.start, b.end - b.start + 1, ...keep);
  }
  for (let i = lines.indexOf(SENTINEL); i >= 0; i = lines.indexOf(SENTINEL)) {
    const next = removeSlideAt(lines, i);
    // The splitter could not place it (or it is the head slide): drop the line alone.
    lines = next.includes(SENTINEL) ? next.filter((l) => l !== SENTINEL) : next;
  }
  const out = lines.join("\n");
  return crlf ? out.replace(/\n/g, "\r\n") : out;
}
