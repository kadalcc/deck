import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { key as navKey } from "../core/navigation.ts";
import * as N from "../core/navigation.ts";
import { useStore } from "../core/store.ts";
import { copyText, shareLink } from "../live/analytics.tsx";
import { isEditable } from "../core/keyboard.ts";
import { DrawingLayer } from "../draw/DrawingLayer.tsx";
import { CameraBubble } from "../media/CameraBubble.tsx";
import { CameraControl, RecordControl } from "../media/MediaControls.tsx";
import { useLiveOptional } from "../live/context.ts";
import { PointerLayer } from "../live/LiveProvider.tsx";
import { isTicket, presenterTicket, setTicket, ticketHeaders, withTicket } from "../live/ticket.ts";
import { readItem, writeItem } from "../core/storage.ts";
import { roomIdOf } from "../core/model.ts";
import { useDeck } from "../react/context.ts";
import { useActions, useCurrentSlide, useNav, useUi } from "../react/hooks.ts";
import { BackgroundLayer } from "../react/Backgrounds.tsx";
import { StartButton, Toast } from "../react/chrome.tsx";
import { Icon } from "../components/bling.tsx";
import { ConfettiLayer } from "../react/ConfettiLayer.tsx";
import { HintLayer } from "../react/Hints.tsx";
import { NavControlsLayer } from "../react/Layers.tsx";
import { Overview } from "../react/Overview.tsx";
import { ThemeMenu } from "../react/ThemeMenu.tsx";
import { loadSlide, SlideFrame } from "../react/SlideFrame.tsx";
import { Stage } from "../react/Stage.tsx";
import { RenderContextProvider } from "../react/render-context.ts";
import { useFit } from "../react/fit.ts";
import { NotesView } from "../react/NotesView.tsx";
import { RemoteHost } from "../remote/host.tsx";
import { useNarrationOn } from "../react/NarrationGate.tsx";
import { EditOnWebButton } from "./EditButton.tsx";
import { deckKey, SessionControl, useTimelineCommand } from "./RehearsalMenu.tsx";
import { timelineShown } from "./rehearsal.ts";
import { PresenterSidebar } from "./Sidebar.tsx";
import { TeleprompterControl, usePresenterStateFeed } from "./TeleprompterControl.tsx";
import { PresenterTimer } from "./Timer.tsx";

/** The narration bar is its own chunk, fetched when the presenter view opens on a deck with notes. */
const Narration = lazy(() => import("../narrate/Narration.tsx"));

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PRESENTER VIEW  —  /<slug>/presenter
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What the speaker sees: the current slide live, the next step, the notes with [click] markers,
 * a timer with pacing, the clock, the drawing and pointer tools, and the room — who is watching,
 * the pace they want, their questions, the polls to open. Opened with `S` from the deck; both
 * windows stay in step over the window bus (core/windows.ts), and the room follows the presenter.
 * Its Teleprompter button (Shift T) opens the notes alone, big, in a window for another screen
 * (presenter/Teleprompter.tsx); the notes stay here too.
 *
 * Layouts (the switch in the bar, or L): notes-left (the default: notes over the next slide, the
 * current slide beside them) and notes-right. Each window keeps the one it was left on. A third,
 * next-big, gave the next slide most of the screen and squeezed the current one into a short,
 * pillarboxed strip; it went, and a window that had it saved opens notes-left.
 * ─────────────────────────────────────────────────────────────────────────────
 */
type PresenterLayout = "notes-left" | "notes-right";

const LAYOUTS: { id: PresenterLayout; icon: string; label: string }[] = [
  { id: "notes-left", icon: "panel-left", label: "Notes and next on the left" },
  { id: "notes-right", icon: "panel-right", label: "Notes and next on the right" },
];

function savedLayout(): PresenterLayout {
  const saved = readItem("deck.presenter.layout");
  return LAYOUTS.some((l) => l.id === saved) ? (saved as PresenterLayout) : "notes-left";
}

