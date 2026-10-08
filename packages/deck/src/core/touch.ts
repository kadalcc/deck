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
