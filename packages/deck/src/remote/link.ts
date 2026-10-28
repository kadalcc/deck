import type { CommandResult } from "../core/commands.ts";
import type { DevRelay } from "../core/model.ts";
import { readItem, writeItem } from "../core/storage.ts";
import { createStore, type Store } from "../core/store.ts";
import { type RoomClient, RoomClient as Client, viewerId } from "../live/client.ts";
import {
  MAX_RESULT_VALUE,
  parseCommand,
  parseCommandResult,
  parseRemoteState,
  type RemoteState,
} from "../live/protocol.ts";
import { ROTATE_MS, type RelayOut } from "./relay.ts";

/**
 * The two ends of a phone remote, over either wire: the deck's room (a hosted deck), or the dev
 * server's relay (`kadal-deck dev`). Both pair the same way (live/protocol.ts, PAIRING): a QR with
 * a one-time code that keeps changing, a lease for the phone to come back with, one phone at a
 * time. The page code above this never knows which wire it is.
 */

export type RemoteStatus =
  /** Reaching the room or the dev server. */
  | "connecting"
  /** Paired, and the presenting window is there. */
  | "open"
  /** Paired, but the presenting window is not connected (closed, reloading, asleep). */
  | "waiting"
  /** The wire dropped; trying again. */
  | "closed"
  /** Refused: a wrong or stale code, an expired ticket, or the presenter disconnected this phone. */
  | "denied";

export interface Answer {
  ok: boolean;
  value?: unknown;
  error?: string;
}

/** The phone's end. */
export interface RemoteLink {
  readonly kind: "room" | "dev";
  status: Store<RemoteStatus>;
  state: Store<RemoteState | null>;
  /** Why the link is `denied`, in words for the person holding the phone. */
  reason: Store<string | null>;
  /** Run a command in the presenting window and hear how it went. */
  run(id: string, params?: Record<string, unknown>): Promise<Answer>;
  /** Run one without waiting to hear (a laser move): dropped, not queued, while offline. */
  fire(id: string, params?: Record<string, unknown>): void;
  close(): void;
}

/** A command as the presenting window receives it. */
export interface IncomingCommand {
  id: string;
  params: Record<string, unknown>;
  seq: number;
  from: string;
}

/** The presenting window's end. */
export interface HostLink {
  readonly kind: "room" | "dev";
  remotes: Store<number>;
  /** What the QR holds; null while it is not known (or cannot be made, see `problem`). */
  url: Store<string | null>;
  /** When the code in `url` stops working (this clock, ms); null when it does not expire. */
  expires: Store<number | null>;
  problem: Store<string | null>;
  /** The QR is on screen (true): keep a fresh code in `url`. Off the screen, no code is asked for. */
  showing(on: boolean): void;
  /** A phone just paired (and replaced any other). */
  onPaired(fn: () => void): () => void;
  onCommand(fn: (c: IncomingCommand) => void): () => void;
  reply(to: string, seq: number, result: CommandResult): void;
  push(state: RemoteState): void;
  /** Disconnect the phone: it cannot come back with its lease, and the code changes. */
  kick(): void;
  close(): void;
}

/**
 * The laser's OFF, which must arrive. A move is `fire`d (stale a moment later, so dropped while
 * offline), and so was the off: one lost to a socket blip at the lift (iOS suspends a page's
 * sockets for Control Center or a screen recording) left the dot on the presenter's slide and the
 * projector until the phone went away for good, since nothing else ever said "off". Now the off is
 * a `run`, owed until the presenting window answers it: tried again a second later while the link
 * stays open (twice), and each time it opens again. A new touch (`aiming`) cancels the debt: it ends
 * with an off of its own, and an old one arriving late would switch the new laser off under the
 * finger.
 */
