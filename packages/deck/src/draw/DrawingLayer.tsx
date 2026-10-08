import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "../components/bling.tsx";
import { createStore, useStore } from "../core/store.ts";
import { EMPTY_ROOM, type RoomState, type Stroke } from "../live/protocol.ts";

const noRoom = createStore<RoomState>(EMPTY_ROOM);
import { useLiveOptional } from "../live/context.ts";
import { useDeck } from "../react/context.ts";
import { useActions, useLayout, useNav, useUi } from "../react/hooks.ts";
import {
  DRAW_COLORS,
  DRAW_SIZES,
  FADE_DWELL,
  fadeDuration,
  loadDrawings,
  newStroke,
  saveDrawings,
  segmentsOf,
  simplify,
  swatchGradient,
} from "./strokes.ts";

/**
 * Drawing and annotation on the current slide: pen and highlighter, colours, sizes, undo, clear.
 * Strokes are kept in stage coordinates so they line up on every screen size, persisted per
 * deck in localStorage, and — when the room is live — sent to the room so every window shows
 * them. A stylus draws without the mode being on; fingers and the mouse navigate.
 *
 * A stroke drifts through its colour's family as it travels (see `segmentsOf`). Unless the pin
 * is on, a stroke is a scribble: it lingers a few seconds after the pen lifts, then unwinds
 * along its own path — every screen does the same from the moment it saw the stroke, so nothing
 * more needs to cross the wire. Pinned strokes stay, persist, and can be undone or cleared.
 *
 * `inCanvas`: rendered inside a scaled stage canvas (the presenter's current-slide box) rather
 * than over the viewport — it fills the canvas in stage pixels and its toolbar is portalled out.
 */
