import { useLayoutEffect, useRef } from "react";

/**
 * Reveal: reveal.js's twelve themes (MIT, © Hakim El Hattab and reveal.js contributors) as one
 * Kadal Deck theme. `themeConfig: { variant: moon }` picks one; style.css holds them all.
 *
 * A themeConfig value only reaches CSS as a custom property (`--theme-variant: moon` on the deck
 * root), and a selector cannot test one. So this layer, drawn once on the stage and once per
 * printed page, copies it onto the deck root as `data-reveal-variant`, where every rule of
 * style.css can see it, a slide that forces the other colour scheme included. Without it (a layer
 * hidden by the deck) the slides are black, the default. It draws nothing.
 *
 * It reads the custom property rather than `useDeck()`: the module imports nothing from
 * @kadal/deck, so the copy of it @kadal/deck ships (dist/themes/reveal) loads wherever it sits.
 */

export const VARIANTS = [
  "black",
  "white",
  "league",
  "beige",
  "night",
  "serif",
  "simple",
  "solarized",
  "moon",
  "dracula",
  "sky",
  "blood",
] as const;
export type RevealVariant = (typeof VARIANTS)[number];

/** The variant a themeConfig value names, or black: an unknown name is reveal's default. */
export function variantOf(value: unknown): RevealVariant {
  const v =
    typeof value === "string"
      ? value
          .trim()
          .replace(/^["']|["']$/g, "")
          .toLowerCase()
      : "";
  return (VARIANTS as readonly string[]).includes(v) ? (v as RevealVariant) : "black";
}

/** How many layers hold each root's attribute: the last one to go takes it away. */
const holders = new WeakMap<Element, number>();

function Variant() {
  const probe = useRef<HTMLSpanElement>(null);
  // Held from mount to unmount; before paint, so the first frame wears the variant.
  useLayoutEffect(() => {
    const root = probe.current?.closest(".deck-root");
    if (!root) return;
    holders.set(root, (holders.get(root) ?? 0) + 1);
    return () => {
      const left = (holders.get(root) ?? 1) - 1;
      holders.set(root, left);
      if (!left) root.removeAttribute("data-reveal-variant");
    };
  }, []);
  // Every render: the themeConfig (and so the property) changes when the deck is edited.
  useLayoutEffect(() => {
    const root = probe.current?.closest(".deck-root");
    if (!root) return;
    const variant = variantOf(getComputedStyle(root).getPropertyValue("--theme-variant"));
    if (root.getAttribute("data-reveal-variant") !== variant)
      root.setAttribute("data-reveal-variant", variant);
  });
  return <span ref={probe} hidden />;
}

export default {
  layers: { "global-bottom": Variant },
};
