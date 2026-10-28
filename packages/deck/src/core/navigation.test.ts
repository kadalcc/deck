import { describe, expect, test } from "bun:test";

import { type Column, DEFAULT_CONFIG, type SlideMeta, columnsOf } from "./model.ts";
import {
  countedSlides,
  formatSlideNumber,
  progressOf,
  slideNumberShown,
  slideNumberText,
} from "./navigation.ts";

const slide = (index: number, h: number, v: number, frontmatter = {}): SlideMeta => ({
  index,
  h,
  v,
  id: `s${index}`,
  title: null,
  level: 1,
  frontmatter,
  hasNotes: false,
  source: { file: "deck.mdx", line: 1 },
  load: () => Promise.resolve({ default: () => null }),
  loadMagic: null,
  loadNotes: null,
});

const uncounted = { visibility: "uncounted" };
// Four counted slides — [A], [B, B1], [C] — then two appendix slides left out of the count.
const columns: Column[] = columnsOf(
  [
    slide(0, 0, 0),
    slide(1, 1, 0),
    slide(2, 1, 1),
    slide(3, 2, 0),
    slide(4, 3, 0, uncounted),
    slide(5, 4, 0, uncounted),
  ],
  DEFAULT_CONFIG,
);

describe("uncounted slides (visibility: uncounted)", () => {
  test("are left out of the total and the current number", () => {
    expect(countedSlides(columns)).toBe(4);
    expect(formatSlideNumber("c/t", { h: 2, v: 0 }, columns)).toBe("4 / 4");
    // An uncounted slide shows the number of the counted one before it, as reveal.js does.
    expect(formatSlideNumber("c/t", { h: 3, v: 0 }, columns)).toBe("4 / 4");
    expect(formatSlideNumber("c", { h: 4, v: 0 }, columns)).toBe("4");
    expect(formatSlideNumber("c", { h: 1, v: 1 }, columns)).toBe("3");
  });

  test("h.v drops the 1 on an uncounted slide (reveal.js's horizontalOffset)", () => {
    expect(formatSlideNumber("h.v", { h: 2, v: 0 }, columns)).toBe("3");
    expect(formatSlideNumber("h.v", { h: 3, v: 0 }, columns)).toBe("3");
    expect(formatSlideNumber("h/v", { h: 1, v: 1 }, columns)).toBe("2 / 2");
  });

  test("the progress bar is full on the last counted slide and stays full after it", () => {
    expect(progressOf({ h: 0, v: 0 }, columns)).toBe(0);
    expect(progressOf({ h: 1, v: 1 }, columns)).toBeCloseTo(2 / 3);
    expect(progressOf({ h: 2, v: 0 }, columns)).toBe(1);
    expect(progressOf({ h: 4, v: 0 }, columns)).toBe(1);
  });

  test("a deck without any counts every slide, as before", () => {
    const plain = columnsOf([slide(0, 0, 0), slide(1, 1, 0), slide(2, 2, 0)], DEFAULT_CONFIG);
    expect(formatSlideNumber("c/t", { h: 2, v: 0 }, plain)).toBe("3 / 3");
    expect(progressOf({ h: 1, v: 0 }, plain)).toBe(0.5);
  });
});

describe("slideNumberText", () => {
  test("false draws nothing; true is h.v; a format is used as given", () => {
    expect(slideNumberText(false, { h: 1, v: 1 }, columns)).toBeNull();
    expect(slideNumberText(true, { h: 1, v: 1 }, columns)).toBe("2.2");
    expect(slideNumberText("c/t", { h: 1, v: 1 }, columns)).toBe("3 / 4");
  });

  test("a deck.config.ts function gets the slide and may return one string or three", () => {
    const seen: unknown[] = [];
    const one = (s: { index: number; total: number }) => {
      seen.push(s);
      return `${s.index + 1} of ${s.total}`;
    };
    expect(slideNumberText(one, { h: 1, v: 1, click: 2 }, columns)).toBe("3 of 6");
    expect(seen[0]).toEqual({ h: 1, v: 1, click: 2, index: 2, total: 6, id: "s2" });
    const three = (s: { h: number; v: number }) => [String(s.h + 1), "-", String(s.v + 1)];
    expect(slideNumberText(three, { h: 1, v: 1 }, columns)).toBe("2-2");
  });

  test("a function that throws or returns nothing falls back to h.v", () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const broken = () => {
        throw new Error("typo");
      };
      expect(slideNumberText(broken, { h: 1, v: 1 }, columns)).toBe("2.2");
      expect(slideNumberText(() => "", { h: 0, v: 0 }, columns)).toBe("1");
    } finally {
      console.warn = warn;
    }
  });
});

describe("slideNumberShown (showSlideNumber)", () => {
  const where = (showSlideNumber: "all" | "print" | "speaker", slideNumber: boolean | "c" = true) =>
    (["play", "print", "speaker"] as const).filter((view) =>
      slideNumberShown({ slideNumber, showSlideNumber }, view),
    );
  test("all is everywhere; print and speaker only there; off without slideNumber", () => {
    expect(where("all")).toEqual(["play", "print", "speaker"]);
    expect(where("print", "c")).toEqual(["print"]);
    expect(where("speaker")).toEqual(["speaker"]);
    expect(where("all", false)).toEqual([]);
  });
});
