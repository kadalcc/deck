import { Children, type ElementType, isValidElement, type ReactNode } from "react";

import type { ClickAt } from "../core/clicks.ts";
import { useClick } from "../react/hooks.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Switch>  —  one child at a time, switched by clicks (Slidev's v-switch)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <Switch>
 *     <Case>shown at the switch's first click</Case>
 *     <Case>its second</Case>
 *     <Case at="4-6">its fourth and fifth</Case>
 *   </Switch>
 *
 * Steps count from the switch's own first click — Slidev's slot numbers: a `<Case>` without `at`
 * comes one step after the one before it (the first at 1); `at={n}` starts it at step n and it
 * lasts until the next case starts; `at="a-b"` (or `[a, b]`) shows it from a until b. `at={0}`
 * shows a case before the switch's first click — what the slide starts with.
 *
 * Unlike Slidev's, the last case STAYS once reached unless it has a range of its own — a switch
 * is usually the end of a thought, not a blank — and the cases share one grid cell, so the
 * switch is as big as its biggest case and nothing below it jumps as they change. `transition`
 * fades, slides or scales between them (none under reduced motion); `unmount` drops the hidden
 * cases from the page instead (a heavy embed in one of them).
 *
 * The switch takes as many clicks as its last case's start (or range end, less one), from `at`
 * (default: one after the previous click, as a `<Click>`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface CaseProps {
  /** When, in the switch's own steps: n, "a-b", or [a, b]. Default: one after the case before. */
  at?: number | string | [number, number];
  as?: ElementType;
  className?: string;
  children?: ReactNode;
}

/** One case of a `<Switch>`; rendered by the switch, never on its own. */
export function Case({ children }: CaseProps) {
  return <>{children}</>;
}

interface Resolved {
  start: number;
  end: number;
  node: ReactNode;
  as?: ElementType;
  className?: string;
}

/** Cases → step ranges (pure, exported for tests). */
export function switchRanges(
  cases: Array<{ at?: CaseProps["at"] }>,
): Array<{ start: number; end: number }> {
  const raw = cases.map((c, i) => {
    const at = c.at;
    if (Array.isArray(at)) return { start: at[0], end: at[1], explicit: true, i };
    if (typeof at === "string" && /^\s*\d+\s*-\s*\d+\s*$/.test(at)) {
      const [a, b] = at.split("-").map((x) => Number(x.trim()));
      return { start: a!, end: b!, explicit: true, i };
    }
    if (at !== undefined && Number.isFinite(Number(at)))
      return { start: Number(at), end: Number.NaN, explicit: false, i };
    return { start: Number.NaN, end: Number.NaN, explicit: false, i };
  });
  let prev = 0;
  for (const r of raw) {
    if (Number.isNaN(r.start)) r.start = prev + 1;
    prev = r.start;
  }
  // An open case lasts until the next case (by start) begins; the last open one stays.
  const byStart = [...raw].sort((a, b) => a.start - b.start || a.i - b.i);
  for (let k = 0; k < byStart.length; k++) {
    const r = byStart[k]!;
    if (r.explicit) continue;
    const next = byStart.slice(k + 1).find((n) => n.start > r.start);
    r.end = next ? next.start : Number.POSITIVE_INFINITY;
  }
  return raw.map(({ start, end }) => ({ start, end }));
}

export interface SwitchProps {
  /** When the switch's first step is: as `<Click at>`. Default one after the previous click. */
  at?: ClickAt;
  /** "fade" (default), "slide-up", "slide-left", "scale", or "none". */
  transition?: "fade" | "slide-up" | "slide-left" | "scale" | "none" | (string & {});
  /** Leave hidden cases out of the page rather than hidden in it. */
  unmount?: boolean;
  /** The switch's element; `div` by default. */
  as?: ElementType;
  /** Each case's element (`childTag`); `div` by default. */
  childAs?: ElementType;
  className?: string;
  /** `<Case>`s — or any elements, each one step. */
  children?: ReactNode;
}

export function Switch({
  at,
  transition = "fade",
  unmount = false,
  as,
  childAs,
  className,
  children,
}: SwitchProps) {
  const items = Children.toArray(children).filter(
    (c) => isValidElement(c) || (typeof c === "string" && c.trim()),
  );
  const cases: Resolved[] = [];
  const ranges = switchRanges(
    items.map((c) =>
      isValidElement(c) && c.type === Case ? { at: (c.props as CaseProps).at } : {},
    ),
  );
  items.forEach((c, i) => {
    const own = isValidElement(c) && c.type === Case ? (c.props as CaseProps) : null;
    cases.push({
      ...ranges[i]!,
      node: own ? own.children : c,
      as: own?.as,
      className: own?.className,
    });
  });
  // The steps the switch takes: up to the last start, or the last range's last step.
  const span = Math.max(1, ...cases.map((c) => (Number.isFinite(c.end) ? c.end - 1 : c.start)));
  const { range, click } = useClick({ at, span });
  const step = click - range.start + 1;
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={["deck-switch", `transition-${transition}`, className].filter(Boolean).join(" ")}
      data-click-at={range.start}
    >
      {cases.map((c, i) => {
        // A case at 0 is what the slide starts with, however many clicks come before the switch.
        const shown = (c.start <= 0 || step >= c.start) && step < c.end;
        if (unmount && !shown) return null;
        const Child = (c.as ?? childAs ?? "div") as ElementType;
        return (
          <Child
            key={i}
            className={[
              "deck-switch-case",
              shown ? "is-shown" : "is-hidden",
              step === c.start ? "is-current" : "",
              step >= c.end ? "is-past" : "",
              c.className,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden={shown ? undefined : true}
            data-switch-start={c.start}
            data-switch-end={Number.isFinite(c.end) ? c.end : undefined}
          >
            {c.node}
          </Child>
        );
      })}
    </Tag>
  );
}
