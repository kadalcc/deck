import { codeSpans } from "../compiler/comments.ts";
import { type Loose, parseLoose } from "../compiler/loose-object.ts";
import { iconFromTag, parseIconName } from "../icons/data.ts";
import { iconSetInfo } from "../icons/licences.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MEDIA CREDITS  —  what a deck owes, collected from its slides at compile time
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   credits: true                                    (headmatter)
 *   credits: { footer: true, title: "Credits", slide: "end" }
 *
 * Every slide's MDX is read once, as text, before it compiles (compiler/pipeline.ts, so the Vite
 * plugin and the hosted shell's runtime compiler agree): each `<Gif>`, `<Sticker>`, `<Meme>`,
 * `<Emoji>`, `<Icon>` (and the `<mdi-account />` tag form, and `icon="set:name"` props) and each
 * `<Image>`/`<Sticker>` with a `credit` prop says where it came from. The result is a list of
 * groups — one per source, with its licence and link, de-duplicated, in the order the deck first
 * uses them — that `<Credits />` draws (credits/Credits.tsx).
 *
 * With `credits` on, a "Credits" slide (`id: credits`) goes in before the deck's last slide (the
 * thank-you), or at the end of a one-slide deck or with `slide: "end"`, and every other slide gets
 * a small link to it in its corner. A deck that places `<Credits />` itself keeps its own slide
 * and the link points there. Nothing attributed: no slide and no link.
 *
 * Only what the compiler can read counts: attributes written as strings or literal objects. A
 * `src={someVariable}` is invisible here, as it is to every other compile-time pass.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface CreditItem {
  /** What it is: a GIF's title, an emoji's name, an icon's name. */
  title: string;
  /** Its own page at the source, when it has one. */
  href?: string;
  /** Who made it, when the source says. */
  by?: string;
  /** A licence of its own (a photo's), when it is not the group's. */
  licence?: string;
  licenceUrl?: string;
}

export interface CreditGroup {
  /** Stable: "klipy", "imgflip", "emoji:twemoji", "iconify:mdi", "kadal", "font:anton", "image". */
  id: string;
  /** How the slide names it: "GIFs via KLIPY", "Twemoji", "Material Design Icons". */
  label: string;
  by?: string;
  /** "CC BY 4.0", "MIT", "KLIPY API terms"; "" when the items carry their own. */
  licence: string;
  licenceUrl?: string;
  /** The source's home. */
  url?: string;
  /** One line more, when the source asks for it ("Loaded from KLIPY, never copied."). */
  notice?: string;
  /** "item" lists titles; "count" says how many (emoji and icons: their names are noise). */
  show: "items" | "count";
  items: CreditItem[];
}

export interface CreditsOptions {
  /** Where the slide goes: before the last slide (default), at the very end, or none at all. */
  slide: "before-last" | "end" | false;
  /** The small link to the credits slide on every other slide. */
  footer: boolean;
  /** The slide's heading and the link's words. */
  title: string;
}

/** What `config.credits` holds once the compiler has read the deck. */
export interface ResolvedCredits extends CreditsOptions {
  groups: CreditGroup[];
  /** The id of the slide the credits are on (the footer's target); null without one. */
  at: string | null;
}

export const CREDITS_SLIDE_ID = "credits";
export const DEFAULT_CREDITS: CreditsOptions = {
  slide: "before-last",
  footer: true,
  title: "Credits",
};

/** The headmatter's `credits`, normalised; null when off (the default). */
export function creditsOptions(value: unknown): CreditsOptions | null {
  if (value === true) return { ...DEFAULT_CREDITS };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (o.enabled === false) return null;
  const slide =
    o.slide === "end" || o.slide === false || o.slide === "none"
      ? o.slide === "end"
        ? "end"
        : false
      : "before-last";
  return {
    slide,
    footer: o.footer !== false,
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : DEFAULT_CREDITS.title,
  };
}

