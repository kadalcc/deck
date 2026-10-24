import { describe, expect, test } from "bun:test";

import {
  autoScrollStep,
  DEFAULT_PREFS,
  nextSize,
  parsePrefs,
  preferredScreen,
  screenChoices,
  screenKey,
  scrollRate,
  serializePrefs,
  SIZE_MAX,
  SIZE_MIN,
  throttle,
  windowFeatures,
} from "./teleprompter.ts";

describe("teleprompter prefs", () => {
  test("nothing stored, or nonsense, is the defaults", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("not json")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("[1,2]")).toEqual(DEFAULT_PREFS);
  });

  test("a round trip keeps everything but the motion", () => {
    const mine = {
      ...DEFAULT_PREFS,
      size: 60,
      width: "wide" as const,
      mirror: true,
      speed: 7,
      scheme: "light" as const,
      auto: true,
    };
    expect(parsePrefs(serializePrefs(mine))).toEqual({ ...mine, auto: false });
  });

  test("what is wrong falls back field by field, numbers are clamped", () => {
    const p = parsePrefs(
      JSON.stringify({ size: 500, speed: -3, width: "huge", mirror: "yes", guide: false }),
    );
    expect(p.size).toBe(SIZE_MAX);
    expect(p.speed).toBe(1);
    expect(p.width).toBe(DEFAULT_PREFS.width);
    expect(p.mirror).toBe(DEFAULT_PREFS.mirror);
    expect(p.guide).toBe(false);
  });

  test("A− and A+ step, bigger where the text is big, within the bounds", () => {
    expect(nextSize(44, 1)).toBe(48);
    expect(nextSize(64, 1)).toBe(72);
    expect(nextSize(SIZE_MIN, -1)).toBe(SIZE_MIN);
    expect(nextSize(SIZE_MAX, 1)).toBe(SIZE_MAX);
  });
});

describe("auto-scroll", () => {
  test("faster speeds and bigger text move further", () => {
    expect(scrollRate(5, 44)).toBeGreaterThan(scrollRate(1, 44));
    expect(scrollRate(3, 60)).toBeGreaterThan(scrollRate(3, 40));
    // Speed 1 crawls (under a line every 2 s); speed 10 is under three lines a second.
    expect(scrollRate(1, 40)).toBeLessThan((40 * 1.35) / 2);
    expect(scrollRate(10, 40)).toBeLessThan(40 * 1.35 * 3);
  });

  test("whole pixels move, the fraction carries to the next frame", () => {
    let carry = 0;
    let moved = 0;
    for (let i = 0; i < 60; i++) {
      const s = autoScrollStep({ speed: 1, size: 20, dtMs: 1000 / 60, carry, reduced: false });
      expect(Number.isInteger(s.move)).toBe(true);
      carry = s.carry;
      moved += s.move;
    }
    // A second of frames moves a second's worth, give or take the carried fraction.
    expect(Math.abs(moved + carry - scrollRate(1, 20))).toBeLessThan(0.001);
  });

  test("a stalled frame does not jump a page", () => {
    const s = autoScrollStep({ speed: 10, size: 44, dtMs: 5000, carry: 0, reduced: false });
    expect(s.move).toBeLessThanOrEqual(Math.ceil(scrollRate(10, 44) * 0.1));
  });

  test("with reduced motion it moves a whole line at a time, or not at all", () => {
    const line = Math.round(44 * 1.35);
    let carry = 0;
    const moves: number[] = [];
    for (let i = 0; i < 120; i++) {
      const s = autoScrollStep({ speed: 5, size: 44, dtMs: 1000 / 60, carry, reduced: true });
      carry = s.carry;
      if (s.move) moves.push(s.move);
    }
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) expect(m % line).toBe(0);
  });
});

