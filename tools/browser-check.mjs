#!/usr/bin/env node
/**
 * A scaffolded deck in a real (headless) browser:
 *   1. `kadal-deck dev`: the deck renders, arrow keys move, the presenter route loads, the
 *      console stays clean, and no badge shows on a self-hosted deck.
 *   2. the built dist/, served the way the host serves a published deck — with
 *      window.__KADAL_DECK__ injected — joins the host's room id and shows the badge, which the
 *      print view hides.
 *
 *   node tools/browser-check.mjs <deck folder>      (e.g. the folder tools/smoke.mjs printed)
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

import { chromium } from "playwright";

const app = resolve(process.argv[2] ?? ".");
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
const dev = spawn("npx", ["kadal-deck", "dev", "--port", "5399", "--strictPort"], { cwd: app, stdio: "ignore" });
try {
  await waitFor("http://localhost:5399/");
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5399/");
  await page.waitForSelector(".deck-slide.is-present", { timeout: 30_000 });
  const h1 = await page.locator(".deck-slide.is-present h1").first().textContent();
  check("dev: the first slide renders", /Kadal Deck/.test(h1 ?? ""), h1 ?? "");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(900);
  const hash = await page.evaluate(() => location.hash);
  check("dev: ArrowRight moves to the next slide", /^#\/1/.test(hash), hash);
  check("dev: no badge on a self-hosted deck", (await page.locator(".deck-made-with").count()) === 0);
  await page.goto("http://localhost:5399/presenter");
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
await new Promise((r) => server.listen(5398, r));
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const sockets = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  await page.goto("http://localhost:5398/");
  await page.waitForSelector(".deck-slide.is-present", { timeout: 30_000 });
  await page.waitForTimeout(2500);
  const badge = page.locator(".deck-made-with");
  check("published: the badge shows", (await badge.count()) === 1 && (await badge.isVisible()));
  check("published: the badge links home", (await badge.getAttribute("href")) === "https://deck.kadal.cc/?ref=badge");
  const all = [...sockets, ...api];
  check("published: host calls use the room id", all.some((u) => u.includes("dabc123def456")), all.slice(0, 3).join(" "));
  check("published: nothing keyed by the slug", !all.some((u) => /\/(rooms|decks)\/(deck|my-talk)\b/.test(u)));
  await page.goto("http://localhost:5398/?print-pdf");
  await page.waitForTimeout(2000);
  check("published: print view hides the badge", (await page.locator(".deck-made-with").count()) === 0);
  await page.close();
} finally {
  server.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
