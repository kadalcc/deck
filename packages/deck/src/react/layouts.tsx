import type { ComponentType, ReactNode } from "react";

import { useDeck } from "./context.ts";
import { FrameShell } from "./Frame.tsx";

import type { Frontmatter } from "../compiler/split.ts";
import type { SlideOptions } from "../core/model.ts";

/**
 * Layouts, the Slidev set, as React components a slide's frontmatter picks by name:
 *
 *   default · center · cover · intro · section · end · fact · quote · statement · full · none ·
 *   two-cols · image · image-left · image-right · iframe · iframe-left · iframe-right
 *
 * Every layout wraps the slide's MDX in `.deck-layout` with a modifier class the theme styles;
 * the image/iframe ones read `image` / `url` / `backgroundSize` from the frontmatter. A deck adds
 * its own by passing `components={{ "layout:name": Component }}` to `<Deck>`.
 */
export interface LayoutProps {
  frontmatter: Frontmatter;
  options: SlideOptions;
  children: ReactNode;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

const simple = (name: string) =>
  function Layout({ children }: LayoutProps) {
    return <div className={`deck-layout deck-layout-${name}`}>{children}</div>;
  };

function TwoCols({ children }: LayoutProps) {
  return <div className="deck-layout deck-layout-two-cols">{children}</div>;
}

function makeImage(side: "left" | "right" | "full") {
  return function ImageLayout({ frontmatter, children }: LayoutProps) {
    const image = str(frontmatter.image) ?? "";
    const size = str(frontmatter.backgroundSize) ?? "cover";
    const figure = (
      <div
        className="deck-layout-image-pane"
        style={{ backgroundImage: `url(${image})`, backgroundSize: size }}
      />
    );
    if (side === "full") {
      return (
        <div className="deck-layout deck-layout-image">
          {figure}
          <div className="deck-layout-image-content">{children}</div>
        </div>
      );
    }
    return (
      <div className={`deck-layout deck-layout-image-${side}`}>
        {side === "left" ? figure : null}
        <div className="deck-layout-image-content">{children}</div>
        {side === "right" ? figure : null}
      </div>
    );
  };
}

function makeIframe(side: "left" | "right" | "full") {
  return function IframeLayout({ frontmatter, children }: LayoutProps) {
    const deck = useDeck();
    const poster = str(frontmatter.poster) ?? undefined;
    // The pane's size names the captured poster: the whole stage, or half of it.
    const posterSize: readonly [number, number] =
      side === "full"
        ? [deck.config.width, deck.config.height]
        : [Math.round(deck.config.width / 2), deck.config.height];
    const url = str(frontmatter.url) ?? "about:blank";
    // Lazy: the frame loads when its slide is shown and unloads when it is left (SlideFrame's
    // data-src handling), so a heavy page never runs behind other slides.
    const frame = (
      <FrameShell
        url={url}
        className="deck-layout-iframe-pane"
        poster={poster}
        posterSize={posterSize}
      />
    );
    if (side === "full") return <div className="deck-layout deck-layout-iframe">{frame}</div>;
    return (
      <div className={`deck-layout deck-layout-iframe-${side}`}>
        {side === "left" ? frame : null}
        <div className="deck-layout-iframe-content">{children}</div>
        {side === "right" ? frame : null}
      </div>
    );
  };
}

export const LAYOUTS: Record<string, ComponentType<LayoutProps>> = {
  default: simple("default"),
  center: simple("center"),
  cover: simple("cover"),
  intro: simple("intro"),
  section: simple("section"),
  end: simple("end"),
  fact: simple("fact"),
  quote: simple("quote"),
  statement: simple("statement"),
  full: simple("full"),
  none: ({ children }) => <>{children}</>,
  "two-cols": TwoCols,
  image: makeImage("full"),
  "image-left": makeImage("left"),
  "image-right": makeImage("right"),
  iframe: makeIframe("full"),
  "iframe-left": makeIframe("left"),
  "iframe-right": makeIframe("right"),
};

export function layoutFor(
  name: string,
  components: Record<string, ComponentType<Record<string, unknown>>>,
): ComponentType<LayoutProps> {
  const custom = components[`layout:`] as unknown as ComponentType<LayoutProps> | undefined;
  return custom ?? LAYOUTS[name] ?? LAYOUTS.default!;
}
