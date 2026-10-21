import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";

import { escapeHtml } from "../core/head.ts";
import { outDirOf } from "./download.ts";
import { runVite } from "./vite.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `kadal-deck build`  —  one deck, or several, into a folder any static host can serve
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   kadal-deck build                         deck.mdx (or the plugin's `entry`) → dist/
 *   kadal-deck build talk.mdx                that file instead → dist/
 *   kadal-deck build a.mdx b.mdx             each file → dist/a/, dist/b/, at <base>a/ and <base>b/,
 *                                            plus dist/index.html listing them (Slidev's
 *                                            multiple entries)
 *   --base /talks/x/   --out dir (--outDir)  where it will live, and where it goes
 *
 * Every deck file is built by the deck's own Vite config, one after the other: the plugin reads
 * KADAL_DECK_ENTRY for the file and KADAL_DECK_SUBDIR for the folder it appends to the base and
 * the outDir (vite/index.ts), and writes where it went to KADAL_DECK_BUILD_RECORD, which is how
 * the PDF step (`--download`) and the listing find each build. Shared files (public/, src/, the
 * config) are shared, as Slidev's are.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface BuildEntry {
  /** The deck file, relative to the deck folder. */
  entry: string;
  /** Its folder under the output (null: the output itself). */
  subdir: string | null;
}

export interface BuildPlan {
  entries: BuildEntry[];
  /** Vite's own flags, `--out` spelled as Vite spells it. */
  vite: string[];
  /** The output folder as the command line names it (Vite's default when it does not). */
  outDir: string;
}

const DECK_FILE = /\.mdx?$/i;

/** A folder name for a deck file: `talks/2024 Intro.mdx` → `2024-intro`. */
export function entrySlug(file: string): string {
  const s = basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "deck";
}

/**
 * The command line → what to build. Deck files may come anywhere (a Vite switch before one must
 * not swallow it); the rest is Vite's. Two files with the same name get -2, -3….
 */
export function planBuild(positionals: string[], viteArgs: string[], out?: string): BuildPlan {
  const files = positionals.filter((p) => DECK_FILE.test(p));
  const vite: string[] = [];
  for (const a of viteArgs) (DECK_FILE.test(a) && !a.startsWith("-") ? files : vite).push(a);
  vite.push(...positionals.filter((p) => !DECK_FILE.test(p)));
  if (out) vite.push("--outDir", out);
  const seen = new Map<string, number>();
  const entries: BuildEntry[] = files.map((entry) => {
    if (files.length < 2) return { entry, subdir: null };
    const slug = entrySlug(entry);
    const n = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, n);
    return { entry, subdir: n === 1 ? slug : `${slug}-${n}` };
  });
  return {
    entries: entries.length ? entries : [{ entry: "", subdir: null }],
    vite,
    outDir: outDirOf(vite),
  };
}

/** What the plugin left after a build (vite/site.ts `closeBundle`). */
export interface BuildRecord {
  entry: string;
  outDir: string;
  base: string;
  title: string | null;
}

function readBuildRecord(file: string): BuildRecord | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as BuildRecord;
  } catch {
    return null;
  }
}

export interface BuildOptions {
  dir: string;
  plan: BuildPlan;
  /** Called after each deck's Vite build, with where it went (the PDF step). */
  after?: (record: BuildRecord, entry: BuildEntry) => Promise<void>;
  say?: (line: string) => void;
}

