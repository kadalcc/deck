#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ENGINE IN AN OPAQUE ORIGIN, AGAINST A REAL HOST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Publishes tools/opaque-check/deck with this repo's CLI to a LOCAL Kadal Deck host that serves
 * published decks sandboxed (`Content-Security-Policy: sandbox`, no allow-same-origin), then
 * drives it in headless browsers:
 *
 *   presenter     opened the dashboard's way (`/presenter#ticket=…`): no passcode prompt, the
 *                 fragment is wiped, the room welcomes it as presenter
 *   audience      three phone-sized contexts on /join follow the presenter
 *   windows       the presenter's share window (projector) and a play window that opens the
 *                 presenter view with `S` stay in step over the window bus
 *   live room     poll (open, three votes), quiz (start, answer, reveal), Q&A (ask, shows up for
 *                 the presenter), a reaction
 *   passcodes     a viewing passcode (the form, then the deck loads with its files) and a
 *                 presenter passcode (the gate answers with a ticket; no reload)
 *   hygiene       no page errors anywhere; nothing scrolls sideways on a phone
 *
 *   node tools/opaque-check/run.mjs
 *     KADAL_DECK_HOST   the host (default http://localhost:8811); must allow /api/auth/dev
 *     WORKER_DIR        the host's apps/deck-worker folder, for `wrangler d1 execute --local`
 *                       (the viewing passcode needs a paid plan; without it that part is skipped)
 *     BROWSERS          chromium,webkit (default)
 *
 * Build the engine first (`bun run build`): the fixture deck uses packages/deck/dist.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium, webkit } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const fixture = join(import.meta.dirname, "deck");
const HOST = (process.env.KADAL_DECK_HOST ?? "http://localhost:8811").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(HOST))
  throw new Error("opaque-check publishes test decks: point it at a local host only");
const BROWSERS = (process.env.BROWSERS ?? "chromium,webkit").split(",").map((s) => s.trim());
const WORKER_DIR = process.env.WORKER_DIR;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `   (${detail})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, every = 150) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch {
      /* not yet */
    }
    await sleep(every);
  }
  return last;
}

// ── the host: a dev session, a token, the published fixture ────────────────

const run = Date.now().toString(36);
async function devSession(email) {
  const res = await fetch(`${HOST}/api/auth/dev?email=${encodeURIComponent(email)}&next=/app/`, {
    redirect: "manual",
  });
  const set = res.headers.getSetCookie().find((c) => c.startsWith("kd_session="));
  if (!set) throw new Error(`no dev session from ${HOST} (DEV_LOGIN=1?)`);
  return set.split(";")[0];
}
async function asOwner(cookie, method, path, body) {
  const res = await fetch(`${HOST}/api/v1${path}`, {
    method,
    headers: {
      cookie,
      origin: HOST,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const owner = await devSession(`opaque-check-${run}@example.com`);
const ws = (await asOwner(owner, "GET", "/me")).json.current.handle;
for (const t of (await asOwner(owner, "GET", `/workspaces/${ws}/tokens`)).json ?? [])
  await asOwner(owner, "DELETE", `/tokens/${t.id}`);
const token = (await asOwner(owner, "POST", `/workspaces/${ws}/tokens`, { name: "opaque-check" }))
  .json.token;

const modules = join(fixture, "node_modules");
if (!existsSync(modules) && !(() => { try { return lstatSync(modules).isSymbolicLink(); } catch { return false; } })())
  symlinkSync(join(root, "examples/starter/node_modules"), modules);
/** Publish the fixture as a new deck (each browser gets its own room, so no state carries over). */
async function publishFixture(slug) {
  execFileSync(
    process.execPath,
    [join(root, "packages/deck/dist/cli/bin.js"), "publish", "--slug", slug, "--workspace", ws],
    { cwd: fixture, env: { ...process.env, KADAL_DECK_TOKEN: token, KADAL_DECK_HOST: HOST }, stdio: ["ignore", "ignore", "inherit"] },
  );
  const deck = (await asOwner(owner, "GET", `/workspaces/${ws}/decks`)).json.find((d) => d.slug === slug);
  check(`the CLI published ${slug}`, Boolean(deck?.version), deck?.base);
  const head = await fetch(`${HOST}${deck.base}`);
  const csp = head.headers.get("content-security-policy") ?? "";
  check("the host serves it sandboxed (no allow-same-origin)", csp.startsWith("sandbox") && !csp.includes("allow-same-origin"), csp);
  return deck;
}

// ── browsers ────────────────────────────────────────────────────────────────

const errors = [];
const watch = (page, label) => {
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message.slice(0, 160)}`));
};
const nav = (page) => page.evaluate(() => window.__deck?.nav.get());
let deck;
let base;
const snapshot = async () => (await fetch(`${HOST}/api/rooms/${deck.id}`)).json();

