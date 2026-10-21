import { useEffect, useRef, useState } from "react";

import { key as navKey } from "../core/navigation.ts";
import { useDeck } from "./context.ts";
import { useActions, useNav } from "./hooks.ts";
import { NotesView } from "./NotesView.tsx";
import { SlideFrame } from "./SlideFrame.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * /overview  —  EVERY SLIDE, EVERY STEP, EVERY NOTE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Slidev's slides overview, for reviewing a talk: each slide in order (vertical stacks as their
 * own rows, numbered 3.2), at a size you can read, with a slider through its click steps and its
 * notes beside it — the part for the step on the slider highlighted, its markers moving the
 * slider. A thumbnail opens the deck at that step. In `kadal-deck dev` (or with a host's
 * `notesEditor`) the notes are editable here as in the presenter view.
 *
 * It follows the deck in this browser and the room like any other window: the slide being
 * presented is ringed, and kept in view while "Follow" is on. Slides mount as they scroll near,
 * so a long deck opens at once.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function OverviewPage() {
  const deck = useDeck();
  const at = useNav((s) => ({ h: s.h, v: s.v }));
  const [follow, setFollow] = useState(true);
  const rows = deck.columns.flatMap((c) => c.slides.map((meta, v) => ({ meta, h: c.h, v })));
  useEffect(() => {
    if (!follow) return;
    document
      .querySelector<HTMLElement>(".deck-ov-row.is-current")
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [at.h, at.v, follow]);
  return (
    <div className="deck-ov-page">
      <header className="deck-ov-head">
        <h1>{deck.config.title}</h1>
        <span className="deck-muted">
          {rows.length} slides{deck.notesEditor ? " · notes are editable" : ""}
        </span>
        <span className="deck-ov-spacer" />
        <label className="deck-ov-follow">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Keep the current slide in view
        </label>
        <nav>
          <a href={deck.base}>Deck</a>
          <a href={`${deck.base}notes`}>Notes</a>
          {deck.notesEditor ? <a href={`${deck.base}notes-edit`}>Edit all notes</a> : null}
        </nav>
      </header>
      <ol className="deck-ov-list">
        {rows.map((r) => (
          <OverviewRow key={`${r.h},${r.v}`} {...r} current={r.h === at.h && r.v === at.v} />
        ))}
      </ol>
    </div>
  );
}

function OverviewRow({
  meta,
  h,
  v,
  current,
}: {
  meta: ReturnType<typeof useDeck>["columns"][number]["slides"][number];
  h: number;
  v: number;
  current: boolean;
}) {
  const deck = useDeck();
  const actions = useActions();
  const options = deck.options.get(navKey(h, v))!;
  const total = useNav((s) => s.totals[navKey(h, v)] ?? 0);
  const presented = useNav((s) => (s.h === h && s.v === v ? s.click : null));
  const [step, setStep] = useState(0);
  const row = useRef<HTMLLIElement>(null);
  const [near, setNear] = useState(false);
  // Mount the slide once it scrolls near, and keep it: a deck of eighty opens without eighty slides.
  useEffect(() => {
    const el = row.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") return setNear(true);
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setNear(true),
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  // The presenter's step, on the slide being presented, until the slider is moved by hand.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (presented !== null && !touched) setStep(presented);
  }, [presented, touched]);
  const shown = Math.min(step, total);
  const label = `${h + 1}${v ? `.${v + 1}` : ""}`;
  // 480px wide, or the row's width on a phone: measured, so the slide scales to the box it has.
  const thumb = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  useEffect(() => {
    const el = thumb.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.round(e.contentRect.width) || 480));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = width / deck.config.width;
  const hash = `#/${h}${v || shown ? `/${v}` : ""}${shown ? `/${shown}` : ""}`;
  return (
    <li ref={row} className={["deck-ov-row", current ? "is-current" : ""].join(" ")}>
      <div className="deck-ov-num" aria-hidden>
        {label}
      </div>
      <div className="deck-ov-slide">
        {/* The link lies over the slide rather than around it: a slide can hold buttons and
            links of its own, which may not sit inside another link. */}
        <div
          ref={thumb}
          className="deck-ov-thumb"
          style={{ aspectRatio: `${deck.config.width} / ${deck.config.height}` }}
        >
          {near ? (
            <div
              className="deck-ov-canvas"
              inert
              style={{
                width: deck.config.width,
                height: deck.config.height,
                transform: `scale(${scale})`,
              }}
            >
              <SlideFrame
                meta={meta}
                options={options}
                h={h}
                v={v}
                active={false}
                click={shown}
                preview
                // How many steps the slider has: the slide says, as it does on the stage.
                reportTotal
                // A mirror, not a tile: a tile shows every step at once, this shows the slider's.
                className="is-mirror"
              />
            </div>
          ) : null}
          <a
            className="deck-ov-open"
            href={`${deck.base}${hash}`}
            aria-label={`Open slide ${label}${meta.title ? `, ${meta.title}` : ""}${shown ? `, at step ${shown}` : ""}`}
          />
        </div>
        <div className="deck-ov-steps">
          {total > 0 ? (
            <>
              <input
                type="range"
                min={0}
                max={total}
                step={1}
                value={shown}
                aria-label={`Step on slide ${label}`}
                aria-valuetext={`Step ${shown} of ${total}`}
                onChange={(e) => {
                  setTouched(true);
                  setStep(Number(e.target.value));
                }}
              />
              <span className="deck-ov-step-label">
                {shown} / {total}
              </span>
            </>
          ) : (
            <span className="deck-muted">No steps</span>
          )}
          <button
            type="button"
            className="deck-ov-go"
            onClick={() => actions.goto(h, v, shown)}
            title="Move the deck here (this browser's deck windows follow)"
          >
            Go
          </button>
        </div>
      </div>
      <div className="deck-ov-notes">
        <h2>{meta.title ?? <span className="deck-muted">Untitled</span>}</h2>
        <NotesView
          meta={meta}
          click={shown}
          onJump={(s) => {
            setTouched(true);
            setStep(s);
          }}
          empty="No notes."
        />
      </div>
    </li>
  );
}
