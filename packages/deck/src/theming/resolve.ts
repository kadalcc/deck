import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type AddonMeta,
  BUILTIN_THEMES,
  type PackageKind,
  type ThemeMeta,
  firstPartyTheme,
  isPathSpec,
  packageCandidates,
  readMeta,
} from "./contract.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FINDING A THEME OR ADDON ON DISK (Node only: the Vite plugin, the CLI, `check`)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `theme: seriph` is looked for from the deck's own folder, the way Node would look for an
 * import there — the deck's node_modules, then its parents' — so a deck uses the theme it
 * installed, never one this package happens to sit next to:
 *
 *   1. a built-in theme (minimal · rla · stack · none): its CSS ships in @kadal/deck
 *   2. @kadal/theme-seriph   3. kadal-theme-seriph   4. seriph, as a package name
 *   5. a first-party theme's copy inside @kadal/deck (`bundledTheme`), when none is installed
 *   — or, for `./theme`, `../shared/theme`, `/abs/theme`: that folder, beside deck.mdx
 *
 * A package is found by its package.json, not by `require.resolve` of its entry: a theme may
 * have no JavaScript at all, and its `exports` need not list package.json. Its stylesheet is
 * `exports["./style.css"]` (or style.css at its root); its module is `exports["."]` (or
 * `module`/`main`, or an index.{tsx,ts,jsx,js} at its root). Nothing is executed here.
 *
 * When nothing matches, the error lists every name tried and the command that installs the
 * likeliest one, with the deck's own package manager.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ResolvedPackage {
  kind: PackageKind;
  /** As the deck wrote it. */
  spec: string;
  /** The class / menu name, from the metadata. */
  name: string;
  /** The npm name (null for a built-in, or a folder without a package.json). */
  package: string | null;
  builtin: boolean;
  /** The package folder (real path); null for a built-in. */
  root: string | null;
  /** The stylesheet: an absolute path, or a specifier for a built-in; null when there is none. */
  css: string | null;
  /** The module's absolute path, when the package has one. */
  module: string | null;
  meta: ThemeMeta | AddonMeta;
  /** Files whose change should rebuild the manifest (package.json). */
  watch: string[];
}

export class PackageResolveError extends Error {
  override name = "PackageResolveError";
}

type Pkg = {
  name?: string;
  keywords?: unknown;
  kadal?: unknown;
  exports?: unknown;
  module?: unknown;
  main?: unknown;
};

function readJson(file: string): Pkg | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Pkg;
  } catch {
    return null;
  }
}

const isFile = (p: string) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};
const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** The target an `exports` entry names for `import` (conditions in Vite's order of preference). */
function exportTarget(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (Array.isArray(entry)) {
    for (const e of entry) {
      const t = exportTarget(e);
      if (t) return t;
    }
    return null;
  }
  if (entry && typeof entry === "object") {
    const o = entry as Record<string, unknown>;
    for (const cond of ["browser", "import", "module", "default"])
      if (cond in o) return exportTarget(o[cond]);
  }
  return null;
}

function exportsEntry(pkg: Pkg, subpath: "." | "./style.css"): string | null {
  const ex = pkg.exports;
  if (ex === undefined || ex === null) return null;
  if (subpath === "." && (typeof ex === "string" || Array.isArray(ex))) return exportTarget(ex);
  if (typeof ex !== "object") return null;
  const map = ex as Record<string, unknown>;
  // `exports` may be a conditions object for "." alone (no keys start with ".").
  if (!Object.keys(map).some((k) => k.startsWith(".")))
    return subpath === "." ? exportTarget(map) : null;
  return exportTarget(map[subpath]);
}

const MODULE_FILES = ["index.tsx", "index.ts", "index.jsx", "index.js", "index.mjs"];

/** The stylesheet and module of a package folder. */
export function packageFiles(
  root: string,
  pkg: Pkg | null,
): { css: string | null; module: string | null } {
  const at = (rel: string | null) => (rel ? resolve(root, rel) : null);
  const cssTarget = pkg ? at(exportsEntry(pkg, "./style.css")) : null;
  const css =
    cssTarget && isFile(cssTarget)
      ? cssTarget
      : isFile(join(root, "style.css"))
        ? join(root, "style.css")
        : null;
  let module: string | null = null;
  const fromExports = pkg ? at(exportsEntry(pkg, ".")) : null;
  if (fromExports && isFile(fromExports) && !fromExports.endsWith(".css")) module = fromExports;
  else {
    for (const field of ["module", "main"] as const) {
      const v = pkg?.[field];
      if (!module && typeof v === "string" && isFile(resolve(root, v)) && !v.endsWith(".css"))
        module = resolve(root, v);
    }
    if (!module && !fromExports)
      for (const f of MODULE_FILES) if (!module && isFile(join(root, f))) module = join(root, f);
  }
  return { css, module };
}

/** The folders Node would look in for `name` from `from`: node_modules here and above. */
function lookupDirs(from: string, name: string): string[] {
  const req = createRequire(join(from, "noop.js"));
  return (req.resolve.paths(name) ?? []).map((p) => join(p, name));
}

/** The folder of an installed package, found from the deck's folder; null when it is not there. */
export function findPackageRoot(name: string, from: string): string | null {
  for (const dir of lookupDirs(from, name)) {
    if (isFile(join(dir, "package.json"))) {
      try {
        return realpathSync(dir);
      } catch {
        return dir;
      }
    }
  }
  return null;
}

/** This package's own folder (where its package.json is), from wherever this module runs. */
let engineRoot: string | null | undefined;
function ownRoot(): string | null {
  if (engineRoot !== undefined) return engineRoot;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const pkg = readJson(join(dir, "package.json"));
    if (pkg?.name === "@kadal/deck") return (engineRoot = dir);
    const up = dirname(dir);
    if (up === dir) return (engineRoot = null);
    dir = up;
  }
}

