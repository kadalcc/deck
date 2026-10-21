import { describe, expect, test } from "bun:test";

import { type DeckFiles, NotesConflict, readDeck, readNotes, writeNotes } from "./index.ts";

const files = (text: string, extra: Record<string, string> = {}): DeckFiles & { text: string } => {
  const all: Record<string, string> = { "deck.mdx": text, ...extra };
  return {
    entry: "deck.mdx",
    read: (p) => all[p] ?? null,
    get text() {
      return all["deck.mdx"]!;
    },
  };
};

const DECK = `---
title: T
---

# One

<Notes>
Say hello. [click] Then this.
</Notes>

---

# Two

Body <Notes>inline note</Notes> more.

---

# Three

no notes here
`;

describe("readNotes / writeNotes", () => {
  test("reads the notes as written, with a version", () => {
    const n = readNotes(files(DECK), 0);
    expect(n.text).toBe("Say hello. [click] Then this.");
    expect(n.form).toBe("notes");
    expect(readNotes(files(DECK), 2)).toMatchObject({ text: "", form: "none" });
  });

  test("rewrites a <Notes> block in place and nothing else", () => {
    const f = files(DECK);
    const out = writeNotes(f, 0, "New words.\n\n[click] **Bold** next.");
    const text = out.files["deck.mdx"]!;
    expect(text).toContain("<Notes>\nNew words.\n\n[click] **Bold** next.\n</Notes>");
    // Everything after the first slide is byte for byte the same.
    expect(text.slice(text.indexOf("\n---\n\n# Two"))).toBe(
      DECK.slice(DECK.indexOf("\n---\n\n# Two")),
    );
  });

  test("an inline block stays inline, in the middle of the body", () => {
    const out = writeNotes(files(DECK), 1, "changed");
    expect(out.files["deck.mdx"]).toContain("Body <Notes>changed</Notes> more.");
  });

  test("a slide without notes gets a <Notes> block", () => {
    const out = writeNotes(files(DECK), 2, "fresh");
    const after = readDeck(files(out.files["deck.mdx"]!));
    expect(after.slides[2]!.notes).toBe("fresh");
    expect(after.slides[2]!.content).toContain("no notes here");
  });

  test("empty notes remove the block", () => {
    const out = writeNotes(files(DECK), 0, "");
    expect(out.files["deck.mdx"]).not.toContain("Say hello");
    expect(readDeck(files(out.files["deck.mdx"]!)).slides[0]!.notes).toBeNull();
  });

  test("a stale version is refused with what is there now", () => {
    const f = files(DECK);
    const { version } = readNotes(f, 0);
    expect(writeNotes(f, 0, "ok", { expected: version }).files["deck.mdx"]).toContain("ok");
    let caught: unknown = null;
    try {
      writeNotes(f, 0, "mine", { expected: "stale" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(NotesConflict);
    expect((caught as NotesConflict).current.text).toBe("Say hello. [click] Then this.");
  });

  test("structure-changing notes are refused", () => {
    expect(() => writeNotes(files(DECK), 0, "a\n---\nb")).toThrow();
    expect(() => writeNotes(files(DECK), 0, "</Notes> oops")).toThrow();
  });

  test("several blocks fold into the first", () => {
    const deck = "# A\n\n<Notes>one</Notes>\n\ntext\n\n<Notes>two</Notes>\n";
    expect(readNotes(files(deck), 0).text).toBe("one\n\ntwo");
    const out = writeNotes(files(deck), 0, "both");
    expect(out.files["deck.mdx"]).toBe("# A\n\n<Notes>both</Notes>\n\ntext\n");
  });

  test("notes in an included file are written there", () => {
    const deck = "# A\n\n---\nsrc: ./part.mdx\n---\n";
    const f = files(deck, { "part.mdx": "# B\n\n<Notes>in part</Notes>\n" });
    const out = writeNotes(f, 1, "edited");
    expect(Object.keys(out.files)).toEqual(["part.mdx"]);
    expect(out.files["part.mdx"]).toBe("# B\n\n<Notes>edited</Notes>\n");
  });

  test("a trailing comment is the slide's notes (Slidev's form) and is edited in place", () => {
    const deck = "# A\n\ntext\n\n<!-- just a comment -->\n";
    const read = readNotes(files(deck), 0);
    expect(read.form).toBe("comment");
    expect(read.text).toBe("just a comment");
    const out = writeNotes(files(deck), 0, "real notes");
    expect(out.files["deck.mdx"]).toBe("# A\n\ntext\n\n<!-- real notes -->\n");
    // A comment that is not the last thing on the slide is the author's, not notes.
    const mid = "# A\n\n<!-- aside -->\n\ntext\n";
    expect(readNotes(files(mid), 0).form).toBe("none");
  });

  test("comment and <Notes> notes read as one and fold into the first when written", () => {
    const deck = "# A\n\n<Notes>one</Notes>\n\n<!-- two -->\n";
    expect(readNotes(files(deck), 0).text).toBe("one\n\ntwo");
    const out = writeNotes(files(deck), 0, "both");
    expect(out.files["deck.mdx"]).toBe("# A\n\n<Notes>both</Notes>\n");
    const gone = writeNotes(files("# A\n\ntext\n\n<!-- n -->\n"), 0, "");
    expect(gone.files["deck.mdx"]).not.toContain("<!--");
  });

  test("CRLF files keep their line endings", () => {
    const deck = "# A\r\n\r\n<Notes>\r\nold\r\n</Notes>\r\n\r\n---\r\n\r\n# B\r\n";
    const out = writeNotes(files(deck), 0, "new");
    expect(out.files["deck.mdx"]).toBe(
      "# A\r\n\r\n<Notes>\r\nnew\r\n</Notes>\r\n\r\n---\r\n\r\n# B\r\n",
    );
  });
});

describe("lint knows the timer keys", () => {
  test("a readable duration passes, an unreadable one warns", async () => {
    const { lintDeck } = await import("./index.ts");
    const lint = async (head: string) =>
      (await lintDeck({ files: files(`---\n${head}\n---\n\n# A\n\n<Notes>a [click:3] b</Notes>\n`) }))
        .diagnostics;
    expect(await lint("timer: countdown\nduration: 30min\ncontextMenu: dev")).toEqual([]);
    const bad = await lint("duration: soon");
    expect(bad.map((d) => d.code)).toContain("duration-unreadable");
    expect((await lint("timer: sometimes")).map((d) => d.code)).toContain("frontmatter-type");
  });
});
