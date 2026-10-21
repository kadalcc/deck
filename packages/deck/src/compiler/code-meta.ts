/**
 * Code fence meta, the Slidev way with reveal.js's spellings accepted too:
 *
 *   ```ts {2-3|5|all}                  highlight steps, one per click
 *   ```ts {2-3|5|all}{lines:true}      + options: lines, startLine, maxHeight
 *   ```ts [app.ts]                     a title bar with the file name
 *   ```ts {*}{maxHeight:'200px'}       `*` and `all` both mean every line, `none` means no highlight
 *   ```ts data-line-numbers="3-5|8"    reveal.js's attribute form
 *   ```ts twoslash                     type hovers and errors, computed at build time
 *   ```ts {monaco}                     an editor on the slide; also {monaco-diff}, {monaco-run} and
 *                                      {monaco-write}, with options in a second pair of braces:
 *   ```ts {monaco-run}{autorun:false,showOutputAt:'+1',outputHeight:'200px'}
 *
 * A step is a set of line numbers; `null` inside `steps` means "all lines" and an empty set means
 * "no lines". A fence with N steps registers N-1 clicks on its slide.
 *
 * The groups are read left to right with their nesting respected, so an options object can hold
 * objects of its own (`{editorOptions:{wordWrap:'on'}}`) and a title can sit anywhere in the meta.
 * The options are a loose object literal, not JSON: keys and strings may go unquoted.
 */

export type LineSet = Set<number> | null;

/** What a `{monaco…}` directive turns the block into. */
export type MonacoMode = "editor" | "diff" | "run" | "write";

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
  /** `{monaco}`, `{monaco-diff}`, `{monaco-run}` or `{monaco-write}`; null for a plain block. */
  monaco: MonacoMode | null;
  /** The `twoslash` word: type information for TypeScript, rendered at build time. */
  twoslash: boolean;
  /** Every key of the options braces, as parsed (`lines`, `height`, `autorun`, `editorOptions`…). */
  options: Record<string, unknown>;
  /** The file a `<<<` import read this block from (deck-root relative), and its region. */
  snippet: { path: string; region: string | null } | null;
  /** Bare words the meta holds that mean nothing here, for the linter to point at. */
  words: string[];
}

const MONACO = /^monaco(?:-(diff|run|write))?$/;

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

/**
 * A loose object literal's body (`lines:true, maxHeight:'200px', editorOptions:{wordWrap:'on'}`)
 * as a plain object. Unquoted values are numbers, booleans and null when they read as one and
 * strings otherwise, so `maxHeight:200px` and `showOutputAt:+1` both mean what they say. Never
 * throws: what cannot be read is skipped.
 */
export function parseLooseObject(text: string): Record<string, unknown> {
  const value = new LooseParser(`{${text}}`).value();
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const QUOTES = "'\"`";

class LooseParser {
  i = 0;
  constructor(readonly s: string) {}
  private ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
  }
  value(): unknown {
    this.ws();
    const c = this.s[this.i];
    if (c === "{") return this.object();
    if (c === "[") return this.array();
    if (c && QUOTES.includes(c)) return this.string(c);
    return this.bare();
  }
  private object(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    this.i++; // {
    for (;;) {
      this.ws();
      if (this.i >= this.s.length) return out;
      const c = this.s[this.i]!;
      if (c === "}") {
        this.i++;
        return out;
      }
      if (c === ",") {
        this.i++;
        continue;
      }
      const key = QUOTES.includes(c) ? this.string(c) : this.word();
      this.ws();
      if (this.s[this.i] !== ":") {
        // A key with no value: skip to the next separator.
        while (this.i < this.s.length && !",}".includes(this.s[this.i]!)) this.i++;
        continue;
      }
      this.i++; // :
      const value = this.value();
      if (key) out[key] = value;
    }
  }
  private array(): unknown[] {
    const out: unknown[] = [];
    this.i++; // [
    for (;;) {
      this.ws();
      if (this.i >= this.s.length) return out;
      const c = this.s[this.i]!;
      if (c === "]") {
        this.i++;
        return out;
      }
      if (c === ",") {
        this.i++;
        continue;
      }
      out.push(this.value());
    }
  }
  private string(quote: string): string {
    let out = "";
    this.i++;
    while (this.i < this.s.length && this.s[this.i] !== quote) {
      if (this.s[this.i] === "\\" && this.i + 1 < this.s.length) this.i++;
      out += this.s[this.i++];
    }
    this.i++;
    return out;
  }
  private word(): string {
    const start = this.i;
    while (this.i < this.s.length && /[\w$-]/.test(this.s[this.i]!)) this.i++;
    if (this.i === start) this.i++; // never stall on a stray character
    return this.s.slice(start, this.i);
  }
  private bare(): unknown {
    const start = this.i;
    let depth = 0;
    while (this.i < this.s.length) {
      const c = this.s[this.i]!;
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (depth <= 0 && ",}]".includes(c)) break;
      this.i++;
    }
    const raw = this.s.slice(start, this.i).trim();
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "null") return null;
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    return raw;
  }
}

