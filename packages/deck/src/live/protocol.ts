/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ROOM PROTOCOL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * One room per deck, held by a Durable Object on the host (apps/deck-worker). The presenter
 * drives it; viewers follow it or wander and catch up; everyone can react, ask and vote. Messages
 * are small JSON over one WebSocket per window. The same types are used by the client and the
 * worker, so the wire format lives here and nowhere else.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Role = "presenter" | "viewer";

export interface RoomPosition {
  h: number;
  v: number;
  click: number;
}

export interface Stroke {
  id: string;
  tool: "pen" | "highlighter";
  color: string;
  size: number;
  /** Stage coordinates, 0..width × 0..height. */
  points: [number, number][];
  /** A scribble that lingers a few seconds, then unwinds along its own path on every screen. */
  fade?: boolean;
  /**
   * Drawn with a shape tool (draw/shapes.ts). `points` is still the full outline, so a room or a
   * screen that drops this field draws the same figure; with it, the edges are drawn straight.
   */
  shape?: "line" | "arrow" | "rect" | "ellipse";
  /** A shape's drag, from where the pointer went down to where it lifted (stage pixels). */
  anchor?: [[number, number], [number, number]];
}

export interface Question {
  id: string;
  text: string;
  votes: number;
  answered: boolean;
  at: number;
  /** The slide it was asked on, "h,v". */
  slide: string;
  /** Set on the client for the asker's own questions. */
  mine?: boolean;
  /** Set on the client when this viewer has voted. */
  voted?: boolean;
}

export type PollKind = "choice" | "multi" | "rating" | "words";

export interface PollDef {
  id: string;
  kind: PollKind;
  question: string;
  options: string[];
  /** For rating polls: the scale's top, 5 by default. */
  scale?: number;
}

export interface PollState {
  def: PollDef;
  open: boolean;
  /** Votes per option (choice/multi/rating buckets). */
  counts: number[];
  /** For word polls: word → count. */
  words: Record<string, number>;
  total: number;
  /** Set on the client: what this viewer answered. */
  mine?: number | number[] | string | null;
}

export interface QuizDef {
  id: string;
  question: string;
  options: string[];
  correct: number;
  /** Seconds to answer once opened. */
  seconds: number;
}

export interface QuizState {
  def: QuizDef;
  open: boolean;
  /** When the current round closes, epoch ms; null when not open. */
  deadline: number | null;
  counts: number[];
  /** Whether the answer has been revealed. */
  revealed: boolean;
  leaderboard: { name: string; score: number }[];
  mine?: number | null;
}

export interface Presence {
  viewers: number;
  presenter: boolean;
  /** Viewers by slide "h,v". */
  bySlide: Record<string, number>;
  /** Live pace feedback from viewers: how many want slower / faster. */
  pace: { slower: number; faster: number; total: number };
  /** Hands raised. */
  hands: number;
  /**
   * Phone remotes connected (presenter sockets that said `client: "remote"` in their hello). They
   * are not viewers and do not make `presenter` true. Absent in older rooms.
   */
  remotes?: number;
}

/**
 * A glossary card the presenter is sharing: a mention, not a definition. Every screen runs the
 * same build, so each finds the words in its own glossary and the element on its own slide.
 */
export interface RoomTerm {
  /** The slide, "h,v". */
  slide: string;
  /** The glossary entry's id (or a one-off `<Term def>`'s). */
  id: string;
  /** Which of the slide's mentions of it, in document order. */
  n: number;
  /** The related entry the card was swapped to, or null. */
  view: string | null;
}

export interface RoomState {
  position: RoomPosition;
  presence: Presence;
  questions: Question[];
  polls: Record<string, PollState>;
  quizzes: Record<string, QuizState>;
  /** Strokes by slide "h,v". */
  drawings: Record<string, Stroke[]>;
  pointer: { x: number; y: number } | null;
  /** The term card the presenter has open for everyone, or null. Absent in older rooms' state. */
  term?: RoomTerm | null;
  spotlight: boolean;
  /**
   * The presenter's zoom: the point it centres on, as a fraction of the slide, and how far in.
   * Following screens zoom with it. Absent in older rooms' state.
   */
  zoom?: RoomZoom | null;
  blackout: boolean;
  /** Whether the presenter has made the notes visible to the audience page. */
  notesPublic: boolean;
  /** Session start, epoch ms, or null when nobody is presenting. */
  startedAt: number | null;
  /** Reaction totals for the session, by emoji. */
  reactions: Record<string, number>;
}

