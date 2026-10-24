import { type ComponentType, createContext, useContext } from "react";

import type { ClickRegistry } from "../core/clicks.ts";
import type { CommandRegistry } from "../core/commands.ts";
import type { PanelRegistry } from "../core/panels.ts";
import type { Layout } from "../core/layout.ts";
import type {
  Column,
  DeckConfig,
  DeckManifest,
  MagicMoveData,
  SlideMeta,
  SlideOptions,
} from "../core/model.ts";
import type { NavState } from "../core/navigation.ts";
import type { ShortcutRegistry } from "../core/shortcuts.ts";
import type { Store } from "../core/store.ts";
import type { WindowPlace } from "../core/teleprompter.ts";
import type { WindowMessage } from "../core/window-messages.ts";
import type { Via } from "../core/windows.ts";
import type { MenuRegistry } from "./menu.ts";
import type { NotesEditor } from "./notes.ts";
import type { GlossaryEntry } from "../glossary/model.ts";
import type { ResolvedLayers } from "../theming/contract.ts";

/** Which page of the deck app is showing. */
export type ViewMode =
  | "play"
  | "presenter"
  | "audience"
  | "print"
  | "stats"
  | "notes"
  | "remote"
  | "export"
  /** Every slide in a list with a step slider and its notes (react/OverviewPage.tsx). */
  | "overview"
  /** Every slide's notes, editable on one scrolling page (react/NotesEditPage.tsx). */
  | "notes-edit"
  /** The current slide's notes, big, following the presenter (presenter/Teleprompter.tsx). */
  | "teleprompter"
  /** A page of the deck's own, at a path its routes name (react/routes.tsx). */
  | "page";

/** What the lightbox can show; "sketch" is an Excalidraw canvas keyed by its sketch. */
export type LightboxKind = "image" | "video" | "iframe" | "sketch";

export interface UiState {
  help: boolean;
  jump: boolean;
  search: boolean;
  lightbox: { kind: LightboxKind; src: string; fit: string } | null;
  /** The zoomed-in point in stage coordinates, or null. */
  zoom: { x: number; y: number; scale: number } | null;
  drawing: boolean;
  pointer: boolean;
  /**
   * Where a command aimed the laser (the phone remote, an agent), 0–1 across the slide; null when
   * nothing is aiming it and the mouse decides.
   */
  laser: { x: number; y: number } | null;
  spotlight: boolean;
  colorScheme: "light" | "dark";
  cursorHidden: boolean;
  fullscreen: boolean;
  /** The scroll view is on (by config, the `?view=scroll` flag, or a narrow viewport). */
  scroll: boolean;
  /** Shown for a moment when the audience tries a bound key the presenter has disabled, etc. */
  toast: string | null;
  /** Vim's `f`: labels on every link and control, type one to use it. */
  hints: boolean;
  themeMenu: boolean;
  /** This screen's theme — its own choice, kept in the browser; starts at the deck's. */
  theme: string;
  /** Whether this window has a projector window of its own open (the presenter's share button). */
  projectorOpen: boolean;
  /** Whether this window has a teleprompter window of its own open (the presenter's button). */
  teleprompterOpen: boolean;
  /** The presenter's switch: term cards opened here also open on every screen in the room. */
  termSync: boolean;
}

/** The term card on show in this window: which mention of which term, and whose doing. */
export interface TermReveal {
  /** The slide it is on, "h,v". */
  slide: string;
  /** The glossary entry's id, or a one-off `<Term def>`'s. */
  id: string;
  /** Which of the slide's mentions of that term, in document order — every screen runs the same build. */
  n: number;
  /** The related entry the card was swapped to through a "see also" chip, or null. */
  view: string | null;
  /** Opened by a click, a tap or a hint label: stays until dismissed. A hover's card leaves with the pointer. */
  pinned: boolean;
  /** Opened in this window, or relayed from the presenter through the room. */
  from: "local" | "remote";
}

export interface DeckActions {
  next(): void;
  prev(): void;
  nextSlide(): void;
  prevSlide(): void;
  left(): void;
  right(): void;
  up(): void;
  down(): void;
  first(): void;
  last(): void;
  goto(h: number, v?: number, click?: number): void;
  gotoFlat(flat: number): void;
  gotoId(id: string): void;
  /** Follow the presenter's navigation, jumping to where they are — or stop following. */
  setFollow(on: boolean): void;
  /**
   * Open a window that mirrors this deck and nothing else — a second screen, or the one window to
   * share on a call — or close the one this window opened. See `Flags.projector`.
   */
  toggleProjector(force?: boolean): void;
  /**
   * Open the teleprompter window (presenter/Teleprompter.tsx) — at a place on a screen, or as a
   * plain popup to drag — or, when it is open, move it there and bring it forward.
   */
  openTeleprompter(place?: WindowPlace | null): void;
  closeTeleprompter(): void;
  toggleOverview(force?: boolean): void;
  togglePause(force?: boolean): void;
  toggleHelp(force?: boolean): void;
  toggleJump(force?: boolean): void;
  toggleSearch(force?: boolean): void;
  toggleFullscreen(): void;
  toggleAutoSlide(): void;
  toggleDrawing(force?: boolean): void;
  togglePointer(force?: boolean): void;
  toggleColorScheme(): void;
  setColorScheme(scheme: "light" | "dark"): void;
  toggleHints(force?: boolean): void;
  toggleThemeMenu(force?: boolean): void;
  toggleTermSync(force?: boolean): void;
  setTheme(name: string): void;
  openPresenter(): void;
  openLightbox(kind: LightboxKind, src: string, fit?: string): void;
  closeLightbox(): void;
  zoomTo(x: number, y: number): void;
  zoomOut(): void;
  toast(message: string): void;
}

