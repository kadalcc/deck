import { useEffect, useSyncExternalStore } from "react";

/**
 * Pictures still being made for a printed page: a graded image (components/lut-gl.ts), a Lottie's
 * first frame, a model without a poster. The print view (and so every export) waits until none
 * is left — or its own grace period runs out — before it says it is ready, as it waits for the
 * slides' modules, the fonts and `pro/` items.
 */
let pending = 0;
const listeners = new Set<() => void>();
const changed = (by: number) => {
  pending += by;
  for (const fn of listeners) fn();
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Hold the printed page until the returned function is called (once; later calls do nothing). */
export function holdStill(): () => void {
  changed(1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    changed(-1);
  };
}

/** Whether nothing holds the printed page. */
export const stillsSettled = () => pending === 0;

/** `stillsSettled`, live. */
export const useStillsSettled = () => useSyncExternalStore(subscribe, stillsSettled, stillsSettled);

/**
 * Hold the printed page while `waiting` (only in print: elsewhere nothing waits), for at most
 * `ms` — a picture that never arrives must not hold an export.
 */
export function useStillHold(print: boolean, waiting: boolean, ms = 12_000) {
  useEffect(() => {
    if (!print || !waiting) return;
    const release = holdStill();
    const t = setTimeout(release, ms);
    return () => {
      clearTimeout(t);
      release();
    };
  }, [print, waiting, ms]);
}
