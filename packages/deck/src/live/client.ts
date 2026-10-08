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
}

type Listener = (message: ServerMessage) => void;

export function viewerId(): string {
  try {
    const key = "deck.viewer";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `v_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `v_${Math.random().toString(36).slice(2, 12)}`;
  }
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

  constructor(private readonly options: RoomClientOptions) {}

  connect() {
    if (typeof window === "undefined") return;
    this.closedByUs = false;
    this.open();
  }

  private url(token: string | null): string {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = this.options.api.startsWith("http")
      ? this.options.api.replace(/^http/, "ws")
      : `${proto}//${window.location.host}${this.options.api}`;
    const q = new URLSearchParams({ role: this.options.role });
    if (token) q.set("t", token);
    return `${base}/rooms/${encodeURIComponent(this.options.room)}/ws?${q}`;
  }

  private open() {
    if (this.ws || this.opening) return;
    this.status.set("connecting");
    this.opening = true;
    const start = (token: string | null) => {
      this.opening = false;
      if (this.closedByUs) return;
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
    ws.onopen = () => {
      this.attempts = 0;
      this.status.set("open");
      this.raw({
        type: "hello",
        role: this.options.role,
        viewer: this.options.viewer,
        name: this.options.name,
        position: this.position,
      });
      for (const m of this.queue.splice(0)) this.raw(m);
      this.heartbeat = setInterval(() => this.raw({ type: "ping" }), 25_000);
    };
    ws.onmessage = (e) => {
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

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close() {
    this.closedByUs = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.ws?.close();
    this.ws = null;
    this.status.set("closed");
  }
}
