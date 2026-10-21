import type { ReactNode } from "react";

import type { LayoutProps } from "@kadal/deck";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Neon's module: two layouts for the big moment, and a word in neon.
 *
 *   layout: launch    the title over the striped sun with the grid running to the horizon, and
 *                     a pulsing chip above it (`chip: "Live · 24 Oct"`, or `date:`)
 *   layout: horizon   an ordinary content slide with the grid along its foot
 *   <Glow tone>       a word or phrase in neon: tone pink (default) · cyan · amber
 *
 * The sun and the floor are decoration (aria-hidden), stilled under prefers-reduced-motion and
 * on every still copy; `themeConfig.grid: false` hides the floor. They carry `deck-absolute`, the
 * engine's mark for what is placed rather than flowed, so the auto-fit does not count the floor
 * that hangs past the layout's foot as overflow and shrink the slide.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function Launch({ children, frontmatter }: LayoutProps) {
  const chip = str(frontmatter.chip) ?? str(frontmatter.date);
  return (
    <div className="deck-layout deck-layout-launch">
      <div className="neon-sun deck-absolute" aria-hidden="true" />
      <div className="neon-floor deck-absolute" aria-hidden="true" />
      {chip ? <span className="neon-chip">{chip}</span> : null}
      {children}
    </div>
  );
}

function Horizon({ children }: LayoutProps) {
  return (
    <div className="deck-layout deck-layout-horizon">
      <div className="neon-floor deck-absolute" aria-hidden="true" />
      {children}
    </div>
  );
}

function Glow({
  tone = "pink",
  children,
}: {
  tone?: "pink" | "cyan" | "amber";
  children?: ReactNode;
}) {
  return <span className={`neon-glow tone-${tone}`}>{children}</span>;
}

export default {
  layouts: { launch: Launch, horizon: Horizon },
  components: { Glow },
};
