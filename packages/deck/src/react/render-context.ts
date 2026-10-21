import { createContext, createElement, type ReactNode, useContext } from "react";

import { useDeck, useSlideOptional } from "./context.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE A SLIDE IS BEING DRAWN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The same slide renders in many places: the stage, the presenter's current slide, the
 * presenter's next-slide box, an overview tile, a printed page, the audience's phone. Slidev
 * names these render contexts, and `<RenderWhen>` (and `<Video>`, and `<Drag>`'s editing) asks
 * which one it is in:
 *
 *   slide         the deck itself — the stage in play mode, a mirror, the scroll view
 *   presenter     the presenter view's current slide
 *   previewNext   the presenter's next-slide box
 *   overview      a tile of the overview grid (`o`) or of the /overview page
 *   audience      the audience page's copy, on a phone (Kadal's)
 *   none          outside any slide (a layer, a host's chrome)
 *
 * and, across all of them, `print`: the print view, `?print-pdf`, `deck export`.
 *
 * Most of it follows from the view's mode and the slide's own `preview` flag. The places that
 * are previews of a particular kind say so with `<RenderContextProvider value="…">` around their
 * frames — the presenter's next box and the overview's tiles.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type RenderContextName =
  | "slide"
  | "presenter"
  | "previewNext"
  | "overview"
  | "audience"
  | "none";

const Override = createContext<RenderContextName | null>(null);

/** Mark every slide rendered inside as being drawn in `value` (an overview tile, the next box). */
export function RenderContextProvider({
  value,
  children,
}: {
  value: RenderContextName;
  children?: ReactNode;
}) {
  return createElement(Override.Provider, { value }, children);
}

export interface RenderInfo {
  context: RenderContextName;
  /** A printed or exported page: the print view, `?print-pdf`, `deck export`. */
  print: boolean;
}

export function useRenderContext(): RenderInfo {
  const deck = useDeck();
  const slide = useSlideOptional();
  const override = useContext(Override);
  const print = deck.mode === "print" || deck.mode === "export";
  if (override) return { context: override, print };
  if (!slide) return { context: "none", print };
  if (deck.mode === "overview") return { context: "overview", print };
  if (deck.mode === "audience") return { context: "audience", print };
  if (deck.mode === "presenter")
    return { context: slide.preview ? "previewNext" : "presenter", print };
  return { context: "slide", print };
}
