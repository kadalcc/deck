import type { Stroke } from "../live/protocol.ts";

/** A smooth SVG path through a stroke's points: quadratic curves through midpoints. */
export function pathOf(points: [number, number][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const [x, y] = points[0]!;
    return `M ${x} ${y} L ${x + 0.01} ${y}`;
  }
  let d = `M ${points[0]![0]} ${points[0]![1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    d += ` Q ${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

/** Drop points closer than `min` to the previous kept point, so strokes stay light on the wire. */
export function simplify(points: [number, number][], min = 2): [number, number][] {
  const out: [number, number][] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= min) out.push(p);
  }
  return out;
}

export function newStroke(tool: Stroke["tool"], color: string, size: number, fade = false): Stroke {
  return {
    id: `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    tool,
    color,
    size,
    points: [],
    ...(fade ? { fade: true } : {}),
  };
}

/* ── colours ──────────────────────────────────────────────────────────────── */

export const DRAW_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#111827",
  "#ffffff",
];
export const DRAW_SIZES = [4, 8, 16];

/**
 * Each pen is a small family rather than one flat colour: the swatch shows the family as a
 * gradient, and a stroke drifts through it as it travels — orange through amber and coral and
 * back — so a scribble reads as one gesture with a little life in it. Every screen derives the
 * same colours from the stroke's base colour and points, so nothing extra goes over the wire.
 */
const FAMILIES: Record<string, [string, string, string]> = {
  "#ef4444": ["#f43f5e", "#ef4444", "#fb923c"],
  "#f59e0b": ["#f97316", "#f59e0b", "#fbbf24"],
  "#22c55e": ["#10b981", "#22c55e", "#84cc16"],
  "#3b82f6": ["#0ea5e9", "#3b82f6", "#6366f1"],
  "#a855f7": ["#8b5cf6", "#a855f7", "#ec4899"],
  "#111827": ["#0f172a", "#111827", "#374151"],
  "#ffffff": ["#f1f5f9", "#ffffff", "#e2e8f0"],
};

export function familyOf(color: string): [string, string, string] {
  return FAMILIES[color.toLowerCase()] ?? [color, color, color];
}

export function swatchGradient(color: string): string {
  const [a, b, c] = familyOf(color);
  return `linear-gradient(135deg, ${a} 0%, ${b} 50%, ${c} 100%)`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r} ${g} ${bl})`;
}

/** The family colour at phase `u` in 0..1: a → b → c → b → a, so the cycle has no seam. */
export function familyAt(color: string, u: number): string {
  const [a, b, c] = familyOf(color);
  const p = ((u % 1) + 1) % 1;
  const q = p * 4; // four legs: a→b, b→c, c→b, b→a
  if (q < 1) return mix(a, b, q);
  if (q < 2) return mix(b, c, q - 1);
  if (q < 3) return mix(c, b, q - 2);
  return mix(b, a, q - 3);
}

export interface Segment {
  d: string;
  color: string;
}

/** How far along the path the colour cycles once, in stage pixels. */
export const CYCLE = 640;

/**
 * A stroke as runs of a few points, each coloured by its distance along the path. Round caps
 * overlap the joins; from `from` on (a point index) the head has already been erased.
 */
export function segmentsOf(stroke: Stroke, from = 0, run = 5): Segment[] {
  const pts = stroke.points;
  if (pts.length === 0) return [];
  const [a, b, c] = familyOf(stroke.color);
  if (a === b && b === c) return [{ d: pathOf(pts.slice(from)), color: stroke.color }];
  const out: Segment[] = [];
  let dist = 0;
  const start = Math.max(0, Math.min(from, pts.length - 1));
  // distance up to the start, so colours stay put while the head recedes
  for (let i = 1; i <= start; i++)
    dist += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  for (let i = start; i < pts.length; i += run) {
    const slice = pts.slice(i, Math.min(pts.length, i + run + 1));
    if (slice.length === 0) break;
    let d = dist;
    for (let j = 1; j < slice.length; j++)
      d += Math.hypot(slice[j]![0] - slice[j - 1]![0], slice[j]![1] - slice[j - 1]![1]);
    const mid = (dist + d) / 2;
    out.push({ d: pathOf(slice), color: familyAt(stroke.color, mid / CYCLE) });
    dist = d;
    if (slice.length < run + 1) break;
  }
  return out;
}

/* ── fading ───────────────────────────────────────────────────────────────── */

/** A fading stroke lingers this long after the pen lifts, then unwinds along its own path. */
export const FADE_DWELL = 5000;

/** How long the unwinding takes: roughly the pace it was drawn at, within reason. */
export function fadeDuration(stroke: Stroke): number {
  return Math.min(2400, Math.max(500, stroke.points.length * 9));
}

/* ── persistence ──────────────────────────────────────────────────────────── */

const key = (slug: string) => `deck.drawings.${slug}`;

export function loadDrawings(slug: string): Record<string, Stroke[]> {
  try {
    const raw = localStorage.getItem(key(slug));
    const all = raw ? (JSON.parse(raw) as Record<string, Stroke[]>) : {};
    // Fading strokes are gone by the time a page is reopened.
    for (const k of Object.keys(all)) all[k] = (all[k] ?? []).filter((s) => !s.fade);
    return all;
  } catch {
    return {};
  }
}

export function saveDrawings(slug: string, drawings: Record<string, Stroke[]>) {
  try {
    const kept: Record<string, Stroke[]> = {};
    for (const [k, list] of Object.entries(drawings)) {
      const keep = list.filter((s) => !s.fade);
      if (keep.length) kept[k] = keep;
    }
    localStorage.setItem(key(slug), JSON.stringify(kept));
  } catch {
    /* storage full or blocked */
  }
}
