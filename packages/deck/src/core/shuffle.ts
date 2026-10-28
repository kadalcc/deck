import type { Column } from "./model.ts";

/**
 * reveal.js's `shuffle: true` (https://revealjs.com/config/): the columns in a random order, and
 * the slides of each vertical stack too, once per load. An order is the manifest indices of the
 * slides, column by column, so another window of the deck can be handed the same one.
 */
export type SlideOrder = number[][];

/** A fresh random order of these columns. */
export function shuffledOrder(
  columns: readonly Column[],
  random: () => number = Math.random,
): SlideOrder {
  const mix = <T>(list: T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };
  return mix(columns.map((c) => mix(c.slides.map((s) => s.index))));
}

/** The order these columns are in now. */
export function orderOf(columns: readonly Column[]): SlideOrder {
  return columns.map((c) => c.slides.map((s) => s.index));
}

/**
 * The columns in `order`. An order that does not name exactly these slides (another build of the
 * deck, or a message that is not one) leaves them as they are.
 */
export function applyOrder(columns: Column[], order: unknown): Column[] {
  if (!isOrder(order)) return columns;
  const byIndex = new Map(columns.flatMap((c) => c.slides.map((s) => [s.index, s] as const)));
  const named = order.flat();
  if (named.length !== byIndex.size || new Set(named).size !== named.length) return columns;
  if (!named.every((i) => byIndex.has(i))) return columns;
  return order.map((list, h) => ({ h, slides: list.map((i) => byIndex.get(i)!) }));
}

function isOrder(value: unknown): value is SlideOrder {
  return (
    Array.isArray(value) &&
    value.every(
      (c) => Array.isArray(c) && c.length > 0 && c.every((i) => Number.isInteger(i) && i >= 0),
    )
  );
}
