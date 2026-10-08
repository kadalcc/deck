import {
  DECK_RENDERER,
  type DeckRenderer,
  type IslandComponent,
  type IslandProps,
  type RenderContext,
} from "@kadal/deck/renderers/contract";
import { type Component, mount, unmount } from "svelte";

import { createPropsBag } from "./props.svelte.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SVELTE RENDERER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first framework with no virtual DOM and no runtime component object — a compiled Svelte 5
 * component is a function the compiler wrote, and everything interesting about it happened before
 * the browser saw it. Three things followed, and all three are the contract earning its keep.
 *
 * `owns()` IS IMPOSSIBLE, AND THAT IS MEASURED, NOT ASSUMED. Compiling the same component twice:
 *
 *     dev:  Probe[$.FILENAME] = 'Probe.svelte';
 *           export default function Probe($$anchor, $$props) { … }
 *     prod: export default function Probe($$anchor, $$props) { … }
 *
 * The only marker is a Symbol from `svelte/internal/client`, and it is gone in the build anyone
 * actually ships. A production Svelte component is a two-argument function, exactly like a React
 * one. So this renderer never guesses — it ships `deckSveltePlugin()`, which stamps `DECK_RENDERER`
 * onto every `.svelte` module as it is compiled. That is the contract's "the build says so, not the
 * engine" written out in full, and the reason the stamp is a `Symbol.for` global: the plugin can
 * mint the same symbol without importing a single thing from the engine.
 *
 * PROPS NEED A COMPILER TO BE REACTIVE. `mount(Component, { props })` hands the object over and the
 * component reads `props.label` on each render — untracked, if that object is plain. Vue needed a
 * `reactive` bag; Svelte needs `$state`, which is a compiler feature and therefore cannot be
 * written in this file at all. Hence `props.svelte.ts` next door, which the consumer's Svelte
 * plugin compiles. Every compiler-target framework will need its own version of that dance.
 *
 * TEARDOWN IS ASYNCHRONOUS BY DEFAULT. `unmount` plays outro transitions and resolves when they
 * finish, which for an island means the old framework is still in the DOM while the next slide
 * comes up. `{ outro: false }` makes it immediate, which is what a slide change wants.
 */

/**
 * Stamp a Svelte component so the engine knows who wrote it.
 *
 * `deckSveltePlugin()` does this for every `.svelte` file, so reach for this only when writing a
 * component by hand, or when the plugin is not in the deck's Vite config.
 */
export function deckSvelte<T>(component: T): T {
  (component as { [DECK_RENDERER]?: string })[DECK_RENDERER] = "svelte";
  return component;
}

export const svelteRenderer: DeckRenderer = {
  name: "svelte",

  // No `owns`. See the header: there is nothing in a production-compiled Svelte component to
  // recognise, and the contract is explicit that a wrong yes is worse than no answer.

  mount(host: Element, component: IslandComponent, props: IslandProps, context: RenderContext) {
    const bag = createPropsBag(props);

    // Children arrive as HTML, so they go in as a snippet rendering that markup rather than as a
    // live tree. A React subtree cannot keep its state inside a Svelte component; see the contract.
    if (context.slot) {
      bag.set({ ...props, deckSlot: context.slot });
    }

    const instance = mount(component as Component, {
      target: host,
      props: bag.props,
    });

    let gone = false;
    return {
      destroy() {
        if (gone) return;
        gone = true;
        // Immediate, not animated: the slide is already leaving, and a lingering outro would put
        // this island on top of the next slide for the length of its transition.
        void unmount(instance, { outro: false });
      },
      update(next: IslandProps) {
        if (gone) return;
        bag.set(context.slot ? { ...next, deckSlot: context.slot } : next);
      },
    };
  },

  // No `ssr`. `svelte/server`'s `render` would pull a second copy of the compiler output into every
  // deck with a Svelte island, and the deck's print and export paths run a real browser. Same
  // reasoning as the Vue renderer; it goes in when a surface appears that cannot run JS.
};

export { deckSveltePlugin, type DeckSveltePlugin } from "./build.ts";
