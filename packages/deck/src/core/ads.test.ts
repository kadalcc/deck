import { describe, expect, test } from "bun:test";

import { frameGeometry, framedSlide, parseAdSlots, safeAdUrl } from "./ads.ts";
import type { Column } from "./model.ts";

const ad = { id: "a1", title: "Try it", href: "/a/c/a1" };
const cols = (...lengths: number[]) =>
  lengths.map((n, h) => ({
    h,
    slides: Array.from({ length: n }, (_, v) => ({ h, v })),
  })) as unknown as Column[];

describe("ad slots from the host", () => {
  test("only https or the host's own paths are followed", () => {
    expect(safeAdUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeAdUrl("/a/c/1")).toBe("/a/c/1");
    expect(safeAdUrl("http://example.com")).toBeNull();
    expect(safeAdUrl("javascript:alert(1)")).toBeNull();
    expect(safeAdUrl("//evil.example/x")).toBeNull();
    expect(safeAdUrl("data:image/png;base64,AAAA")).toBeNull();
  });

  test("a well-formed answer comes through, trimmed, with a default label", () => {
    const s = parseAdSlots({
      tall: { ...ad, title: "  Try it  " },
      wide: null,
      qr: { id: "q", url: "/a/q/q" },
    });
    expect(s?.tall).toMatchObject({ id: "a1", title: "Try it", label: "Ad", href: "/a/c/a1" });
    expect(s?.wide).toBeNull();
    expect(s?.qr).toEqual({ id: "q", url: "/a/q/q", caption: undefined });
  });

  test("a creative with an unsafe link, or no title, is dropped; an unsafe image just loses it", () => {
    expect(parseAdSlots({ tall: { ...ad, href: "javascript:x" } })).toBeNull();
    expect(parseAdSlots({ tall: { ...ad, title: "" } })).toBeNull();
    expect(parseAdSlots({ tall: { ...ad, image: "http://x/i.png" } })?.tall?.image).toBeUndefined();
  });

  test("nothing usable means no frame", () => {
    expect(parseAdSlots(null)).toBeNull();
    expect(parseAdSlots({})).toBeNull();
    expect(parseAdSlots("ads")).toBeNull();
  });
});

describe("which slides are framed", () => {
  test("the first and the very last", () => {
    const c = cols(1, 3, 2);
    expect(framedSlide(c, 0, 0)).toBe("first");
    expect(framedSlide(c, 1, 0)).toBeNull();
    expect(framedSlide(c, 2, 0)).toBeNull();
    expect(framedSlide(c, 2, 1)).toBe("last");
    expect(framedSlide(cols(1), 0, 0)).toBe("first");
    expect(framedSlide([], 0, 0)).toBeNull();
  });
});

describe("the frame's geometry", () => {
  const aspect = 16 / 9;
  test("landscape: the slide keeps its shape at 80% and the frame takes the rest", () => {
    const g = frameGeometry({ width: 1920, height: 1080 }, aspect);
    expect(g).toEqual({ mode: "side", right: 384, bottom: 216 });
    expect((1920 - g.right) / (1080 - g.bottom)).toBeCloseTo(aspect, 2);
  });

  test("a 16:10 screen has no bars either", () => {
    const g = frameGeometry({ width: 1440, height: 900 }, aspect);
    expect((1440 - g.right) / (1080 - 1080 + 900 - g.bottom)).toBeCloseTo(aspect, 2);
  });

  test("an ultrawide screen's column is capped", () => {
    const g = frameGeometry({ width: 3440, height: 1440 }, aspect);
    expect(g.right).toBeLessThanOrEqual(Math.max(420, 3440 * 0.3));
  });

  test("a phone stacks the ads under a full-width slide", () => {
    const g = frameGeometry({ width: 390, height: 844 }, aspect);
    expect(g.mode).toBe("stack");
    expect(g.right).toBe(0);
    expect(844 - g.bottom).toBeCloseTo(390 / aspect, 0);
  });
});
