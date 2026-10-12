import { afterEach, describe, expect, test } from "bun:test";

import {
  isTicket,
  presenterTicket,
  splitFromHash,
  viewerPass,
  withTicket,
} from "../live/ticket.ts";
import { readHostOverride, resolveConfig, withHostOverride } from "./model.ts";
import { persists, readItem, writeItem } from "./storage.ts";
import { type BusHost, createWindowBus } from "./windows.ts";

/**
 * A deck served sandboxed runs in an opaque origin: storage throws, every window is an origin of
 * its own, and the presenter's credential is a ticket. These pin the pieces that make it work.
 */

const T = "v1.dabc123def456.mabcdef.nonce123.sig_-x";

describe("storage in an opaque origin", () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, "localStorage", saved);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test("a throwing localStorage falls back to memory for the page", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    expect(persists()).toBe(false);
    expect(readItem("deck.test.a")).toBeNull();
    writeItem("deck.test.a", "on");
    expect(readItem("deck.test.a")).toBe("on");
  });

  test("a working localStorage is used, and read back", () => {
    const map = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
      },
    });
    expect(persists()).toBe(true);
    writeItem("deck.test.b", "x");
    expect(map.get("deck.test.b")).toBe("x");
    expect(readItem("deck.test.b")).toBe("x");
  });
});

describe("the presenter ticket in a fragment", () => {
  afterEach(() => {
    presenterTicket.set(null);
    viewerPass.set(null);
  });

  test("alone, or after a slide position, and the fragment is given back without it", () => {
    expect(splitFromHash(`#ticket=${T}`)).toEqual({ value: T, hash: "" });
    expect(splitFromHash(`#/3/1/2&ticket=${T}`)).toEqual({ value: T, hash: "#/3/1/2" });
    expect(splitFromHash(`#ticket=${T}&kdpass=${T}`, "kdpass")).toEqual({
      value: T,
      hash: `#ticket=${T}`,
    });
    expect(splitFromHash("#/3/1")).toEqual({ value: null, hash: "#/3/1" });
  });

  test("anything that isn't a ticket is dropped (and still removed from the fragment)", () => {
    expect(splitFromHash("#/2&ticket=<script>")).toEqual({ value: null, hash: "#/2" });
    expect(isTicket("short")).toBe(false);
    expect(isTicket(T)).toBe(true);
  });

  test("a window this one opens for the same presenter gets it in its fragment", () => {
    expect(withTicket("#/1")).toBe("#/1");
    presenterTicket.set(T);
    expect(withTicket("#/1/0/2")).toBe(`#/1/0/2&ticket=${T}`);
    expect(withTicket("")).toBe(`#ticket=${T}`);
    expect(splitFromHash(withTicket("#/4")).value).toBe(T);
  });
});

describe("host override: the verification page", () => {
  const built = resolveConfig({ slug: "@ana/x" });
  test("a same-site path is taken; anything else is ignored", () => {
    expect(
      withHostOverride(built, readHostOverride({ __KADAL_DECK__: { verify: "/_kd/verify" } })).live
        .verify,
    ).toBe("/_kd/verify");
    for (const bad of ["//evil.example/x", "https://evil.example/", "javascript:alert(1)", 3])
      expect(readHostOverride({ __KADAL_DECK__: { verify: bad } })?.verify).toBeUndefined();
    expect(built.live.verify).toBeUndefined();
  });
});

/* ── the window bus ──────────────────────────────────────────────────────── */

type Listener = (e: MessageEvent) => void;
interface FakeWindow extends BusHost {
  name: string;
  closed: boolean;
  listeners: Set<Listener>;
  postMessage(data: unknown, target: string): void;
}

/** Windows with opaque origins: postMessage between related windows, and no BroadcastChannel reach. */
function fakeWindow(name: string, opener: FakeWindow | null = null): FakeWindow {
  const w: FakeWindow = {
    name,
    closed: false,
    opener,
    listeners: new Set(),
    addEventListener: (_t, fn) => void w.listeners.add(fn),
    removeEventListener: (_t, fn) => void w.listeners.delete(fn),
    postMessage(data) {
      // Delivered synchronously, with the sender as `source`; the receiver's handler runs (and
      // relays) as the receiver.
      const source = current;
      const before = current;
      current = w;
      try {
        for (const l of [...w.listeners]) l({ data, source } as unknown as MessageEvent);
      } finally {
        current = before;
      }
    },
  };
  return w;
}
let current: FakeWindow | null = null;
const as = <R>(w: FakeWindow, fn: () => R): R => {
  const before = current;
  current = w;
  try {
    return fn();
  } finally {
    current = before;
  }
};

