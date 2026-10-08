import { useId, useLayoutEffect, useMemo } from "react";

import { type ClickRange, type ClickSpec, isCurrent, isShown } from "../core/clicks.ts";
import type { Layout } from "../core/layout.ts";
import type { NavState } from "../core/navigation.ts";
import { useStore } from "../core/store.ts";
import { type UiState, useDeck, useSlide, useSlideOptional } from "./context.ts";

export function useNav<S = NavState>(selector?: (s: NavState) => S): S {
  const { nav } = useDeck();
  return useStore(nav, selector);
}

export function useUi<S = UiState>(selector?: (s: UiState) => S): S {
  const { ui } = useDeck();
  return useStore(ui, selector);
}

export function useLayout(): Layout {
  const { layout } = useDeck();
  return useStore(layout);
}

export function useConfig() {
  return useDeck().config;
}

export function useActions() {
  return useDeck().actions;
}

/** The current slide's meta and options, or null when nothing is active yet. */
export function useCurrentSlide() {
  const { columns, options } = useDeck();
  const { h, v } = useNav((s) => ({ h: s.h, v: s.v }));
  const meta = columns[h]?.slides[v] ?? null;
  return { h, v, meta, options: meta ? (options.get(`${h},${v}`) ?? null) : null };
}

/**
 * Register a click step for the calling element and learn whether it is shown right now.
 * Registration happens during render so document order is preserved; the range is stable across
 * re-renders and Strict Mode's double render because it is keyed by `useId`.
 */
export function useClick(spec: ClickSpec = {}): {
  range: ClickRange;
  shown: boolean;
  current: boolean;
  click: number;
} {
  const slide = useSlide();
  const id = useId();
  const range = useMemo(
    () => slide.registry.allocate(id, spec),
    [slide.registry, id, spec.at, spec.hide, spec.span],
  );
  useLayoutEffect(() => {
    slide.registry.allocate(id, spec); // re-activate after StrictMode's simulated unmount
    return () => slide.registry.release(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.registry, id]);
  return {
    range,
    shown: isShown(range, slide.click),
    current: isCurrent(range, slide.click),
    click: slide.click,
  };
}

/** Read the current click without registering anything (a code block after its `<pre>` did). */
export function useClickIndex(): number {
  return useSlideOptional()?.click ?? 0;
}
