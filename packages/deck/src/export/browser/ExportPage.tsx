import {
  ArrowLeft,
  Download,
  FileImage,
  FileText,
  type LucideIcon,
  Moon,
  NotebookText,
  Presentation,
  Printer,
  Sun,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

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

const FORMATS: { id: Format; label: string; file: string; icon: LucideIcon; hint: string }[] = [
  {
    id: "pdf",
    label: "PDF",
    file: ".pdf",
    icon: FileText,
    hint: "Prints the pages with your browser: choose “Save as PDF”.",
  },
  {
    id: "png",
    label: "PNG images",
    file: ".zip of .png",
    icon: FileImage,
    hint: "A zip with a picture of every page.",
  },
  {
    id: "pptx",
    label: "PowerPoint",
    file: ".pptx",
    icon: Presentation,
    hint: "A slide per page, each a picture, with the speaker notes.",
  },
  {
    id: "md",
    label: "Markdown",
    file: ".zip of .md",
    icon: NotebookText,
    hint: "A zip: a .md file of the pictures, each slide’s notes under it.",
  },
];

/** A row of choices that reads as one control: radios underneath, so arrows and Tab work. */
function Choice<T extends string | number>({
  name,
  labelledBy,
  value,
  options,
  onChange,
}: {
  name: string;
  labelledBy: string;
  value: T;
  options: { id: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="deck-export-seg" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((o) => (
        <label key={o.id} className={value === o.id ? "is-on" : ""}>
          <input
            type="radio"
            name={name}
            value={o.id}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

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
    scheme: useId(),
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

  // How many pages come out: the print view's, counted once it settles (clicks and notes pages
  // make it more than the slides).
  const [pageCount, setPageCount] = useState<number | null>(null);
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const count = () => {
      const pages = el.querySelector(".deck-print-pages");
      setPageCount(
        pages?.hasAttribute("data-ready")
          ? pages.querySelectorAll(".deck-print-page").length
          : null,
      );
    };
    count();
    const mo = new MutationObserver(count);
    mo.observe(el, { subtree: true, childList: true, attributeFilter: ["data-ready"] });
    return () => mo.disconnect();
  }, []);

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

  const current = FORMATS.find((f) => f.id === format)!;
  const pictures = format !== "pdf";
  // Notes are printed on the pages for a PDF or PNGs; PowerPoint and Markdown carry them as text.
  const onPages = format === "pdf" || format === "png";
  const size = pictures ? `${width * scale}×${height * scale}` : `${width}×${height}`;
  const Go = format === "pdf" ? Printer : Download;
  return (
    <div className="deck-export">
      <aside className="deck-export-panel" aria-label="Export options">
        <div className="deck-export-scroll">
          <header>
            <a className="deck-export-back" href={deck.base}>
              <ArrowLeft aria-hidden="true" />
              Back to the deck
            </a>
            <h1>Export</h1>
            <p className="deck-export-title">{title}</p>
          </header>

          <fieldset disabled={!!busy}>
            <legend>Format</legend>
            <div className="deck-export-formats" role="radiogroup" aria-label="Format">
              {FORMATS.map(({ id, label, file, icon: Icon }) => (
                <label key={id} className={format === id ? "is-on" : ""}>
                  <input
                    type="radio"
                    name="deck-export-format"
                    value={id}
                    checked={format === id}
                    onChange={() => setFormat(id)}
                  />
                  <Icon aria-hidden="true" />
                  <span className="deck-export-format-name">{label}</span>
                  <span className="deck-export-format-file">{file}</span>
                </label>
              ))}
            </div>
            <p className="deck-export-hint">{current.hint}</p>
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
              <input
                type="checkbox"
                checked={clicks}
                onChange={(e) => setClicks(e.target.checked)}
              />
              A page for every click step
            </label>
          </fieldset>

          <fieldset disabled={!!busy}>
            <legend>Look</legend>
            <span className="deck-export-label" id={ids.scheme}>
              Colours
            </span>
            <Choice
              name="deck-export-scheme"
              labelledBy={ids.scheme}
              value={scheme}
              onChange={setScheme}
              options={[
                {
                  id: "light",
                  label: (
                    <>
                      <Sun aria-hidden="true" /> Light
                    </>
                  ),
                },
                {
                  id: "dark",
                  label: (
                    <>
                      <Moon aria-hidden="true" /> Dark
                    </>
                  ),
                },
              ]}
            />
            <span className="deck-export-label" id={ids.notes}>
              Speaker notes
            </span>
            <Choice<Notes>
              name="deck-export-notes"
              labelledBy={ids.notes}
              value={notes}
              onChange={(v) => {
                notesTouched.current = true;
                setNotes(v);
              }}
              options={[
                { id: "none", label: "Leave out" },
                { id: "box", label: onPages ? "On slides" : "Include" },
                ...(onPages ? [{ id: "page" as const, label: "Own pages" }] : []),
              ]}
            />
            {pictures ? (
              <>
                <span className="deck-export-label" id={ids.scale}>
                  Picture size
                </span>
                <Choice<number>
                  name="deck-export-scale"
                  labelledBy={ids.scale}
                  value={scale}
                  onChange={setScale}
                  options={[1, 2, 3].map((n) => ({ id: n, label: `${n}×` }))}
                />
                <p className="deck-export-hint">
                  {width * scale}×{height * scale} pixels a page.
                </p>
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
        </div>

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
              <Go aria-hidden="true" />
              {format === "pdf" ? "Print to PDF…" : `Export ${current.label}`}
            </button>
          )}
          {status ? null : (
            <p className="deck-export-summary">
              {rangeError ? "" : `${pageCount ?? "…"} page${pageCount === 1 ? "" : "s"} · ${size}`}
            </p>
          )}
          <p id={ids.status} className="deck-export-status" role="status" aria-live="polite">
            {status}
          </p>
        </div>
      </aside>

      <main className="deck-export-preview" ref={pane} aria-label="Preview">
        <div className="deck-export-preview-bar" aria-hidden="true">
          <span>Preview</span>
          <span>{pageCount == null ? "Laying out…" : `${pageCount} pages`}</span>
        </div>
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
