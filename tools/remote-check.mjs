#!/usr/bin/env node
/**
 * The phone remote, end to end, through `kadal-deck dev`'s relay — no room, no network.
 *
 *   node tools/remote-check.mjs                 the starter deck
 *   node tools/remote-check.mjs --deck showcase the showcase deck
 *   node tools/remote-check.mjs --room http://127.0.0.1:8797
 *                                               the same, through a deck host's room (a local
 *                                               deck-worker, proxied at /api as the starter's
 *                                               vite.config does) instead of the dev server's relay
 *   TRACE=1 node tools/remote-check.mjs …       also print every socket and pairing message
 *   node tools/remote-check.mjs --out <dir>     where the phone's screenshots go
 *                                               (default <deck>/check-output, gitignored)
 *
 * A desktop context holds the presenter view and the play window (one browser, so the window bus
 * joins them); a phone-sized touch context (390×844) opens the URL the presenter view's "Phone
 * remote" dialog shows. Then: Next moves the presenter and the play window, a touch on the phone's
 * slide puts the laser on the same spot of both, blackout goes on and off, the pen draws a stroke
 * both show, the air pointer follows simulated deviceorientation events, zoom zooms the play
 * window. Then one phone at a time: the code on the QR changes once used, a second phone (an
 * "iPhone", whose motion sensors open only from a tap, as WebKit's do) takes over and the first is
 * told, the iPhone allows motion with a tap and points, a reload keeps it paired (its lease), and
 * Disconnect un-pairs it for good. No console error anywhere.
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
const roomApi = val("--room", null);
// The host's word (window.__KADAL_DECK__), as a deck host writes it into the page it serves.
const roomName = `remote-check-${Date.now().toString(36)}`;
const hostWord = (ctx) =>
  roomApi
    ? ctx.addInitScript(
        (room) => {
          window.__KADAL_DECK__ = { api: "/api", room };
        },
        roomName,
      )
    : null;

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
  env: { ...process.env, KADAL_DECK_API: roomApi ?? "" },
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
await hostWord(desk);
await hostWord(phoneCtx);
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
// An iPhone, as far as the motion sensors go: WebKit's requestPermission() prompts only from a tap
// (a click or touchend); from the press that starts a hold (touchstart/pointerdown) it refuses
// without showing anything — which is what the remote used to do. Chromium is more generous
// (a touch's pointerdown already counts as activation), so the event is checked instead.
const iosCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
await iosCtx.addInitScript(() => {
  if (typeof DeviceOrientationEvent === "undefined") return;
  window.__motionAsks = [];
  DeviceOrientationEvent.requestPermission = () => {
    const tapped = ["click", "touchend", "pointerup"].includes(window.event?.type ?? "");
    window.__motionAsks.push(tapped ? "asked" : "refused");
    return tapped
      ? Promise.resolve("granted")
      : Promise.reject(new DOMException("requires a user gesture to prompt", "NotAllowedError"));
  };
});
await hostWord(iosCtx);
const ios = await iosCtx.newPage();
watch(ios, "iphone");
const tap = (name, page) =>
  page.on("websocket", (ws) => {
    const sock = Math.random().toString(36).slice(2, 6);
    console.log(`[${name} open ${sock}] ${ws.url().slice(0, 120)}`);
    ws.on("close", () => console.log(`[${name} close ${sock}]`));
    const log = (dir) => (f) => {
      const d = String(f.payload);
      if (d.includes("kadal:remote") || /"type":"(hello|welcome|command|remote:[a-z]+)"/.test(d)) console.log(`[${name} ${sock} ${dir}] ${d.slice(0, 220)}`);
    };
    ws.on("framesent", log("→"));
    ws.on("framereceived", log("←"));
  });
if (process.env.TRACE) {
  tap("presenter", presenter);
  tap("phone", phone);
  tap("play", play);
  tap("iphone", ios);
}
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
  const shape = roomApi ? /\/remote#pair=[A-Z2-9]{20}$/ : /\/remote\?pair=[A-Z2-9]{6}$/;
  expect(pairUrl && shape.test(pairUrl), `pair url: ${pairUrl}`);
});

await step("the phone pairs, and the presenter hears it", async () => {
  await phone.goto(pairUrl, { waitUntil: "networkidle" });
  await phone.waitForSelector(".deck-remote-status.is-open", { timeout: 10_000 }).catch(async (e) => {
    current.detail.push(`phone shows: ${(await phone.locator("body").innerText()).slice(0, 300)}`);
    current.detail.push(`phone url: ${phone.url()}`);
    throw e;
  });
  const count = await until(() =>
    presenter.locator(".deck-remote-dialog [data-remotes='1']").count(),
  );
  expect(count, "the dialog does not count the phone");
  const toast = await presenter.locator(".deck-toast").innerText();
  expect(/Phone remote connected/.test(toast), `toast: ${toast}`);
  // The code on screen worked once: the QR shows the next one, and says when it changes.
  const next = await until(async () => {
    const u = await presenter.locator("[data-remote-url]").getAttribute("data-remote-url");
    return u && u !== pairUrl ? u : null;
  });
  expect(next, "the QR still shows the code the phone used");
  expect(
    await presenter.locator(".deck-remote-countdown").count(),
    "no countdown to the next code",
  );
  await presenter.locator(".deck-remote-dialog-panel").screenshot({ path: join(out, "presenter-dialog.png") });
  expect(!/[?&]pair=/.test(phone.url()), `the used code stayed in the phone's URL: ${phone.url()}`);
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
  // With a room the play window draws the ROOM's pointer (not its own laser state): its dot is
  // checked below.
  for (const [name, page] of roomApi ? [["presenter", presenter]] : [["presenter", presenter], ["play", play]]) {
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
  expect(await until(async () => (await play.locator(".deck-pointer").count()) === 1), "no laser dot on the play window");
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
  // The play window zooms with the presenter view: through the room with one, over the window bus
  // on the dev relay.
  const zoomed = play;
  const z = await until(async () => (await ui(zoomed)).zoom);
  expect(z && near(z.x / (await zoomed.evaluate(() => window.__deck.config.width)), 0.25), `zoom ${JSON.stringify(z)}`);
  await until(() => phone.evaluate(() => true));
  await new Promise((r) => setTimeout(r, 300));
  await phone.touchscreen.tap(pad.x + pad.width * 0.5, pad.y + pad.height * 0.5);
  expect(await until(async () => !(await ui(zoomed)).zoom && !(await ui(presenter)).zoom), "did not zoom out");
  await phone.locator("[data-mode='point']").tap();
});

if (roomApi)
  await step("with a room: a screen reading on its own keeps its zoom; following again catches up", async () => {
    await play.evaluate(() => window.__deck.nav.update((s) => ({ ...s, follow: false })));
    await phone.locator("[data-mode='zoom']").tap();
    const pad = await boxOf(phone, ".deck-remote-pad");
    await phone.touchscreen.tap(pad.x + pad.width * 0.75, pad.y + pad.height * 0.25);
    expect(await until(async () => (await ui(presenter)).zoom), "the presenter view did not zoom");
    await new Promise((r) => setTimeout(r, 500));
    expect(!(await ui(play)).zoom, "a screen that is not following was zoomed");
    await play.evaluate(() => window.__deck.nav.update((s) => ({ ...s, follow: true })));
    expect(await until(async () => (await ui(play)).zoom), "following again did not catch up with the zoom");
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

const currentUrl = async () => {
  await presenter.getByRole("button", { name: /Phone remote/ }).click();
  const u = await until(() => presenter.locator("[data-remote-url]").getAttribute("data-remote-url"));
  await presenter.keyboard.press("Escape");
  return u;
};

await step("a second phone takes over; the first is told and cannot drive", async () => {
  await ios.goto(await currentUrl(), { waitUntil: "networkidle" });
  await ios.waitForSelector(".deck-remote-status.is-open", { timeout: 10_000 });
  expect(
    await until(() => phone.locator(".deck-remote-instructions", { hasText: "Another phone" }).count()),
    "the first phone was not told it was replaced",
  );
  await phone.screenshot({ path: join(out, "remote-taken-over.png") });
  const count = await presenter.locator("[data-remotes]").first().getAttribute("data-remotes");
  expect(count === "1", `the presenter counts ${count} phones`);
});

await step("on an iPhone, motion is allowed with a tap, then the hold points", async () => {
  const air = ios.locator(".deck-remote-air");
  expect(
    await until(() => ios.locator(".deck-remote-air[data-motion='unknown']").count()),
    `the air button does not ask first: ${await air.innerText()}`,
  );
  await ios.screenshot({ path: join(out, "remote-iphone-allow-motion.png") });
  await air.tap();
  expect(
    await until(() => ios.locator(".deck-remote-air:not([data-motion])").count()),
    `the tap did not allow motion: ${await air.innerText()}`,
  );
  const asks = await ios.evaluate(() => window.__motionAsks);
  expect(asks.join() === "asked", `requestPermission calls: ${asks.join() || "none"}`);
  const box = await air.boundingBox();
  const cdp = await iosCtx.newCDPSession(ios);
  const point = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point });
  await until(() => ios.locator(".deck-remote-air[data-holding]").count());
  const tilt = (alpha, beta) =>
    ios.evaluate(
      ([a, b]) => window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: a, beta: b, gamma: 0, absolute: false })),
      [alpha, beta],
    );
  await tilt(100, 10);
  for (let i = 0; i < 25; i++) {
    await tilt(90, 15);
    await new Promise((r) => setTimeout(r, 20));
  }
  const u = await until(async () => {
    const s = await ui(presenter);
    return s.laser && near(s.laser.x, 0.75, 0.04) ? s : null;
  }, 3000);
  expect(u, `the iPhone's laser is at ${JSON.stringify((await ui(presenter)).laser)}`);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(await until(async () => !(await ui(presenter)).pointer), "letting go left the laser on");
  const after = await ios.evaluate(() => window.__motionAsks);
  expect(after.length === 1, `the hold asked again: ${after.join()}`);
});

await step("a reload keeps the phone paired (its lease), with no code in the URL", async () => {
  await ios.reload({ waitUntil: "networkidle" });
  await ios.waitForSelector(".deck-remote-status.is-open", { timeout: 10_000 });
  const before = await pos(presenter);
  await ios.locator(".deck-remote-next").tap();
  expect(
    await until(async () => {
      const p = await pos(presenter);
      return p.h !== before.h || p.click !== before.click || p.v !== before.v;
    }),
    "the reloaded phone cannot drive",
  );
});

await step("Disconnect un-pairs the phone for good and changes the code", async () => {
  await presenter.getByRole("button", { name: /Phone remote/ }).click();
  const shown = await until(() => presenter.locator("[data-remote-url]").getAttribute("data-remote-url"));
  await presenter.locator(".deck-remote-dialog button", { hasText: "Disconnect" }).click();
  expect(await until(() => ios.locator(".deck-remote-instructions", { hasText: "Not paired" }).count()), "the phone was not told");
  const next = await until(async () => {
    const u = await presenter.locator("[data-remote-url]").getAttribute("data-remote-url");
    return u && u !== shown ? u : null;
  });
  expect(next, "the code did not change");
  expect(
    await until(async () => (await presenter.locator("[data-remotes]").first().getAttribute("data-remotes")) === "0"),
    "the presenter still counts a phone",
  );
  await presenter.keyboard.press("Escape");
  // Its lease is void: a reload does not bring it back.
  await ios.reload({ waitUntil: "networkidle" });
  await new Promise((r) => setTimeout(r, 800));
  expect(!(await ios.locator(".deck-remote-status.is-open").count()), "the disconnected phone came back");
});

await step("no console errors", async () => {
  expect(errors.length === 0, errors.slice(0, 6).join("\n       "));
});

await browser.close();
stop();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} remote checks passed · screenshots in ${out}`);
process.exit(failed.length ? 1 : 0);
