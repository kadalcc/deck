import type { Stroke } from "../live/protocol.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SHAPES  —  line, arrow, rectangle and ellipse, as strokes every screen can draw
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A shape is a stroke whose `points` are its own outline, so it travels, persists, undoes and
 * erases exactly like a pen stroke. `shape` (and the two corners in `anchor`) say what it was
 * drawn as, which lets this window draw it with straight edges and lets the file keep it as a
 * shape; a room that strips fields it does not know still carries the outline, and a screen that
 * only has the outline still draws the same figure.
 *
 * That is why corners are doubled: the pen's path (`pathOf`) curves through the midpoints of its
 * points, and a point given twice turns that curve into a sharp corner. A rectangle drawn by an
 * older screen as a pen stroke is still a rectangle, not a cushion.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ShapeKind = NonNullable<Stroke["shape"]>;
export const SHAPES: readonly ShapeKind[] = ["line", "arrow", "rect", "ellipse"];

type Pt = [number, number];

/**
 * Shift held: a line or an arrow snaps to the nearest 45°, a rectangle becomes a square and an
 * ellipse a circle — the longer side wins, and the drag's direction is kept.
 */
export function constrain(kind: ShapeKind, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (kind === "line" || kind === "arrow") {
    const len = Math.hypot(dx, dy);
    if (len === 0) return b;
    const step = Math.PI / 4;
    const ang = Math.round(Math.atan2(dy, dx) / step) * step;
    return [round(a[0] + len * Math.cos(ang)), round(a[1] + len * Math.sin(ang))];
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return [a[0] + side * (dx < 0 ? -1 : 1), a[1] + side * (dy < 0 ? -1 : 1)];
}

/** The arrowhead's length for a stroke width: it grows with the line, never smaller than a nib. */
export function headLength(size: number): number {
  return Math.max(16, size * 3.5);
}

/** Half the angle between the head's two barbs, in radians (about 27°). */
const BARB = 0.47;

/**
 * The outline of a shape from its drag: `a` where the pointer went down, `b` where it is now.
 * Arrowheads are open barbs at `b`, sized to the stroke; ellipses are inscribed in the drag box.
 */
export function shapePoints(kind: ShapeKind, a: Pt, b: Pt, size: number): Pt[] {
  if (kind === "line") return [a, b];
  if (kind === "arrow") {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // A head longer than the shaft would point the wrong way; a short arrow gets a small head.
    const head = Math.min(headLength(size), len * 0.6);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const l: Pt = [
      round(b[0] - head * Math.cos(ang - BARB)),
      round(b[1] - head * Math.sin(ang - BARB)),
    ];
    const r: Pt = [
      round(b[0] - head * Math.cos(ang + BARB)),
      round(b[1] - head * Math.sin(ang + BARB)),
    ];
    return [a, b, b, l, l, b, b, r];
  }
  const x0 = Math.min(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  if (kind === "rect") {
    const c: Pt[] = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    return [c[0]!, c[0]!, c[1]!, c[1]!, c[2]!, c[2]!, c[3]!, c[3]!, c[0]!, c[0]!];
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = (x1 - x0) / 2;
  const ry = (y1 - y0) / 2;
  // Enough points that the outline reads as a curve even as straight segments; closed.
  const n = Math.max(24, Math.min(96, Math.round((rx + ry) / 8)));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([round(cx + rx * Math.cos(t)), round(cy + ry * Math.sin(t))]);
  }
  return out;
}

/** A shape stroke from its drag (see `shapePoints`); `constrained` is Shift. */
export function shapeStroke(
  base: Stroke,
  kind: ShapeKind,
  a: Pt,
  b: Pt,
  constrained = false,
): Stroke {
  const end = constrained ? constrain(kind, a, b) : b;
  return { ...base, shape: kind, anchor: [a, end], points: shapePoints(kind, a, end, base.size) };
}

/** A drag too small to mean a shape (a click with a shape tool): nothing is drawn. */
export function tooSmall(kind: ShapeKind, a: Pt, b: Pt): boolean {
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  return kind === "line" || kind === "arrow" ? Math.hypot(dx, dy) < 4 : dx < 4 && dy < 4;
}

/** Straight segments through the points, the repeats dropped: how a shape's own edges are drawn. */
export function polylineOf(points: Pt[]): string {
  let d = "";
  let last: Pt | null = null;
  for (const p of points) {
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    d += `${d ? " L" : "M"} ${p[0]} ${p[1]}`;
    last = p;
  }
  return d;
}

const round = (n: number) => Math.round(n * 10) / 10;
