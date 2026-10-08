import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { key as navKey } from "../core/navigation.ts";
import { animateFrom, snapshot, type Snapshot } from "./AutoAnimate.ts";
import { transitionMs } from "./Backgrounds.tsx";
import { useDeck } from "./context.ts";
import { useLayout, useNav } from "./hooks.ts";
import { SlideFrame } from "./SlideFrame.tsx";

/**
 * The stage: the authored canvas, scaled to the viewport, holding the slides near the current one.
 * The current slide is `present`; its neighbours are mounted hidden within `viewDistance` so their
 * media is ready; the slide just left stays mounted as `leaving` for the length of the transition.
 * Transitions and directions are CSS classes the base stylesheet animates.
 */
export function Stage() {
  const deck = useDeck();
  const layout = useLayout();
  const { h, v, click, direction, seq, overview } = useNav((s) => ({
    h: s.h,
    v: s.v,
    click: s.click,
    direction: s.direction,
    seq: s.seq,
    overview: s.overview,
  }));
  const stageRef = useRef<HTMLDivElement>(null);
  // The slide just left keeps the click it was showing while it animates out — rendering it at
  // its total (or at zero) would flash every hidden fragment for the length of the transition.
  const [leaving, setLeaving] = useState<{
    h: number;
    v: number;
    seq: number;
    click: number;
  } | null>(null);
  const lastPos = useRef({ h, v });
  const lastClick = useRef(click);
  const autoSnap = useRef<Map<string, Snapshot> | null>(null);
  const lastOptions = useRef(deck.options.get(navKey(h, v)) ?? null);

  const current = deck.options.get(navKey(h, v)) ?? null;
  const transition = current?.transition ?? deck.config.transition;
  const speed = current?.transitionSpeed ?? deck.config.transitionSpeed;
  const isMobile = typeof window !== "undefined" && window.innerWidth < 600;
  const distance = isMobile ? deck.config.mobileViewDistance : deck.config.viewDistance;

  // Snapshot the outgoing slide for auto-animate, before it changes.
  useLayoutEffect(() => {
    const prev = lastPos.current;
    if (prev.h === h && prev.v === v) {
      lastClick.current = click;
      return;
    }
    const leavingClick = lastClick.current;
    lastClick.current = click;
    const prevOptions = lastOptions.current;
    const prevEl = stageRef.current?.querySelector<HTMLElement>(
      `.deck-slide[data-h="${prev.h}"][data-v="${prev.v}"]`,
    );
    const canAuto =
      deck.config.autoAnimate &&
      prevOptions?.autoAnimate &&
      current?.autoAnimate &&
      (prevOptions.autoAnimateId ?? null) === (current.autoAnimateId ?? null) &&
      Math.abs(prev.h - h) + Math.abs(prev.v - v) === 1;
    autoSnap.current = canAuto && prevEl ? snapshot(prevEl) : null;
    setLeaving({ h: prev.h, v: prev.v, seq, click: leavingClick });
    lastPos.current = { h, v };
    lastOptions.current = current;
  }, [h, v, click, seq, current, deck.config.autoAnimate]);

  // Drop the leaving slide when the transition is over.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), transitionMs(speed) + 50);
    return () => clearTimeout(t);
  }, [leaving, speed]);

  // Run auto-animate once the incoming slide has painted.
  useEffect(() => {
    const snap = autoSnap.current;
    if (!snap) return;
    autoSnap.current = null;
    const el = stageRef.current?.querySelector<HTMLElement>(
      `.deck-slide[data-h="${h}"][data-v="${v}"]`,
    );
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      animateFrom(snap, el, {
        duration: current?.autoAnimate ? deck.config.autoAnimateDuration : 0,
        easing: deck.config.autoAnimateEasing,
        unmatched: deck.config.autoAnimateUnmatched,
        scale: layout.scale,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [h, v, seq]);

  const frames: {
    h: number;
    v: number;
    role: "present" | "leaving" | "past" | "future" | "above" | "below";
  }[] = [];
  deck.columns.forEach((col, ch) => {
    col.slides.forEach((_s, cv) => {
      const dh = ch - h;
      if (Math.abs(dh) > distance) return;
      if (dh !== 0 && cv > 0 && !(leaving && leaving.h === ch && leaving.v === cv)) return; // only column tops for neighbours
      const isPresent = ch === h && cv === v;
      const isLeaving = !!leaving && leaving.h === ch && leaving.v === cv && !isPresent;
      if (!isPresent && !isLeaving && ch === h && Math.abs(cv - v) > 1) return;
      const role = isPresent
        ? "present"
        : isLeaving
          ? "leaving"
          : dh < 0
            ? "past"
            : dh > 0
              ? "future"
              : cv < v
                ? "above"
                : "below";
      frames.push({ h: ch, v: cv, role });
    });
  });

  const autoAnimating = !!leaving && autoSnapWas(leaving, current);
  const stageStyle: React.CSSProperties = {
    width: deck.config.width,
    height: deck.config.height,
    transform: `translate(${layout.left}px, ${layout.top}px) scale(${layout.scale})`,
  };

  return (
    <div
      ref={stageRef}
      className="deck-stage"
      style={stageStyle}
      data-transition={autoAnimating || seq === 0 ? "none" : transition}
      data-speed={speed}
      data-direction={direction}
      data-overview={overview || undefined}
    >
      {frames.map((f) => {
        const meta = deck.columns[f.h]!.slides[f.v]!;
        const options = deck.options.get(navKey(f.h, f.v))!;
        const isPresent = f.role === "present";
        const total = deck.nav.get().totals[navKey(f.h, f.v)] ?? 0;
        const frameClick = isPresent
          ? click
          : f.role === "leaving"
            ? (leaving?.click ?? 0)
            : f.role === "past" || f.role === "above"
              ? total
              : 0;
        // The slide one step down and the next column's top are where a press lands next: their
        // embedded pages load now, hidden, so arriving there looks instant.
        const prefetch =
          (f.role === "below" && f.v === v + 1) || (f.role === "future" && f.h === h + 1);
        return (
          <SlideFrame
            key={`${f.h},${f.v}`}
            meta={meta}
            options={options}
            h={f.h}
            v={f.v}
            active={isPresent}
            click={frameClick}
            prefetch={prefetch}
            className={`is-${f.role}`}
          />
        );
      })}
    </div>
  );
}

function autoSnapWas(
  _leaving: { h: number; v: number },
  current: { autoAnimate: boolean } | null,
): boolean {
  return !!current?.autoAnimate;
}
