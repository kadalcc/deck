/**
 * `bun run export` inside a deck:
 *
 *   bun run export                       PDF into export/ (builds + previews the deck itself)
 *   bun run export --png --pptx          also PNGs and a PPTX
 *   bun run export --format pptx-editable,md      native PowerPoint objects; Markdown + PNGs
 *   bun run export --range 1,3-5 --dark --no-with-clicks     some slides, dark, a page per slide
 *   bun run export --png --omit-background         transparent PNGs
 *   bun run export --url http://localhost:5300/showcase/     use a running dev server instead
 *   bun run export --upload https://deck.kadal.cc            archive on the host (DECK_ADMIN_KEY)
 *   bun run export --out dist-export --output talk --scale 1
 *   bun run export --vector-pdf          print the PDF with the browser alone (all vector; CSS effects vary by viewer)
 *   bun run export --no-with-toc         no PDF bookmarks
 *   bun run export --per-slide           one page load per slide (huge decks, WebGL everywhere)
 *   bun run export --timeout 300000 --wait 2000 --wait-until load --executable-path /path/to/chrome
 *   bun run export --posters             only capture posters for the embedded pages (into public/posters/)
 *   bun run export --refresh-posters     capture them again even where one exists; --no-posters skips
 */
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { type FlagSpecs, UsageError, bool, num, parseArgs, str } from "../cli/args.ts";
import { NoDeckError } from "../cli/project.ts";
import { DeckServer, loadPlaywright } from "../cli/render.ts";
import { SlideRangeError, checkRange } from "../core/print-options.ts";
import {
  EXPORT_FORMATS,
  type ExportFormat,
  type ExportOptions,
  type ExportResult,
  capturePosters,
  exportDeck,
  posterJobs,
} from "./index.ts";

export const EXPORT_FLAGS: FlagSpecs = {
  format: { kind: "string", multiple: true },
  png: { kind: "boolean" },
  pptx: { kind: "boolean" },
  "pptx-editable": { kind: "boolean" },
  md: { kind: "boolean" },
  pdf: { kind: "boolean" },
  "vector-pdf": { kind: "boolean" },
  url: { kind: "string" },
  out: { kind: "string" },
  output: { kind: "string" },
  scale: { kind: "number" },
  slug: { kind: "string" },
  room: { kind: "string" },
  range: { kind: "string" },
  dark: { kind: "boolean" },
  scheme: { kind: "string" },
  "omit-background": { kind: "boolean" },
  "with-clicks": { kind: "boolean" },
  "with-toc": { kind: "boolean" },
  "per-slide": { kind: "boolean" },
  timeout: { kind: "number" },
  wait: { kind: "number" },
  "wait-until": { kind: "string" },
  "executable-path": { kind: "string" },
  port: { kind: "number" },
  upload: { kind: "optional-string" },
  posters: { kind: "boolean" },
  "refresh-posters": { kind: "boolean" },
  // The CLI's own; accepted here so the same argv parses in both places.
  json: { kind: "boolean" },
  dir: { kind: "string", short: "C" },
  help: { kind: "boolean", short: "h" },
};

/**
 * Slidev spells a switch's value as the next word (`--with-clicks false`); this parser wants
 * `--with-clicks=false`. Joined here for the export's switches, so either spelling works.
 */
export function joinSwitchValues(args: string[], specs: FlagSpecs = EXPORT_FLAGS): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const next = args[i + 1];
    const name = a.startsWith("--") && !a.includes("=") ? a.slice(2) : null;
    if (name && specs[name]?.kind === "boolean" && next && /^(true|false)$/i.test(next)) {
      out.push(`${a}=${next.toLowerCase()}`);
      i++;
    } else out.push(a);
  }
  return out;
}

const WAIT_UNTIL = ["networkidle", "load", "domcontentloaded", "none"] as const;

export type PickedOptions = Pick<
  ExportOptions,
  | "formats"
  | "vectorPdf"
  | "scale"
  | "range"
  | "scheme"
  | "omitBackground"
  | "withClicks"
  | "withToc"
  | "perSlide"
  | "timeout"
  | "wait"
  | "waitUntil"
  | "executablePath"
  | "name"
>;

