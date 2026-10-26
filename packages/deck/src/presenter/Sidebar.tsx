import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";

import { Icon } from "../components/bling.tsx";
import { Qr } from "../components/content.tsx";
import { type HostPanel, panelAccent } from "../core/panels.ts";
import { readItem, writeItem } from "../core/storage.ts";
import { createStore, useStore } from "../core/store.ts";
import type { Status } from "../live/client.ts";
import { useJoinUrl } from "../live/components.tsx";
import { useLiveOptional, useRoomStatus } from "../live/context.ts";
import type { RoomState } from "../live/protocol.ts";
import { useDeck } from "../react/context.ts";
import { FeedbackActions } from "./Feedback.tsx";
import { ScheduleLine } from "./Timer.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PRESENTER'S SIDEBAR  —  the room, and whatever a host adds
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Tabs down the right of the presenter view:
 *   Room       the join QR and link, who is watching, hands, the pace they want, reactions
 *   Questions  the audience's questions, most votes first; mark answered, delete
 *   Polls      the deck's polls and quizzes, opened and closed from here
 *   + panels   a host's own (deck.kadal.cc's Copilot), from `deck.panels` (core/panels.ts)
 *
 * It folds to a rail of icons with counts, each with its name small underneath. A host panel is
 * mounted the first time its tab is shown and then kept, hidden, through tab switches and folding,
 * so a chat isn't lost; one with the AI accent (core/panels.ts) wears the AI gradient. Under the
 * tabs, on a host that takes them, Report a bug / Request a feature / Send feedback (Feedback.tsx):
 * in the rail's empty space when folded, along the foot when open.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Tab = "room" | "questions" | "polls" | `panel:${string}`;
const TAB_KEY = "deck.presenter.tab";
const noStore = createStore<RoomState | null>(null);

const STATUS: Record<Status, { label: string; tone: "live" | "wait" | "off" }> = {
  open: { label: "Live", tone: "live" },
  connecting: { label: "Connecting", tone: "wait" },
  idle: { label: "Connecting", tone: "wait" },
  closed: { label: "Offline", tone: "off" },
  offline: { label: "Offline", tone: "off" },
};

interface TabInfo {
  id: Tab;
  title: string;
  /** The rail's label, when the title is too long for it. */
  short?: string;
  icon: string;
  count: number;
  accent?: "ai" | null;
}

/** The AI accent's gradient, for an icon's stroke (`url(#…)`): defined once, in the sidebar. */
const AI_GRADIENT = "deck-ai-gradient";

function AiGradient() {
  return (
    <svg className="deck-ai-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient
          id={AI_GRADIENT}
          x1="2"
          y1="2"
          x2="22"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" style={{ stopColor: "var(--deck-ai-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--deck-ai-to)" }} />
        </linearGradient>
      </defs>
    </svg>
  );
}

function TabIcon({ tab }: { tab: TabInfo }) {
  return <Icon name={tab.icon} color={tab.accent === "ai" ? `url(#${AI_GRADIENT})` : undefined} />;
}

