import {
  type CSSProperties,
  type ElementType,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { type ClickAt, isCurrent, isShown } from "../core/clicks.ts";
import { useDeck, useSlideOptional } from "../react/context.ts";
import { useRenderContext } from "../react/render-context.ts";
import { Arrow } from "./content.tsx";
import { useClickPoints } from "./click-points.ts";
import {
  type ArrowPos,
  type DragBox,
  formatArrowPos,
  formatDragPos,
  parseArrowPos,
  parseDragPos,
  resizeBox,
  rotateTowards,
} from "./drag-geometry.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Drag> and <DragArrow>  —  elements you place by hand (Slidev's v-drag / v-drag-arrow)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <Drag pos="1420,120,360,_">…</Drag>        x, y, width, height (`_`: as tall as it needs), [rotation]
 *   <Drag pos="logo">…</Drag>                  a name: the slide's frontmatter `dragPos: { logo: "…" }`
 *   <Drag>…</Drag>                             where it lies; the first drag writes a position
 *   <DragArrow pos="200,300,400,-120" />       from (200, 300) by (400, −120), Slidev's way
 *   <img v-drag="'logo'" src="…" />            Slidev's directive works too (compiler/remark-drag.ts)
 *
 * In `kadal-deck dev`, double-click one on the slide being shown (the deck, or the presenter's
 * current slide) and it can be moved, resized from any corner or edge (Shift keeps the
 * proportions), turned by the round handle above it (Shift snaps to 15°), and nudged with the
 * arrow keys (Shift: 10 px). Esc, Enter or a click elsewhere ends it. Each change is saved into
 * deck.mdx a moment later through `/__kadal/drag` (vite/drag-dev.ts → authoring/edit.ts): the
 * frontmatter entry for a named one, the tag's own `pos` otherwise — nothing else in the file
 * moves, and the page is not reloaded. Everywhere else — a built deck, the hosted shell, print,
 * thumbnails — it is simply placed.
 *
 * With `at` (and `hide`, `effect`) it is also a click step, as `<Click>` is.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Positions saved in this page, by slide and element: a slide that is left and come back to
 * would otherwise mount with the position it was compiled with, until the next reload.
 */
const saved = new Map<string, string>();

interface DragSource {
  /** Where the position lives: a frontmatter name, or the element's place among the slide's. */
  target: { name: string } | { index: number };
  /** The position as the source writes it (undefined: none). */
  written: string | undefined;
  key: string;
}

function useDragSource(pos: string | undefined, index: unknown): DragSource {
  const slide = useSlideOptional();
  const named = pos && !pos.includes(",") ? pos.trim() : null;
  const fm = slide?.meta.frontmatter.dragPos;
  const table = fm && typeof fm === "object" ? (fm as Record<string, unknown>) : {};
  const fromFm = named ? table[named] : undefined;
  const written = named ? (fromFm === undefined ? undefined : String(fromFm)) : pos;
  const n = Number(index);
  return {
    target: named ? { name: named } : { index: Number.isInteger(n) ? n : -1 },
    written,
    key: `${slide?.meta.index ?? "?"}:${named ?? `#${index}`}`,
  };
}

/** May this element be edited here: `kadal-deck dev`, the slide being shown, not a thumbnail. */
function useCanEdit(source: DragSource): boolean {
  const deck = useDeck();
  const slide = useSlideOptional();
  const where = useRenderContext();
  return (
    !!deck.manifest.dragApi &&
    !where.print &&
    (where.context === "slide" || where.context === "presenter") &&
    !!slide?.active &&
    !slide.preview &&
    !deck.projector &&
    ("name" in source.target || source.target.index >= 0)
  );
}

/** Save a position, a moment after the last change (and only the last). */
function useSaver(source: DragSource) {
  const deck = useDeck();
  const slide = useSlideOptional();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the source says now, as far as this page knows: the "expected" of the next save.
  const last = useRef((saved.get(source.key) ?? source.written ?? "").trim());
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const save = useCallback(
    (pos: string) => {
      saved.set(source.key, pos);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const api = deck.manifest.dragApi;
        if (!api || !slide) return;
        setStatus("saving");
        const body =
          "name" in source.target
            ? { slide: slide.meta.index, pos, name: source.target.name }
            : { slide: slide.meta.index, pos, index: source.target.index, expected: last.current };
        try {
          const r = await fetch(api, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          if (!r.ok) throw new Error(j.error ?? `The dev server answered ${r.status}.`);
          last.current = pos;
          setStatus("saved");
        } catch (e) {
          setStatus("error");
          deck.actions.toast(`Position not saved: ${e instanceof Error ? e.message : String(e)}`);
        }
      }, 350);
    },
    [deck, slide, source.key, JSON.stringify(source.target)],
  );
  return { save, status };
}

