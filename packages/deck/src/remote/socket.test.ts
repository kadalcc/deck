import { describe, expect, test } from "bun:test";

import { resolveConfig } from "../core/model.ts";
import type { DevRelay } from "../core/model.ts";
import { writeItem } from "../core/storage.ts";
import {
  createSocketRelay,
  pageRelay,
  relayAddress,
  relayChoice,
  type SocketDeps,
} from "./socket.ts";

describe("remote.relay in the deck", () => {
  test("defaults to none and merges like the other groups", () => {
    expect(resolveConfig().remote).toEqual({ relay: null });
    expect(resolveConfig({ remote: { relay: "wss://r.example" } }).remote.relay).toBe(
      "wss://r.example",
    );
  });
});

describe("a relay's address", () => {
  test("is a WebSocket URL; http(s) becomes ws(s)", () => {
    expect(relayAddress("wss://relay.example.com")).toBe("wss://relay.example.com/");
    expect(relayAddress("https://a.trycloudflare.com/")).toBe("wss://a.trycloudflare.com/");
    expect(relayAddress("http://192.168.1.4:4174")).toBe("ws://192.168.1.4:4174/");
    expect(relayAddress(" ws://localhost:4174/#x ")).toBe("ws://localhost:4174/");
  });

  test("is nothing else", () => {
    for (const bad of [
      "",
      "  ",
      "relay.example.com",
      "javascript:alert(1)",
      "ftp://x",
      "wss://u:p@x",
    ])
      expect(relayAddress(bad)).toBeNull();
    expect(relayAddress(null)).toBeNull();
    expect(relayAddress(42)).toBeNull();
  });
});

describe("which relay a page uses", () => {
  const none = { remote: { relay: null } };
  const deck = { remote: { relay: "wss://deck.example" } };

  test("the deck's, unless the address names one", () => {
    writeItem("deck.remote.relay", "", "session");
    expect(relayChoice(none, "")).toBeNull();
    expect(relayChoice(deck, "")).toEqual({ url: "wss://deck.example/", fromAddress: false });
    expect(relayChoice(deck, "?relay=ws%3A%2F%2F10.0.0.2%3A4174")).toEqual({
      url: "ws://10.0.0.2:4174/",
      fromAddress: true,
    });
  });

  test("an address's relay is kept for the tab, and `?relay=` alone forgets it", () => {
    writeItem("deck.remote.relay", "", "session");
    relayChoice(none, "?relay=wss://kept.example");
    expect(relayChoice(none, "")).toEqual({ url: "wss://kept.example/", fromAddress: true });
    expect(relayChoice(deck, "?relay=")).toEqual({
      url: "wss://deck.example/",
      fromAddress: false,
    });
    expect(relayChoice(none, "")).toBeNull();
  });

  test("a relay that is not one is ignored", () => {
    writeItem("deck.remote.relay", "", "session");
    expect(relayChoice(none, "?relay=javascript:alert(1)")).toBeNull();
    expect(relayChoice({ remote: true } as never, "")).toBeNull();
  });

  test("the dev server's relay, unless the address names another; the QR carries that one", () => {
    writeItem("deck.remote.relay", "", "session");
    const dev: DevRelay = { send() {}, on: () => () => {}, onStatus: () => () => {} };
    expect(pageRelay(dev, deck, "")?.relay).toBe(dev);
    expect(pageRelay(null, none, "")).toBeNull();
    const fromDeck = pageRelay(null, deck, "")!;
    expect(fromDeck.socket?.url).toBe("wss://deck.example/");
    expect(fromDeck.search).toBe("");
    const named = pageRelay(dev, none, "?relay=wss://named.example")!;
    expect(named.socket?.url).toBe("wss://named.example/");
    expect(named.search).toBe("&relay=wss%3A%2F%2Fnamed.example%2F");
    writeItem("deck.remote.relay", "", "session");
  });
});

