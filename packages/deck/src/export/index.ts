import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import type { Browser, Page } from "playwright";

import { loadPlaywright } from "../cli/render.ts";
import { splitDeck } from "../compiler/index.ts";
import {
  BLUESKY_POSTER_SIZE,
  blueskyEmbedUrl,
  blueskyPost,
  resolveBlueskyEmbed,
  TWEET_POSTER_SIZE,
  tweetEmbedUrl,
  tweetId,
  youtubeEmbedUrl,
  youtubeId,
} from "../core/embeds.ts";
import { POSTER_DEFAULT_SIZE, posterName } from "../core/poster.ts";
import { checkRange, parseRange, writePrintOptions } from "../core/print-options.ts";
import { type PageFacts, type PrintFacts, printFacts } from "./info.ts";
import { deckMarkdown } from "./markdown.ts";
import { finishPdf, mergePdfs, outlineTree } from "./outline.ts";
import { pngName } from "./shared.ts";
import { printFaithfulPdf, settleMedia, showPrintPage } from "./pdf.ts";
import type { EditableReport } from "./pptx/index.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPORT  —  PDF, PNG, PPTX and Markdown from a running deck, with an optional upload to the host
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Drives a headless Chromium over the deck's print view (`?print-pdf`), which lays every slide
 * (and every click step when `pdfSeparateFragments` is on) out as a page at the authored size.
 * The address narrows it (core/print-options.ts): a `range` of slides, `clicks` on or off, the
 * colour `scheme`, `omit-background`.
 *
 *   pdf            two layers per page (see pdf.ts): a screenshot of the page with its text
 *                  hidden, and the text itself printed over it, so it looks like the web in every
 *                  viewer and its words are still words. `vectorPdf` prints with the browser alone.
 *                  Then (outline.ts) bookmarks from the slides' titles and levels, and metadata.
 *   png            an element screenshot of each page (transparent with `omitBackground`).
 *   pptx           those PNGs, one per slide, notes attached: opens in PowerPoint, Keynote and
 *                  Google Slides looking exactly like the web.
 *   pptx-editable  the slides rebuilt as native text, shapes, pictures and tables (pptx/).
 *   md             a Markdown file of the PNGs with each slide's notes under it (markdown.ts).
 *
 * `perSlide` loads the print view once per slide (`?range=N`) instead of once for the deck: slow,
 * but a deck of hundreds of slides, or one where every slide runs WebGL, never has them all
 * mounted at once. The PDF parts are merged.
 *
 * Embedded pages cannot be live on paper, so before the build the exporter captures a poster
 * for every iframe slide, `<Iframe>`, `<Youtube>` and `<Tweet>` that names none: a screenshot of the URL at the pane's
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
  /**
   * Device pixels per CSS pixel. 2 unless a job says otherwise: a poster is printed into the
   * PDF at the export's scale, and a 1× poster is visibly soft beside the text around it.
   */
  scale?: number;
  /**
   * Paint the page in the colour of whatever it draws at the top: for a card on an empty page (a
   * post), so the poster is the card rather than a card above a white band.
   */
  fill?: boolean;
}

const DEFAULT_POSTER_WAIT = 5000;

