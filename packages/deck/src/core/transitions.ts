/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CUSTOM TRANSITIONS: the contract
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A slide transition is two CSS animations: the arriving slide's (`--deck-anim-in`) and the
 * leaving slide's (`--deck-anim-out`), run for `--deck-transition` (0.6 s; 0.3 s / 1 s with
 * `transitionSpeed`). The stage says what is happening on its own element:
 *
 *   .deck-stage[data-transition="<way in>"][data-transition-out="<way out>"][data-direction="…"]
 *       data-direction: forward · back · up · down · none (a jump)
 *   .deck-slide.is-present      the arriving slide        .deck-slide.is-leaving   the one leaving
 *
 * A theme or a deck adds `transition: flip` in either of two ways.
 *
 *   1. Name keyframes (headmatter, a theme's `kadal.theme.config`, or `registerTransition`):
 *
 *        transitions:
 *          flip:
 *            in: flip-in            keyframes for the arriving slide
 *            out: flip-out          …and for the leaving one
 *            back: { in: flip-in-back, out: flip-out-back }    going back (optional; up/down too)
 *
 *      and define the keyframes anywhere: the theme's CSS, or a `<style global>` in a slide.
 *
 *   2. Pure CSS, on the hooks above:
 *
 *        .deck-stage[data-transition="flip"] { --deck-anim-in: flip-in; }
 *        .deck-stage[data-transition-out="flip"] { --deck-anim-out: flip-out; }
 *        .deck-stage[data-transition="flip"][data-direction="back"] { --deck-anim-in: flip-in-back; }
 *
 * Either way the split form works (`transition: flip-in fade-out`), speeds apply, reduced motion
 * turns it into a cut, and print never animates. A name nothing defines is a cut too — the stage
 * notices the leaving slide has no animation and drops it at once, with one console warning —
 * rather than two slides drawn over each other for the length of a transition.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Keyframe names for each half of a transition. */
export interface TransitionHalves {
  /** Animation (keyframes name) for the arriving slide. */
  in?: string;
  /** Animation for the leaving slide. */
  out?: string;
}

export interface TransitionDefinition extends TransitionHalves {
  /** Going back (← / previous); defaults to the forward pair. */
  back?: TransitionHalves;
  /** Going down a stack; defaults to the forward pair. */
  down?: TransitionHalves;
  /** Going up a stack; defaults to `back`, then the forward pair. */
  up?: TransitionHalves;
  /** A line for the catalog and tools. */
  summary?: string;
}

export type Direction = "forward" | "back" | "up" | "down" | "none";

/** The engine's own transitions (base.css animates them). */
export const BUILTIN_TRANSITIONS = [
  "none",
  "fade",
  "slide",
  "convex",
  "concave",
  "zoom",
  "view-transition",
] as const;

const registry = new Map<string, TransitionDefinition>();

/**
 * Register a named transition for every deck on the page (a theme's or an addon's JavaScript).
 * A deck's own `transitions:` headmatter wins over it for the same name.
 */
export function registerTransition(name: string, definition: TransitionDefinition): void {
  registry.set(name, definition);
}

/** Every name a transition may use here: built in, registered, or in the deck's `transitions`. */
export function transitionNames(config?: Record<string, unknown> | null): string[] {
  return [...new Set([...BUILTIN_TRANSITIONS, ...registry.keys(), ...Object.keys(config ?? {})])];
}

const isHalves = (v: unknown): v is TransitionHalves =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** The definition for a name: the deck's `transitions` first, then the registry. */
export function transitionDefinition(
  name: string,
  config?: Record<string, unknown> | null,
): TransitionDefinition | null {
  const own = config?.[name];
  if (isHalves(own)) return own as TransitionDefinition;
  return registry.get(name) ?? null;
}

/** Is this a name the engine can animate (or deliberately not, for `none`)? */
export function isKnownTransition(name: string, config?: Record<string, unknown> | null): boolean {
  return (
    (BUILTIN_TRANSITIONS as readonly string[]).includes(name) ||
    !!transitionDefinition(name, config)
  );
}

const safeName = (s: unknown): string | null =>
  typeof s === "string" && /^-?[A-Za-z_][\w-]*$/.test(s.trim()) ? s.trim() : null;

/**
 * The keyframes one half of a named transition uses for a direction, or null when the name has
 * no definition (built-ins and pure-CSS transitions are the stylesheet's business).
 */
export function transitionAnimation(
  name: string,
  half: "in" | "out",
  direction: string,
  config?: Record<string, unknown> | null,
): string | null {
  const def = transitionDefinition(name, config);
  if (!def) return null;
  const pick = (h: TransitionHalves | undefined) => (isHalves(h) ? safeName(h[half]) : null);
  const forward = pick(def);
  if (direction === "back") return pick(def.back) ?? forward;
  if (direction === "down") return pick(def.down) ?? forward;
  if (direction === "up") return pick(def.up) ?? pick(def.back) ?? forward;
  return forward;
}
