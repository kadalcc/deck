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
 *   node tools/showcase-check.mjs --only <text>     run only the checks whose name contains <text>;
 *                                                   repeat it for several (the walk, when it is left
 *                                                   out, still reads the deck's slides)
 *   node tools/showcase-check.mjs --skip <text>     leave out the checks whose name contains <text>
 *                                                   (repeatable; wins over --only)
 *   node tools/showcase-check.mjs --export-format <list>
 *                                                   the formats `kadal-deck export` makes and checks
 *                                                   (default pdf,png,pptx,pptx-editable,md)
 *   node tools/showcase-check.mjs --export-range <spec>
 *                                                   export only those slides (`kadal-deck export
 *                                                   --range`, e.g. 1-74 or 75-)
 *
 * CI runs this in parallel jobs, each with a share of the checks (.github/workflows/ci.yml): the
 * walk with the views that count against it (print, /export, scroll), every other view, and the CLI
 * export split by format. A run that does not walk checks its export against the print view's own
 * page count; the walk's run checks that count against the walk, so the export is still held to
 * Σ(clicks + 1) over every slide.
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
const vals = (f) => argv.flatMap((a, i) => (a === f && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const out = resolve(val("--out", join(deckDir, "check-output")));
const started = Date.now();

// ── results ────────────────────────────────────────────────────────────────
const results = [];
let current = null;
const only = vals("--only");
const skip = vals("--skip");
const wanted = (name) => (!only.length || only.some((o) => name.includes(o))) && !skip.some((s) => name.includes(s));
async function step(name, fn) {
  if (!wanted(name)) return;
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
    // `src: ./extras.mdx#2` includes one slide of three: the other two must never be in the deck.
    if (/^extras-(one|three)$/.test(el.getAttribute("data-id") ?? "")) found.push("a slide the src range left out is showing");
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
    return d.columns.map((c) => c.slides.map((s) => ({ id: s.id, title: s.title, hasNotes: s.hasNotes, index: s.index, start: Number(s.frontmatter?.clicksStart ?? 0) })));
  });
}

const shotName = (h, v) => `${String(h).padStart(2, "0")}-${v}.png`;
let columns = null;
let visited = new Map(); // "h,v" -> total clicks seen

// ── 1 · every slide, every click (light) ───────────────────────────────────
const WALK = "walk: every slide and every click, light";
// Every other check finds its slides by id, so a run that leaves the walk out still reads them.
if (!wanted(WALK)) {
  const { page, context } = await openPage();
  await page.goto(`${base}#/0`);
  await ready(page);
  columns = await manifestOf(page);
  await context.close();
}
await step(WALK, async () => {
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
      // the colour behind the heading: the first opaque background up the slide, else the slide's
      // background layer (which the stage sits over), else the page. Not the deck's root: a slide
      // that forces its own scheme sits on its own layer, whatever the root wears.
      let bg = null;
      const slideEl = el.closest(".deck-slide");
      for (let n = el; n && n !== slideEl?.parentElement; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; const a = rgb(c); if (a.length >= 3 && (a[3] ?? 1) > 0.9) { bg = a; break; } }
      // The slide's own layer: the one entering, not one still leaving from the slide before.
      const layer = document.querySelector(".deck-backgrounds .is-entering") ?? document.querySelector(".deck-backgrounds .deck-background");
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
  await page.evaluate(({ h, v }) => window.__deck.actions.goto(h, v), at("contents"));
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

await step("transitions: a click never replays the entrance; cuts and view transitions leave nothing behind", async () => {
  const { page, context, take } = await openPage();
  const at$ = (id) => page.evaluate((id) => { const c = window.__deck.columns; for (let h = 0; h < c.length; h++) for (let v = 0; v < c[h].slides.length; v++) if (c[h].slides[v].id === id) return { h, v }; return null; }, id);
  const goto = async (id, click = 0) => { const p = await at$(id); await page.evaluate(({ h, v, click }) => window.__deck.actions.goto(h, v, click), { ...p, click }); await page.waitForTimeout(900); };
  /** Animations running on the present slide itself (its entrance), by name. */
  const entrance = () => page.evaluate(() => document.querySelector(".deck-slide.is-present")?.getAnimations().filter((a) => a.playState === "running").map((a) => a.animationName) ?? []);
  await page.goto(`${base}#/0`);
  await ready(page);
  // Stepping back a click keeps the slide where it is: its entrance is keyed on the direction.
  await goto("click-direction");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(600);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(60);
  const replay = await entrance();
  expect(replay.length === 0, `a click back replayed the slide's entrance (${replay.join(", ")})`);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(60);
  expect((await entrance()).length === 0, "a second click back replayed the entrance");
  // Up a stack lands on step 0 of a slide that waited at its last step: its steps snap hidden.
  const fmt = await at$("format");
  await page.evaluate(({ h }) => window.__deck.actions.goto(h, 1, 0), fmt);
  await page.waitForTimeout(900);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(80);
  const flashed = await page.evaluate(() => [...document.querySelectorAll(".deck-slide.is-present .deck-click.is-hidden")].filter((e) => Number(getComputedStyle(e).opacity) > 0.05).length);
  expect(flashed === 0, `${flashed} hidden steps were still showing on arrival from below`);
  // A cut and a view transition: the slide that left is gone, and so is its background.
  for (const id of ["tr-none", "tr-view"]) {
    const p = await at$(id);
    await page.evaluate(({ h }) => window.__deck.actions.goto(h - 1, 0, 99), p);
    await page.waitForTimeout(900);
    await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(120);
    const left = await page.evaluate(() => ({
      slides: [...document.querySelectorAll(".deck-stage .deck-slide.is-leaving")].filter((e) => getComputedStyle(e).visibility !== "hidden").length,
      backgrounds: [...document.querySelectorAll(".deck-backgrounds .is-leaving")].filter((e) => getComputedStyle(e).display !== "none").length,
    }));
    expect(left.slides === 0 && left.backgrounds === 0, `${id}: ${left.slides} leaving slides and ${left.backgrounds} leaving backgrounds still showing`);
  }
  // A zooming background zooms, at the slide's speed.
  const sp = await at$("tr-speed");
  await page.evaluate(({ h }) => window.__deck.actions.goto(h - 1, 0, 99), sp);
  await page.waitForTimeout(900);
  await page.keyboard.press("Shift+ArrowRight");
  await page.waitForTimeout(60);
  const bg = await page.evaluate(() => { const e = document.querySelector(".deck-backgrounds .is-entering"); const cs = e && getComputedStyle(e); return cs ? `${cs.animationName} ${cs.animationDuration}` : ""; });
  expect(bg === "deck-bg-zoom-in 1s", `the slow, zooming background ran “${bg}”`);
  for (const p of take()) expect(false, p);
  await context.close();
});

/*
 * The stage keeps the slides around the current one mounted and hidden. Hidden by `visibility`
 * alone, a child styled `visibility: visible` showed anyway, over the current slide: a Pro item's
 * dialogue drew lines from three slides away. Here every element of every slide not on show
 * insists on showing and on taking the pointer, through every transition in the deck and again
 * with reduced motion; none of it may be visible, and none of those slides may take focus.
 */
await step("hidden slides: nothing on a slide off screen paints, whatever its CSS says", async () => {
  const { page, context, take } = await openPage();
  const LEAK = ".deck-slide:not(.is-present) * { visibility: visible !important; pointer-events: auto !important; }";
  const leaks = () =>
    page.evaluate(() => {
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const found = [];
      for (const slide of document.querySelectorAll(".deck-stage > .deck-slide:not(.is-present)")) {
        const stage = slide.parentElement;
        const cut = reduced || [stage.dataset.transitionOut, stage.dataset.transition].some((t) => t === "none" || t === "view-transition");
        // The slide just left is on show while it animates out, unless its way out is a cut.
        if (slide.classList.contains("is-leaving") && !cut) continue;
        const where = `${slide.dataset.id} (${[...slide.classList].filter((c) => c.startsWith("is-")).join(" ")})`;
        if (!slide.inert) found.push(`${where} is not inert`);
        const shown = [...slide.querySelectorAll("*")].find((el) => {
          if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        if (shown) found.push(`${where}: <${shown.tagName.toLowerCase()}> “${(shown.textContent ?? "").trim().slice(0, 30)}” is visible`);
      }
      return found;
    });
  const seen = new Set();
  const transitions = new Set();
  const sample = async (at) => {
    transitions.add(await page.evaluate(() => document.querySelector(".deck-stage")?.dataset.transition ?? ""));
    for (const l of await leaks()) if (!seen.has(l)) seen.add(l) && expect(false, `${at}: ${l}`);
  };
  /** Slide by slide (down a stack, then right), sampled mid-transition and once it is over. */
  const walk = async (until) => {
    let steps = 0;
    for (let i = 0; i < 400; i++) {
      const s = await nav(page);
      const key = `${s.h}/${s.v}`;
      await sample(key);
      if (until?.(s)) break;
      await page.keyboard.press("Shift+ArrowRight");
      const moved = await page
        .waitForFunction((k) => { const n = window.__deck.nav.get(); return `${n.h}/${n.v}` !== k; }, key, { timeout: 2000 })
        .then(() => true, () => false);
      if (!moved) break;
      steps++;
      await sample(`${key} → mid-transition`);
      await page.waitForTimeout(150);
      await sample(`${key} → mid-transition`);
      await page.waitForFunction(() => !document.querySelector(".deck-stage > .deck-slide.is-leaving"), null, { timeout: 2500 }).catch(() => {});
    }
    return steps;
  };
  await page.goto(`${base}#/0`);
  await ready(page);
  await page.addStyleTag({ content: LEAK });
  const steps = await walk();
  note(`${steps} moves; transitions seen: ${[...transitions].filter(Boolean).sort().join(" ")}`);
  // Reduced motion: no crossfade, so the slide that left is hidden at once too.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const motion = at("motion");
  const end = at("auto-slide");
  await page.evaluate(({ h, v }) => window.__deck.actions.goto(h, v, 0), motion);
  await page.waitForTimeout(600);
  const reducedSteps = await walk((s) => s.h >= end.h - 1);
  note(`reduced motion: ${reducedSteps} moves through the motion chapter`);
  for (const p of take()) expect(false, p);
  await context.close();

  // Where slides are meant to be seen side by side, they still are: the overview, the presenter's
  // next slide, print pages and the scroll view.
  const views = [
    { name: "overview", url: `${base}#/1`, then: (p) => p.keyboard.press("KeyO"), sel: ".deck-overview .deck-slide.is-tile" },
    { name: "presenter next slide", url: `${base}presenter#/1`, sel: ".deck-presenter-next .deck-slide" },
    { name: "print", url: `${base}?print-pdf`, sel: ".deck-slide.is-print" },
    { name: "scroll view", url: `${base}?view=scroll`, sel: ".deck-slide.is-scroll" },
  ];
  for (const v of views) {
    const { page, context } = await openPage();
    await page.goto(v.url);
    if (v.then) {
      await ready(page);
      await v.then(page);
    }
    await page.waitForSelector(v.sel, { timeout: 30_000 });
    await page.waitForTimeout(800);
    const r = await page.evaluate((sel) => {
      const slides = [...document.querySelectorAll(sel)].slice(0, 6);
      const shown = slides.filter((s) => [...s.querySelectorAll("h1, h2, p")].some((e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true })));
      return { n: slides.length, shown: shown.length };
    }, v.sel);
    expect(r.n > 0 && r.shown === r.n, `${v.name}: ${r.shown} of ${r.n} slides show their words`);
    await context.close();
  }
});

// ── 6 · addresses ──────────────────────────────────────────────────────────
await step("links: #/h/v/click, #/id, ?at", async () => {
  const { page, context, take } = await openPage();
  const fmt = at("format");
  await page.goto(`${base}#/${fmt.h}/${fmt.v}/2`);
  await ready(page);
  await page.waitForTimeout(800);
  let n = await nav(page);
  expect(n.h === fmt.h && n.v === fmt.v && n.click === 2, `#/${fmt.h}/${fmt.v}/2 landed on ${n.h}/${n.v}/${n.click}`);
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
  // An id with a step, the way the deck writes it with fragmentInURL.
  await page.goto(`${base}#/click-effects/4`);
  await page.reload();
  await ready(page);
  await page.waitForTimeout(600);
  n = await nav(page);
  expect(n.h === effects.h && n.v === effects.v && n.click === 4, `#/click-effects/4 landed on ${n.h}/${n.v}/${n.click}`);
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
    await page.goto(`${base}presenter#/${s.h}/${s.v}/2`);
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
      for (const layout of ["notes-right", "notes-left"]) {
        for (let i = 0; i < 2 && (await page.locator(`.deck-presenter.layout-${layout}`).count()) === 0; i++)
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
    for (let i = 0; i < 2 && (await page.locator(".deck-presenter.layout-notes-right").count()) === 0; i++) await page.keyboard.press("l");
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(out, `presenter-${scheme}.png`) });
    for (const p of take()) expect(false, `${scheme}: ${p}`);
    await context.close();
  }
});

await step("presenter: the pen, the overview, and keys typed into fields", async () => {
  const { page, context, take } = await openPage({ viewport: { width: 1440, height: 900 } });
  const s = at("writing");
  await page.goto(`${base}presenter#/${s.h}/${s.v}`);
  await page.waitForSelector(".deck-presenter", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  // Strokes stay: through a change of colour and tool, past the time a scribble would fade.
  await page.keyboard.press("c");
  await page.waitForTimeout(300);
  const canvas = await page.locator(".deck-presenter-current .deck-presenter-canvas").boundingBox();
  const stroke = async (x, y) => {
    await page.mouse.move(canvas.x + canvas.width * x, canvas.y + canvas.height * y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(canvas.x + canvas.width * (x + i * 0.02), canvas.y + canvas.height * (y + i * 0.01));
    await page.mouse.up();
  };
  const strokes = () => page.locator(".deck-presenter-current svg.deck-drawing g[data-stroke]").count();
  await stroke(0.2, 0.3);
  await page.click(".deck-draw-toolbar button[aria-label='Colour #3b82f6']");
  await page.click(".deck-draw-toolbar button[aria-label='Rectangle']");
  await stroke(0.5, 0.5);
  await page.click(".deck-draw-toolbar button[aria-label='Pen']");
  await stroke(0.3, 0.7);
  expect((await strokes()) === 3, `${await strokes()} strokes after changing colour and tool, expected 3`);
  // The toolbar sits clear of the narration bar.
  const overlap = await page.evaluate(() => {
    const t = document.querySelector(".deck-draw-toolbar")?.getBoundingClientRect();
    const n = document.querySelector(".deck-presenter .deck-narration")?.getBoundingClientRect();
    return t && n ? t.bottom > n.top + 1 : false;
  });
  expect(!overlap, "the drawing toolbar covers the narration bar");
  // With the pen on, Escape closes an open theme menu first.
  await page.click(".deck-theme-button");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const u1 = await ui(page);
  expect(!u1.themeMenu && u1.drawing, `Esc with the pen on: theme menu ${u1.themeMenu}, pen ${u1.drawing}`);
  await page.click(".deck-draw-toolbar button[aria-label='Done']");
  await page.waitForTimeout(6500);
  expect((await strokes()) === 3, `${await strokes()} strokes once the tools closed and a scribble's time passed, expected 3`);
  await page.keyboard.press("Shift+c");
  await page.keyboard.press("c");
  await page.keyboard.press("Shift+c");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // The overview opens over the presenter view, and a tile goes there.
  await page.click(".deck-presenter-tools button[aria-label='Overview']");
  await page.waitForTimeout(500);
  expect(await page.locator(".deck-presenter .deck-overview").isVisible(), "the Overview button showed no overview");
  // Tiles are in deck order, column by column, so the fifth is the deck's fifth slide.
  await page.locator(".deck-overview-tile").nth(4).click();
  await page.waitForTimeout(500);
  const tile = flat()[4];
  const landed = await nav(page);
  expect((await page.locator(".deck-overview").count()) === 0 && landed.h === tile.h && landed.v === tile.v, "an overview tile did not go to its slide");
  // Keys typed into a field are the field's: one in a shadow root (a host's panel), and search.
  const before = await nav(page);
  const layout = await page.evaluate(() => document.querySelector(".deck-presenter").className);
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "shadow-panel";
    document.querySelector(".deck-presenter-room").append(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<input id="ask" /><div id="ce" contenteditable="true"></div>';
  });
  await page.locator("#shadow-panel input").click();
  await page.keyboard.type("hello lt gjk b. sdc");
  const typed = await page.locator("#shadow-panel input").inputValue();
  expect(typed === "hello lt gjk b. sdc", `the shadow-root field got “${typed}”`);
  await page.locator("#shadow-panel [contenteditable]").click();
  await page.keyboard.type("all ok");
  expect((await page.locator("#shadow-panel [contenteditable]").textContent()) === "all ok", "the shadow-root contenteditable lost keys");
  const after = await nav(page);
  const u2 = await ui(page);
  expect(after.h === before.h && after.click === before.click && !after.paused, `typing moved the deck (${before.h}/${before.click} → ${after.h}/${after.click})`);
  expect(!u2.themeMenu && !u2.drawing && !u2.search && !u2.jump, "typing opened a menu or tool");
  expect((await page.evaluate(() => document.querySelector(".deck-presenter").className)) === layout, "typing changed the presenter layout (L)");
  await page.evaluate(() => document.getElementById("shadow-panel")?.remove());
  for (const p of take()) expect(false, p);
  await context.close();
});

await step("typing in fields on the deck and the audience page", async () => {
  const { page, context, take } = await openPage();
  const s = at("writing");
  await page.goto(`${base}#/${s.h}/${s.v}`);
  await ready(page);
  await page.waitForTimeout(500);
  await page.keyboard.press("/");
  await page.keyboard.type("lt b");
  const u = await ui(page);
  expect(u.search && !u.themeMenu && !(await nav(page)).paused, "keys typed into search reached the deck");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const host = document.createElement("div");
    document.body.append(host);
    host.attachShadow({ mode: "open" }).innerHTML = '<textarea id="t"></textarea>';
    host.id = "shadow-play";
  });
  const before = await nav(page);
  await page.locator("#shadow-play textarea").click();
  await page.keyboard.type("next slide please");
  const after = await nav(page);
  expect(after.h === before.h && after.click === before.click, "typing in a shadow-root textarea moved the deck");
  expect((await page.locator("#shadow-play textarea").inputValue()) === "next slide please", "the shadow-root textarea lost keys");
  await page.goto(`${base}join`);
  await page.waitForSelector(".deck-audience", { timeout: 30_000 });
  await page.waitForTimeout(800);
  const field = page.locator(".deck-audience textarea, .deck-audience input[type=text]").first();
  if (await field.count()) {
    await field.click();
    await page.keyboard.type("hello lt");
    expect((await field.inputValue()) === "hello lt", `the audience page's field got “${await field.inputValue()}”`);
  } else note("the audience page has no text field without a room");
  for (const p of take()) expect(false, p);
  await context.close();
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
    // A slide with no steps takes its own height and no more: no empty page between slides. Which
    // slides have steps is what the walk counted, so CI runs this view in the walk's job.
    if (!visited.size) note(`${vp.width}px: not walked in this run, so slide heights were not checked`);
    const plain = flat().map((s, i) => ({ s, g: geo.segs[i] })).filter(({ s }) => visited.size && (visited.get(`${s.h},${s.v}`) ?? 0) === 0);
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
// A slide with `clicksStart` opens (and prints) from that step.
const startOf = (key) => flat().find((s) => `${s.h},${s.v}` === key)?.start ?? 0;
const expectedPages = () => [...visited.entries()].reduce((n, [key, clicks]) => n + clicks + 1 - Math.min(startOf(key), clicks), 0);
// Slide numbers (1-based, in deck order) a `--range` spec such as "1-74" or "75-" names.
const slidesIn = (spec, total) =>
  spec.split(",").flatMap((part) => {
    const [a, b] = part.trim().split("-");
    const lo = Number(a);
    const hi = b === undefined ? lo : b === "" ? total : Number(b);
    return Array.from({ length: Math.max(0, Math.min(hi, total) - lo + 1) }, (_, i) => lo + i);
  });
// What an export must have: the walked count, or, in a run that did not walk, the print view's
// own count (which the walk's run holds to the walked count: see the header). With a range, the
// same for just those slides.
async function pagesWanted(range) {
  if (visited.size) {
    if (!range) return expectedPages();
    const keys = new Set(slidesIn(range, flat().length).map((n) => `${flat()[n - 1].h},${flat()[n - 1].v}`));
    return [...visited.entries()].filter(([key]) => keys.has(key)).reduce((n, [key, clicks]) => n + clicks + 1 - Math.min(startOf(key), clicks), 0);
  }
  const { page, context } = await openPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${base}?print-pdf${range ? `&range=${encodeURIComponent(range)}` : ""}`);
  await page.waitForSelector(".deck-print-pages[data-ready]", { timeout: 120_000 });
  const pages = await page.locator(".deck-print-page").count();
  await context.close();
  note(`not walked in this run: ${pages} pages expected, the print view's count${range ? ` for slides ${range}` : ""}`);
  return pages;
}
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

const FORMATS = { pdf: "PDF", png: "PNG", pptx: "PPTX", "pptx-editable": "editable PPTX", md: "Markdown" };
const exportFormats = val("--export-format", Object.keys(FORMATS).join(",")).split(",").filter(Boolean);
for (const f of exportFormats)
  if (!(f in FORMATS)) {
    console.error(`--export-format ${f}: use ${Object.keys(FORMATS).join(", ")}`);
    process.exit(2);
  }
const exporting = (f) => exportFormats.includes(f);
const exportRange = val("--export-range", null);
if (!flag("--no-export")) {
  await step(`export: kadal-deck export — ${exportFormats.map((f) => FORMATS[f]).join(", ")}${exportRange ? `, slides ${exportRange}` : ""}`, async () => {
    const dir = join(out, "export");
    const bin = join(root, "packages/deck/dist/cli/bin.js");
    await run(
      "node",
      [bin, "export", "--url", base, "--no-posters", "--format", exportFormats.join(","), "--scale", "1", "--out", dir, ...(exportRange ? ["--range", exportRange] : [])],
      deckDir,
    );
    const pdf = join(dir, "showcase.pdf");
    const pptx = join(dir, "showcase.pptx");
    const want = await pagesWanted(exportRange);
    if (exporting("pdf")) expect(existsSync(pdf) && statSync(pdf).size > 200_000, "no PDF, or a tiny one");
    if (exporting("pdf") && existsSync(pdf)) {
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
    if (exporting("png")) {
      expect(pngs.length === want, `${pngs.length} PNGs, expected ${want}`);
      expect(pngs.every((f) => statSync(join(dir, "png", f)).size > 5_000), "a PNG is suspiciously small");
    }
    if (exporting("pptx")) expect(existsSync(pptx) && statSync(pptx).size > 200_000, "no PPTX, or a tiny one");
    if (exporting("pptx") && existsSync(pptx)) {
      const slides = new Set(readFileSync(pptx).toString("latin1").match(/ppt\/slides\/slide\d+\.xml/g) ?? []);
      expect(slides.size === want, `the PPTX has ${slides.size} slides, expected ${want}`);
    }
    // The editable PPTX: a slide per page, and its words are words (text runs), not pictures.
    const editable = join(dir, "showcase.editable.pptx");
    if (exporting("pptx-editable")) expect(existsSync(editable) && statSync(editable).size > 100_000, "no editable PPTX, or a tiny one");
    if (exporting("pptx-editable") && existsSync(editable)) {
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
    if (exporting("md")) expect(existsSync(md), "no Markdown export");
    if (exporting("md") && existsSync(md)) {
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
