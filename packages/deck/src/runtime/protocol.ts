import type { CommandInfo, CommandResult } from "../core/commands.ts";
import type { Diagnostic } from "./compile.ts";

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
  /** Arm a one-shot pick: the next click on the slide is reported as `picked` (for comments). */
  | { kadal: 1; type: "pick"; on: boolean };

/** Shell → editor. */
export type FromPreview =
  | { kadal: 1; type: "ready"; version: string }
  | {
      kadal: 1;
      type: "compiled";
      ok: boolean;
      diagnostics: Diagnostic[];
      outline: OutlineEntry[];
      ms: number;
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
    };

export const isToPreview = (data: unknown): data is ToPreview =>
  !!data && typeof data === "object" && (data as { kadal?: unknown }).kadal === 1;
export const isFromPreview = (data: unknown): data is FromPreview =>
  !!data && typeof data === "object" && (data as { kadal?: unknown }).kadal === 1;
