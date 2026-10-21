/**
 * `@kadal/deck/monaco`: for a page that bundles Monaco itself and compiles decks in the browser —
 * the prebuilt shell (packages/deck-shell/src/monaco.ts) is the one in this repo. It imports
 * Monaco and its workers with its bundler, then:
 *
 *   registerMonacoLoader(() =>
 *     createMonacoHost({ monaco, workers, grammar: bundledGrammar, themes: bundledThemes(light, dark) }));
 *
 * A deck built with the Vite plugin needs none of this: `virtual:deck/monaco` does it.
 */
export { type MonacoHostInput, createMonacoHost } from "./host.ts";
export { bundledGrammar, bundledThemes } from "./bundled.ts";
export { type MonacoHost, type MonacoLoader, registerMonacoLoader } from "./loader.ts";
