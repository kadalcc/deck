import { createWindowBus, type WindowBus } from "../core/windows.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DRAGGED POSITIONS, IN EVERY WINDOW  —  the window bus for `<Drag>` and `<DragArrow>`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Moving an element in `kadal-deck dev` writes its position into deck.mdx without reloading the
 * page (vite/drag-dev.ts), so the presenter view, a second play window or the projector would go
 * on showing the old place until their next load. Each move is posted on the deck's window bus
 * (core/windows.ts, `<slug>:drag`) as well:
 *
 *   { key, pos, saved: false }   while it is being moved — the other windows follow the gesture,
 *                                 a frame at a time at most
 *   { key, pos, saved: true }    once the dev server has written it — the others also take it
 *                                 as what the source now says, so their own next save of that
 *                                 element is checked against it and not refused as stale
 *
 * `key` is the element's place in the deck (`<slide index>:<name or #drag index>`), the same in
 * every window of one build. Nothing is sent where nothing can be dragged (a built deck, the
 * hosted shell): only `<Drag>` in dev mode calls `post`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface DragMessage {
  type: "drag";
  key: string;
  pos: string;
  saved: boolean;
  from: string;
}

type Listener = (pos: string, saved: boolean) => void;

interface Channel {
  bus: WindowBus<DragMessage> | null;
  listeners: Map<string, Set<Listener>>;
}

const me = Math.random().toString(36).slice(2, 10);
const channels = new Map<string, Channel>();

function channel(slug: string): Channel {
  let c = channels.get(slug);
  if (c) return c;
  let bus: WindowBus<DragMessage> | null = null;
  try {
    if (typeof window !== "undefined") bus = createWindowBus<DragMessage>(`${slug}:drag`);
  } catch {
    bus = null;
  }
  const made: Channel = { bus, listeners: new Map() };
  bus?.subscribe(({ data: m }) => {
    if (!m || m.type !== "drag" || m.from === me) return;
    if (typeof m.key !== "string" || typeof m.pos !== "string") return;
    for (const l of made.listeners.get(m.key) ?? []) l(m.pos, m.saved === true);
  });
  channels.set(slug, made);
  return made;
}

/** Tell the deck's other windows where an element is now (`saved`: and that the source says so). */
export function postDragPosition(slug: string, key: string, pos: string, saved: boolean): void {
  channel(slug).bus?.post({ type: "drag", key, pos, saved, from: me });
}

/** Hear another window move this element. Returns the unsubscribe. */
export function onDragPosition(slug: string, key: string, listener: Listener): () => void {
  const c = channel(slug);
  let set = c.listeners.get(key);
  if (!set) c.listeners.set(key, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (!set.size) c.listeners.delete(key);
  };
}
