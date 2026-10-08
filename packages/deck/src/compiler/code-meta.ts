/**
 * Code fence meta, the Slidev way with reveal.js's spellings accepted too:
 *
 *   ```ts {2-3|5|all}                  highlight steps, one per click
 *   ```ts {2-3|5|all}{lines:true}      + options: lines, startLine, maxHeight
 *   ```ts [app.ts]                     a title bar with the file name
 *   ```ts {*}{maxHeight:'200px'}       `*` and `all` both mean every line, `none` means no highlight
 *   ```ts data-line-numbers="3-5|8"    reveal.js's attribute form
 *
 * A step is a set of line numbers; `null` inside `steps` means "all lines" and an empty set means
 * "no lines". A fence with N steps registers N-1 clicks on its slide.
 */

export type LineSet = Set<number> | null;

export interface CodeMeta {
  /** One entry per click step; a single entry means a static highlight. Absent → no highlighting. */
  steps: LineSet[] | null;
  /** Show line numbers. */
  lines: boolean;
  /** First line number shown. */
  startLine: number;
  title: string | null;
  /** CSS length; the block scrolls beyond it. */
  maxHeight: string | null;
  /** Hide the whole block until its first step (Slidev's `{hide|...}`). */
  hideUntilStep: boolean;
}

export function parseLineSet(spec: string, total?: number): LineSet {
  const s = spec.trim();
  if (s === "" || s === "all" || s === "*") return null;
  if (s === "none" || s === "hide") return new Set();
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const range = /^(\d+)\s*-\s*(\d+)?$/.exec(p);
    if (range) {
      const a = Number(range[1]);
      const b = range[2] ? Number(range[2]) : (total ?? a);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
      continue;
    }
    const n = Number(p);
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

function parseOptions(text: string, into: CodeMeta) {
  // `{lines:true,startLine:7,maxHeight:'200px'}` — a loose object literal, not JSON.
  for (const pair of text.split(",")) {
    const m = /^\s*([\w-]+)\s*:\s*(.+?)\s*$/.exec(pair);
    if (!m) continue;
    const key = m[1]!;
    const raw = m[2]!.replace(/^['"]|['"]$/g, "");
    if (key === "lines") into.lines = raw !== "false";
    else if (key === "startLine") into.startLine = Number(raw) || 1;
    else if (key === "maxHeight") into.maxHeight = raw;
  }
}

export function parseCodeMeta(meta: string | null | undefined): CodeMeta {
  const out: CodeMeta = {
    steps: null,
    lines: false,
    startLine: 1,
    title: null,
    maxHeight: null,
    hideUntilStep: false,
  };
  if (!meta) return out;
  let rest = meta.trim();

  // reveal.js's attribute form.
  const reveal = /data-line-numbers(?:="([^"]*)")?/.exec(rest);
  if (reveal) {
    out.lines = true;
    if (reveal[1]) out.steps = reveal[1].split("|").map((s) => parseLineSet(s));
    rest = rest.replace(reveal[0], "");
    const start = /data-ln-start-from="(\d+)"/.exec(rest);
    if (start) out.startLine = Number(start[1]);
  }

  const title = /\[([^\]]+)\]/.exec(rest);
  if (title) {
    out.title = title[1]!.trim();
    rest = rest.replace(title[0], "");
  }

  const braces = [...rest.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]!);
  if (braces.length) {
    const first = braces[0]!;
    const isOptions = /^\s*[\w-]+\s*:/.test(first);
    if (!isOptions) {
      const stages = first.split("|").map((s) => s.trim());
      if (stages[0] === "hide") {
        out.hideUntilStep = true;
        stages.shift();
      }
      out.steps = stages.map((s) => parseLineSet(s));
      if (out.steps.length === 0) out.steps = null;
    } else parseOptions(first, out);
    for (const extra of braces.slice(1)) parseOptions(extra, out);
  }
  return out;
}

/** Serialise steps for a `data-steps` attribute: `2,3|5|` (empty = all). */
export function serialiseSteps(steps: LineSet[]): string {
  return steps
    .map((s) => (s === null ? "*" : s.size === 0 ? "none" : [...s].sort((a, b) => a - b).join(",")))
    .join("|");
}

export function deserialiseSteps(text: string): LineSet[] {
  return text.split("|").map((s) => parseLineSet(s));
}
