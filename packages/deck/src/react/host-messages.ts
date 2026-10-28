import { useEffect } from "react";

import { flatIndex } from "../core/model.ts";
import * as N from "../core/navigation.ts";
import type { DeckRuntime } from "./context.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A PAGE THAT FRAMES THE DECK, AND WHAT IT MAY SAY TO IT  —  reveal.js's postMessage API
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * https://revealjs.com/postmessage/. A deck in an iframe (or a window another page opened) takes
 * reveal's calls from that page and answers each one:
 *
 *   → frame.postMessage(JSON.stringify({ method: "slide", args: [2] }), "*")
 *   ← { namespace: "reveal", eventName: "callback", method: "slide", result, state }   (a JSON string)
 *
 * The methods are reveal's, mapped to the deck's own moves (`REVEAL_METHODS`). Kadal's command
 * protocol works the same way — `{ kadal: 1, type: "command", seq, id, params }` runs any command
 * (`deck.commands`), answered `{ kadal: 1, type: "command:result", seq, result }`, and
 * `{ kadal: 1, type: "commands", seq }` lists them — except under `?preview`, where the editor's
 * shell (runtime/shell.tsx) already speaks it.
 *
 * With `postMessageEvents`, every deck event (core/events.ts) goes to the framing page as
 * reveal's `{ namespace: "reveal", eventName, state }`.
 *
 * `postMessage: false` turns the calls off. Only the framing page (`window.parent`) and the page
 * that opened this window are heard; what they send is checked for its shape before it is used.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** reveal's `getState()`. */
export interface RevealState {
  indexh: number;
  indexv: number;
  indexf?: number;
  paused: boolean;
  overview: boolean;
}

/** What a reveal call can do to, and read from, a deck. */
export interface RevealHost {
  state(): RevealState;
  totalSlides(): number;
  /** Clicks on show, and how many the slide has. */
  steps(): { shown: number; total: number };
  routes(): N.Routes;
  progress(): number;
  scale(): number;
  autoSliding(): boolean;
  isFirst(): boolean;
  isLast(): boolean;
  move(
    to:
      | "next"
      | "prev"
      | "left"
      | "right"
      | "up"
      | "down"
      | "first"
      | "last"
      | "nextSlide"
      | "prevSlide",
  ): void;
  goto(h: number, v: number, click: number): void;
  overview(on?: boolean): void;
  pause(on?: boolean): void;
  autoSlide(on?: boolean): void;
  help(on?: boolean): void;
  jump(on?: boolean): void;
}

/** reveal's index of the fragment on show: undefined without any, -1 before the first. */
function indexf(steps: { shown: number; total: number }): number | undefined {
  return steps.total > 0 ? steps.shown - 1 : undefined;
}

const int = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;
const flag = (v: unknown) => (typeof v === "boolean" ? v : undefined);

/** reveal's method names, as the deck answers them. Unknown names are not answered. */
export const REVEAL_METHODS: Record<string, (host: RevealHost, args: unknown[]) => unknown> = {
  slide: (host, [h, v, f]) => {
    const s = host.state();
    host.goto(int(h, s.indexh), int(v, 0), typeof f === "number" ? int(f + 1, 0) : 0);
  },
  next: (h) => h.move("next"),
  prev: (h) => h.move("prev"),
  left: (h) => h.move("left"),
  right: (h) => h.move("right"),
  up: (h) => h.move("up"),
  down: (h) => h.move("down"),
  navigateNext: (h) => h.move("next"),
  navigatePrev: (h) => h.move("prev"),
  navigateLeft: (h) => h.move("left"),
  navigateRight: (h) => h.move("right"),
  navigateUp: (h) => h.move("up"),
  navigateDown: (h) => h.move("down"),
  nextFragment: (h) => {
    if (!h.routes().nextClick) return false;
    h.move("next");
    return true;
  },
  prevFragment: (h) => {
    if (!h.routes().prevClick) return false;
    h.move("prev");
    return true;
  },
  toggleOverview: (h, [on]) => h.overview(flag(on)),
  togglePause: (h, [on]) => h.pause(flag(on)),
  toggleAutoSlide: (h, [on]) => h.autoSlide(flag(on)),
  toggleHelp: (h, [on]) => h.help(flag(on)),
  toggleJumpToSlide: (h, [on]) => h.jump(flag(on)),
  isOverview: (h) => h.state().overview,
  isPaused: (h) => h.state().paused,
  isAutoSliding: (h) => h.autoSliding(),
  isFirstSlide: (h) => h.isFirst(),
  isLastSlide: (h) => h.isLast(),
  getState: (h) => h.state(),
  setState: (h, [state]) => {
    if (!state || typeof state !== "object") return;
    const s = state as Partial<RevealState>;
    const now = h.state();
    if (
      typeof s.indexh === "number" ||
      typeof s.indexv === "number" ||
      typeof s.indexf === "number"
    )
      h.goto(
        int(s.indexh, now.indexh),
        int(s.indexv, 0),
        typeof s.indexf === "number" ? int(s.indexf + 1, 0) : 0,
      );
    if (typeof s.overview === "boolean") h.overview(s.overview);
    if (typeof s.paused === "boolean") h.pause(s.paused);
  },
  getIndices: (h) => {
    const s = h.state();
    return { h: s.indexh, v: s.indexv, f: s.indexf };
  },
  getTotalSlides: (h) => h.totalSlides(),
  getProgress: (h) => h.progress(),
  getScale: (h) => h.scale(),
  availableRoutes: (h) => {
    const r = h.routes();
    return { left: r.left, right: r.right, up: r.up, down: r.down };
  },
  availableFragments: (h) => {
    const r = h.routes();
    return { prev: r.prevClick, next: r.nextClick };
  },
};

