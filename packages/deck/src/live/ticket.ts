import { createStore, type Store } from "../core/store.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PRESENTER TICKET
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A host that serves decks sandboxed (an opaque origin) cannot let the deck carry the presenter's
 * cookie: the page has no cookies at all, and its requests to the host are cross-origin. Instead
 * the host hands the presenter a short-lived ticket — a signed string scoped to this one deck —
 * and the deck keeps it IN MEMORY only (never storage, never a cookie) and shows it on the calls
 * that need a presenter: the room's WebSocket (`?ticket=`), the presenter check, stats, exports.
 *
 * Where a ticket comes from, first one wins:
 *   1. the URL fragment, `#ticket=…` or `#/3/1&ticket=…` — the host's dashboard opens the
 *      presenter view that way, and this deck opens its own presenter view that way. A fragment
 *      never reaches a server or a Referer, and it is wiped from the address bar on arrival.
 *   2. the host's word, `window.__KADAL_DECK__.ticket`, written into the page it served.
 *   3. the passcode form on the presenter view, whose answer carries one.
 *
 * Self-hosted decks without a sandbox keep working as before: no ticket, and the cookie the host
 * sets does the job.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const TICKET = /^[A-Za-z0-9._~-]{16,512}$/;

export const presenterTicket: Store<string | null> = createStore<string | null>(null);
/**
 * A viewer's pass: what the host's verification page (a Turnstile check the host runs on its own,
 * unsandboxed page) hands back in the fragment, `#kdpass=…`, for the room to accept. Only on hosts
 * that ask for it (`live.verify`); in memory only, like the ticket.
 */
export const viewerPass: Store<string | null> = createStore<string | null>(null);

export function isTicket(value: unknown): value is string {
  return typeof value === "string" && TICKET.test(value);
}

export function setTicket(value: string | null): void {
  presenterTicket.set(isTicket(value) ? value : null);
}

/**
 * Take `name=value` out of a URL fragment. Returns the value (or null) and the fragment without
 * it, so `#/3/1&ticket=abc` gives `abc` and `#/3/1`.
 */
export function splitFromHash(
  hash: string,
  name = "ticket",
): { value: string | null; hash: string } {
  const m = new RegExp(`(^#|[&?])${name}=([^&]*)`).exec(hash);
  if (!m) return { value: null, hash };
  let value: string;
  try {
    value = decodeURIComponent(m[2] ?? "");
  } catch {
    value = "";
  }
  let rest = hash.slice(0, m.index) + (m[1] === "#" ? "#" : "") + hash.slice(m.index + m[0].length);
  rest = rest.replace(/^#&/, "#").replace(/[&?]$/, "");
  if (rest === "#") rest = "";
  return { value: isTicket(value) ? value : null, hash: rest };
}

/**
 * Read the page's ticket once, at start: from the fragment (which is then rewritten without it)
 * or from the host's global. Safe to call more than once; later calls change nothing.
 */
export function captureTicket(scope: { __KADAL_DECK__?: unknown } = globalThis as never): void {
  if (typeof window !== "undefined" && window.location?.hash) {
    let hash = window.location.hash;
    const ticket = splitFromHash(hash, "ticket");
    const pass = splitFromHash(ticket.hash, "kdpass");
    hash = pass.hash;
    if (ticket.value && !presenterTicket.get()) setTicket(ticket.value);
    if (pass.value && !viewerPass.get()) viewerPass.set(pass.value);
    if (hash !== window.location.hash) {
      try {
        history.replaceState(history.state, "", `${location.pathname}${location.search}${hash}`);
      } catch {
        /* the fragment stays; what it carried is still only in memory */
      }
    }
  }
  if (presenterTicket.get()) return;
  const host = scope?.__KADAL_DECK__ as { ticket?: unknown } | undefined;
  if (host && isTicket(host.ticket)) setTicket(host.ticket);
}

/** Headers for a presenter-only call: the ticket when there is one. */
export function ticketHeaders(): Record<string, string> {
  const t = presenterTicket.get();
  return t ? { "x-deck-ticket": t } : {};
}

/** Append the ticket to a URL fragment, for a window this one opens for the same presenter. */
export function withTicket(hash: string): string {
  const t = presenterTicket.get();
  if (!t) return hash;
  return hash ? `${hash}&ticket=${t}` : `#ticket=${t}`;
}
