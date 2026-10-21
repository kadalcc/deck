import type { ReactNode } from "react";

import { type LayoutProps, useDeck, useSlideOptional } from "@kadal/deck";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Folio's module: the layouts an essay or a keynote reaches for, and two pieces of furniture.
 *
 *   layout: pull-quote   the line that carries the piece, between an accent rule and a hairline;
 *                        `by:` sets the attribution
 *   layout: essay        one column at reading measure with a drop cap; `::aside::` is a note
 *                        in the margin
 *   layout: chapter      a chapter opener: "Chapter" and its roman numeral (counted, or `n:`),
 *                        the title, and an epigraph if the slide has a blockquote
 *   <Byline>             author, date and place between two hairlines, in small capitals
 *   <Lede>               the opening paragraph, larger, with a drop cap
 * ─────────────────────────────────────────────────────────────────────────────
 */

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function PullQuote({ children, frontmatter }: LayoutProps) {
  const by = str(frontmatter.by);
  return (
    <div className="deck-layout deck-layout-pull-quote">
      <figure className="folio-pull">
        {children}
        {by ? <figcaption className="folio-pull-by">{by}</figcaption> : null}
      </figure>
    </div>
  );
}

function Essay({ children }: LayoutProps) {
  return <div className="deck-layout deck-layout-essay">{children}</div>;
}

const ROMAN: Array<[number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];
function roman(n: number): string {
  let out = "";
  let left = Math.max(1, Math.floor(n));
  for (const [v, s] of ROMAN)
    while (left >= v) {
      out += s;
      left -= v;
    }
  return out;
}

function Chapter({ children, frontmatter }: LayoutProps) {
  const deck = useDeck();
  const index = useSlideOptional()?.meta.index ?? 0;
  const counted = deck.manifest.slides.filter(
    (s) => s.index <= index && s.frontmatter.layout === "chapter",
  ).length;
  const given = frontmatter.n == null ? "" : String(frontmatter.n).trim();
  const numeral = given ? (/^\d+$/.test(given) ? roman(Number(given)) : given) : roman(counted);
  return (
    <div className="deck-layout deck-layout-chapter">
      <div className="folio-chapter-number">
        {str(frontmatter.label) ?? "Chapter"}
        <b>{numeral}</b>
      </div>
      {children}
    </div>
  );
}

function Byline({
  author,
  date,
  place,
  children,
}: {
  author?: string;
  date?: string;
  place?: string;
  children?: ReactNode;
}) {
  return (
    <div className="folio-byline">
      {author ? (
        <span>
          By <b>{author}</b>
        </span>
      ) : null}
      {date ? <span>{date}</span> : null}
      {place ? <span>{place}</span> : null}
      {children}
    </div>
  );
}

function Lede({ children }: { children?: ReactNode }) {
  return <div className="folio-lede">{children}</div>;
}

export default {
  layouts: { "pull-quote": PullQuote, essay: Essay, chapter: Chapter },
  components: { Byline, Lede },
};
