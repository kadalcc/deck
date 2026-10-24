import { type CSSProperties, useEffect, useRef, useState } from "react";

import { Icon } from "../components/bling.tsx";
import { isEditable } from "../core/keyboard.ts";
import { flatIndex, fromFlat, totalSlides } from "../core/model.ts";
import { readItem, writeItem } from "../core/storage.ts";
import {
  autoScrollStep,
  LINE_WIDTH_CH,
  type LineWidth,
  nextSize,
  parsePrefs,
  PREFS_KEY,
  serializePrefs,
  SIZE_MAX,
  SIZE_MIN,
  SPEED_MAX,
  SPEED_MIN,
  type TeleprompterPrefs,
} from "../core/teleprompter.ts";
import { countdownFrom, formatClock, readTimer } from "../core/timer.ts";
import {
  parsePresenterState,
  type PresenterState,
  type RoomGlance,
} from "../core/window-messages.ts";
import { useDeck } from "../react/context.ts";
import { useActions, useNav, useUi } from "../react/hooks.ts";
import { NotesView } from "../react/NotesView.tsx";
import { expectedElapsed, formatPace, paceTone } from "../react/pacing.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TELEPROMPTER  —  /<slug>/teleprompter
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The speaker's notes alone, big, in a window of their own for whichever screen they read from:
 * opened from the presenter view (its Teleprompter button, Shift T, `present.teleprompter`), on
 * the screen chosen there (presenter/TeleprompterControl.tsx). The presenter view keeps its notes;
 * this is another window, not a replacement.
 *
 *   ┌ 3/12  Why it matters  │  00:12:34 +2m  │  ✋ 2  slower ━━●━━ faster  👁 34  ? 3 ┐  status
 *   │                                                                               │
 *   │        the part before this step, dimmed                                      │
 *   │ ▶ ━━━━ the part for this step, on the reading line, a third of the way down ━━ │  guide
 *   │        the parts still to come                                                 │
 *   │                                                                               │
 *   │        NEXT · 4 · The numbers — its first lines, faded                        │
 *   └──────── A− A+ · narrow medium wide · mirror · guide · ▶ speed · ☀ · ⛶ ────────┘  fades
 *
 * It follows the presenter's slide and step over the window bus exactly as the share window does
 * (react/Deck.tsx; core/window-messages.ts `takesNav`), and moves nothing itself: its keys are its
 * own — Space starts and stops the scroll, ↑ ↓ its speed, + − the size, F fullscreen, M mirror —
 * and the deck's are off here. It does not join the room: the presenter view sends it the timer
 * and the room at a glance (`presenter:state`), and without a room the room's half is not shown.
 *
 * Mirror is for the glass of a beam-splitter prompter: what is read through the glass (the status
 * and the notes) flips; the controls, used looking at the screen itself, do not. Settings are kept
 * per browser (core/teleprompter.ts); the auto-scroll never starts by itself on opening.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Where the current part is kept: a third of the way down, where the eye rests on a prompter. */
const READING_LINE = 1 / 3;
/** After a step lands, the auto-scroll waits while the notes glide to the new part. */
const STEP_HOLD_MS = 900;
const IDLE_MS = 2500;

