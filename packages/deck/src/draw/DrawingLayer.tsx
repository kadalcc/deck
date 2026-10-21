import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { z } from "zod";

import { readItem, writeItem } from "../core/storage.ts";
import { createStore, useStore } from "../core/store.ts";
import { createWindowBus } from "../core/windows.ts";
import { isEditable } from "../core/keyboard.ts";
import { EMPTY_ROOM, type RoomState, type Stroke } from "../live/protocol.ts";

const noRoom = createStore<RoomState>(EMPTY_ROOM);
import { useLiveOptional } from "../live/context.ts";
import { useCommand } from "../react/commands.ts";
import { useDeck } from "../react/context.ts";
import { useActions, useLayout, useNav, useUi } from "../react/hooks.ts";
import { type Doc, type DrawBusMessage, DrawingDoc } from "./doc.ts";
import { cutAll, sweep } from "./erase.ts";
import { type ShapeKind, shapeStroke, tooSmall } from "./shapes.ts";
import { canSaveFiles, drawingsOn, fileDrawings, saveSlide } from "./source.ts";
import { dedupe, StrokeView } from "./Strokes.tsx";
import {
  DRAW_COLORS,
  DRAW_SIZES,
  FADE_DWELL,
  fadeDuration,
  loadDrawings,
  newStroke,
  saveDrawings,
  simplify,
} from "./strokes.ts";
import { layerKey, parseLayerKey } from "./svg.ts";
import { DrawToolbar, type DrawTool, SIZE_STEPS, TOOLS } from "./Toolbar.tsx";

/**
 * Drawing and annotation on the current slide: pen and highlighter; line, arrow, rectangle and
 * ellipse (Shift keeps them straight or square); an eraser that takes whole strokes or cuts only
 * where it passes; any colour and width; undo, redo and clear. Strokes are kept in stage
 * coordinates so they line up on every screen size.
 *
 * Where they go (draw/doc.ts): the deck's other windows in this browser at once, over the window
 * bus; the room, when there is one, so every screen shows them; this browser's storage; and with
 * `drawings.persist: "files"` on the dev server, `drawings/<slide>.svg` beside deck.mdx (draw/
 * source.ts), which a build bundles so the hosted copy and every export carry them. Saved files
 * are the base layer, live strokes go on top. With `drawings.perClick` a stroke belongs to the
 * click step it was drawn on and shows from that step on.
 *
 * A stroke drifts through its colour's family as it travels (see `segmentsOf`). Unless the pin
 * is on, a stroke is a scribble: it lingers a few seconds after the pen lifts, then unwinds
 * along its own path — every screen does the same from the moment it saw the stroke, so nothing
 * more needs to cross the wire. Pinned strokes stay, persist, and can be undone or erased.
 *
 * A stylus draws without the mode being on; fingers and the mouse navigate. A stylus's eraser end
 * erases.
 *
 * `inCanvas`: rendered inside a scaled stage canvas (the presenter's current-slide box) rather
 * than over the viewport — it fills the canvas in stage pixels and its toolbar is portalled out.
 */
