import type { Stroke } from "../live/protocol.ts";
import { polylineOf, SHAPES, type ShapeKind, shapePoints } from "./shapes.ts";
import { pathOf } from "./strokes.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DRAWINGS AS SVG FILES  —  `drawings/<slide>.svg` beside deck.mdx
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Slidev keeps persisted drawings as SVG under `.slidev/drawings`; Kadal keeps them in
 * `drawings/`, one file per slide, named by the slide's `id:` when it has one and by its number
 * (1-based) when it does not. A file is an ordinary SVG — open it in a browser or an editor and
 * the drawing is there — with the stroke data the deck needs to edit it again in `data-*`
 * attributes, and one `<g data-click="n">` per click step it was drawn on.
 *
 *   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" data-kadal-drawings="1">
 *     <g data-click="0">
 *       <path id="s_m3k2…" d="M 10 20 L …" stroke="#ef4444" stroke-width="8" …
 *             data-tool="pen" data-points="10,20 30,40 …" />
 *     </g>
 *   </svg>
 *
 * Reading is forgiving, so a file from somewhere else still loads: a path without `data-points`
 * is read from its `d`, and `<line>`, `<polyline>`, `<polygon>`, `<rect>`, `<ellipse>` and
 * `<circle>` become the matching shapes (a Slidev drawing, drauu's markup, comes across this way).
 * Coordinates are scaled from the file's own viewBox to the deck's size. Everything is plain
 * string work — no DOM — because the dev server writes these files and the build reads them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** One slide's drawing: its strokes by the click step they belong to (0 = the slide itself). */
export type Layers = Record<number, Stroke[]>;

/** The path a stroke is drawn as: a shape's straight edges, else the pen's smoothed curve. */
export function strokePath(s: Stroke): string {
  return s.shape && s.shape !== "ellipse" ? polylineOf(s.points) : pathOf(s.points);
}

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n: number) => String(Math.round(n * 10) / 10);
const pts = (list: [number, number][]) => list.map(([x, y]) => `${num(x)},${num(y)}`).join(" ");

/** A slide's drawing as an SVG file. Fading scribbles are never written. */
export function toSvg(layers: Layers, width: number, height: number): string {
  const groups: string[] = [];
  for (const click of Object.keys(layers)
    .map(Number)
    .sort((a, b) => a - b)) {
    const list = (layers[click] ?? []).filter((s) => !s.fade && s.points.length);
    if (!list.length) continue;
    const paths = list.map((s) => {
      const wide = s.tool === "highlighter";
      const attrs: [string, string][] = [
        ["id", s.id],
        ["d", strokePath(s)],
        ["fill", "none"],
        ["stroke", s.color],
        ["stroke-width", num(wide ? s.size * 3 : s.size)],
        ["stroke-linecap", "round"],
        ["stroke-linejoin", "round"],
      ];
      if (wide) attrs.push(["stroke-opacity", "0.35"]);
      attrs.push(["data-tool", s.tool], ["data-size", num(s.size)]);
      if (s.shape) attrs.push(["data-shape", s.shape]);
      if (s.anchor) attrs.push(["data-anchor", pts(s.anchor)]);
      attrs.push(["data-points", pts(s.points)]);
      return `    <path ${attrs.map(([k, v]) => `${k}="${esc(v)}"`).join(" ")} />`;
    });
    groups.push(`  <g data-click="${click}">\n${paths.join("\n")}\n  </g>`);
  }
  if (!groups.length) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-kadal-drawings="1">\n${groups.join("\n")}\n</svg>\n`;
}

/* ── reading ─────────────────────────────────────────────────────────────── */

const TAG =
  /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function attrsOf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(ATTR)) out[m[1]!.toLowerCase()] = unesc(m[2] ?? m[3] ?? m[4] ?? "");
  // `style="stroke: red; stroke-width: 4"` counts as the attributes it sets.
  if (out.style)
    for (const decl of out.style.split(";")) {
      const [k, ...v] = decl.split(":");
      const key = k?.trim().toLowerCase();
      if (key && v.length && !(key in out)) out[key] = v.join(":").trim();
    }
  return out;
}

const unesc = (v: string) =>
  v
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const numbers = (s: string | undefined) => (s ? (s.match(NUMBER) ?? []).map(Number) : []);

function pairs(s: string | undefined): [number, number][] {
  const n = numbers(s);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i]!, n[i + 1]!]);
  return out;
}

/**
 * The points a path's `d` passes through, one list per subpath: every command's end point (the
 * control points of curves are dropped; a curve becomes its chord, which is close enough for
 * hand-drawn input), relative commands resolved.
 */
export function pathPoints(d: string): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = "";
  const take = () => Number(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]!);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i]!)) cmd = tokens[i++]!;
    else if (!cmd) {
      i++;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === "Z") {
      if (cur.length) cur.push([sx, sy]);
      x = sx;
      y = sy;
      // A Z takes no numbers; numbers after it would repeat nothing.
      if (!isNum()) continue;
      cmd = rel ? "l" : "L";
      continue;
    }
    const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }[C] ?? 2;
    if (!isNum()) continue;
    const args: number[] = [];
    for (let k = 0; k < arity && isNum(); k++) args.push(take());
    if (args.length < arity) break;
    if (C === "H") x = rel ? x + args[0]! : args[0]!;
    else if (C === "V") y = rel ? y + args[0]! : args[0]!;
    else {
      const ex = args[arity - 2]!;
      const ey = args[arity - 1]!;
      x = rel ? x + ex : ex;
      y = rel ? y + ey : ey;
    }
    if (C === "M") {
      if (cur.length) out.push(cur);
      cur = [[x, y]];
      sx = x;
      sy = y;
      // Further pairs after an M are line-tos.
      cmd = rel ? "l" : "L";
    } else cur.push([x, y]);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** A short, stable id for a stroke read from a file without one, so every screen agrees on it. */
function stableId(prefix: string, n: number): string {
  let h = 2166136261;
  for (const c of `${prefix}:${n}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return `f_${(h >>> 0).toString(36)}${n.toString(36)}`;
}

