import YAML from "yaml";

import { cutDeck } from "../compiler/split.ts";
import { type MarkerLabels, diff3, markerLines, merge2 } from "./diff.ts";
import { markerBlocks, resolveMarkers } from "./markers.ts";
import {
  type Conflict,
  type MergeOptions,
  type SourceFiles,
  mergeMdx,
  slideAtLine,
} from "./mdx.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MERGING A DECK'S SOURCE: every editable file at once
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The one merge the CLI's `pull`, the engine's MCP server, the web builder's rebase and the
 * remote MCP all run. Per path: what only one side changed (or added, or deleted) is taken;
 * what both changed is merged by kind — deck files slide by slide (sync/mdx.ts), data line by
 * line and then checked it still parses, drawings never line-merged (an SVG or a scene merged
 * by lines is a broken picture, so two edits of one drawing are a conflict).
 *
 * A file one side deleted and the other edited is kept, wrapped whole in markers whose deleting
 * side's label ends with DELETED_FILE_SUFFIX: choosing that side resolves to the empty string,
 * which callers take as "delete the file".
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const DELETED_FILE_SUFFIX = " (deleted this file)";

export interface MergeResult {
  /** Every file after the merge (conflicted ones with markers in them). */
  files: SourceFiles;
  /** Paths `ours` has that the merge removes: delete them from the working tree. */
  deleted: string[];
  conflicts: Conflict[];
  /** No conflicts. */
  clean: boolean;
}

const labelsOf = (o: MergeOptions): MarkerLabels => ({
  ours: o.oursLabel?.trim() || "ours",
  theirs: o.theirsLabel?.trim() || "theirs",
  base: o.baseLabel?.trim() || "base",
});

const isDeck = (p: string) => /\.mdx?$/i.test(p);
const isDrawing = (p: string) => /\.(svg|excalidraw)$/i.test(p);

