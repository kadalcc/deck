import { type ReactNode, useEffect, useMemo, useState } from "react";

import { useStore } from "../core/store.ts";
import { Qr } from "../components/content.tsx";
import { useDeck, useSlideOptional } from "../react/context.ts";
import { useLiveOptional, useRole, useRoomStatus } from "./context.ts";
import { type PollKind, type PollState, type QuizState, REACTIONS } from "./protocol.ts";

/**
 * The interactive pieces a slide can carry. Each works in three states: live (the room is up),
 * offline (a local, single-screen fallback so rehearsals and exports still make sense), and
 * presenter (extra controls to open, close, reveal).
 */

function useRoomSlice<S>(selector: (s: import("./protocol.ts").RoomState) => S, fallback: S): S {
  const live = useLiveOptional();
  const value = useStore(live?.client.state ?? fallbackStore, (s) =>
    live ? selector(s as never) : fallback,
  );
  return live ? value : fallback;
}
import { createStore } from "../core/store.ts";
const fallbackStore = createStore<unknown>(null);

/** The QR code and short URL for the audience page. */
export function QrJoin({
  size = 260,
  caption = "Scan to follow along, react and ask",
  className,
}: {
  size?: number;
  caption?: string;
  className?: string;
}) {
  const live = useLiveOptional();
  const deck = useDeck();
  const url =
    live?.joinUrl ??
    `${typeof window === "undefined" ? "" : window.location.origin}${deck.base}join`;
  return (
    <div className={["deck-qr-join", className].filter(Boolean).join(" ")}>
      <Qr value={url} size={size} />
      <div className="deck-qr-join-text">
        <strong>{url.replace(/^https?:\/\//, "")}</strong>
        <span>{caption}</span>
      </div>
    </div>
  );
}

/** How many are watching. */
export function Presence({ className }: { className?: string }) {
  const presence = useRoomSlice((s) => s.presence, null);
  const status = useRoomStatus();
  if (!presence) return null;
  return (
    <span
      className={["deck-presence", status === "open" ? "is-live" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <i />
      {presence.viewers} watching
      {presence.hands ? ` · ${presence.hands} ✋` : ""}
    </span>
  );
}

/** The reaction bar (for slides that invite it; the audience page has its own). */
export function Reactions({ className }: { className?: string }) {
  const live = useLiveOptional();
  const totals = useRoomSlice((s) => s.reactions, {} as Record<string, number>);
  return (
    <div className={["deck-reaction-bar", className].filter(Boolean).join(" ")}>
      {REACTIONS.map((e) => (
        <button
          type="button"
          key={e}
          onClick={() => live?.client.send({ type: "react", emoji: e })}
        >
          <span>{e}</span>
          {totals[e] ? <small>{totals[e]}</small> : null}
        </button>
      ))}
    </div>
  );
}

export interface PollProps {
  id: string;
  question: string;
  options?: string[];
  kind?: PollKind;
  scale?: number;
  /** Show results as they come, or only once closed. */
  liveResults?: boolean;
  className?: string;
}

/** A poll: defined by the slide, opened by the presenter, answered from the audience page or here. */
export function Poll({
  id,
  question,
  options = [],
  kind = "choice",
  scale = 5,
  liveResults = true,
  className,
}: PollProps) {
  const live = useLiveOptional();
  const role = useRole();
  const slide = useSlideOptional();
  const state = useRoomSlice((s) => s.polls[id] ?? null, null as PollState | null);
  const [localVote, setLocalVote] = useState<number | number[] | string | null>(null);
  const [word, setWord] = useState("");
  const def = useMemo(
    () => ({
      id,
      kind,
      question,
      options: kind === "rating" ? Array.from({ length: scale }, (_, i) => String(i + 1)) : options,
      scale,
    }),
    [id, kind, question, options, scale],
  );

  // The slide defines the poll in the room when it is shown to the presenter.
  useEffect(() => {
    if (!live || role !== "presenter" || !slide?.active) return;
    live.client.send({ type: "poll:define", poll: def });
  }, [live, role, slide?.active, def]);

  const counts = state?.counts ?? def.options.map(() => 0);
  const total = state?.total ?? 0;
  const open = state?.open ?? false;
  const mine = state?.mine ?? localVote;
  const showResults = liveResults || !open || role === "presenter";

  const vote = (i: number) => {
    if (kind === "multi") {
      const cur = Array.isArray(mine) ? mine : [];
      const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
      setLocalVote(next);
      live?.client.send({ type: "poll:vote", id, options: next });
      return;
    }
    setLocalVote(i);
    live?.client.send(
      kind === "rating"
        ? { type: "poll:vote", id, rating: i + 1 }
        : { type: "poll:vote", id, option: i },
    );
  };

  return (
    <div
      className={["deck-poll", `kind-${kind}`, open ? "is-open" : "is-closed", className]
        .filter(Boolean)
        .join(" ")}
      data-poll={id}
    >
      <div className="deck-poll-head">
        <strong>{question}</strong>
        <span className="deck-poll-meta">
          {open ? "open" : "closed"} · {total} {total === 1 ? "answer" : "answers"}
        </span>
        {role === "presenter" ? (
          <span className="deck-poll-controls">
            <button
              type="button"
              onClick={() => live?.client.send({ type: "poll:open", id, open: !open })}
            >
              {open ? "Close" : "Open"}
            </button>
            <button type="button" onClick={() => live?.client.send({ type: "poll:reset", id })}>
              Reset
            </button>
          </span>
        ) : null}
      </div>
      {kind === "words" ? (
        <>
          <WordCloudView words={state?.words ?? {}} />
          <form
            className="deck-poll-word"
            onSubmit={(e) => {
              e.preventDefault();
              if (!word.trim()) return;
              live?.client.send({ type: "poll:vote", id, word: word.trim() });
              setLocalVote(word.trim());
              setWord("");
            }}
          >
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="One word"
              maxLength={24}
              disabled={!open && !!live}
            />
            <button type="submit" disabled={!open && !!live}>
              Add
            </button>
          </form>
        </>
      ) : (
        <ul className="deck-poll-options">
          {def.options.map((opt, i) => {
            const n = counts[i] ?? 0;
            const pct = total ? Math.round((n / total) * 100) : 0;
            const chosen = Array.isArray(mine) ? mine.includes(i) : mine === i;
            return (
              <li key={i} className={chosen ? "is-mine" : ""}>
                <button type="button" onClick={() => vote(i)} disabled={!open && !!live}>
                  <span className="deck-poll-bar" style={{ width: showResults ? `${pct}%` : 0 }} />
                  <span className="deck-poll-label">{opt}</span>
                  {showResults ? (
                    <span className="deck-poll-count">
                      {pct}% · {n}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function WordCloudView({ words }: { words: Record<string, number> }) {
  const entries = Object.entries(words)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40);
  const max = entries[0]?.[1] ?? 1;
  return (
    <div className="deck-wordcloud">
      {entries.length ? (
        entries.map(([w, n]) => (
          <span
            key={w}
            style={{ fontSize: `${0.6 + (n / max) * 1.6}em`, opacity: 0.55 + (n / max) * 0.45 }}
          >
            {w}
          </span>
        ))
      ) : (
        <span className="deck-muted">Waiting for words…</span>
      )}
    </div>
  );
}

export function WordCloud({
  id,
  question,
  className,
}: {
  id: string;
  question: string;
  className?: string;
}) {
  return <Poll id={id} question={question} kind="words" className={className} />;
}

export interface QuizProps {
  id: string;
  question: string;
  options: string[];
  correct: number;
  seconds?: number;
  className?: string;
}

/** A timed quiz question with points for speed and a leaderboard. */
export function Quiz({ id, question, options, correct, seconds = 20, className }: QuizProps) {
  const live = useLiveOptional();
  const role = useRole();
  const slide = useSlideOptional();
  const state = useRoomSlice((s) => s.quizzes[id] ?? null, null as QuizState | null);
  const [now, setNow] = useState(Date.now());
  const [local, setLocal] = useState<number | null>(null);
  const def = useMemo(
    () => ({ id, question, options, correct, seconds }),
    [id, question, options, correct, seconds],
  );

  useEffect(() => {
    if (!live || role !== "presenter" || !slide?.active) return;
    live.client.send({ type: "quiz:define", quiz: def });
  }, [live, role, slide?.active, def]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const open = state?.open ?? false;
  const left = state?.deadline ? Math.max(0, Math.ceil((state.deadline - now) / 1000)) : seconds;
  const revealed = state?.revealed ?? false;
  const mine = state?.mine ?? local;
  const counts = state?.counts ?? options.map(() => 0);
  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div
      className={["deck-quiz", open ? "is-open" : "", revealed ? "is-revealed" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="deck-quiz-head">
        <strong>{question}</strong>
        <span className={["deck-quiz-timer", open && left <= 5 ? "is-urgent" : ""].join(" ")}>
          {open ? `${left}s` : revealed ? "revealed" : "ready"}
        </span>
        {role === "presenter" ? (
          <span className="deck-poll-controls">
            <button
              type="button"
              onClick={() => live?.client.send({ type: "quiz:open", id, open: !open })}
            >
              {open ? "Close" : "Start"}
            </button>
            <button
              type="button"
              onClick={() => live?.client.send({ type: "quiz:reveal", id })}
              disabled={open}
            >
              Reveal
            </button>
          </span>
        ) : null}
      </div>
      <ul className="deck-poll-options">
        {options.map((opt, i) => {
          const n = counts[i] ?? 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          return (
            <li
              key={i}
              className={[
                mine === i ? "is-mine" : "",
                revealed && i === correct ? "is-correct" : "",
                revealed && mine === i && i !== correct ? "is-wrong" : "",
              ].join(" ")}
            >
              <button
                type="button"
                disabled={(!open && !!live) || mine !== null}
                onClick={() => {
                  setLocal(i);
                  live?.client.send({ type: "quiz:answer", id, option: i, name: nickname() });
                }}
              >
                <span className="deck-poll-bar" style={{ width: revealed ? `${pct}%` : 0 }} />
                <span className="deck-poll-label">{opt}</span>
                {revealed ? <span className="deck-poll-count">{n}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function nickname(): string {
  try {
    return localStorage.getItem("deck.name") ?? "";
  } catch {
    return "";
  }
}

/** The leaderboard across every quiz in the room. */
export function Leaderboard({ top = 8, className }: { top?: number; className?: string }) {
  const quizzes = useRoomSlice((s) => s.quizzes, {} as Record<string, QuizState>);
  const scores = new Map<string, number>();
  for (const q of Object.values(quizzes))
    for (const e of q.leaderboard) scores.set(e.name, (scores.get(e.name) ?? 0) + e.score);
  const rows = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  return (
    <ol className={["deck-leaderboard", className].filter(Boolean).join(" ")}>
      {rows.length ? (
        rows.map(([name, score], i) => (
          <li key={name}>
            <span className="deck-leaderboard-rank">{i + 1}</span>
            <span className="deck-leaderboard-name">{name || "anonymous"}</span>
            <span className="deck-leaderboard-score">{score}</span>
          </li>
        ))
      ) : (
        <li className="deck-muted">No scores yet.</li>
      )}
    </ol>
  );
}

/** Questions from the audience, on a slide: most voted first, answered ones dimmed. */
export function Questions({
  limit = 6,
  className,
  children,
}: {
  limit?: number;
  className?: string;
  children?: ReactNode;
}) {
  const live = useLiveOptional();
  const role = useRole();
  const questions = useRoomSlice((s) => s.questions, [] as import("./protocol.ts").Question[]);
  const sorted = [...questions]
    .sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes || a.at - b.at)
    .slice(0, limit);
  return (
    <div className={["deck-questions", className].filter(Boolean).join(" ")}>
      {children}
      {sorted.length ? (
        <ul>
          {sorted.map((q) => (
            <li key={q.id} className={q.answered ? "is-answered" : ""}>
              <span className="deck-question-votes">▲ {q.votes}</span>
              <span className="deck-question-text">{q.text}</span>
              {role === "presenter" ? (
                <button
                  type="button"
                  onClick={() =>
                    live?.client.send({ type: "qa:answered", id: q.id, answered: !q.answered })
                  }
                >
                  {q.answered ? "Reopen" : "Answered"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="deck-muted">No questions yet — the audience page has an ask box.</p>
      )}
    </div>
  );
}

/** A gauge of the audience's pace feedback: are they asking for slower or faster? */
export function Pace({ className }: { className?: string }) {
  const pace = useRoomSlice((s) => s.presence.pace, { slower: 0, faster: 0, total: 0 });
  const bias = pace.total ? (pace.faster - pace.slower) / pace.total : 0;
  return (
    <div
      className={["deck-pace", className].filter(Boolean).join(" ")}
      title={`${pace.slower} slower · ${pace.faster} faster`}
    >
      <span>slower</span>
      <div className="deck-pace-track">
        <i style={{ left: `${50 + bias * 50}%` }} />
      </div>
      <span>faster</span>
    </div>
  );
}
