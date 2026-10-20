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
 * The rules are the room's (live/protocol.ts, PAIRING). A deck window HOSTs and is given an id (to
 * get its place back after a reload) and a short CODE for its QR. A code works once, for CODE_TTL;
 * the window asks to `rotate` while its QR is on screen, so the code keeps changing. A phone JOINs
 * with the code and is given a LEASE, which is how it comes back after a dropped connection. One
 * phone per window: a phone that joins with a fresh code replaces the one before it (`bye`), whose
 * lease stops working. `kick` drops the phone, the lease and every code.
 *
 * From then on the phone's `command`s go to that window alone, stamped with the phone's id; the
 * window's `command:result`s go back to the phone, and its `remote:state` too. Nothing reaches
 * anyone without a code, and a code is only ever learned from the presenting screen. Wrong guesses
 * are limited per address (per connection where the transport cannot say — Vite's HMR channel does
 * not) and in all, so even a script reconnecting for every guess gets 60 a minute against 31^6
 * codes, each of which works for a minute.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type RelayIn =
  | { op: "host"; id?: string }
  | { op: "rotate" }
  | { op: "join"; code?: string; lease?: string; device?: string }
  | { op: "msg"; data: unknown }
  | { op: "kick" }
  | { op: "leave" };

export type RelayOut =
  /**
   * To a host: its id (to ask for its place back after a reload), the code its QR shows now and how
   * long that code works, whether a phone is paired, and the addresses a phone can reach.
   * `paired`: this code replaces one a phone just used.
   */
  | {
      op: "hosted";
      id: string;
      code: string;
      ttl: number;
      remotes: number;
      urls: string[];
      paired?: boolean;
    }
  /** To a host: the number of phones changed. */
  | { op: "remotes"; count: number }
  /** To a phone: paired. `host` says whether the presenting window is there right now. */
  | { op: "joined"; host: boolean; lease: string }
  | { op: "denied"; reason: string }
  /** To the phone: the presenting window came or went. */
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
const ID = /^[a-z0-9]{12}$/;
const LEASE = /^[a-z0-9]{24}$/;
const DEVICE = /^[A-Za-z0-9_-]{16,64}$/;
/** How long a code works after it was made. */
export const CODE_TTL = 60_000;
/** A code with less than this left is replaced when the host asks: the QR changes this often. */
export const ROTATE_MS = 30_000;
const MAX_FAILS = 5;
const MAX_FAILS_ALL = 60;
const FAIL_WINDOW = 60_000;
/** A window nobody hosts and no phone holds for this long is forgotten. */
const IDLE = 30 * 60_000;

export const TAKEN_OVER = "Another phone took over as the remote.";

interface Pair {
  id: string;
  host: RelayPeer | null;
  phone: { id: string; peer: RelayPeer } | null;
  lease: string | null;
  /** The code that made the lease and the device that used it, until the code would have run out. */
  spent: { code: string; device: string; expires: number } | null;
  /** The newest last; the one before it works until it runs out, for a phone mid-scan. */
  codes: { code: string; expires: number }[];
  seen: number;
}
interface PeerInfo {
  role: "host" | "phone";
  pair: string;
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
  const byCode = new Map<string, Pair>();
  const byLease = new Map<string, Pair>();
  const peers = new Map<RelayPeer, PeerInfo>();
  const fails = new Map<string, { n: number; reset: number }>();
  let ids = 0;

