import { describe, expect, test } from "bun:test";

import { createClickRegistry, isShown } from "./clicks.ts";
import { formatHash, parseFlags, parseHash } from "./hash.ts";
import { computeLayout } from "./layout.ts";
import {
  type Column,
  DEFAULT_CONFIG,
  type SlideMeta,
  columnsOf,
  flatIndex,
  fromFlat,
  resolveBackground,
  resolveConfig,
} from "./model.ts";
import {
  availableRoutes,
  formatSlideNumber,
  goto,
  initialNav,
  left,
  next,
  prev,
  right,
  setTotal,
} from "./navigation.ts";
import { createSwipeTracker } from "./touch.ts";

const slide = (
  index: number,
  h: number,
  v: number,
  frontmatter: Record<string, unknown> = {},
): SlideMeta => ({
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
  loadNotes: null,
  loadMagic: null,
});

// Three columns: [A], [B, B1, B2], [C]; a hidden slide that must not count.
const slides = [
  slide(0, 0, 0),
  slide(1, 1, 0),
  slide(2, 1, 1),
  slide(3, 1, 2),
  slide(4, 2, 0),
  slide(5, 3, 0, { hide: true }),
];
const columns: Column[] = columnsOf(slides, DEFAULT_CONFIG);

describe("model", () => {
  test("columns drop hidden slides and renumber", () => {
    expect(columns.map((c) => c.slides.length)).toEqual([1, 3, 1]);
    expect(flatIndex(columns, 1, 2)).toBe(3);
    expect(fromFlat(columns, 3)).toEqual({ h: 1, v: 2 });
    expect(fromFlat(columns, 99)).toEqual({ h: 2, v: 0 });
  });

  test("backgrounds resolve from strings and objects", () => {
    expect(resolveBackground({ background: "#123" })!.color).toBe("#123");
    expect(resolveBackground({ background: "linear-gradient(red, blue)" })!.gradient).toContain(
      "gradient",
    );
    expect(resolveBackground({ background: "/img.png" })!.image).toBe("/img.png");
    expect(resolveBackground({ background: "aurora" })!.component).toBe("aurora");
    expect(resolveBackground({ background: "tomato" })!.color).toBe("tomato");
    const obj = resolveBackground({
      background: { image: "/a.jpg", size: "contain", opacity: 0.5 },
    })!;
    expect(obj.image).toBe("/a.jpg");
    expect(obj.size).toBe("contain");
    expect(obj.opacity).toBe(0.5);
    expect(
      resolveBackground({ backgroundVideo: "/v.mp4", backgroundVideoLoop: true })!.videoLoop,
    ).toBe(true);
    expect(resolveBackground({})).toBeNull();
  });

  test("config layers merge with nested live/drawings", () => {
    const c = resolveConfig({ title: "T", live: { room: "r" } }, { drawings: { persist: false } });
    expect(c.title).toBe("T");
    expect(c.live).toEqual({ api: "/api", room: "r", turnstile: null });
    expect(c.drawings.persist).toBe(false);
    expect(c.drawings.enabled).toBe(true);
    const ratio = resolveConfig({ aspectRatio: 4 / 3, canvasWidth: 1600 });
    expect(ratio.height).toBe(1200);
  });
});

describe("navigation", () => {
  test("next walks clicks, then down, then right; prev mirrors it landing on the last click", () => {
    let s = initialNav();
    s = setTotal(s, 0, 0, 2);
    s = next(s, columns, DEFAULT_CONFIG);
    expect(s.click).toBe(1);
    s = next(s, columns, DEFAULT_CONFIG);
    expect(s.click).toBe(2);
    s = next(s, columns, DEFAULT_CONFIG);
    expect([s.h, s.v, s.click]).toEqual([1, 0, 0]);
    s = next(s, columns, DEFAULT_CONFIG);
    expect([s.h, s.v]).toEqual([1, 1]);
    expect(s.direction).toBe("down");
    s = prev(s, columns, DEFAULT_CONFIG);
    expect([s.h, s.v]).toEqual([1, 0]);
    s = prev(s, columns, DEFAULT_CONFIG);
    expect([s.h, s.v, s.click]).toEqual([0, 0, 2]);
  });

  test("right resets to the column top by default and keeps the row in grid mode", () => {
    let s = goto(initialNav(), columns, { h: 1, v: 2 });
    expect(right(s, columns, DEFAULT_CONFIG).v).toBe(0);
    s = goto(initialNav(), columns, { h: 2, v: 0 });
    expect(left(s, columns, { ...DEFAULT_CONFIG, navigationMode: "linear" }).v).toBe(2);
    expect(left(s, columns, DEFAULT_CONFIG).v).toBe(0);
  });

  test("loop wraps and routes report edges", () => {
    const s = goto(initialNav(), columns, { h: 2 });
    expect(right(s, columns, DEFAULT_CONFIG)).toBe(s);
    expect(right(s, columns, { ...DEFAULT_CONFIG, loop: true }).h).toBe(0);
    const routes = availableRoutes(s, columns, DEFAULT_CONFIG);
    expect(routes.right).toBe(false);
    expect(routes.left).toBe(true);
  });

  test("slide numbers format like reveal.js", () => {
    const p = { h: 1, v: 2, click: 0 };
    expect(formatSlideNumber("c", p, columns)).toBe("4");
    expect(formatSlideNumber("c/t", p, columns)).toBe("4 / 5");
    expect(formatSlideNumber("h.v", p, columns)).toBe("2.3");
    expect(formatSlideNumber("h/v", { h: 0, v: 0, click: 0 }, columns)).toBe("1");
  });
});

