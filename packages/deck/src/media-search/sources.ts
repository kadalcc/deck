import { emojiSource, licenceLabel } from "../credits/model.ts";
import { memeLayout } from "./meme-layouts.ts";
import {
  defaultCaptions,
  emojiMdx,
  emojiStickerMdx,
  gifMdx,
  iconMdx,
  memeMdx,
  stickerMdx,
} from "./snippets.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MEDIA SOURCES, AS DATA  —  requests, answers and results, without the network
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The hosted builder's media panel, from the command line and the local MCP server: the same
 * sources, read the same way, and each result carries the MDX the panel would insert.
 *
 *   icon      Iconify search (api.iconify.design/search), sets whose licence lets an icon go in
 *             any deck; `<Icon name="set:name" size="1.5em" />`
 *   emoji     the emoji CDN's index (decks.kadal.cc/emoji/index.json: Fluent, Noto, Noto
 *             Animated, Twemoji), the builder's ranking; `<Emoji name set />`
 *   sticker   Kadal's stickers, KLIPY's stickers, and emoji as stickers (`<Sticker src>`)
 *   gif       Kadal's GIF loops and KLIPY's GIFs; `<Gif provider …>`
 *   meme      KLIPY's finished memes (as `<Gif>`, as the builder inserts them)
 *   template  Kadal's meme templates and Imgflip's top 100, with caption boxes; `<Meme>`
 *   kadal     everything in Kadal's own library
 *
 * KLIPY's integration rules (docs.klipy.com, as the builder's lib/klipy.ts has them) hold here
 * too: the person's machine asks api.klipy.com directly (never through a Kadal host), with the
 * host's public app key and the person's hashed `customer_id`, `content_filter=high` on every
 * request, results in KLIPY's order and composition (a slot this can't insert stays, with no
 * MDX), media hot-linked exactly as returned, the credit "via KLIPY", and the share trigger when
 * a result is used (`klipyShareRequest`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const MEDIA_KINDS = [
  "icon",
  "emoji",
  "sticker",
  "gif",
  "meme",
  "template",
  "kadal",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export type MediaProvider = "iconify" | "emoji" | "klipy" | "imgflip" | "kadal";

export interface MediaResult {
  provider: MediaProvider;
  /** What it is (a Kadal item can be any of these). */
  type: "icon" | "emoji" | "sticker" | "gif" | "meme" | "template" | "illustration";
  /** Stable per provider: "mdi:rocket", "party-popper", "gifs/hello-hi-662", "181913649", "kadal/ship-it". */
  id: string;
  title: string;
  /** A small picture of it (a thumbnail, the icon's SVG, the emoji's image). */
  preview: string | null;
  width: number | null;
  height: number | null;
  /** The inserted file's size, when the source says. */
  bytes: number | null;
  /** The credit it carries: "via KLIPY", "Twemoji — CC BY 4.0", "Kadal — CC BY 4.0". */
  attribution: string;
  licence: string;
  /** Its page at the source, or the set's. */
  link: string | null;
  /** What to put in the slide; null for a slot KLIPY holds that cannot be inserted. */
  mdx: string | null;
  /** For KLIPY: report the use with `media_used` / `kadal-deck media used klipy <id>`. */
  reportUse?: boolean;
}

// ── KLIPY ───────────────────────────────────────────────────────────────────────────────────

export const KLIPY_API = "https://api.klipy.com/api/v1";
export type KlipyKind = "gifs" | "stickers" | "static-memes";
export const KLIPY_KINDS: readonly KlipyKind[] = ["gifs", "stickers", "static-memes"];

export interface KlipyConfig {
  key: string;
  customerId: string;
  contentFilter?: string;
  locale?: string;
}

interface KlipyFile {
  url: string;
  width: number;
  height: number;
  size?: number;
}
type KlipySize = "hd" | "md" | "sm" | "xs";
type KlipyFormat = "gif" | "webp" | "mp4" | "jpg" | "png" | "webm";
export interface KlipyItem {
  /** A string: KLIPY's ids are past 2^53. */
  id: string;
  slug: string;
  title: string;
  type: string;
  files: Partial<Record<KlipySize, Partial<Record<KlipyFormat, KlipyFile>>>>;
  renderable: boolean;
}

const SIZES: KlipySize[] = ["hd", "md", "sm", "xs"];
const FORMATS: KlipyFormat[] = ["gif", "webp", "mp4", "jpg", "png", "webm"];

function klipyFile(v: unknown): KlipyFile | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.url !== "string" || !o.url.startsWith("https://")) return null;
  return {
    url: o.url,
    width: Number(o.width) || 0,
    height: Number(o.height) || 0,
    ...(typeof o.size === "number" ? { size: o.size } : {}),
  };
}

