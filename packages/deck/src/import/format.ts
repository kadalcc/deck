import type { SlidevImport } from "./slidev.ts";
import type { ImportReportItem } from "./report.ts";
import type { RevealImport } from "./reveal.ts";

/**
 * IMPORT-REPORT.md: what the importer did, slide by slide, and every line it reported — written
 * beside the converted deck so the work left is a checklist.
 */
export function formatImportReport(
  result: Pick<SlidevImport, "report" | "info"> | Pick<RevealImport, "report" | "info">,
  o: { source: string; titles?: string[] },
): string {
  if ("assets" in result.info)
    return formatRevealReport(result as Pick<RevealImport, "report" | "info">, o);
  const { report, info } = result as Pick<SlidevImport, "report" | "info">;
  const count = (s: ImportReportItem["severity"]) => report.filter((r) => r.severity === s).length;
  const pct = info.slides ? Math.round((info.cleanSlides / info.slides) * 100) : 100;
  const lines: string[] = [
    "# Import report",
    "",
    `Converted from \`${o.source}\` by \`kadal-deck import slidev\`.`,
    "",
    `- Slides: ${info.slides} — ${info.cleanSlides} (${pct}%) converted with no warning or error.`,
    `- Report lines: ${count("error")} errors, ${count("warning")} warnings, ${count("info")} notes.`,
    `- Theme: Slidev \`${info.theme.slidev}\` → Kadal \`${info.theme.kadal}\`${info.theme.package ? ` (${info.theme.package})` : ""}.`,
    `- Stage: ${info.canvas.width}×${info.canvas.height}; lengths and positions scaled ×${Math.round(info.canvas.scale * 1000) / 1000} from Slidev's canvas.`,
    ...(info.iconSets.length
      ? [`- Icon sets: ${info.iconSets.map((s) => `\`@iconify-json/${s}\``).join(", ")}.`]
      : []),
    "",
    "Severity: **error** — the slide does not show what the Slidev one did (the source is kept in an",
    "MDX comment `{/* slidev: … */}`); **warning** — it shows, but differently; **note** — carried over",
    "in Kadal's spelling, or dropped because Kadal does it another way.",
    "",
  ];
  return listReport(lines, report, o.titles);
}

function formatRevealReport(
  result: Pick<RevealImport, "report" | "info">,
  o: { source: string; titles?: string[] },
): string {
  const { report, info } = result;
  const count = (s: ImportReportItem["severity"]) => report.filter((r) => r.severity === s).length;
  const pct = info.slides ? Math.round((info.cleanSlides / info.slides) * 100) : 100;
  const lines: string[] = [
    "# Import report",
    "",
    `Converted from \`${o.source}\` by \`kadal-deck import reveal\`.`,
    "",
    `- Slides: ${info.slides} — ${info.cleanSlides} (${pct}%) converted with no warning or error.`,
    `- Report lines: ${count("error")} errors, ${count("warning")} warnings, ${count("info")} notes.`,
    `- Theme: reveal.js \`${info.theme.reveal ?? "(none)"}\` → Kadal \`${info.theme.kadal}\`, variant \`${info.theme.variant}\` (${info.theme.colorScheme}).`,
    `- Stage: ${info.canvas.width}×${info.canvas.height}; inline lengths scaled ×${info.canvas.scale} from reveal.js's.`,
    ...(info.assets.length ? [`- Files copied into public/: ${info.assets.length}.`] : []),
    "",
    "Severity: **error** — the slide does not show what the reveal.js one did; **warning** — it shows,",
    "but differently; **note** — carried over in Kadal's spelling, or dropped because Kadal does it",
    "another way.",
    "",
  ];
  return listReport(lines, report, o.titles);
}

function listReport(lines: string[], report: ImportReportItem[], titles?: string[]): string {
  if (!report.length) {
    lines.push("Nothing to report: every slide converted as written.", "");
    return lines.join("\n");
  }
  const bySlide = new Map<number | null, ImportReportItem[]>();
  for (const r of report) {
    const list = bySlide.get(r.slide) ?? [];
    list.push(r);
    bySlide.set(r.slide, list);
  }
  const label = { error: "error", warning: "warning", info: "note" } as const;
  for (const [slide, items] of bySlide) {
    const title = slide !== null ? titles?.[slide - 1] : null;
    lines.push(
      slide === null ? "## The deck" : `## Slide ${slide}${title ? ` — ${title}` : ""}`,
      "",
    );
    for (const r of items) {
      const where = `${r.file}${r.line ? `:${r.line}` : ""}`;
      lines.push(
        `- **${label[r.severity]}** (${where}) ${r.what}${r.suggestion ? ` ${r.suggestion}` : ""}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
