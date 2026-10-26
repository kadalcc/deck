import { createStore, type Store } from "./store.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HOST PANELS  —  tabs a host adds to the presenter's sidebar
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A host runs its own code on the page: deck.kadal.cc injects an assistant. Rather than float a
 * button over the presenter view, that code registers a panel here. The presenter's sidebar gives
 * the panel a tab beside Room, Questions and Polls, and an element to render into.
 *
 *   const off = window.__deck.panels.register({
 *     id: "copilot", title: "Copilot", icon: "sparkles", accent: "ai",
 *     mount(el) { render(<App />, el); return () => unmount(el); },
 *   });
 *
 * Every tab shows its title: beside the icon in the open sidebar, small under it in the folded
 * rail. `accent: "ai"` dresses the tab as AI — the iris-to-teal gradient on its icon, a gradient
 * hairline and tint, the label in the AI ink — the accent deck.kadal.cc gives everything a model
 * does, recreated in the presenter's CSS (themes/live.css, `--deck-ai-*`). A panel without it is
 * an ordinary tab; one with the id "copilot" gets the accent unless it says `accent: "none"`.
 *
 * `mount` runs once, the first time the tab is shown. The element then stays in the page, hidden
 * while another tab is on, so whatever the panel holds (a chat) survives switching tabs. `open`
 * asks the sidebar to show a panel (a host's own shortcut). The registry is plain data, so the
 * host's script needs nothing from this package to use it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface HostPanel {
  /** Unique among panels, e.g. "copilot". */
  id: string;
  /** The tab's label. */
  title: string;
  /** A lucide icon name for the tab and the collapsed rail; a generic one when absent or unknown. */
  icon?: string;
  /**
   * How the tab is dressed. "ai": the AI accent (a model is behind this panel). "none": plain,
   * even for the id "copilot". Absent: plain, except that a "copilot" panel takes "ai".
   */
  accent?: "ai" | "none";
  /** Render into `el`. Called once, the first time the tab is shown; may return a cleanup. */
  mount: (el: HTMLElement) => void | (() => void);
}

/** The accent a panel's tab is drawn with (see `HostPanel.accent`). */
export function panelAccent(panel: Pick<HostPanel, "id" | "accent">): "ai" | null {
  if (panel.accent === "ai") return "ai";
  if (panel.accent === undefined && panel.id === "copilot") return "ai";
  return null;
}

export interface PanelsState {
  panels: HostPanel[];
  /** A panel a host asked to show, until the sidebar does. */
  requested: string | null;
}

export interface PanelRegistry {
  state: Store<PanelsState>;
  /** Add a panel (replacing one with the same id). Returns a function that removes it. */
  register(panel: HostPanel): () => void;
  /** Ask the presenter's sidebar to open on this panel. */
  open(id: string): void;
  list(): HostPanel[];
}

const valid = (p: HostPanel | null | undefined): p is HostPanel =>
  !!p &&
  typeof p.id === "string" &&
  p.id.length > 0 &&
  typeof p.title === "string" &&
  typeof p.mount === "function";

export function createPanelRegistry(): PanelRegistry {
  const state = createStore<PanelsState>({ panels: [], requested: null });
  return {
    state,
    register(panel) {
      if (!valid(panel)) throw new Error("A panel needs an id, a title and a mount function.");
      state.update((s) => ({
        ...s,
        panels: [...s.panels.filter((p) => p.id !== panel.id), panel],
      }));
      return () =>
        state.update((s) => ({
          panels: s.panels.filter((p) => p !== panel),
          requested: s.requested === panel.id ? null : s.requested,
        }));
    },
    open(id) {
      state.update((s) => ({ ...s, requested: id }));
    },
    list: () => state.get().panels,
  };
}
