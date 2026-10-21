import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { splitDeck } from "../compiler/index.ts";
import { DOWNLOAD_FILE } from "../core/download.ts";
import { DeckServer } from "./render.ts";

/**
 * `kadal-deck build --download` (or `download: true` in the headmatter or deck.config.ts):
 * after Vite has built dist/, serve it, print it to PDF (the same faithful export as
 * `kadal-deck export`) and leave the file beside index.html as `deck.pdf`, where the deck's
 * Download button looks for it (core/download.ts). A `download:` URL needs no build step.
 */

/** Does the deck ask for a built PDF (`download: true`)? A URL or nothing does not. */
export async function deckWantsDownload(dir: string, entry = "deck.mdx"): Promise<boolean> {
  try {
    const mod = (await import(pathToFileURL(resolve(dir, "deck.config.ts")).href)) as {
      config?: { download?: unknown };
    };
    if (mod.config?.download !== undefined) return mod.config.download === true;
  } catch {
    /* no deck.config.ts, or one that does not load outside Vite: the headmatter decides */
  }
  const file = join(dir, entry);
  if (!existsSync(file)) return false;
  try {
    return splitDeck(readFileSync(file, "utf8"), { file }).headmatter.download === true;
  } catch {
    return false;
  }
}

/** The `--outDir` a Vite command line names, else dist. */
export function outDirOf(viteArgs: string[]): string {
  for (let i = 0; i < viteArgs.length; i++) {
    const a = viteArgs[i]!;
    if (a.startsWith("--outDir=")) return a.slice("--outDir=".length);
    if (a === "--outDir" && viteArgs[i + 1]) return viteArgs[i + 1]!;
  }
  return "dist";
}

export async function buildDownload(
  dir: string,
  {
    outDir = "dist",
    port,
    base,
    say = console.log,
  }: {
    outDir?: string;
    port?: number;
    /** The base the build was made for (`--base`, or one of several decks' folder). */
    base?: string;
    say?: (line: string) => void;
  } = {},
): Promise<string> {
  const target = resolve(dir, outDir);
  say(`pdf    printing the built deck for its Download button`);
  // The preview must serve the build where it was built to live, or its asset URLs miss.
  const args = [
    ...(outDir !== "dist" ? ["--outDir", outDir] : []),
    ...(base ? ["--base", base] : []),
  ];
  const server = await DeckServer.start(dir, "preview", {
    build: false,
    ...(port ? { port } : {}),
    ...(args.length ? { args } : {}),
  });
  try {
    const { exportDeck } = await import("../export/index.ts");
    const result = await exportDeck({
      url: server.url,
      outDir: target,
      slug: basename(dir),
      name: DOWNLOAD_FILE.replace(/\.pdf$/, ""),
      formats: ["pdf"],
      log: (line) => say(line),
    });
    const pdf = result.files.find((f) => f.kind === "pdf");
    if (!pdf) throw new Error("the PDF was not written");
    return pdf.path;
  } finally {
    server.stop();
  }
}
