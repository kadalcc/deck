import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import type { ViteDevServer } from "vite";

import { isDrawingFile, parseSvg, toSvg } from "../draw/svg.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DRAWING FILES ON THE DEV SERVER  —  `drawings/<slide>.svg`, read and written
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `/__kadal/drawings` (serve mode only):
 *
 *   GET   every file in `drawings/` beside deck.mdx, as { files: { "<name>": "<svg>" } }
 *   PUT   { file, svg }: writes `drawings/<file>.svg` (an empty svg deletes it), then tells every
 *         page on the dev server (HMR event "kadal:drawings") so the others redraw
 *
 * A write must come from a page of this server (same origin, a JSON body, so a page elsewhere
 * cannot send one without a preflight it would fail), may only name a file in `drawings/`, and
 * is never written as sent: the SVG is read back into strokes and written out again, so what
 * lands on disk is the deck's own markup and nothing else.
 *
 * A build has no endpoint: `virtual:deck/drawings` bundles the files instead (draw/source.ts).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const DRAWINGS_ROUTE = "__kadal/drawings";
const MAX_BODY = 4 * 1024 * 1024;

/** `drawings/` beside the deck's entry file. */
export const drawingsDir = (entryPath: string) => join(dirname(entryPath), "drawings");

/** Every drawing file in the folder, by name without `.svg`. */
export function readDrawingFiles(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".svg")) continue;
    const base = name.slice(0, -4);
    const file = join(dir, name);
    if (!isDrawingFile(base) || !statSync(file).isFile()) continue;
    out[base] = readFileSync(file, "utf8");
  }
  return out;
}

/** `virtual:deck/drawings` in a build: the files, bundled. */
export function drawingsModule(dir: string): string {
  return `export default ${JSON.stringify(readDrawingFiles(dir))};\n`;
}

/** The manifest's `drawings` export: the dev server's endpoint, or the bundled files, or none. */
export function drawingsExport({
  building,
  base,
  dir,
}: {
  building: boolean;
  base: string;
  dir: string;
}): string {
  if (building)
    return Object.keys(readDrawingFiles(dir)).length
      ? `export const drawings = { load: () => import("virtual:deck/drawings").then((m) => m.default) };`
      : "export const drawings = null;";
  const url = JSON.stringify(`${base}${DRAWINGS_ROUTE}`);
  return `export const drawings = {
  load: () =>
    fetch(${url}, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { files: {} }))
      .then((j) => j.files ?? {}),
  save: (file, svg) =>
    fetch(${url}, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file, svg }),
    }).then((r) => {
      if (!r.ok) throw new Error("drawings: " + r.status);
    }),
  subscribe: (fn) => {
    const hot = import.meta.hot;
    if (!hot) return () => {};
    const on = (d) => d && typeof d.file === "string" && fn(d.file, String(d.svg ?? ""));
    hot.on("kadal:drawings", on);
    return () => hot.off?.("kadal:drawings", on);
  },
};`;
}

/** A request from a page this server served: the same host, and no other site's word for it. */
export function sameOrigin(req: Pick<IncomingMessage, "headers">): boolean {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin") return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** Read a written file back to the deck's markup, at the size the page drew it. */
export function cleanDrawing(svg: string, file: string): string {
  if (!svg.trim()) return "";
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(
    svg,
  );
  const width = Math.round(Number(vb?.[1]) || 0);
  const height = Math.round(Number(vb?.[2]) || 0);
  if (!(width > 0 && width <= 20000 && height > 0 && height <= 20000)) return "";
  return toSvg(parseSvg(svg, { width, height }, file), width, height);
}

/** Wire `/__kadal/drawings` into the dev server. */
export function drawingsDev(s: ViteDevServer, opts: { dir: () => string; base: () => string }) {
  s.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? "").split("?")[0]!;
    if (url !== `${opts.base()}${DRAWINGS_ROUTE}` && url !== `/${DRAWINGS_ROUTE}`) return next();
    const reply = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(body));
    };
    if (!sameOrigin(req)) return reply(403, { error: "cross-origin" });
    const dir = opts.dir();
    if (req.method === "GET") return reply(200, { files: readDrawingFiles(dir) });
    if (req.method !== "PUT" && req.method !== "POST") return reply(405, { error: "method" });
    if (!/^application\/json\b/i.test(String(req.headers["content-type"] ?? "")))
      return reply(415, { error: "json only" });
    let size = 0;
    const chunks: Buffer[] = [];
    let aborted = false;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        aborted = true;
        reply(413, { error: "too large" });
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      let body: { file?: unknown; svg?: unknown };
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return reply(400, { error: "bad json" });
      }
      const file = typeof body.file === "string" ? body.file : "";
      if (!isDrawingFile(file)) return reply(400, { error: "bad file name" });
      const svg = cleanDrawing(typeof body.svg === "string" ? body.svg : "", file);
      const path = join(dir, `${file}.svg`);
      try {
        if (svg) {
          mkdirSync(dir, { recursive: true });
          writeFileSync(path, svg);
        } else if (existsSync(path)) rmSync(path);
      } catch (err) {
        return reply(500, { error: err instanceof Error ? err.message : String(err) });
      }
      s.ws.send({ type: "custom", event: "kadal:drawings", data: { file, svg } });
      reply(200, { ok: true, file, bytes: svg.length });
    });
  });
}
