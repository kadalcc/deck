import { describe, expect, test } from "bun:test";

import { navDirection } from "./direction.ts";
import { DEFAULT_FILTERS, filterCss, isDefaultFilters, normalizeFilters } from "./filters.ts";
import { KEY_BINDINGS } from "./keyboard.ts";
import * as N from "./navigation.ts";
import { currentPart, notesForClick, partState, splitNotes } from "./notes-markers.ts";
import {
  createShortcutRegistry,
  defineShortcuts,
  keyLabel,
  resolveShortcuts,
} from "./shortcuts.ts";
import {
  createTimer,
  elapsedMs,
  formatClock,
  fromRemote,
  parseDuration,
  parseTimer,
  pause,
  readTimer,
  remoteTimer,
  reset,
  resume,
  serializeTimer,
  setDuration,
  toggle,
} from "./timer.ts";

describe("parseDuration", () => {
  test("Slidev's spellings", () => {
    expect(parseDuration("30min")).toBe(1800);
    expect(parseDuration("30m")).toBe(1800);
    expect(parseDuration("1h")).toBe(3600);
    expect(parseDuration("1h30m")).toBe(5400);
    expect(parseDuration("1h 30min")).toBe(5400);
    expect(parseDuration("1.5h")).toBe(5400);
    expect(parseDuration("90s")).toBe(90);
    expect(parseDuration("45 seconds")).toBe(45);
  });
  test("a bare number is minutes", () => {
    expect(parseDuration(20)).toBe(1200);
    expect(parseDuration("20")).toBe(1200);
    expect(parseDuration(0.5)).toBe(30);
  });
  test("clock forms", () => {
    expect(parseDuration("25:00")).toBe(1500);
    expect(parseDuration("1:05:00")).toBe(3900);
  });
  test("nonsense is null", () => {
    for (const v of ["", "soon", "30 minutes and change", "-5min", 0, -3, null, {}, "0s", "5x"])
      expect(parseDuration(v)).toBeNull();
  });
});

describe("timer", () => {
  test("runs, pauses and resumes without counting the pause", () => {
    let t = createTimer("stopwatch", null, 1000);
    expect(elapsedMs(t, 6000)).toBe(5000);
    t = pause(t, 6000);
    expect(elapsedMs(t, 60_000)).toBe(5000);
    t = resume(t, 60_000);
    expect(elapsedMs(t, 61_000)).toBe(6000);
    expect(toggle(toggle(t, 62_000), 63_000).banked).toBe(7000);
  });
  test("reset keeps a running timer running, a paused one paused", () => {
    const running = reset(createTimer("stopwatch", null, 0), 10_000);
    expect(elapsedMs(running, 12_000)).toBe(2000);
    const paused = reset(pause(createTimer("stopwatch", null, 0), 5000), 10_000);
    expect(paused.anchor).toBeNull();
    expect(elapsedMs(paused, 20_000)).toBe(0);
  });
  test("countdown: remaining, progress, overtime", () => {
    const t = createTimer("countdown", 600, 0);
    const r = readTimer(t, 120_000);
    expect(r.remaining).toBe(480);
    expect(r.shown).toBe(480);
    expect(r.progress).toBeCloseTo(0.2);
    expect(r.overtime).toBe(false);
    const over = readTimer(t, 660_000);
    expect(over.overtime).toBe(true);
    expect(over.shown).toBe(60);
    expect(formatClock(over.remaining!, over.overtime)).toBe("-00:01:00");
  });
  test("countdown without a duration runs from thirty minutes", () => {
    expect(readTimer(createTimer("countdown", null, 0), 0).remaining).toBe(1800);
  });
  test("stopwatch with a duration has a progress bar, without none", () => {
    expect(readTimer(createTimer("stopwatch", 100, 0), 50_000).progress).toBeCloseTo(0.5);
    expect(readTimer(createTimer("stopwatch", null, 0), 50_000).progress).toBeNull();
    expect(setDuration(createTimer("stopwatch", 100, 0), -1).duration).toBeNull();
  });
  test("round-trips storage, and reads the old start-time key", () => {
    const t = pause(createTimer("countdown", 900, 1000), 4000);
    expect(parseTimer(serializeTimer(t))).toEqual(t);
    expect(parseTimer("1700000000000")).toEqual({
      mode: "stopwatch",
      duration: null,
      anchor: 1700000000000,
      banked: 0,
    });
    expect(parseTimer("{bad")).toBeNull();
    expect(parseTimer('{"mode":"x","banked":0,"anchor":null}')).toBeNull();
  });
  test("a phone's copy does not depend on the phone's clock", () => {
    const sent = remoteTimer(createTimer("stopwatch", null, 0), 30_000);
    // The phone's clock is an hour out; it anchors at its own time of arrival.
    const phone = fromRemote(sent, 3_600_000);
    expect(elapsedMs(phone, 3_605_000)).toBe(35_000);
    const paused = fromRemote({ ...sent, running: false }, 99);
    expect(elapsedMs(paused, 1e9)).toBe(30_000);
  });
});

describe("[click] markers in notes", () => {
  test("split at [click] and [click:N]", () => {
    expect(splitNotes("Hi [click] one [click:4] four [click] five")).toEqual([
      { click: 0, text: "Hi " },
      { click: 1, text: " one " },
      { click: 4, text: " four " },
      { click: 5, text: " five" },
    ]);
  });
  test("the current part is the last one reached", () => {
    const steps = [0, 1, 4, 5];
    expect(currentPart(steps, 0)).toBe(0);
    expect(currentPart(steps, 3)).toBe(1);
    expect(currentPart(steps, 9)).toBe(3);
    expect(partState(steps, 0, 3)).toBe("past");
    expect(partState(steps, 1, 3)).toBe("current");
    expect(partState(steps, 2, 3)).toBe("future");
    expect(currentPart([2, 3], 0)).toBe(-1);
  });
  test("notes for a step, as the remote shows them", () => {
    expect(notesForClick("A [click] B [click] C", 0)).toBe("A");
    expect(notesForClick("A [click] B [click] C", 1)).toBe("B");
    expect(notesForClick("A [click] B [click] C", 7)).toBe("C");
    expect(notesForClick("[click] B", 0)).toBeNull();
    expect(notesForClick(null, 0)).toBeNull();
  });
});

