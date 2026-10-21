import { useEffect, useRef } from "react";

import { type NavDirection, navDirection } from "../core/direction.ts";
import { useStore } from "../core/store.ts";
import { useDeck, useSlideOptional } from "./context.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SLIDE LIFECYCLE HOOKS  —  useSlideEnter, useSlideLeave (Slidev's onSlideEnter / onSlideLeave)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A slide stays mounted while it is near the current one (its neighbours are preloaded, the one
 * just left animates out), so React's mount and unmount are not "the slide is shown". These are:
 *
 *   useSlideEnter((e) => { start(); return () => stop(); })   // the slide became the current one
 *   useSlideLeave((e) => save())                              // it stopped being the current one
 *
 * Called inside a slide (a component in deck.mdx, or a layout). They fire for the slide that is
 * live in THIS window: the deck page, the presenter's "current" box, the scroll view as each slide
 * reaches the middle. Never for a copy that only shows the slide — the presenter's next-step box,
 * the overview, print and export, the audience's mirror, a thumbnail — so a presenter window
 * open beside the deck fires once, for its own stage, and its preview never adds a second.
 * StrictMode's rehearsal mount does not fire them either. Vertical slides are slides like any
 * other: arriving on one beneath is an enter, leaving it upward is a leave.
 *
 * An enter callback may return a cleanup, run when the slide is left (or unmounted while
 * current). Outside a slide both hooks do nothing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SlideLifecycleEvent {
  h: number;
  v: number;
  /** The slide's position in the deck (the manifest index). */
  index: number;
  /** How the deck moved to cause this: on to the slide, or back to it. */
  direction: NavDirection;
}

type EnterFn = (event: SlideLifecycleEvent) => void | (() => void);
type LeaveFn = (event: SlideLifecycleEvent) => void;

/** Whether this slide is the live, current one in this window (false outside a slide). */
export function useIsSlideActive(): boolean {
  const slide = useSlideOptional();
  const deck = useDeck();
  return !!slide && slide.active && !slide.preview && deck.mode !== "print";
}

function useLifecycle(kind: "enter" | "leave", fn: EnterFn | LeaveFn) {
  const slide = useSlideOptional();
  const deck = useDeck();
  const live = useIsSlideActive();
  const latest = useRef(fn);
  latest.current = fn;
  const entered = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const event = (): SlideLifecycleEvent => ({
    h: slide?.h ?? 0,
    v: slide?.v ?? 0,
    index: slide?.meta.index ?? 0,
    direction: navDirection(deck.nav.get().direction),
  });
  const leave = () => {
    entered.current = false;
    const done = cleanup.current;
    cleanup.current = null;
    try {
      done?.();
      if (kind === "leave") (latest.current as LeaveFn)(event());
    } catch (e) {
      console.error("[deck] a slide leave hook threw", e);
    }
  };
  useEffect(() => {
    const mine = ++generation.current;
    if (live && !entered.current) {
      entered.current = true;
      if (kind === "enter") {
        try {
          const out = (latest.current as EnterFn)(event());
          cleanup.current = typeof out === "function" ? out : null;
        } catch (e) {
          console.error("[deck] a slide enter hook threw", e);
        }
      }
    } else if (!live && entered.current) leave();
    return () => {
      // A real unmount is a cleanup no effect follows. StrictMode's rehearsal and a change of
      // `live` run the effect again straight away; the microtask sees that and does nothing.
      queueMicrotask(() => {
        if (generation.current === mine && entered.current) leave();
      });
    };
  }, [live]);
}

export function useSlideEnter(fn: EnterFn): void {
  useLifecycle("enter", fn);
}

export function useSlideLeave(fn: LeaveFn): void {
  useLifecycle("leave", fn);
}

/** Slidev's names. They are hooks: call them at the top of a component, as any other. */
export const onSlideEnter = useSlideEnter;
export const onSlideLeave = useSlideLeave;

/**
 * Which way the deck last moved — "forward" or "backward" — re-rendering when it turns. The same
 * value the runtime writes as `data-nav-direction` for CSS.
 */
export function useNavDirection(): NavDirection {
  const deck = useDeck();
  const last = useRef<NavDirection>("forward");
  return useStore(deck.nav, (s) => (last.current = navDirection(s.direction, last.current)));
}
