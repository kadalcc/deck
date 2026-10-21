import type { Stroke } from "../live/protocol.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ERASER  —  which strokes a sweep touches, and what is left of them
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two ways, both by hit-testing against the strokes' own outlines (stage pixels, so a stroke is
 * as easy to hit on a phone-sized window as on a projector):
 *
 *   whole    a stroke the eraser touches goes, all of it (Slidev's, and the default)
 *   partial  only the part under the eraser goes: the stroke is cut there, and each piece that
 *            is left becomes a stroke of its own
 *
 * A stroke is "touched" when the eraser's circle comes within half the stroke's painted width of
 * any segment of it — a fat highlighter is hit at its edge, a fine pen at its line.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Pt = [number, number];

/** The painted width of a stroke: a highlighter is three times its size. */
export const paintedWidth = (s: Stroke) => (s.tool === "highlighter" ? s.size * 3 : s.size);

/** Distance from `p` to the segment a–b. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Does an eraser of radius `r` at `p` touch the stroke? */
export function touches(stroke: Stroke, p: Pt, r: number): boolean {
  const pts = stroke.points;
  if (!pts.length) return false;
  const reach = r + paintedWidth(stroke) / 2;
  if (pts.length === 1) return Math.hypot(p[0] - pts[0]![0], p[1] - pts[0]![1]) <= reach;
  for (let i = 1; i < pts.length; i++)
    if (distToSegment(p, pts[i - 1]!, pts[i]!) <= reach) return true;
  return false;
}

/**
 * The eraser moved from `from` to `to`: the ids of the strokes its swept path touches. Sampled
 * along the move, so a fast flick across a stroke still catches it.
 */
export function sweep(strokes: Stroke[], from: Pt, to: Pt, r: number): string[] {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / Math.max(1, r / 2)),
  );
  const hit: string[] = [];
  for (const s of strokes) {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (touches(s, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], r)) {
        hit.push(s.id);
        break;
      }
    }
  }
  return hit;
}

/**
 * Cut what lies under an eraser of radius `r` at `p` out of a stroke. Returns null when the
 * eraser misses it, else what is left: zero, one or more strokes. A long straight segment that
 * crosses the eraser (a rectangle's edge) is first divided finely enough to be cut where it
 * crosses. A shape's pieces keep its look (straight edges, one colour) but not its drag, and
 * every piece but the first gets a new id from `nextId`.
 */
export function cut(stroke: Stroke, p: Pt, r: number, nextId: () => string): Stroke[] | null {
  if (!touches(stroke, p, r)) return null;
  const reach = r + paintedWidth(stroke) / 2;
  const pts = stroke.points;
  // Divide the segments that pass under the eraser, so a cut lands where the eraser is.
  const fine: Pt[] = [];
  const step = Math.max(1, r / 3);
  for (let i = 0; i < pts.length; i++) {
    const b = pts[i]!;
    if (i > 0) {
      const a = pts[i - 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > step && distToSegment(p, a, b) <= reach) {
        const n = Math.ceil(len / step);
        for (let k = 1; k < n; k++)
          fine.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
      }
    }
    fine.push(b);
  }
  const runs: Pt[][] = [];
  let run: Pt[] = [];
  for (const q of fine) {
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= reach) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(q);
  }
  if (run.length) runs.push(run);
  // A closed outline (a rectangle, an ellipse, a loop) cut twice is two pieces, not three: the
  // piece that runs to its end and the one that starts it meet at the corner, so they join.
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const closed = pts.length > 2 && first[0] === last[0] && first[1] === last[1];
  if (
    closed &&
    runs.length > 1 &&
    runs[0]![0] === fine[0] &&
    runs[runs.length - 1]!.at(-1) === fine[fine.length - 1]
  )
    runs[0] = [...runs.pop()!, ...runs[0]!.slice(1)];
  // A piece of a shape still draws as one (straight edges, one colour); it has no drag any more.
  const { anchor: _anchor, ...plain } = stroke;
  return runs
    .filter((r) => r.length >= 2)
    .map((points, i) => ({ ...plain, id: i === 0 ? stroke.id : nextId(), points }));
}

/**
 * The partial eraser over a list: every stroke it touches is replaced by what is left of it, in
 * place, so the stacking order holds. Returns the same array when nothing was touched.
 */
export function cutAll(strokes: Stroke[], p: Pt, r: number, nextId: () => string): Stroke[] {
  let changed = false;
  const out: Stroke[] = [];
  for (const s of strokes) {
    const left = cut(s, p, r, nextId);
    if (left === null) out.push(s);
    else {
      changed = true;
      out.push(...left);
    }
  }
  return changed ? out : strokes;
}
