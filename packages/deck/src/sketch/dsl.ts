import { PALETTE, type SketchTone } from "./palette.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SKETCH DSL  —  draw an Excalidraw diagram in code
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   const s = sketch({ width: 1280, height: 640 });
 *   s.region("edge", { x: 440, y: 40, w: 420, h: 560, title: "Cloudflare Workers", tone: "accent" });
 *   s.node("w", { x: 470, y: 100, w: 360, h: 90, label: "Next.js 16\nSSR + OG image", tone: "accent", region: "edge" });
 *   s.node("d1", { x: 470, y: 480, w: 165, h: 90, label: "D1", shape: "cylinder", tone: "pink", region: ["edge", "report"] });
 *   s.arrow("w", "d1", { label: "only what is on the map" });
 *   export const architecture = s.build();
 *
 * `build()` returns Excalidraw *element skeletons* (the simplified shape the package's
 * `convertToExcalidrawElements` understands) plus the region of every element, so a slide can
 * light one region up per click. This file imports nothing from Excalidraw: it is plain data,
 * safe to ship in a deck's main bundle; the 2.7 MB package loads only when a sketch renders.
 *
 * Coordinates are pixels in the sketch's own space. Regions are named areas: a dashed, tinted
 * rectangle with a title when they have geometry, or purely a label (`region: "report"` on
 * nodes and arrows) for a path that crosses the drawn boxes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type SketchShape = "box" | "pill" | "ellipse" | "diamond" | "cylinder" | "note" | "text";
export type SketchFont = "hand" | "normal" | "code";
export type SketchFill = "solid" | "hachure" | "cross-hatch" | "none";
type Side = "left" | "right" | "top" | "bottom";

/** Excalidraw's font ids (FONT_FAMILY in its constants). */
const FONT: Record<SketchFont, number> = { hand: 5, normal: 6, code: 3 };

export interface NodeInput {
  x: number;
  y: number;
  w?: number;
  h?: number;
  label?: string;
  shape?: SketchShape;
  tone?: SketchTone;
  /** Text colour, when not the ink. */
  textTone?: SketchTone;
  fill?: SketchFill;
  dashed?: boolean;
  font?: SketchFont;
  size?: number;
  /** 0 = ruler-straight, 1 = hand-drawn (default), 2 = wobbly. */
  rough?: 0 | 1 | 2;
  strokeWidth?: number;
  region?: string | string[];
  align?: "left" | "center" | "right";
  opacity?: number;
}

export interface ArrowInput {
  label?: string;
  tone?: SketchTone;
  dashed?: boolean;
  dotted?: boolean;
  /** A plain line instead of an arrow. */
  line?: boolean;
  /** Arrowheads at both ends. */
  both?: boolean;
  from?: Side;
  to?: Side;
  /** Extra corner points (absolute), for an elbow or a detour. */
  via?: Array<[number, number]>;
  /** Regions this arrow belongs to, on top of those of its two ends. */
  region?: string | string[];
  strokeWidth?: number;
  size?: number;
  font?: SketchFont;
  /** Shift the anchor along its side, −1 … 1 (0 is the middle). */
  fromShift?: number;
  toShift?: number;
}

export interface RegionInput {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  title?: string;
  tone?: SketchTone;
  dashed?: boolean;
  fill?: boolean;
  size?: number;
  /** Where the title sits; "right" keeps it clear of arrows arriving at the left. */
  titleAt?: "left" | "right";
}

export interface TextInput {
  x: number;
  y: number;
  text: string;
  size?: number;
  tone?: SketchTone;
  font?: SketchFont;
  align?: "left" | "center" | "right";
  region?: string | string[];
  w?: number;
}

/** What a rendered sketch knows about a region, for the step captions and the canvas. */
export interface SketchRegionMeta {
  id: string;
  title?: string;
  tone: SketchTone;
}

export interface SketchScene {
  kind: "sketch";
  width: number;
  height: number;
  /** Excalidraw element skeletons, in draw order. Typed loosely: the DSL never imports Excalidraw. */
  elements: Array<Record<string, unknown>>;
  /** Element id → the regions it belongs to. */
  regions: Record<string, string[]>;
  regionMeta: SketchRegionMeta[];
  /** The fonts used (Excalidraw ids), so the renderer can warm them up before measuring text. */
  fonts: number[];
}

interface NodeGeom {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: SketchShape;
}

const list = (r?: string | string[]) => (r == null ? [] : Array.isArray(r) ? r : [r]);

