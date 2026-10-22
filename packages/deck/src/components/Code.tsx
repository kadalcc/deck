import { type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ShikiMagicMovePrecompiled } from "shiki-magic-move/react";

import { deserialiseSteps, type LineSet } from "../compiler/code-meta.ts";
import { useDeck, useSlide } from "../react/context.ts";
import { useClick } from "../react/hooks.ts";
import { CodeGroupContext } from "./CodeGroup.tsx";
import { CodeTitle } from "./file-icons.tsx";
import { applyMagicHighlight, frameAt, magicFrames } from "./magic-frames.ts";
import { MonacoCode } from "./MonacoCode.tsx";
import { useTwoslashPopups } from "./twoslash.ts";

/**
 * The `pre` mapping: a code block highlighted at build time, with the fence meta carried in data
 * attributes. `{2-3|5|all}` reserves one click per step after the first and lights the lines of
 * the current step; `{lines:true}` numbers lines; `[title]` adds a title bar (with a file-type
 * badge); `{maxHeight}` scrolls; `{hide|…}` keeps the block hidden until its first click.
 * Notation marks (`// [!code ++]`…) arrive as classes and are pure CSS; a `twoslash` block's
 * type popups open on hover and on keyboard focus. A `{monaco…}` block is handed to
 * `MonacoCode`, which keeps this same face until (and wherever) the editor is not loaded.
 */
export interface CodeProps {
  children?: ReactNode;
  className?: string;
  "data-steps"?: string;
  "data-lines"?: string;
  "data-start"?: string;
  "data-title"?: string;
  "data-max-height"?: string;
  "data-hide-until-step"?: string;
  "data-lang"?: string;
  "data-total"?: string;
  /** `editor`, `diff`, `run` or `write`: the block is a Monaco editor (see MonacoCode). */
  "data-monaco"?: string;
  /** The block's source for the editor (the modified side of a diff). */
  "data-code"?: string;
  /** The original side of a `{monaco-diff}`. */
  "data-original"?: string;
  /** The editor's and runner's options, as JSON. */
  "data-monaco-options"?: string;
  /** Where a `<<<` import read the code from: `path#region`. */
  "data-snippet"?: string;
  "data-twoslash"?: string;
  [key: string]: unknown;
}

export function Code(props: CodeProps) {
  return props["data-monaco"] ? <MonacoCode {...props} /> : <PlainCode {...props} />;
}

