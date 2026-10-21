import {
  type AddonMeta,
  BUILTIN_THEMES,
  FALLBACK_THEME,
  type ManifestPackages,
  type PackageKind,
  type PackageModule,
  type PackageRef,
  type ThemeMeta,
  isPathSpec,
  normalizeModule,
  packageCandidates,
  requestedPackages,
} from "./contract.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PACKAGE REGISTRY: themes and addons a page bundled, for the in-browser compiler
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A deck compiled in the browser (the prebuilt shell, an editor's preview) cannot install a
 * package, so it can only use the themes and addons the page itself bundled. The page registers
 * them here — the shell does it from a generated module (`deckPackages()` in vite/packages.ts),
 * so a new `packages/theme-*` needs no edit to the shell — and `compileDeck` resolves the
 * headmatter against them with the same rules the Vite plugin uses on disk:
 *
 *   built-in → @kadal/theme-<name> → kadal-theme-<name> → the name as a package
 *
 * A theme it cannot find falls back to minimal and says so (`manifest.packages.warnings`, which
 * the deck shows the presenter, and a console line). Loading is lazy: a registered package costs
 * nothing until a deck names it, so the shell's first paint carries only the built-in themes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface RegisteredPackage {
  kind: PackageKind;
  /** The theme's class name / the addon's name (its metadata's `name`). */
  name: string;
  /** Its npm name (`@kadal/theme-seriph`), which a deck may also write. */
  package: string | null;
  meta: ThemeMeta | AddonMeta;
  /** Imports the stylesheet and the module; resolves to the module (or null without one). */
  load: () => Promise<unknown>;
}

export interface PackageRegistry {
  register(entry: RegisteredPackage): void;
  list(kind?: PackageKind): RegisteredPackage[];
  find(kind: PackageKind, spec: string): RegisteredPackage | null;
}

export function createPackageRegistry(): PackageRegistry {
  const entries = new Map<string, RegisteredPackage>();
  return {
    register(entry) {
      entries.set(`${entry.kind}:${entry.name}`, entry);
    },
    list(kind) {
      return [...entries.values()].filter((e) => !kind || e.kind === kind);
    },
    find(kind, spec) {
      const all = [...entries.values()].filter((e) => e.kind === kind);
      const wanted = new Set([spec, ...packageCandidates(kind, spec)]);
      // The name first (a deck writes `theme: seriph`), then the package names it may stand for.
      return (
        all.find((e) => e.name === spec) ??
        packageCandidates(kind, spec)
          .map((p) => all.find((e) => e.package === p))
          .find(Boolean) ??
        all.find((e) => e.package !== null && wanted.has(e.package)) ??
        null
      );
    },
  };
}

/** The page's registry: what `registerTheme` / `registerAddon` fill and `compileDeck` reads. */
export const packageRegistry: PackageRegistry = createPackageRegistry();

export function registerTheme(entry: Omit<RegisteredPackage, "kind">): void {
  packageRegistry.register({ ...entry, kind: "theme" });
}

export function registerAddon(entry: Omit<RegisteredPackage, "kind">): void {
  packageRegistry.register({ ...entry, kind: "addon" });
}

/** One load per entry for the life of the page (a rejection is retried on the next ask). */
const loads = new WeakMap<RegisteredPackage, Promise<PackageModule | null>>();
function loadEntry(entry: RegisteredPackage): Promise<PackageModule | null> {
  const cached = loads.get(entry);
  if (cached) return cached;
  const pending = Promise.resolve()
    .then(() => entry.load())
    .then(normalizeModule)
    .catch((error: unknown) => {
      loads.delete(entry);
      throw error;
    });
  loads.set(entry, pending);
  return pending;
}

function builtinRef(name: string, spec: string): PackageRef {
  return {
    kind: "theme",
    name,
    spec,
    package: null,
    builtin: true,
    meta: BUILTIN_THEMES[name]!,
    module: null,
    load: null,
  };
}

function entryRef(
  entry: RegisteredPackage,
  spec: string,
  module: PackageModule | null,
): PackageRef {
  return {
    kind: entry.kind,
    name: entry.name,
    spec,
    package: entry.package,
    builtin: false,
    meta: entry.meta,
    module,
    load: () => loadEntry(entry),
  };
}

export interface RuntimePackages {
  packages: ManifestPackages;
  /** Problems, worded for a person: each is also in `packages.warnings`. */
  warnings: string[];
}

/**
 * The headmatter's theme, themes and addons against a registry. The active theme and every addon
 * are loaded before this resolves (their layouts are needed for the first paint); the other
 * themes the menu offers load when chosen.
 */
export async function resolveRuntimePackages(
  headmatter: Record<string, unknown>,
  registry: PackageRegistry = packageRegistry,
  defaultThemes: readonly string[] = ["minimal", "rla", "stack"],
): Promise<RuntimePackages> {
  const want = requestedPackages(headmatter, defaultThemes);
  const warnings: string[] = [];

  const themeRef = async (spec: string, active: boolean): Promise<PackageRef | null> => {
    if (BUILTIN_THEMES[spec]) return builtinRef(spec, spec);
    const entry = isPathSpec(spec) ? null : registry.find("theme", spec);
    if (!entry) {
      warnings.push(
        isPathSpec(spec)
          ? `The theme "${spec}" is a folder, which only a deck built with the CLI can use (kadal-deck build); this player has its bundled themes only${active ? `, so it shows "${FALLBACK_THEME}"` : ""}.`
          : `The theme "${spec}" is not one this player has${active ? `, so it shows "${FALLBACK_THEME}"` : ""}. Bundled themes: ${[...Object.keys(BUILTIN_THEMES).filter((n) => n !== "none"), ...registry.list("theme").map((e) => e.name)].join(", ")}.`,
      );
      return null;
    }
    if (!active) return entryRef(entry, spec, null);
    try {
      return entryRef(entry, spec, await loadEntry(entry));
    } catch (err) {
      warnings.push(
        `The theme "${spec}" failed to load (${err instanceof Error ? err.message : String(err)})${active ? `, so the deck shows "${FALLBACK_THEME}"` : ""}.`,
      );
      return null;
    }
  };

  const theme = (await themeRef(want.theme, true)) ?? builtinRef(FALLBACK_THEME, want.theme);
  const themes: PackageRef[] = [theme];
  for (const spec of want.themes.slice(1)) {
    const ref = await themeRef(spec, false);
    if (ref && !themes.some((t) => t.name === ref.name)) themes.push(ref);
  }

  const addons: PackageRef[] = [];
  for (const spec of want.addons) {
    const entry = isPathSpec(spec) ? null : registry.find("addon", spec);
    if (!entry) {
      warnings.push(
        `The addon "${spec}" is not one this player has; the deck runs without it.${isPathSpec(spec) ? " A folder addon needs the CLI build (kadal-deck build)." : ""}`,
      );
      continue;
    }
    try {
      addons.push(entryRef(entry, spec, await loadEntry(entry)));
    } catch (err) {
      warnings.push(
        `The addon "${spec}" failed to load (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  }

  return { packages: { theme, themes, addons, layers: {}, warnings }, warnings };
}