export function sketch(
  opts: {
    width?: number;
    height?: number;
    font?: SketchFont;
    size?: number;
    rough?: 0 | 1 | 2;
  } = {},
) {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 640;
  const baseFont = opts.font ?? "hand";
  const baseSize = opts.size ?? 20;
  const baseRough = opts.rough ?? 1;
  const elements: Array<Record<string, unknown>> = [];
  const regions: Record<string, string[]> = {};
  const regionMeta: SketchRegionMeta[] = [];
  const geoms = new Map<string, NodeGeom>();
  const fonts = new Set<number>();
  let seq = 0;
  const uid = (prefix: string) => `${prefix}-${++seq}`;

  const tag = (id: string, r: string | string[] | undefined) => {
    const rs = list(r);
    if (rs.length) regions[id] = [...new Set([...(regions[id] ?? []), ...rs])];
  };

  const roundness = (shape: SketchShape) =>
    shape === "box" || shape === "cylinder"
      ? { type: 3 }
      : shape === "pill" || shape === "ellipse" || shape === "diamond"
        ? { type: 2 }
        : null;

  const api = {
    /** A named area. With geometry it is drawn as a dashed, tinted rectangle with a title. */
    region(id: string, input: RegionInput = {}) {
      const tone = input.tone ?? "neutral";
      regionMeta.push({ id, title: input.title, tone });
      if (input.x != null && input.y != null && input.w && input.h) {
        const rect = uid("region");
        elements.push({
          id: rect,
          type: "rectangle",
          x: input.x,
          y: input.y,
          width: input.w,
          height: input.h,
          strokeColor: PALETTE[tone].stroke,
          backgroundColor: input.fill === false ? "transparent" : PALETTE[tone].fill,
          fillStyle: "solid",
          strokeStyle: input.dashed === false ? "solid" : "dashed",
          strokeWidth: 1,
          roughness: baseRough,
          roundness: { type: 3 },
          opacity: 70,
        });
        tag(rect, id);
        if (input.title) {
          const size = input.size ?? Math.round(baseSize * 0.8);
          const t = uid("region-title");
          // Excalidraw sizes the text itself; for a right-hand title, estimate its width.
          const estimate = input.title.length * size * 0.56;
          const right = input.titleAt === "right";
          elements.push({
            id: t,
            type: "text",
            x: right ? input.x + input.w - 16 - estimate : input.x + 16,
            y: input.y + 10,
            text: input.title,
            fontSize: size,
            fontFamily: FONT[baseFont],
            strokeColor: PALETTE[tone].stroke,
            textAlign: right ? "right" : "left",
          });
          fonts.add(FONT[baseFont]);
          tag(t, id);
        }
      }
      return api;
    },

    /** A shape with a label. `shape: "text"` is a bare label with no box. */
    node(id: string, input: NodeInput) {
      const shape = input.shape ?? "box";
      const tone = input.tone ?? "ink";
      const font = FONT[input.font ?? baseFont];
      fonts.add(font);
      const size = input.size ?? baseSize;
      const w = input.w ?? 200;
      const h = input.h ?? 70;
      geoms.set(id, { x: input.x, y: input.y, w, h, shape });
      const textColor = PALETTE[input.textTone ?? "ink"].stroke;
      const common = {
        strokeColor: PALETTE[tone].stroke,
        backgroundColor: input.fill === "none" ? "transparent" : PALETTE[tone].fill,
        fillStyle: input.fill && input.fill !== "none" ? input.fill : "solid",
        strokeStyle: input.dashed ? "dashed" : "solid",
        strokeWidth: input.strokeWidth ?? (shape === "note" ? 1 : 2),
        roughness: input.rough ?? baseRough,
        opacity: input.opacity ?? 100,
      };
      if (shape === "text") {
        elements.push({
          id,
          type: "text",
          x: input.x,
          y: input.y,
          width: w,
          text: input.label ?? "",
          fontSize: size,
          fontFamily: font,
          strokeColor: PALETTE[input.textTone ?? tone].stroke,
          textAlign: input.align ?? "center",
        });
        tag(id, input.region);
        return api;
      }
      const label = input.label
        ? {
            text: input.label,
            fontSize: size,
            fontFamily: font,
            strokeColor: textColor,
            textAlign: input.align ?? "center",
            verticalAlign: "middle",
          }
        : undefined;
      if (shape === "cylinder") {
        // A rectangle with an ellipse lid: Excalidraw has no cylinder of its own.
        const lid = Math.max(14, Math.round(h * 0.22));
        elements.push({
          id,
          type: "rectangle",
          x: input.x,
          y: input.y + lid / 2,
          width: w,
          height: h - lid / 2,
          ...common,
          roundness: { type: 3 },
          label,
        });
        const top = `${id}-lid`;
        elements.push({
          id: top,
          type: "ellipse",
          x: input.x,
          y: input.y,
          width: w,
          height: lid,
          ...common,
          roundness: { type: 2 },
        });
        tag(id, input.region);
        tag(top, input.region);
        return api;
      }
      const type =
        shape === "ellipse" || shape === "pill"
          ? "ellipse"
          : shape === "diamond"
            ? "diamond"
            : "rectangle";
      elements.push({
        id,
        type,
        x: input.x,
        y: input.y,
        width: w,
        height: h,
        ...common,
        ...(shape === "note" ? { fillStyle: "solid", roughness: input.rough ?? 0 } : {}),
        roundness: shape === "note" ? null : roundness(shape),
        label,
      });
      tag(id, input.region);
      return api;
    },

    /** Free text. */
    text(id: string, input: TextInput) {
      const font = FONT[input.font ?? baseFont];
      fonts.add(font);
      elements.push({
        id,
        type: "text",
        x: input.x,
        y: input.y,
        ...(input.w ? { width: input.w } : {}),
        text: input.text,
        fontSize: input.size ?? baseSize,
        fontFamily: font,
        strokeColor: PALETTE[input.tone ?? "ink"].stroke,
        textAlign: input.align ?? "left",
      });
      tag(id, input.region);
      return api;
    },

    /** An arrow between two nodes, anchored on the facing sides unless told otherwise. */
    arrow(from: string, to: string, input: ArrowInput = {}) {
      const a = geoms.get(from);
      const b = geoms.get(to);
      if (!a || !b) throw new Error(`sketch: arrow ${from} → ${to} names an unknown node`);
      const [fromSide, toSide] = pickSides(a, b, input.from, input.to);
      const p0 = anchor(a, fromSide, input.fromShift ?? 0);
      const p1 = anchor(b, toSide, input.toShift ?? 0);
      const pts: Array<[number, number]> = [p0, ...(input.via ?? []), p1];
      const x = pts[0]![0];
      const y = pts[0]![1];
      const points = pts.map(([px, py]) => [px - x, py - y]);
      const id = uid("arrow");
      const tone = input.tone ?? "ink";
      const font = FONT[input.font ?? baseFont];
      if (input.label) fonts.add(font);
      elements.push({
        id,
        type: input.line ? "line" : "arrow",
        x,
        y,
        points,
        strokeColor: PALETTE[tone].stroke,
        strokeStyle: input.dotted ? "dotted" : input.dashed ? "dashed" : "solid",
        strokeWidth: input.strokeWidth ?? 2,
        roughness: baseRough,
        roundness: pts.length > 2 ? { type: 2 } : null,
        ...(input.line
          ? {}
          : {
              endArrowhead: "arrow",
              startArrowhead: input.both ? "arrow" : null,
            }),
        ...(input.label
          ? {
              label: {
                text: input.label,
                fontSize: input.size ?? Math.round(baseSize * 0.75),
                fontFamily: font,
                strokeColor: PALETTE[tone === "ink" ? "muted" : tone].stroke,
              },
            }
          : {}),
      });
      const rs = [...list(input.region), ...(regions[from] ?? []), ...(regions[to] ?? [])];
      tag(id, rs);
      return api;
    },

    build(): SketchScene {
      return {
        kind: "sketch",
        width,
        height,
        elements: elements.map((e) => ({ ...e })),
        regions: { ...regions },
        regionMeta: [...regionMeta],
        fonts: [...fonts],
      };
    },
  };
  return api;
}

function pickSides(a: NodeGeom, b: NodeGeom, from?: Side, to?: Side): [Side, Side] {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const f: Side = from ?? (horizontal ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top");
  const t: Side = to ?? (horizontal ? (dx > 0 ? "left" : "right") : dy > 0 ? "top" : "bottom");
  return [f, t];
}

/** A point on a node's side, a few pixels off the stroke so the arrowhead breathes. */
function anchor(g: NodeGeom, side: Side, shift: number): [number, number] {
  const gap = 6;
  const sx = (shift * g.w) / 2;
  const sy = (shift * g.h) / 2;
  switch (side) {
    case "left":
      return [g.x - gap, g.y + g.h / 2 + sy];
    case "right":
      return [g.x + g.w + gap, g.y + g.h / 2 + sy];
    case "top":
      return [g.x + g.w / 2 + sx, g.y - gap];
    case "bottom":
      return [g.x + g.w / 2 + sx, g.y + g.h + gap];
  }
}
