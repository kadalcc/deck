import type { Stroke } from "../live/protocol.ts";
import { segmentsOf } from "./strokes.ts";

/**
 * One stroke as SVG: the pen's colour-drifting segments, a highlighter's wide translucent band,
 * a shape's straight edges. `progress` (0..1) is how far a fading scribble has unwound — its head
 * is gone up to there and it pales as it goes. Shared by the live layer and the print view, so a
 * printed page draws a stroke exactly as the slide did.
 */
export function StrokeView({ stroke: s, progress = 0 }: { stroke: Stroke; progress?: number }) {
  const from = progress > 0 ? Math.floor(progress * s.points.length) : 0;
  const wide = s.tool === "highlighter";
  const fading = progress > 0 ? 1 - progress * 0.35 : 1;
  return (
    // A highlighter's translucency is the group's, not each segment's: where two segments' round
    // ends overlap, the band stays one even tint instead of darkening in spots.
    <g
      opacity={wide ? 0.35 * fading : fading}
      style={wide ? { mixBlendMode: "multiply" } : undefined}
      data-stroke={s.id}
    >
      {segmentsOf(s, from).map((seg, i) => (
        <path
          key={i}
          d={seg.d}
          stroke={seg.color}
          strokeWidth={wide ? s.size * 3 : s.size}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </g>
  );
}

/** Strokes from several layers in drawing order, each id once (the first copy wins). */
export function dedupe(lists: Stroke[][]): Stroke[] {
  const seen = new Set<string>();
  const out: Stroke[] = [];
  for (const list of lists)
    for (const s of list) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
  return out;
}
