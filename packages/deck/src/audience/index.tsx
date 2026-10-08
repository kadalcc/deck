import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import * as N from "../core/navigation.ts";
import { key as navKey } from "../core/navigation.ts";
import { createSwipeTracker } from "../core/touch.ts";
import { createStore, useStore } from "../core/store.ts";
import { copyText, shareLink } from "../live/analytics.tsx";
import { Poll, Quiz, nickname } from "../live/components.tsx";
import { useLiveOptional, useRoomStatus } from "../live/context.ts";
import { EMPTY_ROOM, REACTIONS, type RoomState } from "../live/protocol.ts";
import { Icon } from "../components/bling.tsx";
import { TermReadout } from "../components/Term.tsx";
import { DrawingLayer } from "../draw/DrawingLayer.tsx";
import { PointerLayer, slideLabel } from "../live/LiveProvider.tsx";
import { BackgroundLayer } from "../react/Backgrounds.tsx";
import { ConfettiLayer } from "../react/ConfettiLayer.tsx";
import { useDeck } from "../react/context.ts";
import { useActions, useNav } from "../react/hooks.ts";
import { closeTerm } from "../react/terms.ts";
import { ThemeMenu } from "../react/ThemeMenu.tsx";
import { loadSlide, SlideFrame } from "../react/SlideFrame.tsx";

