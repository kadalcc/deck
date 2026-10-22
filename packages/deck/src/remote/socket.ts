import type { DeckConfig, DevRelay } from "../core/model.ts";
import { readItem, writeItem } from "../core/storage.ts";
import { createStore, type Store } from "../core/store.ts";
import type { RelayOut } from "./relay.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A RELAY OVER A WEBSOCKET  —  the phone remote for a build on a static host
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A build on GitHub Pages, Netlify or S3 has no room and no dev server, so its presenter view and
 * its phone page meet at `kadal-deck relay` (cli/relay.ts): the dev server's relay (relay.ts),
 * pairing and all, on a plain WebSocket. This is the pages' end of it. It is the same `DevRelay`
 * the dev server hands the deck, so link.ts (`devHost`, `devRemote`) runs on it unchanged.
 *
 * Which relay: `?relay=wss://…` on the page's address (kept for the tab, so the windows the
 * presenter view opens follow it), else the deck's `remote: { relay }`. Nothing by default — a
 * build never reaches for a relay nobody named. The presenter's window gives the relay's password
 * when it asks to host (`key`, kept for the tab); a phone needs only the code from the QR.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The query parameter that points a page at a relay. */
export const RELAY_PARAM = "relay";
const CHOSEN = "deck.remote.relay";
const keyOf = (url: string) => `deck.remote.key.${url}`;

/** A relay address as a WebSocket URL (`https:` → `wss:`), or null when it is not one. */
export function relayAddress(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol === "https:") u.protocol = "wss:";
  else if (u.protocol === "http:") u.protocol = "ws:";
  if ((u.protocol !== "wss:" && u.protocol !== "ws:") || u.username || u.password) return null;
  u.hash = "";
  return u.toString();
}

export interface RelayChoice {
  url: string;
  /** From the page's address (`?relay=`), not the deck: the QR carries it to the phone. */
  fromAddress: boolean;
}

/**
 * The relay this page uses: `?relay=` (kept for the tab; `?relay=` with nothing forgets it), else
 * one the tab was given before, else the deck's `remote.relay`. Null for none.
 */
export function relayChoice(
  config: Pick<DeckConfig, "remote"> | { remote?: { relay?: string | null } },
  search: string = typeof location === "undefined" ? "" : location.search,
): RelayChoice | null {
  const given = new URLSearchParams(search).get(RELAY_PARAM);
  if (given !== null) {
    const url = relayAddress(given);
    writeItem(CHOSEN, url ?? "", "session");
    if (url) return { url, fromAddress: true };
  } else {
    const kept = relayAddress(readItem(CHOSEN, "session"));
    if (kept) return { url: kept, fromAddress: true };
  }
  const configured = relayAddress(config.remote?.relay);
  return configured ? { url: configured, fromAddress: false } : null;
}

export interface SocketRelay extends DevRelay {
  readonly url: string;
  /** The relay asks this window for its password (why, in words), or null. */
  auth: Store<string | null>;
  /** Why the relay cannot be reached, in words, or null. */
  problem: Store<string | null>;
  /** The relay's password, for hosting: kept for the tab, and the host asks again with it. */
  give(password: string): void;
}

type Socket = Pick<WebSocket, "send" | "close" | "readyState"> & {
  onopen: ((e: unknown) => void) | null;
  onclose: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
};

export interface SocketDeps {
  open: (url: string) => Socket;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (t: unknown) => void;
}

const OPEN = 1;
/** What is held while the socket opens (the first `host` or `join`), at most. */
const QUEUE = 32;

/**
 * A `DevRelay` on a WebSocket. It connects on the first send and reconnects (1 s, doubling to
 * 10 s) while anyone listens; what is sent while it connects goes once it opens, and the
 * listeners hear `onStatus(true)` after that, as Vite's HMR channel does.
 */
