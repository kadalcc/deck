/**
 * @kadal/deck — the engine's public surface.
 *
 *   import { Deck } from "@kadal/deck";           the runtime
 *   import deck from "virtual:deck";               the manifest the Vite plugin builds from deck.mdx
 *   import "@kadal/deck/styles.css";               the base stylesheet (layout, transitions, chrome)
 *   import "@kadal/deck/themes/minimal.css";       a theme (minimal · rla · stack)
 */
export { Deck, type DeckProps } from "./react/Deck.tsx";
export {
  DECK_RENDERER,
  Island,
  loadRenderer,
  registerBuiltinRenderers,
  registerLazyRenderer,
  registerRenderer,
  resolveRenderer,
  resolveRendererAsync,
  type ClientStrategy,
  type DeckRenderer,
  type IslandLoader,
  type IslandMount,
  type IslandProps,
  type RenderContext,
  type RendererLoader,
} from "./renderers/index.ts";
export { useMDXComponents } from "./react/mdx.tsx";
export {
  DeckContext,
  SlideContext,
  useDeck,
  useSlide,
  useSlideOptional,
  type DeckRuntime,
  type SlideContextValue,
  type ViewMode,
  type UiState,
  type DeckActions,
  type TermReveal,
} from "./react/context.ts";
export {
  useActions,
  useClick,
  useClickIndex,
  useConfig,
  useCurrentSlide,
  useLayout,
  useNav,
  useUi,
} from "./react/hooks.ts";
export { SlideFrame, loadSlide } from "./react/SlideFrame.tsx";
export { BackgroundLayer, registerBackground, backgroundComponent } from "./react/Backgrounds.tsx";
export { LAYOUTS, type LayoutProps } from "./react/layouts.tsx";
export * from "./components/index.ts";
export {
  DEFAULT_CONFIG,
  readHostOverride,
  resolveConfig,
  roomIdOf,
  withHostOverride,
  type HostOverride,
  resolveSlideOptions,
  resolveBackground,
  columnsOf,
  type DeckConfig,
  type DeckConfigInput,
  type DeckManifest,
  type SlideMeta,
  type SlideOptions,
  type SlideBackground,
  type Column,
  type Transition,
} from "./core/model.ts";
export {
  DEFAULT_GLOSSARY,
  buildMatcher,
  inlineHtml,
  termId,
  type GlossaryEntry,
  type GlossaryOptions,
  type TermMatcher,
} from "./glossary/model.ts";
export { closeTerm, openTerm } from "./react/terms.ts";
export { KEY_BINDINGS, type KeyAction } from "./core/keyboard.ts";
export {
  type CommandEvent,
  type CommandGroup,
  type CommandInfo,
  type CommandOrigin,
  type CommandRegistry,
  type CommandResult,
  type CommandSpec,
  createCommandRegistry,
  KEY_COMMANDS,
  paramsSchema,
} from "./core/commands.ts";
export {
  createPanelRegistry,
  type HostPanel,
  type PanelRegistry,
  type PanelsState,
} from "./core/panels.ts";
export { cmd, deckState, useCommand, useCommandList } from "./react/commands.ts";
export { formatHash, parseHash, parseFlags } from "./core/hash.ts";
export { createStore, useStore, type Store } from "./core/store.ts";
export * as navigation from "./core/navigation.ts";
export type { NavState, Position, Direction } from "./core/navigation.ts";
export { HintLayer } from "./react/Hints.tsx";
export { ThemeMenu } from "./react/ThemeMenu.tsx";
export { FrameShell } from "./react/Frame.tsx";
// Presenting: slide lifecycle, direction, shortcuts, the context menu, notes editing, the timer.
export {
  onSlideEnter,
  onSlideLeave,
  useIsSlideActive,
  useNavDirection,
  useSlideEnter,
  useSlideLeave,
  type SlideLifecycleEvent,
} from "./react/lifecycle.ts";
export { navDirection, type NavDirection } from "./core/direction.ts";
export {
  createShortcutRegistry,
  defaultShortcuts,
  defineShortcuts,
  keyLabel,
  resolveShortcuts,
  type ResolvedShortcut,
  type Shortcut,
  type ShortcutConflict,
  type ShortcutRegistry,
  type ShortcutsInput,
} from "./core/shortcuts.ts";
export {
  createMenuRegistry,
  defaultMenuItems,
  type MenuInput,
  type MenuItem,
  type MenuRegistry,
} from "./react/menu.ts";
export {
  devNotesEditor,
  useNotesEditor,
  useSlideNotes,
  type NotesDraft,
  type NotesEditor,
  type NotesSaveResult,
} from "./react/notes.ts";
export { NotesView, type NotesViewProps } from "./react/NotesView.tsx";
export { CLICK_MARKER, notesForClick, splitNotes, type NotesPart } from "./core/notes-markers.ts";
export {
  formatClock,
  parseDuration,
  readTimer,
  type TimerMode,
  type TimerReading,
  type TimerState,
} from "./core/timer.ts";
export { plannedLength, presenterTimer } from "./react/pacing.ts";
export { DEFAULT_FILTERS, filterCss, type DisplayFilters } from "./core/filters.ts";
export { filtersStore, setFilters } from "./react/DisplaySettings.tsx";
