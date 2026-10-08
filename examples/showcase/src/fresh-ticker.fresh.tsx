/** @jsxImportSource preact */
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import { deckFresh } from "@kadal/deck-fresh/build";

/**
 * A Fresh island on a slide, written the way Fresh islands are written: a Preact component using
 * `@preact/signals`. That is the point of the file — nothing here is adapted, and the renderer
 * behind it is the Preact one under a different name.
 *
 * What is *not* here is the rest of Fresh: no route file, no partial, no server render, no Deno.
 * All of that is about delivering a page, and a slide is already in the browser by the time the
 * island is asked for.
 */

declare global {
  interface Window {
    __freshIsland?: { mounted: number; destroyed: number };
  }
}

const tally = () => (window.__freshIsland ??= { mounted: 0, destroyed: 0 });

export const FreshTicker = deckFresh(
  ({ label = "a fresh island", step = 0 }: { label?: string; step?: number }) => {
    const ticks = useSignal(0);

    useEffect(() => {
      tally().mounted++;
      const timer = setInterval(() => ticks.value++, 100);
      return () => {
        tally().destroyed++;
        clearInterval(timer);
      };
    }, []);

    return (
      <div class="ticker is-fresh" data-fresh-ticks={ticks.value} data-fresh-step={step}>
        <span class="ticker-label">{label}</span>
        <strong class="ticker-count">{(ticks.value / 10).toFixed(1)}s</strong>
        <em class="ticker-step">deck click {step}</em>
      </div>
    );
  },
);
