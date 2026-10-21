#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THEME SHOTS: every first-party theme's preview deck, in a headless Chromium
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node tools/theme-shots.mjs                       every packages/theme-*
 *   node tools/theme-shots.mjs ocean folio           just these
 *   node tools/theme-shots.mjs --out <dir>           where the PNGs go (default theme-shots/, gitignored)
 *   node tools/theme-shots.mjs --port 5460           the first dev-server port (one per theme)
 *   node tools/theme-shots.mjs --slides 0,2,3        only these slides (0-based), default all
 *   node tools/theme-shots.mjs --no-views            skip the presenter, print and phone views
 *   node tools/theme-shots.mjs --readme              also write each package's screenshot.jpg
 *
 * For each theme it runs the preview deck (`packages/theme-<name>/preview`, `theme: ../`) with
 * its own Vite, then at 1280×720, in the light and the dark scheme:
 *
 *   slides     a PNG of every slide, `<theme>-<scheme>-<nn>.png`
 *   contrast   WCAG ratios of the tokens as the browser resolved them — body text, muted text,
 *              the accent and code text on their grounds, text on a surface — body text must
 *              reach AA (4.5), and so must muted text, which carries captions and the number
 *   overflow   anything that leaves the slide, a layout taller than its box, a slide the auto-fit
 *              had to shrink, code that scrolls
 *   views      the presenter view, the first print page (`?print-pdf`), the scroll view on a
 *              390-wide phone
 *   sheets     a contact sheet per theme (`<theme>-sheet.png`) and one of every theme's cover,
 *              content, code and two-cols slides (`contact-sheet.png`): the docs' gallery
 *
 * Exits non-zero on a console error, a contrast failure or an overflow. Needs the engine built
 * (`bun run build`) and Playwright's Chromium.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const val = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const flag = (f) => argv.includes(f);
const out = resolve(val("--out", join(root, "theme-shots")));
const port0 = Number(val("--port", "5460"));
const only = val("--slides", null)?.split(",").map(Number) ?? null;
const valued = new Set(["--out", "--port", "--slides"]);
const names = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1]));
const themes = (
  names.length
    ? names
    : readdirSync(join(root, "packages"))
        .filter((d) => d.startsWith("theme-"))
        .map((d) => d.slice(6))
).filter((n) => existsSync(join(root, "packages", `theme-${n}`, "preview", "deck.mdx")));
mkdirSync(out, { recursive: true });

const problems = [];
const report = {};
const W = 1280;
const H = 720;

const waitFor = async (url, ms = 60_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${url} never answered`);
};

function startVite(dir, port) {
  const req = createRequire(join(dir, "package.json"));
  const pkg = req.resolve("vite/package.json");
  const bin = join(dirname(pkg), JSON.parse(readFileSync(pkg, "utf8")).bin.vite);
  return spawn(process.execPath, [bin, "--port", String(port), "--strictPort"], {
    cwd: join(dir, "preview"),
    stdio: ["ignore", "ignore", "pipe"],
  });
}

/** In the page: the tokens' contrast, resolved by the browser (color-mix and alpha included). */
function measureContrast() {
  const root = document.querySelector(".deck-root");
  const probe = document.createElement("div");
  root.appendChild(probe);
  const resolveColor = (value) => {
    probe.style.color = value;
    return getComputedStyle(probe).color;
  };
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const paint = (...layers) => {
    ctx.clearRect(0, 0, 1, 1);
    for (const c of layers) {
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
    }
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const lum = ([r, g, b]) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
  };
  const t = (name) => resolveColor(`var(${name})`);
  const bg = paint("#fff", t("--deck-bg"));
  const surface = paint("#fff", t("--deck-bg"), t("--deck-surface"));
  const codeBg = paint("#fff", t("--deck-bg"), t("--deck-code-bg"));
  const over = (fg, ground) => paint(`rgb(${ground.join(",")})`, fg);
  const pairs = {
    "fg/bg": ratio(over(t("--deck-fg"), bg), bg),
    "muted/bg": ratio(over(t("--deck-muted"), bg), bg),
    "accent/bg": ratio(over(t("--deck-accent"), bg), bg),
    "fg/surface": ratio(over(t("--deck-fg"), surface), surface),
    "muted/surface": ratio(over(t("--deck-muted"), surface), surface),
    "code-fg/code-bg": ratio(over(t("--deck-code-fg"), codeBg), codeBg),
  };
  probe.remove();
  return pairs;
}

/** In the page: what leaves the present slide, a layout taller than its box, code that scrolls. */
function measureOverflow() {
  const slide = document.querySelector(".deck-slide.is-present");
  if (!slide) return ["no present slide"];
  const box = slide.getBoundingClientRect();
  const scale = box.width / slide.offsetWidth || 1;
  const found = [];
  const skip = (el) =>
    el.closest(
      "[aria-hidden='true'], .deck-layer, .deck-slide-background, .deck-layout-image-pane, .deck-code-copy, .katex-mathml, .deck-click.is-hidden",
    );
  for (const el of slide.querySelectorAll("*")) {
    if (skip(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const tol = 2;
    if (
      r.right > box.right + tol ||
      r.bottom > box.bottom + tol ||
      r.left < box.left - tol ||
      r.top < box.top - tol
    ) {
      const what = `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(" ").join(".")}` : ""}`;
      found.push(`${what} leaves the slide`);
      if (found.length > 4) break;
    }
  }
  // content past the layout's box runs into the slide's padding: measured on what flows, so a
  // decoration hung outside on purpose (a wave along the edge) is not counted
  const layout = slide.querySelector(".deck-layout");
  if (layout && !layout.matches("[class*='deck-layout-image'], [class*='deck-layout-iframe']")) {
    const lr = layout.getBoundingClientRect();
    for (const c of layout.querySelectorAll(
      ":scope > *, :scope > [class*='deck-slot'] > *, :scope > [class*='-body'] > *",
    )) {
      if (skip(c) || getComputedStyle(c).position === "absolute") continue;
      const r = c.getBoundingClientRect();
      if (r.height && r.bottom > lr.bottom + 4) {
        found.push(
          `content runs ${Math.round((r.bottom - lr.bottom) / scale)}px past the layout's box`,
        );
        break;
      }
    }
  }
  // the engine's auto-fit scales a layout whose content is taller than the slide: a preview deck
  // is written to fit, so a fitted slide means the theme's decoration or rhythm overflows
  if (layout?.classList.contains("is-fitted"))
    found.push(
      `the auto-fit shrank it to ${getComputedStyle(layout).getPropertyValue("--deck-fit")}`,
    );
  for (const pre of slide.querySelectorAll("pre.deck-code"))
    if (pre.scrollWidth > pre.clientWidth + 4) found.push("a code block scrolls sideways");
  void scale;
  return [...new Set(found)];
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
}

