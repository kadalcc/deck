/**
 * The side editor's contract between the engine (react/SideEditor.tsx, the panel) and its
 * CodeMirror module (editor/side-editor.ts), which only `kadal-deck dev` loads — so the engine
 * names the shapes here without importing a line of CodeMirror.
 */

export interface SideEditorOptions {
  text: string;
  /** Every change, with the whole text. */
  onChange: (text: string) => void;
  /** Cmd/Ctrl+S. */
  onSave: () => void;
  /** Escape with nothing to close in the editor: give the deck its keys back. */
  onEscape: () => void;
  /** The accessible name of the text area. */
  label: string;
}

export interface SideEditorHandle {
  getText(): string;
  /** Replace the whole text (another slide was loaded): the undo history starts again. */
  setText(text: string): void;
  focus(): void;
  destroy(): void;
}

/** What the manifest's `sideEditor` loader resolves to. */
export interface SideEditorModule {
  createSideEditor(parent: HTMLElement, options: SideEditorOptions): SideEditorHandle;
}

/** A slide's source as the dev server hands it out (vite/source-dev.ts). */
export interface SlideSourceDraft {
  text: string;
  version: string;
  /** Relative to the deck's folder. */
  file: string;
  /** 1-based line of the text's first line in `file`. */
  line: number;
  head: boolean;
}
