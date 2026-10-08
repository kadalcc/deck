/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GLOSSARY MODEL  —  pure string work, shared by the compiler and the browser
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A deck's key concepts and abbreviations live in one `glossary.yaml` beside `deck.mdx`. The
 * compiler links the first mention of each term on every slide (`compiler/rehype-glossary.ts`),
 * `<Term>` links one by hand, and the runtime shows the definition in a card after a short hover
 * (`components/Term.tsx`). Both sides import this file, so they agree on ids, on what counts as a
 * mention, and on how a definition's inline Markdown becomes HTML. No Node imports here.
 *
 * The matcher follows the one that links Paadam's notes (apps/paadam/mdx/glossary.ts): longest
 * name first, whole words only, an optional plural — with one rule tightened for slides, where
 * abbreviations dominate: a name with no lowercase letter (GIS, WGS84) or shorter than four
 * characters matches in its exact case only, so "who" never becomes the WHO.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface GlossaryEntry {
  /** Stable slug of the name: what `<Term id>`, `see:` and the room's reveal message carry. */
  id: string;
  /** The term as the card titles it, and the first string the matcher looks for. */
  name: string;
  /** An abbreviation's expansion, shown under the title. */
  full: string | null;
  /** Other spellings that are the same term. */
  aliases: string[];
  /** A category chip: "Projection", "Statistics". */
  tag: string | null;
  link: { href: string; label: string } | null;
  /** Ids of related entries, offered as chips that swap the card. */
  see: string[];
  /** False keeps the term out of automatic linking; `<Term>` still finds it. */
  auto: boolean;
  /** The definition and the optional second paragraph, as inline HTML (see `inlineHtml`). */
  html: { def: string; more: string | null };
}

/** Deck-level options, from the headmatter's `glossary:` key (a path, `false`, or a mapping). */
export interface GlossaryOptions {
  /** The glossary file, relative to the deck file; null switches the feature off. */
  src: string | null;
  /** Link the first mention on each slide, or every mention. */
  repeat: "first" | "all";
  /** Headings: only for terms the slide's body never mentions, always, or never. */
  headings: "fallback" | boolean;
  /** Extra component names whose children are left alone. */
  skip: string[];
  /** Milliseconds the pointer rests on a term before its card opens. */
  delay: number;
  /** Whether the presenter's reveals start out shared with the room. */
  sync: boolean;
}

export const DEFAULT_GLOSSARY: GlossaryOptions = {
  src: "glossary.yaml",
  repeat: "first",
  headings: "fallback",
  skip: [],
  delay: 700,
  sync: false,
};

/** Normalise the headmatter's `glossary:` value over a base (the defaults, or an earlier layer). */
export function glossaryOptions(
  value: unknown,
  base: GlossaryOptions = DEFAULT_GLOSSARY,
): GlossaryOptions {
  if (value === undefined || value === null || value === true) return { ...base };
  if (value === false) return { ...base, src: null };
  if (typeof value === "string") return { ...base, src: value };
  if (typeof value !== "object" || Array.isArray(value)) return { ...base };
  const v = value as Record<string, unknown>;
  const out = { ...base };
  if (typeof v.src === "string") out.src = v.src;
  else if (v.src === false || v.src === null) out.src = null;
  if (v.repeat === "first" || v.repeat === "all") out.repeat = v.repeat;
  if (v.headings === "fallback" || typeof v.headings === "boolean") out.headings = v.headings;
  if (Array.isArray(v.skip)) out.skip = v.skip.map(String);
  if (typeof v.delay === "number" && v.delay >= 0) out.delay = v.delay;
  if (typeof v.sync === "boolean") out.sync = v.sync;
  return out;
}

/** "Plus Code" → "plus-code", "WGS84" → "wgs84". */
export function termId(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** An id for a one-off `<Term def>`: stable across builds and screens, distinct from any slug. */
export function adhocId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `~${(h >>> 0).toString(36)}`;
}

/** A name that must match in its exact case: an abbreviation, or too short to trust otherwise. */
export function isExactCase(word: string): boolean {
  return word.length < 4 || !/\p{Ll}/u.test(word);
}

export interface TermMatch {
  entry: GlossaryEntry;
  index: number;
  text: string;
}

