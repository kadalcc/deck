import { describe, expect, test } from "bun:test";

import type { Column, SlideMeta } from "./model.ts";
import { applyOrder, orderOf, shuffledOrder } from "./shuffle.ts";

const slide = (index: number, h: number, v: number) => ({ index, h, v }) as unknown as SlideMeta;
const columns: Column[] = [
  { h: 0, slides: [slide(0, 0, 0)] },
  { h: 1, slides: [slide(1, 1, 0), slide(2, 1, 1)] },
  { h: 2, slides: [slide(3, 2, 0)] },
];

/** A seeded generator, so the test is the same every run. */
function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

describe("shuffle", () => {
  test("a shuffle keeps every slide and every stack together", () => {
    const order = shuffledOrder(columns, seeded(7));
    expect(order.flat().sort()).toEqual([0, 1, 2, 3]);
    const stack = order.find((c) => c.length === 2)!;
    expect(stack.sort()).toEqual([1, 2]);
  });

  test("orders differ between loads", () => {
    const seen = new Set<string>();
    const random = seeded(3);
    for (let i = 0; i < 20; i++) seen.add(JSON.stringify(shuffledOrder(columns, random)));
    expect(seen.size).toBeGreaterThan(1);
  });

  test("an order applies, and renumbers the columns", () => {
    const shuffled = applyOrder(columns, [[3], [2, 1], [0]]);
    expect(shuffled.map((c) => c.h)).toEqual([0, 1, 2]);
    expect(orderOf(shuffled)).toEqual([[3], [2, 1], [0]]);
  });

  test("an order that does not name exactly these slides changes nothing", () => {
    expect(applyOrder(columns, [[3], [2, 1]])).toBe(columns);
    expect(applyOrder(columns, [[3], [2, 1], [0, 0]])).toBe(columns);
    expect(applyOrder(columns, [[3], [2, 1], [9]])).toBe(columns);
    expect(applyOrder(columns, "nope")).toBe(columns);
    expect(applyOrder(columns, [[3], [], [2, 1, 0]])).toBe(columns);
  });
});
