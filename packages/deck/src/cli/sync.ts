import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import { cutDeck } from "../compiler/split.ts";
import { findConflicts } from "../sync/mdx.ts";
import { hasConflictMarkers, markerBlocks } from "../sync/markers.ts";
import { SOURCE_LIMITS, ignoreMatcher, isEditablePath, sourceHash } from "../sync/manifest.ts";
import {
  type Conflict,
  type MergeResult,
  mergeDeckSource,
  resolveConflict,
  resolveSlide,
} from "../sync/index.ts";
import { HostError, request } from "./host.ts";
import { type PublishResult, type SourceEntry, describeVersion, publish, when } from "./publish.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO-WAY SYNC: the CLI's side of quick edit
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A published deck can be edited on the web (the builder's quick edit, an agent through the remote
 * MCP) while its folder is edited here. Nothing is ever silently lost:
 *
 *   publish   uploads the EDITABLE source (sync/manifest.ts globs, minus `.kadaldeckignore`)
 *             beside the build, privately, and sends `base` — the version this folder last synced
 *             with. The host commits only if the deck has not moved since (or nothing editable
 *             changed); otherwise 409 diverged, exit 4. `--force` replaces the head (the web
 *             edits stay in the version history: `kadal-deck pull --version N` brings them back).
 *   pull      three-way merges the head's source into the folder (sync/merge.ts): base = the
 *             snapshot below, ours = the folder, theirs = the web. Changed files are backed up
 *             first. Conflicts stay as git-style markers: exit 5 until `resolve` (or an edit).
 *   status    folder vs snapshot vs web, in a sentence each (or --json).
 *   resolve   settles markers: --ours, --theirs, --both, per file or `file#slide`.
 *
 * The snapshot lives in `.kadal-deck/` (the starter's .gitignore leaves it out of git):
 *   sync.json          {host, workspace, deckId, slug, version, sourceHash, pulledAt, source?, pending?}
 *   sync/base/<path>   the source of `version`, what both sides started from
 *   sync/pending/<path> the source a pull with conflicts merged in; it becomes the base when the
 *                      last conflict is resolved
 *   sync/backup/<time>/<path>  the files a pull changed, as they were
 *
 * Host API (all under /api/v1, bearer token):
 *   GET /decks/:id/sync                 {head, draft, quickEdit}
 *   GET /decks/:id/source?version=N     {version, origin, parent, sourceHash, kitVersion, files}
 *   GET /decks/:id/source/blobs/:sha    the file's bytes
 *   GET /decks/:id/versions             [{version, origin?, by, createdAt, current}]
 *   GET /workspaces/:ws/decks           [{id, slug, …}]  (finding the deck without sync.json)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const SYNC_DIR = ".kadal-deck";

export interface SyncState {
  host: string;
  workspace: string;
  deckId: string;
  slug: string;
  /** The version the folder last synced with (published, or pulled cleanly). */
  version: number | null;
  sourceHash: string | null;
  pulledAt: string;
  /** `false` after `publish --no-source`: the source is not uploaded, quick edit is off. */
  source?: boolean;
  /** A pull that left conflicts: what it merged in, the base once they are resolved. */
  pending?: { version: number; sourceHash: string | null } | null;
}

/** The host's answer to GET /decks/:id/sync. */
export interface SyncInfo {
  head: {
    version: number;
    origin: string | null;
    by: string | null;
    at: number | string | null;
    sourceHash: string | null;
  } | null;
  draft: {
    id: string;
    rev: number;
    baseVersion: number | null;
    dirty: boolean;
    updatedAt: number | string | null;
    updatedBy: string | null;
  } | null;
  quickEdit: "ready" | "needs-republish" | "no-source" | "disabled";
}

export interface SourceManifestAnswer {
  version: number;
  origin: string | null;
  parent: number | null;
  sourceHash: string | null;
  kitVersion: number | null;
  by?: string | null;
  at?: number | string | null;
  /** With `include=text`, each file's text comes along (else it is fetched from source/blobs). */
  files: Array<{ path: string; sha256: string; size: number; text?: string }>;
}

/** A pull, status or resolve that ended with conflicts left: exit 5. */
export class ConflictsError extends Error {
  constructor(
    message: string,
    readonly conflicts: Conflict[],
  ) {
    super(message);
    this.name = "ConflictsError";
  }
}

/** No editable source on the host for that version: published with ≤ 0.4 or `--no-source`. */
export class NoSourceError extends Error {
  constructor(version: number | null) {
    super(
      `${version ? `Version ${version}` : "This deck"} has no editable source on the host: it was published with kadal-deck 0.4 or older, or with --no-source. Publish once with kadal-deck 0.5 or later (without --no-source) to start syncing.`,
    );
    this.name = "NoSourceError";
  }
}

const toPosix = (p: string) => p.split(sep).join("/");
const syncFile = (dir: string) => join(dir, SYNC_DIR, "sync.json");
const snapDir = (dir: string, kind: "base" | "pending") => join(dir, SYNC_DIR, "sync", kind);

/* ── the folder ─────────────────────────────────────────────────────────────── */

/**
 * The deck's editable source: every file under `dir` the globs take, minus `.kadaldeckignore`,
 * skipping node_modules, dot-folders and build output. Text only.
 */
export async function collectSource(dir: string): Promise<Record<string, string>> {
  const ignoreText = existsSync(join(dir, ".kadaldeckignore"))
    ? await readFile(join(dir, ".kadaldeckignore"), "utf8")
    : null;
  const ignored = ignoreMatcher(ignoreText);
  const out: Record<string, string> = {};
  const SKIP = new Set(["node_modules", "dist", "export", "screenshots", "public", "src"]);
  const walk = async (d: string, depth: number): Promise<void> => {
    if (depth > 8) return;
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const full = join(d, e.name);
      const rel = toPosix(relative(dir, full));
      if (e.isDirectory()) {
        if (depth === 0 && SKIP.has(e.name)) continue;
        await walk(full, depth + 1);
      } else if (e.isFile() && isEditablePath(rel) && !ignored(rel)) {
        out[rel] = await readFile(full, "utf8");
      }
    }
  };
  await walk(dir, 0);
  return out;
}

