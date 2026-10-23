import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

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
  /** Set when reads and writes are confined to the deck folder. */
  confined: boolean;
}

/** A path tried to leave the folder a tool is confined to. */
export class OutsideError extends Error {
  override name = "OutsideError";
}

/** The real path of `p`, or of its nearest existing ancestor joined with the rest. */
export function realish(p: string): string {
  const abs = resolve(p);
  try {
    return realpathSync(abs);
  } catch {
    const parent = dirname(abs);
    return parent === abs ? abs : join(realish(parent), basename(abs));
  }
}

/** Is `p` (after symlinks) inside `root`? */
export function isInside(root: string, p: string): boolean {
  const r = realish(root);
  const q = realish(p);
  const rel = relative(r, q);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function openProject(
  dir: string,
  { mustExist = true, confine = false }: { mustExist?: boolean; confine?: boolean } = {},
): DeckProject {
  const root = resolve(dir);
  const entry = join(root, "deck.mdx");
  if (mustExist && !existsSync(entry)) throw new NoDeckError(root);
  const allowed = (p: string) => !confine || isInside(root, p);
  return {
    dir: root,
    entry,
    confined: confine,
    files: {
      entry,
      read: (p) => {
        if (!allowed(p)) return null;
        try {
          return readFileSync(p, "utf8");
        } catch {
          return null;
        }
      },
    },
    exists: (p) => {
      if (!allowed(p)) return false;
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    },
  };
}

/**
 * Save an edit's files (write to a temp file, then rename, so a reader never sees half). A
 * confined project refuses any file outside its folder before writing anything.
 */
export function saveEdit(result: EditResult, project?: DeckProject): string[] {
  const files = Object.entries(result.files);
  if (project?.confined)
    for (const [file] of files)
      if (!isInside(project.dir, file))
        throw new OutsideError(
          `Refusing to write ${file}: it is outside the deck folder ${project.dir}.`,
        );
  const written: string[] = [];
  for (const [file, text] of files) {
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

/**
 * What the deck's theme and addon packages add, for the linter: the theme names they resolve
 * to (and the specs that named them), the layouts and components their metadata lists, and an
 * error for each one that does not resolve — with the resolver's own message (what was tried,
 * how to install it).
 */
export async function packageExtensions(project: DeckProject): Promise<{
  themes: string[];
  layouts: string[];
  components: string[];
  diagnostics: LintResult["diagnostics"];
}> {
  const { readDeck } = await import("../authoring/source.ts");
  const { requestedPackages } = await import("../theming/contract.ts");
  const { resolvePackage } = await import("../theming/resolve.ts");
  const { DEFAULT_CONFIG } = await import("../core/model.ts");
  const out = {
    themes: [] as string[],
    layouts: [] as string[],
    components: [] as string[],
    diagnostics: [] as LintResult["diagnostics"],
  };
  let headmatter: Record<string, unknown>;
  try {
    headmatter = readDeck(project.files, { root: project.dir }).headmatter;
  } catch {
    return out;
  }
  const want = requestedPackages(
    headmatter,
    headmatter.themes === undefined ? [] : DEFAULT_CONFIG.themes,
  );
  const asked = [
    ...(typeof headmatter.theme === "string" || headmatter.themes !== undefined
      ? want.themes
      : []
    ).map((spec) => ["theme", spec] as const),
    ...want.addons.map((spec) => ["addon", spec] as const),
  ];
  for (const [kind, spec] of asked) {
    try {
      const r = resolvePackage(kind, spec, project.dir);
      if (kind === "theme") out.themes.push(spec, r.name);
      out.layouts.push(...(r.meta.layouts ?? []));
      out.components.push(...(r.meta.components ?? []));
    } catch (e) {
      if ((e as Error).name !== "PackageResolveError") throw e;
      out.diagnostics.push({
        severity: "error",
        code: `${kind}-missing`,
        message: (e as Error).message.split("\n")[0]!,
        hint: (e as Error).message.split("\n").slice(1).join("\n"),
        file: project.entry,
        line: 1,
      });
    }
  }
  return out;
}

export async function checkProject(
  project: DeckProject,
  { compile = true } = {},
): Promise<LintResult> {
  const { lintDeck, readExtensions } = await import("../authoring/index.ts");
  const { loadIconSet } = await import("../icons/node.ts");
  const componentsFile = join(project.dir, "src", "components.tsx");
  const others = sourcesUnder(join(project.dir, "src"))
    .filter((f) => f !== componentsFile)
    .map((f) => project.files.read(f) ?? "");
  // setup/code-runners.* as the Vite plugin finds it (vite/monaco.ts setupFile).
  const runnersSource =
    ["ts", "mts", "js", "mjs", "tsx", "jsx"]
      .map((e) => project.files.read(join(project.dir, "setup", `code-runners.${e}`)))
      .find((t) => t != null) ?? null;
  const extensions = readExtensions(project.files.read(componentsFile), others, runnersSource);
  // Theme and addon packages: their layouts and components are the deck's too, and a theme that
  // resolves is one the deck ships (its CSS comes in through the Vite plugin).
  const pk = await packageExtensions(project);
  extensions.layouts.push(...pk.layouts);
  extensions.components.push(...pk.components);
  const own = deckThemes(project);
  const themes = own || pk.themes.length ? [...(own ?? []), ...pk.themes] : undefined;
  const result = await lintDeck({
    files: project.files,
    exists: project.exists,
    root: project.dir,
    extensions,
    themes,
    configKeys: configKeys(project.files.read(join(project.dir, "deck.config.ts"))),
    compile,
    icons: (prefix) => loadIconSet(prefix, project.dir),
  });
  if (!pk.diagnostics.length) return result;
  // A package that does not resolve says so once, with how to install it, rather than as an
  // unknown theme as well.
  const diagnostics = [
    ...pk.diagnostics,
    ...result.diagnostics.filter(
      (d) =>
        !(d.code === "theme-unknown" && pk.diagnostics.some((p) => p.code === "theme-missing")),
    ),
  ];
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  return {
    ...result,
    diagnostics,
    errors,
    warnings: diagnostics.filter((d) => d.severity === "warning").length,
    ok: errors === 0,
  };
}

export function rel(project: DeckProject | string, file: string): string {
  const dir = typeof project === "string" ? project : project.dir;
  const r = relative(dir, file);
  return r.startsWith("..") ? file : r || ".";
}