export function TeleprompterPage() {
  const deck = useDeck();
  const actions = useActions();
  const at = useNav((s) => ({ h: s.h, v: s.v, click: s.click }));
  const fullscreen = useUi((s) => s.fullscreen);
  const [prefs, setPrefs] = useState(() => parsePrefs(readItem(PREFS_KEY)));
  const presenter = usePresenterState();
  const scroller = useRef<HTMLDivElement>(null);
  const idle = useIdle(IDLE_MS);
  const set = (patch: Partial<TeleprompterPrefs>) => setPrefs((p) => ({ ...p, ...patch }));

  useEffect(() => writeItem(PREFS_KEY, serializePrefs(prefs)), [prefs]);
  // This window's scheme, not remembered for the deck: dark is the prompter's own contrast over
  // the deck's dark tokens, light the deck's light scheme as it is.
  useEffect(() => {
    deck.ui.update((s) =>
      s.colorScheme === prefs.scheme ? s : { ...s, colorScheme: prefs.scheme },
    );
  }, [deck.ui, prefs.scheme]);
  // The runtime names the window after the deck when it mounts (after this page's effects).
  useEffect(() => {
    const t = setTimeout(() => {
      document.title = `Teleprompter · ${deck.config.title}`;
    }, 0);
    return () => clearTimeout(t);
  }, [deck.config.title]);

  useAutoScroll(scroller, prefs, `${at.h},${at.v},${at.click}`);
  useTeleprompterKeys(setPrefs, actions.toggleFullscreen);

  const meta = deck.columns[at.h]?.slides[at.v] ?? null;
  const total = totalSlides(deck.columns);
  const flat = flatIndex(deck.columns, at.h, at.v);
  const nextAt = flat + 1 < total ? fromFlat(deck.columns, flat + 1) : null;
  const next = nextAt ? (deck.columns[nextAt.h]?.slides[nextAt.v] ?? null) : null;

  const style = {
    "--tp-size": `${prefs.size}px`,
    "--tp-measure": `${LINE_WIDTH_CH[prefs.width]}ch`,
  } as CSSProperties;

  return (
    <div
      className={[
        "deck-prompter",
        `is-${prefs.scheme}`,
        prefs.mirror ? "is-mirrored" : "",
        idle ? "is-idle" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <header className="deck-prompter-status">
        <span className="deck-prompter-where">
          <b>
            {flat + 1}/{total}
          </b>
          <span>{meta?.title ?? ""}</span>
        </span>
        <TimerGlance state={presenter.state} waited={presenter.waited} at={at} />
        {presenter.state?.room ? <RoomGlanceView room={presenter.state.room} /> : null}
      </header>

      <div className="deck-prompter-read">
        <div
          ref={scroller}
          className="deck-prompter-scroll"
          data-notes-scroller
          tabIndex={0}
          aria-label="Speaker notes"
        >
          <article className="deck-prompter-current" style={{ fontSize: prefs.size }}>
            {meta?.hasNotes ? (
              <NotesView
                key={`${at.h},${at.v}`}
                meta={meta}
                click={at.click}
                fontSize={prefs.size}
                keepAt={READING_LINE}
                bare
                empty=""
              />
            ) : (
              <div className="deck-prompter-empty">
                <h1>{meta?.title ?? `Slide ${flat + 1}`}</h1>
                <p>No notes</p>
              </div>
            )}
          </article>
          <aside className="deck-prompter-next" style={{ fontSize: Math.round(prefs.size * 0.55) }}>
            {next && nextAt ? (
              <>
                <h2>
                  <span>Next</span> {flat + 2}
                  {next.title ? ` · ${next.title}` : ""}
                </h2>
                {next.hasNotes ? (
                  <NotesView
                    key={`${nextAt.h},${nextAt.v}`}
                    meta={next}
                    click={null}
                    bare
                    empty=""
                  />
                ) : null}
              </>
            ) : (
              <h2>
                <span>End of the deck</span>
              </h2>
            )}
          </aside>
        </div>
        {prefs.guide ? <div className="deck-prompter-guide" aria-hidden /> : null}
      </div>

      <Controls
        prefs={prefs}
        set={set}
        fullscreen={fullscreen}
        onFullscreen={actions.toggleFullscreen}
      />
    </div>
  );
}

/* ── the status strip ───────────────────────────────────────────────────── */

/** The presenter's timer and room, as the presenter view sends them; asked for on opening. */
function usePresenterState(): { state: PresenterState | null; waited: boolean } {
  const deck = useDeck();
  const [state, setState] = useState<PresenterState | null>(null);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const windows = deck.windows;
    if (!windows) return;
    const off = windows.subscribe((m) => {
      const s = parsePresenterState(m);
      if (s) setState(s);
    });
    const ask = () => windows.post({ type: "presenter:ask", from: deck.windowId });
    ask();
    // Asked again now and then: a presenter view reloaded mid-talk forgets who asked.
    const again = setInterval(ask, 10_000);
    const late = setTimeout(() => setWaited(true), 2500);
    return () => {
      off();
      clearInterval(again);
      clearTimeout(late);
    };
  }, [deck]);
  return { state, waited };
}

function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

