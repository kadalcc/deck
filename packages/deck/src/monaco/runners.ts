import type { ReactNode } from "react";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CODE RUNNERS: what `{monaco-run}` does with the code
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A runner is a function from source text to output, registered for a fence language:
 *
 *   import { registerCodeRunner } from "@kadal/deck";
 *   registerCodeRunner("sql", async (code, ctx) => ({ text: await runOnServer(code) }));
 *
 * or, Slidev's way, a `setup/code-runners.ts` beside deck.mdx whose default export is the map
 * (or a function returning it) — `defineCodeRunners({ sql(code, ctx) { … } })`. The Vite plugin
 * finds that file and the deck loads it before the first run.
 *
 * Built in, and loaded only when a block runs:
 *   javascript / js     in a module Web Worker: console captured, errors with their line,
 *   typescript / ts     top-level await, timers followed until they settle, a timeout that
 *                       terminates the worker (an infinite loop cannot freeze the slide). TypeScript
 *                       has its types stripped first (Sucrase), so lines keep their numbers.
 *   python / py         Pyodide in a Web Worker, shared by every Python block on the deck and
 *                       kept warm between runs; stdout and stderr stream in, the value of the last
 *                       expression is shown like a REPL's, imported packages load by themselves.
 *
 * An output is text (with a console level), HTML (sanitised with DOMPurify before it is shown),
 * an element (a React node, or a DOM element to mount), or an error. A runner can return them,
 * or stream them with `ctx.write()` as they happen; `ctx.signal` aborts when the block runs again
 * or the slide goes away.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type CodeOutputLevel = "log" | "info" | "warn" | "error" | "debug" | "result";

export type CodeOutput =
  | {
      text: string;
      level?: CodeOutputLevel;
      className?: string;
      /** A status line ("Starting Python…") that the next output, or the end of the run, replaces. */
      transient?: boolean;
    }
  | { html: string; className?: string }
  | { element: ReactNode | HTMLElement }
  | { error: string };

export type CodeRunResult = CodeOutput | CodeOutput[] | void | null | undefined;

export interface CodeRunnerContext {
  /** The fence language the block was written in (`ts`, `python`…). */
  lang: string;
  /** The block's `runnerOptions`, e.g. `{monaco-run}{runnerOptions:{indexUrl:'…'}}`. */
  options: Record<string, unknown>;
  /** Milliseconds the run may take: `{timeout:10000}`, default 5000 (Python: 20000 after loading). */
  timeout: number;
  /** Aborted when the block runs again or leaves the screen. */
  signal: AbortSignal;
  /** Stream an output now, rather than returning it at the end. */
  write(output: CodeOutput): void;
  /** Run code in another language with its runner (a runner can delegate). */
  run(code: string, lang: string): Promise<CodeOutput[]>;
  /**
   * The URL a bare import (`zod`, `lodash-es/debounce`) is fetched from — the deck's
   * `monacoRunImports` CDN, at the version `monacoPackages` pins — or null when bare imports are
   * not resolved here. Absent when the caller gives none (the built-in JS runner then refuses them).
   */
  resolveImport?: ((specifier: string) => string | null) | null;
}

export type CodeRunner = (
  code: string,
  context: CodeRunnerContext,
) => CodeRunResult | Promise<CodeRunResult>;

export type CodeRunners = Record<string, CodeRunner>;

const registry = new Map<string, CodeRunner>();

const ALIASES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  python3: "python",
};

const canonical = (lang: string) => {
  const l = lang.toLowerCase();
  return ALIASES[l] ?? l;
};

/**
 * Register a runner for one language or several (aliases included: `ts` and `typescript` are
 * the same). Replaces a built-in. Returns a function that unregisters it.
 */
export function registerCodeRunner(lang: string | string[], runner: CodeRunner): () => void {
  const langs = (Array.isArray(lang) ? lang : [lang]).map(canonical);
  for (const l of langs) registry.set(l, runner);
  return () => {
    for (const l of langs) if (registry.get(l) === runner) registry.delete(l);
  };
}

/** Type helper for `setup/code-runners.ts`: `export default defineCodeRunners({ … })`. */
export function defineCodeRunners<
  T extends CodeRunners | (() => CodeRunners | Promise<CodeRunners>),
