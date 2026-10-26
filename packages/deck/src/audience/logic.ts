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
