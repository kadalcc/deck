import { describe, expect, test } from "bun:test";

import { createClickRegistry } from "./clicks.ts";
import { type Column, DEFAULT_CONFIG, type SlideMeta, columnsOf } from "./model.ts";
import { type NavState, initialNav, next, nextClick, reportSlide, right } from "./navigation.ts";

const slide = (index: number, h: number): SlideMeta => ({
  index,
  h,
  v: 0,
  id: `s${index}`,
  title: null,
  level: 1,
  frontmatter: {},
  hasNotes: false,
  source: { file: "deck.mdx", line: 1 },
  load: () => Promise.resolve({ default: () => null }),
  loadNotes: null,
  loadMagic: null,
});

// Two slides: the first has a layout whose module is still loading (a `pro/` one on a slow
// network) that takes two click steps of its own once it arrives.
const columns: Column[] = columnsOf([slide(0, 0), slide(1, 1)], DEFAULT_CONFIG);
const tick = () => new Promise<void>((r) => queueMicrotask(r));

/** SlideFrame's report, as it wires the registry to the nav store. */
function wire(
  registry: ReturnType<typeof createClickRegistry>,
  get: () => NavState,
  set: (s: NavState) => void,
) {
  const report = (total: number) =>
    set(reportSlide(get(), 0, 0, { total, held: registry.pending() }, columns, DEFAULT_CONFIG));
  report(registry.total());
  return registry.onChange(report);
}

describe("a slide whose steps arrive late", () => {
  test("Space before the layout has loaded waits for its steps instead of leaving the slide", async () => {
    let s = initialNav();
    const registry = createClickRegistry();
    wire(
      registry,
      () => s,
      (n) => (s = n),
    );
    const letGo = registry.hold("layout:pro/ledger");
    await tick();
    expect(s.held).toEqual({ "0,0": true });

    // Pressed while loading: the slide has 0 known steps, yet the deck stays on it.
    s = next(s, columns, DEFAULT_CONFIG);
    expect([s.h, s.click]).toEqual([0, 0]);
    expect(s.queued).toEqual({ at: "0,0", count: 1 });

    // The layout arrives: it takes its two steps in render, then lets go.
    registry.allocate("ledger", { span: 2 });
    letGo();
    await tick();
    expect(s.totals["0,0"]).toBe(2);
    // The press is taken now, as the first of the layout's steps — not as "next slide".
    expect([s.h, s.click]).toEqual([0, 1]);
    expect(s.queued).toBeNull();
    s = next(s, columns, DEFAULT_CONFIG);
    expect([s.h, s.click]).toEqual([0, 2]);
    s = next(s, columns, DEFAULT_CONFIG);
    expect([s.h, s.click]).toEqual([1, 0]);
  });

  test("presses beyond the steps it turns out to have move on, as they would have", async () => {
    let s = initialNav();
    const registry = createClickRegistry();
    wire(
      registry,
      () => s,
      (n) => (s = n),
    );
    const letGo = registry.hold("layout:pro/split");
    await tick();
    // The deck's → key: a step first (nextClick), else the next column.
    const arrow = (st: NavState) => {
      const stepped = nextClick(st);
      return stepped !== st ? stepped : right(st, columns, DEFAULT_CONFIG);
    };
    s = arrow(s);
    s = arrow(s);
    expect([s.h, s.queued?.count]).toEqual([0, 2]);
    // The layout has one step: the first press takes it, the second goes to the next slide.
    registry.allocate("split", {});
    letGo();
    await tick();
    expect([s.h, s.click]).toEqual([1, 0]);
  });

  test("a layout with no steps of its own (or that failed) lets the press through", async () => {
    let s = initialNav();
    const registry = createClickRegistry();
    wire(
      registry,
      () => s,
      (n) => (s = n),
    );
    const letGo = registry.hold("layout:pro/broken");
    await tick();
    s = next(s, columns, DEFAULT_CONFIG);
    letGo();
    await tick();
    expect([s.h, s.click]).toEqual([1, 0]);
    expect(s.held).toEqual({});
  });

  test("steps already known are taken while the hold is open", async () => {
    let s = initialNav();
    const registry = createClickRegistry();
    wire(
      registry,
      () => s,
      (n) => (s = n),
    );
    registry.allocate("click-1", {});
    registry.hold("layout:pro/x");
    await tick();
    s = next(s, columns, DEFAULT_CONFIG);
    expect([s.click, s.queued ?? null]).toEqual([1, null]);
  });

  test("a hold lets go by itself, so a request that never answers cannot pin the slide", async () => {
    let s = initialNav();
    const registry = createClickRegistry();
    wire(
      registry,
      () => s,
      (n) => (s = n),
    );
    registry.hold("layout:pro/hangs", 20);
    await tick();
    s = next(s, columns, DEFAULT_CONFIG);
    expect(s.h).toBe(0);
    await new Promise((r) => setTimeout(r, 40));
    expect(registry.pending()).toBe(false);
    expect([s.h, s.click]).toEqual([1, 0]);
  });

  test("a press kept on a slide left meanwhile is dropped, not replayed elsewhere", async () => {
    let s = initialNav();
    const registry = createClickRegistry();
    wire(
      registry,
      () => s,
      (n) => (s = n),
    );
    const letGo = registry.hold("layout:pro/x");
    await tick();
    s = next(s, columns, DEFAULT_CONFIG);
    s = { ...s, h: 1, v: 0, click: 0 };
    letGo();
    await tick();
    expect([s.h, s.click, s.queued]).toEqual([1, 0, null]);
  });
});
