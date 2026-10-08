import { useCallback, useEffect, useRef, useState } from "react";

import { POSTER_DEFAULT_SIZE, posterName, resolvePoster } from "../core/poster.ts";
import { useDeck, useSlideOptional } from "./context.ts";

/**
 * An embedded page inside a slide, with manners: it loads when its slide is shown (data-src),
 * unloads when the slide is left, and sits behind a shield until you mean to interact — one
 * click, or the F-hint on it — so wheel and arrow keys keep driving the deck until then. While
 * it has the keyboard a "Done" button hands control back; leaving the slide does the same.
 *
 * Until the page has loaded — and wherever it never will (print, overview, the next-slide box,
 * the scroll view) — a poster stands in: the one the deck names, else the screenshot `deck
 * export` captured for this URL at this pane's size, else a card with the address.
 *
 * And it can always be loaded again, which it could not before. The loader in `SlideFrame` gives
 * an iframe its `src` once — often from the prefetch, a slide ahead of arriving — and then skips
 * any frame whose `src` already matches, so a page that failed up there stayed failed for the rest
 * of the talk. Worse, a browser's own error page fires `load` like any other document, so nothing
 * in here could tell a dead frame from a live one. Hence a Reload control that is always one click
 * away, and a timeout for the page that never finishes at all.
 */
const preconnected = new Set<string>();

export function FrameShell({
  url,
  className,
  preload = false,
  title,
  poster,
  posterSize,
  scale,
}: {
  url: string;
  className?: string;
  preload?: boolean;
  title?: string;
  poster?: string;
  /** The pane's size in stage pixels, which names the captured poster. */
  posterSize?: readonly [number, number];
  /**
   * Render the page at 1/scale of the pane and shrink it to fit: 0.5 shows a small pane the
   * desktop layout it would get at twice the size.
   */
  scale?: number;
}) {
  const deck = useDeck();
  const [live, setLive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [posterState, setPosterState] = useState<"pending" | "ok" | "missing">("pending");
  const [attempt, setAttempt] = useState(0);
  /** Bumped to throw the iframe element away and start again with a clean one. */
  const [nonce, setNonce] = useState(0);
  const ref = useRef<HTMLIFrameElement>(null);
  const slide = useSlideOptional();
  const active = slide?.active ?? true;
  const preview = slide?.preview ?? false;
  const [w, h] = posterSize ?? POSTER_DEFAULT_SIZE;
  const posterSrc = resolvePoster(poster ?? posterName(url, w, h), deck.base);
  const zoom = scale && scale > 0 && scale !== 1 ? scale : 1;

  // Warm the connection the moment the frame exists, so the load itself is one round trip shorter.
  useEffect(() => {
    try {
      const origin = new URL(url, window.location.href).origin;
      if (origin === window.location.origin || preconnected.has(origin)) return;
      preconnected.add(origin);
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = origin;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    } catch {
      /* not a URL */
    }
  }, [url]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setLive(true);
    el.addEventListener("deck:interact", on);
    return () => el.removeEventListener("deck:interact", on);
  }, []);
  useEffect(() => {
    if (!active) {
      setLive(false);
      setLoaded(false);
      setAttempt(0);
    }
  }, [active]);

  /**
   * Load the page again, properly.
   *
   * Dropping `src` and putting the same address back does NOT reload a frame: removing the
   * attribute leaves the document where it is, and assigning an address a frame already has is
   * not a navigation — measured, it makes no request at all, which is why pressing Reload looked
   * like pressing nothing. Two things are needed, and both are cheap:
   *
   *   · a new element, so there is no document to keep and no address to match, and
   *   · a different address, so nothing cached — least of all a cached failure — can be handed
   *     back instead of a fresh load.
   */
  const reload = useCallback(() => {
    setLoaded(false);
    setAttempt((n) => n + 1);
    setNonce((n) => n + 1);
  }, []);

  // The remounted frame arrives with `data-src` and no `src` — the loader in SlideFrame only
  // visits a frame when its slide changes, so this is where the new element is sent on its way.
  useEffect(() => {
    if (!nonce) return;
    const el = ref.current;
    if (!el) return;
    el.setAttribute("src", `${url}${url.includes("?") ? "&" : "?"}deck-reload=${Date.now()}`);
  }, [nonce, url]);

  // A page that never finishes is tried again for you, twice, while the poster is still standing
  // in — so it costs nothing to watch. After that it is the button's job: a page that finished and
  // failed (an error document) looks loaded from out here, and no timer can know better.
  useEffect(() => {
    if (preview || !active || loaded || attempt >= 2) return;
    const id = setTimeout(reload, 12_000);
    return () => clearTimeout(id);
  }, [preview, active, loaded, attempt, reload]);

  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  return (
    <div
      className={[
        "deck-frame",
        live ? "is-live" : "",
        loaded ? "is-loaded" : "",
        preview ? "is-preview" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <iframe
        key={nonce}
        ref={ref}
        data-src={url}
        data-preload={preload ? "" : undefined}
        title={title ?? url}
        allow="fullscreen; geolocation; clipboard-write; autoplay"
        style={
          zoom !== 1
            ? {
                width: `${100 / zoom}%`,
                height: `${100 / zoom}%`,
                maxWidth: "none",
                maxHeight: "none",
                transform: `scale(${zoom})`,
                transformOrigin: "0 0",
              }
            : undefined
        }
        // A frame without a src loads about:blank and says so; only the real page counts.
        onLoad={(e) => {
          if (e.currentTarget.getAttribute("src")) setLoaded(true);
        }}
      />
      {!loaded && posterState !== "missing" ? (
        <img
          className="deck-frame-poster"
          src={posterSrc}
          alt=""
          aria-hidden
          onLoad={() => setPosterState("ok")}
          onError={() => setPosterState("missing")}
        />
      ) : null}
      {!loaded && posterState === "missing" ? (
        <div className="deck-frame-placeholder" aria-hidden>
          <span>{url}</span>
        </div>
      ) : null}
      {preview ? null : (
        <button
          type="button"
          className="deck-frame-reload"
          data-hint="reload"
          title="Load this page again"
          onClick={(event) => {
            event.stopPropagation();
            reload();
          }}
        >
          Reload
        </button>
      )}
      {preview ? null : live ? (
        <button
          type="button"
          className="deck-frame-done"
          onClick={() => {
            setLive(false);
            (document.activeElement as HTMLElement | null)?.blur?.();
            window.focus();
          }}
        >
          Done · back to the slides
        </button>
      ) : (
        <button
          type="button"
          className="deck-frame-shield"
          data-hint="interact"
          onClick={() => {
            setLive(true);
            setTimeout(() => ref.current?.focus(), 0);
          }}
        >
          <span>
            {touch ? "Tap to interact" : "Click to interact · F to focus with the keyboard"}
          </span>
        </button>
      )}
    </div>
  );
}
