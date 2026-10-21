import { type ReactNode, useLayoutEffect, useMemo, useRef } from "react";

import { type LineSet, parseLineSet } from "../compiler/code-meta.ts";
import { useClick } from "../react/hooks.ts";

/**
 * Line highlighting for display maths, stepped by clicks — what `$$ {1|3|all}` compiles to
 * (compiler/remark-fences.ts), as Slidev's `katex-lines`:
 *
 *   $$ {1|3|all}
 *   \begin{aligned}
 *   a &= b \\
 *   c &= d \\
 *   e &= f
 *   \end{aligned}
 *   $$
 *
 * The first step shows before any click, each later one takes a click (they count toward the
 * slide's clicks, like a code fence's `{2|3|all}`), lines outside a step dim. `at` starts the
 * steps later (`{at: 3}`, or `"+2"`), `finally` is what shows once the slide's clicks go past
 * the last step (default: the last step), `startLine` numbers the first line differently.
 *
 * The lines are the rows of the formula's alignment (`aligned`, `align`, `array`, `cases`,
 * `matrix`…); in a formula without rows the whole formula is line 1.
 */
export interface KatexLinesProps {
  /** `1|3|all`: one set of lines per step. */
  steps?: string;
  at?: number | string;
  finally?: string;
  startLine?: number;
  children?: ReactNode;
}

/** The rows KaTeX lays out for an alignment, grouped so each line is every column's cell. */
export function katexLines(root: Element): Element[][] {
  const cols = [...root.querySelectorAll(".mtable > [class*=col-align]")].filter(
    (c) => !c.parentElement?.closest(".mtable > [class*=col-align]"),
  );
  const lines: Element[][] = [];
  for (const col of cols) {
    const rows = col.querySelectorAll(":scope > .vlist-t > .vlist-r > .vlist > span > .mord");
    rows.forEach((row, i) => (lines[i] ??= []).push(row));
  }
  if (!lines.length) {
    const base = root.querySelector(".katex-html");
    if (base) lines.push([base]);
  }
  return lines;
}

export function KatexLines({
  steps = "",
  at,
  finally: last,
  startLine = 1,
  children,
}: KatexLinesProps) {
  const sets = useMemo<LineSet[]>(() => steps.split("|").map((s) => parseLineSet(s)), [steps]);
  const clicks = Math.max(0, sets.length - 1);
  const { range, click } = useClick(clicks > 0 ? { span: clicks, at } : { at: 0 });
  const root = useRef<HTMLDivElement>(null);
  // Step 0 before the block's first click, then one step per click; past the end, `finally`.
  const rel = clicks > 0 ? click - range.start + 1 : 0;
  const active: LineSet =
    rel < 0
      ? sets[0]!
      : rel <= clicks
        ? sets[Math.max(0, rel)]!
        : last !== undefined && last !== "last"
          ? parseLineSet(String(last))
          : sets[clicks]!;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const lines = katexLines(el);
    lines.forEach((cells, i) => {
      const n = i + startLine;
      const on = active === null || active.has(n);
      for (const cell of cells) {
        cell.classList.add("deck-katex-line");
        cell.classList.toggle("is-active", active !== null && on);
        cell.classList.toggle("is-dim", !on);
      }
    });
  }, [active, startLine, children]);

  return (
    <div ref={root} className="deck-katex-lines" data-steps={steps}>
      {children}
    </div>
  );
}