export function createSocketRelay(
  url: string,
  deps: SocketDeps = {
    open: (u) => new WebSocket(u) as unknown as Socket,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  },
): SocketRelay {
  const listeners = new Set<(m: unknown) => void>();
  const statusListeners = new Set<(open: boolean) => void>();
  const auth = createStore<string | null>(null);
  const problem = createStore<string | null>(null);
  let socket: Socket | null = null;
  let queue: string[] = [];
  let retry: unknown = null;
  let wait = 1000;
  let lastHost: Record<string, unknown> | null = null;
  let key = readItem(keyOf(url), "session") || null;

  const wire = (m: unknown): string => {
    const o = m as Record<string, unknown> | null;
    if (o && o.op === "host") {
      lastHost = { ...o };
      if (key) return JSON.stringify({ ...o, key });
    }
    return JSON.stringify(m);
  };
  const connect = () => {
    if (socket) return;
    if (retry) deps.clearTimeout(retry);
    retry = null;
    let s: Socket;
    try {
      s = deps.open(url);
    } catch {
      problem.set(unreachable(url));
      return;
    }
    socket = s;
    s.onopen = () => {
      wait = 1000;
      problem.set(null);
      const held = queue;
      queue = [];
      for (const m of held) s.send(m);
      for (const fn of [...statusListeners]) fn(true);
    };
    s.onmessage = (e) => {
      let m: unknown;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      const out = m as RelayOut;
      if (out && out.op === "hosted") auth.set(null);
      else if (out && out.op === "denied" && out.auth) {
        // A password kept from before that no longer works is forgotten.
        if (key) writeItem(keyOf(url), "", "session");
        key = null;
        auth.set(out.reason);
        return;
      }
      for (const fn of [...listeners]) fn(m);
    };
    s.onerror = () => {};
    s.onclose = () => {
      const was = socket === s;
      if (!was) return;
      socket = null;
      queue = [];
      problem.set(unreachable(url));
      for (const fn of [...statusListeners]) fn(false);
      if (listeners.size) {
        retry = deps.setTimeout(connect, wait);
        wait = Math.min(wait * 2, 10_000);
      }
    };
  };

  const self: SocketRelay = {
    url,
    auth,
    problem,
    send(m) {
      const text = wire(m);
      if (socket?.readyState === OPEN) return socket.send(text);
      if (queue.length >= QUEUE) queue.shift();
      queue.push(text);
      connect();
    },
    on(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    onStatus(fn) {
      statusListeners.add(fn);
      return () => void statusListeners.delete(fn);
    },
    give(password) {
      key = password;
      writeItem(keyOf(url), password, "session");
      auth.set(null);
      // The host asks again, with the password this time.
      if (lastHost) self.send(lastHost);
    },
  };
  return self;
}

const unreachable = (url: string) =>
  `Cannot reach the remote relay at ${url}. Is \`kadal-deck relay\` running there?`;

/** One socket per relay for the page: the presenter's toolbar and its dialog share it. */
const made = new Map<string, SocketRelay>();
export function socketRelay(url: string): SocketRelay {
  let r = made.get(url);
  if (!r) made.set(url, (r = createSocketRelay(url)));
  return r;
}

export interface PageRelay {
  relay: DevRelay;
  /** The WebSocket relay, when that is the one (null: the dev server's). */
  socket: SocketRelay | null;
  /** What the QR's address carries besides the code: the relay, when the page was pointed at it. */
  search: string;
}

/**
 * The relay a page's phone remote uses: a relay named in the address, else the dev server's
 * (`kadal-deck dev`), else the deck's `remote.relay`. Null for none.
 */
export function pageRelay(
  dev: DevRelay | null | undefined,
  config: Pick<DeckConfig, "remote"> | { remote?: { relay?: string | null } },
  search?: string,
): PageRelay | null {
  const choice = relayChoice(config, search);
  if (choice && (choice.fromAddress || !dev)) {
    const socket = socketRelay(choice.url);
    return {
      relay: socket,
      socket,
      search: choice.fromAddress ? `&${RELAY_PARAM}=${encodeURIComponent(choice.url)}` : "",
    };
  }
  return dev ? { relay: dev, socket: null, search: "" } : null;
}
