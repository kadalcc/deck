import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ViteDevServer } from "vite";

import { EditError, NotesConflict, readNotes, writeNotes } from "../authoring/edit.ts";
import type { DeckFiles } from "../authoring/source.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * /__kadal/notes  —  SAVING SPEAKER NOTES FROM THE BROWSER (`kadal-deck dev` only)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   GET  <base>__kadal/notes?slide=N            → { text, version, form }
 *   POST <base>__kadal/notes  { slide, text, version }
 *        200 { version }                         written
 *        409 { text, version }                   the notes changed since `version`: nothing written
 *        400 / 403 / 404 { error }
 *
 * The presenter view, /overview, /notes and /notes-edit call it through `devNotesEditor`
 * (react/notes.ts). A write goes through `writeNotes` (authoring/edit.ts): only that slide's notes
 * change, in the form they were written in, and every other byte of the file — the deck, or the
 * file a slide includes with `src:` — stays as it was. Files outside the deck's folder are never
 * read or written. Requests from another origin are refused: the dev server listens on the
 * network with `--host`, and a page elsewhere must not be able to rewrite a deck.
 *
 * Then the watcher sees the change. When only notes changed, `notesOnlyUpdate` (below) recompiles
 * those notes modules and pushes them to the open views over the HMR socket — the presenter keeps
 * its timer, its room and its paired phone — instead of the full reload any other edit gets.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const NOTES_PATH = "__kadal/notes";

const MAX_BODY = 512 * 1024;

export function inside(root: string, file: string): boolean {
  const rel = relative(root, file);
  return !!rel && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Same-origin only: the Origin header (or, without one, Sec-Fetch-Site) must say so. */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers["sec-fetch-site"];
  return site === undefined || site === "same-origin" || site === "none";
}

