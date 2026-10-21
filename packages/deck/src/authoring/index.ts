/**
 * @kadal/deck/authoring — read, lint and edit a deck as text, for tools: the CLI's `check`, the
 * MCP server, an editor, a hosted service. Files come through a small `DeckFiles` interface (an
 * entry path and a `read`), so nothing here touches a disk; edits return new file text for the
 * caller to save. The linter imports the MDX compiler lazily, only when it compiles.
 */
export {
  type DeckFiles,
  type DeckOutline,
  type OutlineSlide,
  type SlideRef,
  type SplitProblem,
  dirOf,
  estimateClicks,
  findSlide,
  idOf,
  joinPath,
  outlineDeck,
  outlineSlide,
  readDeck,
} from "./source.ts";
export {
  type EditResult,
  type FrontmatterPatch,
  type NewSlide,
  type NotesForm,
  type NotesSource,
  type SlideUpdate,
  EditError,
  NotesConflict,
  addSlide,
  deckOnlyKeys,
  moveSlide,
  notesVersion,
  readNotes,
  removeSlide,
  setNotes,
  updateHeadmatter,
  updateSlide,
  writeNotes,
} from "./edit.ts";
export {
  type DeckExtensions,
  type Diagnostic,
  type LintOptions,
  type LintResult,
  type Severity,
  formatDiagnostics,
  lintDeck,
  readExtensions,
} from "./lint.ts";
export { checkValue, closest } from "./validate.ts";
