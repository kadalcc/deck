import { createHash } from "node:crypto";

import { canonicalManifest, isEditablePath } from "../sync/manifest.ts";

/**
 * An in-memory Kadal Deck host for tests: the parts of /api/v1 that publish and sync speak, with
 * the compare-and-swap of the quick-edit contract. Not shipped (tests only import it).
 *
 *   POST /workspaces/:ws/decks            create-or-get {id, slug, title, url, base}
 *   GET  /workspaces/:ws/decks            [{id, slug, …}]
 *   POST /decks/:id/versions[?force=1]    {files, source?, base?, baseSourceHash?, force?, origin?,
 *                                         kit?, meta?, showcase?}
 *        → 201 {version, missing, sourceHash, base}; 400 bad_source_path {path}; 413
 *          source_too_large; 422 too many source files; 422 not_public; 409 diverged {head, base}
 *   PUT  /blobs/:sha                      the bytes
 *   POST /decks/:id/versions/:v/commit[?force=1] {base?, baseSourceHash?, force?}
 *        → {ok, version, url, sourceHash, forced}; 409 missing_blobs {missing}; 409 diverged
 *   GET  /decks/:id/sync                  {head, draft, quickEdit, kind, reason}
 *   GET  /decks/:id/source?version=N|head[&include=text]
 *        → {version, origin, parent, sourceHash, kitVersion, by, at, files[{path,sha256,size,text?}]}; 404 no_source
 *
 * The compare-and-swap (absent `base` key = a 0.4 CLI, no check) passes when there is no head,
 * the head is the base, the head's source hash is the base's (or `baseSourceHash`), or the new
 * source hash is the head's; otherwise 409 diverged. It runs at create and again at commit.
 *   GET  /decks/:id/source/blobs/:sha     bytes
 *   GET  /decks/:id/versions              [{version, origin, by, createdAt, current}]
 */

const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

export interface FakeVersion {
  version: number;
  files: Record<string, { sha256: string; size: number }>;
  source: Record<string, { sha256: string; size: number }> | null;
  sourceHash: string | null;
  origin: string;
  parent: number | null;
  by: string;
  at: number;
  committed: boolean;
  body: Record<string, unknown>;
}

export interface FakeDeck {
  id: string;
  slug: string;
  title: string;
  visibility: "public" | "private";
  current: number | null;
  versions: FakeVersion[];
  draft: {
    id: string;
    rev: number;
    baseVersion: number | null;
    dirty: boolean;
    updatedAt: number;
    updatedBy: string;
  } | null;
}

export class FakeHost {
  readonly url = "https://host.test";
  readonly blobs = new Map<string, Uint8Array>();
  readonly decks = new Map<string, FakeDeck>();
  readonly calls: string[] = [];
  /** Answer like a host from before sync (no /sync, no /source, no CAS). */
  legacy = false;
  private n = 0;

  sourceHash(source: Record<string, { sha256: string }> | null): string | null {
    return source ? sha(canonicalManifest(source)) : null;
  }

  deckBySlug(slug: string): FakeDeck | undefined {
    return [...this.decks.values()].find((d) => d.slug === slug);
  }

  head(d: FakeDeck): FakeVersion | null {
    return d.versions.find((v) => v.version === d.current) ?? null;
  }

  /** A quick edit published from the builder: a new version with this source. */
  webEdit(slug: string, files: Record<string, string>, by = "Asha", origin = "builder"): number {
    const d = this.deckBySlug(slug)!;
    const prev = this.head(d)!;
    const source: Record<string, { sha256: string; size: number }> = {};
    for (const [path, text] of Object.entries(files)) {
      const bytes = new TextEncoder().encode(text);
      const h = sha(bytes);
      this.blobs.set(h, bytes);
      source[path] = { sha256: h, size: bytes.byteLength };
    }
    const version = d.versions.length + 1;
    d.versions.push({
      version,
      files: prev.files,
      source,
      sourceHash: this.sourceHash(source),
      origin,
      parent: prev.version,
      by,
      at: Date.UTC(2026, 9, 25, 14, 2) + version,
      committed: true,
      body: {},
    });
    d.current = version;
    return version;
  }

