import { DECK_RENDERER } from "@kadal/deck/renderers/contract";

/**
 * Build-time helpers for WebAssembly islands. Imports nothing but the contract's symbol — a deck's
 * `vite.config.ts` reaches this module in Node, before any bundling.
 */

/** Stamp a WASM island factory so the engine knows who draws it. */
export function deckWasm<T>(component: T): T {
  (component as { [DECK_RENDERER]?: string })[DECK_RENDERER] = "wasm";
  return component;
}
