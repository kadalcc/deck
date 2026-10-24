import { describe, expect, test } from "bun:test";

import { compile } from "@mdx-js/mdx";

import { blankHtmlComments } from "../compiler/comments.ts";
import { remarkDrag } from "../compiler/remark-drag.ts";
import {
  type DeckFiles,
  EditError,
  dragSites,
  readDeck,
  rewriteDragPos,
  setDragPosition,
} from "./index.ts";

const files = (text: string): DeckFiles & { text: string } => {
  const all: Record<string, string> = { "deck.mdx": text };
  return {
    entry: "deck.mdx",
    read: (p) => all[p] ?? null,
    get text() {
      return all["deck.mdx"]!;
    },
  };
};
const apply = (f: ReturnType<typeof files>, out: { files: Record<string, string> }) =>
  files(out.files["deck.mdx"] ?? f.text);

describe("drag sites", () => {
  const body = [
    '<Drag pos="10,20,300,_">A</Drag>',
    "",
    "```mdx",
    '<Drag pos="0,0,1,1">in a fence: not a site</Drag>',
    "```",
    "",
    "Inline `<Drag>` code, and <!-- <Drag> --> a comment, and {/* <Drag /> */} a JSX one.",
    "",
    '<img v-drag="[1,2,3,NaN]" src="/a.png" />',
    "",
    "<v-drag-arrow />",
    "",
    '<DragArrow pos={"5,5,50,50"} />',
  ].join("\n");

  test("are counted as the compiler counts them, skipping code and comments", async () => {
    const sites = dragSites(body);
    expect(sites.map((s) => s.tag)).toEqual(["Drag", "img", "v-drag-arrow", "DragArrow"]);
    expect(sites[0]!.pos?.value).toBe("10,20,300,_");
    expect(sites[1]!.directive?.value).toBe("[1,2,3,NaN]");
    expect(sites[3]!.pos?.value).toBe("5,5,50,50");

    // The compiler stamps the same order on the same elements (HTML comments are blanked before
    // MDX sees a slide, as the pipeline does).
    const code = String(
      await compile(blankHtmlComments(body), { jsx: true, remarkPlugins: [remarkDrag] }),
    );
    expect([...code.matchAll(/data-drag-index="(\d)"/g)].map((m) => m[1])).toEqual([
      "0",
      "1",
      "2",
      "3",
    ]);
    expect(code).toContain('<Drag pos="1,2,3,_" data-drag-index="1" data-drag-directive="">');
    expect(code).toContain('<DragArrow data-drag-index="2" />');
  });

  test("a position is written in place, or added to a tag without one", () => {
    expect(rewriteDragPos(body, 0, "11,22,333,_", "10,20,300,_")).toContain(
      '<Drag pos="11,22,333,_">A</Drag>',
    );
    expect(rewriteDragPos(body, 1, "7,8,9,_", "1,2,3,_")).toContain('v-drag="[7,8,9,NaN]"');
    expect(rewriteDragPos(body, 2, "1,2,3,4", "")).toContain('<v-drag-arrow pos="1,2,3,4" />');
    expect(rewriteDragPos(body, 3, "6,6,60,60", "5,5,50,50")).toContain('pos={"6,6,60,60"}');
    // Everything else stays byte for byte.
    const out = rewriteDragPos(body, 0, "11,22,333,_");
    expect(out.replace("11,22,333,_", "10,20,300,_")).toBe(body);
  });

  test("a <Sticker> is a site of its own: numbered, and its first move writes pos", async () => {
    const text = '<Drag>A</Drag>\n\n<Sticker src="/s.png" x={10} y={20} size={300} />\n';
    const sites = dragSites(text);
    expect(sites.map((s) => s.tag)).toEqual(["Drag", "Sticker"]);
    const code = String(await compile(text, { jsx: true, remarkPlugins: [remarkDrag] }));
    expect(code).toContain('data-drag-index="1"');
    expect(code).toContain("<Sticker");
    // No pos yet (x/y only say where it starts): the editor expects none and one is added.
    expect(rewriteDragPos(text, 1, "40,50,300,_", "")).toContain(
      '<Sticker pos="40,50,300,_" src="/s.png" x={10} y={20} size={300} />',
    );
  });

  test("a source that changed since the slide was loaded is refused", () => {
    expect(() => rewriteDragPos(body, 0, "1,1,1,1", "999,0,0,0")).toThrow(/changed/);
    expect(() => rewriteDragPos(body, 9, "1,1,1,1")).toThrow(/no draggable element/);
    expect(() => rewriteDragPos("<Drag pos={p}>x</Drag>", 0, "1,1,1,1")).toThrow(/expression/);
  });
});

describe("setDragPosition", () => {
  const DECK = `---
title: T
---

# One

---
dragPos:
  # where the logo sits
  logo: 1,2,3,4
---

# Two

<Drag pos="logo">L</Drag>

<Drag>new</Drag>

---

# Three
`;

  test("a named position goes into the slide's frontmatter, comments kept", () => {
    const f = files(DECK);
    const out = apply(f, setDragPosition(f, 1, { name: "logo" }, "100,200,300,_"));
    expect(out.text).toContain("  # where the logo sits\n  logo: 100,200,300,_");
    expect(readDeck(out).slides[1]!.frontmatter.dragPos).toEqual({ logo: "100,200,300,_" });
    const added = apply(out, setDragPosition(out, 2, { name: "badge" }, "1,1,10,10"));
    expect(readDeck(added).slides[2]!.frontmatter.dragPos).toEqual({ badge: "1,1,10,10" });
    expect(readDeck(added).slides[2]!.content.trim()).toBe("# Three");
  });

  test("a positioned tag gets its pos; nothing else in the file changes", () => {
    const f = files(DECK);
    const out = apply(f, setDragPosition(f, 1, { index: 1, expected: "" }, "5,6,70,_,15"));
    expect(out.text).toBe(DECK.replace("<Drag>new</Drag>", '<Drag pos="5,6,70,_,15">new</Drag>'));
  });

  test("nonsense is refused before anything is written", () => {
    const f = files(DECK);
    expect(() => setDragPosition(f, 1, { index: 0 }, "a,b")).toThrow(EditError);
    expect(() => setDragPosition(f, 1, { name: "../x" }, "1,2,3,4")).toThrow(EditError);
    expect(() => setDragPosition(f, 1, { index: 0, expected: "nope" }, "1,2,3,4")).toThrow(
      EditError,
    );
  });
});
