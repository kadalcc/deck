/**
 * `@kadal/deck/runtime`: compile a deck from its text in the browser, and the message types an
 * editor uses to drive the prebuilt shell (`@kadal/deck/shell`, files in dist/shell/) in an iframe.
 */
export {
  type CompileDeckOptions,
  type CompiledDeck,
  type Diagnostic,
  compileDeck,
} from "./compile.ts";
export {
  type FromPreview,
  type OutlineEntry,
  type ToPreview,
  isFromPreview,
  isToPreview,
} from "./protocol.ts";
export { type ShellOptions, shellBase, startShell } from "./shell.tsx";
export { type MonacoHost, type MonacoLoader, registerMonacoLoader } from "../monaco/loader.ts";
