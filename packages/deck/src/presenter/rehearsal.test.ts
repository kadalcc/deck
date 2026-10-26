import { afterEach, describe, expect, test } from "bun:test";

import { readTimelineShown, timelineKey, timelineShown, writeTimelineShown } from "./rehearsal.ts";

const g = globalThis as { localStorage?: unknown };
const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

/** A localStorage stand-in: a map, or one whose every touch throws (a sandboxed page). */
function install(storage: "map" | "throws") {
  const map = new Map<string, string>();
  const api = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      if (storage === "throws") throw new DOMException("denied", "SecurityError");
      return api;
    },
  });
  return map;
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else delete g.localStorage;
});

describe("the rehearsal timeline's visibility", () => {
  test("shown by default, hidden once a deck is left with it hidden", () => {
    const map = install("map");
    expect(readTimelineShown("talk-a")).toBe(true);
    writeTimelineShown("talk-a", false);
    expect(map.get("deck.presenter.timeline.talk-a")).toBe("hidden");
    expect(readTimelineShown("talk-a")).toBe(false);
    writeTimelineShown("talk-a", true);
    expect(readTimelineShown("talk-a")).toBe(true);
  });

  test("each deck keeps its own choice", () => {
    install("map");
    writeTimelineShown("talk-b", false);
    expect(readTimelineShown("talk-b")).toBe(false);
    expect(readTimelineShown("talk-c")).toBe(true);
    expect(timelineKey("")).toBe("deck.presenter.timeline.deck");
  });

  test("anything unexpected in storage reads as shown", () => {
    const map = install("map");
    map.set(timelineKey("talk-d"), "maybe");
    expect(readTimelineShown("talk-d")).toBe(true);
  });

  test("storage that throws (a sandboxed page) never surfaces, and the page keeps the choice", () => {
    install("throws");
    expect(() => writeTimelineShown("talk-e", false)).not.toThrow();
    expect(readTimelineShown("talk-e")).toBe(false);
  });

  test("the store writes through and is one per deck", () => {
    const map = install("map");
    const s = timelineShown("talk-f");
    expect(timelineShown("talk-f")).toBe(s);
    expect(s.get()).toBe(true);
    s.set(false);
    expect(map.get(timelineKey("talk-f"))).toBe("hidden");
  });
});
