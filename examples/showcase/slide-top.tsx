import type { LayerProps } from "@kadal/deck";

/**
 * A slide layer (`slide-top.tsx` beside deck.mdx): drawn over every slide, in play, print and
 * export, with the slide's page and click. This one shows itself only on the slide that is about
 * layers, so the rest of the tour stays clean.
 */
export default function SlideTop({ frontmatter, page, total, click, clicks, view }: LayerProps) {
  if (frontmatter.id !== "slidev-layers") return null;
  return (
    <div className="sc-layer-note" data-view={view}>
      slide-top.tsx · page {page} of {total} · step {click} of {clicks}
    </div>
  );
}
