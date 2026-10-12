import { describe, expect, test } from "bun:test";
import type { ComponentType } from "react";

import { LAYOUTS, layoutFor } from "./layouts.tsx";

describe("layoutFor", () => {
  const Custom = (() => null) as unknown as ComponentType<Record<string, unknown>>;
  const Other = (() => null) as unknown as ComponentType<Record<string, unknown>>;

  test("a deck's own `layout:name` component wins for that name", () => {
    const components = { "layout:spotlight": Custom, "layout:other": Other };
    expect(layoutFor("spotlight", components) as unknown).toBe(Custom);
    expect(layoutFor("other", components) as unknown).toBe(Other);
  });

  test("can replace a built-in layout by its name", () => {
    expect(layoutFor("center", { "layout:center": Custom }) as unknown).toBe(Custom);
  });

  test("falls back to the built-in, then to default", () => {
    expect(layoutFor("two-cols", { "layout:spotlight": Custom })).toBe(LAYOUTS["two-cols"]!);
    expect(layoutFor("no-such-layout", {})).toBe(LAYOUTS.default!);
  });
});
