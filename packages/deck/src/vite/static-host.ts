import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ANY STATIC HOST  —  the deck's routes without a server that knows about them
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The deck is one page whose routes are paths: <base>presenter, <base>notes, <base>remote… A
 * host with single-page-app rewrites (Netlify, Vercel, Cloudflare, `kadal-deck serve`, `vite
 * preview`) answers them all with index.html; GitHub Pages, S3 and a plain nginx do not. So the
 * build leaves, beside index.html:
 *
 *   <route>/index.html   a copy of index.html for each route — every asset URL in it is absolute
 *                        (the base), so the copy works from the folder; `/presenter` → 200 —
 *                        and for each plain path the deck's routes file names (`handout`)
 *   404.html             another copy: GitHub Pages serves it for any other path, and the deck
 *                        draws its own "no such slide" from there
 *   _redirects           `<base>*  <base>index.html  200` for Netlify (and Cloudflare Pages)
 *
 * A file the deck's public/ already put there is never replaced. A relative base ("./") cannot
 * have the copies (their asset URLs would point one folder too deep), so it gets 404.html only.
 * `kadal-deck publish` skips all of it: the Kadal host routes the deck itself and writes its room
 * into index.html as it serves it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Every first path segment the runtime treats as a page (react/Deck.tsx `modeFromLocation`). */
export const DECK_ROUTES = [
  "presenter",
  "audience",
  "join",
  "notes",
  "notes-edit",
  "overview",
  "stats",
  "remote",
  "export",
] as const;

export function writeStaticHostFiles(
  outDir: string,
  base: string,
  publicDir: string | null,
  /** The deck's own routes (react/routes.tsx) a copy is made for too: `handout`, `tools/timer`. */
  extraRoutes: string[] = [],
): string[] {
  const index = join(outDir, "index.html");
  if (!existsSync(index)) return [];
  // The deck's own public/ files win; anything else of ours is written again (a stale copy from
  // an earlier build into an outDir that was not emptied would carry the old asset names).
  const own = (rel: string) => !!publicDir && existsSync(join(publicDir, rel));
  const written: string[] = [];
  const absolute = base.startsWith("/");
  if (absolute)
    for (const route of [...DECK_ROUTES, ...extraRoutes]) {
      if (own(`${route}/index.html`)) continue;
      mkdirSync(join(outDir, route), { recursive: true });
      copyFileSync(index, join(outDir, route, "index.html"));
      written.push(`${route}/index.html`);
    }
  if (!own("404.html")) {
    copyFileSync(index, join(outDir, "404.html"));
    written.push("404.html");
  }
  if (absolute && !own("_redirects")) {
    writeFileSync(join(outDir, "_redirects"), redirectsRule(base));
    written.push("_redirects");
  }
  return written;
}

/** Netlify's single-page rule for a deck at `base`. */
export const redirectsRule = (base: string): string => `${base}*    ${base}index.html    200\n`;
