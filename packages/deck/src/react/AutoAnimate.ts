import {
  AUTO_ANIMATE_STYLES,
  type AutoAnimateMatcher,
  type DeckConfig,
  type SlideOptions,
} from "../core/model.ts";

/**
 * Auto-Animate: reveal.js's idea, implemented with the Web Animations API. Before a slide leaves
 * we snapshot every candidate element; after the next slide mounts we find its matches and
 * animate each from where it was to where it is — position and size through a FLIP transform,
 * plus the CSS properties in `autoAnimateStyles` (reveal's twelve by default). Unmatched elements
 * fade in.
 *
 * Matching: an explicit `data-id` first; otherwise the same tag with the same text, in order. A
 * deck.config.ts `autoAnimateMatcher(fromSlide, toSlide)` replaces that with its own pairs.
 * Per-element tuning: `data-auto-animate-delay`, `-duration`, `-easing`.
 *
 * reveal.js's state attributes, for CSS hooks: both slides get `data-auto-animate="pending"` as
 * the morph is set up, the arriving one `"running"` once it starts; each element taking part gets
 * `data-auto-animate-target` (a number for a matched one, `unmatched` for one fading in). They
 * are cleared at the next slide change, as reveal clears them.
 */
export interface Snapshot {
  key: string;
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">;
  /** The computed value of each animated property, by its CSS name. */
  styles: Record<string, string>;
}

const CANDIDATES =
  "h1, h2, h3, h4, h5, h6, p, li, img, video, iframe, pre, code, blockquote, div, span, svg, table, button, figure, [data-id]";

/**
 * Properties that change an element's box. When one of them differs between the two slides, the
 * box already grows or shrinks as it animates, so scaling it as well would count the change twice
 * (a heading going from h1 to h2 started out the square of its size ratio too big).
 */
const BOX_STYLES = /^(font-size|line-height|letter-spacing|padding|border-width|border-\w+-width)/;

function keyOf(el: Element, counts: Map<string, number>): string {
  const explicit = el.getAttribute("data-id");
  if (explicit) return `id:${explicit}`;
  const tag = el.tagName.toLowerCase();
  const src = el.getAttribute("src");
  const text = src ?? (el.textContent ?? "").trim().slice(0, 120);
  const base = `${tag}:${text}`;
  const n = counts.get(base) ?? 0;
  counts.set(base, n + 1);
  return `${base}#${n}`;
}

function candidates(root: Element): Element[] {
  const all = [...root.querySelectorAll(CANDIDATES)];
  // Skip elements that only exist to lay out others (no text, no id, no media).
  return all.filter((el) => {
    if (el.hasAttribute("data-id")) return true;
    const tag = el.tagName.toLowerCase();
    if (["img", "video", "iframe", "svg"].includes(tag)) return true;
    if (tag === "div" || tag === "span") return false;
    return (el.textContent ?? "").trim().length > 0;
  });
}

/** `background-color` → `backgroundColor`: the Web Animations API names properties as the CSSOM does. */
export function keyframeProperty(css: string): string {
  if (css.startsWith("--")) return css;
  if (css === "float") return "cssFloat";
  return css.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

function readStyles(cs: CSSStyleDeclaration, styles: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of styles) out[name] = cs.getPropertyValue(name);
  return out;
}

type Box = Pick<DOMRect, "left" | "top" | "width" | "height">;

/** An element's box, measured from `origin`'s corner when given, else from the viewport's. */
function boxFrom(el: Element, origin: Element | null): Box {
  const r = el.getBoundingClientRect();
  const o = origin?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return { left: r.left - o.left, top: r.top - o.top, width: r.width, height: r.height };
}

function snapOf(
  el: Element,
  key: string,
  styles: readonly string[],
  origin: Element | null = null,
): Snapshot {
  return { key, rect: boxFrom(el, origin), styles: readStyles(getComputedStyle(el), styles) };
}

