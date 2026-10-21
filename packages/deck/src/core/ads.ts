import type { Column } from "./model.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE AD FRAME  —  a host's ads around the first and last slides
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A host may fund free decks with ads. When its override says `ads`, the play view frames the
 * deck's first and last slides: the slide keeps its shape and shrinks into the top-left, a tall
 * ad takes the right-hand column, a wide one the bottom row, and a QR code the corner between them.
 *
 *   ┌──────────────────────────┬──────┐
 *   │                          │ tall │
 *   │   the slide, same shape  │  ad  │
 *   │                          │      │
 *   ├──────────────────────────┼──────┤
 *   │ wide ad                  │  QR  │
 *   └──────────────────────────┴──────┘
 *
 * Only the play view shows it (the deck and a projector window); never the presenter view, the
 * phone remote, the audience page, the overview or print and its exports. The engine knows
 * nothing about campaigns: the host answers `GET {api}/decks/{room}/ads` with what to show,
 * each link already its own tracked redirect. The engine reports what was shown with
 * `POST {api}/decks/{room}/ads/seen`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface AdCreative {
  id: string;
  /** "Ad", "Sponsored", "From Kadal Deck", the host's word. */
  label: string;
  title: string;
  body?: string;
  /** The button's words, e.g. "Try it free". */
  cta?: string;
  /** Where a click goes: the host's tracked redirect (https, or a path on the host). */
  href: string;
  /** An image (https, or a path on the host). */
  image?: string;
  /** Who it's from, shown small. */
  sponsor?: string;
}

export interface AdQr {
  id: string;
  /** What the QR code opens: the host's tracked redirect. */
  url: string;
  /** A line under the code, e.g. "Scan to try Kadal Deck". */
  caption?: string;
}

export interface AdSlots {
  tall: AdCreative | null;
  wide: AdCreative | null;
  qr: AdQr | null;
}

export type FramedSlide = "first" | "last";

/** An https URL, or a path on the host. Anything else (javascript:, data:, http:) is refused. */
export function safeAdUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 2048) return null;
  if (/^\/(?!\/)/.test(v)) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const text = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

function creative(raw: unknown): AdCreative | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = text(o.id, 80);
  const title = text(o.title, 90);
  const href = safeAdUrl(o.href);
  if (!id || !title || !href) return null;
  const image = o.image === undefined ? undefined : (safeAdUrl(o.image) ?? undefined);
  return {
    id,
    label: text(o.label, 24) ?? "Ad",
    title,
    body: text(o.body, 180),
    cta: text(o.cta, 28),
    href,
    image,
    sponsor: text(o.sponsor, 60),
  };
}

function qr(raw: unknown): AdQr | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = text(o.id, 80);
  const url = safeAdUrl(o.url);
  if (!id || !url) return null;
  return { id, url, caption: text(o.caption, 60) };
}

/** The host's answer, checked: whatever is malformed is dropped. Null when nothing is left to show. */
export function parseAdSlots(raw: unknown): AdSlots | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const slots: AdSlots = { tall: creative(o.tall), wide: creative(o.wide), qr: qr(o.qr) };
  return slots.tall || slots.wide || slots.qr ? slots : null;
}

/** Which framed slide this is, if any: the deck's first, or its very last. */
export function framedSlide(columns: Column[], h: number, v: number): FramedSlide | null {
  if (!columns.length) return null;
  if (h === 0 && v === 0) return "first";
  const lastH = columns.length - 1;
  const lastV = (columns[lastH]?.slides.length ?? 1) - 1;
  // A one-slide deck is its own first slide.
  if (h === lastH && v === lastV) return "last";
  return null;
}

export interface FrameGeometry {
  /** "side": the tall ad on the right, the wide one along the bottom. "stack": all below the slide. */
  mode: "side" | "stack";
  /** What the frame takes from the viewport's right and bottom edges, in px. */
  right: number;
  bottom: number;
}

/** How much smaller the slide gets on a framed slide, on a landscape screen. */
export const FRAME_SHRINK = 0.8;

/**
 * Where the frame goes. On a landscape screen the slide keeps its shape at FRAME_SHRINK of the
 * size it would otherwise fit at, flush top-left, and the frame takes exactly the rest: a column
 * on the right, a row along the bottom, no bars. Each strip keeps a usable minimum, and a very wide
 * screen's column is capped. A portrait or narrow screen (a phone) has no room for a column: the
 * slide spans the width at the top and the ads stack below it.
 */
export function frameGeometry(
  viewport: { width: number; height: number },
  aspect: number,
): FrameGeometry {
  const { width: vw, height: vh } = viewport;
  if (vw < 640 || vw / vh < 1.2) {
    const slideH = Math.min(vh * 0.45, vw / aspect);
    return { mode: "stack", right: 0, bottom: Math.round(vh - slideH) };
  }
  const fitW = Math.min(vw, vh * aspect);
  let w = fitW * FRAME_SHRINK;
  let h = w / aspect;
  const minRight = 150;
  const minBottom = 100;
  if (vw - w < minRight) {
    w = vw - minRight;
    h = w / aspect;
  }
  if (vh - h < minBottom) {
    h = vh - minBottom;
    w = h * aspect;
  }
  const maxRight = Math.max(420, vw * 0.3);
  return {
    mode: "side",
    right: Math.round(Math.min(vw - w, maxRight)),
    bottom: Math.round(vh - h),
  };
}
