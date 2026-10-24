/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TELEPROMPTER, AS DATA  —  its settings, its scrolling, the screens it can go to
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The page is presenter/Teleprompter.tsx and the button that opens it presenter/TeleprompterControl
 * .tsx; what either decides without a browser is here, so it can be tested without one:
 *
 *   prefs        text size, line width, mirror, reading guide, auto-scroll and its speed, scheme —
 *                one JSON string in localStorage, read back defensively (a hand-edited value, an
 *                older version's, gives the defaults for what it got wrong and keeps the rest)
 *   autoScroll   how far a classic prompter's scroll moves in a frame, at a speed and text size
 *   screens      the Window Management API's screens as a list to choose from, the one chosen
 *                last time found again, and the `window.open` features that put a window on one
 *   throttle     at most one call per interval, the last one always landing (the presenter's
 *                state to the teleprompter, ~4 a second)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ── settings ────────────────────────────────────────────────────────────── */

export type LineWidth = "narrow" | "medium" | "wide";

export interface TeleprompterPrefs {
  /** Text size in px. */
  size: number;
  width: LineWidth;
  /** Flipped left to right, for the glass of a beam-splitter prompter. */
  mirror: boolean;
  /** The band across the reading line. */
  guide: boolean;
  /** Scrolling by itself, as a classic prompter does. */
  auto: boolean;
  /** 1 (a crawl) to 10. */
  speed: number;
  /** Dark is the prompter's own high contrast; light is the deck's light scheme. */
  scheme: "dark" | "light";
}

export const PREFS_KEY = "deck.teleprompter.prefs";
export const SIZE_MIN = 20;
export const SIZE_MAX = 96;
export const SPEED_MIN = 1;
export const SPEED_MAX = 10;

export const DEFAULT_PREFS: TeleprompterPrefs = {
  size: 44,
  width: "medium",
  mirror: false,
  guide: true,
  auto: false,
  speed: 3,
  scheme: "dark",
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function parsePrefs(raw: string | null): TeleprompterPrefs {
  let v: Partial<Record<keyof TeleprompterPrefs, unknown>> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) v = parsed as typeof v;
  } catch {
    /* the defaults */
  }
  const d = DEFAULT_PREFS;
  const num = (x: unknown, lo: number, hi: number, fallback: number) =>
    typeof x === "number" && Number.isFinite(x) ? clamp(Math.round(x), lo, hi) : fallback;
  const bool = (x: unknown, fallback: boolean) => (typeof x === "boolean" ? x : fallback);
  return {
    size: num(v.size, SIZE_MIN, SIZE_MAX, d.size),
    width: v.width === "narrow" || v.width === "medium" || v.width === "wide" ? v.width : d.width,
    mirror: bool(v.mirror, d.mirror),
    guide: bool(v.guide, d.guide),
    // Never scrolling by itself on arrival: a window that opens moving is a window that lost the
    // speaker's place before they found it. The speed is remembered; the motion is not.
    auto: false,
    speed: num(v.speed, SPEED_MIN, SPEED_MAX, d.speed),
    scheme: v.scheme === "light" ? "light" : "dark",
  };
}

export const serializePrefs = (p: TeleprompterPrefs): string => JSON.stringify(p);

/** A step of A− / A+: bigger steps where the text is already big. */
export function nextSize(size: number, dir: 1 | -1): number {
  const step = size >= 56 ? 8 : 4;
  return clamp(size + dir * step, SIZE_MIN, SIZE_MAX);
}

/** The reading column's width, in characters: what the eye can take in without turning the head. */
export const LINE_WIDTH_CH: Record<LineWidth, number> = { narrow: 28, medium: 40, wide: 60 };

/* ── auto-scroll ─────────────────────────────────────────────────────────── */

/**
 * Pixels a second at a speed: speed 1 crawls about a line every three seconds, 10 runs about two
 * lines a second, and both scale with the text, so a bigger size reads at the same words a minute.
 */
export function scrollRate(speed: number, size: number): number {
  const s = clamp(speed, SPEED_MIN, SPEED_MAX);
  const line = size * 1.35;
  return line * (0.3 + (s - 1) * 0.19);
}

/**
 * One frame's movement. `carry` keeps the fraction of a pixel a frame could not move (scrollTop
 * rounds), so a slow crawl still crawls. With reduced motion there is no glide: the text waits,
 * then moves a whole line at once — the same pace, read in steps.
 */
