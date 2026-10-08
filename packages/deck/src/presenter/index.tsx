import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";

import { key as navKey } from "../core/navigation.ts";
import * as N from "../core/navigation.ts";
import { useStore } from "../core/store.ts";
import { copyText, shareLink } from "../live/analytics.tsx";
import { Pace, Presence, QrJoin } from "../live/components.tsx";
import { DrawingLayer } from "../draw/DrawingLayer.tsx";
import { useLiveOptional, useRoomStatus } from "../live/context.ts";
import { PointerLayer } from "../live/LiveProvider.tsx";
import { roomIdOf } from "../core/model.ts";
import { useDeck } from "../react/context.ts";
import { useActions, useCurrentSlide, useNav, useUi } from "../react/hooks.ts";
import { BackgroundLayer } from "../react/Backgrounds.tsx";
import { Toast } from "../react/chrome.tsx";
import { Icon } from "../components/bling.tsx";
import { ConfettiLayer } from "../react/ConfettiLayer.tsx";
import { HintLayer } from "../react/Hints.tsx";
import { ThemeMenu } from "../react/ThemeMenu.tsx";
import { loadSlide, SlideFrame } from "../react/SlideFrame.tsx";
import { Stage } from "../react/Stage.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PRESENTER VIEW  —  /<slug>/presenter
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What the speaker sees: the current slide live, the next step, the notes with [click] markers,
 * a timer with pacing, the clock, the drawing and pointer tools, and the room — who is watching,
 * the pace they want, their questions, the polls to open. Opened with `S` from the deck; both
 * windows stay in step through a BroadcastChannel, and the room follows the presenter.
 *
 * Layouts (toggle with L): notes-right (default), notes-left, next-big.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function PresenterPage() {
  const deck = useDeck();
  const live = useLiveOptional();
  const gate = usePresenterGate();
  const [layout, setLayout] = useState<"notes-right" | "notes-left" | "next-big">(() => {
    try {
      return (localStorage.getItem("deck.presenter.layout") as "notes-right") ?? "notes-right";
    } catch {
      return "notes-right";
    }
  });
  const [mirror, setMirror] = useState(false);
  const [roomOpen, setRoomOpen] = useState(() => {
    try {
      return localStorage.getItem("deck.presenter.room") !== "closed";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("deck.presenter.layout", layout);
      localStorage.setItem("deck.presenter.room", roomOpen ? "open" : "closed");
    } catch {
      /* ignore */
    }
  }, [layout, roomOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyL" && !e.metaKey && !e.ctrlKey)
        setLayout((l) =>
          l === "notes-right" ? "notes-left" : l === "notes-left" ? "next-big" : "notes-right",
        );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (live && gate.required && !gate.ok) return <PresenterLogin gate={gate} />;

  return (
    <div className={`deck-presenter layout-${layout} room-${roomOpen ? "open" : "collapsed"}`}>
      <header className="deck-presenter-bar">
        <strong>{deck.config.title}</strong>
        <PresenterTimer />
        <Clock />
        <span className="deck-presenter-spacer" />
        <PresenterTools mirror={mirror} setMirror={setMirror} />
      </header>
      <main className="deck-presenter-main">
        <section className="deck-presenter-current">
          <div className="deck-presenter-label">Current</div>
          {mirror ? <ScreenMirror /> : <LiveStage />}
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
          <RoomPanel open={roomOpen} setOpen={setRoomOpen} />
        </aside>
      </main>
      <Toast />
      <HintLayer />
    </div>
  );
}

/* ── the login gate ─────────────────────────────────────────────────────── */

interface Gate {
  required: boolean;
  ok: boolean;
  checking: boolean;
  error: string | null;
  login: (passcode: string) => Promise<void>;
}

function usePresenterGate(): Gate {
  const deck = useDeck();
  const api = deck.config.live.api;
  const [state, setState] = useState<{
    ok: boolean;
    required: boolean;
    checking: boolean;
    error: string | null;
  }>({ ok: false, required: !!api, checking: !!api, error: null });
  const url = `${api}/decks/${encodeURIComponent(roomIdOf(deck.config))}/presenter`;
  useEffect(() => {
    if (!api) return;
    let alive = true;
    fetch(url, { credentials: "include" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; required?: boolean };
        if (alive)
          setState({ ok: !!j.ok, required: j.required !== false, checking: false, error: null });
      })
      .catch(() => alive && setState({ ok: true, required: false, checking: false, error: null }));
    return () => {
      alive = false;
    };
  }, [api, url]);
  const login = async (passcode: string) => {
    setState((s) => ({ ...s, checking: true, error: null }));
    const r = await fetch(`${url}/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (r.ok) {
      setState({ ok: true, required: true, checking: false, error: null });
      window.location.reload();
    } else
      setState((s) => ({
        ...s,
        checking: false,
        error: r.status === 401 ? "That passcode is wrong." : `The host answered ${r.status}.`,
      }));
  };
  return { ...state, login };
}

function PresenterLogin({ gate }: { gate: Gate }) {
  const [code, setCode] = useState("");
  return (
    <div className="deck-gate">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void gate.login(code);
        }}
      >
        <h1>Presenter</h1>
        <p>
          This deck's presenter view is protected. Enter the passcode set for the deck on the host.
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
          {gate.checking ? "Checking…" : "Open the presenter view"}
        </button>
        {gate.error ? <p className="deck-gate-error">{gate.error}</p> : null}
      </form>
    </div>
  );
}

/** Fit the authored canvas into a box: scale to the shorter side, centre the rest. */
function useFit(box: React.RefObject<HTMLDivElement | null>, width: number, height: number) {
  const [fit, setFit] = useState({ scale: 0.2, left: 0, top: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const scale = Math.min(el.clientWidth / width, el.clientHeight / height);
      setFit({
        scale,
        left: (el.clientWidth - width * scale) / 2,
        top: (el.clientHeight - height * scale) / 2,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, width, height]);
  return fit;
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
  const live = useLiveOptional();
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
        {live ? (
          <>
            <DrawingLayer inCanvas />
            <PointerLayer inCanvas />
          </>
        ) : (
          <DrawingLayer inCanvas />
        )}
        <ConfettiLayer inCanvas />
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
      </div>
      <span className="deck-presenter-next-label">
        {next.sameSlide
          ? `Step ${next.click}`
          : `Slide ${next.h + 1}${next.v ? `.${next.v + 1}` : ""}${meta.title ? ` · ${meta.title}` : ""}`}
      </span>
    </div>
  );
}

/** Notes, with `[click]` markers splitting them into the segments the clicks reveal. */
export function NotesPanel() {
  const { meta } = useCurrentSlide();
  const click = useNav((s) => s.click);
  const [Notes, setNotes] = useState<ComponentType | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(() => {
    try {
      return Number(localStorage.getItem("deck.notes.size") ?? 20);
    } catch {
      return 20;
    }
  });
  useEffect(() => {
    let alive = true;
    setNotes(null);
    if (!meta?.loadNotes) return;
    void loadSlide(meta);
    meta.loadNotes().then((m) => alive && setNotes(() => m.default as ComponentType));
    return () => {
      alive = false;
    };
  }, [meta]);
  // Split the rendered notes at "[click]" markers and highlight the current segment.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    let segment = 0;
    for (const node of nodes) {
      if (!node.data.includes("[click]")) {
        wrap(node, segment);
        continue;
      }
      const parts = node.data.split("[click]");
      const frag = document.createDocumentFragment();
      parts.forEach((p, i) => {
        if (i > 0) {
          segment++;
          const marker = document.createElement("span");
          marker.className = "deck-click-marker";
          marker.dataset.segment = String(segment);
          marker.textContent = String(segment);
          frag.appendChild(marker);
        }
        if (p) {
          const span = document.createElement("span");
          span.className = "deck-notes-segment";
          span.dataset.segment = String(segment);
          span.textContent = p;
          frag.appendChild(span);
        }
      });
      node.replaceWith(frag);
    }
    function wrap(n: Text, seg: number) {
      if (!n.data.trim() || n.parentElement?.classList.contains("deck-notes-segment")) return;
      const span = document.createElement("span");
      span.className = "deck-notes-segment";
      span.dataset.segment = String(seg);
      n.replaceWith(span);
      span.appendChild(n);
    }
  }, [Notes]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    for (const s of el.querySelectorAll<HTMLElement>("[data-segment]")) {
      const seg = Number(s.dataset.segment);
      s.classList.toggle("is-current", seg === click);
      s.classList.toggle("is-past", seg < click);
    }
    el.querySelector<HTMLElement>(`.deck-notes-segment.is-current`)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [click, Notes]);
  useEffect(() => {
    try {
      localStorage.setItem("deck.notes.size", String(fontSize));
    } catch {
      /* ignore */
    }
  }, [fontSize]);
  return (
    <div className="deck-notes-panel">
      <div className="deck-notes-tools">
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
      </div>
      <div ref={root} className="deck-notes-body" style={{ fontSize }}>
        {Notes ? <Notes /> : <p className="deck-muted">No notes for this slide.</p>}
      </div>
    </div>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Elapsed time since the view opened, with pacing against `defaultTiming` or `totalTime`. */
function PresenterTimer() {
  const deck = useDeck();
  /**
   * Kept for the life of this TAB, not this page load, so reloading — to pick up a new build, or
   * to get past a slide that would not load — does not quietly set the talk back to zero. A new
   * window is a new talk and starts again, which is what sessionStorage already means.
   */
  const startKey = `deck.presenter.start.${deck.config.slug || "deck"}`;
  const [start, setStart] = useState(() => {
    try {
      const saved = Number(sessionStorage.getItem(startKey));
      if (saved > 0) return saved;
      sessionStorage.setItem(startKey, String(Date.now()));
    } catch {
      /* private window: the timer is simply per page load, as before */
    }
    return Date.now();
  });
  /** Reset writes through, or a reload would bring the old start back. */
  const restart = (at: number) => {
    try {
      sessionStorage.setItem(startKey, String(at));
    } catch {
      /* as above */
    }
    setStart(at);
  };
  const [now, setNow] = useState(Date.now());
  const nav = useNav((s) => ({ h: s.h, v: s.v }));
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.floor((now - start) / 1000);
  const total = deck.columns.reduce((n, c) => n + c.slides.length, 0);
  const flat = N.progressOf({ ...N.initialNav(), ...nav }, deck.columns) * (total - 1);
  // Expected elapsed at this slide, from per-slide timings or the total time.
  let expected: number | null = null;
  if (deck.config.totalTime) expected = (deck.config.totalTime / total) * flat;
  else if (deck.config.defaultTiming) {
    let sum = 0;
    let i = 0;
    for (const c of deck.columns)
      for (let v = 0; v < c.slides.length; v++) {
        if (i >= flat) break;
        sum += deck.options.get(navKey(c.h, v))?.timing ?? deck.config.defaultTiming;
        i++;
      }
    expected = sum;
  }
  const pace = expected === null ? null : elapsed - expected;
  const tone = pace === null ? "" : pace > 30 ? "is-behind" : pace < -30 ? "is-ahead" : "is-ok";
  return (
    <button
      type="button"
      className={["deck-presenter-timer", tone].join(" ")}
      onClick={() => restart(Date.now())}
      title="Click to reset"
    >
      {pad(Math.floor(elapsed / 3600))}:{pad(Math.floor((elapsed % 3600) / 60))}:{pad(elapsed % 60)}
      {pace !== null ? (
        <small>{pace > 0 ? `+${Math.round(pace / 60)}m` : `${Math.round(pace / 60)}m`}</small>
      ) : null}
    </button>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="deck-presenter-clock">
      {pad(now.getHours())}:{pad(now.getMinutes())}
    </span>
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
  const started = useStore(live?.client.state ?? noStore, (s) => (s ? s.startedAt : null));
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [camera, setCamera] = useState(false);
  const toggle = (key: "drawing" | "pointer" | "spotlight") =>
    deck.ui.update((s) => ({ ...s, [key]: !s[key] }));
  const record = async () => {
    if (rec) {
      rec.stop();
      setRec(null);
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      let mic: MediaStream | null = null;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        mic = null;
      }
      const tracks = [
        ...screen.getVideoTracks(),
        ...screen.getAudioTracks(),
        ...(mic?.getAudioTracks() ?? []),
      ];
      const stream = new MediaStream(tracks);
      const r = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        for (const t of tracks) t.stop();
        const blob = new Blob(chunks, { type: "video/webm" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${deck.config.slug || "deck"}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.webm`;
        a.click();
      };
      r.start(1000);
      setRec(r);
    } catch {
      actions.toast("Recording was not allowed");
    }
  };
  return (
    <div className="deck-presenter-tools" role="toolbar">
      <ThemeMenu compact />
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
          <button
            type="button"
            className={started ? "is-on" : ""}
            onClick={() => live.client.send({ type: "session", action: started ? "end" : "start" })}
            title="Mark the session for the stats"
          >
            <Icon name={started ? "radio" : "play"} /> {started ? "Live" : "Start session"}
          </button>
        </>
      ) : null}
      <button
        type="button"
        className={ui.projectorOpen ? "is-on" : ""}
        onClick={() => actions.toggleProjector()}
        title="A window showing nothing but this deck, following you — share THAT window on a call"
      >
        <Icon name="projector" /> Share window
      </button>
      <button
        type="button"
        className={camera ? "is-on" : ""}
        onClick={() => setCamera((c) => !c)}
        title="Camera view"
      >
        <Icon name="video" /> Camera
      </button>
      <button
        type="button"
        className={rec ? "is-on is-rec" : ""}
        onClick={record}
        title="Record the screen"
      >
        <Icon name={rec ? "square" : "circle"} /> {rec ? "Stop" : "Record"}
      </button>
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
      <a
        className="deck-presenter-link"
        href={`${deck.base}stats`}
        target="_blank"
        rel="noreferrer"
      >
        <Icon name="chart-column" /> Stats
      </a>
      {camera ? <CameraView onClose={() => setCamera(false)} /> : null}
    </div>
  );
}

