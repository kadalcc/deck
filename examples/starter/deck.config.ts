import type { DeckConfigInput } from "@kadal/deck";

/**
 * Engine settings. Anything here overrides the headmatter in deck.mdx, which overrides the
 * defaults. Talk facts (title, author) belong in the headmatter.
 *
 * `live.api: null` keeps the deck offline on your machine. When you publish it, the host turns
 * the live room on for you (polls, questions, followers). To run against your own host while
 * developing, set KADAL_DECK_API, e.g. KADAL_DECK_API=http://localhost:8797 npm run dev.
 */
export const config: DeckConfigInput = {
  theme: "minimal",
  colorScheme: "auto",
  transition: "slide",
  slideNumber: "c/t",
  controls: true,
  progress: true,
  live: { api: import.meta.env?.VITE_KADAL_DECK_LIVE ? "/api" : null, room: null },
};
