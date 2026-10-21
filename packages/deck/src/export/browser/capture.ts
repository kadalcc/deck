import { deckMarkdown } from "../markdown.ts";
import { type PageLabel, pngName } from "../shared.ts";
import { zip } from "./zip.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * The browser exporter's work: pictures of the print pages, made in the page
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * No Playwright here — this runs on any deck, hosted ones included. Each print page is drawn
 * by modern-screenshot (MIT, the library Slidev's exporter uses; loaded on the first export):
 * it clones the page into an SVG foreignObject with the deck's CSS, web fonts and canvases
 * inlined, and rasterizes that at the asked scale. The pictures then become a zip of PNGs, an
 * image-per-slide PowerPoint file (pptxgenjs's browser build, loaded only for it) or a Markdown
 * file with them. PDF is not made here: the browser's own print of the print view is better.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface CapturedPage {
  label: PageLabel;
  png: Uint8Array;
  name: string;
}

export interface Progress {
  done: number;
  total: number;
}

/** Thrown out of a capture the person cancelled. */
export class Cancelled extends Error {
  constructor() {
    super("Cancelled");
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The label PrintView put on a page. */
export function labelOf(page: HTMLElement): PageLabel {
  const slide = page.dataset.slide;
  return {
    slide: slide === undefined || slide === "" ? null : Number(slide),
    click: Number(page.dataset.click ?? 0),
    notes: page.dataset.notes !== undefined,
  };
}

/** Wait for a page's pictures to decode (they are `loading="lazy"`, the preview may not have scrolled to them). */
async function settle(page: HTMLElement): Promise<void> {
  await Promise.race([
    Promise.all(
      [...page.querySelectorAll("img")].map((img) => {
        img.loading = "eager";
        return img.decode().catch(() => undefined);
      }),
    ),
    sleep(5000),
  ]);
}

const toBytes = async (dataUrl: string): Promise<Uint8Array> =>
  new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());

/** PNGs of `pages`, one at a time; `cancelled()` is asked between pages. */
export async function capturePages(
  pages: HTMLElement[],
  o: { width: number; height: number; scale: number; omitBackground: boolean },
  onProgress: (p: Progress) => void,
  cancelled: () => boolean,
): Promise<CapturedPage[]> {
  const { domToPng } = await import("modern-screenshot");
  await document.fonts?.ready;
  const labels = pages.map(labelOf);
  const count = new Map<number, number>();
  for (const l of labels)
    if (l.slide !== null && !l.notes) count.set(l.slide, (count.get(l.slide) ?? 0) + 1);
  const out: CapturedPage[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (cancelled()) throw new Cancelled();
    onProgress({ done: i, total: pages.length });
    const page = pages[i]!;
    await settle(page);
    const label = labels[i]!;
    const bg = getComputedStyle(page).backgroundColor;
    const url = await domToPng(page, {
      width: o.width,
      height: o.height,
      scale: o.scale,
      ...(o.omitBackground ? {} : { backgroundColor: bg }),
      // The preview's spacing and shadow are not the slide's.
      style: { margin: "0", boxShadow: "none", zoom: "1" },
      timeout: 15_000,
    });
    out.push({
      label,
      png: await toBytes(url),
      name: pngName(label, label.slide === null ? 1 : (count.get(label.slide) ?? 1), i),
    });
  }
  onProgress({ done: pages.length, total: pages.length });
  return out;
}

export interface SlideText {
  title: string | null;
  notes: string;
}

/** A zip of the PNGs, in `png/`. */
export function pngZip(pages: CapturedPage[]): Uint8Array {
  return zip(pages.map((p) => ({ name: `png/${p.name}`, data: p.png })));
}

/** The Markdown export (markdown.ts) and its PNGs, as one zip. */
export function markdownZip(pages: CapturedPage[], slides: SlideText[], stem: string): Uint8Array {
  const bySlide = new Map<number, string[]>();
  for (const p of pages) {
    if (p.label.slide === null || p.label.notes) continue;
    const list = bySlide.get(p.label.slide) ?? [];
    list.push(`./png/${p.name}`);
    bySlide.set(p.label.slide, list);
  }
  const md = deckMarkdown(
    [...bySlide.keys()]
      .sort((a, b) => a - b)
      .map((i) => ({
        number: i + 1,
        title: slides[i]?.title ?? null,
        images: bySlide.get(i)!,
        notes: slides[i]?.notes ?? "",
      })),
  );
  return zip([
    { name: `${stem}.md`, data: new TextEncoder().encode(md) },
    ...pages.map((p) => ({ name: `png/${p.name}`, data: p.png })),
  ]);
}

const base64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** A PowerPoint file of the pictures, one slide each, notes attached (pptxgenjs, loaded now). */
export async function imagePptx(
  pages: CapturedPage[],
  slides: SlideText[],
  deck: { width: number; height: number; title: string; author: string; info: string },
  withNotes: boolean,
): Promise<Blob> {
  const mod = (await import("pptxgenjs")) as unknown as { default?: unknown };
  const PptxGenJS = (mod.default ?? mod) as new () => {
    defineLayout(l: { name: string; width: number; height: number }): void;
    layout: string;
    title: string;
    author: string;
    subject: string;
    company: string;
    addSlide(): {
      addImage(o: Record<string, unknown>): void;
      addNotes(n: string): void;
    };
    write(o: { outputType: "blob" }): Promise<unknown>;
  };
  const pptx = new PptxGenJS();
  const w = deck.width / 96;
  const h = deck.height / 96;
  pptx.defineLayout({ name: "deck", width: w, height: h });
  pptx.layout = "deck";
  pptx.title = deck.title;
  if (deck.author) pptx.author = deck.author;
  if (deck.info) pptx.subject = deck.info;
  pptx.company = "Made with Kadal Deck";
  for (const p of pages) {
    if (p.label.notes) continue;
    const slide = pptx.addSlide();
    slide.addImage({ data: `image/png;base64,${base64(p.png)}`, x: 0, y: 0, w, h });
    const notes = p.label.slide === null ? "" : (slides[p.label.slide]?.notes ?? "");
    if (withNotes && notes.trim()) slide.addNotes(notes.trim());
  }
  return (await pptx.write({ outputType: "blob" })) as Blob;
}

/** Hand a file to the person: the browser's own download. */
export function save(data: Blob | Uint8Array, name: string, type: string): void {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
