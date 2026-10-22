/**
 * The settings half of type acquisition and of `{monaco-run}`'s imports (monaco/types.ts and
 * monaco/run-js.ts have the rest): what the deck asked for, read from its config, and the rules
 * for what a module specifier names. Small and eager — the block reads it to hand the editor and
 * the runner their options — where the acquirer itself is part of the lazy Monaco chunk.
 */

export type MonacoTypesSource = "auto" | "local" | "cdn" | "none";

/** One declaration file, at the path TypeScript should see it (`/node_modules/zod/index.d.ts`). */
export interface TypeFile {
  path: string;
  text: string;
}

export interface MonacoTypesOptions {
  source: MonacoTypesSource;
  /** Version ranges by package (`monacoPackages`); a package not named here is `latest`. */
  versions: Record<string, string>;
  /** Packages to acquire whatever the code imports (`monacoPackages`' names). */
  packages: string[];
  /** Packages never to acquire (`monacoTypesIgnore`). */
  ignore: string[];
}

export const DEFAULT_TYPES_OPTIONS: MonacoTypesOptions = {
  source: "auto",
  versions: {},
  packages: [],
  ignore: [],
};

/** Node's own modules, by name: their types are @types/node's. */
const NODE_BUILTINS = new Set(
  "assert async_hooks buffer child_process cluster console constants crypto dgram diagnostics_channel dns domain events fs http http2 https inspector module net os path perf_hooks process punycode querystring readline repl stream string_decoder sys timers tls trace_events tty url util v8 vm wasi worker_threads zlib test sqlite".split(
    " ",
  ),
);

/** The package a bare specifier names (`lodash/fp` → `lodash`, `@a/b/c` → `@a/b`), else null. */
export function packageOf(specifier: string): string | null {
  const s = specifier.trim();
  if (!s || /^(\.{0,2}\/|[a-z][\w+.-]*:\/\/|data:|blob:|#)/i.test(s)) return null;
  if (s.startsWith("node:")) return "@types/node";
  const parts = s.split("/");
  const name = s.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
  if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(name)) return null;
  if (!name.startsWith("@") && NODE_BUILTINS.has(name)) return "@types/node";
  return name;
}

/** `@types/` package for a package without its own declarations (`@a/b` → `@types/a__b`). */
export function typesPackageOf(pkg: string): string {
  return `@types/${pkg.startsWith("@") ? pkg.slice(1).replace("/", "__") : pkg}`;
}

/**
 * The module specifiers a source or declaration file names: `import … from`, `export … from`,
 * side-effect imports, `import("…")`, `import x = require("…")`, `/// <reference types="…" />`.
 * Comments are dropped first so a commented-out import fetches nothing.
 */
export function specifiersOf(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/\/\/\/\s*<reference\s+types\s*=\s*["']([^"']+)["']/g))
    out.add(m[1]!);
  const text = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
  for (const m of text.matchAll(
    /(?:^|[\s;{}])(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?["']([^"'\n]+)["']/g,
  ))
    out.add(m[1]!);
  for (const m of text.matchAll(/\b(?:import|require)\s*\(\s*["']([^"'\n]+)["']\s*\)/g))
    out.add(m[1]!);
  return [...out];
}

/** The packages code imports, in order of first mention. */
export function importedPackages(code: string): string[] {
  const out: string[] = [];
  for (const s of specifiersOf(code)) {
    const p = packageOf(s);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/** What a specifier asks for inside its package: `zod/mini` → `mini`, `zod` → "". */
export function subpathOf(specifier: string): string {
  const name = packageOf(specifier);
  if (!name || name === "@types/node") return "";
  return specifier.slice(name.length).replace(/^\//, "");
}

/**
 * `monacoPackages` as names and ranges: a list (`[zod, "lodash-es@4"]`) or a map
 * (`{ zod: "^3.23" }`). Slidev's `monacoTypesAdditionalPackages` reads the same way.
 */
export function packageList(value: unknown): { names: string[]; versions: Record<string, string> } {
  const names: string[] = [];
  const versions: Record<string, string> = {};
  const add = (name: string, range?: string) => {
    const n = packageOf(name);
    if (!n) return;
    if (!names.includes(n)) names.push(n);
    if (range && range.trim()) versions[n] = range.trim();
  };
  if (Array.isArray(value)) {
    for (const v of value) {
      if (typeof v !== "string") continue;
      const at = v.lastIndexOf("@");
      if (at > 0) add(v.slice(0, at), v.slice(at + 1));
      else add(v);
    }
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      add(k, typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);
  }
  return { names, versions };
}

/** The deck's settings (DeckConfig, or Slidev's spellings of them) as type-acquisition options. */
export function monacoTypesOptions(config: Record<string, unknown>): MonacoTypesOptions {
  const raw = config.monacoTypes ?? config.monacoTypesSource;
  const source: MonacoTypesSource =
    raw === false || raw === "none"
      ? "none"
      : raw === "cdn" || raw === "ata"
        ? "cdn"
        : raw === "local"
          ? "local"
          : "auto";
  const own = packageList(config.monacoPackages);
  const slidev = packageList(config.monacoTypesAdditionalPackages);
  const ignore = [config.monacoTypesIgnore, config.monacoTypesIgnorePackages].flatMap((v) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [],
  );
  return {
    source,
    versions: { ...slidev.versions, ...own.versions },
    packages: [...new Set([...own.names, ...slidev.names])],
    ignore,
  };
}

/**
 * `monacoRunImports` as a function from a bare specifier to the URL a `{monaco-run}` block imports
 * it from, or null when bare imports stay an error. A base (`https://esm.sh`) is esm.sh's
 * shape — `<base>/<name>@<version><path>`; a template fills `{name}`, `{version}` (`latest` when
 * none is pinned) and `{path}`. Node's own modules have no browser URL: null.
 */
export function runImportResolver(
  setting: unknown,
  versions: Record<string, string>,
): ((specifier: string) => string | null) | null {
  if (setting === false || setting === "false" || setting === null) return null;
  const base = typeof setting === "string" && setting.trim() ? setting.trim() : "https://esm.sh";
  if (!base.startsWith("https://") && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(base))
    return null;
  return (specifier) => {
    const name = packageOf(specifier);
    if (!name || name === "@types/node") return null;
    const path = specifier.slice(name.length);
    const version = versions[name];
    if (base.includes("{name}"))
      return base
        .replace("{name}", name)
        .replace("{version}", version ?? "latest")
        .replace("{path}", path);
    return `${base.replace(/\/+$/, "")}/${name}${version ? `@${version}` : ""}${path}`;
  };
}
