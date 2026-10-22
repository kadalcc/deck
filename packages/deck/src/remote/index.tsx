import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "../components/bling.tsx";
import { roomIdOf } from "../core/model.ts";
import { key as navKey } from "../core/navigation.ts";
import { readItem, writeItem } from "../core/storage.ts";
import { useStore } from "../core/store.ts";
import { createSwipeTracker } from "../core/touch.ts";
import { type ShapeKind, shapePoints } from "../draw/shapes.ts";
import type { RemoteState } from "../live/protocol.ts";
import { presenterTicket, splitFromHash } from "../live/ticket.ts";
import { BackgroundLayer } from "../react/Backgrounds.tsx";
import { useDeck } from "../react/context.ts";
import { Listbox } from "../react/Listbox.tsx";
import { useFit } from "../react/fit.ts";
import { currentPart, splitNotes } from "../core/notes-markers.ts";
import { formatClock, fromRemote, readTimer } from "../core/timer.ts";
import { expectedElapsed, formatElapsed, formatPace, paceTone } from "../react/pacing.ts";
import { SlideFrame } from "../react/SlideFrame.tsx";
import {
  type Aim,
  createCoalescer,
  createOneEuro,
  orientationToPoint,
  readOrientation,
} from "./air.ts";
import { devRemote, hasLease, type RemoteLink, roomRemote } from "./link.ts";
import { pageRelay } from "./socket.ts";