export function laserOff(
  link: Pick<RemoteLink, "run" | "status">,
  retryMs = 1000,
): {
  off(): void;
  aiming(): void;
  dispose(): void;
} {
  let owed = false;
  let attempt = 0;
  let retries = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const send = () => {
    stopTimer();
    owed = true;
    const mine = ++attempt;
    void link.run("present.laserOff").then((a) => {
      if (mine !== attempt) return;
      if (a.ok) owed = false;
      else if (link.status.get() === "open" && retries < 2) {
        retries++;
        timer = setTimeout(send, retryMs);
      }
    });
  };
  const unsubscribe = link.status.subscribe((s, prev) => {
    if (owed && s === "open" && prev !== "open") send();
  });
  return {
    off() {
      retries = 0;
      send();
    },
    aiming() {
      stopTimer();
      owed = false;
      attempt++;
    },
    dispose() {
      stopTimer();
      unsubscribe();
    },
  };
}

const TIMEOUT = 4000;

/** The phone's pending commands, by seq. */
function pending() {
  let seq = 0;
  const waiting = new Map<number, (a: Answer) => void>();
  return {
    next: () => (seq = (seq + 1) % 2_000_000_000),
    wait(n: number): Promise<Answer> {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiting.delete(n);
          resolve({ ok: false, error: "No answer from the presenting window." });
        }, TIMEOUT);
        waiting.set(n, (a) => {
          clearTimeout(timer);
          resolve(a);
        });
      });
    },
    settle(n: number, a: Answer) {
      const fn = waiting.get(n);
      if (!fn) return;
      waiting.delete(n);
      fn(a);
    },
    failAll(error: string) {
      const all = [...waiting.values()];
      waiting.clear();
      for (const fn of all) fn({ ok: false, error });
    },
  };
}

/** A result small enough for the wire: a big value (an outline) travels as `ok` alone. */
export function wireResult(result: CommandResult): Answer {
  if (!result.ok) return { ok: false, error: result.error };
  let size = 0;
  try {
    size = JSON.stringify(result.value ?? null).length;
  } catch {
    size = Number.POSITIVE_INFINITY;
  }
  return size <= MAX_RESULT_VALUE ? { ok: true, value: result.value } : { ok: true };
}

// ── the room ────────────────────────────────────────────────────────────────

/** This page's name for itself when it pairs (live/protocol.ts): random, never stored. */
const device = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) =>
  b.toString(16).padStart(2, "0"),
).join("");

const leaseKey = (where: string) => `deck.remote.lease.${where}`;
/** The lease a phone was given, kept for the tab: a reload or a dropped connection comes back. */
const leases = {
  get: (where: string) => readItem(leaseKey(where), "session") || null,
  set: (where: string, lease: string | null) => writeItem(leaseKey(where), lease ?? "", "session"),
};

/**
 * A phone in a hosted deck's room. Pairs with the code from the QR (`pair`), or comes back with the
 * lease it was given in this tab; a deck host older than pairing codes put the presenter's ticket
 * in the QR instead (`ticket`).
 */
