import { describe, expect, test } from "bun:test";

import {
  MAX_COMMAND_PARAMS,
  parseCommand,
  parseCommandResult,
  parseRemoteState,
  type RemoteState,
} from "../live/protocol.ts";
import {
  createCoalescer,
  createOneEuro,
  notesSegment,
  orientationToPoint,
  readOrientation,
  wrapDegrees,
} from "./air.ts";
import { createStore } from "../core/store.ts";
import { type Answer, laserOff, type RemoteStatus, wireResult } from "./link.ts";
import {
  CODE,
  CODE_TTL,
  createRelay,
  ROTATE_MS,
  type RelayOut,
  type RelayPeer,
  TAKEN_OVER,
} from "./relay.ts";

describe("the One Euro filter", () => {
  test("passes the first sample through and holds a constant", () => {
    const f = createOneEuro();
    expect(f.filter(0.5, 0)).toBe(0.5);
    for (let t = 16; t < 1000; t += 16) expect(f.filter(0.5, t)).toBeCloseTo(0.5, 10);
  });

  test("takes most of the jitter out of a still hand", () => {
    const f = createOneEuro();
    let seed = 7;
    const noise = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647 - 0.5) * 0.04;
    };
    const raw: number[] = [];
    const out: number[] = [];
    for (let i = 0; i < 300; i++) {
      const v = 0.5 + noise();
      raw.push(v);
      out.push(f.filter(v, i * 16));
    }
    const spread = (xs: number[]) => {
      const tail = xs.slice(50);
      const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
      return Math.sqrt(tail.reduce((a, b) => a + (b - mean) ** 2, 0) / tail.length);
    };
    expect(spread(out)).toBeLessThan(spread(raw) * 0.5);
  });

  test("keeps up with a sweep (the cutoff opens with speed)", () => {
    const f = createOneEuro();
    let y = 0;
    // 0 → 1 in half a second at 60 Hz.
    for (let i = 0; i <= 30; i++) y = f.filter(i / 30, i * 16.7);
    expect(y).toBeGreaterThan(0.85);
    // Reset forgets the past.
    f.reset();
    expect(f.filter(0.2, 10_000)).toBe(0.2);
  });

  test("survives two samples in one millisecond", () => {
    const f = createOneEuro();
    f.filter(0.1, 5);
    expect(Number.isFinite(f.filter(0.9, 5))).toBe(true);
  });
});