export function autoScrollStep(input: {
  speed: number;
  size: number;
  dtMs: number;
  carry: number;
  reduced: boolean;
}): { move: number; carry: number } {
  // A frame after a stall (a hidden tab, a debugger) is not a reason to jump a page.
  const dt = clamp(input.dtMs, 0, 100) / 1000;
  const total = input.carry + scrollRate(input.speed, input.size) * dt;
  const unit = input.reduced ? Math.round(input.size * 1.35) : 1;
  const move = Math.floor(total / unit) * unit;
  return { move, carry: total - move };
}

/* ── screens ─────────────────────────────────────────────────────────────── */

/** The parts of a `ScreenDetailed` (Window Management API) the chooser reads. */
export interface ScreenLike {
  label?: string;
  availLeft?: number;
  availTop?: number;
  availWidth: number;
  availHeight: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  isPrimary?: boolean;
  isInternal?: boolean;
}

export interface ScreenChoice {
  /** Found again by this next time (label and geometry: two identical monitors differ by place). */
  key: string;
  label: string;
  /** "1920 × 1080" */
  size: string;
  primary: boolean;
  /** The screen this window (the presenter view) is on. */
  current: boolean;
  place: WindowPlace;
}

/** Where a window goes, in screen coordinates. */
export interface WindowPlace {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const SCREEN_KEY = "deck.teleprompter.screen";

const int = (n: number | undefined) => Math.round(Number.isFinite(n) ? (n as number) : 0);

export function screenKey(s: ScreenLike): string {
  return [
    s.label ?? "",
    int(s.left ?? s.availLeft),
    int(s.top ?? s.availTop),
    int(s.width ?? s.availWidth),
    int(s.height ?? s.availHeight),
  ].join("|");
}

/** The screens as choices, the current one first, then the primary, then left to right. */
export function screenChoices(
  screens: readonly ScreenLike[],
  current?: ScreenLike | null,
): ScreenChoice[] {
  const currentKey = current ? screenKey(current) : null;
  const list = screens.map((s, i) => ({
    key: screenKey(s),
    label: s.label?.trim() || (s.isInternal ? "Built-in display" : `Screen ${i + 1}`),
    size: `${int(s.width ?? s.availWidth)} × ${int(s.height ?? s.availHeight)}`,
    primary: !!s.isPrimary,
    current: screenKey(s) === currentKey,
    place: {
      left: int(s.availLeft ?? s.left),
      top: int(s.availTop ?? s.top),
      width: int(s.availWidth),
      height: int(s.availHeight),
    },
  }));
  return list.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      Number(b.primary) - Number(a.primary) ||
      a.place.left - b.place.left ||
      a.place.top - b.place.top,
  );
}

/**
 * The screen to open on without asking (the keyboard, an agent): the one chosen last time if it is
 * still there; otherwise another screen than this one — the teleprompter is for a second display —
 * and null when this is the only one.
 */
export function preferredScreen(
  choices: readonly ScreenChoice[],
  remembered: string | null,
): ScreenChoice | null {
  const again = remembered ? choices.find((c) => c.key === remembered) : undefined;
  if (again) return again;
  return choices.find((c) => !c.current) ?? null;
}

/** `window.open` features for a popup that fills a place (or a plain, draggable one). */
export function windowFeatures(place: WindowPlace | null): string {
  if (!place) return "popup,width=1100,height=760";
  const p = {
    left: int(place.left),
    top: int(place.top),
    width: Math.max(320, int(place.width)),
    height: Math.max(240, int(place.height)),
  };
  return `popup,left=${p.left},top=${p.top},width=${p.width},height=${p.height}`;
}

/* ── throttle ────────────────────────────────────────────────────────────── */

export interface Throttled {
  (): void;
  /** Now, whatever the interval (an answer to a teleprompter that just asked). */
  flush(): void;
  cancel(): void;
}

/**
 * At most one call of `fn` per `ms`: the first at once, any that arrive meanwhile folded into one
 * at the end of the interval, so the last change always lands.
 */
export function throttle(
  fn: () => void,
  ms: number,
  clock: {
    now: () => number;
    set: (fn: () => void, ms: number) => unknown;
    clear: (t: unknown) => void;
  } = {
    now: () => Date.now(),
    set: (f, t) => setTimeout(f, t),
    clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  },
): Throttled {
  let last = -Infinity;
  let timer: unknown = null;
  const run = () => {
    timer = null;
    last = clock.now();
    fn();
  };
  const call = (() => {
    if (timer !== null) return;
    const wait = last + ms - clock.now();
    if (wait <= 0) run();
    else timer = clock.set(run, wait);
  }) as Throttled;
  call.flush = () => {
    if (timer !== null) clock.clear(timer);
    run();
  };
  call.cancel = () => {
    if (timer !== null) clock.clear(timer);
    timer = null;
  };
  return call;
}
