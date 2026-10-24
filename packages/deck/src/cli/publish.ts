import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";

import { DEFAULT_HOST, HostError, request } from "./host.ts";

/**
 * `kadal-deck publish`, the host's five steps:
 *
 *   1. POST /workspaces/:ws/decks {slug, title}      → the deck (create-or-get) and its `base`
 *   2. build with Vite `base` = that base (and the deck's editing kit, cli/sync.ts)
 *   3. POST /decks/:id/versions {files, source?, base, baseSourceHash?, force?, origin, kit?,
 *      meta?, showcase?}                               → 201 {version, missing: [sha256], sourceHash, base}
 *      409 {error: "diverged", head, base}             checked here already, before any upload
 *   4. PUT /blobs/:sha256 for each missing file        (content-addressed: unchanged files never travel;
 *                                                      source blobs too — the host never serves them)
 *   5. POST /decks/:id/versions/:v/commit[?force=1] {base, baseSourceHash?, force?}
 *                                                      → {url, version}
 *      409 {error: "diverged", head, base}             the deck changed on the web since `base`
 *      409 {error: "missing_blobs", missing}           send those, commit again
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

/** One editable source file, with its text (cli/sync.ts collects them). */
export interface SourceEntry {
  path: string;
  size: number;
  sha256: string;
  text: string;
}

/** The head the host reports when a commit's `base` is not the deck's current version. */
export interface DivergedHead {
  version: number;
  origin?: string | null;
  by?: string | null;
  at?: number | string | null;
  sourceHash?: string | null;
}

/** 409 diverged: the deck changed on the web since the version this tree last synced with. */
export class DivergedError extends Error {
  constructor(
    readonly head: DivergedHead,
    readonly base: number | null,
  ) {
    super(divergedMessage(head));
    this.name = "DivergedError";
  }
}

const ORIGIN_WORDS: Record<string, string> = {
  builder: "quick edit",
  mcp: "an agent's edit",
  rollback: "rollback",
  cli: "a CLI publish",
};

/** "v14 (quick edit by Asha, 25 Oct 14:02)" */
export function describeVersion(h: DivergedHead): string {
  const what = (h.origin && ORIGIN_WORDS[h.origin]) || h.origin || "an edit";
  const at = h.at ? when(h.at) : null;
  return `v${h.version} (${[`${what}${h.by ? ` by ${h.by}` : ""}`, at].filter(Boolean).join(", ")})`;
}

