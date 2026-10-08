import { createElement } from "react";
import { createRoot } from "react-dom/client";

import type { DeckRenderer, IslandComponent, IslandProps, RenderContext } from "./contract.ts";

/**
 * React — the framework the deck runtime itself draws with.
 *
 * `native: true` is the whole point of this file. `<Island>` sees it and renders the component
 * directly into the tree instead of mounting it, so a React component on a slide keeps the deck's
 * context: the click it should be revealed at, the theme, the live room, the glossary. Through an
 * island it would get a second React root, and context does not cross a root boundary — the
 * component would render, and every hook that made it part of a deck would quietly return nothing.
 *
 * `mount` exists anyway, for the day the host surface is not React: a React island inside a Vue
 * deck is a root, and then a root is the right answer.
 */
export const reactRenderer: DeckRenderer = {
  name: "react",
  native: true,

  // No `owns`: a React component is a plain function, and so is a Solid one. Claiming every
  // function would take Solid's components away from Solid. React is resolved by being the native
  // renderer, by `framework="react"`, or by the build's stamp — never by guessing.

  mount(host: Element, component: IslandComponent, props: IslandProps, context: RenderContext) {
    const root = createRoot(host);
    const render = (p: IslandProps) =>
      root.render(
        createElement(
          component as Parameters<typeof createElement>[0],
          p,
          context.slot
            ? createElement("div", { dangerouslySetInnerHTML: { __html: context.slot } })
            : undefined,
        ),
      );
    render(props);
    return {
      destroy() {
        // Unmounting synchronously inside React's own commit is what React warns about; a
        // microtask puts it safely after.
        queueMicrotask(() => root.unmount());
      },
      update: render,
    };
  },
};
