import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import * as N from "../core/navigation.ts";
import { key as navKey } from "../core/navigation.ts";
import { readItem, writeItem } from "../core/storage.ts";
import { AUDIENCE_TABS, type AudienceTab, audienceMemory } from "./memory.ts";
import { createSwipeTracker } from "../core/touch.ts";
import { createStore, useStore } from "../core/store.ts";
import { copyText, shareLink } from "../live/analytics.tsx";
import { nickname } from "../live/components.tsx";
import { useLiveOptional, useRoomStatus } from "../live/context.ts";
import { EMPTY_ROOM, type PollState, REACTIONS, type RoomState } from "../live/protocol.ts";
import { Icon } from "../components/bling.tsx";
import { TermReadout } from "../components/Term.tsx";
import { DrawingLayer } from "../draw/DrawingLayer.tsx";
import { PointerLayer, slideLabel } from "../live/LiveProvider.tsx";
import { BackgroundLayer } from "../react/Backgrounds.tsx";
import { ConfettiLayer } from "../react/ConfettiLayer.tsx";
import { flatIndex, roomIdOf, totalSlides } from "../core/model.ts";
import { useDeck } from "../react/context.ts";
import { useActions, useNav } from "../react/hooks.ts";
import { closeTerm } from "../react/terms.ts";
import { ThemeMenu } from "../react/ThemeMenu.tsx";
import { loadSlide, SlideFrame } from "../react/SlideFrame.tsx";
import {
  askRefusal,
  claimAsked,
  cleanQuestion,
  createAskTracker,
  createLimiter,
  QUESTION_LIMIT,
  REACTION_LIMIT,
  type RoomPhase,
  roomPhase,
  sortQuestions,
} from "./logic.ts";
import { AudiencePoll, AudienceQuiz, Card, Empty } from "./widgets.tsx";

const noRoom = createStore<RoomState>(EMPTY_ROOM);
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const TAB: Record<AudienceTab, { label: string; icon: string }> = {
  follow: { label: "Pace", icon: "gauge" },
  ask: { label: "Ask", icon: "message-circle-question" },
  polls: { label: "Polls", icon: "chart-no-axes-column" },
  notes: { label: "Notes", icon: "notebook-text" },
  mine: { label: "Mine", icon: "bookmark" },
};

