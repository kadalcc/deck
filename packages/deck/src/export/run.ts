/**
 * `bun run export` inside a deck:
 *
 *   bun run export                       PDF into export/ (builds + previews the deck itself)
 *   bun run export --png --pptx          also PNGs and a PPTX
 *   bun run export --url http://localhost:5300/showcase/     use a running dev server instead
 *   bun run export --upload https://deck.kadal.cc            archive on the host (DECK_ADMIN_KEY)
 *   bun run export --out dist-export --scale 1
 *   bun run export --posters             only capture posters for the embedded pages (into public/posters/)
 *   bun run export --refresh-posters     capture them again even where one exists; --no-posters skips
 */
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { type FlagSpecs, bool, num, parseArgs, str } from "../cli/args.ts";
import { DeckServer } from "../cli/render.ts";
import { type ExportResult, capturePosters, exportDeck, posterJobs } from "./index.ts";

export const EXPORT_FLAGS: FlagSpecs = {
  png: { kind: "boolean" },
  pptx: { kind: "boolean" },
  pdf: { kind: "boolean" },
  url: { kind: "string" },
  out: { kind: "string" },
  scale: { kind: "number" },
  slug: { kind: "string" },
  room: { kind: "string" },
  upload: { kind: "optional-string" },
  posters: { kind: "boolean" },
  "refresh-posters": { kind: "boolean" },
  // The CLI's own; accepted here so the same argv parses in both places.
  json: { kind: "boolean" },
  dir: { kind: "string", short: "C" },
  help: { kind: "boolean", short: "h" },
};

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
  const { flags } = parseArgs(args, EXPORT_FLAGS);
  const slug = str(flags.slug) ?? basename(cwd);
  /** The id the host keys this deck by (a published deck's room); defaults to the slug. */
  const room = str(flags.room) ?? slug;
  const outDir = resolve(cwd, str(flags.out) ?? "export");
  let url = str(flags.url);
  let server: DeckServer | null = null;
  const posters = { jobs: 0, captured: 0 };

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
    server = await DeckServer.start(cwd, "preview");
    url = server.url;
  }

  try {
    const upload = flags.upload;
    const result = await exportDeck({
      url,
      outDir,
      slug: room,
      pdf: flags.pdf !== false,
      png: bool(flags.png) ?? false,
      pptx: bool(flags.pptx) ?? false,
      scale: num(flags.scale) ?? 2,
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
