import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";

import { HostError, request } from "./host.ts";
import { typeOf } from "./publish.ts";
import { freePort, SlideRenderer, stripAnsi } from "./render.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECK'S PICTURE  —  after `kadal-deck publish`, and `kadal-deck thumbnail`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The host shows each deck as a picture of its first slide. Once a version is live, the CLI
 * photographs slide 1 of exactly what it just uploaded — the build in `.kadal-deck/publish`,
 * served at the base the host gave it — through the same print-view machinery `screenshot` uses,
 * at 640×360, and hands it to the host:
 *
 *   PUT /api/v1/decks/:id/thumbnail?version=N[&scheme=dark|light]   (image/png, the publish token)
 *
 * `kadal-deck thumbnail` takes it again for a version already live, without publishing: the build
 * is read from the host file by file (GET /decks/:id/files, /files/:sha) instead of from disk.
 *
 * AS PEOPLE SEE IT. Two things the host does to a published deck are done here too, or the
 * picture is of a different slide than visitors get:
 *   - `pro/` backgrounds and layouts. The host writes a premium base into an entitled deck's page;
 *     without one the engine draws the theme's fallback. The local server writes one too, and
 *     answers it from the host's account route (`/api/v1/premium/w/<workspace>/…`, the token), so
 *     the deck's workspace plan decides exactly as it does live: a Free deck gets the fallback.
 *   - light or dark. A deck with a fixed `colorScheme` is pictured in it, and sent without a
 *     scheme: its only picture. One that follows the viewer (`auto`, the default) is pictured
 *     both ways, sent as `&scheme=dark` then `&scheme=light`, for the host to show each to a
 *     dashboard in that scheme. Dark goes first: a host that predates schemes keeps the last
 *     picture it was sent, which is then the light one, as before.
 * The print view waits for those `pro/` items, and the picture waits for the network to go quiet.
 *
 * It needs Playwright and Chromium, which a deck may not have; and an older host has no such
 * route. Neither is the publish's problem: a picture that can't be made or sent is skipped with
 * one line, and the publish still succeeds.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const THUMBNAIL_WIDTH = 640;

export type Scheme = "light" | "dark";

/** A picture of slide 1, and the scheme the deck was drawn in. */
export interface Shot {
  png: Uint8Array;
  scheme: Scheme;
}

/** One picture to send: `variant` null is the deck's only picture; else one of a light/dark pair. */
export interface Picture {
  png: Uint8Array;
  variant: Scheme | null;
}

/** Bytes of one file of a build, by its path inside the build; null when there is none. */
export type BuildFiles = (path: string) => Promise<Uint8Array | null>;

export interface ThumbnailOptions {
  /** The deck's folder (where Playwright may be installed). */
  dir: string;
  /** The build that was published: a folder, or files read from the host. */
  outDir?: string;
  files?: BuildFiles;
  /** The base it was built for, e.g. "/@me/talk/". */
  base: string;
  host: string;
  token: string;
  deckId: string;
  version: number;
  /** The deck's workspace: its `pro/` items are fetched through the host as this workspace's. */
  workspace?: string;
  fetch?: typeof fetch;
  /** Swap the photographer (tests). */
  render?: (url: string, scheme: Scheme) => Promise<Shot>;
  /** Keep the pictures instead of sending them (`kadal-deck thumbnail --out`). */
  keep?: (pictures: Picture[]) => Promise<void>;
}

export type ThumbnailOutcome =
  | { ok: true; schemes: "both" | "fixed" }
  | { ok: false; reason: string };

