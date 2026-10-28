import { describe, expect, test } from "bun:test";

import { scrollGeometry } from "./ScrollView.tsx";

describe("scrollLayout", () => {
  test("compact (the default): as wide as the viewport, as tall as the aspect makes it", () => {
    expect(scrollGeometry("compact", 390, 844, 1920, 1080)).toEqual({
      scale: 390 / 1920,
      boxH: 219.375,
      pageH: 219.375,
      offsetX: 0,
      offsetY: 0,
    });
    // A slide taller than the window keeps its page; its box is the window.
    const wideShort = scrollGeometry("compact", 1600, 700, 1920, 1080);
    expect(wideShort.boxH).toBe(700);
    expect(wideShort.pageH).toBe(900);
  });

  test("full: every slide takes the viewport, letterboxed and centred", () => {
    const phone = scrollGeometry("full", 390, 844, 1920, 1080);
    expect(phone.boxH).toBe(844);
    expect(phone.pageH).toBe(844);
    expect(phone.offsetX).toBe(0);
    expect(phone.offsetY).toBeCloseTo((844 - 219.375) / 2);
    const wide = scrollGeometry("full", 1600, 700, 1920, 1080);
    expect(wide.scale).toBeCloseTo(700 / 1080);
    expect(wide.offsetY).toBeCloseTo(0);
    expect(wide.offsetX).toBeCloseTo((1600 - (1920 * 700) / 1080) / 2);
  });
});