export interface RoomZoom {
  /** 0–1 across the slide. */
  x: number;
  /** 0–1 down the slide. */
  y: number;
  /** 1.2–6. */
  scale: number;
}

/** A zoom as the room accepts it: a point on the slide and a sane scale, or null for none. */
export function parseZoom(z: unknown): RoomZoom | null | undefined {
  if (z === null) return null;
  if (!z || typeof z !== "object") return undefined;
  const { x, y, scale } = z as Record<string, unknown>;
  const ok = (n: unknown, lo: number, hi: number): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
  return ok(x, 0, 1) && ok(y, 0, 1) && ok(scale, 1.2, 6) ? { x, y, scale } : undefined;
}

export const EMPTY_ROOM: RoomState = {
  position: { h: 0, v: 0, click: 0 },
  presence: {
    viewers: 0,
    presenter: false,
    bySlide: {},
    pace: { slower: 0, faster: 0, total: 0 },
    hands: 0,
  },
  questions: [],
  polls: {},
  quizzes: {},
  drawings: {},
  pointer: null,
  term: null,
  spotlight: false,
  blackout: false,
  notesPublic: false,
  startedAt: null,
  reactions: {},
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PHONE REMOTE  —  commands from a phone, run in the presenting window
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A remote is a presenter-role socket (it holds the presenter's ticket) whose hello says
 * `client: "remote"` and carries no position, so joining never moves the room. It sends
 * `command`s; the room hands each one to the presenter's OTHER sockets — never to a viewer — as a
 * ServerMessage `command` stamped with `from`, the sender's connection id. The presenting window
 * runs it through its command registry (core/commands.ts, origin "remote") and answers with
 * `command:result` addressed `to` that id; the room delivers the answer to that one socket only,
 * because `seq` is the sender's own counter and means nothing to anyone else. The presenting
 * window pushes `remote:state` whenever something a remote shows changes, and the room relays it
 * to the remotes only. `remote:kick` (presenter windows only) closes every remote socket after a
 * `remote:bye`.
 *
 * PAIRING (rooms that support it, e.g. deck.kadal.cc): the QR holds a one-time CODE, not the
 * presenter's ticket. A presenting window asks with `remote:offer` and hears `remote:code` (the
 * code and how long it works); it asks again as the code nears its end, so the QR keeps changing.
 * A phone connects with `role=remote` and nothing else on the URL, and says the code in its hello
 * (`pair`); the room answers `remote:paired` with a LEASE the phone keeps to reconnect (`lease` in
 * a later hello). One phone at a time: pairing a new one closes every other remote with a
 * `remote:bye`, and its lease stops working. `remote:kick` drops the lease and every code.
 *
 * The same messages travel over the dev server's relay when there is no room (src/remote/relay.ts).
 */
export interface RemoteState {
  slide: {
    index: number;
    h: number;
    v: number;
    id: string | null;
    title: string | null;
    click: number;
    /** Click steps on this slide. */
    clicks: number;
  };
  total: number;
  blackout: boolean;
  overview: boolean;
  pointer: boolean;
  spotlight: boolean;
  drawing: boolean;
  hints: boolean;
  zoomed: boolean;
  colorScheme: "light" | "dark";
  theme: string;
  /** When the presenter's timer started, epoch ms; null when it is not running. */
  startedAt: number | null;
  /**
   * The presenter's timer itself (core/timer.ts `RemoteTimer`): its mode, the talk's length in
   * seconds, the milliseconds counted when this was sent, and whether it is running. The phone
   * counts on from when it RECEIVED this, so its own clock never matters. Absent from an older
   * presenter, which sent only `startedAt`.
   */
  timer?: {
    mode: "stopwatch" | "countdown";
    duration: number | null;
    elapsedMs: number;
    running: boolean;
  } | null;
}

/** A command id: dotted words, "nav.next", "present.laserAt". */
const COMMAND_ID = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*){1,3}$/;
/** Parameters bigger than this are not a remote's (a stroke goes point by point). */
export const MAX_COMMAND_PARAMS = 4096;
/** A result value bigger than this is sent without its value. */
export const MAX_RESULT_VALUE = 16_384;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isSeq = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 2_147_483_647;
const jsonSize = (v: unknown) => {
  try {
    return JSON.stringify(v ?? null).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

/** A `command` as a remote may send it, or null: a dotted id, a seq, small object params. */
export function parseCommand(
  m: unknown,
): { id: string; params: Record<string, unknown>; seq: number } | null {
  if (!isRecord(m) || m.type !== "command") return null;
  if (typeof m.id !== "string" || m.id.length > 64 || !COMMAND_ID.test(m.id)) return null;
  if (!isSeq(m.seq)) return null;
  if (m.params !== undefined && !isRecord(m.params)) return null;
  if (jsonSize(m.params) > MAX_COMMAND_PARAMS) return null;
  return { id: m.id, params: (m.params as Record<string, unknown> | undefined) ?? {}, seq: m.seq };
}

/** A `command:result`, or null. `to` is required from a presenting window, absent once delivered. */
export function parseCommandResult(
  m: unknown,
): { to?: string; seq: number; ok: boolean; value?: unknown; error?: string } | null {
  if (!isRecord(m) || m.type !== "command:result") return null;
  if (!isSeq(m.seq) || typeof m.ok !== "boolean") return null;
  if (m.to !== undefined && (typeof m.to !== "string" || m.to.length > 64)) return null;
  if (m.error !== undefined && typeof m.error !== "string") return null;
  const out: { to?: string; seq: number; ok: boolean; value?: unknown; error?: string } = {
    seq: m.seq,
    ok: m.ok,
  };
  if (m.to !== undefined) out.to = m.to as string;
  if (m.error !== undefined) out.error = (m.error as string).slice(0, 500);
  if (m.value !== undefined && jsonSize(m.value) <= MAX_RESULT_VALUE) out.value = m.value;
  return out;
}

/** A `remote:state`'s state, or null when it is not one. */
export function parseRemoteState(m: unknown): RemoteState | null {
  if (!isRecord(m) || m.type !== "remote:state" || !isRecord(m.state)) return null;
  const s = m.state;
  const slide = s.slide;
  if (!isRecord(slide)) return null;
  for (const k of ["index", "h", "v", "click", "clicks"]) if (!isSeq(slide[k])) return null;
  if (!isSeq(s.total)) return null;
  for (const k of ["blackout", "overview", "pointer", "spotlight", "drawing", "hints", "zoomed"])
    if (typeof s[k] !== "boolean") return null;
  if (s.startedAt !== null && typeof s.startedAt !== "number") return null;
  if (s.timer !== undefined && s.timer !== null) {
    const t = s.timer;
    if (!isRecord(t) || (t.mode !== "stopwatch" && t.mode !== "countdown")) return null;
    if (typeof t.elapsedMs !== "number" || typeof t.running !== "boolean") return null;
    if (t.duration !== null && typeof t.duration !== "number") return null;
  }
  if (jsonSize(s) > MAX_COMMAND_PARAMS) return null;
  return s as unknown as RemoteState;
}

export type ClientMessage =
  | {
      type: "hello";
      role: Role;
      viewer: string;
      name?: string;
      position?: RoomPosition;
      /** "remote": a phone remote (no position; not counted as the presenter). */
      client?: "remote";
      /** A phone pairing: the code from the presenter view's QR … */
      pair?: string;
      /** … or the lease the room gave it, to come back after a dropped connection. */
      lease?: string;
      /** The phone's random id for this page: saying a used code again from it gets the same lease. */
      device?: string;
    }
  | { type: "command"; id: string; params?: Record<string, unknown>; seq: number }
  | {
      type: "command:result";
      to: string;
      seq: number;
      ok: boolean;
      value?: unknown;
      error?: string;
    }
  | { type: "remote:state"; state: RemoteState }
  | { type: "remote:kick" }
  | { type: "remote:offer" }
  | { type: "nav"; position: RoomPosition }
  | { type: "pointer"; x: number; y: number }
  | { type: "pointer:off" }
  | ({ type: "term" } & RoomTerm)
  | { type: "term:off" }
  | { type: "spotlight"; on: boolean }
  | { type: "zoom"; zoom: RoomZoom | null }
  | { type: "blackout"; on: boolean }
  | { type: "draw"; slide: string; stroke: Stroke }
  | { type: "draw:undo"; slide: string }
  | { type: "draw:clear"; slide: string }
  | { type: "react"; emoji: string }
  | {
      type: "qa:ask";
      text: string;
      slide: string;
      /** The page's own id for this ask: a room that knows it answers with `qa:ack`. */
      ref?: string;
    }
  | { type: "qa:vote"; id: string }
  | { type: "qa:answered"; id: string; answered: boolean }
  | { type: "qa:delete"; id: string }
  | { type: "poll:define"; poll: PollDef }
  | { type: "poll:open"; id: string; open: boolean }
  | { type: "poll:reset"; id: string }
  | {
      type: "poll:vote";
      id: string;
      option?: number;
      options?: number[];
      word?: string;
      rating?: number;
    }
  | { type: "quiz:define"; quiz: QuizDef }
  | { type: "quiz:open"; id: string; open: boolean }
  | { type: "quiz:reveal"; id: string }
  | { type: "quiz:answer"; id: string; option: number; name: string }
  | { type: "presence"; slide: string }
  | { type: "pace"; value: -1 | 0 | 1 }
  | { type: "hand"; up: boolean }
  | { type: "notes:public"; on: boolean }
  | { type: "session"; action: "start" | "end" }
  | { type: "confetti" }
  | { type: "ping" };

export type ServerMessage =
  | { type: "welcome"; role: Role; you: string; state: RoomState }
  | { type: "state"; patch: Partial<RoomState> }
  | { type: "nav"; position: RoomPosition }
  | { type: "pointer"; x: number; y: number }
  | { type: "pointer:off" }
  | ({ type: "term" } & RoomTerm)
  | { type: "term:off" }
  | { type: "react"; emoji: string; n: number }
  | { type: "draw"; slide: string; stroke: Stroke }
  | { type: "draw:undo"; slide: string }
  | { type: "draw:clear"; slide: string }
  | { type: "confetti" }
  | { type: "error"; message: string }
  /**
   * To the asker only, for a `qa:ask` that carried a `ref`: taken (`id` is the question's), or not
   * — `rate` (one question per 5 s; `retryIn` ms until the next is taken) or `invalid`. A room
   * that predates it sends nothing (audience/logic.ts `createAskTracker` copes with both).
   */
  | {
      type: "qa:ack";
      ref: string;
      ok: boolean;
      id?: string;
      reason?: "rate" | "invalid";
      retryIn?: number;
    }
  | {
      type: "command";
      id: string;
      params?: Record<string, unknown>;
      seq: number;
      /** The sending socket's connection id, for the answer's `to`. */
      from: string;
    }
  | { type: "command:result"; seq: number; ok: boolean; value?: unknown; error?: string }
  | { type: "remote:state"; state: RemoteState }
  | { type: "remote:bye"; reason: string }
  /** To presenting windows: the code a QR shows now, good for `ttl` ms; `paired` when it replaces one a phone just used. */
  | { type: "remote:code"; code: string; ttl: number; paired?: boolean }
  /** To a phone that paired: what it says in its hello to come back. */
  | { type: "remote:paired"; lease: string }
  | { type: "pong" };

export const REACTIONS = ["👏", "🔥", "❤️", "😂", "🤯", "👀", "🙋", "💡"] as const;