/** One entry of `data.data`, read defensively; an odd entry is `renderable: false`. */
export function parseKlipyItem(raw: unknown): KlipyItem {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const files: KlipyItem["files"] = {};
  const f = o.file && typeof o.file === "object" ? (o.file as Record<string, unknown>) : {};
  for (const s of SIZES) {
    const bySize = f[s] && typeof f[s] === "object" ? (f[s] as Record<string, unknown>) : null;
    if (!bySize) continue;
    for (const fmt of FORMATS) {
      const got = klipyFile(bySize[fmt]);
      if (got) (files[s] ??= {})[fmt] = got;
    }
  }
  const type = typeof o.type === "string" ? o.type : "";
  const item: KlipyItem = {
    id: o.id === undefined || o.id === null ? "" : String(o.id),
    slug: typeof o.slug === "string" ? o.slug : "",
    title: typeof o.title === "string" ? o.title : "",
    type,
    files,
    renderable: false,
  };
  item.renderable = type !== "ad" && !!item.slug && !!klipyThumb(item);
  return item;
}

/** A Search/Trending answer → its items, in KLIPY's order. */
export function parseKlipyPage(json: unknown): KlipyItem[] {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const d = (o.data && typeof o.data === "object" ? o.data : {}) as Record<string, unknown>;
  return (Array.isArray(d.data) ? d.data : []).map(parseKlipyItem);
}

/** The small file for a preview: sm WebP or GIF, else what there is. */
export function klipyThumb(item: Pick<KlipyItem, "files">): KlipyFile | null {
  for (const s of ["sm", "xs", "md", "hd"] as KlipySize[]) {
    const f = item.files[s];
    const got = f?.webp ?? f?.gif ?? f?.png ?? f?.jpg;
    if (got) return got;
  }
  return null;
}

/** The file a slide shows: hd (or md) WebP, then GIF, then a still for static memes. */
export function klipyFull(item: Pick<KlipyItem, "files">): KlipyFile | null {
  for (const s of ["hd", "md", "sm"] as KlipySize[]) {
    const f = item.files[s];
    const got = f?.webp ?? f?.gif ?? f?.png ?? f?.jpg;
    if (got) return got;
  }
  return klipyThumb(item);
}

/** A still frame (reduced motion), when KLIPY sends one. */
export function klipyStill(item: Pick<KlipyItem, "files">): KlipyFile | null {
  for (const s of ["md", "hd", "sm"] as KlipySize[]) {
    const got = item.files[s]?.jpg ?? item.files[s]?.png;
    if (got) return got;
  }
  return null;
}

/** Search (with a query) or Trending (without), with every parameter KLIPY's rules ask for. */
export function klipySearchUrl(
  cfg: KlipyConfig,
  kind: KlipyKind,
  q: string,
  perPage = 24,
  page = 1,
): string {
  const query = q.trim();
  const p = new URLSearchParams({
    page: String(page),
    per_page: String(Math.max(1, Math.min(50, Math.round(perPage)))),
    customer_id: cfg.customerId,
    content_filter: cfg.contentFilter || "high",
  });
  if (query) p.set("q", query);
  if (cfg.locale) p.set("locale", cfg.locale);
  return `${KLIPY_API}/${encodeURIComponent(cfg.key)}/${kind}/${query ? "search" : "trending"}?${p}`;
}

/** KLIPY's share trigger for a used result: how KLIPY counts a use. */
export function klipyShareRequest(
  cfg: KlipyConfig,
  kind: KlipyKind,
  slug: string,
  q = "",
): { url: string; init: RequestInit } {
  return {
    url: `${KLIPY_API}/${encodeURIComponent(cfg.key)}/${kind}/share/${encodeURIComponent(slug)}`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer_id: cfg.customerId, q: q.trim() }),
    },
  };
}