/**
 * The engine's copy of a first-party theme package (`ocean` → @kadal/deck's dist/themes/ocean),
 * or null. The copy is made at build (tools/bundle-themes.mjs); run from source, before a build,
 * the workspace's own packages/theme-<name> stands in for it.
 */
export function bundledTheme(name: string): string | null {
  const root = ownRoot();
  if (!root || !firstPartyTheme(name) || BUILTIN_THEMES[name]) return null;
  for (const dir of [join(root, "dist", "themes", name), join(root, "..", `theme-${name}`)])
    if (isFile(join(dir, "package.json"))) {
      try {
        return realpathSync(dir);
      } catch {
        return dir;
      }
    }
  return null;
}

/**
 * A first-party theme the menu adds to a deck that did not name it: the built-in, the deck's
 * own installed `@kadal/theme-<name>`, or the engine's copy. Null when none is there; never
 * another package that happens to be called `<name>`.
 */
export function resolveImplicitTheme(name: string, deckDir: string): ResolvedPackage | null {
  if (BUILTIN_THEMES[name]) return resolvePackage("theme", name, deckDir);
  const root = findPackageRoot(`@kadal/theme-${name}`, deckDir) ?? bundledTheme(name);
  if (!root) return null;
  try {
    return fromFolder("theme", name, root);
  } catch {
    return null;
  }
}

/** `bun add`, `pnpm add`, `yarn add` or `npm install`, by the lockfile beside or above the deck. */
export function installCommand(from: string, pkg: string): string {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "bun.lockb")))
      return `bun add ${pkg}`;
    if (existsSync(join(dir, "pnpm-lock.yaml"))) return `pnpm add ${pkg}`;
    if (existsSync(join(dir, "yarn.lock"))) return `yarn add ${pkg}`;
    if (existsSync(join(dir, "package-lock.json"))) return `npm install ${pkg}`;
    const up = dirname(dir);
    if (up === dir) return `npm install ${pkg}`;
    dir = up;
  }
}

function fromFolder(kind: PackageKind, spec: string, root: string): ResolvedPackage {
  const real = (() => {
    try {
      return realpathSync(root);
    } catch {
      return root;
    }
  })();
  const pkgFile = join(real, "package.json");
  const pkg = readJson(pkgFile);
  const meta = readMeta(kind, pkg, basename(real));
  const files = packageFiles(real, pkg);
  if (kind === "theme" && !files.css)
    throw new PackageResolveError(
      `The theme "${spec}" (${real}) has no stylesheet. A theme needs a style.css at its root, or "exports": { "./style.css": "…" } in its package.json.`,
    );
  if (!files.css && !files.module)
    throw new PackageResolveError(
      `The addon "${spec}" (${real}) has neither a style.css nor a module. Export "./style.css" or "." from its package.json.`,
    );
  return {
    kind,
    spec,
    name: meta.name,
    package: typeof pkg?.name === "string" ? pkg.name : null,
    builtin: false,
    root: real,
    css: files.css,
    module: files.module,
    meta,
    watch: pkg ? [pkgFile] : [],
  };
}

/**
 * Resolve a theme or addon spec from the deck's folder (`deckDir`, where deck.mdx is). Throws a
 * `PackageResolveError` that says what was tried and how to install it.
 */
