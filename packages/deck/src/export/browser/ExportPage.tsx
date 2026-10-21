import { useEffect, useId, useMemo, useRef, useState } from "react";

import { parseRange } from "../../core/print-options.ts";
import { useDeck } from "../../react/context.ts";
import { PrintView } from "../../react/PrintView.tsx";
import { fileStem, plainNotes } from "../shared.ts";
import {
  Cancelled,
  type CapturedPage,
  type Progress,
  capturePages,
  imagePptx,
  markdownZip,
  pngZip,
  save,
} from "./capture.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * /export  —  the browser exporter
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every deck has it, the hosted ones too: no Playwright, no command line. A panel of choices
 * beside a live preview of exactly what will come out — the print view (PrintView) with the
 * same options the CLI passes in the address:
 *
 *   PDF          the browser's own print of the preview (Save as PDF): vector text, every page
 *                at the deck's size, no margins.
 *   PNG          a zip of a picture per page (browser/capture.ts, modern-screenshot).
 *   PowerPoint   a picture per slide with the speaker notes attached (pptxgenjs, loaded for it).
 *   Markdown     a zip of a .md file with the pictures and each slide's notes under them.
 *
 * Range, a page per click step, colour scheme, notes, scale and a transparent background apply
 * to the preview as they change. A long export shows its progress and can be cancelled.
 * The colour scheme is this window's only: the viewer's remembered choice is left alone.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Format = "pdf" | "png" | "pptx" | "md";
type Notes = "none" | "box" | "page";

const FORMATS: { id: Format; label: string; hint: string }[] = [
  {
    id: "pdf",
    label: "PDF",
    hint: "Prints the pages below with your browser: choose “Save as PDF”.",
  },
  { id: "png", label: "PNG images", hint: "A zip with a picture of every page." },
  {
    id: "pptx",
    label: "PowerPoint",
    hint: "A slide per page, each a picture, with the speaker notes.",
  },
  {
    id: "md",
    label: "Markdown",
    hint: "A zip: a .md file of the pictures, each slide’s notes under it.",
  },
];