export { RemoteHost, remoteState } from "./host.tsx";
export { RemoteMirror, FORWARDED } from "./mirror.ts";
export { createRelay, type Relay, type RelayIn, type RelayOut, type RelayPeer } from "./relay.ts";
export {
  createSocketRelay,
  pageRelay,
  relayAddress,
  relayChoice,
  RELAY_PARAM,
  type SocketRelay,
} from "./socket.ts";
export {
  createCoalescer,
  createOneEuro,
  notesSegment,
  orientationToPoint,
  readOrientation,
  wrapDegrees,
} from "./air.ts";
export type { HostLink, RemoteLink, RemoteStatus } from "./link.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PHONE REMOTE  —  /<slug>/remote
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A phone that drives the presenter view: next and back, blackout, the focus labels, an overview
 * to jump from, the pen, zoom, a laser aimed by touch on a live copy of the slide or by moving the
 * phone (the "air pointer"), the notes for this step, the timer with pacing, a buzz at the times
 * you choose, and the screen kept awake. Everything it does is a command run IN the presenting
 * window (core/commands.ts), so it can do exactly what the keyboard can and nothing more.
 *
 * It is the deck app itself, so the slide it shows is rendered by the deck's own components —
 * what the room sees, not a picture of it. Paired by the presenter view's "Phone remote" QR, which
 * holds a one-time code (`remote#pair=…` on a hosted deck — the fragment never reaches a server —
 * and `remote?pair=CODE` on `kadal-deck dev` or a `kadal-deck relay`, with `&relay=…` when the
 * presenter view was pointed at one by its address); after that the lease the room gave it brings it
 * back, so a reload or a dropped connection needs no new scan. One phone at a time: a newer phone
 * scanning takes over, and this one says so.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function RemotePage() {
  const deck = useDeck();
  const [{ hashPair, searchPair }, setCodes] = useState(takePairCode);
  // A code arriving in the fragment of a page already open here (a link opened in the same tab).
  useEffect(() => {
    const onHash = () => {
      if (!/[#&]pair=/.test(window.location.hash)) return;
      taken = null;
      setCodes(takePairCode());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const ticket = useStore(presenterTicket);
  const api = deck.config.live.api;
  // The dev server's relay, or a `kadal-deck relay` the address or the deck names (socket.ts).
  const [relay] = useState(() => pageRelay(deck.manifest.relay, deck.config)?.relay ?? null);
  const room = roomIdOf(deck.config);
  const devPlace = `dev.${room}`;
  const pairable =
    !!(api && (hashPair || ticket || hasLease(room))) ||
    !!(relay && (searchPair || hasLease(devPlace)));
  // Made in an effect: what opens the socket closes it (StrictMode mounts twice in dev).
  const [link, setLink] = useState<RemoteLink | null>(null);
  useEffect(() => {
    let made: RemoteLink | null = null;
    if (api && (hashPair || ticket || hasLease(room)))
      made = roomRemote({ api, room, pair: hashPair, ticket: hashPair ? null : ticket });
    else if (relay && (searchPair || hasLease(devPlace)))
      made = devRemote(relay, searchPair?.toUpperCase() ?? null, devPlace);
    setLink(made);
    return () => {
      made?.close();
      setLink(null);
    };
  }, [api, ticket, hashPair, searchPair, relay, room, devPlace]);
  useWakeLock();
  return (
    <div className="deck-remote">
      {link ? (
        <Console link={link} />
      ) : pairable ? null : (
        <Instructions pair={searchPair} hosted={!!api} dev={!!relay} />
      )}
    </div>
  );
}

let taken: { hashPair: string | null; searchPair: string | null } | null = null;

/**
 * The pairing code this page was opened with, read ONCE and taken out of the address bar: it works
 * once, so a reload must come back with the lease instead, and a code left in the URL would only
 * fail. (Module state, not component state: StrictMode runs initialisers twice.)
 */
function takePairCode(): { hashPair: string | null; searchPair: string | null } {
  if (taken) return taken;
  if (typeof window === "undefined") return { hashPair: null, searchPair: null };
  const { value: hashPair, hash } = splitFromHash(window.location.hash, "pair");
  const search = new URLSearchParams(window.location.search);
  const searchPair = search.get("pair");
  search.delete("pair");
  const query = search.toString();
  try {
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${query ? `?${query}` : ""}${hash}`,
    );
  } catch {
    /* the code stays in the address bar; it has been used by then */
  }
  taken = { hashPair, searchPair };
  return taken;
}

function Instructions({
  pair,
  hosted,
  dev,
}: {
  pair: string | null;
  hosted: boolean;
  dev: boolean;
}) {
  const deck = useDeck();
  return (
    <div className="deck-remote-instructions">
      <Icon name="smartphone" size={40} />
      <h1>{deck.config.title}</h1>
      <h2>Phone remote</h2>
      {pair && !dev ? (
        <p>
          This pairing code is for a deck running on <code>kadal-deck dev</code> or a{" "}
          <code>kadal-deck relay</code>, and this page knows neither. Scan the QR on the presenter
          view again.
        </p>
      ) : (
        <>
          <p>This page becomes a remote once it is paired with the presenting screen:</p>
          <ol>
            <li>
              Open the presenter view on your computer
              {hosted
                ? " (from your host's dashboard, or press S on the deck)"
                : " (press S on the deck)"}
              .
            </li>
            <li>
              Press <b>Phone remote</b> in its toolbar.
            </li>
            <li>Scan the QR with this phone's camera.</li>
          </ol>
          {!hosted && !dev ? (
            <p className="deck-remote-muted">
              This deck has no room, so a phone can reach it only while it runs on{" "}
              <code>kadal-deck dev --host</code>, or through a <code>kadal-deck relay</code> the
              deck names (<code>remote.relay</code>).
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

// ── settings ────────────────────────────────────────────────────────────────

interface Settings {
  /** Degrees of turn from the slide's centre to its edge. */
  range: number;
  haptics: boolean;
  /** Minutes into the talk to buzz at, "20, 25". */
  warn: string;
  notes: number;
  point: "laser" | "spotlight";
}

function defaults(totalTime: number | null): Settings {
  const total = totalTime ? Math.round(totalTime / 60) : 0;
  return {
    range: 20,
    haptics: true,
    warn: total > 6 ? `${total - 5}, ${total - 1}` : "",
    notes: 18,
    point: "laser",
  };
}

function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const deck = useDeck();
  const key = `deck.remote.${deck.config.slug || "deck"}`;
  const [settings, setSettings] = useState<Settings>(() => {
    const base = defaults(deck.config.totalTime || deck.config.duration || null);
    try {
      return { ...base, ...(JSON.parse(readItem(key) ?? "{}") as Partial<Settings>) };
    } catch {
      return base;
    }
  });
  return [
    settings,
    (patch) =>
      setSettings((s) => {
        const next = { ...s, ...patch };
        writeItem(key, JSON.stringify(next));
        return next;
      }),
  ];
}

function useWakeLock() {
  useEffect(() => {
    type Lock = { release(): Promise<void> };
    let lock: Lock | null = null;
    let alive = true;
    const acquire = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<Lock> } })
          .wakeLock;
        const l = (await wl?.request("screen")) ?? null;
        if (alive) lock = l;
        else void l?.release();
      } catch {
        lock = null;
      }
    };
    void acquire();
    const onVis = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, []);
}

const buzz = (on: boolean, pattern: number | number[] = 8) => {
  if (on && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
};

// ── the console ─────────────────────────────────────────────────────────────

type Mode = "point" | "pen" | "zoom";

/** What the pen draws on the phone: a stroke, a shape dragged out, or the eraser. */
type PenTool = "pen" | ShapeKind | "eraser";
const PEN_TOOLS: { tool: PenTool; icon: string; label: string }[] = [
  { tool: "pen", icon: "pencil", label: "Freehand" },
  { tool: "line", icon: "slash", label: "Line" },
  { tool: "arrow", icon: "move-up-right", label: "Arrow" },
  { tool: "rect", icon: "square", label: "Rectangle" },
  { tool: "ellipse", icon: "circle", label: "Ellipse" },
  { tool: "eraser", icon: "eraser", label: "Eraser" },
];

function Console({ link }: { link: RemoteLink }) {
  const deck = useDeck();
  const status = useStore(link.status);
  const reason = useStore(link.reason);
  const state = useStore(link.state);
  const [settings, set] = useSettings();
  const [mode, setMode] = useState<Mode>("point");
  const [penTool, setPenTool] = useState<PenTool>("pen");
  const [sheet, setSheet] = useState<"overview" | "settings" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const flash = (m: string) => {
    setMessage(m);
    // Long enough to read: a sentence of advice stays up longer than "Done".
    setTimeout(() => setMessage((x) => (x === m ? null : x)), Math.max(2200, m.length * 55));
  };

  // The slide on show follows the presenter's colour scheme and theme, so it looks as theirs does.
  useEffect(() => {
    if (!state) return;
    deck.ui.update((u) =>
      u.colorScheme === state.colorScheme && u.theme === state.theme
        ? u
        : { ...u, colorScheme: state.colorScheme, theme: state.theme },
    );
  }, [state?.colorScheme, state?.theme, deck.ui]);

  /** A tap: run it, tick, and say so if it did not work. */
  const run = (id: string, params?: Record<string, unknown>) => {
    buzz(settings.haptics);
    void link.run(id, params).then((a) => {
      if (!a.ok) flash(a.error ?? "That did not work.");
    });
  };

  if (status === "denied")
    return (
      <div className="deck-remote-instructions">
        <Icon name="unplug" size={40} />
        <h2>
          {reason?.startsWith("Another phone") ? "Another phone is the remote" : "Not paired"}
        </h2>
        <p>{reason ?? "This phone is not paired."}</p>
        <p className="deck-remote-muted">
          To use this phone, press <b>Phone remote</b> on the presenter view and scan the QR again.
        </p>
      </div>
    );

  return (
    <>
      <Header state={state} status={status} settings={settings} run={run} />
      <div className="deck-remote-body">
        <section className="deck-remote-view">
          <MiniSlide
            state={state}
            link={link}
            mode={mode}
            penTool={penTool}
            settings={settings}
            run={run}
          />
          <div className="deck-remote-modes" role="radiogroup" aria-label="What a touch does">
            <ModeButton
              mode="point"
              current={mode}
              set={setMode}
              icon={settings.point === "spotlight" ? "flashlight" : "mouse-pointer-2"}
              label={settings.point === "spotlight" ? "Spotlight" : "Laser"}
              onAgain={() => set({ point: settings.point === "laser" ? "spotlight" : "laser" })}
            />
            <ModeButton mode="pen" current={mode} set={setMode} icon="pencil" label="Pen" />
            <ModeButton mode="zoom" current={mode} set={setMode} icon="zoom-in" label="Zoom" />
          </div>
          <Notes
            state={state}
            size={settings.notes}
            setSize={(notes) => set({ notes })}
            run={run}
          />
        </section>
        <section className="deck-remote-controls">
          {/* Drawing has no use for holding to point, so the pen's Undo and Clear take that place:
              the layout does not change between modes and the notes keep their room. */}
          {mode === "pen" ? (
            <div className="deck-remote-pen">
              <div
                className="deck-remote-pen-shapes"
                role="radiogroup"
                aria-label="What the pen draws"
              >
                {PEN_TOOLS.map((t) => (
                  <button
                    type="button"
                    key={t.tool}
                    role="radio"
                    aria-checked={penTool === t.tool}
                    aria-label={t.label}
                    title={t.label}
                    className={penTool === t.tool ? "is-on" : ""}
                    onClick={() => setPenTool(t.tool)}
                  >
                    <Icon name={t.icon} />
                  </button>
                ))}
              </div>
              <div className="deck-remote-row deck-remote-pen-tools">
                <button type="button" onClick={() => run("draw.undo")}>
                  <Icon name="undo-2" /> Undo
                </button>
                <button type="button" onClick={() => run("draw.redo")}>
                  <Icon name="redo-2" /> Redo
                </button>
                <button type="button" onClick={() => run("draw.clear")}>
                  <Icon name="trash-2" /> Clear
                </button>
              </div>
            </div>
          ) : (
            <AirButton link={link} settings={settings} flash={flash} />
          )}
          <div className="deck-remote-nav">
            <button
              type="button"
              className="deck-remote-prev"
              onClick={() => run("nav.prev")}
              aria-label="Back"
            >
              <Icon name="chevron-left" size={36} />
            </button>
            <button
              type="button"
              className="deck-remote-next"
              onClick={() => run("nav.next")}
              aria-label="Next"
            >
              <Icon name="chevron-right" size={44} />
              <span>Next</span>
            </button>
          </div>
          <div className="deck-remote-tools">
            <button
              type="button"
              className={state?.blackout ? "is-on" : ""}
              aria-pressed={!!state?.blackout}
              onClick={() => run("present.blackout", { on: !state?.blackout })}
            >
              <Icon name="monitor-off" /> Blackout
            </button>
            <button
              type="button"
              className={state?.hints ? "is-on" : ""}
              aria-pressed={!!state?.hints}
              onClick={() => run("view.hints", { on: !state?.hints })}
            >
              <Icon name="scan-text" /> Focus
            </button>
            <button type="button" onClick={() => setSheet("overview")}>
              <Icon name="layout-grid" /> Slides
            </button>
            <button type="button" onClick={() => setSheet("settings")} aria-label="Settings">
              <Icon name="settings-2" />
            </button>
          </div>
        </section>
      </div>
      {sheet === "overview" ? (
        <Overview state={state} run={run} close={() => setSheet(null)} />
      ) : sheet === "settings" ? (
        <SettingsSheet settings={settings} set={set} close={() => setSheet(null)} />
      ) : null}
      <div className="deck-remote-toast" data-on={message ? "true" : undefined} role="status">
        {message}
      </div>
    </>
  );
}

function ModeButton({
  mode,
  current,
  set,
  icon,
  label,
  onAgain,
}: {
  mode: Mode;
  current: Mode;
  set: (m: Mode) => void;
  icon: string;
  label: string;
  /** Pressing the chosen mode again (laser ⇄ spotlight). */
  onAgain?: () => void;
}) {
  const on = mode === current;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      className={on ? "is-on" : ""}
      data-mode={mode}
      onClick={() => (on ? onAgain?.() : set(mode))}
    >
      <Icon name={icon} /> {label}
    </button>
  );
}

const STATUS: Record<string, string> = {
  connecting: "Connecting…",
  open: "Connected",
  waiting: "Waiting for the presenter view",
  closed: "Reconnecting…",
};

function Header({
  state,
  status,
  settings,
  run,
}: {
  state: RemoteState | null;
  status: string;
  settings: Settings;
  run: (id: string, params?: Record<string, unknown>) => void;
}) {
  const deck = useDeck();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  // The presenter's timer as it was sent, counted on from when it ARRIVED (core/timer.ts): paused
  // stays paused, a countdown counts down, and the phone's own clock never matters.
  const timer = useMemo(
    () => (state?.timer ? fromRemote(state.timer, Date.now()) : null),
    [state?.timer],
  );
  const reading = timer ? readTimer(timer, now) : null;
  const elapsed = reading
    ? reading.elapsed
    : state?.startedAt
      ? (now - state.startedAt) / 1000
      : null;
  const expected = state ? expectedElapsed(deck, state.slide) : null;
  const pace = elapsed === null || expected === null ? null : elapsed - expected;

  // The buzz at each chosen minute, once, as the timer passes it.
  const fired = useRef(new Set<number>());
  const [alarm, setAlarm] = useState(false);
  useEffect(() => {
    if (elapsed === null) return;
    const marks = settings.warn
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    for (const m of marks) {
      if (elapsed >= m * 60 && elapsed < m * 60 + 30 && !fired.current.has(m)) {
        fired.current.add(m);
        buzz(true, [220, 120, 220, 120, 420]);
        setAlarm(true);
        setTimeout(() => setAlarm(false), 4000);
      }
    }
  }, [elapsed === null ? null : Math.floor(elapsed), settings.warn]);

  return (
    <header className="deck-remote-header">
      <div className="deck-remote-title">
        <span className={`deck-remote-status is-${status}`} title={STATUS[status] ?? status}>
          <i />
          <span className="deck-remote-status-text">{STATUS[status] ?? status}</span>
        </span>
        <strong>{deck.config.title}</strong>
      </div>
      <div className="deck-remote-meta">
        <span className="deck-remote-count" data-testid="remote-position">
          {state ? `${state.slide.index + 1} / ${state.total}` : "– / –"}
          {state && state.slide.clicks ? (
            <small>
              {" "}
              · step {state.slide.click}/{state.slide.clicks}
            </small>
          ) : null}
        </span>
        <button
          type="button"
          className={[
            "deck-remote-timer",
            paceTone(pace),
            alarm ? "is-alarm" : "",
            reading && !reading.running ? "is-paused" : "",
            reading?.overtime ? "is-overtime" : "",
          ].join(" ")}
          onClick={() => timer && run("present.timer", { action: "toggle" })}
          disabled={!timer}
          aria-label={
            !timer
              ? "Timer"
              : reading!.running
                ? "Pause the presenter's timer"
                : "Resume the presenter's timer"
          }
        >
          {elapsed === null
            ? "--:--:--"
            : reading && timer?.mode === "countdown"
              ? formatClock(reading.shown, reading.overtime)
              : formatElapsed(elapsed)}
          {reading && !reading.running ? <small>paused</small> : null}
          {pace !== null && reading?.running !== false ? <small>{formatPace(pace)}</small> : null}
        </button>
      </div>
      <div className="deck-remote-slide-title">{state?.slide.title ?? " "}</div>
    </header>
  );
}

/** The current slide, live, and the touchpad over it. */
function MiniSlide({
  state,
  link,
  mode,
  penTool = "pen",
  settings,
  run,
}: {
  state: RemoteState | null;
  link: RemoteLink;
  mode: Mode;
  penTool?: PenTool;
  settings: Settings;
  run: (id: string, params?: Record<string, unknown>) => void;
}) {
  const deck = useDeck();
  const { width: W, height: H } = deck.config;
  const box = useRef<HTMLDivElement>(null);
  const pad = useRef<HTMLDivElement>(null);
  const fit = useFit(box, W, H);
  const [dot, setDot] = useState<{ x: number; y: number } | null>(null);
  const [ink, setInk] = useState<[number, number][] | null>(null);
  const laser = useMemo(
    () => createCoalescer<{ x: number; y: number }>((p) => link.fire("present.laserAt", p)),
    [link],
  );
  const pen = useMemo(
    () =>
      createCoalescer<{ x: number; y: number }>((p) =>
        link.fire("draw.pen", { phase: "move", ...p }),
      ),
    [link],
  );
  const touch = useRef<{
    x: number;
    y: number;
    moved: boolean;
    swipe: ReturnType<typeof createSwipeTracker>;
  } | null>(null);
  useEffect(
    () => () => {
      laser.cancel();
      pen.cancel();
    },
    [laser, pen],
  );

  const norm = (e: React.PointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    const c = (n: number) => Math.min(1, Math.max(0, n));
    return { x: c((e.clientX - r.left) / r.width), y: c((e.clientY - r.top) / r.height) };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!state || e.button > 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = norm(e);
    const swipe = createSwipeTracker(60, 450);
    swipe.start(e.clientX, e.clientY, e.timeStamp);
    touch.current = { ...p, moved: false, swipe };
    buzz(settings.haptics, 6);
    if (mode === "point") {
      if (settings.point === "spotlight") link.fire("present.spotlight", { on: true });
      laser.push(p);
      laser.flush();
      setDot(p);
    } else if (mode === "pen") {
      link.fire("draw.pen", {
        phase: "start",
        ...p,
        ...(penTool === "eraser" ? { erase: true } : penTool !== "pen" ? { shape: penTool } : {}),
      });
      if (penTool === "eraser") setDot(p);
      else setInk([[p.x, p.y]]);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const t = touch.current;
    if (!t) return;
    const p = norm(e);
    if (Math.abs(p.x - t.x) + Math.abs(p.y - t.y) > 0.01) t.moved = true;
    if (mode === "point") {
      laser.push(p);
      setDot(p);
    } else if (mode === "pen") {
      pen.push(p);
      if (penTool === "eraser") setDot(p);
      else if (penTool === "pen") setInk((pts) => (pts ? [...pts, [p.x, p.y]] : pts));
      else {
        // The shape as it will land: drawn in slide pixels (so an arrowhead keeps its angle), shown in 0..1.
        const pts = shapePoints(penTool, [t.x * W, t.y * H], [p.x * W, p.y * H], 8);
        setInk(pts.map(([x, y]) => [x / W, y / H]));
      }
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const t = touch.current;
    if (!t) return;
    touch.current = null;
    const p = norm(e);
    const dir = t.swipe.end(e.clientX, e.clientY, e.timeStamp);
    if (mode === "point") {
      laser.cancel();
      link.fire("present.laserOff");
      setDot(null);
      if (dir === "left") run("nav.next");
      else if (dir === "right") run("nav.prev");
    } else if (mode === "pen") {
      pen.flush();
      link.fire("draw.pen", { phase: "end", ...p });
      setInk(null);
      setDot(null);
    } else if (mode === "zoom" && !t.moved) {
      run(state?.zoomed ? "view.zoomOut" : "view.zoom", state?.zoomed ? {} : p);
    } else if (mode === "zoom" && dir) {
      if (dir === "left") run("nav.next");
      else if (dir === "right") run("nav.prev");
    }
  };

  const meta = state ? deck.columns[state.slide.h]?.slides[state.slide.v] : null;
  const options = state ? deck.options.get(navKey(state.slide.h, state.slide.v)) : null;
  return (
    <div
      ref={box}
      className="deck-remote-stage"
      data-mode={mode}
      style={{ aspectRatio: `${W} / ${H}`, ["--remote-ratio" as string]: W / H }}
    >
      {meta && options && state ? (
        <div
          className="deck-remote-canvas"
          style={{
            width: W,
            height: H,
            transform: `translate(${fit.left}px, ${fit.top}px) scale(${fit.scale})`,
          }}
          aria-hidden
        >
          <BackgroundLayer bg={options.background} active={false} />
          <SlideFrame
            key={`${state.slide.h},${state.slide.v}`}
            meta={meta}
            options={options}
            h={state.slide.h}
            v={state.slide.v}
            active={false}
            click={state.slide.click}
            preview
            className="is-mirror"
          />
        </div>
      ) : (
        <div className="deck-remote-empty">{state ? "" : "Waiting for the presenter view…"}</div>
      )}
      <div
        ref={pad}
        className="deck-remote-pad"
        style={{ left: fit.left, top: fit.top, width: W * fit.scale, height: H * fit.scale }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-label={
          mode === "pen" ? "Draw on the slide" : mode === "zoom" ? "Tap to zoom" : "Touch to point"
        }
      >
        {dot ? (
          <span
            className="deck-remote-dot"
            style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }}
          />
        ) : null}
        {ink && ink.length > 1 ? (
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="deck-remote-ink">
            <polyline points={ink.map(([x, y]) => `${x},${y}`).join(" ")} />
          </svg>
        ) : null}
      </div>
      {state?.blackout ? <div className="deck-remote-blackout">Blacked out</div> : null}
    </div>
  );
}

type MotionAccess = "unknown" | "granted" | "denied";

/** iOS's gate on the motion sensors: present only where the page must ask (Safari, and every iOS browser). */
function motionGate(): (() => Promise<string>) | null {
  if (typeof window === "undefined") return null;
  const DOE = (
    window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }
  ).DeviceOrientationEvent;
  return typeof DOE?.requestPermission === "function" ? DOE.requestPermission.bind(DOE) : null;
}

/** Motion access this page already has: no gate, or the gate was opened before (events arrive). */
function useMotionAccess(): [MotionAccess, (a: MotionAccess) => void] {
  const [access, setAccess] = useState<MotionAccess>(() => (motionGate() ? "unknown" : "granted"));
  useEffect(() => {
    if (access !== "unknown") return;
    // Allowed earlier in this browser: iOS sends events without asking again, so one arriving
    // means there is nothing to ask.
    const heard = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null || e.beta !== null) setAccess("granted");
    };
    window.addEventListener("deviceorientation", heard);
    return () => window.removeEventListener("deviceorientation", heard);
  }, [access]);
  return [access, setAccess];
}

/**
 * THE AIR POINTER: hold the button, point the phone. The aim when the button goes down is the
 * slide's centre; turning `range` degrees reaches an edge. Orientation events or, where the
 * Generic Sensor API has one, the gyroscope — whichever speaks first — through a One Euro filter,
 * sent at most 30 times a second.
 *
 * iOS shows its "Allow motion and orientation" prompt only from a TAP (a click), never from the
 * press that starts a hold — asked there, it refuses without showing anything. So on iOS the button
 * first asks for one tap to allow motion, then works as a hold.
 */
function AirButton({
  link,
  settings,
  flash,
}: {
  link: RemoteLink;
  settings: Settings;
  flash: (m: string) => void;
}) {
  const [holding, setHolding] = useState(false);
  const secure = typeof window !== "undefined" && window.isSecureContext;
  const supported = typeof window !== "undefined" && "DeviceOrientationEvent" in window;
  const session = useRef<null | (() => void)>(null);
  const [access, setAccess] = useMotionAccess();
  const gate = motionGate();

  const pressed = useRef(false);
  const stop = () => {
    pressed.current = false;
    session.current?.();
    session.current = null;
    setHolding(false);
  };
  useEffect(() => stop, []);

  /** The tap that opens iOS's gate: requestPermission straight from the click, nothing awaited first. */
  const allow = () => {
    if (!gate) return setAccess("granted");
    buzz(settings.haptics, 10);
    gate().then(
      (answer) => {
        if (answer === "granted") {
          setAccess("granted");
          flash("Motion on. Now hold the button and move the phone.");
        } else {
          setAccess("denied");
          flash(MOTION_REFUSED);
        }
      },
      () => {
        // Not shown at all (iOS wants a tap) — leave it to be asked again.
        flash("Tap the button once more to allow motion.");
      },
    );
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (session.current) return;
    pressed.current = true;
    buzz(settings.haptics, 10);
    const fx = createOneEuro();
    const fy = createOneEuro();
    const out = createCoalescer<{ x: number; y: number }>((p) => link.fire("present.laserAt", p));
    let center: Aim | null = null;
    let gyroAim: Aim | null = null;
    const aimAt = (aim: Aim, t: number) => {
      center ??= aim;
      const p = orientationToPoint(center, aim, settings.range);
      out.push({ x: fx.filter(p.x, t), y: fy.filter(p.y, t) });
    };
    const onOrientation = (ev: DeviceOrientationEvent) => {
      if (gyroAim) return; // the gyroscope is speaking; it is the better of the two
      const angle = screen.orientation?.angle ?? 0;
      const aim = readOrientation(ev, angle);
      if (aim) aimAt(aim, ev.timeStamp || performance.now());
    };
    window.addEventListener("deviceorientation", onOrientation);
    // The bonus: a gyroscope's turn rates, added up — no compass, so nothing to swing near magnets.
    let gyro: {
      start(): void;
      stop(): void;
      x?: number | null;
      z?: number | null;
      addEventListener(t: string, fn: () => void): void;
    } | null = null;
    const Gyro = (
      window as unknown as { Gyroscope?: new (o: { frequency: number }) => typeof gyro }
    ).Gyroscope;
    if (Gyro && secure) {
      try {
        gyro = new Gyro({ frequency: 60 });
        let last = 0;
        gyro!.addEventListener("reading", () => {
          const t = performance.now();
          const dt = last ? (t - last) / 1000 : 0;
          last = t;
          const deg = 180 / Math.PI;
          gyroAim ??= { yaw: 0, pitch: 0 };
          gyroAim = {
            yaw: gyroAim.yaw + (gyro!.z ?? 0) * dt * deg,
            pitch: gyroAim.pitch + (gyro!.x ?? 0) * dt * deg,
          };
          if (!dt) center = gyroAim;
          aimAt(gyroAim, t);
        });
        gyro!.addEventListener("error", () => {
          gyro = null;
          gyroAim = null;
        });
        gyro!.start();
      } catch {
        gyro = null;
      }
    }
    if (settings.point === "spotlight") link.fire("present.spotlight", { on: true });
    session.current = () => {
      window.removeEventListener("deviceorientation", onOrientation);
      try {
        gyro?.stop();
      } catch {
        /* already */
      }
      out.cancel();
      link.fire("present.laserOff");
    };
    setHolding(true);
  };

  const off = !supported || !secure;
  if (!off && access !== "granted")
    return (
      <button
        type="button"
        className="deck-remote-air is-ask"
        onClick={access === "denied" ? () => flash(MOTION_REFUSED) : allow}
        data-motion={access}
      >
        <Icon name="smartphone" size={22} />
        <span>
          {access === "denied"
            ? "Motion is off for this site — touch the slide to point"
            : "Tap to allow motion · then hold to point"}
        </span>
      </button>
    );
  return (
    <button
      type="button"
      className={["deck-remote-air", holding ? "is-on" : ""].join(" ")}
      disabled={off}
      onPointerDown={off ? undefined : start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      data-holding={holding ? "true" : undefined}
    >
      <Icon name={settings.point === "spotlight" ? "flashlight" : "wand-sparkles"} size={22} />
      <span>
        {off
          ? !secure
            ? "Air pointer needs HTTPS — touch the slide to point"
            : "No motion sensor — touch the slide to point"
          : holding
            ? "Pointing — move the phone"
            : `Hold to ${settings.point === "spotlight" ? "spotlight" : "point"} · move the phone`}
      </span>
    </button>
  );
}

/** iOS keeps a "Don't Allow" until Safari starts again; this says how to get the prompt back. */
const MOTION_REFUSED =
  "Motion was not allowed. To ask again, close Safari completely (swipe it away), reopen the remote and tap Allow. Until then, touch the slide to point.";

/**
 * The notes on the phone: every part of this slide's notes, the current step's marked and kept in
 * view, the ones already said dimmed. Tapping a part takes the deck to its step.
 */
function Notes({
  state,
  size,
  setSize,
  run,
}: {
  state: RemoteState | null;
  size: number;
  setSize: (n: number) => void;
  run: (id: string, params?: Record<string, unknown>) => void;
}) {
  const deck = useDeck();
  const meta = state ? deck.columns[state.slide.h]?.slides[state.slide.v] : null;
  const click = state?.slide.click ?? 0;
  const parts = useMemo(
    () =>
      meta?.notesText
        ? splitNotes(meta.notesText)
            .map((p, i) => ({ ...p, i, text: p.text.trim() }))
            .filter((p) => p.text)
        : [],
    [meta?.notesText],
  );
  const now = currentPart(
    parts.map((p) => p.click),
    click,
  );
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(".is-current");
    const scroller = box.current?.closest<HTMLElement>(".deck-remote-notes");
    if (!el || !scroller || scroller.scrollHeight <= scroller.clientHeight) return;
    const top =
      el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top: Math.max(0, top - 36), behavior: "smooth" });
  }, [now, meta]);
  return (
    <div className="deck-remote-notes">
      <div className="deck-remote-notes-tools">
        <span>Notes{state && state.slide.clicks ? ` · step ${state.slide.click}` : ""}</span>
        <button
          type="button"
          onClick={() => setSize(Math.max(12, size - 2))}
          aria-label="Smaller notes"
        >
          A−
        </button>
        <button
          type="button"
          onClick={() => setSize(Math.min(40, size + 2))}
          aria-label="Larger notes"
        >
          A+
        </button>
      </div>
      <div ref={box} className="deck-remote-notes-parts" style={{ fontSize: size }}>
        {parts.length ? (
          parts.map((p, k) => {
            const tone = k === now ? "is-current" : p.click <= click ? "is-past" : "is-future";
            const go = () => state && run("nav.goto", { index: state.slide.index, click: p.click });
            // A paragraph that acts as a button: the notes scroll, and a real button is held to
            // fitting on screen whole.
            return parts.length > 1 && state ? (
              <p
                key={p.i}
                role="button"
                tabIndex={0}
                className={`deck-remote-note-part ${tone}`}
                onClick={go}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go())
                }
                aria-label={`Go to step ${p.click}: ${p.text}`}
              >
                {p.click > 0 ? <b aria-hidden>{p.click}</b> : null}
                {p.text}
              </p>
            ) : (
              <p key={p.i} className="deck-remote-note-part is-current">
                {p.text}
              </p>
            );
          })
        ) : (
          <p className="deck-remote-muted">
            {meta?.hasNotes ? "No note for this step." : "No notes for this slide."}
          </p>
        )}
      </div>
    </div>
  );
}

function Overview({
  state,
  run,
  close,
}: {
  state: RemoteState | null;
  run: (id: string, params?: Record<string, unknown>) => void;
  close: () => void;
}) {
  const deck = useDeck();
  const all = deck.columns.flatMap((c) => c.slides);
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => current.current?.scrollIntoView({ block: "center" }), []);
  return (
    <div className="deck-remote-sheet" role="dialog" aria-label="Slides">
      <header>
        <strong>Slides</strong>
        <button
          type="button"
          className={state?.overview ? "is-on" : ""}
          onClick={() => run("view.overview", { on: !state?.overview })}
        >
          <Icon name="layout-grid" /> {state?.overview ? "Hide" : "Show"} on screen
        </button>
        <button type="button" onClick={close} aria-label="Close">
          <Icon name="x" />
        </button>
      </header>
      <ol>
        {all.map((s, index) => {
          const here = state?.slide.index === index;
          return (
            <li key={index}>
              <button
                type="button"
                ref={here ? current : undefined}
                className={here ? "is-on" : ""}
                onClick={() => {
                  run("nav.goto", { index });
                  close();
                }}
              >
                <b>{index + 1}</b> {s.title ?? `Slide ${index + 1}`}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SettingsSheet({
  settings,
  set,
  close,
}: {
  settings: Settings;
  set: (patch: Partial<Settings>) => void;
  close: () => void;
}) {
  return (
    <div className="deck-remote-sheet" role="dialog" aria-label="Settings">
      <header>
        <strong>Settings</strong>
        <button type="button" onClick={close} aria-label="Close">
          <Icon name="x" />
        </button>
      </header>
      <label>
        <span>
          Air pointer reach: <b>±{settings.range}°</b> to the edge
        </span>
        <input
          type="range"
          min={8}
          max={45}
          step={1}
          value={settings.range}
          onChange={(e) => set({ range: Number(e.target.value) })}
        />
      </label>
      <div className="deck-remote-field">
        <span>Pointer</span>
        <Listbox
          label="Pointer"
          value={settings.point}
          onChange={(point) => set({ point })}
          groups={[
            {
              options: [
                { value: "laser", label: "Laser dot", detail: "a red point" },
                { value: "spotlight", label: "Spotlight", detail: "dims the rest" },
              ],
            },
          ]}
        />
      </div>
      <label>
        <span>Buzz at (minutes into the talk)</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="e.g. 15, 19"
          value={settings.warn}
          onChange={(e) => set({ warn: e.target.value })}
        />
      </label>
      <label className="deck-remote-check">
        <input
          type="checkbox"
          checked={settings.haptics}
          onChange={(e) => set({ haptics: e.target.checked })}
        />
        <span>Tick on every press</span>
      </label>
      <p className="deck-remote-muted">
        The air pointer needs a secure page (https) for the phone's motion sensors; on plain http,
        touch the slide to point.
      </p>
    </div>
  );
}
