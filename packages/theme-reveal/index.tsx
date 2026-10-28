import { useDeck } from "@kadal/deck";
import { useLayoutEffect, useRef } from "react";

/**
 * Reveal: reveal.js's twelve themes (MIT, © Hakim El Hattab and reveal.js contributors) as one
 * Kadal Deck theme. `themeConfig: { variant: moon }` picks one; style.css holds them all.
 *
 * A themeConfig value only reaches CSS as a custom property (`--theme-variant: moon`), and a
 * selector cannot test one. So this layer, drawn once on the stage and once per printed page,
 * writes the variant on the deck root as `data-reveal-variant`, where every rule of style.css
 * can see it, a slide that forces the other colour scheme included. Without it (a layer hidden by
 * the deck) the slides are black, the default. It draws nothing.
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

/** The variant themeConfig names, or black: an unknown name is reveal's default, not nothing. */
export function variantOf(themeConfig: Record<string, unknown> | null | undefined): RevealVariant {
  const v =
    typeof themeConfig?.variant === "string" ? themeConfig.variant.trim().toLowerCase() : "";
  return (VARIANTS as readonly string[]).includes(v) ? (v as RevealVariant) : "black";
}

/** How many layers hold each root's attribute: the last one to go takes it away. */
const holders = new WeakMap<Element, number>();

function Variant() {
  const deck = useDeck();
  const variant = variantOf(deck.config.themeConfig);
  const probe = useRef<HTMLSpanElement>(null);
  // Before paint, so the first frame is already in the variant's colours.
  useLayoutEffect(() => {
    const root = probe.current?.closest(".deck-root");
    if (!root) return;
    holders.set(root, (holders.get(root) ?? 0) + 1);
    root.setAttribute("data-reveal-variant", variant);
    return () => {
      const left = (holders.get(root) ?? 1) - 1;
      holders.set(root, left);
      if (!left) root.removeAttribute("data-reveal-variant");
    };
  }, [variant]);
  return <span ref={probe} hidden />;
}

export default {
  layers: { "global-bottom": Variant },
};
