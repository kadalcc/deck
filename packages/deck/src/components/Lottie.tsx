import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import type { ClickAt } from "../core/clicks.ts";
import { useDeck, useSlideOptional } from "../react/context.ts";
import { useRenderContext } from "../react/render-context.ts";
import { useStillHold } from "../react/still-holds.ts";
import { Drag } from "./Drag.tsx";
import { type MediaPlan, crossesPlay, playingAt, useMediaClicks } from "./media-clicks.ts";
import {
  CreditLabel,
  HoverCredit,
  type MediaCreditProps,
  stickerCredit,
  stickerPlace,
  useReducedMotion,
  useReportHref,
} from "./media.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Lottie>  —  a Lottie animation (.json or .lottie) that knows the slide's clicks
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <Lottie src="/anim/rocket.lottie" poster="/anim/rocket.png" loop />     plays on arrival
 *   <Lottie src="/anim/check.json" at={2} size={320} x={1400} y={600} />    plays at click 2
 *
 * Placed like a `<Sticker>` when it has `x`, `y` or `pos` (stage pixels, a drag site in
 * `kadal-deck dev`, `size` its width), else in the flow of the slide, `size` px wide (default: as
 * wide as the animation, up to its box). The box takes the animation's shape from its data, or
 * from the poster until the data arrives.
 *
 * `autoplay` (default on) plays it when the slide is shown; `at` plays it from its first frame at
 * that click instead, `pauseAt` stops it, `loop` repeats it, `speed` scales time. Stepping back
 * before `at` puts it back at its first frame; arriving on the slide already past `at` shows its
 * last frame — the state the click left it in. It plays only on the slide being shown (the deck,
 * the presenter's current slide) and is paused everywhere else.
 *
 * Print, the exports, the overview, the presenter's next-slide box and reduced motion show
 * `poster`; without one, the player draws a still frame instead (the last frame once it has
 * played by that click, else the first), and a printed page waits for it.
 *
 * The player is lottie-web's light SVG build, loaded only when a deck has a Lottie to draw
 * (components/lottie-player.ts); a .lottie is unzipped by the browser itself
 * (components/dotlottie.ts). Credited like a sticker (`provider`, `credit`, …).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface LottieProps extends MediaCreditProps {
  /** A Lottie JSON or a .lottie (dotLottie) file: same origin, or served with CORS. */
  src: string;
  /** A still image of it: print, exports, the overview, reduced motion, and while it loads. */
  poster?: string;
  /** What it shows, for screen readers (empty: decorative). */
  alt?: string;
  /** Play when the slide is shown (default true; with `at`, at that click). */
  autoplay?: boolean;
  /** The click at which it plays, from its first frame (as `<Click at>`). */
  at?: ClickAt;
  /** The click at which it pauses. */
  pauseAt?: ClickAt;
  /** Repeat it (default false: it plays once and holds its last frame). */
  loop?: boolean;
  /** Playback speed (default 1; 0.5 is half speed). */
  speed?: number;
  /** In a .lottie with several animations, which one (its id in the manifest). */
  animation?: string;
  /** Width in px (stage pixels when placed); the height follows the animation. */
  size?: number;
  /** Left edge in stage pixels: places it over the slide, like a `<Sticker>`. */
  x?: number;
  /** Top edge in stage pixels. */
  y?: number;
  /** Degrees, clockwise (placed only). */
  rotate?: number;
  /** "x,y,w,h[,r]" — what dragging it in `kadal-deck dev` writes; wins over x/y/size/rotate. */
  pos?: string;
  /** The provider's id for it ("kse_…"). Without a provider, `id` is the element's id. */
  id?: string;
  className?: string;
  style?: CSSProperties;
  [key: string]: unknown;
}

/**
 * The frame a still copy shows at `click`: the last frame once it has played by then (and does
 * not loop), else the first (pure).
 */
export function lottieStillFrame(
  plan: MediaPlan,
  click: number,
  o: { loop: boolean; totalFrames: number },
): number {
  const played = plan.events.some((e) => e.action === "play" && e.click <= click);
  return played && !o.loop ? Math.max(0, o.totalFrames - 1) : 0;
}

type Phase = "idle" | "loading" | "ready" | "failed";

export function Lottie({
  src,
  poster,
  alt = "",
  autoplay,
  at,
  pauseAt,
  loop = false,
  speed = 1,
  animation,
  size,
  x,
  y,
  rotate,
  pos,
  provider,
  id,
  credit,
  creditUrl,
  license: _license,
  licenseUrl: _licenseUrl,
  className,
  style,
  ...rest
}: LottieProps) {
  const deck = useDeck();
  const slide = useSlideOptional();
  const where = useRenderContext();
  const reduced = useReducedMotion();
  const { plan, startClick, revealed } = useMediaClicks(
    { autoplay: autoplay ?? (at === undefined ? true : undefined), at, pauseAt },
    true,
  );
  // Plays only on the slide being shown, as <Video> does; a still everywhere else.
  const still =
    where.print ||
    reduced ||
    !slide ||
    slide.preview ||
    !(where.context === "slide" || where.context === "presenter");
  const live = !still && !!slide?.active;
  const click = slide?.click ?? 0;
  const posterOnly = still && !!poster;

  const host = useRef<HTMLSpanElement>(null);
  const anim = useRef<import("lottie-web").AnimationItem | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [ratio, setRatio] = useState<{ w: number; h: number } | null>(null);
  const lastClick = useRef<number | null>(null);
  const rate = Number.isFinite(speed) && speed > 0 ? speed : 1;

  // The player: only where it draws (not where the poster stands in), once per file.
  useEffect(() => {
    const el = host.current;
    if (posterOnly || !el || !src) return;
    let alive = true;
    setPhase("loading");
    import("./lottie-player.ts")
      .then((m) => m.mountLottie(el, src, { loop, speed: rate, animation }))
      .then(
        (got) => {
          if (!alive) {
            got.item.destroy();
            return;
          }
          anim.current = got.item;
          if (got.width && got.height) setRatio({ w: got.width, h: got.height });
          lastClick.current = null;
          setPhase("ready");
        },
        (e: unknown) => {
          if (!alive) return;
          console.warn(`[kadal-deck] <Lottie src="${src}">:`, e);
          setPhase("failed");
        },
      );
    return () => {
      alive = false;
      anim.current?.destroy();
      anim.current = null;
    };
    // `speed` is set on the running player below, not by mounting it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterOnly, src, animation, loop]);

  useEffect(() => {
    anim.current?.setSpeed(rate);
  }, [rate, phase]);

  // Driving it: the slide's clicks while live, a still frame everywhere else.
  useEffect(() => {
    const a = anim.current;
    if (!a || phase !== "ready") return;
    const frame = lottieStillFrame(plan, click, { loop, totalFrames: a.totalFrames });
    if (!live) {
      lastClick.current = null;
      a.goToAndStop(frame, true);
      return;
    }
    const prev = lastClick.current;
    lastClick.current = click;
    if (!revealed) return a.goToAndStop(0, true);
    const on = playingAt(plan, click);
    if (prev === null) {
      // Arriving: a cue passed (coming back from the next slide) shows the state it left.
      if (on && (startClick === 0 || loop)) a.goToAndPlay(0, true);
      else a.goToAndStop(frame, true);
    } else if (click > prev) {
      if (on && crossesPlay(plan, prev, click)) a.goToAndPlay(0, true);
      else if (on) a.play();
      else a.pause();
    } else if (click < prev) {
      if (click < startClick) a.goToAndStop(0, true);
      else if (!on) a.pause();
    }
  }, [phase, live, click, plan, revealed, startClick, loop]);

  // A printed page without a poster waits for the player's still frame.
  useStillHold(where.print, !posterOnly && (phase === "idle" || phase === "loading"));

  const own = stickerCredit({ provider, credit, creditUrl });
  const report = useReportHref(own ? src : undefined);
  const showPoster = !!poster && (posterOnly || phase !== "ready");
  const shape: CSSProperties = ratio ? { aspectRatio: `${ratio.w} / ${ratio.h}` } : {};
  const body: ReactNode = (
    <>
      {showPoster ? (
        <img
          className="deck-lottie-poster"
          src={poster}
          alt=""
          draggable={false}
          decoding="async"
          onLoad={(e) => {
            const i = e.currentTarget;
            if (!ratio && i.naturalWidth && i.naturalHeight)
              setRatio({ w: i.naturalWidth, h: i.naturalHeight });
          }}
        />
      ) : null}
      {posterOnly ? null : <span ref={host} className="deck-lottie-player" aria-hidden="true" />}
      {!where.print ? (
        <HoverCredit report={report}>{own ? <CreditLabel credit={own} /> : null}</HoverCredit>
      ) : null}
    </>
  );
  const label = alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true };
  const box = ["deck-lottie", phase === "failed" && "is-failed"].filter(Boolean).join(" ");
  const elementId = id && !provider ? { id } : {};

  if (x !== undefined || y !== undefined || pos !== undefined) {
    const place = stickerPlace(
      { x, y, size, rotate },
      { width: deck.config.width || 1920, height: deck.config.height || 1080 },
    );
    return (
      <Drag
        {...rest}
        {...elementId}
        pos={pos}
        place={place}
        className={["deck-lottie-placed", className].filter(Boolean).join(" ")}
        style={style}
      >
        <span className={box} style={shape} {...label}>
          {body}
        </span>
      </Drag>
    );
  }
  const width = size ? `${size}px` : ratio ? `${ratio.w}px` : undefined;
  return (
    <span
      {...rest}
      {...elementId}
      {...label}
      className={[box, className].filter(Boolean).join(" ")}
      style={{ width, ...shape, ...style }}
    >
      {body}
    </span>
  );
}
