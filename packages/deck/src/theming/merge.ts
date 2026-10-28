import type { ComponentType } from "react";

import type { Frontmatter } from "../compiler/split.ts";
import {
  type DeckLayers,
  LAYER_NAMES,
  type LayerComponent,
  type ManifestPackages,
  type PackageModule,
  type PackageRef,
  type ResolvedLayers,
  type ThemeMeta,
} from "./contract.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MERGING A DECK WITH ITS THEME AND ADDONS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Everything here is a pure function of the manifest, so both compile paths and `<Deck>` agree:
 *
 *   components and layouts   theme < addons (in order) < the deck's own `components`
 *   layers                   stacked, not replaced: the theme's lowest, then the addons', then
 *                            the deck's; the deck's `false` for a layer hides all of them
 *   headmatter defaults      the theme's `config` < the deck's headmatter < deck.config.ts
 *   slide defaults           the theme's `defaults` < the headmatter's `defaults` < the slide
 *   themeConfig              the theme's `themeConfig` < the deck's `themeConfig`, as
 *                            `--theme-<kebab>` CSS custom properties on the deck root
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Components = Record<string, ComponentType<Record<string, unknown>>>;

/** A package's components and layouts as one `components` map (`layout:<name>` keys). */
export function packageComponents(mod: PackageModule | null | undefined): Components {
  if (!mod) return {};
  const out: Components = { ...(mod.components as Components | undefined) };
  for (const [name, C] of Object.entries(mod.layouts ?? {}))
    out[name.startsWith("layout:") ? name : `layout:${name}`] = C as Components[string];
  return out;
}

/** The deck's components over the addons' over the theme's. */
export function mergeComponents(
  deck: Components,
  addons: Array<PackageModule | null | undefined>,
  theme: PackageModule | null | undefined,
): Components {
  return Object.assign({}, packageComponents(theme), ...addons.map(packageComponents), deck);
}

/** Every layer's components, lowest first; the deck's `false` (or `null`) empties that layer. */
export function mergeLayers(
  deck: Array<DeckLayers | null | undefined>,
  addons: Array<PackageModule | null | undefined>,
  theme: PackageModule | null | undefined,
): ResolvedLayers {
  const out = Object.fromEntries(
    LAYER_NAMES.map((n) => [n, [] as LayerComponent[]]),
  ) as ResolvedLayers;
  const add = (layers: DeckLayers | null | undefined) => {
    for (const name of LAYER_NAMES) {
      const C = layers?.[name];
      if (typeof C === "function" || (C && typeof C === "object"))
        out[name].push(C as LayerComponent);
    }
  };
  add(theme?.layers);
  for (const a of addons) add(a?.layers);
  for (const d of deck) add(d);
  for (const d of deck)
    for (const name of LAYER_NAMES)
      if (d && name in d && (d[name] === false || d[name] === null)) out[name] = [];
  return out;
}

/** True when no layer has anything to draw (the common case: nothing is mounted at all). */
export function noLayers(layers: ResolvedLayers): boolean {
  return LAYER_NAMES.every((n) => layers[n].length === 0);
}

/** `primaryColor` → `primary-color`; `fontSize2` → `font-size-2`. */
export function kebab(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])(\d)/g, "$1-$2")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** A value a stylesheet can hold, or null: no braces, no semicolons, nothing that ends a rule. */
function cssValue(v: unknown): string | null {
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "string") {
    const s = v.trim();
    return s && !/[;{}<>]|\/\*/.test(s) ? s : null;
  }
  if (Array.isArray(v)) {
    const parts = v.map(cssValue);
    return parts.every((p) => p !== null) && parts.length ? parts.join(", ") : null;
  }
  return null;
}

/**
 * `themeConfig` as CSS custom properties: `{ primary: "#5d8392", cover: { image: "url(x)" } }`
 * → `--theme-primary: #5d8392; --theme-cover-image: url(x)`. Nested objects join their keys;
 * arrays become comma lists; booleans 1/0; anything a declaration cannot hold is dropped.
 */
export function themeConfigVars(
  config: Record<string, unknown> | null | undefined,
  prefix = "--theme",
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!config) return out;
  for (const [key, value] of Object.entries(config)) {
    const name = `${prefix}-${kebab(key)}`;
    if (!kebab(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value))
      Object.assign(out, themeConfigVars(value as Record<string, unknown>, name));
    else {
      const css = cssValue(value);
      if (css !== null) out[name] = css;
    }
  }
  return out;
}

/** The theme's `themeConfig` defaults with the deck's over them, one level deep. */
export function mergeThemeConfig(
  meta: ThemeMeta | null | undefined,
  deck: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const base = { ...meta?.themeConfig };
  for (const [k, v] of Object.entries(deck ?? {})) {
    const prev = base[k];
    base[k] =
      prev &&
      typeof prev === "object" &&
      !Array.isArray(prev) &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v)
        ? { ...(prev as Record<string, unknown>), ...(v as Record<string, unknown>) }
        : v;
  }
  return base;
}

/**
 * The config layer a theme contributes under the headmatter: its `config`, its single colour
 * scheme when it has one, and the names of the resolved themes — the headmatter may say
 * `theme: ./theme`, but the class the deck root wears is the theme's own name.
 */
