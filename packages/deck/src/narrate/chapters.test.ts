import { describe, expect, test } from "bun:test";

import { chapterOfSlide, chaptersOf, clock, slideAtTime, slideRange } from "./chapters.ts";
import type { Timeline } from "./text.ts";

/** A timeline where slide i starts at i × 10 s and lasts 10 s. */
const timeline = (n: number): Timeline => ({
  slides: Array.from({ length: n }, (_, index) => ({
    index,
    title: `S${index}`,
    segments: [],
    ms: [10_000],
    start: index * 10_000,
    duration: 10_000,
  })),
  total: n * 10_000,
});

describe("narration chapters", () => {
  test("section slides start chapters; what comes before the first is the opening", () => {
    const slides = [
      { h: 0, title: "Title" },
      { h: 1, title: "Agenda" },
      { h: 2, title: "Part one", section: true },
      { h: 3, title: "A" },
      { h: 3, title: "A, deeper" },
      { h: 4, title: "Part two", section: true },
      { h: 5, title: "B" },
    ];
    const cs = chaptersOf(slides, timeline(slides.length));
    expect(cs.map((c) => [c.first, c.last, c.title])).toEqual([
      [0, 1, "Title"],
      [2, 4, "Part one"],
      [5, 6, "Part two"],
    ]);
    expect(cs[1]).toMatchObject({ start: 20_000, end: 50_000 });
  });

  test("without sections, every column is a chapter (vertical slides belong to theirs)", () => {
    const slides = [
      { h: 0, title: "One" },
      { h: 1, title: "Two" },
      { h: 1, title: "Two, below" },
      { h: 2, title: "Three" },
    ];
    expect(chaptersOf(slides, timeline(4)).map((c) => [c.first, c.last])).toEqual([
      [0, 0],
      [1, 2],
      [3, 3],
    ]);
  });

  test("a deck that opens on a section has no empty opening", () => {
    const cs = chaptersOf(
      [
        { h: 0, title: "Part one", section: true },
        { h: 1, title: "A" },
      ],
      timeline(2),
    );
    expect(cs.map((c) => c.first)).toEqual([0]);
    expect(chaptersOf([], timeline(0))).toEqual([]);
  });

  test("time to slide, slide to chapter", () => {
    const t = timeline(6);
    expect(slideAtTime(t, 0)).toBe(0);
    expect(slideAtTime(t, 9_999)).toBe(0);
    expect(slideAtTime(t, 10_000)).toBe(1);
    expect(slideAtTime(t, 1e9)).toBe(5);
    const cs = chaptersOf(
      [
        { h: 0, title: "a" },
        { h: 1, title: "b", section: true },
        { h: 2, title: "c" },
        { h: 3, title: "d", section: true },
        { h: 4 },
        { h: 5 },
      ],
      t,
    );
    expect([0, 1, 2, 3, 5].map((i) => chapterOfSlide(cs, i))).toEqual([0, 1, 1, 2, 2]);
  });

  test("words for a person", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(192_400)).toBe("3:12");
    expect(clock(3_727_000)).toBe("1:02:07");
    expect(slideRange({ first: 8, last: 14 })).toBe("slides 9–15");
    expect(slideRange({ first: 3, last: 3 })).toBe("slide 4");
  });
});
