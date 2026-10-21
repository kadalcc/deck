/**
 * The shapes `<Mark>` draws (components/Mark.tsx), as SVG paths — pure, so the same text gives the
 * same wobble everywhere and the tests can look at it. Coordinates are the text's own, in CSS
 * pixels of the slide (unscaled).
 *
 * The hand-drawn look is rough-notation's idea, drawn our own way: every line is a quadratic curve
 * whose ends wander a little and whose middle bows a little; each "iteration" is another pass with
 * its own wander; an ellipse is a closed curve through jittered points that overshoots where it
 * started, as a pen does. The randomness is a small PRNG seeded from the marked text.
 */

export type MarkType =
  | "underline"
  | "box"
  | "circle"
  | "highlight"
  | "strike-through"
  | "crossed-off"
  | "bracket";

export const MARK_TYPES: MarkType[] = [
  "underline",
  "box",
  "circle",
  "highlight",
  "strike-through",
  "crossed-off",
  "bracket",
];

const ALIASES: Record<string, MarkType> = {
  strike: "strike-through",
  "line-through": "strike-through",
  linethrough: "strike-through",
  cross: "crossed-off",
  crossed: "crossed-off",
};

/** A type as written (Slidev's aliases too) → the type drawn; underline for anything unknown. */
export function normaliseMarkType(type: string): MarkType {
  return (
    ALIASES[type] ?? (MARK_TYPES.includes(type as MarkType) ? (type as MarkType) : "underline")
  );
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MarkShape {
  d: string;
  /** Stroke width in px. */
  width: number;
  /** Approximate length, to share the animation's time between strokes as they are long. */
  length: number;
}

export interface MarkGeometryOptions {
  strokeWidth?: number;
  padding?: number | string | number[];
  iterations?: number;
  brackets?: string[];
  seed?: string;
}

/** "5", 5, [5, 10], "5 10 5 10" → [top, right, bottom, left], as CSS reads it. */
export function markPadding(
  p: MarkGeometryOptions["padding"],
  fallback = 5,
): [number, number, number, number] {
  const list = (
    Array.isArray(p)
      ? p
      : p === undefined
        ? [fallback]
        : String(p)
            .trim()
            .split(/[\s,]+/)
  )
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const [t = fallback, r = t, b = t, l = r] = list;
  return [t, r, b, l];
}

/** mulberry32, seeded by an FNV-1a hash of the text. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** One wobbly stroke from a to b. */
function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rand: () => number,
): { d: string; length: number } {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const wander = Math.min(len * 0.03, 4);
  const j = () => (rand() - 0.5) * 2 * wander;
  const ax = x1 + j();
  const ay = y1 + j() * 0.5;
  const bx = x2 + j();
  const by = y2 + j() * 0.5;
  // Bow the middle sideways, a little, the way a hand drawing a long line does.
  const bow = (rand() - 0.5) * Math.min(len * 0.02, 6);
  const nx = len ? -(y2 - y1) / len : 0;
  const ny = len ? (x2 - x1) / len : 0;
  const cx = (ax + bx) / 2 + nx * bow;
  const cy = (ay + by) / 2 + ny * bow;
  return { d: `M${r1(ax)} ${r1(ay)}Q${r1(cx)} ${r1(cy)} ${r1(bx)} ${r1(by)}`, length: len };
}

/** A stroke through several points (a bracket's three sides), each segment wobbling. */
function polyline(
  points: Array<[number, number]>,
  rand: () => number,
): { d: string; length: number } {
  let d = "";
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1]!;
    const [x2, y2] = points[i]!;
    const seg = line(x1, y1, x2, y2, rand);
    d += i === 1 ? seg.d : seg.d.replace(/^M[^Q]+/, `L${seg.d.slice(1).split("Q")[0]}`);
    length += seg.length;
  }
  return { d, length };
}

