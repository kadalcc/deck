/**
 * reveal.js's auto-slide, the parts that are rules rather than timers
 * (https://revealjs.com/auto-slide/). The timer itself is react/Deck.tsx's.
 */

/** The deck's moves `autoSlideMethod` can name, as DeckActions spells them. */
export type AutoSlideMove =
  | "next"
  | "prev"
  | "nextSlide"
  | "prevSlide"
  | "right"
  | "left"
  | "down"
  | "up"
  | "first"
  | "last";

const MOVES: readonly AutoSlideMove[] = [
  "next",
  "prev",
  "nextSlide",
  "prevSlide",
  "right",
  "left",
  "down",
  "up",
  "first",
  "last",
];

/** reveal's API names for the same moves (`autoSlideMethod: Reveal.navigateRight`, by name). */
const REVEAL_NAMES: Record<string, AutoSlideMove> = {
  navigateNext: "next",
  navigatePrev: "prev",
  navigateRight: "right",
  navigateLeft: "left",
  navigateDown: "down",
  navigateUp: "up",
};

/**
 * What `autoSlideMethod` asks for: one of the deck's moves (Kadal's name or reveal's, with or
 * without `Reveal.`), or else a command id (`nav.next`, a command of the deck's own). Empty is
 * "next", the default.
 */
export function autoSlideMethod(
  name: string | null | undefined,
): { move: AutoSlideMove } | { command: string } {
  const raw = (name ?? "").trim().replace(/^Reveal\./, "");
  if (!raw) return { move: "next" };
  if ((MOVES as readonly string[]).includes(raw)) return { move: raw as AutoSlideMove };
  if (REVEAL_NAMES[raw]) return { move: REVEAL_NAMES[raw]! };
  return { command: raw };
}

/**
 * A step's own `data-autoslide` (reveal's per-fragment interval), read as milliseconds; null when
 * it has none or it is not a number. It wins over the slide's own, as in reveal.
 */
export function stepAutoSlide(attr: string | null | undefined): number | null {
  if (attr === null || attr === undefined || attr.trim() === "") return null;
  const ms = Number(attr);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** The selector for the step on show that carries its own interval (area C's `<Click autoSlide>`). */
export function stepAutoSlideSelector(click: number): string {
  return `.is-present [data-click-at="${click}"][data-autoslide]`;
}