/** Does the merged data still parse? A clean line merge of JSON can still be broken JSON. */
function parses(path: string, text: string): boolean {
  try {
    if (/\.json$/i.test(path)) JSON.parse(text);
    else if (/\.ya?ml$/i.test(path)) YAML.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Two edits of a non-deck text file. */
function mergeText(
  path: string,
  base: string | undefined,
  ours: string,
  theirs: string,
  labels: MarkerLabels,
): { text: string; conflicts: Conflict[] } {
  const whole = (): { text: string; conflicts: Conflict[] } => {
    const c = {
      ours: ours.split("\n"),
      base: base === undefined ? null : base.split("\n"),
      theirs: theirs.split("\n"),
    };
    return {
      text: markerLines(c, labels).join("\n"),
      conflicts: [
        {
          path,
          kind: base === undefined ? "add-add" : "content",
          ours,
          theirs,
          base: base ?? null,
          line: 1,
        },
      ],
    };
  };
  if (isDrawing(path)) return whole();
  const crlf = /\r\n/.test(ours);
  const n = (s: string) => s.replace(/\r\n?/g, "\n").split("\n");
  const chunks =
    base === undefined ? merge2(n(ours), n(theirs)) : diff3(n(base), n(ours), n(theirs));
  const lines: string[] = [];
  const conflicts: Conflict[] = [];
  for (const c of chunks) {
    if ("ok" in c) lines.push(...c.ok);
    else {
      conflicts.push({
        path,
        kind: base === undefined ? "add-add" : "content",
        ours: c.conflict.ours.join("\n"),
        theirs: c.conflict.theirs.join("\n"),
        base: c.conflict.base ? c.conflict.base.join("\n") : null,
        line: lines.length + 1,
      });
      lines.push(...markerLines(c.conflict, labels));
    }
  }
  let text = lines.join("\n");
  if (!conflicts.length && !parses(path, text)) return whole();
  if (crlf) text = text.replace(/\n/g, "\r\n");
  return { text, conflicts };
}

/**
 * Merge a deck's editable source: `base` is what both sides started from (null when unknown —
 * then everything that differs is a conflict unless one side equals the other), `ours` the
 * local files (or the draft), `theirs` the other side's. Never throws.
 */
export function mergeDeckSource(
  base: SourceFiles | null,
  ours: SourceFiles,
  theirs: SourceFiles,
  opts: MergeOptions = {},
): MergeResult {
  const labels = labelsOf(opts);
  const files: SourceFiles = {};
  const conflicts: Conflict[] = [];
  const has = (f: SourceFiles | null, p: string) => !!f && Object.hasOwn(f, p);
  const paths = [
    ...new Set([...Object.keys(base ?? {}), ...Object.keys(ours), ...Object.keys(theirs)]),
  ].sort();
  for (const path of paths) {
    const B = has(base, path) ? base![path]! : undefined;
    const O = has(ours, path) ? ours[path]! : undefined;
    const T = has(theirs, path) ? theirs[path]! : undefined;
    if (O === T) {
      if (O !== undefined) files[path] = O;
      continue;
    }
    if (base && B === O) {
      if (T !== undefined) files[path] = T;
      continue;
    }
    if (base && B === T) {
      if (O !== undefined) files[path] = O;
      continue;
    }
    if (O !== undefined && T !== undefined) {
      const r = isDeck(path)
        ? mergeMdx(B ?? null, O, T, { ...opts, path })
        : mergeText(path, B, O, T, labels);
      files[path] = r.text;
      conflicts.push(
        ...r.conflicts.map((c) =>
          B === undefined && c.kind === "content" ? { ...c, kind: "add-add" as const } : c,
        ),
      );
      continue;
    }
    // One side deleted it, the other changed it: keep the change, marked.
    const kept = (O ?? T)!;
    const keptBy = O !== undefined ? "ours" : "theirs";
    const l: MarkerLabels =
      keptBy === "ours"
        ? { ...labels, theirs: `${labels.theirs}${DELETED_FILE_SUFFIX}` }
        : { ...labels, ours: `${labels.ours}${DELETED_FILE_SUFFIX}` };
    const lines = kept.replace(/\r\n?/g, "\n").split("\n");
    files[path] = markerLines(
      {
        ours: keptBy === "ours" ? lines : [],
        base: B === undefined ? null : B.replace(/\r\n?/g, "\n").split("\n"),
        theirs: keptBy === "theirs" ? lines : [],
      },
      l,
    ).join("\n");
    conflicts.push({
      path,
      kind: "delete-edit",
      ours: O ?? "",
      theirs: T ?? "",
      base: B ?? null,
      line: 1,
      ...(isDeck(path) ? { slide: 1 } : {}),
    });
  }
  const deleted = Object.keys(ours)
    .filter((p) => !Object.hasOwn(files, p))
    .sort();
  return { files, deleted, conflicts, clean: conflicts.length === 0 };
}

/** Remove the slide piece containing line `at` (the head piece cannot be removed). */
function removeSlideAt(lines: string[], at: number): string[] {
  try {
    const pieces = cutDeck(lines.join("\n"));
    const p = pieces.find((x, i) => i > 0 && at >= x.start && at < x.end);
    if (!p) return lines;
    return [...lines.slice(0, p.start), ...lines.slice(p.end)];
  } catch {
    return lines;
  }
}

/**
 * Settle conflicts in a file's text: keep `ours`, `theirs` or `both` (ours first). `which` is the
 * 0-based block among the text's conflicts (`findConflicts(text)[which]`); without it every
 * block is settled the same way. Choosing the side that deleted a slide removes the slide;
 * choosing the side that deleted the whole file returns "" — delete the file then.
 */
export function resolveConflict(
  text: string,
  choice: "ours" | "theirs" | "both",
  which?: number,
): string {
  const fileDeleted = (label: string) => label.endsWith(DELETED_FILE_SUFFIX.trim());
  // A whole-file delete-edit: the only block, spanning the file.
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.startsWith("<<<<<<<") && (which === undefined || which === 0)) {
    const last = lines[lines.length - 1] ?? "";
    const oursLabel = lines[0].slice(7).trim();
    const theirsLabel = last.startsWith(">>>>>>>") ? last.slice(7).trim() : "";
    if (
      (choice === "ours" && fileDeleted(oursLabel)) ||
      (choice === "theirs" && fileDeleted(theirsLabel))
    )
      return "";
  }
  return resolveMarkers(text, choice, which, removeSlideAt);
}

/** Settle every conflict on one slide (1-based, as `Conflict.slide`) of a deck file. */
export function resolveSlide(
  text: string,
  slide: number,
  choice: "ours" | "theirs" | "both",
): string {
  const which = markerBlocks(text)
    .map((b, i) => ({ i, slide: slideAtLine(text, b.start).slide }))
    .filter((b) => b.slide === slide)
    .map((b) => b.i);
  let out = text;
  // Last first: settling a block renumbers the ones after it.
  for (const i of which.reverse()) out = resolveConflict(out, choice, i);
  return out;
}