export function packageConfigLayer(packages: ManifestPackages | null | undefined): {
  below: Record<string, unknown>;
  names: Record<string, unknown>;
} {
  if (!packages?.theme) return { below: {}, names: {} };
  const meta = packages.theme.meta as ThemeMeta;
  const below: Record<string, unknown> = { ...meta.config };
  if (meta.colorScheme === "light" || meta.colorScheme === "dark")
    below.colorScheme ??= meta.colorScheme;
  return {
    below,
    names: {
      theme: packages.theme.name,
      themes: [...new Set(packages.themes.map((t) => t.name))],
      addons: packages.addons.map((a) => a.name),
    },
  };
}

/**
 * Slide frontmatter defaults, lowest first (`[theme.defaults, headmatter.defaults]`), filled in
 * under each slide's own keys. Applied right after `prepareDeck` in both compile paths, so every
 * later pass — the compiler's `terms`, the runtime's layout and transition — sees them.
 *
 * It only fills keys a slide does not set, so it composes with a compiler that already applied
 * the headmatter's `defaults` inside `prepareDeck`: theme defaults still land underneath.
 */
export function applySlideDefaults(
  slides: Array<{ frontmatter: Frontmatter }>,
  layers: Array<Frontmatter | null | undefined>,
): void {
  const defaults = mergeDefaults(layers);
  if (!Object.keys(defaults).length) return;
  for (const s of slides) {
    for (const [k, v] of Object.entries(defaults))
      if (s.frontmatter[k] === undefined) s.frontmatter[k] = v;
  }
}

/** Defaults layered, later over earlier; non-objects (a mistyped `defaults: 3`) are skipped. */
export function mergeDefaults(layers: Array<unknown>): Frontmatter {
  const out: Frontmatter = {};
  for (const l of layers)
    if (l && typeof l === "object" && !Array.isArray(l)) Object.assign(out, l as Frontmatter);
  return out;
}

/** The slide-defaults layers for a deck: its theme's, then its addons', then its headmatter's. */
export function slideDefaultLayers(
  headmatter: Record<string, unknown>,
  theme: Pick<PackageRef, "meta"> | null | undefined,
  addons: Array<Pick<PackageRef, "meta">> = [],
): Array<Frontmatter | undefined> {
  return [
    theme?.meta.defaults,
    ...addons.map((a) => a.meta.defaults),
    headmatter.defaults && typeof headmatter.defaults === "object"
      ? (headmatter.defaults as Frontmatter)
      : undefined,
  ];
}

/**
 * The Shiki pair a deck highlights with when neither it nor its theme names one. GitHub's
 * high-contrast pair, not its default one: `github-light`'s orange and red (#e36209, #d73a49) are
 * 2.9–4.4:1 on the built-in themes' code panels and below 3:1 on a stepped line's band, so the
 * starter failed its own `kadal-deck contrast`. Every token of these two clears 4.5:1 on every
 * built-in panel and band (theming/code-contrast.test.ts).
 */
export const DEFAULT_SHIKI = {
  light: "github-light-high-contrast",
  dark: "github-dark-high-contrast",
};

/** The Shiki themes a deck highlights with: explicit options, else the theme's, else GitHub's. */
export function shikiThemes(
  explicit: { light?: string; dark?: string } | undefined,
  theme: Pick<PackageRef, "meta"> | null | undefined,
): { light: string; dark: string } {
  const fromTheme = (theme?.meta as ThemeMeta | undefined)?.shiki;
  return {
    light: explicit?.light ?? fromTheme?.light ?? DEFAULT_SHIKI.light,
    dark: explicit?.dark ?? fromTheme?.dark ?? DEFAULT_SHIKI.dark,
  };
}

/**
 * The `fonts` for the theme on show. The deck's config carries its own theme's `config.fonts`
 * under the headmatter's; when a viewer picks another theme from the menu, what came from the
 * deck's theme goes with it and the picked theme's comes instead (or nothing, and that theme's
 * CSS tokens speak). Families the deck chose itself (headmatter, deck.config.ts) stay, whichever
 * theme is shown. Without this, a theme picked from the menu never loaded its fonts and wore the
 * deck theme's families, which the root's inline font variables forced over its own tokens.
 */
export function fontsForTheme(
  packages: ManifestPackages | null | undefined,
  shown: string,
  fonts: unknown,
): unknown {
  const declared = packages?.theme;
  if (!packages || !declared || declared.name === shown) return fonts;
  const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const own = (declared.meta as ThemeMeta).config?.fonts;
  const picked = (packages.themes.find((t) => t.name === shown)?.meta as ThemeMeta | undefined)
    ?.config?.fonts;
  const nothing = fonts == null || (Array.isArray(fonts) && fonts.length === 0);
  if (nothing || same(fonts, own)) return picked ?? [];
  // The headmatter's object merged one level over the theme's: keep only the deck's own keys.
  if (isObj(fonts) && isObj(own)) {
    const authored = Object.fromEntries(Object.entries(fonts).filter(([k, v]) => !same(own[k], v)));
    return isObj(picked) ? { ...picked, ...authored } : authored;
  }
  return fonts;
}
