import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";

import { resolveFonts } from "../theming/fonts.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BUNDLED REMOTE ASSETS  —  `bundleRemoteAssets: true`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A deck presented on a conference laptop with no network should look exactly as it did at
 * home. With the key on, `kadal-deck build` downloads what the deck reaches for across the
 * network and ships it in dist/remote-assets/, pointing the deck at the copies:
 *
 *   slides and notes   `![](https://…/chart.png)`, `<img src>`, `<video poster>`, a slide's
 *                      `background: https://images.unsplash.com/…` (the manifest's frontmatter)
 *   the deck's code    src/*.tsx and friends (`src="https://…"`, `url(https://…)`)
 *   the CSS bundle     `url(https://…)` and `@import url(https://fonts.googleapis.com/…)`,
 *                      a theme package's included
 *   index.html         stylesheet and icon links (never the og:/twitter: tags: a link preview
 *                      needs the public URL)
 *   `fonts:`           the Google / Bunny stylesheets the runtime asks for (theming/fonts.ts):
 *                      left as a map on the window (core/remote-assets.ts)
 *
 * A stylesheet is fetched as a browser would (woff2 from Google) and its own `url()`s — the font
 * files — are bundled beside it, a few levels deep. What counts as an asset: a URL whose path
 * ends in an image, media, font or CSS extension, Google/Bunny Fonts stylesheets and files, and
 * Unsplash images. A link to a page is left alone; so is anything outside a string literal that
 * is entirely the URL (a code sample's text keeps its URL as written), and `children`/`alt`
 * values are never touched.
 *
 * Downloads are cached in `.kadal-deck/cache/remote-assets/` (keyed by URL), so a second build
 * needs no network at all. Each asset fails on its own: the URL stays as it was, the build goes
 * on, and the summary at the end says which ones and why.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DIR = "remote-assets";
const MAX_BYTES = 50 * 1024 * 1024;
const TIMEOUT = 20_000;
const CSS_DEPTH = 3;
/** Google Fonts answers woff2 only to a browser it recognises. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const ASSET_EXT =
  /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|mp4|webm|ogv|mov|m4v|mp3|ogg|oga|opus|wav|m4a|flac|woff2?|ttf|otf|eot|css)$/i;

const TYPE_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "font/woff2": ".woff2",
  "font/woff": ".woff",
  "font/ttf": ".ttf",
  "font/otf": ".otf",
  "text/css": ".css",
};

/** Is this URL an asset the build should bring along? */
export function isBundlable(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname;
  if (host === "fonts.googleapis.com" || host === "fonts.gstatic.com") return true;
  if (host === "fonts.bunny.net") return true;
  if (host === "images.unsplash.com" || host === "plus.unsplash.com") return true;
  return ASSET_EXT.test(u.pathname);
}

/** Literal values of these keys are text, never a resource. */
const TEXT_KEYS = new Set([
  "children",
  "alt",
  "title",
  "text",
  "value",
  "label",
  "content",
  "notesText",
  "aria-label",
  "ariaLabel",
  "placeholder",
]);
/** seoMeta's and the head's URLs must stay public. */
const PUBLIC_KEY = /^(og|twitter)[A-Z]|^(canonical|ogUrl)$/;

const URL_CHARS = String.raw`https?:\/\/[^"'\x60\s\\<>]+`;
/** `key: "URL"`, `key="URL"`, `"key":"URL"` — a string literal that is the URL and nothing else. */
const KEY_VALUE = new RegExp(
  String.raw`(?<![\w$-])("[\w$-]+"|'[\w$-]+'|[A-Za-z_$][\w$-]*)(\s*[:=]\s*)(["'\x60])(${URL_CHARS})\3`,
  "g",
);
/** `url(URL)`, quoted or not, inside a string or a stylesheet. */
const CSS_URL = /url\(\s*(["']?)(https?:\/\/[^"')\s]+)\1\s*\)/g;
/** `@import "URL"` (the `url()` form is CSS_URL's). */
const CSS_IMPORT = /@import\s+(["'])(https?:\/\/[^"']+)\1/g;

/** The remote URLs a module's code names, by the rules above. */
export function findInCode(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(KEY_VALUE)) {
    const key = m[1]!.replace(/^["']|["']$/g, "");
    if (TEXT_KEYS.has(key) || PUBLIC_KEY.test(key)) continue;
    if (isBundlable(m[4]!)) out.add(m[4]!);
  }
  for (const m of code.matchAll(CSS_URL)) if (isBundlable(m[2]!)) out.add(m[2]!);
  return [...out];
}

/** `code` with every URL `findInCode` finds that `local` has a copy of, pointed at the copy. */
export function rewriteCode(code: string, local: (url: string) => string | null): string {
  return code
    .replace(KEY_VALUE, (all, key: string, sep: string, q: string, url: string) => {
      const k = key.replace(/^["']|["']$/g, "");
      if (TEXT_KEYS.has(k) || PUBLIC_KEY.test(k)) return all;
      const to = local(url);
      return to ? `${key}${sep}${q}${to}${q}` : all;
    })
    .replace(CSS_URL, (all, q: string, url: string) => {
      const to = local(url);
      return to ? `url(${q}${to}${q})` : all;
    });
}

/** The remote URLs a stylesheet names (`from` resolves its relative ones, for a remote sheet). */
export function findInCss(css: string, from?: string): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const url = resolveAgainst(raw, from);
    if (url && isBundlable(url)) out.add(url);
  };
  for (const m of css.matchAll(/url\(\s*(["']?)([^"')\s]+)\1\s*\)/g)) add(m[2]!);
  for (const m of css.matchAll(CSS_IMPORT)) add(m[2]!);
  return [...out];
}

export function rewriteCss(
  css: string,
  local: (url: string) => string | null,
  from?: string,
): string {
  const swap = (raw: string) => {
    const url = resolveAgainst(raw, from);
    return url ? local(url) : null;
  };
  return css
    .replace(/url\(\s*(["']?)([^"')\s]+)\1\s*\)/g, (all, q: string, raw: string) => {
      const to = swap(raw);
      return to ? `url(${q}${to}${q})` : all;
    })
    .replace(CSS_IMPORT, (all, q: string, raw: string) => {
      const to = swap(raw);
      return to ? `@import ${q}${to}${q}` : all;
    });
}

function resolveAgainst(raw: string, from?: string): string | null {
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!from || raw.startsWith("data:") || raw.startsWith("#")) return null;
  try {
    return new URL(raw, from).toString();
  } catch {
    return null;
  }
}

/** The file a URL is kept as: a hash of the URL, and the extension its path or type implies. */
export function assetFileName(url: string, contentType?: string | null): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
  let ext = "";
  try {
    const u = new URL(url);
    const m = /\.([a-z0-9]{2,5})$/i.exec(u.pathname);
    if (m) ext = `.${m[1]!.toLowerCase()}`;
    else if (
      u.hostname === "fonts.googleapis.com" ||
      (u.hostname === "fonts.bunny.net" && u.pathname.startsWith("/css"))
    )
      ext = ".css";
  } catch {
    /* not a URL: no extension */
  }
  if (!ext && contentType) ext = TYPE_EXT[contentType.split(";")[0]!.trim().toLowerCase()] ?? "";
  return `${DIR}/${hash}${ext || ".bin"}`;
}

interface Downloaded {
  url: string;
  /** dist-relative, e.g. remote-assets/ab12….png */
  file: string;
  bytes: Uint8Array;
  type: string;
  cached: boolean;
}

export interface RemoteAssetsOptions {
  /** The deck folder: the cache lives in its `.kadal-deck/cache/remote-assets`. */
  root: string;
  /** The deck's base ("/talks/x/", or "./"). */
  base: string;
  fetch?: typeof fetch;
  warn?: (message: string) => void;
}

/**
 * One build's downloads: each URL fetched once (or read from the cache), its copy named, and
 * stylesheets rewritten so their own fonts and pictures are copies too.
 */
export class RemoteAssets {
  private readonly jobs = new Map<string, Promise<Downloaded | null>>();
  private readonly failures = new Map<string, string>();
  private readonly cacheDir: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly o: RemoteAssetsOptions) {
    this.cacheDir = join(o.root, ".kadal-deck", "cache", DIR);
    this.doFetch = o.fetch ?? fetch;
  }

  /** The copy's URL from a module (absolute under the base, or ./ for a relative base). */
  private publicUrl(file: string): string {
    const base = this.o.base.endsWith("/") ? this.o.base : `${this.o.base}/`;
    return base === "" || base === "./" ? `./${file}` : `${base}${file}`;
  }

  /** Bring `url` (and, for a stylesheet, what it names) into the build; null when it failed. */
  get(url: string, depth = 0): Promise<Downloaded | null> {
    let job = this.jobs.get(url);
    if (!job) {
      job = this.download(url, depth).catch((e: unknown) => {
        this.failures.set(url, e instanceof Error ? e.message : String(e));
        return null;
      });
      this.jobs.set(url, job);
    }
    return job;
  }

  private async download(url: string, depth: number): Promise<Downloaded> {
    const key = createHash("sha256").update(url).digest("hex");
    const bin = join(this.cacheDir, `${key}.bin`);
    const metaFile = join(this.cacheDir, `${key}.json`);
    let bytes: Uint8Array;
    let type: string;
    let cached = false;
    if (existsSync(bin) && existsSync(metaFile)) {
      bytes = new Uint8Array(readFileSync(bin));
      type = (JSON.parse(readFileSync(metaFile, "utf8")) as { type: string }).type;
      cached = true;
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT);
      let res: Response;
      try {
        res = await this.doFetch(url, {
          headers: { "user-agent": BROWSER_UA, accept: "*/*" },
          redirect: "follow",
          signal: controller.signal,
        });
      } catch (e) {
        throw new Error(
          controller.signal.aborted
            ? `no answer in ${TIMEOUT / 1000}s`
            : e instanceof Error
              ? e.cause instanceof Error
                ? e.cause.message
                : e.message
              : String(e),
        );
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const length = Number(res.headers.get("content-length") ?? 0);
      if (length > MAX_BYTES) throw new Error(`larger than ${MAX_BYTES / 1024 / 1024} MB`);
      bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES)
        throw new Error(`larger than ${MAX_BYTES / 1024 / 1024} MB`);
      type = res.headers.get("content-type") ?? "application/octet-stream";
      mkdirSync(this.cacheDir, { recursive: true });
      writeFileSync(bin, bytes);
      writeFileSync(metaFile, JSON.stringify({ url, type, at: new Date().toISOString() }));
    }
    const file = assetFileName(url, type);
    if (file.endsWith(".css")) {
      // The stylesheet's own fonts and images, as copies beside it (relative: the sheet moves).
      const css = new TextDecoder().decode(bytes);
      const inner = depth < CSS_DEPTH ? findInCss(css, url) : [];
      const got = new Map<string, Downloaded>();
      await Promise.all(
        inner.map(async (u) => {
          const d = await this.get(u, depth + 1);
          if (d) got.set(u, d);
        }),
      );
      const rewritten = rewriteCss(
        css,
        (u) => {
          const d = got.get(u);
          return d ? posix.relative(posix.dirname(file), d.file) : null;
        },
        url,
      );
      bytes = new TextEncoder().encode(rewritten);
    }
    return { url, file, bytes, type, cached };
  }

  /** A module's code with its remote assets bundled. */
  async code(code: string): Promise<string> {
    const urls = findInCode(code);
    if (!urls.length) return code;
    const got = await this.all(urls);
    return rewriteCode(code, (u) => (got.get(u) ? this.publicUrl(got.get(u)!.file) : null));
  }

  /** A stylesheet of the bundle (`fileName` relative to dist) with its remote assets bundled. */
  async css(css: string, fileName: string): Promise<string> {
    const urls = findInCss(css);
    if (!urls.length) return css;
    const got = await this.all(urls);
    return rewriteCss(css, (u) => {
      const d = got.get(u);
      return d ? posix.relative(posix.dirname(fileName), d.file) || d.file : null;
    });
  }

  /** index.html: its links and images, never its meta tags (a preview needs the public URL). */
  async html(html: string): Promise<string> {
    const parts = html.split(/(<meta\b[^>]*>)/i);
    const out: string[] = [];
    for (const part of parts) {
      if (/^<meta\b/i.test(part)) {
        out.push(part);
        continue;
      }
      const urls = [
        ...[...part.matchAll(/\b(?:href|src|poster)\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi)].map(
          (m) => m[2]!,
        ),
        ...findInCss(part),
      ].filter(isBundlable);
      if (!urls.length) {
        out.push(part);
        continue;
      }
      const got = await this.all(urls);
      const local = (u: string) => (got.get(u) ? this.publicUrl(got.get(u)!.file) : null);
      out.push(
        rewriteCss(
          part.replace(
            /\b(href|src|poster)(\s*=\s*)(["'])(https?:\/\/[^"']+)\3/gi,
            (all, attr: string, eq: string, q: string, url: string) => {
              const to = local(url);
              return to ? `${attr}${eq}${q}${to}${q}` : all;
            },
          ),
          local,
        ),
      );
    }
    return out.join("");
  }

  /**
   * The `fonts:` stylesheets the runtime will ask for, as `{ remote: local }`. A family whose
   * weights Google refuses gets its no-weights retry's copy under both URLs.
   */
  async fonts(fonts: unknown): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    for (const sheet of resolveFonts(fonts).sheets) {
      const first = await this.get(sheet.href);
      if (first) {
        map[sheet.href] = this.publicUrl(first.file);
        continue;
      }
      const retry = sheet.retry ? await this.get(sheet.retry) : null;
      if (!retry) continue;
      // The runtime asks for the weights first: that URL gets the retry's copy too.
      this.failures.delete(sheet.href);
      map[sheet.href] = this.publicUrl(retry.file);
      map[sheet.retry!] = this.publicUrl(retry.file);
    }
    return map;
  }

  private async all(urls: string[]): Promise<Map<string, Downloaded>> {
    const got = new Map<string, Downloaded>();
    // A handful at a time: a deck of fifty Unsplash photos should not open fifty sockets.
    const queue = [...urls];
    const worker = async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        const d = await this.get(u);
        if (d) got.set(u, d);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker));
    return got;
  }

  /** Every copy made, by its dist-relative file name. */
  async files(): Promise<Map<string, Uint8Array>> {
    const out = new Map<string, Uint8Array>();
    for (const job of this.jobs.values()) {
      const d = await job;
      if (d) out.set(d.file, d.bytes);
    }
    return out;
  }

  /** One line for the build's output, and one per failure. */
  async summary(): Promise<string[]> {
    const done = (await Promise.all(this.jobs.values())).filter((d): d is Downloaded => !!d);
    if (!done.length && !this.failures.size) return [];
    const fromCache = done.filter((d) => d.cached).length;
    const bytes = done.reduce((n, d) => n + d.bytes.byteLength, 0);
    const lines = [
      `[deck] remote assets: ${done.length} bundled into ${DIR}/ (${(bytes / 1024 / 1024).toFixed(1)} MB, ${fromCache} from the cache)${this.failures.size ? `, ${this.failures.size} left remote` : ""}`,
    ];
    for (const [url, why] of [...this.failures].slice(0, 12))
      lines.push(`[deck]   left remote: ${url} (${why})`);
    if (this.failures.size > 12) lines.push(`[deck]   …and ${this.failures.size - 12} more`);
    return lines;
  }
}
