/**
 * The engine's version, as the build says it: the prebuilt shell (packages/deck-shell) and the
 * Vite plugin (vite/index.ts) define `__KADAL_DECK_VERSION__`. A page built some other way — a
 * test, a bundler without the plugin — says "dev".
 */
declare const __KADAL_DECK_VERSION__: string | undefined;

export const ENGINE_VERSION: string =
  typeof __KADAL_DECK_VERSION__ === "string" ? __KADAL_DECK_VERSION__ : "dev";
