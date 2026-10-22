import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { Plugin } from "vite";

import { DEFAULT_CONFIG } from "../core/model.ts";
import { LAYER_NAMES, type LayerName, readMeta, requestedPackages } from "../theming/contract.ts";
import { packageFiles, type ResolvedPackage, resolvePackage } from "../theming/resolve.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THEMES, ADDONS AND LAYERS IN THE BUILD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two jobs, both Node-side:
 *
 *   `deckPackageSet` + `packagesCode`   for the deck plugin (vite/index.ts): the headmatter's
 *       theme, themes and addons resolved from the deck's folder (theming/resolve.ts), and the
 *       deck's own layer files (`global-top.tsx`… beside deck.mdx, or in src/) and routes file
 *       (`routes.tsx`, react/routes.tsx), turned into the imports and the `packages` export of
 *       `virtual:deck`. Every stylesheet is imported
 *       eagerly (the theme menu's swatches need them); the active theme's module and every
 *       addon's are eager too, so the first paint has their layouts; the other themes' modules
 *       are lazy chunks, loaded when the menu picks one.
 *
 *   `deckPackages()`   a plugin of its own, for a page that compiles decks in the browser (the
 *       prebuilt shell): it scans folders for theme and addon packages and generates
 *       `virtual:kadal-packages`, which registers each one with the runtime's registry
 *       (theming/registry.ts) behind a lazy import — so adding `packages/theme-x` to the
 *       repository puts it in the next shell build with no edit anywhere else.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Layer files a deck may keep beside deck.mdx (or in src/), by layer. */
const LAYER_EXTS = [".tsx", ".jsx", ".ts", ".js"];

export function layerFiles(deckDir: string): Partial<Record<LayerName, string>> {
  const out: Partial<Record<LayerName, string>> = {};
  for (const name of LAYER_NAMES)
    for (const dir of [deckDir, join(deckDir, "src")])
      for (const ext of LAYER_EXTS) {
        const file = join(dir, `${name}${ext}`);
        if (!out[name] && existsSync(file)) out[name] = file;
      }
  return out;
}

/** Is this path one a layer file could have (so its creation or removal rebuilds the manifest)? */
export function isLayerCandidate(file: string, deckDir: string): boolean {
  const dir = dirname(file);
  const name = file.slice(dir.length + 1);
  if (dir === join(deckDir, "setup") || dir === deckDir || dir === join(deckDir, "src"))
    if (LAYER_EXTS.some((e) => name === `routes${e}`)) return true;
  if (dir !== deckDir && dir !== join(deckDir, "src")) return false;
  return LAYER_NAMES.some((n) =>
    LAYER_EXTS.some((e) => file.endsWith(`/${n}${e}`) || file.endsWith(`\\${n}${e}`)),
  );
}

/**
 * The deck's routes file (react/routes.tsx): `routes.tsx` beside deck.mdx, in src/, or where
 * Slidev keeps it, `setup/routes.ts`. Null without one.
 */
export function routesFile(deckDir: string): string | null {
  for (const dir of [deckDir, join(deckDir, "src"), join(deckDir, "setup")])
    for (const ext of LAYER_EXTS) {
      const file = join(dir, `routes${ext}`);
      if (existsSync(file)) return file;
    }
  return null;
}

/**
 * The plain paths a routes file spells out (`path: "handout"`), for the static host's copies of
 * index.html; a path with a `:param` or a `*` is left to 404.html.
 */
export function routePaths(file: string | null): string[] {
  if (!file || !existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  const out = new Set<string>();
  for (const m of text.matchAll(/\bpath\s*:\s*(["'`])([^"'`]+)\1/g)) {
    const p = m[2]!.replace(/^\/+|\/+$/g, "");
    if (p && /^[\w.~-]+(\/[\w.~-]+)*$/.test(p) && !p.split("/").includes("..")) out.add(p);
  }
  return [...out];
}

export interface DeckPackageSet {
  theme: ResolvedPackage;
  /** Every theme the menu offers, the active one first. */
  themes: ResolvedPackage[];
  addons: ResolvedPackage[];
  layers: Partial<Record<LayerName, string>>;
  /** The deck's routes file, or null. */
  routes?: string | null;
  /** package.json files to watch. */
  watch: string[];
}

/** Resolve everything the headmatter names; throws `PackageResolveError` with the details. */
export function deckPackageSet(
  headmatter: Record<string, unknown>,
  deckDir: string,
): DeckPackageSet {
  const want = requestedPackages(headmatter, DEFAULT_CONFIG.themes);
  const theme = resolvePackage("theme", want.theme, deckDir);
  const themes = [theme];
  for (const spec of want.themes.slice(1)) {
    const t = resolvePackage("theme", spec, deckDir);
    if (!themes.some((x) => x.name === t.name)) themes.push(t);
  }
  const addons = want.addons.map((spec) => resolvePackage("addon", spec, deckDir));
  return {
    theme,
    themes,
    addons,
    layers: layerFiles(deckDir),
    routes: routesFile(deckDir),
    watch: [...themes, ...addons].flatMap((p) => p.watch),
  };
}

/** Folders outside the deck that the dev server must be allowed to serve (a `../theme`). */
export function packageRoots(set: DeckPackageSet): string[] {
  return [...set.themes, ...set.addons].flatMap((p) => (p.root ? [p.root] : []));
}

/** A path as an import specifier: absolute paths go through as they are (Vite reads them). */
const spec = (file: string) => JSON.stringify(file.replace(/\\/g, "/"));

/** The imports and the `packages` export of `virtual:deck`. */
export function packagesCode(set: DeckPackageSet): { imports: string; value: string } {
  const imports: string[] = [];
  const cssSeen = new Set<string>();
  const css = (file: string | null) => {
    if (!file || cssSeen.has(file)) return;
    cssSeen.add(file);
    imports.push(`import ${spec(file)};`);
  };
  for (const t of set.themes) css(t.css);
  for (const a of set.addons) css(a.css);

  const eager = new Map<string, string>();
  const eagerId = (file: string) => {
    let id = eager.get(file);
    if (!id) {
      id = `__kadal_pkg_${eager.size}`;
      eager.set(file, id);
      imports.push(`import * as ${id} from ${spec(file)};`);
    }
    return id;
  };

  const ref = (p: ResolvedPackage, mode: "eager" | "lazy") => {
    const module = !p.module ? "null" : mode === "eager" ? eagerId(p.module) : "null";
    const load = !p.module
      ? "null"
      : mode === "eager"
        ? `() => Promise.resolve(${eagerId(p.module)})`
        : `() => import(${spec(p.module)})`;
    return `{ kind: ${JSON.stringify(p.kind)}, name: ${JSON.stringify(p.name)}, spec: ${JSON.stringify(p.spec)}, package: ${JSON.stringify(p.package)}, builtin: ${p.builtin}, meta: ${JSON.stringify(p.meta)}, module: ${module}, load: ${load} }`;
  };

  const theme = ref(set.theme, "eager");
  const themes = set.themes.map((t, i) => (i === 0 ? "__kadal_theme" : ref(t, "lazy")));
  const addons = set.addons.map((a) => ref(a, "eager"));
  const layers = Object.entries(set.layers).map(([name, file]) => {
    const id = eagerId(file!);
    return `${JSON.stringify(name)}: ${id}.default ?? ${id}[${JSON.stringify(camel(name))}]`;
  });
  const routes = set.routes ? eagerId(set.routes) : null;
  return {
    imports: imports.join("\n"),
    value: `(() => {
  const __kadal_theme = ${theme};
  return {
    theme: __kadal_theme,
    themes: [${themes.join(", ")}],
    addons: [${addons.join(", ")}],
    layers: { ${layers.join(", ")} },
    routes: ${routes ? `${routes}.default ?? ${routes}.routes ?? null` : "null"},
    warnings: [],
  };
})()`,
  };
}

/** `global-top` → `GlobalTop`, the named export a layer file may use instead of a default. */
function camel(name: string): string {
  return name.replace(/(^|-)(\w)/g, (_m, _d, c: string) => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// deckPackages(): the registry module for a page that compiles decks in the browser.

export interface DeckPackagesOptions {
  /**
   * Folders whose child folders are packages (`packages/`): every child with a package.json
   * whose `kadal.theme` or `kadal.addon` is set (or whose keywords say kadal-theme /
   * kadal-addon) is registered.
   */
  dirs?: string[];
  /** Package folders to register one by one. */
  packages?: string[];
  /** Only children whose folder name matches (default: any). */
  match?: RegExp;
}

const REGISTRY = "virtual:kadal-packages";

type Found = { kind: "theme" | "addon"; root: string; pkg: Record<string, unknown> };

/** The theme and addon packages the options point at. */
export function scanPackages(options: DeckPackagesOptions): Found[] {
  const roots = [
    ...(options.packages ?? []),
    ...(options.dirs ?? []).flatMap((d) =>
      existsSync(d)
        ? readdirSync(d)
            .filter((n) => !options.match || options.match.test(n))
            .map((n) => join(d, n))
            .filter((p) => statSync(p).isDirectory())
        : [],
    ),
  ];
  const out: Found[] = [];
  for (const root of roots.map((r) => resolve(r)).sort()) {
    const file = join(root, "package.json");
    if (!existsSync(file)) continue;
    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    } catch {
      continue;
    }
    const kadal = (pkg.kadal ?? {}) as Record<string, unknown>;
    const keywords = Array.isArray(pkg.keywords) ? pkg.keywords : [];
    const kind =
      kadal.theme || keywords.includes("kadal-theme")
        ? "theme"
        : kadal.addon || keywords.includes("kadal-addon")
          ? "addon"
          : null;
    if (kind) out.push({ kind, root, pkg });
  }
  return out;
}

/** The source of `virtual:kadal-packages` for these packages. */
export function registryCode(found: Found[]): string {
  const lines = [`import { registerAddon, registerTheme } from "@kadal/deck/runtime";`];
  for (const f of found) {
    const meta = readMeta(f.kind, f.pkg, f.root.split(/[\\/]/).pop() ?? f.kind);
    const files = packageFiles(f.root, f.pkg);
    if (f.kind === "theme" && !files.css) continue;
    const parts = [
      files.css ? `import(${spec(files.css)})` : null,
      files.module ? `import(${spec(files.module)})` : null,
    ].filter(Boolean);
    const load = files.module
      ? `() => Promise.all([${parts.join(", ")}]).then((m) => m[m.length - 1])`
      : `() => ${parts[0] ?? "Promise.resolve()"}.then(() => null)`;
    lines.push(
      `${f.kind === "theme" ? "registerTheme" : "registerAddon"}({ name: ${JSON.stringify(meta.name)}, package: ${JSON.stringify(typeof f.pkg.name === "string" ? f.pkg.name : null)}, meta: ${JSON.stringify(meta)}, load: ${load} });`,
    );
  }
  lines.push(
    `export const registered = ${JSON.stringify(found.map((f) => relative(process.cwd(), f.root)))};`,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * The registry plugin: `import "virtual:kadal-packages"` registers every theme and addon
 * package found under `dirs` (and in `packages`) with the in-browser compiler, lazily.
 */
export function deckPackages(options: DeckPackagesOptions = {}): Plugin {
  const resolved = `\0${REGISTRY}`;
  return {
    name: "kadal:packages",
    // A package's module imports React and the engine from its own folder, where neither need be
    // installed (a workspace package, a fixture): resolve them once, from the page's root.
    config: () => ({ resolve: { dedupe: ["react", "react-dom", "@kadal/deck"] } }),
    resolveId(id) {
      return id === REGISTRY ? resolved : null;
    },
    load(id) {
      if (id !== resolved) return null;
      const found = scanPackages(options);
      for (const f of found) this.addWatchFile(join(f.root, "package.json"));
      return registryCode(found);
    },
  };
}