/** An MDX attribute's value: `name="v"`, `name='v'`, `name={v}` or `name={"v"}`. */
function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|\\{["']?([^}"']*)["']?\\})`).exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

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
    extra: Pick<PosterJob, "scale" | "fill"> = {},
  ) => {
    const name = posterName(url, width, height);
    if (!jobs.has(name))
      jobs.set(name, { url, capture, width, height, file: name, wait, ...extra });
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
    // The two shorthands embed an address derived from their props (core/embeds.ts). A Tweet is
    // drawn in the deck's colour scheme, so it gets a poster for each. Ids that can't be real —
    // a placeholder in a code sample — are skipped.
    for (const m of s.content.matchAll(/<(Youtube|Tweet)\b([^>]*)>/g)) {
      const attrs = m[2] ?? "";
      if (/\bposter=/.test(attrs)) continue;
      const id = attr(attrs, "id");
      const url = attr(attrs, "url");
      if (m[1] === "Youtube") {
        if (!/^[\w-]{6,}$/.test(youtubeId({ id, url }))) continue;
        const start = Number(attr(attrs, "start")) || undefined;
        const autoplay = /\bautoplay(?!=\{false\})/.test(attrs);
        add(youtubeEmbedUrl({ id, url, autoplay, start }), ...POSTER_DEFAULT_SIZE);
      } else {
        const post = tweetId({ id, url });
        if (!/^\d+$/.test(post)) continue;
        for (const scheme of ["light", "dark"] as const) {
          const embed = tweetEmbedUrl(post, scheme);
          add(embed, ...TWEET_POSTER_SIZE, embed, DEFAULT_POSTER_WAIT, { scale: 2, fill: true });
        }
      }
    }
    // A Bluesky post, one poster per scheme, named after the post as the deck writes it
    // (components/BlueSky.tsx); a handle in it is resolved to a DID only to take the picture.
    for (const m of s.content.matchAll(/<BlueSky\b([^>]*)>/g)) {
      const attrs = m[1] ?? "";
      if (/\bposter=/.test(attrs)) continue;
      const post = blueskyPost(attr(attrs, "uri") ?? "");
      if (!post) continue;
      for (const scheme of ["light", "dark"] as const) {
        const embed = blueskyEmbedUrl(post, scheme);
        add(embed, ...BLUESKY_POSTER_SIZE, embed, DEFAULT_POSTER_WAIT, { scale: 2, fill: true });
      }
    }
  }
  return [...jobs.values()];
}

const GPU_ARGS = [
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--use-gl=angle",
  ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
];
const SOFTWARE_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

/** The WebGL renderer a browser ends up with, or null when it has no WebGL at all. */
async function webglRenderer(browser: Browser): Promise<string | null> {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const gl =
        document.createElement("canvas").getContext("webgl2") ??
        document.createElement("canvas").getContext("webgl");
      if (!gl) return null;
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
    });
  } finally {
    await page.close();
  }
}

/**
 * A browser for posters: the machine's GPU when it has one, SwiftShader when it doesn't (CI).
 * On SwiftShader a map is so slow that in ten seconds it has fetched almost none of its tiles,
 * and its poster is the markers floating over an empty grid.
 */
async function posterBrowser(log: (line: string) => void): Promise<Browser> {
  const { chromium } = await import("playwright");
  const gpu = await chromium.launch({ args: GPU_ARGS });
  const renderer = await webglRenderer(gpu).catch(() => null);
  if (renderer && !/swiftshader|llvmpipe|software/i.test(renderer)) {
    log(`webgl  ${renderer}`);
    return gpu;
  }
  await gpu.close();
  log(`webgl  no GPU here (${renderer ?? "none"}): SwiftShader, so maps draw slowly`);
  return chromium.launch({ args: SOFTWARE_ARGS });
}

/**
 * Counts the page's requests from the moment it is created. `quiet()` resolves once none has
 * been in flight for `idle` ms, or after `max`: a map asks for its tiles only once it has drawn
 * a frame, so the load event says nothing about them.
 */
function trackRequests(page: Page) {
  let inflight = 0;
  let last = Date.now();
  page.on("request", () => {
    inflight++;
    last = Date.now();
  });
  const settle = () => {
    inflight = Math.max(0, inflight - 1);
    last = Date.now();
  };
  page.on("requestfinished", settle);
  page.on("requestfailed", settle);
  return {
    async quiet(idle = 1500, max = 30_000): Promise<boolean> {
      const end = Date.now() + max;
      while (Date.now() < end) {
        if (inflight === 0 && Date.now() - last >= idle) return true;
        await page.waitForTimeout(100);
      }
      return false;
    },
  };
}

/**
 * Capture the posters that are missing (or all of them with `refresh`). Each page is waited on
 * until its network has gone quiet (tiles, fonts, data), then for its job's `wait` so it can draw.
 */
export async function capturePosters(
  deckDir: string,
  jobs: PosterJob[],
  { refresh = false, log = console.log }: { refresh?: boolean; log?: (line: string) => void } = {},
): Promise<number> {
  const todo = jobs.filter((j) => refresh || !existsSync(join(deckDir, "public", j.file)));
  if (!todo.length) return 0;
  const browser = await posterBrowser(log);
  let done = 0;
  try {
    for (const j of todo) {
      const target = join(deckDir, "public", j.file);
      mkdirSync(dirname(target), { recursive: true });
      const context = await browser.newContext({
        viewport: { width: j.width, height: j.height },
        deviceScaleFactor: j.scale ?? 2,
      });
      const page = await context.newPage();
      const requests = trackRequests(page);
      try {
        log(
          `poster ${j.capture} at ${j.width}×${j.height}${j.capture !== j.url ? ` (for ${j.url})` : ""}`,
        );
        // Opened with no referrer, an embed can refuse to draw: YouTube's player shows "Error 153"
        // instead of the video. In a deck it always has one, so it gets one here too.
        const capture = await resolveBlueskyEmbed(j.capture);
        await page.goto(capture, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
          referer: `${new URL(capture).origin}/`,
        });
        if (!(await requests.quiet()))
          log("       still loading after 30 s; capturing what there is");
        await page.waitForTimeout(j.wait);
        if (j.fill)
          await page.evaluate((x) => {
            for (let el = document.elementFromPoint(x, 12); el; el = el.parentElement) {
              const bg = getComputedStyle(el).backgroundColor;
              if (bg && bg !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(bg)) {
                document.documentElement.style.background = bg;
                document.body.style.background = bg;
                return;
              }
            }
          }, j.width / 2);
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
export type ExportFormat = "pdf" | "png" | "pptx" | "pptx-editable" | "md";
export const EXPORT_FORMATS: readonly ExportFormat[] = [
  "pdf",
  "png",
  "pptx",
  "pptx-editable",
  "md",
];

export interface ExportOptions {
  /** The deck's URL, e.g. http://localhost:4173/showcase/ (with the trailing slash). */
  url: string;
  /** The deck folder: Playwright is looked for in its node_modules first. Default: the cwd. */
  root?: string;
  outDir: string;
  slug: string;
  /** The files' base name (`<name>.pdf`); defaults to the slug. */
  name?: string;
  /** What to write. Defaults to what the booleans below say (a PDF unless `pdf: false`). */
  formats?: ExportFormat[];
  pdf?: boolean;
  /**
   * Print the PDF with the browser alone: every shape is vector, but CSS effects (masks, blurred
   * shadows, gradient text) come out differently in each PDF viewer. Off by default.
   */
  vectorPdf?: boolean;
  png?: boolean;
  pptx?: boolean;
  /** Device scale for PNG/PPTX captures. */
  scale?: number;
  /** Slides to export, `1,3-5` (1-based, play order); every slide when empty. */
  range?: string | null;
  /** The colour scheme to export in; the deck's own when null. */
  scheme?: "light" | "dark" | null;
  /** No page colour and no background layer: transparent PNGs (and a PDF with no backdrop). */
  omitBackground?: boolean;
  /** A page per click step (true), one per slide (false), or the deck's `pdfSeparateFragments` (null). */
  withClicks?: boolean | null;
  /** PDF bookmarks from the slide titles. On by default. */
  withToc?: boolean;
  /** One print-view load per slide (see the header). */
  perSlide?: boolean;
  /** Milliseconds to wait for the deck to load and lay out. Default 120 000. */
  timeout?: number;
  /** Extra milliseconds to wait once the deck says it is ready (a slow diagram, a late font). */
  wait?: number;
  /** When the page counts as loaded: `networkidle` (default), `load`, `domcontentloaded` or `none`. */
  waitUntil?: "networkidle" | "load" | "domcontentloaded" | "none";
  /** A Chromium or Chrome to drive instead of Playwright's own (codecs a video needs, say). */
  executablePath?: string | null;
  /** Upload the results to a host (`https://deck.kadal.cc`) using DECK_ADMIN_KEY or a presenter cookie. */
  upload?: string | null;
  adminKey?: string | null;
  log?: (line: string) => void;
}

