import type { DeckConfig } from "./model.ts";

/**
 * The stage is authored at `width × height` and scaled uniformly to fit the viewport with a margin
 * — reveal.js's layout. `disableLayout` decks (BYOL) skip this and fill the viewport.
 */
export interface Layout {
  scale: number;
  /** Stage size after scaling, in CSS pixels. */
  width: number;
  height: number;
  /** Offsets that centre the stage in the viewport. */
  left: number;
  top: number;
}

export function computeLayout(
  config: Pick<DeckConfig, "width" | "height" | "margin" | "minScale" | "maxScale"> &
    Partial<Pick<DeckConfig, "disableLayout">>,
  viewport: { width: number; height: number },
  dpr = 1,
): Layout {
  // reveal's `disableLayout` (bring your own layout): no scaling and no centring; the stage is the
  // viewport (or an embedded deck's element), and the slides are styled to fit it by their author.
  if (config.disableLayout)
    return {
      scale: 1,
      width: Math.max(1, viewport.width),
      height: Math.max(1, viewport.height),
      left: 0,
      top: 0,
    };
  const availableW = viewport.width * (1 - config.margin);
  const availableH = viewport.height * (1 - config.margin);
  let scale = Math.min(availableW / config.width, availableH / config.height);
  scale = Math.max(config.minScale, Math.min(config.maxScale, scale));
  return centreOnPixels(config.width, config.height, scale, viewport, dpr);
}

/**
 * Centre a `width × height` canvas drawn at `scale` in `box`, on whole device pixels.
 *
 * Centred exactly, the stage starts and ends mid-pixel (2.67px of bar each side in a 1488px
 * window). The browser puts the offset on a whole device pixel but keeps the fractional width, so
 * the bar on one side came out a pixel wider than on the other. Here the bars on the barred side
 * are whole device pixels and equal, and the scale grows the hair (under two device pixels) that
 * makes the stage fill exactly what is left. That growth, times the deck's shape, overflows the
 * other side — clipped by the root or the presenter's pane — so where it would come to more than
 * one device pixel the bars may instead differ by exactly one device pixel, both edges still on
 * whole pixels, and the growth stays under one.
 */
export function centreOnPixels(
  width: number,
  height: number,
  scale: number,
  box: { width: number; height: number },
  dpr = 1,
): Layout {
  const d = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const gapX = (box.width - width * scale) / 2;
  const gapY = (box.height - height * scale) / 2;
  let lead: number | null = null;
  // A stage bigger than its box (minScale) has no bars to even out.
  if (gapX >= 0 && gapY >= 0) {
    const across = gapX >= gapY;
    const [view, size, otherView, otherSize] = across
      ? [box.width, width, box.height, height]
      : [box.height, height, box.width, width];
    const free = view * d - size * scale * d; // device pixels of bar, both sides together
    let bars = Math.floor(free / 2) * 2;
    const overflow = (n: number) => ((view * d - n) / (size * d)) * otherSize * d - otherView * d;
    if (overflow(bars) > 1) bars = Math.floor(free);
    const snapped = (view * d - bars) / (size * d);
    if (snapped > 0) {
      scale = snapped;
      lead = Math.floor(bars / 2) / d;
    }
    const w = width * scale;
    const h = height * scale;
    const centred = (n: number) => Math.round(n * d) / d;
    return {
      scale,
      width: w,
      height: h,
      left: across && lead !== null ? lead : centred((box.width - w) / 2),
      top: !across && lead !== null ? lead : centred((box.height - h) / 2),
    };
  }
  const w = width * scale;
  const h = height * scale;
  return {
    scale,
    width: w,
    height: h,
    left: Math.round(((box.width - w) / 2) * d) / d,
    top: Math.round(((box.height - h) / 2) * d) / d,
  };
}

/** A point in viewport pixels → stage coordinates (0..width, 0..height). */
export function toStage(layout: Layout, x: number, y: number): { x: number; y: number } {
  return { x: (x - layout.left) / layout.scale, y: (y - layout.top) / layout.scale };
}

/** Stage coordinates normalised to 0..1, for sharing a pointer across differently sized windows. */
export function normalise(
  config: Pick<DeckConfig, "width" | "height">,
  p: { x: number; y: number },
) {
  return { x: p.x / config.width, y: p.y / config.height };
}
