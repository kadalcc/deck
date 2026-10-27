import type { ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { MissingDependencyError, runVite, spawnVite } from "./vite.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PICTURES OF SLIDES  —  `kadal-deck screenshot` and the MCP server's slide_render
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A deck served by its own Vite (dev for quick turns, or build + preview for exactly what ships),
 * looked at by headless Chromium through the print view, which lays every slide out as a page
 * (a still: clicks revealed, backgrounds at rest) and says when everything has loaded — the same
 * machinery `export` uses. Each page is photographed alone. A server and a browser can stay up between calls, so an agent can
 * edit, look, and edit again for the price of a page load.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// oxlint-disable-next-line no-control-regex -- terminal colour codes in Vite's and Playwright's output
const ANSI = /\u001b\[[0-9;]*m/g;

/** Text without terminal colour codes (Playwright's errors carry them). */
export const stripAnsi = (s: string): string => s.replace(ANSI, "");

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

/** A Vite server for one deck folder: `dev`, or `preview` of a fresh build. */
export class DeckServer {
  private constructor(
    readonly url: string,
    readonly mode: "dev" | "preview",
    private readonly child: ChildProcess,
  ) {}

  static async start(
    dir: string,
    mode: "dev" | "preview",
    {
      build = true,
      timeout = 90_000,
      port: fixed,
      args: extra = [],
    }: {
      build?: boolean;
      timeout?: number;
      /** A port to listen on; any free one when absent. */
      port?: number;
      /** More Vite flags (`--outDir` for a preview of another folder). */
      args?: string[];
    } = {},
  ): Promise<DeckServer> {
    if (mode === "preview" && build) await runVite(dir, ["build"]);
    const port = fixed ?? (await freePort());
    const args =
      mode === "dev"
        ? ["--port", String(port), "--strictPort", "--host", "127.0.0.1", ...extra]
        : ["preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1", ...extra];
    const child = spawnVite(dir, args, "pipe");
    // However we exit, the server goes with us (an orphaned Vite would hold its port forever).
    const reap = () => child.kill();
    process.once("exit", reap);
    child.once("exit", () => process.off("exit", reap));
    let output = "";
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(
          new Error(
            `vite ${mode} did not start within ${timeout / 1000}s:\n${output.slice(-2000)}`,
          ),
        );
      }, timeout);
      const read = (chunk: Buffer) => {
        output += chunk.toString().replace(ANSI, "");
        const m = /Local:\s+(https?:\/\/\S+)/.exec(output);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]!.endsWith("/") ? m[1]! : `${m[1]}/`);
        }
      };
      child.stdout?.on("data", read);
      child.stderr?.on("data", read);
      child.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`vite ${mode} exited (${code}):\n${output.slice(-2000)}`));
      });
    });
    // Keep draining so a chatty server never blocks on a full pipe.
    child.stdout?.resume();
    child.stderr?.resume();
    return new DeckServer(url, mode, child);
  }

  get alive(): boolean {
    return this.child.exitCode === null && !this.child.killed;
  }

  stop(): void {
    if (this.alive) this.child.kill();
  }
}

