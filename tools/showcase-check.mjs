#!/usr/bin/env node
/**
 * The showcase deck, end to end, in a headless Chromium — every slide, every click, every view.
 *
 *   node tools/showcase-check.mjs                   build examples/showcase, then check it
 *   node tools/showcase-check.mjs --skip-build      check the dist/ that is already there
 *   node tools/showcase-check.mjs --no-export       leave out `kadal-deck export` (the slowest part)
 *   node tools/showcase-check.mjs --out <dir>       where screenshots and exports go
 *                                                   (default examples/showcase/check-output, gitignored)
 *   node tools/showcase-check.mjs --port <n>        serve the deck on that port (default: any free one)
 *
 * Needs the engine built (`bun run build`) and Playwright's Chromium (`npx playwright install chromium`).
 * Prints a table and exits non-zero on any failure.
 *
 * The network policy, so CI is not flaky offline: the deck itself must load completely — every
 * same-origin request answered, no console error, no page error. What comes from other sites
 * (the YouTube and X embeds, Google Fonts for the rla and stack themes, Pyodide's CDN) may fail:
 * its frames must exist, its failures are tolerated and counted. The Python island is required
 * only when its CDN answers. Missing posters (`posters/*.jpg`, an optional picture each embed
 * looks for) are an expected 404.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deckDir = join(root, "examples/showcase");
const dist = join(deckDir, "dist");
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const val = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const out = resolve(val("--out", join(deckDir, "check-output")));
const started = Date.now();

// ── results ────────────────────────────────────────────────────────────────
const results = [];
let current = null;
async function step(name, fn) {
  const t = Date.now();
  current = { name, ok: true, detail: [], ms: 0 };
  try {
    await fn(current);
  } catch (e) {
    current.ok = false;
    current.detail.push(`threw: ${String(e?.message ?? e).split("\n")[0].slice(0, 200)}`);
  }
  current.ms = Date.now() - t;
  results.push(current);
  const r = current;
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name} (${(r.ms / 1000).toFixed(1)}s)${r.detail.length ? `\n       ${r.detail.slice(0, 8).join("\n       ")}` : ""}`);
}
function expect(cond, message) {
  if (!cond) {
    current.ok = false;
    current.detail.push(message);
  }
  return !!cond;
}
const note = (message) => current.detail.push(`· ${message}`);

// ── build and serve ────────────────────────────────────────────────────────
function run(cmd, args, cwd) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let log = "";
    p.stdout.on("data", (d) => (log += d));
    p.stderr.on("data", (d) => (log += d));
    p.on("close", (code) => (code === 0 ? res(log) : rej(new Error(`${cmd} ${args.join(" ")} exited ${code}\n${log.slice(-2000)}`))));
  });
}

if (!flag("--skip-build")) {
  console.log("build  examples/showcase");
  await run("bun", ["run", "build"], deckDir);
}
if (!existsSync(join(dist, "index.html"))) {
  console.error(`no build at ${dist} — run without --skip-build`);
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".wasm": "application/wasm",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webm": "video/webm",
  ".ogg": "audio/ogg", ".excalidraw": "application/json", ".py": "text/plain",
};
// The host's shape: the deck at /showcase/, every route of it answered by index.html, no API.
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.startsWith("/api/")) return res.writeHead(404).end();
  if (!path.startsWith("/showcase/")) return res.writeHead(404).end();
  const rel = path.slice("/showcase".length);
  const file = join(dist, rel);
  try {
    if (statSync(file).isFile()) {
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      return res.end(await readFile(file));
    }
  } catch {}
  // A file that is not there is a 404; a route (no extension) is the app.
  if (extname(rel)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": "text/html" }).end(await readFile(join(dist, "index.html")));
});
await new Promise((r) => server.listen(Number(val("--port", 0)), "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/showcase/`;
console.log(`serve  ${base}`);

const browser = await chromium.launch();
const pyodideUp = await fetch("https://cdn.jsdelivr.net/pyodide/", { method: "HEAD" })
  .then((r) => r.status < 500)
  .catch(() => false);

// ── a page, with its errors collected under the policy above ────────────────
const ORIGIN = `http://127.0.0.1:${port}`;
const isOurs = (url) => url.startsWith(ORIGIN);
const isPoster = (url) => /\/posters\/[^/]+\.jpg(\?|$)/.test(url);
/** Messages the deck cannot do anything about, each with the reason it is allowed. */
const BENIGN = [
  // A resource that failed is judged by its URL in the response/requestfailed handlers below;
  // Chromium's generic console line for it carries no URL worth matching on.
  /^Failed to load resource/,
  // Headless Chromium has no GPU: WebGL inside the YouTube embed warns about the fallback.
  /WebGL|GPU stall|GroupMarkerNotSet/,
];
async function openPage(opts = {}) {
  const context = await browser.newContext({
    viewport: opts.viewport ?? { width: 1600, height: 900 },
    colorScheme: opts.scheme ?? "light",
    isMobile: opts.mobile ?? false,
    hasTouch: opts.mobile ?? false,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const problems = [];
  const external = { failed: 0 };
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.split("\n")[0].slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const at = m.location()?.url ?? "";
    if (at && !isOurs(at)) return; // inside another site's frame
    if (BENIGN.some((re) => re.test(m.text()))) return;
    problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("response", (r) => {
    const url = r.url();
    if (r.status() < 400) return;
    if (!isOurs(url)) return void external.failed++;
    if (isPoster(url) || url.includes("/api/")) return;
    problems.push(`HTTP ${r.status()} ${url.slice(ORIGIN.length)}`);
  });
  page.on("requestfailed", (r) => {
    const url = r.url();
    const why = r.failure()?.errorText ?? "";
    if (!isOurs(url)) return void external.failed++;
    // Leaving a slide unloads its media and frames; the browser reports that as aborted.
    if (why.includes("ERR_ABORTED")) return;
    problems.push(`request failed: ${url.slice(ORIGIN.length)} ${why}`);
  });
  const take = () => problems.splice(0);
  return { page, context, take, external };
}
async function ready(page) {
  await page.waitForFunction(() => !!window.__deck && !!document.querySelector(".deck-slide.is-present .deck-layout, .deck-slide.is-present > *"), null, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
}
const nav = (page) => page.evaluate(() => { const n = window.__deck.nav.get(); return { h: n.h, v: n.v, click: n.click, total: n.totals[`${n.h},${n.v}`] ?? 0, overview: n.overview, paused: n.paused, autoSliding: n.autoSliding }; });
const ui = (page) => page.evaluate(() => window.__deck.ui.get());

/** Everything that can be wrong with the slide on screen, as a list. */
async function slideProblems(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".deck-slide.is-present");
    if (!el) return ["no present slide"];
    const found = [];
    const has = (sel, what) => el.querySelectorAll(sel).length && found.push(what);
    has(".deck-slide-error", `slide error: ${el.querySelector(".deck-slide-error")?.textContent?.slice(0, 120)}`);
    has(".deck-icon-missing", `missing icon: ${el.querySelector(".deck-icon-missing")?.getAttribute("title")}`);
    has(".deck-mermaid-error", "mermaid error");
    has(".deck-island-error", `island error: ${el.querySelector(".deck-island-error")?.textContent?.slice(0, 120)}`);
    if (/Magic move block missing/.test(el.textContent ?? "")) found.push("magic move missing");
    if (document.querySelector(".deck-backgrounds .deck-background-missing") || el.querySelector(".deck-background-missing"))
      found.push(`unknown background: ${(document.querySelector(".deck-background-missing") ?? el.querySelector(".deck-background-missing")).textContent}`);
    if (el.getAttribute("data-id") === "hidden-slide") found.push("the hide: true slide is showing");
    for (const img of el.querySelectorAll("img")) {
      if (!img.src || !img.src.startsWith(location.origin) || img.closest(".deck-frame")) continue;
      if (img.loading === "lazy" && !img.complete) continue; // judged once it has had time, below
      if (img.complete && img.naturalWidth === 0) found.push(`broken image ${img.src.slice(location.origin.length)}`);
    }
    return found;
  });
}

