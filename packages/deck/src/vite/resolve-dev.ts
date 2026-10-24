import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ViteDevServer } from "vite";

import { markerBlocks } from "../sync/markers.ts";
import { resolveConflict } from "../sync/merge.ts";
import { inside, readBody, sameOrigin, send } from "./notes-dev.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * /__kadal/resolve  —  THE CONFLICT CARD'S BUTTONS (`kadal-deck dev` only)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   POST <base>__kadal/resolve  { file, which, choice: "ours" | "theirs" | "both" }
 *        200 { ok: true, left }     the block is settled in the file; `left` blocks remain in it
 *        400 / 403 / 404 / 409 { error }
 *
 * A slide with a merge conflict (`kadal-deck pull`) shows both versions under `kadal-deck dev`
 * (react/ConflictCard.tsx); its buttons land here, and `resolveConflict` (sync/merge.ts) rewrites
 * that block and nothing else. The watcher then reloads the deck. Same origin only, files inside
 * the deck's folder only — the rules of the other dev endpoints (notes-dev.ts).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const RESOLVE_PATH = "__kadal/resolve";

export function resolveEndpoint(
  server: ViteDevServer,
  options: { entry: () => string; base: () => string },
) {
  server.middlewares.use((req, res, next) => {
    const path = (req.url ?? "").split("?")[0]!;
    if (path !== `${options.base()}${RESOLVE_PATH}` && path !== `/${RESOLVE_PATH}`) return next();
    if (req.method !== "POST") return send(res, 405, { error: "POST only." });
    if (!sameOrigin(req))
      return send(res, 403, { error: "Conflicts can only be resolved from the deck's own pages." });
    void readBody(req)
      .then((raw) => {
        const body = JSON.parse(raw) as { file?: unknown; which?: unknown; choice?: unknown };
        const choice = body.choice;
        if (choice !== "ours" && choice !== "theirs" && choice !== "both")
          return send(res, 400, { error: "choice must be ours, theirs or both." });
        if (typeof body.file !== "string" || !Number.isInteger(body.which))
          return send(res, 400, { error: "file and which are required." });
        const root = realpathSync(dirname(options.entry()));
        const file = resolve(root, body.file);
        if (file !== resolve(options.entry()) && !inside(root, file))
          return send(res, 403, { error: "Only files inside the deck's folder." });
        if (!existsSync(file)) return send(res, 404, { error: `${body.file} does not exist.` });
        const text = readFileSync(file, "utf8");
        const blocks = markerBlocks(text);
        if ((body.which as number) >= blocks.length)
          return send(res, 409, { error: "That conflict is not in the file any more; reload." });
        const out = resolveConflict(text, choice, body.which as number);
        // The side that deleted the whole file was chosen: delete it (the deck file itself stays).
        if (out === "" && file !== resolve(options.entry())) rmSync(file);
        else writeFileSync(file, out);
        send(res, 200, { ok: true, left: markerBlocks(out).length });
      })
      .catch((e: unknown) => send(res, 400, { error: e instanceof Error ? e.message : String(e) }));
  });
}