for (const name of BROWSERS) {
  deck = await publishFixture(`opaque-${run}-${name}`);
  base = `${HOST}${deck.base}`;
  const kind = { chromium, webkit }[name];
  const browser = await kind.launch();
  const tag = (s) => `${name}: ${s}`;

  // The presenter, the dashboard's way.
  const t = (await asOwner(owner, "POST", `/decks/${deck.id}/presenter-ticket`)).json;
  const pctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const presenter = await pctx.newPage();
  watch(presenter, tag("presenter"));
  await presenter.goto(t.presenter);
  await presenter.waitForSelector(".deck-presenter", { timeout: 15000 });
  check(tag("presenter view opens from a ticket, no passcode prompt"), !(await presenter.$(".deck-gate")));
  check(tag("the ticket is wiped from the address bar"), !(await presenter.evaluate(() => location.href)).includes("ticket="));
  check(tag("the page has an opaque origin"), (await presenter.evaluate(() => self.origin)) === "null");
  const live = await until(async () => (await snapshot()).presence?.presenter);
  check(tag("the room welcomes it as presenter"), Boolean(live));

  // The audience: three phones on /join.
  const phones = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: name === "chromium", hasTouch: true });
    const page = await ctx.newPage();
    watch(page, tag(`phone ${i}`));
    await page.goto(`${base}join`);
    await page.waitForSelector(".deck-audience-tabs", { timeout: 15000 });
    phones.push(page);
  }
  const viewers = await until(async () => ((await snapshot()).presence?.viewers ?? 0) >= 3 && (await snapshot()).presence.viewers);
  check(tag("three phones join the room"), viewers >= 3, String(viewers));
  const wide = await Promise.all(phones.map((p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)));
  check(tag("no sideways scroll on a phone"), wide.every(Boolean));

  await presenter.evaluate(() => window.__deck.actions.next());
  const followed = await until(async () => (await Promise.all(phones.map(nav))).every((s) => s?.h === 1));
  check(tag("phones follow the presenter"), Boolean(followed));

  // The share window (projector), opened from the presenter view.
  const [projector] = await Promise.all([pctx.waitForEvent("page"), presenter.evaluate(() => window.__deck.actions.toggleProjector(true))]);
  watch(projector, tag("projector"));
  await projector.waitForFunction(() => window.__deck, null, { timeout: 15000 });
  await presenter.evaluate(() => window.__deck.actions.next());
  check(tag("the share window follows the presenter"), Boolean(await until(async () => (await nav(projector))?.h === 2)));

  // Poll: the presenter is on the poll slide now (h = 2).
  await presenter.locator(".deck-presenter-current .deck-poll-controls button:visible", { hasText: "Open" }).first().click();
  for (const p of phones) {
    await p.locator(".deck-audience-tabs button", { hasText: /polls/i }).click();
    await p.locator(".deck-audience-polls .deck-poll button", { hasText: "Online" }).first().click({ timeout: 10000 });
  }
  const answered = await until(async () => /3 answers/.test(await presenter.locator(".deck-presenter-current .deck-poll-meta").first().innerText()));
  check(tag("poll: three votes reach the presenter"), Boolean(answered));

  // Quiz.
  await presenter.evaluate(() => window.__deck.actions.next());
  await until(async () => (await nav(presenter))?.h === 3);
  await presenter.locator(".deck-presenter-current .deck-poll-controls button:visible", { hasText: "Start" }).first().click();
  for (const p of phones) await p.locator(".deck-audience-polls button", { hasText: /^2$/ }).first().click({ timeout: 10000 });
  await presenter.locator(".deck-presenter-current .deck-poll-controls button:visible", { hasText: "Close" }).first().click();
  await presenter.locator(".deck-presenter-current .deck-poll-controls button:visible", { hasText: "Reveal" }).first().click();
  const revealed = await until(async () => (await phones[0].locator(".deck-audience-polls li.is-correct").count()) > 0);
  check(tag("quiz: answers in, the reveal reaches the phones"), Boolean(revealed));

  // Q&A and a reaction.
  const before = (await snapshot()).questions ?? 0;
  await phones[1].locator(".deck-audience-tabs button", { hasText: /ask/i }).click();
  await phones[1].fill(".deck-audience-ask textarea", `Is this sandboxed? ${name}`);
  await phones[1].locator(".deck-audience-ask button[type=submit]").click();
  check(tag("Q&A: a question reaches the room"), Boolean(await until(async () => (await snapshot()).questions > before)));
  await presenter.locator(".deck-presenter-room button", { hasText: /questions/i }).first().click();
  check(tag("Q&A: the presenter sees it"), Boolean(await until(async () => (await presenter.locator(".deck-room-questions").innerText()).includes(`Is this sandboxed? ${name}`))));

  // A play window with a ticket opens the presenter view with `S`; the two stay in step.
  const t2 = (await asOwner(owner, "POST", `/decks/${deck.id}/presenter-ticket`)).json;
  const wctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const play = await wctx.newPage();
  watch(play, tag("play"));
  // This window's room connection goes nowhere, so whatever moves it came over the window bus.
  await play.routeWebSocket(/\/api\/rooms\//, () => {});
  await play.goto(t2.present);
  await play.waitForFunction(() => window.__deck, null, { timeout: 15000 });
  const [second] = await Promise.all([wctx.waitForEvent("page"), play.evaluate(() => window.__deck.actions.openPresenter())]);
  watch(second, tag("presenter from S"));
  await second.waitForSelector(".deck-presenter", { timeout: 15000 });
  check(tag("S: the opened presenter view inherits the ticket"), !(await second.$(".deck-gate")));
  await second.evaluate(() => window.__deck.actions.goto(4));
  check(tag("S: the play window follows over the window bus (its room cut off)"), Boolean(await until(async () => (await nav(play))?.h === 4)));
  await play.evaluate(() => window.__deck.actions.goto(5));
  check(tag("an embedded page offers Open (frames inherit the sandbox)"), Boolean(await until(async () => (await play.locator(".deck-frame-open:visible").count()) > 0)));
  await play.evaluate(() => window.__deck.actions.setColorScheme("dark"));
  check(tag("a preference survives a blocked localStorage"), (await play.evaluate(() => window.__deck.ui.get().colorScheme)) === "dark");

  // A presenter passcode, from a machine that isn't signed in.
  await asOwner(owner, "PATCH", `/decks/${deck.id}`, { presenterPasscode: "presenter-pass" });
  const sctx = await browser.newContext();
  const stranger = await sctx.newPage();
  watch(stranger, tag("passcode presenter"));
  await stranger.goto(`${base}presenter`);
  await stranger.waitForSelector(".deck-gate input", { timeout: 15000 });
  await stranger.fill(".deck-gate input", "presenter-pass");
  await stranger.locator(".deck-gate button[type=submit]").click();
  await stranger.waitForSelector(".deck-presenter", { timeout: 15000 });
  check(tag("presenter passcode: the gate opens without a reload"), (await stranger.evaluate(() => performance.getEntriesByType("navigation").length)) === 1);
  await stranger.evaluate(() => window.__deck.actions.goto(1));
  check(tag("presenter passcode: it drives the room"), Boolean(await until(async () => (await nav(phones[2]))?.h === 1)));
  await asOwner(owner, "PATCH", `/decks/${deck.id}`, { presenterPasscode: null });

  for (const c of browser.contexts()) await c.close();
  await browser.close();
  if (name !== BROWSERS.at(-1)) await asOwner(owner, "DELETE", `/decks/${deck.id}`);
}

