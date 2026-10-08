import { DECK_RENDERER } from "@kadal/deck/renderers/contract";

/**
 * Build-time helpers for Python islands. Imports nothing but the contract's symbol — a deck's
 * `vite.config.ts` reaches this module in Node, before any bundling.
 */

/**
 * Where Pyodide is fetched from. Pinned, because an interpreter that changes under a deck is a
 * presentation that breaks on stage.
 */
export const PYODIDE_VERSION = "0.28.3";
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/** Mark a Python island's source so the engine knows who runs it. */
export function deckPython(source: string): { [DECK_RENDERER]?: string; source: string } {
  return { [DECK_RENDERER]: "python", source };
}
