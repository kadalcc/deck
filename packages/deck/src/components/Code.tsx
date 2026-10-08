import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ShikiMagicMovePrecompiled } from "shiki-magic-move/react";

import { deserialiseSteps, type LineSet } from "../compiler/code-meta.ts";
import { useSlide } from "../react/context.ts";
import { useClick, useUi } from "../react/hooks.ts";

/**
 * The `pre` mapping: a code block highlighted at build time, with the fence meta carried in data
 * attributes. `{2-3|5|all}` reserves one click per step after the first and lights the lines of
 * the current step; `{lines:true}` numbers lines; `[title]` adds a title bar; `{maxHeight}` scrolls;
 * `{hide|…}` keeps the block hidden until its first click.
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
  [key: string]: unknown;
}

export function Code(props: CodeProps) {
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
    ...rest
  } = props;
  const steps = useMemo<LineSet[] | null>(
    () => (stepsAttr ? deserialiseSteps(stepsAttr) : null),
    [stepsAttr],
  );
  const clickCount = (steps ? steps.length - 1 : 0) + (hideUntil ? 1 : 0);
  const { range, click } = useClick(clickCount > 0 ? { span: clickCount } : { at: 0 });
  const pre = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

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
      await navigator.clipboard.writeText(pre.current?.innerText ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  };

  const start = Number(startAttr ?? 1);
  return (
    <div
      className={["deck-code-block", hidden ? "is-hidden" : "", title ? "has-title" : ""]
        .filter(Boolean)
        .join(" ")}
      data-lang={lang ?? "text"}
    >
      {title ? (
        <div className="deck-code-title">
          <span className="deck-code-title-dot" />
          <span>{title}</span>
        </div>
      ) : null}
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

/** Shiki Magic Move: the precomputed steps from the plugin, morphing on each click. */
export function MagicMove({ block }: { block: number }) {
  const slide = useSlide();
  const scheme = useUi((s) => s.colorScheme);
  const data = slide.magic?.[block] ?? null;
  const count = data ? Math.max(0, data.steps.length - 1) : 0;
  const atOption = data?.options.at;
  const { range, click } = useClick(
    count > 0
      ? { span: count, at: atOption !== undefined ? Number(atOption) : undefined }
      : { at: 0 },
  );
  if (!data) return <pre className="deck-code">Magic move block missing</pre>;
  const step = count > 0 ? Math.min(count, Math.max(0, click - range.start + 1)) : 0;
  const steps = data.steps.map((s) =>
    scheme === "dark" ? s.tokens.dark : s.tokens.light,
  ) as never[];
  const duration = data.options.duration ? Number(data.options.duration) : undefined;
  return (
    <div
      className={["deck-code-block", "is-magic", data.title ? "has-title" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {data.title ? (
        <div className="deck-code-title">
          <span className="deck-code-title-dot" />
          <span>{data.title}</span>
        </div>
      ) : null}
      <div className="deck-code shiki-magic-move-wrap">
        <ShikiMagicMovePrecompiled
          steps={steps}
          step={step}
          animate={slide.active}
          options={{ duration, lineNumbers: data.steps[step]?.lines }}
        />
      </div>
    </div>
  );
}
