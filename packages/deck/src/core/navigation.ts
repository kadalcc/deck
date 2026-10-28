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

/** Where a slide is: its column and row, and optionally the step (the slide-number helpers). */
type At = Pick<Position, "h" | "v"> & { click?: number };

export interface NavState extends Position {
  direction: Direction;
  overview: boolean;
  paused: boolean;
  autoSliding: boolean;
  /** Per visible slide: how many clicks the runtime has registered (by "h,v"). */
  totals: Record<string, number>;
  /**
   * Slides whose total is not final yet: something on them that will take steps is still
   * loading (core/clicks.ts, `hold`). A step pressed on one is kept in `queued`, not taken as
   * "no steps left, next slide".
   */
  held?: Record<string, true>;
  /** Steps pressed on a held slide, taken once it lets go (`reportSlide`). */
  queued?: { at: string; count: number } | null;
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

/**
 * The step a slide opens at (frontmatter `clicksStart`): arriving lands there rather than on 0, and
 * stepping back stops there. The click registry numbers the slide's steps from it too.
 */
export function clickFloor(columns: Column[], h: number, v: number): number {
  const start = Number(columns[h]?.slides[v]?.frontmatter?.clicksStart ?? 0);
  return Number.isFinite(start) && start > 0 ? Math.floor(start) : 0;
}

export function clampPosition(columns: Column[], p: Partial<Position>): Position {
  const h = Math.min(Math.max(0, p.h ?? 0), Math.max(0, columns.length - 1));
  const col = columns[h];
  const v = Math.min(Math.max(0, p.v ?? 0), Math.max(0, (col?.slides.length ?? 1) - 1));
  return { h, v, click: Math.max(clickFloor(columns, h, v), p.click ?? 0) };
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
    prevClick: state.click > clickFloor(columns, state.h, state.v),
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
            : // On the same slide, a jump to a later step is a step forward and an earlier one a
              // step back (a [click] marker in the notes, the overview's step slider).
              p.click > state.click
              ? "forward"
              : p.click < state.click
                ? "back"
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
  const k = key(state.h, state.v);
  const total = state.totals[k] ?? 0;
  if (state.click >= total && state.held?.[k]) {
    // The slide's steps are not all known yet: keep the press for when they are.
    const count = state.queued?.at === k ? state.queued.count + 1 : 1;
    return { ...state, queued: { at: k, count } };
  }
  if (state.click < total)
    return { ...state, click: state.click + 1, direction: "forward", seq: state.seq + 1 };
  return state;
}

export function prevClick(state: NavState, floor = 0): NavState {
  if (state.click > floor)
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
  const unclicked = prevClick(state, clickFloor(columns, state.h, state.v));
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

/**
 * Whether a slide counts towards the slide number, the total and the progress bar. reveal.js's
 * `data-visibility="uncounted"` (frontmatter `visibility: uncounted`) leaves it out: an appendix
 * or a backup slide after the end that the audience should not see as "slide 31 of 34".
 */
export function isCounted(slide: { frontmatter: Record<string, unknown> } | undefined): boolean {
  return slide?.frontmatter.visibility !== "uncounted";
}

/**
 * What a slide reports about its steps: the total so far, and whether something on it still holds
 * the total open. When the slide shown lets go, the steps pressed meanwhile are taken now, against
 * the total it really has — so a step that loaded late is still a step, not skipped.
 */
export function reportSlide(
  state: NavState,
  h: number,
  v: number,
  report: { total: number; held: boolean },
  columns: Column[],
  config: DeckConfig,
): NavState {
  const k = key(h, v);
  let s = setTotal(state, h, v, report.total);
  if (!!s.held?.[k] === report.held) return s;
  const held = { ...s.held };
  if (report.held) held[k] = true;
  else delete held[k];
  s = { ...s, held };
  if (report.held || s.queued?.at !== k) return s;
  const count = s.queued.count;
  s = { ...s, queued: null };
  if (s.h !== h || s.v !== v) return s;
  for (let i = 0; i < count; i++) s = next(s, columns, config);
  return s;
}

/** How many slides count (reveal.js's `getTotalSlides`): the visible ones, less the uncounted. */
export function countedSlides(columns: Column[]): number {
  let n = 0;
  for (const c of columns) for (const s of c.slides) if (isCounted(s)) n++;
  return n;
}

/** The counted slides before this one in reading order (reveal.js's `getSlidePastCount`). */
export function pastCount(columns: Column[], h: number, v: number): number {
  let n = 0;
  for (let i = 0; i < columns.length && i <= h; i++) {
    const slides = columns[i]!.slides;
    const end = i < h ? slides.length : Math.min(v, slides.length);
    for (let j = 0; j < end; j++) if (isCounted(slides[j])) n++;
  }
  return n;
}

/** 0 at the first slide, 1 at the last counted one (and on any uncounted slide after it). */
export function progressOf(state: At, columns: Column[]): number {
  const total = countedSlides(columns);
  if (total <= 1) return 1;
  return Math.min(pastCount(columns, state.h, state.v) / (total - 1), 1);
}

/**
 * Format the slide number the way reveal.js does. Uncounted slides are left out of `c` and `c/t`;
 * an uncounted slide itself shows the number of the counted slide before it, and in `h.v` and
 * `h/v` its column without the 1 added — both reveal.js's `horizontalOffset` rule.
 */
export function formatSlideNumber(
  format: true | "h.v" | "h/v" | "c" | "c/t",
  state: At,
  columns: Column[],
  oneBased = true,
): string {
  const counted = isCounted(columns[state.h]?.slides[state.v]);
  const offset = oneBased && counted ? 1 : 0;
  const flat = pastCount(columns, state.h, state.v) + offset;
  const hasVertical = columns.some((c) => c.slides.length > 1);
  const v = state.v + (oneBased ? 1 : 0);
  switch (format) {
    case "c":
      return String(flat);
    case "c/t":
      return `${flat} / ${countedSlides(columns)}`;
    case "h/v":
      return hasVertical && state.v > 0 ? `${state.h + offset} / ${v}` : String(state.h + offset);
    default:
      return hasVertical && state.v > 0 ? `${state.h + offset}.${v}` : String(state.h + offset);
  }
}

/** The `slideNumber` option as deck.config.ts may give it: a format or a function. */
type SlideNumberOption = DeckConfig["slideNumber"];

const warned = new WeakSet<object>();

/**
 * The slide number this deck draws for a slide, or null when it draws none (`slideNumber: false`).
 * `true` is reveal.js's default, `h.v`. A function (deck.config.ts) is called with the slide's
 * position and returns one string, or reveal.js's three (`[h, ".", v]`), drawn joined; one that
 * throws or returns nothing falls back to `h.v` so a typo never blanks the counter.
 */
export function slideNumberText(
  option: SlideNumberOption,
  at: At,
  columns: Column[],
): string | null {
  if (!option) return null;
  if (typeof option !== "function")
    return formatSlideNumber(option === true ? "h.v" : option, at, columns);
  try {
    const slide = columns[at.h]?.slides[at.v];
    let index = 0;
    for (let i = 0; i < at.h; i++) index += columns[i]!.slides.length;
    const out = option({
      h: at.h,
      v: at.v,
      click: at.click ?? 0,
      index: index + at.v,
      total: columns.reduce((n, c) => n + c.slides.length, 0),
      id: slide?.id ?? null,
    });
    const text = Array.isArray(out) ? out.map(String).join("") : out == null ? "" : String(out);
    if (text) return text;
  } catch (err) {
    if (!warned.has(option)) {
      warned.add(option);
      console.warn("[deck] the slideNumber function threw; drawing h.v instead", err);
    }
  }
  return formatSlideNumber("h.v", at, columns);
}

/**
 * Whether the slide number is drawn in a view (`slideNumber`, `showSlideNumber`), reveal.js's
 * rule: `all` everywhere — the deck, its printed pages and the speaker view; `print` only on the
 * printed pages (and so in `kadal-deck export`'s PDF); `speaker` only in the speaker view.
 */
export function slideNumberShown(
  config: Pick<DeckConfig, "slideNumber" | "showSlideNumber">,
  view: "play" | "print" | "speaker",
): boolean {
  if (!config.slideNumber) return false;
  return config.showSlideNumber === "all" || config.showSlideNumber === view;
}

/** The interval `A` uses on a deck that configures none, so the key always does something. */
export const DEFAULT_AUTO_SLIDE_MS = 5000;

/**
 * How long the current slide waits before auto-slide moves on, or null when it does not move.
 *
 * reveal.js's rule: a slide's own `autoSlide` wins — and `0` there means "this one waits for you"
 * — then the deck's. A slide-level interval works on a deck that sets none, and a deck that sets
 * nothing anywhere still steps every few seconds once the viewer turns it on with `A`.
 */
export function autoSlideDelay(
  slideMs: number | null,
  deckMs: number,
  configuredAnywhere: boolean,
): number | null {
  if (slideMs !== null) return slideMs > 0 ? slideMs : null;
  if (deckMs > 0) return deckMs;
  return configuredAnywhere ? null : DEFAULT_AUTO_SLIDE_MS;
}
