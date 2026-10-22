import { deserialiseSteps, type LineSet } from "../compiler/code-meta.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MAGIC MOVE FRAMES: the morph steps and their line highlights, as one click timeline
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A magic-move block's inner fences may each carry highlight steps, Slidev's way:
 *
 *   ````md magic-move {lines: true}
 *   ```ts {*|2|4-5}      ← step 1: all lines, then line 2, then lines 4–5
 *   …
 *   ```
 *   ```ts {*}{lines: false}
 *   …
 *   ```
 *   ````
 *
 * Every (step, highlight) pair is a frame, in reading order: the first frame shows before the
 * block's first click, and each later frame — the next highlight of the same step, or the next
 * step's first highlight (which is also its morph) — costs one click. So the block above takes
 * 3 + 1 − 1 = 3 clicks. A step without highlights is one frame with every line lit.
 *
 * The frames are worked out here, out of the component, so the timeline is a plain function
 * the tests (and the outline's click counts) can read.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MagicFrame {
  /** Which morph step shows. */
  step: number;
  /** The lines lit in it (1-based); null lights every line. */
  lines: LineSet;
}

export function magicFrames(steps: ReadonlyArray<{ highlight: string | null }>): MagicFrame[] {
  const frames: MagicFrame[] = [];
  steps.forEach((s, step) => {
    const sets = s.highlight ? deserialiseSteps(s.highlight) : [null];
    for (const lines of sets.length ? sets : [null]) frames.push({ step, lines });
  });
  return frames;
}

/** The frame on show at a click: `rel` is 0 before the block's first click, then 1, 2… */
export function frameAt(frames: MagicFrame[], rel: number): MagicFrame | null {
  if (!frames.length) return null;
  return frames[Math.min(frames.length - 1, Math.max(0, rel))]!;
}

/**
 * Light a rendered step's lines. The renderer draws tokens straight into its `pre` — an anchor
 * first, then token spans with a `<br>` after each line, then the tokens of the step it is
 * leaving, absolutely placed while they fade — so lines are read back from the `<br>`s, and the
 * leaving tokens are left alone. Line-number tokens belong to their line and dim with it.
 */
export function applyMagicHighlight(pre: Pick<Element, "children"> | null, lines: LineSet): void {
  if (!pre) return;
  let line = 1;
  for (const el of pre.children) {
    if (el.tagName === "BR") {
      line++;
      continue;
    }
    if (!el.classList.contains("shiki-magic-move-item")) continue; // the anchor
    if (el.classList.contains("shiki-magic-move-leave-active")) continue;
    const on = lines === null || lines.has(line);
    el.classList.toggle("is-dim", !on);
    el.classList.toggle("is-lit", lines !== null && on);
  }
}