/** `config.credits` as the runtime reads it: the compiler's result, or null. */
export function resolvedCredits(value: unknown): ResolvedCredits | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as ResolvedCredits).groups))
    return null;
  return value as ResolvedCredits;
}

// ── the sources ─────────────────────────────────────────────────────────────────────────────

/** Licence names as people read them. */
export function licenceLabel(spdx: string): string {
  const s = spdx.trim();
  const cc = /^CC[- ](BY(?:-[A-Z]{2})*)[- ](\d\.\d)$/i.exec(s);
  if (cc) return `CC ${cc[1]!.toUpperCase()} ${cc[2]}`;
  if (/^CC0-1\.0$/i.test(s)) return "CC0 1.0";
  if (/^Apache-2\.0$/i.test(s)) return "Apache 2.0";
  if (/^OFL-1\.1$/i.test(s)) return "SIL OFL 1.1";
  if (/^MPL-2\.0$/i.test(s)) return "MPL 2.0";
  return s;
}

/** Where a licence's text is, for an SPDX id; undefined for anything else. */
export function licenceUrl(spdx: string): string | undefined {
  const s = spdx.trim();
  const cc = /^CC[- ](BY(?:-[A-Z]{2})*)[- ](\d\.\d)$/i.exec(s);
  if (cc) return `https://creativecommons.org/licenses/${cc[1]!.toLowerCase()}/${cc[2]}/`;
  if (/^CC0(?:[- ]1\.0)?$/i.test(s)) return "https://creativecommons.org/publicdomain/zero/1.0/";
  if (/^OFL-1\.1$/i.test(s)) return "https://openfontlicense.org";
  return /^[A-Za-z0-9.+-]+$/.test(s) && s.length > 1
    ? `https://spdx.org/licenses/${s}.html`
    : undefined;
}

type Source = Omit<CreditGroup, "items">;

/** The emoji sets the host serves (components/media.tsx EMOJI_SETS), by the family they belong to. */
const EMOJI_FAMILY: Record<string, Source> = {
  fluent: {
    id: "emoji:fluent",
    label: "Fluent Emoji",
    by: "Microsoft",
    licence: "MIT",
    licenceUrl: "https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE",
    url: "https://github.com/microsoft/fluentui-emoji",
    show: "count",
  },
  noto: {
    id: "emoji:noto",
    label: "Noto Emoji",
    by: "Google",
    licence: "Apache 2.0",
    licenceUrl: "https://github.com/googlefonts/noto-emoji/blob/main/LICENSE",
    url: "https://github.com/googlefonts/noto-emoji",
    show: "count",
  },
  "noto-animated": {
    id: "emoji:noto-animated",
    label: "Noto Animated Emoji",
    by: "Google",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://googlefonts.github.io/noto-emoji-animation/",
    show: "count",
  },
  twemoji: {
    id: "emoji:twemoji",
    label: "Twemoji",
    by: "Twitter, Inc and other contributors",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://github.com/jdecked/twemoji",
    show: "count",
  },
};
const EMOJI_SET_FAMILY: Record<string, keyof typeof EMOJI_FAMILY> = {
  "fluent-3d": "fluent",
  "fluent-color": "fluent",
  "fluent-flat": "fluent",
  noto: "noto",
  "noto-animated": "noto-animated",
  twemoji: "twemoji",
};
const DEFAULT_EMOJI_SET = "fluent-3d";