// slide meta from the manifest: ids, titles, notes
async function manifestOf(page) {
  return page.evaluate(() => {
    const d = window.__deck;
    return d.columns.map((c) => c.slides.map((s) => ({ id: s.id, title: s.title, hasNotes: s.hasNotes, index: s.index })));
  });
}

const shotName = (h, v) => `${String(h).padStart(2, "0")}-${v}.png`;
let columns = null;
let visited = new Map(); // "h,v" -> total clicks seen

// ── 1 · every slide, every click (light) ───────────────────────────────────
await step("walk: every slide and every click, light", async () => {
  const { page, context, take } = await openPage();
  mkdirSync(join(out, "light"), { recursive: true });
  await page.goto(`${base}#/0`);
  await ready(page);
  columns = await manifestOf(page);
  const expected = columns.reduce((n, c) => n + c.length, 0);
  let last = "";
  let stepsTaken = 0;
  let arrivedAt = "";
  const smallest = [];
  for (let i = 0; i < 1000; i++) {
    const s = await nav(page);
    const key = `${s.h}/${s.v}/${s.click}`;
    if (key === last) break;
    last = key;
    stepsTaken++;
    const slideKey = `${s.h},${s.v}`;
    if (slideKey !== arrivedAt) {
      arrivedAt = slideKey;
      // Arrival: the transition, the module, its islands and media.
      await page.waitForTimeout(700);
      await page.waitForFunction(() => !document.querySelector(".deck-slide.is-present .deck-slide-loading"), null, { timeout: 15_000 }).catch(() => {});
    } else await page.waitForTimeout(120);
    for (const p of await slideProblems(page)) expect(false, `${key}: ${p}`);
    for (const p of take()) expect(false, `${key}: ${p}`);
    visited.set(slideKey, Math.max(visited.get(slideKey) ?? 0, s.total));
    if (s.click >= s.total) {
      // The smallest words on the slide, in stage pixels (1920 wide), after autoFit and zoom.
      const type = await page.evaluate(() => {
        const el = document.querySelector(".deck-slide.is-present");
        const layout = el?.querySelector(".deck-layout");
        const fit = Number(layout?.style.getPropertyValue("--deck-fit") || 1);
        const zoom = Number(getComputedStyle(el).zoom || 1);
        let min = Infinity;
        let what = "";
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          const host = t.parentElement;
          if (!t.textContent.trim() || !host || host.closest("svg, .deck-frame, .deck-sketch, .deck-mermaid, .deck-island, .deck-background-component, .sc-bg-tile, .katex, [aria-hidden=true]")) continue;
          if (!host.offsetParent || getComputedStyle(host).opacity === "0") continue;
          const px = parseFloat(getComputedStyle(host).fontSize) * fit * zoom;
          if (px < min) { min = px; what = t.textContent.trim().slice(0, 30); }
        }
        return { min, what, fit };
      });
      if (type.min < 16) expect(false, `${key}: text at ${type.min.toFixed(1)}px on the 1920 stage (“${type.what}”)`);
      smallest.push({ key, ...type });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(out, "light", shotName(s.h, s.v)) });
    }
    await page.keyboard.press("Space");
    // A view transition applies the move a frame later, so wait for it rather than read at once.
    await page
      .waitForFunction((k) => { const n = window.__deck.nav.get(); return `${n.h}/${n.v}/${n.click}` !== k; }, key, { timeout: 2000 })
      .catch(() => {});
  }
  expect(visited.size === expected, `visited ${visited.size} of ${expected} slides`);
  const fitted = smallest.filter((t) => t.fit < 1);
  if (fitted.length) note(`autoFit shrank ${fitted.length}: ${fitted.map((t) => `${t.key}×${t.fit}`).join(" ")}`);
  const small = smallest.filter((t) => t.min < 24).map((t) => `${t.key} ${t.min.toFixed(0)}px`);
  if (small.length) note(`text under 24 stage px (16 at 1280): ${small.join(", ")}`);
  note(`${visited.size} slides, ${stepsTaken} steps, ${[...visited.values()].reduce((a, b) => a + b, 0)} clicks`);
  await context.close();
});

