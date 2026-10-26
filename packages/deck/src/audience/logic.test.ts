import { describe, expect, test } from "bun:test";

import {
  claimAsked,
  cleanQuestion,
  cleanWord,
  createLimiter,
  hasVoted,
  letter,
  percents,
  pollOptions,
  quizOutcome,
  ratingAverage,
  REACTION_LIMIT,
  roomPhase,
  sortQuestions,
} from "./logic.ts";

describe("the reaction limiter", () => {
  test("lets through what the room takes, then refuses until the window moves on", () => {
    let t = 0;
    const l = createLimiter(REACTION_LIMIT.n, REACTION_LIMIT.per, () => t);
    for (let i = 0; i < REACTION_LIMIT.n; i++) expect(l.take()).toBe(true);
    expect(l.take()).toBe(false);
    t = REACTION_LIMIT.per - 1;
    expect(l.take()).toBe(false);
    t = REACTION_LIMIT.per;
    expect(l.take()).toBe(false);
    t = REACTION_LIMIT.per + 1;
    expect(l.take()).toBe(true);
  });

  test("never passes a tap the room's fixed window would drop", () => {
    // The room (deck-worker LIMITS): a bucket opens at the first message and takes n until
    // `per` after it. Any sequence the sliding window accepts, the bucket accepts too.
    let t = 0;
    const l = createLimiter(8, 2000, () => t);
    let bucket: { count: number; reset: number } | null = null;
    const room = () => {
      if (!bucket || bucket.reset < t) {
        bucket = { count: 1, reset: t + 2000 };
        return true;
      }
      if (bucket.count >= 8) return false;
      bucket.count++;
      return true;
    };
    for (let i = 0; i < 400; i++) {
      t += [37, 120, 250, 5, 900, 1, 2000, 1999][i % 8]!;
      if (l.take()) expect(room()).toBe(true);
    }
  });
});

describe("questions", () => {
  test("open before answered, then votes, then oldest", () => {
    const q = (id: string, votes: number, at: number, answered = false) => ({
      id,
      votes,
      at,
      answered,
    });
    const sorted = sortQuestions([q("a", 1, 1), q("b", 5, 2, true), q("c", 3, 3), q("d", 3, 0)]);
    expect(sorted.map((x) => x.id)).toEqual(["d", "c", "a", "b"]);
  });

  test("cleaned as the room cleans them", () => {
    expect(cleanQuestion("  two\n\nlines   here ")).toBe("two lines here");
    expect(cleanQuestion("x".repeat(400))).toHaveLength(280);
  });

  test("the viewer's own are claimed by their text, once each", () => {
    const pending = ["How big?", "How big?"];
    const qs = [
      { id: "1", text: "Other" },
      { id: "2", text: "How big?" },
    ];
    expect(claimAsked(new Set(), qs, pending)).toEqual(["2"]);
    expect(pending).toEqual(["How big?"]);
    // Already known: not claimed twice; the second ask lands later.
    expect(claimAsked(new Set(["2"]), [...qs, { id: "3", text: "How big?" }], pending)).toEqual([
      "3",
    ]);
    expect(pending).toEqual([]);
  });
});

describe("polls", () => {
  test("percentages are whole and zero without answers", () => {
    expect(percents([1, 2, 0], 3)).toEqual([33, 67, 0]);
    expect(percents([0, 0], 0)).toEqual([0, 0]);
  });

  test("a rating poll's options are its scale when the room sent none", () => {
    const def = { id: "r", kind: "rating" as const, question: "?", options: [], scale: 4 };
    expect(pollOptions({ def, counts: [0, 0, 0, 0] })).toEqual(["1", "2", "3", "4"]);
    expect(pollOptions({ def: { ...def, kind: "choice", options: ["a"] }, counts: [0] })).toEqual([
      "a",
    ]);
  });

  test("a rating's average", () => {
    expect(ratingAverage([0, 0, 0, 1, 1])).toBe(4.5);
    expect(ratingAverage([0, 0])).toBeNull();
  });

  test("what counts as voted", () => {
    expect(hasVoted(null)).toBe(false);
    expect(hasVoted(undefined)).toBe(false);
    expect(hasVoted(0)).toBe(true);
    expect(hasVoted([])).toBe(false);
    expect(hasVoted([2])).toBe(true);
    expect(hasVoted("")).toBe(false);
    expect(hasVoted("word")).toBe(true);
  });

  test("words are counted lowercased, 24 at most", () => {
    expect(cleanWord("  Clear  ")).toBe("clear");
    expect(cleanWord("x".repeat(30))).toHaveLength(24);
  });
});

describe("quizzes", () => {
  const q = (open: boolean, revealed: boolean) => ({ open, revealed, def: { correct: 1 } });
  test("every state a viewer can be in", () => {
    expect(quizOutcome(q(true, false), null)).toBe("answer");
    expect(quizOutcome(q(true, false), 2)).toBe("locked");
    expect(quizOutcome(q(false, false), 2)).toBe("waiting");
    expect(quizOutcome(q(false, true), 1)).toBe("correct");
    expect(quizOutcome(q(false, true), 0)).toBe("wrong");
    expect(quizOutcome(q(false, true), null)).toBe("missed");
  });
  test("letters", () => {
    expect([0, 1, 3].map(letter)).toEqual(["A", "B", "D"]);
  });
});

describe("the room's phase", () => {
  const base = { hasRoom: true, presenter: false, everOpen: false, everPresented: false };
  test("from joining to ended", () => {
    expect(roomPhase({ ...base, hasRoom: false, status: "idle" })).toBe("solo");
    expect(roomPhase({ ...base, status: "connecting" })).toBe("connecting");
    expect(roomPhase({ ...base, status: "open" })).toBe("waiting");
    expect(roomPhase({ ...base, status: "open", presenter: true })).toBe("live");
    expect(roomPhase({ ...base, status: "closed", everOpen: true })).toBe("reconnecting");
    expect(roomPhase({ ...base, status: "connecting", everOpen: true })).toBe("reconnecting");
    expect(roomPhase({ ...base, status: "offline", everOpen: true })).toBe("offline");
    expect(roomPhase({ ...base, status: "open", everOpen: true, everPresented: true })).toBe(
      "left",
    );
  });
});
