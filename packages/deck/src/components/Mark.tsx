import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ClickAt } from "../core/clicks.ts";
import { useSlideOptional } from "../react/context.ts";
import { useClick } from "../react/hooks.ts";
import {
  type MarkShape,
  type MarkType,
  markShapes,
  normaliseMarkType,
  type Rect,
} from "./mark-geometry.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Mark>  —  a hand-drawn mark, drawn on its click (Slidev's v-mark / rough-notation)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <Mark>underlined</Mark>   <Mark type="circle" color="#e11d48" at={2}>circled at click 2</Mark>
 *   <Mark type="bracket" brackets="left right">a whole paragraph</Mark>
 *
 * Every type rough-notation has — underline, box, circle, highlight, strike-through, crossed-off,
 * bracket (Slidev's aliases too: strike, line-through, cross, crossed) — with its options: color,
 * strokeWidth, padding, iterations, multiline, brackets, opacity, delay and the animation's
 * duration (`duration`, or rough-notation's `animationDuration`).
 *
 * Drawn as an SVG over the text and animated by its stroke — no library. The wobble is seeded from
 * the text, so the mark is the same on the stage, the presenter's copy, the audience's phone and the
 * PDF (rough-notation draws a new one every time). It animates only when its own click arrives on
 * the slide being shown; a slide arrived at from ahead, a thumbnail, print and reduced motion get
 * it drawn at once. Lines that wrap are marked line by line (`multiline`), which is the default
 * for the line-shaped marks; a box, circle or bracket goes around the whole.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MarkProps {
  type?: MarkType | "strike" | "line-through" | "linethrough" | "cross" | "crossed";
  /** Any CSS colour; default the theme's accent. */
  color?: string;
  /** When: as `<Click at>` (default: the next click; 0 = always; [a, b] from a until b). */
  at?: ClickAt;
  /** Line width in px (default 3; a highlight is as tall as the line). */
  strokeWidth?: number;
  /** Space around the text in px: one number, or "top right bottom left" like CSS. Default 5. */
  padding?: number | string | number[];
  /** Strokes per line, each a little different (default 2, rough-notation's). */
  iterations?: number;
  /** One mark per line of wrapped text. Default: on for underline, highlight, strike-through, crossed-off. */
  multiline?: boolean;
  /** For a bracket: which sides — "left", "right", "top", "bottom", or several. Default "right". */
  brackets?: string | string[];
  /** How long the stroke takes to draw, ms (default 800). */
  duration?: number;
  /** rough-notation's name for `duration`. */
  animationDuration?: number;
  /** Wait this long after the click before drawing, ms. */
  delay?: number;
  /** Turn the drawing animation off: the mark appears whole. */
  animate?: boolean;
  /** 0–1. Default 1 (a highlight: 0.35, so the text shows through). */
  opacity?: number;
  className?: string;
  children?: ReactNode;
}

const reduced = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The block that sizes the text: inline elements have no box a ResizeObserver can watch. */
function blockOf(el: HTMLElement): HTMLElement {
  let p: HTMLElement | null = el.parentElement;
  while (p && getComputedStyle(p).display.startsWith("inline")) p = p.parentElement;
  return p ?? el;
}

export function Mark({
  type = "underline",
  color = "var(--deck-accent)",
  at,
  strokeWidth,
  padding,
  iterations = 2,
  multiline,
  brackets = "right",
  duration,
  animationDuration,
  delay = 0,
  animate = true,
  opacity,
  className,
  children,
}: MarkProps) {
  const kind = normaliseMarkType(type);
  const { shown, current } = useClick({ at });
  const slide = useSlideOptional();
  const host = useRef<HTMLSpanElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [shapes, setShapes] = useState<MarkShape[]>([]);
  // A new draw (and so a new animation) each time the mark arrives on the slide being shown.
  const [draw, setDraw] = useState<{ n: number; animated: boolean }>({ n: 0, animated: false });
  const wasShown = useRef(false);
  const live = !!slide?.active && !slide.preview;
  const lines =
    multiline ??
    (kind === "underline" ||
      kind === "highlight" ||
      kind === "strike-through" ||
      kind === "crossed-off");
  const sides = (Array.isArray(brackets) ? brackets : String(brackets).split(/[\s,]+/)).filter(
    Boolean,
  );
  const key = JSON.stringify([kind, strokeWidth, padding, iterations, lines, sides]);

  useLayoutEffect(() => {
    const el = host.current;
    const s = svg.current;
    if (!el || !s) return;
    let raf = 0;
    const measure = () => {
      const box = s.getBoundingClientRect();
      const scale = box.width / 100;
      if (!scale) return;
      const raw = lines ? [...el.getClientRects()] : [el.getBoundingClientRect()];
      const rects: Rect[] = raw
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({
          x: (r.left - box.left) / scale,
          y: (r.top - box.top) / scale,
          w: r.width / scale,
          h: r.height / scale,
        }));
      const next = markShapes(kind, rects, {
        strokeWidth,
        padding,
        iterations,
        brackets: sides,
        seed: el.textContent ?? "",
      });
      setShapes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    document.fonts?.ready.then(schedule).catch(() => {});
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    ro?.observe(blockOf(el));
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, children]);

  useEffect(() => {
    if (shown && !wasShown.current)
      setDraw((d) => ({ n: d.n + 1, animated: animate && live && current && !reduced() }));
    wasShown.current = shown;
  }, [shown, current, live, animate]);

  const ms = duration ?? animationDuration ?? 800;
  const total = shapes.reduce((n, s) => n + s.length, 0) || 1;
  let elapsed = 0;
  return (
    <span
      ref={host}
      className={["deck-mark", `type-${kind}`, shown ? "is-on" : "", className]
        .filter(Boolean)
        .join(" ")}
      style={{ "--mark-color": color } as React.CSSProperties}
    >
      {children}
      <svg
        ref={svg}
        className={["deck-mark-svg", kind === "highlight" ? "is-behind" : ""]
          .filter(Boolean)
          .join(" ")}
        width="100"
        height="100"
        aria-hidden
        focusable="false"
      >
        <g opacity={opacity ?? (kind === "highlight" ? 0.35 : 1)}>
          {shown
            ? shapes.map((s, i) => {
                const share = (s.length / total) * ms;
                const style = draw.animated
                  ? ({
                      animationDuration: `${Math.max(1, share)}ms`,
                      animationDelay: `${delay + elapsed}ms`,
                    } as React.CSSProperties)
                  : undefined;
                elapsed += share;
                return (
                  <path
                    key={`${draw.n}-${i}`}
                    d={s.d}
                    pathLength={1}
                    className={draw.animated ? "is-drawing" : undefined}
                    fill="none"
                    stroke={color}
                    strokeWidth={s.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={style}
                  />
                );
              })
            : null}
        </g>
      </svg>
    </span>
  );
}
