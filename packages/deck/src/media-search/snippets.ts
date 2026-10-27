/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MDX A PICK INSERTS  —  the same strings the hosted builder's media panel writes
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Kept in step with the builder (apps/deck-app/src/lib/media-snippets.ts in the hosted service),
 * so a sticker found with `kadal-deck media search` goes in exactly as one picked in the panel:
 * the same attributes, in the same order, centred on the 1920×1080 stage the same way.
 *
 * Attribute values are JSX string literals when they are plain text and `{…}` expressions
 * otherwise (numbers, booleans, objects). A string that would break out of the quotes or start an
 * expression in MDX (`"`, `{`, `<`) goes in as a JSON string expression.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The stage the engine lays slides out on (DeckConfig width/height defaults). */
export const STAGE = { width: 1920, height: 1080 };

type AttrValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];

const round = (n: number) => Math.round(n * 100) / 100;

/** One JSX attribute, or "" when the value is absent. */
export function attr(name: string, value: AttrValue): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string")
    return /["{}<>\\\n\r]/.test(value)
      ? `${name}={${JSON.stringify(value)}}`
      : `${name}="${value}"`;
  if (typeof value === "number") return Number.isFinite(value) ? `${name}={${round(value)}}` : "";
  if (typeof value === "boolean") return value ? name : `${name}={false}`;
  return `${name}={${JSON.stringify(value)}}`;
}

function tag(name: string, attrs: Array<[string, AttrValue]>): string {
  const parts = attrs.map(([k, v]) => attr(k, v)).filter(Boolean);
  return `<${name}${parts.length ? ` ${parts.join(" ")}` : ""} />`;
}

export interface StickerInput {
  src: string;
  alt?: string;
  /** Width on the stage, px. */
  size?: number;
  /** The source's aspect (w/h), to centre it vertically. */
  aspect?: number;
  /** Kadal's own: `provider="kadal" id="kadal/…"` and the still for print. */
  provider?: string;
  id?: string;
  still?: string;
}

/** A sticker centred on the stage. */
export function stickerMdx({
  src,
  alt,
  size = 360,
  aspect = 1,
  provider,
  id,
  still,
}: StickerInput): string {
  const h = size / (aspect > 0 ? aspect : 1);
  const x = Math.round((STAGE.width - size) / 2);
  const y = Math.round((STAGE.height - h) / 2);
  return tag("Sticker", [
    ["provider", provider],
    ["id", id],
    ["src", src],
    ["still", still],
    ["alt", alt ?? ""],
    ["size", size],
    ["x", x],
    ["y", y],
  ]);
}

export interface EmojiInput {
  name?: string;
  char?: string;
  set: string;
  size?: string | number;
}

export function emojiMdx({ name, char, set, size }: EmojiInput): string {
  return tag("Emoji", [
    ["name", name],
    ["char", char],
    ["set", set],
    ["size", size],
  ]);
}

/** An emoji as a sticker: the image the CDN serves for it, placed like any sticker. */
export function emojiStickerMdx(url: string, alt: string, size = 320): string {
  return stickerMdx({ src: url, alt, size });
}

export interface GifInput {
  provider: string;
  id?: string | number;
  slug?: string;
  src: string;
  still?: string;
  title?: string;
  creator?: string;
  width?: number;
  height?: number;
}

export function gifMdx(g: GifInput): string {
  return tag("Gif", [
    ["provider", g.provider],
    ["id", g.id === undefined ? undefined : String(g.id)],
    ["slug", g.slug],
    ["src", g.src],
    ["still", g.still],
    ["title", g.title],
    ["creator", g.creator],
    ["width", g.width],
    ["height", g.height],
  ]);
}

export type Align = "left" | "center" | "right";
export interface Caption {
  text: string;
  /** Left edge, % of the image's width. */
  x: number;
  /** Top edge, % of the image's height. */
  y: number;
  /** % of the image's width. */
  width?: number;
  /** % of the meme's width. */
  size?: number;
  align?: Align;
  color?: string;
  stroke?: string;
}
export interface MemeTemplateRef {
  provider: string;
  id: string;
  url?: string;
  name?: string;
}
export interface MemeInput {
  src: string;
  alt?: string;
  template?: MemeTemplateRef;
  captions: Caption[];
  /** The image's own size: the meme goes in at most 820 px tall and 1200 px wide on the stage. */
  natural?: { width: number; height: number };
  /** Leading attributes (`provider`, `id` for a Kadal template). */
  extra?: Array<[string, AttrValue]>;
}

/** A width (stage px) that keeps a meme of this shape inside a 1920×1080 slide with room to spare. */
export function memeWidth(natural?: { width: number; height: number }): number | null {
  if (!natural || !natural.width || !natural.height) return null;
  return Math.round(Math.min(1200, (820 * natural.width) / natural.height));
}

/** Defaults the engine applies itself are left out, so the MDX stays short. */
function cleanCaption(c: Caption): Record<string, unknown> {
  const out: Record<string, unknown> = { text: c.text, x: round(c.x), y: round(c.y) };
  if (c.width !== undefined) out.width = round(c.width);
  if (c.size !== undefined && c.size !== 9) out.size = round(c.size);
  if (c.align && c.align !== "center") out.align = c.align;
  if (c.color && c.color.toLowerCase() !== "#fff" && c.color.toLowerCase() !== "#ffffff")
    out.color = c.color;
  if (c.stroke && c.stroke.toLowerCase() !== "#000" && c.stroke.toLowerCase() !== "#000000")
    out.stroke = c.stroke;
  return out;
}

export function memeMdx({ src, alt, template, captions, natural, extra }: MemeInput): string {
  const head = [
    ...(extra ?? []).map(([k, v]) => attr(k, v)),
    attr("src", src),
    attr("alt", alt ?? template?.name ?? ""),
  ].filter(Boolean);
  const width = memeWidth(natural);
  if (width) head.push(attr("width", width));
  if (template) head.push(attr("template", { ...template }));
  const caps = captions.filter((c) => c.text.trim()).map(cleanCaption);
  const list = caps.map((c) => `    ${JSON.stringify(c)},`).join("\n");
  return `<Meme\n  ${head.join("\n  ")}\n  captions={[\n${list}\n  ]}\n/>`;
}

export interface IconInput {
  /** `<Icon>`'s name: Lucide's bare ("rocket") or Iconify's `set:name`. */
  name: string;
  size?: string | number;
  color?: string;
  title?: string;
}

/** An icon, inline (it sits in a line of text and scales with it unless sized). */
export function iconMdx({ name, size, color, title }: IconInput): string {
  return tag("Icon", [
    ["name", name.replace(/^lucide:/, "")],
    ["size", size],
    ["color", color],
    ["title", title],
  ]);
}

/** The caption boxes a template without a layout gets (the builder's meme editor's rule). */
export function defaultCaptions(boxes: number): Caption[] {
  if (boxes <= 2)
    return [
      { text: "Top text", x: 5, y: 3, width: 90, size: 9 },
      { text: "Bottom text", x: 5, y: 80, width: 90, size: 9 },
    ].slice(0, Math.max(1, boxes));
  return Array.from({ length: boxes }, (_, i) => ({
    text: `Text ${i + 1}`,
    x: 5,
    y: Math.round((i * 90) / boxes) + 3,
    width: 90,
    size: 7,
  }));
}
