import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useStore } from "../core/store.ts";
import { key as navKey } from "../core/navigation.ts";
import * as N from "../core/navigation.ts";
import { DrawingLayer } from "../draw/DrawingLayer.tsx";
import { roomIdOf } from "../core/model.ts";
import { type DeckRuntime, useDeck } from "../react/context.ts";
import { Icon } from "../components/bling.tsx";
import { useActions, useLayout, useNav, useUi } from "../react/hooks.ts";
import { closeTerm, openTerm } from "../react/terms.ts";
import { Analytics } from "./analytics.tsx";
import { RoomClient, viewerId } from "./client.ts";
import { turnstileToken } from "./turnstile.ts";
import { LiveContext, type LiveValue, useLiveOptional } from "./context.ts";
import type { ServerMessage } from "./protocol.ts";

/**
 * Put `<LiveProvider />` inside `<Deck>` and the deck joins its room: the presenter window pushes
 * its position, pointer and drawings; the play window and the audience follow (or explore, then
 * catch up); reactions float up on every screen; questions and polls flow both ways. Without a
 * backend the provider stays quiet and the deck works exactly as before.
 */
export function LiveProvider({ children }: { children?: ReactNode }) {
  const deck = useDeck();
  const api = deck.config.live.api;
  const room = roomIdOf(deck.config);
  const value = useMemo<LiveValue | null>(() => {
    if (!api || deck.mode === "print") return null;
    const siteKey = deck.config.live.turnstile;
    const client = new RoomClient({
      api,
      room,
      role: deck.mode === "presenter" ? "presenter" : "viewer",
      viewer: viewerId(),
      token: siteKey && deck.mode !== "presenter" ? () => turnstileToken(siteKey) : undefined,
    });
    const joinUrl =
      typeof window === "undefined" ? "" : `${window.location.origin}${deck.base}join`;
    return { client, joinUrl };
  }, [api, room, deck.mode, deck.base, deck.config.live.turnstile]);

  useEffect(() => {
    if (!value) return;
    value.client.connect();
    return () => value.client.close();
  }, [value]);

  if (!value) return <>{children}</>;
  return (
    <LiveContext.Provider value={value}>
      {children}
      <Analytics />
      <Wiring />
      {deck.mode === "play" ? (
        <>
          <DrawingLayer />
          <PointerLayer />
          <ReactionsOverlay />
          <FollowControl />
        </>
      ) : null}
      {deck.mode === "presenter" ? <ReactionsOverlay /> : null}
    </LiveContext.Provider>
  );
}

