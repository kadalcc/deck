import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { networkInterfaces } from "node:os";
import type { Duplex } from "node:stream";

import { createRelay, type RelayIn, type RelayOut, type RelayPeer } from "../remote/relay.ts";
import {
  REMOTE_ENV,
  makePassword,
  originOf,
  passwordMatches,
  startTunnel,
} from "../vite/remote-dev.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `kadal-deck relay`  —  the phone remote for a deck on a static host
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   kadal-deck relay [--port 4174] [--host 0.0.0.0] [--password <p>] [--tunnel]
 *
 * A build on GitHub Pages, Netlify or S3 has no server, and a phone is another device: something
 * has to carry the remote's messages between the two. This is the dev server's relay
 * (remote/relay.ts — the same pairing: a QR code that works once and changes every 30 seconds, a
 * lease, one phone at a time, wrong codes limited) on a plain WebSocket, and nothing else. The
 * deck's pages find it by `remote: { relay: "wss://…" }` in the deck or `?relay=` on the
 * presenter view's address (remote/socket.ts).
 *
 * What it guards: becoming the presenting window (`host`) takes the relay's password, given in
 * the presenter view's Phone remote dialog — so nobody else drives a window through your relay,
 * or uses it as theirs. Wrong passwords are limited to 10 a minute per address (and 100 in all).
 * A phone needs only the code from the QR, as on `kadal-deck dev`. The password is `--password`,
 * else KADAL_DECK_RELAY_PASSWORD, else one made up and printed.
 *
 * What it is not: a file server. It serves no deck, no notes, no drawings, no editing endpoints
 * — an HTTP request gets a line saying what this is, or a 404. Commands a phone sends run in the
 * presenter's window, which refuses what a phone may not do (remote/host.tsx).
 *
 * `--tunnel` puts it on the internet through a Cloudflare Quick Tunnel (as `dev --tunnel`), for a
 * deck served over https, which may only open `wss://`. Node's http and a small RFC 6455 reader:
 * text frames up to 64 KiB, no extensions, pings every 25 s.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The biggest message a peer may send (a remote's state and a command's answer fit many times). */
export const MAX_MESSAGE = 64 * 1024;
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_FAILS = 10;
const MAX_FAILS_ALL = 100;
const FAIL_WINDOW = 60_000;
const BEAT = 25_000;
export const RELAY_PASSWORD_ENV = "KADAL_DECK_RELAY_PASSWORD";

interface Ws {
  send(text: string): void;
  close(code?: number): void;
  /** Ping; false (and closed) when the last ping went unanswered. */
  beat(): boolean;
}

/**
 * Accept a WebSocket on an upgrade request, or answer 400 and return null. `on.message` hears
 * each text message, `on.close` once when the socket is done either way.
 */
