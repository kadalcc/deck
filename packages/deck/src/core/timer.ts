/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PRESENTER'S TIMER, AS DATA
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A stopwatch or a countdown that can be paused, resumed and reset, as pure functions of a small
 * state and the time now — so the presenter view, the phone remote and an agent all read the same
 * numbers, and a reload in the middle of a talk picks up exactly where it was.
 *
 *   anchor   when the running span began (epoch ms), or null while paused
 *   banked   milliseconds counted before that span (every earlier span, added up)
 *
 * Elapsed is `banked + (now − anchor)`. Pausing banks the span and drops the anchor; resuming
 * sets a new anchor. Nothing ticks: a view that wants to show the time asks for it.
 *
 * Headmatter, Slidev's spelling: `timer: stopwatch | countdown` and `duration: 30min` (also `1h`,
 * `90s`, `1h30m`, `25:00`, or a plain number of minutes). Without a duration the countdown runs
 * from the deck's planned length — `totalTime`, or every slide's `timing` added up — and from
 * thirty minutes, Slidev's default, when the deck plans nothing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TimerMode = "stopwatch" | "countdown";

export interface TimerState {
  mode: TimerMode;
  /** The talk's length in seconds, for the countdown and the progress bar; null = unplanned. */
  duration: number | null;
  /** When the running span began (epoch ms); null while paused. */
  anchor: number | null;
  /** Milliseconds counted before the running span. */
  banked: number;
}

/** Thirty minutes, as Slidev: what a countdown counts from when the deck plans no length. */
export const DEFAULT_COUNTDOWN = 30 * 60;

/**
 * A duration in seconds, from any of the spellings a deck might use: `30min`, `30m`, `1h`,
 * `1h30m`, `1.5h`, `90s`, `45sec`, `25:00` (mm:ss), `1:05:00` (h:mm:ss), `"20"` or `20` (minutes,
 * as Slidev reads a bare number). Null for anything else, or for zero and below.
 */
export function parseDuration(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value * 60 : null;
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return parseDuration(Number(s));
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(s);
  if (clock) {
    const [, h, m, sec] = clock;
    const total = Number(h ?? 0) * 3600 + Number(m) * 60 + Number(sec);
    return total > 0 ? total : null;
  }
  const unit: Record<string, number> = {
    h: 3600,
    hr: 3600,
    hrs: 3600,
    hour: 3600,
    hours: 3600,
    m: 60,
    min: 60,
    mins: 60,
    minute: 60,
    minutes: 60,
    s: 1,
    sec: 1,
    secs: 1,
    second: 1,
    seconds: 1,
  };
  const parts = [...s.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/g)];
  // Every character must belong to a part: "30 minutes and change" is not a duration.
  if (
    !parts.length ||
    parts
      .map((p) => p[0])
      .join("")
      .replace(/\s+/g, "") !== s.replace(/\s+/g, "")
  )
    return null;
  let total = 0;
  for (const [, n, u] of parts) {
    const k = unit[u!];
    if (!k) return null;
    total += Number(n) * k;
  }
  return total > 0 ? Math.round(total) : null;
}

/** `timer:` from headmatter: only the two modes, anything else is the stopwatch. */
export function parseTimerMode(value: unknown): TimerMode {
  return value === "countdown" ? "countdown" : "stopwatch";
}

export function createTimer(
  mode: TimerMode,
  duration: number | null,
  now: number,
  running = true,
): TimerState {
  return { mode, duration, anchor: running ? now : null, banked: 0 };
}

export function elapsedMs(t: TimerState, now: number): number {
  return Math.max(0, t.banked + (t.anchor === null ? 0 : now - t.anchor));
}

export const isRunning = (t: TimerState) => t.anchor !== null;

export function pause(t: TimerState, now: number): TimerState {
  if (t.anchor === null) return t;
  return { ...t, anchor: null, banked: elapsedMs(t, now) };
}

export function resume(t: TimerState, now: number): TimerState {
  return t.anchor === null ? { ...t, anchor: now } : t;
}

export function toggle(t: TimerState, now: number): TimerState {
  return t.anchor === null ? resume(t, now) : pause(t, now);
}

