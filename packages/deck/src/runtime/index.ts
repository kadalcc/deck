/**
 * `@kadal/deck/runtime`: compile a deck from its text in the browser, and the message types an
 * editor uses to drive the prebuilt shell (`@kadal/deck-shell`) — or a deck's own editing kit
 * (`__kadal/kit/` of a host build, the same shell with the deck's components) — in an iframe.
 */
export {
  type CompileDeckOptions,
  type CompiledConflict,
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
export {
  type DeckShellProps,
  type KitOptions,
  type ShellOptions,
  DeckShell,
  kitManifest,
  shellBase,
  startShell,
} from "./shell.tsx";
export {
  type ModuleMap,
  MissingModuleError,
  missingModuleMessage,
  moduleKey,
} from "./kit-imports.ts";
export {
  type PackageRegistry,
  type RegisteredPackage,
  createPackageRegistry,
  packageRegistry,
  registerAddon,
  registerTheme,
  resolveRuntimePackages,
} from "../theming/registry.ts";
export { type MonacoHost, type MonacoLoader, registerMonacoLoader } from "../monaco/loader.ts";
