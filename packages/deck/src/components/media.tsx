import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { readHostOverride, roomIdOf } from "../core/model.ts";
import { useDeck } from "../react/context.ts";
import { useRenderContext } from "../react/render-context.ts";
import { loadExtraFont } from "../theming/react.tsx";
import { Drag } from "./Drag.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * STICKERS, EMOJI, GIFS AND MEMES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <Sticker src="/stickers/rocket.webp" x={1500} y={120} size={260} rotate={-8} />
 *   <Emoji name="party-popper" />  <Emoji char="👍🏽" set="twemoji" size={96} />
 *   <Gif provider="klipy" slug="hello-hi-662" src="https://static.klipy.com/…" title="Hello" />
 *   <Meme src="https://i.imgflip.com/30b1gx.jpg" template={{ provider: "imgflip", id: "181913649",
 *     url: "https://imgflip.com/memetemplate/181913649" }} captions={[{ text: "Slides", x: 52, y: 8 }]} />
 *
 * Sticker   an image over the slide, in stage pixels. A drag site of its own (remark-drag.ts), so in
 *           `kadal-deck dev` a double-click moves, resizes and turns it and the first move writes
 *           `pos="x,y,w,h,r"` onto the tag — `x`/`y`/`size`/`rotate` are only where it starts.
 *           Animated GIF, WebP and APNG play as they are.
 * Emoji     one emoji from an open image set, by `char` (exact: its codepoints are the file name)
 *           or by `name` (the host's index resolves it). The sets live on a host —
 *           `window.__KADAL_DECK__.emoji`, else https://decks.kadal.cc/emoji — so a deck built
 *           anywhere still finds them. Noto's animated set is a still under reduced motion and in
 *           print. The licences are the sets' own (Fluent MIT, Noto Apache-2.0 / CC BY 4.0,
 *           Twemoji CC BY 4.0); the host's credits page carries the notices.
 * Gif       a GIF from a provider, hot-linked exactly as the provider returned it. Never copied:
 *           printing, the PDF, PNG and PPTX exports draw a card with its title and a link instead,
 *           because the providers' terms don't allow keeping or re-hosting their media.
 * Meme      image-macro captions (Anton, through the font system: white with a black outline)
 *           over an image, as real text. `template` records where the picture came from and shows
 *           the link back ("Template via imgflip.com") on hover and in every export.
 *
 * `provider="kadal"` marks an item from Kadal's own library (stickers, GIF loops, meme templates:
 * `kadal-deck media search kadal …`). It is credited "Kadal", and because it is ours to copy, print
 * and the exports draw it (its `still`) where a provider's GIF gets a card. Every attributed item
 * is also listed by `<Credits />` (credits/model.ts reads these tags when the deck compiles).
 *
 * A host that takes reports sets `window.__KADAL_DECK__.mediaReport` (a URL): each of these then
 * offers "Report" on hover, pointing there with the deck's room and the media's address.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── shared ──────────────────────────────────────────────────────────────────────────────────

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (on: () => void) => {
  const mq = typeof window !== "undefined" ? window.matchMedia?.(REDUCED) : undefined;
  mq?.addEventListener?.("change", on);
  return () => mq?.removeEventListener?.("change", on);
};
/** prefers-reduced-motion, kept current; false where there is no window (SSR, tests). */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => (typeof window !== "undefined" && window.matchMedia?.(REDUCED).matches) || false,
    () => false,
  );
}

const isWebUrl = (s: unknown): s is string => typeof s === "string" && /^https?:\/\/\S+$/i.test(s);
const cls = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

/**
 * Where the host takes reports about media in a published deck, or null: an http(s) URL or a
 * same-site path. Read from the global itself — it concerns these components only.
 */