/** The entries `publish` sends, with sizes and hashes, checked against the host's limits. */
export async function sourceEntries(files: Record<string, string>): Promise<SourceEntry[]> {
  const entries = Object.keys(files)
    .sort()
    .map((path) => {
      const bytes = Buffer.from(files[path]!, "utf8");
      return {
        path,
        size: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        text: files[path]!,
      };
    });
  const total = entries.reduce((n, e) => n + e.size, 0);
  if (entries.length > SOURCE_LIMITS.files)
    throw new Error(
      `The deck has ${entries.length} editable files; the host keeps at most ${SOURCE_LIMITS.files}. List the extra ones in .kadaldeckignore, or publish with --no-source.`,
    );
  if (total > SOURCE_LIMITS.bytes)
    throw new Error(
      `The deck's editable source is ${(total / 1024 / 1024).toFixed(1)} MB; the host keeps at most 2 MB. List big data files in .kadaldeckignore, or publish with --no-source.`,
    );
  return entries;
}

export const hashOf = (entries: Array<{ path: string; sha256: string }>) =>
  sourceHash(Object.fromEntries(entries.map((e) => [e.path, { sha256: e.sha256 }])));

/** Every conflict left in the folder's editable files. */
export function folderConflicts(files: Record<string, string>): Conflict[] {
  return Object.entries(files)
    .filter(([, t]) => hasConflictMarkers(t))
    .flatMap(([path, t]) => findConflicts(t, path));
}

export function conflictsMessage(conflicts: Conflict[], verb = "Publishing waits"): string {
  const lines = conflicts
    .slice(0, 12)
    .map(
      (c) =>
        `  ${c.path}:${c.line ?? 1}${c.slide ? `  slide ${c.slide}${c.title ? ` "${c.title}"` : ""}` : ""}  (${c.kind})`,
    );
  return `${conflicts.length} unresolved merge conflict${conflicts.length === 1 ? "" : "s"}:\n${lines.join("\n")}${conflicts.length > 12 ? `\n  … and ${conflicts.length - 12} more` : ""}\n${verb} until they are resolved: \`kadal-deck resolve --ours|--theirs|--both [file[#slide]]\`, or edit the files and delete the marker lines.`;
}

/* ── the snapshot ──────────────────────────────────────────────────────────── */

export async function loadSync(dir: string): Promise<SyncState | null> {
  try {
    return JSON.parse(await readFile(syncFile(dir), "utf8")) as SyncState;
  } catch {
    return null;
  }
}

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  await rm(root, { recursive: true, force: true });
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, ...path.split("/"));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
}