export function acceptWebSocket(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  on: { message(text: string): void; close(): void },
): Ws | null {
  const key = req.headers["sec-websocket-key"];
  if (
    req.method !== "GET" ||
    String(req.headers.upgrade ?? "").toLowerCase() !== "websocket" ||
    typeof key !== "string" ||
    !/^[A-Za-z0-9+/]{22}==$/.test(key) ||
    req.headers["sec-websocket-version"] !== "13"
  ) {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    return null;
  }
  const accept = createHash("sha1")
    .update(key + GUID)
    .digest("base64");
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  (socket as Socket).setNoDelay?.(true);

  let buf: Buffer = Buffer.alloc(0);
  let parts: Buffer[] = [];
  let partsLength = 0;
  let fragmented = false;
  let open = true;
  let done = false;
  let alive = true;
  const finish = () => {
    open = false;
    if (done) return;
    done = true;
    on.close();
  };
  const frame = (op: number, payload: Buffer) => {
    if (!open || socket.destroyed) return;
    const n = payload.length;
    let header: Buffer;
    if (n < 126) header = Buffer.from([0x80 | op, n]);
    else if (n < 65_536) header = Buffer.from([0x80 | op, 126, n >> 8, n & 255]);
    else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | op;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(n), 2);
    }
    socket.write(Buffer.concat([header, payload]));
  };
  const close = (code = 1000) => {
    if (!open) return;
    const p = Buffer.alloc(2);
    p.writeUInt16BE(code);
    frame(8, p);
    open = false;
    socket.end();
    finish();
  };
  const read = () => {
    while (open && buf.length >= 2) {
      const b0 = buf[0]!;
      const b1 = buf[1]!;
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      // No extensions were agreed, and a browser always masks what it sends.
      if (b0 & 0x70 || !(b1 & 0x80)) return close(1002);
      let length = b1 & 0x7f;
      let at = 2;
      if (length === 126) {
        if (buf.length < 4) return;
        length = buf.readUInt16BE(2);
        at = 4;
      } else if (length === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return close(1009);
        length = Number(big);
        at = 10;
      }
      if (length > MAX_MESSAGE) return close(1009);
      if (buf.length < at + 4 + length) return;
      const mask = buf.subarray(at, at + 4);
      const payload = Buffer.from(buf.subarray(at + 4, at + 4 + length));
      for (let i = 0; i < length; i++) payload[i] = payload[i]! ^ mask[i & 3]!;
      buf = buf.subarray(at + 4 + length);

      if (op >= 8) {
        if (!fin || length > 125) return close(1002);
        if (op === 8) return close(1000);
        if (op === 9) frame(10, payload);
        else if (op === 10) alive = true;
        else return close(1002);
        continue;
      }
      if (op === 2) return close(1003);
      if (op === 1) {
        if (fragmented) return close(1002);
        parts = [payload];
        partsLength = length;
      } else if (op === 0) {
        if (!fragmented) return close(1002);
        partsLength += length;
        if (partsLength > MAX_MESSAGE) return close(1009);
        parts.push(payload);
      } else return close(1002);
      fragmented = !fin;
      if (fragmented) continue;
      const text = Buffer.concat(parts).toString("utf8");
      parts = [];
      partsLength = 0;
      on.message(text);
    }
  };
  socket.on("data", (chunk: Buffer) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    read();
  });
  socket.on("error", () => socket.destroy());
  socket.on("close", finish);
  socket.on("end", () => {
    open = false;
    socket.end();
    finish();
  });
  // What came with the upgrade, once the caller holds the socket.
  if (head.length) {
    buf = Buffer.from(head);
    queueMicrotask(read);
  }
  return {
    send: (text) => frame(1, Buffer.from(text, "utf8")),
    close,
    beat() {
      if (!open) return false;
      if (!alive) {
        open = false;
        socket.destroy();
        finish();
        return false;
      }
      alive = false;
      frame(9, Buffer.alloc(0));
      return true;
    },
  };
}

/** Who is asking: the address, or the visitor's behind a tunnel on this computer (originOf). */
function addressOf(headers: IncomingMessage["headers"], remoteAddress: string | undefined): string {
  const via = originOf({ headers, socket: { remoteAddress } as Socket });
  const cf = headers["cf-connecting-ip"];
  return via === "tunnel" && typeof cf === "string" && cf ? cf : (remoteAddress ?? "?");
}

export interface RelayServerOptions {
  port: number;
  host: string;
  password: string;
  /** At most this many sockets at once (default 200). */
  maxConnections?: number;
  now?: () => number;
}

export interface RelayServer {
  port: number;
  close(): Promise<void>;
  /** Hear the relay close (the tunnel goes with it). */
  onClose(fn: () => void): void;
  stats(): { connections: number; pairs: number; hosts: number; phones: number };
}

export const RELAY_BANNER =
  "Kadal Deck phone-remote relay. A deck reaches it with `remote: { relay }` in the deck or ?relay= on its presenter view.\n";

/** One socket's end of the relay: what it says goes through the password check to the relay. */
interface Connection {
  message(text: string): void;
  close(): void;
}

/**
 * The relay and its password check, with no I/O: `open` is a socket that connected from
 * `address`, `send` its way back.
 */
export function relayConnections(o: Pick<RelayServerOptions, "password" | "now">) {
  const now = o.now ?? Date.now;
  const relay = createRelay({ now });
  const fails = new Map<string, { n: number; reset: number }>();
  const over = (k: string, limit: number) => {
    const f = fails.get(k);
    return !!f && f.reset >= now() && f.n >= limit;
  };
  const failed = (k: string) => {
    const t = now();
    for (const key of [k, "*"]) {
      const f = fails.get(key);
      if (!f || f.reset < t) fails.set(key, { n: 1, reset: t + FAIL_WINDOW });
      else f.n++;
    }
  };
  return {
    stats: relay.stats,
    open(address: string, send: (text: string) => void): Connection {
      let hosting = false;
      const peer: RelayPeer = { send: (m: RelayOut) => send(JSON.stringify(m)) };
      return {
        message(text) {
          let m: RelayIn;
          try {
            m = JSON.parse(text) as RelayIn;
          } catch {
            return;
          }
          if (!m || typeof m !== "object") return;
          if (m.op !== "host") return relay.message(peer, m, address);
          // Hosting takes the password, once per connection.
          if (!hosting) {
            const key = typeof m.key === "string" ? m.key : "";
            if (over(address, MAX_FAILS) || over("*", MAX_FAILS_ALL))
              return peer.send({
                op: "denied",
                auth: true,
                reason: "Too many wrong passwords. Wait a minute.",
              });
            if (!key || !passwordMatches(key, o.password)) {
              // Asking without a password is not a guess: the window has not been given one yet.
              if (key) failed(address);
              return peer.send({
                op: "denied",
                auth: true,
                reason: key
                  ? "That is not the relay's password."
                  : "This relay asks for its password before it pairs a phone with this window.",
              });
            }
            hosting = true;
          }
          relay.message(
            peer,
            typeof m.id === "string" ? { op: "host", id: m.id } : { op: "host" },
            address,
          );
        },
        close: () => relay.leave(peer),
      };
    },
  };
}

