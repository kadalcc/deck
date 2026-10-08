/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SKETCH PALETTE  —  the colours a sketch is drawn with, and what they become on a slide
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Excalidraw bakes literal colours into its SVG. A deck has themes and a light/dark scheme, so
 * every sketch is drawn with this fixed palette and, once exported, each literal is rewritten
 * to the theme token it stands for (`--deck-fg`, `--tone-accent`, …). The literals are picked
 * to look right on their own too: the interactive canvas shows them as they are.
 *
 * Every entry is unique on purpose — the rewrite is a lookup by hex.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type SketchTone =
  | "ink"
  | "muted"
  | "accent"
  | "accent-2"
  | "good"
  | "warn"
  | "bad"
  | "info"
  | "neutral"
  | "purple"
  | "pink"
  | "amber"
  | "teal";

export interface TonePair {
  stroke: string;
  fill: string;
}

export const PALETTE: Record<SketchTone, TonePair> = {
  ink: { stroke: "#1e1e1e", fill: "#f8f9fa" },
  muted: { stroke: "#6b7280", fill: "#f3f4f6" },
  accent: { stroke: "#059669", fill: "#d1fae5" },
  "accent-2": { stroke: "#0891b2", fill: "#cffafe" },
  good: { stroke: "#16a34a", fill: "#dcfce7" },
  warn: { stroke: "#d97706", fill: "#fef3c7" },
  bad: { stroke: "#dc2626", fill: "#fee2e2" },
  info: { stroke: "#2563eb", fill: "#dbeafe" },
  neutral: { stroke: "#64748b", fill: "#f1f5f9" },
  purple: { stroke: "#7c3aed", fill: "#ede9fe" },
  pink: { stroke: "#db2777", fill: "#fce7f3" },
  amber: { stroke: "#f59e0b", fill: "#ffedd5" },
  teal: { stroke: "#0d9488", fill: "#ccfbf1" },
};

/** The CSS a literal becomes on the slide. Strokes take the token; fills are a tint of it. */
export function cssFor(tone: SketchTone, role: "stroke" | "fill"): string {
  if (tone === "ink") return role === "stroke" ? "var(--deck-fg)" : "var(--deck-surface)";
  if (tone === "muted")
    return role === "stroke"
      ? "var(--deck-muted)"
      : "color-mix(in oklab, var(--deck-muted) 12%, transparent)";
  const token = `var(--tone-${tone})`;
  return role === "stroke" ? token : `color-mix(in oklab, ${token} 16%, transparent)`;
}

/** hex (lower-case) → CSS, for the rewrite pass. */
export const COLOR_MAP: ReadonlyMap<string, string> = new Map(
  (Object.keys(PALETTE) as SketchTone[]).flatMap((tone) => [
    [PALETTE[tone].stroke, cssFor(tone, "stroke")],
    [PALETTE[tone].fill, cssFor(tone, "fill")],
  ]),
);