export function PresenterPage() {
  const deck = useDeck();
  const live = useLiveOptional();
  const gate = usePresenterGate();
  const [layout, setLayout] = useState<PresenterLayout>(savedLayout);
  const overview = useNav((s) => s.overview);
  const drawing = useUi((s) => s.drawing);
  const [mirror, setMirror] = useState(false);
  const [roomOpen, setRoomOpen] = useState(() => readItem("deck.presenter.room") !== "closed");
  const narrate = useNarrationOn();
  const timeline = timelineShown(deckKey(deck));
  const timelineOn = useStore(timeline);
  useTimelineCommand(narrate);
  usePresenterStateFeed();
  useEffect(() => {
    writeItem("deck.presenter.layout", layout);
    writeItem("deck.presenter.room", roomOpen ? "open" : "closed");
  }, [layout, roomOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyL" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isEditable(e)) return;
      // L is also vim's "right" in the deck's own keymap. Here it is the layout, and only that:
      // it used to change the layout AND move the deck on a step, every press.
      e.stopImmediatePropagation();
      e.preventDefault();
      setLayout((l) => LAYOUTS[(LAYOUTS.findIndex((x) => x.id === l) + 1) % LAYOUTS.length]!.id);
    };
    // Capture: ahead of the deck's own key handler, whatever order the two were added in.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  if (live && gate.required && !gate.ok) return <PresenterLogin gate={gate} />;

  return (
    <div
      className={[
        "deck-presenter",
        `layout-${layout}`,
        `room-${roomOpen ? "open" : "collapsed"}`,
        drawing ? "is-drawing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="deck-presenter-bar">
        {/* Two lines at most, like the timer beside it; the whole title is in the tooltip. */}
        <strong className="deck-presenter-title" title={deck.config.title}>
          {deck.config.title}
        </strong>
        {N.slideNumberShown(deck.config, "speaker") ? <PresenterSlideNumber /> : null}
        <PresenterTimer />
        <LayoutSwitch layout={layout} setLayout={setLayout} />
        <span className="deck-presenter-spacer" />
        <PresenterTools mirror={mirror} setMirror={setMirror} />
      </header>
      <main className="deck-presenter-main">
        <section className="deck-presenter-current">
          <div className="deck-presenter-label">Current</div>
          {mirror ? <ScreenMirror /> : <LiveStage />}
          {/* Where the play view has it: the bottom-left of the slide. Over the overview it
              moves to the bottom-left of the window, as it is there in the play view. */}
          {overview ? null : <ThemeMenu />}
        </section>
        <section className="deck-presenter-next">
          <div className="deck-presenter-label">Next</div>
          <NextPreview />
        </section>
        <section className="deck-presenter-notes">
          <div className="deck-presenter-label">Notes</div>
          <NotesPanel />
        </section>
        <aside className="deck-presenter-room">
          <PresenterSidebar open={roomOpen} setOpen={setRoomOpen} />
        </aside>
      </main>
      {/* Esc, O or a toolbar button: every slide, to pick the next one from. The presenter's own;
          the audience keeps the current slide until one is picked. */}
      <Overview />
      {overview ? <ThemeMenu /> : null}
      {/* The pen's toolbar (draw/DrawingLayer.tsx) lands here: on the panes, above the player. */}
      <div className="deck-presenter-toolbar-slot" />
      {narrate ? (
        <Suspense fallback={null}>
          <Narration
            hidden={!timelineOn}
            onHide={() => timeline.set(false)}
            onShow={() => timeline.set(true)}
            menu
          />
        </Suspense>
      ) : null}
      <Toast />
      <HintLayer />
    </div>
  );
}

/**
 * The slide number in the deck's own format (`slideNumber`), in the header: reveal.js's
 * `showSlideNumber: "speaker"` (and `"all"`, which numbers every view) shows it in the speaker
 * view.
 */
function PresenterSlideNumber() {
  const deck = useDeck();
  const at = useNav((s) => ({ h: s.h, v: s.v, click: s.click }));
  const text = N.slideNumberText(deck.config.slideNumber, at, deck.columns);
  return (
    <span className="deck-presenter-slide-number" aria-label={`Slide ${text}`}>
      {text}
    </span>
  );
}

/* ── the login gate ─────────────────────────────────────────────────────── */

interface Gate {
  required: boolean;
  ok: boolean;
  checking: boolean;
  error: string | null;
  /** Whether a passcode can open it at all (a host may say none is set). */
  passcode: boolean;
  /** Where the deck's author signs in instead, when the host offers that (an http(s) URL). */
  signIn: string | null;
  login: (passcode: string) => Promise<void>;
}

/** Only an http(s) link from the host is followed. */
const safeLink = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
};

function usePresenterGate(): Gate {
  const deck = useDeck();
  const api = deck.config.live.api;
  const [state, setState] = useState<{
    ok: boolean;
    required: boolean;
    checking: boolean;
    error: string | null;
    passcode: boolean;
    signIn: string | null;
  }>({ ok: false, required: !!api, checking: !!api, error: null, passcode: true, signIn: null });
  const url = `${api}/decks/${encodeURIComponent(roomIdOf(deck.config))}/presenter`;
  // A ticket that arrives later (the passcode form, another window) is asked about again.
  const ticket = useStore(presenterTicket);
  useEffect(() => {
    if (!api) return;
    let alive = true;
    // No `credentials: "include"`: a sandboxed deck is cross-origin to its host, and the host's
    // answer (`Access-Control-Allow-Origin: *`) is for requests without cookies. The ticket is the
    // credential there; on an ordinary same-origin host the default still sends the cookie.
    fetch(url, { headers: ticketHeaders() })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          required?: boolean;
          passcode?: boolean;
          signIn?: unknown;
        };
        if (alive)
          setState({
            ok: !!j.ok,
            required: j.required !== false,
            checking: false,
            error: null,
            passcode: j.passcode !== false,
            signIn: safeLink(j.signIn),
          });
      })
      .catch(
        () =>
          alive &&
          setState({
            ok: true,
            required: false,
            checking: false,
            error: null,
            passcode: true,
            signIn: null,
          }),
      );
    return () => {
      alive = false;
    };
  }, [api, url, ticket]);
  const login = async (passcode: string) => {
    setState((s) => ({ ...s, checking: true, error: null }));
    const r = await fetch(`${url}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    }).catch(() => null);
    if (r?.ok) {
      const j = (await r.json().catch(() => ({}))) as { ticket?: unknown };
      setState((s) => ({ ...s, ok: true, required: true, checking: false, error: null }));
      // A host that answers with a ticket: keep it and carry on (the room reconnects as presenter).
      // One that only set a cookie: reload, so every request from here on carries it.
      if (isTicket(j.ticket)) setTicket(j.ticket);
      else window.location.reload();
    } else if (!r)
      setState((s) => ({ ...s, checking: false, error: "The host could not be reached." }));
    else
      setState((s) => ({
        ...s,
        checking: false,
        error: r.status === 401 ? "That passcode is wrong." : `The host answered ${r.status}.`,
      }));
  };
  return { ...state, login };
}

/**
 * The passcode form (and "Sign in as the author", when the host offers it). `stats`: the same gate
 * in front of /stats, opened in a tab that has no ticket yet — the passcode opens the stats there.
 */
function PresenterLogin({ gate, stats = false }: { gate: Gate; stats?: boolean }) {
  const deck = useDeck();
  const [code, setCode] = useState("");
  const author = gate.signIn ? (
    <a className="deck-gate-signin" href={gate.signIn}>
      Sign in as the author
    </a>
  ) : null;
  // The author's sign-in returns to the presenter view; its Stats button opens them from there.
  const viaPresenter = stats ? (
    <p className="deck-gate-or">
      Signed in on the presenter view? Open the stats from its toolbar:{" "}
      <a href={`${deck.base}presenter`}>open the presenter view</a>.
    </p>
  ) : null;
  if (!gate.passcode)
    return (
      <div className="deck-gate">
        <div className="deck-gate-card">
          <h1>{stats ? "Stats" : "Presenter"}</h1>
          <p>
            {stats
              ? "This deck's stats are for its presenter. Sign in as its author (with Google or GitHub) to see them."
              : "This deck has no presenter passcode yet. Sign in as its author (with Google or GitHub) to present it — you can set a passcode there for next time."}
          </p>
          {author ?? <p className="deck-gate-error">Ask the deck's owner how to present it.</p>}
          {viaPresenter}
        </div>
      </div>
    );
  return (
    <div className="deck-gate">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void gate.login(code);
        }}
      >
        <h1>{stats ? "Stats" : "Presenter"}</h1>
        <p>
          {stats
            ? "This deck's stats are for its presenter. Enter the presenter passcode"
            : "This deck's presenter view is protected. Enter its presenter passcode"}
          {gate.signIn ? ", or sign in as its author." : "."}
        </p>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Passcode"
          autoFocus
          disabled={gate.checking}
        />
        <button type="submit" disabled={gate.checking || !code}>
          {gate.checking ? "Checking…" : stats ? "Open the stats" : "Open the presenter view"}
        </button>
        {gate.error ? <p className="deck-gate-error">{gate.error}</p> : null}
        {author ? <p className="deck-gate-or">or {author}</p> : null}
        {viaPresenter}
      </form>
    </div>
  );
}

/* ── the pieces ─────────────────────────────────────────────────────────── */

function LiveStage() {
  const deck = useDeck();
  const layout = useStore(deck.layout);
  void layout;
  return (
    <div className="deck-presenter-stage">
      <ScaledStage />
    </div>
  );
}

/** The real stage, scaled into a box: it is the same runtime the audience sees. */
function ScaledStage() {
  const deck = useDeck();
  const box = useRef<HTMLDivElement>(null);
  const fit = useFit(box, deck.config.width, deck.config.height);
  const { h, v } = useNav((s) => ({ h: s.h, v: s.v }));
  const bg = deck.options.get(navKey(h, v))?.background ?? null;
  return (
    <div ref={box} className="deck-presenter-box">
      <div
        className="deck-presenter-canvas"
        style={{
          width: deck.config.width,
          height: deck.config.height,
          transform: `translate(${fit.left}px, ${fit.top}px) scale(${fit.scale})`,
        }}
      >
        <BackgroundLayer bg={bg} active />
        <PresenterInnerStage />
        {/* Without a room this window's laser was nowhere to be seen; a phone remote aims it here. */}
        <DrawingLayer inCanvas />
        <PointerLayer inCanvas />
        <ConfettiLayer inCanvas />
        <CameraBubble inCanvas />
      </div>
    </div>
  );
}

/** The stage without the viewport layout: the presenter box supplies the scale. */
function PresenterInnerStage() {
  const deck = useDeck();
  useEffect(() => {
    deck.layout.set({
      scale: 1,
      width: deck.config.width,
      height: deck.config.height,
      left: 0,
      top: 0,
    });
  }, [deck.layout, deck.config.width, deck.config.height]);
  return <Stage />;
}

function NextPreview() {
  const deck = useDeck();
  const nav = useNav((s) => ({ h: s.h, v: s.v, click: s.click, totals: s.totals }));
  const next = useMemo(() => {
    const state = { ...N.initialNav(), ...nav };
    const moved = N.next(state, deck.columns, deck.config);
    if (moved === state) return null;
    return {
      h: moved.h,
      v: moved.v,
      click: moved.click,
      sameSlide: moved.h === nav.h && moved.v === nav.v,
    };
  }, [nav, deck.columns, deck.config]);
  const box = useRef<HTMLDivElement>(null);
  const fit = useFit(box, deck.config.width, deck.config.height);
  if (!next) {
    return (
      <div ref={box} className="deck-presenter-box is-end">
        <span>End of the deck</span>
      </div>
    );
  }
  const meta = deck.columns[next.h]!.slides[next.v]!;
  const options = deck.options.get(navKey(next.h, next.v))!;
  return (
    <div ref={box} className="deck-presenter-box">
      <div
        className="deck-presenter-canvas"
        style={{
          width: deck.config.width,
          height: deck.config.height,
          transform: `translate(${fit.left}px, ${fit.top}px) scale(${fit.scale})`,
        }}
      >
        <BackgroundLayer bg={options.background} active={false} />
        <RenderContextProvider value="previewNext">
          <SlideFrame
            key={`${next.h},${next.v}`}
            meta={meta}
            options={options}
            h={next.h}
            v={next.v}
            active={false}
            click={next.click}
            preview
            /* The next slide is shown whole; the next step of THIS slide is shown as that step,
               which is the only thing that makes the "Step n" label underneath it true. */
            className={next.sameSlide ? "is-mirror" : "is-tile"}
          />
        </RenderContextProvider>
      </div>
      <span className="deck-presenter-next-label">
        {next.sameSlide
          ? `Step ${next.click}`
          : `Slide ${next.h + 1}${next.v ? `.${next.v + 1}` : ""}${meta.title ? ` · ${meta.title}` : ""}`}
      </span>
    </div>
  );
}

/**
 * Notes, with `[click]` markers splitting them into the parts the clicks reveal: the current part
 * marked, a marker's button jumps to its step, and in `kadal-deck dev` (or with a host's
 * `notesEditor`) Edit turns them into their Markdown, saved back into deck.mdx (react/NotesView.tsx).
 */
export function NotesPanel() {
  const { meta, h, v } = useCurrentSlide();
  const click = useNav((s) => s.click);
  const actions = useActions();
  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(readItem("deck.notes.size") ?? 20);
    return Number.isFinite(saved) && saved > 0 ? saved : 20;
  });
  useEffect(() => {
    if (meta) void loadSlide(meta);
  }, [meta]);
  useEffect(() => {
    writeItem("deck.notes.size", String(fontSize));
  }, [fontSize]);
  if (!meta) return <div className="deck-notes-panel" />;
  return (
    <div className="deck-notes-panel">
      <NotesView
        meta={meta}
        click={click}
        onJump={(step) => actions.goto(h, v, step)}
        fontSize={fontSize}
        tools={
          <>
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.max(12, s - 2))}
              aria-label="Smaller notes"
            >
              A−
            </button>
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.min(48, s + 2))}
              aria-label="Larger notes"
            >
              A+
            </button>
          </>
        }
      />
    </div>
  );
}

/** The layouts as one segmented switch in the bar; L flips between them too. */
function LayoutSwitch({
  layout,
  setLayout,
}: {
  layout: PresenterLayout;
  setLayout: (l: PresenterLayout) => void;
}) {
  return (
    <div className="deck-presenter-layout" role="radiogroup" aria-label="Layout (L)">
      {LAYOUTS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={layout === l.id}
          aria-label={l.label}
          title={`${l.label} (L)`}
          className={layout === l.id ? "is-on" : ""}
          onClick={() => setLayout(l.id)}
        >
          <Icon name={l.icon} />
        </button>
      ))}
    </div>
  );
}

function PresenterTools({
  mirror,
  setMirror,
}: {
  mirror: boolean;
  setMirror: (v: boolean) => void;
}) {
  const deck = useDeck();
  const actions = useActions();
  const ticket = useStore(presenterTicket);
  const live = useLiveOptional();
  const ui = useUi((s) => ({
    drawing: s.drawing,
    pointer: s.pointer,
    spotlight: s.spotlight,
    scheme: s.colorScheme,
    termSync: s.termSync,
    projectorOpen: s.projectorOpen,
  }));
  const paused = useNav((s) => s.paused);
  const notesPublic = useStore(live?.client.state ?? noStore, (s) => (s ? s.notesPublic : false));
  const toggle = (key: "drawing" | "pointer" | "spotlight") =>
    deck.ui.update((s) => ({ ...s, [key]: !s[key] }));
  return (
    <div className="deck-presenter-tools" role="toolbar">
      <button
        type="button"
        onClick={() => actions.toggleOverview()}
        aria-label="Overview"
        title="Every slide (O or Esc)"
      >
        <Icon name="layout-grid" /> Overview
      </button>
      <EditOnWebButton />
      <button
        type="button"
        className={ui.drawing ? "is-on" : ""}
        onClick={() => toggle("drawing")}
        title="Draw (C)"
      >
        <Icon name="pencil" /> Draw
      </button>
      <button
        type="button"
        className={ui.pointer ? "is-on" : ""}
        onClick={() => toggle("pointer")}
        title="Laser pointer (X)"
      >
        <Icon name="mouse-pointer-2" /> Pointer
      </button>
      <button
        type="button"
        className={ui.spotlight ? "is-on" : ""}
        onClick={() => toggle("spotlight")}
        title="Spotlight follows the pointer"
      >
        <Icon name="flashlight" /> Spotlight
      </button>
      <button
        type="button"
        className={paused ? "is-on" : ""}
        onClick={() => actions.togglePause()}
        title="Black out the audience screen (B)"
      >
        <Icon name="monitor-off" /> Blackout
      </button>
      <button
        type="button"
        onClick={() => actions.toggleColorScheme()}
        title="Dark or light (D)"
        aria-label="Dark or light"
      >
        <Icon name={ui.scheme === "dark" ? "moon" : "sun"} />
      </button>
      {live ? (
        <>
          <button
            type="button"
            className={notesPublic ? "is-on" : ""}
            onClick={() => live.client.send({ type: "notes:public", on: !notesPublic })}
            title="Let the audience page show your notes"
          >
            <Icon name="notebook-text" /> Share notes
          </button>
          <button
            type="button"
            className={ui.termSync ? "is-on" : ""}
            onClick={() => actions.toggleTermSync()}
            title="Definitions you open on a term also open on every screen"
          >
            <Icon name="book-open-text" /> Share terms
          </button>
          <button
            type="button"
            onClick={() => {
              // The room relays to everyone else; this window is not in that broadcast.
              live.client.send({ type: "confetti" });
              window.dispatchEvent(new CustomEvent("deck:confetti"));
            }}
            title="Confetti on every screen"
          >
            <Icon name="party-popper" /> Confetti
          </button>
        </>
      ) : null}
      {/* Start session (with a room), and the rehearsal menu beside it: RehearsalMenu.tsx. */}
      <SessionControl />
      <button
        type="button"
        className={ui.projectorOpen ? "is-on" : ""}
        onClick={() => actions.toggleProjector()}
        title="A window showing nothing but this deck, following you — share THAT window on a call"
      >
        <Icon name="projector" /> Share window
      </button>
      <TeleprompterControl />
      {/* The camera bubble on the slide (every window) and the recorder: src/media/. */}
      <CameraControl />
      <RecordControl />
      <button
        type="button"
        className={mirror ? "is-on" : ""}
        onClick={() => setMirror(!mirror)}
        title="Mirror a screen or window here"
      >
        <Icon name="screen-share" /> Mirror
      </button>
      <button
        type="button"
        onClick={async () => {
          const n = deck.nav.get();
          const url = await shareLink(deck.config.live.api, roomIdOf(deck.config), deck.base, {
            h: n.h,
            v: n.v,
            click: n.click,
          });
          actions.toast((await copyText(url)) ? `Copied ${url}` : url);
        }}
        title="Copy a short link to this slide"
      >
        <Icon name="link" /> Link
      </button>
      <RemoteHost />
      <a
        className="deck-presenter-link"
        href={`${deck.base}stats${ticket ? withTicket("") : ""}`}
        target="_blank"
        rel="noreferrer"
      >
        <Icon name="chart-column" /> Stats
      </a>
      <StartButton label />
      <NavControlsLayer placement="toolbar" />
    </div>
  );
}

import { createStore } from "../core/store.ts";
const noStore = createStore<null>(null);

/** Show another screen or window inside the presenter view (Slidev's screen mirror). */
function ScreenMirror() {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getDisplayMedia({ video: true, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError("Mirroring was not allowed"));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  return (
    <div className="deck-presenter-box">
      {error ? (
        <span>{error}</span>
      ) : (
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      )}
    </div>
  );
}

function ReactionTotals({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <div className="deck-reaction-totals">
      {entries.map(([e, n]) => (
        <span key={e}>
          {e} {n}
        </span>
      ))}
    </div>
  );
}

/* ── /notes: every note on one page ─────────────────────────────────────── */

/**
 * Every slide's notes, one after another: a page to read from on a second device, or to review
 * the talk. It follows the presenter (in this browser, or the room): the slide being presented is
 * marked, its current part highlighted and kept in view, and its markers jump to their step. In
 * `kadal-deck dev` each entry has Edit (or double-click), and "Edit all" opens /notes-edit.
 */
export function NotesPage() {
  const deck = useDeck();
  const editor = deck.notesEditor;
  const at = useNav((s) => ({ h: s.h, v: s.v, click: s.click }));
  const actions = useActions();
  return (
    <div className="deck-notes-page">
      <header className="deck-notes-page-head">
        <h1>{deck.config.title} — notes</h1>
        <nav>
          <a href={`${deck.base}overview`}>Overview</a>
          {editor ? <a href={`${deck.base}notes-edit`}>Edit all</a> : null}
        </nav>
      </header>
      {deck.columns.flatMap((c) =>
        c.slides.map((meta, v) => {
          const current = at.h === c.h && at.v === v;
          return (
            <section
              key={`${c.h},${v}`}
              className={["deck-notes-entry", current ? "is-current" : ""].join(" ")}
              aria-current={current ? "step" : undefined}
            >
              <h2>
                <a href={`${deck.base}#/${c.h}${v ? `/${v}` : ""}`}>
                  {c.h + 1}
                  {v ? `.${v + 1}` : ""} {meta.title ?? ""}
                </a>
              </h2>
              <NotesView
                meta={meta}
                click={current ? at.click : null}
                onJump={(step) => actions.goto(c.h, v, step)}
                scroll="page"
                empty="—"
              />
            </section>
          );
        }),
      )}
    </div>
  );
}