/** The item's page on klipy.com. */
export const klipyPage = (kind: KlipyKind, slug: string) =>
  `https://klipy.com/${kind === "static-memes" ? "memes" : kind}/${encodeURIComponent(slug)}`;

/** A result's id for KLIPY: `<kind>/<slug>` — what `media used` takes back. */
export const klipyRef = (kind: KlipyKind, slug: string) => `${kind}/${slug}`;

/** `gifs/hello-hi-662` (or a bare slug and a kind) → the kind and slug, or null. */
export function parseKlipyRef(
  id: string,
  kind?: KlipyKind,
): { kind: KlipyKind; slug: string } | null {
  const m = /^(gifs|stickers|static-memes)\/(.+)$/.exec(id.trim());
  if (m) return { kind: m[1] as KlipyKind, slug: m[2]! };
  const slug = id.trim();
  return slug && !slug.includes("/") ? { kind: kind ?? "gifs", slug } : null;
}

/** A KLIPY item as a result: `<Gif provider="klipy" …>`, exactly as the builder inserts it. */
export function klipyResult(item: KlipyItem, kind: KlipyKind): MediaResult {
  const full = klipyFull(item);
  const type = kind === "gifs" ? "gif" : kind === "stickers" ? "sticker" : "meme";
  return {
    provider: "klipy",
    type,
    id: klipyRef(kind, item.slug || item.id),
    title: item.title || item.slug || (kind === "static-memes" ? "meme" : "GIF"),
    preview: klipyThumb(item)?.url ?? null,
    width: full?.width || null,
    height: full?.height || null,
    bytes: full?.size ?? null,
    attribution: "via KLIPY",
    licence: "KLIPY API terms",
    link: item.slug ? klipyPage(kind, item.slug) : null,
    mdx:
      item.renderable && full
        ? gifMdx({
            provider: "klipy",
            id: item.id,
            slug: item.slug,
            src: full.url,
            still: kind === "static-memes" ? undefined : klipyStill(item)?.url,
            title: item.title || undefined,
            width: full.width || undefined,
            height: full.height || undefined,
          })
        : null,
    reportUse: true,
  };
}

// ── emoji ───────────────────────────────────────────────────────────────────────────────────

export const EMOJI_BASE = "https://decks.kadal.cc/emoji";
export const EMOJI_SET_NAMES = [
  "fluent-3d",
  "fluent-color",
  "fluent-flat",
  "noto",
  "noto-animated",
  "twemoji",
] as const;
export const DEFAULT_EMOJI_SET = "fluent-3d";

/** `--set fluent` and friends → a set the CDN serves, or null. */
export function emojiSetName(v: string | undefined): string | null {
  if (!v) return DEFAULT_EMOJI_SET;
  const s = v.trim().toLowerCase();
  if (s === "fluent") return "fluent-3d";
  if (s === "noto-animation" || s === "animated") return "noto-animated";
  return (EMOJI_SET_NAMES as readonly string[]).includes(s) ? s : null;
}

export interface EmojiEntry {
  /** name, e.g. "party-popper" */
  n: string;
  /** the character */
  c: string;
  /** the file key (codepoints) */
  k: string;
  /** category */
  g: string;
  /** keywords */
  w: string[];
  t?: string[];
  /** the sets that have it */
  s: string[];
}
export interface EmojiIndex {
  sets: Record<
    string,
    { label: string; license: string; by?: string; ext: string; still?: string }
  >;
  emoji: EmojiEntry[];
}

export function parseEmojiIndex(raw: unknown): EmojiIndex {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sets = (o.sets && typeof o.sets === "object" ? o.sets : {}) as EmojiIndex["sets"];
  const emoji = (Array.isArray(o.emoji) ? o.emoji : []).filter(
    (e): e is EmojiEntry =>
      !!e &&
      typeof e === "object" &&
      typeof (e as EmojiEntry).n === "string" &&
      typeof (e as EmojiEntry).k === "string" &&
      Array.isArray((e as EmojiEntry).s),
  );
  for (const e of emoji) if (!Array.isArray(e.w)) e.w = [];
  return { sets, emoji };
}

