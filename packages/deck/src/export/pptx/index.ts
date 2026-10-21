import { writeFileSync } from "node:fs";

import type { Page } from "playwright";

import type { DeckFacts, PrintFacts } from "../info.ts";
import { showPrintPage } from "../pdf.ts";
import { type BuildReport, type BuildSlide, type PptxDeck, buildSlides } from "./build.ts";
import { CAPTURE_CSS, captureSlide, clearMarks } from "./capture.ts";
import type { Rect } from "./types.ts";
import { walkSlide } from "./walk.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EDITABLE PPTX  —  the deck rebuilt as PowerPoint objects
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `kadal-deck export --format pptx-editable`. Over the open print view (print media, so the
 * pages are at their authored size and look as the PDF does), each page in turn is:
 *
 *   1. walked in the page (walk.ts): text, lists, shapes, pictures, tables and code as JSON;
 *   2. photographed where it must be (capture.ts): rasters, a complex background, the residue;
 *   3. its pictures fetched as the original files (Playwright's request context, the page's own
 *      cookies), falling back to a photograph for a format PowerPoint cannot show (WebP, SVG);
 *   4. built into a slide (build.ts), notes attached.
 *
 * A page whose walk throws is placed as one picture, so a slide the walker cannot read is never
 * missing. The report says how much came out native, how many pictures, and which fonts the file
 * names (a .pptx names fonts, it does not carry them).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface EditableReport extends BuildReport {
  fonts: string[];
  /** Pages placed as one picture, and why. */
  fallbackPages: { page: number; reason: string }[];
  /** Pictures that could not be taken. */
  failed: number;
}

const NATIVE = /^image\/(png|jpe?g|gif)$/;

async function fetchImage(
  page: Page,
  src: string,
): Promise<{ mime: string; bytes: Uint8Array } | null> {
  try {
    if (src.startsWith("data:")) {
      const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
      if (!m) return null;
      const bytes = m[2] ? Buffer.from(m[3]!, "base64") : Buffer.from(decodeURIComponent(m[3]!));
      return NATIVE.test(m[1]!) ? { mime: m[1]!.replace("jpg", "jpeg"), bytes } : null;
    }
    if (!/^https?:/.test(src)) return null;
    const res = await page.context().request.get(src, { timeout: 20_000 });
    if (!res.ok()) return null;
    const mime = (res.headers()["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    const bytes = await res.body();
    // Trust the bytes over the header: a PNG served as octet-stream is still a PNG.
    const sniffed =
      bytes[0] === 0x89 && bytes[1] === 0x50
        ? "image/png"
        : bytes[0] === 0xff && bytes[1] === 0xd8
          ? "image/jpeg"
          : bytes[0] === 0x47 && bytes[1] === 0x49
            ? "image/gif"
            : mime;
    return NATIVE.test(sniffed) ? { mime: sniffed, bytes } : null;
  } catch {
    return null;
  }
}

export interface Collected {
  slides: BuildSlide[];
  fonts: string[];
  fallbackPages: EditableReport["fallbackPages"];
  failed: number;
}

/**
 * Walk and photograph print pages `pages` of the open print view (print media emulated). The
 * marks it leaves are cleared before it returns, so it can run once per load (`--per-slide`).
 */
export async function collectEditable(
  page: Page,
  facts: PrintFacts,
  pages: number[],
  log: (line: string) => void = () => {},
): Promise<Collected> {
  const { width, height } = facts.deck;
  await page.addStyleTag({ content: CAPTURE_CSS });
  await page.evaluate(() => document.documentElement.classList.add("kx-export"));
  const out: Collected = { slides: [], fonts: [], fallbackPages: [], failed: 0 };
  const fonts = new Set<string>();
  try {
    for (const i of pages) {
      await showPrintPage(page, i);
      const fact = facts.pages[i];
      const notes =
        fact && fact.slide !== null && !fact.notes ? facts.slides[fact.slide]?.notes : undefined;
      if (fact?.notes) continue; // a notes page: the notes ride on their slide instead
      try {
        const snap = await page.evaluate(walkSlide, { page: i, width, height });
        for (const f of snap.fonts) fonts.add(f);
        const files = new Map<number, { mime: string; bytes: Uint8Array }>();
        const extra: { id: number; rect: Rect }[] = [];
        for (const item of snap.under) {
          if (item.kind !== "image") continue;
          const file = await fetchImage(page, item.src);
          if (file) files.set(item.id, file);
          else extra.push({ id: item.id, rect: item.rect });
        }
        const pictures = await captureSlide(page, snap, extra);
        out.failed += pictures.failed;
        out.slides.push({ snap, pictures, files, ...(notes ? { notes } : {}) });
      } catch (e) {
        const reason = e instanceof Error ? e.message.split("\n")[0]! : String(e);
        out.fallbackPages.push({ page: i, reason });
        log(`pptx   page ${i + 1} placed as a picture (${reason})`);
        const whole = await page.locator(".deck-print-page").nth(i).screenshot({ type: "png" });
        out.slides.push({
          snap: null,
          pictures: null,
          files: new Map(),
          whole,
          ...(notes ? { notes } : {}),
        });
      }
    }
  } finally {
    await clearMarks(page);
  }
  out.fonts = [...fonts];
  return out;
}

/** Build the collected slides into `path`. */
export async function writeEditable(
  path: string,
  deck: DeckFacts,
  slides: BuildSlide[],
  meta: { fonts: Iterable<string>; fallbackPages: EditableReport["fallbackPages"]; failed: number },
): Promise<EditableReport> {
  const { width, height } = deck;
  const mod = await import("pptxgenjs");
  const PptxGenJS = ((mod as { default?: unknown }).default ?? mod) as new () => PptxDeck;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "deck", width: width / 96, height: height / 96 });
  pptx.layout = "deck";
  pptx.title = deck.title;
  if (deck.author) pptx.author = deck.author;
  if (deck.info) pptx.subject = deck.info;
  pptx.company = "Made with Kadal Deck";
  const report = buildSlides(pptx, slides, { width, height });
  writeFileSync(path, (await pptx.write({ outputType: "nodebuffer" })) as Uint8Array);
  return {
    ...report,
    fonts: [...new Set(meta.fonts)].sort(),
    fallbackPages: meta.fallbackPages,
    failed: meta.failed,
  };
}
