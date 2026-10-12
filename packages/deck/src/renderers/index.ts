/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RENDERERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The seam that lets a slide hold a component from any framework. See `contract.ts` for the
 * reasoning; the short version is that the engine knows how to put a component into an element and
 * take it out again, and nothing else about it.
 *
 *     import { Island, registerRenderer, webComponentsRenderer } from "@kadal/deck/renderers";
 *
 *     registerRenderer(webComponentsRenderer);
 *
 *     <Island component="my-chart" props={{ data }} client="slide" />
 *
 * React and custom elements ship with the engine. Every other framework is a package that exports a
 * `DeckRenderer` and registers it — that is the whole extension point, and it is deliberately small
 * enough to write for a framework the engine has never heard of.
 *
 * Those packages must import `@kadal/deck/renderers/contract`, NOT this barrel. This file pulls in
 * React, the island and the built-in registration; a Vue package that reached for it would drag a
 * second framework into a deck that never asked for one. The contract module is types, a registry
 * and a symbol — no framework at all.
 */

export {
  DECK_RENDERER,
  clearRenderers,
  knownRendererNames,
  loadRenderer,
  nativeRenderer,
  registerLazyRenderer,
  registerRenderer,
  registeredRenderers,
  rendererNamed,
  resolveRenderer,
  resolveRendererAsync,
  type DeckRenderer,
  type IslandComponent,
  type IslandMount,
  type IslandProps,
  type MarkedComponent,
  type RenderContext,
  type RendererLoader,
  type Resolution,
} from "./contract.ts";

export { Island, type ClientStrategy, type IslandLoader, type IslandOwnProps } from "./Island.tsx";
export { reactRenderer } from "./react.tsx";
export { webComponentsRenderer } from "./web-components.ts";

import { registerBuiltinRenderers } from "./builtins.ts";

export { registerBuiltinRenderers };

// Importing this module registers them, for code that reaches the renderers without `Island`.
// `Island` registers them as well (see Island.tsx): `@kadal/deck` re-exports `Island` through this
// barrel, and a bundler links a side-effect-free barrel through rather than evaluating it — so a
// registration that lived only here never ran in a production build.
registerBuiltinRenderers();
