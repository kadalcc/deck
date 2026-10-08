/**
 * Build-time helpers for Preact islands.
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
 * The glob a deck uses to keep Preact's JSX out of React's plugin. Unlike Solid there is no second
 * plugin to hand it to — the file's own `@jsxImportSource` pragma does the rest:
 *
 *     react({ exclude: [...deckSolidFiles, ...deckPreactFiles] }),
 */
export const deckPreactFiles = ["**/*.preact.tsx", "**/*.preact.jsx"] as const;