export function snapshot(
  root: Element,
  styles: readonly string[] = AUTO_ANIMATE_STYLES,
  origin: Element | null = null,
): Map<string, Snapshot> {
  const out = new Map<string, Snapshot>();
  const counts = new Map<string, number>();
  for (const el of candidates(root)) {
    const key = keyOf(el, counts);
    out.set(key, snapOf(el, key, styles, origin));
  }
  return out;
}

/**
 * The two keyframes of one matched element: where it was (a FLIP transform from its new box, and
 * the old value of every property that changed) and where it is. Properties with the same value on
 * both slides are left out, so they cost nothing and cannot jump.
 */
export function morphFrames(
  from: { rect: Box; styles: Record<string, string> },
  to: { rect: Box; styles: Record<string, string> },
  scale: number,
): [Keyframe, Keyframe] {
  const changed = Object.keys(to.styles).filter(
    (name) => from.styles[name] !== undefined && from.styles[name] !== to.styles[name],
  );
  const boxChanges = changed.some((name) => BOX_STYLES.test(name));
  const dx = (from.rect.left - to.rect.left) / scale;
  const dy = (from.rect.top - to.rect.top) / scale;
  const sx = !boxChanges && to.rect.width ? from.rect.width / to.rect.width : 1;
  const sy = !boxChanges && to.rect.height ? from.rect.height / to.rect.height : 1;
  const first: Keyframe = {
    transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
    transformOrigin: "top left",
  };
  const last: Keyframe = { transform: "none", transformOrigin: "top left" };
  for (const name of changed) {
    const prop = keyframeProperty(name);
    first[prop] = from.styles[name]!;
    last[prop] = to.styles[name]!;
  }
  return [first, last];
}

export interface AutoAnimateOptions {
  /** Seconds. */
  duration: number;
  easing: string;
  unmatched: boolean;
  /** The stage scale, so screen deltas become stage deltas. */
  scale: number;
  /** The CSS properties to morph (`autoAnimateStyles`). */
  styles?: readonly string[];
  /** Measure from the slide's own corner, as the plan was (`prepareAutoAnimate`'s `inPlace`). */
  inPlace?: boolean;
}

/** A slide and where it sits in reading order: the one further on owns `autoAnimateRestart`. */
export interface PlacedSlide {
  h: number;
  v: number;
  options: Pick<SlideOptions, "autoAnimate" | "autoAnimateId" | "autoAnimateRestart"> | null;
}

/**
 * Do these two slides auto-animate into each other? reveal.js's rule: both ask for it, with the
 * same `autoAnimateId` (none on both counts), and the later of the two — whichever way the deck is
 * going — does not set `autoAnimateRestart`. Kadal also wants them to be neighbours.
 */
export function canAutoAnimate(from: PlacedSlide, to: PlacedSlide, enabled: boolean): boolean {
  if (!enabled || !from.options?.autoAnimate || !to.options?.autoAnimate) return false;
  if ((from.options.autoAnimateId ?? null) !== (to.options.autoAnimateId ?? null)) return false;
  if (Math.abs(from.h - to.h) + Math.abs(from.v - to.v) !== 1) return false;
  const later = to.h > from.h || (to.h === from.h && to.v > from.v) ? to : from;
  return !later.options!.autoAnimateRestart;
}

/** The arriving slide's easing, duration and unmatched fade, over the deck's. */
export function autoAnimateTiming(
  slide: Pick<
    SlideOptions,
    "autoAnimateEasing" | "autoAnimateDuration" | "autoAnimateUnmatched"
  > | null,
  config: Pick<DeckConfig, "autoAnimateEasing" | "autoAnimateDuration" | "autoAnimateUnmatched">,
): Pick<AutoAnimateOptions, "duration" | "easing" | "unmatched"> {
  return {
    duration: slide?.autoAnimateDuration ?? config.autoAnimateDuration,
    easing: slide?.autoAnimateEasing ?? config.autoAnimateEasing,
    unmatched: slide?.autoAnimateUnmatched ?? config.autoAnimateUnmatched,
  };
}

/**
 * What was read off the leaving slide: snapshots by key (the built-in matching), or by the
 * arriving element each one pairs with (an `autoAnimateMatcher`'s pairs).
 */