describe("window bus between opaque-origin windows", () => {
  test("play → presenter → projector: a move reaches the whole chain once, with how it came", () => {
    const play = fakeWindow("play");
    const presenter = fakeWindow("presenter", play);
    const projector = fakeWindow("projector", presenter);
    const busPlay = createWindowBus<{ n: number }>("d", play);
    const busPresenter = as(presenter, () => createWindowBus<{ n: number }>("d", presenter));
    const busProjector = as(projector, () => createWindowBus<{ n: number }>("d", projector));
    busPlay.adopt(presenter);
    busPresenter.adopt(projector);
    const got: Record<string, string[]> = { play: [], presenter: [], projector: [] };
    busPlay.subscribe((m) => got.play!.push(`${m.data.n}:${m.via}`));
    busPresenter.subscribe((m) => got.presenter!.push(`${m.data.n}:${m.via}`));
    busProjector.subscribe((m) => got.projector!.push(`${m.data.n}:${m.via}`));

    as(presenter, () => busPresenter.post({ n: 1 }));
    expect(got.play).toEqual(["1:child"]);
    expect(got.projector).toEqual(["1:opener"]);
    expect(got.presenter).toEqual([]);

    as(play, () => busPlay.post({ n: 2 }));
    expect(got.presenter).toEqual(["2:opener"]);
    // Passed on by the presenter, once.
    expect(got.projector).toEqual(["1:opener", "2:opener"]);

    as(projector, () => busProjector.post({ n: 3 }));
    expect(got.presenter).toEqual(["2:opener", "3:child"]);
    expect(got.play).toEqual(["1:child", "3:child"]);
  });

  test("a window with no relation to this one is not on the bus", () => {
    const me = fakeWindow("me");
    const stranger = fakeWindow("stranger");
    const bus = createWindowBus<string>("d", me);
    const got: string[] = [];
    bus.subscribe((m) => got.push(m.data));
    as(stranger, () => me.postMessage({ "kadal-deck:bus": "d", id: "x1", data: "hi" }, "*"));
    expect(got).toEqual([]);
  });

  test("a stand-in from a desktop shell (no postMessage) or null is ignored, not thrown on", () => {
    const me = fakeWindow("me");
    const bus = createWindowBus<string>("d", me);
    bus.adopt(null);
    bus.adopt({ closed: false, close() {}, focus() {} });
    expect(() => bus.post("x")).not.toThrow();
  });

  test("a BroadcastChannel that throws on construction doesn't take the bus down", () => {
    const me = fakeWindow("me");
    me.BroadcastChannel = class {
      constructor() {
        throw new DOMException("no", "SecurityError");
      }
    } as unknown as typeof BroadcastChannel;
    expect(() => createWindowBus("d", me).post("x")).not.toThrow();
  });
});

describe("window bus when a channel ALSO reaches the other window", () => {
  // A desktop shell relays BroadcastChannel between a deck's windows even in opaque origins, so a
  // message can arrive twice: over the channel and over postMessage. It must count once.
  test("a message heard on both paths is delivered once", () => {
    const channels = new Map<
      string,
      Set<{ onmessage: ((e: MessageEvent) => void) | null; self: unknown }>
    >();
    class FakeChannel {
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor(private readonly name: string) {
        if (!channels.has(name)) channels.set(name, new Set());
        channels.get(name)!.add(this as never);
      }
      postMessage(data: unknown) {
        for (const c of channels.get(this.name) ?? [])
          if (c !== (this as unknown)) c.onmessage?.({ data } as MessageEvent);
      }
      close() {
        channels.get(this.name)?.delete(this as never);
      }
    }
    const play = fakeWindow("play");
    const presenter = fakeWindow("presenter", play);
    play.BroadcastChannel = FakeChannel as unknown as typeof BroadcastChannel;
    presenter.BroadcastChannel = FakeChannel as unknown as typeof BroadcastChannel;
    const busPlay = createWindowBus<number>("d", play);
    const busPresenter = as(presenter, () => createWindowBus<number>("d", presenter));
    busPlay.adopt(presenter);
    const got: string[] = [];
    busPresenter.subscribe((m) => got.push(`${m.data}:${m.via}`));
    as(play, () => busPlay.post(7));
    expect(got).toEqual(["7:channel"]);
  });
});
