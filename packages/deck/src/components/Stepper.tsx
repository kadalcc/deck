import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import type { ClickAt } from "../core/clicks.ts";
import { useClick } from "../react/hooks.ts";
import { useSlideOptional } from "../react/context.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Stepper>  —  where the talk (or this slide) is, without moving anything
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <Stepper steps={["Build", "Rehearse", "Present", "Own the room"]} current={2} place="top" />
 *   <Stepper steps={["Ask", "Measure", "Change", "Check"]} follow />
 *
 * A stepper is the one element an audience reads as fixed furniture: it sits in the same place on
 * every slide that carries it and only its highlight moves. Hand-made ones jump — they are centred
 * with the slide's content, shrunk with it when auto-fit scales a full slide, and a bold current
 * label widens its neighbours. So:
 *
 *   - every step is an equal cell (labels ellipsize), so the current one can be bolder, larger or
 *     coloured without nudging the others;
 *   - `place="top" | "bottom"` draws it on the slide's rail, outside the layout — not centred, not
 *     auto-fitted — so it is pixel-identical across slides; without `place` it flows inline;
 *   - `current` (1-based) fixes the step; `follow` advances it with this slide's clicks instead (the
 *     first step before them, one more per click), one explainer slide walking its steps while the
 *     rest of the slide stays put. To move an explanation in lockstep, start the stepper and a
 *     `<Switch>` on the same click (`at`), so its cases share one cell too:
 *
 *       <Stepper steps={["Ask", "Measure", "Change"]} follow at={1} />
 *       <Switch at={1}><Case at={0}>Ask…</Case><Case>Measure…</Case><Case>Change…</Case></Switch>
 *
 * Steps before the current one are "done", after it "next"; `variant` picks the look: "chips"
 * (default), "bar" (a track with a moving fill) or "dots".
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface StepperProps {
  /** The steps' labels, in order. */
  steps: ReactNode[];
  /** The current step, 1-based; 0 for none yet. Ignored with `follow`. */
  current?: number;
  /** Advance with this slide's clicks (one step per click) instead of `current`. */
  follow?: boolean;
  /** With `follow`: when the second step arrives, as `<Click at>`. Default one after the previous click. */
  at?: ClickAt;
  /** "top" or "bottom": on the slide's rail, the same place on every slide. Default: inline. */
  place?: "top" | "bottom";
  variant?: "chips" | "bar" | "dots";
  /** Number the steps (chips only). Default true. */
  numbered?: boolean;
  className?: string;
  /** What a screen reader calls it. Default "Progress". */
  label?: string;
}

export function Stepper(props: StepperProps) {
  return props.follow ? <FollowingStepper {...props} /> : <StepperView {...props} />;
}

/** The click-driven stepper: step 1 shows before its clicks, each click moves one step on. */
function FollowingStepper(props: StepperProps) {
  const span = Math.max(1, props.steps.length - 1);
  const { range, click } = useClick({ at: props.at, span });
  const into = click - range.start + 1; // 0 before the first click
  const current = Math.min(props.steps.length, Math.max(1, into + 1));
  return <StepperView {...props} current={current} />;
}

function StepperView({
  steps,
  current = 0,
  place,
  variant = "chips",
  numbered = true,
  className,
  label = "Progress",
}: StepperProps) {
  const slide = useSlideOptional();
  const n = steps.length;
  const node = (
    <ol
      className={["deck-stepper", `is-${variant}`, place ? `on-rail is-${place}` : "", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
      // The fill and the cells read one number, so the bar never lays out anything new.
      style={{ ["--stepper-n" as string]: n, ["--stepper-at" as string]: Math.min(current, n) }}
    >
      {steps.map((s, i) => {
        const state = i + 1 < current ? "is-done" : i + 1 === current ? "is-current" : "is-next";
        return (
          <li
            key={i}
            className={["deck-stepper-step", state].join(" ")}
            aria-current={state === "is-current" ? "step" : undefined}
          >
            {variant === "chips" && numbered ? (
              <span className="deck-stepper-num">{i + 1}</span>
            ) : null}
            {variant === "dots" ? <span className="deck-stepper-dot" aria-hidden /> : null}
            <span className="deck-stepper-label">{s}</span>
          </li>
        );
      })}
    </ol>
  );
  // On a rail: drawn in the slide frame's own layer (react/SlideFrame.tsx), outside the layout. In a
  // slide it waits for the rail (set during the frame's first commit, before anything is painted)
  // rather than flowing inline for a frame and then leaving; outside a slide it flows inline.
  if (!place || !slide) return node;
  const rail = slide.rails?.[place];
  return rail ? createPortal(node, rail) : null;
}
