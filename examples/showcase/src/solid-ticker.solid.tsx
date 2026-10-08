/** @jsxImportSource solid-js */
import { createSignal, onCleanup, onMount } from "solid-js";

import { deckSolid } from "@kadal/deck-solid";

/**
 * A Solid component on a slide, for the islands tour.
 *
 * `.solid.tsx`, because React's plugin and Solid's both want `.tsx` and their transforms are
 * mutually unintelligible; the deck's vite.config hands this glob to both so each leaves the
 * other's files alone. The collision is at the type level too — the deck's tsconfig points JSX at
 * React — so the file opens with a `@jsxImportSource` pragma, which is the per-file version of the
 * same statement. Both are needed; neither implies the other.
 *
 * Note what the body does NOT do: it runs once. `step` is read inside the JSX, so only that one
 * expression re-runs when the deck hands over new props — which is the whole of Solid, and the
 * reason the renderer passes a store rather than an object.
 */

declare global {
  interface Window {
    __solidIsland?: { mounted: number; destroyed: number };
  }
}

const tally = () => (window.__solidIsland ??= { mounted: 0, destroyed: 0 });

export const SolidTicker = deckSolid((props: { label?: string; step?: number }) => {
  const [ticks, setTicks] = createSignal(0);

  onMount(() => {
    tally().mounted++;
  });

  const timer = setInterval(() => setTicks((n) => n + 1), 100);
  onCleanup(() => {
    tally().destroyed++;
    clearInterval(timer);
  });

  return (
    <div class="ticker is-solid" data-solid-ticks={ticks()} data-solid-step={props.step ?? 0}>
      <span class="ticker-label">{props.label ?? "a solid island"}</span>
      <strong class="ticker-count">{(ticks() / 10).toFixed(1)}s</strong>
      <em class="ticker-step">deck click {props.step ?? 0}</em>
    </div>
  );
});
