import type { ComponentType, ReactNode } from "react";

import * as builtins from "../components/index.ts";
import { useDeck } from "./context.ts";

/**
 * The components every slide sees without importing anything: the engine's own (`Click`, `Code`,
 * `Cols`, `Poll`…), the deck's custom ones (passed to `<Deck components>`), and the Markdown
 * element mappings — `pre` becomes the stepping code block, `img` the lightbox-aware image, `a`
 * the slide-aware link. MDX's `providerImportSource` resolves to `useMDXComponents` below.
 */
let current: Record<string, ComponentType<Record<string, unknown>>> = {};

export function useMDXComponents(): Record<string, ComponentType<Record<string, unknown>>> {
  return current;
}

export function MDXProvider({ children }: { children: ReactNode }) {
  const deck = useDeck();
  const custom = deck.components;
  // Cheap identity: rebuild only when the custom map changes.
  if (cachedFor !== custom) {
    cachedFor = custom;
    current = {
      ...(builtins as unknown as Record<string, ComponentType<Record<string, unknown>>>),
      pre: builtins.Code as unknown as ComponentType<Record<string, unknown>>,
      img: builtins.Image as unknown as ComponentType<Record<string, unknown>>,
      a: builtins.Anchor as unknown as ComponentType<Record<string, unknown>>,
      ...Object.fromEntries(Object.entries(custom).filter(([k]) => !k.startsWith("layout:"))),
    };
  }
  return <>{children}</>;
}
let cachedFor: unknown = null;
