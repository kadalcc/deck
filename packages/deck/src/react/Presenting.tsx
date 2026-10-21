import { type RefObject, useEffect, useState } from "react";

import { type NavDirection, navDirection } from "../core/direction.ts";
import { ContextMenu } from "./ContextMenu.tsx";
import type { DeckRuntime } from "./context.ts";
import { DisplaySettings, useDisplayFilters } from "./DisplaySettings.tsx";

/**
 * The presenting features every page of a deck shares, wired into `<Deck>`'s root with two lines:
 * the navigation direction on the root (for `forward:` / `backward:` styles, core/direction.ts),
 * the display filters, the context menu and the display settings panel.
 */
export function usePresentingRoot(deck: DeckRuntime, root: RefObject<HTMLElement | null>) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(root.current), [root]);
  useDisplayFilters(deck, el);
  // Written to the element straight from the store, before React renders the move: a click's
  // CSS transition starts in the same frame as the step, and must already see which way it went.
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let last: NavDirection = "forward";
    const write = (dir: NavDirection) => {
      last = dir;
      node.dataset.navDirection = dir;
      node.style.setProperty("--deck-nav-sign", dir === "forward" ? "1" : "-1");
    };
    write(navDirection(deck.nav.get().direction));
    return deck.nav.subscribe((s, prev) => {
      if (s.seq === prev.seq) return;
      const dir = navDirection(s.direction, last);
      if (dir !== last || !node.dataset.navDirection) write(dir);
    });
  }, [deck.nav, root]);
}

export function PresentingLayer() {
  return (
    <>
      <ContextMenu />
      <DisplaySettings />
    </>
  );
}
