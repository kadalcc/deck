import { type ReactNode, useEffect, useRef, useState } from "react";

import { Icon } from "../components/bling.tsx";
import { nickname } from "../live/components.tsx";
import { useLiveOptional } from "../live/context.ts";
import type { PollState, QuizState } from "../live/protocol.ts";
import {
  cleanWord,
  hasVoted,
  letter,
  percents,
  pollOptions,
  quizOutcome,
  ratingAverage,
} from "./logic.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE AUDIENCE'S POLLS AND QUIZZES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The phone's own cards for what the presenter opened. A slide's <Poll> and <Quiz>
 * (live/components.tsx) draw the same room state on the stage; these are drawn for a thumb and
 * say, at every moment, what a tap does: vote, change a vote, wait, see how it went. The messages
 * they send are the slide components' own, byte for byte.
 *
 * The room tells a viewer its own answer once, in the welcome; every later broadcast is the same
 * for everyone and leaves it out. So the page keeps the answer each card last knew (a card moves
 * from "open" to "earlier" and remounts), seeded from the welcome, and forgets it only when the
 * room does (a reset, a quiz opened again).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("deck-audience-card", className)} {...rest}>
      {children}
    </section>
  );
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="deck-audience-empty-state">
      <span className="deck-audience-empty-icon" aria-hidden>
        <Icon name={icon} />
      </span>
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

function Chip({ tone, children }: { tone: "open" | "closed" | "quiet"; children: ReactNode }) {
  return <span className={cx("deck-audience-chip", `is-${tone}`)}>{children}</span>;
}

const KIND_LABEL: Record<string, string> = {
  choice: "Poll",
  multi: "Poll · pick any",
  rating: "Rating",
  words: "Word cloud",
};

