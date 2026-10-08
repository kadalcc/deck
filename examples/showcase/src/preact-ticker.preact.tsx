/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";

import { deckPreact } from "@kadal/deck-preact";

/**
 * A Preact component on a slide, for the islands tour.
 *
 * `.preact.tsx` keeps React's Vite plugin off it; unlike Solid there is no second plugin to add,
 * because the pragma above is the whole configuration. The JSX transform already supports a
 * per-file import source, so this file compiles to `preact/jsx-runtime` and the one next to it
 * still compiles to React's.
 *
 * Note that nothing here bridges reactivity. The renderer re-renders into the same container and
 * Preact diffs, so `ticks` survives a prop change — which is exactly what the other three
 * renderers needed a reactive bag, a compiled companion module and a store to achieve.
 */

declare global {
  interface Window {
    __preactIsland?: { mounted: number; destroyed: number };
  }
}

const tally = () => (window.__preactIsland ??= { mounted: 0, destroyed: 0 });

export const PreactTicker = deckPreact(
  ({ label = "a preact island", step = 0 }: { label?: string; step?: number }) => {
    const [ticks, setTicks] = useState(0);

    useEffect(() => {
      tally().mounted++;
      const timer = setInterval(() => setTicks((n) => n + 1), 100);
      return () => {
        tally().destroyed++;
        clearInterval(timer);
      };
    }, []);

    return (
      <div class="ticker is-preact" data-preact-ticks={ticks} data-preact-step={step}>
        <span class="ticker-label">{label}</span>
        <strong class="ticker-count">{(ticks / 10).toFixed(1)}s</strong>
        <em class="ticker-step">deck click {step}</em>
      </div>
    );
  },
);
