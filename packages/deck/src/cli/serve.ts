import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

import { typeOf } from "./publish.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `kadal-deck serve`  —  a built deck, served as a static host would
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   kadal-deck serve [folder] [--port 4173] [--host 0.0.0.0] [--base /talks/x/]
 *
 * For checking a build before it ships (offline mode, a sub-path, the PWA) and for a container
 * (the Docker recipe in cli/hosting.ts runs nothing else). Node's http, no dependencies:
 *
 *   - the base: found in the build (the asset URLs in index.html) unless --base says; `/` sends
 *     you there
 *   - the deck's routes (/presenter, /notes…) and any other extensionless path → index.html;
 *     a missing file with an extension → 404 (404.html when the build has one)
 *   - Range requests (a video seeks), HEAD, and cache headers a CDN would send: hashed assets
 *     immutable for a year, index.html, sw.js and the manifest revalidated every time
 *   - nothing outside the folder, ever (`..`, encoded or not)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface StaticServerOptions {
  /** The built folder. */
  root: string;
  /** The URL path it lives under, e.g. "/talks/x/". */
  base: string;
}

/** The base a build was made for: the folder of its entry script in index.html, else "/". */
export function detectBase(root: string): string {
  try {
    const html = readFileSync(join(root, "index.html"), "utf8");
    const m = /<script\b[^>]*\bsrc="(\/[^"]*?)assets\/[^"]+\.js"/i.exec(html);
    return m ? m[1]! : "/";
  } catch {
    return "/";
  }
}

const NO_CACHE = new Set(["index.html", "404.html", "sw.js", "manifest.webmanifest"]);

function cacheControl(rel: string): string {
  const name = rel.split("/").pop() ?? "";
  if (NO_CACHE.has(name) || name.endsWith(".html")) return "no-cache";
  if (rel.startsWith("assets/") || /-[A-Za-z0-9_]{8,}\.[a-z0-9]+$/.test(name))
    return "public, max-age=31536000, immutable";
  return "public, max-age=300";
}

const TYPES_EXTRA: Record<string, string> = {
  ".webmanifest": "application/manifest+json",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".ogv": "video/ogg",
};
const contentType = (file: string) => TYPES_EXTRA[extname(file).toLowerCase()] ?? typeOf(file);

/** The request handler on its own (tests drive it without a socket). */
export function staticHandler({ root, base }: StaticServerOptions) {
  const top = normalize(root) + sep;
  const b = base.endsWith("/") ? base : `${base}/`;
  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" }).end();
      return;
    }
    let path: string;
    try {
      path = decodeURIComponent((req.url ?? "/").split("?")[0]!.split("#")[0]!);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (!path.startsWith(b)) {
      // The deck's own address without its slash, or the server's root: send them to the deck.
      if (path === b.slice(0, -1) || path === "/") {
        res.writeHead(302, { location: b }).end();
        return;
      }
      res
        .writeHead(404, { "content-type": "text/plain; charset=utf-8" })
        .end(`Not found. The deck is at ${b}`);
      return;
    }
    const rel = path.slice(b.length);
    let file = normalize(join(root, rel));
    if (file !== normalize(root) && !file.startsWith(top)) {
      res.writeHead(403).end();
      return;
    }
    let status = 200;
    const isFile = (f: string) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    };
    if (!isFile(file)) {
      if (isFile(join(file, "index.html"))) file = join(file, "index.html");
      else if (!extname(file)) file = join(root, "index.html");
      else if (isFile(join(root, "404.html"))) {
        file = join(root, "404.html");
        status = 404;
      } else {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
        return;
      }
    }
    const size = statSync(file).size;
    const name = file
      .slice(normalize(root).length + 1)
      .split(sep)
      .join("/");
    const headers: Record<string, string> = {
      "content-type": contentType(file),
      "cache-control": cacheControl(name),
      "accept-ranges": "bytes",
      "x-content-type-options": "nosniff",
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range && status === 200 && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      let end = range[1] && range[2] ? Number(range[2]) : size - 1;
      end = Math.min(end, size - 1);
      if (start > end || start >= size) {
        res.writeHead(416, { "content-range": `bytes */${size}` }).end();
        return;
      }
      start = Math.max(0, start);
      res.writeHead(206, {
        ...headers,
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": String(end - start + 1),
      });
      if (req.method === "HEAD") res.end();
      else createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(status, { ...headers, "content-length": String(size) });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  };
}

export function startStaticServer(
  o: StaticServerOptions & { port: number; host: string },
): Promise<Server> {
  if (!existsSync(join(o.root, "index.html")))
    return Promise.reject(
      new Error(`${o.root} has no index.html. Run \`kadal-deck build\` first.`),
    );
  const server = createServer(staticHandler(o));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.port, o.host, () => resolve(server));
  });
}
