/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DISPLAY FILTERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A projector that washes colours out, a screen that is too bright for a dark room, a beamer with
 * a green cast: the slide stage takes a CSS filter — brightness, contrast, saturation, sepia,
 * hue-rotate and invert — set from the display settings (`,` or the context menu), kept per deck
 * in this browser and shared live between its windows. The presenter can therefore tune the
 * share window or the projector from the presenter view. It applies to the slides and their
 * backgrounds on the deck page, never to the controls, the presenter view's own previews or a
 * printed page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface DisplayFilters {
  /** 0.5–1.5; 1 = as authored. */
  brightness: number;
  /** 0.5–1.5. */
  contrast: number;
  /** 0–2. */
  saturate: number;
  /** 0–1. */
  sepia: number;
  /** -180–180 degrees. */
  hueRotate: number;
  invert: boolean;
}

export const DEFAULT_FILTERS: DisplayFilters = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  sepia: 0,
  hueRotate: 0,
  invert: false,
};

/** Each slider's range and step, for the settings panel and for clamping what storage holds. */
export const FILTER_RANGES: Record<
  Exclude<keyof DisplayFilters, "invert">,
  { min: number; max: number; step: number; label: string; unit: string }
> = {
  brightness: { min: 0.5, max: 1.5, step: 0.05, label: "Brightness", unit: "%" },
  contrast: { min: 0.5, max: 1.5, step: 0.05, label: "Contrast", unit: "%" },
  saturate: { min: 0, max: 2, step: 0.05, label: "Saturation", unit: "%" },
  sepia: { min: 0, max: 1, step: 0.05, label: "Sepia", unit: "%" },
  hueRotate: { min: -180, max: 180, step: 5, label: "Hue", unit: "°" },
};

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Whatever storage held, as filters (unknown keys dropped, values clamped). */
export function normalizeFilters(value: unknown): DisplayFilters {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_FILTERS };
  for (const [k, r] of Object.entries(FILTER_RANGES))
    (out as unknown as Record<string, number>)[k] = clamp(
      v[k],
      r.min,
      r.max,
      DEFAULT_FILTERS[k as keyof typeof FILTER_RANGES],
    );
  out.invert = v.invert === true;
  return out;
}

export function isDefaultFilters(f: DisplayFilters): boolean {
  return (Object.keys(DEFAULT_FILTERS) as (keyof DisplayFilters)[]).every(
    (k) => f[k] === DEFAULT_FILTERS[k],
  );
}

/** The CSS `filter` value, or "none" when nothing is changed. */
export function filterCss(f: DisplayFilters): string {
  const parts: string[] = [];
  if (f.invert) parts.push("invert(1)");
  if (f.brightness !== 1) parts.push(`brightness(${round(f.brightness)})`);
  if (f.contrast !== 1) parts.push(`contrast(${round(f.contrast)})`);
  if (f.saturate !== 1) parts.push(`saturate(${round(f.saturate)})`);
  if (f.sepia !== 0) parts.push(`sepia(${round(f.sepia)})`);
  if (f.hueRotate !== 0) parts.push(`hue-rotate(${Math.round(f.hueRotate)}deg)`);
  return parts.length ? parts.join(" ") : "none";
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Where a deck's filters live in this browser. */
export const filtersKey = (slug: string) => `deck.filters.${slug || "deck"}`;
