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
import type { ChildProcess } from "node:child_process";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runVite, spawnVite } from "../cli/vite.ts";
import { capturePosters, exportDeck, posterJobs } from "./index.ts";

/** `kadal-deck export [flags]` in a deck folder. Returns once every file is written. */
export async function runExport(args: string[], cwd: string = process.cwd()): Promise<void> {

  const has = (f: string) => args.includes(f);
  const val = (f: string) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const slug = val("--slug") ?? basename(cwd);
  /** The id the host keys this deck by (a published deck's room); defaults to the slug. */
  const room = val("--room") ?? slug;
  const outDir = resolve(cwd, val("--out") ?? "export");
  let url = val("--url");
  let preview: ChildProcess | null = null;

  // Posters for embedded pages, before the build so they ship with it.
  if (!has("--no-posters")) {
    const size = await deckSize();
    const jobs = posterJobs(cwd, size);
    const n = await capturePosters(cwd, jobs, { refresh: has("--refresh-posters") });
    console.log(`poster ${jobs.length} embedded page(s), ${n} captured`);
    if (has("--posters")) return;
  }

  /** The authored stage size, from deck.config.ts when it sets one. */
  async function deckSize(): Promise<{ width: number; height: number }> {
    try {
      const mod = (await import(pathToFileURL(resolve(cwd, "deck.config.ts")).href)) as {
        config?: { width?: number; height?: number };
      };
      return { width: mod.config?.width ?? 1920, height: mod.config?.height ?? 1080 };
    } catch {
      return { width: 1920, height: 1080 };
    }
  }

  if (!url) {
    console.log("build  vite build");
    await runVite(cwd, ["build"]);
    const port = 4173 + Math.floor(Math.random() * 200);
    preview = spawnVite(cwd, ["preview", "--port", String(port), "--strictPort"], "ignore");
    url = `http://localhost:${port}/${slug}/`;
    await waitForServer(url, Date.now() + 20_000);
  }

  /** Poll until the preview answers (or the deadline passes) — one request every 200 ms. */
  async function waitForServer(target: string, deadline: number): Promise<void> {
    try {
      const r = await fetch(target);
      if (r.ok) return;
    } catch {
      /* not yet */
    }
    if (Date.now() >= deadline) return;
    await new Promise((r) => setTimeout(r, 200));
    return waitForServer(target, deadline);
  }

  try {
    const result = await exportDeck({
      url,
      outDir,
      slug: room,
      pdf: !has("--no-pdf"),
      png: has("--png"),
      pptx: has("--pptx"),
      scale: Number(val("--scale") ?? 2),
      upload: has("--upload")
        ? val("--upload")?.startsWith("http")
          ? val("--upload")!
          : (process.env.DECK_HOST ?? "https://deck.kadal.cc")
        : null,
      adminKey: process.env.DECK_ADMIN_KEY ?? null,
    });
    console.log(`\ndone   ${result.pages} pages, ${result.files.length} file(s)`);
  } finally {
    preview?.kill();
  }
}