export interface TermMatcher {
  /** Every mention in `text`, left to right, never overlapping. */
  find(text: string): TermMatch[];
  /** The entry a whole string names (by name, alias or id), for `<Term>UTM</Term>`. */
  resolve(text: string): GlossaryEntry | undefined;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORD = /[\p{L}\p{N}_]/u;

export function buildMatcher(entries: GlossaryEntry[]): TermMatcher {
  const byKey = new Map<string, { entry: GlossaryEntry; word: string }>();
  const byId = new Map<string, GlossaryEntry>();
  const auto: string[] = [];
  for (const entry of entries) {
    byId.set(entry.id, entry);
    for (const word of [entry.name, ...entry.aliases]) {
      const key = word.toLowerCase();
      if (key.length < 2 || byKey.has(key)) continue;
      byKey.set(key, { entry, word });
      if (entry.auto) auto.push(word);
    }
  }
  auto.sort((a, b) => b.length - a.length);
  // No lookbehind (older Safari throws on it): the boundary before a term is a captured character.
  const re = auto.length
    ? new RegExp(
        `(^|[^\\p{L}\\p{N}_])(${auto.map(escapeRe).join("|")})(e?s)?(?![\\p{L}\\p{N}_])`,
        "giu",
      )
    : null;

  const lookup = (stem: string, requireAuto: boolean) => {
    const hit = byKey.get(stem.toLowerCase());
    if (!hit || (requireAuto && !hit.entry.auto)) return undefined;
    if (isExactCase(hit.word) && hit.word !== stem) return undefined;
    return hit;
  };

  return {
    find(text) {
      if (!re) return [];
      const out: TermMatch[] = [];
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const lead = m[1] ?? "";
        const stem = m[2] ?? "";
        const plural = m[3] ?? "";
        const index = m.index + lead.length;
        const hit = lookup(stem, true);
        const next = text[index + stem.length + plural.length] ?? "";
        // Part of a hyphenated compound ("cell-level") is not a mention — unless the term is an
        // abbreviation, where "GNSS-derived" plainly is one.
        const compound = lead === "-" || next === "-";
        if (hit && !(compound && !isExactCase(hit.word))) {
          out.push({ entry: hit.entry, index, text: stem + plural });
        } else {
          // Step past this word only, so a shorter term starting inside it is not lost.
          re.lastIndex = index + 1;
          while (re.lastIndex < text.length && WORD.test(text[re.lastIndex]!)) re.lastIndex++;
        }
      }
      return out;
    },
    resolve(text) {
      const t = text.replace(/\s+/g, " ").trim();
      if (!t) return undefined;
      const direct = byId.get(t) ?? lookup(t, false)?.entry;
      if (direct) return direct;
      for (const cut of [/s$/i, /es$/i]) {
        const stem = t.replace(cut, "");
        if (stem !== t) {
          const hit = lookup(stem, false);
          if (hit) return hit.entry;
        }
      }
      return byId.get(termId(t));
    },
  };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SAFE_HREF = /^(https?:|mailto:|#|\/|\.{1,2}\/)/i;

/**
 * A definition's inline Markdown as HTML: **bold**, *emphasis*, `code`, [links](https://…) and
 * $maths$. Everything else is escaped, so the result is safe to set as innerHTML. `math` renders
 * TeX (the Vite plugin passes KaTeX at build time, which keeps KaTeX out of the browser bundle);
 * without it, maths shows as its source.
 */
export function inlineHtml(source: string, math?: (tex: string) => string): string {
  // No lookbehind here either — this one also runs in the browser, on every phone in the room.
  const re = /`([^`]+)`|\$([^$\n]+)\$|\*\*([^*]+)\*\*|\*([^*\n]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let out = "";
  let last = 0;
  for (const m of source.matchAll(re)) {
    const start = m.index ?? 0;
    out += escapeHtml(source.slice(last, start));
    if (m[1] !== undefined) out += `<code>${escapeHtml(m[1])}</code>`;
    else if (m[2] !== undefined) {
      let html = "";
      try {
        html = math ? math(m[2]) : "";
      } catch {
        html = "";
      }
      out += html || `<code class="deck-term-tex">${escapeHtml(m[2])}</code>`;
    } else if (m[3] !== undefined) out += `<strong>${inlineHtml(m[3], math)}</strong>`;
    else if (m[4] !== undefined) out += `<em>${inlineHtml(m[4], math)}</em>`;
    else if (m[5] !== undefined && m[6] !== undefined) {
      out += SAFE_HREF.test(m[6])
        ? `<a href="${escapeHtml(m[6])}" target="_blank" rel="noopener noreferrer">${inlineHtml(m[5], math)}</a>`
        : inlineHtml(m[5], math);
    }
    last = start + m[0].length;
  }
  return out + escapeHtml(source.slice(last));
}

/** "epsg.io" from a link, for the card's source line. */
export function linkLabel(href: string): string {
  try {
    return new URL(href, "https://x.invalid").hostname.replace(/^www\./, "") || href;
  } catch {
    return href;
  }
}
