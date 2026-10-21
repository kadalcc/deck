import { useId, useLayoutEffect, useMemo } from "react";

import type { ClickRange, ClickSpec } from "../core/clicks.ts";
import { useSlideOptional } from "../react/context.ts";

/**
 * Register a click step for each spec — none for an empty list — and get their ranges back, in
 * order. `useClick` always registers one step; components whose steps are optional (`<Video at>`,
 * `<Drag at>`) or several (`<Video steps>`) use this instead. Same rules as `useClick`: allocated
 * during render, so document order holds, and keyed by `useId`, so a re-render keeps its steps.
 * Outside a slide there is nothing to register with, and the list is empty.
 */
export function useClickPoints(specs: ClickSpec[]): ClickRange[] {
  const slide = useSlideOptional();
  const id = useId();
  const sig = JSON.stringify(specs);
  const ranges = useMemo(
    () => (slide ? specs.map((s, i) => slide.registry.allocate(`${id}:${i}`, s)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slide?.registry, id, sig],
  );
  useLayoutEffect(() => {
    if (!slide) return;
    specs.forEach((s, i) => slide.registry.allocate(`${id}:${i}`, s));
    return () => specs.forEach((_, i) => slide.registry.release(`${id}:${i}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.registry, id, sig]);
  return ranges;
}