const flat = () => columns.flatMap((c, h) => c.map((s, v) => ({ ...s, h, v })));
const at = (id) => flat().find((s) => s.id === id);

// ── 2 · islands: every framework draws and keeps counting ──────────────────
await step("islands: eleven runtimes mount, tick and take new props", async () => {
  const { page, context, take } = await openPage();
  const s = at("islands-row");
  await page.goto(`${base}#/${s.h}/${s.v}`);
  await ready(page);
  const want = ["web-components", "vue", "svelte", "solid", "preact", "qwik", "angular", "fresh", "wasm", "python"];
  const need = (await page.locator(".deck-slide.is-present .deck-island").count());
  expect(need === 11, `${need} islands on the slide, expected 11`);
  // Every island but Python is local; Python waits on its CDN.
  await page.waitForFunction(() => [...document.querySelectorAll(".deck-slide.is-present .deck-island")].filter((i) => i.getAttribute("data-framework") !== "python").every((i) => /\d+\.\ds/.test(i.querySelector(".ticker-count")?.textContent ?? "")), null, { timeout: 30_000 });
  if (pyodideUp)
    await page.waitForFunction(() => /\d+\.\ds/.test(document.querySelector('.deck-slide.is-present .deck-island[data-framework="python"] .ticker-count')?.textContent ?? ""), null, { timeout: 90_000 });
  else note("Pyodide's CDN is unreachable: the Python island is not required");
  const frameworks = await page.$$eval(".deck-slide.is-present .deck-island", (els) => els.map((e) => e.getAttribute("data-framework")));
  for (const f of want) expect(frameworks.includes(f), `no ${f} island`);
  await page.keyboard.press("Space");
  await page.waitForTimeout(600);
  const steps = await page.$$eval(".deck-slide.is-present .ticker-step", (els) => els.map((e) => e.textContent));
  const counted = steps.filter((t) => /deck click 1/.test(t ?? "")).length;
  expect(counted >= (pyodideUp ? 11 : 10), `${counted} islands show the new step`);
  for (const p of take()) expect(false, p);
  await context.close();
});

// ── 3 · every slide in the dark ────────────────────────────────────────────
await step("dark: every slide at its last step", async () => {
  const { page, context, take } = await openPage({ scheme: "dark" });
  mkdirSync(join(out, "dark"), { recursive: true });
  await page.goto(`${base}#/0`);
  await ready(page);
  expect((await ui(page)).colorScheme === "dark", "the system's dark scheme was not picked up");
  for (const s of flat()) {
    await page.evaluate(({ h, v }) => window.__deck.actions.goto(h, v, 99), s);
    await page.waitForTimeout(650);
    const n = await nav(page);
    if (n.h !== s.h || n.v !== s.v) continue; // an auto-advancing slide moved on
    for (const p of await slideProblems(page)) expect(false, `${s.id}: ${p}`);
    for (const p of take()) expect(false, `${s.id}: ${p}`);
    // Text must be legible against the stage behind it.
    const contrast = await page.evaluate(() => {
      const el = document.querySelector(".deck-slide.is-present h1, .deck-slide.is-present h2");
      if (!el) return null;
      const rgb = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
      const lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      // the colour behind the heading: the first opaque background up the tree, else the page
      let bg = null;
      for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; const a = rgb(c); if (a.length >= 3 && (a[3] ?? 1) > 0.9) { bg = a; break; } }
      const layer = document.querySelector(".deck-backgrounds .is-entering, .deck-backgrounds .deck-background");
      const layerBg = layer ? rgb(getComputedStyle(layer).backgroundColor) : [];
      if (!bg && layerBg.length >= 3 && (layerBg[3] ?? 1) > 0.9) bg = layerBg;
      if (!bg) bg = rgb(getComputedStyle(document.body).backgroundColor);
      const L1 = lum(rgb(getComputedStyle(el).color)); const L2 = lum(bg);
      return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    });
    // Image and gradient backgrounds have no single colour to measure: those are judged by eye.
    const plain = !/^(bg-image|bg-video|bg-iframe|bg-gradient|layout-image|layout-iframe|media)$/.test(s.id) && !s.id.startsWith("layout-image");
    if (contrast !== null && plain) expect(contrast >= 3, `${s.id}: heading contrast ${contrast.toFixed(2)}`);
    await page.screenshot({ path: join(out, "dark", shotName(s.h, s.v)) });
  }
  await context.close();
});

