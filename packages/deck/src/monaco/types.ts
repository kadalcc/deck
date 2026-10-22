/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTOMATIC TYPE ACQUISITION for `{monaco}` / `{monaco-run}` TypeScript and JavaScript
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   ```ts {monaco}
 *   import { z } from "zod"        ← hover `z.object` and see zod's own types; misuse is an error
 *   ```
 *
 * The editor's TypeScript cannot see the deck's node_modules, so an import of an npm package was
 * `any` and "cannot find module" was hidden. Now each editor's imports are read (again as it is
 * edited), and every package they name gets its declaration files, registered with TypeScript
 * under `file:///node_modules/<pkg>/…` where its module resolution looks for them:
 *
 *   local   bundled by the Vite plugin from the deck's own node_modules (vite/monaco-types.ts): the
 *           version the deck installed, offline, nothing fetched — a lazy chunk per package;
 *   cdn     fetched from jsDelivr: the version resolved (`latest`, or the range `monacoPackages`
 *           pins), the package's file list and package.json, then the declarations its entries
 *           reach for what the code imports (monaco/dts-graph.ts) — or, when it ships none,
 *           `@types/<pkg>`'s. Packages its declarations import come after, at the ranges its
 *           package.json gives.
 *
 * `monacoTypes` picks: `auto` (the default: local where the build has it, else the CDN), `local`,
 * `cdn` or `none`. The shell (decks compiled in the browser) has no node_modules, so `auto` means
 * the CDN there.
 *
 * What is fetched is fenced in. Only two origins (data.jsdelivr.com for versions and file lists,
 * cdn.jsdelivr.net for files, both over HTTPS); only declaration files and package.json, read as
 * text and handed to TypeScript, never run; at most `MAX_FILES` files and `MAX_BYTES` per package
 * and `MAX_PACKAGES` packages per page, so an import of something enormous costs a warning, not
 * the talk. `monacoTypesIgnore` skips packages by name. Versioned responses (immutable on the CDN)
 * are kept in Cache Storage, so a second visit — or the same deck offline after one online
 * rehearsal — needs no network; the "which version is latest" answer is asked fresh and falls
 * back to the cached one offline.
 *
 * Offline with nothing cached, it does nothing: the editor behaves as before, with
 * "cannot find module" still suppressed (monaco/host.ts).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { walkDeclarations } from "./dts-graph.ts";
import {
  DEFAULT_TYPES_OPTIONS,
  type MonacoTypesOptions,
  type TypeFile,
  packageOf,
  specifiersOf,
  subpathOf,
  typesPackageOf,
} from "./types-config.ts";

export {
  DEFAULT_TYPES_OPTIONS,
  type MonacoTypesOptions,
  type MonacoTypesSource,
  type TypeFile,
  importedPackages,
  monacoTypesOptions,
  packageList,
  packageOf,
  specifiersOf,
  subpathOf,
  typesPackageOf,
} from "./types-config.ts";

export const MAX_FILES = 400;
export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_PACKAGES = 60;

const DATA = "https://data.jsdelivr.com/v1/packages/npm/";
const FILES = "https://cdn.jsdelivr.net/npm/";
const CACHE = "kadal-deck-types-v1";

const isDeclaration = (path: string) => /\.d\.[mc]?ts$/.test(path);

/** A fetch that keeps immutable answers in Cache Storage, and falls back to it offline. */
function cachedFetch(base: typeof fetch) {
  let store: Promise<Cache | null> | null = null;
  const open = () =>
    (store ??= (async () => {
      try {
        return typeof caches === "undefined" ? null : await caches.open(CACHE);
      } catch {
        return null; // an opaque origin, a private window, blocked storage
      }
    })());
  return async (url: string, immutable: boolean): Promise<Response | null> => {
    const cache = await open();
    if (immutable && cache) {
      const hit = await cache.match(url).catch(() => undefined);
      if (hit) return hit;
    }
    try {
      const res = await base(url, { credentials: "omit", referrerPolicy: "no-referrer" });
      if (res.ok && cache) await cache.put(url, res.clone()).catch(() => {});
      return res.ok ? res : null;
    } catch {
      const hit = cache ? await cache.match(url).catch(() => undefined) : undefined;
      return hit ?? null;
    }
  };
}

