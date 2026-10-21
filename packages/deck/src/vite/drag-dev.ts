import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ViteDevServer } from "vite";

import { EditError, setDragPosition } from "../authoring/edit.ts";
import type { DeckFiles } from "../authoring/source.ts";
import { inside, readBody, sameOrigin, send } from "./notes-dev.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /__kadal/drag  —  SAVING A DRAGGED POSITION (`kadal-deck dev` only)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   POST <base>__kadal/drag  { slide, pos, name }               → frontmatter dragPos.<name>
 *   POST <base>__kadal/drag  { slide, pos, index, expected }    → the slide's drag site `index`
 *        200 { ok: true }      written
 *        409 { error }         the source no longer says what the editor started from
 *        400 / 403 / 404 { error }
 *
 * `<Drag>` and `<DragArrow>` (components/Drag.tsx) call it a moment after a move, resize or turn
 * ends. The write goes through `setDragPosition` (authoring/edit.ts): only that value changes —
 * the frontmatter's `dragPos` entry, or the tag's `pos` — and every other byte of the file stays.
 * Guarded like every dev write: same origin, JSON, a size cap, files inside the deck's folder.
 *
 * The page already shows the new position, so the write is `quiet`: the plugin refreshes its
 * caches without reloading the page (and losing the presenter's place); the next load compiles
 * the saved value.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const DRAG_PATH = "__kadal/drag";

export function dragEndpoint(
  server: ViteDevServer,
  options: {
    entry: () => string;
    base: () => string;
    quiet: (file: string, text: string) => void;
  },
) {
  server.middlewares.use((req, res, next) => {
    const path = (req.url ?? "").split("?")[0]!;
    if (path !== `${options.base()}${DRAG_PATH}` && path !== `/${DRAG_PATH}`) return next();
    if (req.method !== "POST") return send(res, 405, { error: "POST only." });
    if (!sameOrigin(req))
      return send(res, 403, { error: "Positions can only be saved from the deck's own pages." });
    if (!/^application\/json\b/.test(req.headers["content-type"] ?? ""))
      return send(res, 415, { error: "JSON only." });
    const entry = options.entry();
    let root: string;
    try {
      root = realpathSync(dirname(entry));
    } catch {
      return send(res, 404, { error: "The deck file is missing." });
    }
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
    void readBody(req)
      .then((raw) => {
        let body: {
          slide?: unknown;
          pos?: unknown;
          name?: unknown;
          index?: unknown;
          expected?: unknown;
        };
        try {
          body = JSON.parse(raw) as typeof body;
        } catch {
          return send(res, 400, { error: "The body must be JSON." });
        }
        const { slide, pos, name, index, expected } = body;
        if (
          typeof slide !== "number" ||
          !Number.isInteger(slide) ||
          slide < 0 ||
          typeof pos !== "string"
        )
          return send(res, 400, { error: "Send { slide, pos } with a name or an index." });
        const target =
          typeof name === "string" && name
            ? { name }
            : typeof index === "number" && Number.isInteger(index) && index >= 0
              ? { index, ...(typeof expected === "string" ? { expected } : {}) }
              : null;
        if (!target) return send(res, 400, { error: "Say which element: a name or an index." });
        try {
          const out = setDragPosition(files, slide, target, pos);
          for (const [file, text] of Object.entries(out.files)) {
            const abs = real(file);
            if (abs !== real(entry) && !inside(root, abs))
              return send(res, 403, { error: `${file} is outside the deck's folder.` });
            options.quiet(resolve(file), text);
            writeFileSync(abs, text);
          }
          return send(res, 200, { ok: true });
        } catch (e) {
          return send(res, e instanceof EditError ? 409 : 500, {
            error: String((e as Error).message),
          });
        }
      })
      .catch(() => send(res, 413, { error: "Too large." }));
  });
}