// ── 4 · three themes × two schemes ─────────────────────────────────────────
await step("themes: minimal, rla, stack × light, dark", async () => {
  const { page, context, take } = await openPage();
  mkdirSync(join(out, "themes"), { recursive: true });
  await page.goto(`${base}#/0`);
  await ready(page);
  const sample = ["format", "themes", "code-steps", "bling", "blocks", "poll"].map(at).filter(Boolean);
  for (const theme of ["minimal", "rla", "stack"]) {
    for (const scheme of ["light", "dark"]) {
      await page.evaluate(({ theme, scheme }) => { window.__deck.actions.setTheme(theme); window.__deck.actions.setColorScheme(scheme); }, { theme, scheme });
      const root = await page.evaluate(() => ({ cls: document.querySelector(".deck-root")?.className ?? "", scheme: document.documentElement.dataset.colorScheme }));
      expect(root.cls.includes(`theme-${theme}`) && root.scheme === scheme, `${theme}/${scheme}: root is "${root.cls}" ${root.scheme}`);
      for (const s of sample) {
        await page.evaluate(({ h, v }) => window.__deck.actions.goto(h, v, 99), s);
        await page.waitForTimeout(550);
        for (const p of await slideProblems(page)) expect(false, `${theme}/${scheme} ${s.id}: ${p}`);
        await page.screenshot({ path: join(out, "themes", `${theme}-${scheme}-${s.id}.png`) });
      }
    }
  }
  for (const p of take()) expect(false, p);
  await context.close();
});

// ── 5 · keys, overlays and tools ───────────────────────────────────────────
await step("keys: overview, search, jump, help, blackout, focus, theme menu, dark", async () => {
  const { page, context, take } = await openPage();
  await page.goto(`${base}#/1`);
  await ready(page);
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  expect((await nav(page)).overview && (await page.locator(".deck-overview").isVisible()), "Esc did not open the overview");
  await page.keyboard.press("o");
  await page.waitForTimeout(300);
  expect(!(await nav(page)).overview, "O did not close the overview");

  await page.keyboard.press("/");
  await page.waitForTimeout(200);
  expect((await ui(page)).search, "/ did not open search");
  await page.keyboard.type("magic move");
  await page.waitForTimeout(300);
  const hits = await page.locator(".deck-search li").count();
  expect(hits > 0, "search found nothing for “magic move”");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const afterSearch = await nav(page);
  const mm = at("magic-move");
  expect(afterSearch.h === mm.h, `search's first hit went to ${afterSearch.h}/${afterSearch.v}, not the magic-move slide`);

  await page.keyboard.press("g");
  await page.waitForTimeout(650);
  expect((await ui(page)).jump, "g did not open jump");
  await page.keyboard.type("5");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const j = await page.evaluate(() => { const d = window.__deck; const n = d.nav.get(); let f = 0; for (let i = 0; i < n.h; i++) f += d.columns[i].slides.length; return f + n.v; });
  expect(j === 4, `jump to 5 landed on flat ${j + 1}`);

  await page.keyboard.press("Shift+Slash");
  await page.waitForTimeout(300);
  expect((await ui(page)).help, "? did not open help");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  expect(!(await ui(page)).help, "Esc did not close help");

  await page.keyboard.press("b");
  await page.waitForTimeout(300);
  expect((await nav(page)).paused && (await page.locator(".deck-root.is-paused").count()) === 1, "B did not black out");
  await page.keyboard.press("b");
  await page.waitForTimeout(200);
  expect(!(await nav(page)).paused, "B did not bring the slide back");

  await page.keyboard.press("f");
  await page.waitForTimeout(300);
  expect((await ui(page)).hints && (await page.locator(".deck-hints .deck-hint").count()) > 0, "F showed no hints");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  expect(!(await ui(page)).hints, "Esc did not close the hints");

  await page.keyboard.press("t");
  await page.waitForTimeout(200);
  expect((await ui(page)).themeMenu, "T did not open the theme menu");
  await page.keyboard.press("Escape");
  const before = (await ui(page)).colorScheme;
  await page.keyboard.press("d");
  await page.waitForTimeout(200);
  expect((await ui(page)).colorScheme !== before, "D did not flip the scheme");
  await page.keyboard.press("d");
  for (const p of take()) expect(false, p);
  await context.close();
});

await step("tools: pen, laser, Alt+click zoom, lightbox, links", async () => {
  const { page, context, take } = await openPage();
  const draw = at("draw");
  await page.goto(`${base}#/${draw.h}/${draw.v}`);
  await ready(page);
  await page.waitForTimeout(700);
  await page.keyboard.press("c");
  await page.waitForTimeout(200);
  expect((await ui(page)).drawing, "C did not start the pen");
  await page.mouse.move(700, 450);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(700 + i * 20, 450 + i * 8);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const strokes = await page.locator("svg.deck-drawing path").count();
  expect(strokes > 0, "drawing left no stroke");
  await page.keyboard.press("Shift+c");
  await page.waitForTimeout(200);
  expect((await page.locator("svg.deck-drawing path").count()) < strokes, "Shift+C did not clear");
  await page.keyboard.press("c");
  await page.keyboard.press("x");
  await page.waitForTimeout(150);
  expect((await ui(page)).pointer, "X did not turn the laser on");
  await page.keyboard.press("x");
  // (mouse.click's `modifiers` does not reach the event; hold the key instead)
  await page.keyboard.down("Alt");
  await page.mouse.click(800, 450);
  await page.keyboard.up("Alt");
  await page.waitForTimeout(300);
  expect(!!(await ui(page)).zoom, "Alt+click did not zoom");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  expect(!(await ui(page)).zoom, "Esc did not zoom back out");

  const media = at("media-images");
  await page.evaluate(({ h, v }) => window.__deck.actions.goto(h, v), media);
  await page.waitForTimeout(900);
  await page.locator(".deck-slide.is-present .sc-thumbs img").first().click();
  await page.waitForTimeout(300);
  expect(!!(await ui(page)).lightbox && (await page.locator(".deck-lightbox").isVisible()), "the image did not open in the lightbox");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  expect(!(await ui(page)).lightbox, "Esc did not close the lightbox");

  // the table of contents and the layout chips are links into the deck
  await page.evaluate(() => window.__deck.actions.goto(1, 0));
  await page.waitForTimeout(800);
  await page.locator(".deck-slide.is-present .sc-toc a", { hasText: "Clicks" }).click();
  await page.waitForTimeout(800);
  expect((await nav(page)).h === at("clicks").h, "the contents link did not go to the Clicks chapter");
  const layouts = at("layouts");
  await page.evaluate(({ h, v }) => window.__deck.actions.goto(h, v), layouts);
  await page.waitForTimeout(800);
  await page.locator(".deck-slide.is-present .sc-layout-groups a", { hasText: /^fact$/ }).click();
  await page.waitForTimeout(800);
  const fact = at("layout-fact");
  const n = await nav(page);
  expect(n.h === fact.h && n.v === fact.v, "the “fact” chip did not reach the fact slide");
  for (const p of take()) expect(false, p);
  await context.close();
});

