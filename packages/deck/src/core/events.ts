/**
 * What the deck tells the page around it, as reveal.js does (https://revealjs.com/events/).
 */

/**
 * A slide's `state` (reveal's `data-state`) as class names: each entry may hold several, split on
 * spaces as reveal splits them, in order, once each.
 */
export function stateNames(state: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const entry of state ?? [])
    for (const name of String(entry).split(/\s+/)) if (name && !out.includes(name)) out.push(name);
  return out;
}

/** The classes a state puts on the deck root: reveal's bare name, and Kadal's `state-<name>`. */
export function stateClasses(names: readonly string[]): string[] {
  return names.flatMap((n) => [n, `state-${n}`]);
}

/** Which states a move turned on and off. */
export function stateChange(
  before: readonly string[],
  after: readonly string[],
): { entered: string[]; left: string[] } {
  return {
    entered: after.filter((n) => !before.includes(n)),
    left: before.filter((n) => !after.includes(n)),
  };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * deck.events: reveal.js's `Reveal.on` / `Reveal.off`, for scripts that are not React
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   ready              the deck is up                    { indexh, indexv, indexf, currentSlide }
 *   slidechanged       another slide is on show          { indexh, indexv, indexf, previousSlide, currentSlide }
 *   slidetransitionend its transition has finished       { indexh, indexv, currentSlide }
 *   fragmentshown      a click step came in              { indexf, fragment, fragments }
 *   fragmenthidden     a click step went back            { indexf, fragment, fragments }
 *   overviewshown / overviewhidden, paused / resumed, autoslidepaused / autoslideresumed
 *   resize             the stage's scale changed         { scale, oldScale, size }
 *   <state name>       a slide's `state` came on         (and `deck:state` on the root)
 *
 * Every event also goes out as a `deck:<name>` CustomEvent on the deck's root element (detail: the
 * same fields), and, with `postMessageEvents`, to a page that frames the deck (react/host-messages.ts).
 * `on("*", fn)` hears them all.
 */
export interface DeckEvent {
  type: string;
  [field: string]: unknown;
}

export type DeckEventListener = (event: DeckEvent) => void;

export interface DeckEvents {
  /** Listen; returns the way to stop. `"*"` hears every event. */
  on(type: string, listener: DeckEventListener): () => void;
  off(type: string, listener: DeckEventListener): void;
  /** Tell every listener. The runtime's own; a plugin may announce events of its own with it. */
  emit(type: string, data?: Record<string, unknown>): void;
}

/** An event bus; `alsoTo` hears every event after the listeners (the DOM, the framing page). */
export function createDeckEvents(alsoTo?: (event: DeckEvent) => void): DeckEvents {
  const listeners = new Map<string, Set<DeckEventListener>>();
  const off = (type: string, listener: DeckEventListener) => {
    listeners.get(type)?.delete(listener);
  };
  return {
    on(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
      return () => off(type, listener);
    },
    off,
    emit(type, data = {}) {
      const event: DeckEvent = { ...data, type };
      for (const key of [type, "*"])
        for (const l of [...(listeners.get(key) ?? [])]) {
          try {
            l(event);
          } catch (error) {
            // One listener's mistake must not keep the event from the rest, or stop the deck.
            console.error(`deck.events "${type}" listener:`, error);
          }
        }
      alsoTo?.(event);
    },
  };
}

/** The parts of the navigation state the events are made from. */
export interface NavFacts {
  h: number;
  v: number;
  click: number;
  overview: boolean;
  paused: boolean;
  autoSliding: boolean;
}

/** The events one move of the navigation state makes, in reveal's order, with their indices. */
export function navEvents(prev: NavFacts, next: NavFacts): DeckEvent[] {
  const out: DeckEvent[] = [];
  const at = { indexh: next.h, indexv: next.v, indexf: next.click };
  if (prev.h !== next.h || prev.v !== next.v)
    out.push({ type: "slidechanged", ...at, previous: { indexh: prev.h, indexv: prev.v } });
  else if (next.click > prev.click)
    out.push({ type: "fragmentshown", ...at, steps: range(prev.click + 1, next.click) });
  else if (next.click < prev.click)
    out.push({ type: "fragmenthidden", ...at, steps: range(next.click + 1, prev.click) });
  if (prev.overview !== next.overview)
    out.push({ type: next.overview ? "overviewshown" : "overviewhidden", ...at });
  if (prev.paused !== next.paused) out.push({ type: next.paused ? "paused" : "resumed", ...at });
  if (prev.autoSliding !== next.autoSliding)
    out.push({ type: next.autoSliding ? "autoslideresumed" : "autoslidepaused", ...at });
  return out;
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}
