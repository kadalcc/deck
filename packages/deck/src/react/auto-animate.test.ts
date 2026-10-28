import { describe, expect, test } from "bun:test";

import { DEFAULT_CONFIG } from "../core/model.ts";
import {
  autoAnimateTiming,
  canAutoAnimate,
  keyframeProperty,
  morphFrames,
  type PlacedSlide,
} from "./AutoAnimate.ts";

const slide = (
  h: number,
  v: number,
  options: Partial<NonNullable<PlacedSlide["options"]>> = {},
): PlacedSlide => ({
  h,
  v,
  options: { autoAnimate: true, autoAnimateId: null, autoAnimateRestart: false, ...options },
});

describe("which slides auto-animate into each other", () => {
  test("two neighbours that both ask for it, with the same id", () => {
    expect(canAutoAnimate(slide(0, 0), slide(1, 0), true)).toBe(true);
    expect(canAutoAnimate(slide(2, 0), slide(2, 1), true)).toBe(true);
    expect(canAutoAnimate(slide(0, 0, { autoAnimateId: "a" }), slide(1, 0), true)).toBe(false);
    expect(canAutoAnimate(slide(0, 0), slide(1, 0, { autoAnimate: false }), true)).toBe(false);
    expect(canAutoAnimate(slide(0, 0), slide(2, 0), true)).toBe(false);
    expect(canAutoAnimate(slide(0, 0), slide(1, 0), false)).toBe(false);
  });

  // reveal.js: data-auto-animate-restart on the physically later slide breaks the chain, whichever
  // way the deck is going. It used to be parsed and never read.
  test("autoAnimateRestart on the later slide breaks the chain both ways", () => {
    const before = slide(3, 0);
    const restart = slide(4, 0, { autoAnimateRestart: true });
    expect(canAutoAnimate(before, restart, true)).toBe(false);
    expect(canAutoAnimate(restart, before, true)).toBe(false);
    // …and only there: the restart slide still animates into the one after it.
    expect(canAutoAnimate(restart, slide(5, 0), true)).toBe(true);
    expect(canAutoAnimate(slide(5, 0), restart, true)).toBe(true);
  });
});

describe("per-slide timing", () => {
  test("the arriving slide's easing, duration and unmatched win over the deck's", () => {
    const none = { autoAnimateEasing: null, autoAnimateDuration: null, autoAnimateUnmatched: null };
    expect(autoAnimateTiming(none, DEFAULT_CONFIG)).toEqual({
      duration: 1,
      easing: "ease",
      unmatched: true,
    });
    expect(
      autoAnimateTiming(
        { autoAnimateEasing: "linear", autoAnimateDuration: 0.4, autoAnimateUnmatched: false },
        DEFAULT_CONFIG,
      ),
    ).toEqual({ duration: 0.4, easing: "linear", unmatched: false });
    expect(autoAnimateTiming(null, { ...DEFAULT_CONFIG, autoAnimateDuration: 2 }).duration).toBe(2);
  });
});

describe("the animated properties", () => {
  const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
  });

  test("CSS names become the Web Animations API's", () => {
    expect(keyframeProperty("background-color")).toBe("backgroundColor");
    expect(keyframeProperty("outline-offset")).toBe("outlineOffset");
    expect(keyframeProperty("opacity")).toBe("opacity");
    expect(keyframeProperty("--deck-accent")).toBe("--deck-accent");
  });

  test("every listed property that changed is animated; the unchanged ones are left out", () => {
    const [first, last] = morphFrames(
      {
        rect: rect(0, 0, 100, 50),
        styles: { "letter-spacing": "0px", color: "red", outline: "none", opacity: "1" },
      },
      {
        rect: rect(0, 0, 100, 50),
        styles: { "letter-spacing": "4px", color: "blue", outline: "2px solid", opacity: "1" },
      },
      1,
    );
    expect(first).toMatchObject({ letterSpacing: "0px", color: "red", outline: "none" });
    expect(last).toMatchObject({ letterSpacing: "4px", color: "blue", outline: "2px solid" });
    expect("opacity" in first).toBe(false);
  });

  test("a box that changes size by itself is moved, not also scaled", () => {
    // h1 → h2: the font size animates, so a scale on top would count the change twice.
    const [first] = morphFrames(
      { rect: rect(10, 20, 800, 120), styles: { "font-size": "96px" } },
      { rect: rect(10, 40, 800, 80), styles: { "font-size": "64px" } },
      2,
    );
    expect(first.transform).toBe("translate(0px, -10px) scale(1, 1)");
    // Same styles, different box (an image resized): the FLIP scale does it.
    const [img] = morphFrames(
      { rect: rect(0, 0, 200, 100), styles: { opacity: "1" } },
      { rect: rect(0, 0, 400, 200), styles: { opacity: "1" } },
      1,
    );
    expect(img.transform).toBe("translate(0px, 0px) scale(0.5, 0.5)");
  });
});