await step("auto-slide: a slide's autoSlide advances; A pauses and resumes", async () => {
  const { page, context, take } = await openPage();
  const s = at("auto-slide");
  await page.goto(`${base}#/${s.h}/${s.v}`);
  await ready(page);
  expect((await nav(page)).autoSliding, "auto-slide is not on in a deck with an autoSlide slide");
  await page.keyboard.press("a");
  await page.waitForTimeout(200);
  expect(!(await nav(page)).autoSliding && /paused/i.test((await ui(page)).toast ?? ""), "A did not pause, with a toast");
  await page.waitForTimeout(6800);
  expect((await nav(page)).h === s.h, "a paused deck moved on");
  await page.keyboard.press("a");
  await page.waitForFunction((h) => window.__deck.nav.get().h !== h, s.h, { timeout: 9000 }).catch(() => {});
  expect((await nav(page)).h === s.h + 1, "the autoSlide slide did not move on by itself within its six seconds");
  for (const p of take()) expect(false, p);
  await context.close();
});

// ── 6 · addresses ──────────────────────────────────────────────────────────
await step("links: #/h/v/click, #/id, ?at", async () => {
  const { page, context, take } = await openPage();
  const fmt = at("format");
  await page.goto(`${base}#/${fmt.h}/0/2`);
  await ready(page);
  await page.waitForTimeout(800);
  let n = await nav(page);
  expect(n.h === fmt.h && n.v === 0 && n.click === 2, `#/${fmt.h}/0/2 landed on ${n.h}/${n.v}/${n.click}`);
  // A step link typed into the address bar of an open deck, onto a slide not mounted yet.
  const effects = at("click-effects");
  await page.evaluate((h) => (location.hash = h), `#/${effects.h}/${effects.v}/3`);
  await page.waitForTimeout(1200);
  n = await nav(page);
  expect(n.h === effects.h && n.v === effects.v && n.click === 3, `a step link on an open deck landed on ${n.h}/${n.v}/${n.click}`);
  await page.goto(`${base}#/glossary`);
  await page.reload();
  await ready(page);
  await page.waitForTimeout(600);
  n = await nav(page);
  const g = at("glossary");
  expect(n.h === g.h && n.v === g.v, `#/glossary landed on ${n.h}/${n.v}`);
  expect((await page.evaluate(() => location.hash)) === "#/glossary", "the hash of a slide with an id is not its id");
  await page.goto(`${base}?at#/${fmt.h}`);
  await ready(page);
  await page.waitForTimeout(600);
  expect(!(await page.evaluate(() => location.search.includes("at"))), "?at stayed in the address bar");
  expect((await nav(page)).h === fmt.h, "?at did not land on its slide");
  for (const p of take()) expect(false, p);
  await context.close();
});

// ── 7 · the other routes ───────────────────────────────────────────────────
/** The presenter's slide boxes: each canvas inside its box, 16:9, filling it one way, unclipped. */
async function presenterBoxes(page) {
  return page.evaluate(() =>
    ["current", "next"].map((pane) => {
      const box = document.querySelector(`.deck-presenter-${pane} .deck-presenter-box`);
      const canvas = box?.querySelector(".deck-presenter-canvas");
      const slide = canvas?.querySelector(".deck-slide.is-present, .deck-slide");
      if (!box || !canvas) return { pane, missing: true };
      const b = box.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      return {
        pane,
        inside: c.left >= b.left - 1 && c.top >= b.top - 1 && c.right <= b.right + 1 && c.bottom <= b.bottom + 1,
        aspect: c.width / c.height,
        // within the box's 1px border on each side
        fills: Math.abs(c.width - b.width) <= 4 || Math.abs(c.height - b.height) <= 4,
        clipped: slide ? slide.scrollWidth > slide.clientWidth + 2 : false,
        bars: getComputedStyle(box).backgroundColor,
        size: `${Math.round(c.width)}×${Math.round(c.height)} in ${Math.round(b.width)}×${Math.round(b.height)}`,
      };
    }),
  );
}

