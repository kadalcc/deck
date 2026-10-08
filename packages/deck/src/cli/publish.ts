import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";

import { HostError, request } from "./host.ts";

/**
 * `kadal-deck publish`, the host's five steps:
 *
 *   1. POST /workspaces/:ws/decks {slug, title}      → the deck (create-or-get) and its `base`
 *   2. build with Vite `base` = that base
 *   3. POST /decks/:id/versions {files: manifest}      → {version, missing: [sha256]}
 *   4. PUT /blobs/:sha256 for each missing file        (content-addressed: unchanged files never travel)
 *   5. POST /decks/:id/versions/:v/commit             → {url}
 */

export interface PublishedDeck {
  id: string;
  slug: string;
  title: string;
  url: string;
  base: string;
}

export interface ManifestEntry {
  path: string;
  size: number;
  sha256: string;
  type: string;
}

export interface PublishOptions {
  host: string;
  token: string;
  workspace: string;
  slug: string;
  title?: string;
  /** Builds the deck for `base` into `outDir`. */
  build: (base: string, outDir: string) => Promise<void>;
  outDir: string;
  concurrency?: number;
  retries?: number;
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

export interface PublishResult {
  deck: PublishedDeck;
  version: number;
  url: string;
  files: number;
  uploaded: number;
  bytes: number;
  uploadedBytes: number;
}

export async function publish(o: PublishOptions): Promise<PublishResult> {
  const log = o.log ?? (() => {});
  const http = { token: o.token, fetch: o.fetch };

  // 1 · the deck
  const { data: deck } = await request<PublishedDeck>(
    o.host,
    `/workspaces/${encodeURIComponent(o.workspace)}/decks`,
    { ...http, json: { slug: o.slug, ...(o.title ? { title: o.title } : {}) } },
  );
  log(`deck     ${deck.id}  ${deck.base}`);

  // 2 · the build, for where the host serves it
  await o.build(deck.base, o.outDir);

  // 3 · the manifest
  const files = await manifestOf(o.outDir);
  if (!files.some((f) => f.path === "index.html"))
    throw new Error(`The build in ${o.outDir} has no index.html — is this a deck folder?`);
  const bytes = files.reduce((n, f) => n + f.size, 0);
  log(`manifest ${files.length} files, ${formatBytes(bytes)}`);
  const { data: created } = await request<{ version: number; missing: string[] }>(
    o.host,
    `/decks/${encodeURIComponent(deck.id)}/versions`,
    { ...http, json: { files } },
  );

  // 4 · only what the host has never seen
  const bySha = new Map(files.map((f) => [f.sha256, f]));
  const upload = async (shas: string[]) => {
    const queue = shas.map((s) => bySha.get(s)).filter((f): f is ManifestEntry => !!f);
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const f = queue[next++];
        const body = new Uint8Array(await readFile(join(o.outDir, ...f.path.split("/"))));
        await withRetries(
          () =>
            request(o.host, `/blobs/${f.sha256}`, {
              ...http,
              method: "PUT",
              body,
              contentType: f.type,
            }),
          o.retries ?? 3,
        );
      }
    };
    await Promise.all(Array.from({ length: Math.min(o.concurrency ?? 6, queue.length) }, worker));
    return queue.reduce((n, f) => n + f.size, 0);
  };
  let uploadedBytes = await upload(created.missing);
  log(`upload   ${created.missing.length} new file(s), ${formatBytes(uploadedBytes)}`);

  // 5 · make it current (once more if the host says something didn't arrive)
  const commit = () =>
    request<{ url: string; version: number }>(
      o.host,
      `/decks/${encodeURIComponent(deck.id)}/versions/${created.version}/commit`,
      { ...http, method: "POST", json: {} },
    );
  let done: { url: string; version: number };
  try {
    done = (await commit()).data;
  } catch (e) {
    const missing = (e as HostError).status === 409 ? missingOf((e as HostError).body) : [];
    if (!missing.length) throw e;
    log(`retry    the host is missing ${missing.length} file(s); sending them again`);
    uploadedBytes += await upload(missing);
    done = (await commit()).data;
  }
  return {
    deck,
    version: created.version,
    url: done.url,
    files: files.length,
    uploaded: created.missing.length,
    bytes,
    uploadedBytes,
  };
}

function missingOf(body: unknown): string[] {
  const m = (body as { missing?: unknown } | null)?.missing;
  return Array.isArray(m) ? m.filter((s): s is string => typeof s === "string") : [];
}

/** Retry network failures and 5xx/429 answers with backoff; anything else is the caller's error. */
async function withRetries<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = e instanceof HostError ? e.status : 0;
      const transient = status === 0 || status === 429 || status >= 500;
      if (!transient || attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
}

/** Every file under `dir`, with forward-slash paths, sizes, SHA-256 and a content type. */
export async function manifestOf(dir: string): Promise<ManifestEntry[]> {
  const out: ManifestEntry[] = [];
  const walk = async (d: string): Promise<void> => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const data = await readFile(full);
        out.push({
          path: relative(dir, full).split(sep).join("/"),
          size: (await stat(full)).size,
          sha256: createHash("sha256").update(data).digest("hex"),
          type: typeOf(full),
        });
      }
    }
  };
  await walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".py": "text/plain; charset=utf-8",
  ".excalidraw": "application/json",
};

export function typeOf(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** A slug the host accepts (lowercase letters, digits, hyphens; max 64), from a folder name. */
export function slugFrom(name: string): string {
  const s = basename(name)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);
  return /^[a-z0-9]/.test(s) ? s : `deck-${s}`.slice(0, 64).replace(/-+$/, "") || "deck";
}

/** The `title:` from deck.mdx's headmatter, when there is one. */
export function titleFrom(mdx: string): string | undefined {
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(mdx)?.[1];
  const raw = head ? /^title:\s*(.+)$/m.exec(head)?.[1]?.trim() : undefined;
  return raw ? raw.replace(/^(["'])(.*)\1$/, "$2").slice(0, 140) : undefined;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