const isShape = (s: string | undefined): s is ShapeKind => !!s && (SHAPES as string[]).includes(s);

/**
 * A drawing file back into strokes, by click step, in the deck's own stage size. `idPrefix`
 * (the file's name) seeds the ids of strokes the file gives none. Nothing in the file runs:
 * only the geometry and the stroke colour and width are read.
 */
export function parseSvg(
  text: string,
  size: { width: number; height: number },
  idPrefix = "drawing",
): Layers {
  const layers: Layers = {};
  let sx = 1;
  let sy = 1;
  let ox = 0;
  let oy = 0;
  const clicks: number[] = [];
  let n = 0;
  const at = (p: [number, number]): [number, number] => [
    Math.round((p[0] - ox) * sx * 10) / 10,
    Math.round((p[1] - oy) * sy * 10) / 10,
  ];
  // Comments and CDATA could hide markup; they are not drawings.
  const body = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  for (const m of body.matchAll(TAG)) {
    const close = m[1] === "/";
    const tag = m[2]!.toLowerCase();
    const a = close ? {} : attrsOf(m[3] ?? "");
    const selfClose = m[4] === "/";
    if (tag === "svg" && !close) {
      const vb = numbers(a.viewbox);
      const w = vb.length === 4 ? vb[2]! : Number.parseFloat(a.width ?? "") || size.width;
      const h = vb.length === 4 ? vb[3]! : Number.parseFloat(a.height ?? "") || size.height;
      if (vb.length === 4) {
        ox = vb[0]!;
        oy = vb[1]!;
      }
      sx = w > 0 ? size.width / w : 1;
      sy = h > 0 ? size.height / h : 1;
      continue;
    }
    if (tag === "g") {
      if (close) clicks.pop();
      else if (!selfClose) {
        const c = Number.parseInt(a["data-click"] ?? "", 10);
        clicks.push(Number.isFinite(c) && c >= 0 ? c : (clicks[clicks.length - 1] ?? 0));
      }
      continue;
    }
    if (close) continue;
    const click = clicks[clicks.length - 1] ?? 0;
    const stroke =
      a.stroke && a.stroke !== "none" ? a.stroke : a.fill && a.fill !== "none" ? a.fill : null;
    const opacity = Number.parseFloat(a["stroke-opacity"] ?? a.opacity ?? "1");
    const tool: Stroke["tool"] =
      a["data-tool"] === "highlighter" || (a["data-tool"] !== "pen" && opacity < 0.75)
        ? "highlighter"
        : "pen";
    const painted = Number.parseFloat(a["stroke-width"] ?? "") || 4;
    const sizeAttr = Number.parseFloat(a["data-size"] ?? "");
    const base = {
      tool,
      color: cleanColor(stroke) ?? "#ef4444",
      // Stroke widths scale with the drawing; a highlighter's painted width is three times its size.
      size: Math.max(
        1,
        Math.round(
          (Number.isFinite(sizeAttr) ? sizeAttr : tool === "highlighter" ? painted / 3 : painted) *
            Math.min(sx, sy) *
            10,
        ) / 10,
      ),
    };
    const push = (points: [number, number][], extra: Partial<Stroke> = {}, id?: string) => {
      if (points.length < 1) return;
      (layers[click] ??= []).push({
        id: id && /^[\w~-]{1,24}$/.test(id) ? id : stableId(idPrefix, n),
        ...base,
        ...extra,
        points: points.map(at),
      });
      n++;
    };
    const shapeOf = (kind: ShapeKind, p: [number, number], q: [number, number]) => {
      const [A, B] = [at(p), at(q)];
      (layers[click] ??= []).push({
        id: a.id && /^[\w~-]{1,24}$/.test(a.id) ? a.id : stableId(idPrefix, n),
        ...base,
        shape: kind,
        anchor: [A, B],
        points: shapePoints(kind, A, B, base.size),
      });
      n++;
    };
    if (tag === "path") {
      const listed = pairs(a["data-points"]);
      if (listed.length) {
        const shape = isShape(a["data-shape"]) ? a["data-shape"] : undefined;
        const anchor = pairs(a["data-anchor"]);
        push(
          listed,
          shape
            ? {
                shape,
                ...(anchor.length === 2 ? { anchor: [at(anchor[0]!), at(anchor[1]!)] } : {}),
              }
            : {},
          a.id,
        );
      } else
        for (const [k, sub] of pathPoints(a.d ?? "").entries())
          push(sub, {}, k === 0 ? a.id : undefined);
    } else if (tag === "line") {
      const p: [number, number] = [Number(a.x1) || 0, Number(a.y1) || 0];
      const q: [number, number] = [Number(a.x2) || 0, Number(a.y2) || 0];
      // drauu draws an arrow as a line with a marker at its end.
      shapeOf(a["marker-end"] || a["data-shape"] === "arrow" ? "arrow" : "line", p, q);
    } else if (tag === "polyline" || tag === "polygon") {
      const list = pairs(a.points);
      if (tag === "polygon" && list.length) list.push(list[0]!);
      push(list, {}, a.id);
    } else if (tag === "rect") {
      const x = Number(a.x) || 0;
      const y = Number(a.y) || 0;
      shapeOf("rect", [x, y], [x + (Number(a.width) || 0), y + (Number(a.height) || 0)]);
    } else if (tag === "ellipse" || tag === "circle") {
      const cx = Number(a.cx) || 0;
      const cy = Number(a.cy) || 0;
      const rx = Number(tag === "circle" ? a.r : a.rx) || 0;
      const ry = Number(tag === "circle" ? a.r : a.ry) || 0;
      shapeOf("ellipse", [cx - rx, cy - ry], [cx + rx, cy + ry]);
    }
  }
  return layers;
}