export function PresenterSidebar({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const deck = useDeck();
  const live = useLiveOptional();
  const status = useRoomStatus();
  const state = useStore(live?.client.state ?? noStore, (s) => s as RoomState | null);
  const { panels, requested } = useStore(deck.panels.state);
  const [tab, setTab] = useState<Tab>(() => (readItem(TAB_KEY) as Tab | null) ?? "room");

  // A host asked for its panel (its own shortcut): show it, unfolded.
  useEffect(() => {
    if (!requested) return;
    setTab(`panel:${requested}`);
    setOpen(true);
    deck.panels.state.update((s) => ({ ...s, requested: null }));
  }, [requested, setOpen, deck.panels.state]);
  useEffect(() => writeItem(TAB_KEY, tab), [tab]);

  const questions = [...(state?.questions ?? [])].sort(
    (a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes,
  );
  const polls = pollRows(state);
  const tabs: TabInfo[] = [
    { id: "room", title: "Room", icon: "users", count: state?.presence.hands ?? 0 },
    ...(live
      ? ([
          {
            id: "questions",
            title: "Questions",
            short: "Q&A",
            icon: "message-circle-question",
            count: questions.filter((q) => !q.answered).length,
          },
          {
            id: "polls",
            title: "Polls",
            icon: "chart-bar",
            count: polls.filter((p) => p.open).length,
          },
        ] as TabInfo[])
      : []),
    ...panels.map((p) => ({
      id: `panel:${p.id}` as Tab,
      title: p.title,
      icon: p.icon ?? "panel-right",
      count: 0,
      accent: panelAccent(p),
    })),
  ];
  // A remembered tab whose panel isn't here (yet, or any more) falls back to the room.
  const current: Tab = tabs.some((t) => t.id === tab) ? tab : "room";
  const select = (t: Tab) => {
    setTab(t);
    setOpen(true);
  };
  const s = STATUS[status];

  return (
    <div className={["deck-room-panel", "deck-side", open ? "" : "is-rail"].join(" ")}>
      {open ? (
        <div className="deck-side-head">
          <div
            className={["deck-side-tabs", tabs.length > 3 ? "is-many" : ""].join(" ")}
            role="tablist"
            aria-label="Presenter sidebar"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={current === t.id}
                className={[current === t.id ? "is-on" : "", t.accent ? `is-${t.accent}` : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setTab(t.id)}
                title={t.title}
              >
                <TabIcon tab={t} />
                <span>{t.title}</span>
                {t.count ? <em>{t.count}</em> : null}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="deck-room-toggle"
            onClick={() => setOpen(false)}
            title="Fold the sidebar"
            aria-label="Fold the sidebar"
          >
            <Icon name="panel-right-close" />
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="deck-room-toggle"
            onClick={() => setOpen(true)}
            title="Open the sidebar"
            aria-label="Open the sidebar"
          >
            <Icon name="panel-right-open" />
          </button>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={[
                "deck-room-rail-item",
                current === t.id ? "is-on" : "",
                t.accent ? `is-${t.accent}` : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => select(t.id)}
              title={`${t.title}${t.count ? ` · ${t.count}` : ""}`}
              aria-label={t.title}
            >
              <TabIcon tab={t} />
              <span className="deck-room-rail-label" aria-hidden="true">
                {t.short ?? t.title}
              </span>
              {t.count ? <em>{t.count}</em> : null}
            </button>
          ))}
          <span className="deck-room-rail-space" />
          <FeedbackActions layout="rail" />
          {live ? (
            <span className={["deck-room-dot", `is-${status}`].join(" ")} title={s.label} />
          ) : null}
        </>
      )}

      {open && current === "room" ? (
        live ? (
          <RoomTab state={state} status={status} />
        ) : (
          <div className="deck-side-scroll">
            <Empty
              icon="wifi-off"
              title="No live room"
              hint="This deck isn't connected to a host, so there is no audience to join. Presenting still works on this screen."
            />
          </div>
        )
      ) : null}
      {open && current === "questions" && live ? (
        <QuestionsTab questions={questions} send={(m) => live.client.send(m as never)} />
      ) : null}
      {open && current === "polls" && live ? (
        <PollsTab polls={polls} send={(m) => live.client.send(m as never)} />
      ) : null}
      {panels.map((p) => (
        <HostPanelSlot key={p.id} panel={p} active={open && current === `panel:${p.id}`} />
      ))}
      {open ? <FeedbackActions layout="row" /> : null}
      {tabs.some((t) => t.accent === "ai") ? <AiGradient /> : null}
    </div>
  );
}

/* ── Room ───────────────────────────────────────────────────────────────── */

function RoomTab({ state, status }: { state: RoomState | null; status: Status }) {
  const url = useJoinUrl();
  const short = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  const presence = state?.presence;
  const pace = presence?.pace ?? { slower: 0, faster: 0, total: 0 };
  const reactions = Object.entries(state?.reactions ?? {}).sort((a, b) => b[1] - a[1]);
  const reacted = reactions.reduce((n, [, c]) => n + c, 0);
  const s = STATUS[status];
  return (
    <div className="deck-side-scroll">
      <section className="deck-side-card deck-side-join">
        <header className="deck-side-card-head">
          <h3>Audience</h3>
          <span className={["deck-side-status", `is-${s.tone}`].join(" ")}>
            <i />
            {s.label}
          </span>
        </header>
        <div className="deck-side-qr">
          <Qr value={url} size={360} />
        </div>
        <p className="deck-side-hint">Scan to follow along, react and ask</p>
        <div className="deck-side-link">
          <code title={url}>{breakAtSlashes(short)}</code>
          <button
            type="button"
            className="deck-side-icon-btn"
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => setCopied(true));
            }}
            title={copied ? "Copied" : "Copy the link"}
            aria-label={copied ? "Copied" : "Copy the join link"}
          >
            <Icon name={copied ? "check" : "copy"} />
          </button>
        </div>
      </section>

      <div className="deck-side-stats">
        <Stat icon="eye" label="Watching" value={presence?.viewers ?? 0} />
        <Stat
          icon="hand"
          label="Hands up"
          value={presence?.hands ?? 0}
          alert={(presence?.hands ?? 0) > 0}
        />
        <Stat icon="smile-plus" label="Reactions" value={reacted} />
      </div>

      <section className="deck-side-card">
        <header className="deck-side-card-head">
          <h3>Pace</h3>
          <small>
            {pace.total ? `${pace.total} ${pace.total === 1 ? "vote" : "votes"}` : "No votes yet"}
          </small>
        </header>
        <PaceGauge {...pace} />
        {/* The other half of pacing: the presenter's own schedule, from the timer. */}
        <ScheduleLine />
      </section>

      {reactions.length ? (
        <section className="deck-side-card">
          <header className="deck-side-card-head">
            <h3>Reactions</h3>
          </header>
          <div className="deck-side-chips">
            {reactions.map(([emoji, n]) => (
              <span key={emoji} className="deck-side-chip">
                <span aria-hidden>{emoji}</span>
                <b>{n}</b>
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** A long address may break after any slash, and only there: it wraps instead of running off. */
function breakAtSlashes(text: string): ReactNode {
  const parts = text.split("/");
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 ? (
        <>
          /<wbr />
        </>
      ) : null}
    </Fragment>
  ));
}

function Stat({
  icon,
  label,
  value,
  alert,
}: {
  icon: string;
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className={["deck-side-stat", alert ? "is-alert" : ""].join(" ")}>
      <Icon name={icon} />
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

/** Where the audience's pace votes lean: the marker sits between slower and faster. */
function PaceGauge({ slower, faster, total }: { slower: number; faster: number; total: number }) {
  const bias = total ? (faster - slower) / total : 0;
  const verdict = !total
    ? "The audience can ask for slower or faster from their page."
    : Math.abs(bias) < 0.2
      ? "About right"
      : bias < 0
        ? "They'd like it slower"
        : "They'd like it faster";
  return (
    <div className="deck-side-pace" title={`${slower} slower · ${faster} faster`}>
      <div className="deck-side-pace-row">
        <span>
          Slower <b>{slower}</b>
        </span>
        <div className="deck-side-pace-track">
          <i style={{ left: `${50 + bias * 50}%` }} className={total ? "" : "is-idle"} />
        </div>
        <span>
          <b>{faster}</b> Faster
        </span>
      </div>
      <p className="deck-side-hint">{verdict}</p>
    </div>
  );
}

/* ── Questions ──────────────────────────────────────────────────────────── */

function QuestionsTab({
  questions,
  send,
}: {
  questions: RoomState["questions"];
  send: (m: Record<string, unknown>) => void;
}) {
  if (!questions.length)
    return (
      <div className="deck-side-scroll">
        <Empty
          icon="message-circle-question"
          title="No questions yet"
          hint="People ask from the audience page. The most-voted rise to the top."
        />
      </div>
    );
  return (
    <div className="deck-side-scroll">
      <ul className="deck-room-questions deck-side-list">
        {questions.map((q) => (
          <li key={q.id} className={["deck-side-card", q.answered ? "is-done" : ""].join(" ")}>
            <span className="deck-side-votes" title={`${q.votes} votes`}>
              <Icon name="arrow-big-up" />
              {q.votes}
            </span>
            <p className="deck-question-text">{q.text}</p>
            <span className="deck-side-actions">
              <button
                type="button"
                className="deck-side-icon-btn"
                onClick={() => send({ type: "qa:answered", id: q.id, answered: !q.answered })}
                title={q.answered ? "Reopen" : "Mark answered"}
                aria-label={q.answered ? "Reopen" : "Mark answered"}
              >
                <Icon name={q.answered ? "rotate-ccw" : "check"} />
              </button>
              <button
                type="button"
                className="deck-side-icon-btn is-danger"
                onClick={() => send({ type: "qa:delete", id: q.id })}
                title="Delete"
                aria-label="Delete"
              >
                <Icon name="trash-2" />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Polls ──────────────────────────────────────────────────────────────── */

interface PollRow {
  kind: "poll" | "quiz";
  id: string;
  question: string;
  open: boolean;
  votes: number;
}

function pollRows(state: RoomState | null): PollRow[] {
  return [
    ...Object.values(state?.polls ?? {}).map((p) => ({
      kind: "poll" as const,
      id: p.def.id,
      question: p.def.question,
      open: p.open,
      votes: p.total,
    })),
    ...Object.values(state?.quizzes ?? {}).map((q) => ({
      kind: "quiz" as const,
      id: q.def.id,
      question: q.def.question,
      open: q.open,
      votes: q.counts.reduce((a, b) => a + b, 0),
    })),
  ];
}

function PollsTab({
  polls,
  send,
}: {
  polls: PollRow[];
  send: (m: Record<string, unknown>) => void;
}) {
  if (!polls.length)
    return (
      <div className="deck-side-scroll">
        <Empty
          icon="chart-bar"
          title="No polls yet"
          hint="Polls and quizzes show up here once their slide has been on screen."
        />
      </div>
    );
  return (
    <div className="deck-side-scroll">
      <ul className="deck-room-polls deck-side-list">
        {polls.map((p) => (
          <li
            key={`${p.kind}:${p.id}`}
            className={["deck-side-card", "deck-side-poll", p.open ? "is-open" : ""].join(" ")}
          >
            <div className="deck-side-poll-head">
              <span className="deck-side-kind">{p.kind === "poll" ? "Poll" : "Quiz"}</span>
              <span className="deck-side-muted">
                {p.votes} {p.votes === 1 ? "vote" : "votes"}
              </span>
              <button
                type="button"
                className={["deck-side-btn", p.open ? "" : "is-primary"].join(" ")}
                onClick={() =>
                  send(
                    p.kind === "poll"
                      ? { type: "poll:open", id: p.id, open: !p.open }
                      : { type: "quiz:open", id: p.id, open: !p.open },
                  )
                }
              >
                <Icon name={p.open ? "square" : "play"} />
                {p.open ? "Close" : "Open"}
              </button>
            </div>
            <p className="deck-question-text">{p.question}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── shared ─────────────────────────────────────────────────────────────── */

function Empty({ icon, title, hint }: { icon: string; title: string; hint: string }) {
  return (
    <div className="deck-side-empty">
      <Icon name={icon} />
      <strong>{title}</strong>
      <p>{hint}</p>
    </div>
  );
}

/**
 * A host's panel: mounted into its element the first time its tab is shown, then kept (hidden when
 * another tab is on, or the sidebar is folded), and torn down only when the panel goes away.
 */
function HostPanelSlot({ panel, active }: { panel: HostPanel; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(active);
  useEffect(() => {
    if (active) setStarted(true);
  }, [active]);
  useEffect(() => {
    const el = ref.current;
    if (!started || !el) return;
    let cleanup: void | (() => void);
    try {
      cleanup = panel.mount(el);
    } catch (err) {
      console.error(`[deck] the "${panel.id}" panel failed to mount`, err);
    }
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, [started, panel]);
  return (
    <div
      ref={ref}
      className="deck-side-host"
      data-panel={panel.id}
      hidden={!active}
      role="tabpanel"
      aria-label={panel.title}
    />
  );
}