export function readMediaReport(scope: unknown = globalThis): string | null {
  const raw = (scope as { __KADAL_DECK__?: { mediaReport?: unknown } } | null)?.__KADAL_DECK__
    ?.mediaReport;
  return typeof raw === "string" && /^(https?:\/\/[^\s"'<>]+|\/(?!\/)[\w./-]*)$/.test(raw)
    ? raw
    : null;
}

/** The report link for one piece of media: the host's page, with the room and the address. */
export function mediaReportHref(base: string, room: string, src: string): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}deck=${encodeURIComponent(room)}&src=${encodeURIComponent(src)}`;
}

function useReportHref(src: string | undefined): string | null {
  const deck = useDeck();
  const where = useRenderContext();
  const base = readMediaReport();
  if (!base || !src || where.print) return null;
  return mediaReportHref(base, roomIdOf(deck.config), src);
}

/** The small line that appears on hover: a credit and, on a host that takes them, "Report". */
function HoverCredit({ children, report }: { children?: ReactNode; report: string | null }) {
  if (!children && !report) return null;
  return (
    <span className="deck-media-credit">
      {children}
      {report ? (
        <a className="deck-media-report" href={report} target="_blank" rel="noopener noreferrer">
          Report
        </a>
      ) : null}
    </span>
  );
}

// ── <Sticker> ───────────────────────────────────────────────────────────────────────────────

export interface StickerProps {
  src: string;
  alt?: string;
  /** Width in stage pixels (default 240); the height follows the image. */
  size?: number;
  /** Left edge in stage pixels (default: centred). */
  x?: number;
  /** Top edge in stage pixels (default: centred). */
  y?: number;
  /** Degrees, clockwise. */
  rotate?: number;
  /** Mirror it: true or "x" left↔right, "y" upside down. */
  flip?: boolean | "x" | "y";
  /** A soft drop shadow that follows the image's outline. */
  shadow?: boolean;
  /** "x,y,w,h[,r]" — what dragging it in `kadal-deck dev` writes; wins over x/y/size/rotate. */
  pos?: string;
  /** Where it came from: "kadal" for Kadal's own library (credited "Kadal"). */
  provider?: string;
  /** The provider's id for it ("kadal/ship-it"). Without a provider, `id` is the element's id. */
  id?: string;
  /** A still frame of an animated sticker: shown under reduced motion and in print. */
  still?: string;
  /** A credit of its own ("Photo by Ana Ruiz"), on hover and in the deck's credits. */
  credit?: string;
  /** The credit's link (the work's page). */
  creditUrl?: string;
  /** Its licence ("CC BY 4.0"), for the credits. */
  license?: string;
  licenseUrl?: string;
  className?: string;
  style?: CSSProperties;
  [key: string]: unknown;
}

/** Where a sticker starts: its x/y, or centred on a `width`×`height` stage. */
export function stickerPlace(
  p: Pick<StickerProps, "x" | "y" | "size" | "rotate">,
  stage: { width: number; height: number },
): string {
  const size = Number.isFinite(p.size) && p.size! > 0 ? Math.round(p.size!) : 240;
  const x = Number.isFinite(p.x) ? Math.round(p.x!) : Math.round((stage.width - size) / 2);
  const y = Number.isFinite(p.y) ? Math.round(p.y!) : Math.round((stage.height - size) / 2);
  const r = Number.isFinite(p.rotate) ? Number(p.rotate) : 0;
  return `${x},${y},${size},_${r ? `,${r}` : ""}`;
}

const flipOf = (flip: StickerProps["flip"]) =>
  flip === "y" ? "scaleY(-1)" : flip === true || flip === "x" ? "scaleX(-1)" : undefined;

/** The words and link a sticker is credited with on hover, or null. */
export function stickerCredit(
  p: Pick<StickerProps, "provider" | "credit" | "creditUrl">,
): { label: string; href: string | null } | null {
  if (typeof p.credit === "string" && p.credit.trim())
    return { label: p.credit.trim(), href: isWebUrl(p.creditUrl) ? p.creditUrl : null };
  if (typeof p.provider === "string" && p.provider.toLowerCase() === "kadal")
    return { label: "Kadal", href: KADAL_URL };
  return null;
}

/** Kadal's own media: credited "Kadal", linked here. */
export const KADAL_URL = "https://kadal.cc";

export function Sticker({
  src,
  alt = "",
  size,
  x,
  y,
  rotate,
  flip,
  shadow,
  pos,
  provider,
  id,
  still,
  credit,
  creditUrl,
  license: _license,
  licenseUrl: _licenseUrl,
  className,
  style,
  ...rest
}: StickerProps) {
  const deck = useDeck();
  const where = useRenderContext();
  const reduced = useReducedMotion();
  const report = useReportHref(src);
  const own = stickerCredit({ provider, credit, creditUrl });
  const shown = still && (reduced || where.print) ? still : src;
  const place = stickerPlace(
    { x, y, size, rotate },
    { width: deck.config.width || 1920, height: deck.config.height || 1080 },
  );
  return (
    <Drag
      {...rest}
      {...(id && !provider ? { id } : {})}
      pos={pos}
      place={place}
      className={cls("deck-sticker", shadow && "has-shadow", className)}
      style={style}
    >
      <img
        className="deck-sticker-img"
        src={shown}
        alt={alt}
        draggable={false}
        decoding="async"
        style={flip ? { transform: flipOf(flip) } : undefined}
      />
      <HoverCredit report={report}>
        {own ? (
          own.href ? (
            <a href={own.href} target="_blank" rel="noopener noreferrer">
              {own.label}
            </a>
          ) : (
            <span>{own.label}</span>
          )
        ) : null}
      </HoverCredit>
    </Drag>
  );
}

// ── <Emoji> ─────────────────────────────────────────────────────────────────────────────────

/** The image sets the host serves, and each one's file type (`still`: under reduced motion/print). */
export const EMOJI_SETS = {
  "fluent-3d": { ext: "png" },
  "fluent-color": { ext: "svg" },
  "fluent-flat": { ext: "svg" },
  noto: { ext: "png" },
  "noto-animated": { ext: "webp", still: "png" },
  twemoji: { ext: "svg" },
} as const satisfies Record<string, { ext: string; still?: string }>;
export type EmojiSet = keyof typeof EMOJI_SETS;
export const DEFAULT_EMOJI_SET: EmojiSet = "fluent-3d";
export const DEFAULT_EMOJI_BASE = "https://decks.kadal.cc/emoji";

/**
 * An emoji's file name: its codepoints in lowercase hex joined by "-", with every U+FE0F
 * (variation selector 16) left out — the one rule the host's emoji script names its files by, so
 * "❤️" and "❤" are the same file and a ZWJ sequence keeps its U+200D joiners.
 */
export function emojiKey(char: string): string {
  return [...char.trim()]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((h) => h !== "fe0f")
    .join("-");
}

/** A name as the host's index spells it: "Party Popper", ":party_popper:" → "party-popper". */
export function emojiSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^:|:$/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const isEmojiSet = (s: unknown): s is EmojiSet =>
  typeof s === "string" && Object.prototype.hasOwnProperty.call(EMOJI_SETS, s);

/** The image for an emoji, or null with neither a char nor a usable name. */
export function emojiUrl(o: {
  base?: string | null;
  set?: string;
  name?: string;
  char?: string;
  /** A still image (reduced motion, print) where the set is animated. */
  still?: boolean;
}): string | null {
  const set: EmojiSet = isEmojiSet(o.set) ? o.set : DEFAULT_EMOJI_SET;
  const kind = EMOJI_SETS[set] as { ext: string; still?: string };
  const ext = o.still && kind.still ? kind.still : kind.ext;
  const key = o.char?.trim() ? emojiKey(o.char) : o.name ? emojiSlug(o.name) : "";
  if (!key) return null;
  const base = (o.base || DEFAULT_EMOJI_BASE).replace(/\/+$/, "");
  return `${base}/${set}/${key}.${ext}`;
}

export interface EmojiProps {
  /** Its name in the host's index ("party-popper"); `char` wins when both are given. */
  name?: string;
  /** The emoji itself ("🎉", "👍🏽"): exact, no lookup. Children work too: <Emoji>🎉</Emoji>. */
  char?: string;
  set?: EmojiSet;
  /** CSS size (a number is px). Default 1.2em: it sits in a line of text. */
  size?: number | string;
  alt?: string;
  className?: string;
  children?: ReactNode;
}

export function Emoji({ name, char, set, size = "1.2em", alt, className, children }: EmojiProps) {
  const where = useRenderContext();
  const reduced = useReducedMotion();
  const [broken, setBroken] = useState(false);
  const glyph = char ?? (typeof children === "string" ? children : undefined);
  const src = emojiUrl({
    base: readHostOverride()?.emoji,
    set,
    name,
    char: glyph,
    still: reduced || where.print,
  });
  const label = alt ?? (name ? emojiSlug(name).replace(/-/g, " ") : (glyph ?? ""));
  const dim = typeof size === "number" ? `${size}px` : size;
  // A missing file (an emoji newer than the set) falls back to the font's own glyph.
  if (!src || broken)
    return (
      <span className={cls("deck-emoji", "is-text", className)} role="img" aria-label={label}>
        {glyph ?? `:${name ?? "?"}:`}
      </span>
    );
  return (
    <img
      className={cls("deck-emoji", className)}
      src={src}
      alt={label}
      draggable={false}
      decoding="async"
      style={{ width: dim, height: dim }}
      onError={() => setBroken(true)}
    />
  );
}

// ── <Gif> ───────────────────────────────────────────────────────────────────────────────────

const PROVIDERS: Record<string, { label: string; page: (slug?: string, id?: string) => string }> = {
  kadal: { label: "Kadal", page: () => KADAL_URL },
  klipy: {
    label: "KLIPY",
    page: (slug) =>
      slug ? `https://klipy.com/gifs/${encodeURIComponent(slug)}` : "https://klipy.com",
  },
  giphy: {
    label: "GIPHY",
    page: (_slug, id) =>
      id ? `https://giphy.com/gifs/${encodeURIComponent(id)}` : "https://giphy.com",
  },
};

