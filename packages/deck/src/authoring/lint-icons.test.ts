import { describe, expect, test } from "bun:test";

import type { IconifySet } from "../icons/data.ts";
import { type DeckFiles, lintDeck } from "./index.ts";

const deck = (body: string): DeckFiles => {
  const text = `---\ntitle: T\n---\n\n${body}\n`;
  return { entry: "deck.mdx", read: (p) => (p === "deck.mdx" ? text : null) };
};
const MDI: IconifySet = {
  prefix: "mdi",
  width: 24,
  height: 24,
  icons: { account: { body: "<path/>" } },
};
const codes = async (body: string, icons?: (p: string) => IconifySet | null) =>
  (await lintDeck({ files: deck(body), compile: true, icons })).diagnostics
    .filter((d) => d.code.startsWith("icon"))
    .map((d) => `${d.code}: ${d.hint ?? d.message}`);

describe("lint: icons", () => {
  test("an installed set's icons pass; a misspelt one is named, with the nearest", async () => {
    const load = (p: string) => (p === "mdi" ? MDI : null);
    expect(await codes(`<mdi-account /> <Icon name="mdi:account" />`, load)).toEqual([]);
    expect(await codes(`<mdi-acount />`, load)).toEqual([
      "icon-unknown: Did you mean mdi:account?",
    ]);
  });

  test("a set that is not installed says what to install, once", async () => {
    const out = await codes(`<carbon-x /> <carbon-y /> <Chip icon="carbon:z">c</Chip>`, () => null);
    expect(out).toEqual([
      "icon-set-missing: Install the set to bundle it: bun add -d @iconify-json/carbon",
    ]);
  });

  test("a set Iconify does not have is a likely typo", async () => {
    expect(await codes(`<Icon name="mdx:account" />`)).toEqual([
      "icon-set-unknown: Did you mean mdi:account?",
    ]);
  });

  test("custom elements, Lucide names and UnoCSS classes are understood", async () => {
    expect(
      await codes(`<my-widget /> <Icon name="rocket" /> <Icon name="lucide:rocket" />`),
    ).toEqual([]);
    expect(await codes(`<div class="i-mdi-acount" />`, (p) => (p === "mdi" ? MDI : null))).toEqual([
      "icon-unknown: Did you mean mdi:account?",
    ]);
  });
});
