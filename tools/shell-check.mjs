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
    // UTF-8, or the deck's non-ASCII text reaches the shell mangled (and every offset after it).
    res.setHeader("content-type", "text/html; charset=utf-8");
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

/**
 * Editing in place (runtime/edit.ts), driven as a person would: arm it, hover, click, double-click
 * a heading, retype it, Enter. The shell must post `edited` with the range of that text in the
 * file the editor sent — and never move the deck while the person types (Space is "next").
 */
async function editInPlace(page, deckText) {
  const frame = page.frameLocator("iframe");
  const toShell = (message) =>
    page.evaluate((m) => document.querySelector("iframe").contentWindow.postMessage({ kadal: 1, ...m }, "*"), message);
  const latest = (type) => page.evaluate((t) => window.msgs.filter((m) => m.type === t).at(-1) ?? null, type);
  const waitFor = (type, count) =>
    page.waitForFunction(([t, n]) => window.msgs.filter((m) => m.type === t).length >= n, [type, count], { timeout: 10_000 });
  const countOf = (type) => page.evaluate((t) => window.msgs.filter((m) => m.type === t).length, type);
  const ready = await page.evaluate(() => window.msgs.find((m) => m.type === "ready"));
  check("edit: ready lists the \"edit\" feature", Array.isArray(ready.features) && ready.features.includes("edit"), JSON.stringify(ready.features));

  await toShell({ type: "edit", on: true });
  const heading = frame.locator(".deck-slide.is-present h1");
  const title = (await heading.textContent()).trim();
  const range = (await heading.getAttribute("data-deck-edit")).split("-").map(Number);
  check("edit: the heading's range holds its text in deck.mdx", deckText.slice(range[0], range[1]) === title, `${range} "${title}"`);
  await heading.hover();
  const outline = frame.locator(".deck-edit-outline");
  check("edit: hovering outlines it, offering a double-click", (await outline.textContent()) === "Double-click to edit");
  await page.screenshot({ path: join(root, "examples/starter/check-output/edit-hover.png") });
  const para = frame.locator(".deck-slide.is-present p").first();
  await para.hover();
  check("edit: text with markup inside says to edit it in the source", (await outline.textContent()) === "Edit in source");

  const located = await countOf("located");
  await heading.click();
  await waitFor("located", located + 1);
  const loc = await latest("located");
  const line = deckText.slice(0, deckText.indexOf(title)).split("\n").length;
  check("edit: a click reports where it is in the source", loc.file === "deck.mdx" && loc.line === line && deckText.slice(0, loc.offset).split("\n").length === line, JSON.stringify(loc));

  const typed = "Retyped in place: வணக்கம் 🎉";
  await heading.dblclick();
  check("edit: a double-click makes the heading editable", (await heading.getAttribute("contenteditable")) !== null);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(typed);
  await page.screenshot({ path: join(root, "examples/starter/check-output/edit-typing.png") });
  await page.keyboard.press("Enter");
  await waitFor("edited", 1);
  const edited = await latest("edited");
  check(
    "edit: Enter posts `edited` with the heading's range, before and after",
    edited.file === "deck.mdx" && edited.from === range[0] && edited.to === range[1] &&
      edited.before === title && deckText.slice(edited.from, edited.to) === edited.before && edited.after === typed,
    JSON.stringify(edited),
  );
  const still = await latest("nav");
  check("edit: typing (spaces too) never moved the deck", still.index === 1, JSON.stringify(still));
  check("edit: the element is no longer editable", (await heading.getAttribute("contenteditable")) === null);

  // The editor applies it and sends the source again: the slide shows the new text.
  const applied = deckText.slice(0, edited.from) + edited.after + deckText.slice(edited.to);
  await toShell({ type: "source", text: applied });
  await frame.getByRole("heading", { name: typed }).waitFor({ timeout: 20_000 }).then(
    () => check("edit: the re-sent source shows the edit", true),
    () => check("edit: the re-sent source shows the edit", false),
  );
  // Esc puts it back and posts nothing.
  const fresh = frame.locator(".deck-slide.is-present h1");
  await fresh.dblclick();
  await page.keyboard.type(" and more");
  await page.keyboard.press("Escape");
  check(
    "edit: Esc cancels, puts the text back and posts nothing",
    (await fresh.textContent()) === typed && (await countOf("edited")) === 1 && (await fresh.getAttribute("contenteditable")) === null,
  );

  // A multi-file deck: the page a slide comes from, with its own offsets.
  const page2 = "# The included page\n\nPage text.\n";
  await toShell({
    type: "source",
    text: "---\ntitle: Files\n---\n\n# Main\n\n---\nsrc: pages/intro.mdx\n---\n",
    files: { "pages/intro.mdx": page2 },
    at: 1,
  });
  const included = frame.getByRole("heading", { name: "The included page" });
  await included.waitFor({ timeout: 20_000 });
  await included.dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Renamed page");
  // Leaving the element saves too.
  await frame.locator(".deck-slide.is-present p").first().click();
  await waitFor("edited", 2);
  const inPage = await latest("edited");
  check(
    "edit: an included page's text reports its own file and offsets",
    inPage.file === "pages/intro.mdx" && inPage.from === 2 && inPage.to === 2 + "The included page".length &&
      inPage.before === "The included page" && inPage.after === "Renamed page",
    JSON.stringify(inPage),
  );

  // Edit mode and a comment pick never run at once: arming the pick turns editing off.
  await toShell({ type: "pick", on: true });
  await page.waitForTimeout(100);
  await included.dblclick();
  check("edit: a pick turns editing in place off", (await included.getAttribute("contenteditable")) === null);
  await toShell({ type: "pick", on: false });
  await toShell({ type: "source", text: deckText, at: 1 });
  await frame.getByRole("heading", { name: title }).waitFor({ timeout: 20_000 });
}

