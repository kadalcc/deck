#!/usr/bin/env node
/**
 * The prebuilt shell (@kadal/deck-shell) in a real headless browser, served the way a host serves
 * it — dist/ under /@me/talk/ with the deck's files beside it:
 *   1. published: deck.mdx is fetched and compiled in the page; slides render, keys move, a
 *      command runs, the presenter route loads;
 *   2. preview: inside an editor's iframe, the source posted by the parent compiles and the
 *      shell answers with the outline and no diagnostics; export.thumbnail, asked over the same
 *      bridge, answers with a real PNG of the slide.
 *
 *   node tools/shell-check.mjs [deck.mdx]     (default examples/starter/deck.mdx; build first)
 *   PORT=5411 node tools/shell-check.mjs      the port to serve on (default 5411)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  if (["", "presenter", "join", "notes", "export"].includes(p)) p = "index.html";
  for (const dir of [shell, deckDir, join(deckDir, "public")]) {
    try {
      return await send(res, join(dir, p));
    } catch {}
  }
  res.statusCode = 404;
  res.end();
});
const PORT = Number(process.env.PORT ?? 5411);
await new Promise((r) => server.listen(PORT, r));

await mkdir(join(root, "examples/starter/check-output"), { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/@me/talk/`);
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
  await page.goto(`http://localhost:${PORT}/@me/talk/presenter`);
  await page.waitForSelector(".deck-presenter", { timeout: 60_000 });
  check("published: the presenter view loads", true);
  await page.goto(`http://localhost:${PORT}/@me/talk/export`);
  await page.waitForSelector(".deck-export .deck-print-pages[data-ready]", { timeout: 60_000 });
  const exportPages = await page.locator(".deck-export-preview .deck-print-page").count();
  check("published: the browser exporter loads with its preview", exportPages > 0, `${exportPages} pages`);

  await page.goto(`http://localhost:${PORT}/editor`);
  await page.waitForFunction(() => window.msgs.some((m) => m.type === "nav"), null, { timeout: 60_000 });
  const compiled = await page.evaluate(() => window.msgs.find((m) => m.type === "compiled"));
  check(
    "preview: the posted source compiles cleanly",
    compiled.ok && compiled.diagnostics.length === 0 && compiled.outline.length === counts.slides,
    `${compiled.ms} ms, ${compiled.outline.length} slides`,
  );
  const nav = await page.evaluate(() => window.msgs.filter((m) => m.type === "nav").at(-1));
  check("preview: it lands on the slide asked for and reports it", nav.index === 1, JSON.stringify(nav));
  // An edit to the slide on screen: the recompiled slide must replace the old one, not a cache.
  await page.evaluate((deckText) => {
    const edited = deckText.replace(/\n---\n/, "\n---\n\n# Edited by the check\n\n---\n");
    document.querySelector("iframe").contentWindow.postMessage({ kadal: 1, type: "source", text: edited, at: 0 }, "*");
  }, deck);
  const edited = page.frameLocator("iframe").getByRole("heading", { name: "Edited by the check" });
  await edited.waitFor({ timeout: 20_000 }).then(
    () => check("preview: a recompile shows the edited slide, not a cached one", true),
    () => check("preview: a recompile shows the edited slide, not a cached one", false),
  );
  // export.thumbnail through the bridge, as an editor asks for it when it publishes: a PNG of the
  // asked slide at the asked width, with the slide in it (not one flat colour).
  const ask = (id, params, seq) =>
    page.evaluate(
      ([id, params, seq]) =>
        new Promise((done) => {
          const on = (e) => {
            if (e.data?.type !== "command:result" || e.data.seq !== seq) return;
            removeEventListener("message", on);
            done(e.data.result);
          };
          addEventListener("message", on);
          document.querySelector("iframe").contentWindow.postMessage({ kadal: 1, type: "command", id, params, seq }, "*");
        }),
      [id, params, seq],
    );
  const inspect = (dataUrl) =>
    page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const colours = new Set();
      let ink = 0;
      for (let i = 0; i < d.length; i += 16) {
        colours.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
        if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 60) ink++;
      }
      return { w: c.width, h: c.height, colours: colours.size, ink: ink / (d.length / 16) };
    }, dataUrl);
  for (const [i, params] of [[0, {}], [1, { slide: 2, width: 320 }], [2, { slide: 1, width: 5000 }]]) {
    const t = Date.now();
    const r = await ask("export.thumbnail", params, 900 + i);
    const v = r.ok ? r.value : null;
    const px = v ? await inspect(v.dataUrl) : null;
    const want = params.width === 320 ? 320 : params.width === 5000 ? 1920 : 640;
    check(
      `preview: export.thumbnail ${JSON.stringify(params)} is a PNG of the slide`,
      !!v && v.type === "image/png" && v.dataUrl.startsWith("data:image/png;base64,") && v.width === want &&
        px.w === v.width && px.h === v.height && px.colours > 3 && px.ink > 0.002,
      v ? `${v.width}×${v.height}, ${px.colours} colours, ${(px.ink * 100).toFixed(1)}% ink, ${Date.now() - t} ms` : JSON.stringify(r),
    );
    if (i === 0 && v) await writeFile(join(root, "examples/starter/check-output/thumbnail-0.png"), Buffer.from(v.dataUrl.split(",")[1], "base64"));
  }
  const bad = await ask("export.thumbnail", { width: "big" }, 999);
  check("preview: export.thumbnail refuses bad params", !bad.ok, bad.error ?? "");
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