/** A timestamp (ms, s or ISO) as "25 Oct 14:02". */
export function when(at: number | string): string {
  const n = typeof at === "number" ? (at < 1e12 ? at * 1000 : at) : Date.parse(at);
  if (!Number.isFinite(n)) return String(at);
  const d = new Date(n);
  const month = d.toLocaleString("en-GB", { month: "short" });
  return `${d.getDate()} ${month} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function divergedMessage(h: DivergedHead): string {
  return `The deck changed on the web since your last sync: ${describeVersion(h)}. Run \`kadal-deck pull\` to merge their edits, or \`kadal-deck publish --force\` to replace them (they stay in version history).`;
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
  /** The deck's editable source (cli/sync.ts), stored privately beside the build. */
  source?: SourceEntry[] | null;
  /**
   * The version the local tree last synced with (null: never), and that version's source hash,
   * for the host's compare-and-swap. A 0.5+ CLI always sends `base`: its absence is how the host
   * tells a 0.4 CLI, which publishes without the check.
   */
  base?: (deck: PublishedDeck) => { version: number | null; sourceHash: string | null };
  /** Replace the head even when it moved (`--force`). */
  force?: boolean;
  /** kit.json, when the build made a kit. */
  kit?: () => unknown;
  /** For the host's lists and the showcase: the resolved theme and the slide count. */
  meta?: { theme: string; slides: number } | null;
  /** `--showcase` / `--no-showcase`; undefined leaves the setting alone. */
  showcase?: boolean;
  /** Called once the deck is known, before the build (cli/sync.ts warns about web drafts). */
  onDeck?: (deck: PublishedDeck) => Promise<void> | void;
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
  await o.onDeck?.(deck);

  // 2 · the build, for where the host serves it
  await o.build(deck.base, o.outDir);

  // 3 · the manifest
  const files = await manifestOf(o.outDir);
  if (!files.some((f) => f.path === "index.html"))
    throw new Error(`The build in ${o.outDir} has no index.html — is this a deck folder?`);
  const bytes = files.reduce((n, f) => n + f.size, 0);
  log(`manifest ${files.length} files, ${formatBytes(bytes)}`);
  const synced = o.base ? o.base(deck) : undefined;
  const base = synced?.version;
  // The compare-and-swap fields, on create (checked early, before any upload) and on commit.
  const cas = synced
    ? {
        base: synced.version,
        ...(synced.sourceHash ? { baseSourceHash: synced.sourceHash } : {}),
        ...(o.force ? { force: true } : {}),
      }
    : {};
  const diverged = (e: unknown): never => {
    const body = (e as HostError).body as { error?: string; head?: DivergedHead; base?: number | null } | null;
    if (e instanceof HostError && e.status === 409 && body?.error === "diverged" && body.head)
      throw new DivergedError(body.head, body.base ?? base ?? null);
    throw e;
  };
  const kit = o.kit?.() ?? null;
  const { data: created } = await request<{ version: number; missing: string[] }>(
    o.host,
    `/decks/${encodeURIComponent(deck.id)}/versions${o.force ? "?force=1" : ""}`,
    {
      ...http,
      json: {
        files,
        origin: "cli",
        ...(o.source ? { source: o.source.map(({ path, size, sha256 }) => ({ path, size, sha256 })) } : {}),
        ...cas,
        ...(kit ? { kit } : {}),
        ...(o.meta ? { meta: o.meta } : {}),
        ...(o.showcase !== undefined ? { showcase: o.showcase } : {}),
      },
    },
  ).catch(diverged);

  // 4 · only what the host has never seen
  type Upload = { sha256: string; size: number; type: string; read: () => Promise<Uint8Array> };
  const bySha = new Map<string, Upload>();
  for (const s of o.source ?? [])
    bySha.set(s.sha256, {
      sha256: s.sha256,
      size: s.size,
      type: "text/plain; charset=utf-8",
      read: async () => new TextEncoder().encode(s.text),
    });
  for (const f of files)
    bySha.set(f.sha256, {
      ...f,
      read: async () => new Uint8Array(await readFile(join(o.outDir, ...f.path.split("/")))),
    });
  const upload = async (shas: string[]) => {
    const queue = shas.map((s) => bySha.get(s)).filter((f): f is Upload => !!f);
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const f = queue[next++]!;
        const body = await f.read();
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

  // 5 · make it current (once more if the host says something didn't arrive), against `base`:
  // the host refuses with 409 diverged when the deck moved on the web, unless forced.
  const commit = () =>
    request<{ url: string; version: number }>(
      o.host,
      `/decks/${encodeURIComponent(deck.id)}/versions/${created.version}/commit${o.force ? "?force=1" : ""}`,
      { ...http, method: "POST", json: cas },
    ).catch(diverged);
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
    deck: { ...deck, url: publicUrl(o.host, deck.url || deck.base) },
    version: created.version,
    url: publicUrl(o.host, done.url || deck.base),
    files: files.length,
    uploaded: created.missing.length,
    bytes,
    uploadedBytes,
  };
}

/** Where decks live when the default host answers with only a path. */
export const DEFAULT_DECKS_URL = "https://decks.kadal.cc";

/**
 * The deck's address as a person can open it. A host whose decks origin is unset answers with a
 * bare path (`/@ana/talk/`), which printed on its own is no use to anyone: the path is resolved
 * against the decks origin for the default host, and against the host's own origin otherwise
 * (where a self-hosted host without a separate decks origin serves them).
 */
export function publicUrl(host: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const origin = host === DEFAULT_HOST ? DEFAULT_DECKS_URL : new URL(host).origin;
  return new URL(url, `${origin}/`).toString();
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