export type AutoAnimatePlan =
  | { kind: "keys"; snaps: Map<string, Snapshot> }
  | { kind: "pairs"; snaps: Map<Element, Snapshot> };

/**
 * Read the leaving slide before it goes, with the arriving one already in the page, and mark both
 * `data-auto-animate="pending"`. A matcher, when given, pairs their elements; otherwise matching
 * waits for `runAutoAnimate`.
 */
export function prepareAutoAnimate(
  fromSlide: HTMLElement,
  toSlide: HTMLElement | null,
  opts: {
    styles?: readonly string[];
    matcher?: AutoAnimateMatcher | null;
    /**
     * Measure each slide's elements from the slide's own corner. The scroll view's slides sit one
     * under the other on the page, and a morph there happens in place rather than across them.
     */
    inPlace?: boolean;
  },
): AutoAnimatePlan {
  const styles = opts.styles ?? AUTO_ANIMATE_STYLES;
  const origin = opts.inPlace ? fromSlide : null;
  fromSlide.dataset.autoAnimate = "pending";
  if (toSlide) toSlide.dataset.autoAnimate = "pending";
  if (typeof opts.matcher === "function" && toSlide) {
    const snaps = new Map<Element, Snapshot>();
    for (const pair of opts.matcher(fromSlide, toSlide) ?? []) {
      if (pair?.from && pair.to) snaps.set(pair.to, snapOf(pair.from, "", styles, origin));
    }
    return { kind: "pairs", snaps };
  }
  return { kind: "keys", snaps: snapshot(fromSlide, styles, origin) };
}

/** Clear what an earlier auto-animate left on the slides and their elements. */
export function resetAutoAnimate(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>(
    '[data-auto-animate]:not([data-auto-animate=""])',
  ))
    el.dataset.autoAnimate = "";
  for (const el of root.querySelectorAll<HTMLElement>("[data-auto-animate-target]"))
    delete el.dataset.autoAnimateTarget;
}

/** Morph the arriving slide from the plan, and mark it `data-auto-animate="running"`. */
export function runAutoAnimate(
  plan: AutoAnimatePlan,
  toSlide: HTMLElement,
  opts: AutoAnimateOptions,
): Animation[] {
  const styles = opts.styles ?? AUTO_ANIMATE_STYLES;
  const animations: Animation[] = [];
  let target = 0;
  const timing = (el: Element) => {
    const html = el as HTMLElement;
    return {
      delay: Number(html.dataset.autoAnimateDelay ?? 0) * 1000,
      duration: Number(html.dataset.autoAnimateDuration ?? opts.duration) * 1000,
      easing: html.dataset.autoAnimateEasing ?? opts.easing,
      fill: "backwards" as const,
    };
  };
  const morph = (el: Element, from: Snapshot) => {
    (el as HTMLElement).dataset.autoAnimateTarget = String(target++);
    const frames = morphFrames(
      from,
      {
        rect: boxFrom(el, opts.inPlace ? toSlide : null),
        styles: readStyles(getComputedStyle(el), styles),
      },
      opts.scale,
    );
    animations.push(el.animate(frames, timing(el)));
  };
  const fadeIn = (el: Element) => {
    if (!opts.unmatched) return;
    (el as HTMLElement).dataset.autoAnimateTarget = "unmatched";
    animations.push(el.animate([{ opacity: 0 }, { opacity: 1 }], timing(el)));
  };

  if (plan.kind === "pairs") {
    for (const [el, from] of plan.snaps) if (toSlide.contains(el)) morph(el, from);
    // Elements inside a matched one move with it.
    for (const el of candidates(toSlide)) {
      if (plan.snaps.has(el)) continue;
      if ([...plan.snaps.keys()].some((m) => m.contains(el))) continue;
      fadeIn(el);
    }
  } else {
    const counts = new Map<string, number>();
    for (const el of candidates(toSlide)) {
      const from = plan.snaps.get(keyOf(el, counts));
      if (from) morph(el, from);
      else fadeIn(el);
    }
  }
  toSlide.dataset.autoAnimate = "running";
  return animations;
}
