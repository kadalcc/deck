import {
  Children,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { findById, fromFlat, totalSlides } from "../core/model.ts";
import { formatSlideNumber } from "../core/navigation.ts";
import { useDeck, useSlideOptional } from "../react/context.ts";
import { useNav, useUi } from "../react/hooks.ts";
import { useRenderContext } from "../react/render-context.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTEXT-AWARE PIECES  —  Slidev's LightOrDark, RenderWhen, SlideCurrentNo, SlidesTotal,
 * TitleRenderer, the Kadal way
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <LightOrDark>        one thing in the light scheme, another in the dark — the slide's own
 *                        scheme when its frontmatter forces one
 *   <RenderWhen>         render only where it makes sense: the presenter view, print, a tile…
 *   <SlideCurrentNo>     this slide's number (in a layer: the current slide's)
 *   <SlidesTotal>        how many slides the deck has
 *   <TitleRenderer>      another slide's title, by number or id
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The scheme this slide is drawn in: its frontmatter's `colorScheme`, else the viewer's. */
export function useEffectiveScheme(): "light" | "dark" {
  const scheme = useUi((s) => s.colorScheme);
  const forced = useSlideOptional()?.options.colorScheme;
  return forced === "light" || forced === "dark" ? forced : scheme;
}

type Scheme = "light" | "dark";

/** A child marked `slot="light"` or `slot="dark"` (Slidev's `<template #dark>`). */
const slotOf = (child: ReactNode): Scheme | null => {
  if (!isValidElement(child)) return null;
  const slot = (child.props as { slot?: unknown }).slot;
  return slot === "light" || slot === "dark" ? slot : null;
};

export interface LightOrDarkProps {
  /** Shown in the light scheme. */
  light?: ReactNode;
  /** Shown in the dark scheme. */
  dark?: ReactNode;
  /**
   * Either children marked `slot="light"` / `slot="dark"` (any element: `<div slot="dark">…</div>`),
   * or a function of the scheme and the other props: `{({ scheme }) => …}`.
   */
  children?: ReactNode | ((props: { scheme: Scheme } & Record<string, unknown>) => ReactNode);
  /** Anything else is handed to a function child, as Slidev's scoped slots hand on their props. */
  [key: string]: unknown;
}

export function LightOrDark({ light, dark, children, ...rest }: LightOrDarkProps) {
  const scheme = useEffectiveScheme();
  if (typeof children === "function") return <>{children({ scheme, ...rest })}</>;
  const own = scheme === "dark" ? dark : light;
  if (own !== undefined) return <>{own}</>;
  const kept = Children.toArray(children as ReactNode).filter((c) => {
    const slot = slotOf(c);
    return slot === null || slot === scheme;
  });
  return <>{kept}</>;
}

/** Where `<RenderWhen>` renders. Slidev's names, plus Kadal's `audience` and `export`. */
export type RenderWhenContext =
  | "main"
  | "visible"
  | "print"
  | "export"
  | "slide"
  | "overview"
  | "presenter"
  | "previewNext"
  | "audience";

const parseContexts = (c: RenderWhenContext | RenderWhenContext[] | string): string[] =>
  (Array.isArray(c) ? c : String(c).split(/[\s,]+/)).map((x) => x.trim()).filter(Boolean);

export interface RenderWhenProps {
  /**
   * Where to render: `main` (the deck and the presenter's current slide — and the audience's
   * phone), `slide`, `presenter`, `previewNext` (the presenter's next box), `overview`, `print`
   * (also `export`), `audience`, `visible` (on screen right now). Several — an array or
   * "presenter overview" — render in any of them; `visible` combined with others must also hold.
   */
  context: RenderWhenContext | RenderWhenContext[] | string;
  /** Rendered where the context does not match. */
  fallback?: ReactNode;
  children?: ReactNode;
}

export function RenderWhen({ context, fallback = null, children }: RenderWhenProps) {
  const here = useRenderContext();
  const wanted = parseContexts(context);
  const needsVisible = wanted.includes("visible");
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!needsVisible) return;
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) =>
      setVisible(entries.some((e) => e.isIntersecting)),
    );
    io.observe(el);
    return () => io.disconnect();
  }, [needsVisible]);
  const matches = (c: string) => {
    if (c === here.context) return true;
    if (c === "main")
      return (
        here.context === "slide" || here.context === "presenter" || here.context === "audience"
      );
    if (c === "print" || c === "export") return here.print;
    return c === "visible";
  };
  const show = wanted.some(matches) && (!needsVisible || visible);
  const content = show ? children : fallback;
  return needsVisible ? (
    <div ref={box} className="deck-render-when">
      {content}
    </div>
  ) : (
    <Fragment>{content}</Fragment>
  );
}

/**
 * This slide's number — the one the slide-number control would show for it — or, outside a slide
 * (a global layer), the current one's. `format` takes the `slideNumber` formats.
 */
export function SlideCurrentNo({
  format = "c",
  className,
}: {
  /** "c" the flat number (default), "h.v" or "h/v" with vertical slides, "c/t" with the total. */
  format?: "c" | "c/t" | "h.v" | "h/v";
  className?: string;
}) {
  const deck = useDeck();
  const slide = useSlideOptional();
  const nav = useNav((s) => ({ h: s.h, v: s.v }));
  const at = slide ? { h: slide.h, v: slide.v } : nav;
  return (
    <span className={["deck-slide-no", className].filter(Boolean).join(" ")}>
      {formatSlideNumber(format, { ...at, click: 0 }, deck.columns)}
    </span>
  );
}

/** How many slides the deck has (hidden ones left out, as the slide number counts). */
export function SlidesTotal({ className }: { className?: string }) {
  const deck = useDeck();
  return (
    <span className={["deck-slides-total", className].filter(Boolean).join(" ")}>
      {totalSlides(deck.columns)}
    </span>
  );
}

/**
 * Another slide's title (its frontmatter `title`, else its first heading): `no` is its number
 * (1-based, as `<SlideCurrentNo>` shows it), or `id` its id. Neither: this slide's own.
 */
export function TitleRenderer({
  no,
  id,
  fallback,
  as: Tag = "span",
  className,
}: {
  no?: number | string;
  id?: string;
  /** Shown when that slide has no title (or there is no such slide). */
  fallback?: ReactNode;
  as?: "span" | "h1" | "h2" | "h3" | "strong" | "div";
  className?: string;
}): ReactElement {
  const deck = useDeck();
  const slide = useSlideOptional();
  let at: { h: number; v: number } | null = null;
  if (id) at = findById(deck.columns, id);
  else if (no !== undefined && Number.isFinite(Number(no)) && Number(no) >= 1) {
    const total = totalSlides(deck.columns);
    if (Number(no) <= total) at = fromFlat(deck.columns, Number(no) - 1);
  } else if (slide) at = { h: slide.h, v: slide.v };
  const title = at ? deck.columns[at.h]?.slides[at.v]?.title : null;
  return (
    <Tag className={["deck-title-renderer", className].filter(Boolean).join(" ")}>
      {title || fallback || null}
    </Tag>
  );
}
