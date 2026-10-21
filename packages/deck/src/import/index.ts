/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTERS  —  @kadal/deck/import
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   import { convertSlidev } from "@kadal/deck/import";
 *   const { mdx, files, report, info } = convertSlidev(slidesMd, { file: "slides.md", readFile, list });
 *
 * Pure functions (no Node, no DOM): the CLI's `kadal-deck import slidev` writes their output into a
 * deck folder, and a page can run them on a pasted or uploaded deck. Kadal keeps its own syntax;
 * this converts Slidev's into it, and says what it could not.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export {
  convertSlidev,
  type SlidevImport,
  type SlidevImportInfo,
  type SlidevImportOptions,
} from "./slidev.ts";
export { type ImportReportItem, type ImportSeverity } from "./report.ts";
export { formatImportReport } from "./format.ts";
export { utilityCss, attributifyClasses } from "./uno.ts";