/** Stage coordinates (the element's containing block, unscaled) from client coordinates. */
function stageMapper(el: Element) {
  const parent = ((el as HTMLElement).offsetParent as HTMLElement | null) ?? el.parentElement!;
  const r = parent.getBoundingClientRect();
  const scale = r.width / (parent.offsetWidth || r.width) || 1;
  return {
    scale,
    at: (cx: number, cy: number) => ({
      x: (cx - r.left) / scale - parent.clientLeft,
      y: (cy - r.top) / scale - parent.clientTop,
    }),
  };
}

/** While editing: arrow keys, Esc/Enter, and a click elsewhere — ahead of the deck's own keys. */
function useEditingKeys(
  editing: boolean,
  el: React.RefObject<Element | null>,
  stop: () => void,
  nudge: (dx: number, dy: number) => void,
) {
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[e.key];
      if (!move && e.key !== "Escape" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (move) nudge(move[0], move[1]);
      else stop();
    };
    const onDown = (e: PointerEvent) => {
      if (el.current && !el.current.contains(e.target as Node)) stop();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", stop);
    };
  }, [editing, el, stop, nudge]);
}

const HANDLES: Array<{ id: string; sx: -1 | 0 | 1; sy: -1 | 0 | 1; cursor: string }> = [
  { id: "nw", sx: -1, sy: -1, cursor: "nwse-resize" },
  { id: "n", sx: 0, sy: -1, cursor: "ns-resize" },
  { id: "ne", sx: 1, sy: -1, cursor: "nesw-resize" },
  { id: "e", sx: 1, sy: 0, cursor: "ew-resize" },
  { id: "se", sx: 1, sy: 1, cursor: "nwse-resize" },
  { id: "s", sx: 0, sy: 1, cursor: "ns-resize" },
  { id: "sw", sx: -1, sy: 1, cursor: "nesw-resize" },
  { id: "w", sx: -1, sy: 0, cursor: "ew-resize" },
];

export interface DragProps {
  /** "x,y,w,h[,r]" in stage pixels (`_` height: automatic), or a name in the frontmatter's `dragPos`. */
  pos?: string;
  /** A click step, as `<Click at>`. */
  at?: ClickAt;
  /** Start shown and hide at the step. */
  hide?: boolean;
  /** The reveal effect with `at` (see `<Click effect>`). */
  effect?: string;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  [key: string]: unknown;
}