export type HostMessage =
  | { kind: "reveal"; method: string; args: unknown[] }
  | { kind: "command"; seq: number; id: string; params: unknown }
  | { kind: "commands"; seq: number };

/**
 * What a message from the framing page asks, or null when it is not one of ours: reveal's JSON
 * string (`{ method, args }`, reveal checks for a string that starts with `{`), the same as an
 * object, or Kadal's `{ kadal: 1, type: "command" | "commands" }`.
 */
export function parseHostMessage(data: unknown): HostMessage | null {
  let m: unknown = data;
  if (typeof data === "string") {
    const t = data.trim();
    if (!t.startsWith("{") || !t.endsWith("}")) return null;
    try {
      m = JSON.parse(t);
    } catch {
      return null;
    }
  }
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  if (o.kadal === 1) {
    const seq = typeof o.seq === "number" ? o.seq : 0;
    if (o.type === "command" && typeof o.id === "string")
      return { kind: "command", seq, id: o.id, params: o.params ?? {} };
    if (o.type === "commands") return { kind: "commands", seq };
    return null;
  }
  // A message the deck itself sends (an event, a callback) is not a call.
  if (o.namespace === "reveal") return null;
  if (typeof o.method !== "string" || !o.method) return null;
  return { kind: "reveal", method: o.method, args: Array.isArray(o.args) ? o.args : [] };
}

/** reveal's message to the framing page: an event, or a call's answer. */
export function revealMessage(
  eventName: string,
  state: RevealState,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({ namespace: "reveal", eventName, state, ...extra });
}

/** A RevealHost over a running deck. */
export function revealHost(deck: DeckRuntime): RevealHost {
  const { nav, columns, config, actions } = deck;
  const steps = () => {
    const s = nav.get();
    return { shown: s.click, total: s.totals[`${s.h},${s.v}`] ?? 0 };
  };
  const total = () => columns.reduce((n, c) => n + c.slides.length, 0);
  const flat = () => {
    const s = nav.get();
    return flatIndex(columns, s.h, s.v);
  };
  return {
    state: () => {
      const s = nav.get();
      const f = indexf(steps());
      return {
        indexh: s.h,
        indexv: s.v,
        ...(f === undefined ? {} : { indexf: f }),
        paused: s.paused,
        overview: s.overview,
      };
    },
    totalSlides: total,
    steps,
    routes: () => N.availableRoutes(nav.get(), columns, config),
    progress: () => {
      const t = total();
      return t > 1 ? flat() / (t - 1) : 0;
    },
    scale: () => deck.layout.get().scale,
    autoSliding: () => nav.get().autoSliding,
    isFirst: () => flat() === 0,
    isLast: () => flat() === total() - 1,
    move: (to) => actions[to](),
    goto: (h, v, click) => actions.goto(h, v, click),
    overview: (on) => actions.toggleOverview(on),
    pause: (on) => actions.togglePause(on),
    autoSlide: (on) => {
      if (on === undefined || on !== nav.get().autoSliding) actions.toggleAutoSlide();
    },
    help: (on) => actions.toggleHelp(on),
    jump: (on) => actions.toggleJump(on),
  };
}

/**
 * Mounted by the deck (react/Deck.tsx): answer the framing page's calls, and with
 * `postMessageEvents` tell it every event. A projector, which takes no input, only tells.
 */
export function useHostMessages(deck: DeckRuntime, { projector }: { projector: boolean }): void {
  const { config, mode, events, commands } = deck;
  useEffect(() => {
    if (typeof window === "undefined" || mode !== "play") return;
    const parent = window.parent !== window ? window.parent : null;
    const opener = (window.opener as Window | null) ?? null;
    if (!parent && !opener) return;
    const host = revealHost(deck);
    const offs: Array<() => void> = [];

    if (config.postMessageEvents && parent) {
      offs.push(
        events.on("*", (e) => {
          try {
            parent.postMessage(revealMessage(e.type, host.state()), "*");
          } catch {
            /* a parent that has gone away */
          }
        }),
      );
    }

    if (config.postMessage && !projector) {
      // The editor's preview shell answers Kadal's own protocol itself.
      const shell = new URLSearchParams(window.location.search).has("preview");
      const onMessage = (e: MessageEvent) => {
        const from = e.source as Window | null;
        if (!from || (from !== parent && from !== opener)) return;
        const m = parseHostMessage(e.data);
        if (!m) return;
        const reply = (message: unknown) => {
          try {
            from.postMessage(message, "*");
          } catch {
            /* gone */
          }
        };
        if (m.kind === "reveal") {
          const call = REVEAL_METHODS[m.method];
          if (!call) return;
          const result = call(host, m.args);
          reply(revealMessage("callback", host.state(), { method: m.method, result }));
          return;
        }
        if (shell) return;
        if (m.kind === "commands") {
          reply({ kadal: 1, type: "commands:list", seq: m.seq, commands: commands.list() });
          return;
        }
        void commands
          .run(m.id, m.params, "api")
          .then((result) => reply({ kadal: 1, type: "command:result", seq: m.seq, result }));
      };
      window.addEventListener("message", onMessage);
      offs.push(() => window.removeEventListener("message", onMessage));
    }
    return () => {
      for (const off of offs) off();
    };
    // `deck` is read through its stores; these are what decide whether to listen at all.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [config, mode, events, commands, projector, deck.columns, deck.nav, deck.actions]);
}