export interface GifProps {
  /** Who it came from: "klipy" (default), "kadal" (Kadal's own library), "giphy". */
  provider?: string;
  id?: string;
  slug?: string;
  /** The media URL exactly as the provider returned it (GIF, WebP, or MP4/WebM). */
  src: string;
  title?: string;
  creator?: string;
  width?: number;
  height?: number;
  /** A still frame from the provider, shown under reduced motion. */
  still?: string;
  /** The page to link to in the credit and the export card (default: the provider's page for it). */
  href?: string;
  alt?: string;
  className?: string;
}

/** What an export draws instead of the GIF: the words and the link. */
export function gifPlaceholder(p: Pick<GifProps, "provider" | "id" | "slug" | "title" | "href">) {
  const key = (p.provider || "klipy").toLowerCase();
  const known = PROVIDERS[key];
  const provider = known?.label ?? key.charAt(0).toUpperCase() + key.slice(1);
  const href = isWebUrl(p.href) ? p.href : (known?.page(p.slug, p.id) ?? null);
  const title = p.title?.trim() || "untitled";
  return { provider, href, title, label: `GIF: ${title} — via ${provider}` };
}

/**
 * How a GIF is drawn here: the export card, a still, a looping video, or the image itself. In
 * print a provider's GIF is a card (its terms forbid copies); Kadal's own (`own`) is drawn, still
 * first.
 */
