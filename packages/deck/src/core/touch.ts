/**
 * Swipe detection for touch navigation: a horizontal swipe turns pages, a vertical one moves in
 * the stack, and a pinch is left to the browser. Attach to the stage; call `onStart/onMove/onEnd`
 * from pointer events with `pointerType === "touch"`.
 */
export type Swipe = "left" | "right" | "up" | "down";

export interface SwipeTracker {
  start(x: number, y: number, t: number): void;
  end(x: number, y: number, t: number): Swipe | null;
}

export function createSwipeTracker(threshold = 40, maxDuration = 800): SwipeTracker {
  let sx = 0;
  let sy = 0;
  let st = 0;
  let active = false;
  return {
    start(x, y, t) {
      sx = x;
      sy = y;
      st = t;
      active = true;
    },
    end(x, y, t) {
      if (!active) return null;
      active = false;
      if (t - st > maxDuration) return null;
      const dx = x - sx;
      const dy = y - sy;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
      if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
      return dy < 0 ? "up" : "down";
    },
  };
}

/**
 * What a finished swipe does: a swipe to the left turns forward, as a page does, and to the right
 * back — mirrored under `rtl`, where the deck reads the other way (reveal.js's touch controller).
 * A vertical swipe moves in the stack, whatever the direction of the text.
 */
export function swipeAction(dir: Swipe, rtl = false): "next" | "prev" | "up" | "down" {
  if (dir === "up") return "down";
  if (dir === "down") return "up";
  const forward = rtl ? "right" : "left";
  return dir === forward ? "next" : "prev";
}

/**
 * Where a touch keeps its own gestures instead of turning the page: an element marked
 * `data-prevent-swipe` (reveal.js), or one inside it, and the controls of a playing video or audio,
 * whose timeline is scrubbed with a horizontal drag.
 */
export const PREVENT_SWIPE = "[data-prevent-swipe], video[controls], audio[controls]";

/** Whether a touch that starts on `target` is the page's to turn. */
export function swipeAllowed(target: unknown): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null;
  return !el?.closest?.(PREVENT_SWIPE);
}
