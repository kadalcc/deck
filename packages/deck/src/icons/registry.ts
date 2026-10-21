import { type IconData, type IconifySet, iconFromSet, parseIconName } from "./data.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ICON REGISTRY  —  what `<Icon name="set:icon">` draws from, in the page
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Filled two ways:
 *
 *   registerIcons({...})   what a compiled slide module calls first thing: the icons the build
 *                          found in that slide, read from the deck's installed sets
 *                          (vite/index.ts, icons/node.ts). Synchronous, so the slide's first
 *                          render already has them — no flash, no network, works offline.
 *   requestIcon(name)      anything not registered: fetched from the Iconify API, batched — every
 *                          icon one slide asks for in the same tick is one request per set — and
 *                          kept in localStorage, so a deck shown twice fetches nothing the second
 *                          time. Three public mirrors are tried in turn. Offline, the icon is
 *                          "missing" and `<Icon>` draws its box.
 *
 * A host can point the fetch at its own Iconify API (or turn it off) with `setIconifyApi`.
 * Bodies that came over the network are sanitised (DOMPurify, SVG profile) before they are kept;
 * the ones a build registers come from the deck's own node_modules.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type IconState =
  | { status: "ready"; icon: IconData }
  | { status: "loading" }
  /** `retry`: when a failed fetch (offline) may be tried again; absent for a definite no. */
  | { status: "missing"; reason: string; retry?: number };

const DEFAULT_APIS = [
  "https://api.iconify.design",
  "https://api.simplesvg.com",
  "https://api.unisvg.com",
];

let apis: string[] = DEFAULT_APIS;
const states = new Map<string, IconState>();
const listeners = new Map<string, Set<() => void>>();
/** Per set, the names waiting for the next batch. */
const queued = new Map<string, Set<string>>();
let flush: ReturnType<typeof setTimeout> | null = null;
const STORE = "kadal.iconify.v1:";

function set(name: string, state: IconState) {
  states.set(name, state);
  for (const l of listeners.get(name) ?? []) l();
}

/** Icons a slide module carries, keyed `set:icon`. Later registrations win (a hot update). */
export function registerIcons(icons: Record<string, IconData>): void {
  for (const [name, icon] of Object.entries(icons)) set(name, { status: "ready", icon });
}

/**
 * Where icons not bundled by the build are fetched from: Iconify-compatible API roots, tried in
 * order; `null` or `[]` turns fetching off (an offline kiosk, a privacy-minded host) and such an
 * icon draws as a box.
 */
export function setIconifyApi(urls: string | string[] | null): void {
  apis =
    urls === null ? [] : (Array.isArray(urls) ? urls : [urls]).map((u) => u.replace(/\/+$/, ""));
}

export function iconState(name: string): IconState | undefined {
  return states.get(name);
}

export function subscribeIcon(name: string, listener: () => void): () => void {
  let set = listeners.get(name);
  if (!set) listeners.set(name, (set = new Set()));
  set.add(listener);
  return () => {
    set!.delete(listener);
  };
}

function remembered(name: string): IconData | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORE + name);
    if (!raw) return null;
    const icon = JSON.parse(raw) as IconData;
    return typeof icon?.body === "string" && icon.width > 0 && icon.height > 0 ? icon : null;
  } catch {
    return null;
  }
}

function remember(name: string, icon: IconData) {
  try {
    globalThis.localStorage?.setItem(STORE + name, JSON.stringify(icon));
  } catch {
    /* full, blocked, or a private window: the memory copy still serves this visit */
  }
}

/** Make sure `name` is on its way: from memory, the browser's store, or the next API batch. */
export function requestIcon(name: string): void {
  const known = states.get(name);
  if (known && !(known.status === "missing" && known.retry && Date.now() >= known.retry)) return;
  const parsed = parseIconName(name);
  if (!parsed) return set(name, { status: "missing", reason: `"${name}" is not a set:icon name` });
  const kept = remembered(name);
  if (kept) return set(name, { status: "ready", icon: kept });
  if (!apis.length || typeof fetch !== "function")
    return set(name, {
      status: "missing",
      reason: `${name} is not bundled and fetching icons is off`,
    });
  states.set(name, { status: "loading" });
  let names = queued.get(parsed.prefix);
  if (!names) queued.set(parsed.prefix, (names = new Set()));
  names.add(parsed.name);
  flush ??= setTimeout(fetchQueued, 0);
}

function fetchQueued() {
  flush = null;
  const batch = [...queued];
  queued.clear();
  for (const [prefix, names] of batch) void fetchSet(prefix, [...names]);
}

let purify: Promise<(svg: string) => string> | null = null;
/** DOMPurify with the SVG profile, loaded the first time an icon arrives over the network. */
function sanitiser(): Promise<(svg: string) => string> {
  purify ??= import("dompurify")
    .then(
      ({ default: DOMPurify }) =>
        (body: string) =>
          DOMPurify.sanitize(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`, {
            USE_PROFILES: { svg: true, svgFilters: true },
          }).replace(/^<svg[^>]*>|<\/svg>$/g, ""),
    )
    .catch(
      () => (body: string) =>
        body.replace(/<script[\s\S]*?<\/script>|\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, ""),
    );
  return purify;
}

async function fetchSet(prefix: string, names: string[]) {
  // The API takes a comma-separated list; long lists are cut so the URL stays well under limits.
  for (let i = 0; i < names.length; i += 60) {
    const chunk = names.slice(i, i + 60);
    const query = `icons=${chunk.map(encodeURIComponent).join(",")}`;
    let data: IconifySet | null = null;
    let lastError = "offline";
    for (const api of apis) {
      try {
        const res = await fetch(`${api}/${encodeURIComponent(prefix)}.json?${query}`);
        if (res.status === 404) {
          lastError = `there is no Iconify set "${prefix}"`;
          break;
        }
        if (!res.ok) {
          lastError = `the Iconify API answered ${res.status}`;
          continue;
        }
        const json = (await res.json()) as IconifySet | number;
        // The API answers a bare 404 (the number) for a set it does not have.
        if (typeof json !== "object" || !json) {
          lastError = `there is no Iconify set "${prefix}"`;
          break;
        }
        data = json;
        break;
      } catch {
        lastError = "the Iconify API could not be reached (offline?)";
      }
    }
    const clean = data ? await sanitiser() : null;
    for (const n of chunk) {
      const full = `${prefix}:${n}`;
      const icon = data ? iconFromSet(data, n) : null;
      if (icon && clean) {
        const safe = { ...icon, body: clean(icon.body) };
        remember(full, safe);
        set(full, { status: "ready", icon: safe });
      } else
        set(full, {
          status: "missing",
          reason: data ? `the set "${prefix}" has no icon "${n}"` : lastError,
          // A network failure passes: the next slide that asks, half a minute on, tries again.
          ...(data || lastError.startsWith("there is no") ? {} : { retry: Date.now() + 30_000 }),
        });
    }
  }
}

/** Forget everything (tests). */
export function resetIcons(): void {
  states.clear();
  queued.clear();
  apis = DEFAULT_APIS;
}