export function gifMode(p: {
  src: string;
  still?: string;
  print: boolean;
  reduced: boolean;
  own?: boolean;
}): "card" | "still" | "video" | "image" {
  if (p.print && !p.own) return "card";
  if (p.print && p.still) return "still";
  if (p.reduced && p.still) return "still";
  return /\.(mp4|webm)(?:[?#]|$)/i.test(p.src) ? "video" : "image";
}

export function Gif({
  provider = "klipy",
  id,
  slug,
  src,
  title,
  creator,
  width,
  height,
  still,
  href,
  alt,
  className,
}: GifProps) {
  const where = useRenderContext();
  const reduced = useReducedMotion();
  const report = useReportHref(src);
  const info = gifPlaceholder({ provider, id, slug, title, href });
  const mode = gifMode({
    src,
    still,
    print: where.print,
    reduced,
    own: provider.toLowerCase() === "kadal",
  });
  const ratio = width && height ? `${width} / ${height}` : undefined;
  if (mode === "card")
    return (
      <span className={cls("deck-gif-card", className)} style={{ aspectRatio: ratio, width }}>
        <span className="deck-gif-card-label">{info.label}</span>
        {info.href ? (
          <a className="deck-gif-card-link" href={info.href}>
            {info.href}
          </a>
        ) : null}
      </span>
    );
  const label = alt ?? (title ? `${title} (GIF via ${info.provider})` : `GIF via ${info.provider}`);
  return (
    <span className={cls("deck-gif", className)} style={{ aspectRatio: ratio, width }}>
      {mode === "video" ? (
        <video
          src={src}
          poster={still}
          autoPlay={!reduced}
          loop
          muted
          playsInline
          aria-label={label}
          width={width}
          height={height}
        />
      ) : (
        <img
          src={mode === "still" ? still : src}
          alt={label}
          width={width}
          height={height}
          draggable={false}
          decoding="async"
          loading="lazy"
        />
      )}
      <HoverCredit report={report}>
        {info.href ? (
          <a href={info.href} target="_blank" rel="noopener noreferrer">
            via {info.provider}
          </a>
        ) : (
          <span>via {info.provider}</span>
        )}
        {title || creator ? (
          <span className="deck-media-credit-title">
            {[title, creator && `by ${creator}`].filter(Boolean).join(" ")}
          </span>
        ) : null}
      </HoverCredit>
    </span>
  );
}

// ── <Meme> ──────────────────────────────────────────────────────────────────────────────────

export interface MemeCaption {
  text: string;
  /** Left edge, % of the image's width (default 5). */
  x?: number;
  /** Top edge, % of the image's height (default 4). */
  y?: number;
  /** Box width, % of the image's width (default 90). */
  width?: number;
  /** Letter size, % of the image's width (default 9). */
  size?: number;
  align?: "left" | "center" | "right";
  color?: string;
  stroke?: string;
}

export interface MemeTemplate {
  provider: string;
  id?: string;
  url?: string;
  name?: string;
}

export interface MemeProps {
  src: string;
  /** "kadal" for a template from Kadal's own library (the same as `template={{ provider: "kadal" }}`). */
  provider?: string;
  alt?: string;
  template?: MemeTemplate;
  captions?: MemeCaption[];
  /** CSS width (a number is px). Default: as wide as the image, up to its box. */
  width?: number | string;
  className?: string;
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([\d\s.,%/-]+\)|var\(--[\w-]+\))$/i;

/** The captions with every default filled in and every number kept on the image. */
export function memeLayout(captions: unknown): Required<MemeCaption>[] {
  if (!Array.isArray(captions)) return [];
  return captions
    .filter((c): c is MemeCaption => !!c && typeof c === "object")
    .map((c) => {
      const x = clamp(c.x, 0, 95, 5);
      return {
        text: String(c.text ?? ""),
        x,
        y: clamp(c.y, 0, 95, 4),
        width: clamp(c.width, 5, 100 - x, Math.min(90, 100 - x)),
        size: clamp(c.size, 2, 30, 9),
        align: c.align === "left" || c.align === "right" ? c.align : "center",
        color: typeof c.color === "string" && COLOR.test(c.color) ? c.color : "#fff",
        stroke: typeof c.stroke === "string" && COLOR.test(c.stroke) ? c.stroke : "#000",
      };
    });
}

/** One caption's box: placed in % of the image, sized in container units of the meme's width. */
export function memeCaptionStyle(c: Required<MemeCaption>): CSSProperties {
  return {
    left: `${c.x}%`,
    top: `${c.y}%`,
    width: `${c.width}%`,
    fontSize: `${c.size}cqw`,
    textAlign: c.align,
    color: c.color,
    WebkitTextStroke: `${+(c.size * 0.16).toFixed(2)}cqw ${c.stroke}`,
  };
}

/** The link back a template owes its source, or null. */
export function memeTemplateCredit(t: unknown): { label: string; href: string } | null {
  if (!t || typeof t !== "object") return null;
  const o = t as MemeTemplate;
  if (typeof o.provider === "string" && o.provider.toLowerCase() === "kadal")
    return { label: "Template by Kadal", href: KADAL_URL };
  if (o.provider === "imgflip")
    return {
      label: "Template via imgflip.com",
      href:
        isWebUrl(o.url) && /^https:\/\/([\w-]+\.)?imgflip\.com\//i.test(o.url)
          ? o.url
          : "https://imgflip.com",
    };
  if (typeof o.provider === "string" && isWebUrl(o.url))
    return { label: `Template via ${o.provider}`, href: o.url };
  return null;
}

export function Meme({ src, alt, provider, template, captions, width, className }: MemeProps) {
  const where = useRenderContext();
  const report = useReportHref(src);
  useEffect(() => loadExtraFont("Anton"), []);
  const lines = memeLayout(captions);
  const credit = memeTemplateCredit(template ?? (provider ? { provider } : undefined));
  const label = alt ?? (lines.map((l) => l.text).join(" / ") || "Meme");
  return (
    <figure
      className={cls("deck-meme", where.print && "is-print", className)}
      style={{ width: typeof width === "number" ? `${width}px` : width }}
    >
      <img src={src} alt={label} draggable={false} decoding="async" />
      {lines.map((c, i) => (
        <span key={i} className="deck-meme-caption" style={memeCaptionStyle(c)}>
          {c.text}
        </span>
      ))}
      {credit ? (
        <a
          className="deck-meme-credit"
          href={credit.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {credit.label}
        </a>
      ) : null}
      <HoverCredit report={report} />
    </figure>
  );
}
