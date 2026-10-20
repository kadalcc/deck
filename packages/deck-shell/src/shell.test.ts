import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("the page loads the shell entry with a relative URL", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  expect(html).toContain('src="./src/main.tsx"');
});