export const SOURCES = {
  klipy: {
    id: "klipy",
    label: "GIFs via KLIPY",
    by: "KLIPY",
    licence: "KLIPY API terms",
    licenceUrl: "https://docs.klipy.com/integration-requirements",
    url: "https://klipy.com",
    notice: "Loaded from KLIPY, never copied.",
    show: "items",
  },
  giphy: {
    id: "giphy",
    label: "GIFs via GIPHY",
    by: "GIPHY",
    licence: "GIPHY terms",
    licenceUrl: "https://support.giphy.com/hc/en-us/articles/360020027752-GIPHY-Terms-of-Service",
    url: "https://giphy.com",
    show: "items",
  },
  imgflip: {
    id: "imgflip",
    label: "Meme templates from Imgflip",
    by: "Imgflip",
    licence: "Imgflip API terms",
    licenceUrl: "https://imgflip.com/api",
    url: "https://imgflip.com",
    show: "items",
  },
  kadal: {
    id: "kadal",
    label: "Kadal originals",
    by: "Kadal",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://kadal.cc",
    notice: "Stickers, GIFs and meme templates from Kadal's own library.",
    show: "items",
  },
  anton: {
    id: "font:anton",
    label: "Anton (meme captions)",
    by: "Vernon Adams",
    licence: "SIL OFL 1.1",
    licenceUrl: "https://openfontlicense.org",
    url: "https://fonts.google.com/specimen/Anton",
    show: "count",
  },
  lucide: {
    id: "iconify:lucide",
    label: "Lucide",
    by: "Lucide Contributors",
    licence: "ISC",
    licenceUrl: "https://lucide.dev/license",
    url: "https://lucide.dev",
    show: "count",
  },
  image: {
    id: "image",
    label: "Images",
    licence: "",
    show: "items",
  },
} as const satisfies Record<string, Source>;

/** The group for an emoji set name ("twemoji", "fluent-3d"); the default set for anything else. */
export function emojiSource(set: string | undefined): Source {
  const family = EMOJI_SET_FAMILY[set ?? ""] ?? EMOJI_SET_FAMILY[DEFAULT_EMOJI_SET]!;
  return EMOJI_FAMILY[family]!;
}

/** The group for an Iconify set: its name, author and licence from Iconify's own listing. */
export function iconSource(prefix: string): Source {
  if (prefix === "lucide") return SOURCES.lucide;
  const info = iconSetInfo(prefix);
  const licence = info?.licence ?? "";
  return {
    id: `iconify:${prefix}`,
    label: info?.name ?? prefix,
    ...(info?.author ? { by: info.author } : {}),
    licence: licence ? licenceLabel(licence) : "See the set's licence",
    ...(licenceUrl(licence) ? { licenceUrl: licenceUrl(licence) } : {}),
    url: `https://icon-sets.iconify.design/${prefix}/`,
    show: "count",
  };
}

// ── reading the slides ──────────────────────────────────────────────────────────────────────

export type AttrValue = string | true | Loose | undefined;
export interface ScannedTag {
  name: string;
  attrs: Record<string, AttrValue>;
}

const TAGS = new Set(["Gif", "Sticker", "Meme", "Emoji", "Icon", "Image"]);

/** The text with code (fences and inline spans) blanked to spaces: a tag in code is not used. */
export function blankCode(text: string): string {
  let out = text;
  for (const [a, b] of codeSpans(text))
    out = out.slice(0, a) + out.slice(a, b).replace(/[^\n]/g, " ") + out.slice(b);
  return out;
}

/** The expression between `{` at `i` and its `}`, quotes and nesting respected; end exclusive. */
function braced(src: string, i: number): { inner: string; end: number } | null {
  let depth = 0;
  let quote: string | null = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j]!;
    if (quote) {
      if (c === "\\") j++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return { inner: src.slice(i + 1, j), end: j + 1 };
  }
  return null;
}

function readValue(expr: string): AttrValue {
  const t = expr.trim();
  if (!t || t.startsWith("...")) return undefined;
  try {
    return parseLoose(t);
  } catch {
    return undefined;
  }
}

