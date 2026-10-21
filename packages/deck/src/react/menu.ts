import type { DeckRuntime } from "./context.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CONTEXT MENU'S ITEMS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Right-click on a slide (or Shift+F10, or the menu key) opens a menu of what the deck can do
 * from there: move, the overview, the presenter view, the notes, full screen, light or dark,
 * the pen and the laser, the display settings, export. Every built-in item runs a command from
 * the registry (core/commands.ts), so the menu, the keyboard, a phone and an agent do the same
 * thing — and an item whose command cannot run here (no presenter on a projector, say) is not
 * offered at all.
 *
 * A deck adds its own, Slidev's `setup/context-menu.ts` as data:
 *
 *   <Deck contextMenu={(items) => [...items, { id: "tweet", label: "Share", run: () => … }]} />
 *   deck.menu.add({ id: "x", label: "…", command: "view.overview" })   // returns a remover
 *
 * `contextMenu: false | "dev" | "build"` in the headmatter switches the whole menu off, or on
 * for one of the two only. Shift + right-click always gives the browser's own menu.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MenuItem {
  /** Stable, for replacing or removing an item: "nav.next", "my.share". */
  id: string;
  label: string;
  /** A Lucide icon name (components/bling.tsx `Icon`). */
  icon?: string;
  /** The keys that do the same, printed on the right. */
  keys?: string;
  /** Run this command (with `params`) … */
  command?: string;
  params?: Record<string, unknown>;
  /** … or this. */
  run?: (deck: DeckRuntime) => void;
  /** Shown ticked (a toggle that is on). */
  checked?: boolean | ((deck: DeckRuntime) => boolean);
  /** Shown but not usable. Items whose `command` is unavailable are left out instead. */
  disabled?: boolean | ((deck: DeckRuntime) => boolean);
  /** Hidden when this says no. */
  when?: (deck: DeckRuntime) => boolean;
  /** A line above this item. */
  separator?: boolean;
}

export type MenuInput = MenuItem[] | ((defaults: MenuItem[]) => MenuItem[]);

export interface MenuRegistry {
  /** Items after the built-in ones (an addon's, a component's); the function removes them. */
  add(items: MenuItem | MenuItem[]): () => void;
  /** The `contextMenu` prop of `<Deck>` (the runtime sets it). */
  configure(input: MenuInput | null): void;
  /** What the menu shows now, before `when`/command filtering. */
  items(defaults: MenuItem[]): MenuItem[];
}

export function createMenuRegistry(): MenuRegistry {
  const added: MenuItem[][] = [];
  let input: MenuInput | null = null;
  return {
    add(items) {
      const layer = Array.isArray(items) ? [...items] : [items];
      added.push(layer);
      return () => {
        const i = added.indexOf(layer);
        if (i !== -1) added.splice(i, 1);
      };
    },
    configure(next) {
      input = next;
    },
    items(defaults) {
      const base =
        typeof input === "function"
          ? input(defaults.map((d) => ({ ...d })))
          : [...defaults, ...(input ?? [])];
      const extra = added.flat();
      // A later item with an id already shown replaces it in place.
      const out = [...base];
      for (const item of extra) {
        const i = out.findIndex((o) => o.id === item.id);
        if (i === -1) out.push(item);
        else out[i] = item;
      }
      return out;
    },
  };
}

/** Is the menu on in this build? */
export function menuEnabled(setting: boolean | "dev" | "build", dev: boolean): boolean {
  if (setting === "dev") return dev;
  if (setting === "build") return !dev;
  return setting;
}

/** The built-in items (each one a command, so the same rules decide whether it can run). */
export function defaultMenuItems(deck: DeckRuntime): MenuItem[] {
  const ui = () => deck.ui.get();
  return [
    { id: "nav.prev", label: "Previous", icon: "arrow-left", keys: "K", command: "nav.prev" },
    { id: "nav.next", label: "Next", icon: "arrow-right", keys: "Space", command: "nav.next" },
    {
      id: "view.overview",
      label: "Overview",
      icon: "layout-grid",
      keys: "O",
      command: "view.overview",
      separator: true,
      when: () => deck.mode === "play",
    },
    {
      id: "page.overview",
      label: "All slides, with steps and notes",
      icon: "list",
      run: () => openPage(deck, "overview"),
    },
    {
      id: "view.presenter",
      label: "Presenter view",
      icon: "presentation",
      keys: "S",
      command: "view.presenter",
    },
    {
      id: "page.notes",
      label: "Speaker notes",
      icon: "notebook-text",
      run: () => openPage(deck, deck.notesEditor ? "notes-edit" : "notes"),
      when: () => deck.columns.some((c) => c.slides.some((s) => s.hasNotes)) || !!deck.notesEditor,
    },
    {
      id: "view.fullscreen",
      label: "Full screen",
      icon: "maximize",
      keys: "Shift F",
      command: "view.fullscreen",
      separator: true,
      checked: () => ui().fullscreen,
    },
    {
      id: "view.colorScheme",
      label: "Dark",
      icon: "moon",
      keys: "D",
      command: "view.colorScheme",
      checked: () => ui().colorScheme === "dark",
    },
    {
      id: "view.settings",
      label: "Display settings…",
      icon: "sliders-horizontal",
      keys: ",",
      command: "view.settings",
      params: { on: true },
    },
    {
      id: "draw.toggle",
      label: "Draw",
      icon: "pencil",
      keys: "C",
      command: "draw.toggle",
      separator: true,
      checked: () => ui().drawing,
    },
    {
      id: "present.pointer",
      label: "Laser pointer",
      icon: "mouse-pointer-2",
      keys: "X",
      command: "present.pointer",
      checked: () => ui().pointer,
    },
    {
      id: "page.export",
      label: "Export…",
      icon: "download",
      separator: true,
      run: () => {
        window.location.href = `${deck.base}export`;
      },
    },
  ];
}

/** Another page of this deck, in a tab of its own (the deck keeps its place). */
function openPage(deck: DeckRuntime, page: string) {
  window.open(`${deck.base}${page}`, `deck-${page}-${deck.config.slug || "deck"}`);
}
