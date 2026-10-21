import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { dirname, join, resolve } from "node:path";

import { freePort, loadPlaywright, SlideRenderer, stripAnsi } from "../cli/render.ts";
import { serveBuild } from "../cli/thumbnail.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PICTURES THE BUILD MAKES  —  the Open Graph card and the app icons
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Both need a browser, so both are optional: with Playwright and its Chromium in reach (the
 * deck's node_modules, or this package's) they are drawn; without, the build says so in one line
 * and goes on — a missing picture never fails a build.
 *
 *   og-image.png   `seoMeta.ogImage: auto`: slide 1 (the first the audience sees) as the print
 *                  view draws it — every step shown — served from dist/ at its base, cropped to
 *                  1200×630 around its middle. A committed `og-image.png` in the deck folder (or
 *                  public/) is used instead, so CI without a browser can still have the card.
 *   icons          `pwa: true`: the icon SVG rasterised at each size the manifest lists.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const OG_IMAGE = "og-image.png";
export const OG_SIZE = { width: 1200, height: 630 } as const;

export interface OgPlan {
  /** The og:image path inside the build, or null for none (a URL is left to head.ts). */
  file: string | null;
  /** Draw slide 1 into `file` after the build. */
  render: boolean;
  /** Copy this file of the deck folder into the build as `file`. */
  copyFrom: string | null;
}

/**
 * What `seoMeta.ogImage` asks of the build. `auto` uses a committed og-image.png (deck folder or
 * public/) or draws one; a relative path is copied in unless public/ already has it; a URL needs
 * nothing; no value still picks up a committed og-image.png, as Slidev does.
 */
export function ogImagePlan(ogImage: unknown, root: string, publicDir: string | null): OgPlan {
  const v = typeof ogImage === "string" ? ogImage.trim() : "";
  const inPublic = (rel: string) => !!publicDir && isFile(join(publicDir, rel));
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(v)) return { file: null, render: false, copyFrom: null };
  if (v === "auto" || v === "") {
    if (inPublic(OG_IMAGE)) return { file: OG_IMAGE, render: false, copyFrom: null };
    if (isFile(join(root, OG_IMAGE)))
      return { file: OG_IMAGE, render: false, copyFrom: join(root, OG_IMAGE) };
    return v === "auto"
      ? { file: OG_IMAGE, render: true, copyFrom: null }
      : { file: null, render: false, copyFrom: null };
  }
  const rel = v.replace(/^\.?\//, "");
  if (inPublic(rel)) return { file: rel, render: false, copyFrom: null };
  const src = resolve(root, rel);
  return isFile(src)
    ? { file: rel, render: false, copyFrom: src }
    : { file: null, render: false, copyFrom: null };
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Carry out the plan's copy (the render is `renderOgImage`'s). */
export function copyOgImage(plan: OgPlan, outDir: string): void {
  if (!plan.copyFrom || !plan.file) return;
  const target = join(outDir, plan.file);
  if (existsSync(target)) return;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(plan.copyFrom, target);
}

export type Outcome = { ok: true } | { ok: false; reason: string };

const reason = (e: unknown) =>
  stripAnsi(e instanceof Error ? e.message : String(e))
    .split("\n")[0]!
    .slice(0, 200);

/** Slide 1 of the build in `outDir`, served at `base`, into `outDir/file` at 1200×630. */
export async function renderOgImage(o: {
  root: string;
  outDir: string;
  base: string;
  file?: string;
}): Promise<Outcome> {
  let server: Server | null = null;
  let url = "";
  const renderer = new SlideRenderer(o.root, () => url);
  try {
    const port = await freePort();
    const base = o.base.startsWith("/") ? o.base : "/";
    server = await serveBuild(o.outDir, base, port);
    url = `http://127.0.0.1:${port}${base}`;
    const req = { width: OG_SIZE.width, aspect: OG_SIZE.width / OG_SIZE.height };
    let { shots } = await renderer.render({ ...req, slides: [0] });
    // A hidden first slide: the first one the audience sees.
    if (!shots.length) shots = (await renderer.render(req)).shots.slice(0, 1);
    const shot = shots[0];
    if (!shot) return { ok: false, reason: "the deck has no slide to picture" };
    const target = join(o.outDir, o.file ?? OG_IMAGE);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, shot.png);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: reason(e) };
  } finally {
    await renderer.close().catch(() => {});
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  }
}

/** Each SVG drawn as a square PNG of its size, transparent where the SVG is. */
export async function rasterizeSvgs(
  root: string,
  jobs: Array<{ svg: string; size: number; file: string }>,
): Promise<Outcome> {
  if (!jobs.length) return { ok: true };
  let browser: { close(): Promise<void>; newPage(o?: object): Promise<unknown> } | null = null;
  try {
    const pw = (await loadPlaywright(root)) as unknown as {
      chromium: { launch(): Promise<NonNullable<typeof browser>> };
    };
    browser = await pw.chromium.launch();
    for (const job of jobs) {
      const page = (await browser.newPage({
        viewport: { width: job.size, height: job.size },
        deviceScaleFactor: 1,
      })) as {
        setContent(html: string): Promise<void>;
        screenshot(o: object): Promise<Buffer>;
        close(): Promise<void>;
      };
      const svg = job.svg.replace(
        /<svg\b/,
        `<svg style="display:block;width:${job.size}px;height:${job.size}px"`,
      );
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`,
      );
      const png = await page.screenshot({ type: "png", omitBackground: true });
      mkdirSync(dirname(job.file), { recursive: true });
      writeFileSync(job.file, png);
      await page.close();
    }
    return { ok: true };
  } catch (e) {
    const r = reason(e);
    return {
      ok: false,
      reason: /Executable doesn't exist|playwright install/i.test(r)
        ? "Playwright is installed but Chromium is not (npx playwright install chromium)"
        : r,
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