export function DrawingLayer({ inCanvas = false }: { inCanvas?: boolean } = {}) {
  const deck = useDeck();
  const layout = useLayout();
  const drawing = useUi((s) => s.drawing);
  const { h, v } = useNav((s) => ({ h: s.h, v: s.v }));
  const actions = useActions();
  const live = useLiveOptional();
  const slideKey = `${h},${v}`;
  // Without a room the play window is the presenter; with one, `presenterOnly` decides.
  const canDraw =
    deck.config.drawings.enabled &&
    (!deck.config.drawings.presenterOnly || deck.isPresenter || !live);
  // Only a window that draws has drawings of its own (and keeps them in localStorage). A viewer
  // in the same browser mirrors the room alone — otherwise it would show the presenter's
  // persisted strokes as its own and nothing could clear them.
  const [local, setLocal] = useState<Record<string, Stroke[]>>(() =>
    canDraw && deck.config.drawings.persist ? loadDrawings(deck.config.slug || "deck") : {},
  );
  const [tool, setTool] = useState<Stroke["tool"]>("pen");
  const [color, setColor] = useState(DRAW_COLORS[0]!);
  const [size, setSize] = useState(DRAW_SIZES[1]!);
  const [keep, setKeep] = useState(false);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const remote = useStore(live?.client.state ?? noRoom, (s) => s.drawings);

  // Fading: when each fading stroke was first seen here, how far each has unwound, and the
  // remote ones that have finished (local ones are simply dropped from `local`).
  const seen = useRef(new Map<string, number>());
  const gone = useRef(new Set<string>());
  const [progress, setProgress] = useState<Record<string, number>>({});

  const mine = local[slideKey] ?? [];
  const strokes = [
    ...mine,
    ...(remote[slideKey] ?? []).filter((r) => !mine.some((l) => l.id === r.id)),
  ].filter((s) => !gone.current.has(s.id));

  useEffect(() => {
    if (canDraw && deck.config.drawings.persist) saveDrawings(deck.config.slug || "deck", local);
  }, [local, canDraw, deck.config.drawings.persist, deck.config.slug]);

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
        setLocal((d) => {
          const list = d[slideKey] ?? [];
          if (!list.some((s) => finished.includes(s.id))) return d;
          return { ...d, [slideKey]: list.filter((s) => !finished.includes(s.id)) };
        });
        // The room's copy goes too, so a mirror mounted later (the joiner's full screen) never
        // brings a faded scribble back.
        live?.client.state.update((st) => {
          const list = st.drawings[slideKey] ?? [];
          if (!list.some((s) => finished.includes(s.id))) return st;
          return {
            ...st,
            drawings: { ...st.drawings, [slideKey]: list.filter((s) => !finished.includes(s.id)) },
          };
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
  }, [fadingKey, slideKey]);

  const toStage = (e: React.PointerEvent): [number, number] => {
    const rect = svg.current!.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * deck.config.width,
      ((e.clientY - rect.top) / rect.height) * deck.config.height,
    ];
  };

  const onDown = (e: React.PointerEvent) => {
    if (!canDraw) return;
    if (!drawing && e.pointerType !== "pen") return;
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const s = newStroke(tool, color, size, !keep);
    s.points.push(toStage(e));
    setCurrent(s);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!current) return;
    setCurrent({ ...current, points: [...current.points, toStage(e)] });
  };
  const onUp = () => {
    if (!current) return;
    const done = { ...current, points: simplify(current.points) };
    setCurrent(null);
    setLocal((d) => ({ ...d, [slideKey]: [...(d[slideKey] ?? []), done] }));
    if (live && (deck.isPresenter || deck.config.drawings.syncAll))
      live.client.send({ type: "draw", slide: slideKey, stroke: done });
  };
  const undo = () => {
    setLocal((d) => ({ ...d, [slideKey]: (d[slideKey] ?? []).slice(0, -1) }));
    if (live && (deck.isPresenter || deck.config.drawings.syncAll))
      live.client.send({ type: "draw:undo", slide: slideKey });
  };
  const clear = () => {
    setLocal((d) => ({ ...d, [slideKey]: [] }));
    if (live && (deck.isPresenter || deck.config.drawings.syncAll))
      live.client.send({ type: "draw:clear", slide: slideKey });
  };

  // Keyboard: Shift+C clears, Ctrl/Cmd+Z undoes — routed through the deck's actions by name.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!drawing) return;
      if (e.code === "KeyC" && e.shiftKey) clear();
      if (e.code === "KeyZ" && (e.ctrlKey || e.metaKey)) undo();
      if (e.code === "Escape") actions.toggleDrawing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!deck.config.drawings.enabled) return null;

  const toolbar = (
    <div className="deck-draw-toolbar" role="toolbar" aria-label="Drawing tools">
      <button
        type="button"
        className={tool === "pen" ? "is-on" : ""}
        onClick={() => setTool("pen")}
        title="Pen"
        aria-label="Pen"
      >
        <Icon name="pencil" />
      </button>
      <button
        type="button"
        className={tool === "highlighter" ? "is-on" : ""}
        onClick={() => setTool("highlighter")}
        title="Highlighter"
        aria-label="Highlighter"
      >
        <Icon name="highlighter" />
      </button>
      <span className="deck-draw-sep" />
      {DRAW_COLORS.map((c) => (
        <button
          type="button"
          key={c}
          className={["deck-draw-color", color === c ? "is-on" : ""].join(" ")}
          onClick={() => setColor(c)}
          aria-label={c}
        >
          <span className="deck-draw-swatch" style={{ background: swatchGradient(c) }} />
        </button>
      ))}
      <span className="deck-draw-sep" />
      {DRAW_SIZES.map((s) => (
        <button
          type="button"
          key={s}
          className={size === s ? "is-on" : ""}
          onClick={() => setSize(s)}
          title={`Size ${s}`}
        >
          <span className="deck-draw-dot" style={{ width: s + 4, height: s + 4 }} />
        </button>
      ))}
      <span className="deck-draw-sep" />
      <button
        type="button"
        className={keep ? "is-on" : ""}
        onClick={() => setKeep((k) => !k)}
        title={
          keep
            ? "Strokes stay on the slide — click to let them fade"
            : "Strokes fade after a moment — click to keep them"
        }
        aria-label={keep ? "Strokes stay" : "Strokes fade"}
      >
        <Icon name={keep ? "pin" : "pin-off"} />
      </button>
      <button type="button" onClick={undo} title="Undo (Ctrl Z)" aria-label="Undo">
        <Icon name="undo-2" />
      </button>
      <button type="button" onClick={clear} title="Clear (Shift C)" aria-label="Clear">
        <Icon name="eraser" />
      </button>
      <button
        type="button"
        onClick={() => actions.toggleDrawing(false)}
        title="Done (Esc)"
        aria-label="Done"
      >
        <Icon name="check" />
      </button>
    </div>
  );

  return (
    <>
      <svg
        ref={svg}
        className="deck-drawing"
        viewBox={`0 0 ${deck.config.width} ${deck.config.height}`}
        style={
          inCanvas
            ? {
                left: 0,
                top: 0,
                width: deck.config.width,
                height: deck.config.height,
                pointerEvents: drawing && canDraw ? "auto" : "none",
              }
            : {
                left: layout.left,
                top: layout.top,
                width: layout.width,
                height: layout.height,
                pointerEvents: drawing && canDraw ? "auto" : "none",
              }
        }
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-hidden
      >
        {[...strokes, ...(current ? [current] : [])].map((s) => {
          const p = progress[s.id] ?? 0;
          const from = p > 0 ? Math.floor(p * s.points.length) : 0;
          const wide = s.tool === "highlighter";
          return (
            <g
              key={s.id}
              opacity={p > 0 ? 1 - p * 0.35 : 1}
              style={wide ? { mixBlendMode: "multiply" } : undefined}
            >
              {segmentsOf(s, from).map((seg, i) => (
                <path
                  key={i}
                  d={seg.d}
                  stroke={seg.color}
                  strokeWidth={wide ? s.size * 3 : s.size}
                  strokeOpacity={wide ? 0.35 : 1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
            </g>
          );
        })}
      </svg>
      {drawing && canDraw
        ? inCanvas
          ? createPortal(<div className="deck-draw-toolbar-host">{toolbar}</div>, document.body)
          : toolbar
        : null}
    </>
  );
}
