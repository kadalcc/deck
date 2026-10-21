import { useEffect, useMemo, useState } from "react";

import { key as navKey } from "../core/navigation.ts";
import { type PrintOptions, parseRange, readPrintOptions } from "../core/print-options.ts";
import { PrintDrawings } from "../draw/PrintDrawings.tsx";
import { fileDrawings } from "../draw/source.ts";
import { BackgroundLayer } from "./Backgrounds.tsx";
import { useDeck } from "./context.ts";
import { loadSlide, SlideFrame } from "./SlideFrame.tsx";
import { useFontsReady } from "../theming/react.tsx";
import { MDXProvider } from "./mdx.tsx";

/**
 * `?print-pdf`: every slide laid out as a page at the authored size, one page per click step when
 * `pdfSeparateFragments` is on, notes printed in a box or on a separate page when `showNotes` is
 * set. Print to PDF from the browser, or let `deck export` drive a headless Chromium over it.
 *
 * The address can narrow it (core/print-options.ts): `?range=1,3-5`, `?clicks=0|1`,
 * `?notes=0|1|page`, `?omit-background`. The browser exporter (/export) passes the same choices
 * as `options`, which win over the address, and its own `zoom` for the preview. Every page says
 * which slide and step it is (`data-slide`, `data-h`, `data-v`, `data-click`), so an exporter can
 * name files, bookmark the PDF and attach notes without guessing from the order.
 */
export function PrintView({
  options: given,
  zoom: fixedZoom,
}: {
  options?: Partial<PrintOptions>;
  /** A fixed zoom for the pages on screen (the exporter's preview); else they fit the window. */
  zoom?: number;
} = {}) {
  const deck = useDeck();
  const fromQuery = useMemo(
    () => readPrintOptions(typeof location === "undefined" ? "" : location.search),
    [],
  );
  const pick = <K extends keyof PrintOptions>(k: K): PrintOptions[K] =>
    given?.[k] !== undefined && given[k] !== null ? (given[k] as PrintOptions[K]) : fromQuery[k];
  const separate = pick("clicks") ?? deck.config.pdfSeparateFragments;
  const showNotes = pick("notes") ?? deck.config.showNotes;
  const range = pick("range");
  const omitBackground = pick("omitBackground");
  const [settled, setSettled] = useState(false);
  const [ready, setReady] = useState(false);
  const [totals, setTotals] = useState<Record<string, number>>({});
  // On screen the pages are zoomed to the window's width (the print stylesheet pins zoom to 1).
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (fixedZoom !== undefined) return;
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 32) / deck.config.width));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [deck.config.width, fixedZoom]);
  const all = deck.columns.flatMap((c) => c.slides.map((meta, v) => ({ meta, h: c.h, v })));
  // A malformed range prints everything rather than nothing; the CLI checks it before it asks.
  const wanted = useMemo(() => {
    try {
      return new Set(parseRange(range, all.length));
    } catch {
      return null;
    }
  }, [range, all.length]);
  const flat = all.map((s, i) => ({ ...s, n: i })).filter((s) => !wanted || wanted.has(s.n + 1));

  // Every slide's first page mounts at once and reports its click total (`reportTotal`); a slide
  // with steps then gains a page per step. Ready once every module has settled (a broken slide
  // prints its error) and the page count has stopped changing — or after a grace period.
  useEffect(() => {
    let alive = true;
    const grace = setTimeout(() => alive && setSettled(true), 15_000);
    // The saved drawings (drawings/*.svg) are part of the page too.
    Promise.allSettled([...flat.map((s) => loadSlide(s.meta)), fileDrawings(deck).ready]).then(
      () => {
        if (!alive) return;
        clearTimeout(grace);
        setSettled(true);
      },
    );
    return () => {
      alive = false;
      clearTimeout(grace);
    };
  }, [flat.length, range]);
  useEffect(() => deck.nav.subscribe((s) => setTotals(s.totals)), [deck.nav]);
  useEffect(() => {
    if (!omitBackground) return;
    document.documentElement.classList.add("deck-print-transparent");
    return () => document.documentElement.classList.remove("deck-print-transparent");
  }, [omitBackground]);
  useEffect(() => {
    document.documentElement.classList.add("deck-print");
    const style = document.createElement("style");
    style.textContent = `@page { size: ${deck.config.width}px ${deck.config.height}px; margin: 0; }`;
    document.head.appendChild(style);
    return () => {
      document.documentElement.classList.remove("deck-print");
      style.remove();
    };
  }, [deck.config.width, deck.config.height]);

  const pages = printPages(flat, totals, separate);
  const number = new Map(flat.map((s) => [navKey(s.h, s.v), s.n]));
  // The deck's web fonts (`fonts`), loaded: an export taken before them is in the fallback face.
  const fontsReady = useFontsReady();

  // One more beat after the last change of page count, so the newest pages, fonts, KaTeX and
  // diagrams have painted.
  useEffect(() => {
    if (!settled) return;
    setReady(false);
    const t = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(t);
  }, [settled, pages.length]);

  return (
    <div
      className={["deck-print-pages", omitBackground ? "is-transparent" : ""]
        .filter(Boolean)
        .join(" ")}
      data-ready={(ready && fontsReady) || undefined}
      style={{ width: deck.config.width, zoom: fixedZoom ?? zoom }}
    >
      {pages.map((p) => {
        const meta = deck.columns[p.h]!.slides[p.v]!;
        const options = deck.options.get(navKey(p.h, p.v))!;
        return (
          <div
            key={p.key}
            className="deck-print-page"
            data-slide={number.get(navKey(p.h, p.v))}
            data-h={p.h}
            data-v={p.v}
            data-click={p.click}
            style={{ width: deck.config.width, height: deck.config.height }}
          >
            <BackgroundLayer bg={options.background} active={false} />
            <SlideFrame
              meta={meta}
              options={options}
              h={p.h}
              v={p.v}
              active={false}
              click={p.click}
              preview
              reportTotal={!separate || p.click === 0}
              globalLayers
              // A page per step shows each step as it is; one page per slide shows everything.
              className={separate ? "is-print" : "is-print is-print-all"}
            />
            <PrintDrawings h={p.h} v={p.v} click={p.click} allSteps={!separate} />
            {showNotes === true && meta.hasNotes ? <PrintNotes meta={meta} /> : null}
          </div>
        );
      })}
      {showNotes === "separate-page"
        ? pages
            .filter((p) => p.click === 0 && deck.columns[p.h]!.slides[p.v]!.hasNotes)
            .map((p) => (
              <div
                key={`notes:${p.key}`}
                className="deck-print-page deck-print-notes-page"
                data-slide={number.get(navKey(p.h, p.v))}
                data-h={p.h}
                data-v={p.v}
                data-notes=""
                style={{ width: deck.config.width, height: deck.config.height }}
              >
                <PrintNotes meta={deck.columns[p.h]!.slides[p.v]!} full />
              </div>
            ))
        : null}
    </div>
  );
}

