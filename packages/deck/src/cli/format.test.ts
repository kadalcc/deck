import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EXIT, main } from "./index.ts";

const work = mkdtempSync(join(tmpdir(), "kadal-deck-format-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

async function cli(argv: string[]) {
  const out: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...a: unknown[]) => out.push(a.join(" "));
  console.error = (...a: unknown[]) => out.push(a.join(" "));
  try {
    return { code: await main(argv, work), out: out.join("\n") };
  } finally {
    console.log = log;
    console.error = error;
  }
}

describe("kadal-deck format", () => {
  const deck = join(work, "talk");
  mkdirSync(join(deck, "parts"), { recursive: true });
  const messy =
    "\n---\ntitle:   Messy\n---\n# One\n* a\n---   \nsrc: ./parts/more.mdx\n---\n-----\n## Two\n\n```js\nconst  x = 1\n```\n\n<!--\nnotes  as written\n-->\n";
  writeFileSync(join(deck, "deck.mdx"), messy);
  writeFileSync(join(deck, "parts", "more.mdx"), "# Included\n+ item\n");

  test("--check reports, writes nothing and exits 1; the include is formatted too", async () => {
    const r = await cli(["format", "--check", "-C", "talk"]);
    expect(r.code).toBe(EXIT.failed);
    expect(r.out).toContain("would change deck.mdx");
    expect(r.out).toContain("would change parts/more.mdx");
    expect(readFileSync(join(deck, "deck.mdx"), "utf8")).toBe(messy);
  });

  test("formats in place; code and notes stay as written; then --check passes", async () => {
    const r = await cli(["format", "-C", "talk"]);
    expect(r.code).toBe(EXIT.ok);
    expect(readFileSync(join(deck, "deck.mdx"), "utf8")).toBe(
      "---\ntitle: Messy\n---\n\n# One\n\n- a\n\n---\nsrc: ./parts/more.mdx\n---\n\n----\n\n## Two\n\n```js\nconst  x = 1\n```\n\n<!--\nnotes  as written\n-->\n",
    );
    expect(readFileSync(join(deck, "parts", "more.mdx"), "utf8")).toBe("# Included\n\n- item\n");
    const again = await cli(["format", "--check", "-C", "talk", "--json"]);
    expect(again.code).toBe(EXIT.ok);
    expect(JSON.parse(again.out)).toMatchObject({ ok: true, check: true });
  });

  test("named files, and a usage error for a file that is not a deck", async () => {
    writeFileSync(join(deck, "extra.mdx"), "# X\n* y\n");
    expect((await cli(["format", "extra.mdx", "-C", "talk"])).code).toBe(EXIT.ok);
    expect(readFileSync(join(deck, "extra.mdx"), "utf8")).toBe("# X\n\n- y\n");
    expect((await cli(["format", "notes.txt", "-C", "talk"])).code).toBe(EXIT.usage);
  });
});
