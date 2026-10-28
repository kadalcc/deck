import { describe, expect, test } from "bun:test";

import type { Routes } from "../core/navigation.ts";
import {
  parseHostMessage,
  REVEAL_METHODS,
  type RevealHost,
  type RevealState,
  revealMessage,
} from "./host-messages.ts";

/** A deck as reveal's calls see it, recording what they asked for. */
function fakeHost(over: Partial<RevealState> = {}) {
  const calls: string[] = [];
  let state: RevealState = {
    indexh: 1,
    indexv: 0,
    indexf: 0,
    paused: false,
    overview: false,
    ...over,
  };
  const routes: Routes = {
    left: true,
    right: true,
    up: false,
    down: false,
    prevClick: false,
    nextClick: true,
  };
  const host: RevealHost = {
    state: () => state,
    totalSlides: () => 5,
    steps: () => ({ shown: 1, total: 2 }),
    routes: () => routes,
    progress: () => 0.25,
    scale: () => 0.5,
    autoSliding: () => false,
    isFirst: () => false,
    isLast: () => false,
    move: (to) => calls.push(`move:${to}`),
    goto: (h, v, click) => {
      calls.push(`goto:${h}/${v}/${click}`);
      state = { ...state, indexh: h, indexv: v };
    },
    overview: (on) => calls.push(`overview:${on}`),
    pause: (on) => calls.push(`pause:${on}`),
    autoSlide: (on) => calls.push(`autoSlide:${on}`),
    help: (on) => calls.push(`help:${on}`),
    jump: (on) => calls.push(`jump:${on}`),
  };
  return { host, calls };
}

const call = (host: RevealHost, method: string, ...args: unknown[]) =>
  REVEAL_METHODS[method]!(host, args);

describe("parseHostMessage", () => {
  test("reveal's JSON string and the same as an object", () => {
    expect(parseHostMessage(JSON.stringify({ method: "slide", args: [2] }))).toEqual({
      kind: "reveal",
      method: "slide",
      args: [2],
    });
    expect(parseHostMessage({ method: "next" })).toEqual({
      kind: "reveal",
      method: "next",
      args: [],
    });
  });

  test("Kadal's command protocol", () => {
    expect(parseHostMessage({ kadal: 1, type: "command", seq: 4, id: "nav.next" })).toEqual({
      kind: "command",
      seq: 4,
      id: "nav.next",
      params: {},
    });
    expect(parseHostMessage({ kadal: 1, type: "commands", seq: 5 })).toEqual({
      kind: "commands",
      seq: 5,
    });
  });

  test("anything else, the deck's own messages included, is not a call", () => {
    expect(parseHostMessage("hello")).toBeNull();
    expect(parseHostMessage("{not json}")).toBeNull();
    expect(
      parseHostMessage(
        revealMessage("slidechanged", { indexh: 0, indexv: 0, paused: false, overview: false }),
      ),
    ).toBeNull();
    expect(parseHostMessage({ kadal: 1, type: "source", text: "" })).toBeNull();
    expect(parseHostMessage({ method: 3 })).toBeNull();
    expect(parseHostMessage(null)).toBeNull();
  });
});

describe("reveal's methods", () => {
  test("slide(h, v, f): f is reveal's fragment index, one under Kadal's click", () => {
    const { host, calls } = fakeHost();
    call(host, "slide", 2);
    call(host, "slide", 3, 1, 0);
    call(host, "slide", "x");
    expect(calls).toEqual(["goto:2/0/0", "goto:3/1/1", "goto:3/0/0"]);
  });

  test("moves, toggles and fragments", () => {
    const { host, calls } = fakeHost();
    call(host, "next");
    call(host, "navigateRight");
    call(host, "toggleOverview", true);
    call(host, "togglePause");
    expect(call(host, "nextFragment")).toBe(true);
    expect(call(host, "prevFragment")).toBe(false);
    expect(calls).toEqual([
      "move:next",
      "move:right",
      "overview:true",
      "pause:undefined",
      "move:next",
    ]);
  });

  test("getters answer as reveal's do", () => {
    const { host } = fakeHost();
    expect(call(host, "getTotalSlides")).toBe(5);
    expect(call(host, "getIndices")).toEqual({ h: 1, v: 0, f: 0 });
    expect(call(host, "getState")).toMatchObject({ indexh: 1, paused: false, overview: false });
    expect(call(host, "availableRoutes")).toEqual({
      left: true,
      right: true,
      up: false,
      down: false,
    });
    expect(call(host, "availableFragments")).toEqual({ prev: false, next: true });
    expect(call(host, "getProgress")).toBe(0.25);
  });

  test("setState restores a position, the overview and a blackout", () => {
    const { host, calls } = fakeHost();
    call(host, "setState", { indexh: 4, indexv: 1, indexf: 1, overview: false, paused: true });
    call(host, "setState", "nonsense");
    expect(calls).toEqual(["goto:4/1/2", "overview:false", "pause:true"]);
  });

  test("the answer is reveal's callback", () => {
    const msg = JSON.parse(
      revealMessage(
        "callback",
        { indexh: 0, indexv: 0, paused: false, overview: false },
        {
          method: "getTotalSlides",
          result: 5,
        },
      ),
    );
    expect(msg).toMatchObject({
      namespace: "reveal",
      eventName: "callback",
      method: "getTotalSlides",
      result: 5,
    });
  });
});
