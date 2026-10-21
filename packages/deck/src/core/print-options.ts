/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRINT OPTIONS  —  what the print view prints, as the address says it
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The print view (`?print-pdf`) lays the deck out as pages. Every exporter drives it — the CLI's
 * headless Chromium, the browser exporter at /export, a person pressing Ctrl+P — and each needs
 * the same few choices, so they travel in the query string and mean the same thing everywhere:
 *
 *   ?range=1,3-5        slides 1, 3, 4 and 5 (1-based, in the order the deck plays them)
 *   ?clicks=0|1         a page per click step (1) or one page per slide at its last step (0);
 *                       absent, the deck's own `pdfSeparateFragments` decides
 *   ?notes=0|1|page     notes off, in a box on the slide, or each on a page of its own;
 *                       absent, the deck's `showNotes` decides
 *   ?scheme=light|dark  the colour scheme (read by the deck itself, not only the print view)
 *   ?omit-background    no page colour and no background layer: the slides' content over
 *                       nothing, for transparent PNGs
 *
 * Pure and isomorphic: the Node exporter builds these addresses, the page reads them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type PrintNotes = boolean | "separate-page";

export interface PrintOptions {
  /** The `range` as written, or null for every slide. */
  range: string | null;
  /** A page per click step; null leaves it to the deck's `pdfSeparateFragments`. */
  clicks: boolean | null;
  /** Notes on the printed pages; null leaves it to the deck's `showNotes`. */
  notes: PrintNotes | null;
  /** Leave out the page colour and the background layer. */
  omitBackground: boolean;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  range: null,
  clicks: null,
  notes: null,
  omitBackground: false,
};

/** A range is malformed: the message says how. */
export class SlideRangeError extends Error {}

/**
 * `"1,3-5"` → `[1, 3, 4, 5]`: 1-based slide numbers, sorted, each once, none past `total`.
 * `all`, `*` or an empty string is every slide. An open end (`3-`) runs to the last slide; a
 * reversed pair (`5-3`) is the same as `3-5`. Anything else throws, so a typo on the command line
 * is an error rather than a silently empty export.
 */
export function parseRange(spec: string | null | undefined, total: number): number[] {
  const text = (spec ?? "").trim();
  if (!text || text === "all" || text === "*")
    return Array.from({ length: Math.max(0, total) }, (_, i) => i + 1);
  const out = new Set<number>();
  for (const raw of text.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    const m = /^(\d+)\s*(?:-\s*(\d*))?$/.exec(part);
    if (!m) throw new SlideRangeError(`"${part}" is not a slide number or a range like 3-5`);
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : m[2] === "" ? total : Number(m[2]);
    if (a < 1 || (m[2] !== "" && b < 1))
      throw new SlideRangeError(`slides are numbered from 1 (got "${part}")`);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    for (let n = lo; n <= Math.min(hi, total); n++) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

/** Throws a `SlideRangeError` when `spec` is not a range at all (before the slide count is known). */
export function checkRange(spec: string | null | undefined): void {
  parseRange(spec, 0);
}

/** The print options a query string carries (`location.search`). */
export function readPrintOptions(search: string): PrintOptions {
  const q = new URLSearchParams(search);
  const flag = (name: string): boolean | null => {
    if (!q.has(name)) return null;
    const v = (q.get(name) ?? "").toLowerCase();
    return !/^(0|false|no|off)$/.test(v);
  };
  const notes = q.get("notes");
  return {
    range: q.get("range")?.trim() || null,
    clicks: flag("clicks"),
    notes:
      notes === null
        ? null
        : /^(page|separate|separate-page)$/i.test(notes)
          ? "separate-page"
          : !/^(0|false|no|off)$/i.test(notes),
    omitBackground: flag("omit-background") ?? false,
  };
}

/** Write print options onto a URL's query, next to `print-pdf`. Defaults are left out. */
export function writePrintOptions(url: URL, o: Partial<PrintOptions>): URL {
  const q = url.searchParams;
  q.set("print-pdf", "");
  if (o.range) q.set("range", o.range);
  if (o.clicks !== undefined && o.clicks !== null) q.set("clicks", o.clicks ? "1" : "0");
  if (o.notes !== undefined && o.notes !== null)
    q.set("notes", o.notes === "separate-page" ? "page" : o.notes ? "1" : "0");
  if (o.omitBackground) q.set("omit-background", "");
  return url;
}

/**
 * `?scheme=light|dark` (or `?dark`): the colour scheme this window starts in, over the viewer's
 * remembered choice and the deck's `colorScheme`. Not remembered: an export asking for the dark
 * pages must not change what the person sees next time. Null when the address does not say.
 */
export function readScheme(search: string): "light" | "dark" | null {
  const q = new URLSearchParams(search);
  const v = q.get("scheme")?.toLowerCase();
  if (v === "light" || v === "dark") return v;
  if (q.has("dark") && !/^(0|false|no|off)$/i.test(q.get("dark") ?? "")) return "dark";
  return null;
}