describe("clicks", () => {
  test("relative, absolute, ranged and hiding elements resolve in document order", () => {
    const reg = createClickRegistry();
    const a = reg.allocate("a", {});
    const b = reg.allocate("b", {});
    const c = reg.allocate("c", { at: 5 });
    const d = reg.allocate("d", { at: [2, 4] });
    const e = reg.allocate("e", { hide: true });
    expect([a.start, b.start, c.start, d.start, d.end]).toEqual([1, 2, 5, 2, 4]);
    expect(e.start).toBe(6);
    expect(reg.total()).toBe(6);
    expect(isShown(a, 0)).toBe(false);
    expect(isShown(a, 1)).toBe(true);
    expect(isShown(d, 4)).toBe(false);
    expect(isShown(e, 0)).toBe(true);
    expect(isShown(e, 6)).toBe(false);
    // Re-allocation with the same id is stable (Strict Mode renders twice).
    expect(reg.allocate("a", {})).toBe(a);
  });
});

describe("hash and flags", () => {
  test("round-trips positions and ids", () => {
    expect(parseHash("#/1/2/3", columns)).toEqual({ h: 1, v: 2, click: 3 });
    expect(parseHash("#/2", columns)).toEqual({ h: 2, v: 0, click: 0 });
    expect(parseHash("#/s4", columns)).toEqual({ h: 2, v: 0, click: 0 });
    expect(parseHash("#/nope", columns)).toBeNull();
    expect(formatHash({ h: 1, v: 2, click: 3 }, { withClick: true })).toBe("#/1/2/3");
    expect(formatHash({ h: 1, v: 0, click: 0 })).toBe("#/1");
    expect(formatHash({ h: 1, v: 0, click: 2 }, { withClick: true })).toBe("#/1/0/2");
    expect(parseFlags("?print-pdf&view=scroll").print).toBe(true);
    expect(parseFlags("?view=scroll").view).toBe("scroll");
  });
});

describe("layout and touch", () => {
  test("scales uniformly with a margin and centres", () => {
    const l = computeLayout(
      { width: 1920, height: 1080, margin: 0, minScale: 0.1, maxScale: 3 },
      { width: 960, height: 1000 },
    );
    expect(l.scale).toBe(0.5);
    expect(l.top).toBe((1000 - 540) / 2);
  });

  test("swipes classify by the dominant axis", () => {
    const t = createSwipeTracker(40, 800);
    t.start(100, 100, 0);
    expect(t.end(20, 110, 100)).toBe("left");
    t.start(100, 100, 0);
    expect(t.end(105, 160, 100)).toBe("down");
    t.start(100, 100, 0);
    expect(t.end(110, 110, 100)).toBeNull();
  });
});

describe("click registry under StrictMode", () => {
  test("a released id that re-allocates keeps its step and the total", async () => {
    const r = createClickRegistry(0);
    const a = r.allocate("a", {});
    const b = r.allocate("b", {});
    expect([a.start, b.start, r.total()]).toEqual([1, 2, 2]);
    r.release("a");
    r.release("b");
    expect(r.total()).toBe(0);
    expect(r.allocate("a", {})).toBe(a);
    expect(r.allocate("b", {})).toBe(b);
    expect(r.total()).toBe(2);
  });
});
