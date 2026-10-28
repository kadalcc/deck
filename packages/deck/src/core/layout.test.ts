import { describe, expect, test } from "bun:test";

import { computeLayout, toStage } from "./layout.ts";

const deck = { width: 1920, height: 1080, margin: 0, minScale: 0.2, maxScale: 2 };

describe("layout", () => {
  test("a 16:9 deck fills a 16:9 window", () => {
    const l = computeLayout(deck, { width: 1280, height: 720 });
    expect(l.scale).toBeCloseTo(2 / 3, 3);
    expect([l.left, l.top]).toEqual([0, 0]);
  });

  test("disableLayout: scale 1, the stage is the viewport, nothing centred", () => {
    const l = computeLayout({ ...deck, disableLayout: true }, { width: 1000, height: 640 });
    expect(l).toEqual({ scale: 1, width: 1000, height: 640, left: 0, top: 0 });
    expect(toStage(l, 300, 200)).toEqual({ x: 300, y: 200 });
  });

  test("disableLayout false lays out as before", () => {
    expect(computeLayout({ ...deck, disableLayout: false }, { width: 1280, height: 720 })).toEqual(
      computeLayout(deck, { width: 1280, height: 720 }),
    );
  });
});