/**
 * Where a navigation change came from, while it is being applied: the cross-window channel, the
 * live room, the deck's own auto-slide — or nowhere, which means a person, here. A window
 * forwards only what originated locally, or two windows would relay stale positions to each other
 * forever; and only a move with no source at all ends this window's follow (see `NavState.follow`
 * and `withTransition` in Deck.tsx).
 */
export type SyncSource = "channel" | "room" | "auto" | null;

export interface DeckRuntime {
  manifest: DeckManifest;
  config: DeckConfig;
  columns: Column[];
  /** Per-slide resolved options, keyed "h,v". */
  options: Map<string, SlideOptions>;
  nav: Store<NavState>;
  ui: Store<UiState>;
  layout: Store<Layout>;
  mode: ViewMode;
  /** The URL base of the deck app, e.g. "/showcase/". */
  base: string;
  components: Record<string, ComponentType<Record<string, unknown>>>;
  actions: DeckActions;
  /**
   * Everything a person can do here, as commands: what the keyboard, the toolbar, the phone remote
   * and an agent all call. See core/commands.ts.
   */
  commands: CommandRegistry;
  /**
   * The presenter ticket this window holds (live/ticket.ts), or null: for a host's own extensions
   * running in the page — a hosted assistant — to make presenter calls to the host. In memory only.
   */
  ticket: () => string | null;
  /** A window-scoped id, so a window ignores its own broadcast. */
  windowId: string;
  /** Set while a remote position is being applied (store listeners run synchronously). */
  sync: { source: SyncSource };
  /** Whether this window is the presenter (drives the room and the audience). */
  isPresenter: boolean;
  /** Whether this window is a projector: it follows, always, and takes no input. */
  projector: boolean;
  /** The term card this window is showing, or null. One at a time. */
  terms: Store<TermReveal | null>;
  /** Definitions by id: the deck's glossary, plus every mounted one-off `<Term def>`. */
  glossary: Map<string, GlossaryEntry>;
  /** Tabs a host adds to the presenter's sidebar (a hosted assistant). See core/panels.ts. */
  panels: PanelRegistry;
  /**
   * Room the play view keeps clear of the slide, in px from the viewport's right and bottom edges:
   * the ad frame's (core/ads.ts). The layout fits the slide into what is left.
   */
  stageInset: Store<StageInset>;
  /**
   * The global and slide layers to draw, each a stack (the theme's, the addons', the deck's):
   * react/Layers.tsx. Absent when a runtime is made by hand (a test, an old host).
   */
  layers?: ResolvedLayers;
  /**
   * The keyboard's bindings, defaults and custom ones (core/shortcuts.ts): `add` layers more on
   * top — from an addon's setup, a component, the console — and the help sheet lists them all.
   */
  shortcuts: ShortcutRegistry;
  /** The right-click menu's items, and `add` for more (react/ContextMenu.tsx). */
  menu: MenuRegistry;
  /** Where edited speaker notes are saved, or null where they are read-only (react/notes.ts). */
  notesEditor: NotesEditor | null;
  /** The deck's own pages (react/routes.tsx): `api.addRoute` adds to it. */
  routes?: import("./routes.tsx").RouteRegistry;
  /**
   * This deck's other windows in this browser, for what is said besides positions (the runtime
   * keeps those in step itself): the presenter's timer and room for the teleprompter
   * (core/window-messages.ts). `post` will not send a `nav`. Absent when a runtime is made by hand.
   */
  windows?: DeckWindows;
}

export interface DeckWindows {
  post(message: Exclude<WindowMessage, { type: "nav" }>): void;
  subscribe(
    listener: (message: Exclude<WindowMessage, { type: "nav" }>, via: Via) => void,
  ): () => void;
}

export interface StageInset {
  right: number;
  bottom: number;
  /**
   * Whether the controls keep to the slide's area too. They do beside a side frame; under a
   * stacked one (a phone) they stay along the bottom of the screen, below the ads.
   */
  chrome?: boolean;
}

export const DeckContext = createContext<DeckRuntime | null>(null);

export function useDeck(): DeckRuntime {
  const ctx = useContext(DeckContext);
  if (!ctx) throw new Error("useDeck must be used inside <Deck>");
  return ctx;
}

/** What one mounted slide knows about itself. */
export interface SlideContextValue {
  meta: SlideMeta;
  options: SlideOptions;
  h: number;
  v: number;
  /** The slide currently shown (as opposed to a preloaded neighbour, an overview tile, a print page). */
  active: boolean;
  /** The click to render at. Past slides render fully clicked, future ones at 0. */
  click: number;
  registry: ClickRegistry;
  magic: MagicMoveData[] | null;
  /** True inside the presenter's next-slide preview, the overview and print: no media, no autoplay. */
  preview: boolean;
  /** Whether glossary terms respond here (see `SlideFrameProps.terms`). */
  terms: boolean;
}

export const SlideContext = createContext<SlideContextValue | null>(null);

export function useSlide(): SlideContextValue {
  const ctx = useContext(SlideContext);
  if (!ctx) throw new Error("This component must be used inside a slide");
  return ctx;
}

export function useSlideOptional(): SlideContextValue | null {
  return useContext(SlideContext);
}
