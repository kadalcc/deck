import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { type DeclarationWalk, walkDeclarations } from "../monaco/dts-graph.ts";
import {
  MAX_BYTES,
  MAX_FILES,
  type TypeFile,
  importedPackages,
  packageOf,
  specifiersOf,
  subpathOf,
  typesPackageOf,
} from "../monaco/types.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `virtual:deck/monaco-types/<pkg>`: an editor's types from the deck's own node_modules
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The `local` half of type acquisition (monaco/types.ts has the whole story). For each package a
 * `{monaco…}` block imports, or `monacoPackages` names, that the deck has installed, the Monaco
 * module lists a lazy import of this module, which is the package's declaration files — and
 * those of the packages they import, found from the package's own folder, as Node would — as
 * one JSON array. The editor loads it the first time an editor imports the package: the version
 * the deck installed, with no network, in a build that works offline.
 *
 * A package without declarations of its own brings `@types/<pkg>`'s, when that is installed. The
 * same limits as the CDN path apply per package (`MAX_FILES`, `MAX_BYTES`), so a heavy package
 * costs some missing types rather than a huge chunk.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DECLARATION = /\.d\.[mc]?ts$/;

/** The folder of `pkg` as seen from `from`: the first `node_modules/<pkg>` up the tree, real path. */
export function findPackage(pkg: string, from: string): string | null {
  let dir = from;
  for (;;) {
    const candidate = join(dir, "node_modules", pkg);
    if (existsSync(join(candidate, "package.json"))) {
      try {
        return realpathSync(candidate);
      } catch {
        return candidate;
      }
    }
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function declarations(root: string): string[] {
  const out: string[] = [];
  let bytes = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || out.length >= MAX_FILES) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    // Shallow files first, so a cut keeps the entry points.
    entries.sort((a, b) => Number(a.isDirectory()) - Number(b.isDirectory()));
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (
          !["node_modules", "test", "tests", "__tests__"].includes(e.name) &&
          !e.name.startsWith(".")
        )
          walk(p, depth + 1);
      } else if (DECLARATION.test(e.name)) {
        const size = statSync(p).size;
        if (bytes + size > MAX_BYTES) return;
        bytes += size;
        out.push(p);
      }
    }
  };
  walk(root, 0);
  return out;
}

/**
 * Every declaration file `pkg` needs for `subpaths` ("" is the package itself), as
 * `/node_modules/…` paths, found from `from` (the deck's folder) — what its entries reach
 * (monaco/dts-graph.ts), and what those import from other packages, each found from the
 * importing package's own folder as Node would; null when it is not installed or has no types,
 * its own or `@types/`.
 */
export async function localTypes(
  pkg: string,
  from: string,
  ignore: readonly string[] = [],
  subpaths: readonly string[] = [""],
): Promise<TypeFile[] | null> {
  const files: TypeFile[] = [];
  const walks = new Map<
    string,
    { walk: DeclarationWalk; root: string; bare: Array<[string, string]> } | null
  >();
  const visit = async (name: string, where: string, subs: readonly string[]): Promise<boolean> => {
    if (ignore.includes(name)) return false;
    let known = walks.get(name);
    if (known === null) return false;
    if (!known) {
      const root = findPackage(name, where);
      const own = root ? declarations(root) : [];
      if (!root || !own.length) {
        walks.set(name, null);
        // DefinitelyTyped's, when the package ships none (or is not even installed).
        return name.startsWith("@types/") ? false : visit(typesPackageOf(name), where, subs);
      }
      const rel = (file: string) => `/${relative(root, file).split(sep).join("/")}`;
      const pkgText = readFileSync(join(root, "package.json"), "utf8");
      files.push({ path: `/node_modules/${name}/package.json`, text: pkgText });
      let pkgJson: unknown = {};
      try {
        pkgJson = JSON.parse(pkgText);
      } catch {
        /* the files still help */
      }
      const bare: Array<[string, string]> = [];
      let bytes = 0;
      const walk: DeclarationWalk = {
        listed: new Set(own.map(rel)),
        pkgJson,
        read: async (p) => {
          if (bytes > MAX_BYTES) return null;
          try {
            const text = readFileSync(join(root, ...p.split("/")), "utf8");
            bytes += text.length;
            return text;
          } catch {
            return null;
          }
        },
        visited: new Set(),
        onFile: (p, text) => files.push({ path: `/node_modules/${name}${p}`, text }),
        onBare: (spec) => {
          const dep = packageOf(spec);
          if (dep && dep !== name) bare.push([dep, subpathOf(spec)]);
        },
        maxFiles: MAX_FILES,
      };
      known = { walk, root, bare };
      walks.set(name, known);
      if (!(await walkDeclarations(walk, [...subs]))) {
        // No entry found: every declaration the package has.
        for (const p of walk.listed) {
          const text = await walk.read(p);
          if (text === null) continue;
          walk.visited.add(p);
          walk.onFile(p, text);
          for (const s of specifiersOf(text)) if (!/^\.{1,2}\//.test(s)) walk.onBare(s);
        }
      }
    } else {
      // Known already: walk on from the subpaths not asked for before.
      await walkDeclarations(known.walk, [...subs]);
    }
    // Dependencies resolve from the package's own folder, the way Node finds them.
    for (const [dep, sub] of known.bare.splice(0)) await visit(dep, known.root, [sub]);
    return true;
  };
  return (await visit(pkg, from, subpaths)) ? files : null;
}

/** The code of every `{monaco…}` fence in these slides' (expanded) text. */
export function monacoSources(contents: string[]): string[] {
  const out: string[] = [];
  for (const c of contents) {
    if (!c.includes("{monaco")) continue;
    const lines = c.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const open = /^[ \t]*(`{3,}|~{3,})[^\n]*\{monaco(?:-(?:diff|run|write))?\}/.exec(lines[i]!);
      if (!open) continue;
      const mark = open[1]!;
      let j = i + 1;
      while (j < lines.length && !lines[j]!.trim().startsWith(mark)) j++;
      out.push(lines.slice(i + 1, j).join("\n"));
      i = j;
    }
  }
  return out;
}

/** The packages the deck's editors import, plus those `monacoPackages` names, that it has installed. */
export function localTypePackages(
  sources: string[],
  extra: readonly string[],
  deckDir: string,
  ignore: readonly string[] = [],
): string[] {
  const want = new Set<string>(extra);
  for (const src of sources) for (const p of importedPackages(src)) want.add(p);
  return [...want].filter(
    (p) =>
      !ignore.includes(p) &&
      (!!findPackage(p, deckDir) || !!findPackage(typesPackageOf(p), deckDir)),
  );
}

/** What the editors ask of each package: `zod` and `zod/mini` → zod: ["", "mini"]. */
export function typeRequests(sources: string[], extra: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const ask = (pkg: string, sub: string) => {
    const list = out.get(pkg) ?? [];
    if (!list.includes(sub)) list.push(sub);
    out.set(pkg, list);
  };
  for (const p of extra) ask(p, "");
  for (const src of sources)
    for (const spec of specifiersOf(src)) {
      const p = packageOf(spec);
      if (p) ask(p, subpathOf(spec));
    }
  return out;
}
