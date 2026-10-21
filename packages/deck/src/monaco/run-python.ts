import { type CodeRunner, pythonRunnerIndexUrl } from "./runners.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PYTHON RUNNER: Pyodide, in a Web Worker
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `@kadal/deck-python` runs Python *islands* on the main thread, because an island draws into
 * the slide. A runner only prints, so it can live in a worker, and that buys the one thing a
 * live demo needs most: a run that never ends can be stopped (`terminate()`), and an
 * interpreter that is busy never freezes the deck.
 *
 * One worker for the whole deck, started by the first Python run and kept: Pyodide is a
 * multi-megabyte download and a second or two of start-up, paid once. Each run gets a fresh
 * globals dict, so blocks do not see each other's names. stdout and stderr stream back as
 * they are written; packages a block imports (numpy, …) are loaded first; the value of the last
 * expression, when it is not None, is shown as the result, the way a REPL would.
 *
 * The timeout counts from when the interpreter is ready, not from the download. A run stopped
 * by it takes the worker with it; the next run starts a new one (from the browser's cache).
 *
 * Pyodide comes from the same pinned jsDelivr URL as `@kadal/deck-python`'s; `runnerOptions:
 * { indexUrl }` (or `setPythonRunnerIndexUrl`) serves it from elsewhere, for an offline deck.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function workerMain() {
  type Py = {
    runPythonAsync(code: string, o?: { globals?: unknown }): Promise<unknown>;
    loadPackagesFromImports(code: string): Promise<unknown>;
    setStdout(o: { batched: (s: string) => void }): void;
    setStderr(o: { batched: (s: string) => void }): void;
    globals: { get(k: string): () => { destroy(): void } };
    isPyProxy?(v: unknown): boolean;
  };
  let py: Promise<Py> | null = null;
  let current = 0;
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  // One run at a time, in order: stdout is routed by the run that is current.
  let chain: Promise<void> = Promise.resolve();
  self.onmessage = (e: MessageEvent<{ id: number; code: string; indexUrl: string }>) => {
    chain = chain.then(() => handle(e.data));
  };
  const handle = async ({ id, code, indexUrl }: { id: number; code: string; indexUrl: string }) => {
    current = id;
    try {
      py ??= (async () => {
        // Not a literal `import()` (see run-js.ts): this source runs in the worker as text.
        const load = new Function("u", "return import(u)") as (u: string) => Promise<unknown>;
        const mod = (await load(`${indexUrl}pyodide.mjs`)) as {
          loadPyodide(o: { indexURL: string }): Promise<Py>;
        };
        return mod.loadPyodide({ indexURL: indexUrl });
      })();
      const p = await py;
      p.setStdout({ batched: (s) => post({ id: current, type: "out", level: "log", text: s }) });
      p.setStderr({ batched: (s) => post({ id: current, type: "out", level: "error", text: s }) });
      await p.loadPackagesFromImports(code);
      post({ id, type: "ready" });
      const globals = p.globals.get("dict")();
      try {
        const result = (await p.runPythonAsync(code, { globals })) as
          | { toString(): string; destroy?(): void }
          | undefined;
        if (result !== undefined && result !== null) {
          post({ id, type: "out", level: "result", text: String(result) });
          result.destroy?.();
        }
      } finally {
        globals.destroy();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A Python traceback: the last lines say what happened, in the block's own line numbers.
      const lines = message.trim().split("\n");
      const at = lines.findIndex((l) => /File "<exec>"/.test(l));
      post({
        id,
        type: "out",
        level: "error",
        text: (at >= 0 ? lines.slice(at) : lines.slice(-3)).join("\n"),
      });
    }
    post({ id, type: "done" });
  };
}

let worker: Worker | null = null;
let workerUrl: string | null = null;
let seq = 0;

const spawn = () => {
  workerUrl ??= URL.createObjectURL(
    new Blob([`(${workerMain.toString()})();`], { type: "text/javascript" }),
  );
  return new Worker(workerUrl, { type: "module", name: "kadal-deck-python" });
};

export const pythonRunner: CodeRunner = (code, ctx) =>
  new Promise<void>((resolve) => {
    if (ctx.signal.aborted) return resolve();
    worker ??= spawn();
    const w = worker;
    const id = ++seq;
    const indexUrl =
      typeof ctx.options.indexUrl === "string" ? ctx.options.indexUrl : pythonRunnerIndexUrl();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let loadingNote = setTimeout(
      () => ctx.write({ text: "Starting Python (Pyodide)…", level: "info", transient: true }),
      400,
    );
    const finish = (kill: boolean) => {
      if (timer) clearTimeout(timer);
      clearTimeout(loadingNote);
      w.removeEventListener("message", onMessage);
      ctx.signal.removeEventListener("abort", onAbort);
      if (kill) {
        w.terminate();
        if (worker === w) worker = null;
      }
      resolve();
    };
    // Run again while this one is still loading Pyodide: let it load (the next run needs it) and
    // stop listening. Run again while it executes: only terminating stops Python mid-run.
    const onAbort = () => finish(running);
    const onMessage = (
      e: MessageEvent<{ id: number; type: string; level?: string; text?: string }>,
    ) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === "ready") {
        running = true;
        clearTimeout(loadingNote);
        loadingNote = 0 as never;
        timer = setTimeout(() => {
          ctx.write({
            error: `Timed out after ${Math.round(ctx.timeout / 100) / 10} s — the interpreter was stopped.`,
          });
          finish(true);
        }, ctx.timeout);
      } else if (m.type === "out") {
        ctx.write({ text: (m.text ?? "").replace(/\n$/, ""), level: (m.level as "log") ?? "log" });
      } else if (m.type === "done") finish(false);
    };
    w.addEventListener("message", onMessage);
    w.onerror = (e) => {
      e.preventDefault();
      ctx.write({
        error: e.message || "Python could not start (is the network up? Pyodide loads from a CDN).",
      });
      finish(true);
    };
    ctx.signal.addEventListener("abort", onAbort);
    w.postMessage({ id, code, indexUrl });
  });
