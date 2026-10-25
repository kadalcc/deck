import { z } from "zod";

import { cmd, useCommand } from "./commands.ts";
import { useDeck } from "./context.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PLACEMENT FRAME  —  where `x`/`y` of a placed thing start, on the slide shown
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `<Sticker x y>`, `<Arrow x1 y1 …>` and anything in `<Drag>` are positioned in their containing
 * block, not on the stage: a slide's `.deck-layout` sits inside the theme's padding (96 px on the
 * minimal theme), a layout may pad further, and a slide's `zoom` scales the units. A host placing
 * something where a person dropped it (the builder's media panel) needs that frame in stage pixels,
 * and only the page can know it — so it asks: `layout.frame` → { slide, x, y, unit, width, height }.
 *
 * Measured, not computed from CSS: a probe is put where a top-level placed element renders (inside
 * the shown slide's `.deck-layout`), positioned at 0,0 and then 100,100 the way `<Drag>` places,
 * and read back against the stage. Whatever the theme, layout or zoom, a stage point P is
 * `(P − x) / unit` in the frame.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface PlacementFrame {
  /** Flat index of the slide measured (the one shown). */
  slide: number;
  /** Where the frame's 0,0 is, in stage pixels. */
  x: number;
  y: number;
  /** Stage pixels per frame pixel (a slide's `zoom`; 1 otherwise). */
  unit: number;
  /** The frame's own size, in frame pixels. */
  width: number;
  height: number;
}

/** The frame of the shown slide on `stage` (a `.deck-stage` that is `stageWidth` stage pixels wide). */
export function measureFrame(stage: HTMLElement, stageWidth: number): PlacementFrame | null {
  const slide = stage.querySelector<HTMLElement>('[data-active="true"][data-index]');
  if (!slide) return null;
  const box = slide.querySelector<HTMLElement>(".deck-layout") ?? slide;
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;left:0;top:0;width:0;height:0;margin:0;visibility:hidden;pointer-events:none";
  box.appendChild(probe);
  try {
    // Against the slide, not the stage: a slide still moving in (a transition's translate) would
    // otherwise put the frame thousands of pixels off. At rest a slide covers the stage from 0,0.
    const k = stage.getBoundingClientRect().width / stageWidth || 1;
    const s = slide.getBoundingClientRect();
    const a = probe.getBoundingClientRect();
    probe.style.left = "100px";
    probe.style.top = "100px";
    const b = probe.getBoundingClientRect();
    const block = (probe.offsetParent as HTMLElement | null) ?? box;
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      slide: Number(slide.dataset.index),
      x: round((a.left - s.left) / k),
      y: round((a.top - s.top) / k),
      unit: round((b.left - a.left) / k / 100) || 1,
      width: block.clientWidth,
      height: block.clientHeight,
    };
  } finally {
    probe.remove();
  }
}

/** Registers `layout.frame`: the frame of the slide shown in the visible stage. */
export function PlacementFrameHost() {
  const deck = useDeck();
  useCommand(
    cmd({
      id: "layout.frame",
      title: "Placement frame",
      description:
        "Where `x`/`y` of a placed element (<Sticker>, <Arrow>, <Drag>) start on the slide shown, in stage pixels: { slide, x, y, unit, width, height }. A stage point P is (P − x) / unit in that frame.",
      group: "query",
      readOnly: true,
      params: z.object({}).strict(),
      run: () => {
        const stage = [...document.querySelectorAll<HTMLElement>(".deck-stage")].find(
          (s) => s.getClientRects().length > 0,
        );
        const frame = stage ? measureFrame(stage, deck.config.width) : null;
        if (!frame) throw new Error("No slide is shown.");
        return frame;
      },
    }),
  );
  return null;
}
