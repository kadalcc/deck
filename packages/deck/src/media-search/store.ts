import { KADAL_DECK_LICENCE } from "../credits/model.ts";
import { STAGE, attr, memeMdx, tag } from "./snippets.ts";
import { type MediaResult, kadalCaptions } from "./sources.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * KADAL STORE  —  its shelf for Kadal Deck, as results with MDX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every Kadal Deck user may place Kadal Store's items in a deck, free, under the store's Kadal
 * Deck licence (store.kadal.cc/licence/#kadal-deck): credited, with a link back to the store for
 * the files themselves. The deck host serves the shelf on its own origin, public, CORS `*`:
 *
 *   GET <host>/api/v1/media/store/search?q=&kinds=&size=&mdx=1   a page of elements; `mdx=1`
 *                                                                adds each one's MDX (and a
 *                                                                background's frontmatter)
 *   <host>/api/v1/media/store/files/<id>/<v>.<ext>               the web-ready file
 *   <host>/api/v1/media/store/files/<id>/<v>.still.<ext>         its still (poster)
 *
 * The contract is the hosted service's @stack/store-shelf, read defensively here. A result's MDX
 * is the host's own when it sends one — the builder's Kadal Store panel writes the same — and
 * otherwise `storeMdx` below, which follows the builder's table (@stack/deck-ai media.ts):
 * every tag ends `provider="kadal-store" id credit creditUrl license licenseUrl`, so
 * `<Credits />` lists it under Kadal Store. Patterns, wallpapers and shaders can go behind a
 * slide: their `frontmatter` is the slide's `background:` (a shader's only form). A LUT is the
 * attributes to add to an `<Image>` or a `<Video>`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const STORE_KINDS = [
  "image",
  "icon",
  "sticker",
  "illustration",
  "pattern",
  "wallpaper",
  "music",
  "sfx",
  "video",
  "lottie",
  "model",
  "shader",
  "lut",
  "gif",
  "meme-template",
] as const;
export type StoreKind = (typeof STORE_KINDS)[number];

export const STORE_LICENCE = {
  label: KADAL_DECK_LICENCE,
  url: "https://store.kadal.cc/licence/#kadal-deck",
  store: "https://store.kadal.cc",
} as const;

export interface StorePart {
  ext: string;
  contentType: string;
  bytes: number;
  width?: number;
  height?: number;
}

/** A shelf element, as much of it as a deck needs. */
export interface StoreElement extends StorePart {
  id: string;
  kind: StoreKind;
  title: string;
  alt: string;
  tags: string[];
  product: { slug: string; name: string; category: string; url: string };
  v: string;
  durationMs?: number;
  still?: StorePart;
  alpha?: boolean;
  loop?: boolean;
  captionBoxes?: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    align?: "top" | "bottom" | "center";
  }>;
  pro: boolean;
  /** The host's MDX for it (`mdx=1`): exactly what the builder inserts. */
  mdx?: string;
  /** The host's frontmatter that puts it behind a slide (a pattern, a wallpaper, a shader). */
  frontmatter?: string;
}

const ID = /^kse_[a-z2-7]{20}$/;
const V = /^[0-9a-f]{12}$/;
const EXT = /^[a-z0-9]{1,8}$/;

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function part(v: unknown): StorePart | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const ext = s(o.ext).toLowerCase();
  if (!EXT.test(ext)) return null;
  return {
    ext,
    contentType: s(o.contentType),
    bytes: n(o.bytes) ?? 0,
    ...(n(o.width) ? { width: n(o.width) } : {}),
    ...(n(o.height) ? { height: n(o.height) } : {}),
  };
}

/** The shelf's answer (`{ items }`, or a bare list), keeping only elements a deck can address. */
export function parseStorePage(raw: unknown): { items: StoreElement[]; total: number } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(raw) ? raw : Array.isArray(o.items) ? o.items : [];
  const items: StoreElement[] = [];
  for (const it of list) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const main = part(r);
    const kind = s(r.kind) as StoreKind;
    const p = (r.product && typeof r.product === "object" ? r.product : {}) as Record<
      string,
      unknown
    >;
    if (!main || !ID.test(s(r.id)) || !V.test(s(r.v)) || !STORE_KINDS.includes(kind)) continue;
    const still = part(r.still);
    items.push({
      ...main,
      id: s(r.id),
      kind,
      title: s(r.title) || s(p.name) || s(r.id),
      alt: s(r.alt),
      tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
      product: {
        slug: s(p.slug),
        name: s(p.name),
        category: s(p.category),
        url: s(p.url),
      },
      v: s(r.v),
      ...(n(r.durationMs) ? { durationMs: n(r.durationMs) } : {}),
      ...(still ? { still } : {}),
      ...(r.alpha === true ? { alpha: true } : {}),
      ...(typeof r.loop === "boolean" ? { loop: r.loop } : {}),
      ...(Array.isArray(r.captionBoxes)
        ? { captionBoxes: r.captionBoxes as NonNullable<StoreElement["captionBoxes"]> }
        : {}),
      pro: r.pro === true,
      ...(typeof r.mdx === "string" && r.mdx.trim() ? { mdx: r.mdx } : {}),
      ...(typeof r.frontmatter === "string" && r.frontmatter.trim()
        ? { frontmatter: r.frontmatter }
        : {}),
    });
  }
  return { items, total: n(o.total) ?? items.length };
}

