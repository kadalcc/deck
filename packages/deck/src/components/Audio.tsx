import { useEffect, useRef } from "react";

import type { ClickAt } from "../core/clicks.ts";
import { useSlideOptional } from "../react/context.ts";
import { useRenderContext } from "../react/render-context.ts";
import {
  type MediaPlan,
  type MediaStep,
  crossesPlay,
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
 * <Audio>  —  a sound for a click, music for a slide, or a player
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <Audio src="/whoosh.mp3" at={2} />                         a sound effect on click 2
 *   <Audio src="/bed.mp3" autoplay loop controls={false} fade={1200} volume={0.5} />
 *                                                              music under the whole slide
 *   <Audio src="/interview.mp3" />                             a player to press
 *
 * The click options are `<Video>`'s (components/media-clicks.ts): `at` starts it, `pauseAt`
 * stops it, `steps` plays, pauses, rewinds or jumps at further clicks, each one a click of the
 * slide. A sound on a click is a cue: it plays from the start each time the deck steps onto its
 * click going forward, stops and rewinds when the deck steps back before it, and — unless it
 * loops (a bed meant to be running from there on) — stays quiet when the deck arrives on the
 * slide already past it, coming back from the next one.
 *
 * `fade` (ms) fades it in when it starts and out when it stops or the slide is left, rather than
 * cutting; `volume` is where it fades to (0–1). Without click options and with `autoplay` it plays
 * while the slide is shown and starts again from `timestamp` each time it is.
 *
 * It only ever sounds in the deck itself (the play window): never in the presenter's copy of the
 * slide, the next-slide box, the overview, an audience phone or print — two windows of one deck on
 * one machine would play it twice. In print and the exports it is not drawn at all. A player
 * (`controls`, the default without click options) is drawn on screen; a cue or a bed is invisible.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface AudioProps extends MediaCreditProps {
  src: string;
  /** Play when the slide (or `at`, or the enclosing `<Click>`) arrives; "once": only the first time. */
  autoplay?: boolean | "once";
  /** The click at which it plays (a sound effect); implies `autoplay`. */
  at?: ClickAt;
  /** The click at which it stops. */
  pauseAt?: ClickAt;
  /** What happens at further clicks: `{ 3: "pause", 4: "play", 6: 12.5, 8: "rewind" }` (absolute clicks). */
  steps?: Record<string | number, MediaStep>;
  /** "slide": back to `timestamp` whenever the slide is left (the default for a cue anyway). */
  autoreset?: "slide" | "click";
  /** Start here, in seconds. */
  timestamp?: number | string;
  loop?: boolean;
  /** 0–1 (default 1): where it plays, and where a fade goes to. */
  volume?: number;
  /** Milliseconds to fade in when it starts and out when it stops or the slide is left (default 0). */
  fade?: number;
  /** Show the player (default: only without click options). */
  controls?: boolean;
  /** What it is, for screen readers and the credits ("Rain on a tin roof"). */
  title?: string;
  /** The provider's id for it ("kse_…"). Without a provider, `id` is the element's id. */
  id?: string;
  className?: string;
}

/** Whether to sound on arriving at a slide already at `click`: a cue passed is not replayed (pure). */
export function soundsOnArrival(
  plan: MediaPlan,
  click: number,
  o: { loop?: boolean; startClick: number },
): boolean {
  if (!playingAt(plan, click)) return false;
  return !!o.loop || o.startClick === 0;
}

const clamp01 = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

/** Ramp `a.volume` to `to` over `ms`, then `done`; returns the cancel. */
function ramp(a: HTMLAudioElement, to: number, ms: number, done?: () => void): () => void {
  if (ms <= 0 || typeof requestAnimationFrame === "undefined") {
    a.volume = to;
    done?.();
    return () => {};
  }
  const from = a.volume;
  const t0 = performance.now();
  let raf = 0;
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    a.volume = from + (to - from) * k;
    if (k < 1) raf = requestAnimationFrame(step);
    else done?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

export function Audio({
  src,
  autoplay,
  at,
  pauseAt,
  steps,
  autoreset,
  timestamp,
  loop,
  volume,
  fade = 0,
  controls,
  title,
  provider,
  id,
  credit,
  creditUrl,
  license: _license,
  licenseUrl: _licenseUrl,
  className,
}: AudioProps) {
  const slide = useSlideOptional();
  const where = useRenderContext();
  const ref = useRef<HTMLAudioElement>(null);
  const played = useRef(false);
  const lastClick = useRef<number | null>(null);
  const cancelFade = useRef<() => void>(() => {});
  const start = seconds(timestamp);
  const level = clamp01(volume, 1);
  const { plan, clickDriven, startClick, revealed } = useMediaClicks(
    { autoplay, at, pauseAt, steps, autoreset },
    true,
  );
  const cue = at !== undefined || pauseAt !== undefined || !!steps;
  // Sounds only in the deck itself: not the presenter's copy, a preview, a phone or print.
  const canPlay = !where.print && !!slide && !slide.preview && where.context === "slide";
  const live = canPlay && !!slide?.active;
  const click = slide?.click ?? 0;

  useEffect(() => {
    const a = ref.current;
    if (!a || !canPlay) return;
    const play = (fromTop: boolean) => {
      // A slide shown the moment it mounts runs this before the slide gives its media their
      // lazy sources (react/SlideFrame.tsx: a parent's effect runs after its children's).
      if (!a.getAttribute("src")) a.setAttribute("src", src);
      if (fromTop) a.currentTime = start;
      if (autoplay === "once" && played.current && a.paused) return;
      cancelFade.current();
      if (a.paused) a.volume = fade > 0 ? 0 : level;
      void a.play().then(
        () => {
          cancelFade.current = ramp(a, level, fade);
        },
        () => {},
      );
    };
    const stop = (rewind: boolean) => {
      cancelFade.current();
      if (a.paused) {
        if (rewind) a.currentTime = start;
        return;
      }
      cancelFade.current = ramp(a, 0, fade, () => {
        a.pause();
        if (rewind) a.currentTime = start;
      });
    };
    if (!live) {
      // Left: quiet, and from the top next time (a cue, or autoplay's "again from the start").
      if (lastClick.current !== null) stop(autoreset !== undefined || cue || !!autoplay);
      lastClick.current = null;
      return;
    }
    const prev = lastClick.current;
    lastClick.current = click;
    if (!revealed) return stop(false);
    if (prev === null) {
      const seek = seekCrossing(plan, -1, click);
      a.currentTime = typeof seek === "number" ? seek : start;
      if (soundsOnArrival(plan, click, { loop, startClick })) play(false);
      return;
    }
    if (click > prev) {
      const seek = seekCrossing(plan, prev, click);
      if (seek === "rewind") a.currentTime = start;
      else if (typeof seek === "number") a.currentTime = seek;
      if (playingAt(plan, click)) play(seek === null && crossesPlay(plan, prev, click));
      else stop(false);
    } else if (click < prev) {
      // Back before its cue: silent, from the top for when the deck steps onto it again.
      if (click < startClick) stop(true);
      else if (!playingAt(plan, click)) stop(false);
    }
  }, [
    live,
    canPlay,
    click,
    plan,
    revealed,
    start,
    startClick,
    loop,
    fade,
    level,
    autoplay,
    autoreset,
    cue,
    src,
  ]);

  useEffect(() => () => cancelFade.current(), []);
  useEffect(() => {
    const a = ref.current;
    if (a && a.paused) a.volume = level;
  }, [level]);

  const own = stickerCredit({ provider, credit, creditUrl });
  const report = useReportHref(own ? src : undefined);
  if (where.print) return null;
  const shown = controls ?? !cue;
  const audio = (
    <audio
      ref={ref}
      data-src={src}
      // Run by this component, never by the slide's own media handling (react/SlideFrame.tsx).
      data-clicks={clickDriven ? "" : undefined}
      loop={loop}
      controls={shown}
      preload={canPlay ? "auto" : "none"}
      title={title}
      aria-label={title}
      onPlay={() => {
        played.current = true;
      }}
      className={["deck-audio", className].filter(Boolean).join(" ")}
      {...(id && !provider ? { id } : {})}
    />
  );
  if (!own || !shown) return audio;
  return (
    <span className="deck-audio-frame">
      {audio}
      <HoverCredit report={report}>
        <CreditLabel credit={own} />
      </HoverCredit>
    </span>
  );
}