export function roomRemote(options: {
  api: string;
  room: string;
  pair?: string | null;
  ticket?: string | null;
}): RemoteLink {
  const status = createStore<RemoteStatus>("connecting");
  const state = createStore<RemoteState | null>(null);
  const reason = createStore<string | null>(null);
  const p = pending();
  // Used once: after `remote:paired`, the lease is what brings this phone back.
  let pair = options.pair ?? null;
  const byCode = !!pair || !options.ticket;
  const client: RoomClient = new Client({
    api: options.api,
    room: options.room,
    role: "presenter",
    viewer: viewerId(),
    client: "remote",
    ...(byCode
      ? {
          pairing: () => {
            const lease = leases.get(options.room);
            return pair ? { pair, device } : lease ? { lease } : {};
          },
        }
      : { credentials: () => ({ ticket: options.ticket ?? "" }) }),
  });
  let refused = false;
  const refuse = (why: string) => {
    refused = true;
    reason.set(why);
    status.set("denied");
    client.close();
    p.failAll(why);
  };
  const sync = () => {
    if (refused) return;
    const s = client.status.get();
    if (s !== "open") {
      status.set(s === "idle" || s === "connecting" ? "connecting" : "closed");
      return;
    }
    status.set(client.state.get().presence.presenter ? "open" : "waiting");
  };
  const offStatus = client.status.subscribe(sync);
  const offState = client.state.subscribe((s, prev) => {
    if (s.presence.presenter !== prev.presence.presenter) {
      sync();
      if (s.presence.presenter) void ask();
    }
  });
  const ask = async () => {
    const a = await link.run("remote.state");
    if (a.ok && a.value) {
      const parsed = parseRemoteState({ type: "remote:state", state: a.value });
      if (parsed) state.set(parsed);
    }
  };
  const offMessages = client.on((m) => {
    if (m.type === "welcome") {
      if (m.role !== "presenter") {
        refuse(
          byCode
            ? "The room did not accept this phone. Scan the QR on the presenter view again."
            : "The room did not accept this phone's presenter ticket — it may have expired. Scan the QR on the presenter view again.",
        );
        return;
      }
      sync();
      if (m.state.presence.presenter) void ask();
    } else if (m.type === "remote:paired") {
      pair = null;
      leases.set(options.room, m.lease);
    } else if (m.type === "remote:state") {
      const parsed = parseRemoteState(m);
      if (parsed) state.set(parsed);
    } else if (m.type === "command:result") {
      const r = parseCommandResult(m);
      if (r) p.settle(r.seq, { ok: r.ok, value: r.value, error: r.error });
    } else if (m.type === "remote:bye") {
      leases.set(options.room, null);
      refuse(m.reason || "The presenter disconnected this phone.");
    }
  });
  client.connect();
  const link: RemoteLink = {
    kind: "room",
    status,
    state,
    reason,
    run(id, params) {
      const seq = p.next();
      if (!client.sendNow({ type: "command", id, params, seq }))
        return Promise.resolve({ ok: false, error: "Not connected." });
      return p.wait(seq);
    },
    fire(id, params) {
      client.sendNow({ type: "command", id, params, seq: p.next() });
    },
    close() {
      offStatus();
      offState();
      offMessages();
      client.close();
      p.failAll("Closed.");
    },
  };
  return link;
}

/** Whether a phone opened on this page has something to pair with: a code, or a lease from before. */
export function hasLease(room: string): boolean {
  return !!leases.get(room);
}

/** How long a window waits for its first code before deciding the room is older than pairing. */
const CODE_WAIT = 5000;

/** Listeners for "a phone just paired". */
function pairedListeners() {
  const set = new Set<() => void>();
  return {
    on(fn: () => void) {
      set.add(fn);
      return () => void set.delete(fn);
    },
    fire() {
      for (const fn of set) fn();
    },
  };
}

/**
 * The presenting window's end in the room: its own room client, already connected. While the QR is
 * on screen it asks the room for a code (`remote:offer`) and asks again as each one nears its end.
 * A room that never answers is older than pairing: the QR then holds the presenter's ticket, as it
 * used to.
 */
export function roomHost(options: {
  client: RoomClient;
  /** The URL of the remote page, e.g. https://deck.kadal.cc/@me/talk/remote */
  remoteUrl: string;
  ticket: Store<string | null>;
}): HostLink {
  const { client } = options;
  const remotes = createStore(client.state.get().presence.remotes ?? 0);
  const url = createStore<string | null>(null);
  const expires = createStore<number | null>(null);
  const problem = createStore<string | null>(null);
  const paired = pairedListeners();
  let showing = false;
  let code: string | null = null;
  let answered = false;
  let legacy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const render = () => {
    if (legacy) {
      const t = options.ticket.get();
      // The ticket rides in the FRAGMENT: it never reaches a server, a log or a Referer.
      url.set(t ? `${options.remoteUrl}#ticket=${encodeURIComponent(t)}` : null);
      expires.set(null);
      problem.set(t ? null : NO_TICKET);
      return;
    }
    url.set(showing && code ? `${options.remoteUrl}#pair=${code}` : null);
    const open = client.status.get() === "open";
    problem.set(open && client.role.get() !== "presenter" ? NOT_PRESENTER : null);
  };

  const ask = () => {
    clear();
    if (!showing || legacy) return render();
    if (client.status.get() !== "open" || client.role.get() !== "presenter") return render();
    client.sendNow({ type: "remote:offer" });
    if (!answered)
      timer = setTimeout(() => {
        if (answered) return;
        legacy = true;
        render();
      }, CODE_WAIT);
  };

  const offState = client.state.subscribe((s) => remotes.set(s.presence.remotes ?? 0));
  const offStatus = client.status.subscribe(() => ask());
  const offRole = client.role.subscribe(() => ask());
  const offTicket = options.ticket.subscribe(render);
  const offMessages = client.on((m) => {
    if (m.type !== "remote:code") return;
    answered = true;
    legacy = false;
    code = m.code;
    expires.set(Date.now() + m.ttl);
    if (m.paired) paired.fire();
    render();
    clear();
    // Ask again as the code nears its end: the room hands over a new one then.
    if (showing) timer = setTimeout(ask, Math.max(1000, m.ttl - ROTATE_MS + 500));
  });
  render();

  return {
    kind: "room",
    remotes,
    url,
    expires,
    problem,
    showing(on) {
      if (on === showing) return;
      showing = on;
      if (!on) {
        clear();
        code = null;
        expires.set(null);
        render();
        return;
      }
      ask();
    },
    onPaired: paired.on,
    onCommand(fn) {
      return client.on((m) => {
        if (m.type !== "command" || typeof m.from !== "string") return;
        const c = parseCommand(m);
        if (c) fn({ ...c, from: m.from });
      });
    },
    reply(to, seq, result) {
      client.sendNow({ type: "command:result", to, seq, ...wireResult(result) });
    },
    push(state) {
      client.sendNow({ type: "remote:state", state });
    },
    kick() {
      // The room answers with a new code for the QR.
      client.send({ type: "remote:kick" });
    },
    close() {
      clear();
      offState();
      offStatus();
      offRole();
      offTicket();
      offMessages();
    },
  };
}