async function readTree(root: string): Promise<Record<string, string> | null> {
  if (!existsSync(root)) return null;
  const out: Record<string, string> = {};
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) out[toPosix(relative(root, full))] = await readFile(full, "utf8");
    }
  };
  await walk(root);
  return out;
}

/** Record a sync point: sync.json, and the base snapshot when its files are given. */
export async function saveSync(
  dir: string,
  state: SyncState,
  base?: Record<string, string>,
  pending?: Record<string, string> | null,
): Promise<void> {
  await mkdir(join(dir, SYNC_DIR), { recursive: true });
  if (base) await writeTree(snapDir(dir, "base"), base);
  if (pending) await writeTree(snapDir(dir, "pending"), pending);
  else if (pending === null) await rm(snapDir(dir, "pending"), { recursive: true, force: true });
  await writeFile(syncFile(dir), `${JSON.stringify(state, null, 2)}\n`);
  await ensureIgnored(dir);
}

/** `.kadal-deck/` stays out of git: the starter ignores it; an older deck gets the line. */
async function ensureIgnored(dir: string): Promise<void> {
  const file = join(dir, ".gitignore");
  if (!existsSync(file)) return;
  const text = await readFile(file, "utf8");
  if (/^\/?\.kadal-deck\/?\s*$/m.test(text)) return;
  await writeFile(file, `${text.replace(/\n?$/, "\n")}.kadal-deck/\n`);
}

/** When the last conflict of a pull is gone, what it merged in becomes the base. */
export async function settlePending(dir: string, files: Record<string, string>): Promise<boolean> {
  const state = await loadSync(dir);
  if (!state?.pending || folderConflicts(files).length) return false;
  const pending = (await readTree(snapDir(dir, "pending"))) ?? undefined;
  await saveSync(
    dir,
    {
      ...state,
      version: state.pending.version,
      sourceHash: state.pending.sourceHash,
      pending: null,
      pulledAt: new Date().toISOString(),
    },
    pending,
    null,
  );
  return true;
}

/* ── the host ──────────────────────────────────────────────────────────────── */

export interface HostCtx {
  host: string;
  token: string;
  workspace: string;
  fetch?: typeof fetch;
}

const http = (c: HostCtx) => ({ token: c.token, fetch: c.fetch });

/** GET /decks/:id/sync, or null from a host that predates sync. */
export async function getSyncInfo(c: HostCtx, deckId: string): Promise<SyncInfo | null> {
  try {
    return (await request<SyncInfo>(c.host, `/decks/${encodeURIComponent(deckId)}/sync`, http(c)))
      .data;
  } catch (e) {
    if (e instanceof HostError && e.status === 404 && e.code === "not_found")
      throw new Error("No such deck on the host (was it deleted?).");
    // A host from before sync has no such route.
    if (e instanceof HostError && (e.status === 404 || e.status === 405)) return null;
    throw e;
  }
}

/** The deck's id: sync.json's, else found by slug in the workspace. */
export async function findDeck(
  c: HostCtx,
  slug: string,
): Promise<{ id: string; slug: string } | null> {
  const { data } = await request<Array<{ id: string; slug: string }>>(
    c.host,
    `/workspaces/${encodeURIComponent(c.workspace)}/decks`,
    http(c),
  );
  return (Array.isArray(data) ? data : []).find((d) => d.slug === slug) ?? null;
}

/** A version's editable source: the manifest, then each file's text (a few at a time). */
export async function fetchSource(
  c: HostCtx,
  deckId: string,
  version: number | null,
): Promise<{ meta: SourceManifestAnswer; files: Record<string, string> }> {
  let meta: SourceManifestAnswer;
  try {
    meta = (
      await request<SourceManifestAnswer>(
        c.host,
        `/decks/${encodeURIComponent(deckId)}/source?version=${version ?? "head"}&include=text`,
        http(c),
      )
    ).data;
  } catch (e) {
    if (e instanceof HostError && e.status === 404 && e.code !== "not_found")
      throw new NoSourceError(version);
    throw e;
  }
  const files: Record<string, string> = {};
  const queue = meta.files.filter((f) => {
    if (typeof f.text !== "string" || !isEditablePath(f.path)) return true;
    files[f.path] = f.text;
    return false;
  });
  const doFetch = c.fetch ?? fetch;
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      if (!isEditablePath(f.path)) continue;
      const res = await doFetch(
        `${c.host}/api/v1/decks/${encodeURIComponent(deckId)}/source/blobs/${f.sha256}`,
        {
          headers: { authorization: `Bearer ${c.token}` },
        },
      );
      if (!res.ok)
        throw new HostError(
          res.status,
          `http_${res.status}`,
          `Could not read ${f.path} from the host (${res.status}).`,
        );
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== f.sha256)
        throw new Error(`${f.path} arrived damaged (its hash does not match); try again.`);
      files[f.path] = new TextDecoder().decode(bytes);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
  return { meta, files };
}

