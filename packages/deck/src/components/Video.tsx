import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { ClickAt } from "../core/clicks.ts";
import { useSlideOptional } from "../react/context.ts";
import { useRenderContext } from "../react/render-context.ts";
import { lutStrengthOf } from "./lut.ts";
import { useGradedSrc } from "./lut-image.ts";
import { useVideoLut } from "./lut-video.ts";
import {
  type MediaPlan,
  type MediaStep,
  playingAt,
  seconds,
  seekCrossing,
  useMediaClicks,
} from "./media-clicks.ts";
import {
  CreditLabel,
  HoverCredit,
  type MediaCreditProps,
  stickerCredit,
  useReportHref,
} from "./media.tsx";

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
 *
 * A transparent clip ships as a VP9 WebM, whose alpha WebKit (Safari, and every browser on iOS)
 * decodes as black. `hevc` names the same clip as HEVC with alpha, the one form WebKit shows
 * transparent; WebKit gets that, everything else keeps `src`. Not by `canPlayType`: Safari says
 * "probably" to VP9 and drops its alpha, and Chrome on a Mac plays HEVC but drops its alpha too.
 *
 * Credited like a sticker (`provider`, `id`, `credit`, `creditUrl`, `license`, `licenseUrl`): on
 * hover, and in `<Credits />`. `lut` grades it with a `.cube` LUT (components/lut-video.ts) — the
 * poster as an image, the frames on a canvas over the video while it plays.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type VideoStep = MediaStep;
export type VideoPlan = MediaPlan;
export { playingAt, seekCrossing };

export interface VideoProps extends MediaCreditProps {
  src?: string;
  /**
   * The same clip as HEVC with alpha (an MP4 tagged hvc1). Safari and every iOS browser play this
   * one, since they draw a WebM's transparency as black; other browsers keep `src`.
   */
  hevc?: string;
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
  /** The provider's id for it ("kse_…"). Without a provider, `id` is the element's id. */
  id?: string;
  /** A `.cube` 3D LUT to grade it with (same origin, or served with CORS). */
  lut?: string;
  /** How much of the grade: 0–1 (default 1). */
  lutStrength?: number;
  /** The grade's own credit ("Teal Dusk · Film LUTs"), for `<Credits />`. */
  lutCredit?: string;
  /** The grade's page, for its credit's link. */
  lutCreditUrl?: string;
  className?: string;
  /** `<source>` elements, captions (`<track>`), fallback text. */
  children?: ReactNode;
  [key: string]: unknown;
}

/**
 * WebKit without Blink or Gecko: Safari, and iOS's Chrome (CriOS), Firefox (FxiOS) and Edge, which
 * all run WebKit. A Blink or Gecko browser says so in its own token, desktop Firefox has no
 * AppleWebKit at all.
 */
export function wantsHevcAlpha(ua: string): boolean {
  return /AppleWebKit\//.test(ua) && !/(?:Chrome|Chromium|Edg|OPR|Firefox)\//.test(ua);
}

const noSubscribe = () => () => {};
/** False on the server and while hydrating, so the markup matches; the browser's answer after. */
function useWantsHevc(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => typeof navigator !== "undefined" && wantsHevcAlpha(navigator.userAgent),
    () => false,
  );
}

