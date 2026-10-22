import { Component as ReactComponent, createContext, type ReactNode, useContext } from "react";

import { flatIndex, totalSlides } from "../core/model.ts";
import { key as navKey } from "../core/navigation.ts";
import type { LayerName, LayerProps } from "../theming/contract.ts";
import { type DeckRuntime, useDeck } from "./context.ts";
import { useNav } from "./hooks.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GLOBAL AND SLIDE LAYERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Slidev's four layers, from the top of the stack down:
 *
 *   global-top      one instance over the stage: a logo, a progress line, a watermark
 *   slide-top       one per slide, over its content
 *   (the slide)
 *   slide-bottom    one per slide, under its content
 *   global-bottom   one instance under the stage's slides: a footer that does not move
 *
 * and a fifth that is not on the slide at all: `custom-nav-controls`, buttons of the deck's own
 * beside its controls — a "next" of a different shape, a link to the repo, a timer toggle. It
 * draws as a small toolbar at the stage's bottom-left in play (faint until hovered or focused,
 * like the arrows) and at the end of the presenter view's toolbar; never on a printed page, a
 * tile or a thumbnail. Its components get the same `LayerProps` (`view` says which of the two
 * it is in) and act through `useActions()` / `useNav()`.
 *
 * A layer comes from the deck (`<Deck layers>`, or `global-top.tsx`… beside deck.mdx), from its
 * theme, and from its addons; all of them draw, the theme's lowest (theming/merge.ts). Each gets
 * `LayerProps` — the slide, its page number, the click — as props and through `useLayer()`, so
 * a footer reading "4 / 12" is three lines. Global layers draw once on the stage, following the
 * current slide; on a printed page, an overview tile or a thumbnail they draw on that page with
 * that page's slide, which is why a layer should read `props.slide`, not the navigation.
 *
 * Shown in play, print and export; in the presenter view unless `layers.presenter` is false; on
 * overview tiles when `layers.overview` is true. A layer that throws is dropped with a console
 * line, never the slide. (The nav-controls layer follows the controls instead: play and the
 * presenter view, whatever `layers` says.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const LayerContext = createContext<LayerProps | null>(null);

/** Inside a layer: what it is drawn over. Null outside one. */
export function useLayer(): LayerProps | null {
  return useContext(LayerContext);
}

class LayerBoundary extends ReactComponent<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(`[deck] the ${this.props.name} layer failed and is hidden:`, error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The props for a layer drawn over slide (h, v) at `click`. */
export function layerProps(
  deck: DeckRuntime,
  layer: LayerName,
  h: number,
  v: number,
  click: number,
  print: boolean,
): LayerProps {
  const slide = deck.columns[h]?.slides[v] ?? null;
  const index = slide ? flatIndex(deck.columns, h, v) : 0;
  return {
    layer,
    slide,
    index,
    page: index + 1,
    total: totalSlides(deck.columns),
    h,
    v,
    click,
    clicks: deck.nav.get().totals[navKey(h, v)] ?? 0,
    layout: deck.options.get(navKey(h, v))?.layout ?? "default",
    frontmatter: slide?.frontmatter ?? {},
    view: deck.mode,
    print,
  };
}

/** Whether layers draw in this view at all (`layers.presenter`, `layers.overview`). */
export function layersShown(deck: DeckRuntime, surface: "stage" | "tile" = "stage"): boolean {
  if (surface === "tile") return deck.config.layers.overview;
  return deck.mode !== "presenter" || deck.config.layers.presenter;
}

/** One layer's components, stacked in their order, with these props. */
export function LayerSlot({ name, props }: { name: LayerName; props: LayerProps }) {
  const deck = useDeck();
  const list = deck.layers?.[name] ?? [];
  if (!list.length) return null;
  return (
    <div className={`deck-layer deck-layer-${name}`} data-layer={name}>
      <LayerContext.Provider value={props}>
        {list.map((C, i) => (
          <LayerBoundary key={i} name={name}>
            <C {...props} />
          </LayerBoundary>
        ))}
      </LayerContext.Provider>
    </div>
  );
}

/** A global layer on the stage: one instance, following the current slide and click. */
export function StageLayer({ name }: { name: "global-top" | "global-bottom" }) {
  const deck = useDeck();
  const { h, v, click } = useNav((s) => ({ h: s.h, v: s.v, click: s.click, t: s.totals }));
  if (!deck.layers?.[name].length || !layersShown(deck)) return null;
  return <LayerSlot name={name} props={layerProps(deck, name, h, v, click, false)} />;
}

/**
 * The `custom-nav-controls` layer: the deck's, its theme's and its addons' extra buttons, as a
 * toolbar. `placement="stage"` floats it at the bottom-left of the play view; "toolbar" puts it
 * inline, for the presenter view's own toolbar. Nothing at all when no one has any.
 */
export function NavControlsLayer({ placement = "stage" }: { placement?: "stage" | "toolbar" }) {
  const deck = useDeck();
  const { h, v, click } = useNav((s) => ({ h: s.h, v: s.v, click: s.click, t: s.totals }));
  const overview = useNav((s) => s.overview);
  if (!deck.layers?.["custom-nav-controls"].length || deck.projector) return null;
  return (
    <div
      className={`deck-nav-custom is-${placement}`}
      role="toolbar"
      aria-label="Deck controls"
      // The overview covers the stage; its buttons would sit over the tiles.
      hidden={placement === "stage" && overview ? true : undefined}
    >
      <LayerSlot
        name="custom-nav-controls"
        props={layerProps(deck, "custom-nav-controls", h, v, click, false)}
      />
    </div>
  );
}
