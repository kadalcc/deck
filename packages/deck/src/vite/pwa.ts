import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { escapeHtml } from "../core/head.ts";
import { PWA_TOAST_CSS, pwaClientScript } from "../pwa/client.ts";
import { serviceWorkerSource } from "../pwa/sw.ts";
import { DECK_ROUTES } from "./static-host.ts";
import type { ResolvedPackage } from "../theming/resolve.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECK AS AN APP  —  `pwa: true`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * After the build has written dist/ (vite/site.ts calls these from `closeBundle`):
 *
 *   icons                 the deck's `favicon` when it is a local SVG or PNG, else a monogram —
 *                         the title's first letter in the theme's accent and background
 *                         (`themeColors`, read from the theme's own stylesheet). icon.svg always;
 *                         icon-192/-512.png, a maskable 512 and apple-touch-icon.png when
 *                         Playwright's Chromium can draw them (else the SVG alone, said once)
 *   manifest.webmanifest  name, description, lang, start_url/scope/id = the base, standalone with
 *                         a fullscreen override, the theme's colours
 *   index.html            the manifest link, theme-color for both schemes, the touch icon, and
 *                         the registration script with its toast (pwa/client.ts)
 *   sw.js                 last, once every other file exists: the precache list is every file
 *                         of dist/ with its content hash (pwa/sw.ts) — except the worker itself,
 *                         source maps, the static-host fallbacks (404.html, _redirects, the route
 *                         copies), og-image.png and deck.pdf, which are fetched when asked for
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface PwaOptions {
  name?: string;
  shortName?: string;
  themeColor?: string;
  backgroundColor?: string;
  display?: "fullscreen" | "standalone" | "minimal-ui" | "browser";
}

/** `pwa:` as written → the options, or null when it is off. */
export function pwaOptions(value: unknown): PwaOptions | null {
  if (value === true || value === "true" || value === "build") return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const s = (k: string) =>
    typeof v[k] === "string" && (v[k] as string).trim() ? (v[k] as string).trim() : undefined;
  const display = s("display");
  return {
    ...(s("name") ? { name: s("name") } : {}),
    ...(s("shortName") ? { shortName: s("shortName") } : {}),
    ...(s("themeColor") ? { themeColor: s("themeColor") } : {}),
    ...(s("backgroundColor") ? { backgroundColor: s("backgroundColor") } : {}),
    ...(display && ["fullscreen", "standalone", "minimal-ui", "browser"].includes(display)
      ? { display: display as PwaOptions["display"] }
      : {}),
  };
}

export interface SchemeColors {
  bg: string;
  fg: string;
  accent: string;
}

const FALLBACK: { light: SchemeColors; dark: SchemeColors } = {
  light: { bg: "#ffffff", fg: "#111111", accent: "#2563eb" },
  dark: { bg: "#0b0b0d", fg: "#f4f4f5", accent: "#60a5fa" },
};

/** A token's value as a colour: `var(--x, #abc)` gives its fallback; anything else non-colour is null. */
function colourOf(raw: string | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim();
  for (let i = 0; i < 3 && v.startsWith("var("); i++) {
    const m = /^var\(\s*--[\w-]+\s*,\s*(.+)\)$/.exec(v);
    if (!m) return null;
    v = m[1]!.trim();
  }
  return /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([^)]*\))$/i.test(v) ? v : null;
}