/* ── /stats: the deck's numbers from the host ───────────────────────────── */

interface Stats {
  deck: string;
  views: number;
  viewers: number;
  sessions: {
    id: string;
    startedAt: number;
    endedAt: number | null;
    peak: number;
    questions: number;
    reactions: number;
  }[];
  slides: { slide: string; views: number; dwellMs: number }[];
  questions: { text: string; votes: number; answered: boolean; at: number }[];
  reactions: Record<string, number>;
  exports: { kind: string; key: string; size: number; at: number }[];
}

export function StatsPage() {
  const deck = useDeck();
  const api = deck.config.live.api;
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ticket = useStore(presenterTicket);
  // The presenter's gate, here too: a tab opened on /stats directly has no ticket, and the
  // passcode (or the author's sign-in) gives it one without going round by the presenter view.
  const gate = usePresenterGate();
  useEffect(() => {
    if (!api || !gate.ok) return;
    setError(null);
    fetch(`${api}/decks/${encodeURIComponent(roomIdOf(deck.config))}/stats`, {
      headers: ticketHeaders(),
    })
      .then(async (r) =>
        r.ok
          ? setStats((await r.json()) as Stats)
          : setError(
              r.status === 401
                ? "The host did not accept this sign-in. Open the presenter view and sign in again."
                : `The host answered ${r.status}.`,
            ),
      )
      .catch((e: unknown) => setError(String(e)));
  }, [api, deck.config, ticket, gate.ok]);
  const note = (text: string, tone?: "error") => (
    <div className="deck-gate">
      <div className="deck-gate-card">
        <h1>Stats</h1>
        <p className={tone === "error" ? "deck-gate-error" : undefined}>{text}</p>
        <p className="deck-gate-or">
          <a href={`${deck.base}presenter`}>The presenter view</a> ·{" "}
          <a href={deck.base}>the deck</a>
        </p>
      </div>
    </div>
  );
  if (!api) return note("This deck has no host, so there are no stats.");
  if (gate.required && !gate.ok)
    return gate.checking && !gate.error ? note("Checking…") : <PresenterLogin gate={gate} stats />;
  if (error) return note(error, "error");
  if (!stats) return note("Loading…");
  const maxDwell = Math.max(1, ...stats.slides.map((s) => s.dwellMs));
  const titleOf = (slide: string) => {
    const [h, v] = slide.split(",").map(Number);
    return deck.columns[h!]?.slides[v!]?.title ?? "";
  };
  return (
    <div className="deck-stats-page">
      <h1>{deck.config.title} — stats</h1>
      <div className="deck-stats-cards">
        <div>
          <strong>{stats.views}</strong>
          <span>views</span>
        </div>
        <div>
          <strong>{stats.viewers}</strong>
          <span>distinct viewers</span>
        </div>
        <div>
          <strong>{stats.sessions.length}</strong>
          <span>live sessions</span>
        </div>
        <div>
          <strong>{stats.questions.length}</strong>
          <span>questions asked</span>
        </div>
      </div>
      <h2>Time per slide</h2>
      <table className="deck-stats-table">
        <tbody>
          {stats.slides.map((s) => (
            <tr key={s.slide}>
              <td className="deck-stats-slide">
                {s.slide.replace(",0", "").replace(",", ".")} {titleOf(s.slide)}
              </td>
              <td className="deck-stats-bar">
                <i style={{ width: `${(s.dwellMs / maxDwell) * 100}%` }} />
              </td>
              <td className="deck-stats-num">{Math.round(s.dwellMs / 1000)}s</td>
              <td className="deck-stats-num">{s.views} views</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Sessions</h2>
      <table className="deck-stats-table">
        <tbody>
          {stats.sessions.map((s) => (
            <tr key={s.id}>
              <td>{new Date(s.startedAt).toLocaleString()}</td>
              <td className="deck-stats-num">
                {s.endedAt ? `${Math.round((s.endedAt - s.startedAt) / 60000)} min` : "live"}
              </td>
              <td className="deck-stats-num">peak {s.peak}</td>
              <td className="deck-stats-num">{s.questions} questions</td>
              <td className="deck-stats-num">{s.reactions} reactions</td>
            </tr>
          ))}
          {!stats.sessions.length ? (
            <tr>
              <td className="deck-muted">
                No live session yet — press “Start session” in the presenter view.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <h2>Reactions</h2>
      <ReactionTotals totals={stats.reactions} />
      <h2>Questions</h2>
      <ul className="deck-room-questions">
        {stats.questions.map((q, i) => (
          <li key={i} className={q.answered ? "is-answered" : ""}>
            <span className="deck-question-votes">▲ {q.votes}</span>
            <span className="deck-question-text">{q.text}</span>
          </li>
        ))}
      </ul>
      <h2>Exports</h2>
      <ul className="deck-stats-exports">
        {stats.exports.map((e) => (
          <li key={e.key}>
            <a
              href={`${api}/decks/${encodeURIComponent(roomIdOf(deck.config))}/exports/${encodeURIComponent(e.key)}`}
            >
              {e.kind} · {new Date(e.at).toLocaleString()} · {Math.round(e.size / 1024)} KB
            </a>
          </li>
        ))}
        {!stats.exports.length ? (
          <li className="deck-muted">
            Run `bun run export --upload` in the deck to archive a PDF here.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
