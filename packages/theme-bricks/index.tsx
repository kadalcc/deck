import type { CSSProperties } from "react";

import type { LayoutProps } from "@kadal/deck";

import { POLYGONS } from "./polygons.tsx";

/**
 * Bricks: Slidev's bricks theme (@slidev/theme-bricks, MIT, © 2021 Slidev.js Team) for Kadal Deck.
 *
 * Its layouts, with Slidev's names, slots and frontmatter:
 *
 *   cover · intro · default · section · items · quote · fact · statement · blank
 *
 * Each draws its own arrangement of coloured blocks behind the slide (assets/page-*.svg, painted
 * by style.css on `.deck-slide.layout-<name>` so they reach the slide's edges). cover, intro,
 * default, section, quote, fact and statement are the engine's layouts of those names, placed by
 * style.css: `intro` takes a `::left::` slot beside the title, `section` a `::right::` one. The
 * two Slidev adds are here: `items`, a title over an `::items::` slot laid out in `cols:` columns
 * (4 by default), and `blank`, the bare page.
 *
 * The components are the blocks themselves, <Polygon1 /> to <Polygon11 /> (polygons.tsx).
 */

function Items({ frontmatter, children }: LayoutProps) {
  const cols = Number(frontmatter.cols);
  const style = { "--bricks-cols": Number.isFinite(cols) && cols >= 1 ? Math.floor(cols) : 4 };
  return (
    <div className="deck-layout deck-layout-items" style={style as CSSProperties}>
      {children}
    </div>
  );
}

function Blank({ children }: LayoutProps) {
  return <div className="deck-layout deck-layout-blank">{children}</div>;
}

export * from "./polygons.tsx";

export default {
  layouts: { items: Items, blank: Blank },
  components: POLYGONS,
};
