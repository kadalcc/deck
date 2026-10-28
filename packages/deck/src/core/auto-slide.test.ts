import { describe, expect, test } from "bun:test";

import { autoSlideMethod, stepAutoSlide, stepAutoSlideSelector } from "./auto-slide.ts";
import { autoSlideDelay } from "./navigation.ts";

describe("autoSlideMethod", () => {
  test("next by default", () => {
    expect(autoSlideMethod(undefined)).toEqual({ move: "next" });
    expect(autoSlideMethod("")).toEqual({ move: "next" });
  });

  test("the deck's moves by name, reveal's too", () => {
    expect(autoSlideMethod("right")).toEqual({ move: "right" });
    expect(autoSlideMethod("nextSlide")).toEqual({ move: "nextSlide" });
    expect(autoSlideMethod("Reveal.navigateRight")).toEqual({ move: "right" });
    expect(autoSlideMethod("navigateDown")).toEqual({ move: "down" });
  });

  test("anything else is a command id", () => {
    expect(autoSlideMethod("nav.last")).toEqual({ command: "nav.last" });
  });
});

describe("a step's own interval", () => {
  test("data-autoslide reads as milliseconds", () => {
    expect(stepAutoSlide("1500")).toBe(1500);
    expect(stepAutoSlide("0")).toBe(0);
    expect(stepAutoSlide("")).toBeNull();
    expect(stepAutoSlide(null)).toBeNull();
    expect(stepAutoSlide("soon")).toBeNull();
  });

  test("it wins over the slide's and the deck's, and 0 waits", () => {
    expect(autoSlideDelay(stepAutoSlide("1500") ?? 4000, 3000, true)).toBe(1500);
    expect(autoSlideDelay(stepAutoSlide("0") ?? 4000, 3000, true)).toBeNull();
    expect(autoSlideDelay(stepAutoSlide(null) ?? 4000, 3000, true)).toBe(4000);
  });

  test("the selector names the step on show", () => {
    expect(stepAutoSlideSelector(2)).toBe('.is-present [data-click-at="2"][data-autoslide]');
  });
});
