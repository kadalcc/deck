#!/usr/bin/env node
/**
 * Narration, end to end, in a headless Chromium against the built showcase:
 *
 *   node tools/narration-check.mjs                build examples/showcase, then check it
 *   node tools/narration-check.mjs --skip-build   check the dist/ that is already there
 *
 * The bar renders in the presenter view; playing (with the silent engine, which paces exactly as
 * speech would but needs no voices — headless Chromium has none) advances clicks and then slides;
 * pause stops it; the speed, volume and mute controls reach the narrator's state; the timeline
 * seeks; on the deck itself the bar is a lazy chunk that only `?narrate` or R loads; no console
 * errors. Needs the engine built (`bun run build`) and Playwright's Chromium.
 */
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deckDir = join(root, "examples/showcase");
const dist = join(deckDir, "dist");
const argv = process.argv.slice(2);

function run(cmd, args, cwd) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let log = "";
    p.stdout.on("data", (d) => (log += d));
    p.stderr.on("data", (d) => (log += d));
    p.on("close", (code) => (code === 0 ? res(log) : rej(new Error(`${cmd} exited ${code}\n${log.slice(-2000)}`))));
  });
}
if (!argv.includes("--skip-build")) {
  console.log("build  examples/showcase");
  await run("bun", ["run", "build"], deckDir);
}
if (!existsSync(join(dist, "index.html"))) {
  console.error(`no build at ${dist}`);
  process.exit(1);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".png": "image/png", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!path.startsWith("/showcase/")) return res.writeHead(404).end();
  const rel = path.slice("/showcase".length);
  const file = join(dist, rel);
  try {
    if (statSync(file).isFile()) {
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      return res.end(await readFile(file));
    }
  } catch {}
  if (extname(rel)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": "text/html" }).end(await readFile(join(dist, "index.html")));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/showcase/`;

const results = [];
async function step(name, fn) {
  const r = { name, ok: true, detail: [] };
  const t = Date.now();
  try {
    await fn((cond, msg) => {
      if (!cond) {
        r.ok = false;
        r.detail.push(msg);
      }
      return !!cond;
    });
  } catch (e) {
    r.ok = false;
    r.detail.push(`threw: ${String(e?.message ?? e).split("\n")[0].slice(0, 240)}`);
  }
  results.push(r);
  console.log(`${r.ok ? "ok  " : "FAIL"} ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)${r.detail.length ? `\n       ${r.detail.join("\n       ")}` : ""}`);
}

const browser = await chromium.launch();
/** Prefs the narrator reads at mount: the silent engine and a brisk rate, so the check is quick. */
const PREFS = JSON.stringify({ engine: "silent", rate: 3, volume: 1, muted: false, follow: true });
async function open(url, { prefs = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  if (prefs) await context.addInitScript((p) => localStorage.setItem("deck.narration", p), PREFS);
  const page = await context.newPage();
  const problems = [];
  const requested = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.split("\n")[0]}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/^Failed to load resource|WebGL|GPU stall|GroupMarkerNotSet/.test(m.text())) return;
    problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("request", (r) => requested.push(r.url()));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__deck, null, { timeout: 30_000 });
  return { page, context, problems, requested };
}
const state = (page) => page.evaluate(() => window.__deck.commands.run("narrate.state").then((r) => r.value));
const nav = (page) => page.evaluate(() => { const n = window.__deck.nav.get(); return { h: n.h, v: n.v, click: n.click, flat: window.__deck.commands.run("deck.state") }; }).then(async (n) => n);
const where = (page) => page.evaluate(async () => (await window.__deck.commands.run("deck.state")).value.slide);
const until = async (page, fn, arg, ms = 15_000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 });

// The slide with five click steps and a note for each (02-clicks.mdx).
const target = await (async () => {
  const { page, context } = await open(base, { prefs: false });
  const i = await page.evaluate(() => window.__deck.columns.flatMap((c) => c.slides).findIndex((s) => (s.notesText ?? "").split("[click]").length >= 5));
  await context.close();
  return i;
})();

await step("presenter: the bar renders, with its commands", async (expect) => {
  const { page, context, problems } = await open(`${base}presenter#/0`);
  await page.waitForSelector(".deck-narration", { timeout: 15_000 });
  for (const label of ["Narrate (R)", "Previous step", "Next step", "Stop narration", "Speed", "Volume", "Voice", "Engine", "Mute"])
    expect(await page.getByLabel(label, { exact: true }).count(), `no control labelled ${label}`);
  const ids = await page.evaluate(() => window.__deck.commands.list().map((c) => c.id).filter((id) => id.startsWith("narrate.")));
  for (const id of ["narrate.play", "narrate.pause", "narrate.toggle", "narrate.stop", "narrate.next", "narrate.prev", "narrate.rate", "narrate.volume", "narrate.voice", "narrate.state"])
    expect(ids.includes(id), `missing command ${id}`);
  const markers = await page.locator(".deck-narration-marker").count();
  const total = await page.evaluate(() => window.__deck.columns.flatMap((c) => c.slides).length);
  expect(markers === total, `${markers} markers for ${total} slides`);
  expect(!problems.length, problems.join("; "));
  await context.close();
});

