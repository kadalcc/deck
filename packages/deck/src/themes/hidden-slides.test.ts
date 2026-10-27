import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Browser, Page } from "playwright";

/**
 * The stage keeps the slides around the current one mounted and hidden. `visibility` is
 * inherited, so a child styled `visibility: visible` used to show through its hidden slide, over
 * the current one (a Pro item's dialogue, three slides away). Here a red block that insists on
 * showing sits in each kind of slide that must draw nothing, and the region it would cover is
 * compared, pixel for pixel, with the same page without it.
 */
const BASE = readFileSync(join(import.meta.dir, "base.css"), "utf8");

const LEAK =
  '<div class="leak" style="visibility: visible; position: absolute; left: 40px; top: 40px; width: 200px; height: 120px; background: rgb(255, 0, 0)">leak</div>';

function page(
  slideClass: string,
  stageAttrs = 'data-transition="slide" data-transition-out="slide"',
) {
  return `<!doctype html><html><head><style>${BASE}
  body { margin: 0; background: #fff; }
  </style></head><body>
  <div class="deck-stage" style="width: 960px; height: 540px" data-speed="slow" ${stageAttrs}>
    <section class="deck-slide is-present" style="animation: none"><h1 style="margin-top: 400px">Current</h1></section>
    <section class="deck-slide ${slideClass}" inert>${LEAK}</section>
  </div></body></html>`;
}

let browser: Browser | null = null;
let tab: Page;

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
  tab = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
});
afterAll(async () => {
  await browser?.close();
});

/** Whether the red block draws anything: its region, with it and without it. */
async function paints(html: string): Promise<{ painted: boolean; visible: boolean }> {
  await tab.setContent(html);
  const clip = { x: 40, y: 40, width: 200, height: 120 };
  const visible = await tab.evaluate(() =>
    document
      .querySelector(".leak")!
      .checkVisibility({ opacityProperty: true, visibilityProperty: true }),
  );
  const withLeak = await tab.screenshot({ clip, animations: "disabled" });
  await tab.evaluate(() => document.querySelector(".leak")!.remove());
  const without = await tab.screenshot({ clip, animations: "disabled" });
  return { painted: !withLeak.equals(without), visible };
}

describe.if(existsSync(require.resolve("playwright")))("a slide off screen draws nothing", () => {
  for (const role of ["is-past", "is-future", "is-above", "is-below"])
    test(`a neighbour (${role}): a child with visibility: visible stays unseen`, async () => {
      if (!browser) return;
      expect(await paints(page(role))).toEqual({ painted: false, visible: false });
    });

  test("a slide with no role at all is hidden too", async () => {
    if (!browser) return;
    expect(await paints(page(""))).toEqual({ painted: false, visible: false });
  });

  for (const [name, attrs] of [
    ["a cut", 'data-transition="none" data-transition-out="none"'],
    [
      "a view transition",
      'data-transition="view-transition" data-transition-out="view-transition"',
    ],
  ] as const)
    test(`the slide just left, when its way out is ${name}`, async () => {
      if (!browser) return;
      expect(await paints(page("is-leaving", attrs))).toEqual({ painted: false, visible: false });
    });

  test("the slide just left, under reduced motion", async () => {
    if (!browser) return;
    await tab.emulateMedia({ reducedMotion: "reduce" });
    try {
      expect(await paints(page("is-leaving"))).toEqual({ painted: false, visible: false });
    } finally {
      await tab.emulateMedia({ reducedMotion: null });
    }
  });

  // The other side: where slides are meant to be seen, the block shows, so the check above can fail.
  for (const role of ["is-tile", "is-scroll", "is-print", "is-mirror"])
    test(`a ${role.slice(3)} slide still shows`, async () => {
      if (!browser) return;
      expect(await paints(page(role))).toEqual({ painted: true, visible: true });
    });
});