/** Versions after `after`, newest last, from GET /decks/:id/versions. */
async function newerVersions(c: HostCtx, deckId: string, after: number | null) {
  try {
    const { data } = await request<
      Array<{
        version: number;
        origin?: string | null;
        by?: string | null;
        createdAt?: number | null;
      }>
    >(c.host, `/decks/${encodeURIComponent(deckId)}/versions`, http(c));
    return (Array.isArray(data) ? data : [])
      .filter((v) => after === null || v.version > after)
      .sort((a, b) => a.version - b.version)
      .map((v) => ({
        version: v.version,
        origin: v.origin ?? null,
        by: v.by ?? null,
        at: v.createdAt ?? null,
      }));
  } catch {
    return [];
  }
}

/* ── pull ──────────────────────────────────────────────────────────────────── */

export interface PullOptions extends HostCtx {
  dir: string;
  slug: string;
  /** A version to pull instead of the head. */
  version?: number;
  /** Settle every conflict one way instead of leaving markers. */
  strategy?: "ours" | "theirs";
  dryRun?: boolean;
  log?: (line: string) => void;
  now?: () => Date;
}

export interface PullResult {
  deckId: string;
  version: number;
  base: number | null;
  /** Per path: what the pull did to it. */
  files: Array<{
    path: string;
    change: "updated" | "merged" | "added" | "deleted" | "conflict";
    slides?: number[];
  }>;
  conflicts: Conflict[];
  clean: boolean;
  backup: string | null;
  notes: string[];
  dryRun: boolean;
}

const oursLabel = "local (your files)";

/** The slides (1-based) of a deck file whose text differs between two versions of it. */
export function changedSlides(before: string | undefined, after: string | undefined): number[] {
  if (before === undefined || after === undefined) return [];
  const pieces = (t: string) => {
    const lines = t.replace(/\r\n?/g, "\n").split("\n");
    return cutDeck(lines.join("\n")).map((p) => lines.slice(p.start, p.end).join("\n").trim());
  };
  try {
    const a = pieces(before);
    const b = pieces(after);
    const out: number[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) out.push(i + 1);
    return out;
  } catch {
    return [];
  }
}

