import {
  type DeckRenderer,
  type IslandComponent,
  type IslandProps,
  type RenderContext,
} from "@kadal/deck/renderers/contract";

import { PYODIDE_INDEX_URL } from "./build.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PYTHON RENDERER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The last renderer, and the one where the engine's idea of a "component" finally breaks.
 *
 * A PYTHON ISLAND IS SOURCE TEXT. Every other component here was a value the bundler produced: an
 * options object, a compiled function, a class, a WASM module. Python has no build step and no
 * bundle — CPython compiled to WebAssembly reads source at runtime, exactly as it does on a server.
 * So `<Island>` is handed a *string*, the deck's Vite config imports it with `?raw`, and the
 * renderer's job starts with `runPython`. The contract's `IslandComponent` being `unknown` is what
 * makes that legal, and this is the case that justifies it: the engine never looks inside one.
 *
 * ONE INTERPRETER, SHARED, AND KEPT. Pyodide is a six-megabyte download and a second or two of
 * startup — the most expensive thing in this engine by two orders of magnitude. It is fetched once,
 * lazily, and shared by every Python island on the deck. Unlike Angular's application it is NOT
 * torn down when the last island leaves: reclaiming the memory would make the next Python slide pay
 * the six megabytes again, and a deck with one Python island usually has two.
 *
 * EACH ISLAND GETS ITS OWN NAMESPACE. A shared interpreter means a shared global namespace, and two
 * islands both defining `deck_mount` would silently be the same island twice. Each one runs in its
 * own `dict`, which is Python's own answer and costs nothing.
 *
 * PROXIES HAVE TO BE DESTROYED BY HAND. This is the part that has no equivalent anywhere else in
 * the engine. A `PyProxy` is a JavaScript handle on a Python object, and garbage collection cannot
 * cross the boundary in either direction: the JS collector does not know the Python object exists,
 * and Python's does not know JS is holding it. So every proxy this renderer takes — the handle, its
 * methods, the namespace — is released explicitly in `destroy`. Forget one and the leak is in WASM
 * linear memory, where no browser tool will show it to you.
 *
 * AND `destroy` IS A RESERVED WORD ON THIS BOUNDARY. `PyProxy.destroy()` is the proxy's own
 * lifetime method, so a Python class with a method of that name is shadowed by it: calling it
 * frees the proxy instead of running the island's teardown, the interval keeps ticking behind
 * nineteen slides, and nothing reports a thing. The agreement is therefore `deck_mount`,
 * `deck_update` and `deck_destroy` — snake_case, which is what Python wanted anyway.
 *
 * IT NEEDS THE NETWORK. Pyodide is loaded from a pinned jsDelivr URL. A deck presented offline
 * cannot run a Python island unless the deck serves Pyodide itself, which `indexUrl` allows.
 */

interface PyProxy {
  destroy(): void;
  (...args: unknown[]): unknown;
  [key: string]: unknown;
}

/** A proxy of a Python *dict*, which is the only kind that has `.get`. */
interface PyDict extends PyProxy {
  get(key: string): unknown;
}

interface Pyodide {
  runPython(code: string, options?: { globals?: unknown }): unknown;
  toPy(value: unknown): unknown;
  globals: PyDict;
}

export interface PythonIsland {
  /** The island's Python source. `deckPython()` wraps a string into this. */
  source: string;
}

function isPythonIsland(value: unknown): value is PythonIsland {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PythonIsland).source === "string"
  );
}

/* ── the shared interpreter ───────────────────────────────────────────────── */

let indexUrl = PYODIDE_INDEX_URL;
let shared: Promise<Pyodide> | null = null;

/** Serve Pyodide from somewhere else — a self-hosted copy, for a deck presented offline. */
export function setPyodideIndexUrl(url: string): void {
  if (shared) {
    console.warn("[deck] python: Pyodide is already loading; the new index URL is ignored");
    return;
  }
  indexUrl = url;
}

async function loadPyodide(): Promise<Pyodide> {
  // A variable URL, so the bundler leaves it alone: this is fetched by the browser at slide time,
  // not inlined at build time. Six megabytes do not belong in a deck's chunk graph.
  const url = `${indexUrl}pyodide.mjs`;
  const module = (await import(/* @vite-ignore */ url)) as {
    loadPyodide: (options: { indexURL: string }) => Promise<Pyodide>;
  };
  return module.loadPyodide({ indexURL: indexUrl });
}

