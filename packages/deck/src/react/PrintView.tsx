import { useEffect, useState } from "react";

import { key as navKey } from "../core/navigation.ts";
import { BackgroundLayer } from "./Backgrounds.tsx";
import { useDeck } from "./context.ts";
import { loadSlide, SlideFrame } from "./SlideFrame.tsx";

/**
 * `?print-pdf`: every slide laid out as a page at the authored size, one page per click step when
 * `pdfSeparateFragments` is on, notes printed in a box or on a separate page when `showNotes` is
 * set. Print to PDF from the browser, or let `deck export` drive a headless Chromium over it.
 */
export function PrintView() {
  const deck = useDeck();
  const [ready, setReady] = useState(false);
  const [totals, setTotals] = useState<Record<string, number>>({});
  // On screen the pages are zoomed to the window's width (the print stylesheet pins zoom to 1).
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 32) / deck.config.width));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [deck.config.width]);
  const flat = deck.columns.flatMap((c) => c.slides.map((meta, v) => ({ meta, h: c.h, v })));

  // Mount everything once (to learn click totals), then render the pages.
  useEffect(() => {
    let alive = true;
    // Ready when every module has settled (a broken slide prints its error), or after a grace period.
    const grace = setTimeout(() => alive && setReady(true), 15_000);
    Promise.allSettled(flat.map((s) => loadSlide(s.meta))).then(() => {
      if (!alive) return;
      clearTimeout(grace);
      // One more frame so fonts, KaTeX and diagrams have painted.
      setTimeout(() => alive && setReady(true), 300);
    });
    return () => {
      alive = false;
      clearTimeout(grace);
    };
  }, [flat.length]);
  useEffect(() => deck.nav.subscribe((s) => setTotals(s.totals)), [deck.nav]);
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

  const pages: { key: string; h: number; v: number; click: number }[] = [];
  for (const s of flat) {
    const k = navKey(s.h, s.v);
    const total = Math.min(
      totals[k] ?? 0,
      deck.config.pdfSeparateFragments ? Number.POSITIVE_INFINITY : 0,
    );
    const steps = deck.config.pdfSeparateFragments ? total + 1 : 1;
    for (let c = 0; c < steps; c++)
      pages.push({
        key: `${k}:${c}`,
        h: s.h,
        v: s.v,
        click: deck.config.pdfSeparateFragments ? c : (totals[k] ?? 0),
      });
  }

  return (
    <div
      className="deck-print-pages"
      data-ready={ready || undefined}
      style={{ width: deck.config.width, zoom }}
    >
      {pages.map((p) => {
        const meta = deck.columns[p.h]!.slides[p.v]!;
        const options = deck.options.get(navKey(p.h, p.v))!;
        return (
          <div
            key={p.key}
            className="deck-print-page"
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
              className="is-print"
            />
            {deck.config.showNotes === true && meta.hasNotes ? <PrintNotes meta={meta} /> : null}
          </div>
        );
      })}
      {deck.config.showNotes === "separate-page"
        ? pages
            .filter((p) => p.click === 0 && deck.columns[p.h]!.slides[p.v]!.hasNotes)
            .map((p) => (
              <div
                key={`notes:${p.key}`}
                className="deck-print-page deck-print-notes-page"
                style={{ width: deck.config.width, height: deck.config.height }}
              >
                <PrintNotes meta={deck.columns[p.h]!.slides[p.v]!} full />
              </div>
            ))
        : null}
    </div>
  );
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
      <Notes />
    </aside>
  );
}
