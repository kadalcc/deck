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
): Layout {
  const availableW = viewport.width * (1 - config.margin);
  const availableH = viewport.height * (1 - config.margin);
  let scale = Math.min(availableW / config.width, availableH / config.height);
  scale = Math.max(config.minScale, Math.min(config.maxScale, scale));
  const width = config.width * scale;
  const height = config.height * scale;
  return {
    scale,
    width,
    height,
    left: (viewport.width - width) / 2,
    top: (viewport.height - height) / 2,
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