/** Ranked search over names and keywords (the builder's emoji-model.ts `searchEmoji`). */
export function searchEmoji(list: EmojiEntry[], q: string): EmojiEntry[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const dashed = needle.replace(/\s+/g, "-");
  const scored: [number, number, EmojiEntry][] = [];
  list.forEach((e, i) => {
    let s = -1;
    if (e.c === q.trim()) s = 0;
    else if (e.n === dashed) s = 1;
    else if (e.n.startsWith(dashed)) s = 2;
    else if (e.n.split("-").some((w) => w.startsWith(needle))) s = 3;
    else if (e.n.includes(dashed)) s = 4;
    else if (e.w.some((w) => w.toLowerCase() === needle)) s = 5;
    else if (e.w.some((w) => w.toLowerCase().startsWith(needle))) s = 6;
    else if (e.w.some((w) => w.toLowerCase().includes(needle))) s = 7;
    if (s >= 0) scored.push([s, i, e]);
  });
  return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
}

/**
 * The index's hand-picked "popular" run: the entries before its name-sorted tail (the builder's
 * emoji-model.ts `popularOf`) — what "trending" means for emoji.
 */
export function popularEmoji(list: EmojiEntry[]): EmojiEntry[] {
  const steps: number[] = [];
  for (let i = 1; i < list.length; i++)
    if (list[i - 1]!.n.localeCompare(list[i]!.n) > 0) steps.push(i);
  let k = 0;
  while (k + 1 < steps.length && steps[k + 1]! - steps[k]! <= 12) k++;
  return k >= 1 && steps[k]! >= 3 ? list.slice(0, steps[k]) : list.slice(0, 48);
}

export function emojiFileUrl(
  index: EmojiIndex,
  set: string,
  key: string,
  base = EMOJI_BASE,
): string {
  const ext = index.sets[set]?.ext ?? (set === "fluent-3d" || set === "noto" ? "png" : "svg");
  return `${base.replace(/\/+$/, "")}/${set}/${key}.${ext}`;
}

function emojiCredit(set: string) {
  const g = emojiSource(set);
  return {
    attribution: `${g.label} by ${g.by} — ${g.licence}`,
    licence: g.licence,
    link: g.url ?? null,
  };
}

/** An emoji as a result: `<Emoji name set />` inline, or (asSticker) its image as a `<Sticker>`. */
export function emojiResult(
  index: EmojiIndex,
  e: EmojiEntry,
  set: string,
  asSticker = false,
  base = EMOJI_BASE,
): MediaResult {
  const url = emojiFileUrl(index, set, e.k, base);
  const name = e.n.replace(/-/g, " ");
  return {
    provider: "emoji",
    type: asSticker ? "sticker" : "emoji",
    id: e.n,
    title: `${e.c} ${name}`,
    preview: url,
    width: null,
    height: null,
    bytes: null,
    ...emojiCredit(set),
    mdx: asSticker ? emojiStickerMdx(url, name) : emojiMdx({ name: e.n, set }),
  };
}

// ── Iconify ─────────────────────────────────────────────────────────────────────────────────

export const ICONIFY_API = "https://api.iconify.design";
/** The sets offered first, as in the builder. Lucide first: the engine's bare-name set. */
export const POPULAR_ICON_SETS = [
  "lucide",
  "tabler",
  "ph",
  "material-symbols",
  "mdi",
  "simple-icons",
  "logos",
  "fluent-emoji-flat",
  "twemoji",
  "noto",
];

export interface IconSetMeta {
  prefix: string;
  name: string;
  author?: string;
  licence?: { title?: string; spdx?: string; url?: string };
  palette: boolean;
  samples: string[];
}

/** Whether a set's licence lets an icon go in any deck (the builder's rule: no NC, no GPL). */
export function iconLicenceOk(spdx: string | undefined): boolean {
  const s = (spdx ?? "").toUpperCase();
  if (!s || /NC|GPL|PROPRIETARY/.test(s)) return false;
  return (
    /^CC-BY(-SA)?-\d/.test(s) ||
    /^(MIT|ISC|APACHE-2\.0|BSD-[23]-CLAUSE|CC0-1\.0|OFL-1\.1|MPL-2\.0|UNLICENSE)$/.test(s)
  );
}

