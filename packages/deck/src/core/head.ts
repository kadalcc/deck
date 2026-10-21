/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PAGE'S HEAD: title, description, Open Graph, Twitter, canonical, lang
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What a link to the deck shows when it is pasted somewhere — and what a search engine reads —
 * comes from the headmatter:
 *
 *   title: The talk                    <title>, og:title
 *   info: One line about it            <meta name="description">, og:description
 *   author: Ana                        <meta name="author">
 *   lang: en                           <html lang>, og:locale (when it is a locale)
 *   favicon: /logo.svg                 <link rel="icon">
 *   seoMeta:                           Slidev's key, unhead's names
 *     ogImage: auto                    slide 1 photographed into og-image.png at build
 *     ogUrl: https://talks.ana.dev/x/  og:url, the canonical link, and what makes og:image absolute
 *     twitterCard: summary_large_image
 *     twitterSite: "@ana"
 *     themeColor: "#0f766e"            <meta name="theme-color">
 *     robots: noindex                  any other key becomes a <meta name="…"> of its own
 *
 * `headTags` turns that into a list of tags (pure: the Vite plugin writes them into the built
 * index.html, the runtime — react/head.ts — into the live document, which is all a deck the
 * prebuilt shell compiles in the browser can have). `injectHead` rewrites an HTML page's head
 * with them: the deck's values replace the same tags in index.html, so the template's generic
 * `<title>Deck</title>` never wins over the headmatter.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface HeadInput {
  title?: unknown;
  info?: unknown;
  description?: unknown;
  author?: unknown;
  keywords?: unknown;
  lang?: unknown;
  favicon?: unknown;
  seoMeta?: unknown;
}

export type HeadTag =
  | { tag: "title"; text: string }
  | { tag: "meta"; key: "name" | "property"; name: string; content: string; media?: string }
  | { tag: "link"; rel: string; href: string; type?: string };

export interface HeadOptions {
  /** The deck's base path ("/talks/x/"), for paths the deck names relative to itself. */
  base?: string;
  /**
   * The og:image to use when `seoMeta.ogImage` is `auto` (or absent while an og-image.png was
   * found): a path inside the build, e.g. "og-image.png". Null leaves `auto` out (the runtime).
   */
  ogImageFile?: string | null;
  /** theme-color when the deck does not set one: one colour, or one per scheme. */
  themeColor?: string | { light: string; dark: string } | null;
}

/** og:* names unhead writes with an underscore rather than a colon. */
const UNDERSCORE: Record<string, string> = {
  ogSiteName: "og:site_name",
  ogImageSecureUrl: "og:image:secure_url",
  ogVideoSecureUrl: "og:video:secure_url",
  ogAudioSecureUrl: "og:audio:secure_url",
  ogLocaleAlternate: "og:locale:alternate",
  articlePublishedTime: "article:published_time",
  articleModifiedTime: "article:modified_time",
  articleExpirationTime: "article:expiration_time",
};

/** Keys of `seoMeta` that are not a meta tag of the same name. */
const SPECIAL = new Set(["canonical", "themeColor", "ogImage", "ogUrl"]);

const str = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
};

/** `ogImageAlt` → `og:image:alt`, `twitterCard` → `twitter:card`, `googleSiteVerification` → `google-site-verification`. */
export function metaName(key: string): { key: "name" | "property"; name: string } {
  if (UNDERSCORE[key]) return { key: "property", name: UNDERSCORE[key] };
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(" ");
  const [first, ...rest] = words;
  if (
    (first === "og" || first === "article" || first === "book" || first === "profile") &&
    rest.length
  )
    return { key: "property", name: `${first}:${rest.join(":")}` };
  // Twitter documents `name=`; Facebook's scraper reads `property=` — `name` is what Twitter wants.
  if (first === "twitter" && rest.length) return { key: "name", name: `twitter:${rest.join(":")}` };
  if (key.includes(":")) return { key: "property", name: key };
  return { key: "name", name: words.join("-") };
}

