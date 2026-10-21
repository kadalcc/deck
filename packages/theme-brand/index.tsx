import type { ReactNode } from "react";

import { type LayerProps, type LayoutProps, useDeck } from "@kadal/deck";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Brand's module: the logo and the footer on every content slide, three layouts a company deck
 * needs, and two components. Everything company-specific is themeConfig:
 *
 *   primary, secondary      the brand's colours (style.css reads them as --theme-*)
 *   primaryInk              text on the primary colour (default white)
 *   logo, logoDark          image URLs; logoDark is shown on dark slides when given
 *   company                 the name: the wordmark when there is no logo, and the footer's
 *                           default
 *   footer                  the footer line ("Confidential · Q3 review"); `false` hides the footer
 *   logoPosition            top-right (default) · top-left · bottom-right · none
 *
 *   layout: title-logo      the opening slide: the logo large, the title, `presenter:` and
 *                           `date:` underneath, a panel in the brand's colours on the right
 *   layout: agenda          the slide's list as numbered cards in two columns
 *   layout: metrics         a heading and a row of <Metric> figures, centred on the slide
 *   <Metric value label delta>   one figure; a delta starting with "-" or "−" reads as down
 *   <Logo />                the configured logo (or the wordmark), anywhere
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DEFAULTS = {
  logo: "",
  logoDark: "",
  company: "",
  footer: "" as string | boolean,
  logoPosition: "top-right",
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function useBrand() {
  const deck = useDeck();
  return { ...DEFAULTS, ...deck.config.themeConfig } as typeof DEFAULTS & Record<string, unknown>;
}

/** The logo for both schemes (CSS shows the right one), or the company's wordmark. */
function Logo({ className }: { className?: string }) {
  const brand = useBrand();
  const deck = useDeck();
  const light = str(brand.logo);
  const dark = str(brand.logoDark);
  const name = str(brand.company) ?? "";
  const cls = ["brand-logo", dark ? "has-dark" : "", className].filter(Boolean).join(" ");
  if (!light && !dark) {
    const word = name || deck.config.title;
    return word ? (
      <span className={cls}>
        <span className="brand-wordmark">{word}</span>
      </span>
    ) : null;
  }
  return (
    <span className={cls}>
      {light ? <img className="brand-logo-light" src={light} alt={name} /> : null}
      {dark ? <img className="brand-logo-dark" src={dark} alt={name} /> : null}
    </span>
  );
}

/** Slides that are the brand already (or full-bleed), where the marks would be in the way. */
const BARE = new Set(["cover", "title-logo", "end", "full", "image", "iframe", "none"]);

function Mark({ layout, frontmatter }: LayerProps) {
  const brand = useBrand();
  const at = str(brand.logoPosition) ?? "top-right";
  if (at === "none" || BARE.has(layout) || frontmatter.logo === false) return null;
  const side = layout === "image-right" || layout === "iframe-right" ? "top-left" : at;
  return (
    <div className={`brand-mark at-${side}`}>
      <Logo />
    </div>
  );
}

function Footer({ page, total, layout, frontmatter }: LayerProps) {
  const brand = useBrand();
  if (brand.footer === false || frontmatter.footer === false || BARE.has(layout)) return null;
  if (layout.startsWith("image-") || layout.startsWith("iframe-")) return null;
  const text = str(brand.footer) ?? str(brand.company) ?? "";
  return (
    <footer className="brand-footer" aria-hidden="true">
      <span>{text}</span>
      <span className="brand-footer-page">
        {page} / {total}
      </span>
    </footer>
  );
}

function TitleLogo({ children, frontmatter }: LayoutProps) {
  const presenter = str(frontmatter.presenter);
  const date = str(frontmatter.date);
  return (
    <div className="deck-layout deck-layout-title-logo">
      <div className="brand-title-body">
        <Logo />
        {children}
        {presenter || date ? (
          <div className="brand-title-meta">
            {presenter ? (
              <span>
                Presented by<b>{presenter}</b>
              </span>
            ) : null}
            {date ? (
              <span>
                Date<b>{date}</b>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {/* placed, not flowed (deck-absolute): the auto-fit does not count the panel as overflow */}
      <div className="brand-title-panel deck-absolute" aria-hidden="true" />
    </div>
  );
}

function Agenda({ children }: LayoutProps) {
  return <div className="deck-layout deck-layout-agenda">{children}</div>;
}

function Metrics({ children }: LayoutProps) {
  return <div className="deck-layout deck-layout-metrics">{children}</div>;
}

function Metric({
  value,
  label,
  delta,
  children,
}: {
  value: ReactNode;
  label?: ReactNode;
  delta?: string;
  children?: ReactNode;
}) {
  const down = typeof delta === "string" && /^[-−]/.test(delta.trim());
  return (
    <div className="brand-metric">
      <span className="brand-metric-value">{value}</span>
      {label ? <span className="brand-metric-label">{label}</span> : null}
      {delta ? (
        <span className={`brand-metric-delta${down ? " is-down" : ""}`}>
          {down ? "↓ " : "↑ "}
          {delta}
        </span>
      ) : null}
      {children}
    </div>
  );
}

export default {
  layouts: { "title-logo": TitleLogo, agenda: Agenda, metrics: Metrics },
  components: { Metric, Logo },
  layers: { "slide-top": Mark, "slide-bottom": Footer },
};
