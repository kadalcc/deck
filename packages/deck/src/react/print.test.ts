import { describe, expect, test } from "bun:test";

import { printPages } from "./PrintView.tsx";

describe("printPages", () => {
  const slides = [
    { h: 0, v: 0 },
    { h: 1, v: 0 },
    { h: 1, v: 1 },
  ];
  const totals = { "0,0": 0, "1,0": 3, "1,1": 1 };

  test("a page per click step when fragments print separately", () => {
    const pages = printPages(slides, totals, true);
    expect(pages.map((p) => `${p.h}.${p.v}@${p.click}`)).toEqual([
      "0.0@0",
      "1.0@0",
      "1.0@1",
      "1.0@2",
      "1.0@3",
      "1.1@0",
      "1.1@1",
    ]);
    // Σ (clicks + 1) over the slides
    expect(pages).toHaveLength(1 + 4 + 2);
  });

  test("one page per slide, at its last step, otherwise", () => {
    const pages = printPages(slides, totals, false);
    expect(pages.map((p) => `${p.h}.${p.v}@${p.click}`)).toEqual(["0.0@0", "1.0@3", "1.1@1"]);
  });

  test("a slide with clicksStart prints from the step it opens at", () => {
    const pages = printPages([{ h: 0, v: 0, start: 1 }], { "0,0": 3 }, true);
    expect(pages.map((p) => p.click)).toEqual([1, 2, 3]);
    expect(pages.map((p) => p.first)).toEqual([true, false, false]);
  });

  test("a slide that has not reported yet is one page", () => {
    expect(printPages([{ h: 0, v: 0 }], {}, true)).toHaveLength(1);
  });
});
