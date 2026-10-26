import { createStore, type Store } from "../core/store.ts";
import type { Narrator } from "./player.ts";

/**
 * The narrator this window's bar is running, or null: for controls outside the bar that show its
 * state (the presenter toolbar's rehearsal menu). Its own module, holding only a store, so the
 * toolbar can import it without the narrator's chunk.
 */
export const activeNarrator: Store<Narrator | null> = createStore<Narrator | null>(null);