/** Make and send the picture(s); never throws. */
export async function publishThumbnail(o: ThumbnailOptions): Promise<ThumbnailOutcome> {
  let server: Server | null = null;
  let renderer: SlideRenderer | null = null;
  try {
    const source = o.files ?? o.outDir;
    if (!source) throw new Error("no build to picture");
    const port = await freePort();
    server = await serveBuild(source, o.base, port, {
      premium: o.workspace
        ? premiumFromHost({ host: o.host, token: o.token, workspace: o.workspace, fetch: o.fetch })
        : undefined,
    });
    const url = `http://127.0.0.1:${port}${o.base}`;
    let render = o.render;
    if (!render) {
      const r = (renderer = new SlideRenderer(o.dir, () => url));
      render = (_u, scheme) => photograph(r, scheme);
    }
    const shoot = render;
    const pictures = await picturesOf((scheme) => shoot(url, scheme));
    if (o.keep) await o.keep(pictures);
    else
      for (const p of pictures)
        // oxlint-disable-next-line no-await-in-loop -- in order: the dark one first (see above)
        await request(
          o.host,
          `/decks/${encodeURIComponent(o.deckId)}/thumbnail?version=${o.version}${p.variant ? `&scheme=${p.variant}` : ""}`,
          { method: "PUT", token: o.token, body: p.png, contentType: "image/png", fetch: o.fetch },
        );
    return { ok: true, schemes: pictures.length > 1 ? "both" : "fixed" };
  } catch (e) {
    if (e instanceof HostError && (e.status === 404 || e.status === 405))
      return { ok: false, reason: "this host doesn't keep deck pictures yet" };
    const msg = stripAnsi(e instanceof Error ? e.message : String(e)).split("\n")[0]!;
    return { ok: false, reason: msg.slice(0, 160) };
  } finally {
    await renderer?.close().catch(() => {});
    if (server) await closeServer(server);
  }
}

/**
 * Stop the build server without waiting on what's still in flight. close() waits for every open
 * request, and one still waiting on the host (a premium picture the host never answered) kept
 * `thumbnail --all` waiting for hours; Bun's closeAllConnections() doesn't cut those, so give up
 * after `wait` ms. The CLI exits when its command returns, so nothing is left running.
 */
export function closeServer(server: Server, wait = 5_000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, wait);
    timer.unref?.();
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
    server.closeAllConnections?.();
  });
}

/**
 * The pictures a deck needs. Asked for light, a deck that comes back dark is a dark deck: one
 * picture. Otherwise asked for dark: back light, a light deck (one picture); back dark, it follows
 * the viewer, and both are kept — the dark one first (see above).
 */
export async function picturesOf(shoot: (scheme: Scheme) => Promise<Shot>): Promise<Picture[]> {
  const light = await shoot("light");
  if (light.scheme === "dark") return [{ png: light.png, variant: null }];
  const dark = await shoot("dark");
  if (dark.scheme === "light") return [{ png: light.png, variant: null }];
  return [
    { png: dark.png, variant: "dark" },
    { png: light.png, variant: "light" },
  ];
}

/**
 * Slide 1 at THUMBNAIL_WIDTH, as the print view draws it: every step shown, backgrounds at rest.
 * The first slide the audience sees (`range` 1: a hidden first slide is skipped), laid out alone.
 */
async function photograph(renderer: SlideRenderer, scheme: Scheme): Promise<Shot> {
  const r = await renderer.render({ width: THUMBNAIL_WIDTH, scheme, settle: true, range: "1" });
  const shot = r.shots[0];
  if (!shot) throw new Error("the deck has no slide to picture");
  return { png: new Uint8Array(shot.png), scheme: r.scheme };
}

/** A build folder on disk. */
export function localFiles(root: string): BuildFiles {
  const top = normalize(root) + sep;
  return async (path) => {
    const file = normalize(join(root, path));
    if (!file.startsWith(top)) return null;
    try {
      return new Uint8Array(await readFile(file));
    } catch {
      return null; // missing, or a folder
    }
  };
}

/** A published version's files, read from the host by hash as they are asked for. */
export function hostFiles(o: {
  host: string;
  token: string;
  deckId: string;
  files: Array<{ path: string; sha256: string }>;
  fetch?: typeof fetch;
}): BuildFiles {
  const sha = new Map(o.files.map((f) => [f.path, f.sha256]));
  const cache = new Map<string, Promise<Uint8Array | null>>();
  const doFetch = o.fetch ?? fetch;
  return (path) => {
    const hash = sha.get(path);
    if (!hash) return Promise.resolve(null);
    let got = cache.get(hash);
    if (!got) {
      got = doFetch(`${o.host}/api/v1/decks/${encodeURIComponent(o.deckId)}/files/${hash}`, {
        headers: { authorization: `Bearer ${o.token}` },
      }).then(async (res) => {
        if (!res.ok) throw new Error(`the host answered ${res.status} for ${path}`);
        return new Uint8Array(await res.arrayBuffer());
      });
      cache.set(hash, got);
    }
    return got;
  };
}