export async function pullDeck(o: PullOptions): Promise<PullResult> {
  const log = o.log ?? (() => {});
  const notes: string[] = [];
  const state = await loadSync(o.dir);
  const deckId =
    state?.deckId ??
    (await findDeck(o, o.slug))?.id ??
    (() => {
      throw new Error(`No deck "${o.slug}" in @${o.workspace} to pull from. Publish it first.`);
    })();
  const local = await collectSource(o.dir);
  const left = folderConflicts(local);
  if (left.length) throw new ConflictsError(conflictsMessage(left, "Pulling again waits"), left);

  const info = await getSyncInfo(o, deckId);
  const target = o.version ?? info?.head?.version ?? null;
  const remote = await fetchSource(o, deckId, target);
  const version = remote.meta.version;
  // An older version brought back (`--version N`, say after a `--force`): merged in as a local
  // edit on top of the folder's base, which stays where it is — the head has not moved.
  const restoring = o.version !== undefined && !!info?.head && info.head.version !== version;

  // What both started from: the snapshot; the host's copy of that version when the snapshot is
  // gone (a fresh clone); nothing at all without sync.json — then only equal sides merge.
  let base: Record<string, string> | null = null;
  const synced = state && state.deckId === deckId ? state.version : null;
  // For an older version, what it and the folder share is where that version started.
  const baseVersion = restoring && remote.meta.parent ? remote.meta.parent : synced;
  if (baseVersion !== null && baseVersion !== synced) {
    try {
      base = (await fetchSource(o, deckId, baseVersion)).files;
    } catch {
      notes.push(`v${baseVersion}, where v${version} started, has no source on the host.`);
    }
  } else if (baseVersion !== null) {
    base = await readTree(snapDir(o.dir, "base"));
    if (!base) {
      try {
        base = (await fetchSource(o, deckId, baseVersion)).files;
        notes.push(`The base snapshot was missing; fetched v${baseVersion} from the host instead.`);
      } catch {
        notes.push(`The base snapshot was missing and v${baseVersion} has no source on the host.`);
      }
    }
  }
  if (!base)
    notes.push(
      "No sync snapshot (.kadal-deck/sync.json) to merge against: every slide that differs is a conflict unless one side equals the other.",
    );
  if (gitDirty(o.dir, Object.keys(local)))
    notes.push(
      "Your deck files have uncommitted git changes; they are merged in like any other local edit.",
    );

  const head = info?.head && info.head.version === version ? info.head : null;
  const theirsLabel = `web ${describeVersion({
    version,
    origin: head?.origin ?? remote.meta.origin,
    by: head?.by ?? remote.meta.by ?? null,
    at: head?.at ?? remote.meta.at ?? null,
  })}`;
  const merged: MergeResult = mergeDeckSource(base, local, remote.files, {
    oursLabel,
    theirsLabel,
    baseLabel: baseVersion ? `base v${baseVersion}` : "base",
  });
  if (o.strategy) {
    for (const [path, text] of Object.entries(merged.files)) {
      if (!hasConflictMarkers(text)) continue;
      const settled = resolveConflict(text, o.strategy);
      if (settled === "") {
        delete merged.files[path];
        if (path in local) merged.deleted.push(path);
      } else merged.files[path] = settled;
    }
    merged.conflicts = folderConflicts(merged.files);
    merged.clean = merged.conflicts.length === 0;
  }

  const files: PullResult["files"] = [];
  for (const path of Object.keys(merged.files).sort()) {
    const before = local[path];
    const after = merged.files[path]!;
    if (before === after) continue;
    const change = hasConflictMarkers(after)
      ? "conflict"
      : before === undefined
        ? "added"
        : after === remote.files[path]
          ? "updated"
          : "merged";
    files.push({
      path,
      change,
      ...(/\.mdx?$/.test(path) ? { slides: changedSlides(before, after) } : {}),
    });
  }
  for (const path of merged.deleted) files.push({ path, change: "deleted" });

  let backup: string | null = null;
  if (!o.dryRun && files.length) {
    const stamp = (o.now?.() ?? new Date()).toISOString().replace(/[:.]/g, "-");
    backup = join(o.dir, SYNC_DIR, "sync", "backup", stamp);
    for (const f of files) {
      if (!(f.path in local)) continue;
      const to = join(backup, ...f.path.split("/"));
      await mkdir(dirname(to), { recursive: true });
      await copyFile(join(o.dir, ...f.path.split("/")), to);
    }
    for (const f of files) {
      const file = join(o.dir, ...f.path.split("/"));
      if (f.change === "deleted") await rm(file, { force: true });
      else {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, merged.files[f.path]!);
      }
    }
  }
  if (!o.dryRun) {
    const common = {
      host: o.host,
      workspace: o.workspace,
      deckId,
      slug: o.slug,
      pulledAt: (o.now?.() ?? new Date()).toISOString(),
      ...(state?.source === false ? { source: false } : {}),
    };
    if (restoring && state && state.deckId === deckId) {
      // The base stays; the restored edits are local changes to publish.
    } else if (merged.clean)
      await saveSync(
        o.dir,
        { ...common, version, sourceHash: remote.meta.sourceHash, pending: null },
        remote.files,
        null,
      );
    else
      await saveSync(
        o.dir,
        {
          ...common,
          version: state?.deckId === deckId ? state.version : null,
          sourceHash: state?.deckId === deckId ? state.sourceHash : null,
          pending: { version, sourceHash: remote.meta.sourceHash },
        },
        undefined,
        remote.files,
      );
  }
  log(
    `pull     v${version} ${merged.clean ? "merged cleanly" : `— ${merged.conflicts.length} conflict(s)`}`,
  );
  return {
    deckId,
    version,
    base: baseVersion,
    files,
    conflicts: merged.conflicts,
    clean: merged.clean,
    backup,
    notes,
    dryRun: !!o.dryRun,
  };
}

/** True when git says any of these deck files has uncommitted changes (false outside git). */
function gitDirty(dir: string, paths: string[]): boolean {
  if (!paths.length) return false;
  try {
    const r = spawnSync("git", ["status", "--porcelain", "--", ...paths], {
      cwd: dir,
      encoding: "utf8",
      timeout: 5000,
    });
    return r.status === 0 && !!r.stdout.trim();
  } catch {
    return false;
  }
}