describe("navigation direction", () => {
  test("four directions become two, and a standstill keeps the last", () => {
    expect(navDirection("forward")).toBe("forward");
    expect(navDirection("down")).toBe("forward");
    expect(navDirection("back")).toBe("backward");
    expect(navDirection("up")).toBe("backward");
    expect(navDirection("none", "backward")).toBe("backward");
    expect(navDirection("none")).toBe("forward");
  });
  test("a jump to an earlier step on the same slide goes back", () => {
    const columns = [{ h: 0, slides: [{} as never] }];
    const s = { ...N.initialNav(), click: 3, totals: { "0,0": 4 } };
    expect(N.goto(s, columns, { h: 0, v: 0, click: 1 }).direction).toBe("back");
    expect(N.goto(s, columns, { h: 0, v: 0, click: 4 }).direction).toBe("forward");
    expect(N.goto(s, columns, { h: 0, v: 0, click: 3 }).direction).toBe("none");
  });
});

describe("shortcuts", () => {
  const ev = (code: string, mods: Partial<KeyboardEvent> = {}) =>
    ({
      code,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      ...mods,
    }) as KeyboardEvent;

  test("the defaults resolve to themselves", () => {
    const { list, conflicts } = resolveShortcuts({});
    expect(list.length).toBe(KEY_BINDINGS.length);
    expect(list.every((s) => !s.custom)).toBe(true);
    expect(conflicts).toEqual([]);
  });
  test("an addition takes its key from the default that had it", () => {
    const { list } = resolveShortcuts({
      prop: [{ keys: ["KeyD"], command: "view.overview", description: "Overview" }],
    });
    const scheme = list.find((s) => s.action === "colorScheme");
    expect(scheme).toBeUndefined();
    expect(list.find((s) => s.command === "view.overview")?.custom).toBe(true);
  });
  test("a function replaces the list: remove and rebind", () => {
    const fn = defineShortcuts((defaults) =>
      defaults
        .filter((b) => b.action !== "pointer")
        .map((b) => (b.action === "draw" ? { ...b, keys: ["KeyE"] } : b)),
    );
    const { list } = resolveShortcuts({ prop: fn });
    expect(list.find((s) => s.action === "pointer")).toBeUndefined();
    const draw = list.find((s) => s.action === "draw")!;
    expect(draw.keys).toEqual(["KeyE"]);
    expect(draw.custom).toBe(true);
    expect(list.find((s) => s.action === "next")!.custom).toBe(false);
  });
  test("the keyboard map rebinds and unbinds", () => {
    const reg = createShortcutRegistry();
    reg.configure({ keyboard: { KeyQ: "overview", KeyD: null } });
    expect(reg.match(ev("KeyQ"))?.action).toBe("overview");
    expect(reg.match(ev("KeyD"))).toBeNull();
    expect(reg.match(ev("Space"))?.action).toBe("next");
  });
  test("added layers win, newest first, and come off again", () => {
    const reg = createShortcutRegistry();
    const a = reg.add({ keys: ["KeyM"], command: "a", description: "A" });
    const b = reg.add({ keys: ["KeyM"], command: "b", description: "B" });
    expect(reg.match(ev("KeyM"))?.command).toBe("b");
    b();
    expect(reg.match(ev("KeyM"))?.command).toBe("a");
    a();
    expect(reg.match(ev("KeyM"))).toBeNull();
  });
  test("modifiers and views are part of the match", () => {
    const reg = createShortcutRegistry();
    reg.add({ keys: ["Shift+KeyM"], command: "x", description: "X", views: ["presenter"] });
    expect(reg.match(ev("KeyM"))).toBeNull();
    expect(reg.match(ev("KeyM", { shiftKey: true }), "play")).toBeNull();
    expect(reg.match(ev("KeyM", { shiftKey: true }), "presenter")?.command).toBe("x");
  });
  test("two claims in one layer are a conflict", () => {
    const { conflicts } = resolveShortcuts({
      prop: [
        { keys: ["KeyQ"], command: "a", description: "First" },
        { keys: ["KeyQ"], command: "b", description: "Second" },
      ],
    });
    expect(conflicts).toEqual([{ key: "KeyQ", claimedBy: ["First", "Second"] }]);
  });
  test("labels", () => {
    expect(keyLabel("Shift+KeyQ")).toBe("Shift Q");
    expect(keyLabel("Digit1")).toBe("1");
    expect(keyLabel("ArrowRight")).toBe("→");
    expect(keyLabel("Comma")).toBe(",");
  });
});

describe("display filters", () => {
  test("defaults are no filter at all", () => {
    expect(filterCss(DEFAULT_FILTERS)).toBe("none");
    expect(isDefaultFilters(normalizeFilters(null))).toBe(true);
  });
  test("values become CSS, clamped", () => {
    const f = normalizeFilters({ brightness: 9, contrast: 0.8, invert: true, hueRotate: 90, x: 1 });
    expect(f.brightness).toBe(1.5);
    expect(filterCss(f)).toBe("invert(1) brightness(1.5) contrast(0.8) hue-rotate(90deg)");
    expect(isDefaultFilters(f)).toBe(false);
  });
});
