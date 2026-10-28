import type { PollState, Question, QuizState } from "../live/protocol.ts";

/**
 * The audience page's decisions, without React: what a tap may send, how the lists sort, what a
 * poll or a quiz looks like to this viewer right now. The room decides everything for real; this
 * only keeps the phone from promising what the room will refuse.
 */

/**
 * The room takes 8 reactions per viewer per 2 s and drops the rest without a word (the Worker's
 * LIMITS). A sliding window of the same size here never lets through a tap the room would drop,
 * so a tap that animates is a tap that lands.
 */
export const REACTION_LIMIT = { n: 8, per: 2000 } as const;

export function createLimiter(n: number, per: number, now: () => number = Date.now) {
  const times: number[] = [];
  return {
    /** True (and counted) when one more fits in the window. */
    take(): boolean {
      const t = now();
      // The room opens a new window only once `per` has fully passed (`reset < now`).
      while (times.length && t - times[0]! > per) times.shift();
      if (times.length >= n) return false;
      times.push(t);
      return true;
    },
  };
}

/** The room takes one question per viewer per 5 s (the Worker's LIMITS) and drops the rest. */
export const QUESTION_LIMIT = { n: 1, per: 5000 } as const;
/** How long a question sent on an open socket waits to hear back before it counts as lost. */
export const ASK_TIMEOUT = 8000;

/** What the room said about one ask (`qa:ack`), or the page's own limit standing in for it. */
export interface AskAck {
  ok: boolean;
  reason?: "rate" | "invalid";
  retryIn?: number;
}

/** The line a refused question gets, in place of "Question sent". */
export function askRefusal(ack: Pick<AskAck, "reason" | "retryIn">): string {
  if (ack.reason === "invalid") return "That question is too short to send.";
  const s = ack.retryIn ? Math.max(1, Math.ceil(ack.retryIn / 1000)) : 0;
  return s
    ? `Too fast. Try again in ${s} second${s === 1 ? "" : "s"}.`
    : "Too fast. Try again in a few seconds.";
}

export type AskResult = { ok: true; text: string } | { ok: false; text: string; message: string };

/**
 * The questions this page has sent and not yet heard about. The room used to drop one asked
 * within its rate limit without a word while the page said "Question sent". Each ask now settles
 * once: taken when the room acknowledges it (`qa:ack`) or, from a room that sends no ack, when
 * a question with its text comes back in the room's list; refused when the room says so; lost
 * when an ask on an open socket hears nothing within `timeout`. One queued while offline waits for
 * the room without a deadline.
 */
export function createAskTracker(o: {
  onSettled: (result: AskResult) => void;
  timeout?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}) {
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const waiting = new Map<string, { text: string; timer: unknown }>();
  const settle = (ref: string, result: (text: string) => AskResult) => {
    const w = waiting.get(ref);
    if (!w) return;
    waiting.delete(ref);
    if (w.timer !== null) clearTimer(w.timer);
    o.onSettled(result(w.text));
  };
  return {
    sent(ref: string, text: string, online: boolean) {
      const lost = () =>
        settle(ref, (t) => ({
          ok: false,
          text: t,
          message: "Your question didn't reach the room. Try again in a few seconds.",
        }));
      waiting.set(ref, { text, timer: online ? setTimer(lost, o.timeout ?? ASK_TIMEOUT) : null });
    },
    /** The room's list now holds a question with this text (claimed as this viewer's). */
    arrived(text: string) {
      for (const [ref, w] of waiting)
        if (w.text === text) return settle(ref, (t) => ({ ok: true, text: t }));
    },
    ack(ref: string, ack: AskAck) {
      settle(ref, (text) =>
        ack.ok ? { ok: true, text } : { ok: false, text, message: askRefusal(ack) },
      );
    },
    dispose() {
      for (const w of waiting.values()) if (w.timer !== null) clearTimer(w.timer);
      waiting.clear();
    },
  };
}