const NO_TICKET =
  "This window has no presenter ticket to hand a phone. Open the presenter view from your host's dashboard (or sign in here with the passcode) and try again.";
const NOT_PRESENTER =
  "This window is not signed in as the presenter, so it cannot pair a phone. Open the presenter view from your host's dashboard, or sign in here with the passcode.";

// ── the dev server ──────────────────────────────────────────────────────────

/**
 * A phone paired through `kadal-deck dev`'s relay (or a `kadal-deck relay`): the code from the QR,
 * then the lease it is given.
 */
export function devRemote(relay: DevRelay, code: string | null, where = "dev"): RemoteLink {
  const status = createStore<RemoteStatus>("connecting");
  const state = createStore<RemoteState | null>(null);
  const reason = createStore<string | null>(null);
  const p = pending();
  let joined = false;
  // Used once: after `joined`, the lease is what brings this phone back.
  let pair = code;
  const ask = async () => {
    const a = await link.run("remote.state");
    if (a.ok && a.value) {
      const parsed = parseRemoteState({ type: "remote:state", state: a.value });
      if (parsed) state.set(parsed);
    }
  };
  // Once per connection: Vite queues the first send AND announces the connection, and a second
  // join with a code that has just been used would be refused.
  let asked = false;
  const join = () => {
    if (asked) return;
    asked = true;
    const lease = leases.get(where);
    relay.send(pair ? { op: "join", code: pair, device } : { op: "join", lease: lease ?? "" });
  };
  const off = relay.on((raw) => {
    const m = raw as RelayOut;
    if (!m || typeof m !== "object") return;
    if (m.op === "joined") {
      joined = true;
      pair = null;
      leases.set(where, m.lease);
      status.set(m.host ? "open" : "waiting");
      if (m.host) void ask();
    } else if (m.op === "host") {
      if (!joined) return;
      status.set(m.online ? "open" : "waiting");
      if (m.online) void ask();
      else p.failAll("The presenting window went away.");
    } else if (m.op === "denied" || m.op === "bye") {
      joined = false;
      leases.set(where, null);
      reason.set(m.reason);
      status.set("denied");
      p.failAll(m.reason);
    } else if (m.op === "msg") {
      const r = parseCommandResult(m.data);
      if (r) return p.settle(r.seq, { ok: r.ok, value: r.value, error: r.error });
      const s = parseRemoteState(m.data);
      if (s) state.set(s);
    }
  });
  const offStatus = relay.onStatus((open) => {
    if (!open) {
      asked = false;
      status.set("closed");
    } else if (status.get() !== "denied") join();
  });
  join();
  const link: RemoteLink = {
    kind: "dev",
    status,
    state,
    reason,
    run(id, params) {
      if (!joined) return Promise.resolve({ ok: false, error: "Not paired." });
      const seq = p.next();
      relay.send({ op: "msg", data: { type: "command", id, params, seq } });
      return p.wait(seq);
    },
    fire(id, params) {
      if (joined) relay.send({ op: "msg", data: { type: "command", id, params, seq: p.next() } });
    },
    close() {
      relay.send({ op: "leave" });
      off();
      offStatus();
      p.failAll("Closed.");
    },
  };
  return link;
}