export const storeSearchUrl = (
  host: string,
  q: string,
  o: { kind?: StoreKind; size?: number } = {},
) => {
  const u = new URL(`${host.replace(/\/+$/, "")}/api/v1/media/store/search`);
  u.searchParams.set("q", q);
  if (o.kind) u.searchParams.set("kinds", o.kind);
  if (o.size) u.searchParams.set("size", String(o.size));
  // The host's own snippets: the MDX the builder writes.
  u.searchParams.set("mdx", "1");
  return u.toString();
};

/** An element's file on the deck host: the main file, or its still. */
export function storeFileUrl(
  host: string,
  el: Pick<StoreElement, "id" | "v" | "ext" | "still">,
  still = false,
): string {
  const base = `${host.replace(/\/+$/, "")}/api/v1/media/store/files/${el.id}/${el.v}`;
  return still && el.still ? `${base}.still.${el.still.ext}` : `${base}.${el.ext}`;
}

/** The product's store page with Deck's referral marker. */
export const storeProductUrl = (slug: string, ref = "deck-credits") =>
  `${STORE_LICENCE.store}/p/${encodeURIComponent(slug)}?ref=${encodeURIComponent(ref)}`;

/** "Indigo · Seigaiha Waves Pattern": the piece, then the product it is from (once if the same). */
export function storeCreditLine(el: Pick<StoreElement, "title" | "product">): string {
  const piece = el.title.trim();
  const product = el.product.name.trim();
  if (!product || piece === product) return piece || product;
  if (!piece) return product;
  return `${piece} · ${product}`;
}

/** The credit attributes every placed store element ends with, in the builder's order. */
export function storeCreditAttrs(
  el: Pick<StoreElement, "id" | "title" | "product">,
): Array<[string, string]> {
  return [
    ["provider", "kadal-store"],
    ["id", el.id],
    ["credit", storeCreditLine(el)],
    ["creditUrl", el.product.slug ? storeProductUrl(el.product.slug) : STORE_LICENCE.store],
    ["license", STORE_LICENCE.label],
    ["licenseUrl", STORE_LICENCE.url],
  ];
}

/** Default widths on the 1920-px stage for what goes in as a `<Sticker>` (the builder's). */
const STICKER_WIDTH: Partial<Record<StoreKind, number>> = {
  sticker: 360,
  icon: 200,
  illustration: 640,
  gif: 640,
};

/** A pattern's tile on the 1920-px stage (the builder's). */
export const PATTERN_TILE = 480;

/** The `background:` mapping that puts a pattern, a wallpaper or a shader behind a slide. */
export function storeBackground(host: string, el: StoreElement): Record<string, string> | null {
  const credit = Object.fromEntries(storeCreditAttrs(el));
  if (el.kind === "shader")
    return {
      component: "pro/shader",
      shader: el.id,
      ...(el.still ? { poster: storeFileUrl(host, el, true) } : {}),
      ...credit,
    };
  if (el.pro) return null;
  if (el.kind === "pattern")
    return {
      image: storeFileUrl(host, el),
      size: `${PATTERN_TILE}px`,
      repeat: "repeat",
      ...credit,
    };
  if (el.kind === "wallpaper") return { image: storeFileUrl(host, el), size: "cover", ...credit };
  return null;
}

/** A YAML scalar: a plain word stays plain, anything YAML could misread is JSON (valid YAML). */
const yamlScalar = (v: string) =>
  /^[A-Za-z][\w .,/-]*$/.test(v) && !/^(true|false|null|yes|no|on|off)$/i.test(v)
    ? v
    : JSON.stringify(v);