/** Nav in, nav out, presence, blackout. */
function Wiring() {
  const deck = useDeck();
  const live = useLiveOptional()!;
  const role = useStore(live.client.role);
  const follow = useNav((s) => s.follow);

  // Presenter: publish every move — coalesced, so a held key sends at most a dozen a second and
  // the last position always goes out (the room drops what comes faster than its limit, and a
  // dropped final position leaves the audience on the wrong slide). Viewer: report presence.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sentAt = 0;
    let pending: { h: number; v: number; click: number } | null = null;
    const flush = () => {
      timer = null;
      if (!pending) return;
      sentAt = Date.now();
      live.client.send({ type: "nav", position: pending });
      pending = null;
    };
    const unsub = deck.nav.subscribe((s, prev) => {
      live.client.position = { h: s.h, v: s.v, click: s.click };
      if (s.h === prev.h && s.v === prev.v && s.click === prev.click) return;
      // A position this window only applied from the room is the room's already.
      if (deck.sync.source === "room") return;
      if (role === "presenter") {
        pending = { h: s.h, v: s.v, click: s.click };
        const wait = 80 - (Date.now() - sentAt);
        if (wait <= 0) flush();
        else if (!timer) timer = setTimeout(flush, wait);
      } else live.client.send({ type: "presence", slide: navKey(s.h, s.v) });
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
      flush();
    };
  }, [deck.nav, deck.sync, live.client, role]);

  useEffect(() => {
    if (role === "presenter") return;
    const apply = (m: ServerMessage) => {
      if (m.type === "welcome" || m.type === "nav") {
        const p = m.type === "welcome" ? m.state.position : m.position;
        // A stale position with nobody presenting is not something to follow: on (re)connect,
        // only move when a presenter is actually in the room. Live `nav` always comes from one.
        const presenting = m.type === "nav" || m.state.presence.presenter;
        deck.sync.source = "room";
        try {
          deck.nav.update((s) => {
            const next = { ...s, presenter: p };
            if (!s.follow || !presenting) return next;
            return N.goto(next, deck.columns, p);
          });
        } finally {
          deck.sync.source = null;
        }
      }
    };
    return live.client.on(apply);
  }, [deck.nav, deck.columns, deck.sync, live.client, role]);

  // The presenter's blackout and pause reach every window.
  useEffect(() => {
    if (role !== "presenter") return;
    return deck.nav.subscribe((s, prev) => {
      if (s.paused !== prev.paused) live.client.send({ type: "blackout", on: s.paused });
    });
  }, [deck.nav, live.client, role]);
  useEffect(() => {
    if (role === "presenter") return;
    const apply = (blackout: boolean) => {
      deck.sync.source = "room";
      try {
        deck.nav.update((n) => (n.paused === blackout ? n : { ...n, paused: blackout }));
      } finally {
        deck.sync.source = null;
      }
    };
    // As with the spotlight: arriving during a blackout means arriving blacked out.
    if (live.client.state.get().blackout) apply(true);
    return live.client.state.subscribe((s, prev) => {
      if (s.blackout !== prev.blackout) apply(s.blackout);
    });
  }, [deck.nav, deck.sync, live.client, role]);

  /**
   * The spotlight, the same way the blackout travels.
   *
   * The laser's POSITION has always been published; the darkness around it never was — it was a
   * local flag on whichever window pressed the button, so the presenter dimmed their own screen
   * and nobody else's. The room has carried a `spotlight` field and the message to set it since
   * the protocol was written; this is the half that was missing at both ends.
   */
  useEffect(() => {
    if (role !== "presenter") return;
    return deck.ui.subscribe((s, prev) => {
      if (s.spotlight !== prev.spotlight) live.client.send({ type: "spotlight", on: s.spotlight });
    });
  }, [deck.ui, live.client, role]);
  useEffect(() => {
    if (role === "presenter") return;
    const apply = (on: boolean) =>
      deck.ui.update((u) => (u.spotlight === on ? u : { ...u, spotlight: on }));
    // Someone arriving mid-talk gets what is already true, not only what changes next.
    apply(live.client.state.get().spotlight);
    return live.client.state.subscribe((s, prev) => {
      if (s.spotlight !== prev.spotlight) apply(s.spotlight);
    });
  }, [deck.ui, live.client, role]);

  // Term cards. The presenter's go out only while "Share terms" is on (off by default: a card is
  // the presenter's own aid until they decide the room should see it); switching it off, closing
  // the card or moving on takes the shared card down everywhere.
  useEffect(() => {
    if (role !== "presenter") return;
    let shared = false;
    const push = () => {
      const r = deck.terms.get();
      if (r && r.from === "local" && deck.ui.get().termSync) {
        live.client.send({ type: "term", slide: r.slide, id: r.id, n: r.n, view: r.view });
        shared = true;
      } else if (shared) {
        live.client.send({ type: "term:off" });
        shared = false;
      }
    };
    const offTerms = deck.terms.subscribe(push);
    const offUi = deck.ui.subscribe((s, prev) => {
      if (s.termSync !== prev.termSync) push();
    });
    return () => {
      offTerms();
      offUi();
      if (shared) live.client.send({ type: "term:off" });
    };
  }, [deck.terms, deck.ui, live.client, role]);
  // Everyone else shows what arrives, pinned, until the presenter takes it down — or until this
  // viewer opens a card of their own, which a later "off" then leaves alone.
  useEffect(() => {
    if (role === "presenter") return;
    return live.client.on((m) => {
      const t = m.type === "term" ? m : m.type === "welcome" ? m.state.term : null;
      if (t)
        openTerm(deck, {
          slide: t.slide,
          id: t.id,
          n: t.n,
          view: t.view ?? null,
          pinned: true,
          from: "remote",
        });
      else if (m.type === "term:off") closeTerm(deck, "remote");
    });
  }, [deck, live.client, role]);

  // Confetti from the presenter lands everywhere.
  useEffect(() => {
    return live.client.on((m) => {
      if (m.type === "confetti") window.dispatchEvent(new CustomEvent("deck:confetti"));
    });
  }, [live.client]);

  void follow;
  return null;
}

/**
 * The laser pointer and spotlight: published by the presenter, drawn by everyone. `inCanvas`
 * renders it inside a scaled stage canvas (the presenter's current-slide box) in stage pixels.
 */