/* ── status ────────────────────────────────────────────────────────────────── */

export interface StatusResult {
  deck: { id: string; slug: string } | null;
  base: { version: number | null; sourceHash: string | null } | null;
  head: SyncInfo["head"];
  /** Versions on the host after the base, oldest first. */
  newer: Array<{
    version: number;
    origin: string | null;
    by: string | null;
    at: number | string | null;
  }>;
  local: Array<{ path: string; change: "modified" | "added" | "deleted"; slides?: number[] }>;
  conflicts: Conflict[];
  draft: SyncInfo["draft"];
  quickEdit: SyncInfo["quickEdit"] | null;
  pending: SyncState["pending"];
  sourceOff: boolean;
  /** What to do next, in order. */
  next: string[];
  lines: string[];
}

export async function deckStatus(
  o: HostCtx & { dir: string; slug: string; offline?: boolean },
): Promise<StatusResult> {
  const state = await loadSync(o.dir);
  const local = await collectSource(o.dir);
  const conflicts = folderConflicts(local);
  const base = (await readTree(snapDir(o.dir, "base"))) ?? {};
  const changes: StatusResult["local"] = [];
  if (state)
    for (const path of [...new Set([...Object.keys(base), ...Object.keys(local)])].sort()) {
      if (base[path] === local[path]) continue;
      const change = !(path in base) ? "added" : !(path in local) ? "deleted" : "modified";
      changes.push({
        path,
        change,
        ...(change === "modified" && /\.mdx?$/.test(path)
          ? { slides: changedSlides(base[path], local[path]) }
          : {}),
      });
    }
  let deck: StatusResult["deck"] = state ? { id: state.deckId, slug: state.slug } : null;
  let info: SyncInfo | null = null;
  let newer: StatusResult["newer"] = [];
  if (!o.offline) {
    deck ??= await findDeck(o, o.slug).catch(() => null);
    if (deck) {
      info = await getSyncInfo(o, deck.id);
      newer = await newerVersions(o, deck.id, state?.deckId === deck.id ? state.version : null);
      if (!state) newer = [];
    }
  }
  const lines: string[] = [];
  const next: string[] = [];
  if (!deck) lines.push(`Not published yet as "${o.slug}" in @${o.workspace}.`);
  else if (!state)
    lines.push(
      `Published as ${deck.slug}, but this folder has never synced with it (no .kadal-deck/sync.json).`,
    );
  else lines.push(`Synced with v${state.version ?? "?"} of ${state.slug}.`);
  if (newer.length) {
    lines.push(
      `The web has ${newer.length} newer version${newer.length === 1 ? "" : "s"} (${newer.map((v) => describeVersion(v)).join(", ")}).`,
    );
    next.push("kadal-deck pull");
  }
  if (changes.length)
    lines.push(
      `You have local changes in ${changes
        .map(
          (c) =>
            `${c.path}${c.slides?.length ? ` (${c.slides.length} slide${c.slides.length === 1 ? "" : "s"})` : ""}${c.change !== "modified" ? `, ${c.change}` : ""}`,
        )
        .join(", ")}.`,
    );
  if (conflicts.length) {
    lines.push(`${conflicts.length} unresolved conflict${conflicts.length === 1 ? "" : "s"}.`);
    next.unshift("kadal-deck resolve --list");
  }
  if (state?.pending)
    lines.push(`A pull of v${state.pending.version} is waiting for its conflicts to be resolved.`);
  if (info?.draft?.dirty) {
    const d = info.draft;
    lines.push(
      `Unpublished web draft (rev ${d.rev}${d.updatedAt ? `, edited ${ago(d.updatedAt)}` : ""}${d.updatedBy ? ` by ${d.updatedBy}` : ""}).`,
    );
  }
  if (state?.source === false)
    lines.push(
      "Source upload is off for this deck (published with --no-source): quick edit is off.",
    );
  if (!newer.length && !conflicts.length && changes.length) next.push("kadal-deck publish");
  if (!newer.length && !changes.length && !conflicts.length && deck && state)
    lines.push("Nothing to pull or publish.");
  return {
    deck,
    base: state ? { version: state.version, sourceHash: state.sourceHash } : null,
    head: info?.head ?? null,
    newer,
    local: changes,
    conflicts,
    draft: info?.draft ?? null,
    quickEdit: info?.quickEdit ?? null,
    pending: state?.pending ?? null,
    sourceOff: state?.source === false,
    next,
    lines,
  };
}

