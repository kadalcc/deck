/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SERVICE WORKER  —  `pwa: true`, written into dist/sw.js by the build
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Small and hand-written (no Workbox): the deck is one known list of files, and what it must
 * never do matters as much as what it does.
 *
 *   install    every file of the build into one cache, `cache: "reload"` past the HTTP cache —
 *              a file whose content hash is unchanged since the last version is copied from the
 *              old cache instead of downloaded again (a file the server answers with an error
 *              is skipped with a warning; a dropped connection fails the install, which the
 *              browser retries at the next visit). The first install tells the page how far
 *              it has got (the "Saving for offline…" toast) and takes over at once; an update
 *              waits until the page says so (the "new version" toast), never mid-talk.
 *   activate   caches older than the previous version are deleted; the previous one stays, so
 *              a window still on the old version can load its lazy chunks.
 *   navigate   network first (4 s), the cached deck when there is no answer — every route
 *              (/presenter, /notes, /overview…) is the deck's index.html. A 404 or 410 for
 *              the deck's own address means it was taken down: the worker removes itself.
 *   files      cache first, then the network (kept for next time: deck.pdf, baked narration).
 *              A Range request (seeking a video) is answered from the cached file when it is
 *              there, so a video plays and seeks offline.
 *
 * Never touched — answered by the network as if there were no worker: anything not GET,
 * another origin, a path outside the deck's scope, the live room's and the host's API (`/api`,
 * and the deck's own `live.api` when it is on this origin), the dev endpoints (`/__kadal/`),
 * and the phone remote (`<base>remote`), which is a live control surface, not a document.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ServiceWorkerConfig {
  /** The deck's base, absolute ("/talks/x/"): the worker's scope. */
  scope: string;
  /** A hash of the file list: the same build gives the same worker, so no needless update. */
  version: string;
  /** [url, content hash] for every file to keep offline; the deck's index.html is the scope URL. */
  precache: Array<[string, string]>;
  /** Path prefixes the worker never answers. */
  bypass: string[];
  /** Path prefixes of pages that are never served from the cache (the phone remote). */
  network: string[];
}

/** The worker's source: the logic below with its config. Plain ES2020, no imports. */
export function serviceWorkerSource(config: ServiceWorkerConfig): string {
  return `// Kadal Deck: the deck's offline copy (pwa: true). Written by the build; the next build replaces it.
const CONFIG = ${JSON.stringify(config)};
${WORKER}`;
}

const WORKER = String.raw`const PREFIX = "kadal-deck|" + CONFIG.scope + "|";
const CACHE = PREFIX + CONFIG.version;
const REVISIONS = CONFIG.scope + "__kadal-deck-revisions";

const starts = (path, list) => list.some((p) => path.startsWith(p));

async function tell(message) {
  const all = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const c of all) c.postMessage(message);
}

/** A response a navigation may be answered with (a redirected one may not). */
async function plain(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

const META = "kadal-deck-meta|" + CONFIG.scope;

/** This deck's caches, this version's first. */
async function ours() {
  const others = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== CACHE);
  return [CACHE, ...others];
}

/** An unchanged file from an older version's cache, when its content hash is the same. */
async function reuse(url, rev) {
  for (const name of await ours()) {
    if (name === CACHE) continue;
    const cache = await caches.open(name);
    const revs = await cache.match(REVISIONS);
    if (!revs) continue;
    const map = await revs.json().catch(() => ({}));
    if (map[url] !== rev) continue;
    const hit = await cache.match(url);
    if (hit) return hit;
  }
  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const first = !self.registration.active;
      const cache = await caches.open(CACHE);
      const queue = CONFIG.precache.slice();
      const total = queue.length;
      let done = 0;
      let said = 0;
      const work = async () => {
        for (let entry = queue.shift(); entry; entry = queue.shift()) {
          const [url, rev] = entry;
          let res = await reuse(url, rev);
          if (!res) {
            res = await fetch(new Request(url, { cache: "reload", credentials: "same-origin" }));
            // A file the server no longer has costs that file, not the whole offline copy.
            if (!res.ok) console.warn("[deck] offline copy: " + url + " answered " + res.status);
            res = res.ok ? await plain(res) : null;
          }
          if (res) await cache.put(url, res);
          done++;
          if (first && (Date.now() - said > 200 || done === total)) {
            said = Date.now();
            tell({ type: "kadal-sw:progress", done, total });
          }
        }
      };
      await Promise.all(Array.from({ length: 6 }, work));
      await cache.put(REVISIONS, new Response(JSON.stringify(Object.fromEntries(CONFIG.precache))));
      if (first) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // The versions in the order they took over; this one and the one before it are kept.
      const meta = await caches.open(META);
      const was = await meta.match("order");
      const order = (was ? await was.json().catch(() => []) : []).filter((v) => v !== CONFIG.version);
      order.push(CONFIG.version);
      const keep = new Set(order.slice(-2).map((v) => PREFIX + v));
      for (const name of await ours()) if (!keep.has(name)) await caches.delete(name);
      await meta.put("order", new Response(JSON.stringify(order.slice(-2))));
      await self.clients.claim();
      tell({ type: "kadal-sw:ready", version: CONFIG.version });
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "kadal-sw:update") self.skipWaiting();
});

async function cached(request) {
  for (const name of await ours()) {
    const hit = await (await caches.open(name)).match(request, { ignoreVary: true });
    if (hit) return hit;
  }
  return null;
}

async function forget() {
  for (const name of await ours()) await caches.delete(name);
  await caches.delete(META);
  await self.registration.unregister();
}

async function navigate(request, url) {
  if (starts(url.pathname, CONFIG.network)) return fetch(request);
  const shell = () => cached(CONFIG.scope);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, no) => setTimeout(() => no(new Error("slow")), 4000)),
    ]);
    if (res.status === 404 || res.status === 410) {
      if (url.pathname === CONFIG.scope || url.pathname === CONFIG.scope + "index.html") {
        await forget();
        return res;
      }
      return (await shell()) || res;
    }
    return res;
  } catch (e) {
    const hit = await shell();
    if (hit) return hit;
    throw e;
  }
}

async function ranged(request) {
  const hit = await cached(request.url);
  if (!hit) return fetch(request);
  const body = await hit.arrayBuffer();
  const size = body.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") || "");
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  }
  end = Math.min(end, size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { "content-range": "bytes */" + size } });
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      "content-type": hit.headers.get("content-type") || "application/octet-stream",
      "content-range": "bytes " + start + "-" + end + "/" + size,
      "content-length": String(end - start + 1),
      "accept-ranges": "bytes",
    },
  });
}

async function file(request) {
  const hit = await cached(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic" && !res.headers.get("content-type")?.includes("text/html")) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(CONFIG.scope) || starts(url.pathname, CONFIG.bypass)) return;
  if (request.mode === "navigate") event.respondWith(navigate(request, url));
  else if (request.headers.has("range")) event.respondWith(ranged(request));
  else event.respondWith(file(request));
});
`;