export function PointerLayer({ inCanvas = false }: { inCanvas?: boolean } = {}) {
  const deck = useDeck();
  const live = useLiveOptional()!;
  const layout = useLayout();
  const host = useRef<HTMLDivElement>(null);
  const on = useUi((s) => s.pointer);
  const spotlight = useUi((s) => s.spotlight);
  const role = useStore(live.client.role);
  const remote = useStore(live.client.state, (s) => s.pointer);
  const follow = useNav((s) => s.follow);
  const [local, setLocal] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!on || role !== "presenter") {
      if (role === "presenter") live.client.send({ type: "pointer:off" });
      setLocal(null);
      return;
    }
    let last = 0;
    const onMove = (e: PointerEvent) => {
      // Normalised stage coordinates, from the layer's own rectangle (the canvas or the viewport).
      const rect = host.current?.getBoundingClientRect();
      const l = deck.layout.get();
      const p =
        rect && rect.width > 0
          ? { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
          : {
              x: (e.clientX - l.left) / l.scale / deck.config.width,
              y: (e.clientY - l.top) / l.scale / deck.config.height,
            };
      setLocal(p);
      const now = performance.now();
      if (now - last > 33) {
        last = now;
        live.client.send({ type: "pointer", x: p.x, y: p.y });
      }
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [on, role, live.client, deck.layout, deck.config.width, deck.config.height]);

  // A laser points at a place on the PRESENTER's slide, so on any other slide it means nothing:
  // a viewer reading on their own is not given the dot.
  const p = role === "presenter" ? local : follow ? remote : null;
  const frame = inCanvas
    ? { left: 0, top: 0, width: deck.config.width, height: deck.config.height }
    : { left: layout.left, top: layout.top, width: layout.width, height: layout.height };
  const x = p ? p.x * frame.width : 0;
  const y = p ? p.y * frame.height : 0;
  const radius = inCanvas ? 140 / Math.max(0.05, layout.scale || 1) : 140;
  return (
    <div
      ref={host}
      className="deck-pointer-layer"
      style={{ position: "absolute", pointerEvents: "none", ...frame }}
    >
      {p && spotlight ? (
        <div
          className="deck-spotlight"
          style={{
            background: `radial-gradient(circle ${radius}px at ${x}px ${y}px, transparent 0, rgba(0,0,0,0.75) ${radius + 20}px)`,
          }}
        />
      ) : null}
      {p ? (
        <div
          className="deck-pointer"
          style={{ transform: `translate(${x}px, ${y}px)${inCanvas ? " scale(2.5)" : ""}` }}
        />
      ) : null}
    </div>
  );
}

/** Reactions float up from the bottom on every window as they arrive. */
function ReactionsOverlay() {
  const live = useLiveOptional()!;
  const [items, setItems] = useState<{ id: number; emoji: string; x: number }[]>([]);
  useEffect(() => {
    let n = 0;
    return live.client.on((m) => {
      if (m.type !== "react") return;
      const count = Math.min(6, m.n);
      const batch = Array.from({ length: count }, () => ({
        id: n++,
        emoji: m.emoji,
        x: 10 + Math.random() * 80,
      }));
      setItems((prev) => [...prev.slice(-40), ...batch]);
      setTimeout(
        () => setItems((prev) => prev.filter((i) => !batch.some((b) => b.id === i.id))),
        2600,
      );
    });
  }, [live.client]);
  return (
    <div className="deck-reactions-overlay" aria-hidden>
      {items.map((i) => (
        <span
          key={i.id}
          className="deck-reaction-float"
          style={{ left: `${i.x}%`, animationDelay: `${(i.id % 5) * 60}ms` }}
        >
          {i.emoji}
        </span>
      ))}
    </div>
  );
}

/**
 * THE WAY BACK, for a viewer reading on their own.
 *
 * It shows only while this window is NOT following: in step there is nothing to say, and a viewer
 * who wants out of step simply presses an arrow — any move of their own ends the follow (see
 * `withTransition` in Deck.tsx). `presenter` stays null until the room has said where they are, so
 * a late joiner gets the button without a slide number rather than no button at all.
 */
function FollowControl() {
  const deck = useDeck();
  const live = useLiveOptional()!;
  const actions = useActions();
  const role = useStore(live.client.role);
  const presenting = useStore(live.client.state, (s) => s.presence.presenter);
  const { follow, presenter, h, v } = useNav((s) => ({
    follow: s.follow,
    presenter: s.presenter,
    h: s.h,
    v: s.v,
  }));
  if (role === "presenter" || deck.mode !== "play" || !presenting || follow) return null;
  const away = !presenter || presenter.h !== h || presenter.v !== v;
  return (
    <div className="deck-follow" role="status">
      <span>
        {presenter && away ? (
          <>
            You are on {slideLabel(deck, h, v)} · they are on{" "}
            <b>{slideLabel(deck, presenter.h, presenter.v)}</b>
          </>
        ) : (
          "Reading on your own"
        )}
      </span>
      <button type="button" onClick={() => actions.setFollow(true)}>
        <Icon name="play" /> Follow the presenter
      </button>
    </div>
  );
}

/**
 * A slide, spelled the way THIS deck's own slide number spells it — so "they are on 10" and the
 * counter in the corner are talking about the same thing. A `c/t` deck loses its total here: the
 * sentence around the number does not need one.
 */
export function slideLabel(deck: DeckRuntime, h: number, v: number): string {
  const format = deck.config.slideNumber === true ? "h.v" : deck.config.slideNumber || "c";
  return N.formatSlideNumber(format === "c/t" ? "c" : format, { h, v, click: 0 }, deck.columns);
}
