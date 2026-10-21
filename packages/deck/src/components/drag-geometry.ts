/**
 * The arithmetic of `<Drag>` (components/Drag.tsx): positions as text, and what a move, a resize
 * or a turn does to a box. Pure, in stage pixels, so it can be tested without a browser.
 *
 * A box is Slidev's v-drag position: the top-left corner of the UNROTATED box (`x`, `y`), its
 * size, and a rotation in degrees about its centre. Written "x,y,w,h,r" — `r` left out when 0,
 * `h` as `_` when the height follows the content.
 */

export interface DragBox {
  x: number;
  y: number;
  w: number;
  /** null: as tall as the content. */
  h: number | null;
  r: number;
}

/** "x,y,w,h[,r]" → a box; null for anything that is not one. `_` or `NaN` for h: automatic. */
export function parseDragPos(text: string | undefined | null): DragBox | null {
  if (!text || !text.includes(",")) return null;
  const parts = text.split(",").map((p) => p.trim());
  if (parts.length < 3) return null;
  const n = (s: string | undefined) => (s === undefined || s === "" ? Number.NaN : Number(s));
  const [x, y, w] = [n(parts[0]), n(parts[1]), n(parts[2])];
  if (![x, y, w].every(Number.isFinite)) return null;
  const hRaw = parts[3];
  const h = hRaw === undefined || hRaw === "_" || hRaw === "NaN" ? null : n(hRaw);
  if (h !== null && !Number.isFinite(h)) return null;
  const r = n(parts[4]);
  return { x, y, w, h, r: Number.isFinite(r) ? r : 0 };
}

const round = (v: number) => Math.round(v);

/** A box → "x,y,w,h[,r]", whole pixels and degrees. */
export function formatDragPos(b: DragBox): string {
  const out = [round(b.x), round(b.y), round(b.w), b.h === null ? "_" : round(b.h)].join(",");
  const r = ((round(b.r) % 360) + 360) % 360;
  return r ? `${out},${r > 180 ? r - 360 : r}` : out;
}

/** An arrow's position, Slidev's way: from (x, y) by (dx, dy). */
export interface ArrowPos {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function parseArrowPos(text: string | undefined | null): ArrowPos | null {
  if (!text || !text.includes(",")) return null;
  const [x, y, dx, dy] = text.split(",").map((p) => Number(p.trim()));
  if (![x, y, dx, dy].every((v) => Number.isFinite(v))) return null;
  return { x1: x!, y1: y!, x2: x! + dx!, y2: y! + dy! };
}

export function formatArrowPos(a: ArrowPos): string {
  return [a.x1, a.y1, a.x2 - a.x1, a.y2 - a.y1].map(round).join(",");
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const rot = (x: number, y: number, deg: number): [number, number] => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [x * c - y * s, x * s + y * c];
};

/**
 * Resize from a handle. `sx`, `sy` say which: -1 the left/top edge, 1 the right/bottom, 0 neither
 * (an edge handle moves one side). The opposite corner or edge stays where it is on the stage,
 * however the box is turned. `ratio` keeps the proportions (a corner with Shift held).
 */
export function resizeBox(
  start: DragBox & { h: number },
  sx: -1 | 0 | 1,
  sy: -1 | 0 | 1,
  pointer: { x: number; y: number },
  options: { min?: number; ratio?: boolean } = {},
): DragBox & { h: number } {
  const min = options.min ?? 16;
  const cx = start.x + start.w / 2;
  const cy = start.y + start.h / 2;
  // The fixed point, in the box's own frame (centre at 0,0), and on the stage.
  const ax = (-sx * start.w) / 2;
  const ay = (-sy * start.h) / 2;
  const [awx, awy] = rot(ax, ay, start.r);
  const anchor = { x: cx + awx, y: cy + awy };
  // The pointer, in the box's frame, from the fixed point.
  const [dx, dy] = rot(pointer.x - anchor.x, pointer.y - anchor.y, -start.r);
  let w = sx ? Math.max(min, sx * dx) : start.w;
  let h = sy ? Math.max(min, sy * dy) : start.h;
  if (options.ratio && sx && sy) {
    const k = Math.max(w / start.w, h / start.h);
    w = Math.max(min, start.w * k);
    h = Math.max(min, start.h * k);
  }
  // The new centre: half the new size from the fixed point, along the box's own axes. For an
  // edge handle the fixed point is the middle of the opposite edge, so across it nothing moves.
  const [mx, my] = rot((sx * w) / 2, (sy * h) / 2, start.r);
  const ncx = anchor.x + mx;
  const ncy = anchor.y + my;
  return { x: ncx - w / 2, y: ncy - h / 2, w, h, r: start.r };
}

/**
 * The rotation that points the box's top at the pointer, snapped to the nearest 15° with `snap`,
 * and always to a right angle within 4° of one.
 */
export function rotateTowards(
  box: DragBox & { h: number },
  pointer: { x: number; y: number },
  snap = false,
): number {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let deg = (Math.atan2(pointer.y - cy, pointer.x - cx) * 180) / Math.PI + 90;
  deg = ((deg % 360) + 360) % 360;
  if (snap) deg = Math.round(deg / 15) * 15;
  else
    for (const a of [0, 90, 180, 270, 360])
      if (Math.abs(deg - a) < 4) {
        deg = a;
        break;
      }
  deg %= 360;
  return deg > 180 ? deg - 360 : deg;
}