await step("presenter: current, next, notes for the click, timer, L", async () => {
  const s = at("presenter-view");
  for (const scheme of ["light", "dark"]) {
    const { page, context, take } = await openPage({ viewport: { width: 1440, height: 900 }, scheme });
    await page.goto(`${base}presenter#/${s.h}/0/2`);
    await page.waitForSelector(".deck-presenter", { timeout: 30_000 });
    await page.waitForTimeout(1500);
    expect((await page.locator(".deck-presenter-current .deck-slide").count()) > 0, "no current slide");
    expect((await page.locator(".deck-presenter-next .deck-slide").count()) > 0, "no next slide");
    expect((await page.locator(".deck-presenter-timer").count()) === 1, "no timer");
    const lit = await page.locator(".deck-notes-segment.is-current").first().textContent().catch(() => "");
    expect(/lights the part for the current step/.test(lit ?? ""), `the lit note is not step 2's: “${(lit ?? "").slice(0, 60)}”`);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    const lit2 = await page.locator(".deck-notes-segment.is-current").first().textContent().catch(() => "");
    expect(/Pacing/.test(lit2 ?? ""), "the notes did not follow the click");
    const before = await nav(page);
    for (const [vw, vh] of [[1280, 720], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width: vw, height: vh });
      for (const layout of ["notes-right", "notes-left", "next-big"]) {
        for (let i = 0; i < 3 && (await page.locator(`.deck-presenter.layout-${layout}`).count()) === 0; i++)
          await page.keyboard.press("l");
        expect((await page.locator(`.deck-presenter.layout-${layout}`).count()) === 1, `L never reached ${layout}`);
        await page.waitForTimeout(700);
        for (const b of await presenterBoxes(page)) {
          const where = `${vw}×${vh} ${layout} ${b.pane}`;
          if (b.missing) { expect(false, `${where}: no slide box`); continue; }
          expect(b.inside, `${where}: the slide spills out of its box (${b.size})`);
          expect(Math.abs(b.aspect - 16 / 9) < 0.02, `${where}: aspect ${b.aspect.toFixed(3)}, not 16:9`);
          expect(b.fills, `${where}: the slide does not fill its box either way (${b.size})`);
          expect(!b.clipped, `${where}: the slide's content is clipped`);
          // letterbox bars are dark whatever the scheme (sampled from the box behind the canvas)
          const [r, g, bl] = (b.bars.match(/[\d.]+/g) ?? []).map(Number);
          expect(r + g + bl < 3 * 40, `${where} (${scheme}): letterbox bars are ${b.bars}, not dark`);
        }
      }
    }
    const after = await nav(page);
    expect(after.h === before.h && after.click === before.click, `L moved the deck (${before.h}/${before.click} → ${after.h}/${after.click})`);
    expect((await page.evaluate(() => String(getSelection()))) === "", "text is selected on the presenter page");
    await page.setViewportSize({ width: 1440, height: 900 });
    for (let i = 0; i < 3 && (await page.locator(".deck-presenter.layout-notes-right").count()) === 0; i++) await page.keyboard.press("l");
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(out, `presenter-${scheme}.png`) });
    for (const p of take()) expect(false, `${scheme}: ${p}`);
    await context.close();
  }
});

await step("notes page: every note", async () => {
  const { page, context, take } = await openPage();
  await page.goto(`${base}notes`);
  await page.waitForSelector(".deck-notes-page", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const want = flat().filter((s) => s.hasNotes).length;
  const got = await page.locator(".deck-notes-entry").count();
  expect(got >= want, `${got} notes on the page, ${want} slides have notes`);
  const missing = flat().filter((s) => !s.hasNotes && s.id !== "hidden-slide").map((s) => s.id);
  expect(missing.length === 0, `slides without notes: ${missing.join(", ")}`);
  for (const p of take()) expect(false, p);
  await context.close();
});

await step("audience: /join on a phone (390×844)", async () => {
  const { page, context, take } = await openPage({ viewport: { width: 390, height: 844 }, mobile: true });
  mkdirSync(join(out, "phone"), { recursive: true });
  for (const route of ["join", "audience"]) {
    await page.goto(`${base}${route}`);
    await page.waitForSelector(".deck-audience", { timeout: 30_000 });
    await page.waitForTimeout(1500);
    expect((await page.locator(".deck-audience .deck-slide").count()) > 0, `/${route}: no slide in the mirror`);
    const wide = await page.evaluate(() => document.scrollingElement.scrollWidth);
    expect(wide <= 391, `/${route}: the page scrolls sideways (${wide}px)`);
    await page.screenshot({ path: join(out, "phone", `${route}.png`) });
  }
  for (const p of take()) expect(false, p);
  await context.close();
});

await step("scroll view: slides stacked full width, on a phone and a desktop", async () => {
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const { page, context, take } = await openPage({ viewport: vp, mobile: vp.width < 600 });
    await page.goto(`${base}?view=scroll`);
    await page.waitForSelector(".deck-scroll", { timeout: 30_000 });
    await page.waitForTimeout(1200);
    const n = await page.locator(".deck-slide.is-scroll").count();
    const want = flat().length;
    expect(n === want, `${vp.width}px: ${n} slides in the scroll view, ${want} in the deck`);
    const geo = await page.evaluate(() => {
      const scroller = document.querySelector(".deck-scroll");
      const width = scroller.clientWidth;
      const segs = [...document.querySelectorAll(".deck-scroll-segment")].map((s) => {
        const r = s.getBoundingClientRect();
        const c = s.querySelector(".deck-scroll-canvas").getBoundingClientRect();
        return { top: r.top + scroller.scrollTop, height: r.height, w: c.width, h: c.height };
      });
      return { width, segs };
    });
    const slideH = (geo.width * 9) / 16;
    const narrow = geo.segs.filter((g) => Math.abs(g.w - geo.width) > 2);
    expect(narrow.length === 0, `${vp.width}px: ${narrow.length} slides are not the page's width (${narrow[0]?.w} vs ${geo.width})`);
    let gaps = 0;
    for (let i = 1; i < geo.segs.length; i++) {
      const prev = geo.segs[i - 1];
      if (Math.abs(geo.segs[i].top - (prev.top + prev.height)) > 1) gaps++;
    }
    expect(gaps === 0, `${vp.width}px: ${gaps} slides do not follow straight on from the one above`);
    // A slide with no steps takes its own height and no more: no empty page between slides.
    const plain = flat().map((s, i) => ({ s, g: geo.segs[i] })).filter(({ s }) => (visited.get(`${s.h},${s.v}`) ?? 0) === 0);
    const tall = plain.filter(({ g }) => g && g.height > slideH + 2);
    expect(tall.length === 0, `${vp.width}px: ${tall.length} slides without steps are taller than a slide (${tall[0]?.g.height.toFixed(0)} > ${slideH.toFixed(0)})`);
    // What is on screen at the top is a slide with words on it, not an empty stretch.
    const words = await page.evaluate(() => {
      const r = document.querySelector(".deck-scroll").getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width * 0.3, r.top + 40);
      return !!el?.closest(".deck-scroll-segment");
    });
    expect(words, `${vp.width}px: the top of the scroll view is not a slide`);
    // Each slide sits on its own page colour, not on the dark bars around the stage.
    const bare = await page.$$eval(".deck-scroll-sticky", (els) =>
      els.filter((e) => { const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g) ?? []; return m.length < 3 || (m[3] !== undefined && Number(m[3]) < 0.9); }).length,
    );
    expect(bare === 0, `${vp.width}px: ${bare} slides have no page colour behind them`);
    await page.locator(".deck-scroll").evaluate((el) => el.scrollTo({ top: el.scrollHeight / 2, behavior: "instant" }));
    await page.waitForTimeout(600);
    const wide = await page.evaluate(() => document.scrollingElement.scrollWidth);
    expect(wide <= vp.width + 1, `${vp.width}px: the page scrolls sideways (${wide}px)`);
    await page.screenshot({ path: join(out, vp.width < 600 ? "phone" : ".", "scroll.png") });
    for (const p of take()) expect(false, `${vp.width}px: ${p}`);
    await context.close();
  }
});

