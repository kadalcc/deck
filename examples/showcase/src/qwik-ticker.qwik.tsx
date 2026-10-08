/** @jsxImportSource @qwik.dev/core */
import { component$, useSignal, useTask$, type Signal } from "@qwik.dev/core";

import { deckQwik } from "@kadal/deck-qwik";

/**
 * A Qwik component on a slide, for the islands tour.
 *
 * Two things about this file are different from its four neighbours, and both are honest about
 * what Qwik is.
 *
 * It is a `component$()` and has to be. Written as an inline component — a plain function
 * returning JSX — it rendered once and went inert: signals changed, the DOM never moved, nothing
 * logged. An inline component has no host of its own to subscribe, so nothing is listening.
 * `component$()` works without Qwik's Vite optimizer, which is just as well, since that plugin
 * wants to own an app's build and a deck is already an app.
 *
 * And its props are **signals**. Qwik's reactivity is signal propagation, so the renderer creates
 * one signal per prop and the component reads `step.value`. The other four renderers hide their
 * update mechanism; this one cannot, and pretending otherwise would mean remounting the island on
 * every click.
 */

declare global {
  interface Window {
    __qwikIsland?: { mounted: number; destroyed: number };
  }
}

export const QwikTicker = deckQwik(
  component$(({ label, step }: { label: Signal<string>; step: Signal<number> }) => {
    const ticks = useSignal(0);

    // `useTask$`, not `useVisibleTask$`. The visible variant waits for a `qvisible` event that
    // Qwik's loader script fires from an IntersectionObserver, and that loader only scans the
    // document on readystate change — it would never see an island that mounts on slide four.
    // Nothing is lost: an island exists only while its slide is up, so the deck has already
    // decided this component is visible by the time it renders at all.
    useTask$(({ cleanup }) => {
      const tally = (window.__qwikIsland ??= { mounted: 0, destroyed: 0 });
      tally.mounted++;
      const timer = setInterval(() => ticks.value++, 100);
      cleanup(() => {
        tally.destroyed++;
        clearInterval(timer);
      });
    });

    return (
      <div class="ticker is-qwik" data-qwik-ticks={ticks.value} data-qwik-step={step.value ?? 0}>
        <span class="ticker-label">{label.value ?? "a qwik island"}</span>
        <strong class="ticker-count">{(ticks.value / 10).toFixed(1)}s</strong>
        <em class="ticker-step">deck click {step.value ?? 0}</em>
      </div>
    );
  }),
);
