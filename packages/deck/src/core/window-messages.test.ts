import { describe, expect, test } from "bun:test";

import { createTimer } from "./timer.ts";
import {
  isNavMessage,
  type NavMessage,
  parsePresenterState,
  roomGlance,
  sameState,
  takesNav,
} from "./window-messages.ts";

const nav = (m: Partial<NavMessage> = {}): NavMessage => ({
  type: "nav",
  h: 2,
  v: 0,
  click: 1,
  paused: false,
  from: "other",
  ...m,
});
const play = { windowId: "me", presenter: false, teleprompter: false };
const presenter = { windowId: "me", presenter: true, teleprompter: false };
const prompter = { windowId: "me", presenter: false, teleprompter: true };

describe("who may move whom", () => {
  test("nobody acts on their own message", () => {
    expect(takesNav(play, nav({ from: "me" }), "channel")).toBe(false);
  });

  test("a play window follows the presenter and the viewer's other tabs", () => {
    expect(takesNav(play, nav({ presenter: true }), "child")).toBe(true);
    expect(takesNav(play, nav(), "channel")).toBe(true);
  });

  test("the presenter view is moved by no viewer, and by nothing that opened it", () => {
    expect(takesNav(presenter, nav(), "channel")).toBe(false);
    expect(takesNav(presenter, nav(), "child")).toBe(false);
    expect(takesNav(presenter, nav({ presenter: true }), "opener")).toBe(false);
    expect(takesNav(presenter, nav({ presenter: true }), "channel")).toBe(true);
  });

  test("the teleprompter reads along with the presenter only", () => {
    expect(takesNav(prompter, nav({ presenter: true }), "opener")).toBe(true);
    expect(takesNav(prompter, nav({ presenter: true }), "channel")).toBe(true);
    // The play window clicked through at the projector is not where the speaker is.
    expect(takesNav(prompter, nav(), "channel")).toBe(false);
    expect(takesNav(prompter, nav(), "opener")).toBe(false);
  });

  test("a position must look like one", () => {
    expect(isNavMessage(nav())).toBe(true);
    expect(isNavMessage({ ...nav(), h: "2" })).toBe(false);
    expect(isNavMessage({ ...nav(), click: 1.5 })).toBe(false);
    expect(isNavMessage({ type: "presenter:ask", from: "x" })).toBe(false);
    expect(isNavMessage(null)).toBe(false);
  });
});

describe("the presenter's state for the teleprompter", () => {
  test("the room as counts: open questions only, nothing else of theirs", () => {
    const g = roomGlance({
      presence: { hands: 2, viewers: 34, pace: { slower: 3, faster: 1, total: 4 } },
      questions: [{ answered: false }, { answered: true }, { answered: false }],
    });
    expect(g).toEqual({
      hands: 2,
      viewers: 34,
      pace: { slower: 3, faster: 1, total: 4 },
      questions: 2,
    });
    expect(roomGlance(null)).toBeNull();
    expect(roomGlance({})).toEqual({
      hands: 0,
      viewers: 0,
      pace: { slower: 0, faster: 0, total: 0 },
      questions: 0,
    });
  });

  test("what arrives is checked: wrong types become zeros, a bad timer becomes none", () => {
    const timer = createTimer("countdown", 1800, 1000);
    const ok = parsePresenterState({
      type: "presenter:state",
      from: "p",
      timer,
      room: { hands: 1, viewers: 5, pace: { slower: 0, faster: 2, total: 2 }, questions: 3 },
    });
    expect(ok?.timer).toEqual(timer);
    expect(ok?.room?.questions).toBe(3);
    const odd = parsePresenterState({
      type: "presenter:state",
      from: "p",
      timer: { mode: "egg" },
      room: { hands: -4, viewers: "many", pace: null, questions: Infinity },
    });
    expect(odd?.timer).toBeNull();
    expect(odd?.room).toEqual({
      hands: 0,
      viewers: 0,
      pace: { slower: 0, faster: 0, total: 0 },
      questions: 0,
    });
    expect(
      parsePresenterState({ type: "presenter:state", from: "p", timer: null, room: null }),
    ).toEqual({
      type: "presenter:state",
      from: "p",
      timer: null,
      room: null,
    });
    expect(parsePresenterState({ type: "nav" })).toBeNull();
    expect(parsePresenterState("presenter:state")).toBeNull();
  });

  test("only a change is worth sending", () => {
    const timer = createTimer("stopwatch", null, 1000);
    const a = { timer, room: null };
    expect(sameState(null, a)).toBe(false);
    expect(sameState(a, { timer: { ...timer }, room: null })).toBe(true);
    expect(sameState(a, { timer: { ...timer, anchor: null, banked: 5 }, room: null })).toBe(false);
  });
});