import { createStore } from "../core/store.ts";
const noStore = createStore<null>(null);

/** A draggable camera window (Slidev's camera view), for recording with a face. */
function CameraView({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [pos, setPos] = useState({ x: 24, y: 80 });
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => onClose());
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [onClose]);
  const drag = (e: React.PointerEvent) => {
    const start = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const move = (ev: PointerEvent) => setPos({ x: ev.clientX - start.x, y: ev.clientY - start.y });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="deck-camera" style={{ left: pos.x, top: pos.y }} onPointerDown={drag}>
      <video ref={video} autoPlay muted playsInline />
      <button type="button" onClick={onClose} aria-label="Close camera">
        ×
      </button>
    </div>
  );
}

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

/** The room: join code, who is watching, pace, questions, the polls and quizzes on the deck. */
function RoomPanel({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const live = useLiveOptional();
  const status = useRoomStatus();
  const state = useStore(live?.client.state ?? noStore, (s) => s);
  const [tab, setTab] = useState<"room" | "questions" | "polls">("room");
  if (!live) {
    return (
      <div className="deck-room-panel">
        <p className="deck-muted">
          This deck is not connected to a host, so there is no live room. Presenting still works on
          this screen.
        </p>
      </div>
    );
  }
  const questions = [...(state?.questions ?? [])].sort(
    (a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes,
  );
  // What the badges count: hands up, questions still open, polls and quizzes still taking votes.
  const counts = {
    room: state?.presence.hands ?? 0,
    questions: questions.filter((q) => !q.answered).length,
    polls:
      Object.values(state?.polls ?? {}).filter((p) => p.open).length +
      Object.values(state?.quizzes ?? {}).filter((q) => q.open).length,
  };
  const icons = { room: "users", questions: "message-square", polls: "chart-bar" } as const;
  if (!open) {
    return (
      <div className="deck-room-panel is-rail">
        <button
          type="button"
          className="deck-room-toggle"
          onClick={() => setOpen(true)}
          title="Open the room panel"
          aria-label="Open the room panel"
        >
          <Icon name="panel-right-open" />
        </button>
        {(["room", "questions", "polls"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={["deck-room-rail-item", tab === t ? "is-on" : ""].join(" ")}
            onClick={() => {
              setTab(t);
              setOpen(true);
            }}
            title={`${t[0]!.toUpperCase()}${t.slice(1)}${counts[t] ? ` · ${counts[t]}` : ""}`}
            aria-label={t}
          >
            <Icon name={icons[t]} />
            {counts[t] ? <em>{counts[t]}</em> : null}
          </button>
        ))}
        <span className={["deck-room-dot", `is-${status}`].join(" ")} title={status} />
      </div>
    );
  }
  return (
    <div className="deck-room-panel">
      <div className="deck-room-tabs">
        {(["room", "questions", "polls"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "is-on" : ""}
            onClick={() => setTab(t)}
          >
            {t}
            {counts[t] ? <em>{counts[t]}</em> : null}
          </button>
        ))}
        <span className={["deck-room-status", `is-${status}`].join(" ")}>{status}</span>
        <button
          type="button"
          className="deck-room-toggle"
          onClick={() => setOpen(false)}
          title="Collapse the room panel"
          aria-label="Collapse the room panel"
        >
          <Icon name="panel-right-close" />
        </button>
      </div>
      {tab === "room" ? (
        <div className="deck-room-body">
          <QrJoin size={160} caption="" />
          <Presence />
          <Pace />
          <ReactionTotals totals={state?.reactions ?? {}} />
        </div>
      ) : null}
      {tab === "questions" ? (
        <ul className="deck-room-questions">
          {questions.length ? (
            questions.map((q) => (
              <li key={q.id} className={q.answered ? "is-answered" : ""}>
                <span className="deck-question-votes">▲ {q.votes}</span>
                <span className="deck-question-text">{q.text}</span>
                <span className="deck-question-actions">
                  <button
                    type="button"
                    onClick={() =>
                      live.client.send({ type: "qa:answered", id: q.id, answered: !q.answered })
                    }
                  >
                    {q.answered ? "reopen" : "answered"}
                  </button>
                  <button
                    type="button"
                    onClick={() => live.client.send({ type: "qa:delete", id: q.id })}
                  >
                    delete
                  </button>
                </span>
              </li>
            ))
          ) : (
            <li className="deck-muted">No questions yet.</li>
          )}
        </ul>
      ) : null}
      {tab === "polls" ? (
        <ul className="deck-room-polls">
          {[
            ...Object.values(state?.polls ?? {}).map((p) => ({
              kind: "poll" as const,
              id: p.def.id,
              q: p.def.question,
              open: p.open,
              n: p.total,
            })),
            ...Object.values(state?.quizzes ?? {}).map((q) => ({
              kind: "quiz" as const,
              id: q.def.id,
              q: q.def.question,
              open: q.open,
              n: q.counts.reduce((a, b) => a + b, 0),
            })),
          ].map((p) => (
            <li key={`${p.kind}:${p.id}`}>
              <span className="deck-poll-kind">{p.kind}</span>
              <span className="deck-question-text">{p.q}</span>
              <span className="deck-muted">{p.n}</span>
              <button
                type="button"
                onClick={() =>
                  live.client.send(
                    p.kind === "poll"
                      ? { type: "poll:open", id: p.id, open: !p.open }
                      : { type: "quiz:open", id: p.id, open: !p.open },
                  )
                }
              >
                {p.open ? "close" : "open"}
              </button>
            </li>
          ))}
          {!Object.keys(state?.polls ?? {}).length && !Object.keys(state?.quizzes ?? {}).length ? (
            <li className="deck-muted">Polls and quizzes register when their slide is shown.</li>
          ) : null}
        </ul>
      ) : null}
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

export function NotesPage() {
  const deck = useDeck();
  return (
    <div className="deck-notes-page">
      <h1>{deck.config.title} — notes</h1>
      {deck.columns.flatMap((c) =>
        c.slides.map((meta, v) => (
          <NotesEntry
            key={`${c.h},${v}`}
            meta={meta}
            label={`${c.h + 1}${v ? `.${v + 1}` : ""}`}
            href={`${deck.base}#/${c.h}${v ? `/${v}` : ""}`}
          />
        )),
      )}
    </div>
  );
}

function NotesEntry({
  meta,
  label,
  href,
}: {
  meta: { title: string | null; loadNotes: (() => Promise<{ default: ComponentType }>) | null };
  label: string;
  href: string;
}) {
  const [Notes, setNotes] = useState<ComponentType | null>(null);
  useEffect(() => {
    let alive = true;
    meta.loadNotes?.().then((m) => alive && setNotes(() => m.default));
    return () => {
      alive = false;
    };
  }, [meta]);
  return (
    <section className="deck-notes-entry">
      <h2>
        <a href={href}>
          {label} {meta.title ?? ""}
        </a>
      </h2>
      {Notes ? <Notes /> : <p className="deck-muted">—</p>}
    </section>
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
  useEffect(() => {
    if (!api) return;
    fetch(`${api}/decks/${encodeURIComponent(roomIdOf(deck.config))}/stats`, {
      credentials: "include",
    })
      .then(async (r) =>
        r.ok
          ? setStats((await r.json()) as Stats)
          : setError(
              r.status === 401
                ? "Sign in on the presenter page first."
                : `The host answered ${r.status}.`,
            ),
      )
      .catch((e: unknown) => setError(String(e)));
  }, [api, deck.config]);
  if (!api)
    return <div className="deck-stats-page">This deck has no host, so there are no stats.</div>;
  if (error) return <div className="deck-stats-page">{error}</div>;
  if (!stats) return <div className="deck-stats-page">Loading…</div>;
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
