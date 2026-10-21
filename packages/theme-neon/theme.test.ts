import { expect, test } from "bun:test";

import { lintTheme } from "../../tools/theme-lint.ts";

// The contract (packages/deck/THEMES.md), checked on this package: metadata, every token in
// both schemes, every layout class, nothing global, the module's names declared.
test("neon keeps the theme contract", () => {
  expect(lintTheme(import.meta.dir)).toEqual([]);
});
