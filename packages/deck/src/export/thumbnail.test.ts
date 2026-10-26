import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_CONFIG, resolveSlideOptions } from "../core/model.ts";
import {
  nextFrame,
  thumbnailParams,
  thumbnailScheme,
  thumbnailSize,
  withScheme,
} from "./thumbnail.tsx";

const deck = { width: 980, height: 551.25 };

describe("export.thumbnail", () => {
  test("params: an optional flat slide index and width; nothing else", () => {
    expect(thumbnailParams.parse({})).toEqual({});
    expect(thumbnailParams.parse({ slide: 3, width: 320 })).toEqual({ slide: 3, width: 320 });
    expect(thumbnailParams.safeParse({ slide: -1 }).success).toBe(false);
    expect(thumbnailParams.safeParse({ slide: 1.5 }).success).toBe(false);
    expect(thumbnailParams.safeParse({ width: "640" }).success).toBe(false);
    expect(thumbnailParams.safeParse({ height: 360 }).success).toBe(false);
    expect(thumbnailParams.parse({ scheme: "dark" })).toEqual({ scheme: "dark" });
    expect(thumbnailParams.safeParse({ scheme: "auto" }).success).toBe(false);
  });

  test("scheme: a fixed deck is pictured in its own; an auto deck in the asked one, else the screen's", () => {
    expect(thumbnailScheme("dark", "light", "light")).toBe("dark");
    expect(thumbnailScheme("light", "dark", "dark")).toBe("light");
    expect(thumbnailScheme("auto", "dark", "light")).toBe("dark");
    expect(thumbnailScheme("auto", undefined, "light")).toBe("light");
  });

  test("withScheme forces the scheme on the slide and its background, as `colorScheme:` would", () => {
    const plain = resolveSlideOptions({}, DEFAULT_CONFIG, true);
    const dark = withScheme(plain, "dark");
    expect(dark.colorScheme).toBe("dark");
    expect(dark.background?.scheme).toBe("dark");
    // The slide's own background is kept, wearing the scheme.
    const glows = resolveSlideOptions({ background: { component: "glows" } }, DEFAULT_CONFIG, true);
    expect(withScheme(glows, "dark").background).toMatchObject({
      component: "glows",
      scheme: "dark",
    });
    // A slide that forces its own scheme keeps it.
    const light = resolveSlideOptions({ colorScheme: "light" }, DEFAULT_CONFIG, true);
    expect(withScheme(light, "dark")).toBe(light);
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