interface PlaywrightLike {
  chromium: { launch(o?: Record<string, unknown>): Promise<BrowserLike> };
}
interface BrowserLike {
  newContext(o?: Record<string, unknown>): Promise<ContextLike>;
  close(): Promise<void>;
  isConnected(): boolean;
}
interface ContextLike {
  newPage(): Promise<PageLike>;
  addInitScript(script: { content: string }): Promise<void>;
  close(): Promise<void>;
}
interface ElementLike {
  screenshot(o?: Record<string, unknown>): Promise<Buffer>;
  scrollIntoViewIfNeeded(): Promise<void>;
  boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
}
interface PageLike {
  goto(url: string, o?: Record<string, unknown>): Promise<unknown>;
  waitForSelector(sel: string, o?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  waitForLoadState?(state: string, o?: Record<string, unknown>): Promise<void>;
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
  $$(sel: string): Promise<ElementLike[]>;
  screenshot(o?: Record<string, unknown>): Promise<Buffer>;
  on(
    event: string,
    cb: (arg: { type?: () => string; text?: () => string; message?: string }) => void,
  ): void;
}

/** Playwright from the deck's own node_modules first, then from wherever we were installed. */
export async function loadPlaywright(dir: string): Promise<PlaywrightLike> {
  // `require.resolve` finds Playwright's CommonJS entry; Node's `import()` of that gives a
  // namespace whose API sits on `default` (Bun hoists it), so take whichever has `chromium`.
  const api = (mod: unknown): PlaywrightLike | null => {
    const m = mod as { chromium?: unknown; default?: { chromium?: unknown } };
    return (m?.chromium ? m : m?.default?.chromium ? m.default : null) as PlaywrightLike | null;
  };
  try {
    const path = createRequire(join(dir, "package.json")).resolve("playwright");
    const pw = api(await import(pathToFileURL(path).href));
    if (pw) return pw;
  } catch {
    /* not in the deck; try our own */
  }
  try {
    const pw = api(await import("playwright"));
    if (pw) return pw;
  } catch {
    /* not installed */
  }
  throw new MissingDependencyError(
    "Rendering slides needs Playwright and Chromium. In the deck folder run: npm install -D playwright && npx playwright install chromium",
  );
}

export interface RenderRequest {
  /** Slide indexes (0-based, authored order); all slides when omitted. */
  slides?: number[];
  /**
   * Only these slides are laid out at all (the print view's `?range=`, counting visible slides
   * from 1): "1" is the first slide the audience sees, without loading the other hundred.
   */
  range?: string;
  scheme?: "light" | "dark";
  /** A theme the deck ships (see the theme menu). */
  theme?: string;
  /** Pixel width of each picture (default 1280; the slide's own width is 1920). */
  width?: number;
  /**
   * Crop each picture to this width/height ratio around its centre (1200/630 for an Open Graph
   * card: the middle 1920×1008 of a 16:9 slide). Default: the slide's own shape.
   */
  aspect?: number;
  /**
   * Wait for the page to go quiet first (no request for half a second, at most SETTLE_MS): what
   * arrives after the print view is ready — a host's `pro/` items, a late image — is pictured
   * too. Slower by a beat; a deck's picture for a host wants it, an agent's quick look doesn't.
   */
  settle?: boolean;
}

/** The longest `settle` waits for the network, after which the picture is taken anyway. */
export const SETTLE_MS = 10_000;

export interface RenderedSlide {
  index: number;
  click: number;
  width: number;
  height: number;
  png: Buffer;
}

export interface RenderResult {
  shots: RenderedSlide[];
  /** Requested slides that were not rendered (hidden ones, or indexes past the end). */
  missing: number[];
  /** Slides that failed to load, and errors the page logged. */
  errors: string[];
  /**
   * The scheme the deck was drawn in. Asked for one, a deck that follows the viewer (`auto`)
   * answers with it; one with a fixed `colorScheme` answers with its own, whatever was asked.
   */
  scheme: "light" | "dark";
}

export class SlideRenderer {
  private browser: BrowserLike | null = null;

  constructor(
    private readonly dir: string,
    private readonly baseUrl: () => string,
  ) {}

  /** One browser per renderer: concurrent renders wait for the same launch. */
  private launching: Promise<BrowserLike> | null = null;

  private async open(): Promise<BrowserLike> {
    if (this.browser?.isConnected()) return this.browser;
    if (!this.launching) {
      this.launching = this.launch().finally(() => {
        this.launching = null;
      });
    }
    return this.launching;
  }