export function parseIconSets(raw: unknown): Record<string, IconSetMeta> {
  const out: Record<string, IconSetMeta> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [prefix, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const author = r.author as { name?: unknown } | undefined;
    out[prefix] = {
      prefix,
      name: typeof r.name === "string" ? r.name : prefix,
      ...(author && typeof author.name === "string" ? { author: author.name } : {}),
      ...(r.license && typeof r.license === "object"
        ? { licence: r.license as IconSetMeta["licence"] }
        : {}),
      palette: r.palette === true,
      samples: Array.isArray(r.samples)
        ? r.samples.filter((s): s is string => typeof s === "string")
        : [],
    };
  }
  return out;
}

export function iconSearchUrl(q: string, limit = 64, prefix?: string): string {
  const p = new URLSearchParams({
    query: q.trim(),
    limit: String(Math.min(999, Math.max(32, limit))),
  });
  if (prefix) p.set("prefixes", prefix);
  return `${ICONIFY_API}/search?${p}`;
}

export const iconSetsUrl = (prefixes: string[]) =>
  `${ICONIFY_API}/collections?prefixes=${prefixes.map(encodeURIComponent).join(",")}`;

/** Iconify's search answer → names and the sets they came from, licence-checked. */
export function parseIconSearch(raw: unknown): {
  icons: string[];
  sets: Record<string, IconSetMeta>;
} {
  const r = (raw ?? {}) as { icons?: unknown; collections?: unknown };
  const sets = parseIconSets(r.collections);
  const icons = (Array.isArray(r.icons) ? r.icons : []).filter(
    (s): s is string =>
      typeof s === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(s) &&
      !!sets[s.split(":")[0]!] &&
      iconLicenceOk(sets[s.split(":")[0]!]!.licence?.spdx),
  );
  return { icons, sets };
}

/** An icon as a result: `<Icon name size="1.5em" />` (the builder's default size, no colour). */
export function iconResult(full: string, set: IconSetMeta | undefined): MediaResult {
  const [prefix, name] = full.split(":") as [string, string];
  const spdx = set?.licence?.spdx ?? "";
  const licence = spdx ? licenceLabel(spdx) : (set?.licence?.title ?? "");
  const by = set?.author ? ` by ${set.author}` : "";
  return {
    provider: "iconify",
    type: "icon",
    id: full,
    title: name.replace(/[-_]+/g, " "),
    preview: `${ICONIFY_API}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`,
    width: null,
    height: null,
    bytes: null,
    attribution: `${set?.name ?? prefix}${by}${licence ? ` — ${licence}` : ""}`,
    licence,
    link: `https://icon-sets.iconify.design/${prefix}/?icon-filter=${encodeURIComponent(name)}`,
    mdx: iconMdx({ name: prefix === "lucide" ? name : full, size: "1.5em" }),
  };
}

// ── Imgflip ─────────────────────────────────────────────────────────────────────────────────

export const IMGFLIP_API = "https://api.imgflip.com/get_memes";

export interface ImgflipTemplate {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  boxes: number;
}

export function parseImgflip(json: unknown): ImgflipTemplate[] {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  if (o.success !== true) return [];
  const d = (o.data && typeof o.data === "object" ? o.data : {}) as Record<string, unknown>;
  const out: ImgflipTemplate[] = [];
  for (const m of Array.isArray(d.memes) ? d.memes : []) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    if (typeof r.url !== "string" || !r.url.startsWith("https://i.imgflip.com/")) continue;
    out.push({
      id: String(r.id ?? ""),
      name: typeof r.name === "string" ? r.name : "Meme",
      url: r.url,
      width: Number(r.width) || 0,
      height: Number(r.height) || 0,
      boxes: Math.max(1, Math.min(6, Number(r.box_count) || 2)),
    });
  }
  return out;
}

