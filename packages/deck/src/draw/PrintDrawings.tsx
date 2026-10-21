import { useMemo } from "react";

import { useStore } from "../core/store.ts";
import { useDeck } from "../react/context.ts";
import { drawingsOn, fileDrawings } from "./source.ts";
import { dedupe, StrokeView } from "./Strokes.tsx";
import { loadDrawings } from "./strokes.ts";
import { parseLayerKey } from "./svg.ts";

/**
 * A printed page's drawing (`?print-pdf`, the /export page, `kadal-deck export`): the slide's
 * saved files (`drawings/*.svg`), and the strokes this browser kept for it, drawn over the page
 * the way the live layer draws them. With `drawings.perClick`, a page for click step n shows the
 * strokes of steps up to n; a page that shows every step shows them all.
 *
 * Headless exports start with empty storage, so what reaches a PDF from the CLI is the files;
 * printing from your own browser also prints what you pinned there.
 */
export function PrintDrawings({
  h,
  v,
  click,
  allSteps,
}: {
  h: number;
  v: number;
  click: number;
  /** The page shows every step (one page per slide). */
  allSteps: boolean;
}) {
  const deck = useDeck();
  const files = useStore(fileDrawings(deck).store);
  const cfg = deck.config.drawings;
  const kept = useMemo(
    () => (cfg.persist !== false ? loadDrawings(deck.config.slug || "deck") : {}),
    [cfg.persist, deck.config.slug],
  );
  if (!drawingsOn(deck) && !Object.keys(files.layers).length) return null;
  const slide = `${h},${v}`;
  const shows = (k: string) => {
    const p = parseLayerKey(k);
    if (p.slide !== slide) return false;
    return allSteps || !cfg.perClick || p.click <= click;
  };
  const keys = [...new Set([...Object.keys(files.layers), ...Object.keys(kept)])]
    .filter(shows)
    .sort((a, b) => parseLayerKey(a).click - parseLayerKey(b).click);
  const strokes = dedupe(
    keys.flatMap((k) => [files.layers[k] ?? [], (kept[k] ?? []).filter((s) => !s.fade)]),
  );
  if (!strokes.length) return null;
  return (
    <svg
      className="deck-drawing deck-print-drawing"
      viewBox={`0 0 ${deck.config.width} ${deck.config.height}`}
      style={{ left: 0, top: 0, width: deck.config.width, height: deck.config.height }}
      aria-hidden
    >
      {strokes.map((s) => (
        <StrokeView key={s.id} stroke={s} />
      ))}
    </svg>
  );
}
