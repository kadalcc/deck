import type { Page } from "playwright";

import { plainNotes } from "./shared.ts";

export { plainNotes } from "./shared.ts";

/**
 * What an exporter needs to know about the deck and its printed pages, read from the open print
 * view: the runtime (`window.__deck`) for the deck's facts and every slide's title, level and
 * notes; the pages' own `data-*` labels (PrintView) for which slide and step each page is.
 */

export interface DeckFacts {
  title: string;
  author: string;
  info: string;
  keywords: string[];
  width: number;
  height: number;
}

export interface SlideFacts {
  /** 0-based flat index (the order the deck plays). */
  index: number;
  h: number;
  v: number;
  title: string | null;
  level: number;
  /** The notes as plain text, `[click]` markers removed; empty without notes. */
  notes: string;
  hideInToc: boolean;
}

export interface PageFacts {
  /** 0-based flat slide index, or null when the page is not a slide's. */
  slide: number | null;
  h: number;
  v: number;
  click: number;
  notes: boolean;
}

export interface PrintFacts {
  deck: DeckFacts;
  slides: SlideFacts[];
  pages: PageFacts[];
}

export async function printFacts(page: Page): Promise<PrintFacts> {
  const raw = await page.evaluate(() => {
    type Meta = {
      index: number;
      h: number;
      v: number;
      title: string | null;
      level: number;
      notesText?: string | null;
      frontmatter?: Record<string, unknown>;
    };
    const deck = (
      window as unknown as {
        __deck?: {
          config: { title: string; author: string; info: string; width: number; height: number };
          columns: { h: number; slides: Meta[] }[];
          manifest?: { headmatter?: Record<string, unknown> };
        };
      }
    ).__deck;
    const pages = [...document.querySelectorAll<HTMLElement>(".deck-print-page")].map((p) => {
      const s = p.querySelector<HTMLElement>(".deck-slide");
      const slide = p.dataset.slide ?? s?.dataset.index;
      return {
        slide: slide === undefined ? null : Number(slide),
        h: Number(p.dataset.h ?? 0),
        v: Number(p.dataset.v ?? 0),
        click: Number(p.dataset.click ?? s?.dataset.click ?? 0),
        notes: p.classList.contains("deck-print-notes-page"),
      };
    });
    const flat = deck ? deck.columns.flatMap((c) => c.slides) : [];
    const head = (flat[0]?.frontmatter ?? {}) as Record<string, unknown>;
    const kw = head.keywords;
    return {
      deck: {
        title: deck?.config.title ?? document.title,
        author: deck?.config.author ?? "",
        info: deck?.config.info ?? "",
        keywords: Array.isArray(kw)
          ? kw.map(String)
          : typeof kw === "string"
            ? kw
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean)
            : [],
        width: deck?.config.width ?? 1920,
        height: deck?.config.height ?? 1080,
      },
      slides: flat.map((m, i) => ({
        index: i,
        h: m.h,
        v: m.v,
        title: m.title,
        level: m.level,
        notes: m.notesText ?? "",
        hideInToc: m.frontmatter?.hideInToc === true,
      })),
      pages,
    };
  });
  return {
    ...raw,
    slides: raw.slides.map((s) => ({ ...s, notes: plainNotes(s.notes) })),
  };
}
