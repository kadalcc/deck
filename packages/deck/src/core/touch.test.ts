import { describe, expect, test } from "bun:test";

import { createSwipeTracker, PREVENT_SWIPE, swipeAction, swipeAllowed } from "./touch.ts";

describe("swipes", () => {
  test("a swipe to the left turns forward, to the right back, vertical moves in the stack", () => {
    expect(swipeAction("left")).toBe("next");
    expect(swipeAction("right")).toBe("prev");
    expect(swipeAction("up")).toBe("down");
    expect(swipeAction("down")).toBe("up");
  });

  test("rtl mirrors the horizontal swipes only", () => {
    expect(swipeAction("left", true)).toBe("prev");
    expect(swipeAction("right", true)).toBe("next");
    expect(swipeAction("up", true)).toBe("down");
    expect(swipeAction("down", true)).toBe("up");
  });

  test("data-prevent-swipe and media controls keep the gesture", () => {
    const inside = { closest: (s: string) => (s === PREVENT_SWIPE ? {} : null) };
    const outside = { closest: () => null };
    expect(swipeAllowed(inside)).toBe(false);
    expect(swipeAllowed(outside)).toBe(true);
    expect(swipeAllowed(null)).toBe(true);
    expect(PREVENT_SWIPE).toContain("[data-prevent-swipe]");
    expect(PREVENT_SWIPE).toContain("video[controls]");
  });

  test("the tracker still reads a horizontal swipe", () => {
    const t = createSwipeTracker();
    t.start(300, 100, 0);
    expect(t.end(100, 110, 200)).toBe("left");
  });
});