export function Drag({
  pos,
  at,
  hide,
  effect = "fade-in",
  as,
  className,
  style,
  children,
  ...rest
}: DragProps) {
  const slide = useSlideOptional();
  const source = useDragSource(pos, rest["data-drag-index"]);
  const canEdit = useCanEdit(source);
  const { save, status } = useSaver(source);
  const [box, setBox] = useState<DragBox | null>(() =>
    parseDragPos(saved.get(source.key) ?? source.written),
  );
  // A recompiled deck (a reload, a hot update) with a new position written: show that one.
  useEffect(() => {
    if (!saved.has(source.key)) setBox(parseDragPos(source.written));
  }, [source.written, source.key]);
  const [editing, setEditing] = useState(false);
  const el = useRef<HTMLElement>(null);
  const k = useRef(1);
  const ranges = useClickPoints(at !== undefined || hide ? [{ at, hide }] : []);
  const range = ranges[0];
  const click = slide?.click ?? 0;
  const shown = range ? isShown(range, click) : true;

  const commit = useCallback(
    (next: DragBox) => {
      setBox(next);
      save(formatDragPos(next));
    },
    [save],
  );
  const stop = useCallback(() => setEditing(false), []);
  const nudge = useCallback(
    (dx: number, dy: number) =>
      setBox((b) => {
        if (!b) return b;
        const next = { ...b, x: b.x + dx, y: b.y + dy };
        save(formatDragPos(next));
        return next;
      }),
    [save],
  );
  useEditingKeys(editing, el, stop, nudge);
  useEffect(() => {
    if (!canEdit) setEditing(false);
  }, [canEdit]);

  const begin = (e: React.MouseEvent) => {
    if (!canEdit || !el.current) return;
    e.preventDefault();
    e.stopPropagation();
    const node = el.current;
    k.current = 1 / stageMapper(node).scale;
    // First edit of an unplaced element: it starts where it lies.
    if (!box) setBox({ x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: null, r: 0 });
    setEditing(true);
  };

  /** One gesture: pointer captured, `apply` given the start box and the pointer in stage px. */
  const gesture =
    (
      apply: (
        start: DragBox & { h: number },
        p: { x: number; y: number },
        e: PointerEvent,
        from: { x: number; y: number },
      ) => DragBox,
    ) =>
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!editing || !box || !el.current || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const map = stageMapper(el.current);
      const start = { ...box, h: box.h ?? el.current.offsetHeight };
      const from = map.at(e.clientX, e.clientY);
      const auto = box.h === null;
      let last: DragBox = box;
      const move = (ev: PointerEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        const next = apply(start, map.at(ev.clientX, ev.clientY), ev, from);
        last = auto && next.h === start.h ? { ...next, h: null } : next;
        setBox(last);
      };
      const up = (ev: PointerEvent) => {
        ev.stopPropagation();
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        if (last !== box) commit(last);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    };

  const onMove = gesture((start, p, _ev, from) => ({
    ...start,
    x: start.x + p.x - from.x,
    y: start.y + p.y - from.y,
  }));

  const Tag = (as ?? "div") as ElementType;
  const placed: CSSProperties = box
    ? {
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h ?? undefined,
        transform: box.r ? `rotate(${box.r}deg)` : undefined,
      }
    : {};
  return (
    <Tag
      {...rest}
      ref={el}
      className={[
        "deck-drag",
        "deck-absolute",
        range ? `deck-click effect-${effect}` : "",
        range ? (shown ? "is-shown" : "is-hidden") : "",
        range && isCurrent(range, click) ? "is-current" : "",
        canEdit ? "is-editable" : "",
        editing ? "is-editing" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...style, ...placed, ...(editing ? { "--drag-k": k.current } : null) }}
      data-click-at={range?.start}
      aria-hidden={shown ? undefined : true}
      onDoubleClick={canEdit && !editing ? begin : undefined}
      onPointerDown={editing ? onMove : undefined}
      title={canEdit && !editing ? "Double-click to move, resize or turn" : undefined}
    >
      {children}
      {editing && box ? (
        <span className="deck-drag-controls" aria-hidden>
          {HANDLES.filter((h) => box.h !== null || h.sy === 0).map((h) => (
            <span
              key={h.id}
              className={`deck-drag-handle is-${h.id}`}
              style={{ cursor: h.cursor }}
              onPointerDown={gesture((start, p, ev) =>
                resizeBox(start, h.sx, h.sy, p, { ratio: ev.shiftKey && !!h.sx && !!h.sy }),
              )}
            />
          ))}
          <span
            className="deck-drag-rotate"
            onPointerDown={gesture((start, p, ev) => ({
              ...start,
              r: rotateTowards(start, p, ev.shiftKey),
            }))}
          />
          <span className={`deck-drag-label is-${status}`}>
            {Math.round(box.x)}, {Math.round(box.y)} · {Math.round(box.w)}×
            {box.h === null ? "auto" : Math.round(box.h)}
            {box.r ? ` · ${Math.round(box.r)}°` : ""}
            {status === "saving"
              ? " · saving"
              : status === "saved"
                ? " · saved"
                : status === "error"
                  ? " · not saved"
                  : ""}
          </span>
        </span>
      ) : null}
    </Tag>
  );
}

export interface DragArrowProps {
  /** "x,y,dx,dy": from (x, y) by (dx, dy), stage pixels — or a frontmatter `dragPos` name. */
  pos?: string;
  /** Line width (px). */
  width?: number;
  color?: string;
  twoWay?: boolean;
  at?: ClickAt;
  hide?: boolean;
  effect?: string;
  className?: string;
  [key: string]: unknown;
}

const DEFAULT_ARROW = "100,100,300,300";