const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

/** The relay on a WebSocket, listening: Node's http, or Bun's own server under Bun. */
export function startRelayServer(o: RelayServerOptions): Promise<RelayServer> {
  return "Bun" in globalThis ? startOnBun(o) : startOnNode(o);
}

function startOnNode(o: RelayServerOptions): Promise<RelayServer> {
  const relay = relayConnections(o);
  const sockets = new Set<Ws>();
  const max = o.maxConnections ?? 200;
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    // Nothing is served but this line: no deck, no notes, no editing endpoints.
    if ((req.method === "GET" || req.method === "HEAD") && path === "/")
      res.writeHead(200, TEXT_HEADERS).end(req.method === "HEAD" ? undefined : RELAY_BANNER);
    else res.writeHead(404, TEXT_HEADERS).end("Not found\n");
  });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (sockets.size >= max) {
      socket.end(
        "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
      return;
    }
    let ws: Ws | null = null;
    const c = relay.open(addressOf(req.headers, req.socket.remoteAddress), (t) => ws?.send(t));
    ws = acceptWebSocket(req, socket, head, {
      message: c.message,
      close() {
        if (ws) sockets.delete(ws);
        c.close();
      },
    });
    if (ws) sockets.add(ws);
  });
  const beat = setInterval(() => {
    for (const ws of sockets) if (!ws.beat()) sockets.delete(ws);
  }, BEAT);
  beat.unref();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.port, o.host, () => {
      server.off("error", reject);
      resolve({
        port: (server.address() as AddressInfo).port,
        stats: () => ({ connections: sockets.size, ...relay.stats() }),
        onClose: (fn) => void server.once("close", fn),
        close: () =>
          new Promise<void>((done) => {
            clearInterval(beat);
            for (const ws of sockets) ws.close(1001);
            sockets.clear();
            server.close(() => done());
          }),
      });
    });
  });
}

interface BunSocket {
  data: { address: string; c?: Connection };
  send(text: string): void;
  close(code?: number): void;
}
interface BunServer {
  port: number;
  upgrade(req: Request, o: { data: BunSocket["data"] }): boolean;
  requestIP(req: Request): { address: string } | null;
  stop(force?: boolean): Promise<void> | void;
}

/** Under Bun, whose node:http cannot write to an upgraded socket: Bun.serve, same relay. */
async function startOnBun(o: RelayServerOptions): Promise<RelayServer> {
  const relay = relayConnections(o);
  const max = o.maxConnections ?? 200;
  const sockets = new Set<BunSocket>();
  const closed: Array<() => void> = [];
  const bun = (globalThis as unknown as { Bun: { serve(o: unknown): BunServer } }).Bun;
  const server = bun.serve({
    port: o.port,
    hostname: o.host,
    fetch(req: Request, s: BunServer) {
      if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
        if (sockets.size >= max) return new Response(null, { status: 503 });
        const headers = Object.fromEntries(req.headers);
        const address = addressOf(headers, s.requestIP(req)?.address);
        if (s.upgrade(req, { data: { address } })) return undefined;
        return new Response(null, { status: 400 });
      }
      const path = new URL(req.url).pathname;
      if ((req.method === "GET" || req.method === "HEAD") && path === "/")
        return new Response(req.method === "HEAD" ? null : RELAY_BANNER, { headers: TEXT_HEADERS });
      return new Response("Not found\n", { status: 404, headers: TEXT_HEADERS });
    },
    websocket: {
      maxPayloadLength: MAX_MESSAGE,
      idleTimeout: 60,
      sendPings: true,
      open(ws: BunSocket) {
        sockets.add(ws);
        ws.data.c = relay.open(ws.data.address, (t) => ws.send(t));
      },
      message(ws: BunSocket, text: string | Uint8Array) {
        if (typeof text !== "string") return ws.close(1003);
        ws.data.c?.message(text);
      },
      close(ws: BunSocket) {
        sockets.delete(ws);
        ws.data.c?.close();
      },
    },
  });
  return {
    port: server.port,
    stats: () => ({ connections: sockets.size, ...relay.stats() }),
    onClose: (fn) => void closed.push(fn),
    close: async () => {
      for (const ws of sockets) ws.close(1001);
      // Not awaited: Bun's stop() can wait on a client that never acknowledges the close.
      void server.stop(true);
      for (const fn of closed.splice(0)) fn();
    },
  };
}

