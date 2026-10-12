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

// oxlint-disable-next-line no-control-regex -- terminal colour codes in Vite's output
const ANSI = /\u001b\[[0-9;]*m/g;

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
    { build = true, timeout = 90_000 }: { build?: boolean; timeout?: number } = {},
  ): Promise<DeckServer> {
    if (mode === "preview" && build) await runVite(dir, ["build"]);
    const port = await freePort();
    const args =
      mode === "dev"
        ? ["--port", String(port), "--strictPort", "--host", "127.0.0.1"]
        : ["preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"];
    const child = spawnVite(dir, args, "pipe");
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
}
interface PageLike {
  goto(url: string, o?: Record<string, unknown>): Promise<unknown>;
  waitForSelector(sel: string, o?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
  $$(sel: string): Promise<ElementLike[]>;
  on(
    event: string,
    cb: (arg: { type?: () => string; text?: () => string; message?: string }) => void,
  ): void;
}

/** Playwright from the deck's own node_modules first, then from wherever we were installed. */
export async function loadPlaywright(dir: string): Promise<PlaywrightLike> {
  try {
    const path = createRequire(join(dir, "package.json")).resolve("playwright");
    return (await import(pathToFileURL(path).href)) as PlaywrightLike;
  } catch {
    try {
      return (await import("playwright")) as unknown as PlaywrightLike;
    } catch {
      throw new MissingDependencyError(
        "Rendering slides needs Playwright and Chromium. In the deck folder run: npm install -D playwright && npx playwright install chromium",
      );
    }
  }
}

export interface RenderRequest {
  /** Slide indexes (0-based, authored order); all slides when omitted. */
  slides?: number[];
  scheme?: "light" | "dark";
  /** A theme the deck ships (see the theme menu). */
  theme?: string;
  /** Pixel width of each picture (default 1280; the slide's own width is 1920). */
  width?: number;
}

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
}

export class SlideRenderer {
  private browser: BrowserLike | null = null;

  constructor(
    private readonly dir: string,
    private readonly baseUrl: () => string,
  ) {}

  private async open(): Promise<BrowserLike> {
    if (this.browser?.isConnected()) return this.browser;
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
      const msg = e instanceof Error ? e.message : String(e);
      if (/Executable doesn't exist|playwright install/i.test(msg))
        throw new MissingDependencyError(
          "Playwright is installed but Chromium is not. Run: npx playwright install chromium",
        );
      throw e;
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
      await page.goto(url.toString(), { waitUntil: "load", timeout: 120_000 });
      await page.waitForSelector(".deck-print-pages[data-ready]", { timeout: 120_000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.waitForTimeout(400);
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
        const png = await el.screenshot({ type: "png", animations: "disabled" });
        const meta = info[pick]!;
        shots.push({
          index,
          click: meta.click,
          width: Math.round(meta.width * (width / 1920)),
          height: Math.round(meta.height * (width / 1920)),
          png,
        });
      }
      return { shots, missing, errors: [...new Set(errors)].slice(0, 20) };
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    const b = this.browser;
    this.browser = null;
    if (b?.isConnected()) await b.close();
  }
}
