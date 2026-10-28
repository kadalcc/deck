import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Browser, Page } from "playwright";

/**
 * `center: true` puts `is-centered` on the deck root (react/Deck.tsx): the default layout's
 * content moves to the middle of the slide, as reveal.js centres it; without it, the content
 * starts at the top. The other layouts place their content themselves either way.
 */
const BASE = readFileSync(join(import.meta.dir, "base.css"), "utf8");

const page = (rootClass: string, layout: string) => `<!doctype html><html><head><style>${BASE}
  body { margin: 0; }
  </style></head><body>
  <div class="deck-root ${rootClass}">
    <div style="width: 960px; height: 540px; position: relative">
      <div class="deck-layout deck-layout-${layout}"><h1 id="t" style="margin: 0">Title</h1></div>
    </div>
  </div></body></html>`;

let browser: Browser | null = null;
let tab: Page;

beforeAll(async () => {
  try {
    const { chromium } = await import("playwright");
    if (existsSync(chromium.executablePath())) browser = await chromium.launch();
  } catch {
    browser = null;
  }
  if (browser) tab = await browser.newPage({ viewport: { width: 960, height: 540 } });
});
afterAll(async () => {
  await browser?.close();
});

async function top(rootClass: string, layout: string): Promise<number> {
  await tab.setContent(page(rootClass, layout));
  return tab.evaluate(() => Math.round(document.getElementById("t")!.getBoundingClientRect().top));
}

describe.if(existsSync(require.resolve("playwright")))("center", () => {
  test("centres the default layout only when the deck asks", async () => {
    if (!browser) return;
    expect(await top("", "default")).toBe(0);
    expect(await top("is-centered", "default")).toBeGreaterThan(200);
    // a layout that places its content keeps doing so
    expect(await top("is-centered", "two-cols")).toBe(await top("", "two-cols"));
  });
});
