import type { Flags } from "./hash.ts";
import type { DeckConfig } from "./model.ts";

/**
 * A deck inside part of someone else's page (reveal.js's `embedded`,
 * https://revealjs.com/presentation-size/): `embedded: true`, or `?embedded` on the address.
 *
 * Embedded, a deck sizes itself from its own element rather than the window, takes keys only
 * while it has focus (unless `keyboardCondition` says otherwise), leaves the page's hash, head and
 * colour scheme alone (unless `hash` is set outright), and goes fullscreen as itself, not the page.
 * Several embedded decks on one page each keep to their own element.
 */
export function isEmbedded(config: Pick<DeckConfig, "embedded">, flags: Pick<Flags, "embedded">) {
  return config.embedded || flags.embedded;
}

export type KeyboardCondition = DeckConfig["keyboardCondition"];

/** The condition keys meet: the deck's own, else "focused" for an embedded deck (reveal's advice). */
export function keyboardConditionOf(
  config: Pick<DeckConfig, "keyboardCondition">,
  embedded: boolean,
): KeyboardCondition {
  return config.keyboardCondition ?? (embedded ? "focused" : null);
}

/**
 * Whether a key reaches the deck: a function decides for itself (true lets it through, as reveal's
 * does), "focused" lets it through while the deck has focus, null always.
 */
export function keyAllowed(
  condition: KeyboardCondition,
  event: KeyboardEvent,
  focused: boolean,
): boolean {
  if (typeof condition === "function") {
    try {
      return condition(event) !== false;
    } catch {
      return false;
    }
  }
  if (condition === "focused") return focused;
  return true;
}

/**
 * Whether the deck reads and writes the address's hash. An embedded deck shares the address with
 * its page (and perhaps other decks), so it keeps out of it unless the deck set `hash` itself.
 */
export function usesHash(
  config: Pick<DeckConfig, "hash">,
  embedded: boolean,
  hashSetExplicitly: boolean,
): boolean {
  if (!config.hash) return false;
  return !embedded || hashSetExplicitly;
}
