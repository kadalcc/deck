import type { CSSProperties } from "react";

import { type LayerProps, type LayoutProps, useDeck } from "@kadal/deck";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Swiss's module: a running header, three grid layouts and a rule.
 *
 *   the header       a slide-top layer on content slides: the deck's title, the current
 *                    section (the last `layout: section` slide's heading) and the page, under a
 *                    heavy rule. `themeConfig.header: false` turns it off; `header: false` in a
 *                    slide's frontmatter hides it there.
 *   layout: poster   one word or number as large as the slide allows (`size: 15em`,
 *                    `signal: true` for the signal colour); `::meta::` is small print top right
 *   layout: index    the slide's list as a grid of numbered cells (`columns: 3`)
 *   layout: grid     a header across, then each `::slot::` a column under a heavy rule
 *                    (`columns:` defaults to the number of slots)
 *   <Rule>           a heavy rule with a label on the left and one on the right
 * ─────────────────────────────────────────────────────────────────────────────
 */

const HEADER_LAYOUTS = new Set([
  "default",
  "center",
  "two-cols",
  "two-cols-header",
  "index",
  "grid",
]);

function Header({ slide, page, total, layout, frontmatter }: LayerProps) {
  const deck = useDeck();
  if (deck.config.themeConfig.header === false || frontmatter.header === false) return null;
  if (!HEADER_LAYOUTS.has(layout)) return null;
  const index = slide?.index ?? 0;
  const section = [...deck.manifest.slides]
    .reverse()
    .find((s) => s.index <= index && s.frontmatter.layout === "section");
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="swiss-header" aria-hidden="true">
      <span className="swiss-header-title">{deck.config.title}</span>
      <span className="swiss-header-section">{section?.title ?? ""}</span>
      <span className="swiss-header-page">
        <b>{pad(page)}</b> / {pad(total)}
      </span>
    </div>
  );
}

const num = (v: unknown) =>
  typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : null;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function Poster({ children, frontmatter }: LayoutProps) {
  const size =
    str(frontmatter.size) ?? (num(frontmatter.size) ? `${num(frontmatter.size)}em` : null);
  return (
    <div
      className={`deck-layout deck-layout-poster${frontmatter.signal ? " is-signal" : ""}`}
      style={size ? ({ "--swiss-poster-size": size } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

function Index({ children, frontmatter }: LayoutProps) {
  const cols = num(frontmatter.columns);
  return (
    <div
      className="deck-layout deck-layout-index"
      style={cols ? ({ "--swiss-index-cols": cols } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

function Grid({ children, frontmatter }: LayoutProps) {
  // Without `columns:`, style.css counts the slots (two to five) with :has().
  const cols = num(frontmatter.columns);
  return (
    <div
      className="deck-layout deck-layout-grid"
      style={cols ? ({ "--swiss-grid-cols": cols } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

function Rule({
  label,
  right,
  signal = false,
}: {
  label?: string;
  right?: string;
  signal?: boolean;
}) {
  return (
    <div className={`swiss-rule${signal ? " is-signal" : ""}`} role="separator">
      {label ? <span>{label}</span> : null}
      {right ? <span>{right}</span> : null}
    </div>
  );
}

export default {
  layouts: { poster: Poster, index: Index, grid: Grid },
  components: { Rule },
  layers: { "slide-top": Header },
};