/** A colour as written in a file, if it is one: hex, rgb()/hsl(), or a named colour. */
function cleanColor(c: string | null): string | null {
  if (!c) return null;
  const v = c.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v.toLowerCase();
  if (/^(rgb|rgba|hsl|hsla)\([\d\s.,%/+-]+\)$/i.test(v)) return v;
  if (/^[a-z]{3,20}$/i.test(v) && v.toLowerCase() !== "currentcolor") return v.toLowerCase();
  return null;
}

/* ── which file is which slide ───────────────────────────────────────────── */

/**
 * The file a slide's drawing lives in, without `.svg`: its `id:` when it has one (made safe for a
 * file name), else its number counted from 1 — so `drawings/3.svg` is the third slide, as in
 * Slidev, and a slide with an id keeps its drawing when slides move around it.
 */
export function drawingFile(meta: { index: number; frontmatter: Record<string, unknown> }): string {
  const id = meta.frontmatter.id;
  if (typeof id === "string" && id.trim()) {
    const safe = id
      .trim()
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    if (safe) return safe;
  }
  return String(meta.index + 1);
}

/** A file name the dev server will write: what `drawingFile` makes, nothing that walks paths. */
export const isDrawingFile = (name: string) => /^[\w-]{1,64}$/.test(name);

/**
 * The key a click step's strokes live under in the room and in memory: the slide's "h,v", and
 * "h,v@n" for strokes drawn on step n when drawings follow clicks. Short, because the room keeps
 * slide keys to twelve characters.
 */
export const layerKey = (h: number, v: number, click = 0) =>
  click > 0 ? `${h},${v}@${click}` : `${h},${v}`;

/** "h,v" or "h,v@n" back into its slide and step. */
export function parseLayerKey(key: string): { slide: string; click: number } {
  const at = key.indexOf("@");
  if (at < 0) return { slide: key, click: 0 };
  const click = Number.parseInt(key.slice(at + 1), 10);
  return { slide: key.slice(0, at), click: Number.isFinite(click) && click > 0 ? click : 0 };
}
