import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { Icon } from "../components/bling.tsx";
import { readItem, writeItem } from "../core/storage.ts";
import { useStore } from "../core/store.ts";
import {
  countdownFrom,
  createTimer,
  formatClock,
  parseDuration,
  parseTimer,
  pause,
  readTimer,
  reset,
  resume,
  serializeTimer,
  setDuration,
  setMode,
  type TimerMode,
  type TimerState,
  toggle,
} from "../core/timer.ts";
import { useCommand } from "../react/commands.ts";
import { type DeckRuntime, useDeck } from "../react/context.ts";
import { useNav } from "../react/hooks.ts";
import {
  expectedElapsed,
  plannedSlot,
  formatPace,
  paceTone,
  plannedLength,
  presenterClock,
  presenterTimer,
} from "../react/pacing.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PRESENTER'S TIMER  —  stopwatch or countdown, pause, reset, progress, pacing
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The state machine is core/timer.ts; this is its face in the presenter's top bar, two rows no
 * taller than the toolbar's two beside it:
 *
 *   00:12:34 [PAUSED]               the time (click: pause / resume), and why it is not moving
 *   ⏸ ↺ ⌄  +2m   23:37             play/pause, reset, the settings; the pacing badge; the clock
 *   ▬▬▬▬▬▬▬▬▬▬▬▬▬[▬]▬▬▬            along the bar's bottom edge, the progress through the talk
 *                                   with this slide's slot in the plan marked
 *
 * It was one long row — buttons, a 22px time, the badge, the flag, then the clock on its own —
 * and with the title beside it took a third of a 1440px bar; stacked, it takes about 190px.
 *
 * `timer: countdown` and `duration: 30min` in the headmatter choose the mode and the length; the
 * settings popover changes both for this talk. The talk's length is otherwise its plan
 * (`totalTime`, or the slides' `timing` added up), so a deck that only sets `defaultTiming` still
 * gets a progress bar. The pacing badge — how far ahead or behind the plan for THIS slide — is
 * Kadal's own, and works in either mode.
 *
 * It is kept for the life of the TAB (sessionStorage), not the page load: a reload mid-talk — a
 * new build, a slide that would not load — carries on where it was, paused or running. The phone
 * remote, the sidebar's schedule line, the teleprompter (through the window bus) and the
 * `present.timer` command read the same state through `presenterTimer` (react/pacing.ts).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const keyOf = (deck: DeckRuntime) => `deck.presenter.timer.${deck.config.slug || "deck"}`;
/** Where the presenter kept only a start time, before the timer could pause: still read once. */
const legacyKeyOf = (deck: DeckRuntime) => `deck.presenter.start.${deck.config.slug || "deck"}`;
/** The headmatter the stored timer was made from: a changed `timer:`/`duration:` is taken up. */
const configKeyOf = (deck: DeckRuntime) =>
  `deck.presenter.timer-config.${deck.config.slug || "deck"}`;

function configured(deck: DeckRuntime): { mode: TimerMode; duration: number | null; tag: string } {
  const mode = deck.config.timer;
  const duration = deck.config.duration ?? plannedLength(deck);
  return { mode, duration, tag: `${mode}:${duration ?? ""}` };
}

function initialTimer(deck: DeckRuntime): TimerState {
  const now = Date.now();
  const cfg = configured(deck);
  const stored = parseTimer(
    readItem(keyOf(deck), "session") ?? readItem(legacyKeyOf(deck), "session"),
  );
  if (!stored) return createTimer(cfg.mode, cfg.duration, now);
  // The deck's own timer settings changed since this tab stored its timer: take the new ones up,
  // keep the time counted.
  if (readItem(configKeyOf(deck), "session") !== cfg.tag)
    return setDuration(setMode(stored, cfg.mode), cfg.duration);
  return stored;
}

/** The timer's state for this presenter tab: kept, published, and a command. */
function usePresenterTimer() {
  const deck = useDeck();
  const [timer, setTimer] = useState(() => initialTimer(deck));
  useEffect(() => {
    writeItem(keyOf(deck), serializeTimer(timer), "session");
    writeItem(configKeyOf(deck), configured(deck).tag, "session");
    presenterTimer.set(timer);
    // The effective start, for anything that only ever counted up from one; null while paused.
    presenterClock.set(timer.anchor === null ? null : timer.anchor - timer.banked);
  }, [timer, deck]);
  useEffect(
    () => () => {
      presenterTimer.set(null);
      presenterClock.set(null);
    },
    [],
  );
  const apply = (fn: (t: TimerState, now: number) => TimerState) =>
    setTimer((t) => fn(t, Date.now()));
  const latest = useRef(timer);
  latest.current = timer;
  useCommand({
    id: "present.timer",
    title: "Presenter timer",
    description:
      'Read or control the presenter\'s timer: pause, resume, toggle or reset it, switch between stopwatch and countdown, or set the talk\'s length (e.g. "30min", "1h", or minutes).',
    group: "present",
    enabled: () => deck.mode === "presenter",
    params: z
      .object({
        action: z.enum(["state", "pause", "resume", "toggle", "reset"]).optional(),
        mode: z.enum(["stopwatch", "countdown"]).optional(),
        duration: z
          .union([z.string(), z.number()])
          .optional()
          .describe("30min, 1h, 90s, or minutes"),
      })
      .strict(),
    run: (p) => {
      const now = Date.now();
      let t = latest.current;
      if (p.action === "pause") t = pause(t, now);
      else if (p.action === "resume") t = resume(t, now);
      else if (p.action === "toggle") t = toggle(t, now);
      else if (p.action === "reset") t = reset(t, now);
      if (p.mode) t = setMode(t, p.mode);
      if (p.duration !== undefined) {
        const d = parseDuration(p.duration);
        if (d === null) throw new Error(`"${p.duration}" is not a duration (try 30min, 1h, 90s).`);
        t = setDuration(t, d);
      }
      if (t !== latest.current) setTimer(t);
      return { ...readTimer(t, now), mode: t.mode, duration: t.duration };
    },
  });
  return { timer, setTimer, apply };
}

/** The time of day, beside the talk's: when the room has to be out by is a wall-clock time. */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="deck-presenter-clock" title="The time now">
      {pad(now.getHours())}:{pad(now.getMinutes())}
    </span>
  );
}

