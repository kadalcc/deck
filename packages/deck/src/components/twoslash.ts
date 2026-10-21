import { type RefObject, useEffect } from "react";

/**
 * TwoSlash's popups, kept on the slide. The popups are HTML the build wrote (vite/twoslash.ts)
 * and CSS opens them on hover and on keyboard focus; what CSS cannot know is where the slide
 * ends. Before one opens, this measures it against the slide and flips it above its token when
 * it would run off the bottom, or slides it left when it would run off the right — in slide
 * units, so the scaled stage, the presenter's copy and print all agree.
 */
export function useTwoslashPopups(pre: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = pre.current;
    if (!enabled || !el) return;
    const place = (e: Event) => {
      const token = (e.target as Element | null)?.closest?.(
        ".twoslash-hover, .twoslash-error-hover",
      );
      if (!token || !el.contains(token)) return;
      const popup = token.querySelector<HTMLElement>(".twoslash-popup-container");
      const slide = el.closest<HTMLElement>(".deck-slide") ?? document.body;
      if (!popup) return;
      popup.classList.remove("is-above");
      popup.style.removeProperty("--twoslash-shift");
      const s = slide.getBoundingClientRect();
      const p = popup.getBoundingClientRect();
      const t = token.getBoundingClientRect();
      // Screen pixels per slide pixel: the stage is scaled to fit the window.
      const scale = slide.offsetWidth ? s.width / slide.offsetWidth : 1;
      const below = t.bottom + p.height + 8 * scale;
      if (below > s.bottom && t.top - p.height - 8 * scale > s.top) popup.classList.add("is-above");
      const over = p.right - s.right + 8 * scale;
      if (over > 0)
        popup.style.setProperty(
          "--twoslash-shift",
          `${-Math.min(over, p.left - s.left) / scale}px`,
        );
    };
    el.addEventListener("pointerover", place);
    el.addEventListener("focusin", place);
    return () => {
      el.removeEventListener("pointerover", place);
      el.removeEventListener("focusin", place);
    };
  }, [pre, enabled]);
}
