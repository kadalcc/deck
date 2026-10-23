import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { deck } from "./index.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

test("a relative import in a slide resolves from the file the slide was written in", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kadal-relimport-"));
  dirs.push(dir);
  mkdirSync(join(dir, "slides"));
  writeFileSync(join(dir, "deck.mdx"), "# One\n\n---\nsrc: ./slides/part.mdx\n---\n");
  writeFileSync(join(dir, "slides", "part.mdx"), "# Two\n");
  const plugin = deck() as unknown as {
    configResolved(c: unknown): void;
    resolveId(this: unknown, id: string, importer?: string): unknown;
  };
  plugin.configResolved({ root: dir, base: "/", build: { outDir: "dist" }, command: "build" });
  // Vite's resolver, reduced to what the plugin hands it: the id and the file it is relative to.
  const ctx = { resolve: async (id: string, from: string) => ({ id: resolve(dirname(from), id) }) };
  const at = (id: string, importer?: string) => plugin.resolveId.call(ctx, id, importer);
  expect(await at("./x.ts", "\0virtual:deck/slide/0")).toEqual({ id: join(dir, "x.ts") });
  expect(await at("../x.ts", "\0virtual:deck/slide/1")).toEqual({ id: join(dir, "x.ts") });
  expect(await at("./n.ts", "\0virtual:deck/notes/1")).toEqual({ id: join(dir, "slides", "n.ts") });
  // Anything else is left to Vite.
  expect(await at("./x.ts", join(dir, "src", "main.tsx"))).toBeNull();
  expect(await at("react", "\0virtual:deck/slide/0")).toBeNull();
});