export { pngName } from "./shared.ts";

export type ExportKind = "pdf" | "png" | "pptx" | "pptx-editable" | "md";

export interface ExportResult {
  files: { kind: ExportKind; path: string; size: number; uploaded?: string }[];
  pages: number;
  /** Bookmarks written into the PDF. */
  outline?: number;
  /** What the editable PPTX made native, and what it had to photograph. */
  editable?: EditableReport;
}

/** The formats an options object asks for, in a stable order. */
export function wantedFormats(
  o: Pick<ExportOptions, "formats" | "pdf" | "png" | "pptx">,
): ExportFormat[] {
  const set = new Set<ExportFormat>(o.formats ?? []);
  if (!o.formats) {
    if (o.pdf !== false) set.add("pdf");
    if (o.png) set.add("png");
    if (o.pptx) set.add("pptx");
  }
  return EXPORT_FORMATS.filter((f) => set.has(f));
}

interface Shot {
  path: string;
  page: PageFacts;
}

export async function exportDeck(options: ExportOptions): Promise<ExportResult> {
  const log = options.log ?? console.log;
  const formats = wantedFormats(options);
  const name = options.name || options.slug;
  const timeout = options.timeout ?? 120_000;
  const scale = options.scale ?? 2;
  // A malformed range is the caller's mistake, said before a browser starts.
  checkRange(options.range);
  const { chromium } = (await loadPlaywright(
    options.root ?? process.cwd(),
  )) as unknown as typeof import("playwright");
  mkdirSync(options.outDir, { recursive: true });
  const browser = await chromium.launch(
    options.executablePath ? { executablePath: options.executablePath } : {},
  );
  const result: ExportResult = { files: [], pages: 0 };
  const pngDir = join(options.outDir, "png");
  try {
    const context = await browser.newContext({
      deviceScaleFactor: scale,
      viewport: { width: 1920, height: 1080 },
      colorScheme: options.scheme ?? "light",
    });
    context.setDefaultTimeout(timeout);
    const page = await context.newPage();

    /** Open the print view for `range` and wait for it to settle; returns what it printed. */
    const open = async (range: string | null | undefined): Promise<PrintFacts> => {
      const url = writePrintOptions(new URL(options.url), {
        range: range || null,
        clicks: options.withClicks ?? null,
        omitBackground: options.omitBackground ?? false,
      });
      if (options.scheme) url.searchParams.set("scheme", options.scheme);
      log(`open   ${url}`);
      const until = options.waitUntil ?? "networkidle";
      await page.goto(url.toString(), { waitUntil: until === "none" ? "commit" : until, timeout });
      await page.waitForSelector(".deck-print-pages[data-ready]", { timeout });
      // Let fonts, KaTeX, mermaid, lazy images and video frames settle.
      await page.evaluate(() => document.fonts.ready);
      await settleMedia(page);
      await page.waitForTimeout(800 + (options.wait ?? 0));
      const facts = await printFacts(page);
      // Wide enough that the print view does not zoom its pages to fit the window.
      await page.setViewportSize({ width: facts.deck.width + 64, height: facts.deck.height + 64 });
      await page.waitForTimeout(100);
      return facts;
    };

    const pdfParts: Uint8Array[] = [];
    const printed: PageFacts[] = [];
    const shots: Shot[] = [];
    let facts: PrintFacts | null = null;
    let editable: import("./pptx/build.ts").BuildSlide[] = [];
    const editableMeta = {
      fonts: new Set<string>(),
      fallbackPages: [] as EditableReport["fallbackPages"],
      failed: 0,
    };
    const pptxModule = formats.includes("pptx-editable") ? await import("./pptx/index.ts") : null;

    const capture = async (f: PrintFacts) => {
      const dims = { width: f.deck.width, height: f.deck.height };
      const base = printed.length;
      printed.push(...f.pages);
      if (formats.includes("pdf")) {
        const tmp = join(options.outDir, `.${name}.part.pdf`);
        await page.emulateMedia({ media: "print" });
        if (options.vectorPdf)
          await page.pdf({
            path: tmp,
            width: `${dims.width}px`,
            height: `${dims.height}px`,
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
          });
        else
          await printFaithfulPdf(page, tmp, dims, { transparent: options.omitBackground ?? false });
        await page.emulateMedia({ media: "screen" });
        pdfParts.push(readFileSync(tmp));
        rmSync(tmp, { force: true });
      }
      if (formats.some((x) => x === "png" || x === "pptx" || x === "md")) {
        mkdirSync(pngDir, { recursive: true });
        const els = await page.$$(".deck-print-page");
        const count = new Map<number, number>();
        for (const p of f.pages)
          if (p.slide !== null && !p.notes) count.set(p.slide, (count.get(p.slide) ?? 0) + 1);
        for (let i = 0; i < els.length; i++) {
          await showPrintPage(page, i);
          const p = f.pages[i]!;
          const path = join(
            pngDir,
            pngName(p, p.slide === null ? 1 : (count.get(p.slide) ?? 1), base + i),
          );
          await els[i]!.screenshot({
            path,
            type: "png",
            omitBackground: options.omitBackground ?? false,
          });
          shots.push({ path, page: p });
        }
      }
      if (pptxModule) {
        await page.emulateMedia({ media: "print" });
        const part = await pptxModule.collectEditable(
          page,
          f,
          f.pages.map((_, i) => i),
          log,
        );
        await page.emulateMedia({ media: "screen" });
        editable = editable.concat(part.slides);
        for (const x of part.fonts) editableMeta.fonts.add(x);
        editableMeta.fallbackPages.push(
          ...part.fallbackPages.map((x) => ({ ...x, page: x.page + base })),
        );
        editableMeta.failed += part.failed;
      }
    };

    if (options.perSlide) {
      // The slide count first, from a load of the first slide alone.
      const first = await open("1");
      const numbers = parseRange(options.range, first.slides.length);
      facts = first;
      for (const n of numbers) {
        const f = n === 1 ? first : await open(String(n));
        log(`slide  ${n} of ${first.slides.length}: ${f.pages.length} page(s)`);
        await capture(f);
      }
    } else {
      facts = await open(options.range);
      await capture(facts);
    }
    result.pages = printed.length;
    const deck = facts.deck;
    log(`pages  ${printed.length} at ${deck.width}×${deck.height}`);

    if (formats.includes("pdf")) {
      const path = join(options.outDir, `${name}.pdf`);
      const joined = pdfParts.length === 1 ? pdfParts[0]! : await mergePdfs(pdfParts);
      const outline =
        options.withToc === false
          ? []
          : outlineTree(
              // A slide on several pages (`pdfMaxPagesPerSlide`) moves every later bookmark on.
              printed.flatMap((p) =>
                Array.from({ length: p.pages ?? 1 }, () => ({ slide: p.slide, notes: p.notes })),
              ),
              facts.slides,
            );
      const count = (nodes: typeof outline): number =>
        nodes.reduce((n, x) => n + 1 + count(x.children), 0);
      const bytes = await finishPdf(joined, {
        outline,
        meta: {
          title: deck.title,
          ...(deck.author ? { author: deck.author } : {}),
          ...(deck.info ? { subject: deck.info } : {}),
          ...(deck.keywords.length ? { keywords: deck.keywords } : {}),
        },
      });
      writeFileSync(path, bytes);
      result.outline = count(outline);
      result.files.push({ kind: "pdf", path, size: bytes.byteLength });
      log(`pdf    ${path}${result.outline ? ` (${result.outline} bookmarks)` : ""}`);
    }

    if (formats.includes("png")) {
      for (const s of shots)
        result.files.push({ kind: "png", path: s.path, size: readFileSync(s.path).byteLength });
      log(`png    ${shots.length} files in ${pngDir}`);
    }
    const notesOf = (p: PageFacts) =>
      p.slide === null ? "" : (facts!.slides[p.slide]?.notes ?? "");
    if (formats.includes("pptx")) {
      const path = join(options.outDir, `${name}.pptx`);
      await writePptx(
        path,
        shots.filter((s) => !s.page.notes).map((s) => ({ path: s.path, notes: notesOf(s.page) })),
        deck,
      );
      result.files.push({ kind: "pptx", path, size: readFileSync(path).byteLength });
      log(`pptx   ${path}`);
    }
    if (pptxModule) {
      const path = join(options.outDir, `${name}.editable.pptx`);
      const report = await pptxModule.writeEditable(path, deck, editable, editableMeta);
      result.editable = report;
      result.files.push({ kind: "pptx-editable", path, size: readFileSync(path).byteLength });
      log(
        `pptx   ${path} (editable: ${report.natives.text} text boxes, ${report.natives.shapes} shapes, ${report.natives.images} pictures, ${report.natives.tables} tables natively; ${report.pictures} drawn as pictures${report.fallbacks ? `; ${report.fallbacks} whole-slide pictures` : ""})`,
      );
      if (report.fonts.length)
        log(
          `       fonts named: ${report.fonts.join(", ")} (a .pptx names fonts; it does not carry them)`,
        );
    }
    if (formats.includes("md")) {
      const path = join(options.outDir, `${name}.md`);
      const bySlide = new Map<number, string[]>();
      for (const s of shots) {
        if (s.page.slide === null || s.page.notes) continue;
        const list = bySlide.get(s.page.slide) ?? [];
        list.push(`./${relative(options.outDir, s.path).split("\\").join("/")}`);
        bySlide.set(s.page.slide, list);
      }
      const md = deckMarkdown(
        [...bySlide.keys()]
          .sort((a, b) => a - b)
          .map((i) => ({
            number: i + 1,
            title: facts!.slides[i]?.title ?? null,
            images: bySlide.get(i)!,
            notes: facts!.slides[i]?.notes ?? "",
          })),
      );
      writeFileSync(path, md);
      result.files.push({ kind: "md", path, size: Buffer.byteLength(md) });
      log(`md     ${path}`);
    }
    // PNGs written only for the PPTX or the Markdown are not the caller's to keep.
    if (!formats.includes("png") && !formats.includes("md") && shots.length)
      rmSync(pngDir, { recursive: true, force: true });
  } finally {
    await browser.close();
  }

  if (options.upload) {
    for (const f of result.files) {
      // The host archives one PDF and one PPTX per deck: the picture-perfect one when both exist.
      if (f.kind !== "pdf" && f.kind !== "pptx" && f.kind !== "pptx-editable") continue;
      if (f.kind === "pptx-editable" && result.files.some((x) => x.kind === "pptx")) continue;
      const kind = f.kind === "pdf" ? "pdf" : "pptx";
      const target = `${options.upload.replace(/\/$/, "")}/api/decks/${options.slug}/exports?kind=${kind}`;
      const body = readFileSync(f.path);
      const res = await fetch(target, {
        method: "POST",
        headers: {
          "content-type":
            kind === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "content-length": String(body.byteLength),
          ...(options.adminKey ? { authorization: `Bearer ${options.adminKey}` } : {}),
        },
        body,
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) log(`upload ${kind} failed: ${res.status} ${json.error ?? ""}`);
      else {
        f.uploaded = json.url;
        log(`upload ${kind} → ${json.url}`);
      }
    }
  }
  return result;
}

async function writePptx(
  path: string,
  shots: { path: string; notes: string }[],
  deck: { width: number; height: number; title: string; author: string; info: string },
) {
  const mod = await import("pptxgenjs");
  const PptxGenJS = (mod.default ?? mod) as unknown as new () => PptxLike;
  const pptx = new PptxGenJS();
  const w = deck.width / 96;
  const h = deck.height / 96;
  pptx.defineLayout({ name: "deck", width: w, height: h });
  pptx.layout = "deck";
  pptx.title = deck.title;
  if (deck.author) pptx.author = deck.author;
  if (deck.info) pptx.subject = deck.info;
  pptx.company = "Made with Kadal Deck";
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
  author: string;
  subject: string;
  company: string;
  addSlide(): {
    addImage(o: { data: string; x: number; y: number; w: number; h: number }): void;
    addNotes(n: string): void;
  };
  write(o: { outputType: "nodebuffer" }): Promise<unknown>;
}

// The pieces an integration may want on its own: bookmarks for a PDF it printed itself, the
// Markdown shape, and the print view's options as an address.
export { finishPdf, mergePdfs, outlineTree, readOutline } from "./outline.ts";
export type { OutlineNode, OutlineSlide, PdfMeta, PrintedPage } from "./outline.ts";
export { deckMarkdown } from "./markdown.ts";
export { parseRange, readPrintOptions, writePrintOptions } from "../core/print-options.ts";
