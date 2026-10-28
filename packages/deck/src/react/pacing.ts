import { key as navKey } from "../core/navigation.ts";
import * as N from "../core/navigation.ts";
import { createStore, type Store } from "../core/store.ts";
import type { TimerState } from "../core/timer.ts";
import type { DeckRuntime } from "./context.ts";

/**
 * When the presenter's timer started (epoch ms), for the views that show it besides the presenter
 * window's own clock: the phone remote. Written by the presenter view's timer.
 */
export const presenterClock: Store<number | null> = createStore<number | null>(null);

/**
 * The presenter's timer itself (core/timer.ts): mode, length, paused or running. Published by the
 * presenter view's timer for the phone remote, the sidebar's pace line and the `present.timer`
 * command; `presenterClock` stays beside it as the effective start, for anything that only ever
 * counted up from one.
 */
export const presenterTimer: Store<TimerState | null> = createStore<TimerState | null>(null);

/**
 * The talk's planned length in seconds: `duration`, else `totalTime`, else every visible slide's
 * `timing` (default `defaultTiming`) added up. Null when the deck plans none of these.
 */
export function plannedLength(
  deck: Pick<DeckRuntime, "columns" | "options" | "config">,
): number | null {
  if (deck.config.duration) return deck.config.duration;
  if (deck.config.totalTime) return deck.config.totalTime;
  let sum = 0;
  let any = false;
  for (const c of deck.columns)
    for (let v = 0; v < c.slides.length; v++) {
      const t = deck.options.get(navKey(c.h, v))?.timing ?? deck.config.defaultTiming;
      if (t) {
        sum += t;
        any = true;
      }
    }
  return any ? sum : null;
}

/**
 * Seconds the talk should have taken by the time it reaches this slide: the deck's `totalTime`
 * spread evenly, or the slides' `timing` (default `defaultTiming`) added up. Null without either.
 *
 * A `timing:` on some slides and no `defaultTiming` is a plan too, as `plannedLength` has always
 * read it: a slide without one plans no time. This used to need `defaultTiming`, so a deck timed
 * slide by slide had a timer and a progress bar measured against its plan but never a pace badge.
 */
export function expectedElapsed(
  deck: Pick<DeckRuntime, "columns" | "options" | "config">,
  at: { h: number; v: number },
): number | null {
  const total = deck.columns.reduce((n, c) => n + c.slides.length, 0);
  const flat = N.progressOf({ ...N.initialNav(), h: at.h, v: at.v }, deck.columns) * (total - 1);
  // `totalTime` (reveal.js) or `duration` (Slidev): the length spread evenly over the slides.
  const length = deck.config.totalTime ?? deck.config.duration;
  if (length) return (length / total) * flat;
  if (plannedLength(deck) === null) return null;
  let sum = 0;
  let i = 0;
  for (const c of deck.columns)
    for (let v = 0; v < c.slides.length; v++) {
      if (i >= flat) break;
      sum += deck.options.get(navKey(c.h, v))?.timing ?? deck.config.defaultTiming ?? 0;
      i++;
    }
  return sum;
}

/**
 * This slide's slot in the plan, in seconds from the start: when the talk should reach it and when
 * it should leave it. The first slide's slot starts at 0 and the last one's ends at the plan's end,
 * so a mark drawn from it spans the whole bar between them. Null without a plan.
 */
export function plannedSlot(
  deck: Pick<DeckRuntime, "columns" | "options" | "config">,
  at: { h: number; v: number },
): { start: number; end: number } | null {
  const start = expectedElapsed(deck, at);
  if (start === null) return null;
  const total = deck.columns.reduce((n, c) => n + c.slides.length, 0);
  const length = deck.config.totalTime ?? deck.config.duration;
  const own = length
    ? length / total
    : (deck.options.get(navKey(at.h, at.v))?.timing ?? deck.config.defaultTiming ?? 0);
  return { start, end: start + own };
}

/** Ahead, on time or behind, with the 30-second grace the presenter's timer has always given. */
export function paceTone(pace: number | null): "" | "is-behind" | "is-ahead" | "is-ok" {
  return pace === null ? "" : pace > 30 ? "is-behind" : pace < -30 ? "is-ahead" : "is-ok";
}

const pad = (n: number) => String(n).padStart(2, "0");
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
export function formatPace(pace: number): string {
  return pace > 0 ? `+${Math.round(pace / 60)}m` : `${Math.round(pace / 60)}m`;
}