/** What the flags ask `exportDeck` for (validated: a bad value is a usage error, exit 2). */
export function exportOptionsFrom(flags: Record<string, unknown>): PickedOptions {
  const listed = ((flags.format as string[] | undefined) ?? [])
    .flatMap((f) => f.split(","))
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);
  for (const f of listed)
    if (!(EXPORT_FORMATS as readonly string[]).includes(f))
      throw new UsageError(`--format ${f}: use ${EXPORT_FORMATS.join(", ")}`);
  const formats = new Set<ExportFormat>(listed as ExportFormat[]);
  // No --format: a PDF unless --no-pdf, plus whatever the switches add.
  if (!listed.length && flags.pdf !== false) formats.add("pdf");
  if (flags.pdf === true) formats.add("pdf");
  if (flags.png === true) formats.add("png");
  if (flags.pptx === true) formats.add("pptx");
  if (flags["pptx-editable"] === true) formats.add("pptx-editable");
  if (flags.md === true) formats.add("md");
  if (flags.pdf === false) formats.delete("pdf");

  const scheme = str(flags.scheme);
  if (scheme && scheme !== "light" && scheme !== "dark")
    throw new UsageError(`--scheme ${scheme}: use light or dark`);
  const until = str(flags["wait-until"]);
  if (until && !(WAIT_UNTIL as readonly string[]).includes(until))
    throw new UsageError(`--wait-until ${until}: use ${WAIT_UNTIL.join(", ")}`);
  const range = str(flags.range);
  try {
    checkRange(range);
  } catch (e) {
    if (e instanceof SlideRangeError) throw new UsageError(`--range: ${e.message}`);
    throw e;
  }
  const timeout = num(flags.timeout);
  if (timeout !== undefined && timeout <= 0)
    throw new UsageError("--timeout needs a positive number of milliseconds");
  const wait = num(flags.wait);
  if (wait !== undefined && wait < 0) throw new UsageError("--wait needs 0 or more milliseconds");
  const output = str(flags.output);
  if (output && /[/\\]/.test(output))
    throw new UsageError("--output is the files' name; --out is the folder they go in");
  return {
    formats: EXPORT_FORMATS.filter((f) => formats.has(f)),
    vectorPdf: bool(flags["vector-pdf"]) ?? false,
    scale: num(flags.scale) ?? 2,
    range: range ?? null,
    scheme: (scheme as "light" | "dark" | undefined) ?? (flags.dark === true ? "dark" : null),
    omitBackground: bool(flags["omit-background"]) ?? false,
    withClicks: bool(flags["with-clicks"]) ?? null,
    withToc: bool(flags["with-toc"]) ?? true,
    perSlide: bool(flags["per-slide"]) ?? false,
    ...(timeout !== undefined ? { timeout } : {}),
    ...(wait !== undefined ? { wait } : {}),
    ...(until ? { waitUntil: until as (typeof WAIT_UNTIL)[number] } : {}),
    executablePath: str(flags["executable-path"]) ?? null,
    ...(output ? { name: output.replace(/\.(pdf|pptx|md)$/i, "") } : {}),
  };
}

export interface ExportRun extends ExportResult {
  posters: { jobs: number; captured: number };
  outDir: string;
}

/** `kadal-deck export [flags]` in a deck folder. Returns once every file is written. */
export async function runExport(
  args: string[],
  cwd: string = process.cwd(),
  log: (line: string) => void = console.log,
): Promise<ExportRun> {
  const { flags } = parseArgs(joinSwitchValues(args), EXPORT_FLAGS);
  const picked = exportOptionsFrom(flags);
  const slug = str(flags.slug) ?? basename(cwd);
  /** The id the host keys this deck by (a published deck's room); defaults to the slug. */
  const room = str(flags.room) ?? slug;
  const outDir = resolve(cwd, str(flags.out) ?? "export");
  let url = str(flags.url);
  let server: DeckServer | null = null;
  const posters = { jobs: 0, captured: 0 };
  // What is missing is said (exit 4, with what to do) before posters and a build, not after.
  if (!url && !existsSync(join(cwd, "deck.mdx"))) throw new NoDeckError(cwd);
  await loadPlaywright(cwd);

  // Posters for embedded pages, before the build so they ship with it.
  if (flags.posters !== false) {
    const size = await deckSize(cwd);
    const jobs = posterJobs(cwd, size);
    posters.jobs = jobs.length;
    posters.captured = await capturePosters(cwd, jobs, {
      refresh: bool(flags["refresh-posters"]) ?? false,
      log,
    });
    log(`poster ${jobs.length} embedded page(s), ${posters.captured} captured`);
    if (flags.posters === true) return { files: [], pages: 0, posters, outDir };
  }

  if (!url) {
    log("build  vite build");
    const port = num(flags.port);
    server = await DeckServer.start(cwd, "preview", port ? { port } : {});
    url = server.url;
  }

  try {
    const upload = flags.upload;
    const result = await exportDeck({
      ...picked,
      url,
      outDir,
      slug: room,
      root: cwd,
      upload:
        upload === undefined
          ? null
          : typeof upload === "string" && upload.startsWith("http")
            ? upload
            : (process.env.DECK_HOST ?? "https://deck.kadal.cc"),
      adminKey: process.env.DECK_ADMIN_KEY ?? null,
      log,
    });
    log(`\ndone   ${result.pages} pages, ${result.files.length} file(s)`);
    return { ...result, posters, outDir };
  } finally {
    server?.stop();
  }
}

/** The authored stage size, from deck.config.ts when it sets one. */
async function deckSize(cwd: string): Promise<{ width: number; height: number }> {
  try {
    const mod = (await import(pathToFileURL(resolve(cwd, "deck.config.ts")).href)) as {
      config?: { width?: number; height?: number };
    };
    return { width: mod.config?.width ?? 1920, height: mod.config?.height ?? 1080 };
  } catch {
    return { width: 1920, height: 1080 };
  }
}
