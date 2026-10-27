/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTERS  —  @kadal/deck/import
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   import { convertReveal, convertSlidev } from "@kadal/deck/import";
 *   const { mdx, files, report, info } = convertSlidev(slidesMd, { file: "slides.md", readFile, list });
 *   const { mdx, files, report, info } = convertReveal(indexHtml, { file: "index.html", readFile });
 *
 * Pure functions (no Node, no DOM): the CLI's `kadal-deck import slidev` / `import reveal` write their output into a
 * deck folder, and a page can run them on a pasted or uploaded deck. Kadal keeps its own syntax;
 * these convert Slidev's and reveal.js's into it, and say what they could not.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export {
  convertSlidev,
  type SlidevImport,
  type SlidevImportInfo,
  type SlidevImportOptions,
} from "./slidev.ts";
export {
  convertReveal,
  type RevealImport,
  type RevealImportInfo,
  type RevealImportOptions,
} from "./reveal.ts";
export { type ImportReportItem, type ImportSeverity } from "./report.ts";
export { formatImportReport } from "./format.ts";
export { utilityCss, attributifyClasses } from "./uno.ts";
