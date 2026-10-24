import { parseTimer, serializeTimer, type TimerState } from "./timer.ts";
import type { Via } from "./windows.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE DECK'S WINDOWS SAY TO EACH OTHER  —  over the window bus (core/windows.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   nav               a position (slide, step, blackout), who sent it, and whether it was the
 *                     presenter's window: the play window, the presenter view, the share window
 *                     and the teleprompter all keep in step on these
 *   presenter:ask     "how is the talk going?" — a teleprompter that has just opened
 *   presenter:state   the presenter's answer, and again whenever it changes: the timer, and the
 *                     room at a glance (hands, the pace votes, viewers, open questions)
 *
 * A window ignores a type it does not know, so a tab left open across an upgrade carries on with
 * the positions and drops the rest; nothing about `nav` changed when the other two arrived.
 *
 * The bus reaches whatever is related to a deck window — and the page that OPENED the play window
 * can be any page at all — so nothing here is a secret: positions, a timer, counts. Never a
 * question's text, never a ticket. And everything that arrives is checked for its shape before a
 * window acts on it, because anything with a handle on a window can postMessage it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A position one window of this deck tells the others. */
export interface NavMessage {
  type: "nav";
  h: number;
  v: number;
  click: number;
  paused: boolean;
  from: string;
  presenter?: boolean;
}

/** A teleprompter, opening: the presenter answers with a `presenter:state`. */
export interface PresenterAsk {
  type: "presenter:ask";
  from: string;
}

/** The room as the teleprompter shows it: counts only. */
export interface RoomGlance {
  hands: number;
  viewers: number;
  pace: { slower: number; faster: number; total: number };
  /** Questions not yet marked answered. */
  questions: number;
}

/** The presenter's timer and room, for a window that shows them without being either. */
export interface PresenterState {
  type: "presenter:state";
  from: string;
  /** The presenter's timer (core/timer.ts); null before the presenter view has one. */
  timer: TimerState | null;
  /** Null when the deck has no live room. */
  room: RoomGlance | null;
}

export type WindowMessage = NavMessage | PresenterAsk | PresenterState;

/** Who is receiving a position: the rules differ for the presenter and the teleprompter. */
export interface NavReceiver {
  windowId: string;
  presenter: boolean;
  teleprompter: boolean;
}

/**
 * Whether a window applies a position that came over the bus.
 *
 * The presenter's window is driven by the presenter. Another tab of this browser reading the deck
 * on its own is a viewer, and a viewer must never move the window that drives the room. Nor may
 * the page that OPENED a presenter view: that can be any page at all, and what it says about
 * itself (`presenter: true`) is only its word.
 *
 * A teleprompter reads along with the presenter and nobody else: the play window being clicked
 * through by someone at the projector is not where the speaker is.
 */
export function takesNav(self: NavReceiver, m: NavMessage, via: Via): boolean {
  if (m.from === self.windowId) return false;
  if (self.presenter && (!m.presenter || via === "opener")) return false;
  if (self.teleprompter && !m.presenter) return false;
  return true;
}

const count = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;

export function isNavMessage(m: unknown): m is NavMessage {
  const x = m as NavMessage | null;
  return (
    !!x &&
    typeof x === "object" &&
    x.type === "nav" &&
    Number.isInteger(x.h) &&
    Number.isInteger(x.v) &&
    Number.isInteger(x.click) &&
    typeof x.from === "string"
  );
}

/** The counts the teleprompter shows, from the room's state; null without a room. */
export function roomGlance(
  state: {
    presence?: {
      hands?: number;
      viewers?: number;
      pace?: { slower?: number; faster?: number; total?: number };
    };
    questions?: readonly { answered?: boolean }[];
  } | null,
): RoomGlance | null {
  if (!state) return null;
  const p = state.presence ?? {};
  return {
    hands: count(p.hands),
    viewers: count(p.viewers),
    pace: {
      slower: count(p.pace?.slower),
      faster: count(p.pace?.faster),
      total: count(p.pace?.total),
    },
    questions: (state.questions ?? []).filter((q) => !q.answered).length,
  };
}

/** A `presenter:state` as it arrived, checked; null for anything else. */
export function parsePresenterState(m: unknown): PresenterState | null {
  const x = m as Partial<PresenterState> | null;
  if (!x || typeof x !== "object" || x.type !== "presenter:state" || typeof x.from !== "string")
    return null;
  // The timer goes through the same check a stored one does: a shape, not a promise.
  const timer =
    x.timer && typeof x.timer === "object"
      ? parseTimer(serializeTimer(x.timer as TimerState))
      : null;
  const g = (x.room && typeof x.room === "object" ? x.room : null) as Partial<RoomGlance> | null;
  const room: RoomGlance | null = g
    ? {
        hands: count(g.hands),
        viewers: count(g.viewers),
        pace: {
          slower: count(g.pace?.slower),
          faster: count(g.pace?.faster),
          total: count(g.pace?.total),
        },
        questions: count(g.questions),
      }
    : null;
  return { type: "presenter:state", from: x.from, timer, room };
}

/** Two states that would draw the same: the presenter sends only a change. */
export function sameState(
  a: Pick<PresenterState, "timer" | "room"> | null,
  b: Pick<PresenterState, "timer" | "room">,
): boolean {
  return !!a && JSON.stringify([a.timer, a.room]) === JSON.stringify([b.timer, b.room]);
}
