import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { key as navKey } from "../core/navigation.ts";
import {
  type AutoAnimatePlan,
  autoAnimateTiming,
  canAutoAnimate,
  prepareAutoAnimate,
  resetAutoAnimate,
  runAutoAnimate,
} from "./AutoAnimate.ts";
import { BackgroundLayer } from "./Backgrounds.tsx";
import { useDeck } from "./context.ts";
import { useNav } from "./hooks.ts";
import { SlideFrame } from "./SlideFrame.tsx";

/**
 * The scroll view (reveal.js 5): the deck flattened into one page you read by scrolling, every
 * slide scaled to the viewport width, clicks revealed as you scroll through a slide's stretch of
 * page. Switched on by `view: scroll`, `?view=scroll`, or a narrow viewport. The custom scrollbar
 * marks each slide's segment.
 *
 * `scrollLayout`: "compact" (the default) makes each slide as wide as the viewport and as tall as
 * its aspect makes it; "full" (reveal.js's default) gives each slide the whole viewport, the slide
 * letterboxed inside it. Slides that auto-animate into each other morph in place as the next one
 * becomes the current one, either way.
 */
/**
 * Where a scroll-view slide sits: its scale, the sticky box it is drawn in, the page it takes
 * before its steps, and the canvas's offset in the box. compact: the viewport's width; full: the
 * whole slide inside the viewport, centred.
 */
export function scrollGeometry(
  layout: "full" | "compact",
  vw: number,
  vh: number,
  width: number,
  height: number,
) {
  const full = layout === "full";
  const scale = full ? Math.min(vw / width, vh / height) : vw / width;
  const slideH = height * scale;
  return {
    scale,
    boxH: full ? vh : Math.min(vh, slideH),
    pageH: full ? vh : slideH,
    offsetX: full ? (vw - width * scale) / 2 : 0,
    offsetY: full ? (vh - slideH) / 2 : 0,
  };
}

export function ScrollView() {
  const deck = useDeck();
  const root = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 1920 : window.innerWidth));
  const [vh, setVh] = useState(() => (typeof window === "undefined" ? 1080 : window.innerHeight));
  const [clicks, setClicks] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState(0);
  const totals = useNav((s) => s.totals);

  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const full = deck.config.scrollLayout === "full";
  const { scale, boxH, pageH, offsetX, offsetY } = scrollGeometry(
    deck.config.scrollLayout,
    vw,
    vh,
    deck.config.width,
    deck.config.height,
  );
  const flat = deck.columns.flatMap((c) => c.slides.map((meta, v) => ({ meta, h: c.h, v })));

  // Each slide occupies its own height, plus a stretch per click step to scroll its clicks
  // through. In compact it used to take at least a whole viewport: on a phone, where a slide is a
  // fifth of the screen tall, that left four-fifths of every slide's stretch of page empty.
  const stepH = boxH * 0.6;
  const segment = (k: string) => pageH + (totals[k] ?? 0) * stepH;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.scrollTop;
      // The slide under the upper middle of what is in view is the current one.
      const anchor = top + boxH * 0.5;
      let y = 0;
      const next: Record<string, number> = {};
      let cur = 0;
      flat.forEach((s, i) => {
        const k = navKey(s.h, s.v);
        const seg = segment(k);
        const t = totals[k] ?? 0;
        if (anchor >= y && anchor < y + seg) cur = i;
        const progress = Math.min(
          1,
          Math.max(0, (top - y + stepH * 0.6) / Math.max(1, seg - pageH + stepH)),
        );
        next[k] = t ? Math.min(t, Math.floor(progress * (t + 1))) : 0;
        y += seg;
      });
      setClicks(next);
      setCurrent(cur);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [flat.length, vh, boxH, pageH, stepH, totals]);

  // Auto-animate: when the current slide becomes a neighbour that animates from the one before
  // it, read that one as it is (it is still on the page, scrolled away) and morph the new one
  // from it, both measured from their own corners.
  const lastCurrent = useRef(current);
  const autoPlan = useRef<AutoAnimatePlan | null>(null);
  useLayoutEffect(() => {
    const was = lastCurrent.current;
    lastCurrent.current = current;
    const el = root.current;
    if (was === current || !el) return;
    resetAutoAnimate(el);
    autoPlan.current = null;
    const from = flat[was];
    const to = flat[current];
    if (!from || !to) return;
    const options = (s: { h: number; v: number }) => deck.options.get(navKey(s.h, s.v)) ?? null;
    // Neighbours in reading order, whatever their columns: the index stands in for the position.
    const ok = canAutoAnimate(
      { h: was, v: 0, options: options(from) },
      { h: current, v: 0, options: options(to) },
      deck.config.autoAnimate,
    );
    const slideEl = (s: { h: number; v: number }) =>
      el.querySelector<HTMLElement>(`.deck-slide[data-h="${s.h}"][data-v="${s.v}"]`);
    const fromEl = slideEl(from);
    if (!ok || !fromEl) return;
    autoPlan.current = prepareAutoAnimate(fromEl, slideEl(to), {
      styles: deck.config.autoAnimateStyles,
      matcher: deck.config.autoAnimateMatcher,
      inPlace: true,
    });
  }, [current]);
  useEffect(() => {
    const plan = autoPlan.current;
    const to = flat[current];
    if (!plan || !to) return;
    autoPlan.current = null;
    const el = root.current?.querySelector<HTMLElement>(
      `.deck-slide[data-h="${to.h}"][data-v="${to.v}"]`,
    );
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      runAutoAnimate(plan, el, {
        ...autoAnimateTiming(deck.options.get(navKey(to.h, to.v)) ?? null, deck.config),
        styles: deck.config.autoAnimateStyles,
        scale,
        inPlace: true,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [current]);

  useEffect(() => {
    const s = flat[current];
    if (s)
      deck.nav.update((st) =>
        st.h === s.h && st.v === s.v ? st : { ...st, h: s.h, v: s.v, click: 0, direction: "none" },
      );
  }, [current, deck.nav, flat]);

  return (
    <div
      ref={root}
      className="deck-scroll"
      data-layout={full ? "full" : "compact"}
      data-snap={deck.config.scrollSnap || undefined}
    >
      {flat.map((s, i) => {
        const k = navKey(s.h, s.v);
        const options = deck.options.get(k)!;
        return (
          <section
            key={k}
            className={["deck-scroll-segment", i === current ? "is-current" : ""].join(" ")}
            style={{ height: segment(k) }}
          >
            <div className="deck-scroll-sticky" style={{ height: boxH }}>
              <BackgroundLayer bg={options.background} active={i === current} />
              <div
                className="deck-scroll-canvas"
                style={{
                  width: deck.config.width,
                  height: deck.config.height,
                  transform: full
                    ? `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
                    : `scale(${scale})`,
                }}
              >
                <SlideFrame
                  meta={s.meta}
                  options={options}
                  h={s.h}
                  v={s.v}
                  active={i === current}
                  click={Math.max(options.clicksStart, clicks[k] ?? 0)}
                  className="is-scroll"
                />
              </div>
            </div>
          </section>
        );
      })}
      {deck.config.scrollProgress !== false ? (
        <div
          className="deck-scrollbar"
          data-mode={deck.config.scrollProgress === true ? "always" : "auto"}
        >
          {flat.map((s, i) => (
            <span
              key={navKey(s.h, s.v)}
              className={i === current ? "is-current" : ""}
              style={{ flexGrow: 1 + (totals[navKey(s.h, s.v)] ?? 0) * 0.5 }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
