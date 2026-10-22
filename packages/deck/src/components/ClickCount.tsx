import type { ReactNode } from "react";

import { key as navKey } from "../core/navigation.ts";
import { useSlideOptional } from "../react/context.ts";
import { useNav } from "../react/hooks.ts";
import { useLayer } from "../react/Layers.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SLIDE'S CLICK COUNT  —  Slidev's `$clicks`, as a hook and a component
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   const { click, total } = useClicks();        the click this slide is at, and how many it has
 *
 *   Step <ClickCount /> of <ClickCount total />  "Step 2 of 5"
 *   <ClickCount when={(c) => c > 3}>…</ClickCount> Slidev's `v-if="$clicks > 3"`: the children
 *                                                  (Markdown and all) only while `when` says so
 *   <ClickCount>{(c) => c * 10}%</ClickCount>      anything else that depends on the count
 *
 * Where it is drawn decides whose clicks they are, the way `<SlideCurrentNo>` decides its number:
 * on a slide, that slide's own (a past slide reads fully clicked, a future one 0 — what the slide
 * itself renders at, so a printed page or an overview tile at step 3 says 3); in a layer, the
 * slide the layer is drawn over; anywhere else (a page, the presenter's chrome), the current one.
 *
 * Unlike `<Click>`, neither registers a click step: reading the count never changes how many the
 * slide has — so it can never be what makes a slide one click longer, as a hidden `<Click>` would.
 * The Slidev importer writes `{{ $clicks }}` and `$clicksContext.current` as `<ClickCount />`,
 * `$clicksContext.total` as `<ClickCount total />`, and `v-if="$clicks > 3"` (any comparison of
 * the count with numbers, `v-else-if` / `v-else` chains too) as `<ClickCount when>`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ClicksInfo {
  /** The click step being shown: 0 before the first click. */
  click: number;
  /** How many click steps the slide has (its `clicks:` frontmatter, else what it registered). */
  total: number;
  /** Which slide these are of. */
  h: number;
  v: number;
}

/** The click count of the slide this is drawn on (see the header for which slide that is). */
export function useClicks(): ClicksInfo {
  const slide = useSlideOptional();
  const layer = useLayer();
  const nav = useNav((s) => ({ h: s.h, v: s.v, click: s.click, totals: s.totals }));
  if (slide)
    return {
      click: slide.click,
      total: nav.totals[navKey(slide.h, slide.v)] ?? slide.registry.total(),
      h: slide.h,
      v: slide.v,
    };
  if (layer) return { click: layer.click, total: layer.clicks, h: layer.h, v: layer.v };
  return { click: nav.click, total: nav.totals[navKey(nav.h, nav.v)] ?? 0, h: nav.h, v: nav.v };
}

export interface ClickCountProps {
  /** Show the slide's number of clicks rather than the current one. */
  total?: boolean;
  /** Add this to the number shown: `offset={1}` counts from 1 ("step 1" before any click). */
  offset?: number;
  className?: string;
  /** Render the children only while this is true of the count: `when={(c) => c >= 2}`. */
  when?: (click: number, total: number) => unknown;
  /**
   * With `when`: what to show. Otherwise a function of the count, for anything that depends on
   * it: `{(c, total) => …}`. Without either, the number is shown in a `<span>`.
   */
  children?: ReactNode | ((click: number, total: number) => ReactNode);
}

export function ClickCount({
  total = false,
  offset = 0,
  className,
  when,
  children,
}: ClickCountProps) {
  const c = useClicks();
  if (typeof when === "function") {
    if (!when(c.click, c.total)) return null;
    return <>{typeof children === "function" ? children(c.click, c.total) : children}</>;
  }
  if (typeof children === "function") return <>{children(c.click, c.total)}</>;
  return (
    <span
      className={["deck-click-count", className].filter(Boolean).join(" ")}
      data-click={c.click}
      data-clicks={c.total}
    >
      {(total ? c.total : c.click) + (Number.isFinite(offset) ? offset : 0)}
    </span>
  );
}