/** A WebSocket stand-in and a clock the test turns. */
function fakes() {
  const sockets: Array<{
    url: string;
    sent: string[];
    readyState: number;
    onopen: ((e: unknown) => void) | null;
    onclose: ((e: unknown) => void) | null;
    onerror: ((e: unknown) => void) | null;
    onmessage: ((e: { data: unknown }) => void) | null;
    send(t: string): void;
    close(): void;
    open(): void;
    drop(): void;
    say(m: unknown): void;
  }> = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const deps: SocketDeps = {
    open(url) {
      const s = {
        url,
        sent: [] as string[],
        readyState: 0,
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        send(t: string) {
          s.sent.push(t);
        },
        close() {},
        open() {
          s.readyState = 1;
          s.onopen?.({});
        },
        drop() {
          s.readyState = 3;
          s.onclose?.({});
        },
        say(m: unknown) {
          s.onmessage?.({ data: JSON.stringify(m) });
        },
      } as (typeof sockets)[number];
      sockets.push(s);
      return s as never;
    },
    setTimeout(fn, ms) {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout() {},
  };
  return { sockets, timers, deps };
}

describe("the WebSocket line to a relay", () => {
  test("connects on the first send, holds it until open, then says it is up", () => {
    const { sockets, deps } = fakes();
    const r = createSocketRelay("ws://r.test/", deps);
    const status: boolean[] = [];
    r.onStatus((up) => void status.push(up));
    expect(sockets.length).toBe(0);
    r.send({ op: "join", code: "ABCDEF" });
    expect(sockets.length).toBe(1);
    expect(sockets[0]!.sent).toEqual([]);
    sockets[0]!.open();
    expect(sockets[0]!.sent).toEqual(['{"op":"join","code":"ABCDEF"}']);
    expect(status).toEqual([true]);
  });

  test("passes the relay's messages on, and reconnects while someone listens", () => {
    const { sockets, timers, deps } = fakes();
    const r = createSocketRelay("ws://r2.test/", deps);
    const heard: unknown[] = [];
    const status: boolean[] = [];
    r.on((m) => void heard.push(m));
    r.onStatus((up) => void status.push(up));
    r.send({ op: "leave" });
    sockets[0]!.open();
    sockets[0]!.say({ op: "remotes", count: 1 });
    expect(heard).toEqual([{ op: "remotes", count: 1 }]);
    sockets[0]!.drop();
    expect(status).toEqual([true, false]);
    expect(r.problem.get()).toContain("Cannot reach the remote relay at ws://r2.test/");
    expect(timers.map((t) => t.ms)).toEqual([1000]);
    timers[0]!.fn();
    expect(sockets.length).toBe(2);
    sockets[1]!.open();
    expect(status).toEqual([true, false, true]);
    expect(r.problem.get()).toBeNull();
  });

  test("asks for the password when hosting, and hosts again with it", () => {
    const { sockets, deps } = fakes();
    const r = createSocketRelay("ws://r3.test/", deps);
    const heard: unknown[] = [];
    r.on((m) => void heard.push(m));
    r.send({ op: "host", id: "abcdefghijkl" });
    sockets[0]!.open();
    expect(JSON.parse(sockets[0]!.sent[0]!)).toEqual({ op: "host", id: "abcdefghijkl" });
    sockets[0]!.say({ op: "denied", auth: true, reason: "This relay asks for its password." });
    expect(r.auth.get()).toBe("This relay asks for its password.");
    // The page never hears an auth refusal as a pairing one.
    expect(heard).toEqual([]);
    r.give("pw-1");
    expect(r.auth.get()).toBeNull();
    expect(JSON.parse(sockets[0]!.sent[1]!)).toEqual({
      op: "host",
      id: "abcdefghijkl",
      key: "pw-1",
    });
    sockets[0]!.say({
      op: "hosted",
      id: "abcdefghijkl",
      code: "ABCDEF",
      ttl: 1,
      remotes: 0,
      urls: [],
    });
    expect(heard.length).toBe(1);
    // Kept for the tab: a new line to the same relay hosts with it at once.
    const again = createSocketRelay("ws://r3.test/", deps);
    again.send({ op: "host" });
    sockets[1]!.open();
    expect(JSON.parse(sockets[1]!.sent[0]!)).toEqual({ op: "host", key: "pw-1" });
  });

  test("forgets a kept password the relay refuses", () => {
    const { sockets, deps } = fakes();
    writeItem("deck.remote.key.ws://r4.test/", "old", "session");
    const r = createSocketRelay("ws://r4.test/", deps);
    r.send({ op: "host" });
    sockets[0]!.open();
    expect(JSON.parse(sockets[0]!.sent[0]!).key).toBe("old");
    sockets[0]!.say({ op: "denied", auth: true, reason: "That is not the relay's password." });
    r.send({ op: "host" });
    expect(JSON.parse(sockets[0]!.sent[1]!).key).toBeUndefined();
  });
});