/** Open first, then most votes, then oldest: the order the presenter sees them. */
export function sortQuestions<Q extends Pick<Question, "answered" | "votes" | "at">>(qs: Q[]): Q[] {
  return [...qs].sort(
    (a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes || a.at - b.at,
  );
}

/** The room's own cleaning of a question (whitespace folded, trimmed, 280 at most). */
export function cleanQuestion(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 280);
}

/**
 * Which questions are this viewer's. The room does not say who asked what (a question is
 * anonymous to everyone, the asker included), so the page remembers what it sent and claims the
 * first new question with that text. `pending` is consumed as questions are claimed.
 */
export function claimAsked(
  known: ReadonlySet<string>,
  questions: readonly Pick<Question, "id" | "text">[],
  pending: string[],
): string[] {
  const claimed: string[] = [];
  for (const q of questions) {
    if (known.has(q.id) || !pending.length) continue;
    const i = pending.indexOf(q.text);
    if (i < 0) continue;
    pending.splice(i, 1);
    claimed.push(q.id);
  }
  return claimed;
}

/** Whole percentages for each count (0 when nobody has answered). */
export function percents(counts: readonly number[], total: number): number[] {
  return counts.map((n) => (total > 0 ? Math.round((n / total) * 100) : 0));
}

/** The options a poll shows: a rating poll's are its scale, 1…N, when the room sent none. */
export function pollOptions(p: Pick<PollState, "def" | "counts">): string[] {
  if (p.def.kind === "rating" && !p.def.options.length)
    return Array.from({ length: p.def.scale ?? p.counts.length ?? 5 }, (_, i) => String(i + 1));
  return p.def.options;
}

/** A rating poll's average, one decimal (null with no answers). */
export function ratingAverage(counts: readonly number[]): number | null {
  let n = 0;
  let sum = 0;
  counts.forEach((c, i) => {
    n += c;
    sum += c * (i + 1);
  });
  return n ? Math.round((sum / n) * 10) / 10 : null;
}

/** Whether this viewer's answer counts as given. */
export function hasVoted(mine: PollState["mine"]): boolean {
  if (mine === null || mine === undefined) return false;
  if (Array.isArray(mine)) return mine.length > 0;
  return typeof mine === "string" ? mine.length > 0 : true;
}

export type QuizOutcome =
  /** Open, and this viewer has not answered. */
  | "answer"
  /** Open, answered: waiting for the clock or the presenter. */
  | "locked"
  /** Closed and not yet revealed. */
  | "waiting"
  | "correct"
  | "wrong"
  /** Revealed, and this viewer never answered. */
  | "missed";

export function quizOutcome(
  q: Pick<QuizState, "open" | "revealed"> & { def: Pick<QuizState["def"], "correct"> },
  mine: number | null,
): QuizOutcome {
  if (q.revealed) return mine === null ? "missed" : mine === q.def.correct ? "correct" : "wrong";
  if (q.open) return mine === null ? "answer" : "locked";
  return "waiting";
}

/** The room's word for a word cloud entry: what it counts (lowercased, 24 at most). */
export function cleanWord(word: string): string {
  return word.replace(/\s+/g, " ").trim().slice(0, 24).toLowerCase();
}

/** "A", "B", … for a quiz's options. */
export const letter = (i: number) => String.fromCharCode(65 + (i % 26));

export type RoomPhase =
  | "solo"
  | "connecting"
  | "reconnecting"
  | "offline"
  | "waiting"
  | "live"
  | "left";

/**
 * One word for the state of the room as this phone sees it: no room at all (`solo`), on the way
 * in, lost and trying again, given up for now, in with nobody presenting yet, in and live, or in
 * after the presenter has gone.
 */
export function roomPhase(opts: {
  hasRoom: boolean;
  status: "idle" | "connecting" | "open" | "closed" | "offline";
  presenter: boolean;
  everOpen: boolean;
  everPresented: boolean;
}): RoomPhase {
  if (!opts.hasRoom) return "solo";
  if (opts.status === "offline") return "offline";
  if (opts.status !== "open") return opts.everOpen ? "reconnecting" : "connecting";
  if (opts.presenter) return "live";
  return opts.everPresented ? "left" : "waiting";
}