const browser = await chromium.launch();
try {
  for (const [i, name] of themes.entries()) {
    const dir = join(root, "packages", `theme-${name}`);
    const port = port0 + (i % 10);
    const url = `http://localhost:${port}/`;
    const vite = startVite(dir, port);
    let stderr = "";
    vite.stderr.on("data", (d) => (stderr += d));
    const entry = (report[name] = { contrast: {}, overflow: {}, errors: [] });
    try {
      await waitFor(url);
      for (const scheme of ["light", "dark"]) {
        const ctx = await browser.newContext({ viewport: { width: W, height: H } });
        await ctx.addInitScript((s) => {
          try {
            localStorage.setItem("deck.scheme.deck", s);
          } catch {}
        }, scheme);
        const page = await ctx.newPage();
        // the viewer's own buttons are not the theme's: the pictures leave them out
        await page.addInitScript(() => {
          const hide = () => {
            const style = document.createElement("style");
            style.textContent =
              ".deck-controls, .deck-theme-button { visibility: hidden !important; }";
            document.head.appendChild(style);
          };
          if (document.head) hide();
          else document.addEventListener("DOMContentLoaded", hide);
        });
        page.on("console", (m) => {
          if (m.type() !== "error") return;
          const text = m.text();
          // fonts are fetched from Google; offline, they fail without breaking anything
          if (
            /fonts\.(googleapis|gstatic)|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/.test(text)
          )
            return;
          entry.errors.push(`${scheme}: ${text.slice(0, 200)}`);
        });
        page.on("pageerror", (e) => entry.errors.push(`${scheme}: ${e.message}`));
        await page.goto(url);
        await page.waitForSelector(".deck-slide.is-present", { timeout: 60_000 });
        await settle(page);
        // the slide count: End goes to the last slide, whose hash is its index
        await page.keyboard.press("End");
        await page.waitForTimeout(400);
        const count = await page.evaluate(
          () => Number(/^#\/(\d+)/.exec(location.hash)?.[1] ?? 0) + 1,
        );
        await page.evaluate(() => (location.hash = "#/0"));
        entry.contrast[scheme] = await page.evaluate(measureContrast);
        for (const [pair, r] of Object.entries(entry.contrast[scheme]))
          if (/^(fg|muted)\/(bg|surface)$|^code-fg/.test(pair) && r < 4.5)
            problems.push(`${name} ${scheme}: ${pair} contrast ${r} < 4.5`);
        const slides = only ?? Array.from({ length: count }, (_, k) => k);
        for (const k of slides) {
          await page.evaluate((h) => (location.hash = `#/${h}`), k);
          await page.waitForTimeout(150);
          await settle(page);
          const file = join(out, `${name}-${scheme}-${String(k).padStart(2, "0")}.png`);
          await page.screenshot({ path: file });
          const over = await page.evaluate(measureOverflow);
          if (over.length) {
            entry.overflow[`${scheme}-${k}`] = over;
            problems.push(`${name} ${scheme} slide ${k}: ${over.join("; ")}`);
          }
        }
        if (!flag("--no-views")) {
          await page.goto(`${url}presenter#/2`);
          await page.waitForSelector(".deck-presenter", { timeout: 30_000 });
          await settle(page);
          await page.screenshot({ path: join(out, `${name}-${scheme}-presenter.png`) });
          await page.goto(`${url}?print-pdf`);
          await page.waitForSelector(".deck-print-pages[data-ready]", { timeout: 60_000 });
          await settle(page);
          const first = page.locator(".deck-print-page").nth(2);
          await first.screenshot({ path: join(out, `${name}-${scheme}-print.png`) });
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto(`${url}?view=scroll#/4`);
          await page.waitForSelector(".deck-slide", { timeout: 30_000 });
          await settle(page);
          await page.screenshot({ path: join(out, `${name}-${scheme}-phone.png`) });
        }
        await ctx.close();
      }
    } catch (e) {
      problems.push(
        `${name}: ${e.message.split("\n")[0]}${stderr ? `\n${stderr.slice(-600)}` : ""}`,
      );
    } finally {
      vite.kill();
    }
    for (const e of entry.errors) problems.push(`${name}: console ${e}`);
    const c = entry.contrast;
    console.log(
      `${name.padEnd(10)} light ${JSON.stringify(c.light ?? {})}\n${"".padEnd(10)} dark  ${JSON.stringify(c.dark ?? {})}`,
    );
  }

  // ── contact sheets ──
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const img = (f) => encodeURI(f);
  const sheet = async (file, rows, cols, cellW, label) => {
    const cellH = Math.round((cellW * 9) / 16);
    const html = `<body style="margin:0;background:#111;font:600 14px system-ui;color:#ddd">
      <div style="display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:10px;padding:14px">
      ${rows
        .flat()
        .map(
          ([f, cap]) =>
            `<figure style="margin:0"><img src="${img(f)}" style="width:${cellW}px;height:${cellH}px;display:block;border-radius:6px;background:#222"><figcaption style="padding:4px 2px 0">${cap}</figcaption></figure>`,
        )
        .join(
          "",
        )}</div>${label ? `<p style="padding:0 14px 12px;margin:0">${label}</p>` : ""}</body>`;
    // a file page, so the file:// screenshots may load into it
    const htmlFile = join(out, "_sheet.html");
    writeFileSync(htmlFile, html);
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
    await page.screenshot({ path: join(out, file), fullPage: true });
    rmSync(htmlFile);
  };
  for (const name of themes) {
    const files = readdirSync(out)
      .filter((f) => new RegExp(`^${name}-(light|dark)-\\d+\\.png$`).test(f))
      .sort((a, b) => {
        const [, sa, na] = /-(light|dark)-(\d+)/.exec(a);
        const [, sb, nb] = /-(light|dark)-(\d+)/.exec(b);
        return Number(na) - Number(nb) || sa.localeCompare(sb);
      });
    if (files.length)
      await sheet(`${name}-sheet.png`, [files.map((f) => [f, f.replace(".png", "")])], 6, 300);
  }
  // each package's README picture: the cover (light), body text (dark), code (light) and the
  // theme's first own slide (dark, slide 18: the preview decks share their first eighteen)
  if (flag("--readme"))
    for (const name of themes) {
      const four = [
        [0, "light"],
        [1, "dark"],
        [2, "light"],
        [18, "dark"],
      ]
        .map(([k, s]) => `${name}-${s}-${String(k).padStart(2, "0")}.png`)
        .filter((f) => existsSync(join(out, f)));
      if (four.length < 4) continue;
      const html = `<body style="margin:0;background:#0d0d0d"><div style="display:grid;grid-template-columns:repeat(2,640px);gap:0">${four
        .map((f) => `<img src="${img(f)}" style="width:640px;height:360px;display:block">`)
        .join("")}</div></body>`;
      const htmlFile = join(out, "_card.html");
      writeFileSync(htmlFile, html);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
      await page.screenshot({
        path: join(root, "packages", `theme-${name}`, "screenshot.jpg"),
        type: "jpeg",
        quality: 82,
      });
      rmSync(htmlFile);
    }
  await page.setViewportSize({ width: 1600, height: 900 });

  // the gallery: per theme, its cover in both schemes, then content, code, two columns, a header
  const pick = [
    [0, "light"],
    [0, "dark"],
    [1, "light"],
    [2, "dark"],
    [3, "light"],
    [4, "dark"],
  ];
  const cells = themes.flatMap((n) =>
    pick
      .map(([k, s]) => `${n}-${s}-${String(k).padStart(2, "0")}.png`)
      .filter((f) => existsSync(join(out, f)))
      .map((f) => [f, f.replace(".png", "")]),
  );
  if (cells.length) await sheet("contact-sheet.png", [cells], 6, 300, "Kadal Deck themes");
  await page.close();
} finally {
  await browser.close();
}

console.log(
  problems.length
    ? `\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`
    : "\nno problems",
);
process.exit(problems.length ? 1 : 0);
