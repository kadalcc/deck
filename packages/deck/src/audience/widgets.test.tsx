import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { PollState, QuizState } from "../live/protocol.ts";
import { AudiencePoll, AudienceQuiz } from "./widgets.tsx";

const poll = (over: Partial<PollState> = {}): PollState => ({
  def: { id: "tools", kind: "choice", question: "How?", options: ["A slide app", "Markdown"] },
  open: true,
  counts: [1, 2],
  words: {},
  total: 3,
  ...over,
});
const renderPoll = (p: PollState, mine: PollState["mine"] = null, online = true) =>
  renderToStaticMarkup(createElement(AudiencePoll, { poll: p, online, mine, setMine: () => {} }));

describe("a poll on the audience page", () => {
  test("before voting: options to tap, no results to sway the vote", () => {
    const html = renderPoll(poll());
    expect(html).toContain("Open");
    expect(html).not.toContain("67%");
    expect(html).toContain("Tap to vote");
    expect(html).not.toContain("disabled");
  });

  test("after voting: the results, the choice marked, a way to change it", () => {
    const html = renderPoll(poll(), 1);
    expect(html).toContain("67%");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Tap another to change");
  });

  test("closed: final results, nothing to tap", () => {
    const html = renderPoll(poll({ open: false }));
    expect(html).toContain("Closed · 3 answers");
    expect(html).toContain("33%");
    expect(html).toContain("disabled");
  });

  test("offline: options cannot be tapped (the vote would be queued and look lost)", () => {
    expect(renderPoll(poll(), null, false)).toContain("disabled");
  });

  test("a word cloud shows the words and how many are left", () => {
    const html = renderPoll(
      poll({
        def: { id: "w", kind: "words", question: "One word", options: [] },
        words: { clear: 2 },
        counts: [],
        total: 2,
      }),
      "clear",
    );
    expect(html).toContain("clear");
    expect(html).toContain("is-mine");
    expect(html).toContain("2 more");
  });

  test("a rating poll draws its scale", () => {
    const html = renderPoll(
      poll({
        def: { id: "r", kind: "rating", question: "Pace?", options: ["1", "2", "3"], scale: 3 },
        counts: [0, 1, 1],
        total: 2,
      }),
      2,
    );
    expect(html).toContain("Average <b>2.5</b> of 3");
  });
});

const quiz = (over: Partial<QuizState> = {}): QuizState => ({
  def: { id: "q", question: "Which?", options: ["---", "----"], correct: 1, seconds: 20 },
  open: false,
  deadline: null,
  counts: [1, 1],
  revealed: true,
  leaderboard: [{ name: "Asha", score: 180 }],
  ...over,
});
const renderQuiz = (q: QuizState, mine: number | null) =>
  renderToStaticMarkup(
    createElement(AudienceQuiz, { quiz: q, online: true, mine, setMine: () => {} }),
  );

describe("a quiz on the audience page", () => {
  test("open: lettered answers and a clock", () => {
    const html = renderQuiz(
      quiz({ open: true, revealed: false, deadline: Date.now() + 15_000 }),
      null,
    );
    expect(html).toContain('role="timer"');
    expect(html).toContain(">A<");
    expect(html).toContain("Pick one");
  });

  test("answered: locked in until the reveal", () => {
    const html = renderQuiz(
      quiz({ open: true, revealed: false, deadline: Date.now() + 15_000 }),
      0,
    );
    expect(html).toContain("Locked in");
    expect(html).toContain('data-outcome="locked"');
  });

  test("revealed: right, wrong, or the answer for one who never answered", () => {
    expect(renderQuiz(quiz(), 1)).toContain("Correct!");
    const wrong = renderQuiz(quiz(), 0);
    expect(wrong).toContain("Not this time");
    expect(wrong).toContain("is-wrong");
    expect(renderQuiz(quiz(), null)).toContain("The answer was B");
    expect(renderQuiz(quiz(), 1)).toContain("Asha");
  });
});
