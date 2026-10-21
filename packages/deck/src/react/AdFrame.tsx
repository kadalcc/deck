import { useEffect, useRef, useState } from "react";

import { Qr } from "../components/content.tsx";
import {
  type AdCreative,
  type AdSlots,
  type FramedSlide,
  frameGeometry,
  framedSlide,
  parseAdSlots,
} from "../core/ads.ts";
import { roomIdOf } from "../core/model.ts";
import { useStore } from "../core/store.ts";
import { useDeck } from "./context.ts";
import { useNav } from "./hooks.ts";

/**
 * The ad frame around the first and last slides, when the host funds the deck with ads (see
 * core/ads.ts for the shape and the rules). It asks the host what to show once, keeps the stage
 * clear of the frame through `stageInset` while a framed slide is on, and tells the host each
 * time the frame is shown. Every link is the host's own tracked redirect; this counts nothing.
 */
export function AdFrame() {
  const deck = useDeck();
  const { config, mode, projector } = deck;
  const api = config.live.api;
  const on = config.ads && !!api && mode === "play";
  const room = roomIdOf(config);
  const [slots, setSlots] = useState<AdSlots | null>(null);
  const { h, v, overview } = useNav((s) => ({ h: s.h, v: s.v, overview: s.overview }));
  const scroll = useStore(deck.ui, (s) => s.scroll);
  const [viewport, setViewport] = useState(() => size());

  useEffect(() => {
    if (!on) return;
    let alive = true;
    fetch(`${api}/decks/${encodeURIComponent(room)}/ads`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => alive && setSlots(parseAdSlots(body)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [on, api, room]);

  useEffect(() => {
    const onResize = () => setViewport(size());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const framed: FramedSlide | null =
    on && slots && !overview && !scroll ? framedSlide(deck.columns, h, v) : null;
  const inset = framed ? frameGeometry(viewport, config.width / config.height) : null;

  // Keep the stage clear of the frame while it shows; give the space back when it goes. The sizes
  // are also on the root as CSS variables, for what sits outside the chrome area (the follow bar).
  useEffect(() => {
    const side = inset?.mode === "side";
    deck.stageInset.set(
      inset ? { right: inset.right, bottom: inset.bottom, chrome: side } : { right: 0, bottom: 0 },
    );
    const root = document.documentElement.style;
    root.setProperty("--deck-frame-right", `${side ? inset!.right : 0}px`);
    root.setProperty("--deck-frame-bottom", `${side ? inset!.bottom : 0}px`);
  }, [deck.stageInset, inset?.right, inset?.bottom, inset?.mode]);
  useEffect(
    () => () => {
      deck.stageInset.set({ right: 0, bottom: 0 });
      document.documentElement.style.removeProperty("--deck-frame-right");
      document.documentElement.style.removeProperty("--deck-frame-bottom");
    },
    [deck.stageInset],
  );

  // One "seen" per showing: arriving on a framed slide, not every re-render while on it. A
  // projector is a second screen of the same showing; the main window reports it.
  const reported = useRef<FramedSlide | null>(null);
  useEffect(() => {
    if (!framed) {
      reported.current = null;
      return;
    }
    if (reported.current === framed || projector || !slots) return;
    reported.current = framed;
    const ids = [slots.tall?.id, slots.wide?.id, slots.qr?.id].filter(Boolean);
    const body = JSON.stringify({ ids, slide: framed });
    const url = `${api}/decks/${encodeURIComponent(room)}/ads/seen`;
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.(url, blob))
      void fetch(url, {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        keepalive: true,
      }).catch(() => {});
  }, [framed, slots, projector, api, room]);

  if (!framed || !inset || !slots) return null;
  const qrSide =
    inset.mode === "stack" ? 120 : Math.max(48, Math.min(inset.right, inset.bottom) - 36);
  return (
    <div
      className="deck-ad-frame"
      data-slide={framed}
      data-mode={inset.mode}
      style={
        {
          "--ad-right": `${inset.right}px`,
          "--ad-bottom": `${inset.bottom}px`,
        } as React.CSSProperties
      }
    >
      <div className="deck-ad-slot is-tall">{slots.tall ? <AdCard ad={slots.tall} /> : null}</div>
      <div className="deck-ad-slot is-wide">{slots.wide ? <AdCard ad={slots.wide} /> : null}</div>
      <div className="deck-ad-slot is-qr">
        {slots.qr ? (
          <a
            className="deck-ad-qr"
            href={slots.qr.url}
            target="_blank"
            rel="noopener sponsored"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="deck-ad-qr-code">
              <Qr value={absolute(slots.qr.url)} size={Math.round(qrSide * 2)} />
            </span>
            {slots.qr.caption ? (
              <span className="deck-ad-qr-caption">{slots.qr.caption}</span>
            ) : null}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function AdCard({ ad }: { ad: AdCreative }) {
  return (
    <a
      className="deck-ad-card"
      href={ad.href}
      target="_blank"
      rel="noopener sponsored"
      // An ad is a link, not a click on the deck (which would turn the page).
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {ad.image ? (
        <span className="deck-ad-image">
          <img src={ad.image} alt="" loading="lazy" />
        </span>
      ) : null}
      <span className="deck-ad-text">
        <span className="deck-ad-label">
          {ad.label}
          {ad.sponsor ? <> · {ad.sponsor}</> : null}
        </span>
        <strong className="deck-ad-title">{ad.title}</strong>
        {ad.body ? <span className="deck-ad-body">{ad.body}</span> : null}
        {ad.cta ? <span className="deck-ad-cta">{ad.cta} →</span> : null}
      </span>
    </a>
  );
}

function size() {
  if (typeof window === "undefined") return { width: 1920, height: 1080 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** A phone scanning the code needs the whole address, not a path on this host. */
function absolute(url: string): string {
  return url.startsWith("/") && typeof window !== "undefined"
    ? `${window.location.origin}${url}`
    : url;
}
