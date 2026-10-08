import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useActions, useClick, useUi } from "../react/hooks.ts";
import type { SketchScene } from "../sketch/dsl.ts";
import {
  type ExcalidrawFile,
  hashInput,
  type RenderedSketch,
  renderSketch,
  type SketchInput,
} from "../sketch/render.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Sketch>  —  a hand-drawn Excalidraw diagram on a slide
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <Sketch scene={architecture} />                    drawn in code with the `sketch()` DSL
 *   <Sketch src="diagrams/flow.excalidraw" />          a file saved from excalidraw.com (public/)
 *   <Sketch src={fileObject} />                        the same, already loaded
 *   <Sketch>{`flowchart LR; a --> b`}</Sketch>          Mermaid, converted to a sketch
 *
 * The drawing is a static SVG recoloured with the theme's tokens, so it follows the theme menu
 * and the dark scheme. `steps` turns clicks into a tour: the whole diagram shows first, then
 * each click lights one region (a `region` from the DSL, a frame or group from a file) and dims
 * the rest, with an optional caption — the notes' `[click]` markers line up with them. The
 * corner button (or its F-hint) opens the real Excalidraw canvas in view mode, to pan and zoom.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type SketchStep = string | null | { focus?: string | string[] | null; caption?: ReactNode };

export interface SketchProps {
  scene?: SketchScene;
  src?: string | ExcalidrawFile;
  mermaid?: string;
  children?: ReactNode;
  /** Regions to light up, one per click, after the whole diagram has shown. */
  steps?: SketchStep[];
  /** Shown under the diagram when no step's caption is. */
  caption?: ReactNode;
  /** CSS size limits for the drawing. */
  width?: string;
  height?: string;
  /** Font size for Mermaid conversions. */
  fontSize?: number;
  zoomable?: boolean;
  className?: string;
}

function stepOf(s: SketchStep | undefined): { focus: string[] | null; caption?: ReactNode } {
  if (s == null) return { focus: null };
  if (typeof s === "string") return { focus: [s] };
  const f = s.focus;
  return { focus: f == null ? null : Array.isArray(f) ? f : [f], caption: s.caption };
}

export function Sketch({
  scene,
  src,
  mermaid,
  children,
  steps = [],
  caption,
  width,
  height,
  fontSize,
  zoomable = true,
  className,
}: SketchProps) {
  const text =
    mermaid ??
    (typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "");
  const input = useMemo<SketchInput>(() => {
    if (scene) return scene;
    if (typeof src === "string") return { kind: "url", src };
    if (src) return { kind: "file", data: src };
    return { kind: "mermaid", source: text.trim(), fontSize };
  }, [scene, src, text, fontSize]);
  const key = useMemo(() => hashInput(input), [input]);

  const [out, setOut] = useState<RenderedSketch | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    renderSketch(input, key).then(
      (r) => alive && setOut(r),
      (e) => alive && setError(String(e)),
    );
    return () => {
      alive = false;
    };
  }, [input, key]);

  const n = steps.length;
  const { range, click } = useClick(n ? { span: n } : { at: 0 });
  const idx = n && click >= range.start ? Math.min(click - range.start, n - 1) : -1;
  const step = idx >= 0 ? stepOf(steps[idx]) : { focus: null };
  const focus = step.focus;
  const shownCaption = step.caption ?? caption;
  const actions = useActions();
  const hints = useUi((s) => s.hints);

  const body = useRef<HTMLDivElement>(null);
  const open = useRef<HTMLButtonElement>(null);
  // The drawing is centred and may be narrower than its column: park the canvas button on its
  // own top-right corner, re-measured when the stage rescales.
  useLayoutEffect(() => {
    const place = () => {
      const svg = body.current?.querySelector("svg");
      const btn = open.current;
      const fig = btn?.parentElement;
      if (!svg || !btn || !fig) return;
      const s = svg.getBoundingClientRect();
      const f = fig.getBoundingClientRect();
      const scale = f.width / Math.max(1, fig.offsetWidth);
      btn.style.left = `${(s.right - f.left) / scale - btn.offsetWidth - 4}px`;
      btn.style.top = `${(s.top - f.top) / scale + 4}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [out]);
  useLayoutEffect(() => {
    const root = body.current;
    if (!root) return;
    for (const g of root.querySelectorAll<SVGGElement>(".sk-el")) {
      const rs = (g.getAttribute("data-region") ?? "").split("|").filter(Boolean);
      const dim = !!focus && rs.length > 0 && !rs.some((r) => focus.includes(r));
      g.classList.toggle("is-dim", dim);
      g.classList.toggle("is-lit", !!focus && !dim && rs.length > 0);
    }
  }, [out, focus]);

  return (
    <figure
      className={["deck-sketch", focus ? "has-focus" : "", hints ? "hints-on" : "", className]
        .filter(Boolean)
        .join(" ")}
      data-sketch={key}
      style={
        {
          ...(width ? { maxWidth: width } : {}),
          ...(height ? { "--sk-max-h": height } : {}),
          ...(out ? { "--sk-ratio": (out.width / Math.max(1, out.height)).toFixed(4) } : {}),
        } as React.CSSProperties
      }
    >
      <div
        ref={body}
        className="deck-sketch-body"
        dangerouslySetInnerHTML={{ __html: out?.svg ?? "" }}
      />
      {!out && !error ? <div className="deck-sketch-loading">drawing…</div> : null}
      {error ? <pre className="deck-sketch-error">{error}</pre> : null}
      {zoomable && out ? (
        <button
          ref={open}
          type="button"
          className="deck-sketch-open"
          data-hint="canvas"
          title="Open on the canvas (pan and zoom)"
          aria-label="Open on the canvas"
          onClick={() => actions.openLightbox("sketch", key, "sketch")}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      ) : null}
      {shownCaption ? (
        <figcaption key={idx} className="deck-sketch-caption">
          {shownCaption}
        </figcaption>
      ) : null}
    </figure>
  );
}