/**
 * `{type:"chrome", on:false}`: an editor whose stage has its own controls hides the deck's — the
 * arrows pill, the progress bar, the theme button — across recompiles, while the free plan's
 * watermark stays. `on:true` brings them back.
 */
/**
 * `layout.frame` (feature "frame", 0.6.3): where a placed element's x/y start on the slide shown.
 * Proved the way an editor uses it — a sticker placed with the frame's numbers lands on the stage
 * point asked for, inside the theme's padding or not.
 */
async function placementFrame(page, deckText, ask) {
  const ready = await page.evaluate(() => window.msgs.find((m) => m.type === "ready"));
  check("frame: ready lists the \"frame\" feature", ready.features?.includes("frame"), JSON.stringify(ready.features));
  const send = (text) =>
    page.evaluate((t) => document.querySelector("iframe").contentWindow.postMessage({ kadal: 1, type: "source", text: t, at: 0 }, "*"), text);
  const withSlide = (body) => deckText.replace(/\n---\n/, `\n---\n\n# Frame check\n\n${body}\n\n---\n`);
  const frame = page.frameLocator("iframe");
  await send(withSlide(""));
  await frame.getByRole("heading", { name: "Frame check" }).waitFor({ timeout: 20_000 });
  await ask("nav.goto", { index: 0 }, 1200);
  const r = await ask("layout.frame", {}, 1201);
  const f = r.ok ? r.value : null;
  check(
    "frame: layout.frame answers with the shown slide's frame",
    !!f && f.slide === 0 && f.x > 0 && f.y > 0 && f.unit === 1 && f.width > 0 && f.height > 0,
    JSON.stringify(r.ok ? f : r),
  );
  if (!f) return;
  const at = { x: 600, y: 400 };
  const dot = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Crect width='10' height='10' fill='red'/%3E%3C/svg%3E";
  await send(withSlide(`<Sticker src="${dot}" size={100} x={${(at.x - f.x) / f.unit}} y={${(at.y - f.y) / f.unit}} />`));
  const sticker = frame.locator('.deck-stage [data-active="true"] .deck-sticker');
  await sticker.waitFor({ timeout: 20_000 });
  // Measured against the slide (which covers the stage at rest), so a transition still running
  // doesn't move the answer.
  const landed = await sticker.evaluate((el) => {
    const stage = el.closest(".deck-stage");
    const k = stage.getBoundingClientRect().width / stage.offsetWidth;
    const s = el.closest("[data-index]").getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { x: Math.round((b.left - s.left) / k), y: Math.round((b.top - s.top) / k) };
  });
  check(
    "frame: a sticker placed with it lands on the stage point asked for",
    Math.abs(landed.x - at.x) <= 2 && Math.abs(landed.y - at.y) <= 2,
    `asked ${at.x},${at.y} → landed ${landed.x},${landed.y} (frame at ${f.x},${f.y})`,
  );
  // Back to the deck, and wait for that compile: a late one would answer the next step's wait.
  await page.evaluate(() => (window.msgs.length = 0));
  await send(deckText);
  await page.waitForFunction(() => window.msgs.some((m) => m.type === "compiled"), null, { timeout: 30_000 });
}

