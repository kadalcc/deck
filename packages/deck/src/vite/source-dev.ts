import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ViteDevServer } from "vite";

import { EditError, SourceConflict, readSlideSource, writeSlideSource } from "../authoring/edit.ts";
import type { DeckFiles } from "../authoring/source.ts";
import { inside, readBody, sameOrigin, send } from "./notes-dev.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * /__kadal/source  —  THE SIDE EDITOR'S SAVE PATH (`kadal-deck dev` only)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   GET  <base>__kadal/source?slide=N        → { text, version, file, line, head }
 *   POST <base>__kadal/source  { slide, text, version }
 *        200 { version }                      written
 *        409 { text, version, … }             the slide changed since `version`: nothing written
 *        400 / 403 / 404 / 413 { error }
 *
 * The side editor (react/SideEditor.tsx) edits one slide's whole source — separator,
 * frontmatter, body, notes — the way the notes endpoint (notes-dev.ts) edits its notes, and with
 * the same rules: `writeSlideSource` (authoring/edit.ts) rewrites that slide's lines only, in the
 * file it is written in, and refuses a text that would add or drop a slide or change another
 * one; a stale version is a 409 with what is there now; only the deck's own pages may write
 * (same origin), and only files inside the deck's folder.
 *
 * The watcher then sees the change: a save that touched only the notes is pushed to the open
 * views without a reload (notes-dev.ts), anything else reloads the deck, and the editor opens
 * again where it was (react/SideEditor.tsx keeps its place).
 *
 * The editor itself — CodeMirror 6 — is `src/editor/side-editor.ts`, which the manifest imports
 * lazily under `kadal-deck dev` only (`sideEditor` below); a build has neither the endpoint nor a
 * byte of CodeMirror.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const SOURCE_PATH = "__kadal/source";

const MAX_SLIDE = 1024 * 1024;

/**
 * The CodeMirror module beside this one: dist/editor/side-editor.js next to dist/vite/, or the
 * source when the plugin itself runs from src/.
 */
export function sideEditorFile(): string {
  const js = fileURLToPath(new URL("../editor/side-editor.js", import.meta.url));
  return existsSync(js) ? js : fileURLToPath(new URL("../editor/side-editor.ts", import.meta.url));
}

/**
 * The editor's packages, pre-bundled when the dev server starts so the first time the editor opens
 * does not make Vite discover them and reload the page (the same as Monaco's, vite/index.ts).
 */
export const SIDE_EDITOR_DEPS = [
  "@codemirror/state",
  "@codemirror/view",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/search",
  "@codemirror/lang-markdown",
  "@codemirror/lang-yaml",
  "@lezer/highlight",
].map((d) => `@kadal/deck > ${d}`);

/** The manifest's `sideEditor` loader: the module under `kadal-deck dev`, nothing in a build. */
export function sideEditorCode(building: boolean): string {
  return building ? "null" : `() => import(${JSON.stringify(sideEditorFile())})`;
}

/** Register the endpoint on the dev server. `entry` is the deck file's absolute path. */
export function sourceEndpoint(
  server: ViteDevServer,
  options: { entry: () => string; base: () => string },
) {
  server.middlewares.use((req, res, next) => {
    const path = (req.url ?? "").split("?")[0]!;
    if (path !== `${options.base()}${SOURCE_PATH}` && path !== `/${SOURCE_PATH}`) return next();
    if (!sameOrigin(req))
      return send(res, 403, { error: "Slides can only be saved from the deck's own pages." });
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
    const allowed = (p: string) => real(p) === real(entry) || inside(root, real(p));
    const files: DeckFiles = {
      entry,
      read: (p) => (allowed(p) && existsSync(real(p)) ? readFileSync(real(p), "utf8") : null),
    };
    const slideOf = (v: unknown) =>
      typeof v === "number" && Number.isInteger(v) && v >= 0
        ? v
        : typeof v === "string" && /^\d+$/.test(v)
          ? Number(v)
          : null;
    const shown = (s: ReturnType<typeof readSlideSource>) => ({
      text: s.text,
      version: s.version,
      file: s.file.startsWith(root) ? s.file.slice(root.length + 1) : s.file,
      line: s.line,
      head: s.head,
    });

    if (req.method === "GET") {
      const slide = slideOf(new URL(req.url ?? "", "http://x").searchParams.get("slide"));
      if (slide === null) return send(res, 400, { error: "Ask for ?slide=<index>." });
      try {
        return send(res, 200, shown(readSlideSource(files, slide)));
      } catch (e) {
        return send(res, e instanceof EditError ? 404 : 500, { error: (e as Error).message });
      }
    }
    if (req.method !== "POST") return send(res, 405, { error: "GET or POST." });
    void readBody(req, MAX_SLIDE)
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
          const out = writeSlideSource(files, slide, body.text, { expected: body.version });
          for (const [file, text] of Object.entries(out.files)) {
            if (!allowed(file))
              return send(res, 403, { error: `${file} is outside the deck's folder.` });
            writeFileSync(real(file), text);
          }
          const after: DeckFiles = { entry, read: (p) => out.files[p] ?? files.read(p) };
          return send(res, 200, { version: readSlideSource(after, out.index ?? slide).version });
        } catch (e) {
          if (e instanceof SourceConflict) return send(res, 409, shown(e.current));
          return send(res, e instanceof EditError ? 400 : 500, { error: (e as Error).message });
        }
      })
      .catch(() => send(res, 413, { error: "A slide is limited to 1 MB." }));
  });
}
