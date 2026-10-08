import { DECK_RENDERER } from "@kadal/deck/renderers/contract";

/**
 * Build-time helpers for Fresh islands. Imports nothing but the contract's symbol — a deck's
 * `vite.config.ts` reaches this module in Node, before any bundling. See `@kadal/deck-angular/build`
 * for the time that mattered.
 */

/** The glob a deck uses to keep Fresh's JSX out of React's plugin. */
export const deckFreshFiles = ["**/*.fresh.tsx", "**/*.fresh.jsx"] as const;

/** Stamp a Fresh island so the engine knows who wrote it. */
export function deckFresh<T>(component: T): T {
  (component as { [DECK_RENDERER]?: string })[DECK_RENDERER] = "fresh";
  return component;
}