export function resolvePackage(
  kind: PackageKind,
  spec: string,
  deckDir: string,
  { ownCss = deckDefinesTheme }: { ownCss?: (name: string, deckDir: string) => boolean } = {},
): ResolvedPackage {
  if (kind === "theme" && BUILTIN_THEMES[spec])
    return {
      kind,
      spec,
      name: spec,
      package: null,
      builtin: true,
      root: null,
      css: spec === "none" ? null : `@kadal/deck/themes/${spec}.css`,
      module: null,
      meta: BUILTIN_THEMES[spec]!,
      watch: [],
    };
  if (isPathSpec(spec)) {
    const root = resolve(deckDir, spec);
    if (!isDir(root))
      throw new PackageResolveError(
        `The ${kind} "${spec}" is a path, but ${root} is not a folder. A ${kind} folder holds a package.json${kind === "theme" ? " and a style.css" : ""}; \`kadal-deck new --${kind} <name>\` makes one.`,
      );
    return fromFolder(kind, spec, root);
  }
  const tried: string[] = [];
  for (const name of packageCandidates(kind, spec)) {
    tried.push(name);
    const root = findPackageRoot(name, deckDir);
    if (root) return fromFolder(kind, spec, root);
  }
  // A first-party theme the deck has not installed: the copy that ships inside @kadal/deck.
  const own = kind === "theme" ? firstPartyTheme(spec) : null;
  const bundled = own ? bundledTheme(own) : null;
  if (bundled) return fromFolder(kind, spec, bundled);
  // A theme the deck's own stylesheets define (`.theme-mine` in src/styles.css): plain CSS, as
  // Kadal themes always could be. Its CSS is the deck's to import.
  if (kind === "theme" && /^[\w-]+$/.test(spec) && ownCss(spec, deckDir))
    return {
      kind,
      spec,
      name: spec,
      package: null,
      builtin: false,
      root: null,
      css: null,
      module: null,
      meta: { name: spec, colorScheme: "both" },
      watch: [],
    };
  const likely = tried[0]!;
  const lines = [
    `The ${kind} "${spec}" was not found from ${deckDir}.`,
    "Tried:",
    ...(kind === "theme"
      ? [`  - a built-in theme: ${Object.keys(BUILTIN_THEMES).join(", ")}`]
      : []),
    ...tried.map((t) => `  - ${t} (not installed)`),
    `Install it: ${installCommand(deckDir, likely)}${tried.length > 1 ? `   (or ${tried.slice(1).join(" / ")}, whichever publishes it)` : ""}`,
    `Or point at a folder: ${kind === "theme" ? "theme" : "addons"}: ./my-${kind}`,
  ];
  throw new PackageResolveError(lines.join("\n"));
}

/** The deck's own .css files (not node_modules, dist or dot-folders), a few levels deep. */
function deckCssFiles(dir: string, depth = 0): string[] {
  if (depth > 3) return [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((e) =>
    e.name === "node_modules" || e.name === "dist" || e.name === "export" || e.name.startsWith(".")
      ? []
      : e.isDirectory()
        ? deckCssFiles(join(dir, e.name), depth + 1)
        : e.name.endsWith(".css")
          ? [join(dir, e.name)]
          : [],
  );
}

/** Does a stylesheet of the deck's own define `.theme-<name>`? */
export function deckDefinesTheme(name: string, deckDir: string): boolean {
  const re = new RegExp(`\\.theme-${name.replace(/[-]/g, "\\-")}(?![\\w-])`);
  return deckCssFiles(deckDir).some((f) => {
    try {
      return re.test(readFileSync(f, "utf8"));
    } catch {
      return false;
    }
  });
}

/** Every theme and addon installed where the deck can see them (for `kadal-deck info themes`). */
export function listInstalledPackages(deckDir: string): ResolvedPackage[] {
  const out: ResolvedPackage[] = [];
  const seen = new Set<string>();
  const req = createRequire(join(deckDir, "noop.js"));
  for (const nm of req.resolve.paths("x") ?? []) {
    if (!isDir(nm)) continue;
    const names: string[] = [];
    for (const entry of readdirSync(nm)) {
      if (/^kadal-(theme|addon)-/.test(entry)) names.push(entry);
      else if (entry.startsWith("@") && isDir(join(nm, entry)))
        for (const sub of readdirSync(join(nm, entry)))
          if (/^(kadal-)?(theme|addon)-/.test(sub)) names.push(`${entry}/${sub}`);
    }
    for (const name of names) {
      if (seen.has(name)) continue;
      const pkg = readJson(join(nm, name, "package.json"));
      const kadal = (pkg?.kadal ?? {}) as Record<string, unknown>;
      const keywords = Array.isArray(pkg?.keywords) ? (pkg!.keywords as unknown[]) : [];
      const kind: PackageKind | null =
        kadal.theme || keywords.includes("kadal-theme")
          ? "theme"
          : kadal.addon || keywords.includes("kadal-addon")
            ? "addon"
            : null;
      if (!kind) continue;
      seen.add(name);
      try {
        out.push(fromFolder(kind, name, join(nm, name)));
      } catch {
        // Installed but malformed: `check` says so when a deck uses it.
      }
    }
  }
  return out;
}
