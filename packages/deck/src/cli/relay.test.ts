import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import type { Duplex } from "node:stream";

import type { RelayOut } from "../remote/relay.ts";
import {
  acceptWebSocket,
  MAX_MESSAGE,
  RELAY_BANNER,
  type RelayServer,
  relayUrls,
  startRelayServer,
  suggestedRelayUrl,
  tunnelRelayUrl,
} from "./relay.ts";
import { main } from "./index.ts";

const PASSWORD = "abcd-efgh-jkmn";
let servers: RelayServer[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
  servers = [];
});

async function relay(maxConnections?: number) {
  const s = await startRelayServer({
    port: 0,
    host: "127.0.0.1",
    password: PASSWORD,
    ...(maxConnections ? { maxConnections } : {}),
  });
  servers.push(s);
  return s;
}

/** A WebSocket client that collects what the relay says. */
async function client(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
  const got: RelayOut[] = [];
  const waiters: Array<() => void> = [];
  ws.onmessage = (e) => {
    got.push(JSON.parse(String(e.data)) as RelayOut);
    for (const w of waiters.splice(0)) w();
  };
  const closed = new Promise<number>((done) => (ws.onclose = (e) => done(e.code)));
  await new Promise<void>((done, fail) => {
    ws.onopen = () => done();
    ws.onerror = () => fail(new Error("no connection"));
  });
  return {
    ws,
    got,
    closed,
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    /** The next message with this op (one already received counts). */
    async next<O extends RelayOut["op"]>(op: O): Promise<Extract<RelayOut, { op: O }>> {
      const deadline = Date.now() + 3000;
      for (;;) {
        const i = got.findIndex((m) => m.op === op);
        if (i >= 0) return got.splice(i, 1)[0] as Extract<RelayOut, { op: O }>;
        if (Date.now() > deadline) throw new Error(`no ${op}; got ${JSON.stringify(got)}`);
        await new Promise<void>((done) => {
          waiters.push(done);
          setTimeout(done, 100);
        });
      }
    },
  };
}