/** Slidev's `<v-drag-arrow>`: an `<Arrow>` whose ends are dragged into place in `kadal-deck dev`. */
export function DragArrow({
  pos,
  width = 2,
  color = "currentColor",
  twoWay = false,
  at,
  hide,
  effect = "fade-in",
  className,
  ...rest
}: DragArrowProps) {
  const slide = useSlideOptional();
  const source = useDragSource(pos, rest["data-drag-index"]);
  const canEdit = useCanEdit(source);
  const { save, status } = useSaver(source);
  const parse = (t: string | undefined) => parseArrowPos(t) ?? parseArrowPos(DEFAULT_ARROW)!;
  const [a, setA] = useState<ArrowPos>(() => parse(saved.get(source.key) ?? source.written));
  useEffect(() => {
    if (!saved.has(source.key)) setA(parse(source.written));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.written, source.key]);
  const [editing, setEditing] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const ranges = useClickPoints(at !== undefined || hide ? [{ at, hide }] : []);
  const range = ranges[0];
  const click = slide?.click ?? 0;
  const shown = range ? isShown(range, click) : true;
  const stop = useCallback(() => setEditing(false), []);
  const nudge = useCallback(
    (dx: number, dy: number) =>
      setA((p) => {
        const next = { x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy };
        save(formatArrowPos(next));
        return next;
      }),
    [save],
  );
  useEditingKeys(editing, host, stop, nudge);
  useEffect(() => {
    if (!canEdit) setEditing(false);
  }, [canEdit]);

  const drag = (which: "start" | "end" | "both") => (e: ReactPointerEvent<SVGElement>) => {
    if (!editing || !host.current || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const map = stageMapper(host.current);
    const from = map.at(e.clientX, e.clientY);
    const start = a;
    let last = a;
    const move = (ev: PointerEvent) => {
      ev.stopPropagation();
      const p = map.at(ev.clientX, ev.clientY);
      const dx = p.x - from.x;
      const dy = p.y - from.y;
      last = {
        x1: which === "end" ? start.x1 : start.x1 + dx,
        y1: which === "end" ? start.y1 : start.y1 + dy,
        x2: which === "start" ? start.x2 : start.x2 + dx,
        y2: which === "start" ? start.y2 : start.y2 + dy,
      };
      setA(last);
    };
    const up = (ev: PointerEvent) => {
      ev.stopPropagation();
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      if (last !== start) save(formatArrowPos(last));
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const pad = 24;
  const minX = Math.min(a.x1, a.x2) - pad;
  const minY = Math.min(a.y1, a.y2) - pad;
  const w = Math.abs(a.x2 - a.x1) + pad * 2;
  const h = Math.abs(a.y2 - a.y1) + pad * 2;
  const k = host.current ? 1 / stageMapper(host.current).scale : 1;
  return (
    <div
      ref={host}
      className={[
        "deck-drag-arrow",
        range ? `deck-click effect-${effect}` : "",
        range ? (shown ? "is-shown" : "is-hidden") : "",
        editing ? "is-editing" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-click-at={range?.start}
      aria-hidden={shown ? undefined : true}
    >
      <Arrow x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} width={width} color={color} twoWay={twoWay} />
      {canEdit ? (
        <svg
          className="deck-drag-arrow-hit"
          style={{ left: minX, top: minY, width: w, height: h }}
          viewBox={`${minX} ${minY} ${w} ${h}`}
        >
          <line
            x1={a.x1}
            y1={a.y1}
            x2={a.x2}
            y2={a.y2}
            className="deck-drag-arrow-line"
            onDoubleClick={() => setEditing(true)}
            onPointerDown={editing ? drag("both") : undefined}
          >
            <title>Double-click to drag the arrow's ends</title>
          </line>
          {editing ? (
            <>
              <circle
                cx={a.x1}
                cy={a.y1}
                r={7 * k}
                className="deck-drag-arrow-end"
                onPointerDown={drag("start")}
              />
              <circle
                cx={a.x2}
                cy={a.y2}
                r={7 * k}
                className="deck-drag-arrow-end"
                onPointerDown={drag("end")}
              />
            </>
          ) : null}
        </svg>
      ) : null}
      {editing ? (
        <span
          className={`deck-drag-label is-${status}`}
          style={{ left: minX + pad, top: minY + pad / 2 - 28 * k }}
        >
          {formatArrowPos(a)}
          {status === "saving"
            ? " · saving"
            : status === "saved"
              ? " · saved"
              : status === "error"
                ? " · not saved"
                : ""}
        </span>
      ) : null}
    </div>
  );
}