await step("presenter: play advances clicks, then the slide; pause stops", async (expect) => {
  const { page, context, problems } = await open(`${base}presenter#/0`);
  await page.waitForSelector(".deck-narration");
  expect(target > 0, "no slide with [click] notes in the showcase");
  await page.evaluate((from) => window.__deck.commands.run("narrate.play", { from }), target);
  await until(page, (i) => window.__deck.commands.run("deck.state").then((r) => r.value.slide.index === i && r.value.slide.click >= 1), target);
  const s1 = await state(page);
  expect(s1.playing && s1.using === "silent", `state while playing: ${JSON.stringify({ playing: s1.playing, using: s1.using })}`);
  await until(page, (i) => window.__deck.commands.run("deck.state").then((r) => r.value.slide.index > i), target, 30_000);
  await page.getByLabel("Pause narration (R)").click();
  const paused = await where(page);
  const s2 = await state(page);
  expect(!s2.playing && s2.phase === "paused", `after pause: ${s2.phase}`);
  await page.waitForTimeout(2500);
  const later = await where(page);
  expect(later.index === paused.index && later.click === paused.click, `moved while paused: ${JSON.stringify(paused)} → ${JSON.stringify(later)}`);
  expect(!problems.length, problems.join("; "));
  await context.close();
});

await step("presenter: speed, volume, mute and the timeline", async (expect) => {
  const { page, context, problems } = await open(`${base}presenter#/0`);
  await page.waitForSelector(".deck-narration");
  await page.getByLabel("Speed", { exact: true }).selectOption("1.5");
  expect((await state(page)).rate === 1.5, "speed select did not set the rate");
  await page.getByLabel("Volume", { exact: true }).fill("0.3");
  expect(Math.abs((await state(page)).volume - 0.3) < 0.01, "volume slider did not set the volume");
  await page.getByLabel("Mute", { exact: true }).click();
  expect((await state(page)).muted === true, "mute did not mute");
  // R (narrate.toggle) starts and pauses, from the keyboard.
  await page.locator("body").click({ position: { x: 5, y: 60 } });
  await page.keyboard.press("r");
  await until(page, () => window.__deck.commands.run("narrate.state").then((r) => r.value.playing));
  await page.keyboard.press("r");
  expect(!(await state(page)).playing, "R did not pause");
  // A click on the track narrates from the slide under it.
  const box = await page.locator(".deck-narration-track").boundingBox();
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
  await until(page, () => window.__deck.commands.run("deck.state").then((r) => r.value.slide.index > 3));
  expect((await state(page)).playing, "seeking did not play");
  await page.evaluate(() => window.__deck.commands.run("narrate.stop"));
  expect(!problems.length, problems.join("; "));
  await context.close();
});

await step("deck: no narration chunk until asked; ?narrate shows the bar; R plays", async (expect) => {
  const plain = await open(`${base}#/0`);
  await plain.page.waitForTimeout(1000);
  expect(!(await plain.page.locator(".deck-narration").count()), "bar shown without ?narrate");
  expect(!plain.requested.some((u) => /\/Narration-[\w-]+\.js$/.test(u)), "Narration chunk loaded on a plain page");
  await plain.page.keyboard.press("r");
  await plain.page.waitForSelector(".deck-narration-dock .deck-narration", { timeout: 15_000 });
  await until(plain.page, () => window.__deck.commands.run("narrate.state").then((r) => r.value?.playing === true));
  await until(plain.page, () => window.__deck.nav.get().h > 0 || window.__deck.nav.get().click > 0, null, 30_000);
  expect(!plain.problems.length, plain.problems.join("; "));
  await plain.context.close();

  const flagged = await open(`${base}?narrate#/0`);
  await flagged.page.waitForSelector(".deck-narration-dock .deck-narration", { timeout: 15_000 });
  await flagged.page.getByLabel("Close narration").click();
  expect(!(await flagged.page.locator(".deck-narration").count()), "close did not close");
  expect(!flagged.problems.length, flagged.problems.join("; "));
  await flagged.context.close();
});

await step("projector: never shows the bar", async (expect) => {
  const { page, context } = await open(`${base}?projector&narrate#/0`);
  await page.waitForTimeout(1500);
  expect(!(await page.locator(".deck-narration").count()), "bar on the projector");
  await context.close();
});

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
