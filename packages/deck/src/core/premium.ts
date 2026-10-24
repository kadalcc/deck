/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REMOTE PACKS: `pro/` backgrounds and layouts, resolved through the host
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A name that starts with `pro/` — `background: pro/aurora-noir`, `layout: pro/folio-split`,
 * `<Background name="pro/…" />` — is not in the engine. It belongs to a library the HOST serves
 * (Kadal Deck Pro on decks.kadal.cc), and only the host can say where:
 *
 *   window.__KADAL_DECK__ = { premium: "https://decks.kadal.cc/@you/talk/__kadal/premium/" }
 *
 * Under that base sits `catalog.json` — `[{ id, kind, module, … }]` — and one ES module per item.
 * The engine fetches the catalog once, only when a slide first uses a `pro/` name, then
 * `import()`s the item's module. The module's default export is
 *
 *   { backgrounds?: { [id]: Component }, layouts?: { [id]: Component },
 *     poster?: { [id]: Component }, css?: string }
 *
 * and it gets React from `window.__KADAL_DECK_RUNTIME__` (react/premium.tsx), never its own.
 *
 * Without a base (a self-hosted build, a host that did not grant it) nothing is fetched at all:
 * the slide keeps the theme's own background and layout. That is the whole fallback story, and
 * it is the same for every failure — a 402 from a host whose plan doesn't include the library,
 * a 404, a network error, a module that doesn't load — so a published deck never shows an error
 * for it. Only an author (the dev server, a builder preview) sees a small chip saying why.
 *
 * Everything in this file is pure: parsing and checking what came over the wire. The fetching
 * and the React side live in react/premium.tsx.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const PREMIUM_PREFIX = "pro/";

export type PremiumKind = "background" | "layout";

/** `pro/<slug>` with a sane slug — the only names that go to the host. */
export function isPremiumName(name: unknown): name is string {
  return typeof name === "string" && /^pro\/[a-z0-9][a-z0-9-]{0,63}$/.test(name);
}

/** One catalog line, as far as the engine cares. The host's catalog carries more (props, previews). */
export interface PremiumEntry {
  id: string;
  kind: PremiumKind;
  /** The module's path, relative to the catalog (or absolute under the same base). */
  module: string;
  title?: string;
}

/** A base URL the host gave, normalised to end in `/`; null for anything not http(s). */
export function premiumBase(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  let url: URL;
  try {
    url = new URL(raw, typeof location === "undefined" ? undefined : location.href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.hash = "";
  url.search = "";
  const s = url.href;
  return s.endsWith("/") ? s : `${s}/`;
}

/**
 * The catalog, checked: an array of entries (or `{ items: [...] }`), each with an id, a kind and
 * a module. Malformed lines are dropped, not trusted.
 */
export function parseCatalog(json: unknown): PremiumEntry[] {
  const list = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { items?: unknown }).items)
      ? (json as { items: unknown[] }).items
      : [];
  const out: PremiumEntry[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    if (!isPremiumName(e.id)) continue;
    if (e.kind !== "background" && e.kind !== "layout") continue;
    if (typeof e.module !== "string" || !e.module) continue;
    out.push({
      id: e.id,
      kind: e.kind,
      module: e.module,
      ...(typeof e.title === "string" ? { title: e.title } : {}),
    });
  }
  return out;
}

/**
 * The URL to `import()` for an entry: resolved against the base and REQUIRED to stay under it.
 * A catalog line pointing elsewhere (another origin, `../` out of the base) is refused, so the
 * host's catalog can only ever load the host's own modules.
 */
export function moduleUrl(base: string, entry: Pick<PremiumEntry, "module">): string | null {
  let url: URL;
  try {
    url = new URL(entry.module, base);
  } catch {
    return null;
  }
  return url.href.startsWith(base) ? url.href : null;
}

export interface LoadedItem {
  component: unknown;
  poster: unknown;
  css: string | null;
}

const isComponent = (c: unknown) =>
  typeof c === "function" || (!!c && typeof c === "object" && "$$typeof" in (c as object));

/**
 * The item `id` of `kind` out of a loaded module (the namespace `import()` returned), or null
 * when the module does not have it in the agreed shape.
 */
export function readPremiumModule(ns: unknown, id: string, kind: PremiumKind): LoadedItem | null {
  const mod = (ns as { default?: unknown } | null)?.default;
  if (!mod || typeof mod !== "object") return null;
  const m = mod as Record<string, unknown>;
  const table = m[kind === "background" ? "backgrounds" : "layouts"];
  const component =
    table && typeof table === "object" ? (table as Record<string, unknown>)[id] : null;
  if (!isComponent(component)) return null;
  const posters =
    m.poster && typeof m.poster === "object" ? (m.poster as Record<string, unknown>) : {};
  return {
    component,
    poster: isComponent(posters[id]) ? posters[id] : null,
    css: typeof m.css === "string" && m.css ? m.css : null,
  };
}

/** Why an item did not load, in words for the author's chip (never shown on a published deck). */
export type PremiumFailure = "no-host" | "not-entitled" | "missing" | "network" | "bad-module";

/** The HTTP status of the catalog request, as a failure. */
export function failureForStatus(status: number): PremiumFailure {
  return status === 402 || status === 403 || status === 401
    ? "not-entitled"
    : status === 404
      ? "missing"
      : "network";
}