/** The template's page on imgflip.com: the link back Imgflip asks for. */
export const imgflipPage = (t: Pick<ImgflipTemplate, "id" | "name">) =>
  `https://imgflip.com/meme/${t.id}/${t.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

/** The builder's filter: names containing the words. */
export const filterTemplates = (list: ImgflipTemplate[], q: string) => {
  const needle = q.trim().toLowerCase();
  return list.filter((t) => !needle || t.name.toLowerCase().includes(needle));
};

/** A template as a result: `<Meme>` with its caption boxes, as the meme editor opens it. */
export function imgflipResult(t: ImgflipTemplate): MediaResult {
  const page = imgflipPage(t);
  return {
    provider: "imgflip",
    type: "template",
    id: t.id,
    title: t.name,
    preview: t.url,
    width: t.width || null,
    height: t.height || null,
    bytes: null,
    attribution: "Template via imgflip.com",
    licence: "Imgflip API terms",
    link: page,
    mdx: memeMdx({
      src: t.url,
      alt: t.name,
      template: { provider: "imgflip", id: t.id, url: page, name: t.name },
      captions: memeLayout(t.id) ?? defaultCaptions(t.boxes),
      natural: { width: t.width, height: t.height },
    }),
  };
}

// ── Kadal's own library ─────────────────────────────────────────────────────────────────────

export interface KadalItem {
  id: string;
  kind: "sticker" | "gif" | "meme-template" | "illustration" | "emoji";
  title: string;
  tags: string[];
  animated: boolean;
  width: number;
  height: number;
  files: { main: string; gif?: string; still: string; svg?: string };
  captionBoxes?: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    align?: "top" | "bottom" | "center";
  }>;
  credit: "Kadal";
}
export interface KadalCatalog {
  version: string;
  items: KadalItem[];
}

const KADAL_KINDS = new Set(["sticker", "gif", "meme-template", "illustration", "emoji"]);

export function parseKadalCatalog(raw: unknown): KadalCatalog {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const version = typeof o.version === "string" ? o.version : String(o.version ?? "");
  const items: KadalItem[] = [];
  for (const it of Array.isArray(o.items) ? o.items : []) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const files = (r.files && typeof r.files === "object" ? r.files : {}) as Record<
      string,
      unknown
    >;
    // Paths go into URLs as listed: only plain relative ones (the host checks them too).
    const safe = (v: unknown): v is string =>
      typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(v) && !v.includes("..");
    if (
      typeof r.id !== "string" ||
      !/^kadal\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.id) ||
      !KADAL_KINDS.has(String(r.kind)) ||
      !safe(files.main) ||
      (files.still !== undefined && !safe(files.still))
    )
      continue;
    items.push({
      id: r.id,
      kind: r.kind as KadalItem["kind"],
      title: typeof r.title === "string" ? r.title : r.id.replace(/^kadal\//, ""),
      tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
      animated: r.animated === true,
      width: Number(r.width) || 0,
      height: Number(r.height) || 0,
      files: {
        main: files.main,
        still: typeof files.still === "string" ? files.still : files.main,
        ...(typeof files.gif === "string" ? { gif: files.gif } : {}),
        ...(typeof files.svg === "string" ? { svg: files.svg } : {}),
      },
      ...(Array.isArray(r.captionBoxes)
        ? {
            captionBoxes: r.captionBoxes.filter(
              (b): b is NonNullable<KadalItem["captionBoxes"]>[number] =>
                !!b &&
                typeof b === "object" &&
                ["x", "y", "w", "h"].every(
                  (k) => typeof (b as Record<string, unknown>)[k] === "number",
                ),
            ),
          }
        : {}),
      credit: "Kadal",
    });
  }
  return { version, items };
}

export const kadalCatalogUrl = (host: string) => `${host}/api/v1/media/kadal/catalog`;
/** A file's URL on the host (the host's `kadalFileUrl`: the version encoded, the path as listed). */
export const kadalFileUrl = (host: string, version: string, path: string) =>
  `${host.replace(/\/+$/, "")}/api/v1/media/kadal/files/${encodeURIComponent(version)}/${path}`;

/**
 * Ranked search by title, tags and slug, every word matching somewhere; empty: catalog order.
 * The host's own ranking (@stack/deck-ai media.ts `searchKadal`), so the CLI and the builder's
 * Kadal tab agree.
 */
export function searchKadal(items: readonly KadalItem[], q: string): KadalItem[] {
  const words = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (!words.length) return [...items];
  const scored: [number, number, KadalItem][] = [];
  items.forEach((it, i) => {
    const title = it.title.toLowerCase();
    const slug = it.id.slice("kadal/".length);
    const titleWords = title.split(/[^\p{L}\p{N}]+/u);
    const tags = it.tags.map((t) => t.toLowerCase());
    let total = 0;
    for (const w of words) {
      let s = 0;
      if (titleWords.includes(w)) s = 6;
      else if (tags.includes(w)) s = 5;
      else if (titleWords.some((t) => t.startsWith(w))) s = 4;
      else if (tags.some((t) => t.startsWith(w))) s = 3;
      else if (slug.includes(w) || title.includes(w)) s = 2;
      else if (tags.some((t) => t.includes(w)) || it.kind.includes(w)) s = 1;
      if (!s) return;
      total += s;
    }
    if (title === words.join(" ")) total += 10;
    scored.push([total, i, it]);
  });
  return scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[2]);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A Kadal template's caption boxes (fractions of the image) as `<Meme>` captions: one line sized
 * to the box's height, a bottom-aligned box with that line at its foot (the host's `kadalCaptions`).
 */
export function kadalCaptions(item: Pick<KadalItem, "captionBoxes" | "width" | "height">) {
  const boxes = item.captionBoxes ?? [];
  if (!boxes.length)
    return [
      { text: "Top text", x: 5, y: 3, width: 90 },
      { text: "Bottom text", x: 5, y: 80, width: 90 },
    ];
  const aspect = item.height / item.width;
  return boxes.map((b, i) => {
    const line = b.h * aspect * 100;
    const size = Math.max(3, Math.min(12, Math.round((line / 1.25) * 10) / 10));
    const lineH = (size * 1.1) / aspect;
    const top =
      b.align === "bottom"
        ? b.y * 100 + b.h * 100 - lineH
        : b.align === "center"
          ? b.y * 100 + (b.h * 100 - lineH) / 2
          : b.y * 100;
    return {
      text: boxes.length === 2 ? (i === 0 ? "Top text" : "Bottom text") : `Text ${i + 1}`,
      x: r2(b.x * 100),
      y: r2(Math.max(0, top)),
      width: r2(b.w * 100),
      size,
    };
  });
}

/** Default widths on the 1920-px stage, by kind (the host's). */
const KADAL_SIZE: Record<KadalItem["kind"], number> = {
  sticker: 360,
  emoji: 200,
  illustration: 640,
  gif: 640,
  "meme-template": 0,
};

/**
 * A Kadal item as a result, with the MDX the builder's Kadal tab inserts (the host's `kadalMdx`):
 * a GIF loop as `<Gif>`, a meme template as `<Meme>` with its caption boxes, the rest as a
 * `<Sticker>` centred on the stage — all `provider="kadal"` with the item's id.
 */
export function kadalResult(item: KadalItem, host: string, version: string): MediaResult {
  const url = (p: string) => kadalFileUrl(host, version, p);
  const main = url(item.files.main);
  const still = url(item.files.still);
  let mdx: string;
  let type: MediaResult["type"];
  if (item.kind === "gif") {
    type = "gif";
    mdx = gifMdx({
      provider: "kadal",
      id: item.id,
      src: main,
      still,
      title: item.title,
      width: item.width || undefined,
      height: item.height || undefined,
    });
  } else if (item.kind === "meme-template") {
    type = "template";
    mdx = memeMdx({
      extra: [
        ["provider", "kadal"],
        ["id", item.id],
      ],
      src: main,
      alt: item.title,
      template: { provider: "kadal", id: item.id, name: item.title },
      captions: kadalCaptions(item),
      natural: { width: item.width, height: item.height },
    });
  } else {
    type = item.kind === "illustration" ? "illustration" : "sticker";
    mdx = stickerMdx({
      provider: "kadal",
      id: item.id,
      src: main,
      still: item.animated ? still : undefined,
      alt: item.title,
      size: KADAL_SIZE[item.kind],
      aspect: item.width && item.height ? item.width / item.height : 1,
    });
  }
  return {
    provider: "kadal",
    type,
    id: item.id,
    title: item.title,
    preview: still,
    width: item.width || null,
    height: item.height || null,
    bytes: null,
    attribution: "Kadal — CC BY 4.0",
    licence: "CC BY 4.0",
    link: "https://kadal.cc",
    mdx,
  };
}