function PlainCode(props: CodeProps) {
  const {
    children,
    className,
    "data-steps": stepsAttr,
    "data-lines": linesAttr,
    "data-start": startAttr,
    "data-title": title,
    "data-max-height": maxHeight,
    "data-hide-until-step": hideUntil,
    "data-lang": lang,
    "data-total": total,
    "data-twoslash": twoslash,
    ...rest
  } = props;
  const inGroup = useContext(CodeGroupContext);
  const steps = useMemo<LineSet[] | null>(
    () => (stepsAttr ? deserialiseSteps(stepsAttr) : null),
    [stepsAttr],
  );
  const clickCount = (steps ? steps.length - 1 : 0) + (hideUntil ? 1 : 0);
  const { range, click } = useClick(clickCount > 0 ? { span: clickCount } : { at: 0 });
  const pre = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  useTwoslashPopups(pre, !!twoslash);

  // rel: 0 before the block's first click, then 1..clickCount.
  const rel = clickCount > 0 ? Math.min(clickCount, Math.max(0, click - range.start + 1)) : 0;
  const hidden = !!hideUntil && rel < 1;
  const stepIndex = steps ? Math.min(steps.length - 1, Math.max(0, hideUntil ? rel - 1 : rel)) : -1;
  const active = steps && stepIndex >= 0 ? steps[stepIndex]! : null;

  useEffect(() => {
    const el = pre.current;
    if (!el) return;
    for (const line of el.querySelectorAll<HTMLElement>(".line")) {
      const n = Number(line.dataset.line);
      const on = active === null ? true : active.has(n);
      line.classList.toggle("is-active", !!steps && on && active !== null);
      line.classList.toggle("is-dim", !!steps && active !== null && !on);
    }
  }, [active, steps, children]);

  const copy = async () => {
    try {
      // Removed lines of a diff are not part of the code you would paste.
      const el = pre.current;
      const text = el
        ? [...el.querySelectorAll<HTMLElement>(".line")]
            .filter((l) => !l.classList.contains("remove"))
            .map((l) => l.innerText.replace(/\n$/, ""))
            .join("\n")
        : "";
      await navigator.clipboard.writeText(text || (el?.innerText ?? ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  };

  const start = Number(startAttr ?? 1);
  const showTitle = !!title && !inGroup;
  return (
    <div
      className={["deck-code-block", hidden ? "is-hidden" : "", showTitle ? "has-title" : ""]
        .filter(Boolean)
        .join(" ")}
      data-lang={lang ?? "text"}
    >
      {showTitle ? <CodeTitle title={title} lang={lang} /> : null}
      <pre
        ref={pre}
        {...rest}
        className={["deck-code", "shiki", linesAttr === "true" ? "has-lines" : "", className]
          .filter(Boolean)
          .join(" ")}
        style={{
          ...(maxHeight ? { maxHeight, overflow: "auto" } : null),
          counterReset: `line ${start - 1}`,
        }}
        data-total={total || undefined}
      >
        {children}
      </pre>
      <button type="button" className="deck-code-copy" onClick={copy} aria-label="Copy code">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Shiki Magic Move: the precomputed steps from the plugin, morphing on each click. An inner fence's
 * highlight steps (`{*|2|4-5}`) are clicks too, in order with the morphs (components/magic-frames.ts):
 * the lines outside the frame's set step back, in print and export as on screen. The tokens carry
 * their colours as Shiki's CSS variables, so the colour scheme and the theme menu recolour them
 * with the rest of the code, without a morph.
 */
export function MagicMove({ block }: { block: number }) {
  const slide = useSlide();
  const deck = useDeck();
  const data = slide.magic?.[block] ?? null;
  const frames = useMemo(() => (data ? magicFrames(data.steps) : []), [data]);
  const count = Math.max(0, frames.length - 1);
  const atOption = data?.options.at;
  const { range, click } = useClick(
    count > 0
      ? { span: count, at: atOption !== undefined ? Number(atOption) : undefined }
      : { at: 0 },
  );
  const wrap = useRef<HTMLDivElement>(null);
  const frame = frameAt(frames, count > 0 ? click - range.start + 1 : 0);
  const step = frame?.step ?? 0;
  const steps = useMemo(() => (data ? data.steps.map((s) => s.tokens) : []) as never[], [data]);
  // The block's `{duration}`, else the deck's `magicMoveDuration`. Never undefined: the renderer
  // writes it into `--smm-duration`, and "undefinedms" there switched every transition off.
  const own = Number(data?.options.duration);
  const duration =
    own > 0 ? own : deck.config.magicMoveDuration > 0 ? deck.config.magicMoveDuration : 800;
  // `{lines: true}` on the outer fence numbers every step; an inner fence can ask for itself.
  const lineNumbers = data?.options.lines === "true" || !!data?.steps[step]?.lines;
  // A stable object: the renderer re-syncs its tokens whenever `options` is a new one.
  const options = useMemo(() => ({ duration, lineNumbers }), [duration, lineNumbers]);
  // After the renderer has drawn the step (its effect runs before this one, being a child's).
  useEffect(() => {
    applyMagicHighlight(
      wrap.current?.querySelector(".shiki-magic-move-container") ?? null,
      frame?.lines ?? null,
    );
  });
  if (!data) return <pre className="deck-code">Magic move block missing</pre>;
  return (
    <div
      className={["deck-code-block", "is-magic", data.title ? "has-title" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {data.title ? <CodeTitle title={data.title} lang={data.steps[0]?.lang} /> : null}
      <div
        ref={wrap}
        className={[
          "deck-code",
          "shiki",
          "shiki-magic-move-wrap",
          frame?.lines ? "has-highlight" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <ShikiMagicMovePrecompiled
          steps={steps}
          step={step}
          // Off the stage (print, previews) and under prefers-reduced-motion: the step, at once.
          animate={slide.active && !reducedMotion()}
          options={options}
        />
      </div>
    </div>
  );
}
