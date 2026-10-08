/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CLICKS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A click is the unit of animation inside a slide: reveal.js calls the elements fragments, Slidev
 * calls the steps clicks. Elements register with the slide's registry when they render, in
 * document order, and get an absolute step; the slide's total is the largest step anyone asked
 * for. Registration happens during render (not in an effect) so the order is the document order
 * and the total is known before the slide is shown.
 *
 *   at: undefined       relative — one after the previous element's step (the common case)
 *   at: "+2"            relative by more; "+0" shares the previous element's step
 *   at: 3               absolute; 0 means "always shown" and reserves nothing
 *   at: [2, 5]          visible from step 2 through 4, hidden again at 5
 *   hide: true          the element starts visible and hides at its step
 *   span: 3             reserve three consecutive steps (a code block with three highlights)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ClickAt = number | string | [number, number] | undefined;

export interface ClickSpec {
  at?: ClickAt;
  hide?: boolean;
  span?: number;
}

export interface ClickRange {
  /** The step at which the element becomes (or, for `hide`, stops being) visible. */
  start: number;
  /** Exclusive end: the step from which it is hidden again; Infinity for "stays". */
  end: number;
  hide: boolean;
  /** The largest step this element needs: what the slide's total must reach. */
  last: number;
}

export interface ClickRegistry {
  /** Allocate (or re-read) the range for an element with a stable id. */
  allocate(id: string, spec: ClickSpec): ClickRange;
  release(id: string): void;
  /** The largest step anyone needs: the slide's click total. */
  total(): number;
  /** Ask to be told when the total changes. */
  onChange(listener: (total: number) => void): () => void;
}

export function createClickRegistry(base = 0): ClickRegistry {
  const ranges = new Map<string, ClickRange>();
  const active = new Set<string>();
  const listeners = new Set<(total: number) => void>();
  let cursor = base;
  let lastTotal = -1;

  const total = () => {
    let max = base;
    for (const [id, r] of ranges) if (active.has(id)) max = Math.max(max, r.last);
    return max;
  };

  const notify = () => {
    const t = total();
    if (t === lastTotal) return;
    lastTotal = t;
    for (const l of listeners) l(t);
  };

  return {
    allocate(id, spec) {
      const existing = ranges.get(id);
      if (existing) {
        // Re-activated after a release (React's StrictMode mounts twice): same step as before.
        if (!active.has(id)) {
          active.add(id);
          queueMicrotask(notify);
        }
        return existing;
      }
      let start: number;
      let end = Number.POSITIVE_INFINITY;
      const at = spec.at;
      if (Array.isArray(at)) {
        start = at[0];
        end = at[1];
      } else if (typeof at === "number") start = at;
      else if (typeof at === "string" && /^[+-]\d+$/.test(at)) start = cursor + Number(at);
      else if (typeof at === "string" && /^\d+$/.test(at)) start = Number(at);
      else start = cursor + 1;
      const span = Math.max(1, spec.span ?? 1);
      const last = Number.isFinite(end) ? end : start + span - 1;
      const range: ClickRange = { start, end, hide: !!spec.hide, last };
      ranges.set(id, range);
      active.add(id);
      cursor = Math.max(cursor, last);
      queueMicrotask(notify);
      return range;
    },
    release(id) {
      // The range is kept so a remount lands on the same step; only its weight is dropped.
      if (active.delete(id)) queueMicrotask(notify);
    },
    total,
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Is an element with this range shown at the current click? */
export function isShown(range: ClickRange, click: number): boolean {
  if (range.hide) return click < range.start;
  return click >= range.start && click < range.end;
}

/** Is this the element's own step (the one just reached), for `current-fragment` styling? */
export function isCurrent(range: ClickRange, click: number): boolean {
  return click === range.start;
}