function TimerGlance({
  state,
  waited,
  at,
}: {
  state: PresenterState | null;
  waited: boolean;
  at: { h: number; v: number };
}) {
  const deck = useDeck();
  const timer = state?.timer ?? null;
  const now = useNow(!!timer);
  if (!timer)
    return waited && !state ? (
      <span className="deck-prompter-timer is-quiet">No presenter view in this browser</span>
    ) : null;
  const r = readTimer(timer, now);
  const countdown = timer.mode === "countdown";
  const expected = expectedElapsed(deck, at);
  const pace = expected === null ? null : r.elapsed - expected;
  const length = countdown ? countdownFrom(timer) : timer.duration;
  const label = countdown
    ? `${formatClock(r.shown)} ${r.overtime ? "over" : "left"}`
    : `${formatClock(r.elapsed)} elapsed${length ? ` of ${formatClock(length)}` : ""}`;
  return (
    <span
      className={[
        "deck-prompter-timer",
        r.running ? "" : "is-paused",
        r.overtime ? "is-overtime" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={label}
    >
      <Icon name={countdown ? "hourglass" : "timer"} />
      <b>{formatClock(r.shown, countdown && r.overtime)}</b>
      {pace !== null ? (
        <small
          className={["deck-prompter-pace", paceTone(pace)].join(" ")}
          title={pace > 0 ? "Behind the plan for this slide" : "Ahead of the plan for this slide"}
        >
          {formatPace(pace)}
        </small>
      ) : null}
      {!r.running ? <em>paused</em> : null}
      {r.overtime ? <em className="is-over">over</em> : null}
    </span>
  );
}

function RoomGlanceView({ room }: { room: RoomGlance }) {
  const { slower, faster, total } = room.pace;
  const bias = total ? (faster - slower) / total : 0;
  const verdict = !total
    ? "No pace votes yet"
    : Math.abs(bias) < 0.2
      ? "About right"
      : bias < 0
        ? "They'd like it slower"
        : "They'd like it faster";
  return (
    <span className="deck-prompter-room">
      <span
        className={["deck-prompter-stat", room.hands ? "is-alert" : ""].join(" ")}
        title={`${room.hands} ${room.hands === 1 ? "hand" : "hands"} up`}
      >
        <Icon name="hand" />
        <b>{room.hands}</b>
      </span>
      <span
        className="deck-prompter-gauge"
        title={`${verdict}: ${slower} slower · ${faster} faster`}
      >
        <small>Slower {slower}</small>
        <span className="deck-prompter-gauge-track">
          <i style={{ left: `${50 + bias * 50}%` }} className={total ? "" : "is-idle"} />
        </span>
        <small>{faster} Faster</small>
      </span>
      <span className="deck-prompter-stat" title={`${room.viewers} watching`}>
        <Icon name="eye" />
        <b>{room.viewers}</b>
      </span>
      <span className="deck-prompter-stat" title={`${room.questions} open questions`}>
        <Icon name="message-circle-question" />
        <b>{room.questions}</b>
      </span>
    </span>
  );
}

/* ── the controls ───────────────────────────────────────────────────────── */

const WIDTHS: { id: LineWidth; label: string }[] = [
  { id: "narrow", label: "Narrow" },
  { id: "medium", label: "Medium" },
  { id: "wide", label: "Wide" },
];

function Controls({
  prefs,
  set,
  fullscreen,
  onFullscreen,
}: {
  prefs: TeleprompterPrefs;
  set: (patch: Partial<TeleprompterPrefs>) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  return (
    <div className="deck-prompter-controls" role="toolbar" aria-label="Teleprompter">
      <span className="deck-prompter-group">
        <button
          type="button"
          onClick={() => set({ size: nextSize(prefs.size, -1) })}
          disabled={prefs.size <= SIZE_MIN}
          aria-label="Smaller text (−)"
          title="Smaller text (−)"
        >
          A−
        </button>
        <output aria-label="Text size">{prefs.size}</output>
        <button
          type="button"
          onClick={() => set({ size: nextSize(prefs.size, 1) })}
          disabled={prefs.size >= SIZE_MAX}
          aria-label="Larger text (+)"
          title="Larger text (+)"
        >
          A+
        </button>
      </span>
      <span className="deck-prompter-group" role="radiogroup" aria-label="Line width">
        {WIDTHS.map((w) => (
          <button
            key={w.id}
            type="button"
            role="radio"
            aria-checked={prefs.width === w.id}
            className={prefs.width === w.id ? "is-on" : ""}
            onClick={() => set({ width: w.id })}
          >
            {w.label}
          </button>
        ))}
      </span>
      <span className="deck-prompter-group">
        <button
          type="button"
          aria-pressed={prefs.mirror}
          className={prefs.mirror ? "is-on" : ""}
          onClick={() => set({ mirror: !prefs.mirror })}
          title="Mirror left to right, for a prompter's glass (M)"
        >
          <Icon name="flip-horizontal-2" /> Mirror
        </button>
        <button
          type="button"
          aria-pressed={prefs.guide}
          className={prefs.guide ? "is-on" : ""}
          onClick={() => set({ guide: !prefs.guide })}
          title="A band across the reading line"
        >
          <Icon name="rectangle-horizontal" /> Guide
        </button>
      </span>
      <span className="deck-prompter-group">
        <button
          type="button"
          aria-pressed={prefs.auto}
          className={prefs.auto ? "is-on" : ""}
          onClick={() => set({ auto: !prefs.auto })}
          title="Scroll by itself (Space)"
        >
          <Icon name={prefs.auto ? "pause" : "play"} /> Scroll
        </button>
        <button
          type="button"
          onClick={() => set({ speed: Math.max(SPEED_MIN, prefs.speed - 1) })}
          disabled={prefs.speed <= SPEED_MIN}
          aria-label="Slower scroll (↓)"
          title="Slower (↓)"
        >
          <Icon name="minus" />
        </button>
        <output aria-label="Scroll speed">{prefs.speed}</output>
        <button
          type="button"
          onClick={() => set({ speed: Math.min(SPEED_MAX, prefs.speed + 1) })}
          disabled={prefs.speed >= SPEED_MAX}
          aria-label="Faster scroll (↑)"
          title="Faster (↑)"
        >
          <Icon name="plus" />
        </button>
      </span>
      <span className="deck-prompter-group">
        <button
          type="button"
          onClick={() => set({ scheme: prefs.scheme === "dark" ? "light" : "dark" })}
          aria-label={prefs.scheme === "dark" ? "Light" : "Dark"}
          title={
            prefs.scheme === "dark" ? "Light (the deck's light colours)" : "Dark (high contrast)"
          }
        >
          <Icon name={prefs.scheme === "dark" ? "sun" : "moon"} />
        </button>
        <button
          type="button"
          aria-pressed={fullscreen}
          className={fullscreen ? "is-on" : ""}
          onClick={onFullscreen}
          title="Fill this screen (F)"
        >
          <Icon name={fullscreen ? "minimize" : "maximize"} /> {fullscreen ? "Exit" : "Fullscreen"}
        </button>
      </span>
    </div>
  );
}

/* ── behaviour ──────────────────────────────────────────────────────────── */

/** True once the pointer has rested for `ms`: the controls fade, the cursor goes. */
function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const wake = () => {
      setIdle(false);
      if (t) clearTimeout(t);
      t = setTimeout(() => setIdle(true), ms);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [ms]);
  return idle;
}

/**
 * The classic prompter's scroll: on, it moves the notes up at the chosen speed, a frame at a time.
 * A step from the presenter still lands the notes on its part (NotesView glides them there), and
 * the scroll waits for that glide instead of fighting it. Scrolling by hand works throughout.
 */
function useAutoScroll(
  ref: React.RefObject<HTMLDivElement | null>,
  prefs: TeleprompterPrefs,
  step: string,
) {
  const hold = useRef(0);
  useEffect(() => {
    hold.current = performance.now() + STEP_HOLD_MS;
  }, [step]);
  useEffect(() => {
    if (!prefs.auto) return;
    const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let carry = 0;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(t: number) {
      const dt = t - last;
      last = t;
      const el = ref.current;
      if (el && t >= hold.current) {
        const s = autoScrollStep({
          speed: prefs.speed,
          size: prefs.size,
          dtMs: dt,
          carry,
          reduced,
        });
        carry = s.carry;
        if (s.move) el.scrollTop += s.move;
      }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [ref, prefs.auto, prefs.speed, prefs.size]);
}

function useTeleprompterKeys(
  setPrefs: (fn: (p: TeleprompterPrefs) => TeleprompterPrefs) => void,
  fullscreen: () => void,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const up = (p: TeleprompterPrefs, patch: Partial<TeleprompterPrefs>) => ({ ...p, ...patch });
      switch (e.code) {
        case "Space":
          setPrefs((p) => up(p, { auto: !p.auto }));
          break;
        case "ArrowUp":
          setPrefs((p) => up(p, { speed: Math.min(SPEED_MAX, p.speed + 1) }));
          break;
        case "ArrowDown":
          setPrefs((p) => up(p, { speed: Math.max(SPEED_MIN, p.speed - 1) }));
          break;
        case "Equal":
        case "NumpadAdd":
          setPrefs((p) => up(p, { size: nextSize(p.size, 1) }));
          break;
        case "Minus":
        case "NumpadSubtract":
          setPrefs((p) => up(p, { size: nextSize(p.size, -1) }));
          break;
        case "KeyM":
          setPrefs((p) => up(p, { mirror: !p.mirror }));
          break;
        case "KeyF":
          // A key press is a gesture in THIS window, which is what fullscreen needs.
          fullscreen();
          break;
        default:
          return;
      }
      // Space on a focused button would press it as well; ↑ ↓ would scroll the notes too.
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPrefs, fullscreen]);
}