  private async launch(): Promise<BrowserLike> {
    const pw = await loadPlaywright(this.dir);
    try {
      this.browser = await pw.chromium.launch({
        args: [
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
          "--ignore-gpu-blocklist",
        ],
      });
    } catch (e) {
      const msg = stripAnsi(e instanceof Error ? e.message : String(e));
      if (/Executable doesn't exist|playwright install/i.test(msg))
        throw new MissingDependencyError(
          "Playwright is installed but Chromium is not. Run: npx playwright install chromium",
        );
      throw new Error(msg);
    }
    return this.browser;
  }

  async render(req: RenderRequest = {}): Promise<RenderResult> {
    const browser = await this.open();
    const width = Math.max(320, Math.min(3840, req.width ?? 1280));
    const context = await browser.newContext({
      viewport: { width: 1952, height: 1100 },
      deviceScaleFactor: width / 1920,
      colorScheme: req.scheme ?? "light",
      reducedMotion: "reduce",
    });
    const forced: Record<string, string> = {};
    if (req.scheme) forced.scheme = req.scheme;
    if (req.theme) forced.theme = req.theme;
    // The theme menu remembers its choice in localStorage; answer for it.
    await context.addInitScript({
      content: `(() => {
        const forced = ${JSON.stringify(forced)};
        const get = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) {
          const m = /^deck\\.(scheme|theme)\\./.exec(String(key));
          if (m && forced[m[1]]) return forced[m[1]];
          return get.call(this, key);
        };
      })();`,
    });
    const errors: string[] = [];
    try {
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`page error: ${e.message ?? String(e)}`));
      page.on("console", (m) => {
        if (m.type?.() === "error") errors.push(`console: ${m.text?.()}`);
      });
      const url = new URL(this.baseUrl());
      url.searchParams.set("print-pdf", "");
      if (req.range) url.searchParams.set("range", req.range);
      await page.goto(url.toString(), { waitUntil: "load", timeout: 120_000 });
      await page.waitForSelector(".deck-print-pages[data-ready]", { timeout: 120_000 });
      // On screen the print view spaces its pages 16px apart, centred, with a shadow. At the
      // picture's scale (1280/1920 by default) 16px is 10.67 device pixels, so every page started
      // mid-pixel and its last column and row were half shadow: a grey edge on every picture.
      // Butted together at the left edge, page n starts at 1080n, a whole pixel at any width that
      // is a multiple of 16.
      await page.evaluate(() => {
        const style = document.createElement("style");
        style.textContent =
          ".deck-print-pages{margin:0!important;padding:0!important}" +
          ".deck-print-page{margin:0!important;box-shadow:none!important}";
        document.head.append(style);
      });
      if (req.settle && page.waitForLoadState)
        await page.waitForLoadState("networkidle", { timeout: SETTLE_MS }).catch(() => {});
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.waitForTimeout(req.settle ? 800 : 400);
      const scheme = await page.evaluate(() =>
        document.documentElement.dataset.colorScheme === "dark" ? "dark" : "light",
      );
      const info = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".deck-print-page")].map((p) => {
          const slide = p.querySelector<HTMLElement>(".deck-slide");
          const error = p.querySelector<HTMLElement>(".deck-slide-error pre");
          return {
            index: slide ? Number(slide.dataset.index) : -1,
            click: slide ? Number(slide.dataset.click ?? 0) : 0,
            notes: p.classList.contains("deck-print-notes-page"),
            width: p.offsetWidth,
            height: p.offsetHeight,
            error: error?.innerText ?? null,
          };
        }),
      );
      const pages = await page.$$(".deck-print-page");
      const byIndex = new Map<number, number[]>();
      info.forEach((p, i) => {
        if (p.notes || p.index < 0) return;
        const list = byIndex.get(p.index) ?? [];
        list.push(i);
        byIndex.set(p.index, list);
      });
      for (const p of info)
        if (p.error) errors.push(`slide ${p.index} failed to load: ${p.error.split("\n")[0]}`);
      const wanted = req.slides ?? [...byIndex.keys()].sort((a, b) => a - b);
      const shots: RenderedSlide[] = [];
      const missing: number[] = [];
      for (const index of wanted) {
        const list = byIndex.get(index);
        if (!list?.length) {
          missing.push(index);
          continue;
        }
        // The print view draws a slide as a still: every click revealed, backgrounds at rest.
        const pick = list[list.length - 1]!;
        const el = pages[pick]!;
        await el.scrollIntoViewIfNeeded();
        const meta = info[pick]!;
        const box = req.aspect ? await el.boundingBox() : null;
        let w = meta.width;
        let h = meta.height;
        let png: Buffer;
        if (box && req.aspect) {
          // The page's coordinates (fullPage), so the clip is where the box is however it scrolled.
          const scrollY = await page.evaluate(() => window.scrollY);
          const scrollX = await page.evaluate(() => window.scrollX);
          w = Math.min(box.width, box.height * req.aspect);
          h = w / req.aspect;
          png = await page.screenshot({
            type: "png",
            animations: "disabled",
            fullPage: true,
            clip: {
              x: box.x + scrollX + (box.width - w) / 2,
              y: box.y + scrollY + (box.height - h) / 2,
              width: w,
              height: h,
            },
          });
        } else png = await el.screenshot({ type: "png", animations: "disabled" });
        shots.push({
          index,
          click: meta.click,
          width: Math.round(w * (width / 1920)),
          height: Math.round(h * (width / 1920)),
          png,
        });
      }
      return {
        shots,
        missing,
        errors: [...new Set(errors.map(stripAnsi))].slice(0, 20),
        scheme,
      };
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    // A launch that never settles (a browser that died while starting) must not hold the close.
    await Promise.race([
      this.launching?.catch(() => {}),
      new Promise<void>((r) => setTimeout(r, 10_000).unref?.()),
    ]);
    const b = this.browser;
    this.browser = null;
    if (b?.isConnected()) await b.close();
  }
}