// ── a viewing passcode ──────────────────────────────────────────────────────

if (!WORKER_DIR) check("viewing passcode: skipped (set WORKER_DIR to the host's apps/deck-worker)", true);
else {
  execFileSync("npx", ["wrangler", "d1", "execute", "deck", "--local", "--persist-to", ".wrangler-state", "--command", `UPDATE workspaces SET plan = 'pro' WHERE handle = '${ws}'`], { cwd: WORKER_DIR, stdio: "ignore" });
  const set = await asOwner(owner, "PATCH", `/decks/${deck.id}`, { visibility: "passcode", viewPasscode: "viewer-pass" });
  check("viewing passcode: set", set.status === 200, String(set.status));
  await sleep(16000); // the host caches a deck's manifest for 15 s
  for (const name of BROWSERS) {
    const browser = await { chromium, webkit }[name].launch();
    const page = await (await browser.newContext()).newPage();
    watch(page, `${name}: passcode viewer`);
    await page.goto(base);
    await page.fill("input[name=passcode]", "viewer-pass");
    await page.locator("form button").click();
    await page.waitForFunction(() => window.__deck, null, { timeout: 15000 });
    check(`${name}: viewing passcode: the deck and its files load in the sandbox`, (await page.evaluate(() => self.origin)) === "null");
    check(`${name}: viewing passcode: it joins the room`, Boolean(await until(async () => ((await snapshot()).presence?.viewers ?? 0) >= 1)));
    await browser.close();
  }
  await asOwner(owner, "PATCH", `/decks/${deck.id}`, { visibility: "public" });
}

check("no page errors in any window", errors.length === 0, errors.slice(0, 5).join(" | "));
await asOwner(owner, "DELETE", `/decks/${deck.id}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
