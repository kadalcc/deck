import { createStore, type Store } from "../core/store.ts";
import type { WindowBus } from "../core/windows.ts";
import type { ClientMessage, Stroke } from "../live/protocol.ts";
import { emptyHistory, type History, record, RoomSender, redo, roomOps, undo } from "./history.ts";
import { SHAPES } from "./shapes.ts";
import { parseLayerKey } from "./svg.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DRAWING  —  one window's strokes, shared with the deck's other windows
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every window of a deck in this browser (the play view, the presenter view, a shared window, an
 * audience tab) holds the same drawing: strokes by layer key ("h,v", or "h,v@n" per click step).
 * A change made in one window replaces that layer's list and is posted on the window bus
 * (core/windows.ts), and every other window takes the list as it is — so the presenter's pen,
 * shapes and eraser show on the play view at once, with or without a room. A window that opens
 * late asks the others for what they have.
 *
 * The window that made a change also:
 *   - remembers it for undo and redo (history.ts), per slide
 *   - tells the room, in the room's three words (`roomOps`), paced to its limit (`RoomSender`)
 *   - keeps it: in browser storage, and on the dev server in `drawings/<slide>.svg`
 *
 * Fading scribbles are removed by each window on its own clock (DrawingLayer); that is not a
 * change anyone needs to be told about.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Doc = Record<string, Stroke[]>;

export type DrawBusMessage =
  | { type: "set"; key: string; strokes: Stroke[]; from: string }
  | { type: "hello"; from: string }
  | { type: "doc"; doc: Doc; to: string; from: string };

type DrawMessage = Extract<ClientMessage, { type: "draw" | "draw:undo" | "draw:clear" }>;

export interface DocOptions {
  windowId: string;
  /** Sends to the room, for a window whose drawing the room should carry. */
  room?: ((m: DrawMessage) => void) | null;
  /** Called after this window changed the drawing, with all of it (browser storage). */
  persist?: ((doc: Doc) => void) | null;
  /** Called, a beat after this window changed a slide, with the slide's "h,v" (drawing files). */
  save?: ((slide: string) => void) | null;
  /** Leaves strokes out of what undo or redo restores (faded scribbles). */
  alive?: (s: Stroke) => boolean;
  initial?: Doc;
}

/** The slide a layer key belongs to: "h,v". */
const slideOf = (key: string) => parseLayerKey(key).slide;

export class DrawingDoc {
  readonly store: Store<Doc>;
  private history = new Map<string, History<Doc>>();
  private sender: RoomSender | null;
  private saves = new Map<string, ReturnType<typeof setTimeout>>();
  private bus: WindowBus<DrawBusMessage> | null = null;
  /** Bumped on every history change, so a toolbar can re-read can-undo / can-redo. */
  readonly version: Store<number> = createStore(0);

  constructor(private readonly o: DocOptions) {
    this.store = createStore<Doc>(o.initial ?? {});
    this.sender = o.room ? new RoomSender(o.room) : null;
  }

  /** Join this browser's other deck windows: hear their changes, ask what they have. */
  attach(bus: WindowBus<DrawBusMessage>): () => void {
    this.bus = bus;
    const off = bus.subscribe(({ data: m }) => this.hear(m));
    bus.post({ type: "hello", from: this.o.windowId });
    return () => {
      off();
      if (this.bus === bus) this.bus = null;
    };
  }

  get(key: string): Stroke[] {
    return this.store.get()[key] ?? [];
  }

  /**
   * Replace layers. `history: false` for a change undo should not see (a redo or undo itself),
   * `share: false` for one only this window makes (a scribble that faded).
   */
  change(next: Doc, { history = true, share = true }: { history?: boolean; share?: boolean } = {}) {
    const cur = this.store.get();
    const before: Doc = {};
    const changed: Doc = {};
    for (const [k, list] of Object.entries(next)) {
      const prev = cur[k] ?? [];
      if (prev === list) continue;
      before[k] = prev;
      changed[k] = list;
    }
    const keys = Object.keys(changed);
    if (!keys.length) return false;
    this.store.set({ ...cur, ...changed });
    if (history) {
      const bySlide = new Map<string, Doc>();
      for (const k of keys) {
        const s = slideOf(k);
        bySlide.set(s, { ...bySlide.get(s), [k]: before[k]! });
      }
      for (const [s, snap] of bySlide)
        this.history.set(s, record(this.history.get(s) ?? emptyHistory<Doc>(), snap));
      this.version.update((n) => n + 1);
    }
    if (share) this.share(changed, before);
    return true;
  }

