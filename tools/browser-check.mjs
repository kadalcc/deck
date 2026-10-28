#!/usr/bin/env node
/**
 * A scaffolded deck in a real (headless) browser:
 *   1. `kadal-deck dev`: the deck renders, arrow keys move, the presenter route loads, the
 *      console stays clean, and no watermark shows on a self-hosted deck.
 *   2. the built dist/, served the way the host serves a published deck — with
 *      window.__KADAL_DECK__ injected — joins the host's room id and carries the free-plan
 *      watermark on the slide, and on every page of the print view that exports are made from.
 *
 *   node tools/browser-check.mjs <deck folder>      (e.g. the folder tools/smoke.mjs printed)
 *   node tools/browser-check.mjs <deck folder> --port <n>
 *                                                   the dev server's port (default: any free one;
 *                                                   the served dist/ always takes a free one)
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { extname, join, resolve } from "node:path";

import { chromium } from "playwright";

const args = process.argv.slice(2);
const portAt = args.indexOf("--port");
const app = resolve(args.find((a, i) => !a.startsWith("--") && (portAt < 0 || i !== portAt + 1)) ?? ".");
// A fixed port collides with whatever else the machine runs; ask the OS for one instead.
const freePort = () =>
  new Promise((ok, fail) => {
    const s = createNetServer().once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
const devPort = portAt >= 0 ? Number(args[portAt + 1]) : await freePort();
if (!Number.isInteger(devPort) || devPort <= 0) throw new Error(`--port wants a number, got ${args[portAt + 1]}`);
const devUrl = `http://localhost:${devPort}`;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};
const waitFor = async (url, ms = 30_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${url} never answered`);
};

const browser = await chromium.launch();

// ── 1 · the dev server ────────────────────────────────────────────────────
const dev = spawn("npx", ["kadal-deck", "dev", "--port", String(devPort), "--strictPort"], { cwd: app, stdio: "ignore" });
try {
  await waitFor(`${devUrl}/`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${devUrl}/`);
  await page.waitForSelector(".deck-slide.is-present", { timeout: 30_000 });
  const h1 = await page.locator(".deck-slide.is-present h1").first().textContent();
  check("dev: the first slide renders", /Kadal Deck/.test(h1 ?? ""), h1 ?? "");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(900);
  const hash = await page.evaluate(() => location.hash);
  check("dev: ArrowRight moves to the next slide", /^#\/1/.test(hash), hash);
  check("dev: no watermark on a self-hosted deck", (await page.locator(".deck-watermark").count()) === 0);
  await page.goto(`${devUrl}/presenter`);
  await page.waitForSelector(".deck-presenter", { timeout: 30_000 });
  check("dev: the presenter view loads", true);
  await page.waitForTimeout(1500);
  check("dev: no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
} finally {
  dev.kill();
}

// ── 2 · the built deck, served like a published one ───────────────────────
const dist = join(app, "dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const override = '<script>window.__KADAL_DECK__={"room":"dabc123def456","api":"/api","badge":true}</script>';
const api = [];
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.startsWith("/api/")) {
    api.push(path);
    res.writeHead(404, { "content-type": "application/json" }).end('{"error":"not_found"}');
    return;
  }
  let file = join(dist, path);
  let body;
  try {
    body = await readFile(file);
  } catch {
    file = join(dist, "index.html");
    body = await readFile(file);
  }
  if (file.endsWith(".html")) body = Buffer.from(String(body).replace("<head>", `<head>${override}`));
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const served = `http://127.0.0.1:${server.address().port}`;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const sockets = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  await page.goto(`${served}/`);
  await page.waitForSelector(".deck-slide.is-present", { timeout: 30_000 });
  await page.waitForTimeout(2500);
  const mark = page.locator(".deck-slide.is-present .deck-watermark");
  check("published: the present slide carries the watermark", (await mark.count()) === 1 && (await mark.isVisible()));
  check("published: the watermark links home", (await mark.getAttribute("href")) === "https://deck.kadal.cc/?ref=watermark");
  const all = [...sockets, ...api];
  check("published: host calls use the room id", all.some((u) => u.includes("dabc123def456")), all.slice(0, 3).join(" "));
  check("published: nothing keyed by the slug", !all.some((u) => /\/(rooms|decks)\/(deck|my-talk)\b/.test(u)));
  await page.goto(`${served}/?print-pdf`);
  await page.waitForTimeout(2000);
  // Exports are made from the print view, so the mark must be on every page of it.
  const pages = await page.locator(".deck-print-page:not(.deck-print-notes-page)").count();
  const marks = await page.locator(".deck-watermark").count();
  check("published: every print page carries the watermark", pages > 0 && marks >= pages, `${marks} marks, ${pages} pages`);
  await page.close();
} finally {
  server.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
