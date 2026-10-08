import { motion, type TargetAndTransition } from "motion/react";
import type { ReactNode } from "react";

import { useSlide } from "../react/context.ts";
import { useClick } from "../react/hooks.ts";

/**
 * Slidev's `v-motion`, in React: `initial` before the slide (or click) arrives, `enter` when it
 * does, `leave` when it goes, plus `click-N` variants that apply from click N on. Backed by the
 * motion library, so any animatable property works.
 */
export interface MotionProps {
  initial?: TargetAndTransition;
  enter?: TargetAndTransition;
  leave?: TargetAndTransition;
  /** Apply from a click on: `{ "click-1": { x: 40 }, "click-2": { y: 60 } }`. */
  clicks?: Record<string, TargetAndTransition>;
  /** Tie the whole thing to a click step (like `v-click` + `v-motion`). */
  at?: number | string;
  transition?: TargetAndTransition["transition"];
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
  as?: "div" | "span" | "p" | "li" | "h1" | "h2" | "h3" | "img";
  [key: string]: unknown;
}

export function Motion({
  initial = { opacity: 0, y: 24 },
  enter = { opacity: 1, y: 0 },
  leave,
  clicks = {},
  at,
  transition,
  className,
  style,
  children,
  as = "div",
  ...rest
}: MotionProps) {
  const slide = useSlide();
  const step = useClick(at !== undefined ? { at } : { at: "+0" });
  const gated = at !== undefined;
  const on = slide.active && (!gated || step.shown);
  let target: TargetAndTransition = on ? { ...enter } : { ...initial };
  if (on) {
    for (const [key, value] of Object.entries(clicks)) {
      const m = /^click-(\d+)(?:-(\d+))?$/.exec(key);
      if (!m) continue;
      const from = Number(m[1]);
      const to = m[2] ? Number(m[2]) : Number.POSITIVE_INFINITY;
      if (slide.click >= from && slide.click < to) target = { ...target, ...value };
    }
  }
  const Tag = (motion as unknown as Record<string, typeof motion.div>)[as] ?? motion.div;
  return (
    <Tag
      className={["deck-motion", className].filter(Boolean).join(" ")}
      style={style}
      initial={initial}
      animate={target}
      exit={leave}
      transition={transition ?? { type: "spring", stiffness: 260, damping: 26 }}
      {...(rest as object)}
    >
      {children}
    </Tag>
  );
}