/** A poll as the audience answers it: choice, multi, rating or words. */
export function AudiencePoll({
  poll,
  online,
  mine,
  setMine,
}: {
  poll: PollState;
  online: boolean;
  /** Kept by the page, so a card that moves (open → closed) keeps it. */
  mine: PollState["mine"];
  setMine: (m: PollState["mine"]) => void;
}) {
  const live = useLiveOptional();
  const { def, open } = poll;
  // The welcome's answer (a reload) wins; a reset (nobody has answered) clears ours.
  useEffect(() => {
    if (poll.mine !== undefined && poll.mine !== null) setMine(poll.mine);
  }, [poll.mine]);
  useEffect(() => {
    if (poll.total === 0) setMine(null);
  }, [poll.total]);

  const voted = hasVoted(mine);
  const results = voted || !open;
  const options = pollOptions(poll);
  const pct = percents(poll.counts, poll.total);
  const canVote = open && online;

  const send = (
    m: Omit<
      Extract<import("../live/protocol.ts").ClientMessage, { type: "poll:vote" }>,
      "type" | "id"
    >,
  ) => live?.client.send({ type: "poll:vote", id: def.id, ...m });

  const vote = (i: number) => {
    if (!canVote) return;
    if (def.kind === "multi") {
      const cur = Array.isArray(mine) ? mine : [];
      const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
      setMine(next);
      send({ options: next });
    } else if (def.kind === "rating") {
      setMine(i);
      send({ rating: i + 1 });
    } else {
      setMine(i);
      send({ option: i });
    }
  };

  const hint = !open
    ? `Closed · ${poll.total} ${poll.total === 1 ? "answer" : "answers"}`
    : def.kind === "words"
      ? null
      : voted
        ? def.kind === "multi"
          ? "Counted. Tap to add or remove a choice."
          : "Counted. Tap another to change your vote."
        : def.kind === "multi"
          ? "Pick as many as you like."
          : "Tap to vote. Results show once you have.";

  return (
    <Card
      className={cx("deck-audience-poll", open ? "is-open" : "is-closed", voted && "is-voted")}
      data-kind={def.kind}
      data-poll={def.id}
      aria-label={def.question}
    >
      <header className="deck-audience-card-head">
        {open ? <Chip tone="open">Open</Chip> : <Chip tone="closed">Closed</Chip>}
        <span className="deck-audience-card-kind">{KIND_LABEL[def.kind] ?? "Poll"}</span>
        {results && def.kind !== "words" ? (
          <span className="deck-audience-card-count">
            {poll.total} {poll.total === 1 ? "answer" : "answers"}
          </span>
        ) : null}
      </header>
      <h3 className="deck-audience-question">{def.question}</h3>

      {def.kind === "words" ? (
        <WordsBody poll={poll} mine={mine} setMine={setMine} canVote={canVote} />
      ) : def.kind === "rating" ? (
        <>
          <div className="deck-audience-rating" role="group" aria-label={def.question}>
            {options.map((label, i) => (
              <button
                type="button"
                key={i}
                className={cx("deck-audience-rate", mine === i && "is-on")}
                aria-pressed={mine === i}
                disabled={!canVote}
                onClick={() => vote(i)}
                style={
                  results ? ({ "--fill": `${pct[i] ?? 0}%` } as React.CSSProperties) : undefined
                }
              >
                <span className="deck-audience-opt-label">{label}</span>
                {results ? <small>{poll.counts[i] ?? 0}</small> : null}
              </button>
            ))}
          </div>
          {results ? (
            <p className="deck-audience-rating-avg">
              {ratingAverage(poll.counts) === null ? (
                "No ratings yet"
              ) : (
                <>
                  Average <b>{ratingAverage(poll.counts)}</b> of {options.length}
                </>
              )}
            </p>
          ) : (
            <p className="deck-audience-rating-scale" aria-hidden>
              <span>Low</span>
              <span>High</span>
            </p>
          )}
        </>
      ) : (
        <ul className="deck-audience-options">
          {options.map((label, i) => {
            const chosen = Array.isArray(mine) ? mine.includes(i) : mine === i;
            return (
              <li key={i}>
                <button
                  type="button"
                  className={cx("deck-audience-opt", chosen && "is-on", results && "has-result")}
                  aria-pressed={chosen}
                  disabled={!canVote}
                  onClick={() => vote(i)}
                  style={{ "--pct": results ? `${pct[i] ?? 0}%` : "0%" } as React.CSSProperties}
                >
                  <span className="deck-audience-opt-bar" aria-hidden />
                  <span
                    className={cx(
                      "deck-audience-mark",
                      def.kind === "multi" ? "is-box" : "is-radio",
                    )}
                    aria-hidden
                  >
                    {chosen ? <Icon name="check" strokeWidth={3} /> : null}
                  </span>
                  <span className="deck-audience-opt-label">{label}</span>
                  {results ? <span className="deck-audience-opt-pct">{pct[i] ?? 0}%</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {hint ? <p className="deck-audience-hint">{hint}</p> : null}
    </Card>
  );
}

/** The room takes three words from each viewer, once each. */
const WORDS_EACH = 3;

function WordsBody({
  poll,
  mine,
  setMine,
  canVote,
}: {
  poll: PollState;
  mine: PollState["mine"];
  setMine: (m: string) => void;
  canVote: boolean;
}) {
  const live = useLiveOptional();
  const [word, setWord] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const mineWords = typeof mine === "string" && mine ? mine.split("\n") : [];
  const left = WORDS_EACH - mineWords.length;
  const entries = Object.entries(poll.words)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40);
  const max = entries[0]?.[1] ?? 1;
  const submit = () => {
    const w = cleanWord(word);
    if (!w || !canVote) return;
    if (mineWords.includes(w)) return setNote(`You already added “${w}”.`);
    if (left <= 0) return setNote("That's your three.");
    live?.client.send({ type: "poll:vote", id: poll.def.id, word: word.trim() });
    setMine([...mineWords, w].join("\n"));
    setWord("");
    setNote(null);
  };
  return (
    <>
      <div className="deck-audience-cloud" aria-label="Words so far">
        {entries.length ? (
          entries.map(([w, n]) => (
            <span
              key={w}
              className={mineWords.includes(w) ? "is-mine" : undefined}
              style={{ fontSize: `${0.85 + (n / max) * 1.15}em`, opacity: 0.6 + (n / max) * 0.4 }}
            >
              {w}
            </span>
          ))
        ) : (
          <span className="deck-audience-cloud-empty">The first word lands here.</span>
        )}
      </div>
      {canVote && left > 0 ? (
        <form
          className="deck-audience-word"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            className="deck-audience-input"
            value={word}
            onChange={(e) => setWord(e.target.value.slice(0, 24))}
            placeholder="One word"
            aria-label="Your word"
            maxLength={24}
            enterKeyHint="send"
            autoCapitalize="none"
          />
          <button type="submit" className="deck-audience-btn is-primary" disabled={!word.trim()}>
            Add
          </button>
        </form>
      ) : null}
      <p className="deck-audience-hint" aria-live="polite">
        {note ??
          (!poll.open
            ? `Closed · ${poll.total} ${poll.total === 1 ? "word" : "words"}`
            : left > 0
              ? mineWords.length
                ? `Added. ${left} more if you like.`
                : `Up to ${WORDS_EACH} words, one at a time.`
              : "That's your three — watch the cloud grow.")}
      </p>
    </>
  );
}

/** A timed quiz: the clock, the answer, the reveal, and the top of the leaderboard. */
export function AudienceQuiz({
  quiz,
  online,
  mine,
  setMine,
}: {
  quiz: QuizState;
  online: boolean;
  mine: number | null;
  setMine: (m: number | null) => void;
}) {
  const live = useLiveOptional();
  const { def } = quiz;
  const [now, setNow] = useState(Date.now());
  const deadline = useRef(quiz.deadline);
  useEffect(() => {
    if (quiz.mine !== undefined && quiz.mine !== null) setMine(quiz.mine);
  }, [quiz.mine]);
  // Opened again: the room has dropped every answer.
  useEffect(() => {
    if (quiz.deadline && quiz.deadline !== deadline.current && quiz.open && quiz.mine == null)
      setMine(null);
    deadline.current = quiz.deadline;
  }, [quiz.deadline, quiz.open, quiz.mine]);
  useEffect(() => {
    if (!quiz.open) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [quiz.open]);

  const left = quiz.deadline ? Math.max(0, Math.ceil((quiz.deadline - now) / 1000)) : 0;
  const timeUp = quiz.open && !!quiz.deadline && left === 0;
  const outcome = quizOutcome({ ...quiz, open: quiz.open && !timeUp }, mine);
  const total = quiz.counts.reduce((a, b) => a + b, 0);
  const pct = percents(quiz.counts, total);
  const me = nickname();
  const answer = (i: number) => {
    if (outcome !== "answer" || !online) return;
    setMine(i);
    live?.client.send({ type: "quiz:answer", id: def.id, option: i, name: nickname() });
  };
  const right = `${letter(def.correct)} · ${def.options[def.correct] ?? ""}`;

  return (
    <Card
      className="deck-audience-quiz"
      data-outcome={outcome}
      data-quiz={def.id}
      aria-label={def.question}
    >
      <header className="deck-audience-card-head">
        {quiz.open && !timeUp ? (
          <Chip tone="open">Quiz</Chip>
        ) : quiz.revealed ? (
          <Chip tone="quiet">Answer revealed</Chip>
        ) : (
          <Chip tone="closed">Time's up</Chip>
        )}
        {quiz.open && !timeUp ? (
          <span
            className={cx("deck-audience-timer", left <= 5 && "is-urgent")}
            role="timer"
            aria-label={`${left} seconds left`}
          >
            <Icon name="timer" />
            {left}s
          </span>
        ) : null}
      </header>
      {quiz.open && !timeUp ? (
        <div className="deck-audience-clock" aria-hidden>
          <i style={{ width: `${Math.min(100, (left / def.seconds) * 100)}%` }} />
        </div>
      ) : null}
      <h3 className="deck-audience-question">{def.question}</h3>
      <ul className="deck-audience-options is-quiz">
        {def.options.map((label, i) => {
          const chosen = mine === i;
          const isRight = quiz.revealed && i === def.correct;
          const isWrong = quiz.revealed && chosen && i !== def.correct;
          return (
            <li key={i}>
              <button
                type="button"
                className={cx(
                  "deck-audience-opt",
                  chosen && "is-on",
                  isRight && "is-correct",
                  isWrong && "is-wrong",
                  mine !== null && !chosen && !isRight && "is-dim",
                  quiz.revealed && "has-result",
                )}
                aria-pressed={chosen}
                disabled={outcome !== "answer" || !online}
                onClick={() => answer(i)}
                style={{ "--pct": quiz.revealed ? `${pct[i] ?? 0}%` : "0%" } as React.CSSProperties}
              >
                <span className="deck-audience-opt-bar" aria-hidden />
                <span className="deck-audience-letter" aria-hidden>
                  {isRight ? (
                    <Icon name="check" strokeWidth={3} />
                  ) : isWrong ? (
                    <Icon name="x" strokeWidth={3} />
                  ) : (
                    letter(i)
                  )}
                </span>
                <span className="deck-audience-opt-label">{label}</span>
                {quiz.revealed ? (
                  <span className="deck-audience-opt-pct">{quiz.counts[i] ?? 0}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div
        className={cx("deck-audience-verdict", `is-${outcome}`)}
        role="status"
        aria-live="polite"
      >
        {outcome === "locked" || (outcome === "waiting" && mine !== null) ? (
          <Icon name="lock" />
        ) : outcome === "correct" ? (
          <Icon name="party-popper" />
        ) : outcome === "wrong" ? (
          <Icon name="circle-x" />
        ) : null}
        <span>
          {outcome === "answer" ? (
            "Pick one. Faster right answers score more."
          ) : outcome === "locked" ? (
            "Locked in. The answer comes when the clock stops."
          ) : outcome === "waiting" ? (
            mine === null ? (
              "Time's up. The answer is on its way."
            ) : (
              "Locked in. The answer is on its way."
            )
          ) : outcome === "correct" ? (
            <>
              <b>Correct!</b> Points added to the leaderboard.
            </>
          ) : outcome === "wrong" ? (
            <>
              <b>Not this time.</b> The answer was {right}.
            </>
          ) : (
            <>The answer was {right}.</>
          )}
        </span>
      </div>
      {quiz.revealed && quiz.leaderboard.length ? (
        <ol className="deck-audience-board" aria-label="Leaderboard">
          {quiz.leaderboard.slice(0, 5).map((row, i) => (
            <li key={`${row.name}-${i}`} className={me && row.name === me ? "is-me" : undefined}>
              <span className="deck-audience-board-rank">{i + 1}</span>
              <span className="deck-audience-board-name">
                {row.name || "anonymous"}
                {me && row.name === me ? <em>you</em> : null}
              </span>
              <span className="deck-audience-board-score">{row.score}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}