/** A pen-drawn ellipse: jittered points round the centre, overshooting where it began. */
function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rand: () => number,
): { d: string; length: number } {
  const start = rand() * Math.PI * 2;
  const sweep = Math.PI * 2 + 0.25 + rand() * 0.35;
  const n = 14;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = start + (sweep * i) / n;
    const k = 1 + (rand() - 0.5) * 0.06;
    pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
  }
  // Catmull–Rom through the points, as cubic Béziers.
  let d = `M${r1(pts[0]![0])} ${r1(pts[0]![1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0]!)} ${r1(c1[1]!)} ${r1(c2[0]!)} ${r1(c2[1]!)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  const length =
    Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry))) * (sweep / (Math.PI * 2));
  return { d, length };
}

/** Every stroke of a mark of `type` over `rects` (one per line of text, or one around it all). */
export function markShapes(
  type: MarkType,
  rects: Rect[],
  o: MarkGeometryOptions = {},
): MarkShape[] {
  const rand = rng(`${type}|${o.seed ?? ""}`);
  const width = o.strokeWidth ?? 3;
  const passes = Math.max(1, Math.min(6, Math.round(o.iterations ?? 2)));
  const [pt, pr, pb, pl] = markPadding(o.padding, type === "highlight" ? 0 : 5);
  const out: MarkShape[] = [];
  const push = (s: { d: string; length: number }, w = width) =>
    out.push({ d: s.d, length: s.length, width: w });
  for (const r of rects) {
    const x = r.x - pl;
    const y = r.y - pt;
    const w = r.w + pl + pr;
    const h = r.h + pt + pb;
    for (let pass = 0; pass < passes; pass++) {
      switch (type) {
        case "underline": {
          const uy = r.y + r.h + Math.min(pb, 6) - 2;
          push(line(x, uy, x + w, uy, rand));
          break;
        }
        case "strike-through": {
          const my = r.y + r.h * 0.52;
          push(line(x, my, x + w, my, rand));
          break;
        }
        case "crossed-off":
          push(line(x, y, x + w, y + h, rand));
          push(line(x + w, y, x, y + h, rand));
          break;
        case "highlight": {
          // A marker stroke as tall as the line, along its middle. Its round ends reach half its
          // width past the points, so the points sit that far in (less on a short word).
          const my = r.y + r.h / 2;
          const sw = o.strokeWidth ?? r.h * 0.9 + pt + pb;
          const inset = Math.min(sw / 2, w / 4) - 2;
          push(line(x + inset, my, x + w - inset, my, rand), sw);
          break;
        }
        case "box":
          push(line(x, y, x + w, y, rand));
          push(line(x + w, y, x + w, y + h, rand));
          push(line(x + w, y + h, x, y + h, rand));
          push(line(x, y + h, x, y, rand));
          break;
        case "circle": {
          // An ellipse that clears the text's corners: a box's half-diagonal, in each direction.
          const rx = (w / 2) * Math.SQRT2 * 0.92;
          const ry = (h / 2) * Math.SQRT2 * 0.92;
          push(ellipse(x + w / 2, y + h / 2, rx, ry, rand));
          break;
        }
        case "bracket": {
          const arm = Math.max(6, Math.min(20, Math.min(w, h) * 0.15));
          for (const side of o.brackets?.length ? o.brackets : ["right"]) {
            if (side === "left")
              push(
                polyline(
                  [
                    [x + arm, y],
                    [x, y],
                    [x, y + h],
                    [x + arm, y + h],
                  ],
                  rand,
                ),
              );
            else if (side === "right")
              push(
                polyline(
                  [
                    [x + w - arm, y],
                    [x + w, y],
                    [x + w, y + h],
                    [x + w - arm, y + h],
                  ],
                  rand,
                ),
              );
            else if (side === "top")
              push(
                polyline(
                  [
                    [x, y + arm],
                    [x, y],
                    [x + w, y],
                    [x + w, y + arm],
                  ],
                  rand,
                ),
              );
            else if (side === "bottom")
              push(
                polyline(
                  [
                    [x, y + h - arm],
                    [x, y + h],
                    [x + w, y + h],
                    [x + w, y + h - arm],
                  ],
                  rand,
                ),
              );
          }
          break;
        }
      }
    }
  }
  return out;
}
