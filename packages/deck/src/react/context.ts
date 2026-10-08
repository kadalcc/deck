import { type ComponentType, createContext, useContext } from "react";

import type { ClickRegistry } from "../core/clicks.ts";
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
import type { Store } from "../core/store.ts";
import type { GlossaryEntry } from "../glossary/model.ts";

/** Which page of the deck app is showing. */
export type ViewMode = "play" | "presenter" | "audience" | "print" | "stats" | "notes";

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
