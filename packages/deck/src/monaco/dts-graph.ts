import { specifiersOf } from "./types-config.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHICH DECLARATION FILES A PACKAGE'S TYPES NEED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A package often ships far more declarations than one import reaches — zod 4 has some 250
 * (`.d.ts` and `.d.cts` twins, a v3, a mini build, forty locales). So type acquisition starts
 * where TypeScript would — the package.json's `exports` (its `types` conditions, or the `.d.ts`
 * beside each JavaScript target), else `types` / `typings`, else `main` / `index` — for the root
 * and each subpath the code imports (`zod/mini`), and follows the relative imports and
 * `/// <reference path>`s from there, taking only files the package actually lists. Bare imports
 * found on the way are handed back: they are other packages, acquired in turn.
 *
 * When no entry can be found (an odd layout, `typesVersions` redirects), the caller takes every
 * declaration instead: more bytes, never fewer types. Shared by the CDN path (monaco/types.ts)
 * and the deck's own node_modules (vite/monaco-types.ts).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DECL = /\.d\.[mc]?ts$/;

/** The declaration files TypeScript would try for a module path inside a package (`/a/b.js`). */
export function declarationCandidates(path: string): string[] {
  const p = normalise(path);
  if (DECL.test(p)) return [p];
  const js = /^(.*)\.([mc]?)(?:js|jsx|ts|tsx)$/.exec(p);
  if (js) {
    const [, stem, kind] = js;
    return kind
      ? [`${stem}.d.${kind}ts`, `${stem}.d.ts`]
      : [`${stem}.d.ts`, `${stem}.d.cts`, `${stem}.d.mts`];
  }
  if (p.endsWith("/")) return [`${p}index.d.ts`];
  return [
    `${p}.d.ts`,
    `${p}.d.cts`,
    `${p}.d.mts`,
    `${p}/index.d.ts`,
    `${p}/index.d.cts`,
    `${p}/index.d.mts`,
  ];
}

/** `/a/./b/../c` → `/a/c`, always with a leading slash. */
function normalise(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}${path.endsWith("/") && out.length ? "/" : ""}`;
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);

/**
 * The conditions the editor's TypeScript resolves with (`moduleResolution: bundler`, see
 * monaco/host.ts): `require` is not among them, so a package's CommonJS twin (`index.d.cts`
 * beside `index.d.ts`, and everything it imports) is not fetched at all.
 */
const CONDITIONS = new Set(["types", "import", "module", "browser", "default"]);

/** The string targets under an `exports` value, for the conditions above, `types` first. */
function targets(value: unknown, out: string[] = [], all = false): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) targets(v, out, all);
  else if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("types" in o) targets(o.types, out, all);
    for (const [k, v] of Object.entries(o))
      if (k !== "types" && (all || CONDITIONS.has(k))) targets(v, out, all);
    // Only conditions the editor does not use (`require`, `node`): better those than nothing.
    if (!out.length && !all) targets(value, out, true);
  }
  return out;
}

/**
 * Where TypeScript would look for `subpath` ("" for the package itself, `mini` for `zod/mini`),
 * as package-relative paths, most likely first.
 */
export function entryCandidates(pkgJson: unknown, subpath: string): string[] {
  const pkg = (pkgJson && typeof pkgJson === "object" ? pkgJson : {}) as Record<string, unknown>;
  const key = subpath ? `./${subpath}` : ".";
  const out: string[] = [];
  const exp = pkg.exports;
  if (exp !== undefined && exp !== null) {
    const map =
      typeof exp === "string" ||
      Array.isArray(exp) ||
      !Object.keys(exp).some((k) => k.startsWith("."))
        ? { ".": exp }
        : (exp as Record<string, unknown>);
    if (key in map) out.push(...targets(map[key]));
    else
      for (const [pattern, v] of Object.entries(map)) {
        const star = pattern.indexOf("*");
        if (star < 0) continue;
        const head = pattern.slice(0, star);
        const tail = pattern.slice(star + 1);
        if (key.startsWith(head) && key.endsWith(tail) && key.length >= head.length + tail.length) {
          const fill = key.slice(head.length, key.length - tail.length);
          out.push(...targets(v).map((t) => t.replace(/\*/g, fill)));
        }
      }
  }
  if (!subpath) {
    for (const f of ["types", "typings", "module", "main"])
      if (typeof pkg[f] === "string") out.push(pkg[f] as string);
    out.push("index");
  } else out.push(subpath);
  return [...new Set(out.flatMap((t) => declarationCandidates(t)))];
}

export interface DeclarationWalk {
  /** Every declaration file the package lists (package-relative, leading slash). */
  listed: ReadonlySet<string>;
  pkgJson: unknown;
  /** Read one listed file; null when it cannot be had. */
  read(path: string): Promise<string | null>;
  /** Files already taken from this package (shared across walks, so a later subpath adds only what is new). */
  visited: Set<string>;
  /** Told about each file taken. */
  onFile(path: string, text: string): void;
  /** Told about each bare specifier the files import. */
  onBare(specifier: string): void;
  maxFiles: number;
}

/**
 * Walk from the entries of `subpaths` along relative imports. Resolves to false when none of the
 * entries is a listed file, so the caller can fall back to every declaration.
 */
export async function walkDeclarations(w: DeclarationWalk, subpaths: string[]): Promise<boolean> {
  const queue: string[] = [];
  let found = false;
  for (const sub of subpaths) {
    // The first that exists, as TypeScript takes it.
    const hit = entryCandidates(w.pkgJson, sub).find((c) => w.listed.has(c));
    if (hit) {
      found = true;
      queue.push(hit);
    }
  }
  if (!found) return false;
  while (queue.length) {
    const batch = queue.splice(0, 8).filter((p) => !w.visited.has(p));
    for (const p of batch) w.visited.add(p);
    if (w.visited.size > w.maxFiles) return true;
    const texts = await Promise.all(batch.map((p) => w.read(p).then((t) => [p, t] as const)));
    for (const [p, text] of texts) {
      if (text === null) continue;
      w.onFile(p, text);
      const refs = [
        ...specifiersOf(text),
        ...[...text.matchAll(/\/\/\/\s*<reference\s+path\s*=\s*["']([^"']+)["']/g)].map(
          (m) => `./${m[1]!.replace(/^\.\//, "")}`,
        ),
      ];
      for (const s of refs) {
        if (/^\.{1,2}\//.test(s)) {
          const next = declarationCandidates(dirOf(p) + s).find((c) => w.listed.has(c));
          if (next && !w.visited.has(next)) queue.push(next);
        } else w.onBare(s);
      }
    }
  }
  return true;
}