  const word = (n: number, alphabet = "abcdefghijklmnopqrstuvwxyz0123456789") => {
    let w = "";
    for (let i = 0; i < n; i++) w += alphabet[Math.floor(random() * alphabet.length)];
    return w;
  };
  const newCode = () => {
    for (;;) {
      const c = word(6, ALPHABET);
      if (!byCode.has(c)) return c;
    }
  };
  const newPair = (id?: string): Pair => {
    let pid = id;
    while (!pid || pairs.has(pid)) pid = word(12);
    const p: Pair = {
      id: pid,
      host: null,
      phone: null,
      lease: null,
      spent: null,
      codes: [],
      seen: now(),
    };
    pairs.set(pid, p);
    return p;
  };
  const dropCodes = (p: Pair, keep: (c: Pair["codes"][number]) => boolean) => {
    const kept: Pair["codes"] = [];
    for (const c of p.codes)
      if (keep(c)) kept.push(c);
      else byCode.delete(c.code);
    p.codes = kept;
  };
  const setLease = (p: Pair, lease: string | null) => {
    if (p.lease) byLease.delete(p.lease);
    p.lease = lease;
    if (lease) byLease.set(lease, p);
  };
  /** The code a QR shows: the newest while it has ROTATE_MS left, else a new one. */
  const fresh = (p: Pair) => {
    const t = now();
    dropCodes(p, (c) => c.expires > t);
    const newest = p.codes.at(-1);
    if (newest && newest.expires - t >= ROTATE_MS) return newest;
    dropCodes(p, (c) => c === newest);
    const c = { code: newCode(), expires: t + CODE_TTL };
    p.codes.push(c);
    byCode.set(c.code, p);
    return c;
  };
  const sweep = () => {
    const t = now();
    for (const p of pairs.values()) {
      dropCodes(p, (c) => c.expires > t);
      if (!p.host && !p.phone && t - p.seen > IDLE) {
        setLease(p, null);
        pairs.delete(p.id);
      }
    }
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
  const remotes = (p: Pair) => send(p.host, { op: "remotes", count: p.phone ? 1 : 0 });
  const hosted = (p: Pair, paired = false) => {
    const c = fresh(p);
    send(p.host, {
      op: "hosted",
      id: p.id,
      code: c.code,
      ttl: c.expires - now(),
      remotes: p.phone ? 1 : 0,
      urls: options.urls?.() ?? [],
      ...(paired ? { paired: true } : {}),
    });
  };

  const detach = (peer: RelayPeer) => {
    const info = peers.get(peer);
    if (!info) return;
    peers.delete(peer);
    const p = pairs.get(info.pair);
    if (!p) return;
    p.seen = now();
    if (info.role === "host" && p.host === peer) {
      p.host = null;
      send(p.phone?.peer, { op: "host", online: false });
    } else if (info.role === "phone" && p.phone?.peer === peer) {
      // The lease stays: the same phone comes back with it.
      p.phone = null;
      remotes(p);
    }
  };

  /** `peer` is the pair's phone now; the one before it is told and let go. */
  const seat = (p: Pair, peer: RelayPeer) => {
    detach(peer);
    const before = p.phone;
    if (before && before.peer !== peer) {
      send(before.peer, { op: "bye", reason: TAKEN_OVER });
      peers.delete(before.peer);
    }
    p.phone = { id: `p${++ids}${Math.floor(random() * 1e6).toString(36)}`, peer };
    p.seen = now();
    peers.set(peer, { role: "phone", pair: p.id });
    send(peer, { op: "joined", host: !!p.host, lease: p.lease! });
    remotes(p);
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
        const asked = typeof m.id === "string" && ID.test(m.id) ? m.id : undefined;
        // Its place back, if no other window holds it: a reload, or a dev server that restarted.
        let p = asked ? pairs.get(asked) : undefined;
        if (p?.host) p = undefined;
        if (!p) p = newPair(asked && !pairs.has(asked) ? asked : undefined);
        p.host = peer;
        p.seen = now();
        peers.set(peer, { role: "host", pair: p.id });
        hosted(p);
        send(p.phone?.peer, { op: "host", online: true });
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
        if (typeof m.lease === "string") {
          const p = LEASE.test(m.lease) ? byLease.get(m.lease) : undefined;
          if (!p) {
            failed(address);
            send(peer, {
              op: "denied",
              reason:
                "This phone is no longer the remote: another phone took over, or the presenter disconnected it. Scan the QR on the presenting screen to connect again.",
            });
            return;
          }
          seat(p, peer);
          return;
        }
        const code = typeof m.code === "string" ? m.code.toUpperCase() : "";
        const device = typeof m.device === "string" && DEVICE.test(m.device) ? m.device : null;
        // The phone that used this code, saying it again (a page mounted twice, an answer lost).
        const again = device
          ? [...pairs.values()].find(
              (q) =>
                q.lease &&
                q.spent &&
                q.spent.code === code &&
                q.spent.device === device &&
                q.spent.expires > now(),
            )
          : undefined;
        if (again) {
          seat(again, peer);
          return;
        }
        const p = CODE.test(code) ? byCode.get(code) : undefined;
        const hit = p?.codes.find((c) => c.code === code && c.expires > now());
        if (!p || !hit) {
          failed(address);
          send(peer, {
            op: "denied",
            reason:
              "That pairing code has expired or is not in use. Scan the QR on the presenting screen again — it changes every 30 seconds.",
          });
          return;
        }
        // Used once, and every older code with it.
        dropCodes(p, (c) => c.expires > hit.expires);
        setLease(p, word(24));
        p.spent = device ? { code, device, expires: hit.expires } : null;
        seat(p, peer);
        // The QR on screen was just used: the window shows the next code.
        hosted(p, true);
        return;
      }

      if (m.op === "leave") {
        detach(peer);
        return;
      }

      if (!info) return;
      const p = pairs.get(info.pair);
      if (!p) return;

      if (m.op === "rotate") {
        if (info.role === "host" && p.host === peer) hosted(p);
        return;
      }

      if (m.op === "kick") {
        if (info.role !== "host" || p.host !== peer) return;
        if (p.phone) {
          send(p.phone.peer, { op: "bye", reason: "The presenter disconnected this phone." });
          peers.delete(p.phone.peer);
          p.phone = null;
        }
        // No phone comes back with its lease, and no code shown so far pairs one.
        setLease(p, null);
        p.spent = null;
        dropCodes(p, () => false);
        hosted(p);
        return;
      }

      if (m.op !== "msg") return;
      if (info.role === "phone") {
        if (p.phone?.peer !== peer) return;
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
        send(p.host, { op: "msg", data: { type: "command", ...c, from: p.phone.id } });
        return;
      }
      // From the host.
      if (p.host !== peer) return;
      const r = parseCommandResult(m.data);
      if (r) {
        if (!r.to || r.to !== p.phone?.id) return;
        const { to: _to, ...rest } = r;
        send(p.phone.peer, { op: "msg", data: { type: "command:result", ...rest } });
        return;
      }
      const state = parseRemoteState(m.data);
      if (state) send(p.phone?.peer, { op: "msg", data: { type: "remote:state", state } });
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