await step("?embedded and ?projector", async () => {
  const { page, context, take } = await openPage();
  await page.goto(`${base}?embedded#/1`);
  await ready(page);
  expect((await nav(page)).h === 1, "?embedded did not render its slide");
  await page.goto(`${base}?projector#/1`);
  await page.reload();
  await ready(page);
  await page.waitForTimeout(500);
  const before = await nav(page);
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  const after = await nav(page);
  expect(before.h === after.h && before.click === after.click, "a projector moved on a key press");
  expect((await page.locator(".deck-root.is-projector").count()) === 1, "no projector class on the root");
  for (const p of take()) expect(false, p);
  await context.close();
});

// ── 8 · print and export ───────────────────────────────────────────────────
const expectedPages = () => [...visited.values()].reduce((n, clicks) => n + clicks + 1, 0);
await step("print: ?print-pdf has a page per click step", async () => {
  const { page, context, take } = await openPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${base}?print-pdf`);
  await page.waitForSelector(".deck-print-pages[data-ready]", { timeout: 120_000 });
  const pages = await page.locator(".deck-print-page").count();
  expect(pages === expectedPages(), `${pages} pages, expected Σ(clicks + 1) = ${expectedPages()}`);
  const errors = await page.locator(".deck-print-page .deck-slide-error").count();
  expect(errors === 0, `${errors} pages show a slide error`);
  // A step page shows that step: the first page of the click-effects slide has its tiles' words hidden.
  const hidden = await page.evaluate(() => {
    const first = [...document.querySelectorAll(".deck-print-page")].find((p) => p.querySelector('[data-id="click-effects"]'));
    const w = first?.querySelector(".sc-effect-word.effect-fade-in");
    return w ? getComputedStyle(w).opacity : null;
  });
  expect(hidden === "0", `step 0 of a stepped slide printed with its steps showing (opacity ${hidden})`);
  const typed = await page.evaluate(() => [...document.querySelectorAll(".deck-print-page .deck-typewriter")].every((t) => t.textContent.length > 10));
  expect(typed, "a typewriter printed blank");
  for (const p of take()) expect(false, p);
  await context.close();
});

await step("export: /export, the browser exporter, previews and packs a range", async () => {
  const { page, context, take } = await openPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}export`);
  await page.waitForSelector(".deck-export .deck-print-pages[data-ready]", { timeout: 120_000 });
  const all = await page.locator(".deck-export-preview .deck-print-page").count();
  expect(all === expectedPages(), `the preview has ${all} pages, expected ${expectedPages()}`);
  await page.fill(".deck-export-panel input[type=text]", "1-2");
  await page.check("input[name=deck-export-format][value=png]");
  await page.waitForTimeout(1000);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.click(".deck-export-actions button.is-primary"),
  ]);
  const zip = await download.path();
  expect(/-png\.zip$/.test(download.suggestedFilename()), `downloaded ${download.suggestedFilename()}`);
  expect(zip && statSync(zip).size > 20_000, "the PNG zip is empty");
  await page.screenshot({ path: join(out, "export-page.png") });
  for (const p of take()) expect(false, p);
  await context.close();
});