export function DrawingLayer({ inCanvas = false }: { inCanvas?: boolean } = {}) {
  const deck = useDeck();
  const layout = useLayout();
  const drawing = useUi((s) => s.drawing);
  const { h, v, click } = useNav((s) => ({ h: s.h, v: s.v, click: s.click }));
  const actions = useActions();
  const live = useLiveOptional();
  const cfg = deck.config.drawings;
  const slug = deck.config.slug || "deck";
  const enabled = drawingsOn(deck);
  const slide = `${h},${v}`;
  const active = cfg.perClick ? layerKey(h, v, click) : slide;
  // Without a room the play window is the presenter; with one, `presenterOnly` decides. A shared
  // window (the projector) takes no input.
  const canDraw = enabled && !deck.projector && (!cfg.presenterOnly || deck.isPresenter || !live);
  const files = fileDrawings(deck);
  const fileState = useStore(files.store);
  // On the dev server with `persist: "files"`, the files ARE the drawing: they are loaded into it
  // and every change is written back. Elsewhere they are a read-only layer under it.
  const filesMode = canDraw && cfg.persist === "files" && canSaveFiles(deck);
  const storageOn = canDraw && cfg.persist !== false && !filesMode;

  const liveRef = useRef(live);
  liveRef.current = live;
  const toastRef = useRef(actions.toast);
  toastRef.current = actions.toast;
  const gone = useRef(new Set<string>());
  const saveFailed = useRef(false);
  const [doc] = useState(
    () =>
      new DrawingDoc({
        windowId: `${deck.windowId}:${Math.random().toString(36).slice(2, 8)}`,
        // Only a window that draws has drawings of its own (and keeps them). A viewer in the same
        // browser mirrors the others alone — otherwise it would show the presenter's persisted
        // strokes as its own and nothing could clear them.
        initial: storageOn && cfg.persist ? loadDrawings(slug) : {},
        room: (m) => {
          const l = liveRef.current;
          if (l && (deck.isPresenter || cfg.syncAll)) l.client.send(m);
        },
        persist: storageOn ? (d) => saveDrawings(slug, d) : null,
        save: filesMode
          ? (s) => {
              const [sh, sv] = s.split(",").map(Number) as [number, number];
              const layers: Record<number, Stroke[]> = {};
              for (const [k, list] of Object.entries(doc.store.get())) {
                const p = parseLayerKey(k);
                if (p.slide === s) layers[p.click] = list;
              }
              saveSlide(deck, sh, sv, layers).catch(() => {
                // Fall back to this browser's storage, and say so once.
                saveDrawings(slug, doc.store.get());
                if (!saveFailed.current)
                  toastRef.current("Could not write drawings/ — kept in this browser instead");
                saveFailed.current = true;
              });
            }
          : null,
        alive: (s) => !gone.current.has(s.id),
      }),
  );
  const docState = useStore(doc.store);
  const version = useStore(doc.version);
  void version;
  useEffect(() => () => doc.flush(), [doc]);

  // This browser's other windows of the deck: what one draws, the others show.
  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;
    const bus = createWindowBus<DrawBusMessage>(`${slug}:draw`);
    const detach = doc.attach(bus);
    return () => {
      detach();
      bus.close();
    };
  }, [doc, slug, enabled]);

  // Files mode: the saved files become this window's drawing once they have loaded.
  const seeded = useRef(false);
  useEffect(() => {
    if (!filesMode || !fileState.loaded || seeded.current) return;
    seeded.current = true;
    const cur = doc.store.get();
    const next: Doc = {};
    for (const [k, list] of Object.entries(fileState.layers)) if (!cur[k]?.length) next[k] = list;
    doc.change(next, { history: false, share: false });
  }, [filesMode, fileState, doc]);

  const prefs = useRef(readPrefs(slug));
  const [tool, setToolState] = useState<DrawTool>(prefs.current.tool);
  const [color, setColor] = useState(prefs.current.color);
  const [size, setSize] = useState(prefs.current.size);
  const [keep, setKeep] = useState(prefs.current.keep);
  const [partial, setPartial] = useState(prefs.current.partial);
  useEffect(() => {
    writeItem(`deck.drawTools.${slug}`, JSON.stringify({ tool, color, size, keep, partial }));
  }, [slug, tool, color, size, keep, partial]);
  const setTool = (t: DrawTool) => setToolState(t);

  const [current, setCurrent] = useState<Stroke | null>(null);
  const [eraserAt, setEraserAt] = useState<[number, number] | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const remote = useStore(live?.client.state ?? noRoom, (s) => s.drawings);

  // Fading: when each fading stroke was first seen here, and how far each has unwound.
  const seen = useRef(new Map<string, number>());
  const [progress, setProgress] = useState<Record<string, number>>({});

  /* ── what is on this slide ─────────────────────────────────────────────── */

  const ofSlide = (k: string) => k === slide || k.startsWith(`${slide}@`);
  const shows = (k: string) => !cfg.perClick || parseLayerKey(k).click <= click;
  const keys = [
    ...new Set([
      ...Object.keys(fileState.layers),
      ...Object.keys(docState),
      ...Object.keys(remote),
    ]),
  ]
    .filter((k) => ofSlide(k) && shows(k))
    .sort((a, b) => parseLayerKey(a).click - parseLayerKey(b).click);
  const strokes = dedupe(
    keys.flatMap((k) => [
      filesMode ? [] : (fileState.layers[k] ?? []),
      docState[k] ?? [],
      remote[k] ?? [],
    ]),
  ).filter((s) => !gone.current.has(s.id));
  /** The layers this window may change on this slide (its own drawing, not the files or room). */
  const editable = keys.filter((k) => (docState[k] ?? []).length > 0 || k === active);

  const fadingKey = strokes
    .filter((s) => s.fade)
    .map((s) => s.id)
    .join(",");
  useEffect(() => {
    if (!fadingKey) return;
    const fading = strokes.filter((s) => s.fade);
    const now = performance.now();
    for (const s of fading) if (!seen.current.has(s.id)) seen.current.set(s.id, now);
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const t = performance.now();
      const next: Record<string, number> = {};
      const finished: string[] = [];
      let unwinding = false;
      let soonest = Number.POSITIVE_INFINITY;
      for (const s of fading) {
        const t0 = seen.current.get(s.id) ?? t;
        const p = (t - t0 - FADE_DWELL) / fadeDuration(s);
        if (p >= 1) finished.push(s.id);
        else if (p > 0) {
          next[s.id] = p;
          unwinding = true;
        } else soonest = Math.min(soonest, t0 + FADE_DWELL - t);
      }
      if (finished.length) {
        for (const id of finished) {
          gone.current.add(id);
          seen.current.delete(id);
        }
        const d = doc.store.get();
        const drop: Doc = {};
        for (const k of keys) {
          const list = d[k] ?? [];
          if (list.some((s) => finished.includes(s.id)))
            drop[k] = list.filter((s) => !finished.includes(s.id));
        }
        // Every window fades on its own clock: nothing to tell anyone, nothing to undo.
        doc.change(drop, { history: false, share: false });
        // The room's copy goes too, so a mirror mounted later (the joiner's full screen) never
        // brings a faded scribble back.
        live?.client.state.update((st) => {
          let changed = false;
          const drawings = { ...st.drawings };
          for (const k of keys) {
            const list = st.drawings[k] ?? [];
            if (!list.some((s) => finished.includes(s.id))) continue;
            drawings[k] = list.filter((s) => !finished.includes(s.id));
            changed = true;
          }
          return changed ? { ...st, drawings } : st;
        });
      }
      setProgress((prev) => {
        const a = Object.keys(prev);
        const b = Object.keys(next);
        if (a.length === b.length && a.every((k) => prev[k] === next[k])) return prev;
        return next;
      });
      if (unwinding) raf = requestAnimationFrame(tick);
      else if (Number.isFinite(soonest)) timer = setTimeout(tick, Math.max(16, soonest));
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the set of fading strokes
  }, [fadingKey, slide, click]);

  /* ── changes ───────────────────────────────────────────────────────────── */

  const add = (stroke: Stroke) => {
    doc.change({ [active]: [...doc.get(active), stroke] });
    return { id: stroke.id, points: stroke.points.length };
  };
  const undo = () => doc.undo(slide);
  const redo = () => doc.redo(slide);
  const clear = () => {
    const next: Doc = {};
    for (const k of editable) if (doc.get(k).length) next[k] = [];
    doc.change(next);
  };
  const nextId = () => newStroke("pen", "", 1).id;

  /* ── the pointer ───────────────────────────────────────────────────────── */

  const toStage = (clientX: number, clientY: number): [number, number] => {
    const rect = svg.current!.getBoundingClientRect();
    return [
      Math.round(((clientX - rect.left) / rect.width) * deck.config.width * 10) / 10,
      Math.round(((clientY - rect.top) / rect.height) * deck.config.height * 10) / 10,
    ];
  };
  const eraserRadius = Math.max(10, size * 1.5 + 6);

  /**
   * A gesture, from the pointer going down to it lifting. Moves and the lift are heard on the
   * window, so a stroke that leaves the slide (or a stylus that started with the mode off) ends.
   */
  const gesture = useRef<{
    id: number;
    tool: DrawTool;
    start: [number, number];
    last: [number, number];
    stroke: Stroke | null;
    /** The eraser's layers as they were when it went down: one undo step for the whole sweep. */
    before: Doc | null;
  } | null>(null);

  const begin = (e: PointerEvent | React.PointerEvent, using: DrawTool) => {
    const p = toStage(e.clientX, e.clientY);
    const g = {
      id: e.pointerId,
      tool: using,
      start: p,
      last: p,
      stroke: null as Stroke | null,
      before: null as Doc | null,
    };
    if (using === "eraser") {
      g.before = Object.fromEntries(editable.map((k) => [k, doc.get(k)]));
      erase(p, p);
    } else if (using === "pen" || using === "highlighter") {
      g.stroke = newStroke(using, color, size, !keep);
      g.stroke.points.push(p);
    } else {
      g.stroke = shapeStroke(newStroke("pen", color, size, !keep), using as ShapeKind, p, p);
    }
    gesture.current = g;
    setCurrent(g.stroke);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== g.id) return;
      const q = toStage(ev.clientX, ev.clientY);
      if (g.tool === "eraser") {
        erase(g.last, q);
        setEraserAt(q);
      } else if (g.stroke && !g.stroke.shape) {
        g.stroke = { ...g.stroke, points: [...g.stroke.points, q] };
        setCurrent(g.stroke);
      } else if (g.stroke?.shape) {
        g.stroke = shapeStroke(g.stroke, g.stroke.shape, g.start, q, ev.shiftKey);
        setCurrent(g.stroke);
      }
      g.last = q;
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== g.id) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      gesture.current = null;
      setCurrent(null);
      if (g.tool === "eraser") {
        if (ev.pointerType !== "mouse") setEraserAt(null);
        // The sweep went into the drawing as it moved; now it is one step to undo, and shared.
        const before = g.before ?? {};
        const after: Doc = {};
        for (const k of Object.keys(before)) after[k] = doc.get(k);
        doc.change(before, { history: false, share: false });
        doc.change(after);
        return;
      }
      const s = g.stroke;
      if (!s) return;
      if (s.shape) {
        if (!tooSmall(s.shape, g.start, g.last)) add(s);
      } else add({ ...s, points: simplify(s.points) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  /** One stretch of an eraser sweep, applied at once (shared when the sweep ends). */
  const erase = (from: [number, number], to: [number, number]) => {
    const next: Doc = {};
    for (const k of editable) {
      const list = doc.get(k);
      if (!list.length) continue;
      if (partial) {
        let out = list;
        const steps = Math.max(
          1,
          Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / (eraserRadius / 2)),
        );
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          out = cutAll(
            out,
            [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t],
            eraserRadius,
            nextId,
          );
        }
        if (out !== list) next[k] = out;
      } else {
        const hit = new Set(sweep(list, from, to, eraserRadius));
        if (hit.size) next[k] = list.filter((s) => !hit.has(s.id));
      }
    }
    doc.change(next, { history: false, share: false });
  };

  const onDown = (e: React.PointerEvent) => {
    if (!canDraw || e.button !== 0 || gesture.current) return;
    // A stylus's eraser end erases whatever tool is picked.
    const stylusEraser = e.pointerType === "pen" && (e.buttons & 32) !== 0;
    if (!drawing && e.pointerType !== "pen") return;
    e.preventDefault();
    // Captured, so a drag that crosses text (the presenter's notes) draws instead of selecting it.
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    begin(e, stylusEraser ? "eraser" : tool);
  };
  const onHover = (e: React.PointerEvent) => {
    if (tool === "eraser" && drawing && !gesture.current)
      setEraserAt(toStage(e.clientX, e.clientY));
  };

  // A stylus draws with the mode off: the layer takes no pointer events then, so it listens on
  // the window for a pen that touches down on the slide.
  useEffect(() => {
    if (!canDraw || drawing) return;
    const onPen = (e: PointerEvent) => {
      if (e.pointerType !== "pen" || gesture.current || !svg.current) return;
      const r = svg.current.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        return;
      e.preventDefault();
      begin(e, (e.buttons & 32) !== 0 ? "eraser" : tool === "eraser" ? "pen" : tool);
    };
    window.addEventListener("pointerdown", onPen, true);
    return () => window.removeEventListener("pointerdown", onPen, true);
  });

  /* ── commands: the phone remote and agents ─────────────────────────────── */

  // Coordinates are 0–1 across the slide; strokes land in stage pixels like any other.
  const at = (x: number, y: number): [number, number] => [
    x * deck.config.width,
    y * deck.config.height,
  ];
  const style = z.object({
    tool: z.enum(["pen", "highlighter"]).optional(),
    color: z
      .string()
      .optional()
      .describe(`a CSS colour; the palette is ${DRAW_COLORS.join(" ")}`),
    size: z.number().min(1).max(48).optional().describe("stroke width in slide pixels"),
    keep: z
      .boolean()
      .optional()
      .describe("keep the stroke; by default it fades a few seconds after it is drawn"),
  });
  const penStroke = useRef<{
    stroke: Stroke | null;
    start: [number, number];
    erase: boolean;
  } | null>(null);
  const strokeOf = (p: z.infer<typeof style>) =>
    newStroke(
      p.tool ?? (tool === "highlighter" ? "highlighter" : "pen"),
      p.color ?? color,
      p.size ?? size,
      !(p.keep ?? keep),
    );
  useCommand(
    canDraw
      ? {
          id: "draw.undo",
          title: "Undo",
          description:
            "Undo the last change to this slide's drawing: a stroke, a shape, an erase or a clear.",
          group: "draw",
          keys: "Ctrl Z",
          enabled: () => doc.canUndo(slide),
          run: () => ({ undone: undo() }),
        }
      : null,
  );
  useCommand(
    canDraw
      ? {
          id: "draw.redo",
          title: "Redo",
          description: "Put back what the last undo on this slide took away.",
          group: "draw",
          keys: "Ctrl Shift Z",
          enabled: () => doc.canRedo(slide),
          run: () => ({ redone: redo() }),
        }
      : null,
  );
  useCommand(
    canDraw
      ? {
          id: "draw.clear",
          title: "Clear drawing",
          description: "Remove every stroke on this slide (undo brings them back).",
          group: "draw",
          keys: "Shift C",
          run: () => clear(),
        }
      : null,
  );
  useCommand(
    canDraw
      ? {
          id: "draw.tool",
          title: "Drawing tool",
          description:
            "Pick the pen's tool, colour, width, and whether strokes stay. Tools: pen, highlighter, line, arrow, rect, ellipse, eraser.",
          group: "draw",
          params: z.object({
            tool: z
              .enum(["pen", "highlighter", "line", "arrow", "rect", "ellipse", "eraser"])
              .optional(),
            color: z.string().optional(),
            size: z.number().min(1).max(48).optional(),
            keep: z.boolean().optional(),
            partial: z.boolean().optional().describe("the eraser cuts only where it passes"),
          }),
          run: (p) => {
            if (p.tool) setTool(p.tool);
            if (p.color) setColor(p.color);
            if (p.size) setSize(p.size);
            if (p.keep !== undefined) setKeep(p.keep);
            if (p.partial !== undefined) setPartial(p.partial);
            return { tool: p.tool ?? tool, color: p.color ?? color, size: p.size ?? size };
          },
        }
      : null,
  );
  useCommand(
    canDraw
      ? {
          id: "draw.pen",
          title: "Live pen",
          description:
            "Draw as a finger moves: phase start at the first point, move for each next one, end to lift the pen. `shape` drags a line, arrow, rect or ellipse instead; `erase` erases along the path. For the phone remote's touchpad.",
          group: "draw",
          params: style.extend({
            phase: z.enum(["start", "move", "end"]),
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            shape: z.enum(["line", "arrow", "rect", "ellipse"]).optional(),
            erase: z.boolean().optional(),
          }),
          run: (p) => {
            // The stroke in progress lives in a ref: committing from inside a state updater ran
            // twice under StrictMode and left two strokes with one id.
            const q = at(p.x, p.y);
            if (p.phase === "start") {
              if (p.erase) {
                const before = Object.fromEntries(editable.map((k) => [k, doc.get(k)]));
                penStroke.current = { stroke: null, start: q, erase: true };
                erase(q, q);
                eraseBefore.current = before;
                return null;
              }
              const s = p.shape ? shapeStroke(strokeOf(p), p.shape, q, q) : strokeOf(p);
              if (!p.shape) s.points.push(q);
              penStroke.current = { stroke: s, start: q, erase: false };
              setCurrent(s);
              return null;
            }
            const c = penStroke.current;
            if (!c) return null;
            if (c.erase) {
              erase(c.start, q);
              c.start = q;
              if (p.phase === "end") {
                penStroke.current = null;
                const before = eraseBefore.current ?? {};
                eraseBefore.current = null;
                const after: Doc = {};
                for (const k of Object.keys(before)) after[k] = doc.get(k);
                doc.change(before, { history: false, share: false });
                doc.change(after);
              }
              return null;
            }
            const s = c.stroke!;
            const next = s.shape
              ? shapeStroke(s, s.shape, c.start, q)
              : { ...s, points: [...s.points, q] };
            if (p.phase === "end") {
              penStroke.current = null;
              setCurrent(null);
              if (next.shape) return tooSmall(next.shape, c.start, q) ? null : add(next);
              return add({ ...next, points: simplify(next.points) });
            }
            c.stroke = next;
            setCurrent(next);
            return null;
          },
        }
      : null,
  );
  const eraseBefore = useRef<Doc | null>(null);
  useCommand(
    canDraw
      ? {
          id: "draw.shape",
          title: "Mark the slide",
          description:
            "Draw a circle (a hand-drawn loop) around, a box around, an underline below, or an arrow pointing at a region of the slide; or a straight line or an exact ellipse across it. The region is x, y, w, h from 0 to 1. Use deck.slide to read what is where first.",
          group: "draw",
          params: style.extend({
            shape: z.enum(["circle", "box", "underline", "arrow", "line", "ellipse"]),
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            w: z.number().min(0).max(1),
            h: z.number().min(0).max(1),
          }),
          run: (p) => {
            const s = strokeOf(p);
            const [x, y] = at(p.x, p.y);
            const [w, h] = at(p.w, p.h);
            if (p.shape === "box") return add(shapeStroke(s, "rect", [x, y], [x + w, y + h]));
            if (p.shape === "line") return add(shapeStroke(s, "line", [x, y], [x + w, y + h]));
            if (p.shape === "ellipse")
              return add(shapeStroke(s, "ellipse", [x, y], [x + w, y + h]));
            if (p.shape === "arrow") {
              // From below-left of the region to its centre.
              const from: [number, number] = [
                Math.max(0, x - 120),
                Math.min(deck.config.height, y + h + 120),
              ];
              return add(shapeStroke(s, "arrow", from, [x + w / 2, y + h / 2]));
            }
            const pts: [number, number][] = [];
            if (p.shape === "circle") {
              const cx = x + w / 2;
              const cy = y + h / 2;
              // A hand-drawn loop: slightly more than once round, so it reads as drawn.
              for (let i = 0; i <= 52; i++) {
                const t = (i / 48) * Math.PI * 2 - Math.PI / 2;
                pts.push([cx + (w / 2 + 6) * Math.cos(t), cy + (h / 2 + 6) * Math.sin(t)]);
              }
            } else {
              for (let i = 0; i <= 12; i++)
                pts.push([x + (w * i) / 12, y + h + 6 + Math.sin(i) * 1.5]);
            }
            s.points = simplify(pts);
            return add(s);
          },
        }
      : null,
  );

  /* ── keys, while the pen is on ─────────────────────────────────────────── */

  // In the capture phase, so a key the pen uses (Esc, a digit) never reaches the deck's own keys.
  useEffect(() => {
    if (!drawing || !canDraw) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const u = deck.ui.get();
      if (u.jump || u.search || u.hints || u.help) return;
      const mod = e.ctrlKey || e.metaKey;
      let handled = true;
      if (e.code === "KeyZ" && mod && e.shiftKey) redo();
      else if (e.code === "KeyY" && mod) redo();
      else if (e.code === "KeyZ" && mod) undo();
      else if (e.code === "KeyC" && e.shiftKey && !mod) clear();
      else if (e.code === "Escape") actions.toggleDrawing(false);
      else if (mod || e.altKey) handled = false;
      else if (e.code === "KeyE") setTool(tool === "eraser" ? "pen" : "eraser");
      else if (/^Digit[1-7]$/.test(e.code)) setTool(TOOLS[Number(e.code.slice(5)) - 1]!.tool);
      else if (e.code === "BracketLeft" || e.code === "BracketRight") {
        setSize(
          e.code === "BracketRight"
            ? (SIZE_STEPS.find((s) => s > size) ?? SIZE_STEPS[SIZE_STEPS.length - 1]!)
            : ([...SIZE_STEPS].reverse().find((s) => s < size) ?? SIZE_STEPS[0]!),
        );
      } else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!enabled) return null;

  const toolbar = (
    <DrawToolbar
      tool={tool}
      setTool={setTool}
      color={color}
      setColor={setColor}
      size={size}
      setSize={setSize}
      keep={keep}
      setKeep={setKeep}
      partial={partial}
      setPartial={setPartial}
      canUndo={doc.canUndo(slide)}
      canRedo={doc.canRedo(slide)}
      onUndo={undo}
      onRedo={redo}
      onClear={clear}
      onDone={() => actions.toggleDrawing(false)}
    />
  );

  const on = drawing && canDraw;
  return (
    <>
      <svg
        ref={svg}
        className="deck-drawing"
        data-tool={on ? tool : undefined}
        viewBox={`0 0 ${deck.config.width} ${deck.config.height}`}
        style={
          inCanvas
            ? {
                left: 0,
                top: 0,
                width: deck.config.width,
                height: deck.config.height,
                pointerEvents: on ? "auto" : "none",
              }
            : {
                left: layout.left,
                top: layout.top,
                width: layout.width,
                height: layout.height,
                pointerEvents: on ? "auto" : "none",
              }
        }
        onPointerDown={onDown}
        onPointerMove={onHover}
        onPointerLeave={() => !gesture.current && setEraserAt(null)}
        aria-hidden
      >
        {[...strokes, ...(current ? [current] : [])].map((s) => (
          <StrokeView key={s.id} stroke={s} progress={progress[s.id] ?? 0} />
        ))}
        {on && tool === "eraser" && eraserAt ? (
          <circle className="deck-draw-eraser" cx={eraserAt[0]} cy={eraserAt[1]} r={eraserRadius} />
        ) : null}
      </svg>
      {on
        ? inCanvas
          ? createPortal(<div className="deck-draw-toolbar-host">{toolbar}</div>, document.body)
          : toolbar
        : null}
    </>
  );
}

/** The last tool, colour and width this browser drew with on this deck. */
function readPrefs(slug: string): {
  tool: DrawTool;
  color: string;
  size: number;
  keep: boolean;
  partial: boolean;
} {
  const fallback = {
    tool: "pen" as DrawTool,
    color: DRAW_COLORS[0]!,
    size: DRAW_SIZES[1]!,
    keep: false,
    partial: false,
  };
  try {
    const raw = readItem(`deck.drawTools.${slug}`);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<typeof fallback>;
    const tools = TOOLS.map((t) => t.tool) as string[];
    return {
      tool: typeof p.tool === "string" && tools.includes(p.tool) ? p.tool : fallback.tool,
      color: typeof p.color === "string" && p.color.length < 40 ? p.color : fallback.color,
      size: typeof p.size === "number" && p.size >= 1 && p.size <= 48 ? p.size : fallback.size,
      keep: typeof p.keep === "boolean" ? p.keep : false,
      partial: typeof p.partial === "boolean" ? p.partial : false,
    };
  } catch {
    return fallback;
  }
}
