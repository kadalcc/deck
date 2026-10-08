/**
 * Build-time helpers for Qwik islands.
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
 * The glob a deck uses to keep Qwik's JSX out of React's plugin. As with Preact there is no second
 * plugin: the file's own `@jsxImportSource @qwik.dev/core` pragma does the rest.
 */
export const deckQwikFiles = ["**/*.qwik.tsx", "**/*.qwik.jsx"] as const;

/**
 * Build-time constants Qwik's runtime reads, which its own Vite plugin would normally supply.
 *
 *     define: { ...deckQwikDefine }
 *
 * Skipping the optimizer means skipping the text substitution it does, and the runtime references
 * `__EXPERIMENTAL__.<flag>` in sixty-odd places — unguarded, so the very first `render()` throws
 * `ReferenceError: __EXPERIMENTAL__ is not defined` before anything reaches the slide. An empty
 * object is the correct value: every experimental flag reads as `undefined`, which is what the
 * optimizer emits for a project that enabled none of them.
 */
export const deckQwikDefine = {
  __EXPERIMENTAL__: "{}",
  __QWIK_MANIFEST__: "null",
} as const;
