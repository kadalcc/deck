import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, relative, resolve, sep } from "node:path";
import type { ViteDevServer } from "vite";

import { EditError, replaceCode } from "../authoring/edit.ts";
import { extractRegion, replaceRegion } from "../compiler/snippets.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /__kadal/monaco-write — `{monaco-write}` saves, in `kadal-deck dev` only
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An editor on a slide that writes back to the source: either the file a `<<<` import read (the
 * region it showed, re-indented as it was; the whole file without a region), or the fence in
 * deck.mdx itself (through authoring/edit.ts's `replaceCode`, so every other byte of the deck
 * stays as it was). The request says what the editor last knew (`original`); if the file no
 * longer holds that, the save is refused rather than overwriting an edit made elsewhere.
 *
 * Guarded the way every dev write is: same origin only (the Origin header must be this server),
 * JSON only, a size cap, and only files inside the deck's root (Vite's root). Registered only by
 * `configureServer`, so a build has no such endpoint and its editors are read-only.
 *
 * A save would normally be seen by the watcher and reload the page under the presenter's
 * fingers; `quiet` is told about each file written so the plugin can refresh its caches
 * without a reload.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MonacoWriteOptions {
  /** Vite's root: nothing outside it is written. */
  root: () => string;
  /** The deck file (absolute). */
  entry: () => string;
  /** A file this endpoint just wrote, with its new text. */
  quiet: (file: string, text: string) => void;
}

const MAX = 1 << 20;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX) {
        fail(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}

const reply = (res: ServerResponse, status: number, body: object) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

/** The request came from a page of this server (or a tool with no Origin at all, like curl). */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin")
    return false;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function monacoWriteDev(server: ViteDevServer, o: MonacoWriteOptions): void {
  server.middlewares.use(async (req, res, next) => {
    const url = (req.url ?? "").split("?")[0]!;
    if (!url.endsWith("/__kadal/monaco-write")) return next();
    if (req.method !== "POST") return reply(res, 405, { ok: false, error: "POST only" });
    if (!sameOrigin(req))
      return reply(res, 403, { ok: false, error: "cross-origin request refused" });
    if (!/^application\/json\b/.test(req.headers["content-type"] ?? ""))
      return reply(res, 415, { ok: false, error: "JSON only" });
    let body: { slide?: unknown; snippet?: unknown; original?: unknown; code?: unknown };
    try {
      body = JSON.parse(await readBody(req)) as typeof body;
    } catch {
      return reply(res, 400, { ok: false, error: "unreadable request" });
    }
    const { slide, snippet, original, code } = body;
    if (typeof code !== "string" || typeof original !== "string")
      return reply(res, 400, { ok: false, error: "code and original must be strings" });
    const root = resolve(o.root());
    const inside = (file: string) => file === root || file.startsWith(root + sep);
    const entry = o.entry();
    const write = (file: string, text: string) => {
      if (!inside(file))
        throw new EditError(`${file} is outside the deck's folder; it is not written`);
      o.quiet(file, text);
      writeFileSync(file, text);
    };
    try {
      if (typeof snippet === "string" && snippet) {
        const hash = snippet.indexOf("#");
        const path = hash < 0 ? snippet : snippet.slice(0, hash);
        const region = hash < 0 ? null : snippet.slice(hash + 1) || null;
        const file = resolve(dirname(entry), path);
        if (!inside(file) || !existsSync(file) || !statSync(file).isFile())
          return reply(res, 404, {
            ok: false,
            error: `${path} is not a file in the deck's folder`,
          });
        const text = readFileSync(file, "utf8");
        const now = extractRegion(text, region);
        if (!now)
          return reply(res, 409, { ok: false, error: `region ${region} is no longer in ${path}` });
        if (now.code !== original.replace(/\r\n/g, "\n").replace(/\n$/, ""))
          return reply(res, 409, {
            ok: false,
            error: `${path} changed since the slide was loaded; reload to edit it`,
          });
        const next = replaceRegion(text, region, code);
        if (next === null)
          return reply(res, 409, {
            ok: false,
            error: `region ${region} holds regions of its own, which the editor does not show; edit the file instead`,
          });
        write(file, next);
        return reply(res, 200, { ok: true, file: relative(root, file) });
      }
      if (typeof slide !== "number")
        return reply(res, 400, { ok: false, error: "slide must be a number" });
      const files = {
        entry,
        read: (p: string) =>
          existsSync(p) && statSync(p).isFile() ? readFileSync(p, "utf8") : null,
      };
      const result = replaceCode(files, slide, original, code);
      const written = Object.entries(result.files);
      for (const [file, text] of written) write(resolve(file), text);
      return reply(res, 200, {
        ok: true,
        file: written[0] ? relative(root, resolve(written[0][0])) : null,
      });
    } catch (err) {
      const status = err instanceof EditError ? 409 : 500;
      return reply(res, status, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
