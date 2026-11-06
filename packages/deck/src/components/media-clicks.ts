import { useContext, useMemo } from "react";

import type { ClickAt } from "../core/clicks.ts";
import { useConfig } from "../react/hooks.ts";
import { ClickShownContext } from "./Click.tsx";
import { useClickPoints } from "./click-points.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MEDIA ON CLICKS  —  the plan `<Video>`, `<Audio>` and `<Lottie>` play by
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   at={2}                      start at click 2 (implies autoplay)
 *   pauseAt={4}                 pause at click 4
 *   steps={{ 3: 42, 5: "rewind" }}   at click 3 jump to 0:42, at 5 back to the start
 *
 * Each of these is a click of the slide (registered with its registry, in document order), so
 * the step count, the presenter's next-step box and the notes' `[click]` markers know about them.
 * The plan is a list of (absolute click, action); `playingAt` and `seekCrossing` read it, and
 * each component applies it to its own player.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type MediaStep = "play" | "pause" | "rewind" | number;

export interface MediaPlan {
  /** Absolute click → what happens there, in click order. */
  events: Array<{ click: number; action: MediaStep }>;
}

/** Whether it should be playing at `click`: the events up to it, in order (pure; tested). */
export function playingAt(plan: MediaPlan, click: number): boolean {
  let playing = false;
  for (const e of plan.events) {
    if (e.click > click) break;
    if (e.action === "play") playing = true;
    else if (e.action === "pause") playing = false;
  }
  return playing;
}

/** The seeks crossed going forward from `from` to `to` (exclusive, inclusive): the last one wins. */
export function seekCrossing(plan: MediaPlan, from: number, to: number): MediaStep | null {
  let seek: MediaStep | null = null;
  for (const e of plan.events)
    if (e.click > from && e.click <= to && (e.action === "rewind" || typeof e.action === "number"))
      seek = e.action;
  return seek;
}

/** Whether stepping forward from `from` to `to` crosses a "play" (a cue starts again from the top). */
export function crossesPlay(plan: MediaPlan, from: number, to: number): boolean {
  return plan.events.some((e) => e.action === "play" && e.click > from && e.click <= to);
}

/** Seconds from a prop (`5`, `"5"`), or `fallback`. */
export const seconds = (v: number | string | undefined, fallback = 0) =>
  v === undefined || !Number.isFinite(Number(v)) ? fallback : Number(v);

export interface MediaClickProps {
  autoplay?: boolean | "once";
  at?: ClickAt;
  pauseAt?: ClickAt;
  steps?: Record<string | number, MediaStep>;
  autoreset?: "slide" | "click";
}

export interface MediaClicks {
  plan: MediaPlan;
  /** Driven by the slide's clicks (or an enclosing `<Click>`), not by the slide's media handling. */
  clickDriven: boolean;
  /** The click it first plays at (0: on arrival). */
  startClick: number;
  /** Whether an enclosing `<Click>` shows it (true outside one). */
  revealed: boolean;
}

/**
 * Register the clicks a media element's props ask for and build its plan. `own` makes it
 * click-driven even without click props (`<Audio>` and `<Lottie>` always run themselves).
 */
export function useMediaClicks(p: MediaClickProps, own = false): MediaClicks {
  const autoPlayMedia = useConfig().autoPlayMedia;
  const inClick = useContext(ClickShownContext);
  const { at, pauseAt, steps, autoplay, autoreset } = p;
  const stepList = Object.entries(steps ?? {})
    .filter(([k]) => Number.isFinite(Number(k)))
    .map(([k, action]) => ({ click: Number(k), action }));
  const clickDriven =
    own ||
    at !== undefined ||
    pauseAt !== undefined ||
    stepList.length > 0 ||
    inClick !== null ||
    !!autoreset;
  const points = [
    ...(at !== undefined ? [{ at }] : []),
    ...(pauseAt !== undefined ? [{ at: pauseAt }] : []),
    ...stepList.map((s) => ({ at: s.click as ClickAt })),
  ];
  const clicks = useClickPoints(points).map((r) => r.start);
  const wantsPlay = autoplay ?? (at !== undefined ? true : autoPlayMedia === true);
  const plan: MediaPlan = useMemo(() => {
    const events: MediaPlan["events"] = [];
    let k = 0;
    if (at !== undefined)
      events.push({ click: clicks[k++] ?? 0, action: wantsPlay ? "play" : "pause" });
    else if (wantsPlay && autoplay !== false) events.push({ click: 0, action: "play" });
    if (pauseAt !== undefined) events.push({ click: clicks[k++] ?? 0, action: "pause" });
    for (const s of stepList) events.push({ click: clicks[k++] ?? s.click, action: s.action });
    return { events: events.sort((a, b) => a.click - b.click) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(clicks), JSON.stringify(stepList), at, pauseAt, wantsPlay, autoplay]);
  const startClick = plan.events.find((e) => e.action === "play")?.click ?? 0;
  return { plan, clickDriven, startClick, revealed: inClick !== false };
}