  private share(changed: Doc, before: Doc) {
    const slides = new Set<string>();
    for (const [k, list] of Object.entries(changed)) {
      this.bus?.post({ type: "set", key: k, strokes: list, from: this.o.windowId });
      this.sender?.push(roomOps(k, before[k] ?? [], list));
      slides.add(slideOf(k));
    }
    this.o.persist?.(this.store.get());
    if (this.o.save)
      for (const s of slides) {
        const t = this.saves.get(s);
        if (t) clearTimeout(t);
        this.saves.set(
          s,
          setTimeout(() => {
            this.saves.delete(s);
            this.o.save?.(s);
          }, 400),
        );
      }
  }

  canUndo = (slide: string) => (this.history.get(slide)?.undo.length ?? 0) > 0;
  canRedo = (slide: string) => (this.history.get(slide)?.redo.length ?? 0) > 0;

  undo(slide: string) {
    return this.step(slide, undo);
  }
  redo(slide: string) {
    return this.step(slide, redo);
  }

  private step(slide: string, fn: typeof undo) {
    const h = this.history.get(slide);
    if (!h) return false;
    const top = fn === undo ? h.undo[h.undo.length - 1] : h.redo[h.redo.length - 1];
    if (!top) return false;
    const cur = this.store.get();
    const current: Doc = {};
    for (const k of Object.keys(top)) current[k] = cur[k] ?? [];
    const r = fn(h, current);
    if (!r) return false;
    this.history.set(slide, r.history);
    this.version.update((n) => n + 1);
    const alive = this.o.alive ?? (() => true);
    const restored: Doc = {};
    for (const [k, list] of Object.entries(r.value)) restored[k] = list.filter(alive);
    this.change(restored, { history: false });
    return true;
  }

  private hear(m: DrawBusMessage) {
    if (!m || typeof m !== "object" || m.from === this.o.windowId) return;
    if (m.type === "set" && typeof m.key === "string" && m.key.length <= 24) {
      const strokes = cleanStrokes(m.strokes);
      if (strokes) this.store.update((d) => ({ ...d, [m.key]: strokes }));
    } else if (m.type === "hello") {
      const doc = this.store.get();
      if (Object.values(doc).some((l) => l.length))
        this.bus?.post({ type: "doc", doc, to: m.from, from: this.o.windowId });
    } else if (m.type === "doc" && m.to === this.o.windowId && m.doc && typeof m.doc === "object") {
      // What another window has fills the layers this one has nothing on.
      this.store.update((d) => {
        const out = { ...d };
        for (const [k, list] of Object.entries(m.doc)) {
          const strokes = cleanStrokes(list);
          if (strokes && k.length <= 24 && !out[k]?.length) out[k] = strokes;
        }
        return out;
      });
    }
  }

  /** Writes waiting for their beat go now (the page is closing, or a test). */
  flush() {
    for (const [s, t] of this.saves) {
      clearTimeout(t);
      this.o.save?.(s);
    }
    this.saves.clear();
  }

  dispose() {
    this.flush();
    this.sender?.dispose();
  }
}

/**
 * Strokes from another window, checked before they are drawn: the window that opened a deck can
 * be any page, so only well-formed geometry gets through, and only so much of it.
 */
export function cleanStrokes(x: unknown): Stroke[] | null {
  if (!Array.isArray(x)) return null;
  const out: Stroke[] = [];
  for (const s of x.slice(0, 500)) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id.length > 40 || !Array.isArray(o.points)) continue;
    const points = (o.points as unknown[])
      .slice(0, 4000)
      .filter(
        (p): p is [number, number] =>
          Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
      )
      .map((p) => [Number(p[0]), Number(p[1])] as [number, number]);
    if (!points.length) continue;
    const stroke: Stroke = {
      id: o.id,
      tool: o.tool === "highlighter" ? "highlighter" : "pen",
      color: typeof o.color === "string" && o.color.length <= 40 ? o.color : "#ef4444",
      size: Math.min(80, Math.max(1, Number(o.size) || 4)),
      points,
    };
    if (o.fade === true) stroke.fade = true;
    if (typeof o.shape === "string" && (SHAPES as string[]).includes(o.shape))
      stroke.shape = o.shape as Stroke["shape"];
    out.push(stroke);
  }
  return out;
}
