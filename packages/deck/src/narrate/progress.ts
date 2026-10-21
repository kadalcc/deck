import type { NarrationState } from "./player.ts";
import type { Timeline } from "./text.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE THE NARRATION IS, ON THE TIMELINE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The timeline (text.ts) lays each slide out as its segments' ESTIMATED lengths, each followed by
 * the gap. The narrator reports what it is doing now — loading, speaking, waiting the gap,
 * dwelling on a silent slide — with when that began and how long it expects it to take.
 *
 * The bar used to add the elapsed wall time to the start of the current step, which went wrong at
 * every boundary: the gap after a segment restarted the clock while the step stayed the same (the
 * fill fell back to the step's start, then leapt on), a real voice that ran longer than the
 * estimate carried the fill past the next step's start (and back), and the end never filled.
 *
 * Here each phase moves only through its own slot: speaking crosses the segment's estimated slot
 * at the pace the voice is actually going, the gap crosses the gap, and "ended" is the whole
 * talk. So within a play the position only goes forward; only a move back (a seek, Back, a person
 * paging) takes it back.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type PositionState = Pick<
  NarrationState,
  "phase" | "slide" | "segment" | "part" | "startedAt" | "expectedMs"
>;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Milliseconds into `timeline` that `s` stands for at `now`. */
export function narrationPosition(
  timeline: Timeline,
  gap: number,
  s: PositionState,
  now: number,
): number {
  if (s.phase === "ended") return timeline.total;
  const entry = timeline.slides[s.slide];
  if (!entry) return 0;
  /** Where segment `k` of this slide starts: each earlier segment that says something, plus its gap. */
  const startOf = (k: number) =>
    entry.start +
    entry.ms.slice(0, Math.max(0, k)).reduce((n, m) => n + m + (m > 0 ? gap : 0), 0);
  const k = s.part >= 0 ? s.part : s.segment;
  const slot = entry.ms[k] ?? 0;
  const done = s.expectedMs > 0 ? clamp01((now - s.startedAt) / s.expectedMs) : 1;
  let at: number;
  switch (s.phase) {
    case "speaking":
    case "dwell":
      at = startOf(k) + done * slot;
      break;
    case "loading":
      at = startOf(k);
      break;
    case "gap":
      at = startOf(k) + slot + done * (slot > 0 ? gap : 0);
      break;
    default:
      // Idle or paused: play says this step again from its start.
      at = startOf(s.segment);
  }
  return Math.min(timeline.total, Math.max(0, at));
}

/**
 * Keeps the fill from stepping back while the narration plays forward: an estimate that runs
 * a little behind the voice (or a step that starts a beat early) must not twitch the bar. Anything
 * that really moves back — a seek, Back, a person paging to an earlier step — is let through.
 */
export function steadyPosition(
  prev: { at: number; slide: number; segment: number } | null,
  next: { at: number; slide: number; segment: number },
  playing: boolean,
): number {
  if (!prev || !playing) return next.at;
  const forward =
    next.slide > prev.slide || (next.slide === prev.slide && next.segment >= prev.segment);
  return forward ? Math.max(prev.at, next.at) : next.at;
}
