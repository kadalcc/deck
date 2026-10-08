import {
  DECK_RENDERER,
  type DeckRenderer,
  type IslandComponent,
  type IslandProps,
  type RenderContext,
} from "@kadal/deck/renderers/contract";
import { type Component, createComponent } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { render } from "solid-js/web";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SOLID RENDERER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Solid is the framework that makes the contract's refusal to sniff unarguable. A Solid component
 * is a plain function that returns DOM, a React component is a plain function that returns
 * elements, and a production-compiled Svelte component is a plain function too. Three frameworks,
 * one runtime shape, no way to tell them apart. Every one of them has to be told.
 *
 * A COMPONENT IS CALLED ONCE, SO PROPS MUST BE GETTERS. This is the whole of Solid and it is the
 * opposite of React: the function body runs a single time and what re-runs is the small reactive
 * computation around each value it read. Hand it a plain object and the island freezes at the props
 * it was born with. A `createStore` proxy makes each read tracked, so `update` is a `reconcile`
 * that touches only the keys that actually changed — which is as close to free as an island update
 * gets in any of these frameworks.
 *
 * NO JSX HERE. Solid's JSX is a compiler that emits `createComponent` calls; this package is plain
 * TypeScript nobody compiles with Babel, so it calls `createComponent` directly — the runtime
 * function the compiler would have emitted. That keeps the renderer buildless and makes what it
 * does to the component completely explicit.
 *
 * AND IT COLLIDES WITH REACT OVER `.tsx`. Both plugins claim the extension and their transforms are
 * incompatible, so a deck using both must say which files are whose. `deckSolidFiles` is the
 * convention this engine picks — `*.solid.tsx` — and the README shows the three lines of Vite
 * config it takes. Astro gets to avoid this by owning the file extension; a deck cannot.
 */

/**
 * Stamp a Solid component so the engine knows who wrote it.
 *
 * There is no `deckSolidPlugin()` to do this for you, and deliberately so: `*.solid.tsx` is a file
 * naming convention rather than a compiler output, so a plugin stamping it would be guessing from
 * the filename — and the engine already has a way for an author to say what it is.
 */
export function deckSolid<T>(component: T): T {
  (component as { [DECK_RENDERER]?: string })[DECK_RENDERER] = "solid";
  return component;
}

export { deckSolidFiles } from "./build.ts";

export const solidRenderer: DeckRenderer = {
  name: "solid",

  // No `owns`. A Solid component is a plain function; so is a React one. See the header.

  mount(host: Element, component: IslandComponent, props: IslandProps, context: RenderContext) {
    // A store, not an object: Solid's component body runs once, and only tracked reads re-run.
    const [live, setLive] = createStore<IslandProps>(
      context.slot ? { ...props, deckSlot: context.slot } : { ...props },
    );

    // `createComponent` is what Solid's JSX compiles to. Calling it directly is the same thing,
    // written out, and keeps this package free of a build step.
    const dispose = render(() => createComponent(component as Component, live), host);

    let gone = false;
    return {
      destroy() {
        if (gone) return;
        gone = true;
        dispose();
      },
      update(next: IslandProps) {
        if (gone) return;
        // `reconcile` diffs rather than replaces, so a component that read only `step` re-runs only
        // the computation that read `step`, and the rest of the island does not notice.
        setLive(reconcile(context.slot ? { ...next, deckSlot: context.slot } : { ...next }));
      },
    };
  },

  // No `ssr`. `solid-js/web`'s `renderToString` would pull the server build into every deck with a
  // Solid island, and the deck's print and export paths run a real browser. Same as Vue and Svelte.
};
