import {
  parseCommand,
  parseCommandResult,
  parseRemoteState,
  type ServerMessage,
} from "../live/protocol.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEV RELAY  —  a phone remote without a room
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `kadal-deck dev` has no room, and a phone is another device, so the dev server carries the
 * remote's messages itself, over the channel its pages already hold open (Vite's HMR socket,
 * event "kadal:remote" — see vite/index.ts). This is the pairing and routing, with no I/O.
 *
 * A deck window asks to HOST and is given a short random code; it shows the code in a QR. A phone
 * JOINs with that code. From then on the phone's `command`s go to that window alone, stamped with
 * the phone's id, the window's `command:result`s go back to the phone named in `to`, and its
 * `remote:state` goes to every phone of the code. Nothing reaches anyone without the code, and a
 * code is only ever learned from the presenting screen. Wrong guesses are limited per address
 * (per connection where the transport cannot say — Vite's HMR channel does not) and in all, so
 * even a script reconnecting for every guess gets 60 a minute against 31^6 codes.
 *
 * A host that reloads (or a dev server that restarts) asks for its old code back and gets it while
 * no other window holds it, so a paired phone stays paired. `kick` drops every phone and changes
 * the code, which is the way to un-pair a phone for good.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type RelayIn =
  | { op: "host"; code?: string }
  | { op: "join"; code: string }
  | { op: "msg"; data: unknown }
  | { op: "kick" }
  | { op: "leave" };

export type RelayOut =
  /** To a host: its code, how many phones it has, and the addresses a phone can reach. */
  | { op: "hosted"; code: string; remotes: number; urls: string[] }
  /** To a host: the number of phones changed. */
  | { op: "remotes"; count: number }
  /** To a phone: paired. `host` says whether the presenting window is there right now. */
  | { op: "joined"; host: boolean }
  | { op: "denied"; reason: string }
  /** To phones: the presenting window came or went. */
  | { op: "host"; online: boolean }
  | { op: "msg"; data: ServerMessage }
  | { op: "bye"; reason: string };

export interface RelayPeer {
  send(message: RelayOut): void;
}

export interface RelayOptions {
  /** The dev server's network URLs (http://192.168.1.4:5173/…), for the QR. */
  urls?: () => string[];
  now?: () => number;
  random?: () => number;
}

/** No 0/O, 1/I/L: read off a screen and typed on a phone. 31^6 ≈ 8.9e8. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const MAX_FAILS = 5;
const MAX_FAILS_ALL = 60;
const FAIL_WINDOW = 60_000;
/** A code nobody hosts or joins for this long is forgotten. */
const IDLE = 30 * 60_000;

interface Pair {
  code: string;
  host: RelayPeer | null;
  phones: Map<string, RelayPeer>;
  seen: number;
}
interface PeerInfo {
  role: "host" | "phone";
  code: string;
  id: string;
}

export interface Relay {
  message(peer: RelayPeer, raw: unknown, address?: string): void;
  leave(peer: RelayPeer): void;
  /** For tests and logs. */
  stats(): { pairs: number; hosts: number; phones: number };
}

export function createRelay(options: RelayOptions = {}): Relay {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const pairs = new Map<string, Pair>();
  const peers = new Map<RelayPeer, PeerInfo>();
  const fails = new Map<string, { n: number; reset: number }>();
  let ids = 0;

  const newCode = () => {
    for (;;) {
      let c = "";
      for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(random() * ALPHABET.length)];
      if (!pairs.has(c)) return c;
    }
  };
  const sweep = () => {
    const t = now();
    for (const [code, p] of pairs)
      if (!p.host && !p.phones.size && t - p.seen > IDLE) pairs.delete(code);
    for (const [k, f] of fails) if (f.reset < t) fails.delete(k);
  };
  const send = (peer: RelayPeer | null | undefined, m: RelayOut) => {
    if (!peer) return;
    try {
      peer.send(m);
    } catch {
      /* gone; its leave follows */
    }
  };
  const remotes = (p: Pair) => send(p.host, { op: "remotes", count: p.phones.size });
  const hosted = (p: Pair) =>
    send(p.host, {
      op: "hosted",
      code: p.code,
      remotes: p.phones.size,
      urls: options.urls?.() ?? [],
    });

  const detach = (peer: RelayPeer) => {
    const info = peers.get(peer);
    if (!info) return;
    peers.delete(peer);
    const p = pairs.get(info.code);
    if (!p) return;
    p.seen = now();
    if (info.role === "host" && p.host === peer) {
      p.host = null;
      for (const phone of p.phones.values()) send(phone, { op: "host", online: false });
    } else if (info.role === "phone" && p.phones.get(info.id) === peer) {
      p.phones.delete(info.id);
      remotes(p);
    }
  };

  const failed = (key: string) => {
    const t = now();
    for (const k of [key, "*"]) {
      const f = fails.get(k);
      if (!f || f.reset < t) fails.set(k, { n: 1, reset: t + FAIL_WINDOW });
      else f.n++;
    }
  };
  const over = (key: string, max: number) => {
    const f = fails.get(key);
    return !!f && f.reset >= now() && f.n >= max;
  };
  const locked = (key: string) => over(key, MAX_FAILS) || over("*", MAX_FAILS_ALL);
  const connections = new WeakMap<RelayPeer, string>();
  const keyOf = (peer: RelayPeer, address?: string) => {
    if (address) return `a:${address}`;
    let k = connections.get(peer);
    if (!k) connections.set(peer, (k = `c:${++ids}`));
    return k;
  };

  return {
    message(peer, raw, addressIn) {
      const address = keyOf(peer, addressIn);
      if (!raw || typeof raw !== "object") return;
      const m = raw as RelayIn;
      sweep();
      const info = peers.get(peer);

      if (m.op === "host") {
        detach(peer);
        // The old code back, if it is free: a reload, or a dev server that restarted.
        let p = typeof m.code === "string" && CODE.test(m.code) ? pairs.get(m.code) : undefined;
        if (p && p.host) p = undefined;
        if (!p && typeof m.code === "string" && CODE.test(m.code) && !pairs.has(m.code)) {
          p = { code: m.code, host: null, phones: new Map(), seen: now() };
          pairs.set(p.code, p);
        }
        if (!p) {
          p = { code: newCode(), host: null, phones: new Map(), seen: now() };
          pairs.set(p.code, p);
        }
        p.host = peer;
        p.seen = now();
        peers.set(peer, { role: "host", code: p.code, id: "host" });
        hosted(p);
        for (const phone of p.phones.values()) send(phone, { op: "host", online: true });
        return;
      }

      if (m.op === "join") {
        if (locked(address)) {
          send(peer, {
            op: "denied",
            reason: "Too many wrong codes. Wait a minute and scan again.",
          });
          return;
        }
        const code = typeof m.code === "string" ? m.code.toUpperCase() : "";
        const p = CODE.test(code) ? pairs.get(code) : undefined;
        if (!p) {
          failed(address);
          send(peer, {
            op: "denied",
            reason:
              "That pairing code is not in use. Open Phone remote on the presenting screen and scan again.",
          });
          return;
        }
        detach(peer);
        const id = `p${++ids}${Math.floor(random() * 1e6).toString(36)}`;
        p.phones.set(id, peer);
        p.seen = now();
        peers.set(peer, { role: "phone", code: p.code, id });
        send(peer, { op: "joined", host: !!p.host });
        remotes(p);
        return;
      }

      if (m.op === "leave") {
        detach(peer);
        return;
      }

      if (!info) return;
      const p = pairs.get(info.code);
      if (!p) return;

      if (m.op === "kick") {
        if (info.role !== "host" || p.host !== peer) return;
        for (const [id, phone] of p.phones) {
          send(phone, { op: "bye", reason: "The presenter disconnected this phone." });
          peers.delete(phone);
          p.phones.delete(id);
        }
        // A new code, so the old QR (or a photo of it) pairs nobody.
        pairs.delete(p.code);
        const next: Pair = { code: newCode(), host: peer, phones: new Map(), seen: now() };
        pairs.set(next.code, next);
        peers.set(peer, { role: "host", code: next.code, id: "host" });
        hosted(next);
        return;
      }

      if (m.op !== "msg") return;
      if (info.role === "phone") {
        const c = parseCommand(m.data);
        if (!c) return;
        if (!p.host) {
          send(peer, {
            op: "msg",
            data: {
              type: "command:result",
              seq: c.seq,
              ok: false,
              error: "The presenting window is not connected.",
            },
          });
          return;
        }
        send(p.host, { op: "msg", data: { type: "command", ...c, from: info.id } });
        return;
      }
      // From the host.
      if (p.host !== peer) return;
      const r = parseCommandResult(m.data);
      if (r) {
        if (!r.to) return;
        const { to, ...rest } = r;
        send(p.phones.get(to), { op: "msg", data: { type: "command:result", ...rest } });
        return;
      }
      const state = parseRemoteState(m.data);
      if (state)
        for (const phone of p.phones.values())
          send(phone, { op: "msg", data: { type: "remote:state", state } });
    },
    leave: detach,
    stats() {
      let hosts = 0;
      let phones = 0;
      for (const i of peers.values()) {
        if (i.role === "host") hosts++;
        else phones++;
      }
      return { pairs: pairs.size, hosts, phones };
    },
  };
}