/** The `--deck-*` tokens one rule of a stylesheet sets. */
function tokensIn(css: string, selector: RegExp): Partial<SchemeColors> {
  const out: Partial<SchemeColors> = {};
  for (const m of css.matchAll(selector)) {
    const body = m[1]!;
    for (const [key, token] of [
      ["bg", "--deck-bg"],
      ["fg", "--deck-fg"],
      ["accent", "--deck-accent"],
    ] as const) {
      const t = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(body);
      const c = colourOf(t?.[1]);
      if (c && !out[key]) out[key] = c;
    }
  }
  return out;
}

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The theme's colours for each scheme, from `.theme-<name>` (light) and its dark rule. */
export function themeColorsFromCss(
  css: string,
  name: string,
): { light: SchemeColors; dark: SchemeColors } {
  const n = reEscape(name);
  const plain = tokensIn(css, new RegExp(`\\.theme-${n}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "g"));
  const light = tokensIn(
    css,
    new RegExp(`\\.theme-${n}\\[data-color-scheme=["']?light["']?\\][^{]*\\{([^}]*)\\}`, "g"),
  );
  const dark = tokensIn(
    css,
    new RegExp(`\\.theme-${n}\\[data-color-scheme=["']?dark["']?\\][^{]*\\{([^}]*)\\}`, "g"),
  );
  return {
    light: { ...FALLBACK.light, ...plain, ...light },
    dark: { ...FALLBACK.dark, ...plain, ...dark },
  };
}

/** The theme's stylesheet on disk (a built-in's from this package), or null. */
function themeCssFile(theme: ResolvedPackage, deckDir: string): string | null {
  if (!theme.css) return null;
  if (!theme.builtin) return existsSync(theme.css) ? theme.css : null;
  try {
    return createRequire(join(deckDir, "package.json")).resolve(theme.css);
  } catch {
    const own = fileURLToPath(new URL(`../themes/${theme.name}.css`, import.meta.url));
    return existsSync(own) ? own : null;
  }
}

export function themeColors(
  theme: ResolvedPackage | null,
  deckDir: string,
): { light: SchemeColors; dark: SchemeColors } {
  const file = theme ? themeCssFile(theme, deckDir) : null;
  if (!theme || !file) return FALLBACK;
  try {
    return themeColorsFromCss(readFileSync(file, "utf8"), theme.name);
  } catch {
    return FALLBACK;
  }
}

/** sRGB luminance of a #hex colour (null for other notations). */
function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The first letter of the title (a whole grapheme: an emoji or an accented letter). */
export function monogramLetter(title: string): string {
  const t = title.trim();
  if (!t) return "K";
  const Seg = (
    Intl as unknown as {
      Segmenter?: new (
        l?: string,
        o?: object,
      ) => { segment(s: string): Iterable<{ segment: string }> };
    }
  ).Segmenter;
  const first = Seg
    ? ([...new Seg(undefined, { granularity: "grapheme" }).segment(t)][0]?.segment ?? t[0]!)
    : [...t][0]!;
  return first.toLocaleUpperCase();
}

/**
 * The monogram: the letter in the theme's background colour on its accent (or its foreground,
 * when the accent is too close to the background to read). `maskable` fills the square and keeps
 * the letter inside the safe zone; the plain one is a rounded tile.
 */
export function monogramSvg(title: string, c: SchemeColors, maskable = false): string {
  const ground = (contrast(c.accent, c.bg) ?? 4.5) >= 3 ? c.accent : c.fg;
  const letter = escapeHtml(monogramLetter(title));
  const size = maskable ? 220 : 300;
  const rect = maskable
    ? `<rect width="512" height="512" fill="${escapeHtml(ground)}"/>`
    : `<rect x="16" y="16" width="480" height="480" rx="104" fill="${escapeHtml(ground)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${rect}<text x="256" y="256" dy="0.35em" text-anchor="middle" font-family="system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" font-weight="700" font-size="${size}" fill="${escapeHtml(c.bg)}">${letter}</text></svg>`;
}

/** A PNG's pixel size, from its header. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export function webManifest(o: {
  title: string;
  description: string;
  lang: string;
  base: string;
  colors: SchemeColors;
  icons: ManifestIcon[];
  options: PwaOptions;
}): Record<string, unknown> {
  const name = o.options.name ?? o.title;
  const short =
    o.options.shortName ?? (name.length > 12 ? `${name.slice(0, 11).trimEnd()}…` : name);
  return {
    id: o.base,
    name,
    short_name: short,
    ...(o.description ? { description: o.description } : {}),
    ...(o.lang ? { lang: o.lang } : {}),
    start_url: o.base,
    scope: o.base,
    display: o.options.display ?? "standalone",
    ...(o.options.display ? {} : { display_override: ["fullscreen", "standalone"] }),
    background_color: o.options.backgroundColor ?? o.colors.bg,
    theme_color: o.options.themeColor ?? o.colors.bg,
    icons: o.icons,
  };
}

/** Files of dist/ the worker leaves to the network (see the header). */
const ROUTE_DIRS = new Set<string>(DECK_ROUTES);
const SKIP_FILES = new Set([
  "sw.js",
  "404.html",
  "_redirects",
  "_headers",
  "og-image.png",
  "deck.pdf",
  ".DS_Store",
]);
const MAX_PRECACHE = 100 * 1024 * 1024;

/** [url, content hash] for every file of `outDir` the deck needs offline. */
export function precacheList(
  outDir: string,
  base: string,
  warn: (m: string) => void = () => {},
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name);
      const rel = relative(outDir, file).split(sep).join("/");
      const st = statSync(file);
      if (st.isDirectory()) {
        // The route copies are index.html again: the worker answers those routes itself.
        if (
          dir === outDir &&
          ROUTE_DIRS.has(name) &&
          readdirSync(file).every((f) => f === "index.html")
        )
          continue;
        walk(file);
        continue;
      }
      if (dir === outDir && SKIP_FILES.has(name)) continue;
      if (name.endsWith(".map") || name === ".DS_Store") continue;
      if (st.size > MAX_PRECACHE) {
        warn(
          `[deck] pwa: ${rel} is over 100 MB; it is fetched when the deck asks for it, not saved ahead`,
        );
        continue;
      }
      const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
      const url =
        rel === "index.html" ? base : `${base}${rel.split("/").map(encodeURIComponent).join("/")}`;
      out.push([url, hash]);
    }
  };
  walk(outDir);
  return out;
}

