import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

import type { DeckFiles, EditResult, LintResult } from "../authoring/index.ts";

/**
 * A deck folder on disk, for the CLI and the MCP server: the authoring layer's DeckFiles over the
 * file system, the deck's own extensions read from src/, and atomic saves.
 */

export class NoDeckError extends Error {
  constructor(dir: string) {
    super(
      `No deck.mdx in ${dir}. Run this in a deck folder (or pass --dir), or create one with \`kadal-deck new <dir>\`.`,
    );
  }
}

export interface DeckProject {
  dir: string;
  entry: string;
  files: DeckFiles;
  exists: (path: string) => boolean;
}

export function openProject(dir: string, { mustExist = true } = {}): DeckProject {
  const root = resolve(dir);
  const entry = join(root, "deck.mdx");
  if (mustExist && !existsSync(entry)) throw new NoDeckError(root);
  return {
    dir: root,
    entry,
    files: {
      entry,
      read: (p) => {
        try {
          return readFileSync(p, "utf8");
        } catch {
          return null;
        }
      },
    },
    exists: (p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    },
  };
}

/** Save an edit's files (write to a temp file, then rename, so a reader never sees half). */
export function saveEdit(result: EditResult): string[] {
  const written: string[] = [];
  for (const [file, text] of Object.entries(result.files)) {
    const tmp = `${file}.kadal-deck-${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
    written.push(file);
  }
  return written;
}

function sourcesUnder(dir: string, depth = 0): string[] {
  if (depth > 4 || !existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name === "node_modules" || e.name.startsWith(".")
      ? []
      : e.isDirectory()
        ? sourcesUnder(join(dir, e.name), depth + 1)
        : /\.(tsx?|jsx?|mjs)$/.test(e.name)
          ? [join(dir, e.name)]
          : [],
  );
}

/** Themes the deck can show: the theme stylesheets its main.tsx imports, plus `themes:` lists. */
export function deckThemes(project: DeckProject): string[] | undefined {
  const main = project.files.read(join(project.dir, "src", "main.tsx"));
  const config = project.files.read(join(project.dir, "deck.config.ts")) ?? "";
  if (main === null) return undefined;
  const names = new Set<string>();
  for (const m of main.matchAll(/@kadal\/deck\/themes\/([\w-]+)\.css/g))
    if (!["base", "bling", "glossary", "live", "sketch"].includes(m[1]!)) names.add(m[1]!);
  const list = /themes\s*:\s*\[([^\]]*)\]/.exec(config)?.[1];
  for (const m of list?.matchAll(/["']([\w-]+)["']/g) ?? []) names.add(m[1]!);
  // A theme can also be plain CSS the deck defines itself (.theme-name in its stylesheets).
  for (const css of ["src/styles.css"]) {
    const text = project.files.read(join(project.dir, css)) ?? "";
    for (const m of text.matchAll(/\.theme-([\w-]+)/g)) names.add(m[1]!);
  }
  return names.size ? [...names] : undefined;
}

/** The top-level keys of the object deck.config.ts exports as `config` (read as text). */
export function configKeys(source: string | null): string[] {
  if (!source) return [];
  const m = /export\s+const\s+config\b[^=]*=\s*\{/.exec(source);
  if (!m) return [];
  let depth = 0;
  let i = m.index + m[0].length - 1;
  const start = i + 1;
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) break;
  }
  let flat = source.slice(start, i).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  for (let k = 0; k < 6; k++) flat = flat.replace(/\{[^{}]*\}|\[[^[\]]*\]|\([^()]*\)/g, "");
  return [...flat.matchAll(/(?:^|,)\s*["']?([A-Za-z_$][\w$]*)["']?\s*:/g)].map((k) => k[1]!);
}

export async function checkProject(
  project: DeckProject,
  { compile = true } = {},
): Promise<LintResult> {
  const { lintDeck, readExtensions } = await import("../authoring/index.ts");
  const componentsFile = join(project.dir, "src", "components.tsx");
  const others = sourcesUnder(join(project.dir, "src"))
    .filter((f) => f !== componentsFile)
    .map((f) => project.files.read(f) ?? "");
  const extensions = readExtensions(project.files.read(componentsFile), others);
  return lintDeck({
    files: project.files,
    exists: project.exists,
    root: project.dir,
    extensions,
    themes: deckThemes(project),
    configKeys: configKeys(project.files.read(join(project.dir, "deck.config.ts"))),
    compile,
  });
}

export function rel(project: DeckProject | string, file: string): string {
  const dir = typeof project === "string" ? project : project.dir;
  const r = relative(dir, file);
  return r.startsWith("..") ? file : r || ".";
}
