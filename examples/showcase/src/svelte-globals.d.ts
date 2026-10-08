/** The tally the island verifier reads; see `tools/verify-island.mjs`. */
declare global {
  interface Window {
    __svelteIsland?: { mounted: number; destroyed: number };
  }
}

export {};
