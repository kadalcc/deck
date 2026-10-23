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
  config: Pick<DeckConfig, "width" | "height" | "margin" | "minScale" | "maxScale">,
  viewport: { width: number; height: number },
  dpr = 1,
): Layout {
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
 * the bar on one side came out a pixel wider than on the other. Here the side with the wider bars
 * gets a whole number of device pixels of bar each side, and the scale grows the hair (under two
 * device pixels) that makes the stage fill exactly what is left. The other side's few tenths of a
 * pixel of overflow are clipped by the root.
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
  // A stage bigger than its box (minScale) has no bars to even out.
  if (gapX >= 0 && gapY >= 0) {
    const [view, size] = gapX >= gapY ? [box.width, width] : [box.height, height];
    const bar = Math.floor(((view - size * scale) / 2) * d);
    const snapped = (view * d - 2 * bar) / (size * d);
    if (snapped > 0) scale = snapped;
  }
  const w = width * scale;
  const h = height * scale;
  const snap = (n: number) => Math.round(n * d) / d;
  return {
    scale,
    width: w,
    height: h,
    left: snap((box.width - w) / 2),
    top: snap((box.height - h) / 2),
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
