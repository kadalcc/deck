import { type LayoutProps, useDeck, useSlideOptional } from "@kadal/deck";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Ocean's module: two layouts and a divider. The stylesheet (style.css) styles every built-in
 * layout; these add what a sea-themed deck reaches for.
 *
 *   layout: waves    a cover with the sea moving along the bottom edge (`align: center` centres
 *                    it); the swells stand still under prefers-reduced-motion and in print
 *   layout: depth    a section opener: its number, a label (`depth: "200 m · twilight"`), and a
 *                    sounding line down the side marking how far into the deck it is
 *   <Wave />         a single swell as a divider, in the accent colour
 * ─────────────────────────────────────────────────────────────────────────────
 */

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * A swell as an SVG path: `periods` crests across 2880 units (twice the visible width, so a
 * -50% drift loops without a seam), `amp` high, its mean line at `base` from the top of 320.
 */
function swell(periods: number, amp: number, base: number, phase = 0): string {
  const w = 2880;
  const step = w / (periods * 2);
  let d = `M0 ${base + Math.sin(phase) * amp}`;
  for (let i = 0; i < periods * 2; i++) {
    const x0 = i * step;
    const crest = i % 2 === 0 ? -amp : amp;
    d += ` Q${x0 + step / 2} ${base + crest * 1.6 + Math.sin(phase) * amp * 0.2} ${x0 + step} ${base}`;
  }
  return `${d} L${w} 320 L0 320 Z`;
}

const SWELLS = [swell(4, 22, 120, 0.4), swell(6, 16, 175, 1.2), swell(8, 12, 235, 2.1)];

function Waves({ children, frontmatter }: LayoutProps) {
  const center = str(frontmatter.align) === "center";
  return (
    <div className={`deck-layout deck-layout-waves${center ? " is-center" : ""}`}>
      <div className="ocean-waves-body">{children}</div>
      {/* placed, not flowed (deck-absolute): the auto-fit does not count the swells as overflow */}
      <div className="ocean-waves deck-absolute" aria-hidden="true">
        <svg viewBox="0 0 2880 320" preserveAspectRatio="none">
          {SWELLS.map((d, i) => (
            <path key={i} className={`ocean-swell-${i + 1}`} d={d} />
          ))}
        </svg>
      </div>
    </div>
  );
}

/** Which depth opener this is (1-based), counting only `layout: depth` slides before it. */
function useDepthNumber(): { n: number; at: number } {
  const deck = useDeck();
  const slide = useSlideOptional();
  const index = slide?.meta.index ?? 0;
  const slides = deck.manifest.slides;
  const n = slides.filter((s) => s.index <= index && s.frontmatter.layout === "depth").length;
  return { n: Math.max(1, n), at: slides.length > 1 ? index / (slides.length - 1) : 0 };
}

const TICKS = 21;

function Depth({ children, frontmatter }: LayoutProps) {
  const { n, at } = useDepthNumber();
  const label = str(frontmatter.depth);
  const given = frontmatter.n == null ? "" : String(frontmatter.n).trim();
  const number = given || String(n).padStart(2, "0");
  const here = Math.round(at * (TICKS - 1));
  return (
    <div className="deck-layout deck-layout-depth">
      <div className="ocean-depth-number" aria-hidden="true">
        {number}
      </div>
      <div className="ocean-depth-body">
        {label ? <span className="ocean-depth-meta">{label}</span> : null}
        {children}
      </div>
      <div className="ocean-depth-gauge" aria-hidden="true">
        {Array.from({ length: TICKS }, (_, i) => (
          <span key={i} className={i === here ? "is-here" : undefined} />
        ))}
      </div>
    </div>
  );
}

/** A divider: one swell across the column, in the accent colour (`flip` turns it over). */
function Wave({ flip = false, className }: { flip?: boolean; className?: string }) {
  return (
    <svg
      className={["ocean-wave", className].filter(Boolean).join(" ")}
      viewBox="0 0 240 14"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={flip ? { transform: "scaleY(-1)" } : undefined}
    >
      <path
        d="M2 7 Q 17 -1 32 7 T 62 7 T 92 7 T 122 7 T 152 7 T 182 7 T 212 7 T 238 7"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default {
  layouts: { waves: Waves, depth: Depth },
  components: { Wave },
};
