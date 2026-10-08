import type { DeckRenderer } from "@kadal/deck/renderers/contract";
import { preactRenderer } from "@kadal/deck-preact";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FRESH RENDERER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is the Preact renderer with a different name on it, and that is the finding rather than a
 * shortcut.
 *
 * **Fresh's client runtime is Preact.** A Fresh island is a Preact component; `useSignal` is
 * `@preact/signals`; there is no Fresh client framework underneath to drive. What Fresh actually
 * contributes is a server: file-system routing, partials, server-rendered pages with islands
 * hydrated selectively, and a Deno-specific build. Every one of those is about delivering a page —
 * and a deck slide is not delivered, it is already in the browser when the island is asked for.
 *
 * So there is nothing to implement, and writing a second Preact renderer to look busy would be
 * worse than saying so. What this package does provide is the *name*: a deck can register "fresh",
 * an island can say `framework="fresh"`, and a Fresh island's source can move onto a slide
 * unchanged. That is the whole of the compatibility claim, and it is a real one.
 *
 * The practical difference from writing `framework="preact"` is documentation — an author who
 * brought a Fresh island should see Fresh in the deck, and should also see this file explaining
 * which half of Fresh came with it.
 */
export const freshRenderer: DeckRenderer = {
  ...preactRenderer,
  name: "fresh",
};

export { deckFresh, deckFreshFiles } from "./build.ts";
