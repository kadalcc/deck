import type { Column } from "./model.ts";
import { findById } from "./model.ts";
import type { Position } from "./navigation.ts";

/**
 * The URL hash as reveal.js writes it — `#/h`, `#/h/v`, `#/h/v/click` — or `#/slide-id`, plus the
 * query flags every deck understands: `?print-pdf`, `?view=scroll`, `?presenter`.
 */

export function parseHash(
  hash: string,
  columns: Column[],
  oneBased = false,
): Partial<Position> | null {
  const raw = hash.replace(/^#\/?/, "");
  if (!raw) return null;
  const parts = raw.split("/");
  const offset = oneBased ? 1 : 0;
  if (parts[0] && !/^\d+$/.test(parts[0])) {
    const found = findById(columns, decodeURIComponent(parts[0]));
    return found ? { ...found, click: 0 } : null;
  }
  const h = Number(parts[0] ?? 0) - offset;
  const v = parts[1] ? Number(parts[1]) - offset : 0;
  const click = parts[2] ? Number(parts[2]) : 0;
  return {
    h: Number.isFinite(h) ? h : 0,
    v: Number.isFinite(v) ? v : 0,
    click: Number.isFinite(click) ? click : 0,
  };
}

export function formatHash(
  p: Position,
  opts: { oneBased?: boolean; withClick?: boolean; id?: string | null } = {},
): string {
  if (opts.id)
    return `#/${encodeURIComponent(opts.id)}${opts.withClick && p.click ? `/${p.click}` : ""}`;
  const offset = opts.oneBased ? 1 : 0;
  let out = `#/${p.h + offset}`;
  if (p.v > 0 || (opts.withClick && p.click > 0)) out += `/${p.v + offset}`;
  if (opts.withClick && p.click > 0) out += `/${p.click}`;
  return out;
}

export interface Flags {
  print: boolean;
  view: "slide" | "scroll" | null;
  presenter: boolean;
  embedded: boolean;
  /**
   * `?at` — this link is deliberately ABOUT its slide: a share link, the phone's "Open full". A
   * hash alone cannot say that, because the deck writes the hash as the viewer navigates, so the
   * address of a bookmark taken mid-talk looks exactly like a link someone chose to send.
   */
  at: boolean;
  /**
   * `?projector` — a window that exists to be LOOKED at: a second screen, or the window you share
   * on a call. It renders the deck exactly as the deck page does, follows the presenter and cannot
   * be made to stop, and takes no navigation input of its own.
   */
  projector: boolean;
}

export function parseFlags(search: string): Flags {
  const q = new URLSearchParams(search);
  const view = q.get("view");
  return {
    print: q.has("print-pdf") || q.get("print") === "pdf",
    view: view === "scroll" ? "scroll" : view === "slide" ? "slide" : null,
    presenter: q.has("presenter"),
    embedded: q.has("embedded"),
    at: q.has("at"),
    projector: q.has("projector"),
  };
}