export function Video({
  src: webSrc,
  hevc,
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
  provider,
  id,
  credit,
  creditUrl,
  license: _license,
  licenseUrl: _licenseUrl,
  lut,
  lutStrength,
  lutCredit: _lutCredit,
  lutCreditUrl: _lutCreditUrl,
  className,
  children,
  ...rest
}: VideoProps) {
  const slide = useSlideOptional();
  const where = useRenderContext();
  const ref = useRef<HTMLVideoElement>(null);
  const wantsHevc = useWantsHevc();
  const src = hevc && wantsHevc ? hevc : webSrc;
  const frame = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  const lastClick = useRef<number | null>(null);
  const start = seconds(timestamp);
  const { plan, clickDriven, startClick, revealed } = useMediaClicks({
    autoplay,
    at,
    pauseAt,
    steps,
    autoreset,
  });

  // Plays only on the slide being shown: the deck, the presenter's current slide, a mirror.
  const noPlay =
    where.print ||
    !slide ||
    slide.preview ||
    !(where.context === "slide" || where.context === "presenter");
  const live = !noPlay && !!slide?.active;
  const click = slide?.click ?? 0;

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
      if (!(autoplay === "once" && played.current && v.paused)) {
        // Shown the moment it mounts: the slide hands out lazy sources after this effect runs.
        if (src && !v.getAttribute("src")) v.setAttribute("src", src);
        void v.play().catch(() => {});
      }
    } else v.pause();
  }, [
    live,
    click,
    plan,
    revealed,
    noPlay,
    clickDriven,
    autoreset,
    start,
    startClick,
    autoplay,
    src,
  ]);

  // A still: the print frame, once the video knows how long it is.
  const onLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (noPlay) {
      if (printPoster && printTimestamp === undefined) return;
      const t = printTimestamp ?? timestamp;
      v.currentTime = t === "last" ? Math.max(0, v.duration - 0.05) : seconds(t);
    } else if (start && v.currentTime === 0) v.currentTime = start;
  };

  // The grade: the poster as an image, the frames on a canvas. A video whose host refuses CORS
  // can't be graded — nor even loaded with `crossOrigin` — so it is loaded again without.
  const [corsRefused, setCorsRefused] = useState(false);
  useEffect(() => {
    if (corsRefused) ref.current?.load();
  }, [corsRefused]);
  const strength = lutStrengthOf(lutStrength);
  const grading = !!lut && strength > 0 && !corsRefused;
  const shownPoster = noPlay ? (printPoster ?? poster) : poster;
  const gradedPoster = useGradedSrc(shownPoster, grading ? lut : undefined, strength, where.print);
  const lutState = useVideoLut(ref, frame, {
    lut: grading ? lut : undefined,
    strength,
    live,
    print: where.print,
    // In print the poster is the picture only with printPoster and no printTimestamp; otherwise
    // the video shows the frame it seeks to (onLoadedMetadata), which the canvas grades.
    poster: noPlay ? !!printPoster && printTimestamp === undefined : !!poster,
  });

  // The source changed after the slide handed it out (WebKit learns it wants `hevc` once
  // hydrated): load the new one.
  useEffect(() => {
    const v = ref.current;
    if (v && src && v.getAttribute("src") && v.getAttribute("src") !== src) v.setAttribute("src", src);
  }, [src]);

  const own = stickerCredit({ provider, credit, creditUrl });
  const report = useReportHref(own ? src : undefined);
  const video = (
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
      poster={gradedPoster.state === "pending" ? undefined : gradedPoster.src}
      crossOrigin={grading ? "anonymous" : undefined}
      onPlay={() => {
        played.current = true;
      }}
      onLoadedMetadata={onLoadedMetadata}
      onError={() => {
        if (grading && ref.current?.error) setCorsRefused(true);
      }}
      className={["deck-video", className].filter(Boolean).join(" ")}
      {...(id && !provider ? { id } : {})}
      {...rest}
    >
      {children}
    </video>
  );
  // A bare <video> as it always was, unless something needs a box around it.
  if (!own && !lut) return video;
  return (
    <span
      ref={frame}
      className={["deck-video-frame", lutState === "on" && "is-graded"].filter(Boolean).join(" ")}
      data-lut={
        lut ? (corsRefused ? "off" : (lutState ?? gradedPoster.state ?? undefined)) : undefined
      }
    >
      {video}
      {!where.print ? (
        <HoverCredit report={report}>{own ? <CreditLabel credit={own} /> : null}</HoverCredit>
      ) : null}
    </span>
  );
}
