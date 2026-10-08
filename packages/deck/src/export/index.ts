import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { splitDeck } from "../compiler/index.ts";
import { POSTER_DEFAULT_SIZE, posterName } from "../core/poster.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPORT  —  PDF, PNG and PPTX from a running deck, with an optional upload to the host
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Drives a headless Chromium over the deck's print view (`?print-pdf`), which lays every slide
 * (and every click step when `pdfSeparateFragments` is on) out as a page at the authored size.
 * PDF comes from the browser's own printer; PNGs are element screenshots of each page; PPTX
 * wraps those PNGs one per slide with the notes attached, so the deck opens in PowerPoint,
 * Keynote and Google Slides looking exactly like the web.
 *
 * Embedded pages cannot be live on paper, so before the build the exporter captures a poster
 * for every iframe slide and `<Iframe>` that names none: a screenshot of the URL at the pane's
 * size, saved under `public/posters/` where the frame shell looks for it (see core/poster.ts).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface PosterJob {
  /** The page the frame embeds — what names the poster. */
  url: string;
  /** The page to photograph, when it differs (a state the frame's URL does not carry). */
  capture: string;
  width: number;
  height: number;
  /** Relative to the deck's `public/`. */
  file: string;
  /** Milliseconds to let the page settle before the shot. */
  wait: number;
}

const DEFAULT_POSTER_WAIT = 5000;

