import type { CommandInfo, CommandResult } from "../core/commands.ts";
import type { CompiledConflict, Diagnostic } from "./compile.ts";

/**
 * The preview bridge: what an editor page and the shell in its iframe (`?preview`) say to each
 * other over `postMessage`. Every message carries `kadal: 1` so other traffic on the window is
 * ignored. The shell only listens to its own parent.
 */

export interface OutlineEntry {
  index: number;
  id: string;
  title: string | null;
  layout: string | null;
  hasNotes: boolean;
  /** 1-based line of the slide in its file. */
  line: number;
  file: string;
}

/** Editor → shell. */
export type ToPreview =
  | {
      kadal: 1;
      type: "source";
      /** deck.mdx */
      text: string;
      /** Included files and glossary.yaml, by path. */
      files?: Record<string, string>;
      /** Jump here after compiling (flat index), instead of staying where the viewer was. */
      at?: number;
    }
  | { kadal: 1; type: "command"; seq: number; id: string; params?: unknown }
  | { kadal: 1; type: "commands"; seq: number }
  /**
   * Arm a one-shot pick: the next click on the slide is reported as `picked` (for comments).
   * Arming it turns editing in place off.
   */
  | { kadal: 1; type: "pick"; on: boolean }
  /**
   * Editing in place on or off (only when `ready.features` has "edit"). While on, a hover outlines
   * the element under the pointer, a click is reported as `located`, and a double-click on text
   * that is one plain run of the source lets the person retype it, reported as `edited`. Arming
   * it turns a pending pick off; the two never run at once. The shell never changes the deck:
   * answer every `edited` by sending `source` again, changed or not (an element whose edit no
   * source answers within 5 s is put back as it was).
   */
  | { kadal: 1; type: "edit"; on: boolean }
  /**
   * The play view's own chrome on or off (only when `ready.features` has "chrome"; on by default,
   * and kept across recompiles). Off hides what the shell draws over the slides for a viewer —
   * the arrows pill with the slide number, the corner tools (back to start, a deck's own nav
   * buttons), the progress bar, a standalone slide number, the notes footer, the theme button
   * and the unknown-theme notice — for an editor whose stage has its own. The free plan's
   * watermark and ads, the premium notice, and what a key or the slide opens (help, jump-to,
   * search, pause, toasts, confetti) are not chrome and stay.
   */
  | { kadal: 1; type: "chrome"; on: boolean };

/** Shell → editor. */
export type FromPreview =
  | {
      kadal: 1;
      type: "ready";
      version: string;
      /** Present when this is a deck's own editing kit, not the generic shell. */
      kit?: { kitVersion: number; engine: string; modules: string[]; snippets?: string[] };
      /**
       * What this shell can do beyond the messages every shell answers: "edit" = editing in
       * place (`edit`, `edited`, `located`; 0.6.1), "chrome" = the `chrome` message (0.6.2).
       * Absent from shells before 0.6.1.
       */
      features?: string[];
    }
  | {
      kadal: 1;
      type: "compiled";
      ok: boolean;
      diagnostics: Diagnostic[];
      outline: OutlineEntry[];
      ms: number;
      /** Unresolved merge conflicts left in the source (absent from shells before 0.5). */
      conflicts?: CompiledConflict[];
    }
  | { kadal: 1; type: "nav"; index: number; click: number; clicks: number; total: number }
  | { kadal: 1; type: "command:result"; seq: number; result: CommandResult }
  | { kadal: 1; type: "commands:list"; seq: number; commands: CommandInfo[] }
  | {
      kadal: 1;
      type: "picked";
      /** Flat index of the slide clicked. */
      index: number;
      /** 0–1 across the slide. */
      x: number;
      y: number;
      /** A short excerpt of the clicked element's text, to anchor a comment to. */
      text: string;
      /** The clicked element's tag and classes, e.g. "h2.title". */
      element: string;
    }
  /**
   * Editing in place saved an edit: replace `from`–`to` of `file` (UTF-16 offsets into that
   * file's text exactly as the last `source` sent it: "deck.mdx" is `source.text`, any other name
   * a key of `source.files`; headmatter and frontmatter count) with `after`. `before` is
   * `text.slice(from, to)` as it was then — check it still is before applying, since the text may
   * have changed since. `after` is plain text as typed (one line, except in a paragraph, where
   * line breaks are spelled as the file spells them); escaping Markdown in it is the editor's call.
   */
  | {
      kadal: 1;
      type: "edited";
      file: string;
      from: number;
      to: number;
      before: string;
      after: string;
    }
  /**
   * A click while editing in place: where the clicked thing is in the source (1-based line and
   * column, and the same place as a UTF-16 offset), for the editor to put its cursor there. On
   * editable text it is the character clicked; on anything else the element's start, or the
   * slide's first line when the element has no position of its own.
   */
  | { kadal: 1; type: "located"; file: string; line: number; column: number; offset: number }
  /**
   * A button on a conflicted slide's card was pressed: settle that conflict of that file
   * (`resolveConflict(text, choice, which)` from `@kadal/deck/sync`; `which` counts the file's
   * conflicts from 0) and send the source again. `slide` is the flat index of the card's slide.
   */
  | {
      kadal: 1;
      type: "conflict:resolve";
      file?: string;
      which: number;
      choice: "ours" | "theirs" | "both";
      slide?: number;
    };

export const isToPreview = (data: unknown): data is ToPreview =>
  !!data && typeof data === "object" && (data as { kadal?: unknown }).kadal === 1;
export const isFromPreview = (data: unknown): data is FromPreview =>
  !!data && typeof data === "object" && (data as { kadal?: unknown }).kadal === 1;
