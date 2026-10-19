#!/usr/bin/env node
/**
 * The prebuilt shell (@kadal/deck-shell) in a real headless browser, served the way a host serves
 * it — dist/ under /@me/talk/ with the deck's files beside it:
 *   1. published: deck.mdx is fetched and compiled in the page; slides render, keys move, a
 *      command runs, the presenter route loads;
 *   2. preview: inside an editor's iframe, the source posted by the parent compiles and the
 *      shell answers with the outline and no diagnostics.
 *
 *   node tools/shell-check.mjs [deck.mdx]     (default examples/starter/deck.mdx; build first)
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shell = join(root, "packages/deck-shell/dist");
const deckFile = resolve(process.argv[2] ?? join(root, "examples/starter/deck.mdx"));
const deckDir = dirname(deckFile);
const deck = await readFile(deckFile, "utf8");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mdx": "text/markdown",
  ".yaml": "text/yaml",
  ".json": "application/json",
};
const editor = `<!doctype html><html><body style="margin:0">
<iframe id="f" src="/@me/talk/?preview" style="width:1280px;height:720px;border:0"></iframe>
<script>
  window.msgs = [];
  addEventListener("message", (e) => {
    window.msgs.push(e.data);
    if (e.data.type === "ready")
      f.contentWindow.postMessage({ kadal: 1, type: "source", text: ${JSON.stringify(deck)}, at: 1 }, "*");
  });
</script></body></html>`;

const send = async (res, file) => {
  const body = await readFile(file);
  res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
  res.end(body);
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/editor") {
    res.setHeader("content-type", "text/html");
    return res.end(editor);
  }
  let p = decodeURIComponent(url.pathname.replace(/^\/@me\/talk\//, ""));
  if (p.includes("..")) {
    res.statusCode = 400;
    return res.end();
  }
  if (["", "presenter", "join", "notes"].includes(p)) p = "index.html";
  for (const dir of [shell, deckDir, join(deckDir, "public")]) {
    try {
      return await send(res, join(dir, p));
    } catch {}
  }
  res.statusCode = 404;
  res.end();
});
await new Promise((r) => server.listen(5411, r));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  const t0 = Date.now();
  await page.goto("http://localhost:5411/@me/talk/");
  await page.waitForSelector(".deck-slide.is-present", { timeout: 60_000 });
  check("published: the first slide renders", true, `${Date.now() - t0} ms`);
  const counts = await page.evaluate(() => ({
    slides: window.__deck.manifest.slides.length,
    broken: document.querySelectorAll(".deck-compile-error").length,
  }));
  check("published: every slide compiled", counts.slides > 0 && counts.broken === 0, `${counts.slides} slides`);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(600);
  check("published: ArrowRight moves", /^#\/1/.test(await page.evaluate(() => location.hash)));
  const ran = await page.evaluate(() => window.__deck.commands.run("nav.goto", { index: 2 }));
  check("published: a command runs", ran.ok && ran.value.index === 2, JSON.stringify(ran.value));
  await page.goto("http://localhost:5411/@me/talk/presenter");
  await page.waitForSelector(".deck-presenter", { timeout: 60_000 });
  check("published: the presenter view loads", true);

  await page.goto("http://localhost:5411/editor");
  await page.waitForFunction(() => window.msgs.some((m) => m.type === "nav"), null, { timeout: 60_000 });
  const compiled = await page.evaluate(() => window.msgs.find((m) => m.type === "compiled"));
  check(
    "preview: the posted source compiles cleanly",
    compiled.ok && compiled.diagnostics.length === 0 && compiled.outline.length === counts.slides,
    `${compiled.ms} ms, ${compiled.outline.length} slides`,
  );
  const nav = await page.evaluate(() => window.msgs.filter((m) => m.type === "nav").at(-1));
  check("preview: it lands on the slide asked for and reports it", nav.index === 1, JSON.stringify(nav));
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