export function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function readBody(req: IncomingMessage, max = MAX_BODY): Promise<string> {
  return new Promise((done, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        fail(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}

/** Register the endpoint on the dev server. `entry` is the deck file's absolute path. */
export function notesEndpoint(
  server: ViteDevServer,
  options: { entry: () => string; base: () => string },
) {
  server.middlewares.use((req, res, next) => {
    const path = (req.url ?? "").split("?")[0]!;
    if (path !== `${options.base()}${NOTES_PATH}` && path !== `/${NOTES_PATH}`) return next();
    if (!sameOrigin(req))
      return send(res, 403, { error: "Notes can only be saved from the deck's own pages." });
    const entry = options.entry();
    let root: string;
    try {
      root = realpathSync(dirname(entry));
    } catch {
      return send(res, 404, { error: "The deck file is missing." });
    }
    // Every path is checked through its real location, so a symlink cannot lead outside.
    const real = (p: string) => {
      const abs = resolve(p);
      try {
        return realpathSync(abs);
      } catch {
        return abs;
      }
    };
    const files: DeckFiles = {
      entry,
      read: (p) => {
        const abs = real(p);
        if (abs !== real(entry) && !inside(root, abs)) return null;
        return existsSync(abs) ? readFileSync(abs, "utf8") : null;
      },
    };
    const slideOf = (v: unknown) =>
      typeof v === "number" && Number.isInteger(v) && v >= 0
        ? v
        : typeof v === "string" && /^\d+$/.test(v)
          ? Number(v)
          : null;

    if (req.method === "GET") {
      const slide = slideOf(new URL(req.url ?? "", "http://x").searchParams.get("slide"));
      if (slide === null) return send(res, 400, { error: "Ask for ?slide=<index>." });
      try {
        const n = readNotes(files, slide);
        return send(res, 200, { text: n.text, version: n.version, form: n.form });
      } catch (e) {
        return send(res, e instanceof EditError ? 404 : 500, {
          error: String((e as Error).message),
        });
      }
    }
    if (req.method !== "POST") return send(res, 405, { error: "GET or POST." });
    void readBody(req)
      .then((raw) => {
        let body: { slide?: unknown; text?: unknown; version?: unknown };
        try {
          body = JSON.parse(raw) as typeof body;
        } catch {
          return send(res, 400, { error: "The body must be JSON." });
        }
        const slide = slideOf(body.slide);
        if (slide === null || typeof body.text !== "string" || typeof body.version !== "string")
          return send(res, 400, { error: "Send { slide, text, version }." });
        try {
          const out = writeNotes(files, slide, body.text, { expected: body.version });
          for (const [file, text] of Object.entries(out.files)) {
            const abs = real(file);
            if (abs !== real(entry) && !inside(root, abs))
              return send(res, 403, { error: `${file} is outside the deck's folder.` });
            writeFileSync(abs, text);
          }
          return send(res, 200, { version: readNotes(applied(files, out.files), slide).version });
        } catch (e) {
          if (e instanceof NotesConflict)
            return send(res, 409, { text: e.current.text, version: e.current.version });
          return send(res, e instanceof EditError ? 400 : 500, {
            error: String((e as Error).message),
          });
        }
      })
      .catch(() => send(res, 413, { error: "Notes are limited to 512 KB." }));
  });
}

/** `files` with an edit's output laid over it (what a read right after the write would see). */
function applied(files: DeckFiles, written: Record<string, string>): DeckFiles {
  return { entry: files.entry, read: (p) => written[p] ?? files.read(p) };
}

/* ── hot notes: a change that touched only notes skips the full reload ────────────────────── */

interface Built {
  headmatter: Record<string, unknown>;
  slides: Array<{
    h: number;
    v: number;
    frontmatter: unknown;
    content: string;
    notes: string | null;
    magic: unknown;
    source: unknown;
  }>;
  glossary: { entries: unknown };
}

export interface NotesHotSlide {
  index: number;
  hasNotes: boolean;
  notesText: string | null;
  source: unknown;
  /** The recompiled module's URL (with a cache-busting query), or null for no notes. */
  url: string | null;
}

/**
 * The slides whose notes (or only their source position) changed from `before` to `after`, or
 * null when anything else did — the slide bodies, frontmatter, the headmatter, the glossary or
 * the number of slides — and the deck needs its full reload.
 */
export function notesOnlyChanges(before: Built, after: Built): number[] | null {
  if (JSON.stringify(before.headmatter) !== JSON.stringify(after.headmatter)) return null;
  if (JSON.stringify(before.glossary.entries) !== JSON.stringify(after.glossary.entries))
    return null;
  if (before.slides.length !== after.slides.length) return null;
  const changed: number[] = [];
  for (let i = 0; i < before.slides.length; i++) {
    const a = before.slides[i]!;
    const b = after.slides[i]!;
    const body = (s: typeof a) => JSON.stringify([s.h, s.v, s.frontmatter, s.content, s.magic]);
    if (body(a) !== body(b)) return null;
    // Notes that grew by a line move every later slide's source line: those are patched too.
    if (a.notes !== b.notes || JSON.stringify(a.source) !== JSON.stringify(b.source))
      changed.push(i);
  }
  return changed;
}

/**
 * Push recompiled notes to the open views. Invalidates the notes modules (and the manifest, so
 * the next full load is fresh) and sends `kadal:notes`, which the manifest module's handler
 * applies (vite/index.ts, DEV_NOTES).
 */
export function pushNotes(
  server: ViteDevServer,
  base: string,
  after: Built,
  changed: number[],
  plainText: (mdx: string) => string,
) {
  const graph = server.moduleGraph;
  const stamp = Date.now();
  const drop = (id: string) => {
    const mod = graph.getModuleById(id);
    if (mod) graph.invalidateModule(mod);
  };
  drop("\0virtual:deck");
  const slides: NotesHotSlide[] = changed.map((index) => {
    const s = after.slides[index]!;
    drop(`\0virtual:deck/notes/${index}`);
    return {
      index,
      hasNotes: !!s.notes,
      notesText: s.notes ? plainText(s.notes) : null,
      source: s.source,
      url: s.notes ? `${base}@id/__x00__virtual:deck/notes/${index}?t=${stamp}` : null,
    };
  });
  server.ws.send({ type: "custom", event: "kadal:notes", data: { slides } });
}

/**
 * The manifest module's side of it, appended to `virtual:deck` under `kadal-deck dev`: swap each
 * changed slide's `loadNotes` for the recompiled module and tell the views (react/notes.ts).
 */
export const DEV_NOTES = `
if (import.meta.hot) {
  import.meta.hot.on("kadal:notes", (m) => {
    const changed = [];
    for (const u of m.slides) {
      const s = slides[u.index];
      if (!s) continue;
      s.hasNotes = u.hasNotes;
      s.notesText = u.notesText;
      s.source = u.source;
      s.loadNotes = u.url ? () => import(/* @vite-ignore */ u.url) : null;
      changed.push(u.index);
    }
    if (changed.length) window.dispatchEvent(new CustomEvent("kadal:notes", { detail: changed }));
  });
}
`;