/** The premium library, through the host's account route, as the deck's workspace. */
export function premiumFromHost(o: {
  host: string;
  token: string;
  workspace: string;
  fetch?: typeof fetch;
}): (path: string) => Promise<Response> {
  const doFetch = o.fetch ?? fetch;
  return (path) =>
    doFetch(`${o.host}/api/v1/premium/w/${encodeURIComponent(o.workspace)}/${path}`, {
      headers: { authorization: `Bearer ${o.token}` },
      // A picture the host never answers would hold the page (and the server's close) forever.
      signal: AbortSignal.timeout(60_000),
    });
}

/** Where a build served at `base` finds the premium library (as on the host). */
export const premiumPrefix = (base: string) => `${base}__kadal/premium/`;

/** The page global the host writes, with only what a picture needs: the premium base. */
export function withPremiumBase(html: string, base: string): string {
  const conf = JSON.stringify({ premium: premiumPrefix(base) }).replace(/</g, "\\u003c");
  const tag = `<script>window.__KADAL_DECK__=${conf}</script>`;
  // Before the deck's own scripts, which read it as they start.
  let at = html.search(/<script\b/i);
  if (at < 0) at = html.search(/<\/head>/i);
  return at < 0 ? tag + html : html.slice(0, at) + tag + html.slice(at);
}

/**
 * The build, served at `base` as the host would serve it (unknown paths fall back to index.html).
 * With `premium`, the page carries a premium base under the deck, answered by that function.
 */
export function serveBuild(
  source: string | BuildFiles,
  base: string,
  port: number,
  opts: { premium?: (path: string) => Promise<Response> } = {},
): Promise<Server> {
  const files = typeof source === "string" ? localFiles(source) : source;
  const premium = premiumPrefix(base);
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent((req.url ?? "/").split("?")[0]!);
      if (!path.startsWith(base)) {
        res.writeHead(404).end();
        return;
      }
      if (opts.premium && path.startsWith(premium)) {
        const up = await opts.premium(path.slice(premium.length));
        res.writeHead(up.status, {
          "content-type": up.headers.get("content-type") ?? "application/octet-stream",
        });
        res.end(new Uint8Array(await up.arrayBuffer()));
        return;
      }
      const rel = path.slice(base.length);
      if (rel.split("/").includes("..")) {
        res.writeHead(403).end();
        return;
      }
      const tries =
        rel === "" || rel.endsWith("/") ? [`${rel}index.html`] : [rel, `${rel}/index.html`];
      // A route of the deck (/presenter, …): the app's page, as a host does. A missing asset: 404.
      if (extname(rel) === "") tries.push("index.html");
      for (const name of tries) {
        // oxlint-disable-next-line no-await-in-loop -- the first that exists, in order
        const body = await files(name);
        if (!body) continue;
        res.writeHead(200, { "content-type": typeOf(name) });
        if (opts.premium && name.endsWith("index.html"))
          res.end(withPremiumBase(new TextDecoder().decode(body), base));
        else res.end(body);
        return;
      }
      res.writeHead(404).end();
    } catch {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/** What GET /decks/:id/files says about the live version. */
export interface LiveFiles {
  id: string;
  handle: string;
  slug: string;
  version: number;
  base: string;
  files: Array<{ path: string; sha256: string }>;
}

export interface RefreshOptions {
  dir: string;
  host: string;
  token: string;
  deckId: string;
  fetch?: typeof fetch;
  render?: ThumbnailOptions["render"];
  keep?: ThumbnailOptions["keep"];
}

export type RefreshOutcome = ThumbnailOutcome & { version?: number; base?: string };

/** `kadal-deck thumbnail`: the live version's picture again, from the files the host serves. */
export async function refreshThumbnail(o: RefreshOptions): Promise<RefreshOutcome> {
  let live: LiveFiles;
  try {
    ({ data: live } = await request<LiveFiles>(
      o.host,
      `/decks/${encodeURIComponent(o.deckId)}/files`,
      { token: o.token, fetch: o.fetch },
    ));
  } catch (e) {
    return { ok: false, reason: (e instanceof Error ? e.message : String(e)).split("\n")[0]! };
  }
  const outcome = await publishThumbnail({
    dir: o.dir,
    files: hostFiles({
      host: o.host,
      token: o.token,
      deckId: live.id,
      files: live.files,
      fetch: o.fetch,
    }),
    base: live.base,
    host: o.host,
    token: o.token,
    deckId: live.id,
    version: live.version,
    workspace: live.handle,
    fetch: o.fetch,
    render: o.render,
    keep: o.keep,
  });
  return { ...outcome, version: live.version, base: live.base };
}
