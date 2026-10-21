/**
 * What the Slidev importer could not carry over, one line per thing.
 *
 * Every converter in this folder reports through a `Reporter` rather than throwing: a deck that
 * half converts is still a deck, and the lines say exactly which half. `severity`:
 *
 *   error     the slide will not show what the Slidev one did (a Vue component with logic, an
 *             expression only Vue can run); its source stays in the output as an MDX comment
 *   warning   it shows, but differently (an approximated click position, a theme replaced by
 *             minimal, a utility class with no equivalent)
 *   info      carried over in a Kadal spelling worth knowing about, or dropped because Kadal does
 *             it another way (`highlighter: shiki`, `PoweredBySlidev`)
 */

export type ImportSeverity = "error" | "warning" | "info";

export interface ImportReportItem {
  severity: ImportSeverity;
  /** The source file the line is about, relative to the Slidev project. */
  file: string;
  /** 1-based slide number in the converted deck, or null for the deck as a whole. */
  slide: number | null;
  /** 1-based line in `file`, when known. */
  line: number | null;
  /** What could not be converted (or was converted with a caveat). */
  what: string;
  /** What to do about it. */
  suggestion?: string;
}

export type Reporter = (
  item: Omit<ImportReportItem, "file" | "slide" | "line"> & {
    file?: string;
    slide?: number | null;
    line?: number | null;
  },
) => void;

/** Collects report lines, de-duplicating identical ones (the same class on twenty slides). */
export function createReport(defaults: { file: string }) {
  const items: ImportReportItem[] = [];
  const seen = new Set<string>();
  const reporter =
    (at: { slide: number | null; line: number | null; file?: string }): Reporter =>
    (item) => {
      const full: ImportReportItem = {
        severity: item.severity,
        file: item.file ?? at.file ?? defaults.file,
        slide: item.slide !== undefined ? item.slide : at.slide,
        line: item.line !== undefined ? item.line : at.line,
        what: item.what,
        ...(item.suggestion ? { suggestion: item.suggestion } : {}),
      };
      const key = `${full.severity}\u0000${full.file}\u0000${full.slide}\u0000${full.what}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push(full);
    };
  return { items, reporter };
}

const ORDER: Record<ImportSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Report lines in reading order: deck-wide first, then by slide and line, worst first on ties. */
export function sortReport(items: ImportReportItem[]): ImportReportItem[] {
  return [...items].sort(
    (a, b) =>
      (a.slide ?? 0) - (b.slide ?? 0) ||
      (a.file === b.file ? 0 : a.file < b.file ? -1 : 1) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      ORDER[a.severity] - ORDER[b.severity],
  );
}