/**
 * The presenting window's end on the dev relay (or a `kadal-deck relay`, remote/socket.ts). Its
 * place (an id) is kept for the tab, so a reload keeps its phone; while the QR is on screen it asks
 * the relay to `rotate` the code.
 */
export function devHost(
  relay: DevRelay,
  options: {
    /** The remote page's path from the origin, e.g. "/showcase/remote". */
    path: string;
    /** Where the window's place is kept for this tab (sessionStorage). */
    remember: { get(): string | null; set(id: string): void };
    /** More of the QR's query after the code, e.g. `&relay=…` (remote/socket.ts). */
    search?: string;
    /** What to say when this page is on localhost and the relay knows no address a phone can reach. */
    unreachable?: string;
  },
): HostLink {
  const remotes = createStore(0);
  const url = createStore<string | null>(null);
  const expires = createStore<number | null>(null);
  const problem = createStore<string | null>(null);
  const paired = pairedListeners();
  const listeners = new Set<(c: IncomingCommand) => void>();
  let showing = false;
  let last: Extract<RelayOut, { op: "hosted" }> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const render = () => {
    if (!last || !showing) {
      url.set(null);
      expires.set(null);
      return;
    }
    const here = typeof window === "undefined" ? null : window.location;
    // A QR saying "localhost" sends the phone to itself: prefer the address the network sees.
    const local = !here || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(here.hostname);
    const network = last.urls.find((u) => /^https?:\/\//.test(u));
    let origin = here?.origin ?? "";
    if (local && network) origin = new URL(network).origin;
    url.set(`${origin}${options.path}?pair=${last.code}${options.search ?? ""}`);
    problem.set(
      local && !network
        ? (options.unreachable ??
            "The dev server only listens on this computer, so a phone cannot reach it. Restart it with `kadal-deck dev --host` (same Wi-Fi), then scan.")
        : null,
    );
  };
  const off = relay.on((raw) => {
    const m = raw as RelayOut;
    if (!m || typeof m !== "object") return;
    if (m.op === "hosted") {
      options.remember.set(m.id);
      remotes.set(m.remotes);
      last = m;
      expires.set(Date.now() + m.ttl);
      if (m.paired) paired.fire();
      render();
      clear();
      if (showing)
        timer = setTimeout(
          () => relay.send({ op: "rotate" }),
          Math.max(1000, m.ttl - ROTATE_MS + 500),
        );
    } else if (m.op === "remotes") remotes.set(m.count);
    else if (m.op === "msg") {
      const d = m.data as { type?: string; from?: unknown };
      if (d?.type !== "command" || typeof d.from !== "string") return;
      const c = parseCommand(d);
      if (c) for (const fn of listeners) fn({ ...c, from: d.from });
    }
  });
  const host = () => relay.send({ op: "host", id: options.remember.get() ?? undefined });
  const offStatus = relay.onStatus((open) => open && host());
  host();
  return {
    kind: "dev",
    remotes,
    url,
    expires,
    problem,
    showing(on) {
      if (on === showing) return;
      showing = on;
      clear();
      if (on) relay.send({ op: "rotate" });
      else render();
    },
    onPaired: paired.on,
    onCommand(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reply(to, seq, result) {
      relay.send({ op: "msg", data: { type: "command:result", to, seq, ...wireResult(result) } });
    },
    push(state) {
      relay.send({ op: "msg", data: { type: "remote:state", state } });
    },
    kick() {
      relay.send({ op: "kick" });
    },
    close() {
      clear();
      relay.send({ op: "leave" });
      off();
      offStatus();
      listeners.clear();
    },
  };
}
