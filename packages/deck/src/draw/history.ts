import type { ClientMessage, Stroke } from "../live/protocol.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * UNDO, REDO, AND TELLING THE ROOM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every change to a slide's strokes — a stroke, a shape, an erase, a clear — is one step of
 * history: the layers it touched as they were before. Undo puts them back, redo puts them forward
 * again, and a new change after an undo drops what could have been redone. History is this
 * window's own, per slide; the strokes themselves are shared.
 *
 * The room only knows three things — add a stroke, take the last one off, clear the slide — and
 * a deployed room keeps to those, so every change is said in them (`roomOps`): an added stroke is
 * a `draw`, an undone last stroke is a `draw:undo`, an emptied slide is a `draw:clear`, and
 * anything else (an erase from the middle, a redo of a clear) is a clear followed by the strokes
 * that are left. `RoomSender` paces that so the room's limit (60 draws in 2 s) never drops one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Undo and redo steps; a step is whatever a change replaced (a slide's layers, here). */
export interface History<T = Stroke[]> {
  undo: T[];
  redo: T[];
}

export const emptyHistory = <T = Stroke[]>(): History<T> => ({ undo: [], redo: [] });

/** How far back undo reaches, per slide. */
export const HISTORY_LIMIT = 100;

/** Remember `before` as an undo step; a new change forgets what could have been redone. */
export function record<T>(h: History<T>, before: T): History<T> {
  return { undo: [...h.undo, before].slice(-HISTORY_LIMIT), redo: [] };
}

/** Step back: what to put back, and the history after. Null when there is nothing to undo. */
export function undo<T>(h: History<T>, current: T): { value: T; history: History<T> } | null {
  if (!h.undo.length) return null;
  return {
    value: h.undo[h.undo.length - 1]!,
    history: { undo: h.undo.slice(0, -1), redo: [...h.redo, current] },
  };
}

/** Step forward again after an undo. Null when there is nothing to redo. */
export function redo<T>(h: History<T>, current: T): { value: T; history: History<T> } | null {
  if (!h.redo.length) return null;
  return {
    value: h.redo[h.redo.length - 1]!,
    history: { undo: [...h.undo, current].slice(-HISTORY_LIMIT), redo: h.redo.slice(0, -1) },
  };
}

type DrawMessage = Extract<ClientMessage, { type: "draw" | "draw:undo" | "draw:clear" }>;

/** The fewest room messages that turn the room's `prev` list for a layer into `next`. */
export function roomOps(slide: string, prev: Stroke[], next: Stroke[]): DrawMessage[] {
  if (sameList(prev, next)) return [];
  if (!next.length) return [{ type: "draw:clear", slide }];
  // Strokes added on top (one stroke, a shape, a redo of strokes).
  if (next.length > prev.length && prev.every((s, i) => next[i] === s))
    return next.slice(prev.length).map((stroke) => ({ type: "draw", slide, stroke }));
  // The last strokes taken off (undo of a stroke).
  if (next.length < prev.length && next.every((s, i) => prev[i] === s)) {
    const n = prev.length - next.length;
    // A few pops are cheaper than a clear and a resend; many are not.
    if (n <= Math.max(3, next.length))
      return Array.from({ length: n }, () => ({ type: "draw:undo", slide }));
  }
  return [
    { type: "draw:clear", slide },
    ...next.map((stroke) => ({ type: "draw" as const, slide, stroke })),
  ];
}

// By identity: lists are never changed in place, and a cut stroke keeps its id with new points.
const sameList = (a: Stroke[], b: Stroke[]) =>
  a.length === b.length && a.every((s, i) => s === b[i]);

/**
 * Sends draw messages to the room no faster than it accepts them: up to `burst` at once, then
 * the rest after the window has passed. Messages keep their order.
 */
export class RoomSender {
  private queue: DrawMessage[] = [];
  private sent: number[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly send: (m: DrawMessage) => void,
    private readonly burst = 50,
    private readonly per = 2100,
    private readonly now: () => number = () => Date.now(),
  ) {}

  push(messages: DrawMessage[]) {
    this.queue.push(...messages);
    this.flush();
  }

  private flush() {
    const t = this.now();
    this.sent = this.sent.filter((at) => t - at < this.per);
    while (this.queue.length && this.sent.length < this.burst) {
      this.send(this.queue.shift()!);
      this.sent.push(t);
    }
    if (this.queue.length && !this.timer) {
      const wait = Math.max(50, this.per - (t - (this.sent[0] ?? t)));
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, wait);
    }
  }

  /** What is still waiting (for tests). */
  get pending() {
    return this.queue.length;
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queue = [];
  }
}
