/**
 * The air pointer's arithmetic, kept free of the DOM so it can be tested: turning the phone into
 * a point on the slide, smoothing the jitter out of it, and sending no more than the wire needs.
 */

import { notesForClick } from "../core/notes-markers.ts";

/** An angle folded into (-180, 180], so 359° → -1° and a turn across north is a small turn. */
export function wrapDegrees(d: number): number {
  if (!Number.isFinite(d)) return 0;
  const r = ((((d + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}

export interface Aim {
  /** Left–right, degrees; grows as the phone turns LEFT (DeviceOrientation's alpha). */
  yaw: number;
  /** Up–down, degrees; grows as the phone's top tips UP. */
  pitch: number;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Where on the slide the phone points: `center` is the aim when the button went down (the slide's
 * middle), `range` is how many degrees from there reach an edge. Turning right moves right,
 * tipping up moves up; past an edge the point stays on it.
 */
export function orientationToPoint(
  center: Aim,
  current: Aim,
  range: number,
): { x: number; y: number } {
  const span = Math.max(1, range);
  const dx = wrapDegrees(center.yaw - current.yaw);
  const dy = wrapDegrees(current.pitch - center.pitch);
  return { x: clamp01(0.5 + dx / (2 * span)), y: clamp01(0.5 - dy / (2 * span)) };
}

/**
 * The aim in a DeviceOrientationEvent, for the way the screen is turned: held in landscape, the
 * phone's own front–back tilt (beta) is no longer up–down, its side tilt (gamma) is.
 */
export function readOrientation(
  e: { alpha: number | null; beta: number | null; gamma: number | null },
  screenAngle = 0,
): Aim | null {
  if (e.alpha === null || e.beta === null || e.gamma === null) return null;
  const angle = ((screenAngle % 360) + 360) % 360;
  const pitch =
    angle === 90 ? -e.gamma : angle === 270 ? e.gamma : angle === 180 ? -e.beta : e.beta;
  return { yaw: e.alpha, pitch };
}

/**
 * The One Euro filter (Casiez, Roussel, Vogel, CHI 2012): a low-pass filter whose cutoff rises
 * with speed — steady when the hand is still, no lag when it sweeps. `minCutoff` (Hz) sets the
 * jitter at rest, `beta` how fast the cutoff opens with speed, `dCutoff` smooths the speed.
 */
export interface OneEuroOptions {
  minCutoff?: number;
  beta?: number;
  dCutoff?: number;
}

export interface OneEuro {
  /** Filter a sample taken at `t` milliseconds. */
  filter(value: number, t: number): number;
  reset(): void;
}

export function createOneEuro({
  minCutoff = 1.2,
  beta = 2,
  dCutoff = 1,
}: OneEuroOptions = {}): OneEuro {
  let x: number | null = null;
  let dx = 0;
  let last = 0;
  const alpha = (cutoff: number, dt: number) => {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  };
  return {
    filter(value, t) {
      if (x === null) {
        x = value;
        last = t;
        dx = 0;
        return value;
      }
      // Two samples in the same millisecond: treat as 1 ms apart rather than divide by zero.
      const dt = Math.max(1, t - last) / 1000;
      last = t;
      const rawDx = (value - x) / dt;
      dx += alpha(dCutoff, dt) * (rawDx - dx);
      const cutoff = minCutoff + beta * Math.abs(dx);
      x += alpha(cutoff, dt) * (value - x);
      return x;
    },
    reset() {
      x = null;
      dx = 0;
    },
  };
}

/**
 * At most one call every `ms`, and always the LATEST value: a laser sweep sends ≤30 a second and
 * where the hand stopped always arrives. `flush` sends what is waiting now (before a "lift").
 */
export interface Coalescer<T> {
  push(value: T): void;
  flush(): void;
  cancel(): void;
}

export function createCoalescer<T>(
  send: (value: T) => void,
  ms = 33,
  clock: { now(): number; set(fn: () => void, ms: number): unknown; clear(t: unknown): void } = {
    now: () => Date.now(),
    set: (fn, wait) => setTimeout(fn, wait),
    clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  },
): Coalescer<T> {
  let pending: { value: T } | null = null;
  let timer: unknown = null;
  let sentAt = Number.NEGATIVE_INFINITY;
  const fire = () => {
    timer = null;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    sentAt = clock.now();
    send(value);
  };
  return {
    push(value) {
      pending = { value };
      const wait = ms - (clock.now() - sentAt);
      if (wait <= 0) {
        if (timer !== null) clock.clear(timer);
        fire();
      } else if (timer === null) timer = clock.set(fire, wait);
    },
    flush() {
      if (timer !== null) clock.clear(timer);
      fire();
    },
    cancel() {
      if (timer !== null) clock.clear(timer);
      timer = null;
      pending = null;
    },
  };
}

/**
 * The notes for one click step: `[click]` (and `[click:N]`) markers split them, the part before
 * the first shows before any click. The same reading as every other notes view
 * (core/notes-markers.ts).
 */
export function notesSegment(notes: string | null | undefined, click: number): string | null {
  return notesForClick(notes, click);
}
