import type { ComponentType } from "react";

import type { Frontmatter } from "../compiler/split.ts";
import type { SlideMeta } from "../core/model.ts";
import type { DeckRuntime, ViewMode } from "../react/context.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THEME AND ADDON PACKAGE CONTRACT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A theme is a look: CSS scoped under `.theme-<name>` that sets the `--deck-*` tokens and styles
 * the `.deck-layout-*` classes, plus — optionally — layouts, components and layers of its own.
 * An addon is a feature: components, layouts, layers, CSS and a `setup(api)`, shared by any
 * theme. Both are npm packages (or plain folders) of the same shape:
 *
 *   package.json
 *     "keywords": ["kadal-theme"]                        (or "kadal-addon")
 *     "kadal": { "theme": { name, colorScheme, defaults?, config?, themeConfig?, shiki?,
 *                           layouts?, components? } }      (or "addon": { name, … })
 *     "exports": { "./style.css": "./style.css",          the stylesheet (a theme must have one)
 *                  ".": "./index.tsx" }                    optional: the module below
 *
 *   index.tsx — export default { layouts?, components?, layers?, setup? }
 *
 * A deck names them in its headmatter: `theme: seriph`, `themes: [seriph, minimal]`,
 * `addons: [qr]`. A bare name is a built-in theme, then `@kadal/theme-<name>`, then
 * `kadal-theme-<name>`, then the name as a package; `./folder` is a folder beside deck.mdx.
 * The Vite plugin resolves them from the deck's folder (theming/resolve.ts) and imports their
 * CSS and modules into `virtual:deck`; the in-browser compiler resolves them against the
 * packages a host bundled (theming/registry.ts). Either way the manifest carries the result as
 * `manifest.packages`, and `<Deck>` merges it with the deck's own (theming/merge.ts): the deck
 * wins, then the addons (a later one over an earlier one), then the theme.
 *
 * This file is pure types and data: no React, no Node, safe everywhere.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The four layers a deck, a theme or an addon can put on every slide (Slidev's names). */
export const LAYER_NAMES = ["global-bottom", "slide-bottom", "slide-top", "global-top"] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

/** What a layer knows: the slide it is drawn over, where the deck is, and which view it is in. */
export interface LayerProps {
  /** Which layer this is. */
  layer: LayerName;
  /** The slide: the current one for a global layer on the stage, its own for a slide layer. */
  slide: SlideMeta | null;
  /** The slide's flat position among visible slides, 0-based. */
  index: number;
  /** The same, 1-based, as a footer prints it. */
  page: number;
  /** How many visible slides the deck has. */
  total: number;
  h: number;
  v: number;
  /** The click step being shown, and how many the slide has. */
  click: number;
  clicks: number;
  /** The slide's layout name (`cover`, `default`…), so a footer can hide on covers. */
  layout: string;
  frontmatter: Frontmatter;
  /** The page the deck is showing: play, presenter, print… */
  view: ViewMode;
  /**
   * True on a still copy of the slide — a printed page (`?print-pdf`, `kadal-deck export`), an
   * overview tile, a thumbnail, the presenter's next-slide box — false on the live stage.
   */
  print: boolean;
}

export type LayerComponent = ComponentType<LayerProps>;

/**
 * Layers as a deck passes them (`<Deck layers>`), or as a package's module exports them. In the
 * deck's own map, `false` hides that layer from the theme and the addons as well.
 */
export type DeckLayers = Partial<Record<LayerName, LayerComponent | false | null | undefined>>;

/** Every layer's components after the merge, lowest first: the theme's, the addons', the deck's. */
export type ResolvedLayers = Record<LayerName, LayerComponent[]>;

/** The `kadal.theme` field of a theme's package.json. */
export interface ThemeMeta {
  /** The CSS class suffix (`.theme-<name>`) and the name the theme menu shows. */
  name: string;
  /** A display name, when the menu should say more than the name ("Seriph"). */
  title?: string;
  description?: string;
  /** The schemes the theme is designed for; a single one becomes the deck's default scheme. */
  colorScheme: "both" | "light" | "dark";
  /** Slide frontmatter defaults, under the deck's own `defaults` and every slide's frontmatter. */
  defaults?: Frontmatter;
  /** Headmatter defaults (transition, fonts, aspect ratio…), under the deck's headmatter. */
  config?: Record<string, unknown>;
  /** The default `themeConfig`: each key becomes `--theme-<kebab-key>` on the deck root. */
  themeConfig?: Record<string, unknown>;
  /** Shiki themes for code blocks, when the deck's Vite config does not choose its own. */
  shiki?: { light?: string; dark?: string };
  /** Names of the layouts the module adds (for the catalog, `kadal-deck check` and agents). */
  layouts?: string[];
  /** Names of the components the module adds (same). */
  components?: string[];
}

/** The `kadal.addon` field of an addon's package.json. */
export interface AddonMeta {
  name: string;
  title?: string;
  description?: string;
  /** Slide frontmatter defaults, under the theme's. Rarely right for an addon; there if needed. */
  defaults?: Frontmatter;
  layouts?: string[];
  components?: string[];
}

export type PackageKind = "theme" | "addon";

/**
 * What `setup(api)` receives: the running deck and the engine's registration points. Other parts
 * of the engine add theirs with `extendSetupApi` (a code runner registry, say), so a package can
 * reach a new extension point without this contract changing.
 */
export interface SetupApi {
  /** The deck as `useDeck()` returns it, when setup runs. */
  deck: DeckRuntime;
  /** Commands: what keys, the toolbar, the phone remote and agents call (core/commands.ts). */
  commands: DeckRuntime["commands"];
  /** Tabs in the presenter's sidebar (core/panels.ts). */
  panels: DeckRuntime["panels"];
  /** Island renderers (renderers/index.ts). */
  registerRenderer: (typeof import("../renderers/index.ts"))["registerRenderer"];
  registerLazyRenderer: (typeof import("../renderers/index.ts"))["registerLazyRenderer"];
  /** Named slide backgrounds (react/Backgrounds.tsx). */
  registerBackground: (typeof import("../react/Backgrounds.tsx"))["registerBackground"];
  /**
   * A keyboard shortcut (`"shift+k"`, `"g"`, `"mod+e"`); removed with the package. Not while
   * typing in a field, never in a projector window. Returns its own remover too.
   */
  shortcut: (combo: string, run: (e: KeyboardEvent) => void) => () => void;
  /** Whatever else the engine registered through `extendSetupApi`. */
  [extension: string]: unknown;
}

/** A setup's cleanup, when it registered something that should go with the deck. */
export type SetupResult = void | (() => void) | Promise<void | (() => void)>;

/** The module a theme or addon exports (its default export, or the same names exported one by one). */
export interface PackageModule {
  layouts?: Record<string, ComponentType<any>>;
  components?: Record<string, ComponentType<any>>;
  layers?: DeckLayers;
  setup?: (api: SetupApi) => SetupResult;
}

/** A resolved theme or addon, as the manifest carries it. */
export interface PackageRef {
  kind: PackageKind;
  /** The class / menu name (`seriph`), from the package's metadata. */
  name: string;
  /** How the deck named it (`seriph`, `@kadal/theme-seriph`, `./theme`). */
  spec: string;
  /** The npm package name; null for a built-in theme or a folder without a package.json. */
  package: string | null;
  /** An engine theme: its CSS ships in @kadal/deck and it has no module. */
  builtin: boolean;
  meta: ThemeMeta | AddonMeta;
  /** The module, when it is loaded (always, for the active theme and the addons). */
  module: PackageModule | null;
  /** Loads the module (and its CSS, where that is lazy too); null when there is nothing to load. */
  load: (() => Promise<PackageModule | null>) | null;
}

/** `manifest.packages`: what the deck's headmatter asked for, resolved. */
export interface ManifestPackages {
  /** The deck's theme; null in a manifest that predates packages (the headmatter decides then). */
  theme: PackageRef | null;
  /** Every theme the theme menu offers, the active one included. */
  themes: PackageRef[];
  addons: PackageRef[];
  /** The deck's own layer files (`global-top.tsx` beside deck.mdx), found by the Vite plugin. */
  layers: DeckLayers;
  /** Problems worth showing the person presenting: a theme this player does not have, say. */
  warnings: string[];
}

/** The engine's own themes. Their CSS is `@kadal/deck/themes/<name>.css`; `none` has none. */
export const BUILTIN_THEMES: Record<string, ThemeMeta> = {
  minimal: { name: "minimal", title: "Minimal", colorScheme: "both" },
  rla: { name: "rla", title: "RLA", colorScheme: "both" },
  stack: { name: "stack", title: "Stack", colorScheme: "both" },
  none: { name: "none", title: "None", colorScheme: "both" },
};

/** Where a theme falls back to when the one named cannot be had. */
export const FALLBACK_THEME = "minimal";

/** Is this spec a path (a folder beside the deck) rather than a name? Slidev's rule. */
export function isPathSpec(spec: string): boolean {
  return (
    spec === "." ||
    spec.startsWith("./") ||
    spec.startsWith("../") ||
    spec.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(spec) ||
    (!spec.startsWith("@") && spec.includes("/"))
  );
}

/** The package names a bare spec may mean, in the order they are tried. */
export function packageCandidates(kind: PackageKind, spec: string): string[] {
  if (isPathSpec(spec)) return [];
  if (spec.startsWith("@") || spec.startsWith(`kadal-${kind}-`)) return [spec];
  return [`@kadal/${kind}-${spec}`, `kadal-${kind}-${spec}`, spec];
}

/** The short name a package's own name implies (`@kadal/theme-seriph` → `seriph`). */
export function shortName(kind: PackageKind, pkg: string): string {
  const base = pkg.replace(/^@[^/]+\//, "");
  return base.replace(new RegExp(`^(kadal-)?${kind}-`), "") || base;
}

/** The CSS class a theme name gives the deck root: `.theme-<name>`, safe for a class. */
export function themeClassName(name: string): string {
  return name.replace(/[^\w-]/g, "-");
}

/** A theme's or addon's metadata from its package.json, with the gaps filled. */
export function readMeta(
  kind: PackageKind,
  pkg: { name?: unknown; keywords?: unknown; kadal?: unknown } | null,
  fallbackName: string,
): ThemeMeta | AddonMeta {
  const raw = ((pkg?.kadal as Record<string, unknown> | undefined)?.[kind] ?? {}) as Record<
    string,
    unknown
  >;
  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim()
      : typeof pkg?.name === "string"
        ? shortName(kind, pkg.name)
        : fallbackName;
  const obj = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  const names = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const common = {
    name,
    ...(str(raw.title) ? { title: str(raw.title) } : {}),
    ...(str(raw.description) ? { description: str(raw.description) } : {}),
    ...(obj(raw.defaults) ? { defaults: obj(raw.defaults) as Frontmatter } : {}),
    ...(names(raw.layouts) ? { layouts: names(raw.layouts) } : {}),
    ...(names(raw.components) ? { components: names(raw.components) } : {}),
  };
  if (kind === "addon") return common;
  const scheme = raw.colorScheme ?? raw.colorSchema;
  const shiki = obj(raw.shiki);
  return {
    ...common,
    colorScheme: scheme === "light" || scheme === "dark" ? scheme : "both",
    ...(obj(raw.config) ? { config: obj(raw.config) } : {}),
    ...(obj(raw.themeConfig) ? { themeConfig: obj(raw.themeConfig) } : {}),
    ...(shiki
      ? {
          shiki: {
            ...(str(shiki.light) ? { light: str(shiki.light) } : {}),
            ...(str(shiki.dark) ? { dark: str(shiki.dark) } : {}),
          },
        }
      : {}),
  } satisfies ThemeMeta;
}

/**
 * A package's module in the one shape the runtime reads: its default export when that is the
 * object, else its named exports (`export const layouts = …`), else nothing.
 */
export function normalizeModule(mod: unknown): PackageModule | null {
  if (!mod || typeof mod !== "object") return null;
  const m = mod as Record<string, unknown>;
  const d = m.default;
  const src = (
    d &&
    typeof d === "object" &&
    ("layouts" in d || "components" in d || "layers" in d || "setup" in d)
      ? d
      : m
  ) as Record<string, unknown>;
  const rec = (v: unknown) =>
    v && typeof v === "object" ? (v as Record<string, ComponentType<any>>) : undefined;
  const out: PackageModule = {};
  if (rec(src.layouts)) out.layouts = rec(src.layouts);
  if (rec(src.components)) out.components = rec(src.components);
  if (rec(src.layers)) out.layers = src.layers as DeckLayers;
  if (typeof src.setup === "function") out.setup = src.setup as PackageModule["setup"];
  return out;
}

/** The headmatter's `themes:` and `addons:` lists, as strings. */
export function specList(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && !!v.trim()).map((v) => v.trim());
}

/** What the headmatter asks for: the theme, every theme for the menu, the addons. */
export function requestedPackages(
  headmatter: Record<string, unknown>,
  defaultThemes: readonly string[],
): { theme: string; themes: string[]; addons: string[] } {
  const theme =
    typeof headmatter.theme === "string" && headmatter.theme.trim()
      ? headmatter.theme.trim()
      : FALLBACK_THEME;
  const listed = headmatter.themes === undefined ? [...defaultThemes] : specList(headmatter.themes);
  const themes = [theme, ...listed.filter((t) => t !== theme)];
  return { theme, themes, addons: specList(headmatter.addons) };
}
