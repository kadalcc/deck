import { describe, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";

import { finishPdf, mergePdfs, outlineTree, readOutline } from "./outline.ts";

const slide = (index: number, h: number, v: number, title: string | null, level = 1) => ({
  index,
  h,
  v,
  title,
  level,
});

describe("outlineTree", () => {
  test("one entry per titled slide, at its first page", () => {
    const pages = [{ slide: 0 }, { slide: 1 }, { slide: 1 }, { slide: 2 }];
    const tree = outlineTree(pages, [
      slide(0, 0, 0, "Cover"),
      slide(1, 1, 0, "Clicks"),
      slide(2, 2, 0, null),
    ]);
    expect(tree.map((n) => [n.title, n.page])).toEqual([
      ["Cover", 0],
      ["Clicks", 1],
    ]);
  });

  test("a vertical stack nests under its column; levels nest under the slide before", () => {
    const slides = [
      slide(0, 0, 0, "Intro"),
      slide(1, 1, 0, "Part one"),
      slide(2, 1, 1, "Detail A", 2),
      slide(3, 1, 2, "Detail B", 2),
      slide(4, 2, 0, "Section", 1),
      slide(5, 3, 0, "Sub", 2),
      slide(6, 4, 0, "Subsub", 3),
      slide(7, 5, 0, "Back up", 1),
    ];
    const pages = slides.map((s) => ({ slide: s.index }));
    const tree = outlineTree(pages, slides);
    const shape = (nodes: typeof tree): unknown =>
      nodes.map((n) => (n.children.length ? { [n.title]: shape(n.children) } : n.title));
    expect(shape(tree)).toEqual([
      "Intro",
      { "Part one": ["Detail A", "Detail B"] },
      { Section: [{ Sub: ["Subsub"] }] },
      "Back up",
    ]);
  });

  test("the cover takes no chapters; hideInToc slides are left out", () => {
    const slides = [
      slide(0, 0, 0, "Cover", 1),
      slide(1, 1, 0, "Agenda", 2),
      { ...slide(2, 2, 0, "Hidden", 2), hideInToc: true },
      slide(3, 3, 0, "Part", 1),
      slide(4, 4, 0, "Detail", 2),
    ];
    const tree = outlineTree(
      slides.map((s) => ({ slide: s.index })),
      slides,
    );
    expect(tree.map((n) => [n.title, n.children.map((c) => c.title)])).toEqual([
      ["Cover", []],
      ["Agenda", []],
      ["Part", ["Detail"]],
    ]);
  });

  test("slides outside the range and notes pages are skipped", () => {
    const tree = outlineTree(
      [{ slide: 2 }, { slide: 2, notes: true }],
      [slide(0, 0, 0, "Gone"), slide(2, 2, 0, "Kept")],
    );
    expect(tree).toEqual([{ title: "Kept", page: 0, children: [] }]);
  });
});

async function blankPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([960, 540]);
  return doc.save();
}

describe("finishPdf", () => {
  test("writes an outline a reader can follow, and the metadata", async () => {
    const out = await finishPdf(await blankPdf(4), {
      outline: [
        { title: "Cover", page: 0, children: [] },
        {
          title: "Chapter — ünïcode",
          page: 1,
          children: [{ title: "Detail", page: 3, children: [] }],
        },
      ],
      meta: { title: "The talk", author: "Ada", subject: "About things", keywords: ["a", "b"] },
    });
    expect(await readOutline(out)).toEqual([
      { title: "Cover", page: 0, depth: 0 },
      { title: "Chapter — ünïcode", page: 1, depth: 0 },
      { title: "Detail", page: 3, depth: 1 },
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getTitle()).toBe("The talk");
    expect(doc.getAuthor()).toBe("Ada");
    expect(doc.getSubject()).toBe("About things");
    expect(doc.getPageCount()).toBe(4);
  });

  test("no outline leaves none", async () => {
    expect(await readOutline(await finishPdf(await blankPdf(2), {}))).toEqual([]);
  });

  test("mergePdfs keeps every page in order", async () => {
    const merged = await mergePdfs([await blankPdf(2), await blankPdf(3)]);
    expect((await PDFDocument.load(merged)).getPageCount()).toBe(5);
  });
});