/** The worker for `outDir`, written last (its list is every other file). */
export function writeServiceWorker(
  outDir: string,
  base: string,
  { bypass, warn }: { bypass: string[]; warn?: (m: string) => void },
): { files: number; version: string } {
  const precache = precacheList(outDir, base, warn);
  const version = createHash("sha256").update(JSON.stringify(precache)).digest("hex").slice(0, 16);
  writeFileSync(
    join(outDir, "sw.js"),
    serviceWorkerSource({ scope: base, version, precache, bypass, network: [`${base}remote`] }),
  );
  return { files: precache.length, version };
}

/** The paths the worker never answers, for a deck at `base` whose live room is `liveApi`. */
export function bypassPaths(base: string, liveApi: unknown): string[] {
  const out = new Set(["/api/", "/__kadal/", `${base}api/`, `${base}__kadal/`]);
  if (typeof liveApi === "string" && liveApi.startsWith("/") && !liveApi.startsWith("//"))
    out.add(liveApi.endsWith("/") ? liveApi : `${liveApi}/`);
  return [...out];
}

/** index.html with the manifest, the icons, theme-color and the registration script. */
export function pwaHead(
  html: string,
  o: {
    base: string;
    colors: { light: SchemeColors; dark: SchemeColors };
    touchIcon: string | null;
    themeColor?: string;
  },
): string {
  const tags = [
    `<link rel="manifest" href="${escapeHtml(o.base)}manifest.webmanifest" />`,
    `<meta name="mobile-web-app-capable" content="yes" />`,
    ...(o.touchIcon ? [`<link rel="apple-touch-icon" href="${escapeHtml(o.touchIcon)}" />`] : []),
    ...(/<meta\b[^>]*name=["']theme-color["']/i.test(html)
      ? []
      : o.themeColor
        ? [`<meta name="theme-color" content="${escapeHtml(o.themeColor)}" />`]
        : [
            `<meta name="theme-color" content="${escapeHtml(o.colors.light.bg)}" media="(prefers-color-scheme: light)" />`,
            `<meta name="theme-color" content="${escapeHtml(o.colors.dark.bg)}" media="(prefers-color-scheme: dark)" />`,
          ]),
    PWA_TOAST_CSS,
    pwaClientScript({ scope: o.base, sw: `${o.base}sw.js`, network: [`${o.base}remote`] }),
  ];
  const block = tags.map((t) => `    ${t}\n`).join("");
  return /<\/head>/i.test(html)
    ? html.replace(/([ \t]*)<\/head>/i, (_m, i: string) => `${block}${i}</head>`)
    : block + html;
}