export interface PrintPage {
  key: string;
  h: number;
  v: number;
  click: number;
}

/**
 * The pages of the printed deck: with `separate` (`pdfSeparateFragments`, on by default), one per
 * click step of every slide — step 0 to its total — and otherwise one per slide, at its last step.
 * `totals` are the click totals the slides reported; a slide yet to report counts as having none.
 */
export function printPages(
  slides: { h: number; v: number }[],
  totals: Record<string, number>,
  separate: boolean,
): PrintPage[] {
  const pages: PrintPage[] = [];
  for (const s of slides) {
    const k = navKey(s.h, s.v);
    const total = totals[k] ?? 0;
    if (!separate) {
      pages.push({ key: `${k}:0`, h: s.h, v: s.v, click: total });
      continue;
    }
    for (let c = 0; c <= total; c++) pages.push({ key: `${k}:${c}`, h: s.h, v: s.v, click: c });
  }
  return pages;
}

function PrintNotes({
  meta,
  full = false,
}: {
  meta: {
    loadNotes: (() => Promise<{ default: React.ComponentType }>) | null;
    title: string | null;
  };
  full?: boolean;
}) {
  const [Notes, setNotes] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    let alive = true;
    meta.loadNotes?.().then((m) => alive && setNotes(() => m.default));
    return () => {
      alive = false;
    };
  }, [meta]);
  if (!Notes) return null;
  return (
    <aside className={["deck-print-notes", full ? "is-full" : ""].join(" ")}>
      {full && meta.title ? <h3>{meta.title}</h3> : null}
      <MDXProvider>
        <Notes />
      </MDXProvider>
    </aside>
  );
}
