import type { CSSProperties } from "react";

import type { LayoutProps } from "@kadal/deck";

/**
 * Crisp: the Slidev theme @slidev/theme-apple-basic (MIT, © 2021 Slidev.js Team) for Kadal Deck.
 *
 * Its layouts, with the same names and frontmatter as Slidev's:
 *
 *   intro-image         `image:` fills the slide, the words white on it
 *   intro-image-right   a title block centred on the left, `image:` inside a margin on the right
 *   image-right         the same with the words from the top (replaces the engine's image-right)
 *   3-images            `imageLeft:`, `imageTopRight:`, `imageBottomRight:` in a margin
 *   bullets             a list with no title, hung below the top
 *
 * The theme's intro, section, statement, fact and quote are the engine's layouts of those names,
 * restyled in style.css (Slidev's are the same centred box). Pictures follow Slidev's
 * handleBackground: a colour (`#…`, `rgb…`, `hsl…`) paints the box, anything else is a picture.
 */

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Slidev's handleBackground, without the dim: a colour, or a picture set to cover. */
function picture(value: unknown): CSSProperties {
  const v = str(value);
  if (!v) return {};
  if (/^(#|rgb|hsl)/.test(v)) return { background: v };
  return { backgroundImage: `url("${v}")` };
}

function IntroImage({ frontmatter, children }: LayoutProps) {
  return (
    <div className="deck-layout deck-layout-intro-image" style={picture(frontmatter.image)}>
      {children}
    </div>
  );
}

function makeImageRight(name: "image-right" | "intro-image-right") {
  return function ImageRight({ frontmatter, children }: LayoutProps) {
    return (
      <div className={`deck-layout deck-layout-${name}`}>
        <div className="crisp-image-content">{children}</div>
        <div className="crisp-picture" style={picture(frontmatter.image)} role="presentation" />
      </div>
    );
  };
}

function ThreeImages({ frontmatter, children }: LayoutProps) {
  return (
    <div className="deck-layout deck-layout-3-images">
      <div className="crisp-picture crisp-3-left" style={picture(frontmatter.imageLeft)} />
      <div className="crisp-3-right">
        <div className="crisp-picture crisp-3-top" style={picture(frontmatter.imageTopRight)} />
        <div
          className="crisp-picture crisp-3-bottom"
          style={picture(frontmatter.imageBottomRight)}
        />
      </div>
      <div className="crisp-3-content">{children}</div>
    </div>
  );
}

function Bullets({ children }: LayoutProps) {
  return <div className="deck-layout deck-layout-bullets">{children}</div>;
}

export default {
  layouts: {
    "intro-image": IntroImage,
    "intro-image-right": makeImageRight("intro-image-right"),
    "image-right": makeImageRight("image-right"),
    "3-images": ThreeImages,
    bullets: Bullets,
  },
};