/** The addresses a deck on this network can use: ws://<this computer>:<port>/. */
export function relayUrls(host: string, port: number): string[] {
  const local = `ws://localhost:${port}/`;
  if (host !== "0.0.0.0" && host !== "::")
    return [`ws://${host.includes(":") ? `[${host}]` : host}:${port}/`];
  const out = [local];
  for (const list of Object.values(networkInterfaces()))
    for (const i of list ?? [])
      if (i.family === "IPv4" && !i.internal) out.push(`ws://${i.address}:${port}/`);
  return out;
}

/** A tunnel's https address as the relay address a deck names: wss://…/. */
export const tunnelRelayUrl = (https: string) =>
  `${https.replace(/^https:/, "wss:").replace(/\/*$/, "")}/`;

export interface RelayCommandOptions {
  port?: number;
  host?: string;
  password?: string;
  tunnel: boolean;
  say: (line: string) => void;
  /** --json: one object once the relay (and its tunnel) is up. */
  emit?: (data: unknown) => void;
  env?: NodeJS.ProcessEnv;
}

/** `kadal-deck relay`: start it, say where it is, and run until Ctrl+C. */
export async function relayCommand(o: RelayCommandOptions): Promise<void> {
  const env = o.env ?? process.env;
  let bin = "";
  if (o.tunnel) {
    const { cloudflaredInstallHint, cloudflaredVersion } = await import("./remote.ts");
    const { MissingDependencyError } = await import("./vite.ts");
    bin = env[REMOTE_ENV.cloudflared] || "cloudflared";
    if (!cloudflaredVersion(bin)) throw new MissingDependencyError(cloudflaredInstallHint());
  }
  const given = o.password ?? (env[RELAY_PASSWORD_ENV] || undefined);
  if (given !== undefined && !given.trim()) {
    const { UsageError } = await import("./args.ts");
    throw new UsageError("--password needs a password that is not empty");
  }
  const password = given ?? makePassword();
  // On the network unless a tunnel carries it: cloudflared connects from this computer.
  const host = o.host ?? (o.tunnel ? "127.0.0.1" : "0.0.0.0");
  const relay = await startRelayServer({ port: o.port ?? 4174, host, password });
  const urls = relayUrls(host, relay.port);
  const lines = [
    `relay  ${urls.join("   ")}`,
    given
      ? "       password  the one given (--password or KADAL_DECK_RELAY_PASSWORD)"
      : `       password  ${password}   (made up; --password <p> sets your own)`,
    "       the presenter view's Phone remote asks for the password once; a phone needs only the QR",
  ];
  const tell = (address: string) => [
    `       point a build at it:  remote: { relay: "${address}" }  in the deck,`,
    `       or  ?relay=${address}  on its presenter view's address`,
  ];
  let tunnelUrl: string | null = null;
  const ready = () => {
    o.emit?.({
      ok: true,
      urls,
      tunnel: tunnelUrl,
      password: given ? null : password,
    });
  };
  if (!o.tunnel) {
    lines.push(...tell(urls.at(-1)!), "       (Ctrl+C stops)");
    o.say(lines.join("\n"));
    ready();
  } else {
    o.say(lines.join("\n"));
    await new Promise<void>((done) => {
      startTunnel(bin, `http://localhost:${relay.port}`, false, {
        onUrl: (url) => {
          tunnelUrl = tunnelRelayUrl(url);
          o.say(
            [
              `tunnel ${tunnelUrl}   (a Cloudflare Quick Tunnel: for a deck on https)`,
              ...tell(tunnelUrl),
              "       (Ctrl+C stops)",
            ].join("\n"),
          );
          done();
        },
        onExit: (why) => {
          o.say(`tunnel closed${why ? ` (${why})` : ""}`);
          done();
        },
        onClose: (stop) => relay.onClose(stop),
      });
    });
    ready();
  }
  await new Promise<void>((done) => {
    const stop = () => void relay.close().then(done);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