/**
 * The meta cut into its groups, left to right: `{…}` (nesting and quotes respected), `[…]`,
 * `key="value"` attributes and bare words.
 */
function scanMeta(s: string): {
  braces: string[];
  titles: string[];
  attrs: Record<string, string | true>;
  words: string[];
} {
  const braces: string[] = [];
  const titles: string[] = [];
  const attrs: Record<string, string | true> = {};
  const words: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "{") {
      let depth = 0;
      let quote: string | null = null;
      const start = i;
      for (; i < s.length; i++) {
        const ch = s[i]!;
        if (quote) {
          if (ch === "\\") i++;
          else if (ch === quote) quote = null;
          continue;
        }
        if (QUOTES.includes(ch)) quote = ch;
        else if (ch === "{") depth++;
        else if (ch === "}" && --depth === 0) break;
      }
      braces.push(s.slice(start + 1, i));
      i++;
      continue;
    }
    if (c === "[") {
      const end = s.indexOf("]", i);
      if (end < 0) {
        words.push(s.slice(i));
        break;
      }
      titles.push(s.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    // A word, or an attribute: `key="value"`, `key='value'`, `key=value`.
    const m = /^([^\s{[=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s{[]*)))?/.exec(s.slice(i));
    if (!m || !m[0]) {
      i++;
      continue;
    }
    const value = m[2] ?? m[3] ?? m[4];
    if (value !== undefined) attrs[m[1]!] = value;
    else if (/^data-[\w-]+$/.test(m[1]!)) attrs[m[1]!] = true;
    else words.push(m[1]!);
    i += m[0].length;
  }
  return { braces, titles, attrs, words };
}

function applyOptions(options: Record<string, unknown>, into: CodeMeta) {
  for (const [key, value] of Object.entries(options)) {
    into.options[key] = value;
    if (key === "lines") into.lines = value !== false && value !== "false";
    else if (key === "startLine") into.startLine = Number(value) || 1;
    else if (key === "maxHeight") into.maxHeight = String(value);
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
    monaco: null,
    twoslash: false,
    options: {},
    snippet: null,
    words: [],
  };
  if (!meta) return out;
  const { braces, titles, attrs, words } = scanMeta(meta.trim());

  // reveal.js's attribute form.
  if ("data-line-numbers" in attrs) {
    out.lines = true;
    const spec = attrs["data-line-numbers"];
    if (typeof spec === "string" && spec) out.steps = spec.split("|").map((s) => parseLineSet(s));
    const start = attrs["data-ln-start-from"];
    if (typeof start === "string" && /^\d+$/.test(start)) out.startLine = Number(start);
  }
  // Set by a `<<<` import (compiler/snippets.ts), never written by hand.
  const snippet = attrs["kadal-snippet"];
  if (typeof snippet === "string") {
    const hash = snippet.indexOf("#");
    out.snippet =
      hash < 0
        ? { path: snippet, region: null }
        : { path: snippet.slice(0, hash), region: snippet.slice(hash + 1) || null };
  }

  if (titles.length) out.title = titles[0]!.trim() || null;

  let sawSteps = false;
  for (const body of braces) {
    const monaco = MONACO.exec(body.trim());
    if (monaco) {
      out.monaco = (monaco[1] as MonacoMode | undefined) ?? "editor";
      continue;
    }
    if (/^\s*['"]?[\w-]+['"]?\s*:/.test(body)) {
      applyOptions(parseLooseObject(body), out);
      continue;
    }
    if (sawSteps) continue; // only the first steps group counts
    sawSteps = true;
    const stages = body.split("|").map((s) => s.trim());
    if (stages[0] === "hide") {
      out.hideUntilStep = true;
      stages.shift();
    }
    out.steps = stages.map((s) => parseLineSet(s));
    if (out.steps.length === 0) out.steps = null;
  }

  for (const w of words) {
    if (w === "twoslash") out.twoslash = true;
    else out.words.push(w);
  }
  for (const key of Object.keys(attrs))
    if (!["data-line-numbers", "data-ln-start-from", "kadal-snippet"].includes(key))
      out.words.push(key);
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

/** The keys a fence's options braces understand: what the linter accepts. */
export const CODE_OPTION_KEYS = [
  "lines",
  "startLine",
  "maxHeight",
  // Monaco: every editor
  "height",
  "editorOptions",
  "readonly",
  // {monaco-run}
  "autorun",
  "showOutputAt",
  "outputHeight",
  "outputPosition",
  "runnerOptions",
  "timeout",
  // {monaco-diff}
  "sideBySide",
] as const;
