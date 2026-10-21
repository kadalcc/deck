import { describe, expect, test } from "bun:test";

import { EditError, SourceConflict, readSlideSource, writeSlideSource } from "./edit.ts";
import type { DeckFiles } from "./source.ts";

const deck = (files: Record<string, string>): DeckFiles => ({
  entry: "deck.mdx",
  read: (p) => files[p] ?? null,
});

const TEXT = `---
title: Deck
---

# One

---
layout: center
---

# Two

<Notes>
Say two.
</Notes>

----

## Two, beneath

---
src: ./more.mdx
---
`;

describe("readSlideSource / writeSlideSource", () => {
  const files = { "deck.mdx": TEXT, "more.mdx": "# Three\r\n\r\n---\r\n\r\n# Four\r\n" };

  test("hands out each slide as written, separator and all", () => {
    expect(readSlideSource(deck(files), 0)).toMatchObject({
      text: "---\ntitle: Deck\n---\n\n# One",
      line: 1,
      head: true,
    });
    const two = readSlideSource(deck(files), 1);
    expect(two.text).toBe("---\nlayout: center\n---\n\n# Two\n\n<Notes>\nSay two.\n</Notes>");
    expect(two.line).toBe(7);
    expect(readSlideSource(deck(files), 2).text).toBe("----\n\n## Two, beneath");
    // An included slide is read from its own file.
    expect(readSlideSource(deck(files), 4)).toMatchObject({
      file: "more.mdx",
      text: "---\r\n\r\n# Four".replace(/\r/g, ""),
    });
  });

  test("writes one slide and keeps every other byte, CRLF files included", () => {
    const two = readSlideSource(deck(files), 1);
    const out = writeSlideSource(
      deck(files),
      1,
      "---\nlayout: two-cols\n---\n\n# Two, edited\n\n<Notes>\nSay two.\n</Notes>\n\n\n",
      { expected: two.version },
    );
    expect(out.files["deck.mdx"]).toBe(
      TEXT.replace("layout: center", "layout: two-cols").replace("# Two\n", "# Two, edited\n"),
    );
    const four = readSlideSource(deck(files), 4);
    const inc = writeSlideSource(deck(files), 4, "---\n\n# Four!", { expected: four.version });
    expect(inc.files).toEqual({ "more.mdx": "# Three\r\n\r\n---\r\n\r\n# Four!\r\n" });
  });

  test("refuses a stale version, a lost separator, a new slide, an empty slide", () => {
    expect(() => writeSlideSource(deck(files), 1, "---\n\n# X", { expected: "stale" })).toThrow(
      SourceConflict,
    );
    try {
      writeSlideSource(deck(files), 1, "---\n\n# X", { expected: "stale" });
    } catch (e) {
      expect((e as SourceConflict).current.text).toContain("# Two");
    }
    expect(() => writeSlideSource(deck(files), 1, "# No separator")).toThrow(/separator/);
    expect(() => writeSlideSource(deck(files), 1, "---\n\n# A\n\n---\n\n# B")).toThrow(EditError);
    expect(() => writeSlideSource(deck(files), 1, "\n\n")).toThrow(/empty/);
    // Unchanged text writes nothing.
    expect(writeSlideSource(deck(files), 2, "----\n\n## Two, beneath\n").files).toEqual({});
  });
});