/**
 * A recompile of the slide on screen renders in place: the shell mounts every compile afresh, and
 * that remount (then a goto to the editor's `at`) used to replay the slide's entrance — it slid
 * in from the right on every keystroke. Sampled every frame: while an edited source of the shown
 * slide lands, nothing on the stage or its backgrounds animates and the stage is a cut; a real
 * move afterwards (the editor's slide rail is `nav.goto`) still plays its transition.
 */
async function recompileInPlace(page, deckText) {
  const frame = page.frameLocator("iframe");
  const toShell = (message) =>
    page.evaluate((m) => document.querySelector("iframe").contentWindow.postMessage({ kadal: 1, ...m }, "*"), message);
  const sliding = deckText.replace(/^---\n/, "---\ntransition: slide\nbackgroundTransition: slide\n");
  await toShell({ type: "source", text: sliding, at: 1 });
  await page.waitForTimeout(1500);
  // Every frame for `ms`: the stage's transition, and every running animation on a slide or a
  // background layer (a transition still settling from an earlier move counts against it too).
  const sample = (ms) =>
    page.frames()[1].evaluate(
      (ms) =>
        new Promise((done) => {
          const seen = { frames: 0, animated: 0, transitions: new Set(), names: new Set(), headings: new Set() };
          const t0 = performance.now();
          const tick = () => {
            seen.frames++;
            const stage = document.querySelector(".deck-stage");
            if (stage) seen.transitions.add(stage.dataset.transition);
            const h = document.querySelector(".deck-slide.is-present h1, .deck-slide.is-present h2");
            if (h) seen.headings.add(h.textContent.trim());
            // The slides and background layers themselves (a code block's line highlight fading
            // in, inside a slide, is the slide's content, not its entrance).
            const running = document
              .getAnimations()
              .filter((a) => a.playState === "running" && a.effect?.target?.matches?.(".deck-slide, .deck-backgrounds > *"));
            const shown = document.querySelector(".deck-slide.is-present");
            const moved = shown && getComputedStyle(shown).transform !== "none";
            if (running.length || moved) seen.animated++;
            for (const a of running) seen.names.add(a.animationName ?? a.transitionProperty ?? "?");
            if (performance.now() - t0 < ms) requestAnimationFrame(tick);
            else done({ ...seen, transitions: [...seen.transitions], names: [...seen.names], headings: [...seen.headings] });
          };
          requestAnimationFrame(tick);
        }),
      ms,
    );
  const index = () => page.evaluate(() => window.msgs.filter((m) => m.type === "nav").at(-1)?.index);
  const typed = sliding.replace("# Three dashes start a new slide", "# Three dashes start a new slide!");
  const watching = sample(1500);
  await page.waitForTimeout(50);
  await toShell({ type: "source", text: typed, at: 1 });
  const seen = await watching;
  check(
    "recompile: an edit to the slide on screen shows it in place, with no transition",
    seen.animated === 0 && seen.transitions.every((t) => t === "none") &&
      seen.headings.includes("Three dashes start a new slide!") && (await index()) === 1,
    JSON.stringify(seen),
  );
  // No `at` (an older host): the slide on screen still stays put, as a cut.
  const again = sample(1200);
  await page.waitForTimeout(50);
  await toShell({ type: "source", text: typed.replace("start a new slide!", "start a new slide!!") });
  const seen2 = await again;
  check(
    "recompile: …and without `at`, it stays on the slide shown",
    seen2.animated === 0 && seen2.headings.includes("Three dashes start a new slide!!") && (await index()) === 1,
    JSON.stringify(seen2),
  );
  // A real move still animates: the next slide slides in.
  const moving = sample(400);
  await page.evaluate(() =>
    document.querySelector("iframe").contentWindow.postMessage({ kadal: 1, type: "command", id: "nav.goto", params: { index: 2 }, seq: 700 }, "*"),
  );
  const moved = await moving;
  check(
    "recompile: …while moving to another slide keeps its transition",
    moved.animated > 0 && moved.transitions.includes("slide"),
    JSON.stringify(moved),
  );
  await toShell({ type: "source", text: deckText, at: 1 });
  await frame.locator(".deck-slide.is-present").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
}

