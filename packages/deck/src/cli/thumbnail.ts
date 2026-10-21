import { readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";

import { HostError, request } from "./host.ts";
import { typeOf } from "./publish.ts";
import { freePort, SlideRenderer, stripAnsi } from "./render.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECK'S PICTURE  —  after `kadal-deck publish`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The host shows each deck as a picture of its first slide. Once a version is live, the CLI
 * photographs slide 1 of exactly what it just uploaded — the build in `.kadal-deck/publish`,
 * served at the base the host gave it — through the same print-view machinery `screenshot` uses,
 * at 640×360, and hands it to the host:
 *
 *   PUT /api/v1/decks/:id/thumbnail?version=N   (image/png, the publish token)
 *
 * It needs Playwright and Chromium, which a deck may not have; and an older host has no such
 * route. Neither is the publish's problem: a picture that can't be made or sent is skipped with
 * one line, and the publish still succeeds.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const THUMBNAIL_WIDTH = 640;

export interface ThumbnailOptions {
  /** The deck's folder (where Playwright may be installed). */
  dir: string;
  /** The build that was published. */
  outDir: string;
  /** The base it was built for, e.g. "/@me/talk/". */
  base: string;
  host: string;
  token: string;
  deckId: string;
  version: number;
  fetch?: typeof fetch;
  /** Swap the photographer (tests). */
  render?: (url: string) => Promise<Uint8Array>;
}

export type ThumbnailOutcome = { ok: true } | { ok: false; reason: string };

/** Make and send the picture; never throws. */
export async function publishThumbnail(o: ThumbnailOptions): Promise<ThumbnailOutcome> {
  let server: Server | null = null;
  try {
    const port = await freePort();
    server = await serveBuild(o.outDir, o.base, port);
    const url = `http://127.0.0.1:${port}${o.base}`;
    const png = await (o.render ?? ((u) => photograph(o.dir, u)))(url);
    await request(o.host, `/decks/${encodeURIComponent(o.deckId)}/thumbnail?version=${o.version}`, {
      method: "PUT",
      token: o.token,
      body: png,
      contentType: "image/png",
      fetch: o.fetch,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof HostError && (e.status === 404 || e.status === 405))
      return { ok: false, reason: "this host doesn't keep deck pictures yet" };
    const msg = stripAnsi(e instanceof Error ? e.message : String(e)).split("\n")[0]!;
    return { ok: false, reason: msg.slice(0, 160) };
  } finally {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  }
}

/** Slide 1 at THUMBNAIL_WIDTH, as the print view draws it: every step shown, backgrounds at rest. */
async function photograph(dir: string, url: string): Promise<Uint8Array> {
  const renderer = new SlideRenderer(dir, () => url);
  try {
    let { shots } = await renderer.render({ slides: [0], width: THUMBNAIL_WIDTH });
    // A hidden first slide: the first one the audience sees.
    if (!shots.length) shots = (await renderer.render({ width: THUMBNAIL_WIDTH })).shots.slice(0, 1);
    const shot = shots[0];
    if (!shot) throw new Error("the deck has no slide to picture");
    return new Uint8Array(shot.png);
  } finally {
    await renderer.close();
  }
}

/** The build, served at `base` as the host would serve it (unknown paths fall back to index.html). */
export function serveBuild(root: string, base: string, port: number): Promise<Server> {
  const top = normalize(root) + sep;
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    if (!path.startsWith(base)) {
      res.writeHead(404).end();
      return;
    }
    let file = normalize(join(root, path.slice(base.length)));
    if (!file.startsWith(top) && file !== normalize(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) file = join(file, "index.html");
    } catch {
      // A route of the deck (/presenter, …) or a missing asset: the app's page, as a host does.
      file = extname(file) ? file : join(root, "index.html");
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": typeOf(file) });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