describe("screens", () => {
  const laptop = {
    label: "Built-in Retina Display",
    left: 0,
    top: 0,
    width: 1512,
    height: 982,
    availLeft: 0,
    availTop: 25,
    availWidth: 1512,
    availHeight: 957,
    isPrimary: true,
    isInternal: true,
  };
  const dell = {
    label: "DELL U2720Q",
    left: 1512,
    top: -300,
    width: 2560,
    height: 1440,
    availLeft: 1512,
    availTop: -300,
    availWidth: 2560,
    availHeight: 1415,
    isPrimary: false,
  };
  const twin = { ...dell, left: 4072, availLeft: 4072 };

  test("choices: this screen first, then the primary, then left to right; their places are the usable area", () => {
    const list = screenChoices([twin, dell, laptop], laptop);
    expect(list.map((c) => c.label)).toEqual([
      "Built-in Retina Display",
      "DELL U2720Q",
      "DELL U2720Q",
    ]);
    expect(list[0]!.current).toBe(true);
    expect(list[0]!.primary).toBe(true);
    expect(list[1]!.place).toEqual({ left: 1512, top: -300, width: 2560, height: 1415 });
    expect(list[1]!.size).toBe("2560 × 1440");
  });

  test("two identical monitors are told apart by where they are", () => {
    expect(screenKey(dell)).not.toBe(screenKey(twin));
    expect(screenKey(dell)).toBe(screenKey({ ...dell }));
  });

  test("a screen without a name gets one", () => {
    const [c] = screenChoices([{ availWidth: 800, availHeight: 600 }]);
    expect(c!.label).toBe("Screen 1");
  });

  test("the screen used last time, if it is still there; else another than this one; else none", () => {
    const list = screenChoices([laptop, dell, twin], laptop);
    expect(preferredScreen(list, screenKey(twin))!.key).toBe(screenKey(twin));
    expect(preferredScreen(list, "gone|0|0|1|1")!.current).toBe(false);
    expect(preferredScreen(list, null)!.label).toBe("DELL U2720Q");
    expect(preferredScreen(screenChoices([laptop], laptop), null)).toBeNull();
  });

  test("window features fill the place, with a floor, or make a plain popup", () => {
    expect(windowFeatures({ left: 1512, top: -300, width: 2560, height: 1415 })).toBe(
      "popup,left=1512,top=-300,width=2560,height=1415",
    );
    expect(windowFeatures({ left: 0.4, top: 0, width: 10, height: 10 })).toBe(
      "popup,left=0,top=0,width=320,height=240",
    );
    expect(windowFeatures(null)).toBe("popup,width=1100,height=760");
  });
});

describe("throttle", () => {
  function fakeClock() {
    let now = 0;
    const timers = new Map<number, { at: number; fn: () => void }>();
    let id = 0;
    return {
      clock: {
        now: () => now,
        set: (fn: () => void, ms: number) => {
          timers.set(++id, { at: now + ms, fn });
          return id;
        },
        clear: (t: unknown) => timers.delete(t as number),
      },
      advance(ms: number) {
        now += ms;
        for (const [k, t] of timers)
          if (t.at <= now) {
            timers.delete(k);
            t.fn();
          }
      },
      pending: () => timers.size,
    };
  }

  test("the first call runs at once; a burst becomes one more at the end of the interval", () => {
    const c = fakeClock();
    let runs = 0;
    const t = throttle(() => runs++, 250, c.clock);
    t();
    expect(runs).toBe(1);
    t();
    t();
    t();
    expect(runs).toBe(1);
    expect(c.pending()).toBe(1);
    c.advance(250);
    expect(runs).toBe(2);
    c.advance(1000);
    expect(runs).toBe(2);
  });

  test("flush runs now and drops the waiting call; cancel drops it", () => {
    const c = fakeClock();
    let runs = 0;
    const t = throttle(() => runs++, 250, c.clock);
    t();
    t();
    t.flush();
    expect(runs).toBe(2);
    expect(c.pending()).toBe(0);
    t();
    t.cancel();
    c.advance(1000);
    expect(runs).toBe(2);
  });
});
