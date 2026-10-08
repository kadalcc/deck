import { useEffect } from "react";

import { key as navKey } from "../core/navigation.ts";
import { roomIdOf } from "../core/model.ts";
import { useDeck } from "../react/context.ts";
import { viewerId } from "./client.ts";

/**
 * Time on each slide, sent to the host every 20 seconds and when the page is hidden, with the
 * anonymous viewer id (a random string kept in localStorage — no cookies, no fingerprinting).
 * The host counts a view per viewer per day and sums dwell per slide for the stats page.
 */
export function Analytics() {
  const deck = useDeck();
  const api = deck.config.live.api;
  const slug = roomIdOf(deck.config);
  useEffect(() => {
    if (!api || !slug || deck.mode === "print" || deck.mode === "presenter") return;
    const dwell: Record<string, number> = {};
    const enters: Record<string, number> = {};
    let current = navKey(deck.nav.get().h, deck.nav.get().v);
    let since = Date.now();
    enters[current] = 1;
    const settle = () => {
      const t = Date.now();
      if (!document.hidden) dwell[current] = (dwell[current] ?? 0) + (t - since);
      since = t;
    };
    const unsub = deck.nav.subscribe((s) => {
      const k = navKey(s.h, s.v);
      if (k === current) return;
      settle();
      current = k;
      enters[k] = (enters[k] ?? 0) + 1;
    });
    const flush = () => {
      settle();
      if (!Object.keys(dwell).length && !Object.keys(enters).length) return;
      const body = JSON.stringify({ viewer: viewerId(), dwell, enters });
      for (const k of Object.keys(dwell)) delete dwell[k];
      for (const k of Object.keys(enters)) delete enters[k];
      const url = `${api}/decks/${encodeURIComponent(slug)}/beacon`;
      if (!navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" })))
        void fetch(url, {
          method: "POST",
          body,
          headers: { "content-type": "application/json" },
          keepalive: true,
        }).catch(() => {});
    };
    const timer = setInterval(flush, 20_000);
    const onVisibility = () => {
      if (document.hidden) flush();
      else since = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      unsub();
      flush();
    };
  }, [api, slug, deck.mode, deck.nav]);
  return null;
}

/** Ask the host for a short link to a slide; falls back to the deck's own hash URL offline. */
export async function shareLink(
  api: string | null,
  slug: string,
  base: string,
  pos: { h: number; v: number; click?: number },
  label?: string,
): Promise<string> {
  const fallback = `${window.location.origin}${base}#/${pos.h}${pos.v || pos.click ? `/${pos.v}` : ""}${pos.click ? `/${pos.click}` : ""}`;
  if (!api) return fallback;
  try {
    const r = await fetch(`${api}/decks/${encodeURIComponent(slug)}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...pos, label }),
    });
    if (!r.ok) return fallback;
    const j = (await r.json()) as { url?: string };
    return j.url ?? fallback;
  } catch {
    return fallback;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
