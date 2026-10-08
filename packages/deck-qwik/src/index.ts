import {
  DECK_RENDERER,
  type DeckRenderer,
  type IslandComponent,
  type IslandProps,
  type RenderContext,
} from "@kadal/deck/renderers/contract";
import { type FunctionComponent, type Signal, createSignal, jsx, render } from "@qwik.dev/core";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QWIK RENDERER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Qwik is the framework whose headline feature does not apply here, and saying that plainly is more
 * useful than pretending otherwise.
 *
 * RESUMABILITY IS MOOT INSIDE AN ISLAND. Qwik exists to serialise a rendered application on the
 * server and resume it in the browser with no hydration — the work never happens twice because it
 * is never redone. A deck island has no server-rendered HTML to resume: it does not exist until the
 * slide it lives on is the slide being shown, and then it is rendered client-side from scratch.
 * What is left of Qwik in that setting is a perfectly good fine-grained reactive framework, and
 * that is what this renderer drives. An author who wants resumability wants a Qwik app, not a slide.
 *
 * NO OPTIMIZER, BUT `component$()` IS NOT OPTIONAL. Qwik's Vite plugin wants to own an app's build
 * — its own inputs, its own SSR entry, its own client manifest — and a deck is already an app. It
 * turns out not to be needed: `component$()` without the optimizer falls back to an inline QRL and
 * works. What does NOT work is the thing that looked like the obvious shortcut. An *inline*
 * component — a plain function returning JSX — renders exactly once and is then inert: measured on
 * this deck, its signals changed and the DOM never moved, no error, no warning. Wrapping the same
 * function in `component$()` fixed it outright. An inline component has no host of its own to
 * subscribe, so nothing is listening. Write `component$()`.
 *
 * TWO MORE THINGS THE OPTIMIZER WOULD HAVE DONE. It substitutes `__EXPERIMENTAL__.<flag>` through
 * the runtime, which references it in sixty-odd unguarded places — without a `define`, the first
 * `render()` throws `ReferenceError` before anything reaches the slide (see `deckQwikDefine`). And
 * it injects the qwikloader, the script that fires `qvisible` from an IntersectionObserver. So
 * `useVisibleTask$` never runs here — and should not be used anyway, because that loader scans the
 * document on readystate change and would never see an island that mounts on slide four. Use
 * `useTask$`: an island exists only while its slide is up, so the deck has already decided the
 * component is visible by the time it renders at all.
 *
 * MOUNT IS ASYNCHRONOUS, AND IT IS THE FIRST ONE THAT IS. `render()` returns a promise of a cleanup
 * function. The contract wants an `IslandMount` synchronously, which turns out to be exactly right:
 * the handle is returned at once and the teardown it closes over waits for the render to land. The
 * case that matters is a presenter stepping past a slide faster than its island renders, and it is
 * handled by `destroy` setting a flag the render completion checks.
 *
 * PROPS ARE SIGNALS, VISIBLY. The other four renderers hide their update mechanism from the
 * component author. This one cannot: Qwik's reactivity is signals, so the renderer creates one per
 * prop and the component reads `props.step.value`. It is a leak, it is Qwik's own idiom, and it is
 * the price of a framework whose propagation is the point.
 */

/** Stamp a Qwik component so the engine knows who wrote it. */
export function deckQwik<T>(component: T): T {
  (component as { [DECK_RENDERER]?: string })[DECK_RENDERER] = "qwik";
  return component;
}

export { deckQwikDefine, deckQwikFiles } from "./build.ts";

/** What a Qwik island actually receives: one signal per prop, so updates propagate. */
export type QwikIslandProps<T> = { [K in keyof T]: Signal<T[K]> };

export const qwikRenderer: DeckRenderer = {
  name: "qwik",

  // No `owns`. An inline Qwik component is a plain function, like the other four. See the header.

  mount(host: Element, component: IslandComponent, props: IslandProps, context: RenderContext) {
    const first = context.slot ? { ...props, deckSlot: context.slot } : props;

    // One signal per prop. Replacing a signal's value is what makes Qwik re-run the computations
    // that read it; replacing the props object would do nothing at all.
    const signals = new Map<string, Signal<unknown>>();
    for (const [key, value] of Object.entries(first)) signals.set(key, createSignal(value));

    const asProps = () => Object.fromEntries(signals) as IslandProps;

    let gone = false;
    let cleanup: (() => void) | null = null;

    void render(host, jsx(component as FunctionComponent<IslandProps>, asProps()))
      .then((result) => {
        // The presenter can step past a slide faster than its island renders. Whoever finishes
        // second does the cleaning up.
        if (gone) result.cleanup();
        else cleanup = () => result.cleanup();
      })
      .catch((error: unknown) => {
        console.error("[deck] qwik island failed to render:", error);
      });

    return {
      destroy() {
        if (gone) return;
        gone = true;
        cleanup?.();
        cleanup = null;
      },
      update(next: IslandProps) {
        if (gone) return;
        const incoming = context.slot ? { ...next, deckSlot: context.slot } : next;

        for (const [key, value] of Object.entries(incoming)) {
          const signal = signals.get(key);
          if (signal) signal.value = value;
          // A prop that did not exist at mount has no signal, and adding one now would not reach
          // the component — it was handed the props object once. Say so rather than fail quietly.
          else
            console.warn(`[deck] qwik island: prop “${key}” appeared after mount and is ignored`);
        }
        for (const [key, signal] of signals) if (!(key in incoming)) signal.value = undefined;
      },
    };
  },

  // No `ssr`. Qwik's server render is the one place its resumability would matter, and a deck's
  // print and export paths run a real browser. See the header for why that is not a loss here.
};
