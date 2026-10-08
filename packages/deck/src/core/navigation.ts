import type { Column, DeckConfig } from "./model.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NAVIGATION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Where the deck is and how it got there. `click` is the step within a slide (reveal.js's
 * fragment index, Slidev's click); `direction` is what the transition reads. Everything is a pure
 * function of the state and the click totals the runtime reports, so the presenter window, the
 * live room and the keyboard all drive the same reducer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Direction = "none" | "forward" | "back" | "up" | "down";

export interface Position {
  h: number;
  v: number;
  click: number;
}

export interface NavState extends Position {
  direction: Direction;
  overview: boolean;
  paused: boolean;
  autoSliding: boolean;
  /** Per visible slide: how many clicks the runtime has registered (by "h,v"). */
  totals: Record<string, number>;
  /** The position the presenter is at, when this window follows one and is not the presenter. */
  presenter: Position | null;
  /** Whether this window follows the presenter's navigation. */
  follow: boolean;
  /** A visible slide id → clamped ok; set by `goto` for hash routing. */
  seq: number;
}

export const key = (h: number, v: number) => `${h},${v}`;

export function initialNav(): NavState {
  return {
    h: 0,
    v: 0,
    click: 0,
    direction: "none",
    overview: false,
    paused: false,
    autoSliding: false,
    totals: {},
    presenter: null,
    follow: true,
    seq: 0,
  };
}

export function clampPosition(columns: Column[], p: Partial<Position>): Position {
  const h = Math.min(Math.max(0, p.h ?? 0), Math.max(0, columns.length - 1));
  const col = columns[h];
  const v = Math.min(Math.max(0, p.v ?? 0), Math.max(0, (col?.slides.length ?? 1) - 1));
  return { h, v, click: Math.max(0, p.click ?? 0) };
}

export interface Routes {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  prevClick: boolean;
  nextClick: boolean;
}

export function availableRoutes(state: NavState, columns: Column[], config: DeckConfig): Routes {
  const col = columns[state.h];
  const total = state.totals[key(state.h, state.v)] ?? 0;
  const left = state.h > 0 || config.loop;
  const right = state.h < columns.length - 1 || config.loop;
  return {
    left: config.rtl ? right : left,
    right: config.rtl ? left : right,
    up: state.v > 0,
    down: !!col && state.v < col.slides.length - 1,
    prevClick: state.click > 0,
    nextClick: state.click < total,
  };
}

function step(
  state: NavState,
  next: Partial<Position>,
  direction: Direction,
  columns: Column[],
): NavState {
  const p = clampPosition(columns, { ...state, ...next });
  return { ...state, ...p, direction, seq: state.seq + 1 };
}

/** Move to an exact position (a hash, a link, the presenter). Clicks default to 0. */
export function goto(state: NavState, columns: Column[], to: Partial<Position>): NavState {
  const p = clampPosition(columns, {
    h: to.h ?? state.h,
    v: to.v ?? state.v,
    click: to.click ?? 0,
  });
  const direction: Direction =
    p.h > state.h
      ? "forward"
      : p.h < state.h
        ? "back"
        : p.v > state.v
          ? "down"
          : p.v < state.v
            ? "up"
            : "none";
  return { ...state, ...p, direction, seq: state.seq + 1 };
}

export function right(state: NavState, columns: Column[], config: DeckConfig): NavState {
  const last = columns.length - 1;
  if (state.h < last) {
    const v =
      config.navigationMode === "grid"
        ? Math.min(state.v, columns[state.h + 1]!.slides.length - 1)
        : 0;
    return step(state, { h: state.h + 1, v, click: 0 }, "forward", columns);
  }
  if (config.loop) return step(state, { h: 0, v: 0, click: 0 }, "forward", columns);
  return state;
}

export function left(state: NavState, columns: Column[], config: DeckConfig): NavState {
  if (state.h > 0) {
    const col = columns[state.h - 1]!;
    const v =
      config.navigationMode === "grid"
        ? Math.min(state.v, col.slides.length - 1)
        : config.navigationMode === "linear"
          ? col.slides.length - 1
          : 0;
    return step(state, { h: state.h - 1, v, click: 0 }, "back", columns);
  }
  if (config.loop) {
    const h = columns.length - 1;
    return step(state, { h, v: 0, click: 0 }, "back", columns);
  }
  return state;
}