/** A path the deck names (`./cover.png`, `cover.png`, `/cover.png`) under its base; a URL as is. */
export function deckUrl(path: string, base = "/"): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) return path;
  const b = base.endsWith("/") ? base : `${base}/`;
  const rel = path.replace(/^\.\//, "");
  if (rel.startsWith("/")) return rel.startsWith(b) || b === "/" ? rel : `${b}${rel.slice(1)}`;
  return `${b}${rel}`;
}

/**
 * A deck path as a full URL, when the deck's own address (og:url) is known: `cover.png`,
 * `./cover.png` and `/cover.png` (public/) all sit at the deck's address, wherever it is hosted.
 * Most link previews ignore an og:image that is not absolute.
 */
function absolute(path: string, site: string | null, base: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) return path;
  if (!site) return deckUrl(path, base);
  const b = base.endsWith("/") ? base : `${base}/`;
  let rel = path.replace(/^\.\//, "");
  if (rel.startsWith(b) && b !== "/") rel = rel.slice(b.length);
  rel = rel.replace(/^\//, "");
  try {
    const u = new URL(site);
    // `…/first` is a folder unless its last segment looks like a file.
    if (!u.pathname.endsWith("/") && !/\.[a-z0-9]{2,5}$/i.test(u.pathname)) u.pathname += "/";
    return new URL(rel, u).toString();
  } catch {
    return deckUrl(path, base);
  }
}

/** `pt-BR` → `pt_BR` (og:locale is language_TERRITORY); a bare `en` names no territory, so none. */
const ogLocale = (lang: string) =>
  /^[a-z]{2,3}[-_][A-Za-z]{2}$/.test(lang) ? lang.replace("-", "_") : null;

/** The deck's head, in order: title, description and author, Open Graph, Twitter, the rest. */
export function headTags(input: HeadInput, options: HeadOptions = {}): HeadTag[] {
  const base = options.base ?? "/";
  const seo: Record<string, unknown> =
    input.seoMeta && typeof input.seoMeta === "object" && !Array.isArray(input.seoMeta)
      ? (input.seoMeta as Record<string, unknown>)
      : {};
  const tags: HeadTag[] = [];
  const meta = (name: string, content: string | null, key: "name" | "property" = "name") => {
    if (content) tags.push({ tag: "meta", key, name, content });
  };

  const title = str(input.title);
  const description = str(seo.description) ?? str(input.info) ?? str(input.description);
  const site = str(seo.ogUrl) ?? str(seo.canonical);
  if (title) tags.push({ tag: "title", text: title });
  meta("description", description);
  meta("author", str(input.author));
  const keywords = Array.isArray(input.keywords)
    ? input.keywords.map(str).filter(Boolean).join(", ")
    : str(input.keywords);
  meta("keywords", keywords || null);

  const favicon = str(input.favicon);
  if (favicon) {
    const href = deckUrl(favicon, base);
    const type = /\.svg(\?|$)/i.test(href)
      ? "image/svg+xml"
      : /\.png(\?|$)/i.test(href)
        ? "image/png"
        : undefined;
    tags.push({ tag: "link", rel: "icon", href, ...(type ? { type } : {}) });
  }
  const canonical = str(seo.canonical) ?? str(seo.ogUrl);
  if (canonical) tags.push({ tag: "link", rel: "canonical", href: canonical });

  // Open Graph: the deck's own values unless seoMeta says otherwise.
  const rawImage = str(seo.ogImage);
  const image =
    rawImage === "auto" || (!rawImage && options.ogImageFile)
      ? options.ogImageFile
        ? absolute(options.ogImageFile, site, base)
        : null
      : rawImage
        ? absolute(rawImage, site, base)
        : null;
  meta("og:type", str(seo.ogType) ?? "website", "property");
  meta("og:title", str(seo.ogTitle) ?? title, "property");
  meta("og:description", str(seo.ogDescription) ?? description, "property");
  meta("og:url", str(seo.ogUrl), "property");
  meta("og:image", image, "property");
  const lang = str(input.lang);
  if (lang && seo.ogLocale === undefined) meta("og:locale", ogLocale(lang), "property");
  // A picture asks for the large card; a deck without one gets the plain card.
  meta(
    "twitter:card",
    str(seo.twitterCard) ?? (image || seo.twitterImage ? "summary_large_image" : "summary"),
  );

  // Every other seoMeta key, in the order written: og*/twitter*/article* by unhead's names.
  const done = new Set(tags.flatMap((t) => (t.tag === "meta" ? [t.name] : [])));
  for (const [key, value] of Object.entries(seo)) {
    if (SPECIAL.has(key) || key === "description") continue;
    const v = str(value);
    if (!v) continue;
    const m = metaName(key);
    const content = /image$/i.test(key) ? absolute(v, site, base) : v;
    if (done.has(m.name)) {
      // og:type, og:title… were already written from the deck: seoMeta's value replaces it.
      const at = tags.findIndex((t) => t.tag === "meta" && t.name === m.name);
      tags[at] = { tag: "meta", key: m.key, name: m.name, content };
      continue;
    }
    done.add(m.name);
    tags.push({ tag: "meta", key: m.key, name: m.name, content });
  }

  const color = str(seo.themeColor) ?? options.themeColor ?? null;
  if (typeof color === "string") meta("theme-color", color);
  else if (color) {
    tags.push({
      tag: "meta",
      key: "name",
      name: "theme-color",
      content: color.light,
      media: "(prefers-color-scheme: light)",
    });
    tags.push({
      tag: "meta",
      key: "name",
      name: "theme-color",
      content: color.dark,
      media: "(prefers-color-scheme: dark)",
    });
  }
  return tags;
}

/** Text safe inside a double-quoted attribute, or an element. */
export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderTag(t: HeadTag): string {
  if (t.tag === "title") return `<title>${escapeHtml(t.text)}</title>`;
  if (t.tag === "link")
    return `<link rel="${escapeHtml(t.rel)}" href="${escapeHtml(t.href)}"${t.type ? ` type="${escapeHtml(t.type)}"` : ""} />`;
  return `<meta ${t.key}="${escapeHtml(t.name)}" content="${escapeHtml(t.content)}"${t.media ? ` media="${escapeHtml(t.media)}"` : ""} />`;
}

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The page with the deck's head: each tag replaces any of the same name already there (the
 * template's `<title>`, its theme-color…), new ones go before `</head>`, and `lang` lands on
 * `<html>`. Everything else in the page is left byte for byte.
 */
export function injectHead(
  html: string,
  tags: HeadTag[],
  { lang }: { lang?: unknown } = {},
): string {
  let out = html;
  const remove = (re: RegExp) => {
    out = out.replace(re, "");
  };
  const added: string[] = [];
  for (const t of tags) {
    if (t.tag === "title") remove(/[ \t]*<title\b[^>]*>[\s\S]*?<\/title>[ \t]*\r?\n?/gi);
    else if (t.tag === "meta")
      remove(
        new RegExp(
          `[ \\t]*<meta\\b[^>]*\\b${t.key}\\s*=\\s*["']${reEscape(t.name)}["'][^>]*>[ \\t]*\\r?\\n?`,
          "gi",
        ),
      );
    else if (t.rel === "icon" || t.rel === "canonical")
      remove(
        new RegExp(
          `[ \\t]*<link\\b[^>]*\\brel\\s*=\\s*["']${t.rel}["'][^>]*>[ \\t]*\\r?\\n?`,
          "gi",
        ),
      );
    added.push(renderTag(t));
  }
  if (added.length) {
    const block = added.map((a) => `    ${a}\n`).join("");
    out = /<\/head>/i.test(out)
      ? out.replace(/([ \t]*)<\/head>/i, (_m, indent: string) => `${block}${indent}</head>`)
      : `${block}${out}`;
  }
  const l = str(lang);
  if (l) {
    out = /<html\b[^>]*\blang\s*=/i.test(out)
      ? out.replace(/(<html\b[^>]*\blang\s*=\s*)(["'])[^"']*\2/i, `$1"${escapeHtml(l)}"`)
      : out.replace(/<html\b/i, `<html lang="${escapeHtml(l)}"`);
  }
  return out;
}