/** The media tags of a slide (and lowercase icon tags), with the attributes the compiler can read. */
export function scanTags(mdx: string): ScannedTag[] {
  const src = blankCode(mdx);
  const out: ScannedTag[] = [];
  const open = /<([A-Za-z][\w.-]*)(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(src))) {
    const name = m[1]!;
    const icon = !TAGS.has(name) && /^[a-z]/.test(name) ? iconFromTag(name) : null;
    const attrs: Record<string, AttrValue> = {};
    let i = m.index + m[0].length;
    for (;;) {
      while (i < src.length && /\s/.test(src[i]!)) i++;
      if (i >= src.length || src[i] === ">" || src.startsWith("/>", i)) break;
      if (src[i] === "{") {
        const b = braced(src, i);
        if (!b) break;
        i = b.end;
        continue;
      }
      const an = /^[A-Za-z_:][\w:.-]*/.exec(src.slice(i));
      if (!an) break;
      const key = an[0];
      i += key.length;
      while (i < src.length && /[ \t]/.test(src[i]!)) i++;
      if (src[i] !== "=") {
        attrs[key] = true;
        continue;
      }
      i++;
      while (i < src.length && /\s/.test(src[i]!)) i++;
      const q = src[i];
      if (q === '"' || q === "'") {
        const close = src.indexOf(q, i + 1);
        if (close < 0) break;
        attrs[key] = src.slice(i + 1, close);
        i = close + 1;
      } else if (q === "{") {
        const b = braced(src, i);
        if (!b) break;
        attrs[key] = readValue(b.inner);
        i = b.end;
      } else break;
    }
    open.lastIndex = Math.max(open.lastIndex, i);
    if (TAGS.has(name)) out.push({ name, attrs });
    else if (icon) out.push({ name: "Icon", attrs: { ...attrs, name: icon } });
    else if (typeof attrs.icon === "string" && parseIconName(attrs.icon))
      out.push({ name: "Icon", attrs: { name: attrs.icon } });
  }
  return out;
}

const str = (v: AttrValue): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const obj = (v: AttrValue): Record<string, Loose> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Loose>) : null;
const web = (v: unknown): string | undefined =>
  typeof v === "string" && /^https?:\/\/\S+$/i.test(v) ? v : undefined;

/** A KLIPY item's page: what `<Gif>` links its credit to (components/media.tsx). */
const klipyHref = (slug?: string) =>
  slug ? `https://klipy.com/gifs/${encodeURIComponent(slug)}` : undefined;

interface Use {
  source: Source;
  item?: CreditItem;
}