export function down(state: NavState, columns: Column[]): NavState {
  const col = columns[state.h];
  if (col && state.v < col.slides.length - 1)
    return step(state, { v: state.v + 1, click: 0 }, "down", columns);
  return state;
}

export function up(state: NavState, columns: Column[]): NavState {
  if (state.v > 0) return step(state, { v: state.v - 1, click: 0 }, "up", columns);
  return state;
}

export function nextClick(state: NavState): NavState {
  const total = state.totals[key(state.h, state.v)] ?? 0;
  if (state.click < total)
    return { ...state, click: state.click + 1, direction: "forward", seq: state.seq + 1 };
  return state;
}

export function prevClick(state: NavState): NavState {
  if (state.click > 0)
    return { ...state, click: state.click - 1, direction: "back", seq: state.seq + 1 };
  return state;
}

/**
 * `next`: the next click, else the slide beneath, else the next column. In linear mode the deck
 * reads like a book: every vertical slide is a page. Matches reveal.js's space bar.
 */
export function next(state: NavState, columns: Column[], config: DeckConfig): NavState {
  const clicked = nextClick(state);
  if (clicked !== state) return clicked;
  const routes = availableRoutes(state, columns, config);
  if (routes.down) return down(state, columns);
  if (config.rtl ? routes.left : routes.right)
    return config.rtl ? left(state, columns, config) : right(state, columns, config);
  return state;
}

/** `prev`: the previous click, else the slide above, else the previous column. */
export function prev(
  state: NavState,
  columns: Column[],
  config: DeckConfig,
  opts: { toLastClick?: boolean } = {},
): NavState {
  const unclicked = prevClick(state);
  if (unclicked !== state) return unclicked;
  const routes = availableRoutes(state, columns, config);
  let moved: NavState = state;
  if (routes.up) moved = up(state, columns);
  else if (config.rtl ? routes.right : routes.left)
    moved = config.rtl ? right(state, columns, config) : left(state, columns, config);
  if (moved === state) return state;
  // Going backwards lands on the last click of the slide, so stepping back replays it in reverse.
  if (opts.toLastClick !== false) {
    const total = moved.totals[key(moved.h, moved.v)] ?? 0;
    return { ...moved, click: total };
  }
  return moved;
}

export function first(state: NavState, columns: Column[]): NavState {
  return step(state, { h: 0, v: 0, click: 0 }, "back", columns);
}

export function last(state: NavState, columns: Column[]): NavState {
  const h = Math.max(0, columns.length - 1);
  const v = Math.max(0, (columns[h]?.slides.length ?? 1) - 1);
  return step(state, { h, v, click: 0 }, "forward", columns);
}

/** Record the click total the runtime found for a slide; clamps the current click if needed. */
export function setTotal(state: NavState, h: number, v: number, total: number): NavState {
  const k = key(h, v);
  if (state.totals[k] === total) return state;
  const totals = { ...state.totals, [k]: total };
  const click = h === state.h && v === state.v ? Math.min(state.click, total) : state.click;
  return { ...state, totals, click };
}

/** 0 at the first slide, 1 at the last. */
export function progressOf(state: NavState, columns: Column[]): number {
  const total = columns.reduce((n, c) => n + c.slides.length, 0);
  if (total <= 1) return 1;
  let flat = 0;
  for (let i = 0; i < state.h; i++) flat += columns[i]!.slides.length;
  flat += state.v;
  return flat / (total - 1);
}

/** Format the slide number the way reveal.js does. */
export function formatSlideNumber(
  format: true | "h.v" | "h/v" | "c" | "c/t",
  state: Position,
  columns: Column[],
  oneBased = true,
): string {
  const offset = oneBased ? 1 : 0;
  const flat = (() => {
    let n = 0;
    for (let i = 0; i < state.h; i++) n += columns[i]!.slides.length;
    return n + state.v + offset;
  })();
  const total = columns.reduce((n, c) => n + c.slides.length, 0);
  const hasVertical = columns.some((c) => c.slides.length > 1);
  switch (format) {
    case "c":
      return String(flat);
    case "c/t":
      return `${flat} / ${total}`;
    case "h/v":
      return hasVertical && state.v > 0
        ? `${state.h + offset} / ${state.v + offset}`
        : String(state.h + offset);
    default:
      return hasVertical && state.v > 0
        ? `${state.h + offset}.${state.v + offset}`
        : String(state.h + offset);
  }
}