const PHASE: Record<RoomPhase, { label: string; banner: string | null }> = {
  solo: { label: "On your own", banner: null },
  connecting: { label: "Joining…", banner: null },
  reconnecting: {
    label: "Reconnecting",
    banner: "Connection lost. Reconnecting — anything you send now goes out when it's back.",
  },
  offline: {
    label: "Offline",
    banner: "You're offline. The slides you have still work; we'll rejoin the room on our own.",
  },
  waiting: {
    label: "Waiting",
    banner: "The presenter hasn't started yet. Look around — you'll follow them once they do.",
  },
  live: { label: "Live", banner: null },
  left: {
    label: "Ended",
    banner: "The presenter has left. The deck stays here to browse at your own pace.",
  },
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE AUDIENCE PAGE  —  /<slug>/join
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What a phone shows after scanning the code: the slide the presenter is on (the real slide,
 * scaled), the reactions, an ask box with upvotes, whatever poll or quiz is open, pace buttons,
 * a raised hand, the presenter's notes when shared, and bookmarks kept on the phone. Nothing
 * requires an account; a nickname is optional and only used for the quiz leaderboard.
 *
 * The page's own controls wear the product's look (themes/audience.css: Kadal Deck's sea palette,
 * light or dark with the viewer's scheme); the slide inside wears the deck's. Mobile first: the
 * tabs sit at the bottom under the thumb, every target is 44px, and on a tablet the panel moves
 * beside the slide.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function AudiencePage() {
  const deck = useDeck();
  const live = useLiveOptional();
  const status = useRoomStatus();
  const room = useStore(live?.client.state ?? noRoom);
  const [name, setName] = useState(nickname());
  const memory = useMemo(() => audienceMemory(deck.config.slug), [deck.config.slug]);
  const [tab, setTab] = useState<AudienceTab>(() => memory.read().tab);
  const [question, setQuestion] = useState(() => memory.read().draft);
  const [asked, setAsked] = useState<string[]>(() => memory.read().asked);
  const [pace, setPace] = useState<-1 | 0 | 1>(0);
  const [hand, setHand] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try {
      return JSON.parse(readItem(`deck.bookmarks.${deck.config.slug}`) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const [voted, setVoted] = useState<Set<string>>(new Set());
  // This viewer's answer to each poll ("p:id") and quiz ("q:id"), kept here so a card keeps it
  // when it moves from the open list to the earlier one.
  const [answers, setAnswers] = useState<Record<string, PollState["mine"]>>({});
  const answer = (key: string) => ({
    mine: answers[key] ?? null,
    setMine: (m: PollState["mine"]) => setAnswers((a) => (a[key] === m ? a : { ...a, [key]: m })),
  });
  const quizAnswer = (id: string) => {
    const { mine, setMine } = answer(`q:${id}`);
    return {
      mine: typeof mine === "number" ? mine : null,
      setMine: (m: number | null) => setMine(m),
    };
  };
  const [flash, setFlash] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [welcome, setWelcome] = useState(() => readItem(`deck.joined.${deck.config.slug}`) !== "1");
  const collapse = useCallback(() => setExpanded(false), []);
  const pending = useRef<string[]>([]);
  // Each question sent waits to hear whether the room took it (audience/logic.ts).
  const asks = useMemo(
    () =>
      createAskTracker({
        onSettled: (r) => {
          if (r.ok) return toast.show("Question sent. Others can upvote it now.");
          // Not taken: it will never come back to be claimed, and the words go back in the box.
          const i = pending.current.indexOf(r.text);
          if (i >= 0) pending.current.splice(i, 1);
          setQuestion((q) => (q.trim() ? q : r.text));
          toast.show(r.message);
        },
      }),
    [toast.show],
  );
  useEffect(() => () => asks.dispose(), [asks]);

  useEffect(() => {
    writeItem("deck.name", name);
  }, [name]);
  useEffect(() => {
    writeItem(`deck.bookmarks.${deck.config.slug}`, JSON.stringify(bookmarks));
  }, [bookmarks, deck.config.slug]);
  useEffect(() => memory.write(tab, question, asked), [memory, tab, question, asked]);
  useEffect(() => {
    if (!live) return;
    return live.client.on((m) => {
      if (m.type === "qa:ack") asks.ack(m.ref, m);
      if (m.type === "react") {
        const id = Date.now() + Math.random();
        setFlash((f) => [...f.slice(-14), { id, emoji: m.emoji, x: Math.random() }]);
        setTimeout(() => setFlash((f) => f.filter((x) => x.id !== id)), 1800);
      }
    });
  }, [live, asks]);

  // How the room looks from here, and how it has looked: a room that was live and lost its
  // presenter has ended, one that never had one is still waiting.
  const everOpen = useRef(false);
  const everPresented = useRef(false);
  if (status === "open") everOpen.current = true;
  if (status === "open" && room.presence.presenter) everPresented.current = true;
  const phase = roomPhase({
    hasRoom: !!live,
    status,
    presenter: room.presence.presenter,
    everOpen: everOpen.current,
    everPresented: everPresented.current,
  });
  const online = status === "open";

  /*
   * This page is the viewer's OWN copy of the deck, not a mirror of the presenter's. `nav` is in
   * step with the room while they are following, and stays exactly where they left it the moment
   * they move themselves — the same rule the deck page follows (see `withTransition` in Deck.tsx).
   * Where the presenter is remains known either way: it is what Follow jumps back to.
   */
  const actions = useActions();
  const pos = useNav((s) => ({
    h: s.h,
    v: s.v,
    click: s.click,
    follow: s.follow,
    presenter: s.presenter,
  }));
  const presenting = room.presence.presenter;
  const browse = useBrowse(() => setExpanded(true));
  const here = deck.nav.get();
  const canPrev = N.prev(here, deck.columns, deck.config) !== here;
  const canNext = N.next(here, deck.columns, deck.config) !== here;
  const meta = deck.columns[pos.h]?.slides[pos.v] ?? null;
  const options = meta ? deck.options.get(navKey(pos.h, pos.v))! : null;
  const slideKey = navKey(pos.h, pos.v);
  const slideNo = flatIndex(deck.columns, pos.h, pos.v) + 1;
  const slideCount = totalSlides(deck.columns);
  // A definition this viewer opened belongs to the step it was opened on. (One relayed from the
  // presenter is the room's to take down — closing it here would race its arrival.)
  useEffect(() => closeTerm(deck, "local"), [deck, pos.h, pos.v, pos.click]);

  const openPolls = Object.values(room.polls).filter((p) => p.open);
  // A poll the presenter closed keeps its card (with the final result) once anyone answered it.
  const closedPolls = Object.values(room.polls).filter((p) => !p.open && p.total > 0);
  const quizzes = Object.values(room.quizzes).filter(
    (q) => q.open || q.revealed || q.counts.some((n) => n > 0),
  );
  const openQuizzes = quizzes.filter((q) => q.open);
  const questions = sortQuestions(room.questions);
  const askedSet = useMemo(() => new Set(asked), [asked]);
  const unanswered = questions.filter((q) => !q.answered).length;

  // The welcome tells a viewer which questions they had upvoted; later broadcasts do not.
  useEffect(() => {
    const already = room.questions.filter((q) => q.voted).map((q) => q.id);
    if (already.length)
      setVoted((v) => (already.every((id) => v.has(id)) ? v : new Set([...v, ...already])));
  }, [room.questions]);
  // Claim the questions this viewer just sent, by their text, as they come back from the room.
  useEffect(() => {
    if (!pending.current.length) return;
    const mine = claimAsked(askedSet, room.questions, pending.current);
    if (!mine.length) return;
    setAsked((a) => [...a, ...mine]);
    for (const q of room.questions) if (mine.includes(q.id)) asks.arrived(q.text);
  }, [room.questions, askedSet, asks]);

  // A poll or quiz opening while the viewer is elsewhere: say so, with the way there.
  const seenOpen = useRef<Set<string> | null>(null);
  const openIds = [
    ...openPolls.map((p) => `p:${p.def.id}`),
    ...openQuizzes.map((q) => `q:${q.def.id}`),
  ];
  const openKey = openIds.join("|");
  useEffect(() => {
    const ids = openKey ? openKey.split("|") : [];
    const before = seenOpen.current;
    seenOpen.current = new Set(ids);
    if (!before) return;
    const fresh = ids.find((id) => !before.has(id));
    if (fresh && tab !== "polls")
      toast.show(fresh.startsWith("q:") ? "A quiz just started" : "A poll just opened", {
        label: "Vote",
        run: () => setTab("polls"),
        tab: "polls",
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change in what is open
  }, [openKey]);
  // "A poll just opened · Vote" is done with once the viewer is on Polls, however they got there:
  // left up, it sat over the poll's last option on a phone.
  const { current: shown, hide: hideToast } = toast;
  useEffect(() => {
    if (shown?.action?.tab === tab) hideToast();
  }, [tab, shown, hideToast]);

  const limiter = useMemo(() => createLimiter(REACTION_LIMIT.n, REACTION_LIMIT.per), []);
  const lastLimited = useRef(0);
  /** True when the reaction went out (the button animates either way, differently). */
  const react = (emoji: string): boolean => {
    if (!limiter.take()) {
      if (Date.now() - lastLimited.current > 3000)
        toast.show("Easy — a few reactions a second is the most the room takes.");
      lastLimited.current = Date.now();
      return false;
    }
    live?.client.send({ type: "react", emoji });
    if (navigator.vibrate) navigator.vibrate(10);
    return true;
  };
  const askLimiter = useMemo(() => createLimiter(QUESTION_LIMIT.n, QUESTION_LIMIT.per), []);
  const ask = () => {
    const text = cleanQuestion(question);
    if (text.length < 2 || !live) return;
    // The room would drop it: say so now, and keep the words in the box.
    if (!askLimiter.take()) return toast.show(askRefusal({ reason: "rate" }));
    const ref = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    live.client.send({ type: "qa:ask", text, slide: slideKey, ref });
    pending.current.push(text);
    setQuestion("");
    asks.sent(ref, text, online);
    if (!online) toast.show("You're offline. Your question goes out when the room is back.");
  };
  const vote = (id: string) => {
    if (voted.has(id) || !live) return;
    live.client.send({ type: "qa:vote", id });
    setVoted((v) => new Set(v).add(id));
  };
  const setPaceValue = (v: -1 | 0 | 1) => {
    const next = pace === v ? 0 : v;
    setPace(next);
    live?.client.send({ type: "pace", value: next });
  };
  const toggleHand = () => {
    setHand((h) => {
      live?.client.send({ type: "hand", up: !h });
      return !h;
    });
  };
  const bookmarked = bookmarks.includes(slideKey);
  const bookmark = () => {
    setBookmarks((b) =>
      b.includes(slideKey) ? b.filter((k) => k !== slideKey) : [...b, slideKey],
    );
    toast.show(bookmarked ? "Bookmark removed" : "Bookmarked — find it under Mine");
  };
  const share = async () => {
    const url = await shareLink(deck.config.live.api, roomIdOf(deck.config), deck.base, {
      h: pos.h,
      v: pos.v,
    });
    toast.show((await copyText(url)) ? "Link to this slide copied" : url);
  };
  const dismissWelcome = () => {
    writeItem(`deck.joined.${deck.config.slug}`, "1");
    setWelcome(false);
  };
  const slideOf = (k: string) => {
    const [h, v] = k.split(",").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(v)) return null;
    return {
      h: h!,
      v: v!,
      no: flatIndex(deck.columns, h!, v!) + 1,
      title: deck.columns[h!]?.slides[v!]?.title ?? "",
    };
  };

  const tabsRef = useRef<HTMLDivElement>(null);
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = AUDIENCE_TABS.indexOf(tab);
    const to =
      e.key === "ArrowRight"
        ? i + 1
        : e.key === "ArrowLeft"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? AUDIENCE_TABS.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    const next = AUDIENCE_TABS[(to + AUDIENCE_TABS.length) % AUDIENCE_TABS.length]!;
    setTab(next);
    tabsRef.current?.querySelector<HTMLButtonElement>(`#deck-audience-tab-${next}`)?.focus();
  };
  const badge = (t: AudienceTab) =>
    t === "ask" ? unanswered : t === "polls" ? openPolls.length + openQuizzes.length : 0;

  const banner = PHASE[phase].banner;

  return (
    <div className="deck-audience" data-phase={phase}>
      <header className="deck-audience-head">
        <div className="deck-audience-id">
          <strong className="deck-audience-title" title={deck.config.title}>
            {deck.config.title}
          </strong>
          <div className="deck-audience-sub">
            <span className={cx("deck-audience-status", `is-${phase}`)}>
              <i aria-hidden />
              {PHASE[phase].label}
            </span>
            {live ? (
              <span className="deck-audience-count">
                <Icon name="users" />
                {room.presence.viewers} here
              </span>
            ) : null}
          </div>
        </div>
        <ThemeMenu compact />
      </header>

      {banner ? (
        <div className={cx("deck-audience-banner", `is-${phase}`)} role="status">
          <Icon
            name={
              phase === "waiting"
                ? "hourglass"
                : phase === "left"
                  ? "flag"
                  : phase === "offline"
                    ? "wifi-off"
                    : "refresh-cw"
            }
            className={phase === "reconnecting" ? "is-spinning" : undefined}
          />
          <span>{banner}</span>
        </div>
      ) : null}

      <main className="deck-audience-main">
        <section className="deck-audience-stage" aria-label="The slide">
          {meta && options ? (
            <div
              className="deck-audience-tap"
              // A card inside a phone-sized slide cannot be read; the readout below says it instead.
              data-term-cards="off"
              {...browse}
            >
              <AudienceSlide
                meta={meta}
                options={options}
                h={pos.h}
                v={pos.v}
                click={pos.click}
                bg={options.background}
              />
              <button
                type="button"
                className="deck-audience-step is-prev"
                onClick={() => actions.prev()}
                disabled={!canPrev}
                aria-label="Back"
              >
                <Icon name="chevron-left" />
              </button>
              <button
                type="button"
                className="deck-audience-step is-next"
                onClick={() => actions.next()}
                disabled={!canNext}
                aria-label="Forward"
              >
                <Icon name="chevron-right" />
              </button>
              <button
                type="button"
                className="deck-audience-expand"
                onClick={() => setExpanded(true)}
                aria-label="Expand the slide to full screen"
              >
                <Icon name="maximize-2" />
              </button>
              <Flash items={flash} />
            </div>
          ) : (
            <div className="deck-audience-placeholder">
              <Icon name="presentation" />
              <span>The deck will appear here when it starts.</span>
            </div>
          )}

          <div className="deck-audience-slide-bar">
            <span className="deck-audience-where">
              {/* Counted as the deck counts them (29 / 115), stacked slides included: `h` is a column. */}
              <span className="deck-audience-where-no">
                Slide {slideNo} <span>of {slideCount}</span>
              </span>
              {meta?.title ? <span className="deck-audience-where-title">{meta.title}</span> : null}
            </span>
            <button
              type="button"
              className={cx("deck-audience-icon-btn", bookmarked && "is-on")}
              onClick={bookmark}
              aria-pressed={bookmarked}
              aria-label="Bookmark this slide"
            >
              <Icon name={bookmarked ? "bookmark-check" : "bookmark"} />
            </button>
            <button
              type="button"
              className="deck-audience-icon-btn"
              onClick={() => void share()}
              aria-label="Copy a link to this slide"
            >
              <Icon name="link" />
            </button>
            <a
              className="deck-audience-icon-btn"
              href={`${deck.base}?at#/${pos.h}${pos.v ? `/${pos.v}` : ""}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Open the deck at this slide in a new tab"
            >
              <Icon name="external-link" />
            </a>
          </div>

          {presenting && !pos.follow ? (
            <button
              type="button"
              className="deck-audience-follow"
              onClick={() => actions.setFollow(true)}
            >
              <Icon name="radio" />
              <span>
                Follow the presenter
                {pos.presenter ? (
                  <small>They're on {slideLabel(deck, pos.presenter.h, pos.presenter.v)}</small>
                ) : null}
              </span>
              <Icon name="arrow-right" />
            </button>
          ) : null}
          <TermReadout />
        </section>

        <section className="deck-audience-react" aria-label="React">
          {REACTIONS.map((e) => (
            <ReactionButton key={e} emoji={e} onReact={react} disabled={!live} />
          ))}
        </section>

        <div
          ref={tabsRef}
          className="deck-audience-tabs"
          role="tablist"
          aria-label="Take part"
          onKeyDown={onTabKey}
        >
          {AUDIENCE_TABS.map((t) => (
            <button
              key={t}
              id={`deck-audience-tab-${t}`}
              type="button"
              role="tab"
              aria-selected={tab === t}
              aria-controls="deck-audience-panel"
              tabIndex={tab === t ? 0 : -1}
              className={tab === t ? "is-on" : ""}
              onClick={() => setTab(t)}
              aria-label={
                badge(t)
                  ? `${TAB[t].label}, ${badge(t)} ${t === "ask" ? "open" : "live"}`
                  : undefined
              }
            >
              <span className="deck-audience-tab-icon">
                <Icon name={TAB[t].icon} />
                {badge(t) ? <em aria-hidden>{badge(t)}</em> : null}
              </span>
              <span>{TAB[t].label}</span>
            </button>
          ))}
        </div>

        <section
          id="deck-audience-panel"
          className="deck-audience-panel"
          role="tabpanel"
          aria-labelledby={`deck-audience-tab-${tab}`}
        >
          {welcome && live ? (
            <Card className="deck-audience-welcome" aria-label="Welcome">
              <div className="deck-audience-welcome-head">
                <span className="deck-audience-welcome-mark" aria-hidden>
                  <Icon name="hand-heart" />
                </span>
                <div>
                  <strong>You're in.</strong>
                  <p>React, ask and vote from here. No account, nothing to install.</p>
                </div>
              </div>
              <form
                className="deck-audience-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  dismissWelcome();
                }}
              >
                <input
                  className="deck-audience-input"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 24))}
                  placeholder="Your name (optional)"
                  aria-label="Your name for the quiz leaderboard (optional)"
                  autoComplete="nickname"
                  enterKeyHint="done"
                />
                <button type="submit" className="deck-audience-btn is-primary">
                  {name.trim() ? "Save" : "Skip"}
                </button>
              </form>
              <p className="deck-audience-hint">Only the quiz leaderboard shows your name.</p>
            </Card>
          ) : null}

          {tab === "follow" ? (
            <>
              <Card>
                <h3 className="deck-audience-card-title">How's the pace?</h3>
                <p className="deck-audience-hint is-top">
                  The presenter sees a tally, never who said what.
                </p>
                <div className="deck-audience-seg" role="group" aria-label="Pace">
                  {(
                    [
                      [-1, "🐢", "Slower"],
                      [0, "👍", "Just right"],
                      [1, "🐇", "Faster"],
                    ] as const
                  ).map(([v, emoji, label]) => (
                    <button
                      key={v}
                      type="button"
                      className={pace === v ? "is-on" : ""}
                      aria-pressed={pace === v}
                      onClick={() => setPaceValue(v)}
                    >
                      <span aria-hidden>{emoji}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </Card>
              <button
                type="button"
                className={cx("deck-audience-hand", hand && "is-on")}
                aria-pressed={hand}
                onClick={toggleHand}
              >
                <span className="deck-audience-hand-emoji" aria-hidden>
                  {hand ? "✋" : "🙋"}
                </span>
                <span>
                  <b>{hand ? "Hand raised" : "Raise your hand"}</b>
                  <small>{hand ? "Tap to lower it" : "The presenter sees a count of hands"}</small>
                </span>
              </button>
              {welcome && live ? null : (
                <Card>
                  <label className="deck-audience-field">
                    <span className="deck-audience-card-title">Your name</span>
                    <span className="deck-audience-hint is-top">
                      Optional. Only the quiz leaderboard shows it.
                    </span>
                    <input
                      className="deck-audience-input"
                      value={name}
                      onChange={(e) => setName(e.target.value.slice(0, 24))}
                      placeholder="e.g. Priya"
                      autoComplete="nickname"
                      enterKeyHint="done"
                    />
                  </label>
                </Card>
              )}
            </>
          ) : null}

          {tab === "ask" ? (
            <>
              <Card className="deck-audience-ask">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask();
                  }}
                >
                  <label className="deck-audience-card-title" htmlFor="deck-audience-question">
                    Ask the presenter
                  </label>
                  <textarea
                    id="deck-audience-question"
                    className="deck-audience-input is-area"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value.slice(0, 280))}
                    placeholder="What would you like to know?"
                    rows={3}
                    enterKeyHint="send"
                  />
                  <div className="deck-audience-row is-end">
                    <span className="deck-audience-hint">
                      Anonymous · {280 - question.length} left
                    </span>
                    <button
                      type="submit"
                      className="deck-audience-btn is-primary"
                      disabled={cleanQuestion(question).length < 2 || !online}
                    >
                      <Icon name="send" />
                      Ask
                    </button>
                  </div>
                </form>
              </Card>
              {questions.length ? (
                <>
                  <h3 className="deck-audience-section">
                    Questions <span>{questions.length}</span>
                  </h3>
                  <ul className="deck-audience-questions">
                    {questions.map((q) => {
                      const on = voted.has(q.id);
                      const where = slideOf(q.slide);
                      return (
                        <li
                          key={q.id}
                          className={cx(
                            q.answered && "is-answered",
                            askedSet.has(q.id) && "is-mine",
                          )}
                        >
                          <button
                            type="button"
                            className={cx("deck-vote", on && "is-on")}
                            onClick={() => vote(q.id)}
                            disabled={q.answered}
                            aria-pressed={on}
                            aria-label={`Upvote (${q.votes} ${q.votes === 1 ? "vote" : "votes"})`}
                          >
                            <Icon name="chevron-up" strokeWidth={2.5} />
                            <span>{q.votes}</span>
                          </button>
                          <div className="deck-audience-q">
                            <p>{q.text}</p>
                            <div className="deck-audience-q-meta">
                              {askedSet.has(q.id) ? (
                                <span className="deck-audience-tag is-you">Yours</span>
                              ) : null}
                              {q.answered ? (
                                <span className="deck-audience-tag is-done">
                                  <Icon name="check" strokeWidth={2.5} /> Answered
                                </span>
                              ) : null}
                              {where ? <span>Slide {where.no}</span> : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <Empty icon="message-circle-question" title="No questions yet">
                  Ask the first one. Everyone can upvote, so the best questions rise.
                </Empty>
              )}
            </>
          ) : null}

          {tab === "polls" ? (
            <>
              {openQuizzes.map((q) => (
                <AudienceQuiz key={q.def.id} quiz={q} online={online} {...quizAnswer(q.def.id)} />
              ))}
              {openPolls.map((p) => (
                <AudiencePoll
                  key={p.def.id}
                  poll={p}
                  online={online}
                  {...answer(`p:${p.def.id}`)}
                />
              ))}
              {/* A quiz just answered and revealed is the moment of the talk: it stays on top. */}
              {quizzes
                .filter((q) => !q.open)
                .map((q) => (
                  <AudienceQuiz key={q.def.id} quiz={q} online={online} {...quizAnswer(q.def.id)} />
                ))}
              {!openPolls.length && !quizzes.length ? (
                <Empty
                  icon="chart-no-axes-column"
                  title={closedPolls.length ? "Nothing open right now" : "Nothing to vote on yet"}
                >
                  Polls and quizzes show up here the moment the presenter opens one.
                </Empty>
              ) : null}
              {closedPolls.length ? <h3 className="deck-audience-section">Earlier</h3> : null}
              {closedPolls.map((p) => (
                <AudiencePoll
                  key={p.def.id}
                  poll={p}
                  online={online}
                  {...answer(`p:${p.def.id}`)}
                />
              ))}
            </>
          ) : null}

          {tab === "notes" ? (
            room.notesPublic || deck.config.audienceNotes ? (
              <Card className="deck-audience-notes">
                <h3 className="deck-audience-card-title">
                  Notes for slide {slideNo}
                  {meta?.title ? <span> · {meta.title}</span> : null}
                </h3>
                <AudienceNotes meta={meta} />
              </Card>
            ) : (
              <Empty icon="notebook-text" title="Notes aren't shared">
                If the presenter shares their speaker notes, they'll follow the slide here.
              </Empty>
            )
          ) : null}

          {tab === "mine" ? (
            <>
              <h3 className="deck-audience-section">
                Bookmarks {bookmarks.length ? <span>{bookmarks.length}</span> : null}
              </h3>
              {bookmarks.length ? (
                <ul className="deck-audience-list">
                  {bookmarks.map((k) => {
                    const s = slideOf(k);
                    if (!s) return null;
                    return (
                      <li key={k}>
                        <a
                          href={`${deck.base}#/${s.h}${s.v ? `/${s.v}` : ""}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="deck-audience-list-no">{s.no}</span>
                          <span className="deck-audience-list-title">
                            {s.title || `Slide ${s.no}`}
                          </span>
                          <Icon name="external-link" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty icon="bookmark" title="No bookmarks yet">
                  Tap <Icon name="bookmark" /> under the slide to keep it for later.
                </Empty>
              )}
              {asked.length ? (
                <>
                  <h3 className="deck-audience-section">Your questions</h3>
                  <ul className="deck-audience-list">
                    {questions
                      .filter((q) => askedSet.has(q.id))
                      .map((q) => (
                        <li key={q.id}>
                          <button type="button" onClick={() => setTab("ask")}>
                            <span className="deck-audience-list-no">
                              <Icon name="chevron-up" strokeWidth={2.5} />
                              {q.votes}
                            </span>
                            <span className="deck-audience-list-title">{q.text}</span>
                            {q.answered ? (
                              <span className="deck-audience-tag is-done">Answered</span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                  </ul>
                </>
              ) : null}
              <a
                className="deck-audience-btn is-outline is-block"
                href={`${deck.base}?view=scroll`}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="book-open" />
                Read the whole deck as a page
              </a>
            </>
          ) : null}
        </section>
      </main>

      <Toast toast={toast} />

      {expanded && meta && options ? (
        <FullMirror
          onClose={collapse}
          onReact={react}
          flash={flash}
          browse={browse}
          label={`${slideNo} / ${slideCount}`}
          canPrev={canPrev}
          canNext={canNext}
          onPrev={() => actions.prev()}
          onNext={() => actions.next()}
        >
          <AudienceSlide
            meta={meta}
            options={options}
            h={pos.h}
            v={pos.v}
            click={pos.click}
            bg={options.background}
            fit="contain"
          />
        </FullMirror>
      ) : null}
    </div>
  );
}

/** The room's reactions, rising over the slide from its bottom-right corner. */
function Flash({ items }: { items: { id: number; emoji: string; x: number }[] }) {
  return (
    <div className="deck-audience-flash" aria-hidden>
      {items.map((f) => (
        <span key={f.id} style={{ "--x": f.x } as React.CSSProperties}>
          {f.emoji}
        </span>
      ))}
    </div>
  );
}

/**
 * One reaction: a press that lands pops the emoji and sends a copy floating up from the button; a
 * press over the room's limit shakes instead, so the viewer never thinks a dropped tap was sent.
 */
function ReactionButton({
  emoji,
  onReact,
  disabled,
  compact,
}: {
  emoji: string;
  onReact: (emoji: string) => boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [bursts, setBursts] = useState<number[]>([]);
  const [beat, setBeat] = useState<{ n: number; ok: boolean }>({ n: 0, ok: true });
  return (
    <button
      type="button"
      className={cx("deck-audience-reaction", compact && "is-compact")}
      aria-label={`React ${emoji}`}
      disabled={disabled}
      onClick={() => {
        const ok = onReact(emoji);
        setBeat((b) => ({ n: b.n + 1, ok }));
        if (!ok) return;
        const id = Date.now() + Math.random();
        setBursts((b) => [...b.slice(-4), id]);
        setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 900);
      }}
    >
      <span
        key={beat.n}
        className={cx(
          "deck-audience-reaction-emoji",
          beat.n > 0 && (beat.ok ? "is-pop" : "is-shake"),
        )}
      >
        {emoji}
      </span>
      {bursts.map((id) => (
        <span key={id} className="deck-audience-burst" aria-hidden>
          {emoji}
        </span>
      ))}
    </button>
  );
}

interface ToastAction {
  label: string;
  run: () => void;
  /** The tab the action leads to: reaching it any other way dismisses the toast too. */
  tab?: AudienceTab;
}

interface ToastState {
  current: { id: number; text: string; action?: ToastAction } | null;
  show: (text: string, action?: ToastAction) => void;
  hide: () => void;
}

function useToast(): ToastState {
  const [current, setCurrent] = useState<ToastState["current"]>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useCallback(() => setCurrent(null), []);
  const show = useCallback((text: string, action?: ToastAction) => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent({ id: Date.now(), text, action });
    timer.current = setTimeout(() => setCurrent(null), action ? 6000 : 2600);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return { current, show, hide };
}

/** One message at a time, above the tabs; read out politely. */
function Toast({ toast }: { toast: ToastState }) {
  const t = toast.current;
  return (
    <div className="deck-audience-toast-slot" role="status" aria-live="polite">
      {t ? (
        <div key={t.id} className="deck-audience-toast">
          <span>{t.text}</span>
          {t.action ? (
            <button
              type="button"
              onClick={() => {
                t.action!.run();
                toast.hide();
              }}
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The followed slide, stage-exact: the deck's `width × height` scaled uniformly, backgrounds
 * clipped to the same box, auto-fit applied as on the projector. `fit="width"` (the strip on
 * the join page) keeps the deck's ratio and follows the column; `fit="contain"` (full screen)
 * centres the stage in whatever box it gets, with bars on the two sides that are left over.
 */
function AudienceSlide({
  meta,
  options,
  h,
  v,
  click,
  bg,
  fit = "width",
}: {
  meta: NonNullable<ReturnType<typeof useDeck>["columns"][number]["slides"][number]>;
  options: NonNullable<ReturnType<ReturnType<typeof useDeck>["options"]["get"]>>;
  h: number;
  v: number;
  click: number;
  bg: NonNullable<ReturnType<ReturnType<typeof useDeck>["options"]["get"]>>["background"];
  fit?: "width" | "contain";
}) {
  const deck = useDeck();
  const live = useLiveOptional();
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ scale: 0.2, left: 0, top: 0 });
  /**
   * Whether this screen can carry the slide's embedded pages live.
   *
   * A laptop in the room can; a phone cannot, and should not be asked to. The mirror is a few
   * hundred pixels of someone else's slide, and a live page in it is a second copy of whatever the
   * presenter is already running — a map holding its own WebGL context, on a device that will drop
   * the whole tab rather than go over its budget. The poster says the same thing for the cost of
   * an image, and every slide that embeds a page tells the room how to open it for themselves.
   */
  const roomy =
    typeof window !== "undefined" && (window.matchMedia?.("(min-width: 900px)").matches ?? true);
  // The presenter's blackout arrived here all along — it is `paused` in the nav, and the room sets
  // it. What was missing was anything to paint it: the curtain lives in the deck's own chrome, and
  // the join page has a layout of its own, so the state landed on a screen with nowhere to show.
  const paused = useNav((s) => s.paused);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = deck.config;
      const scale =
        fit === "contain"
          ? Math.min(el.clientWidth / width, el.clientHeight / height)
          : el.clientWidth / width;
      setPlace({
        scale,
        left: (el.clientWidth - width * scale) / 2,
        top: fit === "contain" ? (el.clientHeight - height * scale) / 2 : 0,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [deck.config, fit]);
  return (
    <div
      ref={box}
      className={["deck-audience-canvas-box", `fit-${fit}`].join(" ")}
      style={
        fit === "width"
          ? { aspectRatio: `${deck.config.width} / ${deck.config.height}` }
          : undefined
      }
    >
      <div
        className="deck-audience-canvas"
        style={{
          width: deck.config.width,
          height: deck.config.height,
          transform: `translate(${place.left}px, ${place.top}px) scale(${place.scale})`,
        }}
      >
        <BackgroundLayer bg={bg} active />
        <SlideFrame
          key={`${h},${v}`}
          meta={meta}
          options={options}
          h={h}
          v={v}
          /* Live, not a thumbnail: it steps with the presenter and anything that moves, moves. */
          active
          click={click}
          preview
          terms
          frames={roomy ? "load" : undefined}
          className="is-mirror"
        />
        {/* The presenter's drawings and laser land on the mirror too. */}
        <DrawingLayer inCanvas />
        {live ? <PointerLayer inCanvas /> : null}
        <ConfettiLayer inCanvas />
      </div>
      {/*
        Outside the scaled canvas so it is not scaled with it, inside the box so it covers the
        slide and nothing else: the room keeps its reactions, its questions and its way out. It
        takes no clicks — a blackout is the presenter's to lift, not the viewer's.
      */}
      <div className="deck-pause-curtain is-audience" data-on={paused || undefined} aria-hidden>
        <span>
          <Icon name="pause" /> Paused by the presenter
        </span>
      </div>
    </div>
  );
}

/**
 * The slide filling the screen — a phone turned sideways — with the reactions floating at the
 * bottom. Goes truly full screen where the browser allows it and asks for landscape; a tap on
 * the bars, the close button, Escape, or the browser's own exit comes back.
 *
 * Full screen is requested once, on mount. The page above re-renders on every reaction and
 * every room update, so the callbacks are read through refs — an effect keyed on them would
 * tear full screen down and race to rebuild it on each click.
 */
function FullMirror({
  children,
  onClose,
  onReact,
  flash,
  browse,
  label,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  children: React.ReactNode;
  onClose: () => void;
  onReact: (emoji: string) => boolean;
  flash: { id: number; emoji: string; x: number }[];
  browse: ReturnType<typeof useBrowse>;
  label: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const back = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus({ preventScroll: true });
    let entered = false;
    el.requestFullscreen?.().then(
      () => {
        entered = true;
        const o = screen.orientation as ScreenOrientation & {
          lock?: (o: string) => Promise<void>;
        };
        o?.lock?.("landscape").catch(() => {});
      },
      () => {},
    );
    // The browser leaving full screen on its own (its Esc, a swipe) closes the mirror too; the
    // entering event carries our element, so it does nothing.
    const onChange = () => {
      if (entered && !document.fullscreenElement) close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement === el) document.exitFullscreen?.().catch(() => {});
      back?.focus?.({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      ref={root}
      className="deck-audience-full"
      role="dialog"
      aria-modal="true"
      aria-label="The slide, full screen"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="deck-audience-full-stage" {...browse}>
        {children}
      </div>
      <div className="deck-audience-full-top">
        <span className="deck-audience-full-count">{label}</span>
        <button
          ref={closeBtn}
          type="button"
          className="deck-audience-full-btn"
          onClick={onClose}
          aria-label="Back to the join page"
        >
          <Icon name="minimize-2" />
        </button>
      </div>
      <p className="deck-audience-full-rotate" aria-hidden>
        <Icon name="smartphone" /> Turn your phone sideways for a bigger slide
      </p>
      <div className="deck-audience-full-bottom">
        <button
          type="button"
          className="deck-audience-full-btn"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Back"
        >
          <Icon name="chevron-left" />
        </button>
        <div className="deck-audience-full-react" aria-label="React">
          {REACTIONS.map((e) => (
            <ReactionButton key={e} emoji={e} onReact={onReact} compact />
          ))}
        </div>
        <button
          type="button"
          className="deck-audience-full-btn"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Forward"
        >
          <Icon name="chevron-right" />
        </button>
      </div>
      <Flash items={flash} />
    </div>,
    document.body,
  );
}

/**
 * Moving through the deck with a thumb: a horizontal swipe turns the page, a vertical one moves
 * within a stack, and a press that went nowhere opens the slide full screen — the gesture this
 * page has always had. The deck's own swipe tracker is bound to the play view alone, so the phone
 * gets its own here. Anything on the slide that takes a press of its own keeps it.
 */
function useBrowse(onTap: () => void) {
  const actions = useActions();
  const swipe = useMemo(() => createSwipeTracker(), []);
  const from = useRef<{ x: number; y: number } | null>(null);
  const spare = (t: EventTarget | null) =>
    !!(t as HTMLElement | null)?.closest?.("button, a, iframe, input, textarea, select");
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (spare(e.target)) return;
      from.current = { x: e.clientX, y: e.clientY };
      swipe.start(e.clientX, e.clientY, e.timeStamp);
    },
    onPointerUp: (e: React.PointerEvent) => {
      const start = from.current;
      from.current = null;
      if (!start || spare(e.target)) return;
      // Sideways only: this page scrolls under the thumb, so a vertical drag belongs to the page.
      // `prev`/`next` walk the whole deck, stacks included, so nothing is out of reach either way.
      const dir = swipe.end(e.clientX, e.clientY, e.timeStamp);
      if (dir === "left") actions.next();
      else if (dir === "right") actions.prev();
      else if (!dir && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 10) onTap();
    },
  };
}

function AudienceNotes({
  meta,
}: {
  meta: { loadNotes: (() => Promise<{ default: ComponentType }>) | null } | null;
}) {
  const [Notes, setNotes] = useState<ComponentType | null>(null);
  const memo = useMemo(() => meta, [meta]);
  useEffect(() => {
    let alive = true;
    setNotes(null);
    if (!memo?.loadNotes) return;
    void loadSlide(memo as never);
    memo.loadNotes().then((m) => alive && setNotes(() => m.default));
    return () => {
      alive = false;
    };
  }, [memo]);
  return Notes ? (
    <div className="deck-audience-prose">
      <Notes />
    </div>
  ) : (
    <p className="deck-audience-hint">No notes on this slide.</p>
  );
}
