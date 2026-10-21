import { afterEach, describe, expect, test } from "bun:test";

import { nextFrame, thumbnailParams, thumbnailSize } from "./thumbnail.tsx";

const deck = { width: 980, height: 551.25 };

describe("export.thumbnail", () => {
  test("params: an optional flat slide index and width; nothing else", () => {
    expect(thumbnailParams.parse({})).toEqual({});
    expect(thumbnailParams.parse({ slide: 3, width: 320 })).toEqual({ slide: 3, width: 320 });
    expect(thumbnailParams.safeParse({ slide: -1 }).success).toBe(false);
    expect(thumbnailParams.safeParse({ slide: 1.5 }).success).toBe(false);
    expect(thumbnailParams.safeParse({ width: "640" }).success).toBe(false);
    expect(thumbnailParams.safeParse({ height: 360 }).success).toBe(false);
  });

  test("size: 640 by default, clamped to 160–1920, in the deck's shape", () => {
    expect(thumbnailSize(undefined, deck)).toEqual({ width: 640, height: 360 });
    expect(thumbnailSize(10, deck)).toEqual({ width: 160, height: 90 });
    expect(thumbnailSize(9999, deck)).toEqual({ width: 1920, height: 1080 });
    expect(thumbnailSize(Number.NaN, deck)).toEqual({ width: 640, height: 360 });
    expect(thumbnailSize(400, { width: 1000, height: 1000 })).toEqual({ width: 400, height: 400 });
  });

  describe("nextFrame", () => {
    const real = globalThis.requestAnimationFrame;
    afterEach(() => {
      globalThis.requestAnimationFrame = real;
    });

    test("a hidden tab paints no frame: it goes on after the fallback instead of waiting", async () => {
      globalThis.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame;
      const t0 = performance.now();
      await nextFrame(20);
      expect(performance.now() - t0).toBeLessThan(1000);
    });

    test("a painted frame ends the wait before the fallback", async () => {
      globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        queueMicrotask(() => cb(0));
        return 1;
      }) as typeof requestAnimationFrame;
      const t0 = performance.now();
      await nextFrame(5000);
      expect(performance.now() - t0).toBeLessThan(1000);
    });
  });
});
