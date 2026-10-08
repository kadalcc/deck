/**
 * Auto-Animate: reveal.js's idea, implemented with the Web Animations API. Before a slide leaves
 * we snapshot every candidate element; after the next slide mounts we find its matches and
 * animate each from where it was to where it is — position and size through a FLIP transform,
 * plus opacity, colour, background and font size. Unmatched elements fade in.
 *
 * Matching: an explicit `data-id` first; otherwise the same tag with the same text, in order.
 * Per-element tuning: `data-auto-animate-delay`, `-duration`, `-easing`; `data-auto-animate-target`
 * for the reveal.js attribute names.
 */
export interface Snapshot {
  key: string;
  rect: DOMRect;
  opacity: string;
  color: string;
  background: string;
  fontSize: string;
  borderRadius: string;
}

const CANDIDATES =
  "h1, h2, h3, h4, h5, h6, p, li, img, video, iframe, pre, code, blockquote, div, span, svg, table, button, figure, [data-id]";

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

export function snapshot(root: Element): Map<string, Snapshot> {
  const out = new Map<string, Snapshot>();
  const counts = new Map<string, number>();
  for (const el of candidates(root)) {
    const cs = getComputedStyle(el);
    const key = keyOf(el, counts);
    out.set(key, {
      key,
      rect: el.getBoundingClientRect(),
      opacity: cs.opacity,
      color: cs.color,
      background: cs.backgroundColor,
      fontSize: cs.fontSize,
      borderRadius: cs.borderRadius,
    });
  }
  return out;
}

export interface AutoAnimateOptions {
  duration: number;
  easing: string;
  unmatched: boolean;
  /** The stage scale, so screen deltas become stage deltas. */
  scale: number;
}

export function animateFrom(
  prev: Map<string, Snapshot>,
  root: Element,
  opts: AutoAnimateOptions,
): Animation[] {
  const animations: Animation[] = [];
  const counts = new Map<string, number>();
  for (const el of candidates(root)) {
    const key = keyOf(el, counts);
    const from = prev.get(key);
    const html = el as HTMLElement;
    const delay = Number(html.dataset.autoAnimateDelay ?? 0) * 1000;
    const duration = Number(html.dataset.autoAnimateDuration ?? opts.duration) * 1000;
    const easing = html.dataset.autoAnimateEasing ?? opts.easing;
    if (!from) {
      if (opts.unmatched) {
        animations.push(
          el.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration,
            delay,
            easing,
            fill: "backwards",
          }),
        );
      }
      continue;
    }
    const to = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const dx = (from.rect.left - to.left) / opts.scale;
    const dy = (from.rect.top - to.top) / opts.scale;
    const sx = to.width ? from.rect.width / to.width : 1;
    const sy = to.height ? from.rect.height / to.height : 1;
    const fromFrame: Keyframe = {
      transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
      transformOrigin: "top left",
      opacity: from.opacity,
      color: from.color,
      backgroundColor: from.background,
      fontSize: from.fontSize,
      borderRadius: from.borderRadius,
    };
    const toFrame: Keyframe = {
      transform: "none",
      transformOrigin: "top left",
      opacity: cs.opacity,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      fontSize: cs.fontSize,
      borderRadius: cs.borderRadius,
    };
    animations.push(
      el.animate([fromFrame, toFrame], { duration, delay, easing, fill: "backwards" }),
    );
  }
  return animations;
}