function acquire(): Promise<Pyodide> {
  shared ??= loadPyodide();
  return shared;
}

/** For tests, and for a deck that wants the interpreter gone rather than idle. */
export function forgetPythonInterpreter(): void {
  shared = null;
}

export const pythonRenderer: DeckRenderer = {
  name: "python",

  /**
   * Recognisable, like the WASM renderer and for the same reason: the shape is the engine's own.
   * `deckPython(source)` produces `{ source }`, and nothing else arrives looking like that.
   */
  owns(component: IslandComponent) {
    return isPythonIsland(component);
  },

  mount(host: Element, component: IslandComponent, props: IslandProps, context: RenderContext) {
    const source = isPythonIsland(component) ? component.source : String(component);
    const first = context.slot ? { ...props, deckSlot: context.slot } : props;

    let gone = false;
    let latest = first;
    // Every one of these is a handle on a Python object that the JS collector cannot free.
    let namespace: PyDict | null = null;
    let handle: PyProxy | null = null;
    let update: PyProxy | null = null;
    let destroy: PyProxy | null = null;

    const release = () => {
      for (const proxy of [update, destroy, handle, namespace]) {
        try {
          proxy?.destroy();
        } catch {
          // A proxy destroyed twice throws; a slide being left is not the moment to care.
        }
      }
      update = destroy = handle = namespace = null;
    };

    const start = async () => {
      const py = await acquire();
      if (gone) return;

      // Its own namespace: a shared interpreter has a shared global namespace, and two islands
      // both defining `deck_mount` would quietly be the same island twice.
      namespace = (py.globals.get("dict") as PyProxy)() as PyDict;
      py.runPython(source, { globals: namespace });

      const mount = namespace.get("deck_mount") as PyProxy | undefined;
      if (typeof mount !== "function") {
        throw new TypeError("a python island must define deck_mount(host, props)");
      }

      handle = mount(host, py.toPy(latest)) as PyProxy;
      mount.destroy();
      if (gone) {
        release();
        return;
      }

      // Property access, not `.get()`. A PyProxy of a *dict* has `.get`; a proxy of a class
      // instance does not — its methods are properties. Each read mints a new bound-method proxy,
      // which is why both are kept and released rather than fetched again on every update.
      //
      // And the names are `deck_update`/`deck_destroy`, not `update`/`destroy`, because **PyProxy
      // reserves `destroy`**: it is the proxy's own lifetime method. A Python class with a method
      // called `destroy` is shadowed by it, so `handle.destroy()` quietly frees the proxy instead
      // of running the island's teardown — and then the real release throws on a dead proxy. The
      // island's timer keeps running behind nineteen slides and nothing says so.
      update = handle.deck_update as PyProxy | null;
      destroy = handle.deck_destroy as PyProxy | null;
      if (latest !== first) update?.(py.toPy(latest));
    };

    void start().catch((error: unknown) => {
      console.error("[deck] python island failed to mount:", error);
      (host as HTMLElement).dataset.islandError =
        error instanceof Error ? error.message : String(error);
      release();
    });

    return {
      destroy() {
        if (gone) return;
        gone = true;
        try {
          destroy?.();
        } catch (error) {
          console.error("[deck] python island failed to tear down:", error);
        }
        release();
        host.replaceChildren();
        // The interpreter itself is kept, unlike Angular's application. Tearing Pyodide down
        // reclaims the memory but makes the next Python slide pay six megabytes again, and a deck
        // with one Python island usually has two.
      },
      update(next: IslandProps) {
        if (gone) return;
        latest = context.slot ? { ...next, deckSlot: context.slot } : next;
        if (!update || !shared) return;
        void shared.then((py) => {
          if (!gone) update?.(py.toPy(latest));
        });
      },
    };
  },

  // No `ssr`. Running CPython on a server to produce HTML for a slide is a real idea and a
  // different product; the deck's print and export paths run a real browser.
};

export { PYODIDE_INDEX_URL, PYODIDE_VERSION, deckPython } from "./build.ts";
