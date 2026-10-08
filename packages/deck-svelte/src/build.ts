/**
 * Build-time helpers for Svelte islands.
 *
 * This module exists apart from the renderer for one reason: a deck's `vite.config.ts` imports it,
 * and a Vite config is evaluated by Node before any bundling happens. Anything the config reaches
 * is loaded for real, in Node, with no browser and no build step — so a build helper that sits next
 * to the renderer drags the whole framework runtime into that moment. Angular is the one that
 * proves it: importing its package from a Vite config fails outright with "the injectable is part
 * of a library that has been partially compiled", because Angular's own packages are published
 * partially compiled and need the linker the build has not run yet.
 *
 * So this file imports nothing. Keep it that way.
 */

/* ── the build says so ────────────────────────────────────────────────────── */

/** The shape of a Vite plugin, without depending on Vite to describe it. */
export interface DeckSveltePlugin {
  name: string;
  enforce: "post";
  transform(code: string, id: string): { code: string; map: null } | null;
}

/**
 * Stamp every compiled `.svelte` component with `DECK_RENDERER`, so an island needs no
 * `framework="svelte"` and no `deckSvelte()` call:
 *
 *     // vite.config.ts — after svelte(), which is what `enforce: "post"` guarantees
 *     plugins: [svelte(), deckSveltePlugin()]
 *
 *     // a slide
 *     <Island load={() => import("./ticker.svelte")} />
 *
 * It appends one line to the module, using `Symbol.for` so nothing is imported and no module graph
 * edge is created. When the compiler's output does not match — a future Svelte emitting something
 * else — it leaves the module completely alone and the author falls back to `framework="svelte"`,
 * which is a worse experience and not a broken one.
 */
export function deckSveltePlugin(): DeckSveltePlugin {
  // `export default function Ticker(…)` is what Svelte 5 emits; the bare form covers a component
  // whose function was declared earlier in the module.
  const declared = /^export default function ([A-Za-z_$][\w$]*)/m;
  const bare = /^export default ([A-Za-z_$][\w$]*);\s*$/m;

  return {
    name: "deck-svelte-stamp",
    enforce: "post",

    transform(code: string, id: string) {
      const [path] = id.split("?");
      if (!path?.endsWith(".svelte")) return null;

      const name = declared.exec(code)?.[1] ?? bare.exec(code)?.[1];
      if (!name) return null;

      return {
        code: `${code}\ntry { ${name}[Symbol.for("deck.renderer")] = "svelte"; } catch {}\n`,
        // No source map: one appended line changes nothing about the mapping of the lines above it.
        map: null,
      };
    },
  };
}
