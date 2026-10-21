import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

import type { Browser, Page } from "playwright";

import { CAPTURE_CSS, captureSlide, clearMarks } from "./capture.ts";
import type { BoxItem, RasterItem, SlideSnapshot, TableItem, TextItem } from "./types.ts";
import { walkSlide } from "./walk.ts";

/**
 * The walker in a real Chromium, over a print page written by hand: what it maps natively, what
 * it photographs, and what the residue keeps. Skipped where Playwright's Chromium is missing.
 */

const RED_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEJMDKgCzAwAAAJ+AL+vPKtUQAAAABJRU5ErkJggg==";

const HTML = `<!doctype html><html><head><style>
  body { margin: 0; font-family: Arial, sans-serif; }
  .deck-print-page { position: relative; width: 960px; height: 540px; background: #fff; overflow: hidden; }
  .deck-slide { position: absolute; inset: 0; padding: 40px; box-sizing: border-box; }
  h1 { font-size: 40px; font-weight: 700; margin: 0 0 10px; line-height: 48px; color: rgb(17, 17, 17); }
  ul { margin: 0; padding-left: 24px; font-size: 20px; line-height: 28px; }
  .card { width: 200px; padding: 12px; background: rgb(37, 99, 235); border-radius: 12px; color: #fff; }
  .fancy { width: 120px; height: 40px; background: linear-gradient(90deg, red, blue); }
  .deco { position: relative; height: 20px; }
  .deco::before { content: ""; position: absolute; left: 600px; top: 0; width: 40px; height: 12px; background: rgb(0, 160, 0); }
  table { border-collapse: collapse; font-size: 14px; }
  td { border-bottom: 1px solid rgb(200, 200, 200); padding: 4px 8px; }
  pre { font: 14px/20px monospace; background: rgb(250, 250, 250); margin: 0; padding: 8px; }
  .plain { list-style: none; }
</style></head><body>
<div class="deck-print-page" data-slide="3" data-h="2" data-v="1" data-click="0">
  <section class="deck-slide">
    <h1>Hello <em>world</em> <a href="https://deck.kadal.cc/">link</a></h1>
    <ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>
    <ol class="plain"><li>Plain item</li></ol>
    <div class="card">In a card</div>
    <div class="fancy">Gradient</div>
    <div class="deco"></div>
    <svg width="40" height="20"><rect width="40" height="20" fill="orange"/></svg>
    <img src="${RED_PNG}" width="30" height="30">
    <table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>
    <pre><code><span style="color: rgb(200, 0, 0)">const</span> x = 1;
<span style="color: rgb(0, 0, 200)">let</span> y = 2;</code></pre>
  </section>
</div></body></html>`;

let browser: Browser | null = null;
let page: Page;
let snap: SlideSnapshot;

async function launch(): Promise<Browser | null> {
  try {
    const { chromium } = await import("playwright");
    if (!existsSync(chromium.executablePath())) return null;
    return await chromium.launch();
  } catch {
    return null;
  }
}

beforeAll(async () => {
  browser = await launch();
  if (!browser) return;
  page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 1 });
  await page.setContent(HTML);
  await page.addStyleTag({ content: CAPTURE_CSS });
  snap = await page.evaluate(walkSlide, { page: 0, width: 960, height: 540 });
});
afterAll(async () => {
  await browser?.close();
});

const texts = () =>
  snap.over.map((t) => t.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join(" / "));

describe.if(existsSync(require.resolve("playwright")))("walkSlide", () => {
  test("labels the slide", () => {
    if (!browser) return;
    expect([snap.slide, snap.h, snap.v]).toEqual([3, 2, 1]);
    expect(snap.background).toEqual({ color: [255, 255, 255, 1], raster: false });
  });

  test("a heading is a text box with styled runs and a link", () => {
    if (!browser) return;
    const h = snap.over.find((t) => t.paragraphs[0]?.runs[0]?.text.startsWith("Hello"))!;
    expect(h.wrap).toBe(false);
    const runs = h.paragraphs[0]!.runs;
    expect(runs.map((r) => r.text)).toEqual(["Hello ", "world", " ", "link"]);
    expect(runs[0]).toMatchObject({ size: 40, bold: true, color: [17, 17, 17, 1] });
    expect(runs[1]!.italic).toBe(true);
    expect(runs[3]!.href).toBe("https://deck.kadal.cc/");
    expect(h.paragraphs[0]!.lineHeight).toBe(48);
  });

  test("a list is one text box with bullets and levels", () => {
    if (!browser) return;
    const list = snap.over.find((t) => t.paragraphs.some((p) => p.bullet))!;
    expect(list.paragraphs.map((p) => [p.runs[0]!.text, p.bullet?.level, p.bullet?.kind])).toEqual([
      ["One", 0, "bullet"],
      ["Two", 0, "bullet"],
      ["Nested", 1, "bullet"],
    ]);
    expect(list.paragraphs[0]!.bullet!.indent).toBe(24);
  });

  test("a list with no markers is laid out item by item", () => {
    if (!browser) return;
    expect(texts()).toContain("Plain item");
    const plain = snap.over.find((t) => t.paragraphs[0]!.runs[0]!.text === "Plain item")!;
    expect(plain.paragraphs[0]!.bullet).toBeUndefined();
  });

  test("a solid rounded box is a native shape; a gradient is its own picture", () => {
    if (!browser) return;
    const card = snap.under.find((i): i is BoxItem => i.kind === "box" && i.fill?.[2] === 235)!;
    expect(card).toMatchObject({ shape: "roundRect", radius: 12, fill: [37, 99, 235, 1] });
    expect(texts()).toContain("In a card");
    const own = snap.under.find((i): i is RasterItem => i.kind === "raster" && i.mode === "own")!;
    expect(own.reason).toBe("gradient or pattern");
    expect(texts()).toContain("Gradient");
  });

  test("SVG is photographed; a picture is the file; a table is a table; code is coloured runs", () => {
    if (!browser) return;
    expect(
      snap.under.some((i) => i.kind === "raster" && i.mode === "all" && i.reason === "SVG"),
    ).toBe(true);
    expect(snap.under.some((i) => i.kind === "image" && i.src.startsWith("data:image/png"))).toBe(
      true,
    );
    const table = snap.under.find((i): i is TableItem => i.kind === "table")!;
    expect(table.rows.map((r) => r.map((c) => c.paragraphs[0]?.runs[0]?.text))).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
    expect(table.rows[0]![0]!.border[2]).toMatchObject({ width: 1, color: [200, 200, 200, 1] });
    const code = snap.over.find((t): t is TextItem => !!t.code)!;
    expect(code.paragraphs.map((p) => p.runs.map((r) => r.text).join(""))).toEqual([
      "const x = 1;",
      "let y = 2;",
    ]);
    expect(code.paragraphs[0]!.runs[0]).toMatchObject({ text: "const", color: [200, 0, 0, 1] });
  });

  test("the residue keeps the pseudo-element decoration, and only it", async () => {
    if (!browser) return;
    const pictures = await captureSlide(page, snap);
    expect(pictures.failed).toBe(0);
    expect(pictures.residue).toHaveLength(1);
    const r = pictures.residue[0]!.rect;
    // The ::before box: 40×12 at x = 40 (padding) + 600; a pixel of margin each side.
    expect(Math.round(r.x)).toBe(639);
    expect(Math.round(r.w)).toBe(42);
    expect(pictures.rasters.size).toBe(2); // the SVG, and the gradient's own paint
    await clearMarks(page);
    expect(
      await page.evaluate(() => document.querySelectorAll("[data-kx-paint], [data-kx-id]").length),
    ).toBe(0);
  });
});
