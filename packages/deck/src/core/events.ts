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
