import { type LayerProps, type LayoutProps, useDeck } from "@kadal/deck";

/** A layout of the theme's own: a band in the accent colour over the content. */
function Banner({ children }: LayoutProps) {
  return (
    <div className="deck-layout deck-layout-banner">
      <div className="deck-layout-banner-band" />
      {children}
    </div>
  );
}

function FixtureBadge({ children }: { children?: React.ReactNode }) {
  return <span className="fixture-badge">{children}</span>;
}

/** The footer: the themeConfig's text and "page / total", not on the cover. */
function Footer({ page, total, layout }: LayerProps) {
  const deck = useDeck();
  if (layout === "cover") return null;
  const text = deck.config.themeConfig.footerText;
  return (
    <footer className="fixture-footer" data-fixture-footer>
      <span>{typeof text === "string" ? text : "Fixture footer"}</span>
      <span>
        {page} / {total}
      </span>
    </footer>
  );
}

export default {
  layouts: { banner: Banner },
  components: { FixtureBadge },
  layers: { "global-bottom": Footer },
};
