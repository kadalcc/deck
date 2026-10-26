import { readItem, writeItem } from "../core/storage.ts";
import { createStore, type Store } from "../core/store.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REHEARSAL TIMELINE, SHOWN OR HIDDEN  —  per deck, remembered in this browser
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The presenter view's bottom row is the narrator's bar (narrate/Narration.tsx): the timeline,
 * play, speed, voice. A presenter who isn't rehearsing can hide it — the × on the bar, the toggle
 * in the toolbar's rehearsal menu, Shift R, or `narrate.timeline` — and each deck remembers its
 * own choice. Hiding never stops the narrator: it stays mounted, and while it plays or is paused
 * mid-talk a small pill stands in for the bar, with the way back.
 *
 * Storage goes through core/storage.ts, whose every touch of localStorage is wrapped: a sandboxed
 * page, a private window or a full disk keeps the choice for the page's life instead of failing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The storage key for one deck's choice. */
export const timelineKey = (deck: string) => `deck.presenter.timeline.${deck || "deck"}`;

/** Shown unless this deck was left with it hidden; anything unreadable counts as shown. */
export function readTimelineShown(deck: string): boolean {
  try {
    return readItem(timelineKey(deck)) !== "hidden";
  } catch {
    return true;
  }
}

export function writeTimelineShown(deck: string, shown: boolean): void {
  try {
    writeItem(timelineKey(deck), shown ? "shown" : "hidden");
  } catch {
    /* the store below still holds it for this page */
  }
}

const stores = new Map<string, Store<boolean>>();

/** One store per deck, so the toolbar's menu, the bar's × and the command agree. */
export function timelineShown(deck: string): Store<boolean> {
  const hit = stores.get(deck);
  if (hit) return hit;
  const store = createStore(readTimelineShown(deck));
  store.subscribe((shown) => writeTimelineShown(deck, shown));
  stores.set(deck, store);
  return store;
}
