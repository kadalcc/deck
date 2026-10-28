import { readItem, writeItem } from "../core/storage.ts";
import { createStore, type Store } from "../core/store.ts";
import {
  type ClientMessage,
  EMPTY_ROOM,
  type Role,
  type RoomState,
  type ServerMessage,
} from "./protocol.ts";

/**
 * The room client: one WebSocket to the deck's room, reconnecting with backoff, holding the
 * room state in a store the React layer subscribes to, and fanning transient messages (pointer,
 * reactions, strokes) to listeners. Works offline too — every store just stays empty.
 */
export type Status = "idle" | "connecting" | "open" | "closed" | "offline";

export interface RoomClientOptions {
  /** e.g. "/api" — the room lives at `${api}/rooms/${room}/ws`. */
  api: string;
  room: string;
  role: Role;
  viewer: string;
  name?: string;
  /** A one-off token appended to the URL (Turnstile), fetched before each connection attempt. */
  token?: () => Promise<string | null>;
  /**
   * Proof for the host, read at each connection attempt: the presenter's ticket (`ticket`), or a
   * viewer's pass from the host's verification page (`pass`). See live/ticket.ts.
   */
  credentials?: () => Record<string, string>;
  /**
   * "remote": a phone remote (src/remote). Its hello carries no position — a presenter socket's
   * hello sets the room's position, and a phone joining must not move the room.
   */
  client?: "remote";
  /**
   * A phone remote that pairs by code (live/protocol.ts, PAIRING): read at each connection, its
   * `pair` or `lease` goes in the hello — never on the URL — and the socket asks for `role=remote`.
   */
  pairing?: () => { pair?: string; lease?: string; device?: string };
}

type Listener = (message: ServerMessage) => void;

let pageViewer: string | null = null;

/**
 * The anonymous viewer id: kept per browser where storage allows, and at least per page where it
 * doesn't (a sandboxed deck) — every beacon and every reconnect from one page is one viewer.
 */