const noRoom = createStore<RoomState>(EMPTY_ROOM);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE AUDIENCE PAGE  —  /<slug>/join
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What a phone shows after scanning the code: the slide the presenter is on (the real slide,
 * scaled), the reactions, an ask box with upvotes, whatever poll or quiz is open, pace buttons,
 * a raised hand, the presenter's notes when shared, and bookmarks kept on the phone. Nothing
 * requires an account; a nickname is optional and only used for the quiz leaderboard.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function AudiencePage() {
  const deck = useDeck();
  const live = useLiveOptional();
  const status = useRoomStatus();
  const room = useStore(live?.client.state ?? noRoom);
  const [name, setName] = useState(nickname());
  const [tab, setTab] = useState<"follow" | "ask" | "polls" | "notes" | "mine">("follow");
  const [question, setQuestion] = useState("");
  const [pace, setPace] = useState<-1 | 0 | 1>(0);
  const [hand, setHand] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(`deck.bookmarks.${deck.config.slug}`) ?? "[]",
      ) as string[];
    } catch {
      return [];
    }
  });
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<{ id: number; emoji: string }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const collapse = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    try {
      localStorage.setItem("deck.name", name);
    } catch {
      /* ignore */
    }
  }, [name]);
  useEffect(() => {
    try {
      localStorage.setItem(`deck.bookmarks.${deck.config.slug}`, JSON.stringify(bookmarks));
    } catch {
      /* ignore */
    }
  }, [bookmarks, deck.config.slug]);
  useEffect(() => {
    if (!live) return;
    return live.client.on((m) => {
      if (m.type === "react") {
        const id = Date.now() + Math.random();
        setFlash((f) => [...f.slice(-12), { id, emoji: m.emoji }]);
        setTimeout(() => setFlash((f) => f.filter((x) => x.id !== id)), 1500);
      }
    });
  }, [live]);

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
  // A definition this viewer opened belongs to the step it was opened on. (One relayed from the
  // presenter is the room's to take down — closing it here would race its arrival.)
  useEffect(() => closeTerm(deck, "local"), [deck, pos.h, pos.v, pos.click]);
  const openPolls = Object.values(room.polls).filter((p) => p.open);
  const openQuizzes = Object.values(room.quizzes).filter((q) => q.open || q.revealed);
  const questions = [...room.questions].sort(
    (a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes || a.at - b.at,
  );

  const react = (emoji: string) => {
    live?.client.send({ type: "react", emoji });
    if (navigator.vibrate) navigator.vibrate(10);
  };
  const ask = () => {
    const text = question.trim();
    if (!text || !live) return;
    live.client.send({ type: "qa:ask", text, slide: slideKey });
    setQuestion("");
    setTab("ask");
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
  const bookmark = () =>
    setBookmarks((b) =>
      b.includes(slideKey) ? b.filter((k) => k !== slideKey) : [...b, slideKey],
    );
  void mine;
  void setMine;

  return (
    <div className="deck-audience">
      <header className="deck-audience-head">
        <div>
          <strong>{deck.config.title}</strong>
          <span className={["deck-audience-status", `is-${status}`].join(" ")}>
            {status === "open"
              ? room.presence.presenter
                ? "live"
                : "waiting for the presenter"
              : status}
          </span>
        </div>
        <span className="deck-audience-count">{room.presence.viewers} here</span>
        <ThemeMenu compact />
      </header>

      <section className="deck-audience-slide">
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
          </div>
        ) : (
          <div className="deck-audience-empty">The deck will appear here when it starts.</div>
        )}
        {presenting && !pos.follow ? (
          <button
            type="button"
            className="deck-audience-follow"
            onClick={() => actions.setFollow(true)}
          >
            <Icon name="play" />
            <span>Follow the presenter</span>
            {pos.presenter ? (
              <small>they are on {slideLabel(deck, pos.presenter.h, pos.presenter.v)}</small>
            ) : null}
          </button>
        ) : null}
        <div className="deck-audience-slide-bar">
          <span>
            Slide {pos.h + 1}
            {pos.v ? `.${pos.v + 1}` : ""} of{" "}
            {deck.columns.reduce((n, c) => n + c.slides.length, 0)}
          </span>
          <button
            type="button"
            className={bookmarks.includes(slideKey) ? "is-on" : ""}
            onClick={bookmark}
            aria-label="Bookmark this slide"
          >
            <Icon name={bookmarks.includes(slideKey) ? "bookmark-check" : "bookmark"} />
          </button>
          <button
            type="button"
            className="deck-audience-share"
            onClick={async () => {
              const url = await shareLink(
                deck.config.live.api,
                deck.config.slug || "deck",
                deck.base,
                { h: pos.h, v: pos.v },
              );
              setToast((await copyText(url)) ? "Link copied" : url);
              setTimeout(() => setToast(null), 2000);
            }}
            aria-label="Copy a link to this slide"
          >
            <Icon name="link" />
          </button>
          {toast ? <span className="deck-audience-toast">{toast}</span> : null}
          <button
            type="button"
            className="deck-audience-expand"
            onClick={() => setExpanded(true)}
            disabled={!meta}
            aria-label="Expand the slide to full screen"
          >
            <Icon name="maximize-2" /> Expand
          </button>
          <a
            href={`${deck.base}?at#/${pos.h}${pos.v ? `/${pos.v}` : ""}`}
            target="_blank"
            rel="noreferrer"
          >
            Open full <Icon name="external-link" />
          </a>
        </div>
        <TermReadout />
        <div className="deck-audience-flash" aria-hidden>
          {flash.map((f) => (
            <span key={f.id}>{f.emoji}</span>
          ))}
        </div>
      </section>

      {expanded && meta && options ? (
        <FullMirror onClose={collapse} onReact={react} flash={flash} browse={browse}>
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

      <section className="deck-audience-react">
        {REACTIONS.map((e) => (
          <button type="button" key={e} onClick={() => react(e)} aria-label={`React ${e}`}>
            {e}
          </button>
        ))}
      </section>

      <nav className="deck-audience-tabs">
        {(["follow", "ask", "polls", "notes", "mine"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "is-on" : ""}
            onClick={() => setTab(t)}
          >
            {t === "follow" ? "pace" : t}
            {t === "ask" && questions.length ? <em>{questions.length}</em> : null}
            {t === "polls" && openPolls.length + openQuizzes.length ? (
              <em>{openPolls.length + openQuizzes.length}</em>
            ) : null}
          </button>
        ))}
      </nav>

      <section className="deck-audience-panel">
        {tab === "follow" ? (
          <div className="deck-audience-pace">
            <p>How is the pace for you?</p>
            <div className="deck-audience-pace-buttons">
              <button
                type="button"
                className={pace === -1 ? "is-on" : ""}
                onClick={() => setPaceValue(-1)}
              >
                🐢 Slower
              </button>
              <button
                type="button"
                className={pace === 0 ? "is-on" : ""}
                onClick={() => setPaceValue(0)}
              >
                👍 Just right
              </button>
              <button
                type="button"
                className={pace === 1 ? "is-on" : ""}
                onClick={() => setPaceValue(1)}
              >
                🐇 Faster
              </button>
            </div>
            <button
              type="button"
              className={["deck-audience-hand", hand ? "is-on" : ""].join(" ")}
              onClick={toggleHand}
            >
              {hand ? "✋ Hand raised — tap to lower" : "🙋 Raise a hand"}
            </button>
            <label className="deck-audience-name">
              Your name for the leaderboard
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 24))}
                placeholder="optional"
              />
            </label>
          </div>
        ) : null}

        {tab === "ask" ? (
          <div className="deck-audience-ask">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask();
              }}
            >
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, 280))}
                placeholder="Ask the presenter…"
                rows={2}
              />
              <button type="submit" disabled={!question.trim() || status !== "open"}>
                Ask
              </button>
            </form>
            <ul className="deck-audience-questions">
              {questions.map((q) => (
                <li key={q.id} className={q.answered ? "is-answered" : ""}>
                  <button
                    type="button"
                    className={["deck-vote", voted.has(q.id) ? "is-on" : ""].join(" ")}
                    onClick={() => vote(q.id)}
                    disabled={q.answered}
                  >
                    ▲ {q.votes}
                  </button>
                  <span>{q.text}</span>
                  {q.answered ? <em>answered</em> : null}
                </li>
              ))}
              {!questions.length ? <li className="deck-muted">Be the first to ask.</li> : null}
            </ul>
          </div>
        ) : null}

        {tab === "polls" ? (
          <div className="deck-audience-polls">
            {openPolls.map((p) => (
              <Poll
                key={p.def.id}
                id={p.def.id}
                question={p.def.question}
                options={p.def.options}
                kind={p.def.kind}
                scale={p.def.scale}
              />
            ))}
            {openQuizzes.map((q) => (
              <Quiz
                key={q.def.id}
                id={q.def.id}
                question={q.def.question}
                options={q.def.options}
                correct={q.def.correct}
                seconds={q.def.seconds}
              />
            ))}
            {!openPolls.length && !openQuizzes.length ? (
              <p className="deck-muted">
                Nothing to vote on right now. Polls appear here the moment the presenter opens one.
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "notes" ? (
          <div className="deck-audience-notes">
            {room.notesPublic || deck.config.audienceNotes ? (
              <AudienceNotes meta={meta} />
            ) : (
              <p className="deck-muted">The presenter has not shared the notes.</p>
            )}
          </div>
        ) : null}

        {tab === "mine" ? (
          <div className="deck-audience-mine">
            <h3>Bookmarks</h3>
            <ul>
              {bookmarks.map((k) => {
                const [h, v] = k.split(",").map(Number);
                const m = deck.columns[h!]?.slides[v!];
                return (
                  <li key={k}>
                    <a
                      href={`${deck.base}#/${h}${v ? `/${v}` : ""}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {h! + 1}
                      {v ? `.${v! + 1}` : ""} {m?.title ?? ""}
                    </a>
                  </li>
                );
              })}
              {!bookmarks.length ? (
                <li className="deck-muted">Tap the bookmark on a slide to keep it.</li>
              ) : null}
            </ul>
            <p className="deck-muted">
              Explore the whole deck at your own pace:{" "}
              <a href={`${deck.base}?view=scroll`} target="_blank" rel="noreferrer">
                open it as a page ↗
              </a>
            </p>
          </div>
        ) : null}
      </section>
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
        <span>Paused</span>
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
}: {
  children: React.ReactNode;
  onClose: () => void;
  onReact: (emoji: string) => void;
  flash: { id: number; emoji: string }[];
  browse: ReturnType<typeof useBrowse>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
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
    };
  }, []);
  return createPortal(
    <div
      ref={root}
      className="deck-audience-full"
      role="dialog"
      aria-label="The slide, full screen"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="deck-audience-full-stage" {...browse}>
        {children}
      </div>
      <button
        type="button"
        className="deck-audience-full-close"
        onClick={onClose}
        aria-label="Back to the join page"
      >
        ×
      </button>
      <div className="deck-audience-full-react">
        {REACTIONS.map((e) => (
          <button type="button" key={e} onClick={() => onReact(e)} aria-label={`React ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="deck-audience-flash" aria-hidden>
        {flash.map((f) => (
          <span key={f.id}>{f.emoji}</span>
        ))}
      </div>
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
  return Notes ? <Notes /> : <p className="deck-muted">No notes on this slide.</p>;
}
