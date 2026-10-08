/**
 * Build-time helpers for Solid islands.
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

/**
 * The glob a deck uses to keep Solid's JSX and React's apart. Both plugins want `.tsx`, and their
 * transforms are mutually unintelligible, so one of them has to be narrowed:
 *
 *     react({ exclude: deckSolidFiles }),
 *     solid({ include: deckSolidFiles }),
 */
export const deckSolidFiles = ["**/*.solid.tsx", "**/*.solid.jsx"] as const;
