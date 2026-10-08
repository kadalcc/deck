import { useEffect, useRef, useState } from "react";

import { key as navKey } from "../core/navigation.ts";
import { BackgroundLayer } from "./Backgrounds.tsx";
import { useDeck } from "./context.ts";
import { useNav } from "./hooks.ts";
import { SlideFrame } from "./SlideFrame.tsx";

/**
 * The scroll view (reveal.js 5): the deck flattened into one page you read by scrolling, every
 * slide scaled to the viewport width, clicks revealed as you scroll through a slide's stretch of
 * page. Switched on by `view: scroll`, `?view=scroll`, or a narrow viewport. The custom scrollbar
 * marks each slide's segment.
 */
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

  const scale = vw / deck.config.width;
  const slideH = deck.config.height * scale;
  const flat = deck.columns.flatMap((c) => c.slides.map((meta, v) => ({ meta, h: c.h, v })));

  // Each slide occupies one viewport height per click step, at least the slide's height.
  const segment = (k: string) => Math.max(slideH, vh) + (totals[k] ?? 0) * vh * 0.6;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.scrollTop;
      let y = 0;
      const next: Record<string, number> = {};
      let cur = 0;
      flat.forEach((s, i) => {
        const k = navKey(s.h, s.v);
        const seg = segment(k);
        const t = totals[k] ?? 0;
        if (top >= y - vh / 2 && top < y + seg - vh / 2) cur = i;
        const progress = Math.min(
          1,
          Math.max(0, (top - y + vh * 0.35) / Math.max(1, seg - Math.max(slideH, vh) + vh * 0.6)),
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
  }, [flat.length, vh, slideH, totals]);

  useEffect(() => {
    const s = flat[current];
    if (s)
      deck.nav.update((st) =>
        st.h === s.h && st.v === s.v ? st : { ...st, h: s.h, v: s.v, click: 0, direction: "none" },
      );
  }, [current, deck.nav, flat]);

  return (
    <div ref={root} className="deck-scroll" data-snap={deck.config.scrollSnap || undefined}>
      {flat.map((s, i) => {
        const k = navKey(s.h, s.v);
        const options = deck.options.get(k)!;
        return (
          <section
            key={k}
            className={["deck-scroll-segment", i === current ? "is-current" : ""].join(" ")}
            style={{ height: segment(k) }}
          >
            <div className="deck-scroll-sticky" style={{ height: Math.min(vh, slideH) }}>
              <BackgroundLayer bg={options.background} active={i === current} />
              <div
                className="deck-scroll-canvas"
                style={{
                  width: deck.config.width,
                  height: deck.config.height,
                  transform: `scale(${scale})`,
                }}
              >
                <SlideFrame
                  meta={s.meta}
                  options={options}
                  h={s.h}
                  v={s.v}
                  active={i === current}
                  click={clicks[k] ?? 0}
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
