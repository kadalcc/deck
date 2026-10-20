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

const saved = { window: globalThis.window, WebSocket: globalThis.WebSocket };
beforeAll(() => {
  (globalThis as { window?: unknown }).window = {
    location: { protocol: "https:", host: "deck.test" },
  };
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
});
afterAll(() => {
  (globalThis as { window?: unknown }).window = saved.window;
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
});