/** The slide frontmatter that puts an element behind the slide, or "" for a kind that can't. */
export function storeFrontmatter(host: string, el: StoreElement): string {
  const bg = storeBackground(host, el);
  if (!bg) return "";
  const lines = Object.entries(bg).map(([k, v]) => `  ${k}: ${yamlScalar(v)}`);
  return ["---", "background:", ...lines, "---"].join("\n");
}

/**
 * The MDX one element goes in as, as the builder writes it: a sound as `<Audio>`, a clip as
 * `<Video>`, a Lottie, a model, a meme template, a picture as `<Image>` (a pattern or a wallpaper
 * too, beside its frontmatter), anything else placed over the slide as a `<Sticker>`; a shader
 * only as its frontmatter, a LUT as attributes (pure; tested).
 */
export function storeMdx(host: string, el: StoreElement): string {
  const main = storeFileUrl(host, el);
  const still = el.still ? storeFileUrl(host, el, true) : undefined;
  const credit = storeCreditAttrs(el);
  const page = credit[3]![1];
  const alt = el.alt || el.title;
  switch (el.kind) {
    case "shader":
      return storeFrontmatter(host, el);
    case "lut":
      return [
        attr("lut", main),
        attr("lutCredit", storeCreditLine(el)),
        attr("lutCreditUrl", page),
      ].join(" ");
    case "music":
    case "sfx":
      return tag("Audio", [
        ["src", main],
        ["title", el.title],
        ["loop", el.kind === "music" && el.loop ? true : undefined],
        ...credit,
      ]);
    case "video":
      return tag("Video", [
        ["src", main],
        ["poster", still],
        ["autoplay", true],
        ["loop", el.loop ? true : undefined],
        ["muted", true],
        ["title", el.title],
        ...credit,
      ]);
    case "lottie":
      return tag("Lottie", [
        ["src", main],
        ["poster", still],
        ["loop", el.loop !== false],
        ["autoplay", true],
        ["alt", alt],
        ...credit,
      ]);
    case "model":
      return tag("Model", [["src", main], ["poster", still], ["alt", alt], ...credit]);
    case "meme-template":
      return memeMdx({
        extra: credit,
        src: main,
        alt,
        template: { provider: "kadal-store", id: el.id, url: page, name: el.title },
        captions: kadalCaptions({
          captionBoxes: el.captionBoxes,
          width: el.width ?? 1,
          height: el.height ?? 1,
        }),
        natural: el.width && el.height ? { width: el.width, height: el.height } : undefined,
      });
    case "image":
    case "wallpaper":
    case "pattern":
      return tag("Image", [["src", main], ["alt", alt], ...credit]);
    default: {
      // sticker, icon, illustration, gif: placed over the slide, centred.
      const w = STICKER_WIDTH[el.kind] ?? 360;
      const aspect = el.width && el.height ? el.height / el.width : 1;
      return tag("Sticker", [
        ["src", main],
        ["still", still && el.ext !== "svg" ? still : undefined],
        ["alt", alt],
        ["size", w],
        ["x", Math.round((STAGE.width - w) / 2)],
        ["y", Math.round((STAGE.height - w * aspect) / 2)],
        ...credit,
      ]);
    }
  }
}

/** An element as a search result: the host's MDX when it sent it, else the same, made here. */
export function storeResult(el: StoreElement, host: string): MediaResult {
  const mdx = el.mdx ?? storeMdx(host, el);
  const frontmatter = el.frontmatter ?? storeFrontmatter(host, el);
  const picture = /^(png|jpe?g|webp|gif|avif|svg)$/.test(el.ext) && !el.pro;
  return {
    provider: "kadal-store",
    type: (el.kind === "meme-template" ? "template" : el.kind) as MediaResult["type"],
    id: el.id,
    title: storeCreditLine(el),
    preview: el.still ? storeFileUrl(host, el, true) : picture ? storeFileUrl(host, el) : null,
    width: el.width ?? null,
    height: el.height ?? null,
    bytes: el.bytes || null,
    attribution: `Kadal Store — ${KADAL_DECK_LICENCE}`,
    licence: KADAL_DECK_LICENCE,
    link: el.product.slug ? storeProductUrl(el.product.slug) : STORE_LICENCE.store,
    mdx: mdx || null,
    ...(frontmatter ? { frontmatter } : {}),
  };
}

/** Store kinds a `kadal-deck media search store --type …` may narrow to. */
export const isStoreKind = (v: unknown): v is StoreKind =>
  typeof v === "string" && (STORE_KINDS as readonly string[]).includes(v);
