/**
 * Does a framework renderer actually work on a slide?
 *
 * Every renderer in the engine's framework list lands with a showcase slide, and this is what turns
 * that slide into a test. It runs against a BUILT deck, not the dev server, because the two things
 * most worth knowing are about bundling and teardown and neither is honest in dev:
 *
 *   1. the framework's runtime is NOT in the first chunk — zero requests for it on slide one
 *   2. it is fetched on arrival at the slide that needs it
 *   3. the island mounts and is genuinely running, not just rendered once
 *   4. stepping a click changes the island's props WITHOUT restarting it — the one measurement that
 *      distinguishes a renderer's `update` from a remount, and so whether a chart on a slide keeps
 *      its animation
 *   5. leaving the slide tears it down, and coming back mounts it again
 *
 * The slide's component has to cooperate on two counts: a monotonically increasing attribute that
 * only a live loop can advance, and a `{ mounted, destroyed }` tally on `window`. See
 * `decks/showcase/src/vue-ticker.ts` for the shape to copy.
 *
 *   bun packages/deck/tools/verify-island.mjs \
 *     --base http://localhost:4178/showcase --slide 3 --framework vue \
 *     --tally __vueIsland --ticks data-vue-ticks --step data-vue-step --chunks 'runtime-core|vue-ticker'
 *
 * `--settle <ms>` waits longer before looking, for a framework that has to download an interpreter.
 * `--eager` is for an island that belongs in the first chunk — the framework-less baseline — and
 * inverts checks 1 and 2 instead of skipping them.
 */

import { chromium } from "playwright";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};

const BASE = arg("base", "http://localhost:4178/showcase").replace(/\/$/, "");
const SLIDE = Number(arg("slide", "3"));
const AWAY = Number(arg("away", String(SLIDE + 4)));
const FRAMEWORK = arg("framework", "vue");
const TALLY = arg("tally", "__vueIsland");
const TICKS = arg("ticks", "data-vue-ticks");
const STEP = arg("step", "data-vue-step");
const CHUNKS = new RegExp(arg("chunks", FRAMEWORK));
// Pyodide is six megabytes and a second or two of startup; everything else is here in a frame.
const SETTLE = Number(arg("settle", "1500"));
// An island that is deliberately in the first chunk — the custom-element baseline is statically
// imported, having no framework to keep out of it. The bundle assertions invert rather than vanish.
const EAGER = argv.includes("--eager");

const results = [];
const say = (ok, line) => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${line}`);
  if (!ok) process.exitCode = 1;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// The live room has no worker behind a static preview; its retries are not what is under test.
// The live room has no worker behind a static preview: its socket retries and the 5xx from
// the dev proxy are the environment, not the island.
const expected = /WebSocket|\/api\/rooms\/|\/beacon|Failed to load resource.*status of 5\d\d/;
const errors = [];
page.on("console", (m) => m.type() === "error" && !expected.test(m.text()) && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const fetched = [];
page.on("request", (r) => fetched.push(r.url()));
const frameworkChunks = () => fetched.filter((u) => CHUNKS.test(u));

// Slide one: nothing about this framework should be on the wire for a deck that has not reached it.
await page.goto(`${BASE}/#/0`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
say(
  EAGER ? frameworkChunks().length === 0 : frameworkChunks().length === 0,
  `${FRAMEWORK} is not in the first load: ${frameworkChunks().length} requests on slide one`,
);

await page.goto(`${BASE}/#/${SLIDE}`, { waitUntil: "networkidle" });
await page.waitForTimeout(SETTLE);
const arrived = frameworkChunks().map((u) => u.split("/").pop());
say(
  EAGER ? arrived.length === 0 : arrived.length > 0,
  EAGER
    ? `in the first chunk by design, nothing fetched on arrival (${arrived.length} requests)`
    : `fetched on arrival: ${arrived.join(", ") || "nothing"}`,
);

// Scoped by the ticks attribute, not just the framework name: one renderer can serve several
// islands. `wasm` draws both the hand-written module and the Leptos one, which is the ABI working
// as intended and makes the framework name alone ambiguous.
const island = page.locator(
  `.deck-slide.is-present .deck-island[data-framework="${FRAMEWORK}"]:has([${TICKS}])`,
);
const count = await island.count();
say(count === 1, `exactly one ${FRAMEWORK}/${TICKS} island on slide ${SLIDE} (found ${count})`);
if (count !== 1) {
  const seen = await page
    .locator(".deck-slide.is-present .deck-island")
    .evaluateAll((els) => els.map((e) => `${e.dataset.framework} · ${e.className}`));
  results.push(`      islands present: ${JSON.stringify(seen)}`);
  console.log(results.join("\n"));
  await browser.close();
  process.exit(1);
}

const body = island.locator(`[${TICKS}]`);
say((await body.count()) === 1, `the component rendered into the island host`);

// It is running, not merely rendered: only a live loop advances this.
const first = Number(await body.getAttribute(TICKS));
await page.waitForTimeout(600);
const second = Number(await body.getAttribute(TICKS));
say(second > first, `the island is alive: ${TICKS} ${first} → ${second}`);

// THE POINT. Step a click; the step must change while the count keeps climbing.
say((await body.getAttribute(STEP)) === "0", "starts at deck click 0");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(500);
const stepped = await body.getAttribute(STEP);
const third = Number(await body.getAttribute(TICKS));
say(stepped === "1", `new props arrived: ${STEP} ${stepped}`);
say(third > second, `UPDATED, NOT REMOUNTED: ${TICKS} kept climbing ${second} → ${third}`);

const afterUpdate = await page.evaluate((key) => window[key], TALLY);
say(
  afterUpdate?.mounted === 1 && afterUpdate?.destroyed === 0,
  `one mount, no teardown across the prop change: ${JSON.stringify(afterUpdate)}`,
);

// Leaving must stop the loop, or nineteen slides later a phone is still counting.
await page.goto(`${BASE}/#/${AWAY}`, { waitUntil: "networkidle" });
await page.waitForTimeout(Math.max(900, SETTLE / 2));
const afterLeave = await page.evaluate((key) => window[key], TALLY);
say(afterLeave?.destroyed === 1, `torn down on leaving: ${JSON.stringify(afterLeave)}`);
say((await page.locator(`[${TICKS}]`).count()) === 0, "no DOM left behind");

await page.goto(`${BASE}/#/${SLIDE}`, { waitUntil: "networkidle" });
await page.waitForTimeout(SETTLE);
const back = await page.evaluate((key) => window[key], TALLY);
say(back?.mounted === 2, `remounts on return: ${JSON.stringify(back)}`);

say(
  errors.length === 0,
  `console clean (${errors.length} errors)${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`,
);

await browser.close();
console.log(results.join("\n"));