>(runners: T): T {
  return runners;
}

const BUILTIN: Record<string, () => Promise<CodeRunner>> = {
  javascript: () => import("./run-js.ts").then((m) => m.javascriptRunner),
  typescript: () => import("./run-js.ts").then((m) => m.typescriptRunner),
  python: () => import("./run-python.ts").then((m) => m.pythonRunner),
};

/** Whether a language has a runner (registered or built in). */
export function hasCodeRunner(lang: string): boolean {
  const l = canonical(lang);
  return registry.has(l) || l in BUILTIN;
}

/** The runner for a language: a registered one first, else the built-in, else null. */
export async function codeRunnerFor(lang: string): Promise<CodeRunner | null> {
  const l = canonical(lang);
  const own = registry.get(l);
  if (own) return own;
  const builtin = BUILTIN[l];
  return builtin ? builtin() : null;
}

/** Pinned like `@kadal/deck-python`'s: an interpreter that changes under a deck breaks it on stage. */
export const PYODIDE_RUNNER_VERSION = "0.28.3";
let pyodideIndexUrl = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_RUNNER_VERSION}/full/`;

/** Serve Pyodide for `{monaco-run}` Python blocks from somewhere else (a self-hosted copy, offline). */
export function setPythonRunnerIndexUrl(url: string): void {
  pyodideIndexUrl = url.endsWith("/") ? url : `${url}/`;
}

export const pythonRunnerIndexUrl = (): string => pyodideIndexUrl;

let setupDone: Promise<void> | null = null;

/**
 * Load the deck's `setup/code-runners.ts` once (the manifest's `codeRunners`), registering what it
 * exports. A broken setup file is reported and the built-ins still run.
 */
export function loadCodeRunnerSetup(
  load: (() => Promise<unknown>) | null | undefined,
): Promise<void> {
  if (!load) return Promise.resolve();
  setupDone ??= (async () => {
    try {
      const mod = (await load()) as { default?: unknown };
      let value = mod && typeof mod === "object" && "default" in mod ? mod.default : mod;
      if (typeof value === "function") value = await (value as () => unknown)();
      if (value && typeof value === "object")
        for (const [lang, runner] of Object.entries(value as Record<string, unknown>))
          if (typeof runner === "function") registerCodeRunner(lang, runner as CodeRunner);
    } catch (err) {
      console.error("[deck] setup/code-runners failed:", err);
    }
  })();
  return setupDone;
}

export interface RunOptions {
  options?: Record<string, unknown>;
  timeout?: number;
  signal?: AbortSignal;
  /** Every output as it arrives (streamed or returned). */
  onOutput?: (output: CodeOutput) => void;
  /** Where bare imports come from (`CodeRunnerContext.resolveImport`). */
  resolveImport?: ((specifier: string) => string | null) | null;
}

/** Run code with its language's runner; resolves to every output, in order. Never throws. */
export async function runCode(
  code: string,
  lang: string,
  opts: RunOptions = {},
): Promise<CodeOutput[]> {
  const outputs: CodeOutput[] = [];
  const push = (o: CodeOutput) => {
    if (opts.signal?.aborted) return;
    outputs.push(o);
    opts.onOutput?.(o);
  };
  const runner = await codeRunnerFor(lang);
  if (!runner) {
    push({
      error: `No runner for "${lang}". Register one with registerCodeRunner("${lang}", …) or in setup/code-runners.ts.`,
    });
    return outputs;
  }
  const signal = opts.signal ?? new AbortController().signal;
  const context: CodeRunnerContext = {
    lang,
    options: opts.options ?? {},
    timeout: opts.timeout ?? (canonical(lang) === "python" ? 20_000 : 5_000),
    signal,
    write: push,
    run: (c, l) => runCode(c, l, { ...opts, onOutput: undefined }),
    resolveImport: opts.resolveImport ?? null,
  };
  try {
    const result = await runner(code, context);
    if (result) for (const o of Array.isArray(result) ? result : [result]) push(o);
  } catch (err) {
    push({ error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
  }
  return outputs;
}
