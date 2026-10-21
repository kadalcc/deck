import { type ReactNode, useContext, useEffect, useMemo, useRef } from "react";

import type { ClickAt } from "../core/clicks.ts";
import { useSlideOptional } from "../react/context.ts";
import { useConfig } from "../react/hooks.ts";
import { useRenderContext } from "../react/render-context.ts";
import { ClickShownContext } from "./Click.tsx";
import { useClickPoints } from "./click-points.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Video>  —  a video that knows about the slide's clicks (Slidev's SlidevVideo, and more)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <Video src="/demo.mp4" autoplay />                    plays when the slide is shown
 *   <Video src="/demo.mp4" at={2} pauseAt={4} />          plays at click 2, pauses at click 4
 *   <Video src="/demo.mp4" steps={{ 3: 42, 5: "rewind" }} jump to 0:42 at click 3, back at 5
 *   <Click><Video src="/demo.mp4" autoplay /></Click>     plays when the click reveals it
 *
 * Slidev's options: `autoplay` (true, or "once": not again after it has played), `autoreset`
 * ("slide": back to the start when the slide is left; "click": when the deck steps back before
 * its click), `timestamp` (start here, seconds), `controls`, `poster`, and for print and
 * thumbnails `printPoster` and `printTimestamp` (seconds, or "last" for the final frame). Kadal's
 * additions are the click steps themselves — `at`, `pauseAt` and `steps` (at click n: "play",
 * "pause", "rewind", or a time to jump to) — each registered as a click of the slide, so the
 * step count, the presenter's next-step box and the notes' `[click]` markers all know about them.
 *
 * It only ever plays on the slide being shown, in the deck or the presenter's current slide;
 * everywhere else (the next-slide box, the overview, print) it is still, at its print frame.
 * Without any click option it is the plain media element it always was: `autoplay` plays on
 * arrival and pauses on leaving, through the slide's own media handling (and the deck's
 * `autoPlayMedia`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type VideoStep = "play" | "pause" | "rewind" | number;

export interface VideoProps {
  src?: string;
  /** Play when the slide (or `at`, or the enclosing `<Click>`) arrives; "once": only the first time. */
  autoplay?: boolean | "once";
  /** The click at which it starts playing (as `<Click at>`); implies `autoplay`. */
  at?: ClickAt;
  /** The click at which it pauses. */
  pauseAt?: ClickAt;
  /** What happens at further clicks: `{ 3: "pause", 4: "play", 6: 12.5, 8: "rewind" }` (absolute clicks). */
  steps?: Record<string | number, VideoStep>;
  /** "slide": back to `timestamp` whenever the slide is left; "click": whenever the deck steps back before `at`. */
  autoreset?: "slide" | "click";
  /** Start here, in seconds. */
  timestamp?: number | string;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  poster?: string;
  /** The poster in print, the overview and the next-slide box (default `poster`). */
  printPoster?: string;
  /** The frame shown in print and previews: seconds, or "last". Default `timestamp`. */
  printTimestamp?: number | string;
  className?: string;
  /** `<source>` elements, captions (`<track>`), fallback text. */
  children?: ReactNode;
  [key: string]: unknown;
}

interface ClickPoint {
  role: "start" | "pause" | "step";
  at: ClickAt;
  action?: VideoStep;
}

export interface VideoPlan {
  /** Absolute click → what happens there, in click order. */
  events: Array<{ click: number; action: VideoStep }>;
}

/** Whether it should be playing at `click`: the events up to it, in order (pure; tested). */
export function playingAt(plan: VideoPlan, click: number): boolean {
  let playing = false;
  for (const e of plan.events) {
    if (e.click > click) break;
    if (e.action === "play") playing = true;
    else if (e.action === "pause") playing = false;
  }
  return playing;
}

/** The seeks crossed going forward from `from` to `to` (exclusive, inclusive): the last one wins. */
export function seekCrossing(plan: VideoPlan, from: number, to: number): VideoStep | null {
  let seek: VideoStep | null = null;
  for (const e of plan.events)
    if (e.click > from && e.click <= to && (e.action === "rewind" || typeof e.action === "number"))
      seek = e.action;
  return seek;
}

const seconds = (v: number | string | undefined, fallback = 0) =>
  v === undefined || !Number.isFinite(Number(v)) ? fallback : Number(v);

