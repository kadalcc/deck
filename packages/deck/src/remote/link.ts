import type { CommandResult } from "../core/commands.ts";
import type { DevRelay } from "../core/model.ts";
import { createStore, type Store } from "../core/store.ts";
import { type RoomClient, RoomClient as Client, viewerId } from "../live/client.ts";
import {
  MAX_RESULT_VALUE,
  parseCommand,
  parseCommandResult,
  parseRemoteState,
  type RemoteState,
} from "../live/protocol.ts";
import type { RelayOut } from "./relay.ts";

/**
 * The two ends of a phone remote, over either wire: the deck's room (a hosted deck, the presenter
 * ticket), or the dev server's relay (`kadal-deck dev`, a pairing code). The page code above this
 * never knows which.
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
  problem: Store<string | null>;
  onCommand(fn: (c: IncomingCommand) => void): () => void;
  reply(to: string, seq: number, result: CommandResult): void;
  push(state: RemoteState): void;
  /** Disconnect every phone (and, on the dev relay, change the code). */
  kick(): void;
  close(): void;
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

/** A phone in a hosted deck's room, holding the presenter's ticket. */
export function roomRemote(options: { api: string; room: string; ticket: string }): RemoteLink {
  const status = createStore<RemoteStatus>("connecting");
  const state = createStore<RemoteState | null>(null);
  const reason = createStore<string | null>(null);
  const p = pending();
  const client: RoomClient = new Client({
    api: options.api,
    room: options.room,
    role: "presenter",
    viewer: viewerId(),
    client: "remote",
    credentials: () => ({ ticket: options.ticket }),
  });
  let refused = false;
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
        refused = true;
        reason.set(
          "The room did not accept this phone's presenter ticket — it may have expired. Scan the QR on the presenter view again.",
        );
        status.set("denied");
        client.close();
        return;
      }
      sync();
      if (m.state.presence.presenter) void ask();
    } else if (m.type === "remote:state") {
      const parsed = parseRemoteState(m);
      if (parsed) state.set(parsed);
    } else if (m.type === "command:result") {
      const r = parseCommandResult(m);
      if (r) p.settle(r.seq, { ok: r.ok, value: r.value, error: r.error });
    } else if (m.type === "remote:bye") {
      refused = true;
      reason.set(m.reason || "The presenter disconnected this phone.");
      status.set("denied");
      client.close();
      p.failAll("Disconnected.");
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

/** The presenting window's end in the room: its own room client, already connected. */
export function roomHost(options: {
  client: RoomClient;
  /** The URL of the remote page, e.g. https://deck.kadal.cc/@me/talk/remote */
  remoteUrl: string;
  ticket: Store<string | null>;
}): HostLink {
  const { client } = options;
  const remotes = createStore(client.state.get().presence.remotes ?? 0);
  const url = createStore<string | null>(null);
  const problem = createStore<string | null>(null);
  const offState = client.state.subscribe((s) => remotes.set(s.presence.remotes ?? 0));
  const setUrl = () => {
    const t = options.ticket.get();
    // The ticket rides in the FRAGMENT: it never reaches a server, a log or a Referer.
    url.set(t ? `${options.remoteUrl}#ticket=${encodeURIComponent(t)}` : null);
    problem.set(
      t
        ? null
        : "This window has no presenter ticket to hand a phone. Open the presenter view from your host's dashboard (or sign in here with the passcode) and try again.",
    );
  };
  setUrl();
  const offTicket = options.ticket.subscribe(setUrl);
  return {
    kind: "room",
    remotes,
    url,
    problem,
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
      client.send({ type: "remote:kick" });
    },
    close() {
      offState();
      offTicket();
    },
  };
}

// ── the dev server ──────────────────────────────────────────────────────────

/** A phone paired through `kadal-deck dev`'s relay with a code. */
export function devRemote(relay: DevRelay, code: string): RemoteLink {
  const status = createStore<RemoteStatus>("connecting");
  const state = createStore<RemoteState | null>(null);
  const reason = createStore<string | null>(null);
  const p = pending();
  let joined = false;
  const ask = async () => {
    const a = await link.run("remote.state");
    if (a.ok && a.value) {
      const parsed = parseRemoteState({ type: "remote:state", state: a.value });
      if (parsed) state.set(parsed);
    }
  };
  const off = relay.on((raw) => {
    const m = raw as RelayOut;
    if (!m || typeof m !== "object") return;
    if (m.op === "joined") {
      joined = true;
      status.set(m.host ? "open" : "waiting");
      if (m.host) void ask();
    } else if (m.op === "host") {
      if (!joined) return;
      status.set(m.online ? "open" : "waiting");
      if (m.online) void ask();
      else p.failAll("The presenting window went away.");
    } else if (m.op === "denied" || m.op === "bye") {
      joined = false;
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
    if (!open) status.set("closed");
    else relay.send({ op: "join", code });
  });
  relay.send({ op: "join", code });
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

/** The presenting window's end on the dev relay: a code, kept for the tab so a reload keeps it. */
export function devHost(
  relay: DevRelay,
  options: {
    /** The remote page's path from the origin, e.g. "/showcase/remote". */
    path: string;
    /** Where the code is kept for this tab (sessionStorage). */
    remember: { get(): string | null; set(code: string): void };
  },
): HostLink {
  const remotes = createStore(0);
  const url = createStore<string | null>(null);
  const problem = createStore<string | null>(null);
  const listeners = new Set<(c: IncomingCommand) => void>();
  const off = relay.on((raw) => {
    const m = raw as RelayOut;
    if (!m || typeof m !== "object") return;
    if (m.op === "hosted") {
      options.remember.set(m.code);
      remotes.set(m.remotes);
      const here = typeof window === "undefined" ? null : window.location;
      // A QR saying "localhost" sends the phone to itself: prefer the address the network sees.
      const local = !here || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(here.hostname);
      const network = m.urls.find((u) => /^https?:\/\//.test(u));
      let origin = here?.origin ?? "";
      if (local && network) origin = new URL(network).origin;
      url.set(`${origin}${options.path}?pair=${m.code}`);
      problem.set(
        local && !network
          ? "The dev server only listens on this computer, so a phone cannot reach it. Restart it with `kadal-deck dev --host` (same Wi-Fi), then scan."
          : null,
      );
    } else if (m.op === "remotes") remotes.set(m.count);
    else if (m.op === "msg") {
      const d = m.data as { type?: string; from?: unknown };
      if (d?.type !== "command" || typeof d.from !== "string") return;
      const c = parseCommand(d);
      if (c) for (const fn of listeners) fn({ ...c, from: d.from });
    }
  });
  const host = () => relay.send({ op: "host", code: options.remember.get() ?? undefined });
  const offStatus = relay.onStatus((open) => open && host());
  host();
  return {
    kind: "dev",
    remotes,
    url,
    problem,
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
      relay.send({ op: "leave" });
      off();
      offStatus();
      listeners.clear();
    },
  };
}