export function ExportPage() {
  const deck = useDeck();
  const { width, height, title } = deck.config;
  const flat = useMemo(() => deck.columns.flatMap((c) => c.slides), [deck.columns]);
  const ids = {
    range: useId(),
    rangeHelp: useId(),
    status: useId(),
    scale: useId(),
    notes: useId(),
  };

  const [format, setFormat] = useState<Format>("pdf");
  const [range, setRange] = useState("");
  const [clicks, setClicks] = useState(deck.config.pdfSeparateFragments);
  const [scheme, setScheme] = useState<"light" | "dark">(deck.ui.get().colorScheme);
  const [notes, setNotes] = useState<Notes>(
    deck.config.showNotes === "separate-page" ? "page" : deck.config.showNotes ? "box" : "none",
  );
  const [scale, setScale] = useState(2);
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState<Progress | null>(null);
  const [status, setStatus] = useState("");
  const cancel = useRef(false);

  // PowerPoint and Markdown carry the notes as text: in by default (until the person says
  // otherwise), and never "on pages of their own".
  const notesTouched = useRef(false);
  useEffect(() => {
    if (format === "pdf" || format === "png") return;
    if (notes === "page" || (notes === "none" && !notesTouched.current)) setNotes("box");
  }, [format, notes]);

  const rangeError = useMemo(() => {
    try {
      const n = parseRange(range, flat.length);
      return n.length ? null : "No slide in that range.";
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [range, flat.length]);
  const chosen = useMemo(() => {
    try {
      return parseRange(range, flat.length).length;
    } catch {
      return flat.length;
    }
  }, [range, flat.length]);

  // This window shows the chosen scheme; the person's remembered choice is not touched.
  useEffect(() => {
    const before = deck.ui.get().colorScheme;
    return () => deck.ui.update((s) => ({ ...s, colorScheme: before }));
  }, [deck.ui]);
  useEffect(() => {
    deck.ui.update((s) => (s.colorScheme === scheme ? s : { ...s, colorScheme: scheme }));
  }, [deck.ui, scheme]);
  useEffect(() => {
    const was = document.title;
    document.title = `Export · ${title}`;
    return () => {
      document.title = was;
    };
  }, [title]);

  // The preview fills its column.
  const pane = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.5);
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const fit = () => setZoom(Math.max(0.1, Math.min(1, (el.clientWidth - 48) / width)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const slides = useMemo(
    () => flat.map((m) => ({ title: m.title, notes: plainNotes(m.notesText) })),
    [flat],
  );
  const stem = fileStem(title, deck.config.slug || "deck");

  const ready = async () => {
    // The pages re-render as the options change; wait until the print view says they settled
    // (after a beat, so a "ready" left over from before the last change does not count).
    await new Promise((r) => setTimeout(r, 300));
    const until = Date.now() + 60_000;
    while (Date.now() < until && !document.querySelector(".deck-print-pages[data-ready]"))
      await new Promise((r) => setTimeout(r, 100));
  };

  const run = async () => {
    if (rangeError || busy) return;
    if (format === "pdf") {
      await ready();
      setStatus("Your browser’s print dialog is open: choose “Save as PDF”.");
      const was = document.title;
      document.title = stem;
      window.print();
      document.title = was;
      setStatus("");
      return;
    }
    cancel.current = false;
    setBusy({ done: 0, total: 0 });
    setStatus("Preparing the pages…");
    try {
      await ready();
      const pages = [
        ...document.querySelectorAll<HTMLElement>(".deck-export-preview .deck-print-page"),
      ];
      const shots: CapturedPage[] = await capturePages(
        pages,
        { width, height, scale, omitBackground: transparent },
        (p) => {
          setBusy(p);
          if (p.done < p.total) setStatus(`Drawing page ${p.done + 1} of ${p.total}…`);
        },
        () => cancel.current,
      );
      setStatus("Packing…");
      if (format === "png") save(pngZip(shots), `${stem}-png.zip`, "application/zip");
      else if (format === "md")
        save(
          markdownZip(
            shots,
            notes === "none" ? slides.map((x) => ({ ...x, notes: "" })) : slides,
            stem,
          ),
          `${stem}-markdown.zip`,
          "application/zip",
        );
      else {
        const blob = await imagePptx(
          shots,
          slides,
          { width, height, title, author: deck.config.author, info: deck.config.info },
          notes !== "none",
        );
        save(
          blob,
          `${stem}.pptx`,
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        );
      }
      setStatus(`Done: ${shots.length} page${shots.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setStatus(
        e instanceof Cancelled
          ? "Cancelled."
          : `That did not work: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(null);
    }
  };

  const hint = FORMATS.find((f) => f.id === format)!.hint;
  const pictures = format !== "pdf";
  // Notes are printed on the pages for a PDF or PNGs; PowerPoint and Markdown carry them as text.
  const onPages = format === "pdf" || format === "png";
  return (
    <div className="deck-export">
      <aside className="deck-export-panel" aria-label="Export options">
        <header>
          <a className="deck-export-back" href={deck.base}>
            ← Back to the deck
          </a>
          <h1>Export</h1>
          <p className="deck-export-title">{title}</p>
        </header>

        <fieldset disabled={!!busy}>
          <legend>Format</legend>
          <div className="deck-export-formats" role="radiogroup" aria-label="Format">
            {FORMATS.map((f) => (
              <label key={f.id} className={format === f.id ? "is-on" : ""}>
                <input
                  type="radio"
                  name="deck-export-format"
                  value={f.id}
                  checked={format === f.id}
                  onChange={() => setFormat(f.id)}
                />
                {f.label}
              </label>
            ))}
          </div>
          <p className="deck-export-hint">{hint}</p>
        </fieldset>

        <fieldset disabled={!!busy}>
          <legend>Pages</legend>
          <label htmlFor={ids.range}>Slides</label>
          <input
            id={ids.range}
            type="text"
            inputMode="numeric"
            placeholder={`All ${flat.length}, or e.g. 1,3-5`}
            value={range}
            onChange={(e) => setRange(e.target.value)}
            aria-invalid={!!rangeError || undefined}
            aria-describedby={ids.rangeHelp}
          />
          <p id={ids.rangeHelp} className={rangeError ? "deck-export-error" : "deck-export-hint"}>
            {rangeError ?? `${chosen} of ${flat.length} slides.`}
          </p>
          <label className="deck-export-check">
            <input type="checkbox" checked={clicks} onChange={(e) => setClicks(e.target.checked)} />
            A page for every click step
          </label>
        </fieldset>

        <fieldset disabled={!!busy}>
          <legend>Look</legend>
          <div className="deck-export-row" role="radiogroup" aria-label="Colour scheme">
            {(["light", "dark"] as const).map((s) => (
              <label key={s} className={scheme === s ? "is-on" : ""}>
                <input
                  type="radio"
                  name="deck-export-scheme"
                  value={s}
                  checked={scheme === s}
                  onChange={() => setScheme(s)}
                />
                {s === "light" ? "Light" : "Dark"}
              </label>
            ))}
          </div>
          <label htmlFor={ids.notes}>Speaker notes</label>
          <select
            id={ids.notes}
            value={notes}
            onChange={(e) => {
              notesTouched.current = true;
              setNotes(e.target.value as Notes);
            }}
          >
            <option value="none">Leave out</option>
            <option value="box">{onPages ? "On each slide" : "Include"}</option>
            {onPages ? <option value="page">On pages of their own</option> : null}
          </select>
          {pictures ? (
            <>
              <label htmlFor={ids.scale}>Picture size</label>
              <select
                id={ids.scale}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
              >
                <option value={1}>
                  1× — {width}×{height}
                </option>
                <option value={2}>
                  2× — {width * 2}×{height * 2}
                </option>
                <option value={3}>
                  3× — {width * 3}×{height * 3}
                </option>
              </select>
              <label className="deck-export-check">
                <input
                  type="checkbox"
                  checked={transparent}
                  onChange={(e) => setTransparent(e.target.checked)}
                />
                Transparent background
              </label>
            </>
          ) : null}
        </fieldset>

        <div className="deck-export-actions">
          {busy ? (
            <>
              <progress
                max={busy.total || 1}
                value={busy.done}
                aria-label="Export progress"
                aria-describedby={ids.status}
              />
              <button type="button" onClick={() => (cancel.current = true)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="is-primary" onClick={run} disabled={!!rangeError}>
              {format === "pdf"
                ? "Print to PDF…"
                : `Export ${FORMATS.find((f) => f.id === format)!.label}`}
            </button>
          )}
          <p id={ids.status} className="deck-export-status" role="status" aria-live="polite">
            {status}
          </p>
        </div>
      </aside>

      <main className="deck-export-preview" ref={pane} aria-label="Preview">
        <PrintView
          zoom={zoom}
          options={{
            range: range.trim() && !rangeError ? range : null,
            clicks,
            notes: onPages ? (notes === "page" ? "separate-page" : notes === "box") : false,
            omitBackground: pictures && transparent,
          }}
        />
      </main>
    </div>
  );
}

export default ExportPage;