export interface TypeAcquirerInput {
  /** Register one file with TypeScript (the host adds it as an extra lib). */
  add(file: TypeFile): void;
  /** The deck's bundled declarations by package (`auto` and `local`); null for none. */
  local?: ((pkg: string) => (() => Promise<TypeFile[]>) | null) | null;
  fetch?: typeof fetch;
  /** Told about a package that could not be had, or was cut short. */
  warn?: (message: string) => void;
}

export interface TypeAcquirer {
  /**
   * Acquire what `code` imports (and `options.packages`). Resolves, with the packages that have
   * types now, once their own files are in; the packages those import follow in the background.
   */
  acquire(code: string, options?: MonacoTypesOptions): Promise<string[]>;
  /** Resolves when nothing is in flight, the packages' own imports included. */
  idle(): Promise<void>;
}

export function createTypeAcquirer(input: TypeAcquirerInput): TypeAcquirer {
  const get = cachedFetch(input.fetch ?? ((...a) => fetch(...a)));
  const warn = input.warn ?? ((m: string) => console.warn(`[deck] monaco types: ${m}`));
  /** Every package asked for, by name: one acquisition each, whatever asks again. */
  const states = new Map<
    string,
    { ok: Promise<boolean>; subpaths: Set<string>; more?: (s: string) => Promise<void> }
  >();
  /** Work started and not awaited (a package's own imports, a later subpath): what `idle` waits on. */
  const inflight = new Set<Promise<unknown>>();
  const track = <T>(p: Promise<T>): Promise<T> => {
    inflight.add(p);
    void p.finally(() => inflight.delete(p)).catch(() => {});
    return p;
  };
  const added = new Set<string>();
  const add = (f: TypeFile) => {
    if (added.has(f.path)) return;
    added.add(f.path);
    input.add(f);
  };

  const json = async (url: string, immutable: boolean): Promise<unknown> => {
    const res = await get(url, immutable);
    return res ? res.json().catch(() => null) : null;
  };

  /** One package from the CDN: what its entries reach, or every declaration, or @types/<pkg>'s. */
  async function fromCdn(
    pkg: string,
    range: string,
    first: string,
    o: MonacoTypesOptions,
    state: { more?: (s: string) => Promise<void> },
  ): Promise<boolean> {
    const resolved = (await json(
      `${DATA}${pkg}/resolved?specifier=${encodeURIComponent(range)}`,
      false,
    )) as { version?: string | null } | null;
    const version = resolved?.version;
    if (!version) return false;
    const listing = (await json(`${DATA}${pkg}@${version}?structure=flat`, true)) as {
      files?: Array<{ name: string; size?: number }>;
    } | null;
    const files = (listing?.files ?? []).filter(
      (f) => isDeclaration(f.name) && !/\/(node_modules|__tests__|test|tests)\//.test(f.name),
    );
    if (!files.length) {
      // No declarations of its own: DefinitelyTyped's, when there are some.
      if (pkg.startsWith("@types/")) return false;
      return want(typesPackageOf(pkg), o, "latest", first);
    }
    const base = `${FILES}${pkg}@${version}`;
    const pkgText = await get(`${base}/package.json`, true).then((r) => (r ? r.text() : null));
    let pkgJson: Record<string, unknown> = {};
    const deps: Record<string, string> = {};
    if (pkgText) {
      add({ path: `/node_modules/${pkg}/package.json`, text: pkgText });
      try {
        pkgJson = JSON.parse(pkgText) as Record<string, unknown>;
        for (const f of ["peerDependencies", "optionalDependencies", "dependencies"])
          Object.assign(deps, pkgJson[f]);
      } catch {
        /* a broken package.json: the files still help */
      }
    }
    let bytes = 0;
    let cut = false;
    const read = async (path: string) => {
      if (bytes > MAX_BYTES) {
        if (!cut)
          warn(
            `${pkg}@${version}'s declarations pass ${MAX_BYTES >> 20} MB; some types are missing.`,
          );
        cut = true;
        return null;
      }
      const res = await get(`${base}${path}`, true);
      const text = res ? await res.text() : null;
      bytes += text?.length ?? 0;
      return text;
    };
    // The packages these declarations import: started, not awaited — two packages that import
    // each other would otherwise wait on each other for ever. TypeScript re-checks as they land.
    const onBare = (spec: string) => {
      const dep = packageOf(spec);
      if (dep && dep !== pkg) void track(want(dep, o, deps[dep] ?? "latest", subpathOf(spec)));
    };
    const onFile = (path: string, text: string) =>
      add({ path: `/node_modules/${pkg}${path}`, text });
    const walk = {
      listed: new Set(files.map((f) => f.name)),
      pkgJson,
      read,
      visited: new Set<string>(),
      onFile,
      onBare,
      maxFiles: MAX_FILES,
    };
    if (await walkDeclarations(walk, [first])) {
      state.more = async (sub) => {
        await walkDeclarations(walk, [sub]);
      };
      return true;
    }
    // No entry found: every declaration, shallow ones first, within the limits.
    const all = files
      .map((f) => f.name)
      .sort((a, b) => a.split("/").length - b.split("/").length)
      .slice(0, MAX_FILES);
    if (all.length < files.length)
      warn(`${pkg}@${version} has more declarations than an editor takes; some types are missing.`);
    const texts = await pool(all, 8, async (name) => [name, await read(name)] as const);
    for (const [name, text] of texts) {
      if (text === null) continue;
      onFile(name, text);
      for (const spec of specifiersOf(text)) if (!/^\.{1,2}\//.test(spec)) onBare(spec);
    }
    return true;
  }

  async function fromLocal(pkg: string): Promise<boolean | null> {
    const load = input.local?.(pkg);
    if (!load) return null;
    try {
      for (const f of await load()) add(f);
      return true;
    } catch {
      return null;
    }
  }

  function want(
    pkg: string,
    o: MonacoTypesOptions,
    range?: string,
    subpath = "",
  ): Promise<boolean> {
    if (o.ignore.includes(pkg)) return Promise.resolve(false);
    const known = states.get(pkg);
    if (known) {
      // A subpath not asked for before (`zod/mini` after `zod`): walk on from its entry.
      if (!known.subpaths.has(subpath)) {
        known.subpaths.add(subpath);
        void track(known.ok.then(() => known.more?.(subpath)));
      }
      return known.ok;
    }
    if (states.size >= MAX_PACKAGES) {
      warn(`more than ${MAX_PACKAGES} packages; ${pkg} was left out.`);
      return Promise.resolve(false);
    }
    const state: {
      ok: Promise<boolean>;
      subpaths: Set<string>;
      more?: (s: string) => Promise<void>;
    } = { ok: Promise.resolve(false), subpaths: new Set([subpath]) };
    states.set(pkg, state);
    state.ok = track(
      (async () => {
        if (o.source !== "cdn") {
          const local = await fromLocal(pkg);
          if (local !== null || o.source === "local") return !!local;
        }
        const ok = await fromCdn(
          pkg,
          o.versions[pkg] ?? range ?? "latest",
          subpath,
          o,
          state,
        ).catch(() => false);
        if (!ok && !pkg.startsWith("@types/"))
          warn(`no types for "${pkg}" (offline, or the package has none).`);
        return ok;
      })(),
    );
    return state.ok;
  }

  return {
    async acquire(code, options = DEFAULT_TYPES_OPTIONS) {
      if (options.source === "none") return [];
      const asks: Array<[string, string]> = options.packages.map((p) => [p, ""]);
      for (const spec of specifiersOf(code)) {
        const p = packageOf(spec);
        if (p) asks.push([p, subpathOf(spec)]);
      }
      const done = await Promise.all(asks.map(([p, sub]) => want(p, options, undefined, sub)));
      return [...new Set(asks.filter((_, i) => done[i]).map(([p]) => p))];
    },
    async idle() {
      while (inflight.size) await Promise.allSettled(inflight);
    },
  };
}

/** Map with at most `n` in flight. */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = Array.from<R>({ length: items.length });
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]!).catch(() => null as R);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}
