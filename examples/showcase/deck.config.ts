import type { DeckConfigInput } from "@kadal/deck";

/**
 * Deck configuration. Anything here overrides the headmatter in deck.mdx, which overrides the
 * defaults; every option is listed in @kadal/deck's model.ts. Keep talk-specific facts in the
 * headmatter (title, author) and engine settings here.
 */
export const config: DeckConfigInput = {
  theme: "minimal",
  colorScheme: "auto",
  transition: "slide",
  slideNumber: "c/t",
  controls: true,
  progress: true,
  // Offline locally; the host turns the room on when the deck is published (see the starter).
  live: { api: import.meta.env?.VITE_KADAL_DECK_LIVE ? "/api" : null, room: null },
};