  /** The text of a version's source files. */
  sourceOf(slug: string, version?: number): Record<string, string> {
    const d = this.deckBySlug(slug)!;
    const v = version ? d.versions.find((x) => x.version === version)! : this.head(d)!;
    return Object.fromEntries(
      Object.entries(v.source ?? {}).map(([p, f]) => [
        p,
        new TextDecoder().decode(this.blobs.get(f.sha256)!),
      ]),
    );
  }

  readonly fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api\/v1/, "");
    this.calls.push(`${method} ${path}${url.search}`);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    const fail = (status: number, error: string, message: string, extra: object = {}) =>
      json(status, { error, message, ...extra });
    const body = () => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    let m: RegExpExecArray | null;

    if (path === "/me") return json(200, { user: { email: "t@x" }, current: { handle: "ana" } });
    if ((m = /^\/workspaces\/([^/]+)\/decks$/.exec(path))) {
      if (method === "GET")
        return json(
          200,
          [...this.decks.values()].map((d) => ({ id: d.id, slug: d.slug, title: d.title })),
        );
      const b = body();
      let d = this.deckBySlug(String(b.slug));
      if (!d) {
        d = {
          id: `d${++this.n}`,
          slug: String(b.slug),
          title: String(b.title ?? b.slug),
          visibility: "public",
          current: null,
          versions: [],
          draft: null,
        };
        this.decks.set(d.id, d);
      }
      return json(200, {
        id: d.id,
        slug: d.slug,
        title: d.title,
        url: `/@ana/${d.slug}/`,
        base: `/@ana/${d.slug}/`,
      });
    }
    if ((m = /^\/blobs\/([0-9a-f]{64})$/.exec(path)) && method === "PUT") {
      const bytes = new Uint8Array(init!.body as Uint8Array);
      if (sha(bytes) !== m[1]) return fail(400, "bad_hash", "The bytes do not match their hash.");
      this.blobs.set(m[1]!, bytes);
      return json(200, { ok: true });
    }
    if (!(m = /^\/decks\/([^/]+)(\/.*)?$/.exec(path)))
      return fail(404, "http_404", "404 Not Found");
    const d = this.decks.get(m[1]!);
    if (!d) return fail(404, "not_found", "No such deck.");
    const rest = m[2] ?? "";

    if (rest === "/versions" && method === "GET")
      return json(
        200,
        d.versions
          .filter((v) => v.committed)
          .reverse()
          .map((v) => ({
            version: v.version,
            by: v.by,
            createdAt: v.at,
            current: v.version === d.current,
            ...(this.legacy ? {} : { origin: v.origin, parent: v.parent }),
          })),
      );
    /** The CAS of the quick-edit contract; null when it passes. */
    const cas = (b: Record<string, unknown>, newHash: string | null) => {
      const force = url.searchParams.get("force") === "1" || b.force === true;
      const head = this.head(d);
      if (this.legacy || force || !head || !("base" in b)) return null;
      const base = typeof b.base === "number" ? b.base : null;
      if (head.version === base) return null;
      const known =
        base === null ? undefined : d.versions.find((x) => x.version === base)?.sourceHash;
      const baseHash = known ?? (typeof b.baseSourceHash === "string" ? b.baseSourceHash : null);
      if (head.sourceHash !== null && (head.sourceHash === baseHash || head.sourceHash === newHash))
        return null;
      if (head.sourceHash === null && baseHash === null && base === null) return null;
      return fail(409, "diverged", "The deck changed since your base version.", {
        head: {
          version: head.version,
          origin: head.origin,
          by: head.by,
          at: head.at,
          sourceHash: head.sourceHash,
        },
        base,
      });
    };
    if (rest === "/versions" && method === "POST") {
      const b = body();
      const files = b.files as Array<{ path: string; sha256: string; size: number }>;
      if (!this.legacy && b.showcase === true && d.visibility !== "public")
        return fail(
          422,
          "not_public",
          "Only public decks can be listed in the showcase. Make the deck public first.",
        );
      let source: FakeVersion["source"] = null;
      if (!this.legacy && Array.isArray(b.source)) {
        source = {};
        const list = b.source as Array<{ path: string; sha256: string; size: number }>;
        if (list.length > 500)
          return fail(422, "too_many_source_files", "At most 500 source files.");
        if (list.reduce((n, f) => n + f.size, 0) > 2 * 1024 * 1024)
          return fail(413, "source_too_large", "The source is over 2 MB.");
        for (const f of list) {
          if (!isEditablePath(f.path))
            return fail(400, "bad_source_path", `${f.path} is not an editable deck file.`, {
              path: f.path,
            });
          source[f.path] = { sha256: f.sha256, size: f.size };
        }
      }
      const refused = cas(b, this.sourceHash(source));
      if (refused) return refused;
      const version = d.versions.length + 1;
      d.versions.push({
        version,
        files: Object.fromEntries(files.map((f) => [f.path, { sha256: f.sha256, size: f.size }])),
        source,
        sourceHash: this.sourceHash(source),
        origin: String(b.origin ?? "cli"),
        parent: typeof b.base === "number" ? b.base : null,
        by: "Ana",
        at: Date.UTC(2026, 9, 25, 12, 0) + version,
        committed: false,
        body: b,
      });
      const shas = [
        ...files.map((f) => f.sha256),
        ...Object.values(source ?? {}).map((f) => f.sha256),
      ];
      return json(201, {
        version,
        missing: [...new Set(shas.filter((s) => !this.blobs.has(s)))],
        sourceHash: this.sourceHash(source),
        base: typeof b.base === "number" ? b.base : null,
      });
    }
    if ((m = /^\/versions\/(\d+)\/commit$/.exec(rest)) && method === "POST") {
      const v = d.versions.find((x) => x.version === Number(m![1]));
      if (!v) return fail(404, "not_found", "No such version.");
      const shas = [...Object.values(v.files), ...Object.values(v.source ?? {})].map(
        (f) => f.sha256,
      );
      const missing = [...new Set(shas.filter((s) => !this.blobs.has(s)))];
      if (missing.length)
        return fail(409, "missing_blobs", `${missing.length} files were never uploaded.`, {
          missing,
        });
      const b = body();
      const refused = cas(b, v.sourceHash);
      if (refused) return refused;
      v.committed = true;
      d.current = v.version;
      const forced = url.searchParams.get("force") === "1" || b.force === true;
      return json(200, {
        ok: true,
        url: `/@ana/${d.slug}/`,
        version: v.version,
        sourceHash: v.sourceHash,
        forced,
      });
    }
    if (this.legacy) return fail(404, "http_404", "404 Not Found");
    if (rest === "/sync") {
      const head = this.head(d);
      return json(200, {
        head: head
          ? {
              version: head.version,
              origin: head.origin,
              by: head.by,
              at: head.at,
              sourceHash: head.sourceHash,
            }
          : null,
        draft: d.draft,
        quickEdit: !head ? "disabled" : head.source ? "ready" : "needs-republish",
        kind: "cli",
        reason: null,
      });
    }
    if (rest === "/source") {
      const n = url.searchParams.get("version");
      const v =
        n && n !== "head"
          ? d.versions.find((x) => x.version === Number(n) && x.committed)
          : this.head(d);
      const text = url.searchParams.get("include") === "text";
      if (!v) return fail(404, "not_found", "No such version.");
      if (!v.source) return fail(404, "no_source", "That version has no editable source.");
      return json(200, {
        version: v.version,
        origin: v.origin,
        parent: v.parent,
        sourceHash: v.sourceHash,
        kitVersion: v.version,
        by: v.by,
        at: v.at,
        files: Object.entries(v.source).map(([p, f]) => ({
          path: p,
          ...f,
          ...(text ? { text: new TextDecoder().decode(this.blobs.get(f.sha256)!) } : {}),
        })),
      });
    }
    if ((m = /^\/source\/blobs\/([0-9a-f]{64})$/.exec(rest))) {
      const known = d.versions.some((v) =>
        Object.values(v.source ?? {}).some((f) => f.sha256 === m![1]),
      );
      const bytes = this.blobs.get(m[1]!);
      if (!known || !bytes) return fail(404, "not_found", "No such source file.");
      return new Response(bytes as unknown as BodyInit, { status: 200 });
    }
    return fail(404, "http_404", "404 Not Found");
  }) as typeof fetch;
}