/**
 * A drawn background is one picture at every size: the builder's small preview, a thumbnail and
 * the full window. They drew in screen pixels (aurora's swell and blur, waves' 50 px strokes,
 * the mesh's vmax blobs), so a 560 px preview showed bands twice as tall and soft as a 1600 px
 * view. Each is shot at two frame sizes, still (reduced motion), and compared at 320×180.
 */
async function backgroundsScale(browser, deckText) {
  const names = ["aurora", "waves", "lines", "gradient-mesh", "glows"];
  const text = deckText.replace(/\n---\n[\s\S]*$/, "\n") +
    names.map((n) => `\n---\nbackground: ${n}\n---\n\n<span />\n`).join("");
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, reducedMotion: "reduce" });
  await page.goto(`http://localhost:${PORT}/editor`);
  await page.waitForFunction(() => window.msgs.some((m) => m.type === "compiled"), null, { timeout: 60_000 });
  await page.evaluate((t) => document.querySelector("iframe").contentWindow.postMessage({ kadal: 1, type: "source", text: t, at: 1 }, "*"), text);
  await page.waitForTimeout(1500);
  const shots = {};
  for (const [w, h] of [[560, 315], [1600, 900]]) {
    await page.evaluate(([w, h]) => Object.assign(document.querySelector("iframe").style, { width: `${w}px`, height: `${h}px` }), [w, h]);
    for (let i = 0; i < names.length; i++) {
      await page.evaluate((i) => document.querySelector("iframe").contentWindow.postMessage({ kadal: 1, type: "command", id: "nav.goto", params: { index: i + 1 }, seq: 800 + i }, "*"), i);
      await page.waitForTimeout(700);
      const png = await page.frameLocator("iframe").locator(".deck-backgrounds").screenshot();
      (shots[names[i]] ??= []).push(
        await page.evaluate(async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = Object.assign(document.createElement("canvas"), { width: 320, height: 180 });
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0, 320, 180);
          return Array.from(g.getImageData(0, 0, 320, 180).data);
        }, png.toString("base64")),
      );
    }
  }
  const diff = (a, b) => {
    let d = 0;
    for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    return d / (a.length / 4) / 3;
  };
  const off = names.map((n) => [n, diff(...shots[n])]).filter(([, d]) => d > 4); // 0.6.3: aurora 18, waves 39, mesh 23, lines 5.3, glows 4.5
  check(
    "backgrounds: a drawn background looks the same at 560 and 1600 px",
    off.length === 0,
    names.map((n) => `${n} ${diff(...shots[n]).toFixed(1)}`).join(", "),
  );
  await page.close();
}