export function Video({
  src,
  autoplay,
  at,
  pauseAt,
  steps,
  autoreset,
  timestamp,
  loop,
  muted = true,
  controls = false,
  poster,
  printPoster,
  printTimestamp,
  className,
  children,
  ...rest
}: VideoProps) {
  const slide = useSlideOptional();
  const where = useRenderContext();
  const autoPlayMedia = useConfig().autoPlayMedia;
  const inClick = useContext(ClickShownContext);
  const ref = useRef<HTMLVideoElement>(null);
  const played = useRef(false);
  const lastClick = useRef<number | null>(null);
  const start = seconds(timestamp);
  const stepList = Object.entries(steps ?? {})
    .filter(([k]) => Number.isFinite(Number(k)))
    .map(([k, action]) => ({ click: Number(k), action }));
  const clickDriven =
    at !== undefined ||
    pauseAt !== undefined ||
    stepList.length > 0 ||
    inClick !== null ||
    !!autoreset;
  const points: ClickPoint[] = [
    ...(at !== undefined ? [{ role: "start" as const, at }] : []),
    ...(pauseAt !== undefined ? [{ role: "pause" as const, at: pauseAt }] : []),
    ...stepList.map((s) => ({ role: "step" as const, at: s.click, action: s.action })),
  ];
  const clicks = useClickPoints(points.map((p) => ({ at: p.at }))).map((r) => r.start);
  const wantsPlay = autoplay ?? (at !== undefined ? true : autoPlayMedia === true);
  const plan: VideoPlan = useMemo(() => {
    const events: VideoPlan["events"] = [];
    let k = 0;
    if (at !== undefined)
      events.push({ click: clicks[k++] ?? 0, action: wantsPlay ? "play" : "pause" });
    else if (wantsPlay && autoplay !== false) events.push({ click: 0, action: "play" });
    if (pauseAt !== undefined) events.push({ click: clicks[k++] ?? 0, action: "pause" });
    for (const s of stepList) events.push({ click: clicks[k++] ?? s.click, action: s.action });
    return { events: events.sort((a, b) => a.click - b.click) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(clicks), JSON.stringify(stepList), at, pauseAt, wantsPlay, autoplay]);

  // Plays only on the slide being shown: the deck, the presenter's current slide, a mirror.
  const noPlay =
    where.print ||
    !slide ||
    slide.preview ||
    !(where.context === "slide" || where.context === "presenter");
  const live = !noPlay && !!slide?.active;
  const click = slide?.click ?? 0;
  const revealed = inClick !== false;
  const startClick = plan.events.find((e) => e.action === "play")?.click ?? 0;

  useEffect(() => {
    const v = ref.current;
    if (!v || !clickDriven || noPlay) return;
    if (!live) {
      v.pause();
      if (autoreset === "slide") v.currentTime = start;
      lastClick.current = null;
      return;
    }
    const prev = lastClick.current;
    lastClick.current = click;
    if (prev === null) {
      // Arriving at the slide: start from the timestamp (or where an earlier step left it).
      const seek = seekCrossing(plan, -1, click);
      v.currentTime = typeof seek === "number" ? seek : start;
    } else if (click > prev) {
      const seek = seekCrossing(plan, prev, click);
      if (seek === "rewind") v.currentTime = start;
      else if (typeof seek === "number") v.currentTime = seek;
    } else if (click < prev && autoreset === "click" && click < startClick) v.currentTime = start;
    // "once": a video that has played is not started again — but one playing is left to play.
    if (revealed && playingAt(plan, click)) {
      if (!(autoplay === "once" && played.current && v.paused)) void v.play().catch(() => {});
    } else v.pause();
  }, [live, click, plan, revealed, noPlay, clickDriven, autoreset, start, startClick, autoplay]);

  // A still: the print frame, once the video knows how long it is.
  const onLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (noPlay) {
      if (printPoster && printTimestamp === undefined) return;
      const t = printTimestamp ?? timestamp;
      v.currentTime = t === "last" ? Math.max(0, v.duration - 0.05) : seconds(t);
    } else if (start && v.currentTime === 0) v.currentTime = start;
  };

  return (
    <video
      ref={ref}
      data-src={src}
      data-autoplay={!clickDriven && autoplay ? "" : undefined}
      data-clicks={clickDriven ? "" : undefined}
      loop={loop}
      muted={muted}
      controls={!noPlay && controls}
      playsInline
      preload={noPlay ? "metadata" : undefined}
      poster={noPlay ? (printPoster ?? poster) : poster}
      onPlay={() => {
        played.current = true;
      }}
      onLoadedMetadata={onLoadedMetadata}
      className={["deck-video", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </video>
  );
}