export async function runBuild({
  dir,
  plan,
  after,
  say = console.log,
}: BuildOptions): Promise<BuildRecord[]> {
  for (const e of plan.entries)
    if (e.entry && !existsSync(resolve(dir, e.entry)))
      throw new Error(`No deck file ${e.entry} in ${dir}`);
  const multi = plan.entries.length > 1;
  const outRoot = resolve(dir, plan.outDir);
  // Several decks share one output: clear it once, as Vite would for one (and only inside the
  // deck folder, as Vite would). A deck removed from the command does not linger.
  if (
    multi &&
    !relative(dir, outRoot).startsWith("..") &&
    !isAbsolute(relative(dir, outRoot)) &&
    outRoot !== dir
  )
    rmSync(outRoot, { recursive: true, force: true });
  const records: BuildRecord[] = [];
  const saved = {
    entry: process.env.KADAL_DECK_ENTRY,
    subdir: process.env.KADAL_DECK_SUBDIR,
    record: process.env.KADAL_DECK_BUILD_RECORD,
  };
  const scratch = mkdtempSync(join(tmpdir(), "kadal-deck-build-"));
  const recordFile = join(scratch, "build.json");
  process.env.KADAL_DECK_BUILD_RECORD = recordFile;
  try {
    for (const e of plan.entries) {
      if (e.entry) process.env.KADAL_DECK_ENTRY = e.entry;
      else delete process.env.KADAL_DECK_ENTRY;
      if (e.subdir) process.env.KADAL_DECK_SUBDIR = e.subdir;
      else delete process.env.KADAL_DECK_SUBDIR;
      if (multi) say(`\nbuild  ${e.entry} → ${join(plan.outDir, e.subdir ?? "")}`);
      rmSync(recordFile, { force: true });
      await runVite(dir, ["build", ...plan.vite]);
      const record = readBuildRecord(recordFile) ?? {
        entry: e.entry || "deck.mdx",
        outDir: resolve(dir, plan.outDir, e.subdir ?? ""),
        base: "/",
        title: null,
      };
      records.push(record);
      if (after) await after(record, e);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    for (const [k, v] of [
      ["KADAL_DECK_ENTRY", saved.entry],
      ["KADAL_DECK_SUBDIR", saved.subdir],
      ["KADAL_DECK_BUILD_RECORD", saved.record],
    ] as const)
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
  if (multi) writeIndexPages(outRoot, plan.entries, records);
  return records;
}

/**
 * The output's own pages for several decks: index.html lists them, 404.html (GitHub Pages) says
 * so and lists them too, and _redirects gathers each deck's single-page rule (Netlify reads the
 * top folder's only). Files the decks' public/ put at the top are not replaced.
 */
export function writeIndexPages(
  outRoot: string,
  entries: BuildEntry[],
  records: BuildRecord[],
): void {
  mkdirSync(outRoot, { recursive: true });
  const items = entries.map((e, i) => ({
    href: `./${e.subdir}/`,
    title: records[i]?.title || e.subdir!,
    file: e.entry,
  }));
  const page = (heading: string, lead: string) => indexHtml(heading, lead, items);
  if (!existsSync(join(outRoot, "index.html")))
    writeFileSync(join(outRoot, "index.html"), page("Decks", `${items.length} decks.`));
  if (!existsSync(join(outRoot, "404.html")))
    writeFileSync(
      join(outRoot, "404.html"),
      page("Not found", "There is no page at this address. These decks are here:"),
    );
  const rules = records
    .map((r) => {
      try {
        return readFileSync(join(r.outDir, "_redirects"), "utf8").trim();
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  if (rules.length && !existsSync(join(outRoot, "_redirects")))
    writeFileSync(join(outRoot, "_redirects"), `${rules.join("\n")}\n`);
}

/** A small page, both colour schemes, readable at phone width. */
export function indexHtml(
  heading: string,
  lead: string,
  items: Array<{ href: string; title: string; file: string }>,
): string {
  const list = items
    .map(
      (d) =>
        `      <li><a href="${escapeHtml(d.href)}">${escapeHtml(d.title)}</a> <span>${escapeHtml(d.file)}</span></li>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
    <style>
      :root { color-scheme: light dark; --bg: #fafafa; --fg: #111; --muted: #666; --link: #1d4ed8; }
      @media (prefers-color-scheme: dark) { :root { --bg: #0b0b0d; --fg: #f4f4f5; --muted: #a1a1aa; --link: #93c5fd; } }
      body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
      main { max-width: 40rem; margin: 0 auto; padding: 3rem 1rem; }
      h1 { font-size: 1.75rem; margin: 0 0 0.25rem; }
      p { color: var(--muted); margin: 0 0 1.5rem; }
      ul { list-style: none; padding: 0; margin: 0; }
      li { padding: 0.75rem 0; border-top: 1px solid color-mix(in srgb, var(--fg) 12%, transparent); overflow-wrap: anywhere; }
      a { color: var(--link); font-weight: 600; text-decoration: none; }
      a:hover, a:focus-visible { text-decoration: underline; }
      span { display: block; color: var(--muted); font-size: 0.875rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(lead)}</p>
      <ul>
${list}
      </ul>
    </main>
  </body>
</html>
`;
}