async function chromeOff(page, deckText) {
  const frame = page.frameLocator("iframe");
  const toShell = (message) =>
    page.evaluate((m) => document.querySelector("iframe").contentWindow.postMessage({ kadal: 1, ...m }, "*"), message);
  const ready = await page.evaluate(() => window.msgs.find((m) => m.type === "ready"));
  check("chrome: ready lists the \"chrome\" feature", ready.features?.includes("chrome"), JSON.stringify(ready.features));
  const chrome = () =>
    frame.locator(".deck-controls, .deck-progress, .deck-theme-button, .deck-slide-number, .deck-corner-tools").count();
  const before = await chrome();
  check("chrome: on by default", before > 0 && (await frame.locator(".deck-theme-button").count()) === 1, `${before}`);
  await toShell({ type: "chrome", on: false });
  await frame.locator(".deck-theme-button").waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
  check("chrome: off hides the arrows, progress and theme button", (await chrome()) === 0);
  // A recompile keeps it off, and a watermarked (free plan) deck keeps its watermark.
  const badged = deckText.replace(/^---\n/, "---\nbadge: true\n");
  await toShell({ type: "source", text: badged, at: 1 });
  await frame.locator(".deck-slide.is-present .deck-watermark").waitFor({ timeout: 20_000 }).then(
    () => check("chrome: the watermark is not chrome and stays", true),
    () => check("chrome: the watermark is not chrome and stays", false),
  );
  check("chrome: …and a recompile keeps the chrome off", (await chrome()) === 0);
  await page.waitForTimeout(800); // the slide's entrance transition, for the picture
  await page.screenshot({ path: join(root, "examples/starter/check-output/chrome-off.png") });
  await toShell({ type: "chrome", on: true });
  await frame.locator(".deck-theme-button").waitFor({ timeout: 10_000 }).then(
    () => check("chrome: on brings it back", true),
    () => check("chrome: on brings it back", false),
  );
  await toShell({ type: "source", text: deckText, at: 1 });
  await page.waitForTimeout(300);
}

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
  // Source positions are for the editor's preview only: a published deck carries none.
  const tagged = await page.locator("[data-deck-at], [data-deck-edit], [data-deck-file]").count();
  check("published: no source positions in the page", tagged === 0, `${tagged}`);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(600);
  check("published: ArrowRight moves", /^#\/1/.test(await page.evaluate(() => location.hash)));
  const ran = await page.evaluate(() => window.__deck.commands.run("nav.goto", { index: 2 }));
  check("published: a command runs", ran.ok && ran.value.index === 2, JSON.stringify(ran.value));
  // Every deck's theme menu offers all seventeen first-party themes; one the deck did not name
  // loads its stylesheet when picked.
  const accent = () =>
    page.evaluate(() => getComputedStyle(document.querySelector(".deck-root")).getPropertyValue("--deck-accent").trim());
  const before = await accent();
  await page.keyboard.press("t");
  const rows = page.locator(".deck-theme-popover [role=menuitemradio]");
  await rows.first().waitFor();
  const themeCount = await rows.count();
  check("published: the theme menu offers all seventeen themes", themeCount === 17, `${themeCount}`);
  await rows.filter({ hasText: "Ocean" }).click();
  const picked = await page
    .waitForFunction(
      (was) => {
        const root = document.querySelector(".deck-root.theme-ocean");
        const now = root && getComputedStyle(root).getPropertyValue("--deck-accent").trim();
        return !!now && now !== was;
      },
      before,
      { timeout: 20_000 },
    )
    .then(() => true, () => false);
  check("published: a theme the deck did not name loads and applies", picked, `${before} → ${await accent()}`);
  await page.evaluate(() => window.__deck.actions.setTheme("minimal"));
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
  await editInPlace(page, deck);
  await chromeOff(page, deck);
  await recompileInPlace(page, deck);
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
      let luma = 0;
      for (let i = 0; i < d.length; i += 16) {
        colours.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
        if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 60) ink++;
        luma += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      }
      const n = d.length / 16;
      return { w: c.width, h: c.height, colours: colours.size, ink: ink / n, luma: luma / n };
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
  // An `auto` deck pictured in either scheme, forced on the off-screen copy only: the screen
  // stays as it was, and the dark picture is darker than the light one.
  const screenBefore = await page.frameLocator("iframe").locator("html").getAttribute("data-color-scheme");
  const pair = {};
  for (const [i, scheme] of [[0, "dark"], [1, "light"]]) {
    const r = await ask("export.thumbnail", { scheme }, 950 + i);
    const v = r.ok ? r.value : null;
    pair[scheme] = v ? { ...v, px: await inspect(v.dataUrl) } : null;
    if (v) await writeFile(join(root, `examples/starter/check-output/thumbnail-${scheme}.png`), Buffer.from(v.dataUrl.split(",")[1], "base64"));
  }
  const screenAfter = await page.frameLocator("iframe").locator("html").getAttribute("data-color-scheme");
  check(
    "preview: export.thumbnail {scheme} pictures an auto deck in that scheme, the screen unchanged",
    !!pair.dark && !!pair.light && pair.dark.scheme === "dark" && pair.light.scheme === "light" &&
      pair.dark.auto === true && pair.dark.px.luma + 40 < pair.light.px.luma && screenBefore === screenAfter,
    pair.dark && pair.light
      ? `luma dark ${pair.dark.px.luma.toFixed(0)} / light ${pair.light.px.luma.toFixed(0)}, screen ${screenBefore}`
      : "no picture",
  );
  const bad = await ask("export.thumbnail", { width: "big" }, 999);
  check("preview: export.thumbnail refuses bad params", !bad.ok, bad.error ?? "");
  await placementFrame(page, deck, ask);
  // A theme this shell does not bundle: the deck still runs, in minimal, and says so — a warning
  // diagnostic to the editor and a dismissible notice to the presenter (theming/registry.ts).
  await page.evaluate((deckText) => {
    window.msgs.length = 0;
    const text = /^theme:/m.test(deckText)
      ? deckText.replace(/^theme:.*$/m, "theme: no-such-theme")
      : deckText.replace(/^---\n/, "---\ntheme: no-such-theme\n");
    document.querySelector("iframe").contentWindow.postMessage({ kadal: 1, type: "source", text, at: 0 }, "*");
  }, deck);
  await page.waitForFunction(() => window.msgs.some((m) => m.type === "compiled"), null, { timeout: 30_000 });
  const fallback = await page.evaluate(() => window.msgs.find((m) => m.type === "compiled"));
  check(
    "preview: an unknown theme compiles with a warning",
    fallback.ok && fallback.diagnostics.some((d) => d.severity === "warning" && /no-such-theme/.test(d.message)),
    fallback.diagnostics.map((d) => d.message).join(" | "),
  );
  const notice = page.frameLocator("iframe").locator(".deck-theme-notice");
  await notice.waitFor({ timeout: 20_000 }).then(
    () => check("preview: …falls back to minimal, with a notice", true),
    () => check("preview: …falls back to minimal, with a notice", false),
  );
  check(
    "preview: …and the deck wears minimal",
    await page.frameLocator("iframe").locator(".deck-root.theme-minimal").count() === 1,
  );
  await notice.getByRole("button", { name: "Dismiss" }).click();
  check("preview: the notice dismisses", (await notice.count()) === 0);
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await backgroundsScale(browser, deck);
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
