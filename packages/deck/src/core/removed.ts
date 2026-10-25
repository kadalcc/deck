/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKGROUNDS REMOVED IN 0.6, and what a deck that still names one gets
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 0.6 took out the six sign-language backgrounds (signer, variants, handshapes, trails, window,
 * embedding) and two map ones (lattice, track): they were drawn for one talk each and are too
 * particular for a general engine. Their source is on the docs page below, ready to paste into a
 * deck's own `src/components.tsx` with `registerBackground` — after which the name is the deck's
 * and nothing here applies.
 *
 * A deck that still names one is an unknown background like any other: a published deck shows
 * the theme's own background and says nothing; the dev server and a builder preview show the
 * usual "Unknown background" notice, and for these names one more line saying where it went.
 * The lint hint says the same. Pure: no React.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const REMOVED_BACKGROUNDS: ReadonlySet<string> = new Set([
  "signer",
  "variants",
  "handshapes",
  "trails",
  "window",
  "embedding",
  "lattice",
  "track",
]);

export const REMOVED_BACKGROUNDS_DOCS = "https://deck.kadal.cc/docs/backgrounds/#removed-in-06";

/** The one-line "where it went" for a name 0.6 removed; null for any other name. */
export function removedBackgroundHint(name: string | null | undefined): string | null {
  if (!name || !REMOVED_BACKGROUNDS.has(name)) return null;
  return `\`${name}\` was removed in Kadal Deck 0.6. Copy it into your deck: ${REMOVED_BACKGROUNDS_DOCS}`;
}