describe("orientation to a point", () => {
  test("wraps angles into (-180, 180]", () => {
    expect(wrapDegrees(359)).toBe(-1);
    expect(wrapDegrees(181)).toBe(-179);
    expect(wrapDegrees(-181)).toBe(179);
    expect(wrapDegrees(180)).toBe(180);
    expect(wrapDegrees(-180)).toBe(180);
    expect(wrapDegrees(540)).toBe(180);
    expect(wrapDegrees(720 + 10)).toBe(10);
    expect(wrapDegrees(Number.NaN)).toBe(0);
  });

  test("the aim at the press is the slide's centre", () => {
    expect(orientationToPoint({ yaw: 123, pitch: 20 }, { yaw: 123, pitch: 20 }, 20)).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  test("turning right moves right, tipping up moves up, range reaches the edge", () => {
    const c = { yaw: 100, pitch: 10 };
    // alpha grows to the LEFT, so turning right is a smaller alpha.
    expect(orientationToPoint(c, { yaw: 90, pitch: 10 }, 20).x).toBeCloseTo(0.75);
    expect(orientationToPoint(c, { yaw: 80, pitch: 10 }, 20).x).toBeCloseTo(1);
    expect(orientationToPoint(c, { yaw: 110, pitch: 10 }, 20).x).toBeCloseTo(0.25);
    expect(orientationToPoint(c, { yaw: 100, pitch: 20 }, 20).y).toBeCloseTo(0.25);
    expect(orientationToPoint(c, { yaw: 100, pitch: 0 }, 20).y).toBeCloseTo(0.75);
  });

  test("crossing north (0/360°) is a small turn, not a full circle", () => {
    // Pressed at 2°, turned right by 4° to 358°.
    expect(orientationToPoint({ yaw: 2, pitch: 0 }, { yaw: 358, pitch: 0 }, 20).x).toBeCloseTo(0.6);
    // Pressed at 358°, turned left by 4° to 2°.
    expect(orientationToPoint({ yaw: 358, pitch: 0 }, { yaw: 2, pitch: 0 }, 20).x).toBeCloseTo(0.4);
  });

  test("past an edge the point stays on it", () => {
    const c = { yaw: 0, pitch: 0 };
    expect(orientationToPoint(c, { yaw: -90, pitch: 0 }, 20)).toEqual({ x: 1, y: 0.5 });
    expect(orientationToPoint(c, { yaw: 90, pitch: 80 }, 20)).toEqual({ x: 0, y: 0 });
    expect(orientationToPoint(c, { yaw: 0, pitch: -80 }, 20)).toEqual({ x: 0.5, y: 1 });
    // A silly range is still a range.
    expect(orientationToPoint(c, { yaw: -0.5, pitch: 0 }, 0).x).toBeCloseTo(0.75);
  });

  test("reads the event for the way the screen is turned", () => {
    const e = { alpha: 30, beta: 12, gamma: -40 };
    expect(readOrientation(e, 0)).toEqual({ yaw: 30, pitch: 12 });
    expect(readOrientation(e, 90)).toEqual({ yaw: 30, pitch: 40 });
    expect(readOrientation(e, -90)).toEqual({ yaw: 30, pitch: -40 });
    expect(readOrientation(e, 180)).toEqual({ yaw: 30, pitch: -12 });
    expect(readOrientation({ alpha: null, beta: 1, gamma: 2 })).toBeNull();
  });
});

describe("the coalescer", () => {
  const fakeClock = () => {
    let t = 0;
    const timers = new Map<number, { at: number; fn: () => void }>();
    let id = 0;
    return {
      now: () => t,
      set: (fn: () => void, ms: number) => {
        timers.set(++id, { at: t + ms, fn });
        return id;
      },
      clear: (h: unknown) => void timers.delete(h as number),
      advance(ms: number) {
        t += ms;
        for (const [k, v] of [...timers].sort((a, b) => a[1].at - b[1].at))
          if (v.at <= t) {
            timers.delete(k);
            v.fn();
          }
      },
    };
  };

  test("sends at most one per window, always the latest", () => {
    const clock = fakeClock();
    const sent: number[] = [];
    const c = createCoalescer<number>((v) => sent.push(v), 33, clock);
    c.push(1); // first goes at once
    for (let i = 2; i <= 10; i++) {
      clock.advance(3);
      c.push(i);
    }
    expect(sent).toEqual([1]);
    clock.advance(33);
    expect(sent).toEqual([1, 10]);
    // 1 s of 120 Hz input → about 30 sends.
    for (let i = 0; i < 120; i++) {
      clock.advance(1000 / 120);
      c.push(100 + i);
    }
    clock.advance(40);
    expect(sent.length).toBeLessThanOrEqual(2 + 31);
    expect(sent.at(-1)).toBe(219);
  });

  test("flush sends what waits; cancel drops it", () => {
    const clock = fakeClock();
    const sent: number[] = [];
    const c = createCoalescer<number>((v) => sent.push(v), 33, clock);
    c.push(1);
    c.push(2);
    c.flush();
    expect(sent).toEqual([1, 2]);
    clock.advance(5);
    c.push(3);
    c.cancel();
    clock.advance(100);
    expect(sent).toEqual([1, 2]);
  });
});

test("notes come a step at a time", () => {
  const notes = "Open with the story. [click] Now the chart. [click] And the ask.";
  expect(notesSegment(notes, 0)).toBe("Open with the story.");
  expect(notesSegment(notes, 1)).toBe("Now the chart.");
  expect(notesSegment(notes, 2)).toBe("And the ask.");
  expect(notesSegment(notes, 9)).toBe("And the ask.");
  expect(notesSegment(null, 0)).toBeNull();
  expect(notesSegment("[click] only later", 0)).toBeNull();
});

describe("remote messages", () => {
  test("a command needs a dotted id, a seq and small object params", () => {
    expect(parseCommand({ type: "command", id: "nav.next", seq: 1 })).toEqual({
      id: "nav.next",
      params: {},
      seq: 1,
    });
    expect(
      parseCommand({ type: "command", id: "present.laserAt", seq: 2, params: { x: 0.5, y: 0.2 } }),
    ).toEqual({ id: "present.laserAt", params: { x: 0.5, y: 0.2 }, seq: 2 });
    expect(parseCommand({ type: "command", id: "next", seq: 1 })).toBeNull();
    expect(parseCommand({ type: "command", id: "nav.next()", seq: 1 })).toBeNull();
    expect(parseCommand({ type: "command", id: "__proto__.x", seq: 1 })).toBeNull();
    expect(parseCommand({ type: "command", id: "nav.next", seq: -1 })).toBeNull();
    expect(parseCommand({ type: "command", id: "nav.next", seq: 1.5 })).toBeNull();
    expect(parseCommand({ type: "command", id: "nav.next", seq: 1, params: [1] })).toBeNull();
    expect(parseCommand({ type: "command", id: "nav.next", seq: 1, params: "x" })).toBeNull();
    const big = { s: "x".repeat(MAX_COMMAND_PARAMS) };
    expect(parseCommand({ type: "command", id: "nav.next", seq: 1, params: big })).toBeNull();
    expect(parseCommand({ type: "nav", id: "nav.next", seq: 1 })).toBeNull();
    expect(parseCommand(null)).toBeNull();
  });

  test("a result keeps small values, trims errors, checks its fields", () => {
    expect(
      parseCommandResult({ type: "command:result", to: "p1", seq: 3, ok: true, value: 1 }),
    ).toEqual({
      to: "p1",
      seq: 3,
      ok: true,
      value: 1,
    });
    const r = parseCommandResult({
      type: "command:result",
      seq: 3,
      ok: false,
      error: "e".repeat(2000),
      value: "v".repeat(20_000),
    });
    expect(r?.error?.length).toBe(500);
    expect(r && "value" in r).toBe(false);
    expect(parseCommandResult({ type: "command:result", seq: 3, ok: "yes" })).toBeNull();
    expect(parseCommandResult({ type: "command:result", seq: 3, ok: true, to: 5 })).toBeNull();
    expect(wireResult({ ok: true, value: "v".repeat(20_000) })).toEqual({ ok: true });
    expect(wireResult({ ok: false, code: "failed", error: "no" })).toEqual({
      ok: false,
      error: "no",
    });
  });

  test("a state must look like one", () => {
    const state: RemoteState = {
      slide: { index: 2, h: 2, v: 0, id: "s2", title: "Hi", click: 1, clicks: 3 },
      total: 9,
      blackout: false,
      overview: false,
      pointer: true,
      spotlight: false,
      drawing: false,
      hints: false,
      zoomed: false,
      colorScheme: "dark",
      theme: "minimal",
      startedAt: 1,
    };
    expect(parseRemoteState({ type: "remote:state", state })).toEqual(state);
    expect(parseRemoteState({ type: "remote:state", state: { ...state, total: -1 } })).toBeNull();
    expect(parseRemoteState({ type: "remote:state", state: { ...state, blackout: 1 } })).toBeNull();
    expect(
      parseRemoteState({
        type: "remote:state",
        state: { ...state, slide: { ...state.slide, h: "2" } },
      }),
    ).toBeNull();
    expect(parseRemoteState({ type: "state", state })).toBeNull();
  });
});

describe("the dev relay", () => {
  const peer = () => {
    const inbox: RelayOut[] = [];
    const p: RelayPeer & { inbox: RelayOut[]; last(op?: string): RelayOut | undefined } = {
      inbox,
      send: (m) => inbox.push(m),
      last: (op) => [...inbox].reverse().find((m) => !op || m.op === op),
    };
    return p;
  };
  type Hosted = Extract<RelayOut, { op: "hosted" }>;
  type Joined = Extract<RelayOut, { op: "joined" }>;
  const setup = () => {
    let t = 1_000;
    const relay = createRelay({ urls: () => ["http://192.168.1.4:5173/talk/"], now: () => t });
    const host = peer();
    relay.message(host, { op: "host" });
    const hosted = host.last("hosted") as Hosted;
    const code = () => (host.last("hosted") as Hosted).code;
    const pair = (phone = peer(), address?: string) => {
      relay.message(phone, { op: "join", code: code() }, address);
      return phone;
    };
    return { relay, host, hosted, code, pair, tick: (ms: number) => (t += ms) };
  };
  const state = {
    slide: { index: 0, h: 0, v: 0, id: null, title: null, click: 0, clicks: 0 },
    total: 3,
    blackout: true,
    overview: false,
    pointer: false,
    spotlight: false,
    drawing: false,
    hints: false,
    zoomed: false,
    colorScheme: "light",
    theme: "minimal",
    startedAt: null,
  };

  test("a host is given a place, a code that works for a minute, and the network addresses", () => {
    const { hosted, relay } = setup();
    expect(hosted.code).toMatch(CODE);
    expect(hosted.id).toMatch(/^[a-z0-9]{12}$/);
    expect(hosted.ttl).toBe(CODE_TTL);
    expect(hosted.urls).toEqual(["http://192.168.1.4:5173/talk/"]);
    expect(hosted.remotes).toBe(0);
    expect(relay.stats()).toEqual({ pairs: 1, hosts: 1, phones: 0 });
  });

  test("a phone with the code is paired and given a lease; the host gets the next code", () => {
    const { relay, host, hosted, pair } = setup();
    const phone = pair();
    const joined = phone.last() as Joined;
    expect(joined).toMatchObject({ op: "joined", host: true });
    expect(joined.lease).toMatch(/^[a-z0-9]{24}$/);
    const next = host.last("hosted") as Hosted;
    expect(next).toMatchObject({ remotes: 1, paired: true });
    expect(next.code).not.toBe(hosted.code);
    relay.leave(phone);
    expect(host.last()).toEqual({ op: "remotes", count: 0 });
  });

  test("the code rotates while the QR is up; the previous one works until its minute is out", () => {
    const { relay, host, hosted, tick } = setup();
    relay.message(host, { op: "rotate" });
    expect((host.last("hosted") as Hosted).code).toBe(hosted.code);
    tick(ROTATE_MS + 1);
    relay.message(host, { op: "rotate" });
    const second = host.last("hosted") as Hosted;
    expect(second.code).not.toBe(hosted.code);
    // A phone that was mid-scan of the first code still gets in …
    const late = peer();
    relay.message(late, { op: "join", code: hosted.code });
    expect(late.last()?.op).toBe("joined");
    // … but not once the code's minute is out.
    tick(CODE_TTL);
    const later = peer();
    relay.message(later, { op: "join", code: second.code });
    expect((later.last() as { reason: string }).reason).toMatch(/expired/);
  });

  test("a code works once", () => {
    const { relay, hosted, pair } = setup();
    pair();
    const again = peer();
    relay.message(again, { op: "join", code: hosted.code });
    expect(again.last()?.op).toBe("denied");
  });

  test("one phone at a time: the newest replaces the one before, whose lease stops working", () => {
    const { relay, host, pair } = setup();
    const a = pair();
    const leaseA = (a.last() as Joined).lease;
    const b = pair();
    expect(a.last()).toEqual({ op: "bye", reason: TAKEN_OVER });
    expect(b.last()?.op).toBe("joined");
    expect(relay.stats().phones).toBe(1);
    expect(host.last("remotes")).toEqual({ op: "remotes", count: 1 });
    // a's commands go nowhere now, and its lease does not bring it back.
    const n = host.inbox.length;
    relay.message(a, { op: "msg", data: { type: "command", id: "nav.next", seq: 1 } });
    expect(host.inbox.length).toBe(n);
    const back = peer();
    relay.message(back, { op: "join", lease: leaseA });
    expect((back.last() as { reason: string }).reason).toMatch(/no longer the remote/);
  });

  test("the paired phone comes back with its lease after a dropped connection", () => {
    const { relay, host, pair } = setup();
    const a = pair();
    const lease = (a.last() as Joined).lease;
    relay.leave(a);
    const again = peer();
    relay.message(again, { op: "join", lease });
    expect(again.last()).toMatchObject({ op: "joined", host: true, lease });
    expect(host.last("remotes")).toEqual({ op: "remotes", count: 1 });
  });

  test("the phone that used a code may say it again (a page mounted twice); nobody else may", () => {
    const { relay, host, hosted } = setup();
    const device = "0123456789abcdef0123";
    const first = peer();
    relay.message(first, { op: "join", code: hosted.code, device });
    const lease = (first.last() as Joined).lease;
    relay.leave(first);
    const second = peer();
    relay.message(second, { op: "join", code: hosted.code, device });
    expect(second.last()).toMatchObject({ op: "joined", lease });
    expect(host.last("remotes")).toEqual({ op: "remotes", count: 1 });
    const stranger = peer();
    relay.message(stranger, { op: "join", code: hosted.code, device: "ffffffffffffffffffff" });
    expect(stranger.last()?.op).toBe("denied");
  });

  test("a wrong code is refused, and guessing is limited per address", () => {
    const { relay, pair } = setup();
    const phone = peer();
    for (let i = 0; i < 5; i++) relay.message(phone, { op: "join", code: "AAAAAA" }, "10.0.0.9");
    expect(phone.last()?.op).toBe("denied");
    // Locked out now, even with the right code, from that address only.
    pair(phone, "10.0.0.9");
    expect((phone.last() as { reason: string }).reason).toMatch(/Too many/);
    const other = pair(peer(), "10.0.0.10");
    expect(other.last()?.op).toBe("joined");
  });

  test("without an address, guesses count per connection and in all", () => {
    const { relay, pair } = setup();
    const guesser = peer();
    for (let i = 0; i < 5; i++) relay.message(guesser, { op: "join", code: "AAAAAA" });
    pair(guesser);
    expect((guesser.last() as { reason: string }).reason).toMatch(/Too many/);
    const honest = pair();
    expect(honest.last()?.op).toBe("joined");
    // A script opening a new connection for every guess still hits the overall limit.
    for (let i = 0; i < 60; i++) relay.message(peer(), { op: "join", code: "BBBBBB" });
    const late = pair();
    expect((late.last() as { reason: string }).reason).toMatch(/Too many/);
  });

  test("lockouts expire", () => {
    const { relay, pair, tick, host } = setup();
    const phone = peer();
    for (let i = 0; i < 5; i++) relay.message(phone, { op: "join", code: "AAAAAA" }, "a");
    tick(ROTATE_MS + 1);
    relay.message(host, { op: "rotate" });
    tick(ROTATE_MS + 1);
    relay.message(host, { op: "rotate" });
    pair(phone, "a");
    expect(phone.last()?.op).toBe("joined");
  });

  test("commands go to the host stamped with the phone; answers come back to it", () => {
    const { relay, host, pair } = setup();
    const a = pair();
    relay.message(a, { op: "msg", data: { type: "command", id: "nav.next", seq: 7 } });
    const cmd = host.last("msg") as Extract<RelayOut, { op: "msg" }>;
    expect(cmd.data).toMatchObject({ type: "command", id: "nav.next", seq: 7, params: {} });
    const from = (cmd.data as { from: string }).from;
    relay.message(host, {
      op: "msg",
      data: { type: "command:result", to: from, seq: 7, ok: true, value: { index: 1 } },
    });
    expect(a.last()).toEqual({
      op: "msg",
      data: { type: "command:result", seq: 7, ok: true, value: { index: 1 } },
    });
    // An answer addressed to anyone else goes nowhere.
    const n = a.inbox.length;
    relay.message(host, { op: "msg", data: { type: "command:result", to: "x", seq: 8, ok: true } });
    expect(a.inbox.length).toBe(n);
  });

  test("state goes to the window's phone, and to no other window's", () => {
    const { relay, host, pair } = setup();
    const otherHost = peer();
    relay.message(otherHost, { op: "host" });
    const otherCode = (otherHost.last("hosted") as Hosted).code;
    const a = pair();
    const stranger = peer();
    relay.message(stranger, { op: "join", code: otherCode });
    const n = stranger.inbox.length;
    relay.message(host, { op: "msg", data: { type: "remote:state", state } });
    expect(a.last()).toEqual({ op: "msg", data: { type: "remote:state", state } });
    expect(stranger.inbox.length).toBe(n);
  });

  test("a phone cannot answer, push state, rotate or kick; junk is dropped", () => {
    const { relay, host, pair } = setup();
    const a = pair();
    const hostSeen = host.inbox.length;
    relay.message(a, { op: "msg", data: { type: "command:result", to: "p1", seq: 1, ok: true } });
    relay.message(a, { op: "msg", data: { type: "remote:state", state: {} } });
    relay.message(a, { op: "msg", data: { type: "command", id: "bad id", seq: 1 } });
    relay.message(a, { op: "kick" });
    relay.message(a, { op: "rotate" });
    relay.message(a, "not an object");
    relay.message(a, { op: "nope" });
    expect(host.inbox.length).toBe(hostSeen);
    // A stranger that never joined reaches nobody.
    const stranger = peer();
    relay.message(stranger, { op: "msg", data: { type: "command", id: "nav.next", seq: 1 } });
    expect(host.inbox.length).toBe(hostSeen);
  });

  test("without its host, a phone's command fails at once and the phone is told", () => {
    const { relay, host, pair } = setup();
    const a = pair();
    relay.leave(host);
    expect(a.last()).toEqual({ op: "host", online: false });
    relay.message(a, { op: "msg", data: { type: "command", id: "nav.next", seq: 4 } });
    expect(a.last()).toMatchObject({
      op: "msg",
      data: { type: "command:result", seq: 4, ok: false },
    });
  });

  test("a reloaded host gets its place back and its phone stays paired", () => {
    const { relay, host, hosted, pair } = setup();
    const a = pair();
    relay.leave(host);
    const again = peer();
    relay.message(again, { op: "host", id: hosted.id });
    expect(again.last("hosted")).toMatchObject({ id: hosted.id, remotes: 1 });
    expect(a.last()).toEqual({ op: "host", online: true });
  });

  test("a place another window holds is not handed over", () => {
    const { relay, hosted } = setup();
    const thief = peer();
    relay.message(thief, { op: "host", id: hosted.id });
    expect((thief.last("hosted") as Hosted).id).not.toBe(hosted.id);
  });

  test("after a dev server restart, the old place can be hosted again", () => {
    const relay = createRelay();
    const host = peer();
    relay.message(host, { op: "host", id: "abcdef123456" });
    expect(host.last("hosted")).toMatchObject({ id: "abcdef123456" });
    const junk = peer();
    relay.message(junk, { op: "host", id: "NOT AN ID" });
    expect((junk.last("hosted") as Hosted).id).toMatch(/^[a-z0-9]{12}$/);
  });

  test("kick disconnects the phone, voids its lease and every code shown so far", () => {
    const { relay, host, pair, code } = setup();
    const shown = code();
    const a = pair();
    const lease = (a.last() as Joined).lease;
    const unused = code();
    relay.message(host, { op: "kick" });
    expect(a.last()).toEqual({ op: "bye", reason: "The presenter disconnected this phone." });
    const next = host.last("hosted") as Hosted;
    expect([shown, unused]).not.toContain(next.code);
    expect(next.remotes).toBe(0);
    for (const hello of [{ code: unused }, { lease }]) {
      const late = peer();
      relay.message(late, { op: "join", ...hello });
      expect(late.last()?.op).toBe("denied");
    }
    const n = host.inbox.length;
    relay.message(a, { op: "msg", data: { type: "command", id: "nav.next", seq: 1 } });
    expect(host.inbox.length).toBe(n);
  });

  test("idle places are forgotten", () => {
    const { relay, host, tick } = setup();
    relay.leave(host);
    tick(31 * 60_000);
    relay.message(peer(), { op: "leave" });
    expect(relay.stats().pairs).toBe(0);
  });
});

describe("the laser's off", () => {
  // A link whose answers the test decides, and whose status it moves.
  function fakeLink() {
    const status = createStore<RemoteStatus>("open");
    const sent: string[] = [];
    const answers: ((a: Answer) => void)[] = [];
    return {
      status,
      sent,
      answer: (ok: boolean) =>
        answers.shift()?.({ ok, ...(ok ? {} : { error: "Not connected." }) }),
      run(id: string) {
        sent.push(id);
        return new Promise<Answer>((r) => answers.push(r));
      },
    };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  test("an off that got no answer is sent again when the link is open again", async () => {
    const link = fakeLink();
    const off = laserOff(link);
    off.off();
    link.answer(false); // lost to a blip
    await tick();
    link.status.set("closed");
    link.status.set("open");
    expect(link.sent).toEqual(["present.laserOff", "present.laserOff"]);
    link.answer(true);
    await tick();
    link.status.set("closed");
    link.status.set("open");
    expect(link.sent.length).toBe(2); // paid: not sent again
    off.dispose();
  });

  test("a new touch cancels an off still owed, so it cannot switch the new laser off", async () => {
    const link = fakeLink();
    const off = laserOff(link);
    off.off();
    link.answer(false);
    await tick();
    off.aiming();
    link.status.set("closed");
    link.status.set("open");
    expect(link.sent).toEqual(["present.laserOff"]);
    off.dispose();
  });

  test("while the link stays open, a failed off is tried again (twice)", async () => {
    const link = fakeLink();
    const off = laserOff(link, 1);
    off.off();
    link.answer(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(link.sent.length).toBe(2);
    link.answer(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(link.sent.length).toBe(3);
    link.answer(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(link.sent.length).toBe(3); // no more while open; the next reopen still sends it
    link.status.set("closed");
    link.status.set("open");
    expect(link.sent.length).toBe(4);
    off.dispose();
  });

  test("an answered off owes nothing; a late answer to an older one does not pay a newer one", async () => {
    const link = fakeLink();
    const off = laserOff(link);
    off.off(); // first attempt, answer still out
    off.off(); // second
    link.answer(true); // the first one's answer
    await tick();
    link.status.set("waiting");
    link.status.set("open");
    expect(link.sent.length).toBe(3);
    off.dispose();
  });
});
