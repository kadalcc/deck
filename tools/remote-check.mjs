#!/usr/bin/env node
/**
 * The phone remote, end to end, through `kadal-deck dev`'s relay — no room, no network.
 *
 *   node tools/remote-check.mjs                 the starter deck
 *   node tools/remote-check.mjs --deck showcase the showcase deck
 *   node tools/remote-check.mjs --out <dir>     where the phone's screenshots go
 *                                               (default <deck>/check-output, gitignored)
 *
 * A desktop context holds the presenter view and the play window (one browser, so the window bus
 * joins them); a phone-sized touch context (390×844) opens the URL the presenter view's "Phone
 * remote" dialog shows. Then: Next moves the presenter and the play window, a touch on the phone's
 * slide puts the laser on the same spot of both, blackout goes on and off, the pen draws a stroke
 * both show, the air pointer follows simulated deviceorientation events, zoom zooms the play
 * window, Disconnect un-pairs the phone. No console error anywhere.
 *
 * Needs the engine built (`bun run build`) and Playwright's Chromium.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const val = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const deckName = val("--deck", "starter");
const deckDir = join(root, "examples", deckName);
const out = resolve(val("--out", join(deckDir, "check-output")));
mkdirSync(out, { recursive: true });
const port = Number(val("--port", 5391));

const results = [];
let current = null;
async function step(name, fn) {
  const t = Date.now();
  current = { name, ok: true, detail: [] };
  try {
    await fn();
  } catch (e) {
    current.ok = false;
    current.detail.push(`threw: ${String(e?.message ?? e).split("\n")[0].slice(0, 240)}`);
  }
  results.push(current);
  console.log(
    `${current.ok ? "ok  " : "FAIL"} ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)${current.detail.length ? `\n       ${current.detail.join("\n       ")}` : ""}`,
  );
}
function expect(cond, message) {
  if (!cond) {
    current.ok = false;
    current.detail.push(message);
  }
  return !!cond;
}
async function until(fn, ms = 5000, every = 50) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, every));
  }
  return last;
}
const near = (a, b, tol = 0.03) => Math.abs(a - b) <= tol;

// ── the dev server ─────────────────────────────────────────────────────────
const bin = join(root, "packages/deck/dist/cli/bin.js");
const server = spawn(process.execPath, [bin, "dev", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
  cwd: deckDir,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, KADAL_DECK_API: "" },
  // Its own process group: the CLI runs Vite as a child, and both must go when we do.
  detached: true,
});
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));
let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
};
process.on("exit", stop);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

const base = await until(() => {
  // eslint-disable-next-line no-control-regex
  const m = /Local:\s+(http:\/\/127\.0\.0\.1:\d+\/\S*)/.exec(log.replace(/\x1b\[[0-9;]*m/g, ""));
  return m ? m[1].replace(/\/?$/, "/") : null;
}, 60_000, 200);
if (!base) {
  console.error(`the dev server did not start:\n${log.slice(-2000)}`);
  process.exit(1);
}
console.log(`serve  ${base}`);

// ── browsers ───────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const desk = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const phoneCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const errors = [];
const watch = (page, name) => {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${name}: ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => errors.push(`${name}: ${String(e).slice(0, 200)}`));
};

const presenter = await desk.newPage();
watch(presenter, "presenter");
const play = await desk.newPage();
watch(play, "play");
const phone = await phoneCtx.newPage();
watch(phone, "phone");
const touch = await phoneCtx.newCDPSession(phone);

const pos = (page) => page.evaluate(() => {
  const s = window.__deck.nav.get();
  return { h: s.h, v: s.v, click: s.click, paused: s.paused };
});
const ui = (page) => page.evaluate(() => {
  const u = window.__deck.ui.get();
  return { pointer: u.pointer, laser: u.laser, spotlight: u.spotlight, zoom: u.zoom };
});
const finger = async (type, points) =>
  touch.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map(([x, y]) => ({ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 })),
  });
const boxOf = async (page, selector) => {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no ${selector}`);
  return b;
};

let pairUrl = null;

await step("presenter view and play window load", async () => {
  await play.goto(base, { waitUntil: "networkidle" });
  await presenter.goto(`${base}presenter`, { waitUntil: "networkidle" });
  await presenter.waitForSelector(".deck-presenter-tools");
  expect(await play.evaluate(() => !!window.__deck), "the play window has no runtime");
});

await step("a remote without a code explains itself", async () => {
  await phone.goto(`${base}remote`, { waitUntil: "networkidle" });
  const text = await phone.locator(".deck-remote-instructions").innerText();
  expect(/Phone remote/.test(text) && /Scan/.test(text), `instructions read: ${text.slice(0, 120)}`);
  const bad = await phoneCtx.newPage();
  watch(bad, "bad-code");
  await bad.goto(`${base}remote?pair=AAAAAA`, { waitUntil: "networkidle" });
  const denied = await until(() => bad.locator(".deck-remote-instructions").count());
  expect(denied, "a wrong code was not refused");
  await bad.close();
});

await step("the Phone remote dialog shows a QR and a pairing URL", async () => {
  await presenter.getByRole("button", { name: /Phone remote/ }).click();
  await presenter.waitForSelector(".deck-remote-dialog img.deck-qr", { timeout: 10_000 });
  pairUrl = await until(() => presenter.locator("[data-remote-url]").getAttribute("data-remote-url"));
  expect(pairUrl && /\/remote\?pair=[A-Z2-9]{6}$/.test(pairUrl), `pair url: ${pairUrl}`);
});

await step("the phone pairs, and the presenter hears it", async () => {
  await phone.goto(pairUrl, { waitUntil: "networkidle" });
  await phone.waitForSelector(".deck-remote-status.is-open", { timeout: 10_000 });
  const count = await until(() =>
    presenter.locator(".deck-remote-dialog [data-remotes='1']").count(),
  );
  expect(count, "the dialog does not count the phone");
  const toast = await presenter.locator(".deck-toast").innerText();
  expect(/Phone remote connected/.test(toast), `toast: ${toast}`);
  await presenter.keyboard.press("Escape");
  await phone.waitForSelector(".deck-remote-canvas .deck-slide", { timeout: 10_000 });
  await phone.screenshot({ path: join(out, "remote-portrait.png") });
});

await step("Next moves the presenter, the play window and the phone", async () => {
  const before = await pos(presenter);
  await phone.locator(".deck-remote-next").tap();
  const after = await until(async () => {
    const p = await pos(presenter);
    return p.h !== before.h || p.click !== before.click ? p : null;
  });
  expect(after, `presenter stayed at ${JSON.stringify(before)}`);
  for (let i = 0; i < 2; i++) await phone.locator(".deck-remote-next").tap();
  const p = await until(async () => {
    const x = await pos(presenter);
    return x.h >= 2 ? x : null;
  });
  expect(p, "three Nexts did not reach the third slide");
  const mirrored = await until(async () => {
    const [a, b] = [await pos(presenter), await pos(play)];
    return a.h === b.h && a.v === b.v && a.click === b.click;
  });
  expect(mirrored, "the play window did not follow");
  const shown = await until(async () => {
    const t = await phone.locator("[data-testid='remote-position']").innerText();
    const s = await presenter.evaluate(async () => (await window.__deck.commands.run("deck.state")).value.slide);
    return t.startsWith(`${s.index + 1} /`) && (!s.clicks || t.includes(`step ${s.click}/${s.clicks}`)) ? t : null;
  });
  expect(shown, "the phone's header does not show the slide");
  await phone.locator(".deck-remote-prev").tap();
  const back = await until(async () => {
    const x = await pos(presenter);
    return x.h < p.h || x.click < p.click ? x : null;
  });
  expect(back, "Back did nothing");
});

await step("a finger on the phone's slide is the laser, on the same spot, on both screens", async () => {
  const pad = await boxOf(phone, ".deck-remote-pad");
  const fx = 0.3;
  const fy = 0.62;
  const x = pad.x + pad.width * fx;
  const y = pad.y + pad.height * fy;
  await finger("touchStart", [[x, y]]);
  for (const [name, page] of [["presenter", presenter], ["play", play]]) {
    const u = await until(async () => {
      const s = await ui(page);
      return s.pointer && s.laser ? s : null;
    });
    expect(u && near(u.laser.x, fx) && near(u.laser.y, fy), `${name} laser at ${JSON.stringify(u?.laser)} not ${fx},${fy}`);
  }
  const dot = await presenter.locator(".deck-presenter-canvas .deck-pointer").count();
  expect(dot === 1, "no laser dot on the presenter's slide");
  // Where the dot is, as a fraction of the presenter's canvas.
  const at = await presenter.evaluate(() => {
    const canvas = document.querySelector(".deck-presenter-canvas").getBoundingClientRect();
    const d = document.querySelector(".deck-presenter-canvas .deck-pointer").getBoundingClientRect();
    return { x: (d.left + d.width / 2 - canvas.left) / canvas.width, y: (d.top + d.height / 2 - canvas.top) / canvas.height };
  });
  expect(near(at.x, fx, 0.05) && near(at.y, fy, 0.05), `the presenter's dot is drawn at ${JSON.stringify(at)}`);
  expect((await play.locator(".deck-pointer").count()) === 1, "no laser dot on the play window");
  // A drag moves it.
  await finger("touchMove", [[x + pad.width * 0.3, y - pad.height * 0.3]]);
  const moved = await until(async () => {
    const s = await ui(presenter);
    return s.laser && near(s.laser.x, 0.6) && near(s.laser.y, 0.32) ? s : null;
  });
  expect(moved, "dragging did not move the laser");
  await finger("touchEnd", []);
  const off = await until(async () => !(await ui(presenter)).pointer && !(await ui(play)).pointer);
  expect(off, "lifting the finger left the laser on");
});

await step("blackout goes on and off", async () => {
  const tools = phone.locator(".deck-remote-tools button", { hasText: "Blackout" });
  await tools.tap();
  expect(await until(async () => (await pos(presenter)).paused), "the presenter did not black out");
  expect(await until(async () => (await pos(play)).paused), "the play window did not black out");
  expect(await until(() => phone.locator(".deck-remote-blackout").count()), "the phone does not show it");
  await tools.tap();
  expect(await until(async () => !(await pos(presenter)).paused && !(await pos(play)).paused), "blackout did not lift");
});

await step("the pen draws a stroke both screens show", async () => {
  const count = (page, sel) => page.locator(sel).count();
  const pBefore = await count(presenter, ".deck-presenter-canvas svg.deck-drawing path");
  const dBefore = await count(play, "svg.deck-drawing path");
  await phone.locator("[data-mode='pen']").tap();
  const pad = await boxOf(phone, ".deck-remote-pad");
  const pts = Array.from({ length: 12 }, (_, i) => [pad.x + pad.width * (0.2 + i * 0.05), pad.y + pad.height * (0.5 + Math.sin(i / 2) * 0.15)]);
  await finger("touchStart", [pts[0]]);
  for (const p of pts.slice(1)) {
    await finger("touchMove", [p]);
    await new Promise((r) => setTimeout(r, 30));
  }
  await finger("touchEnd", []);
  const drawn = await until(async () => (await count(presenter, ".deck-presenter-canvas svg.deck-drawing path")) > pBefore);
  expect(drawn, "no stroke on the presenter");
  const mirrored = await until(async () => (await count(play, "svg.deck-drawing path")) > dBefore);
  expect(mirrored, "no stroke on the play window");
  const span = await presenter.evaluate(() => {
    const strokes = [...document.querySelectorAll(".deck-presenter-canvas svg.deck-drawing > g")];
    return strokes.at(-1).getBBox().width;
  });
  expect(span > 400, `the stroke is only ${Math.round(span)}px wide`);
  await phone.locator(".deck-remote-row button", { hasText: "Undo" }).tap();
  await phone.locator("[data-mode='point']").tap();
});

await step("the air pointer follows the phone", async () => {
  const air = await boxOf(phone, ".deck-remote-air");
  await finger("touchStart", [[air.x + air.width / 2, air.y + air.height / 2]]);
  await until(() => phone.locator(".deck-remote-air[data-holding]").count());
  const tilt = (alpha, beta) =>
    phone.evaluate(
      ([a, b]) => window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: a, beta: b, gamma: 0, absolute: false })),
      [alpha, beta],
    );
  await tilt(100, 10); // the centre
  for (let i = 0; i < 25; i++) {
    // turned right 10° and tipped up 5°: with ±20° to the edge, x 0.75 and y 0.375
    await tilt(90, 15);
    await new Promise((r) => setTimeout(r, 20));
  }
  const u = await until(async () => {
    const s = await ui(presenter);
    return s.laser && near(s.laser.x, 0.75, 0.04) && near(s.laser.y, 0.375, 0.04) ? s : null;
  }, 3000);
  expect(u, `the laser is at ${JSON.stringify((await ui(presenter)).laser)}, not 0.75, 0.375`);
  // Across north: centre at 2°, turn right to 358°.
  await finger("touchEnd", []);
  await until(async () => !(await ui(presenter)).pointer);
  await finger("touchStart", [[air.x + air.width / 2, air.y + air.height / 2]]);
  await until(() => phone.locator(".deck-remote-air[data-holding]").count());
  await tilt(2, 0);
  for (let i = 0; i < 25; i++) {
    await tilt(358, 0);
    await new Promise((r) => setTimeout(r, 20));
  }
  const wrapped = await until(async () => {
    const s = await ui(presenter);
    return s.laser && near(s.laser.x, 0.6, 0.04) ? s : null;
  }, 3000);
  expect(wrapped, `across north the laser is at ${JSON.stringify((await ui(presenter)).laser)}, not x 0.6`);
  await finger("touchEnd", []);
  expect(await until(async () => !(await ui(presenter)).pointer), "letting go left the laser on");
});

await step("zoom: a tap zooms the play window in, another zooms out", async () => {
  await phone.locator("[data-mode='zoom']").tap();
  const pad = await boxOf(phone, ".deck-remote-pad");
  await phone.touchscreen.tap(pad.x + pad.width * 0.25, pad.y + pad.height * 0.25);
  const z = await until(async () => (await ui(play)).zoom);
  expect(z && near(z.x / (await play.evaluate(() => window.__deck.config.width)), 0.25), `zoom ${JSON.stringify(z)}`);
  await until(() => phone.evaluate(() => true));
  await new Promise((r) => setTimeout(r, 300));
  await phone.touchscreen.tap(pad.x + pad.width * 0.5, pad.y + pad.height * 0.5);
  expect(await until(async () => !(await ui(play)).zoom && !(await ui(presenter)).zoom), "did not zoom out");
  await phone.locator("[data-mode='point']").tap();
});

await step("notes follow the step; landscape still fits", async () => {
  const notes = await phone.locator(".deck-remote-notes p").innerText();
  expect(notes.length > 0, "no notes text");
  const portraitFits = await phone.evaluate(() =>
    [...document.querySelectorAll(".deck-remote button")].every((b) => {
      const r = b.getBoundingClientRect();
      return r.width === 0 || (r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.left >= -1);
    }),
  );
  expect(portraitFits, "a button sticks out of the portrait screen");
  await phone.setViewportSize({ width: 844, height: 390 });
  await new Promise((r) => setTimeout(r, 300));
  const fits = await phone.evaluate(() => {
    const next = document.querySelector(".deck-remote-next").getBoundingClientRect();
    const stage = document.querySelector(".deck-remote-stage").getBoundingClientRect();
    const inside = [...document.querySelectorAll(".deck-remote button")].every((b) => {
      const r = b.getBoundingClientRect();
      return r.width === 0 || (r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.left >= -1);
    });
    return inside && next.bottom <= innerHeight + 1 && stage.width > 200 && document.documentElement.scrollWidth <= innerWidth;
  });
  expect(fits, "landscape layout overflows");
  await phone.screenshot({ path: join(out, "remote-landscape.png") });
  await phone.setViewportSize({ width: 390, height: 844 });
});

await step("Disconnect un-pairs the phone and retires the code", async () => {
  await presenter.getByRole("button", { name: /Phone remote/ }).click();
  await presenter.locator(".deck-remote-dialog button", { hasText: "Disconnect" }).click();
  expect(await until(() => phone.locator(".deck-remote-instructions", { hasText: "Not paired" }).count()), "the phone was not told");
  const next = await until(async () => {
    const u = await presenter.locator("[data-remote-url]").getAttribute("data-remote-url");
    return u && u !== pairUrl ? u : null;
  });
  expect(next, "the code did not change");
  await presenter.keyboard.press("Escape");
});

await step("no console errors", async () => {
  expect(errors.length === 0, errors.slice(0, 6).join("\n       "));
});

await browser.close();
stop();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} remote checks passed · screenshots in ${out}`);
process.exit(failed.length ? 1 : 0);
