import type { ThemeMeta } from "../theming/contract.ts";
import { shikiThemes } from "../theming/merge.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CODE COLOURS THAT FOLLOW THE THEME MENU
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Code is highlighted at build time, and each theme package names the Shiki pair its code wears
 * (`kadal.theme.shiki`). A viewer who picks another theme from the menu (T) should see that
 * theme's code colours, not the deck theme's. So every token is highlighted once with every
 * Shiki theme the menu can show, and carries each colour as a CSS variable:
 *
 *   --shiki-light / --shiki-dark   the deck theme's pair, as before (base.css reads them by the
 *                                  colour scheme; print, PDF and PPTX read the computed colour)
 *   --shiki-k1, --shiki-k2…        each further Shiki theme a menu theme needs, deduplicated: two
 *                                  themes on vitesse share one key, and a theme whose dark side is
 *                                  the deck's own reuses `--shiki-dark`
 *
 * and a few rules, built here and shipped in the manifest's stylesheet, point each menu theme at
 * its keys: `.theme-ocean[data-color-scheme="dark"] .shiki span { color: var(--shiki-k2, …) }`.
 * The fallback chain ends on the deck's own colour, so a token without the key (code an older
 * build highlighted, a transformer's own span) still has one.
 *
 * Nothing changes for a deck whose menu themes all share its pair (minimal, rla and stack are
 * all GitHub): no extra keys, no rules, byte-identical output. The cost grows with each distinct
 * Shiki theme the menu adds, about 18 bytes per token before compression, so only the themes a
 * deck names (`theme`, `themes`) are planned here: the first-party themes every menu adds on its
 * own (`implicit`) keep the deck's code colours. `codeThemes` is where that is decided, and a deck
 * that pins `deck({ shiki: { light, dark } })` keeps one pair for every theme, as it asked.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface CodeThemes {
  /** The deck theme's pair: `--shiki-light` / `--shiki-dark`. */
  light: string;
  dark: string;
  /** Each further Shiki theme by its variable key (`k1` → `--shiki-k1`). */
  extra: Record<string, string>;
  /**
   * For each menu theme (by its class name) whose code differs from the deck theme's, the key
   * each colour scheme reads: `light`, `dark` or one of `extra`'s.
   */
  menu: Record<string, { light: string; dark: string }>;
}

/** What `codeToHast({ themes })` takes here: the deck's pair, plus `k1`, `k2`… when the menu needs them. */
export type ShikiThemeOption = { light: string; dark: string } & Record<string, string>;

export interface MenuTheme {
  name: string;
  /** How the deck named it; also a class name when it differs from `name` and is one. */
  spec?: string;
  meta: unknown;
}

const CLASS_SAFE = /^[\w-]+$/;

/**
 * Plan the code colours for a deck: its own theme's pair, and what each other theme the menu
 * offers needs on top. `explicit` is `deck({ shiki })` / `compileDeck({ shiki })`.
 */
export function codeThemes(
  explicit: { light?: string; dark?: string } | undefined,
  deckTheme: { meta: unknown } | null | undefined,
  menuThemes: readonly MenuTheme[] = [],
): CodeThemes {
  const base = shikiThemes(explicit, deckTheme as { meta: ThemeMeta } | null | undefined);
  const out: CodeThemes = { light: base.light, dark: base.dark, extra: {}, menu: {} };
  // A theme on both sides of the deck's pair (one-scheme themes) is read as `light`.
  const keyOf = new Map<string, string>([
    [base.dark, "dark"],
    [base.light, "light"],
  ]);
  let next = 1;
  const key = (shiki: string) => {
    let k = keyOf.get(shiki);
    if (!k) {
      k = `k${next++}`;
      keyOf.set(shiki, k);
      out.extra[k] = shiki;
    }
    return k;
  };
  for (const t of menuThemes) {
    const pair = shikiThemes(explicit, t as { meta: ThemeMeta });
    const keys = { light: key(pair.light), dark: key(pair.dark) };
    if (keys.light === "light" && keys.dark === "dark") continue;
    for (const name of new Set([t.name, t.spec ?? t.name]))
      if (CLASS_SAFE.test(name)) out.menu[name] = keys;
  }
  return out;
}

/** The `themes` option for Shiki's `codeToHast` / `codeToTokens`: the pair and every extra key. */
export function shikiThemeOption(t: CodeThemes): ShikiThemeOption {
  return { light: t.light, dark: t.dark, ...t.extra };
}

/** Every Shiki theme the highlighter must have loaded. */
export function shikiThemeNames(t: CodeThemes): string[] {
  return [...new Set([t.light, t.dark, ...Object.values(t.extra)])];
}

/** A cache key for a highlighter that has these themes. */
export const codeThemesKey = (t: CodeThemes): string => shikiThemeNames(t).join("|");

/**
 * The rules that point each menu theme's code at its keys, for the manifest's stylesheet ("" when
 * every menu theme shares the deck's pair). The theme class and the scheme sit on the same
 * element (the deck root, a print page, a thumbnail), as theme stylesheets already assume. A
 * slide that forces a scheme wears both too (react/SlideFrame.tsx); its rule is one class
 * stronger, so a light slide in a dark deck reads its light key, not the root's dark one.
 */
export function codeThemeCss(t: CodeThemes): string {
  const rules: string[] = [];
  for (const [name, keys] of Object.entries(t.menu)) {
    for (const scheme of ["light", "dark"] as const) {
      const k = keys[scheme];
      const own = `var(--shiki-${scheme}, inherit)`;
      const value = k === scheme ? own : `var(--shiki-${k}, ${own})`;
      const at = `.theme-${name}[data-color-scheme="${scheme}"]`;
      rules.push(
        `${at} :is(.shiki, .shiki span), .deck-slide${at} :is(.shiki, .shiki span) { color: ${value}; }`,
      );
    }
  }
  return rules.length
    ? `/* Code colours for the themes the menu offers (compiler/code-themes.ts). */\n${rules.join("\n")}\n`
    : "";
}

/**
 * The Shiki theme code wears with `theme` on show in `scheme`: what a Monaco editor switches to
 * when the viewer picks a theme from the menu. Null without a plan (a manifest before 0.4.1).
 */
export function codeThemeFor(
  t: CodeThemes | null | undefined,
  theme: string,
  scheme: "light" | "dark",
): string | null {
  if (!t) return null;
  const key = t.menu[theme]?.[scheme] ?? scheme;
  return key === "light" ? t.light : key === "dark" ? t.dark : (t.extra[key] ?? t[scheme]);
}
