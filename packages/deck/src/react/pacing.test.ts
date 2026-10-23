import { describe, expect, test } from "bun:test";

import { key as navKey } from "../core/navigation.ts";
import { expectedElapsed, plannedSlot } from "./pacing.ts";

type Deck = Parameters<typeof plannedSlot>[0];

// Three slides: two in the first column (60 s, then 120 s by its own `timing`), one in the second.
function deck(config: Record<string, unknown>): Deck {
  const columns = [
    { h: 0, slides: [{}, {}] },
    { h: 1, slides: [{}] },
  ];
  const options = new Map([[navKey(0, 1), { timing: 120 }]]);
  return { columns, options, config } as unknown as Deck;
}

describe("the plan's slot for a slide", () => {
  test("by timings: the first slot starts at 0 and the last one ends at the plan's end", () => {
    const d = deck({ defaultTiming: 60 });
    expect(plannedSlot(d, { h: 0, v: 0 })).toEqual({ start: 0, end: 60 });
    expect(plannedSlot(d, { h: 0, v: 1 })).toEqual({ start: 60, end: 180 });
    // 60 + 120 + 60: the end of the last slot is the whole plan.
    expect(plannedSlot(d, { h: 1, v: 0 })).toEqual({ start: 180, end: 240 });
    expect(expectedElapsed(d, { h: 1, v: 0 })).toBe(180);
  });

  test("by totalTime: equal slots, the last one ending at the length", () => {
    const d = deck({ totalTime: 300 });
    expect(plannedSlot(d, { h: 0, v: 0 })).toEqual({ start: 0, end: 100 });
    expect(plannedSlot(d, { h: 1, v: 0 })).toEqual({ start: 200, end: 300 });
  });

  test("no plan, no slot", () => {
    expect(plannedSlot(deck({}), { h: 0, v: 0 })).toBeNull();
  });
});