/** A clock that re-renders twice a second while `on`. */
function useNow(on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

export function PresenterTimer() {
  const deck = useDeck();
  const { timer, setTimer, apply } = usePresenterTimer();
  const nav = useNav((s) => ({ h: s.h, v: s.v }));
  const now = useNow();
  const [menu, setMenu] = useState(false);
  const r = readTimer(timer, now);
  const expected = expectedElapsed(deck, nav);
  const slot = plannedSlot(deck, nav);
  const pace = expected === null ? null : r.elapsed - expected;
  const length = timer.mode === "countdown" ? countdownFrom(timer) : timer.duration;
  const countdown = timer.mode === "countdown";
  const label = countdown
    ? r.overtime
      ? `${formatClock(r.shown)} over`
      : `${formatClock(r.shown)} left`
    : `${formatClock(r.shown)} elapsed`;
  return (
    <div
      className={[
        "deck-timer",
        r.running ? "is-running" : "is-paused",
        r.overtime ? "is-overtime" : "",
        countdown ? "is-countdown" : "is-stopwatch",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className={["deck-presenter-timer", paceTone(pace)].join(" ")}
        onClick={() => apply(toggle)}
        title={`${label} — click to ${r.running ? "pause" : "resume"}`}
        aria-label={label}
      >
        <span className="deck-timer-time">{formatClock(r.shown, countdown && r.overtime)}</span>
        {!r.running ? <span className="deck-timer-flag">paused</span> : null}
        {r.overtime && !countdown ? <span className="deck-timer-flag is-over">over</span> : null}
      </button>
      <div className="deck-timer-row">
        <button
          type="button"
          className="deck-timer-play"
          onClick={() => apply(toggle)}
          aria-label={r.running ? "Pause the timer" : "Resume the timer"}
          title={r.running ? "Pause" : "Resume"}
        >
          <Icon name={r.running ? "pause" : "play"} />
        </button>
        <button
          type="button"
          className="deck-timer-btn"
          onClick={() => apply(reset)}
          aria-label="Reset the timer"
          title="Reset to zero"
        >
          <Icon name="rotate-ccw" />
        </button>
        <div className="deck-timer-menu-wrap">
          <button
            type="button"
            className="deck-timer-btn"
            onClick={() => setMenu((m) => !m)}
            aria-label="Timer settings"
            aria-haspopup="dialog"
            aria-expanded={menu}
            title="Stopwatch or countdown, and the talk's length"
          >
            <Icon name="chevron-down" />
          </button>
          {menu ? (
            <TimerSettings timer={timer} onChange={setTimer} onClose={() => setMenu(false)} />
          ) : null}
        </div>
        {pace !== null ? (
          <small
            className={["deck-timer-pace", paceTone(pace)].join(" ")}
            title={pace > 0 ? "Behind the plan for this slide" : "Ahead of the plan for this slide"}
          >
            {formatPace(pace)}
          </small>
        ) : null}
        <Clock />
      </div>
      {length ? (
        <div
          className="deck-timer-progress"
          role="progressbar"
          aria-label="Time through the talk"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(1, r.progress ?? 0) * 100)}
        >
          <i style={{ width: `${Math.min(100, (r.progress ?? 0) * 100)}%` }} />
          {slot && length ? (
            // This slide's slot in the plan: from when the talk should reach it to when it should
            // leave it. A tick at the slot's start sat a whole slide short of the end on the last
            // slide, while the first slide's sat exactly on the start.
            <b
              style={{
                left: `${Math.min(100, (slot.start / length) * 100)}%`,
                width: `${Math.max(0, Math.min(100, (slot.end / length) * 100) - Math.min(100, (slot.start / length) * 100))}%`,
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TimerSettings({
  timer,
  onChange,
  onClose,
}: {
  timer: TimerState;
  onChange: (t: TimerState) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(() =>
    timer.duration ? `${Math.round((timer.duration / 60) * 10) / 10}min` : "",
  );
  const parsed = text.trim() ? parseDuration(text) : null;
  const invalid = !!text.trim() && parsed === null;
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [onClose]);
  const commit = () => {
    if (!invalid) onChange(setDuration(timer, parsed));
  };
  return (
    <div
      ref={box}
      className="deck-timer-settings"
      role="dialog"
      aria-label="Timer settings"
      data-deck-own-keys
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if (e.key === "Enter") {
          commit();
          onClose();
        }
      }}
    >
      <div className="deck-timer-segment" role="radiogroup" aria-label="Mode">
        {(["stopwatch", "countdown"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={timer.mode === m}
            className={timer.mode === m ? "is-on" : ""}
            onClick={() => onChange(setMode(timer, m))}
          >
            <Icon name={m === "stopwatch" ? "timer" : "hourglass"} />
            {m === "stopwatch" ? "Stopwatch" : "Countdown"}
          </button>
        ))}
      </div>
      <label className="deck-timer-length">
        <span>Length</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          placeholder={timer.mode === "countdown" ? "30min" : "none"}
          aria-invalid={invalid || undefined}
          spellCheck={false}
        />
      </label>
      <p className="deck-timer-hint">
        {invalid ? (
          "Try 30min, 1h, 1h30m, 90s, 25:00 or a number of minutes."
        ) : (
          <>
            For this talk only: the deck's own is <code>duration:</code> in the headmatter.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * The schedule, in words, for the sidebar's pace card beside the audience's votes: are we ahead
 * or behind the plan for this slide, and how much of the talk has gone.
 */
export function ScheduleLine() {
  const deck = useDeck();
  const timer = useStore(presenterTimer);
  const nav = useNav((s) => ({ h: s.h, v: s.v }));
  const now = useNow(!!timer);
  if (!timer) return null;
  const r = readTimer(timer, now);
  const expected = expectedElapsed(deck, nav);
  const pace = expected === null ? null : r.elapsed - expected;
  const tone = paceTone(pace);
  const words =
    pace === null
      ? "No plan to pace against: set duration, totalTime, defaultTiming or a slide's timing."
      : tone === "is-behind"
        ? `${formatPace(pace)} behind the plan for this slide`
        : tone === "is-ahead"
          ? `${formatPace(pace).replace("-", "")} ahead of the plan`
          : "On time";
  const length = timer.mode === "countdown" ? countdownFrom(timer) : timer.duration;
  return (
    <p className={["deck-side-schedule", tone].join(" ")}>
      <Icon name={r.running ? "timer" : "pause"} />
      <span>{words}</span>
      <small>
        {formatClock(r.elapsed)}
        {length ? ` of ${formatClock(length)}` : ""}
        {r.running ? "" : " · paused"}
      </small>
    </p>
  );
}
