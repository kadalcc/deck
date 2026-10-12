/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WINDOW BUS  —  the deck's windows in one browser, in step
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The play window, the presenter view it opened and the projector the presenter opened mirror
 * each other. A BroadcastChannel does that between windows of one ORIGIN — but a host may serve
 * the deck sandboxed, and then every window has an opaque origin of its own and a channel reaches
 * nobody. What a sandboxed window still has is the windows it is related to: the one that opened
 * it (`window.opener`) and the ones it opened. So the bus runs both:
 *
 *   channel      every window of the same origin (an ordinary host, the dev server)
 *   postMessage  the opener and the windows this one opened (any host, sandboxed or not)
 *
 * Each message carries an id, a window acts on an id once however many ways it arrives, and a
 * window passes on what it hears to the related windows it knows, so a chain of openers
 * (play → presenter → projector) stays in step end to end.
 *
 * Every message says how it arrived (`via`), because that decides how far it can be trusted:
 * anything with a handle on a window can postMessage it, and the window that OPENED a deck can be
 * any page at all. The deck decides what a message from its opener may do (react/Deck.tsx).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const TAG = "kadal-deck:bus";

export type Via = "channel" | "opener" | "child";

export interface BusMessage<T> {
  data: T;
  via: Via;
}

export interface WindowBus<T> {
  post(data: T): void;
  subscribe(listener: (message: BusMessage<T>) => void): () => void;
  /** A window this one opened (the return of `window.open`); safe to call with null or a stand-in. */
  adopt(child: unknown): void;
  close(): void;
}

interface Envelope {
  [TAG]: string;
  id: string;
  data: unknown;
}

/** What the bus needs of the page; a test passes its own. */
export interface BusHost {
  opener: unknown;
  addEventListener(type: "message", fn: (e: MessageEvent) => void): void;
  removeEventListener(type: "message", fn: (e: MessageEvent) => void): void;
  BroadcastChannel?: typeof BroadcastChannel;
}

const isWindowLike = (w: unknown): w is Window =>
  !!w && typeof (w as Window).postMessage === "function";

const closed = (w: Window) => {
  try {
    return w.closed;
  } catch {
    return true;
  }
};

export function createWindowBus<T>(
  name: string,
  host: BusHost = globalThis as unknown as BusHost,
): WindowBus<T> {
  const listeners = new Set<(m: BusMessage<T>) => void>();
  const children = new Set<Window>();
  const seen: string[] = [];
  const seenSet = new Set<string>();
  const opener = isWindowLike(host.opener) ? host.opener : null;

  let channel: BroadcastChannel | null = null;
  try {
    const BC = host.BroadcastChannel;
    if (BC) channel = new BC(`deck:${name}`);
  } catch {
    channel = null;
  }

  const remember = (id: string) => {
    if (seenSet.has(id)) return false;
    seenSet.add(id);
    seen.push(id);
    if (seen.length > 256) seenSet.delete(seen.shift()!);
    return true;
  };

  const peers = (): Window[] => {
    const out: Window[] = [];
    if (opener && !closed(opener)) out.push(opener);
    for (const c of children) {
      if (closed(c)) children.delete(c);
      else out.push(c);
    }
    return out;
  };

  const send = (env: Envelope, except: unknown) => {
    for (const w of peers()) {
      if (w === except) continue;
      try {
        // An opaque origin can't be named, so "*": what is sent is a slide position, never a secret.
        w.postMessage(env, "*");
      } catch {
        /* a window that went away mid-send */
      }
    }
  };

  const deliver = (env: Envelope, via: Via, source: unknown) => {
    if (!remember(env.id)) return;
    for (const l of listeners) l({ data: env.data as T, via });
    send(env, source);
  };

  const onMessage = (e: MessageEvent) => {
    const env = e.data as Envelope | null;
    if (!env || typeof env !== "object" || env[TAG] !== name || typeof env.id !== "string") return;
    let via: Via | null = null;
    if (opener && e.source === opener) via = "opener";
    else if (children.has(e.source as Window)) via = "child";
    // A window this one has no relation to is not on the bus.
    if (!via) return;
    deliver(env, via, e.source);
  };
  host.addEventListener("message", onMessage);
  if (channel)
    channel.onmessage = (e: MessageEvent) => {
      const env = e.data as Envelope | null;
      if (env && typeof env === "object" && env[TAG] === name && typeof env.id === "string")
        deliver(env, "channel", null);
    };

  return {
    post(data) {
      const env: Envelope = { [TAG]: name, id: Math.random().toString(36).slice(2, 12), data };
      remember(env.id);
      try {
        channel?.postMessage(env);
      } catch {
        /* closed */
      }
      send(env, null);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    adopt(child) {
      if (isWindowLike(child)) children.add(child);
    },
    close() {
      host.removeEventListener("message", onMessage);
      try {
        channel?.close();
      } catch {
        /* already */
      }
      listeners.clear();
      children.clear();
    },
  };
}
