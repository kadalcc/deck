import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { readDeck } from "../authoring/source.ts";
import { UsageError } from "./args.ts";
import { openProject } from "./project.ts";
import { MissingDependencyError } from "./vite.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * kadal-deck format [files…] [--check]
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Formats deck files with @kadal/prettier-plugin (packages/prettier-plugin): one spelling for
 * separators and frontmatter, the YAML through Prettier's YAML printer with its comments, every
 * slide's Markdown through Prettier's — and code, notes, magic-move, `<style>`, `::slot::`,
 * code groups and snippet imports exactly as written. Each slide is checked to mean the same
 * after; one that would not keeps its text, and the command says which and why.
 *
 * With no files: the deck's `deck.mdx` and every file it pulls in with `src:` (inside the deck's
 * folder). The deck's own Prettier configuration (`.prettierrc`, `.editorconfig`) applies:
 * printWidth, proseWrap, tabWidth and the rest. `--check` writes nothing and exits 1 when a file
 * would change — for CI.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface FormatFileResult {
  file: string;
  changed: boolean;
  /** Slides (or parts of them) left as written, and why. */
  kept: Array<{ slide: number; line: number; reason: string }>;
}

export interface FormatRun {
  files: FormatFileResult[];
  /** Files that changed (written, or with --check, would be). */
  changed: number;
}

/** The deck file and the files its slides include, absolute. */
function deckFiles(dir: string): string[] {
  const project = openProject(dir, { confine: true });
  const deck = readDeck(project.files, { root: project.dir });
  const files = new Set([project.entry]);
  for (const s of deck.slides) files.add(s.range.file);
  return [...files];
}

async function load() {
  try {
    const [prettier, plugin] = await Promise.all([
      import("prettier"),
      import("@kadal/prettier-plugin"),
    ]);
    return { prettier, formatDeck: plugin.formatDeck };
  } catch (e) {
    throw new MissingDependencyError(
      `kadal-deck format needs prettier and @kadal/prettier-plugin, which come with @kadal/deck; reinstall the deck's dependencies (${e instanceof Error ? e.message.split("\n")[0] : String(e)}).`,
    );
  }
}

export async function formatFiles(
  dir: string,
  paths: string[],
  { check = false, cwd = dir }: { check?: boolean; cwd?: string } = {},
): Promise<FormatRun> {
  const files = paths.length ? paths.map((p) => resolve(cwd, p)) : deckFiles(dir);
  for (const f of files)
    if (!/\.(mdx|md)$/i.test(f))
      throw new UsageError(`${relative(cwd, f)} is not a deck file (.mdx or .md)`);
  const { prettier, formatDeck } = await load();
  const out: FormatFileResult[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch {
      throw new UsageError(`${relative(cwd, file)} does not exist`);
    }
    const config = (await prettier.resolveConfig(file, { editorconfig: true })) ?? {};
    const result = await formatDeck(source, prettier, {
      printWidth: config.printWidth,
      tabWidth: config.tabWidth,
      useTabs: config.useTabs,
      proseWrap: config.proseWrap,
      singleQuote: config.singleQuote,
      bracketSpacing: config.bracketSpacing,
      bodies: (config as { kadalDeckBodies?: boolean }).kadalDeckBodies !== false,
    });
    // The file's line endings, unless the configuration says otherwise.
    const eol =
      config.endOfLine === "crlf" ||
      ((config.endOfLine === "auto" || config.endOfLine === undefined) &&
        /\r\n/.test(source) &&
        !/(^|[^\r])\n/.test(source))
        ? "\r\n"
        : "\n";
    const text = eol === "\n" ? result.text : result.text.replace(/\n/g, "\r\n");
    const changed = text !== source;
    if (changed && !check) await writeFile(file, text);
    out.push({ file, changed, kept: result.kept });
  }
  return { files: out, changed: out.filter((f) => f.changed).length };
}