/** An emoji set from a URL the host's emoji CDN serves (`…/emoji/<set>/<key>.<ext>`). */
export function emojiSetOfUrl(src: string): string | null {
  const m =
    /\/emoji\/(fluent-3d|fluent-color|fluent-flat|noto-animated|noto|twemoji)\/[0-9a-f-]+\.\w+(?:[?#]|$)/i.exec(
      src,
    );
  return m ? m[1]!.toLowerCase() : null;
}

/** A custom `credit` on an image or a sticker: its own line among "Images". */
function ownCredit(a: Record<string, AttrValue>): Use | null {
  const credit = str(a.credit);
  if (!credit) return null;
  const licence = str(a.license) ?? str(a.licence);
  const item: CreditItem = { title: credit };
  const href = web(a.creditUrl) ?? web(a.href);
  if (href) item.href = href;
  if (licence) {
    item.licence = licence;
    const lu = web(a.licenseUrl) ?? web(a.licenceUrl) ?? licenceUrl(licence);
    if (lu) item.licenceUrl = lu;
  }
  return { source: SOURCES.image, item };
}

/** What one tag owes, as (source, item) pairs. */
export function creditsOfTag(tag: ScannedTag): Use[] {
  const a = tag.attrs;
  const title = str(a.title) ?? str(a.alt);
  const out: Use[] = [];
  switch (tag.name) {
    case "Gif": {
      const provider = (str(a.provider) ?? "klipy").toLowerCase();
      const item: CreditItem = { title: title ?? "Untitled GIF" };
      const creator = str(a.creator);
      if (creator) item.by = creator;
      if (provider === "kadal") {
        out.push({ source: SOURCES.kadal, item });
        break;
      }
      const href = web(a.href) ?? (provider === "klipy" ? klipyHref(str(a.slug)) : undefined);
      if (href) item.href = href;
      if (provider === "klipy") out.push({ source: SOURCES.klipy, item });
      else if (provider === "giphy") out.push({ source: SOURCES.giphy, item });
      else
        out.push({
          source: {
            id: `gif:${provider}`,
            label: `GIFs via ${provider.charAt(0).toUpperCase()}${provider.slice(1)}`,
            licence: "",
            show: "items",
          },
          item,
        });
      break;
    }
    case "Sticker": {
      const src = str(a.src) ?? "";
      const own = ownCredit(a);
      if (own) out.push(own);
      else if (str(a.provider)?.toLowerCase() === "kadal")
        out.push({ source: SOURCES.kadal, item: { title: title ?? str(a.id) ?? "Sticker" } });
      else if (emojiSetOfUrl(src))
        out.push({ source: emojiSource(emojiSetOfUrl(src)!), item: { title: title ?? "emoji" } });
      else if (/^https:\/\/([\w-]+\.)*klipy\.com\//i.test(src))
        out.push({ source: SOURCES.klipy, item: { title: title ?? "Sticker" } });
      else if (/^https:\/\/i\.imgflip\.com\//i.test(src))
        out.push({ source: SOURCES.imgflip, item: { title: title ?? "Template" } });
      break;
    }
    case "Meme": {
      const t = obj(a.template);
      const provider = (
        (typeof t?.provider === "string" ? t.provider : undefined) ??
        str(a.provider) ??
        ""
      ).toLowerCase();
      const name = (typeof t?.name === "string" && t.name) || title || "Meme";
      if (provider === "imgflip") {
        const href = web(t?.url);
        out.push({ source: SOURCES.imgflip, item: href ? { title: name, href } : { title: name } });
      } else if (provider === "kadal") out.push({ source: SOURCES.kadal, item: { title: name } });
      else if (provider && t) {
        const href = web(t.url);
        out.push({
          source: {
            id: `meme:${provider}`,
            label: `Meme templates via ${provider}`,
            licence: "",
            show: "items",
          },
          item: href ? { title: name, href } : { title: name },
        });
      } else {
        const own = ownCredit(a);
        if (own) out.push(own);
      }
      const caps = a.captions;
      if (Array.isArray(caps) ? caps.length > 0 : caps !== undefined)
        out.push({ source: SOURCES.anton, item: { title: "Anton" } });
      break;
    }
    case "Emoji": {
      const glyph = str(a.char) ?? str(a.name) ?? "emoji";
      out.push({ source: emojiSource(str(a.set)), item: { title: glyph } });
      break;
    }
    case "Icon": {
      const name = str(a.name);
      if (!name) break;
      const parsed = parseIconName(name);
      if (parsed) out.push({ source: iconSource(parsed.prefix), item: { title: name } });
      else if (/^[A-Za-z][\w-]*$/.test(name))
        out.push({ source: SOURCES.lucide, item: { title: name } });
      break;
    }
    case "Image": {
      const own = ownCredit(a);
      if (own) out.push(own);
      else {
        const src = str(a.src) ?? "";
        const set = emojiSetOfUrl(src);
        if (set) out.push({ source: emojiSource(set), item: { title: title ?? "emoji" } });
      }
      break;
    }
  }
  return out;
}

const itemKey = (i: CreditItem) => `${i.title}\u0000${i.href ?? ""}\u0000${i.licence ?? ""}`;

/** Every attributed item the slides use, grouped by source, first use first, without repeats. */
export function collectCredits(texts: Iterable<string>): CreditGroup[] {
  const groups = new Map<string, CreditGroup>();
  const seen = new Map<string, Set<string>>();
  for (const text of texts) {
    if (!text || !text.includes("<")) continue;
    for (const tag of scanTags(text))
      for (const use of creditsOfTag(tag)) {
        let g = groups.get(use.source.id);
        if (!g) {
          g = { ...use.source, items: [] };
          groups.set(use.source.id, g);
          seen.set(use.source.id, new Set());
        }
        if (!use.item) continue;
        const k = itemKey(use.item);
        const s = seen.get(use.source.id)!;
        if (s.has(k)) continue;
        s.add(k);
        g.items.push(use.item);
      }
  }
  return [...groups.values()];
}

/** Whether a slide places the credits itself. */
export const placesCredits = (mdx: string) => /<Credits[\s/>]/.test(blankCode(mdx));

// ── the slide ───────────────────────────────────────────────────────────────────────────────

/** The fields of a prepared slide the credits slide needs (compiler/pipeline.ts PreparedSlide). */
interface SlideLike {
  index: number;
  h: number;
  v: number;
  frontmatter: Record<string, unknown>;
  content: string;
  notes: string | null;
  source: { file: string; line: number };
}

/** The file name the generated slide claims: no file, so editors and the merge leave it alone. */
export const CREDITS_FILE = "<credits>";

/**
 * The deck with its credits: `credits` resolved into the headmatter (what `<Credits />` and the
 * footer read from `config.credits`), and the generated slide added where the options say. A deck
 * without `credits` and without `<Credits />` comes back as it was. `make` builds the generated
 * slide from the fields every slide has (the caller adds its own: ranges, magic, snippets).
 */
export function withCredits<S extends SlideLike>(
  headmatter: Record<string, unknown>,
  slides: S[],
  make: (base: SlideLike) => S,
): { headmatter: Record<string, unknown>; slides: S[] } {
  const options = creditsOptions(headmatter.credits);
  const placed = slides.findIndex((s) => placesCredits(s.content));
  if (!options && placed < 0) return { headmatter, slides };
  const opts = options ?? { ...DEFAULT_CREDITS, slide: false as const, footer: false };
  const groups = collectCredits(slides.map((s) => s.content));
  let out = slides;
  let at: string | null = null;
  const ids = new Set(slides.map((s) => s.frontmatter.id).filter((id) => typeof id === "string"));
  if (placed >= 0) {
    const own = slides[placed]!;
    if (typeof own.frontmatter.id === "string") at = own.frontmatter.id;
    else {
      at = ids.has(CREDITS_SLIDE_ID) ? "media-credits" : CREDITS_SLIDE_ID;
      out = slides.map((s, i) =>
        i === placed ? { ...s, frontmatter: { ...s.frontmatter, id: at } } : s,
      );
    }
  } else if (opts.slide && groups.length && slides.length) {
    at = ids.has(CREDITS_SLIDE_ID) ? "media-credits" : CREDITS_SLIDE_ID;
    // Before the last column (the thank-you, with any slides under it), or after everything.
    const lastH = slides[slides.length - 1]!.h;
    const before =
      opts.slide === "end" || lastH === 0 ? slides.length : slides.findIndex((s) => s.h === lastH);
    const h = before === slides.length ? lastH + 1 : lastH;
    const slide = make({
      index: before,
      h,
      v: 0,
      frontmatter: {
        id: at,
        title: opts.title,
        layout: "default",
        class: "deck-credits-slide",
        generated: "credits",
      },
      content: "<Credits />",
      notes: null,
      source: { file: CREDITS_FILE, line: 1 },
    });
    out = [
      ...slides.slice(0, before),
      slide,
      ...slides.slice(before).map((s) => ({ ...s, index: s.index + 1, h: s.h + 1 })),
    ];
  }
  const resolved: ResolvedCredits = { ...opts, groups, at };
  return { headmatter: { ...headmatter, credits: resolved }, slides: out };
}

/** The footer's target on this slide: the credits slide's id, or null (none, or this is it). */
export function creditsLinkTarget(value: unknown, slideId: string): ResolvedCredits | null {
  const c = resolvedCredits(value);
  if (!c || !c.footer || !c.at || !c.groups.length || c.at === slideId) return null;
  return c;
}
