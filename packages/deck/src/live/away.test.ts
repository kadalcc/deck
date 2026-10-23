import { describe, expect, test } from "bun:test";

import { AWAY_AFTER_MS, AWAY_RECHECK_MS, createAwayWatch } from "./away.ts";

/** A watch over a pretend tab and room, with a clock the test moves. */
function rig() {
  const tab = { hidden: false, session: false, remotes: 0, now: 0 };
  const calls: boolean[] = [];
  const timers = new Map<number, { at: number; fn: () => void }>();
  let id = 0;
  const watch = createAwayWatch({
    hidden: () => tab.hidden,
    sessionLive: () => tab.session,
    remotes: () => tab.remotes,
    setAway: (away) => calls.push(away),
    setTimer: (fn, ms) => {
      timers.set(++id, { at: tab.now + ms, fn });
      return id;
    },
    clearTimer: (t) => timers.delete(t as number),
  });
  const advance = (ms: number) => {
    const end = tab.now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      tab.now = due[1].at;
      due[1].fn();
    }
    tab.now = end;
  };
  const hide = () => {
    tab.hidden = true;
    watch.visibility();
  };
  const show = () => {
    tab.hidden = false;
    watch.visibility();
  };
  return { tab, calls, watch, advance, hide, show };
}

describe("a presenter view forgotten in a background tab", () => {
  test("steps down to a viewer after fifteen minutes hidden, and comes back when shown", () => {
    const r = rig();
    r.hide();
    r.advance(AWAY_AFTER_MS - 1000);
    expect(r.calls).toEqual([]);
    r.advance(1000);
    expect(r.calls).toEqual([true]);
    expect(r.watch.away).toBe(true);
    r.show();
    expect(r.calls).toEqual([true, false]);
    expect(r.watch.away).toBe(false);
  });

  test("a glance at the tab restarts the fifteen minutes", () => {
    const r = rig();
    r.hide();
    r.advance(AWAY_AFTER_MS - 60_000);
    r.show();
    r.hide();
    r.advance(AWAY_AFTER_MS - 60_000);
    expect(r.calls).toEqual([]);
    r.advance(60_000);
    expect(r.calls).toEqual([true]);
  });

  test("never while a session is live, nor while a phone is paired; it steps down once both end", () => {
    const r = rig();
    r.tab.session = true;
    r.hide();
    r.advance(AWAY_AFTER_MS * 3);
    expect(r.calls).toEqual([]);
    r.tab.session = false;
    r.tab.remotes = 1;
    r.advance(AWAY_RECHECK_MS * 5);
    expect(r.calls).toEqual([]);
    r.tab.remotes = 0;
    r.advance(AWAY_RECHECK_MS);
    expect(r.calls).toEqual([true]);
  });

  test("a phone pairing, or a session starting, brings it back while still hidden", () => {
    const r = rig();
    r.hide();
    r.advance(AWAY_AFTER_MS);
    expect(r.calls).toEqual([true]);
    r.tab.remotes = 1;
    r.watch.roomChanged();
    expect(r.calls).toEqual([true, false]);
    // and it does not step down again while the phone is there
    r.tab.remotes = 1;
    r.hide();
    r.advance(AWAY_AFTER_MS * 2);
    expect(r.calls).toEqual([true, false]);
  });

  test("a visible tab never steps down, and room changes alone do nothing", () => {
    const r = rig();
    r.show();
    r.advance(AWAY_AFTER_MS * 4);
    r.watch.roomChanged();
    expect(r.calls).toEqual([]);
  });
});
