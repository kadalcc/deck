import {
  DECK_RENDERER,
  type DeckRenderer,
  type IslandComponent,
  type IslandProps,
  type RenderContext,
} from "@kadal/deck/renderers/contract";
import { type ComponentType, createElement, render } from "preact";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PREACT RENDERER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The shortest renderer in the engine, and the reason is worth more than the code.
 *
 * `update` NEEDS NO REACTIVITY BRIDGE. Vue needed a `reactive` bag, Svelte needed `$state` in a
 * compiled companion module, Solid needed a store — each because the component reads its props
 * once and something has to make later reads happen. A React-shaped framework has no such problem:
 * re-rendering IS the update mechanism, and rendering into the same container diffs against what is
 * there, keeping component state and the DOM. So `update` is `mount` again, and `destroy` is
 * `render(null, host)` — Preact's own documented way to unmount.
 *
 * That makes four frameworks and four completely different answers to one optional contract method.
 * The contract asking for `update(props)` and saying nothing whatever about how has now been tested
 * by every mechanism these frameworks have, and has not had to change.
 *
 * NO PLUGIN, AND NO OWNS EITHER. A Preact component is a plain function returning vnodes — the same
 * shape as React, Solid and compiled Svelte. There is nothing to recognise, so it is stamped. But
 * unlike Solid, Preact needs no Vite plugin at all: a `@jsxImportSource preact` pragma at the top
 * of the file is enough, because the JSX transform already supports per-file import sources. The
 * deck only has to keep React's plugin off those files.
 */

/** Stamp a Preact component so the engine knows who wrote it. */
export function deckPreact<T>(component: T): T {
  (component as { [DECK_RENDERER]?: string })[DECK_RENDERER] = "preact";
  return component;
}

export { deckPreactFiles } from "./build.ts";

export const preactRenderer: DeckRenderer = {
  name: "preact",

  // No `owns`. A Preact component is a plain function, like React's and Solid's. See the header.

  mount(host: Element, component: IslandComponent, props: IslandProps, context: RenderContext) {
    const Component = component as ComponentType<IslandProps>;
    const draw = (p: IslandProps) => {
      render(createElement(Component, context.slot ? { ...p, deckSlot: context.slot } : p), host);
    };

    draw(props);

    let gone = false;
    return {
      destroy() {
        if (gone) return;
        gone = true;
        // Preact's documented unmount: render nothing into the container it owns.
        render(null, host);
      },
      update(next: IslandProps) {
        if (gone) return;
        // Rendering into the same container diffs rather than replaces, so component state and the
        // DOM survive. This is the whole of the reactivity bridge the other three renderers needed.
        draw(next);
      },
    };
  },

  // No `ssr`. `preact-render-to-string` would be a second dependency for a surface that does not
  // exist yet; the deck's print and export paths run a real browser. Same as Vue, Svelte and Solid.
};