describe("kadal-deck relay (the server)", () => {
  test("pairs a phone with a presenting window and carries commands both ways", async () => {
    const s = await relay();
    const host = await client(s.port);
    host.send({ op: "host", key: PASSWORD });
    const hosted = await host.next("hosted");
    expect(hosted.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(hosted.urls).toEqual([]);

    const phone = await client(s.port);
    phone.send({ op: "join", code: hosted.code, device: "d".repeat(32) });
    const joined = await phone.next("joined");
    expect(joined.host).toBe(true);
    expect(joined.lease).toMatch(/^[a-z0-9]{24}$/);
    expect((await host.next("remotes")).count).toBe(1);

    phone.send({ op: "msg", data: { type: "command", id: "nav.next", params: {}, seq: 7 } });
    const command = await host.next("msg");
    const data = command.data as { type: string; id: string; from: string; seq: number };
    expect(data).toMatchObject({ type: "command", id: "nav.next", seq: 7 });

    host.send({ op: "msg", data: { type: "command:result", to: data.from, seq: 7, ok: true } });
    expect((await phone.next("msg")).data).toEqual({ type: "command:result", seq: 7, ok: true });
    expect(s.stats()).toMatchObject({ connections: 2, hosts: 1, phones: 1 });
  });

  test("hosting takes the password; a phone needs only the code", async () => {
    const s = await relay();
    const host = await client(s.port);
    host.send({ op: "host" });
    const ask = await host.next("denied");
    expect(ask.auth).toBe(true);
    expect(ask.reason).toContain("asks for its password");
    host.send({ op: "host", key: "wrong" });
    expect((await host.next("denied")).reason).toBe("That is not the relay's password.");
    expect(s.stats().hosts).toBe(0);
    host.send({ op: "host", key: PASSWORD });
    expect((await host.next("hosted")).code).toBeTruthy();
    // Once in, the same connection hosts again (a reload of its place) without the password.
    host.send({ op: "host" });
    expect((await host.next("hosted")).code).toBeTruthy();
  });

  test("wrong passwords are limited per address", async () => {
    const s = await relay();
    const c = await client(s.port);
    for (let i = 0; i < 10; i++) {
      c.send({ op: "host", key: `guess-${i}` });
      await c.next("denied");
    }
    c.send({ op: "host", key: PASSWORD });
    expect((await c.next("denied")).reason).toContain("Too many wrong passwords");
    // A new connection from the same address is limited too.
    const again = await client(s.port);
    again.send({ op: "host", key: PASSWORD });
    expect((await again.next("denied")).reason).toContain("Too many wrong passwords");
  });

  test("a wrong pairing code is refused, as on the dev relay", async () => {
    const s = await relay();
    const phone = await client(s.port);
    phone.send({ op: "join", code: "ABCDEF" });
    const denied = await phone.next("denied");
    expect(denied.auth).toBeUndefined();
    expect(denied.reason).toContain("pairing code");
  });

  test("serves nothing over HTTP but a line saying what it is", async () => {
    const s = await relay();
    const root = await fetch(`http://127.0.0.1:${s.port}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toBe(RELAY_BANNER);
    for (const path of [
      "/index.html",
      "/__kadal/notes",
      "/__kadal/drag",
      "/__kadal/monaco-write",
      "/__kadal/source",
      "/presenter",
    ]) {
      const r = await fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: "{}" });
      expect(r.status).toBe(404);
    }
  });

  test("closes a socket that sends too much, or binary", async () => {
    const s = await relay();
    const big = await client(s.port);
    big.ws.send("x".repeat(MAX_MESSAGE + 1));
    // 1009 from Node's reader; Bun's server drops the connection (1006).
    expect([1006, 1009]).toContain(await big.closed);
    const binary = await client(s.port);
    binary.ws.send(new Uint8Array([1, 2, 3]));
    expect(await binary.closed).toBe(1003);
  });

  test("refuses a request that is not a WebSocket handshake, and too many sockets", async () => {
    const s = await relay(1);
    const raw = await new Promise<string>((done) => {
      const sock = connect(s.port, "127.0.0.1", () =>
        sock.write(
          "GET / HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
        ),
      );
      let text = "";
      sock.on("data", (c) => {
        text += c.toString();
        if (text.includes("\r\n\r\n")) {
          sock.destroy();
          done(text);
        }
      });
      sock.on("close", () => done(text));
    });
    expect(raw.startsWith("HTTP/1.1 400")).toBe(true);
    await client(s.port);
    const second = new WebSocket(`ws://127.0.0.1:${s.port}/`);
    const failed = await new Promise<boolean>((done) => {
      second.onopen = () => done(false);
      second.onerror = () => done(true);
    });
    expect(failed).toBe(true);
  });

  test("a tunnel's address is the wss:// address a deck names", () => {
    expect(tunnelRelayUrl("https://a-b-c.trycloudflare.com")).toBe(
      "wss://a-b-c.trycloudflare.com/",
    );
  });
});

const BIN = new URL("../../dist/cli/bin.js", import.meta.url).pathname;

describe("kadal-deck relay (the command)", () => {
  // The built CLI on Node (as npx runs it): Node's http and the frame reader, end to end.
  test.skipIf(!existsSync(BIN))("runs on Node, and pairs a phone through it", async () => {
    const child = spawn(
      "node",
      [BIN, "relay", "--port", "0", "--host", "127.0.0.1", "--password", PASSWORD, "--json"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    try {
      const info = await new Promise<{ ok: boolean; urls: string[]; password: unknown }>(
        (done, fail) => {
          let out = "";
          child.stdout.on("data", (c: Buffer) => {
            out += c.toString();
            try {
              done(JSON.parse(out));
            } catch {
              /* more to come */
            }
          });
          child.on("exit", (code) => fail(new Error(`relay exited (${code})`)));
        },
      );
      expect(info.ok).toBe(true);
      // A password that was given is never printed back.
      expect(info.password).toBeNull();
      const port = Number(new URL(info.urls[0]!).port);
      const host = await client(port);
      host.send({ op: "host", key: PASSWORD });
      const { code } = await host.next("hosted");
      const phone = await client(port);
      phone.send({ op: "join", code });
      expect((await phone.next("joined")).host).toBe(true);
      phone.send({ op: "msg", data: { type: "command", id: "nav.next", params: {}, seq: 1 } });
      expect((await host.next("msg")).data).toMatchObject({ type: "command", id: "nav.next" });
      host.ws.close();
      phone.ws.close();
    } finally {
      child.kill("SIGTERM");
    }
  });

  test("points a build at the first network address, not a virtual machine's bridge", () => {
    const nic = (address: string, internal = false) => ({
      address,
      netmask: "255.255.255.0",
      family: "IPv4" as const,
      mac: "00:00:00:00:00:00",
      internal,
      cidr: `${address}/24`,
    });
    // macOS with OrbStack: Wi-Fi first, then the bridges the VMs sit behind.
    const urls = relayUrls("0.0.0.0", 4174, {
      lo0: [nic("127.0.0.1", true)],
      en0: [nic("192.168.88.6")],
      bridge100: [nic("192.168.139.3")],
      bridge103: [nic("192.168.97.0")],
    });
    expect(urls).toEqual([
      "ws://localhost:4174/",
      "ws://192.168.88.6:4174/",
      "ws://192.168.139.3:4174/",
      "ws://192.168.97.0:4174/",
    ]);
    expect(suggestedRelayUrl(urls)).toBe("ws://192.168.88.6:4174/");
    // No network: this computer; one given host: that one.
    expect(suggestedRelayUrl(relayUrls("0.0.0.0", 4174, { lo0: [nic("127.0.0.1", true)] }))).toBe(
      "ws://localhost:4174/",
    );
    expect(suggestedRelayUrl(relayUrls("10.0.0.2", 4174))).toBe("ws://10.0.0.2:4174/");
  });

  test("refuses an empty password", async () => {
    const errors: string[] = [];
    const error = console.error;
    console.error = (line: string) => void errors.push(line);
    try {
      expect(await main(["relay", "--password", " ", "--port", "0"])).toBe(2);
    } finally {
      console.error = error;
    }
    expect(errors.join("\n")).toContain("--password needs a password");
  });

  test("is in the help", async () => {
    const { HELP } = await import("./index.ts");
    expect(HELP).toContain("relay       the phone remote for a build on a static host");
  });
});

/** A socket that records what the server writes, for the frame reader on its own. */
class FakeSocket extends EventEmitter {
  out: Buffer[] = [];
  destroyed = false;
  ended = false;
  write(b: string | Buffer) {
    this.out.push(Buffer.from(b));
    return true;
  }
  end(b?: string) {
    if (b) this.write(b);
    this.ended = true;
  }
  destroy() {
    this.destroyed = true;
    this.emit("close");
  }
}

/** A frame as a browser sends it: masked. */
function clientFrame(op: number, payload: Buffer, fin = true, masked = true): Buffer {
  const n = payload.length;
  const len =
    n < 126
      ? Buffer.from([n | (masked ? 0x80 : 0)])
      : Buffer.from([126 | (masked ? 0x80 : 0), n >> 8, n & 255]);
  const mask = Buffer.from([0x11, 0x22, 0x33, 0x44]);
  const body = Buffer.from(payload);
  if (masked) for (let i = 0; i < n; i++) body[i] = body[i]! ^ mask[i & 3]!;
  return Buffer.concat([
    Buffer.from([(fin ? 0x80 : 0) | op]),
    len,
    ...(masked ? [mask] : []),
    body,
  ]);
}

/** The frames the server wrote after its handshake: [opcode, payload]. */
function serverFrames(out: Buffer[]): Array<[number, Buffer]> {
  let buf = Buffer.concat(out.slice(1));
  const frames: Array<[number, Buffer]> = [];
  while (buf.length >= 2) {
    let n = buf[1]! & 0x7f;
    let at = 2;
    if (n === 126) {
      n = buf.readUInt16BE(2);
      at = 4;
    } else if (n === 127) {
      n = Number(buf.readBigUInt64BE(2));
      at = 10;
    }
    frames.push([buf[0]! & 0x0f, buf.subarray(at, at + n)]);
    buf = buf.subarray(at + n);
  }
  return frames;
}

function handshake(head = Buffer.alloc(0)) {
  const socket = new FakeSocket();
  const messages: string[] = [];
  let closed = 0;
  const req = {
    method: "GET",
    headers: {
      upgrade: "websocket",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      "sec-websocket-version": "13",
    },
  } as never;
  const ws = acceptWebSocket(req, socket as unknown as Duplex, head, {
    message: (t) => void messages.push(t),
    close: () => void closed++,
  });
  return { socket, ws: ws!, messages, closed: () => closed };
}

describe("the WebSocket reader (Node)", () => {
  test("answers the handshake as RFC 6455 says", () => {
    const { socket } = handshake();
    // The RFC's own example key and accept value.
    expect(socket.out[0]!.toString()).toContain(
      "Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=",
    );
    expect(socket.out[0]!.toString().startsWith("HTTP/1.1 101")).toBe(true);
  });

  test("refuses what is not a handshake", () => {
    const socket = new FakeSocket();
    const ws = acceptWebSocket(
      { method: "GET", headers: { upgrade: "websocket" } } as never,
      socket as unknown as Duplex,
      Buffer.alloc(0),
      { message: () => {}, close: () => {} },
    );
    expect(ws).toBeNull();
    expect(socket.out[0]!.toString().startsWith("HTTP/1.1 400")).toBe(true);
  });

  test("reads messages split across chunks, fragmented, and 16-bit lengths", () => {
    const { socket, messages } = handshake();
    const one = clientFrame(1, Buffer.from('{"op":"rotate"}'));
    socket.emit("data", one.subarray(0, 3));
    socket.emit("data", one.subarray(3));
    socket.emit(
      "data",
      Buffer.concat([
        clientFrame(1, Buffer.from("hel"), false),
        clientFrame(0, Buffer.from("lo"), true),
      ]),
    );
    const long = "y".repeat(300);
    socket.emit("data", clientFrame(1, Buffer.from(long)));
    expect(messages).toEqual(['{"op":"rotate"}', "hello", long]);
  });

  test("reads what came with the upgrade request", async () => {
    const { messages } = handshake(clientFrame(1, Buffer.from("first")));
    await Promise.resolve();
    expect(messages).toEqual(["first"]);
  });

  test("writes text frames, answers pings, and closes on a close", () => {
    const { socket, ws, closed } = handshake();
    ws.send("x".repeat(200));
    socket.emit("data", clientFrame(9, Buffer.from("p")));
    socket.emit("data", clientFrame(8, Buffer.from([3, 232])));
    const frames = serverFrames(socket.out);
    expect(frames[0]![0]).toBe(1);
    expect(frames[0]![1].toString()).toBe("x".repeat(200));
    expect(frames[1]).toEqual([10, Buffer.from("p")]);
    expect(frames[2]![0]).toBe(8);
    expect(socket.ended).toBe(true);
    expect(closed()).toBe(1);
  });

  for (const [what, frame, code] of [
    ["an unmasked frame", clientFrame(1, Buffer.from("x"), true, false), 1002],
    ["a binary frame", clientFrame(2, Buffer.from([1])), 1003],
    ["a continuation with nothing to continue", clientFrame(0, Buffer.from("x")), 1002],
    [
      "a message over the limit",
      Buffer.concat([
        Buffer.from([0x81, 0xff]),
        Buffer.alloc(8, 0),
        Buffer.from([0, 0, 0, 0]),
      ]).fill(0xff, 2, 3),
      1009,
    ],
  ] as const)
    test(`closes on ${what}`, () => {
      const { socket, messages, closed } = handshake();
      socket.emit("data", frame);
      const frames = serverFrames(socket.out);
      expect(frames.at(-1)![0]).toBe(8);
      expect(frames.at(-1)![1].readUInt16BE(0)).toBe(code);
      expect(messages).toEqual([]);
      expect(closed()).toBe(1);
    });

  test("drops a peer that stops answering pings", () => {
    const { socket, ws, closed } = handshake();
    expect(ws.beat()).toBe(true);
    socket.emit("data", clientFrame(10, Buffer.alloc(0)));
    expect(ws.beat()).toBe(true);
    expect(ws.beat()).toBe(false);
    expect(socket.destroyed).toBe(true);
    expect(closed()).toBe(1);
  });
});
