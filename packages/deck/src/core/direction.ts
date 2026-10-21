import type { Direction } from "./navigation.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHICH WAY THE DECK IS GOING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The navigation store records a move's direction in four ways (forward, back, up, down) for the
 * transitions. Styles want only two: is the talk moving on, or going back over something? A step
 * to the next click, the next column or the slide beneath is forward; the previous click, column
 * or the slide above is backward. A move that goes nowhere (a jump to where the deck already is)
 * leaves the last answer standing, so a style keyed on it does not flicker.
 *
 * The runtime writes it as `data-nav-direction="forward|backward"` on the deck root and on the
 * stage, and `--deck-nav-sign: 1 | -1` beside it. Slidev's `forward:` / `backward:` variants are
 * the same idea: see `@custom-variant forward` in the starter's styles.css, and the plain
 * `deck-instant-back`, `deck-delay-forward` classes in themes/presenting.css.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type NavDirection = "forward" | "backward";

export function navDirection(
  direction: Direction,
  previous: NavDirection = "forward",
): NavDirection {
  if (direction === "forward" || direction === "down") return "forward";
  if (direction === "back" || direction === "up") return "backward";
  return previous;
}
