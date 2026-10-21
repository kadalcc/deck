import type { LayoutProps } from "@kadal/deck";

/**
 * Shibainu: Slidev's shibainu theme (@slidev/theme-shibainu, MIT, © 2021 Slidev.js Team) for Kadal Deck.
 *
 * Its fourteen layouts keep Slidev's names. Each is a different arrangement of blobs behind the
 * slide (assets/page-*.svg, painted by style.css on `.deck-slide.layout-<name>`):
 *
 *   cover · default · center · section · quote      the engine's layouts, restyled
 *   default-2 … default-7 · right                     a box of words placed differently on each
 *   section-2 · section-3                             two more section pages
 *
 * The box layouts are the ones that need markup of their own: Slidev wraps the slot in a div
 * whose padding (in % of the slide) moves the words clear of the blobs, and so do these.
 */

function boxed(name: string) {
  function Layout({ children }: LayoutProps) {
    return (
      <div className={`deck-layout deck-layout-${name}`}>
        <div className="shibainu-box">{children}</div>
      </div>
    );
  }
  Layout.displayName = `Shibainu(${name})`;
  return Layout;
}

function centred(name: string) {
  function Layout({ children }: LayoutProps) {
    return <div className={`deck-layout deck-layout-${name}`}>{children}</div>;
  }
  Layout.displayName = `Shibainu(${name})`;
  return Layout;
}

export default {
  layouts: {
    "default-2": boxed("default-2"),
    "default-3": boxed("default-3"),
    "default-4": boxed("default-4"),
    "default-5": boxed("default-5"),
    "default-6": boxed("default-6"),
    "default-7": boxed("default-7"),
    right: boxed("right"),
    "section-2": centred("section-2"),
    "section-3": centred("section-3"),
  },
};
