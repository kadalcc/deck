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
  blackout: boolean;
  /** Whether the presenter has made the notes visible to the audience page. */
  notesPublic: boolean;
  /** Session start, epoch ms, or null when nobody is presenting. */
  startedAt: number | null;
  /** Reaction totals for the session, by emoji. */
  reactions: Record<string, number>;
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

export type ClientMessage =
  | { type: "hello"; role: Role; viewer: string; name?: string; position?: RoomPosition }
  | { type: "nav"; position: RoomPosition }
  | { type: "pointer"; x: number; y: number }
  | { type: "pointer:off" }
  | ({ type: "term" } & RoomTerm)
  | { type: "term:off" }
  | { type: "spotlight"; on: boolean }
  | { type: "blackout"; on: boolean }
  | { type: "draw"; slide: string; stroke: Stroke }
  | { type: "draw:undo"; slide: string }
  | { type: "draw:clear"; slide: string }
  | { type: "react"; emoji: string }
  | { type: "qa:ask"; text: string; slide: string }
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
  | { type: "pong" };

export const REACTIONS = ["👏", "🔥", "❤️", "😂", "🤯", "👀", "🙋", "💡"] as const;