if (!flag("--no-export")) {
  await step("export: kadal-deck export — PDF, PNG, PPTX, editable PPTX, Markdown", async () => {
    const dir = join(out, "export");
    const bin = join(root, "packages/deck/dist/cli/bin.js");
    await run(
      "node",
      [bin, "export", "--url", base, "--no-posters", "--format", "pdf,png,pptx,pptx-editable,md", "--scale", "1", "--out", dir],
      deckDir,
    );
    const pdf = join(dir, "showcase.pdf");
    const pptx = join(dir, "showcase.pptx");
    const want = expectedPages();
    expect(existsSync(pdf) && statSync(pdf).size > 200_000, "no PDF, or a tiny one");
    if (existsSync(pdf)) {
      const text = readFileSync(pdf).toString("latin1");
      const count = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
      expect(count === want, `the PDF has ${count} pages, expected ${want}`);
      // Each page is its picture plus its text (export/pdf.ts): one full-page image (1920×1080 at
      // --scale 1) per page, and nothing a viewer can draw its own way. A soft-mask group or a
      // shading means an effect reached the printer — a blur, a mask, a gradient — and Preview
      // paints those as grey slabs. (An emoji in the text is a bitmap glyph with an alpha channel;
      // that is an image's own mask, not a group, and every viewer draws it.)
      const n = (re) => (text.match(re) ?? []).length;
      const art = (text.match(/<<[^<>]*\/Subtype\s*\/Image[^<>]*>>/g) ?? []).filter(
        (d) => /\/Width\s+1920\b/.test(d) && /\/Height\s+1080\b/.test(d),
      ).length;
      expect(art === want, `the PDF has ${art} full-page pictures, expected one per page (${want})`);
      expect(n(/\/Type\s*\/Mask/g) === 0, `the PDF has ${n(/\/Type\s*\/Mask/g)} soft-mask groups; effects were printed`);
      expect(n(/\/ShadingType/g) === 0, `the PDF has ${n(/\/ShadingType/g)} shadings; gradients were printed`);
      expect(n(/\/Type\s*\/Font/g) > 0, "the PDF has no fonts: its text was not printed as text");
      // Bookmarks from the slide titles (export/outline.ts), and the deck's metadata.
      expect(n(/\/Type\s*\/Outlines/g) === 1, "the PDF has no outline");
      expect(n(/\/Parent\s+\d+\s+0\s+R\s*\/?/g) > 0 && n(/\/Dest\s*\[/g) >= 20, `the PDF outline has ${n(/\/Dest\s*\[/g)} entries, expected one per titled slide`);
      expect(/\/Title\s*[(<]/.test(text), "the PDF has no title in its metadata");
    }
    const pngs = existsSync(join(dir, "png")) ? readdirSync(join(dir, "png")).filter((f) => f.endsWith(".png")) : [];
    expect(pngs.length === want, `${pngs.length} PNGs, expected ${want}`);
    expect(pngs.every((f) => statSync(join(dir, "png", f)).size > 5_000), "a PNG is suspiciously small");
    expect(existsSync(pptx) && statSync(pptx).size > 200_000, "no PPTX, or a tiny one");
    if (existsSync(pptx)) {
      const slides = new Set(readFileSync(pptx).toString("latin1").match(/ppt\/slides\/slide\d+\.xml/g) ?? []);
      expect(slides.size === want, `the PPTX has ${slides.size} slides, expected ${want}`);
    }
    // The editable PPTX: a slide per page, and its words are words (text runs), not pictures.
    const editable = join(dir, "showcase.editable.pptx");
    expect(existsSync(editable) && statSync(editable).size > 100_000, "no editable PPTX, or a tiny one");
    if (existsSync(editable)) {
      const listing = await new Promise((done) => {
        const p = spawn("unzip", ["-l", editable]);
        let s = "";
        p.stdout.on("data", (d) => (s += d));
        p.on("close", () => done(s));
        p.on("error", () => done(""));
      });
      const slides = (listing.match(/ppt\/slides\/slide\d+\.xml/g) ?? []).length;
      if (listing) expect(slides === want, `the editable PPTX has ${slides} slides, expected ${want}`);
      const runs = await new Promise((done) => {
        const p = spawn("unzip", ["-p", editable, "ppt/slides/*.xml"]);
        let s = "";
        p.stdout.on("data", (d) => (s += d));
        p.on("close", () => done((s.match(/<a:t>[^<]*\S[^<]*<\/a:t>/g) ?? []).length));
        p.on("error", () => done(-1));
      });
      if (runs >= 0) expect(runs > want * 3, `the editable PPTX has ${runs} text runs over ${want} slides: its text is not native`);
    }
    // Markdown: a picture per page, the notes as text.
    const md = join(dir, "showcase.md");
    expect(existsSync(md), "no Markdown export");
    if (existsSync(md)) {
      const text = readFileSync(md, "utf8");
      const pics = (text.match(/!\[[^\]]*\]\(\.\/png\/[^)]+\.png\)/g) ?? []).length;
      expect(pics === want, `the Markdown has ${pics} pictures, expected ${want}`);
      expect(/^---$/m.test(text), "the Markdown does not separate its slides");
    }
  });
}

// ── the summary ────────────────────────────────────────────────────────────
await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
const width = Math.max(...results.map((r) => r.name.length));
console.log(`\n${"check".padEnd(width)}  result  time`);
console.log(`${"─".repeat(width)}  ──────  ──────`);
for (const r of results) console.log(`${r.name.padEnd(width)}  ${r.ok ? "ok    " : "FAIL  "}  ${(r.ms / 1000).toFixed(1).padStart(5)}s`);
console.log(`\n${results.length - failed.length}/${results.length} passed in ${((Date.now() - started) / 1000).toFixed(0)}s · screenshots in ${out}`);
process.exit(failed.length ? 1 : 0);
