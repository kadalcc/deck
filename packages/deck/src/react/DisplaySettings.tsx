import { useEffect, useRef } from "react";
import { z } from "zod";

import {
  DEFAULT_FILTERS,
  type DisplayFilters,
  FILTER_RANGES,
  filterCss,
  filtersKey,
  isDefaultFilters,
  normalizeFilters,
} from "../core/filters.ts";
import { readItem, writeItem } from "../core/storage.ts";
import { createStore, type Store, useStore } from "../core/store.ts";
import { useCommand } from "./commands.ts";
import { type DeckRuntime, useDeck } from "./context.ts";

/**
 * The display settings: a small panel of CSS filters for the slide stage (core/filters.ts),
 * opened with `,`, from the context menu, the theme menu or the `view.settings` command. It sits
 * in a corner rather than over the slide, so the effect of each slider is seen as it moves.
 *
 * The values live per deck in this browser and travel between its windows as they change: the
 * presenter can tune what the share window or the projector shows without leaving the presenter
 * view. They apply only on the deck page (play, projector, scroll view) — not on the presenter's
 * previews, the overview pages or print.
 */

const stores = new Map<string, Store<DisplayFilters>>();

/** This deck's filters, shared by every window of it in this browser. */
export function filtersStore(slug: string): Store<DisplayFilters> {
  const key = filtersKey(slug);
  let store = stores.get(key);
  if (store) return store;
  const read = () => {
    try {
      return normalizeFilters(JSON.parse(readItem(key) ?? "null"));
    } catch {
      return { ...DEFAULT_FILTERS };
    }
  };
  store = createStore(read());
  stores.set(key, store);
  if (typeof window !== "undefined")
    window.addEventListener("storage", (e) => {
      if (e.key === key) store!.set(read());
    });
  return store;
}

export function setFilters(slug: string, next: DisplayFilters) {
  const value = normalizeFilters(next);
  filtersStore(slug).set(value);
  writeItem(filtersKey(slug), JSON.stringify(value));
}

const open = createStore(false);

/** Whether the panel is open (one per window). */
export const settingsOpen = open;

/** Applies the filters to this window's stage, and registers `view.settings`. */
export function useDisplayFilters(deck: DeckRuntime, root: HTMLElement | null) {
  const slug = deck.config.slug;
  const filters = useStore(filtersStore(slug));
  useEffect(() => {
    if (!root) return;
    const css = filterCss(filters);
    if (css === "none") root.style.removeProperty("--deck-slide-filter");
    else root.style.setProperty("--deck-slide-filter", css);
    root.toggleAttribute("data-filtered", css !== "none");
  }, [root, filters]);
}

export function DisplaySettings() {
  const deck = useDeck();
  const isOpen = useStore(open);
  const slug = deck.config.slug;
  const filters = useStore(filtersStore(slug));
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useCommand({
    id: "view.settings",
    title: "Display settings",
    description:
      "Open or close the display settings: brightness, contrast, saturation, sepia, hue and invert for the slides on this browser's deck windows (to correct a projector).",
    group: "view",
    keys: ",",
    params: z
      .object({
        on: z.boolean().optional().describe("true to open, false to close; omit to toggle"),
      })
      .strict(),
    run: (p) => open.set(p.on ?? !open.get()),
  });
  useCommand({
    id: "view.filters",
    title: "Display filters",
    description:
      "Set the slide filters on this browser's deck windows. Omitted values keep theirs; `reset: true` puts every one back. Ranges: brightness/contrast 0.5–1.5, saturate 0–2, sepia 0–1, hueRotate -180–180 (degrees).",
    group: "view",
    params: z
      .object({
        brightness: z.number().min(0.5).max(1.5).optional(),
        contrast: z.number().min(0.5).max(1.5).optional(),
        saturate: z.number().min(0).max(2).optional(),
        sepia: z.number().min(0).max(1).optional(),
        hueRotate: z.number().min(-180).max(180).optional(),
        invert: z.boolean().optional(),
        reset: z.boolean().optional(),
      })
      .strict(),
    run: ({ reset, ...p }) => {
      const next = reset ? { ...DEFAULT_FILTERS } : { ...filtersStore(slug).get(), ...p };
      setFilters(slug, next);
      return normalizeFilters(next);
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input")?.focus();
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) open.set(false);
    };
    // Escape closes it wherever focus is (a Reset button that just went disabled drops focus to
    // the page), ahead of the deck's own Escape, which would open the overview.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      open.set(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
      returnTo.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  const set = (patch: Partial<DisplayFilters>) => setFilters(slug, { ...filters, ...patch });
  const show = (k: keyof typeof FILTER_RANGES, v: number) =>
    FILTER_RANGES[k].unit === "%" ? `${Math.round(v * 100)}%` : `${Math.round(v)}°`;
  return (
    <div
      ref={panel}
      className="deck-settings"
      role="dialog"
      aria-label="Display settings"
      // The deck's keys stay out of the panel: arrows move a slider, Escape closes it.
      data-deck-own-keys
    >
      <div className="deck-settings-head">
        <strong>Display</strong>
        <span className="deck-settings-scope">
          {deck.mode === "play" ? "this deck, this browser" : "the deck's windows in this browser"}
        </span>
        <button type="button" onClick={() => open.set(false)} aria-label="Close display settings">
          ×
        </button>
      </div>
      {(Object.keys(FILTER_RANGES) as (keyof typeof FILTER_RANGES)[]).map((k) => {
        const r = FILTER_RANGES[k];
        const id = `deck-filter-${k}`;
        return (
          <label key={k} className="deck-settings-row" htmlFor={id}>
            <span>{r.label}</span>
            <input
              id={id}
              type="range"
              min={r.min}
              max={r.max}
              step={r.step}
              value={filters[k]}
              aria-valuetext={show(k, filters[k])}
              onChange={(e) => set({ [k]: Number(e.target.value) })}
              onDoubleClick={() => set({ [k]: DEFAULT_FILTERS[k] })}
            />
            <output htmlFor={id}>{show(k, filters[k])}</output>
          </label>
        );
      })}
      <label className="deck-settings-row deck-settings-check">
        <span>Invert</span>
        <input
          type="checkbox"
          checked={filters.invert}
          onChange={(e) => set({ invert: e.target.checked })}
        />
        <output>{filters.invert ? "on" : "off"}</output>
      </label>
      <div className="deck-settings-foot">
        <span className="deck-settings-hint">Double-click a slider to reset it.</span>
        <button
          type="button"
          disabled={isDefaultFilters(filters)}
          onClick={() => setFilters(slug, { ...DEFAULT_FILTERS })}
        >
          Reset all
        </button>
      </div>
    </div>
  );
}
