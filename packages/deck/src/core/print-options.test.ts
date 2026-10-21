import { describe, expect, test } from "bun:test";

import {
  SlideRangeError,
  parseRange,
  readPrintOptions,
  readScheme,
  writePrintOptions,
} from "./print-options.ts";

describe("parseRange", () => {
  test("numbers and ranges, sorted, each once", () => {
    expect(parseRange("1,3-5", 10)).toEqual([1, 3, 4, 5]);
    expect(parseRange(" 5-3 , 4, 1 ", 10)).toEqual([1, 3, 4, 5]);
  });
  test("every slide when empty or all", () => {
    expect(parseRange("", 3)).toEqual([1, 2, 3]);
    expect(parseRange(null, 2)).toEqual([1, 2]);
    expect(parseRange("all", 2)).toEqual([1, 2]);
  });
  test("an open end runs to the last slide; past the end is dropped", () => {
    expect(parseRange("8-", 10)).toEqual([8, 9, 10]);
    expect(parseRange("9-40,50", 10)).toEqual([9, 10]);
  });
  test("typos are errors, not an empty export", () => {
    expect(() => parseRange("1,x", 5)).toThrow(SlideRangeError);
    expect(() => parseRange("0-2", 5)).toThrow(SlideRangeError);
  });
});

describe("print options in the address", () => {
  test("round trip", () => {
    const url = writePrintOptions(new URL("http://x/deck/"), {
      range: "2-4",
      clicks: false,
      notes: "separate-page",
      omitBackground: true,
    });
    expect(readPrintOptions(url.search)).toEqual({
      range: "2-4",
      clicks: false,
      notes: "separate-page",
      omitBackground: true,
    });
    expect(url.searchParams.has("print-pdf")).toBe(true);
  });
  test("absent means the deck decides", () => {
    expect(readPrintOptions("?print-pdf")).toEqual({
      range: null,
      clicks: null,
      notes: null,
      omitBackground: false,
    });
    expect(readPrintOptions("?print-pdf&clicks&notes=1").clicks).toBe(true);
  });
  test("the colour scheme", () => {
    expect(readScheme("?scheme=dark")).toBe("dark");
    expect(readScheme("?dark")).toBe("dark");
    expect(readScheme("?dark=false")).toBe(null);
    expect(readScheme("?scheme=sepia")).toBe(null);
  });
});
