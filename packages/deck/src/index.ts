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
  resolveConfig,
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
export { formatHash, parseHash, parseFlags } from "./core/hash.ts";
export { createStore, useStore, type Store } from "./core/store.ts";
export * as navigation from "./core/navigation.ts";
export type { NavState, Position, Direction } from "./core/navigation.ts";
export { HintLayer } from "./react/Hints.tsx";
export { ThemeMenu } from "./react/ThemeMenu.tsx";
export { FrameShell } from "./react/Frame.tsx";
