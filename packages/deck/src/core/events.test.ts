import { describe, expect, test } from "bun:test";

import {
  createDeckEvents,
  navEvents,
  type NavFacts,
  stateChange,
  stateClasses,
  stateNames,
} from "./events.ts";

describe("slide state", () => {
  test("names split on spaces, once each", () => {
    expect(stateNames(["make-it-pop", "dim  quiet", "dim"])).toEqual([
      "make-it-pop",
      "dim",
      "quiet",
    ]);
    expect(stateNames(undefined)).toEqual([]);
  });

  test("each name goes on the root bare and as state-<name>", () => {
    expect(stateClasses(["pop"])).toEqual(["pop", "state-pop"]);
  });

  test("a move says what it turned on and off", () => {
    expect(stateChange(["a", "b"], ["b", "c"])).toEqual({ entered: ["c"], left: ["a"] });
    expect(stateChange([], [])).toEqual({ entered: [], left: [] });
  });
});

const at = (over: Partial<NavFacts> = {}): NavFacts => ({
  h: 0,
  v: 0,
  click: 0,
  overview: false,
  paused: false,
  autoSliding: false,
  ...over,
});

describe("deck.events", () => {
  test("on, off, *, and the event's fields", () => {
    const seen: string[] = [];
    const also: string[] = [];
    const events = createDeckEvents((e) => also.push(e.type));
    const one = (e: { type: string; indexh?: unknown }) => seen.push(`${e.type}:${e.indexh}`);
    const stop = events.on("slidechanged", one);
    events.on("*", (e) => seen.push(`*${e.type}`));
    events.emit("slidechanged", { indexh: 2 });
    stop();
    events.emit("slidechanged", { indexh: 3 });
    events.off("slidechanged", one);
    expect(seen).toEqual(["slidechanged:2", "*slidechanged", "*slidechanged"]);
    expect(also).toEqual(["slidechanged", "slidechanged"]);
  });

  test("a listener that throws does not keep the event from the others", () => {
    const events = createDeckEvents();
    const seen: string[] = [];
    const quiet = console.error;
    console.error = () => {};
    events.on("ready", () => {
      throw new Error("x");
    });
    events.on("ready", () => seen.push("ok"));
    events.emit("ready");
    console.error = quiet;
    expect(seen).toEqual(["ok"]);
  });

  test("moves become reveal's events", () => {
    expect(navEvents(at(), at({ h: 1 })).map((e) => e.type)).toEqual(["slidechanged"]);
    expect(navEvents(at(), at({ click: 2 }))[0]).toMatchObject({
      type: "fragmentshown",
      steps: [1, 2],
      indexf: 2,
    });
    expect(navEvents(at({ click: 2 }), at({ click: 1 }))[0]).toMatchObject({
      type: "fragmenthidden",
      steps: [2],
    });
    expect(
      navEvents(at(), at({ overview: true, paused: true, autoSliding: true })).map((e) => e.type),
    ).toEqual(["overviewshown", "paused", "autoslideresumed"]);
    expect(navEvents(at({ autoSliding: true }), at()).map((e) => e.type)).toEqual([
      "autoslidepaused",
    ]);
    expect(navEvents(at(), at())).toEqual([]);
  });
});
