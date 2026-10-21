import { createStore, type Store } from "../core/store.ts";
import type { Stroke } from "../live/protocol.ts";
import type { DeckRuntime } from "../react/context.ts";
import { drawingFile, type Layers, layerKey, parseSvg, toSvg } from "./svg.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FILE DRAWINGS  —  `drawings/*.svg`, loaded under the live strokes
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Where a deck's saved drawings come from, behind one interface on the manifest:
 *
 *   kadal-deck dev     the dev server reads `drawings/` on request and writes it
 *                      (`/__kadal/drawings`, src/vite/drawings-dev.ts), and tells every open
 *                      page when a file changes
 *   kadal-deck build   the files are bundled (`virtual:deck/drawings`), so a hosted copy, a
 *                      publish and `kadal-deck export` all carry them
 *   the hosted shell   the runtime compiler finds `drawings/*.svg` among the files it was given
 *
 * File drawings are the base layer: live strokes are drawn on top of them. Outside the dev server
 * they are read-only. With `drawings.persist: "files"` on the dev server they are the drawing
 * itself — every pinned stroke, shape and erase is written back to the slide's file.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface DrawingSource {
  /** Every slide's drawing file: name without `.svg` → its text. */
  load(): Promise<Record<string, string>>;
  /** The dev server only: write one slide's file; an empty text deletes it. */
  save?: (file: string, svg: string) => Promise<void>;
  /** The dev server only: a file changed (another window saved it). */
  subscribe?: (listener: (file: string, svg: string) => void) => () => void;
}

export interface FileDrawings {
  loaded: boolean;
  /** Strokes by layer key ("h,v" or "h,v@n"), as the files have them. */
  layers: Record<string, Stroke[]>;
}

interface Entry {
  store: Store<FileDrawings>;
  ready: Promise<void>;
}

const cache = new WeakMap<object, Entry>();

type DeckLike = Pick<DeckRuntime, "manifest" | "columns" | "config">;

/** Which slide each file name belongs to. */
function filesBySlide(deck: DeckLike): Map<string, { h: number; v: number }> {
  const out = new Map<string, { h: number; v: number }>();
  for (const c of deck.columns)
    c.slides.forEach((meta, v) => out.set(drawingFile(meta), { h: c.h, v }));
  return out;
}

/** One file's text as layer keys for its slide. */
function layersOf(
  deck: DeckLike,
  slide: { h: number; v: number },
  file: string,
  text: string,
): Record<string, Stroke[]> {
  const out: Record<string, Stroke[]> = {};
  if (!text) return out;
  const layers = parseSvg(text, deck.config, file);
  for (const [click, list] of Object.entries(layers))
    if (list.length) out[layerKey(slide.h, slide.v, Number(click))] = list;
  return out;
}

/** Drop a slide's layers ("h,v" and every "h,v@n") from a map. */
function withoutSlide(layers: Record<string, Stroke[]>, h: number, v: number) {
  const base = `${h},${v}`;
  const out: Record<string, Stroke[]> = {};
  for (const [k, list] of Object.entries(layers))
    if (k !== base && !k.startsWith(`${base}@`)) out[k] = list;
  return out;
}

/** The deck's file drawings, loaded once per deck and kept current on the dev server. */
export function fileDrawings(deck: DeckLike): Entry {
  const key = deck.manifest as object;
  const hit = cache.get(key);
  if (hit) return hit;
  const source = deck.manifest.drawings ?? null;
  const store = createStore<FileDrawings>({ loaded: !source, layers: {} });
  const bySlide = filesBySlide(deck);
  const ready = source
    ? source
        .load()
        .then((files) => {
          let layers: Record<string, Stroke[]> = {};
          for (const [file, text] of Object.entries(files ?? {})) {
            const slide = bySlide.get(file);
            if (slide) layers = { ...layers, ...layersOf(deck, slide, file, text) };
          }
          store.set({ loaded: true, layers });
        })
        .catch(() => store.set({ loaded: true, layers: {} }))
    : Promise.resolve();
  source?.subscribe?.((file, text) => {
    const slide = bySlide.get(file);
    if (!slide) return;
    store.update((s) => ({
      ...s,
      layers: { ...withoutSlide(s.layers, slide.h, slide.v), ...layersOf(deck, slide, file, text) },
    }));
  });
  const entry = { store, ready };
  cache.set(key, entry);
  return entry;
}

/** Can this page write drawing files (the dev server)? */
export const canSaveFiles = (deck: Pick<DeckRuntime, "manifest">) => !!deck.manifest.drawings?.save;

/**
 * Write one slide's drawing — every layer of it, fading scribbles left out — to its file. Also
 * updates this page's copy of the files, so a page that reloads its slide sees what it saved.
 */
export async function saveSlide(
  deck: DeckLike,
  h: number,
  v: number,
  layers: Layers,
): Promise<void> {
  const save = deck.manifest.drawings?.save;
  const meta = deck.columns[h]?.slides[v];
  if (!save || !meta) return;
  const file = drawingFile(meta);
  const text = toSvg(layers, deck.config.width, deck.config.height);
  await save(file, text);
  const { store } = fileDrawings(deck);
  store.update((s) => ({
    ...s,
    layers: { ...withoutSlide(s.layers, h, v), ...layersOf(deck, { h, v }, file, text) },
  }));
}

/** `drawings.enabled` as it applies here: `"dev"` means only on the dev server. */
export function drawingsOn(deck: Pick<DeckRuntime, "manifest" | "config">): boolean {
  const e = deck.config.drawings.enabled as boolean | "dev";
  return e === "dev" ? !!(deck.manifest.drawings?.save || deck.manifest.relay) : !!e;
}

/** A source over files a caller already has (the runtime compiler's `files`). */
export function sourceFromFiles(files: Record<string, string>): DrawingSource | null {
  const found: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) {
    const m = /^(?:\.\/)?drawings\/([\w-]{1,64})\.svg$/.exec(path);
    if (m && text) found[m[1]!] = text;
  }
  return Object.keys(found).length ? { load: () => Promise.resolve(found) } : null;
}