/** Back to zero. A running timer keeps running from zero; a paused one waits at zero. */
export function reset(t: TimerState, now: number): TimerState {
  return { ...t, banked: 0, anchor: t.anchor === null ? null : now };
}

export function setMode(t: TimerState, mode: TimerMode): TimerState {
  return t.mode === mode ? t : { ...t, mode };
}

export function setDuration(t: TimerState, duration: number | null): TimerState {
  const d = duration !== null && Number.isFinite(duration) && duration > 0 ? duration : null;
  return t.duration === d ? t : { ...t, duration: d };
}

/** The length a countdown runs from: the timer's own, else thirty minutes. */
export const countdownFrom = (t: TimerState) => t.duration ?? DEFAULT_COUNTDOWN;

export interface TimerReading {
  /** Seconds since the start, paused spans left out. */
  elapsed: number;
  /** Seconds to go (countdown) — negative once over. Null for a stopwatch without a duration. */
  remaining: number | null;
  /** What the big number shows: elapsed for the stopwatch, what is left for the countdown. */
  shown: number;
  /** 0–1 through the planned length; null when there is none. Can pass 1. */
  progress: number | null;
  /** Past the planned length. */
  overtime: boolean;
  running: boolean;
}

export function readTimer(t: TimerState, now: number): TimerReading {
  const elapsed = elapsedMs(t, now) / 1000;
  const length = t.mode === "countdown" ? countdownFrom(t) : t.duration;
  const remaining = length === null ? null : length - elapsed;
  return {
    elapsed,
    remaining,
    shown: t.mode === "countdown" ? Math.abs(remaining ?? 0) : elapsed,
    progress: length ? elapsed / length : null,
    overtime: remaining !== null && remaining < 0,
    running: t.anchor !== null,
  };
}

/** `01:02:03`, or `-00:02:13` for time past a countdown's end. */
export function formatClock(seconds: number, negative = false): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const s = Math.max(0, Math.floor(Math.abs(seconds)));
  const text = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return negative ? `-${text}` : text;
}

/** Storage: the state as a string, and back (null for anything that is not a timer). */
export function serializeTimer(t: TimerState): string {
  return JSON.stringify(t);
}

export function parseTimer(raw: string | null): TimerState | null {
  if (!raw) return null;
  // The presenter used to keep only its start time; a reload across the upgrade keeps the talk.
  if (/^\d+$/.test(raw)) {
    const at = Number(raw);
    return at > 0 ? { mode: "stopwatch", duration: null, anchor: at, banked: 0 } : null;
  }
  try {
    const v = JSON.parse(raw) as Partial<TimerState>;
    if (v.mode !== "stopwatch" && v.mode !== "countdown") return null;
    if (v.anchor !== null && typeof v.anchor !== "number") return null;
    if (typeof v.banked !== "number" || !Number.isFinite(v.banked) || v.banked < 0) return null;
    const duration = typeof v.duration === "number" && v.duration > 0 ? v.duration : null;
    return { mode: v.mode, duration, anchor: v.anchor ?? null, banked: v.banked };
  } catch {
    return null;
  }
}

/**
 * What a phone is told about the timer. Times on the phone are its own: `elapsedMs` is what the
 * presenter had counted when it sent this, so the phone adds only the time since it RECEIVED it,
 * and a phone whose clock is a minute out still shows the presenter's time.
 */
export interface RemoteTimer {
  mode: TimerMode;
  duration: number | null;
  elapsedMs: number;
  running: boolean;
}

export function remoteTimer(t: TimerState, now: number): RemoteTimer {
  return {
    mode: t.mode,
    duration: t.duration,
    elapsedMs: elapsedMs(t, now),
    running: isRunning(t),
  };
}

/** The phone's own copy, anchored at the moment it arrived. */
export function fromRemote(r: RemoteTimer, receivedAt: number): TimerState {
  return {
    mode: r.mode,
    duration: r.duration,
    banked: r.running ? 0 : r.elapsedMs,
    anchor: r.running ? receivedAt - r.elapsedMs : null,
  };
}
