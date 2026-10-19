import { key as navKey } from "../core/navigation.ts";
import * as N from "../core/navigation.ts";
import { createStore, type Store } from "../core/store.ts";
import type { DeckRuntime } from "./context.ts";

/**
 * When the presenter's timer started (epoch ms), for the views that show it besides the presenter
 * window's own clock: the phone remote. Written by the presenter view's timer.
 */
export const presenterClock: Store<number | null> = createStore<number | null>(null);

/**
 * Seconds the talk should have taken by the time it reaches this slide: the deck's `totalTime`
 * spread evenly, or the slides' `timing` (default `defaultTiming`) added up. Null without either.
 */
export function expectedElapsed(
  deck: Pick<DeckRuntime, "columns" | "options" | "config">,
  at: { h: number; v: number },
): number | null {
  const total = deck.columns.reduce((n, c) => n + c.slides.length, 0);
  const flat = N.progressOf({ ...N.initialNav(), h: at.h, v: at.v }, deck.columns) * (total - 1);
  if (deck.config.totalTime) return (deck.config.totalTime / total) * flat;
  if (!deck.config.defaultTiming) return null;
  let sum = 0;
  let i = 0;
  for (const c of deck.columns)
    for (let v = 0; v < c.slides.length; v++) {
      if (i >= flat) break;
      sum += deck.options.get(navKey(c.h, v))?.timing ?? deck.config.defaultTiming;
      i++;
    }
  return sum;
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