/** Every embedded page in the deck that has no poster of its own, with the size to capture. */
export function posterJobs(
  deckDir: string,
  config: { width: number; height: number },
  entry = "deck.mdx",
): PosterJob[] {
  const file = join(deckDir, entry);
  if (!existsSync(file)) return [];
  const split = splitDeck(readFileSync(file, "utf8"), {
    file,
    resolveInclude: (path, from) => {
      const inc = join(dirname(from), path);
      return existsSync(inc) ? { file: inc, text: readFileSync(inc, "utf8") } : null;
    },
  });
  const jobs = new Map<string, PosterJob>();
  const add = (
    url: string,
    width: number,
    height: number,
    capture = url,
    wait = DEFAULT_POSTER_WAIT,
  ) => {
    const name = posterName(url, width, height);
    if (!jobs.has(name)) jobs.set(name, { url, capture, width, height, file: name, wait });
  };
  for (const s of split.slides) {
    const fm = s.frontmatter as Record<string, unknown>;
    const layout = typeof fm.layout === "string" ? fm.layout : "";
    if (/^iframe(-left|-right)?$/.test(layout) && typeof fm.url === "string" && !fm.poster) {
      const half = layout !== "iframe";
      add(
        fm.url,
        half ? Math.round(config.width / 2) : config.width,
        config.height,
        typeof fm.posterUrl === "string" ? fm.posterUrl : fm.url,
        typeof fm.posterWait === "number" ? fm.posterWait : DEFAULT_POSTER_WAIT,
      );
    }
    for (const m of s.content.matchAll(/<Iframe\b([^>]*)>/g)) {
      const attrs = m[1] ?? "";
      if (/\bposter=/.test(attrs)) continue;
      const src = /\bsrc=["']([^"']+)["']/.exec(attrs)?.[1];
      const capture = /\bposterUrl=["']([^"']+)["']/.exec(attrs)?.[1];
      const wait = /\bposterWait=\{?(\d+)\}?/.exec(attrs)?.[1];
      if (src && /^https?:\/\//.test(src))
        add(
          src,
          POSTER_DEFAULT_SIZE[0],
          POSTER_DEFAULT_SIZE[1],
          capture ?? src,
          wait ? Number(wait) : DEFAULT_POSTER_WAIT,
        );
    }
  }
  return [...jobs.values()];
}

/**
 * Capture the posters that are missing (or all of them with `refresh`). WebGL pages render
 * through SwiftShader; each page gets its job's `wait` after load for maps and fonts.
 */
export async function capturePosters(
  deckDir: string,
  jobs: PosterJob[],
  { refresh = false, log = console.log }: { refresh?: boolean; log?: (line: string) => void } = {},
): Promise<number> {
  const todo = jobs.filter((j) => refresh || !existsSync(join(deckDir, "public", j.file)));
  if (!todo.length) return 0;
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  });
  let done = 0;
  try {
    for (const j of todo) {
      const target = join(deckDir, "public", j.file);
      mkdirSync(dirname(target), { recursive: true });
      const context = await browser.newContext({
        viewport: { width: j.width, height: j.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      try {
        log(
          `poster ${j.capture} at ${j.width}×${j.height}${j.capture !== j.url ? ` (for ${j.url})` : ""}`,
        );
        await page.goto(j.capture, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForTimeout(j.wait);
        await page.screenshot({ path: target, type: "jpeg", quality: 86 });
        log(`       → public/${j.file}`);
        done++;
      } catch (e) {
        log(`       failed: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return done;
}
export interface ExportOptions {
  /** The deck's URL, e.g. http://localhost:4173/showcase/ (with the trailing slash). */
  url: string;
  outDir: string;
  slug: string;
  pdf?: boolean;
  png?: boolean;
  pptx?: boolean;
  /** Device scale for PNG/PPTX captures. */
  scale?: number;
  /** Upload the results to a host (`https://deck.kadal.cc`) using DECK_ADMIN_KEY or a presenter cookie. */
  upload?: string | null;
  adminKey?: string | null;
  log?: (line: string) => void;
}

export interface ExportResult {
  files: { kind: "pdf" | "png" | "pptx"; path: string; size: number; uploaded?: string }[];
  pages: number;
}

export async function exportDeck(options: ExportOptions): Promise<ExportResult> {
  const log = options.log ?? console.log;
  const { chromium } = await import("playwright");
  mkdirSync(options.outDir, { recursive: true });
  const browser = await chromium.launch();
  const result: ExportResult = { files: [], pages: 0 };
  try {
    const context = await browser.newContext({
      deviceScaleFactor: options.scale ?? 2,
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    const url = new URL(options.url);
    url.searchParams.set("print-pdf", "");
    log(`open  ${url}`);
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    await page.waitForSelector(".deck-print-pages[data-ready]", { timeout: 120_000 });
    // Let fonts, KaTeX, mermaid and lazy images settle.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const dims = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".deck-print-page");
      return {
        width: el?.offsetWidth ?? 1920,
        height: el?.offsetHeight ?? 1080,
        pages: document.querySelectorAll(".deck-print-page").length,
      };
    });
    result.pages = dims.pages;
    log(`pages ${dims.pages} at ${dims.width}×${dims.height}`);

    if (options.pdf !== false) {
      const path = join(options.outDir, `${options.slug}.pdf`);
      await page.emulateMedia({ media: "print" });
      await page.pdf({
        path,
        width: `${dims.width}px`,
        height: `${dims.height}px`,
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
      await page.emulateMedia({ media: "screen" });
      result.files.push({ kind: "pdf", path, size: readFileSync(path).byteLength });
      log(`pdf   ${path}`);
    }

    if (options.png || options.pptx) {
      const pngDir = join(options.outDir, "png");
      mkdirSync(pngDir, { recursive: true });
      const pages = await page.$$(".deck-print-page");
      const shots: { path: string; notes: string }[] = [];
      for (let i = 0; i < pages.length; i++) {
        const el = pages[i]!;
        await el.scrollIntoViewIfNeeded();
        const path = join(pngDir, `${String(i + 1).padStart(3, "0")}.png`);
        await el.screenshot({ path, type: "png" });
        const notes = await el
          .$eval(".deck-print-notes", (n) => (n as HTMLElement).innerText)
          .catch(() => "");
        shots.push({ path, notes });
      }
      if (options.png) {
        for (const s of shots)
          result.files.push({ kind: "png", path: s.path, size: readFileSync(s.path).byteLength });
        log(`png   ${shots.length} files in ${pngDir}`);
      }
      if (options.pptx) {
        const path = join(options.outDir, `${options.slug}.pptx`);
        await writePptx(path, shots, dims.width, dims.height, options.slug);
        result.files.push({ kind: "pptx", path, size: readFileSync(path).byteLength });
        log(`pptx  ${path}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (options.upload) {
    for (const f of result.files) {
      if (f.kind === "png") continue;
      const target = `${options.upload.replace(/\/$/, "")}/api/decks/${options.slug}/exports?kind=${f.kind}`;
      const body = readFileSync(f.path);
      const res = await fetch(target, {
        method: "POST",
        headers: {
          "content-type":
            f.kind === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "content-length": String(body.byteLength),
          ...(options.adminKey ? { authorization: `Bearer ${options.adminKey}` } : {}),
        },
        body,
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) log(`upload ${f.kind} failed: ${res.status} ${json.error ?? ""}`);
      else {
        f.uploaded = json.url;
        log(`upload ${f.kind} → ${json.url}`);
      }
    }
  }
  return result;
}

async function writePptx(
  path: string,
  shots: { path: string; notes: string }[],
  width: number,
  height: number,
  title: string,
) {
  const mod = await import("pptxgenjs");
  const PptxGenJS = (mod.default ?? mod) as unknown as new () => PptxLike;
  const pptx = new PptxGenJS();
  const w = width / 96;
  const h = height / 96;
  pptx.defineLayout({ name: "deck", width: w, height: h });
  pptx.layout = "deck";
  pptx.title = title;
  for (const s of shots) {
    const slide = pptx.addSlide();
    slide.addImage({
      data: `image/png;base64,${readFileSync(s.path).toString("base64")}`,
      x: 0,
      y: 0,
      w,
      h,
    });
    if (s.notes.trim()) slide.addNotes(s.notes.trim());
  }
  const data = (await pptx.write({ outputType: "nodebuffer" })) as Uint8Array;
  writeFileSync(path, data);
}

interface PptxLike {
  defineLayout(l: { name: string; width: number; height: number }): void;
  layout: string;
  title: string;
  addSlide(): {
    addImage(o: { data: string; x: number; y: number; w: number; h: number }): void;
    addNotes(n: string): void;
  };
  write(o: { outputType: "nodebuffer" }): Promise<unknown>;
}
