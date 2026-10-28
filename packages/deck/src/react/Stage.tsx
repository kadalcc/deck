import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { splitTransition } from "../core/model.ts";
import { key as navKey } from "../core/navigation.ts";
import { isKnownTransition, transitionAnimation } from "../core/transitions.ts";
import { animateFrom, snapshot, type Snapshot } from "./AutoAnimate.ts";
import { transitionMs } from "./Backgrounds.tsx";
import { useDeck } from "./context.ts";
import { useLayout, useNav } from "./hooks.ts";
import { StageLayer } from "./Layers.tsx";
import { useNavDirection } from "./lifecycle.ts";
import { SlideFrame } from "./SlideFrame.tsx";

/**
 * The stage: the authored canvas, scaled to the viewport, holding the slides near the current one.
 * The current slide is `present`; its neighbours are mounted hidden within `viewDistance` so their
 * media is ready; the slide just left stays mounted as `leaving` for the length of the transition.
 * Transitions and directions are CSS classes the base stylesheet animates; a named custom
 * transition (core/transitions.ts) sets its keyframes on the stage as `--deck-anim-in/out`.
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
  // Forward or backward, for `forward:` / `backward:` styles (core/direction.ts).
  const navDir = useNavDirection();
  /*
   * The slide arrived at: which way the deck moved to reach it, and on which move. A click changes
   * the nav's direction too, but the slide's own entrance must not: its animation is keyed on the
   * direction, and a changed animation name restarts it, so stepping back a click replayed the
   * whole slide sliding in. And until the next move after arriving, its clicks snap to where the
   * move landed (`up` lands on the first step of a slide that was waiting, pre-rendered, at its
   * last) rather than fading out under the transition.
   *
   * The slide the stage MOUNTED on was not moved to, so it cuts in: no move, no transition. That is
   * a page load (at #/5 too, which the nav reaches by a `goto`), and an editor's preview remounting
   * a recompiled deck on the slide being edited — keyed on `seq === 0` instead, every keystroke
   * slid the slide in again, and so did the first click on a slide opened from a hash.
   */
  const arrival = useRef({ h, v, seq, direction, mounted: true });
  if (arrival.current.h !== h || arrival.current.v !== v)
    arrival.current = { h, v, seq, direction, mounted: false };
  const slideDirection = arrival.current.direction;
  const arriving = arrival.current.seq === seq;
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
  // The way in is the arriving slide's; the way out is the leaving slide's own `-out` when it names
  // one (`transition: zoom-in fade-out`), and otherwise the same as the way in, as it always was.
  const transition = splitTransition(current?.transition, deck.config.transition).in;
  const leavingSpec = leaving ? deck.options.get(navKey(leaving.h, leaving.v))?.transition : null;
  const transitionOut =
    leavingSpec && /(^|\s)\S+-out(\s|$)/.test(leavingSpec)
      ? splitTransition(leavingSpec, deck.config.transition).out
      : transition;
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

  // Drop the leaving slide when the transition is over — or at once when its way out has no
  // animation at all (a name nothing defines): that is a cut, not two slides drawn over each other.
  useEffect(() => {
    if (!leaving) return;
    const name = transitionOut;
    // A cut, or the browser's own view transition (which animates snapshots of the page): the
    // slide that left has nothing to play, and kept in the page it would show under the new one.
    if (name === "none" || name === "view-transition" || transition === "view-transition") {
      setLeaving(null);
      return;
    }
    const t = setTimeout(() => setLeaving(null), transitionMs(speed) + 50);
    const frame =
      name === "none" || name === "view-transition"
        ? 0
        : requestAnimationFrame(() => {
            const el = stageRef.current?.querySelector<HTMLElement>(".deck-slide.is-leaving");
            // No running animation: none named, or keyframes that do not exist.
            const animated = el?.getAnimations
              ? el.getAnimations().length > 0
              : !!el && getComputedStyle(el).animationName !== "none";
            if (!el || animated) return;
            if (!isKnownTransition(name, deck.config.transitions)) warnUnknown(name);
            setLeaving(null);
          });
    return () => {
      clearTimeout(t);
      if (frame) cancelAnimationFrame(frame);
    };
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
  const cut = arrival.current.mounted;
  // A named custom transition's keyframes for this direction (none for built-ins and pure CSS).
  const customIn = transitionAnimation(transition, "in", slideDirection, deck.config.transitions);
  const customOut = transitionAnimation(
    transitionOut,
    "out",
    slideDirection,
    deck.config.transitions,
  );
  const stageStyle: React.CSSProperties = {
    // `disableLayout`: the stage is the box core/layout.ts measured, unscaled.
    width: deck.config.disableLayout ? layout.width : deck.config.width,
    height: deck.config.disableLayout ? layout.height : deck.config.height,
    transform: `translate(${layout.left}px, ${layout.top}px) scale(${layout.scale})`,
    ...(customIn ? { "--deck-anim-in": customIn } : null),
    ...(customOut ? { "--deck-anim-out": customOut } : null),
  } as React.CSSProperties;

  return (
    <div
      ref={stageRef}
      className="deck-stage"
      style={stageStyle}
      data-transition={autoAnimating || cut ? "none" : transition}
      data-transition-out={autoAnimating || cut ? "none" : transitionOut}
      data-speed={speed}
      data-direction={slideDirection}
      data-nav-direction={navDir}
      data-overview={overview || undefined}
    >
      <StageLayer name="global-bottom" />
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
            navDirection={isPresent || f.role === "leaving" ? navDir : undefined}
            // Only the current slide answers to focus and the pointer; the rest also draw nothing
            // (themes/base.css), so a child that insists on `visibility: visible` stays unseen.
            inert={!isPresent}
            className={isPresent && arriving ? "is-present is-arriving" : `is-${f.role}`}
          />
        );
      })}
      <StageLayer name="global-top" />
    </div>
  );
}

const warned = new Set<string>();
function warnUnknown(name: string) {
  if (warned.has(name)) return;
  warned.add(name);
  console.warn(
    `[deck] transition "${name}" has no animation, so it is a cut. Name its keyframes in the headmatter (transitions: { ${name}: { in: …, out: … } }) or style .deck-stage[data-transition="${name}"].`,
  );
}

function autoSnapWas(
  _leaving: { h: number; v: number },
  current: { autoAnimate: boolean } | null,
): boolean {
  return !!current?.autoAnimate;
}
