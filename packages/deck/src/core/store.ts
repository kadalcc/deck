import { useRef, useSyncExternalStore } from "react";

/**
 * A minimal external store: one value, subscribers, selectors through `useSyncExternalStore`.
 * The deck keeps its navigation state here rather than in React state so the keyboard, the hash,
 * the live room and the presenter window can all read and write it without a render in between.
 */
export interface Store<T> {
  get(): T;
  set(next: T): void;
  update(fn: (prev: T) => T): void;
  subscribe(listener: (value: T, prev: T) => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<(value: T, prev: T) => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      const prev = value;
      value = next;
      for (const l of listeners) l(value, prev);
    },
    update(fn) {
      this.set(fn(value));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const identity = <T>(v: T) => v;

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka)
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
      return false;
  return true;
}

/**
 * Read a slice of a store; re-renders only when the selected slice changes. Selectors may return
 * fresh objects (`(s) => ({ h: s.h, v: s.v })`): the last result is kept and returned again while
 * it is shallow-equal, which is what keeps `useSyncExternalStore` from looping.
 */
export function useStore<T, S = T>(
  store: Store<T>,
  selector: (value: T) => S = identity as never,
): S {
  const last = useRef<{ input: T; output: S } | null>(null);
  const snapshot = () => {
    const input = store.get();
    const cached = last.current;
    if (cached && Object.is(cached.input, input)) return cached.output;
    const output = selector(input);
    if (cached && shallowEqual(cached.output, output)) {
      last.current = { input, output: cached.output };
      return cached.output;
    }
    last.current = { input, output };
    return output;
  };
  return useSyncExternalStore((cb) => store.subscribe(() => cb()), snapshot, snapshot);
}
