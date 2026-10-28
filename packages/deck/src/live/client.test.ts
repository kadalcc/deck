import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { RoomClient } from "./client.ts";
import type { ServerMessage } from "./protocol.ts";

/** A WebSocket that opens and closes when the test says so. */
class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  // The test drives these.
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  closed() {
    this.readyState = 3;
    this.onclose?.();
  }
  receive(m: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}

const saved = {
  hadWindow: "window" in globalThis,
  window: globalThis.window,
  WebSocket: globalThis.WebSocket,
};
beforeAll(() => {
  (globalThis as { window?: unknown }).window = {
    location: { protocol: "https:", host: "deck.test" },
  };
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
});
afterAll(() => {
  // Put back exactly what was there: a `window` left defined as undefined still answers `in`.
  if (saved.hadWindow) (globalThis as { window?: unknown }).window = saved.window;
  else delete (globalThis as { window?: unknown }).window;
  (globalThis as { WebSocket?: unknown }).WebSocket = saved.WebSocket;
});

describe("the room client", () => {
  test("a socket closed by a quick close-and-connect cannot leave a second one behind", async () => {
    FakeSocket.all = [];
    const client = new RoomClient({ api: "/api", room: "talk", role: "presenter", viewer: "v1" });
    const seen: string[] = [];
    client.on((m) => seen.push(m.type));
    // A remount: connect, close, connect again before the first socket has finished closing.
    client.connect();
    client.close();
    client.connect();
    const [first, second] = FakeSocket.all;
    second!.open();
    // The first socket's close arrives late. It must not null the live socket or reconnect.
    first!.closed();
    await new Promise((r) => setTimeout(r, 700));
    expect(FakeSocket.all.length).toBe(2);
    expect(client.status.get()).toBe("open");
    // Only the live socket speaks for the client.
    first!.receive({ type: "pong" });
    second!.receive({ type: "pong" });
    expect(seen).toEqual(["pong"]);
    expect(client.sendNow({ type: "ping" })).toBe(true);
    expect(second!.sent.at(-1)).toEqual({ type: "ping" });
    client.close();
  });

  test("a phone remote pairs in its hello, never on the URL", () => {
    FakeSocket.all = [];
    const client = new RoomClient({
      api: "/api",
      room: "talk",
      role: "presenter",
      viewer: "v2",
      client: "remote",
      pairing: () => ({ pair: "ABCDEFGHJKMNPQRSTUVW", device: "d".repeat(32) }),
    });
    client.connect();
    const ws = FakeSocket.all[0]!;
    expect(ws.url).toBe("wss://deck.test/api/rooms/talk/ws?role=remote");
    ws.open();
    expect(ws.sent[0]).toEqual({
      type: "hello",
      role: "presenter",
      viewer: "v2",
      client: "remote",
      pair: "ABCDEFGHJKMNPQRSTUVW",
      device: "d".repeat(32),
    });
    client.close();
  });

  test("a presenter stepping down reconnects as a viewer, and back up as the presenter", async () => {
    FakeSocket.all = [];
    const client = new RoomClient({ api: "/api", room: "talk", role: "presenter", viewer: "v1" });
    client.connect();
    await Promise.resolve();
    FakeSocket.all[0]!.open();
    expect(FakeSocket.all[0]!.url).toContain("role=presenter");
    client.setAway(true);
    await Promise.resolve();
    const down = FakeSocket.all.at(-1)!;
    expect(down.url).toContain("role=viewer");
    down.open();
    expect((down.sent[0] as { role: string }).role).toBe("viewer");
    client.setAway(true); // already away: nothing new
    await Promise.resolve();
    expect(FakeSocket.all.at(-1)).toBe(down);
    client.setAway(false);
    await Promise.resolve();
    const up = FakeSocket.all.at(-1)!;
    expect(up.url).toContain("role=presenter");
    up.open();
    expect((up.sent[0] as { role: string }).role).toBe("presenter");
    client.close();
    // A viewer has nothing to step down from.
    FakeSocket.all = [];
    const viewer = new RoomClient({ api: "/api", room: "talk", role: "viewer", viewer: "v2" });
    viewer.connect();
    await Promise.resolve();
    viewer.setAway(true);
    await Promise.resolve();
    expect(FakeSocket.all.length).toBe(1);
    viewer.close();
  });
  test("a held room opens no socket and retries nothing until it is released", async () => {
    FakeSocket.all = [];
    const client = new RoomClient({ api: "/api", room: "talk", role: "presenter", viewer: "v1" });
    // The presenter view holds the room before it connects (child effects run first).
    client.hold(true);
    client.connect();
    client.reconnect(); // a ticket arriving elsewhere: still held
    await new Promise((r) => setTimeout(r, 50));
    expect(FakeSocket.all.length).toBe(0);
    expect(client.status.get()).toBe("idle");
    // Released (the passcode was given): one socket, at once.
    client.hold(false);
    await Promise.resolve();
    expect(FakeSocket.all.length).toBe(1);
    // The host refuses it; the retry that follows is cancelled by holding again.
    FakeSocket.all[0]!.closed();
    client.hold(true);
    await new Promise((r) => setTimeout(r, 700));
    expect(FakeSocket.all.length).toBe(1);
    // An open socket is dropped by a hold, and its late close schedules nothing.
    client.hold(false);
    await Promise.resolve();
    const live = FakeSocket.all.at(-1)!;
    live.open();
    expect(client.status.get()).toBe("open");
    client.hold(true);
    live.closed();
    await new Promise((r) => setTimeout(r, 700));
    expect(FakeSocket.all.length).toBe(2);
    expect(client.status.get()).toBe("idle");
    // A closed client is not reopened by a release.
    client.close();
    client.hold(false);
    await Promise.resolve();
    expect(FakeSocket.all.length).toBe(2);
  });
});