export function viewerId(): string {
  if (pageViewer) return pageViewer;
  const key = "deck.viewer";
  let id = readItem(key);
  if (!id) {
    id = `v_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
    writeItem(key, id);
  }
  pageViewer = id;
  return id;
}

export class RoomClient {
  readonly state: Store<RoomState> = createStore<RoomState>(EMPTY_ROOM);
  readonly status: Store<Status> = createStore<Status>("idle");
  readonly role: Store<Role> = createStore<Role>("viewer");
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private attempts = 0;
  private closedByUs = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private queue: ClientMessage[] = [];
  /** The position to announce on connect; kept current by the provider. */
  position = { h: 0, v: 0, click: 0 };
  /** A presenter client stepped down to a viewer while its tab is forgotten (live/away.ts). */
  private away = false;
  /** `connect()` was called (and `close()` not since): what `hold(false)` goes back to. */
  private started = false;
  private held = false;

  constructor(private readonly options: RoomClientOptions) {}

  connect() {
    if (typeof window === "undefined") return;
    this.closedByUs = false;
    this.started = true;
    this.open();
  }

  /**
   * Hold the connection (`true`): drop it and open none, retries included, until released
   * (`false`), which connects again at once. A presenter view without the passcode its host
   * wants holds its room: the host refuses that socket (401) every time, and a browser can't tell
   * a refusal from a network that is down, so the client would otherwise try again every 15 s
   * for as long as the page is open, with a console error each time.
   */
  hold(on: boolean) {
    if (this.held === on) return;
    this.held = on;
    if (on) {
      this.drop();
      this.status.set("idle");
    } else if (this.started && !this.closedByUs && typeof window !== "undefined") {
      this.attempts = 0;
      this.open();
    }
  }

  /** Forget the socket and any retry, without the close handler scheduling another. */
  private drop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    if (ws) {
      this.ws = null;
      ws.onclose = null;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      ws.close();
    }
  }

  private url(token: string | null): string {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = this.options.api.startsWith("http")
      ? this.options.api.replace(/^http/, "ws")
      : `${proto}//${window.location.host}${this.options.api}`;
    const q = new URLSearchParams({ role: this.options.pairing ? "remote" : this.roleNow() });
    if (token) q.set("t", token);
    for (const [k, v] of Object.entries(this.options.credentials?.() ?? {})) q.set(k, v);
    return `${base}/rooms/${encodeURIComponent(this.options.room)}/ws?${q}`;
  }

  private open() {
    if (this.ws || this.opening || this.held) return;
    this.status.set("connecting");
    this.opening = true;
    const start = (token: string | null) => {
      this.opening = false;
      if (this.closedByUs || this.held) return;
      this.start(token);
    };
    if (this.options.token) this.options.token().then(start, () => start(null));
    else start(null);
  }

  private opening = false;

  private start(token: string | null) {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url(token));
    } catch {
      this.status.set("offline");
      return;
    }
    this.ws = ws;
    // Every handler checks it still speaks for the client's CURRENT socket: a socket closed by
    // close() or replaced by a quick close-and-connect (a remount) fires its close later, and must
    // not null the new socket or schedule another — two live sockets would deliver everything twice.
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempts = 0;
      this.status.set("open");
      this.raw(
        this.options.client === "remote"
          ? {
              type: "hello",
              role: this.options.role,
              viewer: this.options.viewer,
              client: "remote",
              ...this.options.pairing?.(),
            }
          : {
              type: "hello",
              role: this.roleNow(),
              viewer: this.options.viewer,
              name: this.options.name,
              position: this.position,
            },
      );
      for (const m of this.queue.splice(0)) this.raw(m);
      this.heartbeat = setInterval(() => this.raw({ type: "ping" }), 25_000);
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      let m: ServerMessage;
      try {
        m = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      if (m.type === "welcome") {
        this.role.set(m.role);
        // A scribble that fades has faded by the time anyone joins late; only live ones animate.
        const drawings: RoomState["drawings"] = {};
        for (const [k, list] of Object.entries(m.state.drawings))
          drawings[k] = list.filter((s) => !s.fade);
        this.state.set({ ...m.state, drawings });
      } else if (m.type === "state") {
        this.state.update((s) => ({ ...s, ...m.patch }));
      } else if (m.type === "nav") {
        this.state.update((s) => ({ ...s, position: m.position, term: null }));
      } else if (m.type === "term") {
        this.state.update((s) => ({
          ...s,
          term: { slide: m.slide, id: m.id, n: m.n, view: m.view },
        }));
      } else if (m.type === "term:off") {
        this.state.update((s) => (s.term ? { ...s, term: null } : s));
      } else if (m.type === "pointer") {
        this.state.update((s) => ({ ...s, pointer: { x: m.x, y: m.y } }));
      } else if (m.type === "pointer:off") {
        this.state.update((s) => (s.pointer ? { ...s, pointer: null } : s));
      } else if (m.type === "draw") {
        this.state.update((s) => ({
          ...s,
          drawings: {
            ...s.drawings,
            [m.slide]: [
              ...(s.drawings[m.slide] ?? []).filter((x) => x.id !== m.stroke.id),
              m.stroke,
            ],
          },
        }));
      } else if (m.type === "draw:undo") {
        this.state.update((s) => ({
          ...s,
          drawings: { ...s.drawings, [m.slide]: (s.drawings[m.slide] ?? []).slice(0, -1) },
        }));
      } else if (m.type === "draw:clear") {
        this.state.update((s) => ({ ...s, drawings: { ...s.drawings, [m.slide]: [] } }));
      }
      for (const l of this.listeners) l(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      if (this.closedByUs) {
        this.status.set("closed");
        return;
      }
      this.status.set(this.attempts > 4 ? "offline" : "closed");
      const delay = Math.min(15_000, 500 * 2 ** this.attempts++);
      this.timer = setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private raw(m: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  send(m: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.raw(m);
    else if (m.type !== "pointer" && m.type !== "presence" && m.type !== "ping") this.queue.push(m);
  }

  /**
   * Send now or not at all: for what is stale a moment later (a remote's "next", a laser move),
   * which must not pile up while offline and all fire on reconnect.
   */
  sendNow(m: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.raw(m);
    return true;
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private roleNow(): Role {
    return this.away ? "viewer" : this.options.role;
  }

  /**
   * A presenter client steps down to a viewer (`true`), or back up (`false`): it reconnects with
   * the other role. Nothing for a viewer or a phone.
   */
  setAway(away: boolean) {
    if (this.options.role !== "presenter" || this.options.client === "remote") return;
    if (this.away === away) return;
    this.away = away;
    if (this.ws || this.opening || this.timer) this.reconnect();
  }

  /** Drop the connection and open it again now — the credentials changed (a presenter signed in). */
  reconnect() {
    if (typeof window === "undefined" || this.closedByUs) return;
    this.attempts = 0;
    this.drop();
    this.open();
  }

  close() {
    this.closedByUs = true;
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.ws?.close();
    this.ws = null;
    this.status.set("closed");
  }
}