/** "5 min ago", from a timestamp (ms, s or ISO). */
function ago(at: number | string): string {
  const n = typeof at === "number" ? (at < 1e12 ? at * 1000 : at) : Date.parse(at);
  if (!Number.isFinite(n)) return String(at);
  const s = Math.max(0, Math.round((Date.now() - n) / 1000));
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return when(at);
}

/* ── resolve ───────────────────────────────────────────────────────────────── */

export interface ResolveOptions {
  dir: string;
  /** `deck.mdx`, `deck.mdx#3` (the third slide), or nothing for every file. */
  target?: string;
  choice?: "ours" | "theirs" | "both";
  list?: boolean;
}

export interface ResolveResult {
  resolved: Array<{ path: string; slide?: number; deleted?: boolean }>;
  remaining: Conflict[];
  settled: boolean;
}

export async function resolveDeck(o: ResolveOptions): Promise<ResolveResult> {
  const files = await collectSource(o.dir);
  if (o.list || !o.choice)
    return { resolved: [], remaining: folderConflicts(files), settled: false };
  const m = o.target ? /^(.*?)(?:#(\d+))?$/.exec(o.target) : null;
  const path = m?.[1] || null;
  const slide = m?.[2] ? Number(m[2]) : undefined;
  if (path && !(path in files)) throw new Error(`${path} is not one of the deck's editable files.`);
  const resolved: ResolveResult["resolved"] = [];
  for (const [p, text] of Object.entries(files)) {
    if ((path && p !== path) || !markerBlocks(text).length) continue;
    const out =
      slide !== undefined ? resolveSlide(text, slide, o.choice) : resolveConflict(text, o.choice);
    if (out === text) continue;
    const file = join(o.dir, ...p.split("/"));
    if (out === "") {
      await rm(file, { force: true });
      delete files[p];
      resolved.push({ path: p, deleted: true });
    } else {
      await writeFile(file, out);
      files[p] = out;
      resolved.push({ path: p, ...(slide !== undefined ? { slide } : {}) });
    }
  }
  const remaining = folderConflicts(files);
  const settled = await settlePending(o.dir, files);
  return { resolved, remaining, settled };
}

/* ── publish, the sync half ───────────────────────────────────────────────── */

/** What publish needs from the folder before it builds: the source, and the version it is based on. */
export async function prepareSync(
  dir: string,
  opts: { source?: boolean },
): Promise<{
  state: SyncState | null;
  source: SourceEntry[] | null;
  files: Record<string, string> | null;
  off: boolean;
  note?: string;
}> {
  const state = await loadSync(dir);
  // `--no-source` sticks (sync.json `source: false`) until `--source` turns it back on.
  const off = opts.source === false || (opts.source !== true && state?.source === false);
  if (off) return { state, source: null, files: null, off };
  const files = await collectSource(dir);
  const left = folderConflicts(files);
  if (left.length) throw new ConflictsError(conflictsMessage(left), left);
  // Resolved by hand since the pull: what it merged in is the base now.
  if (state?.pending && (await settlePending(dir, files))) return prepareSync(dir, opts);
  if (!files["deck.mdx"])
    return {
      state,
      source: null,
      files: null,
      off: false,
      note: "No deck.mdx at the top of the folder: no source to upload.",
    };
  return { state, source: await sourceEntries(files), files, off: false };
}

/** After a publish: this version is the base now (its source, unless sent without). */
export async function recordPublish(
  dir: string,
  o: {
    host: string;
    workspace: string;
    deck: { id: string; slug: string };
    version: number;
    files: Record<string, string> | null;
    sourceOff: boolean;
  },
): Promise<void> {
  const hash = o.files ? await hashOf(await sourceEntries(o.files)) : null;
  await saveSync(
    dir,
    {
      host: o.host,
      workspace: o.workspace,
      deckId: o.deck.id,
      slug: o.deck.slug,
      version: o.version,
      sourceHash: hash,
      pulledAt: new Date().toISOString(),
      pending: null,
      ...(o.sourceOff ? { source: false } : {}),
    },
    o.files ?? undefined,
    null,
  );
}

export interface PublishWithSyncOptions extends HostCtx {
  dir: string;
  slug: string;
  title?: string;
  outDir: string;
  /** `--source` / `--no-source`; undefined: as last time. */
  source?: boolean;
  force?: boolean;
  showcase?: boolean;
  meta?: { theme: string; slides: number } | null;
  /** Builds the deck for `base` into `out`, and its editing kit into `kitDir` when given. */
  build: (base: string, out: string, kitDir: string | null) => Promise<void>;
  log?: (line: string) => void;
}

/**
 * `kadal-deck publish` with the sync half: refuse while conflicts are left (exit 5), upload the
 * source and the kit, commit against the last sync point (409 diverged → exit 4, unless
 * `force`), then record this version as the new base. Returns what `--force` replaced, if
 * anything, so the caller can say how to get it back.
 */
export async function publishWithSync(o: PublishWithSyncOptions): Promise<{
  result: PublishResult;
  prep: Awaited<ReturnType<typeof prepareSync>>;
  hash: string | null;
  kitBuilt: boolean;
  replaced: NonNullable<SyncInfo["head"]> | null;
}> {
  const say = o.log ?? (() => {});
  const prep = await prepareSync(o.dir, { source: o.source });
  if (prep.note) say(`note     ${prep.note}`);
  const hash = prep.source ? await hashOf(prep.source) : null;
  const kitDir = prep.source ? join(o.outDir, "__kadal", "kit") : null;
  let kitBuilt = false;
  // `sync`: whether the host has quick edit at all (GET /sync answered). A host from before it
  // would store the kit as ordinary files — tens of megabytes against the workspace's quota, for
  // nothing — so without it the deck goes up as a plain build.
  const seen: { head: SyncInfo["head"]; sync: boolean } = { head: null, sync: false };
  const baseOf = (deckId: string) => (prep.state?.deckId === deckId ? prep.state.version : null);
  const baseHashOf = (deckId: string) =>
    prep.state?.deckId === deckId ? prep.state.sourceHash : null;
  say(
    `publish  @${o.workspace}/${o.slug} → ${o.host}${prep.source ? ` (with ${prep.source.length} source file${prep.source.length === 1 ? "" : "s"})` : ""}`,
  );
  const result = await publish({
    host: o.host,
    token: o.token,
    workspace: o.workspace,
    slug: o.slug,
    title: o.title,
    outDir: o.outDir,
    fetch: o.fetch,
    log: say,
    source: prep.source,
    base: (deck) => ({ version: baseOf(deck.id), sourceHash: baseHashOf(deck.id) }),
    force: o.force,
    showcase: o.showcase,
    meta: o.meta ?? null,
    kit: () =>
      kitBuilt ? (JSON.parse(readFileSyncText(join(kitDir!, "kit.json"))) as unknown) : null,
    onDeck: async (deck) => {
      const info = await getSyncInfo(o, deck.id).catch(() => null);
      seen.head = info?.head ?? null;
      seen.sync = info !== null;
      if (!seen.sync && kitDir)
        say("note     this host has no quick edit yet: publishing without the editing kit.");
      // Someone is mid-edit on the web: say so; it is not a reason to stop.
      if (info?.draft?.dirty)
        say(
          `warning  Someone is editing this deck on the web (unpublished${info.draft.updatedBy ? `, ${info.draft.updatedBy}` : ""}). Your publish will be merged into their draft when they publish.`,
        );
    },
    build: async (base, out) => {
      try {
        await o.build(base, out, seen.sync ? kitDir : null);
      } catch (e) {
        // The deck built and the kit did not: publish without it, and say what it costs.
        if (!kitDir || !existsSync(join(out, "index.html")) || existsSync(join(kitDir, "kit.json")))
          throw e;
        say(
          `warning  the editing kit did not build (${e instanceof Error ? e.message : String(e)}); quick edit on the web will not render this deck's own components.`,
        );
        await rm(kitDir, { recursive: true, force: true });
      }
      kitBuilt = seen.sync && !!kitDir && existsSync(join(kitDir, "kit.json"));
    },
  });
  await recordPublish(o.dir, {
    host: o.host,
    workspace: o.workspace,
    deck: result.deck,
    version: result.version,
    files: prep.files,
    sourceOff: prep.off,
  });
  const before = seen.head;
  const replaced =
    o.force && before && before.version !== baseOf(result.deck.id) && before.sourceHash !== hash
      ? before
      : null;
  return { result, prep, hash, kitBuilt, replaced };
}

const readFileSyncText = (file: string) => readFileSync(file, "utf8");
